/* =================================================================== reading
   - People: a sender's name opens a card (what you've talked about, their files, how their mail reaches you).
   - Trackers: an email that reports when it's opened says so, plainly.
   - Links: pointing at one shows where it really goes (through any click-counting redirect), and warns when the
     words of the link name one site but it goes to another.
   - Catch me up: a long conversation with new messages since you were last in it starts you at the first new one.
   - Reader view: a designed email as plain, readable text and its pictures.
   - Full screen: any message in a conversation opens on its own, read like a single email.
   - Reading type: Sans, Serif, Editorial, or Mono. */

Object.assign(ICONS, {
  eye: ["M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z", "c:12,12,3"],
  link: ["M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2", "M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"],
  reader: ["M5 4.5h14", "M5 9h14", "M5 13.5h14", "M5 18h9"],
});

/* ---- people ---- */
function whoButton(email, name, label) {
  return h("button", { type: "button", class: "qm-whois", title: name || email, onclick: (e) => { e.stopPropagation(); openPerson(email, name, e.currentTarget); } }, label || name || email);
}
function openPerson(email, name, anchor) {
  email = String(email || "").toLowerCase();
  if (!email) return;
  closeMenu();
  const old = document.getElementById("qm-person");
  if (old) { const was = old.dataset.email; old.remove(); if (was === email) return; }
  const shown = personName(email, name) || name || email;
  const rule = ruleFor(email);
  // what Umbra has seen of them (on this computer): conversations, the latest few, and how often
  const seen = recall.loaded ? [...recall.map.values()].filter((x) => x.email === (accountEmail() || x.email) && x.who.includes(email)).sort((a, b) => b.time - a.time) : [];
  const month = seen.filter((x) => Date.now() - x.time < 31 * 86400000).length;
  const person = isPersonAddress(email, name);
  const set = (kind) => { setRule(email, rule && rule.kind === kind ? "" : kind, shown); card.remove(); invalidate(true); };
  const ruleBtn = (kind, label) => h("button", { type: "button", "aria-pressed": String(!!rule && rule.kind === kind), onclick: () => set(kind) }, label);
  const card = h("div", { id: "qm-person", role: "dialog", "aria-label": shown, "data-email": email },
    h("div", { class: "qm-pchead" }, faceFor(email, shown, person, "qm-pcav"), h("div", { class: "qm-pcname" }, h("b", { text: shown }), h("small", { text: email })),
      ib("x", "Close", () => card.remove(), "qm-s")),
    h("p", { class: "qm-pcstat", text: seen.length ? (seen.length + (seen.length === 1 ? " conversation" : " conversations") + " here" + (month ? " · " + month + " in the last month" : "")) : "Nothing from them on this computer yet." }),
    seen.length ? h("div", { class: "qm-pclist" }, ...seen.slice(0, 4).map((x) => {
      const b = h("button", { type: "button", class: "qm-pcitem" }, h("span", { text: x.subject || "(no subject)" }), h("small", { text: x.when || "" }));
      b.addEventListener("click", () => { card.remove(); openRecalled(x); });
      return b;
    })) : null,
    h("div", { class: "qm-pcacts" },
      h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => { card.remove(); go(searchHash("from:" + email)); } }, icon("allmail"), "All mail"),
      h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => { card.remove(); files.kind = "all"; files.large = false; files.from = { email, name: shown }; goFiles(); } }, icon("clip"), "Files"),
      h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => { card.remove(); writeTo(email); } }, icon("write"), "Write")),
    h("div", { class: "qm-seg qm-pcrule", role: "group", "aria-label": "Their mail" }, ruleBtn("vip", "Let through"), ruleBtn("paper", "To the paper"), ruleBtn("quiet", "Quiet a month")));
  document.body.appendChild(card);
  // beside what was clicked, on screen
  const r = anchor.getBoundingClientRect(), c = card.getBoundingClientRect();
  const left = Math.max(12, Math.min(r.left, window.innerWidth - c.width - 12));
  const below = r.bottom + 8 + c.height < window.innerHeight - 12;
  card.style.left = left + "px";
  card.style.top = (below ? r.bottom + 8 : Math.max(12, r.top - 8 - c.height)) + "px";
  const away = (e) => { if (!card.isConnected) { off(); return; } if (!card.contains(e.target) && e.target !== anchor) { card.remove(); off(); } };
  const esc = (e) => { if (e.key === "Escape" && card.isConnected) { e.stopImmediatePropagation(); card.remove(); off(); } };
  const off = () => { document.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", esc, true); };
  setTimeout(() => { document.addEventListener("pointerdown", away, true); window.addEventListener("keydown", esc, true); }, 0);
  if (!recall.loaded) recallOpen().then(() => { if (card.isConnected) { card.remove(); openPerson(email, name, anchor); } });
}
/* a new message to them, from this account */
function writeTo(email) {
  compose().then((dlg) => {
    if (!dlg) return;
    const to = $$("input", dlg).find((i) => /^to recipients/i.test(i.getAttribute("aria-label") || ""));
    if (to) { to.focus(); document.execCommand("insertText", false, email + ", "); const subj = $("input[name='subjectbox']", dlg); if (subj) subj.focus(); }
  });
}

/* ---- trackers: an email's tracking pixels (taken out of Umbra's copy of it), said plainly ---- */
function stripTrackers(node) {
  const found = [];
  for (const img of node.querySelectorAll("img")) {
    const src = img.getAttribute("src") || "";
    const w = Number(img.getAttribute("width")) || (parseFloat(img.style.width) || 0), hgt = Number(img.getAttribute("height")) || (parseFloat(img.style.height) || 0);
    const t = trackerOf(src, w, hgt);
    if (t) { found.push(t); img.remove(); }
  }
  return found;
}
function trackerChip(entry) {
  const list = entry && entry.trackers;
  if (!list || !list.length || prefs.trackers === false) return null;
  const names = [...new Set(list.filter((t) => !/^a (read )?tracker$/.test(t)))];
  const say = (names.length ? names.join(", ") : "Its sender") + " can see when this was opened (" + list.length + (list.length === 1 ? " tracking pixel" : " tracking pixels") + "). Gmail fetches pictures through Google, so they don't learn where you are.";
  return h("span", { class: "qm-trackchip", title: say, "aria-label": say }, icon("eye"), "Tracks opens");
}

/* ---- links: where they really go ---- */
let linkTip = null;
function showLink(a) {
  const href = a.getAttribute("href") || "";
  if (!/^https?:|^mailto:|^tel:/i.test(href)) return;
  const real = realLink(href);
  if (!real || (!real.host && !real.mail && !real.tel)) return;
  const said = textHost(a.textContent || "");
  const odd = said && real.host && !sameSite(said, real.host);
  const where = real.mail ? "Writes to " + real.mail : real.tel ? "Calls " + real.tel : (real.opaque ? "Goes through " + real.via + " (where it ends up isn't in the link)" : real.host);
  const tip = linkTip || (linkTip = h("div", { id: "qm-linktip", role: "status" }));
  tip.replaceChildren(...[icon(odd ? "shield" : "link"), h("span", { class: "qm-lthost", text: where }),
    real.via && !real.opaque ? h("span", { class: "qm-ltvia", text: "via " + real.via }) : null,
    odd ? h("span", { class: "qm-ltwarn", text: "The link says " + said + "; it goes to " + real.host + "." }) : null].filter(Boolean));
  tip.classList.toggle("qm-odd", !!odd);
  if (!tip.isConnected) document.body.appendChild(tip);
  // at the bottom left of what you're reading (not over the list beside it)
  const hostEl = a.closest(".qm-host") || a.closest("#qm-view");
  tip.style.left = Math.round((hostEl ? hostEl.getBoundingClientRect().left : 0) + 16) + "px";
  tip.classList.add("qm-on");
}
function hideLink() { if (linkTip) linkTip.classList.remove("qm-on"); }
document.addEventListener("mouseover", (e) => {
  const a = e.target && e.target.closest && e.target.closest("#qm-view .qm-body a[href], #qm-view .qm-reader a[href]");
  if (a) showLink(a); else if (linkTip && linkTip.classList.contains("qm-on")) hideLink();
}, true);
document.addEventListener("focusin", (e) => { const a = e.target && e.target.closest && e.target.closest("#qm-view .qm-body a[href], #qm-view .qm-reader a[href]"); if (a) showLink(a); }, true);
window.addEventListener("hashchange", hideLink);

/* ---- catch me up: where you were in a conversation ---- */
const seenMsgs = new Map(Object.entries(store.get("seen-msgs", {}))); // thread id -> the last message id you were shown
let seenTimer = 0;
function lastSeen(tid) { return seenMsgs.get(accountEmail() + ":" + tid) || ""; }
function markSeen(t) {
  const last = t.messages[t.messages.length - 1];
  if (!t.id || !last || !last.id) return;
  clearTimeout(seenTimer);
  // seen once it's been on screen a moment (opening and leaving at once doesn't count)
  seenTimer = setTimeout(() => {
    if (screen.key !== t.id) return;
    const k = accountEmail() + ":" + t.id;
    if (seenMsgs.get(k) === last.id) return;
    seenMsgs.delete(k);
    seenMsgs.set(k, last.id);
    while (seenMsgs.size > 600) seenMsgs.delete(seenMsgs.keys().next().value);
    store.set("seen-msgs", Object.fromEntries(seenMsgs));
  }, 4000);
}
/* the new messages since you were last here: how many, and the first of them (or nothing to say) */
// (what you'd seen when you opened it: the bar stays while you're there, though it counts as seen after a moment)
const visitSeen = new Map();
function newSince(t) {
  const k = accountEmail() + ":" + t.id;
  for (const x of [...visitSeen.keys()]) if (x !== k) visitSeen.delete(x);
  if (!visitSeen.has(k)) visitSeen.set(k, lastSeen(t.id));
  const was = visitSeen.get(k);
  if (!was || t.messages.length < 3) return null;
  const i = t.messages.findIndex((m) => m.id === was);
  if (i < 0 || i === t.messages.length - 1) return null;
  const fresh = t.messages.slice(i + 1).filter((m) => !m.mine);
  if (fresh.length < 2) return null; // one new message is simply the last one
  return { count: fresh.length, first: t.messages[i + 1] };
}
function catchUpEl(t, info) {
  const k = "cu:" + accountEmail() + ":" + t.id + ":" + t.messages[t.messages.length - 1].id;
  const res = aiOn() && ai.ready ? aiCache.get(k) : null;
  const box = h("div", { class: "qm-catchup", role: "status" },
    h("span", { text: info.count + " new since you were last here" }),
    h("button", { type: "button", onclick: () => { const el = $(`#qm-view .qm-msg[data-mid="${CSS.escape(info.first.id)}"]`); if (el) el.scrollIntoView({ behavior: prefersStill() ? "auto" : "smooth", block: "start" }); } }, "Jump to them"),
    aiOn() && ai.ready && !res ? h("button", { type: "button", onclick: (e) => {
      e.currentTarget.disabled = true;
      const i = t.messages.indexOf(info.first);
      const again = () => { lastThreadSig = ""; invalidate(true); };
      ask(k, { kind: "thread", subject: t.subject, text: threadText({ messages: t.messages.slice(i) }) }, again);
      again();
    } }, pendingAI.has(k) ? "Catching up…" : "Catch me up") : null);
  if (res && res.summary) box.appendChild(h("p", { class: "qm-cusum", text: res.summary }));
  return box;
}

/* ---- reader view: a designed email as text and pictures ---- */
const readerOn = new Set(); // message ids shown in reader view
const READ_BLOCKS = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, div, center";
// text a designed email hides on purpose (the preview line inboxes show, Outlook-only parts)
const HIDDEN_STYLE = /display\s*:\s*none|mso-hide\s*:\s*all|max-height\s*:\s*0(px)?\s*(;|$)|font-size\s*:\s*0(px)?\s*(;|$)|opacity\s*:\s*0(\.0+)?\s*(;|$)|visibility\s*:\s*hidden/i;
// a picture worth showing large: a real photo or banner (a logo or an icon is left out once it's seen to be small)
function readerFigure(img) {
  const st = img.style || {};
  const w = Number(img.getAttribute("width")) || parseFloat(st.width) || parseFloat(st.maxWidth) || 0;
  if (w && w < 180) return null;
  if (/logo|avatar|icon|badge|spacer/i.test((img.getAttribute("alt") || "") + " " + (img.getAttribute("src") || "").split("#")[0].slice(-80))) return null;
  const pic = h("img", { src: img.getAttribute("src"), alt: img.getAttribute("alt") || "", loading: "lazy" });
  const fig = h("figure", {}, pic);
  if (!w) {
    fig.classList.add("qm-rfwait");
    // small, or a square of modest size (a brand's mark, someone's picture): not a picture to read
    const check = () => { const nw = pic.naturalWidth, nh = pic.naturalHeight || 1; if (nw && (nw < 240 || (nw < 520 && nw / nh > 0.8 && nw / nh < 1.25))) fig.remove(); else fig.classList.remove("qm-rfwait"); };
    if (pic.complete) check(); else { pic.addEventListener("load", check); pic.addEventListener("error", () => fig.remove()); }
  }
  return fig;
}
function readerOf(node) {
  const out = h("div", { class: "qm-reader" });
  const taken = new Set();
  const clean = (el) => {
    const c = el.cloneNode(true);
    for (const x of c.querySelectorAll("[style]")) if (HIDDEN_STYLE.test(x.getAttribute("style"))) x.remove();
    for (const x of c.querySelectorAll("img")) x.remove(); // (pictures go in on their own, as figures)
    for (const x of [c, ...c.querySelectorAll("*")]) {
      for (const at of [...x.attributes]) if (!/^(href|src|alt|colspan|rowspan)$/i.test(at.name)) x.removeAttribute(at.name);
      if (/^(FONT|SPAN|CENTER|TABLE|TBODY|TR|TD|TH)$/.test(x.tagName) && x !== c) x.replaceWith(...x.childNodes);
    }
    for (const a of c.querySelectorAll("a[href]")) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer"); }
    return c;
  };
  const walk = (el) => {
    for (const kid of el.children) {
      if (/^(STYLE|SCRIPT|HEAD|TITLE|META)$/.test(kid.tagName) || HIDDEN_STYLE.test(kid.getAttribute("style") || "")) continue;
      if (kid.tagName === "IMG") { const f = readerFigure(kid); if (f) out.appendChild(f); continue; }
      const hasBlock = kid.querySelector(READ_BLOCKS + ", img, table");
      const own = [...kid.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (kid.matches(READ_BLOCKS) && (!hasBlock || own) && kid.textContent.trim()) {
        if (taken.has(kid.textContent.trim())) continue;
        taken.add(kid.textContent.trim());
        const c = clean(kid);
        const big = /^H[1-3]$/.test(kid.tagName) || (parseFloat(kid.style.fontSize) || 0) >= 20;
        out.appendChild(big ? h("h3", {}, ...c.childNodes) : h(kid.tagName === "LI" ? "li" : "p", {}, ...c.childNodes));
        for (const img of kid.querySelectorAll("img")) { const f = readerFigure(img); if (f) out.appendChild(f); }
        continue;
      }
      walk(kid);
    }
  };
  walk(node);
  return out;
}
function readerButton(m) {
  const on = readerOn.has(m.id);
  return h("button", { type: "button", class: "qm-readerbtn", "aria-pressed": String(on), title: on ? "Back to the email as it was designed" : "Read it as plain text and pictures", onclick: () => { if (on) readerOn.delete(m.id); else readerOn.add(m.id); lastThreadSig = ""; invalidate(true); } }, icon("reader"), on ? "As designed" : "Reader view");
}


/* ---- one message, full screen ----
   Any message in a conversation can open on its own and read like a single email: the whole width (the list
   too steps aside in dual view), its pictures and files, Reply and Forward at the end. Esc, ← or the corner
   button goes back to the conversation, just where it was. (ROOT's class says it's open, so the rest of Umbra
   can ask before this part has run.) */
let fullMsg = null;
function fullMsgBody(m, art, refresh) {
  const entry = m.body && !m.collapsed ? cloneBody(m) : null;
  if (!entry) { art.appendChild(h("div", { class: "qm-plainbody" }, h("p", { text: m.snippet || "" }))); return entry; }
  // its own copy: the conversation keeps showing the message underneath
  const own = Object.assign({}, entry, { node: entry.node.cloneNode(true) });
  if (entry.rich && readerOn.has(m.id)) { art.appendChild(readerOf(own.node)); return entry; }
  const content = bodyEl(m, own, { showAll: showAll.has(m.id), chat: true });
  art.appendChild(entry.rich ? h("div", {}, content) : h("div", { class: "qm-plainbody" }, content));
  // what it quotes of earlier messages stays folded, as in the conversation, a click away (Gmail sends the
  // folded part only when asked: it's drawn again once it's here)
  if (entry.hasMore && !entry.rich) art.appendChild(h("button", { type: "button", class: "qm-more", "aria-label": "Show quoted text", title: "Show quoted text",
    onclick: () => { toggleQuoted(m); refresh(); for (const ms of [250, 700, 1500]) setTimeout(refresh, ms); } }, "•••"));
  return entry;
}
function openFullMsg(m) {
  if (!m) return;
  const v = ensureView();
  closeFullMsg(true);
  const scroll = h("div", { class: "qm-scroll", tabindex: "-1" });
  const layer = h("div", { id: "qm-mfull", class: "qm-reading", role: "region", "aria-label": currentSubject() || "Message" },
    scroll,
    h("div", { class: "qm-bar qm-left" }, ib("back", "Back to the conversation (esc)", () => closeFullMsg())),
    h("div", { class: "qm-bar qm-right" }, ib("shrink", "Exit full screen (esc)", () => closeFullMsg())));
  const id = m.id;
  // the message as Gmail has it now (it redraws messages as it fills them in)
  const current = () => { const main = gmailMain(); const t = id && main && $("h2.hP", main) ? readThread(main) : null; return (t && t.messages.find((x) => x.id === id)) || m; };
  const fill = () => {
    if (!layer.isConnected && scroll.childElementCount) return;
    m = current();
    const top = scroll.scrollTop;
    const name = m.mine ? "You" : personName(m.email, m.name) || m.email;
    const art = h("article", { class: "qm-article" });
    const meta = h("div", { class: "qm-ameta" }, prefs.avatars && !m.mine ? faceFor(m.email, name, isPersonAddress(m.email, m.name), "qm-mav") : null,
      m.mine || !m.email ? h("span", { text: name + (m.date ? " · " + m.date : "") }) : h("span", {}, whoButton(m.email, name), m.date ? " · " + m.date : ""));
    art.append(meta, h("h1", { text: currentSubject() }));
    const entry = fullMsgBody(m, art, fill);
    if (entry && entry.rich) art.classList.add("qm-wide");
    const tc = trackerChip(entry);
    if (tc) meta.appendChild(tc);
    if (entry && entry.rich) {
      const on = readerOn.has(m.id);
      meta.appendChild(h("button", { type: "button", class: "qm-readerbtn", "aria-pressed": String(on), title: on ? "Back to the email as it was designed" : "Read it as plain text and pictures",
        onclick: () => { if (readerOn.has(m.id)) readerOn.delete(m.id); else readerOn.add(m.id); lastThreadSig = ""; fill(); invalidate(true); } }, icon("reader"), on ? "As designed" : "Reader view"));
    }
    art.append(...fileChips(m));
    // Reply and Forward at the end, as in a single email (they go back to the conversation to do it)
    const act = (how) => () => { closeFullMsg(true); msgReply(m, how, null); };
    const many = new Set([...(m.to || []).map((x) => x.email), m.mine ? "" : m.email].filter((e) => e && e !== accountEmail())).size > 1;
    art.appendChild(h("div", { class: "qm-mfacts" },
      h("button", { type: "button", class: "qm-minibtn", onclick: act("reply") }, icon("reply"), h("span", { text: "Reply" })),
      many ? h("button", { type: "button", class: "qm-minibtn", onclick: act("all") }, icon("replyAll"), h("span", { text: "Reply all" })) : null,
      h("button", { type: "button", class: "qm-minibtn", onclick: act("forward") }, icon("forward"), h("span", { text: "Forward" }))));
    scroll.replaceChildren(art);
    scroll.scrollTop = top;
  };
  fill();
  v.appendChild(layer);
  // (it grows out of the message where it sat in the conversation)
  const src = $(`#qm-view .qm-msg[data-mid="${CSS.escape(String(id))}"] .qm-bubble, #qm-view .qm-msg[data-mid="${CSS.escape(String(id))}"] .qm-bwrap`);
  zoomFrom($(".qm-article", layer), src ? src.getBoundingClientRect() : null, { fadeAt: 0.25 });
  ROOT.classList.remove("qm-mfull-back");
  ROOT.classList.add("qm-mfull-on");
  fullMsg = { layer, key: screen.key, mid: m.id, back: document.activeElement, fill };
  scroll.focus({ preventScroll: true }); // the arrow keys and space scroll the message
}
function closeFullMsg(now) {
  const f = fullMsg;
  if (!f) { ROOT.classList.remove("qm-mfull-on"); return; }
  fullMsg = null;
  const done = () => {
    f.layer.remove();
    ROOT.classList.remove("qm-mfull-on");
    if (now) return;
    // the conversation comes back as it was (the message you opened in view)
    ROOT.classList.add("qm-mfull-back");
    setTimeout(() => ROOT.classList.remove("qm-mfull-back"), 220);
    const msg = f.mid && $(`#qm-view .qm-msg[data-mid="${CSS.escape(String(f.mid))}"]`);
    if (msg && msg.getBoundingClientRect().bottom < 80) msg.scrollIntoView({ block: "start" });
  };
  if (now || prefersStill()) { done(); return; }
  // back into its place in the conversation: shown again underneath first (scrolled to it), so there's a place to go
  ROOT.classList.remove("qm-mfull-on");
  const msg = f.mid && $(`#qm-view .qm-msg[data-mid="${CSS.escape(String(f.mid))}"]`);
  if (msg && msg.getBoundingClientRect().bottom < 80) msg.scrollIntoView({ block: "start" });
  const src = msg && ($(".qm-bubble", msg) || $(".qm-bwrap", msg));
  const r = src && src.getBoundingClientRect();
  const a = zoomBack($(".qm-article", f.layer), r && r.width && r.bottom > 0 && r.top < innerHeight ? r : null);
  play(f.layer, [{ backgroundColor: getComputedStyle(f.layer).backgroundColor }, { backgroundColor: "rgba(0, 0, 0, 0)" }], { ms: 220, easing: "ease-out", fill: "forwards" });
  for (const b of $$(":scope > .qm-bar", f.layer)) play(b, [{ opacity: 1 }, { opacity: 0 }], { ms: 140, easing: "ease-out", fill: "forwards" });
  f.layer.style.pointerEvents = "none";
  setTimeout(() => f.layer.remove(), a ? 270 * slowMo() : 150);
}

/* ---- pictures in an email's words: a click opens one full screen (← → through the email's pictures), with
   Download. A picture that's a link goes where it links; a tracking pixel or a small icon isn't a picture. ---- */
const PIC_IN = "#qm-view .qm-body, #qm-view .qm-reader, #qm-mfull .qm-body, #qm-mfull .qm-reader";
function isPicture(img) {
  if (!img.currentSrc && !img.src) return false;
  const r = img.getBoundingClientRect(), w = img.naturalWidth || r.width, ht = img.naturalHeight || r.height;
  return r.width >= 40 && r.height >= 40 && w >= 64 && ht >= 64 && !trackerOf(img.getAttribute("src") || "", w, ht);
}
function pictureItem(img, m) {
  const src = img.currentSrc || img.src;
  let name = (img.getAttribute("alt") || "").trim();
  if (!name || name.length > 80) { try { name = decodeURIComponent(new URL(unproxy(src)).pathname.split("/").pop() || ""); } catch (e) { name = ""; } }
  if (!/[a-z]/i.test(name) || name.length > 80 || /^(image|img|unnamed)\.?[a-z]*$/i.test(name)) name = "Picture";
  return { key: "pic:" + src, name, kind: "image", view: src, get: src, size: 0, from: { name: m ? personName(m.email, m.name) || m.email : "", email: m ? m.email : "" }, here: true, inline: true };
}
function pictureMessage(img) {
  const main = gmailMain();
  const t = main && $("h2.hP", main) ? readThread(main) : null;
  if (!t) return null;
  const mid = (img.closest("[data-mid]") || {}).dataset ? (img.closest("[data-mid]") || { dataset: {} }).dataset.mid : "";
  const id = mid || (img.closest("#qm-mfull") && fullMsg ? fullMsg.mid : "");
  return (id && t.messages.find((x) => x.id === id)) || (t.messages.length === 1 ? t.messages[0] : null);
}
document.addEventListener("click", (e) => {
  const img = e.target && e.target.closest && e.target.closest("img");
  if (!img || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const box = img.closest(PIC_IN);
  if (!box || img.closest("a[href]") || !isPicture(img)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const m = pictureMessage(img);
  const pics = $$("img", box).filter((x) => !x.closest("a[href]") && isPicture(x));
  const items = pics.map((x) => pictureItem(x, m));
  viewFile(items[Math.max(0, pics.indexOf(img))], items, img);
}, true);
// (the pointer says so: a magnifier over a picture that opens)
document.addEventListener("mouseover", (e) => {
  const img = e.target && e.target.tagName === "IMG" ? e.target : null;
  if (!img || img.dataset.qmPic || !img.closest(PIC_IN) || img.closest("a[href]")) return;
  if (!img.complete) return;
  img.dataset.qmPic = isPicture(img) ? "1" : "0";
}, true);
