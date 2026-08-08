# Focus-Workout-Tracker — Workout & Fitness Tracker

A **private, 100% offline** web application for tracking workouts, calories, body
measurements and yearly fitness statistics. It replaces the `Workout Calendar.xlsx`
spreadsheet with a modern dashboard, while still letting you export to Excel for
Google Sheets archiving.

**No installation. No accounts. No cloud. No internet required.**

---

## What it is

- 📊 **Dashboard** — how am I doing right now (week, month, year, streaks, goals, vs last year)
- 📅 **Calendar** — GitHub-style heatmap of workout days with intensity levels, a
  month view with a day panel, and subtle marking of your best day & current month
- 📏 **Progress** — weight, body fat, height, neck, waist, hips… any measurement,
  any frequency, plus a **Body composition** card that computes your current BMI
  (and estimated body fat % when you've recorded the needed measurements) from
  your latest records
- 📈 **Analytics** — compact charts: monthly workouts/calories/duration, cumulative
  lines, workout-type distribution, a consistency heatmap, and a **year-over-year
  comparison** (defaults to current vs previous year; hidden until you have data
  in two years)
- 💾 **Data & Backup** — human-friendly **Excel workbook** (`Overview`, `Workouts`,
  `Measurements`, `Monthly Summary`, `Yearly Summary`, `Analytics` + a hidden
  `_AppData` sheet that makes re-import perfectly exact), a local **PDF annual
  report**, a full-fidelity **JSON backup**, and CSV exports — with a safe import
  preview that adds & updates but never deletes
- 🧰 **Tools** — **BMI + body-fat calculator**: BMI from height & weight, plus an
  estimated **body fat %** (U.S. Navy circumference method, male/female formulas)
  once you add neck and waist (and hips for women) — with a combined
  BMI + body-fat interpretation (Very Athletic → Very High), a ⓘ explainer of
  the body-fat ranges, and a kg/lb/g/oz weight converter
- 🎯 **Goals** — set daily calorie / duration and weekly workout targets in
  Settings; watch them on the dashboard and calendar (gold ✓ on goal days)
- ⚙️ **Settings** — theme (dark/light), **accent color** (violet, orange, green,
  red, blue — recolors buttons, charts and the calendar heat), a **Motion** toggle
  for the subtle animations, weight unit (kg/lb), **body profile** (male/female,
  **height** and **age** — saved once and used by every BMI & body-fat estimate),
  goals, privacy & about

---

## How to start it

1. Copy the `WorkoutTracker` folder anywhere you like (USB stick, laptop, desktop).
2. Double-click **`Focus-Workout-Tracker.html`** — it opens in your browser (Chrome, Edge, Firefox, Safari).
3. Start using it.

That's it. There is no server, no build step, no terminal, no install.

> **About opening from `file://`** — everything works when opening `Focus-Workout-Tracker.html`
> directly, including storage, charts, PDF reports and Excel import/export. One
> browser note: storage lives in your browser's IndexedDB and is tied to how the
> browser treats the `file://` location — behavior varies (Chrome/Edge may keep
> data even if the folder moves; Firefox/Safari may tie it to the exact path). To
> be safe: keep the folder in a permanent spot, and before moving machines or
> clearing browser data, use **Export JSON backup** and import it on the other side.

---

## How data is stored

All data lives in your browser's **IndexedDB** — a real database built into every
modern browser, stored locally on your device. Nothing is sent anywhere.

- Every change saves **automatically**. There is no "Save" button.
- Storage is per-browser: Chrome/Edge data and Firefox data are separate.
  The app on your laptop is a different browser → use Export/Import to move data.

---

## How to back up & move to another computer

```
Computer A                 Computer B
   ↓                          ↑
Export JSON backup        Import JSON backup
   ↓                          ↑
USB / Google Drive / cloud storage
```

1. **Data → Export JSON backup** (`focus-backup-YYYY-MM-DD.json`).
   This is a complete snapshot: workouts, measurements, settings.
2. Move the file to the other computer.
3. Open the app there → **Data → Import JSON backup**.
4. Imports are deduplicated — importing twice never creates duplicates.

**Excel export** (`Data → Export Excel`) is a friendlier, spreadsheet-readable copy
with multiple sheets; JSON is the perfect byte-for-byte restore.

---

## How to use Google Sheets (archive workflow)

```
App → use all month → Export Excel → upload to Google Sheets → archive
Google Sheets → download as .xlsx → Import Excel in the app
```

- **To archive:** Export Excel, then drag it into Google Drive / open with Google
  Sheets. The workbook has clean, human-readable sheets (`Overview`, `Workouts`,
  `Measurements`, `Monthly Summary`, `Yearly Summary`, `Analytics`) that read
  perfectly in Sheets. Dates are real dates, headers are frozen with filters, and
  the final `_AppData` sheet (marked "do not edit") carries the internal record
  IDs and timestamps that make re-import exact.
- **To bring data back:** In Google Sheets, *File → Download → Microsoft Excel
  (.xlsx)*, then **Data → Import Excel** in the app.
- Import shows a **preview** (will add / will update / unchanged / invalid) before
  committing, and never deletes local records. Matching priority:
  1. **Stable ID** (from `_AppData`) → update if the content differs, skip if identical.
  2. **Identical content** (date + type + duration + calories, or the measurement
     equivalents) → skip.
  3. **Human-edit key** — if you changed the *calories/notes* (workouts) or
     *value/notes* (measurements) in Excel, the row is matched to the single record
     with the same date + type + duration (or unit) and reported as an **update**.
     Anything ambiguous is added as new — data is never silently overwritten.
- Dates: the app exports `YYYY-MM-DD`, so app→Sheets→app round-trips are never
  ambiguous. When reading other files, common formats are accepted and ambiguous
  `dd/mm` dates default to **day-first** (international / dd-mm-yyyy convention) —
  always visible in the import preview before you confirm.

### PDF report

**Data → Export PDF Report** builds a printable annual report locally in your
browser (no internet needed): a stats overview page, per-month charts for
workouts/calories/duration, a year-over-year comparison (only when the previous
year has data), and measurement trend lines (only for types with enough readings).
Pick the report year and optional comparison year, then **Export PDF**.

---

## How workouts work

- **Multiple workouts per day are allowed.** A day with 2 workouts shows both as
  compact side-by-side cards in the calendar day panel, and daily totals (kcal,
  duration, count) are summed automatically.
- **A workout can have several types.** Pick as many as you want from the chip
  picker (e.g. **Back + Biceps**): each one gets its own colored badge, and
  Analytics counts them separately. Custom types are supported too.
- Preset types: **Back, Chest, Legs, Biceps, Triceps, Forearms, Abs, Cardio** —
  plus **➕ custom** types. (Old "Other"/"Strength" records keep their styling.)
- A **workout day** = a calendar day with at least one workout. For streaks,
  2 workouts on the same day still count as **one** workout day.
- **Current streak**: consecutive workout days ending today — or yesterday if
  today has no workout yet (the streak is still alive until today ends).
- Entry requires only **date + type**. Duration, calories and notes are optional —
  e.g. `Aug 7 · Walking · 250 kcal` with no duration is perfectly fine.
- Use **⚡ Quick add** on the Dashboard (switch to the 📏 Measurement tab to
  log weight/waist/etc.), the **+ Add Workout** button anywhere, or click a
  day on the calendar to add for that exact date.
- The measurement quick-add and the day panel also offer **+ Add measurement**,
  prefilled with the date you picked.
- Negative values and invalid dates are rejected; optional fields stay blank.

## How measurements work

- Measurements are **completely date-based** — record them daily, weekly,
  monthly, or whenever: `Aug 1`, `Aug 12`, `Aug 27` is just as valid as
  `Aug 1 · Sep 18 · Nov 3`.
- Built-in types: Weight, Body Fat %, Height, Neck, Waist, Chest, Hips, Arm,
  Thigh — plus **custom measurements** and custom units.
- For each type the app computes First, Latest, Change, % Change, Average,
  Lowest, Highest, and a trend — **only from records that actually exist**.
  No fake "monthly" assumptions. Low data just shows fewer stats.

## How BMI & body fat work

- **BMI** = weight (kg) ÷ height (m)², categorised with the WHO bands. It needs
  only a Height and a Weight. **Height lives in Settings** (it barely changes) —
  a recorded Height measurement is used only as a fallback.
- **Estimated body fat** uses the **U.S. Navy / Hodgdon circumference method**
  (men: waist & neck; women: waist, hips & neck — all vs height). It appears
  only when every required measurement is present; until then the UI tells you
  exactly which one to add. Never a diagnosis — it's ±3–4% for most adults.
- The two are read together: body fat is the primary signal and BMI modulates
  the wording, so a high BMI with low body fat reads **"Very Athletic /
  Muscular"** rather than overweight.
- The **Tools** calculator prefills from your latest recorded measurements, and
  the **Progress** view's *Body composition* card computes the same numbers
  from your stored records — you never enter the same data twice.

## How yearly comparisons work

- The year picker (‹ 2026 ›) switches any view to any year — past or future,
  with or without data.
- **Dashboard** shows your year vs the previous year.
- **Analytics** lets you compare **any two years** (2026 vs 2024, 2025 vs 2023…):
  per-month side-by-side bars and cumulative calorie lines, plus totals with
  differences and percentages. The comparison section only appears when both
  years actually have data.

---

## Data model

**Workout** — `type` holds one or more comma-separated types.
```javascript
{
  id: "id-…",              // unique, stable
  date: "2026-08-07",      // YYYY-MM-DD
  type: "Back, Biceps",    // one or more types (normalized, sorted)
  duration: 45,            // minutes, optional
  calories: 420,           // optional
  notes: "",               // optional
  createdAt: "…", updatedAt: "…"
}
```

**Measurement**
```javascript
{
  id: "id-…",
  date: "2026-08-01",
  type: "Weight",
  value: 79.8,
  unit: "kg",
  notes: "",
  createdAt: "…", updatedAt: "…"
}
```

Years are discovered automatically from the data; you can also step into any
year with the arrows. The exported Excel keeps the human sheet clean
(`Date, Workout Type, Duration (min), Calories, Notes`) and moves internal
fields (IDs, timestamps, schema version) into the `_AppData` sheet, so
export → import round-trips are **byte-for-byte identical** (verified by the
automated smoke test).

---

## Your historical data (Workout Calendar.xlsx)

On **first launch**, the app automatically loads your history from
`Workout Calendar.xlsx` — **92 workouts (61,005 kcal, Jan–Aug 2026)** and
**58 body measurements** — so the dashboard lights up immediately with real data.
You can re-import it any time via *Data → Restore built-in historical data*
(fully deduplicated, so nothing is ever duplicated).

### Assumptions made when reading the workbook

The workbook stores calories by overwriting a day cell in a yearly grid, so:

1. **Each calendar day with a calorie number = one workout** on that date, with
   those calories. The workbook records no workout type or duration, so every
   imported workout is typed **"Other"** with duration left blank. You can edit
   any workout later to add types, durations or notes.
2. The **"Workout Calendar" sheet is an empty template** (all zeros) and was
   ignored; all data came from the **"2026"** sheet.
3. **Measurements** are recorded weekly as *Cintura (waist, cm)* and *Peso
   (weight, lb)*. The workbook only notes "week number + month", so dates were
   mapped to the **1st, 8th, 15th, 22nd** of each month (the 1st for each
   month's first week). If you want exact dates, edit or re-enter them in the
   Progress view — or just delete the seeded rows and import your own.
4. Calories were verified against the workbook's own totals:
   `92 days · 61,005 kcal · monthly sums all match`.

---

## Privacy

**Focus-Workout-Tracker never sends data anywhere.** There are no analytics, no
telemetry, no external requests — the entire app (including the Excel and PDF
libraries and every chart) is bundled in this folder and runs from your own
files. You can disconnect the internet completely and everything keeps working.

---

## Offline test checklist

- [x] Dashboard renders with your year's stats
- [x] Add a workout (also 2+ on the same day, also with multiple types) → totals update instantly
- [x] Edit / delete a workout (delete asks for confirmation)
- [x] Add a historical workout from a previous year
- [x] Add, edit and delete a measurement
- [x] Switch years, view calendar, drill into a month and a day
- [x] Day panel shows multiple workouts as horizontal cards
- [x] Compare any two years in Analytics
- [x] Export Excel — opens in Excel & Google Sheets; re-import → "0 new" (duplicates detected, multi-type records preserved)
- [x] Export PDF report for a year with data
- [x] Export JSON backup, reset, import backup → everything restored
- [x] Dark / light mode, accent color and motion toggle (all remembered between sessions)
- [x] Close the browser, reopen `Focus-Workout-Tracker.html` → data is still there
- [x] Works with the network cable unplugged

A repeatable automated smoke test lives at `app/smoke-test.html` — open it in a
browser and it prints pass/fail for dozens of checks against the core logic,
including the exact Excel round-trip.

Exports and imports live in the **`data/`** folder — see `data/README.md`.

---

## Project layout

```
WorkoutTracker/
├── Focus-Workout-Tracker.html  ← open this
├── README.md
├── app/                  ← everything the app needs, in one folder
│   ├── app.css           ← design system, light + dark themes, accents, motion
│   ├── app.js            ← bootstrap & wiring
│   ├── charts.js         ← SVG charts (zero dependencies)
│   ├── excel.js          ← .xlsx/.csv import & export (styled workbook)
│   ├── pdf.js            ← local PDF annual report builder
│   ├── seed-data.js      ← your historical data, embedded
│   ├── stats.js          ← streaks, monthly/yearly, comparisons
│   ├── store.js          ← IndexedDB persistence + dedup + multi-type normalize
│   ├── ui.js             ← all views & dialogs
│   ├── smoke-test.html   ← optional automated checks
│   ├── lib/jspdf.umd.min.js ← PDF library, bundled locally (no CDN)
│   └── xlsx.full.min.js  ← SheetJS, bundled locally (no CDN)
└── data/                 ← keep your Excel/JSON exports & imports here
```
