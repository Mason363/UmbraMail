// Builds Umbra Mail from src/: the userscript (dist/umbra.user.js) and the Chrome extension (dist/extension/).
// Run: node build.mjs
//
// src/lib/*.js    pure helpers (no DOM, no Gmail): also loaded on their own by the tests in tests/
// src/umbra.js    the core
// src/parts/*.js  features, in file-name order; zz-start.js starts everything, last
// src/umbra.css   all styles
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, copyFileSync, rmSync } from "node:fs";

const at = (p) => new URL(p, import.meta.url);
const pkg = JSON.parse(readFileSync(at("./package.json")));
const css = readFileSync(at("./src/umbra.css"), "utf8");
const list = (dir) => (existsSync(at(dir)) ? readdirSync(at(dir)).filter((f) => f.endsWith(".js")).sort() : []);
const lib = list("./src/lib/").map((f) => `// ---- lib/${f}\n` + readFileSync(at("./src/lib/" + f), "utf8"));
const partFiles = list("./src/parts/");
const parts = partFiles.filter((f) => !f.endsWith(".dev.js")).map((f) => `// ---- parts/${f}\n` + readFileSync(at("./src/parts/" + f), "utf8"));
// *.dev.js parts only go into dist/umbra.dev.js, the build the development harness loads (never published)
const devParts = partFiles.filter((f) => f.endsWith(".dev.js")).map((f) => `// ---- parts/${f}\n` + readFileSync(at("./src/parts/" + f), "utf8"));
const core = readFileSync(at("./src/umbra.js"), "utf8");
const repo = "https://github.com/Mason363/UmbraMail";

const SITE = "https://umbra.masn.studio";
const wrap = (more) => `(function () {
"use strict";
const VERSION = ${JSON.stringify(pkg.version)};
// on Umbra's own website: only say that it's installed (the site then opens Gmail, where the welcome plays)
if (location.hostname === "umbra.masn.studio") { document.documentElement.setAttribute("data-umbra-installed", VERSION); return; }
// Gmail's print, attachment and pop-out pages (…?view=…) are left exactly as Gmail draws them
if (/[?&]view=/.test(location.search)) return;
const UMBRA_CSS = ${JSON.stringify(css)};
${lib.join("\n")}
${core}
${parts.join("\n")}
${more.join("\n")}
})();
`;
const body = wrap([]);

const header = `// ==UserScript==
// @name         Umbra Mail
// @namespace    ${repo}
// @version      ${pkg.version}
// @description  A calm, dark-or-bright Gmail: a brief at the top, mail that arrives in tides, a morning paper, files, and threads you can actually read.
// @author       Mason Chen
// @license      GPL-3.0-only
// @homepageURL  ${SITE}
// @supportURL   ${repo}/issues
// @match        https://mail.google.com/*
// @match        ${SITE}/*
// @updateURL    ${SITE}/umbra.meta.js
// @downloadURL  ${SITE}/umbra.user.js
// @run-at       document-start
// @noframes
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @connect      mail.google.com
// @connect      docs.google.com
// @connect      generativelanguage.googleapis.com
// @connect      api.openai.com
// @connect      api.anthropic.com
// @connect      auth.openai.com
// ==/UserScript==
`;

mkdirSync(at("./dist/"), { recursive: true });
const userscript = header + "\n" + body;
writeFileSync(at("./dist/umbra.user.js"), userscript);
writeFileSync(at("./dist/umbra.meta.js"), header); // (what userscript managers check for updates: the header alone)
writeFileSync(at("./dist/dev.css"), css);
writeFileSync(at("./dist/umbra.dev.js"), wrap(devParts));
console.log(`dist/umbra.user.js  ${(userscript.length / 1024).toFixed(1)} KB  v${pkg.version}`);

// ---- the Chrome extension (dist/extension/): the same code, with the userscript calls answered by extension/compat.js
// It waits for compat.js to have every stored value in memory (GM_getValue answers at once, as in a userscript manager),
// and its fonts ship inside: Google Fonts' @import goes, extension/fonts.css comes first (compat.js fills in __EXT__/).
let extCssAll = ""; // (the site's demo uses it too)
if (existsSync(at("./extension/manifest.json"))) {
  const src = "./extension/", out = "./dist/extension/";
  rmSync(at(out), { recursive: true, force: true });
  mkdirSync(at(out + "fonts/"), { recursive: true });
  const m = JSON.parse(readFileSync(at(src + "manifest.json"), "utf8"));
  const manifest = Object.assign({ manifest_version: m.manifest_version, name: m.name, version: "" }, m, { version: pkg.version }); // package.json's version, near the top
  writeFileSync(at(out + "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  for (const f of ["compat.js", "background.js", "options.html", "options.js", "signin.html", "signin.js", "icon16.png", "icon32.png", "icon48.png", "icon128.png"]) copyFileSync(at(src + f), at(out + f));
  for (const f of readdirSync(at(src + "fonts/"))) if (/\.woff2$|^LICENSE.*\.txt$/.test(f)) copyFileSync(at(src + "fonts/" + f), at(out + "fonts/" + f));
  const extCss = readFileSync(at(src + "fonts.css"), "utf8") + css.replace(/@import url\("https:\/\/fonts\.googleapis\.com[^"]*"\);?\s*/g, "");
  extCssAll = extCss;
  if (/fonts\.(googleapis|gstatic)\.com/.test(extCss)) throw new Error("extension: src/umbra.css still loads something from Google Fonts");
  const cssLine = "const UMBRA_CSS = " + JSON.stringify(css);
  if (!body.includes(cssLine)) throw new Error("extension: UMBRA_CSS not found in the bundle");
  const extBody = body.replace(cssLine, () => "const UMBRA_CSS = " + JSON.stringify(extCss));
  writeFileSync(at(out + "umbra.js"), `// Umbra Mail ${pkg.version} (Chrome extension). Starts once extension/compat.js has the stored values in memory.\nglobalThis.__umbraReady.then(() => {\n${extBody}});\n`);
  // everything the manifest names must be there
  const named = [...Object.values(manifest.icons || {}), ...Object.values((manifest.action || {}).default_icon || {}), manifest.background.service_worker,
    (manifest.options_ui || {}).page, ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])])].filter(Boolean);
  for (const f of named) if (!existsSync(at(out + f))) throw new Error("extension: the manifest names " + f + ", which isn't in dist/extension/");
  console.log(`dist/extension/     v${pkg.version}`);
}

// ---- the website (dist/site/): umbra.masn.studio, deployed with Vercel from that folder
// site/ holds the page itself; the build adds the eclipse (the very file Umbra opens with), the userscript and
// its update header, the extension as a .zip, the fonts and icons, and the privacy policy made from PRIVACY.md.
if (existsSync(at("./site/index.html"))) {
  const out = "./dist/site/";
  // (all but .vercel, Vercel's link to the project)
  if (existsSync(at(out))) for (const f of readdirSync(at(out))) if (f !== ".vercel") rmSync(at(out + f), { recursive: true, force: true });
  mkdirSync(at(out + "fonts/"), { recursive: true });
  for (const f of readdirSync(at("./site/"))) if (!f.startsWith(".")) copyFileSync(at("./site/" + f), at(out + f));
  for (const f of readdirSync(at("./extension/fonts/"))) if (/\.woff2$|^LICENSE.*\.txt$/.test(f)) copyFileSync(at("./extension/fonts/" + f), at(out + "fonts/" + f));
  copyFileSync(at("./extension/icon.svg"), at(out + "icon.svg"));
  copyFileSync(at("./extension/icon128.png"), at(out + "icon128.png"));
  writeFileSync(at(out + "eclipse.js"), `/* Umbra's eclipse, the same one Umbra opens with (src/parts/05-eclipse.js, version ${pkg.version}) */\n` + readFileSync(at("./src/parts/05-eclipse.js"), "utf8"));
  // the demo: Umbra's own stylesheet (with its fonts from this site) and icons, filled into site/demo.html
  writeFileSync(at(out + "umbra.css"), extCssAll.split("__EXT__/").join("/"));
  const icons = (() => {
    const src = core.match(/\nconst ICONS = (\{[\s\S]*?\n\});/);
    if (!src) throw new Error("site: ICONS not found in src/umbra.js");
    const ICONS = new Function("return " + src[1])();
    return (name) => {
      if (!ICONS[name]) throw new Error("site: no icon " + name);
      const parts = ICONS[name].map((d) => {
        const n = d.slice(2).split(",");
        if (d.startsWith("c:")) return `<circle cx="${n[0]}" cy="${n[1]}" r="${n[2]}"/>`;
        if (d.startsWith("d:")) return `<circle cx="${n[0]}" cy="${n[1]}" r="1.5"/>`;
        if (d.startsWith("f:")) return `<circle cx="${n[0]}" cy="${n[1]}" r="${n[2]}" class="qm-fill"/>`;
        if (d.startsWith("r:")) return `<rect x="${n[0]}" y="${n[1]}" width="${n[2]}" height="${n[3]}" rx="${n[4]}"/>`;
        return `<path d="${d}"/>`;
      });
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" class="${name === "more" ? "qm-svg qm-solid" : "qm-svg"}">${parts.join("")}</svg>`;
    };
  })();
  writeFileSync(at(out + "demo.html"), readFileSync(at("./site/demo.html"), "utf8").replace(/\{\{icon:([a-z]+)\}\}/g, (m, n) => icons(n)));
  copyFileSync(at("./dist/umbra.user.js"), at(out + "umbra.user.js"));
  copyFileSync(at("./dist/umbra.meta.js"), at(out + "umbra.meta.js"));
  // the extension, zipped (for Load unpacked until it's in the Chrome Web Store)
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  execFileSync("zip", ["-r", "-X", "-q", fileURLToPath(at(out + "umbra-extension.zip")), "."], { cwd: fileURLToPath(at("./dist/extension/")) });
  // the privacy policy, from Markdown (the few kinds of lines it uses)
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (t) => esc(t)
    .replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (m, u) => `<a href="${u}">${u.replace(/^https?:\/\//, "")}</a>`)
    .replace(/&lt;([^\s@&]+@[^\s&]+)&gt;/g, (m, e) => `<a href="mailto:${e}">${e}</a>`)
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  const html = [];
  let list = false;
  for (const line of readFileSync(at("./PRIVACY.md"), "utf8").split("\n")) {
    const li = line.match(/^- (.*)/);
    if (!li && list) { html.push("</ul>"); list = false; }
    if (li) { if (!list) { html.push("<ul>"); list = true; } html.push("<li>" + inline(li[1]) + "</li>"); }
    else if (/^### /.test(line)) html.push("<h3>" + inline(line.slice(4)) + "</h3>");
    else if (/^## /.test(line)) html.push("<h2>" + inline(line.slice(3)) + "</h2>");
    else if (/^# /.test(line)) html.push("<h1>Privacy</h1>");
    else if (line.trim()) html.push("<p>" + inline(line) + "</p>");
  }
  if (list) html.push("</ul>");
  writeFileSync(at(out + "privacy.html"), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy · Umbra</title>
<meta name="description" content="Umbra collects zero data. What it keeps on your computer, and what leaves it, and when.">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/site.css">
</head>
<body class="doc">
<header class="top"><a class="mark" href="/">Umbra</a><nav><a href="/#install">Install</a><a href="/privacy">Privacy</a></nav></header>
<main>
${html.join("\n")}
</main>
<footer><span>Umbra, by <a href="https://masn.studio">Mason Chen</a></span><span><a href="/privacy">Privacy</a> · <a href="https://masn.studio/support">Support</a></span></footer>
</body>
</html>
`);
  console.log(`dist/site/          ${readdirSync(at(out)).length} files`);
}
