import { vi } from "vitest";

/**
 * Stub fetch with scripted responses keyed by URL substring match.
 * Each script entry: { match, status, body, opaque, delayMs, error }
 *   match: string|RegExp tested against the request URL
 *   status: number HTTP status (defaults 200)
 *   body: object|string returned (JSON-stringified if object)
 *   opaque: boolean — if true, simulates a no-cors opaque response
 *   delayMs: number — delay before resolving
 *   error: string — if set, rejects with new Error(error). "abort" rejects as AbortError.
 */
export function mockFetch(scripts) {
  const fn = vi.fn(async (url, opts) => {
    const u = typeof url === "string" ? url : url.url;
    const s = scripts.find(s =>
      typeof s.match === "string" ? u.includes(s.match) : s.match.test(u));
    if (!s) throw new Error(`unmocked fetch: ${u}`);

    if (s.delayMs) await new Promise(r => setTimeout(r, s.delayMs));

    if (opts?.signal?.aborted) {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }

    if (s.error) {
      const e = new Error(s.error);
      if (s.error === "abort") e.name = "AbortError";
      throw e;
    }

    const status = s.status ?? 200;
    const bodyText = typeof s.body === "string"
      ? s.body
      : JSON.stringify(s.body ?? {});
    return {
      ok: status >= 200 && status < 300,
      status,
      type: s.opaque ? "opaque" : "basic",
      async json() { return JSON.parse(bodyText); },
      async text() { return bodyText; }
    };
  });
  globalThis.fetch = fn;
  return fn;
}

/**
 * Stub WebSocket. Each connection's behavior is scripted by URL substring match.
 * Each script entry: { match, event, afterMs }
 *   event: "open" | "error" — which event to fire
 *   afterMs: number — when to fire it (relative to construction)
 *   onConstruct: optional callback receiving the ws instance for advanced tests
 */
export function mockWebSocket(scripts) {
  const instances = [];

  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.onopen = null;
      this.onerror = null;
      this.onclose = null;
      this.onmessage = null;
      instances.push(this);

      const s = scripts.find(s =>
        typeof s.match === "string" ? url.includes(s.match) : s.match.test(url));
      if (!s) return;
      if (s.onConstruct) s.onConstruct(this);

      setTimeout(() => {
        if (s.event === "open") {
          this.readyState = 1;
          this.onopen && this.onopen({ type: "open" });
        } else if (s.event === "error") {
          this.readyState = 3;
          this.onerror && this.onerror({ type: "error" });
        }
      }, s.afterMs ?? 0);
    }
    close() { this.readyState = 3; }
  }
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSED = 3;

  globalThis.WebSocket = MockWebSocket;
  return { instances, MockWebSocket };
}

/**
 * Minimal in-memory localStorage shim for tests where jsdom isn't available
 * or you want to start from a known-empty state.
 */
export function memoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i) => [...store.keys()][i] ?? null,
    _store: store
  };
}
