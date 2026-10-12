/* ========================================================================
 * Focus.ProgressEngine — pure body-measurement analysis
 * ------------------------------------------------------------------------
 * PURE + DETERMINISTIC: same inputs always produce same outputs.
 * - No module-level cache, no singletons, no "last computed" state.
 * - Every intermediate value is derived inside the call, never stored.
 * - "now" is an injected parameter (ISO date or Date). Callers own
 *   memoization / refresh policy (see renderProgress in ui.js, which
 *   re-runs the engine on every Store.onChange notification).
 *
 * Input records retain the Store schema: { id, date, type, value, unit }.
 * The engine normalizes Weight to the latest record's unit and Waist to cm
 * before comparing values. It never mutates stored records or profile data.
 *
 * RECENT-WEIGHTED DESIGN (default recent window = last 3 calendar months):
 * - Overall stats (first, last, change, %, average, high/low, count, span,
 *   last change) use ALL readings.
 * - Trend direction, rate/month, trend line, projections, goal ETA and the
 *   "recent average" use the RECENT WINDOW only (readings with
 *   date >= addCalendarMonths(now, -2)). With < 2 recent points we fall
 *   back to all data so single-point histories stay honest.
 * - Within the recent window, regression is exponentially weighted:
 *     weight_i = exp(-lambda * (t_now - t_i)), lambda = ln(2) / halfLife,
 *   with a default half-life of 30 days. Readings from the last few weeks
 *   dominate; readings ~3 months old carry ~1/8 weight. Set
 *   opts.halfLifeDays = Infinity for unweighted recent-window regression.
 *
 * PROJECTION HORIZON: from max(latest.date, now) through January 31 of
 * next year (remaining year + 1 month), sampled weekly. Values anchor at
 * the latest reading and extend with the recent-weighted slope:
 *     y(t) = latest.value + slopePerDay * (t - t_latest).
 * ====================================================================== */
(function () {
  "use strict";

  const MONTH_MS = 365.2425 / 12 * 86400000;
  const DAYS_PER_MONTH = 365.2425 / 12; // ~30.44
  const RECENT_WINDOW_MONTHS = 3;
  const HALF_LIFE_DAYS = 30;
  const LAMBDA = Math.LN2 / HALF_LIFE_DAYS;
  const finite = (v) => typeof v === "number" && Number.isFinite(v);
  const round = (v, dp = 1) => finite(v) ? Number(v.toFixed(dp)) : null;
  const validDate = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return false;
    const date = new Date(s + "T12:00:00");
    return !Number.isNaN(date.getTime()) && localISO(date) === s;
  };
  const dateMs = (s) => new Date(s + "T12:00:00").getTime();
  const dateLabel = (s, locale) => new Date(s + "T12:00:00").toLocaleDateString(locale || undefined, { month: "long", year: "numeric" });
  const localISO = (date) => date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  const addCalendarMonths = (iso, months) => {
    const base = new Date(iso + "T12:00:00");
    const day = base.getDate();
    base.setDate(1);
    base.setMonth(base.getMonth() + months);
    const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(day, last));
    return localISO(base);
  };
  const addDays = (iso, days) => {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + days);
    return localISO(d);
  };
  const endOfMonthISO = (iso) => {
    const d = new Date(iso + "T12:00:00");
    return localISO(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
  };
  /** Normalize the injected `now` (Date | ISO string | null) to an ISO day. */
  function nowISOOf(now) {
    if (now instanceof Date && !Number.isNaN(now.getTime())) return localISO(now);
    if (typeof now === "string" && validDate(now)) return now;
    if (typeof now === "string") {
      const parsed = new Date(now);
      if (!Number.isNaN(parsed.getTime())) return localISO(parsed);
    }
    return localISO(new Date());
  }
  /** January 31 of the year after `now`: remaining year + 1 month. */
  function projectionEndISO(nowISO) {
    const year = Number(nowISO.slice(0, 4));
    return (year + 1) + "-01-31";
  }

  function normalizeRecord(record, type, displayUnit) {
    if (!record || record.type !== type || !validDate(record.date)) return null;
    const value = Number(record.value);
    if (!Number.isFinite(value) || value <= 0) return null;
    let normalized = value;
    const S = window.Focus && window.Focus.Stats;
    if (S && displayUnit && record.unit !== displayUnit) {
      normalized = S.convertTo(value, record.unit, displayUnit);
      if (!Number.isFinite(normalized)) return null;
    }
    return { ...record, value: normalized, unit: displayUnit || record.unit };
  }

  /**
   * Exponentially-weighted least squares on (xDays, y) points.
   * weights default to 1 (ordinary least squares). Returns slope/day,
   * intercept at x=0, weighted R², fitted values, and residual std error.
   */
  function weightedFit(xs, ys, weights) {
    const n = xs.length;
    if (n === 0) return { slopePerDay: 0, intercept: 0, r2: null, fitted: [], stdErr: null };
    if (n === 1) return { slopePerDay: 0, intercept: ys[0], r2: null, fitted: [ys[0]], stdErr: null };
    const w = weights && weights.length === n ? weights : xs.map(() => 1);
    const wSum = w.reduce((a, b) => a + b, 0) || 1;
    const xMean = xs.reduce((s, x, i) => s + w[i] * x, 0) / wSum;
    const yMean = ys.reduce((s, y, i) => s + w[i] * y, 0) / wSum;
    let numerator = 0, denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += w[i] * (xs[i] - xMean) * (ys[i] - yMean);
      denominator += w[i] * (xs[i] - xMean) * (xs[i] - xMean);
    }
    const slopePerDay = denominator ? numerator / denominator : 0;
    const intercept = yMean - slopePerDay * xMean;
    const fitted = xs.map((x) => intercept + slopePerDay * x);
    let totalSq = 0, residualSq = 0;
    for (let i = 0; i < n; i++) {
      totalSq += w[i] * (ys[i] - yMean) * (ys[i] - yMean);
      residualSq += w[i] * (ys[i] - fitted[i]) * (ys[i] - fitted[i]);
    }
    const r2 = totalSq > 0 ? Math.max(0, Math.min(1, 1 - residualSq / totalSq)) : 1;
    const stdErr = n > 2 ? Math.sqrt(residualSq / wSum) : null;
    return { slopePerDay, intercept, r2, fitted, stdErr };
  }

  function linearFit(records) {
    if (records.length < 2) return { slopePerDay: 0, intercept: records.length ? records[0].value : 0, r2: null, fitted: records.map((r) => r.value), stdErr: null };
    const x0 = dateMs(records[0].date);
    const xs = records.map((r) => (dateMs(r.date) - x0) / 86400000);
    const ys = records.map((r) => r.value);
    return weightedFit(xs, ys, xs.map(() => 1));
  }

  function streaks(records, direction) {
    if (records.length < 2) return { current: 0, longest: 0 };
    let current = 0, longest = 0, lastSign = 0;
    const signs = [];
    for (let i = 1; i < records.length; i++) {
      const diff = records[i].value - records[i - 1].value;
      const sign = Math.abs(diff) < 1e-9 ? 0 : diff < 0 ? -1 : 1;
      if (!sign) { signs.push(0); lastSign = 0; current = 0; continue; }
      if (sign === lastSign) current++;
      else current = 1;
      lastSign = sign;
      longest = Math.max(longest, current);
      signs.push(sign);
    }
    const expected = direction === "down" ? -1 : direction === "up" ? 1 : 0;
    if (expected && signs.length && signs[signs.length - 1] !== expected) current = 0;
    return { current, longest };
  }

  function analyzeMetric(records, type, opts = {}) {
    const raw = (Array.isArray(records) ? records : []).filter((r) => r && r.type === type && validDate(r.date));
    const displayUnit = opts.unit || (raw.length ? raw.slice().sort((a, b) => a.date.localeCompare(b.date)).at(-1).unit : null);
    const normalized = raw.map((r) => normalizeRecord(r, type, displayUnit)).filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.id || "").localeCompare(String(b.id || "")));
    const count = normalized.length;
    if (!count) return { type, unit: displayUnit || null, count: 0, first: null, latest: null, change: null, pctChange: null, average: null, recentAverage: null, recentCount: 0, recentWindowStart: null, highest: null, lowest: null, recentLowest: null, recentHighest: null, lastChange: null, recordsPerMonth: null, spanDays: 0, spanMonths: 0, trend: "stable", ratePerMonth: null, consistency: null, streaks: { current: 0, longest: 0 }, trendLine: [], projectionLine: [], projections: { oneMonth: null, threeMonths: null, sixMonths: null, endOfMonth: null, endOfYear: null, endOfNextJanuary: null, points: [] }, projectionEnd: null, now: null, goalETA: null, insights: { past: [], present: [], future: [] }, recommendation: null };

    const values = normalized.map((r) => r.value);
    const first = normalized[0], latest = normalized[count - 1];
    const minVal = Math.min(...values), maxVal = Math.max(...values);
    const lowest = normalized.find((r) => r.value === minVal);
    const highest = normalized.find((r) => r.value === maxVal);
    const change = latest.value - first.value;
    const pctChange = first.value ? change / Math.abs(first.value) * 100 : null;
    const spanDays = Math.max(0, (dateMs(latest.date) - dateMs(first.date)) / 86400000);
    const spanMonths = spanDays / DAYS_PER_MONTH;

    // ---- Recent window: last N calendar months ending at injected `now`. ----
    const nowISO = nowISOOf(opts.now);
    const recentMonths = Number.isFinite(opts.recentWindowMonths) && opts.recentWindowMonths > 0 ? opts.recentWindowMonths : RECENT_WINDOW_MONTHS;
    const recentWindowStart = addCalendarMonths(nowISO, -recentMonths);
    const recent = normalized.filter((r) => r.date >= recentWindowStart);
    // With < 2 recent points there is no honest recent slope: use all data.
    const fitBasis = recent.length >= 2 ? recent : normalized;
    const recentValues = (recent.length ? recent : normalized).map((r) => r.value);

    // ---- Exponentially-weighted regression on the recent window. ----
    const halfLife = opts.halfLifeDays == null ? HALF_LIFE_DAYS : Number(opts.halfLifeDays);
    const nowMs = dateMs(nowISO);
    const x0 = dateMs(fitBasis[0].date);
    const xs = fitBasis.map((r) => (dateMs(r.date) - x0) / 86400000);
    const ys = fitBasis.map((r) => r.value);
    const weights = fitBasis.map((r) => {
      if (!Number.isFinite(halfLife) || halfLife <= 0) return 1;
      const ageDays = Math.max(0, (nowMs - dateMs(r.date)) / 86400000);
      return Math.exp(-Math.LN2 / halfLife * ageDays);
    });
    const fit = weightedFit(xs, ys, weights);
    const ratePerMonth = fitBasis.length >= 2 && spanDays >= 0 ? fit.slopePerDay * DAYS_PER_MONTH : null;
    // Single-point histories (or zero-span) cannot support a rate.
    const usableRate = count >= 2 && fitBasis.length >= 2 ? ratePerMonth : null;
    const trend = usableRate == null || Math.abs(usableRate) < (opts.stabilityThreshold || 0.02) ? "stable" : usableRate < 0 ? "down" : "up";
    const mean = values.reduce((a, b) => a + b, 0) / count;
    const recentAverage = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
    const recentMin = Math.min(...recentValues), recentMax = Math.max(...recentValues);
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / count;
    const stdDev = Math.sqrt(variance);
    const recordsPerMonth = spanMonths > 0 ? count / spanMonths : null;
    const unit = displayUnit || latest.unit || "";
    const precision = 1;
    const slope = usableRate == null ? 0 : fit.slopePerDay;

    // ---- Projections: remaining year + 1 month, sampled weekly. ----
    const projectionEnd = projectionEndISO(nowISO);
    const startISO = latest.date > nowISO ? latest.date : nowISO;
    const valueAt = (iso) => latest.value + slope * ((dateMs(iso) - dateMs(latest.date)) / 86400000);
    const project = (iso) => count >= 2 && usableRate != null ? round(valueAt(iso), precision) : null;
    const nowYear = Number(nowISO.slice(0, 4));
    const milestones = {
      endOfMonth: endOfMonthISO(nowISO),
      endOfYear: nowYear + "-12-31",
      endOfNextJanuary: projectionEnd
    };
    const plusMonths = (n) => addCalendarMonths(latest.date, n);
    const projections = {
      oneMonth: count >= 2 && usableRate != null ? round(latest.value + usableRate * 1, precision) : null,
      threeMonths: count >= 2 && usableRate != null ? round(latest.value + usableRate * 3, precision) : null,
      sixMonths: count >= 2 && usableRate != null ? round(latest.value + usableRate * 6, precision) : null,
      endOfMonth: project(milestones.endOfMonth),
      endOfMonthDate: milestones.endOfMonth,
      endOfYear: project(milestones.endOfYear),
      endOfYearDate: milestones.endOfYear,
      endOfNextJanuary: project(milestones.endOfNextJanuary),
      endOfNextJanuaryDate: milestones.endOfNextJanuary,
      points: []
    };
    if (count >= 2 && usableRate != null) {
      for (const months of [1, 3, 6]) {
        const date = plusMonths(months);
        projections.points.push({ date, value: round(latest.value + usableRate * months, precision), months });
      }
    }
    // Weekly projection line from max(latest, now) through Jan 31 next year.
    const weeklyPoints = [];
    if (count >= 2 && usableRate != null && startISO <= projectionEnd) {
      let cursor = startISO;
      let guard = 0;
      while (cursor <= projectionEnd && guard < 80) {
        const value = round(valueAt(cursor), precision);
        const band = fit.stdErr != null ? round(fit.stdErr, precision) : null;
        weeklyPoints.push({ date: cursor, value, lower: band == null ? null : round(value - band, precision), upper: band == null ? null : round(value + band, precision) });
        if (cursor === projectionEnd) break;
        const next = addDays(cursor, 7);
        cursor = next > projectionEnd ? projectionEnd : next;
        guard++;
      }
    }
    const goal = opts.goal == null || opts.goal === "" ? NaN : Number(opts.goal);
    let goalETA = null;
    if (Number.isFinite(goal) && count >= 2 && usableRate && (goal - latest.value) * usableRate > 0) {
      const months = (goal - latest.value) / usableRate;
      if (months >= 0 && months < 600) {
        const dateISO = addCalendarMonths(latest.date, Math.round(months));
        const date = new Date(dateISO + "T12:00:00");
        goalETA = { months: round(months, 1), date: dateISO, label: date.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
      }
    }
    // Trend line follows the RECENT-weighted fit so the displayed line,
    // the rate, and the projections can never disagree.
    const trendLine = normalized.map((r) => {
      const x = (dateMs(r.date) - x0) / 86400000;
      return { date: r.date, actual: r.value, trend: round(fit.intercept + fit.slopePerDay * x, precision) };
    });
    const projectionLine = weeklyPoints.length
      ? [{ date: latest.date, value: round(latest.value, precision) }, ...weeklyPoints.filter((p) => p.date > latest.date).map((p) => ({ date: p.date, value: p.value, lower: p.lower, upper: p.upper }))]
      : [];
    const streak = streaks(normalized, trend);
    let directionChanges = 0, priorDirection = 0;
    for (let i = 1; i < normalized.length; i++) {
      const delta = normalized[i].value - normalized[i - 1].value;
      const dir = Math.abs(delta) < 1e-9 ? 0 : delta < 0 ? -1 : 1;
      if (dir && priorDirection && dir !== priorDirection) directionChanges++;
      if (dir) priorDirection = dir;
    }
    const latestMonth = latest.date.slice(0, 7);
    const [latestYear, latestMonthNum] = latestMonth.split("-").map(Number);
    const previousMonthDate = new Date(latestYear, latestMonthNum - 2, 1, 12);
    const previousMonth = previousMonthDate.getFullYear() + "-" + String(previousMonthDate.getMonth() + 1).padStart(2, "0");
    const lastInMonth = (month) => normalized.filter((r) => r.date.slice(0, 7) === month).at(-1) || null;
    const currentMonthValue = lastInMonth(latestMonth);
    const previousMonthValue = lastInMonth(previousMonth);
    const monthComparison = {
      currentMonth: latestMonth,
      current: currentMonthValue ? currentMonthValue.value : null,
      previousMonth,
      previous: previousMonthValue ? previousMonthValue.value : null,
      change: currentMonthValue && previousMonthValue ? round(currentMonthValue.value - previousMonthValue.value, precision) : null
    };
    const insights = { past: [], present: [], future: [] };
    const unitLabel = unit ? " " + unit : "";
    const show = (v) => finite(v) ? round(v, precision).toLocaleString(undefined, { maximumFractionDigits: precision }) : "—";
    const recentSpanLabel = `last ${recentMonths} month${recentMonths === 1 ? "" : "s"}`;
    if (count >= 2) {
      const verb = change < 0 ? "decreased" : change > 0 ? "increased" : "stayed level";
      insights.past.push(`Your ${type.toLowerCase()} ${verb} by ${show(Math.abs(change))}${unitLabel} since ${dateLabel(first.date)}${pctChange == null ? "" : ` (${show(Math.abs(pctChange))}%)`}.`);
      if (count >= 2) insights.past.push(`Your average ${type.toLowerCase()} was ${show(mean)}${unitLabel}; the low was ${show(lowest.value)}${unitLabel} on ${new Date(lowest.date + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}.`);
    } else {
      insights.past.push(`Your first ${type.toLowerCase()} reading was ${show(first.value)}${unitLabel} on ${first.date}. Add another reading to reveal a trend.`);
    }
    if (count >= 2 && usableRate != null) {
      insights.present.push(`Your ${type.toLowerCase()} is trending ${trend} at ${show(Math.abs(usableRate))}${unitLabel}/month across ${fitBasis.length} recent readings (${recentSpanLabel}).`);
      insights.present.push(`Recent average: ${show(recentAverage)}${unitLabel} over ${recentSpanLabel}; all-time average is ${show(mean)}${unitLabel}.`);
      insights.present.push(`You track about ${show(recordsPerMonth)} readings per month over ${show(spanMonths)} months; typical variation is ${show(stdDev)}${unitLabel}${directionChanges ? ` with ${directionChanges} direction change${directionChanges === 1 ? "" : "s"}` : ""}.`);
      if (monthComparison.change != null) insights.present.push(`This month is ${show(Math.abs(monthComparison.change))}${unitLabel} ${monthComparison.change < 0 ? "lower" : monthComparison.change > 0 ? "higher" : "unchanged"} than last month.`);
      if (streak.current >= 2) insights.present.push(`${streak.current} consecutive measurements have moved ${trend === "down" ? "down" : trend === "up" ? "up" : "in the same direction"}.`);
      const previous = normalized[count - 2];
      insights.present.push(`Last change: ${show(latest.value - previous.value)}${unitLabel} since ${new Date(previous.date + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}.`);
    } else if (count === 1) insights.present.push("There is not enough history to estimate a monthly trend yet.");
    if (count >= 2 && usableRate != null) {
      const eoy = new Date(milestones.endOfYear + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
      const eoj = new Date(milestones.endOfNextJanuary + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
      insights.future.push(`At your current rate of ${usableRate > 0 ? "+" : ""}${show(usableRate)}${unitLabel}/month, you're projected to reach ${show(projections.endOfYear)}${unitLabel} by ${eoy} and ${show(projections.endOfNextJanuary)}${unitLabel} by ${eoj}.`);
      insights.future.push(`At the current trend, the projection is ${show(projections.oneMonth)}${unitLabel} in 1 month, ${show(projections.threeMonths)}${unitLabel} in 3 months, and ${show(projections.sixMonths)}${unitLabel} in 6 months.`);
      if (goalETA) insights.future.push(`At this rate, you may reach ${show(goal)}${unitLabel} around ${goalETA.label}.`);
      if (Math.abs(usableRate) < (opts.stabilityThreshold || 0.02)) insights.future.push("Stable trend: the projection holds near your latest reading.");
    } else insights.future.push("More dated readings are needed before a projection is meaningful.");
    let recommendation = null;
    if (count >= 3 && trend === "stable") recommendation = "Your measurements are holding steady. Keep tracking to confirm whether this is a true plateau.";
    else if (count >= 3 && trend !== "stable") recommendation = "Your measurements are moving consistently. Keep the same measurement routine to make the trend easier to compare.";

    return {
      type, unit, count, records: normalized,
      first, latest,
      change: round(change, precision), pctChange: round(pctChange, 1),
      average: round(mean, precision),
      recentAverage: round(recentAverage, precision), recentCount: (recent.length ? recent : normalized).length, recentWindowStart,
      highest: { value: maxVal, date: highest.date }, lowest: { value: minVal, date: lowest.date },
      recentLowest: { value: round(recentMin, precision) }, recentHighest: { value: round(recentMax, precision) },
      lastChange: count >= 2 ? round(latest.value - normalized[count - 2].value, precision) : null,
      lastChangeDate: count >= 2 ? normalized[count - 2].date : null,
      recordsPerMonth: round(recordsPerMonth, 1), spanDays: round(spanDays, 0), spanMonths: round(spanMonths, 1),
      trend, ratePerMonth: round(usableRate, 2), r2: round(fit.r2, 2),
      rateBasis: fitBasis.length, weighting: { windowMonths: recentMonths, halfLifeDays: Number.isFinite(halfLife) ? halfLife : null },
      consistency: { standardDeviation: round(stdDev, precision), coefficientOfVariation: mean ? round(stdDev / Math.abs(mean) * 100, 1) : null },
      streaks: streak,
      directionChanges,
      monthComparison,
      trendLine,
      projectionLine,
      weeklyProjection: weeklyPoints,
      projections,
      projectionEnd, now: nowISO,
      goalETA,
      insights,
      recommendation
    };
  }

  function analyzeComposition(records, profile = {}) {
    const S = window.Focus && window.Focus.Stats;
    if (!S) return { bmi: null, bodyFat: null, leanMass: null, fatMass: null, waistHeightRatio: null, interpretation: "Composition estimates are unavailable." };
    const measurements = Array.isArray(records) ? records : [];
    const latest = (type) => S.latestOfType(measurements, type);
    const mass = latest("Weight");
    const waist = latest("Waist");
    const heightCm = profile.height != null ? S.toCm(profile.height, profile.heightUnit || "cm") : (() => { const r = latest("Height"); return r ? S.toCm(r.value, r.unit) : null; })();
    const neckCm = profile.neck != null ? S.toCm(profile.neck, profile.neckUnit || "cm") : (() => { const r = latest("Neck"); return r ? S.toCm(r.value, r.unit) : null; })();
    const waistCm = waist ? S.toCm(waist.value, waist.unit) : null;
    const hips = latest("Hips");
    const hipsCm = hips ? S.toCm(hips.value, hips.unit) : null;
    const weightKg = mass ? S.toKg(mass.value, mass.unit) : null;
    const bmi = S.calcBMI(heightCm, weightKg);
    const bmiCategory = bmi == null ? null : S.bmiCategory(bmi);
    const waistToHeightRatio = waistCm != null && heightCm != null && heightCm > 0 ? waistCm / heightCm : null;
    const sex = profile.sex === "female" ? "female" : "male";
    const bodyFat = bmi != null && heightCm != null && neckCm != null && waistCm != null && (sex !== "female" || hipsCm != null)
      ? S.calcNavyBodyFat(sex, heightCm, neckCm, waistCm, hipsCm) : null;
    const bodyFatCategory = bodyFat == null || bmi == null ? null : S.bodyCompClass(sex, bmi, bodyFat);
    const leanMass = bodyFat != null && weightKg != null ? weightKg * (1 - bodyFat / 100) : null;
    const fatMass = bodyFat != null && weightKg != null ? weightKg * bodyFat / 100 : null;
    const waistHeightRatio = waistToHeightRatio;
    const displayMassUnit = mass ? mass.unit : "kg";
    const displayMass = (kg) => kg == null ? null : S.convertTo(kg, "kg", displayMassUnit);
    const parts = [];
    if (bmi != null) parts.push(`BMI ${bmi.toFixed(1)} (${bmiCategory.label})`);
    if (bodyFat != null && bodyFatCategory) parts.push(`estimated body fat ${bodyFat.toFixed(1)}% (${bodyFatCategory.label})`);
    const interpretation = parts.length ? `Your ${parts.join(" and ")}. These are estimates, not a diagnosis.` : "Add a weight and height for BMI; add neck and waist (plus hips for women) for body-fat estimates.";
    return {
      bmi: bmi == null ? null : round(bmi, 1), bmiCategory,
      bodyFat: bodyFat == null ? null : round(bodyFat, 1), bodyFatCategory,
      leanMass: displayMass(leanMass) == null ? null : round(displayMass(leanMass), 1),
      fatMass: displayMass(fatMass) == null ? null : round(displayMass(fatMass), 1),
      massUnit: displayMassUnit,
      waistHeightRatio: waistHeightRatio == null ? null : round(waistHeightRatio, 2),
      heightCm, weightKg, latestWeight: mass || null, latestWaist: waist || null, interpretation
    };
  }

  function analyze(records, profile = {}, options = {}) {
    return computeProgress({ measurements: records, profile, now: options.now, options });
  }

  /**
   * Main entry point: pure function of its inputs.
   * @param {Object} args
   * @param {Array} [args.weightMeasurements] weight records (Store schema)
   * @param {Array} [args.waistMeasurements] waist records (Store schema)
   * @param {Array} [args.measurements] combined records (alternative)
   * @param {Object} [args.profile] height/sex/neck/etc. for composition
   * @param {Date|string} [args.now] injected "today" (defaults to new Date())
   * @param {Object} [args.options] { weightUnit, goalWeight, ..., recentWindowMonths, halfLifeDays, now }
   */
  function computeProgress(args = {}) {
    const combined = Array.isArray(args.measurements)
      ? args.measurements
      : [...(Array.isArray(args.weightMeasurements) ? args.weightMeasurements : []),
         ...(Array.isArray(args.waistMeasurements) ? args.waistMeasurements : [])];
    const profile = args.profile || {};
    const options = args.options || {};
    const now = args.now != null ? args.now : options.now;
    const history = combined;
    const weightGoal = options.goalWeight != null && options.goalWeightUnit && options.weightUnit && options.goalWeightUnit !== options.weightUnit
      ? (window.Focus && window.Focus.Stats ? window.Focus.Stats.convertTo(options.goalWeight, options.goalWeightUnit, options.weightUnit) : null)
      : options.goalWeight;
    const baseOpts = { now };
    const weight = analyzeMetric(history, "Weight", { ...baseOpts, unit: options.weightUnit, goal: weightGoal, stabilityThreshold: options.weightStabilityThreshold || 0.02, recentWindowMonths: options.recentWindowMonths, halfLifeDays: options.halfLifeDays });
    const waist = analyzeMetric(history, "Waist", { ...baseOpts, unit: "cm", goal: options.goalWaist, stabilityThreshold: options.waistStabilityThreshold || 0.05, recentWindowMonths: options.recentWindowMonths, halfLifeDays: options.halfLifeDays });
    return { weight, waist, composition: analyzeComposition(history, profile) };
  }

  window.Focus = window.Focus || {};
  window.Focus.ProgressEngine = { analyze, analyzeMetric, analyzeComposition, computeProgress };
})();
