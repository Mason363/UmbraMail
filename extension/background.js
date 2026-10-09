/* Umbra Mail for Chrome: the service worker.
   - makes Umbra's requests to other sites (GM_xmlhttpRequest in compat.js), to the sites the manifest names
     only: Gmail and Google Sheets (Gemini's sheet) with the user's cookies; Gemini, OpenAI and Anthropic with
     the reader's own key or ChatGPT sign-in, and no cookies;
   - opens tabs for it (GM_openInTab);
   - catches ChatGPT's sign-in coming back (to 127.0.0.1) and hands it to Umbra (signin.html);
   - opens Gmail when Umbra is first installed, where the welcome plays;
   - turns a click on the toolbar button into Umbra's own "Umbra Mail settings" in the Gmail tab. */
"use strict";

const GMAIL = "https://mail.google.com/";
const SETTINGS = "Umbra Mail settings";
const running = new Map(); // tab id + request id -> AbortController
let awake = 0;

/* =================================================================== requests */
// a site Umbra may reach: http(s), and covered by a host permission the extension holds right now
async function allowed(url) {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  // (this computer is in the manifest only so the sign-in rule can catch ChatGPT's way back: never fetched)
  if (/^(127\.\d+\.\d+\.\d+|localhost|\[::1\])$/i.test(url.hostname)) return false;
  try { return await chrome.permissions.contains({ origins: [url.origin + "/*"] }); } catch (e) { return false; }
}

/* A request can wait on the helper for up to two minutes (AI answers); Chrome stops an idle service worker
   after 30 seconds, and a call to any extension API counts as activity. So while requests are out, one every 20 seconds. */
function stayAwake() {
  if (!awake) awake = setInterval(() => { chrome.runtime.getPlatformInfo().catch(() => {}); }, 20000);
}
function maySleep() {
  if (awake && !running.size) { clearInterval(awake); awake = 0; }
}

async function request(key, req) {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = req.timeout > 0 ? setTimeout(() => { timedOut = true; ctrl.abort(); }, req.timeout) : 0;
  running.set(key, ctrl);
  stayAwake();
  try {
    let url;
    try { url = new URL(String(req.url)); } catch (e) { return { error: "Not a web address" }; }
    if (!(await allowed(url))) return { error: "Umbra Mail isn't allowed to reach " + url.host };
    if (ctrl.signal.aborted) return { error: timedOut ? "timeout" : "abort" };
    const method = String(req.method || "GET").toUpperCase();
    const headers = {};
    for (const [k, v] of Object.entries(req.headers || {})) if (v != null) headers[k] = String(v);
    const res = await fetch(url.href, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" || req.data == null ? undefined : String(req.data),
      credentials: req.anonymous ? "omit" : "include",
      redirect: "follow",
      signal: ctrl.signal,
    });
    const responseText = await res.text();
    const lines = [];
    res.headers.forEach((v, k) => lines.push(k + ": " + v));
    return { status: res.status, statusText: res.statusText, responseText, finalUrl: res.url || url.href, responseHeaders: lines.join("\r\n") };
  } catch (e) {
    return { error: timedOut ? "timeout" : ctrl.signal.aborted ? "abort" : String((e && e.message) || e || "Request failed") };
  } finally {
    clearTimeout(timer);
    running.delete(key);
    maySleep();
  }
}

/* =================================================================== tabs */
async function openTab(msg, tab) {
  const url = new URL(String(msg.url));
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only web pages open in a tab");
  const o = { url: url.href, active: !!msg.active };
  if (tab && tab.id >= 0) {
    o.openerTabId = tab.id;
    o.windowId = tab.windowId;
    if (msg.insert !== false && tab.index >= 0) o.index = tab.index + 1;
  }
  await chrome.tabs.create(o);
}

/* =================================================================== messages from Umbra (compat.js, in Gmail tabs only) */
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || sender.id !== chrome.runtime.id || !sender.tab) return false;
  let origin = sender.origin || "";
  try { origin = origin || new URL(sender.url).origin; } catch (e) { /* no address */ }
  if (origin + "/" !== GMAIL) return false;
  const key = sender.tab.id + " " + msg.id;
  switch (msg.type) {
    case "umbra:xhr":
      request(key, msg.req || {}).then(reply);
      return true;
    case "umbra:abort": {
      const c = running.get(key);
      if (c) c.abort();
      return false;
    }
    case "umbra:open":
      openTab(msg, sender.tab).then(() => reply({ ok: true }), (e) => reply({ ok: false, error: String((e && e.message) || e) }));
      return true;
    case "umbra:options":
      chrome.runtime.openOptionsPage().catch(() => {});
      return false;
    default:
      return false;
  }
});

/* =================================================================== the toolbar button
   In a Gmail tab Umbra runs in: its settings. In a Gmail tab opened before Umbra was installed (or updated),
   where it isn't running yet: a reload brings it in. Anywhere else: Gmail, in a new tab. */
chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.id >= 0) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "umbra:menu", name: SETTINGS }, { frameId: 0 });
      if (res) return; // Umbra answered (if it hasn't started yet, it's about to)
    } catch (e) { /* Umbra isn't in this tab */ }
    if (typeof tab.url === "string" && tab.url.startsWith(GMAIL)) {
      try { await chrome.tabs.reload(tab.id); } catch (e) { /* the tab went away */ }
      return;
    }
  }
  const o = { url: GMAIL, active: true };
  if (tab && tab.id >= 0 && tab.index >= 0) { o.index = tab.index + 1; o.windowId = tab.windowId; o.openerTabId = tab.id; }
  try { await chrome.tabs.create(o); } catch (e) { /* no window to open it in */ }
});

/* =================================================================== Sign in with ChatGPT
   OpenAI sends every app's sign-in back to 127.0.0.1 (this computer), and nothing listens there: this rule
   catches that one address before it loads and opens Umbra's own page instead (signin.html), which leaves
   ChatGPT's answer where Umbra in the Gmail tab finds it. (Its id goes into the rule: it's only known here.) */
const SIGNIN_RULE = 1;
async function signinRule() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [SIGNIN_RULE],
      addRules: [{
        id: SIGNIN_RULE, priority: 1,
        action: { type: "redirect", redirect: { regexSubstitution: chrome.runtime.getURL("signin.html") + "?\\1" } },
        condition: { regexFilter: "^http://127\\.0\\.0\\.1:47824/auth/callback\\?(.*)$", resourceTypes: ["main_frame"] },
      }],
    });
  } catch (e) { console.error("Umbra Mail: the sign-in rule", e); }
}
chrome.runtime.onStartup.addListener(signinRule);
chrome.runtime.onInstalled.addListener((d) => {
  signinRule();
  // a new install: Gmail, where Umbra's welcome plays
  if (d.reason === "install") chrome.tabs.create({ url: GMAIL + "mail/u/0/#inbox", active: true }).catch(() => {});
});
