/* Reconnect, don't replay.
 *
 *   node test-resume.js
 *
 * EventSource reconnects on its own (the host sends `retry: 2000`) and sends
 * Last-Event-ID. The host had no ids at all, so every reconnect replayed the
 * whole history and the app showed the last 50 messages a second time.
 */
const http = require("http");
const path = require("path");
const { createHost } = require(path.join(__dirname, "lan-host.js"));

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("PASS  " + n)) : (fail++, console.log("FAIL  " + n + (d ? "  (" + d + ")" : ""))); };

const listen = (port, headers) => new Promise((resolve) => {
  let buf = "";
  const req = http.get({ host: "127.0.0.1", port, path: "/events", headers: headers || {} },
    (res) => { res.setEncoding("utf8"); res.on("data", (c) => { buf += c; }); });
  setTimeout(() => { req.destroy(); resolve(buf); }, 120);
});
const post = (port, obj) => new Promise((resolve) => {
  const q = http.request({ host: "127.0.0.1", port, path: "/send", method: "POST",
    headers: { "content-type": "application/json" } }, (res) => { res.resume(); res.on("end", resolve); });
  q.on("error", resolve);
  q.end(JSON.stringify(obj));
});

(async () => {
  const host = createHost({ room: "resume", replay: true });
  const port = await host.listen(0);

  const first = await new Promise(async (resolve) => {
    let buf = "";
    const req = http.get({ host: "127.0.0.1", port, path: "/events" },
      (res) => { res.setEncoding("utf8"); res.on("data", (c) => { buf += c; }); });
    setTimeout(async () => { await post(port, { n: 1 }); await post(port, { n: 2 }); }, 40);
    setTimeout(() => { req.destroy(); resolve(buf); }, 160);
  });
  const ids = (first.match(/^id: (\d+)$/gm) || []).map((x) => x.slice(4));
  ok("every broadcast carries an id", ids.length >= 2, ids.join(","));

  const fresh = await listen(port);
  ok("a new client still gets the history", /"n":1/.test(fresh) && /"n":2/.test(fresh));

  if (ids.length) {
    const resumed = await listen(port, { "Last-Event-ID": ids[ids.length - 1] });
    ok("a reconnect after Last-Event-ID replays nothing it has seen", !/"n":\d/.test(resumed), resumed.replace(/\n/g, "|").slice(0, 60));
  } else {
    ok("a reconnect after Last-Event-ID replays nothing it has seen", false, "no ids to resume from");
  }

  await host.close();
  console.log("\n" + (fail === 0 ? "resume: OK" : fail + " failed"));
  process.exit(fail === 0 ? 0 : 1);
})();
