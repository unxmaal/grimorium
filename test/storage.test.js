import { describe, it, expect, beforeEach } from "vitest";
import {
  STORE_KEY,
  STORE_KEY_V2,
  DEFAULT_NODES,
  DEFAULT_TINTS,
  makeDefaultChain,
  defaultConfig,
  normalize,
  migrateV2ToV3,
  loadConfig,
  saveConfig
} from "../src/js/storage.js";
import { memoryStorage } from "./helpers/mocks.js";

describe("makeDefaultChain", () => {
  it("creates a single-link chain pointing at the address over http", () => {
    const c = makeDefaultChain("router", "192.168.1.10");
    expect(c.name).toBe("router");
    expect(c.address).toBe("192.168.1.10");
    expect(c.haltOnFail).toBe(true);
    expect(c.classifierIds).toEqual([]);
    expect(c.links).toHaveLength(1);
    expect(c.links[0].probe).toBe("https");
    expect(c.links[0].target).toBe("http://192.168.1.10/");
    expect(c.links[0].expect).toEqual({ kind: "answered" });
  });

  it("assigns unique ids to chain and its link", () => {
    const c = makeDefaultChain("x", "1.1.1.1");
    expect(c.id).toBeTruthy();
    expect(c.links[0].id).toBeTruthy();
    expect(c.links[0].id).not.toBe(c.id);
  });
});

describe("defaultConfig", () => {
  it("includes one chain per default node entry", () => {
    const cfg = defaultConfig();
    expect(cfg.chains).toHaveLength(DEFAULT_NODES.length);
  });

  it("sets sensible config defaults", () => {
    const cfg = defaultConfig();
    expect(cfg.timeoutMs).toBe(5000);
    expect(cfg.parallel).toBe(6);
    expect(cfg.groupByTag).toBe(false);
    expect(cfg.classifiers).toEqual([]);
    expect(cfg.positions).toEqual({});
  });
});

describe("normalize", () => {
  it("fills empty config with defaults", () => {
    const c = normalize({});
    expect(c.chains).toEqual([]);
    expect(c.classifiers).toEqual([]);
    expect(c.positions).toEqual({});
    expect(c.groupByTag).toBe(false);
    expect(c.timeoutMs).toBe(5000);
    expect(c.parallel).toBe(6);
  });

  it("preserves user-set values", () => {
    const c = normalize({ timeoutMs: 1000, parallel: 2, groupByTag: true });
    expect(c.timeoutMs).toBe(1000);
    expect(c.parallel).toBe(2);
    expect(c.groupByTag).toBe(true);
  });

  it("assigns ids to chains and links missing them", () => {
    const c = normalize({
      chains: [{ name: "x", links: [{ name: "l" }] }]
    });
    expect(c.chains[0].id).toBeTruthy();
    expect(c.chains[0].links[0].id).toBeTruthy();
  });

  it("defaults haltOnFail to true on a chain that omits it", () => {
    const c = normalize({ chains: [{ name: "x", links: [] }] });
    expect(c.chains[0].haltOnFail).toBe(true);
  });

  it("preserves haltOnFail: false explicitly", () => {
    const c = normalize({ chains: [{ name: "x", links: [], haltOnFail: false }] });
    expect(c.chains[0].haltOnFail).toBe(false);
  });

  it("defaults link expect to { kind: 'answered' }", () => {
    const c = normalize({ chains: [{ name: "x", links: [{ name: "l" }] }] });
    expect(c.chains[0].links[0].expect).toEqual({ kind: "answered" });
  });

  it("fills classifier defaults", () => {
    const c = normalize({ classifiers: [{ name: "tag" }] });
    expect(c.classifiers[0].id).toBeTruthy();
    expect(c.classifiers[0].glyph).toBe("✦");
    expect(c.classifiers[0].tint).toBe(DEFAULT_TINTS[0]);
  });
});

describe("migrateV2ToV3", () => {
  it("converts a v2 host with no services into a single-link chain", () => {
    const v2 = {
      hosts: [{ id: "h1", name: "router", address: "192.168.1.10", services: [] }]
    };
    const v3 = migrateV2ToV3(v2);
    expect(v3.chains).toHaveLength(1);
    expect(v3.chains[0].name).toBe("router");
    expect(v3.chains[0].id).toBe("h1");
    expect(v3.chains[0].links).toHaveLength(1);
    expect(v3.chains[0].links[0].probe).toBe("https");
    expect(v3.chains[0].links[0].target).toBe("http://192.168.1.10/");
  });

  it("converts v2 services into v3 links, mapping tcp -> ws-tcp", () => {
    const v2 = {
      hosts: [{
        id: "h1", name: "x", address: "1.1.1.1",
        services: [
          { id: "s1", name: "web", type: "http",  target: "http://1.1.1.1/" },
          { id: "s2", name: "ssh", type: "tcp",   target: "1.1.1.1:22" }
        ]
      }]
    };
    const v3 = migrateV2ToV3(v2);
    expect(v3.chains[0].links).toHaveLength(2);
    expect(v3.chains[0].links[0].probe).toBe("https");
    expect(v3.chains[0].links[1].probe).toBe("ws-tcp");
    expect(v3.chains[0].links[1].id).toBe("s2");
  });

  it("preserves saved positions, keyed by the new chain id", () => {
    const v2 = {
      hosts: [{ id: "h42", name: "x", address: "1.1.1.1", services: [] }],
      positions: { h42: { x: 100, y: 200 } }
    };
    const v3 = migrateV2ToV3(v2);
    expect(v3.positions["h42"]).toEqual({ x: 100, y: 200 });
  });

  it("inherits timeoutMs and parallel, defaulting when absent", () => {
    expect(migrateV2ToV3({ hosts: [] }).timeoutMs).toBe(5000);
    expect(migrateV2ToV3({ hosts: [] }).parallel).toBe(6);
    expect(migrateV2ToV3({ hosts: [], timeoutMs: 1000, parallel: 2 }).timeoutMs).toBe(1000);
    expect(migrateV2ToV3({ hosts: [], timeoutMs: 1000, parallel: 2 }).parallel).toBe(2);
  });
});

describe("loadConfig", () => {
  let storage;
  beforeEach(() => { storage = memoryStorage(); });

  it("returns defaultConfig when storage is empty", () => {
    const c = loadConfig(storage);
    expect(c.chains).toHaveLength(DEFAULT_NODES.length);
  });

  it("loads and normalizes a stored v3 config", () => {
    storage.setItem(STORE_KEY, JSON.stringify({ chains: [{ name: "x", links: [] }] }));
    const c = loadConfig(storage);
    expect(c.chains).toHaveLength(1);
    expect(c.chains[0].id).toBeTruthy();
    expect(c.chains[0].haltOnFail).toBe(true);
  });

  it("migrates v2 to v3 on first load and writes back v3 to storage", () => {
    storage.setItem(STORE_KEY_V2, JSON.stringify({
      hosts: [{ id: "h1", name: "x", address: "1.1.1.1", services: [] }]
    }));
    const c = loadConfig(storage);
    expect(c.chains[0].name).toBe("x");
    expect(storage.getItem(STORE_KEY)).toBeTruthy();
  });

  it("falls back to defaults on parse error", () => {
    storage.setItem(STORE_KEY, "{ not valid json");
    const c = loadConfig(storage);
    expect(c.chains).toHaveLength(DEFAULT_NODES.length);
  });
});

describe("saveConfig", () => {
  it("writes JSON config to storage under STORE_KEY", () => {
    const storage = memoryStorage();
    const cfg = { chains: [], classifiers: [], positions: {}, timeoutMs: 5000, parallel: 6 };
    saveConfig(cfg, storage);
    const stored = JSON.parse(storage.getItem(STORE_KEY));
    expect(stored.timeoutMs).toBe(5000);
  });
});
