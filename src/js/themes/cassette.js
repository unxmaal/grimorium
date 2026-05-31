// Cassette-futurism theme. Late-1970s/early-1980s industrial computing
// aesthetic: amber-monochrome phosphor CRT, monospace labels, industrial
// pictograms, scanlines, slow refresh sweep, wireframe reticle in the
// background. Reds reserved for alert states (CRITICAL only).

import { hash32 } from "../state.js";
import { svg as svgEl } from "../render.js";

export const cassette = {
  id: "cassette",
  name: "Cassette Futurism",

  // Industrial-control nomenclature. Replaces the grimoire's mystical labels.
  labels: {
    state: {
      ok:      "NOMINAL",
      warn:    "ADVISORY",
      bad:     "CRITICAL",
      check:   "QUERY",
      skipped: "BYPASS",
      unk:     "NO DATA"
    },
    brand: {
      name:      "ARGUS",
      sub:       "// host telemetry",
      pageTitle: "ARGUS // host telemetry"
    },
    actions: {
      scryAll:         "▸ EXEC SCAN",
      scryAllRunning:  "▸ SCANNING…",
      inscribe:        "CONFIG",
      group:           "CLUSTER",
      reArrange:       "REALIGN",
      edit:            "EDIT",
      banish:          "DELETE",
      saveApply:       "SAVE & APPLY",
      save:            "SAVE",
      cancel:          "CANCEL",
      close:           "CLOSE",
      bind:            "ASSIGN",
      addChain:        "+ ADD CHAIN",
      addLink:         "+ ADD STEP",
      addSigil:        "+ ADD TAG",
      rescry:          "▸ EXEC",
      reset:           "FACTORY RESET",
      purge:           "CLEAR",
      exportLabel:     "EXPORT",
      importLabel:     "IMPORT",
      apply:           "EXECUTE",
      trust:           "PROVENANCE"
    },
    nouns: {
      chain:    "chain",
      chains:   "chains",
      link:     "step",
      links:    "steps",
      sigil:    "Tag",
      sigils:   "Tags",
      log:      "SYSTEM LOG",
      addressLabel: "Address",
      chainNameLabel: "Chain ID",
      haltLabel: "Halt on Fault",
      siteSettings: "System Settings"
    },
    modalTitles: {
      inscribe:      "Configuration",
      inscribeChain: "Configure Chain",
      transcribeOut: "Export Config",
      transcribeIn:  "Import Config",
      transcribe:    "Transfer",
      sigilNew:      "New Tag",
      sigilEdit:     "Edit Tag",
      sigilDefault:  "Tag",
      trust:         "PROVENANCE"
    },
    empty: {
      noChainsHead:    "no chains configured.",
      pressHint:       "press CONFIG to begin.",
      noChainsForScry: "no chains with steps — configure some",
      noLinksOnCard:   "no steps configured",
      noLinksInPanel:  "No steps configured. Use CONFIG to add some."
    },
    explainers: {
      chainDescription: "A chain is a probe sequence — DNS → ALB → Caddy → origin. When a step fails, downstream steps are bypassed, and the row tells you which step failed.",
      backupNote:       "Bind hosts and the probes to monitor on them."
    },
    log: {
      scanInFlight:  "scan already in progress",
      scanStart:     (n) => "scan initiated // " + n + " chains",
      scanEnd:       (n) => "scan complete // " + n + " chains scanned",
      inscribed:     (chains, links) => "config saved // " + chains + " chains, " + links + " steps",
      chainInscribed: (name) => "chain configured // " + name,
      chainBanished: (name) => "chain deleted // " + name,
      chainBound:    (chain, sigil) => chain + " tagged with " + sigil,
      sigilBound:    (name) => "tag created // " + name,
      sigilUpdated:  (name) => "tag updated // " + name,
      sigilBanished: (name) => "tag deleted // " + name,
      groupingOn:    "clustering by tag",
      groupingOff:   "free arrangement",
      reflowed:      "clusters reflowed",
      arranged:      "chains realigned to grid",
      filterCleared: "filter cleared",
      filterActive:  (name) => "filter active // " + name,
      transcribed:   "config received // review and apply",
      awakens:       (date) => "ARGUS online // " + date,
      scryHint:      "press EXEC SCAN (or spacebar) to probe all chains",
      dragHint:      "drag chains by their top bar — drop on a tag to assign",
      sigilHint:     "drag a tag onto a chain to assign, click a tag to filter",
      groupHint:     "toggle CLUSTER to group chains by their first tag"
    }
  },

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

  // Semiotic-Standard-inspired Unicode pictograms. Industrial warning,
  // direction, status, hazard, and power glyphs that read as "1970s
  // operations manual" rather than "occult symbology."
  glyphs: [
    "⚠","⚡","⚛","☢","☣","☠","⏻","⏼","⏽","⌬","⌘","⚙","⬢","⬡",
    "⊕","⊗","⊞","⊟","⊠","↻","↺","⏏","⏵","⏸","⏹","⏺",
    "◐","◑","◒","◓","◢","◣","◤","◥","▲","▶","▼","◀","▰","▱",
    "☰","☱","☲","☳","☴","☵","☶","☷","⏣","⌖","⎈"
  ],

  // Amber-monochrome CRT palette. States differentiate by amber brightness;
  // red is reserved for CRITICAL alerts (historical convention on amber
  // industrial consoles). Variable names stay the same as grimorium;
  // applying this palette overrides them at :root.
  palette: {
    "--bg-0":           "#06070a",
    "--bg-1":           "#11140d",
    "--bg-2":           "#1c2018",
    "--vellum":         "#ffd9a0",
    "--vellum-dim":     "#6a5a3a",
    "--ink":            "#ffd17a",
    "--ink-dim":        "#b8843a",
    "--ink-faint":      "#5a4626",
    "--gold":           "#ff9e2c",
    "--gold-dim":       "#9a5e1a",
    "--gold-bright":    "#ffd870",
    "--amber":          "#ff8a1a",
    "--brown":          "#3a2a18",
    "--brown-deep":     "#1a1208",
    "--moss":           "#9a7a2a",
    "--verdant":        "#ffc043",
    "--verdant-bright": "#ffe070",
    "--sienna":         "#ff3030",
    "--rust":           "#c91818",
    "--slate":          "#6a5a3a",
    "--slate-dim":      "#2a2418",
    "--panel":          "rgba(6, 7, 10, 0.85)",
    "--panel-edge":     "rgba(255, 158, 44, 0.32)"
  },

  /**
   * Cassette decoration:
   *   - canvas: horizontal CRT scanlines, slow vertical sweep, occasional
   *     phosphor flicker pixels
   *   - svg: engineering-paper grid, scattered semiotic glyphs, center
   *     navigation reticle (concentric rings + crosshair + rotating
   *     hex-ring of glyph markers)
   */
  createDecoration(canvas, svgRoot) {
    const ctx = canvas.getContext("2d", { alpha: true });
    let reticleRotEl = null;
    let sweepX = 0;          // current sweep position (px)
    let sweepDir = 1;
    let lastSweepUpdate = 0;
    let dpr = Math.max(1, window.devicePixelRatio || 1);
    const flickerPixels = []; // { x, y, life, maxLife }
    let lastFlicker = 0;

    function sizeCanvas() {
      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width  = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawnEmber() {
      // Cassette equivalent: short-lived phosphor "snow" pixels.
      if (flickerPixels.length >= 12) return;
      flickerPixels.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        life: 0,
        maxLife: 80 + Math.random() * 160
      });
    }

    function drawCanvas(t, dt) {
      const w = window.innerWidth, h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // Scanlines: 3px stripes, very subtle.
      ctx.fillStyle = "rgba(255, 158, 44, 0.025)";
      for (let y = 0; y < h; y += 3) {
        ctx.fillRect(0, y, w, 1);
      }

      // Slow vertical sweep (refresh-line effect).
      lastSweepUpdate += dt;
      if (lastSweepUpdate > 16) {
        sweepX += sweepDir * (w / 14000) * lastSweepUpdate;  // ~14s sweep
        if (sweepX > w + 20) sweepX = -20;
        lastSweepUpdate = 0;
      }
      const sweepGrad = ctx.createLinearGradient(sweepX - 40, 0, sweepX + 40, 0);
      sweepGrad.addColorStop(0,    "rgba(255, 200, 80, 0)");
      sweepGrad.addColorStop(0.5,  "rgba(255, 200, 80, 0.08)");
      sweepGrad.addColorStop(1,    "rgba(255, 200, 80, 0)");
      ctx.fillStyle = sweepGrad;
      ctx.fillRect(sweepX - 40, 0, 80, h);

      // Phosphor "snow" pixels — rare bright dots that flicker out fast.
      for (let i = flickerPixels.length - 1; i >= 0; i--) {
        const p = flickerPixels[i];
        p.life += dt;
        if (p.life > p.maxLife) { flickerPixels.splice(i, 1); continue; }
        const a = 1 - (p.life / p.maxLife);
        ctx.fillStyle = `rgba(255, 232, 176, ${a * 0.65})`;
        ctx.fillRect(p.x, p.y, 2, 2);
      }
    }

    function maybeSpawnEmber(t) {
      if (t - lastFlicker > 400 + Math.random() * 800) {
        spawnEmber();
        lastFlicker = t;
      }
    }

    function buildBackground() {
      while (svgRoot.firstChild) svgRoot.removeChild(svgRoot.firstChild);
      const w = window.innerWidth, h = window.innerHeight;
      svgRoot.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svgRoot.setAttribute("width", w);
      svgRoot.setAttribute("height", h);

      // Engineering-paper grid: 40px squares, faint amber.
      const gridLayer = svgEl("g");
      const cell = 40;
      for (let x = 0; x <= w; x += cell) {
        gridLayer.appendChild(svgEl("line", {
          x1: x, y1: 0, x2: x, y2: h, class: "bg-grid"
        }));
      }
      for (let y = 0; y <= h; y += cell) {
        gridLayer.appendChild(svgEl("line", {
          x1: 0, y1: y, x2: w, y2: y, class: "bg-grid"
        }));
      }
      svgRoot.appendChild(gridLayer);

      // Scattered semiotic glyphs, deterministic placement.
      const glyphLayer = svgEl("g");
      const glyphCount = Math.round((w * h) / 60000);
      const glyphs = cassette.glyphs;
      for (let i = 0; i < glyphCount; i++) {
        const seedX = hash32("gx" + i + "-" + w + "-" + h);
        const seedY = hash32("gy" + i + "-" + w + "-" + h);
        const x = 30 + (seedX % (w - 60));
        const y = 30 + (seedY % (h - 60));
        const glyph = glyphs[seedX % glyphs.length];
        const size = 16 + (seedY % 18);
        const opacity = 0.08 + ((seedY % 80) / 1200);
        const tEl = svgEl("text", { x, y, class: "bg-rune", "font-size": size, opacity });
        tEl.textContent = glyph;
        glyphLayer.appendChild(tEl);
      }
      svgRoot.appendChild(glyphLayer);

      // Center navigation reticle: concentric rings + crosshair + rotating
      // outer hex-ring of glyph markers.
      const cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) * 0.32;

      const stationary = svgEl("g", { transform: `translate(${cx},${cy})` });
      // Crosshair
      stationary.appendChild(svgEl("line", { x1: -R * 1.15, y1: 0, x2: R * 1.15, y2: 0, class: "bg-sigil-stroke", "stroke-width": 0.4, opacity: 0.25 }));
      stationary.appendChild(svgEl("line", { x1: 0, y1: -R * 1.15, x2: 0, y2: R * 1.15, class: "bg-sigil-stroke", "stroke-width": 0.4, opacity: 0.25 }));
      // Concentric rings
      for (const factor of [0.35, 0.55, 0.78, 0.95]) {
        stationary.appendChild(svgEl("circle", {
          cx: 0, cy: 0, r: R * factor,
          class: "bg-sigil-stroke", "stroke-width": 0.5,
          opacity: 0.28
        }));
      }
      // Tick marks at every 30 degrees
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        const x1 = Math.cos(ang) * R * 0.95;
        const y1 = Math.sin(ang) * R * 0.95;
        const x2 = Math.cos(ang) * R * 1.02;
        const y2 = Math.sin(ang) * R * 1.02;
        stationary.appendChild(svgEl("line", {
          x1, y1, x2, y2, class: "bg-sigil-stroke",
          "stroke-width": 0.6, opacity: 0.4
        }));
      }
      svgRoot.appendChild(stationary);

      // Rotating outer hex with glyph markers
      reticleRotEl = svgEl("g", { transform: `translate(${cx},${cy})` });
      const inner = svgEl("g");
      reticleRotEl.appendChild(inner);

      // Hexagonal outer perimeter
      let hexPath = "";
      for (let i = 0; i <= 6; i++) {
        const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = R * 1.1 * Math.cos(ang);
        const y = R * 1.1 * Math.sin(ang);
        hexPath += (i === 0 ? "M" : "L") + x + "," + y + " ";
      }
      inner.appendChild(svgEl("path", {
        d: hexPath, class: "bg-sigil-stroke",
        "stroke-width": 0.7, opacity: 0.45
      }));

      // Glyph markers at hex vertices
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = R * 1.18 * Math.cos(ang);
        const y = R * 1.18 * Math.sin(ang);
        const g = glyphs[i * 4 % glyphs.length];
        const tEl = svgEl("text", {
          x, y, class: "bg-sigil-text",
          "font-size": Math.max(14, R * 0.07),
          opacity: 0.55
        });
        tEl.textContent = g;
        inner.appendChild(tEl);
      }

      // Center dot
      inner.appendChild(svgEl("circle", {
        cx: 0, cy: 0, r: 3, fill: "var(--gold)", opacity: 0.7
      }));
      // Inner crosshair brackets (corner ticks at the inner ring)
      const bracketLen = R * 0.06;
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const x = Math.cos(ang) * R * 0.35;
        const y = Math.sin(ang) * R * 0.35;
        inner.appendChild(svgEl("line", {
          x1: x - bracketLen, y1: y, x2: x + bracketLen, y2: y,
          class: "bg-sigil-stroke", "stroke-width": 0.5, opacity: 0.5
        }));
        inner.appendChild(svgEl("line", {
          x1: x, y1: y - bracketLen, x2: x, y2: y + bracketLen,
          class: "bg-sigil-stroke", "stroke-width": 0.5, opacity: 0.5
        }));
      }

      svgRoot.appendChild(reticleRotEl);
    }

    function tickScene(t) {
      if (reticleRotEl) {
        // Slower rotation than grimorium; cassette is institutional, not
        // mystical. Reverse direction reads as "scanner sweep" rather than
        // "ritual spin."
        const ang = -t * 0.000018 * 180 / Math.PI;
        reticleRotEl.setAttribute("transform",
          `translate(${window.innerWidth/2},${window.innerHeight/2}) rotate(${ang})`);
      }
    }

    return { sizeCanvas, spawnEmber, drawCanvas, maybeSpawnEmber, buildBackground, tickScene };
  }
};
