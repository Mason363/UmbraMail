/* =================================================================== the welcome
   The first time Umbra opens (and whenever you ask: ⌘K › Welcome to Umbra): an eclipse, a few lines on what
   Umbra is, then AI, off unless you choose it, with its provider's terms to agree to. Calm from the first
   frame: it covers Gmail while Gmail loads underneath, and when you're done the light comes back and your
   inbox is there. Nothing here is required: Skip (or Esc on the first page) leaves everything as it was. */
let introOn = false;
const introHere = () => /^\/mail\//.test(location.pathname) && !/[?&](view|ui|ik)=/.test(location.search);
const introDue = () => store.get("welcomed", false) === false && introHere();
// (Umbra from before the welcome had ChatGPT sign-in in the browser: the welcome, once, to set it up)
const INTRO_V = 1;

function intro(replay) {
  if (introOn || document.getElementById("qm-intro")) return;
  introOn = true;
  const still = prefersStill();
  const wide = () => window.innerWidth >= 860;
  const root = h("div", { id: "qm-intro", role: "dialog", "aria-modal": "true", "aria-label": "Welcome to Umbra", tabindex: "-1" });
  const canvas = h("canvas", { class: "qm-i-sky", "aria-hidden": "true" });
  root.appendChild(canvas);
  let sky = null;
  try { sky = makeEclipse(canvas, { start: { x: 0.5, y: wide() ? 0.36 : 0.3, size: wide() ? 0.075 : 0.06, c: still ? 0 : -0.4, fade: still ? 1 : 0 } }); } catch (e) { sky = null; }
  if (!sky) root.classList.add("qm-i-flat");

  // where the eclipse sits on each page
  const place = (n) => (n === 0 ? { x: 0.5, y: wide() ? 0.36 : 0.3, size: wide() ? 0.075 : 0.06 } : wide() ? { x: 0.74, y: 0.36, size: 0.06 } : { x: 0.5, y: 0.17, size: 0.05 });
  const pick = { tides: cp().tides && cp().tides !== "custom" ? cp().tides : "off", ai: "", agreed: false, ready: false };
  const pill = (label, on, click, extra) => h("button", Object.assign({ type: "button", class: "qm-i-pill", "aria-pressed": String(!!on), onclick: click }, extra || {}), label);

  /* ---- page 0: the eclipse, and the name */
  const begin = h("button", { type: "button", class: "qm-i-btn qm-i-main qm-i-go", "data-in": "", onclick: () => go(1) }, "Begin");
  const title = h("section", { class: "qm-i-step qm-i-title" },
    h("h1", { "data-in": "" }, "Umbra"),
    h("p", { class: "qm-i-tag", "data-in": "" }, "A calmer Gmail."),
    begin);

  /* ---- page 1: what Umbra is (and the one choice that changes how mail reaches you) */
  const tideSeg = h("div", { class: "qm-i-pills", role: "group", "aria-label": "New mail" });
  const drawTides = () => tideSeg.replaceChildren(...[["As it comes", "off"], ["Twice a day", "two"], ["Three times", "three"]].map(([l, v]) => pill(l, pick.tides === v, () => { pick.tides = v; drawTides(); })));
  drawTides();
  const what = h("section", { class: "qm-i-step qm-i-page" },
    h("h2", { "data-in": "" }, "What Umbra does"),
    h("ul", { class: "qm-i-lines" },
      h("li", { "data-in": "" }, "Redraws your Gmail so it's easy to read."),
      h("li", { "data-in": "" }, "Can bring new mail a few times a day, all at once."),
      h("li", { "data-in": "" }, "Keeps everything on your computer. No server, no tracking.")),
    h("div", { class: "qm-i-choice", "data-in": "" }, h("span", { class: "qm-i-label", text: "New mail" }), tideSeg),
    h("div", { class: "qm-i-actions", "data-in": "" },
      h("button", { type: "button", class: "qm-i-btn qm-i-main", onclick: () => go(2) }, "Continue"),
      h("button", { type: "button", class: "qm-i-btn qm-i-ghost", onclick: () => go(0) }, "Back")));

  /* ---- page 2: AI, optional */
  const aiPills = h("div", { class: "qm-i-pills", role: "group", "aria-label": "AI" });
  const detail = h("div", { class: "qm-i-detail" });
  const agree = h("input", { type: "checkbox" });
  const agreeText = h("span", {});
  const agreeRow = h("label", { class: "qm-i-agree", hidden: true }, agree, agreeText);
  const finishBtn = h("button", { type: "button", class: "qm-i-btn qm-i-main", onclick: () => finish() }, "Open my inbox");
  const aiNote = h("p", { class: "qm-i-note", role: "status" });
  let chromeState = "missing";
  daiChromeState().then((x) => { chromeState = x; drawAI(); }).catch(() => {});
  const NAMES = [["No AI", "off"], ["ChatGPT", "chatgpt"], ["Gemini", "gemini"], ["Claude", "anthropic"], ["OpenAI", "openai"], ["On this computer", "chrome"]];
  const KEYS = { gemini: ["Gemini API key", "https://aistudio.google.com/apikey", "Get a free key"], openai: ["OpenAI API key", "https://platform.openai.com/api-keys", "Get a key"], anthropic: ["Anthropic API key", "https://console.anthropic.com/settings/keys", "Get a key"] };
  const sayAI = (t, kind) => { aiNote.textContent = t || ""; aiNote.className = "qm-i-note" + (kind ? " qm-i-" + kind : ""); };
  const sync = () => {
    const p = pick.ai;
    agreeRow.hidden = p === "off";
    finishBtn.textContent = p === "off" ? "Open my inbox" : "Turn on AI";
    finishBtn.disabled = p !== "off" && !(pick.ready && agree.checked);
  };
  agree.addEventListener("change", () => { pick.agreed = agree.checked; sync(); });
  function drawAI() {
    const p = pick.ai;
    aiPills.replaceChildren(...NAMES.filter(([, v]) => v !== "chrome" || (chromeState !== "missing" && chromeState !== "unavailable"))
      .map(([l, v]) => pill(l, p === v, () => choose(v, true))));
    const t = AI_TERMS[p];
    agreeText.replaceChildren("I agree to ", t ? h("a", { href: t[1], target: "_blank", rel: "noopener", text: t[0].replace(/^The /, "the ") }) : "the provider's terms", ". Umbra collects zero data.");
    sync();
  }
  async function choose(p, byHand) {
    if (byHand) pick.touched = true;
    if (pick.ai === p) return;
    pick.ai = p;
    pick.ready = false;
    agree.checked = false;
    sayAI("");
    detail.replaceChildren();
    drawAI();
    if (p === "off") { detail.append(h("p", { class: "qm-i-note", text: "Umbra does everything else without it. You can turn it on any time in Settings." })); return; }
    // what each one needs: a sign-in, a key, or nothing at all
    if (p === "chatgpt") {
      detail.append(signInBox({ onDone: (x) => { pick.ready = !!(x.chatgpt && x.chatgpt.signedIn && x.chatgpt.planUsage); sync(); } }),
        h("p", { class: "qm-i-note", text: "Uses your ChatGPT Plus or Pro plan. No key." }));
      try {
        const st = await helper("/config", { provider: "chatgpt" }, 15000);
        if (pick.ai === "chatgpt" && st.chatgpt && st.chatgpt.signedIn && st.chatgpt.planUsage) {
          pick.ready = true;
          detail.replaceChildren(h("p", { class: "qm-i-note qm-i-ok", text: "Signed in" + (st.chatgpt.email ? " as " + st.chatgpt.email : "") + "." }));
        }
      } catch (e) { /* the box says what to do */ }
    } else if (KEYS[p]) {
      const k = KEYS[p];
      const field = h("input", { type: "password", class: "qm-i-field", placeholder: k[0], autocomplete: "off", spellcheck: "false", "aria-label": k[0] });
      let checking = false;
      const check = async () => {
        const v = field.value.trim();
        if (!v || checking) return;
        checking = true;
        sayAI("Checking the key…");
        try {
          await helper("/config", { provider: p, [p + "_key"]: v }, 30000);
          if (pick.ai !== p) return;
          pick.ready = true;
          sayAI("That key works.", "ok");
          field.value = "";
          field.placeholder = "Key saved";
        } catch (e) { if (pick.ai === p) { pick.ready = false; sayAI(e.message, "err"); } }
        checking = false;
        sync();
      };
      field.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); check(); } });
      field.addEventListener("change", check);
      field.addEventListener("paste", () => setTimeout(check, 0));
      detail.append(field, h("p", { class: "qm-i-note" }, h("a", { href: k[1], target: "_blank", rel: "noopener", text: k[2] }),
        p === "gemini" ? ". On Gemini's free tier, Google may use what's sent to improve its products." : "."));
      try {
        const st = await helper("/config", { provider: p }, 15000);
        if (pick.ai === p && st[p] && st[p].hasKey) { pick.ready = true; field.placeholder = "Key saved"; sayAI("A key is already saved.", "ok"); sync(); }
      } catch (e) { /* type one */ }
      setTimeout(() => field.focus(), 60);
    } else if (p === "chrome") {
      detail.append(h("p", { class: "qm-i-note", text: "Chrome's own small model, on this computer. Nothing you read or write leaves it." }));
      try {
        const st = await helper("/config", { provider: "chrome" }, 15000);
        if (pick.ai !== "chrome") return;
        pick.ready = st.chrome && st.chrome.state !== "unavailable";
        if (!st.ready && st.message) sayAI(st.message);
      } catch (e) { sayAI(e.message, "err"); }
      sync();
    }
  }
  const aiPage = h("section", { class: "qm-i-step qm-i-page" },
    h("h2", { "data-in": "" }, "Do you want AI?"),
    h("p", { class: "qm-i-sub", "data-in": "" }, "It can summarize emails, suggest replies and answer questions about your mail. It's off unless you turn it on."),
    h("div", { "data-in": "" }, aiPills),
    h("div", { "data-in": "" }, detail),
    h("div", { "data-in": "" }, agreeRow, aiNote),
    h("div", { class: "qm-i-actions", "data-in": "" }, finishBtn, h("button", { type: "button", class: "qm-i-btn qm-i-ghost", onclick: () => go(1) }, "Back")));
  // someone coming back to it: what they have now
  if (replay && aiOn()) {
    helper("/status", null, 8000).then((st) => { if (st && st.provider && st.provider !== "off") choose(st.provider); }).catch(() => {});
  }
  drawAI();
  choose("off");

  const dots = h("div", { class: "qm-i-dots", "aria-hidden": "true" }, h("i"), h("i"), h("i"));
  const skip = h("button", { type: "button", class: "qm-i-skip", onclick: () => finish(true) }, replay ? "Close" : "Skip");
  const waitLine = h("p", { class: "qm-i-wait", "aria-live": "polite" });
  const pages = [title, what, aiPage];
  root.append(...pages, dots, skip, waitLine);
  (document.body || ROOT).appendChild(root);

  /* ---- keys: the welcome's own, and nothing reaches Gmail or Umbra underneath while it's up */
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); if (page > 0) go(page - 1); else if (page === 0 && shown) finish(true); return; }
    if (e.key !== "Enter" || e.isComposing) return;
    const t = e.target;
    if (t && t.closest && (t.closest("button, a, input, .qm-signin") && root.contains(t))) return; // (their own Enter)
    e.preventDefault();
    if (page === 0) { if (shown) go(1); else hurry(); }
    else if (page === 1) go(2);
    else if (!finishBtn.disabled) finish();
  };
  root.addEventListener("keydown", (e) => { onKey(e); e.stopPropagation(); });
  for (const type of ["keyup", "keypress"]) root.addEventListener(type, (e) => e.stopPropagation());
  const guard = (e) => {
    if (!introOn || root.contains(e.target)) return;
    e.stopImmediatePropagation();
    if (e.type === "keydown") onKey(e);
    if (e.key !== "Tab") e.preventDefault();
    else { e.preventDefault(); (root.querySelector(".qm-i-on button:not([disabled]), .qm-i-on input") || root).focus(); }
  };
  for (const type of ["keydown", "keyup", "keypress"]) window.addEventListener(type, guard, true);
  // (Gmail, loading underneath, likes to take the focus once it's ready: it comes back here)
  let lastFocus = null, pulls = 0, pullsAt = 0;
  root.addEventListener("focusin", (e) => { lastFocus = e.target; });
  const trap = (e) => {
    if (!introOn || root.contains(e.target)) return;
    if (Date.now() - pullsAt > 1000) { pulls = 0; pullsAt = Date.now(); }
    if (++pulls > 20) return; // (never a tug of war)
    const to = lastFocus && root.contains(lastFocus) && lastFocus.getClientRects().length ? lastFocus : root.querySelector(".qm-i-on .qm-i-main:not([disabled]), .qm-i-on button, .qm-i-on input") || root;
    to.focus({ preventScroll: true });
  };
  document.addEventListener("focusin", trap, true);

  /* ---- motion: what arrives settles in, a little at a time; what leaves just goes */
  let page = -1, shown = false;
  const enter = (sec, delay) => {
    sec.classList.add("qm-i-on");
    [...sec.querySelectorAll("[data-in]")].forEach((el, i) => {
      play(el, [{ opacity: 0, transform: "translateY(14px)", filter: "blur(4px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], { ms: 900, easing: SPRING.smooth.e, delay: delay + i * 80, fill: "backwards" });
    });
  };
  const leave = (sec) => {
    const a = play(sec, [{ opacity: 1, translate: "0 0" }, { opacity: 0, translate: "0 -8px" }], { ms: 260, easing: ACCEL, fill: "forwards" });
    afterAnim(a, () => { if (pages[page] !== sec) sec.classList.remove("qm-i-on"); if (a) a.cancel(); });
  };
  function go(n) {
    if (n === page || n < 0 || n > 2) return;
    if (page >= 0) leave(pages[page]);
    page = n;
    if (sky) sky.to(Object.assign(place(n), { dim: n === 0 ? 0 : 0.12 }), still ? 1 : 1300, "inOut");
    enter(pages[n], page === 0 ? 0 : 220);
    [...dots.children].forEach((d, i) => d.classList.toggle("qm-i-cur", i === n));
    setTimeout(() => { const f = pages[n].querySelector(n === 2 ? ".qm-i-pill[aria-pressed=true]" : ".qm-i-main"); if (f) f.focus({ preventScroll: true }); }, 380);
  }
  // the opening: the moon takes the last of the sun, the ring, then the corona, then the name
  const showTitle = () => {
    if (shown) return;
    shown = true;
    go(0);
  };
  const hurry = () => { if (sky) sky.to({ c: 0, fade: 1 }, 900, "out"); showTitle(); };
  root.addEventListener("pointerdown", (e) => { if (!shown && !e.target.closest("button")) hurry(); });
  if (sky) {
    if (still) { sky.still(); showTitle(); }
    else {
      sky.run();
      sky.to({ fade: 1 }, 1800, "out");
      sky.to({ c: -0.045 }, 3400, "inOut", () => sky.to({ c: -0.012 }, 1400, "linear", () => { showTitle(); sky.to({ c: 0 }, 2600, "out"); }));
    }
  } else setTimeout(showTitle, still ? 0 : 400);
  if (still) showTitle();
  // (the canvas follows the window)
  const resized = () => { if (sky && !sky.busy()) { Object.assign(sky.P, place(page < 0 ? 0 : page)); if (still) sky.still(); } };
  window.addEventListener("resize", resized);

  /* ---- done: choices kept, then the light comes back and the inbox is there */
  let leaving = false;
  async function finish(skipped) {
    if (leaving) return;
    leaving = true;
    if (!skipped) {
      prefs.calm = Object.assign({}, prefs.calm, { tides: pick.tides });
      if (pick.tides !== "off") tidesStart();
      const p = pick.ai;
      if (p !== "off" && pick.ready && agree.checked) {
        prefs.ai = true;
        prefs.aiAgreed = { provider: p, at: Date.now() };
        try { await helper("/config", { provider: p }, 15000); } catch (e) { /* settings will say */ }
      } else if (p === "off" && (!replay || pick.touched)) {
        prefs.ai = false; // (seen again later, AI goes off only when "No AI" is chosen)
      }
    }
    store.set("welcomed", true);
    savePrefs();
    refreshAI(true).then(() => invalidate(true)).catch(() => {});
    if (page >= 0) leave(pages[page]);
    dots.style.opacity = "0";
    skip.style.opacity = "0";
    // Gmail may still be loading underneath: the eclipse waits with you
    for (let i = 0; i < 120 && !(screen && screen.kind); i++) {
      if (i === 4) waitLine.textContent = "Opening your inbox…";
      await wait(250);
    }
    waitLine.textContent = "";
    const out = () => {
      window.removeEventListener("resize", resized);
      for (const type of ["keydown", "keyup", "keypress"]) window.removeEventListener(type, guard, true);
      document.removeEventListener("focusin", trap, true);
      root.remove();
      if (sky) sky.destroy();
      introOn = false;
      if (!replay && !skipped) setTimeout(() => toast(MOD_KEY + "K does almost anything. ? shows every shortcut."), 500);
    };
    // (closed before totality: it simply fades, the moon doesn't sweep across)
    if (still || !sky || !shown) { const a = play(root, [{ opacity: 1 }, { opacity: 0 }], { ms: still ? 400 : 700, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" }); afterAnim(a, out); return; }
    // third contact: the ring again, on the other side, and the day comes back
    sky.to({ c: 0.05 }, 1200, "inOut", () => sky.to({ c: 0.34 }, 1600, "in"));
    setTimeout(() => {
      play(canvas, [{ transform: "scale(1)" }, { transform: "scale(1.05)" }], { ms: 1300, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" });
      const a = play(root, [{ opacity: 1 }, { opacity: 0 }], { ms: 1100, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" });
      afterAnim(a, out);
    }, 1000);
  }
  root.focus({ preventScroll: true });
}
if (introDue()) { store.set("intro-v", INTRO_V); intro(false); }
else if (introHere() && Number(store.get("intro-v", 0)) < INTRO_V) { store.set("intro-v", INTRO_V); intro(true); }
