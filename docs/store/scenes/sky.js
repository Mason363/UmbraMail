/* the eclipse, still and sharp (for pictures): the script tag's data-x, data-y, data-size, data-c… set the scene
   (and the page's ?x=…&size=… over those) */
(() => {
  const me = document.currentScript, canvas = document.querySelector("canvas");
  const start = { x: 0.5, y: 0.36, size: 0.075, c: 0, fade: 1, dim: 0, hor: 1.7 };
  for (const k of ["x", "y", "size", "c", "fade", "dim", "hor", "tilt", "stars", "grain"]) if (me.dataset[k] != null) start[k] = Number(me.dataset[k]);
  for (const [k, v] of new URLSearchParams(location.search)) if (k in start || k === "tilt" || k === "stars" || k === "grain") start[k] = Number(v);
  const sky = makeEclipse(canvas, { quality: 1, start });
  document.fonts.ready.then(() => { sky.still(); requestAnimationFrame(() => { sky.still(); requestAnimationFrame(() => { document.documentElement.dataset.ready = "1"; }); }); });
})();
