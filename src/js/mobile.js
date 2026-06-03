// Mobile branch. On viewports ≤ 768px the canvas / radial / drag-and-drop
// model is dropped in favour of a vertical scrolling list. CSS does the
// shape work (position: static !important on cards, drawers for chrome);
// this module owns the small JS hooks the CSS can't express on its own.

export const MOBILE_BREAKPOINT_PX = 768;

/** True when the current viewport is in the mobile breakpoint. */
export function isMobile() {
  const mm = globalThis.matchMedia;
  if (typeof mm === "function") {
    return mm("(max-width: " + MOBILE_BREAKPOINT_PX + "px)").matches;
  }
  const w = globalThis.innerWidth;
  return typeof w === "number" && w <= MOBILE_BREAKPOINT_PX;
}

/**
 * Mark the document for mobile mode and publish the current topbar height
 * as a CSS variable so the shelf can sit flush under a possibly-wrapped
 * topbar. Idempotent; safe to call on every resize.
 *
 * @param {Document} doc
 */
export function syncMobileBodyState(doc) {
  if (!doc || !doc.body) return;
  const on = isMobile();
  doc.body.classList.toggle("is-mobile", on);
  if (!on) {
    doc.documentElement.style.removeProperty("--topbar-h");
    return;
  }
  const topbar = doc.querySelector(".topbar");
  if (topbar) {
    const h = topbar.getBoundingClientRect().height;
    doc.documentElement.style.setProperty("--topbar-h", Math.ceil(h) + "px");
  }
}

/**
 * Strip absolute positioning styles a card may have inherited from a
 * previous desktop render. On mobile the CSS pins position:static !important,
 * but clearing the inline styles keeps the DOM tidy for inspection.
 *
 * @param {Iterable<HTMLElement>} cards
 */
export function clearCardAbsolutePositions(cards) {
  for (const card of cards) {
    if (!card) continue;
    card.style.left = "";
    card.style.top = "";
  }
}
