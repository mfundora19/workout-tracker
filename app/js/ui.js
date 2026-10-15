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
  const F = () => Focus.Food;

  /* Monthly challenges (and the badges they earn) are opt-out: they show unless
   * the user switched them off in Settings › Preferences. The stored challenges
   * are always kept — the switch only hides the feature's surfaces. */
  const challengesOn = () => Store().settings.challengesEnabled !== false;

  /* Two kinds of challenge: the classic monthly goal (labelled with its month)
   * and named special editions (World Mental Health Day, and so on). Both keep
   * the same month/year slot, completion date and badge pipeline. */
  const isSpecialChallenge = (challenge) => Store().challengeKindOf(challenge) === "special";
  const challengeLabel = (challenge) => (isSpecialChallenge(challenge) ? challenge.name : St().MONTHS_LONG[challenge.month - 1]);
  /** One-line description of a challenge for tooltips/aria — never empty. */
  const challengeTip = (challenge) => (isSpecialChallenge(challenge) ? challenge.name : St().MONTHS_LONG[challenge.month - 1]) + " " + challenge.year + ": " + challenge.description;

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
    accentOpen: false,
    dashEnter: false,
    // Year groups the user opened/closed by hand (year -> bool), so re-renders
    // keep their choice. Years without an entry follow the default below.
    challengeYearOpen: {}
  };

  /* Set when the Dashboard view is shown — the next render plays the staggered
   * entrance animation. Data re-renders leave it false, so cards don't re-animate. */
  function markDashEnter() { state.dashEnter = true; }

  /* ---------------- type styles ---------------- */

  const TYPE_STYLES = {
    Back: { color: "#8b5cf6", emoji: "🧗" },
    Chest: { color: "#6366f1", emoji: "🏋️" },
    Legs: { color: "#f97316", emoji: "🦵" },
    Biceps: { color: "#ec4899", emoji: "💪" },
    Triceps: { color: "#0ea5e9", emoji: "🦾" },
    Forearms: { color: "#06b6d4", emoji: "🤜" },
    Abs: { color: "#84cc16", emoji: "🧘" },
    Walk: { color: "#14b8a6", emoji: "🚶" },
    Bike: { color: "#06b6d4", emoji: "🚴" },
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
  // Preferred chip order in Progress. Neck lives in Settings › Profile now —
  // historic Neck records stay stored (exports, body-fat fallback) but are
  // never charted or edited in Progress.
  const MEAS_CHIP_ORDER = ["Weight", "Waist"];
  function existingMeasTypes() {
    const set = new Set(Store().measurements.map((m) => m.type));
    set.delete("Neck");
    const rest = Array.from(set).filter((t) => !MEAS_CHIP_ORDER.includes(t)).sort();
    return [...MEAS_CHIP_ORDER.filter((t) => set.has(t)), ...rest];
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
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11.5V16"/></svg>'
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

  /** Backup-reminder banner — shown at the top of the Dashboard when no backup
   *  exists or the last one is ≥ backupReminderDays old. Dismissible; "Back up
   *  now" reuses the export-backup action. Rendered into #backupBanner so data
   *  re-renders of the dashboard grid never wipe it out. */
  function showBackupBanner() {
    const s = Store().settings;
    const el = document.getElementById("backupBanner");
    if (!el) return;
    const last = s.lastBackupAt;
    let age = "You haven't created a backup yet.";
    if (last) {
      const days = Math.floor((St().parse(St().todayISO()) - St().parse(last.slice(0, 10))) / 86400000);
      age = `It's been <b>${Math.max(0, days)} days</b> since your last backup.`;
    }
    el.innerHTML = `
      <div class="backup-banner" role="status" aria-label="Backup reminder">
        <span class="backup-banner-icon">${ICONS.database}</span>
        <div class="backup-banner-body">
          <b>Time for a backup 💾</b>
          <span>${age} Everything lives only in this browser — a JSON backup is the best way to keep it safe.</span>
        </div>
        <div class="backup-banner-actions">
          <button class="btn btn-ghost btn-sm" data-action="set-backup-reminder" data-set-backup-reminder="off">Turn off</button>
          <button class="btn btn-ghost btn-sm" data-action="dismiss-backup-banner">Not now</button>
          <button class="btn btn-primary btn-sm" data-action="export-backup">${ICONS.database} Back up now</button>
        </div>
        <button class="backup-banner-close" data-action="dismiss-backup-banner" aria-label="Dismiss">✕</button>
      </div>`;
  }

  function hideBackupBanner() {
    const el = document.getElementById("backupBanner");
    if (el) el.innerHTML = "";
  }

  /* ---------------- workout form ---------------- */

  /** Preferred default order — defaults always come first in the picker. */
  const TYPE_OPTIONS = ["Back", "Triceps", "Chest", "Biceps", "Legs", "Forearms", "Abs", "Walk", "Bike", "Cardio", "Other"];

  /** Ordered picker list: defaults, then user-added custom types (persisted in
   *  settings.customTypes), then any types still found in the data. Types the
   *  user removed (settings.removedTypes) are hidden everywhere — historical
   *  records keep their badges, they just leave the picker. */
  function pickerTypes() {
    const s = Store().settings;
    const removed = new Set(s.removedTypes || []);
    const custom = (s.customTypes || []).filter((t) => !removed.has(t));
    const fromData = existingTypes().filter((t) => !TYPE_OPTIONS.includes(t) && !custom.includes(t) && !removed.has(t));
    return [...TYPE_OPTIONS, ...custom, ...fromData];
  }

  /** Mini badges shown on the collapsed picker summary for the chosen types. */
  function typeSummaryHTML(selected) {
    const list = splitTypes(selected);
    if (!list.length) return `<span class="tpt-placeholder">Select types…</span>`;
    return list.map((t) => {
      const st = typeStyle(t);
      return `<span class="tpt-badge" style="--tc:${st.color}">${st.emoji} ${esc(t)}</span>`;
    }).join("");
  }

  /** Collapsed-by-default toggle + chip multi-select for workout types.
   *  `prefix` scopes the ids ("wf" for the modal form, "qa" for quick add).
   *  Non-default chips carry a small ✕ so users can add/remove their own types. */
  function typePickerHTML(prefix, selected) {
    const sel = new Set(splitTypes(selected));
    const all = pickerTypes();
    const chips = all.map((t) => {
      const st = typeStyle(t);
      const removable = !TYPE_OPTIONS.includes(t);
      return `<button type="button" class="type-chip${sel.has(t) ? " is-on" : ""}" data-action="toggle-type" data-picker="${prefix}" data-type="${esc(t)}" style="--tc:${st.color}" title="${esc(t)}"><span class="tcdot"></span>${st.emoji} ${esc(t)}${removable ? `<span class="type-chip-x" data-action="remove-type" data-picker="${prefix}" data-type="${esc(t)}" title="Remove ${esc(t)} from the list">✕</span>` : ""}</button>`;
    }).join("");
    return `
      <div class="type-picker-wrap">
        <button type="button" class="type-picker-toggle" id="${prefix}PickerToggle" data-action="toggle-picker" data-picker="${prefix}" aria-expanded="false" aria-controls="${prefix}Picker">
          <span class="tpt-value" id="${prefix}PickerValue">${typeSummaryHTML(selected)}</span>
          <span class="tpt-chev" aria-hidden="true">▾</span>
        </button>
        <div class="type-picker-body" id="${prefix}Picker" hidden>
          <div class="type-picker">${chips}</div>
          <div class="type-custom-row">
            <input class="input" id="${prefix}CustomType" type="text" placeholder="Add a custom type…">
            <button type="button" class="btn btn-ghost btn-sm" data-action="add-type" data-picker="${prefix}">Add</button>
          </div>
        </div>
      </div>`;
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
            <label for="wfPickerToggle">Workout type(s) *</label>
            ${typePickerHTML("wf", selected)}
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
  const UNIT_DEFAULTS = { Weight: "lb", "Body Fat %": "%", Height: "cm", Waist: "cm", Neck: "cm", Chest: "cm", Hips: "cm", Arm: "cm", Thigh: "cm" };

  /** Sensible default unit for a measurement type ('' when unknown). Weight honours the user's preferred unit in Settings. */
  function unitDefault(type) {
    if (type === "Weight") return Store().settings.weightUnit || UNIT_DEFAULTS.Weight;
    return UNIT_DEFAULTS[type] || "";
  }

  const MEAS_TYPE_OPTIONS = ["Weight", "Body Fat %", "Height", "Neck", "Waist", "Chest", "Hips", "Arm", "Thigh"];
  function measurementTypes() {
    // Neck is profile data (Settings › Profile), not a Progress measurement.
    return Array.from(new Set([...MEAS_TYPE_OPTIONS, ...existingMeasTypes()])).filter((t) => t !== "Neck");
  }

  function unitOptsHTML(selected) {
    return UNITS.map((u) => `<option value="${esc(u)}" ${u === selected ? "selected" : ""}>${u === "" ? "None" : esc(u)}</option>`).join("");
  }

  function measurementFormHTML(values = {}) {
    // Editing keeps the focused single-measurement form; adding a new record
    // opens a compact multi-entry form (Weight / Waist / Neck + Other tabs).
    if (values.id) return singleMeasurementFormHTML(values);
    return multiMeasurementFormHTML(values);
  }

  /** Single-measurement form (used when editing an existing record). */
  function singleMeasurementFormHTML(values = {}) {
    const types = measurementTypes();
    const typeOpts = types.map((t) => `<option value="${esc(t)}" ${t === values.type ? "selected" : ""}>${t}</option>`).join("");
    const unitOpts = unitOptsHTML(values.unit || "");
    return `
      <h2>Edit measurement</h2>
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
          <button type="submit" class="btn btn-primary">Save changes</button>
        </div>
      </form>`;
  }

  /** Compact multi-entry form: weight, waist and neck in one save, plus an
   *  Other tab for any remaining measurement type. */
  function multiMeasurementFormHTML(values = {}) {
    const types = measurementTypes();
    const typeOpts = types.map((t) => `<option value="${esc(t)}" ${t === "Weight" ? "selected" : ""}>${t}</option>`).join("");
    const section = (type, id, placeholder, unit) => `
      <div class="mtab" data-mpanel="${id}" role="tabpanel" ${id === "Weight" ? "" : "hidden"}>
        <div class="form-grid">
          <div class="field">
            <label for="mValue_${id}">${esc(type)} *</label>
            <input class="input" id="mValue_${id}" type="number" step="any" min="0" placeholder="${placeholder}">
          </div>
          <div class="field">
            <label for="mUnit_${id}">Unit</label>
            <select class="select" id="mUnit_${id}">${unitOptsHTML(unit)}</select>
          </div>
        </div>
        <div class="field">
          <label for="mNotes_${id}">Notes</label>
          <input class="input" id="mNotes_${id}" type="text" placeholder="Optional">
        </div>
      </div>`;
    return `
      <h2>Add measurements</h2>
      <p class="modal-sub">Log weight and waist together — switch sections and fill in the ones you want. Neck lives in Settings › Profile.</p>
      <form id="measForm">
        <div class="field">
          <label for="mfDate">Date *</label>
          <input class="input" id="mfDate" name="date" type="date" required value="${esc(values.date || "")}">
        </div>
        <div class="seg seg-measure" role="tablist" aria-label="Measurement section">
          <button type="button" class="seg-btn is-active" data-mtab="Weight" role="tab" aria-selected="true">Weight</button>
          <button type="button" class="seg-btn" data-mtab="Waist" role="tab" aria-selected="false">Waist</button>
          <button type="button" class="seg-btn" data-mtab="Other" role="tab" aria-selected="false">Other</button>
        </div>
        ${section("Weight", "Weight", "e.g. 79.8", unitDefault("Weight"))}
        ${section("Waist", "Waist", "e.g. 91", unitDefault("Waist"))}
        <div class="mtab" data-mpanel="Other" role="tabpanel" hidden>
          <div class="form-grid">
            <div class="field">
              <label for="mfType">Measurement *</label>
              <select class="select" id="mfType">${typeOpts}
                <option value="__custom__">➕ Custom measurement…</option>
              </select>
              <input class="input" id="mfCustomType" type="text" placeholder="Custom name" style="margin-top:8px;display:none">
            </div>
            <div class="field">
              <label for="mfValue">Value *</label>
              <input class="input" id="mfValue" type="number" step="any" min="0" placeholder="e.g. 79.8">
            </div>
            <div class="field">
              <label for="mfUnit">Unit</label>
              <select class="select" id="mfUnit">${unitOptsHTML(unitDefault("Weight"))}</select>
            </div>
            <div class="field">
              <label for="mfNotes">Notes</label>
              <input class="input" id="mfNotes" type="text" placeholder="Optional">
            </div>
          </div>
        </div>
        <p class="form-error" id="mfError" hidden></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">Add measurements</button>
        </div>
      </form>`;
  }

  function openMeasurementForm(values = {}) {
    openModal(measurementFormHTML(values), {
      onSubmit: (f, { close }) => {
        const err = f.querySelector("#mfError");
        const date = f.querySelector("#mfDate").value;
        if (!date) { err.textContent = "Please pick a date."; err.hidden = false; return; }

        // Editing a single record keeps the original one-field flow.
        if (values.id) {
          const type = f.querySelector("#mfType").value === "__custom__" ? (f.querySelector("#mfCustomType").value || "").trim() : f.querySelector("#mfType").value;
          const value = Number(f.querySelector("#mfValue").value);
          if (!type) { err.textContent = "Please name the measurement."; err.hidden = false; return; }
          if (!isFinite(value) || value < 0) { err.textContent = "Value must be a positive number."; err.hidden = false; return; }
          err.hidden = true;
          const data = { date, type, value, unit: f.querySelector("#mfUnit").value, notes: f.querySelector("#mfNotes").value.trim() };
          Store().updateMeasurement(values.id, data).then(() => toast("Measurement updated"));
          close();
          return;
        }

        // New record: every filled section is saved in one go.
        const sections = [
          { type: "Weight", id: "Weight" },
          { type: "Waist", id: "Waist" }
        ];
        const toAdd = [];
        for (const s of sections) {
          const raw = f.querySelector(`#mValue_${s.id}`).value;
          if (raw === "" || raw == null) continue;
          const v = Number(raw);
          if (!isFinite(v) || v < 0) { err.textContent = `${s.type} must be a positive number.`; err.hidden = false; return; }
          toAdd.push({ date, type: s.type, value: v, unit: f.querySelector(`#mUnit_${s.id}`).value, notes: f.querySelector(`#mNotes_${s.id}`).value.trim() });
        }
        // The Other tab is a single arbitrary measurement (also optional).
        const otherRaw = f.querySelector("#mfValue").value;
        if (otherRaw !== "" && otherRaw != null) {
          const type = f.querySelector("#mfType").value === "__custom__" ? (f.querySelector("#mfCustomType").value || "").trim() : f.querySelector("#mfType").value;
          const v = Number(otherRaw);
          if (!type) { err.textContent = "Please name the measurement."; err.hidden = false; return; }
          if (!isFinite(v) || v < 0) { err.textContent = "Value must be a positive number."; err.hidden = false; return; }
          toAdd.push({ date, type, value: v, unit: f.querySelector("#mfUnit").value, notes: f.querySelector("#mfNotes").value.trim() });
        }

        if (toAdd.length === 0) { err.textContent = "Enter at least one measurement."; err.hidden = false; return; }
        err.hidden = true;
        Promise.all(toAdd.map((d) => Store().addMeasurement(d))).then(() => {
          toast(toAdd.length === 1 ? "Measurement added" : `${toAdd.length} measurements added`);
          close();
        });
      },
      onOpen: (m) => {
        // Section bar: switch the visible panel.
        const tabs = m.querySelectorAll("[data-mtab]");
        const panels = m.querySelectorAll(".mtab");
        tabs.forEach((t) => t.addEventListener("click", () => {
          tabs.forEach((x) => { x.classList.toggle("is-active", x === t); x.setAttribute("aria-selected", x === t ? "true" : "false"); });
          panels.forEach((p) => { p.hidden = p.dataset.mpanel !== t.dataset.mtab; });
        }));
        // Custom-type toggle (used by the edit form and the Other tab).
        const sel = m.querySelector("#mfType");
        const custom = m.querySelector("#mfCustomType");
        const unit = m.querySelector("#mfUnit");
        if (sel) sel.addEventListener("change", () => {
          if (custom) custom.style.display = sel.value === "__custom__" ? "" : "none";
          if (sel.value === "__custom__" && custom) custom.focus();
          if (unit) unit.value = unitDefault(sel.value);
        });
      }
    });
  }

  /* =====================================================================
   * DASHBOARD
   * =================================================================== */

  function foodHabitCardHTML(iso, compact) {
    const goals = Store().settings.goals || {};
    const enabled = goals.avoidJunkFood !== false;
    if (!enabled) return "";
    const status = St().foodHabitStatus(Store().settings.noJunkFoodLog, iso);
    const label = status === true ? "No junk food" : status === "some" ? "Some junk food" : status === false ? "Junk-food day" : "Not logged";
    const cls = status === true ? "is-avoided" : status === "some" ? "is-partial" : status === false ? "is-junk" : "is-unlogged";
    return `<div class="food-habit ${compact ? "food-habit-compact" : ""} ${cls}" role="group" aria-label="Don't eat junk food for ${iso}">
      <div class="food-habit-copy"><b>🥗 Don't eat junk food</b><span class="food-habit-status" role="status">${label}</span></div>
      <div class="food-habit-actions">
        <button type="button" class="btn btn-sm ${status === true ? "btn-primary" : "btn-ghost"}" data-action="food-log" data-date="${iso}" data-status="true" aria-pressed="${status === true}">No junk food</button>
        <button type="button" class="btn btn-sm ${status === "some" ? "btn-warning" : "btn-ghost"}" data-action="food-log" data-date="${iso}" data-status="some" aria-pressed="${status === "some"}">Some junk</button>
        <button type="button" class="btn btn-sm ${status === false ? "btn-danger" : "btn-ghost"}" data-action="food-log" data-date="${iso}" data-status="false" aria-pressed="${status === false}">Junk-food day</button>
        ${status !== null ? `<button type="button" class="btn btn-sm btn-ghost" data-action="food-log" data-date="${iso}" data-status="clear">Clear log</button>` : ""}
      </div>
    </div>`;
  }

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
    // Earned badges live in the KPI cards below (year totals + year-over-year),
    // not in a panel of their own.
    const badgesYear = challengesOn() ? Store().challenges.filter((challenge) => challenge.completed && challenge.year === year).length : 0;
    const badgesPrev = challengesOn() ? Store().challenges.filter((challenge) => challenge.completed && challenge.year === year - 1).length : 0;

    // --- Quick add card + today's explicit food-habit check-in ---
    // Dashboard consumes the Food engine for its summary; the Food section owns the logic.
    parts.push(quickAddCardHTML());
    if ((Store().settings.goals || {}).avoidJunkFood !== false) {
      parts.push(`<div class="card food-habit-card">${foodHabitCardHTML(today, false)}<p class="food-habit-note">Your logged days power the trends in <button type="button" class="link-btn" data-action="goto" data-view="food">Food</button>.</p></div>`);
      try {
        if (F() && F().overview) {
          const fo = F().overview(Store().settings.noJunkFoodLog, today);
          const statusLabel = fo.todayStatus === "none" ? "No junk food ✓" : fo.todayStatus === "some" ? "Some junk food" : fo.todayStatus === "full" ? "Junk-food day" : "Not logged yet";
          const trendBit = fo.enoughForTrends ? ` · Trend: ${fo.trend}` : "";
          parts.push(`<div class="card food-dash-summary" role="note" aria-label="Food summary"><div><b>🥗 Food · ${fo.currentStreak}-day streak</b><span>${statusLabel}${trendBit}</span></div><button type="button" class="btn btn-sm btn-ghost" data-action="goto" data-view="food">Open Food</button></div>`);
        }
      } catch (e) { /* dashboard summary is best-effort */ }
    }

    // --- KPI stat cards (4, one row on desktop) ---
    const best = yStats.bestMonth;
    const prevYear = year - 1;
    const prev = St().yearlyStats(all, prevYear);
    const cmpDelta = yStats.workouts - prev.workouts;

    parts.push(`<div class="dash-stats">
      ${statCard({
        title: year + " totals", icon: "trophy", cls: "",
        rows: [
          { label: "Workouts", value: St().fmtNum(yStats.workouts) },
          { label: "Workout days", value: St().fmtNum(yStats.days) },
          { label: "Calories", value: yStats.calories ? St().fmtNum(yStats.calories) : "0" },
          { label: "Duration", value: yStats.duration ? St().fmtDuration(yStats.duration) : "—" },
          { label: "Avg workouts / month", value: St().fmtNum(yStats.avgWorkoutsPerMonth, 1) },
          { label: "Best month", value: best ? best.label + " (" + St().fmtNum(best.days) + "d)" : "—" },
          ...(challengesOn() ? [{ label: "Challenge badges", value: St().fmtNum(badgesYear), emoji: "🏆" }] : [])
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
          { label: "Longest streak", value: yStats.longestStreak + " vs " + prev.longestStreak },
          ...(challengesOn() ? [{ label: "Challenge badges", value: St().fmtNum(badgesYear) + " vs " + St().fmtNum(badgesPrev), delta: badgesYear - badgesPrev }] : [])
        ]
      })}
      ${goalsCardHTML()}
    </div>`);

    // --- This week / This month (large comparison KPI cards) ---
    // "This week" is scoped to the selected year, matching "This month".
    const yearWk = all.filter((w) => St().yearOf(w.date) === year);
    const weekStartsOn = Store().settings.weekStartsOn;
    const wk = St().weeklyStats(yearWk, today, weekStartsOn);
    const weekEndLabel = weekStartsOn === "sunday" ? "Saturday" : "Sunday";
    // Longest run of consecutive workout days inside each week window.
    const wkStreak = (start, end) => St().longestStreakInSet(new Set(yearWk.filter((w) => w.date >= start && w.date <= end).map((w) => w.date)));
    const wkStreaks = {
      cur: wkStreak(wk.start, wk.end),
      prev: wkStreak(St().addDays(wk.start, -7), St().addDays(wk.end, -7))
    };
    // Longest run of consecutive rest days (no workout) inside each week window.
    // The still-running current week only counts days up to yesterday — today is
    // not over and future days don't exist yet. Lower is better: 0 = trained daily.
    const wkRest = {
      cur: St().longestRestStreak(yearWk, wk.start, wk.end, today),
      prev: St().longestRestStreak(yearWk, St().addDays(wk.start, -7), St().addDays(wk.end, -7), today)
    };
    // Best day = the single day with the most calories in the period (date + kcal).
    const bestDayOf = (rows) => {
      let best = null;
      St().dayAggregates(rows).forEach((a, iso) => {
        if (!best || a.calories > best.calories) best = { date: iso, calories: a.calories };
      });
      return best;
    };
    const wkBest = {
      cur: bestDayOf(yearWk.filter((w) => w.date >= wk.start && w.date <= wk.end)),
      prev: bestDayOf(yearWk.filter((w) => w.date >= St().addDays(wk.start, -7) && w.date <= St().addDays(wk.end, -7)))
    };
    // Previous calendar month (December of the previous year when in January).
    const prevMonth = month > 1
      ? St().monthlyStats(all, year)[month - 2]
      : St().monthlyStats(all, year - 1)[11];
    const curDaysInPeriod = St().daysInMonth(year, month);
    const prevDaysInPeriod = month > 1 ? St().daysInMonth(year, month - 1) : St().daysInMonth(year - 1, 12);
    const prevMonthYear = month > 1 ? year : year - 1;
    const prevMonthNum = month > 1 ? month - 1 : 12;
    const moBest = {
      cur: bestDayOf(all.filter((w) => St().yearOf(w.date) === year && St().monthOf(w.date) === month)),
      prev: bestDayOf(all.filter((w) => St().yearOf(w.date) === prevMonthYear && St().monthOf(w.date) === prevMonthNum))
    };
    const moRestCurRange = St().monthRange(year, month);
    const moRestPrevRange = St().monthRange(prevMonthYear, prevMonthNum);
    // Longest run of consecutive rest days in the current and previous month,
    // capped at yesterday for the still-running current month.
    const moRest = {
      cur: St().longestRestStreak(all, moRestCurRange.start, moRestCurRange.end, today),
      prev: St().longestRestStreak(all, moRestPrevRange.start, moRestPrevRange.end, today)
    };

    parts.push(`<div class="dash-compare">
      ${periodCard({
        title: "This week",
        sub: St().shortDate(wk.start) + " – " + St().shortDate(wk.end) + " · ends " + weekEndLabel,
        value: wk.cur.workouts,
        pct: St().pctVsPrev(wk.cur.workouts, wk.prev.workouts),
        vs: "last week",
        period: "week",
        cur: periodMetrics(wk.cur, { daysInPeriod: 7, bestStreak: wkStreaks.cur, bestDay: wkBest.cur, restStreak: wkRest.cur, currentStreak: wkStreaks.cur }),
        streakLabel: "Week streak",
        prev: periodMetrics(wk.prev, { daysInPeriod: 7, bestStreak: wkStreaks.prev, bestDay: wkBest.prev, restStreak: wkRest.prev })
      })}
      ${periodCard({
        title: "This month",
        sub: St().MONTHS_LONG[month - 1] + " " + year,
        value: mStats.workouts,
        pct: St().pctVsPrev(mStats.workouts, prevMonth.workouts),
        vs: "last month",
        period: "month",
        cur: periodMetrics(mStats, { daysInPeriod: curDaysInPeriod, bestDay: moBest.cur, restStreak: moRest.cur, currentStreak: streak }),
        prev: periodMetrics(prevMonth, { daysInPeriod: prevDaysInPeriod, bestDay: moBest.prev, restStreak: moRest.prev })
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

    // Staggered entrance plays only when the view was just shown. The class is
    // also removed on plain re-renders so freshly-created children never re-play it.
    if (state.dashEnter) {
      state.dashEnter = false;
      grid.classList.remove("dash-enter");
      void grid.offsetWidth; // reflow so a second visit re-triggers the animation
      grid.classList.add("dash-enter");
    } else {
      grid.classList.remove("dash-enter");
    }

    // Drop any lingering hover tip — the pills were just re-created.
    Focus.Charts.hideTip();

    // One-time delegation: hovering a comparison pill for >0.75s reveals the
    // previous period's actual value (never shown in the card itself).
    if (!prevTipBound) {
      prevTipBound = true;
      bindPrevTipHover(grid);
    }

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
              <label for="qaPickerToggle">Type</label>
              ${typePickerHTML("qa", [])}
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

  /**
   * Large comparison KPI card ("This week" / "This month") — a headline
   * workout count + % pill vs the previous period, plus a compact grid of
   * secondary metrics (days, calories, duration, intensity), each with its
   * own delta pill. Shares the large-card tier (title + sub) with the chart
   * cards below it.
   */
  function periodCard({ title, sub, value, pct, vs, period, cur, prev, streakLabel }) {
    // Hover tip (revealed after 2s on a pill): the previous period's actual value.
    const tip = prev.workouts
      ? { label: "Last " + period + ":", value: St().fmtNum(prev.workouts) + (prev.workouts === 1 ? " workout" : " workouts") }
      : null;
    return `
      <div class="card period-card">
        <div class="card-title">
          <h3>${esc(title)}</h3>
          <span class="sub">${esc(sub)}</span>
        </div>
        <div class="period-body">
          <div class="period-hero">
            <div class="period-value">${St().fmtNum(value)}<span>${value === 1 ? "workout" : "workouts"}</span></div>
            ${pctPill(pct, vs, tip)}
          </div>
          <div class="stat-mini-grid">
            ${metricTile("Rest streak", cur.restStreak, prev.restStreak, (v) => v + " days", period, "", { lowerIsBetter: true, emptyWhenZero: false })}
            ${metricTile("Calories", cur.calories, prev.calories, (v) => St().fmtNum(v), period, "kcal")}
            ${metricTile("Duration", cur.duration, prev.duration, (v) => St().fmtDuration(v), period)}
            ${metricTile("Avg kcal / workout", cur.avgCal, prev.avgCal, (v) => St().fmtNum(v), period, "kcal")}
            ${metricTile("Avg time / workout", cur.avgDur, prev.avgDur, (v) => St().fmtDuration(v), period)}
            ${metricTile("Calories / day", cur.calPerDay, prev.calPerDay, (v) => St().fmtNum(v), period, "kcal")}
            ${metricTile(streakLabel || "Current streak", cur.curStreak, null, (v) => v + " days", period, "", { emptyWhenZero: false })}
            ${bestDayTile(cur.bestDay, prev.bestDay, period)}
            ${metricTile("Best streak", cur.bestStreak, prev.bestStreak, (v) => v + " days", period)}
          </div>
        </div>
      </div>`;
  }

  /**
   * Normalize a week/month stats object for the metric tiles. Computes the
   * per-workout averages from the raw aggregates so both periods behave
   * identically; opts: { daysInPeriod, bestStreak, restStreak, bestDay } for
   * metrics that need the period length or a run-of-days computation the
   * stats object lacks.
   */
  function periodMetrics(s, opts) {
    const o = opts || {};
    return {
      workouts: s.workouts,
      days: s.days,
      calories: s.calories,
      duration: s.duration,
      avgCal: s.workouts ? s.calories / s.workouts : null,
      avgDur: s.workouts ? s.duration / s.workouts : null,
      calPerDay: o.daysInPeriod ? s.calories / o.daysInPeriod : null,
      curStreak: o.currentStreak != null ? o.currentStreak : null,
      bestDay: o.bestDay != null ? o.bestDay : null,
      bestStreak: o.bestStreak != null ? o.bestStreak : (s.bestStreak != null ? s.bestStreak : null),
      restStreak: o.restStreak != null ? o.restStreak : (s.restStreak != null ? s.restStreak : null)
    };
  }

  /**
   * Compact stat tile: label + current value + signed % pill vs the previous
   * period. opts: { lowerIsBetter } flips the pill colors so a drop reads
   * green (used for rest days, where less is good); { emptyWhenZero: false }
   * keeps 0 meaningful instead of collapsing the tile to an em dash (a rest
   * streak of 0 days means "trained every single day in the period").
   */
  function metricTile(label, cur, prev, fmt, period, unit, opts) {
    const o = opts || {};
    const hasPrev = prev != null && prev > 0;
    // null current value (e.g. average with no workouts) or nothing recorded
    // in either period → em dash, no pill — never a misleading percentage.
    // Zero stays visible only when the caller says it is a real value.
    if (cur == null || (cur <= 0 && !hasPrev && o.emptyWhenZero !== false)) return `<div class="stat-mini"><div class="l">${esc(label)}</div><div class="v">—</div></div>`;
    const val = cur > 0 ? fmt(cur) : (o.emptyWhenZero === false ? fmt(cur) : "0");
    const tip = hasPrev ? { label: "Last " + period + ":", value: fmt(prev) + (unit ? " " + unit : "") } : null;
    const pill = hasPrev ? pctPill(St().pctVsPrev(cur > 0 ? cur : 0, prev), "", tip, o.lowerIsBetter) : "";
    return `<div class="stat-mini"><div class="l">${esc(label)}</div><div class="v">${val} ${pill}</div></div>`;
  }

  /** Best-day tile: shows only the best day's date; the kcal metrics of both periods
   *  appear on the % pill's hover tooltip vs the previous period's best day. */
  function bestDayTile(cur, prev, period) {
    if (!cur) return `<div class="stat-mini"><div class="l">Best day</div><div class="v">—</div></div>`;
    const val = esc(St().shortDate(cur.date));
    let pill = "";
    if (prev) {
      const tip = {
        label: "This " + period + ":",
        value: esc(St().shortDate(cur.date)) + " · " + St().fmtNum(cur.calories) + " kcal · last " + period + ": " + esc(St().shortDate(prev.date)) + " · " + St().fmtNum(prev.calories) + " kcal"
      };
      pill = pctPill(St().pctVsPrev(cur.calories, prev.calories), "", tip);
    }
    return `<div class="stat-mini"><div class="l">Best day</div><div class="v">${val} ${pill}</div></div>`;
  }

  /** Delta pill in the "2026 vs 2025" style — signed percentage, optional period label, and an optional hover tip revealing the previous period's actual value. With lowerIsBetter, colors flip so a decrease reads green (e.g. rest days). */
  function pctPill(pct, vs, tip, lowerIsBetter) {
    const suffix = vs ? " vs " + vs : "";
    const attrs = tip ? ` data-prev="${esc(tip.value)}" data-prev-label="${esc(tip.label)}"` : "";
    if (pct === 0) return `<span class="delta flat"${attrs}>±0%${suffix}</span>`;
    const up = pct > 0;
    // Base class follows the raw direction; with lowerIsBetter the good-down /
    // bad-up marker overrides its colors (a falling rest streak reads green).
    const cls = up ? "up" : "down";
    const inv = lowerIsBetter ? (up ? " bad-up" : " good-down") : "";
    return `<span class="delta ${cls}${inv}"${attrs}>${up ? "▲" : "▼"} ${St().fmtDelta(pct)}%${suffix}</span>`;
  }

  /* --- hover-to-reveal: previous period's value after a 0.3s hover on a pill --- */
  let prevTipBound = false;
  let prevTipTimer = null;

  /** Show the previous-period value tooltip near the cursor (edge-flip like chart tips). */
  function showPrevTip(pill, e) {
    const t = document.getElementById("chartTooltip");
    if (!t) return;
    t.innerHTML = `<b>${esc(pill.getAttribute("data-prev-label") || "")}</b> ${esc(pill.getAttribute("data-prev") || "")}`;
    t.hidden = false;
    t.style.left = "0px";
    t.style.top = "0px";
    const r = t.getBoundingClientRect();
    const pad = 12;
    let tx = e.clientX + pad;
    let ty = e.clientY - r.height - 10;
    if (tx + r.width > window.innerWidth - 8) tx = e.clientX - r.width - pad;
    if (ty < 8) ty = e.clientY + pad;
    t.style.left = tx + "px";
    t.style.top = ty + "px";
  }

  /** Event delegation on the dashboard grid: hover a pill 0.3s → show the previous value. */
  function bindPrevTipHover(grid) {
    grid.addEventListener("mouseover", (e) => {
      const pill = e.target.closest(".delta[data-prev]");
      if (!pill) return;
      clearTimeout(prevTipTimer);
      prevTipTimer = setTimeout(() => {
        prevTipTimer = null;
        showPrevTip(pill, e);
      }, 300);
    });
    // Once visible, follow the pointer; while the 0.3s is still counting, keep the anchor.
    grid.addEventListener("mousemove", (e) => {
      if (prevTipTimer) return;
      const pill = e.target.closest(".delta[data-prev]");
      if (pill && !document.getElementById("chartTooltip").hidden) showPrevTip(pill, e);
    });
    grid.addEventListener("mouseout", (e) => {
      const pill = e.target.closest(".delta[data-prev]");
      if (!pill) return;
      clearTimeout(prevTipTimer);
      prevTipTimer = null;
      Focus.Charts.hideTip();
    });
  }

  /** Progress toward the user's goals (set in Settings). Shown as a stat card. */
  function goalsCardHTML() {
    const g = Store().settings.goals || {};
    const has = g.calPerDay != null || g.durPerDay != null || g.workoutsPerWeek != null || g.avoidJunkFood !== false;
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
    const wk = St().weeklyStats(Store().workouts, today, Store().settings.weekStartsOn).cur.workouts;
    // Daily completion comes from the shared goal logic (calorie and time are
    // judged independently); only the weekly workout target is local here.
    const hits = St().dailyGoalStatus(Store().workouts, g).get(today);
    const row = (label, icon, cur, goal, unit, met) => {
      if (goal == null) return null;
      return { label, value: `${St().fmtNum(cur)} / ${St().fmtNum(goal)} ${unit} ${met ? "✅" : "⏳"}`, emoji: icon };
    };
    // The no-junk-food habit is a daily goal like the others: met only when
    // today is explicitly logged as a no-junk-food day (single source: Food engine).
    const foodMet = g.avoidJunkFood !== false
      ? { label: "Don't eat junk food (today)", value: (F() ? F().isGoalMet(Store().settings.noJunkFoodLog, today) : St().foodHabitStatus(Store().settings.noJunkFoodLog, today) === true) ? "met ✅" : "open ⏳", emoji: "🥗" }
      : null;
    return statCard({
      title: "Goals", icon: "target", cls: "amber",
      rows: [
        row("Calories (today)", "🔥", cal, g.calPerDay, "kcal", !!(hits && hits.calHit)),
        row("Duration (today)", "⏱️", dur, g.durPerDay, "min", !!(hits && hits.timeHit)),
        row("Workouts (this week)", "🎯", wk, g.workoutsPerWeek, "", wk >= g.workoutsPerWeek),
        foodMet
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
    const completedChallenges = challengesOn() ? Store().challenges.filter((challenge) => challenge.completed) : [];
    const completedByMonth = new Map();
    completedChallenges.forEach((challenge) => {
      const key = `${challenge.year}-${String(challenge.month).padStart(2, "0")}`;
      if (!completedByMonth.has(key)) completedByMonth.set(key, []);
      completedByMonth.get(key).push(challenge);
    });
    const seg = document.querySelectorAll("#calModeSeg .seg-btn");
    seg.forEach((b) => b.classList.toggle("is-active", b.dataset.calMode === state.calMode));
    document.getElementById("calLegend").innerHTML = `
      <span>No workout</span>
      ${[1, 2, 3, 4].map((l) => `<span class="lvl lvl-${l}"></span>`).join("")}
      <span>More intense →</span>`;

    const body = document.getElementById("calendarBody");
    if (state.calMode === "year") {
      body.innerHTML = yearHeatGrid(all, year, true, completedByMonth);
    } else {
      renderMonthView();
    }
  }

  function yearHeatGrid(all, year, interactive, completedByMonth = new Map()) {
    const ms = St().monthlyStats(all, year);
    const g = Store().settings.goals || {};
    // Independent per-day goal statuses (🔥 calories and ⏱️ time evaluated separately).
    const gs = St().dailyGoalStatus(all, g);
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
      let calCnt = 0, durCnt = 0;
      const cells = [];
      const monthStart = year + "-" + String(i + 1).padStart(2, "0") + "-01";
      for (let pad = 0; pad < St().weekStartOffset(monthStart, Store().settings.weekStartsOn); pad++) {
        cells.push('<div class="day empty" aria-hidden="true"></div>');
      }
      for (let d = 1; d <= St().daysInMonth(year, i + 1); d++) {
        const info = map.get(d);
        const iso = year + "-" + String(i + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        const lvl = info ? info.level : 0;
        const hits = gs.get(iso);
        if (hits) { if (hits.calHit) calCnt++; if (hits.timeHit) durCnt++; }
        const today = year === St().yearOf(St().todayISO()) && d === St().dayOf(St().todayISO()) && i + 1 === St().monthOf(St().todayISO());
        cells.push(`<div class="day ${lvl ? "has-workout lvl-" + lvl : ""} ${today ? "today" : ""} ${info && interactive && iso === bestDayISO ? "best-day" : ""}" ${info ? `data-day="${iso}" data-calinfo="1"` : ""} title="${info ? `${d} · ${St().fmtNum(info.calories)} kcal · ${info.count} workout${info.count > 1 ? "s" : ""}` : ""}">${d}</div>`);
      }
      // Interactive grids (the real calendar) highlight the current month with
      // a colored border only; the analytics heatmap reuses this renderer.
      const isCur = interactive && year === St().yearOf(St().todayISO()) && i + 1 === St().monthOf(St().todayISO());
      // The 🏆 Best badge marks the year's most consistent month and shows in
      // both the calendar and the analytics heatmap. The two goal chips
      // (calories 🔥 / time ⏱️) count days that hit each goal separately.
      const isBest = m.days > 0 && i === bestIdx;
      const foot = [
        isBest ? `<span class="best-chip" title="Most consistent month">🏆 Best</span>` : "",
        g.calPerDay != null && calCnt ? `<span class="goal-chip cal" title="Days that hit your calorie goal">🔥 ${calCnt}</span>` : "",
        g.durPerDay != null && durCnt ? `<span class="goal-chip time" title="Days that hit your duration goal">⏱️ ${durCnt}</span>` : ""
      ].filter(Boolean).join("");
      const monthChallenges = completedByMonth.get(`${year}-${String(i + 1).padStart(2, "0")}`) || [];
      const challenge = monthChallenges[0];
      const shield = challenge ? `<span class="challenge-shield" style="--badge-color:${challengeColor(challenge.month)}" role="img" aria-label="${monthChallenges.length} completed challenge${monthChallenges.length === 1 ? "" : "s"}: ${esc(monthChallenges.map((c) => challengeTip(c)).join("; "))}" title="${esc(monthChallenges.map((c) => challengeTip(c) + (c.completionDate ? " · " + St().prettyDate(c.completionDate) : "")).join("; "))}">${SHIELD_ICON}</span>${monthChallenges.length > 1 ? `<small class="challenge-shield-count">+${monthChallenges.length - 1}</small>` : ""}` : "";
      return `
        <div class="card month-card ${isCur ? "is-current" : ""}" data-action="openmonth" data-month="${i + 1}">
          <div class="month-head"><strong>${m.label}</strong><span class="${m.days ? "" : "rest"}">${m.days ? m.days + "d · " + St().fmtNum(m.calories) + " kcal" : "rest"}</span>${shield}</div>
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
    const weekStartsOn = Store().settings.weekStartsOn;
    const firstWeekday = St().weekStartOffset(year + "-" + String(month).padStart(2, "0") + "-01", weekStartsOn);
    const dim = St().daysInMonth(year, month);
    const today = St().todayISO();
    const sel = state.calDay;
    const g = Store().settings.goals || {};
    const foodLog = Store().settings.noJunkFoodLog || {};
    const monthChallenge = challengesOn() ? Store().challenges.find((challenge) => challenge.completed && challenge.year === year && challenge.month === month) : null;
    // Independent per-day goal statuses (🔥 calories and ⏱️ time evaluated separately).
    const gs = St().dailyGoalStatus(all, g);

    // The month's most intense day (most calories) gets a subtle accent ring.
    let bestD = -1, bestCal = -1;
    map.forEach((info, d) => { if (info.calories > bestCal) { bestCal = info.calories; bestD = d; } });

    let calHits = 0, durHits = 0;
    let cells = "";
    for (let i = 0; i < firstWeekday; i++) cells += `<div class="day-cell empty" aria-hidden="true"></div>`;
    for (let d = 1; d <= dim; d++) {
      const iso = year + "-" + String(month).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const info = map.get(d);
      const isToday = iso === today;
      const isSel = iso === sel;
      const hits = gs.get(iso);
      const calHit = !!(hits && hits.calHit);
      const durHit = !!(hits && hits.timeHit);
      const goalHit = !!hits && (g.calPerDay == null || calHit) && (g.durPerDay == null || durHit); // gold ring only when every configured goal is met
      if (calHit) calHits++;
      if (durHit) durHits++;
      // Badges only appear on workout days (the status map only holds those);
      // an empty day has nothing to evaluate against its goals.
      const badges = [];
      if (hits) {
        if (g.calPerDay != null) badges.push(`<span class="goal-badge cal ${calHit ? "met" : ""}" title="${calHit ? "Calorie goal met" : "Calorie goal not met"}">🔥</span>`);
        if (g.durPerDay != null) badges.push(`<span class="goal-badge time ${durHit ? "met" : ""}" title="${durHit ? "Duration goal met" : "Duration goal not met"}">⏱️</span>`);
      }
      const badgesHTML = badges.length ? `<span class="goal-badges">${badges.join("")}</span>` : "";
      cells += `
        <div class="day-cell ${info ? "has-wk lvl-" + info.level : ""} ${isToday ? "today" : ""} ${isSel ? "selected" : ""} ${goalHit ? "goal-hit" : ""} ${d === bestD ? "best-day" : ""}" data-day="${iso}" data-calday="1" role="button" tabindex="0" aria-label="${iso}${info ? ", " + info.count + " workouts" : ""}">
          <span class="dnum">${d}</span>
          ${badgesHTML}
          ${info ? `<span class="kcal">${St().fmtNum(info.calories)} kcal</span><span class="mini-bar" style="background:var(--heat-${info.level});width:${20 + info.level * 20}%"></span>` : ""}
        </div>`;
    }

    const prevM = month === 1 ? 12 : month - 1;
    const nextM = month === 12 ? 1 : month + 1;
    const prevY = month === 1 ? year - 1 : year;
    const nextY = month === 12 ? year + 1 : year;

    const gParts = [];
    if (g.calPerDay != null) gParts.push(`<b class="goal-hit-count cal">🔥 ${calHits} day${calHits === 1 ? "" : "s"} hit your calorie goal</b>`);
    if (g.durPerDay != null) gParts.push(`<b class="goal-hit-count time">⏱️ ${durHits} day${durHits === 1 ? "" : "s"} hit your duration goal</b>`);
    const gLine = gParts.length
      ? `<div class="goal-summary">${gParts.join(`<span class="goal-summary-sep">·</span>`)}</div>`
      : "";
    const dayPanel = sel ? dayPanelHTML(sel) : `
      <div class="card month-summary">
        <h3 style="margin-top:0">${St().MONTHS_LONG[month - 1]} ${year}</h3>
        <div class="day-total" style="margin:12px 0">
          <div class="t"><b>${St().fmtNum(mStats.workouts)}</b><span>workouts</span></div>
          <div class="t"><b>${St().fmtNum(mStats.days)}</b><span>workout days</span></div>
          <div class="t"><b>${(() => { const r = St().trainingRecoveryMonthStats(all, year, month, today); return r.elapsedDays ? St().fmtNum(r.restDays) : "—"; })()}</b><span>rest days · elapsed</span></div>
        </div>
        <div class="day-total">
          <div class="t"><b>${St().fmtNum(mStats.calories)}</b><span>kcal</span></div>
          <div class="t"><b>${mStats.duration ? St().fmtDuration(mStats.duration) : "—"}</b><span>duration</span></div>
          <div class="t"><b>${mStats.bestStreak ? mStats.bestStreak + "d" : "—"}</b><span>best workout streak</span></div>
        </div>
        ${gLine}        ${(() => { const range = St().monthRange(year, month); const top = St().bestTrainingDay(all, range.start, range.end); return `<div class="food-summary month-training-highlight"><div><b>🏅 Best training day</b><span>${top ? St().prettyDate(top.date) + " · " + top.workouts + " workouts · " + St().fmtNum(top.calories) + " kcal" : "No workout recorded this month."}</span></div></div>`; })()}
        ${foodHabitSummaryHTML(foodLog, year, month, today)}
        <div style="font-size:13px;color:var(--text-dim)">Click a day to see its workouts and log your food goal.</div>
        <div class="day-actions">
          <button class="btn btn-primary" data-action="quick-add">${ICONS.plus} Add workout</button>
          <button class="btn btn-ghost" data-action="add-measurement">${ICONS.scale} Add measurement</button>
        </div>
      </div>`;

    body.innerHTML = `
      <div class="cal-toolbar" style="justify-content:space-between;margin-top:0">
        <div class="year-picker" style="padding:3px">
          <button class="icon-btn" id="calMonthPrev">${ICONS.back}</button>
          <span class="challenge-month-label" style="font-weight:700;min-width:130px;text-align:center">${St().MONTHS_LONG[month - 1]} ${year}${monthChallenge ? `<span style="--badge-color:${challengeColor(month)}" role="img" aria-label="${isSpecialChallenge(monthChallenge) ? "Special edition completed: " : "Monthly challenge completed: "}${esc(challengeTip(monthChallenge))}" title="${esc(challengeTip(monthChallenge))}${monthChallenge.completionDate ? " · completed " + esc(St().prettyDate(monthChallenge.completionDate)) : ""}">${SHIELD_ICON}</span>` : ""}</span>
          <button class="icon-btn" id="calMonthNext">${ICONS.back.replace('M15 18l-6-6 6-6', 'M9 6l6 6-6 6')}</button>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="cal-year">Back to year view</button>
      </div>
      <div class="month-detail">
        <div>
          <div class="weekdays">${St().weekdayLabels(weekStartsOn).map((d) => `<span>${d}</span>`).join("")}</div>
          <div class="days-grid">${cells}</div>
        </div>
        <div id="dayPanel">${dayPanel}</div>
      </div>`;

    body.querySelector("#calMonthPrev").onclick = () => { state.calMonth = prevM; if (month === 1) Focus.App.setYear(prevY); state.calDay = null; renderCalendar(); };
    body.querySelector("#calMonthNext").onclick = () => { state.calMonth = nextM; if (month === 12) Focus.App.setYear(nextY); state.calDay = null; renderCalendar(); };
  }

  function foodHabitSummaryHTML(log, year, month, refDateISO) {
    const goals = Store().settings.goals || {};
    if (goals.avoidJunkFood === false) return "";
    // Calendar consumes the centralized Food engine (single source of truth).
    let stats = null;
    try {
      if (F() && F().monthStats) {
        const ms = F().monthStats(log, year, month, refDateISO);
        stats = { ...ms, avoidedDays: ms.noneDays, partialJunkFoodDays: ms.someDays, junkFoodDays: ms.fullDays };
      } else stats = St().foodHabitMonthStats(log, year, month, refDateISO);
    } catch (e) { stats = St().foodHabitMonthStats(log, year, month, refDateISO); }
    if (!stats || stats.elapsedDays === 0) return `<div class="food-summary"><div><b>🥗 Avoid junk food</b><span>No elapsed days in this month yet.</span></div><div class="food-summary-rate"><b>—</b><span>avoidance · 0 logged</span></div><p>Future dates are excluded.</p></div>`;
    const rate = stats.avoidanceRate == null ? "—" : Math.round(stats.avoidanceRate * 100) + "%";
    // Full junk-food days count as 1; "some junk food" days count as 0.5.
    const monthTotal = stats.junkFoodDays + stats.partialJunkFoodDays * 0.5;
    const monthTotalLabel = monthTotal === 0 ? "—"
      : `${monthTotal} junk-food day${monthTotal === 1 ? "" : "s"}`;

    return `<div class="food-summary"><div><b>🥗 Avoid junk food</b><span>${stats.junkFoodDays} full junk-food day${stats.junkFoodDays === 1 ? "" : "s"} · ${stats.partialJunkFoodDays} partial day${stats.partialJunkFoodDays === 1 ? "" : "s"} · ${stats.avoidedDays} no-junk-food day${stats.avoidedDays === 1 ? "" : "s"} · ${monthTotalLabel}</span></div><div class="food-summary-rate"><b>${rate}</b><span>fully avoided · ${stats.avoidedDays} / ${stats.loggedDays} logged</span></div>${stats.loggedDays ? `<p>${stats.unloggedDays} unlogged day${stats.unloggedDays === 1 ? "" : "s"} excluded from the rate.</p>` : `<p>No food days logged yet; unknown dates aren't counted.</p>`}</div>`;

  }

  /** Progress vs daily goals for a single day ('' when no goals are set).
   *  `hits` comes from Stats.dailyGoalStatus so calorie/time completion uses
   *  the same independent logic everywhere. */
  function dayGoalsHTML(calories, duration, hits) {
    const g = Store().settings.goals || {};
    const rows = [];
    if (g.calPerDay != null) {
      const met = !!(hits && hits.calHit);
      rows.push(`<div class="goal-row ${met ? "ok" : ""}"><span>🔥 Calories</span><b>${St().fmtNum(calories)} / ${St().fmtNum(g.calPerDay)} kcal ${met ? "✅" : "⏳"}</b></div>`);
    }
    if (g.durPerDay != null) {
      const met = !!(hits && hits.timeHit);
      rows.push(`<div class="goal-row ${met ? "ok" : ""}"><span>⏱️ Duration</span><b>${St().fmtNum(duration)} / ${St().fmtNum(g.durPerDay)} min ${met ? "✅" : "⏳"}</b></div>`);
    }
    return rows.length ? `<div class="goal-block">${rows.join("")}</div>` : "";
  }

  function dayPanelHTML(iso) {
    const all = Store().workouts.filter((w) => w.date === iso);
    const cal = all.reduce((s, w) => ({ calories: s.calories + (w.calories || 0), duration: s.duration + (w.duration || 0) }), { calories: 0, duration: 0 });
    const hits = St().dailyGoalStatus(Store().workouts, Store().settings.goals || {}).get(iso);
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
        ${dayGoalsHTML(cal.calories, cal.duration, hits)}
        ${foodHabitCardHTML(iso, true)}
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

  /* Compact ⓘ popover explaining the body-fat reference ranges. */
  let infoPopEl = null;
  function closeInfoPopover() {
    if (infoPopEl) {
      infoPopEl.remove();
      infoPopEl = null;
    }
    document.removeEventListener("click", onInfoDocClick);
    document.removeEventListener("keydown", onInfoEsc);
  }
  function onInfoDocClick(e) {
    if (infoPopEl && !infoPopEl.contains(e.target)) closeInfoPopover();
  }
  function onInfoEsc(e) {
    if (e.key === "Escape") closeInfoPopover();
  }
  function openInfoPop(anchor, html) {
    closeInfoPopover();
    infoPopEl = document.createElement("div");
    infoPopEl.className = "info-pop";
    infoPopEl.setAttribute("role", "tooltip");
    infoPopEl.innerHTML = html;
    document.body.appendChild(infoPopEl);
    const r = anchor.getBoundingClientRect();
    const w = infoPopEl.offsetWidth;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    infoPopEl.style.left = left + "px";
    infoPopEl.style.top = (r.bottom + 8) + "px";
    infoPopEl.classList.add("show");
    setTimeout(() => document.addEventListener("click", onInfoDocClick), 0);
    document.addEventListener("keydown", onInfoEsc);
  }

  function openInfoPopover(anchor, sex) {
    const ranges = St().bfInfoRanges(sex);
    openInfoPop(anchor, `
      <b>Body-fat reference ranges — ${sex === "female" ? "women" : "men"}</b>
      <div class="info-rows">
        ${ranges.map((r) => `<div class="info-row"><span>${esc(r.label)}</span><b>${r.range}</b></div>`).join("")}
      </div>
      <p>U.S. Navy circumference method · estimates, not a medical diagnosis.</p>`);
  }

  /** Reference-range rows sharing the body-fat popover look; the row matching
      the user's current value is highlighted via activeIndex. */
  function compInfoRows(rows, activeIndex) {
    return `<div class="info-rows">${rows.map((r, i) => `<div class="info-row${i === activeIndex ? " is-active" : ""}"><span>${esc(r.label)}</span><b>${esc(r.range)}</b></div>`).join("")}</div>`;
  }

  function openBmiPopover(anchor, bmi) {
    const v = Number(bmi);
    const rows = [
      { label: "Underweight", range: "below 18.5" },
      { label: "Normal weight", range: "18.5 – 25" },
      { label: "Overweight", range: "25 – 30" },
      { label: "Obesity", range: "30 and above" }
    ];
    const active = !(v > 0) ? -1 : v < 18.5 ? 0 : v < 25 ? 1 : v < 30 ? 2 : 3;
    openInfoPop(anchor, `
      <b>BMI reference ranges (WHO)</b>
      ${compInfoRows(rows, active)}
      <p>Your BMI is marked. BMI can't tell muscle from fat — read it with body fat %.</p>`);
  }

  function openMassPopover(anchor, composition, kind) {
    const isLean = kind === "lean";
    const value = isLean ? composition.leanMass : composition.fatMass;
    const sharePct = composition.bodyFat != null ? (isLean ? 100 - composition.bodyFat : composition.bodyFat) : null;
    const unit = composition.massUnit || "kg";
    const showMass = (kg) => kg == null ? "—" : `${St().fmtNum(St().convertTo(kg, "kg", unit), 1)} ${esc(unit)}`;
    const female = profileSex() === "female";
    const essLo = composition.weightKg != null ? showMass(composition.weightKg * (female ? 0.10 : 0.02)) : "—";
    const essHi = composition.weightKg != null ? showMass(composition.weightKg * (female ? 0.13 : 0.05)) : "—";
    const rows = isLean
      ? [{ label: "Your lean mass", range: `${St().fmtNum(value, 1)} ${unit}` }, { label: "Share of body weight", range: sharePct == null ? "—" : `${St().fmtNum(sharePct, 1)}%` }]
      : [{ label: "Your fat mass", range: `${St().fmtNum(value, 1)} ${unit}` }, { label: "Share of body weight", range: sharePct == null ? "—" : `${St().fmtNum(sharePct, 1)}%` }, { label: `Essential minimum (${female ? "women 10–13%" : "men 2–5%"})`, range: `~${essLo} – ${essHi}` }];
    openInfoPop(anchor, `
      <b>${isLean ? "Lean mass" : "Fat mass"} — your numbers</b>
      ${compInfoRows(rows, 0)}
      <p>${isLean ? "Everything that isn't fat — muscle, bone, water, organs. No single healthy number: compare against your own history. Rising lean mass at a steady weight usually means recomposition." : "Some fat is essential; above that minimum, less generally tracks with better health markers. An estimate from weight × body-fat %, not a diagnosis."}</p>`);
  }

  function openWaistRatioPopover(anchor, ratio) {
    const r = Number(ratio);
    const rows = [
      { label: "Healthy", range: "below 0.50" },
      { label: "Increased risk", range: "0.50 – 0.60" },
      { label: "High risk", range: "above 0.60" }
    ];
    const active = !(r > 0) ? -1 : r < 0.5 ? 0 : r <= 0.6 ? 1 : 2;
    openInfoPop(anchor, `
      <b>Waist-to-height reference</b>
      ${compInfoRows(rows, active)}
      <p>Keep your waist less than half your height. Your ratio is marked.</p>`);
  }

  /** One binder for every reference popover on a composition card.
      getCtx() returns { sex, bmi, composition } — whichever the card has. */
  function bindCompInfoButtons(root, getCtx) {
    root.querySelectorAll("[data-comp-info]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const ctx = getCtx() || {};
        const kind = btn.dataset.compInfo;
        if (kind === "bf") openInfoPopover(btn, ctx.sex || "male");
        else if (kind === "bmi") openBmiPopover(btn, ctx.bmi);
        else if (kind === "lean" || kind === "fat") { if (ctx.composition) openMassPopover(btn, ctx.composition, kind); }
        else if (kind === "waist") { if (ctx.composition) openWaistRatioPopover(btn, ctx.composition.waistHeightRatio); }
      });
    });
  }

  function renderTools() {
    const wt = Store().settings.weightUnit || "lb";
    const sex = Store().settings.sex || "male";
    // Prefill from the Settings profile first (height, neck — they rarely
    // change), then the latest recorded measurements, so nothing has to be
    // typed twice. Falls back to the classic example defaults when empty.
    const ms = Store().measurements;
    const latestCm = (t) => {
      const r = St().latestOfType(ms, t);
      return r ? St().toCm(r.value, r.unit) : null;
    };
    const wRec = St().latestOfType(ms, "Weight");
    const wKg = wRec ? St().toKg(wRec.value, wRec.unit) : null;
    // Height comes from the profile in Settings first (it rarely changes), then
    // from a recorded Height measurement, then the example default.
    const sH = Store().settings;
    const hCm = sH.height != null ? St().toCm(sH.height, sH.heightUnit || "cm") : latestCm("Height");
    // Neck is profile data (Settings › Profile); a historic Neck measurement is
    // the fallback so old records keep prefilling the calculator.
    const sNeck = Store().settings;
    const nCm = sNeck.neck != null ? St().toCm(sNeck.neck, sNeck.neckUnit || "cm") : latestCm("Neck");
    const wstCm = latestCm("Waist");
    const hipCm = latestCm("Hips");
    const r1 = (x) => x == null ? null : Math.round(x * 10) / 10;
    const hVal = r1(hCm) != null ? r1(hCm) : 175;
    const wVal = wKg != null ? r1(wt === "lb" ? wKg / KG_PER_LB : wKg) : (wt === "lb" ? 154 : 70);
    const nVal = r1(nCm) != null ? r1(nCm) : "";
    const wstVal = r1(wstCm) != null ? r1(wstCm) : "";
    const hipVal = r1(hipCm) != null ? r1(hipCm) : "";
    const lenUnitOpts = `<option value="cm" selected>cm</option><option value="in">in</option>`;
    document.getElementById("toolsBody").innerHTML = `
      <div class="tools-grid">
        <div class="card data-card">
          <h3>BMI + body-fat calculator</h3>
          <p class="desc">Body Mass Index from height and weight, plus an estimated body fat % (U.S. Navy method) once you add your neck and waist${sex === "female" ? " and hips" : ""} measurements. Estimates — not a diagnosis.</p>
          <div class="bmi-sex" role="group" aria-label="Body profile">
            <span class="bmi-sex-lbl">Body profile</span>
            <button type="button" class="chip ${sex === "male" ? "is-active" : ""}" data-bmi-sex="male">Male</button>
            <button type="button" class="chip ${sex === "female" ? "is-active" : ""}" data-bmi-sex="female">Female</button>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="bmiHeight">Height</label>
              <div class="input-with-unit">
                <input class="input" id="bmiHeight" type="number" step="any" min="0" placeholder="175" value="${hVal}">
                <select class="select" id="bmiHeightUnit" aria-label="Height unit">
                  ${lenUnitOpts}
                </select>
              </div>
            </div>
            <div class="field">
              <label for="bmiWeight">Weight</label>
              <div class="input-with-unit">
                <input class="input" id="bmiWeight" type="number" step="any" min="0" placeholder="70" value="${wVal}">
                <select class="select" id="bmiWeightUnit" aria-label="Weight unit">
                  <option value="kg">kg</option>
                  <option value="lb" ${wt === "lb" ? "selected" : ""}>lb</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label for="bmiNeck">Neck</label>
              <div class="input-with-unit">
                <input class="input" id="bmiNeck" type="number" step="any" min="0" placeholder="38" value="${nVal}">
                <select class="select" id="bmiNeckUnit" aria-label="Neck unit">${lenUnitOpts}</select>
              </div>
            </div>
            <div class="field">
              <label for="bmiWaist">Waist</label>
              <div class="input-with-unit">
                <input class="input" id="bmiWaist" type="number" step="any" min="0" placeholder="81" value="${wstVal}">
                <select class="select" id="bmiWaistUnit" aria-label="Waist unit">${lenUnitOpts}</select>
              </div>
            </div>
            <div class="field" id="bmiHipsField" ${sex === "female" ? "" : 'style="display:none"'}>
              <label for="bmiHips">Hips <span class="req-tag">women only</span></label>
              <div class="input-with-unit">
                <input class="input" id="bmiHips" type="number" step="any" min="0" placeholder="96" value="${hipVal}">
                <select class="select" id="bmiHipsUnit" aria-label="Hips unit">${lenUnitOpts}</select>
              </div>
            </div>
          </div>
          <div class="bmi-result" aria-live="polite">
            <div class="bmi-value"><b id="bmiValue">—</b><span>BMI</span></div>
            <div class="bmi-cat-wrap">
              <div class="bmi-cat neutral" id="bmiCat">Enter your height and weight</div>
              <div class="bmi-desc" id="bmiDesc">both fields are needed</div>
            </div>
          </div>
          <div class="bf-result" id="bfResult" hidden aria-live="polite">
            <div class="bmi-value"><b id="bfValue">—</b><span>Est. body fat <button type="button" class="info-btn" id="bfInfoBtn" aria-label="About body-fat ranges">${ICONS.info}</button></span></div>
            <div class="bmi-cat-wrap">
              <div class="bmi-cat neutral" id="bfCat">—</div>
              <div class="bmi-desc" id="bfNote"></div>
            </div>
          </div>
          <div class="bf-hint" id="bfHint" hidden></div>
          <p class="bmi-note">💪 Body fat is estimated with the U.S. Navy circumference method (±3–4%). BMI doesn't measure muscle — a very muscular build can read “overweight” at low body fat.</p>
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
    ["bmiHeight", "bmiHeightUnit", "bmiWeight", "bmiWeightUnit", "bmiNeck", "bmiNeckUnit", "bmiWaist", "bmiWaistUnit", "bmiHips", "bmiHipsUnit", "convValue", "convUnit"].forEach((id) => {
      const n = document.getElementById(id);
      if (!n) return;
      n.addEventListener("input", refresh);
      n.addEventListener("change", refresh);
    });
    // Body-profile toggle: persists to settings (shared with Progress view),
    // reveals the hips field for women and recomputes.
    document.querySelectorAll("[data-bmi-sex]").forEach((b) => {
      b.addEventListener("click", () => {
        const next = b.dataset.bmiSex;
        if (next !== "male" && next !== "female") return;
        Store().setSetting("sex", next);
        document.querySelectorAll("[data-bmi-sex]").forEach((x) => x.classList.toggle("is-active", x === b));
        const hips = document.getElementById("bmiHipsField");
        if (hips) hips.style.display = next === "female" ? "" : "none";
        updateBMI();
      });
    });
    const infoBtn = document.getElementById("bfInfoBtn");
    if (infoBtn) {
      infoBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openInfoPopover(infoBtn, Store().settings.sex || "male");
      });
    }
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
      updateBF(null);
      return;
    }
    const bmi = kg / (meters * meters);
    // categorise by the rounded value actually displayed, so the pill always
    // matches the number on screen (e.g. 24.96 shows 25.0 · Overweight)
    const shown = Number(bmi.toFixed(1));
    v.textContent = shown;
    const c = St().bmiCategory(bmi);
    cat.textContent = c.label;
    desc.textContent = c.desc;
    cat.className = "bmi-cat " + c.cls;
    updateBF({ bmi });
  }

  /** Show/hide the body-fat section depending on which inputs are available. */
  function updateBF(ctx) {
    const bfEl = document.getElementById("bfResult");
    const hint = document.getElementById("bfHint");
    const bfVal = document.getElementById("bfValue");
    const bfCat = document.getElementById("bfCat");
    const bfNote = document.getElementById("bfNote");
    if (!bfEl || !hint || !bfVal || !bfCat || !bfNote) return;
    const sex = (Store().settings.sex || "male");
    const readCm = (id, uid) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const val = parseFloat(el.value);
      if (!isFinite(val) || val <= 0) return null;
      return document.getElementById(uid).value === "in" ? val * 2.54 : val;
    };
    const hCm = readCm("bmiHeight", "bmiHeightUnit");
    const neckCm = readCm("bmiNeck", "bmiNeckUnit");
    const waistCm = readCm("bmiWaist", "bmiWaistUnit");
    const hipsCm = readCm("bmiHips", "bmiHipsUnit");
    const missing = St().navyNeeds(sex).filter((t) =>
      t === "Neck" ? neckCm == null : t === "Waist" ? waistCm == null : hipsCm == null);
    if (ctx && ctx.bmi != null && missing.length === 0) {
      const bf = St().calcNavyBodyFat(sex, hCm, neckCm, waistCm, hipsCm);
      if (bf != null) {
        const cls = St().bodyCompClass(sex, ctx.bmi, bf);
        bfVal.textContent = Number(bf.toFixed(1));
        bfCat.textContent = cls.label;
        bfCat.className = "bmi-cat " + cls.cls;
        bfNote.textContent = cls.note;
        bfEl.hidden = false;
        hint.hidden = true;
        return;
      }
    }
    bfEl.hidden = true;
    if (ctx && ctx.bmi != null && missing.length > 0) {
      hint.textContent = "➕ Add " + missing.join(" + ") + " to estimate body fat %";
      hint.hidden = false;
    } else {
      hint.hidden = true;
    }
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

  /* Per-unit maximum interval for the backup reminder. */
  const REMINDER_MAX = { days: 365, weeks: 52, years: 10 };
  /* Settings sections (tabs). Existing settings are migrated into these —
   * nothing is dropped, only regrouped. */
  const SETTINGS_TABS = [
    ["profile", "👤 Profile"],
    ["preferences", "🎨 Preferences"],
    ["goals", "🎯 Goals"],
    ["notifications", "🔔 Notifications"],
    ["data", "🔒 Data & Privacy"],
    ["about", "ℹ️ About"]
  ];
  // One vivid hue per month. Every entry sits at a mid lightness so the white
  // badge numerals clear ~3:1 or better on all twelve (see .challenge-month-dot).
  const CHALLENGE_COLORS = ["#d2425c", "#d9633f", "#d2751a", "#a87f0a", "#7e9623", "#3e9b5c", "#1f9683", "#2a8cbf", "#3f6fc4", "#6a5ac9", "#9c4fbe", "#c04587"];
  const challengeColor = (month) => CHALLENGE_COLORS[(Number(month) - 1 + 12) % 12];
  const SHIELD_ICON = '<span class="challenge-shield" aria-hidden="true"><svg viewBox="0 0 24 26"><path d="M12 1 22 5v7c0 6.5-4.2 10.5-10 13C6.2 22.5 2 18.5 2 12V5l10-4z"/><path d="m7.5 12.5 3 3 6-6"/></svg></span>';
  const PRIVACY_HTML = `
    <b>Privacy</b>
    <ul class="info-list">
      <li>🔒 No account, no login, no tracking.</li>
      <li>🚫 No internet connection is ever used.</li>
      <li>💾 Everything is stored in this browser only.</li>
      <li>📦 Move data with the export/import tools in the <b>Data</b> view.</li>
    </ul>`;

  function renderSettings() {
    const s = Store().settings;
    const themePref = s.theme === "light" || s.theme === "dark" ? s.theme : "system";
    const wt = s.weightUnit || "lb";
    const sex = s.sex || "male";
    const g = s.goals || {};
    const goalWeightUnit = g.goalWeightUnit || wt;
    const targetWeightValue = g.weight == null ? "" : (St().convertTo(g.weight, goalWeightUnit, wt) ?? "");
    const hCm = s.height != null ? St().toCm(s.height, s.heightUnit || "cm") : null;
    const hVal = hCm != null ? Math.round(hCm * 10) / 10 : "";
    const nCm = s.neck != null ? St().toCm(s.neck, s.neckUnit || "cm") : null;
    const nVal = nCm != null ? Math.round(nCm * 10) / 10 : "";
    if (!state.settingsTab) state.settingsTab = "profile";
    const tab = SETTINGS_TABS.some(([id]) => id === state.settingsTab) ? state.settingsTab : "profile";
    const w = Store().workouts.length, m = Store().measurements.length;
    const accent = s.accent || "violet";
    const anim = s.animations !== false;
    const challengesEnabled = s.challengesEnabled !== false;
    const rem = s.backupReminder !== false;
    const remUnit = s.backupReminderUnit || "days";
    const remVal = s.backupReminderDays ?? 10;
    const weekStartsOn = s.weekStartsOn === "sunday" ? "sunday" : "monday";
    const wRem = s.workoutReminder === true;
    const wTime = s.workoutReminderTime || "18:00";
    const dataSize = Math.max(1, Math.round(JSON.stringify(Store().exportBackup()).length / 1024));
    // App version comes from app/js/version.js (managed by bump-version.py), read
    // at render time so a new build is picked up without a hard refresh.
    const ver = window.FOCUS_VERSION || { major: 1, minor: 0, patch: 0 };
    const versionStr = String(ver.major) + "." + String(ver.minor) + "." + String(ver.patch);
    const curColor = (ACCENTS.find(([n]) => n === accent) || ACCENTS[0])[1];
    document.getElementById("settingsBody").innerHTML = `
      <div class="chip-row settings-tabs" role="tablist" aria-label="Settings sections">
        ${SETTINGS_TABS.map(([id, label]) => `<button type="button" class="chip ${tab === id ? "is-active" : ""}" role="tab" aria-selected="${tab === id}" data-action="settings-tab" data-tab="${id}">${label}</button>`).join("")}
      </div>
      <div class="settings-grid">
        ${tab === "preferences" ? `<div class="card data-card">
          <h3>Preferences</h3>
          <p class="desc">The look and feel of Focus. Your choices are saved locally and apply instantly.</p>
          <div class="setting-row">
            <div class="setting-label"><b>Theme</b><span>Dark is easy on the eyes; light is crisp; system follows your device.</span></div>
            <div class="seg" role="group" aria-label="Theme">
              <button class="seg-btn ${themePref === "dark" ? "is-active" : ""}" data-action="set-theme" data-set-theme="dark">🌙 Dark</button>
              <button class="seg-btn ${themePref === "light" ? "is-active" : ""}" data-action="set-theme" data-set-theme="light">☀️ Light</button>
              <button class="seg-btn ${themePref === "system" ? "is-active" : ""}" data-action="set-theme" data-set-theme="system">🖥️ System</button>
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
            <div class="setting-label"><b>Animations</b><span>Ambient background glows, card highlights, chart draw-ins and entrance animations. Respects your system's reduced-motion preference.</span></div>
            <div class="seg" role="group" aria-label="Animations">
              <button class="seg-btn ${anim ? "is-active" : ""}" data-action="set-animations" data-set-animations="on">✨ On</button>
              <button class="seg-btn ${!anim ? "is-active" : ""}" data-action="set-animations" data-set-animations="off">Off</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-label"><b>🏆 Challenges &amp; badges</b><span>Monthly goals and special editions, each with a badge for every one you complete. Turn it off and its views, badges and summaries disappear — nothing you logged is deleted.</span></div>
            <div class="seg" role="group" aria-label="Challenges and badges">
              <button type="button" class="seg-btn ${challengesEnabled ? "is-active" : ""}" data-action="set-challenges" data-set-challenges="on" aria-pressed="${challengesEnabled}">On</button>
              <button type="button" class="seg-btn ${!challengesEnabled ? "is-active" : ""}" data-action="set-challenges" data-set-challenges="off" aria-pressed="${!challengesEnabled}">Off</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-label"><b>Week starts on</b><span>Sets the first day for weekly summaries and calendar layouts.</span></div>
            <div class="seg" role="group" aria-label="Week starts on">
              <button type="button" class="seg-btn ${weekStartsOn === "monday" ? "is-active" : ""}" data-action="set-week-start" data-week-start="monday" aria-pressed="${weekStartsOn === "monday"}">Monday</button>
              <button type="button" class="seg-btn ${weekStartsOn === "sunday" ? "is-active" : ""}" data-action="set-week-start" data-week-start="sunday" aria-pressed="${weekStartsOn === "sunday"}">Sunday</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-label"><b>Weight unit</b><span>Only affects new records — existing ones keep their units.</span></div>
            <div class="seg" role="group" aria-label="Weight unit">
              <button class="seg-btn ${wt === "kg" ? "is-active" : ""}" data-action="set-weightunit" data-set-weightunit="kg">kg</button>
              <button class="seg-btn ${wt === "lb" ? "is-active" : ""}" data-action="set-weightunit" data-set-weightunit="lb">lb</button>
            </div>
          </div>
        </div>` : ""}

        ${tab === "profile" ? `<div class="card data-card">
          <h3>Profile</h3>
          <p class="desc">Your body profile — height and neck power the BMI and body-fat estimates, so you only set them once.</p>
          <div class="setting-row">
            <div class="setting-label"><b>Body profile</b><span>Used for the body-fat estimate (U.S. Navy method) in Tools and Progress.</span></div>
            <div class="seg" role="group" aria-label="Body profile">
              <button class="seg-btn ${sex === "male" ? "is-active" : ""}" data-action="set-sex" data-set-sex="male">Male</button>
              <button class="seg-btn ${sex === "female" ? "is-active" : ""}" data-action="set-sex" data-set-sex="female">Female</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-label"><b>Height</b><span>Your height barely changes — set it here and every estimate uses it.</span></div>
            <div class="input-with-unit" style="width:200px">
              <input class="input" id="setHeight" type="number" step="any" min="0" placeholder="175" value="${hVal}" aria-label="Height">
              <select class="select" id="setHeightUnit" aria-label="Height unit">
                <option value="cm" ${s.heightUnit !== "in" ? "selected" : ""}>cm</option>
                <option value="in" ${s.heightUnit === "in" ? "selected" : ""}>in</option>
              </select>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-label"><b>Age</b><span>Saved with your profile.</span></div>
            <input class="input" id="setAge" type="number" min="10" max="120" step="1" placeholder="e.g. 30" value="${s.age ?? ""}" style="width:90px" aria-label="Age">
          </div>
          <div class="setting-row">
            <div class="setting-label"><b>Neck</b><span>Used for the body-fat estimate (U.S. Navy method). Past Neck records still work as a fallback.</span></div>
            <div class="input-with-unit" style="width:200px">
              <input class="input" id="setNeck" type="number" step="any" min="0" placeholder="38" value="${nVal}" aria-label="Neck">
              <select class="select" id="setNeckUnit" aria-label="Neck unit">
                <option value="cm" ${s.neckUnit !== "in" ? "selected" : ""}>cm</option>
                <option value="in" ${s.neckUnit === "in" ? "selected" : ""}>in</option>
              </select>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-label"><b>Save profile</b><span>Height, neck and age are applied to the BMI & body-fat tools.</span></div>
            <button class="btn btn-primary" data-action="save-profile">${ICONS.check} Save</button>
          </div>
        </div>` : ""}

        ${tab === "goals" ? `<div class="card data-card">
          <h3>🎯 Goals</h3>
          <p class="desc">Set daily and weekly targets. Progress shows on the dashboard and lights up on the calendar when you beat them.</p>
          <div class="goal-form">
            <div class="goal-field">
              <label for="goalCal">🔥 Daily calories</label>
              <div class="input-with-unit">
                <input class="input" id="goalCal" type="number" min="0" step="1" placeholder="e.g. 500" value="${g.calPerDay ?? ""}">
                <span class="suffix">kcal</span>
              </div>
            </div>
            <div class="goal-field">
              <label for="goalDur">⏱️ Daily duration</label>
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
            <div class="goal-field">
              <label for="goalWeight">Target weight</label>
              <div class="input-with-unit">
                <input class="input" id="goalWeight" type="number" min="0" step="any" placeholder="Optional" value="${targetWeightValue}">
                <select class="select" id="goalWeightUnit" aria-label="Target weight unit"><option value="lb" ${wt === "lb" ? "selected" : ""}>lb</option><option value="kg" ${wt === "kg" ? "selected" : ""}>kg</option></select>
              </div>
            </div>
            <div class="setting-row food-goal-toggle">
              <div class="setting-label"><b>🥗 Don't eat junk food</b><span>Track each day you meet this habit. Unlogged dates stay unknown.</span></div>
              <button type="button" class="seg-btn ${g.avoidJunkFood !== false ? "is-active" : ""}" data-action="toggle-food-goal" aria-pressed="${g.avoidJunkFood !== false}" aria-label="Don't eat junk food daily goal ${g.avoidJunkFood !== false ? "on" : "off"}">${g.avoidJunkFood !== false ? "On" : "Off"}</button>
            </div>
            <div class="goal-actions">
              <button class="btn btn-primary" data-action="save-goals">${ICONS.check} Save goals</button>
            </div>
          </div>
        </div>` : ""}

        ${tab === "notifications" ? `<div class="card data-card">
          <h3>Notifications</h3>
          <p class="desc">Gentle nudges to keep your tracking on rails. Browser notifications need permission — your browser will ask once.</p>
          <div class="setting-row">
            <div class="setting-label"><b>Daily workout reminder</b><span>Shows a browser notification at your training time.</span></div>
            <div class="seg" role="group" aria-label="Daily workout reminder">
              <button type="button" class="seg-btn ${wRem ? "is-active" : ""}" data-action="set-workout-reminder" data-set-workout-reminder="on" aria-pressed="${wRem}">On</button>
              <button type="button" class="seg-btn ${!wRem ? "is-active" : ""}" data-action="set-workout-reminder" data-set-workout-reminder="off" aria-pressed="${!wRem}">Off</button>
            </div>
          </div>
          <div class="setting-row ${wRem ? "" : "is-disabled"}">
            <div class="setting-label"><b>Remind me at</b><span>Your daily training time.</span></div>
            <div class="remind-picker">
              <input class="input" id="setWorkoutTime" type="time" value="${wTime}" ${wRem ? "" : "disabled"} aria-label="Workout reminder time">
              <button class="btn btn-sm btn-ghost" data-action="test-reminder" ${wRem ? "" : "disabled"}>Send test</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-label"><b>Backup reminder</b><span>Reminds you to download a JSON backup after your last one.</span></div>
            <div class="seg" role="group" aria-label="Backup reminder">
              <button class="seg-btn ${rem ? "is-active" : ""}" data-action="set-backup-reminder" data-set-backup-reminder="on">✨ On</button>
              <button class="seg-btn ${!rem ? "is-active" : ""}" data-action="set-backup-reminder" data-set-backup-reminder="off">Off</button>
            </div>
          </div>
          <div class="setting-row ${rem ? "" : "is-disabled"}">
            <div class="setting-label"><b>Remind every</b><span>How often to nudge you for a backup after your last one.</span></div>
            <div class="remind-picker">
              <input class="input" id="setBackupDays" type="number" min="1" max="${REMINDER_MAX[remUnit] || 365}" step="1" value="${remVal}" ${rem ? "" : "disabled"} aria-label="Backup reminder interval">
              <select class="select" id="setBackupUnit" ${rem ? "" : "disabled"} aria-label="Backup reminder unit">
                <option value="days" ${remUnit === "days" ? "selected" : ""}>days</option>
                <option value="weeks" ${remUnit === "weeks" ? "selected" : ""}>weeks</option>
                <option value="years" ${remUnit === "years" ? "selected" : ""}>years</option>
              </select>
            </div>
          </div>
        </div>` : ""}

        ${tab === "data" ? `<div class="card data-card">
          <h3>Data & privacy</h3>
          <p class="desc">Your data never leaves this device. Export, import and deletion live in the Data view.</p>
          <div class="setting-row">
            <div class="setting-label"><b>Privacy</b><span>Focus is designed to be completely private.</span></div>
            <button type="button" class="info-btn" id="privacyInfoBtn" aria-label="About privacy">${ICONS.info}</button>
          </div>
          <div class="setting-row">
            <div class="setting-label"><b>Stored data</b><span>Workouts, measurements and settings in this browser.</span></div>
            <span class="stat-pill">${St().fmtNum(w + m)} records · ${dataSize} KB</span>
          </div>
          <div class="setting-row">
            <div class="setting-label"><b>Manage data</b><span>Backups, CSV/Excel/PDF export, import and deletion.</span></div>
            <button class="btn" data-action="goto" data-view="data">${ICONS.database} Open Data</button>
          </div>
        </div>` : ""}

        ${tab === "about" ? `<div class="card data-card">
          <h3>About</h3>
          <p class="desc">Focus — a personal, offline fitness tracker.</p>
          <ul class="about-list">
            <li><b>Data</b> — ${St().fmtNum(w)} workouts · ${St().fmtNum(m)} measurements</li>
            <li><b>Version</b> — ${versionStr}</li>
            <li><b>Storage</b> — your browser's IndexedDB</li>
            <li><b>Offline</b> — open <code>Focus-Workout-Tracker.html</code> and it just works</li>
          </ul>
        </div>` : ""}
      </div>`;
    // Switching the height unit converts the typed value so the height stays
    // physically the same (175 cm -> 68.9 in), not 175 inches.
    const hInp = document.getElementById("setHeight");
    const hSel = document.getElementById("setHeightUnit");
    if (hInp && hSel) {
      hSel.addEventListener("change", () => {
        const v = parseFloat(hInp.value);
        if (isFinite(v) && v > 0) {
          hInp.value = hSel.value === "in" ? Math.round(v / 2.54 * 10) / 10 : Math.round(v * 2.54 * 10) / 10;
        }
      });
    }
    // Same physical-value conversion for the neck input (38 cm -> 15 in).
    const nInp = document.getElementById("setNeck");
    const nSel = document.getElementById("setNeckUnit");
    if (nInp && nSel) {
      nSel.addEventListener("change", () => {
        const v = parseFloat(nInp.value);
        if (isFinite(v) && v > 0) {
          nInp.value = nSel.value === "in" ? Math.round(v / 2.54 * 10) / 10 : Math.round(v * 2.54 * 10) / 10;
        }
      });
    }
    // Privacy details live behind the ⓘ button to keep the card compact.
    const privacyBtn = document.getElementById("privacyInfoBtn");
    if (privacyBtn) {
      privacyBtn.addEventListener("click", () => openInfoPop(privacyBtn, PRIVACY_HTML));
    }
    // Backup reminder interval — value in the selected unit (days/weeks/years),
    // clamped to the per-unit maximum and applied instantly.
    const daysInp = document.getElementById("setBackupDays");
    const unitSel = document.getElementById("setBackupUnit");
    if (daysInp && unitSel) {
      unitSel.dataset.prev = unitSel.value;
      daysInp.max = String(REMINDER_MAX[unitSel.value] || 365);
      const saveReminder = () => {
        const unit = unitSel.value;
        const v = Math.max(1, Math.min(REMINDER_MAX[unit] || 365, Math.round(Number(daysInp.value) || 1)));
        daysInp.value = v;
        Focus.App.setSetting("backupReminderDays", v);
        Focus.App.setSetting("backupReminderUnit", unit);
        Focus.UI.toast(`Backup reminder: every ${v} ${unit}`);
      };
      daysInp.addEventListener("change", saveReminder);
      unitSel.addEventListener("change", () => {
        // Keep the interval roughly the same when the unit changes (10 days -> 1 week).
        const fromDays = (parseFloat(daysInp.value) || 1) * (St().REMINDER_UNIT_DAYS[unitSel.dataset.prev || "days"] || 1);
        const unit = unitSel.value;
        const v = Math.max(1, Math.min(REMINDER_MAX[unit] || 365, Math.round(fromDays / (St().REMINDER_UNIT_DAYS[unit] || 1))));
        daysInp.value = v;
        daysInp.max = String(REMINDER_MAX[unit] || 365);
        unitSel.dataset.prev = unit;
        saveReminder();
      });
    }
    // Workout reminder time applies instantly and reschedules the notification.
    const wTimeInp = document.getElementById("setWorkoutTime");
    if (wTimeInp) {
      wTimeInp.addEventListener("change", () => {
        const t = wTimeInp.value;
        if (!/^\d{2}:\d{2}$/.test(t)) { Focus.UI.toast("Pick a valid time", "warn"); return; }
        Focus.App.setSetting("workoutReminderTime", t).then(() => {
          Focus.UI.toast(`Workout reminder at ${t}`);
          if (Focus.App.rescheduleWorkoutReminder) Focus.App.rescheduleWorkoutReminder();
        });
      });
    }
  }

  /* =====================================================================
   * PROGRESS (measurements)
   * =================================================================== */

  /**
   * Body-composition summary card: current BMI (and estimated body fat, when
   * the Navy circumference measurements exist) computed from the user's latest
   * recorded measurements — never entered twice.
   */
  function renderLegacyCompCard() {
    const el = document.getElementById("progressCompCard");
    if (!el) return;
    const ms = Store().measurements;
    const sex = Store().settings.sex || "male";
    const sH = Store().settings;
    const hRec = St().latestOfType(ms, "Height");
    const wRec = St().latestOfType(ms, "Weight");
    // Height from the Settings profile wins (it rarely changes); a recorded
    // Height measurement is the fallback.
    const hCm = sH.height != null ? St().toCm(sH.height, sH.heightUnit || "cm") : (hRec ? St().toCm(hRec.value, hRec.unit) : null);
    const wKg = wRec ? St().toKg(wRec.value, wRec.unit) : null;
    const bmi = St().calcBMI(hCm, wKg);
    // Neck comes from the Settings profile first (it rarely changes); a historic
    // Neck measurement is the fallback so old records keep working.
    const nCm = sH.neck != null ? St().toCm(sH.neck, sH.neckUnit || "cm") : (() => { const r = St().latestOfType(ms, "Neck"); return r ? St().toCm(r.value, r.unit) : null; })();
    const wstCm = (() => { const r = St().latestOfType(ms, "Waist"); return r ? St().toCm(r.value, r.unit) : null; })();
    const hipCm = (() => { const r = St().latestOfType(ms, "Hips"); return r ? St().toCm(r.value, r.unit) : null; })();
    const have = { Neck: nCm != null, Waist: wstCm != null, Hips: hipCm != null };
    const missing = St().navyNeeds(sex).filter((t) => !have[t]);
    const bf = bmi != null && missing.length === 0 ? St().calcNavyBodyFat(sex, hCm, nCm, wstCm, hipCm) : null;

    if (bmi == null) {
      el.innerHTML = `
        <div class="card data-card comp-card">
          <div class="card-title"><h3>Body composition</h3><span class="sub">Current BMI & body-fat estimate</span></div>
          <div class="comp-empty">
            <div class="es-icon">${ICONS.scale}</div>
            <p>${sH.height != null
              ? "Record a <b>Weight</b> measurement — your height is saved in Settings — to see your current BMI"
              : "Set your <b>Height</b> in Settings and record a <b>Weight</b> measurement to see your current BMI"}${sex === "female" ? " — add your neck in Settings › Profile plus Waist + Hips records for an estimated body fat %." : " — add your neck in Settings › Profile plus a Waist record for an estimated body fat %."}</p>
          </div>
        </div>`;
      return;
    }

    const bCat = St().bmiCategory(bmi);
    const wTxt = wRec ? St().fmtNum(wRec.value, 1) + " " + esc(wRec.unit) : null;
    let bfHTML;
    if (bf != null) {
      const cls = St().bodyCompClass(sex, bmi, bf);
      bfHTML = `
        <div class="comp-tile">
          <div class="comp-val"><b>${Number(bf.toFixed(1))}%</b><span>Est. body fat <button type="button" class="info-btn" data-comp-info="bf" aria-label="About body-fat ranges">${ICONS.info}</button></span></div>
          <div class="bmi-cat ${cls.cls}">${esc(cls.label)}</div>
          <p class="comp-note">${esc(cls.note)}</p>
        </div>`;
    } else {
      bfHTML = `
        <div class="comp-tile comp-missing">
          <div class="comp-val"><span>Est. body fat</span></div>
          <p>Add <b>${missing.join("</b> + <b>")}</b> to estimate body fat %.</p>
        </div>`;
    }
    el.innerHTML = `
      <div class="card data-card comp-card">
        <div class="card-title"><h3>Body composition</h3><span class="sub">from your latest measurements</span></div>
        <div class="comp-grid">
          <div class="comp-tile">
            <div class="comp-val"><b>${Number(bmi.toFixed(1))}</b><span>Current BMI <button type="button" class="info-btn" data-comp-info="bmi" aria-label="About BMI ranges">${ICONS.info}</button></span></div>
            <div class="bmi-cat ${bCat.cls}">${esc(bCat.label)}</div>
            <p class="comp-note">${wTxt ? "Latest weight: " + wTxt : "Based on your latest Height & Weight records."}</p>
          </div>
          ${bfHTML}
        </div>
      </div>`;
    bindCompInfoButtons(el, () => ({ sex, bmi }));
  }

  function renderProgress() {
    const all = Store().measurements;
    const profile = Store().settings;
    const types = existingMeasTypes();
    // Reactive: re-runs from the single source of truth (Store.measurements)
    // on every render, which Store.onChange triggers after each add/update/
    // delete. `now` is injected so midnight rollover refreshes the recent
    // window and the Jan-31 projection horizon on next render.
    const engine = Focus.ProgressEngine.analyze(all, profile, {
      weightUnit: profile.weightUnit || "lb",
      goalWeight: profile.goals && profile.goals.weight != null ? profile.goals.weight : null,
      goalWeightUnit: profile.goals && profile.goals.goalWeightUnit || profile.weightUnit || "lb",
      now: St().todayISO()
    });
    if (!state.progType || !types.includes(state.progType)) state.progType = types.includes("Weight") ? "Weight" : types[0] || null;

    document.getElementById("progressHead").innerHTML = `
      <div class="chip-row" role="tablist" aria-label="Measurement type">
        ${types.map((t) => `<button class="chip ${state.progType === t ? "is-active" : ""}" role="tab" aria-selected="${state.progType === t}" data-action="prog-type" data-type="${esc(t)}">${esc(t)}</button>`).join("")}
        ${types.length === 0 ? '<span style="color:var(--text-faint);font-size:13px">No measurements yet</span>' : ""}
      </div>
      <button class="btn btn-primary" data-action="add-measurement">${ICONS.plus} Add measurement</button>`;

    renderProgressComposition(engine.composition);
    if (!state.progType) {
      document.getElementById("progressChartCard").innerHTML = "";
      document.getElementById("progressStatsCard").innerHTML = "";
      document.getElementById("progressTable").innerHTML = `
        <div class="empty-state card">
          <div class="es-icon">${ICONS.scale}</div>
          <h3>Track your body measurements</h3>
          <p>Add weight, waist, or other measurements to begin your journey.</p>
          <button class="btn btn-primary" data-action="add-measurement">${ICONS.plus} Add first measurement</button>
        </div>`;
      return;
    }

    const analysis = state.progType === "Weight" ? engine.weight : state.progType === "Waist" ? engine.waist : Focus.ProgressEngine.analyzeMetric(all, state.progType);
    const statsCard = document.getElementById("progressStatsCard");
    renderProgressChart(analysis);
    if (!analysis.count) {
      statsCard.innerHTML = `<div class="card"><div class="chart-empty">No ${esc(state.progType.toLowerCase())} records yet. Add a measurement to start tracking.</div></div>`;
      document.getElementById("progressTable").innerHTML = "";
      return;
    }

    const unit = analysis.unit || "";
    const fmt = (v, dp = 1) => v == null ? "—" : `${St().fmtNum(v, dp)}${unit ? " " + esc(unit) : ""}`;
    const changeVerb = analysis.change < 0 ? "loss" : analysis.change > 0 ? "gain" : "no net change";
    const headline = analysis.count > 1
      ? `You started at <b>${fmt(analysis.first.value)}</b> on ${esc(St().prettyDate(analysis.first.date))} and are now <b>${fmt(analysis.latest.value)}</b>. That’s a ${changeVerb} of <b>${fmt(Math.abs(analysis.change))}</b>${analysis.pctChange == null ? "" : ` (${St().fmtNum(Math.abs(analysis.pctChange), 1)}%)`} over ${analysis.spanMonths >= 1 ? `${St().fmtNum(analysis.spanMonths, 1)} months` : `${St().fmtNum(analysis.spanDays, 0)} days`}.`
      : `Your first ${esc(state.progType.toLowerCase())} reading is <b>${fmt(analysis.first.value)}</b> from ${esc(St().prettyDate(analysis.first.date))}.`;
    const trendLabel = analysis.trend === "stable" ? "holding steady" : analysis.trend === "down" ? "moving down" : "moving up";
    const past = analysis.insights.past.map((x) => `<li>${esc(x)}</li>`).join("");
    const present = analysis.insights.present.map((x) => `<li>${esc(x)}</li>`).join("");
    const future = analysis.insights.future.map((x) => `<li>${esc(x)}</li>`).join("");
    const previousValue = analysis.lastChange == null ? "No previous reading" : `${analysis.lastChange > 0 ? "+" : ""}${fmt(analysis.lastChange)} since ${esc(St().prettyDate(analysis.lastChangeDate))}`;
    const projectionValue = analysis.projections.threeMonths == null ? "More readings needed" : `${fmt(analysis.projections.threeMonths)} in 3 months`;
    const milestoneValue = analysis.projections.endOfYear == null ? null
      : `${fmt(analysis.projections.endOfYear)} by Dec 31 · ${fmt(analysis.projections.endOfNextJanuary)} by Jan 31`;
    const targetValue = state.progType === "Weight" && analysis.goalETA && profile.goals && profile.goals.weight != null
      ? St().convertTo(profile.goals.weight, profile.goals.goalWeightUnit || profile.weightUnit || "lb", unit) : null;
    const targetDate = targetValue == null ? null : `${fmt(targetValue)} by ${esc(analysis.goalETA.label)}`;

    statsCard.innerHTML = `
      <div class="progress-story">
      <div class="card progress-journey">
        <div class="card-title"><h3>Your ${esc(state.progType)} Journey</h3><span class="sub">${analysis.count} reading${analysis.count === 1 ? "" : "s"} · ${esc(St().prettyDate(analysis.first.date))} → ${esc(St().prettyDate(analysis.latest.date))}</span></div>
        <p class="progress-narrative">${headline}${targetDate ? `<span class="journey-target">Goal forecast: ${targetDate}</span>` : ""}</p>
        <div class="progress-key-stats">
          <div class="stat-mini"><div class="l">Average</div><div class="v">${fmt(analysis.average)}</div></div>
          <div class="stat-mini"><div class="l">Last</div><div class="v">${fmt(analysis.latest.value)} <small>${esc(St().shortDate(analysis.latest.date))}</small></div></div>
          <div class="stat-mini"><div class="l">Lowest</div><div class="v">${fmt(analysis.lowest.value)} <small>${esc(St().shortDate(analysis.lowest.date))}</small></div></div>
          <div class="stat-mini"><div class="l">Highest</div><div class="v">${fmt(analysis.highest.value)} <small>${esc(St().shortDate(analysis.highest.date))}</small></div></div>
          <div class="stat-mini"><div class="l">Total change</div><div class="v">${analysis.change > 0 ? "+" : ""}${fmt(analysis.change)}${analysis.pctChange == null ? "" : ` <small>${analysis.pctChange > 0 ? "+" : ""}${St().fmtNum(analysis.pctChange, 1)}%</small>`}</div></div>
        </div>
        <div class="journey-sections">
          <section class="journey-section" aria-label="Trend">
            <h5 class="journey-section-title">Trend</h5>
            <div class="journey-trend ${analysis.trend === "stable" ? "neutral" : analysis.trend === "down" ? "good-down" : "bad-up"}">
              <div><b>${trendLabel}</b><span>${analysis.ratePerMonth == null ? "Rate available with more history" : `${analysis.ratePerMonth > 0 ? "+" : ""}${St().fmtNum(analysis.ratePerMonth, 2)} ${esc(unit)}/month · fit ${analysis.r2 == null ? "—" : St().fmtNum(analysis.r2 * 100, 0) + "%"}`}</span></div>
              <div><b>${esc(previousValue)}</b><span>last change</span></div>
            </div>
          </section>
          <section class="journey-section" aria-label="Projection">
            <h5 class="journey-section-title">Projection</h5>
            <div class="journey-forecast">
              <div><b>${esc(projectionValue)}</b><span>linear trend estimate</span></div>
              ${milestoneValue ? `<div><b>${esc(milestoneValue)}</b><span>year-end + Jan projection</span></div>` : ""}
            </div>
          </section>
        </div>
        ${analysis.recommendation ? `<p class="progress-recommendation">${esc(analysis.recommendation)}</p>` : ""}
      </div>
      <div class="card progress-insights">
        <div class="card-title"><h3>Insights</h3><span class="sub">A reading of your trend — not a diagnosis</span></div>
        <div class="insight-groups">
          <section><h4>How you did</h4><ul>${past}</ul></section>
          <section><h4>How you’re doing</h4><ul>${present || "<li>More readings will reveal your current pace.</li>"}</ul></section>
          <section><h4>How you’ll do</h4><ul>${future}</ul></section>
        </div>
      </div>
      </div>`;

    renderProgressTable(analysis);
  }

  function renderProgressChart(analysis) {
    const card = document.getElementById("progressChartCard");
    const title = `${esc(analysis.type)} over time`;
    const year = Focus.App.year();
    const months = Array.from({ length: 13 }, (_, index) => ({
      year: year + Math.floor(index / 12), month: index % 12 + 1,
      date: new Date(year + Math.floor(index / 12), index % 12, 1, 12)
    }));
    const monthLabel = (point) => point.date.toLocaleDateString(undefined, { month: "short" });
    card.innerHTML = `<div class="card"><div class="card-title"><h3>${title}</h3><span class="sub">${analysis.count} readings${analysis.count > 1 ? " · recent-weighted trend + projection through Jan" : ""}</span></div><div class="chart-wrap" id="progChart"></div><div class="progress-chart-legend"><span><i class="actual"></i>Reading</span>${analysis.count > 1 ? '<span><i class="fit"></i>Trend</span><span><i class="forecast"></i>Projection</span>' : ""}</div></div>`;
    const plot = document.getElementById("progChart");
    if (!analysis.count) { plot.innerHTML = `<div class="chart-empty">Add a ${esc(analysis.type.toLowerCase())} reading to start your trend.</div>`; return; }
    const rangeStart = `${year}-01-01`;
    const rangeEnd = `${year + 1}-02-01`;
    const inRange = (iso) => iso >= rangeStart && iso < rangeEnd;
    const records = analysis.records.filter((r) => inRange(r.date));
    const futureProjections = (analysis.projectionLine || []).filter((p) => inRange(p.date) && p.date > analysis.latest.date);
    const trendByDate = new Map((analysis.trendLine || []).map((point) => [point.date, point.trend]));
    const points = [
      ...records.map((record) => ({ date: record.date, actual: record.value, trend: trendByDate.get(record.date) ?? null, projection: null })),
      ...futureProjections.map((point) => ({ date: point.date, actual: null, trend: null, projection: point.value }))
    ].sort((a, b) => a.date.localeCompare(b.date) || (a.actual == null ? 1 : -1));
    const chartPosition = (iso) => {
      const d = new Date(iso + "T12:00:00");
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return (d.getFullYear() - year) * 12 + d.getMonth() + (d.getDate() - 1) / daysInMonth;
    };
    if (!points.some((point) => point.actual != null)) {
      plot.innerHTML = `<div class="chart-empty">No ${esc(analysis.type.toLowerCase())} readings in ${year} or January ${year + 1}.</div>`;
      return;
    }
    const hasTrend = analysis.count > 1;
    const chartLabels = points.map((point) => St().prettyDate(point.date));
    const series = [
      { name: "Reading", values: points.map((point) => point.actual), color: "var(--accent)" },
      ...(hasTrend ? [
        { name: "Trend", values: points.map((point) => point.trend), color: "var(--success)" },
        { name: "Projection", values: points.map((point) => point.projection), color: "var(--warn)" }
      ] : [])
    ];
    const currentISO = St().todayISO();
    const currentDate = new Date(currentISO + "T12:00:00");
    const currentX = (currentDate.getFullYear() - year) * 12 + currentDate.getMonth() + (currentDate.getDate() - 1) / new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const xTicks = months.map((month, index) => ({
      value: index,
      label: index === 0 || index === 12 ? `${monthLabel(month)} ’${String(month.year).slice(-2)}` : monthLabel(month)
    }));
    const plottedValues = points.flatMap((point) => [point.actual, point.trend, point.projection]).filter(Number.isFinite);
    C().lineChart(plot, chartLabels, series, {
      height: 235, area: false, fillId: "progress-" + analysis.type.replace(/\W/g, ""),
      xValues: points.map((point) => chartPosition(point.date)), xDomain: [0, 12], xTicks,
      valueFmt: (v) => St().fmtNum(v, 1) + (analysis.unit ? " " + esc(analysis.unit) : ""),
      dashedSeries: hasTrend ? [2] : [], currentX: currentX >= 0 && currentX <= 12 ? currentX : null,
      yMin: plottedValues.length ? Math.min(...plottedValues) * 0.98 : undefined
    });
  }

  function renderProgressComposition(composition) {
    const el = document.getElementById("progressCompCard");
    if (!el) return;
    if (composition.bmi == null && composition.bodyFat == null) {
      el.innerHTML = `<div class="card data-card comp-card"><div class="card-title"><h3>Body composition</h3><span class="sub">Estimates from your profile and measurements</span></div><p class="chart-empty">${esc(composition.interpretation)}</p></div>`;
      return;
    }
    const meter = (value, max, color) => `<div class="composition-meter" role="meter" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"><span style="width:${Math.max(0, Math.min(100, value / max * 100))}%;background:${color}"></span></div>`;
    const bmi = composition.bmi == null ? `<div class="comp-tile comp-missing"><b>BMI</b><p>Height and weight are needed.</p></div>` : `<div class="comp-tile composition-metric"><div class="comp-val"><b>${St().fmtNum(composition.bmi, 1)}</b><span>BMI <button type="button" class="info-btn" data-comp-info="bmi" aria-label="About BMI ranges">${ICONS.info}</button></span></div><div class="bmi-cat ${esc(composition.bmiCategory.cls)}">${esc(composition.bmiCategory.label)}</div>${meter(composition.bmi, 40, "var(--accent)")}</div>`;
    const bf = composition.bodyFat == null ? `<div class="comp-tile comp-missing"><b>Estimated body fat</b><p>Add Neck + Waist${profileSex() === "female" ? " + Hips" : ""} measurements/profile values.</p></div>` : `<div class="comp-tile composition-metric"><div class="comp-val"><b>${St().fmtNum(composition.bodyFat, 1)}%</b><span>U.S. Navy estimate <button type="button" class="info-btn" data-comp-info="bf" aria-label="About body-fat ranges">${ICONS.info}</button></span></div><div class="bmi-cat ${esc(composition.bodyFatCategory.cls)}">${esc(composition.bodyFatCategory.label)}</div>${meter(composition.bodyFat, 50, "var(--success)")}</div>`;
    const massInfo = (key, label, value) => `<div class="stat-mini"><div class="l">${label} <button type="button" class="info-btn" data-comp-info="${key}" aria-label="About ${label.toLowerCase()} ranges">${ICONS.info}</button></div><div class="v">${St().fmtNum(value, 1)} <small>${esc(composition.massUnit)}</small></div></div>`;
    const mass = composition.leanMass == null ? "" : `${massInfo("lean", "Lean mass", composition.leanMass)}${massInfo("fat", "Fat mass", composition.fatMass)}`;
    const waistRatio = composition.waistHeightRatio == null ? "" : `<div class="stat-mini"><div class="l">Waist / height <button type="button" class="info-btn" data-comp-info="waist" aria-label="About waist-to-height ranges">${ICONS.info}</button></div><div class="v">${St().fmtNum(composition.waistHeightRatio, 2)} <small>${composition.waistHeightRatio < 0.5 ? "below 0.5" : "0.5 or higher"}</small></div></div>`;
    el.innerHTML = `<div class="card data-card comp-card"><div class="card-title"><h3>Body composition</h3><span class="sub">Latest valid measurements · estimates only</span></div><div class="comp-grid">${bmi}${bf}</div><div class="composition-extras">${mass}${waistRatio}</div><p class="comp-note">${esc(composition.interpretation)}</p></div>`;
    bindCompInfoButtons(el, () => ({ sex: profileSex(), bmi: composition.bmi, composition }));
  }

  function profileSex() { return Store().settings.sex === "female" ? "female" : "male"; }

  function challengeFormHTML(challenge = {}) {
    const now = new Date();
    const kind = Store().challengeKindOf(challenge);
    const special = kind === "special";
    const year = challenge.year || now.getFullYear();
    const month = challenge.month || now.getMonth() + 1;
    return `<h2>${challenge.id ? "Edit" : "Add"} challenge</h2>
      <p class="modal-sub">Track a challenge from Apple Watch or set your own target — monthly goals or a one-off special edition.</p>
      <form id="challengeForm">
        <div class="field"><label for="challengeKind">Challenge type</label><select class="select" id="challengeKind">
          <option value="monthly" ${special ? "" : "selected"}>Monthly challenge</option>
          <option value="special" ${special ? "selected" : ""}>Special edition (limited)</option>
        </select><small class="field-hint" id="challengeKindHint">${special ? "A named one-off challenge — badges show a ★ and the month it ran in." : "One goal per month, labelled with the month (January, February, …)."}</small></div>
        <div class="field" id="challengeNameField" ${special ? "" : "hidden"}><label for="challengeName">Challenge name *</label><input class="input" id="challengeName" type="text" maxlength="120" value="${esc(challenge.name || "")}" placeholder="e.g. World Mental Health Day" ${special ? "required" : ""}><small class="field-hint">e.g. World Mental Health Day, New Year Kick-off</small></div>
        <div class="form-grid">
          <div class="field"><label for="challengeMonth">Month</label><select class="select" id="challengeMonth">${St().MONTHS_LONG.map((name, index) => `<option value="${index + 1}" ${month === index + 1 ? "selected" : ""}>${name}</option>`).join("")}</select></div>
          <div class="field"><label for="challengeYear">Year</label><input class="input" id="challengeYear" type="number" min="1900" max="9999" step="1" value="${year}" required></div>
        </div>
        <div class="field"><label for="challengeDescription">Challenge description *</label><textarea class="textarea" id="challengeDescription" maxlength="500" rows="3" required placeholder="e.g. Close all rings 30 times">${esc(challenge.description || "")}</textarea></div>
        <label class="challenge-complete-toggle" for="challengeCompleted">
          <input id="challengeCompleted" class="challenge-checkbox" type="checkbox" ${challenge.completed ? "checked" : ""} aria-controls="challengeCompletionField">
          <span class="challenge-checkbox-mark" aria-hidden="true">${ICONS.check}</span>
          <span class="challenge-toggle-copy"><b>Mark as complete</b><small>Record when you earned this challenge.</small></span>
        </label>
        <div class="field challenge-completion-field" id="challengeCompletionField" ${challenge.completed ? "" : "hidden"}>
          <label for="challengeCompletionDate">Completion date</label>
          <input class="input" id="challengeCompletionDate" type="date" value="${esc(challenge.completionDate || St().suggestedCompletionDate(month, year, St().todayISO()))}" ${challenge.completed ? "required" : ""}>
          <small class="field-hint" id="challengeDateHint">Defaults into the challenge’s own month — pick the exact day you earned it.</small>
        </div>
        <p class="form-error" id="challengeError" hidden></p>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">${challenge.id ? "Save challenge" : "Add challenge"}</button></div>
      </form>`;
  }

  function openChallengeForm(challenge = {}) {
    openModal(challengeFormHTML(challenge), {
      onOpen: (modal) => {
        const checkbox = modal.querySelector("#challengeCompleted");
        const field = modal.querySelector("#challengeCompletionField");
        const date = modal.querySelector("#challengeCompletionDate");
        // The completion date defaults into the challenge's own month and year, so
        // logging an old (or long-running) challenge doesn't start at today. A date
        // the user typed — or one that was already stored — is never overwritten.
        const monthSelect = modal.querySelector("#challengeMonth");
        const yearInput = modal.querySelector("#challengeYear");
        const dateHint = modal.querySelector("#challengeDateHint");
        let autoDate = !challenge.completionDate;
        const suggestedDate = () => St().suggestedCompletionDate(Number(monthSelect.value), Number(yearInput.value), St().todayISO());
        const applySuggestedDate = () => {
          const month = Number(monthSelect.value), year = Number(yearInput.value);
          dateHint.textContent = Number.isInteger(month) && month >= 1 && month <= 12
            ? `Defaults into ${St().MONTHS_LONG[month - 1]} ${yearInput.value} — pick the exact day you earned it.`
            : "Pick the exact day you earned this challenge.";
          if (autoDate) date.value = suggestedDate();
        };
        const syncCompletionField = () => {
          field.hidden = !checkbox.checked;
          date.required = checkbox.checked;
          if (checkbox.checked) syncChallengeCompletion();
        };
        const syncChallengeCompletion = () => {
          autoDate = true;
          applySuggestedDate();
        };
        const reapplySuggestedDate = () => {
          const month = Number(monthSelect.value), year = Number(yearInput.value);
          dateHint.textContent = Number.isInteger(month) && month >= 1 && month <= 12
            ? `Defaults into ${St().MONTHS_LONG[month - 1]} ${yearInput.value} — pick the exact day you earned it.`
            : "Pick the exact day you earned this challenge.";
          if (autoDate) date.value = suggestedDate();
        };
        date.addEventListener("input", () => { autoDate = false; });
        monthSelect.addEventListener("change", reapplySuggestedDate);
        yearInput.addEventListener("input", reapplySuggestedDate);
        checkbox.addEventListener("change", syncCompletionField);
        syncCompletionField();

        // Selecting "special edition" reveals the name field (and its caret/jump
        // target stays stable because the month/year row never moves).
        const kindSelect = modal.querySelector("#challengeKind");
        const nameField = modal.querySelector("#challengeNameField");
        const nameInput = modal.querySelector("#challengeName");
        const kindHint = modal.querySelector("#challengeKindHint");
        const syncKindField = () => {
          const special = kindSelect.value === "special";
          nameField.hidden = !special;
          nameInput.required = special;
          kindHint.textContent = special
            ? "A named one-off challenge — badges show a ★ and the month it ran in."
            : "One goal per month, labelled with the month (January, February, …).";
        };
        kindSelect.addEventListener("change", syncKindField);
        syncKindField();
      },
      onSubmit: async (form, { close }) => {
        const kind = form.querySelector("#challengeKind").value === "special" ? "special" : "monthly";
        const name = form.querySelector("#challengeName").value.trim();
        const description = form.querySelector("#challengeDescription").value.trim();
        const month = Number(form.querySelector("#challengeMonth").value);
        const year = Number(form.querySelector("#challengeYear").value);
        const completed = form.querySelector("#challengeCompleted").checked;
        const completionDateInput = form.querySelector("#challengeCompletionDate");
        const fail = (message) => {
          const error = form.querySelector("#challengeError");
          error.textContent = message;
          error.hidden = false;
        };
        if (kind === "special" && (!name || name.length > 120)) {
          fail("Give the special challenge a name (1–120 characters).");
          return;
        }
        if (!description || description.length > 500) {
          fail("Enter a challenge description of 1–500 characters.");
          return;
        }
        if (!Number.isInteger(month) || month < 1 || month > 12) {
          fail("Choose a month from January to December.");
          return;
        }
        if (!Number.isInteger(year) || year < 1900 || year > 9999) {
          fail("Enter a year from 1900 to 9999.");
          return;
        }
        if (completed && (!completionDateInput || !St().validISODate(completionDateInput.value))) {
          fail("Choose a valid completion date.");
          return;
        }
        try {
          const payload = { kind, name, month, year, description, completed, completionDate: completed ? (completionDateInput && completionDateInput.value || St().todayISO()) : null };
          if (challenge.id) await Store().updateChallenge(challenge.id, payload);
          else await Store().addChallenge(payload);
          close();
          if (Focus.App.currentView === "challenges") renderChallenges();
          else if (Focus.App.currentView === "dashboard") renderDashboard();
          else if (Focus.App.currentView === "food") renderFood();
          else if (Focus.App.currentView === "calendar") renderCalendar();
          else if (Focus.App.currentView === "analytics") renderAnalytics();
          else if (Focus.App.currentView === "settings") renderSettings();
          toast(challenge.id ? "Challenge updated" : kind === "special" ? "Special challenge added ★" : "Challenge added 🏆");
        } catch (error) {
          fail(error.message);
        }
      }
    });
  }

  /**
   * Mark a challenge complete (or back to in progress). Completing stamps the same
   * default the form offers — a day inside the challenge's own month, so ticking off
   * an old goal from the list doesn't record today as the completion date.
   */
  function toggleChallengeComplete(challenge) {
    // updateChallenge() mutates the same record, so read the current state first —
    // otherwise the toast reports the direction backwards.
    const wasCompleted = challenge.completed === true;
    const completedOn = wasCompleted
      ? null
      : St().suggestedCompletionDate(challenge.month, challenge.year, St().todayISO());
    return Store().updateChallenge(challenge.id, { completed: !wasCompleted, completionDate: completedOn })
      .then(() => { toast(wasCompleted ? "Challenge marked in progress" : "Challenge complete! Badge earned 🏆"); });
  }

  /* =====================================================================
   * FOOD — dedicated first-class section (single source: Focus.Food)
   * ---------------------------------------------------------------------
   * Overview answers: how am I doing overall / recently / streak / changed.
   * Today's status is one tap, reversible, keyboard accessible. History is a
   * year calendar with three visually distinct states. Insights come only
   * from real data (data-sufficiency aware, never invented).
   * =================================================================== */
  function foodStatusMeta(status) {
    return status === "none"
      ? { label: "No junk food", cls: "is-avoided", dot: "var(--success)", emoji: "🥗" }
      : status === "some"
        ? { label: "Some junk food", cls: "is-partial", dot: "var(--warn)", emoji: "⚠️" }
        : status === "full"
          ? { label: "Junk-food day", cls: "is-junk", dot: "var(--danger)", emoji: "🍔" }
          : { label: "Not logged", cls: "is-unlogged", dot: "var(--text-faint)", emoji: "○" };
  }

  function renderFood() {
    const body = document.getElementById("foodBody");
    if (!body) return;
    const year = Focus.App.year();
    const today = St().todayISO();
    const log = Store().settings.noJunkFoodLog || {};
    const goals = Store().settings.goals || {};
    if (goals.avoidJunkFood === false) {
      body.innerHTML = `<div class="card data-card"><div class="empty-state"><div class="es-icon">🥗</div><h3>Food tracking is off</h3><p>The “Don't eat junk food” goal is switched off in Settings. Nothing was deleted — turn it back on to keep tracking.</p><button type="button" class="btn btn-primary" data-action="toggle-food-goal">Turn food tracking on</button></div></div>`;
      return;
    }
    let ov = null, wk = null, mo = null, yr = null, ins = [];
    try {
      ov = F().overview(log, today);
      wk = F().weekStats(log, today);
      mo = F().monthStats(log, Number(today.slice(0, 4)), Number(today.slice(5, 7)), today);
      yr = F().yearStats(log, year, today);
      ins = F().insights(log, today, year);
    } catch (e) { ov = null; }
    if (!ov) { body.innerHTML = `<div class="card"><p>Food data unavailable.</p></div>`; return; }
    const todayMeta = foodStatusMeta(ov.todayStatus);
    const hero = ov.todayStatus === "none"
      ? { emoji: "🥗", title: "Didn't eat junk food", sub: "Clean day — your streak grows." }
      : ov.todayStatus === "some"
        ? { emoji: "🍜", title: "Ate some junk food", sub: "A little slipped in — tomorrow is fresh." }
        : ov.todayStatus === "full"
          ? { emoji: "🍔", title: "Ate junk food", sub: "Junk-food day logged — tomorrow is fresh." }
          : { emoji: "○", title: "Not logged yet", sub: "Pick one below — it takes a second." };
    const segBtn = (status, main, sub, emoji) => {
      const active = ov.todayStatus === status;
      const legacy = status === "none" ? "true" : status === "some" ? "some" : "false";
      return `<button type="button" class="seg-btn food-seg-btn${active ? " is-active" : ""}" data-action="food-log" data-date="${today}" data-status="${legacy}" aria-pressed="${active}" aria-label="${main} — ${sub}"><span class="food-seg-emoji" aria-hidden="true">${emoji}</span><span class="food-seg-main">${main}</span><span class="food-seg-sub">${sub}</span></button>`;
    };
    const monthRate = mo.avoidanceRate == null ? "—" : Math.round(mo.avoidanceRate * 100) + "%";
    const weekLabel = `${wk.noneDays} / ${wk.elapsedDays} junk-free days`;
    const monthLabel = `${mo.noneDays} / ${mo.elapsedDays} junk-free days`;
    const yearLabel = `${yr.noneDays} / ${yr.elapsedDays} junk-free days`;
    const insightHTML = ins.length
      ? `<ul class="insights-list" aria-label="Food insights">${ins.map((i) => `<li><span class="insight-tone tone-${i.tone}" aria-hidden="true">●</span> ${i.text}</li>`).join("")}</ul>`
      : (ov.hasData
        ? `<p class="food-habit-note">Keep tracking to unlock trends and comparisons.</p>`
        : `<p class="food-habit-note">Your patterns will appear here once you log a few days.</p>`);
    // Recent 14-day strip (display only; logging stays in the hero + calendar).
    const wdLetters = ["M", "T", "W", "T", "F", "S", "S"];
    let strip = "";
    for (let i = 13; i >= 0; i--) {
      const iso = St().addDays(today, -i);
      const st = F().getStatus(log, iso);
      const meta = foodStatusMeta(st);
      const glyph = st === "none" ? "●" : st === "some" ? "◐" : st === "full" ? "●" : "○";
      const cls = st === "none" ? "fh-none" : st === "some" ? "fh-some" : st === "full" ? "fh-full" : "fh-unknown";
      const wd = wdLetters[(St().weekdayOf(iso) + 6) % 7];
      const isToday = iso === today;
      strip += `<div class="food-strip-day ${cls}${isToday ? " is-today" : ""}" title="${iso}: ${meta.label}" aria-label="${iso}: ${meta.label}${isToday ? " (today)" : ""}"><span class="food-strip-wd" aria-hidden="true">${wd}</span><span class="food-strip-num" aria-hidden="true">${Number(iso.slice(8, 10))}</span><span class="food-strip-dot" aria-hidden="true">${glyph}</span></div>`;
    }
    // History: compact year calendar (three states, shape + color, not color alone).
    const histMonths = yr.months.map((m) => {
      const cells = F().monthCells(log, year, m.month);
      const dots = cells.map((c) => {
        const meta = foodStatusMeta(c.status);
        const glyph = c.status === "none" ? "●" : c.status === "some" ? "◐" : c.status === "full" ? "●" : "○";
        const cls = c.status === "none" ? "fh-none" : c.status === "some" ? "fh-some" : c.status === "full" ? "fh-full" : "fh-unknown";
        return `<span class="fh-dot ${cls}" title="${c.iso}: ${meta.label}" aria-label="${c.iso}: ${meta.label}" role="img">${glyph}</span>`;
      }).join("");
      return `<div class="food-hist-month"><b>${m.label}</b><div class="food-hist-dots">${dots}</div><small>${m.loggedDays ? `${m.noneDays}✓ · ${m.someDays}◐ · ${m.fullDays}✗` : "no logs"}</small></div>`;
    }).join("");
    const trendPill = ov.direction === "improving" ? "up" : ov.direction === "worsening" ? "down" : "flat";
    const emptyIntro = !ov.hasData ? `
      <div class="card food-intro"><div class="empty-state"><div class="es-icon">🍜</div><h3>Start tracking your food habits</h3><p>Log whether you ate no, some, or a lot of junk food each day. Streaks, trends and insights unlock as you go — unlogged days always stay unknown.</p></div></div>` : "";
    body.innerHTML = `<div class="food-page">
      <p class="food-eyebrow">Junk-food tracking · none, some, or full days — unlogged stays unknown</p>
      <section class="card food-hero ${todayMeta.cls}" aria-labelledby="foodTodayTitle">
        <div class="food-hero-top">
          <div><p class="food-kicker">Today · ${St().prettyDate(today)}</p>
          <h3 id="foodTodayTitle" class="food-hero-status"><span aria-hidden="true">${hero.emoji}</span> ${hero.title}</h3>
          <p class="desc">${hero.sub}</p></div>
          <span class="delta ${trendPill}" title="Recent vs yearly average">${ov.trend}</span>
        </div>
        <div class="seg food-seg" role="group" aria-label="Did you eat junk food today?">
          ${segBtn("none", "Didn't", "clean day", "🥗")}
          ${segBtn("some", "Some", "just a little", "🍜")}
          ${segBtn("full", "Yes", "full day", "🍔")}
        </div>
        ${ov.todayStatus !== null ? `<button type="button" class="btn btn-sm btn-ghost food-clear" data-action="food-log" data-date="${today}" data-status="clear">Clear today's log</button>` : ""}
      </section>
      ${emptyIntro}
      <section aria-label="Your progress">
        <div class="dash-stats food-overview-grid">
          <div class="card stat"><div class="stat-top"><span class="stat-label">🔥 Current streak</span></div><div class="food-big">${ov.currentStreak} day${ov.currentStreak === 1 ? "" : "s"}</div><small>without junk food</small></div>
          <div class="card stat"><div class="stat-top"><span class="stat-label">🏆 Longest streak</span></div><div class="food-big">${ov.longestStreak} day${ov.longestStreak === 1 ? "" : "s"}</div><small>best run${ov.currentJunkRun ? ` · junk run now: ${ov.currentJunkRun}d` : ""}</small></div>
          <div class="card stat"><div class="stat-top"><span class="stat-label">This month</span></div><div class="food-big">${monthRate}</div><small>junk-free (${mo.noneDays}/${mo.loggedDays || 0} logged)</small></div>
          <div class="card stat"><div class="stat-top"><span class="stat-label">Last 30 days</span></div><div class="food-big">${ov.last30.noneDays}/${ov.last30.elapsedDays}</div><small>junk-free days (${ov.last30.loggedDays} logged)</small></div>
        </div>
      </section>
      ${ov.hasData ? `
      <section class="card" aria-labelledby="foodRecentTitle">
        <div class="card-title"><div><h3 id="foodRecentTitle">Recent history</h3><p class="desc">Last 14 days — shapes differ, not just colors.</p></div></div>
        <div class="food-strip" role="list">${strip}</div>
      </section>
      <div class="grid-2">
        <section class="card" aria-labelledby="foodTrendsTitle">
          <div class="card-title"><div><h3 id="foodTrendsTitle">Trends</h3><p class="desc">Recent vs long-term — from logged days only.</p></div></div>
          <div class="type-bar-row"><div class="tbr-head"><span>📅 This week</span><span class="tbr-meta"><b>${weekLabel}</b></span></div></div>
          <div class="type-bar-row"><div class="tbr-head"><span>🗓️ This month</span><span class="tbr-meta"><b>${monthLabel}</b></span></div></div>
          <div class="type-bar-row"><div class="tbr-head"><span>📊 ${year}</span><span class="tbr-meta"><b>${yearLabel}</b></span></div></div>
          <p class="food-habit-note">Best month: <b>${ov.bestMonth ? ov.bestMonth.label + " (" + Math.round(ov.bestMonth.avoidanceRate * 100) + "%)" : "—"}</b>${ov.worstMonth && ov.bestMonth && ov.worstMonth.month !== ov.bestMonth.month ? ` · Toughest: <b>${ov.worstMonth.label} (${Math.round(ov.worstMonth.avoidanceRate * 100)}%)</b>` : ""}.${ov.enoughForTrends ? "" : " Keep tracking to unlock more comparisons."}</p>
        </section>
        <section class="card" aria-labelledby="foodInsightsTitle">
          <div class="card-title"><div><h3 id="foodInsightsTitle">Insights</h3><p class="desc">Generated from real data — never invented.</p></div></div>${insightHTML}
        </section>
      </div>
      <section class="card" style="margin-top:16px" aria-labelledby="foodHistoryTitle">
        <div class="card-title"><div><h3 id="foodHistoryTitle">History · ${year}</h3><p class="desc">● none · ◐ some · ● junk · ○ unlogged</p></div></div>
        <div class="food-hist-grid">${histMonths}</div>
      </section>` : `
      <section class="card" aria-labelledby="foodUnlockTitle">
        <div class="card-title"><div><h3 id="foodUnlockTitle">What you'll unlock</h3><p class="desc">Streaks, trends, insights and history appear here.</p></div></div>
        <p class="food-habit-note">Log a few days to see your current streak, recent history, and first patterns. One day is enough to start — trends arrive after a week or so.</p>
      </section>`}
    </div>`;
  }

  function renderChallenges() {
    const body = document.getElementById("challengesBody");
    if (body) body.innerHTML = challengesOn() ? renderChallengesSettings() : challengesOffHTML();
  }

  /** Shown on the Challenges view while the feature is switched off in Settings. */
  function challengesOffHTML() {
    return `<div class="card data-card challenge-management">
      <div class="empty-state">
        <div class="es-icon">🏆</div>
        <h3>Challenges are off</h3>
        <p>Monthly and special challenges, and their badges, stay out of your dashboard, calendar and analytics. Nothing was deleted — everything you logged is still here.</p>
        <button type="button" class="btn btn-primary" data-action="set-challenges" data-set-challenges="on">Turn challenges back on</button>
      </div>
    </div>`;
  }

  /** One challenge row (month dot, label, meta, actions). */
  function challengeItemHTML(challenge) {
    const special = isSpecialChallenge(challenge);
    const monthName = St().MONTHS_LONG[challenge.month - 1];
    const status = challenge.completed
      ? `Completed${challenge.completionDate ? " " + esc(St().prettyDate(challenge.completionDate)) : ""}`
      : "In progress";
    const headline = special ? esc(challenge.name) : esc(challenge.description);
    // A special edition leads with its name and keeps the description as detail;
    // monthly challenges already lead with the description.
    const meta = special
      ? `${monthName} ${challenge.year} · ${esc(challenge.description)} · ${status}`
      : `${monthName} ${challenge.year} · ${status}`;
    return `<article class="challenge-item${special ? " is-special" : ""}">
      <div class="challenge-item-main"><span class="challenge-month-dot" style="--badge-color:${challengeColor(challenge.month)}" aria-hidden="true">${special ? "★" : challenge.month}</span><div><b>${headline}</b>${special ? '<em class="challenge-kind-tag">Special edition</em>' : ""}<small>${meta}</small></div></div>
      <div class="challenge-item-actions">
        <button type="button" class="btn btn-sm ${challenge.completed ? "challenge-complete is-complete" : "btn-ghost"}" data-action="toggle-challenge-complete" data-id="${esc(challenge.id)}" aria-pressed="${challenge.completed}">${challenge.completed ? "✓ Completed" : "Mark complete"}</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="edit-challenge" data-id="${esc(challenge.id)}">Edit</button>
        <button type="button" class="btn btn-sm btn-danger" data-action="delete-challenge" data-id="${esc(challenge.id)}">Remove</button>
      </div>
    </article>`;
  }

  /** A year group is open by default only for the selected year; a hand toggle
   *  in state.challengeYearOpen wins over the default so re-renders keep it. */
  function isChallengeYearOpen(year) {
    const key = String(year);
    if (key in state.challengeYearOpen) return !!state.challengeYearOpen[key];
    return Number(key) === Focus.App.year();
  }

  /** Flip one year group open/closed and repaint the Challenges view. */
  function toggleChallengeYear(year) {
    const key = String(year);
    state.challengeYearOpen[key] = !isChallengeYearOpen(key);
    renderChallenges();
  }

  /** Year sub-groups inside one kind section (newest year first). Only the
   *  selected year's group starts expanded; the rest collapse to a header
   *  with a completion count until opened. `prefix` keeps element ids unique
   *  when monthly and special sections share a year. */
  function challengeYearGroupsHTML(challenges, prefix) {
    const groups = new Map();
    challenges.forEach((challenge) => {
      const key = String(challenge.year);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(challenge);
    });
    return [...groups.entries()].sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, list]) => {
      const open = isChallengeYearOpen(year);
      const done = list.filter((challenge) => challenge.completed).length;
      const gid = `challenge-year-${prefix || "y"}-${esc(year)}`;
      return `
      <section class="challenge-year-group${open ? " is-open" : ""}">
        <button type="button" class="challenge-year-head" data-action="toggle-challenge-year" data-year="${esc(year)}" aria-expanded="${open}" aria-controls="${gid}">
          <span class="challenge-year-title">${year}</span>
          <span class="challenge-year-meta">${done}/${list.length} complete</span>
          <span class="challenge-chevron" aria-hidden="true">⌄</span>
        </button>
        <div class="challenge-list" id="${gid}"${open ? "" : " hidden"}>${list.map(challengeItemHTML).join("")}</div>
      </section>`;
    }).join("");
  }

  function renderChallengesSettings() {
    const all = Store().challenges;
    const monthly = all.filter((challenge) => !isSpecialChallenge(challenge));
    const special = all.filter(isSpecialChallenge);
    // Grouped by kind: the monthly goals section is always there (it is the
    // default type), while special editions only appear once one exists.
    const monthlySection = `<section class="challenge-kind-group" data-challenge-kind="monthly"><div class="challenge-kind-head"><h3>Monthly challenges</h3><span>One goal per month — badges show the month and year.</span></div>${monthly.length ? challengeYearGroupsHTML(monthly, "m") : '<p class="challenge-kind-empty">No monthly challenges yet. Every month you complete earns a badge.</p>'}</section>`;
    const specialSection = special.length
      ? `<section class="challenge-kind-group is-special" data-challenge-kind="special"><div class="challenge-kind-head"><h3><span aria-hidden="true">★</span> Special editions</h3><span>Limited-edition challenges you name yourself — badges show a ★ and the month they ran in.</span></div>${challengeYearGroupsHTML(special, "s")}</section>`
      : "";
    return `<div class="card data-card challenge-management"><div class="card-title"><div><h3>Challenges</h3><p class="desc">Manage monthly goals and special editions, and celebrate each completed challenge.</p></div><button type="button" class="btn btn-primary" data-action="add-challenge">${ICONS.plus} Add challenge</button></div>
      ${all.length ? `${monthlySection}${specialSection}` : '<div class="empty-state"><div class="es-icon">🏆</div><h3>No challenges yet</h3><p>Add a monthly challenge to start collecting badges — or a special edition for a one-off day like World Mental Health Day.</p></div>'}</div>`;
  }

  function renderProgressTable(analysis) {
    const allRecs = analysis.records.slice().reverse();
    const recent = allRecs.slice(0, 2);
    const rowHTML = (r) => `<tr><td><b>${St().prettyDate(r.date)}</b></td><td><b>${St().fmtNum(r.value, 1)}</b> ${esc(r.unit)}</td><td style="color:var(--text-dim)">${r.notes ? esc(r.notes) : "—"}</td><td><div class="wk-actions"><button class="mini-btn" data-action="edit-measurement" data-id="${esc(r.id)}" aria-label="Edit ${esc(analysis.type)} from ${esc(r.date)}">${ICONS.pencil}</button><button class="mini-btn danger" data-action="delete-measurement" data-id="${esc(r.id)}" aria-label="Delete ${esc(analysis.type)} from ${esc(r.date)}">${ICONS.trash}</button></div></td></tr>`;
    document.getElementById("progressTable").innerHTML = `<div class="card"><div class="card-title"><h3>${esc(analysis.type)} records</h3><button class="btn btn-sm btn-ghost" data-action="view-all-measurements" data-type="${esc(analysis.type)}">${ICONS.eye} View all (${allRecs.length})</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Value</th><th>Notes</th><th style="width:110px"></th></tr></thead><tbody>${recent.map(rowHTML).join("")}</tbody></table></div>${allRecs.length > 2 ? `<p class="progress-table-note">Showing 2 of ${allRecs.length} readings. “View all” opens the full history.</p>` : ""}</div>`;
  }

  function renderLegacyProgress() {
    const all = Store().measurements;
    const types = existingMeasTypes();
    renderCompCard();
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
    // Headline highlight — one colored line that sums up the selected type.
    const headEmoji = stats.trend === "down" ? "📉" : stats.trend === "up" ? "📈" : "⚖️";
    const headText = stats.trend === "flat"
      ? "Stable — no real change overall"
      : trendGood
        ? `Great trend — ${St().fmtNum(Math.abs(stats.change), 1)} ${esc(stats.unit)} ${stats.trend} overall`
        : `Watch this — ${St().fmtNum(Math.abs(stats.change), 1)} ${esc(stats.unit)} ${stats.trend} overall`;
    const headCls = stats.trend === "flat" ? "neutral" : trendGood ? "ok" : "warn";
    const changeCls = stats.trend === "flat" ? "" : trendGood ? "down-good" : "up-bad";

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
        <div class="sum-headline ${headCls}">${headEmoji} ${headText}</div>
        <div class="stat-mini-grid">
          <div class="stat-mini"><div class="l">First</div><div class="v">${St().fmtNum(stats.first.value, 1)} <small>${esc(stats.unit)}</small></div></div>
          <div class="stat-mini"><div class="l">Latest</div><div class="v">${St().fmtNum(stats.latest.value, 1)} <small>${esc(stats.unit)}</small></div></div>
          <div class="stat-mini"><div class="l">Change</div><div class="v ${changeCls}">${St().fmtNum(stats.change, 1)} <small>${esc(stats.unit)}</small></div></div>
          <div class="stat-mini"><div class="l">% Change</div><div class="v ${changeCls}">${St().fmtNum(stats.pctChange, 1)}%</div></div>
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
    const curYear = new Date().getFullYear();
    // The comparison only offers years with actual workout data (never future or
    // empty years) and only appears once a second comparable year exists.
    const cmpYears = St().workoutYears(all);
    const hasCmp = cmpYears.length >= 2;
    if (hasCmp) {
      // Default comparison: the current year vs the previous year (when present),
      // otherwise the two most recent years with data.
      if (state.anaA == null || !cmpYears.includes(state.anaA)) state.anaA = cmpYears.includes(curYear) ? curYear : cmpYears[0];
      if (state.anaB == null || state.anaB === state.anaA || !cmpYears.includes(state.anaB)) {
        state.anaB = cmpYears.includes(curYear - 1) && curYear - 1 !== state.anaA ? curYear - 1 : cmpYears.find((y) => y !== state.anaA) || state.anaA;
      }
    }
    const a = state.anaA, b = state.anaB;
    const year = Focus.App.year();
    const ms = St().monthlyStats(all, year);
    const cmp = hasCmp ? St().compareYears(all, a, b) : null;

    document.getElementById("analyticsCompare").innerHTML = hasCmp ? `
      <span class="lbl">Compare</span>
      <select class="select" id="anaA" aria-label="Year A">
        ${cmpYears.map((y) => `<option value="${y}" ${y === a ? "selected" : ""}>${y}</option>`).join("")}
      </select>
      <span style="color:var(--text-faint)">vs</span>
      <select class="select" id="anaB" aria-label="Year B">
        ${cmpYears.map((y) => `<option value="${y}" ${y === b ? "selected" : ""}>${y}</option>`).join("")}
      </select>
      <span style="color:var(--text-dim);font-size:13px">
        ${a}: <strong>${cmp.totals.workouts.a}</strong> workouts · <strong>${St().fmtNum(cmp.totals.calories.a)}</strong> kcal
        &nbsp;·&nbsp; ${b}: <strong>${cmp.totals.workouts.b}</strong> workouts · <strong>${St().fmtNum(cmp.totals.calories.b)}</strong> kcal
      </span>` : "";

    const wrap = document.getElementById("analyticsCharts");
    const colorA = "var(--accent)", colorB = "var(--success)";
    // Future months of the current year are dimmed so charts don't end in a
    // wall of empty space — the eye reads only the months that have elapsed.
    // (null means "no dimming" — an empty array would dim everything.)
    const curYearNow = year === curYear;
    const hl = curYearNow ? ms.map((m, i) => i).filter((i) => i >= new Date().getMonth() + 1) : null;
    const tb = St().typeBreakdown(all, year);
    // Distinct workouts in the year — NOT the sum of breakdown counts, which
    // counts each type tag (a "Back, Biceps" workout counts twice).
    const tbWorkouts = all.filter((w) => St().yearOf(w.date) === year).length;

    // Daily-goal hit rate — calorie and time goals counted independently, as
    // a share of the year's workout days; food goal uses explicitly logged days.
    const gA = Store().settings.goals || {};
    const foodLog = Store().settings.noJunkFoodLog || {};
    // Analytics consumes the centralized Food engine for its high-level
    // junk-food chart only; detailed streaks/trends/insights live in Food.
    let foodStats = St().foodHabitStats(foodLog, year, St().todayISO());
    try {
      if (F() && F().yearStats) {
        const fy = F().yearStats(foodLog, year, St().todayISO());
        foodStats = { ...fy, avoidedDays: fy.noneDays, partialJunkFoodDays: fy.someDays, junkFoodDays: fy.fullDays, months: fy.months.map((m) => ({ ...m, avoidedDays: m.noneDays, partialJunkFoodDays: m.someDays, junkFoodDays: m.fullDays })) };
      }
    } catch (e) { /* fall back to Stats */ }
    const gsA = St().dailyGoalStatus(all, gA);
    const yearDays = new Set(all.filter((w) => St().yearOf(w.date) === year).map((w) => w.date));
    let calHitsY = 0, durHitsY = 0;
    yearDays.forEach((iso) => {
      const s = gsA.get(iso);
      if (!s) return;
      if (s.calHit) calHitsY++;
      if (s.timeHit) durHitsY++;
    });
    const hitRow = (icon, label, hits, color, denominator) => {
      const total = denominator == null ? yearDays.size : denominator;
      const pct = total ? Math.round((hits / total) * 100) : null;
      return `<div class="type-bar-row">
        <div class="tbr-head"><span>${icon} ${label}</span><span class="tbr-meta"><b class="pct" style="color:${color}">${pct == null ? "—" : pct + "%"}</b><span class="cnt">· ${hits} / ${total} ${denominator == null ? "workout days" : "logged days"}</span></span></div>
        <div class="tbr-track"><span style="width:${pct == null ? 0 : Math.max(pct, 2.5)}%;background:${color}"></span></div>
      </div>`;
    };
    const goalRows = [];
    if (gA.calPerDay != null) goalRows.push(hitRow("🔥", "Calorie goal", calHitsY, "var(--warn)"));
    if (gA.durPerDay != null) goalRows.push(hitRow("⏱️", "Duration goal", durHitsY, "var(--info)"));
    if (gA.avoidJunkFood !== false) goalRows.push(hitRow("🥗", "No junk-food goal", foodStats.avoidedDays, "var(--success)", foodStats.loggedDays));
    const goalCardHTML = goalRows.length
      ? `<div class="card">
          <div class="card-title"><h3>Daily goals · hit rate</h3><span class="sub">food goal uses logged days; other goals use ${yearDays.size} workout day${yearDays.size === 1 ? "" : "s"}</span></div>
          <div class="goal-hits">${goalRows.join("")}</div>
        </div>`
      : "";
    const yearChallenges = Store().challenges.filter((challenge) => challenge.year === year).slice().sort((a, b) => a.month - b.month);
    const completedChallenges = yearChallenges.filter((challenge) => challenge.completed);
    // The month we are living through is not a failed one — it is still running,
    // so it reads as "in progress" instead of sitting next to the finished months.
    const curMonthNum = Number(St().todayISO().slice(5, 7));
    const isCurrentMonth = (challenge) => year === curYear && !challenge.completed && challenge.month === curMonthNum;
    const inProgressChallenges = yearChallenges.filter(isCurrentMonth);
    const challengeStatus = (challenge) => `${challengeTip(challenge)} · ${challenge.completed ? "completed" + (challenge.completionDate ? " " + St().prettyDate(challenge.completionDate) : "") : isCurrentMonth(challenge) ? "in progress" : "not completed"}`;
    // Special editions are not months, so their chip is a ★ instead of a month abbreviation.
    const challengeChipLabel = (challenge) => (isSpecialChallenge(challenge) ? "★" : St().MONTHS_SHORT[challenge.month - 1]);
    const challengePct = yearChallenges.length ? Math.round(completedChallenges.length / yearChallenges.length * 100) : 0;
    const challengeSummaryHTML = !challengesOn() ? "" : `<section class="card analytics-challenges" aria-labelledby="analyticsChallengesTitle">
      <div class="analytics-challenges-head"><div><h3 id="analyticsChallengesTitle">Challenges · ${year}</h3><p class="desc">Your progress on this year’s monthly goals and special editions.</p></div><button type="button" class="btn btn-sm btn-ghost" data-action="goto-challenges">Manage</button></div>
      ${yearChallenges.length ? `<div class="analytics-challenge-progress"><b>${completedChallenges.length}<span> / ${yearChallenges.length} complete</span></b>${inProgressChallenges.length ? `<span class="analytics-challenge-note">${inProgressChallenges.length} in progress</span>` : ""}<span class="analytics-challenge-rate">${challengePct}%</span></div><div class="analytics-challenge-track" role="meter" aria-label="Challenges completed" aria-valuemin="0" aria-valuemax="${yearChallenges.length}" aria-valuenow="${completedChallenges.length}"><span style="width:${challengePct}%"></span></div><div class="analytics-challenge-months">${yearChallenges.map((challenge) => `<span class="analytics-challenge-month ${challenge.completed ? "is-complete" : isCurrentMonth(challenge) ? "is-progress" : "is-pending"}${isSpecialChallenge(challenge) ? " is-special" : ""}" style="--badge-color:${challengeColor(challenge.month)}" role="img" title="${esc(challengeStatus(challenge))}" aria-label="${esc(challengeStatus(challenge))}"><i aria-hidden="true">${challenge.completed ? ICONS.check : ""}</i>${esc(challengeChipLabel(challenge))}${isCurrentMonth(challenge) ? "<em>in progress</em>" : ""}</span>`).join("")}</div>` : `<p class="analytics-challenge-empty">No challenges tracked for ${year} yet.</p>`}
    </section>`;

    wrap.innerHTML = `
      ${challengeSummaryHTML}
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
        <div class="card"${goalRows.length ? "" : ` style="grid-column:1 / -1"`}>
          <div class="card-title"><h3>Workout types · ${year}</h3><span class="sub">${tbWorkouts} workouts</span></div>
          <div id="acTypeBars"></div>
        </div>
        ${goalCardHTML}
      </div>

      <div class="card" style="margin-top:16px;grid-column:1 / -1">
        <div class="card-title"><div><h3>Junk-food days · ${year}</h3><p class="desc">High-level overview — detailed streaks, trends and insights live in <button type="button" class="link-btn" data-action="goto" data-view="food">Food</button>.</p></div><button type="button" class="btn btn-sm btn-ghost" data-action="goto" data-view="food">Open Food</button></div>
        <div class="food-chart-legend" aria-label="Food log chart legend"><span><i style="--legend-color:var(--danger)"></i>Full junk-food day</span><span><i style="--legend-color:var(--warn)"></i>Some junk food</span><span><i style="--legend-color:var(--success)"></i>No junk food</span></div>
        <div class="chart-wrap" id="acJunkFood"></div>
        <p class="food-habit-counts" aria-live="polite">Full: <b>${foodStats.junkFoodDays}</b> · Some: <b>${foodStats.partialJunkFoodDays}</b> · None: <b>${foodStats.avoidedDays}</b></p>
        <p class="food-habit-note">Months with no logged dates are omitted. Each logged day falls into exactly one of the three states.</p>
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
      </div>` : ""}
    `;

    const labels = ms.map((m) => m.label);
    C().barChart(document.getElementById("acJunkFood"), labels, [
      { name: "Full junk-food days", values: foodStats.months.map((m) => m.loggedDays ? m.junkFoodDays : null), color: "var(--danger)" },
      { name: "Some junk food", values: foodStats.months.map((m) => m.loggedDays ? m.partialJunkFoodDays : null), color: "var(--warn)" },
      { name: "No junk food", values: foodStats.months.map((m) => m.loggedDays ? m.avoidedDays : null), color: "var(--success)" }
    ], { height: 180, valueFmt: (v) => v + " logged days", highlight: hl });
    C().barChart(document.getElementById("acMonthly"), labels, [{ name: "Workouts", values: ms.map((m) => m.workouts) }], { height: 180, valueFmt: (v) => v + " workouts", highlight: hl });
    C().barChart(document.getElementById("acCalories"), labels, [{ name: "kcal", values: ms.map((m) => m.calories), color: "var(--success)" }], { height: 180, valueFmt: (v) => St().fmtNum(v) + " kcal", highlight: hl });
    C().barChart(document.getElementById("acDuration"), labels, [{ name: "min", values: ms.map((m) => m.duration), color: "var(--info)" }], { height: 180, valueFmt: (v) => St().fmtDuration(v) });
    C().lineChart(document.getElementById("acAvgCal"), labels, [{ name: "kcal / workout", values: ms.map((m) => (m.avgCal ? Math.round(m.avgCal) : null)), color: "var(--warn)" }], { height: 180, valueFmt: (v) => St().fmtNum(v) + " kcal" });

    // workout types — clean horizontal bars instead of the donut
    document.getElementById("acTypeBars").innerHTML = tb.length
      ? tb.map((t) => {
        const st = typeStyle(t.type);
        return `<div class="type-bar-row">
          <div class="tbr-head"><span>${st.emoji} ${esc(t.type)}</span><span class="tbr-meta"><span class="cnt">${t.count} ·</span><b class="pct">${t.pct.toFixed(0)}%</b></span></div>
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
    const history = St().workoutHistoryStats(all);
    const days = history.workoutDays;
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
          <div class="data-card-head">${icon("activity")}<div><h3>Your Data</h3><p class="desc">Workout days and elapsed rest days, from ${history.startDate ? St().prettyDate(history.startDate) + " through " + St().prettyDate(history.endDate) : "your workout history"}.</p></div></div>
          <div class="data-stats">
            <div class="s"><b>${St().fmtNum(days)}</b><span>Workout days</span></div>
            <div class="s"><b>${St().fmtNum(history.restDays)}</b><span>Resting days</span></div>
            <div class="s"><b>${St().fmtNum(meas.length)}</b><span>Measurements</span></div>
            <div class="s"><b>${curYear}</b><span>${curYear === new Date().getFullYear() ? "Current year" : "Year in focus"}</span></div>
          </div>
          <p class="data-foot">Last updated <b>${lastAct ? St().prettyDate(new Date(lastAct).toISOString().slice(0, 10)) : "never"}</b></p>
        </div>

        <div class="card data-card">
          <div class="data-card-head">${icon("clock")}<div><h3>Backup Status</h3><p class="desc">When your data last moved in or out.</p></div></div>
          <div class="data-status">
            <div class="st"><b>${esc(pretty(set.lastBackupAt))}</b><span>Last JSON backup</span></div>
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
          showImportPreview(obj.workouts, obj.measurements, [], { source: "json", meta: {}, backupData: obj });
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
    const backupFoodDates = extra.source === "json" && extra.backupData && extra.backupData.settings && extra.backupData.settings.noJunkFoodLog
      ? Object.keys(extra.backupData.settings.noJunkFoodLog).filter((iso) => St().validISODate(iso) && (typeof extra.backupData.settings.noJunkFoodLog[iso] === "boolean" || extra.backupData.settings.noJunkFoodLog[iso] === "some")).length
      : 0;
    if (!t.added && !t.updated && !t.invalid && !backupFoodDates) { toast("Nothing to import — all records already exist unchanged.", "warn"); return; }

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
      ${backupFoodDates ? `<p class="modal-sub">🥗 ${backupFoodDates} daily food outcome${backupFoodDates === 1 ? "" : "s"} will be restored (local entries win on date conflicts).</p>` : ""}
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
        <button class="btn btn-primary" id="confirmImport">Import ${t.added + t.updated} record${t.added + t.updated === 1 ? "" : "s"}${backupFoodDates ? " + food log" : ""}</button>
      </div>`, {
      onOpen: (m) => {
        m.querySelector("#confirmImport").addEventListener("click", async () => {
          closeModal();
          try {
            const res = extra.source === "json" && extra.backupData
              ? await N.importBackup(extra.backupData)
              : await N.importRecords(workoutRows, measurementRows);
            await N.setSetting("lastImportAt", new Date().toISOString());
            Focus.UI.renderData();
            const bits = [];
            if (res.added) bits.push(res.added + " added");
            if (res.updated) bits.push(res.updated + " updated");
            if (res.invalid) bits.push(res.invalid + " invalid");
            if (backupFoodDates) bits.push(backupFoodDates + " food outcome" + (backupFoodDates === 1 ? "" : "s") + " restored where local dates were empty");
            toast("Import complete — " + (bits.join(", ") || "nothing to do") + ". Your dashboard has been updated.", "success", 5500);
          } catch (e) {
            toast("Import failed: " + e.message, "error", 5000);
          }
        });
      }
    });
  }

  /* ---------------- number steppers ---------------- */
  /* Replace the native number-input spinner with app-styled − / + buttons.
     The native WebKit spinner cannot be restyled without breaking its click
     handling, so it is hidden in CSS and real buttons are injected here.
     A MutationObserver decorates inputs as views/modals render them. */

  const STEP_UP_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 9.75 8 6.25 11.5 9.75"/></svg>';
  const STEP_DOWN_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.25 8 9.75 11.5 6.25"/></svg>';

  function stepNumber(input, dir) {
    if (input.disabled || input.readOnly) return;
    const min = input.min === "" ? null : parseFloat(input.min);
    const max = input.max === "" ? null : parseFloat(input.max);
    let step = (input.step === "" || input.step === "any") ? 1 : parseFloat(input.step);
    if (!isFinite(step) || step <= 0) step = 1;
    let v = input.value === "" ? NaN : parseFloat(input.value);
    if (isNaN(v)) v = min !== null ? min : 0;
    let nv = v + dir * step;
    // Numeric steps snap to the step grid (like the native spinner); step="any" adds/subtracts raw.
    if (input.step !== "any") {
      const base = min !== null ? min : 0;
      nv = base + Math.round((nv - base) / step) * step;
    }
    nv = Math.round(nv * 1e6) / 1e6;
    if (max !== null && nv > max) nv = max;
    if (min !== null && nv < min) nv = min;
    input.value = String(nv);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function decorateStepper(input) {
    if (input.dataset.stepper) return;
    input.dataset.stepper = "1";
    const wrap = document.createElement("span");
    wrap.className = "stepper";
    if (input.style.width) { // e.g. the age field has an inline width — keep it on the wrapper
      wrap.style.width = input.style.width;
      input.style.width = "";
    }
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    ["up", "down"].forEach((dir) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "stepper-btn " + dir;
      b.tabIndex = -1;
      b.setAttribute("aria-hidden", "true");
      b.innerHTML = dir === "up" ? STEP_UP_SVG : STEP_DOWN_SVG;
      b.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the input
      b.addEventListener("click", (e) => { e.preventDefault(); stepNumber(input, dir === "up" ? 1 : -1); });
      wrap.appendChild(b);
    });
  }

  function decorateSteppers() {
    document.querySelectorAll('input.input[type="number"]:not([data-stepper])').forEach(decorateStepper);
  }

  if (document.body) {
    decorateSteppers();
    new MutationObserver(decorateSteppers).observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      decorateSteppers();
      new MutationObserver(decorateSteppers).observe(document.body, { childList: true, subtree: true });
    });
  }

  /* ---------------- public ---------------- */

  window.Focus = window.Focus || {};
  window.Focus.UI = {
    state, TYPE_STYLES, typeStyle, existingTypes, existingMeasTypes, pickerTypes, typeSummaryHTML,
    esc, el, icon, ICONS,
    openModal, closeModal, toast, confirmDialog, closeInfoPopover,
    markDashEnter, showBackupBanner, hideBackupBanner,
    openWorkoutForm, openMeasurementForm, openMeasurementList, openChallengeForm, toggleChallengeComplete, toggleChallengeYear, unitDefault,
    renderDashboard, renderCalendar, renderChallenges, renderFood, renderTools, renderProgress, renderAnalytics, renderData, renderSettings,
    yearHeatGrid, renderMonthView, dayPanelHTML, showImportPreview, showPdfModal, wireDrop, cssColor
  };
})();
