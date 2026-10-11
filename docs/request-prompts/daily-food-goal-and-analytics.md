# Implementation Prompt: Daily No-Junk-Food Goal and Fitness Analytics Refinement

You are working in **Focus — Workout & Fitness Tracker**, a private, offline-first static web app. Before making any code change, inspect the repository layout, current data flow, persistence model, analytics calculations, UI composition, styling conventions, smoke-test coverage, versioning workflow, and Git working-tree state. Treat pre-existing local modifications and user data as user-owned: preserve them, do not overwrite them, and do not include them in commits unless they were created for this task and can be isolated safely.

## Product context and constraints

- This app runs locally in a browser with no server, cloud, account, telemetry, or runtime network dependency.
- Persist user-entered data in the app's existing IndexedDB/settings and backup model; do not add a remote service or a new third-party dependency.
- Keep the existing Focus visual language, responsive layout, light/dark themes, keyboard interaction, and reduced-motion behavior.
- Reuse the established pure-calculation pattern in the analytics engine and the app's existing rendering/action delegation patterns.
- Keep this work focused: a daily food-habit goal, meaningful analytics in place of a duplicate heatmap, useful selected-month insights, and correction of redundant Data summary terminology.

## Required behavior

### 1. Daily no-junk-food goal and habit log

- Add **Avoid junk food** as a first-class daily goal, enabled by default and configurable with the existing Goals controls.
- Let the user record a date-specific outcome with three choices: **No junk food** (avoided all day), **Some junk food** (ate a little, but not a full junk-food day), and **Junk-food day** (ate junk food as a full day outcome). Provide a clear unlogged state and a way to clear/correct an entry. Do not conflate the partial outcome with either fully avoided or a full junk-food day.
- Make today's status easy to record from the Dashboard. Make any date easy to record or edit from Calendar's selected-day panel. Keep all controls accessible by keyboard and with clear accessible names/status text.
- Persist the date-keyed status locally and include it in the app's existing JSON backup/restore data model. Existing backups without this field must continue loading safely. Imported records must not accidentally erase existing habit logs.
- Treat one date as at most one habit outcome regardless of how many workouts exist on it.

### 2. Shared habit analytics engine

- Implement reusable, deterministic pure calculations following the existing analytics-engine conventions (no DOM, storage, or current-date dependence unless a date is passed explicitly).
- Calculate monthly/yearly outcomes from explicitly logged dates: fully avoided days, partial junk-food days, full junk-food days, logged days, unlogged days, and full-avoidance rate (`No junk food days / logged days`, or null when there are no logged dates).
- A partial day counts as a logged outcome, but not as a no-junk-food success or a full junk-food day. Report it separately rather than hiding it inside either category.
- Handle month boundaries, leap years, future dates, duplicate workout dates, empty periods, and partial months without counting unlogged dates as failures. Provide trend/comparison values that remain interpretable for months with different numbers of logged days.
- Reuse the engine in Analytics, the month-summary card, and Dashboard rather than duplicating business rules inside renderers.

### 3. Analytics redesign

- Remove the **Consistency heatmap** from Analytics; the Calendar remains the sole place for that heatmap.
- Use the vacated space for distinct, actionable analytics instead of a duplicate calendar visualization. At minimum show a month-by-month view that distinguishes full and partial junk-food days, plus a clear logged-day/full-avoidance-rate summary. Use a legend and wording that does not imply unknown dates are successes or failures.
- Add one additional useful training/recovery insight (for example workout-day frequency, rest-day count, longest gap between workout days, or a training/recovery ratio) only where supported by stored data and calculated through reusable pure logic.
- Keep configured daily goal tracking visible in Analytics alongside calorie and duration goal hit rates. The no-junk-food goal should show its outcome/avoidance rate, explicitly identify its denominator (logged days), and distinguish no log from partial and full junk-food days.
- Retain the existing charts and year-selection/year-comparison behavior; keep layouts professional and responsive in both themes.

### 4. Calendar selected-month insights

- When Calendar is showing a whole month (no individual day selected), enrich its right-side month card with compact, useful facts based on that exact selected month: workouts, distinct workout days, rest days for elapsed/completed dates, calories, duration where available, best workout day or training streak, and food outcomes broken down into avoided, partial, and full junk-food days when the goal/log data exists.
- For a current partial month, do not count future dates as rest days or as missing/unlogged habit entries. Label habit denominators and leave unsupported values as “—” or an honest empty state.
- Keep the selected-day drill-in behavior intact and ensure the summary card returns when the user clears the selected day.

### 5. Data summary terminology

- In **Data → Your Data**, replace the redundant **Workouts** count with **Resting days** (count distinct calendar dates with no workout in the selected/full historical period, with the period definition clear) and keep **Workout days** as its own metric.
- Do not display the number of workout records as if it were the same metric as distinct workout days. Preserve the total workout-record count elsewhere where it is genuinely useful (for example, Backup Status records stored).
- Ensure the displayed values and labels are numerically and semantically correct, including an empty dataset.

## Implementation and quality requirements

1. First inspect the actual app structure and current worktree; document findings before edits.
2. Save this prompt and a task-by-task implementation plan in the repository's documentation area.
3. Implement the change in small, reviewable, independently testable increments. Add or extend the existing browser smoke tests for pure calculations, persistence/backup compatibility, UI rendering, date logging/edit/clear behavior, analytics, and empty/partial-period cases.
4. Do not weaken existing assertions or tests. Keep versioning consistent with the project's `tools/bump-version.py` workflow without committing incidental state files.
5. Run the complete smoke test through its real browser interface (the app's documented test page), inspect failures, and verify the actual Dashboard, Settings, Analytics, Calendar month summary, and Data views in both a normal/light or dark presentation as practical.
6. Review the diff before each requested granular commit. Commit only files/hunks created for this task; preserve and leave pre-existing unrelated or ambiguous user edits and data backups untouched. Use concise Conventional Commit messages with the repository's required Codebuff footer.

## Acceptance checklist

- A user can configure the no-junk-food daily goal and explicitly record **No junk food**, **Some junk food**, or **Junk-food day** for today or a past calendar date, then correct or clear the outcome.
- Partial junk-food days are counted as logged but kept separate from full junk-food days and no-junk-food successes.
- Unlogged dates remain unknown and are never counted as clean or junk-food days.
- The status survives app reload and JSON backup/restore while older backup files remain compatible.
- Analytics has no Consistency heatmap, shows meaningful monthly full/partial junk-food counts with explicit logged-day denominators, and includes a second supported training/recovery analysis.
- Calendar's whole-month card contains accurate month-specific metrics and full/partial/avoided food outcomes, while partial months exclude future dates.
- Data → Your Data presents distinct **Resting days** and **Workout days**, not duplicate workout totals.
- Existing styling, offline behavior, existing features, and smoke tests remain intact; the complete smoke suite and browser-facing checks pass.
