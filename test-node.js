/* Node test for lan-kit's host: start it, connect an SSE client, POST, assert broadcast. */
const http = require("http");
const { createHost } = require(require("path").join(__dirname, "lan-host.js"));

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log("PASS  " + name)) : (fail++, console.log("FAIL  " + name)); }

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
    req.on("error", () => resolve({ status: 0 }));
    req.write(body); req.end();
  });
}

(async function () {
  const host = createHost({ room: "test", history: 10 });
  const port = await host.listen(0);
  ok("host listens on a port", typeof port === "number" && port > 0);

  let seen = "";
  get(`http://127.0.0.1:${port}/events`, (buf) => { seen = buf; });

  await new Promise(r => setTimeout(r, 100));
  ok("client count is 1 after SSE connect", host.clients() === 1);

  const r = await post(`http://127.0.0.1:${port}/send`, { from: "a", text: "hello room" });
  ok("POST /send returns ok", r.status === 200 && JSON.parse(r.body).ok === true);

  await new Promise(r => setTimeout(r, 100));
  ok("SSE client received the broadcast", seen.indexOf("hello room") !== -1 && seen.indexOf("event: message") !== -1);
  ok("SSE client received the hello event", seen.indexOf("event: hello") !== -1);

  let observed = null;
  host.onMessage(m => observed = m);
  await post(`http://127.0.0.1:${port}/send`, { from: "b", text: "second" });
  await new Promise(r => setTimeout(r, 50));
  ok("onMessage observer fired", observed && observed.text === "second");

  const h = await new Promise(res => http.get(`http://127.0.0.1:${port}/health`, (x) => { let b = ""; x.on("data", c => b += c); x.on("end", () => res(JSON.parse(b))); }));
  ok("health reports the room and client count", h.ok === true && h.room === "test" && h.clients >= 1);

  await host.close();
  ok("host closes cleanly", true);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
