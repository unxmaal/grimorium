// Pure state + utility helpers. No DOM, no global state. Theme-neutral.
//
// State vocabulary across the app:
//   unk      — never probed
//   ok       — probe succeeded
//   warn     — degraded (e.g. slow response, unexpected non-error status)
//   bad      — probe failed
//   check    — probe in flight
//   skipped  — upstream link failed, this one was bypassed (halt-on-fail)

const STATE_RANK = Object.freeze({
  unk: 0,
  ok: 1,
  skipped: 2,
  check: 3,
  warn: 4,
  bad: 5
});

const PILL_CLASS = Object.freeze({
  ok: "ok",
  warn: "warn",
  bad: "bad",
  check: "check",
  skipped: "skipped",
  unk: "unk"
});

/**
 * Aggregate a chain's overall state from the statuses of its links.
 * @param {{links: Array<{id: string}>}} chain
 * @param {Map<string, {state: string}>} statusMap link.id -> { state, ... }
 * @returns {{state: string, total: number, up: number, firstBadIdx: number}}
 */
export function aggregateChainState(chain, statusMap) {
  if (!chain.links.length) return { state: "unk", total: 0, up: 0, firstBadIdx: -1 };
  let worst = "unk";
  let hasAny = false;
  let up = 0;
  let firstBadIdx = -1;
  for (let i = 0; i < chain.links.length; i++) {
    const st = statusMap.get(chain.links[i].id);
    if (!st) continue;
    hasAny = true;
    if (st.state === "ok") up++;
    if (st.state === "bad" && firstBadIdx === -1) firstBadIdx = i;
    if ((STATE_RANK[st.state] ?? 0) > (STATE_RANK[worst] ?? 0)) worst = st.state;
  }
  return { state: hasAny ? worst : "unk", total: chain.links.length, up, firstBadIdx };
}

/** CSS class suffix for a given semantic state. */
export function pillCls(state) {
  return PILL_CLASS[state] ?? "unk";
}

/** Read a dotted-path property from an object, returning undefined on miss. */
export function getByPath(obj, path) {
  if (!path) return obj;
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Stable non-negative 32-bit hash of a string. Used for deterministic decor placement. */
export function hash32(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function fmtLatency(ms) {
  if (ms == null) return "—";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return Math.round(ms) + "ms";
  return (ms / 1000).toFixed(2) + "s";
}

export function fmtTime(d = new Date()) {
  return d.toTimeString().slice(0, 8);
}

/** Short random id suitable for client-side entity keys. Not cryptographically strong. */
export function cryptoRandomId() {
  return Math.random().toString(36).slice(2, 10);
}
