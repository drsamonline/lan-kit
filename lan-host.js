/* lan-host.js — the tiny LAN host for drsamonline apps. Zero dependencies.
 *
 * A local HTTP server that gives a room a real-time channel with no framework
 * and no WebSocket library: server -> clients over Server-Sent Events, and
 * clients -> server over plain POST. Works on a LAN with no internet.
 *
 *   const host = require("./lan-host.js").createHost({
 *     room: "canteen",
 *     app:  "canteen",       // what /health calls itself
 *     pin:  "4821",          // optional: every POST must carry it
 *   });
 *   const port = await host.listen(0);            // 0 = any free port
 *   host.onMessage(m => console.log("got", m));   // observe
 *   host.broadcast({ hello: "room" });            // push to everyone
 *   host.broadcast({ line: "x" }, "board-2");     // push to one board
 *   host.snapshot("board-2", { doc: [] });        // catch a joiner up
 *
 * 1.1.0 — HARVESTED from two app forks (canteen-lan and chalk-lan), which is the
 * only direction a kit moves (PROMPTS/retrofit.md). A client may now name a
 * BOARD, a host may require a PIN, and /health says which app it is.
 *
 * THE PIN NEVER REACHES THE ROOM. It rides on every POST, so it is deleted from
 * the message before it is broadcast — otherwise the secret is published to
 * everyone it was meant to keep out, which is how a "PIN" turns into decoration.
 *
 * PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
 */
"use strict";
const http = require("http");

function createHost(opts) {
  opts = opts || {};
  const room = opts.room || "default";
  const app = opts.app || "";
  const pin = opts.pin ? String(opts.pin) : "";
  const clients = new Map();          // res -> board ("" = every board)
  const handlers = [];
  const history = [];                 // last N messages, for late joiners
  const HISTORY_MAX = opts.history === undefined ? 50 : opts.history;

  function write(res, event, data) {
    return "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
  }

  /* A client on board "x" hears board "x" and the room-wide messages; a client
     that named no board hears everything, which is what every existing app
     already gets, so nothing that worked before changes behaviour. */
  function forBoard(board) {
    const out = [];
    for (const [res, b] of clients) {
      if (!board || !b || b === board) out.push(res);
    }
    return out;
  }

  function remember(msg, board) {
    if (!HISTORY_MAX) return;
    history.push(board ? { board: board, msg: msg } : { msg: msg });
    if (history.length > HISTORY_MAX) history.shift();
  }

  function broadcast(msg, board) {
    const b = board == null ? "" : String(board);
    remember(msg, b);
    const payload = write(null, "message", msg);
    for (const res of forBoard(b)) {
      try { res.write(payload); } catch (e) { clients.delete(res); }
    }
    handlers.forEach(function (h) { try { h(msg, b); } catch (e) {} });
    return forBoard(b).length;
  }

  /* A joiner needs the current state, not the tail of a message stream. */
  function snapshot(board, doc) {
    const b = board == null ? "" : String(board);
    const payload = write(null, "snapshot", { board: b, doc: doc });
    for (const res of forBoard(b)) {
      try { res.write(payload); } catch (e) { clients.delete(res); }
    }
    return forBoard(b).length;
  }

  const server = http.createServer(function (req, res) {
    const url = new URL(req.url, "http://localhost");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type, x-room-pin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (url.pathname === "/events") {
      const board = url.searchParams.get("board") || "";
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write("retry: 2000\n\n");
      res.write(write(null, "hello", { room: room, app: app, board: board, pin: !!pin, clients: clients.size + 1 }));
      if (opts.replay) {
        history.forEach(function (h) {
          if (!h.board || !board || h.board === board) res.write(write(null, "message", h.msg));
        });
      }
      clients.set(res, board);
      const ping = setInterval(function () { try { res.write(": ping\n\n"); } catch (e) {} }, 15000);
      req.on("close", function () { clearInterval(ping); clients.delete(res); });
      return;
    }

    if (url.pathname === "/send" && req.method === "POST") {
      let body = "";
      req.on("data", function (c) { body += c; if (body.length > 1e6) req.destroy(); });
      req.on("end", function () {
        let msg;
        try { msg = JSON.parse(body); } catch (e) { msg = null; }
        if (!msg || typeof msg !== "object") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "bad json" }));
          return;
        }
        if (pin && String(msg.pin == null ? "" : msg.pin) !== pin) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "pin" }));
          return;
        }
        const board = msg.board == null ? "" : String(msg.board);
        delete msg.pin;                        /* the room never sees the secret */
        delete msg.board;                      /* and the routing field is not content */
        broadcast(msg, board);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, clients: clients.size }));
      });
      return;
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, room: room, app: app, pin: !!pin, clients: clients.size }));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  return {
    room: room,
    app: app,
    listen: function (port) {
      return new Promise(function (resolve) {
        server.listen(port || 0, function () { resolve(server.address().port); });
      });
    },
    broadcast: broadcast,
    snapshot: snapshot,
    onMessage: function (h) { handlers.push(h); },
    clients: function () { return clients.size; },
    close: function () {
      for (const res of Array.from(clients.keys())) { try { res.end(); } catch (e) {} }
      return new Promise(function (resolve) { server.close(function () { resolve(); }); });
    },
  };
}

module.exports = { createHost: createHost };
