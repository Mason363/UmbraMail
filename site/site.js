/* umbra.masn.studio: the eclipse (the same one Umbra opens with), the night as you scroll, and the install
   that ends in Gmail: once the userscript is installed it marks this site as it loads (data-umbra-installed),
   so coming back here after confirming it opens Gmail, where the welcome plays. Nothing is collected. */
(() => {
  "use strict";
  const still = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const narrow = () => innerWidth < 820;
  const home = () => ({ x: 0.5, y: narrow() ? 0.26 : 0.34, size: narrow() ? 0.07 : 0.068 });
  let at = home();
  let sky = null;
  try { sky = typeof makeEclipse === "function" ? makeEclipse(document.getElementById("sky"), { idleFps: 30, start: Object.assign({}, at, { c: still ? 0 : -0.34, fade: still ? 1 : 0 }) }) : null; } catch (e) { sky = null; }
  const lit = () => document.body.classList.add("lit");
  if (sky) {
    document.body.classList.add("gl");
    if (still) { sky.still(); lit(); }
    else {
      sky.run();
      sky.to({ fade: 1 }, 1500, "out");
      sky.to({ c: -0.04 }, 2600, "inOut", () => sky.to({ c: -0.012 }, 1100, "linear", () => { lit(); sky.to({ c: 0 }, 2400, "out"); }));
    }
  } else lit();

  // scrolling: the sky deepens into night, and the eclipse rises out of the way
  const root = document.documentElement;
  const onScroll = () => {
    const f = Math.min(1, Math.max(0, scrollY / innerHeight));
    root.style.setProperty("--night", (f * 0.96).toFixed(3));
    document.body.classList.toggle("scrolled", scrollY > innerHeight * 0.55);
    if (sky) {
      // (it moves with the page, as if painted on it: the name under it never slides across it)
      sky.P.y = at.y - Math.max(0, scrollY) / innerHeight;
      sky.P.dim = f * 0.3;
      sky.poke();
      if (still) sky.still();
    }
  };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", () => { at = home(); if (sky) { sky.P.x = at.x; sky.P.size = at.size; } onScroll(); });
  onScroll();

  // each part arrives as it comes into view
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((seen) => { for (const e of seen) if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); } }, { rootMargin: "0px 0px -10% 0px" });
    document.querySelectorAll(".block").forEach((b) => io.observe(b));
  } else document.querySelectorAll(".block").forEach((b) => b.classList.add("seen"));

  // the window: Umbra drawn at 1280 × 800, scaled to fit
  const demo = document.getElementById("demo");
  if (demo) {
    const screen = demo.parentElement;
    const fitDemo = () => { demo.style.transform = "scale(" + screen.clientWidth / 1280 + ")"; };
    fitDemo();
    if ("ResizeObserver" in window) new ResizeObserver(fitDemo).observe(screen); else addEventListener("resize", fitDemo);
  }

  // installing: confirm in the userscript manager, come back, and Gmail opens
  const GMAIL = "https://mail.google.com/mail/u/0/#inbox";
  const KEY = "umbra-installing";
  const get = document.getElementById("get"), state = document.getElementById("state");
  const version = () => root.getAttribute("data-umbra-installed");
  const flag = () => { try { const t = Number(sessionStorage.getItem(KEY)) || 0; return Date.now() - t < 15 * 60000 ? t : 0; } catch (e) { return 0; } };
  const unflag = () => { try { sessionStorage.removeItem(KEY); } catch (e) { /* nothing kept */ } };
  const check = () => {
    const v = version();
    if (!v || !get) return false;
    get.textContent = "Open Gmail";
    get.href = GMAIL;
    get.removeAttribute("target");
    state.textContent = "Umbra " + v + " is installed.";
    if (flag()) {
      unflag();
      state.textContent = "Umbra is installed. Opening Gmail…";
      setTimeout(() => { location.href = GMAIL; }, 1400);
    }
    return true;
  };
  if (!check()) {
    // (a userscript manager can mark the page a moment after it loads)
    setTimeout(() => {
      if (check() || !flag()) return;
      unflag();
      state.textContent = "Umbra isn't installed yet. If nothing asked you to install it, add Violentmonkey or Tampermonkey to your browser first.";
    }, 900);
  }
  if (get) get.addEventListener("click", () => {
    if (version()) return;
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch (e) { /* it still installs */ }
    state.textContent = "Confirm in your userscript manager, then come back here.";
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !version() && flag()) location.reload();
  });
})();
