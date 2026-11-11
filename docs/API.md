# lan-kit — API reference

**Version 1.1.0.** **The shared LAN core for drsamonline apps.** Zero dependencies. A local room with a real-time channel, for apps that run on a Wi-Fi network with **no internet**.

Generated from the source in this repository: every name, argument and
note below is read out of the kit file, so it cannot describe a function
that is not there.

```js
<script src="lan-kit.js"></script>
Kit.client(...)
// or: const Kit = require('./lan-kit.js')
```

## The surface (5 entries)

| Name | Arguments | What it does |
|---|---|---|
| `Kit.client` | `(opts)` | — |
| `Kit.roomCode` | `(n)` | A short, unambiguous room code (no 0/O/1/I/L). |
| `Kit.hostUrl` | `(port)` | The host URL for this device on the current LAN. |
| `Kit.health` | `(url, timeoutMs)` | — |
| `Kit.scan` | `(opts)` | — |

## Notes

- Zero dependencies, one file, no build step: it works from `file://`, from a
  `<script>` tag and from Node.
- The version above is the `VERSION` file in this repository; a pinned copy is
  what an app vendors.
