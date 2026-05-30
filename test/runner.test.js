import { describe, it, expect, vi } from "vitest";
import { runChain, rescryLink, scanAll } from "../src/js/runner.js";
import { makeChain, makeLink } from "./helpers/fixtures.js";

/**
 * Build a fake runLink that returns scripted results keyed by link.name.
 * Each call also records its invocation order.
 */
function scripter(results) {
  const calls = [];
  const fn = vi.fn(async (link) => {
    calls.push(link.name);
    const r = results[link.name];
    if (typeof r === "function") return r(link);
    return r ?? { state: "ok", latency: 50, detail: "ok" };
  });
  return { fn, calls };
}

describe("runChain", () => {
  it("primes every link to 'check' before probing begins", async () => {
    const l1 = makeLink({ name: "a" });
    const l2 = makeLink({ name: "b" });
    const chain = makeChain({ links: [l1, l2] });
    const statusMap = new Map();
    const observed = [];
    const { fn } = scripter({
      a: { state: "ok", latency: 10, detail: "" },
      b: { state: "ok", latency: 10, detail: "" }
    });

    await runChain(chain, statusMap, {
      runLink: fn,
      onTick: (lid) => {
        const st = statusMap.get(lid);
        observed.push([lid, st?.state]);
      }
    });

    // First two onTicks should be "check" priming for both links.
    expect(observed[0]).toEqual([l1.id, "check"]);
    expect(observed[1]).toEqual([l2.id, "check"]);
  });

  it("marks all downstream links 'skipped' after first 'bad' (halt-on-fail default)", async () => {
    const l1 = makeLink({ name: "ok1" });
    const l2 = makeLink({ name: "bad1" });
    const l3 = makeLink({ name: "ok2" });
    const chain = makeChain({ links: [l1, l2, l3] });
    const statusMap = new Map();
    const { fn, calls } = scripter({
      ok1: { state: "ok", latency: 10, detail: "" },
      bad1: { state: "bad", latency: 10, detail: "" },
      ok2: { state: "ok", latency: 10, detail: "" }
    });

    await runChain(chain, statusMap, { runLink: fn });

    expect(statusMap.get(l1.id).state).toBe("ok");
    expect(statusMap.get(l2.id).state).toBe("bad");
    expect(statusMap.get(l3.id).state).toBe("skipped");
    expect(calls).toEqual(["ok1", "bad1"]); // ok2 was never probed
  });

  it("probes all links when haltOnFail is false", async () => {
    const l1 = makeLink({ name: "a" });
    const l2 = makeLink({ name: "b" });
    const l3 = makeLink({ name: "c" });
    const chain = makeChain({ haltOnFail: false, links: [l1, l2, l3] });
    const statusMap = new Map();
    const { fn, calls } = scripter({
      a: { state: "bad", latency: 10, detail: "" },
      b: { state: "ok", latency: 10, detail: "" },
      c: { state: "ok", latency: 10, detail: "" }
    });

    await runChain(chain, statusMap, { runLink: fn });
    expect(calls).toEqual(["a", "b", "c"]);
    expect(statusMap.get(l1.id).state).toBe("bad");
    expect(statusMap.get(l2.id).state).toBe("ok");
    expect(statusMap.get(l3.id).state).toBe("ok");
  });

  it("does not halt on 'warn' results", async () => {
    const l1 = makeLink({ name: "a" }), l2 = makeLink({ name: "b" });
    const chain = makeChain({ links: [l1, l2] });
    const statusMap = new Map();
    const { fn } = scripter({
      a: { state: "warn", latency: 10, detail: "" },
      b: { state: "ok",   latency: 10, detail: "" }
    });
    await runChain(chain, statusMap, { runLink: fn });
    expect(statusMap.get(l2.id).state).toBe("ok");
  });

  it("forwards timeoutMs to runLink", async () => {
    const l1 = makeLink();
    const chain = makeChain({ links: [l1] });
    const fn = vi.fn(async () => ({ state: "ok", latency: 1, detail: "" }));
    await runChain(chain, new Map(), { runLink: fn, timeoutMs: 1234 });
    expect(fn).toHaveBeenCalledWith(expect.anything(), 1234);
  });

  it("emits onTick for every status write (check + result + skipped)", async () => {
    const l1 = makeLink({ name: "ok1" });
    const l2 = makeLink({ name: "bad1" });
    const chain = makeChain({ links: [l1, l2] });
    const statusMap = new Map();
    const ticks = [];
    const { fn } = scripter({
      ok1: { state: "ok", latency: 1, detail: "" },
      bad1: { state: "bad", latency: 1, detail: "" }
    });
    await runChain(chain, statusMap, { runLink: fn, onTick: id => ticks.push(id) });
    // 2 priming "check" ticks + 2 result ticks = 4
    expect(ticks).toHaveLength(4);
  });
});

describe("rescryLink", () => {
  it("primes the link to 'check' and writes the result", async () => {
    const link = makeLink();
    const chain = makeChain({ links: [link] });
    const statusMap = new Map();
    const observed = [];
    const fn = vi.fn(async () => ({ state: "ok", latency: 5, detail: "fresh" }));

    await rescryLink(chain, link, statusMap, {
      runLink: fn,
      onTick: id => observed.push(statusMap.get(id).state)
    });

    expect(observed).toEqual(["check", "ok"]);
    expect(statusMap.get(link.id).detail).toBe("fresh");
  });
});

describe("scanAll", () => {
  it("returns { done: 0, scanned: 0 } when no chains have links", async () => {
    const c1 = makeChain({ links: [] });
    const r = await scanAll([c1], new Map(), {});
    expect(r).toEqual({ done: 0, scanned: 0 });
  });

  it("scans every eligible chain and returns the count", async () => {
    const l1 = makeLink({ name: "a" });
    const l2 = makeLink({ name: "b" });
    const c1 = makeChain({ links: [l1] });
    const c2 = makeChain({ links: [l2] });
    const empty = makeChain({ links: [] });
    const statusMap = new Map();
    const { fn } = scripter({
      a: { state: "ok", latency: 1, detail: "" },
      b: { state: "ok", latency: 1, detail: "" }
    });

    const r = await scanAll([c1, c2, empty], statusMap, { runLink: fn, parallel: 2 });
    expect(r.scanned).toBe(2);
    expect(r.done).toBe(2);
    expect(statusMap.get(l1.id).state).toBe("ok");
    expect(statusMap.get(l2.id).state).toBe("ok");
  });

  it("primes all link statuses to 'check' before the first probe runs", async () => {
    const l1 = makeLink({ name: "slow" });
    const c1 = makeChain({ links: [l1] });
    const statusMap = new Map();
    let probeStartedAt = 0;
    const fn = vi.fn(async () => {
      probeStartedAt = statusMap.get(l1.id).state === "check" ? 1 : 2;
      return { state: "ok", latency: 1, detail: "" };
    });
    await scanAll([c1], statusMap, { runLink: fn });
    expect(probeStartedAt).toBe(1);
  });

  it("respects the parallel cap", async () => {
    const links = Array.from({ length: 6 }, (_, i) => makeLink({ name: `n${i}` }));
    const chains = links.map(l => makeChain({ links: [l] }));
    const statusMap = new Map();
    let inFlight = 0, peak = 0;
    const fn = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 20));
      inFlight--;
      return { state: "ok", latency: 20, detail: "" };
    });
    await scanAll(chains, statusMap, { runLink: fn, parallel: 2 });
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("clamps parallel below 1 to 1", async () => {
    const links = [makeLink({ name: "a" }), makeLink({ name: "b" })];
    const chains = links.map(l => makeChain({ links: [l] }));
    let inFlight = 0, peak = 0;
    const fn = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 10));
      inFlight--;
      return { state: "ok", latency: 10, detail: "" };
    });
    await scanAll(chains, new Map(), { runLink: fn, parallel: 0 });
    expect(peak).toBe(1);
  });

  it("emits onChainTick for each completed chain", async () => {
    const c1 = makeChain({ links: [makeLink()] });
    const c2 = makeChain({ links: [makeLink()] });
    const ticked = [];
    const fn = vi.fn(async () => ({ state: "ok", latency: 1, detail: "" }));
    await scanAll([c1, c2], new Map(), {
      runLink: fn,
      onChainTick: c => ticked.push(c.id)
    });
    // Each chain ticks at least twice: prime + completion.
    expect(ticked.filter(id => id === c1.id).length).toBeGreaterThanOrEqual(2);
    expect(ticked.filter(id => id === c2.id).length).toBeGreaterThanOrEqual(2);
  });
});
