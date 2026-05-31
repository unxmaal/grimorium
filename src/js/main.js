"use strict";

import {
  aggregateChainState,
  pillCls,
  getByPath,
  clamp,
  hash32,
  fmtLatency,
  fmtTime,
  cryptoRandomId
} from "./state.js";
import {
  DEFAULT_TINTS,
  defaultConfig,
  normalize,
  loadConfig,
  saveConfig
} from "./storage.js";
import {
  rescryLink as rescryLinkPure,
  scanAll as scanAllPure
} from "./runner.js";
import {
  LAYOUT,
  effectiveAvailWidth,
  autoGridPosition,
  computeGroupedLayout
} from "./layout.js";
import {
  RADIAL,
  effectiveAvailWidthRadial,
  computeRadialLayout,
  computeRadialGroupedLayout
} from "./layout-radial.js";
import {
  createOrbitalState,
  tickOrbitalState,
  chainCardPosition
} from "./orbital.js";
import { el, svg, buildCard, refreshCard } from "./render.js";
import { DRAG_THRESHOLD, dropTargetAt } from "./drag.js";
import { activeTheme, stateLabel, themeById, applyTheme, applyLabels, t, THEMES } from "./theme.js";

/* ---------------------------------------------------------------------------
 * GRIMORIUM — chain-aware diagnostic dashboard.
 * A "chain" is an ordered list of probes (DNS → ALB → Caddy → origin).
 * On first failure, downstream links are marked "skipped" — so the row
 * tells you not just *that* something is down but *which link* broke.
 * ------------------------------------------------------------------------- */

const SVG_NS = "http://www.w3.org/2000/svg";

let config = loadConfig();

// Theme: URL param (?theme=cassette) wins, then config.themeId, then default.
{
  const params = new URLSearchParams(globalThis.location?.search || "");
  const urlTheme = params.get("theme");
  const pickedId = urlTheme || config.themeId || "grimorium";
  applyTheme(themeById(pickedId));
  applyLabels();
  if (urlTheme) config.themeId = urlTheme;
}

let statusMap = new Map();        // linkId -> { state, latency, detail, ts }
let chainState = new Map();       // chainId -> aggregate state cache
let selectedChainId = null;
let selectedLinkId = null;
let scanInFlight = false;
let cardEls = new Map();
let sigilEls = new Map();
let activeFilter = null;          // classifierId | null

/* ---------- utilities ---------- */

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }


/* ---------- logging ---------- */

function log(msg, tag = "info") {
  const body = $("#log");
  const line = el("div", { class: "line" },
    el("span", { class: "ts" }, "[" + fmtTime() + "]"),
    el("span", { class: "tag-" + tag }, "▸ "),
    msg
  );
  body.append(line);
  body.scrollTop = body.scrollHeight;
  while (body.childElementCount > 500) body.firstChild.remove();
}

/* ---------- probes ---------- */

/* ---------- chain runner (thin wrappers binding side-effects to pure runner module) ---------- */

async function scanAll() {
  if (scanInFlight) { log(t("log.scanInFlight"), "warn"); return; }
  scanInFlight = true;
  $("#btn-scan").disabled = true;
  $("#btn-scan").textContent = t("actions.scryAllRunning");

  const result = await scanAllPure(config.chains, statusMap, {
    timeoutMs: config.timeoutMs,
    parallel: config.parallel,
    log,
    stateLabel: stateLabel,
    onChainTick: (c) => {
      updateChainVisual(c.id);
      updateMeta();
      renderSidepanel();
    }
  });

  if (result.scanned > 0) $("#meta-last").textContent = fmtTime();
  scanInFlight = false;
  $("#btn-scan").disabled = false;
  $("#btn-scan").textContent = t("actions.scryAll");
}

async function rescryLink(chain, link) {
  await rescryLinkPure(chain, link, statusMap, {
    timeoutMs: config.timeoutMs,
    log,
    stateLabel: stateLabel,
    onTick: (linkId) => {
      updateChainVisual(chain.id);
      renderSidepanel(linkId);
      updateMeta();
    }
  });
}

/* ---------- meta / aggregate ---------- */

function updateMeta() {
  const chainCount = config.chains.length;
  let linkCount = 0, up = 0, down = 0;
  for (const c of config.chains) {
    for (const l of c.links) {
      linkCount++;
      const st = statusMap.get(l.id);
      if (!st) continue;
      if (st.state === "ok") up++;
      else if (st.state === "bad") down++;
    }
  }
  $("#meta-chains").textContent = chainCount;
  $("#meta-links").textContent = linkCount;
  $("#meta-up").textContent = up;
  $("#meta-down").textContent = down;
  $("#empty-hint").style.display = chainCount === 0 ? "block" : "none";
}

/* ---------- background decoration (provided by the active theme) ---------- */

const decoration = activeTheme.createDecoration($("#parchment"), $("#background-decor"));

/* ---------- card layout + rendering ---------- */

function isRadial() { return activeTheme.layoutMode === "radial"; }

function currentAvailWidth() {
  const sidepanelOpen = $("#sidepanel").classList.contains("open");
  return isRadial()
    ? effectiveAvailWidthRadial(window.innerWidth, sidepanelOpen)
    : effectiveAvailWidth(window.innerWidth, sidepanelOpen);
}

function currentAvailHeight() {
  // Reserve top bar + console heights so the hub center isn't behind UI.
  return Math.max(RADIAL.cardD * 2, window.innerHeight - RADIAL.padTop - RADIAL.padBottom);
}

function getCardPosition(chain, index) {
  if (isRadial()) {
    // Radial flat layout positions all cards relative to a hub. Saved
    // free-positions are honored only in grid mode; radial recomputes
    // every render so geometry stays clean.
    return { x: 0, y: 0 };
  }
  const saved = (config.positions || {})[chain.id];
  if (saved && typeof saved.x === "number" && typeof saved.y === "number") return saved;
  return autoGridPosition(index, currentAvailWidth());
}

function render() {
  const root = $("#cards");
  root.innerHTML = "";
  cardEls.clear();
  for (const chain of config.chains) {
    const card = buildCard(chain, { x: 0, y: 0 }, renderCtx);
    root.appendChild(card);
    cardEls.set(chain.id, card);
  }
  applyLayout();
  applyFilter();
}

function applyLayout() {
  if (isRadial()) {
    if (config.groupByTag) layoutGroupedRadial();
    else layoutFlatRadial();
    return;
  }
  if (config.groupByTag) layoutGrouped();
  else layoutFlat();
}

function layoutFlat() {
  $("#groups").innerHTML = "";
  for (let i = 0; i < config.chains.length; i++) {
    const chain = config.chains[i];
    const card = cardEls.get(chain.id);
    if (!card) continue;
    const pos = getCardPosition(chain, i);
    card.style.left = pos.x + "px";
    card.style.top  = pos.y + "px";
  }
}

function layoutGrouped() {
  const groupsRoot = $("#groups");
  groupsRoot.innerHTML = "";

  const { groups, cardPositions } = computeGroupedLayout(
    config.chains,
    config.classifiers,
    {
      availW: Math.max(LAYOUT.cardW + 40, currentAvailWidth()),
      cardHeightOf: (chainId) => {
        const card = cardEls.get(chainId);
        return card ? card.offsetHeight : 0;
      }
    }
  );

  for (const g of groups) {
    const cls = g.classifier;
    groupsRoot.appendChild(
      el("div", {
        class: "group" + (cls ? "" : " untagged"),
        style: {
          left: g.x + "px", top: g.y + "px",
          width: g.w + "px", height: g.h + "px",
          color: cls ? cls.tint : "var(--ink-faint)"
        }
      },
        el("div", { class: "label" },
          cls ? el("span", { class: "g" }, cls.glyph) : null,
          cls ? cls.name : "untagged"
        )
      )
    );
  }

  for (const [chainId, pos] of Object.entries(cardPositions)) {
    const card = cardEls.get(chainId);
    if (!card) continue;
    card.style.left = pos.x + "px";
    card.style.top  = pos.y + "px";
  }
}

/* ---------- orbital (radial mode) ---------- */

let orbitalState = null;
let systemEls = new Map(); // sysId -> { ring, hub, label }

function currentOrbitalBounds() {
  const sidepanelOpen = $("#sidepanel").classList.contains("open");
  const rightEdge = window.innerWidth - (sidepanelOpen ? RADIAL.sidepanelW : RADIAL.padRight);
  return {
    minX: RADIAL.padLeft,
    minY: RADIAL.padTop,
    maxX: rightEdge,
    maxY: window.innerHeight - RADIAL.padBottom
  };
}

function rebuildOrbital() {
  orbitalState = createOrbitalState({
    chains: config.chains,
    classifiers: config.classifiers,
    groupByTag: config.groupByTag,
    bounds: currentOrbitalBounds(),
    prev: orbitalState
  });
  rebuildSystemDom();
  applyOrbitalDom();
}

function rebuildSystemDom() {
  const groupsRoot = $("#groups");
  groupsRoot.innerHTML = "";
  systemEls.clear();
  if (!orbitalState) return;
  // Flat mode: hide the system ring entirely; the background reticle does that job.
  if (!config.groupByTag) return;
  for (const sys of orbitalState.systems) {
    const cls = sys.classifier;
    const ring = el("div", {
      class: "system" + (cls ? "" : " untagged"),
      style: {
        width: (sys.r * 2) + "px",
        height: (sys.r * 2) + "px",
        color: cls ? cls.tint : "var(--ink-faint)"
      }
    });
    let hub = null;
    if (cls) {
      hub = el("div", { class: "system-hub", title: cls.name },
        el("span", { class: "g" }, cls.glyph));
      ring.appendChild(hub);
    }
    const label = el("div", { class: "system-label" }, cls ? cls.name : "untagged");
    ring.appendChild(label);
    groupsRoot.appendChild(ring);
    systemEls.set(sys.id, { ring, hub, label });
  }
}

function applyOrbitalDom() {
  if (!orbitalState) return;
  for (const sys of orbitalState.systems) {
    const els = systemEls.get(sys.id);
    if (els) {
      els.ring.style.left = (sys.cx - sys.r) + "px";
      els.ring.style.top  = (sys.cy - sys.r) + "px";
    }
  }
  for (const [chainId, ch] of orbitalState.chains.entries()) {
    if (dragState && dragState.chainId === chainId) continue;
    const pos = chainCardPosition(orbitalState, chainId);
    if (!pos) continue;
    const card = cardEls.get(chainId);
    if (!card) continue;
    card.style.left = pos.x + "px";
    card.style.top  = pos.y + "px";
  }
}

function layoutFlatRadial() {
  rebuildOrbital();
}

function layoutGroupedRadial() {
  rebuildOrbital();
}

// Render context: passes refs to live state + handlers into render module.
// Arrays/Maps are passed by reference so the renderer sees mutations as they happen.
const renderCtx = {
  get statusMap() { return statusMap; },
  get classifiers() { return config.classifiers; },
  stateLabel: stateLabel,
  get cardShape() { return activeTheme.cardShape || "rect"; },
  get labels() {
    return {
      noLinksOnCard: t("empty.noLinksOnCard")
    };
  },
  handlers: {
    selectChain: (chainId, linkId) => selectChain(chainId, linkId),
    startCardDrag: (e, card, chainId) => startCardDrag(e, card, chainId),
    unbindClassifier: (chain, classifierId) => {
      chain.classifierIds = chain.classifierIds.filter(x => x !== classifierId);
      saveConfig(config);
      updateChainVisual(chain.id);
      if (config.groupByTag) applyLayout();
      if (activeFilter) applyFilter();
    },
    showLinkTip: (ev, chain, link, st) => showLinkTip(ev, chain, link, st),
    hideTip: () => hideTip(),
    moveTip: (ev) => moveTip(ev)
  }
};

function updateChainVisual(chainId) {
  const card = cardEls.get(chainId);
  if (!card) return;
  const chain = config.chains.find(c => c.id === chainId);
  if (!chain) return;
  // Grid grouped mode needs to re-pack rows when a card grows for the bad-
  // link detail. Radial cards are fixed-diameter so this dance is skipped.
  const needsRepack = config.groupByTag && !isRadial();
  const oldH = needsRepack ? card.offsetHeight : 0;
  refreshCard(card, chain, renderCtx);
  if (needsRepack && card.offsetHeight !== oldH) applyLayout();
}

/* ---------- drag and drop ---------- */

let dragState = null;     // card-positioning drag
let sigilDrag = null;     // dragging a sigil out of the shelf

function startCardDrag(e, card, chainId) {
  if (e.button !== 0) return;
  e.preventDefault();
  const rect = card.getBoundingClientRect();
  dragState = {
    card, chainId,
    startX: e.clientX, startY: e.clientY,
    origX: rect.left, origY: rect.top,
    moved: false,
    hoverSigil: null
  };
}

function startSigilDrag(e, classifier, srcEl) {
  if (e.button !== 0) return;
  e.preventDefault();
  sigilDrag = {
    classifier, srcEl,
    startX: e.clientX, startY: e.clientY,
    moved: false,
    ghost: null,
    hoverCard: null
  };
}

window.addEventListener("mousemove", (e) => {
  if (dragState) {
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!dragState.moved) {
      dragState.moved = true;
      dragState.card.classList.add("dragging");
    }
    dragState.card.style.left = (dragState.origX + dx) + "px";
    dragState.card.style.top  = (dragState.origY + dy) + "px";

    // Highlight sigil if hovered (drop-to-tag).
    const tgt = document.elementFromPoint(e.clientX, e.clientY);
    const sigilEl = tgt && tgt.closest(".sigil:not(.add)");
    if (dragState.hoverSigil && dragState.hoverSigil !== sigilEl) {
      dragState.hoverSigil.classList.remove("drop-target");
    }
    if (sigilEl) sigilEl.classList.add("drop-target");
    dragState.hoverSigil = sigilEl;
  }

  if (sigilDrag) {
    const dx = e.clientX - sigilDrag.startX;
    const dy = e.clientY - sigilDrag.startY;
    if (!sigilDrag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!sigilDrag.moved) {
      sigilDrag.moved = true;
      const cls = sigilDrag.classifier;
      sigilDrag.ghost = el("div", {
        class: "sigil-ghost",
        style: { color: cls.tint }
      }, cls.glyph);
      document.body.appendChild(sigilDrag.ghost);
    }
    sigilDrag.ghost.style.left = (e.clientX - 16) + "px";
    sigilDrag.ghost.style.top  = (e.clientY - 16) + "px";

    const tgt = document.elementFromPoint(e.clientX, e.clientY);
    const cardEl = tgt && tgt.closest(".card");
    if (sigilDrag.hoverCard && sigilDrag.hoverCard !== cardEl) {
      sigilDrag.hoverCard.classList.remove("drop-target");
    }
    if (cardEl) cardEl.classList.add("drop-target");
    sigilDrag.hoverCard = cardEl;
  }
});

window.addEventListener("mouseup", (e) => {
  if (dragState) {
    const ds = dragState;
    dragState = null;
    if (ds.hoverSigil) ds.hoverSigil.classList.remove("drop-target");

    if (!ds.moved) {
      ds.card.classList.remove("dragging");
      selectChain(ds.chainId);
      return;
    }
    ds.card.classList.remove("dragging");

    // Dropped on a sigil? Apply classifier.
    if (ds.hoverSigil) {
      const cid = ds.hoverSigil.getAttribute("data-classifier-id");
      const chain = config.chains.find(c => c.id === ds.chainId);
      if (chain && cid && !chain.classifierIds.includes(cid)) {
        chain.classifierIds.push(cid);
        const cls = config.classifiers.find(x => x.id === cid);
        log(t("log.chainBound", chain.name, cls ? cls.name : cid), "info");
      }
      saveConfig(config);
      refreshCard(ds.card, chain, renderCtx);
      if (config.groupByTag) {
        applyLayout();
      } else {
        ds.card.style.left = ds.origX + "px";
        ds.card.style.top  = ds.origY + "px";
      }
      if (activeFilter) applyFilter();
      return;
    }

    // Group mode and radial mode disable free positioning — snap back.
    if (config.groupByTag || isRadial()) {
      applyLayout();
      return;
    }

    // Otherwise save new position.
    config.positions ||= {};
    config.positions[ds.chainId] = {
      x: parseFloat(ds.card.style.left) || 0,
      y: parseFloat(ds.card.style.top)  || 0
    };
    saveConfig(config);
  }

  if (sigilDrag) {
    const sd = sigilDrag;
    sigilDrag = null;
    if (sd.ghost) sd.ghost.remove();
    if (sd.hoverCard) sd.hoverCard.classList.remove("drop-target");

    if (!sd.moved) {
      // Click on sigil → toggle filter.
      toggleFilter(sd.classifier.id);
      return;
    }
    // Drag ended on a card → apply classifier.
    if (sd.hoverCard) {
      const chainId = sd.hoverCard.getAttribute("data-chain-id");
      const chain = config.chains.find(c => c.id === chainId);
      if (chain && !chain.classifierIds.includes(sd.classifier.id)) {
        chain.classifierIds.push(sd.classifier.id);
        log(t("log.chainBound", chain.name, sd.classifier.name), "info");
        saveConfig(config);
        refreshCard(sd.hoverCard, chain, renderCtx);
        if (config.groupByTag) applyLayout();
        if (activeFilter) applyFilter();
      }
    }
  }
});

/* ---------- classifier shelf ---------- */

function renderShelf() {
  const shelf = $("#shelf");
  shelf.innerHTML = "";
  sigilEls.clear();
  for (const cls of config.classifiers) {
    const s = el("div", {
      class: "sigil" + (activeFilter === cls.id ? " active" : ""),
      "data-classifier-id": cls.id,
      title: cls.name + " — click to filter, drag onto a chain to tag, double-click to edit",
      style: { color: cls.tint }
    }, cls.glyph);
    s.addEventListener("mousedown", (e) => startSigilDrag(e, cls, s));
    s.addEventListener("dblclick", (e) => { e.preventDefault(); openClassifierModal(cls.id); });
    shelf.appendChild(s);
    sigilEls.set(cls.id, s);
  }
  const add = el("div", { class: "sigil add", title: "Add a new sigil" }, "+");
  add.addEventListener("click", () => openClassifierModal(null));
  shelf.appendChild(add);
}

function toggleFilter(classifierId) {
  activeFilter = activeFilter === classifierId ? null : classifierId;
  for (const [cid, sEl] of sigilEls.entries()) {
    sEl.classList.toggle("active", cid === activeFilter);
  }
  applyFilter();
  if (activeFilter) {
    const cls = config.classifiers.find(x => x.id === activeFilter);
    log(t("log.filterActive", cls ? cls.name : "?"), "dim");
  } else {
    log(t("log.filterCleared"), "dim");
  }
}

function applyFilter() {
  for (const [chainId, card] of cardEls.entries()) {
    if (!activeFilter) {
      card.classList.remove("dimmed");
      continue;
    }
    const chain = config.chains.find(c => c.id === chainId);
    const has = chain && chain.classifierIds.includes(activeFilter);
    card.classList.toggle("dimmed", !has);
  }
}

/* ---------- relayout ---------- */

function relayoutGrid() {
  if (isRadial()) {
    applyLayout();
    log(t("log.arranged"), "info");
    return;
  }
  if (config.groupByTag) {
    applyLayout();
    log(t("log.reflowed"), "info");
    return;
  }
  config.positions = {};
  for (let i = 0; i < config.chains.length; i++) {
    const chain = config.chains[i];
    const card = cardEls.get(chain.id);
    if (!card) continue;
    const pos = autoGridPosition(i);
    card.style.left = pos.x + "px";
    card.style.top  = pos.y + "px";
  }
  saveConfig(config);
  log(t("log.arranged"), "info");
}

/* ---------- tooltip ---------- */

const tip = $("#tip");
function showLinkTip(ev, chain, link, st) {
  tip.innerHTML = "";
  const state = st ? st.state : "unk";
  tip.append(
    el("div", { class: "ttl" }, chain.name + " · " + link.name),
    el("div", { class: "row" }, el("span", { class: "k" }, "Probe"),  el("span", {}, link.probe.toUpperCase())),
    el("div", { class: "row" }, el("span", { class: "k" }, "Target"), el("span", {}, link.target)),
    el("div", { class: "row" }, el("span", { class: "k" }, "State"), (() => {
      const e = el("span", {}, stateLabel(state));
      e.style.color = activeTheme.statusColorVar(state);
      return e;
    })()),
    el("div", { class: "row" }, el("span", { class: "k" }, "Latency"), el("span", {}, st ? fmtLatency(st.latency) : "—")),
    el("div", { class: "row" }, el("span", { class: "k" }, "Detail"),  el("span", {}, st ? st.detail : "—"))
  );
  tip.style.display = "block";
  moveTip(ev);
}
function moveTip(ev) {
  const x = ev.clientX + 14, y = ev.clientY + 12;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(x, window.innerWidth - w - 10) + "px";
  tip.style.top  = Math.min(y, window.innerHeight - h - 10) + "px";
}
function hideTip() { tip.style.display = "none"; }

/* ---------- side panel ---------- */

function selectChain(chainId, linkId = null) {
  selectedChainId = chainId;
  selectedLinkId = linkId;
  const wasOpen = $("#sidepanel").classList.contains("open");
  $("#sidepanel").classList.add("open");
  renderSidepanel(linkId);
  if (!wasOpen && (config.groupByTag || isRadial())) applyLayout();
}

function closeSidepanel() {
  $("#sidepanel").classList.remove("open");
  if (config.groupByTag || isRadial()) applyLayout();
}

function renderSidepanel(highlightLink = null) {
  const panel = $("#side-content");
  panel.innerHTML = "";
  const chain = config.chains.find(c => c.id === selectedChainId);
  if (!chain) { $("#sidepanel").classList.remove("open"); return; }
  const agg = aggregateChainState(chain, statusMap);

  const head = el("div", { class: "section" },
    el("div", { style: { display: "flex", alignItems: "center", marginBottom: "8px", gap: "6px" } },
      el("h3", { style: { margin: 0, flex: "1" } }, chain.name),
      el("button", { class: "btn ghost", style: { padding: "2px 8px", fontSize: "9px" },
        onClick: () => openChainModal(chain.id) }, t("actions.edit")),
      el("button", { class: "btn ghost", style: { padding: "2px 8px", fontSize: "9px" },
        onClick: closeSidepanel }, t("actions.close"))
    ),
    el("div", { class: "row" }, el("span", { class: "k" }, "Addr"),  el("span", { class: "v" }, chain.address || "—")),
    el("div", { class: "row" }, el("span", { class: "k" }, "State"),
      (() => { const e = el("span", { class: "v" }, stateLabel(agg.state)); e.style.color = activeTheme.statusColorVar(agg.state); return e; })()),
    el("div", { class: "row" }, el("span", { class: "k" }, "Links Hold"), el("span", { class: "v" }, agg.up + " / " + agg.total)),
    el("div", { class: "row" }, el("span", { class: "k" }, "Halt"),  el("span", { class: "v" }, chain.haltOnFail !== false ? "on first fail" : "probe all"))
  );
  panel.append(head);

  if (chain.classifierIds.length) {
    const tagSec = el("div", { class: "section" }, el("h3", {}, t("nouns.sigils")));
    const wrap = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } });
    for (const cid of chain.classifierIds) {
      const cls = config.classifiers.find(x => x.id === cid);
      if (!cls) continue;
      wrap.append(el("span", {
        class: "classifier-chip on",
        style: { color: cls.tint }
      }, el("span", { class: "g" }, cls.glyph), cls.name));
    }
    tagSec.append(wrap);
    panel.append(tagSec);
  }

  const linksSec = el("div", { class: "section" }, el("h3", {}, t("nouns.links").replace(/^./, c => c.toUpperCase())));
  if (!chain.links.length) {
    linksSec.append(el("div", { style: { color: "var(--ink-dim)", fontStyle: "italic", padding: "8px 0" } },
      t("empty.noLinksInPanel")));
  }
  for (let i = 0; i < chain.links.length; i++) {
    const link = chain.links[i];
    const st = statusMap.get(link.id);
    const state = st ? st.state : "unk";
    const wrap = el("div", {
      class: "link-card" + (highlightLink === link.id ? " highlight" : "")
    },
      el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
        el("span", { style: { color: "var(--ink)" } }, (i + 1) + ". " + link.name),
        el("span", { class: "pill " + pillCls(state) }, stateLabel(state))
      ),
      el("div", { style: { color: "var(--ink-dim)", fontSize: "10px", marginTop: "2px", fontFamily: "var(--mono)" } },
        link.probe.toUpperCase() + " · " + link.target),
      el("div", { style: { color: "var(--ink-dim)", fontSize: "10px", marginTop: "2px", fontFamily: "var(--mono)" } },
        "lat " + (st ? fmtLatency(st.latency) : "—") + "  ·  " + (st ? st.detail : "no divination")),
      el("div", { style: { marginTop: "6px" } },
        el("button", {
          class: "btn ghost",
          style: { padding: "3px 8px", fontSize: "9px" },
          onClick: () => rescryLink(chain, link)
        }, t("actions.rescry"))
      )
    );
    linksSec.append(wrap);
  }
  panel.append(linksSec);
}

/* ---------- chain editor modal ---------- */

let draft = null;
let chainDraft = null;

function openChainModal(chainId) {
  const chain = config.chains.find(c => c.id === chainId);
  if (!chain) return;
  chainDraft = structuredClone(chain);
  $("#chain-modal-title").textContent = t("modalTitles.inscribeChain") + " — " + (chain.name || t("nouns.chain"));
  renderChainModal();
  $("#modal-bg-chain").classList.add("open");
}

function renderChainModal() {
  const root = $("#chain-modal-body");
  root.innerHTML = "";
  root.append(chainEditorBlock(chainDraft, config.classifiers, null, renderChainModal));
}

function closeChainModal() { $("#modal-bg-chain").classList.remove("open"); }

function saveChainModal() {
  if (!chainDraft) return;
  const idx = config.chains.findIndex(c => c.id === chainDraft.id);
  if (idx < 0) return;
  config.chains[idx] = chainDraft;
  const validIds = new Set();
  for (const c of config.chains) for (const l of c.links) validIds.add(l.id);
  for (const k of [...statusMap.keys()]) if (!validIds.has(k)) statusMap.delete(k);
  saveConfig(config);
  closeChainModal();
  render();
  updateMeta();
  renderSidepanel();
  log(t("log.chainInscribed", chainDraft.name), "info");
}

function deleteChainModal() {
  if (!chainDraft) return;
  if (!confirm("Banish chain '" + chainDraft.name + "'? This cannot be undone.")) return;
  const id = chainDraft.id;
  const name = chainDraft.name;
  config.chains = config.chains.filter(c => c.id !== id);
  if (config.positions) delete config.positions[id];
  const validIds = new Set();
  for (const c of config.chains) for (const l of c.links) validIds.add(l.id);
  for (const k of [...statusMap.keys()]) if (!validIds.has(k)) statusMap.delete(k);
  if (selectedChainId === id) {
    selectedChainId = null;
    selectedLinkId = null;
    $("#sidepanel").classList.remove("open");
  }
  saveConfig(config);
  closeChainModal();
  render();
  updateMeta();
  log(t("log.chainBanished", name), "info");
}

function openConfigModal() {
  $("#cfg-timeout").value  = config.timeoutMs || 5000;
  $("#cfg-parallel").value = config.parallel  || 6;
  const themeSel = $("#cfg-theme");
  themeSel.innerHTML = "";
  for (const t of Object.values(THEMES)) {
    const o = document.createElement("option");
    o.value = t.id;
    o.textContent = t.name;
    if (t.id === (config.themeId || "grimorium")) o.selected = true;
    themeSel.append(o);
  }
  draft = structuredClone(config);
  renderChainsEditor();
  $("#modal-bg").classList.add("open");
}
function closeConfigModal() { $("#modal-bg").classList.remove("open"); }

function renderChainsEditor() {
  const root = $("#chains-editor");
  root.innerHTML = "";
  for (const c of draft.chains) {
    root.append(chainEditorBlock(
      c,
      draft.classifiers,
      () => {
        draft.chains = draft.chains.filter(x => x.id !== c.id);
        if (draft.positions) delete draft.positions[c.id];
        renderChainsEditor();
      },
      renderChainsEditor
    ));
  }
}

function chainEditorBlock(chain, classifiers, onDelete, onRefresh) {
  const block = el("div", { class: "chain-block" });

  const headKids = [
    el("div", {},
      el("label", {}, t("nouns.chainNameLabel")),
      el("input", { type: "text", value: chain.name || "",
        onInput: (e) => chain.name = e.target.value })
    ),
    el("div", {},
      el("label", {}, t("nouns.addressLabel")),
      el("input", { type: "text", value: chain.address || "",
        placeholder: "192.168.1.10 or example.com",
        onInput: (e) => chain.address = e.target.value })
    ),
    el("div", {},
      el("label", {}, t("nouns.haltLabel")),
      (() => {
        const sel = el("select", { onChange: (e) => chain.haltOnFail = e.target.value === "yes" });
        for (const [v, label] of [["yes", "on first fail"], ["no", "probe all"]]) {
          const o = el("option", { value: v }, label);
          if ((v === "yes") === (chain.haltOnFail !== false)) o.selected = true;
          sel.append(o);
        }
        return sel;
      })()
    )
  ];
  if (onDelete) {
    headKids.push(el("button", {
      class: "btn danger",
      style: { padding: "4px 10px", fontSize: "10px" },
      onClick: onDelete
    }, "✕ " + t("nouns.chain")));
  }
  block.append(el("div", { class: "head-row" }, ...headKids));

  if (classifiers.length) {
    const picker = el("div", { class: "classifier-picker" });
    for (const cls of classifiers) {
      const on = chain.classifierIds.includes(cls.id);
      const chip = el("span", {
        class: "classifier-chip" + (on ? " on" : ""),
        style: { color: on ? cls.tint : "var(--ink-faint)" }
      }, el("span", { class: "g" }, cls.glyph), cls.name);
      chip.addEventListener("click", () => {
        if (chain.classifierIds.includes(cls.id)) {
          chain.classifierIds = chain.classifierIds.filter(x => x !== cls.id);
        } else {
          chain.classifierIds.push(cls.id);
        }
        onRefresh();
      });
      picker.append(chip);
    }
    block.append(picker);
  }

  const linksRoot = el("div", { style: { marginTop: "8px" } });
  for (const l of chain.links) linksRoot.append(linkEditorRow(chain, l));
  block.append(linksRoot);
  block.append(
    el("button", {
      class: "btn add-link",
      onClick: () => {
        const nl = {
          id: cryptoRandomId(), name: "new link", probe: "https",
          target: chain.address ? "http://" + chain.address + "/" : "http://",
          expect: { kind: "answered" }
        };
        chain.links.push(nl);
        linksRoot.append(linkEditorRow(chain, nl));
      }
    }, t("actions.addLink"))
  );
  return block;
}

function linkEditorRow(chain, link) {
  const row = el("div", { class: "link-edit-row" });
  const nameI = el("input", { type: "text", value: link.name, placeholder: "link name",
    onInput: (e) => link.name = e.target.value });
  const probeS = el("select", {
    onChange: (e) => {
      link.probe = e.target.value;
      // Reasonable expect defaults per probe.
      if (link.probe === "doh")             link.expect = { kind: "resolves" };
      else if (link.probe === "https-cors") link.expect = { kind: "status", in: [200] };
      else if (link.probe === "ws-tcp")     link.expect = { kind: "reachable" };
      else                                  link.expect = { kind: "answered" };
      refreshExpectCell();
    }
  });
  for (const [v, label] of [
    ["https",      "HTTPS (opaque)"],
    ["https-cors", "HTTPS (CORS)"],
    ["doh",        "DNS (DoH)"],
    ["ws-tcp",     "TCP (WS probe)"]
  ]) {
    const o = el("option", { value: v }, label);
    if (link.probe === v) o.selected = true;
    probeS.append(o);
  }
  const targetI = el("input", { type: "text", value: link.target,
    placeholder: link.probe === "doh" ? "example.com" : link.probe === "ws-tcp" ? "host:port" : "url",
    onInput: (e) => link.target = e.target.value });

  const expectCell = el("div", {});
  function refreshExpectCell() {
    expectCell.innerHTML = "";
    expectCell.append(buildExpectEditor(link));
  }
  refreshExpectCell();

  const x = el("button", { class: "x", title: "Remove link",
    onClick: () => {
      chain.links = chain.links.filter(l => l.id !== link.id);
      row.remove();
    }
  }, "✕");
  row.append(nameI, probeS, targetI, expectCell, x);
  return row;
}

function buildExpectEditor(link) {
  // Compact one-cell editor — picks an expect.kind valid for the probe.
  const wrap = el("div", { style: { display: "flex", gap: "4px" } });
  const kinds = link.probe === "doh"        ? [["resolves", "resolves"]]
              : link.probe === "https-cors" ? [["status", "status"], ["json-has", "json-has"], ["answered", "answered"]]
              : link.probe === "ws-tcp"     ? [["reachable", "reachable"]]
              :                               [["answered", "answered"]];
  const kindS = el("select", { onChange: (e) => {
    link.expect = { kind: e.target.value };
    if (link.expect.kind === "status") link.expect.in = [200];
    refreshSub();
  }});
  for (const [v, t] of kinds) {
    const o = el("option", { value: v }, t);
    if ((link.expect?.kind || kinds[0][0]) === v) o.selected = true;
    kindS.append(o);
  }
  const sub = el("div", { style: { flex: 1 } });
  function refreshSub() {
    sub.innerHTML = "";
    if (link.expect?.kind === "status") {
      sub.append(el("input", {
        type: "text",
        value: (link.expect.in || []).join(","),
        placeholder: "200,204",
        onInput: (e) => link.expect.in = e.target.value.split(",").map(s => parseInt(s.trim(), 10)).filter(Number.isFinite)
      }));
    } else if (link.expect?.kind === "json-has") {
      sub.append(el("input", {
        type: "text",
        value: link.expect.path || "",
        placeholder: "Id",
        onInput: (e) => link.expect.path = e.target.value
      }));
    } else if (link.expect?.kind === "resolves") {
      sub.append(el("input", {
        type: "text",
        value: link.expect.equals || "",
        placeholder: "expected IP (optional)",
        onInput: (e) => {
          const v = e.target.value.trim();
          if (v) link.expect.equals = v; else delete link.expect.equals;
        }
      }));
    }
  }
  refreshSub();
  wrap.append(kindS, sub);
  return wrap;
}

function saveAndApplyConfig() {
  draft.timeoutMs = clamp(parseInt($("#cfg-timeout").value, 10) || 5000, 500, 30000);
  draft.parallel  = clamp(parseInt($("#cfg-parallel").value, 10) || 6, 1, 32);
  const newThemeId = $("#cfg-theme").value || "grimorium";
  const themeChanged = newThemeId !== (config.themeId || "grimorium");
  draft.themeId = newThemeId;
  config = draft;
  saveConfig(config);
  closeConfigModal();
  if (themeChanged) {
    location.reload();   // theme swap rebuilds decoration; simplest path
    return;
  }
  const linkCount = config.chains.reduce((n, c) => n + c.links.length, 0);
  log(t("log.inscribed", config.chains.length, linkCount), "info");
  const validIds = new Set();
  for (const c of config.chains) for (const l of c.links) validIds.add(l.id);
  for (const k of [...statusMap.keys()]) if (!validIds.has(k)) statusMap.delete(k);
  // Drop active filter if its classifier was deleted.
  if (activeFilter && !config.classifiers.find(c => c.id === activeFilter)) activeFilter = null;
  render();
  renderShelf();
  updateMeta();
  renderSidepanel();
}

/* ---------- classifier modal ---------- */

let editingClassifierId = null;
let pickedGlyph = "✦";
let pickedTint = DEFAULT_TINTS[0];

function openClassifierModal(id) {
  editingClassifierId = id;
  const existing = id ? config.classifiers.find(c => c.id === id) : null;
  $("#cls-title").textContent = existing ? t("modalTitles.sigilEdit") : t("modalTitles.sigilNew");
  $("#cls-name").value = existing ? existing.name : "";
  pickedGlyph = existing ? existing.glyph : "✦";
  pickedTint  = existing ? existing.tint  : DEFAULT_TINTS[0];
  $("#btn-cls-delete").style.display = existing ? "inline-block" : "none";

  const gp = $("#cls-glyph-picker");
  gp.innerHTML = "";
  for (const g of activeTheme.glyphs) {
    const cell = el("div", {
      class: "cls-glyph-cell",
      "data-glyph": g,
      style: {
        width: "28px", height: "28px",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--glyph)", fontSize: "16px",
        border: g === pickedGlyph ? "1px solid var(--gold)" : "1px solid var(--ink-faint)",
        color: g === pickedGlyph ? "var(--gold)" : "var(--ink-dim)",
        cursor: "pointer"
      }
    }, g);
    cell.addEventListener("click", () => selectGlyph(g));
    gp.append(cell);
  }
  const tp = $("#cls-tint-picker");
  tp.innerHTML = "";
  for (const t of DEFAULT_TINTS) {
    const cell = el("div", {
      class: "cls-tint-cell",
      "data-tint": t,
      style: {
        width: "26px", height: "26px",
        background: t,
        border: t === pickedTint ? "2px solid var(--gold)" : "1px solid var(--ink-faint)",
        cursor: "pointer"
      }
    });
    cell.addEventListener("click", () => selectTint(t));
    tp.append(cell);
  }
  $("#modal-bg-classifier").classList.add("open");
  $("#cls-name").focus();
}

function selectGlyph(g) {
  pickedGlyph = g;
  for (const cell of $$(".cls-glyph-cell")) {
    const isSel = cell.getAttribute("data-glyph") === g;
    cell.style.border = isSel ? "1px solid var(--gold)" : "1px solid var(--ink-faint)";
    cell.style.color  = isSel ? "var(--gold)" : "var(--ink-dim)";
  }
}

function selectTint(t) {
  pickedTint = t;
  for (const cell of $$(".cls-tint-cell")) {
    const isSel = cell.getAttribute("data-tint") === t;
    cell.style.border = isSel ? "2px solid var(--gold)" : "1px solid var(--ink-faint)";
  }
}
function closeClassifierModal() { $("#modal-bg-classifier").classList.remove("open"); }

function saveClassifier() {
  const name = ($("#cls-name").value || "").trim() || "unnamed";
  if (editingClassifierId) {
    const cls = config.classifiers.find(c => c.id === editingClassifierId);
    if (cls) { cls.name = name; cls.glyph = pickedGlyph; cls.tint = pickedTint; }
    log(t("log.sigilUpdated", name), "info");
  } else {
    config.classifiers.push({ id: cryptoRandomId(), name, glyph: pickedGlyph, tint: pickedTint });
    log(t("log.sigilBound", name), "info");
  }
  saveConfig(config);
  closeClassifierModal();
  renderShelf();
  // Re-render cards in case the editing modal also reflected this classifier.
  for (const ch of config.chains) updateChainVisual(ch.id);
}

function deleteClassifier() {
  if (!editingClassifierId) return;
  const cls = config.classifiers.find(c => c.id === editingClassifierId);
  if (!cls) return;
  if (!confirm("Banish sigil '" + cls.name + "'? It will be removed from " +
               config.chains.filter(c => c.classifierIds.includes(cls.id)).length + " chain(s).")) return;
  config.classifiers = config.classifiers.filter(c => c.id !== editingClassifierId);
  for (const ch of config.chains) {
    ch.classifierIds = ch.classifierIds.filter(x => x !== editingClassifierId);
  }
  if (activeFilter === editingClassifierId) activeFilter = null;
  saveConfig(config);
  closeClassifierModal();
  renderShelf();
  for (const ch of config.chains) updateChainVisual(ch.id);
  if (config.groupByTag) applyLayout();
  log(t("log.sigilBanished", cls.name), "info");
}

/* ---------- import/export ---------- */

function openJsonModal(mode) {
  $("#json-title").textContent = mode === "export" ? t("modalTitles.transcribeOut") : t("modalTitles.transcribeIn");
  $("#json-area").value = mode === "export" ? JSON.stringify(config, null, 2) : "";
  $("#json-area").readOnly = mode === "export";
  $("#btn-json-apply").style.display = mode === "export" ? "none" : "inline-block";
  $("#modal-bg-json").classList.add("open");
}
function closeJsonModal() { $("#modal-bg-json").classList.remove("open"); }

/* ---------- animation loop ---------- */

let lastFrame = 0;
function loop(t) {
  const dt = lastFrame ? (t - lastFrame) : 16;
  if (t - lastFrame > 33) {
    decoration.drawCanvas(t, dt);
    if (isRadial() && orbitalState) {
      const frozen = dragState && dragState.chainId ? new Set([dragState.chainId]) : null;
      tickOrbitalState(orbitalState, dt, currentOrbitalBounds(), frozen);
      applyOrbitalDom();
    }
    lastFrame = t;
  }
  decoration.maybeSpawnEmber(t);
  decoration.tickScene(t);
  requestAnimationFrame(loop);
}

window.addEventListener("resize", () => {
  decoration.sizeCanvas();
  decoration.buildBackground();
  if (isRadial()) rebuildOrbital();
  else if (config.groupByTag) applyLayout();
});
decoration.sizeCanvas();
decoration.buildBackground();
requestAnimationFrame(loop);

/* ---------- wire up ---------- */

$("#btn-scan").addEventListener("click", scanAll);
$("#btn-config").addEventListener("click", openConfigModal);
$("#btn-relayout").addEventListener("click", relayoutGrid);
$("#btn-group").addEventListener("click", () => {
  config.groupByTag = !config.groupByTag;
  saveConfig(config);
  $("#btn-group").classList.toggle("active", config.groupByTag);
  applyLayout();
  log(t(config.groupByTag ? "log.groupingOn" : "log.groupingOff"), "dim");
});
$("#btn-close-modal").addEventListener("click", closeConfigModal);
$("#btn-cancel").addEventListener("click", closeConfigModal);
$("#btn-save").addEventListener("click", saveAndApplyConfig);
$("#btn-add-chain").addEventListener("click", () => {
  draft.chains.push({
    id: cryptoRandomId(),
    name: "new chain",
    address: "",
    haltOnFail: true,
    classifierIds: [],
    links: []
  });
  renderChainsEditor();
});
$("#btn-reset").addEventListener("click", () => {
  if (!confirm("Reset the grimoire to its initial inscription? (clears card positions and sigils too)")) return;
  draft = defaultConfig();
  renderChainsEditor();
  $("#cfg-timeout").value = draft.timeoutMs;
  $("#cfg-parallel").value = draft.parallel;
});
$("#btn-clear-log").addEventListener("click", () => { $("#log").innerHTML = ""; });

$("#btn-export").addEventListener("click", () => openJsonModal("export"));
$("#btn-import").addEventListener("click", () => openJsonModal("import"));
$("#btn-close-json").addEventListener("click", closeJsonModal);
$("#btn-json-cancel").addEventListener("click", closeJsonModal);
$("#btn-json-apply").addEventListener("click", () => {
  try {
    const parsed = JSON.parse($("#json-area").value);
    if (!parsed || !Array.isArray(parsed.chains)) throw new Error("missing chains[] array");
    draft = normalize(parsed);
    renderChainsEditor();
    $("#cfg-timeout").value = draft.timeoutMs;
    $("#cfg-parallel").value = draft.parallel;
    closeJsonModal();
    log(t("log.transcribed"), "info");
  } catch (e) { alert("Invalid JSON: " + e.message); }
});

$("#btn-close-cls").addEventListener("click", closeClassifierModal);
$("#btn-cls-cancel").addEventListener("click", closeClassifierModal);
$("#btn-cls-save").addEventListener("click", saveClassifier);
$("#btn-cls-delete").addEventListener("click", deleteClassifier);

$("#btn-close-chain").addEventListener("click", closeChainModal);
$("#btn-chain-cancel").addEventListener("click", closeChainModal);
$("#btn-chain-save").addEventListener("click", saveChainModal);
$("#btn-chain-delete").addEventListener("click", deleteChainModal);

$("#modal-bg").addEventListener("click", (e) => { if (e.target.id === "modal-bg") closeConfigModal(); });
$("#modal-bg-json").addEventListener("click", (e) => { if (e.target.id === "modal-bg-json") closeJsonModal(); });
$("#modal-bg-classifier").addEventListener("click", (e) => { if (e.target.id === "modal-bg-classifier") closeClassifierModal(); });
$("#modal-bg-chain").addEventListener("click", (e) => { if (e.target.id === "modal-bg-chain") closeChainModal(); });

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if ($("#modal-bg-classifier").classList.contains("open")) closeClassifierModal();
    else if ($("#modal-bg-chain").classList.contains("open")) closeChainModal();
    else if ($("#modal-bg-json").classList.contains("open")) closeJsonModal();
    else if ($("#modal-bg").classList.contains("open")) closeConfigModal();
    else if ($("#sidepanel").classList.contains("open")) closeSidepanel();
    else if (activeFilter) toggleFilter(activeFilter);
  }
  if (e.key === " " && !["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName)) {
    e.preventDefault();
    scanAll();
  }
});

/* ---------- boot ---------- */

log(t("log.awakens", new Date().toISOString().slice(0, 10)), "info");
log(t("log.scryHint"), "dim");
log(t("log.dragHint"), "dim");
log(t("log.sigilHint"), "dim");
log(t("log.groupHint"), "dim");
$("#btn-group").classList.toggle("active", config.groupByTag);
render();
renderShelf();
updateMeta();
