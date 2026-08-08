/* =========================================================================
 * Pulse.App — bootstrap, navigation, wiring
 * ========================================================================= */
(function () {
  "use strict";
  const S = () => Pulse.Stats;
  const U = () => Pulse.UI;

  const VIEW_META = {
    dashboard: ["Dashboard", "Your year at a glance"],
    calendar: ["Calendar", "Workout days, intensity and streaks"],
    workouts: ["Workouts", "History, filters and quick entry"],
    progress: ["Progress", "Body measurements and trends"],
    analytics: ["Analytics", "Charts and year-over-year insights"],
    data: ["Data", "Import, export and backup"]
  };

  const App = {
    currentView: "dashboard",

    year() {
      return Number(Pulse.Store.settings.selectedYear) || new Date().getFullYear();
    },

    async setYear(y) {
      y = Number(y);
      Pulse.Store.settings.selectedYear = y;
      await Pulse.Store.setSetting("selectedYear", y);
      populateYearSelect(y);
      renderCurrent();
    },

    async setSetting(key, value) {
      await Pulse.Store.setSetting(key, value);
    }
  };

  /* ---------------- boot ---------------- */

  async function boot() {
    try {
      await Pulse.Store.init();
    } catch (e) {
      document.getElementById("pageSubtitle").textContent = "Storage unavailable: " + e.message;
      return;
    }

    const seeded = await Pulse.Store.seedIfNeeded();
    if (seeded && seeded.added) {
      Pulse.UI.toast("📊 Imported your historical data from Workout Calendar.xlsx", "success", 5000);
    }

    initTheme();
    initNav();
    initYearControl();
    initQuickAdd();
    initGlobalDelegation();

    // default year: last one in settings, else latest year with data, else this year
    const years = S().availableYears(Pulse.Store.workouts, Pulse.Store.measurements);
    let y = Pulse.Store.settings.selectedYear;
    if (!y || !years.includes(Number(y))) y = years[0] || new Date().getFullYear();
    populateYearSelect(y);
    Pulse.Store.settings.selectedYear = y;

    // view from hash
    const v = location.hash.replace("#/", "");
    showView(VIEW_META[v] ? v : "dashboard");

    Pulse.Store.onChange(() => {
      if (!document.getElementById("modalBackdrop").hidden) return;
      renderCurrent();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.getElementById("modalBackdrop").hidden) Pulse.UI.closeModal();
      if (e.key === "Escape" && !document.getElementById("chartTooltip").hidden) Pulse.Charts.hideTip();
    });

    window.addEventListener("hashchange", () => {
      const v = location.hash.replace("#/", "");
      if (VIEW_META[v]) showView(v);
    });
  }

  /* ---------------- theme ---------------- */

  function initTheme() {
    const saved = Pulse.Store.settings.theme;
    const pref = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    const theme = saved === "light" || saved === "dark" ? saved : pref;
    document.documentElement.setAttribute("data-theme", theme);
    if (!saved) Pulse.Store.setSetting("theme", theme);
    document.getElementById("themeToggle").addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      Pulse.Store.setSetting("theme", next);
      renderCurrent();
    });
  }

  /* ---------------- navigation ---------------- */

  function initNav() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => showView(btn.dataset.view));
    });
    document.getElementById("quickAddBtn").addEventListener("click", () => Pulse.UI.openWorkoutForm({ date: S().todayISO() }));
  }

  function showView(name) {
    App.currentView = name;
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.view === name));
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "view-" + name));
    document.getElementById("pageTitle").textContent = VIEW_META[name][0];
    document.getElementById("pageSubtitle").textContent = VIEW_META[name][1];
    if (location.hash !== "#/" + name) {
      try { history.replaceState(null, "", "#/" + name); } catch (e) { /* file:// safe */ }
    }
    renderCurrent();
  }

  function renderCurrent() {
    const v = App.currentView;
    if (v === "dashboard") Pulse.UI.renderDashboard();
    else if (v === "calendar") Pulse.UI.renderCalendar();
    else if (v === "workouts") Pulse.UI.renderWorkouts();
    else if (v === "progress") Pulse.UI.renderProgress();
    else if (v === "analytics") Pulse.UI.renderAnalytics();
    else if (v === "data") Pulse.UI.renderData();
  }

  /* ---------------- year control ---------------- */

  function populateYearSelect(current) {
    const sel = document.getElementById("yearSelect");
    const years = S().availableYears(Pulse.Store.workouts, Pulse.Store.measurements);
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
      const type = f.type.value === "__custom__" ? (f.customType.value || "").trim() : f.type.value;
      const duration = f.duration.value === "" ? null : Number(f.duration.value);
      const calories = f.calories.value === "" ? null : Number(f.calories.value);
      if (!type) { Pulse.UI.toast("Choose a workout type", "warn"); return; }
      if ((duration != null && (!isFinite(duration) || duration < 0)) || (calories != null && (!isFinite(calories) || calories < 0))) {
        Pulse.UI.toast("Numbers must be positive", "warn");
        return;
      }
      Pulse.Store.addWorkout({ date, type, duration, calories, notes: "" }).then(() => {
        Pulse.UI.toast("Workout added 💪");
        f.duration.value = "";
        f.calories.value = "";
        f.calories.focus();
      });
    });

    document.addEventListener("change", (e) => {
      if (e.target.id === "qaType") {
        const custom = document.getElementById("qaCustomType");
        if (custom) custom.style.display = e.target.value === "__custom__" ? "" : "none";
      }
      if (e.target.id === "wfYear") { Pulse.UI.state.wkYear = e.target.value; renderCurrent(); }
      if (e.target.id === "wfMonth") { Pulse.UI.state.wkMonth = e.target.value; renderCurrent(); }
      if (e.target.id === "wfType") { Pulse.UI.state.wkType = e.target.value; renderCurrent(); }
      if (e.target.id === "anaA") { Pulse.UI.state.anaA = Number(e.target.value); renderCurrent(); }
      if (e.target.id === "anaB") { Pulse.UI.state.anaB = Number(e.target.value); renderCurrent(); }
    });

    document.addEventListener("input", (e) => {
      if (e.target.id === "wfSearch") {
        Pulse.UI.state.wkSearch = e.target.value;
        debounce(() => renderCurrent(), 180)();
      }
    });
  }

  let _deb = null;
  function debounce(fn, ms) {
    return () => {
      clearTimeout(_deb);
      _deb = setTimeout(fn, ms);
    };
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
          Pulse.UI.openWorkoutForm({ date });
          break;
        }
        case "edit-workout": {
          const w = Pulse.Store.workouts.find((x) => x.id === id);
          if (w) Pulse.UI.openWorkoutForm(w);
          break;
        }
        case "delete-workout": {
          const w = Pulse.Store.workouts.find((x) => x.id === id);
          if (!w) break;
          Pulse.UI.confirmDialog({
            title: "Delete workout?",
            message: `This will permanently remove the ${w.type} workout on ${S().prettyDate(w.date)}.`,
            onConfirm: () => Pulse.Store.deleteWorkout(id).then(() => Pulse.UI.toast("Workout deleted")),
            confirmLabel: "Delete"
          });
          break;
        }
        case "add-measurement":
          Pulse.UI.openMeasurementForm({ date: S().todayISO() });
          break;
        case "edit-measurement": {
          const m = Pulse.Store.measurements.find((x) => x.id === id);
          if (m) Pulse.UI.openMeasurementForm(m);
          break;
        }
        case "delete-measurement": {
          const m = Pulse.Store.measurements.find((x) => x.id === id);
          if (!m) break;
          Pulse.UI.confirmDialog({
            title: "Delete measurement?",
            message: `This will permanently remove the ${m.type} measurement from ${S().prettyDate(m.date)}.`,
            onConfirm: () => Pulse.Store.deleteMeasurement(id).then(() => Pulse.UI.toast("Measurement deleted")),
            confirmLabel: "Delete"
          });
          break;
        }
        case "prog-type":
          Pulse.UI.state.progType = target.dataset.type;
          renderCurrent();
          break;
        case "openmonth":
          Pulse.UI.state.calMode = "month";
          Pulse.UI.state.calMonth = Number(target.dataset.month);
          Pulse.UI.state.calDay = null;
          renderCurrent();
          break;
        case "cal-year":
          Pulse.UI.state.calMode = "year";
          Pulse.UI.state.calDay = null;
          renderCurrent();
          break;
        case "export-excel": {
          const blob = Pulse.Excel.exportExcel();
          downloadBlob(blob, "pulse-export-" + S().todayISO() + ".xlsx");
          Pulse.UI.toast("Excel workbook downloaded");
          break;
        }
        case "export-backup": {
          const blob = new Blob([JSON.stringify(Pulse.Store.exportBackup(), null, 2)], { type: "application/json" });
          downloadBlob(blob, "pulse-backup-" + S().todayISO() + ".json");
          Pulse.App.setSetting("lastBackupAt", new Date().toISOString());
          Pulse.UI.toast("Full backup downloaded — keep it safe 🗄️");
          break;
        }
        case "export-csv": {
          const blob = Pulse.Excel.exportCsv();
          downloadBlob(blob, "pulse-workouts-" + S().todayISO() + ".csv");
          Pulse.UI.toast("CSV downloaded");
          break;
        }
        case "restore-seed":
          restoreSeed();
          break;
        case "reset-all":
          Pulse.UI.confirmDialog({
            title: "Delete ALL local data?",
            message: "Every workout and measurement stored in this browser will be permanently deleted. Export a backup first if you're not sure.",
            confirmLabel: "Delete everything",
            onConfirm: () => Pulse.Store.resetAll().then(() => {
              Pulse.UI.toast("All data deleted. The app is now empty.", "warn", 5000);
              populateYearSelect(new Date().getFullYear());
            })
          });
          break;
      }
    });

    // calendar day click / keyboard
    document.addEventListener("click", (e) => {
      const day = e.target.closest("[data-calday]");
      if (day) {
        Pulse.UI.state.calDay = day.dataset.day;
        Pulse.UI.renderCalendar();
      }
    });
    document.addEventListener("keydown", (e) => {
      const day = e.target.closest && e.target.closest("[data-calday]");
      if (day && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        Pulse.UI.state.calDay = day.dataset.day;
        Pulse.UI.renderCalendar();
      }
    });
    // heat cell click -> jump to that day in month view
    document.addEventListener("click", (e) => {
      const cell = e.target.closest("[data-calinfo]");
      if (cell) {
        const iso = cell.dataset.day;
        Pulse.UI.state.calMode = "month";
        Pulse.UI.state.calMonth = Number(iso.slice(5, 7));
        Pulse.UI.state.calDay = iso;
        renderCurrent();
      }
    });
  }

  function restoreSeed() {
    const seed = window.PulseSeed;
    if (!seed) { Pulse.UI.toast("No built-in data available", "warn"); return; }
    Pulse.UI.confirmDialog({
      title: "Restore built-in historical data?",
      message: "This re-imports the workouts and measurements extracted from your Workout Calendar.xlsx. Existing identical records are skipped — nothing is duplicated or deleted.",
      confirmLabel: "Restore data",
      danger: false,
      onConfirm: () => Pulse.Store.importRecords(seed.workouts, seed.measurements).then((res) => {
        Pulse.UI.toast(`Restored: ${res.added} new (${res.skipped} duplicates skipped)`, "success", 4500);
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

  window.Pulse = window.Pulse || {};
  window.Pulse.App = App;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
