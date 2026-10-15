/* =========================================================================
 * Focus.Food — centralized Food domain (single source of truth)
 * -------------------------------------------------------------------------
 * All food / junk-food tracking lives here. Dashboard, Calendar, Analytics
 * and Goals consume this engine instead of re-implementing food logic.
 *
 * Canonical daily states (internal values, never UI labels):
 *   NONE = no junk food eaten (goal success)
 *   SOME = some junk food (partial day, counts as logged, breaks streaks)
 *   FULL = full junk-food day
 *   null = unlogged / unknown (never counted as success or failure)
 *
 * Streak rule (documented): the goal is "Don't eat junk food", so BOTH
 * SOME and FULL break a junk-free streak. A junk-free streak runs only
 * through explicitly logged NONE days; an unlogged date breaks it (unknown
 * is not success). A still-open today (unlogged ref day) does not break the
 * current streak — the day is not over yet.
 *
 * Storage: the engine reads the existing date-keyed log at
 * `settings.noJunkFoodLog` (legacy values true / "some" / false). No new
 * database is introduced, so all historical data is preserved as-is.
 * ========================================================================= */
(function () {
  "use strict";

  const NONE = "none";
  const SOME = "some";
  const FULL = "full";

  const S = () => window.Focus.Stats;
  const Store = () => window.Focus.Store;

  /* ---------------- canonical mapping ---------------- */

  /** Legacy stored value -> canonical status (or null when unlogged). */
  function fromLegacy(v) {
    if (v === true) return NONE;
    if (v === "some") return SOME;
    if (v === false) return FULL;
    return null;
  }

  /** Canonical status -> legacy stored value (for persistence compat). */
  function toLegacy(status) {
    if (status === NONE) return true;
    if (status === SOME) return "some";
    if (status === FULL) return false;
    return null;
  }

  /** Validate a canonical status or null (clear). */
  function normalizeStatus(status) {
    if (status === NONE || status === SOME || status === FULL || status === null) return status;
    // Accept legacy inputs too.
    if (status === true) return NONE;
    if (status === false) return FULL;
    if (status === "some") return SOME;
    throw new Error("Choose a valid food outcome or clear the log.");
  }

  /** Raw log object (never null). */
  function rawLog(log) {
    if (log && typeof log === "object" && !Array.isArray(log)) return log;
    try {
      const s = Store();
      return (s.settings && s.settings.noJunkFoodLog) || {};
    } catch (e) { return {}; }
  }

  /** Canonical status for one ISO date (NONE/SOME/FULL or null). */
  function getStatus(log, iso) {
    const l = rawLog(log);
    if (typeof log === "string") { iso = log; return fromLegacy(rawLog()[iso]); }
    if (iso == null) return null;
    return fromLegacy(l[iso]);
  }

  function isGoalEnabled() {
    try {
      const g = Store().settings.goals || {};
      return g.avoidJunkFood !== false;
    } catch (e) { return true; }
  }

  /** "Don't eat junk food" is met only on an explicit NONE day. */
  function isGoalMet(log, iso) {
    const l = arguments.length === 1 ? rawLog() : rawLog(log);
    const date = arguments.length === 1 ? log : iso;
    return fromLegacy(l[date]) === NONE;
  }

  /* ---------------- range / period stats ---------------- */

  function emptyRange() {
    return { elapsedDays: 0, loggedDays: 0, noneDays: 0, someDays: 0, fullDays: 0, unloggedDays: 0, avoidanceRate: null, junkLoad: 0 };
  }

  /** Totals for [startISO, endISO] capped at ref (today/future excluded). */
  function rangeStats(log, startISO, endISO, refDateISO) {
    const stats = S();
    if (!stats.validISODate(startISO) || !stats.validISODate(endISO) || endISO < startISO) return emptyRange();
    const ref = stats.validISODate(refDateISO) ? refDateISO : stats.todayISO();
    const end = endISO < ref ? endISO : ref;
    const out = emptyRange();
    if (end < startISO) return out;
    const l = rawLog(log);
    for (let day = startISO; day <= end; day = stats.addDays(day, 1)) {
      out.elapsedDays++;
      const st = fromLegacy(Object.prototype.hasOwnProperty.call(l, day) ? l[day] : undefined);
      if (!st) continue;
      out.loggedDays++;
      if (st === NONE) out.noneDays++;
      else if (st === SOME) { out.someDays++; out.junkLoad += 0.5; }
      else { out.fullDays++; out.junkLoad += 1; }
    }
    out.junkLoad = Math.round(out.junkLoad * 10) / 10;
    out.unloggedDays = out.elapsedDays - out.loggedDays;
    out.avoidanceRate = out.loggedDays ? out.noneDays / out.loggedDays : null;
    return out;
  }

  function yearStats(log, year, refDateISO) {
    const stats = S();
    const ref = stats.validISODate(refDateISO) ? refDateISO : stats.todayISO();
    const months = [];
    const total = emptyRange();
    for (let m = 1; m <= 12; m++) {
      const r = stats.monthRange(year, m);
      const ms = rangeStats(log, r.start, r.end, ref);
      total.elapsedDays += ms.elapsedDays;
      total.loggedDays += ms.loggedDays;
      total.noneDays += ms.noneDays;
      total.someDays += ms.someDays;
      total.fullDays += ms.fullDays;
      total.junkLoad = Math.round((total.junkLoad + ms.junkLoad) * 10) / 10;
      months.push({ month: m, label: stats.MONTHS_SHORT[m - 1], ...ms });
    }
    total.unloggedDays = total.elapsedDays - total.loggedDays;
    total.avoidanceRate = total.loggedDays ? total.noneDays / total.loggedDays : null;
    return { year, ...total, months };
  }

  function monthStats(log, year, month, refDateISO) {
    const stats = S();
    const r = stats.monthRange(year, month);
    return { year, month, label: stats.MONTHS_SHORT[month - 1], ...rangeStats(log, r.start, r.end, refDateISO) };
  }

  /** Monday-start week containing ref (or given date). */
  function weekRange(refDateISO) {
    const stats = S();
    const ref = stats.validISODate(refDateISO) ? refDateISO : stats.todayISO();
    const dow = (stats.parse(ref).getDay() + 6) % 7; // Monday-first offset
    const start = stats.addDays(ref, -dow);
    return { start, end: stats.addDays(start, 6) };
  }

  function weekStats(log, refDateISO) {
    const r = weekRange(refDateISO);
    return { ...r, ...rangeStats(log, r.start, r.end, refDateISO) };
  }

  /* ---------------- streaks ---------------- */

  function streaks(log, refDateISO) {
    const stats = S();
    const l = rawLog(log);
    const ref = stats.validISODate(refDateISO) ? refDateISO : stats.todayISO();
    const dates = Object.keys(l).filter((iso) => stats.validISODate(iso) && iso <= ref).sort();
    if (!dates.length) return { currentNone: 0, longestNone: 0, currentJunk: 0, longestJunk: 0 };

    const first = dates[0];
    // Walk every elapsed day from first log to ref so unlogged gaps break runs.
    let longestNone = 0, runNone = 0;
    let longestJunk = 0, runJunk = 0;
    for (let day = first; day <= ref; day = stats.addDays(day, 1)) {
      const st = fromLegacy(Object.prototype.hasOwnProperty.call(l, day) ? l[day] : undefined);
      if (st === NONE) { runNone++; longestNone = Math.max(longestNone, runNone); runJunk = 0; }
      else if (st === SOME || st === FULL) { runJunk++; longestJunk = Math.max(longestJunk, runJunk); runNone = 0; }
      else { runNone = 0; runJunk = 0; }
    }
    // Current runs: walk back from ref; a still-open today doesn't break.
    let currentNone = 0, currentJunk = 0;
    let anchor = ref;
    if (!Object.prototype.hasOwnProperty.call(l, anchor) || !fromLegacy(l[anchor])) anchor = stats.addDays(ref, -1);
    // Determine which run is "current" by status at anchor.
    const anchorStatus = fromLegacy(Object.prototype.hasOwnProperty.call(l, anchor) ? l[anchor] : undefined);
    if (anchorStatus === NONE) {
      for (let day = anchor; ; day = stats.addDays(day, -1)) {
        if (fromLegacy(Object.prototype.hasOwnProperty.call(l, day) ? l[day] : undefined) === NONE) currentNone++;
        else break;
        if (day <= first && fromLegacy(l[day]) === NONE && !Object.prototype.hasOwnProperty.call(l, stats.addDays(day, -1))) break;
      }
    } else if (anchorStatus === SOME || anchorStatus === FULL) {
      for (let day = anchor; ; day = stats.addDays(day, -1)) {
        const st = fromLegacy(Object.prototype.hasOwnProperty.call(l, day) ? l[day] : undefined);
        if (st === SOME || st === FULL) currentJunk++;
        else break;
      }
    }
    return { currentNone, longestNone, currentJunk, longestJunk };
  }

  /* ---------------- trends (recent vs long-term) ---------------- */

  function trend(log, refDateISO) {
    const stats = S();
    const ref = stats.validISODate(refDateISO) ? refDateISO : stats.todayISO();
    const last7 = rangeStats(log, stats.addDays(ref, -6), ref, ref);
    const last30 = rangeStats(log, stats.addDays(ref, -29), ref, ref);
    const year = Number(ref.slice(0, 4));
    const ytd = yearStats(log, year, ref);
    const recent = last7.loggedDays >= 3 ? last7 : last30;
    const recentRate = recent.avoidanceRate;
    const base = ytd.avoidanceRate;
    let direction = "unknown"; // improving | stable | worsening | unknown
    let label = "Not enough data yet";
    if (recentRate != null && base != null && recent.loggedDays >= 4 && ytd.loggedDays >= 7) {
      const d = recentRate - base;
      if (d >= 0.12) { direction = "improving"; label = "Improving"; }
      else if (d <= -0.12) { direction = "worsening"; label = "Worsening"; }
      else { direction = "stable"; label = "Stable"; }
    } else if (recentRate != null && recent.loggedDays >= 2) {
      label = recentRate >= 0.8 ? "Strong start" : recentRate >= 0.5 ? "Mixed lately" : "Struggling lately";
    }
    // Recovery: a bad 8–14 days ago followed by a cleaner last 7 days.
    let recovering = false;
    const prev7 = rangeStats(log, stats.addDays(ref, -13), stats.addDays(ref, -7), ref);
    if (prev7.avoidanceRate != null && last7.avoidanceRate != null && prev7.loggedDays >= 3 && last7.loggedDays >= 3) {
      recovering = prev7.avoidanceRate <= 0.4 && last7.avoidanceRate - prev7.avoidanceRate >= 0.3;
    }
    // Setback: was clean, last 7 slipped.
    let setback = false;
    if (prev7.avoidanceRate != null && last7.avoidanceRate != null && prev7.loggedDays >= 3 && last7.loggedDays >= 3) {
      setback = prev7.avoidanceRate >= 0.8 && prev7.avoidanceRate - last7.avoidanceRate >= 0.3;
    }
    const avgPerWeek = ytd.loggedDays && ytd.elapsedDays ? Math.round((ytd.junkLoad / (ytd.elapsedDays / 7)) * 10) / 10 : null;
    const avgPerMonth = ytd.loggedDays ? Math.round((ytd.junkLoad / Math.max(1, Math.round(ytd.elapsedDays / 30.4))) * 10) / 10 : null;
    // Best / worst month by avoidance rate (min 4 logged days to qualify).
    const qualified = ytd.months.filter((m) => m.loggedDays >= 4 && m.avoidanceRate != null);
    let bestMonth = null, worstMonth = null;
    for (const m of qualified) {
      if (!bestMonth || m.avoidanceRate > bestMonth.avoidanceRate) bestMonth = m;
      if (!worstMonth || m.avoidanceRate < worstMonth.avoidanceRate) worstMonth = m;
    }
    return { last7, last30, ytd, recentRate, baseRate: base, direction, label, recovering, setback, avgPerWeek, avgPerMonth, bestMonth, worstMonth };
  }

  /* ---------------- insights ---------------- */

  /** Data-sufficiency aware natural-language insights. Never invents trends. */
  function insights(log, refDateISO, year) {
    const stats = S();
    const ref = stats.validISODate(refDateISO) ? refDateISO : stats.todayISO();
    const y = year || Number(ref.slice(0, 4));
    const l = rawLog(log);
    const loggedCount = Object.keys(l).filter((iso) => stats.validISODate(iso) && iso <= ref && fromLegacy(l[iso])).length;
    if (!loggedCount) return [];
    const t = trend(log, ref);
    const st = streaks(log, ref);
    const out = [];
    const push = (tone, text) => out.push({ tone, text });

    if (st.currentNone >= 2) push("positive", `You've gone <b>${st.currentNone} days</b> without junk food — keep it going!`);
    if (st.longestNone >= 2 && st.longestNone > st.currentNone) push("positive", `Longest run without junk food: <b>${st.longestNone} days</b>.`);
    else if (st.longestNone >= 2 && st.currentNone >= 2 && st.currentNone === st.longestNone) push("positive", `This is your longest junk-free run: <b>${st.longestNone} days</b>.`);
    if (t.avgPerWeek != null && t.ytd.loggedDays >= 7) push("neutral", `Averaging <b>${t.avgPerWeek} junk-food days</b> per week (partials count as half).`);
    if (t.direction === "improving") push("positive", `Your food habits are <b>improving</b> — recent days beat your yearly average.`);
    else if (t.direction === "worsening") push("warning", `Your food habits have <b>worsened lately</b> compared with your yearly average.`);
    else if (t.direction === "stable" && t.ytd.loggedDays >= 14) push("neutral", `Your food habits have stayed <b>relatively stable</b> recently.`);
    if (t.recovering) push("recovery", `After a difficult stretch, your food habits have <b>improved over the last 7 days</b>.`);
    if (t.setback) push("warning", `You were doing well, but the <b>last 7 days slipped</b> — a good moment to reset.`);
    if (st.longestJunk >= 3) push("warning", `Longest junk-food run: <b>${st.longestJunk} days</b> in a row.`);
    if (t.bestMonth) push("positive", `Best month so far: <b>${t.bestMonth.label}</b> (${Math.round(t.bestMonth.avoidanceRate * 100)}% junk-free over ${t.bestMonth.loggedDays} logged days).`);
    // Projection only with enough evidence: on track for best month.
    const curMonth = monthStats(log, Number(ref.slice(0, 4)), Number(ref.slice(5, 7)), ref);
    if (t.bestMonth && curMonth.loggedDays >= 7 && curMonth.avoidanceRate != null && curMonth.avoidanceRate > t.bestMonth.avoidanceRate) {
      push("positive", `If this keeps up, <b>${curMonth.label} is on track</b> to be your best month.`);
    }
    // Single-day state: don't fabricate trends.
    if (loggedCount < 4 && !out.length) push("neutral", `Keep tracking to unlock trends and comparisons.`);
    return out;
  }

  /* ---------------- overview ---------------- */

  function overview(log, refDateISO) {
    const stats = S();
    const ref = stats.validISODate(refDateISO) ? refDateISO : stats.todayISO();
    const t = trend(log, ref);
    const st = streaks(log, ref);
    const todayStatus = getStatus(rawLog(log), ref);
    const loggedCount = Object.keys(rawLog(log)).filter((iso) => stats.validISODate(iso) && iso <= ref && fromLegacy(rawLog(log)[iso])).length;
    return {
      ref, todayStatus,
      currentStreak: st.currentNone,
      longestStreak: st.longestNone,
      currentJunkRun: st.currentJunk,
      trend: t.label, direction: t.direction,
      last7: t.last7, last30: t.last30,
      thisMonth: monthStats(log, Number(ref.slice(0, 4)), Number(ref.slice(5, 7)), ref),
      thisWeek: weekStats(log, ref),
      bestMonth: t.bestMonth, worstMonth: t.worstMonth,
      hasData: loggedCount > 0,
      enoughForTrends: loggedCount >= 7
    };
  }

  /** Month calendar cells: [{iso, day, status}] for history views. */
  function monthCells(log, year, month) {
    const stats = S();
    const dim = stats.daysInMonth(year, month);
    const l = rawLog(log);
    const cells = [];
    for (let d = 1; d <= dim; d++) {
      const iso = year + "-" + String(month).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      cells.push({ iso, day: d, status: fromLegacy(Object.prototype.hasOwnProperty.call(l, iso) ? l[iso] : undefined) });
    }
    return cells;
  }

  window.Focus = window.Focus || {};
  window.Focus.Food = {
    NONE, SOME, FULL,
    fromLegacy, toLegacy, normalizeStatus,
    getStatus, isGoalEnabled, isGoalMet,
    rangeStats, yearStats, monthStats, weekRange, weekStats,
    streaks, trend, insights, overview, monthCells,
    // Compatibility: existing Stats food API delegates here (same semantics).
    legacyLog: rawLog
  };
})();
