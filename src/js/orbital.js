// Animated radial state. Each "system" is a classifier hub (or, in flat
// radial mode, the viewport center) that may drift slowly across the
// canvas. Each chain orbits its system at a fixed ring radius, with
// angular speed inversely proportional to that radius (Kepler-ish).
// Systems bounce off each other and off the viewport edges.
//
// Pure math + state holder — DOM updates live in main.js.

import { RADIAL } from "./layout-radial.js";

// Visual breathing room enforced between two systems (in addition to the
// sum of their radii). Without this, systems graze each other and the
// display still reads as crowded.
const SYSTEM_BUFFER = 14;

/** Ring assignment plan for n items: each gets {ringIdx, slots, ringR, baseTheta}. */
export function planRingAssignments(n, layout = RADIAL) {
  const items = [];
  const { cardD, ringGap, slotGap, hubR } = layout;
  let placed = 0;
  let ring = 1;
  while (placed < n && ring <= 16) {
    const r = hubR + cardD * (ring - 0.5) + ringGap * (ring - 1);
    const circumference = 2 * Math.PI * r;
    const slots = Math.max(1, Math.floor(circumference / (cardD + slotGap)));
    const angStep = (Math.PI * 2) / slots;
    for (let s = 0; s < slots && placed < n; s++) {
      items.push({
        ringIdx: ring,
        slots,
        ringR: r,
        baseTheta: s * angStep - Math.PI / 2
      });
      placed++;
    }
    ring++;
  }
  return items;
}

export function outerRadiusForItems(items, layout = RADIAL) {
  if (items.length === 0) return layout.hubR;
  let maxR = layout.hubR;
  for (const it of items) {
    const eff = it.ringR + layout.cardD / 2;
    if (eff > maxR) maxR = eff;
  }
  return maxR;
}

/**
 * Build initial orbital state for the current chain/classifier set.
 *
 * @param {object} opts
 * @param {Array}  opts.chains
 * @param {Array}  opts.classifiers
 * @param {bool}   opts.groupByTag      true → one system per first-classifier; false → one big system
 * @param {object} opts.bounds          { minX, minY, maxX, maxY }
 * @param {object} [opts.prev]          previous orbital state (preserves angles + drift)
 * @param {function} [opts.rand]        Math.random replacement (for tests)
 */
export function createOrbitalState(opts) {
  const layout = RADIAL;
  const rand = opts.rand || Math.random;
  const { chains, classifiers, groupByTag, bounds, prev } = opts;

  const memberships = buildMembership(chains, classifiers, groupByTag);
  const systems = [];
  const chainEntries = new Map();

  for (const m of memberships) {
    const items = planRingAssignments(m.chains.length, layout);
    const sysR = Math.max(layout.hubR + layout.cardD / 2, outerRadiusForItems(items, layout));
    const sysId = m.classifier ? m.classifier.id : "_untagged";
    const cls = m.classifier;

    // Carry forward drift state if this system existed before.
    const prevSys = prev?.systems.find(s => s.id === sysId);
    const sys = {
      id: sysId,
      classifier: cls,
      cx: prevSys?.cx ?? 0,
      cy: prevSys?.cy ?? 0,
      vx: prevSys?.vx ?? 0,
      vy: prevSys?.vy ?? 0,
      r: sysR,
      chainIds: m.chains.map(c => c.id)
    };
    systems.push(sys);

    const innermost = items[0]?.ringR ?? layout.hubR;
    for (let i = 0; i < m.chains.length; i++) {
      const it = items[i];
      // Kepler-ish: ω = base * (innerR / ringR). Inner orbits faster.
      const omega = 0.00010 * (innermost / it.ringR);
      const prevCh = prev?.chains.get(m.chains[i].id);
      chainEntries.set(m.chains[i].id, {
        sysId,
        ringR: it.ringR,
        theta: prevCh?.theta ?? it.baseTheta,
        omega
      });
    }
  }

  initialPlace(systems, bounds, rand, groupByTag);
  if (groupByTag) resolveSystemCollisions(systems, bounds, 6);

  return { systems, chains: chainEntries };
}

/**
 * Push overlapping systems apart and reflect their approach velocities.
 * Equal-mass elastic collision along the line connecting centers. Wall
 * clamping is applied between iterations so a system pressed against an
 * edge doesn't get pushed through.
 */
export function resolveSystemCollisions(systems, bounds, iterations = 3) {
  for (let iter = 0; iter < iterations; iter++) {
    let any = false;
    for (let i = 0; i < systems.length; i++) {
      for (let j = i + 1; j < systems.length; j++) {
        const a = systems[i], b = systems[j];
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        let dist = Math.hypot(dx, dy);
        const minDist = a.r + b.r + SYSTEM_BUFFER;
        if (dist >= minDist) continue;
        any = true;
        let nx, ny;
        if (dist < 1e-6) {
          // Coincident centers: pick an arbitrary normal.
          nx = 1; ny = 0;
          dist = 0;
        } else {
          nx = dx / dist;
          ny = dy / dist;
        }
        const overlap = minDist - dist;
        a.cx -= nx * overlap / 2;
        a.cy -= ny * overlap / 2;
        b.cx += nx * overlap / 2;
        b.cy += ny * overlap / 2;
        // Reflect only the closing component of relative velocity.
        const relV = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (relV > 0) {
          a.vx -= relV * nx;
          a.vy -= relV * ny;
          b.vx += relV * nx;
          b.vy += relV * ny;
        }
      }
    }
    if (!any) break;
    for (const sys of systems) {
      sys.cx = Math.min(bounds.maxX - sys.r, Math.max(bounds.minX + sys.r, sys.cx));
      sys.cy = Math.min(bounds.maxY - sys.r, Math.max(bounds.minY + sys.r, sys.cy));
    }
  }
}

function buildMembership(chains, classifiers, groupByTag) {
  if (!groupByTag) {
    return [{ classifier: null, chains }];
  }
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

function initialPlace(systems, bounds, rand, groupByTag) {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;

  if (!groupByTag) {
    // Flat radial: single fixed hub centered on the current bounds.
    // Always re-center so the sidepanel toggle re-aligns the system.
    if (systems.length > 0) {
      const s = systems[0];
      s.cx = bounds.minX + w / 2;
      s.cy = bounds.minY + h / 2;
      s.vx = 0;
      s.vy = 0;
    }
    return;
  }

  // Grouped: tile systems in a grid, then assign small random drift.
  // If a system already had a position from `prev`, keep it (after clamp).
  const SPEED = 0.012; // px/ms ~= 12 px/sec
  const cells = packToGrid(systems.map(s => s.r), w, h);
  for (let i = 0; i < systems.length; i++) {
    const sys = systems[i];
    if (sys.cx === 0 && sys.cy === 0) {
      sys.cx = bounds.minX + cells[i].cx;
      sys.cy = bounds.minY + cells[i].cy;
    }
    // Clamp to bounds with the system's radius as margin.
    const minCX = bounds.minX + sys.r;
    const maxCX = bounds.maxX - sys.r;
    const minCY = bounds.minY + sys.r;
    const maxCY = bounds.maxY - sys.r;
    sys.cx = Math.min(maxCX, Math.max(minCX, sys.cx));
    sys.cy = Math.min(maxCY, Math.max(minCY, sys.cy));
    if (sys.vx === 0 && sys.vy === 0) {
      const ang = rand() * Math.PI * 2;
      sys.vx = Math.cos(ang) * SPEED;
      sys.vy = Math.sin(ang) * SPEED;
    }
  }
}

/** Tile circles in a row-pack. Returns per-system { cx, cy } relative to (0,0). */
function packToGrid(radii, w, h) {
  const gap = RADIAL.sysGap;
  const cells = new Array(radii.length);
  let rowX = 0, rowY = 0, rowH = 0;
  for (let i = 0; i < radii.length; i++) {
    const d = radii[i] * 2 + gap;
    if (rowX > 0 && rowX + d > w) {
      rowX = 0;
      rowY += rowH + gap;
      rowH = 0;
    }
    cells[i] = { cx: rowX + radii[i], cy: rowY + radii[i] };
    rowX += d;
    if (d > rowH) rowH = d;
  }
  // Center the packed block in the bounds if it doesn't fill them.
  const usedH = rowY + rowH;
  const yOffset = Math.max(0, (h - usedH) / 2);
  for (const c of cells) c.cy += yOffset;
  return cells;
}

/**
 * Advance one tick. Systems drift and bounce off bounds. Chains advance
 * by their omega. Skips chains in `frozenIds` (used during drag).
 */
export function tickOrbitalState(state, dt, bounds, frozenIds) {
  for (const sys of state.systems) {
    if (sys.vx === 0 && sys.vy === 0) continue;
    sys.cx += sys.vx * dt;
    sys.cy += sys.vy * dt;
    const minCX = bounds.minX + sys.r;
    const maxCX = bounds.maxX - sys.r;
    const minCY = bounds.minY + sys.r;
    const maxCY = bounds.maxY - sys.r;
    if (sys.cx < minCX) { sys.cx = minCX; sys.vx = Math.abs(sys.vx); }
    if (sys.cx > maxCX) { sys.cx = maxCX; sys.vx = -Math.abs(sys.vx); }
    if (sys.cy < minCY) { sys.cy = minCY; sys.vy = Math.abs(sys.vy); }
    if (sys.cy > maxCY) { sys.cy = maxCY; sys.vy = -Math.abs(sys.vy); }
  }
  if (state.systems.length > 1) {
    resolveSystemCollisions(state.systems, bounds, 3);
  }
  for (const [chainId, ch] of state.chains.entries()) {
    if (frozenIds && frozenIds.has(chainId)) continue;
    ch.theta += ch.omega * dt;
    // Keep theta in [0, 2π) so it doesn't lose precision over hours.
    if (ch.theta > Math.PI * 2) ch.theta -= Math.PI * 2;
  }
}

/** Top-left position for a chain's card given current orbital state. */
export function chainCardPosition(state, chainId, cardD = RADIAL.cardD) {
  const ch = state.chains.get(chainId);
  if (!ch) return null;
  const sys = state.systems.find(s => s.id === ch.sysId);
  if (!sys) return null;
  return {
    x: sys.cx + Math.cos(ch.theta) * ch.ringR - cardD / 2,
    y: sys.cy + Math.sin(ch.theta) * ch.ringR - cardD / 2
  };
}
