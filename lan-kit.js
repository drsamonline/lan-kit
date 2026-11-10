/* lan-kit.js — the browser client for a drsamonline LAN room. Zero dependencies.
 *
 * Talks to a lan-host over Server-Sent Events (server -> client) and POST
 * (client -> server). Works on a LAN with no internet and no accounts.
 *
 *   const c = Lan.client({ url: Lan.hostUrl(8080),
 *                          board: "main",          // optional: which board to join
 *                          pin: "4821",            // optional: the room's PIN
 *                          onOpen:     h => console.log("joined", h.room),
 *                          onSnapshot: s => console.log("caught up", s.doc),
 *                          onMessage:  m => console.log("got", m) });
 *   c.send({ from: "me", text: "hello room" });
 *   c.send("a bare string is a message too");
 *
 *   Lan.health("http://192.168.1.20:8080").then(h => console.log(h.room, h.app));
 *   Lan.scan().then(list => console.log(list));   // find the rooms on this Wi-Fi
 *
 * 1.1.0 — HARVESTED from two app forks, which is the only direction a kit moves
 * (PROMPTS/retrofit.md): canteen-lan's `pin` + bare-string message, and
 * chalk-lan's `board`/`onSnapshot`, `health`, `scan` and the file:// hostUrl.
 * The kit is now a superset of both, and neither app was touched.
 *
 * PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
 */
(function (root) {
  "use strict";
  var Lan = { version: "1.1.0" };

  function base(url) { return String(url || "").replace(/\/+$/, ""); }
  function safeParse(s) { try { return JSON.parse(s); } catch (e) { return s; } }
  function here() {
    /* file:// has no hostname, and a worker has no location at all. */
    try { return (typeof location !== "undefined" && location.hostname) || "localhost"; }
    catch (e) { return "localhost"; }
  }

  Lan.client = function (opts) {
    opts = opts || {};
    var url = base(opts.url || "");
    var board = opts.board == null ? "" : String(opts.board);
    var pin = opts.pin == null ? "" : String(opts.pin);

    var es = new EventSource(url + "/events" + (board ? "?board=" + encodeURIComponent(board) : ""));
    es.addEventListener("hello", function (e) { if (opts.onOpen) opts.onOpen(safeParse(e.data)); });
    es.addEventListener("snapshot", function (e) { if (opts.onSnapshot) opts.onSnapshot(safeParse(e.data)); });
    es.addEventListener("message", function (e) { if (opts.onMessage) opts.onMessage(safeParse(e.data)); });
    es.onerror = function (e) { if (opts.onError) opts.onError(e); };

    return {
      url: url,
      board: board,
      send: function (msg) {
        /* A bare string is a message, not a mistake: wrapping it here means the
           caller does not have to know the envelope. */
        var body = msg && typeof msg === "object" ? Object.assign({}, msg) : { t: "text", text: msg == null ? "" : String(msg) };
        if (pin) body.pin = pin;
        return fetch(url + "/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }).then(function (r) { return r.json(); });
      },
      close: function () { try { es.close(); } catch (e) {} }
    };
  };

  /* A short, unambiguous room code (no 0/O/1/I/L). */
  Lan.roomCode = function (n) {
    n = n || 4;
    var A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", s = "";
    for (var i = 0; i < n; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  };

  /* The host URL for this device on the current LAN. */
  Lan.hostUrl = function (port) {
    return "http://" + here() + ":" + (port || 8080);
  };

  /* Ask a host who it is. Resolves to null for anything that is not a live
     drsamonline host — a refused connection, a 404, a timeout, or a reply
     without ok:true. `app` is whatever the host called itself; this does not
     check for one particular app, because every app on the LAN answers the same
     way and a scan should find all of them. */
  Lan.health = function (url, timeoutMs) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 1200);
    var opts = ctrl ? { signal: ctrl.signal } : {};
    return fetch(base(url) + "/health", opts)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        clearTimeout(timer);
        return j && j.ok ? j : null;
      })
      .catch(function () { clearTimeout(timer); return null; });
  };

  /* Look for hosts on this device's own subnet — no internet, no DNS, nothing
     outside the room's Wi-Fi. Tries the /24 around the current address a few at
     a time and reports every host that answers.
     `prefix` is normally derived from the address this page was served from; it
     is an option so a caller (and a test) can name the subnet explicitly. */
  Lan.scan = function (opts) {
    opts = opts || {};
    var port = opts.port || 8080;
    var prefix = opts.prefix;
    var self = null;
    if (!prefix) {
      var m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(here());
      if (!m) return Promise.resolve([]);          /* not an address: nothing to scan */
      prefix = m[1] + "." + m[2] + "." + m[3] + ".";
      self = m[4];
    } else if (!/\.$/.test(prefix)) {
      prefix += ".";
    }
    var from = opts.from || 1, to = opts.to || 254;
    var batch = opts.batch || 24;
    var timeout = opts.timeout || 700;
    var found = [];
    var queue = [];
    for (var i = from; i <= to; i++) {
      if (self !== null && String(i) === self) continue;   /* that is us */
      queue.push(prefix + i);
    }

    function worker() {
      if (!queue.length) return Promise.resolve();
      var addr = queue.shift();
      var host = "http://" + addr + ":" + port;
      return Lan.health(host, timeout).then(function (h) {
        if (h) found.push(Object.assign({ url: host, address: addr }, h));
        return worker();
      });
    }

    var workers = [];
    for (var w = 0; w < Math.min(batch, queue.length); w++) workers.push(worker());
    return Promise.all(workers).then(function () {
      found.sort(function (a, b) { return a.address < b.address ? -1 : 1; });
      return found;
    });
  };

  root.Lan = Lan;
})(typeof globalThis !== "undefined" ? globalThis : this);
