# Grimorium

A single-file HTML dashboard for monitoring your own network. Open it in a browser, point it at the things you care about, click Scry All. No install, no server, no agent, no account.

It exists because every monitoring tool I tried (Prometheus, Grafana, Nagios, Zabbix, Paessler, and others I have since forgotten) felt too opinionated or too heavy for a home network. Grimorium is meant to be a bookmark you forget about until something breaks, then open to find out what.

## Running it

Open `index.html` in any modern browser. That's it! That's the whole thing! Configuration is stored in `localStorage` for the file's origin. To run it on another machine, copy the file across and use Import to bring over your saved chains.

## Concepts

### Chain

The monitored unit is called a chain, not a host. A chain is an ordered list of probes that walk through layers of indirection. Reaching a media server from outside the network might involve DNS, a public load balancer, a reverse proxy, a VPN, an origin host, and an application endpoint. Each of those is a link in the chain.

When Scry All runs, each chain executes its links in order. On the first failed link, downstream links are marked Skipped and the chain stops. The card on screen shows which specific link broke, not only that something is down. Most dashboards give you one dot per service; when the dot is red you still have to figure out which of six layers between you and the service is the actual cause. Chains collapse that work into one glance.

### Link

A link is one probe. There are four probe types.

`https` does an opaque cross-origin fetch with `mode: "no-cors"`. The only thing this can tell you is that something answered within the timeout. It cannot read status codes or response bodies. Good for liveness checks on endpoints you do not control.

`https-cors` does a regular CORS fetch. Works only on endpoints you control that send `Access-Control-Allow-Origin`. Can assert a specific status code, or assert that a JSON path exists in the response.

`doh` queries Cloudflare DNS-over-HTTPS for an A record. Useful as the first link in any external chain to confirm that a public hostname resolves, and resolves to the expected address.

`ws-tcp` attempts a WebSocket handshake against `host:port`. The closest thing to a TCP port probe the browser allows. See the limits section.

### Classifier (Sigil)

Tags. They appear as small circular sigils on the left edge of the screen, each with a glyph and a tint color. A chain can carry multiple sigils. To bind a sigil to a chain, drag the sigil onto the chain card or drag the chain card onto the sigil. The gesture works in both directions. Clicking a sigil filters the canvas so only chains carrying that sigil stay bright. Click again to clear the filter.

Toggle Group mode in the toolbar and chains cluster on screen by their first sigil. Each group draws a bordered region tinted with the sigil's color. Within a group, cards still drag normally but snap back, since their position is computed from the group layout.

## Probe limits

The dashboard runs entirely in the browser. The browser does not have raw sockets, ICMP, or arbitrary TCP. Several things that work from `nmap` or `netcat` are not possible from a browser.

ICMP ping does not exist as a probe type and cannot. ICMP requires OS-level privileges that JavaScript does not get.

`ws-tcp` is the closest available TCP probe, but it succeeds only when the server replies quickly to a WebSocket upgrade attempt. Services that hold the connection open silently while waiting for a proprietary handshake will time out under `ws-tcp` even when `nc -z` confirms the port is open. Many home appliances, IoT devices, and MQTT brokers behave this way. Inside the browser sandbox there is no workaround.

Opaque `https` tells you something answered. It does not tell you whether what answered is healthy. For "is this returning 200 and not 502," use `https-cors` on an endpoint that you can configure to allow your origin.

## Halt-on-fail

Each chain has a `haltOnFail` setting, on by default. When a link returns `bad`, all subsequent links are marked `skipped` and the chain stops. This is usually what you want during diagnosis. Turn it off per chain if you want every link probed regardless of upstream status.

## Backup and sharing

Open Inscribe. The top right of the modal has Export and Import buttons. Export prints the full configuration as JSON in a copy-friendly textarea. Import accepts pasted JSON.

If you keep the same dashboard on multiple machines (your laptop and another household member's machine, for example), export from one and import on the other to keep them in sync.

## File layout

The deployment artifact is one file: `index.html` at the repo root. It bundles all CSS and all JavaScript inline, no external assets. Open it directly, scp it anywhere, drop it on a USB stick. That property is the point.

The source lives in `src/` as modules and gets bundled into `index.html` by `build.js`. The split:

```
src/
  template.html            HTML scaffold with %STYLES% and %SCRIPT% placeholders
  styles.css               all CSS
  js/
    main.js                entry; wires modules to DOM
    state.js               aggregateChainState, fmtLatency, helpers
    storage.js             config schema, defaults, migration, persist
    probes.js              probeDoh, probeHttp, probeWsTcp
    runner.js              runChain, scanAll
    layout.js              autoGridPosition, computeGroupedLayout (pure math)
    render.js              buildCard, refreshCard, DOM helpers
    drag.js                drag-threshold + drop-target helpers
    theme.js               active theme registry
    themes/grimorium.js    the grimoire look: labels, glyphs, decoration
```

## Development

```
npm install         install esbuild + vitest + jsdom
npm run build       bundle src/ into index.html
npm run dev         same, watching for changes
npm test            run the vitest suite
npm run test:watch  TDD loop
```

Tests live in `test/` mirroring the module layout. The harness is vitest with jsdom for DOM-touching code. Mocks for `fetch` and `WebSocket` live in `test/helpers/mocks.js`; chain/config fixtures in `test/helpers/fixtures.js`.

Tests assert on semantic state values (`ok`, `bad`, `skipped`), not display strings (`HOLDS`, `SEVERED`). Display strings come from the active theme and are expected to change.

Going forward: write a failing test before any feature or bug fix. The existing suite is the baseline.

## Themes

The grimoire look is the only theme that ships, but it is not load-bearing. The theme module (`src/js/theme.js`) registers the active theme, and the grimoire theme (`src/js/themes/grimorium.js`) provides:

- `labels.state`: display strings for the six semantic states
- `statusColorVar(state)`: CSS `var(--…)` token for a state
- `glyphs`: pool of characters used for classifier sigils and background runes
- `createDecoration(canvas, svgRoot)`: stateful instance that owns the canvas embers, the rotating sigil, and the rune scatter

Component code uses the theme through these APIs and never references grimoire-specific names directly. A different theme would be a sibling module exporting the same shape with different values.

