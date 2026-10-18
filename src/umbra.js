/* Umbra for Gmail — Quiet.
   Umbra draws its own screens (inbox, conversation, reading, find, sidebar) from what Gmail
   has on the page, and hands every action back to Gmail. Gmail stays underneath, untouched.
   No innerHTML anywhere: Gmail enforces Trusted Types, so nodes are built by hand. */

const ROOT = document.documentElement;
// one Umbra per page, even if it gets injected twice
if (ROOT.hasAttribute("data-umbra")) throw new Error("Umbra is already running on this page.");
ROOT.setAttribute("data-umbra", "");

/* =================================================================== storage & prefs */
const store = {
  get(key, fallback) {
    try {
      if (typeof GM_getValue === "function") return GM_getValue(key, fallback);
      const raw = localStorage.getItem("umbra:" + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try {
      if (typeof GM_setValue === "function") GM_setValue(key, value);
      else localStorage.setItem("umbra:" + key, JSON.stringify(value));
    } catch (e) { /* no storage */ }
  },
  // gone, so the next read gets its default (a stored null would come back as null)
  del(key) {
    try {
      if (typeof GM_deleteValue === "function") GM_deleteValue(key);
      else if (typeof GM_setValue === "function") GM_setValue(key, undefined);
      else localStorage.removeItem("umbra:" + key);
    } catch (e) { /* no storage */ }
  },
};
// a first run on this browser: AI stays off until you say yes (the welcome asks)
const FRESH = store.get("prefs3", null) == null;
const PREF_DEFAULTS = Object.freeze({
  brief: true, summaries: "auto", expand: true, darken: true, sidePanel: false, ask: true,
  order: "date", density: "spacious", avatars: true, needs: true, dimAuto: true, gemini: true, ideas: "focus", colors: {},
  counts: "today", soft: false, size: "normal", lines: false, readWidth: 880, autoColors: true, bg: { kind: "none", color: "#0f1012", dim: 0.6 },
  chip: "full", edge: false, side: "left", rail: false, burger: true, fab: true, split: false, paneW: 380, uiFont: "instrument", readFont: "sans",
  keys: {}, briefs: {}, gem: {}, gemSheet: "", gemAccount: "", ai: !FRESH, theme: "dark",
  motion: "system", glass: 0, grain: 0, accentFollow: false, trackers: true, recall: true, flourish: true, sendSound: false, scrollTitle: false,
});
const prefs = Object.assign(JSON.parse(JSON.stringify(PREF_DEFAULTS)), store.get("prefs3", {}));
// (already using Umbra from before there was a welcome: none. A first run says so at once, so a reload before
// the welcome is answered still shows it)
if (FRESH) store.set("welcomed", false);
else if (store.get("welcomed", null) == null) store.set("welcomed", true);
/* AI, all of it, in one switch (Settings › AI). Off, Umbra is the whole mail client without it: nothing
   is asked of any AI, Gmail's Gemini or the Gemini sheet, and nothing about AI is shown */
const aiOn = () => prefs.ai !== false;
if (prefs.summaries === true) prefs.summaries = "auto"; // was "offer a Summarize button"; now made on its own for long ones
if (prefs.summaries === false) prefs.summaries = "off";
// 1.17: rows breathe by default (Spacious); whoever was on the old default (Comfortable) moves with it, once
if (!prefs.mig17) { if (prefs.density === "comfy") prefs.density = "spacious"; prefs.mig17 = true; store.set("prefs3", prefs); }
let enabled = true; // never stored: Umbra is always on when Gmail loads
// a change made in another tab (a name, a colour, a setting) shows here at once
if (typeof GM_addValueChangeListener === "function") {
  GM_addValueChangeListener("prefs3", (k, old, val, remote) => { if (remote) { const v = val || {}; for (const key of Object.keys(prefs)) if (!(key in v) && !(key in PREF_DEFAULTS)) delete prefs[key]; Object.assign(prefs, JSON.parse(JSON.stringify(PREF_DEFAULTS)), v); setTimeout(() => { applyPrefs(); applyColors(); applyLook(); applyFinish(); applyUserCss(); keyHints(); renderAccounts(); calmTick(); aiSwitched(); everyKeys = ["!redraw"]; lastThreadSig = ""; invalidate(true); }); } });
  GM_addValueChangeListener("contacts", (k, old, val, remote) => { if (remote && val) { contacts = val; setTimeout(() => { lastThreadSig = ""; invalidate(true); }); } });
  GM_addValueChangeListener("bg-img", (k, old, val, remote) => { if (remote) setTimeout(applyLook); });
  GM_addValueChangeListener("read-here", (k, old, val, remote) => { if (remote && val) setTimeout(() => { readHere.clear(); for (const [id, o] of Object.entries(val)) readHere.set(id, o); everyKeys = ["!redraw"]; invalidate(true); }); });
}
function savePrefs() { store.set("prefs3", prefs); applyPrefs(); applyColors(); applyLook(); applyFinish(); keyHints(); everyKeys = ["!redraw"]; lastThreadSig = ""; if (typeof calmTick === "function") calmTick(); aiSwitched(); invalidate(true); }
// AI turned on or off (here, in Flags, or in another tab): what Umbra knows about it is asked again at once
let aiWasOn = aiOn();
function aiSwitched() {
  if (aiWasOn === aiOn()) return;
  aiWasOn = aiOn();
  refreshAI(false).then(() => invalidate(true));
}

/* =================================================================== style */
function addStyle(css) {
  if (typeof GM_addStyle === "function") return GM_addStyle(css);
  const s = document.createElement("style");
  s.textContent = css;
  (document.head || ROOT).appendChild(s);
  return s;
}
// (kept: plain Gmail switches the whole stylesheet off, so nothing of Umbra's look is left on Gmail)
const umbraStyle = (() => { const s = addStyle(UMBRA_CSS); if (s && "disabled" in s) return s; return [...document.querySelectorAll("style")].find((x) => (x.textContent || "").includes("Umbra for Gmail — Quiet")) || null; })();
function removeOldCopies() {
  for (const st of document.querySelectorAll("style")) {
    const t = st.textContent || "";
    if (t.indexOf("Umbra for Gmail") !== -1 && (t.indexOf("html.umbra {") !== -1 || t.indexOf('"Quiet")') !== -1 || t.indexOf("--zen-spring") === -1 && t.indexOf("html.qm {") !== -1)) st.remove();
  }
}
function applyPrefs() {
  ROOT.classList.toggle("qm", enabled);
  ROOT.classList.toggle("qm-sidepanel", !!prefs.sidePanel);
  ROOT.classList.toggle("qm-scrolltitle", !!prefs.scrollTitle); // (Settings › Display › Email: the title as you scroll)
}
applyPrefs();
applyLook();
window.addEventListener("resize", () => { if (ROOT.classList.contains("qm-bgimg")) applyLook(); });
try { window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (prefs.theme === "system") { applyLook(); lastThreadSig = ""; invalidate(true); } }); } catch (e) { /* no media queries */ }
const isLight = () => ROOT.classList.contains("qm-light");
if (typeof GM_registerMenuCommand === "function") {
  // (the Chrome extension's toolbar button runs the first: with Umbra off in this tab, it brings it back)
  GM_registerMenuCommand("Umbra Mail settings", () => { if (enabled) openPanel(); else plainGmail(false); });
  GM_registerMenuCommand("Show plain Gmail in this tab", () => plainGmail(true));
  GM_registerMenuCommand("Show Umbra in this tab", () => plainGmail(false));
}

/* =================================================================== small helpers */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const visible = (el) => !!el && el.getClientRects().length > 0;
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
// (Chrome and the browsers built on it keep ⌘1–9 for their own tabs; Firefox and Zen let them through to the page)
const TABS_KEEP_NUMBERS = /Chrome\//.test(navigator.userAgent || "") && !/Firefox\//.test(navigator.userAgent || "");
const MOD_KEY = IS_MAC ? "⌘" : "Ctrl ";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return el;
}

const SVGNS = "http://www.w3.org/2000/svg";
/* one line-icon family: 24px grid, round joins, drawn with currentColor */
const ICONS = {
  back: ["M19 12H5M11 6l-6 6 6 6"],
  done: ["M5 12.5l4.5 4.5L19 7.5"],
  later: ["c:12,12,8.5", "M12 7.5V12l3 2"],
  more: ["d:6,12", "d:12,12", "d:18,12"],
  x: ["M7 7l10 10M17 7L7 17"],
  plus: ["M12 5v14", "M5 12h14"],
  min: ["M6 12h12"],
  grow: ["M14 4h6v6", "M20 4l-7 7", "M10 20H4v-6", "M4 20l7-7"],
  shrink: ["M20 4l-6 6", "M14 5v5h5", "M4 20l6-6", "M10 19v-5H5"],
  up: ["M7 14l5-5 5 5"],
  down: ["M7 10l5 5 5-5"],
  sun: ["c:12,12,4", "M12 2.5v2", "M12 19.5v2", "M4.6 4.6l1.4 1.4", "M18 18l1.4 1.4", "M2.5 12h2", "M19.5 12h2", "M4.6 19.4L6 18", "M18 6l1.4-1.4"],
  moon: ["M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"],
  send: ["M12 19V6", "M6 11.5l6-6 6 6"],
  reply: ["M10 7l-5 5 5 5", "M5 12h9a5 5 0 0 1 5 5v1"],
  replyAll: ["M12 7l-5 5 5 5", "M7.5 7l-5 5 5 5", "M7 12h8a5 5 0 0 1 5 5v1"],
  forward: ["M14 7l5 5-5 5", "M19 12h-9a5 5 0 0 0-5 5v1"],
  file: ["M7 3.5h7l4.5 4.5v12.5H7z", "M14 3.5V8h4.5"],
  image: ["r:4,5,16,14,2.5", "c:9,10,1.5", "M20 16l-4.5-4.5L7 19"],
  download: ["M12 4v11", "M7 11l5 5 5-5", "M5 20h14"],
  trash: ["M5 7h14", "M10 7V5h4v2", "M7 7l1 13h8l1-13"],
  find: ["c:11,11,6.5", "M20 20l-4.2-4.2"],
  menu: ["M4.5 7h15", "M4.5 12h15", "M4.5 17h15"],
  write: ["M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z", "M13.5 8.5l2 2"],
  react: ["c:12,12,8.5", "M8.6 14.2a4.2 4.2 0 0 0 6.8 0", "f:9.4,10,1", "f:14.6,10,1"],
  clip: ["M20.5 11.5l-8.2 8.2a5.2 5.2 0 0 1-7.4-7.4l8.6-8.6a3.5 3.5 0 0 1 4.9 4.9l-8.6 8.6a1.75 1.75 0 0 1-2.5-2.5l7.9-7.9"],
  spark: ["M12 3.5l1.7 4.6a2 2 0 0 0 1.2 1.2l4.6 1.7-4.6 1.7a2 2 0 0 0-1.2 1.2L12 18.5l-1.7-4.6a2 2 0 0 0-1.2-1.2L4.5 11l4.6-1.7a2 2 0 0 0 1.2-1.2z", "M19 3v3", "M20.5 4.5h-3"],
  /* sidebar */
  everything: ["M12 3.5l8.5 4.25L12 12 3.5 7.75z", "M3.5 12L12 16.25 20.5 12", "M3.5 16.25L12 20.5l8.5-4.25"],
  inbox: ["M3.5 13h4.75l1.5 2.5h4.5l1.5-2.5h4.75", "M6.2 5.5h11.6l2.7 7.5v4.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V13z"],
  promos: ["M12.6 3.5H19a1.5 1.5 0 0 1 1.5 1.5v6.4a1.5 1.5 0 0 1-.44 1.06l-7.6 7.6a1.5 1.5 0 0 1-2.12 0l-6.4-6.4a1.5 1.5 0 0 1 0-2.12l7.6-7.6a1.5 1.5 0 0 1 1.06-.44z", "f:16.25,7.75,1.25"],
  social: ["c:9,8.5,3.25", "M3 19.5a6 6 0 0 1 12 0", "M15.5 5.6a3.25 3.25 0 0 1 0 5.8", "M18 14.2a6 6 0 0 1 3 5.3"],
  updates: ["M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z", "M10.3 21a2 2 0 0 0 3.4 0"],
  todos: ["M4 7l1.75 1.75L9 5.5", "M4 15l1.75 1.75L9 13.5", "M12.5 7.5h7.5", "M12.5 15.5h7.5"],
  starred: ["M12 3.8l2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.6l-5 2.65.95-5.6L3.9 9.7l5.6-.8z"],
  drafts: ["M13 20h7", "M16.6 4.4a2 2 0 0 1 2.9 2.9L8.6 18.2l-3.9 1.1 1.1-3.9z"],
  sent: ["M20.5 3.5L10.6 13.4", "M20.5 3.5l-6.2 17-3.7-7.1-7.1-3.7z"],
  allmail: ["r:3.5,5.5,17,13,2", "M4 7.5l8 5.5 8-5.5"],
  unread: ["M20 11.5v6a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-10A1.5 1.5 0 0 1 5.5 6H14", "M4.5 7l7.5 5.5 3.2-2.35", "f:18.5,6.5,2.5"],
  today: ["r:4,5.5,16,14.5,2", "M4 10h16", "M8.5 3.5v4", "M15.5 3.5v4"],
  filter: ["M4 5.5h16l-6.2 7.4v5.6l-3.6 1.5v-7.1z"],
  mailopen: ["M3.5 10.2L12 4.5l8.5 5.7v8.3a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z", "M4 10.5l8 5.5 8-5.5"],
  ai: ["M5.5 18.5L4 21l3.2-1.2A8.5 8.5 0 1 0 5.5 18.5z", "f:8.5,12,1.1", "f:12,12,1.1", "f:15.5,12,1.1"],
  keys: ["r:3,6,18,12,2", "M7 10h.01", "M11 10h.01", "M15 10h.01", "M8 14h8"],
  archive: ["r:3,4,18,4.5,1.25", "M5 8.5v9.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5", "M10 12.5h4"],
  labels: ["M4 4.5h7l8.5 8.5-7 7L4 11.5z", "f:8,8.5,1.25"],
  settings: ["M4 7h9", "M17 7h3", "c:15,7,2", "M4 17h3", "M11 17h9", "c:9,17,2"],
  /* settings pages */
  display: ["r:3.5,4.5,17,15,2.5", "M3.5 9h17", "M9 9v10.5"],
  colors: ["M12 3.5a8.5 8.5 0 0 0 0 17c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.45-1.15-.3-.35-.45-.75-.45-1.2 0-.95.75-1.6 1.7-1.6h1.9a4.2 4.2 0 0 0 4.2-4.2c0-4.1-3.8-7.25-8.5-7.25z", "f:7.6,11.5,1.2", "f:10,7.4,1.2", "f:14.5,7.6,1.2"],
  people: ["c:12,8.5,3.75", "M5 20a7 7 0 0 1 14 0"],
  cap: ["M2.5 9L12 4.5 21.5 9 12 13.5z", "M6.5 11.2v4.3c1.5 1.5 3.4 2.3 5.5 2.3s4-.8 5.5-2.3v-4.3", "M21.5 9v5"],
  code: ["M8.5 7.5L4 12l4.5 4.5", "M15.5 7.5L20 12l-4.5 4.5", "M13.5 5l-3 14"],
  coin: ["c:12,12,8.5", "M14.5 9.3c-.5-.9-1.4-1.4-2.6-1.4-1.5 0-2.6.8-2.6 1.9 0 2.8 5.6 1.5 5.6 4.4 0 1.2-1.2 2.1-2.9 2.1-1.2 0-2.2-.5-2.8-1.4", "M12 6.3v1.6", "M12 16.3v1.4"],
  box: ["M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4z", "M3.5 7.5L12 11.5l8.5-4", "M12 11.5v9"],
  plane: ["M3 13.5l3.2 1 3-3L4 7.8l1.6-1.6 7 2.3 3.6-3.6a1.9 1.9 0 0 1 2.7 2.7l-3.6 3.6 2.3 7-1.6 1.6-3.7-5.2-3 3 1 3.2-1.2 1.2-2-3.6-3.6-2z"],
  shield: ["M12 3.5l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6.5z", "M9 12l2.2 2.2L15.5 10"],
  paper: ["r:4.5,4.5,15,15,2", "M8 9h8", "M8 12.5h8", "M8 16h5"],
};
function icon(name) {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", name === "more" ? "qm-svg qm-solid" : "qm-svg");
  for (const d of ICONS[name] || []) {
    let el;
    const n = d.slice(2).split(",");
    const circle = (r, fill) => { el = document.createElementNS(SVGNS, "circle"); el.setAttribute("cx", n[0]); el.setAttribute("cy", n[1]); el.setAttribute("r", r); if (fill) el.setAttribute("class", "qm-fill"); };
    if (d.startsWith("c:")) circle(n[2]);
    else if (d.startsWith("d:")) circle("1.5");
    else if (d.startsWith("f:")) circle(n[2], true);
    else if (d.startsWith("r:")) { el = document.createElementNS(SVGNS, "rect"); el.setAttribute("x", n[0]); el.setAttribute("y", n[1]); el.setAttribute("width", n[2]); el.setAttribute("height", n[3]); el.setAttribute("rx", n[4]); }
    else { el = document.createElementNS(SVGNS, "path"); el.setAttribute("d", d); }
    svg.appendChild(el);
  }
  return svg;
}
const withKey = (label, id) => { const k = keyLabel(keyFor(id)); return k ? label + " (" + k + ")" : label; };
const ib = (name, label, onclick, extra = "") => h("button", { type: "button", class: "qm-ib " + extra, "aria-label": label, title: label, onclick }, icon(name));

/* Gmail reacts to real mouse sequences. No `view` here: in Firefox, Umbra runs in a sandbox
   and passing its window to MouseEvent throws, which is why buttons "did nothing". */
function mouseEvent(el, type, o) {
  // an element in one of Everything's frames gets an event made by its own window
  const W = el.ownerDocument !== document && el.ownerDocument.defaultView;
  if (W && W.MouseEvent) { try { return new W.MouseEvent(type, o); } catch (e) { /* use this window's */ } }
  return new MouseEvent(type, o);
}
function press(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
  try {
    for (const t of ["mouseover", "mousedown", "mouseup", "click"]) el.dispatchEvent(mouseEvent(el, t, o));
  } catch (e) {
    try { el.click(); } catch (err) { return false; }
  }
  return true;
}
function key(k, target = document.activeElement || document.body) {
  const code = k === "Escape" ? 27 : k.toUpperCase().charCodeAt(0);
  for (const t of ["keydown", "keyup"]) target.dispatchEvent(new KeyboardEvent(t, { key: k, code: k === "Escape" ? "Escape" : "Key" + k.toUpperCase(), keyCode: code, which: code, bubbles: true, cancelable: true }));
}

const EMAIL_RE = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;
const EMAIL_RE_ALL = new RegExp(EMAIL_RE.source, "g");
// Gmail's own title for the tab (the tab itself may show a calmer one: Settings › Calm)
let rawTitle = document.title;
/* while Umbra looks at another of Gmail's pages out of sight (your to-dos, a search for the AI), the tab keeps the
   title of the page you're on; returns the way to let go */
function holdTitle() {
  const keep = document.title, el = document.querySelector("title");
  if (!el) return () => {};
  const mo = new MutationObserver(() => { if (document.title !== keep) document.title = keep; });
  mo.observe(el, { childList: true, characterData: true, subtree: true });
  return () => setTimeout(() => mo.disconnect(), 400); // (Gmail sets its title again as it gets back)
}
const gmailTitle = () => (calmTitle.mine && document.title === calmTitle.mine ? rawTitle : document.title);
const accountEmail = () => {
  // (Gmail's title is "Subject - you@example.com - Gmail": the last address in it is yours, whatever the subject holds)
  const all = [...gmailTitle().matchAll(EMAIL_RE_ALL)];
  const m = all[all.length - 1];
  if (m) return m[1].toLowerCase();
  const a = (typeof accounts !== "undefined" ? accounts : []).find((x) => x.index === accountIndex());
  return a ? a.email : "";
};
const accountIndex = () => { const m = location.pathname.match(/\/mail\/u\/(\d+)/); return m ? Number(m[1]) : 0; };
function hashString(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); }
const hashNow = () => (location.hash || "#inbox").split("?")[0];
/* Gmail shows one page at a time, and now and then Umbra borrows it out of sight for a moment (to act on a conversation
   Gmail's page doesn't have, or to read a folder). Where you ask to go meanwhile is drawn at once from what Umbra
   knows, and Gmail goes there the moment it's back, so what Umbra was doing for you isn't cut short either. */
let waitingGo = "";
const looking = () => ghost || peeking || aiPeeking > 0;
const go = (hash) => {
  if (looking()) { waitingGo = hash; peekAbort = true; invalidate(true); return; }
  waitingGo = "";
  location.hash = hash;
};
/* back from a look out of sight: where you asked to go meanwhile, now */
function goWaiting() {
  const next = waitingGo;
  waitingGo = "";
  if (!next) return;
  if (opening) opening.at = Date.now(); // (what you opened is being opened now: its wait starts now)
  if (hashNow() !== next.split("?")[0]) location.hash = next;
}
/* a conversation's own action (Reply, Done, its menu, a star) while Umbra is out of sight on another conversation:
   done the moment it's back, on this one (Gmail's buttons are this conversation's again by then) */
const afterLook = () => until(() => !looking() && !waitingGo, 15000, 40);
let ghostFn = false; // (Umbra's own action on a conversation it opened out of sight is running: that one goes ahead)
const lookBusy = () => (looking() || !!waitingGo) && !ghostFn;
function onThisThread(fn) {
  if (!lookBusy()) return fn();
  const key = screen.key;
  return afterLook().then(() => (screen.key === key ? fn() : undefined));
}

// a short note at the bottom; with `act` ({ label, run }) it carries a button (Undo) and stays a little longer,
// and as long as the pointer rests on it
function toast(msg, act, stay) {
  let t = document.getElementById("qm-toast");
  if (t) { clearTimeout(t._qmTimer); t.remove(); }
  t = h("div", { id: "qm-toast", role: "status", class: "qm-hasact" }, h("span", { text: msg }),
    act ? h("button", { type: "button", onclick: () => { out(); act.run(); } }, act.label) : null,
    h("button", { type: "button", class: "qm-gx", "aria-label": "Dismiss", title: "Dismiss", onclick: () => out() }, icon("x")));
  const out = () => { clearTimeout(t._qmTimer); if (!t.isConnected) return; t.classList.add("qm-out"); setTimeout(() => t.remove(), 220); };
  const later = () => { clearTimeout(t._qmTimer); if (!stay) t._qmTimer = setTimeout(out, Math.min(10000, (act ? 6000 : 2400) + Math.max(0, String(msg).length - 40) * 45)); };
  t.addEventListener("pointerenter", () => clearTimeout(t._qmTimer));
  // Gmail's own note is up (mirrored): this one sits just above it rather than on top of it
  const g = document.getElementById("qm-gtoast");
  if (g && !g.classList.contains("qm-out")) t.classList.add("qm-above");
  t.addEventListener("pointerleave", later);
  document.body.appendChild(t);
  later();
}

/* =================================================================== AI, all in the browser
   Every AI request is answered right here (parts/40-direct-ai.js): your ChatGPT plan, your own key
   (Gemini, OpenAI, Anthropic), or Chrome's on-device model. Nothing outside the browser is involved.
   helper(path, body) is the one way in (its paths are those of the helper app Umbra once had). */
let ai = { reachable: false, ready: false };
const IN_EXTENSION = typeof globalThis.UMBRA_EXTENSION !== "undefined";
// (the extension was updated or turned off under this tab: this copy can't save anything any more, so it steps
// aside completely, Gmail as Gmail draws it, and says how to get it back)
window.addEventListener("umbra:stale", () => plainGmail(true, "stale"));
function helper(path, body, timeout = 120000) {
  // (AI off: nothing of your mail goes anywhere, whichever part of Umbra asks, even one that asked before it was turned off;
  // setting up — a key, ChatGPT's sign-in — sends none of it)
  if (!aiOn() && !/^\/(status|config|chatgpt)\b/.test(path)) return Promise.reject(new Error("AI is off in Umbra's settings."));
  return directHelper(path, body, timeout);
}
/* What the AI last said about the Studio flow is kept, so Gemini's notes never vanish if a check fails for a
   moment, and it's asked again soon (then less often) */
let flowSaved = store.get("gem:flow", null), aiMiss = 0, aiRetry = 0;
async function refreshAI(models) {
  if (!aiOn()) { ai = { reachable: false, ready: false, off: true }; return ai; }
  const was = ai;
  try {
    ai = Object.assign({ reachable: true }, await helper("/status" + (models ? "?models=1" : ""), null, models ? 25000 : 6000));
    aiMiss = 0;
    if (!aiOn()) { ai = { reachable: false, ready: false, off: true }; return ai; } // (turned off while it asked)
    if (ai.flow && ai.flow.sheet && JSON.stringify(ai.flow) !== JSON.stringify(flowSaved)) { flowSaved = ai.flow; store.set("gem:flow", ai.flow); }
    else if (ai.flow && !ai.flow.sheet && flowSaved) { flowSaved = null; store.set("gem:flow", null); } // disconnected on purpose
  } catch (e) {
    ai = { reachable: false, ready: false, flow: (was && was.flow) || flowSaved || undefined };
    clearTimeout(aiRetry);
    aiRetry = setTimeout(() => refreshAI(false).then((x) => { if (x.reachable) { invalidate(true); gemFetch(false); } }), Math.min(300000, 10000 * 2 ** aiMiss++));
  }
  return ai;
}
const aiCache = new Map(Object.entries(store.get("ai-cache", {})));
function remember(k, v) {
  aiCache.delete(k); // (newest last: the oldest are the ones let go)
  aiCache.set(k, v);
  while (aiCache.size > 300) aiCache.delete(aiCache.keys().next().value);
  // what another tab wrote meanwhile is kept too (each tab writing only its own would lose the other's)
  const all = Object.assign({}, store.get("ai-cache", {}));
  for (const [x, y] of aiCache) { delete all[x]; all[x] = y; }
  store.set("ai-cache", Object.fromEntries(Object.entries(all).slice(-120)));
}
const pendingAI = new Set();
const failedAI = new Map(); // failures are kept in memory only and retried after a while
const aiWhy = new Map(); // what the provider said when it failed (shown where the answer would be)
function ask(k, payload, onDone) {
  if (!aiOn()) return null;
  if (aiCache.has(k)) return aiCache.get(k);
  if (Date.now() - (failedAI.get(k) || 0) < 5 * 60 * 1000) return null;
  if (!ai.ready) return null;
  if (pendingAI.has(k)) return undefined;
  pendingAI.add(k);
  countAI();
  helper("/summarize", payload)
    .then((res) => { remember(k, res); })
    .catch((e) => { failedAI.set(k, Date.now()); aiWhy.set(k, (e && e.message) || "The AI didn't answer."); while (failedAI.size > 300) { const old = failedAI.keys().next().value; failedAI.delete(old); aiWhy.delete(old); } })
    .finally(() => { pendingAI.delete(k); onDone(); });
  return undefined;
}
const dismissed = new Set(store.get("dismissed2", []));
function dismiss(k) {
  dismissed.add(k);
  // (what another tab dismissed meanwhile stays dismissed too)
  for (const x of store.get("dismissed2", []) || []) dismissed.add(x);
  store.set("dismissed2", Array.from(dismissed).slice(-500));
}
/* a dismissed line folds shut and is gone: no blank space left where it was (nor around a list of none) */
function collapseAway(el, after) {
  const st = el.style;
  st.maxHeight = el.offsetHeight + "px";
  st.overflow = "hidden";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    st.transition = "max-height .24s var(--ease), min-height .24s var(--ease), opacity .16s var(--ease), margin .24s var(--ease), padding .24s var(--ease)";
    st.maxHeight = "0px";
    st.minHeight = "0px";
    st.opacity = "0";
    st.marginTop = st.marginBottom = st.paddingTop = st.paddingBottom = "0px";
  }));
  setTimeout(() => { el.remove(); if (after) after(); }, 270);
}

/* =================================================================== mail for the AI
   What the assistant reads, without touching what's on screen: any conversation, in any signed-in
   account, comes from Gmail's print view (one quick fetch); searches run in Gmail itself (here, out of
   sight, or in that account's tab). Text only: reply quotes, styling and links are left out. */
let htmlPolicy = null;
function parseHTML(html) {
  try {
    if (window.trustedTypes && !htmlPolicy) htmlPolicy = window.trustedTypes.createPolicy("umbra-read", { createHTML: (x) => x });
  } catch (e) { /* the page allows no new policies: the plain parser below */ }
  try { return new DOMParser().parseFromString(htmlPolicy ? htmlPolicy.createHTML(html) : html, "text/html"); } catch (e) { return null; }
}
const BLOCK = /^(P|DIV|TR|LI|H[1-6]|TABLE|TBODY|BLOCKQUOTE|UL|OL|PRE|HR|SECTION|ARTICLE|HEADER|FOOTER|CENTER|DL|DT|DD)$/;
function plainText(root) {
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) { out.push(n.nodeValue.replace(/\s+/g, " ")); return; }
    if (n.nodeType !== 1 || /^(STYLE|SCRIPT|HEAD|TITLE|META|NOSCRIPT|SVG)$/i.test(n.tagName)) return;
    const tag = n.tagName.toUpperCase();
    if (tag === "BR") { out.push("\n"); return; }
    if (tag === "IMG") return; // pictures' alt text is mostly "Ad", "Logo", "Listen": noise
    const block = BLOCK.test(tag);
    if (block) out.push("\n");
    if (tag === "LI") out.push("- ");
    for (const c of n.childNodes) walk(c);
    if (tag === "TD" || tag === "TH") out.push("  ");
    if (block) out.push("\n");
  };
  walk(root);
  return out.join("").replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
/* earlier replies quoted under a message: Gmail's own quotes, other apps' ("On … wrote:" outside the
   quote, Outlook's From/Sent block) and plain text pasted below. Marked, so a conversation folds them
   away and the AI skips them. Forwarded mail IS the content: left alone. */
const QUOTE_SEL = ".gmail_quote, .gmail_quote_container, blockquote[type=cite], #divRplyFwdMsg, #appendonsend, .yahoo_quoted, .moz-cite-prefix";
const ATTR_END = /(wrote|writes|a écrit|schrieb|escribió|ha scritto|escreveu|schreef|skrev|napisał|написал|写道|寫道)\s*:?\s*$/i;
const ATTR_LINE = /^\s*(On|Le|Am|El|Il|Em|Op|Den|W dniu)\s[^\n]{4,300}?(wrote|a écrit|schrieb|escribió|ha scritto|escreveu|schreef|skrev|napisał)\s*:\s*$/i;
const OUTLOOK_LINE = /^\s*(-{3,}\s*Original Message\s*-{3,}|_{12,})\s*$/i;
function markQuotes(root) {
  const doc = root.ownerDocument;
  const mark = (n) => {
    if (n.nodeType === 1) { n.classList.add("qm-quote"); return n; }
    if (n.nodeType !== 3 || !n.parentNode) return n;
    const s = doc.createElement("span");
    s.className = "qm-quote";
    n.parentNode.insertBefore(s, n);
    s.appendChild(n);
    return s;
  };
  const blank = (n) => (n.nodeType === 3 && !n.nodeValue.trim()) || n.nodeName === "BR";
  const forwarded = (q) => /forwarded message|begin forwarded|subject:\s*(fw|fwd|tr|wg)\s*:/i.test((q.querySelector(".gmail_attr") || q).textContent.slice(0, 600));
  let found = false;
  for (const q of root.querySelectorAll(QUOTE_SEL)) {
    if (q.closest(".qm-quote") || forwarded(q)) continue;
    found = true;
    const outlook = q.id === "divRplyFwdMsg" || q.id === "appendonsend";
    mark(q);
    // Outlook: the rest of the message after its header is the quote, and a rule comes just before it
    if (outlook) for (let n = q.nextSibling; n; n = n.nextSibling) if (n.nodeType === 1 || (n.nodeType === 3 && n.nodeValue.trim())) n = mark(n);
    let n = q.previousSibling;
    const gap = [];
    while (n && blank(n)) { gap.push(n); n = n.previousSibling; }
    // the "On …, someone wrote:" line just above it (its own block, or loose text and a link)
    const line = [];
    if (n && n.nodeType === 1 && BLOCK.test(n.tagName)) {
      if ((outlook && n.tagName === "HR") || (n.textContent.length < 400 && ATTR_END.test(n.textContent.trim()))) line.push(n);
    } else {
      let k = n;
      const parts = [];
      while (k && k.nodeName !== "BR" && !(k.nodeType === 1 && BLOCK.test(k.tagName))) { parts.push(k); k = k.previousSibling; }
      const txt = parts.map((x) => x.textContent).reverse().join("");
      if (txt.length < 400 && ATTR_END.test(txt.trim())) line.push(...parts);
    }
    if (line.length) for (const x of [...gap, ...line]) mark(x);
  }
  // plain text: everything from an "On … wrote:" (or Outlook's divider) line to the end
  if (!found) {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (t.parentElement && t.parentElement.closest("a, .qm-quote")) continue;
      let at = -1;
      let txt = t.nodeValue;
      // the line may run on into a link and the text after it, up to the next break
      for (let k = t.nextSibling, i = 0; k && i < 4 && k.nodeName !== "BR" && !(k.nodeType === 1 && BLOCK.test(k.tagName)); k = k.nextSibling, i++) txt += k.textContent;
      const first = txt.split("\n").find((l) => l.trim()) || "";
      if (ATTR_LINE.test(first) || OUTLOOK_LINE.test(first)) at = t.nodeValue.indexOf(first.trim().slice(0, 8));
      if (at < 0 || forwarded({ textContent: txt, querySelector: () => null })) continue;
      if (!root.textContent.slice(0, root.textContent.indexOf(t.nodeValue)).trim()) break; // nothing of its own above: not a reply
      const range = doc.createRange();
      range.setStart(t, at);
      range.setEndAfter(root.lastChild);
      const wrap = doc.createElement("div");
      wrap.className = "qm-quote";
      wrap.appendChild(range.extractContents());
      root.appendChild(wrap);
      found = true;
      break;
    }
  }
  // a wrapper left holding only folded parts (and line breaks) folds too, with the breaks just above it
  for (const q of [...root.querySelectorAll(".qm-quote")]) {
    let p = q.parentElement;
    while (p && p !== root && !p.classList.contains("qm-quote") && [...p.childNodes].every((c) => blank(c) || (c.nodeType === 1 && c.classList.contains("qm-quote")))) { p.classList.add("qm-quote"); p = p.parentElement; }
  }
  for (const q of root.querySelectorAll(".qm-quote")) {
    if (q.parentElement && q.parentElement.closest(".qm-quote")) continue;
    for (let n = q.previousSibling; n && blank(n); n = n.previousSibling) if (n.nodeType === 1) n.classList.add("qm-quote");
  }
  return found;
}
function dropQuotes(body) {
  markQuotes(body);
  for (const q of [...body.querySelectorAll(".qm-quote")]) if (q.isConnected) q.remove();
}
// a web address in the text is mostly tokens: its site says enough
const shortLinks = (t) => t.replace(/\bhttps?:\/\/(?:www\.)?([^\/\s?#)\]>"']+)[^\s)\]>"']*/gi, "[link: $1]");
const people = (s) => {
  const out = [];
  for (const m of String(s || "").matchAll(/(?:"?([^",<]*?)"?\s*)?<([^>\s]+@[^>\s]+)>|([^\s,<>]+@[^\s,<>]+)/g)) out.push([(m[1] || "").trim(), (m[2] || m[3] || "").toLowerCase()]);
  return out;
};
/* a conversation's print view (its permanent address: a received one's from its id, one you started from its row) */
function printPath(acctIndex, id) {
  const a = (typeof accounts !== "undefined" ? accounts : []).find((x) => x.index === acctIndex);
  const perm = permIds.get((a ? a.email : accountEmail()) + ":" + id);
  if (perm) return `/mail/u/${acctIndex}/?view=pt&search=all&permthid=${encodeURIComponent(perm)}`;
  const dec = (() => { try { return BigInt("0x" + id).toString(); } catch (e) { return ""; } })();
  return `/mail/u/${acctIndex}/?view=pt&search=all&${dec ? "permthid=thread-f:" + dec : "th=" + id}`;
}
/* one conversation, as plain messages */
async function readMailThread(acctIndex, id) {
  const html = await getText(printPath(acctIndex, id));
  const doc = parseHTML(html);
  if (!doc) return readMailLoose(html);
  const subject = text($(".maincontent table b", doc.body) || $("title", doc) || doc.body).replace(/^Gmail - /, "");
  const messages = $$("table.message", doc.body).map((t) => {
    const rows = $$(":scope > tbody > tr", t);
    const head = rows[0] ? $$(":scope > td", rows[0]) : [];
    const fromLine = head[0] ? head[0].textContent.replace(/\s+/g, " ").trim() : "";
    const [who] = people(fromLine);
    const rec = {};
    for (const d of $$(".recipient div", t)) { const m = d.textContent.match(/^\s*(To|Cc|Bcc):\s*(.*)$/is); if (m) rec[m[1].toLowerCase()] = people(m[2]); }
    const body = rows.length > 2 ? rows[rows.length - 1] : rows[1];
    const files = [];
    if (body) {
      for (const a of $$("a[href*='view=att'], a[href*='disp=']", body)) { const n = text(a); if (n && !/^(view|download|preview)$/i.test(n)) files.push(n.slice(0, 80)); }
      dropQuotes(body);
    }
    const txt = body ? shortLinks(plainText(body).split("\n").filter((l) => !/^>/.test(l)).join("\n")) : "";
    return { from: (who && who[0]) || fromLine.replace(/<.*$/, "").trim(), email: (who && who[1]) || "", date: head[1] ? head[1].textContent.trim() : "", to: rec.to || [], cc: rec.cc || [], text: txt.slice(0, 20000), files };
  });
  return { subject, messages };
}
/* the same, without a DOM parser (a page that refuses one): good enough text */
function readMailLoose(html) {
  const subject = ((html.match(/<title>([^<]*)<\/title>/i) || [])[1] || "").replace(/^Gmail - /, "");
  const decode = (x) => x.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&");
  const messages = html.split(/<table[^>]*class="?message"?/i).slice(1).map((chunk) => {
    const from = decode(((chunk.match(/<b>([\s\S]*?)<\/b>/i) || [])[1] || "").replace(/<[^>]+>/g, ""));
    const body = chunk.replace(/<div class="gmail_quote[\s\S]*$/i, "").replace(/<(br|\/p|\/div|\/tr|\/li)[^>]*>/gi, "\n").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
    return { from: from.trim(), email: "", date: "", to: [], cc: [], text: shortLinks(decode(body).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim()).slice(0, 20000), files: [] };
  });
  return { subject, messages };
}
/* a Gmail search on this page, out of sight; one at a time */
let searchChain = Promise.resolve();
function searchHere(query, limit = 12, raw) {
  const job = searchChain.then(async () => {
    const folder = searchHash(query);
    const back = hashNow();
    const before = listBefore();
    aiPeeking++;
    const release = holdTitle();
    try {
      location.replace(folder);
      const m = await freshList(folder, before);
      if (!m) return { error: "Gmail didn't answer" };
      await wait(80);
      const rows = readList(mainList(folder) || m).slice(0, limit);
      return { rows: raw ? rows : rows.map(aiRow), more: rows.length > 10 || !isOff(olderOf(m)) };
    } finally {
      // back where it was, unless you went somewhere yourself meanwhile
      if (hashNow() === folder && back !== folder) location.replace(back);
      release();
      if (aiPeeking <= 1 && !ghost && !peeking) goWaiting();
      setTimeout(() => { aiPeeking--; invalidate(true); }, 120);
    }
  });
  searchChain = job.catch(() => {});
  return job;
}
let aiPeeking = 0;
const aiRow = (r) => ({ id: r.id, from: r.from, date: r.whenFull || r.when, subject: r.subject, snippet: r.snippet, unread: !!r.unread, starred: !!r.starred, attach: !!r.attach, count: r.count || "" });
/* a search in another account: its tab runs it (opened in the background when there isn't one) */
async function searchThere(acct, query) {
  const folder = searchHash(query);
  if (!liveTab(acct.email)) {
    if (typeof GM_openInTab === "function") GM_openInTab(`${location.origin}/mail/u/${acct.index}/#inbox`, { active: false, insert: true });
    if (!(await until(() => liveTab(acct.email), 20000, 400))) return { error: "its Gmail tab isn't open" };
    await wait(1500);
  }
  const asked = Date.now();
  askTab({ email: acct.email, folder, pages: 1, at: asked, tab: TAB_ID });
  const box = await until(() => { const b = store.get(boxKey(acct.email, folder), null); return b && b.at >= asked ? b : null; }, 20000, 300);
  if (!box) return { error: "its tab didn't answer (it may be in use)" };
  store.set(boxKey(acct.email, folder), null); // a one-off search: don't keep it
  const rows = (box.rows || []).slice(0, 12);
  return { rows: rows.map(aiRow), more: rows.length > 10 || !box.done };
}

/* =================================================================== reading Gmail */
const gmailMain = () => $$('.bkK [role="main"]').find(visible) || null;

function route() {
  const hash = hashNow();
  const main = gmailMain();
  if (/^#(settings|contacts|chat|spaces|calls|create-filter)/.test(hash)) return { kind: "gmail", hash };
  if (!main) return { kind: "loading", hash };
  if ($("h2.hP", main)) return { kind: "thread", hash, main };
  if (hash === "#aiinbox") return { kind: "todos", hash, main };
  if (hash === "#sub") return { kind: "subs", hash, main };
  if (/^#search\//.test(hash) && isFilesQuery(currentQuery(hash)) && $('[gh="tl"]', main)) return { kind: "files", hash, main };
  if ($('[gh="tl"]', main)) return { kind: hash.startsWith("#search/") || hash.startsWith("#advanced-search") ? "search" : "list", hash, main };
  return { kind: "gmail", hash, main };
}

const FOLDER_NAMES = { "#sub": "Senders", "#inbox": "", "#starred": "Starred", "#snoozed": "Later", "#sent": "Sent", "#drafts": "Drafts", "#all": "All mail", "#imp": "Important", "#scheduled": "Scheduled", "#spam": "Spam", "#trash": "Trash", "#category/promotions": "Promotions", "#category/social": "Social", "#category/updates": "Updates", "#category/forums": "Forums" };
const DONE_HASH = "#search/" + encodeURIComponent("-in:inbox -in:sent -in:draft -in:spam -in:trash").replace(/%20/g, "+");
function folderTitle(hash) {
  const base = hash.replace(/\/p\d+$/, "");
  if (base in FOLDER_NAMES) return FOLDER_NAMES[base];
  if (base === DONE_HASH) return "Done";
  const m = base.match(/^#label\/(.+)$/);
  if (m) { try { return decodeURIComponent(m[1].replace(/\+/g, " ")).split("/").pop(); } catch (e) { return m[1]; } }
  return "";
}

function readRows(main) {
  return $$("tr.zA", main).filter(visible).map((row, i) => {
    const people = $$(".yW [email]", row).map((s) => ({ email: (s.getAttribute("email") || "").toLowerCase(), name: s.getAttribute("name") || text(s), short: text(s) })).filter((p) => p.email);
    const emails = people.map((p) => p.email);
    const yw = $(".yW", row);
    const countEl = $(".bx0", row);
    let from = people.length ? people.map((p) => p.short || p.name).join(", ") : text(yw);
    if (yw && /^to:/i.test(text(yw))) from = "To: " + from.replace(/^to:\s*/i, "");
    const idEl = $("[data-legacy-thread-id]", row);
    const permEl = $("[data-thread-id]", row);
    if (idEl && permEl) notePerm(idEl.getAttribute("data-legacy-thread-id"), permEl.getAttribute("data-thread-id"));
    const lastEl = $("[data-legacy-last-message-id]", row);
    const imp = $(".pG", row);
    const timeEl = $(".xW span[title], .xW [title]", row);
    const draft = $(".boq", row);
    return {
      i, row, emails, people,
      id: idEl ? idEl.getAttribute("data-legacy-thread-id") : "r" + i,
      lastMsg: lastEl ? lastEl.getAttribute("data-legacy-last-message-id") || "" : "",
      from: from.replace(/\s*\(\d+\)$/, ""),
      count: countEl ? text(countEl) : "",
      subject: text($(".bog", row)) || "(no subject)",
      snippet: text($(".y2", row)).replace(/^[-–—]\s*/, "").slice(0, 240),
      when: text(timeEl) || text($(".xW", row)),
      whenFull: timeEl ? timeEl.getAttribute("title") || "" : "",
      unread: row.classList.contains("zE"),
      picked: row.classList.contains("x7"),
      draft: draft ? text(draft) : "",
      important: !!(imp && /^important/i.test(imp.getAttribute("aria-label") || "")),
      starred: !!$(".T-KT.T-KT-Jp", row) || !!$('.T-KT[aria-label="Starred" i]', row),
      attach: !!$('[aria-label="Has attachment" i], .brc', row),
      files: $$(".brc", row).map((c) => (c.getAttribute("title") || text(c)).trim()).filter(Boolean).slice(0, 6),
    };
  });
}
const listEmpty = (main) => !!$('[gh="tl"] .TC', main) && !$$("tr.zA", main).some(visible);

function readThread(main) {
  const subjectEl = $("h2.hP", main);
  const me = accountEmail();
  // (a message is one of Gmail's own list items: not one inside an email's words or its files)
  const items = $$('[role="listitem"]', main).filter((it) => it.closest('[role="list"]') && visible(it) && !it.closest(".a3s, .aQH, .hq") && !(it.parentElement && it.parentElement.closest('[role="listitem"]')));
  const messages = items.map((item, i) => {
    const collapsed = item.getAttribute("aria-expanded") === "false";
    const g = $(".gD[email], .gD", item);
    const email = g ? (g.getAttribute("email") || "").toLowerCase() : "";
    const name = g ? (g.getAttribute("name") || text(g)) : "";
    const dateEl = $(".g3[title], .g3", item);
    const body = $(".a3s", item);
    const files = $$(".hq .aZo, .aQH .aZo", item).map(readCard);
    const idEl = $("[data-message-id], [data-legacy-message-id]", item);
    // the sender's Google photo, kept for the lists
    const av = $(".aCi img.ajn, img.ajn", item);
    const src = av && av.src || "";
    if (email && /googleusercontent\.com\//.test(src) && !BLANK_PHOTO.test(src)) {
      const big = /=s\d+/.test(src) ? src.replace(/=s\d+[^/]*$/, "=s96-c") : src;
      if (photos.get(email) !== big) { photos.set(email, big); savePeopleSoon(); }
    }
    notePerson(email, name);
    return {
      i, item, collapsed, name, email,
      mine: !!(email && me && email === me),
      id: idEl ? (idEl.getAttribute("data-legacy-message-id") || idEl.getAttribute("data-message-id")) : "m" + i,
      date: dateEl ? shortDate(dateEl.getAttribute("title") || text(dateEl)) : "",
      body,
      snippet: collapsed ? text($(".iA, .g6", item)) || text($(".iB", item)) : "",
      files,
      reacts: readReacts(item),
      to: $$(".hb [email], .g2[email]", item).map((x) => ({ email: (x.getAttribute("email") || "").toLowerCase(), name: x.getAttribute("name") || text(x) })).filter((x) => x.email && x.email !== me),
    };
  });
  // everyone in a conversation you've written in is a person
  if (messages.some((m) => m.mine)) for (const m of messages) if (!m.mine) notePerson(m.email, m.name, true);
  return {
    subject: subjectEl ? text(subjectEl) : "",
    id: subjectEl ? subjectEl.getAttribute("data-legacy-thread-id") || text(subjectEl) : "",
    messages,
    older: $(".kQ", main),
    labels: [...new Set($$(".ahR .hN, .hO .hN", main).map((x) => text(x)).filter((l) => l && !/^(inbox|important|unread)$/i.test(l)))].slice(0, 4),
    unsub: $$(".Ca", main).find((x) => /unsubscribe/i.test(text(x))) || null,
  };
}

/* One of Gmail's attachment cards: the file's name, kind, address and pictures. Gmail used to write the first three
   into the card's download_url ("image/png:name.png:https://…"); now the card's own link has the address, its icon
   says the kind, and its picture is the thumbnail. Both are read, the newer way first. */
const MIMES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", heic: "image/heic", heif: "image/heif", bmp: "image/bmp", svg: "image/svg+xml", tif: "image/tiff", tiff: "image/tiff",
  pdf: "application/pdf", txt: "text/plain", csv: "text/csv", ics: "text/calendar", html: "text/html", htm: "text/html", json: "application/json",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", aac: "audio/aac", flac: "audio/flac", mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", zip: "application/zip" };
const mimeOfName = (name) => MIMES[((String(name).match(/\.([a-z0-9]{1,5})$/i) || [])[1] || "").toLowerCase()] || "";
function readCard(card) {
  let mime = "", name = "", url = "";
  // (the old way: the address is everything from "https:" on, so a name with a colon in it can't break it)
  const du = card.getAttribute("download_url") || "";
  const at = du.indexOf(":https://");
  if (at > 0) {
    url = du.slice(at + 1);
    const head = du.slice(0, at), c = head.indexOf(":");
    mime = c >= 0 ? head.slice(0, c) : "";
    name = c >= 0 ? head.slice(c + 1) : head;
    try { name = decodeURIComponent(name); } catch (e) { /* a name with a bare % in it: as it is */ }
  }
  name = text($(".aV3", card)) || name || "Attachment";
  // the card's own link (Download, or the file itself): view=att with the file's attid
  const link = $$("a[href]", card).map((a) => { try { return new URL(a.getAttribute("href"), location.href); } catch (e) { return null; } })
    .find((u) => u && u.origin === location.origin && u.searchParams.get("view") === "att" && u.searchParams.has("attid"));
  if (link) url = link.toString();
  if (!mime) {
    const icoEl = $("img.aSM", card);
    const ico = icoEl ? icoEl.getAttribute("src") || "" : "";
    const typed = /\/type\/([\w.+-]+\/[\w.+-]+)/.exec(ico);
    mime = mimeOfName(name) || (typed && !/octet-stream/.test(typed[1]) ? typed[1] : "") || (/_image_/.test(ico) ? "image/*" : /_pdf_/.test(ico) ? "application/pdf" : /_video_/.test(ico) ? "video/*" : /_audio_/.test(ico) ? "audio/*" : "");
  }
  // its picture: the thumbnail Gmail drew (an empty src isn't one: it would read as this page's own address)
  const pic = $("img.aQG", card);
  const raw = pic ? pic.getAttribute("src") || "" : "";
  let src = "";
  if (raw && !/^data:/.test(raw)) { try { src = new URL(raw, location.href).toString(); } catch (e) { src = ""; } }
  // pictures show as themselves; documents (PDFs, Docs, Word…) by the first-page preview Gmail made
  const image = /^image\//.test(mime);
  return { card, mime, name, url, thumb: src && image ? src : "", preview: src && !image ? src : "" };
}

/* Gmail's emoji reactions under a message: one chip per emoji, with a count */
function readReacts(item) {
  return $$("button.AeBiU-I", item).filter((b) => !/^add reaction/i.test(b.getAttribute("aria-label") || "")).map((b, i) => {
    const img = $("img", b);
    const label = b.getAttribute("aria-label") || "";
    return { i, emoji: (img && img.getAttribute("alt")) || label.split(" ")[0] || "", count: Number(text($(".AeBiU-anl", b))) || 1, mine: /you reacted/i.test(label), label };
  }).filter((x) => x.emoji);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function shortDate(title) {
  const m = String(title).replace(/ /g, " ").match(/([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2})\s?([AP]M)?/);
  if (!m) return String(title).replace(/\s*\(.*\)\s*$/, "");
  let hr = Number(m[4]);
  if (m[6] === "PM" && hr < 12) hr += 12;
  if (m[6] === "AM" && hr === 12) hr = 0;
  const d = new Date(Number(m[3]), MONTHS.indexOf(m[1]), Number(m[2]), hr, Number(m[5]));
  if (isNaN(d)) return title;
  const now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  const time = m[6] ? `${Number(m[4])}:${m[5]} ${m[6]}` : `${m[4]}:${m[5]}`;
  if (diff === 0) return time;
  if (diff === 1) return "Yesterday, " + time;
  if (diff > 1 && diff < 7) return DAYS[d.getDay()] + ", " + time;
  if (d.getFullYear() === now.getFullYear()) return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${time}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function isRich(body) {
  const tables = body.getElementsByTagName("table").length;
  const styledBg = body.querySelector('[bgcolor]:not([bgcolor="#ffffff" i]):not([bgcolor="white" i]):not([bgcolor="#fff" i]), [style*="background-color" i], [style*="background:" i], [style*="background-image" i], [background]');
  const wide = body.querySelector('table[width="600"], table[width="640"], table[width="650"], table[width="700"], table[style*="width:600" i], table[style*="width: 600" i], table[style*="max-width:600" i], table[style*="max-width: 600" i], table[align="center"]');
  const images = body.querySelectorAll("img[width], img[height]").length;
  return tables >= 3 || !!wide || (!!styledBg && tables >= 1) || images >= 3;
}
/* a designed email that's dark already (its own black or deep background): darkening would turn it light, so it's
   shown as it is. Its background is the first one it paints over a good part of itself. */
const NAMED_BG = { black: "0,0,0", white: "255,255,255", navy: "0,0,128", darkblue: "0,0,139", midnightblue: "25,25,112", darkslategray: "47,79,79", dimgray: "105,105,105", gray: "128,128,128" };
function bgRgb(el) {
  const raw = (el.getAttribute("bgcolor") || "").trim() || ((/background(?:-color)?\s*:\s*([^;!]+)/i.exec(el.getAttribute("style") || "") || [])[1] || "").trim();
  if (!raw) return null;
  const hex = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(raw);
  if (hex) { const x = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1]; const n = parseInt(x, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(","); }
  const rgb = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?/i.exec(raw);
  if (rgb) { const a = rgb[4] ? parseFloat(rgb[4]) / (/%$/.test(rgb[4]) ? 100 : 1) : 1; return a < 0.5 ? null : [rgb[1], rgb[2], rgb[3]].join(","); }
  const name = /^[a-z]+/i.exec(raw);
  return name && NAMED_BG[name[0].toLowerCase()] ? NAMED_BG[name[0].toLowerCase()] : null;
}
function darkAlready(node) {
  let n = 0;
  for (const el of node.querySelectorAll("[bgcolor], [style*='background' i]")) {
    if (++n > 40) break;
    const w = parseInt(el.getAttribute("width") || "", 10) || (/(?:^|;)\s*(?:max-)?width\s*:\s*(\d+)(px|%)/i.exec(el.getAttribute("style") || "") || [])[1] || 0;
    const big = /^(TABLE|TBODY|CENTER|BODY)$/.test(el.tagName) || Number(w) >= 300 || /100%/.test((el.getAttribute("width") || "") + (el.getAttribute("style") || ""));
    if (!big) continue;
    const rgb = bgRgb(el);
    if (rgb) return lumOf(rgb) < 0.12 ? rgb : "";
  }
  return "";
}

/* =================================================================== acting through Gmail */
function gmailToolbar(act, titles) {
  const scope = $(".aeH") || document;
  if (act) {
    const b = $$(`[act="${act}"]`, scope).find(visible);
    if (b) return b;
  }
  for (const t of titles || []) {
    const sel = `[title^="${t}" i], [aria-label^="${t}" i], [data-tooltip^="${t}" i]`;
    const b = $$(sel, scope).find(visible);
    if (b) return b;
  }
  return null;
}
/* one of Gmail's menus or dialogs actually open (Gmail keeps closed ones around, hidden above the page) */
function shownPopup(e) {
  if (!visible(e)) return false;
  const r = e.getBoundingClientRect();
  if (r.width < 24 || r.height < 24 || r.bottom <= 0 || r.top >= window.innerHeight) return false;
  return getComputedStyle(e).visibility !== "hidden";
}
const popups = () => $$('[role="menu"], .J-M, [role="dialog"]:not(.Hd)').filter((e) => shownPopup(e) && !e.closest(".nH.Hd") && !e.classList.contains("qm-menu") && !e.closest("#qm-panel-scrim, #qm-pal-scrim, #qm-keys-scrim"));
function placeUnder(pop, anchor) {
  const r = anchor.getBoundingClientRect();
  // (its size on screen: at Larger, Umbra's menus are zoomed, and their own pixels are bigger than the page's)
  const pr = pop.getBoundingClientRect();
  const w = pr.width || pop.offsetWidth, ht = pr.height || pop.offsetHeight;
  let top = r.bottom + 6;
  if (top + ht > window.innerHeight - 12) top = Math.max(12, r.top - ht - 6);
  const left = Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12));
  placeAt(pop, left, top);
}
/* put something at a spot on screen, whatever shifts or zooms what "left" and "top" mean for it */
function placeAt(el, left, top) {
  el.style.left = left + "px";
  el.style.top = top + "px";
  el.style.right = "auto";
  el.style.bottom = "auto";
  for (let i = 0; i < 3; i++) {
    const got = el.getBoundingClientRect();
    const dx = left - got.left, dy = top - got.top;
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) break;
    const k = got.width && el.offsetWidth ? got.width / el.offsetWidth : 1;
    el.style.left = parseFloat(el.style.left) + dx / (k || 1) + "px";
    el.style.top = parseFloat(el.style.top) + dy / (k || 1) + "px";
  }
}
/* keep one of Gmail's pop-ups under our button: Gmail places it next to its own (hidden) button,
   sometimes again a moment later, so put it back whenever Gmail moves it */
function pinUnder(pop, anchor) {
  placeUnder(pop, anchor);
  const want = () => ({ left: pop.style.left, top: pop.style.top });
  let mine = want();
  const mo = new MutationObserver(() => {
    if (!pop.isConnected || !visible(pop)) { mo.disconnect(); return; }
    if (pop.style.left !== mine.left || pop.style.top !== mine.top) { placeUnder(pop, anchor); mine = want(); }
  });
  mo.observe(pop, { attributes: true, attributeFilter: ["style"] });
  setTimeout(() => mo.disconnect(), 20000);
}
/* run something that makes Gmail open a pop-up, then move that pop-up under our button */
async function openGmailPopup(open, anchor) {
  const before = new Set(popups());
  ROOT.classList.add("qm-hush");
  try {
    if (!(await open())) return false;
    for (let i = 0; i < 15; i++) {
      await wait(35);
      const fresh = popups().filter((e) => !before.has(e) && !e.dataset.qmSkip);
      if (fresh.length) { for (const f of fresh) pinUnder(f, anchor); gmailPop = { key: menuKey(anchor), els: fresh, closedAt: 0 }; return true; }
      // (nothing yet, just after one of these was put away with Esc: Gmail's button took the press as closing the pop-up
      // it had already put away. Pressed once more, it opens. Not otherwise: a slow first Labels would close again)
      if (i === 7 && Date.now() - gmailPopShut < 10000 && !popups().some((e) => !before.has(e))) await open();
    }
    return false;
  } finally {
    ROOT.classList.remove("qm-hush");
    setTimeout(() => { for (const e of $$("[data-qm-skip]")) delete e.dataset.qmSkip; }, 700);
  }
}
/* open one of Gmail's menus invisibly and read (or press) its items */
async function gmailMenu(button) {
  if (!button) return null;
  const before = new Set(popups());
  const was = document.activeElement;
  ROOT.classList.add("qm-hush");
  press(button);
  let menuEl = null;
  for (let i = 0; i < 12 && !menuEl; i++) { await wait(30); menuEl = popups().find((e) => !before.has(e)); }
  ROOT.classList.remove("qm-hush");
  if (!menuEl) { giveKeysBack(was); return null; }
  menuEl.dataset.qmSkip = "1";
  menuEl.qmWas = was;
  return menuEl;
}
function closeGmailMenu(menuEl, button) {
  // Esc where Gmail listens for it: its newer menus on the item that has the keyboard, its older ones on the menu
  const a = document.activeElement;
  if (a && menuEl.contains(a)) key("Escape", a);
  else key("Escape", menuEl);
  // (still open a moment later: pressed again, its button closes it; not at once, or it would open again as it goes)
  setTimeout(() => {
    if (shownPopup(menuEl)) { if (menuEl.contains(document.activeElement)) key("Escape", document.activeElement); else if (button) press(button); }
    giveKeysBack(menuEl.qmWas);
  }, 160);
  giveKeysBack(menuEl.qmWas);
  unskip(menuEl);
}
/* after one of Gmail's menus was opened out of sight: the keyboard back where it was (Gmail hands it to its own
   hidden button, or leaves it in the menu, where your keys would go to Gmail instead of Umbra) */
function giveKeysBack(was) {
  const a = document.activeElement;
  if (!a || a === document.body) return;
  if (a.closest('[id^="qm-"], .qm-menu, .nH.Hd[role="dialog"], .ip.qm-bar, .ip.qm-float, [role="alertdialog"]')) return; // (somewhere of yours)
  if (was && was !== a && was !== document.body && was.isConnected && visible(was) && was.closest('[id^="qm-"], .qm-menu, .nH.Hd[role="dialog"], .ip')) was.focus({ preventScroll: true });
  else a.blur();
}
// a menu Umbra opened out of sight is seen again once it's done with (the next time it opens, it's Gmail's to show)
const unskip = (menuEl) => setTimeout(() => { if (menuEl) delete menuEl.dataset.qmSkip; }, 700);
const itemLabel = (it) => text(it).replace(/[►▸›]\s*$/, "").trim();
/* Gmail's items for one of its menus, at once: what that menu had the last time (kept on this computer, so after a
   reload too), read again out of sight; `later` has what it has now. Umbra's menu never waits for Gmail's to open
   and close: it opens with what it knows, and takes in what's changed a moment later. */
const gmailMenuMemo = new Map(Object.entries(store.get("gmail-menus", {}) || {}));
function gmailMenuSoon(button, key) {
  const had = button ? gmailMenuMemo.get(key) || [] : [];
  const later = button ? gmailMenuItems(button).then((items) => {
    if (items.length && !sameList(items, gmailMenuMemo.get(key))) { gmailMenuMemo.set(key, items); store.set("gmail-menus", Object.fromEntries(gmailMenuMemo)); }
    return items;
  }) : Promise.resolve([]);
  return { now: had, later };
}
const sameList = (a, b) => (a || []).join("\n") === (b || []).join("\n");
async function gmailMenuItems(button) {
  const m = await gmailMenu(button);
  if (!m) return [];
  const items = $$('[role="menuitem"], [role="menuitemcheckbox"]', m).filter((it) => visible(it) && it.getAttribute("aria-hidden") !== "true" && it.getAttribute("aria-disabled") !== "true").map(itemLabel).filter(Boolean);
  closeGmailMenu(m, button);
  return items;
}
/* press one of a Gmail menu's items. `popup`: it opens a pop-up of its own (Snooze, Move to), which is brought under
   our button and counts as success; otherwise success is the item pressed (Forward, Reply all: a reply opens instead) */
async function pressGmailMenuItem(button, label, anchor, popup = true) {
  const go = async () => {
    const m = await gmailMenu(button);
    if (!m) return false;
    const it = $$('[role="menuitem"], [role="menuitemcheckbox"]', m).find((x) => visible(x) && (label instanceof RegExp ? label.test(itemLabel(x).trim()) : itemLabel(x) === label));
    if (!it) { closeGmailMenu(m, button); return false; }
    // (Gmail's newer menus ignore a press while they're still opening: again, until the menu goes or what it
    // opens appears; a closed menu can stay laid out, hidden, so "goes" is shownPopup's)
    const before = new Set(popups());
    const taken = () => !it.isConnected || !shownPopup(m) || !visible(it) || popups().some((e) => !before.has(e));
    for (let i = 0; i < 4 && !taken(); i++) { press(it); await wait(i ? 220 : 60); }
    // (still there: Gmail didn't take it, and its menu isn't left open)
    if (!taken()) { closeGmailMenu(m, button); return false; }
    unskip(m);
    return true;
  };
  return popup ? openGmailPopup(go, anchor || button) : go();
}

/* =================================================================== our menus */
/* A menu is keyed by its button's label and place, not the element: the screen may have been
   rebuilt between the click that opened it and the click that should close it. */
let menu = null;
let lastClosed = { key: "", at: 0 };
let gmailPop = null;
let gmailPopShut = 0; // when one of Gmail's pop-ups (Snooze, Move to) that Umbra opened was last put away with Esc
window.addEventListener("keydown", (e) => { if (e.isTrusted && e.key === "Escape" && gmailPop && gmailPop.els.some(visible)) gmailPopShut = Date.now(); }, true);
const menuKey = (a) => { const r = a.getBoundingClientRect(); return (a.getAttribute("aria-label") || text(a)) + "@" + Math.round(r.left / 8) + "," + Math.round(r.top / 8); };
function closeMenu() {
  if (!menu) return;
  const holder = menu.anchor.closest && menu.anchor.closest(".qm-msg");
  if (holder) holder.classList.remove("qm-on");
  lastClosed = { key: menu.key, at: performance.now() };
  const el = menu.el;
  el.classList.add("qm-out");
  setTimeout(() => el.remove(), 120);
  if (menu.anchor.isConnected) menu.anchor.setAttribute("aria-expanded", "false");
  menu = null;
}
/* true when this click only closes what the same button opened */
function wasOpen(anchor) {
  const k = menuKey(anchor);
  const now = performance.now();
  if (menu && menu.key === k) { closeMenu(); return true; }
  if (lastClosed.key === k && now - lastClosed.at < 400) return true;
  if (gmailPop && gmailPop.key === k) {
    const open = gmailPop.els.filter(visible);
    if (open.length) { key("Escape", open[0]); gmailPop = null; gmailPopShut = Date.now(); return true; }
    if (now - gmailPop.closedAt < 400) { gmailPop = null; return true; }
  }
  return false;
}
const menuButton = (name, label, fn, extra) => { const b = ib(name, label, () => { if (!wasOpen(b)) fn(b); }, extra); b.setAttribute("aria-haspopup", "menu"); return b; };
function fillMenu(el, items) {
  const kids = [];
  for (const it of items) {
    if (!it) continue;
    if (it === "-") { if (kids.length && kids[kids.length - 1].getAttribute("role") !== "separator") kids.push(h("div", { role: "separator" })); continue; }
    const b = h("button", { type: "button", role: "menuitem", tabindex: "-1" }, h("span", { text: it.label }), it.k ? h("span", { class: "qm-k", text: it.k }) : null);
    // (chosen: the menu's button opens it again at once, not taken for the click that closed it)
    b.addEventListener("click", () => { closeMenu(); lastClosed = { key: "", at: 0 }; it.run(); });
    kids.push(b);
  }
  while (kids.length && kids[kids.length - 1].getAttribute("role") === "separator") kids.pop();
  el.replaceChildren(...kids);
}
/* the open menu with what it should now hold (Gmail's own items, read a moment after it opened): in place, no motion,
   the keyboard where it was */
function refillMenu(el, items) {
  if (!menu || menu.el !== el) return;
  const all = $$('[role="menuitem"]', el), at = all.indexOf(document.activeElement);
  const label = at >= 0 ? text(all[at]) : "";
  fillMenu(el, items);
  if (at >= 0) { const now = $$('[role="menuitem"]', el); (now.find((b) => text(b) === label) || now[Math.min(at, now.length - 1)] || el).focus({ preventScroll: true }); }
  placeUnder(el, menu.anchor);
}
function openMenu(anchor, items) {
  const k = menuKey(anchor);
  if (menu && menu.key === k) { closeMenu(); return null; }
  closeMenu();
  if (!items.filter((x) => x && x !== "-").length) return null;
  const el = h("div", { class: "qm-menu", role: "menu" });
  fillMenu(el, items);
  el.addEventListener("keydown", (e) => {
    const all = $$('[role="menuitem"]', el);
    const i = all.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); const n = all[(i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]; if (n) n.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(); if (anchor.isConnected) anchor.focus({ preventScroll: true }); }
  });
  document.body.appendChild(el);
  placeUnder(el, anchor);
  // from the side menu: beside it (over everything), level with what was clicked, not under the menu itself
  const side = anchor.closest("#qm-side");
  if (side) {
    const sr = side.getBoundingClientRect(), ar = anchor.getBoundingClientRect(), mr = el.getBoundingClientRect();
    const right = !ROOT.classList.contains("qm-side-right");
    const left = right ? sr.right + 8 : sr.left - 8 - mr.width;
    const top = Math.max(8, Math.min(ar.top - 6, window.innerHeight - 8 - mr.height));
    el.classList.add("qm-menu-side");
    placeAt(el, Math.round(left), Math.round(top));
  }
  const r = anchor.getBoundingClientRect();
  const above = el.getBoundingClientRect().top < r.top;
  el.style.transformOrigin = (above ? "bottom " : "top ") + (r.left + r.width / 2 > window.innerWidth / 2 ? "right" : "left");
  el.style.setProperty("--qm-from-y", above ? "4px" : "-4px");
  anchor.setAttribute("aria-expanded", "true");
  menu = { el, anchor, key: k };
  const holder = anchor.closest(".qm-msg");
  if (holder) holder.classList.add("qm-on");
  const first = $('[role="menuitem"]', el);
  if (first) first.focus({ preventScroll: true });
  // (Gmail, putting away a menu of its own Umbra read out of sight, takes the keyboard back a moment later: it comes
  // straight back here, unless you've done something since)
  const openedAt = Date.now();
  el.addEventListener("focusout", (e) => {
    const was = e.target;
    setTimeout(() => {
      if (Date.now() - openedAt > 1200 || lastInput > openedAt || !menu || menu.el !== el || el.contains(document.activeElement)) return;
      if (was.isConnected) was.focus({ preventScroll: true });
    }, 0);
  });
  return el;
}
window.addEventListener("mousedown", (e) => {
  // (a click of yours: not one of Umbra's own presses on Gmail's buttons, out of sight, such as reading the open menu's
  // Gmail items while it's open)
  if (!e.isTrusted) return;
  if (menu && !menu.el.contains(e.target) && !menu.anchor.contains(e.target)) closeMenu();
  if (gmailPop && !gmailPop.closedAt && gmailPop.els.some(visible) && !gmailPop.els.some((p) => p.contains(e.target))) gmailPop.closedAt = performance.now();
}, true);
window.addEventListener("resize", () => closeMenu());

/* =================================================================== accounts */
let accounts = store.get("accounts2", []);
/* Gmail's own feeds, as the signed-in user. A plain fetch works in most setups; Firefox's
   userscript sandbox sometimes refuses it, so fall back to the manager's request. */
async function getText(path) {
  const url = location.origin + path;
  const ac = typeof AbortController === "function" ? new AbortController() : null;
  const t = ac ? setTimeout(() => ac.abort(), 15000) : 0;
  try {
    const r = await fetch(url, { credentials: "include", signal: ac ? ac.signal : undefined });
    if (r.ok) return await r.text();
  } catch (e) { if (ac && ac.signal.aborted) throw new Error("Timed out"); /* else: try the other way */ }
  finally { clearTimeout(t); }
  return new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest !== "function") { reject(new Error("offline")); return; }
    GM_xmlhttpRequest({ method: "GET", url, timeout: 15000, onload: (res) => (res.status === 200 ? resolve(res.responseText || "") : reject(new Error("Error " + res.status))), onerror: () => reject(new Error("offline")), ontimeout: () => reject(new Error("Timed out")) });
  });
}
async function findAccounts() {
  const found = [];
  // (up to ten; one that needs signing in again doesn't hide the ones after it, two misses in a row end it)
  for (let i = 0, miss = 0; i < 10 && miss < 2; i++) {
    try {
      const t = await getText(`/mail/u/${i}/feed/atom`);
      const m = t.match(/<title>[^<]*?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})[^<]*<\/title>/);
      if (!m) { miss++; continue; }
      const email = m[1].toLowerCase();
      if (found.some((a) => a.email === email)) break;
      miss = 0;
      const unread = Number((t.match(/<fullcount>(\d+)<\/fullcount>/) || [])[1] || 0);
      found.push({ index: i, email, unread });
    } catch (e) { miss++; }
  }
  if (found.length) {
    if (found.map((a) => a.email).join() !== accounts.map((a) => a.email).join()) dropSources();
    accounts = found;
    store.set("accounts2", accounts);
    renderAccounts();
    invalidate(true);
  }
}
const session = {
  get(k) { try { return sessionStorage.getItem("qm-" + k) || ""; } catch (e) { return ""; } },
  set(k, v) { try { if (v) sessionStorage.setItem("qm-" + k, v); else sessionStorage.removeItem("qm-" + k); } catch (e) { /* private mode */ } },
};
let everything = session.get("everything") === "1";
function setEverything(on) {
  everything = !!on;
  session.set("everything", on ? "1" : "");
  if (on) dropSources();
  invalidate(true);
}

/* "Everything": the folder you pick (Inbox, Sent, All mail, …) for every account at once, merged
   by date. A row is shown only once every account has loaded past its date, so the order is always
   right while more pages stream in.
   - This tab's account pages through the Gmail already on the page, with its own (hidden) Older button.
   - Another account is read from its own Gmail tab: every Umbra tab publishes the lists it reads to
     the userscript's shared storage, and pages further on request while it sits in the background.
     (Gmail can't run a second time inside a page: Google answers with errors, and the copy steers
     the address bar of the page around it.)
   - An account that isn't open anywhere shows what it last published, plus its unread mail. */
const TAB_ID = Math.random().toString(36).slice(2);
const sources = new Map();
let everyFolder = "", everyList = [], everyScroll = 0;
const pagedFolders = new Set();
const until = async (fn, ms, every = 150) => { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await wait(every); } return null; };
const isOff = (b) => !b || b.getAttribute("aria-disabled") === "true" || b.classList.contains("T-I-JE");
const report = (event, data) => { helper("/log", { event, data, version: VERSION }, 5000).catch(() => {}); };
/* month names as Gmail writes them in your language (and in English), for reading its dates */
const LOCAL_MONTHS = (() => {
  const map = new Map();
  const langs = [...new Set([document.documentElement.lang, navigator.language, ...(navigator.languages || []), "en"].filter(Boolean))];
  for (const lang of langs) for (const style of ["short", "long"]) {
    try {
      const f = new Intl.DateTimeFormat(lang, { month: style });
      for (let i = 0; i < 12; i++) { const n = f.format(new Date(2026, i, 15)).toLowerCase().replace(/\.$/, ""); if (n && !map.has(n)) map.set(n, i); }
    } catch (e) { /* a language the browser doesn't know */ }
  }
  return map;
})();
function monthOf(word) {
  const w = String(word || "").toLowerCase().replace(/\./g, "");
  if (LOCAL_MONTHS.has(w)) return LOCAL_MONTHS.get(w);
  for (const [k, i] of LOCAL_MONTHS) if (k.length >= 3 && w.length >= 3 && (k.startsWith(w) || w.startsWith(k))) return i;
  return MONTHS.findIndex((x) => x.toLowerCase() === w.slice(0, 3));
}
function rowTime(title) {
  const t = String(title || "").replace(/[  ]/g, " ");
  // numbers only (2026年10月8日 21:39, 2026/10/08 21:39)
  const n = t.match(/(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})\D{1,12}?(\d{1,2}):(\d{2})/);
  if (n) return new Date(Number(n[1]), Number(n[2]) - 1, Number(n[3]), Number(n[4]), Number(n[5])).getTime();
  let m = t.match(/(\p{L}{3,})\.? (\d{1,2}),? (\d{4}),? (?:at )?(\d{1,2}):(\d{2})\s?([AP]M)?/iu);
  let mon, day, yr, hr, min, ap;
  if (m && monthOf(m[1]) >= 0) [, mon, day, yr, hr, min, ap] = m;
  else if ((m = t.match(/(\d{1,2})\.? (?:de )?(\p{L}{3,})\.?,? (?:de )?(\d{4}),?\D{0,6}?(\d{1,2}):(\d{2})\s?([AP]M)?/iu))) [, day, mon, yr, hr, min, ap] = m;
  else { const p = Date.parse(t); return isNaN(p) ? 0 : p; }
  const mi = monthOf(mon);
  let H = Number(hr);
  if (ap && /pm/i.test(ap) && H < 12) H += 12;
  if (ap && /am/i.test(ap) && H === 12) H = 0;
  return mi < 0 ? 0 : new Date(Number(yr), mi, Number(day), H, Number(min)).getTime();
}
function feedWhen(ms) {
  const d = new Date(ms), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return MONTHS[d.getMonth()] + " " + d.getDate() + (d.getFullYear() === now.getFullYear() ? "" : ", " + d.getFullYear());
}
const unxml = (x) => x.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, c) => c[0] === "#" ? String.fromCodePoint(c[1] === "x" || c[1] === "X" ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10)) : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[c.toLowerCase()]);
function parseAtom(xml) {
  return (xml.match(/<entry>[\s\S]*?<\/entry>/g) || []).map((e) => {
    const get = (tag) => { const m = e.match(new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">")); return m ? unxml(m[1]).trim() : ""; };
    const link = unxml((e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "");
    return { subject: get("title") || "(no subject)", from: get("name") || get("email"), email: get("email").toLowerCase(), time: Date.parse(get("issued") || get("modified")) || 0, id: (link.match(/message_id=([0-9a-f]+)/i) || [])[1] || "" };
  });
}

const baseHash = (hash) => hash.replace(/\/p\d+$/, "");
const boxKey = (email, folder) => "box2:" + email + "|" + folder;
/* Gmail reuses one list for every folder: right after switching, the old folder's rows are still there.
   Gmail retitles the page once the new folder is drawn, so a list counts only after that. */
let nav = { at: 0, title: "" };
window.addEventListener("hashchange", (e) => {
  const from = baseHash((e.oldURL.split("#")[1] || "").split("?")[0]), to = baseHash((e.newURL.split("#")[1] || "").split("?")[0]);
  if (from !== to && !isThreadHash("#" + to) && !isThreadHash("#" + from)) { const m = gmailMain(); nav = { at: Date.now(), title: gmailTitle(), sig: m ? rowsSig(m) : "" }; }
  // into a search from anywhere (a pinned search, a sender's "All mail from", Back): Esc returns there
  if (/^search\//.test(to) && from && (!/^search\//.test(from) || "#" + from === DONE_HASH) && !aiPeeking && !peeking && !ghost) findReturn = "#" + (e.oldURL.split("#")[1] || "");
}, true);
// (or its rows aren't the ones it had: going from one search to another, Gmail's title stays "Search results")
const listSettled = () => { if (!nav.at || gmailTitle() !== nav.title || Date.now() - nav.at > 2500) return true; const m = gmailMain(); return !!nav.sig && !!m && rowsSig(m) !== nav.sig; };
/* Gmail's list on this page, if it is showing that folder */
function mainList(folder) {
  const m = gmailMain();
  return m && baseHash(hashNow()) === folder && $('[gh="tl"]', m) && listSettled() ? m : null;
}
/* after going to another list out of sight: the new list for sure, not the old one still on the page
   (Gmail can take a while; reading too early would file the old rows under the new list) */
const rowsSig = (m) => $$("tr.zA", m).filter(visible).slice(0, 4).map((r) => { const x = $("[data-legacy-thread-id]", r); return x ? x.getAttribute("data-legacy-thread-id") : ""; }).join(",");
function listBefore() { const m = gmailMain(); return { title: gmailTitle(), sig: m ? rowsSig(m) : "" }; }
function freshList(folder, before, ms = 10000) {
  const t0 = Date.now();
  return until(() => {
    const m = mainList(folder);
    if (!m || !listReady(m)) return null;
    if (gmailTitle() !== before.title || rowsSig(m) !== before.sig || listEmpty(m)) return m;
    return Date.now() - t0 > 5000 ? m : null; // the same rows for a good while: it is the same list
  }, ms, 60);
}
const pageSize = new Map();
/* which page a Gmail list is on, from its "51–100 of 5,517" counter */
function listPage(m) {
  const t = m ? text($(".Dj", $('[gh="tm"]', m) || m)) : "";
  const n = t.replace(/(\d)[,.\s  ](?=\d{3}\b)/g, "$1").match(/(\d+)\s*[–-]\s*(\d+)/);
  if (!n) { const hp = hashNow().match(/\/p(\d+)$/); return hp ? Number(hp[1]) : 1; }
  const start = Number(n[1]), end = Number(n[2]), f = baseHash(hashNow());
  if (start === 1) pageSize.set(f, end);
  return Math.floor((start - 1) / (pageSize.get(f) || 50)) + 1;
}
const olderOf = (m) => (m ? $(".amD.T-I-Js-Gs", $('[gh="tm"]', m) || m) : null);
const newerOf = (m) => (m ? $(".amD.T-I-Js-IF", $('[gh="tm"]', m) || m) : null);
const listReady = (m) => m && ($$("tr.zA", m).some(visible) || listEmpty(m));
/* the rows of a Gmail list as plain data, with a time for sorting */
/* What you read here. Gmail's own list (out of sight behind Umbra) only catches up when it's next drawn,
   and another account's saved list only when that tab looks again: until then, opening something here
   wins over either. As soon as a list agrees (or a newer message comes in) the note is dropped, so mail
   marked unread anywhere else shows as unread again. */
const readHere = new Map(Object.entries(store.get("read-here", {}))); // thread id -> { at, time }
let readSaveT = 0;
const saveReadSoon = () => { clearTimeout(readSaveT); readSaveT = setTimeout(() => store.set("read-here", Object.fromEntries([...readHere].slice(-300))), 600); };
function noteRead(id, time) { readHere.set(String(id), { at: Date.now(), time: time || Date.now() }); saveReadSoon(); }
// (marked unread from inside it: it stays unread, though it's still on screen, until you open it again)
const markedUnread = new Set();
function markUnreadHere(id) {
  if (!id) return;
  id = String(id);
  markedUnread.add(id);
  forgetRead(id);
  for (const s of sources.values()) { const r = s.rows.get(id); if (r) r.unread = true; }
  everyKeys = ["!redraw"];
}
function forgetRead(id) { if (readHere.delete(String(id))) saveReadSoon(); }
function readFix(r) {
  const o = r && readHere.get(String(r.id));
  if (!o) return r;
  if (!r.unread || Date.now() - o.at > 6 * 3600 * 1000 || (r.time && r.time > o.time + 60000)) { forgetRead(r.id); return r; }
  r.unread = false;
  return r;
}
// (a date Gmail wrote in a way Umbra can't read: the time it was first seen, not "now" again on every look)
const firstSeen = new Map();
function readList(m) {
  let prev = 0;
  const out = [];
  for (const x of readRows(m)) {
    if (!x.id || x.id[0] === "r") continue;
    let t = rowTime(x.whenFull);
    if (!t) { t = firstSeen.get(x.id) || prev || Date.now(); if (!firstSeen.has(x.id)) firstSeen.set(x.id, t); if (firstSeen.size > 3000) firstSeen.delete(firstSeen.keys().next().value); }
    prev = t;
    const withMe = x.people.some((p) => p.email === accountEmail());
    for (const p of x.people) notePerson(p.email, p.name, withMe);
    out.push(readFix({ id: x.id, lastMsg: x.lastMsg, from: x.from, people: x.people.map((p) => [p.email, p.name, p.short]), count: x.count, draft: x.draft, subject: x.subject, snippet: x.snippet, when: x.when, whenFull: x.whenFull, unread: x.unread, important: x.important, starred: x.starred, attach: x.attach, files: x.files, time: t }));
  }
  return out;
}
/* step a Gmail list on this page one page on (or back), waiting until Gmail has drawn it */
async function stepList(folder, dir) {
  const m = mainList(folder);
  const b = m && (dir > 0 ? olderOf(m) : newerOf(m));
  if (isOff(b)) return false;
  const before = (readList(m)[0] || {}).id, at = listPage(m);
  if (dir > 0) pagedFolders.add(folder);
  ownNav = Date.now();
  press(b);
  return !!(await until(() => { const x = mainList(folder); return x && listPage(x) !== at && (readList(x)[0] || {}).id !== before; }, 15000));
}
/* after Everything paged through a list, put it back on page 1 before it's shown as itself */
async function firstPage(folder) {
  pagedFolders.delete(folder);
  if (baseHash(hashNow()) !== folder) return; // moved on meanwhile
  ownNav = Date.now();
  const link = $$(".aeN a[href]").find((a) => a.getAttribute("href").endsWith(folder));
  if (link) { press(link); return; }
  for (let i = 0; i < 40 && listPage(mainList(folder)) > 1; i++) if (!(await stepList(folder, -1))) break;
}

/* ---- sharing between tabs ---- */
function publish(folder, rows, page, done) {
  const email = accountEmail();
  if (!email || !folder) return;
  rememberRows(email, rows); // for ⌘K, on this computer
  const k = boxKey(email, folder);
  const box = store.get(k, null);
  const fresh = !!box && Date.now() - box.at < 15 * 60 * 1000;
  const map = new Map((fresh && !(page === 1 && done) ? box.rows : []).map((r) => [r.id, r]));
  if (rows.length) {
    // rows that used to fall inside this stretch of time but aren't there now have left the folder
    const hi = rows[0].time, lo = rows[rows.length - 1].time, ids = new Set(rows.map((r) => r.id));
    for (const [id, r] of map) if (!ids.has(id) && ((r.time < hi && r.time > lo) || (page === 1 && r.time >= hi) || (done && r.time < lo))) map.delete(id);
  }
  for (const r of rows) map.set(r.id, { id: r.id, from: r.from, people: r.people, count: r.count, draft: r.draft, subject: r.subject, snippet: (r.snippet || "").slice(0, 140), when: r.when, whenFull: r.whenFull, unread: r.unread, important: r.important, starred: r.starred, attach: r.attach, files: r.files, time: r.time });
  const all = [...map.values()].sort((a, b) => b.time - a.time).slice(0, 800);
  const pages = Math.max(page, fresh ? box.pages || 0 : 0);
  const sig = hashString(pages + ":" + !!done + ":" + all.map((r) => r.id + (r.unread ? 1 : 0) + (r.starred ? "s" : "") + (r.draft || "") + (r.count || "") + r.when).join(","));
  if (box && box.sig === sig && Date.now() - box.at < 60000) return;
  store.set(k, { at: Date.now(), rows: all, pages, done: !!done, sig, tab: TAB_ID });
  keepBoxes(email, folder);
}
function keepBoxes(email, folder) {
  const ik = "boxes:" + email, idx = store.get(ik, {}) || {};
  if (idx[folder] && Date.now() - idx[folder] < 3600000) return;
  idx[folder] = Date.now();
  const extra = Object.entries(idx).filter(([f]) => f !== "#inbox" && f !== "#drafts").sort((a, b) => b[1] - a[1]);
  for (const [f] of extra.slice(12)) { delete idx[f]; store.del(boxKey(email, f)); }
  store.set(ik, idx);
}
function heartbeat() {
  if (!enabled) return;
  const e = accountEmail();
  if (e) store.set("live:" + e, { at: Date.now(), tab: TAB_ID, hidden: document.hidden });
}
const liveTab = (email) => { const l = store.get("live:" + email, null); return l && l.tab !== TAB_ID && Date.now() - l.at < 75000 ? l : null; };
/* another tab asks this one (in the background) for more of a folder: a list of asks, one per account */
function askTab(req) {
  const q = store.get("want", null);
  const list = (Array.isArray(q) ? q : q ? [q] : []).filter((x) => x && Date.now() - x.at < 20000 && !(x.email === req.email && x.tab === req.tab));
  list.push(req);
  store.set("want", list.slice(-12));
}
let serving = false, restoreTo = "";
async function serve(reqs) {
  const me = accountEmail();
  const list = Array.isArray(reqs) ? reqs : reqs ? [reqs] : [];
  const req = list.filter((x) => x && x.email === me && x.tab !== TAB_ID).sort((a, b) => b.at - a.at)[0];
  if (!enabled || !req || serving || !me || req.email !== me || req.tab === TAB_ID || Date.now() - req.at > 20000) return;
  if (!document.hidden || ROOT.classList.contains("qm-writing") || document.getElementById("qm-panel-scrim")) return;
  const lock = store.get("serving:" + me, null);
  if (lock && lock.tab !== TAB_ID && Date.now() - lock.at < 20000) return;
  serving = true;
  store.set("serving:" + me, { at: Date.now(), tab: TAB_ID });
  try {
    const F = req.folder;
    const before = listBefore();
    const already = baseHash(hashNow()) === F;
    if (!already) { if (!restoreTo) restoreTo = hashNow(); go(F); }
    if (!(await (already ? until(() => listReady(mainList(F)), 15000, 300) : freshList(F, before, 15000)))) return;
    if (listPage(mainList(F)) > 1) {
      if (!restoreTo) restoreTo = hashNow();
      await firstPage(F);
      if (!(await until(() => { const m = mainList(F); return m && listReady(m) && listPage(m) === 1; }, 8000, 60))) return;
    }
    for (let i = 0; i < 40; i++) {
      const m = mainList(F);
      if (!m) break;
      publish(F, readList(m), listPage(m), isOff(olderOf(m)));
      if (listPage(m) >= req.pages || isOff(olderOf(m))) break;
      if (!restoreTo) restoreTo = hashNow();
      if (!(await stepList(F, 1))) break;
    }
  } finally {
    serving = false;
    store.set("serving:" + me, null);
  }
}

/* ---- the sources of a list: this account's Gmail, and in Everything every other account too ---- */
const boxWatch = [];
let streamKey = "";
const streamScroll = new Map();
const gone = new Map(); // rows just archived or deleted here: hidden until Gmail agrees
const rowsLeaving = new Map(); // id -> { r, at }: a row on its way out, kept in its place until it has gone
function ensureSources(folder, all) {
  const k = folder + "|" + (all ? "all" : accountEmail());
  if (streamKey !== k) { dropSources(); streamKey = k; everyFolder = folder; }
  const list = all && accounts.length > 1 ? accounts : [{ index: accountIndex(), email: accountEmail(), unread: 0 }];
  for (const a of list) {
    if (!a.email || sources.has(a.email)) continue;
    const src = { account: a, kind: a.index === accountIndex() ? "main" : "other", rows: new Map(), oldest: Infinity, ready: false, done: false, busy: false, pages: 0, feed: [] };
    sources.set(a.email, src);
    if (src.kind === "main") startMain(src);
    else startOther(src);
  }
}
function dropSources() {
  if (typeof GM_removeValueChangeListener === "function") for (const id of boxWatch.splice(0)) GM_removeValueChangeListener(id);
  sources.clear();
  streamKey = "";
  everyKeys = [];
}
const mainSource = () => [...sources.values()].find((x) => x.kind === "main") || null;
async function preferRecent() {
  const btn = $$("button", gmailMain() || document).find((b) => /showing most relevant/i.test(text(b)));
  if (!btn) return false;
  ROOT.classList.add("qm-hush");
  try {
    press(btn);
    const item = await until(() => $$('[role="menuitemradio"]').find((x) => /^most recent/i.test(text(x))), 2000, 40);
    if (item) { press(item); await wait(350); }
    else key("Escape", btn);
    return !!item;
  } finally { setTimeout(() => ROOT.classList.remove("qm-hush"), 200); }
}
async function startMain(src) {
  const F = everyFolder;
  // what this account showed last time, at once, while Gmail catches up
  const box = store.get(boxKey(src.account.email, F), null);
  if (box && box.rows && box.rows.length && Date.now() - box.at < 3 * 86400000) {
    for (const r of box.rows) { src.rows.set(r.id, Object.assign({ account: src.account }, r)); if (r.time < src.oldest) src.oldest = r.time; }
    src.ready = true;
  }
  src.busy = true;
  // opened on a later page of a search (Gmail keeps "/p3" in the address): back to its first page
  if (/\/p\d+$/.test(hashNow()) && baseHash(hashNow()) === F) location.replace(F);
  let ok = await until(() => (listReady(mainList(F)) && !/\/p\d+$/.test(hashNow())) || baseHash(hashNow()) !== F, 20000, 60);
  if (baseHash(hashNow()) !== F) ok = null;
  // Done is a search: Gmail shows a search "most relevant" first (only a few results); ask for most recent
  if (ok && F === DONE_HASH && (await preferRecent())) ok = await until(() => listReady(mainList(F)), 8000, 60);
  // Gmail remembers the page a list was on: always start from page 1, so nothing newer is missed
  if (ok && sources.get(src.account.email) === src && baseHash(hashNow()) === F && listPage(mainList(F)) > 1) {
    await firstPage(F);
    ok = await until(() => { const m = mainList(F); return m && listReady(m) && listPage(m) === 1; }, 8000, 60);
  }
  if (sources.get(src.account.email) !== src) return;
  src.busy = false;
  src.ready = true;
  // (no Older button yet is Gmail still drawing, not the end of the list)
  if (ok) { absorbMain(src); src.pages = 1; const b = olderOf(mainList(F)); src.done = !!b && isOff(b); } else src.done = !src.rows.size;
  invalidate(true);
}
/* copy the page Gmail shows into the source (dropping what left it), and share it with other tabs */
function absorbMain(src) {
  const m = mainList(everyFolder);
  if (!m || !listReady(m)) return false;
  const rows = readList(m);
  const page = listPage(m);
  let changed = false;
  if (rows.length) {
    const hi = rows[0].time, lo = rows[rows.length - 1].time, ids = new Set(rows.map((r) => r.id)), last = isOff(olderOf(m));
    for (const [id, r] of src.rows) {
      if (ids.has(id) || r.feed) continue;
      if ((r.time < hi && r.time > lo) || (page === 1 && r.time >= hi) || (last && r.time < lo)) { src.rows.delete(id); changed = true; }
    }
  } else if (page === 1 && listEmpty(m) && src.rows.size) { src.rows.clear(); changed = true; }
  for (const r of rows) {
    // back on Gmail's list a moment after being archived here (Undo): show it again
    if (gone.has(r.id) && Date.now() - gone.get(r.id) > 1500) { gone.delete(r.id); changed = true; everyKeys = ["!redraw"]; }
    const old = src.rows.get(r.id);
    if (!old || old.unread !== r.unread || old.when !== r.when || old.draft !== r.draft || old.subject !== r.subject || old.starred !== r.starred) changed = true;
    src.rows.set(r.id, Object.assign({ account: src.account }, r));
  }
  if (changed) {
    src.oldest = Infinity;
    for (const r of src.rows.values()) if (r.time < src.oldest) src.oldest = r.time;
    publish(everyFolder, rows, page, isOff(olderOf(m)));
  }
  return changed;
}
function startOther(src) {
  src.ready = true;
  loadBox(src);
  if (typeof GM_addValueChangeListener === "function") {
    boxWatch.push(GM_addValueChangeListener(boxKey(src.account.email, everyFolder), () => { loadBox(src); invalidate(); }));
  }
  if (liveTab(src.account.email) && !src.fresh) askMore(src);
  if (everyFolder === "#inbox") loadFeed(src);
}
function loadBox(src) {
  const box = store.get(boxKey(src.account.email, everyFolder), null);
  const live = !!liveTab(src.account.email);
  src.fresh = !!box && Date.now() - box.at < 30 * 60 * 1000;
  src.pages = box ? box.pages || 0 : 0;
  src.rows = new Map();
  src.oldest = Infinity;
  for (const r of box ? box.rows : []) {
    src.rows.set(r.id, readFix(Object.assign({ account: src.account }, r)));
    if (r.time < src.oldest) src.oldest = r.time;
  }
  // mail that arrived after the account last published (its unread feed). The feed names messages: a reply in a
  // conversation already here (same subject, same sender among its people) brings that row up instead
  const topic = (x) => String(x || "").replace(/^\s*((re|fwd?|aw|wg|sv|tr)\s*:\s*)+/i, "").trim().toLowerCase();
  for (const r of src.feed) {
    if (box && r.time <= box.at - 60000) continue;
    const same = !src.rows.has(r.id) && [...src.rows.values()].find((x) => topic(x.subject) === topic(r.subject) && r.email && (x.people || []).some((p) => (Array.isArray(p) ? p[0] : p.email) === r.email));
    if (same) { if (r.time > same.time) src.rows.set(same.id, readFix(Object.assign({}, same, { time: r.time, when: r.when, whenFull: r.whenFull, unread: true }))); continue; }
    src.rows.set(r.id, readFix(r));
  }
  if (!src.busy) src.done = !live || !box || !!box.done || (src.stalled && Date.now() - src.stalled < 30000);
}
async function loadFeed(src) {
  try {
    src.feed = parseAtom(await getText(`/mail/u/${src.account.index}/feed/atom`)).filter((it) => it.id).map((it) => ({ id: it.id, from: it.from, email: it.email, subject: it.subject, when: feedWhen(it.time), whenFull: new Date(it.time).toLocaleString(), unread: true, time: it.time, account: src.account, feed: true }));
  } catch (e) { /* that account is signed out */ }
  if (sources.get(src.account.email) === src) { loadBox(src); invalidate(true); }
}
/* ask the account's own tab for the next page, and wait for it to publish */
async function askMore(src) {
  if (src.busy) return;
  if (!liveTab(src.account.email)) { src.done = true; invalidate(true); return; }
  src.busy = true;
  src.done = false;
  invalidate(true);
  const want = (src.pages || 0) + 1, folder = everyFolder;
  askTab({ email: src.account.email, folder, pages: want, at: Date.now(), tab: TAB_ID });
  const ok = await until(() => { const b = store.get(boxKey(src.account.email, folder), null); return b && Date.now() - b.at < 30000 && (b.pages >= want || b.done); }, 20000, 600);
  if (sources.get(src.account.email) !== src) return;
  src.busy = false;
  src.retrying = false;
  src.stalled = ok ? 0 : Date.now(); // its tab is in front, asleep or busy: show what's there for now
  loadBox(src);
  invalidate(true);
}
async function moreMain(src) {
  if (src.busy) return;
  src.busy = true;
  invalidate(true);
  // Gmail shows one page at a time; step its list on to the page after the last one read
  // (after opening a conversation it is back on page 1, so this may take a few steps)
  const want = src.pages + 1;
  for (let i = 0; i < 60 && mainList(everyFolder) && listPage(mainList(everyFolder)) < want; i++) {
    if (!(await stepList(everyFolder, 1))) break;
    absorbMain(src);
  }
  const m = mainList(everyFolder);
  src.busy = false;
  if (m && listPage(m) >= want) { src.pages = want; absorbMain(src); src.done = isOff(olderOf(m)); } else src.done = !m || isOff(olderOf(m));
  invalidate(true);
  pageBackSoon(everyFolder);
}
/* once you've stopped loading more, Gmail's own list goes back to its first page: new mail keeps arriving at the
   top, and what's there can be acted on straight from Gmail's page (what was read stays in the list) */
let pageBackT = 0, ownNav = 0;
function pageBackSoon(folder) {
  clearTimeout(pageBackT);
  pageBackT = setTimeout(() => {
    const m = mainList(folder);
    if (!enabled || !m || baseHash(hashNow()) !== folder || listPage(m) <= 1) return;
    if ([...sources.values()].some((x) => x.busy) || ghost || peeking || aiPeeking || writingAnything() || Date.now() - lastInput < 3000) { pageBackSoon(folder); return; }
    firstPage(folder);
  }, 6000);
}
/* ---- filters (⌘K): narrow whatever list is showing. While any is on, a bar above the list says so the
   whole time, and Esc (or "Show all") brings everything back. They last for this tab. */
const FILTERS = [
  { id: "unread", label: "Unread", sub: "Only what you haven't opened", ico: "unread", test: (r) => r.unread },
  { id: "people", label: "From people", sub: "No newsletters, receipts or notifications", ico: "people", test: (r) => isFromPerson(r) },
  { id: "needs", label: "Needs you", sub: "People waiting on an answer", ico: "todos", test: (r) => needsYou(r), when: () => prefs.needs },
  { id: "starred", label: "Starred", sub: "Only starred conversations", ico: "starred", test: (r) => r.starred },
  { id: "files", label: "With attachments", sub: "Only mail that carries files", ico: "clip", test: (r) => r.attach },
  { id: "today", label: "Today", sub: "Only what came in today", ico: "today", test: (r) => r.time >= new Date().setHours(0, 0, 0, 0) },
];
const FILTER_STEP = 1000; // conversations looked through before asking to look further back
let filters = new Set(session.get("filters").split(",").filter((id) => FILTERS.some((f) => f.id === id) || /^cat:[A-Za-z ]+$/.test(id)));
let filterReach = FILTER_STEP;
const activeFilters = () => [...FILTERS.filter((f) => filters.has(f.id) && (!f.when || f.when())), ...(gemOn() && gp().piles ? [...filters].filter((id) => id.startsWith("cat:")).map(catFilter) : [])];
function setFilter(id, on) {
  if (on) filters.add(id); else filters.delete(id);
  session.set("filters", [...filters].join(","));
  filterReach = FILTER_STEP;
  cursor = -1;
  everyKeys = ["!redraw"];
  const sc = $("#qm-view .qm-scroll:not(.qm-leaving *)");
  if (sc && screen.kind === "stream") sc.scrollTop = 0;
  if (screen.kind !== "stream" && screen.kind !== "") goBack(); // from a conversation: back to its list
  invalidate(true);
}
function clearFilters() { filters.clear(); setFilter("", false); }
const loadedRows = () => [...sources.values()].reduce((n, s) => n + (s.ready ? s.rows.size : 0), 0);
/* every source's rows, newest first; with several sources, only as far as all of them have loaded */
function streamRows(noPiles) {
  let cutoff = -Infinity;
  const all = [];
  const now = Date.now();
  for (const [id, at] of gone) if (now - at > 90000) gone.delete(id);
  for (const s of sources.values()) {
    if (!s.ready) continue;
    for (const r of s.rows.values()) if (!gone.has(r.id)) all.push(readFix(r));
    if (sources.size > 1 && !s.done && !s.retrying && s.rows.size) cutoff = Math.max(cutoff, s.oldest);
  }
  all.sort((a, b) => b.time - a.time);
  const on = activeFilters().filter((f) => !noPiles || !f.id.startsWith("cat:"));
  const list = calmRows(all.filter((r) => r.time >= cutoff && on.every((f) => f.test(r))), noPiles || !!pileOn());
  if (prefs.order === "unread") return [...list.filter((r) => r.unread), ...list.filter((r) => !r.unread)];
  if (prefs.order === "people") return [...list.filter(isFromPerson), ...list.filter((r) => !isFromPerson(r))];
  return list;
}
/* load more from the source holding the list back: the one whose oldest row is newest */
function everythingMore(further) {
  if (!further && filters.size && loadedRows() >= filterReach) return; // filtered: ask before digging deeper
  if (!further && calmEnded()) return; // the inbox ends here (Settings › Calm)
  let pick = null;
  for (const s of sources.values()) {
    // "the end" read while Gmail was mid-draw: its Older button says otherwise, so carry on
    if (s.kind === "main" && s.done && s.ready && !s.busy) { const b = olderOf(mainList(everyFolder)); if (b && !isOff(b)) s.done = false; }
    // (asked again after a while: what's there stays in the list meanwhile, rather than its bottom going and coming back)
    if (s.stalled && Date.now() - s.stalled > 30000 && liveTab(s.account.email)) { s.stalled = 0; s.done = false; s.retrying = true; }
    if (s.ready && !s.done && (!pick || s.oldest > pick.oldest)) pick = s;
  }
  if (!pick || pick.busy) return;
  if (pick.kind === "main") moreMain(pick); else askMore(pick);
}
/* the row as Gmail has it on the page right now, if that page is showing */
function liveRow(id) {
  const m = gmailMain();
  const el = m && $(`[data-legacy-thread-id="${CSS.escape(String(id))}"]`, m);
  const row = el && el.closest("tr.zA");
  return row && visible(row) ? row : null;
}
/* Gmail's address for a conversation: "thread-f:" and its number (the short hex id only opens old ones) */
function threadHash(folder, id, email) {
  folder = folder || "#inbox"; // opened straight onto a conversation: no list yet, so the inbox
  const perm = permIds.get((email || accountEmail()) + ":" + id);
  if (perm) return folder + "/" + perm;
  try { return folder + "/thread-f:" + BigInt("0x" + id).toString(); } catch (e) { return folder + "/" + id; }
}
/* A conversation you started has a permanent address of another kind ("thread-a:r…") that its short id doesn't
   give: Gmail writes it on its row. Kept (this computer, the last few thousand) so it opens out of sight too. */
const permIds = new Map(Object.entries(store.get("perm-ids", {}) || {}));
let permSaveT = 0;
function notePerm(id, perm) {
  perm = String(perm || "").replace(/^#/, "");
  if (!id || !/^thread-a:r-?\d+$/.test(perm)) return; // (a received one's address comes from its id)
  const k = accountEmail() + ":" + id;
  if (permIds.get(k) === perm) return;
  permIds.set(k, perm);
  while (permIds.size > 3000) permIds.delete(permIds.keys().next().value);
  clearTimeout(permSaveT);
  permSaveT = setTimeout(() => {
    const all = Object.assign({}, store.get("perm-ids", {}) || {}, Object.fromEntries(permIds));
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 3000))) delete all[k];
    store.set("perm-ids", all);
  }, 2000);
}
let opening = null; // the conversation just clicked, shown at once while Gmail loads it
let cursorBack = "";
function openStreamRow(r, e) {
  if (!r) return;
  const live = r.account && r.account.index === accountIndex() ? liveRow(r.id) : null;
  if (e && (e.metaKey || e.ctrlKey)) { choose(r); return; }
  if (e && e.shiftKey) { chooseRun(r); return; }
  if (chosen.size && e && e.type === "click") { choose(r); return; } // while choosing, a click picks too
  // a draft on its own (in Drafts): Gmail opens it in a window, which grows out of its row
  if (everyFolder === "#drafts" && !r.count && live) { openDraftRow(r, live, e && e.target && e.target.closest ? e.target.closest(".qm-row") : null); return; }
  r.unread = false;
  markedUnread.delete(String(r.id));
  noteRead(r.id, r.time);
  if (r.account && r.account.index !== accountIndex()) { openElsewhere(r); return; } // Everything stays on there
  noteHero(r);
  cursorBack = String(r.id); // (back in the list, the cursor is on it: j and k, e and # carry on from there)
  opening = { id: r.id, subject: r.subject, from: whoText(r), single: !r.count, at: Date.now() };
  invalidate(true);
  // Gmail's own row when it's on the page (always works, and is quickest); its address otherwise
  if (live && !looking()) { press($(".xS", live) || live); return; }
  const folder = paneSearch() || everyFolder || "#inbox";
  go(threadHash(folder, r.id));
  const fallback = (late) => {
    if (looking() || waitingGo) { setTimeout(() => fallback(late), 500); return; } // (it isn't on its way yet)
    // not opened (a conversation Gmail hasn't numbered yet): find its row on Gmail's list and press that
    if ((route().kind === "thread" && openThreadId() === String(r.id)) || !opening || opening.id !== r.id) return;
    if (!late && route().kind === "loading") { setTimeout(() => fallback(true), 3500); return; } // (Gmail is still at it)
    location.replace(folder);
    until(() => liveRow(r.id), 4000, 80).then((row) => { if (row) press($(".xS", row) || row); else { opening = null; invalidate(true); toast("Couldn't open that conversation."); } });
  };
  setTimeout(() => fallback(false), 2500);
}
async function openDraftRow(r, live, rowEl) {
  const before = new Set($$('.nH.Hd[role="dialog"]').filter(visible));
  const ctx = beginOpen(rowEl, "draft");
  press($(".xS", live) || live);
  const got = await until(() => $$('.nH.Hd[role="dialog"]').find((x) => !before.has(x) && visible(x)) || (isThreadHash(hashNow()) ? "thread" : null), 6000, 30);
  if (!got || got === "thread") { endOpen(ctx); if (!got) toast("Couldn't open that draft."); invalidate(true); return; }
  got.dataset.qmHome = "draft";
  await finishOpen(ctx, got, { focus: (d) => { const b = $(".editable", d); if (b) focusEnd(b); } });
}
function openAccountTab(a) {
  const url = `${location.origin}/mail/u/${a.index}/${everyFolder || "#inbox"}`;
  if (typeof GM_openInTab === "function") GM_openInTab(url, { active: false, insert: true });
  else window.open(url, "_blank", "noopener");
  toast(accountLabel(a.email) + " is opening in a new tab.");
}
let backFor = "", backPending = false;
function goBack() {
  if (paperBack && (screen.kind === "thread" || screen.kind === "reading")) { paperBack = false; paperOn = true; go("#inbox"); invalidate(true); return; }
  if (askState && askState.reopen && (screen.kind === "thread" || screen.kind === "reading")) {
    askState.reopen = false;
    session.set("back", "");
    backFor = "";
    askOn = true;
    go(askBack || "#inbox");
    invalidate(true);
    return;
  }
  const back = session.get("back");
  if (back && backFor === hashNow()) { session.set("back", ""); backFor = ""; go(back); return; }
  go(parentHash(hashNow()));
}
function accountLabel(email) {
  const custom = (prefs.names || {})[email];
  if (custom) return custom;
  const [, domain = ""] = email.split("@");
  if (/^(gmail|googlemail)\.com$/.test(domain)) return "Personal";
  const org = domain.split(".").slice(-2, -1)[0] || domain;
  // short names and ones without vowels are initials (nyu → NYU, mit → MIT); words get a capital
  return org.length <= 4 || !/[aeiou]/i.test(org) ? org.toUpperCase() : org[0].toUpperCase() + org.slice(1);
}

/* =================================================================== colour & people
   Colour only where it means something: each account has one quiet hue (shown only when more than one
   account is signed in), and one warm accent marks conversations where a person is waiting on you.
   Everything else stays grey. */
const HUES = ["#7f9fd4", "#86b49b", "#a896d6", "#cf8f9e", "#6fb1b6", "#c4ad84", "#9aa3b0"];
function acctColor(email) {
  if (accounts.length < 2) return "";
  const set = (prefs.colors || {})[email];
  if (set === "none") return "";
  if (set) return set;
  const i = Math.max(0, accounts.findIndex((a) => a.email === email));
  return HUES[i % HUES.length];
}
function applyColors() {
  const c = acctColor(accountEmail());
  if (c) ROOT.style.setProperty("--acct", c); else ROOT.style.removeProperty("--acct");
  ROOT.classList.toggle("qm-multi", accounts.length > 1);
  ROOT.classList.toggle("qm-dense", prefs.density === "compact");
  ROOT.classList.toggle("qm-spacious", prefs.density === "spacious");
}
/* the look: background (a colour or a picture), soft depth, size, lines between rows, reading width */
/* a picture chosen before Umbra kept its size (or from another tab): measure it once, so zoom works */
var bgMeasuring = null;
function measureBg() {
  const bg = prefs.bg || {};
  const url = bg.kind === "image" ? store.get("bg-img", "") : "";
  if (!url || (bg.iw && bg.ih && typeof bg.lum === "number" && typeof bg.lumLo === "number")) return Promise.resolve(true);
  if (bgMeasuring) return bgMeasuring;
  bgMeasuring = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      bgMeasuring = null;
      const l = pictureLight(img);
      prefs.bg = Object.assign({}, prefs.bg, { iw: img.naturalWidth, ih: img.naturalHeight, lum: l.hi, lumLo: l.lo });
      store.set("prefs3", prefs);
      applyLook();
      resolve(true);
    };
    img.onerror = () => { bgMeasuring = null; resolve(false); };
    img.src = url;
  });
  return bgMeasuring;
}
/* how bright a picture's bright parts are, and how dark its dark parts (0 black … 1 white): text has to
   stay readable over both */
function pictureLight(img) {
  try {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 40;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, 64, 40);
    const d = g.getImageData(0, 0, 64, 40).data;
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const ls = [];
    for (let i = 0; i < d.length; i += 4) ls.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]));
    ls.sort((a, b) => a - b);
    const q = (f) => Math.round(ls[Math.floor(ls.length * f)] * 1000) / 1000;
    return { hi: q(0.9), lo: q(0.1) };
  } catch (e) { return { hi: 0.5, lo: 0.2 }; }
}
// (a function declaration, not a const: applyLook runs at the very start, before later consts exist)
function lumOf(rgb) { const p = String(rgb).split(",").map((x) => Number(x) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return p.length === 3 ? 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2] : 0.005; }
/* a picture scaled to cover a w×h box, then zoomed */
function bgSize(iw, ih, w, hh, zoom) { const k = Math.max(w / iw, hh / ih) * (zoom || 1); return { w: iw * k, h: ih * k }; }
function hexRgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return ""; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(", "); }
/* bright or dark: as chosen, or as the system is */
function lightWanted() {
  if (prefs.theme === "light") return true;
  if (prefs.theme === "system") { try { return window.matchMedia("(prefers-color-scheme: light)").matches; } catch (e) { return false; } }
  return false;
}
/* a background colour kept to the theme: a dark one becomes its own pale tone in bright mode, and back */
function themedBase(hex, light) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const [hh, ss, ll] = rgbHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  if (light && ll < 0.5) return hslHex(hh, Math.min(ss, 0.3), 0.955);
  if (!light && ll > 0.5) return hslHex(hh, Math.min(ss, 0.3), 0.075);
  return hex;
}
function vivid(hex, light) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [, ss, ll] = rgbHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  return light ? ll < 0.9 && ss > 0.2 : ll > 0.16 && ss > 0.2;
}
function softFace(hex, light) {
  const n = parseInt(hex.slice(1), 16);
  const [hh, ss, ll] = rgbHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  return light ? hslHex(hh, Math.min(ss, 0.2), Math.max(0.88, Math.min(0.93, ll))) : hslHex(hh, Math.min(ss, 0.18), Math.max(0.105, Math.min(0.15, ll)));
}
function applyLook() {
  const st = ROOT.style;
  const bg = prefs.bg || {};
  const light = lightWanted();
  ROOT.classList.toggle("qm-light", light);
  const base = bg.kind !== "none" ? themedBase(bg.color, light) : "";
  // soft depth's material, from your colour: the page and everything on it are one colour (under a
  // picture, the page keeps its tone and the material is that tone, lifted so light and shade show)
  const face = prefs.soft && base ? softFace(base, light) : "";
  if (face) { st.setProperty("--face", face); st.setProperty("--face-rgb", hexRgb(face)); } else { st.removeProperty("--face"); st.removeProperty("--face-rgb"); }
  const page = face && bg.kind === "color" ? face : base;
  // (a real color, not one of the near-neutral tones: text and surfaces are drawn from it)
  ROOT.classList.toggle("qm-tinted", bg.kind === "color" && !face && vivid(base, light));
  const rgb = page ? hexRgb(page) : "";
  if (rgb) { st.setProperty("--bg", page); st.setProperty("--bg-rgb", rgb); } else { st.removeProperty("--bg"); st.removeProperty("--bg-rgb"); }
  const img = bg.kind === "image" ? store.get("bg-img", "") : "";
  const sky = bg.kind === "sky" ? skyAt(Date.now(), bg.lat) : null; // the sky as it is now, where you are
  ROOT.classList.toggle("qm-bgimg", !!img || !!sky);
  if (img || sky) {
    st.setProperty("--qm-bgimg", sky ? skyCss(sky) : (bg.daylight ? dayTint() : "") + 'url("' + img + '")');
    const dim = bg.dim == null ? 0.6 : bg.dim, readDim = bg.readDim == null ? 0.82 : bg.readDim;
    st.setProperty("--qm-bgdim", String(dim));
    st.setProperty("--qm-bgdim-read", String(bg.read === false ? 1 : readDim));
    if (!sky && (!bg.iw || !bg.ih || typeof bg.lum !== "number" || typeof bg.lumLo !== "number")) measureBg();
    // The picture stays exactly as bright as you chose, and nothing is put between it and the text: each letter
    // gets a soft halo of the page's own tone, as strong as the picture under it needs (none over a dark one)
    const pageRgb = rgb || (light ? "244, 243, 240" : "15, 16, 18");
    const baseL = lumOf(pageRgb);
    const seen = (pic, d) => pic * (1 - d) + baseL * d;
    const need = (eff, target) => Math.max(0, Math.min(1, light ? (target - eff) / Math.max(0.02, baseL - eff) : (eff - target) / Math.max(0.02, eff - baseL)));
    const hi = sky ? sky.hi : typeof bg.lum === "number" ? bg.lum : 0.5, lo = sky ? sky.lo : typeof bg.lumLo === "number" ? bg.lumLo : 0.2;
    const pic = light ? lo : hi;
    const list = need(seen(pic, dim), light ? 0.62 : 0.08), read = need(seen(pic, bg.read === false ? 1 : readDim), light ? 0.62 : 0.08);
    const halo = (k) => { const a = (x) => Math.min(0.95, x).toFixed(3); return `0 0 1px rgba(${pageRgb}, ${a(0.2 + k * 0.45)}), 0 1px 3px rgba(${pageRgb}, ${a(0.25 + k * 0.6)}), 0 0 16px rgba(${pageRgb}, ${a(0.2 + k * 0.7)}), 0 0 34px rgba(${pageRgb}, ${a(k * 0.5)})`; };
    st.setProperty("--qm-halo", halo(list));
    st.setProperty("--qm-halo-read", halo(read));
    st.setProperty("--qm-halo-icon", `drop-shadow(0 1px 2px rgba(${pageRgb}, ${Math.min(0.9, 0.4 + list * 0.5).toFixed(3)})) drop-shadow(0 0 8px rgba(${pageRgb}, ${Math.min(0.8, 0.25 + list * 0.5).toFixed(3)}))`);
    ROOT.classList.toggle("qm-halo", list > 0.04);
    ROOT.classList.toggle("qm-halo-read", read > 0.04);
    const sz = !sky && bg.iw && bg.ih ? bgSize(bg.iw, bg.ih, window.innerWidth, window.innerHeight, bg.zoom) : null;
    st.setProperty("--qm-bgsize", sz ? Math.round(sz.w) + "px " + Math.round(sz.h) + "px" : "cover");
    st.setProperty("--qm-bgpos", sky ? "50% 50%" : (bg.x == null ? 50 : bg.x) + "% " + (bg.y == null ? 50 : bg.y) + "%");
  } else { st.removeProperty("--qm-bgimg"); ROOT.classList.remove("qm-halo", "qm-halo-read"); }
  ROOT.classList.toggle("qm-bg-noread", bg.read === false);
  // the chrome, your way: which side the menu is on, what shows next to it, fonts
  ROOT.classList.toggle("qm-side-right", prefs.side === "right");
  ROOT.classList.toggle("qm-noburger", !!prefs.edge && prefs.burger === false);
  ROOT.classList.toggle("qm-nofab", prefs.fab === false);
  ROOT.classList.toggle("qm-rail-on", !!prefs.rail);
  ROOT.classList.toggle("qm-font-system", prefs.uiFont === "system");
  ROOT.classList.toggle("qm-read-serif", prefs.readFont === "serif");
  ROOT.classList.toggle("qm-read-editorial", prefs.readFont === "editorial");
  ROOT.classList.toggle("qm-read-mono", prefs.readFont === "mono");
  st.setProperty("--qm-pane", Math.max(300, Math.min(560, Number(prefs.paneW) || 380)) + "px");
  ROOT.classList.toggle("qm-soft", !!prefs.soft);
  ROOT.classList.toggle("qm-large", prefs.size === "large");
  ROOT.classList.toggle("qm-lines", !!prefs.lines);
  st.setProperty("--qm-read", Math.max(600, Math.min(1400, Number(prefs.readWidth) || 880)) + "px");
}

/* people: names and pictures you set win over what Gmail shows */
let contacts = store.get("contacts", {}) || {}; // email -> { name, img }
const BLANK_PHOTO = /profile_mask|default-user|cleardot/;
const photos = new Map(Object.entries(store.get("photos", {})).filter(([, u]) => !BLANK_PHOTO.test(u))); // email -> Google profile photo
const seen = new Map(Object.entries(store.get("seen", {}))); // email -> { name, n, at }
let peopleDirty = 0;
function savePeopleSoon() {
  if (peopleDirty) return;
  peopleDirty = setTimeout(() => {
    peopleDirty = 0;
    store.set("photos", Object.fromEntries([...photos].slice(-400)));
    const all = [...seen].sort((a, b) => b[1].at - a[1].at);
    store.set("seen", Object.fromEntries([...all.filter(([, p]) => p.wrote).slice(0, 2000), ...all.filter(([, p]) => !p.wrote).slice(0, 400)]));
  }, 4000);
}
function saveContacts() { store.set("contacts", contacts); lastThreadSig = ""; invalidate(true); }
const isAutomated = (email) => !!email && (AUTOMATED.test(email) || (ROLE.test(email) && !PERSONAL.test(email)));
function notePerson(email, name, wrote) {
  if (!email || isAutomated(email) || email === accountEmail()) return;
  const p = seen.get(email) || { name: "", n: 0, at: 0 };
  if (name && !/^me$/i.test(name)) p.name = name;
  if (wrote && !p.wrote) { p.wrote = 1; p.at = 0; }
  if (Date.now() - p.at > 60000) { p.n++; p.at = Date.now(); seen.set(email, p); savePeopleSoon(); }
}
const personName = (email, fallback) => ((contacts[email] && contacts[email].name) || fallback || (seen.get(email) || {}).name || email || "");
const personPhoto = (email) => (contacts[email] && contacts[email].img) || photos.get(email) || "";
function initials(name) {
  const w = String(name || "?").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
}
/* a colour per person, picked by you or (like Gmail) given from a quiet set, always the same one */
const PERSON_HUES = ["#4f6fa8", "#3f8a78", "#7a5fb4", "#a85a6e", "#3a8792", "#9a7a48", "#5f7a8f", "#8e6446", "#5a8a46", "#875a91", "#46708a", "#a0644f"];
function personColor(email) {
  const c = (contacts[email] || {}).color;
  if (c) return c;
  if (!prefs.autoColors || !email) return "";
  let n = 0;
  for (const ch of email) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return PERSON_HUES[n % PERSON_HUES.length];
}
function avatarEl(email, name, cls) {
  const c = contacts[email] || {};
  const src = c.emoji ? "" : personPhoto(email);
  const el = h("span", { class: "qm-av" + (cls ? " " + cls : ""), "aria-hidden": "true" });
  const tint = () => { const col = personColor(email); if (col) { el.style.background = col; el.classList.add("qm-tint"); } };
  if (c.emoji) { el.textContent = c.emoji; el.classList.add("qm-emoji"); tint(); }
  else if (src) {
    const img = h("img", { src, alt: "", loading: "lazy", referrerpolicy: "no-referrer", draggable: "false" });
    img.addEventListener("error", () => { img.remove(); el.textContent = initials(personName(email, name)); tint(); });
    el.appendChild(img);
  } else { el.textContent = initials(personName(email, name)); tint(); }
  return el;
}

/* =================================================================== sidebar */
/* Opened from the menu button (top left) or "\". Not from the screen edge: in Zen's compact mode
   that edge belongs to Zen's own tab sidebar. */
const hasTodos = () => aiOn() && (!!$('.aeN a[href$="#aiinbox"]') || store.get("todos-on:" + accountEmail(), false));
function folderLinks() {
  const tabs = $$(".aKh [role=tab]").length > 0 || store.get("tabs:" + accountEmail(), false);
  if ($$(".aKh [role=tab]").length) store.set("tabs:" + accountEmail(), true);
  if ($('.aeN a[href$="#aiinbox"]')) store.set("todos-on:" + accountEmail(), true);
  const list = [["Inbox", "#inbox", "inbox"]];
  if (tabs) list.push(["Promotions", "#category/promotions", "promos", true], ["Social", "#category/social", "social", true], ["Updates", "#category/updates", "updates", true]);
  if (cp().paper) list.push(["The paper", "#inbox", "paper", false, openPaper]);
  if (hasTodos() && !everything) list.push(["To-dos", "#aiinbox", "todos"]);
  list.push(["Later", "#snoozed", "later"], ["Starred", "#starred", "starred"], ["Drafts", "#drafts", "drafts"], ["Sent", "#sent", "sent"], ["All mail", "#all", "allmail"], ["Done", DONE_HASH, "archive"]);
  list.push(["Files", filesHash(), "clip"]);
  if (store.get("subs-off:" + accountEmail(), false) !== true) list.push(["Senders", "#sub", "people"]);
  for (const p of pins()) list.push([p.label, searchHash(p.q), "pin"]); // searches you pinned (in Find)
  return list;
}
/* the folder being looked at, so switching account or scope keeps it */
function currentFolder() {
  const hash = baseHash(hashNow());
  const f = folderLinks().map((x) => x[1]).find((t) => hash === t || hash.startsWith(t + "/"));
  if (f) return f;
  const lab = hash.match(/^#label\/[^/]+/);
  return lab ? lab[0] : "#inbox";
}
const sideItem = (tag, attrs, ico, label, extra) => h(tag, attrs, h("span", { class: "qm-si" }, ico), h("span", { class: "qm-sl", text: label }), extra || null);
function buildSide() {
  const scrim = h("div", { id: "qm-scrim", onclick: () => closeSide() });
  const side = h("nav", { id: "qm-side", "aria-label": "Mail" });
  side.append(h("div", { class: "qm-group", id: "qm-accts" }), h("div", { class: "qm-group", id: "qm-folders" }), h("div", { class: "qm-group", id: "qm-pilegroup" }),
    h("div", { class: "qm-group qm-foot" },
      sideItem("button", { type: "button", onclick: () => { closeSide(); openFind(); } }, icon("find"), "Find", h("kbd", { "data-qmkey": "find" })),
      sideItem("button", { type: "button", onclick: () => { closeSide(); openPanel(); } }, icon("settings"), "Settings")));
  side.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const all = $$("a[href], button", side).filter(visible);
    const i = all.indexOf(document.activeElement);
    const n = all[(i + (e.key === "ArrowDown" ? 1 : all.length - 1) + (i < 0 && e.key === "ArrowUp" ? 1 : 0)) % all.length];
    if (n) { e.preventDefault(); e.stopPropagation(); n.focus({ preventScroll: true }); }
  });
  const burger = h("button", { id: "qm-burger", type: "button", "aria-label": "Menu", "data-qmtip": "Menu|menu", "aria-expanded": "false", onclick: () => toggleSide() }, icon("menu"));
  document.body.append(burger, scrim, side);
  keyHints();
  renderAccounts();
  renderFolders();
}
function renderAccounts() {
  const box = document.getElementById("qm-accts");
  if (!box) return;
  // (drawn again only when something in it changed: accounts, names, colours, counts, the folder they open)
  const sig = accounts.map((a) => a.email + "|" + accountLabel(a.email) + "|" + acctColor(a.email) + "|" + acctCount(a)).join(",") + "|" + accountIndex() + "|" + everything + "|" + currentFolder();
  applyColors();
  if (box.dataset.sig === sig && (accounts.length < 2 || box.firstChild)) { markAccount(); return; }
  box.dataset.sig = sig;
  box.replaceChildren();
  const sep = box.nextElementSibling && box.nextElementSibling.classList.contains("qm-sep") ? box.nextElementSibling : null;
  if (accounts.length < 2) { if (sep) sep.remove(); return; }
  const cur = accountIndex();
  const labels = accounts.map((a) => accountLabel(a.email));
  box.appendChild(sideItem("button", { type: "button", class: "qm-acct", "data-acct": "all", onclick: () => { closeSide(); switchAccount("all"); } }, icon("everything"), "Everything"));
  accounts.forEach((a, i) => {
    const dup = labels.filter((l) => l === labels[i]).length > 1;
    const sw = h("i", { class: "qm-sw" });
    sw.style.background = acctColor(a.email);
    const n = acctCount(a);
    const link = sideItem("a", { class: "qm-acct", href: `/mail/u/${a.index}/${currentFolder()}`, title: a.email, "data-acct": String(a.index) }, sw, dup ? a.email.split("@")[0] : labels[i], n ? h("span", { class: "qm-n", text: n, title: countNote(n) }) : null);
    link.addEventListener("click", (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); closeSide(); switchAccount(a); });
    box.appendChild(link);
  });
  markAccount();
  if (!sep) box.after(h("div", { class: "qm-sep" }));
}
function markAccount() {
  const cur = everything && accounts.length > 1 ? "all" : String(accountIndex());
  for (const a of $$("#qm-accts .qm-acct")) { if (a.getAttribute("data-acct") === cur) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); }
}
/* the numbers in the menu and ⌘K: what's new today (default), Gmail's unread counts, or none */
const startOfToday = () => new Date().setHours(0, 0, 0, 0);
function newToday(email) {
  const src = email === accountEmail() && everyFolder === "#inbox" ? sources.get(email) : null;
  const rows = src && src.ready ? [...src.rows.values()] : ((store.get(boxKey(email, "#inbox"), null) || {}).rows || []);
  const t0 = startOfToday();
  return rows.filter((r) => r.unread && r.time >= t0).length;
}
function acctCount(a) {
  if (prefs.counts === "off" || cp().title) return ""; // (no unread counts: Settings › Calm)
  if (prefs.counts === "unread") return a.index === accountIndex() ? gmailCount("#inbox") : a.unread ? Number(a.unread).toLocaleString() : "";
  const n = newToday(a.email);
  return n ? String(n) : "";
}
const countNote = (n) => (prefs.counts === "unread" ? n + " unread" : n + " new today");
function folderCount(hash) {
  if (prefs.counts === "off" || cp().title) return "";
  if (prefs.counts === "unread") return /^#(inbox|drafts|category\/|snoozed|scheduled)/.test(hash) ? gmailCount(hash) : "";
  if (hash !== "#inbox") return "";
  const n = newToday(accountEmail());
  return n ? String(n) : "";
}
/* the unread count Gmail shows next to a folder */
function gmailCount(hash) {
  const a = $$(".aeN a[href]").find((x) => x.getAttribute("href").endsWith(hash));
  const row = a && (a.closest(".TO, .aim, [role=listitem]") || a.parentElement);
  const n = row && $(".bsU", row);
  return n ? text(n) : "";
}
function renderSidePiles() {
  const box = document.getElementById("qm-pilegroup");
  if (!box) return;
  const piles = gp().pilesSide ? pileCounts() : new Map();
  const on = pileOn();
  const sig = [...piles].map(([cat, c]) => cat + pileBadge(c)).join() + "|" + on;
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.replaceChildren(...(piles.size ? [h("div", { class: "qm-sidehead", text: "Piles" }), ...[...piles].map(([cat, c]) => {
    const n = pileBadge(c);
    const el = sideItem("button", { type: "button", class: "qm-sidepile", "aria-current": on === cat ? "page" : null, onclick: () => { closeSide(); togglePile(cat); } }, icon(CAT_ICONS[cat] || "labels"), cat, n ? h("span", { class: "qm-n", text: n, title: n + " new" }) : null);
    el.style.setProperty("--cat", GEM_HUES[cat] || "var(--text-3)");
    return el;
  })] : []));
}
function renderFolders() {
  renderSidePiles();
  const box = document.getElementById("qm-folders");
  if (!box) return;
  const links = folderLinks();
  const counts = links.map((f) => (cp().title ? 0 : folderCount(f[1]))); // no unread counts (Settings › Calm)
  const sig = links.map((f) => f[1]).join() + "|" + counts.join();
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.replaceChildren(...links.map(([label, hash, ico, sub, run], i) => sideItem("a", { href: hash, "data-hash": run ? "" : hash, "data-run": run ? label : null, class: sub ? "qm-sub" : null, onclick: (e) => { if (!run && (e.metaKey || e.ctrlKey || e.shiftKey || e.button)) return; e.preventDefault(); closeSide(); if (run) run(); else { if (paperOn && hash === "#inbox") closePaper(); go(hash); } } }, icon(ico), label,
      [run ? null : counts[i] ? h("span", { class: "qm-n", text: counts[i], title: countNote(counts[i]) }) : null, i < 9 && !TABS_KEEP_NUMBERS ? h("span", { class: "qm-kn", "aria-hidden": "true", text: MOD_KEY + (i + 1) }) : null])),
      sideItem("button", { type: "button", "aria-haspopup": "menu", "aria-label": "Labels", onclick: (e) => { if (!wasOpen(e.currentTarget)) openLabels(e.currentTarget); } }, icon("labels"), "Labels"));
  }
  const hash = hashNow();
  for (const a of $$("a[data-run]", box)) { if (screen.kind === "paper") a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); }
  for (const a of $$("a[data-hash]", box)) {
    const t = a.getAttribute("data-hash");
    if (!t) continue;
    const on = t === "#inbox" ? screen.kind !== "paper" && /^#inbox(\/p\d+)?$/.test(hash) || /^#inbox\/[A-Za-z0-9]/.test(hash) : t === filesHash() ? screen.kind === "files" : hash === t || hash.startsWith(t + "/");
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  for (const a of $$("#qm-accts a.qm-acct")) { const i = a.getAttribute("data-acct"); a.setAttribute("href", `/mail/u/${i}/${currentFolder()}`); }
  markAccount();
}
/* top left, next to the menu: which account (or Everything) you're in; click to switch */
function renderChip() {
  let chip = document.getElementById("qm-chip");
  if (accounts.length < 2 || prefs.chip === "off") { if (chip) chip.remove(); renderRail(); return; }
  if (!chip) {
    chip = h("button", { id: "qm-chip", type: "button", "data-qmtip": "Switch account|palette", onclick: () => openPalette("Accounts") }, h("i", { class: "qm-sw" }), h("span"));
    document.body.appendChild(chip);
    keyHints();
  }
  const all = everything;
  const label = all ? "Everything" : accountLabel(accountEmail());
  const sw = $("i", chip);
  sw.classList.toggle("qm-all", all);
  sw.style.background = all ? "" : acctColor(accountEmail());
  if ($("span", chip).textContent !== label) $("span", chip).textContent = label;
  chip.classList.toggle("qm-chip-dot", prefs.chip === "color");
  chip.title = (prefs.chip === "color" ? label + " · " : "") + "Switch account" + (keyLabel(keyFor("palette")) ? " (" + keyLabel(keyFor("palette")) + ")" : "");
  renderRail();
}
/* the quick buttons under the menu button: which, and in what order, is yours (Settings › Layout) */
const RAIL_ITEMS = [
  ["accounts", "Your accounts", "everything"], ["find", "Find", "find"], ["compose", "New message", "write"], ["ask", "Ask", "ai"],
  ["paper", "The paper", "paper"], ["todos", "To-dos", "todos"], ["files", "Files", "clip"], ["subs", "Senders", "people"], ["starred", "Starred", "starred"],
  ["later", "Later", "later"], ["theme", "Bright and dark", "sun"], ["settings", "Settings", "settings"],
];
const RAIL_DEFAULT = ["accounts", "find", "compose", "ask"];
const railList = () => (Array.isArray(prefs.railItems) ? prefs.railItems : RAIL_DEFAULT).filter((k) => RAIL_ITEMS.some((x) => x[0] === k));
const railHasAccounts = () => !!prefs.rail && accounts.length > 1 && railList().includes("accounts");
function renderRail() {
  let rail = document.getElementById("qm-rail");
  const piles = gp().pilesRail ? pileCounts() : new Map();
  if (!prefs.rail && !piles.size) { if (rail) rail.remove(); return; }
  const multi = accounts.length > 1;
  const cur = everything && multi ? "all" : String(accountIndex());
  const here = baseHash(hashNow());
  const sig = [cur, multi, accounts.map((a) => a.email + acctColor(a.email)).join(), prefs.side, prefs.rail, railList().join(), here, screen.kind, lightWanted(), hasTodos(), JSON.stringify(prefs.keys), aiOn(), [...piles].map(([cat, c]) => cat + pileBadge(c)).join(), pileOn()].join("|");
  if (rail && rail.dataset.sig === sig) return;
  if (!rail) { rail = h("nav", { id: "qm-rail", "aria-label": "Quick" }); document.body.appendChild(rail); }
  rail.dataset.sig = sig;
  const b = (ico, label, run, on, key) => h("button", { type: "button", title: label, "aria-label": label, "data-qmtip": key ? label + "|" + key : null, "aria-current": on ? "true" : null, onclick: run }, ico);
  const sw = (email) => { const i = h("i", { class: "qm-sw" + (email ? "" : " qm-all") }); if (email) i.style.background = acctColor(email); return i; };
  const items = [];
  const page = (hash, ico, label) => b(icon(ico), label, () => { closeSide(); go(hash); }, here === hash);
  for (const k of prefs.rail ? railList() : []) {
    if (k === "accounts") {
      if (!multi) continue;
      if (items.length && items[items.length - 1].tagName !== "HR") items.push(h("hr"));
      items.push(b(sw(""), "Everything", () => switchAccount("all"), cur === "all"));
      for (const a of accounts) items.push(b(sw(a.email), accountLabel(a.email), () => switchAccount(a), cur === String(a.index)));
      items.push(h("hr"));
    }
    else if (k === "find") items.push(b(icon("find"), "Find", () => openFind(), false, "find"));
    else if (k === "compose") items.push(b(icon("write"), "New message", () => compose(), false, "compose"));
    else if (k === "ask") { if (aiOn()) items.push(b(icon("ai"), "Ask", () => openPalette(), false, "palette")); }
    else if (k === "todos") { if (hasTodos() && !everything) items.push(page("#aiinbox", "todos", "To-dos")); }
    else if (k === "files") items.push(b(icon("clip"), "Files", () => { closeSide(); go(filesHash(filesQuery())); }, screen.kind === "files"));
    else if (k === "paper") { if (cp().paper) items.push(b(icon("paper"), "The paper", () => openPaper(), screen.kind === "paper", "paper")); }
    else if (k === "subs") items.push(page("#sub", "people", "Senders"));
    else if (k === "starred") items.push(page("#starred", "starred", "Starred"));
    else if (k === "later") items.push(page("#snoozed", "later", "Later"));
    else if (k === "theme") items.push(b(icon(lightWanted() ? "moon" : "sun"), lightWanted() ? "Dark" : "Bright", () => { prefs.theme = lightWanted() ? "dark" : "light"; savePrefs(); }));
    else if (k === "settings") items.push(b(icon("settings"), "Settings", () => openPanel(), false, "settings"));
  }
  while (items.length && items[items.length - 1].tagName === "HR") items.pop();
  if (piles.size) {
    if (items.length) items.push(h("hr"));
    const on = pileOn();
    for (const [cat, c] of piles) {
      const n = pileBadge(c);
      const el = h("button", { type: "button", class: "qm-railpile", title: cat + (n ? " · " + n + " new" : "") + (on === cat ? " (showing; click for everything)" : ""), "aria-label": cat + (n ? ", " + n + " new" : ""), "aria-pressed": String(on === cat), onclick: () => togglePile(cat) }, icon(CAT_ICONS[cat] || "labels"), n ? h("span", { class: "qm-railn", text: n }) : null);
      el.style.setProperty("--cat", GEM_HUES[cat] || "var(--text-3)");
      items.push(el);
    }
  }
  rail.replaceChildren(...items);
  keyHints();
}
function toggleSide() { if (ROOT.classList.contains("qm-side-open")) closeSide(); else openSide(); }
function openSide(byKey) {
  if (!enabled || document.getElementById("qm-panel-scrim")) return;
  closeMenu();
  renderFolders();
  ROOT.classList.add("qm-side-open");
  const b = document.getElementById("qm-burger");
  if (b) b.setAttribute("aria-expanded", "true");
  if (byKey) setTimeout(() => { const cur = $('#qm-side [aria-current="page"], #qm-side [aria-current="true"]') || $("#qm-side a, #qm-side button"); if (cur) cur.focus({ preventScroll: true }); }, 0);
}
/* the menu slides out when the pointer reaches the screen edge (if you turn that on), and back in when
   it leaves the menu; it never opens while you're dragging, selecting, or in a dialog */
let edgeT = 0, edgeOut = 0, edgeOpened = false;
window.addEventListener("mousemove", (e) => {
  if (!prefs.edge || !enabled) return;
  const right = prefs.side === "right";
  const open = ROOT.classList.contains("qm-side-open");
  if (!open) {
    const at = right ? e.clientX >= window.innerWidth - 3 : e.clientX <= 2;
    if (at && !e.buttons && !palette && !document.getElementById("qm-panel-scrim") && !document.getElementById("qm-keys-scrim") && !ROOT.classList.contains("qm-writing")) {
      if (!edgeT) edgeT = setTimeout(() => { edgeT = 0; openSide(); edgeOpened = true; }, 70);
    } else if (edgeT) { clearTimeout(edgeT); edgeT = 0; }
    return;
  }
  if (!edgeOpened) return;
  const side = document.getElementById("qm-side");
  const r = side ? side.getBoundingClientRect() : null;
  const away = r && (right ? e.clientX < r.left - 40 : e.clientX > r.right + 40);
  if (away && !menu) { if (!edgeOut) edgeOut = setTimeout(() => { edgeOut = 0; if (edgeOpened) closeSide(); }, 200); }
  else if (edgeOut) { clearTimeout(edgeOut); edgeOut = 0; }
}, { passive: true });
document.addEventListener("mouseleave", () => { if (edgeT) { clearTimeout(edgeT); edgeT = 0; } });
function closeSide() {
  edgeOpened = false;
  if (!ROOT.classList.contains("qm-side-open")) return;
  closeMenu();
  ROOT.classList.remove("qm-side-open");
  const b = document.getElementById("qm-burger");
  if (b) b.setAttribute("aria-expanded", "false");
  const side = document.getElementById("qm-side");
  if (side && side.contains(document.activeElement)) document.activeElement.blur();
}
function openLabels(anchor) {
  const seen = new Set();
  const items = [];
  for (const a of $$('.aeN a[href*="#label/"]')) {
    const href = a.getAttribute("href");
    const hash = href.slice(href.indexOf("#"));
    if (seen.has(hash)) continue;
    seen.add(hash);
    const name = folderTitle(hash);
    if (name) items.push({ label: name, run: () => { closeSide(); go(hash); } });
  }
  items.sort((a, b) => a.label.localeCompare(b.label));
  openMenu(anchor, [...items, "-",
    { label: "Important", run: () => { closeSide(); go("#imp"); } },
    { label: "Scheduled", run: () => { closeSide(); go("#scheduled"); } },
    { label: "Chats", run: () => { closeSide(); go("#chats"); } },
    ...($$(".aKh [role=tab]").some((t) => /forums/i.test(text(t))) ? [{ label: "Forums", run: () => { closeSide(); go("#category/forums"); } }] : []),
    { label: "Spam", run: () => { closeSide(); go("#spam"); } },
    { label: "Trash", run: () => { closeSide(); go("#trash"); } }, "-",
    { label: "Manage labels", run: () => { closeSide(); go("#settings/labels"); } }]);
}

/* =================================================================== the view */
let view = null;
let host = null, pane = null;
function ensureView() {
  if (!view) {
    host = h("div", { class: "qm-host" });
    pane = h("aside", { class: "qm-listpane", "aria-label": "Conversations" }, h("div", { class: "qm-phead" }), h("div", { class: "qm-pscroll" }, h("div", { class: "qm-plist" })), splitHandle());
    view = h("div", { id: "qm-view", hidden: true }, pane, host);
    (document.body || ROOT).appendChild(view); // before Gmail has a body, the view sits on the page itself
  }
  return view;
}
/* ---- dual view: the list stays on the left while a conversation is open on the right ---- */
const splitWanted = () => prefs.split && window.innerWidth >= 1100;
function splitHandle() {
  const hd = h("div", { class: "qm-splitgrip", title: "Drag to resize", "aria-hidden": "true" });
  hd.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    hd.setPointerCapture(e.pointerId);
    ROOT.classList.add("qm-resizing");
    const move = (ev) => { prefs.paneW = Math.max(300, Math.min(560, Math.round(ev.clientX))); ROOT.style.setProperty("--qm-pane", prefs.paneW + "px"); };
    const up = () => { hd.removeEventListener("pointermove", move); hd.removeEventListener("pointerup", up); ROOT.classList.remove("qm-resizing"); store.set("prefs3", prefs); placeAll(); };
    hd.addEventListener("pointermove", move);
    hd.addEventListener("pointerup", up);
  });
  return hd;
}
const placeAll = () => { const c = composerOf(); if (c) placeBar(c); };
/* the search a conversation was opened from: dual view lists those results, not the last folder */
let findList = { base: "", rows: [] };
const paneSearch = () => { const h = parentHash(hashNow().split("?")[0]); return /^#search\//.test(h) && baseHash(h) === findList.base ? h : ""; };
function paneRows() {
  if (paneSearch()) return findList.rows.map(readFix);
  if (paperBack) return paperSections(paperEdition()).flatMap(([, rows]) => rows); // a story from the paper: the paper beside it
  if (everyList.length) return everyList.map(readFix);
  const box = store.get(boxKey(accountEmail(), everyFolder || "#inbox"), null);
  return box && box.rows ? box.rows.map((r) => Object.assign({ account: { index: accountIndex(), email: accountEmail() } }, r)) : [];
}
function renderPane(activeId) {
  ensureView();
  const list = paneRows();
  const head = $(".qm-phead", pane), box = $(".qm-plist", pane), sc = $(".qm-pscroll", pane);
  const title = paneSearch() ? currentQuery(paneSearch()) : paperBack ? "The Paper" : folderTitle(everyFolder || "#inbox") || "Inbox";
  if (head.textContent !== title) head.textContent = title;
  const sig = title + "|" + activeId + "|" + list.map((r) => r.id + (r.unread ? 1 : 0) + (r.starred ? 1 : 0)).join(",");
  if (box.dataset.sig === sig) return;
  const fresh = !box.dataset.sig;
  box.dataset.sig = sig;
  const multi = accounts.length > 1 && everything;
  box.replaceChildren(...list.slice(0, 400).map((r) => {
    const it = h("div", { class: "qm-pitem" + (r.unread ? " qm-unread" : "") + (r.id === activeId ? " qm-on" : ""), role: "link", "data-id": r.id },
      prefs.avatars ? rowFace(r) : null,
      h("div", { class: "qm-pmain" },
        h("div", { class: "qm-ptop" }, h("span", { class: "qm-pwho", text: whoText(r) + (r.count ? " " + r.count : "") }), multi ? h("i", { class: "qm-acctsw" }) : null, h("span", { class: "qm-pwhen", text: r.when })),
        h("div", { class: "qm-psubj", text: r.subject }),
        r.snippet ? h("div", { class: "qm-psnip", text: r.snippet }) : null));
    if (multi) it.style.setProperty("--row-acct", acctColor(r.account.email));
    it.addEventListener("click", () => { if (r.id !== screen.key) openStreamRow(r); });
    return it;
  }));
  const on = $(".qm-pitem.qm-on", box);
  if (on) requestAnimationFrame(() => { const a = on.getBoundingClientRect(), b = sc.getBoundingClientRect(); if (fresh || a.top < b.top || a.bottom > b.bottom) on.scrollIntoView({ block: fresh ? "center" : "nearest" }); });
}
let screen = { kind: "", key: "", el: null };
function setScreen(kind, key, build) {
  const v = ensureView();
  v.hidden = false;
  if (screen.kind === kind && screen.key === key && screen.el && v.contains(screen.el)) return { el: screen.el, fresh: false };
  ROOT.classList.toggle("qm-on-mail", /^(thread|reading|opening)$/.test(kind));
  if (ROOT.classList.contains("qm-mfull-on")) closeFullMsg(true); // a message open full screen belongs to the screen it was opened on
  const el = build();
  el.classList.add("qm-screen");
  if (screen.kind === "opening") el.classList.add("qm-instant"); // the conversation was already drawn
  // (the screen going had Gmail's editor over its reply box: it goes with it, and the next screen's box takes it again)
  const oc = composerOf();
  if (oc && oc.ip) detachBar(oc);
  const prevKind = screen.kind, prevEl = screen.el && screen.el.parentElement === host ? screen.el : null;
  screenAway(prevEl, el, screenHowOf(prevKind, kind));
  screen = { kind, key, el, at: Date.now() };
  screenIn(el, prevKind, kind);
  closeFileView(); // (a file open over the screen that's gone)
  return { el, fresh: true };
}
function hideView() {
  if (view) view.hidden = true;
  screen = { kind: "", key: "", el: null };
}

/* ------------------------------------------------------------------ lists
   Every folder is one long list, newest first, that keeps loading as it scrolls: Gmail shows a page at
   a time, so Umbra steps its (hidden) Older button and keeps every page it has read. In Everything the
   other accounts' lists are merged in by date. */
let cursor = -1;
// (the conversation the cursor is on: mail arriving above it, or the order changing, doesn't move it to another)
let cursorId = "";
let everyKeys = [];
const isInboxFolder = (f) => f === "#inbox" || f === "#category/primary";
const nearEnd = (sc) => sc.scrollHeight - sc.scrollTop - sc.clientHeight < 1600;
/* people on a row, as [email, name, short name] */
const rowPeople = (r) => (r.people || []).map((p) => (Array.isArray(p) ? { email: p[0], name: p[1], short: p[2] || p[1] } : p));
function whoText(r) {
  const ppl = rowPeople(r);
  if (!ppl.length) return r.from || "";
  const me = (r.account || {}).email || accountEmail();
  const many = ppl.length > 1;
  const names = ppl.map((p) => (p.email === me ? "me" : contacts[p.email] && contacts[p.email].name ? (many ? contacts[p.email].name.split(/\s+/)[0] : contacts[p.email].name) : many ? p.short || p.name : p.name || p.short));
  return (/^to:/i.test(r.from || "") ? "To: " : "") + [...new Set(names)].join(", ");
}
/* Is this address a person? Yes for anyone you've written with, anyone you've named in People, anyone
   with a Google photo, and people at personal-mail, school or your own domains. Companies, lists and
   robots are not. */
// the provider is the whole domain (gmail.com, yahoo.co.uk), so a sender's "mail.fidelity.com" doesn't count
const PERSONAL = /@(gmail|googlemail|outlook|hotmail|live|msn|icloud|me|mac|yahoo|ymail|aol|proton|protonmail|pm|gmx|fastmail|hey|zoho|yandex|mail|qq|163)\.[a-z]{2,3}(\.[a-z]{2})?$/i;
const BRANDY = /\b(team|support|news|community|online|club|app|inc|llc|ltd|co|store|shop|official|hq|daily|weekly|digest|alerts?|updates?|info|service|services|notifications?|via)\b|[(@]/i;
function isPersonAddress(email, name) {
  if (!email || isAutomated(email)) return false;
  if (contacts[email] || photos.has(email)) return true;
  const s = seen.get(email);
  if (s && s.wrote) return true;
  if (name && BRANDY.test(name)) return false;
  const domain = email.split("@")[1] || "";
  return PERSONAL.test(email) || /\.(edu|k12\.[a-z]{2}\.us)$/i.test(domain) || /\.edu\.[a-z]{2}$/i.test(domain) || accounts.some((a) => a.email.split("@")[1] === domain);
}
/* the person a row is from (not you, not a robot), if there is one */
function leadPerson(r) {
  const me = (r.account || {}).email || accountEmail();
  const ppl = rowPeople(r);
  const withMe = ppl.some((p) => p.email === me);
  return ppl.find((p) => p.email && p.email !== me && (withMe ? !isAutomated(p.email) : isPersonAddress(p.email, p.name))) || null;
}
const isFromPerson = (r) => !!leadPerson(r);
/* conversations where a person is waiting on you: Gemini's to-dos where Gmail has them, otherwise
   unread mail from a person that Gmail marks important */
const todoIds = new Map(); // account email -> Set of thread ids
function todoThreads(email) {
  const cache = store.get("todos:" + email, null);
  const key = cache ? cache.at : 0;
  const hit = todoIds.get(email);
  if (hit && hit.key === key) return hit.ids;
  const ids = new Set();
  for (const t of cache ? cache.items : []) {
    const m = String(t.href || "").match(/thread-f:(\d+)/);
    if (m) { try { ids.add(BigInt(m[1]).toString(16)); } catch (e) { /* not a number */ } }
  }
  todoIds.set(email, { key, ids });
  return ids;
}
function needsYou(r) {
  if (!prefs.needs) return false;
  const g = gp().reply ? gemFor(r) : null;
  if (g) return gemWaiting(r, g);
  const email = (r.account || {}).email || accountEmail();
  const todos = aiOn() ? todoThreads(email) : new Set();
  if (todos.size) return todos.has(r.id);
  return !!(r.unread && r.important && leadPerson(r));
}
function renderStream(r, all) {
  const folder = baseHash(r.hash);
  ensureSources(folder, all);
  const key = streamKey;
  const { el, fresh } = setScreen("stream", key, () => {
    const scroll = h("div", { class: "qm-scroll" }, h("div", { class: "qm-inbox" },
      h("div", { class: "qm-selslot" }), h("h1", { class: "qm-title", text: folderTitle(folder) }), h("div", { class: "qm-filterslot" }), h("section", { class: "qm-brief", "aria-label": "What matters" }), h("div", { class: "qm-rows" }), h("div", { class: "qm-tail" })));
    scroll.addEventListener("scroll", () => { streamScroll.set(key, scroll.scrollTop); if (nearEnd(scroll) && !pileStop) everythingMore(); }, { passive: true });
    return h("div", {}, scroll, h("div", { class: "qm-fade" }));
  });
  const scroll = $(".qm-scroll", el);
  const box = $(".qm-rows", el);
  if (fresh) { cursor = -1; everyKeys = []; box.replaceChildren(); chosen.clear(); }
  const multi = all && accounts.length > 1;
  box.classList.toggle("qm-all", multi);
  box.classList.toggle("qm-avs", !!prefs.avatars);
  for (const s of sources.values()) {
    if (s.kind === "main" && s.ready && !s.busy) absorbMain(s);
    if (s.kind === "other" && !s.asked && !s.busy && liveTab(s.account.email) && !s.fresh) { s.asked = true; askMore(s); }
  }
  // back on a list Gmail left on a later page: show page 1 again underneath, so new mail comes in
  const main = mainSource(), m = mainList(folder);
  if (fresh && main && m && !main.busy && listPage(m) > 1) firstPage(folder);
  // what's selected (⌘-click, x, ⇧J): the bar that acts on all of it
  selectionSlot($(".qm-selslot", el));
  // the brief
  const brief = $(".qm-brief", el);
  if (aiOn() && isInboxFolder(folder) && prefs.brief) {
    // (mail held for the next tide, or from someone quieted, isn't in the brief either)
    const c = cp();
    const mine = main ? [...main.rows.values()].filter((r) => !calmHere() || !/^(held|quiet)$/.test(calmFate(r, c))).sort((a, b) => b.time - a.time) : [];
    const own = ownBriefLines(mine);
    if (!peeking && !peekTimer) peekTimer = setTimeout(() => { peekTimer = 0; peekTodos(); }, 6000);
    fillBrief(brief, multi ? everyBriefLines() : own);
  } else brief.replaceChildren();
  const list = streamRows();
  // (a row on its way out stays where it was until it has gone: redrawn meanwhile, the list doesn't cut it short)
  for (const [id, x] of rowsLeaving) {
    if (Date.now() - x.at > 700) { rowsLeaving.delete(id); continue; }
    if (list.some((r) => r.id === id)) continue;
    const at = everyList.findIndex((r) => r.id === id);
    if (at >= 0) list.splice(Math.min(at, list.length), 0, x.r);
  }
  renderCalm(el, list, folder);
  binNote(el, folder, list.length);
  // newest first, under quiet day headings (Today, Yesterday, Monday, …)
  const items = [];
  let lastDay = "";
  for (const x of list) {
    const d = prefs.order === "date" ? dayLabel(x.time) : "";
    if (d && d !== lastDay) { items.push({ day: d }); lastDay = d; }
    items.push(x);
  }
  const keyOf = (x) => (x.day ? "@" + x.day : rowKey(x));
  const keys = items.map(keyOf);
  const make = (x) => { const el = x.day ? h("div", { class: "qm-day", text: x.day }) : streamRow(x, multi); el.dataset.k = keyOf(x); return el; };
  // most updates only add rows at the end: append those instead of redrawing a long list
  const same = everyKeys.length <= keys.length && everyKeys.every((k, i) => k === keys[i]);
  if (!same) {
    const first = !box.children.length;
    const redraw = () => reconcileRows(box, items, keyOf, make, everyKeys[0] === "!redraw");
    if (first) { redraw(); if (screenHow.how === "pop" && Date.now() - screenHow.at < 2000) cameBack(box); else staggerIn(box); }
    else flipRows(box, redraw);
  } else if (keys.length > everyKeys.length) box.append(...items.slice(everyKeys.length).map(make));
  everyKeys = keys;
  everyList = list;
  seePile(pileOn());
  renderRail();
  if (gemOn() && list.slice(0, 12).some((x) => !gemFor(x) && x.time > Date.now() - 20 * 60 * 1000 && (!gemAccount() || String((x.account && x.account.email) || accountEmail()).toLowerCase() === gemAccount()))) gemFetch(true);
  const on = activeFilters();
  // a pile looks back only as far as Gemini has read: older mail has no notes to match
  const reachedBack = [...sources.values()].reduce((a, s) => Math.min(a, s.oldest), Infinity);
  pileStop = on.length > 0 && on.some((f) => f.id.startsWith("cat:")) && gem.oldest < Infinity && reachedBack < gem.oldest - 86400000;
  const more = !pileStop && !calmEnded() && (!sources.size || [...sources.values()].some((s) => !s.ready || !s.done || s.busy));
  const loaded = loadedRows();
  const capped = on.length > 0 && more && ![...sources.values()].some((s) => s.busy || !s.ready) && loaded >= filterReach;
  // the filter bar: stays in sight above the list while anything is filtered out
  const fslot = $(".qm-filterslot", el);
  const fsig = on.map((f) => f.id).join();
  const fcount = list.length.toLocaleString() + (more && !capped ? "+" : "") + " shown";
  if (fslot.dataset.sig !== fsig) {
    fslot.dataset.sig = fsig;
    if (!on.length) fslot.replaceChildren();
    else {
      let bar = $(":scope > .qm-filterbar", fslot);
      if (!bar) { bar = h("div", { class: "qm-filterbar", role: "status", "aria-label": "Filters on" }); fslot.replaceChildren(bar); }
      bar.replaceChildren(icon("filter"), h("span", { class: "qm-flabel", text: "Only" }),
        ...on.map((f) => h("button", { type: "button", class: "qm-fchip", title: "Stop filtering by " + f.label.toLowerCase(), onclick: () => setFilter(f.id, false) }, f.label, icon("x"))),
        h("span", { class: "qm-fcount", text: fcount }),
        h("button", { type: "button", class: "qm-fclear", onclick: clearFilters }, "Show all", h("kbd", { text: "esc" })));
    }
  }
  const fc = $(".qm-fcount", fslot);
  if (fc && fc.textContent !== fcount) fc.textContent = fcount;
  const tail = $(".qm-tail", el);
  const ended = !on.length && calmEnded();
  const want = (ended ? "ended" : capped ? "reach" : more ? "more" : list.length ? "" : "empty") + "|" + on.map((f) => f.id).join();
  if (tail.dataset.state !== want) {
    tail.dataset.state = want;
    const kind = want.split("|")[0];
    tail.replaceChildren(...(kind === "more" ? [h("div", { class: "qm-loading", "aria-label": "Loading" }, h("i"), h("i"), h("i"))]
      : kind === "reach" ? [h("div", { class: "qm-reach" }, h("span", { text: "Looked through the latest " + loaded.toLocaleString() + " conversations." }), h("button", { type: "button", onclick: () => { filterReach = loadedRows() + FILTER_STEP; everythingMore(true); invalidate(true); } }, "Look further back"))]
      : kind === "empty" && on.length ? [h("div", { class: "qm-reach" }, h("span", { text: "Nothing here matches." }), h("button", { type: "button", onclick: clearFilters }, "Show all"))]
      : kind === "ended" ? [h("div", { class: "qm-reach qm-ended" }, h("span", { text: "That's the last " + (cp().ends === "1m" ? "month" : "two weeks") + "." }), h("button", { type: "button", onclick: () => go("#all") }, "Older mail is in All mail"))]
      : kind === "empty" ? [h("div", { class: "qm-empty", text: isInboxFolder(folder) ? "Nothing here. Enjoy it." : "Nothing here." })] : []));
  }
  if (cursor < 0 && cursorBack) { const i = list.findIndex((r) => r.id === cursorBack); if (i >= 0) { cursor = i; cursorId = cursorBack; } cursorBack = ""; }
  if (cursor >= 0 && cursorId) { const i = list.findIndex((r) => r.id === cursorId); if (i >= 0) cursor = i; } // (gone: the next one)
  if (cursor >= list.length) cursor = list.length - 1;
  cursorId = cursor >= 0 && list[cursor] ? list[cursor].id : "";
  const wasCur = $(":scope > .qm-row.qm-cursor", box);
  $$(".qm-row", box).forEach((x, i) => x.classList.toggle("qm-cursor", i === cursor));
  const nowCur = $(":scope > .qm-row.qm-cursor", box);
  if (wasCur && nowCur && wasCur !== nowCur && !(ROOT.classList.contains("qm-soft") && ROOT.classList.contains("qm-bgimg"))) slideTo(wasCur, nowCur);
  $(".qm-inbox", el).dataset.order = list.map((r) => r.id).join(",");
  if (fresh && list.length && streamScroll.get(key)) scroll.scrollTop = streamScroll.get(key);
  requestAnimationFrame(() => { if (scroll.isConnected && nearEnd(scroll) && !pileStop) everythingMore(); });
}
/* bring a list up to date in place: a row that hasn't changed stays the very same element (the one under the
   pointer keeps its hover and its buttons, nothing flickers); a changed one is swapped where it stands, and if
   it was the one under the pointer, it comes in already showing its buttons */
function reconcileRows(box, items, keyOf, make, all) {
  const old = new Map();
  for (const c of box.children) if (c.dataset.k && !old.has(c.dataset.k)) old.set(c.dataset.k, c);
  const hot = $$(":scope > .qm-row", box).find((r) => r.matches(":hover") || r.classList.contains("qm-hot"));
  const hotId = hot ? hot.dataset.id : "";
  const used = new Set();
  const next = items.map((x) => {
    let el = all ? null : old.get(keyOf(x));
    if (!el || used.has(el)) { el = make(x); if (hotId && el.dataset.id === hotId) el.classList.add("qm-hot"); }
    used.add(el);
    return el;
  });
  next.forEach((el, i) => { if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null); });
  while (box.children.length > next.length) box.lastElementChild.remove();
}
const rowKey = (x) => x.id + (x.unread ? "u" : "") + (x.draft ? "d" : "") + (x.starred ? "s" : "") + (needsYou(x) ? "n" : "") + x.when + (x.subject || "") + ((gemFor(x) || {}).mid || "") + (x.files ? "f" + x.files.length : "");
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function dayLabel(t) {
  if (!t) return "";
  const d = new Date(t), now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return DAYS_LONG[d.getDay()];
  if (diff < 14) return "Last week";
  if (d.getFullYear() === now.getFullYear()) return d.getMonth() === now.getMonth() ? "Earlier this month" : MONTHS_LONG[d.getMonth()];
  return MONTHS_LONG[d.getMonth()] + " " + d.getFullYear();
}
/* a company's own logo (its website's icon), on a light disc so dark logos show */
const logoMiss = new Set(store.get("logo-miss", []));
function brandDomain(email) {
  const d = String(email || "").split("@")[1] || "";
  const p = d.toLowerCase().split(".");
  if (p.length <= 2) return d.toLowerCase();
  const two = p[p.length - 1].length === 2 && /^(co|com|org|net|ac|gov|edu|ne|or|go)$/.test(p[p.length - 2]);
  return p.slice(two ? -3 : -2).join(".");
}
function logoEl(email, name, cls) {
  const domain = brandDomain(email);
  const el = h("span", { class: "qm-av qm-logo" + (cls ? " " + cls : ""), "aria-hidden": "true", title: name || domain || "" });
  const mono = () => { el.classList.add("qm-mono"); el.replaceChildren(); el.textContent = initials(name || domain); };
  if (!domain || PERSONAL.test("x@" + domain) || logoMiss.has(domain)) { mono(); return el; }
  const img = h("img", { src: "https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://" + domain + "&size=64", alt: "", loading: "lazy", referrerpolicy: "no-referrer", draggable: "false" });
  const fail = () => { logoMiss.add(domain); store.set("logo-miss", [...logoMiss].slice(-400)); mono(); };
  img.addEventListener("load", () => { if (img.naturalWidth < 24) fail(); });
  img.addEventListener("error", fail);
  el.appendChild(img);
  return el;
}
/* the picture for a row or a message: the person's photo or initials, or the company's logo */
function faceFor(email, name, person, cls) {
  if (person || personPhoto(email)) return avatarEl(email, name, cls);
  return logoEl(email, name, cls);
}
function rowFace(r) {
  const lead = leadPerson(r);
  if (lead) return avatarEl(lead.email, lead.name, "qm-rav");
  const me = (r.account || {}).email || accountEmail();
  const p = rowPeople(r).find((x) => x.email && x.email !== me);
  if (p) return faceFor(p.email, p.name, false, "qm-rav");
  if (r.from) return logoEl("", r.from.replace(/^to:\s*/i, ""), "qm-rav");
  return h("span", { class: "qm-av qm-rav qm-none", "aria-hidden": "true" });
}
function streamRow(r, multi) {
  const here = !r.account || r.account.index === accountIndex();
  const draftRow = everyFolder === "#drafts"; // a draft on its own (not a conversation): it's discarded, not done
  const person = isFromPerson(r);
  const needs = needsYou(r);
  // Gemini's notes on it (Settings › Gemini): its one line instead of the preview, what it is, when it's due, the detail worth seeing
  const g = gemFor(r), G = gp();
  const line = G.summaries && g && g.summary ? g.summary : "";
  const quiet = (!person && prefs.dimAuto) || gemQuiet(g);
  const face = prefs.avatars ? rowFace(r) : null;
  // a picture is also a checkbox: click it to select
  if (face) face.addEventListener("click", (e) => { e.stopPropagation(); choose(r); });
  // (the ring round it says this one is waiting on you: so does pointing at it)
  if (face && needs) face.title = (face.title ? face.title + " · " : "") + "Waiting on you";
  const row = h("div", { class: "qm-row" + (r.unread ? "" : " qm-read") + (quiet ? " qm-auto" : "") + (needs ? " qm-needs" : "") + (chosen.has(r.id) ? " qm-chosen" : ""), role: "link", tabindex: "-1", "data-id": r.id },
    face,
    h("span", { class: "qm-who" }, needs ? h("i", { class: "qm-needdot", title: "Waiting on you" }) : null, r.draft && !(draftRow && whoText(r) === r.draft) ? h("span", { class: "qm-tag", text: r.draft }) : null, h("span", { class: "qm-name", text: whoText(r) }), r.count ? h("span", { class: "qm-count", text: r.count }) : null),
    h("span", { class: "qm-subj" }, G.tags && g && g.category && g.category !== "People" ? catTag(g.category) : null, h("span", { class: "qm-s1", text: r.subject }),
      line ? h("span", { class: "qm-s2 qm-gem", title: line, text: line }) : r.snippet ? h("span", { class: "qm-s2", text: r.snippet }) : null),
    h("span", { class: "qm-marks" },
      G.key && g && g.key ? keyChip(g.key) : codeChip(r),
      G.due && g && g.due && (r.unread || dueState(g.due) !== "late") ? dueChip(g.due) : null,
      r.attach ? fileMark(r) : null,
      r.starred ? h("span", { class: "qm-mark qm-star", title: "Starred" }, icon("starred")) : null,
      multi ? h("i", { class: "qm-acctsw", title: accountLabel(r.account.email) }) : null),
    h("span", { class: "qm-when", text: r.when, title: r.whenFull || null }),
    h("span", { class: "qm-rowacts", onclick: (e) => e.stopPropagation() },
      ib("starred", withKey(r.starred ? "Unstar" : "Star", "star"), (e) => { e.stopPropagation(); (here ? rowDo : rowDoThere)(r, "star", row); }, "qm-s" + (r.starred ? " qm-on" : "")),
      draftRow ? null : ib(r.unread ? "mailopen" : "allmail", r.unread ? withKey("Mark read", "read") : withKey("Mark unread", "unread"), (e) => { e.stopPropagation(); (here ? rowDo : rowDoThere)(r, "read", row); }, "qm-s"),
      here && !draftRow && !binFolder() ? menuButton("later", withKey("Later", "later"), (b) => rowDo(r, "later", row, b), "qm-s") : null,
      draftRow ? (here ? ib("trash", "Discard draft (" + keyLabel(keyFor("trash")) + ")", (e) => { e.stopPropagation(); rowDo(r, "discard", row); }, "qm-s") : null)
        : binFolder() ? (here ? [
          everyFolder === "#spam" ? ib("inbox", "Not spam", (e) => { e.stopPropagation(); rowGmail(r, ["Not spam"], ["Not spam"]).then((ok) => { if (ok) hideRow(r, row, "done"); }); }, "qm-s")
            : ib("inbox", "Back to the inbox", (e) => { e.stopPropagation(); rowGmail(r, ["Move to Inbox"], ["Move to Inbox"]).then((ok) => { if (ok) hideRow(r, row, "done"); }); }, "qm-s"),
          ib("trash", withKey("Delete forever", "trash"), (e) => { e.stopPropagation(); rowDo(r, "trash", row); }, "qm-s")] : null)
        : ib("done", withKey("Done", "done"), (e) => { e.stopPropagation(); (here ? rowDo : rowDoThere)(r, "done", row); }, "qm-s"),
      here ? menuButton("more", "More", (b) => rowMore(r, b), "qm-s") : null));
  row.addEventListener("pointerleave", () => row.classList.remove("qm-hot"));
  if (multi) row.style.setProperty("--row-acct", acctColor(r.account.email));
  row.addEventListener("click", (e) => openStreamRow(r, e));
  row.qmItem = r;
  return row;
}
/* a row from another of your accounts (Everything): that account's tab does it, out of sight, and this one
   shows it done at once. With no tab open for that account, it says so. */
// `want` is how it should end up: starred or not (star), unread or not (read). Several asked at once (a selection)
// all reach that tab: they queue under one key, each taken once.
function rowDoThere(r, kind, rowEl, target) {
  const email = r.account && r.account.email;
  if (!email || !liveTab(email)) { toast("Open " + (email ? accountLabel(email) : "that account") + " in a tab to do that from here."); return; }
  const want = kind === "star" ? (target !== undefined ? target : !r.starred) : kind === "read" ? (target !== undefined ? target : !r.unread) : true;
  if ((kind === "star" && !!r.starred === want) || (kind === "read" && !!r.unread === want)) return; // already so
  const q = store.get("do", null);
  const list = (Array.isArray(q) ? q : q ? [q] : []).filter((x) => x && Date.now() - x.at < 15000);
  list.push({ email, id: r.id, kind, want, at: Date.now(), tab: TAB_ID, n: Math.random() });
  store.set("do", list.slice(-60));
  if (kind === "star") { r.starred = want; popStar(starOf(refreshRow(r, rowEl))); }
  else if (kind === "read") { r.unread = want; if (!want) noteRead(r.id, r.time); else forgetRead(r.id); refreshRow(r, rowEl); }
  else hideRow(r, rowEl, kind);
}
/* …and in that account's tab: the same as its own buttons would do */
const doneDo = new Set();
function doHere(reqs) {
  if (!enabled) return;
  for (const req of Array.isArray(reqs) ? reqs : reqs ? [reqs] : []) {
    if (!req || req.email !== accountEmail() || req.tab === TAB_ID || Date.now() - req.at > 15000 || doneDo.has(req.n)) continue;
    const lead = store.get("live:" + accountEmail(), null);
    if (lead && lead.tab !== TAB_ID && Date.now() - lead.at < 75000) continue; // (another tab of this account is the one that does it)
    doneDo.add(req.n);
    if (doneDo.size > 300) doneDo.delete(doneDo.values().next().value);
    const mine = [...sources.values()].map((x) => x.rows && x.rows.get(req.id)).find(Boolean);
    const r = Object.assign({ id: req.id }, mine || {});
    // (rowDo turns it over: set it to the opposite of what's wanted first, and it ends up as wanted)
    if (req.kind === "star") { if (mine && !!r.starred === req.want) continue; r.starred = !req.want; }
    if (req.kind === "read") { if (mine && !!r.unread === req.want) continue; r.unread = !req.want; }
    rowDo(r, req.kind === "done" ? "done" : req.kind, null);
  }
}
/* Trash and Spam: what happens to what's there, and Gmail's own way to empty it at once (Gmail asks to be sure) */
function binNote(el, folder, n) {
  const slot = $(".qm-title", el);
  let note = $(":scope > .qm-binnote", slot.parentElement);
  const bin = folder === "#trash" || folder === "#spam";
  const m = gmailMain();
  const link = bin && m && $$('[role="link"], [role="button"], span', m).find((x) => /^(empty trash now|delete all spam messages now)$/i.test(text(x)) && x.childElementCount === 0);
  const want = bin && n ? folder + (link ? "+" : "") : "";
  if ((note ? note.dataset.k : "") === want) return;
  if (note) note.remove();
  if (!want) return;
  note = h("div", { class: "qm-binnote" }, h("span", { text: folder === "#trash" ? "Mail in Trash is deleted for good after 30 days." : "Spam is deleted for good after 30 days." }),
    link ? h("button", { type: "button", onclick: () => { const l = $$('[role="link"], [role="button"], span', gmailMain() || document).find((x) => /^(empty trash now|delete all spam messages now)$/i.test(text(x)) && x.childElementCount === 0); if (l) press(l); else toast("Gmail doesn't offer that just now."); } }, folder === "#trash" ? "Empty Trash now" : "Delete all spam now") : null);
  note.dataset.k = want;
  slot.after(note);
}
/* a row's files: the first one's name (and how many more), opening it in Gmail's own viewer from the list; a row whose
   files Gmail didn't name, or another account's, shows the clip */
function fileMark(r) {
  const names = r.files || [];
  if (!names.length) return h("span", { class: "qm-mark", title: "Has attachments" }, icon("clip"));
  const ext = (names[0].match(/\.([a-z0-9]{1,5})$/i) || [])[1] || "";
  const here = !r.account || r.account.index === accountIndex();
  const chip = h("button", { type: "button", class: "qm-rowfile", title: names.join("\n") + (here ? "\n(click to open)" : ""), "aria-label": "Open " + names[0] },
    h("i", { class: "qm-rfext", text: (ext || "file").toUpperCase().slice(0, 4) }), h("span", { text: names[0].replace(/\.[a-z0-9]{1,5}$/i, "") }), names.length > 1 ? h("b", { text: "+" + (names.length - 1) }) : null);
  chip.querySelector(".qm-rfext").style.setProperty("--ext", EXT_COLORS[ext.toLowerCase()] || "#8b93a3");
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    const live = here && liveRow(r.id);
    const g = live && $$(".brc", live).find((c) => (c.getAttribute("title") || text(c)).trim() === names[0]);
    if (g) press(g); else openStreamRow(r); // (not on Gmail's page: the email, with its files)
  });
  return chip;
}
/* redraw one row in place (after starring, marking read, …) */
function refreshRow(r, rowEl) {
  if (!rowEl || !rowEl.isConnected) { invalidate(true); return; }
  const multi = rowEl.parentElement && rowEl.parentElement.classList.contains("qm-all");
  const next = streamRow(r, multi);
  next.classList.toggle("qm-cursor", rowEl.classList.contains("qm-cursor"));
  rowEl.replaceWith(next);
  const i = everyList.indexOf(r);
  if (i >= 0) { const k = everyKeys.indexOf(everyKeys.find((x) => x.startsWith(r.id))); if (k >= 0) everyKeys[k] = rowKey(r); }
  return next;
}
const starOf = (row) => row && $('.qm-rowacts [aria-label^="Star" i], .qm-rowacts [aria-label^="Unstar" i]', row);
/* Done, Delete and Later work on any row: on Gmail's page directly, or by opening the conversation
   out of sight for a moment when Gmail is showing a different page */
// (one at a time, in the order asked: a second one waits its turn, never dropped)
let ghost = false, ghostChain = Promise.resolve(), ghostJobs = 0;
function ghostThread(r, fn) {
  const job = ghostChain.then(() => ghostRun(r, fn));
  ghostChain = job.catch(() => {});
  return job;
}
const openThreadId = () => { const h2 = $("h2.hP", gmailMain() || document); return h2 ? h2.getAttribute("data-legacy-thread-id") || "" : ""; };
async function ghostRun(r, fn) {
  await settlePeek();
  // (you asked to go somewhere: it waits until you're there, and what you opened is on screen)
  await until(() => !waitingGo && !opening, 6000, 60);
  const back = hashNow();
  // the list it's on (from inside a conversation: the list that conversation is in)
  const base = r.folder || (isThreadHash(back) ? parentHash(back) : baseHash(back));
  ghostJobs++;
  ghost = true;
  const release = holdTitle();
  let went = "";
  try {
    const live = liveRow(r.id);
    if (live && !r.folder) press($(".xS", live) || live);
    else { went = threadHash(base, r.id); location.replace(went); }
    // this conversation open (not whichever one was on screen before), with its buttons
    const ok = await until(() => route().kind === "thread" && openThreadId() === String(r.id) && (gmailToolbar("7", ["Archive"]) || gmailToolbar("10", ["Delete"])), 8000, 80);
    if (ok) { ghostFn = true; try { await fn(); } finally { ghostFn = false; } }
    return !!ok;
  } finally {
    // back where it was, unless you went somewhere else yourself meanwhile
    const now = hashNow();
    const ours = now === went || (isThreadHash(now) && openThreadId() === String(r.id)) || baseHash(now) === baseHash(base);
    if (now !== back && ours) location.replace(back);
    release();
    goWaiting();
    setTimeout(() => { if (--ghostJobs <= 0) { ghostJobs = 0; ghost = false; } invalidate(true); }, 250);
  }
}
/* a conversation that left the list from inside it (Done, Delete, Spam, Later): Done and Later take it out of the
   inbox only; Delete and Spam out of everything but Trash and Spam themselves */
function dropRow(id, how) {
  if (!id) return;
  id = String(id);
  const f = everyFolder || "#inbox";
  const leaves = how === "trash" || how === "spam" ? !/^#(trash|spam)$/.test(f) : isInboxFolder(f) || /^#category\//.test(f);
  if (!leaves) return;
  gone.set(id, Date.now());
  for (const s of sources.values()) { const r = s.rows.get(id); if (r) { goneRows.set(id, r); s.rows.delete(id); } }
  const k = boxKey(accountEmail(), f), box = store.get(k, null);
  if (box && box.rows && box.rows.some((r) => r.id === id)) store.set(k, Object.assign({}, box, { rows: box.rows.filter((r) => r.id !== id), sig: "" }));
}
// (rows taken out here, kept a while: an undo puts the very row back where it was)
const goneRows = new Map();
function hideRow(r, rowEl, how) {
  goneRows.set(String(r.id), r);
  while (goneRows.size > 200) goneRows.delete(goneRows.keys().next().value);
  gone.set(r.id, Date.now());
  for (const s of sources.values()) s.rows.delete(r.id);
  if (rowEl && !prefersStill()) { rowsLeaving.set(r.id, { r, at: Date.now() }); rowAway(rowEl, how); }
  setTimeout(() => { rowsLeaving.delete(r.id); invalidate(true); }, prefersStill() ? 0 : 620); // (once it has gone and its space has closed)
}
const hereFolder = () => (screen.kind === "stream" || screen.kind === "" ? everyFolder || baseHash(hashNow()) : baseHash(parentHash(hashNow())));
const binFolder = () => /^#(trash|spam)$/.test(hereFolder());
async function rowDo(r, kind, rowEl, anchor) {
  if (kind === "discard") { discardDrafts([r], rowEl ? [rowEl] : []); return; }
  // (in Trash and Spam there's nothing to archive, and deleting is for good)
  if (kind === "done" && (binFolder() || hereFolder() === "#drafts")) { toast("Done isn't available here."); return; }
  let forever = false;
  if (kind === "trash" && binFolder()) {
    if (!(await confirmBox({ title: "Delete forever?", body: ["“" + (r.subject || "(no subject)") + "” will be gone for good. This can't be undone."], ok: "Delete forever", danger: true }))) return;
    forever = true;
  }
  const live = liveRow(r.id);
  if (kind === "star") {
    r.starred = !r.starred;
    popStar(starOf(refreshRow(r, rowEl)));
    if (live) { const st = $(".T-KT", live); if (st) press(st); }
    else {
      const wasUnread = r.unread;
      ghostThread(r, async () => {
        const stars = $$('.T-KT[aria-label], [aria-label="Not starred" i], [aria-label="Starred" i]', gmailMain());
        const st = stars[stars.length - 1];
        if (st) press(st);
        await wait(300);
        // (opening it read it: unread it stays)
        if (wasUnread) { const b = gmailToolbar("2", ["Mark as unread"]); if (b) press(b); await wait(250); }
      });
    }
    return;
  }
  if (kind === "read") {
    const toUnread = !r.unread;
    r.unread = toUnread;
    if (toUnread) forgetRead(r.id); else noteRead(r.id, r.time);
    refreshRow(r, rowEl);
    // (Gmail's hover buttons can be turned off in its settings: then out of sight, by the toolbar's own ids)
    if (live && rowAction(live, toUnread ? "li[data-tooltip^='Mark as unread' i], .brs" : "li[data-tooltip^='Mark as read' i], .brr", true)) return;
    ghostThread(r, async () => { if (toUnread) { const b = gmailToolbar("2", ["Mark as unread"]); if (b) press(b); await wait(300); } });
    return;
  }
  if (kind === "later") {
    if (live) { rowLater(live, anchor); return; }
    ghostThread(r, async () => { await threadLater(anchor); await until(() => !(gmailPop && gmailPop.els.some(visible)), 120000, 250); });
    return;
  }
  hideRow(r, rowEl, kind);
  const u = forever ? null : pushUndo(kind === "done" ? { label: "Done “" + (r.subject || "") + "”", after: "Back in the inbox.", ids: [r.id], undo: () => unDone([r.id]) } : { label: "Deleted “" + (r.subject || "") + "”", after: "Back from Trash.", ids: [r.id], undo: () => unTrash([r.id]) });
  const sel = kind === "done" ? ".brq, li[data-tooltip='Archive']" : forever ? ".bru, li[data-tooltip^='Delete forever' i], li[data-tooltip='Delete']" : ".bru, li[data-tooltip='Delete']";
  if (live && rowAction(live, sel, true)) return;
  let pressed = false;
  ghostThread(r, async () => { const b = kind === "done" ? gmailToolbar("7", ["Archive"]) : forever ? gmailToolbar("10", ["Delete forever"]) || gmailToolbar("10", ["Delete"]) : gmailToolbar("10", ["Delete"]); if (b) pressed = press(b); await wait(350); })
    .then((ok) => { if (!ok || !pressed) putBack(r, u, kind === "done" ? "Couldn't put that away just now: Gmail didn't open it." : "Couldn't delete that just now: Gmail didn't open it."); }, () => putBack(r, u, "Couldn't do that just now."));
}
/* ⌘Z for something done from inside a conversation */
function undoFor(id, kind, subject) {
  if (!id) return;
  pushUndo(kind === "done" ? { label: "Done “" + (subject || "") + "”", after: "Back in the inbox.", ids: [String(id)], undo: () => unDone([String(id)]) } : { label: "Deleted “" + (subject || "") + "”", after: "Back from Trash.", ids: [String(id)], undo: () => unTrash([String(id)]) });
}
/* what was taken out of the list for an action that didn't happen goes back, and says so */
function putBack(r, u, say) {
  gone.delete(String(r.id));
  goneRows.delete(String(r.id));
  const src = mainSource();
  if (src && !src.rows.has(r.id)) src.rows.set(r.id, r);
  if (u) { const i = undos.indexOf(u); if (i >= 0) undos.splice(i, 1); }
  everyKeys = ["!redraw"];
  invalidate(true);
  if (say) toast(say);
}
function openRow(row) { press($(".xS", row) || row); }
function rowAction(row, sel, quiet) {
  row.dispatchEvent(mouseEvent(row, "mouseover", { bubbles: true }));
  const b = $(sel, row);
  if (b) press(b); else if (!quiet) toast("That isn't available here.");
  return !!b;
}
function rowLater(row, anchor) {
  row.dispatchEvent(mouseEvent(row, "mouseover", { bubbles: true }));
  const b = $(".brv, li[data-tooltip='Snooze']", row);
  if (!b) { toast("Snooze isn't available here."); return; }
  openGmailPopup(async () => press(b), anchor);
}
function pagerEl(main) {
  const tm = $('[gh="tm"]', main) || main;
  const newer = $(".amD.T-I-Js-IF", tm);
  const older = $(".amD.T-I-Js-Gs", tm);
  const off = (b) => !b || b.getAttribute("aria-disabled") === "true" || b.classList.contains("T-I-JE");
  if (off(newer) && off(older)) return null;
  return h("div", { class: "qm-pager" },
    h("button", { type: "button", disabled: off(newer), onclick: () => press(newer) }, "Newer"),
    h("button", { type: "button", disabled: off(older), onclick: () => press(older) }, "Older"));
}

/* ------------------------------------------------------------------ the brief
   The few lines at the top of the inbox. Where Gmail's own Gemini is included (AI Inbox), they are
   its suggested to-dos: free, and it has read everything. Otherwise Umbra's AI writes them from the
   recent conversations with real people. Each tab shares its lines so Everything can show them all. */
const AUTOMATED = /(^|[._+-])(no-?reply|do-?not-?reply|notifications?|notify|newsletters?|news|mailer|digest|alerts?|updates?|info|marketing|support|billing|accounts?|security|team|hello|receipts?|orders?|shipping)([._+-]|@)/i;
// role words that only mean a robot at a company's own domain (store.owner@gmail.com is still a person)
const ROLE = /(^|[._+-])(returns?|auto-?confirm|confirm(ation)?s?|shipments?|tracking|deliver(y|ies)|invoices?|payments?|statements?|rewards?|offers?|deals?|promo(tions?)?|sales|customer(service|care)?|service|help|feedback|surveys?|admin|system|bots?|bounces?|postmaster|calendar|events?|members(hip)?|store|shop|reminders?|verify|verification)([._+-]|@)/i;
let lastOwnBrief = null;
/* The lines at the top of an inbox: Gmail's own to-dos where the account has Gemini, otherwise Umbra's AI
   reads the inbox (people first, and the automated mail that carries something for you: an assignment,
   a deadline, a form). Each inbox can be switched off in Settings › AI; all are on to begin with. */
const briefOn = (email) => (prefs.briefs || {})[email] !== false;
const geminiIn = (email) => (email === accountEmail() ? hasGemini() : store.get("gemini:" + email, false) === true || store.get("todos-on:" + email, false));
function briefPool(rows) {
  const week = Date.now() - 7 * 86400000, recent = Date.now() - 3 * 86400000;
  const people = [], other = [];
  for (const x of rows) {
    if (x.time && x.time < week) continue;
    if (isFromPerson(x)) { if (x.unread || /\bme\b/.test(whoText(x)) || x.important) people.push(x); }
    else if (x.unread && (!x.time || x.time >= recent)) other.push(x);
  }
  return [...people.slice(0, 18), ...other].slice(0, 25);
}

/* =================================================================== Gemini on new mail
   A Workspace Studio flow in your Google account ("Umbra · Gemini on new mail") has Gemini read every
   email as it arrives: a one-line summary, what kind of mail it is, what you need to do and by when,
   its priority, whether someone is waiting on a reply, and the one detail worth seeing (a code, an
   amount, a tracking number). It writes a row per email to a sheet in your Drive and labels the email
   in Gmail. Umbra reads that sheet with your own sign-in and uses it everywhere: free, and already done
   before you open anything. Settings › Gemini switches each part on or off. */
const GEM_CATS = ["People", "School", "Projects", "Money", "Orders", "Travel", "Events", "Security", "Updates", "Newsletters", "Promotions", "Social"];
const GEM_HUES = { People: "#86b49b", School: "#7f9fd4", Projects: "#a896d6", Money: "#c9b27e", Orders: "#d09a7c", Travel: "#6fb1b6", Events: "#d7a35f", Security: "#cf8f9e", Updates: "#9aa3b0", Newsletters: "#8d96a8", Promotions: "#8a8f99", Social: "#a3a0c4" };
const GEM_DEFAULTS = { on: true, summaries: true, piles: true, pilesRail: true, pilesSide: true, counts: true, tags: false, due: true, key: true, reply: true, quiet: true, notes: true, thread: true, ideas: true };
const CAT_ICONS = { People: "people", School: "cap", Projects: "code", Money: "coin", Orders: "box", Travel: "plane", Events: "today", Security: "shield", Updates: "updates", Newsletters: "paper", Promotions: "promos", Social: "social" };
const gp = () => Object.assign({}, GEM_DEFAULTS, prefs.gem);
var gem = { rows: new Map(), at: 0, sig: "", error: "", total: 0, busy: false, tried: 0, oldest: Infinity };
var pileStop = false; // a pile is showing and the list already reaches back past everything Gemini has read
const gemSheet = () => String(prefs.gemSheet || (ai.flow && ai.flow.sheet) || (flowSaved && flowSaved.sheet) || "").trim();
const gemAccount = () => String(prefs.gemAccount || (ai.flow && ai.flow.account) || (flowSaved && flowSaved.account) || "").toLowerCase();
const gemOn = () => aiOn() && gp().on && !!gemSheet();
const sheetId = (s) => { const m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(s || ""); return m ? m[1] : /^[a-zA-Z0-9_-]{30,}$/.test((s || "").trim()) ? s.trim() : ""; };
function gemAuthuser() { const a = accounts.find((x) => x.email === gemAccount()); return a ? a.index : accountIndex(); }
/* the sheet as rows of cells (quotes, commas and line breaks inside cells handled) */
function parseCSV(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const gemNone = (v) => { v = String(v || "").trim(); return /^(none|n\/a|na|null|nil|-|—|no|nothing|not applicable|no deadline)\.?$/i.test(v) ? "" : v; };
// "October 8, 2026 at 8:59 AM EDT"
function gemWhen(s) { const t = Date.parse(String(s || "").replace(/\s+at\s+/i, " ").replace(/\s+[A-Z]{2,5}$/, "")); return isNaN(t) ? 0 : t; }
// "2026-10-09 17:00" or "2026-10-09"
function gemDue(s) {
  const m = /(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(s || ""));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 23, m[4] ? +m[5] : 59);
  return isNaN(d.getTime()) ? null : { t: d.getTime(), allDay: !m[4] };
}
function dueLabel(due) {
  const d = new Date(due.t), now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86400000);
  const time = due.allDay ? "" : " " + d.toLocaleTimeString([], d.getMinutes() ? { hour: "numeric", minute: "2-digit" } : { hour: "numeric" });
  const when = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : diff > 1 && diff < 7 ? DAYS_LONG[d.getDay()].slice(0, 3) : MONTHS[d.getMonth()] + " " + d.getDate();
  return when + time;
}
const dueState = (due) => (due.t < Date.now() ? "late" : due.t - Date.now() < 36 * 3600 * 1000 ? "soon" : "");
function gemLoad(data) {
  const lines = parseCSV(data.csv || "");
  // Google's sheet query guesses how many rows are header when it isn't told, and can glue the first rows of
  // data onto the header ("Thread ID 1a11b98c…"): such a copy is thrown away and the sheet read again (asked
  // with headers=1, it doesn't happen)
  const { cols: c, merged } = sheetColumns(lines[0]);
  if (merged) { store.set("gem:data", null); gem.at = 0; gem.tried = 0; setTimeout(() => gemFetch(true), 0); return; }
  if (c.tid < 0) { gem.error = "That sheet has no “Thread ID” column."; return; }
  const cell = (l, i) => (i >= 0 ? l[i] || "" : "");
  const rows = new Map();
  for (const l of lines.slice(1)) {
    const tid = cell(l, c.tid).trim().toLowerCase();
    if (!/^[0-9a-f]{10,20}$/.test(tid)) continue;
    const mid = cell(l, c.mid).trim().toLowerCase();
    const prev = rows.get(tid);
    if (prev && hexCmp(prev.mid, mid) >= 0) continue; // the newest email of each conversation
    const catRaw = gemNone(cell(l, c.cat)).replace(/[^A-Za-z ]/g, "").trim();
    const category = GEM_CATS.find((x) => x.toLowerCase() === catRaw.toLowerCase()) || (catRaw ? catRaw[0].toUpperCase() + catRaw.slice(1).toLowerCase() : "");
    const from = cell(l, c.from).split("|").map((x) => x.trim());
    rows.set(tid, {
      tid, mid, received: gemWhen(cell(l, c.rec)), fromName: from[0] && !/@/.test(from[0]) ? from[0] : "", fromEmail: (from[1] || from[0] || "").toLowerCase(),
      subject: cell(l, c.subj), summary: gemNone(cell(l, c.sum)), category, action: gemNone(cell(l, c.act)), due: gemDue(gemNone(cell(l, c.due))),
      priority: gemNone(cell(l, c.pri)).toLowerCase(), reply: /^y/i.test(cell(l, c.rep).trim()), key: gemNone(cell(l, c.key)).slice(0, 60),
      replyText: gp().ideas ? gemNone(cell(l, c.rtext)) : "", replyLabel: gemNone(cell(l, c.rlabel)).replace(/[.:"“”]+$/g, "").slice(0, 40),
    });
  }
  gem.rows = rows;
  gem.oldest = [...rows.values()].reduce((a, r) => (r.received && r.received < a ? r.received : a), Infinity);
  gem.total = Math.max(0, lines.length - 1);
  gem.at = data.at;
  gem.error = "";
  const sig = rows.size + ":" + [...rows.values()].reduce((a, r) => (hexCmp(r.mid, a) > 0 ? r.mid : a), "");
  if (sig !== gem.sig) { gem.sig = sig; everyKeys = ["!redraw"]; lastThreadSig = ""; invalidate(true); }
}
const hexCmp = (a, b) => (String(a).length - String(b).length) || (a > b ? 1 : a < b ? -1 : 0);
/* read the sheet (shared between tabs; at most every 90 seconds unless asked) */
function gemFetch(force) {
  const id = gemSheet();
  if (!aiOn() || !gp().on || !id || gem.busy) return;
  const cached = store.get("gem:data", null);
  if (cached && cached.sheet === id && cached.at !== gem.at) gemLoad(cached);
  if (cached && cached.sheet === id && Date.now() - cached.at < (force ? 20 : 90) * 1000) return;
  if (typeof GM_xmlhttpRequest !== "function" || Date.now() - gem.tried < 15000) return;
  // which signed-in account owns the sheet must be known first (asking as another one only fails)
  const owner = gemAccount();
  if (owner && owner !== accountEmail() && !accounts.some((a) => a.email === owner)) return;
  gem.busy = true;
  gem.tried = Date.now();
  const tq = encodeURIComponent("select * order by L desc limit 800");
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1&authuser=${gemAuthuser()}&tq=${tq}`; // (exactly one header row)
  const done = (err) => { gem.busy = false; if (err) { gem.error = err; invalidate(); } };
  GM_xmlhttpRequest({
    method: "GET", url, timeout: 20000,
    onload: (res) => {
      const text = res.responseText || "";
      if (res.status !== 200 || !/thread id/i.test(text.slice(0, 300))) { done(res.status === 200 ? "Couldn't read the sheet: is " + (gemAccount() || "this account") + " signed in here?" : "The sheet didn't answer (" + res.status + ")."); return; }
      const data = { at: Date.now(), sheet: id, csv: text };
      store.set("gem:data", data);
      done("");
      gemLoad(data);
    },
    onerror: () => done("Couldn't reach Google Sheets."),
    ontimeout: () => done("Google Sheets took too long."),
  });
}
/* Gemini's notes on a list row (only rows of the account the flow runs in) */
function gemFor(r) {
  if (!r || !r.id || !gem.rows.size || !gemOn()) return null;
  const acct = String((r.account && r.account.email) || accountEmail() || "").toLowerCase();
  if (gemAccount() && acct !== gemAccount()) return null;
  return gem.rows.get(String(r.id).toLowerCase()) || null;
}
/* someone's waiting on you: Gemini said a reply is needed, and nobody (you included) has written since */
const gemWaiting = (r, g) => !!(g && g.reply && (!r.lastMsg || !g.mid || hexCmp(String(r.lastMsg).toLowerCase(), g.mid) <= 0));
const gemQuiet = (g) => !!(g && gp().quiet && g.priority === "low");
/* the notes at the top of the inbox: what Gemini says you need to do, soonest deadline first */
function gemNoteLines(rows, email) {
  if (!gp().notes || !gem.rows.size || (gemAccount() && String(email || "").toLowerCase() !== gemAccount())) return [];
  const now = Date.now(), week = now - 7 * 86400000;
  const out = [];
  for (const r of rows) {
    const g = gem.rows.get(String(r.id).toLowerCase());
    if (!g || !g.action || (r.time && r.time < week)) continue;
    const waiting = gemWaiting(r, g);
    const upcoming = g.due && g.due.t > now - 12 * 3600 * 1000;
    if (!r.unread && !waiting && !upcoming) continue;
    out.push({ key: "gem:" + g.tid + ":" + g.mid, tid: g.tid, text: g.action.replace(/\.$/, "") + (g.due ? " · " + dueLabel(g.due) : ""), open: () => openStreamRow(r),
      rank: (g.due ? 4e13 - g.due.t : 0) + (waiting ? 2e13 : 0) + (r.unread ? 1e13 : 0) + (r.time || 0) / 1000 });
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, 4);
}
/* piles: the inbox by what it is, from Gemini's categories: icons under the menu button, a group in the
   menu, and ⌘K. One click shows just that pile; again, everything */
/* each pile's count is what's new in it: unread mail you haven't looked at there yet. Opening the pile
   clears it; it comes back when something new arrives */
var pileSeen = null;
const pileMark = (r) => r.id + ":" + (r.time || 0);
const pileSeenSet = () => pileSeen || (pileSeen = new Set(store.get("pile-seen", [])));
function pileCounts() {
  const counts = new Map();
  if (!gemOn() || !gp().piles || !sources.size) return counts;
  const seen = pileSeenSet();
  for (const r of streamRows(true)) {
    const g = gemFor(r);
    if (!g || !g.category) continue;
    const c = counts.get(g.category) || { n: 0, fresh: 0 };
    c.n++;
    if (r.unread && !seen.has(pileMark(r))) c.fresh++;
    counts.set(g.category, c);
  }
  return new Map([...counts].sort((a, b) => (GEM_CATS.indexOf(a[0]) + 1 || 99) - (GEM_CATS.indexOf(b[0]) + 1 || 99)));
}
const pileBadge = (c) => (gp().counts && c.fresh ? (c.fresh > 99 ? "99+" : String(c.fresh)) : "");
function seePile(cat) {
  if (!cat) return;
  const seen = pileSeenSet();
  let added = false;
  for (const r of streamRows(true)) { const g = gemFor(r); if (g && g.category === cat && r.unread && !seen.has(pileMark(r))) { seen.add(pileMark(r)); added = true; } }
  if (!added) return;
  const keep = [...seen].slice(-2000);
  pileSeen = new Set(keep);
  store.set("pile-seen", keep);
}
const pileOn = () => ([...filters].find((id) => id.startsWith("cat:")) || "").slice(4);
function togglePile(cat) {
  const was = pileOn();
  for (const id of [...filters]) if (id.startsWith("cat:")) filters.delete(id);
  if (cat !== was) seePile(cat);
  setFilter(cat !== was ? "cat:" + cat : "", cat !== was);
}
const catFilter = (id) => ({ id, label: id.slice(4), ico: "filter", test: (r) => { const g = gemFor(r); return !!g && g.category === id.slice(4); } });
/* on a row: what it is, when it's due, the detail worth seeing */
function catTag(cat) { const el = h("i", { class: "qm-cat", title: cat, "aria-label": cat }); el.style.setProperty("--cat", GEM_HUES[cat] || "var(--text-4)"); return el; }
function dueChip(due) {
  const st = dueState(due);
  return h("span", { class: "qm-due" + (st ? " qm-" + st : ""), title: (st === "late" ? "Was due " : "Due ") + new Date(due.t).toLocaleString([], { weekday: "long", month: "long", day: "numeric", hour: due.allDay ? undefined : "numeric", minute: due.allDay ? undefined : "2-digit" }) }, icon("today"), dueLabel(due));
}
function keyChip(k) {
  const val = k.replace(/^(code|pin|otp|verification code|your code is)[:\s]*/i, "").trim();
  const code = /^[A-Z0-9][A-Z0-9-]{3,11}$/i.test(val) && /\d/.test(val) && !/\s/.test(val);
  if (!code) return /\d/.test(val) && val.length <= 22 ? h("span", { class: "qm-key", title: k, text: val }) : null;
  const el = h("button", { type: "button", class: "qm-key qm-code", title: "Copy " + val, "aria-label": "Copy " + val, text: val });
  el.addEventListener("click", (e) => { e.stopPropagation(); navigator.clipboard.writeText(val).then(() => toast("Copied " + val + "."), () => toast("Couldn't copy.")); });
  return el;
}

/* the brief costs one AI request; it is reused for a while rather than redone on every new email */
function aiBrief(email, rows) {
  const pool = briefPool(rows);
  const k = "b3:" + email + ":" + hashString(pool.map((x) => x.id + (x.unread ? 1 : 0)).join(","));
  const lastB = store.get("brief-last2:" + email, null);
  let found = null;
  if (!pool.length) found = [];
  else if (!aiCache.has(k) && lastB && Date.now() - lastB.at < 30 * 60 * 1000) found = lastB.lines;
  else {
    const res = ask(k, { kind: "brief", today: new Date().toDateString(), items: pool.map((x, i) => ({ index: i, from: whoText(x), subject: x.subject, preview: x.snippet || "", time: x.whenFull, unread: x.unread, important: !!x.important, includesMe: /\bme\b/.test(whoText(x)), automated: !isFromPerson(x) })) }, invalidate);
    // kept by conversation, not by place in the list, so the lines still point right when it's reused
    if (res) found = ((res && res.lines) || []).map((l) => ({ text: l.text, ids: (Array.isArray(l.refs) ? l.refs : []).map((n) => (pool[n] || {}).id).filter(Boolean) }));
    if (res && (!lastB || lastB.k !== k)) store.set("brief-last2:" + email, { at: Date.now(), k, lines: found });
    // while the AI thinks (or can't be reached), the last lines stay rather than the brief blinking away
    if (!res && lastB && Date.now() - lastB.at < KEPT_BRIEF) found = lastB.lines;
  }
  const lines = (found || []).map((l) => {
    const ref = (l.ids || []).map((id) => rows.find((r) => r.id === id)).find(Boolean);
    return { key: "ai:" + hashString(l.text), text: l.text, tid: (l.ids || [])[0] || "", open: ref ? () => openStreamRow(ref) : null };
  });
  lines.ready = !!found;
  return lines;
}
function ownBriefLines(rows) {
  const me = accountEmail();
  let lines;
  if (!briefOn(me)) { lines = []; lines.ready = true; }
  else if (hasTodos() && prefs.gemini) {
    const cache = store.get("todos:" + me, null);
    const items = (cache ? cache.items : []).slice(0, 4);
    lines = items.map((t) => ({ key: "todo:" + t.id, text: t.title, href: t.href || "", open: () => (t.href ? openFrom(t.href, hashNow()) : openTodo(t.id)) }));
    const seen = new Set(items.map((t) => (/([0-9a-f]{16})/i.exec(t.href || "") || [])[1]).filter(Boolean).map((x) => x.toLowerCase()));
    lines.push(...gemNoteLines(rows, me).filter((l) => !seen.has(l.tid)).slice(0, Math.max(0, 5 - lines.length)));
    lines.ready = !!cache || lines.length > 0;
  } else if (gemNoteLines(rows, me).length) { lines = gemNoteLines(rows, me); lines.ready = true; }
  else if (ai.ready && rows.length) lines = aiBrief(me, rows);
  else { lines = []; lines.ready = false; }
  if (lines.ready) keepBrief(me, lines);
  else if (briefOn(me)) lines = keptBrief(me) || lines; // this inbox still loading (just switched here): last time's lines
  lastOwnBrief = { sig: lines.map((l) => l.key).join(), lines };
  return lines;
}
/* every inbox's brief is kept, so it shows at once on the way in (switching accounts, a new tab) and
   stays when the AI is out of reach, instead of appearing and disappearing */
const KEPT_BRIEF = 24 * 3600 * 1000;
const briefSaved = new Map();
function keepBrief(email, lines) {
  if (!email || lines.kept) return;
  const sig = lines.map((l) => l.key).join();
  if (briefSaved.get(email) === sig) return;
  briefSaved.set(email, sig);
  store.set("brief:" + email, { at: Date.now(), lines: lines.map((l) => ({ key: l.key, text: l.text, tid: l.tid || "", href: l.href || "" })) });
}
function keptBrief(email, acct) {
  const b = store.get("brief:" + email, null);
  if (!b || !Array.isArray(b.lines) || Date.now() - b.at > KEPT_BRIEF) return null;
  const lines = b.lines.map((l) => Object.assign({}, l, { open: keptOpen(l, acct) }));
  lines.ready = true;
  lines.kept = true;
  return lines;
}
/* what a kept line opens: its conversation, here or in its own account */
function keptOpen(l, a) {
  const tid = String(l.tid || "");
  if (a && a.email !== accountEmail()) return () => location.assign(`/mail/u/${a.index}/` + (l.href || (tid ? threadHash("#inbox", tid) : "#inbox")));
  if (l.href) return () => openFrom(l.href, hashNow());
  if (/^todo:/.test(l.key || "")) return () => openTodo(l.key.slice(5));
  if (!tid) return null;
  return () => { const r = streamRows(true).find((x) => String(x.id).toLowerCase() === tid.toLowerCase()); if (r) openStreamRow(r); else go(threadHash("#inbox", tid)); };
}
/* Everything: each inbox's lines, made here when that inbox has no tab of its own doing it */
function everyBriefLines() {
  const own = lastOwnBrief ? lastOwnBrief.lines : [];
  const lines = own.map((l) => Object.assign({ acct: accountLabel(accountEmail()), email: accountEmail() }, l));
  for (const a of accounts) {
    if (a.email === accountEmail() || !briefOn(a.email)) continue;
    const add = (list, fallback) => { for (const l of list) lines.push({ key: l.key, text: l.text, acct: accountLabel(a.email), email: a.email, open: l.open || fallback }); };
    const fresh = (x) => x && Date.now() - x.at < 12 * 3600 * 1000;
    const todos = store.get("todos:" + a.email, null);
    const gem = prefs.gemini && store.get("todos-on:" + a.email, false);
    if (gem && fresh(todos)) {
      add(todos.items.slice(0, 4).map((t) => ({ key: "todo:" + t.id, text: t.title, open: t.href ? () => location.assign(`/mail/u/${a.index}/${t.href}`) : null })), () => location.assign(`/mail/u/${a.index}/#aiinbox`));
      continue;
    }
    const src = sources.get(a.email);
    const rows = src && src.ready ? [...src.rows.values()].sort((x, y) => y.time - x.time) : [];
    const gl = gemNoteLines(rows, a.email);
    if (gl.length) { keepBrief(a.email, gl); add(gl); continue; }
    if (!gem && ai.ready && rows.length) { const al = aiBrief(a.email, rows); if (al.ready) { keepBrief(a.email, al); add(al); continue; } }
    const kept = keptBrief(a.email, a);
    if (kept) add(kept, () => location.assign(`/mail/u/${a.index}/#inbox`));
  }
  lines.ready = own.ready !== false || lines.length > 0;
  return lines;
}
function fillBrief(box, lines) {
  const shown = lines.filter((l) => !dismissed.has(l.key)).slice(0, 5);
  const sig = shown.map((l) => l.key).join() + "|" + !!lines.ready + "|" + lines.length;
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  // (a line that's still there stays the very same line: dismissing one doesn't make the others fade in again)
  const old = new Map([...box.children].map((c) => [c.dataset.k, c]));
  const parts = shown.map((l) => {
    const k = l.key + "|" + hashString(l.text + (l.acct || ""));
    const keep = old.get(k);
    if (keep && !keep.classList.contains("qm-out")) return keep;
    // whose it is: the account's colour square, as on every row (its name when you point at it)
    const sq = l.acct && accounts.length > 1 ? h("i", { class: "qm-acctsw qm-linesw", title: l.acct, "aria-label": l.acct }) : null;
    if (sq && l.email) sq.style.background = acctColor(l.email) || "var(--text-5)";
    const line = h("div", { class: "qm-line" + (l.open ? " qm-go" : "") }, h("p", { text: l.text }), sq);
    line.dataset.k = k;
    if (l.open) $("p", line).addEventListener("click", l.open);
    line.appendChild(h("button", { type: "button", class: "qm-x", "aria-label": "Dismiss", onclick: () => collapseAway(line, () => { dismiss(l.key); box.dataset.sig = ""; invalidate(true); }) }, icon("x")));
    return line;
  });
  parts.forEach((p, i) => { if (box.children[i] !== p) box.insertBefore(p, box.children[i] || null); });
  while (box.children.length > parts.length) box.lastElementChild.remove();
}

/* ------------------------------------------------------------------ to-dos (Gmail's AI Inbox) */
function readTodos() {
  const main = gmailMain();
  if (!main || hashNow() !== "#aiinbox") return null;
  const items = $$(".JXl77[data-identifier]", main).filter(visible).map((it) => {
    const title = text($(".QP2yhe", it));
    const desc = $$("span", it).map((s) => s.childElementCount ? "" : text(s)).filter((t) => t.length > 30 && t !== title).sort((a, b) => b.length - a.length)[0] || "";
    const link = $('a[href*="thread-f:"]', it);
    const href = link ? link.getAttribute("href") : "";
    return { id: it.getAttribute("data-identifier"), title, desc, el: it, href: href ? href.slice(href.indexOf("#")) : "" };
  }).filter((t) => t.title);
  return items;
}
let todosSaved = "";
function saveTodos(items) {
  const me = accountEmail();
  if (!me || !items) return;
  const list = items.map(({ id, title, desc, href }) => ({ id, title, desc, href }));
  // (written when they change, or once a few minutes have passed: not on every redraw, which other tabs hear)
  const sig = me + JSON.stringify(list);
  const was = store.get("todos:" + me, null);
  if (sig === todosSaved && was && Date.now() - was.at < 300000) return;
  todosSaved = sig;
  store.set("todos:" + me, { at: Date.now(), items: list });
}
// Gmail's controls on a to-do: real buttons (Remind me, Mark done) and a clickable "View"
const todoButton = (it, label) => $$("button, [role=button], [jscontroller][jsaction]", it).find((b) => (b.getAttribute("aria-label") || "").toLowerCase() === label || text(b).toLowerCase() === label);
function showAllTodos() {
  const main = gmailMain();
  const more = main && $$("button", main).find((b) => /^Show \d+ more$/i.test(text(b)));
  if (more) press(more);
}
async function openTodo(id) {
  if (hashNow() !== "#aiinbox") go("#aiinbox");
  const it = await until(() => { const m = gmailMain(); return m && hashNow() === "#aiinbox" && $(`.JXl77[data-identifier="${CSS.escape(id)}"]`, m); }, 10000);
  if (!it) { showAllTodos(); return; }
  const a = $('a[href*="thread-f:"]', it);
  if (a) openFrom(a.getAttribute("href").slice(a.getAttribute("href").indexOf("#")), "#aiinbox");
}
/* open a conversation and have Back return to where it was opened from */
function openFrom(hash, from) {
  session.set("back", from);
  backFor = "";
  backPending = true;
  go(hash);
}
/* keep the to-dos fresh without showing Gmail: look at the AI Inbox for a moment, then come back */
let peeking = false, peekAbort = false, lastPeek = 0, lastInput = Date.now(), peekTimer = 0;
/* Gmail keeps open messages in its address: a look elsewhere while one is open (or opening) would
   minimize it, so there's none then */
const writingAnything = () => !!morph || !!replyOpening || $$('.nH.Hd[role="dialog"], .ip.adB').length > 0 || /[?&]compose=/.test(location.hash);
/* before Umbra asks Gmail to open anything, a quick look behind the screen (Gmail's to-dos, another
   folder's count) is stopped and Gmail is back where it was: otherwise it would take the new window with it */
async function settlePeek() {
  if (!peeking) return;
  peekAbort = true;
  await until(() => !peeking, 6000, 20);
  // and Gmail settled back on its page: a button pressed while it's still switching back goes unheard
  await until(() => !/^#aiinbox/.test(hashNow()) && !!gmailMain(), 2000, 30);
  await wait(250);
}
for (const t of ["keydown", "mousedown", "wheel", "touchstart"]) window.addEventListener(t, () => { lastInput = Date.now(); if (peeking) peekAbort = true; }, { capture: true, passive: true });
async function peekTodos() {
  if (!enabled || !aiOn() || peeking || Date.now() - lastPeek < 45 * 60 * 1000 || !$('.aeN a[href$="#aiinbox"]')) return;
  const back = hashNow();
  // only while the inbox list is simply on screen and nobody is doing anything
  const busy = findMode || findPending || menu || (gmailPop && gmailPop.els.some(visible)) || ROOT.classList.contains("qm-side-open") || ROOT.classList.contains("qm-writing") ||
    document.getElementById("qm-panel-scrim") || typing(document.activeElement) || screen.kind !== "stream" || writingAnything();
  if (!/^#inbox$/.test(back) || document.hidden || busy || Date.now() - lastInput < 8000 || morph || replyOpening) { peekTimer = peekTimer || setTimeout(() => { peekTimer = 0; if (!peeking) peekTodos(); }, 5000); return; }
  peeking = true;
  peekAbort = false;
  lastPeek = Date.now();
  const release = holdTitle();
  try {
    location.replace("#aiinbox");
    const got = await until(() => peekAbort || findMode || (readTodos() || []).length, 12000, 250);
    if (got && !peekAbort && !findMode) {
      showAllTodos();
      await wait(600);
      saveTodos(readTodos());
    }
  } finally {
    if (hashNow() === "#aiinbox") location.replace(back);
    release();
    goWaiting();
    setTimeout(() => { peeking = false; invalidate(true); }, 300);
  }
}
let lastTodoSig = "";
/* a page reached from the menu (To-dos, Subscriptions): its title, with the way back beside it */
function titleRow(title) {
  return h("div", { class: "qm-titlerow" }, ib("back", "Back", goBack, "qm-tback"), h("h1", { class: "qm-title", text: title }));
}
function renderTodos(r) {
  const { el, fresh } = setScreen("todos", "todos", () => h("div", {}, h("div", { class: "qm-scroll" }, h("div", { class: "qm-inbox" }, titleRow("To-dos"), h("div", { class: "qm-todos" }))), h("div", { class: "qm-fade" })));
  if (fresh) { lastTodoSig = null; setTimeout(showAllTodos, 400); }
  const got = readTodos();
  const items = got || [];
  if (items.length) saveTodos(items);
  // (Gmail still drawing its list: a moment's wait, then the list or "Nothing to do", never a blank page)
  const ready = got && (items.length || listSettled() && Date.now() - screen.at > 1500);
  if (!ready) { if (lastTodoSig !== "wait") { lastTodoSig = "wait"; $(".qm-todos", el).replaceChildren(h("div", { class: "qm-loading", "aria-label": "Loading" }, h("i"), h("i"), h("i"))); setTimeout(() => invalidate(true), 1600); } return; }
  const sig = "ok:" + items.map((t) => t.id + t.title).join("|");
  if (sig === lastTodoSig) return;
  lastTodoSig = sig;
  const box = $(".qm-todos", el);
  box.replaceChildren(...items.map((t) => {
    const row = h("div", { class: "qm-todo", role: "link", tabindex: "-1" },
      h("div", { class: "qm-todo-t", text: t.title }),
      t.desc ? h("div", { class: "qm-todo-d", text: t.desc.replace(/\s*\d+$/, "") }) : null,
      h("span", { class: "qm-rowacts", onclick: (e) => e.stopPropagation() },
        ib("done", "Done", () => { if (press(todoButton(t.el, "mark done"))) row.classList.add("qm-out"); else toast("Couldn't mark that done here."); }, "qm-s"),
        menuButton("later", "Later", (b) => openGmailPopup(async () => { if (!press(todoButton(t.el, "remind me"))) toast("Later isn't available for this one."); }, b), "qm-s")));
    row.addEventListener("click", () => (t.href ? openFrom(t.href, "#aiinbox") : openTodo(t.id)));
    return row;
  }));
  if (!items.length) box.appendChild(h("div", { class: "qm-empty", text: "Nothing to do." }));
}

/* ------------------------------------------------------------------ subscriptions
   Gmail's own list of what you're subscribed to (newsletters, stores, services), most frequent first,
   shown Umbra's way: who, how often, and Unsubscribe (Gmail's own, which asks you to confirm). Clicking
   a sender shows their mail. */
let subsFind = "";
function readSubs(main) {
  return $$('tr[role="row"]', main).map((tr) => {
    const cells = $$('[role="gridcell"]', tr);
    if (cells.length < 4) return null;
    const btn = $$("button", tr).find((b) => /unsubscribe/i.test(b.getAttribute("aria-label") || "") && visible(b)) || $$("button", tr).find((b) => /unsubscribe/i.test(b.getAttribute("aria-label") || ""));
    const last = text(cells[cells.length - 1]);
    return { tr, name: text(cells[1]), email: text(cells[2]).toLowerCase(), freq: text(cells[3]), btn, done: !btn || /unsubscribed/i.test(last) };
  }).filter((x) => x && (x.name || x.email));
}
function renderSubs(r) {
  const { el, fresh } = setScreen("subs", "subs", () => {
    const input = h("input", { type: "text", placeholder: "Find a sender", "aria-label": "Find a sender", autocomplete: "off", spellcheck: "false" });
    input.addEventListener("input", () => { subsFind = input.value; invalidate(); });
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); if (input.value) { input.value = ""; subsFind = ""; invalidate(); } else input.blur(); } });
    return h("div", {}, h("div", { class: "qm-scroll" }, h("div", { class: "qm-inbox qm-subs" },
      titleRow("Senders"),
      h("div", { class: "qm-seg qm-subtabs", role: "tablist", "aria-label": "Senders" }),
      h("p", { class: "qm-subnote" }),
      h("label", { class: "qm-subfind" }, icon("find"), input),
      h("div", { class: "qm-sublist" }), h("div", { class: "qm-tail" }))), h("div", { class: "qm-fade" }));
  });
  if (fresh) { subsFind = ""; const i = $(".qm-subfind input", el); if (i) i.value = ""; }
  const all = readSubs(r.main);
  if (all.length) store.set("subs-off:" + accountEmail(), false);
  // three ways to look at who sends you mail: what you subscribed to, what you never open, who takes your time
  if (subsTabs(el, all)) return;
  const note = $(".qm-subnote", el), noteText = "Newsletters and other mail you signed up for, most frequent first. After you unsubscribe, a sender can take a few days to stop.";
  if (note.textContent !== noteText) note.textContent = noteText;
  const q = subsFind.trim().toLowerCase();
  const subs = q ? all.filter((x) => (x.name + " " + x.email).toLowerCase().includes(q)) : all;
  const box = $(".qm-sublist", el);
  const sig = subs.map((x) => x.email + (x.done ? 1 : 0)).join() + "|" + q;
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.replaceChildren(...subs.map((x) => {
    const row = h("div", { class: "qm-subrow" + (x.done ? " qm-subdone" : ""), role: "link", tabindex: "0", title: "Mail from " + (x.name || x.email) },
      logoEl(x.email, x.name, "qm-subav"),
      h("span", { class: "qm-subwho" }, h("b", { text: x.name || x.email }), h("small", { text: x.email })),
      h("span", { class: "qm-subfreq", text: x.freq.replace(/\s*emails?\s*recently/i, " lately") }),
      x.done ? h("span", { class: "qm-subtag", text: "Unsubscribed" })
        : h("button", { type: "button", class: "qm-subbtn", onclick: (e) => { e.stopPropagation(); press(x.btn); } }, "Unsubscribe"));
    const open = () => go(searchHash("from:" + x.email));
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === row) { e.preventDefault(); open(); } });
    return row;
  }));
  $(".qm-tail", el).replaceChildren(...(subs.length ? [] : [h("div", { class: "qm-empty", text: q ? "No sender matches." : all.length ? "" : "Gmail hasn't listed any subscriptions here yet." })]));
}

/* ------------------------------------------------------------------ files
   Everything attached to your mail, and the big files Gmail sent as Drive links, as files: newest first,
   what each is, who sent it and in which email. Gmail's own search finds the emails (the list behind Umbra
   pages through them); each email's print view, fetched quietly (it marks nothing read), says what's in it.
   From here a file opens in place, downloads, or leads to its email; and to make room in your Google
   storage, a copy of each file is kept on your computer before the email goes to Trash. */
const FILES_Q = "{has:attachment has:drive}";
const FILE_KINDS = [
  ["all", "All", ""],
  ["image", "Images", "filename:(jpg OR jpeg OR png OR gif OR heic OR webp OR svg)"],
  ["pdf", "PDFs", "filename:pdf"],
  ["doc", "Documents", "filename:(doc OR docx OR pages OR odt OR rtf OR txt)"],
  ["sheet", "Spreadsheets", "filename:(xls OR xlsx OR csv OR numbers OR ods)"],
  ["slide", "Slides", "filename:(ppt OR pptx OR key OR odp)"],
  ["archive", "Archives", "filename:(zip OR rar OR 7z OR tar OR gz)"],
  ["drive", "Drive links", "has:drive"],
];
const filesHash = (extra) => searchHash(FILES_Q + (extra ? " " + extra : ""));
const isFilesQuery = (q) => q === FILES_Q || q.startsWith(FILES_Q + " ");
let files = { kind: "all", from: null, large: false, find: "", sort: "new", picked: new Set() };
/* the Gmail search for what's chosen (kind, sender, size) */
function filesQuery() {
  const k = FILE_KINDS.find((x) => x[0] === files.kind);
  return [k && k[2], files.from ? "from:" + files.from.email : "", files.large ? "larger:10M" : ""].filter(Boolean).join(" ");
}
const goFiles = () => { files.picked.clear(); go(filesHash(filesQuery())); };
/* what kind of file a name is */
function fileKind(name, drive) {
  if (drive) return "drive";
  const ext = (String(name).match(/\.([a-z0-9]{1,6})$/i) || [])[1] || "";
  const e = ext.toLowerCase();
  if (/^(jpe?g|png|gif|heic|heif|webp|bmp|svg|tiff?)$/.test(e)) return "image";
  if (e === "pdf") return "pdf";
  if (/^(docx?|pages|odt|rtf)$/.test(e)) return "doc";
  if (/^(xlsx?|csv|numbers|ods|tsv)$/.test(e)) return "sheet";
  if (/^(pptx?|key|odp)$/.test(e)) return "slide";
  if (/^(zip|rar|7z|tar|gz|tgz|bz2|xz|dmg|iso)$/.test(e)) return "archive";
  if (/^(mp3|m4a|wav|aac|flac|ogg|aiff?)$/.test(e)) return "audio";
  if (/^(mp4|mov|m4v|avi|mkv|webm)$/.test(e)) return "video";
  if (/^(txt|md|log|json|xml|ya?ml|ics|vcf|html?|css|js|ts|py|java|c|cpp|h|rb|go|rs|swift|sh|patch|diff|tex)$/.test(e)) return "text";
  return "other";
}
const extOf = (name) => ((String(name).match(/\.([a-z0-9]{1,6})$/i) || [])[1] || "").toUpperCase();
function sizeBytes(t) {
  const m = String(t || "").replace(",", ".").match(/(\d+(?:\.\d+)?)\s*([KMG])?B?\b/i);
  if (!m) return 0;
  return Math.round(Number(m[1]) * ({ K: 1024, M: 1048576, G: 1073741824 }[(m[2] || "").toUpperCase()] || 1));
}
function sizeText(b) {
  if (!b) return "";
  if (b < 1024) return b + " B";
  if (b < 1048576) return Math.round(b / 1024) + " KB";
  if (b < 1073741824) return (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + " MB";
  return (b / 1073741824).toFixed(1) + " GB";
}
/* what's in one conversation, from its print view: the files of each email in it */
const fileStore = () => "files5:" + accountEmail();
const fileCache = new Map(Object.entries(store.get(fileStore(), {})));
store.del("files4:" + accountEmail()); // (the older kind of reading, which mixed up files of two emails)
let fileSaveT = 0;
function keepFiles(tid, list) {
  fileCache.delete(tid); // (newest last: the oldest readings are the ones let go)
  fileCache.set(tid, { at: Date.now(), list });
  clearTimeout(fileSaveT);
  fileSaveT = setTimeout(() => store.set(fileStore(), Object.fromEntries([...fileCache].slice(-900))), 800);
}
function readFiles(doc, tid) {
  const idx = accountIndex();
  const base = location.origin + "/mail/u/" + idx + "/";
  const subject = text($(".maincontent table b", doc.body) || $("title", doc) || doc.body).replace(/^Gmail - /, "");
  const out = [], seenHref = new Set();
  const msgs = $$("table.message", doc.body);
  // the sender's name is in bold ("Anthropic, PBC"), the address after it in <…>
  const whoOf = (t) => {
    const head = $$(":scope > tbody > tr > td", t);
    const line = head[0] ? head[0].textContent.replace(/\s+/g, " ").trim() : "";
    const bold = head[0] ? text($("b", head[0])) : "";
    const email = ((line.match(/<([^<>\s]+@[^<>\s]+)>/) || line.match(/([^\s<>]+@[^\s<>]+)/) || [])[1] || "").toLowerCase();
    const date = head[1] ? head[1].textContent.trim() : "";
    return { name: bold || line.replace(/<.*$/, "").replace(/^"|"$/g, "").trim(), email, date, time: Date.parse(date.replace(/\s+at\s+/i, " ")) || 0 };
  };
  for (const att of $$("table.att", doc.body)) {
    const msg = att.closest("table.message") || msgs[msgs.length - 1];
    const who = msg ? whoOf(msg) : { name: "", email: "", date: "", time: 0 };
    for (const ft of $$("table", att)) {
      if ($("table", ft)) continue;
      const a = $("a[href*='view=att']", ft);
      const name = text($("b", ft));
      if (!a || !name) continue;
      let u;
      try { u = new URL(a.getAttribute("href"), base); } catch (e) { continue; }
      const size = sizeBytes(ft.textContent.replace(name, ""));
      const kind = fileKind(name);
      if (kind === "image" && size && size < 6 * 1024) continue; // a logo in a signature, not a file
      const at = (disp) => { const x = new URL(u); x.searchParams.set("disp", disp); return x.toString(); };
      // (each email numbers its own files from 0.1: the email's id keeps two emails' files apart)
      out.push({ key: tid + ":" + (u.searchParams.get("th") || "") + ":" + (u.searchParams.get("attid") || name), tid, mid: u.searchParams.get("th") || "", name, size, kind,
        // (a small picture is its own preview, sharp on any screen; a big one uses Gmail's thumbnail)
        view: at("inline"), get: at("safe"), thumb: kind === "image" ? at(size && size < 1.5 * 1048576 ? "inline" : "thd") : "", from: who, subject });
    }
  }
  // the files too big to attach, which Gmail sent as Drive links
  for (const msg of msgs) {
    const who = whoOf(msg);
    for (const a of $$('a[href*="drive.google.com/file/d/"], a[href*="drive.google.com/open?id="], a[href*="docs.google.com/document/d/"], a[href*="docs.google.com/spreadsheets/d/"], a[href*="docs.google.com/presentation/d/"]', msg)) {
      // (Drive's own address only: "evil.com/?drive.google.com/file/d/…" is not a Drive file)
      let url;
      try { url = new URL(realLink(a.getAttribute("href") || "").url); } catch (e) { continue; }
      if (url.protocol !== "https:" || !/^(drive|docs)\.google\.com$/i.test(url.hostname)) continue;
      const href = url.toString();
      const id = (url.pathname.match(/^\/(?:file|document|spreadsheets|presentation)\/d\/([\w-]{10,})/) || [])[1] || (url.pathname === "/open" && /^[\w-]{10,}$/.test(url.searchParams.get("id") || "") ? url.searchParams.get("id") : "");
      if (!id || seenHref.has(id)) continue;
      seenHref.add(id);
      let name = text(a).trim();
      if (!name || /^https?:|^(open|view|download|preview|here|link)$/i.test(name)) name = /document/.test(href) ? "Google Doc" : /spreadsheets/.test(href) ? "Google Sheet" : /presentation/.test(href) ? "Google Slides" : "Drive file";
      out.push({ key: tid + ":drive:" + id, tid, mid: "", name: name.slice(0, 120), size: 0, kind: "drive", drive: href, view: href, get: "", thumb: "", from: who, subject });
    }
  }
  return out;
}
const fileJobs = [];
const fileFails = new Map(); // conversation -> { n, at }: a print view that failed waits longer each time
let fileBusy = 0;
function wantFiles(tid, time) {
  const c = fileCache.get(tid);
  // (read again once the conversation has something newer than the reading: a reply with a file)
  if ((c && !(time && time > c.at)) || fileJobs.includes(tid) || fileBusy > 6) return;
  const f = fileFails.get(tid);
  if (f && Date.now() - f.at < Math.min(600000, 15000 * 2 ** f.n)) return;
  fileJobs.push(tid);
  pumpFiles();
}
function pumpFiles() {
  while (fileBusy < 3 && fileJobs.length) {
    const tid = fileJobs.shift();
    fileBusy++;
    (async () => {
      const html = await getText(printPath(accountIndex(), tid));
      const doc = parseHTML(html);
      if (!doc || !$("table.message", doc.body)) throw new Error("not a print view");
      keepFiles(tid, readFiles(doc, tid));
      fileFails.delete(tid);
    })().catch(() => { const f = fileFails.get(tid); fileFails.set(tid, { n: f ? f.n + 1 : 0, at: Date.now() }); }).finally(() => { fileBusy--; invalidate(); pumpFiles(); });
  }
}
// (one list, kept current: a file open in the viewer steps through what's shown now, not when its card was made)
const fileShown = [];
/* the conversations Gmail found, in order, across every page read so far (a new search starts over) */
let fileThreads = { q: "", rows: new Map(), more: true, paging: false };
function renderFiles(r) {
  const folder = baseHash(r.hash);
  const q = currentQuery(r.hash);
  const { el, fresh } = setScreen("files", "files", () => {
    const input = h("input", { type: "text", placeholder: "Find a file by name, sender or email", "aria-label": "Find a file", autocomplete: "off", spellcheck: "false" });
    input.addEventListener("input", () => { files.find = input.value; invalidate(); });
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); if (input.value) { input.value = ""; files.find = ""; invalidate(); } else input.blur(); } });
    const scroll = h("div", { class: "qm-scroll" }, h("div", { class: "qm-inbox qm-files" },
      titleRow("Files"),
      h("p", { class: "qm-subnote qm-filesnote" }),
      h("div", { class: "qm-filebar" }, h("label", { class: "qm-subfind" }, icon("find"), input), h("div", { class: "qm-filekinds" })),
      h("div", { class: "qm-fileopts" }),
      h("div", { class: "qm-filesel" }),
      h("div", { class: "qm-filegrid" }), h("div", { class: "qm-tail" })));
    scroll.addEventListener("scroll", () => { if (nearEnd(scroll)) filesMore(); }, { passive: true });
    return h("div", {}, scroll, h("div", { class: "qm-fade" }));
  });
  if (fresh) { const i = $(".qm-subfind input", el); if (i) i.value = files.find; }
  // what Gmail found, on the page it's showing now
  if (fileThreads.q !== q) fileThreads = { q, rows: new Map(), more: true, paging: false };
  const m = mainList(folder);
  if (m && listReady(m)) {
    for (const x of readList(m)) if (!fileThreads.rows.has(x.id)) fileThreads.rows.set(x.id, x);
    fileThreads.more = !isOff(olderOf(m));
  }
  const threads = [...fileThreads.rows.values()].sort((a, b) => b.time - a.time);
  for (const t of threads) wantFiles(t.id, t.time);
  // every file, filtered and sorted
  const want = files.find.trim().toLowerCase();
  let all = [];
  for (const t of threads) {
    const c = fileCache.get(t.id);
    if (!c) continue;
    for (const f of c.list) {
      if (files.kind !== "all" && f.kind !== files.kind && !(files.kind === "doc" && f.kind === "text")) continue; // (a .txt is a document)
      if (files.from && (f.from.email || "").toLowerCase() !== files.from.email) continue;
      if (files.large && f.kind !== "drive" && f.size < 10 * 1048576) continue;
      if (want && !(f.name + " " + f.from.name + " " + f.from.email + " " + f.subject).toLowerCase().includes(want)) continue;
      all.push(Object.assign({ time: f.from.time || t.time, unread: t.unread, draft: !!t.draft }, f));
    }
  }
  if (files.sort === "big") all.sort((a, b) => b.size - a.size || b.time - a.time);
  else all.sort((a, b) => b.time - a.time);
  for (const k of [...files.picked]) if (!all.some((f) => f.key === k)) files.picked.delete(k);
  // the line under the title: how much there is, and how full Gmail's storage is
  const total = all.reduce((s, f) => s + (f.size || 0), 0);
  const quota = gmailQuota();
  const note = $(".qm-filesnote", el);
  const noteText = (all.length ? all.length.toLocaleString() + (all.length === 1 ? " file" : " files") + (total ? " · " + sizeText(total) : "") + (fileThreads.more ? " so far" : "") : "Everything attached to your mail, newest first.") + (quota ? " · Your Google storage: " + quota : "");
  if (note.textContent !== noteText) note.textContent = noteText;
  // kinds
  const kinds = $(".qm-filekinds", el);
  const ksig = files.kind;
  if (kinds.dataset.sig !== ksig) {
    kinds.dataset.sig = ksig;
    kinds.replaceChildren(...FILE_KINDS.map(([k, label]) => h("button", { type: "button", class: "qm-fkind", "aria-pressed": String(files.kind === k), onclick: () => { files.kind = k; goFiles(); } }, label)));
  }
  // sender, size and order
  const opts = $(".qm-fileopts", el);
  const osig = [files.from && files.from.email, files.large, files.sort].join("|");
  if (opts.dataset.sig !== osig) {
    opts.dataset.sig = osig;
    opts.replaceChildren(...[
      files.from ? h("button", { type: "button", class: "qm-fchip", title: "Files from anyone", onclick: () => { files.from = null; goFiles(); } }, "From " + (files.from.name || files.from.email), icon("x")) : null,
      h("button", { type: "button", class: "qm-fopt", "aria-pressed": String(files.large), title: "Only files over 10 MB: where most of the space goes", onclick: () => { files.large = !files.large; goFiles(); } }, "Over 10 MB"),
      h("span", { class: "qm-fsp" }),
      h("div", { class: "qm-seg qm-fsort", role: "group", "aria-label": "Order" },
        h("button", { type: "button", "aria-pressed": String(files.sort === "new"), onclick: () => { files.sort = "new"; invalidate(true); } }, "Newest"),
        h("button", { type: "button", "aria-pressed": String(files.sort === "big"), onclick: () => { files.sort = "big"; invalidate(true); } }, "Largest"))].filter(Boolean));
  }
  // what's picked: download them, or keep copies and delete their emails
  const sel = $(".qm-filesel", el);
  const picked = all.filter((f) => files.picked.has(f.key));
  const ssig = picked.map((f) => f.key).join();
  if (sel.dataset.sig !== ssig) {
    sel.dataset.sig = ssig;
    const bytes = picked.reduce((s, f) => s + (f.size || 0), 0);
    sel.replaceChildren(...(picked.length ? [h("div", { class: "qm-selbar qm-fselbar" },
      h("span", { text: picked.length + (picked.length === 1 ? " file" : " files") + (bytes ? " · " + sizeText(bytes) : "") }),
      h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => { for (const f of picked) downloadFile(f); } }, icon("download"), "Download"),
      h("button", { type: "button", class: "qm-btn", onclick: () => freeUp(picked) }, icon("trash"), "Keep copies, delete emails"),
      ib("x", "Clear", () => { files.picked.clear(); invalidate(true); }, "qm-s"))] : []));
  }
  // the files: rows like the inbox's (by day, newest first), or for pictures, the pictures themselves
  const grid = $(".qm-filegrid", el);
  const photos = files.kind === "image";
  grid.classList.toggle("qm-picking", picked.length > 0);
  grid.classList.toggle("qm-photos", photos);
  grid.classList.toggle("qm-rows", !photos);
  grid.classList.toggle("qm-avs", !photos);
  const items = all.slice(0, 600);
  fileShown.splice(0, fileShown.length, ...items);
  const gsig = items.map((f) => f.key + (files.picked.has(f.key) ? "+" : "")).join() + "|" + prefs.theme + "|" + photos + "|" + files.sort;
  if (grid.dataset.sig !== gsig) {
    grid.dataset.sig = gsig;
    const old = new Map([...grid.children].map((c) => [c.dataset.k, c]));
    const next = [];
    let day = "";
    for (const f of items) {
      if (!photos && files.sort === "new") {
        const d = dayLabel(f.time);
        if (d !== day) { day = d; const k = "day:" + d; const head = old.get(k) || h("div", { class: "qm-day", text: d }); head.dataset.k = k; next.push(head); }
      }
      const k = (photos ? "p:" : "r:") + f.key + (files.picked.has(f.key) ? "+" : "");
      const keep = old.get(k);
      if (keep) { next.push(keep); continue; }
      const card = photos ? fileTile(f, fileShown) : fileRow(f, fileShown);
      card.dataset.k = k;
      next.push(card);
    }
    next.forEach((c, i) => { if (grid.children[i] !== c) grid.insertBefore(c, grid.children[i] || null); });
    while (grid.children.length > next.length) grid.lastElementChild.remove();
  }
  // the end of the list: still finding, more to look through, or nothing here
  const tail = $(".qm-tail", el);
  const loading = !m || !listReady(m) || fileBusy > 0 || fileJobs.length > 0 || fileThreads.paging;
  const tstate = loading ? "load" : fileThreads.more ? "more" : all.length ? "end" : "empty";
  if (tail.dataset.state !== tstate) {
    tail.dataset.state = tstate;
    tail.replaceChildren(...(tstate === "load" ? [h("div", { class: "qm-loading", "aria-label": "Loading" }, h("i"), h("i"), h("i"))]
      : tstate === "more" ? [h("div", { class: "qm-reach" }, h("button", { type: "button", onclick: () => filesMore(true) }, "Look further back"))]
      : tstate === "empty" ? [h("div", { class: "qm-empty", text: want || files.kind !== "all" || files.from || files.large ? "No files match." : "No files yet." })] : []));
  }
  if (!loading && fileThreads.more && all.length < 24 && !want) filesMore();
}
/* the next page of Gmail's search, read in as it comes */
async function filesMore(force) {
  if (fileThreads.paging || !fileThreads.more) return;
  const folder = baseHash(hashNow());
  if (!/^#search\//.test(folder) || !isFilesQuery(currentQuery(folder))) return;
  if (!force && (fileBusy > 0 || fileJobs.length > 0)) return;
  fileThreads.paging = true;
  invalidate();
  try { await stepList(folder, 1); } finally { fileThreads.paging = false; invalidate(true); }
}
/* how full your Google storage is, as Gmail says at the foot of a list ("2.1 GB of 15 GB used") */
function gmailQuota() {
  const m = gmailMain();
  const el = m && $$(".aXN, .md.mj, .ma", m).find((x) => /\bof\b.*\b(GB|TB)\b/i.test(x.textContent));
  const t = el ? el.textContent : "";
  const x = t.match(/([\d.,]+\s*(?:KB|MB|GB|TB))\s+of\s+([\d.,]+\s*(?:GB|TB))/i);
  if (x) { store.set("quota:" + accountEmail(), x[1] + " of " + x[2]); return x[1] + " of " + x[2]; }
  return store.get("quota:" + accountEmail(), "");
}
/* a file's mark: the same line icons as everything else, in the text's own colour (no coloured tiles) */
const FILE_ICONS = { image: "image", drive: "everything", audio: "file", video: "file" };
function fileIcon(f, big) {
  return h("span", { class: "qm-fglyph" + (big ? " qm-big" : ""), "aria-hidden": "true" }, icon(FILE_ICONS[f.kind] || "file"),
    big ? h("b", { text: f.kind === "drive" ? "Drive" : extOf(f.name) || "File" }) : null);
}
// what goes where a sender's picture would: the picture itself (small), or the file's mark. Clicking it selects.
function fileFace(f) {
  const face = h("span", { class: "qm-av qm-rav qm-fface" + (f.thumb ? " qm-fthumb" : "") });
  if (f.thumb) {
    const img = h("img", { src: f.thumb, alt: "", loading: "lazy", draggable: "false" });
    img.addEventListener("error", () => { face.classList.remove("qm-fthumb"); face.replaceChildren(icon(FILE_ICONS[f.kind] || "file")); });
    face.appendChild(img);
  } else face.appendChild(icon(FILE_ICONS[f.kind] || "file"));
  return face;
}
const pickFile = (f) => { if (files.picked.has(f.key)) files.picked.delete(f.key); else files.picked.add(f.key); invalidate(true); };
/* a file, as a row like an email's: its name, who sent it and in what, its size, when */
function fileRow(f, list) {
  const who = f.from.name || f.from.email || "";
  const face = fileFace(f);
  face.addEventListener("click", (e) => { e.stopPropagation(); pickFile(f); });
  const row = h("div", { class: "qm-row qm-frow" + (files.picked.has(f.key) ? " qm-picked" : "") + (f.unread ? "" : " qm-read"), role: "link", tabindex: "0", title: f.name },
    face,
    h("span", { class: "qm-fname" }, h("span", { class: "qm-fn", text: f.name })),
    h("span", { class: "qm-ffrom" },
      h("button", { type: "button", class: "qm-fwho", title: "Only files from " + who, onclick: (e) => { e.stopPropagation(); files.from = { email: (f.from.email || "").toLowerCase(), name: who }; goFiles(); } }, who),
      h("span", { class: "qm-fin" }, f.draft ? h("span", { class: "qm-tag", text: "Draft" }) : null, f.subject || "(no subject)")),
    h("span", { class: "qm-fsize", text: f.kind === "drive" ? "Drive" : f.size ? sizeText(f.size) : "" }),
    h("span", { class: "qm-when", text: f.from.date ? rowWhen(f.time) : "" }),
    h("span", { class: "qm-rowacts", onclick: (e) => e.stopPropagation() },
      f.get ? ib("download", "Download", () => downloadFile(f), "qm-s") : null,
      ib("mailopen", f.draft ? "Open the draft" : "Open its email", () => openFileEmail(f), "qm-s")));
  const open = () => { if (files.picked.size) { pickFile(f); return; } viewFile(f, list, row); };
  row.addEventListener("click", open);
  row.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === row) { e.preventDefault(); open(); } });
  return row;
}
/* pictures: just the pictures, side by side */
function fileTile(f, list) {
  const pick = h("button", { type: "button", class: "qm-fpick", role: "checkbox", "aria-checked": String(files.picked.has(f.key)), "aria-label": "Select " + f.name, onclick: (e) => { e.stopPropagation(); pickFile(f); } }, icon("done"));
  const tile = h("div", { class: "qm-photo" + (files.picked.has(f.key) ? " qm-picked" : ""), role: "link", tabindex: "0", title: f.name + (f.from.name ? " · " + f.from.name : "") }, pick);
  if (f.thumb) {
    const img = h("img", { src: f.thumb, alt: f.name, loading: "lazy", draggable: "false" });
    img.addEventListener("error", () => img.replaceWith(fileIcon(f, true)));
    tile.appendChild(img);
  } else tile.appendChild(fileIcon(f, true));
  const open = () => { if (files.picked.size) { pickFile(f); return; } viewFile(f, list, tile); };
  tile.addEventListener("click", open);
  tile.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === tile) { e.preventDefault(); open(); } });
  return tile;
}
const rowWhen = (t) => (t ? shortWhen(t) : "");
function shortWhen(t) {
  const d = new Date(t), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return MONTHS[d.getMonth()] + " " + d.getDate() + (d.getFullYear() === now.getFullYear() ? "" : ", " + d.getFullYear());
}
/* the email a file came in: Gmail's own row opens it when it's on the page (a draft opens as the window it is);
   otherwise its address in All mail. Back comes here again. */
function openFileEmail(f) {
  closeFileView();
  const from = hashNow();
  const live = liveRow(f.tid);
  if (live) {
    if (!f.draft) { session.set("back", from); backFor = ""; backPending = true; }
    press($(".xS", live) || live);
    return;
  }
  if (f.draft) { go("#drafts"); return; }
  openFrom(threadHash("#all", f.tid), from);
}
// one of Gmail's own buttons on an attachment in the email (Add to Drive, Save to Photos), by what it's called
const gmailAttBtn = (x, re) => (x.card ? $$("[aria-label], [data-tooltip]", x.card).find((b) => re.test(b.getAttribute("aria-label") || b.getAttribute("data-tooltip") || "")) : null) || null;
/* save a file the way the browser saves downloads */
function downloadFile(f) {
  if (f.drive) { openUrl(f.drive); return; }
  const a = h("a", { href: f.get, download: f.name, rel: "noopener", style: "display:none" });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
}
/* a picture from an email's words (not an attachment): saved as the file it is. Gmail serves some itself; others come
   through Google's picture proxy, which a page can't always read: then the userscript manager fetches it, and if
   nothing can, it opens in a new tab to save from there (never this tab going off to it) */
function saveBlob(blob, name) {
  const ext = (blob.type.split("/")[1] || "").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "");
  if (ext && !/\.[a-z0-9]{2,5}$/i.test(name)) name += "." + ext;
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: name, style: "display:none" });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}
async function savePicture(x) {
  const url = x.get || x.view;
  const name = (x.name || "Picture").replace(/[\\/:*?"<>|]+/g, " ").trim() || "Picture";
  try {
    const res = await fetch(url, { credentials: url.startsWith(location.origin) ? "include" : "omit" });
    if (!res.ok) throw new Error(String(res.status));
    saveBlob(await res.blob(), name);
    return;
  } catch (e) { /* the proxy may not let a page read it */ }
  if (typeof GM_xmlhttpRequest === "function") {
    const ok = await new Promise((resolve) => {
      try { GM_xmlhttpRequest({ method: "GET", url, responseType: "blob", timeout: 20000, onload: (r) => { if (r.status === 200 && r.response instanceof Blob) { saveBlob(r.response, name); resolve(true); } else resolve(false); }, onerror: () => resolve(false), ontimeout: () => resolve(false) }); } catch (e) { resolve(false); }
    });
    if (ok) return;
  }
  openUrl(url);
  toast("Opened the picture in a new tab: save it from there.");
}
/* a picture onto the clipboard (as a PNG, the kind every app takes), ready to paste */
async function copyPicture(x) {
  try {
    const res = await fetch(x.get || x.view, { credentials: (x.get || x.view).startsWith(location.origin) ? "include" : "omit" });
    if (!res.ok) throw new Error(String(res.status));
    let blob = await res.blob();
    if (blob.type !== "image/png") {
      const url = URL.createObjectURL(blob);
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      blob = await new Promise((resolve) => c.toBlob(resolve, "image/png"));
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast("Picture copied.");
  } catch (e) { toast("Couldn't copy that picture."); }
}
/* a file, open over the list: pictures and PDFs as themselves, text as text; ← and → for the next one */
let fileView = null;
function closeFileView() {
  if (!fileView) return;
  const { scrim, onKey, from, panel } = fileView;
  fileView = null;
  window.removeEventListener("keydown", onKey, true);
  // (back into the card it came out of, if that's still on screen and still the same file)
  const to = from && from.isConnected && visible(from) && panel && !panel.qmStepped ? from.getBoundingClientRect() : null;
  const a = zoomBack(panel, to);
  scrim.classList.add("qm-out");
  setTimeout(() => scrim.remove(), a ? 260 * slowMo() : 140);
}
function viewFile(f, list, from) {
  closeFileView();
  const body = h("div", { class: "qm-fvbody" });
  const show = async (x) => {
    f = x;
    const at = list.length > 1 ? list.findIndex((y) => y.key === x.key) + 1 + " of " + list.length : "";
    head.replaceChildren(...[fileIcon(x), h("div", { class: "qm-fvtitle" }, h("b", { text: x.name }), h("small", { text: [at, sizeText(x.size), x.from.name || x.from.email, x.time ? rowWhen(x.time) : x.from.date].filter(Boolean).join(" · ") })),
      h("span", { class: "qm-fsp" }),
      x.kind === "image" && navigator.clipboard && typeof ClipboardItem === "function" ? h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => copyPicture(x) }, "Copy") : null,
      x.view && !x.drive ? h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => openUrl(x.view) }, icon("grow"), "Open in new tab") : null,
      x.inline ? h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => savePicture(x) }, icon("download"), "Download")
        : x.get || x.card ? h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => (x.here ? getAtt(x) : downloadFile(x)) }, icon("download"), "Download") : null,
      // (what Gmail offers on the file itself: into your Drive, or a picture into Photos)
      ...[[/^(add|save) to drive/i, "Save to Drive", "Saving to Drive…"], [/^save to photos/i, "Save to Photos", "Saving to Photos…"]].map(([re, label, said]) => {
        const g = x.here && gmailAttBtn(x, re);
        return g ? h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => { const b = gmailAttBtn(x, re); if (b && press(b)) toast(said); else toast("Gmail doesn't offer that just now."); } }, label) : null;
      }),
      // (a file from the email you're reading is already in its email)
      x.here ? null : h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => openFileEmail(x) }, icon("mailopen"), x.draft ? "Open the draft" : "Open its email"),
      ib("x", "Close (esc)", closeFileView, "qm-s")].filter(Boolean));
    body.replaceChildren(h("div", { class: "qm-loading", "aria-label": "Loading" }, h("i"), h("i"), h("i")));
    body.classList.remove("qm-zoomed", "qm-canzoom");
    if (x.kind === "image" && (x.view || x.thumb)) {
      const img = h("img", { src: x.view || x.thumb, alt: x.name, draggable: "false" });
      // bigger than the window: a click shows it at its own size (scroll to look around), another fits it again
      img.addEventListener("click", (e) => {
        if (!body.classList.contains("qm-canzoom")) return;
        const r = img.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
        const on = body.classList.toggle("qm-zoomed");
        if (on) {
          const b = body.getBoundingClientRect();
          body.scrollLeft = img.offsetWidth * fx - (e.clientX - b.left);
          body.scrollTop = img.offsetHeight * fy - (e.clientY - b.top);
          play(img, [{ transformOrigin: `${fx * 100}% ${fy * 100}%`, transform: `scale(${r.width / img.offsetWidth})` }, { transformOrigin: `${fx * 100}% ${fy * 100}%`, transform: "none" }], { spring: "snappy" });
        } else play(img, [{ opacity: 0.6, transform: "scale(1.04)" }, { opacity: 1, transform: "none" }], { spring: "snappy" });
      });
      img.addEventListener("load", () => {
        if (f !== x) return;
        body.replaceChildren(img);
        requestAnimationFrame(() => body.classList.toggle("qm-canzoom", img.naturalWidth > img.clientWidth + 8 || img.naturalHeight > img.clientHeight + 8));
      });
      img.addEventListener("error", () => { if (f === x) body.replaceChildren(noPreview(x)); });
    } else if (x.kind === "pdf" && x.view) {
      body.replaceChildren(h("iframe", { src: x.view, title: x.name }));
    } else if ((x.kind === "audio" || x.kind === "video") && x.view) {
      const media = h(x.kind, { src: x.view, controls: true, preload: "metadata" });
      media.addEventListener("error", () => { if (f === x) body.replaceChildren(noPreview(x)); });
      body.replaceChildren(media);
    } else if (x.here && !/^(image|pdf|text|audio|video)$/.test(x.kind) && !GMAIL_CANT.test(x.ext) && gmailViewer(x) && (x.preview || GMAIL_SHOWS.test(x.ext))) {
      // a document Gmail reads: its first page here, all of it in Gmail's viewer
      const whole = () => { const link = gmailViewer(x); closeFileView(); if (link) press(link); };
      body.replaceChildren(h("div", { class: "qm-fvdoc" }, x.preview ? h("img", { src: x.preview, alt: x.name, draggable: "false" }) : fileIcon(x, true),
        h("button", { type: "button", class: "qm-btn", onclick: whole }, icon("grow"), "Show all pages")));
    } else if (x.kind === "text" && x.view && x.size < 2 * 1048576) {
      try { const t = await getText(x.view.replace(location.origin, "")); const ev = /\.ics$/i.test(x.name) ? icsEvent(t) : null; if (f === x) body.replaceChildren(ev || h("pre", { text: t.slice(0, 400000) })); }
      catch (e) { if (f === x) body.replaceChildren(noPreview(x)); }
    } else body.replaceChildren(noPreview(x));
  };
  const noPreview = (x) => h("div", { class: "qm-fvnone" }, fileIcon(x, true),
    x.here ? h("b", { class: "qm-fvname", text: x.name }) : null,
    h("p", { text: x.drive ? "This one lives in Google Drive." : x.here ? [kindWord(x), sizeText(x.size)].filter(Boolean).join(" · ") + ". It opens in its own app once it's downloaded." : "There's no preview for this kind of file here." }),
    x.drive ? h("button", { type: "button", class: "qm-btn", onclick: () => openUrl(x.drive) }, "Open in Drive") : h("button", { type: "button", class: "qm-btn", onclick: () => (x.here ? getAtt(x) : downloadFile(x)) }, icon("download"), "Download"));
  const head = h("div", { class: "qm-fvhead" });
  const step = (d) => { const i = list.findIndex((x) => x.key === f.key); const n = list[i + d]; if (n) { panel.qmStepped = true; show(n); } };
  const panel = h("div", { class: "qm-fview", role: "dialog", "aria-label": "File" }, head, body,
    // (one file: nothing to step to)
    list.length > 1 ? h("button", { type: "button", class: "qm-fvnav qm-prev", "aria-label": "Previous file (←)", onclick: () => step(-1) }, icon("back")) : null,
    list.length > 1 ? h("button", { type: "button", class: "qm-fvnav qm-next", "aria-label": "Next file (→)", onclick: () => step(1) }, icon("back")) : null);
  const scrim = h("div", { id: "qm-fview-scrim" }, panel);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) closeFileView(); });
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); closeFileView(); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopImmediatePropagation(); step(e.key === "ArrowLeft" ? -1 : 1); }
    // (the list and Gmail beneath it get nothing: an "e" here archived whatever Gmail had chosen)
    else if (e.key !== "Tab" && !e.metaKey && !e.ctrlKey) e.stopImmediatePropagation();
  };
  window.addEventListener("keydown", onKey, true);
  document.body.appendChild(scrim);
  fileView = { scrim, onKey, from, panel };
  show(f);
  zoomFrom(panel, from && from.isConnected ? from.getBoundingClientRect() : null);
}
/* an invitation (.ics) as the event it is: what, when, where, who's asking; the file's own text if it holds none */
function icsEvent(t) {
  const raw = String(t || "").replace(/\r?\n[ \t]/g, ""); // (long lines are folded onto the next with a leading space)
  const ev = (raw.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/) || [""])[0];
  if (!ev) return null;
  const get = (k) => { const m = new RegExp("^" + k + "(;[^:\\n]*)?:(.*)$", "mi").exec(ev); return m ? { params: m[1] || "", value: m[2].replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim() } : null; };
  const when = (p) => {
    if (!p) return null;
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(p.value);
    if (!m) return null;
    const allDay = !m[4];
    const d = m[7] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : new Date(+m[1], +m[2] - 1, +m[3], allDay ? 0 : +m[4], allDay ? 0 : +m[5]);
    return { d, allDay };
  };
  const a = when(get("DTSTART")), b = when(get("DTEND"));
  const sum = get("SUMMARY"), loc = get("LOCATION"), desc = get("DESCRIPTION"), org = get("ORGANIZER");
  const day = (x) => x.d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: x.d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  const hm = (x) => x.d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const span = a ? (a.allDay ? day(a) + " (all day)" : day(a) + ", " + hm(a) + (b && !b.allDay ? (b.d.toDateString() === a.d.toDateString() ? " – " + hm(b) : " – " + day(b) + ", " + hm(b)) : "")) : "";
  const who = org ? ((/CN=("?)([^;:"]+)\1/i.exec(org.params) || [])[2] || org.value.replace(/^mailto:/i, "")) : "";
  const row = (label, value) => (value ? h("div", { class: "qm-icsrow" }, h("span", { text: label }), h("b", { text: value })) : null);
  return h("div", { class: "qm-ics" }, h("h2", { text: (sum && sum.value) || "Invitation" }),
    row("When", span), row("Where", loc && loc.value), row("From", who),
    desc && desc.value ? h("p", { text: desc.value.slice(0, 1200) }) : null);
}
/* Make room: a copy of every file is saved to this computer first (each one read in full before anything
   is deleted), then each email goes to Trash, where Gmail deletes it for good after 30 days. An email whose
   files couldn't all be saved stays where it is. */
async function freeUp(list) {
  const byThread = new Map();
  for (const f of list) { if (!byThread.has(f.tid)) byThread.set(f.tid, []); byThread.get(f.tid).push(f); }
  // the whole email goes, so every file in it is kept (not only the ones picked)
  for (const [tid, fs] of byThread) { const c = fileCache.get(tid); if (c) for (const x of c.list) if (!fs.some((y) => y.key === x.key)) fs.push(x); }
  const keep = [...byThread.values()].flat().filter((f) => f.get);
  const bytes = keep.reduce((s, f) => s + (f.size || 0), 0);
  const n = byThread.size;
  const ok = await confirmBox({
    title: "Keep copies and delete " + (n === 1 ? "the email" : n + " emails") + "?",
    body: [
      keep.length + (keep.length === 1 ? " file" : " files") + (bytes ? " (" + sizeText(bytes) + ")" : "") + " will be saved to your Downloads folder first. Only then " + (n === 1 ? "does the email go" : "do the emails go") + " to Trash, whole: " + (n === 1 ? "its" : "their") + " text too.",
      "Gmail deletes mail in Trash for good after 30 days, and that's when the space comes back. Until then you can still restore " + (n === 1 ? "it" : "them") + " from Trash.",
    ],
    ok: "Save copies and delete", danger: true,
  });
  if (!ok) return;
  let saved = 0, trashed = 0, failed = 0, stuck = 0;
  toast("Saving copies…");
  for (const [tid, fs] of byThread) {
    let good = true;
    for (const f of fs) {
      if (!f.get) continue;
      try {
        const res = await fetch(f.get, { credentials: "include" });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (f.size && blob.size < f.size * 0.5) throw new Error("short");
        const url = URL.createObjectURL(blob);
        const a = h("a", { href: url, download: f.name, style: "display:none" });
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
        saved++;
        await wait(350); // browsers take one download at a time more gracefully
      } catch (e) { good = false; }
    }
    if (!good) { failed++; continue; }
    const live = liveRow(tid);
    let gone = !!live;
    if (live) rowAction(live, ".bru, li[data-tooltip='Delete']");
    else await ghostThread({ id: tid }, async () => { const b = gmailToolbar("10", ["Delete"]); if (b) { press(b); gone = true; } await wait(350); });
    if (!gone) { stuck++; continue; } // (copies saved, but Gmail didn't open it to delete: it stays)
    fileThreads.rows.delete(tid);
    trashed++;
    await wait(250);
  }
  files.picked.clear();
  invalidate(true);
  toast(saved + (saved === 1 ? " copy" : " copies") + " saved to Downloads · " + trashed + (trashed === 1 ? " email" : " emails") + " moved to Trash" + (failed ? " · " + failed + " kept (a file couldn't be saved)" : "") + (stuck ? " · " + stuck + " not deleted (Gmail didn't open " + (stuck === 1 ? "it" : "them") + ")" : ""));
}
/* a question that needs a yes: Esc or a click outside is no */
function confirmBox({ title, body, ok, danger, cancel }) {
  return new Promise((resolve) => {
    const done = (v) => { window.removeEventListener("keydown", onKey, true); scrim.classList.add("qm-out"); setTimeout(() => scrim.remove(), 130); resolve(v); };
    const yes = h("button", { type: "button", class: "qm-btn" + (danger ? " qm-danger" : ""), onclick: () => done(true) }, ok || "OK");
    const no = h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => done(false) }, cancel || "Cancel");
    const panel = h("div", { class: "qm-confirm", role: "alertdialog", "aria-modal": "true", "aria-label": title },
      h("h2", { text: title }), ...[].concat(body || []).map((p) => h("p", { text: p })),
      h("div", { class: "qm-cbtns" }, no, yes));
    const scrim = h("div", { id: "qm-confirm-scrim" }, panel);
    scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) done(false); });
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); done(false); } else if (e.key === "Enter" && document.activeElement === yes) { e.preventDefault(); e.stopImmediatePropagation(); done(true); } };
    window.addEventListener("keydown", onKey, true);
    document.body.appendChild(scrim);
    // (where saying yes can't be taken back, the keyboard starts on Cancel: a stray Space or Enter changes nothing)
    (danger ? no : yes).focus();
  });
}

/* ------------------------------------------------------------------ find */
let findMode = false;
let findDraft = "";
let lastFindSig = "";
function currentQuery(hash) {
  const m = hash.match(/^#search\/([^/]+)/);
  if (!m) return "";
  try { return decodeURIComponent(m[1].replace(/\+/g, " ")); } catch (e) { return m[1]; }
}
const searchHash = (q) => "#search/" + encodeURIComponent(q).replace(/%20/g, "+");
const asked = new Map(); // the Gmail search Umbra ran -> the question that was typed
const isQuestion = (q) => {
  q = String(q || "").trim();
  if (/(^|\s)-?[a-z_]+:[^\s/]/i.test(q)) return false; // Gmail's own words (is:unread, has:attachment, from:x)
  return /\?$/.test(q) || /^(who|what|when|where|why|how|which|whose|did|do|does|is|are|was|were|can|could|should|will|would|have|has|had|am i)\b(?!:)/i.test(q);
};
/* Gmail answers questions itself where Gemini is included ("Ask Gmail"); elsewhere Umbra's AI first
   turns a question into a Gmail search, so the results are the right ones */
const gmailAnswers = () => hasTodos() || /^ask\b/i.test((($('input[name="q"]') || {}).placeholder || ""));
function runSearch(q) {
  q = (q || "").trim();
  if (!q) return;
  if (!/^#search\//.test(hashNow())) findReturn = hashNow();
  findMode = false;
  if (isQuestion(q) && !gmailAnswers() && ai.ready && prefs.summaries !== "off") {
    findPending = q;
    invalidate(true);
    countAI();
    helper("/summarize", { kind: "query", query: q, today: new Date().toDateString() }, 9000)
      .then((res) => { const gq = String((res && res.query) || "").trim() || q; asked.set(gq, q); return gq; }, () => q)
      .then((gq) => { findPending = ""; go(searchHash(gq)); });
    return;
  }
  go(searchHash(q));
}
let findPending = "";
const findStart = new Map();
const findWaitAt = new Map(); // when each search began waiting for Gmail's overview
/* Gmail's AI Overview above search results, read from the page underneath */
function readOverview(main) {
  const root = $$(".JLWipf", main).find((e) => $(".dnUxLb", e));
  if (!root) return { state: "none" };
  const pieces = $$(".rnc2Gd", root);
  if (!pieces.length) return { state: "wait" };
  const blocks = [], seen = new Set();
  for (const p of pieces) {
    let b = p.closest("li") || p.parentElement;
    while (b && b !== root && !/^(DIV|P|LI|H\d)$/.test(b.tagName)) b = b.parentElement;
    if (!b || seen.has(b)) continue;
    seen.add(b);
    const c = b.cloneNode(true);
    // a block keeps only its own words: nested lists come as their own blocks
    for (const x of c.querySelectorAll("ul, ol")) x.remove();
    for (const x of c.querySelectorAll(".FOBRw-anl, [role=tooltip], button")) x.remove();
    const t = c.textContent.replace(/\s+/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
    if (t && !blocks.some((x) => x.text === t)) blocks.push({ li: b.tagName === "LI", text: t.replace(/:(?=\S)/, ": ") });
  }
  // no preamble ("Based on your emails, here are…"), and no more than five points
  while (blocks.length > 1 && /^(based on|here (are|is)|according to|from your emails)\b/i.test(blocks[0].text) && /:$/.test(blocks[0].text)) blocks.shift();
  blocks.splice(5);
  // a lead-in with nothing after it ("Here are the emails about X:") says nothing
  if (blocks.length && /:$/.test(blocks[blocks.length - 1].text) && !blocks[blocks.length - 1].li) blocks.pop();
  const sources = $$('li[role="option"][data-url]', root).map((el) => ({ title: text($(".aqdrmf-Kf-fpDzbe-K0", el)) || text(el), el })).filter((x) => x.title);
  return { state: "ready", blocks, sources, len: root.textContent.length };
}
function answerEl(ans) {
  const box = h("div", { class: "qm-answer" });
  let ul = null;
  for (const b of ans.blocks) {
    const m = b.li && b.text.match(/^([^:]{2,60}):\s+(.+)$/);
    const kids = m ? [h("b", { text: m[1] + ": " }), m[2]] : [b.text];
    if (b.li) { if (!ul) { ul = h("ul"); box.appendChild(ul); } ul.appendChild(h("li", {}, ...kids)); }
    else { ul = null; box.appendChild(h("p", {}, ...kids)); }
  }
  if (ans.sources && ans.sources.length) {
    box.appendChild(h("div", { class: "qm-sources" }, ans.sources.slice(0, 4).map((s) => h("button", { type: "button", onclick: () => press(s.el) }, icon("file"), h("span", { text: s.title })))));
  }
  return box;
}
let findReturn = "";
/* Esc leaves Find for wherever it was opened from */
function exitFind() {
  findMode = false;
  findPending = "";
  findAhead = null;
  clearTimeout(liveT);
  clearTimeout(askTimer);
  liveAt.at = 0;
  const h0 = hashNow();
  if (/^#search\//.test(h0) && baseHash(h0) !== DONE_HASH) go(findReturn && (!/^#search\//.test(findReturn) || baseHash(findReturn) === DONE_HASH) && findReturn !== h0 ? findReturn : "#inbox");
  else invalidate(true);
}
function openFind() {
  closeSide();
  // a page with its own finder (Files, Subscriptions): / goes there
  const own = (screen.kind === "files" || screen.kind === "subs") && $("#qm-view .qm-subfind input:not(.qm-leaving *)");
  if (own && view && !view.hidden) { own.focus(); own.select(); return; }
  if (!/^#search\//.test(hashNow()) || baseHash(hashNow()) === DONE_HASH) findReturn = hashNow();
  const input = $("#qm-view .qm-find input:not(.qm-leaving *)");
  if (input && !view.hidden) { input.focus(); input.select(); return; }
  findMode = true;
  findDraft = "";
  findAhead = { at: Date.now(), text: "" }; // what you type before the field is there goes into it
  invalidate(true);
}
/* the moment between "/" and Find's field being on screen: keys typed then are the start of your search, never
   shortcuts (an "r" mid-word would start a reply, an "e" would archive) */
let findAhead = null;
function catchFindAhead(e) {
  if (!findAhead) return false;
  if (Date.now() - findAhead.at > 2500 || typing(e.target)) { findAhead = null; return false; }
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (e.key.length === 1) findAhead.text += e.key;
  else if (e.key === "Backspace") findAhead.text = findAhead.text.slice(0, -1);
  else return false;
  e.preventDefault();
  e.stopImmediatePropagation();
  const input = $("#qm-view .qm-find input:not(.qm-leaving *)");
  if (input) takeFindAhead(input);
  return true;
}
function takeFindAhead(input) {
  if (!findAhead) return;
  const t = findAhead.text;
  findAhead = null;
  input.focus();
  if (t) { input.value = t; input.setSelectionRange(t.length, t.length); findDraft = t; liveFind(input); }
}
/* ---- live: results as you type (a moment after you stop), each showing where your words are ---- */
let liveAt = { at: 0, pos: 0 }, liveT = 0;
const findTyping = () => Date.now() - liveAt.at < 2500;
function liveFind(input) {
  liveAt = { at: Date.now(), pos: input.selectionStart || input.value.length };
  clearTimeout(liveT);
  const q = input.value.trim();
  // (a question waits for Enter: it's answered, not searched letter by letter)
  if (q.length < 2 || isQuestion(q)) return;
  liveT = setTimeout(() => {
    if (input.value.trim() !== q || hashNow() === searchHash(q)) return;
    liveAt.at = Date.now();
    if (/^#search\//.test(hashNow())) location.replace(searchHash(q)); // one place in history while you type
    else { findReturn = hashNow(); go(searchHash(q)); }
  }, 320);
}
/* a line with your words marked */
function marked(str, re) {
  str = String(str || "");
  if (!re) return [str];
  const out = [];
  let last = 0, m;
  re.lastIndex = 0;
  while ((m = re.exec(str))) {
    if (!m[0]) { re.lastIndex++; continue; }
    if (m.index > last) out.push(str.slice(last, m.index));
    out.push(h("mark", { class: "qm-hit", text: m[0] }));
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push(str.slice(last));
  return out;
}
// what each result's emails say, read (a few at a time) when your words aren't in its subject or preview
const findCtx = new Map();
const ctxQueue = [];
let ctxBusy = 0, findCtxVer = 0, ctxFor = "";
function pumpCtx() {
  while (ctxBusy < 2 && ctxQueue.length) {
    const { id, acct, q } = ctxQueue.shift();
    // (a search you've already moved on from: its reading is dropped, and asked again if you come back)
    if (q !== ctxFor) { if (findCtx.get(id) === null) findCtx.delete(id); continue; }
    ctxBusy++;
    readMailThread(acct, id)
      .then((t) => findCtx.set(id, { msgs: t.messages.slice().reverse().map((x) => ({ text: ownWords(x.text), files: x.files || [] })) }), () => findCtx.set(id, { msgs: [] }))
      .finally(() => {
        ctxBusy--;
        findCtxVer++;
        while (findCtx.size > 120) findCtx.delete(findCtx.keys().next().value);
        if (screen.kind === "find") invalidate(true);
        pumpCtx();
      });
  }
}
/* the passage with the most of your words in it (each word's first appearance is a candidate) */
function bestAround(text, terms) {
  let best = { text: "", score: 0 };
  for (const t of terms) {
    const w = around(text, findRe(t));
    if (!w) continue;
    const score = terms.filter((u) => { const r = findRe(u); return r && r.test(w); }).length;
    if (score > best.score) best = { text: w, score };
  }
  return best;
}
// (Gmail's preview keeps the "> " of quoted lines: not worth showing)
const unquote = (str) => String(str || "").replace(/(^|\s)(?:>\s*)+/g, "$1").replace(/\s+/g, " ").trim();
function whereFound(x, q, i) {
  const terms = findTerms(q);
  const snip = unquote(x.snippet);
  if (!terms.length) return snip ? { text: snip } : null;
  const has = (str) => terms.filter((t) => { const r = findRe(t); return r && r.test(String(str || "")); });
  const s = bestAround(snip, terms);
  // the subject, who, and the preview between them hold every word: that's where it is
  const covered = new Set([...has(x.subject), ...has(whoText(x)), ...has(s.text)]);
  if (s.text && covered.size === terms.length) return { text: s.text };
  const c = findCtx.get(x.id);
  if (c) {
    let best = s;
    for (const msg of c.msgs) { const b = bestAround(msg.text, terms); if (b.score > best.score) best = b; }
    if (best.text) return { text: best.text };
    for (const msg of c.msgs) { const f = msg.files.find((n) => has(n).length); if (f) return { text: f, file: true }; }
  } else if (!findCtx.has(x.id) && i < 12) {
    // (only for the first results, and once each)
    findCtx.set(x.id, null);
    ctxQueue.push({ id: x.id, acct: accountIndex(), q });
    pumpCtx();
  }
  return s.text ? { text: s.text } : snip ? { text: snip } : null;
}
function renderFind(r, rows) {
  if (findPending && (!r || currentQuery(r.hash) !== findPending)) r = null, rows = null;
  const q = r ? currentQuery(r.hash) : "";
  const done = r && r.hash === DONE_HASH;
  if (done) { renderStream(r, false); return; }
  const { el, fresh } = setScreen("find", "find", () => {
    const input = h("input", { type: "search", placeholder: "Find", "aria-label": "Find mail", autocomplete: "off", spellcheck: "false" });
    input.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); exitFind(); }
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        clearTimeout(liveT);
        liveAt.at = 0;
        const q = input.value.trim();
        if (q.length >= 2 && !isQuestion(q) && hashNow() !== searchHash(q)) { if (/^#search\//.test(hashNow())) location.replace(searchHash(q)); else { findReturn = hashNow(); go(searchHash(q)); } }
        else moveCursor(1);
        input.blur();
      }
      e.stopPropagation();
    });
    input.addEventListener("input", () => { findDraft = input.value; askAhead(input.value); liveFind(input); });
    const form = h("form", { role: "search" }, icon("find"), input);
    // a question is answered (from every account); anything else is a Gmail search
    form.addEventListener("submit", (e) => { e.preventDefault(); if (isQuestion(input.value) && askReady()) openAsk(input.value); else runSearch(input.value); });
    const col = h("div", { class: "qm-find" }, form, h("div", { class: "qm-findbody" }));
    return h("div", {}, h("div", { class: "qm-scroll" }, col));
  });
  const input = $("input", el);
  const typed = asked.get(q) || q; // show the question, not the search Umbra made of it
  if (fresh) {
    input.value = findPending || typed; cursor = rows && rows.length ? 0 : -1; lastFindSig = "";
    if (findAhead) takeFindAhead(input); // (straight into the field, with anything you typed on the way)
    else setTimeout(() => { if (!q && !findPending) input.focus(); }, 30);
  }
  // while you type, the field keeps the keyboard however Gmail redraws underneath
  if (findTyping() && document.activeElement !== input) { input.focus({ preventScroll: true }); const p = Math.min(liveAt.pos, input.value.length); input.setSelectionRange(p, p); }
  // the search itself changed: the field says so when it came another way (Back, a pinned search), never over
  // what you're typing, and never just because you paused
  if (r && el.dataset.q !== q) {
    el.dataset.q = q;
    if (!fresh) { cursor = rows && rows.length ? 0 : -1; lastFindSig = ""; }
    if (!fresh && !findTyping() && (findPending || typed)) input.value = findPending || typed;
  }
  if (!rows) {
    const body = $(".qm-findbody", el);
    // (results already there: they stay, dimmed, until the next ones are in, rather than a moment of nothing)
    const had = !!$(".qm-result", body);
    const want = findPending || (r && had) ? (had ? "stale" : "think") : "none";
    if (body.dataset.pending !== want) {
      body.dataset.pending = want;
      body.classList.toggle("qm-stale", want === "stale");
      if (want === "think") body.replaceChildren(h("div", { class: "qm-thinking", "aria-label": "Thinking" }, h("i"), h("i"), h("i")));
      else if (want === "none" && !had) body.replaceChildren();
    }
    return;
  }
  if (rows.length && cursor < 0 && el.dataset.cursorSet !== q) { cursor = 0; el.dataset.cursorSet = q; }
  findList = { base: baseHash(r.hash.split("?")[0]), rows: rows.map(({ row, ...x }) => Object.assign(x, { account: { index: accountIndex(), email: accountEmail() } })) };
  rememberRows(accountEmail(), findList.rows);
  const form = $("form", el), pinWant = q && !isQuestion(typed) ? q + "|" + isPinned(q) : "";
  if (form.dataset.pin !== pinWant) { form.dataset.pin = pinWant; const old = $(".qm-pinbtn", form); if (old) old.remove(); if (pinWant) form.appendChild(pinButton(q)); }
  // Two answers race: Umbra's AI from the results (about two seconds) and Gmail's own AI Overview
  // (free Gemini, reads everything, slower). The quick one shows first; Gmail's replaces it once done.
  const ov = readOverview(r.main);
  if (ov.state === "ready") {
    const st = findStart.get(q);
    if (!st || st.len !== ov.len) { findStart.set(q, { len: ov.len, at: Date.now() }); setTimeout(() => invalidate(true), 1300); }
  }
  const ovDone = ov.state === "ready" && Date.now() - findStart.get(q).at > 1200;
  // Gmail's Gemini answers where the account has it (free); Umbra's AI answers questions elsewhere
  let quick = null;
  if (q && ai.ready && rows.length && !useGemini() && isQuestion(typed)) {
    const k = "f2:" + accountEmail() + ":" + hashString(typed + rows.slice(0, 15).map((x) => x.id).join(","));
    quick = ask(k, { kind: "find", query: typed, today: new Date().toDateString(), items: rows.slice(0, 15).map((x, i) => ({ index: i, from: x.from, subject: x.subject, preview: x.snippet, date: x.whenFull })) }, invalidate);
  }
  const quickAns = quick && quick.answer ? { blocks: [{ text: quick.answer }], sources: (Array.isArray(quick.refs) ? quick.refs : []).map((n) => rows[n]).filter(Boolean).slice(0, 3).map((x) => ({ title: x.subject, el: $(".xS", x.row) || x.row })) } : null;
  // a question gets Gmail's fuller answer once it's written; a plain search keeps the one-line answer
  const wantGmail = useGemini() || isQuestion(typed) || !ai.ready;
  const ans = wantGmail && ovDone ? ov : quickAns || (wantGmail && ov.state === "ready" ? ov : null);
  // (Gmail's overview doesn't always come for a plain search: after a few seconds, no more waiting for it)
  if (ov.state === "wait" && !findWaitAt.has(q)) { findWaitAt.set(q, Date.now()); setTimeout(() => invalidate(true), 6100); }
  const gaveUp = Date.now() - (findWaitAt.get(q) || Date.now()) > 6000;
  const waiting = !ans && ((wantGmail && ov.state === "wait" && !gaveUp) || quick === undefined);
  const sig = [q, rows.map((x) => x.id + x.when + (x.unread ? 1 : 0)).join("|"), cursor, ans ? hashString(ans.blocks.map((b) => b.text).join()) : waiting ? "wait" : "none", listEmpty(r.main), findCtxVer].join("#");
  if (sig === lastFindSig) return;
  lastFindSig = sig;
  const body = $(".qm-findbody", el);
  body.classList.remove("qm-stale");
  body.dataset.pending = "rows";
  const parts = [];
  const again = body.dataset.q === q && !!$(".qm-answer", body);
  body.dataset.q = q;
  if (ans && ans.blocks.length) { const a = answerEl(ans); if (again) a.classList.add("qm-still"); parts.push(a); }
  else if (waiting) parts.push(h("div", { class: "qm-thinking", "aria-label": "Thinking" }, h("i"), h("i"), h("i")));
  const list = h("div", { class: "qm-results" });
  const re = findRe(isQuestion(typed) ? "" : q);
  ctxFor = q;
  rows.forEach((x, i) => {
    const where = re ? whereFound(x, q, i) : x.snippet ? { text: unquote(x.snippet) } : null;
    const row = h("div", { class: "qm-result" + (x.unread ? " qm-unread" : "") + (i === cursor ? " qm-cursor" : ""), role: "link", "data-id": x.id },
      h("div", { class: "qm-rtop" }, h("span", { class: "qm-from" }, marked(whoText(x), re)), x.attach ? h("span", { class: "qm-rclip", "aria-label": "Has files" }, icon("clip")) : null, h("span", { class: "qm-when", text: x.when })),
      h("div", { class: "qm-rsubj" }, marked(x.subject || "(no subject)", re)),
      where ? h("div", { class: "qm-rctx" + (where.file ? " qm-rfile" : "") }, where.file ? icon("clip") : null, marked(where.text, re)) : null);
    row.addEventListener("click", () => { const live = liveRow(x.id) || (x.row.isConnected ? x.row : null); if (live) openRow(live); else openStreamRow(Object.assign({}, x, { account: { index: accountIndex(), email: accountEmail() } })); });
    list.appendChild(row);
  });
  parts.push(list);
  if (!rows.length && listEmpty(r.main)) parts.push(h("p", { class: "qm-answer qm-wait", text: "Nothing found." }));
  const pager = pagerEl(r.main);
  if (pager) parts.push(pager);
  body.replaceChildren(...parts);
  $(".qm-find", el).dataset.order = rows.map((x) => x.id).join(",");
}

/* ------------------------------------------------------------------ what Umbra knows about you
   A few lines the AI uses to answer well and to write in your voice: who you are, what you work on,
   who matters. Made about once a week from what Umbra already sees (your accounts, the people you
   write to, the subjects of mail you sent), and yours to edit in Settings → AI. */
function aboutText() {
  const mine = store.get("about-mine", "");
  if (mine.trim()) return mine.trim();
  const a = store.get("about", null);
  return a && a.facts ? a.facts.join("\n") : "";
}
let learning = false;
async function learnAbout(force) {
  if (learning || !ai.ready || (!force && aiPeeking)) return;
  const a = store.get("about", null);
  if (!force && a && Date.now() - a.at < 7 * 86400000) return;
  learning = true;
  try {
    const rank = ([, p]) => (p.wrote ? 1000 : 0) + (p.n || 0);
    const people = [...seen.entries()].sort((x, y) => rank(y) - rank(x)).slice(0, 30).map(([email, p]) => ({ name: p.name || "", email, wroteBack: !!p.wrote }));
    const sent = [];
    for (const acct of askAccounts()) {
      let rows = (store.get(boxKey(acct.email, "#sent"), null) || {}).rows || [];
      if (!rows.length && acct.current) rows = ((await searchHere("in:sent", 40)).rows || []);
      for (const r of rows.slice(0, 30)) sent.push({ account: acct.label, to: String(r.from || "").replace(/^To:\s*/i, ""), subject: r.subject, preview: String(r.snippet || "").slice(0, 80) });
    }
    countAI();
    const res = await helper("/summarize", { kind: "profile", me: myName(), accounts: askAccounts().map((x) => ({ label: x.label, email: x.email })), people, sent }, 60000);
    store.set("about", { at: Date.now(), facts: (res && res.facts) || [] });
  } catch (e) {
    store.set("about", Object.assign({}, store.get("about", { facts: [] }), { at: Date.now() - 6 * 86400000 })); // try again tomorrow
  }
  learning = false;
}

/* ------------------------------------------------------------------ asking
   A question about your mail ("when do the buses leave?", "what did Amazon refund?") is answered from
   the emails themselves, in every signed-in account: Umbra's AI searches Gmail and reads the
   conversations it needs (see "mail for the AI"), then answers in a sentence or two with its sources.
   It starts while you're still typing a question (once you pause), so the answer is usually there
   when you press Enter; follow-ups continue the same conversation. */
let askState = null, askOn = false, askBack = "";
const askLive = new Map(); // question -> run (one started ahead of Enter is reused)
const askReady = () => aiOn() && ai.ready && ai.agent && prefs.ask !== false;
const askNorm = (q) => q.trim().replace(/\s+/g, " ").replace(/[?.!]+$/, "").toLowerCase();
const askAccounts = () => (accounts.length ? accounts : [{ index: accountIndex(), email: accountEmail() }]).map((a) => ({ label: accountLabel(a.email), email: a.email, current: a.email === accountEmail() }));
const nowText = () => new Date().toLocaleString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
function askScreen() {
  if ((screen.kind === "thread" || screen.kind === "reading") && gmailMain()) {
    const t = readThread(gmailMain());
    const m0 = t.messages[0];
    if (t.id && /^[0-9a-f]{12,}$/i.test(t.id)) return { acct: accountEmail(), id: t.id, subject: t.subject, from: m0 ? (m0.mine ? "you" : personName(m0.email, m0.name)) : "", count: t.messages.length };
  }
  return { where: screen.kind === "stream" ? (folderTitle(everyFolder) || "Inbox") + " list" : screen.kind || "mail" };
}
function stepLabel(task) {
  if (task.tool === "search") {
    const names = task.accounts.map((e) => accountLabel(e));
    return "Searching " + (names.length > 1 ? "every account" : names[0]) + " for “" + task.query + "”";
  }
  const subs = task.threads.map((t) => t.subject).filter(Boolean);
  return subs.length ? "Reading “" + subs[0].slice(0, 60) + (subs[0].length > 60 ? "…" : "") + "”" + (subs.length > 1 ? " and " + (subs.length - 1) + " more" : "") : "Reading " + task.threads.length + " conversation" + (task.threads.length > 1 ? "s" : "");
}
async function runAskTask(task) {
  if (task.tool === "search") {
    const byAccount = {};
    await Promise.all(task.accounts.map(async (email) => {
      const a = accounts.find((x) => x.email === email) || { index: accountIndex(), email };
      try { byAccount[email] = email === accountEmail() ? await searchHere(task.query) : await searchThere(a, task.query); }
      catch (e) { byAccount[email] = { error: (e && e.message) || "failed" }; return; }
      // the top two come with the start of their latest message: often the answer, without another round
      await Promise.all((byAccount[email].rows || []).slice(0, 2).map(async (r) => {
        try {
          const t = await Promise.race([readMailThread(a.index, r.id), wait(3500).then(() => null)]);
          const m = t && t.messages[t.messages.length - 1];
          if (m) r.excerpt = { from: m.from, email: m.email, date: m.date, text: m.text.slice(0, 900) };
        } catch (e) { /* the snippet will do */ }
      }));
    }));
    return { call: task.call, byAccount };
  }
  const threads = await Promise.all(task.threads.map(async (w) => {
    const a = accounts.find((x) => x.email === w.acct) || { index: accountIndex() };
    try { return Object.assign({ ref: w.ref }, await readMailThread(a.index, w.id)); }
    catch (e) { return { ref: w.ref, error: (e && e.message) || "couldn't read it" }; }
  }));
  return { call: task.call, threads };
}
/* one question (or follow-up) to the AI: it asks for searches and reads, Umbra runs them */
async function askTurn(run, turn, first) {
  try {
    countAI();
    let res = await helper("/agent", first ? { op: "start", question: turn.q, context: { me: { name: myName() }, accounts: askAccounts(), about: aboutText(), now: nowText(), screen: run.screen } } : { op: "ask", id: run.sid, question: turn.q }, 90000);
    for (let i = 0; i < 8 && res.status === "tools"; i++) {
      run.sid = res.id;
      if (run.dropped) return;
      turn.steps.push(...res.tasks.map(stepLabel));
      drawAsk();
      const results = await Promise.all(res.tasks.map(runAskTask));
      if (run.dropped) return;
      res = await helper("/agent", { op: "results", id: res.id, results }, 90000);
    }
    run.sid = res.id;
    turn.answer = res.answer || "I couldn't find that in your mail.";
    turn.sources = res.sources || [];
    turn.status = "done";
  } catch (e) {
    turn.status = "error";
    const msg = String((e && e.message) || "");
    turn.answer = /expired/i.test(msg) ? "That conversation expired. Ask again."
      : /offline|couldn't reach/i.test(msg) ? "Couldn't reach the AI just now, so questions can't be answered. Check your connection."
      : /timed out/i.test(msg) ? "That took too long. Try again, or ask more specifically."
      : "Couldn't answer: " + (msg || "the AI didn't respond").replace(/\.$/, "") + ".";
  }
  turn.ms = Date.now() - turn.at;
  drawAsk();
  // the note about you is (re)made about once a week, right after a question (Umbra is already at work)
  if (first && turn.status === "done") setTimeout(() => learnAbout(), 1500);
}
function askStart(q, early) {
  const k = askNorm(q);
  let run = askLive.get(k);
  // (one started as you typed is reused; an old one isn't: new mail may have come, or you're somewhere else now)
  const recent = run && Date.now() - run.turns[0].at < 180000 && JSON.stringify(run.screen) === JSON.stringify(askScreen());
  if (run && !run.dropped && run.turns[0].status !== "error" && recent) return run;
  run = { q, sid: "", screen: askScreen(), turns: [{ q, steps: [], answer: "", sources: [], status: "working", at: Date.now() }], early: !!early };
  askLive.set(k, run);
  askTurn(run, run.turns[0], true);
  return run;
}
function askDrop(run) {
  if (!run || run.dropped) return;
  run.dropped = true;
  askLive.delete(askNorm(run.q));
  if (run.sid) helper("/agent", { op: "drop", id: run.sid }, 5000).catch(() => {});
}
/* while a question is being typed: start once it looks finished and the typing pauses */
let askTimer = 0, askEarly = null;
function askAhead(text) {
  clearTimeout(askTimer);
  const q = (text || "").trim();
  if (askEarly && askNorm(askEarly.q) !== askNorm(q) && !askEarly.shown) { askDrop(askEarly); askEarly = null; }
  if (!askReady() || !isQuestion(q) || q.split(/\s+/).length < 3) return;
  askTimer = setTimeout(() => { if (!askEarly || askNorm(askEarly.q) !== askNorm(q)) askEarly = askStart(q, true); }, /\?\s*$/.test(q) ? 450 : 1100);
}
function openAsk(q) {
  q = (q || "").trim();
  if (!q) return;
  closePalette();
  closeSide();
  if (!askOn) askBack = hashNow();
  const run = askStart(q);
  if (askState && askState !== run && !askState.shown) askDrop(askState);
  run.shown = true;
  run.reopen = false;
  askState = run;
  askOn = true;
  findMode = false;
  invalidate(true);
}
function exitAsk() {
  askOn = false;
  clearTimeout(askTimer);
  clearTimeout(liveT);
  if (askState) askState.reopen = false;
  if (askBack && hashNow() !== askBack) go(askBack);
  invalidate(true);
}
function askFollow(q) {
  const run = askState;
  q = (q || "").trim();
  if (!run || !q || !run.sid || run.turns.some((t) => t.status === "working")) return;
  const turn = { q, steps: [], answer: "", sources: [], status: "working", at: Date.now() };
  run.turns.push(turn);
  askTurn(run, turn, false);
  drawAsk();
}
function openSource(src) {
  const a = accounts.find((x) => x.email === src.acct);
  if (!a || a.email === accountEmail()) {
    askOn = false;
    openFrom(threadHash("#all", src.id), askBack || "#inbox");
    askState.reopen = true;
    return;
  }
  const url = `${location.origin}/mail/u/${a.index}/${threadHash("#all", src.id)}`;
  if (typeof GM_openInTab === "function") GM_openInTab(url, { active: true, insert: true }); else window.open(url, "_blank", "noopener");
}
function answerBlocks(text) {
  const box = h("div", { class: "qm-answer" });
  let ul = null;
  for (const line of String(text || "").split(/\n/)) {
    const l = line.trim();
    if (!l) { ul = null; continue; }
    const li = l.match(/^[-•*]\s+(.*)$/);
    if (li) { if (!ul) { ul = h("ul"); box.appendChild(ul); } ul.appendChild(h("li", { text: li[1] })); }
    else { ul = null; box.appendChild(h("p", { text: l })); }
  }
  return box;
}
function drawAsk() { if (askOn && screen.kind === "ask") renderAsk(); }
/* what it did, in one quiet line: Searched “hike” and “trip” · Read 2 conversations · 6.1 s */
function trailText(t) {
  const qs = [], reads = [];
  for (const st of t.steps) {
    const m = st.match(/^Searching .*? for (“.*”)$/);
    if (m) { if (!qs.includes(m[1])) qs.push(m[1]); }
    else reads.push(st);
  }
  const n = reads.reduce((sum, r) => sum + 1 + Number((r.match(/and (\d+) more$/) || [])[1] || 0), 0);
  const bits = [];
  if (qs.length) bits.push("Searched " + (qs.length > 2 ? qs.slice(0, 2).join(", ") + " and " + (qs.length - 2) + " more" : qs.join(" and ")));
  if (n) bits.push("Read " + n + " conversation" + (n > 1 ? "s" : ""));
  if (t.ms) bits.push((t.ms / 1000).toFixed(1) + " s");
  return bits.join(" · ");
}
function renderAsk() {
  const run = askState;
  if (!run) { askOn = false; return; }
  const { el, fresh } = setScreen("ask", run.q, () => {
    const input = h("input", { type: "search", placeholder: "Ask about your mail", "aria-label": "Ask about your mail", autocomplete: "off", spellcheck: "false" });
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); exitAsk(); } });
    input.addEventListener("input", () => askAhead(input.value));
    const form = h("form", { role: "search" }, icon("ai"), input);
    form.addEventListener("submit", (e) => { e.preventDefault(); const v = input.value.trim(); if (!v) return; if (isQuestion(v) || !ai.ready) openAsk(v); else { askOn = false; runSearch(v); } });
    return h("div", {}, h("div", { class: "qm-scroll" }, h("div", { class: "qm-find qm-ask" }, form, h("div", { class: "qm-askbody" }))));
  });
  threadBarless(el);
  const input = $("form input", el);
  if (fresh) input.value = run.q;
  const body = $(".qm-askbody", el);
  const sig = run.turns.map((t) => t.q + t.status + t.steps.length + t.answer.length).join("|") + "|" + !!run.sid;
  if (body.dataset.sig === sig) return;
  body.dataset.sig = sig;
  // each question keeps its own block and only what changed is redrawn: nothing flashes as steps arrive
  let fu = $(":scope > .qm-followup", body);
  run.turns.forEach((t, i) => {
    if (!t.node) t.node = h("div", { class: "qm-turn" });
    drawTurn(t, i);
    if (t.node.parentElement !== body) body.insertBefore(t.node, fu);
  });
  const last = run.turns[run.turns.length - 1];
  const wantFu = last.status !== "working" && !!run.sid;
  if (wantFu && !fu) {
    const inp = h("input", { type: "text", placeholder: "Ask a follow-up", "aria-label": "Ask a follow-up", autocomplete: "off" });
    inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter" && inp.value.trim()) { e.preventDefault(); const v = inp.value; inp.value = ""; askFollow(v); } else if (e.key === "Escape") { e.preventDefault(); exitAsk(); } });
    fu = h("div", { class: "qm-followup" }, icon("reply"), inp);
    body.appendChild(fu);
    setTimeout(() => { if (document.activeElement === document.body || !document.activeElement) inp.focus({ preventScroll: true }); }, 30);
  } else if (!wantFu && fu) fu.remove();
}
function drawTurn(t, i) {
  const node = t.node;
  const state = t.status + ":" + t.steps.length + ":" + t.answer.length;
  if (node.dataset.state === state) return;
  node.dataset.state = state;
  let q = $(":scope > .qm-askq", node);
  if (i && !q) { q = h("div", { class: "qm-askq", text: t.q }); node.prepend(q); }
  if (t.status === "working") {
    let steps = $(":scope > .qm-steps", node);
    if (!steps) { steps = h("div", { class: "qm-steps" }, h("div", { class: "qm-thinking", "aria-label": "Thinking" }, h("i"), h("i"), h("i"))); node.appendChild(steps); }
    const dots = $(".qm-thinking", steps);
    const have = $$(".qm-step", steps);
    for (let j = have.length; j < t.steps.length; j++) steps.insertBefore(h("div", { class: "qm-step" }, h("span", { text: t.steps[j] })), dots);
    $$(".qm-step", steps).forEach((x, j, all) => x.classList.toggle("qm-now", j === all.length - 1));
    return;
  }
  const parts = [q, answerBlocks(t.answer)];
  if (t.sources.length) parts.push(h("div", { class: "qm-sources" }, t.sources.map((src) => h("button", { type: "button", title: [src.from, src.date].filter(Boolean).join(" · "), onclick: () => openSource(src) },
    icon("file"), h("span", { text: src.subject || "Conversation" }), accounts.length > 1 ? h("small", { text: accountLabel(src.acct) }) : null))));
  if (t.status === "done" && t.steps.length) parts.push(h("div", { class: "qm-trail", text: trailText(t) }));
  node.replaceChildren(...parts.filter(Boolean));
}
function threadBarless(el) {
  if (!$(":scope > .qm-bar.qm-left", el)) el.append(h("div", { class: "qm-bar qm-left" }, ib("back", "Back", exitAsk)));
}

/* ------------------------------------------------------------------ conversation & reading */
const bodyCache = new Map();
let lastThreadSig = "";
let threadScrolledFor = "";
let expandedFor = "";
function cloneBody(m) {
  const whole = wholeBodies.get(m.id);
  const b = whole || m.body;
  // (pictures count by where they come from: Gmail swaps held-back ones for the real ones in place)
  const pics = b.getElementsByTagName("img");
  let srcs = "";
  for (let i = 0; i < pics.length && i < 80; i++) srcs += (pics[i].getAttribute("src") || "") + "|";
  const sig = (whole ? "w" : "") + b.childElementCount + ":" + b.textContent.length + ":" + pics.length + ":" + hashString(srcs);
  const hit = bodyCache.get(m.id);
  if (hit && hit.sig === sig) return hit;
  const node = b.cloneNode(true);
  const hasMore = markQuotes(node) || !!node.querySelector(".qm-quote, .adL, .ajR");
  node.removeAttribute("id");
  for (const e of node.querySelectorAll("[id]")) e.removeAttribute("id");
  // Gmail's own "[Message clipped] View entire message" link would leave Gmail for a bare page
  for (const a of node.querySelectorAll('a[href*="view=lg"]')) (a.closest(".iX") || a.parentElement || a).remove();
  node.classList.add("qm-body");
  const trackers = stripTrackers(node); // (pictures only there to report the opening: out of Umbra's copy)
  const own = node.cloneNode(true);
  for (const q of own.querySelectorAll(".qm-quote, .gmail_quote, .gmail_quote_container, blockquote")) q.remove();
  const rich = isRich(own);
  if (rich) trimTail(node);
  const dark = rich && darkAlready(node);
  const clipped = whole ? null : $('a[href*="view=lg"]', m.item);
  const entry = { sig, node, rich, dark, hasMore, clipped: clipped ? clipped.href : "", trackers };
  bodyCache.set(m.id, entry);
  if (bodyCache.size > 300) bodyCache.delete(bodyCache.keys().next().value);
  return entry;
}
/* designed emails often end in a tall run of empty spacer rows: drop it so nothing gapes below */
function trimTail(root) {
  // (a picture is solid unless it's written as a pixel or two: "100%" or "auto" is a real picture)
  const size = (x, a) => { const v = parseFloat(x.getAttribute(a) || ""); return Number.isFinite(v) ? v : 9; };
  const solid = (el) => el.textContent.trim() || $$("img, svg, video, iframe, hr, input, button", el).some((x) => x.tagName !== "IMG" || (size(x, "width") > 2 && size(x, "height") > 2));
  for (let i = 0; i < 60; i++) {
    let n = root;
    while (n.lastElementChild) n = n.lastElementChild;
    if (n === root || solid(n)) break;
    while (n.parentElement && n.parentElement !== root && !solid(n.parentElement)) n = n.parentElement;
    n.remove();
  }
}
// (the list a conversation was opened from; anything that isn't a conversation goes back to the inbox)
function parentHash(hash) {
  if (!isThreadHash(hash)) return "#inbox";
  const parts = hash.split("?")[0].split("/");
  parts.pop();
  return parts.join("/") || "#inbox";
}
/* the bars are built once per screen and kept, so a click is never lost to a re-render */
function threadBar(el, t) {
  let left = $(":scope > .qm-bar.qm-left", el), right = $(":scope > .qm-bar.qm-right", el);
  if (!left) {
    left = h("div", { class: "qm-bar qm-left" }, ib("back", "Back", goBack));
    right = h("div", { class: "qm-bar qm-right" },
      // a reaction to the newest email Gmail lets you react to (each message also has its own, beside it)
      ib("react", "React", (e) => { const m = reactTarget(); if (m) msgReact(m, e.currentTarget); else toast("Gmail doesn't offer reactions on this email."); }),
      ib("done", "Done", () => onThisThread(() => { const id = screen.key, subj = currentSubject(); if (press(gmailToolbar("7", ["Archive"]))) { dropRow(id, "done"); undoFor(id, "done", subj); } else toast("Couldn't archive."); })),
      menuButton("later", "Later", threadLater),
      menuButton("more", "More", threadMore));
    el.append(left, right);
  }
  $('[aria-label="Done"]', right).hidden = !gmailToolbar("7", ["Archive"]);
  const rb = $('[aria-label="React"]', right);
  if (rb) rb.hidden = !(t && t.messages.length === 1 && reactTarget(t));
  return [left, right];
}
function reactTarget(t) {
  if (!t) { const main = gmailMain(); t = main && $("h2.hP", main) ? readThread(main) : null; }
  if (!t) return null;
  for (let i = t.messages.length - 1; i >= 0; i--) { const m = t.messages[i]; if ($('button[aria-label="Add reaction" i]', liveItem(m))) return m; }
  return null;
}
// the open conversation's star (its newest email's, as Gmail draws it)
const starButton = () => { const main = gmailMain(); const all = main ? $$('.T-KT[aria-label], [aria-label="Not starred" i], [aria-label="Starred" i]', main).filter((x) => !x.closest("tr.zA") && visible(x)) : []; return all[all.length - 1] || null; };
/* this conversation's star (Gmail's own, in its view of it): on or off */
const threadStarred = () => { const b = starButton(); return !!b && /^starred/i.test(b.getAttribute("aria-label") || ""); };
let starPop = null; // { id, at }: a star just given to this conversation, which pops in when the header is drawn
/* star or unstar the open conversation (its menu, s, or the star by its title): the star by the title comes, with a
   little pop, or goes */
function toggleThreadStar() {
  if (lookBusy()) { onThisThread(toggleThreadStar); return; }
  const b = starButton();
  if (!b) { toast("Couldn't star this one."); return; }
  const mark = $("#qm-view .qm-hstar:not(.qm-leaving *)");
  if (threadStarred()) { if (mark) play(mark, [{ scale: "1", opacity: 1 }, { scale: ".3", opacity: 0 }], { ms: 150, easing: ACCEL, fill: "forwards" }); }
  else starPop = { id: screen.key, at: Date.now() };
  press(b);
  invalidate();
}
function starMark() {
  if (!threadStarred()) return null;
  const btn = h("button", { type: "button", class: "qm-hstar", "aria-label": "Starred. Remove star", title: withKey("Starred. Remove star", "star") }, icon("starred"));
  btn.addEventListener("click", (e) => { e.stopPropagation(); toggleThreadStar(); });
  if (starPop && starPop.id === screen.key && Date.now() - starPop.at < 3000) { starPop = null; requestAnimationFrame(() => popStarIn(btn)); }
  return btn;
}
async function threadLater(anchor) {
  if (lookBusy()) await afterLook();
  const direct = gmailToolbar(null, ["Snooze"]);
  if (direct) { await openGmailPopup(async () => press(direct), anchor); return; }
  const moreBtn = gmailToolbar(null, ["More email options", "More"]);
  if (!(await pressGmailMenuItem(moreBtn, "Snooze", anchor))) toast("Snooze isn't available here.");
}
async function threadMore(anchor) {
  if (menu && menu.key === menuKey(anchor)) { closeMenu(); return; }
  if (lookBusy()) await afterLook();
  const moreBtn = gmailToolbar(null, ["More email options", "More"]);
  const reading = screen.kind === "reading";
  const main = gmailMain();
  const m = reading && main && $("h2.hP", main) ? readThread(main).messages[0] : null;
  const mb = m ? msgButtons(m).moreBtn : null;
  const a = gmailMenuSoon(moreBtn, "thread"), b = reading ? gmailMenuSoon(mb, "reading") : { now: [], later: Promise.resolve([]) };
  const both = Promise.all([a.later, b.later]);
  const el = openMenu(anchor, threadMoreItems(anchor, a.now, b.now, moreBtn, mb, m, both));
  both.then(([x, y]) => { if (el && (!sameList(x, a.now) || !sameList(y, b.now))) refillMenu(el, threadMoreItems(anchor, x, y, moreBtn, mb, m, both)); });
}
function threadMoreItems(anchor, fromGmail, mine, moreBtn, mb, m, read) {
  // (one of Gmail's own: pressed once Gmail's menu, read out of sight, has been put away)
  const viaGmail = (btn, label) => () => read.then(([x, y]) => (x.concat(y).includes(label) ? pressGmailMenuItem(btn, label, anchor) : toast("That isn't available for this conversation.")));
  const st = starButton();
  // (Gmail's own "Add star" is the star below, so starring always shows by the title)
  const skip = st ? /^(snooze|mark as read|mark all as read)$|^(switch to|turn (off|on) highlighting)|^(add|remove) star$/i : /^(snooze|mark as read|mark all as read)$|^(switch to|turn (off|on) highlighting)/i;
  const have = (re) => fromGmail.some((l) => re.test(l));
  const items = [];
  const unreadB = gmailToolbar("2", ["Mark as unread"]);
  if (unreadB) items.push({ label: "Mark unread", run: () => { const id = screen.key; if (press(unreadB)) markUnreadHere(id); } });
  // everything Gmail's own bar has for a conversation is here too: star, move, labels, tasks
  if (st) items.push({ label: threadStarred() ? "Remove star" : "Star", run: () => toggleThreadStar() });
  const move = !have(/^move to/i) && gmailToolbar(null, ["Move to"]);
  if (move) items.push({ label: "Move to", run: () => openGmailPopup(async () => press(move), anchor) });
  const labels = !have(/^label/i) && gmailToolbar(null, ["Labels", "Label as"]);
  if (labels) items.push({ label: "Labels", run: () => openGmailPopup(async () => press(labels), anchor) });
  const tasks = !have(/^add to tasks/i) && gmailToolbar(null, ["Add to Tasks"]);
  if (tasks) items.push({ label: "Add to Tasks", run: () => { press(tasks); toast("Added to Tasks."); } });
  for (const label of fromGmail) if (!skip.test(label)) items.push({ label, run: viaGmail(moreBtn, label) });
  // a single email: what Gmail keeps in the email's own menu, too (in a conversation, each message has its own)
  if (m) {
    const known = new Set(items.filter((x) => x && x.label).map((x) => x.label.toLowerCase()));
    const own = mine.filter((l) => /^(forward as attachment|filter messages like this|translate|download message|show original|block |report phishing)/i.test(l) && !known.has(l.toLowerCase()));
    if (m && (m.body || own.length)) {
      items.push("-");
      if (m.body) items.push({ label: "Copy text", run: () => { navigator.clipboard.writeText(m.body.innerText.trim()).then(() => toast("Copied."), () => toast("Couldn't copy.")); } });
      for (const l of own) items.push({ label: l, run: viaGmail(mb, l) });
    }
  }
  items.push("-");
  const spamB = gmailToolbar("9", ["Report spam"]), delB = gmailToolbar("10", ["Delete"]);
  if (spamB) items.push({ label: "Report spam", run: () => { const id = screen.key; if (press(spamB)) dropRow(id, "spam"); } });
  if (delB) items.push({ label: "Delete", run: () => { const id = screen.key, subj = currentSubject(); if (press(delB)) { dropRow(id, "trash"); undoFor(id, "trash", subj); } } });
  items.push("-");
  const print = $('[aria-label="Print all"]');
  if (print) items.push({ label: "Print", run: () => press(print) });
  const win = $('[aria-label="In new window"]');
  if (win) items.push({ label: "Open in new window", run: () => press(win) });
  return items;
}
/* the message as Gmail has it right now (Gmail redraws messages, e.g. after expanding a conversation) */
function liveItem(m) {
  if (m.item && m.item.isConnected) return m.item;
  const main = gmailMain();
  const id = CSS.escape(String(m.id));
  const hit = main && $(`[data-message-id="${id}"], [data-legacy-message-id="${id}"]`, main);
  return (hit && hit.closest('[role="listitem"]')) || m.item;
}
function msgButtons(m) {
  const item = liveItem(m);
  const reply = $('button[aria-label="Reply" i], .DILLkc', item);
  const moreBtn = $('button[aria-label^="More message options" i], .Wsq5Cf', item);
  return { reply, moreBtn };
}
/* the design's order first, Gmail's rarer actions after, noise left out */
async function msgMore(m, anchor) {
  if (menu && menu.key === menuKey(anchor)) { closeMenu(); return; }
  if (lookBusy()) await afterLook();
  const { moreBtn } = msgButtons(m);
  const g = gmailMenuSoon(moreBtn, "msg");
  // (nothing known of Gmail's yet, the very first time: that one waits for them, so it isn't nearly empty)
  const now = g.now.length ? g.now : await g.later;
  const el = openMenu(anchor, msgMoreItems(m, anchor, moreBtn, now, g.later));
  g.later.then((x) => { if (el && !sameList(x, now)) refillMenu(el, msgMoreItems(m, anchor, moreBtn, x, g.later)); });
}
function msgMoreItems(m, anchor, moreBtn, labels, read) {
  const gm = (re, label) => { const l = labels.find((x) => re.test(x)); return l ? { label: label || l, run: () => read.then(() => pressGmailMenuItem(moreBtn, l, anchor)) } : null; };
  const entry = m.body && !m.collapsed ? cloneBody(m) : null;
  const items = [];
  if (entry && entry.hasMore && !entry.rich) items.push({ label: showAll.has(m.id) ? "Hide quoted text" : "Show quoted text", run: () => toggleQuoted(m) });
  if (m.body) items.push({ label: "Copy text", run: () => { navigator.clipboard.writeText(m.body.innerText.trim()).then(() => toast("Copied."), () => toast("Couldn't copy.")); } });
  items.push(gm(/^mark (as )?unread/i, "Mark unread from here"), gm(/^forward as attachment/i), gm(/^print/i), "-",
    gm(/^translate/i), gm(/^download/i), gm(/^show original/i), "-",
    gm(/^filter messages/i), gm(/^block /i), gm(/^report spam/i), gm(/^report phishing/i), gm(/^delete/i));
  return items.filter(Boolean);
}
function toggleQuoted(m) {
  if (showAll.has(m.id)) showAll.delete(m.id);
  else { showAll.add(m.id); const t = $(".ajR", m.item); if (t && !m.body.querySelector(".adL > *")) press(t); }
  invalidate();
}
/* Gmail's emoji reactions. Gmail's picker lives inside the conversation (beneath Umbra), so Umbra
   shows its own row of reactions and presses the chosen one in Gmail's picker. */
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "🔥"];
const REACTION_NAMES = { "👍": "thumbs up", "❤️": "red heart", "😂": "tears of joy", "😮": "open mouth", "😢": "crying", "🙏": "folded hands", "🎉": "party popper", "🔥": "fire" };
const pendingReact = new Map(); // message id -> { emoji, at }: shown at once, until Gmail has it
function msgReact(m, anchor) {
  const k = menuKey(anchor);
  if (menu && menu.key === k) { closeMenu(); return; }
  closeMenu();
  const el = h("div", { class: "qm-menu qm-emoji", role: "menu", "aria-label": "React" },
    REACTIONS.map((e) => h("button", { type: "button", role: "menuitem", tabindex: "-1", title: "React " + e, onclick: (ev) => { const from = ev.currentTarget.getBoundingClientRect(); closeMenu(); react(m, e); flyEmoji(e, from, m.id); } }, e)));
  el.addEventListener("keydown", (e) => {
    const all = $$('[role="menuitem"]', el);
    const i = all.indexOf(document.activeElement);
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); const fwd = e.key === "ArrowRight" || e.key === "ArrowDown"; const n = all[(i + (fwd ? 1 : all.length - 1)) % all.length]; if (n) n.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(); if (anchor.isConnected) anchor.focus({ preventScroll: true }); }
  });
  document.body.appendChild(el);
  placeUnder(el, anchor);
  const ar = anchor.getBoundingClientRect();
  const above = el.getBoundingClientRect().top < ar.top;
  el.style.transformOrigin = (above ? "bottom " : "top ") + "right";
  el.style.setProperty("--qm-from-y", above ? "4px" : "-4px");
  anchor.setAttribute("aria-expanded", "true");
  menu = { el, anchor, key: k };
  const holder = anchor.closest(".qm-msg");
  if (holder) holder.classList.add("qm-on");
  const first = $('[role="menuitem"]', el);
  if (first) first.focus({ preventScroll: true });
}
async function react(m, emoji) {
  const item = liveItem(m);
  const b = $$('button[aria-label="Add reaction" i]', item).find(visible) || $('button[aria-label="Add reaction" i]', item);
  if (!b) { toast("Reactions aren't available here."); return; }
  pendingReact.set(m.id, { emoji, at: Date.now() });
  invalidate(true);
  ROOT.classList.add("qm-hush");
  try {
    press(b);
    const picker = await until(() => $$(".btF.aQz, [role=menu]").find((x) => visible(x) && /smileys|recently used/i.test(x.textContent)), 3000, 40);
    if (!picker) throw new Error("no picker");
    const box = (picker.parentElement && picker.parentElement.parentElement) || picker;
    const want = emoji === "❤️" ? ["❤️", "♥️", "❤"] : [emoji];
    const find = () => $$("[aria-label]", box).find((x) => { const l = x.getAttribute("aria-label") || ""; return want.some((w) => l === w || l.startsWith(w + " ")); });
    let hit = find();
    // Gmail only builds the later categories on scroll: search for it instead
    const input = !hit && $("input", box);
    if (input) {
      input.focus();
      input.value = REACTION_NAMES[emoji] || "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "e", bubbles: true }));
      hit = await until(find, 2000, 40);
    }
    if (!hit) { key("Escape", picker); throw new Error("no emoji"); }
    press(hit);
  } catch (e) {
    pendingReact.delete(m.id);
    toast("Couldn't react.");
  } finally {
    ROOT.classList.remove("qm-hush");
    invalidate(true);
  }
}
function reactsEl(m) {
  const list = m.reacts.map((x) => Object.assign({}, x));
  const p = pendingReact.get(m.id);
  if (p) {
    if (list.some((x) => x.mine && x.emoji.replace(/️/g, "") === p.emoji.replace(/️/g, "")) || Date.now() - p.at > 15000) pendingReact.delete(m.id);
    else { const same = list.find((x) => x.emoji.replace(/️/g, "") === p.emoji.replace(/️/g, "")); if (same) { same.count++; same.mine = true; same.pending = true; } else list.push({ emoji: p.emoji, count: 1, mine: true, pending: true, i: -1 }); }
  }
  if (!list.length) return null;
  return h("div", { class: "qm-reacts" }, list.map((x) => h("button", {
    type: "button", class: "qm-react" + (x.mine ? " qm-minereact" : "") + (x.pending ? " qm-pending" : ""), title: x.label || "", "aria-label": x.label || x.emoji,
    onclick: () => { const b = x.i >= 0 && $$("button.AeBiU-I", liveItem(m)).filter((y) => !/^add reaction/i.test(y.getAttribute("aria-label") || ""))[x.i]; if (b) { press(b); setTimeout(() => invalidate(true), 400); } },
  }, h("span", { class: "qm-remoji", text: x.emoji }), x.count > 1 ? h("span", { text: String(x.count) }) : null)));
}

/* ---- replying ----
   Under a conversation sits a message box: Enter is a new line (it never sends), ⌘Enter or the arrow
   sends. Expand turns it into a full reply window (Cc, Bcc, formatting), taking the text and files
   along. Suggested replies and files go into the box too. Sending goes through Gmail's own reply. */
function lastReplyButton() {
  const main = gmailMain();
  const t = main && $("h2.hP", main) ? readThread(main) : null;
  const last = t && t.messages[t.messages.length - 1];
  return last ? msgButtons(last).reply : null;
}
function replyButton(how) {
  const main = gmailMain() || document;
  const all = $(".amn .ams.bkI", main), reply = $(".amn .ams.bkH", main), fwd = $(".amn .ams.bkG", main);
  return how === "forward" ? fwd : how === "reply" ? reply : all || reply;
}
const parkedDraft = () => $$(".ip.adB").find((ip) => $(".M9", ip) && ip.dataset.qmFloat !== "1" && !ip.dataset.qmQuiet);
const threadWindow = () => $$('.nH.Hd[role="dialog"]').find((d) => d.dataset.qmThread && d.dataset.qmThread === screen.key && !d.dataset.qmClosing && visible(d));
// this conversation's reply window on its way back into the box (closed or minimized a moment ago)
const closingWindow = () => $$('.nH.Hd[role="dialog"][data-qm-closing]').find((d) => d.isConnected && visible(d) && d.dataset.qmThread === screen.key);
function msgReply(m, how, anchor, cleared) {
  if (lookBusy()) return onThisThread(() => msgReply(m, how, anchor, cleared));
  const open = how !== "forward" && threadWindow();
  if (open) {
    if (isMinimized(open)) press($$("button.Hl, [aria-label='Minimize' i], [aria-label='Maximize' i]", open).find((b) => !b.closest(".qm-whead")));
    const box = $(".editable", open);
    if (box) setTimeout(() => focusEnd(box), 60);
    return Promise.resolve(open);
  }
  if (how === "forward" && !cleared) {
    const win = replyWindowHere();
    if (win) {
      const main = gmailMain();
      const t = main && $("h2.hP", main) ? readThread(main) : null;
      const last = t && t.messages[t.messages.length - 1];
      // the newest email: the reply in its window becomes the forward (words and all)
      if (!last || last.id === m.id) return forwardInPlace(win);
      // an earlier one: turning the window over would forward the newest email instead. Empty, it's closed and the
      // forward starts clean; with your words in it, it stays, and Umbra says why (one draft per conversation)
      // (an empty one closes first: its own close ends by discarding it, so not a moment before it's gone;
      // replyWindowHere stops counting it as soon as it starts closing)
      if (!hasContent(win)) { closeWindow(win); return until(() => !win.isConnected || !visible(win), 4000, 50).then(() => msgReply(m, how, anchor, true)); }
      toast("Your reply is open in a window. Send or close it first to forward an earlier email: Gmail keeps one draft per conversation.");
      const box = $(".editable", win);
      if (box) setTimeout(() => focusEnd(box), 60);
      return Promise.resolve(win);
    }
    const pd = parkedDraft(), ed = pd && $(".editable", pd);
    if (pd && !hasContent(pd)) return setAside(pd).then(() => msgReply(m, how, anchor, true));
    if (pd) toast(FWD_TAKEN);
  }
  // (from the reply bar's own "open in a window", it's always a window: the bar is already open)
  const fromBox = !!(anchor && anchor.classList && anchor.classList.contains("qm-cbox"));
  const kind = fromBox ? "reply" : "pill";
  if (how !== "forward" && !fromBox) {
    const main = gmailMain();
    const t = main && $("h2.hP", main) ? readThread(main) : null;
    const last = t && t.messages[t.messages.length - 1];
    if (last && last.id === m.id && !threadWindow()) { openBar(how); return Promise.resolve(null); }
  }
  const press1 = () => {
    const { reply, moreBtn } = msgButtons(m);
    if (how === "reply" && reply) { press(reply); return; }
    const label = how === "all" ? REPLY_ALL_WORDS : how === "forward" ? FORWARD_WORDS : REPLY_WORDS;
    return moreBtn ? pressGmailMenuItem(moreBtn, label, anchor, false) : false;
  };
  // Gmail keeps one reply open per conversation (the box opens it ahead of time, to the last message)
  // and reuses it rather than open another: switch that one to Reply or Reply all and take it (your
  // words stay). Only for an earlier message is the empty one set aside, so Gmail opens a new one.
  const parked = how !== "forward" ? parkedDraft() : null;
  if (parked) {
    const ed = $(".editable", parked);
    const main = gmailMain();
    const t = main && $("h2.hP", main) ? readThread(main) : null;
    const last = t && t.messages[t.messages.length - 1];
    if (hasContent(parked) || (last && last.id === m.id)) return openReply(anchor, kind, () => {}, "existing", () => replyAs(parked, how));
    return openReply(anchor, kind, press1, "", () => setAside(parked));
  }
  return openReply(anchor, kind, press1, "", null, how === "forward");
}
/* a reply that reaches fewer people than the newest email in its conversation is between */
function narrowed(ip) {
  const main = gmailMain();
  const t = main && $("h2.hP", main) ? readThread(main) : null;
  return !!t && rcptSig(ip).split(",").filter(Boolean).length < othersOn(t);
}
/* who an open reply goes to (besides you) */
const rcptSig = (ip) => [...new Set($$("[email]", ip).filter((e) => !e.closest(".editable")).map((e) => (e.getAttribute("email") || "").toLowerCase()))].filter((e) => e && e !== accountEmail()).sort().join(",");
/* The box opens Reply all ahead of time. "Reply" needs a switch only when that would reach more than one
   person: done with Gmail's own menu (out of sight), then waiting until Gmail has rebuilt the reply for its
   new recipients, so nothing is taken out from under it. */
// Gmail's "Type of response" menu, in the languages it's most used in
const REPLY_WORDS = /^(reply|responder|répondre|antworten|rispondi|beantwoorden|odpowiedz|svara|svar|vastaa|返信|回复|回覆|답장|ответить|відповісти|yanıtla|balas|trả lời|ตอบกลับ|उत्तर दें)$/i;
const FORWARD_WORDS = /^(forward|reenviar|transférer|weiterleiten|inoltra|encaminhar|doorsturen|przekaż dalej|vidarebefordra|videresend|välitä|転送|转发|轉寄|전달|переслать|переслати|ilet|teruskan|chuyển tiếp|ส่งต่อ|आगे भेजें)$/i;
const REPLY_ALL_WORDS = /^(reply (to )?all|responder a todos|répondre à tous|allen antworten|rispondi a tutti|allen beantwoorden|odpowiedz wszystkim|svara alla|svar alle|vastaa kaikille|全員に返信|全部回复|回覆全部|전체답장|ответить всем|відповісти всім|tümünü yanıtla|balas semua|trả lời tất cả|ตอบกลับทั้งหมด|सभी को उत्तर दें)$/i;
async function replyAs(ip, how) {
  if (how === "forward" && ip && ip.isConnected) {
    if (isForward(ip)) return true;
    const b = $('[aria-label="Type of response" i]', ip);
    if (!b) return false;
    // (in a window, Gmail draws this menu inside the window itself, where its other pop-ups never are)
    const was = new Set($$('[role="menu"]').filter(shownPopup));
    ROOT.classList.add("qm-hush");
    press(b);
    const menuEl = await until(() => $$('[role="menu"]').find((x) => shownPopup(x) && !was.has(x) && $$('[role="menuitem"]', x).some((it) => FORWARD_WORDS.test(itemLabel(it).trim()))), 1500, 30);
    ROOT.classList.remove("qm-hush");
    if (!menuEl) return false;
    const it = $$('[role="menuitem"]', menuEl).find((x) => visible(x) && FORWARD_WORDS.test(itemLabel(x).trim()));
    if (!it) { closeGmailMenu(menuEl, b); return false; }
    press(it);
    const ok = await until(() => ((parkedDraft() && isForward(parkedDraft())) || isForward(ip) ? true : null), 2500, 40);
    await wait(120);
    return !!ok;
  }
  if ((how !== "reply" && how !== "all") || !ip || !ip.isConnected) return true;
  const before = rcptSig(ip);
  // Reply: only when this one reaches more than one person. Reply all: only when it reaches fewer than the newest
  // email is between (narrowed by Umbra, or a draft Gmail kept from a Reply)
  if (how === "reply" && before.split(",").filter(Boolean).length <= 1) return true;
  if (how === "all" && ip.dataset.qmHow !== "reply" && !narrowed(ip)) return true;
  const b = $('[aria-label="Type of response" i]', ip);
  const m = b && (await gmailMenu(b));
  // (no "Reply to all" offered: there's no one else to add, and the reply goes ahead as it is)
  if (!m) return how === "all";
  const want = how === "all" ? REPLY_ALL_WORDS : REPLY_WORDS;
  const items = $$('[role="menuitem"]', m).filter(visible);
  const it = items.find((x) => want.test(itemLabel(x).trim()));
  // (no "Reply to all" offered: there's no one else to add, and the reply goes ahead as it is; a menu Umbra
  // can't read is a failure, said so)
  if (!it) { closeGmailMenu(m, b); const known = items.some((x) => REPLY_WORDS.test(itemLabel(x).trim())); if (how === "all" && known) delete ip.dataset.qmHow; return how === "all" && known; }
  press(it);
  unskip(m);
  const now = await until(() => { const d = parkedDraft(); return d && $(".editable", d) && rcptSig(d) !== before ? d : null; }, 2000, 40);
  await wait(150);
  const after = now || ip;
  if (how === "reply") after.dataset.qmHow = "reply"; else delete after.dataset.qmHow;
  return true;
}
/* close an empty reply Gmail opened ahead of time, quietly */
async function setAside(ip) {
  ip.dataset.qmQuiet = "1";
  try {
    const c = composerOf();
    if (c && c.ip === ip) detachBar(c);
    const d = $('[aria-label^="Discard draft" i]', ip);
    if (!d) return;
    hushToast(/discard/i, 2500);
    press(d);
    await until(() => !ip.isConnected || !visible(ip), 1500, 30);
  } finally {
    // (always: Gmail may bring this same element back as the next reply, and a hidden one can't be used)
    delete ip.dataset.qmQuiet;
    delete ip.dataset.qmHow;
  }
}
/* Gmail keeps one draft per conversation, and Forward takes it over (a second one can't be started beside it).
   So, before forwarding: an empty reply is set aside and the forward starts clean; a reply with your words in it
   becomes the forward, words and all (nothing is lost), and Umbra says so. */
const FWD_TAKEN = "Gmail keeps one draft per conversation, so your reply became this forward. Your words are in it.";
// this conversation's reply window (open or minimized), which a forward would take over
const replyWindowHere = () => $$('.nH.Hd[role="dialog"]').find((d) => d.dataset.qmThread && d.dataset.qmThread === screen.key && !d.dataset.qmFwd && !d.dataset.qmClosing && d.isConnected && visible(d));
async function forwardInPlace(dlg) {
  const said = ownText($(".editable", dlg) || dlg);
  const yours = $$(".dL", dlg).length; // (files you'd attached to the reply: yours, not the forwarded email's)
  if (bodyHidden(dlg)) { const up = gmailBtn(dlg, "button.Hl, [aria-label='Maximize' i]"); if (up) press(up); await until(() => !bodyHidden(dlg), 1500, 30); }
  if (!(await replyAs(dlg, "forward")) || !isForward(dlg)) { toast("Couldn't forward just now. Your reply is as it was."); return dlg; }
  dlg.dataset.qmFwd = "1";
  dlg.dataset.qmTitle = "Fwd: " + (currentSubject() || "");
  // the forwarded email's own files (Gmail adds them a moment after the switch): what closing an untouched forward
  // may leave behind; anything beyond them is yours, and keeps it a draft
  const baseline = () => { dlg.dataset.qmFiles0 = String(Math.max(0, $$(".dL", dlg).length - yours)); };
  baseline();
  setTimeout(baseline, 900);
  decorateWriting();
  focusToSoon(dlg);
  if (said.trim()) toast(FWD_TAKEN);
  return dlg;
}
const QM_WIN_FLAGS = ["qmThread", "qmFwd", "qmFiles0", "qmMin", "qmLastRect", "qmFilled", "qmTitle", "qmHome", "qmFloat", "qmHow"];
function freshWindow(dlg) { for (const k of QM_WIN_FLAGS) delete dlg.dataset[k]; }
const isForward = (dlg) => /^(fwd?|fw)\s*:/i.test(((($("input[name='subjectbox']", dlg) || {}).value) || "").trim());
/* a forward comes out ready for who it's to: Gmail folds the recipients into one line, so it's opened first.
   (Gmail may put the cursor in the message a moment later: it's brought back once, unless you've typed since.) */
function focusToSoon(dlg) {
  let typed = false;
  const mark = () => { typed = true; };
  window.addEventListener("keydown", mark, true);
  focusTo(dlg);
  setTimeout(() => { window.removeEventListener("keydown", mark, true); if (!typed && dlg.isConnected && !$$("input", dlg).includes(document.activeElement)) focusTo(dlg); }, 600);
}
async function focusTo(dlg) {
  const to = () => $$("input", dlg).find((i) => /^to recipients/i.test(i.getAttribute("aria-label") || "") && visible(i))
    || $$(".aoD input, [role=\"combobox\"]", dlg).find((i) => visible(i) && i.name !== "subjectbox" && i.type !== "file" && !i.closest(".editable"));
  // (the folded line opens when it takes focus, and hands it on to To)
  if (!to()) { const row = $$(".aoD.hl", dlg).find(visible); if (row) { row.focus(); if (!(await until(to, 600, 30))) press(row); } await until(to, 1500, 30); }
  const i = to();
  if (i && document.activeElement !== i) i.focus();
}
/* this conversation's reply window: the open one, or a new one growing out of `from` */
function replyBarAction(how, from, landed) {
  if (lookBusy()) return onThisThread(() => replyBarAction(how, from, landed));
  // "keep": the reply in the box goes into a window as it is (a new one is Reply all)
  const keep = how === "keep";
  if (keep) how = "all";
  // its window is still going back into the box (you clicked again straight away): it lands, then opens again
  if (!landed && closingWindow()) return until(() => !closingWindow(), 4000, 30).then(() => until(builtDraft, 2000, 30)).then(() => replyBarAction(keep ? "keep" : how, from, true));
  if (how === "forward") {
    // a reply already in a window: that window becomes the forward
    const win = replyWindowHere();
    if (win) return forwardInPlace(win);
    // a reply in the bar: empty, it's set aside; with words, it becomes the forward (as a window, words and all)
    const pd = parkedDraft();
    if (pd) {
      const ed = $(".editable", pd);
      if (!hasContent(pd)) { if (!landed) return setAside(pd).then(() => replyBarAction(keep ? "keep" : how, from, true)); }
      else {
        const c = composerOf();
        const box = c && c.box && visible(c.box) ? c.box : from;
        return openReply(box, box && box.classList.contains("qm-cbox") ? "reply" : "pill", () => {}, "existing", () => replyAs(pd, "forward"), true).then((dlg) => { if (dlg) toast(FWD_TAKEN); return dlg; });
      }
    }
  }
  const mine = threadWindow();
  if (mine && how !== "forward") {
    if (isMinimized(mine)) press($$("button.Hl, [aria-label='Minimize' i], [aria-label='Maximize' i]", mine).find((b) => !b.closest(".qm-whead")));
    const box = $(".editable", mine);
    if (box) setTimeout(() => box.focus(), 60);
    return Promise.resolve(mine);
  }
  const cbx = composerBox();
  const src = from || (cbx && visible(cbx) ? cbx : null) || $$("#qm-view .qm-endacts .qm-minibtn:not(.qm-leaving *), #qm-view .qm-article-bottom button:not(.qm-leaving *)").find(visible) || null;
  const kind = src && src.classList.contains("qm-cbox") ? "reply" : "pill";
  // from the bar: its own draft (Gmail may be redrawing the conversation just now, e.g. opening it whole)
  const c = kind === "reply" ? composerOf() : null;
  const own = c && c.ip && c.ip.isConnected && $(".M9", c.ip) ? c.ip : null;
  if (kind === "reply" && how !== "forward" && !parkedDraft() && !own && !landed && (c && (c.ip || c.ta.value.trim()))) {
    return until(builtDraft, 1500, 30).then(() => replyBarAction(keep ? "keep" : how, from, true));
  }
  const parked = how !== "forward" ? parkedDraft() || own : null;
  if (parked) return openReply(src, kind, () => {}, "existing", () => replyAs(parked, keep ? "keep" : how));
  const b = replyButton(how);
  if (!b) {
    // Gmail hides its Reply and Forward buttons while a reply is open: use the last message's own menu
    const main = gmailMain();
    const t = main && $("h2.hP", main) ? readThread(main) : null;
    const last = t && t.messages[t.messages.length - 1];
    return last ? msgReply(last, how, src) : Promise.resolve(null);
  }
  return openReply(src, kind, () => press(b));
}
/* A reply window is a real Gmail window ("pop out"): it floats, survives going back, and has Cc and
   Bcc. What opened it morphs into it. */
let replyOpening = null;
async function openReply(from, kind, start, mode, prepare, fwd) {
  if (replyOpening) return replyOpening;
  replyOpening = (async () => {
    const thread = screen.key;
    const before = new Set($$('.nH.Hd[role="dialog"]').filter(visible));
    const c = kind === "reply" ? composerOf() : null;
    const live = c && c.ip && $(".editable", c.ip);
    const typed = kind === "reply" ? (live ? ownText(live) : ($("textarea", from) || {}).value || "") : "";
    // the box keeps showing your words while Gmail turns them into a window
    if (c && typed.trim()) { c.ta.value = typed; c.root.classList.add("qm-handing"); }
    const ctx = beginOpen(from, kind);
    ROOT.classList.add("qm-popping"); // Gmail's inline reply stays out of sight while it turns into a window
    try {
      await settlePeek();
      // the reply this opens: the one already in the box, or a new one (Gmail may also reuse the open one)
      if (prepare && (await prepare()) === false) {
        endOpen(ctx);
        toast(fwd ? "Couldn't turn your reply into a forward just now. It's as it was." : "Couldn't switch the reply just now. It's as it was.");
        return null;
      }
      const ipsBefore = new Set($$(".ip.adB").filter(visible));
      // (Gmail's menu didn't have it: nothing else is taken in its place, least of all a reply already open)
      if ((await start()) === false) { endOpen(ctx); toast(fwd ? "Couldn't forward from here. Gmail's own Forward, at the end of the conversation, can." : "Couldn't open that reply here."); return null; }
      // (a forward may be the draft Gmail already had, turned into one: that counts at once)
      let ip = mode === "existing" ? parkedDraft() : await until(() => $$(".ip.adB").find((x) => $(".M9", x) && !x.dataset.qmQuiet && (!ipsBefore.has(x) || (fwd && isForward(x))) && visible(x)), 2500, 40);
      if (!ip) ip = $$(".ip.adB").find((x) => $(".M9", x) && !x.dataset.qmQuiet) || null;
      const pop = ip && ($$('[aria-label="Pop out reply" i]', ip).find(visible) || $('[aria-label="Pop out reply" i]', ip));
      if (!pop) {
        endOpen(ctx);
        if (ip) { ip.dataset.qmFloat = "1"; invalidate(true); } // no pop-out here: float Gmail's own reply
        return ip || null;
      }
      // (just after Gmail made the reply it doesn't hear its Pop out button yet: it waits until its editor and Send are
      // there, and is asked again while the reply is still in place and no window has come)
      await until(() => $(".editable", ip) && $(".T-I.aoO, [data-tooltip^='Send' i]", ip), 3000, 30);
      const popped = () => $$('.nH.Hd[role="dialog"]').find((d) => !before.has(d) && visible(d));
      let dlg = null;
      // (Gmail hears it about a tenth of a second after it made the reply: asked again that often, for a couple of seconds)
      for (let i = 0; i < 14 && !dlg; i++) {
        const b = ip.isConnected && ($$('[aria-label="Pop out reply" i]', ip).find(visible) || $('[aria-label="Pop out reply" i]', ip));
        if (i && !b) { dlg = await until(popped, 3000, 16); break; } // (it's on its way: Gmail took the reply out already)
        press(b || pop);
        dlg = await until(popped, 140, 16);
      }
      if (!dlg) {
        // no window: Gmail's own reply floats instead, so it's never left out of sight with the keyboard in it
        endOpen(ctx);
        if (ip.isConnected && $(".M9", ip)) { ip.dataset.qmFloat = "1"; invalidate(true); return ip; }
        return null;
      }
      freshWindow(dlg);
      dlg.dataset.qmThread = thread;
      dlg.dataset.qmHome = "reply";
      dlg.dataset.qmTitle = "Re: " + (currentSubject() || "");
      // (a forward, whether asked for or what Gmail made of the draft; the name isn't fwd, which is the ask above)
      if (isForward(dlg) || (ip && isForward(ip))) { dlg.dataset.qmFwd = "1"; dlg.dataset.qmTitle = "Fwd: " + (currentSubject() || ""); }
      // it goes over the message box, wherever the click was
      const cb = composerBox();
      const over = cb && cb.offsetParent ? boxOf(cb) : from && from.isConnected && visible(from) ? boxOf(from) : null;
      await finishOpen(ctx, dlg, {
        expect: typed.trim().split("\n")[0].slice(0, 24), typed: typed.split("\n").slice(0, 3).join("\n"),
        // it comes out as you'll use it: the cursor in the message (Gmail folds the recipients then)
        focus: (d) => { if (d.dataset.qmFwd) { focusTo(d); return; } const b = $(".editable", d); if (b && !d.contains(document.activeElement)) b.focus(); },
        place: over ? (r) => windowSpot(over, "reply", { w: r.width, h: r.height }) : null,
        before: () => ROOT.classList.add("qm-replying"),
      });
      // (the files a forward brings along are the email's, not something you added)
      if (dlg.dataset.qmFwd) { dlg.dataset.qmFiles0 = String($$(".dL", dlg).length); setTimeout(() => { if (dlg.isConnected) dlg.dataset.qmFiles0 = String(Math.max(Number(dlg.dataset.qmFiles0 || 0), $$(".dL", dlg).length)); }, 900); } // (Gmail adds them a moment later)
      const box = $(".editable", dlg);
      if (dlg.dataset.qmFwd) { if (!$$("input", dlg).some((i) => i === document.activeElement)) focusToSoon(dlg); }
      else if (box) box.focus();
      return dlg;
    } catch (e) {
      // whatever went wrong, nothing is left half way: the window shows as it is
      endOpen(ctx);
      for (const d of $$("[data-qm-gone]")) if (!d.dataset.qmClosing) { delete d.dataset.qmGone; unframe(d); }
      return null;
    } finally {
      ROOT.classList.remove("qm-popping");
      if (c) { c.root.classList.remove("qm-handing"); c.ta.value = ""; autosize(c); }
      setTimeout(() => { replyOpening = null; invalidate(); }, 50);
    }
  })();
  return replyOpening;
}

/* ---- windows open and close themselves ----
   What moves is Gmail's real window. It appears where it will stay, and its outline grows out of the thing
   you clicked (the + button, the reply bar, a chip) into its own, while a copy of that thing fades away on top
   and the window's shadow grows with it underneath. Nothing stands in for it, so there's nothing to swap: it
   looks right, and takes your typing, from its very first frame. Until Gmail has drawn it, the thing you
   clicked shows it's working. Closing and minimizing run the same thing backwards, then Gmail closes it. */
const EASE_OUT = "cubic-bezier(.32, .72, 0, 1)"; // moves from the first frame, settles without overshoot
const EASE_IN_OUT = "cubic-bezier(.4, 0, .2, 1)";
const EASE_IN = "cubic-bezier(.4, 0, .7, .2)";
const SHADOW_NONE = "0px 0px 0px 0px rgba(0, 0, 0, 0)";
let morph = null; // the window opening right now: { kind, from, at }
const rectOf = (r) => ({ left: r.left, top: r.top, width: r.width, height: r.height });
const cssVar = (n) => getComputedStyle(ROOT).getPropertyValue(n).trim();
/* how something looks: colour, corners, edge and shadow, as drawn right now */
function lookOf(el) {
  const cs = getComputedStyle(el);
  const rad = cs.borderTopLeftRadius || "0";
  const radius = /%$/.test(rad) ? (parseFloat(rad) / 100) * (el.offsetWidth || 0) : parseFloat(rad) || 0;
  const bw = parseFloat(cs.borderTopWidth) || 0;
  return { bg: cs.backgroundColor, radius, border: bw ? cs.borderTopColor : "rgba(0, 0, 0, 0)", shadow: cs.boxShadow && cs.boxShadow !== "none" ? cs.boxShadow : SHADOW_NONE };
}
/* a source's box, ignoring any scale it's animating through */
function boxOf(el) {
  const r = el.getBoundingClientRect();
  const w = el.offsetWidth || r.width, hh = el.offsetHeight || r.height;
  return { left: r.left + r.width / 2 - w / 2, top: r.top + r.height / 2 - hh / 2, width: w, height: hh };
}
/* where a window from `r` goes: centred over it (new messages: bottom right), always on screen */
function windowSpot(r, kind, size) {
  const W = window.innerWidth, H = window.innerHeight, m = 16;
  const width = Math.min(size.w, W - 2 * m), height = Math.min(size.h, H - 2 * m);
  let left, top;
  if (kind === "fab" || kind === "chip") { left = W - 32 - width; top = H - 32 - height; }
  else { left = r.left + r.width / 2 - width / 2; top = r.top + r.height - height; }
  return { left: Math.max(m, Math.min(W - m - width, left)), top: Math.max(m, Math.min(H - m - height, top)), width, height };
}
const px = (r) => ({ left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
/* shadows only blend into one another with as many layers, inset in the same places: pad them to match */
function shadowLayers(s) {
  if (!s || s === "none") return [];
  const out = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && !depth) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function matchShadows(a, b) {
  const split = (L) => [L.filter((x) => !/\binset\b/.test(x)), L.filter((x) => /\binset\b/.test(x))];
  const [ao, ai] = split(shadowLayers(a)), [bo, bi] = split(shadowLayers(b));
  const no = Math.max(ao.length, bo.length, 1), ni = Math.max(ai.length, bi.length);
  const pad = (L, n, inset) => { const r = L.slice(); while (r.length < n) r.push(SHADOW_NONE + (inset ? " inset" : "")); return r; };
  const join = (o, i) => [...pad(o, no, false), ...pad(i, ni, true)].join(", ");
  return [join(ao, ai), join(bo, bi)];
}
function shapeFrames(a, la, b, lb) {
  const [sa, sb] = matchShadows(la.shadow, lb.shadow);
  return [Object.assign(px(a), { borderRadius: la.radius + "px", backgroundColor: la.bg, borderColor: la.border, boxShadow: sa }),
    Object.assign(px(b), { borderRadius: lb.radius + "px", backgroundColor: lb.bg, borderColor: lb.border, boxShadow: sb })];
}
const fade = (el, a, b, ms, delay) => el.animate([{ opacity: a }, { opacity: b }], { duration: ms, delay: delay || 0, easing: "ease", fill: "both" });
function shellAt(rect, look, cls) {
  const shell = h("div", { class: "qm-morph" + (cls ? " " + cls : ""), "aria-hidden": "true" });
  shell.dataset.at = String(Date.now());
  Object.assign(shell.style, px(rect), { borderRadius: look.radius + "px", backgroundColor: look.bg, borderColor: look.border, boxShadow: look.shadow });
  document.body.appendChild(shell);
  return shell;
}
/* an exact copy of one of Umbra's own things (the message box, a button, a chip) */
function faceOf(el, typed) {
  const r = el.getBoundingClientRect();
  if (el.id === "qm-fab") return h("div", { class: "qm-m-face qm-m-fabface" }, icon("plus")); // centred in the surface as it grows
  const c = el.cloneNode(true);
  c.removeAttribute("id");
  for (const x of c.querySelectorAll("[id]")) x.removeAttribute("id");
  c.classList.remove("qm-morph-src", "qm-chip-in", "qm-chip-out", "qm-pressing", "qm-waiting");
  c.classList.add("qm-m-face", "qm-m-src");
  c.setAttribute("aria-hidden", "true");
  c.inert = true;
  Object.assign(c.style, { width: r.width + "px", height: r.height + "px", minHeight: "0" });
  const ta = $("textarea", c);
  if (ta && typed !== undefined) { ta.value = typed; ta.textContent = typed; ta.style.visibility = "visible"; }
  // the box as it looks holding those words (its discard button showing)
  const trash = typed && typed.trim() && $(".qm-ctrash", c);
  if (trash) { trash.style.setProperty("display", "inline-flex", "important"); const send = $(".qm-send", c); if (send) send.disabled = false; }
  return c;
}
/* an exact copy of a writing window as it is now (for one Gmail takes away at once, as on Send) */
function snapshot(win) {
  const r = win.getBoundingClientRect();
  if (r.width < 40 || r.height < 40) return null;
  const c = win.cloneNode(true);
  const srcIn = win.querySelectorAll("input, textarea"), dstIn = c.querySelectorAll("input, textarea");
  srcIn.forEach((x, i) => { if (dstIn[i] && x.type !== "file") { dstIn[i].value = x.value; if (x.value) dstIn[i].setAttribute("value", x.value); } });
  c.removeAttribute("role");
  c.removeAttribute("style");
  for (const a of [...c.attributes]) if ((a.name.startsWith("data-qm-") && a.name !== "data-qm-fit") || a.name === "id" || a.name === "tabindex") c.removeAttribute(a.name);
  c.classList.remove("qm-morph-in", "qm-new", "qm-tucked");
  c.classList.add("qm-msnap", "qm-m-face");
  if (win.closest(".aSt")) c.classList.add("qm-snapfull");
  for (const k of ["--qm-bodymax", "--qm-fullbody"]) { const v = win.style.getPropertyValue(k); if (v) c.style.setProperty(k, v); }
  for (const x of c.querySelectorAll("script, iframe, object, embed, input[type=file]")) x.remove();
  for (const x of c.querySelectorAll("*")) {
    for (const a of ["id", "name", "jsaction", "jscontroller", "jsname", "jslog", "jsmodel", "jsdata", "tabindex", "autofocus", "href", "for"]) if (x.hasAttribute(a)) x.removeAttribute(a);
    if (x.hasAttribute("contenteditable")) x.setAttribute("contenteditable", "false");
  }
  c.setAttribute("aria-hidden", "true");
  c.inert = true;
  Object.assign(c.style, { width: r.width + "px", height: r.height + "px" });
  return { node: c, w: r.width, h: r.height };
}
/* the next frame, or a moment, whichever comes first (a window is never left waiting on a paused screen) */
// (the development harness can slow these down to look at them frame by frame)
// still: you asked for less motion (Settings › Look, or your Mac's own "Reduce motion")
function prefersStill() { return prefs.motion === "reduced" || (prefs.motion !== "full" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
const slowMo = () => (typeof GM_getValue !== "function" && window.__umbra && window.__umbra.slow) || (prefersStill() ? 0.02 : 1);
const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 50); });
/* an animation's end, or its length and a little more, whichever comes first */
const ended = (anim, ms) => Promise.race([anim.finished.catch(() => {}), wait(ms + 200)]);
/* a copy of something small, pinned to the corner of the surface nearest where it sits in the window's box */
function anchored(face, s, r) {
  if (face.classList.contains("qm-m-fabface")) return face;
  const below = s.top + s.height / 2 > r.top + r.height / 2, right = s.left + s.width / 2 > r.left + r.width / 2;
  Object.assign(face.style, below ? { top: "auto", bottom: "-1px" } : {}, right && s.width < r.width ? { left: "auto", right: "-1px" } : {});
  return face;
}
/* window box `r` seen through frame `f`: its top left corner rides the frame's (so its title, who it's to and
   your words show from the first frame), and whatever is past the frame is cut away */
const frameOf = (r, f, radius) => ({
  transform: `translate(${(f.left - r.left).toFixed(1)}px, ${(f.top - r.top).toFixed(1)}px)`,
  clipPath: `inset(0px ${(r.width - f.width).toFixed(1)}px ${(r.height - f.height).toFixed(1)}px 0px round ${Math.max(0, radius).toFixed(1)}px)`,
});
const unframe = (dlg) => { dlg.style.clipPath = ""; dlg.style.transform = ""; };
/* under a window that's growing or shrinking, its own colour, so it's never see-through half way (only when that
   colour is solid: a see-through one, doubled, would darken and then lighten as the copy goes) */
const underBg = (bg) => { const m = /rgba?\(([^)]+)\)/.exec(bg || ""); const a = m ? m[1].split(/[,\s/]+/).filter(Boolean)[3] : null; return m && (a === undefined || Number(a) >= 0.99) ? bg : "rgba(0, 0, 0, 0)"; };
/* a window's box where it rests (not where an opening or closing is carrying it just now) */
function restBox(dlg) {
  const r = dlg.getBoundingClientRect();
  const t = getComputedStyle(dlg).transform;
  if (!t || t === "none") return r;
  const m = new DOMMatrixReadOnly(t);
  return { left: r.left - m.e, top: r.top - m.f, right: r.right - m.e, bottom: r.bottom - m.f, width: r.width, height: r.height };
}
/* a thing stands aside while its copy is drawn over it (the last one to ask is the one that gives it back) */
function standIn(el) {
  const me = {};
  el.qmStandIn = me;
  el.classList.add("qm-morph-src");
  return () => { if (el.qmStandIn === me) { el.qmStandIn = null; el.classList.remove("qm-morph-src"); } };
}
/* the source says it heard you while Gmail draws the window (with a spinner if Gmail is slow) */
function beginOpen(from, kind) {
  if (!from || !visible(from)) return { kind, from: null, at: Date.now() };
  from.classList.remove("qm-morph-dest"); // (a window that just went into it is done with it)
  const ctx = { kind, from, at: Date.now() };
  from.classList.add("qm-pressing");
  ctx.slow = setTimeout(() => from.classList.add("qm-waiting"), 380);
  morph = ctx;
  return ctx;
}
function endOpen(ctx) {
  if (!ctx) return;
  clearTimeout(ctx.slow);
  if (ctx.from) ctx.from.classList.remove("qm-pressing", "qm-waiting");
  if (morph === ctx) morph = null;
}
/* the window, drawn and in place, comes out of where you clicked */
async function finishOpen(ctx, dlg, opts = {}) {
  dlg.dataset.qmSeen = "1";
  dlg.dataset.qmGone = "1"; // out of sight until it's ready to come out
  try {
    // a window that arrives minimized is opened up first (you asked for it)
    await until(() => ($(".editable", dlg) && !bodyHidden(dlg)) || gmailBtn(dlg, "[aria-label='Maximize' i]"), 2500, 16);
    if (bodyHidden(dlg) && gmailBtn(dlg, "[aria-label='Maximize' i]")) {
      delete dlg.dataset.qmGone; // Gmail answers its own buttons only on a window that's there
      // (Gmail can be slow to hear it just after it opened the window: asked again, a few times)
      let up = false;
      for (let i = 0; i < 3 && !up; i++) {
        const maxi = gmailBtn(dlg, "[aria-label='Maximize' i]");
        if (maxi) press(maxi);
        up = !!(await until(() => !bodyHidden(dlg), 1500, 16));
      }
      if (!up) { endOpen(ctx); return; } // Gmail keeps it minimized: it stays a chip beside the + button
      dlg.dataset.qmGone = "1";
    }
    // ready: Gmail has drawn its editor and Send (and a moved reply has its words)
    const filled = () => { const ed = $(".editable", dlg); return !!ed && ed.offsetHeight > 16 && !!$(".T-I.aoO, [data-tooltip^='Send' i]", dlg) && (!opts.expect || ownText(ed).includes(opts.expect.slice(0, 16))); };
    await until(filled, 4000, 16);
    if (opts.fill) { try { await opts.fill(dlg); } catch (e) { /* it opens as it is */ } }
    if (opts.focus) { try { opts.focus(dlg); } catch (e) { /* a nicety */ } }
    decorateWriting(); // Umbra's header on it, titled
    // where it goes, at the size it settles at
    let last = "";
    for (let i = 0; i < 8; i++) {
      if (dlg.closest(".aSt")) fitFull(dlg); else fitWindow(dlg);
      const r0 = dlg.getBoundingClientRect();
      const sig = Math.round(r0.width) + "x" + Math.round(r0.height);
      if (sig === last) break;
      last = sig;
      await nextFrame();
    }
    if (opts.place && !dlg.closest(".aSt")) { placeWindow(dlg, opts.place(restBox(dlg))); clampWindow(dlg, true); }
    endOpen(ctx);
    await reveal(dlg, ctx && ctx.from ? { rect: boxOf(ctx.from), el: ctx.from, typed: opts.typed } : null, opts.before);
  } finally {
    endOpen(ctx);
    delete dlg.dataset.qmGone;
    unframe(dlg);
  }
}
/* while a window opens or closes, Gmail may still be moving it (settling its row of windows, or growing it as
   it fills in): everything drawn for it follows, frame by frame */
function follow(dlg, r, moved) {
  let on = true, at = rectOf(r);
  const tick = () => {
    if (!on || !dlg.isConnected) return;
    const b = restBox(dlg);
    if (Math.abs(b.left - at.left) > 0.5 || Math.abs(b.top - at.top) > 0.5 || Math.abs(b.width - at.width) > 0.5 || Math.abs(b.height - at.height) > 0.5) {
      at = rectOf(b);
      moved(at);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => { on = false; };
}
/* How a window comes out of what you clicked, and goes back into it. Only its position, size (one scale for both
   ways, so its words never stretch) and opacity move: the browser does that on its own, smoothly, however busy Gmail
   is. From something small (the + button, a chip, a button) it grows out of it; from the reply box, which is as
   wide as a window, it rises out of it; from a window of another size (full size and back) it scales from that. */
function windowMotion(win, from) {
  const cx = from.left + from.width / 2 - (win.left + win.width / 2), cy = from.top + from.height / 2 - (win.top + win.height / 2);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (from.width <= 260 && from.height <= 96) return { kind: "small", k: clamp(Math.max(from.width / win.width, from.height / win.height) * 1.8, 0.18, 0.55), dx: cx, dy: cy };
  if (from.width >= win.width * 0.85 && from.height < win.height * 0.45) return { kind: "bar", k: 0.965, dx: clamp(cx, -240, 240) * 0.5, dy: clamp(cy, -160, 160) * 0.5 };
  return { kind: "window", k: clamp(from.width / win.width, 0.5, 1.25), dx: cx, dy: cy };
}
const motionAt = (m) => `translate(${m.dx.toFixed(1)}px, ${m.dy.toFixed(1)}px) scale(${m.k.toFixed(3)})`;
/* grow a window (already in place, out of sight) out of `src` ({ rect, el } or { rect, look }); `last` runs as it
   takes over from what it came out of */
function reveal(dlg, src, last) {
  const r = restBox(dlg);
  if (!src || prefersStill()) {
    if (last) last();
    delete dlg.dataset.qmGone;
    if (prefersStill()) return Promise.resolve();
    return ended(dlg.animate([{ opacity: 0, transform: "translateY(10px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 240 * slowMo(), easing: EASE_OUT }), 240 * slowMo());
  }
  const m = windowMotion(r, src.rect);
  const ms = (m.kind === "window" ? 420 : 460) * slowMo();
  const opacity = m.kind === "small" ? [0, 1, 0.28] : m.kind === "bar" ? [0, 1, 0.4] : [1, 1, 0.5];
  // the reply box it rises from fades as the window comes, and is put away (out of sight) once the window covers it
  const fromBox = src.el && src.el.classList && src.el.classList.contains("qm-cbox");
  const boxOut = fromBox ? play(src.el, [{ opacity: 1 }, { opacity: 0 }], { ms: 140, easing: "ease-out", fill: "forwards" }) : null;
  let handed = false;
  const hand = () => { if (handed) return; handed = true; if (last) last(); if (boxOut) boxOut.cancel(); };
  if (fromBox) setTimeout(hand, 150 * slowMo()); else hand();
  dlg.style.transformOrigin = "50% 50%";
  delete dlg.dataset.qmGone;
  const grow = dlg.animate([
    { transform: motionAt(m), opacity: opacity[0] },
    { opacity: opacity[1], offset: opacity[2] },
    { transform: "none", opacity: 1 },
  ], { duration: ms, easing: SPRING.smooth.e, fill: "backwards" });
  return ended(grow, ms).then(() => { hand(); grow.cancel(); dlg.style.transformOrigin = ""; unframe(dlg); });
}
/* shrink a window into `to` (the box, the + button, a chip), then let Gmail close (or minimize) it
   (`typed`: the words a reply brings back into the box, shown there at once, before Gmail has put them back) */
function conceal(dlg, to, then, typed) {
  const r = restBox(dlg);
  dlg.style.pointerEvents = "none";
  const cleanup = () => { dlg.style.pointerEvents = ""; dlg.style.transformOrigin = ""; unframe(dlg); };
  if (!to || !visible(to) || prefersStill()) {
    const ms = prefersStill() ? 1 : 170 * slowMo();
    const out = dlg.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(10px) scale(.97)" }], { duration: ms, easing: "ease", fill: "forwards" });
    return ended(out, ms).then(() => { then(); setTimeout(() => { out.cancel(); cleanup(); }, 60); });
  }
  const t = boxOf(to);
  const m = windowMotion(r, t);
  const intoBox = to.classList.contains("qm-cbox");
  // what it goes into is back already (shown, and takes your next click), and comes up as the window lands
  to.classList.add("qm-morph-dest");
  if (intoBox) ROOT.classList.remove("qm-replying");
  // (a reply with words in it: those words are in the box from the moment it lands, before Gmail has put the draft back)
  let copy = null;
  if (intoBox && typed) {
    copy = shellAt(t, Object.assign({}, lookOf(to), { shadow: SHADOW_NONE }), "qm-m-top");
    copy.appendChild(anchored(faceOf(to, typed), t, t));
  }
  const giveBack = copy ? standIn(to) : () => {};
  const ms = (m.kind === "small" ? 320 : 260) * slowMo();
  dlg.style.transformOrigin = "50% 50%";
  const shrink = dlg.animate([
    { transform: "none", opacity: 1 },
    { opacity: m.kind === "small" ? 0.9 : 0.75, offset: 0.45 },
    { transform: motionAt(m), opacity: 0 },
  ], { duration: ms, easing: m.kind === "small" ? "cubic-bezier(.4, 0, .2, 1)" : "cubic-bezier(.4, 0, 1, 1)", fill: "forwards" });
  const landing = [{ opacity: 0, transform: m.kind === "small" ? "scale(.7)" : "translateY(6px)" }, { opacity: 0, offset: 0.4, transform: m.kind === "small" ? "scale(.7)" : "translateY(6px)" }, { opacity: 1, transform: "none" }];
  const toIn = play(copy || to, landing, { ms: ms + 120 * slowMo(), easing: "cubic-bezier(.2, .8, .3, 1)", fill: "backwards" });
  return ended(shrink, ms).then(() => {
    dlg.dataset.qmGone = "1";
    const settled = then();
    decorateWriting(); // nothing's open now: the + button (or the box) is there to click at once
    // the copy stays exactly over the box until the box is ready to show the words itself
    return Promise.resolve(settled).catch(() => {}).then(nextFrame).then(() => {
      if (toIn && !copy) afterAnim(toIn, () => {});
      giveBack();
      if (copy) copy.remove();
      shrink.cancel();
      setTimeout(() => { if (!to.qmStandIn) to.classList.remove("qm-morph-dest"); }, 400);
      setTimeout(() => { cleanup(); if (dlg.isConnected && dlg.dataset.qmGone && !dlg.dataset.qmClosing) delete dlg.dataset.qmGone; }, 400);
    });
  });
}
/* move a Gmail window so its box is exactly `spot` (by translating it) */
function placeWindow(dlg, spot) {
  const r = restBox(dlg);
  const dx = parseFloat(dlg.style.getPropertyValue("--qm-dx")) || 0, dy = parseFloat(dlg.style.getPropertyValue("--qm-dy")) || 0;
  dlg.style.setProperty("--qm-dx", dx + spot.left - r.left + "px");
  dlg.style.setProperty("--qm-dy", dy + spot.top - r.top + "px");
}
const near = (a, b) => Math.abs(a.left - b.left) < 1.5 && Math.abs(a.top - b.top) < 1.5 && Math.abs(a.width - b.width) < 1.5 && Math.abs(a.height - b.height) < 1.5;
/* where a closing window goes back to: the box (or Reply) it came from, or the + button */
function morphHome(info) {
  if (info.home === "reply" && info.thread && info.thread === screen.key) {
    // a forward goes back to Forward (the box is for the reply)
    if (info.fwd) { const f = $("#qm-view .qm-endacts .qm-minibtn.qm-fwdbtn:not(.qm-leaving *)"); return f && f.offsetParent ? f : null; }
    const b = composerBox();
    if (b && b.offsetParent) return b;
    const a = $("#qm-view .qm-endacts .qm-minibtn:not(.qm-leaving *)");
    if (a && a.offsetParent) return a;
  }
  // (the + button is out of sight while a window is open: it's where this one goes back to)
  if (info.home === "fab" && ROOT.classList.contains("qm-v-list") && prefs.fab !== false) { const f = document.getElementById("qm-fab"); if (f && f.offsetParent) return f; }
  return null;
}
/* a window Gmail has already taken away (sent): its copy, from the last moment, goes home */
function morphClose(info) {
  const home = morphHome(info);
  if (!info.face) return;
  if (info.sentAt && Date.now() - info.sentAt < 10000) { sendFlight(info); return; } // sent: it goes, it doesn't go home
  const look0 = info.look;
  const shell = shellAt(info.rect, look0);
  shell.appendChild(info.face.node);
  const gone = () => shell.remove();
  if (!home) {
    ended(shell.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(10px) scale(.97)" }], { duration: 180 * slowMo(), easing: "ease", fill: "forwards" }), 180 * slowMo()).then(gone);
    return;
  }
  const t = boxOf(home), look = lookOf(home);
  const hf = faceOf(home);
  shell.appendChild(hf);
  const giveBack = standIn(home);
  info.face.node.animate([{ opacity: 1 }, { opacity: 1, offset: 0.08 }, { opacity: 0, offset: 0.52 }, { opacity: 0 }], { duration: 380 * slowMo(), fill: "forwards" });
  hf.animate([{ opacity: 0 }, { opacity: 0, offset: 0.12 }, { opacity: 1, offset: 0.58 }, { opacity: 1 }], { duration: 380 * slowMo(), fill: "forwards" });
  ended(shell.animate(shapeFrames(info.rect, look0, t, look), { duration: 380 * slowMo(), easing: EASE_IN_OUT, fill: "forwards" }), 380 * slowMo()).then(() => {
    giveBack();
    gone();
  });
}
const gmailBtn = (win, sel) => $$(sel, win).find((b) => !b.closest(".qm-whead")); // Gmail's own, not Umbra's look-alikes
// a file still on its way into the message (Gmail's progress bar on its chip)
const uploading = (dlg) => $$(".dQ, [role=progressbar]", dlg).some((x) => x.getClientRects().length);
/* nothing in it at all: no words, subject, recipients or files (closing it leaves no draft behind) */
function emptyWindow(dlg) {
  const ed = $(".editable", dlg);
  if (ed && ownText(ed).trim()) return false;
  const subj = ((($("input[name='subjectbox']", dlg) || {}).value) || "").trim();
  const fwd = !!dlg.dataset.qmFwd || isForward(dlg);
  // (a reply's "Re:" or a forward's "Fwd:" subject is Gmail's, not something you wrote)
  if (subj && !(dlg.dataset.qmThread && /^(re|fwd?|fw)\s*:/i.test(subj))) return false;
  if ($$(".dL, .dQ", dlg).length > (fwd ? Number(dlg.dataset.qmFiles0 || 0) : 0)) return false; // files, or files on their way
  // a picture pasted in (not one in the quoted mail or the signature)
  if (ed && $$("img", ed).some((img) => !img.closest(".gmail_quote, .gmail_quote_container, .gmail_signature, [data-smartmail='gmail_signature'], .adL"))) return false;
  // who it's to counts where you chose it (a new message, a forward); a reply's recipients came with it
  if ((!dlg.dataset.qmThread || fwd) && (draftField(dlg, /^to recipients/i).length || draftField(dlg, /^cc recipients/i).length || draftField(dlg, /^bcc recipients/i).length)) return false;
  return true;
}
/* close a window with Umbra's ×: what you wrote is kept as a draft (and anything still uploading finishes first);
   an empty one simply goes, leaving no draft. The window goes back where it came from. */
function closeWindow(dlg) {
  const info = { home: dlg.dataset.qmHome || "", thread: dlg.dataset.qmThread || "", fwd: !!dlg.dataset.qmFwd };
  const ed = $(".editable", dlg);
  const said = ed ? ownText(ed) : "";
  const hadText = !!said;
  const empty = emptyWindow(dlg);
  openWindows.delete(dlg);
  dlg.dataset.qmClosing = "1";
  const home = morphHome(info);
  const backInBox = home && home.classList.contains("qm-cbox") && said.trim() ? said.trim().split("\n").slice(0, 3).join("\n") : undefined;
  // (the keyboard leaves with it: typing would otherwise go into a window you can't see)
  if (dlg.contains(document.activeElement)) document.activeElement.blur();
  conceal(dlg, home, () => {
    const busy = !empty && uploading(dlg);
    const gone = (async () => {
      if (empty) { const d = gmailBtn(dlg, '[aria-label^="Discard draft" i]'); hushToast(/discard/i, 3000); press(d || gmailBtn(dlg, "button.Ha, [aria-label^='Save & close' i]")); return; }
      // a file still uploading would be lost by closing now: it's let finish first (out of sight)
      if (busy) await until(() => !uploading(dlg), 120000, 250);
      press(gmailBtn(dlg, "button.Ha, [aria-label^='Save & close' i]"));
    })();
    gone.then(() => until(() => !dlg.isConnected || !visible(dlg), 6000, 60)).then(() => {
      // gone: if Gmail hands this same window back later (the next reply), it starts fresh, not out of sight
      delete dlg.dataset.qmClosing;
      delete dlg.dataset.qmGone;
      unframe(dlg);
      dlg.style.pointerEvents = "";
    });
    ROOT.classList.remove("qm-replying");
    if (busy) return;
    // a kept draft comes back into the box at once (its copy holds the box's place until it's there)
    if (home && home.classList.contains("qm-cbox") && hadText) return gone.then(() => until(builtDraft, 1500, 30)).then((ip) => { const c = composerOf(); if (ip && c) attachBar(c, ip); });
  }, backInBox);
}
/* minimize: the window goes into a chip beside the + button */
const minimizing = new Map(); // window -> its title, while it goes into its chip
async function minimizeWindow(dlg) {
  const btn = gmailBtn(dlg, "button.Hl, [aria-label='Minimize' i]");
  if (!btn || minimizing.has(dlg)) return;
  if (emptyWindow(dlg)) { closeWindow(dlg); return; } // nothing to keep: no chip for an empty message
  // a reply whose conversation is open folds back into the reply bar under it (its home), in one move
  if (!dlg.dataset.qmFwd && dlg.dataset.qmThread && dlg.dataset.qmThread === screen.key) { closeWindow(dlg); return; }
  if (!dlg.closest(".aSt")) dlg.dataset.qmLastRect = JSON.stringify(rectOf(restBox(dlg)));
  minimizing.set(dlg, text($(".qm-wtitle", dlg)) || "New message");
  openWindows.delete(dlg);
  decorateWriting(); // its chip is there before the window goes into it
  const chip = chipFor(dlg);
  await conceal(dlg, chip, () => press(btn));
  await until(() => bodyHidden(dlg) || $$(".AD > .Hd:not([role])").some((b) => b.getClientRects().length), 1500, 30);
  // minimized from this moment on (not "out of sight" while the animation tidies up): its chip never blinks away
  delete dlg.dataset.qmGone;
  dlg.dataset.qmMin = "1";
  unframe(dlg);
  dlg.style.pointerEvents = "";
  minimizing.delete(dlg);
  decorateWriting();
}
/* a chip opens back into its window */
async function restoreWindow(it, chip) {
  if (it.ip) { untuck(it.ip); return; }
  const win = it.win;
  if (!win) { it.restore(); return; }
  const ctx = beginOpen(chip, "chip");
  win.dataset.qmGone = "1";
  it.restore();
  const dlg = await until(() => (win.isConnected && visible(win) && !bodyHidden(win) && win.getBoundingClientRect().height >= 120 ? win : null), 3000, 16);
  if (!dlg) { endOpen(ctx); delete win.dataset.qmGone; return; }
  delete dlg.dataset.qmMin;
  let target = null;
  try { target = !dlg.closest(".aSt") && dlg.dataset.qmLastRect ? JSON.parse(dlg.dataset.qmLastRect) : null; } catch (e) { target = null; }
  await finishOpen(ctx, dlg, { place: target ? () => target : null, focus: (d) => { const b = $(".editable", d); if (b) b.focus(); } });
}
/* full size and back: the window grows (or settles) from where it was */
async function toggleFull(dlg, gmailButton) {
  const from = rectOf(restBox(dlg));
  const look = lookOf(dlg);
  const was = !!dlg.closest(".aSt");
  dlg.dataset.qmGone = "1";
  press(gmailButton);
  const now = await until(() => { const d = $$('.nH.Hd[role="dialog"]').find((x) => visible(x) && x.getBoundingClientRect().height >= 120 && !!x.closest(".aSt") !== was); return d || null; }, 1500, 16);
  const d = now || dlg;
  if (d !== dlg) for (const k of QM_WIN_FLAGS) { if (dlg.dataset[k] !== undefined) d.dataset[k] = dlg.dataset[k]; else delete d.dataset[k]; }
  if (d.closest(".aSt")) fitFull(d); else { fitWindow(d); clampWindow(d); }
  await reveal(d, { rect: from, look: Object.assign({}, look, { bg: "rgba(0, 0, 0, 0)" }) });
  delete dlg.dataset.qmGone;
  delete d.dataset.qmGone;
}
const openWindows = new Map();
function watchWindows() {
  const now = new Set();
  for (const dlg of $$('.nH.Hd[role="dialog"]')) {
    if (!visible(dlg) || dlg.dataset.qmClosing || dlg.dataset.qmGone) continue;
    const r = restBox(dlg);
    if (isMinimized(dlg) || r.height < 40) continue; // minimized
    now.add(dlg);
    const prev = openWindows.get(dlg) || {};
    openWindows.set(dlg, Object.assign(prev, { rect: rectOf(r), look: prev.look && near(prev.rect, r) ? prev.look : lookOf(dlg), home: dlg.dataset.qmHome || "", thread: dlg.dataset.qmThread || "", fwd: !!dlg.dataset.qmFwd, title: text($(".qm-wtitle", dlg)) }));
  }
  for (const [dlg, info] of openWindows) {
    if (now.has(dlg)) continue;
    openWindows.delete(dlg);
    if (dlg.isConnected && visible(dlg) && !dlg.dataset.qmClosing) continue; // minimized, or moving to or from full size
    morphClose(info); // sent, or closed by Gmail
  }
  // the message box steps aside while this conversation's reply window is open
  // (a window coming out of the box itself: the box stays, pressed, until the window grows out of it)
  ROOT.classList.toggle("qm-replying", [...now].some((d) => d.dataset.qmThread && d.dataset.qmThread === screen.key) || (!!morph && morph.kind === "pill"));
}
// the moment before a window goes (Send, ⌘Enter): an exact copy of it, for its way home
const keepFace = (e) => {
  const d = e.target && e.target.closest && e.target.closest('.nH.Hd[role="dialog"]');
  const info = d && openWindows.get(d);
  const sending = e.type === "keydown" ? e.key === "Enter" && (e.metaKey || e.ctrlKey) : !!e.target.closest('.T-I.aoO, [role="button"][data-tooltip^="Send" i]');
  if (info && sending) { info.face = snapshot(d) || info.face; info.sentAt = Date.now(); }
};
document.addEventListener("pointerdown", keepFace, true);
document.addEventListener("keydown", keepFace, true);
// nothing is ever left half way: a stray surface goes, a window left out of sight comes back
setInterval(() => {
  const now = Date.now();
  for (const s of $$(".qm-morph")) if (now - Number(s.dataset.at || 0) > 4000 * slowMo()) s.remove();
  if (morph && now - morph.at > 8000) endOpen(morph);
  if (!morph && !replyOpening) {
    ROOT.classList.remove("qm-popping");
    for (const d of $$('.nH.Hd[role="dialog"]')) {
      if (d.dataset.qmGone && !d.dataset.qmClosing && !minimizing.has(d) && !d.qmGoneAt) d.qmGoneAt = now;
      if (d.dataset.qmGone && d.qmGoneAt && now - d.qmGoneAt > 3000 && !d.dataset.qmClosing) { delete d.dataset.qmGone; d.qmGoneAt = 0; unframe(d); d.style.pointerEvents = ""; }
      if (!d.dataset.qmGone) d.qmGoneAt = 0;
    }
    if (!$$(".qm-morph").length) for (const x of $$(".qm-morph-src, .qm-pressing, .qm-waiting")) x.classList.remove("qm-morph-src", "qm-pressing", "qm-waiting");
  }
}, 1000);

/* ---- the dock: the + button, and beside it a chip for each minimized draft ---- */
const chipOf = new Map(); // window (or Gmail's bar for it) -> its chip
function chipFor(win) {
  for (const [k, c] of chipOf) if (k === win || (c.qmItem && c.qmItem.win === win)) return c;
  return null;
}
function renderDock(items) {
  let dock = document.getElementById("qm-dock");
  if (!dock) { dock = h("div", { id: "qm-dock" }); document.body.appendChild(dock); }
  const fab = document.getElementById("qm-fab");
  if (fab && fab.parentElement !== dock) dock.prepend(fab);
  const keep = new Set();
  for (const it of items) {
    let chip = chipOf.get(it.key);
    if (!chip || !chip.isConnected) {
      const x = h("button", { type: "button", class: "qm-chipx", "aria-label": "Close (the draft is kept)", title: "Close (the draft is kept)" }, icon("x"));
      chip = h("div", { class: "qm-chip qm-chip-in", role: "button", tabindex: "0" }, icon(it.reply ? "reply" : "write"), h("span", { class: "qm-chipt" }), x);
      chip.addEventListener("animationend", () => chip.classList.remove("qm-chip-in"), { once: true });
      chip.addEventListener("click", (e) => {
        if (e.target.closest(".qm-chipx")) { e.stopPropagation(); if (chip.qmItem.going) return; chip.classList.add("qm-chip-out"); chip.qmOutAt = Date.now(); chip.qmItem.close(); return; }
        restoreWindow(chip.qmItem, chip);
      });
      // (Enter on its × is the ×)
      chip.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !e.target.closest(".qm-chipx")) { e.preventDefault(); restoreWindow(chip.qmItem, chip); } });
      dock.appendChild(chip);
      chipOf.set(it.key, chip);
    }
    chip.qmItem = it;
    if (chip.classList.contains("qm-chip-out") && Date.now() - (chip.qmOutAt || 0) > 2500) chip.classList.remove("qm-chip-out"); // (still here: it didn't close)
    const t = $(".qm-chipt", chip);
    if (t.textContent !== it.title) { t.textContent = it.title; chip.title = it.title; chip.setAttribute("aria-label", "Open " + it.title); }
    keep.add(chip);
  }
  for (const [k, chip] of chipOf) if (!keep.has(chip)) { chipOf.delete(k); chip.remove(); }
}
/* Gmail sizes the message body for its own, shorter header and frame: trim the body so Send stays in
   view when the recipients wrap, and so a long message never grows the window past the screen */
function fitWindow(dlg) {
  const gp = $(".GP", dlg), tab = $("table.aoP", dlg), box = $(".aoI", dlg);
  if (!gp || !tab || !box || dlg.closest(".aSs, .aSt")) return;
  const r = dlg.getBoundingClientRect();
  if (r.height < 120) return;
  const inner = box.style.height ? tab.getBoundingClientRect().height - box.clientHeight : 0;
  const over = Math.max(inner, r.height - (window.innerHeight - 16));
  const g = gp.getBoundingClientRect().height;
  const fitted = dlg.hasAttribute("data-qm-fit");
  if (over > 0.5) {
    dlg.style.setProperty("--qm-bodymax", Math.max(56, Math.floor(g - over)) + "px"); // (a short screen: a couple of lines, scrolling, and Send in view)
    dlg.setAttribute("data-qm-fit", "");
  } else if (fitted && over < -1) {
    const next = Math.floor(g - over);
    if (next >= (parseFloat(gp.style.maxHeight) || Infinity)) { dlg.removeAttribute("data-qm-fit"); dlg.style.removeProperty("--qm-bodymax"); }
    else dlg.style.setProperty("--qm-bodymax", next + "px");
  }
}
/* full size: the message area is sized so the window fills the focused sheet exactly (Send in view) */
function fitFull(dlg) {
  const sheet = dlg.closest(".aSt"), gp = $(".GP", dlg);
  if (!sheet || !gp) return;
  const over = dlg.scrollHeight - sheet.getBoundingClientRect().height;
  if (Math.abs(over) < 1) return;
  const g = gp.getBoundingClientRect().height;
  dlg.style.setProperty("--qm-fullbody", Math.max(120, Math.floor(g - over)) + "px");
}
window.addEventListener("resize", () => { for (const dlg of $$('.nH.Hd[role="dialog"]')) if (visible(dlg)) { if (dlg.closest(".aSt")) fitFull(dlg); else { fitWindow(dlg); clampWindow(dlg); } } });
/* keep every window fully on screen (Gmail grows them upward as you type) */
function clampWindow(dlg, landing) {
  if (dlg.closest(".aSs, .aSt") || (!landing && dlg.dataset.qmGone)) return;
  const r = restBox(dlg);
  if (r.height < 120) return;
  const W = window.innerWidth, H = window.innerHeight, m = 8;
  let dx = 0, dy = 0;
  if (r.top < m) dy = m - r.top; else if (r.bottom > H - m) dy = Math.max(m - r.top, H - m - r.bottom);
  if (r.left < m) dx = m - r.left; else if (r.right > W - m) dx = Math.max(m - r.left, W - m - r.right);
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  placeWindow(dlg, { left: r.left + dx, top: r.top + dy });
}

/* ---- the message box ----
   Idle, it's a plain box you can type into at once. As soon as you do, Gmail's own reply editor takes
   its place, in the same spot and look: Gmail's spelling and grammar, Smart Compose, formatting,
   attachments, drafts that save themselves, ⌘Enter to send. Enter is always a new line. */
const composerBox = () => $("#qm-view .qm-cbox:not(.qm-leaving *)");
const composerOf = () => { const b = composerBox(); const slot = b && b.closest(".qm-cslot"); return slot ? slot.qm : null; };
function autosize(c) {
  const ta = c.ta;
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, Math.max(120, window.innerHeight * 0.4)) + "px";
}
function updateSend(c) {
  const ed = c.ip && $(".editable", c.ip);
  const can = c.ip ? hasContent(c.ip) : !!c.ta.value.trim();
  // the placeholder only shows over a truly empty editor (not one holding a draft's blank lines)
  const bare = !c.ip || (ed && !ed.textContent.replace(/Press \/ for Help me write/i, "").trim() && $$("div, p", ed).length <= 1 && $$("br", ed).length <= 1);
  c.root.classList.toggle("qm-edempty", !!bare);
  c.send.disabled = !can;
  if (c.root.classList.contains("qm-hastext") !== can) { c.root.classList.toggle("qm-hastext", can); placeBar(c); }
}
/* put text at the end of Gmail's editor (before quoted text and signature), as typing would */
function focusEnd(ed) {
  if (!ed || !ed.isConnected) return; // (Gmail redrew it just now)
  ed.focus();
  const quote = Array.from(ed.children).find((e) => e.matches(".gmail_quote, .gmail_quote_container, .adL, .gmail_signature, .gmail_signature_prefix") || $(".gmail_quote, .gmail_quote_container, .gmail_signature, .gmail_signature_prefix", e));
  const range = document.createRange();
  if (quote) range.setStartBefore(quote); else range.selectNodeContents(ed);
  range.collapse(!!quote);
  if (quote) {
    // inside the last block before the quote, at its end
    const before = quote.previousElementSibling;
    if (before) { range.selectNodeContents(before); range.collapse(false); }
  }
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
function typeInto(ed, value) {
  if (!ed) return;
  focusEnd(ed);
  value.replace(/\r/g, "").split("\n").forEach((line, i) => {
    if (i) document.execCommand("insertParagraph");
    if (line) document.execCommand("insertText", false, line);
  });
}
/* the box's own spot on screen, where Gmail's editor sits while it's live */
function placeBar(c) {
  if (!c.ip || !c.box.isConnected) return;
  const b = c.box.getBoundingClientRect();
  if (!b.width) return;
  const s = c.ip.style;
  // Gmail's words start exactly where the box's own did (its editor has 4px less padding than the box's field)
  const t = c.ta.getBoundingClientRect();
  const left = t.width ? t.left + 4 : b.left + 48;
  s.setProperty("--bar-l", left + "px");
  const right = c.root.classList.contains("qm-hastext") ? 140 : 98;
  s.setProperty("--bar-w", Math.max(120, b.right - left - right) + "px");
  s.setProperty("--bar-b", window.innerHeight - b.bottom + 7 + "px");
  // the placeholder starts a little after where Gmail's caret blinks (never under it)
  const ed = $(".editable", c.ip), fld = $(".qm-cfield", c.root);
  if (ed && fld) { const x = ed.getBoundingClientRect().left + (parseFloat(getComputedStyle(ed).paddingLeft) || 0) - fld.getBoundingClientRect().left; if (x > 0 && x < 80) fld.style.setProperty("--qm-ph-left", Math.round(x + 4) + "px"); }
  const need = Math.ceil(c.ip.getBoundingClientRect().height) + 14;
  const want = Math.max(56, need) + "px";
  if (c.box.style.minHeight !== want) c.box.style.minHeight = want;
}
function attachBar(c, ip) {
  if (c.ip === ip) { placeBar(c); return; }
  if (!ip || !$(".editable", ip)) return; // Gmail hasn't built its editor yet: it's attached once it has
  if (replyOpening || c.root.classList.contains("qm-handing")) return; // (on its way into a window, words and all)
  // mid-word in the box: hand over once typing pauses, so not a letter is lost
  if (document.activeElement === c.ta && (Date.now() - (c.lastKey || 0) < 400 || c.composing)) {
    clearTimeout(c.handTimer);
    c.handTimer = setTimeout(() => {
      c.handTimer = 0;
      if (ip.isConnected && parkedDraft() === ip) attachBar(c, ip);
      else if (!c.goingLive) c.guard = false; // (Gmail dropped that reply: nothing to guard any more)
    }, 420);
    return;
  }
  clearTimeout(c.handTimer);
  c.handTimer = 0;
  detachBar(c);
  c.guard = false;
  c.ip = ip;
  ip.classList.add("qm-bar");
  c.root.classList.add("qm-live");
  placeBar(c);
  const ed = $(".editable", ip);
  // whatever was typed into the box while Gmail's editor was on its way moves over
  const typed = c.ta.value;
  const hadFocus = document.activeElement === c.ta;
  const inIt = ip.contains(document.activeElement); // (you're writing in it already: the caret stays where it is)
  if (typed.trim()) { c.ta.value = ""; autosize(c); typeInto(ed, typed); }
  else if (inIt) { /* as it is */ }
  else if (c.wantFocus || hadFocus) focusEnd(ed);
  else {
    // opened ahead of time: keep the keyboard for shortcuts until you click in
    c.quietUntil = Date.now() + 2500;
    const calm = () => { if (c.ip === ip && c.quietUntil > Date.now() && ip.contains(document.activeElement)) document.activeElement.blur(); };
    calm();
    for (const ms of [80, 250, 600, 1200, 2000]) setTimeout(calm, ms);
  }
  c.wantFocus = false;
  c.ro = new ResizeObserver(() => { placeBar(c); updateSend(c); });
  c.ro.observe(ip);
  // (focus moving just now can make Gmail redraw its editor: the one that's there now)
  const live = $(".editable", ip) || (ed && ed.isConnected ? ed : null);
  if (live) {
    live.setAttribute("spellcheck", "true"); // Gmail turns the browser's spellcheck off; misspellings get underlined
    live.addEventListener("input", c.onInput = () => updateSend(c));
    live.addEventListener("focus", c.onFocus = () => { if (!c.wantIdeas) { c.wantIdeas = true; invalidate(); } });
  }
  updateSend(c);
}
function detachBar(c) {
  clearTimeout(c.handTimer);
  c.handTimer = 0;
  c.guard = false;
  if (!c.ip) return;
  if (c.ro) c.ro.disconnect();
  const ed = $(".editable", c.ip);
  if (ed && c.onInput) ed.removeEventListener("input", c.onInput);
  if (ed && c.onFocus) ed.removeEventListener("focus", c.onFocus);
  c.ip.classList.remove("qm-bar");
  c.ip = null;
  c.root.classList.remove("qm-live");
  c.box.style.minHeight = "";
  updateSend(c);
}
/* open Gmail's reply in the box (or take the draft that's already there) */
/* Gmail's reply, built: it only goes into the box once its editor is there */
const builtDraft = () => { const ip = parkedDraft(); return ip && $(".editable", ip) ? ip : null; };
function goLive(c, focus, how) {
  // (you asked for the keyboard: a draft put back quietly a moment ago doesn't keep it from you)
  if (focus) { c.wantFocus = true; c.quietUntil = 0; }
  if (focus && document.activeElement === c.ta) c.guard = true; // keystrokes stay in the box until Gmail's editor is ready
  const ip = builtDraft();
  // (attached only once typing pauses: until then the keyboard stays in the box)
  if (ip) { attachBar(c, ip); if (focus && c.ip === ip) focusEnd($(".editable", ip)); return Promise.resolve(ip); }
  if (c.goingLive) return c.goingLive;
  c.goingLive = (async () => {
    await settlePeek();
    if (lookBusy()) await afterLook(); // (Gmail's reply is this conversation's again first)
    let found = builtDraft();
    if (!found) {
      let narrow = false;
      if (!parkedDraft()) {
        // Reply unless Reply all is asked for (Gmail's own default): if switching later fails (Gmail in a
        // language Umbra can't read the menu of), the reply reaches fewer people, never more
        const all = replyButton("all"), one = replyButton("reply");
        const b = (how === "all" && all) || one || all || lastReplyButton();
        if (!b) return null;
        narrow = b !== all || all === one;
        press(b);
      }
      found = await until(builtDraft, 8000, 30);
      if (found && narrow) found.dataset.qmHow = "reply"; else if (found) delete found.dataset.qmHow;
    }
    if (found && c.root.isConnected) attachBar(c, found);
    return found;
  })().finally(() => { c.goingLive = null; if (!c.handTimer) c.guard = false; });
  return c.goingLive;
}
// while Gmail's editor is on its way it grabs focus; keep typing in the box until the hand-over
document.addEventListener("focusin", (e) => {
  const c = enabled ? composerOf() : null;
  if (!c) return;
  const t = e.target;
  // Gmail focusing the editor it just opened in the background (not you): give the keyboard back
  if (c.ip && c.quietUntil > Date.now() && c.ip.contains(t)) { t.blur(); return; }
  if (!c.guard || (!c.goingLive && !c.handTimer)) return;
  if (t === c.ta || c.root.contains(t)) return;
  if (!(t.closest && t.closest(".ip.adB"))) return; // (somewhere you went yourself: the search box, a new message)
  c.ta.focus({ preventScroll: true });
  const n = c.ta.value.length;
  c.ta.setSelectionRange(n, n);
}, true);
const engage = (c) => { c.userAt = Date.now(); c.quietUntil = 0; };
for (const type of ["mousedown", "keydown"]) window.addEventListener(type, (e) => {
  const c = composerOf();
  if (c && (c.root.contains(e.target) || (c.ip && c.ip.contains(e.target)))) engage(c);
}, true);
function buildComposer() {
  const ta = h("textarea", { rows: "1", placeholder: "Reply", "aria-label": "Reply", spellcheck: "true" });
  const send = h("button", { type: "button", class: "qm-send", "aria-label": "Send (⌘Enter)", title: "Send (⌘Enter)", disabled: true }, icon("send"));
  const attach = ib("clip", "Attach files", () => attachFromPicker(c), "qm-s");
  const expand = ib("grow", "Open in a window", () => expandComposer(c), "qm-s");
  const trash = ib("trash", "Discard draft", () => discardComposer(c), "qm-s qm-ctrash");
  const box = h("div", { class: "qm-cbox" }, h("div", { class: "qm-crow" }, attach, h("div", { class: "qm-cfield" }, ta), trash, expand, send));
  const ideas = h("div", { class: "qm-ideas" });
  // ⌘J: a line to say what reply you want (no button for it: ⌘J again, or esc, puts it away)
  const aiInput = h("input", { type: "text", placeholder: "Describe the reply you want…", "aria-label": "Describe the reply you want", autocomplete: "off", spellcheck: "true" });
  const aiRow = h("div", { class: "qm-cai", hidden: true }, aiInput, h("span", { class: "qm-dots", "aria-hidden": "true" }, h("i"), h("i"), h("i")), h("kbd", { text: "↵" }));
  // "Collapse" is there as soon as the bar opens (until you type): it folds the bar away again
  const fold = h("button", { type: "button", class: "qm-fold", tabindex: "-1", onclick: () => { if (c.t) { barFolded.add(c.t.id); barOpened.delete(c.t.id); } if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur(); invalidate(true); } }, h("span", { text: "Collapse" }), icon("down"));
  const top = h("div", { class: "qm-ctop" }, ideas, aiRow, fold);
  const root = h("div", { class: "qm-composer" }, top, box);
  const c = { root, box, ta, ideas, send, aiRow, aiInput, tid: "", t: null, ip: null };
  send.addEventListener("click", () => sendComposer(c));
  ta.addEventListener("input", () => { autosize(c); updateSend(c); if (ta.value) goLive(c, true); });
  ta.addEventListener("mousedown", () => { if (!c.ip) setTimeout(() => goLive(c, true), 0); });
  ta.addEventListener("keydown", (e) => {
    c.lastKey = Date.now();
    e.stopPropagation(); // Gmail's shortcuts and Umbra's stay out of the way while typing
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendComposer(c); }
    else if (e.key === "Escape") { e.preventDefault(); ta.blur(); }
    else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key || "").toLowerCase() === "j") { e.preventDefault(); toggleComposerAI(c); }
  });
  ta.addEventListener("paste", (e) => {
    const files = Array.from((e.clipboardData && e.clipboardData.files) || []);
    if (!files.length) return;
    e.preventDefault();
    attachToReply(files).then((ok) => { if (!ok) toast("Couldn't attach that."); });
  });
  ta.addEventListener("compositionstart", () => { c.composing = true; });
  ta.addEventListener("compositionend", () => { c.composing = false; c.lastKey = Date.now(); });
  ta.addEventListener("focus", () => { root.classList.add("qm-focus"); c.wantIdeas = true; invalidate(); });
  ta.addEventListener("blur", () => root.classList.remove("qm-focus"));
  // clicking anywhere in the box (not a button) goes to the editor
  // once you click or type in the box, it's yours: Gmail's editor is never quietly unfocused again
  box.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    if (c.ip) { e.preventDefault(); focusEnd($(".editable", c.ip)); }
  });
  aiInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.isComposing || e.keyCode === 229) return; // (choosing a character in Chinese or Japanese input)
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); toggleComposerAI(c, false); sendComposer(c); }
    else if (e.key === "Enter") { e.preventDefault(); aiCompose(c, aiInput.value.trim()); }
    else if (e.key === "Escape" || ((e.metaKey || e.ctrlKey) && (e.key || "").toLowerCase() === "j")) { e.preventDefault(); toggleComposerAI(c, false); }
  });
  root.qm = c;
  return c;
}
const othersOf = (t) => {
  const out = [];
  const add = (email, name) => { const n = personName(email, name).split(/\s+/)[0]; if (n && !out.includes(n)) out.push(n); };
  for (const m of t.messages) if (!m.mine && (m.name || m.email)) add(m.email, m.name);
  // only you wrote: the people you wrote to
  if (!out.length) { const last = t.messages[t.messages.length - 1]; for (const x of (last && last.to) || []) add(x.email, x.name); }
  return out;
};
/* who the reply in the box really goes to: the people on Gmail's reply once it's open (Reply narrows it to the last
   sender, Reply all keeps everyone), else everyone who wrote */
function replyNames(c, t) {
  if (c && c.ip && c.ip.isConnected) {
    const me = accountEmail(), seen = new Set(), out = [];
    for (const e of $$("[email]", c.ip)) {
      if (e.closest(".editable, .gmail_quote")) continue;
      const em = (e.getAttribute("email") || "").toLowerCase();
      if (!em || em === me || seen.has(em)) continue;
      seen.add(em);
      const n = personName(em, e.getAttribute("name") || "").split(/\s+/)[0] || em;
      if (!out.includes(n)) out.push(n);
    }
    if (out.length) return out;
  }
  return othersOf(t);
}
// how many people besides you the newest email is between (Reply all is there from two)
function othersOn(t) {
  const last = t && t.messages[t.messages.length - 1];
  if (!last) return 0;
  const me = accountEmail();
  return new Set([...(last.to || []).map((x) => x.email), last.mine ? "" : last.email].filter((e) => e && e !== me)).size;
}
const listNames = (n) => (n.length === 1 ? n[0] : n.slice(0, -1).join(", ") + " and " + n[n.length - 1]);
function updateComposer(slot, t) {
  let c = slot.qm;
  if (!c) { c = buildComposer(); slot.qm = c; slot.prepend(c.root); }
  c.t = t;
  if (c.tid !== t.id) { c.tid = t.id; c.wantIdeas = false; c.ideaFor = ""; toggleComposerAI(c, false); c.ta.value = ""; detachBar(c); }
  // Gmail's reply for this conversation (a saved draft, or one just opened) lives in the box, and the box says who
  // it goes to
  if (!geminiBusy) {
    // keep the reply already in the box while it lasts (a forward opening alongside it isn't it)
    const ip = c.ip && c.ip.isConnected && $(".M9 .editable", c.ip) && !c.ip.dataset.qmFloat ? c.ip : builtDraft();
    if (ip) attachBar(c, ip); else if (c.ip) detachBar(c);
  }
  const others = replyNames(c, t);
  const ph = others.length ? "Reply to " + listNames(others.length > 4 ? [...others.slice(0, 3), others.length - 3 + " more"] : others) : "Reply";
  if (c.ta.placeholder !== ph || c.ta.parentElement.getAttribute("data-ph") !== ph) { c.ta.placeholder = ph; c.ta.setAttribute("aria-label", ph); c.ta.parentElement.setAttribute("data-ph", ph); }
  autosize(c);
  updateSend(c);
  renderIdeas(c, t);
  preopen(c, t);
}
/* Gmail's editor opens in the background as a conversation opens, so clicking the box goes straight in
   (suggestions are made first: they borrow the same editor for a moment) */
function preopen(c, t) {
  const busy = () => c.ip || c.goingLive || geminiBusy || threadWindow() || closingWindow() || replyOpening || !c.root.offsetParent;
  if (busy()) return;
  clearTimeout(c.preTimer);
  c.preTimer = setTimeout(() => { if (c.t === t && !busy() && document.visibilityState === "visible") goLive(c, false); }, 250);
}
function sendComposer(c) {
  const t = c.t;
  if (!t) return;
  if (!c.ip) {
    if (!c.ta.value.trim()) return;
    // Gmail's editor first; if Gmail won't open one here, the reply goes to a window rather than nowhere
    goLive(c, false).then((ip) => {
      if (ip) setTimeout(() => sendComposer(c), 60);
      else expandComposer(c).then((w) => { if (w) toast("Your reply is in a window now: ⌘Enter sends it."); });
    });
    return;
  }
  const ed = $(".editable", c.ip);
  const body = ed ? ownText(ed) : "";
  if (!hasContent(c.ip)) return;
  const send = $(".T-I.aoO", c.ip) || $('[role="button"][data-tooltip^="Send" i]', c.ip);
  if (!send) { expandComposer(c).then((w) => { if (w) toast("Your reply is in a window now: ⌘Enter sends it."); }); return; }
  // (late at night, heated words, a missing file: asked first, only when one applies)
  considerSend(c.ip, true, () => { notePending(t, body, $$(".dL", c.ip).map((d) => text($(".vI", d)) || "file"), sentFromBar(c)); press(send); unlessSent(t, c.ip); });
}
const pendingSends = new Map(); // thread -> [{ text, files, n, at }]: your message shows at once
function notePending(t, body, files, from) {
  pendingSends.set(t.id, [...(pendingSends.get(t.id) || []), { text: body, files: files || [], n: t.messages.length, at: Date.now(), from: from || null }]);
  invalidate(true);
}
// the reply box as you send from it: where the message rises from, and its arrow taking off
function sentFromBar(c) {
  launchArrow(c.send);
  whoosh();
  const r = c.box.getBoundingClientRect();
  return r.width ? r : null;
}
// ⌘Enter in the box's editor is Gmail's own send: note the message so it shows at once
window.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || !e.isTrusted) return;
  const bar = e.target.closest && e.target.closest(".ip.qm-bar");
  const c = bar && composerOf();
  if (!c || !c.t) return;
  if (sendConcerns(bar, true).out.length) return; // (asked about first: noted when it really goes)
  noteBarSend(bar);
}, true);
function noteBarSend(bar) {
  const c = composerOf();
  if (!c || !c.t || !bar.classList.contains("qm-bar")) return;
  const ed = $(".editable", bar);
  const body = ed ? ownText(ed) : "";
  if (body || $$(".dL", bar).length) { notePending(c.t, body, $$(".dL", bar).map((d) => text($(".vI", d)) || "file"), sentFromBar(c)); unlessSent(c.t, bar); }
}
// (Gmail takes a reply it sends away, or empties it; still there with your words after a moment, it didn't go)
function unlessSent(t, ip) {
  const at = Date.now();
  setTimeout(() => {
    if (!ip.isConnected || !visible(ip) || !hasContent(ip)) return;
    const list = (pendingSends.get(t.id) || []).filter((p) => p.at < at - 50 || p.at > at + 50);
    if (list.length) pendingSends.set(t.id, list); else pendingSends.delete(t.id);
    lastThreadSig = "";
    invalidate(true);
  }, 2600);
}
function pendingFor(t) {
  const list = (pendingSends.get(t.id) || []).filter((p) => t.messages.length <= p.n && Date.now() - p.at < 30000);
  if (list.length) pendingSends.set(t.id, list); else pendingSends.delete(t.id);
  return list;
}
function attachFromPicker(c) {
  const w = threadWindow();
  const own = (w || c.ip) && $('input[type="file"][name="Filedata"]', w || c.ip);
  if (own) { own.click(); return; }
  // (Gmail's reply isn't open yet: Umbra's own picker, now, while it's still your click; the files go in once it is)
  const input = h("input", { type: "file", multiple: true, hidden: true });
  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    input.remove();
    if (files.length) attachToReply(files).then((ok) => { if (!ok) toast("Couldn't attach those."); });
  }, { once: true });
  window.addEventListener("focus", () => setTimeout(() => { if (input.isConnected && !(input.files && input.files.length)) input.remove(); }, 1500), { once: true });
  document.body.appendChild(input);
  input.click();
}
async function attachToReply(files) {
  const w = threadWindow(); // (the reply is open in a window: there, not into a second reply)
  if (w) return attachFiles(w, files);
  const c = composerOf();
  if (!c) return false;
  const ip = c.ip || (await goLive(c, true));
  return !!ip && attachFiles(ip, files);
}
/* attachments while writing: each chip gets a small picture of its image (the file itself while it's on this
   computer, or Gmail's thumbnail), or the file's mark */
const localFiles = new Map(); // file name -> object URL, for images added here (dropped, pasted or picked)
function rememberLocal(files) {
  for (const f of files) if (f && /^image\//.test(f.type) && f.size < 25 * 1048576) { localFiles.delete(f.name); localFiles.set(f.name, URL.createObjectURL(f)); }
  // (the last few dozen: older ones are let go, their memory with them)
  while (localFiles.size > 30) { const [k, u] = localFiles.entries().next().value; localFiles.delete(k); URL.revokeObjectURL(u); }
}
document.addEventListener("change", (e) => { const t = e.target; if (t && t.type === "file" && t.files && t.closest && t.closest('.nH.Hd[role="dialog"], .ip')) rememberLocal([...t.files]); }, true);
function decorateAttachments(root) {
  for (const chip of $$(".dL", root)) {
    const name = text($(".vI", chip));
    if (!name || chip.dataset.qmAtt === name) continue;
    chip.dataset.qmAtt = name;
    const old = $(":scope > .qm-attpv", chip);
    if (old) old.remove();
    const kind = fileKind(name);
    const pv = h("span", { class: "qm-attpv", "aria-hidden": "true" });
    let src = localFiles.get(name) || "";
    if (!src && kind === "image") { const a = $("a.dO", chip); try { const u = new URL(a.getAttribute("href"), location.href); if (u.searchParams.has("attid")) { u.searchParams.set("disp", "thd"); src = u.toString(); } } catch (e) { src = ""; } }
    if (kind === "image" && src) {
      const img = h("img", { src, alt: "", draggable: "false" });
      img.addEventListener("error", () => { pv.classList.remove("qm-attimg"); img.replaceWith(icon("image")); });
      pv.classList.add("qm-attimg");
      pv.appendChild(img);
    } else pv.appendChild(icon(kind === "image" ? "image" : "file"));
    chip.prepend(pv);
  }
}
function attachFiles(win, files) {
  const input = $('input[type="file"][name="Filedata"]', win);
  if (!input || !files.length) return false;
  rememberLocal(files);
  const before = $$(".dL, .dQ", win).length;
  try {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (e) { return false; }
  // (Gmail shows a chip for each file it takes, or its own note for one too big, which goes as a Drive link)
  until(() => !win.isConnected || $$(".dL, .dQ", win).length > before || popups().length, 6000, 100).then((ok) => { if (!ok && win.isConnected) toast(files.length === 1 ? "Gmail didn't take that file. The paperclip in the message can." : "Gmail didn't take those files. The paperclip in the message can."); });
  return true;
}
function discardComposer(c) {
  if (c.ip) { const d = $('[aria-label^="Discard draft" i]', c.ip); if (d) press(d); }
  c.ta.value = "";
  autosize(c);
  updateSend(c);
}
async function expandComposer(c) {
  if (replyOpening) return replyOpening; // (it's on its way already)
  // its window is still going back into the box: it lands first (your words come back into the box with it)
  if (closingWindow()) { await until(() => !closingWindow(), 4000, 30); await until(builtDraft, 2000, 30); }
  const typed = c.ta.value;
  // words typed into the plain box become Gmail's reply first (never while this conversation has a window)
  if (!c.ip && typed.trim() && !threadWindow()) await goLive(c, false);
  c.ta.value = "";
  let dlg = await replyBarAction("keep", c.box);
  // Gmail was busy (redrawing the conversation): once more, a moment later
  if (!dlg && c.root.isConnected && !threadWindow()) { await wait(350); dlg = await replyBarAction("keep", c.box); }
  if (!dlg && !threadWindow()) {
    if (typed.trim() && !c.ip && !c.ta.value) { c.ta.value = typed; autosize(c); updateSend(c); } // (your words never go missing)
    toast("Couldn't open a window just now. Your reply is still here.");
    return null;
  }
  if (dlg && typed.trim() && !c.ip) { const box = $(".editable", dlg); if (box && !ownText(box)) putText(box, typed, true); }
  return dlg || threadWindow();
}

/* ---- AI for replies: Gmail's own Gemini first (free with your Google account), then Umbra's helper ---- */
const hasGemini = () => store.get("gemini:" + accountEmail(), null) !== false && (store.get("gemini:" + accountEmail(), false) || hasTodos());
const useGemini = () => aiOn() && prefs.gemini && hasGemini();
function countAI() {
  const day = new Date().toDateString();
  const u = store.get("ai-usage", { day, n: 0 });
  store.set("ai-usage", u.day === day ? { day, n: u.n + 1 } : { day, n: 1 });
}
function geminiText(ed) {
  const c = ed.cloneNode(true);
  for (const x of c.querySelectorAll("button, [role=button], .gmail_quote, .gmail_quote_container, .adL, .gmail_signature, .gmail_signature_prefix, [aria-hidden=true], .jKzJCd, [contenteditable=false]")) x.remove();
  return editableText(c);
}
/* Gmail's "Help me write" button toggles its prompt: press until the prompt is there */
async function openPrompt(win, hmw) {
  let el = $('[aria-label="Describe your message" i]', win);
  for (let i = 0; i < 3 && !el; i++) {
    press(hmw);
    el = await until(() => $('[aria-label="Describe your message" i]', win), 1200, 40);
  }
  return el;
}
function askGemini(askEl, prompt) {
  askEl.focus();
  document.execCommand("selectAll");
  document.execCommand("insertText", false, prompt);
  for (const t of ["keydown", "keypress", "keyup"]) askEl.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
}
/* wait until what Gemini writes into `ed` has settled */
function geminiResult(ed, before, abortIf) {
  let last = before, since = 0;
  return until(() => {
    if (abortIf && abortIf()) return "\u0000";
    const t = geminiText(ed);
    if (!t || t === before) return null;
    if (t !== last) { last = t; since = Date.now(); return null; }
    return Date.now() - since > 450 ? t : null;
  }, 25000, 100).then((t) => (t === "\u0000" ? null : t));
}
/* nothing borrows Gmail's editor in the background any more (suggestions come from Gemini's sheet or
   Umbra's AI); these stay for the code that waits on them */
let geminiBusy = false;
async function stopGemini() {}
const ideaKey = (t) => "i4:" + accountEmail() + ":" + t.id + ":" + ((t.messages[t.messages.length - 1] || {}).id || "");
function ideasWanted(t) {
  if (prefs.ideas === "off") return false;
  const last = t.messages[t.messages.length - 1];
  if (!last || last.mine || !(isPersonAddress(last.email, last.name) || t.messages.some((m) => m.mine))) return false;
  if (t.messages.length === 1 && last.body && cloneBody(last).rich) return false; // designed newsletters
  return true;
}
function requestIdeas(t) {
  const k = ideaKey(t);
  if (!aiOn() || aiCache.has(k) || pendingAI.has(k) || Date.now() - (failedAI.get(k) || 0) < 5 * 60 * 1000) return;
  if (ai.ready) ask(k, { kind: "replies", me: myName(), about: aboutText(), subject: t.subject, text: threadText(t) }, invalidate);
}
/* Gemini's sheet already has a reply for the newest email, when someone's waiting on one */
function sheetIdea(t) {
  const g = gemFor({ id: t.id });
  const last = t.messages[t.messages.length - 1];
  if (!g || !g.replyText || (g.mid && last && g.mid !== String(last.id).toLowerCase())) return null;
  return { text: g.replyText, label: g.replyLabel || shortIdea(g.replyText) };
}
/* A suggestion: Gemini's sheet already wrote one for new mail (free, there at once); otherwise Umbra's AI
   makes one as you click into the box (or as the conversation opens, "when a reply is due"). If neither
   can (AI off, or the network blocks it), there's simply none. */
const stoppedAI = new Set();
function renderIdeas(c, t) {
  let list = [], waiting = false;
  if (aiOn() && ideasWanted(t)) {
    const k = ideaKey(t);
    if (stoppedAI.delete(k)) c.ideaFor = "";
    const edText = c.ip ? ownText($(".editable", c.ip)) : "";
    const empty = !c.ta.value.trim() && !edText;
    const fromSheet = sheetIdea(t);
    const when = c.wantIdeas || prefs.ideas === "always" || prefs.ideas === "focus";
    if (!fromSheet && ai.ready && !aiCache.has(k) && empty && when && !threadWindow() && c.ideaFor !== k + c.wantIdeas) {
      c.ideaFor = k + c.wantIdeas;
      requestIdeas(t);
    }
    const res = fromSheet ? { replies: [fromSheet] } : aiCache.get(k);
    // one suggestion: a few words on the button, the whole reply when you use it
    list = (res && Array.isArray(res.replies) ? res.replies : []).map((x) => (typeof x === "string" ? { label: "", text: x } : x))
      .filter((x) => x && typeof x.text === "string" && x.text.trim()).slice(0, 1)
      .map((x) => ({ text: x.text.trim(), label: (x.label || "").trim() || shortIdea(x.text) }));
    waiting = !res && pendingAI.has(k) && ai.ready;
    // once you write your own reply it steps away
    const flat = (x) => x.replace(/\s+/g, " ").trim();
    const cur = flat(c.ip ? edText : c.ta.value);
    if (cur && !list.some((x) => flat(x.text) === cur)) { list = []; waiting = false; }
  }
  const sig = (waiting ? "w" : "") + list.map((x) => x.label + "\u0001" + x.text).join("|");
  if (c.ideas.dataset.sig === sig) return;
  c.ideas.dataset.sig = sig;
  c.ideas.replaceChildren(...(waiting ? [h("div", { class: "qm-ideas-wait", "aria-label": "Thinking" }, h("i"), h("i"), h("i"))]
    : list.map((idea) => h("button", { type: "button", title: idea.text, "aria-label": idea.label + ": " + idea.text, onclick: () => useIdea(c, idea.text) }, icon("spark"), h("span", { text: idea.label })))));
}
/* a label for a suggestion that came without one: its first few words */
function shortIdea(text) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return words.length <= 4 ? words.join(" ") : words.slice(0, 4).join(" ").replace(/[,.;:!?]+$/, "") + "…";
}
async function useIdea(c, idea) {
  const ip = c.ip || (await goLive(c, true));
  const ed = ip && $(".editable", ip);
  if (!ed) return;
  putText(ed, idea, true);
  focusEnd(ed);
  updateSend(c);
}
function toggleComposerAI(c, open) {
  const on = open === undefined ? c.aiRow.hidden : open;
  // (⌘J opens it; there's no button for it. Off, or with no AI to write with, it says so)
  if (on && (!aiOn() || !(useGemini() || ai.ready))) { toast("Turn on AI in Umbra's settings to write with it."); return; }
  if (!on) c.aiRun = null; // (closed while it writes: ⌘J, esc, another conversation — what it writes is dropped)
  c.aiRow.hidden = !on;
  c.root.classList.toggle("qm-aion", on);
  if (on) {
    c.aiInput.value = "";
    engage(c);
    c.aiInput.focus();
    setTimeout(() => { if (!c.aiRow.hidden && document.activeElement !== c.aiInput) c.aiInput.focus(); }, 30);
  }
  else if (c.aiInput === document.activeElement) { if (c.ip) focusEnd($(".editable", c.ip)); else c.ta.focus(); }
}
async function aiCompose(c, instruction) {
  const t = c.t;
  if (!t || c.root.classList.contains("qm-busy")) return;
  c.root.classList.add("qm-busy");
  engage(c);
  const run = (c.aiRun = {});
  const live = () => c.aiRun === run;
  try {
    const ip = c.ip || (await goLive(c, false));
    const ed = ip && $(".editable", ip);
    if (!ed) throw new Error("Couldn't open the reply.");
    if (!live()) return;
    const draft = ownText(ed);
    let done = false;
    if (useGemini() && $('[aria-label^="Help me write" i]', ip)) {
      if (draft) putText(ed, "", true);
      const prompt = draft ? `Rewrite this reply so it reads well, keeping my meaning and voice${instruction ? " (" + instruction + ")" : ""}: ${draft}` : instruction || "Write the reply this conversation needs, in my usual voice.";
      const askEl = await openPrompt(ip, $('[aria-label^="Help me write" i]', ip));
      if (askEl) { askGemini(askEl, prompt); done = !!(await geminiResult(ed, "")); }
      // (cancelled meanwhile: what you had comes back, not what Gemini wrote)
      if (!live()) { if (done || draft) putText(ed, draft, true); return; }
      if (!done && draft) putText(ed, draft, true);
    }
    if (!done) {
      if (!ai.ready) throw new Error("Turn on AI in Umbra's settings.");
      countAI();
      const res = await helper("/summarize", { kind: "draft", me: myName(), about: aboutText(), to: othersOf(t).join(", "), draft, instruction: instruction || (draft ? "Polish this draft." : "Write the reply this conversation needs."), subject: t.subject, text: threadText(t) }, 30000);
      if (!live()) return;
      if (!res || !res.text) throw new Error("Couldn't write that.");
      // (you kept writing while it worked: your words stay)
      if (ownText(ed) !== draft) { toast("You kept writing, so the AI's version wasn't put in."); return; }
      putText(ed, res.text, true);
    }
    toggleComposerAI(c, false);
    focusEnd(ed);
    updateSend(c);
  } catch (e) { if (live()) toast(e.message || "Couldn't write that."); }
  finally { if (c.aiRun === run) c.aiRun = null; c.root.classList.remove("qm-busy"); }
}
const EXT_COLORS = { pdf: "#d4544c", doc: "#3f7be0", docx: "#3f7be0", gdoc: "#3f7be0", txt: "#7b8494", rtf: "#7b8494", xls: "#2f9a5e", xlsx: "#2f9a5e", csv: "#2f9a5e", gsheet: "#2f9a5e", ppt: "#df7a3a", pptx: "#df7a3a", key: "#df7a3a", gslides: "#e0a43a", zip: "#8a7bb8" };
function fileExt(f) {
  const m = /\.([a-z0-9]{1,6})$/i.exec(f.name || "");
  if (m) return m[1].toLowerCase();
  return /pdf/.test(f.mime) ? "pdf" : /word|document/.test(f.mime) ? "docx" : /sheet|excel/.test(f.mime) ? "xlsx" : /presentation|powerpoint/.test(f.mime) ? "pptx" : "file";
}
/* A message's files: pictures as themselves, documents by the first page Gmail drew of them, anything else as a
   card with its kind, name and size. A click opens it full screen (pictures, PDFs, text, sound and video in
   Umbra's viewer; Word, Excel and PowerPoint in Gmail's, which reads them page by page). Nothing downloads until
   you press Download. */
const KIND_WORDS = { pdf: "PDF", doc: "Word", docx: "Word", pages: "Pages", key: "Keynote", numbers: "Numbers", xls: "Excel", xlsx: "Excel", csv: "Spreadsheet", ppt: "PowerPoint", pptx: "PowerPoint", txt: "Text", zip: "ZIP archive", rar: "Archive", "7z": "Archive", mp3: "Audio", m4a: "Audio", wav: "Audio", mp4: "Video", mov: "Video", ics: "Invitation", vcf: "Contact" };
const GMAIL_SHOWS = /^(docx?|xlsx?|pptx?|odt|ods|odp|rtf|csv|tsv)$/; // what Gmail's own viewer reads, page by page
const deadPics = new Set(); // pictures of files Gmail couldn't draw
// what Gmail can't read at all (Apple's Pages, Keynote and Numbers, archives): its "preview" of one is a blank
// page, and its viewer would only download it, so these are cards that open Umbra's (with Download)
const GMAIL_CANT = /^(pages|key|numbers|zip|rar|7z|gz|tgz|dmg|iso)$/;
// Gmail's preview of a linked video sits among an email's files (a card with the video's title): it's the video's
// card (videoCards), not a file to download
const videoCard = (card) => !!(card && $('a[href*="youtube.com/"], a[href*="youtu.be/"]', card));
/* what kind of file it is: by its name, or (a name without one) by what Gmail says it is */
function kindOf(name, mime) {
  const k = fileKind(name);
  if (k !== "other" || !mime) return k;
  return /^image\//.test(mime) ? "image" : /pdf/.test(mime) ? "pdf" : /^audio\//.test(mime) ? "audio" : /^video\//.test(mime) ? "video" : /^text\//.test(mime) ? "text" : k;
}
function attsOf(m) {
  return m.files.filter((f) => !videoCard(f.card)).map((f, i) => {
    // the file's own address on Gmail (view=att, its attid): to see it, and to save it. Anything else isn't one, and
    // then Gmail's own buttons on the card still work
    let view = "", get = "";
    try {
      const u = new URL(f.url, location.origin);
      if (u.origin === location.origin && u.searchParams.get("view") === "att" && u.searchParams.has("attid")) { u.searchParams.set("disp", "inline"); view = u.toString(); u.searchParams.set("disp", "safe"); get = u.toString(); }
    } catch (e) { /* no address */ }
    const sizeEl = $$("*", f.card).find((e) => !e.children.length && /^\d[\d.,]*\s*(?:B|K|KB|M|MB|G|GB)$/i.test(e.textContent.trim()));
    const ext = fileExt(f);
    return { key: (m.id || "m") + ":" + i, name: f.name, mime: f.mime, kind: kindOf(f.name, f.mime), ext, size: sizeBytes(sizeEl ? sizeEl.textContent : ""),
      view, get, thumb: f.thumb, preview: GMAIL_CANT.test(ext) ? "" : f.preview, card: f.card, here: true,
      from: { name: m.mine ? "You" : personName(m.email, m.name) || m.name || m.email || "", email: m.email || "", date: m.date || "" }, time: 0 };
  });
}
const kindWord = (a) => KIND_WORDS[a.ext] || (a.kind === "image" ? "Image" : (a.ext || "File").toUpperCase() + (a.ext ? " file" : ""));
// Gmail's own viewer, for the documents it reads (its link on the card it drew)
const gmailViewer = (a) => (!a.card || !a.card.isConnected ? null : $("a.aQy", a.card) || null);
function openAtt(a, list, from) {
  const ours = a.view && /^(image|pdf|text|audio|video)$/.test(a.kind);
  if (!ours && !GMAIL_CANT.test(a.ext) && (a.preview || GMAIL_SHOWS.test(a.ext)) && gmailViewer(a)) { press(gmailViewer(a)); return; }
  viewFile(a, list, from);
}
function getAtt(a) {
  if (a.get) { downloadFile(a); return; }
  const dl = a.card && $('[aria-label^="Download" i]', a.card);
  if (dl) press(dl); else toast("Couldn't download that.");
}
function fileChips(m) {
  const atts = attsOf(m);
  if (!atts.length) return [];
  const open = (el, a) => {
    el.addEventListener("click", () => openAtt(a, atts, el));
    el.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === el) { e.preventDefault(); openAtt(a, atts, el); } });
    return el;
  };
  const dl = (a) => h("button", { type: "button", class: "qm-x qm-attdl", "aria-label": "Download " + a.name, title: "Download", onclick: (e) => { e.stopPropagation(); getAtt(a); } }, icon("download"));
  const tag = (a) => { const t = h("span", { class: "qm-docext", text: (a.ext || "file").toUpperCase().slice(0, 5) }); t.style.setProperty("--ext", EXT_COLORS[a.ext] || "#7b8494"); return t; };
  const card = (a) => {
    const glyph = h("span", { class: "qm-attglyph", "aria-hidden": "true" }, h("b", { text: (a.ext || "file").toUpperCase().slice(0, 4) }));
    glyph.style.setProperty("--ext", EXT_COLORS[a.ext] || "#8b93a3");
    return open(h("div", { class: "qm-att", role: "button", tabindex: "0", title: a.name, "aria-label": "Open " + a.name },
      glyph, h("span", { class: "qm-attinfo" }, h("span", { class: "qm-attname", text: a.name }), h("span", { class: "qm-attmeta", text: [kindWord(a), sizeText(a.size)].filter(Boolean).join(" · ") })), dl(a)), a);
  };
  // a picture Gmail couldn't draw (it does happen) becomes the file's card, never a broken image
  const pic = (src, a, el) => { const img = h("img", { src, alt: a.thumb ? a.name : "", loading: "lazy", draggable: "false" }); img.addEventListener("error", () => { deadPics.add(src); a.thumb = a.preview = ""; const c = card(a); const was = el(); if (was && was.isConnected) was.replaceWith(c); }); return img; };
  for (const a of atts) { if (deadPics.has(a.thumb)) a.thumb = ""; if (deadPics.has(a.preview)) a.preview = ""; } // (and it stays the card)
  const out = [];
  const imgs = atts.filter((a) => a.thumb), pages = atts.filter((a) => !a.thumb && a.preview), rest = atts.filter((a) => !a.thumb && !a.preview);
  if (imgs.length) out.push(h("div", { class: "qm-atts qm-thumbs" }, imgs.map((a) => { let t = null; t = open(h("div", { class: "qm-thumb", role: "button", tabindex: "0", title: a.name, "aria-label": "Open " + a.name }, pic(a.thumb, a, () => t)), a); return t; })));
  if (pages.length) out.push(h("div", { class: "qm-atts qm-docs" }, pages.map((a) => { let d = null; d = open(h("div", { class: "qm-doc", role: "button", tabindex: "0", title: a.name, "aria-label": "Open " + a.name },
    h("div", { class: "qm-docpage" }, pic(a.preview, a, () => d)),
    h("div", { class: "qm-docbar" }, tag(a), h("span", { class: "qm-fname", text: a.name.replace(/\.[a-z0-9]{1,6}$/i, "") }), dl(a))), a); return d; })));
  if (rest.length) out.push(h("div", { class: "qm-atts qm-attcards" }, rest.map(card)));
  if (atts.length > 1) {
    const item = liveItem(m);
    const all = (re) => item && $$("[aria-label], [data-tooltip]", item).find((b) => re.test(b.getAttribute("aria-label") || b.getAttribute("data-tooltip") || ""));
    const zip = all(/^download all/i), drive = all(/^(add|save) all to drive/i);
    if (zip || drive) out.push(h("div", { class: "qm-attall" },
      h("span", { text: atts.length + " files" }),
      zip ? h("button", { type: "button", class: "qm-minibtn", onclick: () => { const b = all(/^download all/i); if (b && press(b)) toast("Downloading all " + atts.length + " as a .zip…"); else toast("Gmail doesn't offer that just now."); } }, icon("download"), h("span", { text: "Download all" })) : null,
      drive ? h("button", { type: "button", class: "qm-minibtn", onclick: () => { const b = all(/^(add|save) all to drive/i); if (b && press(b)) toast("Saving all to Drive…"); else toast("Gmail doesn't offer that just now."); } }, icon("file"), h("span", { text: "Save all to Drive" })) : null));
  }
  return out;
}
/* the videos an email links to (YouTube): a card each, with the video's picture, under the email */
function videoCards(m) {
  if (!m.body) return [];
  const seen = new Set(), out = [];
  // (Gmail's own preview knows the video's title)
  const titles = new Map();
  for (const f of m.files || []) {
    const a = videoCard(f.card) && $('a[href*="youtube.com/"], a[href*="youtu.be/"]', f.card);
    const id = a && (a.href.match(/[?&]v=([\w-]{11})/) || a.href.match(/youtu\.be\/([\w-]{11})/) || [])[1];
    if (id && f.name) titles.set(id, f.name);
  }
  for (const a of $$("a[href]", m.body)) {
    let url;
    try { url = new URL(realLink(a.getAttribute("href") || "").url); } catch (e) { continue; }
    const host = url.hostname.replace(/^(www|m)\./, "");
    const id = host === "youtu.be" ? url.pathname.slice(1).split("/")[0] : /^(youtube\.com|youtube-nocookie\.com)$/.test(host) ? url.searchParams.get("v") || (url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/) || [])[1] : "";
    if (!id || !/^[\w-]{11}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const words = text(a).trim();
    const title = titles.get(id) || (words && !/^https?:|youtu/i.test(words) && words.length > 3 ? words : "YouTube video");
    const pic = h("img", { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, alt: "", loading: "lazy", draggable: "false", referrerpolicy: "no-referrer" });
    const card = h("button", { type: "button", class: "qm-video", title: "Play on YouTube", onclick: () => openUrl(url.toString()) },
      h("span", { class: "qm-vthumb" }, pic, h("i", { class: "qm-vplay", "aria-hidden": "true" })),
      h("span", { class: "qm-vinfo" }, h("b", { text: title.slice(0, 120) }), h("small", { text: "YouTube" })));
    pic.addEventListener("error", () => card.classList.add("qm-vnopic"));
    out.push(card);
    if (out.length >= 3) break;
  }
  return out.length ? [h("div", { class: "qm-videos" }, out)] : [];
}
/* a calendar invitation: Gmail's own "Going? Yes · Maybe · No" (drawn beside the email's words, not in them), answered
   from here. The email's own Yes / Maybe / No links still open Calendar, as they always did. */
const RSVP = [["Yes", /^(yes|sí|oui|ja|sì|sim|はい|是|예|да|evet)$/i], ["Maybe", /^(maybe|quizás|tal vez|peut-être|vielleicht|forse|talvez|未定|也许|미정|возможно|belki)$/i], ["No", /^(no|non|nein|não|いいえ|否|아니요|нет|hayır)$/i]];
function rsvpButtons(m) {
  const item = liveItem(m);
  if (!item) return null;
  const btns = $$('[role="button"], button', item).filter((b) => !b.closest(".a3s, .qm-rsvp") && b.childElementCount < 4 && text(b).length < 14 && visible(b));
  const found = RSVP.map(([w, re]) => [w, btns.find((b) => re.test(text(b)) || re.test(b.getAttribute("aria-label") || ""))]).filter(([, b]) => b);
  if (found.length < 2) return null;
  // (only an invitation's: the answers sit together, in a card about going, or the email is an invitation)
  let box = found[0][1];
  for (let i = 0; i < 7 && box && !found.every(([, b]) => box.contains(b)); i++) box = box.parentElement;
  if (!box || !found.every(([, b]) => box.contains(b))) return null;
  const invite = /going\?|rsvp|invitation|calendar|attend/i.test(text(box)) || m.files.some((f) => /\.ics$/i.test(f.name) || /calendar/i.test(f.mime)) || !!(m.body && $('a[href*="calendar.google.com/calendar/event"], a[href*="calendar/event?action=RESPOND"]', m.body));
  return invite ? found : null;
}
const rsvpOn = (b) => b.getAttribute("aria-pressed") === "true" || b.getAttribute("aria-checked") === "true" || b.getAttribute("aria-selected") === "true";
const rsvpSig = (m) => { const f = rsvpButtons(m); return f ? f.map(([w, b]) => w + (rsvpOn(b) ? "+" : "")).join("") : ""; };
function rsvpEl(m) {
  const found = rsvpButtons(m);
  if (!found) return null;
  return h("div", { class: "qm-rsvp", role: "group", "aria-label": "Going?" }, h("span", { text: "Going?" }),
    ...found.map(([w, b]) => h("button", { type: "button", "aria-pressed": String(rsvpOn(b)), onclick: () => {
      const now = (rsvpButtons(m) || []).find(([x]) => x === w);
      if (now && press(now[1])) { toast(w === "Yes" ? "You're going." : w === "No" ? "You said you're not going." : "You said maybe."); for (const ms of [600, 1600]) setTimeout(() => { lastThreadSig = ""; invalidate(true); }, ms); }
      else toast("Gmail doesn't offer that just now.");
    } }, w)));
}
/* Gmail held back an email's pictures ("Images are not displayed"): its own buttons to show them, here too */
function hiddenPics(m) {
  const item = liveItem(m);
  if (!item) return null;
  const find = (re) => $$('[role="link"], [role="button"], a, span', item).filter((x) => !x.closest(".a3s")).find((x) => re.test(text(x)) && x.childElementCount === 0);
  const show = find(/^display images below$/i);
  if (!show) return null;
  const always = find(/^always display images from /i);
  return h("div", { class: "qm-picshidden" }, icon("image"), h("span", { text: "Pictures in this email are hidden." }),
    h("button", { type: "button", onclick: () => { const b = find(/^display images below$/i); if (b) { press(b); picsShown(m); } } }, "Show them"),
    always ? h("button", { type: "button", onclick: () => { const b = find(/^always display images from /i); if (b) { press(b); picsShown(m); } } }, "Always from this sender") : null);
}
// (Gmail puts the pictures in over a moment: the copy of that email is made again as they arrive)
function picsShown(m) {
  for (const ms of [400, 1200, 3000]) setTimeout(() => { bodyCache.delete(m.id); lastThreadSig = ""; invalidate(true); }, ms);
}

function bodyEl(m, entry, opts) {
  const node = entry.node;
  node.classList.toggle("qm-showall", !!opts.showAll);
  node.classList.toggle("qm-chat", !!opts.chat); // in a conversation, earlier messages quoted below fold away
  const parts = [];
  if (entry.rich) {
    // (dark already: shown as it is, its own background running out to the edges)
    const wrap = h("div", { class: "qm-rich-wrap" + (entry.dark ? " qm-ownbg" : "") }, h("div", { class: "qm-rich" + (prefs.darken && !isLight() && !entry.dark ? " qm-dark" : "") }, node));
    if (entry.dark) { wrap.style.background = "rgb(" + entry.dark + ")"; wrap.firstChild.style.background = "rgb(" + entry.dark + ")"; }
    parts.push(wrap);
  }
  else parts.push(node);
  // Gmail cuts very long emails short: the rest comes in right here
  if (entry.clipped) { const btn = h("button", { type: "button", class: "qm-clipped", onclick: () => loadWhole(m, btn) }, "Show the whole message"); parts.push(btn); }
  return parts;
}
/* the whole of a long email Gmail cut short, from its print view (same Gmail, all of it), shown in place */
const wholeBodies = new Map();
async function loadWhole(m, btn) {
  const tid = screen.key;
  if (!tid) return;
  btn.disabled = true;
  btn.textContent = "Loading the rest…";
  try {
    const h2 = $("h2.hP", gmailMain() || document);
    const perm = h2 && (h2.getAttribute("data-thread-perm-id") || "");
    if (perm) notePerm(tid, perm);
    const doc = parseHTML(await getText(printPath(accountIndex(), tid)));
    const norm = (x) => x.replace(/\s+/g, " ").trim().slice(0, 160);
    const want = norm(plainText(m.body)).slice(0, 80);
    const cells = doc ? $$("table.message", doc.body).map((t) => { const rows = $$(":scope > tbody > tr", t); return rows[rows.length - 1]; }).filter(Boolean) : [];
    // (the print view lists the emails in the conversation's order: of those that start the same way, the one
    // in this email's place, so a second "Hi Ann, thanks…" isn't mistaken for the first)
    const main = gmailMain();
    const msgs = main && $("h2.hP", main) ? readThread(main).messages : [];
    const at = msgs.findIndex((x) => x.id === m.id);
    const hits = cells.map((c, i) => [c, i]).filter(([c]) => want && norm(plainText(c)).includes(want.slice(0, 50)));
    const near = (i) => (at < 0 ? i : Math.abs(i - at - (cells.length - msgs.length)));
    const cell = hits.length ? hits.sort((a, b) => near(a[1]) - near(b[1]))[0][0] : cells.length === 1 ? cells[0] : null;
    if (!cell) throw new Error("not found");
    const node = document.importNode(cell, true);
    for (const x of node.querySelectorAll("script, iframe, object, embed, form, link, meta, base, frame, frameset")) x.remove();
    for (const x of node.querySelectorAll("*")) for (const at of [...x.attributes]) if (/^on/i.test(at.name) || (/^(href|src|action)$/i.test(at.name) && /^\s*javascript:/i.test(at.value))) x.removeAttribute(at.name);
    for (const a of node.querySelectorAll("a[href]")) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer"); }
    const wrap = document.createElement("div");
    wrap.className = "a3s";
    wrap.append(...node.childNodes);
    wholeBodies.set(m.id, wrap);
    bodyCache.delete(m.id);
    invalidate(true);
    if (fullMsg && fullMsg.mid === m.id) fullMsg.fill(); // (open full screen: there too)
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Show the whole message";
    toast("Couldn't load the rest of this email.");
  }
}

/* ---- conversation & reading screens: built once, then only their insides change ---- */
const sumAsked = new Set();
let emptyThread = null, expandTry = null;
/* Gmail's view of a conversation has something in it to look at (a message Umbra couldn't read), not only its frame */
const gmailDrewMessages = (main) => !!main && $$('[role="listitem"], .adn, .a3s', main).some((x) => visible(x) && x.getBoundingClientRect().height > 24);
function renderThread(r) {
  const t = readThread(r.main);
  if (!t.messages.length) {
    // nothing of it Umbra can read (yet): a moment's wait, never a spinner that stays. Then, if Gmail drew something
    // Umbra can't read, Gmail's own view of it; if Gmail drew nothing (it couldn't load it), Umbra says so, with Back
    // and Try again. (In a tab in the background Gmail can simply be slow: the wait starts once you're looking.)
    if (!emptyThread || emptyThread.hash !== r.hash || document.hidden) emptyThread = { hash: r.hash, at: Date.now() };
    if (document.hidden) return;
    if (Date.now() - emptyThread.at > 3000) {
      if (gmailDrewMessages(r.main)) { hideView(); ROOT.classList.add("qm-gmailpage"); }
      else { ROOT.classList.remove("qm-gmailpage"); renderLost(r.hash, true); }
    } else setTimeout(() => invalidate(), 3100);
    return;
  }
  emptyThread = null;
  readingFrom = ((t.messages.find((m) => !m.mine && m.email) || {}).email || "").toLowerCase();
  if (t.id && !readHere.has(String(t.id)) && !markedUnread.has(String(t.id))) noteRead(t.id, Date.now());
  // open every message: when the conversation is opened, and again whenever its messages change (Gmail folds the
  // earlier ones again after you send, or undo a send)
  // (Gmail may not have drawn its Expand all yet: looked for again as it does, for a few seconds)
  const expKey = t.id + ":" + t.messages.length;
  if (prefs.expand && t.id && expandedFor !== expKey) {
    const collapsed = t.messages.some((m) => m.collapsed) || !!t.older;
    const btn = collapsed ? $$('[aria-label="Expand all" i], [data-tooltip="Expand all" i]', r.main).find(visible) || $('[aria-label="Expand all" i], [data-tooltip="Expand all" i]', r.main) : null;
    if (!collapsed || t.messages.length > 80) expandedFor = expKey;
    else if (btn) { expandedFor = expKey; press(btn); }
    else if (!expandTry || expandTry.key !== expKey) { expandTry = { key: expKey, at: Date.now() }; setTimeout(() => invalidate(), 600); }
    else if (Date.now() - expandTry.at > 4000) expandedFor = expKey;
    else setTimeout(() => invalidate(), 600);
  }
  const reading = t.messages.length === 1;
  const { el, fresh } = setScreen(reading ? "reading" : "thread", t.id, () => (reading
    ? h("div", { class: "qm-reading" }, h("div", { class: "qm-scroll" }, h("article", { class: "qm-article" }), h("div", { class: "qm-topfade" })), h("div", { class: "qm-cslot qm-dock" }))
    : h("div", { class: "qm-thread" }, h("div", { class: "qm-head" }, h("h1"), h("div", { class: "qm-sumslot" })), h("div", { class: "qm-convo" }, h("div", { class: "qm-convo-in" })), h("div", { class: "qm-cslot" }))));
  if (fresh) wireTitle(el, reading);
  const long = t.messages.some((m) => m.body && m.body.textContent.length > 1800);
  const lastId = (t.messages[t.messages.length - 1] || {}).id;
  const sumKey = (reading ? "p:" : "t:") + accountEmail() + ":" + t.id + ":" + lastId;
  // only where it saves reading (a long email, a conversation of four or more): made as it opens
  // ("auto", one quick request, kept), or offered as a button ("ask")
  const canSum = prefs.summaries !== "off" && ai.ready && !dismissed.has(sumKey) && (reading ? long : t.messages.length >= 4 || long);
  // Gemini already read the newest email (Settings › Gemini): its line, free, instead of asking Umbra's AI
  const gm = gp().thread && prefs.summaries !== "off" && !dismissed.has(sumKey) ? gemFor({ id: t.id }) : null;
  const gline = gm && gm.summary && (!gm.mid || gm.mid === String(lastId).toLowerCase()) ? gm.summary : "";
  const sum = gline && (reading ? long || !!gm.action : !canSum || prefs.summaries !== "auto")
    ? (reading ? { points: [gline], gem: true } : { summary: (t.messages.length > 1 ? "Latest: " : "") + gline, gem: true })
    : canSum ? (prefs.summaries === "auto" || aiCache.has(sumKey) || sumAsked.has(sumKey) ? ask(sumKey, { kind: reading ? "points" : "thread", subject: t.subject, text: threadText(t) }, invalidate) : "offer") : null;
  // (asked, and it failed: why, and a way to try again)
  const sumShown = sum === null && canSum && failedAI.has(sumKey) && Date.now() - failedAI.get(sumKey) < 5 * 60 * 1000 ? { failed: aiWhy.get(sumKey) || "the AI didn't answer" } : sum;
  const pend = pendingFor(t);
  const sig = [t.id, t.messages.map((m) => m.id + (m.collapsed ? "c" : "e") + (m.body ? cloneBody(m).sig : "") + m.files.map((f) => (f.thumb ? 1 : f.preview ? 2 : 0) + hashString(f.thumb + f.preview + f.url)).join("") + (showAll.has(m.id) ? "s" : "") + m.reacts.map((x) => x.emoji + x.count + (x.mine ? 1 : 0)).join("") + (pendingReact.has(m.id) ? "p" : "")).join("|"),
    sumShown && sumShown.failed ? "f" : sum === undefined ? "w" : sum === "offer" ? "o" : sum ? "y" + (sum.gem ? "g" : "") + hashString(String(sum.summary || (sum.points || []).join("|"))) : "n", prefs.darken, isLight(), prefs.avatars, !!t.older, pend.length, Object.keys(contacts).length,
    t.labels.join(","), threadStarred(), !!t.unsub, text(scheduledLine(r.main)), t.messages.map((m) => (readerOn.has(m.id) ? 1 : 0) + rsvpSig(m)).join("")].join("#");
  if (fresh || sig !== lastThreadSig) {
    lastThreadSig = sig;
    if (reading) renderReading(el, t, sumShown, sumKey);
    else renderConvo(el, t, sumShown, sumKey, fresh, pend);
  }
  const slot = $(".qm-cslot", el);
  // how tall the message box is: the conversation leaves that much room and fades out behind it
  if (!slot.qmRo) { slot.qmRo = new ResizeObserver(() => { const hh = slot.hidden ? 0 : slot.offsetHeight; el.style.setProperty("--qm-cslot-h", hh + "px"); if (hh) ROOT.style.setProperty("--qm-dock-lift", hh + "px"); }); slot.qmRo.observe(slot); }
  // the reply bar only while you're writing (Reply, or a draft going); otherwise nothing is fixed to the bottom of
  // the screen: Reply and Forward wait at the end of the email, where you finish reading
  const pd = parkedDraft();
  const pdEd = pd && $(".editable", pd);
  // (a reply with words in its window counts too: the box keeps its place, out of sight, so the window goes back
  // into it and the box takes your next click at once; an empty one goes back to Reply, where it came from)
  const inWindow = $$('.nH.Hd[role="dialog"]').some((d) => d.dataset.qmThread === screen.key && !d.dataset.qmFwd && visible(d) && !isMinimized(d) && !minimizing.has(d) && !d.dataset.qmMin && hasContent(d));
  const drafting = (!!pdEd && hasContent(pd)) || !!(slot.qm && slot.qm.ta.value.trim()) || inWindow;
  // (a reply or forward on its way into a window: the screen stays as it was meanwhile, not the bar for a moment while
  // Gmail's reply exists, out of sight, before it becomes the window)
  const full = replyOpening ? !slot.hidden : drafting || (!barFolded.has(t.id) && barOpened.has(t.id));
  slot.hidden = !full;
  slot.classList.toggle("qm-mini-on", !full);
  const host = $(reading ? ".qm-article" : ".qm-convo-in", el);
  let ends = host && $(":scope > .qm-endacts", host);
  if (!full && host) {
    el.style.setProperty("--qm-cslot-h", "0px");
    if (!ends) ends = h("div", { class: "qm-endacts" },
      h("button", { type: "button", class: "qm-minibtn", onclick: () => openBar("reply") }, icon("reply"), h("span", { text: "Reply" })),
      h("button", { type: "button", class: "qm-minibtn qm-replyall", onclick: () => openBar("all") }, icon("replyAll"), h("span", { text: "Reply all" })),
      h("button", { type: "button", class: "qm-minibtn qm-fwdbtn", onclick: (e) => replyBarAction("forward", e.currentTarget) }, icon("forward"), h("span", { text: "Forward" })));
    const ra = $(".qm-replyall", ends);
    if (ra) ra.hidden = othersOn(t) < 2;
    if (host.lastElementChild !== ends) host.appendChild(ends);
  } else if (ends) ends.remove();
  if (!full) { if (slot.qm) detachBar(slot.qm); return; }
  updateComposer(slot, t);
  // an empty reply bar steps aside again once you click away (or press esc): Reply waits at the end once more
  if (!slot.qmAside) {
    const aside = () => setTimeout(() => {
      const c = slot.qm, a = document.activeElement;
      if (!c || !slot.isConnected || slot.hidden || Date.now() - barOpenedAt < 900 || slot.contains(a) || (c.ip && c.ip.contains(a)) || popups().length) return;
      const pe = parkedDraft(), pedEd = pe && $(".editable", pe);
      if (c.ta.value.trim() || (pedEd && ownText(pedEd))) return;
      barOpened.delete(screen.key);
      invalidate(true);
    }, 220);
    slot.qmAside = aside;
  }
  if (barFocus === t.id && slot.qm) {
    barFocus = "";
    const c = slot.qm, how = barHow;
    barHow = "";
    c.root.classList.add("qm-arrive");
    setTimeout(() => c.root.classList.remove("qm-arrive"), 400);
    c.ta.focus();
    // Reply (not Reply all) to a conversation with several people: the reply is switched to just the sender
    // (and Reply all after that: everyone again)
    goLive(c, true, how).then((ip) => { if (ip && (how === "reply" || (how === "all" && (ip.dataset.qmHow === "reply" || narrowed(ip))))) replyAs(ip, how).then((ok) => { if (!ok && how === "all") toast("Couldn't switch this to Reply all. Gmail's reply menu (the arrow by the recipients) can."); const ed = $(".editable", ip); if (ed) focusEnd(ed); }); });
  }
}
const barOpened = new Set(), barFolded = new Set();
let barOpenedAt = 0;
// (Gmail's own editor sits in the bar but isn't inside it: a click elsewhere, or esc, is watched for page-wide)
const barSlot = () => { if (!enabled) return null; const sl = $("#qm-view .qm-cslot:not(.qm-leaving *)"); return sl && sl.qmAside && !sl.hidden ? sl : null; };
document.addEventListener("pointerdown", (e) => { const sl = barSlot(); if (sl && !sl.contains(e.target) && !(sl.qm && sl.qm.ip && sl.qm.ip.contains(e.target))) sl.qmAside(); }, true);
document.addEventListener("keydown", (e) => { if (e.key !== "Escape") return; const sl = barSlot(); if (sl) sl.qmAside(); }, true);
let barFocus = "", barHow = "";
/* Reply and Reply all open the reply bar under the conversation, at once (no window to wait for) */
function openBar(how) {
  if (!screen.key) return;
  barOpenedAt = Date.now();
  barFolded.delete(screen.key);
  barOpened.add(screen.key);
  barFocus = screen.key;
  barHow = how || "all";
  invalidate(true);
}
/* the subject steps down to a small title as you scroll into the conversation, and comes back up at the very
   top. (The header floats over the conversation, so shrinking it never moves what you're reading.) */
function wireTitle(el, reading) {
  if (reading) {
    const sc = $(".qm-scroll", el);
    if (!$(":scope > .qm-minititle", el)) el.appendChild(h("div", { class: "qm-minititle", "aria-hidden": "true" }));
    const check = () => {
      const h1 = $(".qm-article h1", el);
      const on = el.classList.contains("qm-compact");
      if (!on && h1 && h1.getBoundingClientRect().bottom < 76) el.classList.add("qm-compact");
      else if (on && (sc.scrollTop <= 2 || (h1 && h1.getBoundingClientRect().bottom >= 76))) el.classList.remove("qm-compact");
    };
    sc.addEventListener("scroll", check, { passive: true });
    return;
  }
  const convo = $(".qm-convo", el), head = $(".qm-head", el);
  if (!$(":scope > .qm-minititle", el)) el.appendChild(h("div", { class: "qm-minititle", "aria-hidden": "true" }));
  let growing = 0, settle = 0;
  const measure = () => { if (!el.classList.contains("qm-compact")) el.style.setProperty("--qm-head-h", head.offsetHeight + "px"); };
  const check = () => {
    const on = el.classList.contains("qm-compact");
    if (!on && convo.scrollTop > 28) el.classList.add("qm-compact");
    else if (on && convo.scrollTop <= 2) { el.classList.remove("qm-compact"); growing = Date.now(); clearTimeout(settle); settle = setTimeout(measure, 300); }
  };
  convo.addEventListener("scroll", check, { passive: true });
  // the conversation starts below the full header, measured while it's full: not while it's still growing
  // back from the small title (measuring then would pull the conversation up and push it down again)
  new ResizeObserver(() => { if (Date.now() - growing > 280) measure(); }).observe(head);
}
const showAll = new Set();
function threadText(t) {
  return t.messages.map((m) => `From: ${m.name || m.email} (${m.date})\n${(m.body ? m.body.innerText : m.snippet).replace(/\n{3,}/g, "\n\n").trim().slice(0, 3500)}`).join("\n\n---\n\n").slice(0, 16000);
}
function myName() {
  const acct = $('[aria-label^="Google Account:" i]');
  const m = acct && (acct.getAttribute("aria-label") || "").match(/:\s*([^(\n]+?)\s*\(/);
  return m ? m[1].trim() : accountEmail().split("@")[0];
}
function summaryEl(sum, sumKey, cls) {
  if (sum === "offer") return h("button", { type: "button", class: "qm-sumask", onclick: () => { sumAsked.add(sumKey); invalidate(true); } }, "Summarize");
  if (sum === undefined) return h("div", { class: cls + " qm-wait" }, h("p", { text: "Summarizing…" }));
  if (sum && sum.failed) {
    const box = h("div", { class: cls + " qm-wait" }, h("p", { text: "Couldn't summarize: " + String(sum.failed).replace(/\.?$/, ".") }),
      h("button", { type: "button", class: "qm-sumask", onclick: () => { failedAI.delete(sumKey); aiWhy.delete(sumKey); sumAsked.add(sumKey); lastThreadSig = ""; invalidate(true); } }, "Try again"));
    return box;
  }
  if (!sum || !sum.summary) return null;
  const box = h("div", { class: cls }, h("p", { text: sum.summary }),
    h("button", { type: "button", class: "qm-x", "aria-label": "Dismiss", onclick: () => { dismiss(sumKey); box.remove(); } }, icon("x")));
  return box;
}
let catchFor = null;
function renderConvo(el, t, sum, sumKey, fresh, pend) {
  const convo = $(".qm-convo", el), inner = $(".qm-convo-in", el);
  const keep = { top: convo.scrollTop, atBottom: convo.scrollHeight - convo.scrollTop - convo.clientHeight < 60 };
  threadBar(el, t);
  $(".qm-head h1", el).textContent = t.subject;
  const mini = $(":scope > .qm-minititle", el);
  if (mini && mini.textContent !== t.subject) mini.textContent = t.subject;
  // who it's from (their address: one click shows all their mail), and its labels
  const senders = [...new Set(t.messages.filter((m) => !m.mine && m.email).map((m) => m.email.toLowerCase()))];
  const sentTo = senders.length ? [] : [...new Set(t.messages.flatMap((m) => (m.to || []).map((x) => (x.email || "").toLowerCase())).filter((e) => e && e !== accountEmail()))];
  const lead = senders[0] || sentTo[0] || "";
  const more = (senders.length || sentTo.length) - 1;
  const sub = h("div", { class: "qm-hsub" },
    lead ? h("span", {}, sentTo.length ? "To " : "", whoButton(lead, "", lead), more > 0 ? h("span", { class: "qm-hmore", title: (senders.length ? senders : sentTo).slice(1).join(", "), text: " +" + more }) : null) : null,
    ...t.labels.map((l) => h("span", { class: "qm-label", text: l })), starMark());
  const old = $(".qm-head .qm-hsub", el);
  if (old) old.replaceWith(sub); else $(".qm-head h1", el).after(sub);
  const oldSched = $(".qm-head .qm-sched", el), sched = scheduledLine(gmailMain());
  if (oldSched) oldSched.remove();
  if (sched) sub.after(sched);
  const sumSlot = $(".qm-sumslot", el), sumSig = sumKey + "|" + (sum === undefined ? "w" : sum === "offer" ? "o" : sum && sum.failed ? "f" : sum && sum.summary ? hashString(sum.summary) : "");
  if (sumSlot.dataset.sig !== sumSig) { sumSlot.dataset.sig = sumSig; sumSlot.replaceChildren(...[summaryEl(sum, sumKey, "qm-sum")].filter(Boolean)); }
  const parts = [];
  if (t.older) parts.push(h("button", { type: "button", class: "qm-older", onclick: () => press(t.older) }, text(t.older) || "Earlier messages"));
  // new since you were last here (worked out once, as it opens): the first of them is where you start
  // (looked at again for the first moments: Gmail fills in its messages as it opens them)
  if (fresh || !catchFor || catchFor.tid !== t.id) catchFor = { tid: t.id, info: newSince(t), at: Date.now(), shown: false };
  else if (!catchFor.info && Date.now() - catchFor.at < 3000) catchFor.info = newSince(t);
  const cu = catchFor.info;
  const freshFrom = cu ? t.messages.findIndex((m) => m.id === cu.first.id) : -1;
  let prev = null;
  const kept = inner.qmMsgs || new Map(), now = new Map();
  t.messages.forEach((m, i) => {
    if (cu && i === freshFrom) parts.push(catchUpEl(t, cu));
    const isNew = !!(cu && freshFrom >= 0 && i >= freshFrom && !m.mine);
    const k = msgSig(m, prev, isNew);
    const hit = m.id && kept.get(m.id);
    const el = hit && hit.sig === k ? hit.el : messageEl(m, prev, isNew);
    if (m.id) now.set(m.id, { sig: k, el });
    parts.push(el);
    prev = m;
  });
  inner.qmMsgs = now;
  markSeen(t);
  for (const p of pend) parts.push(h("div", { class: "qm-msg qm-mine qm-sending" }, h("div", { class: "qm-meta" }, h("span", { text: "Sending…" })),
    h("div", { class: "qm-bubble" }, ...p.text.split("\n").map((line) => h("div", { text: line || " " })), p.files.length ? h("div", { class: "qm-sendfiles", text: p.files.join(", ") }) : null)));
  // (in place: only what's new goes in, only what's gone comes out)
  parts.forEach((p, i) => { if (inner.children[i] !== p) inner.insertBefore(p, inner.children[i] || null); });
  while (inner.children.length > parts.length) inner.lastElementChild.remove();
  requestAnimationFrame(() => {
    const startAt = cu && !catchFor.shown ? $(".qm-catchup", inner) : null;
    if (startAt) { convo.scrollTop = Math.max(0, startAt.offsetTop - 104); catchFor.shown = true; } // (clear of the title floating over the top)
    else if (fresh || threadScrolledFor !== t.id || keep.atBottom || pend.length) convo.scrollTop = convo.scrollHeight;
    else convo.scrollTop = keep.top;
    threadScrolledFor = t.id;
    // a message just sent from the box rises out of it to its place (once: not again on a later redraw)
    const sending = $$(".qm-msg.qm-sending", inner);
    pend.forEach((p, i) => { if (!p.flown && sending[i]) { p.flown = true; if (p.from && Date.now() - p.at < 2000) sendGlide($(".qm-bubble", sending[i]), p.from); else play(sending[i], [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { spring: "gentle" }); } });
  });
}
/* everything a message's look depends on: the same, and it's the same element as before */
function msgSig(m, prev, fresh) {
  const c = contacts[m.email] || {};
  return [m.id, m.collapsed ? "c" : "e", m.body && !m.collapsed ? cloneBody(m).sig : (m.snippet || "").length, m.date, m.name, c.name || "", c.img || "", c.emoji || "", c.color || "", m.mine ? 1 : 0,
    m.files.map((f) => hashString(f.name + f.thumb + f.preview + f.url)).join(""), showAll.has(m.id) ? 1 : 0, readerOn.has(m.id) ? 1 : 0, m.reacts.map((x) => x.emoji + x.count + (x.mine ? 1 : 0)).join(""),
    pendingReact.has(m.id) ? pendingReact.get(m.id).emoji : "", fresh ? 1 : 0, prev ? prev.email + (prev.collapsed ? "c" : "") : "", prefs.avatars ? 1 : 0, prefs.darken ? 1 : 0, isLight() ? 1 : 0, !!$('button[aria-label="Add reaction" i]', m.item) ? 1 : 0, rsvpSig(m)].join("|");
}
function messageEl(m, prev, fresh) {
  const msg = h("div", { class: "qm-msg" + (m.mine ? " qm-mine" : "") + (fresh ? " qm-newmsg" : ""), "data-mid": m.id || null });
  const name = personName(m.email, m.name) || m.email;
  const same = prev && prev.email === m.email && !prev.collapsed; // a run of messages from one person
  const meta = h("div", { class: "qm-meta" + (same ? " qm-same" : "") },
    !m.mine && prefs.avatars ? faceFor(m.email, name, isPersonAddress(m.email, m.name), "qm-mav") : null,
    m.mine ? h("span", { text: m.date }) : h("span", {}, whoButton(m.email, name), m.date ? " · " + m.date : ""));
  msg.appendChild(meta);
  if (m.collapsed || !m.body) {
    const unfold = () => { const it = liveItem(m); press($(".adf, .gs, .Bk", it) || it); };
    const b = h("div", { class: "qm-bubble qm-collapsed", role: "button", tabindex: "0", title: "Show the whole message", text: (m.snippet || "").replace(/\s*…?$/, "") + "…" });
    b.addEventListener("click", unfold);
    const opened = async () => {
      unfold();
      const x = await until(() => { const main = gmailMain(); const t = main && $("h2.hP", main) ? readThread(main) : null; const y = t && t.messages.find((z) => z.id === m.id); return y && !y.collapsed && y.body ? y : null; }, 2500, 50);
      return x || m;
    };
    const then = (fn) => async (e) => { const a = e.currentTarget; fn(await opened(), a); };
    const acts = h("div", { class: "qm-acts" },
      ib("reply", "Reply", then((x, a) => msgReply(x, "reply", a)), "qm-s"), ib("replyAll", "Reply all", then((x, a) => msgReply(x, "all", a)), "qm-s"),
      ib("forward", "Forward", then((x, a) => msgReply(x, "forward", a)), "qm-s"), ib("grow", "Full screen", then((x) => openFullMsg(x)), "qm-s"),
      menuButton("more", "More", (btn) => opened().then((x) => msgMore(x, btn)), "qm-s"));
    msg.appendChild(h("div", { class: "qm-bwrap" }, b, acts));
    msg.addEventListener("mouseenter", () => fitActs(msg));
    msg.addEventListener("focusin", () => fitActs(msg));
    return msg;
  }
  const entry = cloneBody(m);
  const tc = trackerChip(entry);
  if (tc) meta.appendChild(tc);
  if (entry.rich) meta.appendChild(readerButton(m));
  const asReader = entry.rich && readerOn.has(m.id);
  if (entry.rich && !asReader) msg.classList.add("qm-wide");
  const bubble = h("div", { class: entry.rich && !asReader ? "" : "qm-bubble" }, hiddenPics(m), rsvpEl(m), asReader ? readerOf(entry.node) : bodyEl(m, entry, { showAll: showAll.has(m.id), chat: true }));
  if (entry.hasMore && !entry.rich) bubble.appendChild(h("button", { type: "button", class: "qm-more", "aria-label": "Show quoted text", title: "Show quoted text", onclick: () => toggleQuoted(m) }, "•••"));
  bubble.append(...fileChips(m), ...videoCards(m));
  const acts = h("div", { class: "qm-acts" });
  const reactB = $('button[aria-label="Add reaction" i]', m.item) ? ib("react", "React", (e) => msgReact(m, e.currentTarget), "qm-s") : null;
  acts.append(ib("reply", "Reply", (e) => msgReply(m, "reply", e.currentTarget), "qm-s"), ib("replyAll", "Reply all", (e) => msgReply(m, "all", e.currentTarget), "qm-s"), ib("forward", "Forward", (e) => msgReply(m, "forward", e.currentTarget), "qm-s"), ...(reactB ? [reactB] : []),
    ib("grow", "Full screen", () => openFullMsg(m), "qm-s"), menuButton("more", "More", (b) => msgMore(m, b), "qm-s"));
  // the actions sit by the message itself, level with its bottom edge (reactions below don't move them)
  msg.appendChild(h("div", { class: "qm-bwrap" }, bubble, acts));
  const reacts = reactsEl(m);
  if (reacts) msg.appendChild(reacts);
  msg.addEventListener("mouseenter", () => fitActs(msg));
  msg.addEventListener("focusin", () => fitActs(msg));
  return msg;
}
/* the actions sit beside a message when there's room there; beside a wide one (or in dual view's narrower
   column) they'd run past the conversation's edge, so they sit on the message's top edge instead */
function fitActs(msg) {
  const acts = $(":scope > .qm-bwrap > .qm-acts", msg), bub = $(":scope > .qm-bwrap > :first-child", msg), view = msg.closest(".qm-convo");
  if (!acts || !bub || !view || msg.classList.contains("qm-wide")) return;
  const b = bub.getBoundingClientRect(), v = view.getBoundingClientRect();
  const room = msg.classList.contains("qm-mine") ? b.left - v.left : v.right - b.right;
  msg.classList.toggle("qm-acts-over", room < acts.offsetWidth + 18);
}
function renderReading(el, t, sum, sumKey) {
  const m = t.messages[0];
  markSeen(t);
  const scroller = $(".qm-scroll", el);
  const keepTop = scroller.scrollTop;
  const entry = m.body && !m.collapsed ? cloneBody(m) : null;
  const name = m.mine ? "You" : personName(m.email, m.name) || m.email;
  const art = h("article", { class: "qm-article" + (entry && entry.rich ? " qm-wide" : "") });
  art.appendChild(h("div", { class: "qm-ameta" }, prefs.avatars && !m.mine ? faceFor(m.email, name, isPersonAddress(m.email, m.name), "qm-mav") : null,
    m.mine || !m.email ? h("span", { text: name + (m.date ? " · " + m.date : "") })
      : h("span", {}, whoButton(m.email, name), m.date ? " · " + m.date : ""),
    ...t.labels.map((l) => h("span", { class: "qm-label", text: l })),
    starMark(),
    trackerChip(entry),
    entry && entry.rich ? readerButton(m) : null,
    t.unsub ? h("button", { type: "button", class: "qm-unsub", onclick: () => press(t.unsub) }, "Unsubscribe") : null));
  art.appendChild(h("h1", { text: t.subject }));
  const sched = scheduledLine(gmailMain());
  if (sched) art.appendChild(sched);
  const points = h("div", { class: "qm-points" });
  if (sum === "offer" || sum === undefined || (sum && sum.failed)) points.appendChild(summaryEl(sum, sumKey, "qm-point"));
  else if (sum && Array.isArray(sum.points) && sum.points.length) {
    sum.points.slice(0, 2).forEach((s, i) => {
      const k = sumKey + ":" + i;
      if (dismissed.has(k)) return;
      const p = h("div", { class: "qm-point" }, h("p", { text: s.trim() }));
      p.appendChild(h("button", { type: "button", class: "qm-x", "aria-label": "Dismiss", onclick: () => collapseAway(p, () => dismiss(k)) }, icon("x")));
      points.appendChild(p);
    });
  }
  art.appendChild(points);
  const hidden = hiddenPics(m);
  if (hidden) art.appendChild(hidden);
  const rsvp = rsvpEl(m);
  if (rsvp) art.appendChild(rsvp);
  if (entry && entry.rich && readerOn.has(m.id)) art.appendChild(readerOf(entry.node));
  else if (entry) {
    const content = bodyEl(m, entry, { showAll: showAll.has(m.id) });
    art.appendChild(entry.rich ? h("div", {}, content) : h("div", { class: "qm-plainbody" }, content));
    if (entry.hasMore && !entry.rich && entry.node.querySelector(".adL, .ajR")) art.appendChild(h("button", { type: "button", class: "qm-more", "aria-label": showAll.has(m.id) ? "Hide the rest" : "Show the rest", title: showAll.has(m.id) ? "Hide the rest" : "Show the rest", onclick: () => toggleQuoted(m) }, "•••"));
  }
  art.append(...fileChips(m), ...videoCards(m));
  const reacts = reactsEl(m);
  if (reacts) art.appendChild(reacts);
  $(".qm-article", scroller).replaceWith(art);
  const mini = $(":scope > .qm-minititle", el);
  if (mini && mini.textContent !== t.subject) mini.textContent = t.subject;
  threadBar(el, t);
  scroller.scrollTop = keepTop;
}

/* =================================================================== writing windows */
function makeDraggable(handle, target) {
  if (handle.dataset.qmDrag) return;
  handle.dataset.qmDrag = "1";
  let start = null, moved = false;
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button") || target.classList.contains("qm-full")) return;
    start = { x: e.clientX, y: e.clientY, dx: parseFloat(target.style.getPropertyValue("--qm-dx")) || 0, dy: parseFloat(target.style.getPropertyValue("--qm-dy")) || 0, rect: target.getBoundingClientRect() };
    moved = false;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (!start) return;
    let nx = e.clientX - start.x, ny = e.clientY - start.y;
    if (!moved && Math.hypot(nx, ny) < 4) return;
    moved = true;
    nx = Math.min(window.innerWidth - start.rect.right - 8, Math.max(-start.rect.left + 8, nx));
    ny = Math.min(window.innerHeight - start.rect.top - 52, Math.max(-start.rect.top + 8, ny));
    target.style.setProperty("--qm-dx", start.dx + nx + "px");
    target.style.setProperty("--qm-dy", start.dy + ny + "px");
  });
  const end = (e) => { if (!start) return; start = null; try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* gone */ } };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}
function currentSubject() { const s = $("h2.hP", gmailMain() || document); return s ? text(s) : ""; }
/* minimize leaves a pill in the corner; close just puts the draft away (the reply bar reopens it) */
function tuck(ip, closed) {
  ip.classList.add("qm-tucked");
  ip.classList.toggle("qm-closed", !!closed);
  if (!ip.dataset.qmSubject) ip.dataset.qmSubject = currentSubject() || "your reply";
  invalidate();
}
/* a floating reply closed (×): it goes back to being this conversation's reply, in the box under it, words and all */
function unfloat(ip) {
  delete ip.dataset.qmFloat;
  ip.classList.remove("qm-float", "qm-tucked", "qm-closed", "qm-full");
  ip.style.removeProperty("--qm-dx");
  ip.style.removeProperty("--qm-dy");
  const head = $(":scope > .qm-whead", ip);
  if (head) head.remove();
  if (ip.contains(document.activeElement)) document.activeElement.blur();
  invalidate(true);
}
function untuck(ip) {
  ip.classList.remove("qm-tucked", "qm-closed");
  const box = $(".editable", ip);
  if (box) setTimeout(() => box.focus(), 40);
  invalidate();
}
function decorateWriting() {
  let writing = false, tucked = false;
  for (const ip of $$(".ip")) {
    const m9 = $(".M9", ip);
    const open = ip.classList.contains("adB") && !!m9;
    if (!open) {
      if (ip.classList.contains("qm-float")) { ip.classList.remove("qm-float", "qm-tucked", "qm-closed", "qm-full"); ip.style.removeProperty("--qm-dx"); ip.style.removeProperty("--qm-dy"); }
      delete ip.dataset.qmFloat; // (Gmail may use this element again for the next reply: it starts in the box)
      const old = $(":scope > .qm-whead", ip);
      if (old) old.remove();
      continue;
    }
    decorateAttachments(ip);
    // a reply Gmail shows inside the conversation (a saved draft) stays put: the reply bar says
    // "Draft to …" and opens it as a window. Only a reply that couldn't pop out floats here.
    // (toggle, not add/remove: they rewrite the class even when it's already so, which wakes the page watcher and
    // would draw everything again, over and over, while a reply is open)
    ip.classList.toggle("qm-float", ip.dataset.qmFloat === "1");
    if (ip.dataset.qmFloat !== "1") continue;
    if (!ip.classList.contains("qm-tucked")) writing = true;
    else if (!ip.classList.contains("qm-closed")) tucked = true;
    if (!$(":scope > .qm-whead", ip)) {
      const full = ib("grow", "Full size", () => { const on = ip.classList.toggle("qm-full"); full.replaceChildren(icon(on ? "shrink" : "grow")); }, "qm-s");
      const head = h("div", { class: "qm-whead" }, h("span", { class: "qm-wtitle", text: "Re: " + currentSubject() }),
        aiOn() ? ib("write", "Write with AI (⌘J)", () => openWriteBar(ip), "qm-s") : null,
        ib("min", "Minimize", () => { ip.dataset.qmSubject = currentSubject() || "your reply"; tuck(ip); }, "qm-s"), full, ib("x", "Close and keep draft", () => unfloat(ip), "qm-s"));
      ip.prepend(head);
      makeDraggable(head, ip);
      const box = $(".editable", ip);
      if (box) setTimeout(() => box.focus(), 60);
    }
  }
  if ($('[aria-label^="Help me write" i]')) store.set("gemini:" + accountEmail(), true);
  const docked = [];
  for (const ip of $$(".ip.qm-float.qm-tucked:not(.qm-closed)")) docked.push({ key: ip, ip, reply: true, title: "Re: " + (ip.dataset.qmSubject || currentSubject() || "your reply"), close: () => unfloat(ip) });
  // Gmail's own bar for a full-size window that was minimized: a chip instead
  for (const bar of $$(".AD > .Hd:not([role])")) {
    if (!bar.getClientRects().length || bar.getBoundingClientRect().height < 10) continue;
    bar.dataset.qmMin = "1";
    const win = $$('.aSs .nH.Hd[role="dialog"]')[0] || null;
    docked.push({ key: win || bar, win, reply: !!(win && win.dataset.qmThread), title: (text($(".aYF", bar)) || "New message").replace(/^new message$/i, "New message"),
      restore: () => press($('[aria-label="Maximize" i], [aria-label^="Exit full screen" i]', bar)), close: () => press($('[aria-label^="Save & close" i]', bar)) });
  }
  for (const dlg of $$('.nH.Hd[role="dialog"]')) {
    if (!visible(dlg) || dlg.dataset.qmClosing) continue;
    const minimized = isMinimized(dlg);
    if (minimized) {
      dlg.dataset.qmMin = "1";
      const title = text($(".qm-wtitle", dlg)) || "New message";
      docked.push({ key: dlg, win: dlg, reply: !!dlg.dataset.qmThread, title, restore: () => press(gmailBtn(dlg, "button.Hl, [aria-label='Maximize' i], [aria-label='Minimize' i]")), close: () => press(gmailBtn(dlg, "button.Ha, [aria-label^='Save & close' i]")) });
      continue;
    }
    if (minimizing.has(dlg)) { docked.push({ key: dlg, win: dlg, reply: !!dlg.dataset.qmThread, title: minimizing.get(dlg), going: true, restore: () => {}, close: () => {} }); continue; }
    if (dlg.dataset.qmMin && !dlg.dataset.qmGone) delete dlg.dataset.qmMin;
    if (!dlg.dataset.qmGone) writing = true;
    if (!dlg.dataset.qmSeen && !morph) { dlg.dataset.qmSeen = "1"; dlg.classList.add("qm-new"); setTimeout(() => dlg.classList.remove("qm-new"), 400); }
    // (only once this page knows it's the account the message is moving to: a window that opened before that
    // would otherwise be passed over, and the message never put in)
    if (!dlg.dataset.qmThread && !dlg.dataset.qmFilled) {
      const md = store.get("moving-draft", null), lc = linkCompose();
      if (md && md.toAcct === accountEmail()) { dlg.dataset.qmFilled = "1"; fillMovedDraft(dlg); }
      else if (lc) { dlg.dataset.qmFilled = "1"; session.set("link-compose", ""); fillLinked(dlg, lc); }
    }
    let head = $(":scope > .qm-whead", dlg);
    const gTitle = text($(".aYF", dlg)) || "New message";
    if (!head) {
      const btn = (sel) => $$(sel, dlg).find((b) => !b.closest(".qm-whead")); // Gmail's own, not Umbra's look-alikes
      const full = ib("grow", "Full size", () => toggleFull(dlg, btn("button.Hq, [aria-label^='Full screen' i], [aria-label^='Exit full screen' i]")), "qm-s");
      // which account it's from; a new message can move to another of your accounts from here
      const acct = accounts.length > 1 ? h("button", { type: "button", class: "qm-wacct", title: "Sending from " + accountEmail(), onclick: (e) => draftAccounts(dlg, e.currentTarget) }, h("i"), h("span", { text: accountLabel(accountEmail()) }), icon("down")) : null;
      head = h("div", { class: "qm-whead" }, h("span", { class: "qm-wtitle" }), acct,
        aiOn() ? ib("write", "Write with AI (⌘J)", () => openWriteBar(dlg), "qm-s") : null,
        ib("min", "Minimize", () => minimizeWindow(dlg), "qm-s"), full,
        ib("x", "Close and keep draft", () => closeWindow(dlg), "qm-s"));
      dlg.prepend(head);
      makeDraggable(head, dlg);
      dlg.qmRo = new ResizeObserver(() => { if (!enabled) return; if (dlg.closest(".aSt")) fitFull(dlg); else { fitWindow(dlg); clampWindow(dlg); } });
      dlg.qmRo.observe(dlg);
      head.addEventListener("dblclick", (e) => { if (!e.target.closest("button")) minimizeWindow(dlg); });
    }
    // full screen: the button says (and shows) the way back
    const isFull = !!dlg.closest(".aSs, .aSt");
    const fb = $(':scope > .qm-whead [aria-label="Full size"], :scope > .qm-whead [aria-label="Exit full size"]', dlg);
    if (fb && fb.dataset.full !== String(isFull)) {
      const label = isFull ? "Exit full size" : "Full size";
      fb.dataset.full = String(isFull);
      fb.replaceChildren(icon(isFull ? "shrink" : "grow"));
      fb.setAttribute("aria-label", label);
      fb.title = label;
    }
    decorateAttachments(dlg);
    const tab = $("table.aoP", dlg);
    if (dlg.qmRo && tab && dlg.qmTab !== tab) { dlg.qmRo.observe(tab); dlg.qmTab = tab; }
    if (isFull) fitFull(dlg);
    else { dlg.style.removeProperty("--qm-fullbody"); fitWindow(dlg); clampWindow(dlg); }
    for (const ed of $$(".editable[spellcheck='false']", dlg)) ed.setAttribute("spellcheck", "true");
    const tEl = $(".qm-wtitle", head);
    // Gmail swaps its title for "Draft saved" now and then; keep the subject
    const subject = (($("input.aoT, input[name='subjectbox']", dlg) || {}).value || "").trim();
    const want = dlg.dataset.qmTitle && /^(new message|draft (saving|saved))/i.test(gTitle) ? dlg.dataset.qmTitle : /^draft (saving|saved)/i.test(gTitle) ? subject || tEl.textContent || "New message" : /^new message$/i.test(gTitle) ? subject || "New message" : gTitle;
    if (tEl.textContent !== want) tEl.textContent = want;
  }
  ROOT.classList.toggle("qm-writing", writing);
  ROOT.classList.toggle("qm-tucked", tucked);
  renderDock(docked);
  watchWindows();
}
/* Send from another account: Gmail keeps each account on its own page, so the message moves. Umbra keeps
   what you wrote (recipients, subject, text) until it's in a new message on the other account's page; this
   one is let go. A reply stays with its conversation (that's where it belongs); attachments stay put too. */
function draftAccounts(dlg, anchor) {
  if (dlg.dataset.qmThread) { toast("A reply goes from the account its conversation is in."); return; }
  const me = accountEmail();
  openMenu(anchor, accounts.map((a) => ({ label: (a.email === me ? "✓  " : "     ") + accountLabel(a.email) + (accountLabel(a.email).toLowerCase() === a.email.toLowerCase() ? "" : " · " + a.email), run: () => { if (a.email !== me) moveDraft(dlg, a); } })));
}
const draftField = (dlg, re) => {
  const inp = $$("input", dlg).find((i) => re.test(i.getAttribute("aria-label") || ""));
  if (!inp) return [];
  const box = inp.closest(".afx") || inp.parentElement;
  const list = $$("[data-hovercard-id], [email]", box).map((c) => c.getAttribute("data-hovercard-id") || c.getAttribute("email"));
  if (inp.value.trim()) list.push(...inp.value.split(/[,;]/).map((x) => x.trim()));
  return [...new Set(list.filter((x) => x && /@/.test(x)))];
};
async function moveDraft(dlg, a) {
  if (uploadingAnywhere()) { toast("A file is still uploading. Move this once it's done."); return; }
  if ($$(".dL", dlg).length) { toast("Attachments can't move to another account. Remove them, or send this from " + accountLabel(accountEmail()) + "."); return; }
  const ed = $(".editable", dlg);
  const body = ed ? ed.cloneNode(true) : null;
  if (body) for (const x of body.querySelectorAll(".gmail_signature, .gmail_signature_prefix, [data-smartmail='gmail_signature'], .gmail_quote, .gmail_quote_container")) x.remove();
  // (it moves as words: pictures can't, links keep their address in brackets, list items their bullet, and
  // formatting is asked about first)
  if (body && body.querySelector("img")) { toast("Pictures in the message can't move to another account. Remove them, or send this from " + accountLabel(accountEmail()) + "."); return; }
  if (body) {
    for (const a of body.querySelectorAll("a[href]")) { const href = a.getAttribute("href") || "", t = a.textContent.trim(); if (/^(https?:|mailto:)/i.test(href) && t && t !== href && t !== href.replace(/^mailto:/i, "")) a.append(" (" + href.replace(/^mailto:/i, "") + ")"); }
    for (const li of body.querySelectorAll("li")) li.prepend("• ");
  }
  if (body && body.querySelector("b, strong, i, em, u, s, font, h1, h2, h3, blockquote, [style*='color'], [style*='font-size'], [style*='font-weight']")) {
    const ok = await confirmBox({ title: "Move it as plain text?", body: ["Bold, colours and other formatting don't move between accounts. The words do, with links and lists kept as text."], ok: "Move as plain text", cancel: "Keep it here" });
    if (!ok || !dlg.isConnected) return;
  }
  const draft = { to: draftField(dlg, /^to recipients/i), cc: draftField(dlg, /^cc recipients/i), bcc: draftField(dlg, /^bcc recipients/i),
    subject: (($("input[name='subjectbox']", dlg) || {}).value || "").trim(), text: body ? editableText(body) : "", from: accountEmail(), toAcct: a.email, at: Date.now(),
    rect: dlg.closest(".aSt") ? null : rectOf(restBox(dlg)) };
  store.set("moving-draft", draft);
  // the message stays on screen, as it is, while it moves (the window itself goes at once)
  movingCard(draft);
  dlg.dataset.qmGone = "1";
  dlg.dataset.qmClosing = "1";
  const discard = gmailBtn(dlg, '[aria-label^="Discard draft" i]');
  if (discard && (draft.text || draft.subject || draft.to.length)) { hushToast(/discard/i, 4000); press(discard); }
  else press(gmailBtn(dlg, "button.Ha, [aria-label^='Save & close' i]"));
  leaveTo(`/mail/u/${a.index}/#inbox?compose=new`, { list: "#inbox" }, () => previewList(a, "#inbox"));
}
/* a message a link asked for (Gmail's full-page "new message", already addressed), which the page it opened in
   handed to this one: for this account, from the last minute or two */
function linkCompose() {
  let d = null;
  try { d = JSON.parse(session.get("link-compose") || "null"); } catch (e) { d = null; }
  if (!d || !d.link || Date.now() - d.at > 2 * 60 * 1000) return null;
  if (d.email ? accountEmail() && d.email !== accountEmail() : d.u != null && d.u !== accountIndex()) return null;
  return d;
}
/* the window Gmail opened for it: filled in out of sight, then out it comes */
async function fillLinked(dlg, d) {
  dlg.dataset.qmGone = "1";
  try { await fillWindow(dlg, d, true); } finally {
    if (dlg.isConnected) { delete dlg.dataset.qmGone; unframe(dlg); reveal(dlg, null); }
  }
}
/* a new message, already addressed (a mailto: link in an email, a link to Gmail's full-page new message, a person's
   card): the window opens with it all filled in. d: { to, cc, bcc, subject, text } */
function composeTo(d) {
  return compose(Object.assign({ to: [], cc: [], bcc: [], subject: "", text: "" }, d));
}
/* in an email (or anywhere in Umbra), a link that writes to someone opens a window here, as Gmail's own would */
document.addEventListener("click", (e) => {
  if (!enabled || !e.isTrusted || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target && e.target.closest && e.target.closest("a[href]");
  if (!a || !a.closest('[id^="qm-"]') || a.closest('.nH.Hd[role="dialog"], .ip')) return;
  const d = composeLink(a.href || a.getAttribute("href"));
  if (!d || wp().linkCompose === false) return;
  if (d.email ? d.email !== accountEmail() : d.u != null && d.u !== accountIndex()) return; // (another account's: its own page)
  e.preventDefault();
  e.stopImmediatePropagation();
  hideLink();
  composeTo(d);
}, true);
/* puts who it's to, the subject and the words into a new message's window, as typing would. With `place`, the
   cursor then goes where you'd start: who it's to, else the subject, else the end of the words. */
async function fillWindow(dlg, d, place) {
  if (!(await until(() => $("input[name='subjectbox']", dlg) && $(".editable", dlg), 8000, 50))) return false;
  const findIn = (re) => $$("input", dlg).find((i) => re.test(i.getAttribute("aria-label") || "") && visible(i));
  // Gmail folds the recipient lines into one "Recipients" line while you're elsewhere: open it
  if (!findIn(/^to recipients/i)) { const row = $$(".aoD.hl", dlg).find(visible); if (row) { row.focus(); if (!(await until(() => findIn(/^to recipients/i), 600, 30))) press(row); } await until(() => findIn(/^to recipients/i), 1500, 40); }
  const put = async (re, list, label) => {
    if (!list || !list.length) return;
    let inp = findIn(re);
    if (!inp && label) {
      const t = $$('[role="link"], span', dlg).find((x) => label.test(text(x)) && !x.closest(".qm-whead") && visible(x));
      if (t) press(t);
      inp = await until(() => findIn(re), 1500, 40);
    }
    if (!inp) return;
    inp.focus();
    document.execCommand("insertText", false, list.join(", ") + ", ");
    await wait(120);
  };
  await put(/^to recipients/i, d.to);
  await put(/^cc recipients/i, d.cc, /^cc$/i);
  await put(/^bcc recipients/i, d.bcc, /^bcc$/i);
  const subj = $("input[name='subjectbox']", dlg);
  if (subj && d.subject) { subj.focus(); document.execCommand("selectAll"); document.execCommand("insertText", false, d.subject); }
  // the words go in as typing would (Gmail allows no pasted-in HTML from scripts)
  const ed = $(".editable", dlg);
  if (ed && d.text) {
    ed.focus();
    const sel = window.getSelection(), range = document.createRange();
    range.setStart(ed, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    d.text.replace(/\r/g, "").split("\n").forEach((line, i) => { if (i) document.execCommand("insertParagraph"); if (line) document.execCommand("insertText", false, line); });
  }
  if (place) {
    const to = findIn(/^to recipients/i);
    if (!(d.to || []).length && !(d.cc || []).length && !(d.bcc || []).length && to) to.focus();
    else if (!d.subject && subj) subj.focus();
    else if (ed && !d.text) {
      // at the start of the message (above your signature), as Gmail puts it
      ed.focus();
      const sel = window.getSelection(), range = document.createRange();
      range.setStart(ed, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else if (ed) ed.focus(); // (just after the words that came with it)
  }
  return true;
}
/* here, the message that moved from another account goes into the new message Gmail opened */
let moveFilling = false;
async function fillMovedDraft(dlg) {
  const d = store.get("moving-draft", null);
  if (!d || moveFilling || d.toAcct !== accountEmail() || Date.now() - d.at > 10 * 60 * 1000) return;
  moveFilling = true;
  dlg.dataset.qmGone = "1"; // filled in out of sight (the stand-in shows the message meanwhile)
  movingCard(d);
  try {
    if (!(await fillWindow(dlg, d))) { toast("Couldn't put your message in here yet. It's kept: open a new message to try again."); return; }
    store.set("moving-draft", null);
    movingDone(dlg);
    delete dlg.dataset.qmGone;
    toast("Moved here from " + accountLabel(d.from) + ".");
  } finally {
    moveFilling = false;
    if (dlg.dataset.qmGone) { delete dlg.dataset.qmGone; movingDone(dlg); } // (whatever happened, the window is there)
  }
}

/* Gmail's minimized window: its body hidden (not merely small: a window Gmail is still building is small too) */
function bodyHidden(dlg) {
  const body = [...dlg.children].find((k) => k.classList.contains("nH") && !k.classList.contains("aXJ"));
  return !!body && getComputedStyle(body).display === "none";
}
const isMinimized = (dlg) => !dlg.dataset.qmGone && !dlg.closest(".aSs") && bodyHidden(dlg);

/* "•••" in a writing window shows the quoted text, and now hides it again */
document.addEventListener("click", (e) => {
  const t = enabled && e.isTrusted && e.target.closest && e.target.closest(".ajR");
  const win = t && t.closest('.nH.Hd[role="dialog"], .ip.qm-float');
  if (!win) return;
  const box = $(".editable", win);
  if (box && $(".gmail_quote, .gmail_quote_container", box)) { e.preventDefault(); e.stopPropagation(); win.classList.toggle("qm-hidequote"); }
}, true);

/* =================================================================== writing with AI
   ⌘J (or the pen in a window's header) asks for a draft: written from scratch, from a reply idea,
   or by improving what's already typed, in the reader's own voice. */
const shownWindow = (d) => visible(d) && !d.dataset.qmMin && !d.dataset.qmGone && !d.dataset.qmClosing && !isMinimized(d);
function writeWindow(from) {
  const w = from && from.closest && from.closest(".ip.qm-float, .nH.Hd[role='dialog']");
  return w || $(".ip.qm-float:not(.qm-tucked)") || $$(".nH.Hd[role='dialog']").find(shownWindow) || null;
}
/* the text of a message being written, with its line breaks */
function editableText(root) {
  let out = "";
  const walk = (n) => {
    for (const k of n.childNodes) {
      if (k.nodeType === 3) out += k.nodeValue;
      else if (k.nodeType === 1) {
        if (k.tagName === "BR") { out += "\n"; continue; }
        const block = /^(DIV|P|LI|BLOCKQUOTE|H\d|UL|OL|TABLE|TR|PRE)$/.test(k.tagName);
        if (block && out && !out.endsWith("\n")) out += "\n";
        walk(k);
        if (block && out && !out.endsWith("\n")) out += "\n";
      }
    }
  };
  walk(root);
  return out.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
/* anything of yours in a reply or a window: words, a file, or a picture you pasted (quoted mail and the signature
   don't count). What decides whether closing it keeps a draft, and whether it can be set aside. */
function hasContent(w) {
  if (!w) return false;
  const ed = $(".editable", w);
  if (ed && ownText(ed).trim()) return true;
  if ($$(".dL, .dQ", w).length) return true;
  return !!ed && $$("img", ed).some((img) => !img.closest(".gmail_quote, .gmail_quote_container, .gmail_signature, [data-smartmail='gmail_signature'], .adL"));
}
function ownText(box) {
  const c = box.cloneNode(true);
  for (const q of c.querySelectorAll(".gmail_quote, .gmail_quote_container, .adL, blockquote, .gmail_signature, .gmail_signature_prefix, button, [role=button], .jKzJCd, [contenteditable=false]")) q.remove();
  return editableText(c);
}
function putText(box, body, replace) {
  box.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  const quote = Array.from(box.children).find((e) => e.matches(".gmail_quote, .gmail_quote_container, .adL, .gmail_signature, .gmail_signature_prefix") || $(".gmail_quote, .gmail_quote_container", e));
  const first = box.firstElementChild;
  if (replace) { range.setStart(box, 0); if (quote) range.setEndBefore(quote); else range.setEnd(box, box.childNodes.length); }
  else if (first && first !== quote && !first.textContent.trim()) range.setStart(first, 0);
  else range.setStart(box, 0);
  if (!replace) range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  if (replace && !range.collapsed) document.execCommand("delete");
  body.replace(/\r/g, "").split("\n").forEach((line, i) => {
    if (i) document.execCommand("insertParagraph");
    if (line) document.execCommand("insertText", false, line);
  });
}
function recipients(win) {
  return [...new Set($$(".afV [email], .agh [email], span[email]", win).map((e) => e.getAttribute("name") || text(e).replace(/<[^>]*>/, "").trim() || e.getAttribute("email")).filter(Boolean))].join(", ");
}
function writeBar(win) {
  let bar = $(":scope > .qm-aibar", win);
  if (bar) return bar;
  const input = h("input", { type: "text", placeholder: "What should it say?", "aria-label": "What should the draft say", autocomplete: "off", spellcheck: "false" });
  bar = h("div", { class: "qm-aibar" }, icon("write"), input, h("span", { class: "qm-dots", "aria-hidden": "true" }, h("i"), h("i"), h("i")));
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); const send = $$(".T-I.aoO, [role='button'][data-tooltip^='Send' i]", win).find(visible); if (send) press(send); }
    else if (e.key === "Enter") { e.preventDefault(); aiWrite(win, input.value.trim()); }
    else if (e.key === "Escape") { e.preventDefault(); bar.remove(); const box = $(".editable", win); if (box) box.focus(); }
  });
  const head = $(":scope > .qm-whead", win);
  if (head) head.after(bar); else win.prepend(bar);
  return bar;
}
function openWriteBar(win) {
  const bar = writeBar(win);
  const input = $("input", bar);
  setTimeout(() => input.focus(), 20);
}
/* in a window, Gmail's own "Help me write" writes straight into the message (free); otherwise Umbra's AI */
async function geminiInWindow(win, prompt) {
  const hmw = $('[aria-label^="Help me write" i]', win);
  if (!hmw) return false;
  const box = $(".editable", win);
  const askEl = await openPrompt(win, hmw);
  if (!askEl) return false;
  const before = geminiText(box);
  askEl.focus();
  document.execCommand("selectAll");
  document.execCommand("insertText", false, prompt);
  for (const t of ["keydown", "keypress", "keyup"]) askEl.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  let last = before, since = 0;
  const ok = await until(() => {
    const t = geminiText(box);
    if (t === before) return null;
    if (t !== last) { last = t; since = Date.now(); return null; }
    return Date.now() - since > 450;
  }, 25000, 100);
  box.focus();
  return !!ok;
}
async function aiWrite(win, instruction) {
  const box = $(".editable", win);
  if (!box) return;
  const bar = writeBar(win);
  if (bar.classList.contains("qm-busy")) return;
  bar.classList.add("qm-busy");
  const draft = ownText(box);
  const main = gmailMain();
  const t = main && $("h2.hP", main) && (win.classList.contains("ip") || win.dataset.qmThread === screen.key) ? readThread(main) : null;
  try {
    if (useGemini() && $('[aria-label^="Help me write" i]', win)) {
      if (draft) putText(box, "", true);
      const prompt = draft ? `Rewrite this email so it reads well, keeping my meaning and voice${instruction ? " (" + instruction + ")" : ""}: ${draft}` : instruction || "Write the reply this conversation needs, in my usual voice.";
      const wrote = await geminiInWindow(win, prompt);
      // (esc meanwhile: what you had comes back, not what Gemini wrote)
      if (!bar.isConnected) { if (wrote || draft) putText(box, draft, true); return; }
      if (wrote) { bar.remove(); return; }
      if (draft) putText(box, draft, true);
    }
    if (!ai.ready) { toast("Turn on AI in Umbra's settings."); return; }
    countAI();
    const res = await helper("/summarize", {
      kind: "draft", me: myName(), about: aboutText(), to: recipients(win), draft,
      instruction: instruction || (draft ? "Polish this draft." : "Write the reply this conversation needs."),
      subject: t ? t.subject : (($("input.aoT", win) || {}).value || ""),
      text: t ? threadText(t) : "",
    }, 60000);
    if (!bar.isConnected) return; // (esc meanwhile: nothing is written)
    if (res && res.text && ownText(box) !== draft) { toast("You kept writing, so the AI's version wasn't put in."); return; }
    if (res && res.text) { putText(box, res.text, !!draft); bar.remove(); }
  } catch (e) { toast(e.message || "Couldn't write that."); }
  finally { bar.classList.remove("qm-busy"); }
}
window.addEventListener("keydown", (e) => {
  if (!enabled || !e.isTrusted || introOn || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || (e.key || "").toLowerCase() !== "j") return;
  if (!aiOn() || document.getElementById("qm-panel-scrim")) return;
  if (e.target.closest && e.target.closest(".qm-composer")) return; // the message box handles its own
  const bar = e.target.closest && e.target.closest(".ip.qm-bar");
  if (bar && composerOf()) { e.preventDefault(); e.stopImmediatePropagation(); toggleComposerAI(composerOf()); return; }
  // (not in a window, in a conversation with its reply box showing: the box)
  const cc = composerOf(), inWin = e.target.closest && e.target.closest(".ip.qm-float, .nH.Hd[role='dialog']");
  if (!inWin && cc && cc.root.offsetParent && (screen.kind === "thread" || screen.kind === "reading")) { e.preventDefault(); e.stopImmediatePropagation(); toggleComposerAI(cc); return; }
  const win = writeWindow(e.target);
  if (win) { e.preventDefault(); e.stopImmediatePropagation(); openWriteBar(win); return; }
  const c = composerOf();
  if ((screen.kind === "thread" || screen.kind === "reading") && c && c.root.offsetParent) { e.preventDefault(); e.stopImmediatePropagation(); toggleComposerAI(c); }
}, true);
/* =================================================================== compose button */
function ensureFab() {
  if (document.getElementById("qm-fab")) return;
  document.body.appendChild(h("button", { id: "qm-fab", type: "button", "aria-label": "New message", "data-qmtip": "New message|compose", onclick: compose }, icon("plus")));
  keyHints();
}
function ensureGBack() {
  if (document.getElementById("qm-gback")) return;
  document.body.appendChild(h("button", { id: "qm-gback", type: "button", "aria-label": "Back to mail", title: "Back to mail", onclick: () => go("#inbox") }, icon("back")));
}
/* Gmail's Compose button, or, if that account's Gmail doesn't answer it, the ?compose=new address.
   The + button morphs into the new window. */
/* typing that starts before the new message's window is up goes into it, not to Gmail's shortcuts */
let composeKeys = null;
window.addEventListener("keydown", (e) => {
  if (!enabled || !composeKeys || !e.isTrusted || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!composeKeys.dlg && Date.now() - composeKeys.at > 4000) { composeKeys = null; return; } // (Gmail is slow: your keys are yours again)
  // the new message's field has the keyboard: what you typed on the way goes in first, and from this key on, every key
  // is Gmail's own (its suggestions see them, and Tab or Enter take the address you typed, not the next field)
  if (composeKeys.dlg && composeKeys.dlg.contains(e.target) && typing(e.target)) {
    const k = composeKeys;
    composeKeys = null;
    if (k.text) document.execCommand("insertText", false, k.text);
    k.text = "";
    return;
  }
  if (typing(e.target) && !(composeKeys.dlg && composeKeys.dlg.contains(e.target))) return;
  if (e.key.length !== 1 && e.key !== "Backspace") return;
  e.preventDefault();
  e.stopImmediatePropagation();
  composeKeys.text = e.key === "Backspace" ? composeKeys.text.slice(0, -1) : composeKeys.text + e.key;
}, true);
async function focusNewMessage(dlg, keys) {
  keys.dlg = dlg;
  const field = () => { const a = document.activeElement; return dlg.contains(a) && typing(a) ? a : null; };
  // Gmail puts the cursor in To itself once the window is ready; if it doesn't, do it
  if (!(await until(field, 500, 25))) {
    const a = document.activeElement;
    const to = $('input[aria-label^="To" i], textarea[name="to"]', dlg);
    if (to && (!a || a === document.body || !typing(a))) to.focus();
  }
  await wait(60);
  const f = field();
  if (keys.text && f) document.execCommand("insertText", false, keys.text);
}
function compose(fill) {
  const pre = fill && Array.isArray(fill.to) ? fill : null; // (as a button's onclick, it's handed the click)
  const keys = (composeKeys = { text: "", at: Date.now() });
  const before = new Set($$('.nH.Hd[role="dialog"]').filter(visible));
  const fab = document.getElementById("qm-fab");
  // the + button is there whenever the list is and no window is open (even while it's still fading back in,
  // or showing as the copy a window just went into)
  const fabThere = fab && visible(fab) && prefs.fab !== false && ROOT.classList.contains("qm-v-list") && !ROOT.classList.contains("qm-writing");
  const ctx = beginOpen(fabThere ? fab : null, "fab");
  ROOT.classList.add("qm-popping");
  let asked = 0;
  const fresh = () => $$('.nH.Hd[role="dialog"]').find((d) => !before.has(d) && visible(d));
  const ask = () => {
    asked++;
    const b = $('[gh="cm"]') || $$(".T-I, [role=button]").find((e) => /^compose$/i.test(text(e)));
    // Gmail's own Compose (however long it takes the first time); only where there's none, its address.
    // (Both at once, Gmail opens one minimized)
    if (b) press(b); else if (!/compose=/.test(location.hash)) location.hash = hashNow() + "?compose=new";
  };
  return settlePeek().then(async () => {
    ask();
    // Gmail now and then doesn't hear a press (just after it changed pages): if nothing has started, ask again
    // (not too soon: the first window after Gmail loads can take it a few seconds, and asked twice it opens one
    // minimized)
    const dlg = await until(fresh, 6000, 16);
    if (dlg) return dlg;
    if (!/[?&]compose=/.test(location.hash)) ask();
    return until(fresh, 12000, 16);
  }).then(async (dlg) => {
    if (!dlg) { if (composeKeys === keys) composeKeys = null; endOpen(ctx); ROOT.classList.remove("qm-popping"); return null; }
    // asked twice and Gmail heard both: the spare (still empty) goes
    if (asked > 1) setTimeout(() => {
      for (const d of $$('.nH.Hd[role="dialog"]')) {
        if (d === dlg || before.has(d) || $(".afV", d) || ($("input[name='subjectbox']", d) || {}).value || ownText($(".editable", d) || d).trim()) continue;
        press(gmailBtn(d, "button.Ha, [aria-label^='Save & close' i]"));
      }
    }, 1500);
    freshWindow(dlg);
    dlg.dataset.qmHome = "fab";
    if (pre) { dlg.dataset.qmFilled = "1"; if (composeKeys === keys) composeKeys = null; }
    else focusNewMessage(dlg, keys).finally(() => { if (composeKeys === keys) composeKeys = null; });
    await finishOpen(ctx, dlg, { place: (r) => windowSpot(null, "fab", { w: r.width, h: r.height }), fill: pre ? () => fillWindow(dlg, pre, true) : null });
    ROOT.classList.remove("qm-popping");
    return dlg;
  }).catch(() => { endOpen(ctx); ROOT.classList.remove("qm-popping"); for (const d of $$("[data-qm-gone]")) if (!d.dataset.qmClosing) { delete d.dataset.qmGone; unframe(d); } return null; });
}

/* =================================================================== going between accounts
   Gmail runs one account per page, so another account means loading a page. To keep that quick and
   quiet: drafts get a moment to save, Gmail's "Leave page?" question is skipped (Umbra only leaves on
   purpose), the destination is drawn at once from what that account showed last time, and the new page
   starts out dark and already showing it. */
let leaving = false;
window.addEventListener("beforeunload", (e) => { if (leaving) e.stopImmediatePropagation(); }, true);
const savingNow = () => $$('.nH.Hd[role="dialog"], .ip.adB').some((w) => $$(".oG, .aYF, .aDg .aDh > span", w).some((x) => /saving/i.test(text(x))));
// a file still on its way into a message, anywhere on the page (leaving now would lose it, without Gmail's warning)
const uploadingAnywhere = () => $$('.nH.Hd[role="dialog"], .ip.adB').some((d) => visible(d) && uploading(d));
async function leaveTo(url, hint, preview) {
  if (uploadingAnywhere()) { toast("A file is still uploading. Switch once it's done, or it would be lost."); return false; }
  closeSide();
  closePalette();
  closeMenu();
  if (preview) preview();
  for (const d of $$('.nH.Hd[role="dialog"]')) if (visible(d) && !d.dataset.qmClosing && hasContent(d)) { const b = gmailBtn(d, "button.Ha, [aria-label^='Save & close' i]"); if (b) press(b); }
  if ($$(".ip.adB").some((ip) => visible(ip) && hasContent(ip))) await wait(Math.max(0, 1600 - (Date.now() - lastInput)));
  await wait(120);
  await until(() => !savingNow(), 3500, 80);
  session.set("arrive", JSON.stringify(Object.assign({ at: Date.now() }, hint || {})));
  leaving = true;
  location.assign(url);
  setTimeout(() => { leaving = false; }, 6000); // still here (the load was cancelled): Gmail may ask again
}
function arrival() {
  try {
    const a = JSON.parse(session.get("arrive") || "null");
    return a && Date.now() - a.at < 60000 ? a : null;
  } catch (e) { return null; }
}
/* the other account's list, drawn here from what it last showed, while its page loads */
function previewList(acct, folder) {
  const box = store.get(boxKey(acct.email, folder), null);
  const rows = box ? box.rows.slice(0, 60).map((r) => Object.assign({ account: acct }, r)) : [];
  setScreen("preview", acct.email + folder, () => {
    const brief = h("section", { class: "qm-brief", "aria-label": "What matters" });
    const kept = aiOn() && prefs.brief && isInboxFolder(folder) && briefOn(acct.email) ? keptBrief(acct.email, acct) : null;
    if (kept) fillBrief(brief, kept);
    const list = h("div", { class: "qm-rows" + (prefs.avatars ? " qm-avs" : "") });
    let last = "";
    for (const r of rows) { const d = dayLabel(r.time); if (d !== last) { list.appendChild(h("div", { class: "qm-day", text: d })); last = d; } list.appendChild(streamRow(r, false)); }
    if (!rows.length) list.appendChild(h("div", { class: "qm-loading" }, h("i"), h("i"), h("i")));
    return h("div", {}, h("div", { class: "qm-scroll" }, h("div", { class: "qm-inbox" }, h("h1", { class: "qm-title", text: folderTitle(folder) }), brief, list)), h("div", { class: "qm-fade" }));
  });
  ROOT.classList.add("qm-v-list");
}
function switchAccount(a) {
  if (a === "all") {
    setEverything(true);
    if (route().kind !== "list" && baseHash(hashNow()) !== DONE_HASH) go(currentFolder());
    return;
  }
  if (a.index === accountIndex()) { setEverything(false); if (route().kind !== "list") go(currentFolder()); return; }
  session.set("everything", "");
  const folder = currentFolder();
  leaveTo(`/mail/u/${a.index}/${folder}`, { list: folder }, () => previewList(a, folder));
}
/* open a conversation that belongs to another account (from Everything) */
function openElsewhere(r) {
  const o = { id: r.id, subject: r.subject, from: whoText(r), single: !r.count };
  leaveTo(`/mail/u/${r.account.index}/${threadHash(everyFolder, r.id, r.account.email)}`, { opening: o }, () => { opening = Object.assign({ at: Date.now() + 60000 }, o); renderOpening(); });
}
/* before Gmail is ready: what this page is about to show, from memory */
const LIST_HASH = /^#(inbox|starred|snoozed|sent|drafts|all|imp|scheduled|spam|trash|category\/|label\/|search\/-in)/;
function renderEarly(r) {
  if (!enabled) return;
  const a = arrival();
  if (isThreadHash(r.hash)) {
    if (a && a.opening && !opening) opening = Object.assign({}, a.opening, { at: Date.now() + 60000 });
    if (opening) renderOpening();
    return;
  }
  if (!LIST_HASH.test(r.hash.split("?")[0])) return;
  ROOT.classList.add("qm-v-list");
  renderStream(r, everything && accounts.length > 1);
}

/* =================================================================== the action bar (⌘K)
   Switch account, start a message from any account, or open a draft: type a few letters, press Enter. */
let palette = null;
const draftsOf = (acct) => {
  const box = store.get(boxKey(acct.email, "#drafts"), null);
  return box ? box.rows.slice(0, 20).map((r) => Object.assign({ account: acct }, r)) : [];
};
function paletteItems() {
  const me = accountIndex();
  const multi = accounts.length > 1;
  const list = paletteSelected();
  const sw = (email) => { const i = h("i", { class: "qm-sw" }); i.style.background = acctColor(email) || "var(--text-5)"; return i; };
  const onPill = () => h("span", { class: "qm-pal-onpill", text: "On" });
  if (multi) {
    const allOn = everything;
    list.push({ section: "Accounts", label: "Everything", keys: "all accounts together", ico: icon("everything"), hint: allOn ? "Current" : "", run: () => switchAccount("all") });
    for (const a of accounts) list.push({ section: "Accounts", label: accountLabel(a.email), sub: accountLabel(a.email).toLowerCase() === a.email.toLowerCase() ? "" : a.email, ico: sw(a.email), hint: !allOn && a.index === me ? "Current" : acctCount(a), run: () => switchAccount(a) });
  }
  for (const f of FILTERS) {
    if (f.when && !f.when()) continue;
    const isOn = filters.has(f.id);
    list.push({ section: "Filters", label: f.label, keys: f.sub, ico: icon(f.ico), hint: isOn ? onPill() : "", on: isOn, keep: true, run: () => setFilter(f.id, !isOn) });
  }
  if (gemOn() && gp().piles) {
    const counts = new Map();
    for (const r of streamRows(true)) { const g = gemFor(r); if (g && g.category) counts.set(g.category, (counts.get(g.category) || 0) + 1); }
    for (const [cat, n] of [...counts].sort((a, b) => b[1] - a[1])) {
      const id = "cat:" + cat, isOn = filters.has(id);
      const dot = h("i", { class: "qm-sw" });
      dot.style.background = GEM_HUES[cat] || "var(--text-5)";
      dot.style.borderRadius = "50%";
      list.push({ section: "Piles", label: cat, keys: "pile category sorted gemini", ico: dot, hint: isOn ? onPill() : String(n), on: isOn, keep: true, quiet: true,
        run: () => { for (const x of [...filters]) if (x.startsWith("cat:")) filters.delete(x); setFilter(id, !isOn); } });
    }
  }
  if (filters.size) list.push({ section: "Filters", label: "Show all", keys: "clear filters off", ico: icon("x"), hint: "esc", keep: true, run: clearFilters });
  list.push({ section: "Write", label: "New message", sub: multi ? "From " + accountLabel(accountEmail()) : "", keys: "compose", ico: icon("write"), hint: keyLabel(keyFor("compose")), run: () => compose() });
  if (multi) for (const a of accounts) if (a.index !== me) list.push({ section: "Write", label: "New message from " + accountLabel(a.email), keys: "compose " + a.email, ico: sw(a.email), hint: "", run: () => leaveTo(`/mail/u/${a.index}/#inbox?compose=new`, { list: "#inbox" }, () => previewList(a, "#inbox")) });
  // everything the menu has
  const here = baseHash(hashNow());
  for (const [label, hash, ico, , run] of folderLinks()) {
    const cur = run ? screen.kind === "paper" : hash === "#inbox" ? screen.kind !== "paper" && /^#inbox(\/p\d+)?$/.test(hashNow()) : here === hash;
    list.push({ section: "Go to", label, keys: "folder", ico: icon(ico), hint: cur ? "Current" : run ? "" : folderCount(hash), run: run || (() => { if (paperOn && hash === "#inbox") closePaper(); go(hash); }) });
  }
  const seen = new Set();
  for (const a of $$('.aeN a[href*="#label/"]')) {
    const href = a.getAttribute("href");
    const hash = href.slice(href.indexOf("#"));
    const name = !seen.has(hash) && folderTitle(hash);
    seen.add(hash);
    if (name) list.push({ section: "Go to", label: name, keys: "label", ico: icon("labels"), hint: "", quiet: true, run: () => go(hash) });
  }
  for (const [label, hash, ico] of [["Important", "#imp", "labels"], ["Scheduled", "#scheduled", "later"], ["Chats", "#chats", "ai"], ["Spam", "#spam", "archive"], ["Trash", "#trash", "trash"]]) list.push({ section: "Go to", label, keys: "folder", ico: icon(ico), hint: "", quiet: true, run: () => go(hash) });
  // your Google account, which Gmail's own header (hidden) holds
  list.push({ section: "Accounts", label: "Add another account", keys: "google sign in add account", ico: icon("people"), hint: "", quiet: true, run: () => openUrl("https://accounts.google.com/AddSession?continue=" + encodeURIComponent(location.origin + "/mail/")) });
  list.push({ section: "Accounts", label: "Manage your Google Account", keys: "google account profile security password", ico: icon("people"), hint: "", quiet: true, run: () => openUrl("https://myaccount.google.com/?authuser=" + accountIndex()) });
  list.push({ section: "Accounts", label: "Sign out of all accounts", keys: "google log out logout sign out", ico: icon("x"), hint: "", quiet: true, run: () => confirmBox({ title: "Sign out of all your Google accounts?", body: ["Gmail signs you out of every account in this browser."], ok: "Sign out" }).then((ok) => { if (ok) { leaving = true; location.assign("https://accounts.google.com/Logout?continue=" + encodeURIComponent(location.origin + "/mail/")); } }) });
  // in a conversation: what it can do, from here
  if ((screen.kind === "thread" || screen.kind === "reading") && gmailMain()) {
    const act = (label, keys, run) => list.push({ section: "This conversation", label, keys: "conversation " + keys, ico: icon("mailopen"), hint: "", run });
    act("Reply", "answer", () => replyBarAction("reply"));
    act("Reply all", "answer everyone", () => replyBarAction("all"));
    act("Forward", "send on", () => replyBarAction("forward"));
    if (gmailToolbar("7", ["Archive"])) act("Done", "archive", () => onThisThread(() => { const id = screen.key, subj = currentSubject(); if (press(gmailToolbar("7", ["Archive"]))) { dropRow(id, "done"); undoFor(id, "done", subj); } }));
    act("Later", "snooze", () => { const b = $("#qm-view .qm-bar.qm-right [aria-label='Later']:not(.qm-leaving *)"); if (b) threadLater(b); });
    act("More", "labels move to spam print mute filter", () => { const b = $("#qm-view .qm-bar.qm-right [aria-label='More']:not(.qm-leaving *)"); if (b) threadMore(b); });
  }
  list.push({ section: "Go to", label: "Find", keys: "search", ico: icon("find"), hint: keyLabel(keyFor("find")), quiet: true, run: () => openFind() });
  list.push({ section: "Go to", label: "Big files", sub: "Files over 10 MB: where your storage goes", keys: "large big files storage space attachments over 10 mb free up room", ico: icon("clip"), hint: "", quiet: true, run: () => { files.kind = "all"; files.from = null; files.large = true; goFiles(); } });
  if ((screen.kind === "thread" || screen.kind === "reading") && gmailMain()) {
    const t = readThread(gmailMain());
    const who = t.messages.slice().reverse().find((m) => !m.mine && m.email);
    if (who) { const nm = personName(who.email, who.name) || who.email; list.push({ section: "Go to", label: "All mail from " + nm, sub: who.email, keys: "sender from person everything", ico: icon("people"), hint: "", run: () => go(searchHash("from:" + who.email)) }); }
  }
  const drafts = [...draftsOf(accounts.find((a) => a.index === me) || { index: me, email: accountEmail() }), ...(multi ? accounts.filter((a) => a.index !== me).flatMap(draftsOf) : [])].sort((x, y) => y.time - x.time);
  for (const d of drafts.slice(0, 25)) list.push({ section: "Drafts", label: d.subject && d.subject !== "(no subject)" ? d.subject : "No subject", sub: [whoText(d).replace(/^draft,?\s*/i, ""), d.when].filter(Boolean).join(" · "), ico: icon("drafts"), hint: multi ? sw(d.account.email) : "", run: () => openDraft(d) });
  // settings: the pages, and the switches you'd reach for (when you type for them)
  list.push({ section: "Settings", label: "Settings", keys: "preferences options", ico: icon("settings"), hint: "", quiet: true, run: () => openPanel() });
  list.push({ section: "Settings", label: "Gmail settings", keys: "gmail options filters forwarding signature vacation", ico: icon("settings"), hint: "", quiet: true, run: () => go("#settings/general") });
  for (const [k, label, ico, keys] of [["calm", "Calm", "sun", "tides paper senders quiet title counts end"], ["writing", "Writing", "write", "templates promises considerate sending signature"], ["flags", "Flags", "settings", "about config advanced css every setting"], ["display", "Display", "display", "order pictures of people brief numbers counts reading whole conversations"], ["look", "Look", "image", "background picture wallpaper image photo accent theme color size spacing lines fonts reading width soft depth"], ["layout", "Layout", "menu", "menu side right left screen edge quick buttons rail account label dual view split"], ["colors", "Colors", "colors", "account colors people colors waiting on you"], ["people", "People", "people", "names pictures colors emoji contacts"], ["keys", "Shortcuts", "keys", "keyboard keys hotkeys"], ["gemini", "Gemini", "spark", "gemini studio flow sheet piles categories labels summaries deadlines"], ["ai", "AI", "ai", "gemini assistant models usage summaries brief"]])
    if (k !== "gemini" || aiOn()) list.push({ section: "Settings", label, keys: "settings " + keys, ico: icon(ico), hint: "", quiet: true, run: () => openPanel(k) });
  if (gemSheet() && aiOn()) {
    list.push({ section: "Settings", label: "Gemini's sheet", keys: "gemini sheet spreadsheet studio flow notes", ico: icon("spark"), hint: "", quiet: true, run: () => openUrl("https://docs.google.com/spreadsheets/d/" + gemSheet() + "/edit?authuser=" + gemAuthuser()) });
    list.push({ section: "Settings", label: "Gemini flows in Studio", keys: "gemini workspace studio flow automation", ico: icon("spark"), hint: "", quiet: true, run: () => openUrl("https://studio.workspace.google.com/u/" + gemAuthuser() + "/manage") });
  }
  list.push({ section: "Settings", label: "Shortcut sheet", keys: "keyboard keys help", ico: icon("keys"), hint: keyLabel(keyFor("keys")), quiet: true, run: () => openKeys() });
  list.push({ section: "Settings", label: "Welcome to Umbra", keys: "welcome introduction intro eclipse start tour sign in chatgpt", ico: icon("spark"), hint: "", quiet: true, run: () => intro(true) });
  list.push({ section: "Settings", label: "Plain Gmail in this tab", keys: "turn off umbra disable original gmail normal classic pause", ico: icon("x"), hint: "", quiet: true, run: () => plainGmail(true) });
  const bg = prefs.bg || {};
  const flip = (label, on, set, keys) => list.push({ section: "Settings", label, keys: "toggle setting " + (keys || ""), ico: icon("settings"), hint: on ? onPill() : "", on, quiet: true, run: () => { set(); savePrefs(); toast(label + (on ? " off." : " on.")); } });
  flip("Dual view", !!prefs.split, () => { prefs.split = !prefs.split; }, "split pane list and reading side by side");
  flip("Bright mode", isLight(), () => { prefs.theme = isLight() ? "dark" : "light"; }, "light theme white day dark mode");
  flip("Soft depth", !!prefs.soft, () => { prefs.soft = !prefs.soft; }, "neumorphism look shadows");
  flip("Lines between conversations", !!prefs.lines, () => { prefs.lines = !prefs.lines; }, "dividers rows");
  flip("Larger", prefs.size === "large", () => { prefs.size = prefs.size === "large" ? "normal" : "large"; }, "big size zoom");
  flip("Spacious", prefs.density === "spacious", () => { prefs.density = prefs.density === "spacious" ? "comfy" : "spacious"; }, "spacing roomy density");
  flip("Pictures of people", !!prefs.avatars, () => { prefs.avatars = !prefs.avatars; }, "avatars photos");
  flip("AI features", aiOn(), () => { prefs.ai = !aiOn(); refreshAI(false).then(() => invalidate(true)); }, "artificial intelligence gemini chatgpt assistant off on");
  if (aiOn()) {
    flip("Brief at the top of the inbox", !!prefs.brief, () => { prefs.brief = !prefs.brief; }, "summary notes");
    flip("Summaries", prefs.summaries !== "off", () => { prefs.summaries = prefs.summaries === "off" ? "auto" : "off"; }, "ai summarize");
  }
  flip("Menu on the right", prefs.side === "right", () => { prefs.side = prefs.side === "right" ? "left" : "right"; }, "side layout");
  flip("Menu at the screen edge", !!prefs.edge, () => { prefs.edge = !prefs.edge; }, "slide over edge layout");
  flip("Quick buttons", !!prefs.rail, () => { prefs.rail = !prefs.rail; }, "rail icons layout");
  if (gemOn() && gp().piles) {
    const pileFlip = (k, label, keys) => flip(label, !!gp()[k], () => { prefs.gem = Object.assign({}, prefs.gem, { [k]: !gp()[k] }); }, "piles categories gemini " + keys);
    pileFlip("pilesRail", "Piles under the menu button", "rail icons");
    pileFlip("pilesSide", "Piles in the menu", "sidebar side");
    pileFlip("counts", "Counts on piles", "numbers badges notifications new unread");
  }
  flip("Darken designed emails", !!prefs.darken, () => { prefs.darken = !prefs.darken; }, "dark newsletters");
  flip("Serif for reading", prefs.readFont === "serif", () => { prefs.readFont = prefs.readFont === "serif" ? "sans" : "serif"; }, "font reading");
  if (bg.kind === "image") flip("Picture behind emails", bg.read !== false, () => { prefs.bg = Object.assign({}, prefs.bg, { read: bg.read === false }); }, "background wallpaper reading");
  return list;
}
function score(item, q) {
  if (!q) return 1;
  const label = item.label.toLowerCase();
  const extra = " " + ((item.sub || "") + " " + item.section + " " + (item.keys || "")).toLowerCase();
  const wordAt = (hay, i) => i === 0 || !/[a-z0-9]/.test(hay[i - 1]);
  let s = 0, at = 0;
  for (const w of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    let i = label.indexOf(w);
    while (i > 0 && !wordAt(label, i)) { const n = label.indexOf(w, i + 1); if (n < 0) break; i = n; }
    if (i >= 0 && wordAt(label, i)) s += i === 0 ? 8 : 6; // the start of a word in its name
    else if (i >= 0 && w.length >= 3) s += 3; // inside a word of its name
    else if (extra.includes(" " + w) || new RegExp("[^a-z0-9]" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(extra)) s += 2; // a word it's known by
    else {
      // shorthand or a slip ("nwmsg", "stard"): the letters in order, from the start of a word in the
      // name and close together, so a few letters don't match everything
      let hit = false;
      if (w.length < 3) return 0;
      for (let st = label.indexOf(w[0]); st >= 0 && !hit; st = label.indexOf(w[0], st + 1)) {
        if (!wordAt(label, st)) continue;
        let j = st + 1;
        hit = true;
        for (const ch of w.slice(1)) { j = label.indexOf(ch, j); if (j < 0 || j - st > w.length * 2 + 2) { hit = false; break; } j++; }
      }
      if (!hit) return 0;
      s += 1;
    }
    at = Math.max(0, i);
  }
  return s - at / 1000;
}
let paletteBack = null;
function openPalette(focusSection) {
  if (palette) { closePalette(); return; }
  const a0 = document.activeElement;
  paletteBack = a0 && a0 !== document.body && !a0.closest("#qm-pal-scrim") ? a0 : null;
  closeSide();
  closeMenu();
  const input = h("input", { type: "text", placeholder: "Filter, switch account, write, or open a draft…", "aria-label": "Search actions", autocomplete: "off", spellcheck: "false" });
  const list = h("div", { class: "qm-pal-list", role: "listbox" });
  const panel = h("div", { id: "qm-pal", role: "dialog", "aria-label": "Actions" }, h("div", { class: "qm-pal-in" }, icon("find"), input, h("kbd", { text: "esc" })), list);
  const scrim = h("div", { id: "qm-pal-scrim" }, panel);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) closePalette(); });
  let items = [], active = 0;
  const draw = () => {
    const q = input.value.trim();
    items = [...paletteItems(), ...paletteMail(q)].map((it) => Object.assign(it, { s: score(it, q) })).filter((it) => it.s > 0 && (!it.quiet || (q && q.toLowerCase().split(/\s+/).every((w) => (it.label + " " + (it.sub || "") + " " + (it.keys || "")).toLowerCase().includes(w)))));
    if (q) items.sort((a, b) => b.s - a.s);
    // anything typed can be asked (first when it reads like a question)
    if (q && askReady()) {
      const it = { section: "Ask", label: "Ask: " + q, ico: icon("ai"), hint: "", run: () => openAsk(q) };
      if (isQuestion(q) || !items.length) items.unshift(it); else items.push(it);
    }
    active = Math.min(active, Math.max(0, items.length - 1));
    // opening on the account you're already in would do nothing: start on the next thing instead
    if (!q && !focusSection && active === 0 && items.length > 1 && items[0].hint === "Current") active = 1;
    if (!q && focusSection) { const i = items.findIndex((it) => it.section === focusSection && it.hint !== "Current"); if (i >= 0) active = i; focusSection = ""; }
    const out = [];
    let sec = "";
    items.forEach((it, i) => {
      if (!q && it.section !== sec) { sec = it.section; out.push(h("div", { class: "qm-pal-sec", text: sec })); }
      const row = h("div", { class: "qm-pal-item" + (i === active ? " qm-on" : "") + (it.on ? " qm-pal-checked" : ""), role: "option", "aria-selected": String(i === active) },
        h("span", { class: "qm-pal-ico" }, it.ico), h("span", { class: "qm-pal-t" }, h("b", { text: it.label }), it.sub ? h("small", { text: it.sub }) : null),
        it.hint ? h("span", { class: "qm-pal-hint" }, it.hint) : q ? h("span", { class: "qm-pal-tag", text: it.section }) : null);
      row.addEventListener("mousemove", () => { if (active !== i) { active = i; mark(); } });
      row.addEventListener("click", () => runItem(i));
      out.push(row);
    });
    if (!items.length) out.push(h("div", { class: "qm-pal-empty", text: "Nothing matches." }));
    list.replaceChildren(...out);
  };
  const mark = () => { $$(".qm-pal-item", list).forEach((el, i) => { el.classList.toggle("qm-on", i === active); el.setAttribute("aria-selected", String(i === active)); }); const on = $(".qm-pal-item.qm-on", list); if (on) on.scrollIntoView({ block: "nearest" }); };
  // filters switch on and off in place (the list behind shows the result); everything else closes the bar
  const runItem = (i) => {
    const it = items[i];
    if (!it) return;
    if (it.keep && screen.kind === "stream") { it.run(); draw(); input.focus(); setTimeout(() => { if (palette) input.focus(); }, 60); return; }
    closePalette();
    it.run();
  };
  input.addEventListener("input", () => { active = 0; draw(); askAhead(input.value); });
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) { e.preventDefault(); active = (active + 1) % Math.max(1, items.length); mark(); }
    else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) { e.preventDefault(); active = (active - 1 + items.length) % Math.max(1, items.length); mark(); }
    else if (e.key === "Enter") { e.preventDefault(); runItem(active); }
    else if (e.key === "Escape" || ((e.metaKey || e.ctrlKey || e.altKey) && isKey(e, "palette"))) { e.preventDefault(); closePalette(); }
  });
  document.body.appendChild(scrim);
  palette = { scrim, draw, input, back: paletteBack, at: hashNow() };
  draw();
  input.focus(); // at once: keys typed right after ⌘K must land here, not on the list's shortcuts
  // and again if anything takes it in the moments after (Gmail redrawing, a click still settling)
  const opened = Date.now();
  for (const ms of [10, 60, 160, 400]) setTimeout(() => { if (palette && palette.input === input && document.activeElement !== input && lastPointer < opened) input.focus({ preventScroll: true }); }, ms);
  // keep this account's drafts fresh (only while a list is showing, so nothing you're writing is touched; and once you
  // pause, so Gmail changing pages out of sight never slows what you type)
  const box = store.get(boxKey(accountEmail(), "#drafts"), null);
  if ((!box || Date.now() - box.at > 60000) && screen.kind === "stream") {
    const fresh = () => {
      if (!palette || palette.input !== input || screen.kind !== "stream") return;
      if (Date.now() - lastInput < 700) { setTimeout(fresh, 400); return; }
      peekFolder("#drafts").then(() => { if (palette) palette.draw(); });
    };
    setTimeout(fresh, 800);
  }
}
function closePalette() {
  if (!palette) return;
  const { scrim, back, at } = palette;
  palette = null;
  scrim.classList.add("qm-out");
  setTimeout(() => scrim.remove(), 130);
  // (unless what you chose took you somewhere, or put the keyboard somewhere, itself)
  setTimeout(() => {
    const a = document.activeElement;
    if (back && back.isConnected && visible(back) && (!a || a === document.body || scrim.contains(a)) && hashNow() === at) back.focus({ preventScroll: true });
  }, 0);
}
/* look at one of Gmail's folders out of sight for a moment (to read it), then come back */
async function peekFolder(folder) {
  if (!enabled || peeking || ghost || writingAnything()) return false;
  const back = hashNow();
  if (baseHash(back) === folder) { const m = mainList(folder); if (m && listReady(m)) publish(folder, readList(m), listPage(m), isOff(olderOf(m))); return true; }
  peeking = true;
  peekAbort = false;
  const before = listBefore();
  const release = holdTitle();
  try {
    location.replace(folder);
    const ok = await Promise.race([freshList(folder, before, 8000), until(() => peekAbort, 8000, 60)]);
    if (ok && !peekAbort) { const m = mainList(folder); if (m) publish(folder, readList(m), listPage(m), isOff(olderOf(m))); }
    return !!ok;
  } finally {
    // back where you were, unless you went somewhere else yourself meanwhile
    if (hashNow() !== back && baseHash(hashNow()) === folder) location.replace(back);
    release();
    goWaiting();
    setTimeout(() => { peeking = false; invalidate(true); }, 200);
  }
}
/* a draft opens the way Gmail opens it (a window, or its conversation), from any account */
async function openDraft(d) {
  if (d.account && d.account.index !== accountIndex()) {
    leaveTo(`/mail/u/${d.account.index}/#drafts`, { draft: d.id, list: "#drafts" }, () => previewList(d.account, "#drafts"));
    return;
  }
  const back = hashNow();
  peeking = true;
  let toThread = false, opened = null;
  try {
    if (baseHash(back) !== "#drafts") location.replace("#drafts");
    // Gmail's Drafts list, once it's really showing (not the list it was on before)
    const row = await until(() => { const m = mainList("#drafts"); const el = m && $(`[data-legacy-thread-id="${CSS.escape(String(d.id))}"]`, m); const tr = el && el.closest("tr.zA"); return tr && visible(tr) ? tr : null; }, 6000, 50);
    if (!row) { toast("Couldn't open that draft."); return; }
    const before = new Set($$('.nH.Hd[role="dialog"]'));
    press($(".xS", row) || row);
    const res = await until(() => $$('.nH.Hd[role="dialog"]').find((x) => !before.has(x) && x.isConnected) || (isThreadHash(hashNow()) ? "thread" : null), 6000, 30);
    toThread = res === "thread";
    if (res && res !== "thread") { res.dataset.qmGone = "1"; opened = res; } // out of sight until it's drawn
  } finally {
    if (!toThread && hashNow() !== back && baseHash(hashNow()) === "#drafts") location.replace(back);
    if (!toThread) goWaiting(); else waitingGo = "";
    setTimeout(() => { peeking = false; invalidate(true); }, toThread ? 0 : 150);
  }
  if (opened) { opened.dataset.qmHome = "draft"; await finishOpen(null, opened, { focus: (dd) => { const b = $(".editable", dd); if (b) focusEnd(b); } }); }
}
/* arrived with a draft to open (from another account's action bar) */
function openArrivedDraft() {
  const a = arrival();
  if (!a || !a.draft || baseHash(hashNow()) !== "#drafts") return;
  const row = liveRow(a.draft);
  if (!row) return;
  session.set("arrive", "");
  press($(".xS", row) || row);
}

/* =================================================================== drop files anywhere
   Over a conversation they're attached to your reply; anywhere else they start a new message. */
let dropShown = false, dropTimer = 0;
const hasFiles = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
const windowAt = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); return (el && el.closest('.nH.Hd[role="dialog"], .ip.qm-float')) || null; };
let dropWin = null;
const markDropWin = (w) => { if (dropWin && dropWin !== w) dropWin.classList.remove("qm-dropping"); dropWin = w; if (w) w.classList.add("qm-dropping"); };
function dropLabel() {
  const c = composerOf();
  if ((screen.kind === "thread" || screen.kind === "reading") && c && c.root.offsetParent && c.t) {
    const o = replyNames(c, c.t);
    return { kind: "reply", text: o.length ? "Attach to your reply to " + listNames(o.length > 4 ? [...o.slice(0, 3), o.length - 3 + " more"] : o) : "Attach to your reply" };
  }
  return { kind: "new", text: "Start a new message with these" };
}
function showDrop() {
  let el = document.getElementById("qm-drop");
  const lab = dropLabel();
  if (!el) { el = h("div", { id: "qm-drop", "aria-hidden": "true" }, h("div", { class: "qm-drop-in" }, icon("clip"), h("span"))); document.body.appendChild(el); }
  $("span", el).textContent = lab.text;
  if (!dropShown) { dropShown = true; requestAnimationFrame(() => el.classList.add("qm-on")); }
  clearTimeout(dropTimer);
  dropTimer = setTimeout(hideDrop, 180); // no dragover for a moment: the drag left the page
}
function hideDrop() {
  clearTimeout(dropTimer);
  dropShown = false;
  const el = document.getElementById("qm-drop");
  if (el) el.classList.remove("qm-on");
}
window.addEventListener("dragover", (e) => {
  if (!enabled || !hasFiles(e)) return;
  // over a writing window: it lights up, and Gmail takes the files itself (its own drop zone: as attachments, or a
  // picture dropped into the words goes in among them)
  const w = windowAt(e);
  if (w) { hideDrop(); markDropWin(w); clearTimeout(dropTimer); dropTimer = setTimeout(() => markDropWin(null), 180); return; }
  markDropWin(null);
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  showDrop();
}, true);
// (Gmail didn't claim a drag over its window: the drop is still allowed, and Umbra puts the files in)
window.addEventListener("dragover", (e) => {
  if (!enabled || !hasFiles(e) || e.defaultPrevented || !windowAt(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});
window.addEventListener("drop", (e) => {
  if (!enabled || !hasFiles(e)) return;
  hideDrop();
  if (windowAt(e)) return; // (Gmail's, below; Umbra only if Gmail lets it pass)
  markDropWin(null);
  e.preventDefault();
  e.stopPropagation();
  const files = Array.from(e.dataTransfer.files || []);
  if (!files.length) return;
  if (dropLabel().kind === "reply") attachToReply(files).then((ok) => { if (!ok) toast("Couldn't attach those."); });
  else compose().then((dlg) => { if (!dlg || !attachFiles(dlg, files)) toast("Couldn't attach those."); });
}, true);
window.addEventListener("drop", (e) => {
  if (!enabled || !hasFiles(e)) return;
  const w = windowAt(e);
  markDropWin(null);
  if (!w || e.defaultPrevented) return;
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files || []);
  if (files.length && !attachFiles(w, files)) toast("Couldn't attach those.");
});

/* =================================================================== Gmail's toasts
   ("Message sent · Undo", "Conversation archived · Undo"). Gmail draws them in a layer Umbra's screens
   cover, so Umbra shows the same toast on top, its buttons pressing Gmail's. */
function watchGmailToasts() {
  if (!enabled) return;
  for (const b of $$(".b8")) {
    if (b.dataset.qmWatch) continue;
    b.dataset.qmWatch = "1";
    new MutationObserver(() => syncToast(b)).observe(b, { attributes: true, attributeFilter: ["style", "class"], childList: true, subtree: true, characterData: true });
    syncToast(b);
  }
}
let hush = null;
const hushToast = (re, ms) => { hush = { re, until: Date.now() + ms }; };
function syncToast(b) {
  if (!enabled) return;
  const vh = $(".vh", b) || b;
  const shown = !/-10000/.test(b.getAttribute("style") || "") && !!text(vh) && !(hush && hush.until > Date.now() && hush.re.test(text(vh)));
  let t = document.getElementById("qm-gtoast");
  if (!shown) {
    if (gtoastGone && gtoastGone.b === b) gtoastGone = null;
    if (t && t.qmFor === b && !t.classList.contains("qm-out")) { t.classList.add("qm-out"); setTimeout(() => { if (t.classList.contains("qm-out")) t.remove(); }, 200); const mine = document.getElementById("qm-toast"); if (mine) mine.classList.remove("qm-above"); }
    return;
  }
  // after a send, Gmail's Undo is a role="alert" span, not a link
  const found = $$('[role="link"], [role="button"], a, [id^="link_"], .ag.a8k', vh).filter((x) => text(x) && !/^(close|dismiss)/i.test(x.getAttribute("aria-label") || ""));
  const acts = found.filter((x) => !found.some((y) => y !== x && y.contains(x)));
  let msg = text(vh);
  for (const a of acts) msg = msg.replace(text(a), "");
  msg = msg.replace(/\s+/g, " ").trim();
  const sig = msg + "|" + acts.map((a) => text(a)).join("|");
  if (t && t.qmFor === b && t.dataset.sig === sig && !t.classList.contains("qm-out")) return;
  if (gtoastGone && gtoastGone.b === b && gtoastGone.sig === sig) return; // (dismissed: until Gmail says something new)
  if (t) t.remove();
  const mine = document.getElementById("qm-toast");
  if (mine) mine.classList.add("qm-above"); // (Umbra's own note, if one is up, moves above Gmail's)
  const live = (label) => {
    const els = $$('[role="link"], [role="button"], a, [id^="link_"], .ag.a8k, span', $(".vh", b) || b).filter((x) => text(x) === label);
    return els.find((x) => !els.some((y) => y !== x && x.contains(y))) || null;
  };
  const tick = flourish() && /^(message|messages) sent\b|^sent\b/i.test(msg) ? icon("done") : null;
  if (tick) tick.classList.add("qm-gtick");
  t = h("div", { id: "qm-gtoast", role: "status" }, tick, h("span", { text: msg }), ...acts.map((a) => {
    const label = text(a);
    return h("button", { type: "button", onclick: () => {
      const target = (a.isConnected && a) || live(label);
      if (!target) return;
      press(target);
      if (/^undo$/i.test(label) && /sent/i.test(msg)) { pendingSends.clear(); invalidate(true); }
      const tt = document.getElementById("qm-gtoast");
      if (tt) { tt.classList.add("qm-out"); setTimeout(() => tt.remove(), 200); }
    } }, label);
  }));
  t.append(h("button", { type: "button", class: "qm-gx", "aria-label": "Dismiss", title: "Dismiss", onclick: () => {
    gtoastGone = { b, sig };
    const close = $$("[aria-label]", b).find((x) => /^(close|dismiss)/i.test(x.getAttribute("aria-label") || "") && visible(x));
    if (close) press(close);
    t.classList.add("qm-out");
    setTimeout(() => t.remove(), 200);
  } }, icon("x")));
  t.qmFor = b;
  t.dataset.sig = sig;
  document.body.appendChild(t);
}
let gtoastGone = null;

/* =================================================================== shortcuts (?) */
function openKeys() {
  if (document.getElementById("qm-keys-scrim")) return;
  const rows = (title, list) => h("section", {}, h("h3", { text: title }), ...list.map(([k, d]) => h("div", { class: "qm-krow" }, h("span", { text: d }), h("span", { class: "qm-kk" }, ...k.split(" ").map((x) => h("kbd", { text: x }))))));
  const mine = (where) => KEYS.filter((x) => x[3] === where && keyFor(x[0]) && x[0] !== "back").map((x) => [keyLabel(keyFor(x[0])).replace(/([⌘⌃⌥⇧])/g, "$1 ").trim(), keyWhat(x)]);
  const back = keyLabel(keyFor("back"));
  const panel = h("div", { id: "qm-keys", role: "dialog", "aria-label": "Keyboard shortcuts" },
    rows("Anywhere", mine("Anywhere")),
    rows("Lists", [["esc", "Clear filters"], ["↵", "Open"], ["⌘ click", "Select"], ["⇧ click", "Select a run"], ...mine("Lists")]),
    rows("Go to", [...chordsNow().map(([k, label]) => ["G " + k.toUpperCase(), label]), ...(TABS_KEEP_NUMBERS ? [] : [[MOD_KEY.trim() + " 1–9", "The menu's first nine places"]])]),
    rows("Conversations", [...mine("Conversations"), ["⌘ ↵", "Send"], ...(aiOn() ? [["⌘ J", "Write with AI"]] : []), [(back ? back + " " : "") + "esc", "Back"]]),
    h("button", { type: "button", class: "qm-keyedit", onclick: () => { close(); openPanel("keys"); } }, "Change shortcuts"));
  const scrim = h("div", { id: "qm-keys-scrim" }, panel);
  const close = () => { scrim.classList.add("qm-out"); setTimeout(() => scrim.remove(), 130); window.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape" || e.key === "?") { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(); });
  window.addEventListener("keydown", onKey, true);
  document.body.appendChild(scrim);
}

/* =================================================================== keyboard
   Every shortcut is yours to change (Settings › Shortcuts); wherever Umbra shows one, it shows yours. */
const KEYS = [
  // id, default, what it does, where
  ["palette", "⌘k", "Filter, switch account, write, ask", "Anywhere"],
  ["find", "/", "Find", "Anywhere"],
  ["compose", "c", "New message", "Anywhere"],
  ["menu", "\\", "Menu", "Anywhere"],
  ["keys", "?", "Shortcuts", "Anywhere"],
  ["settings", "⌘,", "Settings", "Anywhere"],
  ["undo", "⌘z", "Undo", "Anywhere"],
  ["down", "j", "Down (next conversation)", "Lists"],
  ["up", "k", "Up (previous conversation)", "Lists"],
  ["open", "o", "Open", "Lists"],
  ["done", "e", "Done", "Lists"],
  ["later", "h", "Later", "Lists"],
  ["star", "s", "Star", "Lists"],
  ["unread", "U", "Mark unread", "Lists"],
  ["read", "I", "Mark read", "Lists"],
  ["trash", "#", "Delete", "Lists"],
  ["select", "x", "Select", "Lists"],
  ["selDown", "J", "Select, and the next one", "Lists"],
  ["selUp", "K", "Select, and the one before", "Lists"],
  ["reply", "r", "Reply", "Conversations"],
  ["replyAll", "a", "Reply all", "Conversations"],
  ["forward", "f", "Forward", "Conversations"],
  ["back", "u", "Back", "Conversations"],
];
const BOTH = ["done", "down", "up"]; // in lists and in conversations
const keyWhat = (x) => (x[0] === "palette" && !aiOn() ? "Filter, switch account, write" : x[2]);
function keyFor(id) {
  const k = (prefs.keys || {})[id];
  if (typeof k === "string") return k;
  const d = KEYS.find((x) => x[0] === id);
  return d ? d[1] : "";
}
/* a key press as Umbra writes it: "c", "U" (with shift), "⌘k", "⌥⇧Enter" */
function keyOf(e) {
  let k = e.key || "";
  if (e.altKey && /^Key[A-Z]$/.test(e.code || "")) k = e.code.slice(3).toLowerCase(); // ⌥ makes letters into symbols on a Mac
  // (Caps Lock on: a letter is still the letter you meant; ⇧ is what makes one a capital)
  else if (/^[a-z]$/i.test(k) && !e.metaKey && !e.ctrlKey && !e.altKey && e.getModifierState && e.getModifierState("CapsLock")) k = e.shiftKey ? k.toUpperCase() : k.toLowerCase();
  // (a symbol your keyboard types with ⌥, like # or \ on many layouts: that symbol, as you see it)
  else if (e.altKey && !e.metaKey && !e.ctrlKey && k.length === 1 && !/[a-z0-9]/i.test(k) && /^(Digit\d|Minus|Equal|Bracket\w+|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote|IntlBackslash)$/.test(e.code || "")) return k;
  const mod = e.metaKey || e.ctrlKey || e.altKey;
  if (mod && k.length === 1) k = k.toLowerCase();
  else if (e.shiftKey && /^[a-z]$/.test(k)) k = k.toUpperCase(); // (some keyboards and tools send ⇧ with a small letter)
  if (k === " ") k = "Space";
  return (e.metaKey ? "⌘" : "") + (e.ctrlKey ? "⌃" : "") + (e.altKey ? "⌥" : "") + (e.shiftKey && (mod || k.length > 1) ? "⇧" : "") + k;
}
const KEY_NAMES = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Enter: "↵", Escape: "esc", Backspace: "⌫", Tab: "⇥", Space: "space", Delete: "⌦" };
function keyLabel(k) {
  if (!k) return "";
  const m = /^([⌘⌃⌥⇧]*)(.+)$/.exec(k);
  let key = m[2];
  const shift = key.length === 1 && key !== key.toLowerCase() ? "⇧" : "";
  key = KEY_NAMES[key] || (key.length === 1 ? key.toUpperCase() : key);
  return m[1] + shift + key;
}
const isKey = (e, id) => { const k = keyFor(id); return !!k && (keyOf(e) === k || (k[0] === "⌘" && keyOf(e) === "⌃" + k.slice(1))); };
/* show your keys wherever a key is shown */
function keyHints() {
  for (const el of document.querySelectorAll("[data-qmkey]")) { const t = keyLabel(keyFor(el.dataset.qmkey)); if (el.textContent !== t) el.textContent = t; }
  for (const el of document.querySelectorAll("[data-qmtip]")) {
    const [label, id] = el.dataset.qmtip.split("|");
    const k = keyLabel(keyFor(id));
    el.title = k ? label + " (" + k + ")" : label;
  }
}
const typing = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
function moveCursor(d) {
  const holder = $("#qm-view [data-order]:not(.qm-leaving *)");
  if (!holder) return;
  const n = holder.dataset.order ? holder.dataset.order.split(",").length : 0;
  if (!n) return;
  cursor = Math.max(0, Math.min(n - 1, (cursor < 0 ? (d > 0 ? -1 : n) : cursor) + d));
  cursorId = holder.dataset.order.split(",")[cursor] || "";
  invalidate(true);
  requestAnimationFrame(() => { const c = $("#qm-view .qm-cursor:not(.qm-leaving *)"); if (c) c.scrollIntoView({ block: "nearest" }); });
}
function cursorRow() {
  const holder = $("#qm-view [data-order]:not(.qm-leaving *)");
  if (!holder || cursor < 0) return null;
  const id = holder.dataset.order.split(",")[cursor];
  const r = gmailMain() && readRows(gmailMain()).find((x) => x.id === id);
  return r ? r.row : null;
}
/* Gmail moves focus when its view changes underneath us (a folder read out of sight, a search for the AI):
   the Umbra field you were typing in gets it back, and keys pressed in the moment before still go to it */
let lastPointer = 0, stolen = null, stolenAt = 0;
window.addEventListener("pointerdown", () => { lastPointer = Date.now(); stolen = null; }, true);
// back from another window or app with the ⌘K bar still up: its field has the keyboard again
window.addEventListener("focus", () => { if (palette && palette.input.isConnected) palette.input.focus({ preventScroll: true }); });
const ownField = (t) => typing(t) && !t.closest(".editable, .M9") && !!t.closest(OWN_UI);
function giveFocusBack() {
  const t = stolen;
  if (!t || !t.isConnected || !visible(t) || Date.now() - stolenAt > 2500) { stolen = null; return null; }
  const a = document.activeElement;
  if (a === t) return t;
  if (a && a !== document.body && a.closest && a.closest(OWN_UI)) { stolen = null; return null; }
  t.focus({ preventScroll: true });
  return document.activeElement === t ? t : null;
}
document.addEventListener("focusout", (e) => {
  const t = e.target;
  if (!enabled || !(peeking || aiPeeking) || !ownField(t) || Date.now() - lastPointer < 400) return;
  if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(OWN_UI)) return;
  stolen = t;
  stolenAt = Date.now();
  setTimeout(giveFocusBack, 0);
}, true);
window.addEventListener("keydown", (e) => {
  if (!enabled || !e.isTrusted || introOn || e.metaKey || e.ctrlKey || e.altKey || ownField(e.target)) return;
  // the ⌘K bar is up: whatever you type is for it, wherever the focus wandered
  const pal = palette && palette.input.isConnected && !palette.scrim.classList.contains("qm-out") ? palette.input : null;
  if (!stolen && !pal) return;
  let t = stolen ? giveFocusBack() : null;
  if (!t && pal) { pal.focus({ preventScroll: true }); t = document.activeElement === pal ? pal : null; }
  if (!t) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.key.length === 1) document.execCommand("insertText", false, e.key);
  else if (e.key === "Backspace") document.execCommand("delete");
  else t.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, code: e.code, shiftKey: e.shiftKey, bubbles: true, cancelable: true }));
}, true);
window.addEventListener("keydown", (e) => {
  if (!enabled || !e.isTrusted || introOn || !isKey(e, "palette")) return;
  if (document.getElementById("qm-panel-scrim") || document.getElementById("qm-confirm-scrim") || fileView) return;
  // a plain-key ⌘K stand-in must not fire while you type; in a message being written ⌘K is Insert link
  if (!(e.metaKey || e.ctrlKey || e.altKey) && typing(e.target)) return;
  if (e.target.closest && e.target.closest(".editable")) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  openPalette();
}, true);
window.addEventListener("keydown", (e) => {
  // (the welcome is up: its keys are its own, and nothing happens behind it)
  if (!enabled || !e.isTrusted || introOn || document.getElementById("qm-panel-scrim") || document.getElementById("qm-keys-scrim")) return;
  if (e.isComposing || e.keyCode === 229) return; // (an input method choosing a character: its keys)
  if (document.getElementById("qm-confirm-scrim")) return; // a question is being asked: its own keys (esc says no)
  if (fileView) return; // a file is open over everything: its own keys
  if (catchFindAhead(e)) return;
  if (chordKey(e)) return; // "g", then where to go
  const kid = keyOf(e);
  const is = (id) => isKey(e, id); // (⌘ shortcuts answer to Ctrl too, off a Mac)
  const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  const mod = e.metaKey || e.ctrlKey || e.altKey;
  if (mod && !KEYS.some(([id]) => id !== "palette" && is(id))) return;
  const k = mod ? "" : e.key;
  // (esc in the reply bar: out of it, and the bar folds away if nothing's written)
  if (k === "Escape" && e.target.closest && e.target.closest(".ip.qm-bar")) { e.preventDefault(); e.stopImmediatePropagation(); e.target.blur(); const sl = barSlot(); if (sl) sl.qmAside(); return; }
  // (esc in a message being written is Gmail's: it closes the suggestions under To, or a menu of its own)
  if (k === "Escape" && e.target.closest && e.target.closest('.nH.Hd[role="dialog"], .ip.qm-float')) return;
  if (k === "Escape") {
    if (palette) { e.preventDefault(); e.stopImmediatePropagation(); closePalette(); return; }
    if (menu) { e.preventDefault(); e.stopImmediatePropagation(); const a = menu.anchor; closeMenu(); if (a.isConnected) a.focus({ preventScroll: true }); return; }
    // the AI writing a reply: esc stops that (wherever the focus went meanwhile), it doesn't leave the conversation
    const wc = composerOf();
    if (wc && wc.aiRun) { e.preventDefault(); e.stopImmediatePropagation(); toggleComposerAI(wc, false); return; }
    const wbar = $(".qm-aibar.qm-busy");
    if (wbar) { e.preventDefault(); e.stopImmediatePropagation(); wbar.remove(); return; }
    if (popups().length) return; // one of Gmail's menus or dialogs is open: it closes itself
    if (ROOT.classList.contains("qm-side-open")) { closeSide(); e.stopImmediatePropagation(); return; }
    if (askOn) { exitAsk(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (findMode || findPending || screen.kind === "find") { exitFind(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (fileView) return; // the open file closes itself
    if (ROOT.classList.contains("qm-mfull-on") && !typing(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); closeFullMsg(); return; }
  }
  if (is("settings")) { stop(); if (document.getElementById("qm-panel-scrim")) return; openPanel(); return; }
  // "/" in a message is a slash, not Gemini's "Help me write"
  if (k === "/" && e.target.closest && e.target.closest(".editable")) { e.stopImmediatePropagation(); return; }
  if (typing(e.target) || document.getElementById("qm-panel-scrim")) return;
  // (in a menu or a dialog, Umbra's or Gmail's, or a window being written: arrows and letters are theirs; and
  // Space on a button you've tabbed to presses it)
  if (k !== "Escape" && e.target.closest && (e.target.closest('.qm-menu, [role="menu"], [role="listbox"], [role="dialog"], .nH.Hd') || (k === " " && e.target.closest("button, a[href], [role=button]")))) return;
  const kind = screen.kind;
  // replying from a message open full screen happens in the conversation, under it
  if (ROOT.classList.contains("qm-mfull-on") && (is("reply") || is("replyAll") || is("forward"))) closeFullMsg(true);
  if (is("find")) { stop(); openFind(); return; }
  if (is("keys")) { stop(); openKeys(); return; }
  if (is("menu")) { stop(); if (ROOT.classList.contains("qm-side-open")) closeSide(); else openSide(true); return; }
  if (ROOT.classList.contains("qm-side-open")) return; // (the menu is open: its keys, nothing done to the list behind it)
  if (view && view.hidden) return;
  if (is("compose")) { stop(); compose(); return; }
  // a key you moved elsewhere does nothing now (rather than whatever Gmail would do with it)
  if (!mod && KEYS.some(([id, d]) => d === kid) && !KEYS.some(([id]) => is(id))) { stop(); return; }
  if (kind === "files" && k === "Escape") { stop(); if (files.picked.size) { files.picked.clear(); invalidate(true); } else goBack(); return; }
  // (Enter on a button you've tabbed to is that button, not the conversation under the cursor)
  if (k === "Enter" && e.target !== document.body && e.target.closest && e.target.closest("button, a[href], [role=button], [role=link], [role=checkbox], [tabindex]")) return;
  if (kind === "stream") {
    if (k === "Escape" && chosen.size) { stop(); clearChosen(); return; }
    if (k === "Escape" && filters.size) { stop(); clearFilters(); return; }
    // (one just put away is still in the list until it's drawn again: the next one is meant)
    let item = cursor >= 0 ? (cursorId && everyList.find((x) => x.id === cursorId)) || everyList[cursor] : null;
    if (item) cursor = everyList.indexOf(item);
    for (let i = cursor; item && gone.has(item.id) && i < everyList.length - 1;) item = everyList[++i];
    if (item && gone.has(item.id)) item = null;
    const rowAt = () => (item && $(`#qm-view .qm-rows .qm-row[data-id="${CSS.escape(item.id)}"]:not(.qm-leaving *)`)) || null;
    // another account's mail (Everything) goes through that account's own tab, as its buttons do
    const act = (kindOf, el, anchor) => (item.account && item.account.index !== accountIndex() ? rowDoThere(item, kindOf, el) : rowDo(item, kindOf, el, anchor));
    // with anything selected, these do it to all of them
    const bulk = chosen.size ? (is("done") ? "done" : is("trash") ? "trash" : is("star") ? ([...chosen.values()].every((r) => r.starred) ? "unstar" : "star") : is("read") ? "read" : is("unread") ? "unread" : "") : "";
    if (bulk) { stop(); bulkDo(bulk); }
    else if (is("selDown") || kid === "⇧ArrowDown") { stop(); chooseOn(1); }
    else if (is("selUp") || kid === "⇧ArrowUp") { stop(); chooseOn(-1); }
    else if (is("down") || k === "ArrowDown") { stop(); moveCursor(1); }
    else if (is("up") || k === "ArrowUp") { stop(); moveCursor(-1); }
    else if ((k === "Enter" || is("open")) && item) { stop(); openStreamRow(item); }
    else if (is("done") && item) { stop(); act("done", rowAt()); }
    else if (is("trash") && item) { stop(); act(everyFolder === "#drafts" ? "discard" : "trash", rowAt()); }
    else if (is("star") && item) { stop(); act("star", rowAt()); }
    else if ((is("unread") || is("read")) && item) { stop(); if (is("unread") !== !!item.unread) act("read", rowAt()); }
    else if (is("later") && chosen.size) { const b = $('#qm-view .qm-selbar [aria-label^="Later" i]:not(.qm-leaving *)'); stop(); if (b) bulkPicker(["Snooze"], ["Snooze"], b); }
    else if (is("later") && item) { const b = rowAt() && $('[aria-label^="Later" i]', rowAt()); stop(); if (b) act("later", rowAt(), b); }
    else if (is("select") && item) { stop(); choose(item); }
    // (no cursor yet: these do nothing, rather than Gmail doing them to whichever row it has chosen)
    else if (LIST_KEYS.some(is) || k === "Enter") stop();
    // (any other letter: Gmail, with its shortcuts on, would do it to whichever conversation it has chosen
    // out of sight: ! would report it as spam)
    else if (k.length === 1 && !KEYS.some(([id]) => is(id))) stop();
  } else if (kind === "find") {
    // (the highlighted result: left to Gmail, these keys would act on Gmail's own first row)
    const holder = $("#qm-view [data-order]:not(.qm-leaving *)");
    const id = holder && cursor >= 0 ? holder.dataset.order.split(",")[cursor] || "" : "";
    const item = id && !gone.has(id) ? findList.rows.find((x) => x.id === id) : null;
    if (is("down") || k === "ArrowDown") { stop(); moveCursor(1); }
    else if (is("up") || k === "ArrowUp") { stop(); moveCursor(-1); }
    else if (k === "Enter" || is("open")) { const r = cursorRow(); if (r) { stop(); openRow(r); } }
    else if (is("done") || is("trash") || is("star") || is("read") || is("unread") || is("later") || is("select")) {
      stop();
      if (!item) return;
      if (is("done")) rowDo(item, "done", null);
      else if (is("trash")) rowDo(item, "trash", null);
      else if (is("star")) rowDo(item, "star", null);
      else if (is("unread") !== !!item.unread && !is("later") && !is("select")) rowDo(item, "read", null);
    } else if (!mod && k.length === 1 && !KEYS.some(([id]) => is(id))) stop(); // (not Gmail's own results underneath)
  } else if (kind === "thread" || kind === "reading") {
    const c = composerOf();
    // (a message open full screen: back, or ←, closes it, and you're in the conversation where you were)
    if (ROOT.classList.contains("qm-mfull-on") && (is("back") || k === "ArrowLeft")) { stop(); closeFullMsg(); }
    else if (k === "Escape" || is("back")) { stop(); goBack(); }
    else if (is("done") && (lookBusy() || gmailToolbar("7", ["Archive"]))) { stop(); onThisThread(() => { const b = gmailToolbar("7", ["Archive"]), id = screen.key, subj = currentSubject(); if (b && press(b)) { dropRow(id, "done"); undoFor(id, "done", subj); } }); }
    // (done here, not left to Gmail's own shortcuts: those are off unless you turned them on in Gmail)
    else if (is("trash") && (lookBusy() || gmailToolbar("10", ["Delete"]))) { stop(); onThisThread(() => { const b = gmailToolbar("10", ["Delete"]), id = screen.key, subj = currentSubject(); if (b && press(b)) { dropRow(id, "trash"); undoFor(id, "trash", subj); } }); }
    else if (is("later")) { const b = $("#qm-view .qm-bar.qm-right [aria-label='Later']:not(.qm-leaving *)"); if (b) { stop(); threadLater(b); } }
    else if (is("unread") && (lookBusy() || gmailToolbar("2", ["Mark as unread"]))) { stop(); onThisThread(() => { const b = gmailToolbar("2", ["Mark as unread"]), id = screen.key; if (b && press(b)) markUnreadHere(id); }); }
    else if (is("star") && (lookBusy() || starButton())) { stop(); toggleThreadStar(); }
    // r is Reply, a is Reply all, in the box under the conversation (as the buttons are), unless a window has it
    else if ((is("reply") || is("replyAll")) && c && !threadWindow()) { stop(); engage(c); openBar(is("reply") ? "reply" : "all"); }
    else if (is("reply")) { stop(); replyBarAction("reply"); }
    else if (is("replyAll")) { stop(); replyBarAction("all"); }
    else if (is("forward")) { stop(); replyBarAction("forward"); }
    // the next and previous conversation of the list you came from
    else if ((is("down") || is("up")) && (everyList.length || ROOT.classList.contains("qm-splitting"))) {
      const pool = ROOT.classList.contains("qm-splitting") ? paneRows() : everyList;
      const i = pool.findIndex((x) => x.id === screen.key);
      const next = i >= 0 ? pool[i + (is("down") ? 1 : -1)] : null;
      if (next) { stop(); openStreamRow(next); }
    }
  } else if (kind === "paper" && (k === "Escape" || is("back"))) { stop(); closePaper(); }
  else if (/^(todos|subs)$/.test(kind) && (k === "Escape" || is("back"))) { stop(); go("#inbox"); }
  else if (kind && !mod && (LIST_KEYS.some(is) || k === "Enter" || (k.length === 1 && !KEYS.some(([id]) => is(id))))) stop(); // Umbra's other pages (the paper, Files, Senders…): not Gmail's list underneath
}, true);
const LIST_KEYS = ["open", "done", "later", "star", "unread", "read", "trash", "select", "selDown", "selUp"];
/* Umbra's own text fields keep their keys: while a reply is opening, Gmail takes keypresses page-wide
   (and eats its shortcut letters, u, s, …), so they never reach Gmail at all */
const OWN_UI = "#qm-view, #qm-side, #qm-pal-scrim, #qm-panel-scrim, #qm-keys-scrim, .qm-menu, .qm-aibar";
window.addEventListener("keypress", (e) => {
  const t = e.target;
  if (enabled && typing(t) && !t.closest(".editable, .M9") && t.closest(OWN_UI)) e.stopImmediatePropagation();
}, true);
window.addEventListener("keypress", (e) => {
  if (!enabled || !e.isTrusted || typing(e.target) || e.metaKey || e.ctrlKey) return;
  if (e.key === keyFor("find") || e.key === keyFor("menu")) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

/* =================================================================== settings */
let panelPage = "display";
function openPanel(page) {
  closeMenu();
  closeSide();
  if (document.getElementById("qm-panel-scrim")) return;
  if (page) panelPage = page;
  const scrim = h("div", { id: "qm-panel-scrim" });
  const panel = h("div", { id: "qm-panel", role: "dialog", "aria-modal": "true", "aria-label": "Umbra settings" });
  scrim.appendChild(panel);
  const back = document.activeElement;
  const close = () => { if (scrim.classList.contains("qm-out")) return; keyRecorder = null; scrim.classList.add("qm-out"); setTimeout(() => { scrim.remove(); invalidate(true); if (back && back.isConnected && back !== document.body) back.focus({ preventScroll: true }); }, 150); };
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) close(); });
  const onKey = (e) => {
    if (!document.body.contains(scrim)) { window.removeEventListener("keydown", onKey, true); return; }
    if (!e.isTrusted) return;
    if (keyRecorder) { keyRecorder(e); return; } // setting a shortcut: this key is the answer
    if (document.getElementById("qm-confirm-scrim") || (e.target.closest && e.target.closest(".qm-peditor"))) return; // (a question of its own, or an editor that cancels on esc)
    if (e.key === "Escape") { e.stopImmediatePropagation(); close(); }
    else if (e.key === "Tab") {
      // (round and round inside Settings: never off into Gmail behind it)
      const all = $$('button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', panel).filter(visible);
      if (!all.length) return;
      const i = all.indexOf(document.activeElement);
      if (i < 0 || (e.shiftKey && i === 0) || (!e.shiftKey && i === all.length - 1)) { e.preventDefault(); e.stopImmediatePropagation(); (e.shiftKey ? all[all.length - 1] : all[0]).focus(); }
    }
    else if (!typing(e.target)) e.stopImmediatePropagation();
  };
  window.addEventListener("keydown", onKey, true);
  const nav = h("nav", { class: "qm-pnav", "aria-label": "Settings" });
  const body = h("div", { class: "qm-pbody" });
  const pages = { display: ["Display", "display", displayPage], look: ["Look", "image", lookPage], layout: ["Layout", "menu", layoutPage], colors: ["Colors", "colors", colorsPage], people: ["People", "people", peoplePage], calm: ["Calm", "sun", calmPage], writing: ["Writing", "write", writingPage], keys: ["Shortcuts", "keys", keysPage], flags: ["Flags", "settings", flagsPage], ...(aiOn() ? { gemini: ["Gemini", "spark", geminiPage] } : {}), ai: ["AI", "ai", aiPage] };
  if (!pages[panelPage]) panelPage = "display";
  const show = (k, keep) => {
    keyRecorder = null;
    const top = keep ? body.scrollTop : 0;
    panelPage = k;
    for (const b of $$("button[data-k]", nav)) b.setAttribute("aria-current", b.dataset.k === k ? "page" : "false");
    body.replaceChildren(pages[k][2](() => show(k, true)));
    body.scrollTop = top;
  };
  nav.append(h("div", { class: "qm-ptitle", text: "Settings" }),
    ...Object.entries(pages).map(([k, [label, ico]]) => h("button", { type: "button", "data-k": k, onclick: () => show(k) }, icon(ico), h("span", { text: label }))),
    h("div", { class: "qm-pver" }, h("span", { text: "Umbra Mail " + VERSION }), h("a", { href: "#settings/general", onclick: close }, "Gmail settings"),
      h("a", { href: "#", onclick: (e) => { e.preventDefault(); close(); plainGmail(true); } }, "Plain Gmail in this tab")));
  panel.append(nav, body, h("button", { type: "button", class: "qm-ib qm-s qm-pclose", "aria-label": "Close", onclick: close }, icon("x")));
  panel.addEventListener("scroll", () => { if (panel.scrollTop || panel.scrollLeft) panel.scrollTop = panel.scrollLeft = 0; });
  document.body.appendChild(scrim);
  show(panelPage);
  const here = $('button[aria-current="page"]', nav);
  if (here) here.focus({ preventScroll: true });
  refreshAI(true).then(() => { if (panelPage === "ai" && scrim.isConnected && !body.contains(document.activeElement)) show("ai", true); });
}
const openUrl = (url) => { if (typeof GM_openInTab === "function") GM_openInTab(url, { active: true, insert: true }); else window.open(url, "_blank", "noopener"); };
const agoText = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : new Date(t).toLocaleDateString(); };
/* Settings › Gemini: the Studio flow that reads your new mail, and what Umbra does with what it finds */
function geminiPage(redraw) {
  const G = gp();
  const set = (k, v) => { prefs.gem = Object.assign({}, prefs.gem, { [k]: v }); savePrefs(); redraw(); };
  const sw = (k, label, note) => {
    const input = h("input", { type: "checkbox", checked: !!G[k], disabled: k !== "on" && !G.on });
    input.addEventListener("change", () => set(k, input.checked));
    return h("label", { class: "qm-toggle" + (k !== "on" && !G.on ? " qm-off" : "") }, h("span", { class: "qm-tl" }, h("span", { text: label }), note ? h("small", { text: note }) : null), input, h("span", { class: "qm-switch", "aria-hidden": "true" }));
  };
  const id = gemSheet();
  const acct = gemAccount();
  const status = !id ? "Not connected yet: paste the link of the sheet your flow writes to."
    : gem.error ? gem.error
    : gem.at ? gem.rows.size.toLocaleString() + " conversations sorted · read " + agoText(gem.at)
    : "Reading the sheet…";
  const link = h("input", { type: "text", value: id ? "https://docs.google.com/spreadsheets/d/" + id : "", placeholder: "Link to the sheet your flow writes to", spellcheck: "false", autocomplete: "off", "aria-label": "Sheet link" });
  const save = () => {
    const nid = sheetId(link.value);
    if (link.value.trim() && !nid) { toast("That isn't a Google Sheets link."); return; }
    prefs.gemSheet = nid;
    prefs.gemAccount = nid ? acct || accountEmail() : "";
    flowSaved = nid ? { sheet: nid, account: prefs.gemAccount } : null;
    store.set("gem:flow", flowSaved);
    // (what the AI's settings last said counts too: cleared here, or the old sheet would still be read until it's asked again)
    ai.flow = { sheet: nid, account: prefs.gemAccount };
    savePrefs();
    helper("/config", { flow: { sheet: nid, account: prefs.gemAccount } }).catch(() => {});
    gem.at = 0; gem.sig = ""; gem.rows = new Map(); gem.error = "";
    gemFetch(true);
    redraw();
  };
  link.addEventListener("change", save);
  link.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); link.blur(); } });
  const btn = (label, fn) => h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: fn }, label);
  return h("div", {},
    h("p", { class: "qm-pnote qm-lead", text: "A Workspace Studio flow in your Google account has Gemini read each email as it arrives: a one-line summary, what kind of mail it is, what you need to do and by when, its priority, whether someone is waiting on you, and the one detail worth seeing. It keeps a row for each email in a sheet in your Drive and labels the email in Gmail. Umbra reads that sheet with your own sign-in. It's free, and done before you open anything." }),
    h("section", {}, h("h3", { text: "Connection" }),
      h("div", { class: "qm-prow" }, h("span", { class: "qm-tl" }, h("span", { text: id ? "Connected" : "Not connected" }), h("small", { text: status + (acct ? " · flow runs in " + (accounts.length > 1 ? accountLabel(acct) + " (" + acct + ")" : acct) : "") })),
        id ? btn("Read now", () => { gem.tried = 0; store.set("gem:data", null); gemFetch(true); setTimeout(redraw, 2500); }) : null),
      h("div", { class: "qm-field" }, link),
      h("div", { class: "qm-field" }, id ? btn("Open the sheet", () => openUrl("https://docs.google.com/spreadsheets/d/" + id + "/edit?authuser=" + gemAuthuser())) : null, btn("Open Studio", () => openUrl("https://studio.workspace.google.com/u/" + gemAuthuser() + "/manage")))),
    h("section", {}, h("h3", { text: "In Umbra" }),
      sw("on", "Use Gemini's notes", "Everything below. Off, Umbra ignores the sheet (the flow keeps running in Studio)."),
      sw("summaries", "Its line in lists", "Gemini's one sentence about each email, in place of the start of the text."),
      sw("piles", "Piles", "Mail sorted by what it is: People, School, Projects, Money… One click shows just that pile; again, everything. Also in ⌘K."),
      G.piles ? sw("pilesRail", "Piles under the menu button", "An icon for each pile, with how many are in it.") : null,
      G.piles ? sw("pilesSide", "Piles in the menu", "A Piles group under your folders.") : null,
      G.piles ? sw("counts", "Counts on piles", "How many unread emails in a pile you haven't looked at yet. Opening the pile clears it.") : null,
      sw("tags", "What it is, on each row", "A small colored dot before the subject, its kind on hover (not for mail from people)."),
      sw("due", "Deadlines", "When something is due: amber when it's close, red once it's late."),
      sw("key", "The detail worth seeing", "A code to copy, or a short figure (an amount, a number) at the end of the row."),
      sw("reply", "Waiting on you", "Mail Gemini says someone wants an answer to, until you (or anyone) reply."),
      sw("quiet", "Quieter low-priority mail", "Bulk mail, promotions and automatic notices fade back."),
      sw("notes", "To-dos in the notes", "What Gemini says you need to do goes at the top of the inbox, soonest deadline first."),
      sw("thread", "Its summary in conversations", "Gemini's line about the newest email, so Umbra's own AI isn't asked (saves your usage)."),
      sw("ideas", "Its suggested reply", "When someone's waiting on you, the reply Gemini wrote is ready in the box: a few words on the button, the whole reply when you use it.")),
    h("section", {}, h("h3", { text: "Gmail labels" }),
      h("p", { class: "qm-pnote", text: "The flow also labels mail in Gmail, so it's sorted on your phone too: To respond, Deadlines, School, Projects, Security, Receipts and invoices, Meeting update. Change them in Studio (Add labels with Gemini)." })));
}
/* Settings › Shortcuts: click one, press the keys you want */
let keyRecorder = null;
function keysPage(redraw) {
  const scope = (x) => (BOTH.includes(x[0]) || x[3] === "Anywhere" ? ["Lists", "Conversations"] : [x[3]]);
  const setKey = (id, k) => {
    const me = KEYS.find((x) => x[0] === id);
    const keys = Object.assign({}, prefs.keys);
    let took = "";
    // a key does one thing where you are: whatever had it lets go
    if (k) for (const x of KEYS) if (x[0] !== id && keyFor(x[0]) === k && scope(x).some((w) => scope(me).includes(w))) { keys[x[0]] = ""; took = x[2]; }
    keys[id] = k;
    for (const [kid, d] of KEYS) if (keys[kid] === d) delete keys[kid];
    prefs.keys = keys;
    savePrefs();
    redraw();
    if (took) toast(keyLabel(k) + " was for " + took + ". That one has no shortcut now.");
  };
  const record = (id, btn) => {
    if (keyRecorder) keyRecorder(null);
    btn.classList.add("qm-rec");
    btn.textContent = "Press keys…";
    keyRecorder = (e) => {
      if (!e) { btn.classList.remove("qm-rec"); btn.textContent = keyLabel(keyFor(id)) || "None"; return; }
      if (/^(Shift|Meta|Control|Alt|CapsLock|Fn|Dead|Unidentified)$/.test(e.key)) return; // still holding modifiers
      e.preventDefault();
      e.stopImmediatePropagation();
      keyRecorder = null;
      if (e.key === "Escape") { redraw(); return; }
      if ((e.key === "Backspace" || e.key === "Delete") && !(e.metaKey || e.ctrlKey || e.altKey)) { setKey(id, ""); return; }
      const k = keyOf(e);
      if (/^(g|Enter|Tab|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Space)$/.test(k)) { redraw(); toast(keyLabel(k) + " is taken: " + (k === "g" ? "it starts \u201cg, then a letter\u201d." : "lists and menus use it.") + " Pick another key."); return; }
      setKey(id, k);
    };
  };
  const sec = (where) => h("section", {}, h("h3", { text: where }), ...KEYS.filter((x) => x[3] === where).map((x) => {
    const [id, def] = x, what = keyWhat(x);
    const cur = keyFor(id);
    const btn = h("button", { type: "button", class: "qm-keybtn" + (cur ? "" : " qm-off"), "aria-label": what + ": " + (keyLabel(cur) || "no shortcut") + ". Change" }, keyLabel(cur) || "None");
    btn.addEventListener("click", () => record(id, btn));
    const back = cur !== def ? h("button", { type: "button", class: "qm-keyreset", title: "Back to " + keyLabel(def), onclick: () => setKey(id, def) }, "Reset") : null;
    return h("div", { class: "qm-prow" }, h("span", { class: "qm-tl" }, h("span", { text: what })), h("span", { class: "qm-keyctl" }, back, btn));
  }));
  const changed = Object.keys(prefs.keys || {}).length > 0;
  return h("div", {},
    h("p", { class: "qm-pnote qm-lead", text: "Click a shortcut, then press the keys you want. ⌫ turns one off, esc keeps it as it is." }),
    sec("Anywhere"), sec("Lists"), sec("Conversations"),
    changed ? h("div", { class: "qm-prow" }, h("span", { class: "qm-tl" }, h("span", { text: "All shortcuts" })), h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => { prefs.keys = {}; savePrefs(); redraw(); } }, "Reset all")) : null);
}
function toggleRow(label, keyName, note) {
  const input = h("input", { type: "checkbox", checked: !!prefs[keyName] });
  input.addEventListener("change", () => { prefs[keyName] = input.checked; savePrefs(); });
  return h("label", { class: "qm-toggle" }, h("span", { class: "qm-tl" }, h("span", { text: label }), note ? h("small", { text: note }) : null), input, h("span", { class: "qm-switch", "aria-hidden": "true" }));
}
function segRow(label, keyName, options, note) {
  const seg = h("div", { class: "qm-seg", role: "group", "aria-label": label });
  const draw = () => { for (const b of seg.children) b.setAttribute("aria-pressed", String(b.dataset.v === String(prefs[keyName]))); };
  for (const [l, v] of options) seg.appendChild(h("button", { type: "button", "data-v": v, onclick: () => { prefs[keyName] = v; savePrefs(); draw(); } }, l));
  draw();
  return h("div", { class: "qm-prow" }, h("span", { class: "qm-tl" }, h("span", { text: label }), note ? h("small", { text: note }) : null), seg);
}
function displayPage() {
  return h("section", {},
    h("h3", { text: "Lists" }),
    segRow("Order", "order", [["Newest", "date"], ["Unread first", "unread"], ["People first", "people"]]),
    toggleRow("Pictures of people", "avatars", "Photos or initials next to people. Automated mail gets none."),
    aiOn() ? toggleRow("Brief at the top of the inbox", "brief") : null,
    segRow("Numbers in the menu", "counts", [["New today", "today"], ["Unread", "unread"], ["None", "off"]], "“New today”: unread mail that came in today, instead of Gmail's running totals."),
    h("h3", { text: "Email" }),
    toggleRow("Title as you scroll", "scrollTitle", "Once an email's title has scrolled away, it stays small at the top. Off, nothing shows there."),
    toggleRow("Open whole conversations", "expand"),
    toggleRow("Darken designed emails", "darken"),
    toggleRow("Google side panel", "sidePanel"));
}
function rangeRow(label, keyName, min, max, step, fmt, note) {
  const out = h("span", { class: "qm-rangev", text: fmt(prefs[keyName]) });
  const input = h("input", { type: "range", min: String(min), max: String(max), step: String(step), value: String(prefs[keyName]), "aria-label": label });
  input.addEventListener("input", () => { out.textContent = fmt(Number(input.value)); prefs[keyName] = Number(input.value); applyLook(); });
  input.addEventListener("change", () => savePrefs());
  return h("div", { class: "qm-prow" }, h("span", { class: "qm-tl" }, h("span", { text: label }), note ? h("small", { text: note }) : null), h("div", { class: "qm-range" }, input, out));
}
/* a picture for the background: scaled to the screen and kept on this computer */
function readWallpaper(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 2560 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve({ url: c.toDataURL("image/jpeg", 0.84), w: c.width, h: c.height });
      };
      img.onerror = reject;
      img.src = fr.result;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
/* any colour: a rainbow wheel you click to open the system's picker (not mistaken for a swatch) */
function colorPicker(value, onPick, label, live) {
  const input = h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#7f9fd4", "aria-label": label });
  if (live) input.addEventListener("input", () => live(input.value));
  input.addEventListener("change", () => onPick(input.value));
  return h("label", { class: "qm-rainbow", title: label }, input);
}
/* the colours a picture is made of: bright ones for an accent, dark ones for the page beneath */
function pictureColors(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 56;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, 56, 56);
      let px;
      try { px = g.getImageData(0, 0, 56, 56).data; } catch (e) { resolve({ accents: [], bases: [] }); return; }
      const bins = new Map(), all = [0, 0, 0, 0];
      for (let i = 0; i < px.length; i += 4) {
        const [hh, ss, ll] = rgbHsl(px[i], px[i + 1], px[i + 2]);
        all[0] += px[i]; all[1] += px[i + 1]; all[2] += px[i + 2]; all[3]++;
        if (ss < 0.18 || ll < 0.12 || ll > 0.92) continue;
        const k = Math.round(hh / 15) % 24;
        const b = bins.get(k) || { w: 0, h: 0, s: 0, n: 0 };
        b.w += ss; b.h += hh; b.s += ss; b.n++;
        bins.set(k, b);
      }
      const picked = [];
      for (const [, b] of [...bins.entries()].sort((x, y) => y[1].w - x[1].w)) {
        const hue = b.h / b.n;
        if (picked.every((p) => Math.min(Math.abs(p.h - hue), 360 - Math.abs(p.h - hue)) > 24)) picked.push({ h: hue, s: b.s / b.n });
        if (picked.length >= 6) break;
      }
      const accents = picked.map((p) => hslHex(p.h, Math.max(0.38, Math.min(0.68, p.s)), 0.64));
      const [ah, as] = rgbHsl(all[0] / all[3], all[1] / all[3], all[2] / all[3]);
      const bases = [hslHex(ah, Math.min(as, 0.32), 0.075), ...picked.slice(0, 2).map((p) => hslHex(p.h, Math.min(p.s, 0.3), 0.08))];
      resolve({ accents, bases: [...new Set(bases)] });
    };
    img.onerror = () => resolve({ accents: [], bases: [] });
    img.src = url;
  });
}
function rgbHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh * 60, s, l];
}
function hslHex(hh, s, l) {
  const f = (n) => { const k = (n + hh / 30) % 12; const a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0"); };
  return "#" + f(0) + f(8) + f(4);
}
/* the picture, framed like your screen: drag it into place, scroll (or the slider) to zoom */
function bgEditor(redraw) {
  const url = store.get("bg-img", "");
  // its size first (a picture from an earlier version doesn't have it yet): then the editor works
  if (!(prefs.bg || {}).iw) { measureBg().then((ok) => { if (ok) redraw(); }); return h("div", { class: "qm-bgtool" }, h("div", { class: "qm-bgedit qm-bgwait" })); }
  const cur = () => Object.assign({ zoom: 1, x: 50, y: 50, dim: 0.6 }, prefs.bg);
  const pic = h("div", { class: "qm-bgpic" });
  const shade = h("div", { class: "qm-bgshade" });
  const mock = h("div", { class: "qm-bgmock", "aria-hidden": "true" }, ...[62, 48, 70, 40, 56, 66, 44].map((w) => { const l = h("i"); l.style.width = w + "%"; return l; }));
  const frame = h("div", { class: "qm-bgedit", title: "Drag to move it; pinch (or ⌘-scroll) or use the slider to zoom" }, pic, shade, mock);
  frame.style.aspectRatio = window.innerWidth + " / " + window.innerHeight;
  const fitZoom = () => { const b = cur(); if (!b.iw) return 1; const W = window.innerWidth, H = window.innerHeight; return Math.min(W / b.iw, H / b.ih) / Math.max(W / b.iw, H / b.ih); };
  const zoom = h("input", { type: "range", min: String(Math.max(0.3, fitZoom()).toFixed(2)), max: "4", step: "0.01", value: String(cur().zoom), "aria-label": "Zoom" });
  const paint = () => {
    const b = cur();
    const W = frame.clientWidth, H = frame.clientHeight;
    pic.style.backgroundImage = 'url("' + url + '")';
    if (b.iw && W) { const sz = bgSize(b.iw, b.ih, W, H, b.zoom); pic.style.backgroundSize = sz.w + "px " + sz.h + "px"; } else pic.style.backgroundSize = "cover";
    pic.style.backgroundPosition = b.x + "% " + b.y + "%";
    shade.style.background = "rgba(" + (hexRgb(themedBase(b.color, isLight())) || "15, 16, 18") + ", " + b.dim + ")";
  };
  let saveT = 0;
  const set = (patch, save) => {
    prefs.bg = Object.assign({}, prefs.bg, patch);
    paint();
    applyLook();
    clearTimeout(saveT);
    saveT = setTimeout(() => store.set("prefs3", prefs), save ? 0 : 400);
  };
  frame.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    e.preventDefault();
    frame.setPointerCapture(e.pointerId);
    frame.classList.add("qm-dragging");
    const b = cur(), W = frame.clientWidth, H = frame.clientHeight;
    const sz = b.iw ? bgSize(b.iw, b.ih, W, H, b.zoom) : { w: W, h: H };
    const start = { x: e.clientX, y: e.clientY, bx: b.x, by: b.y, ow: sz.w - W, oh: sz.h - H };
    const move = (ev) => set({
      x: start.ow > 1 ? Math.max(0, Math.min(100, start.bx - ((ev.clientX - start.x) / start.ow) * 100)) : 50,
      y: start.oh > 1 ? Math.max(0, Math.min(100, start.by - ((ev.clientY - start.y) / start.oh) * 100)) : 50,
    });
    const up = () => { frame.removeEventListener("pointermove", move); frame.removeEventListener("pointerup", up); frame.removeEventListener("pointercancel", up); frame.classList.remove("qm-dragging"); set({}, true); };
    frame.addEventListener("pointermove", move);
    frame.addEventListener("pointerup", up);
    frame.addEventListener("pointercancel", up);
  });
  frame.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return; // plain scrolling moves the page, as everywhere else
    e.preventDefault();
    const z = Math.max(Number(zoom.min), Math.min(4, cur().zoom * Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.0011)));
    zoom.value = String(z);
    set({ zoom: z });
  }, { passive: false });
  zoom.addEventListener("input", () => set({ zoom: Number(zoom.value) }));
  const btn = (label, fn) => h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: fn }, label);
  new ResizeObserver(paint).observe(frame);
  return h("div", { class: "qm-bgtool" }, frame,
    h("div", { class: "qm-bgctl" }, icon("find"), h("div", { class: "qm-range" }, zoom),
      btn("Fill", () => { zoom.value = "1"; set({ zoom: 1, x: 50, y: 50 }, true); }),
      btn("Fit", () => { const z = Math.max(Number(zoom.min), fitZoom()); zoom.value = String(z); set({ zoom: z, x: 50, y: 50 }, true); }),
      btn("Center", () => set({ x: 50, y: 50 }, true))));
}
function lookPage(redraw) {
  const bg = Object.assign({ kind: "none", color: "#0f1012", dim: 0.6 }, prefs.bg);
  const setBg = (patch) => { prefs.bg = Object.assign({ kind: "none", color: "#0f1012", dim: 0.6 }, prefs.bg, patch); savePrefs(); redraw(); };
  const kind = h("div", { class: "qm-seg", role: "group", "aria-label": "Background" }, [["Default", "none"], ["Color", "color"], ["Sky", "sky"], ["Picture", "image"]].map(([l, v]) => h("button", { type: "button", "aria-pressed": String(bg.kind === v), onclick: () => setBg({ kind: v }) }, l)));
  const theme = h("div", { class: "qm-seg", role: "group", "aria-label": "Theme" }, [["Dark", "dark"], ["Bright", "light"], ["Match system", "system"]].map(([l, v]) => h("button", { type: "button", "aria-pressed": String((prefs.theme || "dark") === v), onclick: () => { prefs.theme = v; savePrefs(); redraw(); } }, l)));
  const light = lightWanted();
  const sec = h("section", {}, h("h3", { text: "Theme" }), h("div", { class: "qm-prow" }, h("span", { class: "qm-tl" }, h("span", { text: "Mode" }), h("small", { text: "Bright is light pages and dark text; Match system follows your Mac." })), theme),
    h("h3", { text: "Background" }), h("div", { class: "qm-prow" }, h("span", { class: "qm-tl" }, h("span", { text: "Behind your mail" })), kind));
  const row = (label, note, ...ctl) => h("div", { class: "qm-prow" }, h("span", { class: "qm-tl" }, h("span", { text: label }), note ? h("small", { text: note }) : null), ...ctl);
  // the accent (this account's colour), right here: from the picture, or any colour
  const accentRow = (choices) => {
    const me = accountEmail();
    const now = acctColor(me) || (prefs.colors || {})[me] || "";
    const pick = (c) => { prefs.colors = Object.assign({}, prefs.colors, { [me]: c }); savePrefs(); renderAccounts(); redraw(); };
    const sw = h("div", { class: "qm-swatches" }, ...choices.map((c) => { const b = h("button", { type: "button", class: "qm-sw", "aria-label": c, "aria-pressed": String(now.toLowerCase() === c.toLowerCase()), onclick: () => pick(c) }); b.style.background = c; return b; }),
      colorPicker(now, pick, "Any color"));
    return row("Accent", accounts.length > 1 ? "The color of " + accountLabel(me) + ": its rows, the menu, the windows you write in." : "Shows once you're signed in to more than one account.", sw);
  };
  if (bg.kind === "sky") {
    const now = skyAt(Date.now(), bg.lat);
    sec.append(h("p", { class: "qm-pnote", text: "The sky as it is where you are, changing through the day: dawn, day, golden hour, dusk, and stars at night (" + now.phase + " now)." }),
      lookRange("Dim behind lists", "dim", bg.dim == null ? 0.6 : bg.dim, (v) => { prefs.bg = Object.assign({}, prefs.bg, { dim: v }); applyLook(); }, "How far the sky steps back behind your inbox."),
      accentRow(HUES));
  }
  if (bg.kind === "color") {
    const live = (v) => { prefs.bg = Object.assign({}, prefs.bg, { color: v }); applyLook(); };
    const tones = light ? ["#f4f3f0", "#eef1f6", "#f1eef6", "#edf3ef", "#f6f0ea", "#f2f2f2"] : ["#0f1012", "#12151c", "#141a26", "#17141f", "#101814", "#1a1512"];
    const cur = themedBase(bg.color, light);
    const sw = h("div", { class: "qm-swatches" }, ...tones.map((c) => { const b = h("button", { type: "button", class: "qm-sw", "aria-label": c, "aria-pressed": String((cur || "").toLowerCase() === c), onclick: () => setBg({ color: c }) }); b.style.background = c; return b; }),
      colorPicker(cur, (v) => setBg({ color: v }), "Any color", live));
    sec.append(row("Color", light ? "Pale colors keep text easiest to read; a dark one is shown as its own pale tone." : "Dark colors keep text easiest to read; a pale one is shown as its own dark tone.", sw), accentRow(HUES));
  }
  if (bg.kind === "image") {
    const file = h("input", { type: "file", accept: "image/*", hidden: true });
    const has = !!store.get("bg-img", "");
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      try {
        const pic = await readWallpaper(f);
        store.set("bg-img", pic.url);
        const cols = await pictureColors(pic.url);
        setBg({ iw: pic.w, ih: pic.h, zoom: 1, x: 50, y: 50, color: cols.bases[0] || bg.color, palette: cols });
      } catch (e) { toast("Couldn't read that picture."); }
    });
    sec.append(h("div", { class: "qm-field" }, h("button", { type: "button", class: "qm-btn" + (has ? " qm-quietbtn" : ""), onclick: () => file.click() }, has ? "Choose another picture" : "Choose a picture"),
      has ? h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => { store.set("bg-img", ""); setBg({ kind: "none" }); } }, "Remove") : null, file));
    if (has) {
      const pal = bg.palette || { accents: [], bases: [] };
      if (!bg.palette) pictureColors(store.get("bg-img", "")).then((cols) => { prefs.bg = Object.assign({}, prefs.bg, { palette: cols }); store.set("prefs3", prefs); redraw(); });
      const dimRange = (key, val, label, note) => {
        const r = h("input", { type: "range", min: "0", max: "1", step: "0.01", value: String(val), "aria-label": label });
        r.addEventListener("input", () => { prefs.bg = Object.assign({}, prefs.bg, { [key]: Number(r.value) }); applyLook(); const sh = $(".qm-bgshade"); if (sh && key === "dim") sh.style.background = "rgba(" + (hexRgb(themedBase(prefs.bg.color, isLight())) || "15, 16, 18") + ", " + r.value + ")"; });
        r.addEventListener("change", () => store.set("prefs3", prefs));
        return row(label, note, h("div", { class: "qm-range" }, r));
      };
      const shown = themedBase(bg.color, light);
      const baseSw = h("div", { class: "qm-swatches" }, ...[...pal.bases, "#0f1012"].map((c) => themedBase(c, light)).filter((c, i, a) => a.indexOf(c) === i).map((c) => { const b = h("button", { type: "button", class: "qm-sw", "aria-label": c, "aria-pressed": String((shown || "").toLowerCase() === c.toLowerCase()), onclick: () => setBg({ color: c }) }); b.style.background = c; return b; }),
        colorPicker(shown, (v) => setBg({ color: v }), "Any color"));
      sec.append(...[bgEditor(redraw),
        dimRange("dim", bg.dim == null ? 0.6 : bg.dim, "Dim behind lists", "How far the picture steps back behind your inbox, from not at all to all the way."),
        h("label", { class: "qm-toggle" }, h("span", { class: "qm-tl" }, h("span", { text: "Show it behind emails" }), h("small", { text: "The picture stays while you read, dimmed further so text stays easy to read." })),
          (() => { const i = h("input", { type: "checkbox", checked: bg.read !== false }); i.addEventListener("change", () => setBg({ read: i.checked })); return i; })(), h("span", { class: "qm-switch", "aria-hidden": "true" })),
        bg.read !== false ? dimRange("readDim", bg.readDim == null ? 0.82 : bg.readDim, "Dim behind emails", "Usually a little darker than behind lists.") : null,
        h("label", { class: "qm-toggle" }, h("span", { class: "qm-tl" }, h("span", { text: "Follow the time of day" }), h("small", { text: "Warmer at dawn and dusk, deeper at night, as the light outside is." })),
          (() => { const i = h("input", { type: "checkbox", checked: !!bg.daylight }); i.addEventListener("change", () => setBg({ daylight: i.checked })); return i; })(), h("span", { class: "qm-switch", "aria-hidden": "true" })),
        accentRow(pal.accents.length ? pal.accents : HUES),
        row("Base tone", "The page's own color under the picture; panels take it on too.", baseSw)].filter(Boolean));
    }
  }
  sec.append(h("h3", { text: "Surfaces" }),
    toggleRow("Soft depth", "soft", "Panels, ⌘K and the message box rise softly out of the page, lit from the top left, instead of sitting on it with a border and a shadow."),
    lookRange("Glass", "glass", prefs.glass || 0, (v) => { prefs.glass = v; applyFinish(); }, "Menus, ⌘K and settings let what's behind them show through, frosted."),
    lookRange("Grain", "grain", prefs.grain || 0, (v) => { prefs.grain = v; applyFinish(); }, "A fine film grain over everything, like a print."),
    toggleRow("Accent follows the account", "accentFollow", "The + button, switches and checks take this account's color."),
    segRow("Motion", "motion", [["As my Mac", "system"], ["Less", "reduced"], ["Full", "full"]], "Less: windows and panels appear without moving."),
    toggleRow("Flourishes", "flourish", "The little extras: sparks off a star, a reaction flying to its message, a check that draws itself when mail goes."),
    toggleRow("Sound when mail goes", "sendSound", "A soft whoosh as a message leaves."),
    segRow("Size", "size", [["Standard", "normal"], ["Larger", "large"]]),
    segRow("Spacing", "density", [["Compact", "compact"], ["Comfortable", "comfy"], ["Spacious", "spacious"]]),
    toggleRow("Lines between emails", "lines", "A fine line under each row in your lists."),
    segRow("Font", "uiFont", [["Instrument", "instrument"], ["System", "system"]], "System is your Mac's own (San Francisco)."),
    h("h3", { text: "Reading" }),
    rangeRow("Reading width", "readWidth", 640, 1200, 20, (v) => v + " px", "How wide emails and conversations are drawn."),
    segRow("Reading font", "readFont", [["Sans", "sans"], ["Serif", "serif"], ["Editorial", "editorial"], ["Mono", "mono"]], "For plain emails and conversations; designed emails keep their own (or use Reader view)."));
  return sec;
}
function layoutPage(redraw) {
  const sec = h("section", {},
    h("h3", { text: "Menu" }),
    segRow("Side", "side", [["Left", "left"], ["Right", "right"]]),
    (() => { const r = toggleRow("Open at the screen edge", "edge", "Move the pointer to the very edge of the screen and the menu slides out; move away and it slides back."); $("input", r).addEventListener("change", () => setTimeout(redraw, 0)); return r; })());
  if (prefs.edge) sec.append(toggleRow("Menu button", "burger", "Turn it off to keep only the screen edge."));
  const railRow = toggleRow("Quick buttons", "rail", "A column of buttons under the menu button, one click each.");
  $("input", railRow).addEventListener("change", () => setTimeout(redraw, 0));
  sec.append(railRow);
  if (prefs.rail) sec.append(railEditor(redraw));
  sec.append(segRow("Account label", "chip", [["Name and color", "full"], ["Color only", "color"], ["Hidden", "off"]],
      railHasAccounts() ? "Next to the menu button. Your accounts are already in the quick buttons, so you may want it hidden." : "Next to the menu button, when you're signed in to more than one account."),
    toggleRow("New message button", "fab", "The round + at the bottom right. C still starts a new message."),
    h("h3", { text: "Reading" }),
    toggleRow("Dual view", "split", "Your list stays on the left while you read a conversation on the right. J and K move to the next and previous conversation."),
    h("p", { class: "qm-pnote", text: "Dual view needs a window at least 1100 pixels wide; narrower, a conversation fills the screen as usual. Drag the line between the two sides to resize the list." }));
  return sec;
}
/* which quick buttons there are, and their order: switch each on or off, drag to reorder */
function railEditor(redraw) {
  const on = railList();
  const order = [...on, ...RAIL_ITEMS.map((x) => x[0]).filter((k) => !on.includes(k))];
  const save = (next) => { prefs.railItems = next; savePrefs(); };
  const list = h("div", { class: "qm-railedit", role: "list", "aria-label": "Quick buttons" });
  let dragging = null;
  for (const k of order) {
    const [, label, ico] = RAIL_ITEMS.find((x) => x[0] === k);
    const input = h("input", { type: "checkbox", checked: on.includes(k), "aria-label": label });
    input.addEventListener("change", () => { const now = [...list.children].map((r) => r.dataset.k).filter((x) => x === k ? input.checked : railList().includes(x)); save(now); });
    const note = k === "accounts" ? "Everything, then each account" : k === "ask" && !aiOn() ? "Needs AI on" : k === "todos" ? "Where Gmail has them" : "";
    const row = h("label", { class: "qm-toggle qm-railrow", role: "listitem", draggable: "true", "data-k": k },
      h("span", { class: "qm-grip", "aria-hidden": "true" }, h("i"), h("i"), h("i")), h("span", { class: "qm-railico" }, icon(ico)),
      h("span", { class: "qm-tl" }, h("span", { text: label }), note ? h("small", { text: note }) : null), input, h("span", { class: "qm-switch", "aria-hidden": "true" }));
    row.addEventListener("dragstart", (e) => { dragging = row; row.classList.add("qm-dragging"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", k); } catch (x) { /* fine */ } });
    row.addEventListener("dragend", () => { row.classList.remove("qm-dragging"); dragging = null; save([...list.children].map((r) => r.dataset.k).filter((x) => railList().includes(x))); });
    row.addEventListener("dragover", (e) => {
      if (!dragging || dragging === row) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      list.insertBefore(dragging, e.clientY < r.top + r.height / 2 ? row : row.nextSibling);
    });
    list.appendChild(row);
  }
  return h("div", { class: "qm-railbox" }, list, h("p", { class: "qm-pnote", text: "Drag to change the order. Piles from Gemini's notes come after these (Settings › Gemini)." }));
}
function colorsPage(redraw) {
  const sec = h("section", {}, h("h3", { text: "Accounts" }));
  if (accounts.length < 2) sec.append(h("p", { class: "qm-pnote", text: "Each account gets its own color once you're signed in to more than one." }));
  for (const a of accounts) {
    const set = (prefs.colors || {})[a.email];
    const now = acctColor(a.email);
    const swatches = h("div", { class: "qm-swatches" }, [...HUES, "none"].map((c) => {
      const on = set ? set === c : c === "none" ? !now : now === c;
      const b = h("button", { type: "button", class: "qm-sw" + (c === "none" ? " qm-sw-none" : ""), "aria-label": c === "none" ? "No color" : "Color", "aria-pressed": String(on),
        onclick: () => { prefs.colors = Object.assign({}, prefs.colors, { [a.email]: c }); savePrefs(); renderAccounts(); redraw(); } });
      if (c !== "none") b.style.background = c;
      return b;
    }));
    const name = h("input", { type: "text", value: accountLabel(a.email), "aria-label": "Name for " + a.email, spellcheck: "false" });
    name.addEventListener("change", () => { prefs.names = Object.assign({}, prefs.names, { [a.email]: name.value.trim() }); if (!name.value.trim()) delete prefs.names[a.email]; savePrefs(); renderAccounts(); });
    const dot = h("i", { class: "qm-dot" });
    dot.style.background = now || "transparent";
    // a colour picked from the wheel shows as its own (selected) swatch, before the wheel
    if (set && set !== "none" && !HUES.includes(set)) { const mine = h("button", { type: "button", class: "qm-sw", "aria-label": set, "aria-pressed": "true" }); mine.style.background = set; swatches.lastElementChild.before(mine); }
    swatches.appendChild(colorPicker(now, (v) => { prefs.colors = Object.assign({}, prefs.colors, { [a.email]: v }); savePrefs(); renderAccounts(); redraw(); }, "Any color for " + accountLabel(a.email)));
    sec.append(h("div", { class: "qm-acctrow" }, h("div", { class: "qm-acctname" }, dot, name, h("small", { text: a.email })), swatches));
  }
  sec.append(h("p", { class: "qm-pnote", text: "The color marks rows in Everything, the account in the menu, and the top of every window you write in, so you always know which account you're sending from." }),
    h("h3", { text: "Meaning" }),
    toggleRow("Mark what's waiting on you", "needs", "A warm ring round the picture (or a dot, without pictures) on conversations where a person is waiting for your reply. Uses Gmail's to-dos where you have them."),
    toggleRow("Quieter automated mail", "dimAuto", "Newsletters, receipts and notifications sit a step dimmer than people."),
    toggleRow("A color for each person", "autoColors", "Initials get a color of their own (the same one every time), so people are easier to tell apart at a glance. Set any person's color or emoji under People."));
  return sec;
}
function readImage(file, size) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
        resolve(c.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = reject;
      img.src = fr.result;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
function peoplePage() {
  const search = h("input", { type: "search", placeholder: "Find a person", "aria-label": "Find a person", autocomplete: "off", spellcheck: "false" });
  const list = h("div", { class: "qm-plist" });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    // people you've named first, then people you write with, then other people; companies only when searched for
    const rank = ([e, x]) => (x.wrote ? 1000 : 0) + x.n;
    const others = [...seen.entries()].filter(([e, x]) => q || isPersonAddress(e, x.name)).sort((a, b) => rank(b) - rank(a)).map((x) => x[0]);
    const emails = [...new Set([...Object.keys(contacts), ...others])];
    const rows = emails.map((e) => ({ email: e, name: personName(e, (seen.get(e) || {}).name) }))
      .filter((p) => !q || p.email.includes(q) || p.name.toLowerCase().includes(q)).slice(0, 100);
    list.replaceChildren(...rows.map((p) => personRow(p, draw)));
    if (!rows.length) list.append(h("p", { class: "qm-pnote", text: q ? "No one by that name yet." : "People you write with show up here as you read your mail." }));
  };
  search.addEventListener("input", draw);
  search.addEventListener("keydown", (e) => e.stopPropagation());
  const add = h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => { const ed = personEditor({ email: "", name: "" }, draw, true); list.prepend(ed); $("input", ed).focus(); } }, "Add person");
  draw();
  return h("section", { class: "qm-people" }, h("p", { class: "qm-pnote qm-lead", text: "Give anyone the name and picture you know them by. Umbra uses them everywhere instead of what their email says." }), h("div", { class: "qm-field" }, search, add), list);
}
function personRow(p, redraw) {
  const row = h("button", { type: "button", class: "qm-person" }, avatarEl(p.email, p.name, "qm-pav"),
    h("span", { class: "qm-pn" }, h("b", { text: p.name || p.email }), h("small", { text: p.email })),
    contacts[p.email] ? h("span", { class: "qm-pedited", text: "Edited" }) : null);
  row.addEventListener("click", () => { const ed = personEditor(p, redraw); row.replaceWith(ed); $("input", ed).focus(); });
  return row;
}
function personEditor(p, redraw, isNew) {
  const c = contacts[p.email] || {};
  let img = c.img || "";
  const nameIn = h("input", { type: "text", value: c.name || p.name || "", placeholder: "Name", "aria-label": "Name", spellcheck: "false" });
  const emojiIn = h("input", { type: "text", value: c.emoji || "", placeholder: "Emoji", "aria-label": "Emoji", class: "qm-emojiin", maxlength: "8", spellcheck: "false" });
  let color = c.color || "";
  const colorIn = colorPicker(color || personColor(p.email) || "#4f6fa8", (v) => { color = v; drawAv(); }, "Their color", (v) => { color = v; drawAv(); });
  const emailIn = isNew ? h("input", { type: "email", placeholder: "Email address", "aria-label": "Email address", spellcheck: "false" }) : null;
  const file = h("input", { type: "file", accept: "image/*", hidden: true });
  const av = h("button", { type: "button", class: "qm-pavbig", title: "Choose a picture", "aria-label": "Choose a picture" });
  const rm = h("button", { type: "button", class: "qm-btn qm-quietbtn", hidden: !img, onclick: () => { img = ""; drawAv(); rm.hidden = true; } }, "Remove picture");
  const drawAv = () => {
    const emo = emojiIn.value.trim();
    av.style.background = emo || (!img && !personPhoto(p.email)) ? color || personColor(p.email) || "" : "";
    av.replaceChildren(emo ? h("span", { class: "qm-pemoji", text: emo }) : img ? h("img", { src: img, alt: "" }) : personPhoto(p.email) ? h("img", { src: personPhoto(p.email), alt: "" }) : h("span", { text: initials(nameIn.value || p.name || p.email) }), h("i", {}, icon("image")));
  };
  emojiIn.addEventListener("input", drawAv);
  av.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => { const f = file.files && file.files[0]; if (f) { try { img = await readImage(f, 160); } catch (e) { toast("Couldn't read that picture."); } drawAv(); rm.hidden = !img; } });
  nameIn.addEventListener("input", () => { if (!img) drawAv(); });
  const save = () => {
    const email = (isNew ? emailIn.value : p.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { (emailIn || nameIn).focus(); return; }
    const next = Object.assign({}, contacts);
    const name = nameIn.value.trim();
    const emoji = emojiIn.value.trim();
    if (name || img || emoji || color) next[email] = { name, img, emoji, color }; else delete next[email];
    contacts = next;
    saveContacts();
    redraw();
  };
  for (const inp of [nameIn, emailIn, emojiIn].filter(Boolean)) inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") save(); if (e.key === "Escape") { e.preventDefault(); redraw(); } });
  drawAv();
  return h("div", { class: "qm-peditor" }, av,
    h("div", { class: "qm-pfields" }, nameIn, emailIn, isNew ? null : h("small", { text: p.email }),
      h("div", { class: "qm-pmark" }, colorIn, emojiIn, h("small", { text: "Color and emoji, shown instead of initials" })),
      h("div", { class: "qm-pbtns" },
        h("button", { type: "button", class: "qm-btn", onclick: save }, "Save"),
        h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: redraw }, "Cancel"),
        rm,
        !isNew && contacts[p.email] ? h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => { const next = Object.assign({}, contacts); delete next[p.email]; contacts = next; saveContacts(); redraw(); } }, "Reset") : null)),
    file);
}
/* each provider's terms, for the words beside it (and the welcome's box to tick) */
const AI_TERMS = {
  chatgpt: ["OpenAI's terms of use", "https://openai.com/policies/terms-of-use/"],
  openai: ["OpenAI's services agreement", "https://openai.com/policies/services-agreement/"],
  gemini: ["The Gemini API terms", "https://ai.google.dev/gemini-api/terms"],
  anthropic: ["Anthropic's commercial terms", "https://www.anthropic.com/legal/commercial-terms"],
  chrome: ["Google's generative AI use policy", "https://policies.google.com/terms/generative-ai/use-policy"],
};
/* Sign in with ChatGPT: a button, then (as a userscript) a place to paste where ChatGPT left you. The extension
   needs no paste: it catches that address itself, and the sign-in finishes here on its own. */
function signInBox(o) {
  const box = h("div", { class: "qm-signin" });
  const btn = h("button", { type: "button", class: "qm-btn" }, "Sign in with ChatGPT");
  const note = h("p", { class: "qm-status", role: "status" });
  const say = (t, kind) => { note.textContent = t || ""; note.className = "qm-status" + (kind ? " qm-" + kind : ""); };
  const field = h("input", { type: "url", class: "qm-paste", placeholder: "http://127.0.0.1:47824/auth/callback?…", autocomplete: "off", spellcheck: "false", "aria-label": "The address ChatGPT left you on" });
  const paste = h("div", { class: "qm-pastebox", hidden: true }, h("p", { class: "qm-pnote", text: "ChatGPT ends on a page that won't load. That's expected: copy its address and paste it here." }), field);
  let done = false;
  const finish = (x) => { done = true; daiSignedIn.delete(heard); say(x.chatgpt && x.chatgpt.planUsage === false ? x.message : "Signed in" + (x.chatgpt && x.chatgpt.email ? " as " + x.chatgpt.email : "") + ".", "ok"); paste.hidden = true; if (o && o.onDone) o.onDone(x); };
  const heard = (r) => { if (!document.contains(box)) { daiSignedIn.delete(heard); return; } if (r.ok) finish(r.status); else { say(r.message, "err"); btn.disabled = false; } };
  let busy = false;
  const tryPaste = async () => {
    const v = field.value.trim();
    if (busy || !/^https?:\/\/127\.0\.0\.1[:/]/.test(v)) { if (v) say("That isn't it: the address starts with http://127.0.0.1", "err"); return; }
    busy = true;
    say("Signing in…");
    try { finish(await helper("/chatgpt/finish", { url: v }, 30000)); } catch (e) { say(e.message, "err"); field.select(); }
    busy = false;
  };
  field.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") tryPaste(); });
  field.addEventListener("paste", () => setTimeout(tryPaste, 0));
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    say("…");
    try {
      const res = await helper("/chatgpt/start", {}, 15000);
      daiSignedIn.add(heard);
      openUrl(res.url);
      if (res.auto) {
        say("Finish in the ChatGPT tab. Umbra notices on its own.");
        // (and if it doesn't: the address that tab ended on does it by hand)
        setTimeout(() => { if (done || !document.contains(box)) return; paste.firstChild.textContent = "If the ChatGPT tab ended on a page that won't load, copy its address and paste it here."; paste.hidden = false; }, 45000);
      }
      else { say(""); paste.hidden = false; setTimeout(() => field.focus(), 50); }
    } catch (e) { say(e.message, "err"); }
    btn.disabled = false;
  });
  box.append(h("div", { class: "qm-field" }, btn), paste, note);
  return box;
}
function aiPage(redraw) {
  const sec = h("section", {});
  const status = h("p", { class: "qm-status", role: "status" });
  const say = (t, kind) => { status.textContent = t; status.className = "qm-status" + (kind ? " qm-" + kind : ""); };
  // the one switch: off, Umbra is everything else, without AI anywhere
  const master = h("input", { type: "checkbox", checked: aiOn() });
  master.addEventListener("change", () => {
    prefs.ai = master.checked;
    savePrefs();
    refreshAI(false).then(() => {
      invalidate(true);
      const sc = document.getElementById("qm-panel-scrim");
      if (sc) sc.remove();
      openPanel("ai");
    });
  });
  sec.append(h("label", { class: "qm-toggle" }, h("span", { class: "qm-tl" }, h("span", { text: "AI" }),
    h("small", { text: aiOn() ? "Summaries, suggested replies, writing, notes and answers. Off, Umbra still does everything else, with no AI anywhere." : "Off: nothing is sent to any AI, and nothing about AI is shown. Everything else works as always." })),
    master, h("span", { class: "qm-switch", "aria-hidden": "true" })));
  if (!aiOn()) return sec;
  sec.append(h("h3", { text: "Gmail's Gemini" }),
    toggleRow("Use Gemini in Gmail first", "gemini", hasGemini() ? "Free with your Google account: your to-dos, suggested replies and writing here. Questions use Umbra's AI, so they cover every account." : "This account doesn't have Gemini in Gmail, so Umbra's own AI is used."));
  // the notes at the top of each inbox: who makes them there, and a switch for each
  sec.append(h("h3", { text: "Notes at the top of the inbox" }));
  const inboxes = accounts.length ? accounts : [{ email: accountEmail(), index: accountIndex() }];
  for (const a of inboxes) {
    const gem = geminiIn(a.email);
    const who = gem && prefs.gemini ? "Has Gemini: Gmail's own to-dos, free." : (gem ? "Has Gemini, but Gemini is off above: " : "No Gemini in this account: ") + (ai.ready ? "Umbra's AI writes them." : "turn on Umbra's AI below to get them.");
    const input = h("input", { type: "checkbox", checked: briefOn(a.email) });
    input.addEventListener("change", () => { const b = Object.assign({}, prefs.briefs); if (input.checked) delete b[a.email]; else b[a.email] = false; prefs.briefs = b; savePrefs(); });
    sec.append(h("label", { class: "qm-toggle" }, h("span", { class: "qm-tl" }, h("span", { text: accounts.length > 1 ? accountLabel(a.email) : "This inbox" }), h("small", { text: who })), input, h("span", { class: "qm-switch", "aria-hidden": "true" })));
  }
  if (!prefs.brief) sec.append(h("p", { class: "qm-pnote", text: "They're all hidden right now: “Brief at the top of the inbox” is off in Display." }));
  sec.append(h("h3", { text: "Umbra's AI" }));
  const p = ai.provider || "off";
  const set = (provider) => { say("…"); helper("/config", { provider }, 30000).then((x) => { ai = Object.assign({ reachable: true }, x); redraw(); invalidate(true); }).catch((e) => say(e.message, "err")); };
  const seg = h("div", { class: "qm-seg", role: "group", "aria-label": "Provider" });
  const choices = [["Off", "off"], ["ChatGPT", "chatgpt"], ["Gemini", "gemini"], ["OpenAI", "openai"], ["Anthropic", "anthropic"],
    ...(ai.chrome && ai.chrome.state && ai.chrome.state !== "missing" && ai.chrome.state !== "unavailable" ? [["On this computer", "chrome"]] : [])];
  for (const [label, val] of choices) seg.appendChild(h("button", { type: "button", "aria-pressed": p === val ? "true" : "false", onclick: () => set(val) }, label));
  sec.append(h("div", { class: "qm-prow" }, h("span", { class: "qm-tl" }, h("span", { text: "Provider" })), seg));
  const chat = ai.chatgpt || {};
  if (p === "chatgpt" && !(chat.signedIn && chat.planUsage)) {
    sec.appendChild(signInBox({ onDone: (x) => { ai = Object.assign({ reachable: true }, x); redraw(); invalidate(true); } }));
  } else if (p === "chatgpt") {
    sec.appendChild(h("div", { class: "qm-field" }, h("p", { style: "flex:1;align-self:center", text: chat.email || "Signed in" }),
      h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => helper("/chatgpt/signout", {}).then((x) => { ai = Object.assign({ reachable: true }, x); redraw(); invalidate(true); }) }, "Sign out")));
  }
  const KEY_WORDS = { gemini: ["Gemini API key", "https://aistudio.google.com/apikey", "Get a free key"], openai: ["OpenAI API key", "https://platform.openai.com/api-keys", "Get a key"], anthropic: ["Anthropic API key", "https://console.anthropic.com/settings/keys", "Get a key"] };
  if (KEY_WORDS[p]) {
    const has = ai[p] && ai[p].hasKey;
    const input = h("input", { type: "password", placeholder: has ? "Key saved" : KEY_WORDS[p][0], autocomplete: "off", spellcheck: "false", "aria-label": "API key" });
    const save = h("button", { type: "button", class: "qm-btn" }, "Save");
    const doSave = () => {
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      save.disabled = true;
      say("Checking…");
      helper("/config", { provider: p, [p + "_key"]: v }, 30000).then((x) => { ai = Object.assign({ reachable: true }, x); redraw(); invalidate(true); }).catch((e) => { say(e.message, "err"); save.disabled = false; });
    };
    save.addEventListener("click", doSave);
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") doSave(); });
    const forget = has ? h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => { say("…"); helper("/config", { [p + "_key"]: null }, 30000).then((x) => { ai = Object.assign({ reachable: true }, x); redraw(); invalidate(true); }).catch((e) => say(e.message, "err")); } }, "Forget key") : null;
    sec.appendChild(h("div", { class: "qm-field" }, input, save, forget));
    if (!has) sec.appendChild(h("p", { class: "qm-status" }, h("a", { href: KEY_WORDS[p][1], target: "_blank", rel: "noopener" }, KEY_WORDS[p][2])));
  }
  // what leaves this computer, said plainly, and whose terms apply
  if (p !== "off") {
    const t = AI_TERMS[p];
    sec.appendChild(h("p", { class: "qm-pnote" }, p === "chrome" ? "Runs on this computer: nothing you read or write leaves it. "
      : "Only what AI works on (an email you summarize, a question and the mail it reads) goes to " + ({ gemini: "Google", openai: "OpenAI", anthropic: "Anthropic", chatgpt: "OpenAI" }[p] || p) + ", straight from this browser. ",
      t ? h("a", { href: t[1], target: "_blank", rel: "noopener", text: t[0] }) : null, t ? " apply. " : "", "Umbra collects zero data."));
  }
  if (p !== "off" && ai.ready && Array.isArray(ai.models) && ai.models.length > 1) {
    const pick = (label, key, value, note) => {
      const sel = h("select", { "aria-label": label });
      for (const m of ai.models) sel.appendChild(h("option", { value: m.id, selected: m.id === value, text: m.name || m.id }));
      sel.addEventListener("change", () => helper("/config", { [key]: sel.value }, 30000).then((x) => { ai = Object.assign({ reachable: true }, x); say("Saved.", "ok"); }).catch((e) => say(e.message, "err")));
      return h("div", { class: "qm-prow" }, h("span", { class: "qm-tl" }, h("span", { text: label }), note ? h("small", { text: note }) : null), sel);
    };
    sec.appendChild(pick("Everyday model", "model", ai.model, "Summaries, suggestions, writing. Fast and light."));
    if (ai.agent) sec.appendChild(pick("Model for questions", "smart", ai.smart || ai.model, "Searches and reads your mail to answer."));
  }
  sec.appendChild(status);
  const u = ai.usage || {};
  const k = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n || 0));
  if (ai.ready) say("On · today " + (u.requests || 0) + " request" + (u.requests === 1 ? "" : "s") + ", " + k((u.input || 0) + (u.output || 0)) + " tokens" + (u.cached && u.input ? ", " + Math.round((100 * u.cached) / u.input) + "% from cache" : ""), "ok");
  else if (p !== "off" && ai.message) say(ai.message);
  sec.append(h("h3", { text: "What AI does" }),
    toggleRow("Answer questions", "ask", ai.agent ? "Ask in Find (/) or ⌘K. Umbra searches and reads your mail in every account, then answers with its sources." : "Needs ChatGPT, Gemini, OpenAI or Anthropic above."),
    segRow("Suggested replies", "ideas", [["Off", "off"], ["When a reply is due", "focus"], ["Always", "always"]], "“When a reply is due”: ready as you open a conversation where someone is waiting on you."),
    segRow("Summaries", "summaries", [["Off", "off"], ["When I ask", "ask"], ["Long ones", "auto"]], "Only long emails and conversations of four or more get one."));
  // what the AI knows about you: learned once a week, yours to correct
  const about = h("textarea", { rows: "5", "aria-label": "What Umbra knows about you", placeholder: "A few lines about you: who you are, what you work on, how you write. Umbra fills this in after a while." });
  about.value = store.get("about-mine", "") || ((store.get("about", null) || {}).facts || []).join("\n");
  about.addEventListener("keydown", (e) => e.stopPropagation());
  about.addEventListener("change", () => { store.set("about-mine", about.value.trim()); say("Saved.", "ok"); });
  const relearn = h("button", { type: "button", class: "qm-btn qm-quietbtn" }, "Learn again");
  relearn.addEventListener("click", async () => { relearn.disabled = true; store.set("about-mine", ""); say("Learning…"); await learnAbout(true); about.value = ((store.get("about", null) || {}).facts || []).join("\n"); say("Updated.", "ok"); relearn.disabled = false; });
  sec.append(h("h3", { text: "What Umbra knows about you" }), h("p", { class: "qm-note", text: "Used to answer and to write in your voice. Edit it freely; it stays on this computer." }), about, h("div", { class: "qm-field" }, relearn));
  return sec;
}

/* =================================================================== main loop */
let pending = false, forced = false, last = 0;
// (forced: drawn at once, and Find's results read again. An open conversation is drawn again only when something in it
// changed: its signature says so, and whatever changes it from outside clears lastThreadSig itself)
function invalidate(force) { if (force) { forced = true; lastFindSig = ""; } schedule(); }
function schedule() {
  if (pending) return;
  pending = true;
  const delay = forced ? 0 : Math.max(0, 100 - (performance.now() - last));
  setTimeout(() => requestAnimationFrame(run), delay);
}
// (#inbox/<id>, #starred/<id>; a label, a search or a category has its name first: #label/Name/<id>, #search/words/<id>)
function isThreadHash(hash) {
  const parts = String(hash || "").split("?")[0].split("/");
  if (/^p\d+$/.test(parts[parts.length - 1])) return false;
  const need = /^#(label|search|category|advanced-search|apps|create-filter|settings)$/.test(parts[0]) ? 3 : 2;
  return parts.length >= need && /^([A-Za-z0-9_-]{14,}|thread-[a-z]:[\w-]+)$/.test(parts[parts.length - 1]); // (a function declaration: hashes are read before the end of the file has run)
}
/* the conversation you clicked, drawn at once from what the list knew, until Gmail has loaded it */
function renderOpening() {
  const o = opening;
  setScreen("opening", o.id, () => (o.single
    ? h("div", { class: "qm-reading" }, h("div", { class: "qm-scroll" }, h("article", { class: "qm-article" }, h("div", { class: "qm-ameta", text: o.from }), h("h1", { text: o.subject }), h("div", { class: "qm-thinking" }, h("i"), h("i"), h("i")))))
    : h("div", { class: "qm-thread" }, h("div", { class: "qm-head" }, h("h1", { text: o.subject })), h("div", { class: "qm-convo" }, h("div", { class: "qm-convo-in" }, h("div", { class: "qm-thinking" }, h("i"), h("i"), h("i")))))));
  threadBar(screen.el);
}
/* a conversation Gmail doesn't show (still loading, deleted, or an out-of-date link): a moment of
   waiting, then a plain explanation, never Gmail's empty page */
let lostAt = { hash: "", at: 0 };
function renderLost(hash, now) {
  if (lostAt.hash !== hash) { lostAt = { hash, at: Date.now() - (now ? 6001 : 0) }; if (!now) setTimeout(() => invalidate(true), 6100); }
  const late = Date.now() - lostAt.at > 6000;
  const { el } = setScreen("lost", hash + (late ? "!" : ""), () => h("div", { class: "qm-reading" }, h("div", { class: "qm-scroll" }, h("article", { class: "qm-article qm-lost" },
    late
      ? [h("h1", { text: "This conversation couldn't be opened" }),
         h("p", { text: "Gmail didn't load it. It may have been deleted, or the link may be out of date." }),
         h("div", { class: "qm-lostacts" },
           h("button", { type: "button", class: "qm-btn", onclick: goBack }, "Back"),
           h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => { leaving = true; location.reload(); } }, "Try again"))]
      : h("div", { class: "qm-thinking" }, h("i"), h("i"), h("i"))))));
  if (!$(":scope > .qm-bar.qm-left", el)) el.append(h("div", { class: "qm-bar qm-left" }, ib("back", "Back", goBack)));
}
function run() {
  pending = false;
  forced = false;
  last = performance.now();
  try {
    removeOldCopies();
    applyPrefs();
    applyColors();
    calmTitle();
    if (!enabled) { hideView(); return; }
    if (!document.body) { renderEarly(route()); return; } // Gmail's page hasn't started: draw from memory
    if (!document.getElementById("qm-side")) buildSide();
    ensureFab();
    ensureGBack();
    renderFolders();
    if (Date.now() - (renderAccounts.at || 0) > 2000) { renderAccounts.at = Date.now(); renderAccounts(); } // (their counts read other tabs' lists: now and then)
    renderChip();
    watchGmailToasts();
    if (waitingGo && !looking()) goWaiting();
    if (peeking || ghost || aiPeeking) {
      // a quick look behind the screen: it stays as it is, except for where you've asked to go meanwhile, drawn from
      // what Umbra already has (the conversation as the list knew it, or the list itself)
      if (waitingGo) {
        if (opening && isThreadHash(waitingGo)) renderOpening();
        else if (!isThreadHash(waitingGo) && LIST_HASH.test(waitingGo.split("?")[0]) && everyFolder === baseHash(waitingGo) && mainSource() && mainSource().rows.size) {
          ROOT.classList.add("qm-v-list");
          renderStream({ kind: "loading", hash: waitingGo }, everything && accounts.length > 1);
        }
      }
      decorateWriting();
      return;
    }
    const r = route();
    if (r.kind === "loading") {
      // a conversation on its way in dual view: the list stays on the left from the very first frame
      const splitNow = splitWanted() && !askOn && !findMode && !!opening && isThreadHash(r.hash);
      ROOT.classList.toggle("qm-splitting", splitNow);
      renderEarly(r);
      if (splitNow) renderPane(opening.id);
      decorateWriting();
      return;
    }
    const threadish = isThreadHash(r.hash);
    // back to a list while Gmail still shows the conversation (it can take it most of a second): the list at once,
    // from what Umbra already has of it
    const backToList = r.kind === "thread" && !threadish && LIST_HASH.test(r.hash.split("?")[0]) && !findMode && !findPending && !askOn &&
      everyFolder === baseHash(r.hash) && !!mainSource() && mainSource().rows.size > 0;
    const listy = !threadish && (r.kind === "list" || backToList || (r.kind === "search" && baseHash(r.hash) === DONE_HASH));
    const all = everything && accounts.length > 1 && !findMode && !findPending && listy;
    const waiting = opening && threadish && Date.now() - opening.at < 6000 && (r.kind !== "thread" || (!!openThreadId() && openThreadId() !== String(opening.id)));
    // (a conversation's address, but Gmail shows something else — its own page, or still the list it was on: it
    // didn't open it. Never a frozen screen with no way on.)
    const lost = threadish && (r.kind === "gmail" || r.kind === "list") && !waiting && !findMode && !findPending;
    if (paperOn && Date.now() - paperOpenAt > 1500 && (!isInboxFolder(baseHash(r.hash)) || threadish)) paperOn = false; // went somewhere else
    ROOT.classList.toggle("qm-v-list", !askOn && !waiting && (paperOn || listy || r.kind === "search" || r.kind === "todos" || r.kind === "subs" || r.kind === "files" || findMode || !!findPending));
    ROOT.classList.toggle("qm-gmailpage", r.kind === "gmail" && !findMode && !waiting && !lost && !askOn);
    ROOT.classList.toggle("qm-every", !!all);
    if (r.kind !== "thread" && r.kind !== "loading") expandedFor = ""; // reopened later: expand again
    // dual view: while a conversation is open (or opening), the list it came from stays on the left
    const splitting = splitWanted() && !askOn && !findMode && (r.kind === "thread" || waiting);
    ROOT.classList.toggle("qm-splitting", splitting);
    if (askOn) renderAsk();
    else if (paperOn && listy) { ensureSources(baseHash(r.hash), !!all); renderPaper(); }
    else if ((findMode || findPending) && r.kind !== "search") renderFind(null, null);
    else if (waiting) renderOpening();
    else if (lost) renderLost(r.hash);
    else if (backToList) { paperBack = false; renderStream({ kind: "loading", hash: r.hash }, all); }
    else if (listy) { paperBack = false; renderStream(r, all); openArrivedDraft(); if (isInboxFolder(baseHash(r.hash))) paperTurnover(); }
    else if (r.kind === "todos") renderTodos(r);
    else if (r.kind === "subs") renderSubs(r);
    else if (r.kind === "files") renderFiles(r);
    else if (r.kind === "search") { findMode = false; renderFind(r, listSettled() ? readRows(r.main) : null); }
    else if (r.kind === "thread") { opening = null; if (arrival() && arrival().opening) session.set("arrive", ""); if (backPending) { backPending = false; backFor = r.hash; } renderThread(r); }
    if (splitting) renderPane(waiting && opening ? opening.id : screen.key);
    else if (r.kind === "gmail" && !lost) hideView(); // (Gmail's own page; not one it shows for a conversation it couldn't open)
    // a "back to where it was opened from" only lasts while that conversation is open
    if (backFor && !backPending && r.kind !== "thread" && r.kind !== "loading") { backFor = ""; session.set("back", ""); }
    decorateWriting();
  } catch (e) {
    if (window.__umbra) window.__umbra.err = String(e && e.stack || e);
    if (!run.warned) { run.warned = true; console.warn("[umbra]", e); }
  }
}
function boot() {
  // the development harness (no userscript manager) can look inside
  if (typeof GM_getValue !== "function") window.__umbra = { aiCache, pendingAI, failedAI, prefs, useGemini, hasGemini, ideasWanted, readThread, gmailMain, parkedDraft, ghostThread, streamRows, sources, get screen() { return screen; }, get opening() { return opening; }, get askOn() { return askOn; }, get aiPeeking() { return aiPeeking; }, get peeking() { return peeking; }, loadWhole, runAskTask, searchHere, snapshot, lookOf, shellAt, reveal, readMailThread, askScreen, askAccounts, aboutText, nowText, myName,
    fakeAI: (x) => { ai = Object.assign({ reachable: true, ready: true, agent: true }, x); invalidate(true); },
    askShow: (q, turn) => { askState = { q, sid: "dev", screen: {}, turns: [Object.assign({ q, steps: [], answer: "", sources: [], status: "done", at: Date.now() }, turn)], shown: true }; askOn = true; invalidate(true); } };
  new MutationObserver((records) => {
    for (const rec of records) {
      const t = rec.target;
      // (Umbra's own things changing — the view, the menu, the dock and its chips, toasts, the shapes a window grows
      // and shrinks through, a window's own header — are never a reason to draw again)
      if (t.nodeType === 1 && (t.id === "qm-view" || t.closest && t.closest("#qm-view, #qm-side, .qm-menu, #qm-panel-scrim, #qm-dock, #qm-rail, #qm-toast, #qm-gtoast, .qm-morph, #qm-fview-scrim, #qm-confirm-scrim, #qm-keys-scrim, #qm-pal-scrim, #qm-chord, #qm-linktip, #qm-person, .qm-whead"))) continue;
      schedule();
      return;
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-expanded"] });
  // (Umbra turning Gmail's pages for you isn't you going somewhere: the cursor and an open menu stay)
  window.addEventListener("hashchange", () => { if (peeking || ghost || aiPeeking || Date.now() - ownNav < 2500) { invalidate(true); return; } closeMenu(); closeSide(); closeFileView(); cursor = -1; invalidate(true); });
  window.addEventListener("resize", () => schedule());
  // tabs share what they read (Everything), and answer requests for more while in the background
  heartbeat();
  setInterval(heartbeat, 10000);
  document.addEventListener("visibilitychange", () => {
    heartbeat();
    if (!document.hidden && emptyThread) invalidate();
    if (document.hidden || !restoreTo) return;
    const to = restoreTo;
    restoreTo = "";
    if (pagedFolders.has(baseHash(hashNow()))) firstPage(baseHash(hashNow()));
    if (hashNow() !== to) go(to);
  });
  window.addEventListener("pagehide", () => { const e = accountEmail(); if (e) store.set("live:" + e, { at: 0, tab: TAB_ID }); });
  if (typeof GM_addValueChangeListener === "function") {
    GM_addValueChangeListener("want", (k, old, req, remote) => { if (remote) serve(req); });
    GM_addValueChangeListener("do", (k, old, req, remote) => { if (remote) doHere(req); });
  } else setInterval(() => { serve(store.get("want", null)); doHere(store.get("do", null)); }, 2000);
  refreshAI(false).then(() => { invalidate(true); gemFetch(false); });
  setInterval(() => { if (enabled) refreshAI(false).then(() => invalidate()); }, 5 * 60 * 1000);
  // Gemini's notes on new mail (Settings › Gemini): read now, then every minute or so while you're here
  gemFetch(false);
  setInterval(() => { if (enabled && !document.hidden) gemFetch(false); }, 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) gemFetch(false); });
  setTimeout(findAccounts, 2500);
  setInterval(() => { if (enabled) findAccounts(); }, 5 * 60 * 1000);
  // Everything: pick up read/unread changes and new mail the frames show
  setInterval(() => { if (screen.kind === "stream" && sources.size > 1 && !document.hidden) invalidate(); }, 3000);
  // a message on its way here from another account: its stand-in, from the first moment
  showMovingIfAny();
  // a link's new message (Gmail's full-page one, already addressed, that sent you here): its window, filled in, as soon
  // as Gmail's Compose is there
  if (session.get("link-compose")) {
    (async () => {
      await until(() => !linkCompose() || ($('[gh="cm"]') && gmailMain()), 20000, 100);
      const d = linkCompose();
      if (d) { session.set("link-compose", ""); composeTo(d); }
    })();
  }
  // tides and editions arrive on time (and an edition puts the last one away, if you asked)
  calmTick();
  paperTurnover();
  schedule();
}
