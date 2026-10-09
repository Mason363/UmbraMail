/* =================================================================== writing: moving a message to another account
   Gmail keeps each account on its own page, so a new message that changes its From account has to move to that
   account's page. While it does, a stand-in of the message stays exactly where its window was ("Moving to School…"),
   across the page change, until the real window on the other account has your words in it. */
function movingCard(d) {
  let el = document.getElementById("qm-moving");
  if (el) return el;
  const r = d.rect || { left: window.innerWidth - 600, top: window.innerHeight - 620, width: 560, height: 580 };
  const lines = String(d.text || "").split("\n").slice(0, 12);
  el = h("div", { id: "qm-moving", role: "status", "aria-label": "Moving your message to " + accountLabel(d.toAcct) },
    h("div", { class: "qm-mvhead" }, h("span", { class: "qm-mvtitle", text: d.subject || "New message" }),
      h("span", { class: "qm-mvacct" }, h("i", { class: "qm-mvsw" }), accountLabel(d.toAcct))),
    d.to && d.to.length ? h("div", { class: "qm-mvline" }, h("span", { text: "To" }), d.to.join(", ")) : null,
    d.subject ? h("div", { class: "qm-mvline qm-mvsubj", text: d.subject }) : null,
    h("div", { class: "qm-mvbody" }, ...lines.map((l) => h("p", { text: l || " " }))),
    h("div", { class: "qm-mvfoot" }, h("span", { class: "qm-mvspin", "aria-hidden": "true" }), h("span", { text: "Moving to " + accountLabel(d.toAcct) + "…" })));
  const sw = $(".qm-mvsw", el);
  if (sw) sw.style.background = acctColor(d.toAcct) || "var(--text-5)";
  Object.assign(el.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  document.body.appendChild(el);
  return el;
}
/* the stand-in goes once the real window is there (or after a while, if the move didn't happen) */
function movingDone(dlg) {
  const el = document.getElementById("qm-moving");
  if (!el) return;
  if (dlg) { const r = el.getBoundingClientRect(); if (!dlg.closest(".aSt")) placeWindow(dlg, { left: r.left, top: r.top }); }
  el.classList.add("qm-out");
  setTimeout(() => el.remove(), 260);
}
/* a page that's receiving a moved message shows its stand-in from the first moment */
function showMovingIfAny() {
  const d = store.get("moving-draft", null);
  if (!d || !document.body) return;
  if (Date.now() - d.at > 2 * 60 * 1000) return; // too long ago: it isn't coming
  if (d.toAcct !== accountEmail() && d.from !== accountEmail()) return;
  movingCard(d);
  setTimeout(() => { if (document.getElementById("qm-moving")) movingDone(null); }, 30000);
}

/* =================================================================== writing: considerate sending
   Just before a message goes, three plain questions, each only when it applies (Settings › Writing):
   late at night, it can wait for the morning (Gmail's own Schedule send, 8:00 AM); words that read heated are
   pointed out; and a reply that mentions an attachment but has none says so. Nothing is asked otherwise. */
const WRITE_DEFAULTS = { quiet: true, quietFrom: 22 * 60, quietTo: 6 * 60, tone: true, attach: true, promises: true };
const wp = () => Object.assign({}, WRITE_DEFAULTS, prefs.write);
function setWrite(patch) { prefs.write = Object.assign({}, prefs.write, patch); savePrefs(); }
/* a question with a few answers (the same look as Umbra's confirm) */
function chooseBox({ title, body, choices }) {
  return new Promise((resolve) => {
    const done = (v) => { window.removeEventListener("keydown", onKey, true); scrim.classList.add("qm-out"); setTimeout(() => scrim.remove(), 130); resolve(v); };
    const btns = choices.map(([label, value, main]) => h("button", { type: "button", class: "qm-btn" + (main ? "" : " qm-quietbtn"), onclick: () => done(value) }, label));
    const panel = h("div", { class: "qm-confirm", role: "alertdialog", "aria-modal": "true", "aria-label": title },
      h("h2", { text: title }), ...[].concat(body || []).map((p) => h("p", { text: p })), h("div", { class: "qm-cbtns" }, btns));
    const scrim = h("div", { id: "qm-confirm-scrim" }, panel);
    scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) done("edit"); });
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); done("edit"); } };
    window.addEventListener("keydown", onKey, true);
    document.body.appendChild(scrim);
    const main = btns[choices.findIndex((c) => c[2])] || btns[btns.length - 1];
    main.focus();
  });
}
/* what would be asked about this message (none: it simply goes) */
function sendConcerns(box, isReplyBar) {
  const w = wp(), ed = $(".editable", box);
  const words = ed ? ownText(ed) : "";
  const out = [];
  if (w.attach && isReplyBar && mentionsAttachment(words) && !$$(".dL", box).length) out.push("attach");
  if (w.tone && toneOf(words).heated) out.push("tone");
  if (w.quiet && inHours(Date.now(), w.quietFrom, w.quietTo)) out.push("quiet");
  return { out, words };
}
async function considerSend(box, isReplyBar, sendNow) {
  const { out, words } = sendConcerns(box, isReplyBar);
  for (const k of out) {
    if (k === "attach") {
      const v = await chooseBox({ title: "Nothing's attached", body: ["You mention an attachment, but this reply has no files."], choices: [["Go back", "edit"], ["Send anyway", "send", true]] });
      if (v !== "send") return;
    } else if (k === "tone") {
      const why = toneOf(words).why.slice(0, 3).map((x) => "“" + x + "”").join(", ");
      const v = await chooseBox({ title: "This reads heated", body: ["Words like " + why + " come across strongly in writing. Send it as it is?"], choices: [["Go back", "edit"], ["Send it", "send", true]] });
      if (v !== "send") return;
    } else if (k === "quiet") {
      const at = nextClock(Date.now(), 8 * 60);
      const v = await chooseBox({ title: "It's " + timeOfDay(Date.now()) + ".", body: ["It can wait in Scheduled and go out at " + whenNext(at) + ", when they're more likely to read it."], choices: [["Go back", "edit"], ["Send now", "send"], ["Send at " + timeOfDay(at), "later", true]] });
      if (v === "later") { if (!(await scheduleSend(box))) toast("Gmail didn't offer the morning just now: it's still here to send."); return; }
      if (v !== "send") return;
    }
  }
  sendNow();
}
/* Gmail's own Schedule send: the arrow beside Send, "Schedule send", and its morning suggestion */
async function scheduleSend(box) {
  const arrow = $$('[aria-label^="More send options" i], .T-I.hG', box).find(visible);
  if (!arrow) return false;
  press(arrow);
  const item = await until(() => $$('[role="menuitem"]').find((x) => visible(x) && /schedule send/i.test(text(x))), 2000, 40);
  if (!item) return false;
  press(item);
  // Gmail's picker (not the message window, which mentions "Schedule send" too)
  const pick = await until(() => $$('[role="dialog"], [role="alertdialog"]').find((d) => visible(d) && !d.matches(".nH.Hd") && /^\s*schedule send/i.test(d.innerText || "")), 3000, 40);
  if (!pick) return false;
  const opt = $$("[role=menuitem], [role=option], [role=button], [tabindex]", pick).filter(visible).find((x) => /morning/i.test(text(x)) && /\b8:00/.test(text(x)) && text(x).length < 60);
  if (!opt) { const cancel = $$("button, [role=button]", pick).find((x) => /^cancel$/i.test(text(x))); if (cancel) press(cancel); return false; }
  press(opt);
  return true;
}
// Gmail's Send in a window (a click, or ⌘Enter): looked at first only when something would be asked
const sendBtnIn = (box) => $(".T-I.aoO", box) || $('[role="button"][data-tooltip^="Send" i]', box);
const writingBox = (el) => el && el.closest && (el.closest('.nH.Hd[role="dialog"]') || el.closest(".ip.adB"));
for (const type of ["mousedown", "mouseup", "click"]) {
  document.addEventListener(type, (e) => {
    if (!enabled || !e.isTrusted) return;
    const btn = e.target && e.target.closest && e.target.closest('.T-I.aoO, [role="button"][data-tooltip^="Send" i]');
    const box = btn && writingBox(btn);
    if (!box || !sendConcerns(box, box.classList.contains("qm-bar")).out.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (type === "click") considerSend(box, box.classList.contains("qm-bar"), () => { noteBarSend(box); press(btn); });
  }, true);
}
document.addEventListener("keydown", (e) => {
  if (!enabled || !e.isTrusted || e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
  const box = writingBox(e.target);
  if (!box || !sendConcerns(box, box.classList.contains("qm-bar")).out.length) return;
  const btn = sendBtnIn(box);
  if (!btn) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  considerSend(box, box.classList.contains("qm-bar"), () => { noteBarSend(box); press(btn); });
}, true);

/* =================================================================== writing: templates (⌘;)
   Replies you write again and again, with the details filled in: {first} {name} {me} {my first} {company}
   {today} {tomorrow} {subject}. ⌘; in any message (or the reply bar) to use one, or to save this one as one. */
const templates = () => (Array.isArray(prefs.templates) ? prefs.templates : []).filter((t) => t && (t.name || t.body));
function templateVars(box) {
  const chip = $$("[email]", box).find((x) => !x.closest(".editable") && (x.getAttribute("email") || "").toLowerCase() !== accountEmail());
  let email = chip ? chip.getAttribute("email") : "", name = chip ? chip.getAttribute("name") || chip.getAttribute("data-name") || text(chip).replace(/\s*[(<].*$/, "") : "";
  if (name && /@/.test(name)) name = "";
  if (!email && box.classList.contains("qm-bar") && screen.kind && gmailMain()) { const t = readThread(gmailMain()); const m = t.messages.slice().reverse().find((x) => !x.mine && x.email); if (m) { email = m.email; name = m.name; } }
  const domain = (email.split("@")[1] || "").toLowerCase();
  const company = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|proton|protonmail|aol)\./.test(domain) ? "" : (domain.split(".").slice(-2, -1)[0] || "").replace(/^./, (c) => c.toUpperCase());
  const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  return { name: personName(email, name) || name, me: myName(), today: day(0), tomorrow: day(1), company, subject: (($("input[name='subjectbox']", box) || {}).value || "").trim() };
}
async function insertTemplate(box, tpl) {
  const v = templateVars(box);
  const subj = $("input[name='subjectbox']", box);
  if (tpl.subject && subj && !subj.value.trim()) { subj.focus(); document.execCommand("insertText", false, fillTemplate(tpl.subject, v)); }
  const ed = $(".editable", box);
  if (!ed) return;
  ed.focus();
  // at the caret if it's in the message, otherwise at the start of what you've written
  const sel = window.getSelection();
  if (!sel.rangeCount || !ed.contains(sel.anchorNode)) { const r = document.createRange(); r.setStart(ed, 0); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
  fillTemplate(tpl.body, v).replace(/\r/g, "").split("\n").forEach((line, i) => { if (i) document.execCommand("insertParagraph"); if (line) document.execCommand("insertText", false, line); });
}
function saveAsTemplate(box) {
  const ed = $(".editable", box);
  const body = ed ? ownText(ed).trim() : "";
  if (!body) { toast("Write something first, then save it as a template."); return; }
  const subject = (($("input[name='subjectbox']", box) || {}).value || "").trim();
  const name = (subject || body.split("\n")[0]).slice(0, 40);
  prefs.templates = [...templates(), { name, subject, body }];
  savePrefs();
  toast("Saved as a template: “" + name + "”.", { label: "Edit", run: () => openPanel("writing") });
}
function openTemplates(box) {
  const old = document.getElementById("qm-tpl");
  if (old) { old.remove(); return; }
  const list = templates();
  const input = h("input", { type: "text", placeholder: list.length ? "Find a template" : "No templates yet", "aria-label": "Find a template", autocomplete: "off", spellcheck: "false" });
  const items = h("div", { class: "qm-tplist", role: "listbox" });
  const card = h("div", { id: "qm-tpl", role: "dialog", "aria-label": "Templates" }, h("div", { class: "qm-tpin" }, icon("paper"), input, h("kbd", { text: "esc" })), items);
  let active = 0, shown = [];
  const close = () => { card.remove(); window.removeEventListener("pointerdown", away, true); };
  const run = (it) => { close(); it.run(); };
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    shown = list.filter((t) => !q || (t.name + " " + t.body).toLowerCase().includes(q)).map((t) => ({ label: t.name || t.body.slice(0, 40), sub: t.body.replace(/\s+/g, " ").slice(0, 80), run: () => insertTemplate(box, t) }));
    shown.push({ label: "Save this message as a template", sub: "", run: () => saveAsTemplate(box), quiet: true }, { label: "Manage templates", sub: "", run: () => openPanel("writing"), quiet: true });
    active = Math.min(active, shown.length - 1);
    items.replaceChildren(...shown.map((it, i) => {
      const row = h("div", { class: "qm-tpitem" + (i === active ? " qm-on" : "") + (it.quiet ? " qm-tpquiet" : ""), role: "option", "aria-selected": String(i === active) }, h("b", { text: it.label }), it.sub ? h("small", { text: it.sub }) : null);
      row.addEventListener("mousemove", () => { if (active !== i) { active = i; draw(); } });
      row.addEventListener("click", () => run(it));
      return row;
    }));
  };
  input.addEventListener("input", () => { active = 0; draw(); });
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); active = (active + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length; draw(); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[active]) run(shown[active]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); const ed = $(".editable", box); if (ed) ed.focus(); }
  });
  const away = (e) => { if (!card.contains(e.target)) close(); };
  document.body.appendChild(card);
  // over the message it's for
  const r = box.getBoundingClientRect(), c = card.getBoundingClientRect();
  card.style.left = Math.round(Math.max(12, Math.min(r.left + 16, window.innerWidth - c.width - 12))) + "px";
  card.style.top = Math.round(Math.max(12, Math.min(r.top + 56, window.innerHeight - c.height - 12))) + "px";
  draw();
  input.focus();
  setTimeout(() => window.addEventListener("pointerdown", away, true), 0);
}
window.addEventListener("keydown", (e) => {
  if (!enabled || !e.isTrusted || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key !== ";") return;
  let box = writingBox(e.target);
  if (!box) {
    // the reply bar's own box: Gmail's editor takes over first
    const c = composerOf();
    if (c && c.root.contains(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); goLive(c, true).then((ip) => { if (ip) openTemplates(ip); }); return; }
    box = $$('.nH.Hd[role="dialog"]').find((d) => visible(d) && !d.dataset.qmGone && !isMinimized(d));
  }
  if (!box) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  openTemplates(box);
}, true);

/* =================================================================== writing: promises
   What you said you'd do in mail you sent ("I'll send the slides by Friday"), kept as quiet lines at the top of
   the inbox until you mark them done. Read from your sent mail of the last two weeks, now and then, when
   you're not doing anything else; only on this computer. */
let promiseScan = 0;
const promisesFor = () => (store.get("promises:" + accountEmail(), null) || { at: 0, list: [] });
async function scanPromises() {
  if (!wp().promises || ghost || peeking || aiPeeking || ROOT.classList.contains("qm-writing") || document.hidden) return;
  const was = promisesFor();
  if (Date.now() - was.at < 4 * 3600 * 1000 || Date.now() - promiseScan < 10 * 60 * 1000) return;
  if (Date.now() - lastInput < 45000 || screen.kind !== "stream") return; // only while you're not busy
  promiseScan = Date.now();
  const res = await searchHere("in:sent newer_than:14d", 40, true);
  if (!res || res.error || !res.rows) return;
  const list = [];
  for (const r of res.rows) {
    for (const p of findPromises(r.snippet || "", r.time || Date.now())) list.push({ key: "promise:" + r.id + ":" + hashString(p.text), id: r.id, text: p.text, due: p.due, to: whoText(Object.assign({ account: { email: accountEmail() } }, r)).replace(/^to:\s*/i, ""), sentAt: r.time || 0 });
  }
  store.set("promises:" + accountEmail(), { at: Date.now(), list: list.slice(0, 30) });
  invalidate(true);
}
setInterval(scanPromises, 5 * 60 * 1000);
setTimeout(scanPromises, 90 * 1000);
/* the ones still to do: due soon or recently, newest first, at most three */
function openPromises() {
  if (!wp().promises) return [];
  const now = Date.now();
  // only real commitments: with a day to them, to someone else ("I'll look into it" isn't one to keep track of)
  return promisesFor().list.filter((p) => !dismissed.has(p.key) && p.due && p.due.t > now - 3 * 86400000 && p.due.t < now + 10 * 86400000 && !/^(me|myself)$/i.test(String(p.to || "").trim()))
    .sort((a, b) => ((a.due ? a.due.t : Infinity) - (b.due ? b.due.t : Infinity)) || b.sentAt - a.sentAt).slice(0, 3);
}
function promiseLines() {
  const list = openPromises();
  if (!list.length) return null;
  return h("div", { class: "qm-promises" }, ...list.map((p) => {
    const line = h("div", { class: "qm-promise" },
      h("span", { class: "qm-prwho", text: p.to ? "To " + p.to.split(",")[0] : "You said" }),
      h("p", { text: p.text }),
      p.due ? h("span", { class: "qm-prdue" + (p.due.t < Date.now() ? " qm-late" : ""), text: dueLabel(p.due) }) : null,
      h("button", { type: "button", class: "qm-prdone", "aria-label": "Done", title: "Done", onclick: () => collapseAway(line, () => { dismiss(p.key); invalidate(true); }) }, icon("done")));
    line.addEventListener("click", (e) => { if (!e.target.closest("button")) go(threadHash("#sent", p.id)); });
    return line;
  }));
}

/* =================================================================== Settings › Writing */
function writingPage(redraw) {
  const w = wp();
  const sec = h("section", {});
  const sw = (key, label, note) => {
    const input = h("input", { type: "checkbox", checked: !!w[key] });
    input.addEventListener("change", () => { setWrite({ [key]: input.checked }); redraw(); });
    return h("label", { class: "qm-toggle" }, h("span", { class: "qm-tl" }, h("span", { text: label }), note ? h("small", { text: note }) : null), input, h("span", { class: "qm-switch", "aria-hidden": "true" }));
  };
  const timeIn = (min, onSet, label) => {
    const i = h("input", { type: "time", value: clockText(min, true), "aria-label": label, step: "900" });
    i.addEventListener("change", () => { const m = parseClock(i.value); if (!Number.isNaN(m)) onSet(m); });
    i.addEventListener("keydown", (e) => e.stopPropagation());
    return i;
  };
  sec.append(h("h3", { text: "Before it goes" }),
    sw("quiet", "Late at night, offer the morning", "Sending between these hours asks whether it should go at 8:00 AM instead (Gmail's Schedule send)."));
  if (w.quiet) sec.append(h("div", { class: "qm-prow" }, h("span", { class: "qm-tl" }, h("span", { text: "Late night is" })),
    h("span", { class: "qm-times" }, timeIn(w.quietFrom, (m) => { setWrite({ quietFrom: m }); redraw(); }, "From"), h("span", { class: "qm-to", text: "to" }), timeIn(w.quietTo, (m) => { setWrite({ quietTo: m }); redraw(); }, "Until"))));
  sec.append(sw("tone", "Point out heated words", "Words that come across strongly in writing are named before you send, once."),
    sw("attach", "Notice a missing attachment", "In the reply bar: you mention a file, and nothing's attached. (Gmail asks the same in windows.)"),
    h("h3", { text: "Promises" }),
    sw("promises", "Keep track of what you said you'd do", "“I'll send it by Friday” in mail you sent becomes a quiet line at the top of the inbox until you mark it done. Read on this computer, from your sent mail of the last two weeks."));
  // templates
  sec.append(h("h3", { text: "Templates" }), h("p", { class: "qm-pnote qm-lead", text: "⌘; in any message (or the reply bar) to use one. These fill themselves in: {first} {name} {me} {my first} {company} {today} {tomorrow} {subject}." }));
  const list = Array.isArray(prefs.templates) ? prefs.templates.slice() : [];
  const save = () => { prefs.templates = list.filter((t) => t && (t.name || t.subject || t.body)); store.set("prefs3", prefs); };
  list.forEach((t, i) => {
    const name = h("input", { type: "text", value: t.name || "", placeholder: "Name", "aria-label": "Template name" });
    const subj = h("input", { type: "text", value: t.subject || "", placeholder: "Subject (optional)", "aria-label": "Template subject" });
    const body = h("textarea", { rows: "4", placeholder: "Hi {first},", "aria-label": "Template text" });
    body.value = t.body || "";
    for (const el of [name, subj, body]) { el.addEventListener("keydown", (e) => e.stopPropagation()); el.addEventListener("change", () => { list[i] = { name: name.value.trim(), subject: subj.value.trim(), body: body.value }; save(); }); }
    sec.append(h("div", { class: "qm-tplcard" }, h("div", { class: "qm-field" }, name, h("button", { type: "button", class: "qm-x", "aria-label": "Delete this template", title: "Delete", onclick: () => { list.splice(i, 1); save(); redraw(); } }, icon("trash"))), subj, body));
  });
  sec.append(h("div", { class: "qm-field" }, h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => { list.push({ name: "New template", subject: "", body: "Hi {first},\n\n\n\n{my first}" }); save(); redraw(); } }, "Add a template")));
  return sec;
}

/* a message waiting in Scheduled says when it goes, with Gmail's own Cancel send beside it */
function scheduledLine(main) {
  const btn = main && $$("button, [role=button]", main).find((x) => (/^cancel send$/i.test(text(x)) || /^cancel send$/i.test(x.getAttribute("aria-label") || "")) && visible(x));
  if (!btn) return null;
  let say = "";
  for (let el = btn.parentElement, i = 0; el && i < 5 && !say; el = el.parentElement, i++) { const t = text(el).replace(/cancel send/i, "").trim(); if (/schedul/i.test(t)) say = t; }
  return h("div", { class: "qm-sched", role: "status" }, icon("later"), h("span", { text: say || "Scheduled to send" }),
    h("button", { type: "button", onclick: () => press(btn) }, "Cancel send"));
}
