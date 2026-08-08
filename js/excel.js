/* =========================================================================
 * Pulse.Excel — .xlsx / .csv import & export (SheetJS bundled locally)
 * -------------------------------------------------------------------------
 * Export produces a Google-Sheets-friendly workbook:
 *   Summary | Workouts | Measurements | Monthly Stats | Yearly Stats
 * Import accepts workbooks produced by this app OR by Google Sheets exports
 * of them, and always returns a preview report so the UI can confirm first.
 * ========================================================================= */
(function () {
  "use strict";
  const S = window.Pulse.Stats;

  /* ---------------- export ---------------- */

  function exportExcel() {
    const wb = window.XLSX.utils.book_new();
    const wsWorkouts = sheetFromWorkouts(Pulse.Store.workouts);
    const wsMeas = sheetFromMeasurements(Pulse.Store.measurements);
    const wsMonthly = sheetFromMonthly();
    const wsYearly = sheetFromYearly();

    window.XLSX.utils.book_append_sheet(wb, wsWorkouts, "Workouts");
    window.XLSX.utils.book_append_sheet(wb, wsMeas, "Measurements");
    window.XLSX.utils.book_append_sheet(wb, wsMonthly, "Monthly Stats");
    window.XLSX.utils.book_append_sheet(wb, wsYearly, "Yearly Stats");

    // Summary sheet first
    const sum = [];
    sum.push(["Pulse — Workout & Fitness Tracker"]);
    sum.push(["Exported", new Date().toISOString()]);
    sum.push([]);
    sum.push(["Metric", "Value"]);
    sum.push(["Total workouts", Pulse.Store.workouts.length]);
    sum.push(["Total workout days", new Set(Pulse.Store.workouts.map((w) => w.date)).size]);
    sum.push(["Total calories", Pulse.Store.workouts.reduce((s, w) => s + (w.calories || 0), 0)]);
    sum.push(["Total duration (min)", Pulse.Store.workouts.reduce((s, w) => s + (w.duration || 0), 0)]);
    sum.push(["Total measurements", Pulse.Store.measurements.length]);
    sum.push(["Years with data", new Set(Pulse.Store.workouts.map((w) => w.date.slice(0, 4))).size]);
    sum.push([]);
    sum.push(["Per-year summary"]);
    sum.push(["Year", "Workouts", "Workout Days", "Calories", "Duration (min)"]);
    const years = S.availableYears(Pulse.Store.workouts, Pulse.Store.measurements);
    years.slice().reverse().forEach((y) => {
      const st = S.yearlyStats(Pulse.Store.workouts, y);
      sum.push([y, st.workouts, st.days, st.calories, st.duration]);
    });
    const wsSummary = window.XLSX.utils.aoa_to_sheet(sum);
    wsSummary["!cols"] = [{ wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    window.XLSX.utils.book_append_sheet(wb, wsSummary, "Summary", 0);

    wb.Workbook = { Views: [{ RTL: false }] };
    const out = window.XLSX.write(wb, { bookType: "xlsx", type: "array" });
    return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  function sheetFromWorkouts(rows) {
    const header = ["ID", "Date", "Year", "Month", "Workout Type", "Duration (min)", "Calories", "Notes", "Created At", "Updated At"];
    const aoa = [header];
    rows.forEach((w) => {
      aoa.push([
        w.id, w.date, Number(w.date.slice(0, 4)), Number(w.date.slice(5, 7)), w.type,
        w.duration != null ? w.duration : "", w.calories != null ? w.calories : "",
        w.notes || "", w.createdAt || "", w.updatedAt || ""
      ]);
    });
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 26 }, { wch: 11 }, { wch: 6 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 34 }, { wch: 24 }, { wch: 24 }];
    ws["!freeze"] = { x: 0, y: 1 };
    return ws;
  }

  function sheetFromMeasurements(rows) {
    const header = ["ID", "Date", "Measurement Type", "Value", "Unit", "Notes", "Created At", "Updated At"];
    const aoa = [header];
    rows.forEach((m) => {
      aoa.push([m.id, m.date, m.type, m.value, m.unit || "", m.notes || "", m.createdAt || "", m.updatedAt || ""]);
    });
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 26 }, { wch: 11 }, { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 34 }, { wch: 24 }, { wch: 24 }];
    ws["!freeze"] = { x: 0, y: 1 };
    return ws;
  }

  function sheetFromMonthly() {
    const years = S.availableYears(Pulse.Store.workouts, Pulse.Store.measurements);
    const header = ["Year", "Month", "Workouts", "Workout Days", "Rest Days", "Calories", "Duration (min)", "Avg Calories/Workout", "Avg Duration/Workout", "Longest Streak"];
    const aoa = [header];
    years.forEach((y) => {
      S.monthlyStats(Pulse.Store.workouts, y).forEach((m) => {
        aoa.push([y, m.label, m.workouts, m.days, m.restDays, m.calories, m.duration,
          m.avgCal == null ? "" : +m.avgCal.toFixed(1),
          m.avgDur == null ? "" : +m.avgDur.toFixed(1),
          m.bestStreak]);
      });
    });
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = header.map((h, i) => ({ wch: [6, 8, 10, 12, 11, 10, 14, 20, 21, 14][i] }));
    ws["!freeze"] = { x: 0, y: 1 };
    return ws;
  }

  function sheetFromYearly() {
    const years = S.availableYears(Pulse.Store.workouts, Pulse.Store.measurements);
    const header = ["Year", "Workouts", "Workout Days", "Calories", "Duration (min)", "Avg Calories/Workout", "Avg Workouts/Month", "Best Month", "Longest Streak"];
    const aoa = [header];
    years.forEach((y) => {
      const st = S.yearlyStats(Pulse.Store.workouts, y);
      aoa.push([y, st.workouts, st.days, st.calories, st.duration,
        st.workouts ? +st.avgCal.toFixed(1) : "",
        +st.avgWorkoutsPerMonth.toFixed(1),
        st.bestMonth ? st.bestMonth.label : "", st.longestStreak]);
    });
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = header.map((h, i) => ({ wch: [6, 10, 12, 10, 14, 20, 19, 12, 14][i] }));
    ws["!freeze"] = { x: 0, y: 1 };
    return ws;
  }

  /* ---------------- CSV export ---------------- */

  function exportCsv() {
    function toCsv(aoa) {
      return aoa.map((row) => row.map((c) => {
        if (c == null) return "";
        const s = String(c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(",")).join("\r\n");
    }
    const header = ["Date", "Workout Type", "Duration (min)", "Calories", "Notes"];
    const aoa = [header];
    Pulse.Store.workouts.forEach((w) => aoa.push([w.date, w.type, w.duration != null ? w.duration : "", w.calories != null ? w.calories : "", w.notes || ""]));
    return new Blob(["\ufeff" + toCsv(aoa)], { type: "text/csv;charset=utf-8" });
  }

  /* ---------------- import ---------------- */

  /**
   * Parse an Excel file and produce rows for workouts & measurements.
   * Returns { workouts: [...], measurements: [...], errors: [string] }.
   */
  function parseWorkbook(data) {
    let wb;
    try {
      wb = window.XLSX.read(data, { type: "array", cellDates: true, dateNF: "yyyy-mm-dd" });
    } catch (e) {
      throw new Error("Could not read this file as an Excel workbook: " + e.message);
    }
    const errors = [];
    let wRows = [];
    let mRows = [];

    // Prefer exact sheet names; fall back to any sheet with a known header.
    const sheetNames = wb.SheetNames.map((n) => n.toLowerCase());
    let wsName = sheetNames.find((n) => n.includes("workout")) || sheetNames.find((n) => n.includes("exercise"));
    let msName = sheetNames.find((n) => n.includes("measur"));

    const workoutWs = wsName ? wb.Sheets[wb.SheetNames[sheetNames.indexOf(wsName)]] : null;
    const measWs = msName ? wb.Sheets[wb.SheetNames[sheetNames.indexOf(msName)]] : null;

    if (workoutWs) {
      const rows = window.XLSX.utils.sheet_to_json(workoutWs, { defval: null, raw: true });
      rows.forEach((r, i) => {
        const w = mapWorkoutRow(r);
        if (!w) errors.push("Workouts row " + (i + 2) + ": missing or invalid date — skipped.");
        else wRows.push(w);
      });
    } else {
      // No dedicated sheet: try the first sheet that looks like workout data
      for (const name of wb.SheetNames) {
        const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: true });
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
      const rows = window.XLSX.utils.sheet_to_json(measWs, { defval: null, raw: true });
      rows.forEach((r, i) => {
        const m = mapMeasurementRow(r);
        if (m) mRows.push(m);
      });
    }

    return { workouts: wRows, measurements: mRows, errors };
  }

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
    return Pulse.Store.normalizeWorkoutRow(obj);
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
    const type = get(["measurement type", "type", "tipo"]) || "Weight";
    const value = get(["value", "valor"]);
    const unit = get(["unit", "unidad"]) || "";
    const notes = get(["notes", "notas"]) || "";
    return { date, type, value, unit, notes };
  }

  window.Pulse = window.Pulse || {};
  window.Pulse.Excel = { exportExcel, exportCsv, parseWorkbook, mapWorkoutRow, mapMeasurementRow };
})();
