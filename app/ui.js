/* =========================================================================
 * Focus.UI — rendering layer
 * -------------------------------------------------------------------------
 * Every renderer reads the current data + selected year and repaints its
 * view container. Forms, dialogs and toasts are built here; event wiring
 * lives in app.js through data-action attributes.
 * ========================================================================= */
(function () {
  "use strict";
  const Store = () => Focus.Store;
  const St = () => Focus.Stats;
  const C = () => Focus.Charts;

  /* ---------------- shared state ---------------- */

  const state = {
    calMode: "year",
    calMonth: new Date().getMonth() + 1,
    calDay: null,
    progType: null,
    anaA: null,
    anaB: null,
    importPending: null,
    qaMode: "workout",
    accentOpen: false
  };

  /* ---------------- type styles ---------------- */

  const TYPE_STYLES = {
    Back: { color: "#8b5cf6", emoji: "🧗" },
    Chest: { color: "#6366f1", emoji: "🏋️" },
    Legs: { color: "#f97316", emoji: "🦵" },
    Biceps: { color: "#ec4899", emoji: "💪" },
    Triceps: { color: "#0ea5e9", emoji: "🦾" },
    Forearms: { color: "#06b6d4", emoji: "🤜" },
    Abs: { color: "#84cc16", emoji: "🧘" },
    Cardio: { color: "#f43f5e", emoji: "❤️" },
    // Legacy types — still styled so historical records keep their colors.
    Strength: { color: "#a855f7", emoji: "🏋️‍♂️" },
    Arms: { color: "#0ea5e9", emoji: "🦾" },
    Running: { color: "#eab308", emoji: "🏃" },
    Walking: { color: "#14b8a6", emoji: "🚶" },
    Cycling: { color: "#06b6d4", emoji: "🚴" },
    Swimming: { color: "#38bdf8", emoji: "🏊" },
    Sports: { color: "#84cc16", emoji: "🏀" },
    HIIT: { color: "#d946ef", emoji: "⚡" },
    Other: { color: "#64748b", emoji: "✳️" }
  };
  const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b", "#84cc16", "#f43f5e", "#06b6d4"];

  function typeStyle(type) {
    if (TYPE_STYLES[type]) return TYPE_STYLES[type];
    let h = 0;
    for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
    return { color: PALETTE[h % PALETTE.length], emoji: "🔹" };
  }

  /** Split a stored type string ("Back, Biceps") into individual types. */
  function splitTypes(str) {
    return String(str == null ? "" : str).split(",").map((s) => s.trim()).filter(Boolean);
  }

  function existingTypes() {
    const set = new Set();
    Store().workouts.forEach((w) => splitTypes(w.type).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }
  function existingMeasTypes() {
    return Array.from(new Set(Store().measurements.map((m) => m.type))).sort();
  }

  /* ---------------- small helpers ---------------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  const ICONS = {
    pencil: '<svg viewBox="0 0 24 24"><path d="M17 3l4 4L8 20l-5 1 1-5L17 3z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    flame: '<svg viewBox="0 0 24 24"><path d="M12 22c4 0 7-2.7 7-7 0-3.5-2.5-6-4-8-.6 1.4-1.5 2.6-2.5 3.5.3-3-1-7-3.5-8.5C9 5 12 8 9 15c-1-1.5-1.5-3-1.5-4.5C5 12.5 5 18 12 22z"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    zap: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
    dumbbell: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M6.5 17.5l11-11"/><circle cx="5" cy="5" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/></svg>',
    scale: '<svg viewBox="0 0 24 24"><path d="M12 3v18M8 21h8M6 7h12M6 7l-3 6a4 4 0 0 0 6 0L6 7zM18 7l-3 6a4 4 0 0 0 6 0l-3-6z"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>',
    upload: '<svg viewBox="0 0 24 24"><path d="M12 15V3m0 0L8 7m4-4l4 4M4 21h16"/></svg>',
    database: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/></svg>',
    activity: '<svg viewBox="0 0 24 24"><path d="M3 13h4l2-6 4 12 2-6h6"/></svg>',
    target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    trophy: '<svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4zM7 6H4a2 2 0 0 0 2 4M17 6h3a2 2 0 0 1-2 4"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>'
  };
  function icon(name, cls) {
    return `<span class="${cls || "stat-icon"}">${ICONS[name] || ICONS.activity}</span>`;
  }

  /* ---------------- modal & toast ---------------- */

  function openModal(html, opts = {}) {
    const backdrop = document.getElementById("modalBackdrop");
    const modal = document.getElementById("modal");
    modal.innerHTML = html;
    if (opts.wide) modal.classList.add("wide"); else modal.classList.remove("wide");
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    const close = () => {
      backdrop.hidden = true;
      document.body.style.overflow = "";
      modal.classList.remove("wide");
      modal.innerHTML = "";
      if (opts.onClose) opts.onClose();
    };
    backdrop.onclick = (e) => { if (e.target === backdrop && !opts.sticky) close(); };
    modal.querySelectorAll("[data-close]").forEach((b) => (b.onclick = close));
    const f = modal.querySelector("form");
    if (f) {
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        if (opts.onSubmit) opts.onSubmit(f, { close });
      });
    }
    if (opts.onOpen) opts.onOpen(modal);
    const first = modal.querySelector("input:not([type=hidden]), select, textarea");
    if (first) setTimeout(() => first.focus(), 30);
    return { close, modal };
  }

  function closeModal() {
    const b = document.getElementById("modalBackdrop");
    b.hidden = true;
    document.body.style.overflow = "";
    document.getElementById("modal").classList.remove("wide");
  }

  function toast(msg, type = "success", ms = 3200) {
    const region = document.getElementById("toastRegion");
    const t = document.createElement("div");
    t.className = "toast " + type;
    const ic = type === "success" ? ICONS.check : type === "error" ? ICONS.x : ICONS.zap;
    t.innerHTML = `${ic}<span>${esc(msg)}</span>`;
    region.appendChild(t);
    setTimeout(() => {
      t.classList.add("out");
      setTimeout(() => t.remove(), 300);
    }, ms);
  }

  function confirmDialog({ title, message, confirmLabel = "Delete", danger = true, onConfirm }) {
    openModal(`
      <h2>${esc(title)}</h2>
      <p class="modal-sub">${esc(message)}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="confirmBtn">${esc(confirmLabel)}</button>
      </div>`, {
      onOpen: (m) => {
        m.querySelector("#confirmBtn").addEventListener("click", () => {
          closeModal();
          onConfirm();
        });
      }
    });
  }

  /* ---------------- workout form ---------------- */

  const TYPE_OPTIONS = ["Back", "Chest", "Legs", "Biceps", "Triceps", "Forearms", "Abs", "Cardio"];

  /** Toggle-chip multi-select for workout types. `prefix` scopes the ids
   *  ("wf" for the modal form, "qa" for quick add). */
  function typePickerHTML(prefix, selected) {
    const sel = new Set(selected || []);
    const all = Array.from(new Set([...TYPE_OPTIONS, ...existingTypes()]));
    return `<div class="type-picker" id="${prefix}Picker">` + all.map((t) => {
      const st = typeStyle(t);
      return `<button type="button" class="type-chip${sel.has(t) ? " is-on" : ""}" data-action="toggle-type" data-picker="${prefix}" data-type="${esc(t)}" style="--tc:${st.color}" title="${esc(t)}"><span class="tcdot"></span>${st.emoji} ${esc(t)}</button>`;
    }).join("") + `</div>`;
  }

  /** Individual type badges for a stored type string ("Back, Biceps"). */
  function typeBadgesHTML(typeStr) {
    const parts = splitTypes(typeStr);
    return (parts.length ? parts : ["Other"]).map((t) => {
      const st = typeStyle(t);
      return `<span class="type-badge badge"><span class="dot" style="background:${st.color}"></span>${st.emoji} ${esc(t)}</span>`;
    }).join("");
  }

  function workoutFormHTML(values = {}) {
    const selected = splitTypes(values.type || "");
    return `
      <h2>${values.id ? "Edit workout" : "Add workout"}</h2>
      <p class="modal-sub">${values.id ? "Update the details below." : "Quick entry — only date and type are required."}</p>
      <form id="workoutForm">
        <div class="form-grid">
          <div class="field">
            <label for="wfDate">Date *</label>
            <input class="input" id="wfDate" name="date" type="date" required value="${esc(values.date || "")}">
          </div>
          <div class="field" style="grid-column:1/-1">
            <label for="wfTypePicker">Workout type(s) *</label>
            ${typePickerHTML("wf", selected)}
            <div class="type-custom-row">
              <input class="input" id="wfCustomType" type="text" placeholder="Add a custom type…">
              <button type="button" class="btn btn-ghost btn-sm" data-action="add-type" data-picker="wf">Add</button>
            </div>
            <input type="hidden" id="wfType" name="type" value="${esc(values.type || "")}">
          </div>
          <div class="field">
            <label for="wfDuration">Duration (min)</label>
            <input class="input" id="wfDuration" name="duration" type="number" min="0" step="1" placeholder="e.g. 45" value="${values.duration ?? ""}">
          </div>
          <div class="field">
            <label for="wfCalories">Calories</label>
            <input class="input" id="wfCalories" name="calories" type="number" min="0" step="1" placeholder="e.g. 420" value="${values.calories ?? ""}">
          </div>
        </div>
        <div class="field">
          <label for="wfNotes">Notes</label>
          <input class="input" id="wfNotes" name="notes" type="text" placeholder="Optional — how did it feel?" value="${esc(values.notes || "")}">
        </div>
        <p class="form-error" id="wfError" hidden></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
          ${values.id ? "" : '<button type="button" class="btn btn-ghost" id="saveAnother">Save &amp; add another</button>'}
          <button type="submit" class="btn btn-primary">${values.id ? "Save changes" : "Add workout"}</button>
        </div>
      </form>`;
  }

  function openWorkoutForm(values = {}) {
    openModal(workoutFormHTML(values), {
      onSubmit: (f, { close }) => {
        const err = f.querySelector("#wfError");
        const date = f.date.value;
        const type = f.type.value;
        const duration = f.duration.value === "" ? null : Number(f.duration.value);
        const calories = f.calories.value === "" ? null : Number(f.calories.value);
        if (!date) { err.textContent = "Please pick a date."; err.hidden = false; return; }
        if (!type) { err.textContent = "Pick at least one workout type."; err.hidden = false; return; }
        if (duration != null && (!isFinite(duration) || duration < 0)) { err.textContent = "Duration must be a positive number."; err.hidden = false; return; }
        if (calories != null && (!isFinite(calories) || calories < 0)) { err.textContent = "Calories must be a positive number."; err.hidden = false; return; }
        err.hidden = true;
        const data = { date, type, duration, calories, notes: f.notes.value.trim() };
        if (values.id) {
          Store().updateWorkout(values.id, data).then(() => toast("Workout updated"));
          close();
        } else {
          Store().addWorkout(data).then(() => toast("Workout added 💪"));
          close();
        }
      },
      onOpen: (m) => {
        m.querySelector("#saveAnother")?.addEventListener("click", () => {
          const f = m.querySelector("#workoutForm");
          f.querySelector("#wfError").hidden = true;
          const date = f.date.value, type = f.type.value;
          const duration = f.duration.value === "" ? null : Number(f.duration.value);
          const calories = f.calories.value === "" ? null : Number(f.calories.value);
          if (!date || !type) { toast("Date and type are required", "warn"); return; }
          if ((duration != null && (!isFinite(duration) || duration < 0)) || (calories != null && (!isFinite(calories) || calories < 0))) {
            toast("Numbers must be positive", "warn");
            return;
          }
          Store().addWorkout({ date, type, duration, calories, notes: f.notes.value.trim() }).then(() => {
            toast("Workout added — keep going 🔥");
            f.duration.value = ""; f.calories.value = ""; f.notes.value = "";
            f.calories.focus();
          });
        });
      }
    });
  }

  /* ---------------- measurement form ---------------- */

  const UNITS = ["", "kg", "lb", "g", "cm", "in", "%", "mm", "m"];
  const UNIT_DEFAULTS = { Weight: "lb", "Body Fat %": "%", Waist: "cm", Chest: "cm", Hips: "cm", Arm: "cm", Thigh: "cm" };

  /** Sensible default unit for a measurement type ('' when unknown). Weight honours the user's preferred unit in Settings. */
  function unitDefault(type) {
    if (type === "Weight") return Store().settings.weightUnit || UNIT_DEFAULTS.Weight;
    return UNIT_DEFAULTS[type] || "";
  }

  const MEAS_TYPE_OPTIONS = ["Weight", "Body Fat %", "Waist", "Chest", "Hips", "Arm", "Thigh"];
  function measurementTypes() {
    return Array.from(new Set([...MEAS_TYPE_OPTIONS, ...existingMeasTypes()]));
  }

  function unitOptsHTML(selected) {
    return UNITS.map((u) => `<option value="${esc(u)}" ${u === selected ? "selected" : ""}>${u === "" ? "None" : esc(u)}</option>`).join("");
  }

  function measurementFormHTML(values = {}) {
    const types = measurementTypes();
    const typeOpts = types.map((t) => `<option value="${esc(t)}" ${t === (values.type || "Weight") ? "selected" : ""}>${t}</option>`).join("");
    // new records default to the sensible unit for the chosen type (e.g. Weight -> lb)
    const unitOpts = unitOptsHTML(values.unit || (!values.id ? unitDefault(values.type || "Weight") : ""));
    return `
      <h2>${values.id ? "Edit measurement" : "Add measurement"}</h2>
      <p class="modal-sub">Measurements can be recorded at any frequency — daily, weekly, monthly.</p>
      <form id="measForm">
        <div class="form-grid">
          <div class="field">
            <label for="mfDate">Date *</label>
            <input class="input" id="mfDate" name="date" type="date" required value="${esc(values.date || "")}">
          </div>
          <div class="field">
            <label for="mfType">Measurement *</label>
            <select class="select" id="mfType" name="type">${typeOpts}
              <option value="__custom__">➕ Custom measurement…</option>
            </select>
            <input class="input" id="mfCustomType" name="customType" type="text" placeholder="Custom name" style="margin-top:8px;display:none">
          </div>
          <div class="field">
            <label for="mfValue">Value *</label>
            <input class="input" id="mfValue" name="value" type="number" step="any" min="0" required placeholder="e.g. 79.8" value="${values.value ?? ""}">
          </div>
          <div class="field">
            <label for="mfUnit">Unit</label>
            <select class="select" id="mfUnit" name="unit">${unitOpts}</select>
          </div>
        </div>
        <div class="field">
          <label for="mfNotes">Notes</label>
          <input class="input" id="mfNotes" name="notes" type="text" placeholder="Optional" value="${esc(values.notes || "")}">
        </div>
        <p class="form-error" id="mfError" hidden></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">${values.id ? "Save changes" : "Add measurement"}</button>
        </div>
      </form>`;
  }

  function openMeasurementForm(values = {}) {
    openModal(measurementFormHTML(values), {
      onSubmit: (f, { close }) => {
        const err = f.querySelector("#mfError");
        const date = f.date.value;
        const type = f.type.value === "__custom__" ? (f.customType.value || "").trim() : f.type.value;
        const value = Number(f.value.value);
        if (!date) { err.textContent = "Please pick a date."; err.hidden = false; return; }
        if (!type) { err.textContent = "Please name the measurement."; err.hidden = false; return; }
        if (!isFinite(value) || value < 0) { err.textContent = "Value must be a positive number."; err.hidden = false; return; }
        err.hidden = true;
        const data = { date, type, value, unit: f.unit.value, notes: f.notes.value.trim() };
        if (values.id) {
          Store().updateMeasurement(values.id, data).then(() => toast("Measurement updated"));
          close();
        } else {
          Store().addMeasurement(data).then(() => toast("Measurement added"));
          close();
        }
      },
      onOpen: (m) => {
        const sel = m.querySelector("#mfType");
        const custom = m.querySelector("#mfCustomType");
        const unit = m.querySelector("#mfUnit");
        sel.addEventListener("change", () => {
          custom.style.display = sel.value === "__custom__" ? "" : "none";
          if (sel.value === "__custom__") custom.focus();
          if (unit) unit.value = unitDefault(sel.value);
        });
      }
    });
  }

  /* =====================================================================
   * DASHBOARD
   * =================================================================== */

  function renderDashboard() {
    const year = Focus.App.year();
    const today = St().todayISO();
    const all = Store().workouts;
    const yStats = St().yearlyStats(all, year);
    const month = Number(today.slice(5, 7));
    const mStats = St().monthlyStats(all, year)[month - 1];
    const { current: streak, longest } = St().streaks(all);

    const curYear = Number(today.slice(0, 4));
    const highlightLimit = year < curYear ? 12 : year > curYear ? 0 : month;
    const greeting = document.getElementById("dashGreeting");
    const h = new Date().getHours();
    const greet = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    const hasData = yStats.workouts > 0;
    greeting.innerHTML = `
      <h2>${greet} 👋</h2>
      <p>${hasData
        ? `You've logged <strong>${St().fmtNum(yStats.workouts)} workouts</strong> (${St().fmtNum(yStats.days)} days) in ${year} — ${yStats.workouts ? yStats.calories.toLocaleString() + " kcal burned" : "no calories yet"} so far.`
        : `No workouts recorded in ${year} yet. Start by adding your first one.`}</p>`;

    const grid = document.getElementById("dashGrid");
    const parts = [];

    // --- Quick add card ---
    parts.push(quickAddCardHTML());

    // --- Stat cards (5, evenly spaced with side margins) ---
    // "This week" is scoped to the selected year, matching "This month".
    const wk = St().weeklyStats(all.filter((w) => St().yearOf(w.date) === year), today);
    const best = yStats.bestMonth;
    const prevYear = year - 1;
    const prev = St().yearlyStats(all, prevYear);
    const cmpDelta = yStats.workouts - prev.workouts;

    parts.push(`<div class="dash-stats">
      ${statCard({
        title: "This week", icon: "activity", cls: "",
        rows: [
          { label: "Workouts", value: St().fmtNum(wk.cur.workouts), delta: wk.cur.workouts - wk.prev.workouts },
          { label: "Workout days", value: St().fmtNum(wk.cur.days) },
          { label: "Calories", value: wk.cur.calories ? St().fmtNum(wk.cur.calories) : "0" },
          { label: "Duration", value: wk.cur.duration ? St().fmtDuration(wk.cur.duration) : "—" },
          { label: "Avg kcal / workout", value: wk.cur.workouts ? St().fmtNum(Math.round(wk.cur.calories / wk.cur.workouts)) : "—" }
        ]
      })}
      ${statCard({
        title: "This month", icon: "calendar", cls: "green",
        rows: [
          { label: "Workouts", value: St().fmtNum(mStats.workouts) },
          { label: "Calories", value: mStats.calories ? St().fmtNum(mStats.calories) : "0" },
          { label: "Duration", value: mStats.duration ? St().fmtDuration(mStats.duration) : "—" },
          { label: "Avg kcal / workout", value: mStats.avgCal ? St().fmtNum(mStats.avgCal, 0) : "—" },
          { label: "Workout days", value: St().fmtNum(mStats.days) + " / " + St().daysInMonth(year, month) },
          { label: "Best streak", value: mStats.bestStreak ? mStats.bestStreak + " days" : "—" }
        ]
      })}
      ${statCard({
        title: year + " totals", icon: "trophy", cls: "",
        rows: [
          { label: "Workouts", value: St().fmtNum(yStats.workouts) },
          { label: "Workout days", value: St().fmtNum(yStats.days) },
          { label: "Calories", value: yStats.calories ? St().fmtNum(yStats.calories) : "0" },
          { label: "Duration", value: yStats.duration ? St().fmtDuration(yStats.duration) : "—" },
          { label: "Avg workouts / month", value: St().fmtNum(yStats.avgWorkoutsPerMonth, 1) },
          { label: "Best month", value: best ? best.label + " (" + St().fmtNum(best.days) + "d)" : "—" }
        ]
      })}
      ${statCard({
        title: "Streaks", icon: "flame", cls: "amber",
        rows: [
          { label: "Current streak", value: streak ? streak + " days" : "0 days", emoji: streak ? "🔥" : "" },
          { label: "Longest streak", value: longest ? longest + " days" : "—" },
          { label: "Year best", value: yStats.longestStreak ? yStats.longestStreak + " days" : "—" },
          { label: "Frequency (YTD)", value: yStats.days ? Math.round((yStats.days / St().dayOfYear(today)) * 100) + "% of days" : "—" }
        ]
      })}
      ${statCard({
        title: year + " vs " + prevYear, icon: "activity", cls: "",
        rows: [
          { label: "Workouts", value: St().fmtNum(yStats.workouts) + " vs " + St().fmtNum(prev.workouts), delta: cmpDelta },
          { label: "Calories", value: St().fmtNum(yStats.calories) + " vs " + St().fmtNum(prev.calories), delta: yStats.calories - prev.calories },
          { label: "Workout days", value: St().fmtNum(yStats.days) + " vs " + St().fmtNum(prev.days), delta: yStats.days - prev.days },
          { label: "Longest streak", value: yStats.longestStreak + " vs " + prev.longestStreak }
        ]
      })}
      ${goalsCardHTML()}
    </div>`);

    // --- Charts (side by side) ---
    parts.push(`
      <div class="dash-charts">
        <div class="card">
          <div class="card-title"><h3>Workouts per month · ${year}</h3><span class="sub">Click Analytics for more</span></div>
          <div class="chart-wrap" id="dashChartMonthly"></div>
        </div>
        <div class="card">
          <div class="card-title"><h3>Cumulative calories · ${year}</h3><span class="sub">YTD total</span></div>
          <div class="chart-wrap" id="dashChartCumulative"></div>
        </div>
      </div>`);

    // --- Recent activity (3 most recent workout days) ---
    const recent = recentDays(all, 3);
    parts.push(`
      <div class="card big-card">
        <div class="card-title"><h3>Recent activity</h3><span class="sub">last 3 days</span></div>
        <div id="dashRecent">${recent.length ? recentRows(recent) : `<div class="chart-empty">No workouts yet.</div>`}</div>
      </div>`);

    grid.innerHTML = parts.join("");

    // charts
    const ms = St().monthlyStats(all, year);
    C().barChart(document.getElementById("dashChartMonthly"), ms.map((m) => m.label), [{
      name: "Workouts", values: ms.map((m) => m.workouts), color: "var(--accent)"
    }], { height: 190, valueFmt: (v) => v + " workouts", highlight: ms.map((m, i) => i).filter((i) => i < highlightLimit) });
    C().lineChart(document.getElementById("dashChartCumulative"), ms.map((m) => m.label), [{
      name: "kcal", values: ms.map((m, i) => ms.slice(0, i + 1).reduce((s, x) => s + x.calories, 0)), color: "var(--success)"
    }], { height: 190, valueFmt: (v) => St().fmtNum(v) + " kcal", area: true });
  }

  function quickAddCardHTML() {
    const mOpts = measurementTypes().map((t) => `<option value="${esc(t)}" ${t === "Weight" ? "selected" : ""}>${t}</option>`).join("");
    const mUnitOpts = unitOptsHTML(unitDefault("Weight"));
    const mode = state.qaMode;
    return `
      <div class="card quick-add big-card">
        <div class="card-title">
          <h3>⚡ Quick add</h3>
          <div class="seg" role="group" aria-label="Quick add type">
            <button type="button" class="seg-btn ${mode === "workout" ? "is-active" : ""}" data-qamode="workout">💪 Workout</button>
            <button type="button" class="seg-btn ${mode === "measurement" ? "is-active" : ""}" data-qamode="measurement">📏 Measurement</button>
          </div>
        </div>
        <form id="quickAddForm" ${mode === "workout" ? "" : "hidden"}>
          <div class="form-grid">
            <div class="field">
              <label for="qaDate">Date</label>
              <input class="input" id="qaDate" name="date" type="date" value="${St().todayISO()}">
            </div>
            <div class="field" style="grid-column:1/-1">
              <label for="qaTypePicker">Type</label>
              ${typePickerHTML("qa", [])}
              <div class="type-custom-row">
                <input class="input" id="qaCustomType" type="text" placeholder="Add a custom type…">
                <button type="button" class="btn btn-ghost btn-sm" data-action="add-type" data-picker="qa">Add</button>
              </div>
              <input type="hidden" id="qaType" name="type" value="">
            </div>
            <div class="field">
              <label for="qaDuration">Duration (min)</label>
              <input class="input" id="qaDuration" name="duration" type="number" min="0" step="1" placeholder="45">
            </div>
            <div class="field">
              <label for="qaCalories">Calories</label>
              <input class="input" id="qaCalories" name="calories" type="number" min="0" step="1" placeholder="420">
            </div>
          </div>
          <div class="quick-actions">
            <button type="submit" class="btn btn-primary">${ICONS.plus} Add workout</button>
          </div>
        </form>
        <form id="quickMeasForm" ${mode === "measurement" ? "" : "hidden"}>
          <div class="form-grid">
            <div class="field">
              <label for="qmDate">Date</label>
              <input class="input" id="qmDate" name="date" type="date" value="${St().todayISO()}">
            </div>
            <div class="field">
              <label for="qmType">Measurement</label>
              <select class="select" id="qmType" name="type">${mOpts}
                <option value="__custom__">➕ Custom…</option>
              </select>
              <input class="input" id="qmCustomType" name="customType" type="text" placeholder="Custom type" style="margin-top:8px;display:none">
            </div>
            <div class="field">
              <label for="qmValue">Value</label>
              <input class="input" id="qmValue" name="value" type="number" step="any" min="0" placeholder="e.g. 149.2">
            </div>
            <div class="field">
              <label for="qmUnit">Unit</label>
              <select class="select" id="qmUnit" name="unit">${mUnitOpts}</select>
            </div>
          </div>
          <div class="quick-actions">
            <button type="submit" class="btn btn-primary">${ICONS.plus} Add measurement</button>
          </div>
        </form>
      </div>`;
  }

  function statCard({ title, icon: iconName, cls, rows }) {
    return `
      <div class="card stat">
        <div class="stat-top">
          <span class="stat-label">${esc(title)}</span>
          ${icon(iconName, "stat-icon " + cls)}
        </div>
        ${rows.map((r) => `
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;border-bottom:1px dashed var(--border)">
            <span style="font-size:12.5px;color:var(--text-dim)">${r.emoji || ""} ${esc(r.label)}</span>
            <span style="font-weight:700;font-variant-numeric:tabular-nums;font-size:13.5px">${esc(r.value)} ${r.delta != null ? deltaPill(r.delta) : ""}</span>
          </div>`).join("")}
      </div>`;
  }

  function deltaPill(v) {
    if (v === 0) return `<span class="delta flat">±0</span>`;
    const cls = v > 0 ? "up" : "down";
    return `<span class="delta ${cls}">${v > 0 ? "▲" : "▼"} ${St().fmtNum(Math.abs(v))}</span>`;
  }

  /** Progress toward the user's goals (set in Settings). Shown as a stat card. */
  function goalsCardHTML() {
    const g = Store().settings.goals || {};
    const has = g.calPerDay != null || g.durPerDay != null || g.workoutsPerWeek != null;
    if (!has) {
      return statCard({
        title: "Goals", icon: "target", cls: "amber",
        rows: [{ label: "No goals set — add them in Settings", value: "🎯", emoji: "" }]
      });
    }
    const today = St().todayISO();
    const agg = St().dayAggregates(Store().workouts).get(today);
    const cal = agg ? agg.calories : 0;
    const dur = agg ? agg.duration : 0;
    const wk = St().weeklyStats(Store().workouts, today).cur.workouts;
    const row = (label, cur, goal, unit) => {
      if (goal == null) return null;
      const met = cur >= goal;
      return { label, value: `${St().fmtNum(cur)} / ${St().fmtNum(goal)} ${unit}`, emoji: met ? "✅" : "⏳" };
    };
    return statCard({
      title: "Goals", icon: "target", cls: "amber",
      rows: [
        row("Calories (today)", cal, g.calPerDay, "kcal"),
        row("Duration (today)", dur, g.durPerDay, "min"),
        row("Workouts (this week)", wk, g.workoutsPerWeek, "")
      ].filter(Boolean)
    });
  }

  /** Workouts from the most recent N distinct workout days (all workouts on those days). */
  function recentDays(all, n) {
    const seen = new Set();
    const sorted = all.slice().sort((a, b) => b.date.localeCompare(a.date));
    for (const w of sorted) {
      seen.add(w.date);
      if (seen.size >= n) break;
    }
    return sorted.filter((w) => seen.has(w.date));
  }

  function recentRows(list) {
    return list.map((w) => {
      return `
        <div class="wk-row">
          <span class="type-badges">${typeBadgesHTML(w.type)}</span>
          <div class="wk-date"><b>${St().shortDate(w.date)}</b><span>${St().weekdayName(w.date)}</span></div>
          <div class="wk-meta">
            ${w.calories != null ? `<div class="m"><b>${St().fmtNum(w.calories)}</b><span>kcal</span></div>` : ""}
            ${w.duration != null ? `<div class="m"><b>${w.duration}</b><span>min</span></div>` : ""}
          </div>
        </div>`;
    }).join("");
  }

  /* =====================================================================
   * CALENDAR
   * =================================================================== */

  function renderCalendar() {
    const year = Focus.App.year();
    const all = Store().workouts;
    const seg = document.querySelectorAll("#calModeSeg .seg-btn");
    seg.forEach((b) => b.classList.toggle("is-active", b.dataset.calMode === state.calMode));
    document.getElementById("calLegend").innerHTML = `
      <span>No workout</span>
      ${[1, 2, 3, 4].map((l) => `<span class="lvl lvl-${l}"></span>`).join("")}
      <span>More intense →</span>`;

    const body = document.getElementById("calendarBody");
    if (state.calMode === "year") {
      body.innerHTML = yearHeatGrid(all, year, true);
    } else {
      renderMonthView();
    }
  }

  function yearHeatGrid(all, year, interactive) {
    const ms = St().monthlyStats(all, year);
    const g = Store().settings.goals || {};
    // Index of the year's most consistent month (most workout days) for the 🔥 badge.
    const bestIdx = ms.reduce((bi, m, i2) => (m.days > ms[bi].days ? i2 : bi), 0);
    // The single most intense day of the year (most calories) gets a subtle dot.
    let bestDayISO = null, bestCal = -1;
    for (let mo = 1; mo <= 12; mo++) {
      St().monthDayMap(all, year, mo).forEach((info, d) => {
        if (info.calories > bestCal) {
          bestCal = info.calories;
          bestDayISO = year + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        }
      });
    }
    const cards = ms.map((m, i) => {
      const map = St().monthDayMap(all, year, i + 1);
      let goalCnt = 0;
      const cells = [];
      for (let d = 1; d <= St().daysInMonth(year, i + 1); d++) {
        const info = map.get(d);
        const iso = year + "-" + String(i + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        const lvl = info ? info.level : 0;
        if (info && ((g.calPerDay != null && info.calories >= g.calPerDay) || (g.durPerDay != null && info.duration >= g.durPerDay))) goalCnt++;
        const today = year === St().yearOf(St().todayISO()) && d === St().dayOf(St().todayISO()) && i + 1 === St().monthOf(St().todayISO());
        cells.push(`<div class="day ${lvl ? "has-workout lvl-" + lvl : ""} ${today ? "today" : ""} ${info && interactive && iso === bestDayISO ? "best-day" : ""}" ${info ? `data-day="${iso}" data-calinfo="1"` : ""} title="${info ? `${d} · ${St().fmtNum(info.calories)} kcal · ${info.count} workout${info.count > 1 ? "s" : ""}` : ""}">${d}</div>`);
      }
      // Interactive grids (the real calendar) highlight the current month with
      // a colored border only; the analytics heatmap reuses this renderer.
      const isCur = interactive && year === St().yearOf(St().todayISO()) && i + 1 === St().monthOf(St().todayISO());
      // The 🔥 Best badge is a heatmap flourish — analytics only. The goal
      // chip shows in both grids.
      const isBest = !interactive && m.days > 0 && i === bestIdx;
      const foot = [
        isBest ? `<span class="best-chip" title="Most consistent month">🔥 Best</span>` : "",
        goalCnt ? `<span class="goal-chip" title="Days that hit your daily goal">🎯 ${goalCnt}</span>` : ""
      ].filter(Boolean).join("");
      return `
        <div class="card month-card ${isCur ? "is-current" : ""}" ${interactive ? `data-action="openmonth"` : ""} data-month="${i + 1}">
          <div class="month-head"><strong>${m.label}</strong><span class="${m.days ? "" : "rest"}">${m.days ? m.days + "d · " + St().fmtNum(m.calories) + " kcal" : "rest"}</span></div>
          <div class="heat">${cells.join("")}</div>
          <div class="month-foot">${foot}</div>
        </div>`;
    });
    const total = ms.reduce((s, m) => s + m.days, 0);
    const kcal = ms.reduce((s, m) => s + m.calories, 0);
    return `
      ${total === 0 ? `<div class="empty-state card big-card">
        <div class="es-icon">${ICONS.calendar}</div>
        <h3>No workouts in ${year}</h3>
        <p>Your calendar is empty for this year. Add a workout and it will light up here.</p>
        <button class="btn btn-primary" data-action="quick-add">${ICONS.plus} Add your first workout</button>
      </div>` : ""}
      <div class="month-grid">${cards.join("")}</div>`;
  }

  function renderMonthView() {
    const year = Focus.App.year();
    const month = state.calMonth;
    const all = Store().workouts;
    const body = document.getElementById("calendarBody");
    const map = St().monthDayMap(all, year, month);
    const mStats = St().monthlyStats(all, year)[month - 1];
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const dim = St().daysInMonth(year, month);
    const today = St().todayISO();
    const sel = state.calDay;
    const g = Store().settings.goals || {};

    // The month's most intense day (most calories) gets a subtle accent ring.
    let bestD = -1, bestCal = -1;
    map.forEach((info, d) => { if (info.calories > bestCal) { bestCal = info.calories; bestD = d; } });

    let goalHits = 0;
    let cells = "";
    for (let i = 0; i < firstWeekday; i++) cells += `<div class="day-cell empty"></div>`;
    for (let d = 1; d <= dim; d++) {
      const iso = year + "-" + String(month).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const info = map.get(d);
      const isToday = iso === today;
      const isSel = iso === sel;
      const gHit = !!info && ((g.calPerDay != null && info.calories >= g.calPerDay) || (g.durPerDay != null && info.duration >= g.durPerDay));
      if (gHit) goalHits++;
      cells += `
        <div class="day-cell ${info ? "has-wk lvl-" + info.level : ""} ${isToday ? "today" : ""} ${isSel ? "selected" : ""} ${gHit ? "goal-hit" : ""} ${d === bestD ? "best-day" : ""}" data-day="${iso}" data-calday="1" role="button" tabindex="0" aria-label="${iso}${info ? ", " + info.count + " workouts" : ""}">
          <span class="dnum">${d}</span>
          ${gHit ? `<span class="goal-check" title="Daily goal met">✓</span>` : ""}
          ${info ? `<span class="kcal">${St().fmtNum(info.calories)} kcal</span><span class="mini-bar" style="background:var(--heat-${info.level});width:${20 + info.level * 20}%"></span>` : ""}
        </div>`;
    }

    const prevM = month === 1 ? 12 : month - 1;
    const nextM = month === 12 ? 1 : month + 1;
    const prevY = month === 1 ? year - 1 : year;
    const nextY = month === 12 ? year + 1 : year;

    const gLine = (g.calPerDay != null || g.durPerDay != null) ? `
      <div class="goal-summary">${goalHits > 0 ? `<b class="goal-hit-count">🎯 ${goalHits} day${goalHits === 1 ? "" : "s"} hit your daily goal</b>` : `<span class="goal-miss">No days hit your daily goal yet</span>`}</div>` : "";
    const dayPanel = sel ? dayPanelHTML(sel) : `
      <div class="card">
        <h3 style="margin-top:0">${St().MONTHS_LONG[month - 1]} ${year}</h3>
        <div class="day-total" style="margin:12px 0">
          <div class="t"><b>${mStats.workouts}</b><span>workouts</span></div>
          <div class="t"><b>${St().fmtNum(mStats.calories)}</b><span>kcal</span></div>
          <div class="t"><b>${mStats.days}</b><span>days</span></div>
        </div>
        ${gLine}
        <div style="font-size:13px;color:var(--text-dim)">Click a day to see its workouts and add records.</div>
        <div class="day-actions">
          <button class="btn btn-primary" data-action="quick-add">${ICONS.plus} Add workout</button>
          <button class="btn btn-ghost" data-action="add-measurement">${ICONS.scale} Add measurement</button>
        </div>
      </div>`;

    body.innerHTML = `
      <div class="cal-toolbar" style="justify-content:space-between;margin-top:0">
        <div class="year-picker" style="padding:3px">
          <button class="icon-btn" id="calMonthPrev">${ICONS.back}</button>
          <span style="font-weight:700;min-width:130px;text-align:center">${St().MONTHS_LONG[month - 1]} ${year}</span>
          <button class="icon-btn" id="calMonthNext">${ICONS.back.replace('M15 18l-6-6 6-6', 'M9 6l6 6-6 6')}</button>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="cal-year">Back to year view</button>
      </div>
      <div class="month-detail">
        <div>
          <div class="weekdays">${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => `<span>${d}</span>`).join("")}</div>
          <div class="days-grid">${cells}</div>
        </div>
        <div id="dayPanel">${dayPanel}</div>
      </div>`;

    body.querySelector("#calMonthPrev").onclick = () => { state.calMonth = prevM; if (month === 1) Focus.App.setYear(prevY); state.calDay = null; renderCalendar(); };
    body.querySelector("#calMonthNext").onclick = () => { state.calMonth = nextM; if (month === 12) Focus.App.setYear(nextY); state.calDay = null; renderCalendar(); };
  }

  /** Progress vs daily goals for a single day ('' when no goals are set). */
  function dayGoalsHTML(calories, duration) {
    const g = Store().settings.goals || {};
    const rows = [];
    if (g.calPerDay != null) {
      const met = calories >= g.calPerDay;
      rows.push(`<div class="goal-row ${met ? "ok" : ""}"><span>🎯 Calories</span><b>${St().fmtNum(calories)} / ${St().fmtNum(g.calPerDay)} kcal ${met ? "✅" : "⏳"}</b></div>`);
    }
    if (g.durPerDay != null) {
      const met = duration >= g.durPerDay;
      rows.push(`<div class="goal-row ${met ? "ok" : ""}"><span>🎯 Duration</span><b>${St().fmtNum(duration)} / ${St().fmtNum(g.durPerDay)} min ${met ? "✅" : "⏳"}</b></div>`);
    }
    return rows.length ? `<div class="goal-block">${rows.join("")}</div>` : "";
  }

  function dayPanelHTML(iso) {
    const all = Store().workouts.filter((w) => w.date === iso);
    const cal = all.reduce((s, w) => ({ calories: s.calories + (w.calories || 0), duration: s.duration + (w.duration || 0) }), { calories: 0, duration: 0 });
    return `
      <div class="card day-panel">
        <div>
          <h3>${St().weekdayName(iso)}</h3>
          <span style="font-size:13px;color:var(--text-dim)">${St().prettyDate(iso)}</span>
        </div>
        <div class="day-total">
          <div class="t"><b>${all.length}</b><span>workouts</span></div>
          <div class="t"><b>${cal.calories ? St().fmtNum(cal.calories) : "—"}</b><span>kcal</span></div>
          <div class="t"><b>${cal.duration ? St().fmtDuration(cal.duration) : "—"}</b><span>time</span></div>
        </div>
        ${dayGoalsHTML(cal.calories, cal.duration)}
        <div class="day-wk-list">
          ${all.map((w) => {
            return `
            <div class="wk-item">
              <span class="type-badges">${typeBadgesHTML(w.type)}</span>
              <div class="grow"><b>${w.calories != null ? St().fmtNum(w.calories) + " kcal" : ""}${w.duration != null ? " · " + w.duration + " min" : ""}</b>
                <p>${w.notes ? esc(w.notes) : "—"}</p></div>
              <div class="wk-actions">
                <button class="mini-btn" data-action="edit-workout" data-id="${w.id}" title="Edit">${ICONS.pencil}</button>
                <button class="mini-btn danger" data-action="delete-workout" data-id="${w.id}" title="Delete">${ICONS.trash}</button>
              </div>
            </div>`;
          }).join("") || `<div class="chart-empty">No workouts on this day.</div>`}
        </div>
        <div class="day-actions">
          <button class="btn btn-primary" data-action="quick-add" data-date="${iso}">${ICONS.plus} Add workout</button>
          <button class="btn btn-ghost" data-action="add-measurement" data-date="${iso}">${ICONS.scale} Add measurement</button>
        </div>
      </div>`;
  }

  /* =====================================================================
   * TOOLS (BMI calculator + weight converter)
   * =================================================================== */

  const KG_PER_LB = 0.45359237;
  const G_PER_OZ = 28.349523125;

  const BMI_CATS = [
    { max: 16, label: "Severe thinness", desc: "below 16 · underweight", cls: "bad" },
    { max: 17, label: "Moderate thinness", desc: "16 – 17 · underweight", cls: "bad" },
    { max: 18.5, label: "Mild thinness", desc: "17 – 18.5 · underweight", cls: "warn" },
    { max: 25, label: "Normal weight", desc: "18.5 – 25 · healthy range", cls: "ok" },
    { max: 30, label: "Overweight", desc: "25 – 30 · pre-obese", cls: "warn" },
    { max: 35, label: "Obesity class I", desc: "30 – 35 · moderate", cls: "bad" },
    { max: 40, label: "Obesity class II", desc: "35 – 40 · severe", cls: "bad" },
    { max: Infinity, label: "Obesity class III", desc: "40+ · extreme", cls: "bad" }
  ];

  function renderTools() {
    const wt = Store().settings.weightUnit || "lb";
    document.getElementById("toolsBody").innerHTML = `
      <div class="tools-grid">
        <div class="card data-card">
          <h3>BMI calculator</h3>
          <p class="desc">Body Mass Index from height and weight. A rough guide, not a diagnosis.</p>
          <div class="form-grid">
            <div class="field">
              <label for="bmiHeight">Height</label>
              <div class="input-with-unit">
                <input class="input" id="bmiHeight" type="number" step="any" min="0" placeholder="175" value="175">
                <select class="select" id="bmiHeightUnit" aria-label="Height unit">
                  <option value="cm" selected>cm</option>
                  <option value="in">in</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label for="bmiWeight">Weight</label>
              <div class="input-with-unit">
                <input class="input" id="bmiWeight" type="number" step="any" min="0" placeholder="70" value="${wt === "lb" ? "154" : "70"}">
                <select class="select" id="bmiWeightUnit" aria-label="Weight unit">
                  <option value="kg">kg</option>
                  <option value="lb" ${wt === "lb" ? "selected" : ""}>lb</option>
                </select>
              </div>
            </div>
          </div>
          <div class="bmi-result" aria-live="polite">
            <div class="bmi-value"><b id="bmiValue">22.9</b><span>BMI</span></div>
            <div class="bmi-cat-wrap">
              <div class="bmi-cat ok" id="bmiCat">Normal weight</div>
              <div class="bmi-desc" id="bmiDesc">18.5 – 25 · healthy range</div>
            </div>
          </div>
          <p class="bmi-note">💪 Athletes: BMI doesn't measure muscle, so a very muscular build can read “overweight” at low body fat.</p>
        </div>

        <div class="card data-card">
          <h3>Weight converter</h3>
          <p class="desc">Convert between kilograms, pounds, grams and ounces instantly.</p>
          <div class="field">
            <label for="convValue">Value</label>
            <div class="input-with-unit">
              <input class="input" id="convValue" type="number" step="any" min="0" placeholder="80" value="80">
              <select class="select" id="convUnit" aria-label="Source unit">
                <option value="kg" selected>kg</option>
                <option value="lb">lb</option>
                <option value="g">g</option>
                <option value="oz">oz</option>
              </select>
            </div>
          </div>
          <div class="conv-results" id="convResults"></div>
        </div>
      </div>`;
    updateBMI();
    updateConverter();
    const refresh = () => { updateBMI(); updateConverter(); };
    ["bmiHeight", "bmiHeightUnit", "bmiWeight", "bmiWeightUnit", "convValue", "convUnit"].forEach((id) => {
      const n = document.getElementById(id);
      if (!n) return;
      n.addEventListener("input", refresh);
      n.addEventListener("change", refresh);
    });
  }

  function updateBMI() {
    const v = document.getElementById("bmiValue");
    const cat = document.getElementById("bmiCat");
    const desc = document.getElementById("bmiDesc");
    const hEl = document.getElementById("bmiHeight");
    const wEl = document.getElementById("bmiWeight");
    const huEl = document.getElementById("bmiHeightUnit");
    const wuEl = document.getElementById("bmiWeightUnit");
    if (!v || !cat || !desc || !hEl || !wEl || !huEl || !wuEl) return;
    const h = parseFloat(hEl.value);
    const w = parseFloat(wEl.value);
    const meters = huEl.value === "in" ? h * 2.54 / 100 : h / 100;
    const kg = wuEl.value === "lb" ? w * KG_PER_LB : w;
    if (!isFinite(h) || !isFinite(w) || h <= 0 || w <= 0 || !(meters > 0)) {
      v.textContent = "—";
      cat.textContent = "Enter your height and weight";
      desc.textContent = "both fields are needed";
      cat.className = "bmi-cat neutral";
      return;
    }
    const bmi = kg / (meters * meters);
    // categorise by the rounded value actually displayed, so the pill always
    // matches the number on screen (e.g. 24.96 shows 25.0 · Overweight)
    const shown = Number(bmi.toFixed(1));
    v.textContent = shown;
    const c = BMI_CATS.find((c2) => shown < c2.max) || BMI_CATS[BMI_CATS.length - 1];
    cat.textContent = c.label;
    desc.textContent = c.desc;
    cat.className = "bmi-cat " + c.cls;
  }

  function updateConverter() {
    const out = document.getElementById("convResults");
    if (!out) return;
    const val = parseFloat(document.getElementById("convValue").value);
    const unit = document.getElementById("convUnit").value;
    if (!isFinite(val) || val < 0) {
      out.innerHTML = `<div class="chart-empty">Enter a value to convert.</div>`;
      return;
    }
    const kg = unit === "kg" ? val : unit === "lb" ? val * KG_PER_LB : unit === "g" ? val / 1000 : val * G_PER_OZ / 1000;
    const rows = [
      ["Kilograms", kg, "kg"],
      ["Pounds", kg / KG_PER_LB, "lb"],
      ["Grams", kg * 1000, "g"],
      ["Ounces", kg * 1000 / G_PER_OZ, "oz"]
    ];
    out.innerHTML = rows.map(([name, v2, u]) => `
      <div class="conv-row${u === unit ? " source" : ""}"><span>${name}</span><b>${fmtNumber(v2)} ${u}</b></div>`).join("");
  }

  function fmtNumber(n) {
    const s = n.toFixed(2).replace(/\.?0+$/, "");
    return s === "" || s === "-" ? "0" : s;
  }

  /* =====================================================================
   * SETTINGS
   * =================================================================== */

  const ACCENTS = [
    ["violet", "#818cf8"],
    ["orange", "#fb923c"],
    ["green", "#34d399"],
    ["red", "#f87171"],
    ["blue", "#38bdf8"]
  ];

  function renderSettings() {
    const s = Store().settings;
    const theme = document.documentElement.getAttribute("data-theme") || "dark";
    const wt = s.weightUnit || "lb";
    const g = s.goals || {};
    const w = Store().workouts.length, m = Store().measurements.length;
    const accent = s.accent || "violet";
    const anim = s.animations !== false;
    const curColor = (ACCENTS.find(([n]) => n === accent) || ACCENTS[0])[1];
    document.getElementById("settingsBody").innerHTML = `
      <div class="settings-grid">
        <div class="card data-card">
          <h3>Appearance</h3>
          <p class="desc">The look of Focus. Your choice is saved locally and applies instantly.</p>
          <div class="setting-row">
            <div class="setting-label"><b>Theme</b><span>Dark is easy on the eyes; light is crisp.</span></div>
            <div class="seg" role="group" aria-label="Theme">
              <button class="seg-btn ${theme === "dark" ? "is-active" : ""}" data-action="set-theme" data-set-theme="dark">🌙 Dark</button>
              <button class="seg-btn ${theme === "light" ? "is-active" : ""}" data-action="set-theme" data-set-theme="light">☀️ Light</button>
            </div>
          </div>            <div class="setting-row">
            <div class="setting-label"><b>Accent color</b><span>Charts, buttons and the calendar heat follow this color.</span></div>
            <div class="accent-picker ${state.accentOpen ? "open" : ""}">
              ${state.accentOpen ? `
                <div class="swatch-row" role="group" aria-label="Accent color">
                  ${ACCENTS.map(([name, color]) => `<button class="swatch ${accent === name ? "is-active" : ""}" data-action="set-accent" data-accent="${name}" title="${name}" style="--sw:${color}"><span class="sw-dot"></span>${name}</button>`).join("")}
                  <button class="swatch swatch-close" data-action="toggle-accent" title="Collapse" aria-label="Collapse">${ICONS.back.replace("M15 18l-6-6 6-6", "M6 9l6 6 6-6")}</button>
                </div>` : `
                <button class="swatch is-active accent-current" data-action="toggle-accent" title="Change accent color" style="--sw:${curColor}"><span class="sw-dot"></span>${accent}<span class="chev">${ICONS.back}</span></button>`}
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-label"><b>Motion</b><span>Subtle transitions and entrance animations across the app.</span></div>
            <div class="seg" role="group" aria-label="Motion">
              <button class="seg-btn ${anim ? "is-active" : ""}" data-action="set-animations" data-set-animations="on">✨ On</button>
              <button class="seg-btn ${!anim ? "is-active" : ""}" data-action="set-animations" data-set-animations="off">Off</button>
            </div>
          </div>
        </div>

        <div class="card data-card">
          <h3>Units</h3>
          <p class="desc">Default unit for new weight entries in Quick add and the measurement form.</p>
          <div class="setting-row">
            <div class="setting-label"><b>Weight unit</b><span>Only affects new records — existing ones keep their units.</span></div>
            <div class="seg" role="group" aria-label="Weight unit">
              <button class="seg-btn ${wt === "kg" ? "is-active" : ""}" data-action="set-weightunit" data-set-weightunit="kg">kg</button>
              <button class="seg-btn ${wt === "lb" ? "is-active" : ""}" data-action="set-weightunit" data-set-weightunit="lb">lb</button>
            </div>
          </div>
        </div>

        <div class="card data-card">
          <h3>🎯 Goals</h3>
          <p class="desc">Set daily and weekly targets. Progress shows on the dashboard and lights up on the calendar when you beat them.</p>
          <div class="goal-form">
            <div class="goal-field">
              <label for="goalCal">Daily calories</label>
              <div class="input-with-unit">
                <input class="input" id="goalCal" type="number" min="0" step="1" placeholder="e.g. 500" value="${g.calPerDay ?? ""}">
                <span class="suffix">kcal</span>
              </div>
            </div>
            <div class="goal-field">
              <label for="goalDur">Daily duration</label>
              <div class="input-with-unit">
                <input class="input" id="goalDur" type="number" min="0" step="1" placeholder="e.g. 60" value="${g.durPerDay ?? ""}">
                <span class="suffix">min</span>
              </div>
            </div>
            <div class="goal-field">
              <label for="goalWk">Weekly workouts</label>
              <div class="input-with-unit">
                <input class="input" id="goalWk" type="number" min="0" step="1" placeholder="e.g. 5" value="${g.workoutsPerWeek ?? ""}">
                <span class="suffix">days</span>
              </div>
            </div>
            <div class="goal-actions">
              <button class="btn btn-primary" data-action="save-goals">${ICONS.check} Save goals</button>
            </div>
          </div>
        </div>

        <div class="card data-card">
          <h3>Privacy</h3>
          <p class="desc">Focus is designed to be completely private.</p>
          <ul class="about-list">
            <li>🔒 No account, no login, no tracking.</li>
            <li>🚫 No internet connection is ever used.</li>
            <li>💾 Everything is stored in this browser only.</li>
            <li>📦 Move data with the export/import tools in the <b>Data</b> view.</li>
          </ul>
        </div>

        <div class="card data-card">
          <h3>About</h3>
          <p class="desc">Focus — a personal, offline fitness tracker.</p>
          <ul class="about-list">
            <li><b>Data</b> — ${St().fmtNum(w)} workouts · ${St().fmtNum(m)} measurements</li>
            <li><b>Version</b> — 1.0.0</li>
            <li><b>Storage</b> — your browser's IndexedDB</li>
            <li><b>Offline</b> — open <code>Focus-Workout-Tracker.html</code> and it just works</li>
          </ul>
        </div>
      </div>`;
  }

  /* =====================================================================
   * PROGRESS (measurements)
   * =================================================================== */

  function renderProgress() {
    const all = Store().measurements;
    const types = existingMeasTypes();
    if (!state.progType || !types.includes(state.progType)) state.progType = types[0] || null;

    document.getElementById("progressHead").innerHTML = `
      <div class="chip-row">
        ${types.map((t) => `<button class="chip ${state.progType === t ? "is-active" : ""}" data-action="prog-type" data-type="${esc(t)}">${esc(t)}</button>`).join("")}
        ${types.length === 0 ? '<span style="color:var(--text-faint);font-size:13px">No measurements yet</span>' : ""}
      </div>
      <button class="btn btn-primary" data-action="add-measurement">${ICONS.plus} Add measurement</button>`;

    if (!state.progType) {
      document.getElementById("progressChartCard").innerHTML = "";
      document.getElementById("progressStatsCard").innerHTML = "";
      document.getElementById("progressTable").innerHTML = `
        <div class="empty-state card">
          <div class="es-icon">${ICONS.scale}</div>
          <h3>Track your body measurements</h3>
          <p>Weight, body fat, waist, chest… Record them whenever you like — daily, weekly, monthly. The app computes the trends.</p>
          <button class="btn btn-primary" data-action="add-measurement">${ICONS.plus} Add first measurement</button>
        </div>`;
      return;
    }

    const stats = St().measurementStats(all).find((s) => s.type === state.progType);
    const series = St().measurementSeries(all, state.progType);

    // chart
    const chartCard = document.getElementById("progressChartCard");
    const unit = stats ? stats.unit : "";
    chartCard.innerHTML = `
      <div class="card">
        <div class="card-title"><h3>${esc(state.progType)} over time</h3><span class="sub">${series.length} records</span></div>
        <div class="chart-wrap" id="progChart"></div>
      </div>`;
    if (series.length >= 2) {
      const labels = series.map((s) => St().shortDate(s.date));
      C().lineChart(document.getElementById("progChart"), labels, [{
        name: state.progType, values: series.map((s) => s.value), color: "var(--accent)"
      }], { height: 250, area: true, valueFmt: (v) => St().fmtNum(v, 1) + (unit ? " " + unit : "") });
    } else {
      document.getElementById("progChart").innerHTML = `<div class="chart-empty">Add at least two measurements of ${esc(state.progType)} to see a trend.</div>`;
    }

    // stats
    const card = document.getElementById("progressStatsCard");
    if (!stats || stats.count < 1) {
      card.innerHTML = `<div class="card"><div class="chart-empty">Not enough data.</div></div>`;
      return;
    }
    const trendGood = (stats.trend === "down" && (state.progType === "Weight" || state.progType === "Body Fat %" || state.progType === "Waist" || state.progType === "Hips")) || (stats.trend === "up" && !["Weight", "Body Fat %", "Waist", "Hips"].includes(state.progType));
    const trendCls = trendGood ? "down-good" : stats.trend === "up" ? "up-bad" : "neutral";
    const arrow = stats.trend === "down" ? "▼" : stats.trend === "up" ? "▲" : "◆";

    // deeper analysis from the records (only when enough data exists)
    const recs = stats.records;
    let lastChange = null, changePerMonth = null, recsPerMonth = null, spanDays = null, monthsSpan = null;
    if (recs.length >= 2) {
      lastChange = recs[recs.length - 1].value - recs[recs.length - 2].value;
      const ms = St().parse(recs[recs.length - 1].date) - St().parse(recs[0].date);
      spanDays = Math.max(0, Math.round(ms / 86400000));
      monthsSpan = spanDays / 30.4375;
      // rates are only meaningful over a real time span (>= 1 week); otherwise
      // a couple of same-day entries would inflate "per month" absurdly
      if (spanDays >= 7) {
        changePerMonth = stats.change / monthsSpan;
        recsPerMonth = (recs.length - 1) / monthsSpan;
      }
    }
    const sign = (v) => (v > 0.0001 ? "+" : v < -0.0001 ? "−" : "");
    const lastCls = lastChange == null ? "neutral"
      : (lastChange < -0.0001 && trendGood) || (lastChange > 0.0001 && !trendGood) ? "down-good"
      : (lastChange > 0.0001 && trendGood) || (lastChange < -0.0001 && !trendGood) ? "up-bad" : "neutral";

    card.innerHTML = `
      <div class="card">
        <div class="card-title"><h3>${esc(state.progType)} — summary</h3><span class="sub">${stats.count} record${stats.count > 1 ? "s" : ""} · ${St().MONTHS_LONG[St().monthOf(stats.first.date) - 1]} ${St().yearOf(stats.first.date)} → now</span></div>
        <div class="stat-mini-grid">
          <div class="stat-mini"><div class="l">First</div><div class="v">${St().fmtNum(stats.first.value, 1)} <small>${esc(stats.unit)}</small></div></div>
          <div class="stat-mini"><div class="l">Latest</div><div class="v">${St().fmtNum(stats.latest.value, 1)} <small>${esc(stats.unit)}</small></div></div>
          <div class="stat-mini"><div class="l">Change</div><div class="v">${St().fmtNum(stats.change, 1)} <small>${esc(stats.unit)}</small></div></div>
          <div class="stat-mini"><div class="l">% Change</div><div class="v">${St().fmtNum(stats.pctChange, 1)}%</div></div>
          <div class="stat-mini"><div class="l">Average</div><div class="v">${St().fmtNum(stats.avg, 1)} <small>${esc(stats.unit)}</small></div></div>
          <div class="stat-mini"><div class="l">Lowest</div><div class="v">${St().fmtNum(stats.min, 1)} <small>${esc(stats.unit)}</small></div></div>
          <div class="stat-mini"><div class="l">Highest</div><div class="v">${St().fmtNum(stats.max, 1)} <small>${esc(stats.unit)}</small></div></div>
          <div class="stat-mini"><div class="l">Trend</div><div class="v trend ${trendCls}">${arrow} ${stats.trend === "flat" ? "stable" : stats.trend}</div></div>
        </div>
        <div class="analysis-title">Analysis</div>
        <div class="stat-mini-grid">
          <div class="stat-mini"><div class="l">Last change</div><div class="v trend ${lastCls}">${lastChange == null ? "—" : sign(lastChange) + St().fmtNum(Math.abs(lastChange), 1) + " " + esc(stats.unit)}</div></div>
          <div class="stat-mini"><div class="l">Change / month</div><div class="v">${changePerMonth == null ? "—" : sign(changePerMonth) + St().fmtNum(Math.abs(changePerMonth), 2) + " <small>" + esc(stats.unit) + "/mo</small>"}</div></div>
          <div class="stat-mini"><div class="l">Records / month</div><div class="v">${recsPerMonth == null ? "—" : St().fmtNum(recsPerMonth, 1)} <small>avg</small></div></div>
          <div class="stat-mini"><div class="l">Time span</div><div class="v">${monthsSpan == null ? "—" : monthsSpan >= 1 ? St().fmtNum(monthsSpan, 1) + " <small>months</small>" : spanDays + " <small>days</small>"}</div></div>
        </div>
      </div>`;

    // table — the 5 most recent records, full history behind "View all"
    const allRecs = stats.records.slice().reverse();
    const recent = allRecs.slice(0, 5);
    const rowHTML = (r) => `
      <tr>
        <td><b>${St().prettyDate(r.date)}</b></td>
        <td><b>${St().fmtNum(r.value, 1)}</b> ${esc(r.unit)}</td>
        <td style="color:var(--text-dim)">${r.notes ? esc(r.notes) : "—"}</td>
        <td><div class="wk-actions">
          <button class="mini-btn" data-action="edit-measurement" data-id="${r.id}">${ICONS.pencil}</button>
          <button class="mini-btn danger" data-action="delete-measurement" data-id="${r.id}">${ICONS.trash}</button>
        </div></td>
      </tr>`;
    document.getElementById("progressTable").innerHTML = `
      <div class="card">
        <div class="card-title"><h3>${esc(state.progType)} records</h3>
          <button class="btn btn-sm btn-ghost" data-action="view-all-measurements" data-type="${esc(state.progType)}">${ICONS.eye} View all (${allRecs.length})</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Date</th><th>Value</th><th>Notes</th><th style="width:110px"></th></tr></thead>
            <tbody>${recent.map(rowHTML).join("")}</tbody>
          </table>
        </div>
        ${allRecs.length > 5 ? `<p style="font-size:12px;color:var(--text-faint);margin:10px 2px 0">Showing the 5 most recent of ${allRecs.length} — “View all” opens the full history in a window.</p>` : ""}
      </div>`;
  }

  /** Full record list for a measurement type, in a scrollable modal. */
  function openMeasurementList(type) {
    const recs = Store().measurements.filter((m) => m.type === type).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    openModal(`
      <h2>All ${esc(type)} records</h2>
      <p class="modal-sub">${recs.length} record${recs.length === 1 ? "" : "s"} · newest first</p>
      <div class="preview-scroll">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Value</th><th>Notes</th><th style="width:110px"></th></tr></thead>
          <tbody>
            ${recs.map((r) => `
              <tr>
                <td><b>${St().prettyDate(r.date)}</b></td>
                <td><b>${St().fmtNum(r.value, 1)}</b> ${esc(r.unit)}</td>
                <td style="color:var(--text-dim)">${r.notes ? esc(r.notes) : "—"}</td>
                <td><div class="wk-actions">
                  <button class="mini-btn" data-action="edit-measurement" data-id="${r.id}">${ICONS.pencil}</button>
                  <button class="mini-btn danger" data-action="delete-measurement" data-id="${r.id}">${ICONS.trash}</button>
                </div></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Close</button></div>`, { wide: true });
  }

  /* =====================================================================
   * ANALYTICS
   * =================================================================== */  function renderAnalytics() {
    const all = Store().workouts;
    const years = St().availableYears(all, Store().measurements);
    const curYear = new Date().getFullYear();
    // Default comparison: the current year vs the previous year (when present),
    // otherwise the two most recent years with data.
    if (state.anaA == null || !years.includes(state.anaA)) state.anaA = years.includes(curYear) ? curYear : years[0];
    if (state.anaB == null || state.anaB === state.anaA || !years.includes(state.anaB)) {
      state.anaB = years.includes(curYear - 1) && curYear - 1 !== state.anaA ? curYear - 1 : years.find((y) => y !== state.anaA) || state.anaA;
    }
    const a = state.anaA, b = state.anaB;
    const year = Focus.App.year();
    const ms = St().monthlyStats(all, year);
    const cmp = St().compareYears(all, a, b);

    document.getElementById("analyticsCompare").innerHTML = `
      <span class="lbl">Compare</span>
      <select class="select" id="anaA" aria-label="Year A">
        ${years.map((y) => `<option value="${y}" ${y === a ? "selected" : ""}>${y}</option>`).join("")}
      </select>
      <span style="color:var(--text-faint)">vs</span>
      <select class="select" id="anaB" aria-label="Year B">
        ${years.map((y) => `<option value="${y}" ${y === b ? "selected" : ""}>${y}</option>`).join("")}
      </select>
      <span style="color:var(--text-dim);font-size:13px">
        ${a}: <strong>${cmp.totals.workouts.a}</strong> workouts · <strong>${St().fmtNum(cmp.totals.calories.a)}</strong> kcal
        &nbsp;·&nbsp; ${b}: <strong>${cmp.totals.workouts.b}</strong> workouts · <strong>${St().fmtNum(cmp.totals.calories.b)}</strong> kcal
      </span>`;

    const wrap = document.getElementById("analyticsCharts");
    const colorA = "var(--accent)", colorB = "var(--success)";
    // Future months of the current year are dimmed so charts don't end in a
    // wall of empty space — the eye reads only the months that have elapsed.
    // (null means "no dimming" — an empty array would dim everything.)
    const curYearNow = year === curYear;
    const hl = curYearNow ? ms.map((m, i) => i).filter((i) => i >= new Date().getMonth() + 1) : null;
    const hasCmp = a !== b && cmp.totals.workouts.a > 0 && cmp.totals.workouts.b > 0;
    const tb = St().typeBreakdown(all, year);
    // Distinct workouts in the year — NOT the sum of breakdown counts, which
    // counts each type tag (a "Back, Biceps" workout counts twice).
    const tbWorkouts = all.filter((w) => St().yearOf(w.date) === year).length;

    wrap.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-title"><h3>Workouts per month · ${year}</h3><span class="sub">frequency</span></div>
          <div class="chart-wrap" id="acMonthly"></div>
        </div>
        <div class="card">
          <div class="card-title"><h3>Calories per month · ${year}</h3><span class="sub">kcal</span></div>
          <div class="chart-wrap" id="acCalories"></div>
        </div>
        <div class="card">
          <div class="card-title"><h3>Workout duration · ${year}</h3><span class="sub">minutes</span></div>
          <div class="chart-wrap" id="acDuration"></div>
        </div>
        <div class="card">
          <div class="card-title"><h3>Average calories / workout · ${year}</h3><span class="sub">intensity trend</span></div>
          <div class="chart-wrap" id="acAvgCal"></div>
        </div>
        <div class="card">
          <div class="card-title"><h3>Cumulative workouts · ${year}</h3><span class="sub">progress</span></div>
          <div class="chart-wrap" id="acCumWk"></div>
        </div>
        <div class="card">
          <div class="card-title"><h3>Cumulative calories · ${year}</h3><span class="sub">YTD kcal</span></div>
          <div class="chart-wrap" id="acCumCal"></div>
        </div>
      </div>

      <div class="grid-2" style="margin-top:16px">
        <div class="card">
          <div class="card-title"><h3>Workout types · ${year}</h3><span class="sub">${tbWorkouts} workouts</span></div>
          <div id="acTypeBars"></div>
        </div>
        <div class="card">
          <div class="card-title"><h3>Consistency heatmap · ${year}</h3><span class="sub">workout days</span></div>
          <div id="acHeat">${yearHeatGrid(all, year, false)}</div>
        </div>
      </div>

      ${hasCmp ? `
      <div class="grid-2" style="margin-top:16px">
        <div class="card">
          <div class="card-title"><h3>${a} vs ${b} · monthly workouts</h3><span class="sub">${St().fmtNum(cmp.totals.workouts.a)} vs ${St().fmtNum(cmp.totals.workouts.b)} (${St().fmtDelta(cmp.totals.workouts.diff)})</span></div>
          <div class="chart-wrap" id="acCompareWk"></div>
        </div>
        <div class="card">
          <div class="card-title"><h3>${a} vs ${b} · cumulative calories</h3><span class="sub">${St().fmtNum(cmp.totals.calories.a)} vs ${St().fmtNum(cmp.totals.calories.b)} (${St().fmtDelta(cmp.totals.calories.diff)})</span></div>
          <div class="chart-wrap" id="acCompareCal"></div>
        </div>
      </div>` : `
      <div class="card big-card cmp-hidden" style="margin-top:16px">
        <div class="card-title"><h3>Year-over-year comparison</h3><span class="sub">needs data in two years</span></div>
        <div class="chart-empty" style="padding:18px">No workouts recorded in these two years — pick two years with data above to compare them.</div>
      </div>`}
    `;

    const labels = ms.map((m) => m.label);
    C().barChart(document.getElementById("acMonthly"), labels, [{ name: "Workouts", values: ms.map((m) => m.workouts) }], { height: 180, valueFmt: (v) => v + " workouts", highlight: hl });
    C().barChart(document.getElementById("acCalories"), labels, [{ name: "kcal", values: ms.map((m) => m.calories), color: "var(--success)" }], { height: 180, valueFmt: (v) => St().fmtNum(v) + " kcal", highlight: hl });
    C().barChart(document.getElementById("acDuration"), labels, [{ name: "min", values: ms.map((m) => m.duration), color: "var(--info)" }], { height: 180, valueFmt: (v) => St().fmtDuration(v) });
    C().lineChart(document.getElementById("acAvgCal"), labels, [{ name: "kcal / workout", values: ms.map((m) => (m.avgCal ? Math.round(m.avgCal) : null)), color: "var(--warn)" }], { height: 180, valueFmt: (v) => St().fmtNum(v) + " kcal" });

    // workout types — clean horizontal bars instead of the donut
    document.getElementById("acTypeBars").innerHTML = tb.length
      ? tb.map((t) => {
        const st = typeStyle(t.type);
        return `<div class="type-bar-row">
          <div class="tbr-head"><span>${st.emoji} ${esc(t.type)}</span><b>${t.count} <em>· ${t.pct.toFixed(0)}%</em></b></div>
          <div class="tbr-track"><span style="width:${Math.max(t.pct, 2.5)}%;background:${st.color}"></span></div>
        </div>`;
      }).join("")
      : `<div class="chart-empty">No workouts in ${year}.</div>`;

    // cumulative
    const cumWk = ms.map((m, i) => ms.slice(0, i + 1).reduce((s, x) => s + x.workouts, 0));
    const cumCal = ms.map((m, i) => ms.slice(0, i + 1).reduce((s, x) => s + x.calories, 0));
    C().lineChart(document.getElementById("acCumWk"), labels, [{ name: "Workouts", values: cumWk, color: "var(--accent)" }], { height: 180, area: true, valueFmt: (v) => v + " workouts" });
    C().lineChart(document.getElementById("acCumCal"), labels, [{ name: "kcal", values: cumCal, color: "var(--success)" }], { height: 180, area: true, valueFmt: (v) => St().fmtNum(v) + " kcal" });

    // comparison (only rendered when both years actually have workouts)
    if (hasCmp) {
      C().barChart(document.getElementById("acCompareWk"), cmp.months.map((m) => m.label), [
        { name: String(a), values: cmp.months.map((m) => m.a.workouts) },
        { name: String(b), values: cmp.months.map((m) => m.b.workouts), color: colorB }
      ], { height: 200, valueFmt: (v) => v + " workouts" });
      C().lineChart(document.getElementById("acCompareCal"), cmp.months.map((m) => m.label), [
        { name: String(a) + " kcal", values: cmp.months.map((m) => m.cumA.calories) },
        { name: String(b) + " kcal", values: cmp.months.map((m) => m.cumB.calories), color: colorB }
      ], { height: 200, area: false, valueFmt: (v) => St().fmtNum(v) + " kcal" });
    }
  }

  function cssColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#6366f1";
  }

  /* =====================================================================
   * DATA
   * =================================================================== */

  function renderData() {
    const all = Store().workouts;
    const meas = Store().measurements;
    const days = new Set(all.map((w) => w.date)).size;
    const years = new Set(all.map((w) => w.date.slice(0, 4)));
    meas.forEach((m) => years.add(m.date.slice(0, 4)));
    const set = Store().settings;
    const sortedYears = [...years].sort();
    const curYear = set.selectedYear && years.has(set.selectedYear)
      ? set.selectedYear
      : (sortedYears.length ? sortedYears[sortedYears.length - 1] : new Date().getFullYear());
    const dataSize = Math.max(1, Math.round(JSON.stringify(Store().exportBackup()).length / 1024));
    const lastAct = Math.max(0, ...all.concat(meas).map((r) => new Date(r.updatedAt || 0).getTime()));
    const pretty = (iso) => (iso ? St().prettyDate(iso.slice(0, 10)) : "Never");

    document.getElementById("dataBody").innerHTML = `
      <div class="data-grid">
        <div class="card data-card">
          <div class="data-card-head">${icon("activity")}<div><h3>Your Data</h3><p class="desc">Everything this app tracks, at a glance.</p></div></div>
          <div class="data-stats">
            <div class="s"><b>${St().fmtNum(all.length)}</b><span>Workouts</span></div>
            <div class="s"><b>${St().fmtNum(days)}</b><span>Workout days</span></div>
            <div class="s"><b>${St().fmtNum(meas.length)}</b><span>Measurements</span></div>
            <div class="s"><b>${curYear}</b><span>${curYear === new Date().getFullYear() ? "Current year" : "Year in focus"}</span></div>
          </div>
          <p class="data-foot">Last updated <b>${lastAct ? St().prettyDate(new Date(lastAct).toISOString().slice(0, 10)) : "never"}</b></p>
        </div>

        <div class="card data-card">
          <div class="data-card-head">${icon("clock")}<div><h3>Backup Status</h3><p class="desc">When your data last moved in or out.</p></div></div>
          <div class="data-status">
            <div class="st"><b>${esc(pretty(set.lastExcelExportAt))}</b><span>Last Excel export</span></div>
            <div class="st"><b>${esc(pretty(set.lastImportAt))}</b><span>Last import</span></div>
            <div class="st"><b>${St().fmtNum(all.length + meas.length)}</b><span>Records stored</span></div>
            <div class="st"><b>${dataSize} KB</b><span>Data size</span></div>
          </div>
        </div>
      </div>

      <div class="card data-card">
        <div class="data-card-head">${icon("download")}<div><h3>Export</h3><p class="desc">Take your data with you — to Google Sheets, another computer, or just as a keepsake.</p></div></div>
        <div class="export-btns">
          <button class="btn btn-primary" data-action="export-excel">${ICONS.download} Excel Workbook</button>
          <button class="btn" data-action="export-pdf">${ICONS.download} PDF Report</button>
          <button class="btn" data-action="export-backup">${ICONS.database} JSON Backup</button>
        </div>
        <div class="export-sub">
          <span>Simple data files</span>
          <button class="btn btn-sm btn-ghost" data-action="export-csv">Workouts CSV</button>
          <button class="btn btn-sm btn-ghost" data-action="export-csv-meas">Measurements CSV</button>
        </div>
      </div>

      <div class="card data-card">
        <div class="data-card-head">${icon("upload")}<div><h3>Import</h3><p class="desc">Bring data back in. Imports add and update records — your local data is never deleted.</p></div></div>
        <div class="import-grid">
          <div class="import-drop" id="dropExcel" tabindex="0" role="button" aria-label="Import Excel file">
            ${ICONS.upload}
            <b>Import Excel (.xlsx)</b>
            <span>Workbooks exported by this app, or edited copies</span>
          </div>
          <div class="import-drop" id="dropJson" tabindex="0" role="button" aria-label="Import JSON backup">
            ${ICONS.database}
            <b>Restore JSON backup</b>
            <span>A .json backup file saved from this app</span>
          </div>
        </div>
        <input type="file" id="fileExcel" accept=".xlsx,.xls" hidden>
        <input type="file" id="fileJson" accept=".json,application/json" hidden>
      </div>

      <div class="card data-card safety">
        <div class="data-card-head">${icon("check")}<div><h3>Data Safety</h3><p class="desc">Private by design — your data never leaves this device.</p></div></div>
        <p class="desc">Your data is stored locally in this browser. Export a backup regularly if you want to move your data to another computer or protect it from browser data loss.</p>
      </div>

      <div class="card data-card advanced">
        <div class="data-card-head">${icon("eye")}<div><h3>Advanced</h3><p class="desc">Tools most people won't need.</p></div></div>
        <div class="adv-row">
          <div><b>Restore built-in historical data</b><p class="desc">Re-import the records that shipped with the app. Identical records are skipped.</p></div>
          <button class="btn btn-sm btn-ghost" data-action="restore-seed">Restore</button>
        </div>
        <div class="adv-row danger">
          <div><b>Delete all local data</b><p class="desc">Permanently erases everything stored in this browser. Export a backup first.</p></div>
          <button class="btn btn-sm btn-danger" data-action="reset-all">${ICONS.trash} Delete all</button>
        </div>
      </div>`;

    wireDrop(document.getElementById("dropExcel"), document.getElementById("fileExcel"), (file) => {
      file.arrayBuffer().then((buf) => {
        try {
          const parsed = Focus.Excel.parseWorkbook(buf);
          if (!parsed.workouts.length && !parsed.measurements.length) {
            toast(parsed.errors.length ? "This file was recognized but every row was invalid: " + parsed.errors[0] : "No recognizable workout or measurement rows found in this file.", "error", 5500);
            return;
          }
          showImportPreview(parsed.workouts, parsed.measurements, parsed.errors, parsed);
        } catch (e) {
          toast(e.message || "Could not read this Excel file.", "error", 5000);
        }
      });
    });
    wireDrop(document.getElementById("dropJson"), document.getElementById("fileJson"), (file) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(reader.result);
          if (!obj || (obj.app !== "focus" && obj.app !== "pulse") || !Array.isArray(obj.workouts) || !Array.isArray(obj.measurements)) {
            toast("This file is not a valid Focus backup.", "error", 5000);
            return;
          }
          showImportPreview(obj.workouts, obj.measurements, [], { source: "json", meta: {} });
        } catch (e) {
          toast("Invalid JSON: " + e.message, "error", 5000);
        }
      };
      reader.readAsText(file, "utf-8");
    });
  }

  /** Modal asking which year(s) to include in the PDF report. */
  function showPdfModal() {
    const years = St().availableYears(Store().workouts, Store().measurements).slice().sort().reverse();
    if (!years.length) { toast("No data to report yet.", "warn"); return; }
    const cur = Store().settings.selectedYear && years.includes(Store().settings.selectedYear) ? Store().settings.selectedYear : years[0];
    const rebuildCompare = (m, chosen) => {
      const others = years.filter((y) => y !== chosen);
      const sel = m.querySelector("#pdfCompare");
      const prev = Number(sel.value);
      sel.innerHTML = `<option value="">No comparison</option>` + others.map((y) => `<option value="${y}" ${y === prev ? "selected" : ""}>${y}</option>`).join("");
    };
    openModal(`
      <h2>Export PDF report</h2>
      <p class="modal-sub">A clean, printable annual report — generated locally on this device.</p>
      <div class="pdf-opts">
        <label>Report year
          <select id="pdfYear">${years.map((y) => `<option value="${y}" ${y === cur ? "selected" : ""}>${y}</option>`).join("")}</select>
        </label>
        <label>Compare with
          <select id="pdfCompare">
            <option value="">No comparison</option>
            ${years.filter((y) => y !== cur).map((y) => `<option value="${y}">${y}</option>`).join("")}
          </select>
        </label>
      </div>
      <p class="modal-sub" style="color:var(--text-faint)">The comparison section only appears when that year has data.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-primary" data-action="export-pdf-confirm">${ICONS.download} Export PDF</button>
      </div>`, {
      onOpen: (m) => {
        m.querySelector("#pdfYear").addEventListener("change", (e) => rebuildCompare(m, Number(e.target.value)));
      }
    });
  }

  function wireDrop(zone, input, onFile) {
    zone.addEventListener("click", () => input.click());
    zone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    input.addEventListener("change", () => { if (input.files[0]) onFile(input.files[0]); input.value = ""; });
    ["dragover", "dragenter"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("drag"); }));
    zone.addEventListener("drop", (e) => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) onFile(f);
    });
  }

  /**
   * Show the import preview modal with counts and a sample table.
   * Rows are run through Focus.Store.planImport so the preview matches
   * exactly what the import will do (added / updated / skipped / invalid).
   */
  function showImportPreview(workoutRows, measurementRows, errors = [], extra = {}) {
    const N = Focus.Store;
    const plan = N.planImport(workoutRows, measurementRows);
    const t = plan.totals;
    if (!t.added && !t.updated && !t.invalid) { toast("Nothing to import — all records already exist unchanged.", "warn"); return; }

    const pW = plan.workouts, pM = plan.measurements;
    const srcLabel = extra.source === "appdata"
      ? "Detected: Focus workbook export — records restore exactly from the internal _AppData sheet."
      : extra.source === "json"
        ? "Detected: Focus JSON backup — full-fidelity restore."
        : "Detected: Workouts & Measurements sheets — records are matched by content (add, update, never delete).";

    const sample = [
      ...pW.added.slice(0, 5).map((r) => ({ ...r, kind: "workout", state: "new" })),
      ...pM.added.slice(0, 5).map((r) => ({ ...r, kind: "measurement", state: "new" })),
      ...pW.updated.slice(0, 4).map((u) => ({ ...u.norm, kind: "workout", state: "update" })),
      ...pM.updated.slice(0, 4).map((u) => ({ ...u.norm, kind: "measurement", state: "update" }))
    ].slice(0, 12);

    openModal(`
      <h2>Import preview</h2>
      <p class="modal-sub">${esc(srcLabel)}</p>
      <p class="modal-sub" style="color:var(--text-faint);margin-top:2px">Nothing is changed until you confirm.</p>
      <div class="imp-kind">
        <div class="ik"><span>Workouts</span><b class="add">+${pW.added.length}</b><b class="upd">↻${pW.updated.length}</b><b class="same">=${pW.skipped}</b><b class="bad">⚠${pW.invalid}</b></div>
        <div class="ik"><span>Measurements</span><b class="add">+${pM.added.length}</b><b class="upd">↻${pM.updated.length}</b><b class="same">=${pM.skipped}</b><b class="bad">⚠${pM.invalid}</b></div>
      </div>
      ${errors.length ? `
        <div class="imp-errors">
          <b>⚠ ${errors.length} row${errors.length === 1 ? "" : "s"} could not be imported</b>
          <ul>${errors.slice(0, 6).map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
          ${errors.length > 6 ? `<span>+ ${errors.length - 6} more</span>` : ""}
        </div>` : ""}
      ${sample.length ? `
        <div class="preview-scroll">
          <table class="data-table">
            <thead><tr><th></th><th>Type</th><th>Date</th><th>Detail</th></tr></thead>
            <tbody>${sample.map((r) => `
              <tr>
                <td>${r.state === "update" ? "↻" : "+"}</td>
                <td>${r.kind === "workout" ? "🏋️ Workout" : "📏 " + esc(r.type)}</td>
                <td>${r.date}</td>
                <td>${r.kind === "workout" ? esc(r.type) + (r.calories != null ? " · " + r.calories + " kcal" : "") : esc(r.value) + " " + esc(r.unit || "")}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>` : `<p class="modal-sub">(Nothing to preview)</p>`}
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-primary" id="confirmImport">Import ${t.added + t.updated} record${t.added + t.updated === 1 ? "" : "s"}</button>
      </div>`, {
      onOpen: (m) => {
        m.querySelector("#confirmImport").addEventListener("click", async () => {
          closeModal();
          try {
            const res = await N.importRecords(workoutRows, measurementRows);
            await N.setSetting("lastImportAt", new Date().toISOString());
            Focus.UI.renderData();
            const bits = [];
            if (res.added) bits.push(res.added + " added");
            if (res.updated) bits.push(res.updated + " updated");
            if (res.invalid) bits.push(res.invalid + " invalid");
            toast("Import complete — " + (bits.join(", ") || "nothing to do") + ". Your dashboard has been updated.", "success", 5500);
          } catch (e) {
            toast("Import failed: " + e.message, "error", 5000);
          }
        });
      }
    });
  }

  /* ---------------- public ---------------- */

  window.Focus = window.Focus || {};
  window.Focus.UI = {
    state, TYPE_STYLES, typeStyle, existingTypes, existingMeasTypes,
    esc, el, icon, ICONS,
    openModal, closeModal, toast, confirmDialog,
    openWorkoutForm, openMeasurementForm, openMeasurementList, unitDefault,
    renderDashboard, renderCalendar, renderTools, renderProgress, renderAnalytics, renderData, renderSettings,
    yearHeatGrid, renderMonthView, dayPanelHTML, showImportPreview, showPdfModal, wireDrop, cssColor
  };
})();
