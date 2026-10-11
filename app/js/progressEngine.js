/* ========================================================================
 * Focus.ProgressEngine — pure body-measurement analysis
 * ------------------------------------------------------------------------
 * Input records retain the Store schema: { id, date, type, value, unit }.
 * The engine normalizes Weight to the latest record's unit and Waist to cm
 * before comparing values. It never mutates stored records or profile data.
 * ====================================================================== */
(function () {
  "use strict";

  const MONTH_MS = 365.2425 / 12 * 86400000;
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

  function linearFit(records) {
    if (records.length < 2) return { slopePerDay: 0, intercept: records.length ? records[0].value : 0, r2: null, fitted: records.map((r) => r.value) };
    const x0 = dateMs(records[0].date);
    const xs = records.map((r) => (dateMs(r.date) - x0) / 86400000);
    const ys = records.map((r) => r.value);
    const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
    let numerator = 0, denominator = 0, totalSq = 0;
    for (let i = 0; i < xs.length; i++) {
      numerator += (xs[i] - xMean) * (ys[i] - yMean);
      denominator += (xs[i] - xMean) ** 2;
      totalSq += (ys[i] - yMean) ** 2;
    }
    const slopePerDay = denominator ? numerator / denominator : 0;
    const intercept = yMean - slopePerDay * xMean;
    const residualSq = ys.reduce((sum, y, i) => sum + (y - (intercept + slopePerDay * xs[i])) ** 2, 0);
    const r2 = totalSq > 0 ? Math.max(0, Math.min(1, 1 - residualSq / totalSq)) : 1;
    return { slopePerDay, intercept, r2, fitted: xs.map((x) => intercept + slopePerDay * x) };
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
    if (!count) return { type, unit: displayUnit || null, count: 0, first: null, latest: null, change: null, pctChange: null, average: null, highest: null, lowest: null, lastChange: null, recordsPerMonth: null, spanDays: 0, spanMonths: 0, trend: "stable", ratePerMonth: null, consistency: null, streaks: { current: 0, longest: 0 },      trendLine: [], projectionLine: [], projections: { oneMonth: null, threeMonths: null, sixMonths: null, points: [] }, goalETA: null, insights: { past: [], present: [], future: [] }, recommendation: null };

    const values = normalized.map((r) => r.value);
    const first = normalized[0], latest = normalized[count - 1];
    const minVal = Math.min(...values), maxVal = Math.max(...values);
    const lowest = normalized.find((r) => r.value === minVal);
    const highest = normalized.find((r) => r.value === maxVal);
    const change = latest.value - first.value;
    const pctChange = first.value ? change / Math.abs(first.value) * 100 : null;
    const spanDays = Math.max(0, (dateMs(latest.date) - dateMs(first.date)) / 86400000);
    const spanMonths = spanDays / (365.2425 / 12);
    const fit = linearFit(normalized);
    const ratePerMonth = count >= 2 && spanDays > 0 ? fit.slopePerDay * (365.2425 / 12) : null;
    const trend = ratePerMonth == null || Math.abs(ratePerMonth) < (opts.stabilityThreshold || 0.02) ? "stable" : ratePerMonth < 0 ? "down" : "up";
    const mean = values.reduce((a, b) => a + b, 0) / count;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / count;
    const stdDev = Math.sqrt(variance);
    const recordsPerMonth = spanMonths > 0 ? count / spanMonths : null;
    const unit = displayUnit || latest.unit || "";
    const precision = type === "Weight" ? 1 : 1;
    const projection = (months) => count >= 2 && spanDays > 0 ? round(latest.value + (ratePerMonth || 0) * months, precision) : null;
    const projections = { oneMonth: projection(1), threeMonths: projection(3), sixMonths: projection(6), points: [] };
    if (count >= 2 && spanDays > 0) {
      for (const months of [1, 3, 6]) {
        const date = addCalendarMonths(latest.date, months);
        projections.points.push({ date, value: projection(months), months });
      }
    }
    const goal = opts.goal == null || opts.goal === "" ? NaN : Number(opts.goal);
    let goalETA = null;
    if (Number.isFinite(goal) && count >= 2 && spanDays > 0 && ratePerMonth && (goal - latest.value) * ratePerMonth > 0) {
      const months = (goal - latest.value) / ratePerMonth;
      if (months >= 0 && months < 600) {
        const dateISO = addCalendarMonths(latest.date, Math.round(months));
        const date = new Date(dateISO + "T12:00:00");
        goalETA = { months: round(months, 1), date: dateISO, label: date.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
      }
    }
    const trendLine = normalized.map((r, i) => ({ date: r.date, actual: r.value, trend: round(fit.fitted[i], precision) }));
    const projectionLine = count >= 2 && spanDays > 0
      ? [{ date: latest.date, value: round(latest.value, precision) }, ...Array.from({ length: 6 }, (_, i) => ({ date: addCalendarMonths(latest.date, i + 1), value: round(latest.value + (ratePerMonth || 0) * (i + 1), precision) }))]
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
    if (count >= 2) {
      const verb = change < 0 ? "decreased" : change > 0 ? "increased" : "stayed level";
      insights.past.push(`Your ${type.toLowerCase()} ${verb} by ${show(Math.abs(change))}${unitLabel} since ${dateLabel(first.date)}${pctChange == null ? "" : ` (${show(Math.abs(pctChange))}%)`}.`);
      if (count >= 2) insights.past.push(`Your average ${type.toLowerCase()} was ${show(mean)}${unitLabel}; the low was ${show(lowest.value)}${unitLabel} on ${new Date(lowest.date + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}.`);
    } else {
      insights.past.push(`Your first ${type.toLowerCase()} reading was ${show(first.value)}${unitLabel} on ${first.date}. Add another reading to reveal a trend.`);
    }
    if (count >= 2 && spanDays > 0) {
      insights.present.push(`Your ${type.toLowerCase()} is trending ${trend} at ${show(Math.abs(ratePerMonth))}${unitLabel}/month across ${count} readings.`);
      insights.present.push(`You track about ${show(recordsPerMonth)} readings per month over ${show(spanMonths)} months; typical variation is ${show(stdDev)}${unitLabel}${directionChanges ? ` with ${directionChanges} direction change${directionChanges === 1 ? "" : "s"}` : ""}.`);
      if (monthComparison.change != null) insights.present.push(`This month is ${show(Math.abs(monthComparison.change))}${unitLabel} ${monthComparison.change < 0 ? "lower" : monthComparison.change > 0 ? "higher" : "unchanged"} than last month.`);
      if (streak.current >= 2) insights.present.push(`${streak.current} consecutive measurements have moved ${trend === "down" ? "down" : trend === "up" ? "up" : "in the same direction"}.`);
      const previous = normalized[count - 2];
      insights.present.push(`Last change: ${show(latest.value - previous.value)}${unitLabel} since ${new Date(previous.date + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}.`);
    } else if (count === 1) insights.present.push("There is not enough history to estimate a monthly trend yet.");
    if (count >= 2 && spanDays > 0) {
      insights.future.push(`At the current trend, the projection is ${show(projections.oneMonth)}${unitLabel} in 1 month, ${show(projections.threeMonths)}${unitLabel} in 3 months, and ${show(projections.sixMonths)}${unitLabel} in 6 months.`);
      if (goalETA) insights.future.push(`At this rate, you may reach ${show(goal)}${unitLabel} around ${goalETA.label}.`);
    } else insights.future.push("More dated readings are needed before a projection is meaningful.");
    let recommendation = null;
    if (count >= 3 && trend === "stable") recommendation = "Your measurements are holding steady. Keep tracking to confirm whether this is a true plateau.";
    else if (count >= 3 && trend !== "stable") recommendation = "Your measurements are moving consistently. Keep the same measurement routine to make the trend easier to compare.";

    return {
      type, unit, count, records: normalized,
      first, latest,
      change: round(change, precision), pctChange: round(pctChange, 1),
      average: round(mean, precision), highest: { value: maxVal, date: highest.date }, lowest: { value: minVal, date: lowest.date },
      lastChange: count >= 2 ? round(latest.value - normalized[count - 2].value, precision) : null,
      lastChangeDate: count >= 2 ? normalized[count - 2].date : null,
      recordsPerMonth: round(recordsPerMonth, 1), spanDays: round(spanDays, 0), spanMonths: round(spanMonths, 1),
      trend, ratePerMonth: round(ratePerMonth, 2), r2: round(fit.r2, 2),
      consistency: { standardDeviation: round(stdDev, precision), coefficientOfVariation: mean ? round(stdDev / Math.abs(mean) * 100, 1) : null },
      streaks: streak,
      directionChanges,
      monthComparison,
      trendLine,
      projectionLine,
      projections,
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
    const history = Array.isArray(records) ? records : [];
    const weightGoal = options.goalWeight != null && options.goalWeightUnit && options.weightUnit && options.goalWeightUnit !== options.weightUnit
      ? (window.Focus && window.Focus.Stats ? window.Focus.Stats.convertTo(options.goalWeight, options.goalWeightUnit, options.weightUnit) : null)
      : options.goalWeight;
    const weight = analyzeMetric(history, "Weight", { unit: options.weightUnit, goal: weightGoal, stabilityThreshold: options.weightStabilityThreshold || 0.02 });
    const waist = analyzeMetric(history, "Waist", { unit: "cm", goal: options.goalWaist, stabilityThreshold: options.waistStabilityThreshold || 0.05 });
    return { weight, waist, composition: analyzeComposition(history, profile) };
  }

  window.Focus = window.Focus || {};
  window.Focus.ProgressEngine = { analyze, analyzeMetric, analyzeComposition };
})();
