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
const host = createHost({ room: "canteen", app: "canteen", pin: "4821", history: 50 });
const port = await host.listen(0);          // 0 = any free port
host.onMessage((m, board) => console.log("got", m, "on", board));
host.broadcast({ hello: "room" });          // everyone
host.broadcast({ line: "x" }, "board-2");   // one board
host.snapshot("board-2", { doc: [] });      // catch a joiner up
```

**Client (browser):**

```js
const c = Lan.client({ url: Lan.hostUrl(8080),
                       board: "main",            // optional: which board to join
                       pin: "4821",              // optional: the room's PIN
                       onOpen:     h => console.log("joined", h.room),
                       onSnapshot: s => console.log("caught up", s.doc),
                       onMessage:  m => console.log("got", m) });
c.send({ from: "me", text: "hello room" });
c.send("a bare string is a message too");
```

`Lan.roomCode()` makes a short code (no 0/O/1/I/L); `Lan.hostUrl(port)` builds the
URL for the current LAN (and still works from `file://`, where there is no hostname);
`Lan.health(url)` asks a host who it is; `Lan.scan()` looks for rooms on the subnet.

### Boards

A client that names a board hears **that board plus the room-wide messages**. A
client that names none hears everything — which is what every app already got, so
nothing that worked before changes behaviour. `board` is routing, not content: it
is stripped from the message before broadcast.

### The PIN

Set `pin` on the host and every `POST /send` must carry it or it is refused with
`403 {"ok":false,"error":"pin"}`. The client sends it automatically when given one.

**The PIN never reaches the room.** It rides on every POST, so the host deletes it
from the message before broadcasting — otherwise the secret is published to exactly
the people it was meant to keep out. `/health` reports `pin: true` or `false`, never
the value.

## Verified

```
node test-node.js
42 passed, 0 failed
```

Covers the transport (listen, SSE connect, client count, POST broadcast, the hello
event, the observer callback, the health endpoint, a clean close), boards (a message
reaches its own board, not another, and reaches a client that named none), snapshots,
the PIN (refused without it, refused with the wrong one, accepted with the right one,
**and never broadcast**), and the client against a stubbed browser (a bare string
becomes a text message, an object is sent as it is, the pin rides on every POST,
`hostUrl` survives `file://`). `Lan.health` and `Lan.scan` are tested against real
sockets, including a dead host, which must resolve to `null` rather than throw.

The suite is mutation-tested: removing `delete msg.pin` turns 1 red, ignoring the
board filter turns 1 red, and removing the pin check turns 4 red.

## What it is not

Not a security boundary. The PIN keeps a stranger on the same Wi-Fi out of a room;
it is not authentication, it is not encrypted, and it travels in clear text on the
POST that carries it (which is why it is stripped before the broadcast, and why the
host never echoes it). Anyone who can watch the network can read it. Do not send
secrets over a LAN room.

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

PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin. Part of the Forge system — kits open, orchestrator licensed.
