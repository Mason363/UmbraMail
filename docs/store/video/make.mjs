// The demo video's parts, made from Umbra itself: its own stylesheet and fonts, and five screens of made-up mail as
// HyperFrames compositions (ui/*.html, 1280 × 720, drawn at 4K and kept at 2560 × 1440 so the camera can push in).
//   node make.mjs ui      writes assets/ and ui/ (after `npm run build` in the repository)
//   node make.mjs photos  fetches the three background photos into assets/photos/
//   node make.mjs clips   renders each screen and scales it into assets/clips/
// The photos (assets/photos/) are from Unsplash, under the Unsplash License: misty mountains (photo-1552152370-fb05b25ff17d),
// a sunset at sea by Hannah Reding (photo-1554213808-9c5bab0f624e), a pink sea by Clark Gu (photo-1707489636403-c539c2cdc101).
// index.html puts them together, with the words and the music (assets/bed.wav, from music.py).
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { fillIcons } from "../icons.mjs";

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const SITE = at("../../../dist/site/"), REPO = at("../../../");
const HF = "hyperframes@0.8.143";
const FPS = Number(process.env.FPS || 60);
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ---- the made-up mail: the site's demo inbox */
const demoJs = readFileSync(REPO + "site/demo.js", "utf8");
const list = (name) => new Function("return " + demoJs.match(new RegExp("const " + name + " = (\\[[\\s\\S]*?\\n  \\]);"))[1])();
const TODAY = list("TODAY");
const BRIEF = [...readFileSync(REPO + "site/demo.html", "utf8").matchAll(/<div class="qm-line"><p>([^<]+)<\/p>/g)].map((m) => m[1]);
const row = (r) => `<div class="qm-row${r.unread ? "" : " qm-read"}${r.auto ? " qm-auto" : ""}"><span class="qm-av ${r.auto ? "qm-rav" : "qm-tint"}"${r.tint ? ` style="background:${r.tint}"` : ""}>${r.ini}</span><span class="qm-who"><span class="qm-name">${esc(r.who)}</span></span><span class="qm-subj"><span class="qm-s1">${esc(r.subj)}</span><span class="qm-s2">${esc(r.snip)}</span></span><span class="qm-marks"></span><span class="qm-when">${r.when}</span></div>`;
const inbox = (n = TODAY.length) => `
<button id="qm-burger" type="button">{{icon:menu}}</button>
<div id="qm-view"><div class="qm-host"><div class="qm-screen"><div class="qm-scroll"><div class="qm-inbox">
  <section class="qm-brief">${BRIEF.map((t) => `<div class="qm-line"><p>${t}</p><button type="button" class="qm-x">{{icon:x}}</button></div>`).join("")}</section>
  <div class="qm-rows qm-avs" id="rows"><div class="qm-day">Today</div>${TODAY.slice(0, n).map(row).join("")}</div>
</div></div></div></div></div>
<div id="qm-dock"><button id="qm-fab" type="button">{{icon:plus}}</button></div>`;
// typed words: a span per letter, shown at its moment (a caret follows: see type() in the page)
const letters = (t) => [...t].map((c) => `<span class="ch">${c === " " ? "&nbsp;" : esc(c)}</span>`).join("");

/* ---- a screen: Umbra's stylesheet on the page, the look on <html>, one paused timeline built once the fonts are in */
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(", "); };
function screen(id, dur, { bg = "", cls = "qm qm-v-list qm-spacious", body, css = "", script }) {
  const look = bg ? ` style="--bg:${bg};--bg-rgb:${hex(bg)}"` : "";
  return fillIcons(`<!doctype html>
<html lang="en" class="${cls}${bg ? " qm-tinted" : ""}"${look}>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1280, height=720" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<link rel="stylesheet" href="../assets/umbra.css" />
<style>
  html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: var(--bg); }
  /* (every movement here is the timeline's: Umbra's own transitions would run on the clock) */
  *, *::before, *::after { transition: none !important; animation: none !important; }
  #root { position: relative; width: 100%; height: 100%; overflow: hidden; }
  .ch { opacity: 0; }
  .caret { position: absolute; width: 2px; height: 20px; background: var(--text); border-radius: 1px; opacity: 0; }
${css}
</style>
</head>
<body>
<div id="root" data-composition-id="${id}" data-start="0" data-duration="${dur}" data-width="1280" data-height="720">
${body}
</div>
<script>
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  // a class on or off at a moment (seekable: GSAP sets it back when the playhead goes back)
  const mark = (tl, el, name, on, t) => tl.set(el, { attr: { class: el.className.replace(new RegExp(" " + name, "g"), "") + (on ? " " + name : "") } }, t);
  // letters appear one at a time from t, and the caret keeps to the end of them
  function type(tl, box, caret, t, per) {
    const chs = $$(".ch", box), b = box.getBoundingClientRect(), p = caret.offsetParent.getBoundingClientRect();
    const x0 = b.left - p.left, y = b.top - p.top + (b.height - 20) / 2;
    tl.set(caret, { x: x0, y, opacity: 1 }, t - 0.25);
    chs.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      tl.set(c, { opacity: 1 }, t + i * per);
      tl.set(caret, { x: r.right - p.left + 1 }, t + i * per);
    });
    return t + chs.length * per;
  }
  document.fonts.ready.then(() => {
    const tl = gsap.timeline({ paused: true });
${script}
    window.__timelines["${id}"] = tl;
  });
</script>
</body>
</html>
`);
}

/* ---- the five screens */
const SCREENS = {
  // the inbox arrives; one email is done (e) and goes; the cursor goes up to Lena's
  inbox: () => screen("inbox", 6.4, {
    bg: "#1f4fd6",
    body: inbox(),
    script: `
    const rows = $$(".qm-row");
    tl.fromTo("#qm-burger", { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0.1);
    tl.fromTo(".qm-line", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.12 }, 0.2);
    tl.fromTo(".qm-day", { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0.5);
    tl.fromTo(rows, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.07 }, 0.55);
    tl.fromTo("#qm-fab", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.6)" }, 1.05);
    mark(tl, rows[2], "qm-cursor", true, 2.6);
    tl.to(rows[2], { x: -28, opacity: 0, duration: 0.34, ease: "power2.in" }, 3.2);
    const h = rows[3].offsetTop - rows[2].offsetTop;
    tl.to(rows.slice(3), { y: -h, duration: 0.55, ease: "power3.inOut" }, 3.48);
    mark(tl, rows[3], "qm-cursor", true, 3.62);
    mark(tl, rows[3], "qm-cursor", false, 4.3);
    mark(tl, rows[1], "qm-cursor", true, 4.3);
    mark(tl, rows[1], "qm-cursor", false, 4.62);
    mark(tl, rows[0], "qm-cursor", true, 4.62);`,
  }),

  // Lena's conversation; a reply typed in the box, sent, and in its place
  convo: () => {
    const said = "2 works. I'll send the slides tonight.";
    const msg = (who, when, lines, mine) => `<div class="qm-msg${mine ? " qm-mine" : ""}"><div class="qm-meta">${mine ? `<span>${when}</span>` : `<span class="qm-av qm-mav qm-tint" style="background:#7c8cf0">LP</span><span><button type="button" class="qm-whois">${who}</button> · ${when}</span>`}</div><div class="qm-bwrap"><div class="qm-bubble"><div class="qm-body qm-chat">${lines.map((l) => (l ? `<div>${esc(l)}</div>` : "<div><br></div>")).join("")}</div></div></div></div>`;
    return screen("convo", 7.4, {
      bg: "#cc1f66",
      cls: "qm qm-spacious qm-on-mail",
      css: `  .typed { position: absolute; left: 8px; right: 8px; top: 0; bottom: 0; display: flex; align-items: center; font: 400 16px/1.5 var(--sans); color: var(--text); white-space: pre; }
  .ph { position: absolute; left: 8px; top: 0; bottom: 0; display: flex; align-items: center; font: 400 16px/1.5 var(--sans); color: var(--text-5); }
  .qm-cfield { position: relative; min-height: 42px; }
  .send-on { position: absolute; inset: 0; margin: 0 !important; opacity: 0; }
  .sendbox { position: relative; width: 34px; height: 34px; margin: 4px 4px 4px 6px; flex: none; }
  .sendbox .qm-send { margin: 0; }
  .qm-convo { overflow: hidden !important; }`,
      body: `
<div id="qm-view"><div class="qm-host"><div class="qm-screen qm-thread">
  <div class="qm-head"><h1>Thursday's review</h1><div class="qm-hsub"><span><button type="button" class="qm-whois">lena.park@northfield.studio</button></span></div><div class="qm-sumslot"></div></div>
  <div class="qm-convo"><div class="qm-convo-in">
    ${msg("Lena Park", "Oct 7, 4:10 PM", ["Hi! The review is Thursday at 11, in the small room. I'll send the agenda tomorrow."])}
    ${msg("", "Oct 7, 5:02 PM", ["Sounds good. I'll bring the slides."], true)}
    ${msg("Lena Park", "2:47 PM", ["Could we move it to 2? I'd like Sam there too, and the slides by Wednesday if you can."])}
    ${msg("", "2:51 PM", [said], true).replace('class="qm-msg qm-mine"', 'class="qm-msg qm-mine new"')}
  </div></div>
  <div class="qm-cslot"><div class="qm-composer"><div class="qm-ctop"><div class="qm-ideas"></div></div>
    <div class="qm-cbox"><div class="qm-crow">
      <button type="button" class="qm-ib qm-s">{{icon:clip}}</button>
      <div class="qm-cfield"><span class="ph">Reply</span><span class="typed">${letters(said)}</span></div>
      <button type="button" class="qm-ib qm-s">{{icon:grow}}</button>
      <div class="sendbox"><button type="button" class="qm-send" disabled>{{icon:send}}</button><button type="button" class="qm-send send-on">{{icon:send}}</button></div>
    </div></div>
  </div></div>
  <div class="qm-bar qm-left"><button type="button" class="qm-ib">{{icon:back}}</button></div>
  <div class="qm-bar qm-right"><button type="button" class="qm-ib">{{icon:done}}</button><button type="button" class="qm-ib">{{icon:later}}</button><button type="button" class="qm-ib">{{icon:more}}</button></div>
</div></div></div>
<span class="caret"></span>`,
      script: `
    const msgs = $$(".qm-convo-in > .qm-msg"), next = $(".new"), inner = $(".qm-convo-in");
    tl.fromTo([".qm-head", ".qm-bar"], { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0);
    tl.fromTo(msgs.slice(0, 2), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.12 }, 0.1);
    tl.fromTo(msgs[2], { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0.95);
    tl.fromTo(".qm-cslot", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.3);
    tl.set(next, { opacity: 0 }, 0);
    // the reply, typed
    tl.set(".ph", { opacity: 0 }, 2.0);
    const done = type(tl, $(".typed"), $(".caret"), 2.0, 0.052);
    tl.to(".send-on", { opacity: 1, duration: 0.2 }, done + 0.15);
    tl.fromTo(".sendbox", { scale: 1 }, { scale: 0.88, duration: 0.12, ease: "power2.in" }, done + 0.55);
    tl.to(".sendbox", { scale: 1, duration: 0.25, ease: "back.out(2)" }, done + 0.67);
    // sent: the words leave the box and arrive as your message
    const t = done + 0.7;
    tl.to([".typed", ".caret"], { opacity: 0, duration: 0.18 }, t);
    tl.to(".send-on", { opacity: 0, duration: 0.2 }, t);
    tl.set(".ph", { opacity: 1 }, t + 0.2);
    const room = $(".qm-cslot").getBoundingClientRect().top - 18, over = next.getBoundingClientRect().bottom - room;
    if (over > 0) tl.to(inner, { y: -over, duration: 0.6, ease: "power3.inOut" }, t);
    tl.fromTo(next, { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, t + 0.05);`,
    });
  },

  // ⌘K over the inbox: down the list, then a few letters find Lena's email. Drawn as two layers: the inbox under
  // its shade (palette), and the bar alone on nothing (palette-lift, with transparency), so the bar can rise off the window
  palette: (lift) => {
    const item = (ico, label, hint, sub) => `<div class="qm-pal-item"><span class="qm-pal-ico">{{icon:${ico}}}</span><span class="qm-pal-t"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${hint ? `<span class="qm-pal-hint">${hint}</span>` : ""}</div>`;
    const tag = (ico, label, sub, t) => `<div class="qm-pal-item"><span class="qm-pal-ico">{{icon:${ico}}}</span><span class="qm-pal-t"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span><span class="qm-pal-tag">${t}</span></div>`;
    const sec = (t) => `<div class="qm-pal-sec">${t}</div>`;
    return screen(lift ? "palette-lift" : "palette", 5.2, {
      bg: "#0f8f4a",
      css: (lift ? `  html, body, html.qm, html.qm body { background: transparent !important; }
  #qm-view, #qm-dock, #qm-burger { visibility: hidden !important; }
  #qm-pal-scrim { background: transparent !important; }
` : `  #qm-pal, .caret { visibility: hidden !important; }
`) + `  .qm-pal-list { position: relative; }
  .found { position: absolute; left: 0; right: 0; top: 0; padding: 6px; opacity: 0; }
  .field { position: relative; flex: 1; height: 24px; }
  .field .ph, .field .typed { position: absolute; inset: 0; display: flex; align-items: center; font: 400 17px var(--sans); white-space: pre; }
  .field .ph { color: var(--text-5); }
  .field .typed { color: var(--text); }
  .qm-pal-list { overflow: hidden !important; }`,
      body: inbox(5) + `
<div id="qm-pal-scrim"><div id="qm-pal" role="dialog">
  <div class="qm-pal-in">{{icon:find}}<div class="field"><span class="ph">Filter, switch account, write, or open a draft…</span><span class="typed">${letters("lena")}</span></div><kbd>esc</kbd></div>
  <div class="qm-pal-list">
    <div class="all">${sec("Filters")}${item("unread", "Unread")}${item("people", "From people")}${item("todos", "Needs you")}${item("starred", "Starred")}${item("clip", "With attachments")}${sec("Write")}${item("write", "New message", "C")}</div>
    <div class="found">${tag("inbox", "Thursday's review", "Lena Park · 2:47 PM", "Mail")}${tag("people", "All mail from Lena Park", "lena.park@northfield.studio", "Go to")}${tag("write", "New message to Lena Park", "", "Write")}</div>
  </div>
</div></div>
<span class="caret"></span>`,
      script: `
    const scrim = $("#qm-pal-scrim"), pal = $("#qm-pal"), all = $$(".all .qm-pal-item"), found = $$(".found .qm-pal-item");
    // (the bar is as tall as its list: it closes up around what matches)
    const listEl = $(".qm-pal-list"), h0 = $(".all").offsetHeight, h1 = $(".found").offsetHeight - 12;
    tl.set(listEl, { height: h0 }, 0);
    tl.to(listEl, { height: h1, duration: 0.34, ease: "power3.out" }, 2.24);
    tl.set(scrim, { opacity: 0 }, 0);
    tl.to(scrim, { opacity: 1, duration: 0.3, ease: "power2.out" }, 0.45);
    tl.fromTo(pal, { opacity: 0, scale: 0.965, y: -8 }, { opacity: 1, scale: 1, y: 0, duration: 0.42, ease: "power3.out" }, 0.45);
    mark(tl, all[0], "qm-on", true, 0.45);
    mark(tl, all[0], "qm-on", false, 1.25); mark(tl, all[1], "qm-on", true, 1.25);
    mark(tl, all[1], "qm-on", false, 1.55); mark(tl, all[2], "qm-on", true, 1.55);
    // a few letters: the list becomes what matches
    tl.set(".field .ph", { opacity: 0 }, 2.15);
    type(tl, $(".field .typed"), $(".caret"), 2.15, 0.11);
    tl.to(".all", { opacity: 0, duration: 0.14 }, 2.2);
    tl.to(".found", { opacity: 1, duration: 0.2 }, 2.26);
    mark(tl, found[0], "qm-on", true, 2.26);
    tl.fromTo(found, { y: 6 }, { y: 0, duration: 0.35, ease: "power3.out", stagger: 0.04 }, 2.26);`,
    });
  },
  "palette-lift": () => SCREENS.palette(true),

  // new mail a few times a day: four wait for the tide; let in, they arrive together at the top
  tides: () => screen("tides", 5.6, {
    bg: "#1f4fd6",
    css: `  .qm-calmslot { margin: -24px 0 28px; }`,
    body: inbox().replace('<div class="qm-rows qm-avs" id="rows">', `<div class="qm-calmslot"><div class="qm-cpills"><div class="qm-cpill qm-tidepill">{{icon:later}}<span>4 waiting for the tide at 3:00 PM</span><button type="button" class="letin">Let them in</button></div></div></div><div class="qm-rows qm-avs" id="rows">`),
    script: `
    const rows = $$(".qm-row"), fresh = rows.slice(0, 4), old = rows.slice(4), h = rows[1].offsetTop - rows[0].offsetTop;
    const slot = $(".qm-calmslot"), pill = $(".qm-tidepill");
    tl.set(fresh, { opacity: 0 }, 0);
    tl.set(old, { y: -4 * h }, 0);
    tl.fromTo("#qm-burger", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0);
    tl.fromTo(".qm-line", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.1 }, 0.05);
    tl.fromTo(pill, { opacity: 0, y: 10, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: "power3.out" }, 0.3);
    tl.fromTo([".qm-day", ...old], { opacity: 0 }, { opacity: 1, duration: 0.6, stagger: 0.06 }, 0.4);
    tl.fromTo("#qm-fab", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, 0.6);
    // let them in: the button gives, the pill goes, and the four arrive together
    tl.fromTo(".letin", { scale: 1 }, { scale: 0.9, duration: 0.12, ease: "power2.in" }, 2.2);
    tl.to(".letin", { scale: 1, duration: 0.25, ease: "back.out(2)" }, 2.32);
    tl.to(pill, { opacity: 0, scale: 0.96, duration: 0.3, ease: "power2.in" }, 2.45);
    tl.to(slot, { height: 0, marginTop: 0, marginBottom: 0, duration: 0.5, ease: "power3.inOut" }, 2.6);
    tl.to(old, { y: 0, duration: 0.75, ease: "power3.inOut" }, 2.75);
    tl.fromTo(fresh, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.08 }, 2.95);`,
  }),

  // your colors, then your pictures: the same inbox in blue, pink and green, then over three photos
  looks: () => screen("looks", 6.6, {
    bg: "#1f4fd6",
    css: `  html.qm {
    --qm-bgimg: none; --qm-bgdim: 0.36;
    --qm-halo: 0 0 1px rgba(15, 16, 18, .5), 0 1px 3px rgba(15, 16, 18, .7), 0 0 16px rgba(15, 16, 18, .7), 0 0 34px rgba(15, 16, 18, .4);
    --qm-halo-icon: drop-shadow(0 1px 2px rgba(15, 16, 18, .8)) drop-shadow(0 0 8px rgba(15, 16, 18, .6));
  }
  .pic { position: absolute; inset: 0; z-index: -2; background-size: cover; background-position: 50% 50%; opacity: 0; }`,
    body: inbox(5).replace('<div id="qm-view">', '<div id="qm-view"><div class="pic" style="background-image:url(../assets/photos/mountains.jpg)"></div><div class="pic" style="background-image:url(../assets/photos/sunset.jpg);background-position:50% 62%"></div><div class="pic" style="background-image:url(../assets/photos/sea.jpg)"></div>'),
    script: `
    const R = document.documentElement, pics = $$(".pic");
    const to = (c, rgb, t, d = 0.45) => tl.to(R, { "--bg": c, "--bg-rgb": rgb, duration: d, ease: "sine.inOut" }, t);
    to("#cc1f66", "204, 31, 102", 0.55);
    to("#0f8f4a", "15, 143, 74", 1.3);
    // your own picture: the first fades in as the page goes dark behind it, the next ones wipe in from the right
    tl.set(R, { attr: { class: "qm qm-v-list qm-spacious qm-bgimg qm-halo qm-halo-read" } }, 2.1);
    tl.fromTo(pics[0], { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 0.8, ease: "power2.out" }, 2.1);
    to("#0f1012", "15, 16, 18", 2.1, 0.6);
    for (const [i, t] of [[1, 3.55], [2, 5.0]]) {
      tl.set(pics[i], { opacity: 1 }, t);
      tl.fromTo(pics[i], { clipPath: "inset(0% 0% 0% 100%)", scale: 1.06 }, { clipPath: "inset(0% 0% 0% 0%)", scale: 1, duration: 0.9, ease: "power3.inOut" }, t);
    }`,
  }),

  // the paper: newsletters, one page, read like one
  paper: () => {
    const story = (ini, who, when, title, deck, unread) => `<article class="qm-story${unread ? "" : " qm-read"}"><div class="qm-sfrom"><span class="qm-av qm-rav">${ini}</span><span>${esc(who)}</span><time>${when}</time></div><h3>${esc(title)}</h3><p>${esc(deck)}</p><div class="qm-sacts"><button type="button" class="qm-ib qm-s">{{icon:done}}</button></div></article>`;
    const sections = [
      ["Newsletters", [["M", "Morning Brief", "7:02 AM", "Five things to know today", "Rates hold steady, a quieter week for markets, and the river bridge reopens on Saturday.", 1], ["S", "Slow Cooking", "6:30 AM", "A one-pot week", "Five dinners that start in the same pan, and a bread that needs no kneading.", 1], ["D", "Design Weekly", "Oct 8", "The return of the serif", "Why editorial type is back on screens, with twelve examples worth keeping.", 0]]],
      ["Updates", [["F", "Fieldnote", "10:13 AM", "Your weekly summary", "Three notebooks changed this week, and two are waiting for your review.", 1], ["C", "Cityline Transit", "8:40 AM", "Weekend service changes", "The Blue Line runs every 12 minutes on Saturday, between 9 AM and 5 PM.", 0]]],
      ["Orders", [["P", "Pine & Co.", "9:15 AM", "Your order has shipped", "Two linen shirts are on their way, arriving Tuesday, October 13.", 0]]],
    ];
    return screen("paper", 5.2, {
      body: `
<button id="qm-burger" type="button">{{icon:menu}}</button>
<div id="qm-view"><div class="qm-host"><div class="qm-screen"><div><div class="qm-scroll" style="overflow:hidden"><div class="qm-inbox qm-paper">
  <div class="qm-titlerow"><button type="button" class="qm-ib qm-tback">{{icon:back}}</button><div class="qm-masthead"><h1 class="qm-title">The Paper</h1><p class="qm-dateline">Friday, October 9 · 6 stories</p></div></div>
  <div class="qm-papersec">${sections.map(([k, v]) => `<section class="qm-psection"><h2>${k}</h2><div class="qm-stories">${v.map((s) => story(...s)).join("")}</div></section>`).join("")}</div>
</div></div><div class="qm-fade"></div></div></div></div></div>
<div id="qm-dock"><button id="qm-fab" type="button">{{icon:plus}}</button></div>`,
      script: `
    tl.fromTo("#qm-burger", { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0);
    tl.fromTo(".qm-titlerow", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, 0.05);
    tl.fromTo(".qm-psection h2", { opacity: 0 }, { opacity: 1, duration: 0.6, stagger: 0.25 }, 0.35);
    tl.fromTo(".qm-story", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.75, ease: "power3.out", stagger: 0.08 }, 0.4);
    tl.fromTo("#qm-fab", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, 0.9);
    // and on down the page, slowly
    tl.fromTo(".qm-paper", { y: 0 }, { y: -230, duration: 3.4, ease: "sine.inOut" }, 1.6);`,
    });
  },
};

/* ---- the photos (Unsplash License; see the top of this file) */
const PHOTOS = { mountains: "1552152370-fb05b25ff17d", sunset: "1554213808-9c5bab0f624e", sea: "1707489636403-c539c2cdc101" };
async function getPhotos() {
  mkdirSync(at("./assets/photos/"), { recursive: true });
  for (const [name, id] of Object.entries(PHOTOS)) {
    const r = await fetch(`https://images.unsplash.com/photo-${id}?w=2560&q=86&fm=jpg`);
    if (!r.ok) throw new Error("couldn't fetch " + name + ": " + r.status);
    writeFileSync(at(`./assets/photos/${name}.jpg`), Buffer.from(await r.arrayBuffer()));
    console.log("  assets/photos/" + name + ".jpg");
  }
}

/* ---- the backdrop's grain: soft grey noise, 512 × 512, tileable (a seeded generator: the same every time) */
function writeGrain() {
  const N = 512, crc = (b) => { let c = -1; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  let seed = 3;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const raw = Buffer.alloc((N + 1) * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const g = Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
    raw[y * (N + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(128 + 38 * g)));
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 0;
  writeFileSync(at("./assets/grain.png"), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
}

/* ---- write: Umbra's stylesheet and fonts, and the screens */
function writeUI() {
  mkdirSync(at("./assets/fonts/"), { recursive: true });
  mkdirSync(at("./ui/"), { recursive: true });
  writeFileSync(at("./assets/umbra.css"), readFileSync(SITE + "umbra.css", "utf8").split('url("/fonts/').join('url("fonts/'));
  for (const f of readdirSync(SITE + "fonts/")) if (f.endsWith(".woff2")) copyFileSync(SITE + "fonts/" + f, at("./assets/fonts/" + f));
  writeGrain();
  for (const [id, make] of Object.entries(SCREENS)) { writeFileSync(at(`./ui/${id}.html`), make()); console.log("  ui/" + id + ".html"); }
}

/* ---- render: each screen at 4K (3 × its 1280 × 720), then scaled down into the 1536 × 864 window it plays in */
function renderClips(only) {
  mkdirSync(at("./assets/clips/"), { recursive: true });
  mkdirSync(at("./renders/"), { recursive: true });
  for (const id of Object.keys(SCREENS)) {
    if (only.length && !only.includes(id)) continue;
    const alpha = id.endsWith("-lift");
    const big = at(`./renders/ui-${id}.${alpha ? "webm" : "mp4"}`);
    execFileSync("npx", ["--yes", HF, "render", "-c", `ui/${id}.html`, "--resolution", "landscape-4k", "--fps", String(FPS), "--quality", "delivery", ...(alpha ? ["--format", "webm"] : []), "-o", big, "--quiet"], { cwd: at("./"), stdio: "inherit" });
    const out = at(`./assets/clips/${id}.${alpha ? "webm" : "mp4"}`);
    const enc = alpha
      ? ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "18", "-auto-alt-ref", "0", "-g", "30"]
      : ["-c:v", "libx264", "-crf", "12", "-preset", "slow", "-g", "30", "-keyint_min", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...(alpha ? ["-c:v", "libvpx-vp9"] : []), "-i", big, "-vf", "scale=2560:1440:flags=lanczos", ...enc, "-an", out]);
    console.log("  assets/clips/" + id + (alpha ? ".webm" : ".mp4"));
  }
}

const [what, ...rest] = process.argv.slice(2);
if (!existsSync(SITE + "umbra.css")) { console.error("Build Umbra first: npm run build"); process.exit(1); }
if (what === "ui" || what === "all") writeUI();
if (what === "photos" || what === "all") await getPhotos();
if (what === "clips" || what === "all") renderClips(rest);
if (!["ui", "photos", "clips", "all"].includes(what)) console.log("node make.mjs ui | photos | clips [screen…] | all");
