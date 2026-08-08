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
    qaMode: "workout"
  };

  /* ---------------- type styles ---------------- */

  const TYPE_STYLES = {
    Strength: { color: "#6366f1", emoji: "💪" },
    Cardio: { color: "#f43f5e", emoji: "❤️" },
    Running: { color: "#f97316", emoji: "🏃" },
    Walking: { color: "#14b8a6", emoji: "🚶" },
    Cycling: { color: "#0ea5e9", emoji: "🚴" },
    Swimming: { color: "#38bdf8", emoji: "🏊" },
    Sports: { color: "#84cc16", emoji: "🏀" },
    HIIT: { color: "#a855f7", emoji: "⚡" },
    Other: { color: "#64748b", emoji: "✳️" }
  };
  const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b", "#84cc16", "#f43f5e", "#06b6d4"];

  function typeStyle(type) {
    if (TYPE_STYLES[type]) return TYPE_STYLES[type];
    let h = 0;
    for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
    return { color: PALETTE[h % PALETTE.length], emoji: "🔹" };
  }

  function existingTypes() {
    return Array.from(new Set(Store().workouts.map((w) => w.type))).sort();
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

  const TYPE_OPTIONS = ["Strength", "Cardio", "Running", "Walking", "Cycling", "Swimming", "Sports", "HIIT", "Other"];

  function workoutFormHTML(values = {}) {
    const types = Array.from(new Set([...TYPE_OPTIONS, ...existingTypes()]));
    const opts = types.map((t) => `<option value="${esc(t)}" ${t === (values.type || "Strength") ? "selected" : ""}>${t}</option>`).join("");
    const customSel = values.type && !types.includes(values.type) ? `<option value="${esc(values.type)}" selected>${esc(values.type)} (custom)</option>` : "";
    return `
      <h2>${values.id ? "Edit workout" : "Add workout"}</h2>
      <p class="modal-sub">${values.id ? "Update the details below." : "Quick entry — only date and type are required."}</p>
      <form id="workoutForm">
        <div class="form-grid">
          <div class="field">
            <label for="wfDate">Date *</label>
            <input class="input" id="wfDate" name="date" type="date" required value="${esc(values.date || "")}">
          </div>
          <div class="field">
            <label for="wfType">Workout type *</label>
            <select class="select" id="wfType" name="type">${opts}${customSel}
              <option value="__custom__">➕ Custom type…</option>
            </select>
            <input class="input" id="wfCustomType" name="customType" type="text" placeholder="Custom type name" style="margin-top:8px;${values.id ? "" : "display:none"}" value="${esc(values.type && !types.includes(values.type) ? values.type : "")}">
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
        const type = f.type.value === "__custom__" ? (f.customType.value || "").trim() : f.type.value;
        const duration = f.duration.value === "" ? null : Number(f.duration.value);
        const calories = f.calories.value === "" ? null : Number(f.calories.value);
        if (!date) { err.textContent = "Please pick a date."; err.hidden = false; return; }
        if (!type) { err.textContent = "Please enter a workout type."; err.hidden = false; return; }
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
        const typeSel = m.querySelector("#wfType");
        const custom = m.querySelector("#wfCustomType");
        const toggle = () => { custom.style.display = typeSel.value === "__custom__" ? "" : "none"; if (typeSel.value === "__custom__") custom.focus(); };
        typeSel.addEventListener("change", toggle);
        m.querySelector("#saveAnother")?.addEventListener("click", () => {
          const f = m.querySelector("#workoutForm");
          f.querySelector("#wfError").hidden = true;
          const date = f.date.value, type = f.type.value === "__custom__" ? f.customType.value.trim() : f.type.value;
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
    const types = Array.from(new Set([...TYPE_OPTIONS, ...existingTypes()]));
    const opts = types.map((t) => `<option value="${esc(t)}">${t}</option>`).join("");
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
            <div class="field">
              <label for="qaType">Type</label>
              <select class="select" id="qaType" name="type">${opts}
                <option value="__custom__">➕ Custom…</option>
              </select>
              <input class="input" id="qaCustomType" name="customType" type="text" placeholder="Custom type" style="margin-top:8px;display:none">
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
      const st = typeStyle(w.type);
      return `
        <div class="wk-row">
          <span class="type-badge badge"><span class="dot" style="background:${st.color}"></span>${st.emoji} ${esc(w.type)}</span>
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
    const cards = ms.map((m, i) => {
      const map = St().monthDayMap(all, year, i + 1);
      const cells = [];
      for (let d = 1; d <= St().daysInMonth(year, i + 1); d++) {
        const info = map.get(d);
        const lvl = info ? info.level : 0;
        const today = year === St().yearOf(St().todayISO()) && d === St().dayOf(St().todayISO()) && i + 1 === St().monthOf(St().todayISO());
        cells.push(`<div class="day ${lvl ? "has-workout lvl-" + lvl : ""} ${today ? "today" : ""}" ${info ? `data-day="${year}-${String(i + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}" data-calinfo="1"` : ""} title="${info ? `${d} · ${St().fmtNum(info.calories)} kcal · ${info.count} workout${info.count > 1 ? "s" : ""}` : ""}">${d}</div>`);
      }
      return `
        <div class="card month-card" ${interactive ? `data-action="openmonth"` : ""} data-month="${i + 1}">
          <div class="month-head"><strong>${m.label}</strong><span class="${m.days ? "" : "rest"}">${m.days ? m.days + "d · " + St().fmtNum(m.calories) + " kcal" : "rest"}</span></div>
          <div class="heat">${cells.join("")}</div>
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

    let cells = "";
    for (let i = 0; i < firstWeekday; i++) cells += `<div class="day-cell empty"></div>`;
    for (let d = 1; d <= dim; d++) {
      const iso = year + "-" + String(month).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const info = map.get(d);
      const isToday = iso === today;
      const isSel = iso === sel;
      cells += `
        <div class="day-cell ${info ? "has-wk lvl-" + info.level : ""} ${isToday ? "today" : ""} ${isSel ? "selected" : ""}" data-day="${iso}" data-calday="1" role="button" tabindex="0" aria-label="${iso}${info ? ", " + info.count + " workouts" : ""}">
          <span class="dnum">${d}</span>
          ${info ? `<span class="kcal">${St().fmtNum(info.calories)} kcal</span><span class="mini-bar" style="background:var(--heat-${info.level});width:${20 + info.level * 20}%"></span>` : ""}
        </div>`;
    }

    const prevM = month === 1 ? 12 : month - 1;
    const nextM = month === 12 ? 1 : month + 1;
    const prevY = month === 1 ? year - 1 : year;
    const nextY = month === 12 ? year + 1 : year;

    const dayPanel = sel ? dayPanelHTML(sel) : `
      <div class="card">
        <h3 style="margin-top:0">${St().MONTHS_LONG[month - 1]} ${year}</h3>
        <div class="day-total" style="margin:12px 0">
          <div class="t"><b>${mStats.workouts}</b><span>workouts</span></div>
          <div class="t"><b>${St().fmtNum(mStats.calories)}</b><span>kcal</span></div>
          <div class="t"><b>${mStats.days}</b><span>days</span></div>
        </div>
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
        <div>
          ${all.map((w) => {
            const st = typeStyle(w.type);
            return `
            <div class="wk-item">
              <span class="type-badge badge"><span class="dot" style="background:${st.color}"></span>${st.emoji} ${esc(w.type)}</span>
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
            <div class="bmi-cat ok" id="bmiCat">Normal weight</div>
          </div>
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
    const hEl = document.getElementById("bmiHeight");
    const wEl = document.getElementById("bmiWeight");
    const huEl = document.getElementById("bmiHeightUnit");
    const wuEl = document.getElementById("bmiWeightUnit");
    if (!v || !cat || !hEl || !wEl || !huEl || !wuEl) return;
    const h = parseFloat(hEl.value);
    const w = parseFloat(wEl.value);
    const meters = huEl.value === "in" ? h * 2.54 / 100 : h / 100;
    const kg = wuEl.value === "lb" ? w * KG_PER_LB : w;
    if (!isFinite(h) || !isFinite(w) || h <= 0 || w <= 0 || !(meters > 0)) {
      v.textContent = "—";
      cat.textContent = "Enter your height and weight";
      cat.className = "bmi-cat neutral";
      return;
    }
    const bmi = kg / (meters * meters);
    v.textContent = bmi.toFixed(1);
    let label, cls;
    if (bmi < 18.5) { label = "Underweight"; cls = "warn"; }
    else if (bmi < 25) { label = "Normal weight"; cls = "ok"; }
    else if (bmi < 30) { label = "Overweight"; cls = "warn"; }
    else { label = "Obese"; cls = "bad"; }
    cat.textContent = label;
    cat.className = "bmi-cat " + cls;
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
      ["Kilograms", kg],
      ["Pounds", kg / KG_PER_LB],
      ["Grams", kg * 1000],
      ["Ounces", kg * 1000 / G_PER_OZ]
    ];
    out.innerHTML = rows.map(([name, v2]) => `
      <div class="conv-row"><span>${name}</span><b>${fmtNumber(v2)}</b></div>`).join("");
  }

  function fmtNumber(n) {
    const s = n.toFixed(2).replace(/\.?0+$/, "");
    return s === "" || s === "-" ? "0" : s;
  }

  /* =====================================================================
   * SETTINGS
   * =================================================================== */

  function renderSettings() {
    const s = Store().settings;
    const theme = document.documentElement.getAttribute("data-theme") || "dark";
    const wt = s.weightUnit || "lb";
    const w = Store().workouts.length, m = Store().measurements.length;
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
            <li><b>Offline</b> — open <code>index.html</code> and it just works</li>
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
   * =================================================================== */

  function renderAnalytics() {
    const all = Store().workouts;
    const years = St().availableYears(all, Store().measurements);
    if (state.anaA == null || !years.includes(state.anaA)) state.anaA = years[0];
    if (state.anaB == null || state.anaB === state.anaA || !years.includes(state.anaB)) {
      state.anaB = years.find((y) => y !== state.anaA) || state.anaA;
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
      </div>

      <div class="grid-2" style="margin-top:16px">
        <div class="card">
          <div class="card-title"><h3>Workout types · ${year}</h3><span class="sub">mix</span></div>
          <div style="display:grid;grid-template-columns:180px 1fr;gap:6px;align-items:center">
            <div class="chart-wrap" id="acTypes" style="max-width:190px"></div>
            <div id="acTypeLegend"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title"><h3>Cumulative workouts · ${year}</h3><span class="sub">progress</span></div>
          <div class="chart-wrap" id="acCumWk"></div>
        </div>
        <div class="card">
          <div class="card-title"><h3>Cumulative calories · ${year}</h3><span class="sub">YTD kcal</span></div>
          <div class="chart-wrap" id="acCumCal"></div>
        </div>
        <div class="card">
          <div class="card-title"><h3>Consistency heatmap · ${year}</h3><span class="sub">workout days</span></div>
          <div id="acHeat">${yearHeatGrid(all, year, false)}</div>
        </div>
      </div>

      <div class="card big-card" style="margin-top:16px">
        <div class="card-title"><h3>${a} vs ${b} — monthly workouts</h3><span class="sub">${St().fmtNum(cmp.totals.workouts.a)} vs ${St().fmtNum(cmp.totals.workouts.b)} (${St().fmtDelta(cmp.totals.workouts.diff)})</span></div>
        <div class="chart-wrap" id="acCompareWk"></div>
      </div>
      <div class="card big-card" style="margin-top:16px">
        <div class="card-title"><h3>${a} vs ${b} — cumulative calories</h3><span class="sub">${St().fmtNum(cmp.totals.calories.a)} vs ${St().fmtNum(cmp.totals.calories.b)} (${St().fmtDelta(cmp.totals.calories.diff)})</span></div>
        <div class="chart-wrap" id="acCompareCal"></div>
      </div>
      <div class="card big-card" style="margin-top:16px">
        <div class="card-title"><h3>${a} vs ${b} — month by month</h3><span class="sub">who's ahead?</span></div>
        <div id="acBlocks"></div>
      </div>`;

    const labels = ms.map((m) => m.label);
    C().barChart(document.getElementById("acMonthly"), labels, [{ name: "Workouts", values: ms.map((m) => m.workouts) }], { height: 230, valueFmt: (v) => v + " workouts" });
    C().barChart(document.getElementById("acCalories"), labels, [{ name: "kcal", values: ms.map((m) => m.calories), color: "var(--success)" }], { height: 230, valueFmt: (v) => St().fmtNum(v) + " kcal" });
    C().barChart(document.getElementById("acDuration"), labels, [{ name: "min", values: ms.map((m) => m.duration), color: "var(--info)" }], { height: 230, valueFmt: (v) => St().fmtDuration(v) });
    C().lineChart(document.getElementById("acAvgCal"), labels, [{ name: "kcal / workout", values: ms.map((m) => (m.avgCal ? Math.round(m.avgCal) : null)), color: "var(--warn)" }], { height: 230, valueFmt: (v) => St().fmtNum(v) + " kcal" });

    // types donut
    const tb = St().typeBreakdown(all, year);
    C().donut(document.getElementById("acTypes"), tb.map((t) => ({ label: t.type, value: t.count, color: typeStyle(t.type).color })), {
      size: 170, stroke: 20, centerLabel: "workouts", centerValue: tb.reduce((s, t) => s + t.count, 0)
    });
    document.getElementById("acTypeLegend").innerHTML = tb.map((t) => {
      const st = typeStyle(t.type);
      return `<div class="row" style="margin-bottom:7px"><span class="sw" style="background:${st.color}"></span><span style="flex:1;font-size:13px">${st.emoji} ${esc(t.type)}</span><b style="font-variant-numeric:tabular-nums">${t.count}</b><span style="width:44px;text-align:right;color:var(--text-faint);font-size:12px;font-weight:700">${t.pct.toFixed(0)}%</span></div>`;
    }).join("") || `<div class="chart-empty">No workouts in ${year}.</div>`;

    // cumulative
    const cumWk = ms.map((m, i) => ms.slice(0, i + 1).reduce((s, x) => s + x.workouts, 0));
    const cumCal = ms.map((m, i) => ms.slice(0, i + 1).reduce((s, x) => s + x.calories, 0));
    C().lineChart(document.getElementById("acCumWk"), labels, [{ name: "Workouts", values: cumWk, color: "var(--accent)" }], { height: 230, area: true, valueFmt: (v) => v + " workouts" });
    C().lineChart(document.getElementById("acCumCal"), labels, [{ name: "kcal", values: cumCal, color: "var(--success)" }], { height: 230, area: true, valueFmt: (v) => St().fmtNum(v) + " kcal" });

    // comparison
    C().barChart(document.getElementById("acCompareWk"), cmp.months.map((m) => m.label), [
      { name: String(a), values: cmp.months.map((m) => m.a.workouts) },
      { name: String(b), values: cmp.months.map((m) => m.b.workouts), color: colorB }
    ], { height: 250, valueFmt: (v) => v + " workouts" });
    C().lineChart(document.getElementById("acCompareCal"), cmp.months.map((m) => m.label), [
      { name: String(a) + " kcal", values: cmp.months.map((m) => m.cumA.calories) },
      { name: String(b) + " kcal", values: cmp.months.map((m) => m.cumB.calories), color: colorB }
    ], { height: 250, area: false, valueFmt: (v) => St().fmtNum(v) + " kcal" });
    C().compareBars(document.getElementById("acBlocks"), cmp.months, {
      a: String(a), b: String(b), colorA: cssColor("--accent"), colorB: cssColor("--success"),
      valueFmt: (v) => v
    });
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
    const years = new Set(all.map((w) => w.date.slice(0, 4)));
    meas.forEach((m) => years.add(m.date.slice(0, 4)));
    const lastBackup = Store().settings.lastBackupAt;

    document.getElementById("dataBody").innerHTML = `
      <div class="data-stats">
        <div class="s"><b>${St().fmtNum(all.length)}</b><span>Workouts</span></div>
        <div class="s"><b>${St().fmtNum(meas.length)}</b><span>Measurements</span></div>
        <div class="s"><b>${years.size}</b><span>Years with data</span></div>
        <div class="s"><b style="font-size:15px">${lastBackup ? esc(lastBackup.slice(0, 10)) : "Never"}</b><span>Last backup</span></div>
      </div>

      <div class="card data-card">
        <h3>⬇️ Export</h3>
        <p class="desc">Download your data at any time. Excel is perfect for Google Sheets archiving; JSON backup restores everything, byte for byte.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" data-action="export-excel">${ICONS.download} Export Excel (.xlsx)</button>
          <button class="btn" data-action="export-backup">${ICONS.database} Export JSON backup</button>
          <button class="btn" data-action="export-csv">${ICONS.download} Export CSV</button>
        </div>
      </div>

      <div class="card data-card">
        <h3>⬆️ Import</h3>
        <p class="desc">Import Excel (.xlsx) exported from this app or archived in Google Sheets, or restore a JSON backup. Imports never duplicate existing records.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="import-drop" id="dropExcel" tabindex="0" role="button" aria-label="Import Excel file">
            ${ICONS.upload}
            <b>Import Excel (.xlsx)</b>
            <span>Drop a file here or click to browse</span>
          </div>
          <div class="import-drop" id="dropJson" tabindex="0" role="button" aria-label="Import JSON backup">
            ${ICONS.upload}
            <b>Import JSON backup</b>
            <span>Drop a .json backup file here or click to browse</span>
          </div>
        </div>
        <input type="file" id="fileExcel" accept=".xlsx,.xls" hidden>
        <input type="file" id="fileJson" accept=".json,application/json" hidden>
        <p style="font-size:12.5px;color:var(--text-faint);margin:14px 0 0">
          Need to start fresh? Use the built-in historical data instead — it's the same data that ships with the app:
          <button class="btn btn-sm btn-ghost" data-action="restore-seed" style="margin-left:6px">Restore built-in historical data</button>
        </p>
      </div>

      <div class="card data-card" style="border-color:var(--danger-soft)">
        <h3 style="color:var(--danger)">🗑️ Danger zone</h3>
        <p class="desc">Delete <strong>everything</strong> stored in this browser for this app. This cannot be undone — export a backup first.</p>
        <button class="btn btn-danger" data-action="reset-all">${ICONS.trash} Delete all local data</button>
      </div>`;

    wireDrop(document.getElementById("dropExcel"), document.getElementById("fileExcel"), (file) => {
      file.arrayBuffer().then((buf) => {
        try {
          const parsed = Focus.Excel.parseWorkbook(buf);
          if (!parsed.workouts.length && !parsed.measurements.length) {
            toast("No recognizable workout or measurement rows found in this file.", "error", 5000);
            return;
          }
          showImportPreview(parsed.workouts, parsed.measurements, parsed.errors);
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
          showImportPreview(obj.workouts, obj.measurements, []);
        } catch (e) {
          toast("Invalid JSON: " + e.message, "error", 5000);
        }
      };
      reader.readAsText(file, "utf-8");
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
  function showImportPreview(workoutRows, measurementRows, errors = []) {
    const N = Focus.Store;
    const plan = N.planImport(workoutRows, measurementRows);
    const t = plan.totals;
    if (!t.added && !t.updated && !t.invalid) { toast("Nothing to import — all records already exist unchanged.", "warn"); return; }

    const sample = [
      ...plan.workouts.added.slice(0, 5).map((r) => ({ ...r, kind: "workout", state: "new" })),
      ...plan.measurements.added.slice(0, 5).map((r) => ({ ...r, kind: "measurement", state: "new" })),
      ...plan.workouts.updated.slice(0, 4).map((u) => ({ ...u.norm, kind: "workout", state: "update" })),
      ...plan.measurements.updated.slice(0, 4).map((u) => ({ ...u.norm, kind: "measurement", state: "update" }))
    ].slice(0, 12);

    openModal(`
      <h2>Import preview</h2>
      <p class="modal-sub">Review what will happen. Nothing is changed until you confirm.</p>
      <div class="imp-report">
        <div class="r added"><b>${t.added}</b><span>Will add</span></div>
        <div class="r updated"><b>${t.updated}</b><span>Will update</span></div>
        <div class="r skipped"><b>${t.skipped}</b><span>Unchanged</span></div>
        <div class="r invalid"><b>${t.invalid}</b><span>Invalid</span></div>
      </div>
      ${errors.length ? `<p style="color:var(--warn);font-size:12.5px">${errors.slice(0, 5).map(esc).join("<br>")}</p>` : ""}
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
            const bits = [`${res.added} added`, `${res.updated} updated`, `${res.skipped} unchanged`, `${res.invalid} invalid`];
            toast("Import complete: " + bits.join(", "), "success", 5000);
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
    yearHeatGrid, renderMonthView, dayPanelHTML, showImportPreview, wireDrop, cssColor
  };
})();
