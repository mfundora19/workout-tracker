/* =========================================================================
 * Pulse.Charts — dependency-free SVG chart library
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
          opacity: opts.highlight && !opts.highlight.includes(i) ? 0.25 : 1
        });
        bindTip(bar, tipForSeries(s, lb, v, opts));
        svg.appendChild(bar);
      });
    });

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
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
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
    series.forEach((s, si) => {
      const gid = "grad-" + (opts.fillId || "chart") + "-" + si;
      const g = el("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
      g.appendChild(el("stop", { offset: "0%", "stop-color": colors[si], "stop-opacity": 0.28 }));
      g.appendChild(el("stop", { offset: "100%", "stop-color": colors[si], "stop-opacity": 0.01 }));
      defs.appendChild(g);
      if (opts.area !== false) {
        const pts = s.values.map((v, i) => `${xOf(i)},${yOf(v)}`);
        const area = el("path", {
          d: `M${xOf(0)},${pad.t + plotH}L${pts.join("L")}L${xOf(n - 1)},${pad.t + plotH}Z`,
          fill: `url(#${gid})`, stroke: "none"
        });
        svg.appendChild(area);
      }
    });
    svg.appendChild(defs);

    series.forEach((s, si) => {
      const pts = s.values.map((v, i) => [xOf(i), yOf(v)]);
      if (pts.length === 1) {
        svg.appendChild(el("circle", { cx: pts[0][0], cy: pts[0][1], r: 4, fill: colors[si] }));
      } else {
        const path = smoothPath(pts);
        svg.appendChild(el("path", { d: path, fill: "none", stroke: colors[si], "stroke-width": 2.5, "stroke-linecap": "round", "stroke-linejoin": "round" }));
      }
      // hover nodes
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

    const every = n > 24 ? 3 : n > 12 ? 2 : 1;
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

  /* ---------------- donut ---------------- */

  function donut(container, data, opts = {}) {
    const total = data.reduce((s, d) => s + d.value, 0);
    if (!total) { emptyChart(container, "No workouts recorded this year."); return; }
    const size = opts.size || 180;
    const stroke = opts.stroke || 17;
    const r = (size - stroke) / 2 - 4;
    const c = size / 2;
    const accent = cssVar("--accent", "#6366f1");
    const accent2 = cssVar("--accent-2", "#8b5cf6");
    const success = cssVar("--success", "#10b981");
    const warn = cssVar("--warn", "#f59e0b");
    const info = cssVar("--info", "#0ea5e9");
    const palette = [accent, success, warn, info, accent2, "#ec4899", "#14b8a6", "#f97316", "#64748b"];
    const colors = data.map((d, i) => d.color || palette[i % palette.length]);

    const svg = el("svg", { viewBox: `0 0 ${size} ${size}`, role: "img" });
    svg.appendChild(el("circle", { cx: c, cy: c, r, fill: "none", stroke: cssVar("--surface-3", "#eef0f7"), "stroke-width": stroke }));
    let offset = 0;
    data.forEach((d, i) => {
      const frac = d.value / total;
      const arc = el("circle", {
        cx: c, cy: c, r, fill: "none",
        stroke: colors[i], "stroke-width": stroke,
        "stroke-dasharray": `${frac * 2 * Math.PI * r} ${2 * Math.PI * r}`,
        "stroke-dashoffset": -offset * 2 * Math.PI * r,
        transform: `rotate(-90 ${c} ${c})`
      });
      bindTip(arc, `<b>${d.label}</b><div class="row"><span class="sw" style="background:${colors[i]}"></span><strong>${d.value}</strong> (${(frac * 100).toFixed(0)}%)</div>`);
      svg.appendChild(arc);
      offset += frac;
    });
    if (opts.centerLabel) {
      const t1 = el("text", { x: c, y: c - 4, "text-anchor": "middle", "font-size": 22, "font-weight": 750, fill: cssVar("--text", "#171a26") });
      t1.textContent = opts.centerValue != null ? compact(opts.centerValue) : String(total);
      svg.appendChild(t1);
      const t2 = el("text", { x: c, y: c + 15, "text-anchor": "middle", "font-size": 10, fill: cssVar("--text-faint", "#9499ab") });
      t2.textContent = opts.centerLabel;
      svg.appendChild(t2);
    }
    container.innerHTML = "";
    container.appendChild(svg);
  }

  /* ---------------- HTML comparison bars (year A vs B per month) ---------------- */

  function compareBars(container, months, { a, b, colorA, colorB, valueFmt }) {
    const rows = months.map((m) => ({
      label: m.label,
      a: m.a,
      b: m.b,
      max: Math.max(m.a, m.b, 1)
    }));
    const maxOverall = Math.max(1, ...rows.map((r) => r.max));
    const wrap = document.createElement("div");
    wrap.className = "bars-compare";
    const swatch = `<div class="row" style="margin-bottom:10px;gap:14px"><div class="row"><span class="sw" style="background:${colorA}"></span>${a}</div><div class="row"><span class="sw" style="background:${colorB}"></span>${b}</div></div>`;
    wrap.insertAdjacentHTML("beforeend", swatch);
    rows.forEach((r) => {
      const row = document.createElement("div");
      row.className = "bars-row";
      row.innerHTML = `<div class="bl">${r.label}</div>
        <div class="bars-track">
          <div class="bt"><div class="bw"><span style="background:${colorA};width:${(r.a / maxOverall) * 100}%" data-tip="${r.label} ${a}"></span></div><small>${r.a}</small></div>
          <div class="bt"><div class="bw"><span style="background:${colorB};width:${(r.b / maxOverall) * 100}%" data-tip="${r.label} ${b}"></span></div><small>${r.b}</small></div>
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

  window.Pulse = window.Pulse || {};
  window.Pulse.Charts = { barChart, lineChart, donut, compareBars, hideTip, compact };
})();
