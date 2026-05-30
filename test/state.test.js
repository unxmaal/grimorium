import { describe, it, expect } from "vitest";
import {
  aggregateChainState,
  pillCls,
  getByPath,
  clamp,
  hash32,
  fmtLatency,
  fmtTime
} from "../src/js/state.js";
import { makeChain, makeLink } from "./helpers/fixtures.js";

const statusOf = (entries) => new Map(entries.map(([id, state, extra]) =>
  [id, { state, latency: 50, detail: "", ts: 0, ...(extra ?? {}) }]));

describe("aggregateChainState", () => {
  it("returns unk for a chain with no links", () => {
    const chain = makeChain({ links: [] });
    expect(aggregateChainState(chain, new Map())).toEqual({
      state: "unk", total: 0, up: 0, firstBadIdx: -1
    });
  });

  it("returns unk when no links have been probed", () => {
    const chain = makeChain({ links: [makeLink(), makeLink()] });
    const agg = aggregateChainState(chain, new Map());
    expect(agg.state).toBe("unk");
    expect(agg.total).toBe(2);
    expect(agg.up).toBe(0);
    expect(agg.firstBadIdx).toBe(-1);
  });

  it("reports ok when all probed links are ok (regression: unk used to win)", () => {
    const l1 = makeLink(), l2 = makeLink();
    const chain = makeChain({ links: [l1, l2] });
    const sm = statusOf([[l1.id, "ok"], [l2.id, "ok"]]);
    expect(aggregateChainState(chain, sm).state).toBe("ok");
  });

  it("reports ok when at least one link is ok and the rest unprobed", () => {
    const l1 = makeLink(), l2 = makeLink();
    const chain = makeChain({ links: [l1, l2] });
    const sm = statusOf([[l1.id, "ok"]]);
    const agg = aggregateChainState(chain, sm);
    expect(agg.state).toBe("ok");
    expect(agg.up).toBe(1);
    expect(agg.total).toBe(2);
  });

  it("warn beats ok in aggregate", () => {
    const l1 = makeLink(), l2 = makeLink();
    const chain = makeChain({ links: [l1, l2] });
    const sm = statusOf([[l1.id, "ok"], [l2.id, "warn"]]);
    expect(aggregateChainState(chain, sm).state).toBe("warn");
  });

  it("bad beats warn beats ok", () => {
    const l1 = makeLink(), l2 = makeLink(), l3 = makeLink();
    const chain = makeChain({ links: [l1, l2, l3] });
    const sm = statusOf([[l1.id, "ok"], [l2.id, "warn"], [l3.id, "bad"]]);
    const agg = aggregateChainState(chain, sm);
    expect(agg.state).toBe("bad");
    expect(agg.firstBadIdx).toBe(2);
  });

  it("firstBadIdx is the position of the first bad link, not the last", () => {
    const l1 = makeLink(), l2 = makeLink(), l3 = makeLink();
    const chain = makeChain({ links: [l1, l2, l3] });
    const sm = statusOf([[l1.id, "ok"], [l2.id, "bad"], [l3.id, "bad"]]);
    expect(aggregateChainState(chain, sm).firstBadIdx).toBe(1);
  });

  it("skipped does not override bad in aggregate", () => {
    const l1 = makeLink(), l2 = makeLink(), l3 = makeLink();
    const chain = makeChain({ links: [l1, l2, l3] });
    const sm = statusOf([[l1.id, "ok"], [l2.id, "bad"], [l3.id, "skipped"]]);
    expect(aggregateChainState(chain, sm).state).toBe("bad");
  });

  it("counts only ok links in `up`", () => {
    const l1 = makeLink(), l2 = makeLink(), l3 = makeLink();
    const chain = makeChain({ links: [l1, l2, l3] });
    const sm = statusOf([[l1.id, "ok"], [l2.id, "ok"], [l3.id, "bad"]]);
    expect(aggregateChainState(chain, sm).up).toBe(2);
  });

  it("check overrides ok during a scan", () => {
    const l1 = makeLink(), l2 = makeLink();
    const chain = makeChain({ links: [l1, l2] });
    const sm = statusOf([[l1.id, "ok"], [l2.id, "check"]]);
    expect(aggregateChainState(chain, sm).state).toBe("check");
  });
});

describe("pillCls", () => {
  it("maps every defined state to its class name", () => {
    expect(pillCls("ok")).toBe("ok");
    expect(pillCls("warn")).toBe("warn");
    expect(pillCls("bad")).toBe("bad");
    expect(pillCls("check")).toBe("check");
    expect(pillCls("skipped")).toBe("skipped");
    expect(pillCls("unk")).toBe("unk");
  });

  it("falls back to unk for unrecognized states", () => {
    expect(pillCls("nonsense")).toBe("unk");
    expect(pillCls(undefined)).toBe("unk");
  });
});

describe("getByPath", () => {
  it("returns the object when path is empty", () => {
    const o = { a: 1 };
    expect(getByPath(o, "")).toBe(o);
  });

  it("reads a single key", () => {
    expect(getByPath({ a: 1 }, "a")).toBe(1);
  });

  it("walks a nested path", () => {
    expect(getByPath({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42);
  });

  it("returns undefined for missing keys", () => {
    expect(getByPath({ a: 1 }, "b")).toBeUndefined();
    expect(getByPath({ a: { b: 1 } }, "a.c")).toBeUndefined();
  });

  it("returns undefined when traversing through null", () => {
    expect(getByPath({ a: null }, "a.b")).toBeUndefined();
  });
});

describe("clamp", () => {
  it("returns the value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it("clamps below the lower bound", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });
  it("clamps above the upper bound", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("hash32", () => {
  it("is deterministic", () => {
    expect(hash32("hello")).toBe(hash32("hello"));
  });
  it("returns a non-negative integer", () => {
    expect(hash32("anything")).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(hash32("anything"))).toBe(true);
  });
  it("differs for different inputs", () => {
    expect(hash32("a")).not.toBe(hash32("b"));
  });
});

describe("fmtLatency", () => {
  it("renders null as em dash", () => {
    expect(fmtLatency(null)).toBe("—");
    expect(fmtLatency(undefined)).toBe("—");
  });
  it("renders sub-millisecond as <1ms", () => {
    expect(fmtLatency(0.4)).toBe("<1ms");
  });
  it("renders ms for sub-second values", () => {
    expect(fmtLatency(124)).toBe("124ms");
    expect(fmtLatency(999)).toBe("999ms");
  });
  it("renders seconds with two decimals at or above 1s", () => {
    expect(fmtLatency(1000)).toBe("1.00s");
    expect(fmtLatency(2500)).toBe("2.50s");
  });
});

describe("fmtTime", () => {
  it("formats a date as HH:MM:SS in 24h", () => {
    const d = new Date("2024-01-01T13:45:09");
    expect(fmtTime(d)).toBe("13:45:09");
  });
  it("defaults to now when called with no args", () => {
    expect(fmtTime()).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
