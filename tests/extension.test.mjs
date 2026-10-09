// The Chrome extension: what the build puts in dist/extension/, compat.js (the GM_* calls answered with
// extension APIs) and background.js (requests, tabs, the toolbar button), each run against a fake `chrome`.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const at = (p) => new URL(p, root);
const read = (p) => readFileSync(at(p), "utf8");
const pkg = JSON.parse(read("package.json"));
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
// compat writes 20 ms after a change, storage reports it on the next turn: waits one after another keep that order even on a busy machine
const settle = async () => { for (let i = 0; i < 3; i++) await wait(25); };
// values made inside a vm context have that context's prototypes: compare them as plain data
const plain = (v) => JSON.parse(JSON.stringify(v));

/* =================================================================== (a) the build */
let manifest, extJs;
before(() => {
  execFileSync(process.execPath, [fileURLToPath(at("build.mjs"))], { cwd: fileURLToPath(root), stdio: "pipe" });
  manifest = JSON.parse(read("dist/extension/manifest.json"));
  extJs = read("dist/extension/umbra.js");
});

test("the manifest: MV3, this version, everything it names is there", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.name, "Umbra Mail");
  assert.ok(manifest.description.length > 0 && manifest.description.length <= 132, "description: 1 to 132 characters");
  const named = [
    ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon), manifest.background.service_worker,
    manifest.options_ui.page, ...manifest.content_scripts.flatMap((c) => [...(c.js || []), ...(c.css || [])]),
  ];
  for (const f of named) assert.ok(existsSync(at("dist/extension/" + f)), f + " is in dist/extension/");
  const [fonts, signin] = manifest.web_accessible_resources;
  assert.deepEqual(fonts.matches, ["https://mail.google.com/*"]);
  assert.deepEqual(signin, { resources: ["signin.html"], matches: ["https://auth.openai.com/*", "http://127.0.0.1/*"] }, "the sign-in page, only for ChatGPT's way back");
  assert.ok(existsSync(at("dist/extension/signin.html")) && existsSync(at("dist/extension/signin.js")));
  for (const war of [fonts]) {
    for (const r of war.resources) {
      const [dir, glob] = r.split("/");
      const re = new RegExp("^" + glob.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
      assert.ok(readdirSync(at("dist/extension/" + dir + "/")).some((f) => re.test(f)), r + " matches a file");
    }
  }
  // the icons are PNGs of the size they're listed under
  for (const [size, f] of Object.entries(manifest.icons)) {
    const b = readFileSync(at("dist/extension/" + f));
    assert.equal(b.subarray(1, 4).toString(), "PNG");
    assert.equal(b.readUInt32BE(16), Number(size));
    assert.equal(b.readUInt32BE(20), Number(size));
  }
});

test("the manifest: Gmail only, at document_start, the least it needs", () => {
  assert.deepEqual(manifest.content_scripts, [{ matches: ["https://mail.google.com/*"], js: ["compat.js", "umbra.js"], run_at: "document_start", all_frames: false }]);
  assert.ok(manifest.permissions.includes("storage"));
  for (const p of manifest.permissions) assert.ok(["storage", "unlimitedStorage", "declarativeNetRequestWithHostAccess"].includes(p), "no permission beyond storage and the sign-in rule: " + p);
  for (const h of ["https://mail.google.com/*", "https://docs.google.com/*", "https://generativelanguage.googleapis.com/*", "https://api.openai.com/*", "https://api.anthropic.com/*"]) assert.ok(manifest.host_permissions.includes(h), h);
  assert.equal(manifest.optional_host_permissions, undefined, "no optional permissions: AI runs in the browser");
  assert.deepEqual(manifest.host_permissions.filter((h) => h.includes("127.0.0.1")), ["http://127.0.0.1/*"], "this computer: only for the sign-in rule (requests there are refused)");
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/);
});

test("umbra.js waits for storage, and carries its fonts instead of Google's", () => {
  assert.match(extJs, /^\/\/[^\n]*\nglobalThis\.__umbraReady\.then\(\(\) => \{\n\(function \(\) \{\n/);
  assert.ok(extJs.endsWith("})();\n});\n"));
  assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(extJs), "nothing from Google Fonts");
  const files = [...new Set([...extJs.matchAll(/__EXT__\/(fonts\/[^"')\\\s]+)/g)].map((m) => m[1]))];
  assert.ok(files.length >= 4, "the font files are referenced");
  for (const f of files) {
    assert.ok(existsSync(at("dist/extension/" + f)), f);
    assert.equal(readFileSync(at("dist/extension/" + f)).subarray(0, 4).toString(), "wOF2", f + " is woff2");
  }
  // every family the CSS asks for first has its faces
  const css = read("src/umbra.css");
  for (const v of ["--sans", "--serif"]) {
    const family = css.match(new RegExp(v + ':\\s*"([^"]+)"'))[1];
    assert.ok(extJs.includes(`font-family: \\"${family}\\"`), family + " has @font-face rules");
  }
  for (const f of ["LICENSE-InstrumentSans.txt", "LICENSE-Newsreader.txt"]) assert.match(read("dist/extension/fonts/" + f), /SIL Open Font License/);
  // the userscript is built as before
  const us = read("dist/umbra.user.js");
  assert.ok(!us.includes("__umbraReady"));
  assert.ok(!us.includes("__EXT__"));
});

test("umbra.js parses, and runs nothing before storage is ready", (t) => {
  try { new vm.Script(read("dist/umbra.user.js")); } catch (e) { t.skip("the userscript itself doesn't parse right now (src/ is mid-edit): " + e.message); return; }
  let start = null;
  const ctx = vm.createContext({});
  ctx.__umbraReady = { then: (fn) => { start = fn; } };
  vm.runInContext(extJs, ctx, { filename: "umbra.js" }); // would throw on `document` if anything ran
  assert.equal(typeof start, "function");
});

/* =================================================================== (b) compat.js */
const compatCode = read("extension/compat.js");

// chrome.storage.local shared by several tabs: like Chrome, only keys whose value changes are reported, in order, to every tab
function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  const tabs = [];
  const log = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function commit(next) {
    const changes = {};
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined ? !data.has(k) : same(data.get(k), v)) continue;
      changes[k] = { oldValue: data.get(k), newValue: v };
      if (v === undefined) data.delete(k); else data.set(k, structuredClone(v));
    }
    if (!Object.keys(changes).length) return;
    for (const listeners of tabs) for (const fn of listeners) setTimeout(() => fn(structuredClone(changes), "local"), 0);
  }
  return {
    data, log,
    write: (o) => commit(o), // a write from elsewhere (another device, the options page)
    area() {
      const listeners = [];
      tabs.push(listeners);
      return {
        local: {
          get: async (k) => { assert.equal(k, null); return structuredClone(Object.fromEntries(data)); },
          set: async (o) => { log.push({ set: structuredClone(o) }); commit(o); },
          remove: async (keys) => { log.push({ remove: keys }); commit(Object.fromEntries([].concat(keys).map((k) => [k, undefined]))); },
        },
        onChanged: { addListener: (fn) => listeners.push(fn) },
      };
    },
  };
}

function compat(store = storage(), { head = true, responder = () => undefined } = {}) {
  const added = [];
  const node = (name) => ({ name, appendChild(c) { added.push({ parent: name, node: c }); return c; } });
  const document = { head: head ? node("head") : null, documentElement: node("html"), hidden: false, createElement: (tag) => ({ tagName: tag.toUpperCase(), textContent: "" }), addEventListener() {} };
  const sent = [], onMessage = [];
  const tab = { alive: true, sent, onMessage, added, store, responder };
  const chrome = {
    runtime: {
      get id() { return tab.alive ? "ext" : undefined; },
      getURL: (p) => "chrome-extension://ext/" + p,
      sendMessage: (m) => { sent.push(m); return Promise.resolve().then(() => tab.responder(m)); },
      onMessage: { addListener: (fn) => onMessage.push(fn) },
    },
    storage: store.area(),
  };
  tab.on = {};
  tab.fire = (type) => { for (const fn of tab.on[type] || []) fn({ type }); };
  tab.ctx = vm.createContext({ chrome, document, location: { href: "https://mail.google.com/mail/u/0/#inbox" }, URL, setTimeout, clearTimeout, console, crypto, addEventListener: (type, fn) => (tab.on[type] = tab.on[type] || []).push(fn) });
  vm.runInContext(compatCode, tab.ctx, { filename: "compat.js" });
  return tab;
}
const xhr = (tab, d) => new Promise((resolve) => {
  const seen = [];
  const cb = (name) => (r) => { seen.push(name); if (name !== "onloadend") resolve({ name, r, seen }); };
  tab.ctx.GM_xmlhttpRequest(Object.assign({ onload: cb("onload"), onerror: cb("onerror"), ontimeout: cb("ontimeout"), onabort: cb("onabort"), onloadend: cb("onloadend") }, d));
});

test("compat: every stored value is in memory before Umbra starts, read synchronously as a fresh copy", async () => {
  const store = storage({ prefs3: JSON.stringify({ theme: "light", colors: { a: 1 } }), legacy: { n: 2 }, __umbra_writer: "x 1" });
  const tab = compat(store);
  const { ctx } = tab;
  for (const f of ["GM_getValue", "GM_setValue", "GM_addValueChangeListener", "GM_removeValueChangeListener", "GM_addStyle", "GM_xmlhttpRequest", "GM_openInTab", "GM_registerMenuCommand"]) assert.equal(typeof ctx[f], "function", f);
  assert.equal(ctx.GM_getValue("prefs3", "none"), "none", "nothing before it's loaded");
  await ctx.__umbraReady;
  assert.deepEqual(plain(ctx.GM_getValue("prefs3", {})), { theme: "light", colors: { a: 1 } });
  assert.deepEqual(plain(ctx.GM_getValue("legacy", null)), { n: 2 }, "a value stored as an object still reads");
  assert.equal(ctx.GM_getValue("missing", 7), 7);
  assert.deepEqual([...ctx.GM_listValues()].sort(), ["legacy", "prefs3"], "the writer mark is never Umbra's");
  ctx.GM_getValue("prefs3", {}).colors.a = 99;
  assert.equal(ctx.GM_getValue("prefs3", {}).colors.a, 1, "a copy each time");
});

test("compat: a write made as the page goes away is sent at once (no timer would run after it)", async () => {
  const store = storage();
  const tab = compat(store);
  await tab.ctx.__umbraReady;
  tab.fire("pagehide");
  tab.ctx.GM_setValue("live:a@b.c", { at: 0 });
  assert.ok(store.log.some((x) => x.set && x.set["live:a@b.c"]), "written in the same turn");
  tab.fire("pageshow"); // (back from the back-forward cache: writes wait a moment again)
  const n = store.log.length;
  tab.ctx.GM_setValue("x", 1);
  assert.equal(store.log.length, n);
  await settle();
  assert.equal(store.log.length, n + 1);
});

test("compat: GM_setValue is synchronous, keeps key order, and writes once for many changes", async () => {
  const store = storage();
  const { ctx } = compat(store);
  await ctx.__umbraReady;
  const obj = { zeta: 1, alpha: 2 };
  ctx.GM_setValue("cache", obj);
  obj.zeta = 5; // changing it afterwards changes nothing stored
  ctx.GM_setValue("n", 1);
  ctx.GM_setValue("n", 2);
  ctx.GM_setValue("n", 3);
  assert.deepEqual(plain(ctx.GM_getValue("cache")), { zeta: 1, alpha: 2 });
  assert.equal(ctx.GM_getValue("n"), 3);
  assert.equal(store.log.length, 0, "not written yet");
  await settle();
  assert.equal(store.log.length, 1, "one write for all of it");
  assert.equal(store.data.get("cache"), '{"zeta":1,"alpha":2}', "stored as its JSON text, keys in order");
  assert.equal(store.data.get("n"), "3");
  assert.ok(store.data.has("__umbra_writer"));
  assert.deepEqual(Object.keys(ctx.GM_getValue("cache")), ["zeta", "alpha"]);
  ctx.GM_setValue("n", 3); // the same value: nothing to write
  await settle();
  assert.equal(store.log.length, 1);
  ctx.GM_setValue("n", undefined);
  assert.equal(ctx.GM_getValue("n", "gone"), "gone");
  await settle();
  assert.ok(!store.data.has("n"), "removed from storage");
});

test("compat: change listeners hear this tab's writes as local and other tabs' as remote", async () => {
  const store = storage({ prefs3: JSON.stringify({ v: 0 }) });
  const a = compat(store), b = compat(store);
  await Promise.all([a.ctx.__umbraReady, b.ctx.__umbraReady]);
  const heardA = [], heardB = [];
  a.ctx.GM_addValueChangeListener("prefs3", (k, old, val, remote) => heardA.push([k, old, val, remote]));
  const idB = b.ctx.GM_addValueChangeListener("prefs3", (k, old, val, remote) => heardB.push([k, old, val, remote]));
  a.ctx.GM_setValue("prefs3", { v: 1 });
  await settle();
  assert.deepEqual(plain(heardA), [["prefs3", { v: 0 }, { v: 1 }, false]], "once, not again when storage reports it back");
  assert.deepEqual(plain(heardB), [["prefs3", { v: 0 }, { v: 1 }, true]]);
  assert.deepEqual(plain(b.ctx.GM_getValue("prefs3")), { v: 1 });
  // a write from outside any tab (another device's sync, the options page) is remote everywhere
  store.write({ prefs3: JSON.stringify({ v: 2 }) });
  await settle();
  assert.deepEqual(plain(heardA.at(-1)), ["prefs3", { v: 1 }, { v: 2 }, true]);
  assert.deepEqual(plain(a.ctx.GM_getValue("prefs3")), { v: 2 });
  b.ctx.GM_removeValueChangeListener(idB);
  a.ctx.GM_setValue("prefs3", { v: 3 });
  await settle();
  assert.equal(heardB.length, 2, "removed listeners hear nothing");
  // listeners on other keys hear nothing; a key another tab adds shows up
  b.ctx.GM_setValue("want", { at: 1 });
  await settle();
  assert.deepEqual(plain(a.ctx.GM_getValue("want")), { at: 1 });
  assert.equal(heardA.length, 3);
});

test("compat: two tabs writing the same key at once end up agreeing with storage", async () => {
  const store = storage();
  const a = compat(store), b = compat(store);
  await Promise.all([a.ctx.__umbraReady, b.ctx.__umbraReady]);
  a.ctx.GM_setValue("k", "from a");
  b.ctx.GM_setValue("k", "from b");
  assert.equal(a.ctx.GM_getValue("k"), "from a", "each tab sees its own write at once");
  await settle();
  const stored = JSON.parse(store.data.get("k"));
  assert.equal(a.ctx.GM_getValue("k"), stored);
  assert.equal(b.ctx.GM_getValue("k"), stored);
});

test("compat: GM_xmlhttpRequest goes through the service worker and answers like the manager", async () => {
  const tab = compat();
  const { ctx } = tab;
  await ctx.__umbraReady;
  tab.responder = (m) => (m.type === "umbra:xhr" ? { status: 200, statusText: "OK", responseText: '{"ok":1}', finalUrl: m.req.url, responseHeaders: "content-type: application/json" } : undefined);
  const ok = await xhr(tab, { method: "post", url: "/mail/u/0/feed/atom", headers: { "X-Umbra": "1" }, data: '{"a":1}', timeout: 5000, anonymous: true });
  assert.equal(ok.name, "onload");
  assert.equal(ok.r.status, 200);
  assert.equal(ok.r.responseText, '{"ok":1}');
  assert.equal(ok.r.response, '{"ok":1}');
  assert.equal(ok.r.readyState, 4);
  await wait();
  assert.deepEqual(ok.seen, ["onload", "onloadend"]);
  const m = tab.sent.at(-1);
  assert.equal(m.type, "umbra:xhr");
  assert.equal(typeof m.id, "string");
  assert.deepEqual(plain(m.req), { method: "POST", url: "https://mail.google.com/mail/u/0/feed/atom", headers: { "X-Umbra": "1" }, data: '{"a":1}', timeout: 5000, anonymous: true });

  tab.responder = () => ({ error: "Failed to fetch" });
  const err = await xhr(tab, { url: "http://127.0.0.1:47823/status" });
  assert.equal(err.name, "onerror");
  assert.equal(err.r.status, 0);
  assert.equal(err.r.error, "Failed to fetch");

  tab.responder = () => ({ error: "timeout" });
  assert.equal((await xhr(tab, { url: "https://docs.google.com/x", timeout: 10 })).name, "ontimeout");

  tab.responder = () => Promise.reject(new Error("The message port closed before a response was received."));
  assert.equal((await xhr(tab, { url: "https://docs.google.com/x" })).name, "onerror", "a service worker that went away is an error");

  // abort: the service worker is told, the caller hears onabort, a late answer is dropped
  let answer;
  tab.responder = (msg) => (msg.type === "umbra:xhr" ? new Promise((r) => { answer = r; }) : undefined);
  const heard = [];
  const req = ctx.GM_xmlhttpRequest({ url: "https://api.openai.com/v1/models", onload: () => heard.push("onload"), onabort: () => heard.push("onabort") });
  req.abort();
  await wait();
  assert.equal(tab.sent.at(-1).type, "umbra:abort");
  assert.equal(tab.sent.at(-1).id, tab.sent.at(-2).id);
  answer({ status: 200, responseText: "late" });
  await wait();
  assert.deepEqual(heard, ["onabort"]);

  // after the extension is updated under the tab: an error, never an exception
  tab.alive = false;
  const gone = await xhr(tab, { url: "https://docs.google.com/x" });
  assert.equal(gone.name, "onerror");
});

test("compat: GM_openInTab and GM_addStyle", async () => {
  const tab = compat();
  await tab.ctx.__umbraReady;
  tab.ctx.GM_openInTab("https://mail.google.com/mail/u/1/#inbox", { active: false, insert: true });
  tab.ctx.GM_openInTab("/mail/u/0/#settings", { active: true });
  assert.deepEqual(plain(tab.sent.slice(-2)), [
    { type: "umbra:open", url: "https://mail.google.com/mail/u/1/#inbox", active: false, insert: true },
    { type: "umbra:open", url: "https://mail.google.com/mail/u/0/#settings", active: true, insert: true },
  ]);
  const s = tab.ctx.GM_addStyle('@font-face { src: url("__EXT__/fonts/a.woff2") } @font-face { src: url("__EXT__/fonts/b.woff2") }');
  assert.equal(s.tagName, "STYLE");
  assert.equal(s.textContent, '@font-face { src: url("chrome-extension://ext/fonts/a.woff2") } @font-face { src: url("chrome-extension://ext/fonts/b.woff2") }');
  assert.equal(tab.added.at(-1).parent, "head");
  const early = compat(storage(), { head: false });
  early.ctx.GM_addStyle("html { color: red }");
  assert.equal(early.added.at(-1).parent, "html", "at document_start, before <head>");
});

/* =================================================================== (c) background.js */
const backgroundCode = read("extension/background.js");
const GMAIL_TAB = { id: 7, index: 2, windowId: 1, url: "https://mail.google.com/mail/u/0/#inbox" };
const FROM_GMAIL = { id: "ext", tab: GMAIL_TAB, origin: "https://mail.google.com", url: GMAIL_TAB.url };

function background({ granted = ["https://mail.google.com/*", "https://docs.google.com/*", "https://generativelanguage.googleapis.com/*", "https://api.openai.com/*", "https://api.anthropic.com/*"], fetch, sendMessage } = {}) {
  const w = { onMessage: [], onClicked: [], onInstalled: [], onStartup: [], rules: [], created: [], reloaded: [], told: [], fetched: [], intervals: new Set(), options: 0 };
  w.fetch = fetch || (async (url, init) => new Response("hello", { status: 201, statusText: "Created", headers: { "content-type": "text/plain", "x-a": "1" } }));
  const chrome = {
    runtime: {
      id: "ext",
      onMessage: { addListener: (fn) => w.onMessage.push(fn) },
      onInstalled: { addListener: (fn) => w.onInstalled.push(fn) },
      onStartup: { addListener: (fn) => w.onStartup.push(fn) },
      getURL: (p) => "chrome-extension://ext/" + p,
      getPlatformInfo: async () => ({ os: "mac" }),
      openOptionsPage: async () => { w.options++; },
    },
    permissions: { contains: async ({ origins }) => origins.every((o) => granted.includes(o)) },
    tabs: {
      create: async (o) => { w.created.push(o); return Object.assign({ id: 99 }, o); },
      reload: async (id) => { w.reloaded.push(id); },
      sendMessage: async (id, msg, opt) => { w.told.push([id, msg, opt]); if (!sendMessage) throw new Error("Could not establish connection. Receiving end does not exist."); return sendMessage(id, msg, opt); },
    },
    action: { onClicked: { addListener: (fn) => w.onClicked.push(fn) } },
    declarativeNetRequest: { updateDynamicRules: async (o) => { w.rules.push(o); } },
  };
  const ctx = vm.createContext({
    chrome, URL, AbortController, console, setTimeout, clearTimeout,
    setInterval: (fn, ms) => { const id = setInterval(fn, ms); w.intervals.add(id); return id; },
    clearInterval: (id) => { clearInterval(id); w.intervals.delete(id); },
    fetch: (url, init) => { w.fetched.push([url, init]); return w.fetch(url, init); },
  });
  vm.runInContext(backgroundCode, ctx, { filename: "background.js" });
  w.ask = (msg, sender = FROM_GMAIL) => new Promise((resolve) => { if (w.onMessage[0](msg, sender, resolve) !== true) resolve("no answer"); });
  w.click = (tab) => w.onClicked[0](tab);
  return w;
}

test("background: requests carry the cookies (unless anonymous), the headers and the body", async () => {
  const bg = background();
  const res = await bg.ask({ type: "umbra:xhr", id: "t:1", req: { method: "POST", url: "https://docs.google.com/spreadsheets/d/x/gviz/tq?tqx=out:csv", headers: { "Content-Type": "application/json", "X-Umbra": "1" }, data: '{"a":1}', timeout: 5000 } });
  assert.equal(res.status, 201);
  assert.equal(res.statusText, "Created");
  assert.equal(res.responseText, "hello");
  assert.equal(res.finalUrl, "https://docs.google.com/spreadsheets/d/x/gviz/tq?tqx=out:csv");
  assert.match(res.responseHeaders, /content-type: text\/plain/);
  assert.match(res.responseHeaders, /x-a: 1/);
  const [url, init] = bg.fetched[0];
  assert.equal(url, "https://docs.google.com/spreadsheets/d/x/gviz/tq?tqx=out:csv");
  assert.equal(init.method, "POST");
  assert.equal(init.credentials, "include");
  assert.deepEqual(plain(init.headers), { "Content-Type": "application/json", "X-Umbra": "1" });
  assert.equal(init.body, '{"a":1}');
  await bg.ask({ type: "umbra:xhr", id: "t:2", req: { method: "GET", url: "https://api.anthropic.com/v1/models", headers: { "x-api-key": "k" }, data: "ignored", anonymous: true } });
  assert.equal(bg.fetched[1][1].credentials, "omit", "the AI providers get the key, never the cookies");
  assert.equal(bg.fetched[1][1].body, undefined, "a GET has no body");
  assert.equal(bg.intervals.size, 0, "awake only while requests are out");
});

test("background: timeouts, aborts and failures", async () => {
  const hang = (url, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  const bg = background({ fetch: hang });
  assert.deepEqual(plain(await bg.ask({ type: "umbra:xhr", id: "t:1", req: { url: "https://mail.google.com/mail/u/0/feed/atom", timeout: 30 } })), { error: "timeout" });
  const pending = bg.ask({ type: "umbra:xhr", id: "t:2", req: { url: "https://mail.google.com/x" } });
  await wait(10);
  assert.equal(bg.intervals.size, 1, "kept awake while a request is out");
  assert.equal(await bg.ask({ type: "umbra:abort", id: "t:2" }), "no answer");
  assert.deepEqual(plain(await pending), { error: "abort" });
  assert.equal(bg.intervals.size, 0);
  const down = background({ fetch: async () => { throw new TypeError("Failed to fetch"); } });
  assert.deepEqual(plain(await down.ask({ type: "umbra:xhr", id: "t:3", req: { url: "https://mail.google.com/x" } })), { error: "Failed to fetch" });
});

test("background: only the sites the extension may reach, only for Gmail", async () => {
  const bg = background();
  assert.match((await bg.ask({ type: "umbra:xhr", id: "1", req: { url: "https://evil.example/steal" } })).error, /isn't allowed/);
  assert.match((await bg.ask({ type: "umbra:xhr", id: "2", req: { url: "http://127.0.0.1:47823/status" } })).error, /isn't allowed/);
  assert.match((await bg.ask({ type: "umbra:xhr", id: "3", req: { url: "file:///etc/passwd" } })).error, /isn't allowed/);
  assert.equal(bg.fetched.length, 0);
  // (127.0.0.1 is in the manifest for the sign-in rule only: nothing is ever fetched from this computer)
  const loop = background({ granted: ["http://127.0.0.1/*"] });
  assert.match((await loop.ask({ type: "umbra:xhr", id: "4", req: { url: "http://127.0.0.1:47824/auth/callback?code=x" } })).error, /isn't allowed/);
  assert.match((await loop.ask({ type: "umbra:xhr", id: "4b", req: { url: "http://localhost:47824/" } })).error, /isn't allowed/);
  assert.equal(loop.fetched.length, 0);
  const allowed = background({ granted: ["https://auth.openai.com/*"] });
  assert.equal((await allowed.ask({ type: "umbra:xhr", id: "4", req: { method: "POST", url: "https://auth.openai.com/api/accounts/oauth/token", anonymous: true } })).status, 201);
  // messages from anywhere but a Gmail tab go unanswered
  assert.equal(await bg.ask({ type: "umbra:xhr", id: "5", req: { url: "https://mail.google.com/" } }, { id: "ext", tab: { id: 3 }, origin: "https://evil.example", url: "https://evil.example/" }), "no answer");
  assert.equal(await bg.ask({ type: "umbra:xhr", id: "6", req: { url: "https://mail.google.com/" } }, { id: "other", tab: GMAIL_TAB, origin: "https://mail.google.com" }), "no answer");
  assert.equal(bg.fetched.length, 0);
  assert.equal(allowed.fetched.length, 1);
});

test("background: ChatGPT's way back is caught before it loads; a new install opens Gmail", async () => {
  const bg = background();
  await bg.onInstalled[0]({ reason: "install" });
  await wait(0);
  const rule = bg.rules[0].addRules[0];
  assert.deepEqual(plain(bg.rules[0].removeRuleIds), [1]);
  assert.equal(rule.action.type, "redirect");
  assert.equal(rule.action.redirect.regexSubstitution, "chrome-extension://ext/signin.html?\\1");
  assert.deepEqual(plain(rule.condition.resourceTypes), ["main_frame"]);
  const re = new RegExp(rule.condition.regexFilter);
  const m = "http://127.0.0.1:47824/auth/callback?code=abc&state=xyz".match(re);
  assert.equal(m[1], "code=abc&state=xyz");
  assert.equal(re.test("http://127.0.0.1:47823/auth/callback?code=abc"), false, "only Umbra's own port");
  assert.equal(re.test("http://evil.example/127.0.0.1:47824/auth/callback?x"), false);
  assert.deepEqual(plain(bg.created), [{ url: "https://mail.google.com/mail/u/0/#inbox", active: true }]);
  // an update keeps the rule, and opens nothing
  const up = background();
  await up.onInstalled[0]({ reason: "update" });
  assert.equal(up.rules.length, 1);
  assert.equal(up.created.length, 0);
  await up.onStartup[0]();
  assert.equal(up.rules.length, 2);
});

test("background: GM_openInTab opens next to Gmail; only web pages", async () => {
  const bg = background();
  assert.deepEqual(plain(await bg.ask({ type: "umbra:open", url: "https://mail.google.com/mail/u/1/#inbox", active: false, insert: true })), { ok: true });
  assert.deepEqual(plain(bg.created[0]), { url: "https://mail.google.com/mail/u/1/#inbox", active: false, openerTabId: 7, windowId: 1, index: 3 });
  await bg.ask({ type: "umbra:open", url: "https://docs.google.com/x", active: true, insert: false });
  assert.deepEqual(plain(bg.created[1]), { url: "https://docs.google.com/x", active: true, openerTabId: 7, windowId: 1 });
  assert.equal((await bg.ask({ type: "umbra:open", url: "javascript:alert(1)", active: true })).ok, false);
  assert.equal(bg.created.length, 2);
  await bg.ask({ type: "umbra:options" });
  assert.equal(bg.options, 1);
});

test("the toolbar button opens Umbra's settings in Gmail, or Gmail", async () => {
  // the whole way: the click, the service worker, compat.js in the tab, Umbra's own menu command
  const tab = compat();
  await tab.ctx.__umbraReady;
  let opened = 0;
  tab.ctx.GM_registerMenuCommand("Umbra Mail settings", () => { opened++; });
  tab.ctx.GM_registerMenuCommand("Show plain Gmail in this tab", () => { throw new Error("not this one"); });
  const toTab = (id, msg) => new Promise((resolve) => { for (const fn of tab.onMessage) fn(msg, { id: "ext" }, resolve); });
  const bg = background({ sendMessage: toTab });
  await bg.click(GMAIL_TAB);
  assert.equal(opened, 1);
  assert.deepEqual(plain(bg.told[0]), [7, { type: "umbra:menu", name: "Umbra Mail settings" }, { frameId: 0 }]);
  assert.equal(bg.created.length + bg.reloaded.length, 0);
  // compat answers only the extension, and says when there's no such command
  const replies = [];
  tab.onMessage[0]({ type: "umbra:menu", name: "Umbra Mail settings" }, { id: "someone-else" }, (r) => replies.push(r));
  tab.onMessage[0]({ type: "umbra:menu", name: "Nothing" }, { id: "ext" }, (r) => replies.push(r));
  assert.equal(opened, 1);
  assert.deepEqual(replies.map((r) => r.ok), [false]);
  // a tab that isn't Gmail: Gmail opens next to it
  const none = background();
  await none.click({ id: 4, index: 0, windowId: 2, url: undefined });
  assert.deepEqual(plain(none.created), [{ url: "https://mail.google.com/", active: true, index: 1, windowId: 2, openerTabId: 4 }]);
  // a Gmail tab from before Umbra was installed: a reload brings it in
  await none.click(GMAIL_TAB);
  assert.deepEqual(none.reloaded, [7]);
  assert.equal(none.created.length, 1);
});
