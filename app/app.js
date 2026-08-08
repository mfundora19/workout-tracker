/* =========================================================================
 * Focus.App — bootstrap, navigation, wiring
 * ========================================================================= */
(function () {
  "use strict";
  const S = () => Focus.Stats;
  const U = () => Focus.UI;

  const VIEW_META = {
    dashboard: ["Dashboard", "Your year at a glance"],
    calendar: ["Calendar", "Workout days, intensity and streaks"],
    progress: ["Progress", "Body measurements and trends"],
    analytics: ["Analytics", "Charts and year-over-year insights"],
    data: ["Data", "Export, backup and restore your data"],
    tools: ["Tools", "BMI calculator & weight converter"],
    settings: ["Settings", "Preferences, units and about"]
  };

  const App = {
    currentView: "dashboard",

    year() {
      return Number(Focus.Store.settings.selectedYear) || new Date().getFullYear();
    },

    async setYear(y) {
      y = Number(y);
      Focus.Store.settings.selectedYear = y;
      await Focus.Store.setSetting("selectedYear", y);
      populateYearSelect(y);
      renderCurrent();
    },

    async setSetting(key, value) {
      await Focus.Store.setSetting(key, value);
    }
  };

  /* ---------------- boot ---------------- */

  async function boot() {
    try {
      await Focus.Store.init();
    } catch (e) {
      document.getElementById("pageSubtitle").textContent = "Storage unavailable: " + e.message;
      return;
    }

    const seeded = await Focus.Store.seedIfNeeded();
    if (seeded && seeded.added) {
      Focus.UI.toast("📊 Imported your historical data from Workout Calendar.xlsx", "success", 5000);
    }

    initTheme();
    initNav();
    initYearControl();
    initQuickAdd();
    initGlobalDelegation();

    // default year: last one in settings, else latest year with data, else this year
    const years = S().availableYears(Focus.Store.workouts, Focus.Store.measurements);
    let y = Focus.Store.settings.selectedYear;
    if (!y || !years.includes(Number(y))) y = years[0] || new Date().getFullYear();
    populateYearSelect(y);
    Focus.Store.settings.selectedYear = y;

    // view from hash
    const v = location.hash.replace("#/", "");
    showView(VIEW_META[v] ? v : "dashboard");

    Focus.Store.onChange(() => {
      if (!document.getElementById("modalBackdrop").hidden) return;
      renderCurrent();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("modalBackdrop").hidden) Focus.UI.closeModal();
      if (e.key === "Escape" && !document.getElementById("chartTooltip").hidden) Focus.Charts.hideTip();
    });

    window.addEventListener("hashchange", () => {
      const v = location.hash.replace("#/", "");
      if (VIEW_META[v]) showView(v);
    });
  }

  /* ---------------- theme ---------------- */

  function applyMotionPref() {
    document.documentElement.classList.toggle("no-anim", Focus.Store.settings.animations === false);
  }

  function initTheme() {
    const saved = Focus.Store.settings.theme;
    const pref = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    const theme = saved === "light" || saved === "dark" ? saved : pref;
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-accent", Focus.Store.settings.accent || "violet");
    applyMotionPref();
    if (!saved) Focus.Store.setSetting("theme", theme);
    document.getElementById("themeToggle").addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      Focus.Store.setSetting("theme", next);
      renderCurrent();
    });
  }

  /* ---------------- navigation ---------------- */

  function initNav() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => showView(btn.dataset.view));
    });
    document.getElementById("quickAddBtn").addEventListener("click", () => Focus.UI.openWorkoutForm({ date: S().todayISO() }));
  }

  function showView(name) {
    App.currentView = name;
    Focus.UI.closeInfoPopover(); // drop any open ⓘ popover when leaving the view
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.view === name));
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "view-" + name));
    document.getElementById("pageTitle").textContent = VIEW_META[name][0];
    document.getElementById("pageSubtitle").textContent = VIEW_META[name][1];
    // The year picker + Add Workout belong on data-driven views; hide them on
    // Settings and Data where they'd just sit there doing nothing.
    document.getElementById("topbarRight").hidden = name === "settings" || name === "data";
    if (location.hash !== "#/" + name) {
      try { history.replaceState(null, "", "#/" + name); } catch (e) { /* file:// safe */ }
    }
    renderCurrent();
  }

  function renderCurrent() {
    const v = App.currentView;
    if (v === "dashboard") Focus.UI.renderDashboard();
    else if (v === "calendar") Focus.UI.renderCalendar();
    else if (v === "progress") Focus.UI.renderProgress();
    else if (v === "analytics") Focus.UI.renderAnalytics();
    else if (v === "data") Focus.UI.renderData();
    else if (v === "tools") Focus.UI.renderTools();
    else if (v === "settings") Focus.UI.renderSettings();
  }

  /* ---------------- year control ---------------- */

  function populateYearSelect(current) {
    const sel = document.getElementById("yearSelect");
    const years = S().availableYears(Focus.Store.workouts, Focus.Store.measurements);
    if (!years.includes(Number(current))) years.push(Number(current));
    years.sort((a, b) => b - a);
    sel.innerHTML = years.map((y) => `<option value="${y}" ${Number(y) === Number(current) ? "selected" : ""}>${y}</option>`).join("");
  }

  function initYearControl() {
    const sel = document.getElementById("yearSelect");
    sel.addEventListener("change", () => App.setYear(sel.value));
    document.getElementById("yearPrev").addEventListener("click", () => App.setYear(App.year() - 1));
    document.getElementById("yearNext").addEventListener("click", () => App.setYear(App.year() + 1));
  }

  /* ---------------- quick add (dashboard inline) ---------------- */

  function initQuickAdd() {
    document.addEventListener("submit", (e) => {
      if (e.target.id !== "quickAddForm") return;
      e.preventDefault();
      const f = e.target;
      const date = f.date.value || S().todayISO();
      const type = f.type.value;
      const duration = f.duration.value === "" ? null : Number(f.duration.value);
      const calories = f.calories.value === "" ? null : Number(f.calories.value);
      if (!type) { Focus.UI.toast("Choose at least one workout type", "warn"); return; }
      if ((duration != null && (!isFinite(duration) || duration < 0)) || (calories != null && (!isFinite(calories) || calories < 0))) {
        Focus.UI.toast("Numbers must be positive", "warn");
        return;
      }
      Focus.Store.addWorkout({ date, type, duration, calories, notes: "" }).then(() => {
        Focus.UI.toast("Workout added 💪");
        f.duration.value = "";
        f.calories.value = "";
        f.calories.focus();
      });
    });

    document.addEventListener("change", (e) => {
      if (e.target.id === "qmType") {
        const custom = document.getElementById("qmCustomType");
        if (custom) custom.style.display = e.target.value === "__custom__" ? "" : "none";
        const unit = document.getElementById("qmUnit");
        if (unit) unit.value = Focus.UI.unitDefault(e.target.value);
      }
      if (e.target.id === "anaA") { Focus.UI.state.anaA = Number(e.target.value); renderCurrent(); }
      if (e.target.id === "anaB") { Focus.UI.state.anaB = Number(e.target.value); renderCurrent(); }
    });

    // quick add: switch between workout and measurement modes (persisted so
    // re-renders keep the same tab active)
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-qamode]");
      if (!btn) return;
      Focus.UI.state.qaMode = btn.dataset.qamode;
      document.querySelectorAll("[data-qamode]").forEach((b) => b.classList.toggle("is-active", b.dataset.qamode === Focus.UI.state.qaMode));
      const wf = document.getElementById("quickAddForm");
      const mf = document.getElementById("quickMeasForm");
      if (wf) wf.hidden = Focus.UI.state.qaMode !== "workout";
      if (mf) mf.hidden = Focus.UI.state.qaMode !== "measurement";
    });

    // quick add: measurement form submit
    document.addEventListener("submit", (e) => {
      if (e.target.id !== "quickMeasForm") return;
      e.preventDefault();
      const f = e.target;
      const date = f.date.value || S().todayISO();
      const type = f.type.value === "__custom__" ? (f.customType.value || "").trim() : f.type.value;
      const value = f.value.value === "" ? NaN : Number(f.value.value);
      if (!date) { Focus.UI.toast("Pick a date", "warn"); return; }
      if (!type) { Focus.UI.toast("Choose a measurement type", "warn"); return; }
      if (!isFinite(value) || value < 0) { Focus.UI.toast("Value must be a positive number", "warn"); return; }
      Focus.Store.addMeasurement({ date, type, value, unit: f.unit.value, notes: "" }).then(() => {
        Focus.UI.toast("Measurement added 📏");
        f.value.value = "";
        f.value.focus();
      });
    });
  }

  /* ---------------- global actions ---------------- */

  function initGlobalDelegation() {
    document.addEventListener("click", (e) => {
      const target = e.target.closest("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      const id = target.dataset.id;

      switch (action) {
        case "goto":
          showView(target.dataset.view);
          break;
        case "quick-add": {
          const date = target.dataset.date || S().todayISO();
          Focus.UI.openWorkoutForm({ date });
          break;
        }
        case "toggle-type": {
          // multi-select workout type chips: keep the joined value in the
          // form's hidden input so submits read it like the old select did.
          const picker = target.dataset.picker;
          const t = target.dataset.type;
          const hidden = document.getElementById(picker + "Type");
          if (!hidden) break;
          const cur = new Set((hidden.value || "").split(",").map((s) => s.trim()).filter(Boolean));
          if (cur.has(t)) cur.delete(t); else cur.add(t);
          hidden.value = Focus.Store.normalizeTypes(Array.from(cur).join(", "));
          document.querySelectorAll(`.type-chip[data-picker="${picker}"]`).forEach((c) => {
            c.classList.toggle("is-on", cur.has(c.dataset.type));
          });
          break;
        }
        case "add-type": {
          const picker = target.dataset.picker;
          const input = document.getElementById(picker + "CustomType");
          const name = (input ? input.value : "").trim().replace(/[,;]+/g, " ");
          if (!name) { if (input) input.focus(); break; }
          const hidden = document.getElementById(picker + "Type");
          const container = document.getElementById(picker + "Picker");
          if (!hidden || !container) break;
          const cur = new Set((hidden.value || "").split(",").map((s) => s.trim()).filter(Boolean));
          let exists = false;
          container.querySelectorAll(".type-chip").forEach((c) => { if (c.dataset.type === name) exists = true; });
          if (exists) {
            container.querySelectorAll(".type-chip").forEach((c) => { if (c.dataset.type === name) c.classList.add("is-on"); });
          } else {
            const st = Focus.UI.typeStyle(name);
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "type-chip is-on";
            chip.dataset.action = "toggle-type";
            chip.dataset.picker = picker;
            chip.dataset.type = name;
            chip.style.setProperty("--tc", st.color);
            chip.title = name;
            const dot = document.createElement("span");
            dot.className = "tcdot";
            chip.appendChild(dot);
            chip.appendChild(document.createTextNode(" " + st.emoji + " " + name));
            container.appendChild(chip);
          }
          cur.add(name);
          hidden.value = Array.from(cur).join(", ");
          if (input) input.value = "";
          break;
        }
        case "edit-workout": {
          const w = Focus.Store.workouts.find((x) => x.id === id);
          if (w) Focus.UI.openWorkoutForm(w);
          break;
        }
        case "delete-workout": {
          const w = Focus.Store.workouts.find((x) => x.id === id);
          if (!w) break;
          Focus.UI.confirmDialog({
            title: "Delete workout?",
            message: `This will permanently remove the ${w.type} workout on ${S().prettyDate(w.date)}.`,
            onConfirm: () => Focus.Store.deleteWorkout(id).then(() => Focus.UI.toast("Workout deleted")),
            confirmLabel: "Delete"
          });
          break;
        }
        case "add-measurement":
          Focus.UI.openMeasurementForm({ date: target.dataset.date || S().todayISO() });
          break;
        case "view-all-measurements":
          Focus.UI.openMeasurementList(target.dataset.type);
          break;
        case "edit-measurement": {
          const m = Focus.Store.measurements.find((x) => x.id === id);
          if (m) Focus.UI.openMeasurementForm(m);
          break;
        }
        case "delete-measurement": {
          const m = Focus.Store.measurements.find((x) => x.id === id);
          if (!m) break;
          Focus.UI.confirmDialog({
            title: "Delete measurement?",
            message: `This will permanently remove the ${m.type} measurement from ${S().prettyDate(m.date)}.`,
            onConfirm: () => Focus.Store.deleteMeasurement(id).then(() => Focus.UI.toast("Measurement deleted")),
            confirmLabel: "Delete"
          });
          break;
        }
        case "prog-type":
          Focus.UI.state.progType = target.dataset.type;
          renderCurrent();
          break;
        case "set-theme": {
          const next = target.dataset.setTheme;
          if (next === "light" || next === "dark") {
            document.documentElement.setAttribute("data-theme", next);
            Focus.Store.setSetting("theme", next);
            renderCurrent();
          }
          break;
        }
        case "set-accent": {
          const next = target.dataset.accent;
          if (next) {
            document.documentElement.setAttribute("data-accent", next);
            Focus.Store.setSetting("accent", next);
            Focus.UI.state.accentOpen = false;
            renderCurrent();
          }
          break;
        }
        case "toggle-accent":
          Focus.UI.state.accentOpen = !Focus.UI.state.accentOpen;
          renderCurrent();
          break;
        case "set-animations": {
          const on = target.dataset.setAnimations === "on";
          Focus.Store.setSetting("animations", on);
          applyMotionPref();
          renderCurrent();
          break;
        }
        case "set-weightunit": {
          const next = target.dataset.setWeightunit;
          if (next === "kg" || next === "lb") {
            Focus.Store.setSetting("weightUnit", next);
            Focus.UI.toast("New weight entries will default to " + next);
            renderCurrent();
          }
          break;
        }
        case "set-sex": {
          const next = target.dataset.setSex;
          if (next === "male" || next === "female") {
            Focus.Store.setSetting("sex", next);
            Focus.UI.toast("Body profile saved — body-fat estimates use " + (next === "female" ? "women" : "men") + " ranges");
            renderCurrent();
          }
          break;
        }
        case "save-goals": {
          const num = (v) => (v === "" || v == null || !isFinite(Number(v)) ? null : Math.max(0, Number(v)));
          const goals = {
            calPerDay: num(document.getElementById("goalCal") ? document.getElementById("goalCal").value : ""),
            durPerDay: num(document.getElementById("goalDur") ? document.getElementById("goalDur").value : ""),
            workoutsPerWeek: num(document.getElementById("goalWk") ? document.getElementById("goalWk").value : "")
          };
          Focus.Store.setSettings({ goals }).then(() => {
            Focus.UI.toast("Goals saved 🎯 — check your dashboard and calendar");
            renderCurrent();
          });
          break;
        }
        case "openmonth":
          Focus.UI.state.calMode = "month";
          Focus.UI.state.calMonth = Number(target.dataset.month);
          Focus.UI.state.calDay = null;
          renderCurrent();
          break;
        case "cal-year":
          Focus.UI.state.calMode = "year";
          Focus.UI.state.calDay = null;
          renderCurrent();
          break;
        case "export-excel": {
          const blob = Focus.Excel.exportExcel();
          downloadBlob(blob, "focus-export-" + S().todayISO() + ".xlsx");
          Focus.App.setSetting("lastExcelExportAt", new Date().toISOString()).then(() => Focus.UI.renderData());
          Focus.UI.toast("Excel workbook downloaded — open it in Excel or Google Sheets");
          break;
        }
        case "export-pdf":
          Focus.UI.showPdfModal();
          break;
        case "export-pdf-confirm": {
          const year = Number(document.getElementById("pdfYear").value);
          const cmp = document.getElementById("pdfCompare").value ? Number(document.getElementById("pdfCompare").value) : null;
          Focus.UI.closeModal();
          try {
            const { blob, filename } = Focus.Pdf.exportPdf({ year, compareYear: cmp });
            downloadBlob(blob, filename);
            Focus.App.setSetting("lastPdfExportAt", new Date().toISOString()).then(() => Focus.UI.renderData());
            Focus.UI.toast("PDF report downloaded — " + filename, "success", 4500);
          } catch (e) {
            Focus.UI.toast("PDF export failed: " + e.message, "error", 5000);
          }
          break;
        }
        case "export-backup": {
          const blob = new Blob([JSON.stringify(Focus.Store.exportBackup(), null, 2)], { type: "application/json" });
          downloadBlob(blob, "focus-backup-" + S().todayISO() + ".json");
          Focus.App.setSetting("lastBackupAt", new Date().toISOString());
          Focus.UI.toast("Full backup downloaded — keep it safe 🗄️");
          break;
        }
        case "export-csv": {
          const blob = Focus.Excel.exportCsv("workouts");
          downloadBlob(blob, "focus-workouts-" + S().todayISO() + ".csv");
          Focus.UI.toast("Workouts CSV downloaded");
          break;
        }
        case "export-csv-meas": {
          const blob = Focus.Excel.exportCsv("measurements");
          downloadBlob(blob, "focus-measurements-" + S().todayISO() + ".csv");
          Focus.UI.toast("Measurements CSV downloaded");
          break;
        }
        case "restore-seed":
          restoreSeed();
          break;
        case "reset-all":
          Focus.UI.confirmDialog({
            title: "Delete ALL local data?",
            message: "Every workout and measurement stored in this browser will be permanently deleted. Export a backup first if you're not sure.",
            confirmLabel: "Delete everything",
            onConfirm: () => Focus.Store.resetAll().then(() => {
              Focus.UI.toast("All data deleted. The app is now empty.", "warn", 5000);
              populateYearSelect(new Date().getFullYear());
            })
          });
          break;
      }
    });

    // calendar Year/Month mode toggle
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-cal-mode]");
      if (btn) {
        Focus.UI.state.calMode = btn.dataset.calMode;
        Focus.UI.state.calDay = null;
        renderCurrent();
      }
    });

    // calendar day click / keyboard
    document.addEventListener("click", (e) => {
      const day = e.target.closest("[data-calday]");
      if (day) {
        Focus.UI.state.calDay = day.dataset.day;
        Focus.UI.renderCalendar();
      }
    });
    document.addEventListener("keydown", (e) => {
      const day = e.target.closest && e.target.closest("[data-calday]");
      if (day && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        Focus.UI.state.calDay = day.dataset.day;
        Focus.UI.renderCalendar();
      }
    });
    // heat cell click -> jump to that day in month view
    document.addEventListener("click", (e) => {
      const cell = e.target.closest("[data-calinfo]");
      if (cell) {
        const iso = cell.dataset.day;
        Focus.UI.state.calMode = "month";
        Focus.UI.state.calMonth = Number(iso.slice(5, 7));
        Focus.UI.state.calDay = iso;
        renderCurrent();
      }
    });
  }

  function restoreSeed() {
    const seed = window.FocusSeed;
    if (!seed) { Focus.UI.toast("No built-in data available", "warn"); return; }
    Focus.UI.confirmDialog({
      title: "Restore built-in historical data?",
      message: "This re-imports the workouts and measurements extracted from your Workout Calendar.xlsx. Existing identical records are skipped — nothing is duplicated or deleted.",
      confirmLabel: "Restore data",
      danger: false,
      onConfirm: () => Focus.Store.importRecords(seed.workouts, seed.measurements).then((res) => {
        Focus.UI.toast(`Restored: ${res.added} new (${res.skipped} duplicates skipped)`, "success", 4500);
      })
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
  }

  /* ---------------- go ---------------- */

  window.Focus = window.Focus || {};
  window.Focus.App = App;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
