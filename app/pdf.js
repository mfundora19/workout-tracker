/* =========================================================================
 * Focus.Pdf — local PDF report generator (jsPDF bundled in app/lib/)
 * -------------------------------------------------------------------------
 * Generates a multi-page annual report entirely in the browser: overview
 * stats, monthly progress charts, year-over-year comparison (only when the
 * comparison year has data), and measurement trends (only for types with at
 * least two readings). Charts are drawn with jsPDF primitives so no external
 * service or image pipeline is ever involved.
 * ========================================================================= */
(function () {
  "use strict";
  const S = window.Focus.Stats;

  const INK = {
    dark: "#1E2233", accent: "#6366F1", accent2: "#8B5CF6", success: "#10B981",
    warn: "#F59E0B", info: "#0EA5E9", muted: "#6B7280", light: "#EEF0F8",
    grid: "#E5E7F0", white: "#FFFFFF"
  };

  function hexToRgb(h) {
    const s = h.replace("#", "");
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }

  function niceMax(v) {
    if (v <= 5) return 5;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    return (steps.find((s) => f <= s) || 10) * p;
  }

  function compact(n) {
    if (n == null || !isFinite(n)) return "0";
    return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "k" : String(Math.round(n));
  }

  /**
   * Build the report. Returns { blob, filename } (never downloads itself).
   * opts: { year, compareYear }
   */
  function exportPdf(opts = {}) {
    const jsPDF = window.jspdf.jsPDF;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 44;
    const CW = W - M * 2;
    const w = Focus.Store.workouts;
    const year = opts.year || S.yearOf(S.todayISO());
    const years = S.availableYears(w, Focus.Store.measurements);
    const compareYear = opts.compareYear && opts.compareYear !== year && years.includes(opts.compareYear) ? opts.compareYear : null;

    let page = 1;
    const footer = () => {
      doc.setFontSize(8);
      doc.setTextColor(...hexToRgb(INK.muted));
      doc.text("Focus — generated locally on this device", M, H - 22);
      doc.text("Page " + page, W - M, H - 22, { align: "right" });
    };
    const header = (title, sub) => {
      doc.setFillColor(...hexToRgb(INK.dark));
      doc.rect(0, 0, W, 62, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.setTextColor(255, 255, 255);
      doc.text(title, M, 38);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(185, 190, 210);
      doc.text(sub, M, 52);
      doc.setFillColor(...hexToRgb(INK.accent));
      doc.rect(0, 62, W, 2.5, "F");
    };
    const newPage = (title, sub) => {
      doc.addPage();
      page++;
      header(title, sub);
      footer();
    };

    /* ---------------- charts ---------------- */

    function chartFrame(title, x, y, w, h, labels, series, legendY) {
      const max = Math.max(1, ...series.flatMap((s) => s.values));
      const nice = niceMax(max);
      const n = labels.length;
      const groupW = w / n;
      const barW = Math.min(15, (groupW - 8) / series.length);

      // title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...hexToRgb(INK.dark));
      doc.text(title, x, y - 22);

      // legend (top-right)
      let lx = x + w;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      series.slice().reverse().forEach((s) => {
        const tw = doc.getTextWidth(s.name);
        lx -= tw;
        doc.setTextColor(...hexToRgb(INK.muted));
        doc.text(s.name, lx, y - 14, { align: "right" });
        lx -= 10;
        doc.setFillColor(...hexToRgb(s.color));
        doc.rect(lx, y - 18, 7, 7, "F");
        lx -= 14;
      });

      // grid + y labels
      doc.setDrawColor(...hexToRgb(INK.grid));
      doc.setLineWidth(0.5);
      for (let i = 0; i <= 4; i++) {
        const yy = y + h - (h * i) / 4;
        doc.line(x, yy, x + w, yy);
        doc.setFontSize(7);
        doc.setTextColor(...hexToRgb(INK.muted));
        doc.text(compact((nice * i) / 4), x - 4, yy + 2, { align: "right" });
      }

      // bars
      series.forEach((s, si) => {
        doc.setFillColor(...hexToRgb(s.color));
        s.values.forEach((v, i) => {
          if (v == null || v <= 0) return;
          const bh = Math.max(1.5, (v / nice) * h);
          const bx = x + i * groupW + groupW / 2 - (series.length * barW + (series.length - 1) * 4) / 2 + si * (barW + 4);
          doc.roundedRect(bx, y + h - bh, barW, bh, 2, 2, "F");
        });
      });

      // x labels
      const every = n > 24 ? 3 : n > 12 ? 2 : 1;
      doc.setFontSize(7);
      doc.setTextColor(...hexToRgb(INK.muted));
      labels.forEach((lb, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        doc.text(lb, x + i * groupW + groupW / 2, y + h + 11, { align: "center" });
      });
    }

    function lineChart(title, x, y, w, h, labels, values, color, unit) {
      const max = Math.max(1, ...values);
      const nice = niceMax(max);
      const n = values.length;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...hexToRgb(INK.dark));
      doc.text(title, x, y - 22);

      doc.setDrawColor(...hexToRgb(INK.grid));
      doc.setLineWidth(0.5);
      for (let i = 0; i <= 4; i++) {
        const yy = y + h - (h * i) / 4;
        doc.line(x, yy, x + w, yy);
        doc.setFontSize(7);
        doc.setTextColor(...hexToRgb(INK.muted));
        doc.text(compact((nice * i) / 4), x - 4, yy + 2, { align: "right" });
      }

      // area + line (jsPDF draws paths via relative `lines` segments)
      const pts = values.map((v, i) => [
        x + (n === 1 ? w / 2 : (i * w) / (n - 1)),
        y + h - (Math.max(0, v) / nice) * h
      ]);
      if (pts.length > 1) {
        const startX = pts[0][0], startY = y + h;
        const area = [[0, pts[0][1] - startY]];
        for (let i = 1; i < pts.length; i++) area.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
        area.push([0, y + h - pts[pts.length - 1][1]]);
        doc.setFillColor(99, 102, 241, 0.12);
        doc.lines(area, startX, startY, [1, 1], "F", true);
        const line = pts.slice(1).map(([px, py], i) => [px - pts[i][0], py - pts[i][1]]);
        doc.setDrawColor(...hexToRgb(color));
        doc.setLineWidth(1.4);
        doc.setLineCap("round");
        doc.lines(line, pts[0][0], pts[0][1], [1, 1], "S");
        doc.setLineCap("butt");
      }

      const every = n > 24 ? 3 : n > 12 ? 2 : 1;
      doc.setFontSize(7);
      doc.setTextColor(...hexToRgb(INK.muted));
      labels.forEach((lb, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        doc.text(lb, x + (n === 1 ? w / 2 : (i * w) / (n - 1)), y + h + 11, { align: "center" });
      });
      if (unit) {
        doc.setTextColor(...hexToRgb(INK.muted));
        doc.text(unit, x + w, y - 14, { align: "right" });
      }
    }

    /* ---------------- page 1: overview ---------------- */

    header("Focus — Annual Report · " + year, "Workout & Fitness Tracker · exported " + S.prettyDate(S.todayISO()));
    const ys = S.yearlyStats(w, year);
    const st = S.streaks(w, S.todayISO());
    const ms = S.monthlyStats(w, year);

    const cards = [
      ["Total Workouts", ys.workouts], ["Workout Days", ys.days],
      ["Total Calories", S.fmtNum(ys.calories)], ["Total Duration (min)", S.fmtNum(ys.duration)],
      ["Avg Calories / Workout", ys.workouts ? Math.round(ys.avgCal) : "—"],
      ["Avg Duration / Workout", ys.workouts ? Math.round(ys.avgDur) + " min" : "—"],
      ["Current Streak", st.current + " days"], ["Longest Streak", ys.longestStreak + " days"]
    ];
    const cardW = (CW - 14) / 2;
    const cardH = 46;
    let cy = 104;
    cards.forEach(([label, value], i) => {
      const cx = M + (i % 2) * (cardW + 14);
      const yy = cy + Math.floor(i / 2) * (cardH + 10);
      doc.setFillColor(...hexToRgb(INK.light));
      doc.roundedRect(cx, yy, cardW, cardH, 6, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...hexToRgb(INK.dark));
      doc.text(String(value), cx + 12, yy + 24);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...hexToRgb(INK.muted));
      doc.text(label, cx + 12, yy + 38);
    });
    cy += 4 * (cardH + 10) + 6;

    // Highlights
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...hexToRgb(INK.dark));
    doc.text("Year highlights", M, cy);
    cy += 16;
    const hl = [
      ["Best month", ys.bestMonth ? ys.bestMonth.label + " · " + ys.bestMonth.days + " workout days" : "—"],
      ["Most calories in a day", S.fmtNum(ms.reduce((a, b) => Math.max(a, b.calories), 0)) + " kcal"],
      ["Months active", ys.monthsWithData + " of 12"],
      ["Measurements recorded", Focus.Store.measurements.filter((m) => m.date.slice(0, 4) === String(year)).length]
    ];
    doc.setFontSize(9);
    hl.forEach(([label, value]) => {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...hexToRgb(INK.muted));
      doc.text(label + ":", M, cy);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...hexToRgb(INK.dark));
      doc.text(String(value), M + 150, cy);
      cy += 14;
    });

    if (compareYear) {
      const cmp = S.compareYears(w, year, compareYear);
      const t = cmp.totals;
      cy += 10;
      doc.setFillColor(...hexToRgb(INK.accent));
      doc.roundedRect(M, cy, CW, 40, 6, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text(year + " vs " + compareYear, M + 14, cy + 17);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(
        "Workouts: " + t.workouts.a + " vs " + t.workouts.b + "  ·  Calories: " + S.fmtNum(t.calories.a) + " vs " + S.fmtNum(t.calories.b) +
        "  ·  Duration: " + S.fmtNum(t.duration.a) + " vs " + S.fmtNum(t.duration.b) + " min",
        M + 14, cy + 31
      );
    }
    footer();

    /* ---------------- page 2: monthly progress ---------------- */

    newPage("Monthly Progress — " + year, "Workouts, calories and duration per month");
    const labels = ms.map((m) => m.label);
    let y = 110;
    const ch = 178;
    chartFrame("Workouts per month", M, y, CW, ch, labels,
      [{ name: "Workouts", values: ms.map((m) => m.workouts), color: INK.accent }]);
    y += ch + 26;
    chartFrame("Calories per month", M, y, CW, ch, labels,
      [{ name: "kcal", values: ms.map((m) => m.calories), color: INK.success }]);
    y += ch + 26;
    chartFrame("Duration per month (min)", M, y, CW, ch, labels,
      [{ name: "min", values: ms.map((m) => m.duration), color: INK.info }]);

    /* ---------------- page 3: year comparison ---------------- */

    if (compareYear) {
      newPage(year + " vs " + compareYear, "Year-over-year comparison by month");
      const cmp = S.compareYears(w, year, compareYear);
      const cLabels = cmp.months.map((m) => m.label);
      const cWk = [
        { name: String(year), values: cmp.months.map((m) => m.a.workouts), color: INK.accent },
        { name: String(compareYear), values: cmp.months.map((m) => m.b.workouts), color: INK.success }
      ];
      const cCal = [
        { name: String(year), values: cmp.months.map((m) => m.a.calories), color: INK.accent },
        { name: String(compareYear), values: cmp.months.map((m) => m.b.calories), color: INK.success }
      ];
      let yy = 110;
      chartFrame("Workouts per month", M, yy, CW, 180, cLabels, cWk);
      yy += 230;
      chartFrame("Calories per month", M, yy, CW, 180, cLabels, cCal);
    }

    /* ---------------- page 4: measurements ---------------- */

    const mTypes = [...new Set(Focus.Store.measurements.filter((m) => m.date.slice(0, 4) === String(year)).map((m) => m.type))];
    const seriesList = mTypes.map((t) => ({
      type: t,
      pts: Focus.Store.measurements.filter((m) => m.type === t && m.date.slice(0, 4) === String(year))
        .sort((a, b) => a.date < b.date ? -1 : 1)
        .map((m) => ({ date: m.date, value: m.value, unit: m.unit }))
    })).filter((s) => s.pts.length >= 2);

    if (seriesList.length) {
      newPage("Measurements — " + year, "Trends for the measurements you recorded this year");
      const colors = [INK.accent, INK.success, INK.warn, INK.info, INK.accent2];
      let yy = 110;
      seriesList.forEach((s, i) => {
        const labelsM = s.pts.map((p) => p.date.slice(5).replace("-", "/"));
        lineChart(s.type + (s.pts[s.pts.length - 1].unit ? " (" + s.pts[s.pts.length - 1].unit + ")" : ""),
          M, yy, CW, 160, labelsM, s.pts.map((p) => p.value), colors[i % colors.length], "");
        yy += 210;
      });
    }

    const blob = doc.output("blob");
    const filename = "focus-report-" + year + (compareYear ? "-vs-" + compareYear : "") + ".pdf";
    return { blob, filename };
  }

  window.Focus = window.Focus || {};
  window.Focus.Pdf = { exportPdf };
})();
