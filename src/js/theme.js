// Active theme registration. A theme is a plain object with the shape:
//   {
//     id: string,
//     name: string,
//     labels: { state: { ok, warn, bad, check, skipped, unk } },
//     statusColorVar(state): string,            // CSS var() expression
//     glyphs: string[],                         // pool for sigils + decor
//     createDecoration(canvas, svgRoot): {      // stateful per-instance
//       sizeCanvas, spawnEmber, drawCanvas,
//       maybeSpawnEmber, buildBackground, tickScene
//     }
//   }
//
// To swap themes, replace `activeTheme` (or pass a different module to the
// caller). The Theme abstraction itself does not own state — each call to
// createDecoration returns a fresh instance.

import { grimorium } from "./themes/grimorium.js";

export let activeTheme = grimorium;

export function setActiveTheme(theme) {
  activeTheme = theme;
}

/** Display label for a semantic state. Falls back to the raw state name. */
export function stateLabel(state, theme = activeTheme) {
  return (theme && theme.labels && theme.labels.state[state]) ?? state;
}
