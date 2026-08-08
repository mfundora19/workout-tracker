/* =========================================================================
 * Focus.Excel — .xlsx / .csv import & export (SheetJS bundled locally)
 * -------------------------------------------------------------------------
 * The workbook is designed for humans first:
 *   Overview | Workouts | Measurements | Monthly Summary | Yearly Summary |
 *   Analytics | _AppData
 * The first six sheets carry no internal fields (no IDs, no timestamps).
 * `_AppData` (always the LAST sheet) holds everything needed to restore the
 * application's data with perfect fidelity: stable IDs, Created At /
 * Updated At, and a schema version.
 *
 * Import:
 *   - If `_AppData` exists and parses, it is authoritative (exact restore).
 *   - Otherwise the human Workouts / Measurements sheets are used; records
 *     are matched by stable ID when present, then by identical content, then
 *     by date+type+duration (workouts) / date+type+unit (measurements) so a
 *     human edit of Calories or Notes still updates the right record.
 * ========================================================================= */
(function () {
  "use strict";
  const S = window.Focus.Stats;

  const SCHEMA_VERSION = "1.0";

  /* Palette for the workbook (RGB without '#'). */
  const C = {
    accent: "6366F1", accent2: "8B5CF6", dark: "2A2E44", muted: "6B7280",
    light: "F3F4FB", white: "FFFFFF", danger: "D64545", success: "10B981",
    grid: "E5E7F0"
  };

  const STYLE_HEADER = {
    font: { bold: true, color: { rgb: C.white }, sz: 11 },
    fill: { patternType: "solid", fgColor: { rgb: C.accent } },
    alignment: { vertical: "center" }
  };
  const STYLE_SECTION = {
    font: { bold: true, color: { rgb: C.accent2 }, sz: 12 },
    alignment: { vertical: "center" }
  };
  const STYLE_BAND = { fill: { patternType: "solid", fgColor: { rgb: C.light } } };
  const STYLE_MUTED = { font: { color: { rgb: C.muted }, sz: 10 } };
  const STYLE_BOLD_MUTED = { font: { bold: true, color: { rgb: C.muted }, sz: 10 } };
  const STYLE_META_KEY = { font: { bold: true, sz: 10 }, alignment: { horizontal: "left" } };
  const STYLE_TITLE = {
    font: { bold: true, color: { rgb: C.white }, sz: 16 },
    fill: { patternType: "solid", fgColor: { rgb: C.dark } },
    alignment: { vertical: "center" }
  };

  /* ---------------- low-level helpers ---------------- */

  function cell(ws, r, c) { return ws[XLSX.utils.encode_cell({ r, c })]; }

  /** Apply styling + column layout to a plain aoa sheet. */
  function decorate(ws, aoa, opts = {}) {
    for (let r = 0; r < aoa.length; r++) {
      for (let c = 0; c < aoa[r].length; c++) {
        const x = cell(ws, r, c);
        if (!x) continue;
        let s = {};
        if (opts.headerRow != null && r === opts.headerRow) s = STYLE_HEADER;
        else if (opts.bandRows && opts.headerRow != null && r > opts.headerRow && (r - opts.headerRow) % 2 === 0) s = STYLE_BAND;
        if (opts.right && opts.right.includes(c)) s.alignment = { horizontal: "right", vertical: "center" };
        if (opts.left && opts.left.includes(c)) s.alignment = { horizontal: "left", vertical: "center" };
        if (opts.numFmt && opts.numFmt[c] != null) x.z = opts.numFmt[c];
        if (Object.keys(s).length) x.s = s;
      }
    }
    if (opts.widths) ws["!cols"] = opts.widths.map((w) => ({ wch: w }));
    if (opts.freeze) ws["!freeze"] = { x: 0, y: opts.freeze };
    if (opts.filter && aoa.length > 1) {
      ws["!autofilter"] = { ref: "A1:" + XLSX.utils.encode_cell({ r: aoa.length - 1, c: aoa[0].length - 1 }) };
    }
  }

  /** Convert a YYYY-MM-DD string column into real Excel date cells. */
  function dateCol(ws, aoa, col = 0) {
    for (let r = 1; r < aoa.length; r++) {
      const iso = aoa[r][col];
      if (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        ws[XLSX.utils.encode_cell({ r, c: col })] = { t: "d", v: new Date(iso + "T00:00:00") };
      }
    }
  }

  function num(v) { return v == null || v === "" ? "" : v; }
  function fmt1(v) { return v == null || !isFinite(v) ? "" : +v.toFixed(1); }

  /* ---------------- export ---------------- */

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const years = S.availableYears(Focus.Store.workouts, Focus.Store.measurements);
    const selYear = Focus.Store.settings.selectedYear;
    // availableYears returns insertion order, so the "latest year" must be
    // derived numerically — years[years.length-1] is NOT the maximum.
    const year = years.includes(selYear) ? selYear : Math.max(...years);

    XLSX.utils.book_append_sheet(wb, sheetOverview(years, year), "Overview");
    XLSX.utils.book_append_sheet(wb, sheetWorkouts(), "Workouts");
    XLSX.utils.book_append_sheet(wb, sheetMeasurements(), "Measurements");
    XLSX.utils.book_append_sheet(wb, sheetMonthly(years), "Monthly Summary");
    XLSX.utils.book_append_sheet(wb, sheetYearly(years), "Yearly Summary");
    XLSX.utils.book_append_sheet(wb, sheetAnalytics(years, year), "Analytics");
    XLSX.utils.book_append_sheet(wb, sheetAppData(), "_AppData");

    wb.Workbook = { Views: [{ RTL: false }] };
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
    return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  /* ----- Overview ----- */

  function sheetOverview(years, year) {
    const w = Focus.Store.workouts;
    const ys = S.yearlyStats(w, year);
    const st = S.streaks(w, S.todayISO());
    const aoa = [];
    const sectionRows = [];
    const headerRows = [];

    aoa.push(["Focus — Workout & Fitness Tracker"]);
    aoa.push(["Year: " + year + "   ·   Exported " + S.prettyDate(S.todayISO())]);
    aoa.push([]);
    headerRows.push(aoa.length);
    aoa.push(["Metric", "Value"]);
    aoa.push(["Total Workouts", ys.workouts]);
    aoa.push(["Workout Days", ys.days]);
    aoa.push(["Total Calories", ys.calories]);
    aoa.push(["Total Duration (min)", ys.duration]);
    aoa.push(["Avg Calories / Workout", fmt1(ys.avgCal)]);
    aoa.push(["Avg Duration / Workout (min)", fmt1(ys.avgDur)]);
    aoa.push(["Current Streak (days)", st.current]);
    aoa.push(["Longest Streak (days)", ys.longestStreak]);
    aoa.push(["Best Month", ys.bestMonth ? ys.bestMonth.label : ""]);
    aoa.push(["Measurements", Focus.Store.measurements.length]);
    aoa.push([]);
    sectionRows.push(aoa.length);
    aoa.push(["By Year", "", "Workouts", "Days", "Calories", "Duration (min)"]);
    const byYearHeader = aoa.length;
    headerRows.push(byYearHeader);
    aoa.push(["Year", "", "Workouts", "Workout Days", "Calories", "Duration (min)"]);
    [...years].sort((a, b) => b - a).forEach((y) => {
      const s = S.yearlyStats(w, y);
      aoa.push([y, "", s.workouts, s.days, s.calories, s.duration]);
    });
    aoa.push([]);
    sectionRows.push(aoa.length);
    aoa.push(["About this workbook"]);
    const aboutStart = aoa.length;
    aoa.push(["Editable:", "Workouts, Measurements — add or change rows and re-import."]);
    aoa.push(["Generated:", "Overview, Monthly Summary, Yearly Summary, Analytics — derived from your records."]);
    aoa.push(["Application Data:", "_AppData — internal sheet, do not edit manually."]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }
    ];
    sectionRows.forEach((sr) => merges.push({ s: { r: sr, c: 0 }, e: { r: sr, c: 1 } }));
    ws["!merges"] = merges;

    decorate(ws, aoa, {
      widths: [26, 16, 11, 11, 12, 15],
      headerRow: 3,
      bandRows: true,
      left: [0, 2],
      right: [1, 3, 4, 5],
      numFmt: { 1: "#,##0", 3: "#,##0", 4: "#,##0", 5: "#,##0" }
    });
    Object.assign(cell(ws, 0, 0), { s: STYLE_TITLE });
    Object.assign(cell(ws, 1, 0), { s: { font: { color: { rgb: C.muted }, sz: 10 } } });
    sectionRows.forEach((sr) => Object.assign(cell(ws, sr, 0), { s: STYLE_SECTION }));
    headerRows.forEach((hr) => Object.assign(cell(ws, hr, 0), { s: STYLE_HEADER }));
    for (let c = 2; c <= 5; c++) Object.assign(cell(ws, byYearHeader, c), { s: STYLE_HEADER });
    for (let r = aboutStart; r < aoa.length; r++) {
      Object.assign(cell(ws, r, 0), { s: STYLE_BOLD_MUTED });
      Object.assign(cell(ws, r, 1), { s: STYLE_MUTED });
    }
    return ws;
  }

  /* ----- Workouts (human) ----- */

  function sheetWorkouts() {
    const aoa = [["Date", "Workout Type", "Duration (min)", "Calories", "Notes"]];
    Focus.Store.workouts.forEach((w) => {
      aoa.push([w.date, w.type, num(w.duration), num(w.calories), w.notes || ""]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    dateCol(ws, aoa, 0);
    decorate(ws, aoa, {
      widths: [15, 16, 14, 11, 40],
      headerRow: 0,
      bandRows: true,
      right: [2, 3],
      numFmt: { 0: "mmm d, yyyy", 2: "#,##0", 3: "#,##0" },
      freeze: 1,
      filter: true
    });
    return ws;
  }

  /* ----- Measurements (human) ----- */

  function sheetMeasurements() {
    const aoa = [["Date", "Measurement", "Value", "Unit", "Notes"]];
    Focus.Store.measurements.forEach((m) => {
      aoa.push([m.date, m.type, m.value, m.unit || "", m.notes || ""]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    dateCol(ws, aoa, 0);
    decorate(ws, aoa, {
      widths: [15, 15, 11, 9, 40],
      headerRow: 0,
      bandRows: true,
      right: [2],
      numFmt: { 0: "mmm d, yyyy", 2: "0.0" },
      freeze: 1,
      filter: true
    });
    return ws;
  }

  /* ----- Monthly Summary (generated report) ----- */

  function sheetMonthly(years) {
    const aoa = [["Year", "Month", "Workouts", "Workout Days", "Rest Days", "Calories", "Duration (min)", "Avg Calories/Workout", "Avg Duration/Workout", "Longest Streak"]];
    years.forEach((y) => {
      S.monthlyStats(Focus.Store.workouts, y).forEach((m) => {
        aoa.push([y, m.label, m.workouts, m.days, m.restDays, m.calories, m.duration,
          fmt1(m.avgCal), fmt1(m.avgDur), m.bestStreak]);
      });
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    decorate(ws, aoa, {
      widths: [7, 8, 10, 12, 10, 11, 14, 19, 21, 14],
      headerRow: 0,
      bandRows: true,
      right: [2, 3, 4, 5, 6, 7, 8, 9],
      numFmt: { 5: "#,##0", 6: "#,##0", 7: "0.0", 8: "0.0" },
      freeze: 1,
      filter: true
    });
    return ws;
  }

  /* ----- Yearly Summary (generated report) ----- */

  function sheetYearly(years) {
    const aoa = [["Year", "Workouts", "Workout Days", "Calories", "Duration (min)", "Avg Calories/Workout", "Avg Workouts/Month", "Best Month", "Longest Streak"]];
    [...years].sort((a, b) => a - b).forEach((y) => {
      const st = S.yearlyStats(Focus.Store.workouts, y);
      aoa.push([y, st.workouts, st.days, st.calories, st.duration, fmt1(st.avgCal),
        fmt1(st.avgWorkoutsPerMonth), st.bestMonth ? st.bestMonth.label : "", st.longestStreak]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    decorate(ws, aoa, {
      widths: [7, 10, 12, 11, 14, 19, 18, 12, 14],
      headerRow: 0,
      bandRows: true,
      right: [1, 2, 3, 4, 5, 6, 8],
      numFmt: { 3: "#,##0", 4: "#,##0", 5: "0.0", 6: "0.0" },
      freeze: 1,
      filter: true
    });
    return ws;
  }

  /* ----- Analytics (reporting sheet) ----- */

  function sheetAnalytics(years, year) {
    const w = Focus.Store.workouts;
    const ms = S.monthlyStats(w, year);
    const aoa = [];
    const sections = [];   // row index of each section-title row
    const headers = [];    // row index of each block header row
    const numFmts = [];    // [rowStart, rowEndExclusive, col, format]

    const pushSection = (title, headerRow) => {
      sections.push(aoa.length);
      aoa.push([title]);
      headers.push(aoa.length);
      aoa.push(headerRow);
      return aoa.length;
    };
    const pushMonthRows = (fn) => ms.forEach((m) => aoa.push(fn(m)));

    aoa.push(["Analytics — " + year]);
    aoa.push([]);

    let start = pushSection("Calories by month", ["Month", "Calories"]);
    pushMonthRows((m) => [m.label, m.calories]);
    numFmts.push([start, aoa.length, 1, "#,##0"]);
    aoa.push([]);

    start = pushSection("Workouts by month", ["Month", "Workouts"]);
    pushMonthRows((m) => [m.label, m.workouts]);
    numFmts.push([start, aoa.length, 1, "#,##0"]);
    aoa.push([]);

    start = pushSection("Duration by month (min)", ["Month", "Duration"]);
    pushMonthRows((m) => [m.label, m.duration]);
    numFmts.push([start, aoa.length, 1, "#,##0"]);
    aoa.push([]);

    start = pushSection("Cumulative — calories & workouts", ["Month", "Calories (cumulative)", "Workouts (cumulative)"]);
    let cCal = 0, cWk = 0;
    ms.forEach((m) => { cCal += m.calories; cWk += m.workouts; aoa.push([m.label, cCal, cWk]); });
    numFmts.push([start, aoa.length, 1, "#,##0"], [start, aoa.length, 2, "#,##0"]);
    aoa.push([]);

    start = pushSection("Workout type distribution — " + year, ["Type", "Workouts", "% of total"]);
    S.typeBreakdown(w, year).forEach((t) => aoa.push([t.type, t.count, t.pct]));
    // pct from typeBreakdown is 0-100, so use a literal % sign (no scaling).
    numFmts.push([start, aoa.length, 1, "#,##0"], [start, aoa.length, 2, '0.0"%"']);
    aoa.push([]);

    start = pushSection("Measurement trends — all years", ["Date", "Measurement", "Value", "Unit"]);
    Focus.Store.measurements.forEach((m) => aoa.push([m.date, m.type, m.value, m.unit || ""]));
    numFmts.push([start, aoa.length, 2, "0.0"]);
    aoa.push([]);

    start = pushSection("Year comparison", ["Year", "Workouts", "Workout Days", "Calories", "Duration (min)"]);
    [...years].sort((a, b) => b - a).forEach((y) => {
      const st = S.yearlyStats(w, y);
      aoa.push([y, st.workouts, st.days, st.calories, st.duration]);
    });
    numFmts.push([start, aoa.length, 2, "#,##0"], [start, aoa.length, 3, "#,##0"], [start, aoa.length, 4, "#,##0"]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    dateCol(ws, aoa, 0);

    // Merges are computed from the tracked row indexes, so the variable-length
    // type-distribution and measurement blocks never misalign the layout.
    const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    sections.forEach((sr) => merges.push({ s: { r: sr, c: 0 }, e: { r: sr, c: 4 } }));
    ws["!merges"] = merges;

    Object.assign(cell(ws, 0, 0), { s: STYLE_TITLE });
    sections.forEach((sr) => Object.assign(cell(ws, sr, 0), { s: STYLE_SECTION }));
    headers.forEach((hr) => Object.assign(cell(ws, hr, 0), { s: STYLE_HEADER }));
    numFmts.forEach(([r0, r1, c, fmt]) => {
      for (let r = r0; r < r1; r++) {
        const x = cell(ws, r, c);
        if (x && x.t !== "s") x.z = fmt;
      }
    });
    ws["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }];
    return ws;
  }

  /* ----- _AppData (internal, authoritative for import) ----- */

  function sheetAppData() {
    const aoa = [];
    aoa.push(["INTERNAL APPLICATION DATA — DO NOT EDIT"]);
    aoa.push([]);
    aoa.push(["Schema Version", SCHEMA_VERSION]);
    aoa.push(["Application", "Focus"]);
    aoa.push(["Export Date", new Date().toISOString()]);
    aoa.push([]);
    aoa.push(["[Workouts]"]);
    aoa.push(["ID", "Date", "Workout Type", "Duration (min)", "Calories", "Notes", "Created At", "Updated At"]);
    Focus.Store.workouts.forEach((w) => {
      aoa.push([w.id, w.date, w.type, num(w.duration), num(w.calories), w.notes || "", w.createdAt || "", w.updatedAt || ""]);
    });
    aoa.push([]);
    aoa.push(["[Measurements]"]);
    aoa.push(["ID", "Date", "Measurement Type", "Value", "Unit", "Notes", "Created At", "Updated At"]);
    Focus.Store.measurements.forEach((m) => {
      aoa.push([m.id, m.date, m.type, m.value, m.unit || "", m.notes || "", m.createdAt || "", m.updatedAt || ""]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
    Object.assign(cell(ws, 0, 0), {
      font: { bold: true, color: { rgb: C.white }, sz: 12 },
      fill: { patternType: "solid", fgColor: { rgb: C.danger } }
    });
    Object.assign(cell(ws, 6, 0), { s: STYLE_SECTION });
    Object.assign(cell(ws, 7, 0), { s: STYLE_HEADER });
    Object.assign(cell(ws, 10 + Focus.Store.workouts.length, 0), { s: STYLE_SECTION });
    const mHdr = 11 + Focus.Store.workouts.length;
    Object.assign(cell(ws, mHdr, 0), { s: STYLE_HEADER });
    for (let r = 2; r <= 4; r++) Object.assign(cell(ws, r, 0), { s: STYLE_META_KEY });
    ws["!cols"] = [
      { wch: 30 }, { wch: 11 }, { wch: 14 }, { wch: 12 }, { wch: 10 },
      { wch: 34 }, { wch: 24 }, { wch: 24 }
    ];
    return ws;
  }

  /* ---------------- CSV export ---------------- */

  function toCsv(aoa) {
    return aoa.map((row) => row.map((c) => {
      if (c == null) return "";
      const s = String(c);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",")).join("\r\n");
  }

  function exportCsv(kind = "workouts") {
    let header, aoa;
    if (kind === "measurements") {
      header = ["Date", "Measurement", "Value", "Unit", "Notes"];
      aoa = [header];
      Focus.Store.measurements.forEach((m) => aoa.push([m.date, m.type, m.value, m.unit || "", m.notes || ""]));
    } else {
      header = ["Date", "Workout Type", "Duration (min)", "Calories", "Notes"];
      aoa = [header];
      Focus.Store.workouts.forEach((w) => aoa.push([w.date, w.type, num(w.duration), num(w.calories), w.notes || ""]));
    }
    return new Blob(["\ufeff" + toCsv(aoa)], { type: "text/csv;charset=utf-8" });
  }

  /* ---------------- import ---------------- */

  /**
   * Parse an Excel file. Returns:
   * { source: "appdata" | "human", workouts: [...], measurements: [...],
   *   errors: [string], meta: {schemaVersion, app, exportDate} }
   * `source` tells the UI which path was used so it can explain the behavior.
   */
  function parseWorkbook(data) {
    let wb;
    try {
      wb = XLSX.read(data, { type: "array", cellDates: true, dateNF: "yyyy-mm-dd" });
    } catch (e) {
      throw new Error("Could not read this file as an Excel workbook: " + e.message);
    }
    if (!wb || !wb.SheetNames || !wb.SheetNames.length) {
      throw new Error("This file doesn't look like an Excel workbook — nothing to import.");
    }

    // Priority 1: the _AppData sheet is authoritative when present and valid.
    const appDataName = wb.SheetNames.find((n) => String(n).toLowerCase() === "_appdata");
    if (appDataName) {
      const res = parseAppData(wb.Sheets[appDataName]);
      if (res.workouts.length || res.measurements.length) {
        res.source = "appdata";
        return res;
      }
      if (!res.workouts.length && !res.measurements.length && res.errors.length) {
        res.source = "appdata";
        return res;
      }
      // _AppData exists but is empty/opaque -> fall through to human sheets.
    }

    // Priority 2: human-readable sheets (app exports, Google Sheets copies,
    // or hand-made files).
    const errors = [];
    let wRows = [];
    let mRows = [];

    const sheetNames = wb.SheetNames.map((n) => n.toLowerCase());
    let wsName = sheetNames.find((n) => n.includes("workout")) || sheetNames.find((n) => n.includes("exercise"));
    let msName = sheetNames.find((n) => n.includes("measur"));

    const workoutWs = wsName ? wb.Sheets[wb.SheetNames[sheetNames.indexOf(wsName)]] : null;
    const measWs = msName ? wb.Sheets[wb.SheetNames[sheetNames.indexOf(msName)]] : null;

    if (workoutWs) {
      const rows = XLSX.utils.sheet_to_json(workoutWs, { defval: null, raw: true });
      rows.forEach((r, i) => {
        const w = mapWorkoutRow(r);
        if (!w) errors.push("Workouts row " + (i + 2) + ": missing or invalid date — skipped.");
        else wRows.push(w);
      });
    } else {
      for (const name of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: true });
        if (!rows.length) continue;
        const keys = Object.keys(rows[0]).map((k) => String(k).toLowerCase());
        if (keys.some((k) => k.includes("date")) && keys.some((k) => k.includes("type") || k.includes("calorie"))) {
          rows.forEach((r, i) => {
            const w = mapWorkoutRow(r);
            if (!w) errors.push("Row " + (i + 2) + " in sheet '" + name + "': invalid date — skipped.");
            else wRows.push(w);
          });
          break;
        }
      }
    }

    if (measWs) {
      const rows = XLSX.utils.sheet_to_json(measWs, { defval: null, raw: true });
      rows.forEach((r, i) => {
        const m = mapMeasurementRow(r);
        if (m) mRows.push(m);
        else errors.push("Measurements row " + (i + 2) + ": invalid row — skipped.");
      });
    }

    return { source: "human", workouts: wRows, measurements: mRows, errors, meta: {} };
  }

  /**
   * Read the _AppData sheet. Structure (built by sheetAppData):
   *   INTERNAL APPLICATION DATA — DO NOT EDIT
   *   (blank)
   *   Schema Version | 1.0
   *   Application     | Focus
   *   Export Date     | <iso>
   *   (blank)
   *   [Workouts]
   *   ID | Date | Workout Type | ... (header row)
   *   ...records...
   *   (blank)
   *   [Measurements]
   *   ID | Date | ... (header row)
   *   ...records...
   */
  function parseAppData(ws) {
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    const meta = {};
    const workouts = [];
    const measurements = [];
    const errors = [];
    let mode = null;          // "w" | "m" (changed only at section markers)
    let rowNum = 0;
    const seenIds = new Set();

    for (const row of aoa) {
      rowNum++;
      const first = row[0] == null ? "" : String(row[0]).trim();
      if (first === "[Workouts]") { mode = "w"; continue; }
      if (first === "[Measurements]") { mode = "m"; continue; }
      if (!mode) {
        if (first) meta[first] = row[1] == null ? "" : String(row[1]);
        continue;
      }
      // Blank rows inside a block are skipped WITHOUT ending the block, so a
      // stray blank row in an edited file can never silently drop the records
      // that follow it. Blocks only change at their section markers.
      if (!row.some((c) => c != null && c !== "")) continue;

      if (mode === "w") {
        const w = Focus.Store.normalizeWorkoutRow({
          id: row[0], date: row[1], type: row[2], duration: row[3], calories: row[4],
          notes: row[5], createdAt: row[6], updatedAt: row[7]
        });
        if (!w) { errors.push("_AppData Workouts row " + rowNum + ": invalid record — skipped."); continue; }
        if (w.id && seenIds.has(w.id)) { errors.push("_AppData Workouts row " + rowNum + ": duplicate ID '" + w.id + "' — skipped."); continue; }
        if (w.id) seenIds.add(w.id);
        workouts.push(w);
      } else {
        const m = Focus.Store.normalizeMeasurementRow({
          id: row[0], date: row[1], type: row[2], value: row[3], unit: row[4],
          notes: row[5], createdAt: row[6], updatedAt: row[7]
        });
        if (!m) { errors.push("_AppData Measurements row " + rowNum + ": invalid record — skipped."); continue; }
        if (m.id && seenIds.has(m.id)) { errors.push("_AppData Measurements row " + rowNum + ": duplicate ID '" + m.id + "' — skipped."); continue; }
        if (m.id) seenIds.add(m.id);
        measurements.push(m);
      }
    }

    const schemaVersion = meta["Schema Version"] || "";
    if (schemaVersion && schemaVersion !== SCHEMA_VERSION) {
      errors.push("This workbook uses schema version '" + schemaVersion + "' (this app expects '" + SCHEMA_VERSION + "'). Import attempted anyway — please keep a backup.");
    }
    return { workouts, measurements, errors, meta: { schemaVersion, app: meta["Application"], exportDate: meta["Export Date"] } };
  }

  /* ----- human row mapping (header-name tolerant) ----- */

  function mapWorkoutRow(r) {
    const keys = Object.keys(r);
    const get = (names) => {
      for (const n of names) {
        const k = keys.find((k) => String(k).toLowerCase() === n);
        if (k != null && r[k] != null && r[k] !== "") return r[k];
      }
      return null;
    };
    const date = get(["date", "fecha", "day", "día"]);
    const type = get(["workout type", "type", "tipo"]) || "Other";
    const duration = get(["duration", "duration (min)", "minutes", "min", "duración"]);
    const calories = get(["calories", "kcal", "calorías"]);
    const notes = get(["notes", "notas", "comment", "note"]) || "";
    const id = get(["id"]);
    const obj = { date, type, duration, calories, notes };
    if (id) obj.id = String(id);
    return Focus.Store.normalizeWorkoutRow(obj);
  }

  function mapMeasurementRow(r) {
    const keys = Object.keys(r);
    const get = (names) => {
      for (const n of names) {
        const k = keys.find((k) => String(k).toLowerCase() === n);
        if (k != null && r[k] != null && r[k] !== "") return r[k];
      }
      return null;
    };
    const date = get(["date", "fecha"]);
    const type = get(["measurement", "measurement type", "type", "tipo"]) || "Weight";
    const value = get(["value", "valor"]);
    const unit = get(["unit", "unidad"]) || "";
    const notes = get(["notes", "notas"]) || "";
    return Focus.Store.normalizeMeasurementRow({ date, type, value, unit, notes });
  }

  window.Focus = window.Focus || {};
  window.Focus.Excel = { exportExcel, exportCsv, parseWorkbook, mapWorkoutRow, mapMeasurementRow };
})();
