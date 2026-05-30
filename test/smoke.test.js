import { describe, it, expect } from "vitest";
import { makeChain, makeConfig } from "./helpers/fixtures.js";

describe("test harness", () => {
  it("vitest with jsdom is wired up", () => {
    expect(typeof document).toBe("object");
    expect(typeof window).toBe("object");
  });

  it("fixture helpers produce well-formed chains", () => {
    const c = makeChain({ name: "router" });
    expect(c.name).toBe("router");
    expect(c.links).toHaveLength(1);
    expect(c.haltOnFail).toBe(true);
  });

  it("config fixture defaults are sane", () => {
    const cfg = makeConfig();
    expect(cfg.timeoutMs).toBe(5000);
    expect(cfg.parallel).toBe(6);
    expect(cfg.groupByTag).toBe(false);
  });
});
