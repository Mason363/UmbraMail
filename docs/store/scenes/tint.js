/* the look, as Settings › Look sets it: ?bg=<hex> (the dark theme keeps a deep color as it is), ?light=1, ?soft=1 */
(() => {
  const q = new URLSearchParams(location.search), R = document.documentElement;
  if (q.get("bg") || q.get("light")) R.classList.remove("qm-bgimg", "qm-halo", "qm-halo-read");
  if (q.get("side")) R.classList.add("qm-side-open");
  if (q.get("light")) R.classList.add("qm-light");
  if (q.get("soft")) R.classList.add("qm-soft");
  const bg = (q.get("bg") || "").replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(bg)) {
    const n = parseInt(bg, 16);
    R.style.setProperty("--bg", "#" + bg);
    R.style.setProperty("--bg-rgb", [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(", "));
    if (q.get("tinted") !== "0") R.classList.add("qm-tinted"); // (as Umbra marks a real color)
  }
})();
