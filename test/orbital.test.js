import { describe, it, expect } from "vitest";
import {
  planRingAssignments,
  outerRadiusForItems,
  createOrbitalState,
  tickOrbitalState,
  chainCardPosition,
  resolveSystemCollisions
} from "../src/js/orbital.js";
import { RADIAL } from "../src/js/layout-radial.js";
import { makeChain, makeClassifier } from "./helpers/fixtures.js";

const seededRand = () => 0.25; // deterministic

const BOUNDS = { minX: 0, minY: 0, maxX: 1600, maxY: 900 };

describe("planRingAssignments", () => {
  it("returns no items for zero count", () => {
    expect(planRingAssignments(0)).toEqual([]);
  });

  it("places items on rings of increasing radius", () => {
    const items = planRingAssignments(20);
    const radii = [...new Set(items.map(i => i.ringR))].sort((a, b) => a - b);
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeGreaterThan(radii[i - 1]);
    }
  });

  it("fills inner ring before allocating an outer ring", () => {
    const items = planRingAssignments(60);
    const ring1Count = items.filter(i => i.ringIdx === 1).length;
    const ring1Slots = items.find(i => i.ringIdx === 1)?.slots;
    expect(ring1Count).toBe(ring1Slots);
  });
});

describe("createOrbitalState", () => {
  it("creates one system in flat mode regardless of classifier count", () => {
    const chains = [makeChain(), makeChain()];
    const state = createOrbitalState({
      chains, classifiers: [makeClassifier()], groupByTag: false,
      bounds: BOUNDS, rand: seededRand
    });
    expect(state.systems.length).toBe(1);
    expect(state.systems[0].vx).toBe(0);
    expect(state.systems[0].vy).toBe(0);
  });

  it("creates one system per classifier in grouped mode", () => {
    const net = makeClassifier({ id: "net" });
    const stor = makeClassifier({ id: "stor" });
    const chains = [
      makeChain({ id: "a", classifierIds: ["net"] }),
      makeChain({ id: "b", classifierIds: ["stor"] })
    ];
    const state = createOrbitalState({
      chains, classifiers: [net, stor], groupByTag: true,
      bounds: BOUNDS, rand: seededRand
    });
    expect(state.systems.map(s => s.id).sort()).toEqual(["net", "stor"]);
    for (const s of state.systems) {
      expect(s.vx === 0 && s.vy === 0).toBe(false);
    }
  });

  it("assigns Kepler-ish omega: inner ring faster than outer", () => {
    const chains = Array.from({ length: 20 }, (_, i) => makeChain({ id: "c" + i }));
    const state = createOrbitalState({
      chains, classifiers: [], groupByTag: false,
      bounds: BOUNDS, rand: seededRand
    });
    const omegas = chains.map(c => state.chains.get(c.id));
    const innerOmega = omegas[0].omega;
    const outerOmega = omegas[omegas.length - 1].omega;
    expect(innerOmega).toBeGreaterThan(outerOmega);
  });

  it("preserves system position and chain angle across rebuilds", () => {
    const net = makeClassifier({ id: "net" });
    const chains = [makeChain({ id: "a", classifierIds: ["net"] })];
    const s1 = createOrbitalState({
      chains, classifiers: [net], groupByTag: true,
      bounds: BOUNDS, rand: seededRand
    });
    s1.systems[0].cx = 700;
    s1.systems[0].cy = 400;
    s1.chains.get("a").theta = 1.234;

    const s2 = createOrbitalState({
      chains, classifiers: [net], groupByTag: true,
      bounds: BOUNDS, rand: seededRand, prev: s1
    });
    expect(s2.systems[0].cx).toBe(700);
    expect(s2.systems[0].cy).toBe(400);
    expect(s2.chains.get("a").theta).toBe(1.234);
  });
});

describe("tickOrbitalState", () => {
  it("advances each chain's angle by omega * dt", () => {
    const chains = [makeChain({ id: "a" })];
    const state = createOrbitalState({
      chains, classifiers: [], groupByTag: false,
      bounds: BOUNDS, rand: seededRand
    });
    const before = state.chains.get("a").theta;
    const omega = state.chains.get("a").omega;
    tickOrbitalState(state, 1000, BOUNDS, null);
    expect(state.chains.get("a").theta).toBeCloseTo(before + omega * 1000, 5);
  });

  it("freezes a dragged chain's angle", () => {
    const chains = [makeChain({ id: "a" }), makeChain({ id: "b" })];
    const state = createOrbitalState({
      chains, classifiers: [], groupByTag: false,
      bounds: BOUNDS, rand: seededRand
    });
    const aBefore = state.chains.get("a").theta;
    const bBefore = state.chains.get("b").theta;
    tickOrbitalState(state, 1000, BOUNDS, new Set(["a"]));
    expect(state.chains.get("a").theta).toBe(aBefore);
    expect(state.chains.get("b").theta).not.toBe(bBefore);
  });

  it("bounces grouped systems off the bounds", () => {
    const net = makeClassifier({ id: "net" });
    const chains = [makeChain({ id: "a", classifierIds: ["net"] })];
    const state = createOrbitalState({
      chains, classifiers: [net], groupByTag: true,
      bounds: BOUNDS, rand: seededRand
    });
    const sys = state.systems[0];
    // Force it against the right edge moving right with a clear velocity.
    sys.cx = BOUNDS.maxX - sys.r;
    sys.vx = 0.1;
    sys.vy = 0;
    tickOrbitalState(state, 50, BOUNDS, null);
    expect(sys.vx).toBeLessThan(0);
    expect(sys.cx).toBeLessThanOrEqual(BOUNDS.maxX - sys.r + 1e-9);
  });
});

describe("resolveSystemCollisions", () => {
  it("separates two overlapping systems along the line of centers", () => {
    const sysA = { id: "a", cx: 200, cy: 300, vx: 0, vy: 0, r: 80 };
    const sysB = { id: "b", cx: 260, cy: 300, vx: 0, vy: 0, r: 80 };
    resolveSystemCollisions([sysA, sysB], BOUNDS, 6);
    const dist = Math.hypot(sysB.cx - sysA.cx, sysB.cy - sysA.cy);
    expect(dist).toBeGreaterThanOrEqual(sysA.r + sysB.r);
  });

  it("nudges coincident centers apart without dividing by zero", () => {
    const sysA = { id: "a", cx: 500, cy: 500, vx: 0, vy: 0, r: 100 };
    const sysB = { id: "b", cx: 500, cy: 500, vx: 0, vy: 0, r: 100 };
    resolveSystemCollisions([sysA, sysB], BOUNDS, 6);
    const dist = Math.hypot(sysB.cx - sysA.cx, sysB.cy - sysA.cy);
    expect(dist).toBeGreaterThan(0);
    expect(Number.isFinite(sysA.cx)).toBe(true);
    expect(Number.isFinite(sysB.cx)).toBe(true);
  });

  it("reflects approach velocities on collision (equal-mass elastic)", () => {
    const sysA = { id: "a", cx: 200, cy: 300, vx: 0.05, vy: 0, r: 80 };
    const sysB = { id: "b", cx: 260, cy: 300, vx: -0.05, vy: 0, r: 80 };
    resolveSystemCollisions([sysA, sysB], BOUNDS, 6);
    // After elastic 1D bounce, A moves left and B moves right.
    expect(sysA.vx).toBeLessThan(0);
    expect(sysB.vx).toBeGreaterThan(0);
  });

  it("leaves a separating pair untouched", () => {
    const sysA = { id: "a", cx: 200, cy: 300, vx: -0.05, vy: 0, r: 80 };
    const sysB = { id: "b", cx: 260, cy: 300, vx: 0.05, vy: 0, r: 80 };
    const vBefore = [sysA.vx, sysB.vx];
    resolveSystemCollisions([sysA, sysB], BOUNDS, 6);
    // They overlap so positions adjust, but velocities should not flip
    // (they're already separating along the normal).
    expect(sysA.vx).toBe(vBefore[0]);
    expect(sysB.vx).toBe(vBefore[1]);
  });
});

describe("chainCardPosition", () => {
  it("returns null for unknown chain", () => {
    const state = createOrbitalState({
      chains: [], classifiers: [], groupByTag: false,
      bounds: BOUNDS, rand: seededRand
    });
    expect(chainCardPosition(state, "nope")).toBeNull();
  });

  it("places the card so its center sits on the orbit", () => {
    const chains = [makeChain({ id: "a" })];
    const state = createOrbitalState({
      chains, classifiers: [], groupByTag: false,
      bounds: BOUNDS, rand: seededRand
    });
    const sys = state.systems[0];
    const ch = state.chains.get("a");
    const pos = chainCardPosition(state, "a");
    const centerX = pos.x + RADIAL.cardD / 2;
    const centerY = pos.y + RADIAL.cardD / 2;
    const dist = Math.hypot(centerX - sys.cx, centerY - sys.cy);
    expect(dist).toBeCloseTo(ch.ringR, 5);
  });
});
