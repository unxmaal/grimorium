import { describe, it, expect, vi } from "vitest";
import { DRAG_THRESHOLD, exceedsDragThreshold, dragDelta, dropTargetAt } from "../src/js/drag.js";

describe("exceedsDragThreshold", () => {
  it("is false at the origin", () => {
    expect(exceedsDragThreshold(0, 0)).toBe(false);
  });

  it("is false below the threshold", () => {
    expect(exceedsDragThreshold(2, 2)).toBe(false);
  });

  it("is true at the threshold", () => {
    expect(exceedsDragThreshold(DRAG_THRESHOLD, 0)).toBe(true);
  });

  it("is true beyond the threshold", () => {
    expect(exceedsDragThreshold(10, 0)).toBe(true);
    expect(exceedsDragThreshold(0, 10)).toBe(true);
    expect(exceedsDragThreshold(7, 8)).toBe(true);
  });

  it("respects a caller-supplied threshold", () => {
    expect(exceedsDragThreshold(5, 0, 10)).toBe(false);
    expect(exceedsDragThreshold(11, 0, 10)).toBe(true);
  });
});

describe("dragDelta", () => {
  it("computes dx/dy/distance from start and current points", () => {
    const d = dragDelta(10, 10, 13, 14);
    expect(d.dx).toBe(3);
    expect(d.dy).toBe(4);
    expect(d.distance).toBe(5);
  });

  it("returns moved: false when below threshold", () => {
    const d = dragDelta(0, 0, 2, 2);
    expect(d.moved).toBe(false);
  });

  it("returns moved: true when at or above threshold", () => {
    const d = dragDelta(0, 0, DRAG_THRESHOLD, 0);
    expect(d.moved).toBe(true);
  });

  it("handles negative deltas", () => {
    const d = dragDelta(100, 100, 50, 50);
    expect(d.dx).toBe(-50);
    expect(d.dy).toBe(-50);
    expect(d.distance).toBeCloseTo(70.71, 1);
  });
});

describe("dropTargetAt", () => {
  it("returns the closest matching ancestor of the element at a point", () => {
    const inner = { closest: vi.fn(() => "matched") };
    const doc = { elementFromPoint: vi.fn(() => inner) };
    const result = dropTargetAt(doc, 100, 200, ".target");
    expect(doc.elementFromPoint).toHaveBeenCalledWith(100, 200);
    expect(inner.closest).toHaveBeenCalledWith(".target");
    expect(result).toBe("matched");
  });

  it("returns null when no element exists at the point", () => {
    const doc = { elementFromPoint: vi.fn(() => null) };
    expect(dropTargetAt(doc, 0, 0, ".any")).toBeNull();
  });

  it("returns null when the element has no matching ancestor", () => {
    const inner = { closest: vi.fn(() => null) };
    const doc = { elementFromPoint: vi.fn(() => inner) };
    expect(dropTargetAt(doc, 1, 1, ".missing")).toBeNull();
  });

  it("works with a real jsdom document", () => {
    const outer = document.createElement("div");
    outer.className = "target";
    const inner = document.createElement("span");
    outer.appendChild(inner);
    document.body.appendChild(outer);
    // jsdom's elementFromPoint always returns null without a real renderer, so
    // we exercise via a stub that returns our inner element.
    const fakeDoc = { elementFromPoint: () => inner };
    expect(dropTargetAt(fakeDoc, 5, 5, ".target")).toBe(outer);
    document.body.removeChild(outer);
  });
});
