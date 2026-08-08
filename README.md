# Focus — Workout & Fitness Tracker

A **private, 100% offline** web application for tracking workouts, calories, body
measurements and yearly fitness statistics. It replaces the `Workout Calendar.xlsx`
spreadsheet with a modern dashboard, while still letting you export to Excel for
Google Sheets archiving.

**No installation. No accounts. No cloud. No internet required.**

---

## What it is

- 📊 **Dashboard** — how am I doing right now (month, year, streaks, vs last year)
- 📅 **Calendar** — GitHub-style heatmap of workout days with intensity levels
- 🧾 **Log** — a single timeline of every workout and measurement, with search
  and inline edit/delete
- 📏 **Progress** — weight, body fat, waist, hips… any measurement, any frequency
- 📈 **Analytics** — 10+ charts: monthly bars, cumulative lines, type mix,
  consistency heatmap, and full **year-over-year comparison**
- 💾 **Data** — Excel / JSON / CSV export, smart import, backup & restore
- ⚙️ **Settings** — theme, default weight unit (kg/lb), privacy & about

---

## How to start it

1. Copy the `WorkoutTracker` folder anywhere you like (USB stick, laptop, desktop).
2. Double-click **`index.html`** — it opens in your browser (Chrome, Edge, Firefox, Safari).
3. Start using it.

That's it. There is no server, no build step, no terminal, no install.

> **About opening from `file://`** — everything works when opening `index.html`
> directly, including storage, charts and Excel import/export. One browser note:
> storage lives in your browser's IndexedDB and is tied to how the browser treats
> the `file://` location — behavior varies (Chrome/Edge may keep data even if the
> folder moves; Firefox/Safari may tie it to the exact path). To be safe: keep the
> folder in a permanent spot, and before moving machines or clearing browser data,
> use **Export JSON backup** and import it on the other side.

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
  Sheets. The workbook has clean sheets (`Workouts`, `Measurements`,
  `Monthly Stats`, `Yearly Stats`, `Summary`) that read perfectly in Sheets.
- **To bring data back:** In Google Sheets, *File → Download → Microsoft Excel
  (.xlsx)*, then **Data → Import Excel** in the app.
- Import shows a **preview** (will add / will update / unchanged / invalid) before
  committing, and never duplicates existing records. Matching is by stable ID
  when present, otherwise by **date + type + duration + calories** (workouts) or
  **date + type + value + unit** (measurements).
- Records that match an existing ID but have **different content** (e.g. you
  edited a Notes cell in Google Sheets) are reported as **updates** — confirm the
  preview and your edits sync back into the app.
- Dates: the app exports `YYYY-MM-DD`, so app→Sheets→app round-trips are never
  ambiguous. When reading other files, common formats are accepted and ambiguous
  `dd/mm` dates default to **day-first** (international / dd-mm-yyyy convention) —
  always visible in the import preview before you confirm.

---

## How workouts work

- **Multiple workouts per day are allowed.** A day with 2 workouts shows both,
  and daily totals (kcal, duration, count) are summed automatically.
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
- Built-in types: Weight, Body Fat %, Chest, Waist, Hips, Arm, Thigh — plus
  **custom measurements** and custom units.
- For each type the app computes First, Latest, Change, % Change, Average,
  Lowest, Highest, and a trend — **only from records that actually exist**.
  No fake "monthly" assumptions. Low data just shows fewer stats.

## How yearly comparisons work

- The year picker (‹ 2026 ›) switches any view to any year — past or future,
  with or without data.
- **Dashboard** shows your year vs the previous year.
- **Analytics** lets you compare **any two years** (2026 vs 2024, 2025 vs 2023…):
  per-month side-by-side bars, cumulative calorie lines, and a month-by-month
  "who's ahead?" block diagram, plus totals with differences and percentages.

---

## Data model

**Workout**
```javascript
{
  id: "id-…",              // unique, stable
  date: "2026-08-07",      // YYYY-MM-DD
  type: "Strength",        // any text (custom types allowed)
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
year with the arrows. Exported Excel uses the same flat structure
(`ID, Date, Year, Month, Workout Type, Duration, Calories, Notes, …`).

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

**Focus never sends data anywhere.** There are no analytics, no telemetry, no
external requests — the entire app (including the Excel library and every chart)
is bundled in this folder and runs from your own files. You can disconnect the
internet completely and everything keeps working.

---

## Offline test checklist

- [x] Dashboard renders with your year's stats
- [x] Add a workout (also 2+ on the same day) → totals update instantly
- [x] Edit / delete a workout (delete asks for confirmation)
- [x] Add a historical workout from a previous year
- [x] Add, edit and delete a measurement
- [x] Switch years, view calendar, drill into a month and a day
- [x] Compare any two years in Analytics
- [x] Export Excel — opens in Excel & Google Sheets
- [x] Import the exported Excel back → "0 new" (duplicates detected)
- [x] Export JSON backup, reset, import backup → everything restored
- [x] Dark / light mode switch (remembered between sessions)
- [x] Close the browser, reopen `index.html` → data is still there
- [x] Works with the network cable unplugged

A repeatable automated smoke test lives at `app/smoke-test.html` — open it in a
browser and it prints pass/fail for dozens of checks against the core logic.

Exports and imports live in the **`data/`** folder — see `data/README.md`.

---

## Project layout

```
WorkoutTracker/
├── index.html            ← open this
├── README.md
├── app/                  ← everything the app needs, in one folder
│   ├── app.css           ← design system, light + dark themes
│   ├── app.js            ← bootstrap & wiring
│   ├── charts.js         ← SVG charts (zero dependencies)
│   ├── excel.js          ← .xlsx/.csv import & export
│   ├── seed-data.js      ← your historical data, embedded
│   ├── stats.js          ← streaks, monthly/yearly, comparisons
│   ├── store.js          ← IndexedDB persistence + dedup
│   ├── ui.js             ← all views & dialogs
│   ├── smoke-test.html   ← optional automated checks
│   └── xlsx.full.min.js  ← SheetJS, bundled locally (no CDN)
└── data/                 ← keep your Excel/JSON exports & imports here
```
