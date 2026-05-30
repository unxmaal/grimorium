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

There is one file. It is `index.html`. Background canvas, decorative SVG, all CSS, all JavaScript, all state management, all UI. No build step, no dependencies, no `package.json`.

