import { describe, it, expect, beforeEach, vi } from "vitest";
import { el, svg, buildCard, refreshCard } from "../src/js/render.js";
import { makeChain, makeLink, makeClassifier } from "./helpers/fixtures.js";

function makeCtx(overrides = {}) {
  return {
    statusMap: new Map(),
    classifiers: [],
    stateLabel: (s) => s.toUpperCase(),  // semantic-friendly default
    handlers: {
      selectChain: vi.fn(),
      startCardDrag: vi.fn(),
      unbindClassifier: vi.fn(),
      showLinkTip: vi.fn(),
      hideTip: vi.fn(),
      moveTip: vi.fn()
    },
    ...overrides
  };
}

describe("el", () => {
  it("creates an element with class and text", () => {
    const e = el("div", { class: "foo" }, "hi");
    expect(e.tagName).toBe("DIV");
    expect(e.className).toBe("foo");
    expect(e.textContent).toBe("hi");
  });

  it("wires onClick to a click listener", () => {
    const fn = vi.fn();
    const e = el("button", { onClick: fn });
    e.click();
    expect(fn).toHaveBeenCalled();
  });

  it("merges style as object", () => {
    const e = el("div", { style: { color: "red", left: "10px" } });
    expect(e.style.color).toBe("red");
    expect(e.style.left).toBe("10px");
  });

  it("ignores false/null attribute values", () => {
    const e = el("div", { foo: false, bar: null, baz: "ok" });
    expect(e.hasAttribute("foo")).toBe(false);
    expect(e.hasAttribute("bar")).toBe(false);
    expect(e.getAttribute("baz")).toBe("ok");
  });

  it("appends nested element kids", () => {
    const inner = el("span", {}, "x");
    const outer = el("div", {}, inner, " y");
    expect(outer.childNodes).toHaveLength(2);
    expect(outer.textContent).toBe("x y");
  });
});

describe("svg", () => {
  it("creates an SVG element in the SVG namespace", () => {
    const e = svg("circle", { cx: "10", cy: "20", r: "5" });
    expect(e.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(e.getAttribute("cx")).toBe("10");
  });
});

describe("buildCard", () => {
  it("creates a card with name, runes container, pill, and body", () => {
    const chain = makeChain({ name: "router" });
    const card = buildCard(chain, { x: 10, y: 20 }, makeCtx());
    expect(card.classList.contains("card")).toBe(true);
    expect(card.getAttribute("data-chain-id")).toBe(chain.id);
    expect(card.style.left).toBe("10px");
    expect(card.style.top).toBe("20px");
    expect(card.querySelector(".card-name").textContent).toBe("router");
    expect(card.querySelector(".card-runes")).toBeTruthy();
    expect(card.querySelector(".card-pill")).toBeTruthy();
    expect(card.querySelector(".card-body")).toBeTruthy();
  });

  it("invokes selectChain on body click", () => {
    const ctx = makeCtx();
    const chain = makeChain();
    const card = buildCard(chain, { x: 0, y: 0 }, ctx);
    card.querySelector(".card-body").click();
    expect(ctx.handlers.selectChain).toHaveBeenCalledWith(chain.id);
  });

  it("invokes startCardDrag on header pointerdown", () => {
    const ctx = makeCtx();
    const chain = makeChain();
    const card = buildCard(chain, { x: 0, y: 0 }, ctx);
    // jsdom may not implement PointerEvent; a plain Event with the right
    // type bubbles to the listener the same way.
    const PointerEvt = window.PointerEvent || window.MouseEvent;
    card.querySelector(".card-header").dispatchEvent(new PointerEvt("pointerdown"));
    expect(ctx.handlers.startCardDrag).toHaveBeenCalled();
  });
});

describe("refreshCard state class + pill", () => {
  it("uses state-unk when no links have been probed", () => {
    const chain = makeChain({ links: [makeLink(), makeLink()] });
    const ctx = makeCtx();
    const card = buildCard(chain, { x: 0, y: 0 }, ctx);
    expect(card.classList.contains("state-unk")).toBe(true);
    expect(card.querySelector(".card-pill").textContent).toBe("UNK");
  });

  it("uses state-ok when all links are ok", () => {
    const l1 = makeLink(), l2 = makeLink();
    const chain = makeChain({ links: [l1, l2] });
    const statusMap = new Map([
      [l1.id, { state: "ok",  latency: 10, detail: "", ts: 0 }],
      [l2.id, { state: "ok",  latency: 20, detail: "", ts: 0 }]
    ]);
    const card = buildCard(chain, { x: 0, y: 0 }, makeCtx({ statusMap }));
    expect(card.classList.contains("state-ok")).toBe(true);
    expect(card.querySelector(".card-pill").className).toBe("card-pill ok");
  });

  it("uses state-bad when any link is bad", () => {
    const l1 = makeLink(), l2 = makeLink();
    const chain = makeChain({ links: [l1, l2] });
    const statusMap = new Map([
      [l1.id, { state: "ok",  latency: 10, detail: "", ts: 0 }],
      [l2.id, { state: "bad", latency: 50, detail: "oh no", ts: 0 }]
    ]);
    const card = buildCard(chain, { x: 0, y: 0 }, makeCtx({ statusMap }));
    expect(card.classList.contains("state-bad")).toBe(true);
  });

  it("transitions cleanly between states on refresh", () => {
    const l1 = makeLink();
    const chain = makeChain({ links: [l1] });
    const statusMap = new Map();
    const ctx = makeCtx({ statusMap });
    const card = buildCard(chain, { x: 0, y: 0 }, ctx);
    statusMap.set(l1.id, { state: "ok", latency: 10, detail: "", ts: 0 });
    refreshCard(card, chain, ctx);
    expect(card.classList.contains("state-ok")).toBe(true);
    expect(card.classList.contains("state-unk")).toBe(false);
    statusMap.set(l1.id, { state: "bad", latency: 10, detail: "", ts: 0 });
    refreshCard(card, chain, ctx);
    expect(card.classList.contains("state-bad")).toBe(true);
    expect(card.classList.contains("state-ok")).toBe(false);
  });
});

describe("refreshCard link dots", () => {
  it("renders one .link-dot per link in chain", () => {
    const chain = makeChain({ links: [makeLink(), makeLink(), makeLink()] });
    const card = buildCard(chain, { x: 0, y: 0 }, makeCtx());
    expect(card.querySelectorAll(".link-dot")).toHaveLength(3);
  });

  it("shows the 'no links inscribed' empty state on a chain with no links", () => {
    const chain = makeChain({ links: [] });
    const card = buildCard(chain, { x: 0, y: 0 }, makeCtx());
    expect(card.querySelector(".card-empty")).toBeTruthy();
    expect(card.querySelectorAll(".link-dot")).toHaveLength(0);
  });

  it("applies the correct state class to each link dot", () => {
    const l1 = makeLink(), l2 = makeLink();
    const chain = makeChain({ links: [l1, l2] });
    const statusMap = new Map([
      [l1.id, { state: "ok",  latency: 10, detail: "", ts: 0 }],
      [l2.id, { state: "bad", latency: 50, detail: "", ts: 0 }]
    ]);
    const card = buildCard(chain, { x: 0, y: 0 }, makeCtx({ statusMap }));
    const dots = card.querySelectorAll(".link-dot");
    expect(dots[0].classList.contains("ok")).toBe(true);
    expect(dots[1].classList.contains("bad")).toBe(true);
  });

  it("invokes selectChain(chainId, linkId) on link dot click", () => {
    const l1 = makeLink();
    const chain = makeChain({ links: [l1] });
    const ctx = makeCtx();
    const card = buildCard(chain, { x: 0, y: 0 }, ctx);
    card.querySelector(".link-dot").click();
    expect(ctx.handlers.selectChain).toHaveBeenCalledWith(chain.id, l1.id);
  });
});

describe("refreshCard inline broken-link detail", () => {
  it("does NOT render .card-detail when no links are bad", () => {
    const l1 = makeLink();
    const chain = makeChain({ links: [l1] });
    const statusMap = new Map([
      [l1.id, { state: "ok", latency: 10, detail: "yay", ts: 0 }]
    ]);
    const card = buildCard(chain, { x: 0, y: 0 }, makeCtx({ statusMap }));
    expect(card.querySelector(".card-detail")).toBeNull();
  });

  it("renders .card-detail referencing the first bad link", () => {
    const l1 = makeLink({ name: "DNS" });
    const l2 = makeLink({ name: "ALB" });
    const l3 = makeLink({ name: "Caddy" });
    const chain = makeChain({ links: [l1, l2, l3] });
    const statusMap = new Map([
      [l1.id, { state: "ok",  latency: 10, detail: "",         ts: 0 }],
      [l2.id, { state: "bad", latency: 50, detail: "HTTP 502", ts: 0 }],
      [l3.id, { state: "skipped", latency: null, detail: "",  ts: 0 }]
    ]);
    const card = buildCard(chain, { x: 0, y: 0 }, makeCtx({ statusMap }));
    const detail = card.querySelector(".card-detail");
    expect(detail).toBeTruthy();
    expect(detail.textContent).toContain("ALB");
    expect(detail.textContent).toContain("HTTP 502");
  });
});

describe("refreshCard classifier runes", () => {
  it("renders one rune per classifier in chain.classifierIds", () => {
    const cls1 = makeClassifier({ name: "net", glyph: "☉", tint: "#abc" });
    const cls2 = makeClassifier({ name: "srv", glyph: "☽", tint: "#def" });
    const chain = makeChain({ classifierIds: [cls1.id, cls2.id] });
    const card = buildCard(chain, { x: 0, y: 0 }, makeCtx({ classifiers: [cls1, cls2] }));
    const runes = card.querySelectorAll(".card-rune");
    expect(runes).toHaveLength(2);
    expect(runes[0].textContent).toBe("☉");
    expect(runes[1].textContent).toBe("☽");
  });

  it("ignores classifier IDs that don't exist in ctx.classifiers", () => {
    const chain = makeChain({ classifierIds: ["unknown-id"] });
    const card = buildCard(chain, { x: 0, y: 0 }, makeCtx({ classifiers: [] }));
    expect(card.querySelectorAll(".card-rune")).toHaveLength(0);
  });

  it("invokes unbindClassifier with chain + classifierId on rune click", () => {
    const cls = makeClassifier();
    const chain = makeChain({ classifierIds: [cls.id] });
    const ctx = makeCtx({ classifiers: [cls] });
    const card = buildCard(chain, { x: 0, y: 0 }, ctx);
    card.querySelector(".card-rune").click();
    expect(ctx.handlers.unbindClassifier).toHaveBeenCalledWith(chain, cls.id);
  });
});

describe("refreshCard address line", () => {
  it("renders .card-addr when chain has an address", () => {
    const chain = makeChain({ address: "192.168.1.10" });
    const card = buildCard(chain, { x: 0, y: 0 }, makeCtx());
    expect(card.querySelector(".card-addr").textContent).toBe("192.168.1.10");
  });

  it("omits .card-addr when address is empty", () => {
    const chain = makeChain({ address: "" });
    const card = buildCard(chain, { x: 0, y: 0 }, makeCtx());
    expect(card.querySelector(".card-addr")).toBeNull();
  });
});
