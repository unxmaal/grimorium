import { describe, it, expect } from "vitest";
import {
  RADIAL,
  effectiveAvailWidthRadial,
  computeRadialLayout,
  computeRadialGroupedLayout
} from "../src/js/layout-radial.js";
import { makeChain, makeClassifier } from "./helpers/fixtures.js";

describe("effectiveAvailWidthRadial", () => {
  it("floors at two card-diameters on very narrow windows", () => {
    expect(effectiveAvailWidthRadial(50, false)).toBe(RADIAL.cardD * 2);
  });

  it("subtracts sidepanel width when open", () => {
    const w = effectiveAvailWidthRadial(2000, true);
    expect(w).toBe(2000 - RADIAL.padLeft - RADIAL.sidepanelW);
  });
});

describe("computeRadialLayout", () => {
  it("returns empty positions for zero chains", () => {
    const r = computeRadialLayout([], { availW: 1200, availH: 800 });
    expect(r.cardPositions).toEqual({});
  });

  it("places each chain on a ring around (cx, cy) — never at the hub", () => {
    const chains = Array.from({ length: 6 }, (_, i) => makeChain({ id: "c" + i }));
    const cx = 600, cy = 400;
    const { cardPositions, hub } = computeRadialLayout(chains, { availW: 1200, availH: 800, cx, cy });
    expect(hub.cx).toBe(cx);
    expect(hub.cy).toBe(cy);
    for (const c of chains) {
      const pos = cardPositions[c.id];
      const centerX = pos.x + RADIAL.cardD / 2;
      const centerY = pos.y + RADIAL.cardD / 2;
      const dist = Math.hypot(centerX - cx, centerY - cy);
      // Every card sits at least beyond the hub clear radius.
      expect(dist).toBeGreaterThan(RADIAL.hubR);
    }
  });

  it("packs many chains by adding outer rings", () => {
    const chains = Array.from({ length: 24 }, (_, i) => makeChain({ id: "c" + i }));
    const { cardPositions, hub } = computeRadialLayout(chains, { availW: 2000, availH: 2000, cx: 1000, cy: 1000 });
    // Outer radius must grow with chain count.
    const baseline = computeRadialLayout(chains.slice(0, 4), { availW: 2000, availH: 2000, cx: 1000, cy: 1000 });
    expect(hub.r).toBeGreaterThan(baseline.hub.r);
    expect(Object.keys(cardPositions).length).toBe(24);
  });
});

describe("computeRadialGroupedLayout", () => {
  it("places untagged chains under a null-classifier system", () => {
    const chains = [makeChain({ id: "u1", classifierIds: [] })];
    const r = computeRadialGroupedLayout(chains, [], { availW: 1200 });
    expect(r.groups.length).toBe(1);
    expect(r.groups[0].classifier).toBeNull();
    expect(r.cardPositions["u1"]).toBeDefined();
  });

  it("creates one system per classifier with first-classifier membership", () => {
    const net = makeClassifier({ id: "net" });
    const stor = makeClassifier({ id: "stor" });
    const chains = [
      makeChain({ id: "a", classifierIds: ["net"] }),
      makeChain({ id: "b", classifierIds: ["stor", "net"] }), // first wins
      makeChain({ id: "c", classifierIds: ["net"] }),
      makeChain({ id: "d", classifierIds: ["stor"] })
    ];
    const r = computeRadialGroupedLayout(chains, [net, stor], { availW: 1600 });
    const byId = Object.fromEntries(r.groups.map(g => [g.classifier?.id ?? null, g]));
    expect(Object.keys(byId).sort()).toEqual(["net", "stor"]);
  });

  it("wraps systems onto a second row when they exceed availW", () => {
    const cls = Array.from({ length: 4 }, (_, i) => makeClassifier({ id: "c" + i }));
    const chains = cls.flatMap(c =>
      Array.from({ length: 6 }, (_, i) => makeChain({ id: c.id + "-" + i, classifierIds: [c.id] })));
    const tightAvailW = RADIAL.padLeft + 600; // forces wrap
    const r = computeRadialGroupedLayout(chains, cls, { availW: tightAvailW });
    const ys = r.groups.map(g => g.cy);
    expect(new Set(ys).size).toBeGreaterThan(1);
  });
});
