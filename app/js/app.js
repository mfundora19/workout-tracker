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
    challenges: ["Challenges", "Monthly goals, special editions and badges"],
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
    },

    rescheduleWorkoutReminder,

    /** Backup reminder rule — delegates to the pure Stats helper. */
    shouldShowBackupReminder(iso) {
      const s = Focus.Store.settings;
      return S().backupReminderDue(iso, {
        enabled: s.backupReminder,
        lastBackupAt: s.lastBackupAt,
        lastShownAt: s.lastBackupReminderAt,
        // backupReminderDays is the interval in the selected unit (days/weeks/years)
        days: s.backupReminderDays * (S().REMINDER_UNIT_DAYS[s.backupReminderUnit] || 1)
      });
    },

    maybeShowBackupReminder() {
      const today = S().todayISO();
      if (!App.shouldShowBackupReminder(today)) return;
      Focus.Store.setSetting("lastBackupReminderAt", today);
      Focus.UI.showBackupBanner();
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
    applyChallengePref();
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
    showView(VIEW_META[v] ? v : "dashboard"); // also triggers the backup banner check
    rescheduleWorkoutReminder();

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

  /* Monthly challenges & badges are opt-out (Settings › Preferences). The flag
   * lives on <html> so the static nav entry hides with a CSS rule too. */
  function applyChallengePref() {
    document.documentElement.setAttribute("data-challenges", Focus.Store.settings.challengesEnabled === false ? "off" : "on");
  }

  /* Daily workout reminder: one Notification at the configured time, then
   *  rescheduled for the next day. Never throws — reminders must not break boot. */
  let workoutReminderTimer = null;
  function rescheduleWorkoutReminder() {
    if (workoutReminderTimer) { clearTimeout(workoutReminderTimer); workoutReminderTimer = null; }
    try {
      const s = Focus.Store.settings;
      if (!s || s.workoutReminder !== true) return;
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const m = /^(\d{2}):(\d{2})$/.exec(s.workoutReminderTime || "");
      if (!m) return;
      const now = new Date();
      const next = new Date(now);
      next.setHours(Number(m[1]), Number(m[2]), 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      workoutReminderTimer = setTimeout(() => {
        try {
          const n = new Notification("Time to train \uD83D\uDCAA", { body: "Log today's workout in Focus." });
          n.onclick = () => window.focus();
        } catch (e) { /* notifications unavailable here */ }
        rescheduleWorkoutReminder();
      }, Math.min(next - now, 2147483647));
    } catch (e) { /* never break the app for a reminder */ }
  }

  function initTheme() {
    const sysPref = () => (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    let saved = Focus.Store.settings.theme;
    // Legacy installs stored null (follow-system); normalize to "system".
    if (saved !== "light" && saved !== "dark" && saved !== "system") {
      saved = "system";
      Focus.Store.setSetting("theme", "system");
    }
    document.documentElement.setAttribute("data-theme", saved === "system" ? sysPref() : saved);
    document.documentElement.setAttribute("data-accent", Focus.Store.settings.accent || "violet");
    applyMotionPref();
    // Follow OS theme changes live while in System mode.
    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const onChange = () => {
        if ((Focus.Store.settings.theme || "system") === "system") {
          document.documentElement.setAttribute("data-theme", mq.matches ? "light" : "dark");
        }
      };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
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
    if (name === "dashboard") Focus.UI.markDashEnter(); // staggered card entrance
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
    // Surface the backup-reminder banner when the dashboard is shown (gated by
    // the once-per-day stamp inside maybeShowBackupReminder).
    if (name === "dashboard") App.maybeShowBackupReminder();
  }

  function renderCurrent() {
    const v = App.currentView;
    if (v === "dashboard") Focus.UI.renderDashboard();
    else if (v === "calendar") Focus.UI.renderCalendar();
    else if (v === "challenges") Focus.UI.renderChallenges();
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

  /** Refresh the collapsed picker summary (mini badges / "Select types…"). */
  function updateTypeSummary(picker) {
    const hidden = document.getElementById(picker + "Type");
    const value = document.getElementById(picker + "PickerValue");
    if (!hidden || !value) return;
    value.innerHTML = U().typeSummaryHTML(hidden.value || "");
  }

  function initGlobalDelegation() {
    document.addEventListener("click", (e) => {
      const target = e.target.closest("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      const id = target.dataset.id;

      switch (action) {
        case "toggle-challenge-year":
          Focus.UI.toggleChallengeYear(target.dataset.year);
          break;
        case "goto-challenges":
          showView("challenges");
          break;
        case "add-challenge":
          Focus.UI.openChallengeForm();
          break;
        case "edit-challenge": {
          const challenge = Focus.Store.challenges.find((entry) => entry.id === id);
          if (challenge) Focus.UI.openChallengeForm(challenge);
          break;
        }
        case "toggle-challenge-complete": {
          const challenge = Focus.Store.challenges.find((entry) => entry.id === id);
          // The stamping date rule lives in Focus.UI.toggleChallengeComplete so the
          // form and the list can never drift apart.
          if (challenge) Focus.UI.toggleChallengeComplete(challenge).catch((error) => Focus.UI.toast(error.message || "Could not update challenge", "error"));
          break;
        }
        case "delete-challenge": {
          const challenge = Focus.Store.challenges.find((entry) => entry.id === id);
          if (!challenge) break;
          const special = Focus.Store.challengeKindOf(challenge) === "special";
          const when = `${S().MONTHS_LONG[challenge.month - 1]} ${challenge.year}`;
          Focus.UI.confirmDialog({ title: special ? "Remove special challenge?" : "Remove monthly challenge?", message: special ? `Remove the “${challenge.name}” special edition (${when})? This cannot be undone.` : `Remove “${challenge.description}” from ${when}? This cannot be undone.`, confirmLabel: "Remove challenge", onConfirm: () => Focus.Store.deleteChallenge(id).then(() => Focus.UI.toast("Challenge removed", "warn")).catch((error) => Focus.UI.toast(error.message || "Could not remove challenge", "error")) });
          break;
        }
        case "food-log": {
          const status = target.dataset.status === "true" ? true : target.dataset.status === "some" ? "some" : target.dataset.status === "false" ? false : target.dataset.status === "clear" ? null : undefined;
          Focus.Store.setNoJunkFoodDay(target.dataset.date, status).then(() => {
            Focus.UI.toast(status === true ? "No junk food logged 🥗" : status === "some" ? "Some junk food logged" : status === false ? "Junk food logged" : "Food log cleared");
            renderCurrent();
          }).catch((err) => Focus.UI.toast(err.message, "warn"));
          break;
        }
        case "toggle-food-goal": {
          const goals = Object.assign({}, Focus.Store.settings.goals || {}, {
            avoidJunkFood: !(Focus.Store.settings.goals && Focus.Store.settings.goals.avoidJunkFood !== false)
          });
          Focus.Store.setSettings({ goals }).then(() => {
            Focus.UI.toast("Daily no-junk-food goal " + (goals.avoidJunkFood ? "on" : "off"));
            renderCurrent();
          });
          break;
        }
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
          updateTypeSummary(picker);
          break;
        }
        case "toggle-picker": {
          // Expand/collapse the workout-type chip list (collapsed by default).
          const picker = target.dataset.picker;
          const body = document.getElementById(picker + "Picker");
          if (!body) break;
          const open = body.hidden;
          body.hidden = !open;
          target.classList.toggle("is-open", open);
          target.setAttribute("aria-expanded", open);
          if (open) body.querySelector(".type-chip")?.focus({ preventScroll: true });
          break;
        }
        case "remove-type": {
          // Manage the picker list ONLY — hide a custom type everywhere.
          // This must never touch the current workout's selection: removing
          // a chip from the list is not the same as removing the type from
          // this workout (and silently emptying the selection would turn the
          // workout into "Other" on save).
          const picker = target.dataset.picker;
          const t = target.dataset.type;
          const stg = Focus.Store.settings;
          const customTypes = (stg.customTypes || []).filter((x) => x !== t);
          const removedTypes = [...(stg.removedTypes || []).filter((x) => x !== t), t];
          Focus.Store.setSettings({ customTypes, removedTypes });
          const container = document.getElementById(picker + "Picker");
          if (container) container.querySelectorAll(".type-chip").forEach((c) => { if (c.dataset.type === t) c.remove(); });
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
          // Persist the custom type so it shows up in every picker.
          const stg = Focus.Store.settings;
          const customTypes = [...(stg.customTypes || []).filter((x) => x !== name), name];
          const removedTypes = (stg.removedTypes || []).filter((x) => x !== name);
          Focus.Store.setSettings({ customTypes, removedTypes });
          const cur = new Set((hidden.value || "").split(",").map((s2) => s2.trim()).filter(Boolean));
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
            // Always attach the ✕ (CSS hides it while the chip is selected,
            // so it can only be used to manage the list, not the workout).
            const x = document.createElement("span");
            x.className = "type-chip-x";
            x.dataset.action = "remove-type";
            x.dataset.picker = picker;
            x.dataset.type = name;
            x.title = "Remove " + name + " from the list";
            x.textContent = "✕";
            chip.appendChild(x);
            container.querySelector(".type-picker")?.appendChild(chip);
          }
          cur.add(name);
          hidden.value = Focus.Store.normalizeTypes(Array.from(cur).join(", "));
          if (input) input.value = "";
          updateTypeSummary(picker);
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
          if (next === "light" || next === "dark" || next === "system") {
            const resolved = next === "system"
              ? (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
              : next;
            document.documentElement.setAttribute("data-theme", resolved);
            Focus.Store.setSetting("theme", next);
            renderCurrent();
          }
          break;
        }
        case "settings-tab": {
          Focus.UI.state.settingsTab = target.dataset.tab;
          renderCurrent();
          break;
        }
        case "set-workout-reminder": {
          const on = target.dataset.setWorkoutReminder === "on";
          const apply = () => Focus.Store.setSetting("workoutReminder", on).then(() => {
            Focus.UI.toast(on ? "Workout reminder on \uD83D\uDD14" : "Workout reminder off");
            rescheduleWorkoutReminder();
            renderCurrent();
          });
          if (on && "Notification" in window && Notification.permission === "default") {
            Notification.requestPermission().then((perm) => {
              if (perm !== "granted") Focus.UI.toast("Browser blocked notifications — reminder saved but can't pop up", "warn");
              apply();
            }).catch(apply);
          } else apply();
          break;
        }
        case "test-reminder": {
          try {
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("Time to train \uD83D\uDCAA", { body: "This is how your daily Focus reminder looks." });
            } else {
              Focus.UI.toast("Time to train \uD83D\uDCAA — enable browser notifications to see pop-ups", "warn");
            }
          } catch (e) { Focus.UI.toast("Notifications aren't available here", "warn"); }
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
        case "set-challenges": {
          const on = target.dataset.setChallenges === "on";
          Focus.Store.setSetting("challengesEnabled", on);
          applyChallengePref();
          // Disabling from the Challenges view itself: leave the now-off view.
          if (!on && App.currentView === "challenges") showView("dashboard");
          Focus.UI.toast(on ? "Challenges back on 🏆" : "Challenges turned off");
          renderCurrent();
          break;
        }
        case "set-animations": {
          const on = target.dataset.setAnimations === "on";
          Focus.Store.setSetting("animations", on);
          applyMotionPref();
          renderCurrent();
          break;
        }
        case "set-backup-reminder": {
          const on = target.dataset.setBackupReminder === "on";
          Focus.Store.setSetting("backupReminder", on);
          Focus.UI.closeModal(); // safety: close any open modal
          Focus.UI.hideBackupBanner(); // "Turn off reminders" on the banner
          Focus.UI.toast(on ? "Backup reminders on" : "Backup reminders turned off");
          renderCurrent();
          break;
        }
        case "dismiss-backup-banner":
          // "Not now" / ✕ — hide the banner and remember it was shown today.
          Focus.Store.setSetting("lastBackupReminderAt", S().todayISO());
          Focus.UI.hideBackupBanner();
          break;
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
        case "set-week-start": {
          const next = target.dataset.weekStart;
          if (next === "monday" || next === "sunday") {
            Focus.Store.setSetting("weekStartsOn", next).then(() => {
              Focus.UI.toast("Week now starts on " + (next === "monday" ? "Monday" : "Sunday"));
              renderCurrent();
            });
          }
          break;
        }
        case "save-profile": {
          const hEl = document.getElementById("setHeight");
          const huEl = document.getElementById("setHeightUnit");
          const aEl = document.getElementById("setAge");
          const hVal = hEl ? parseFloat(hEl.value) : NaN;
          const hu = huEl && huEl.value === "in" ? "in" : "cm";
          const ageVal = aEl && aEl.value !== "" ? parseFloat(aEl.value) : NaN;
          if (!isFinite(hVal) || hVal <= 0 || hVal >= 300) {
            Focus.UI.toast("Enter a realistic height (in " + hu + ")", "warn");
            break;
          }
          if (isFinite(ageVal) && (ageVal < 10 || ageVal > 120)) {
            Focus.UI.toast("Age should be between 10 and 120", "warn");
            break;
          }
          const nEl = document.getElementById("setNeck");
          const nuEl = document.getElementById("setNeckUnit");
          const nu = nuEl && nuEl.value === "in" ? "in" : "cm";
          const nRaw = nEl ? nEl.value : "";
          const nVal = nRaw === "" ? null : parseFloat(nRaw);
          if (nVal != null && (!isFinite(nVal) || nVal <= 0 || nVal >= 300)) {
            Focus.UI.toast("Enter a realistic neck (in " + nu + ")", "warn");
            break;
          }
          Focus.Store.setSettings({
            height: hVal,
            heightUnit: hu,
            age: isFinite(ageVal) ? ageVal : null,
            neck: nVal,
            neckUnit: nu
          }).then(() => {
            Focus.UI.toast("Profile saved — BMI & body-fat tools will use your height & neck");
            renderCurrent();
          });
          break;
        }
        case "save-goals": {
          const num = (v) => (v === "" || v == null || !isFinite(Number(v)) ? null : Math.max(0, Number(v)));
          const previousGoals = Focus.Store.settings.goals || {};
          const goals = {
            calPerDay: num(document.getElementById("goalCal") ? document.getElementById("goalCal").value : ""),
            durPerDay: num(document.getElementById("goalDur") ? document.getElementById("goalDur").value : ""),
            workoutsPerWeek: num(document.getElementById("goalWk") ? document.getElementById("goalWk").value : ""),
            weight: num(document.getElementById("goalWeight") ? document.getElementById("goalWeight").value : ""),
            goalWeightUnit: document.getElementById("goalWeightUnit") && document.getElementById("goalWeightUnit").value === "kg" ? "kg" : "lb",
            avoidJunkFood: previousGoals.avoidJunkFood !== false
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
          if (App.currentView === "calendar") renderCurrent();
          else showView("calendar");
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
          downloadBlob(blob, "focus-workout-" + S().todayISO() + ".json");
          Focus.App.setSetting("lastBackupAt", new Date().toISOString());
          Focus.UI.closeModal(); // safety: close any open modal
          Focus.UI.hideBackupBanner(); // "Back up now" on the banner
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

    // calendar day click / keyboard — clicking a day selects it; tapping
    // anywhere else (not another day, not a control, not the modal) while a
    // day is selected clears the selection so the right pane shows the
    // whole-month summary again.
    document.addEventListener("click", (e) => {
      const day = e.target.closest("[data-calday]");
      if (day) {
        Focus.UI.state.calDay = day.dataset.day;
        Focus.UI.renderCalendar();
      } else if (
        Focus.UI.state.calDay &&
        !e.target.closest("[data-action], [data-cal-mode], button, a, input, select, textarea, label, #modalBackdrop")
      ) {
        Focus.UI.state.calDay = null;
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
    // heat cell click -> jump to that day in month view (from Analytics it
    // also switches to the Calendar view, like the month cards do).
    document.addEventListener("click", (e) => {
      const cell = e.target.closest("[data-calinfo]");
      if (cell) {
        const iso = cell.dataset.day;
        Focus.UI.state.calMode = "month";
        Focus.UI.state.calMonth = Number(iso.slice(5, 7));
        Focus.UI.state.calDay = iso;
        if (App.currentView === "calendar") renderCurrent();
        else showView("calendar");
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
