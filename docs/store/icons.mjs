// Umbra's icons as inline SVG, from the ICONS table in src/umbra.js (as the build fills them into the site's demo).
// Used by render.mjs (the store's pictures) and video/make.mjs (the demo video).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("../../src/umbra.js", import.meta.url)), "utf8");
const ICONS = new Function("return " + src.match(/\nconst ICONS = (\{[\s\S]*?\n\});/)[1])();

export function icon(name) {
  if (!ICONS[name]) throw new Error("no icon " + name);
  const parts = ICONS[name].map((d) => {
    const n = d.slice(2).split(",");
    if (d.startsWith("c:")) return `<circle cx="${n[0]}" cy="${n[1]}" r="${n[2]}"/>`;
    if (d.startsWith("d:")) return `<circle cx="${n[0]}" cy="${n[1]}" r="1.5"/>`;
    if (d.startsWith("f:")) return `<circle cx="${n[0]}" cy="${n[1]}" r="${n[2]}" class="qm-fill"/>`;
    if (d.startsWith("r:")) return `<rect x="${n[0]}" y="${n[1]}" width="${n[2]}" height="${n[3]}" rx="${n[4]}"/>`;
    return `<path d="${d}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" class="${name === "more" ? "qm-svg qm-solid" : "qm-svg"}">${parts.join("")}</svg>`;
}
export const fillIcons = (html) => html.replace(/\{\{icon:([a-z]+)\}\}/g, (m, n) => icon(n));
