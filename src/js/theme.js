// Active theme registration. A theme is a plain object with the shape:
//   {
//     id: string,
//     name: string,
//     labels: { state: { ok, warn, bad, check, skipped, unk } },
//     statusColorVar(state): string,            // CSS var() expression
//     glyphs: string[],                         // pool for sigils + decor
//     palette: { "--cssvar": "value", ... },    // applied to :root on activation
//     createDecoration(canvas, svgRoot): {      // stateful per-instance
//       sizeCanvas, spawnEmber, drawCanvas,
//       maybeSpawnEmber, buildBackground, tickScene
//     }
//   }

import { grimorium } from "./themes/grimorium.js";
import { cassette } from "./themes/cassette.js";
import { orrery } from "./themes/orrery.js";

export const THEMES = Object.freeze({
  grimorium,
  cassette,
  orrery
});

export let activeTheme = grimorium;

export function setActiveTheme(theme) {
  activeTheme = theme;
}

export function themeById(id) {
  return THEMES[id] ?? grimorium;
}

/**
 * Apply a theme's palette to :root, overriding CSS custom properties.
 * Returns the previous palette values keyed by var name (useful for restore).
 */
export function applyTheme(theme, doc = globalThis.document) {
  if (!theme || !theme.palette || !doc?.documentElement) return {};
  const root = doc.documentElement;
  const prev = {};
  for (const [name, value] of Object.entries(theme.palette)) {
    prev[name] = root.style.getPropertyValue(name);
    root.style.setProperty(name, value);
  }
  if (doc.body) doc.body.dataset.theme = theme.id;
  setActiveTheme(theme);
  return prev;
}

/** Display label for a semantic state. Falls back to the raw state name. */
export function stateLabel(state, theme = activeTheme) {
  return (theme && theme.labels && theme.labels.state[state]) ?? state;
}

/**
 * Read a dotted-path label from the theme. Functions are invoked with args.
 * @param {string} path  e.g. "actions.scryAll" or "log.scanStart"
 * @param  {...any} args optional args for function-shaped labels
 */
export function t(path, ...args) {
  return tFrom(activeTheme, path, ...args);
}

export function tFrom(theme, path, ...args) {
  if (!theme || !theme.labels) return path;
  const parts = path.split(".");
  let v = theme.labels;
  for (const p of parts) {
    if (v == null) return path;
    v = v[p];
  }
  if (typeof v === "function") return v(...args);
  return v ?? path;
}

/**
 * Walk the document for elements marked with `data-label="path.to.string"`
 * and set their textContent from the theme. Also updates the page title from
 * theme.labels.brand.pageTitle if present.
 */
export function applyLabels(theme = activeTheme, doc = globalThis.document) {
  if (!doc) return;
  for (const el of doc.querySelectorAll("[data-label]")) {
    const path = el.dataset.label;
    const v = tFrom(theme, path);
    if (typeof v === "string") el.textContent = v;
  }
  const pageTitle = tFrom(theme, "brand.pageTitle");
  if (typeof pageTitle === "string" && pageTitle !== "brand.pageTitle") {
    doc.title = pageTitle;
  }
}
