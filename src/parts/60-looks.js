/* =================================================================== looks
   - Sky: a background that is the sky where you are, as it is now (dawn, day, golden hour, dusk, stars).
   - A picture can follow the time of day: warmer at dawn and dusk, deeper at night.
   - Glass and grain, each a slider. The accent can follow the account you're in.
   (Function declarations only above the timers: the core's first applyLook() runs before this part has.) */

/* the sky as a background: its three colors top to bottom, and stars when it's dark enough */
function skyCss(sky) {
  const layers = [];
  if (sky.stars > 0.05) {
    let seed = Math.floor(Date.now() / 86400000); // the same stars all night
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 46; i++) {
      const a = (sky.stars * (0.25 + rnd() * 0.65)).toFixed(2), r = (rnd() * 0.9 + 0.6).toFixed(1);
      layers.push(`radial-gradient(${r}px ${r}px at ${(rnd() * 100).toFixed(1)}% ${(rnd() * 62).toFixed(1)}%, rgba(255, 255, 255, ${a}), rgba(255, 255, 255, 0))`);
    }
  }
  layers.push(`linear-gradient(180deg, ${sky.top} 0%, ${sky.mid} 58%, ${sky.low} 100%)`);
  return layers.join(", ");
}
/* a wash of the hour's light over a picture (warm at dawn and dusk, deep blue at night, none by day) */
function dayTint() {
  const sky = skyAt(Date.now());
  const wash = { night: "rgba(10, 16, 40, .38)", dawn: "rgba(242, 160, 120, .14)", "golden hour": "rgba(246, 190, 120, .16)", dusk: "rgba(120, 70, 120, .2)" }[sky.phase];
  return wash ? `linear-gradient(${wash}, ${wash}), ` : "";
}
/* glass, grain and the accent: set on the page (from prefs) */
function applyFinish() {
  const st = ROOT.style;
  const g = Math.max(0, Math.min(1, Number(prefs.glass) || 0));
  ROOT.classList.toggle("qm-glassy", g > 0.02);
  st.setProperty("--qm-glass-a", String(Math.round((1 - g * 0.45) * 100)) + "%");
  st.setProperty("--qm-glass-blur", Math.round(8 + g * 22) + "px");
  const grain = Math.max(0, Math.min(1, Number(prefs.grain) || 0));
  let el = document.getElementById("qm-grain");
  if (grain > 0.02 && enabled) {
    if (!el && document.body) { el = h("div", { id: "qm-grain", "aria-hidden": "true" }); document.body.appendChild(el); }
    if (el) el.style.opacity = String((grain * 0.16).toFixed(3));
  } else if (el) el.remove();
  const acc = prefs.accentFollow ? acctColor(accountEmail()) : "";
  ROOT.classList.toggle("qm-acc", !!acc);
  if (acc) { st.setProperty("--qm-acc", acc); st.setProperty("--qm-acc-ink", lumOf(hexRgb(acc)) > 0.42 ? "#111214" : "#ffffff"); }
  else { st.removeProperty("--qm-acc"); st.removeProperty("--qm-acc-ink"); }
  ROOT.classList.toggle("qm-still", prefersStill());
  ROOT.classList.toggle("qm-motion-full", prefs.motion === "full"); // (the system's "reduce motion" doesn't apply then)
}
/* a slider row for the Look page */
function lookRange(label, key, value, onInput, note) {
  const r = h("input", { type: "range", min: "0", max: "1", step: "0.01", value: String(value), "aria-label": label });
  r.addEventListener("input", () => onInput(Number(r.value)));
  r.addEventListener("change", () => savePrefs());
  return h("div", { class: "qm-prow" }, h("span", { class: "qm-tl" }, h("span", { text: label }), note ? h("small", { text: note }) : null), h("div", { class: "qm-range" }, r));
}
// the sky (and a picture's light) move on through the day; the page catches up every few minutes
setInterval(() => { const k = (prefs.bg || {}).kind; if (k === "sky" || (k === "image" && (prefs.bg || {}).daylight)) applyLook(); }, 5 * 60 * 1000);
try { window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", applyFinish); } catch (e) { /* no media queries */ }
setTimeout(applyFinish, 0);
