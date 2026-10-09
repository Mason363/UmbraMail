/* Umbra Mail for Chrome: the userscript calls Umbra makes (GM_*), answered with extension APIs.
   Runs first, at document_start, in the content scripts' own world (Gmail's page can't see any of it).
   umbra.js, the same code as the userscript, starts once globalThis.__umbraReady resolves: once every
   stored value is in memory, so GM_getValue can answer at once, as it does in a userscript manager.
   After the extension is updated or removed under an open Gmail tab the old copy here loses its link
   to the extension ("context invalidated"): from then on every call quietly does nothing. */
(() => {
  "use strict";
  const G = globalThis;
  if (G.__umbraReady) return; // injected twice: the first one stays in charge

  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  const report = (e) => { try { console.error("Umbra Mail:", e); } catch (x) { /* nothing to tell */ } };
  const call = (fn, self, ...args) => { if (typeof fn === "function") try { fn.apply(self, args); } catch (e) { report(e); } };
  const send = (msg) => { try { return alive() ? chrome.runtime.sendMessage(msg) : Promise.reject(new Error("Umbra Mail was updated: reload Gmail")); } catch (e) { return Promise.reject(e); } };
  const TAB = (G.crypto && typeof crypto.randomUUID === "function") ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

  /* =================================================================== values
     Every value lives in chrome.storage.local as its JSON text (so objects keep their key order, which
     Umbra's "keep the newest N" caches rely on), and here in memory as the same text: reads are
     synchronous and hand back a fresh copy, writes change memory at once and reach storage a moment
     later (several writes in one go). Another tab's writes arrive through storage.onChanged and are
     reported to listeners as remote; this tab's own as not remote, as userscript managers do. */
  const WRITER = "__umbra_writer"; // written alongside every write: which tab made it (never shown to Umbra)
  const cache = new Map();    // key -> JSON text
  const dirty = new Set();    // keys changed here, not yet handed to storage
  const inflight = new Map(); // key -> number of the write carrying it, until storage reports it back
  const watchers = new Map(); // listener id -> { key, fn }
  let writes = 0, flushTimer = 0, watchN = 0, loaded = false, readOnly = false;
  const early = []; // changes seen before everything was loaded
  const asText = (v) => (v === undefined ? undefined : typeof v === "string" ? v : JSON.stringify(v));
  const parse = (j) => { if (j === undefined) return undefined; try { return JSON.parse(j); } catch (e) { return undefined; } };

  function notify(key, oldJ, newJ, remote) {
    for (const w of [...watchers.values()]) if (w.key === key) call(w.fn, null, key, parse(oldJ), parse(newJ), remote);
  }
  function flush() {
    clearTimeout(flushTimer);
    flushTimer = 0;
    if (!dirty.size) return;
    const n = ++writes, put = { [WRITER]: TAB + " " + n }, gone = [];
    for (const k of dirty) {
      const j = cache.get(k);
      if (j === undefined) gone.push(k); else put[k] = j;
      inflight.set(k, n);
    }
    dirty.clear();
    const failed = (e) => { for (const [k, m] of inflight) if (m === n) inflight.delete(k); if (e) report(e); };
    if (readOnly || !alive()) return failed();
    try {
      chrome.storage.local.set(put).catch(failed);
      if (gone.length) chrome.storage.local.remove(gone).catch(() => {});
    } catch (e) { failed(); }
  }
  function apply(changes, fire) {
    const mark = changes[WRITER] && changes[WRITER].newValue;
    if (typeof mark === "string" && mark.startsWith(TAB + " ")) {
      // this tab's own write, back from storage: nothing to change, only stop waiting for it
      const n = Number(mark.slice(TAB.length + 1));
      for (const [k, m] of inflight) if (m <= n) inflight.delete(k);
      return;
    }
    for (const k of Object.keys(changes)) {
      // a write of this tab's that is still on its way lands after this one, so it stands
      if (k === WRITER || dirty.has(k) || inflight.has(k)) continue;
      const j = asText(changes[k].newValue), old = cache.get(k);
      if (j === old) continue;
      if (j === undefined) cache.delete(k); else cache.set(k, j);
      if (fire) notify(k, old, j, true);
    }
  }
  function onChanged(changes, area) {
    if (area !== "local") return;
    if (!loaded) early.push(changes);
    else apply(changes, true);
  }

  G.__umbraReady = new Promise((resolve) => {
    const done = () => {
      if (loaded) return;
      loaded = true;
      for (const c of early.splice(0)) apply(c, false);
      resolve();
    };
    try {
      chrome.storage.onChanged.addListener(onChanged);
      chrome.storage.local.get(null).then((all) => {
        for (const [k, v] of Object.entries(all || {})) if (k !== WRITER) cache.set(k, asText(v));
        done();
      }, (e) => { report(e); readOnly = true; done(); });
    } catch (e) {
      // no storage: Umbra still runs, with its defaults, and writes nothing (so nothing saved gets overwritten)
      readOnly = true;
      done();
    }
  });
  // (the page going away: writes made from here on, by Umbra's own pagehide, go at once, not after a timer that won't run)
  let pageGone = false;
  addEventListener("pagehide", () => { pageGone = true; flush(); });
  addEventListener("pageshow", () => { pageGone = false; });
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });

  G.GM_getValue = (key, fallback) => {
    const j = cache.get(String(key));
    if (j === undefined) return fallback;
    const v = parse(j);
    return v === undefined ? fallback : v;
  };
  G.GM_setValue = (key, value) => {
    key = String(key);
    const j = value === undefined ? undefined : JSON.stringify(value);
    const old = cache.get(key);
    if (j === old) return;
    if (j === undefined) cache.delete(key); else cache.set(key, j);
    dirty.add(key);
    if (pageGone) flush();
    else if (!flushTimer) flushTimer = setTimeout(flush, 20);
    setTimeout(() => notify(key, old, j, false), 0);
  };
  G.GM_deleteValue = (key) => G.GM_setValue(key, undefined);
  G.GM_listValues = () => [...cache.keys()];
  G.GM_addValueChangeListener = (key, fn) => {
    const id = ++watchN;
    watchers.set(id, { key: String(key), fn });
    return id;
  };
  G.GM_removeValueChangeListener = (id) => { watchers.delete(id); };

  /* =================================================================== requests
     Made by the service worker (background.js), which may reach other sites, with the user's cookies unless
     anonymous: only the ones the manifest names. Answers arrive as onload / onerror / ontimeout, like the
     manager's. Text only: no responseType, binary data, onprogress or streaming. */
  let reqN = 0;
  G.GM_xmlhttpRequest = (d) => {
    d = d || {};
    const id = TAB + ":" + ++reqN;
    let over = false, guard = 0;
    const end = (name, res) => {
      if (over) return;
      over = true;
      clearTimeout(guard);
      const r = Object.assign({ finalUrl: String(d.url || ""), readyState: 4, status: 0, statusText: "", responseHeaders: "", responseText: "" }, res, { context: d.context });
      r.response = r.responseText;
      call(d[name], r, r);
      call(d.onloadend, r, r);
    };
    const fail = (e) => end("onerror", { error: String((e && e.message) || e || "Request failed") });
    let req;
    try {
      req = {
        method: String(d.method || "GET").toUpperCase(),
        url: new URL(String(d.url), location.href).href,
        headers: Object.assign({}, d.headers),
        data: d.data == null ? undefined : String(d.data),
        timeout: Math.max(0, Number(d.timeout) || 0),
        anonymous: !!d.anonymous, // no cookies (the AI providers, called with the reader's own key)
      };
    } catch (e) { setTimeout(() => fail(e), 0); return { abort() {} }; }
    // the service worker keeps its own clock; this one only answers if it never does
    if (req.timeout) guard = setTimeout(() => { send({ type: "umbra:abort", id }).catch(() => {}); end("ontimeout", {}); }, req.timeout + 5000);
    send({ type: "umbra:xhr", id, req }).then((res) => {
      if (!res) fail("No answer");
      else if (res.error === "timeout") end("ontimeout", {});
      else if (res.error === "abort") end("onabort", {});
      else if (res.error) fail(res.error);
      else end("onload", res);
    }, fail);
    return {
      abort() {
        if (over) return;
        send({ type: "umbra:abort", id }).catch(() => {});
        end("onabort", {});
      },
    };
  };

  /* =================================================================== tabs, styles, the menu */
  G.GM_openInTab = (url, opt) => {
    const o = typeof opt === "boolean" ? { active: !opt } : opt || {};
    try {
      send({ type: "umbra:open", url: new URL(String(url), location.href).href, active: !!o.active, insert: o.insert !== false }).catch(report);
    } catch (e) { report(e); }
  };

  // the bundled fonts: the stylesheet says __EXT__/fonts/…, the extension's own address goes there
  const BASE = (() => { try { return chrome.runtime.getURL(""); } catch (e) { return ""; } })();
  G.GM_addStyle = (css) => {
    const s = document.createElement("style");
    s.textContent = String(css).split("__EXT__/").join(BASE);
    (document.head || document.documentElement).appendChild(s);
    return s;
  };

  // what the userscript manager would list in its menu; the toolbar button runs "Umbra Mail settings"
  const commands = new Map();
  G.GM_registerMenuCommand = (name, fn) => { commands.set(String(name), fn); return String(name); };
  G.GM_unregisterMenuCommand = (name) => { commands.delete(String(name)); };
  try {
    chrome.runtime.onMessage.addListener((msg, sender, reply) => {
      if (!msg || msg.type !== "umbra:menu" || sender.id !== chrome.runtime.id) return false;
      const fn = commands.get(String(msg.name));
      if (typeof fn !== "function") { reply({ ok: false, error: "Umbra hasn't started in this tab" }); return false; }
      try { fn(); reply({ ok: true }); } catch (e) { report(e); reply({ ok: false, error: String((e && e.message) || e) }); }
      return false;
    });
  } catch (e) { /* no extension link: no toolbar button either */ }

  // for Umbra's own settings: it's running as the extension, and can open the extension's options page
  G.UMBRA_EXTENSION = Object.freeze({
    openOptions: () => { send({ type: "umbra:options" }).catch(report); },
  });
})();
