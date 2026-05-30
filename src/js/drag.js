// Drag state-machine helpers. Pure where possible; only dropTargetAt touches DOM.
// The event-plumbing (window mousemove/mouseup) stays in main.js — it's
// browser-only and tested by exercising the UI directly.

export const DRAG_THRESHOLD = 4;

/**
 * Has the cursor moved far enough from the drag origin to count as a drag
 * (vs a click)?
 */
export function exceedsDragThreshold(dx, dy, threshold = DRAG_THRESHOLD) {
  return Math.hypot(dx, dy) >= threshold;
}

/**
 * Compute the delta of a drag from origin to the current cursor point.
 * @returns {{dx: number, dy: number, distance: number, moved: boolean}}
 */
export function dragDelta(startX, startY, curX, curY, threshold = DRAG_THRESHOLD) {
  const dx = curX - startX;
  const dy = curY - startY;
  const distance = Math.hypot(dx, dy);
  return { dx, dy, distance, moved: distance >= threshold };
}

/**
 * Find the closest ancestor element matching `selector` under the given
 * client-space point. Returns null when nothing matches or the point lies
 * outside any tracked element.
 */
export function dropTargetAt(doc, x, y, selector) {
  const tgt = doc.elementFromPoint(x, y);
  return tgt ? tgt.closest(selector) : null;
}
