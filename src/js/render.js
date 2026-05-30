// Card DOM rendering. Builds and updates a chain card from a chain object
// and a render context (statusMap, classifiers, label fn, event handlers).
// The context is passed by reference so the caller's mutations are visible
// without rebuilding the ctx.

import { aggregateChainState, pillCls, fmtLatency } from "./state.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Create an HTML element. Mirrors the shorthand used throughout the app:
 *   el("div", { class: "x", onClick: f }, kid1, "text")
 * Attributes:
 *   class           -> className
 *   style: {...}    -> Object.assign(style, ...)
 *   onXxx           -> addEventListener("xxx", fn)
 *   false / null    -> attribute is skipped
 */
export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === "class") e.className = attrs[k];
    else if (k === "style") Object.assign(e.style, attrs[k]);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
  }
  for (const k of kids) {
    if (k == null || k === false) continue;
    e.append(k.nodeType ? k : document.createTextNode(k));
  }
  return e;
}

/** Create an SVG element with attribute shorthand. */
export function svg(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) {
    if (attrs[k] === false || attrs[k] == null) continue;
    e.setAttribute(k, attrs[k]);
  }
  return e;
}

/**
 * Build a chain card. Returns the root .card DOM node.
 *
 * @param {object} chain
 * @param {{x: number, y: number}} pos initial position (px)
 * @param {object} ctx render context (see refreshCard)
 */
export function buildCard(chain, pos, ctx) {
  const card = el("div", {
    class: "card",
    "data-chain-id": chain.id,
    style: { left: pos.x + "px", top: pos.y + "px" }
  });

  const header = el("div", { class: "card-header" },
    el("span", { class: "card-name", title: chain.name }, chain.name),
    el("span", { class: "card-runes" }),
    el("span", { class: "card-pill" }, "")
  );
  const body = el("div", { class: "card-body" });
  card.append(header, body);

  body.addEventListener("click", () => ctx.handlers.selectChain(chain.id));
  header.addEventListener("mousedown", (e) => ctx.handlers.startCardDrag(e, card, chain.id));

  refreshCard(card, chain, ctx);
  return card;
}

/**
 * Update an existing card's classes, pill text, runes, link dots, and inline
 * broken-link detail to match the current chain state.
 *
 * @param {HTMLElement} card
 * @param {object} chain
 * @param {object} ctx
 *   ctx.statusMap        Map<linkId, {state, latency, detail, ts}>
 *   ctx.classifiers      Array reference (read each call so updates are seen)
 *   ctx.stateLabel       (state) -> display string
 *   ctx.handlers.selectChain
 *   ctx.handlers.startCardDrag
 *   ctx.handlers.unbindClassifier(chain, classifierId)
 *   ctx.handlers.showLinkTip(event, chain, link, status)
 *   ctx.handlers.hideTip()
 *   ctx.handlers.moveTip(event)
 */
export function refreshCard(card, chain, ctx) {
  const { statusMap, classifiers, stateLabel, handlers } = ctx;
  const agg = aggregateChainState(chain, statusMap);
  const cls = pillCls(agg.state);
  card.classList.remove("state-ok", "state-warn", "state-bad", "state-check", "state-unk");
  card.classList.add("state-" + cls);

  const pill = card.querySelector(".card-pill");
  pill.textContent = stateLabel(agg.state);
  pill.className = "card-pill " + cls;

  const runes = card.querySelector(".card-runes");
  runes.innerHTML = "";
  for (const cid of chain.classifierIds) {
    const cls2 = classifiers.find(x => x.id === cid);
    if (!cls2) continue;
    const r = el("div", {
      class: "card-rune",
      title: cls2.name + " — click to unbind",
      style: { color: cls2.tint }
    }, cls2.glyph);
    r.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.unbindClassifier(chain, cid);
    });
    runes.appendChild(r);
  }

  const body = card.querySelector(".card-body");
  body.innerHTML = "";
  if (chain.address) body.appendChild(el("div", { class: "card-addr" }, chain.address));

  const linkRow = el("div", { class: "link-row" });
  if (!chain.links.length) {
    linkRow.appendChild(el("span", { class: "card-empty" }, ctx.labels?.noLinksOnCard ?? "no links"));
  } else {
    for (const link of chain.links) {
      const st = statusMap.get(link.id);
      const state = st ? st.state : "unk";
      const dot = el("div", {
        class: "link-dot " + pillCls(state),
        "data-link-id": link.id,
        title: link.name + " (" + link.probe + ") — " + stateLabel(state)
      });
      const step = el("div", { class: "link-step" }, dot);
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        handlers.selectChain(chain.id, link.id);
      });
      dot.addEventListener("mouseenter", (ev) => handlers.showLinkTip(ev, chain, link, st));
      dot.addEventListener("mouseleave", handlers.hideTip);
      dot.addEventListener("mousemove", handlers.moveTip);
      linkRow.appendChild(step);
    }
  }
  body.appendChild(linkRow);

  if (agg.firstBadIdx >= 0) {
    const broken = chain.links[agg.firstBadIdx];
    const st = statusMap.get(broken.id);
    body.appendChild(
      el("div", { class: "card-detail" },
        el("span", { class: "arr" }, "↳"),
        el("span", { class: "name" }, broken.name),
        " — " + (st ? st.detail : "—") + " (" + fmtLatency(st ? st.latency : null) + ")"
      )
    );
  }
}
