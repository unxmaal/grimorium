// Configuration schema, defaults, migration, persistence.
// All functions are pure or take an injectable storage backend for testability.

import { cryptoRandomId } from "./state.js";

export const STORE_KEY    = "grimorium.config.v3";
export const STORE_KEY_V2 = "grimorium.config.v2";

// Generic example chains. The published build ships with these so a fresh
// visitor sees something working; personal hosts go in via Inscribe and
// persist to localStorage. Never put real LAN info here — this file is
// bundled into the public index.html.
export const DEFAULT_NODES = [
  ["router",      "192.168.1.10"],
  ["public DNS",  "1.1.1.1"],
  ["example.com", "example.com"]
];

export const DEFAULT_TINTS = [
  "#8ee066", "#ffcf3f", "#d18b1d", "#b8521c",
  "#7c9ed8", "#c87ad1", "#7adcc7", "#d87a7a"
];

export function makeDefaultChain(name, address) {
  return {
    id: cryptoRandomId(),
    name,
    address,
    haltOnFail: true,
    classifierIds: [],
    links: [{
      id: cryptoRandomId(),
      name: "reachable",
      probe: "https",
      target: "http://" + address + "/",
      expect: { kind: "answered" }
    }]
  };
}

export function defaultConfig() {
  return {
    chains: DEFAULT_NODES.map(([n, a]) => makeDefaultChain(n, a)),
    classifiers: [],
    positions: {},
    groupByTag: false,
    themeId: "grimorium",
    timeoutMs: 5000,
    parallel: 6
  };
}

/** Fill in missing fields on a loaded config so the rest of the app can rely on shape. Mutates input. */
export function normalize(c) {
  c.chains ||= [];
  c.classifiers ||= [];
  c.positions ||= {};
  c.groupByTag ??= false;
  c.themeId ??= "grimorium";
  c.timeoutMs ??= 5000;
  c.parallel ??= 6;
  for (const ch of c.chains) {
    ch.id ||= cryptoRandomId();
    ch.haltOnFail ??= true;
    ch.classifierIds ||= [];
    ch.links ||= [];
    for (const l of ch.links) {
      l.id ||= cryptoRandomId();
      l.expect ||= { kind: "answered" };
    }
  }
  for (const cls of c.classifiers) {
    cls.id ||= cryptoRandomId();
    cls.glyph ||= "✦";
    cls.tint ||= DEFAULT_TINTS[0];
  }
  return c;
}

/** Migrate a v2 (hosts/services) config to v3 (chains/links). */
export function migrateV2ToV3(old) {
  const chains = [];
  const positions = {};
  for (const h of (old.hosts || [])) {
    const links = [];
    if (h.services && h.services.length) {
      for (const s of h.services) {
        links.push({
          id: s.id || cryptoRandomId(),
          name: s.name || "rite",
          probe: s.type === "tcp" ? "ws-tcp" : "https",
          target: s.target,
          expect: { kind: "answered" }
        });
      }
    } else {
      links.push({
        id: cryptoRandomId(),
        name: "reachable",
        probe: "https",
        target: h.address ? "http://" + h.address + "/" : "",
        expect: { kind: "answered" }
      });
    }
    const chainId = h.id || cryptoRandomId();
    chains.push({
      id: chainId,
      name: h.name,
      address: h.address,
      haltOnFail: true,
      classifierIds: [],
      links
    });
    if (old.positions && old.positions[h.id]) positions[chainId] = old.positions[h.id];
  }
  return {
    chains,
    classifiers: [],
    positions,
    timeoutMs: old.timeoutMs ?? 5000,
    parallel: old.parallel ?? 6
  };
}

/**
 * Read config from storage, migrating from v2 on first encounter.
 * @param {Storage} storage  defaults to globalThis.localStorage in browsers.
 */
export function loadConfig(storage = globalThis.localStorage) {
  try {
    const rawV3 = storage.getItem(STORE_KEY);
    if (rawV3) return normalize(JSON.parse(rawV3));
    const rawV2 = storage.getItem(STORE_KEY_V2);
    if (rawV2) {
      const migrated = migrateV2ToV3(JSON.parse(rawV2));
      storage.setItem(STORE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return defaultConfig();
  } catch (e) {
    console.warn("config load failed, using defaults:", e);
    return defaultConfig();
  }
}

export function saveConfig(config, storage = globalThis.localStorage) {
  storage.setItem(STORE_KEY, JSON.stringify(config));
}
