/* =================================================================== settings: flags, your settings as a file, the welcome
   - Flags (Settings › Flags): every setting there is, by name, with its value, like about:config. Your own CSS.
   - Your settings as a file: export, import, start over. A look on its own (a theme) can go between people.
   - The welcome: on a first run, a few choices (and AI stays off until you say yes).
   - Self-check: when Gmail changes something Umbra relies on, it says so and offers plain Gmail. */

/* plain Gmail in this tab, and back (never kept: the next Gmail page has Umbra again). Off means nothing of Umbra's
   is left: its stylesheet stops applying, what it drew is hidden, whatever it had open closes, Gmail's windows get
   back their own header, and it stops acting (no keys, no timers, nothing done for Umbra in other tabs).
   `why` "stale": the Chrome extension was updated or turned off, and this copy can't come back without a reload. */
let offWhy = "";
function plainGmail(on, why) {
  if (on && !enabled) { if (why && offWhy !== why) { offWhy = why; offNote(); } return; }
  if (!on && (enabled || offWhy === "stale")) return;
  enabled = !on;
  offWhy = on ? why || "asked" : "";
  if (on) {
    for (const fn of [closeMenu, closeSide, closePalette, closeFileView, () => closeFullMsg(true), hideDrop, () => { if (introStop) introStop(); }]) { try { fn(); } catch (e) { /* already gone */ } }
    for (const id of ["qm-panel-scrim", "qm-keys-scrim", "qm-confirm-scrim", "qm-pal-scrim", "qm-tpl", "qm-person", "qm-chord", "qm-check", "qm-toast", "qm-gtoast", "qm-drop"]) { const el = document.getElementById(id); if (el) el.remove(); }
    const c = composerOf();
    if (c) detachBar(c);
    // Gmail's writing windows, as Gmail draws them: Umbra's header, its AI line and its file pictures go
    for (const el of $$(".qm-whead, .qm-aibar, .qm-attpv")) el.remove();
    for (const el of $$("[data-qm-att]")) delete el.dataset.qmAtt;
    for (const ip of $$(".ip")) { ip.classList.remove("qm-float", "qm-bar", "qm-tucked", "qm-closed", "qm-full"); delete ip.dataset.qmFloat; }
    for (const d of $$('.nH.Hd[role="dialog"]')) { d.style.clipPath = ""; d.style.transform = ""; d.style.transition = ""; d.style.opacity = ""; d.style.pointerEvents = ""; delete d.dataset.qmGone; }
    for (const s of $$(".qm-morph")) s.remove();
    hideView();
    // (other tabs stop counting on this one to read or act for them)
    const e = accountEmail();
    if (e) store.set("live:" + e, { at: 0, tab: TAB_ID });
  }
  if (umbraStyle) umbraStyle.disabled = !enabled;
  ROOT.toggleAttribute("data-umbra-off", !enabled);
  offStyle();
  applyPrefs();
  applyLook();
  applyColors();
  applyFinish();
  applyUserCss();
  calmTitle();
  offNote();
  if (enabled) { heartbeat(); renderAccounts(); keyHints(); everyKeys = ["!redraw"]; invalidate(true); }
}
/* while off: Umbra's own things stay out of sight (with its stylesheet off they'd show unstyled) */
function offStyle() {
  let st = document.getElementById("umbra-off-style");
  if (!st) {
    st = document.createElement("style");
    st.id = "umbra-off-style";
    st.textContent = 'html[data-umbra-off] :is([id^="qm-"], .qm-menu, .qm-whead, .qm-aibar, .qm-attpv, .qm-morph, .qm-spark, .qm-flyemoji, .qm-sketch, .qm-m-src, .qm-msnap, .qm-plate) { display: none !important; }';
    (document.head || ROOT).appendChild(st);
  }
}
/* the one thing Umbra shows while it's off: a small note to bring it back (styled on its own, Gmail's way) */
function offNote() {
  const old = document.getElementById("umbra-off");
  if (old) old.remove();
  if (enabled || !document.body) return;
  const stale = offWhy === "stale";
  const btn = (label, run) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.style.cssText = "all:unset;cursor:pointer;font-weight:500;padding:6px 10px;border-radius:8px;color:#a8c7fa"; b.addEventListener("click", run); return b; };
  const note = document.createElement("div");
  note.id = "umbra-off";
  note.setAttribute("role", "status");
  note.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:6px;padding:8px 8px 8px 18px;border-radius:12px;background:#1f1f1f;color:#e3e3e3;font:400 14px/20px 'Google Sans',Roboto,Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.28);max-width:calc(100vw - 32px)";
  const words = document.createElement("span");
  words.textContent = stale ? "Umbra was updated or turned off in Chrome, so it's off in this tab." : "Plain Gmail in this tab.";
  const close = btn("✕", () => note.remove());
  close.setAttribute("aria-label", "Dismiss");
  note.append(words, stale ? btn("Reload", () => location.reload()) : btn("Bring Umbra back", () => plainGmail(false)), close);
  document.body.appendChild(note);
  if (!stale) setTimeout(() => { if (note.isConnected) note.remove(); }, 10000);
}

/* ---- your CSS ---- */
function applyUserCss() {
  let el = document.getElementById("qm-usercss");
  const css = enabled ? String(prefs.css || "") : "";
  if (!css.trim()) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("style"); el.id = "qm-usercss"; (document.head || document.documentElement).appendChild(el); }
  if (el.textContent !== css) el.textContent = css;
}

/* ---- settings as a file ---- */
// what a settings file holds: your choices (never caches, API keys, or anything about your mail)
const SETTING_KEYS = ["prefs3", "contacts", "dismissed2", "about-mine"];
// a look is only these (a look file passed between people can't touch anything else: AI, sheets, rules, shortcuts)
const LOOK_KEYS = ["theme", "bg", "soft", "size", "density", "lines", "uiFont", "readFont", "readWidth", "glass", "grain", "accentFollow", "motion", "css"];
function settingsFile(lookOnly) {
  if (lookOnly) {
    const pick = LOOK_KEYS;
    const look = {};
    for (const k of pick) if (prefs[k] !== undefined) look[k] = k === "bg" ? Object.assign({}, prefs.bg, { palette: undefined, iw: undefined, ih: undefined, lum: undefined, lumLo: undefined, x: undefined, y: undefined, zoom: undefined }) : prefs[k];
    return { umbra: "look", version: VERSION, look };
  }
  const data = {};
  for (const k of SETTING_KEYS) data[k] = store.get(k, null);
  return { umbra: "settings", version: VERSION, at: new Date().toISOString(), data };
}
function downloadJson(obj, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
  const a = h("a", { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function pickJson() {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept: "application/json,.json", hidden: true });
    input.addEventListener("change", async () => { const f = input.files && input.files[0]; input.remove(); if (!f) { resolve(null); return; } try { resolve(JSON.parse(await f.text())); } catch (e) { resolve({ bad: true }); } });
    document.body.appendChild(input);
    input.click();
  });
}
async function importSettings(redraw) {
  const file = await pickJson();
  if (!file) return;
  if (file.bad || !file.umbra) { toast("That isn't an Umbra Mail settings file."); return; }
  if (file.umbra === "look" && file.look && typeof file.look === "object") {
    const css = typeof file.look.css === "string" ? file.look.css.trim() : "";
    if (css && css !== String(prefs.css || "").trim()) {
      const ok = await confirmBox({ title: "Use this look's own CSS too?", body: ["It comes with CSS someone wrote, which changes how everything here looks. Only use CSS from people you trust."], ok: "Use it", cancel: "Without it" });
      if (!ok) delete file.look.css;
    }
    for (const k of LOOK_KEYS) if (Object.prototype.hasOwnProperty.call(file.look, k)) prefs[k] = file.look[k];
    savePrefs();
    applyUserCss();
    toast("Look applied.");
  } else if (file.umbra === "settings" && file.data && typeof file.data === "object") {
    const ok = await confirmBox({ title: "Use these settings?", body: ["Your settings here are replaced with the ones in the file (from " + (file.at ? new Date(file.at).toLocaleDateString() : "another computer") + "). Your mail isn't touched."], ok: "Use them" });
    if (!ok) return;
    // (a file from before a key was part of it leaves that one as it is here)
    for (const k of SETTING_KEYS) if (file.data[k] != null) store.set(k, file.data[k]); else if (k in file.data) store.del(k);
    // everything in this tab starts again from them (names, dismissals and settings, exactly as in the file)
    store.set("welcomed", true);
    leaving = true;
    location.reload();
    return;
  } else { toast("That file has nothing Umbra Mail can use."); return; }
  if (redraw) redraw();
}
async function resetSettings() {
  const ok = await confirmBox({ title: "Start over?", body: ["Every Umbra Mail setting goes back to how it started: look, layout, calm, shortcuts, names and colors you gave people, templates. Your mail isn't touched.", "Export your settings first if you might want them back."], ok: "Start over", danger: true });
  if (!ok) return;
  for (const k of SETTING_KEYS) store.del(k);
  store.set("welcomed", true);
  location.reload();
}

/* ---- flags: every setting, by name ---- */
const FLAG_DEFAULTS = { calm: () => CALM_DEFAULTS, write: () => WRITE_DEFAULTS };
function flagRows() {
  const out = [];
  const add = (path, value, def) => out.push({ path, value, def });
  for (const [k, v] of Object.entries(prefs).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (/^mig\d+$/.test(k)) continue;
    if (k in FLAG_DEFAULTS) { const d = FLAG_DEFAULTS[k](); for (const [s2, dv] of Object.entries(d)) add(k + "." + s2, (v || {})[s2] !== undefined ? v[s2] : dv, dv); continue; }
    add(k, v, k in PREF_DEFAULTS ? JSON.parse(JSON.stringify(PREF_DEFAULTS[k])) : undefined); // (a copy: Reset never hands out the defaults themselves)
  }
  for (const [k, d] of Object.entries(FLAG_DEFAULTS)) if (!(k in prefs)) for (const [s2, dv] of Object.entries(d())) add(k + "." + s2, dv, dv);
  return out;
}
function setFlag(path, value) {
  const [a, b] = path.split(".");
  if (b) prefs[a] = Object.assign({}, prefs[a], { [b]: value });
  else prefs[a] = value;
  savePrefs();
  applyUserCss();
}
let flagFind = "";
function flagsPage(redraw) {
  const sec = h("section", { class: "qm-flags" });
  sec.append(h("p", { class: "qm-pnote qm-lead", text: "Every setting there is, by its name. Most have a friendlier place on the other pages; here they're all in one list. Changed ones are in bold." }));
  const find = h("input", { type: "search", placeholder: "Find a setting", "aria-label": "Find a setting", autocomplete: "off", spellcheck: "false", value: flagFind });
  find.addEventListener("keydown", (e) => e.stopPropagation());
  const list = h("div", { class: "qm-flaglist" });
  const draw = () => {
    const q = flagFind.trim().toLowerCase();
    list.replaceChildren(...flagRows().filter((r) => !q || r.path.toLowerCase().includes(q)).map((r) => {
      const changed = r.def !== undefined ? JSON.stringify(r.value) !== JSON.stringify(r.def) : false;
      let ctl;
      if (typeof r.value === "boolean") {
        ctl = h("button", { type: "button", class: "qm-flagbool", "aria-pressed": String(r.value), onclick: () => { setFlag(r.path, !r.value); draw(); } }, r.value ? "true" : "false");
      } else if (typeof r.value === "number" || typeof r.value === "string") {
        ctl = h("input", { type: "text", value: String(r.value), "aria-label": r.path, spellcheck: "false" });
        ctl.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") ctl.blur(); });
        ctl.addEventListener("change", () => { const v = typeof r.value === "number" ? Number(ctl.value) : ctl.value; if (typeof r.value === "number" && !Number.isFinite(v)) { ctl.value = String(r.value); return; } setFlag(r.path, v); draw(); });
      } else {
        ctl = h("input", { type: "text", value: JSON.stringify(r.value), "aria-label": r.path, spellcheck: "false" });
        ctl.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") ctl.blur(); });
        ctl.addEventListener("change", () => { try { setFlag(r.path, JSON.parse(ctl.value)); draw(); } catch (e) { ctl.classList.add("qm-bad"); toast("That isn't valid JSON."); } });
      }
      return h("div", { class: "qm-flag" + (changed ? " qm-changed" : "") }, h("code", { text: r.path }), ctl,
        changed ? h("button", { type: "button", class: "qm-flagreset", title: "Back to " + JSON.stringify(r.def), onclick: () => { setFlag(r.path, r.def); draw(); } }, "Reset") : h("span", { class: "qm-flagreset" }));
    }));
  };
  find.addEventListener("input", () => { flagFind = find.value; draw(); });
  sec.append(h("div", { class: "qm-field" }, find), list);
  draw();
  // your CSS
  const css = h("textarea", { rows: "6", spellcheck: "false", placeholder: "/* your own touches, e.g. */\nhtml.qm .qm-row { border-radius: 14px; }", "aria-label": "Your CSS" });
  css.value = prefs.css || "";
  css.addEventListener("keydown", (e) => e.stopPropagation());
  css.addEventListener("input", () => { prefs.css = css.value; applyUserCss(); });
  css.addEventListener("change", () => store.set("prefs3", prefs));
  sec.append(h("h3", { text: "Your CSS" }), h("p", { class: "qm-pnote", text: "Applied on top of Umbra's own, as you type. Everything Umbra draws is under html.qm." }), css);
  // files
  sec.append(h("h3", { text: "Your settings as a file" }),
    h("p", { class: "qm-pnote", text: "To move to another computer, or keep a copy. It holds your choices only: never your mail, caches or API keys." }),
    h("div", { class: "qm-field" },
      h("button", { type: "button", class: "qm-btn", onclick: () => downloadJson(settingsFile(false), "umbra-mail-settings.json") }, "Export settings"),
      h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => importSettings(redraw) }, "Import…"),
      h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: resetSettings }, "Start over…")),
    h("h3", { text: "Remembered mail" }),
    h("p", { class: "qm-pnote", text: "Subjects, senders and first lines of mail Umbra has shown, kept on this computer so ⌘K finds them as you type (" + (recall.loaded ? recall.map.size.toLocaleString() : "some") + " now)." }),
    h("div", { class: "qm-field" },
      h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: async () => { await recallForget(); toast("Forgot what ⌘K remembered."); redraw(); } }, "Forget it"),
      (() => { const i = h("input", { type: "checkbox", checked: prefs.recall !== false }); i.addEventListener("change", () => { prefs.recall = i.checked; savePrefs(); if (!i.checked) recallForget(); redraw(); }); return h("label", { class: "qm-toggle qm-inline" }, h("span", { class: "qm-tl" }, h("span", { text: "Remember" })), i, h("span", { class: "qm-switch", "aria-hidden": "true" })); })()),
    h("h3", { text: "Looks" }),
    h("p", { class: "qm-pnote", text: "Just the look (theme, background, surfaces, fonts, your CSS), to share or keep. A picture background goes as its settings; the picture itself stays here." }),
    h("div", { class: "qm-field" },
      h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => downloadJson(settingsFile(true), "umbra-mail-look.json") }, "Save this look"),
      h("button", { type: "button", class: "qm-btn qm-quietbtn", onclick: () => importSettings(redraw) }, "Use a look…")));
  return sec;
}

/* ---- self-check: what Umbra needs from Gmail's page, looked for now and then ---- */
let checkMiss = 0, checkHidden = false;
function selfCheck() {
  if (!enabled || checkHidden || document.hidden || peeking || ghost || aiPeeking) return;
  const issues = [];
  if (document.readyState === "complete" && Date.now() - performance.timing.navigationStart > 20000) {
    if (!gmailMain()) issues.push("Gmail's main view");
    else if (/^#(inbox|starred|sent|all)\b/.test(hashNow()) && !$('[gh="tl"]', gmailMain()) && !$("h2.hP", gmailMain())) issues.push("Gmail's list");
    if (!$('[gh="cm"]') && !$$(".T-I, [role=button]").some((e) => /^compose$/i.test(text(e)))) issues.push("Gmail's Compose button");
  }
  checkMiss = issues.length ? checkMiss + 1 : 0;
  const old = document.getElementById("qm-check");
  if (checkMiss < 3) { if (old && !issues.length) old.remove(); return; } // (three times in a row: not a page still loading)
  if (old) return;
  const bar = h("div", { id: "qm-check", role: "alert" }, h("span", { text: "Gmail looks different today: Umbra Mail can't find " + issues.join(" or ") + ". Things may not work as they should." }),
    h("button", { type: "button", onclick: () => { bar.remove(); plainGmail(true); } }, "Plain Gmail"),
    h("button", { type: "button", onclick: () => { bar.remove(); checkMiss = 0; checkHidden = true; } }, "Hide"));
  document.body.appendChild(bar);
}
setInterval(selfCheck, 15000);
/* Gmail in another language: Umbra reads a few of Gmail's own menus by their words (Snooze, Unsubscribe,
   Schedule send, Move to…), and in English best. Said once, plainly, per language. */
setTimeout(() => {
  const lang = String(ROOT.lang || "").toLowerCase();
  if (!lang || lang.startsWith("en") || store.get("lang-noted", "") === lang || !introHere()) return;
  store.set("lang-noted", lang);
  let name = lang;
  try { name = new Intl.DisplayNames([lang], { type: "language" }).of(lang) || lang; } catch (e) { /* the code, then */ }
  toast("Gmail is in " + name + ". Umbra reads a few of Gmail's own menus best in English: Snooze, Unsubscribe and Schedule send may not work from Umbra yet.");
}, 9000);
setTimeout(applyUserCss, 0);
