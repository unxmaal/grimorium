// Orrery theme. Mechanical-planetarium / engineering-drawing aesthetic.
// Pale paper background, thin blue lines, concentric rings, astronomical
// glyphs. Chains render as spheres on concentric orbits rather than tiles
// on a rectangular grid.
//
// Palette discipline: blue-monochrome with brightness differentiating
// state. Amber is the single concession for advisory, red the single
// concession for critical. No second hue families.

import { hash32 } from "../state.js";
import { svg as svgEl } from "../render.js";
import { RADIAL } from "../layout-radial.js";

export const orrery = {
  id: "orrery",
  name: "Orrery",
  layoutMode: "radial",
  cardShape: "circle",

  labels: {
    state: {
      ok:      "TRACKING",
      warn:    "DRIFT",
      bad:     "LOST",
      check:   "ACQUIRING",
      skipped: "OCCLUDED",
      unk:     "DARK"
    },
    brand: {
      name:      "ORRERY",
      sub:       "// station tracking",
      pageTitle: "ORRERY // station tracking"
    },
    actions: {
      scryAll:         "▸ SWEEP",
      scryAllRunning:  "▸ SWEEPING…",
      inscribe:        "CONFIGURE",
      group:           "CLUSTERS",
      reArrange:       "REPHASE",
      edit:            "EDIT",
      banish:          "REMOVE",
      saveApply:       "COMMIT",
      save:            "COMMIT",
      cancel:          "CANCEL",
      close:           "CLOSE",
      bind:            "ASSIGN",
      addChain:        "+ ADD ORBIT",
      addLink:         "+ ADD STATION",
      addSigil:        "+ ADD CLUSTER",
      rescry:          "▸ PING",
      reset:           "FACTORY RESET",
      purge:           "CLEAR",
      exportLabel:     "EXPORT",
      importLabel:     "IMPORT",
      apply:           "APPLY"
    },
    nouns: {
      chain:    "orbit",
      chains:   "orbits",
      link:     "station",
      links:    "stations",
      sigil:    "Cluster",
      sigils:   "Clusters",
      log:      "TRANSMISSION LOG",
      addressLabel: "Address",
      chainNameLabel: "Orbit ID",
      haltLabel: "Halt on Fault",
      siteSettings: "System Settings"
    },
    modalTitles: {
      inscribe:      "System Settings",
      inscribeChain: "Configure Orbit",
      transcribeOut: "Export Config",
      transcribeIn:  "Import Config",
      transcribe:    "Transfer",
      sigilNew:      "New Cluster",
      sigilEdit:     "Edit Cluster",
      sigilDefault:  "Cluster"
    },
    empty: {
      noChainsHead:    "no orbits established.",
      pressHint:       "press CONFIGURE to begin.",
      noChainsForScry: "no orbits with stations — configure some",
      noLinksOnCard:   "no stations",
      noLinksInPanel:  "No stations configured. Use CONFIGURE to add some."
    },
    explainers: {
      chainDescription: "An orbit is a probe sequence — DNS, ALB, Caddy, origin. When a station drops, downstream stations are bypassed and the orbit reports which one was lost.",
      backupNote:       "Assign hosts and the probes that watch them."
    },
    log: {
      scanInFlight:  "sweep already running",
      scanStart:     (n) => "sweep initiated // " + n + " orbits",
      scanEnd:       (n) => "sweep complete // " + n + " orbits",
      inscribed:     (chains, links) => "config saved // " + chains + " orbits, " + links + " stations",
      chainInscribed: (name) => "orbit configured // " + name,
      chainBanished: (name) => "orbit removed // " + name,
      chainBound:    (chain, sigil) => chain + " assigned to " + sigil,
      sigilBound:    (name) => "cluster created // " + name,
      sigilUpdated:  (name) => "cluster updated // " + name,
      sigilBanished: (name) => "cluster removed // " + name,
      groupingOn:    "clustering enabled",
      groupingOff:   "free orbit",
      reflowed:      "clusters rephased",
      arranged:      "orbits rephased",
      filterCleared: "filter cleared",
      filterActive:  (name) => "filter active // " + name,
      transcribed:   "config received // review and apply",
      awakens:       (date) => "ORRERY online // " + date,
      scryHint:      "press SWEEP (or spacebar) to probe all orbits",
      dragHint:      "drag orbits by their top arc — drop on a cluster to assign",
      sigilHint:     "drag a cluster onto an orbit to assign, click a cluster to filter",
      groupHint:     "toggle CLUSTERS to group orbits by their first cluster"
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

  // Astronomical and orbital glyphs. Planets, lunar phases, comets, and
  // ring/orbit markers. No mystical or industrial-warning symbols.
  glyphs: [
    "☉","☽","☿","♀","♁","♂","♃","♄","♅","♆","♇","⊕","⊙",
    "○","◯","◌","◍","◎","●","◐","◑","◒","◓",
    "☄","✦","✧","⋆","∗","⊗","⊘","⊖","⊝",
    "↺","↻","⇌","⇋","⇄","⇅"
  ],

  // Blue-monochrome on pale paper. Brightness differentiates states.
  // Amber and red are the single accent hues, reserved for warn and bad.
  palette: {
    "--bg-0":           "#f4f7fb",
    "--bg-1":           "#e6edf6",
    "--bg-2":           "#d4e0ef",
    "--vellum":         "#1c3c5a",
    "--vellum-dim":     "#6a849e",
    "--ink":            "#1c3c5a",
    "--ink-dim":        "#5a7896",
    "--ink-faint":      "#a4b9d0",
    "--gold":           "#1a6bc7",
    "--gold-dim":       "#6a92c0",
    "--gold-bright":    "#00aaff",
    "--amber":          "#e08a1a",
    "--brown":          "#cbd8ea",
    "--brown-deep":     "#a4b9d0",
    "--moss":           "#1c8ad6",
    "--verdant":        "#1485e0",
    "--verdant-bright": "#3ba8ff",
    "--sienna":         "#d23048",
    "--rust":           "#a4242e",
    "--slate":          "#8aa0bb",
    "--slate-dim":      "#c8d4e3",
    "--panel":          "rgba(244, 247, 251, 0.92)",
    "--panel-edge":     "rgba(26, 107, 199, 0.28)"
  },

  /**
   * Orrery decoration: pale-paper background, faint cyan engineering grid,
   * concentric range rings centered on the viewport, declination ticks,
   * scattered astronomical glyphs at low opacity. No scanlines, no flicker,
   * no rotating perimeter — a still planetarium chart.
   */
  createDecoration(canvas, svgRoot) {
    const ctx = canvas.getContext("2d", { alpha: true });
    let dpr = Math.max(1, window.devicePixelRatio || 1);

    function sizeCanvas() {
      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width  = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawnEmber() { /* orrery is still */ }
    function maybeSpawnEmber() { /* orrery is still */ }

    function drawCanvas(t, dt) {
      const w = window.innerWidth, h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      // Very faint paper wash. The base background is white; this adds
      // the warmest hint of cyan toward the corners so the page doesn't
      // read as pure flat sheet.
      const wash = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
      wash.addColorStop(0, "rgba(232, 240, 250, 0)");
      wash.addColorStop(1, "rgba(180, 200, 224, 0.18)");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);
    }

    function tickScene() { /* still */ }

    function buildBackground() {
      while (svgRoot.firstChild) svgRoot.removeChild(svgRoot.firstChild);
      const w = window.innerWidth, h = window.innerHeight;
      svgRoot.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svgRoot.setAttribute("width", w);
      svgRoot.setAttribute("height", h);

      // Engineering grid (50px squares, very faint blue).
      const gridLayer = svgEl("g");
      const cell = 50;
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

      // Scattered astronomical glyphs, deterministic placement, faint.
      const glyphLayer = svgEl("g");
      const glyphCount = Math.round((w * h) / 80000);
      const glyphs = orrery.glyphs;
      for (let i = 0; i < glyphCount; i++) {
        const seedX = hash32("ogx" + i + "-" + w + "-" + h);
        const seedY = hash32("ogy" + i + "-" + w + "-" + h);
        const x = 40 + (seedX % (w - 80));
        const y = 40 + (seedY % (h - 80));
        const glyph = glyphs[seedX % glyphs.length];
        const size = 14 + (seedY % 14);
        const opacity = 0.10 + ((seedY % 60) / 1400);
        const tEl = svgEl("text", { x, y, class: "bg-rune", "font-size": size, opacity });
        tEl.textContent = glyph;
        glyphLayer.appendChild(tEl);
      }
      svgRoot.appendChild(glyphLayer);

      // Centered range rings + declination ticks. Align with the radial
      // layout's hub so the decoration backs the orbit pattern instead
      // of competing with it.
      const cx = w / 2;
      const cy = RADIAL.padTop + Math.max(RADIAL.cardD * 2, h - RADIAL.padTop - RADIAL.padBottom) / 2;
      const R = Math.min(w, h) * 0.42;
      const stationary = svgEl("g", { transform: `translate(${cx},${cy})` });
      for (const factor of [0.18, 0.36, 0.55, 0.74, 0.92]) {
        stationary.appendChild(svgEl("circle", {
          cx: 0, cy: 0, r: R * factor,
          class: "bg-sigil-stroke",
          "stroke-width": 0.5,
          opacity: 0.32
        }));
      }
      // Cross-hair
      stationary.appendChild(svgEl("line", {
        x1: -R, y1: 0, x2: R, y2: 0,
        class: "bg-sigil-stroke", "stroke-width": 0.4, opacity: 0.22
      }));
      stationary.appendChild(svgEl("line", {
        x1: 0, y1: -R, x2: 0, y2: R,
        class: "bg-sigil-stroke", "stroke-width": 0.4, opacity: 0.22
      }));
      // Declination ticks every 15deg at the outer ring.
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const r1 = R * 0.92;
        const r2 = R * (i % 2 === 0 ? 0.97 : 0.95);
        stationary.appendChild(svgEl("line", {
          x1: r1 * Math.cos(ang), y1: r1 * Math.sin(ang),
          x2: r2 * Math.cos(ang), y2: r2 * Math.sin(ang),
          class: "bg-sigil-stroke", "stroke-width": 0.5, opacity: 0.45
        }));
      }
      svgRoot.appendChild(stationary);
    }

    return { sizeCanvas, spawnEmber, drawCanvas, maybeSpawnEmber, buildBackground, tickScene };
  }
};
