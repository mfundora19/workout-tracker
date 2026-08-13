/* =========================================================================
 * Focus.Charts — dependency-free SVG chart library
 * -------------------------------------------------------------------------
 * Charts read their colors from CSS custom properties so light/dark themes
 * need no chart re-configuration. All charts are responsive (viewBox) and
 * expose hover tooltips through a single shared tooltip element.
 * ========================================================================= */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  /* ---------------- helpers ---------------- */

  function el(tag, attrs, children) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    (children || []).forEach((c) => {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  function cssVar(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  /* Draw-in animations are gated by the Settings toggle and reduced-motion. */
  const animsOn = () =>
    !document.documentElement.classList.contains("no-anim") &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function compact(n) {
    if (n == null || !isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (abs >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
    if (abs >= 1e3) return (n / 1e3).toFixed(2).replace(/\.0+$/, "").replace(/\.$/, "") + "k";
    return String(Math.round(n));
  }

  const tooltipEl = () => document.getElementById("chartTooltip");

  function showTip(html, x, y) {
    const t = tooltipEl();
    t.innerHTML = html;
    t.hidden = false;
    t.style.left = "0px";
    t.style.top = "0px";
    const r = t.getBoundingClientRect();
    const pad = 14;
    let tx = x + pad;
    let ty = y - r.height - 10;
    if (tx + r.width > window.innerWidth - 8) tx = x - r.width - pad;
    if (ty < 8) ty = y + pad;
    t.style.left = tx + "px";
    t.style.top = ty + "px";
  }
  function hideTip() {
    const t = tooltipEl();
    if (t) t.hidden = true;
  }

  function bindTip(node, html) {
    node.addEventListener("mousemove", (e) => showTip(html, e.clientX, e.clientY));
    node.addEventListener("mouseleave", hideTip);
  }

  function emptyChart(container, msg) {
    container.innerHTML = '<div class="chart-empty"><span>📭</span><div>' + (msg || "Not enough data to chart yet.") + "</div></div>";
  }

  /* ---------------- bar chart ---------------- */

  /**
   * opts: { labels[], series: [{name, values[], color}], height, unit,
   *         valueFmt(v), yFmt, highlight: [idx...], gridLines: 4 }
   */
  function barChart(container, labels, series, opts = {}) {
    if (!labels.length) { emptyChart(container); return; }
    const H = opts.height || 240;
    const W = 640;
    const pad = { t: 14, r: 8, b: 26, l: 44 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const max = Math.max(1, ...series.flatMap((s) => s.values), 1);
    const nice = niceMax(max);
    const gridLines = 4;
    const n = labels.length;
    const groupW = plotW / n;
    const barGap = 3;
    const barW = Math.min(34, ((groupW - 6) / series.length) - barGap);

    const accent = cssVar("--accent", "#6366f1");
    const accent2 = cssVar("--accent-2", "#8b5cf6");
    const success = cssVar("--success", "#10b981");
    const grid = cssVar("--chart-grid", "#e8eaf3");
    const textFaint = cssVar("--text-faint", "#9499ab");

    const colors = series.map((s, i) => s.color || (i === 0 ? accent : i === 1 ? accent2 : success));
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": series.map((s) => s.name).join(" vs ") });

    // grid + y labels
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.t + plotH - (plotH * i) / gridLines;
      svg.appendChild(el("line", { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: grid, "stroke-width": 1 }));
      const label = compact((nice * i) / gridLines);
      const t = el("text", { x: pad.l - 8, y: y + 4, "text-anchor": "end", "font-size": 10.5, fill: textFaint });
      t.textContent = label;
      svg.appendChild(t);
    }

    // bars
    labels.forEach((lb, i) => {
      series.forEach((s, si) => {
        const v = s.values[i];
        if (v == null) return;
        const bh = Math.max(v > 0 ? 2 : 0, (v / nice) * plotH);
        const x = pad.l + i * groupW + groupW / 2 - (series.length * barW + (series.length - 1) * barGap) / 2 + si * (barW + barGap);
        const y = pad.t + plotH - bh;
        const bar = el("path", {
          d: `M${x} ${y + 5}Q${x} ${y} ${x + 5} ${y}L${x + barW - 5} ${y}Q${x + barW} ${y} ${x + barW} ${y + 5}L${x + barW} ${pad.t + plotH}L${x} ${pad.t + plotH}Z`,
          fill: colors[si],
          opacity: opts.highlight && !opts.highlight.includes(i) ? 0.4 : 0.88,
          style: animsOn() ? `--bd:${Math.min((i + si) * 35, 420)}ms` : ""
        });
        bindTip(bar, tipForSeries(s, lb, v, opts));
        svg.appendChild(bar);
      });
    });
    if (animsOn()) svg.setAttribute("class", "anim-bars");

    // x labels
    const every = n > 24 ? 3 : n > 12 ? 2 : 1;
    labels.forEach((lb, i) => {
      if (i % every !== 0 && i !== n - 1) return;
      const t = el("text", { x: pad.l + i * groupW + groupW / 2, y: H - 8, "text-anchor": "middle", "font-size": 10.5, fill: textFaint });
      t.textContent = String(lb);
      svg.appendChild(t);
    });

    container.innerHTML = "";
    container.appendChild(svg);
  }

  function tipForSeries(s, label, v, opts) {
    const color = s.color || cssVar("--accent");
    const val = (opts.valueFmt || ((x) => x))(v);
    return `<b>${label}</b><div class="row"><span class="sw" style="background:${color}"></span>${s.name}: <strong>${val}</strong></div>`;
  }

  function niceMax(v) {
    if (v <= 5) return 5;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    // Finer steps (1,1.2,1.5,2,2.5,3,4,5,6,8,10) keep the axis close to the
    // data so lines/bars fill the chart instead of hugging the bottom — e.g.
    // 61,000 kcal caps at 80k, not 100k.
    const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    return (steps.find((s) => f <= s) || 10) * p;
  }

  /* ---------------- line / area chart ---------------- */

  /**
   * opts: { height, area: bool, unit, valueFmt, colors[], fillId, yFmt }
   */
  function lineChart(container, labels, series, opts = {}) {
    if (!labels.length) { emptyChart(container); return; }
    const H = opts.height || 240;
    const W = 640;
    const pad = { t: 14, r: 10, b: 26, l: 44 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const max = Math.max(1, ...series.flatMap((s) => s.values).filter((v) => v != null));
    const nice = niceMax(max);
    const n = labels.length;
    const step = plotW / Math.max(1, n - 1);
    const accent = cssVar("--accent", "#6366f1");
    const accent2 = cssVar("--accent-2", "#8b5cf6");
    const success = cssVar("--success", "#10b981");
    const grid = cssVar("--chart-grid", "#e8eaf3");
    const textFaint = cssVar("--text-faint", "#9499ab");

    const colors = series.map((s, i) => s.color || (i === 0 ? accent : i === 1 ? accent2 : success));
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });

    for (let i = 0; i <= 4; i++) {
      const y = pad.t + plotH - (plotH * i) / 4;
      svg.appendChild(el("line", { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: grid, "stroke-width": 1 }));
      const t = el("text", { x: pad.l - 8, y: y + 4, "text-anchor": "end", "font-size": 10.5, fill: textFaint });
      t.textContent = compact((nice * i) / 4);
      svg.appendChild(t);
    }

    const xOf = (i) => pad.l + (n === 1 ? plotW / 2 : i * step);
    const yOf = (v) => pad.t + plotH - (v / nice) * plotH;

    const defs = el("defs", {});
    const hasNull = series.some((s) => s.values.some((v) => v == null));
    series.forEach((s, si) => {
      const gid = "grad-" + (opts.fillId || "chart") + "-" + si;
      const g = el("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
      g.appendChild(el("stop", { offset: "0%", "stop-color": colors[si], "stop-opacity": 0.28 }));
      g.appendChild(el("stop", { offset: "100%", "stop-color": colors[si], "stop-opacity": 0.01 }));
      defs.appendChild(g);
      if (opts.area !== false && !hasNull) {
        const pts = s.values.map((v, i) => `${xOf(i)},${yOf(v)}`);
        const area = el("path", {
          d: `M${xOf(0)},${pad.t + plotH}L${pts.join("L")}L${xOf(n - 1)},${pad.t + plotH}Z`,
          fill: `url(#${gid})`, stroke: "none", class: "area"
        });
        svg.appendChild(area);
      }
    });
    svg.appendChild(defs);

    series.forEach((s, si) => {
      // Split the series at null values so missing data shows a gap,
      // not a NaN path or a misleading dip to zero.
      let seg = [];
      const flush = () => {
        if (!seg.length) return;
        if (seg.length === 1) {
          svg.appendChild(el("circle", { cx: seg[0][0], cy: seg[0][1], r: 4, fill: colors[si] }));
        } else {
          svg.appendChild(el("path", { d: smoothPath(seg), fill: "none", stroke: colors[si], "stroke-width": 2.5, "stroke-linecap": "round", "stroke-linejoin": "round", class: "ln", pathLength: 1000 }));
        }
        seg = [];
      };
      s.values.forEach((v, i) => {
        if (v == null) { flush(); return; }
        seg.push([xOf(i), yOf(v)]);
      });
      flush();

      // hover nodes (only where a value exists)
      s.values.forEach((v, i) => {
        if (v == null) return;
        const hit = el("circle", { cx: xOf(i), cy: yOf(v), r: 11, fill: "transparent" });
        const html = series.map((ss, ssI) => {
          const vv = ss.values[i];
          return `<div class="row"><span class="sw" style="background:${colors[ssI]}"></span>${ss.name}: <strong>${(opts.valueFmt || ((x) => x))(vv)}</strong></div>`;
        }).join("");
        bindTip(hit, `<b>${labels[i]}</b>${html}`);
        svg.appendChild(hit);
      });
    });

    if (animsOn()) svg.setAttribute("class", "anim-line");

    // Thin x labels so dense date labels (e.g. weekly measurements) never overlap:
    // aim for ~7 labels, always including the last one.
    const every = Math.max(1, Math.ceil(n / 7));
    labels.forEach((lb, i) => {
      if (i % every !== 0 && i !== n - 1) return;
      const t = el("text", { x: xOf(i), y: H - 8, "text-anchor": "middle", "font-size": 10.5, fill: textFaint });
      t.textContent = String(lb);
      svg.appendChild(t);
    });

    container.innerHTML = "";
    container.appendChild(svg);
  }

  /** Catmull-Rom → cubic Bézier smoothing. */
  function smoothPath(pts) {
    if (pts.length < 3) return "M" + pts.map((p) => p.join(",")).join(" L");
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  /* ---------------- HTML comparison bars (year A vs B per month) ---------------- */

  /**
   * HTML comparison bars — one pair of horizontal bars per month.
   * months: [{ label, a, b }] with NUMERIC a/b values (year-over-year workout
   * counts, etc.). opts: { a, b (legend labels), colorA, colorB, valueFmt }.
   */
  function compareBars(container, months, { a, b, colorA, colorB, valueFmt }) {
    const fmt = valueFmt || ((v) => v);
    const rows = months.map((m) => ({
      label: m.label,
      a: Number(m.a) || 0,
      b: Number(m.b) || 0
    }));
    const maxOverall = Math.max(1, ...rows.map((r) => Math.max(r.a, r.b)));
    const wrap = document.createElement("div");
    wrap.className = "bars-compare";
    const swatch = `<div class="row" style="margin-bottom:10px;gap:14px"><div class="row"><span class="sw" style="background:${colorA}"></span>${a}</div><div class="row"><span class="sw" style="background:${colorB}"></span>${b}</div></div>`;
    wrap.insertAdjacentHTML("beforeend", swatch);
    rows.forEach((r) => {
      const row = document.createElement("div");
      row.className = "bars-row";
      row.innerHTML = `<div class="bl">${r.label}</div>
        <div class="bars-track">
          <div class="bt"><div class="bw"><span style="background:${colorA};width:${(r.a / maxOverall) * 100}%" data-tip="${r.label} ${a}: ${fmt(r.a)}"></span></div><small>${fmt(r.a)}</small></div>
          <div class="bt"><div class="bw"><span style="background:${colorB};width:${(r.b / maxOverall) * 100}%" data-tip="${r.label} ${b}: ${fmt(r.b)}"></span></div><small>${fmt(r.b)}</small></div>
        </div>`;
      const spans = row.querySelectorAll("span[data-tip]");
      spans.forEach((s) => {
        s.addEventListener("mousemove", (e) => showTip(`<b>${s.dataset.tip}</b>`, e.clientX, e.clientY));
        s.addEventListener("mouseleave", hideTip);
      });
      wrap.appendChild(row);
    });
    container.innerHTML = "";
    container.appendChild(wrap);
  }

  window.Focus = window.Focus || {};
  window.Focus.Charts = { barChart, lineChart, compareBars, hideTip, compact };
})();
