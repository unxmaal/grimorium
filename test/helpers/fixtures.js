let _id = 0;
const id = (prefix = "x") => `${prefix}${++_id}`;

export function resetIds() { _id = 0; }

export function makeLink(overrides = {}) {
  return {
    id: id("l"),
    name: "test link",
    probe: "https",
    target: "http://192.168.1.10/",
    expect: { kind: "answered" },
    ...overrides
  };
}

export function makeChain(overrides = {}) {
  const { links, ...rest } = overrides;
  return {
    id: id("c"),
    name: "test chain",
    address: "192.168.1.10",
    haltOnFail: true,
    classifierIds: [],
    links: links ?? [makeLink()],
    ...rest
  };
}

export function makeClassifier(overrides = {}) {
  return {
    id: id("cls"),
    name: "test",
    glyph: "✦",
    tint: "#8ee066",
    ...overrides
  };
}

export function makeConfig(overrides = {}) {
  return {
    chains: [],
    classifiers: [],
    positions: {},
    groupByTag: false,
    timeoutMs: 5000,
    parallel: 6,
    ...overrides
  };
}
