# Daily Food Habit Goal and Analytics Refinement Implementation Plan

> **For agentic workers:** Execute inline in this session against the saved specification. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a locally persisted daily no-junk-food log and goal, surface honest food-habit and training-recovery analytics, enrich Calendar month summaries, and make the Data summary distinguish rest days from workout days.

**Architecture:** Keep food outcomes as a date-keyed map in the existing IndexedDB-backed app settings/backup object; expose a validating Store mutation API and a pure Stats aggregation engine. Render the same logged outcomes in the existing Dashboard, Calendar, Analytics, and Settings UI, use a bounded-elapsed-day helper for partial periods, and extend the established browser smoke test.

**Tech Stack:** Offline HTML/CSS/vanilla JavaScript, IndexedDB, existing `Focus.Store` / `Focus.Stats` / `Focus.UI` globals, SVG charts, browser-based `app/tests/smoke-test.html`.

**Spec:** [Detailed implementation prompt](../../request-prompts/daily-food-goal-and-analytics.md)

## Global Constraints

- Preserve the no-network, offline-first behavior and existing IndexedDB / JSON backup compatibility.
- Store daily outcomes as explicit booleans keyed by ISO date: `true` = no junk food; `false` = junk food eaten; absent key = unlogged.
- Never count unlogged or future dates as successful, consumed, or elapsed days.
- Preserve all pre-existing worktree changes and user data; commits may include only task-owned hunks.
- Reuse current theme tokens, chart primitives, interaction patterns, and smoke-test harness; add no dependency.
- Each feature increment must have a test, and the final app must be checked via the documented browser smoke-test page.

---

## File Structure and Responsibilities

- Modify `app/js/store.js`: validate/update date-keyed food statuses and merge backup food logs without deleting existing local entries.
- Modify `app/js/stats.js`: implement pure date-bounded food outcome aggregations and elapsed-period recovery metrics.
- Modify `app/js/ui.js`: add controls on Dashboard, Calendar, and Settings; add month summary / Analytics; revise Data labels.
- Modify `app/js/app.js`: handle saving and clearing daily statuses and goal preference.
- Modify `app/css/app.css`: style habit controls and new insight cards using existing tokens.
- Modify `Focus-Workout-Tracker.html` and `app/tests/smoke-test.html` only for required script cache/load/test wiring and assertions.
- Modify `README.md` for user-facing behavior and documented test checklist.
- Preserve the existing project’s version-bump workflow with a task-owned `app/js/version.js` change only if it can be safely isolated from prior edits.

## Task 1: Build and verify the food-habit calculation engine

**Files:**
- Modify `app/js/stats.js`
- Test: `app/tests/smoke-test.html`

**Interfaces:**
- Consumes: `recordByISODate` as an object whose own keys contain booleans, `year` as integer, optional `refDateISO` as `YYYY-MM-DD`.
- Produces: `foodHabitStats(recordByISODate, year, refDateISO)` returns `{ year, elapsedDays, loggedDays, avoidedDays, junkFoodDays, unloggedDays, avoidanceRate, months }`; each month contains `{ month, label, elapsedDays, loggedDays, avoidedDays, junkFoodDays, unloggedDays, avoidanceRate }`. A no-log rate is `null`. Future dates are excluded. `trainingRecoveryStats(workouts, year, refDateISO)` returns `{ elapsedDays, workoutDays, restDays, workoutRate, longestRestStreak }`, with future dates excluded and rest days limited to elapsed dates.

- [ ] Add deterministic tests for true/false/absent log entries, duplicate dates from workouts, leap February, partial current month, year/month with no logs, and future dates.
- [ ] Run the browser smoke test once to prove the new tests fail before implementation.
- [ ] Implement the two pure calculation helpers and export them through `Focus.Stats`.
- [ ] Re-run the affected smoke-test calculations and confirm each passes.
- [ ] Commit only task-owned engine/test hunks as `feat(analytics): add food habit and recovery calculations`.

## Task 2: Persist daily outcomes and preserve backup compatibility

**Files:**
- Modify `app/js/store.js`
- Test: `app/tests/smoke-test.html`

**Interfaces:**
- Consumes: ISO date string and `true`, `false`, or `null` status; backup `.settings.noJunkFoodLog` is optional.
- Produces: `Store.setNoJunkFoodDay(iso, status)` validates the calendar date, writes a boolean by ISO date or deletes the date for `null`, saves existing settings, and notifies listeners. `Store.importBackup` imports a backup log by filling missing keys only, so conflict-free restoration never deletes or overwrites a pre-existing local date.

- [ ] Add failing tests for invalid dates/statuses, save/edit/clear, exported backup inclusion, older backups without the key, and merge behavior where local values win conflicts.
- [ ] Implement a strict local ISO calendar-date validator and the store setter.
- [ ] Extend backup import to merge `settings.noJunkFoodLog` without replacing the current settings object or existing local outcomes.
- [ ] Run the smoke-test storage/backup cases and confirm they pass.
- [ ] Commit only task-owned Store/test hunks as `feat(data): persist daily food habit logs`.

## Task 3: Connect the goal controls and daily recording surfaces

**Files:**
- Modify `app/js/store.js` defaults if needed
- Modify `app/js/ui.js`
- Modify `app/js/app.js`
- Modify `app/css/app.css`
- Modify `Focus-Workout-Tracker.html` only if script URL versions need a bump
- Test: `app/tests/smoke-test.html`

**Interfaces:**
- Consumes: `settings.goals.avoidJunkFood` (default `true`) and `settings.noJunkFoodLog[iso]` (`true`, `false`, or absent); the action handler delegates persistence to `Store.setNoJunkFoodDay`.
- Produces: Dashboard today card and Calendar selected-day panel show labeled **No junk food**, **Junk food eaten**, or **Not logged**, buttons to choose either outcome, and a **Clear log** action when a result exists. Settings presents a labeled, accessible daily-goal toggle.

- [ ] Add tests for default-enabled goal setting, dashboard today controls, month day-panel controls, saving each choice, edit/clear, and UI-safe text labels.
- [ ] Implement delegated UI actions and rerender after persistence without leaving a stale selected date.
- [ ] Add theme-aware, responsive, keyboard-focus-visible styling matching the existing app.
- [ ] Add the Settings toggle while retaining all existing calorie/time/weekly goal semantics.
- [ ] Run the browser smoke test's UI controls and renders.
- [ ] Commit only task-owned hunks as `feat(goals): add daily no-junk-food tracking`.

## Task 4: Replace the duplicate Analytics heatmap and enrich month insight cards

**Files:**
- Modify `app/js/ui.js`
- Modify `app/css/app.css`
- Test: `app/tests/smoke-test.html`

**Interfaces:**
- Consumes: `Stats.foodHabitStats`, `Stats.trainingRecoveryStats`, existing monthly aggregates, settings log, and existing chart renderer.
- Produces: Analytics contains a monthly junk-food-day chart, a logged-day / avoidance-rate summary with an explicit denominator and unknown-state explanation, and a data-backed workout/rest insight; removes the `Consistency heatmap` and retains year comparisons and existing goals. Calendar's whole-month panel displays accurate workouts, distinct workout days, elapsed rest days, calories, available duration, best training insight, and food-goal outcome coverage.

- [ ] Add rendering assertions for absence of the Analytics heatmap, monthly junk-day chart, rate denominator, configured food goal, recovery values, and month-selected summary including current partial-month / no-log states.
- [ ] Remove only the Analytics heatmap output; retain Calendar's year-grid heatmap.
- [ ] Render the new Analytics and selected-month insights from shared Stats helpers, not duplicate calculations.
- [ ] Run relevant smoke-test UI cases, inspect both light/dark style tokens, and correct failures rather than weakening assertions.
- [ ] Commit only task-owned UI/CSS/test hunks as `feat(analytics): replace duplicate heatmap with habit insights`.

## Task 5: Correct Data metrics, document behavior, and verify complete UI

**Files:**
- Modify `app/js/ui.js`
- Modify `README.md`
- Modify `app/tests/smoke-test.html`
- Modify `app/js/version.js` only if task ownership is isolated

**Interfaces:**
- Produces: Data → Your Data labels counts as **Workout days** (unique workout dates) and **Resting days** (elapsed calendar dates in the represented historical range with no workout); there is no redundant Workouts metric in that group. Backup Status continues to show the complete record count.

- [ ] Test empty data and seeded data for distinct workout/resting day counts, and verify total records remain available in Backup Status.
- [ ] Update the user guide, backup compatibility notes, and offline smoke-test checklist.
- [ ] Run the full smoke test in a browser using the actual documented page; inspect test counts and failure output.
- [ ] Exercise Dashboard, Settings, Analytics, month and day Calendar, Data, and backup restore through their user-facing interfaces; check responsive layout/theme as practical.
- [ ] Review final diff and `git status`; commit only task-owned hunks as `feat(tracking): surface food goal and recovery insights`.
