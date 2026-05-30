// The default theme. Owns all grimoire-specific look-and-feel:
// state labels, glyph pool, status -> CSS var mapping, and the
// canvas/SVG decoration (embers, sigil heptagram, rune scatter, parchment).
//
// A different theme would export the same shape with different values.

import { hash32 } from "../state.js";
import { svg as svgEl } from "../render.js";

export const grimorium = {
  id: "grimorium",
  name: "Grimorium",

  // Display strings keyed by semantic state name. Used by stateLabel().
  labels: {
    state: {
      ok:      "HOLDS",
      warn:    "STIRS",
      bad:     "SEVERED",
      check:   "DIVINING",
      skipped: "SKIPPED",
      unk:     "UNSCRYED"
    }
  },

  // CSS custom-property name to use for a given semantic state. The CSS
  // file owns the actual color values; the theme just maps semantic -> token.
  statusColorVar(state) {
    switch (state) {
      case "ok":      return "var(--verdant)";
      case "warn":    return "var(--amber)";
      case "bad":     return "var(--sienna)";
      case "check":   return "var(--gold-bright)";
      case "skipped": return "var(--slate)";
      default:        return "var(--vellum-dim)";
    }
  },

  // Glyph pool: used for classifier sigils, background rune scatter, etc.
  glyphs: [
    "☉","☽","☿","♀","♂","♃","♄","♅","♆","☥","⚸","⚝","⚹","⚛","♁","☸","☫","⛤","⛧",
    "✶","✷","✸","✹","✺","❂","✦","✧","✪","⌘","⌬","☼","☯","⚕","⚚","⚖","⚜","☬"
  ],

  /**
   * Build a stateful decoration instance bound to a canvas + svg root.
   * Returns an object the host calls per frame and on resize.
   */
  createDecoration(canvas, svgRoot) {
    const ctx = canvas.getContext("2d", { alpha: true });
    const embers = [];
    let sigilRotEl = null;
    let lastEmberSpawn = 0;
    let dpr = Math.max(1, window.devicePixelRatio || 1);

    function sizeCanvas() {
      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width  = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawnEmber() {
      const w = window.innerWidth, h = window.innerHeight;
      const hue = Math.random() < 0.75 ? 40 + Math.random() * 16 : 28 + Math.random() * 8;
      embers.push({
        x: Math.random() * w, y: h + 20,
        vx: (Math.random() - 0.5) * 0.04, vy: -(0.04 + Math.random() * 0.07),
        r: 0.8 + Math.random() * 1.4,
        life: 0, maxLife: 9000 + Math.random() * 11000,
        drift: Math.random() * Math.PI * 2,
        driftFreq: 0.0003 + Math.random() * 0.0004,
        hue, alpha: 0.35 + Math.random() * 0.4
      });
    }

    function drawCanvas(t, dt) {
      const w = window.innerWidth, h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      const grads = [
        { x: w * 0.5, y: h * 0.5,  r: Math.min(w,h) * 0.7, col: "rgba(120, 70, 18, 0.10)" },
        { x: w * 0.2, y: h * 0.85, r: Math.min(w,h) * 0.5, col: "rgba(255, 180, 60, 0.06)" },
        { x: w * 0.8, y: h * 0.15, r: Math.min(w,h) * 0.5, col: "rgba(200, 120, 30, 0.05)" }
      ];
      for (const g of grads) {
        const rg = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
        rg.addColorStop(0, g.col); rg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
      }
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.life += dt;
        e.x += e.vx * dt + Math.sin(t * e.driftFreq + e.drift) * 0.04 * dt;
        e.y += e.vy * dt;
        if (e.y < -20 || e.life > e.maxLife) { embers.splice(i, 1); continue; }
        const fade = e.life < 800 ? e.life / 800
                   : e.life > e.maxLife - 1200 ? Math.max(0, (e.maxLife - e.life) / 1200)
                   : 1;
        const a = e.alpha * fade;
        const rg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 6);
        rg.addColorStop(0,   `hsla(${e.hue}, 95%, 70%, ${a * 0.85})`);
        rg.addColorStop(0.5, `hsla(${e.hue}, 95%, 60%, ${a * 0.25})`);
        rg.addColorStop(1,   `hsla(${e.hue}, 95%, 60%, 0)`);
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `hsla(${e.hue}, 100%, 88%, ${a})`;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      }
    }

    function maybeSpawnEmber(t) {
      if (embers.length < 40 && t - lastEmberSpawn > 220 + Math.random() * 200) {
        spawnEmber();
        lastEmberSpawn = t;
      }
    }

    function buildBackground() {
      while (svgRoot.firstChild) svgRoot.removeChild(svgRoot.firstChild);
      const w = window.innerWidth, h = window.innerHeight;
      svgRoot.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svgRoot.setAttribute("width", w);
      svgRoot.setAttribute("height", h);

      // Triangle tessellation
      const triLayer = svgEl("g");
      const side = 90, triH = side * Math.sqrt(3) / 2;
      const cols = Math.ceil(w / (side / 2)) + 2;
      const rows = Math.ceil(h / triH) + 2;
      const offX = -side / 2, offY = -triH;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const isUp = (r + c) % 2 === 0;
          const cx = offX + c * (side / 2) + (side / 2);
          const topY = offY + r * triH;
          const botY = topY + triH;
          const d = isUp
            ? `M${cx},${topY} L${cx - side/2},${botY} L${cx + side/2},${botY} Z`
            : `M${cx - side/2},${topY} L${cx + side/2},${topY} L${cx},${botY} Z`;
          if (!isUp) triLayer.appendChild(svgEl("path", { class: "bg-tri-alt", d }));
          triLayer.appendChild(svgEl("path", { class: "bg-tri", d }));
        }
      }
      svgRoot.appendChild(triLayer);

      // Rune scatter
      const runeLayer = svgEl("g");
      const runeCount = Math.round((w * h) / 38000);
      const glyphs = grimorium.glyphs;
      for (let i = 0; i < runeCount; i++) {
        const seedX = hash32("rx" + i + "-" + w + "-" + h);
        const seedY = hash32("ry" + i + "-" + w + "-" + h);
        const x = 30 + (seedX % (w - 60));
        const y = 30 + (seedY % (h - 60));
        const glyph = glyphs[seedX % glyphs.length];
        const size = 18 + (seedY % 22);
        const opacity = 0.10 + ((seedY % 100) / 1000);
        const t = svgEl("text", { x, y, class: "bg-rune", "font-size": size, opacity });
        t.textContent = glyph;
        runeLayer.appendChild(t);
      }
      svgRoot.appendChild(runeLayer);

      // Center sigil heptagram + pentagram + rim glyphs
      const cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) * 0.38;
      sigilRotEl = svgEl("g", { transform: `translate(${cx},${cy})` });
      const inner = svgEl("g");
      sigilRotEl.appendChild(inner);

      inner.appendChild(svgEl("circle", { cx: 0, cy: 0, r: R, class: "bg-sigil-stroke", opacity: 0.35 }));
      inner.appendChild(svgEl("circle", { cx: 0, cy: 0, r: R * 0.94, class: "bg-sigil-stroke", "stroke-width": 0.5, "stroke-dasharray": "1 6", opacity: 0.45 }));

      const pts = 7;
      let path = "";
      for (let i = 0; i < pts * 2; i++) {
        const j = (i * 3) % pts;
        const ang = (j / pts) * Math.PI * 2 - Math.PI / 2;
        path += (i === 0 ? "M" : "L") + (R * 0.86 * Math.cos(ang)) + "," + (R * 0.86 * Math.sin(ang)) + " ";
      }
      path += "Z";
      inner.appendChild(svgEl("path", { d: path, class: "bg-sigil-stroke", "stroke-width": 0.7, opacity: 0.4 }));

      let pent = "";
      for (let i = 0; i < 10; i++) {
        const j = (i * 2) % 5;
        const ang = (j / 5) * Math.PI * 2 - Math.PI / 2;
        const r = R * 0.4;
        pent += (i === 0 ? "M" : "L") + (r * Math.cos(ang)) + "," + (r * Math.sin(ang)) + " ";
      }
      pent += "Z";
      inner.appendChild(svgEl("path", { d: pent, class: "bg-sigil-stroke", "stroke-width": 0.6, opacity: 0.35 }));

      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const x = R * 1.05 * Math.cos(ang);
        const y = R * 1.05 * Math.sin(ang);
        const g = glyphs[i % glyphs.length];
        const t = svgEl("text", { x, y, class: "bg-sigil-text", "font-size": Math.max(12, R * 0.06), opacity: 0.5 });
        t.textContent = g;
        inner.appendChild(t);
      }
      inner.appendChild(svgEl("circle", { cx: 0, cy: 0, r: 2, fill: "var(--gold)", opacity: 0.6 }));
      svgRoot.appendChild(sigilRotEl);
    }

    function tickScene(t) {
      if (sigilRotEl) {
        const ang = t * 0.000035 * 180 / Math.PI;
        sigilRotEl.setAttribute("transform",
          `translate(${window.innerWidth/2},${window.innerHeight/2}) rotate(${ang})`);
      }
    }

    return { sizeCanvas, spawnEmber, drawCanvas, maybeSpawnEmber, buildBackground, tickScene };
  }
};
