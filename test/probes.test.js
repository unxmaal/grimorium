import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runLink, probeDoh, probeHttp, probeWsTcp } from "../src/js/probes.js";
import { mockFetch, mockWebSocket } from "./helpers/mocks.js";

const realFetch = globalThis.fetch;
const realWebSocket = globalThis.WebSocket;

afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.WebSocket = realWebSocket;
  vi.useRealTimers();
});

describe("runLink dispatch", () => {
  it("routes doh probe to probeDoh", async () => {
    mockFetch([{ match: "cloudflare-dns.com",
      body: { Answer: [{ type: 1, data: "1.2.3.4" }] } }]);
    const r = await runLink({ probe: "doh", target: "example.com", expect: {} }, 5000);
    expect(r.state).toBe("ok");
    expect(r.detail).toContain("1.2.3.4");
  });

  it("routes https probe to probeHttp (no-cors)", async () => {
    mockFetch([{ match: "example.com", opaque: true }]);
    const r = await runLink(
      { probe: "https", target: "http://example.com/", expect: { kind: "answered" } },
      5000
    );
    expect(r.state).toBe("ok");
    expect(r.detail).toMatch(/opaque/);
  });

  it("routes https-cors probe to probeHttp (cors)", async () => {
    mockFetch([{ match: "example.com", status: 200, body: { Id: "abc" } }]);
    const r = await runLink(
      { probe: "https-cors", target: "http://example.com/", expect: { kind: "status", in: [200] } },
      5000
    );
    expect(r.state).toBe("ok");
  });

  it("returns bad for unknown probe types", async () => {
    const r = await runLink({ probe: "nonsense", target: "x", expect: {} }, 1000);
    expect(r.state).toBe("bad");
    expect(r.detail).toContain("unknown probe");
  });
});

describe("probeDoh", () => {
  it("returns bad with no name", async () => {
    const r = await probeDoh("", {}, 5000);
    expect(r.state).toBe("bad");
    expect(r.detail).toBe("no name");
  });

  it("returns ok with the resolved IPs in detail", async () => {
    mockFetch([{ match: "cloudflare-dns.com",
      body: { Answer: [{ type: 1, data: "1.2.3.4" }, { type: 1, data: "5.6.7.8" }] } }]);
    const r = await probeDoh("example.com", {}, 5000);
    expect(r.state).toBe("ok");
    expect(r.detail).toContain("1.2.3.4");
    expect(r.detail).toContain("5.6.7.8");
  });

  it("filters out non-A records (type !== 1)", async () => {
    mockFetch([{ match: "cloudflare-dns.com",
      body: { Answer: [{ type: 5, data: "alias.example.com" }] } }]);
    const r = await probeDoh("example.com", {}, 5000);
    expect(r.state).toBe("bad");
    expect(r.detail).toBe("no A record");
  });

  it("returns ok with expect.equals matching", async () => {
    mockFetch([{ match: "cloudflare-dns.com",
      body: { Answer: [{ type: 1, data: "1.2.3.4" }] } }]);
    const r = await probeDoh("example.com", { kind: "resolves", equals: "1.2.3.4" }, 5000);
    expect(r.state).toBe("ok");
    expect(r.detail).toContain("→");
  });

  it("returns warn when expect.equals doesn't match", async () => {
    mockFetch([{ match: "cloudflare-dns.com",
      body: { Answer: [{ type: 1, data: "1.2.3.4" }] } }]);
    const r = await probeDoh("example.com", { kind: "resolves", equals: "9.9.9.9" }, 5000);
    expect(r.state).toBe("warn");
    expect(r.detail).toContain("expected 9.9.9.9");
  });

  it("returns bad on DoH non-200 status", async () => {
    mockFetch([{ match: "cloudflare-dns.com", status: 503, body: {} }]);
    const r = await probeDoh("example.com", {}, 5000);
    expect(r.state).toBe("bad");
    expect(r.detail).toContain("DoH HTTP 503");
  });

  it("returns bad on abort", async () => {
    mockFetch([{ match: "cloudflare-dns.com", error: "abort" }]);
    const r = await probeDoh("example.com", {}, 5000);
    expect(r.state).toBe("bad");
    expect(r.detail).toBe("DoH timeout");
  });
});

describe("probeHttp (no-cors / opaque)", () => {
  it("returns bad with no target", async () => {
    const r = await probeHttp("", {}, 5000, false);
    expect(r.state).toBe("bad");
    expect(r.detail).toBe("no target");
  });

  it("returns ok with opaque response", async () => {
    mockFetch([{ match: "example", opaque: true }]);
    const r = await probeHttp("example.com", { kind: "answered" }, 5000, false);
    expect(r.state).toBe("ok");
    expect(r.detail).toContain("opaque");
  });

  it("prepends http:// when scheme missing", async () => {
    const fetchFn = mockFetch([{ match: "example.com", opaque: true }]);
    await probeHttp("example.com", {}, 5000, false);
    expect(fetchFn).toHaveBeenCalled();
    const url = fetchFn.mock.calls[0][0];
    expect(url).toMatch(/^http:\/\/example\.com/);
  });

  it("returns warn for slow opaque responses (>1500ms)", async () => {
    mockFetch([{ match: "example", opaque: true, delayMs: 1600 }]);
    const r = await probeHttp("example.com", {}, 3000, false);
    expect(r.state).toBe("warn");
    expect(r.detail).toMatch(/slow/);
  }, 10000);

  it("returns bad on fetch error", async () => {
    mockFetch([{ match: "example", error: "ECONNREFUSED" }]);
    const r = await probeHttp("example.com", {}, 5000, false);
    expect(r.state).toBe("bad");
    expect(r.detail).toContain("ECONNREFUSED");
  });
});

describe("probeHttp (cors) — status expect", () => {
  it("returns ok when status matches expect.in", async () => {
    mockFetch([{ match: "example", status: 200 }]);
    const r = await probeHttp("http://example.com/", { kind: "status", in: [200] }, 5000, true);
    expect(r.state).toBe("ok");
    expect(r.detail).toContain("HTTP 200");
  });

  it("returns warn when status is in 4xx but not expected", async () => {
    mockFetch([{ match: "example", status: 404 }]);
    const r = await probeHttp("http://example.com/", { kind: "status", in: [200] }, 5000, true);
    expect(r.state).toBe("warn");
    expect(r.detail).toContain("expected 200");
  });

  it("returns bad when status is 5xx", async () => {
    mockFetch([{ match: "example", status: 502 }]);
    const r = await probeHttp("http://example.com/", { kind: "status", in: [200] }, 5000, true);
    expect(r.state).toBe("bad");
    expect(r.detail).toContain("HTTP 502");
  });

  it("accepts multiple expected statuses", async () => {
    mockFetch([{ match: "example", status: 204 }]);
    const r = await probeHttp("http://example.com/", { kind: "status", in: [200, 204] }, 5000, true);
    expect(r.state).toBe("ok");
  });
});

describe("probeHttp (cors) — json-has expect", () => {
  it("returns ok when JSON path exists", async () => {
    mockFetch([{ match: "example", status: 200, body: { Id: "abc", nested: { x: 1 } } }]);
    const r = await probeHttp("http://example.com/", { kind: "json-has", path: "Id" }, 5000, true);
    expect(r.state).toBe("ok");
    expect(r.detail).toContain("Id");
  });

  it("walks nested paths", async () => {
    mockFetch([{ match: "example", status: 200, body: { a: { b: { c: 42 } } } }]);
    const r = await probeHttp("http://example.com/", { kind: "json-has", path: "a.b.c" }, 5000, true);
    expect(r.state).toBe("ok");
  });

  it("returns bad when path is missing", async () => {
    mockFetch([{ match: "example", status: 200, body: { Other: 1 } }]);
    const r = await probeHttp("http://example.com/", { kind: "json-has", path: "Id" }, 5000, true);
    expect(r.state).toBe("bad");
    expect(r.detail).toContain("missing");
  });

  it("returns bad on non-json body", async () => {
    mockFetch([{ match: "example", status: 200, body: "<html>not json</html>" }]);
    const r = await probeHttp("http://example.com/", { kind: "json-has", path: "Id" }, 5000, true);
    expect(r.state).toBe("bad");
    expect(r.detail).toContain("non-json");
  });
});

describe("probeWsTcp", () => {
  it("returns bad with malformed target (no port)", async () => {
    const r = await probeWsTcp("example.com", 5000);
    expect(r.state).toBe("bad");
    expect(r.detail).toBe("expected host:port");
  });

  it("returns ok when WebSocket open fires", async () => {
    mockWebSocket([{ match: "example.com:80", event: "open", afterMs: 10 }]);
    const r = await probeWsTcp("example.com:80", 5000);
    expect(r.state).toBe("ok");
    expect(r.detail).toContain("WebSocket");
  });

  it("returns ok on fast error (TCP responsive, non-WS reply)", async () => {
    mockWebSocket([{ match: "example.com:22", event: "error", afterMs: 50 }]);
    const r = await probeWsTcp("example.com:22", 5000);
    expect(r.state).toBe("ok");
    expect(r.detail).toMatch(/responsive/);
  });

  it("returns bad when error is slower than the SLOW_THRESHOLD", async () => {
    mockWebSocket([{ match: "example.com:9999", event: "error", afterMs: 1800 }]);
    const r = await probeWsTcp("example.com:9999", 5000);
    expect(r.state).toBe("bad");
    expect(r.detail).toBe("no response");
  }, 10000);

  it("times out when no event fires within timeoutMs", async () => {
    mockWebSocket([{ match: "example.com:1", event: "open", afterMs: 5000 }]);
    const r = await probeWsTcp("example.com:1", 200);
    expect(r.state).toBe("bad");
    expect(r.detail).toBe("timeout");
  }, 5000);

  it("accepts a ws:// prefixed target", async () => {
    mockWebSocket([{ match: "example.com:80", event: "open", afterMs: 10 }]);
    const r = await probeWsTcp("ws://example.com:80", 5000);
    expect(r.state).toBe("ok");
  });
});
