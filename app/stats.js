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
    monthDayMap, availableYears, longestStreakInSet,
    fmtNum, fmtDuration, fmtCal, fmtDelta, prettyDate, shortDate, weekdayName
  };
})();
