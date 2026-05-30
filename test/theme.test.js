import { describe, it, expect } from "vitest";
import { activeTheme, stateLabel, setActiveTheme } from "../src/js/theme.js";
import { grimorium } from "../src/js/themes/grimorium.js";
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
