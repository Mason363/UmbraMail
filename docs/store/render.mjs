// Renders the Chrome Web Store pictures and Umbra's icons from docs/store/scenes: Umbra's own stylesheet, icons
// and eclipse, with mail that's made up. Each picture is drawn at twice its size and scaled down, so it's sharp;
// pictures come out at their exact size with no transparency, icons with their transparent corners.
// Run: npm run build && node docs/store/render.mjs [name…]   (Google Chrome; nothing to install)
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { fillIcons } from "./icons.mjs";

const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const SITE = at("../../dist/site/"), SCENES = at("./scenes/"), OUT = at("./"), EXT = at("../../extension/");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/* ---- what's drawn: [file, page, width, height] (icons: [file, page, size, padding]) */
const PICTURES = [
  // [file, page, width, height, zoom: the interface drawn this much larger, so it reads in the store's small previews]
  ["screenshot-1-inbox.png", "/scenes/inbox.html?bg=1f4fd6", 1280, 800, 1.2],
  ["screenshot-2-conversation.png", "/scenes/conversation.html?bg=cc1f66", 1280, 800, 1.2],
  ["screenshot-3-actions.png", "/scenes/palette.html?bg=0f8f4a", 1280, 800, 1.2],
  ["screenshot-4-light.png", "/scenes/inbox.html?light=1&bg=ffe7a3", 1280, 800, 1.2],
  ["screenshot-5-paper.png", "/scenes/paper.html", 1280, 800, 1.2],
  ["tile-small.png", "/scenes/tile-small.html", 440, 280],
  ["tile-marquee.png", "/scenes/tile-marquee.html", 1400, 560],
];
// (smaller: the eclipse bigger, the sky a little darker and the edges sharpened, so the ring still reads at 16 px)
const ICONS_OUT = [
  ["icon128.png", "/scenes/icon.html?y=.42&size=.2&c=-.028&dim=.12", 128, 16, 0],
  ["icon48.png", "/scenes/icon.html?y=.42&size=.24&c=-.03&dim=.2", 48, 2, 0.25],
  ["icon32.png", "/scenes/icon.html?y=.43&size=.28&c=-.03&dim=.28", 32, 1, 0.45],
  ["icon16.png", "/scenes/icon.html?y=.44&size=.32&c=-.03&dim=.34&hor=2.1&stars=0&grain=0", 16, 0, 0.6],
];

/* ---- a small server: the built site, and the scenes under /scenes/ (with the site's made-up inbox where they say {{inbox}}) */
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
if (!existsSync(SITE + "demo.html")) { console.error("Build first: npm run build"); process.exit(1); }
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.includes("..")) { res.writeHead(400).end(); return; }
  let file = path.startsWith("/scenes/") ? SCENES + path.slice(8) : SITE + path.slice(1);
  if (!extname(file) && existsSync(file + ".html")) file += ".html";
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  let body = readFileSync(file);
  if (file.endsWith(".html")) {
    const demo = readFileSync(at("../../site/demo.html"), "utf8");
    const inbox = demo.slice(demo.indexOf("<body>") + 6, demo.indexOf('<script src="/demo.js">'));
    body = body.toString("utf8").replace("{{inbox}}", inbox);
    body = fillIcons(body);
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = "http://127.0.0.1:" + server.address().port;

/* ---- Chrome, headless, its own throwaway profile */
const profile = mkdtempSync(join(tmpdir(), "umbra-store-"));
const port = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", "--user-data-dir=" + profile, "--remote-debugging-port=" + port, "--no-first-run", "--no-default-browser-check",
  "--use-angle=metal", "--enable-gpu", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 50 && !target; i++) { await wait(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch (e) { /* not up yet */ } }
if (!target) { console.error("Chrome didn't start"); chrome.kill(); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let seq = 0;
const waits = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waits.has(d.id)) { waits.get(d.id)(d); waits.delete(d.id); } };
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; waits.set(id, (d) => (d.error ? reject(new Error(method + ": " + d.error.message)) : resolve(d.result))); ws.send(JSON.stringify({ id, method, params })); });
const run = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception || {}).description); return r.result.value; };
await send("Page.enable");
// (still: Umbra's motion settles at once, so nothing is caught halfway)
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "dark" }] });

// draws a page at twice the size, then scales it down to w × h (in the page: Chrome's own, careful, downscale)
async function draw(page, w, h, { alpha = false, into = null, sharpen = 0, zoom = 1 } = {}) {
  const css = into ? 512 : Math.round(w / zoom), cssH = into ? 512 : Math.round(h / zoom), dpr = into ? 1 : 2 * zoom;
  await send("Emulation.setDeviceMetricsOverride", { width: css, height: cssH, deviceScaleFactor: dpr, mobile: false });
  await send("Emulation.setDefaultBackgroundColorOverride", alpha ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
  const loaded = new Promise((r) => { const id = setInterval(async () => { try { if ((await run("document.readyState")) === "complete") { clearInterval(id); r(); } } catch (e) { /* navigating */ } }, 100); });
  await send("Page.navigate", { url: ORIGIN + page });
  await loaded;
  await run(`(async () => { await document.fonts.ready; const sky = !!document.querySelector("canvas");
    for (let i = 0; i < 100 && sky && !document.documentElement.dataset.ready; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 500)); })()`);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  // scale down in a blank page (a canvas, "high" quality), and read the pixels back
  const out = await run(`(async () => {
    const img = new Image(); img.src = "data:image/png;base64,${shot.data}"; await img.decode();
    const W = ${into ? into.size : w}, H = ${into ? into.size : h}, pad = ${into ? into.pad : 0};
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d", { colorSpace: "srgb" }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    // (in halves: each step a clean 2:1, the last whatever's left)
    let src = img, sw = img.width, sh = img.height;
    const tw = W - 2 * pad, th = H - 2 * pad;
    while (sw / 2 >= tw * 1.0001 && sh / 2 >= th * 1.0001) {
      const t = document.createElement("canvas"); t.width = Math.round(sw / 2); t.height = Math.round(sh / 2);
      const tg = t.getContext("2d"); tg.imageSmoothingQuality = "high"; tg.drawImage(src, 0, 0, sw, sh, 0, 0, t.width, t.height);
      src = t; sw = t.width; sh = t.height;
    }
    g.drawImage(src, 0, 0, sw, sh, pad, pad, tw, th);
    const img2 = g.getImageData(0, 0, W, H), d = img2.data;
    // (a small icon: an unsharp mask, inside the tile only, so the ring keeps its edge)
    const k = ${sharpen};
    if (k) {
      const o = new Uint8ClampedArray(d), at = (x, y, c) => o[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4 + c];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (o[i + 3] < 255 || at(x - 1, y, 3) < 255 || at(x + 1, y, 3) < 255 || at(x, y - 1, 3) < 255 || at(x, y + 1, 3) < 255) continue;
        for (let c = 0; c < 3; c++) {
          let b = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) b += at(x + dx, y + dy, c) * (dx && dy ? 1 : dx || dy ? 2 : 4);
          d[i + c] = o[i + c] + k * (o[i + c] - b / 16);
        }
      }
    }
    let s = ""; for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode.apply(null, d.subarray(i, i + 32768));
    return btoa(s);
  })()`);
  return encodePNG(into ? into.size : w, into ? into.size : h, Buffer.from(out, "base64"), alpha);
}

/* ---- PNG, written here: RGB (no transparency, as the store asks) or RGBA, each row filtered the way that packs best */
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
function encodePNG(w, h, rgba, alpha) {
  const ch = alpha ? 4 : 3, stride = w * ch;
  const px = Buffer.alloc(stride * h);
  for (let i = 0, j = 0; i < w * h; i++) { px[j++] = rgba[i * 4]; px[j++] = rgba[i * 4 + 1]; px[j++] = rgba[i * 4 + 2]; if (alpha) px[j++] = rgba[i * 4 + 3]; }
  const raw = Buffer.alloc((stride + 1) * h), line = Buffer.alloc(stride);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < h; y++) {
    let best = null, bestSum = Infinity, bestType = 0;
    for (let type = 0; type < 5; type++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const v = px[y * stride + x], a = x >= ch ? px[y * stride + x - ch] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= ch && y ? px[(y - 1) * stride + x - ch] : 0;
        const f = (v - [0, a, b, (a + b) >> 1, paeth(a, b, c)][type]) & 255;
        line[x] = f; sum += f < 128 ? f : 256 - f;
      }
      if (sum < bestSum) { bestSum = sum; bestType = type; best = Buffer.from(line); }
    }
    raw[y * (stride + 1)] = bestType;
    best.copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/* ---- draw */
const only = process.argv.slice(2);
const want = (f) => !only.length || only.some((o) => f.includes(o));
try {
  for (const [file, page, w, h, zoom] of PICTURES) if (want(file)) { writeFileSync(OUT + file, await draw(page, w, h, { zoom })); console.log("  " + file); }
  for (const [file, page, size, pad, sharpen] of ICONS_OUT) if (want(file) || only.includes("icons")) {
    const png = await draw(page, size, size, { alpha: true, sharpen, into: { size, pad, art: size - 2 * pad } });
    writeFileSync(EXT + file, png);
    console.log("  extension/" + file);
  }
} finally {
  ws.close(); chrome.kill(); server.close();
  await wait(300);
  rmSync(profile, { recursive: true, force: true });
}
