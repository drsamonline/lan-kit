# lan-kit

[![live](https://img.shields.io/badge/live-online-22c55e)](https://drsamonline.github.io/lan-kit/)
[![test](https://github.com/drsamonline/lan-kit/actions/workflows/test.yml/badge.svg)](https://github.com/drsamonline/lan-kit/actions/workflows/test.yml)
[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue)](LICENSE)

**The shared LAN core for drsamonline apps.** Zero dependencies. A local room with
a real-time channel, for apps that run on a Wi-Fi network with **no internet**.

The transport behind the LAN apps (`Chalk`, `Canteen`, `Blackboard`, `Rally`) —
extracted from `HMS` so it isn't re-implemented per app.

## Why SSE + POST (not WebSocket)

A WebSocket needs a framing library. Server-Sent Events and plain POST are built
into every browser and Node, so a room needs **no dependencies at all**:

- **server → clients:** `GET /events` (SSE)
- **clients → server:** `POST /send`
- **health:** `GET /health`

## Use it

**Host (Node, zero deps):**

```js
const { createHost } = require("./lan-host.js");
const host = createHost({ room: "canteen", history: 50 });
const port = await host.listen(0);          // 0 = any free port
host.onMessage(m => console.log("got", m));
host.broadcast({ hello: "room" });
```

**Client (browser):**

```js
const c = Lan.client({ url: Lan.hostUrl(8080),
                       onOpen:    h => console.log("joined", h.room),
                       onMessage: m => console.log("got", m) });
c.send({ from: "me", text: "hello room" });
```

`Lan.roomCode()` makes a short code (no 0/O/1/I/L); `Lan.hostUrl(port)` builds the
URL for the current LAN.

## Verified

```
node test-node.js
8 passed, 0 failed
```

Covers: listen, SSE connect, client count, POST broadcast, the hello event, the
observer callback, the health endpoint, and a clean close.

## What it is not

Not a security boundary. A LAN room is open to anyone on the network — add a room
code check in your app if you need one, and never send secrets over it.

## Support

<img src="docs/assets/support-portrait.jpg" width="72" height="72" alt="Dr. Sohil Momin" align="left" style="border-radius:50%;margin-right:1rem">

Free, offline, accountless — and staying that way. If it earned its keep:

| | |
|---|---|
| UPI (India) | `drsohilboi@ybl` — payee Dr. Sohil Momin, open amount, or scan [the QR](docs/assets/upi-qr.svg) |
| Ko-fi | [ko-fi.com/matneo](https://ko-fi.com/matneo) |
| PayPal | [paypal.me/drsohilmomin](https://paypal.me/drsohilmomin?locale.x=en_GB&country.x=IN) |
| My books | [Amazon author store](https://www.amazon.com/stores/author/B08ZT331LY/allbooks?ccs_id=aed72b9f-71d9-41dc-adee-e9368a317acc) |
| More apps | [drsamonline.github.io](https://drsamonline.github.io/) |
| Email | [sohilmomin2000@gmail.com](mailto:sohilmomin2000@gmail.com) |

Nothing is gated behind it: no accounts, no tracking, no network requests.

## Licence

MIT. (c) 2026 Dr Sohil Momin. Part of the Forge system — kits open, orchestrator licensed.
