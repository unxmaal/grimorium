// Probe implementations + dispatch. All four probe types accept (target, expect, timeoutMs)
// and return Promise<{state, latency, detail}>. State is one of ok|warn|bad.
// Mockable in tests by replacing globalThis.fetch and globalThis.WebSocket.

import { fmtLatency, getByPath } from "./state.js";

const DOH_URL = "https://cloudflare-dns.com/dns-query";
const SLOW_THRESHOLD_MS = 1500;

export async function runLink(link, timeoutMs) {
  switch (link.probe) {
    case "doh":        return probeDoh(link.target, link.expect, timeoutMs);
    case "https":      return probeHttp(link.target, link.expect, timeoutMs, false);
    case "https-cors": return probeHttp(link.target, link.expect, timeoutMs, true);
    case "ws-tcp":     return probeWsTcp(link.target, timeoutMs);
    default:           return { state: "bad", latency: null, detail: "unknown probe: " + link.probe };
  }
}

export async function probeDoh(target, expect, timeoutMs) {
  const name = (target || "").trim();
  if (!name) return { state: "bad", latency: null, detail: "no name" };
  const url = DOH_URL + "?name=" + encodeURIComponent(name) + "&type=A";
  const ctl = new AbortController();
  const t0 = performance.now();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { "Accept": "application/dns-json" },
      signal: ctl.signal,
      cache: "no-store"
    });
    const latency = performance.now() - t0;
    clearTimeout(timer);
    if (!r.ok) return { state: "bad", latency, detail: "DoH HTTP " + r.status };
    const j = await r.json();
    const answers = (j.Answer || []).filter(a => a.type === 1).map(a => a.data);
    if (!answers.length) return { state: "bad", latency, detail: "no A record" };
    if (expect && expect.kind === "resolves" && expect.equals) {
      const hit = answers.includes(expect.equals);
      return {
        state: hit ? "ok" : "warn",
        latency,
        detail: (hit ? "→ " : "expected " + expect.equals + ", got ") + answers.join(", ")
      };
    }
    return { state: "ok", latency, detail: "→ " + answers.join(", ") };
  } catch (e) {
    clearTimeout(timer);
    const latency = performance.now() - t0;
    if (e.name === "AbortError") return { state: "bad", latency, detail: "DoH timeout" };
    return { state: "bad", latency, detail: "DoH " + (e.message || "failed") };
  }
}

export async function probeHttp(target, expect, timeoutMs, useCors) {
  let url = (target || "").trim();
  if (!url) return { state: "bad", latency: null, detail: "no target" };
  if (!/^https?:\/\//i.test(url)) url = "http://" + url;
  const ctl = new AbortController();
  const t0 = performance.now();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      mode: useCors ? "cors" : "no-cors",
      cache: "no-store",
      redirect: "follow",
      signal: ctl.signal
    });
    const latency = performance.now() - t0;
    clearTimeout(timer);

    // no-cors path: opaque, all we can say is "something answered".
    if (!useCors || r.type === "opaque") {
      const slow = latency > SLOW_THRESHOLD_MS;
      return {
        state: slow ? "warn" : "ok",
        latency,
        detail: (slow ? "slow " : "answered ") + "(opaque, " + fmtLatency(latency) + ")"
      };
    }

    if (expect && expect.kind === "status") {
      const wanted = expect.in || [200];
      const ok = wanted.includes(r.status);
      return {
        state: ok ? "ok" : (r.status >= 500 ? "bad" : "warn"),
        latency,
        detail: "HTTP " + r.status + (ok ? "" : " (expected " + wanted.join("|") + ")")
      };
    }
    if (expect && expect.kind === "json-has") {
      try {
        const j = await r.json();
        const v = getByPath(j, expect.path);
        const has = v !== undefined;
        return {
          state: has ? "ok" : "bad",
          latency,
          detail: has ? "json." + expect.path + " = " + JSON.stringify(v).slice(0, 40)
                      : "json missing " + expect.path
        };
      } catch (_) {
        return { state: "bad", latency, detail: "non-json response" };
      }
    }
    return {
      state: r.ok ? "ok" : (r.status >= 500 ? "bad" : "warn"),
      latency,
      detail: "HTTP " + r.status
    };
  } catch (e) {
    clearTimeout(timer);
    const latency = performance.now() - t0;
    if (e.name === "AbortError") return { state: "bad", latency, detail: "timeout (" + fmtLatency(latency) + ")" };
    return { state: "bad", latency, detail: e.message || "fetch failed" };
  }
}

export async function probeWsTcp(target, timeoutMs) {
  const m = /^(?:wss?:\/\/)?([^:\/]+):(\d+)$/.exec(target || "");
  if (!m) return { state: "bad", latency: null, detail: "expected host:port" };
  const url = "ws://" + m[1] + ":" + m[2];
  return new Promise(resolve => {
    const t0 = performance.now();
    let settled = false, ws;
    const finish = (state, detail) => {
      if (settled) return;
      settled = true;
      const latency = performance.now() - t0;
      try { ws && ws.close(); } catch (_) {}
      resolve({ state, latency, detail });
    };
    try { ws = new WebSocket(url); }
    catch (e) { return finish("bad", e.message || "ws init failed"); }
    ws.onopen = () => finish("ok", "port speaks WebSocket");
    // Fast onerror == fast TCP response (RST or non-WS reply). Slow == filtered.
    ws.onerror = () => {
      const latency = performance.now() - t0;
      if (latency < SLOW_THRESHOLD_MS) finish("ok", "port responsive (TCP, non-WS)");
      else                              finish("bad", "no response");
    };
    setTimeout(() => finish("bad", "timeout"), timeoutMs);
  });
}
