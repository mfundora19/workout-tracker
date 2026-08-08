/* =========================================================================
 * Focus.Pdf — local PDF "Progress & Analytics Report" builder (jsPDF bundled)
 * -------------------------------------------------------------------------
 * Data flow:  raw records -> Focus.Stats (metrics + insights engine)
 *             -> this presentation layer -> a polished, paginated PDF.
 *
 * The renderer never computes analytics itself: it consumes the structured
 * insights produced by Focus.Stats (volumeInsights, monthlyInsights,
 * comparisonInsights, measurementInsights, consistencyInsights, execSummary,
 * keyTakeaways) and only draws them. Statements are therefore always backed
 * by the data — no sentences are invented here.
 *
 * Layout: a small page-flow engine tracks the current Y cursor. Every block
 * (section, text, KPI card, insight box, chart, table) reserves its height
 * up front via ensure() and is pushed to a continuation page when it would
 * not fit, so content never collides and charts never get clipped.
 *
 * Charts stay vector (jsPDF primitives) so they remain sharp when zoomed.
 * Pass opts.debug = true to receive layout telemetry for tests:
 *   { pages, pageYUsed, warnings, elements }
 * ========================================================================= */
(function () {
  "use strict";
  const S = window.Focus.Stats;

  const INK = {
    dark: "#1E2233", accent: "#6366F1", accent2: "#8B5CF6",
    success: "#10B981", warn: "#F59E0B", danger: "#EF4444", info: "#0EA5E9",
    muted: "#6B7280", light: "#EEF0F8", grid: "#E5E7F0", white: "#FFFFFF"
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

  // Bundled Unicode font (DejaVu Sans) makes symbols/emoji-like glyphs and
  // proper dashes/quotes render; without it we fall back to built-in helvetica.
  const USE_FONT = !!(window.FocusFonts && window.FocusFonts.dejavu_sans && window.FocusFonts.dejavu_sans_bold);
  const FONT = "FocusUI";
  // Code points DejaVu Sans actually contains, beyond ASCII + Latin-1 basics.
  const SAFE_POINTS = new Set([0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2190, 0x2191, 0x2192, 0x2193, 0x2605, 0x2713, 0x2717, 0x26A0, 0x2665, 0x25C6]);

  /**
   * Strip anything the active font cannot render (emoji without a glyph would
   * print as a hollow box). Keeps ASCII + the Latin-1 basics + the safe symbol
   * set; normalises curly quotes to straight ones when the font is unavailable.
   */
  function pdfSafe(t) {
    let s = String(t == null ? "" : t);
    if (!USE_FONT) {
      s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
    }
    let out = "";
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if ((c >= 0x20 && c <= 0x7E) || c === 0xA9 || c === 0xAE || c === 0xB0 || c === 0xB7 ||
          (USE_FONT && SAFE_POINTS.has(c))) {
        out += ch;
      }
    }
    return out;
  }

  function toneColor(tone) {
    return tone === "positive" ? INK.success
      : tone === "negative" ? INK.danger
      : tone === "warn" ? INK.warn
      : tone === "info" ? INK.info
      : tone === "accent" ? INK.accent
      : tone === "accent2" ? INK.accent2
      : INK.muted;
  }

  /**
   * Build the report. Returns { blob, filename } (never downloads itself).
   * opts: { year, compareYear, debug }
   */
  function exportPdf(opts = {}) {
    const jsPDF = window.jspdf.jsPDF;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    // Embed the bundled Unicode font when available (symbols, dashes, quotes).
    if (USE_FONT) {
      try {
        doc.addFileToVFS("DejaVuSans.ttf", window.FocusFonts.dejavu_sans);
        doc.addFont("DejaVuSans.ttf", FONT, "normal");
        doc.addFileToVFS("DejaVuSans-Bold.ttf", window.FocusFonts.dejavu_sans_bold);
        doc.addFont("DejaVuSans-Bold.ttf", FONT, "bold");
      } catch (e) {
        // fall back to the built-in helvetica family
      }
    }
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 44;
    const CW = W - M * 2;
    const FOOTER_H = 64;
    const debug = opts.debug === true;

    /* ---------------- page-flow engine ---------------- */

    let page = 1;
    let y = 0;
    let curTitle = "", curSub = "";
    const pageYUsed = [0];
    const warnings = [];
    const elements = [];

    function track(x, yy, w, h, name) {
      if (!debug) return;
      elements.push({ page, x: Math.round(x), y: Math.round(yy), w: Math.round(w), h: Math.round(h), name });
      if (x < -0.5 || yy < -0.5 || x + w > W + 0.5 || yy + h > H + 0.5) {
        warnings.push("overflow: " + name + " (page " + page + ") box=[" + Math.round(x) + "," + Math.round(yy) + "," + Math.round(w) + "," + Math.round(h) + "]");
      }
    }

    function header(title, sub) {
      doc.setFillColor(...hexToRgb(INK.dark));
      doc.rect(0, 0, W, 62, "F");
      doc.setFont(FONT, "bold");
      doc.setFontSize(17);
      doc.setTextColor(255, 255, 255);
      doc.text(pdfSafe(title), M, 38);
      doc.setFont(FONT, "normal");
      doc.setFontSize(9);
      doc.setTextColor(185, 190, 210);
      doc.text(pdfSafe(sub), M, 52);
      doc.setFillColor(...hexToRgb(INK.accent));
      doc.rect(0, 62, W, 2.5, "F");
    }

    function footer() {
      doc.setFontSize(8);
      doc.setTextColor(...hexToRgb(INK.muted));
      doc.text("Focus - generated locally on this device", M, H - 22);
      doc.text("Page " + page, W - M, H - 22, { align: "right" });
    }

    /** Start a new page with the standard band. */
    function beginPage(title, sub) {
      doc.addPage();
      page++;
      header(title, sub);
      footer();
      y = 116;
      curTitle = title;
      curSub = sub;
      pageYUsed[page] = y;
    }

    /** Move to a continuation page if `h` does not fit below the cursor. */
    function ensure(h) {
      if (y + h > H - FOOTER_H) {
        beginPage(curTitle, curSub + "  -  continued");
      }
    }

    function wrap(text, maxW) {
      return doc.splitTextToSize(pdfSafe(text), maxW);
    }

    /** Finalize the document: telemetry + blob + filename. */
    function finish() {
      // Real per-page usage comes from the drawn elements, not the start-of-page
      // cursor (which only records 116 at each beginPage).
      const perPageMax = {};
      elements.forEach((e) => {
        perPageMax[e.page] = Math.max(perPageMax[e.page] || 0, e.y + e.h);
      });
      const pageYUsedOut = [];
      for (let p = 1; p <= page; p++) pageYUsedOut.push(Math.round(perPageMax[p] || 0));
      pageYUsedOut.forEach((used, i) => {
        if (used > H - FOOTER_H + 1) {
          warnings.push("page " + (i + 1) + " content reached y=" + used + " (limit " + Math.round(H - FOOTER_H) + ")");
        }
      });
      const blob = doc.output("blob");
      const filename = "focus-report-" + year + (compareYear ? "-vs-" + compareYear : "") + ".pdf";
      const result = { blob, filename };
      if (debug) {
        result.debug = {
          pages: page,
          pageYUsed: pageYUsedOut,
          maxYUsed: Math.max(...pageYUsedOut),
          warnings,
          elements
        };
      }
      return result;
    }

    /* ---------------- reusable blocks ---------------- */

    function addSection(num, title, sub) {
      ensure(60);
      doc.setFillColor(...hexToRgb(INK.accent));
      doc.roundedRect(M, y, 22, 22, 4, 4, "F");
      doc.setFont(FONT, "bold");
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text(String(num), M + 11, y + 15, { align: "center" });
      doc.setFontSize(14);
      doc.setTextColor(...hexToRgb(INK.dark));
      doc.text(pdfSafe(title), M + 32, y + 15);
      if (sub) {
        doc.setFont(FONT, "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...hexToRgb(INK.muted));
        doc.text(pdfSafe(sub), M + 32, y + 28);
      }
      doc.setDrawColor(...hexToRgb(INK.grid));
      doc.setLineWidth(0.8);
      doc.line(M, y + 40, M + CW, y + 40);
      track(M, y, CW, 46, "section:" + num);
      y += 54;
    }

    function addText(text, o = {}) {
      const size = o.size || 9.5;
      const leading = o.leading || 1.45;
      const maxW = o.maxW || CW;
      const x = o.x == null ? M : o.x;
      const lines = wrap(text, maxW);
      const lh = size * leading;
      ensure(lines.length * lh + 4);
      doc.setFont(FONT, o.bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.setTextColor(...hexToRgb(o.color || INK.dark));
      doc.text(lines, x, y + size);
      track(x, y, maxW, lines.length * lh, "text:" + String(text).slice(0, 24));
      y += lines.length * lh + 4;
      return lines.length;
    }

    // Emoji-like glyphs (DejaVu) shown beside each insight, by tone.
    const INS_ICON = { positive: "\u2713", warn: "\u26A0", negative: "\u2717", info: "\u2192", neutral: "\u2022", accent: "\u2605", accent2: "\u2605" };

    /** A slim block: colored accent bar, tone icon, bold title line, wrapped body. */
    function addInsight(ins, o = {}) {
      const tc = toneColor(ins.tone);
      const titleSize = o.titleSize || 9;
      const bodySize = o.bodySize || 8.5;
      const maxW = (o.maxW || CW) - 32;
      const bodyLines = wrap(ins.body, maxW);
      const titleH = titleSize * 1.4;
      const bodyH = bodyLines.length * bodySize * 1.45;
      const pad = 12;
      const h = pad + titleH + bodyH + pad;
      ensure(h);
      doc.setFillColor(...hexToRgb(INK.light));
      doc.roundedRect(M, y, CW, h, 5, 5, "F");
      doc.setFillColor(...hexToRgb(tc));
      doc.roundedRect(M, y, 3.5, h, 1.75, 1.75, "F");
      const icon = USE_FONT ? (INS_ICON[ins.tone] || "") : "";
      const titleBaseline = y + pad + titleSize * 0.9;
      doc.setFont(FONT, "bold");
      doc.setFontSize(titleSize);
      let tx = M + 14;
      if (icon) {
        doc.setTextColor(...hexToRgb(tc));
        doc.text(icon, tx, titleBaseline);
        tx += doc.getTextWidth(icon) + 5;
      }
      doc.setTextColor(...hexToRgb(INK.dark));
      doc.text(pdfSafe(String(ins.title)), tx, titleBaseline);
      doc.setFont(FONT, "normal");
      doc.setFontSize(bodySize);
      doc.setTextColor(...hexToRgb(INK.muted));
      doc.text(bodyLines, M + 14, y + pad + titleH + bodySize);
      track(M, y, CW, h, "insight:" + ins.type + ":" + String(ins.metric));
      y += h + 9;
      return h;
    }

    /** Small card: value (+unit), optional delta, label. Used in 2/4-col grids. */
    function drawKpiCard(x, yy, w, h, it) {
      doc.setFillColor(...hexToRgb(INK.light));
      doc.roundedRect(x, yy, w, h, 6, 6, "F");
      doc.setFillColor(...hexToRgb(it.tone ? toneColor(it.tone) : INK.accent));
      doc.roundedRect(x, yy, 3, h, 1.5, 1.5, "F");
      // value + unit on one line
      doc.setFont(FONT, "bold");
      doc.setFontSize(13);
      doc.setTextColor(...hexToRgb(INK.dark));
      const vx = x + 12;
      doc.text(pdfSafe(String(it.value)), vx, yy + 21);
      let vw = doc.getTextWidth(pdfSafe(String(it.value)));
      if (it.unit) {
        doc.setFont(FONT, "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...hexToRgb(INK.muted));
        doc.text(pdfSafe(String(it.unit)), vx + vw + 5, yy + 20);
      }
      // delta (comparison) line
      if (it.delta) {
        const dcol = it.delta.tone === "pos" ? INK.success : it.delta.tone === "neg" ? INK.danger : INK.muted;
        doc.setFont(FONT, "bold");
        doc.setFontSize(7);
        doc.setTextColor(...hexToRgb(dcol));
        doc.text(pdfSafe(it.delta.text), vx, yy + 33);
      }
      // label
      doc.setFont(FONT, "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...hexToRgb(INK.muted));
      doc.text(pdfSafe(String(it.label)), vx, yy + 47);
      track(x, yy, w, h, "kpi:" + String(it.label));
    }

    /** One row of 2-col KPI cards. */
    function addKpiRow(items) {
      const w = (CW - 14) / 2;
      const h = 54;
      ensure(h + 14);
      items.forEach((it, i) => drawKpiCard(M + (i % 2) * (w + 14), y, w, h, it));
      y += h + 14;
    }

    /** One row of 4-col KPI cards. */
    function addKpiQuad(items) {
      const gap = 12;
      const w = (CW - gap * 3) / 4;
      const h = 58;
      ensure(h + 12);
      items.forEach((it, i) => drawKpiCard(M + i * (w + gap), y, w, h, it));
      y += h + 12;
    }

    function addTable(headers, rows, opts = {}) {
      const widths = opts.widths || headers.map(() => CW / headers.length);
      const align = opts.align || headers.map(() => "left");
      const rowH = 15;
      const totalW = widths.reduce((a, b) => a + b, 0);
      const h = rowH * (rows.length + 1) + 4;
      ensure(h);
      const x = M + (CW - totalW) / 2;
      doc.setFillColor(...hexToRgb(INK.dark));
      doc.rect(x, y, totalW, rowH, "F");
      doc.setFont(FONT, "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      let cx = x;
      headers.forEach((hd, i) => {
        doc.text(pdfSafe(hd), align[i] === "right" ? cx + widths[i] - 8 : cx + 8, y + rowH - 5,
          align[i] === "right" ? { align: "right" } : undefined);
        cx += widths[i];
      });
      rows.forEach((row, ri) => {
        const yy = y + rowH * (ri + 1);
        if (ri % 2 === 1) {
          doc.setFillColor(...hexToRgb(INK.light));
          doc.rect(x, yy, totalW, rowH, "F");
        }
        doc.setFont(FONT, "normal");
        doc.setFontSize(8);
        doc.setTextColor(...hexToRgb(INK.dark));
        cx = x;
        row.forEach((cell, i) => {
          doc.text(pdfSafe(String(cell)), align[i] === "right" ? cx + widths[i] - 8 : cx + 8, yy + rowH - 5,
            align[i] === "right" ? { align: "right" } : undefined);
          cx += widths[i];
        });
        doc.setDrawColor(...hexToRgb(INK.grid));
        doc.setLineWidth(0.4);
        doc.line(x, yy, x + totalW, yy);
      });
      doc.setDrawColor(...hexToRgb(INK.grid));
      doc.setLineWidth(0.8);
      doc.line(x, y + rowH * (rows.length + 1), x + totalW, y + rowH * (rows.length + 1));
      track(x, y, totalW, h, "table:" + String(headers[0]));
      y += h + 10;
    }

    /**
     * Reserve space for a chart (title + plot + caption), draw it, and keep
     * the caption attached. `render(x, y, w, h)` draws the chart with its
     * own title inside the reserved block.
     */
    function addChart(render, height, caption) {
      const capLines = caption ? wrap(caption, CW - 24).length : 0;
      const capH = capLines ? capLines * 9.5 * 1.4 + 18 : 0;
      const total = 26 + height + capH;
      ensure(total);
      render(M, y + 26, CW, height);
      y += 26 + height + 6;
      if (caption) {
        // The caption is presented as an "analyst note": a tinted box under the
        // chart so the commentary never collides with the plot or the next block.
        const lines = wrap(caption, CW - 24);
        const boxH = lines.length * 9.5 * 1.4 + 16;
        doc.setFillColor(...hexToRgb(INK.light));
        doc.roundedRect(M, y, CW, boxH, 4, 4, "F");
        doc.setFillColor(...hexToRgb(INK.accent));
        doc.roundedRect(M, y, 2.5, boxH, 1.25, 1.25, "F");
        doc.setFont(FONT, "normal");
        doc.setFontSize(8);
        doc.setTextColor(...hexToRgb(INK.muted));
        doc.text(lines, M + 12, y + 13 + 8);
        y += boxH + 8;
      }
      return total;
    }

    /* ---------------- charts ---------------- */

    function barChart(x, y, w, h, labels, series, opts = {}) {
      const title = opts.title || "";
      const unit = opts.unit || "";
      const max = Math.max(1, ...series.flatMap((s) => s.values).filter((v) => v != null && isFinite(v)));
      const nice = niceMax(max);
      const n = labels.length;
      const groupW = w / n;
      const barW = Math.max(2.5, Math.min(16, (groupW - 6) / series.length));
      const yBase = y + h;

      doc.setFont(FONT, "bold");
      doc.setFontSize(10);
      doc.setTextColor(...hexToRgb(INK.dark));
      doc.text(pdfSafe(title), x, y - 8);
      if (unit) {
        doc.setFont(FONT, "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...hexToRgb(INK.muted));
        doc.text(pdfSafe(unit), x + w, y - 14, { align: "right" });
      }
      let lx = x + w;
      doc.setFont(FONT, "normal");
      doc.setFontSize(7.5);
      if (series.length > 1) series.slice().reverse().forEach((s) => {
        const tw = doc.getTextWidth(pdfSafe(s.name));
        lx -= tw;
        doc.setTextColor(...hexToRgb(INK.muted));
        doc.text(pdfSafe(s.name), lx, y - 14, { align: "right" });
        lx -= 12;
        doc.setFillColor(...hexToRgb(s.color));
        doc.rect(lx, y - 18, 7, 7, "F");
        lx -= 8;
      });

      doc.setDrawColor(...hexToRgb(INK.grid));
      doc.setLineWidth(0.5);
      doc.setFontSize(7);
      doc.setTextColor(...hexToRgb(INK.muted));
      for (let i = 0; i <= 4; i++) {
        const yy = yBase - (h * i) / 4;
        doc.line(x, yy, x + w, yy);
        doc.text(compact((nice * i) / 4), x - 4, yy + 2, { align: "right" });
      }

      series.forEach((s, si) => {
        doc.setFillColor(...hexToRgb(s.color));
        s.values.forEach((v, i) => {
          if (v == null || !isFinite(v) || v <= 0) return;
          const bh = Math.max(1.5, (v / nice) * h);
          const groupCx = x + i * groupW + groupW / 2;
          const total = series.length * barW + (series.length - 1) * 3;
          const bx = groupCx - total / 2 + si * (barW + 3);
          doc.roundedRect(bx, yBase - bh, barW, bh, 1.5, 1.5, "F");
        });
      });

      const every = n > 26 ? 4 : n > 13 ? 3 : n > 8 ? 2 : 1;
      doc.setFontSize(7);
      doc.setTextColor(...hexToRgb(INK.muted));
      labels.forEach((lb, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        doc.text(pdfSafe(String(lb)), x + i * groupW + groupW / 2, yBase + 11, { align: "center" });
      });
      track(x, y - 22, w, h + 24, "bar:" + String(title));
    }

    function lineChart(x, y, w, h, labels, series, opts = {}) {
      const title = opts.title || "";
      const unit = opts.unit || "";
      const max = Math.max(1, ...series.flatMap((s) => s.values).filter((v) => v != null && isFinite(v)));
      const nice = niceMax(max);
      const n = labels.length;
      const yBase = y + h;

      doc.setFont(FONT, "bold");
      doc.setFontSize(10);
      doc.setTextColor(...hexToRgb(INK.dark));
      doc.text(pdfSafe(title), x, y - 8);
      if (unit) {
        doc.setFont(FONT, "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...hexToRgb(INK.muted));
        doc.text(pdfSafe(unit), x + w, y - 14, { align: "right" });
      }
      let lx = x + w;
      doc.setFont(FONT, "normal");
      doc.setFontSize(7.5);
      if (series.length > 1) series.slice().reverse().forEach((s) => {
        const tw = doc.getTextWidth(pdfSafe(s.name));
        lx -= tw;
        doc.setTextColor(...hexToRgb(INK.muted));
        doc.text(pdfSafe(s.name), lx, y - 14, { align: "right" });
        lx -= 12;
        doc.setFillColor(...hexToRgb(s.color));
        doc.rect(lx, y - 18, 7, 7, "F");
        lx -= 8;
      });

      doc.setDrawColor(...hexToRgb(INK.grid));
      doc.setLineWidth(0.5);
      doc.setFontSize(7);
      doc.setTextColor(...hexToRgb(INK.muted));
      for (let i = 0; i <= 4; i++) {
        const yy = yBase - (h * i) / 4;
        doc.line(x, yy, x + w, yy);
        doc.text(compact((nice * i) / 4), x - 4, yy + 2, { align: "right" });
      }

      series.forEach((s) => {
        const pts = s.values.map((v, i) => [
          x + (n === 1 ? w / 2 : (i * w) / (n - 1)),
          yBase - (Math.max(0, v == null ? 0 : Number(v)) / nice) * h
        ]);
        if (pts.length > 1) {
          const startX = pts[0][0], startY = yBase;
          const area = [[0, pts[0][1] - startY]];
          for (let i = 1; i < pts.length; i++) area.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
          area.push([0, yBase - pts[pts.length - 1][1]]);
          doc.setFillColor(...hexToRgb(s.color), 0.12);
          doc.lines(area, startX, startY, [1, 1], "F", true);
          const line = pts.slice(1).map(([px, py], i) => [px - pts[i][0], py - pts[i][1]]);
          doc.setDrawColor(...hexToRgb(s.color));
          doc.setLineWidth(1.4);
          doc.setLineCap("round");
          doc.lines(line, pts[0][0], pts[0][1], [1, 1], "S");
          doc.setLineCap("butt");
        }
        if (n <= 12) {
          doc.setFillColor(...hexToRgb(s.color));
          pts.forEach((p) => doc.circle(p[0], p[1], 1.6, "F"));
        }
      });

      const every = n > 26 ? 4 : n > 13 ? 3 : n > 8 ? 2 : 1;
      doc.setFontSize(7);
      doc.setTextColor(...hexToRgb(INK.muted));
      labels.forEach((lb, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        doc.text(pdfSafe(String(lb)), x + (n === 1 ? w / 2 : (i * w) / (n - 1)), yBase + 11, { align: "center" });
      });
      track(x, y - 22, w, h + 24, "line:" + String(title));
    }

    /** Donut (with center total + right legend) for composition data. */
    function donutChart(x, cy, r, slices, opts = {}) {
      const total = slices.reduce((s, sl) => s + sl.value, 0);
      if (!total) return;
      const rIn = r * 0.62;
      const seg = 18;
      let a0 = -Math.PI / 2;
      slices.forEach((sl) => {
        const a1 = a0 + (sl.value / total) * Math.PI * 2;
        const pts = [];
        for (let i = 0; i <= seg; i++) {
          const a = a0 + ((a1 - a0) * i) / seg;
          pts.push([x + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
        for (let i = seg; i >= 0; i--) {
          const a = a0 + ((a1 - a0) * i) / seg;
          pts.push([x + rIn * Math.cos(a), cy + rIn * Math.sin(a)]);
        }
        const segs = [];
        for (let i = 1; i < pts.length; i++) segs.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
        doc.setFillColor(...hexToRgb(sl.color));
        doc.lines(segs, pts[0][0], pts[0][1], [1, 1], "F", true);
        a0 = a1;
      });
      doc.setFont(FONT, "bold");
      doc.setFontSize(11);
      doc.setTextColor(...hexToRgb(INK.dark));
      doc.text(String(total), x, cy - 2, { align: "center" });
      doc.setFont(FONT, "normal");
      doc.setFontSize(7);
      doc.setTextColor(...hexToRgb(INK.muted));
      doc.text(pdfSafe(opts.centerLabel || "sessions"), x, cy + 8, { align: "center" });

      let ly = cy - r + 5;
      doc.setFontSize(7.5);
      slices.forEach((sl) => {
        doc.setFillColor(...hexToRgb(sl.color));
        doc.rect(x + r + 18, ly - 5, 7, 7, "F");
        doc.setFont(FONT, "normal");
        doc.setTextColor(...hexToRgb(INK.dark));
        doc.text(pdfSafe(sl.label), x + r + 30, ly);
        const pct = Math.round((sl.value / total) * 100);
        doc.setTextColor(...hexToRgb(INK.muted));
        doc.text(pct + "%", x + r + 30 + doc.getTextWidth(pdfSafe(sl.label)) + 8, ly);
        ly += 13;
      });
      track(x - r, cy - r, r * 2, r * 2, "donut");
    }

    /** Year activity heatmap: weeks x days (Mon-Sun), colored by intensity. */
    function heatmapChart(x, y, w, h, grid, opts = {}) {
      const nW = grid.weeks.length;
      const cellW = w / nW;
      const cellH = 8.5;
      const levels = [
        [238, 240, 248],
        [199, 210, 254],
        [165, 180, 252],
        [129, 140, 248],
        [99, 102, 241]
      ];
      doc.setFont(FONT, "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...hexToRgb(INK.muted));
      grid.monthAtWeek.forEach((m, wi) => {
        if (m && (!grid.monthAtWeek[wi - 1] || grid.monthAtWeek[wi - 1].month !== m.month)) {
          doc.text(m.label, x + wi * cellW + cellW / 2, y - 4, { align: "center" });
        }
      });
      grid.weeks.forEach((week, wi) => {
        week.forEach((cell, di) => {
          if (!cell) return;
          const cx = x + wi * cellW + cellW / 2 - 3.4;
          const cyy = y + di * (cellH + 1.6) + cellH / 2 - 3.4;
          doc.setFillColor(...levels[cell.level]);
          doc.roundedRect(cx, cyy, 6.8, 6.8, 1.2, 1.2, "F");
        });
      });
      doc.setFont(FONT, "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...hexToRgb(INK.muted));
      const legendY = y + 7 * (cellH + 1.6) + 10;
      doc.text("Less", x, legendY + 6);
      let lx = x + 18;
      levels.forEach((c) => {
        doc.setFillColor(...c);
        doc.rect(lx, legendY, 7, 7, "F");
        lx += 11;
      });
      doc.text("More", lx + 2, legendY + 6);
      track(x, y - 10, w, 7 * (cellH + 1.6) + 22, "heatmap");
    }

    /* ---------------- data prep ---------------- */

    const workouts = Focus.Store.workouts;
    const measurements = Focus.Store.measurements;
    const years = S.availableYears(workouts, measurements);
    const year = opts.year || S.yearOf(S.todayISO());
    // A comparison year is only meaningful when it actually contains workouts;
    // otherwise the comparison section would be an empty placeholder.
    const compareYear = opts.compareYear && opts.compareYear !== year && years.includes(opts.compareYear) &&
      workouts.some((w) => S.yearOf(w.date) === opts.compareYear) ? opts.compareYear : null;
    const cmp = compareYear ? S.compareYears(workouts, year, compareYear) : null;
    const ys = S.yearlyStats(workouts, year);
    const ms = S.monthlyStats(workouts, year);
    const st = S.streaks(workouts, S.todayISO());
    const labels = ms.map((m) => m.label);
    const hasData = ys.workouts > 0;

    const kpiDelta = (row, fmt) => {
      if (!row || (row.a === 0 && row.b === 0)) return null;
      const pct = S.pctChange(row.a, row.b);
      const diff = row.a - row.b;
      if (diff === 0) return { text: "unchanged", tone: "flat" };
      const sign = diff > 0 ? "+" : "";
      const text = pct != null && pct !== 0 ? sign + Math.round(pct) + "% vs " + compareYear : sign + fmt(diff);
      return { text, tone: diff > 0 ? "pos" : "neg" };
    };

    /* ================= PAGE 1 — COVER ================= */

    doc.setFillColor(...hexToRgb(INK.dark));
    doc.rect(0, 0, W, 205, "F");
    doc.setFillColor(...hexToRgb(INK.accent));
    doc.rect(0, 205, W, 3, "F");
    doc.setFont(FONT, "bold");
    doc.setFontSize(11);
    doc.setTextColor(165, 172, 205);
    doc.text("FOCUS  -  ANNUAL PROGRESS REPORT", M, 46);
    doc.setFontSize(30);
    doc.setTextColor(255, 255, 255);
    doc.text(String(year) + " Progress Report", M, 88);
    doc.setFont(FONT, "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(202, 207, 232);
    doc.text("Workout & Fitness Tracker  -  generated " + S.prettyDate(S.todayISO()), M, 110);
    doc.setFontSize(9);
    doc.setTextColor(180, 186, 216);
    const inYearW = workouts.filter((w) => S.yearOf(w.date) === year);
    if (inYearW.length) {
      const d1 = inYearW.reduce((a, b) => (a.date < b.date ? a : b)).date;
      const d2 = inYearW.reduce((a, b) => (a.date > b.date ? a : b)).date;
      doc.text("Reporting period: " + S.shortDate(d1) + " - " + S.shortDate(d2) + ", " + year, M, 134);
    } else {
      doc.text("Reporting period: January 1 - December 31, " + year, M, 134);
    }
    if (cmp) doc.text("Comparison period: " + compareYear, M, 148);
    doc.setDrawColor(...hexToRgb(INK.accent));
    doc.setLineWidth(1);
    doc.line(M, 176, M + CW, 176);
    track(0, 0, W, 205, "cover-band");
    y = 206;

    // Executive summary paragraphs
    doc.setFont(FONT, "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...hexToRgb(INK.accent));
    doc.text("EXECUTIVE SUMMARY", M, y + 8);
    y += 20;
    const paras = S.execSummary(workouts, measurements, year, compareYear);
    paras.forEach((p) => {
      const bodyLines = wrap(p.body, CW);
      const h = 13 + bodyLines.length * 9.5 * 1.35;
      ensure(h);
      doc.setFont(FONT, "bold");
      doc.setFontSize(9);
      doc.setTextColor(...hexToRgb(INK.dark));
      doc.text(pdfSafe(p.title), M, y + 9);
      doc.setFont(FONT, "normal");
      doc.setFontSize(9);
      doc.setTextColor(...hexToRgb(INK.muted));
      doc.text(bodyLines, M, y + 22);
      y += h;
    });

    if (hasData) {
      y += 4;
      // Four highlight KPIs
      const hs = [
        { label: "Workouts", value: S.fmtNum(ys.workouts), unit: "sessions", delta: cmp ? kpiDelta(cmp.totals.workouts, (d) => d + " sessions") : null, tone: "positive" },
        { label: "Active days", value: S.fmtNum(ys.days), unit: "days", delta: cmp ? kpiDelta(cmp.totals.days, (d) => d + " days") : null, tone: "info" },
        { label: "Calories", value: S.fmtNum(ys.calories), unit: "kcal", delta: cmp ? kpiDelta(cmp.totals.calories, (d) => S.fmtNum(d) + " kcal") : null, tone: "warn" },
        { label: "Duration", value: S.fmtNum(ys.duration), unit: "min", delta: cmp ? kpiDelta(cmp.totals.duration, (d) => S.fmtNum(d) + " min") : null, tone: "accent2" }
      ];
      const gap = 12;
      const w4 = (CW - gap * 3) / 4;
      ensure(64);
      hs.forEach((it, i) => drawKpiCard(M + i * (w4 + gap), y, w4, 56, it));
      y += 68;

      // Key insights (top three)
      const take = S.keyTakeaways(workouts, measurements, year, compareYear).slice(0, 3);
      if (take.length) {
        y += 4;
        doc.setFont(FONT, "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...hexToRgb(INK.accent));
        doc.text("KEY INSIGHTS", M, y + 8);
        y += 16;
        take.forEach((ins) => {
          const bodyLines = wrap(ins.body, CW - 22);
          const h = 9 + bodyLines.length * 8.5 * 1.3;
          ensure(h);
          doc.setFillColor(...hexToRgb(toneColor(ins.tone)));
          doc.circle(M + 4, y + 7, 3, "F");
          doc.setFont(FONT, "bold");
          doc.setFontSize(8.5);
          doc.setTextColor(...hexToRgb(INK.dark));
          doc.text(pdfSafe(String(ins.title)), M + 14, y + 9);
          doc.setFont(FONT, "normal");
          doc.setFontSize(8);
          doc.setTextColor(...hexToRgb(INK.muted));
          doc.text(bodyLines, M + 14, y + 19);
          y += h;
        });
      }
    } else {
      y += 8;
      addText("There is no workout data for " + year + ". Add workouts from the Calendar view and re-export the report.",
        { size: 9, color: INK.muted });
    }
    footer();
    pageYUsed[1] = y;

    /* ================= EMPTY-YEAR SHORT REPORT ================= */

    if (!hasData) {
      beginPage("About this report - " + year, "No workout data yet");
      addSection(1, "About this report", "There is no workout data for " + year);
      addText("This report is generated entirely from your own records - it never estimates or invents numbers. " +
        "Add workouts from the Calendar view (Quick add or a day's panel) and re-export to unlock the full analysis.",
        { size: 9, color: INK.muted });
      y += 8;
      addText("A populated report contains:", { size: 9, bold: true, color: INK.dark });
      [
        "Executive Summary - a narrative reading of the year",
        "Key Performance Indicators - headline metrics with year-over-year context",
        "Progress Analysis - monthly charts with written interpretation",
        "Monthly Performance - one compact table of every month",
        "Year-over-Year - comparison with a previous year when it has data",
        "Measurements - body measurement trends, kept neutral",
        "Consistency & Streaks - a full-year activity heatmap",
        "Key Takeaways - the most important insights to remember"
      ].forEach((t) => {
        ensure(16);
        doc.setFillColor(...hexToRgb(INK.accent));
        doc.circle(M + 4, y + 6, 1.8, "F");
        addText(t, { size: 8.5, color: INK.dark, maxW: CW - 16, x: M + 14 });
      });
      footer();
      pageYUsed[page] = y;
      return finish();
    }

    /* ================= SECTION 1 — EXECUTIVE SUMMARY ================= */

    beginPage("Executive Summary - " + year, "What the numbers mean, in plain language");
    addSection(1, "Executive Summary", "A narrative reading of your training year");
    const vol = S.volumeInsights(workouts, year);
    const cons = S.consistencyInsights(workouts, year);
    const meas = S.measurementInsights(measurements, year);
    const mi = S.monthlyInsights(workouts, year);
    {
      addText("This section turns the raw totals into a readable story. Every statement below is computed from your records - nothing is estimated or assumed.", { size: 8.5, color: INK.muted });
      y += 6;
      if (vol.length) {
        addText("Volume", { size: 9, bold: true, color: INK.dark });
        vol.forEach((i) => addInsight(i));
      }
      if (cons.length) {
        addText("Consistency", { size: 9, bold: true, color: INK.dark });
        cons.forEach((i) => addInsight(i));
      }
      if (mi.length) {
        addText("Month by month", { size: 9, bold: true, color: INK.dark });
        mi.slice(0, 3).forEach((i) => addInsight(i));
      }
      if (meas.length) {
        addText("Body measurements", { size: 9, bold: true, color: INK.dark });
        meas.slice(0, 3).forEach((i) => addInsight(i));
      }
    }

    /* ================= SECTION 2 — KEY PERFORMANCE INDICATORS ================= */

    beginPage("Key Performance Indicators - " + year, "Headline metrics with year-over-year context where available");
    addSection(2, "Key Performance Indicators", hasData ? "Your headline numbers for " + year : "Headline numbers");
    if (!hasData) {
      addText("No workout data for " + year + ".");
    } else {
      addKpiQuad([
        { label: "Workouts", value: S.fmtNum(ys.workouts), unit: "sessions", delta: cmp ? kpiDelta(cmp.totals.workouts, (d) => d + " sessions") : null, tone: "accent" },
        { label: "Active days", value: S.fmtNum(ys.days), unit: "days", delta: cmp ? kpiDelta(cmp.totals.days, (d) => d + " days") : null, tone: "info" },
        { label: "Total calories", value: S.fmtNum(ys.calories), unit: "kcal", delta: cmp ? kpiDelta(cmp.totals.calories, (d) => S.fmtNum(d) + " kcal") : null, tone: "warn" },
        { label: "Total duration", value: S.fmtNum(ys.duration), unit: "min", delta: cmp ? kpiDelta(cmp.totals.duration, (d) => S.fmtNum(d) + " min") : null, tone: "accent2" }
      ]);
      addKpiQuad([
        { label: "Avg calories / workout", value: ys.workouts ? S.fmtNum(Math.round(ys.avgCal)) : "—", unit: "kcal", tone: "success" },
        { label: "Avg duration / workout", value: ys.workouts ? S.fmtNum(Math.round(ys.avgDur)) : "—", unit: "min", tone: "success" },
        { label: "Current streak", value: st.current, unit: "days", tone: "info" },
        { label: "Longest streak", value: ys.longestStreak, unit: "days", tone: "info" }
      ]);
      y += 2;
      addText(compareYear
        ? "Changes are shown against " + compareYear + " when a comparison year with data was selected."
        : "No comparison year was available, so changes are not shown.",
        { size: 7.5, color: INK.muted });
      // Training mix (composition)
      const tb = S.typeBreakdown(workouts, year);
      if (tb.length) {
        y += 10;
        const donutColors = [INK.accent, INK.success, INK.info, INK.warn, INK.accent2, INK.danger, INK.muted];
        const top = tb.slice(0, 6);
        const rest = tb.slice(6);
        const slices = top.map((t, i) => ({ label: t.type, value: t.count, color: donutColors[i % donutColors.length] }));
        if (rest.length) slices.push({ label: "Other", value: rest.reduce((s, t) => s + t.count, 0), color: INK.muted });
        const donutH = 130;
        ensure(donutH);
        doc.setFont(FONT, "bold");
        doc.setFontSize(10);
        doc.setTextColor(...hexToRgb(INK.dark));
        doc.text("Training mix by session count", M, y + 8);
        donutChart(M + 92, y + 74, 46, slices, { centerLabel: "sessions" });
        y += donutH;
        const topType = tb[0];
        if (topType) {
          addText(topType.type + " was your most common training type (" + Math.round(topType.pct) + "% of type mentions).",
            { size: 8.5, color: INK.muted, italic: true });
        }
      }
    }

    /* ================= SECTION 3 — PROGRESS ANALYSIS ================= */

    beginPage("Progress Analysis - " + year, "Monthly trends for workouts, calories and duration");
    addSection(3, "Progress Analysis", "How your training evolved month by month");
    if (!hasData) {
      addText("Not enough data to chart a monthly trend for " + year + ".");
    } else {
      const caps = S.chartCaptions(workouts, year);
      addChart((x, yy, w, h) => barChart(x, yy, w, h, labels,
        [{ name: "Workouts", values: ms.map((m) => m.workouts), color: INK.accent }],
        { title: "Workouts per month", unit: "sessions" }), 170, caps.workouts || null);
      addChart((x, yy, w, h) => barChart(x, yy, w, h, labels,
        [{ name: "kcal", values: ms.map((m) => m.calories), color: INK.success }],
        { title: "Calories per month", unit: "kcal" }), 170, caps.calories || null);
      addChart((x, yy, w, h) => barChart(x, yy, w, h, labels,
        [{ name: "min", values: ms.map((m) => m.duration), color: INK.info }],
        { title: "Training time per month", unit: "minutes" }), 170, caps.duration || null);
      const sig = S.monthlyInsights(workouts, year);
      if (sig.length) {
        y += 4;
        addText("Month-by-month signals", { size: 9, bold: true, color: INK.dark });
        sig.forEach((i) => addInsight(i));
      }
    }

    /* ================= SECTION 4 — MONTHLY PERFORMANCE ================= */

    beginPage("Monthly Performance - " + year, "One compact view of every month");
    addSection(4, "Monthly Performance", "Workouts, active days, calories and duration by month");
    if (!hasData) {
      addText("Not enough data to build a monthly table for " + year + ".");
    } else {
      addTable(
        ["Month", "Workouts", "Active days", "Calories", "Duration", "Avg / workout"],
        ms.map((m) => [
          m.label,
          m.workouts,
          m.days,
          m.calories ? S.fmtNum(m.calories) : "—",
          m.duration ? S.fmtDuration(m.duration) : "—",
          m.workouts ? Math.round(m.avgCal) + " kcal" : "—"
        ]),
        { widths: [58, 68, 80, 95, 92, 92], align: ["left", "right", "right", "right", "right", "right"] }
      );
      y += 4;
      const sig = S.monthlyInsights(workouts, year);
      if (sig.length) {
        addText("What stands out", { size: 9, bold: true, color: INK.dark });
        sig.forEach((i) => addInsight(i));
      }
    }

    /* ================= SECTION 5 — YEAR OVER YEAR ================= */

    if (cmp) {
      beginPage(year + " vs " + compareYear, "How this year compares with the previous one");
      addSection(5, year + " vs " + compareYear, "Year-over-year comparison by month");
      addKpiQuad([
        { label: "Workouts", value: S.fmtNum(cmp.totals.workouts.a), unit: "vs " + S.fmtNum(cmp.totals.workouts.b), delta: kpiDelta(cmp.totals.workouts, (d) => d + " sessions"), tone: "accent" },
        { label: "Active days", value: S.fmtNum(cmp.totals.days.a), unit: "vs " + S.fmtNum(cmp.totals.days.b), delta: kpiDelta(cmp.totals.days, (d) => d + " days"), tone: "info" },
        { label: "Calories", value: S.fmtNum(cmp.totals.calories.a), unit: "vs " + S.fmtNum(cmp.totals.calories.b), delta: kpiDelta(cmp.totals.calories, (d) => S.fmtNum(d) + " kcal"), tone: "warn" },
        { label: "Duration", value: S.fmtNum(cmp.totals.duration.a), unit: "vs " + S.fmtNum(cmp.totals.duration.b), delta: kpiDelta(cmp.totals.duration, (d) => S.fmtNum(d) + " min"), tone: "accent2" }
      ]);
      const cLabels = cmp.months.map((m) => m.label);
      const cWk = [
        { name: String(year), values: cmp.months.map((m) => m.a.workouts), color: INK.accent },
        { name: String(compareYear), values: cmp.months.map((m) => m.b.workouts), color: INK.success }
      ];
      addChart((x, yy, w, h) => barChart(x, yy, w, h, cLabels, cWk,
        { title: "Workouts per month", unit: "sessions" }), 165, null);
      const cum = [
        { name: String(year), values: cmp.months.map((m) => m.cumA.calories), color: INK.accent },
        { name: String(compareYear), values: cmp.months.map((m) => m.cumB.calories), color: INK.success }
      ];
      addChart((x, yy, w, h) => lineChart(x, yy, w, h, cLabels, cum,
        { title: "Cumulative calories", unit: "kcal" }), 165, null);
      const cin = S.comparisonInsights(workouts, cmp);
      if (cin.length) {
        y += 2;
        addText("Reading the comparison", { size: 9, bold: true, color: INK.dark });
        cin.forEach((i) => addInsight(i));
      }
    }

    /* ================= SECTION 6 — MEASUREMENTS ================= */

    const mYear = measurements.filter((m) => m.date.slice(0, 4) === String(year));
    const mStats = S.measurementStats(mYear).filter((s) => s.count >= 2);
    const mSingles = S.measurementStats(mYear).filter((s) => s.count === 1);
    if (mYear.length) {
      beginPage("Measurements - " + year, "Body measurement trends, kept neutral");
      addSection(6, "Measurements", "How your body measurements moved during the year");
      if (!mStats.length && !mSingles.length) {
        addText("No measurement records found for " + year + ".");
      }
      const colors = [INK.accent, INK.success, INK.warn, INK.info, INK.accent2];
      mStats.forEach((s, i) => {
        const pts = s.records;
        const labelsM = pts.map((p) => p.date.slice(5).replace("-", "/"));
        const unit = s.unit ? " " + s.unit : "";
        const delta = Number(s.latest.value) - Number(s.first.value);
        const pct = S.pctChange(s.latest.value, s.first.value);
        const cap = s.type + " " + (delta < -0.0001 ? "decreased" : delta > 0.0001 ? "increased" : "held steady") +
          " from " + S.fmtNum(s.first.value, 1) + unit + " to " + S.fmtNum(s.latest.value, 1) + unit +
          (pct != null && Math.abs(delta) > 0.0001 ? " (" + (delta > 0 ? "+" : "") + Math.round(pct * 10) / 10 + "%)" : "") +
          " across " + s.count + " readings between " + S.shortDate(s.first.date) + " and " + S.shortDate(s.latest.date) + ".";
        const yBefore = y;
        // stat strip
        ensure(46);
        const statW = (CW - 24) / 3;
        const statDefs = [
          { k: "Initial", v: S.fmtNum(s.first.value, 1) + unit },
          { k: "Latest", v: S.fmtNum(s.latest.value, 1) + unit },
          { k: "Change", v: (delta < -0.0001 ? "-" : delta > 0.0001 ? "+" : "") + S.fmtNum(Math.abs(Math.round(delta * 10) / 10), 1) + unit + (pct != null && Math.abs(delta) > 0.0001 ? " (" + (delta > 0 ? "+" : "") + Math.round(pct * 10) / 10 + "%)" : "") }
        ];
        statDefs.forEach((sd, si) => {
          const sx = M + si * (statW + 12);
          doc.setFillColor(...hexToRgb(INK.light));
          doc.roundedRect(sx, yBefore, statW, 40, 5, 5, "F");
          doc.setFont(FONT, "bold");
          doc.setFontSize(10.5);
          doc.setTextColor(...hexToRgb(INK.dark));
          doc.text(pdfSafe(sd.v), sx + 10, yBefore + 17);
          doc.setFont(FONT, "normal");
          doc.setFontSize(7);
          doc.setTextColor(...hexToRgb(INK.muted));
          doc.text(sd.k, sx + 10, yBefore + 30);
        });
        y = yBefore + 40;
        addChart((x, yy, w, h) => lineChart(x, yy, w, h, labelsM,
          [{ name: s.type, values: pts.map((p) => p.value), color: colors[i % colors.length] }],
          { title: s.type + " over time", unit: unit.trim() || undefined }), 140, cap);
        if (i < mStats.length - 1) y += 6;
      });
      if (mSingles.length) {
        y += 2;
        addText(mSingles.map((s) => s.type + " has only one reading in " + year + " (" + S.fmtNum(s.latest.value, 1) + (s.unit ? " " + s.unit : "") + " on " + S.shortDate(s.latest.date) + ") - not enough to chart a trend.").join("  "),
          { size: 8.5, color: INK.muted });
      }
    }

    /* ================= SECTION 7 — CONSISTENCY & STREAKS ================= */

    if (hasData) {
      beginPage("Consistency & Streaks - " + year, "How regularly you trained");
      addSection(7, "Consistency & Streaks", "Frequency, streaks and the rhythm of your year");
      const grid = S.yearActivityGrid(workouts, year);
      const heatH = 116;
      ensure(heatH + 14);
      heatmapChart(M, y + 12, CW, heatH, grid);
      y += heatH + 16;
      const cin = S.consistencyInsights(workouts, year);
      cin.forEach((i) => addInsight(i));
      // extra stat strip
      const totalDays = S.dayOfYear(year + "-12-31");
      const inYear = workouts.filter((w) => S.yearOf(w.date) === year);
      const days = new Set(inYear.map((w) => w.date));
      const avgPerWeek = inYear.length / 52;
      const statW = (CW - 24) / 3;
      const statDefs = [
        { k: "Active days", v: days.size + " of " + totalDays },
        { k: "Avg workouts / week", v: avgPerWeek.toFixed(1) },
        { k: "Longest streak", v: ys.longestStreak + " days" }
      ];
      y += 4;
      ensure(52);
      statDefs.forEach((sd, si) => {
        const sx = M + si * (statW + 12);
        doc.setFillColor(...hexToRgb(INK.light));
        doc.roundedRect(sx, y, statW, 44, 5, 5, "F");
        doc.setFont(FONT, "bold");
        doc.setFontSize(11);
        doc.setTextColor(...hexToRgb(INK.dark));
        doc.text(pdfSafe(sd.v), sx + 10, y + 18);
        doc.setFont(FONT, "normal");
        doc.setFontSize(7);
        doc.setTextColor(...hexToRgb(INK.muted));
        doc.text(sd.k, sx + 10, y + 32);
      });
      y += 56;
      addText("The heatmap shows every training day of the year; darker cells are higher-calorie sessions. The calendar starts on a Monday so each column is one full week.",
        { size: 7.5, color: INK.muted });
    }

    /* ================= SECTION 8 — KEY TAKEAWAYS ================= */

    beginPage("Key Takeaways - " + year, "The most important things to remember");
    addSection(8, "Key Takeaways", "Three to seven insights worth keeping");
    if (!hasData) {
      addText("No data to summarise for " + year + ".");
    } else {
      const take = S.keyTakeaways(workouts, measurements, year, compareYear);
      take.forEach((ins, i) => {
        ensure(46);
        doc.setFillColor(...hexToRgb(toneColor(ins.tone)));
        doc.circle(M + 8, y + 12, 7, "F");
        doc.setFont(FONT, "bold");
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text(String(i + 1), M + 8, y + 15, { align: "center" });
        const bodyLines = wrap(ins.body, CW - 40);
        const h = 12 + bodyLines.length * 8.5 * 1.3;
        doc.setFont(FONT, "bold");
        doc.setFontSize(9);
        doc.setTextColor(...hexToRgb(INK.dark));
        doc.text(pdfSafe(String(ins.title)), M + 26, y + 12);
        doc.setFont(FONT, "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...hexToRgb(INK.muted));
        doc.text(bodyLines, M + 26, y + 24);
        y += h;
      });
      y += 4;
      addText("Report generated locally on this device. All figures are computed from your own records; this report is an estimate of your progress, not a medical assessment.",
        { size: 7.5, color: INK.muted });
    }

    /* ---------------- finish ---------------- */

    return finish();
  }

  window.Focus = window.Focus || {};
  window.Focus.Pdf = { exportPdf };
})();
