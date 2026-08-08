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

  window.Focus = window.Focus || {};
  window.Focus.Stats = {
    MONTHS_SHORT, MONTHS_LONG,
    parse, toISO, addDays, todayISO, yearOf, monthOf, dayOf, dayOfYear, daysInMonth, weekdayOf,
    dayAggregates, workoutDays, streaks, weeklyStats, monthlyStats, yearlyStats, compareYears,
    typeBreakdown, measurementStats, measurementSeries, intensityForCalories,
    toCm, toKg, convertTo, latestOfType, calcBMI, bmiCategory, navyNeeds,
    calcNavyBodyFat, bodyCompClass, bfInfoRanges,
    monthDayMap, availableYears, longestStreakInSet,
    fmtNum, fmtDuration, fmtCal, fmtDelta, prettyDate, shortDate, weekdayName
  };
})();
