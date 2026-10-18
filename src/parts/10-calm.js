/* =================================================================== calm
   Mail that comes when you're ready for it.
   - Tides: new mail arrives two or three times a day, all at once, instead of one at a time all day.
     People you've marked, people waiting on you, and conversations you're part of come in anyway.
   - The paper: newsletters and notifications fold into one readable page, an edition each morning.
   - Senders: anyone can be let through always, sent to the paper, or quieted for a month.
   - The inbox ends: it can stop at the last two weeks, and says when you're caught up.
   Everything here only shapes what the inbox shows. Gmail keeps every email exactly as it was. */

const CALM_DEFAULTS = {
  tides: "off", // "off" | "two" | "three" | "custom"
  tideTimes: [540, 960], // your own times (minutes after midnight), for "custom"
  vip: true, waiting: true, mine: true, // who comes in between tides
  paper: false, edition: 420, // the paper, and when each edition comes out
  paperKinds: ["Newsletters", "Promotions", "Social", "Updates", "Orders", "Events", "Travel"],
  putAway: false, // when a new edition comes out, the last one goes to Done (archived)
  ends: "never", // "never" | "2w" | "1m"
  title: false, // the tab says where you are, not how much is unread
};
const cp = () => Object.assign({}, CALM_DEFAULTS, prefs.calm);
function setCalm(patch) { prefs.calm = Object.assign({}, prefs.calm, patch); savePrefs(); }
const tideMins = (c) => tideList((c || cp()).tides === "custom" ? (c || cp()).tideTimes : (c || cp()).tides);
// a time of day the way this computer writes one ("4:00 PM", or "16:00"), and with its day when it isn't today
const timeOfDay = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const clockAt = (min) => timeOfDay(atClock(Date.now(), min));
const whenNext = (t) => { const w = dayWord(t, Date.now()); return timeOfDay(t) + (w === "today" ? "" : w === "tomorrow" ? " tomorrow" : " on " + w); };

/* ---- senders: each rule is about one address ---- */
// the person (or company) a row is from: the newest one on it who isn't you (Gmail names them in the order they wrote;
// "me" is you, from whichever of your addresses)
const isMe = (r, p) => p.email === ((((r && r.account) || {}).email) || accountEmail()) || /^me$/i.test(String(p.short || p.name || "").trim());
function senderOf(r) {
  const p = rowPeople(r || {}).filter((x) => x.email && !isMe(r, x)).pop();
  return p ? { email: p.email.toLowerCase(), name: personName(p.email, p.name) || p.name || p.email } : null;
}
// anyone on it you always let through
const vipOn = (r) => rowPeople(r || {}).some((p) => p.email && !isMe(r, p) && (ruleFor(p.email) || {}).kind === "vip");
function ruleFor(email) {
  const r = email && (prefs.rules || {})[String(email).toLowerCase()];
  if (!r) return null;
  if (r.kind === "quiet" && r.until && r.until < Date.now()) return null; // a month is up
  return r;
}
const RULE_WORDS = { vip: "always let through", paper: "sent to the paper", quiet: "quiet for a month" };
setTimeout(() => {
  const rules = prefs.rules || {}, left = {};
  for (const [e, r] of Object.entries(rules)) if (!(r && r.kind === "quiet" && r.until && r.until < Date.now())) left[e] = r;
  if (Object.keys(left).length !== Object.keys(rules).length) { prefs.rules = left; store.set("prefs3", prefs); }
}, 5000);
function setRule(email, kind, name) {
  email = String(email || "").toLowerCase();
  if (!email) return;
  const rules = Object.assign({}, prefs.rules);
  const was = rules[email];
  if (!kind) delete rules[email];
  else rules[email] = { kind, name: name || (was && was.name) || "", at: Date.now(), until: kind === "quiet" ? Date.now() + 30 * 86400000 : 0 };
  prefs.rules = rules;
  savePrefs();
  const who = name || (was && was.name) || email;
  const u = pushUndo({ label: kind ? who + " " + RULE_WORDS[kind] : who + " back to normal", after: was ? who + ": " + RULE_WORDS[was.kind] + " again." : who + ": back to normal.", undo: () => { const r2 = Object.assign({}, prefs.rules); if (was) r2[email] = was; else delete r2[email]; prefs.rules = r2; savePrefs(); } });
  toast(kind ? who + ": " + RULE_WORDS[kind] + "." : who + ": back to normal.", undoAct(u));
}
const rowHasMe = (r) => rowPeople(r).some((p) => isMe(r, p));

/* ---- what happens to a row in the inbox: "show", "held" (until the next tide), "paper", or "quiet" ---- */
let tideOpenAt = Number(store.get("tide-open", 0)) || 0; // "Let them in": everything before this shows now
let tideSince = Number(store.get("tide-since", 0)) || 0; // tides turned on: nothing already shown is taken back
function tideCut(c) {
  const mins = tideMins(c);
  if (!mins.length) return Infinity; // (no times set: there's no tide to wait for, so nothing waits)
  return Math.max(lastTideAt(Date.now(), mins), tideOpenAt, tideSince);
}
function paperKind(r) {
  const g = gemFor(r);
  if (g && g.category) return g.category;
  return kindOfMail(r.from || "", r.subject || "", r.snippet || "");
}
// mail for the paper: automated, not from (or with) a person, not starred, not waiting on you, of a kind you chose
function paperish(r, c) {
  if (isFromPerson(r) || r.starred || r.draft || rowHasMe(r) || needsYou(r)) return false;
  if (!automatedRow(r)) return false;
  return (c || cp()).paperKinds.includes(paperKind(r));
}
// (a person's name: two or three words, each capitalised, none of them a brand's word; or one name that is also the
// start of their address, at a domain that isn't that name)
function personlike(name, email) {
  const n = String(name || "").trim();
  if (!n || BRANDY.test(n) || /^the\s/i.test(n)) return false;
  if (/^[\p{Lu}][\p{Ll}'’-]+(\s+[\p{Lu}][\p{Ll}'’.-]*){1,2}$/u.test(n)) return true;
  const [local = "", domain = ""] = String(email || "").toLowerCase().split("@");
  const w = n.toLowerCase();
  return /^[\p{L}'’-]{2,}$/u.test(n) && local.startsWith(w) && !domain.includes(w);
}
function automatedRow(r) {
  const g = gemFor(r);
  if (g && g.category) return g.category !== "People";
  const who = senderOf(r);
  if (!who) return true;
  if (isAutomated(who.email)) return true;
  const p = rowPeople(r).find((x) => x.email === who.email) || {};
  return !personlike(p.name || p.short || who.name, who.email);
}
function calmFate(r, c) {
  c = c || cp();
  const who = senderOf(r);
  const rule = who && ruleFor(who.email);
  if (rule && rule.kind === "quiet") return "quiet";
  if (c.vip && ((rule && rule.kind === "vip") || vipOn(r))) return "show";
  if (c.tides !== "off" && r.unread && r.time > tideCut(c) && !(c.waiting && needsYou(r)) && !(c.mine && rowHasMe(r))) return "held";
  if (c.paper && ((rule && rule.kind === "paper") || paperish(r, c))) return "paper";
  return "show";
}
const calmHere = () => isInboxFolder(everyFolder) && !askOn;
/* the inbox's rows, shaped by calm: what's held, quieted, or in the paper stays out (a pile you open shows
   its paper mail; counting piles counts it) */
function calmRows(list, keepPaper) {
  if (!calmHere()) return list;
  const c = cp();
  const ends = c.ends === "2w" ? Date.now() - 14 * 86400000 : c.ends === "1m" ? Date.now() - 31 * 86400000 : 0;
  return list.filter((r) => {
    const f = calmFate(r, c);
    if (f === "held" || f === "quiet") return false;
    if (f === "paper" && !keepPaper) return false;
    if (ends && r.time < ends && !r.unread && !r.starred) return false;
    return true;
  });
}
/* the inbox ends (Settings › Calm): once what's loaded reaches back past the end, there's no more to load */
function calmEnded() {
  if (!calmHere()) return false;
  const c = cp();
  if (c.ends === "never") return false;
  const cut = Date.now() - (c.ends === "1m" ? 31 : 14) * 86400000;
  const srcs = [...sources.values()].filter((x) => x.ready);
  return srcs.length > 0 && srcs.every((x) => x.done || x.oldest < cut);
}
/* everything the inbox has loaded, before calm shaped it (for the paper and the counts) */
function inboxRows() {
  const out = [];
  for (const s of sources.values()) if (s.ready) for (const r of s.rows.values()) if (!gone.has(r.id)) out.push(readFix(r));
  return out.sort((a, b) => b.time - a.time);
}
function heldRows() { if (!calmHere()) return []; const c = cp(); return inboxRows().filter((r) => calmFate(r, c) === "held"); }
/* the next tide's arrival redraws the inbox (and turns over the paper's edition) */
let calmTimer = 0;
function calmTick() {
  clearTimeout(calmTimer);
  const c = cp(), now = Date.now();
  const next = [nextTideAt(now, tideMins(c)), c.paper ? nextClock(now, c.edition) : 0].filter(Boolean);
  if (!next.length) return;
  calmTimer = setTimeout(() => { if (enabled) { everyKeys = ["!redraw"]; paperTurnover(); invalidate(true); } calmTick(); }, Math.min(...next) - now + 1500);
}
function letTideIn() {
  tideOpenAt = Date.now();
  store.set("tide-open", tideOpenAt);
  everyKeys = ["!redraw"];
  invalidate(true);
}
/* tides turned on: what's already in the inbox stays; only mail from now on waits */
function tidesStart() {
  tideSince = Date.now();
  store.set("tide-since", tideSince);
  tideOpenAt = 0;
  store.set("tide-open", 0);
}
// (every tab of this browser agrees: let in or turned on in one, the same in the others)
if (typeof GM_addValueChangeListener === "function") {
  for (const k of ["tide-open", "tide-since"]) GM_addValueChangeListener(k, (key, old, val, remote) => {
    if (!remote) return;
    if (key === "tide-open") tideOpenAt = Number(val) || 0; else tideSince = Number(val) || 0;
    everyKeys = ["!redraw"];
    invalidate(true);
  });
}

/* ---- above the rows: the paper, what's waiting for the tide, and when you're caught up ---- */
function renderCalm(el, list, folder) {
  let slot = $(".qm-calmslot", el);
  if (!slot) { slot = h("div", { class: "qm-calmslot" }); $(".qm-brief", el).after(slot); }
  const c = cp();
  const inbox = calmHere() && isInboxFolder(folder) && !activeFilters().length;
  const held = inbox && c.tides !== "off" ? heldRows() : [];
  const ed = inbox && c.paper ? paperEdition() : null;
  const unread = list.some((r) => r.unread);
  const ready = [...sources.values()].some((s) => s.ready);
  const next = c.tides !== "off" ? nextTideAt(Date.now(), tideMins(c)) : 0;
  const caught = inbox && ready && list.length > 0 && !unread;
  const sig = [inbox, held.length, ed ? ed.stories.length + ":" + ed.unread : "-", caught, next, Math.floor(Date.now() / 600000), isLight(), inbox ? openPromises().map((p) => p.key).join() : ""].join("|");
  if (slot.dataset.sig === sig) return;
  slot.dataset.sig = sig;
  const pills = [];
  if (ed && ed.stories.length) pills.push(h("button", { type: "button", class: "qm-cpill qm-paperpill", onclick: () => openPaper() }, icon("paper"),
    h("span", { text: "The paper" }), h("small", { text: ed.unread ? ed.unread + " new" : ed.stories.length + (ed.stories.length === 1 ? " story" : " stories") })));
  if (held.length) pills.push(h("div", { class: "qm-cpill qm-tidepill" }, icon("later"),
    h("span", { text: held.length + " waiting for the tide at " + whenNext(next) }),
    h("button", { type: "button", onclick: letTideIn }, "Let them in")));
  const kids = [];
  if (pills.length) kids.push(h("div", { class: "qm-cpills" }, pills));
  const prom = inbox ? promiseLines() : null; // what you said you'd do
  if (prom) kids.push(prom);
  if (caught) kids.push(caughtUpScene(c, next, held.length));
  slot.replaceChildren(...kids);
}
/* you're caught up: the sky as it is right now (the sun, or the moon as full as it is tonight), and when more comes */
function caughtUpScene(c, next, held) {
  const now = Date.now();
  const sky = skyAt(now);
  const night = sky.phase === "night" || sky.phase === "dusk";
  const sub = held ? held + " more at " + whenNext(next)
    : next ? "Next tide at " + whenNext(next)
    : c.paper ? "The next paper comes at " + whenNext(nextClock(now, c.edition))
    : night ? moonName(moonPhase(now)) + " tonight." : "Nothing new.";
  const box = h("div", { class: "qm-caught" + (night ? " qm-night" : "") }, skyArt(now, sky), h("div", { class: "qm-caughtw" }, h("b", { text: "You're caught up." }), h("small", { text: sub })));
  box.style.setProperty("--sky-top", sky.top);
  box.style.setProperty("--sky-mid", sky.mid);
  box.style.setProperty("--sky-low", sky.low);
  return box;
}
/* a small window onto the sky: its colors for the hour, stars at night, the sun by day, the moon as it is */
function skyArt(now, sky) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 120 72");
  svg.setAttribute("class", "qm-skyart");
  svg.setAttribute("aria-hidden", "true");
  const el = (tag, at) => { const x = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(at)) x.setAttribute(k, v); svg.appendChild(x); return x; };
  const id = "qmsky" + Math.random().toString(36).slice(2, 7);
  const defs = el("defs", {});
  const g = document.createElementNS(ns, "linearGradient");
  g.setAttribute("id", id); g.setAttribute("x1", "0"); g.setAttribute("y1", "0"); g.setAttribute("x2", "0"); g.setAttribute("y2", "1");
  for (const [o, col] of [[0, sky.top], [0.6, sky.mid], [1, sky.low]]) { const s = document.createElementNS(ns, "stop"); s.setAttribute("offset", String(o)); s.setAttribute("stop-color", col); g.appendChild(s); }
  defs.appendChild(g);
  el("rect", { x: 0, y: 0, width: 120, height: 72, rx: 14, fill: "url(#" + id + ")" });
  // stars: the same ones every night (from the date), fading in at dusk
  if (sky.stars > 0) {
    let seed = Math.floor(now / 86400000);
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 22; i++) el("circle", { cx: (rnd() * 112 + 4).toFixed(1), cy: (rnd() * 44 + 4).toFixed(1), r: (rnd() * 0.7 + 0.35).toFixed(2), fill: "#fff", opacity: (sky.stars * (0.35 + rnd() * 0.6)).toFixed(2) });
  }
  const night = sky.phase === "night" || sky.phase === "dusk";
  if (night) {
    // the moon, lit as much as it is tonight
    const p = moonPhase(now), cx = 88, cy = 24, r = 9;
    el("circle", { cx, cy, r, fill: "#f3ecd6", opacity: 0.13 }); // the dark part, faintly there (earthshine)
    const lit = 1 - Math.abs(1 - p * 2); // 0 new, 1 full
    // the lit edge (right while waxing, left while waning), then back along the terminator: a crescent's
    // bulges the same way as the edge (a thin sliver), a gibbous moon's the other way
    const sweep = p < 0.5 ? 1 : 0;
    const k = Math.cos(lit * Math.PI) * r; // > 0: crescent, < 0: gibbous
    el("path", { d: `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${sweep} ${cx} ${cy + r} A ${Math.abs(k).toFixed(2)} ${r} 0 0 ${k > 0 ? 1 - sweep : sweep} ${cx} ${cy - r} Z`, fill: "#f3ecd6" });
  } else {
    const m = new Date(now).getHours() * 60 + new Date(now).getMinutes();
    const { rise, set } = sunTimes(now);
    const k = Math.max(0, Math.min(1, (m - rise) / Math.max(1, set - rise)));
    el("circle", { cx: (14 + k * 92).toFixed(1), cy: (58 - Math.sin(k * Math.PI) * 40).toFixed(1), r: 7, fill: sky.phase === "day" ? "#fff6d6" : "#ffd8a0", opacity: 0.95 });
  }
  // the ground
  el("path", { d: "M0 60 Q 30 52 58 58 T 120 56 V72 H0 Z", fill: night ? "#0d1020" : "#2c3b4f", opacity: 0.85 });
  return svg;
}

/* =================================================================== the paper
   One page for the newsletters and notifications: an edition each morning (when you choose), in sections. */
let paperOn = false, paperBack = false, paperShowLater = false, paperOpenAt = 0;
let paperScroll = 0; // where you were in the paper when you opened a story (Back returns there)
const paperOpenKinds = new Set(); // sections shown in full
const PAPER_FOLD = 6;
function paperEdition() {
  const c = cp(), now = Date.now();
  const start = editionAt(now, c.edition);
  const all = inboxRows().filter((r) => calmFate(r, c) === "paper");
  const stories = all.filter((r) => r.time <= start || paperShowLater);
  const later = all.filter((r) => r.time > start && !paperShowLater);
  return { at: start, stories, later, unread: stories.filter((r) => r.unread).length };
}
function openPaper() {
  closeSide();
  closeMenu();
  paperOpenAt = Date.now();
  if (!isInboxFolder(baseHash(hashNow()))) go("#inbox");
  paperOn = true;
  invalidate(true);
  // the paper reaches back to yesterday's edition: load that far if the inbox hasn't yet
  const want = editionAt(Date.now(), cp().edition) - 86400000;
  let tries = 0;
  const more = () => { if (!paperOn || tries++ > 12) return; const oldest = Math.min(...[...sources.values()].map((s) => s.oldest)); if (oldest > want) { everythingMore(true); setTimeout(more, 1600); } };
  setTimeout(more, 600);
}
function closePaper() { paperOn = false; paperShowLater = false; paperScroll = 0; paperOpenKinds.clear(); invalidate(true); }
const PAPER_ORDER = ["Newsletters", "Updates", "Orders", "Events", "Travel", "Security", "Social", "Promotions"];
function renderPaper() {
  const { el, fresh } = setScreen("paper", "paper", () => h("div", {}, h("div", { class: "qm-scroll" }, h("div", { class: "qm-inbox qm-paper" },
    h("div", { class: "qm-titlerow" }, ib("back", "Back", closePaper, "qm-tback"), h("div", { class: "qm-masthead" }, h("h1", { class: "qm-title", text: "The Paper" }), h("p", { class: "qm-dateline" }))),
    h("div", { class: "qm-papersec" }), h("div", { class: "qm-papertail" }))), h("div", { class: "qm-fade" })));
  if (fresh) { const sc = $(".qm-scroll", el); if (sc) sc.scrollTop = 0; }
  const ed = paperEdition();
  const d = new Date(ed.at);
  const line = d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) + " · " + (ed.stories.length ? ed.stories.length + (ed.stories.length === 1 ? " story" : " stories") : "no stories");
  const dl = $(".qm-dateline", el);
  if (dl.textContent !== line) dl.textContent = line;
  const box = $(".qm-papersec", el);
  const sig = ed.stories.map((r) => r.id + (r.unread ? "u" : "")).join() + "|" + ed.later.length + "|" + isLight() + "|" + Object.keys(prefs.rules || {}).length + "|" + [...paperOpenKinds].join();
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  // a long section shows its first few (unread first), and the rest when you ask
  const parts = paperSections(ed).map(([k, all]) => {
    const folded = all.length > PAPER_FOLD + 1 && !paperOpenKinds.has(k);
    const shown = folded ? all.slice(0, PAPER_FOLD) : all;
    return h("section", { class: "qm-psection" }, h("h2", { text: k }), h("div", { class: "qm-stories" }, shown.map(storyEl)),
      folded ? h("button", { type: "button", class: "qm-pmore", onclick: () => { paperOpenKinds.add(k); invalidate(true); } }, (all.length - PAPER_FOLD) + " more in " + k) : null);
  });
  if (!ed.stories.length) parts.push(h("div", { class: "qm-empty qm-paperempty", text: ed.later.length ? "Nothing in this edition yet." : "No stories yet. Newsletters and notifications will gather here." }));
  box.replaceChildren(...parts);
  if (paperScroll) { const sc = $(".qm-scroll", el); if (sc) sc.scrollTop = paperScroll; paperScroll = 0; }
  const tail = $(".qm-papertail", el);
  const acts = [];
  if (ed.later.length) acts.push(h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => { paperShowLater = true; box.dataset.sig = ""; invalidate(true); } }, ed.later.length + " more since " + clockAt(cp().edition) + " · Show"));
  if (ed.stories.length) acts.push(h("button", { type: "button", class: "qm-btn", onclick: () => paperDone(ed.stories) }, icon("done"), "Done with this edition"));
  tail.replaceChildren(...(acts.length ? [h("div", { class: "qm-paperacts" }, acts), h("p", { class: "qm-pnote", text: cp().putAway ? "Each edition is put away (archived) when the next one comes out." : "Done puts the whole edition away (archived), still searchable in All mail." })] : []));
}
/* the edition in sections ([kind, stories]), in the paper's order: unread first, then newest */
function paperSections(ed) {
  const groups = new Map();
  for (const r of ed.stories) { const k = paperKind(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const order = [...groups.keys()].sort((a, b) => (PAPER_ORDER.indexOf(a) + 1 || 99) - (PAPER_ORDER.indexOf(b) + 1 || 99));
  return order.map((k) => [k, groups.get(k).sort((a, b) => (b.unread - a.unread) || (b.time - a.time))]);
}
function storyEl(r) {
  const who = senderOf(r);
  const g = gemFor(r);
  const deck = (g && g.summary) || r.snippet || "";
  const st = h("article", { class: "qm-story" + (r.unread ? "" : " qm-read"), role: "link", tabindex: "0" },
    h("div", { class: "qm-sfrom" }, rowFace(r), h("span", { text: who ? who.name : r.from || "" }), h("time", { text: r.when || "" })),
    h("h3", { text: r.subject || "(no subject)" }),
    deck ? h("p", { text: deck }) : null,
    h("div", { class: "qm-sacts" },
      ib("done", "Done", (e) => { e.stopPropagation(); rowDo(r, "done", st); }, "qm-s")));
  const open = () => { const sc = st.closest(".qm-scroll"); paperScroll = sc ? sc.scrollTop : 0; paperOn = false; paperBack = true; openStreamRow(r); };
  st.addEventListener("click", open);
  st.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === st) { e.preventDefault(); open(); } });
  return st;
}
/* the whole edition goes to Done at once: picked in Gmail's own list and archived there, the rest one by one */
async function paperDone(stories) {
  const ids = stories.map((r) => r.id);
  if (ids.length > 1 && !(await confirmBox({ title: "Put away " + ids.length + " stories?", body: ["They go to Done (archived): out of the inbox, still in All mail and search. Undo puts them back."], ok: "Put away" }))) return;
  for (const r of stories) hideRow(r, null);
  invalidate(true);
  const n = await archiveMany(ids);
  const u = pushUndo({ label: "Put away " + ids.length + (ids.length === 1 ? " story" : " stories"), after: ids.length === 1 ? "Back in the inbox." : "All " + ids.length + " are back in the inbox.", undo: () => unDone(ids) });
  toast(n === ids.length ? "Put away " + n + (n === 1 ? " story." : " stories.") : "Put away " + n + " of " + ids.length + ".", undoAct(u));
}
/* archive conversations (Gmail's page first, the rest out of sight: see actMany) */
const archiveMany = (ids) => actMany(ids, "done");
/* each edition goes away when the next comes out, if you asked for that */
// (looked at each time the inbox is drawn, at most once a minute; it acts only when it can act right: this account's
// inbox on screen and read in full, and you not in the middle of something)
function paperTurnover() {
  if (!enabled) return;
  const c = cp();
  if (!c.paper || !c.putAway) return;
  const now = Date.now();
  if (now - (paperTurnover.at || 0) < 60000) return;
  const key = "paper-turned:" + accountEmail(), start = editionAt(now, c.edition), last = Number(store.get(key, 0)) || 0;
  if (last >= start) return;
  const mine = sources.get(accountEmail());
  if (!calmHere() || everything || !mine || !mine.ready || ghost || peeking || now - lastInput < 30000 || writingAnything()) return;
  paperTurnover.at = now;
  store.set(key, start);
  if (!last) return; // the first time: nothing to put away yet
  // only this account's own inbox mail, and only what the previous edition (or an earlier one) held
  const old = inboxRows().filter((r) => (!r.account || r.account.index === accountIndex()) && calmFate(r, c) === "paper" && r.time <= dayShift(start, -1));
  if (old.length) archiveMany(old.map((r) => r.id)).then((n) => { if (n) toast("Last edition put away: " + n + (n === 1 ? " story." : " stories.")); });
}

/* =================================================================== ⌘Z: undo the last thing
   Gmail's own Undo while its message is up; after that, Umbra puts things back itself. */
const undos = [];
function pushUndo(u) { const e = Object.assign({ at: Date.now() }, u); undos.push(e); if (undos.length > 20) undos.shift(); return e; }
async function runUndo(u) {
  const i = undos.indexOf(u);
  if (i < 0) return; // already undone
  undos.splice(i, 1);
  // (an undo that found nothing to put back says so, rather than "Back in the inbox")
  try { const n = await u.undo(); toast(n === 0 || n === false ? "Couldn't undo that: Gmail didn't open it just now." : u.after || "Undone."); } catch (e) { toast("Couldn't undo that."); }
  everyKeys = ["!redraw"];
  invalidate(true);
}
// the Undo button on a note (for one thing in particular)
const undoAct = (u) => ({ label: "Undo", run: () => runUndo(u) });
async function undoLast() {
  while (undos.length && Date.now() - undos[undos.length - 1].at > 10 * 60 * 1000) undos.pop();
  const u = undos[undos.length - 1];
  // Gmail's own toast first: it's the exact reverse of what just happened (unless what just happened was several, and
  // Gmail's note is only for the last of them)
  const g = document.getElementById("qm-gtoast");
  const gb = g && !g.classList.contains("qm-out") && $$("button", g).find((b) => /^undo$/i.test(text(b)));
  if (gb && !(u && u.ids && u.ids.length > 1 && Date.now() - u.at < 30000)) { gb.click(); return; }
  if (!u) { toast("Nothing to undo."); return; }
  await runUndo(u);
}
/* out of Trash: each conversation opened there out of sight and moved back to the inbox */
async function unTrash(ids) {
  let n = 0;
  for (const id of ids) { gone.delete(id); await ghostThread({ id, folder: "#trash" }, async () => { const b = gmailToolbar(null, ["Move to Inbox", "Not spam"]); if (b) { press(b); n++; backInList(id); } await wait(300); }); await until(() => !ghost, 4000, 50); }
  return n;
}
/* back to the inbox: each conversation opened out of sight and moved back */
async function unDone(ids) {
  let n = 0;
  for (const id of ids) { gone.delete(id); await ghostThread({ id }, async () => { const b = gmailToolbar(null, ["Move to Inbox"]); if (b) { press(b); n++; backInList(id); } await wait(300); }); await until(() => !ghost, 4000, 50); }
  return n;
}
/* the row of a conversation put back (in the inbox it's back in): the very row, where it was, at once */
function backInList(id) {
  const r = goneRows.get(String(id));
  goneRows.delete(String(id));
  gone.delete(String(id));
  const src = mainSource();
  if (r && src && isInboxFolder(everyFolder || "#inbox") && !src.rows.has(r.id)) src.rows.set(r.id, r);
  everyKeys = ["!redraw"];
}
// Gmail's own Undo (on its note, or by ⌘Z while it's up) undoes what was just done: Umbra's entry for that goes too,
// so the next ⌘Z doesn't do it again (only when the entry was for that one thing)
document.addEventListener("click", (e) => {
  const b = e.target && e.target.closest && e.target.closest("#qm-gtoast button");
  if (!b || !/^undo$/i.test(text(b))) return;
  const u = undos[undos.length - 1];
  if (u && Date.now() - u.at < 20000 && !(u.ids && u.ids.length > 1)) { undos.pop(); for (const id of u.ids || []) backInList(id); }
}, true);

/* =================================================================== the tab's title
   Gmail's says "Inbox (3,145)": with a calm title it says where you are, and not how much is waiting. */
let titleObs = null;
function calmTitle() {
  const want = enabled && cp().title; // (plain Gmail: Gmail's own title, counts and all)
  const t = document.querySelector("title");
  if (!t) return;
  if (!titleObs) {
    // (what Gmail set before anyone was listening: read at the start, the title may still have been blank)
    if (document.title && document.title !== calmTitle.mine) rawTitle = document.title;
    titleObs = new MutationObserver(() => {
      const now = document.title;
      if (now !== calmTitle.mine) rawTitle = now; // Gmail set it
      calmTitle();
    });
    titleObs.observe(t, { childList: true, characterData: true, subtree: true });
  }
  const clean = want ? rawTitle.replace(/\s*\(\s*[\d,.\s]+\+?\s*\)/g, "").replace(/\s+-\s+Gmail\s*$/, "") : rawTitle;
  if (clean && document.title !== clean) { calmTitle.mine = clean; document.title = clean; }
}

/* =================================================================== time spent, by sender
   While a conversation is open and you're there (the tab in front, and you've touched something in the last
   minute), its seconds count toward the person it's from. Weeks are kept for two months, on this computer. */
let readingFrom = "";
// the Monday a week starts on, as "2026-10-05" (local time)
const weekKey = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
let timeOwed = new Map(); // email -> seconds not yet written (kept, and written about once a minute)
const writeTime = () => {
  if (!timeOwed.size) return;
  const k = "time:" + accountEmail();
  const all = store.get(k, {}) || {};
  const wk = weekKey(Date.now());
  for (const [email, secs] of timeOwed) { const me = all[email] || (all[email] = {}); me[wk] = (me[wk] || 0) + secs; }
  timeOwed = new Map();
  // two months is plenty
  const cut = weekKey(Date.now() - 63 * 86400000);
  for (const e of Object.keys(all)) { for (const w of Object.keys(all[e])) if (w < cut) delete all[e][w]; if (!Object.keys(all[e]).length) delete all[e]; }
  store.set(k, all);
};
setInterval(() => {
  if (!readingFrom || document.hidden || !/^(thread|reading)$/.test(screen.kind) || Date.now() - lastInput > 60000) return;
  timeOwed.set(readingFrom, (timeOwed.get(readingFrom) || 0) + 5);
}, 5000);
setInterval(writeTime, 60000);
window.addEventListener("pagehide", writeTime);
document.addEventListener("visibilitychange", () => { if (document.hidden) writeTime(); });
/* minutes a week each sender has had (the last four weeks), with how many emails a week they send */
function timeBySender() {
  const all = store.get("time:" + accountEmail(), {}) || {};
  const since = weekKey(Date.now() - 27 * 86400000);
  const counts = new Map();
  const month = Date.now() - 28 * 86400000;
  for (const r of inboxRows()) { if (r.time < month) continue; const who = senderOf(r); if (who) counts.set(who.email, (counts.get(who.email) || 0) + 1); }
  const out = [];
  for (const [email, weeks] of Object.entries(all)) {
    const secs = Object.entries(weeks).filter(([w]) => w >= since).reduce((s, [, v]) => s + v, 0);
    if (secs < 30) continue;
    const weeksIn = Math.max(1, Object.keys(weeks).filter((w) => w >= since).length, 4);
    out.push({ email, mins: secs / 60 / weeksIn, perWeek: (counts.get(email) || 0) / 4, name: personName(email, (seen.get(email) || {}).name) || email });
  }
  return out.sort((a, b) => b.mins - a.mins).slice(0, 20);
}

/* =================================================================== a row's "…": its sender, your way */
function rowMore(r, anchor) {
  const who = senderOf(r);
  const items = [];
  // (a mail robot, like the one that says a message bounced: no rules for it, and nothing to unsubscribe from)
  const robot = who && /^(mailer-daemon|postmaster|mail-daemon)@/i.test(who.email);
  if (who && robot) items.push({ label: "All mail from " + who.name.split(/\s+/)[0], run: () => go(searchHash("from:" + who.email)) });
  else if (who) {
    const rule = ruleFor(who.email);
    const first = who.name.split(/\s+/)[0] || who.email;
    items.push(rule && rule.kind === "vip" ? { label: "Stop letting " + first + " through", run: () => setRule(who.email, "", who.name) } : { label: "Always let " + first + " through", run: () => setRule(who.email, "vip", who.name) });
    if (!isFromPerson(r) || (rule && rule.kind === "paper")) items.push(rule && rule.kind === "paper" ? { label: "Keep " + first + " in the inbox", run: () => setRule(who.email, "", who.name) } : { label: "Send " + first + " to the paper", run: () => setRule(who.email, "paper", who.name) });
    items.push(rule && rule.kind === "quiet" ? { label: "Unquiet " + first, run: () => setRule(who.email, "", who.name) } : { label: "Quiet " + first + " for a month", run: () => setRule(who.email, "quiet", who.name) });
    items.push("-", { label: "All mail from " + first, run: () => go(searchHash("from:" + who.email)) });
    items.push({ label: "Files from " + first, run: () => { files.kind = "all"; files.large = false; files.from = { email: who.email, name: who.name }; goFiles(); } });
    if (!isFromPerson(r)) items.push("-", { label: "Unsubscribe…", run: () => unsubscribeFrom(r, who) });
  }
  const el = $(`#qm-view .qm-row[data-id="${CSS.escape(r.id)}"]:not(.qm-leaving *)`);
  if (everyFolder === "#drafts") items.push(items.length ? "-" : null, { label: "Discard draft", run: () => rowDo(r, "discard", el) });
  else {
    // what Gmail's own menu on a conversation has (the buttons on the row do the rest)
    const away = (ok) => { if (ok && isInboxFolder(everyFolder)) hideRow(r, el); };
    items.push(items.length ? "-" : null,
      { label: "Move to…", run: () => bulkPicker(["Move to"], ["Move to"], anchor, [r]) },
      { label: "Labels…", run: () => bulkPicker(["Labels", "Label as"], ["Label as", "Labels"], anchor, [r]) },
      r.important ? { label: "Mark as not important", run: () => rowGmail(r, ["Mark as not important"], ["Mark as not important"]) } : { label: "Mark as important", run: () => rowGmail(r, ["Mark as important"], ["Mark as important"]) },
      { label: "Mute", run: () => rowGmail(r, ["Mute"], ["Mute"]).then(away) },
      "-",
      binFolder() ? null : { label: "Report spam", run: () => rowGmail(r, ["Report spam"], ["Report spam"]).then((ok) => { if (ok) hideRow(r, el); }) },
      { label: binFolder() ? "Delete forever" : "Delete", run: () => rowDo(r, "trash", el) });
  }
  openMenu(anchor, items.filter(Boolean));
}
/* unsubscribing goes through Gmail's own Unsubscribe (on the email itself), with Gmail's own question first */
async function unsubscribeFrom(r, who) {
  const ok = await confirmBox({ title: "Unsubscribe from " + who.name + "?", body: ["Gmail asks " + who.name + " to stop sending you mail. Some senders take a few days to stop."], ok: "Unsubscribe" });
  if (!ok) return;
  await ghostThread(r, async () => {
    const b = $$(".Ca, [role=link], button, span", gmailMain() || document).find((x) => /^unsubscribe$/i.test(text(x)) && visible(x));
    if (!b) { toast("Gmail doesn't offer Unsubscribe for this sender. Try their own link in the email."); return; }
    press(b);
    // Gmail's own confirmation: its "Unsubscribe" button
    const yes = await until(() => $$('[role="alertdialog"] button, [role="dialog"] button').find((x) => /^unsubscribe$/i.test(text(x)) && visible(x)), 4000, 80);
    if (yes) { press(yes); toast("Unsubscribed from " + who.name + "."); }
    else toast("Gmail opened " + who.name + "'s own unsubscribe page.");
    await wait(400);
  });
}

/* =================================================================== Settings › Calm */
function calmPage(redraw) {
  const c = cp();
  const set = (patch) => { setCalm(patch); redraw(); };
  const row = (label, note, ...ctl) => h("div", { class: "qm-prow" }, h("span", { class: "qm-tl" }, h("span", { text: label }), note ? h("small", { text: note }) : null), ...ctl);
  const sw = (key, label, note, disabled) => {
    const input = h("input", { type: "checkbox", checked: !!c[key], disabled: !!disabled });
    input.addEventListener("change", () => set({ [key]: input.checked }));
    return h("label", { class: "qm-toggle" + (disabled ? " qm-off" : "") }, h("span", { class: "qm-tl" }, h("span", { text: label }), note ? h("small", { text: note }) : null), input, h("span", { class: "qm-switch", "aria-hidden": "true" }));
  };
  const seg = (label, key, options, note, after) => {
    const g = h("div", { class: "qm-seg", role: "group", "aria-label": label });
    for (const [l, v] of options) g.appendChild(h("button", { type: "button", "aria-pressed": String(c[key] === v), onclick: () => { const patch = { [key]: v }; if (after) after(v, patch); set(patch); } }, l));
    return row(label, note, g);
  };
  const timeIn = (min, onSet, label) => {
    const i = h("input", { type: "time", value: clockText(min, true), "aria-label": label, step: "300" });
    i.addEventListener("change", () => { const m = parseClock(i.value); if (!Number.isNaN(m)) onSet(m); });
    i.addEventListener("keydown", (e) => e.stopPropagation());
    return i;
  };
  const sec = h("section", {});
  // tides
  sec.append(h("h3", { text: "Tides" }),
    h("p", { class: "qm-pnote qm-lead", text: "New mail arrives all at once at a few set times, instead of one at a time all day. Until the next tide it waits out of sight, and you can always let it in early." }),
    seg("New mail arrives", "tides", [["Anytime", "off"], ["Twice a day", "two"], ["Three times", "three"], ["Your times", "custom"]], null,
      (v, patch) => { if (v !== "off" && c.tides === "off") tidesStart(); }));
  if (c.tides !== "off") {
    const mins = tideMins(c);
    if (c.tides === "custom") {
      const list = h("div", { class: "qm-times" }, ...mins.map((m, i) => h("span", { class: "qm-time" }, timeIn(m, (v) => { const t = mins.slice(); t[i] = v; set({ tideTimes: tideList(t) }); }, "Tide " + (i + 1)),
        mins.length > 1 ? h("button", { type: "button", class: "qm-x", "aria-label": "Remove this tide", onclick: () => set({ tideTimes: mins.filter((_, j) => j !== i) }) }, icon("x")) : null)),
        mins.length < 6 ? h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => { const last = mins[mins.length - 1] || 540; set({ tideTimes: tideList([...mins, Math.min(1380, last + 180)]) }); } }, "Add a time") : null);
      sec.append(h("div", { class: "qm-prow qm-tiderow" }, h("span", { class: "qm-tl" }, h("span", { text: "Tides at" })), list));
    } else sec.append(row("Tides at", mins.map(clockAt).join(" · ")));
    sec.append(sw("vip", "Always let through: people you've marked", "Mark anyone with “…” on their email."),
      sw("waiting", "People waiting on you", "When someone's waiting for your answer, it doesn't wait for a tide."),
      sw("mine", "Conversations you're part of", "Replies in conversations you've written in come in right away."),
      h("p", { class: "qm-pnote", text: "Gmail's own notifications (on your phone, or in the browser) still arrive as mail does: turn them off in Gmail for tides to be truly quiet." }));
  }
  // the paper
  sec.append(h("h3", { text: "The paper" }),
    sw("paper", "Fold newsletters and notifications into a paper", "One page of them each morning, in sections, instead of all through your inbox. Mail from people never goes there."));
  if (c.paper) {
    const kinds = h("div", { class: "qm-kinds", role: "group", "aria-label": "What goes in the paper" }, ...["Newsletters", "Updates", "Orders", "Events", "Travel", "Security", "Social", "Promotions"].map((k) => {
      const on = c.paperKinds.includes(k);
      return h("button", { type: "button", class: "qm-fkind", "aria-pressed": String(on), onclick: () => set({ paperKinds: on ? c.paperKinds.filter((x) => x !== k) : [...c.paperKinds, k] }) }, k);
    }));
    sec.append(row("Each edition comes out at", "Mail that arrives after that waits for the next one.", timeIn(c.edition, (m) => set({ edition: m }), "Edition time")),
      row("What goes in", "Anything from a person stays in your inbox."), kinds,
      sw("putAway", "Put each edition away when the next comes out", "The last edition goes to Done (archived), still searchable. Off, Done with this edition does it when you say."));
  }
  // the inbox
  sec.append(h("h3", { text: "The inbox" }),
    seg("The inbox ends", "ends", [["Never", "never"], ["After two weeks", "2w"], ["After a month", "1m"]], "Older mail you've read stays in All mail, instead of an endless list."),
    sw("title", "No unread counts", "The tab says “Inbox”, not “Inbox (3,145)”, and the menu doesn't count what's waiting."));
  // senders
  const rules = Object.entries(prefs.rules || {}).filter(([e]) => ruleFor(e)).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  sec.append(h("h3", { text: "Senders" }));
  if (!rules.length) sec.append(h("p", { class: "qm-pnote", text: "Use “…” on any email to always let its sender through, send them to the paper, or quiet them for a month. They'll be listed here." }));
  for (const [email, r] of rules) {
    const name = r.name || personName(email) || email;
    const g = h("div", { class: "qm-seg", role: "group", "aria-label": name });
    for (const [l, v] of [["Let through", "vip"], ["Paper", "paper"], ["Quiet", "quiet"]]) g.appendChild(h("button", { type: "button", "aria-pressed": String(r.kind === v), onclick: () => { setRule(email, v, name); redraw(); } }, l));
    sec.append(h("div", { class: "qm-prow qm-rulerow" }, avatarEl(email, name, "qm-pav"), h("span", { class: "qm-tl" }, h("span", { text: name }), h("small", { text: r.kind === "quiet" && r.until ? email + " · until " + new Date(r.until).toLocaleDateString([], { month: "short", day: "numeric" }) : email })),
      g, h("button", { type: "button", class: "qm-x", "aria-label": "Back to normal", title: "Back to normal", onclick: () => { setRule(email, "", name); redraw(); } }, icon("x"))));
  }
  return sec;
}

/* =================================================================== Senders: not opened, and your time
   The Subscriptions page has two more views: who you never open (and a way out of all of them at once), and
   who takes your time. */
let subsTab = "subs";
let notOpened = { at: 0, acct: "", opened: null, busy: false };
function subsTabs(el, all) {
  const tabs = $(".qm-subtabs", el);
  const tsig = subsTab;
  if (tabs.dataset.sig !== tsig) {
    tabs.dataset.sig = tsig;
    tabs.replaceChildren(...[["Subscriptions", "subs"], ["Not opened", "unopened"], ["Your time", "time"]].map(([l, v]) =>
      h("button", { type: "button", role: "tab", "aria-selected": String(subsTab === v), "aria-pressed": String(subsTab === v), onclick: () => { subsTab = v; $(".qm-sublist", el).dataset.sig = ""; invalidate(true); } }, l)));
  }
  $(".qm-subfind", el).hidden = subsTab !== "subs";
  if (subsTab === "subs") return false;
  const note = $(".qm-subnote", el), box = $(".qm-sublist", el), tail = $(".qm-tail", el);
  if (subsTab === "unopened") {
    const t = "Subscriptions you haven't opened anything from in 60 days. Unsubscribing goes through Gmail, sender by sender.";
    if (note.textContent !== t) note.textContent = t;
    const live = all.filter((x) => !x.done && x.btn && x.email);
    if (notOpened.acct !== accountEmail()) { // what was found last time (it keeps for six hours)
      const kept = store.get("unopened:" + accountEmail(), null);
      if (kept && Date.now() - kept.at < 6 * 3600 * 1000 && Array.isArray(kept.looked)) notOpened = { at: kept.at, acct: accountEmail(), opened: new Set(kept.opened), looked: new Set(kept.looked), busy: false };
    }
    if (notOpened.acct !== accountEmail() || Date.now() - notOpened.at > 6 * 3600 * 1000) checkOpened(live);
    // (one that came after the look, or that the look didn't reach, isn't "not opened": it's looked at next time)
    if (notOpened.opened && notOpened.looked && live.some((x) => !notOpened.looked.has(x.email)) && Date.now() - notOpened.at > 60000 && !notOpened.busy) checkOpened(live);
    const list = notOpened.opened ? live.filter((x) => !notOpened.opened.has(x.email) && (!notOpened.looked || notOpened.looked.has(x.email))) : [];
    const sig = "u|" + (notOpened.opened ? list.map((x) => x.email).join() : notOpened.failed ? "failed" : "wait") + "|" + notOpened.busy + "|" + (notOpened.checked || 0);
    if (box.dataset.sig === sig) return true;
    box.dataset.sig = sig;
    if (!notOpened.opened && notOpened.failed && !notOpened.busy) {
      box.replaceChildren();
      tail.replaceChildren(h("div", { class: "qm-reach" }, h("span", { text: "Couldn't look at what you've opened just now." }),
        h("button", { type: "button", onclick: () => { notOpened = { at: 0, acct: "", opened: null, busy: false }; invalidate(true); } }, "Try again")));
      return true;
    }
    if (!notOpened.opened) {
      if (!box.firstChild || !box.firstChild.classList.contains("qm-loading")) box.replaceChildren(h("div", { class: "qm-loading", "aria-label": "Checking" }, h("i"), h("i"), h("i")));
      tail.replaceChildren(h("p", { class: "qm-pnote qm-center", text: "Looking at what you've opened" + (notOpened.total ? ": " + Math.min(notOpened.checked || 0, notOpened.total) + " of " + notOpened.total + " senders…" : "…") }));
      return true;
    }
    box.replaceChildren(...list.map((x) => subRow(x)));
    tail.replaceChildren(...(list.length ? [h("div", { class: "qm-reach" }, h("button", { type: "button", class: "qm-cta", onclick: () => unsubscribeAll(list) }, "Unsubscribe from all " + list.length))] : [h("div", { class: "qm-empty", text: "You've opened something from every one of them lately." })]));
    return true;
  }
  // your time
  const t2 = "Minutes a week each sender has had of your attention (while their mail was open in front of you), over the last four weeks. Only on this computer.";
  if (note.textContent !== t2) note.textContent = t2;
  const list = timeBySender();
  const sig = "t|" + list.map((x) => x.email + Math.round(x.mins) + (ruleFor(x.email) || {}).kind).join();
  if (box.dataset.sig === sig) return true;
  box.dataset.sig = sig;
  const top = Math.max(1, ...list.map((x) => x.mins));
  box.replaceChildren(...list.map((x) => {
    const rule = ruleFor(x.email);
    const bar = h("i", { class: "qm-timebar" });
    bar.style.setProperty("--w", Math.max(4, (x.mins / top) * 100) + "%");
    const row = h("div", { class: "qm-subrow qm-timerow", role: "link", tabindex: "0", title: "Mail from " + x.name },
      faceFor(x.email, x.name, isPersonAddress(x.email, x.name), "qm-subav"),
      h("span", { class: "qm-subwho" }, h("b", { text: x.name }), h("small", {}, bar, h("span", { text: (x.mins < 1 ? "under a minute" : Math.round(x.mins) + " min") + " a week" + (x.perWeek >= 0.5 ? " · " + Math.round(x.perWeek) + (Math.round(x.perWeek) === 1 ? " email" : " emails") + " a week" : "") }))),
      rule ? h("span", { class: "qm-subtag", text: rule.kind === "quiet" ? "Quiet" : rule.kind === "vip" ? "Let through" : "In the paper" }) : null,
      h("button", { type: "button", class: "qm-subbtn", onclick: (e) => { e.stopPropagation(); setRule(x.email, rule && rule.kind === "quiet" ? "" : "quiet", x.name); invalidate(true); } }, rule && rule.kind === "quiet" ? "Unquiet" : "Quiet for a month"));
    const open = () => go(searchHash("from:" + x.email));
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === row) { e.preventDefault(); open(); } });
    return row;
  }));
  tail.replaceChildren(...(list.length ? [] : [h("div", { class: "qm-empty", text: "Nothing yet: this fills in as you read." })]));
  return true;
}
function subRow(x) {
  const row = h("div", { class: "qm-subrow", role: "link", tabindex: "0", title: "Mail from " + (x.name || x.email) },
    logoEl(x.email, x.name, "qm-subav"),
    h("span", { class: "qm-subwho" }, h("b", { text: x.name || x.email }), h("small", { text: x.email })),
    h("span", { class: "qm-subfreq", text: (x.freq || "").replace(/\s*emails?\s*recently/i, " lately") }),
    h("button", { type: "button", class: "qm-subbtn", onclick: (e) => { e.stopPropagation(); press(x.btn); } }, "Unsubscribe"));
  row.addEventListener("click", () => go(searchHash("from:" + x.email)));
  return row;
}
/* who you've opened mail from in the last 60 days: one Gmail search (out of sight) per few dozen senders */
async function checkOpened(list) {
  if (notOpened.busy || !list.length) return; // (Gmail hasn't drawn its senders yet: nothing is settled on an empty page)
  const acct = accountEmail();
  const opened = new Set();
  notOpened = { at: 0, acct, opened: null, busy: true, checked: 0, total: list.length };
  try {
    // a search shows one page: when there's more than a page, the senders are split and asked again, so a sender
    // whose opened mail is further down is never mistaken for one you don't open
    const ask = async (chunk) => {
      const res = await searchHere("in:anywhere {" + chunk.map((e) => "from:" + e).join(" ") + "} is:read newer_than:60d", 200, true);
      if (!res || res.error) throw new Error("search"); // no answer isn't "never opened"
      for (const r of res.rows || []) for (const p of r.people || []) { const e = String(p[0] || p.email || "").toLowerCase(); if (chunk.includes(e)) opened.add(e); }
      const left = chunk.filter((e) => !opened.has(e));
      if (res.more && left.length && chunk.length > 1) { notOpened.checked += chunk.length - left.length; invalidate(); const mid = Math.ceil(left.length / 2); await ask(left.slice(0, mid)); if (left.length > mid) await ask(left.slice(mid)); return; }
      notOpened.checked += chunk.length; // settled: these were either found or truly not opened
      invalidate();
    };
    const emails = list.map((x) => x.email);
    for (let i = 0; i < emails.length; i += 20) await ask(emails.slice(i, i + 20));
    notOpened = { at: Date.now(), acct, opened, looked: new Set(emails), busy: false };
    store.set("unopened:" + acct, { at: notOpened.at, opened: [...opened], looked: emails });
  } catch (e) {
    notOpened = { at: Date.now(), acct, opened: null, busy: false, failed: true }; // asked again with Try again, not over and over
  }
  invalidate(true);
}
/* out of all of them: each through Gmail's own Unsubscribe, one after another, with Gmail's question answered */
async function unsubscribeAll(list) {
  const ok = await confirmBox({ title: "Unsubscribe from " + list.length + (list.length === 1 ? " sender?" : " senders?"), body: ["Gmail asks each of them to stop sending you mail. Some take a few days to stop.", "Their past mail stays where it is."], ok: "Unsubscribe from all" });
  if (!ok) return;
  let n = 0;
  for (const x of list) {
    if (!x.btn || !x.btn.isConnected) continue;
    press(x.btn);
    const yes = await until(() => $$('[role="alertdialog"] button, [role="dialog"] button').find((b) => /^unsubscribe$/i.test(text(b)) && visible(b)), 3000, 60);
    if (yes) { press(yes); n++; await until(() => !visible(yes), 3000, 60); }
    await wait(250);
  }
  toast("Unsubscribed from " + n + (n === 1 ? " sender." : " senders."));
  invalidate(true);
}
