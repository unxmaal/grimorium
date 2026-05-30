import { describe, it, expect } from "vitest";
import {
  LAYOUT,
  effectiveAvailWidth,
  autoGridPosition,
  buildGroupMembership,
  computeGroupedLayout
} from "../src/js/layout.js";
import { makeChain, makeClassifier } from "./helpers/fixtures.js";

describe("effectiveAvailWidth", () => {
  it("subtracts padLeft and padRight when sidepanel is closed", () => {
    const w = effectiveAvailWidth(1200, false);
    expect(w).toBe(1200 - LAYOUT.padLeft - LAYOUT.padRight);
  });

  it("subtracts padLeft and sidepanelW when sidepanel is open", () => {
    const w = effectiveAvailWidth(1200, true);
    expect(w).toBe(1200 - LAYOUT.padLeft - LAYOUT.sidepanelW);
  });

  it("floors at one card-width even on very narrow windows", () => {
    const w = effectiveAvailWidth(100, false);
    expect(w).toBe(LAYOUT.cardW);
  });
});

describe("autoGridPosition", () => {
  it("places the first card at the top-left padded origin", () => {
    const pos = autoGridPosition(0, 1000);
    expect(pos.x).toBe(LAYOUT.padLeft);
    expect(pos.y).toBe(LAYOUT.padTop + 6);
  });

  it("advances by cardW + gap on each column", () => {
    const a = autoGridPosition(0, 1000);
    const b = autoGridPosition(1, 1000);
    expect(b.x).toBe(a.x + LAYOUT.cardW + LAYOUT.gap);
    expect(b.y).toBe(a.y);
  });

  it("wraps to the next row once columns are used up", () => {
    // 1000px wide: floor((1000+14)/(224+14)) = 4 columns
    const a = autoGridPosition(0, 1000);
    const e = autoGridPosition(4, 1000);
    expect(e.x).toBe(LAYOUT.padLeft);
    expect(e.y).toBe(a.y + LAYOUT.cardHMin + LAYOUT.gap);
  });

  it("never uses fewer than one column", () => {
    const a = autoGridPosition(0, 1);
    const b = autoGridPosition(1, 1);
    expect(b.x).toBe(LAYOUT.padLeft);   // wrapped immediately
    expect(b.y).toBeGreaterThan(a.y);
  });
});

describe("buildGroupMembership", () => {
  it("returns a single untagged group when there are no classifiers", () => {
    const chains = [makeChain(), makeChain()];
    const groups = buildGroupMembership(chains, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].classifier).toBeNull();
    expect(groups[0].chains).toHaveLength(2);
  });

  it("places chains in their first classifier's group", () => {
    const cls1 = makeClassifier({ name: "a" });
    const cls2 = makeClassifier({ name: "b" });
    const c1 = makeChain({ classifierIds: [cls1.id] });
    const c2 = makeChain({ classifierIds: [cls2.id, cls1.id] });
    const groups = buildGroupMembership([c1, c2], [cls1, cls2]);
    const aGroup = groups.find(g => g.classifier?.id === cls1.id);
    const bGroup = groups.find(g => g.classifier?.id === cls2.id);
    expect(aGroup.chains).toContain(c1);
    expect(bGroup.chains).toContain(c2);
    // c2 only lives in its FIRST classifier's group (b), not also in a's group
    expect(aGroup.chains).not.toContain(c2);
  });

  it("creates an untagged group for chains with no classifiers", () => {
    const cls = makeClassifier();
    const tagged = makeChain({ classifierIds: [cls.id] });
    const untagged = makeChain({ classifierIds: [] });
    const groups = buildGroupMembership([tagged, untagged], [cls]);
    expect(groups).toHaveLength(2);
    expect(groups[1].classifier).toBeNull();
    expect(groups[1].chains).toContain(untagged);
  });

  it("emits classifier groups in the order they're declared", () => {
    const a = makeClassifier({ name: "a" });
    const b = makeClassifier({ name: "b" });
    const c = makeClassifier({ name: "c" });
    const chA = makeChain({ classifierIds: [a.id] });
    const chB = makeChain({ classifierIds: [b.id] });
    const chC = makeChain({ classifierIds: [c.id] });
    const groups = buildGroupMembership([chC, chA, chB], [a, b, c]);
    expect(groups.map(g => g.classifier?.name)).toEqual(["a", "b", "c"]);
  });

  it("omits a classifier's group when no chains live there", () => {
    const a = makeClassifier({ name: "a" });
    const b = makeClassifier({ name: "b" });
    const ch = makeChain({ classifierIds: [a.id] });
    const groups = buildGroupMembership([ch], [a, b]);
    expect(groups.map(g => g.classifier?.name)).toEqual(["a"]);
  });
});

describe("computeGroupedLayout", () => {
  it("returns one group rect per emitted group", () => {
    const a = makeClassifier({ name: "a" });
    const c1 = makeChain({ classifierIds: [a.id] });
    const c2 = makeChain({});
    const { groups } = computeGroupedLayout([c1, c2], [a], { availW: 1000 });
    expect(groups).toHaveLength(2);
  });

  it("the first group sits at padTop + 6 with full availW", () => {
    const c1 = makeChain({});
    const { groups } = computeGroupedLayout([c1], [], { availW: 1000 });
    expect(groups[0].x).toBe(LAYOUT.padLeft);
    expect(groups[0].y).toBe(LAYOUT.padTop + 6);
    expect(groups[0].w).toBe(1000);
  });

  it("the second group stacks below the first with a gap", () => {
    const a = makeClassifier();
    const c1 = makeChain({ classifierIds: [a.id] });
    const c2 = makeChain({});
    const { groups } = computeGroupedLayout([c1, c2], [a], { availW: 1000 });
    expect(groups[1].y).toBe(groups[0].y + groups[0].h + LAYOUT.gap);
  });

  it("returns a cardPositions entry for every chain", () => {
    const a = makeClassifier();
    const c1 = makeChain({ classifierIds: [a.id] });
    const c2 = makeChain({});
    const { cardPositions } = computeGroupedLayout([c1, c2], [a], { availW: 1000 });
    expect(cardPositions[c1.id]).toBeTruthy();
    expect(cardPositions[c2.id]).toBeTruthy();
  });

  it("places cards inside the group rect (offset by innerPadX/Y under headerH)", () => {
    const c1 = makeChain({});
    const { groups, cardPositions } = computeGroupedLayout([c1], [], { availW: 1000 });
    expect(cardPositions[c1.id].x).toBe(groups[0].x + LAYOUT.innerPadX);
    expect(cardPositions[c1.id].y).toBe(groups[0].y + LAYOUT.headerH + LAYOUT.innerPadY);
  });

  it("uses per-row max card height (tallest member grows the row)", () => {
    // Build 3 chains; chain[1] is twice the height of the others.
    const cs = [makeChain(), makeChain(), makeChain()];
    const heights = { [cs[0].id]: 80, [cs[1].id]: 160, [cs[2].id]: 80 };
    const { groups, cardPositions } = computeGroupedLayout(cs, [], {
      availW: 1000,
      cardHeightOf: (id) => heights[id]
    });
    // First three should be on the same row (1000px wide, 224 + 14 → 4 cols).
    expect(cardPositions[cs[0].id].y).toBe(cardPositions[cs[1].id].y);
    expect(cardPositions[cs[1].id].y).toBe(cardPositions[cs[2].id].y);
    // Group height accommodates the 160px card.
    expect(groups[0].h).toBeGreaterThanOrEqual(160 + LAYOUT.headerH + LAYOUT.innerPadY * 2);
  });

  it("wraps cards to a new row inside a group when there are more chains than cols", () => {
    // 200px availW + 16*2 inner pad = 168px usable → 0 full columns, clamped to 1 col.
    // Each chain wraps to its own row.
    const cs = [makeChain(), makeChain(), makeChain()];
    const { cardPositions } = computeGroupedLayout(cs, [], { availW: 200 });
    expect(cardPositions[cs[0].id].y).toBeLessThan(cardPositions[cs[1].id].y);
    expect(cardPositions[cs[1].id].y).toBeLessThan(cardPositions[cs[2].id].y);
  });

  it("respects layout overrides for cardW, gap, etc.", () => {
    const c1 = makeChain();
    const { cardPositions } = computeGroupedLayout([c1], [], {
      availW: 1000,
      layout: { padLeft: 0, padTop: 0, innerPadX: 0, innerPadY: 0, headerH: 0 }
    });
    expect(cardPositions[c1.id].x).toBe(0);
    expect(cardPositions[c1.id].y).toBe(6);
  });
});
