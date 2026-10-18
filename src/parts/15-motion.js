/* =================================================================== motion
   How Umbra moves. Things travel on springs, the way Apple's do: they start at once, carry their speed, and settle
   without a wobble you'd notice. Only position, size and opacity ever animate (smooth on any machine), and nothing
   waits on a motion: a click or a key in the middle of one lands where you meant it.
   Settings › Look › Motion follows the Mac's Reduce motion (or Less, or Full). Flourishes, on unless you turn them
   off, are the little extras: a spark when you star, a check when mail goes, a reaction that flies to its place. */

// springs, sampled (response and damping as Apple writes them): snappy for controls, smooth for screens and
// things that travel, bouncy for small things that pop, gentle for what arrives (notes, rows, menus)
const SPRING = {
  snappy: { ms: 384, e: "linear(0, 0.018, 0.064, 0.129, 0.204, 0.285, 0.366, 0.445, 0.52, 0.589, 0.652, 0.709, 0.759, 0.802, 0.84, 0.872, 0.899, 0.921, 0.94, 0.955, 0.968, 0.977, 0.985, 0.991, 0.996, 0.999, 1.001, 1.003, 1.004, 1.005, 1.005, 1.005, 1.005, 1.005, 1.004, 1.004, 1.003, 1.003, 1.003, 1.002, 1)" },
  smooth: { ms: 566, e: "linear(0, 0.019, 0.068, 0.134, 0.208, 0.286, 0.363, 0.436, 0.505, 0.568, 0.625, 0.676, 0.721, 0.761, 0.795, 0.826, 0.852, 0.874, 0.893, 0.91, 0.924, 0.936, 0.946, 0.955, 0.962, 0.968, 0.974, 0.978, 0.982, 0.985, 0.987, 0.989, 0.991, 0.993, 0.994, 0.995, 0.996, 0.996, 0.997, 0.998, 1)" },
  bouncy: { ms: 598, e: "linear(0, 0.028, 0.099, 0.198, 0.314, 0.434, 0.553, 0.663, 0.763, 0.848, 0.919, 0.975, 1.018, 1.048, 1.068, 1.079, 1.083, 1.082, 1.077, 1.069, 1.059, 1.049, 1.039, 1.03, 1.021, 1.014, 1.008, 1.003, 0.999, 0.996, 0.995, 0.993, 0.993, 0.993, 0.993, 0.994, 0.995, 0.996, 0.997, 0.997, 1)" },
  gentle: { ms: 416, e: "linear(0, 0.017, 0.061, 0.124, 0.2, 0.283, 0.368, 0.452, 0.533, 0.609, 0.679, 0.741, 0.797, 0.845, 0.886, 0.921, 0.95, 0.973, 0.991, 1.005, 1.016, 1.023, 1.028, 1.03, 1.031, 1.031, 1.03, 1.028, 1.026, 1.023, 1.021, 1.018, 1.015, 1.013, 1.011, 1.009, 1.007, 1.005, 1.004, 1.003, 1)" },
};
const ACCEL = "cubic-bezier(.55, 0, .8, .3)"; // leaving: gathers speed (a thing that goes doesn't ease out)
const flourish = () => prefs.flourish !== false && !prefersStill();
/* one animation (nothing at all when motion is reduced); a spring's own length unless told otherwise */
function play(el, frames, o = {}) {
  if (!el || !el.animate || prefersStill()) return null;
  const s = o.spring ? SPRING[o.spring] : null;
  const opts = { duration: (o.ms || (s ? s.ms : 240)) * slowMo(), easing: o.easing || (s ? s.e : EASE_OUT), delay: (o.delay || 0) * slowMo(), fill: o.fill || "none" };
  try { return el.animate(frames, opts); } catch (e) { return null; }
}
const afterAnim = (a, then) => { if (!a) { then(); return; } a.finished.then(then, then); };

/* ---- press: what you press gives a little, and springs back as you let go ----
   (by its size: an icon button more, a wide button barely; a row's own buttons too, never the row) */
const PRESSABLE = "button, [role=button], .qm-minibtn, .qm-fchip, .qm-react, #qm-side a, #qm-pal .qm-pal-item, .dC .T-I";
const PRESS_IN = "#qm-view, #qm-side, #qm-panel, #qm-pal-scrim, #qm-rail, #qm-dock, .qm-menu, #qm-toast, #qm-gtoast, #qm-confirm-scrim, #qm-fview-scrim, .qm-whead, #qm-keys-scrim, #qm-person, #qm-tpl, #qm-intro, #qm-burger, #qm-chip, .dC";
let pressedEl = null;
document.addEventListener("pointerdown", (e) => {
  if (!enabled || e.button !== 0 || !e.isPrimary || prefersStill()) return;
  const el = e.target && e.target.closest && e.target.closest(PRESSABLE);
  if (!el || el.disabled || el.getAttribute("aria-disabled") === "true" || !el.closest(PRESS_IN)) return;
  const w = el.offsetWidth, hgt = el.offsetHeight;
  if (!w || w > 420 || hgt > 120) return;
  const s = w <= 44 ? 0.88 : w <= 130 ? 0.95 : 0.97;
  if (el.qmPress) el.qmPress.cancel();
  el.qmPress = play(el, [{ scale: "1" }, { scale: String(s) }], { ms: 120, easing: "cubic-bezier(.3, .7, .4, 1)", fill: "forwards" });
  pressedEl = el;
}, true);
function letGo() {
  const el = pressedEl;
  pressedEl = null;
  if (!el || !el.qmPress) return;
  // (a button that opens a window stays pressed until the window has grown out of it)
  requestAnimationFrame(() => {
    const back = () => {
      if (!el.qmPress) return;
      const from = getComputedStyle(el).scale;
      const hold = el.qmPress;
      el.qmPress = null;
      const a = play(el, [{ scale: from === "none" ? "1" : from }, { scale: "1" }], { spring: "bouncy", ms: 460 });
      hold.cancel();
      void a;
    };
    if (el.classList.contains("qm-pressing")) {
      const mo = new MutationObserver(() => { if (!el.classList.contains("qm-pressing")) { mo.disconnect(); back(); } });
      mo.observe(el, { attributes: true, attributeFilter: ["class"] });
      setTimeout(() => { mo.disconnect(); back(); }, 4000);
    } else back();
  });
}
document.addEventListener("pointerup", letGo, true);
document.addEventListener("pointercancel", letGo, true);
window.addEventListener("blur", letGo);

/* ---- lists: rows glide to where they now belong; new ones settle in from just above ---- */
function flipRows(box, change) {
  if (prefersStill() || !box || !box.isConnected || !box.offsetParent) { change(); return; }
  const sc = box.closest(".qm-scroll");
  const vr = sc ? sc.getBoundingClientRect() : { top: 0, bottom: innerHeight };
  const near = (r, pad) => r.bottom > vr.top - pad && r.top < vr.bottom + pad;
  const keyOf = (c) => c.dataset.id || c.dataset.k || "";
  const before = new Map();
  for (const c of box.children) { const k = keyOf(c); if (!k) continue; const r = c.getBoundingClientRect(); if (near(r, 120)) before.set(k, r.top); }
  change();
  if (!before.size) return;
  let n = 0;
  for (const c of box.children) {
    const r = c.getBoundingClientRect();
    if (!near(r, 0)) continue;
    if (++n > 50) break;
    const was = before.get(keyOf(c));
    if (was === undefined) { play(c, [{ opacity: 0, transform: "translateY(-8px) scale(.985)" }, { opacity: 1, transform: "none" }], { spring: "gentle" }); continue; }
    const dy = was - r.top;
    if (Math.abs(dy) >= 1) play(c, [{ transform: `translateY(${dy}px)` }, { transform: "none" }], { spring: "smooth" });
  }
}
/* a list arriving (another folder, a filter's first results): its first rows come up one after another */
function staggerIn(box, max = 14) {
  if (prefersStill() || !box) return;
  [...box.children].slice(0, max).forEach((c, i) => play(c, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { spring: "gentle", delay: i * 18, fill: "backwards" }));
}

/* ---- screens: a conversation comes in from the right, and goes back the way it came ---- */
const LISTY = /^(stream|find|files|subs|todos|paper|preview|lost|ask)$/, MAILY = /^(thread|reading|opening)$/;
let screenHow = { how: "", at: 0 };
function screenHowOf(from, to) {
  if (!from) return "fade";
  if (LISTY.test(from) && MAILY.test(to)) return "push";
  if (MAILY.test(from) && LISTY.test(to)) return "pop";
  if (LISTY.test(from) && LISTY.test(to)) return "switch";
  if (MAILY.test(from) && MAILY.test(to)) return from === "opening" ? "none" : "next";
  return "fade";
}
/* the screen going stays under the one coming, and fades as that one arrives: never a frame of empty background
   between the two. (Out of reach meanwhile: it takes no clicks, and nothing that looks for the screen finds it.) */
function screenAway(old, el, how) {
  for (const x of $$(":scope > .qm-leaving", host)) x.remove();
  const keep = old && old !== el && /^(push|pop|next|switch)$/.test(how) && !prefersStill() && !document.hidden;
  if (!keep) { host.replaceChildren(el); return; }
  for (const c of [...host.children]) if (c !== old) c.remove();
  old.classList.remove("qm-arriving");
  old.classList.add("qm-leaving");
  old.inert = true;
  old.setAttribute("aria-hidden", "true");
  el.classList.add("qm-arriving");
  host.insertBefore(el, old); // (first in the page's order too)
  const dx = how === "push" ? -14 : how === "pop" ? 14 : 0;
  const a = play(old, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: dx ? `translateX(${dx}px)` : "none" }], { ms: how === "switch" ? 110 : 130, easing: "cubic-bezier(.4, 0, 1, 1)", fill: "forwards" });
  let over = false;
  const end = () => { if (over) return; over = true; old.remove(); el.classList.remove("qm-arriving"); };
  afterAnim(a, end);
  setTimeout(end, 600 * slowMo());
}
function screenIn(el, from, to) {
  const how = screenHowOf(from, to);
  screenHow = { how, at: Date.now() };
  // (the real conversation replacing what was drawn while Gmail loaded it: what's new fades in, the title stays)
  if (how === "none") { ROOT.classList.remove("qm-sliding"); if (from === "opening") requestAnimationFrame(() => fadeAllBut(el, $("h1", el), 160)); return; }
  const frames = {
    push: [{ opacity: 0, transform: "translateX(28px)" }, { opacity: 1, offset: 0.4 }, { opacity: 1, transform: "none" }],
    pop: [{ opacity: 0, transform: "translateX(-20px)" }, { opacity: 1, offset: 0.4 }, { opacity: 1, transform: "none" }],
    next: [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, offset: 0.4 }, { opacity: 1, transform: "none" }],
    switch: [{ opacity: 0 }, { opacity: 1 }],
    fade: [{ opacity: 0 }, { opacity: 1 }],
  }[how];
  const a = /^(switch|fade)$/.test(how) ? play(el, frames, { ms: 160, easing: "ease-out" }) : play(el, frames, { spring: "smooth" });
  // Gmail's editor sits over the reply box from outside it: out of sight while the screen moves, then placed again
  // once the screen is where it stays
  const token = (screenIn.n = (screenIn.n || 0) + 1);
  ROOT.classList.toggle("qm-sliding", !!a && !/^(switch|fade)$/.test(how));
  afterAnim(a, () => { if (screenIn.n === token) ROOT.classList.remove("qm-sliding"); const c = composerOf(); if (c && c.ip) placeBar(c); });
}
/* everything in a screen fades in except `keep` (and what holds it), which is already where it belongs */
function fadeAllBut(root, keep, ms) {
  if (!root || prefersStill()) return;
  const walk = (box) => {
    for (const c of box.children) {
      if (keep && c.contains(keep)) { if (c !== keep) walk(c); continue; }
      play(c, [{ opacity: 0 }, { opacity: 1 }], { ms, easing: "ease-out" });
    }
  };
  walk(root);
}
// back from a conversation, the row you opened glows for a moment (so your eye finds where you were)
let cameFrom = "";
function noteHero(r) { cameFrom = String(r.id); }
function cameBack(box) {
  if (!cameFrom || !box) return;
  const row = $(`.qm-row[data-id="${CSS.escape(cameFrom)}"]`, box);
  cameFrom = "";
  if (!row || prefersStill()) return;
  row.classList.remove("qm-came");
  void row.offsetWidth;
  row.classList.add("qm-came");
  setTimeout(() => row.classList.remove("qm-came"), 1400);
}

/* ---- leaving the list: Done slides a row away to the side, Delete lets it fall away; then the gap closes ---- */
function rowAway(el, how) {
  el.style.height = el.offsetHeight + "px";
  const away = how === "trash" ? [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.96)" }] : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(40px)" }];
  const a = play(el, away, { ms: 180, easing: ACCEL, fill: "forwards" });
  afterAnim(a, () => requestAnimationFrame(() => el.classList.add("qm-gone")));
}

/* ---- a star: it pops; with flourishes, a few sparks fly off it ---- */
function popStar(btn) {
  if (!btn || prefersStill()) return;
  const on = btn.classList.contains("qm-on");
  const svg = $("svg", btn) || btn;
  play(svg, on ? [{ scale: "1" }, { scale: "1.38", offset: 0.3 }, { scale: "1" }] : [{ scale: "1" }, { scale: "0.8", offset: 0.35 }, { scale: "1" }], { spring: "bouncy", ms: 520 });
  if (on && flourish()) sparks(btn, 6, "var(--qm-star, #f5c542)");
}
/* the star by a conversation's title, arriving: it spins up out of nothing, a little past its size, and settles */
function popStarIn(btn) {
  if (!btn || !btn.isConnected || prefersStill()) return;
  const svg = $("svg", btn) || btn;
  play(svg, [{ scale: "0", rotate: "-40deg", opacity: 0 }, { scale: "1.28", rotate: "6deg", opacity: 1, offset: 0.5 }, { scale: "1", rotate: "0deg", opacity: 1 }], { spring: "bouncy", ms: 600 });
  if (flourish()) setTimeout(() => sparks(btn, 7, "var(--qm-star, #f5c542)"), 90 * slowMo());
}
function sparks(at, n, color) {
  const r = at.getBoundingClientRect();
  if (!r.width) return;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = 17 + Math.random() * 7;
    const s = h("i", { class: "qm-spark" });
    s.style.cssText = `left:${cx}px;top:${cy}px;background:${color}`;
    document.body.appendChild(s);
    // (out fast from the star's edge, holding its light most of the way, then gone)
    const anim = play(s, [
      { transform: `translate(calc(-50% + ${Math.cos(a) * 7}px), calc(-50% + ${Math.sin(a) * 7}px)) scale(1)`, opacity: 1 },
      { opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.35)`, opacity: 0 },
    ], { ms: 520, easing: "cubic-bezier(.2, .8, .3, 1)", fill: "forwards" });
    afterAnim(anim, () => s.remove());
  }
}

/* ---- sending ----
   From a window: it gathers itself for a moment, then lifts away up and off to the right, gone, as Apple Mail's does.
   From the reply box: your words rise out of it into the conversation as the message they now are. */
function sendFlight(info) {
  const r = info.rect;
  const shell = shellAt(r, info.look);
  shell.appendChild(info.face.node);
  const dx = Math.min(280, Math.max(80, innerWidth - r.left - r.width * 0.55)), dy = -(r.top + r.height * 0.62 + 60);
  const fly = play(shell, [
    { transform: "none", easing: "cubic-bezier(.3, .7, .4, 1)" },
    { transform: "translateY(6px) scale(.985)", offset: 0.17, easing: ACCEL },
    { transform: `translate(${dx}px, ${dy}px) scale(.42) rotate(-5deg)` },
  ], { ms: 600, fill: "forwards" });
  play(shell, [{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { ms: 600, fill: "forwards" });
  afterAnim(fly, () => shell.remove());
  whoosh();
}
// the send arrow takes off, and a new one comes up into its place
function launchArrow(btn) {
  const svg = btn && $("svg", btn);
  if (!svg) return;
  play(svg, [
    { transform: "none", opacity: 1, easing: ACCEL },
    { transform: "translate(5px, -16px) rotate(8deg)", opacity: 0, offset: 0.42 },
    { transform: "translateY(12px)", opacity: 0, offset: 0.43, easing: "cubic-bezier(.2, .8, .3, 1)" },
    { transform: "none", opacity: 1 },
  ], { ms: 620 });
}
/* the message you just sent, rising out of the reply box to its place at the end of the conversation */
function sendGlide(bubble, from) {
  if (!bubble || !from || prefersStill()) return;
  const to = bubble.getBoundingClientRect();
  if (!to.width) return;
  const dx = Math.min(0, from.right - 96 - to.right), dy = from.top + 12 - to.top;
  play(bubble, [{ transformOrigin: "100% 100%", transform: `translate(${dx}px, ${dy}px) scale(.94)`, opacity: 0.35 }, { transformOrigin: "100% 100%", transform: "none", opacity: 1 }], { spring: "smooth" });
}
// a soft whoosh as mail goes (Settings › Look › Sound when mail goes; off unless you turn it on)
let audio = null;
function whoosh() {
  if (!prefs.sendSound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audio, t = ctx.currentTime, len = 0.42;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * (i / d.length)) ** 2;
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + len);
  } catch (e) { /* no sound here */ }
}

/* ---- a reaction: the emoji you chose flies to where it now sits under the message, and lands there ---- */
function flyEmoji(emoji, from, mid) {
  if (!flourish() || !from) return;
  const e = h("span", { class: "qm-flyemoji", text: emoji });
  e.style.cssText = `left:${from.left + from.width / 2}px;top:${from.top + from.height / 2}px`;
  document.body.appendChild(e);
  const find = () => $(`#qm-view .qm-msg[data-mid="${CSS.escape(String(mid))}"] .qm-react.qm-pending:not(.qm-leaving *), #qm-view .qm-article .qm-react.qm-pending:not(.qm-leaving *), #qm-mfull .qm-react.qm-pending`);
  until(find, 500, 30).then((chip) => {
    const t = chip && chip.getBoundingClientRect();
    if (!t || !t.width) {
      afterAnim(play(e, [{ transform: "translate(-50%, -50%) scale(1.2)", opacity: 1 }, { transform: "translate(-50%, calc(-50% - 40px)) scale(1.6)", opacity: 0 }], { ms: 520, easing: "ease-out", fill: "forwards" }), () => e.remove());
      return;
    }
    const dx = t.left + 18 - (from.left + from.width / 2), dy = t.top + t.height / 2 - (from.top + from.height / 2);
    const a = play(e, [
      { transform: "translate(-50%, -50%) scale(1.25)" },
      { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 50}px)) scale(1.6)`, offset: 0.45 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.85)` },
    ], { ms: 560, easing: "cubic-bezier(.3, .1, .3, 1)", fill: "forwards" });
    afterAnim(a, () => { e.remove(); const c = find(); if (c) play(c, [{ scale: "1" }, { scale: "1.22", offset: 0.35 }, { scale: "1" }], { spring: "bouncy", ms: 520 }); });
  });
}

/* ---- opening something from where it was: a file grows out of its card, a message out of its place ---- */
function zoomFrom(el, from, o = {}) {
  if (!el || !from || !from.width || prefersStill()) return play(el, [{ opacity: 0, transform: "scale(.97)" }, { opacity: 1, transform: "none" }], { spring: "gentle" });
  const to = el.getBoundingClientRect();
  if (!to.width) return null;
  const k = Math.max(0.2, Math.min(1, from.width / to.width));
  const dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2);
  play(el, [{ opacity: 0 }, { opacity: 1, offset: o.fadeAt || 0.35 }, { opacity: 1 }], { spring: "smooth" });
  return play(el, [{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transform: "none" }], { spring: "smooth" });
}
function zoomBack(el, to) {
  if (!el || prefersStill()) return null;
  const from = el.getBoundingClientRect();
  if (!to || !to.width || !from.width) return play(el, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.97)" }], { ms: 160, easing: "ease-in", fill: "forwards" });
  const k = Math.max(0.2, Math.min(1, to.width / from.width));
  const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
  return play(el, [{ opacity: 1, transform: "none" }, { opacity: 1, offset: 0.5 }, { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(${k})` }], { ms: 260, easing: "cubic-bezier(.4, 0, .6, 1)", fill: "forwards" });
}

/* ---- choosing among a few (the menu's places, Settings' pages, every segmented control, the keyboard cursor):
   the highlight slides from the old choice to the new one ---- */
const SLIDE_IN = "#qm-side, #qm-panel, #qm-view, #qm-pal";
function slideTo(from, to) {
  if (!from || !to || from === to || prefersStill() || !to.isConnected || !from.isConnected) return;
  const box = to.parentElement;
  if (!box || from.parentElement !== box) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), p = box.getBoundingClientRect();
  if (!a.width || !b.width || Math.abs(a.top - b.top) > 600) return;
  // (it slides in the chosen one's own look, as it will be once settled: its color, and in soft mode its pressed-in
  // shadow; read with its own fade stopped, or it would read the first frame of that fade)
  const tr = to.style.transition;
  to.style.transition = "none";
  const cs = getComputedStyle(to);
  const look = { bg: cs.backgroundColor, sh: cs.boxShadow, radius: cs.borderRadius };
  to.style.transition = tr;
  if (/rgba\(0, 0, 0, 0\)|transparent/.test(look.bg) && look.sh === "none") return;
  // the old one lets go of its highlight at once, and the new one shows none of its own until the plate arrives
  const ftr = from.style.transition;
  from.style.transition = "none";
  void from.offsetWidth;
  from.style.transition = ftr;
  // a plate under the row of choices (beneath their words, never over them) travels from the old one to the new
  if (box.qmPlate) box.qmPlate.remove();
  const bs = getComputedStyle(box);
  const restore = { pos: box.style.position, iso: box.style.isolation };
  if (bs.position === "static") box.style.position = "relative";
  box.style.isolation = "isolate";
  const plate = h("i", { class: "qm-plate", "aria-hidden": "true" });
  const x = b.left - p.left + box.scrollLeft - box.clientLeft, y = b.top - p.top + box.scrollTop - box.clientTop;
  plate.style.cssText = `left:${x}px;top:${y}px;width:${b.width}px;height:${b.height}px;border-radius:${look.radius};background:${look.bg};box-shadow:${look.sh}`;
  box.appendChild(plate);
  box.qmPlate = plate;
  to.classList.add("qm-slid");
  const anim = play(plate, [{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})` }, { transform: "none" }], { spring: "snappy" });
  const end = () => {
    if (box.qmPlate !== plate) return;
    box.qmPlate = null;
    plate.remove();
    // (its own highlight back at once, exactly where the plate stopped: no fade in between)
    const t2 = to.style.transition;
    to.style.transition = "none";
    to.classList.remove("qm-slid");
    void to.offsetWidth;
    to.style.transition = t2;
    box.style.position = restore.pos;
    box.style.isolation = restore.iso;
  };
  afterAnim(anim, end);
  setTimeout(end, 1200 * slowMo()); // (however the animation went, nothing stays behind)
}
const chosenState = (el) => ["aria-current", "aria-pressed", "aria-selected"].some((a) => /^(true|page)$/.test(el.getAttribute(a) || ""));
new MutationObserver((records) => {
  if (prefersStill()) return;
  const lost = new Map();
  const won = [];
  for (const m of records) {
    const el = m.target;
    if (!el.closest || !el.closest(SLIDE_IN) || !el.parentElement) continue;
    const was = /^(true|page)$/.test(m.oldValue || ""), is = chosenState(el);
    if (was && !is) lost.set(el.parentElement, el);
    else if (!was && is) won.push(el);
  }
  for (const el of won) { const from = lost.get(el.parentElement); if (from) slideTo(from, el); }
}).observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["aria-current", "aria-pressed", "aria-selected"] });
