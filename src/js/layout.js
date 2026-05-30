// Pure layout math. No DOM access. Returns positions and group rectangles
// that the renderer applies to actual elements.

export const LAYOUT = Object.freeze({
  cardW: 224,
  cardHMin: 84,
  gap: 14,
  padTop: 70,
  padBottom: 200,
  padLeft: 64,
  padRight: 28,
  sidepanelW: 380,
  innerPadX: 16,
  innerPadY: 18,
  headerH: 14
});

/** Available canvas width for cards given current window + sidepanel state. */
export function effectiveAvailWidth(windowW, sidepanelOpen, layout = LAYOUT) {
  const effRight = sidepanelOpen ? layout.sidepanelW : layout.padRight;
  return Math.max(layout.cardW, windowW - layout.padLeft - effRight);
}

/** Grid position for the Nth card in the flat (non-grouped) layout. */
export function autoGridPosition(index, availW, layout = LAYOUT) {
  const cols = Math.max(1, Math.floor((availW + layout.gap) / (layout.cardW + layout.gap)));
  const row = Math.floor(index / cols);
  const col = index % cols;
  return {
    x: layout.padLeft + col * (layout.cardW + layout.gap),
    y: layout.padTop + 6 + row * (layout.cardHMin + layout.gap)
  };
}

/**
 * Decide which group each chain belongs to in grouped layout mode.
 *
 * A chain lives in the group of its FIRST classifier. Multi-tag chains still
 * show all sigils as runes on the card; they just have one spatial home.
 * Chains with no classifiers, or whose first classifier no longer exists,
 * land in an "untagged" group with classifier: null.
 *
 * @returns {Array<{classifier: object|null, chains: Array}>}
 */
export function buildGroupMembership(chains, classifiers) {
  const seen = new Set();
  const groups = [];
  for (const cls of classifiers) {
    const members = chains.filter(c =>
      c.classifierIds.length > 0 && c.classifierIds[0] === cls.id);
    if (members.length) {
      groups.push({ classifier: cls, chains: members });
      for (const m of members) seen.add(m.id);
    }
  }
  const orphans = chains.filter(c => !seen.has(c.id));
  if (orphans.length) groups.push({ classifier: null, chains: orphans });
  return groups;
}

/**
 * Compute card positions and group bounding rectangles for grouped mode.
 *
 * @param {Array}   chains
 * @param {Array}   classifiers
 * @param {object}  opts
 * @param {number}  opts.availW          available width for the canvas
 * @param {function}[opts.cardHeightOf]  (chainId) -> px height. Defaults to layout.cardHMin.
 * @param {object}  [opts.layout]        override LAYOUT defaults
 * @returns {{
 *   groups: Array<{classifier: object|null, x: number, y: number, w: number, h: number}>,
 *   cardPositions: Object<string, {x: number, y: number}>
 * }}
 */
export function computeGroupedLayout(chains, classifiers, opts) {
  const layout = { ...LAYOUT, ...(opts.layout || {}) };
  const availW = opts.availW;
  const cardHeightOf = opts.cardHeightOf || (() => layout.cardHMin);

  const memberships = buildGroupMembership(chains, classifiers);
  const groupRects = [];
  const cardPositions = {};
  let y = layout.padTop + 6;

  for (const g of memberships) {
    const usableW = availW - layout.innerPadX * 2;
    const cols = Math.max(1, Math.floor((usableW + layout.gap) / (layout.cardW + layout.gap)));
    const rows = Math.ceil(g.chains.length / cols);

    // Per-row max height: bad links add an inline detail row that grows cards
    // beyond cardHMin. Group must size to its tallest member, not clip.
    const rowHeights = new Array(rows).fill(layout.cardHMin);
    for (let i = 0; i < g.chains.length; i++) {
      const r = Math.floor(i / cols);
      const h = cardHeightOf(g.chains[i].id) || layout.cardHMin;
      if (h > rowHeights[r]) rowHeights[r] = h;
    }
    const rowYOffsets = [0];
    for (let r = 0; r < rows; r++) {
      rowYOffsets.push(rowYOffsets[r] + rowHeights[r] + layout.gap);
    }
    const innerH = rows > 0 ? rowYOffsets[rows] - layout.gap : 0;
    const groupH = layout.headerH + layout.innerPadY * 2 + innerH;
    const groupX = layout.padLeft;

    groupRects.push({
      classifier: g.classifier,
      x: groupX,
      y,
      w: availW,
      h: groupH
    });

    for (let i = 0; i < g.chains.length; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      cardPositions[g.chains[i].id] = {
        x: groupX + layout.innerPadX + c * (layout.cardW + layout.gap),
        y: y + layout.headerH + layout.innerPadY + rowYOffsets[r]
      };
    }

    y += groupH + layout.gap;
  }

  return { groups: groupRects, cardPositions };
}
