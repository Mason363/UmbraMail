/* =================================================================== power
   For the keyboard, and for many emails at once:
   - Select: ⌘-click, ⇧-click for a run, x, or ⇧J / ⇧K. The bar (and ⌘K) acts on all of them.
   - g, then a letter, goes somewhere: g i the inbox, g s starred, g d drafts…
   - ⌘Z undoes the last thing you did.
   - Searches you pin sit in the menu and in ⌘K.
   - Codes (sign-in, verification) show on their email's row, ready to copy, with or without Gemini.
   - Mail Umbra has seen is remembered on this computer, so ⌘K finds it as you type. */

Object.assign(ICONS, {
  pin: ["M9.5 4h5l-.8 5.2 3.3 3.1V14H7v-1.7l3.3-3.1z", "M12 14v6"],
  undo: ["M9 14.5L4 9.5l5-5", "M4.5 9.5H15a5 5 0 0 1 0 10h-3.5"],
});

/* ---- select ---- */
const chosen = new Map(); // id → row (in the list on screen)
let chooseAnchor = "";
function choose(r, on) {
  if (!r) return;
  if (on === undefined) on = !chosen.has(r.id);
  if (on) chosen.set(r.id, r); else chosen.delete(r.id);
  chooseAnchor = r.id;
  markChosen();
}
// ⇧-click: everything between the last one picked and this one
function chooseRun(r) {
  const a = everyList.findIndex((x) => x.id === chooseAnchor), b = everyList.findIndex((x) => x.id === r.id);
  if (a < 0 || b < 0) { choose(r, true); return; }
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) chosen.set(everyList[i].id, everyList[i]);
  chooseAnchor = r.id;
  markChosen();
}
function chooseAll() { for (const r of everyList) chosen.set(r.id, r); markChosen(); }
function clearChosen() { if (!chosen.size) return; chosen.clear(); markChosen(); untickGmail(); }
/* the rows Umbra ticked on Gmail's own list (for one of its pickers) are unticked again once nothing's selected,
   so none of Gmail's own keys could act on them later */
function untickGmail() {
  const m = gmailMain();
  for (const box of m ? $$('tr.zA [role="checkbox"][aria-checked="true"]', m) : []) press(box);
}
function markChosen() {
  for (const el of $$("#qm-view .qm-rows .qm-row:not(.qm-leaving *)")) el.classList.toggle("qm-chosen", chosen.has(el.dataset.id));
  ROOT.classList.toggle("qm-choosing", chosen.size > 0);
  invalidate(true);
}
// ⇧J / ⇧K: take this one along, and the next
function chooseOn(d) {
  if (cursor < 0) { moveCursor(d); return; }
  const here = everyList[cursor];
  if (here) chosen.set(here.id, here);
  moveCursor(d);
  const next = everyList[cursor];
  if (next) { chosen.set(next.id, next); chooseAnchor = next.id; }
  markChosen();
}
/* the bar over the list while anything is selected (rows that left the list leave the selection) */
function selectionSlot(sel) {
  for (const id of [...chosen.keys()]) if (!everyList.some((x) => x.id === id)) chosen.delete(id);
  ROOT.classList.toggle("qm-choosing", chosen.size > 0);
  const rows = [...chosen.values()];
  const sig = rows.map((r) => r.id + (r.unread ? 1 : 0) + (r.starred ? 1 : 0)).join() + "|" + everyList.length;
  if (sel.dataset.sig === sig) return;
  sel.dataset.sig = sig;
  if (!rows.length) { sel.replaceChildren(); return; }
  const unread = rows.some((r) => r.unread), starred = rows.every((r) => r.starred);
  // (the bar arrives once; choosing more only changes what's in it)
  let bar = $(":scope > .qm-selbar", sel);
  if (!bar) { bar = h("div", { class: "qm-selbar", role: "toolbar", "aria-label": "Selected" }); sel.replaceChildren(bar); }
  bar.replaceChildren(
    h("span", { text: rows.length === 1 ? "1 selected" : rows.length + " selected" }),
    ib("done", "Done (" + keyLabel(keyFor("done")) + ")", () => bulkDo("done"), "qm-s"),
    ib("trash", (everyFolder === "#drafts" ? "Discard (" : "Delete (") + keyLabel(keyFor("trash")) + ")", () => bulkDo("trash"), "qm-s"),
    ib(unread ? "mailopen" : "allmail", unread ? "Mark read" : "Mark unread", () => bulkDo(unread ? "read" : "unread"), "qm-s"),
    ib("starred", starred ? "Unstar" : "Star", () => bulkDo(starred ? "unstar" : "star"), "qm-s" + (starred ? " qm-on" : "")),
    // Gmail's own pickers, for what's selected: when, where to, which labels
    ib("later", "Later (" + keyLabel(keyFor("later")) + ")", (e) => bulkPicker(["Snooze"], ["Snooze"], e.currentTarget), "qm-s"),
    everyFolder === "#drafts" ? null : ib("archive", "Move to", (e) => bulkPicker(["Move to"], ["Move to"], e.currentTarget), "qm-s"),
    everyFolder === "#drafts" ? null : ib("labels", "Labels", (e) => bulkPicker(["Labels"], ["Label as", "Labels"], e.currentTarget), "qm-s"),
    rows.length < everyList.length ? h("button", { type: "button", class: "qm-selall", onclick: chooseAll }, "Select all " + everyList.length) : null,
    ib("x", "Clear (esc)", clearChosen, "qm-s"));
}
/* drafts are discarded (for good: Gmail keeps no copy), from Gmail's own Drafts list. One with something written
   in it is asked about first. */
async function discardDrafts(rows, els) {
  if (!rows.length) return;
  const said = rows.filter((r) => ((r.subject && !/^\(no subject\)$/i.test(r.subject)) || (r.snippet || "").trim()));
  if (said.length) {
    const one = rows.length === 1;
    const ok = await confirmBox({ title: one ? "Discard this draft?" : "Discard " + rows.length + " drafts?", body: [one ? "“" + (rows[0].subject || "No subject") + "” is deleted for good." : "They're deleted for good; Gmail keeps no copy."], ok: "Discard", danger: true });
    if (!ok) return;
  }
  // Gmail's Drafts list has to be showing them: back to its first page if it moved on
  if (rows.some((r) => !liveRow(r.id)) && baseHash(hashNow()) === "#drafts") { await firstPage("#drafts"); await until(() => rows.every((r) => liveRow(r.id)), 4000, 80); }
  const live = rows.filter((r) => liveRow(r.id));
  for (const r of live) hideRow(r, (els || []).find((e) => e && e.dataset.id === r.id) || $(`#qm-view .qm-row[data-id="${CSS.escape(r.id)}"]:not(.qm-leaving *)`));
  const done = live.length ? await actMany(live.map((r) => r.id), "discard") : 0;
  // (Gmail didn't offer Discard: the rows come back, and that's said)
  if (live.length && !done) { for (const r of live) gone.delete(r.id); invalidate(true); toast("Gmail didn't let Umbra discard " + (live.length === 1 ? "that draft" : "those drafts") + ". Gmail's own Drafts list can."); return; }
  const left = rows.length - live.length;
  if (left) toast("Couldn't reach " + left + (left === 1 ? " draft" : " drafts") + " on Gmail's page. Open Drafts and try again.");
  else if (!document.getElementById("qm-gtoast")) toast(live.length === 1 ? "Draft discarded." : live.length + " drafts discarded."); // (Gmail usually says so itself)
}
/* Later, Move to and Labels for what's selected: Gmail's own picker, under the button, for those rows ticked on
   Gmail's page (what's not on its page right now can't be in it) */
async function bulkPicker(titles, inMenu, anchor, only) {
  const rows = (only || [...chosen.values()]).filter((r) => !r.account || r.account.index === accountIndex());
  const live = rows.map((r) => [r.id, liveRow(r.id)]).filter(([, row]) => row);
  if (!live.length) { toast(only ? "That one isn't on Gmail's page just now. Open it, and it's in its ⋯ menu." : chosen.size > rows.length ? "That works on this account's mail: open its own list for the others." : "Those aren't on Gmail's page just now. Scroll back to them and try again."); return; }
  const want = new Set(live.map(([id]) => id));
  const ticked = (row) => { const box = $("[role=checkbox]", row); return box && box.getAttribute("aria-checked") === "true"; };
  const m = gmailMain();
  for (const row of m ? $$("tr.zA", m) : []) { const el = $("[data-legacy-thread-id]", row); if (ticked(row) && !(el && want.has(el.getAttribute("data-legacy-thread-id")))) press($("[role=checkbox]", row)); }
  for (const [, row] of live) if (!ticked(row)) press($("[role=checkbox]", row));
  // its button over the list, or (in a narrower window, where Gmail folds it away) the same in its More menu
  const b = await until(() => listToolbar(null, titles) || listToolbar(null, ["More email options", "More"]), 1500, 50);
  const direct = listToolbar(null, titles);
  if (!b) { toast("Gmail doesn't offer that here."); return; }
  if (live.length < rows.length) toast("Just the " + live.length + " on Gmail's page right now.");
  if (direct) { await openGmailPopup(async () => { press(direct); return true; }, anchor); return; }
  const more = listToolbar(null, ["More email options", "More"]);
  const labels = more ? await gmailMenuItems(more) : [];
  const label = inMenu.find((x) => labels.includes(x));
  if (!label || !(await pressGmailMenuItem(more, label, anchor))) toast("Gmail doesn't offer that here.");
}
/* one of Gmail's own actions on one conversation (Mute, Report spam, Mark as important…): its row ticked on Gmail's
   page and the button pressed (or the same in Gmail's More menu); not on the page, it's opened out of sight */
async function rowGmail(r, titles, inMenu) {
  const live = liveRow(r.id);
  const viaMore = async (more) => {
    const labels = more ? await gmailMenuItems(more) : [];
    const label = inMenu.find((x) => labels.some((l) => l.toLowerCase() === x.toLowerCase()));
    // (these open nothing: done is the menu taking the press, not a pop-up appearing)
    return !!label && !!(await pressGmailMenuItem(more, labels.find((l) => l.toLowerCase() === label.toLowerCase()), undefined, false));
  };
  if (live) {
    const ticked = (row) => { const box = $("[role=checkbox]", row); return box && box.getAttribute("aria-checked") === "true"; };
    const m = gmailMain();
    for (const row of m ? $$("tr.zA", m) : []) if (row !== live && ticked(row)) press($("[role=checkbox]", row));
    if (!ticked(live)) press($("[role=checkbox]", live));
    await until(() => listToolbar(null, titles) || listToolbar(null, ["More email options", "More"]), 1500, 50);
    const direct = listToolbar(null, titles);
    const ok = direct ? press(direct) : await viaMore(listToolbar(null, ["More email options", "More"]));
    if (!ok) { if (ticked(live)) press($("[role=checkbox]", live)); toast("Gmail doesn't offer that here."); }
    return ok;
  }
  let ok = false;
  await ghostThread(r, async () => { const b = gmailToolbar(null, titles); ok = b ? press(b) : await viaMore(gmailToolbar(null, ["More email options", "More"])); await wait(300); });
  if (!ok) toast("Gmail doesn't offer that here.");
  return ok;
}
const BULK_WORDS = { done: "Done", trash: "Deleted", read: "Marked read", unread: "Marked unread", star: "Starred", unstar: "Unstarred" };
/* do one thing to everything selected: what's on Gmail's page at once (ticked there, one press), the rest
   one by one out of sight; mail of another account through its own tab */
async function bulkDo(kind, rows) {
  rows = rows || [...chosen.values()];
  if (!rows.length) return;
  if (kind === "trash" && everyFolder === "#drafts") { chosen.clear(); markChosen(); discardDrafts(rows); return; }
  // (in Trash and Spam: Delete is for good, so it's asked first; Done isn't there)
  if (kind === "done" && binFolder()) { toast("Done isn't available here."); return; }
  if (kind === "trash" && binFolder() && !(await confirmBox({ title: "Delete " + rows.length + (rows.length === 1 ? " conversation" : " conversations") + " forever?", body: ["They'll be gone for good. This can't be undone."], ok: "Delete forever", danger: true }))) return;
  chosen.clear();
  markChosen();
  const mine = rows.filter((r) => !r.account || r.account.index === accountIndex());
  // (another account's mail: through its tab, to exactly the state asked for, not turned over)
  for (const r of rows) if (!mine.includes(r)) rowDoThere(r, kind === "unstar" || kind === "star" ? "star" : kind === "unread" || kind === "read" ? "read" : kind, null, kind === "star" ? true : kind === "unstar" ? false : kind === "unread" ? true : kind === "read" ? false : undefined);
  if (kind === "done" || kind === "trash") {
    for (const r of rows) hideRow(r, $(`#qm-view .qm-row[data-id="${CSS.escape(r.id)}"]:not(.qm-leaving *)`));
    const allLive = mine.every((r) => liveRow(r.id)); // then Gmail does it in one go, and says so (with its own Undo)
    if (mine.length > 3 && !allLive) toast((kind === "done" ? "Putting away " : "Deleting ") + mine.length + "…");
    // (one at a time out of sight, each would get Gmail's own note: Umbra's one note says it, and its Undo undoes all)
    if (!allLive) hushToast(/archived|moved to trash|deleted|conversation/i, 4000 + mine.length * 2500);
    const did = new Set();
    const n = await actMany(mine.map((r) => r.id), kind, did);
    if (!allLive) hushToast(/archived|moved to trash|deleted|conversation/i, 1500);
    // (what didn't happen is back in the list)
    for (const r of mine) if (!did.has(r.id)) putBack(r, null, "");
    const ids = mine.map((r) => r.id).filter((id) => did.has(id));
    // (⌘Z puts these back even once Gmail's own note is gone; while it's up, its Undo does. Nothing to put back
    // from deleting forever)
    if (kind === "trash" && binFolder()) { toast("Deleted forever: " + n + (n === 1 ? " conversation." : " conversations.")); return; }
    if (!ids.length) { toast("Couldn't do that just now: Gmail didn't open them."); return; }
    const u = pushUndo({ label: BULK_WORDS[kind] + " " + ids.length, ids, after: ids.length === 1 ? (kind === "done" ? "Back in the inbox." : "Back from Trash.") : "All " + ids.length + (kind === "done" ? " are back in the inbox." : " are back from Trash."), undo: () => (kind === "done" ? unDone(ids) : unTrash(ids)) });
    if (allLive && n === rows.length) return; // (Gmail said so itself, with its Undo)
    toast(BULK_WORDS[kind] + ": " + (n === rows.length ? n : n + " of " + rows.length) + (n === 1 ? " conversation." : " conversations."), undoAct(u));
    return;
  }
  for (const r of mine) {
    if (kind === "read" || kind === "unread") { r.unread = kind === "unread"; if (r.unread) forgetRead(r.id); else noteRead(r.id, r.time); }
    else r.starred = kind === "star";
  }
  everyKeys = ["!redraw"];
  invalidate(true);
  await actMany(mine.map((r) => r.id), kind);
  untickGmail(); // (Gmail leaves them ticked after marking them)
  toast(BULK_WORDS[kind] + ": " + rows.length + (rows.length === 1 ? " conversation." : " conversations."));
}
/* the same thing to many conversations of this account. Gmail's page first: its rows are ticked (and only
   those) and its button pressed once; anything not on its page is opened out of sight, one at a time. */
/* a button on the toolbar over Gmail's list (by its act number, or what it's called or says) */
function listToolbar(act, titles) {
  const m = gmailMain();
  for (const tm of $$('[gh="tm"]', m || document).filter(visible)) {
    if (act) { const b = $$(`[act="${act}"]`, tm).find(visible); if (b) return b; }
    for (const t of titles || []) {
      const want = t.toLowerCase();
      const b = $$("[act], [role=button], .T-I", tm).find((x) => visible(x) && [x.getAttribute("aria-label"), x.getAttribute("data-tooltip"), x.getAttribute("title"), x.textContent.trim()].some((v) => v && v.toLowerCase().startsWith(want)));
      if (b) return b;
    }
  }
  return null;
}
const BULK_GMAIL = { done: ["7", ["Archive"]], trash: ["10", ["Delete"]], read: ["1", ["Mark as read"]], unread: ["2", ["Mark as unread"]], discard: ["", ["Discard drafts", "Discard draft", "Delete"]] };
async function actMany(ids, kind, done) {
  let n = 0;
  done = done || new Set(); // (each one that really happened)
  const want = new Set(ids), handled = new Set();
  const live = ids.map((id) => [id, liveRow(id)]).filter(([, r]) => r);
  const ticked = (row) => { const box = $("[role=checkbox]", row); return box && box.getAttribute("aria-checked") === "true"; };
  if (live.length && BULK_GMAIL[kind]) {
    // only these ticked: anything else ticked on Gmail's page is unticked first
    const m = gmailMain();
    for (const row of m ? $$("tr.zA", m) : []) { const el = $("[data-legacy-thread-id]", row); if (ticked(row) && !(el && want.has(el.getAttribute("data-legacy-thread-id")))) press($("[role=checkbox]", row)); }
    for (const [, row] of live) if (!ticked(row)) press($("[role=checkbox]", row));
    // Gmail shows its buttons for what's ticked a moment after
    const b = await until(() => listToolbar(BULK_GMAIL[kind][0], BULK_GMAIL[kind][1]), 1500, 50);
    if (b) { press(b); for (const [id] of live) { handled.add(id); done.add(id); } n += live.length; await wait(450); }
    else for (const [, row] of live) if (ticked(row)) press($("[role=checkbox]", row));
  } else if (live.length) {
    // starring: each row's own star
    for (const [id, row] of live) {
      const st = $(".T-KT", row);
      if (!st) continue;
      if (st.classList.contains("T-KT-Jp") !== (kind === "star")) { press(st); await wait(60); } // (starred, in any language)
      handled.add(id);
      done.add(id);
      n++;
    }
  }
  for (const id of ids) {
    if (handled.has(id) || kind === "discard") continue; // (a draft can't be opened out of sight)
    await until(() => !ghost, 6000, 50);
    const row = [...sources.values()].map((x) => x.rows && x.rows.get(id)).find(Boolean) || goneRows.get(id);
    const wasUnread = !!(row && row.unread);
    await ghostThread({ id }, async () => {
      if (kind === "star" || kind === "unstar") {
        const stars = $$('.T-KT[aria-label], [aria-label="Not starred" i], [aria-label="Starred" i]', gmailMain());
        const st = stars[stars.length - 1];
        const on = st && st.classList.contains("T-KT-Jp");
        if (st && on !== (kind === "star")) press(st);
        n++;
        done.add(id);
        // (opening it read it: unread it stays)
        if (wasUnread) { await wait(250); const u = gmailToolbar("2", ["Mark as unread"]); if (u) press(u); }
      } else if (kind === "read") { n++; done.add(id); } // opening it read it
      else {
        const [act, titles] = BULK_GMAIL[kind];
        const b = gmailToolbar(act, titles);
        if (b) { press(b); n++; done.add(id); }
      }
      await wait(300);
    });
    await until(() => !ghost, 6000, 50);
  }
  return n;
}

/* ---- g, then a letter ---- */
const CHORDS = [
  ["i", "Inbox", () => { if (paperOn) closePaper(); go("#inbox"); }],
  ["p", "The paper", () => openPaper(), () => cp().paper],
  ["s", "Starred", () => go("#starred")],
  ["l", "Later", () => go("#snoozed")],
  ["d", "Drafts", () => go("#drafts")],
  ["t", "Sent", () => go("#sent")],
  ["a", "All mail", () => go("#all")],
  ["e", "Done", () => go(DONE_HASH)],
  ["f", "Files", () => { files.kind = "all"; files.from = null; files.large = false; goFiles(); }],
  ["n", "Senders", () => go("#sub")],
  ["o", "To-dos", () => go("#aiinbox"), () => hasTodos() && !everything],
];
let chordAt = 0, chordTimer = 0;
const chordsNow = () => CHORDS.filter((c) => !c[3] || c[3]());
/* called first by the keyboard handler: true when the key was part of a "g …" (and is used up) */
function chordKey(e) {
  const mod = e.metaKey || e.ctrlKey || e.altKey;
  if (chordAt && Date.now() - chordAt < 1500) {
    if (e.key === "Shift") return true;
    endChord();
    const c = !mod && chordsNow().find((x) => x[0] === e.key);
    e.preventDefault();
    e.stopImmediatePropagation();
    if (c) { closeSide(); closeMenu(); c[2](); }
    return true;
  }
  if (mod || e.shiftKey || e.key !== "g" || typing(e.target) || palette || menu || (view && view.hidden)) return false;
  e.preventDefault();
  e.stopImmediatePropagation();
  chordAt = Date.now();
  // what each letter does, after a moment (you may already know)
  clearTimeout(chordTimer);
  chordTimer = setTimeout(() => {
    if (!chordAt) return;
    const tip = h("div", { id: "qm-chord", role: "status" }, h("kbd", { text: "G" }), h("span", { class: "qm-chordthen", text: "then" }),
      ...chordsNow().map(([k, label]) => h("span", { class: "qm-chorditem" }, h("kbd", { text: k.toUpperCase() }), label)));
    const old = document.getElementById("qm-chord");
    if (old) old.remove();
    document.body.appendChild(tip);
  }, 450);
  setTimeout(() => { if (chordAt && Date.now() - chordAt >= 1500) endChord(); }, 1550);
  return true;
}
function endChord() {
  chordAt = 0;
  clearTimeout(chordTimer);
  const tip = document.getElementById("qm-chord");
  if (tip) { tip.classList.add("qm-out"); setTimeout(() => tip.remove(), 150); }
}

/* ---- ⌘1…9: the menu's places, in its order (Inbox, Promotions, Social…). Holding ⌘ with the menu open shows
   each one's number where its count would be. (Chrome keeps ⌘1–9 for its own tabs; Firefox and Zen let them through.) */
window.addEventListener("keydown", (e) => {
  if (!enabled || !e.isTrusted || introOn) return;
  const mod = IS_MAC ? e.metaKey : e.ctrlKey;
  if (e.key === (IS_MAC ? "Meta" : "Control")) { ROOT.classList.add("qm-modheld"); return; }
  if (!mod || e.shiftKey || e.altKey || !/^[1-9]$/.test(e.key) || document.getElementById("qm-panel-scrim")) return;
  if (typing(e.target) && !(palette && e.target === palette.input)) return; // (writing: the browser's own ⌘1–9, never leaving the page under your words; ⌘K's own field is Umbra's)
  const it = folderLinks()[Number(e.key) - 1];
  if (!it) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  ROOT.classList.remove("qm-modheld");
  closeSide();
  closePalette();
  if (it[4]) it[4](); else { if (paperOn && it[1] === "#inbox") closePaper(); go(it[1]); }
}, true);
window.addEventListener("keyup", (e) => { if (e.key === (IS_MAC ? "Meta" : "Control") || !(IS_MAC ? e.metaKey : e.ctrlKey)) ROOT.classList.remove("qm-modheld"); }, true);
window.addEventListener("blur", () => ROOT.classList.remove("qm-modheld"));

/* ---- ⌘Z ---- */
window.addEventListener("keydown", (e) => {
  if (!enabled || !e.isTrusted || introOn || !isKey(e, "undo")) return;
  if (typing(e.target) || document.getElementById("qm-panel-scrim") || document.getElementById("qm-confirm-scrim")) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  undoLast();
}, true);

/* ---- pinned searches ---- */
const pins = () => (Array.isArray(prefs.pins) ? prefs.pins : []).filter((p) => p && p.q);
const isPinned = (q) => pins().some((p) => p.q === q);
function togglePin(q) {
  q = String(q || "").trim();
  if (!q) return;
  const was = pins();
  prefs.pins = isPinned(q) ? was.filter((p) => p.q !== q) : [...was, { q, label: q.length > 32 ? q.slice(0, 31) + "…" : q }].slice(-12);
  savePrefs();
  renderFolders();
  invalidate(true);
  const on = isPinned(q);
  toast(on ? "Pinned to the menu." : "Unpinned.", { label: "Undo", run: () => togglePin(q) });
}
function pinButton(q) {
  const on = isPinned(q);
  const b = ib("pin", on ? "Unpin this search" : "Pin this search to the menu", (e) => { e.preventDefault(); togglePin(q); }, "qm-pinbtn" + (on ? " qm-on" : ""));
  b.setAttribute("aria-pressed", String(on));
  return b;
}

/* ---- codes on rows, without Gemini too: only for the last day (a code from last week is no use) ---- */
function codeChip(r) {
  if (!r || isFromPerson(r) || Date.now() - (r.time || 0) > 86400000) return null;
  const c = findCode((r.subject || "") + " · " + (r.snippet || ""));
  return c ? keyChip(c) : null;
}

/* ---- remembered mail: what Umbra has read from Gmail's lists, kept on this computer (IndexedDB) for ⌘K.
   Subjects, senders and the first line only; never the whole email. Settings › Flags can forget it. */
const recall = { db: null, map: new Map(), loaded: false, loading: null, dirty: new Map(), timer: 0 };
const recallOn = () => prefs.recall !== false;
function recallOpen() {
  if (recall.loading) return recall.loading;
  recall.loading = new Promise((resolve) => {
    try {
      const rq = indexedDB.open("umbra-mail", 1);
      rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains("mail")) rq.result.createObjectStore("mail", { keyPath: "k" }); };
      rq.onerror = () => resolve(null);
      rq.onsuccess = () => {
        recall.db = rq.result;
        const all = recall.db.transaction("mail").objectStore("mail").getAll();
        all.onsuccess = () => { for (const x of all.result || []) if (!recall.map.has(x.k)) recall.map.set(x.k, x); recall.loaded = true; resolve(recall.db); };
        all.onerror = () => { recall.loaded = true; resolve(recall.db); };
      };
    } catch (e) { resolve(null); }
  });
  return recall.loading;
}
/* rows Gmail showed (a folder, a page of results): kept, and written a few seconds later all at once */
function rememberRows(email, rows) {
  if (!recallOn() || !email || !rows || !rows.length) return;
  for (const r of rows) {
    if (!r.id || !r.time) continue;
    const ppl = rowPeople(r);
    const x = { k: email + ":" + r.id, id: r.id, email, from: whoText(Object.assign({ account: { email } }, r)), who: ppl.map((p) => (p.name || "") + " " + (p.email || "")).join(" ").toLowerCase(), subject: r.subject || "", snippet: (r.snippet || "").slice(0, 140), time: r.time, when: r.when || "", attach: !!r.attach };
    const was = recall.map.get(x.k);
    if (was && was.subject === x.subject && was.snippet === x.snippet && was.time === x.time) continue;
    recall.map.set(x.k, x);
    recall.dirty.set(x.k, x);
  }
  clearTimeout(recall.timer);
  if (recall.dirty.size) recall.timer = setTimeout(recallSave, 3000);
}
async function recallSave() {
  const db = await recallOpen();
  if (!db || !recall.dirty.size) return;
  const batch = [...recall.dirty.values()];
  recall.dirty.clear();
  try {
    const tx = db.transaction("mail", "readwrite"), st = tx.objectStore("mail");
    for (const x of batch) st.put(x);
    // at most 40,000 kept: the oldest go first
    if (recall.map.size > 40000) { const old = [...recall.map.values()].sort((a, b) => a.time - b.time).slice(0, recall.map.size - 40000); for (const x of old) { recall.map.delete(x.k); st.delete(x.k); } }
  } catch (e) { /* storage full or closed: it's only a convenience */ }
}
async function recallForget() {
  const db = await recallOpen();
  recall.map.clear();
  recall.dirty.clear();
  if (db) try { db.transaction("mail", "readwrite").objectStore("mail").clear(); } catch (e) { /* gone already */ }
}
/* what matches every word typed (in the subject, the first line, or who it's from), newest first */
function recallFind(q, limit) {
  const words = String(q || "").toLowerCase().split(/\s+/).filter((w) => w.length > 1 || /\d/.test(w));
  if (!words.length || !recall.loaded) return [];
  const out = [];
  for (const x of recall.map.values()) {
    const hay = (x.subject + " " + x.snippet + " " + x.from).toLowerCase() + " " + x.who;
    if (words.every((w) => hay.includes(w.replace(/^from:/, "")))) out.push(x);
  }
  return out.sort((a, b) => b.time - a.time).slice(0, limit || 6);
}
function openRecalled(x) {
  const a = accounts.find((y) => y.email === x.email) || (x.email === accountEmail() ? { index: accountIndex(), email: x.email } : null);
  if (!a) { toast("That's in an account that isn't signed in here."); return; }
  const r = { id: x.id, subject: x.subject, from: x.from, time: x.time, account: a, people: [] };
  if (a.index !== accountIndex()) { leaveTo(`/mail/u/${a.index}/${threadHash("#all", x.id)}`, { opening: { id: x.id, subject: x.subject, from: x.from } }); return; }
  const live = liveRow(x.id);
  if (live) { openStreamRow(Object.assign(r, { account: a }), null); return; }
  opening = { id: x.id, subject: x.subject, from: x.from, single: true, at: Date.now() };
  invalidate(true);
  go(threadHash("#all", x.id));
}
/* ⌘K: mail that matches, as you type */
function paletteMail(q) {
  if (!recallOn() || String(q || "").trim().length < 2) return [];
  return recallFind(q, 6).map((x) => ({ section: "Mail", label: x.subject || "(no subject)", sub: [x.from, x.when].filter(Boolean).join(" · "), keys: (x.snippet + " " + x.from + " " + x.who).toLowerCase(), ico: icon(x.attach ? "clip" : "allmail"), hint: "", run: () => openRecalled(x) }));
}
/* ⌘K: what's selected, first */
function paletteSelected() {
  if (!chosen.size || screen.kind !== "stream") return [];
  const n = chosen.size, rows = [...chosen.values()], unread = rows.some((r) => r.unread), starred = rows.every((r) => r.starred);
  const it = (label, ico, run, keys) => ({ section: n + " selected", label, keys: "selected bulk " + (keys || ""), ico: icon(ico), hint: "", run });
  return [it("Done", "done", () => bulkDo("done"), "archive"), it("Delete", "trash", () => bulkDo("trash"), "trash bin remove"),
    unread ? it("Mark read", "mailopen", () => bulkDo("read")) : it("Mark unread", "allmail", () => bulkDo("unread")),
    it(starred ? "Unstar" : "Star", "starred", () => bulkDo(starred ? "unstar" : "star")),
    // (Gmail's own pickers, under the bar's own buttons)
    it("Later", "later", () => { const b = $('#qm-view .qm-selbar [aria-label^="Later" i]:not(.qm-leaving *)'); if (b) bulkPicker(["Snooze"], ["Snooze"], b); }, "snooze"),
    ...(everyFolder === "#drafts" ? [] : [it("Move to", "archive", () => { const b = $('#qm-view .qm-selbar [aria-label="Move to"]:not(.qm-leaving *)'); if (b) bulkPicker(["Move to"], ["Move to"], b); }, "folder"),
      it("Labels", "labels", () => { const b = $('#qm-view .qm-selbar [aria-label="Labels"]:not(.qm-leaving *)'); if (b) bulkPicker(["Labels"], ["Label as", "Labels"], b); }, "label tag")]),
    it("Clear selection", "x", clearChosen, "deselect none")];
}
setTimeout(() => { if (recallOn()) recallOpen(); }, 4000);
