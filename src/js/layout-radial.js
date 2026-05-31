// Radial layout math. Chains are circular bounding boxes positioned on
// concentric rings around a hub. Flat mode rings the viewport center;
// grouped mode gives each classifier its own "system" of orbiting chains
// and tiles systems across rows. No DOM access; mirrors the return shape
// of layout.js so the same render code applies positions either way.

export const RADIAL = Object.freeze({
  cardD: 168,          // sphere diameter (also card bounding-box size)
  ringGap: 26,         // gap between rings
  slotGap: 12,         // angular gap between sibling slots on the same ring
  hubR: 64,            // inner clear radius (center reserved for hub glyph)
  sysGap: 36,          // gap between systems in grouped mode
  padTop: 80,
  padBottom: 200,
  padLeft: 64,
  padRight: 28,
  sidepanelW: 380
});

export function effectiveAvailWidthRadial(windowW, sidepanelOpen, layout = RADIAL) {
  const effRight = sidepanelOpen ? layout.sidepanelW : layout.padRight;
  return Math.max(layout.cardD * 2, windowW - layout.padLeft - effRight);
}

/**
 * Distribute n items on concentric rings around (0,0). Returns each item's
 * center offset and the overall outer radius reached.
 */
function distributeOnRings(n, layout) {
  const { cardD, ringGap, slotGap, hubR } = layout;
  const centers = [];
  if (n === 0) return { centers, ringsUsed: 0, outerR: hubR };
  let placed = 0;
  let ring = 1;
  let outerR = hubR;
  while (placed < n && ring <= 16) {
    const r = hubR + cardD * (ring - 0.5) + ringGap * (ring - 1);
    const circumference = 2 * Math.PI * r;
    const slots = Math.max(1, Math.floor(circumference / (cardD + slotGap)));
    const angStep = (Math.PI * 2) / slots;
    for (let s = 0; s < slots && placed < n; s++) {
      const ang = s * angStep - Math.PI / 2;
      centers.push({ x: r * Math.cos(ang), y: r * Math.sin(ang) });
      placed++;
    }
    outerR = r + cardD / 2;
    ring++;
  }
  return { centers, ringsUsed: ring - 1, outerR };
}

/**
 * Flat radial: all chains on concentric rings around the viewport center.
 * @returns {{ cardPositions, hub: {cx, cy, r}, cardD }}
 */
export function computeRadialLayout(chains, opts) {
  const layout = { ...RADIAL, ...(opts.layout || {}) };
  const cx = opts.cx ?? (opts.availW / 2);
  const cy = opts.cy ?? ((opts.availH ?? opts.availW) / 2);

  const { centers, outerR } = distributeOnRings(chains.length, layout);
  const cardPositions = {};
  for (let i = 0; i < chains.length; i++) {
    cardPositions[chains[i].id] = {
      x: cx + centers[i].x - layout.cardD / 2,
      y: cy + centers[i].y - layout.cardD / 2
    };
  }
  return {
    cardPositions,
    hub: { cx, cy, r: outerR },
    cardD: layout.cardD
  };
}

/**
 * Radial grouped: one system per classifier, chains orbit the hub. Systems
 * pack into rows greedily across the available width.
 */
export function computeRadialGroupedLayout(chains, classifiers, opts) {
  const layout = { ...RADIAL, ...(opts.layout || {}) };
  const availW = opts.availW;

  const memberships = buildRadialGroupMembership(chains, classifiers);
  const cardPositions = {};
  const groupRects = [];

  const systems = memberships.map(g => {
    const { centers, outerR } = distributeOnRings(g.chains.length, layout);
    return { ...g, centers, r: Math.max(layout.hubR, outerR) };
  });

  let rowX = layout.padLeft;
  let rowY = layout.padTop;
  let rowH = 0;
  for (const sys of systems) {
    const sysW = sys.r * 2 + layout.sysGap;
    const sysH = sys.r * 2;
    if (rowX > layout.padLeft && rowX + sysW > layout.padLeft + availW) {
      rowX = layout.padLeft;
      rowY += rowH + layout.sysGap;
      rowH = 0;
    }
    const cx = rowX + sys.r;
    const cy = rowY + sys.r;
    groupRects.push({ classifier: sys.classifier, cx, cy, r: sys.r });
    for (let i = 0; i < sys.chains.length; i++) {
      cardPositions[sys.chains[i].id] = {
        x: cx + sys.centers[i].x - layout.cardD / 2,
        y: cy + sys.centers[i].y - layout.cardD / 2
      };
    }
    rowX += sysW;
    if (sysH > rowH) rowH = sysH;
  }
  return { groups: groupRects, cardPositions };
}

function buildRadialGroupMembership(chains, classifiers) {
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
