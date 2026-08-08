/* =========================================================================
 * Focus.Store — persistence layer (IndexedDB + in-memory cache)
 * -------------------------------------------------------------------------
 * Everything is loaded into memory once on boot. All reads are synchronous
 * off the cache; every mutation is written through to IndexedDB so changes
 * survive restarts and are safe even if the tab is closed mid-session.
 * ========================================================================= */
(function () {
  "use strict";

  const DB_NAME = "focus-tracker";
  const DB_VERSION = 1;

  let db = null;
  const state = {
    workouts: [],
    measurements: [],
    settings: {},          // plain object persisted under key 'app'
    ready: false
  };
  let onChangeCb = null;

  /* ---------------- id & dates ---------------- */

  function uid() {
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function nowIso() { return new Date().toISOString(); }

  function makeWorkout(data) {
    const t = nowIso();
    return {
      id: data.id || uid(),
      date: data.date,
      type: (data.type || "Other").trim() || "Other",
      duration: data.duration == null || data.duration === "" ? null : Math.max(0, Number(data.duration)),
      calories: data.calories == null || data.calories === "" ? null : Math.max(0, Number(data.calories)),
      notes: data.notes || "",
      createdAt: data.createdAt || t,
      updatedAt: t
    };
  }

  function makeMeasurement(data) {
    const t = nowIso();
    return {
      id: data.id || uid(),
      date: data.date,
      type: (data.type || "Weight").trim() || "Weight",
      value: Number(data.value),
      unit: (data.unit || "").trim(),
      notes: data.notes || "",
      createdAt: data.createdAt || t,
      updatedAt: t
    };
  }

  /* ---------------- IndexedDB plumbing ---------------- */

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains("workouts")) {
          const s = d.createObjectStore("workouts", { keyPath: "id" });
          s.createIndex("date", "date");
          s.createIndex("type", "type");
        }
        if (!d.objectStoreNames.contains("measurements")) {
          const s = d.createObjectStore("measurements", { keyPath: "id" });
          s.createIndex("date", "date");
          s.createIndex("type", "type");
        }
        if (!d.objectStoreNames.contains("settings")) {
          d.createObjectStore("settings", { keyPath: "k" });
        }
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) {
    return db.transaction(store, mode).objectStore(store);
  }

  function getAll(store) {
    return new Promise((resolve, reject) => {
      const r = tx(store, "readonly").getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  }

  function put(store, value) {
    return new Promise((resolve, reject) => {
      const r = tx(store, "readwrite").put(value);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }

  function del(store, id) {
    return new Promise((resolve, reject) => {
      const r = tx(store, "readwrite").delete(id);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }

  function bulkPut(store, values) {
    if (!values.length) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, "readwrite");
      const os = t.objectStore(store);
      values.forEach((v) => os.put(v));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  function clearStore(store) {
    return new Promise((resolve, reject) => {
      const r = tx(store, "readwrite").clear();
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }

  /* ---------------- settings ---------------- */

  function loadSettings() {
    return new Promise((resolve, reject) => {
      const r = tx("settings", "readonly").get("app");
      r.onsuccess = () => resolve(r.result ? r.result.value : {});
      r.onerror = () => reject(r.error);
    });
  }

  function saveSettings() {
    return put("settings", { k: "app", value: state.settings });
  }

  /* ---------------- public API ---------------- */

  const Store = {

    get workouts() { return state.workouts; },
    get measurements() { return state.measurements; },
    get settings() { return state.settings; },
    get ready() { return state.ready; },

    /** Boot: open DB, load everything into memory. */
    async init() {
      await openDB();
      const [w, m, s] = await Promise.all([getAll("workouts"), getAll("measurements"), loadSettings()]);
      state.workouts = w.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1);
      state.measurements = m.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1);
      const defaults = { theme: null, selectedYear: null, lastBackupAt: null, seedVersion: 0, weightUnit: "lb", goals: { calPerDay: null, durPerDay: null, workoutsPerWeek: null } };
      state.settings = Object.assign({}, defaults, s);
      state.settings.goals = Object.assign({}, defaults.goals, s.goals || {});
      state.ready = true;
    },

    /** Register a callback invoked after any data mutation. */
    onChange(cb) { onChangeCb = cb; },

    notify() { if (onChangeCb) onChangeCb(); },

    /* ----- workouts (persist first, then update memory) ----- */
    async addWorkout(data) {
      const w = makeWorkout(data);
      await put("workouts", w);
      state.workouts.push(w);
      state.workouts.sort(byDateThenId);
      this.notify();
      return w;
    },
    async updateWorkout(id, patch) {
      const w = state.workouts.find((x) => x.id === id);
      if (!w) return null;
      const updated = Object.assign({}, w, patch, { updatedAt: nowIso() });
      if (patch.type) updated.type = String(patch.type).trim() || "Other";
      if (patch.duration != null && patch.duration !== "") updated.duration = Math.max(0, Number(patch.duration));
      else if (patch.duration === null) updated.duration = null;
      if (patch.calories != null && patch.calories !== "") updated.calories = Math.max(0, Number(patch.calories));
      else if (patch.calories === null) updated.calories = null;
      await put("workouts", updated);
      Object.assign(w, updated);
      this.notify();
      return w;
    },
    async deleteWorkout(id) {
      await del("workouts", id);
      state.workouts = state.workouts.filter((x) => x.id !== id);
      this.notify();
    },

    /* ----- measurements ----- */
    async addMeasurement(data) {
      const m = makeMeasurement(data);
      await put("measurements", m);
      state.measurements.push(m);
      state.measurements.sort(byDateThenId);
      this.notify();
      return m;
    },
    async updateMeasurement(id, patch) {
      const m = state.measurements.find((x) => x.id === id);
      if (!m) return null;
      const updated = Object.assign({}, m, patch, { updatedAt: nowIso() });
      updated.value = Number(patch.value);
      updated.type = String(patch.type).trim();
      updated.unit = (patch.unit || "").trim();
      await put("measurements", updated);
      Object.assign(m, updated);
      this.notify();
      return m;
    },
    async deleteMeasurement(id) {
      await del("measurements", id);
      state.measurements = state.measurements.filter((x) => x.id !== id);
      this.notify();
    },

    /* ----- settings ----- */
    async setSetting(key, value) {
      state.settings[key] = value;
      await saveSettings();
    },
    async setSettings(obj) {
      Object.assign(state.settings, obj);
      await saveSettings();
    },

    /* ----- seed ----- */
    /** Load built-in historical data once (idempotent, dedup-safe). */
    async seedIfNeeded() {
      const v = window.FocusSeed && FocusSeed.version ? FocusSeed.version : 0;
      if (state.settings.seedVersion >= v) return { loaded: false, reason: "already-seeded" };
      if (!window.FocusSeed) return { loaded: false, reason: "no-seed" };
      const res = await this.importRecords(
        FocusSeed.workouts.map((w) => ({ ...w, type: w.type || "Other" })),
        FocusSeed.measurements || []
      );
      state.settings.seedVersion = v;
      await saveSettings();
      this.notify();
      return { loaded: res.added > 0, added: res.added };
    },

    /**
     * Plan an import without touching any state. Returns a plan object:
     * { workouts: { added:[], updated:[{existing, norm}], skipped, invalid },
     *   measurements: { ... }, totals: { added, updated, skipped, invalid } }
     * Matching precedence: stable ID (with content diff -> update), else
     * date+type+duration+calories (workouts) / date+type+value+unit (measurements).
     */
    planImport(workoutRows, measurementRows) {
      const plan = {
        workouts: { added: [], updated: [], skipped: 0, invalid: 0 },
        measurements: { added: [], updated: [], skipped: 0, invalid: 0 }
      };

      const wById = new Map(state.workouts.map((w) => [w.id, w]));
      const wByKey = new Map(state.workouts.map((w) => [workoutKey(w), w]));
      for (const r of workoutRows) {
        const norm = normalizeWorkoutRow(r);
        if (!norm) { plan.workouts.invalid++; continue; }
        if (norm.id && wById.has(norm.id)) {
          const existing = wById.get(norm.id);
          if (workoutDiffers(existing, norm)) plan.workouts.updated.push({ existing, norm });
          else plan.workouts.skipped++;
          continue;
        }
        if (wByKey.has(workoutKey(norm))) { plan.workouts.skipped++; continue; }
        plan.workouts.added.push(norm);
        wById.set(norm.id || "new-" + plan.workouts.added.length, {});
        wByKey.set(workoutKey(norm), { exists: true });
      }

      const mById = new Map(state.measurements.map((m) => [m.id, m]));
      const mByKey = new Map(state.measurements.map((m) => [measKey(m), m]));
      for (const r of measurementRows) {
        const norm = normalizeMeasurementRow(r);
        if (!norm) { plan.measurements.invalid++; continue; }
        if (norm.id && mById.has(norm.id)) {
          const existing = mById.get(norm.id);
          if (measDiffers(existing, norm)) plan.measurements.updated.push({ existing, norm });
          else plan.measurements.skipped++;
          continue;
        }
        if (mByKey.has(measKey(norm))) { plan.measurements.skipped++; continue; }
        plan.measurements.added.push(norm);
        mById.set(norm.id || "new-" + plan.measurements.added.length, {});
        mByKey.set(measKey(norm), { exists: true });
      }

      plan.totals = {
        added: plan.workouts.added.length + plan.measurements.added.length,
        updated: plan.workouts.updated.length + plan.measurements.updated.length,
        skipped: plan.workouts.skipped + plan.measurements.skipped,
        invalid: plan.workouts.invalid + plan.measurements.invalid
      };
      return plan;
    },

    /**
     * Execute a planned import (or re-plan + execute from raw rows).
     * Never destroys data: identical records are skipped, ID-matched records
     * with different content are updated, everything else is added.
     */
    async importRecords(workoutRows, measurementRows) {
      const plan = this.planImport(workoutRows, measurementRows);
      const result = { added: 0, updated: 0, skipped: 0, invalid: 0, workouts: [], measurements: [] };

      const addedW = plan.workouts.added.map((n) => makeWorkout(n));
      const addedM = plan.measurements.added.map((n) => makeMeasurement(n));

      // Persist first, then touch memory, so a storage failure never leaves
      // the two out of sync.
      if (addedW.length) await bulkPut("workouts", addedW);
      if (addedM.length) await bulkPut("measurements", addedM);

      if (plan.workouts.updated.length) {
        plan.workouts.updated.forEach(({ existing, norm }) => {
          Object.assign(existing, pickWorkout(norm), { updatedAt: nowIso() });
        });
        await bulkPut("workouts", plan.workouts.updated.map((u) => u.existing));
      }
      if (plan.measurements.updated.length) {
        plan.measurements.updated.forEach(({ existing, norm }) => {
          Object.assign(existing, pickMeasurement(norm), { updatedAt: nowIso() });
        });
        await bulkPut("measurements", plan.measurements.updated.map((u) => u.existing));
      }

      if (addedW.length || addedM.length) {
        state.workouts = state.workouts.concat(addedW).sort(byDateThenId);
        state.measurements = state.measurements.concat(addedM).sort(byDateThenId);
      }

      result.added = addedW.length + addedM.length;
      result.updated = plan.workouts.updated.length + plan.measurements.updated.length;
      result.skipped = plan.totals.skipped;
      result.invalid = plan.totals.invalid;
      result.workouts = addedW;
      result.measurements = addedM;
      this.notify();
      return result;
    },

    /* ----- backup ----- */
    exportBackup() {
      return {
        app: "focus",
        kind: "backup",
        version: 1,
        exportedAt: nowIso(),
        settings: state.settings,
        workouts: state.workouts,
        measurements: state.measurements
      };
    },

    /** Import a JSON backup blob (object). Never destroys data. */
    async importBackup(obj) {
      if (!obj || (obj.app !== "focus" && obj.app !== "pulse") || !Array.isArray(obj.workouts) || !Array.isArray(obj.measurements)) {
        throw new Error("This file is not a valid Focus backup.");
      }
      return this.importRecords(obj.workouts, obj.measurements);
    },

    /* ----- reset ----- */
    async resetAll() {
      await Promise.all([clearStore("workouts"), clearStore("measurements")]);
      state.workouts = [];
      state.measurements = [];
      this.notify();
    }
  };

  /* ---------------- helpers ---------------- */

  function byDateThenId(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  function workoutKey(w) {
    return [w.date || "", w.type || "", w.duration == null ? "" : Number(w.duration), w.calories == null ? "" : Number(w.calories)].join("|");
  }
  function measKey(m) {
    return [m.date || "", m.type || "", Number(m.value), m.unit || ""].join("|");
  }

  function workoutDiffers(existing, norm) {
    return existing.date !== norm.date ||
      (existing.type || "") !== (norm.type || "") ||
      (existing.duration ?? null) !== (norm.duration ?? null) ||
      (existing.calories ?? null) !== (norm.calories ?? null) ||
      (existing.notes || "") !== (norm.notes || "");
  }
  function measDiffers(existing, norm) {
    return existing.date !== norm.date ||
      (existing.type || "") !== (norm.type || "") ||
      Number(existing.value) !== Number(norm.value) ||
      (existing.unit || "") !== (norm.unit || "") ||
      (existing.notes || "") !== (norm.notes || "");
  }
  function pickWorkout(norm) {
    return { date: norm.date, type: norm.type, duration: norm.duration, calories: norm.calories, notes: norm.notes };
  }
  function pickMeasurement(norm) {
    return { date: norm.date, type: norm.type, value: norm.value, unit: norm.unit, notes: norm.notes };
  }

  /** Validate + normalize a raw workout row (from import or seed). */
  function normalizeWorkoutRow(r) {
    if (!r || typeof r !== "object") return null;
    const date = normalizeDate(r.date);
    if (!date) return null;
    const type = r.type != null && String(r.type).trim() !== "" ? String(r.type).trim() : "Other";
    let duration = null;
    let calories = null;
    if (r.duration != null && r.duration !== "") {
      duration = Number(r.duration);
      if (!isFinite(duration) || duration < 0) return null;
    }
    if (r.calories != null && r.calories !== "") {
      calories = Number(r.calories);
      if (!isFinite(calories) || calories < 0) return null;
    }
    return {
      id: typeof r.id === "string" && r.id ? r.id : undefined,
      date,
      type,
      duration,
      calories,
      notes: r.notes != null ? String(r.notes) : "",
      createdAt: r.createdAt || undefined
    };
  }

  function normalizeMeasurementRow(r) {
    if (!r || typeof r !== "object") return null;
    const date = normalizeDate(r.date);
    if (!date) return null;
    const value = Number(r.value);
    if (!isFinite(value)) return null;
    const type = r.type != null && String(r.type).trim() !== "" ? String(r.type).trim() : "Weight";
    return {
      id: typeof r.id === "string" && r.id ? r.id : undefined,
      date,
      type,
      value,
      unit: r.unit != null ? String(r.unit).trim() : "",
      notes: r.notes != null ? String(r.notes) : "",
      createdAt: r.createdAt || undefined
    };
  }

  /** Accept "YYYY-MM-DD" (preferred) plus common spreadsheet formats. */
  function normalizeDate(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date && !isNaN(v)) return toISODate(v);
    if (typeof v === "number" && isFinite(v)) {
      // Excel serial date
      if (v > 20000 && v < 80000) return toISODate(excelSerialToDate(v));
      return null;
    }
    let s = String(v).trim();
    // "8/7/2026" | "07/08/2026" | "7-Aug-26" etc.
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return pad(m[1], m[2], m[3]);
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (m) {
      let a = Number(m[1]), b = Number(m[2]), y = m[3];
      if (y.length === 2) y = (Number(y) > 40 ? "19" : "20") + y;
      // First value > 12 -> it must be the day (d/m/y); second value > 12
      // -> the first is the month (m/d/y); when both are ambiguous, default
      // to day-first (d/m/y), the international convention. The app's own
      // exports always use YYYY-MM-DD, so round-trips are never ambiguous.
      if (a > 12) return pad(y, String(b), String(a));
      if (b > 12) return pad(y, String(a), String(b));
      return pad(y, String(b), String(a));
    }
    m = s.match(/^(\d{1,2})[-\s](\w{3,9})[-\s](\d{2,4})$/i);
    if (m) {
      const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
        .findIndex((x) => x.startsWith(m[2].toLowerCase().slice(0, 3)));
      if (month >= 0) {
        let y = m[3];
        if (y.length === 2) y = (Number(y) > 40 ? "19" : "20") + y;
        return pad(y, String(month + 1), m[1]);
      }
    }
    return null;
  }

  function pad(y, mo, d) {
    return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }

  function toISODate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function excelSerialToDate(serial) {
    // Excel serial → calendar date, timezone-safe: derive the calendar day
    // from UTC components and rebuild as local midnight.
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  Store.normalizeWorkoutRow = normalizeWorkoutRow;
  Store.normalizeMeasurementRow = normalizeMeasurementRow;
  Store.workoutKey = workoutKey;
  Store.measKey = measKey;

  window.Focus = window.Focus || {};
  window.Focus.Store = Store;
})();
