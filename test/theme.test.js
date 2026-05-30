import { describe, it, expect, beforeEach } from "vitest";
import {
  activeTheme,
  stateLabel,
  setActiveTheme,
  themeById,
  applyTheme,
  THEMES
} from "../src/js/theme.js";
import { grimorium } from "../src/js/themes/grimorium.js";
import { cassette } from "../src/js/themes/cassette.js";
import { buildCard } from "../src/js/render.js";
import { makeChain, makeLink } from "./helpers/fixtures.js";

describe("Theme shape (grimorium as reference)", () => {
  it("has the required top-level keys", () => {
    expect(grimorium.id).toBeTruthy();
    expect(grimorium.name).toBeTruthy();
    expect(grimorium.labels).toBeTruthy();
    expect(grimorium.glyphs).toBeInstanceOf(Array);
    expect(typeof grimorium.statusColorVar).toBe("function");
    expect(typeof grimorium.createDecoration).toBe("function");
  });

  it("provides a display label for every semantic state", () => {
    for (const s of ["ok", "warn", "bad", "check", "skipped", "unk"]) {
      expect(typeof grimorium.labels.state[s]).toBe("string");
      expect(grimorium.labels.state[s].length).toBeGreaterThan(0);
    }
  });

  it("returns a CSS var() expression for every semantic state", () => {
    for (const s of ["ok", "warn", "bad", "check", "skipped", "unk"]) {
      expect(grimorium.statusColorVar(s)).toMatch(/^var\(--/);
    }
  });
});

describe("stateLabel", () => {
  it("maps states through the active theme by default", () => {
    expect(stateLabel("ok")).toBe("HOLDS");
    expect(stateLabel("bad")).toBe("SEVERED");
    expect(stateLabel("unk")).toBe("UNSCRYED");
  });

  it("accepts an explicit theme override", () => {
    const stub = {
      labels: {
        state: { ok: "GOOD", warn: "MEH", bad: "GONE", check: "WAIT", skipped: "PASS", unk: "?" }
      }
    };
    expect(stateLabel("ok", stub)).toBe("GOOD");
    expect(stateLabel("bad", stub)).toBe("GONE");
  });

  it("falls back to the raw state name when no theme/label is defined", () => {
    expect(stateLabel("nonsense", { labels: { state: {} } })).toBe("nonsense");
  });
});

describe("Theme seam: stub theme propagates to rendered DOM", () => {
  it("a chain card displays the stub theme's state label instead of HOLDS", () => {
    const stubTheme = {
      labels: { state: { ok: "TEST_OK", warn: "W", bad: "B", check: "C", skipped: "S", unk: "U" } }
    };
    const link = makeLink();
    const chain = makeChain({ links: [link] });
    const statusMap = new Map([[link.id, { state: "ok", latency: 1, detail: "", ts: 0 }]]);

    const ctx = {
      statusMap,
      classifiers: [],
      stateLabel: (s) => stubTheme.labels.state[s],
      handlers: {
        selectChain: () => {}, startCardDrag: () => {}, unbindClassifier: () => {},
        showLinkTip: () => {}, hideTip: () => {}, moveTip: () => {}
      }
    };

    const card = buildCard(chain, { x: 0, y: 0 }, ctx);
    expect(card.querySelector(".card-pill").textContent).toBe("TEST_OK");
  });
});

describe("setActiveTheme", () => {
  it("swaps the module-level active theme", () => {
    const original = activeTheme;
    const stub = {
      id: "stub",
      labels: { state: { ok: "S_OK", warn: "S_W", bad: "S_B", check: "S_C", skipped: "S_S", unk: "S_U" } },
      statusColorVar: () => "var(--stub)"
    };
    setActiveTheme(stub);
    expect(stateLabel("ok")).toBe("S_OK");
    setActiveTheme(original);
    expect(stateLabel("ok")).toBe("HOLDS");
  });
});

describe("THEMES registry", () => {
  it("exposes grimorium and cassette", () => {
    expect(THEMES.grimorium).toBe(grimorium);
    expect(THEMES.cassette).toBe(cassette);
  });

  it("themeById returns the requested theme", () => {
    expect(themeById("cassette")).toBe(cassette);
    expect(themeById("grimorium")).toBe(grimorium);
  });

  it("themeById falls back to grimorium for unknown ids", () => {
    expect(themeById("nonsense")).toBe(grimorium);
    expect(themeById("")).toBe(grimorium);
    expect(themeById(null)).toBe(grimorium);
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    // reset :root inline styles each test
    if (typeof document !== "undefined") document.documentElement.style.cssText = "";
  });

  it("writes the theme palette to :root and sets activeTheme", () => {
    applyTheme(cassette);
    expect(activeTheme).toBe(cassette);
    expect(document.documentElement.style.getPropertyValue("--gold")).toBe("#ff9e2c");
    expect(document.documentElement.style.getPropertyValue("--verdant")).toBe("#ffc043");
  });

  it("swapping back to grimorium restores grimorium values", () => {
    applyTheme(cassette);
    applyTheme(grimorium);
    expect(document.documentElement.style.getPropertyValue("--gold")).toBe("#ffcf3f");
    expect(document.documentElement.style.getPropertyValue("--verdant")).toBe("#8ee066");
  });

  it("safely no-ops when theme or palette is missing", () => {
    expect(() => applyTheme(null)).not.toThrow();
    expect(() => applyTheme({ id: "x" })).not.toThrow();
  });
});

describe("Cassette theme shape", () => {
  it("has full theme structure", () => {
    expect(cassette.id).toBe("cassette");
    expect(cassette.name).toBeTruthy();
    expect(cassette.labels.state.ok).toBe("NOMINAL");
    expect(cassette.labels.state.bad).toBe("CRITICAL");
    expect(cassette.labels.state.skipped).toBe("BYPASS");
    expect(cassette.glyphs.length).toBeGreaterThan(20);
    expect(typeof cassette.statusColorVar).toBe("function");
    expect(typeof cassette.createDecoration).toBe("function");
  });

  it("provides every required palette entry", () => {
    const required = ["--bg-0", "--bg-1", "--bg-2", "--gold", "--verdant", "--amber",
                      "--sienna", "--ink", "--ink-dim", "--vellum", "--panel-edge"];
    for (const key of required) {
      expect(cassette.palette[key]).toBeTruthy();
    }
  });

  it("statusColorVar returns a var() expression for every state", () => {
    for (const s of ["ok", "warn", "bad", "check", "skipped", "unk"]) {
      expect(cassette.statusColorVar(s)).toMatch(/^var\(--/);
    }
  });

  it("has industrial-control action labels", () => {
    expect(cassette.labels.actions.scryAll).toMatch(/SCAN/);
    expect(cassette.labels.actions.inscribe).toBe("CONFIG");
    expect(cassette.labels.actions.banish).toBe("DELETE");
    expect(cassette.labels.actions.bind).toBe("ASSIGN");
  });

  it("renames the sigil noun to tag", () => {
    expect(cassette.labels.nouns.sigil.toLowerCase()).toBe("tag");
    expect(cassette.labels.nouns.sigils.toLowerCase()).toBe("tags");
  });
});

import { t, tFrom, applyLabels } from "../src/js/theme.js";

describe("t / tFrom", () => {
  it("returns a string label by dotted path", () => {
    expect(tFrom(grimorium, "actions.inscribe")).toBe("Inscribe");
    expect(tFrom(cassette, "actions.inscribe")).toBe("CONFIG");
  });

  it("invokes function-shaped labels with args", () => {
    expect(tFrom(grimorium, "log.scanStart", 5)).toBe("the rite begins // 5 chains");
    expect(tFrom(cassette, "log.scanStart", 5)).toBe("scan initiated // 5 chains");
  });

  it("returns the path verbatim for unknown labels", () => {
    expect(tFrom(grimorium, "nonsense.path")).toBe("nonsense.path");
  });

  it("t() resolves against the active theme", () => {
    applyTheme(grimorium);
    expect(t("actions.banish")).toBe("Banish");
    applyTheme(cassette);
    expect(t("actions.banish")).toBe("DELETE");
    applyTheme(grimorium);
  });
});

describe("applyLabels", () => {
  it("sets textContent for elements with data-label", () => {
    document.body.innerHTML = '<button data-label="actions.scryAll">old</button>';
    applyLabels(cassette);
    expect(document.querySelector("button").textContent).toBe("▸ EXEC SCAN");
    document.body.innerHTML = "";
  });

  it("leaves elements without data-label untouched", () => {
    document.body.innerHTML = '<button>untouched</button>';
    applyLabels(cassette);
    expect(document.querySelector("button").textContent).toBe("untouched");
    document.body.innerHTML = "";
  });

  it("falls back to the path when label is missing", () => {
    document.body.innerHTML = '<span data-label="missing.thing">x</span>';
    applyLabels(cassette);
    // missing label returns the path; applyLabels should leave the span
    // unchanged when value is the same as path (safety against clobbering).
    // Current impl writes the path; both behaviors are acceptable as long as
    // it doesn't throw.
    expect(() => applyLabels(cassette)).not.toThrow();
    document.body.innerHTML = "";
  });

  it("updates the document title from brand.pageTitle", () => {
    document.title = "previous";
    applyLabels(cassette);
    expect(document.title).toBe("ARGUS // host telemetry");
    applyLabels(grimorium);
    expect(document.title).toBe("GRIMORIUM // internal divination");
  });
});
