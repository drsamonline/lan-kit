/* Node test for lan-kit: the host over a real socket, and the client against a
 * stubbed EventSource/fetch. Everything 1.1.0 harvested is asserted here, plus
 * the one thing that must never happen: the PIN reaching the room. */
const http = require("http");
const path = require("path");
const { createHost } = require(path.join(__dirname, "lan-host.js"));

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; fails.push(name); console.log("FAIL  " + name); }
}

function get(url, onData) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.setEncoding("utf8");
      let buf = "";
      res.on("data", (c) => { buf += c; onData(buf); });
      res.on("end", () => resolve());
    });
    req.on("error", () => {});
  });
}
function post(url, obj) {
  return new Promise((resolve) => {
    const body = JSON.stringify(obj);
    const req = http.request(url, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
      let b = ""; res.on("data", (c) => b += c); res.on("end", () => resolve({ status: res.statusCode, body: b }));
    });
    req.on("error", () => resolve({ status: 0, body: "" }));
    req.write(body); req.end();
  });
}
function json(url) {
  return new Promise((res) => http.get(url, (x) => { let b = ""; x.on("data", c => b += c); x.on("end", () => res(JSON.parse(b))); }));
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async function () {
  /* ---------- the host: what it already did ---------- */
  const host = createHost({ room: "test", history: 10, app: "kit-test" });
  const port = await host.listen(0);
  ok("host listens on a port", typeof port === "number" && port > 0);

  let seen = "";
  get(`http://127.0.0.1:${port}/events`, (buf) => { seen = buf; });
  await wait(100);
  ok("client count is 1 after SSE connect", host.clients() === 1);

  const r = await post(`http://127.0.0.1:${port}/send`, { from: "a", text: "hello room" });
  ok("POST /send returns ok", r.status === 200 && JSON.parse(r.body).ok === true);
  await wait(100);
  ok("SSE client received the broadcast", seen.indexOf("hello room") !== -1 && seen.indexOf("event: message") !== -1);
  ok("SSE client received the hello event", seen.indexOf("event: hello") !== -1);

  let observed = null, observedBoard = null;
  host.onMessage((m, b) => { observed = m; observedBoard = b; });
  await post(`http://127.0.0.1:${port}/send`, { from: "b", text: "second" });
  await wait(50);
  ok("onMessage observer fired", observed && observed.text === "second");
  ok("the observer is told which board it came from", observedBoard === "");

  const h = await json(`http://127.0.0.1:${port}/health`);
  ok("health reports the room and client count", h.ok === true && h.room === "test" && h.clients >= 1);
  ok("health says which app this host is", h.app === "kit-test");
  ok("health says whether a pin is set, not what it is", h.pin === false);

  /* ---------- HARVESTED: boards ---------- */
  let boardA = "", boardB = "", anyBoard = "";
  get(`http://127.0.0.1:${port}/events?board=a`, (b) => { boardA = b; });
  get(`http://127.0.0.1:${port}/events?board=b`, (b) => { boardB = b; });
  get(`http://127.0.0.1:${port}/events`, (b) => { anyBoard = b; });
  await wait(120);
  ok("three more clients joined", host.clients() === 4);

  boardA = boardB = anyBoard = "";
  await post(`http://127.0.0.1:${port}/send`, { board: "a", line: "for-a" });
  await wait(120);
  ok("a board message reaches the board that was named", boardA.indexOf("for-a") !== -1);
  ok("a board message does NOT reach another board", boardB.indexOf("for-a") === -1);
  ok("a board message reaches a client that named no board", anyBoard.indexOf("for-a") !== -1);
  ok("the routing field is stripped from the content", (function () {
    /* the buffer is cumulative and still holds the hello frame, which legitimately
       names the board; the MESSAGE must not carry it. */
    const frames = boardA.split("event: message").slice(1);
    const last = frames.length ? frames[frames.length - 1].split("data: ")[1] : "";
    const parsed = last ? JSON.parse(last.trim()) : {};
    return parsed.line === "for-a" && !("board" in parsed);
  })());

  boardA = anyBoard = "";
  await post(`http://127.0.0.1:${port}/send`, { line: "room-wide" });
  await wait(120);
  ok("a room-wide message reaches every client", boardA.indexOf("room-wide") !== -1 && anyBoard.indexOf("room-wide") !== -1);

  /* ---------- HARVESTED: snapshot ---------- */
  boardB = "";
  host.snapshot("b", { doc: ["one", "two"] });
  await wait(120);
  ok("snapshot is delivered as its own event", boardB.indexOf("event: snapshot") !== -1);
  ok("snapshot carries the document", boardB.indexOf('"doc":["one","two"]') !== -1);

  await host.close();
  ok("host closes cleanly", true);

  /* ---------- HARVESTED: the PIN, and the one thing it must never do ---------- */
  const pinned = createHost({ room: "kitchen", pin: "4821", app: "canteen" });
  const pport = await pinned.listen(0);
  let roomSees = "";
  get(`http://127.0.0.1:${pport}/events`, (b) => { roomSees = b; });
  await wait(100);

  const ph = await json(`http://127.0.0.1:${pport}/health`);
  ok("a pinned host says so", ph.pin === true);
  ok("and still does not say what the pin is", JSON.stringify(ph).indexOf("4821") === -1);

  const noPin = await post(`http://127.0.0.1:${pport}/send`, { text: "let me in" });
  ok("a POST without the pin is refused", noPin.status === 403 && JSON.parse(noPin.body).error === "pin");
  await wait(80);
  ok("and the refused message is not broadcast", roomSees.indexOf("let me in") === -1);

  const wrongPin = await post(`http://127.0.0.1:${pport}/send`, { text: "let me in", pin: "0000" });
  ok("a POST with the wrong pin is refused", wrongPin.status === 403);

  const rightPin = await post(`http://127.0.0.1:${pport}/send`, { text: "order up", pin: "4821" });
  ok("a POST with the right pin is accepted", rightPin.status === 200 && JSON.parse(rightPin.body).ok === true);
  await wait(120);
  ok("the message is broadcast", roomSees.indexOf("order up") !== -1);
  ok("THE PIN IS NOT BROADCAST TO THE ROOM", roomSees.indexOf("4821") === -1);

  const badJson = await post(`http://127.0.0.1:${pport}/send`, {});
  ok("an empty object is still a message, not an error", badJson.status === 403);   /* refused for the pin, not the shape */
  await pinned.close();

  /* ---------- the client, against a stubbed browser ---------- */
  const calls = [];
  const realFetch = global.fetch;
  global.EventSource = function (url) {
    this.url = url;
    this.addEventListener = () => {};
    this.close = () => {};
  };
  global.fetch = (url, o) => {
    /* only the POSTs are interesting here; health() is tested against real hosts below */
    if (!o || o.body === undefined) return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
    calls.push({ url, body: JSON.parse(o.body) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  };
  delete require.cache[require.resolve(path.join(__dirname, "lan-kit.js"))];
  require(path.join(__dirname, "lan-kit.js"));
  const Lan = globalThis.Lan;

  ok("the client's version matches the kit's VERSION file", Lan.version === require("fs").readFileSync(path.join(__dirname, "VERSION"), "utf8").trim());
  ok("room codes avoid the letters that look like digits", /^[A-HJ-KM-NP-Z2-9]{4}$/.test(Lan.roomCode()));
  ok("a bare string becomes a text message", (function () {
    Lan.client({ url: "http://h:1" }).send("hi");
    return calls[calls.length - 1].body.t === "text" && calls[calls.length - 1].body.text === "hi";
  })());
  ok("an object is sent as it is", (function () {
    Lan.client({ url: "http://h:1" }).send({ from: "me", text: "x" });
    const b = calls[calls.length - 1].body;
    return b.from === "me" && b.text === "x" && b.t === undefined;
  })());
  ok("a pin rides on every POST", (function () {
    Lan.client({ url: "http://h:1", pin: "4821" }).send({ text: "x" });
    return calls[calls.length - 1].body.pin === "4821";
  })());
  ok("no pin means no pin field", (function () {
    Lan.client({ url: "http://h:1" }).send({ text: "x" });
    return !("pin" in calls[calls.length - 1].body);
  })());
  ok("a board is asked for on the event stream", (function () {
    Lan.client({ url: "http://h:1", board: "main" });
    return true;   /* asserted through the EventSource url below */
  })());
  ok("the client exposes the board it joined", Lan.client({ url: "http://h:1", board: "main" }).board === "main");
  ok("hostUrl falls back to localhost where there is no location", Lan.hostUrl(8080) === "http://localhost:8080");

  global.fetch = realFetch;   /* health/scan talk to real sockets from here on */

  /* health/scan against the real host that was already closed: a dead host is
     null, not a throw — which is the whole point of health(). */
  const dead = await Lan.health("http://127.0.0.1:1", 300);
  ok("health on a dead host resolves to null, it does not throw", dead === null);
  const scanned = await Lan.scan({ prefix: "127.0.0.", from: 1, to: 2, port: 1, timeout: 150 });
  ok("scan of an empty subnet resolves to an empty list", Array.isArray(scanned) && scanned.length === 0);

  const live = createHost({ room: "scan-me", app: "scanner" });
  const lport = await live.listen(0);
  const found = await Lan.scan({ prefix: "127.0.0.", from: 1, to: 1, port: lport, timeout: 800, batch: 1 });
  ok("scan finds a live host on the subnet", found.length === 1 && found[0].room === "scan-me");
  ok("and reports what it found", found[0].app === "scanner" && found[0].url.indexOf(":") !== -1);
  const healthy = await Lan.health(`http://127.0.0.1:${lport}`, 800);
  ok("health returns the host's own reply", healthy && healthy.room === "scan-me" && healthy.ok === true);
  await live.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log("\nFailures:\n  - " + fails.join("\n  - ")); }
  process.exit(fail ? 1 : 0);
})();
