/* =========================================================================
 * Focus.Stats — pure calculation engine
 * -------------------------------------------------------------------------
 * All functions are pure over arrays of {date:"YYYY-MM-DD", ...} records so
 * they can be unit-tested mentally and recomputed on every render.
 *
 * Streak definition (documented in README):
 *   A "workout day" is a calendar day with at least one workout. Multiple
 *   workouts on the same day still count as ONE workout day.
 *   The current streak counts consecutive workout days ending today (or
 *   yesterday if today has no workout yet).
 * ========================================================================= */
(function () {
  "use strict";

  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  /* ---------------- date helpers (local, tz-safe) ---------------- */

  function parse(d) {
    const p = String(d).split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function toISO(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addDays(iso, n) {
    const d = parse(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }
  function todayISO() { return toISO(new Date()); }
  function yearOf(iso) { return Number(iso.slice(0, 4)); }
  function monthOf(iso) { return Number(iso.slice(5, 7)); }
  function dayOf(iso) { return Number(iso.slice(8, 10)); }
  function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
  function weekdayOf(iso) { return parse(iso).getDay(); } // 0 = Sunday
  function dayOfYear(iso) {
    const d = parse(iso);
    const start = new Date(d.getFullYear(), 0, 1);
    return Math.round((d - start) / 86400000) + 1;
  }

  /* ---------------- aggregation ---------------- */

  /** Map date -> { count, calories, duration, ids } for all workouts. */
  function dayAggregates(workouts) {
    const map = new Map();
    for (const w of workouts) {
      let d = map.get(w.date);
      if (!d) { d = { count: 0, calories: 0, duration: 0, ids: [] }; map.set(w.date, d); }
      d.count += 1;
      if (w.calories != null) d.calories += Number(w.calories);
      if (w.duration != null) d.duration += Number(w.duration);
      d.ids.push(w.id);
    }
    return map;
  }

  /** Sorted array of workout-day ISO strings. */
  function workoutDays(workouts) {
    const set = new Set(workouts.map((w) => w.date));
    return Array.from(set).sort();
  }

  /**
   * Independent daily-goal completion for every workout day.
   * Each goal is evaluated on its own (current >= target), so completing one
   * never affects the other. Goals that aren't configured (null) are excluded
   * entirely. Returns a Map of iso-date -> { calHit, timeHit }.
   */
  function dailyGoalStatus(workouts, goals) {
    const g = goals || {};
    const hasCal = g.calPerDay != null;
    const hasTime = g.durPerDay != null;
    const out = new Map();
    if (!hasCal && !hasTime) return out;
    dayAggregates(workouts).forEach((a, iso) => {
      out.set(iso, {
        calHit: hasCal && a.calories >= g.calPerDay,
        timeHit: hasTime && a.duration >= g.durPerDay
      });
    });
    return out;
  }

  /* ---------------- streaks ---------------- */

  function streaks(workouts, refDateISO) {
    const days = new Set(workouts.map((w) => w.date));
    const ref = refDateISO || todayISO();

    // current streak: walk backwards from today; if today is not a workout
    // day, start from yesterday (the streak is still "alive" until the day ends).
    let anchor = days.has(ref) ? ref : addDays(ref, -1);
    let current = 0;
    while (days.has(anchor)) {
      current += 1;
      anchor = addDays(anchor, -1);
    }

    // longest streak across all data
    const sorted = Array.from(days).sort();
    let longest = 0, run = 0, prev = null;
    for (const d of sorted) {
      if (prev !== null && addDays(prev, 1) === d) { run += 1; }
      else { run = 1; }
      if (run > longest) longest = run;
      prev = d;
    }
    return { current, longest };
  }

  /* ---------------- weekly ---------------- */

  /**
   * Stats for the current ISO week (Monday–Sunday) vs the previous week.
   * Returns { cur, prev, start, end } where each week has
   * { workouts, days, calories, duration }.
   */
  function weeklyStats(workouts, refDateISO) {
    const ref = refDateISO || todayISO();
    const d = parse(ref);
    const dow = (d.getDay() + 6) % 7; // 0 = Monday
    const monday = addDays(ref, -dow);
    const week = (start) => {
      const end = addDays(start, 6);
      const rows = workouts.filter((w) => w.date >= start && w.date <= end);
      return {
        workouts: rows.length,
        days: new Set(rows.map((w) => w.date)).size,
        calories: rows.reduce((s, w) => s + (w.calories || 0), 0),
        duration: rows.reduce((s, w) => s + (w.duration || 0), 0)
      };
    };
    return { cur: week(monday), prev: week(addDays(monday, -7)), start: monday, end: addDays(monday, 6) };
  }

  /* ---------------- monthly / yearly ---------------- */

  /**
   * Per-month aggregates for a year.
   * Returns array of 12: { month: 1..12, workouts, days, calories, duration,
   *   avgCal, avgDur, restDays, bestStreak }
   */
  function monthlyStats(workouts, year) {
    const agg = dayAggregates(workouts);
    const out = [];
    for (let m = 1; m <= 12; m++) {
      const prefix = year + "-" + String(m).padStart(2, "0");
      const monthDays = [];
      for (let d = 1; d <= daysInMonth(year, m); d++) {
        const iso = prefix + "-" + String(d).padStart(2, "0");
        if (agg.has(iso)) monthDays.push(iso);
      }
      let workoutsN = 0, calories = 0, duration = 0;
      for (const iso of monthDays) {
        const a = agg.get(iso);
        workoutsN += a.count;
        calories += a.calories;
        duration += a.duration;
      }
      const wd = monthDays.length;
      out.push({
        month: m,
        label: MONTHS_SHORT[m - 1],
        workouts: workoutsN,
        days: wd,
        restDays: daysInMonth(year, m) - wd,
        calories,
        duration,
        // Averages are per WORKOUT (not per workout day) and null when a
        // month has no workouts, so charts can show gaps instead of 0 dips.
        avgCal: workoutsN ? calories / workoutsN : null,
        avgDur: workoutsN ? duration / workoutsN : null,
        avgCalPerDay: wd ? calories / wd : null,
        avgDurPerDay: wd ? duration / wd : null,
        bestStreak: longestStreakInSet(new Set(monthDays))
      });
    }
    return out;
  }

  function longestStreakInSet(set) {
    const sorted = Array.from(set).sort();
    let longest = 0, run = 0, prev = null;
    for (const d of sorted) {
      if (prev !== null && addDays(prev, 1) === d) run += 1;
      else run = 1;
      if (run > longest) longest = run;
      prev = d;
    }
    return longest;
  }

  /** Year-level totals + derived stats. */
  function yearlyStats(workouts, year) {
    const monthly = monthlyStats(workouts, year);
    const inYear = workouts.filter((w) => yearOf(w.date) === year);
    const days = new Set(inYear.map((w) => w.date));
    const totals = {
      year,
      workouts: inYear.length,
      days: days.size,
      calories: monthly.reduce((s, m) => s + m.calories, 0),
      duration: monthly.reduce((s, m) => s + m.duration, 0)
    };
    totals.avgCal = totals.workouts ? totals.calories / totals.workouts : 0;
    totals.avgDur = totals.workouts ? totals.duration / totals.workouts : 0;
    totals.avgWorkoutsPerMonth = totals.workouts / 12;
    totals.avgCalPerMonth = totals.calories / 12;
    totals.monthsWithData = monthly.filter((m) => m.days > 0).length;

    const withData = monthly.filter((m) => m.days > 0);
    totals.bestMonth = withData.length ? withData.reduce((a, b) => (a.days >= b.days ? a : b)) : null;
    totals.worstMonth = withData.length ? withData.reduce((a, b) => (a.days <= b.days ? a : b)) : null;
    totals.longestStreak = longestStreakInSet(days);
    return totals;
  }

  /* ---------------- year-over-year ---------------- */

  /**
   * Compare two years on a per-month + cumulative basis.
   * Returns { a, b, months: [{m, label, a:{workouts,calories,duration}, b:{...}, cumA:{workouts,calories}, cumB:{...}}],
   *   totals: {workouts:{a,b,diff,pct}, calories:{...}, duration:{...}, avgCal:{...}},
   *   leader: {workouts, calories} }
   */
  function compareYears(workouts, yearA, yearB) {
    const ma = monthlyStats(workouts, yearA);
    const mb = monthlyStats(workouts, yearB);
    const months = [];
    let cumA = { workouts: 0, calories: 0, duration: 0 };
    let cumB = { workouts: 0, calories: 0, duration: 0 };
    for (let i = 0; i < 12; i++) {
      cumA.workouts += ma[i].workouts; cumA.calories += ma[i].calories; cumA.duration += ma[i].duration;
      cumB.workouts += mb[i].workouts; cumB.calories += mb[i].calories; cumB.duration += mb[i].duration;
      months.push({
        m: i + 1,
        label: MONTHS_SHORT[i],
        a: { workouts: ma[i].workouts, calories: ma[i].calories, duration: ma[i].duration },
        b: { workouts: mb[i].workouts, calories: mb[i].calories, duration: mb[i].duration },
        cumA: { workouts: cumA.workouts, calories: cumA.calories, duration: cumA.duration },
        cumB: { workouts: cumB.workouts, calories: cumB.calories, duration: cumB.duration }
      });
    }
    const ta = yearlyStats(workouts, yearA);
    const tb = yearlyStats(workouts, yearB);
    const diffPct = (v) => (v.b === 0 ? (v.a === 0 ? 0 : 100) : ((v.a - v.b) / v.b) * 100);
    const totals = {
      workouts: { a: ta.workouts, b: tb.workouts, diff: ta.workouts - tb.workouts, pct: diffPct({ a: ta.workouts, b: tb.workouts }) },
      calories: { a: ta.calories, b: tb.calories, diff: ta.calories - tb.calories, pct: diffPct({ a: ta.calories, b: tb.calories }) },
      duration: { a: ta.duration, b: tb.duration, diff: ta.duration - tb.duration, pct: diffPct({ a: ta.duration, b: tb.duration }) },
      avgCal: { a: ta.avgCal, b: tb.avgCal, diff: ta.avgCal - tb.avgCal, pct: diffPct({ a: ta.avgCal, b: tb.avgCal }) },
      days: { a: ta.days, b: tb.days, diff: ta.days - tb.days, pct: diffPct({ a: ta.days, b: tb.days }) }
    };
    const leader = {
      workouts: ta.workouts >= tb.workouts ? "a" : "b",
      calories: ta.calories >= tb.calories ? "a" : "b",
      days: ta.days >= tb.days ? "a" : "b"
    };
    return { yearA, yearB, months, totals, leader };
  }

  /* ---------------- type breakdown ---------------- */

  function typeBreakdown(workouts, year) {
    const map = new Map();
    for (const w of workouts) {
      if (year != null && yearOf(w.date) !== year) continue;
      // A workout can carry multiple comma-separated types ("Back, Biceps")
      // — count each one so the distribution reflects every muscle group.
      const parts = String(w.type || "Other").split(",");
      for (const p of parts) {
        const t = p.trim();
        if (!t) continue;
        map.set(t, (map.get(t) || 0) + 1);
      }
    }
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
    return Array.from(map.entries())
      .map(([type, count]) => ({ type, count, pct: total ? (count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count);
  }

  /* ---------------- measurements ---------------- */

  /** Stats per measurement type across all dates. */
  function measurementStats(records) {
    const byType = new Map();
    for (const r of records) {
      if (!byType.has(r.type)) byType.set(r.type, []);
      byType.get(r.type).push(r);
    }
    const out = [];
    for (const [type, list] of byType) {
      list.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1);
      const values = list.map((r) => Number(r.value));
      const first = list[0];
      const latest = list[list.length - 1];
      const change = latest.value - first.value;
      const pct = first.value !== 0 ? (change / Math.abs(first.value)) * 100 : 0;
      const sum = values.reduce((a, b) => a + b, 0);
      out.push({
        type,
        unit: latest.unit,
        count: list.length,
        first: first,
        latest: latest,
        change,
        pctChange: pct,
        avg: sum / list.length,
        min: Math.min(...values),
        max: Math.max(...values),
        trend: change < -0.0001 ? "down" : change > 0.0001 ? "up" : "flat",
        records: list
      });
    }
    return out.sort((a, b) => a.type.localeCompare(b.type));
  }

  /** Series of {date, value, unit} sorted ascending, for a measurement type. */
  function measurementSeries(records, type) {
    return records
      .filter((r) => r.type === type)
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
      .map((r) => ({ date: r.date, value: Number(r.value), unit: r.unit }));
  }

  /* ---------------- body composition (BMI + U.S. Navy body fat) ---------------- */

  /**
   * Body-composition helpers shared by the Tools calculator and the Progress
   * view, so both always agree.
   *
   * BMI: weight(kg) / height(m)^2, categorised with the WHO bands.
   *
   * Estimated body fat: the U.S. Navy / Hodgdon circumference method
   * (Hodgdon & Beckett, 1984), still used by the U.S. military. All inputs
   * are converted to inches internally:
   *
   *   Men:    %BF = 86.010 * log10(waist − neck) − 70.041 * log10(height) + 36.76
   *   Women:  %BF = 163.205 * log10(waist + hip − neck) − 97.684 * log10(height) − 78.387
   *
   * Accuracy is roughly ±3–4% for most adults and degrades at the extremes,
   * so every result is labelled an estimate — never a diagnosis. Inputs are
   * accepted in any of the app's units and converted internally; stored
   * values are never modified.
   */

  const CM_PER_IN = 2.54;
  const KG_PER_LB = 0.45359237;

  /** Length (cm) from a stored value in a known unit; null when unknown/zero. */
  function toCm(value, unit) {
    const v = Number(value);
    if (!isFinite(v) || v <= 0) return null;
    switch ((unit || "").toLowerCase()) {
      case "in": return v * CM_PER_IN;
      case "mm": return v / 10;
      case "m": return v * 100;
      case "cm": return v;
      default: return null;
    }
  }

  /** Mass (kg) from a stored value in a known unit; null when unknown/zero. */
  function toKg(value, unit) {
    const v = Number(value);
    if (!isFinite(v) || v <= 0) return null;
    switch ((unit || "").toLowerCase()) {
      case "lb": return v * KG_PER_LB;
      case "g": return v / 1000;
      case "kg": return v;
      default: return null;
    }
  }

  /** Convert a stored value to a display unit (cm/in/kg/lb); null if not possible. */
  function convertTo(value, unit, target) {
    if (target === "kg" || target === "lb") {
      const kg = toKg(value, unit);
      return kg == null ? null : target === "lb" ? kg / KG_PER_LB : kg;
    }
    if (target === "cm" || target === "in") {
      const cm = toCm(value, unit);
      return cm == null ? null : target === "in" ? cm / CM_PER_IN : cm;
    }
    return null;
  }

  /** Most recent record of a measurement type (by date, then id). */
  function latestOfType(records, type) {
    let best = null;
    for (const r of records) {
      if (r.type !== type) continue;
      if (!best || r.date > best.date || (r.date === best.date && r.id > best.id)) best = r;
    }
    return best;
  }

  /** BMI from height (cm) and weight (kg); null when either is missing/invalid. */
  function calcBMI(heightCm, weightKg) {
    const h = Number(heightCm), w = Number(weightKg);
    if (!isFinite(h) || !isFinite(w) || h <= 0 || w <= 0) return null;
    return w / Math.pow(h / 100, 2);
  }

  const BMI_CATEGORIES = [
    { max: 16, label: "Severe thinness", desc: "below 16 · underweight", cls: "bad" },
    { max: 17, label: "Moderate thinness", desc: "16 – 17 · underweight", cls: "bad" },
    { max: 18.5, label: "Mild thinness", desc: "17 – 18.5 · underweight", cls: "warn" },
    { max: 25, label: "Normal weight", desc: "18.5 – 25 · healthy range", cls: "ok" },
    { max: 30, label: "Overweight", desc: "25 – 30 · pre-obese", cls: "warn" },
    { max: 35, label: "Obesity class I", desc: "30 – 35 · moderate", cls: "bad" },
    { max: 40, label: "Obesity class II", desc: "35 – 40 · severe", cls: "bad" },
    { max: Infinity, label: "Obesity class III", desc: "40+ · extreme", cls: "bad" }
  ];

  /** WHO BMI category for a BMI value (categorised by the value actually shown). */
  function bmiCategory(bmi) {
    const v = Number(bmi);
    if (!isFinite(v) || v <= 0) return null;
    const shown = Number(v.toFixed(1));
    return BMI_CATEGORIES.find((c) => shown < c.max) || BMI_CATEGORIES[BMI_CATEGORIES.length - 1];
  }

  /** Circumference measurements the Navy formula needs for a given body profile. */
  function navyNeeds(sex) {
    return sex === "female" ? ["Neck", "Waist", "Hips"] : ["Neck", "Waist"];
  }

  /**
   * U.S. Navy estimated body-fat %. Circumferences + height in cm; converted
   * to inches internally. Returns null (never a number) when any required
   * input is missing, physically inconsistent (e.g. waist not larger than
   * neck), implausible, or yields an out-of-range result — callers must not
   * render a body-fat value in those cases.
   */
  function calcNavyBodyFat(sex, heightCm, neckCm, waistCm, hipsCm) {
    // Inputs arrive in cm (the app's length convention); the Navy formula
    // works in inches, so convert here — stored values are never touched.
    const hCm = toCm(heightCm, "cm"), nCm = toCm(neckCm, "cm"), wCm = toCm(waistCm, "cm");
    if (hCm == null || nCm == null || wCm == null) return null;
    const hIn = hCm / CM_PER_IN;
    const nIn = nCm / CM_PER_IN;
    const wIn = wCm / CM_PER_IN;
    const female = sex === "female";
    const hipCm = female ? toCm(hipsCm, "cm") : null;
    const hipIn = hipCm == null ? null : hipCm / CM_PER_IN;
    if (female && (hipIn == null || wIn + hipIn <= nIn)) return null;
    if (!female && wIn <= nIn) return null;
    // Generous plausibility guards — catch unit typos (e.g. 1750 instead of 175).
    if (hIn < 39 || hIn > 98) return null;   // ~1.0 – 2.5 m
    if (nIn < 8 || nIn > 26) return null;    // ~20 – 66 cm
    if (wIn < 15 || wIn > 80) return null;   // ~38 – 203 cm
    if (female && (hipIn < 15 || hipIn > 80)) return null;
    let bf;
    if (female) {
      bf = 163.205 * Math.log10(wIn + hipIn - nIn) - 97.684 * Math.log10(hIn) - 78.387;
    } else {
      bf = 86.010 * Math.log10(wIn - nIn) - 70.041 * Math.log10(hIn) + 36.76;
    }
    if (!isFinite(bf) || bf < 0 || bf > 75) return null;
    return bf;
  }

  /**
   * Combined BMI + body-fat interpretation. Body fat (ACE-recommended ranges,
   * by sex) is the primary signal; BMI modulates the wording so a high BMI
   * with low body fat reads as muscle rather than overweight.
   */
  function bodyCompClass(sex, bmi, bf) {
    const female = sex === "female";
    // ACE body-fat bands (%): men / women
    const comp = female ? 16 : 10;       // ≤ this: competition / very athletic
    const lean = female ? 20 : 13;       // ≤ this: athletic / lean
    const fit = female ? 24 : 17;        // ≤ this: fit / fitness
    const healthy = female ? 31 : 24;    // ≤ this: normal / healthy
    const sHigh = female ? 37 : 30;      // ≤ this: slightly high
    const high = female ? 42 : 35;       // ≤ this: high (above: very high)
    const muscular = bmi != null && bmi >= 25;

    if (bf <= lean) {
      if (muscular) {
        return { label: "Very Athletic / Muscular", cls: "ok", note: "Your BMI reads high, but your body fat is low — the weight is mostly lean mass, not fat." };
      }
      if (bf <= comp) {
        return { label: "Very Athletic / Competition", cls: "ok", note: "Body fat in the competition range with a healthy BMI — an elite-level composition." };
      }
      return { label: "Athletic / Lean", cls: "ok", note: "Low body fat with a healthy BMI — a lean, athletic composition." };
    }
    if (bf <= fit) {
      return { label: "Fit / Fitness", cls: "ok", note: "Body fat in the fitness range — a solid, athletic level." };
    }
    if (bf <= healthy) {
      return { label: "Normal / Healthy", cls: "ok", note: "BMI and body fat are both in the healthy range." };
    }
    if (bf <= sHigh) {
      return { label: "Slightly High", cls: "warn", note: "Body fat is above the recommended range — a good moment to focus on recomposition." };
    }
    if (bf <= high) {
      return { label: "High", cls: "warn", note: "Body fat is elevated. Combined with your BMI, this suggests reducing body fat would improve health markers." };
    }
    return { label: "Very High", cls: "bad", note: "Body fat is well above healthy levels. Consider professional guidance." };
  }

  /**
   * Sex-specific body-fat reference ranges for the ⓘ explainer, based on the
   * ACE (American Council on Exercise) guidelines.
   */
  function bfInfoRanges(sex) {
    const male = sex !== "female";
    return [
      { label: "Essential fat", range: male ? "2 – 5%" : "10 – 13%" },
      { label: "Athletic / Competition", range: male ? "6 – 10%" : "14 – 16%" },
      { label: "Athletic / Lean", range: male ? "11 – 13%" : "17 – 20%" },
      { label: "Fitness", range: male ? "14 – 17%" : "21 – 24%" },
      { label: "Healthy / Average", range: male ? "18 – 24%" : "25 – 31%" },
      { label: "Higher than recommended", range: male ? "25 – 30%" : "32 – 37%" },
      { label: "High", range: male ? "31%+" : "38%+" }
    ];
  }

  /* ---------------- report insights engine ---------------- */
  /*
   * Pure, data-driven layer between raw records and the PDF report (and any
   * future consumer). Every function here inspects the data and returns
   * structured insights of the form:
   *   { type, metric, title, body, tone, magnitude?, period? }
   * where type ∈ {improvement, decline, consistency, milestone, peak, trough,
   * trend, comparison, measurement, pattern} and tone ∈ {positive, negative,
   * warn, info, neutral}. No sentence is ever emitted unless the data actually
   * supports it — callers decide how to present (or drop) each insight.
   */

  /** Safe percentage change; null when the base is zero or missing. */
  function pctChange(cur, prev) {
    const a = Number(cur), b = Number(prev);
    if (!isFinite(a) || !isFinite(b) || b === 0) return null;
    return ((a - b) / Math.abs(b)) * 100;
  }

  /**
   * Percentage change of cur vs prev for period comparisons, matching the
   * compareYears() rule: a zero base with a non-zero current value reads as
   * +100%, and both zero reads as 0 (so "0 vs 0" stays neutral instead of
   * undefined). Used by the dashboard's This week / This month cards.
   */
  function pctVsPrev(cur, prev) {
    return prev === 0 ? (cur === 0 ? 0 : 100) : ((cur - prev) / prev) * 100;
  }

  function mkInsight(type, metric, title, body, tone, extra) {
    return Object.assign({ type, metric, title, body, tone }, extra || {});
  }

  /** "1 workout" vs "3 workouts" — keeps every insight grammatically correct. */
  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }

  /** Derived monthly analysis used by several insight generators. */
  function monthlyAnalysis(ms) {
    const withData = ms.filter((m) => m.days > 0);
    if (!withData.length) return null;
    const by = (fn) => withData.slice().sort((a, b) => fn(b) - fn(a));
    const best = by((m) => m.days)[0];
    const mostCal = by((m) => m.calories)[0];
    const mostConsistent = by((m) => m.bestStreak)[0];
    const moms = [];
    for (let i = 1; i < withData.length; i++) {
      moms.push({ cur: withData[i], prev: withData[i - 1], delta: withData[i].workouts - withData[i - 1].workouts });
    }
    const bestMom = moms.length ? moms.slice().sort((a, b) => b.delta - a.delta)[0] : null;
    const worstMom = moms.length ? moms.slice().sort((a, b) => a.delta - b.delta)[0] : null;
    return { best, mostCal, mostConsistent, bestMom, worstMom, monthsWithData: withData.length };
  }

  /** Overall volume, concentration and peaks/troughs for a year. */
  function volumeInsights(workouts, year) {
    const ys = yearlyStats(workouts, year);
    const out = [];
    if (ys.workouts <= 0) return out;
    const perMonth = ys.monthsWithData ? Math.round(ys.workouts / ys.monthsWithData) : 0;
    out.push(mkInsight("volume", "workouts",
      plural(ys.workouts, "workout") + " in " + year,
      "You trained on **" + plural(ys.days, "active day") +
        "**, averaging **" + plural(perMonth, "workout") +
        "** per active month across **" + ys.monthsWithData + " of 12 months**.",
      ys.workouts >= 48 ? "positive" : ys.workouts < 12 ? "negative" : "neutral",
      { magnitude: ys.workouts }));
    if (ys.monthsWithData === 1) {
      const only = monthlyStats(workouts, year).find((m) => m.days > 0);
      out.push(mkInsight("pattern", "concentration",
        "All training fell in " + (only ? only.label : "one month"),
        "The rest of the year has no recorded workouts — a regular weekly rhythm would smooth this out.",
        "warn"));
    } else if (ys.monthsWithData >= 2 && ys.bestMonth && ys.worstMonth && ys.bestMonth.label !== ys.worstMonth.label) {
      out.push(mkInsight("peak", "activity",
        "Strongest month: " + ys.bestMonth.label,
        ys.bestMonth.label + " was your most active month with **" + ys.bestMonth.days +
          "** workout day" + (ys.bestMonth.days === 1 ? "" : "s") + ".",
        "positive"));
      out.push(mkInsight("trough", "activity",
        "Quietest month: " + ys.worstMonth.label,
        ys.worstMonth.label + " had the fewest workouts of the year (**" + ys.worstMonth.workouts + "**).",
        "warn"));
    }
    return out;
  }

  /** Month-to-month progress signals (best/worst, jumps, consistency). */
  function monthlyInsights(workouts, year) {
    const ma = monthlyAnalysis(monthlyStats(workouts, year));
    const out = [];
    if (!ma) return out;
    // The current month is still in progress — never present a partial month's
    // decline as a completed fact.
    const now = todayISO();
    const isCurMonth = (m) => yearOf(now) === year && monthOf(now) === m.month;
    if (ma.monthsWithData >= 2 && ma.bestMom && ma.bestMom.delta > 0) {
      out.push(mkInsight("improvement", "workouts",
        "Biggest month-over-month jump: " + ma.bestMom.cur.label,
        "**" + ma.bestMom.cur.label + "** added " + ma.bestMom.delta + " workout" + (ma.bestMom.delta === 1 ? "" : "s") +
          " vs " + ma.bestMom.prev.label + " (" + ma.bestMom.prev.workouts + " to " + ma.bestMom.cur.workouts + ").",
        "positive"));
    }
    if (ma.monthsWithData >= 2 && ma.worstMom && ma.worstMom.delta < 0 && !isCurMonth(ma.worstMom.cur)) {
      out.push(mkInsight("decline", "workouts",
        "Largest month-over-month drop: " + ma.worstMom.cur.label,
        "**" + ma.worstMom.cur.label + "** fell " + Math.abs(ma.worstMom.delta) + " workout" +
          (Math.abs(ma.worstMom.delta) === 1 ? "" : "s") + " vs " + ma.worstMom.prev.label + ".",
        "warn"));
    }
    if (ma.mostConsistent && ma.mostConsistent.bestStreak >= 3) {
      out.push(mkInsight("consistency", "streak",
        "Most consistent stretch: " + ma.mostConsistent.label,
        "**" + ma.mostConsistent.label + "** held your longest in-month streak of " + ma.mostConsistent.bestStreak +
          " consecutive day" + (ma.mostConsistent.bestStreak === 1 ? "" : "s") + ".",
        "positive"));
    }
    if (ma.mostCal && ma.mostCal.calories > 0) {
      out.push(mkInsight("peak", "calories",
        "Highest-calorie month: " + ma.mostCal.label,
        "**" + ma.mostCal.label + "** led the year with " + fmtNum(ma.mostCal.calories) + " kcal.",
        "neutral"));
    }
    return out;
  }

  /** Year-over-year comparison insights (only meaningful when both years have data). */
  function comparisonInsights(workouts, cmp) {
    const out = [];
    if (!cmp) return out;
    const t = cmp.totals;
    // `noun` labels the value in the card title; `bodyNoun`/`bodyFmt` read
    // naturally in the sentence ("Calories went from 44,421 kcal in 2025 …").
    const add = (metric, noun, fmt, bodyNoun, bodyFmt) => {
      const row = t[metric];
      if (!row) return;
      const pct = pctChange(row.a, row.b);
      if (row.a === 0 && row.b === 0) return;
      const dir = row.diff > 0 ? "up" : row.diff < 0 ? "down" : "flat";
      const pctPart = pct == null
        ? (row.a > 0 && row.b === 0 ? "up from zero" : "unchanged")
        : (pct > 0 ? "+" : "") + Math.round(pct) + "%";
      out.push(mkInsight("comparison", metric,
        fmt(row.a) + " " + noun + " (" + pctPart + (pct != null ? " vs " + cmp.yearB : "") + ")",
        bodyNoun + " went from **" + bodyFmt(row.b) + "** in " + cmp.yearB +
          " to **" + bodyFmt(row.a) + "** in " + cmp.yearA + ".",
        dir === "up" ? "positive" : dir === "down" ? "negative" : "neutral",
        { magnitude: Math.round(row.diff) }));
    };
    add("workouts", "workouts", (v) => String(v), "Workouts", (v) => String(v));
    add("days", "active days", (v) => String(v), "Active days", (v) => String(v));
    add("calories", "kcal", (v) => fmtNum(v), "Calories", (v) => fmtNum(v) + " kcal");
    add("duration", "min of training", (v) => fmtNum(v), "Training duration", (v) => fmtNum(v) + " min");
    // Which months drove the change?
    const deltas = cmp.months
      .map((m) => ({ month: m.label, delta: m.a.workouts - m.b.workouts }))
      .filter((d) => d.delta !== 0)
      .sort((a, b) => b.delta - a.delta);
    if (deltas.length) {
      const top = deltas[0], bottom = deltas[deltas.length - 1];
      if (top.delta > 0) {
        out.push(mkInsight("trend", "driver",
          "Driven by " + top.month,
          "**" + top.month + "** contributed the largest month-over-year gain (" + top.delta + " workout" +
            (top.delta === 1 ? "" : "s") + " more than " + cmp.yearB + ").",
          "positive"));
      }
      if (bottom.delta < 0 && bottom.month !== top.month) {
        out.push(mkInsight("decline", "driver",
          "Weakest vs " + cmp.yearB + ": " + bottom.month,
          "**" + bottom.month + "** was " + Math.abs(bottom.delta) + " workout" + (Math.abs(bottom.delta) === 1 ? "" : "s") +
            " behind " + cmp.yearB + ".",
          "warn"));
      }
    }
    // Consistency change (months with at least one workout day).
    const mA = monthlyStats(workouts, cmp.yearA).filter((m) => m.days > 0).length;
    const mB = monthlyStats(workouts, cmp.yearB).filter((m) => m.days > 0).length;
    if (mA !== mB) {
      out.push(mkInsight("consistency", "months",
        "Active months: " + mA + " vs " + mB,
        "You trained in **" + mA + " month" + (mA === 1 ? "" : "s") + "** in " + cmp.yearA +
          " compared with **" + mB + "** in " + cmp.yearB + ".",
        mA > mB ? "positive" : "warn"));
    }
    return out;
  }

  /** Measurement trends for a year, kept neutral (never good/bad). */
  function measurementInsights(records, year) {
    const inYear = records.filter((r) => r.date.slice(0, 4) === String(year));
    const stats = measurementStats(inYear);
    const out = [];
    for (const s of stats) {
      if (s.count < 2) continue;
      const delta = Number(s.latest.value) - Number(s.first.value);
      const pct = pctChange(s.latest.value, s.first.value);
      const dirWord = delta < -0.0001 ? "decreased" : delta > 0.0001 ? "increased" : "held steady";
      const unit = s.unit ? " " + s.unit : "";
      let body = s.type + " " + dirWord + " from " + fmtNum(s.first.value, 1) + unit + " (" +
        shortDate(s.first.date) + ") to **" + fmtNum(s.latest.value, 1) + unit + "** (" + shortDate(s.latest.date) + ")";
      if (pct != null && Math.abs(delta) > 0.0001) body += ", a **" + Math.round(Math.abs(pct) * 10) / 10 + "% change**";
      if (s.count >= 3) body += ". Across **" + s.count + "** readings it ranged from " + fmtNum(s.min, 1) + " to " + fmtNum(s.max, 1) + unit;
      out.push(mkInsight("measurement", s.type,
        s.type + ": " + fmtNum(s.latest.value, 1) + unit,
        body + ".",
        "info",
        { magnitude: Math.round(delta * 10) / 10 }));
    }
    return out;
  }

  /** Consistency signals: frequency, streaks, longest inactivity gap. */
  function consistencyInsights(workouts, year) {
    const inYear = workouts.filter((w) => yearOf(w.date) === year);
    const days = new Set(inYear.map((w) => w.date));
    const sorted = Array.from(days).sort();
    const out = [];
    if (!sorted.length) return out;
    const totalDays = dayOfYear(year + "-12-31");
    const activePct = (sorted.length / totalDays) * 100;
    let maxGap = 0, gapFrom = null, gapTo = null;
    for (let i = 1; i < sorted.length; i++) {
      const gap = Math.round((parse(sorted[i]) - parse(sorted[i - 1])) / 86400000) - 1;
      if (gap > maxGap) { maxGap = gap; gapFrom = sorted[i - 1]; gapTo = sorted[i]; }
    }
    out.push(mkInsight("consistency", "frequency",
      "Trained on " + (activePct < 1 ? "less than 1%" : Math.round(activePct) + "%") + " of the year's days",
      // (the denominator is the full calendar year, visible as "N of 365" in
      // the report's stat strip — even when the year is still in progress)
      "**" + plural(sorted.length, "active day") + "** across " + year +
        (maxGap > 0 ? ", with a longest break of **" + plural(maxGap, "day") +
          "** (" + shortDate(gapFrom) + " to " + shortDate(gapTo) + ")" : "") + ".",
      activePct >= 25 ? "positive" : activePct >= 10 ? "neutral" : "warn"));
    // Longest run of consecutive days, with its date range, for the narrative.
    let best = { run: 0, from: null, to: null }, run = 0, runFrom = null, prevD = null;
    for (const d of sorted) {
      if (prevD !== null && addDays(prevD, 1) === d) run += 1;
      else { run = 1; runFrom = d; }
      if (run > best.run) best = { run, from: runFrom, to: d };
      prevD = d;
    }
    if (best.run >= 3) {
      out.push(mkInsight("milestone", "streak",
        "Longest streak: " + best.run + " days",
        "Your best run of consecutive training days in " + year + " stretched from **" +
          shortDate(best.from) + "** to **" + shortDate(best.to) + "**.",
        "positive"));
    }
    const cur = streaks(workouts, todayISO()).current;
    if (cur >= 3) {
      out.push(mkInsight("consistency", "streak",
        "Current streak: " + cur + " days",
        "As of today you have trained **" + cur + "** days in a row.",
        "positive"));
    }
    return out;
  }

  /**
   * One-line analytical captions for the three monthly charts, derived
   * directly from the monthly aggregates (peak, quietest, biggest jump).
   * The current, still-incomplete month is worded "so far" when it is the
   * quietest, so captions never overstate a partial month.
   */
  function chartCaptions(workouts, year) {
    const ms = monthlyStats(workouts, year);
    const withData = ms.filter((m) => m.days > 0);
    const out = { workouts: "", calories: "", duration: "" };
    if (!withData.length) return out;
    const now = todayISO();
    const isCurMonth = (m) => yearOf(now) === year && monthOf(now) === m.month;
    const best = withData.reduce((a, b) => (a.days >= b.days ? a : b));
    const quiet = withData.reduce((a, b) => (a.workouts <= b.workouts ? a : b));
    const mostCal = withData.reduce((a, b) => (a.calories >= b.calories ? a : b));
    const mostDur = withData.reduce((a, b) => (a.duration >= b.duration ? a : b));
    const sorted = withData.slice().sort((a, b) => a.month - b.month);
    let bestMom = null;
    for (let i = 1; i < sorted.length; i++) {
      const d = sorted[i].workouts - sorted[i - 1].workouts;
      if (d > 0 && (!bestMom || d > bestMom.delta)) bestMom = { delta: d, cur: sorted[i], prev: sorted[i - 1] };
    }
    out.workouts = (best ? "Training peaked in **" + best.label + "** with **" + best.days + "** workout day" + (best.days === 1 ? "" : "s") + ". " : "") +
      (quiet && quiet.label !== best.label
        ? (isCurMonth(quiet) ? quiet.label + " has " + quiet.workouts + " workout" + (quiet.workouts === 1 ? "" : "s") + " so far this month. "
          : "**" + quiet.label + "** had the fewest workouts (**" + quiet.workouts + "**). ")
        : "") +
      (bestMom ? "The biggest climb came between **" + bestMom.prev.label + "** and **" + bestMom.cur.label + "** (+" + bestMom.delta + " workouts)." : "");
    out.calories = mostCal && mostCal.calories > 0 ? mostCal.label + " led in calories with **" + fmtNum(mostCal.calories) + " kcal**." : "";
    out.duration = mostDur && mostDur.duration > 0 ? mostDur.label + " led in training time with **" + fmtDuration(mostDur.duration) + "**." :
      withData.length ? "No training duration was recorded in " + year + "." : "";
    return out;
  }

  /** Cover-page narrative: 2-3 short paragraphs that only state what the data shows. */
  function execSummary(workouts, measurements, year, compareYear) {
    const ys = yearlyStats(workouts, year);
    const paras = [];
    if (ys.workouts <= 0) {
      paras.push({ title: "No workouts recorded", body: "There is no workout data for " + year + ". This report covers only what you logged." });
      return paras;
    }
    const perMonth = ys.monthsWithData ? Math.round(ys.workouts / ys.monthsWithData) : 0;
    let s = "You completed **" + plural(ys.workouts, "workout") + "** across **" + plural(ys.days, "active day") +
      "**, averaging **" + plural(perMonth, "workout") +
      "** per active month" + (ys.monthsWithData < 12 ? " — training was concentrated in **" + ys.monthsWithData + " of 12 months**" : "") +
      ". " + (ys.duration > 0 ? "Total training time reached **" + fmtDuration(ys.duration) + "** and you burned **" + fmtCal(ys.calories) + "**." : "You burned **" + fmtCal(ys.calories) + "** in total.");
    paras.push({ title: "The year in numbers", body: s });
    if (compareYear && compareYear !== year) {
      const cmp = compareYears(workouts, year, compareYear);
      const p = cmp.totals.workouts;
      const pct = pctChange(p.a, p.b);
      let c = "Compared with " + cmp.yearB + ", workout volume **" +
        (pct == null ? (p.a > 0 ? "went from zero to " + p.a : "was unchanged") :
          pct > 0 ? "rose " + Math.round(pct) + "%" : pct < 0 ? "fell " + Math.round(Math.abs(pct)) + "%" : "held steady") +
        "** (" + p.b + " to " + p.a + " workouts).";
      const ad = cmp.totals.duration.a && cmp.totals.workouts.a ? cmp.totals.duration.a / cmp.totals.workouts.a : null;
      const bd = cmp.totals.duration.b && cmp.totals.workouts.b ? cmp.totals.duration.b / cmp.totals.workouts.b : null;
      if (ad != null && bd != null) {
        const dp = pctChange(ad, bd);
        if (dp != null && Math.abs(dp) > 0.5) {
          c += " Average session length **" + (dp > 0 ? "grew " : "shrank ") + Math.round(Math.abs(dp)) + "%**.";
        }
      }
      paras.push({ title: "Year over year", body: c });
    }
    const cons = consistencyInsights(workouts, year);
    if (cons.length) {
      paras.push({ title: "Consistency", body: cons.map((i) => i.body).join(" ") });
    }
    return paras;
  }

  /** 3-7 closing takeaways, ordered by importance. */
  function keyTakeaways(workouts, measurements, year, compareYear) {
    const out = [];
    const ys = yearlyStats(workouts, year);
    if (ys.workouts > 0) {
      out.push(mkInsight("milestone", "workouts",
        plural(ys.workouts, "workout") + " logged",
        "Across **" + plural(ys.days, "active day") + "** in " + year + ".", "positive"));
    }
    if (ys.bestMonth && ys.monthsWithData >= 2) {
      out.push(mkInsight("peak", "activity",
        "Peak month: " + ys.bestMonth.label,
        "Your busiest month, with **" + ys.bestMonth.days + "** active days.", "positive"));
    }
    if (ys.longestStreak >= 3) {
      out.push(mkInsight("milestone", "streak",
        ys.longestStreak + "-day best streak",
        "Your longest run of consecutive training days this year.", "positive"));
    }
    if (compareYear && compareYear !== year) {
      const cmp = compareYears(workouts, year, compareYear);
      const p = cmp.totals.workouts;
      const pct = pctChange(p.a, p.b);
      if (pct != null && pct !== 0) {
        out.push(mkInsight("comparison", "workouts",
          (pct > 0 ? "+" : "") + Math.round(pct) + "% workouts vs " + cmp.yearB,
          "Workout volume went from **" + p.b + "** to **" + p.a + "** sessions.",
          pct > 0 ? "positive" : "warn"));
      }
    }
    const meas = measurementInsights(measurements, year).filter((i) => i.type === "measurement");
    if (meas.length) out.push(meas[0]);
    if (ys.monthsWithData >= 1 && ys.monthsWithData < 12) {
      const inactive = 12 - ys.monthsWithData;
      out.push(mkInsight("pattern", "opportunity",
        inactive + " month" + (inactive === 1 ? "" : "s") + " with no training",
        "Scheduling workouts in quieter months would raise consistency.", "warn"));
    }
    return out.slice(0, 7);
  }

  /**
   * Activity grid for a year: 7-day weeks (Mon-Sun) aligned so Jan 1 always
   * starts a fresh week column, for heatmap-style visualisations. Cells are
   * null when outside the year, otherwise { date, level, workouts } where
   * level = intensityForCalories. Also returns the week index where each
   * month first appears (for month labels).
   */
  function yearActivityGrid(workouts, year) {
    const agg = dayAggregates(workouts);
    const firstDow = parse(year + "-01-01").getDay();
    const offset = (firstDow + 6) % 7;
    const weeks = [];
    const monthAtWeek = [];
    let d = addDays(year + "-01-01", -offset);
    let guard = 0;
    while (yearOf(d) <= year && guard < 60) {
      const cells = [];
      for (let i = 0; i < 7; i++) {
        const iso = d;
        if (yearOf(iso) === year) {
          const a = agg.get(iso);
          cells.push({ date: iso, level: a ? intensityForCalories(a.calories) : 0, workouts: a ? a.count : 0 });
        } else {
          cells.push(null);
        }
        d = addDays(d, 1);
      }
      const firstCell = cells.find((c) => c);
      weeks.push(cells);
      monthAtWeek.push(firstCell ? { month: monthOf(firstCell.date), label: MONTHS_SHORT[monthOf(firstCell.date) - 1] } : null);
      guard++;
    }
    return { weeks, monthAtWeek };
  }

  /* ---------------- calendar helpers ---------------- */

  /** Intensity level 0..4 for a day, based on total calories. */
  function intensityForCalories(kcal) {
    if (!kcal || kcal <= 0) return 0;
    if (kcal < 300) return 1;
    if (kcal < 600) return 2;
    if (kcal < 900) return 3;
    return 4;
  }

  /** Days present in a month: map of day-number -> {level, calories, count}. */
  function monthDayMap(workouts, year, month) {
    const agg = dayAggregates(workouts);
    const map = new Map();
    for (let d = 1; d <= daysInMonth(year, month); d++) {
      const iso = year + "-" + String(month).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const a = agg.get(iso);
      if (a) map.set(d, { level: intensityForCalories(a.calories), calories: a.calories, count: a.count, duration: a.duration });
    }
    return map;
  }

  /** Years present in data (sorted desc) plus a couple around today. */
  function availableYears(workouts, measurements) {
    const set = new Set([new Date().getFullYear()]);
    workouts.forEach((w) => set.add(yearOf(w.date)));
    measurements.forEach((m) => set.add(yearOf(m.date)));
    const arr = Array.from(set).sort((a, b) => b - a);
    const min = Math.min(...arr, new Date().getFullYear());
    for (let y = min - 1; y >= min - 2; y--) arr.push(y);
    return Array.from(new Set(arr)).sort((a, b) => b - a);
  }

  /** Years with at least one workout, newest first — the Analytics year-over-year
   *  comparison only offers years that are actually comparable, so future years
   *  and years with no workout data (measurement-only or entirely empty) are
   *  excluded. */
  function workoutYears(workouts) {
    const cur = new Date().getFullYear();
    const set = new Set();
    workouts.forEach((w) => {
      const y = yearOf(w.date);
      if (isFinite(y) && y <= cur) set.add(y);
    });
    return Array.from(set).sort((a, b) => b - a);
  }

  /* ---------------- formatting ---------------- */

  function fmtNum(n, dp = 0) {
    if (n == null || !isFinite(n)) return "—";
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: dp });
  }
  function fmtDuration(min) {
    if (min == null || !isFinite(min)) return "—";
    if (min < 60) return Math.round(min) + " min";
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m ? h + "h " + m + "m" : h + "h";
  }
  function fmtCal(n) {
    return fmtNum(n) + " kcal";
  }
  function fmtDelta(n) {
    const v = Math.round(n * 10) / 10;
    return (v > 0 ? "+" : "") + v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  function prettyDate(iso) {
    const p = parse(iso);
    return MONTHS_LONG[p.getMonth()] + " " + p.getDate() + ", " + p.getFullYear();
  }
  function shortDate(iso) {
    const p = parse(iso);
    return MONTHS_SHORT[p.getMonth()] + " " + p.getDate();
  }
  function weekdayName(iso) {
    return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][parse(iso).getDay()];
  }

  /** Days per backup-reminder unit, so "every 2 weeks" / "every 1 year" can be
   *  normalized to the day-based interval backupReminderDue expects. */
  const REMINDER_UNIT_DAYS = { days: 1, weeks: 7, years: 365 };

  /** Backup-reminder rule: due when enabled, not already shown today, and no
   *  backup exists or the last one is ≥ opts.days (default 10) days old — i.e.
   *  "remind me every N days after the last JSON backup". Pure so it's easy to
   *  test; opts: { enabled, lastBackupAt (ISO date/datetime), lastShownAt, days }. */
  function backupReminderDue(iso, opts) {
    const o = opts || {};
    if (o.enabled === false) return false;
    if (o.lastShownAt === iso) return false; // already shown today
    const interval = Number.isFinite(Number(o.days)) && Number(o.days) > 0 ? Number(o.days) : 10;
    if (o.lastBackupAt) {
      const days = (parse(iso) - parse(String(o.lastBackupAt).slice(0, 10))) / 86400000;
      if (days < interval) return false;
    }
    return true;
  }

  window.Focus = window.Focus || {};
  window.Focus.Stats = {
    MONTHS_SHORT, MONTHS_LONG,
    parse, toISO, addDays, todayISO, yearOf, monthOf, dayOf, dayOfYear, daysInMonth, weekdayOf,
    dayAggregates, workoutDays, streaks, weeklyStats, monthlyStats, yearlyStats, compareYears,
    typeBreakdown, measurementStats, measurementSeries, intensityForCalories,
    toCm, toKg, convertTo, latestOfType, calcBMI, bmiCategory, navyNeeds,
    calcNavyBodyFat, bodyCompClass, bfInfoRanges,
    pctChange, pctVsPrev, monthlyAnalysis, plural, volumeInsights, monthlyInsights, comparisonInsights,
    measurementInsights, consistencyInsights, chartCaptions, execSummary, keyTakeaways, yearActivityGrid,
    monthDayMap, availableYears, workoutYears, longestStreakInSet, backupReminderDue, REMINDER_UNIT_DAYS, dailyGoalStatus,
    fmtNum, fmtDuration, fmtCal, fmtDelta, prettyDate, shortDate, weekdayName
  };
})();
