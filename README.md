# lan-kit

[![live](https://img.shields.io/badge/live-online-22c55e)](https://drsamonline.github.io/lan-kit/)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

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

## Licence

MIT. (c) 2026 Dr Sohil Momin. Part of the Forge system — kits open, orchestrator licensed.
