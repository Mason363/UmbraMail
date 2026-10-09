// Draws Umbra Mail's icon: an eclipse, the dark disc of the umbra with a crescent of light at its rim, on deep indigo.
// Writes icon16.png, icon32.png, icon48.png, icon128.png and icon.svg next to this file.
// Run: node extension/make-icons.mjs   (plain Node, nothing to install)
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const COLORS = {
  groundTop: "#2a2d6b", groundBottom: "#0b0c23", // the tile, lit from the upper left
  glowCool: "#a7a2ff", glowWarm: "#ffd9a8",      // the corona: warm where the light breaks through, lavender around
  lightTip: "#cdc8ff", lightCore: "#fff7e8",     // the crescent
  umbra: "#05061a", umbraRim: "#1d2052",         // the dark disc, a little earthshine at its far edge
};

// the mark, in a 0..1 square (y down); small sizes get a wider crescent so it still reads at 16 px
function mark(size) {
  const k = size <= 16 ? 0 : size <= 32 ? 1 : size <= 48 ? 2 : 3;
  const r = 0.29;
  return {
    pad: [0, 1, 2, 16][k] / size, // transparent margin (the Chrome Web Store asks for 16 px around a 128 px icon)
    corner: 0.225,
    sun: { x: 0.5, y: 0.5, r },
    shift: [0.125, 0.095, 0.08, 0.068][k], // how far the umbra sits off the light: the crescent's width
    moonR: r * 0.985,
    angle: -Math.PI / 4, // where the crescent is widest: the upper right
    glow: [0.05, 0.06, 0.065, 0.07][k],
  };
}
const moonAt = (m) => ({ x: m.sun.x - m.shift * Math.cos(m.angle), y: m.sun.y - m.shift * Math.sin(m.angle) });

/* ---- colour (mixed in linear light, so the edges blend the way light does) */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const L = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, hex(v).map(toLinear)]));
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * Math.max(0, Math.min(1, t)));
const smooth = (t) => t * t * (3 - 2 * t);

const inTile = (u, v, c) => {
  const qx = Math.max(Math.abs(u - 0.5) - (0.5 - c), 0), qy = Math.max(Math.abs(v - 0.5) - (0.5 - c), 0);
  return Math.abs(u - 0.5) <= 0.5 && Math.abs(v - 0.5) <= 0.5 && Math.hypot(qx, qy) <= c;
};

// the colour at one point of the mark, or null outside the tile
function sample(m, moon, u, v) {
  if (!inTile(u, v, m.corner)) return null;
  let c = mix(L.groundTop, L.groundBottom, smooth((u + v) / 2));
  const dx = u - m.sun.x, dy = v - m.sun.y, d = Math.hypot(dx, dy);
  const facing = (1 + Math.cos(Math.atan2(dy, dx) - m.angle)) / 2; // 1 toward the crescent, 0 away from it
  if (d > m.sun.r) {
    const g = Math.exp(-(d - m.sun.r) / m.glow) * (0.16 + 0.84 * facing ** 2.5) * 0.8;
    c = mix(c, mix(L.glowCool, L.glowWarm, facing ** 3), g);
  } else c = mix(L.lightTip, L.lightCore, facing ** 1.4);
  const mx = u - moon.x, my = v - moon.y, dm = Math.hypot(mx, my);
  if (dm <= m.moonR) {
    const away = (1 - Math.cos(Math.atan2(my, mx) - m.angle)) / 2; // 1 at the edge facing away from the light
    const rim = Math.max(0, 1 - (m.moonR - dm) / (m.moonR * 0.4));
    c = mix(L.umbra, L.umbraRim, rim ** 2 * away ** 1.5 * 0.85);
  }
  return c;
}

// supersampled: N×N points a pixel, averaged in linear light
function render(size, N = 8) {
  const m = mark(size), moon = moonAt(m), art = 1 - 2 * m.pad;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      let hits = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const u = ((x + (sx + 0.5) / N) / size - m.pad) / art, v = ((y + (sy + 0.5) / N) / size - m.pad) / art;
          const c = u >= 0 && u <= 1 && v >= 0 && v <= 1 ? sample(m, moon, u, v) : null;
          if (!c) continue;
          acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
          hits++;
        }
      }
      const o = (y * size + x) * 4;
      if (!hits) continue;
      for (let i = 0; i < 3; i++) out[o + i] = Math.round(toSrgb(acc[i] / hits) * 255);
      out[o + 3] = Math.round((hits / (N * N)) * 255);
    }
  }
  return out;
}

/* ---- PNG: RGBA, 8 bits a channel, no filtering, zlib-deflated */
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit, RGBA, deflate, no filter, not interlaced
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/* ---- the same mark as SVG (the corona drawn as a radial gradient leaning toward the crescent) */
function svg() {
  const m = mark(128), moon = moonAt(m), S = 100, f = (n) => +(n * S).toFixed(2);
  const dir = { x: Math.cos(m.angle), y: Math.sin(m.angle) };
  const glowR = m.sun.r + m.glow * 3.2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="128" height="128">
  <title>Umbra Mail</title>
  <defs>
    <linearGradient id="ground" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COLORS.groundTop}"/>
      <stop offset="1" stop-color="${COLORS.groundBottom}"/>
    </linearGradient>
    <radialGradient id="corona" gradientUnits="userSpaceOnUse" cx="${f(m.sun.x + dir.x * m.shift * 0.9)}" cy="${f(m.sun.y + dir.y * m.shift * 0.9)}" r="${f(glowR)}">
      <stop offset="${(m.sun.r / glowR).toFixed(3)}" stop-color="${COLORS.glowWarm}" stop-opacity="0.75"/>
      <stop offset="${((m.sun.r + m.glow) / glowR).toFixed(3)}" stop-color="${COLORS.glowCool}" stop-opacity="0.3"/>
      <stop offset="1" stop-color="${COLORS.glowCool}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="light" gradientUnits="userSpaceOnUse" x1="${f(m.sun.x - dir.x * m.sun.r)}" y1="${f(m.sun.y - dir.y * m.sun.r)}" x2="${f(m.sun.x + dir.x * m.sun.r)}" y2="${f(m.sun.y + dir.y * m.sun.r)}">
      <stop offset="0.45" stop-color="${COLORS.lightTip}"/>
      <stop offset="1" stop-color="${COLORS.lightCore}"/>
    </linearGradient>
    <radialGradient id="umbra" gradientUnits="userSpaceOnUse" cx="${f(moon.x + dir.x * m.moonR * 0.35)}" cy="${f(moon.y + dir.y * m.moonR * 0.35)}" r="${f(m.moonR * 1.35)}">
      <stop offset="0.72" stop-color="${COLORS.umbra}"/>
      <stop offset="1" stop-color="${COLORS.umbraRim}"/>
    </radialGradient>
    <clipPath id="tile"><rect width="${S}" height="${S}" rx="${f(m.corner)}"/></clipPath>
  </defs>
  <g clip-path="url(#tile)">
    <rect width="${S}" height="${S}" fill="url(#ground)"/>
    <circle cx="${f(m.sun.x + dir.x * m.shift * 0.9)}" cy="${f(m.sun.y + dir.y * m.shift * 0.9)}" r="${f(glowR)}" fill="url(#corona)"/>
    <circle cx="${f(m.sun.x)}" cy="${f(m.sun.y)}" r="${f(m.sun.r)}" fill="url(#light)"/>
    <circle cx="${f(moon.x)}" cy="${f(moon.y)}" r="${f(m.moonR)}" fill="url(#umbra)"/>
  </g>
</svg>
`;
}

const here = (f) => new URL(f, import.meta.url);
for (const size of [16, 32, 48, 128]) writeFileSync(here(`icon${size}.png`), png(size, render(size)));
writeFileSync(here("icon.svg"), svg());
console.log("extension/icon16.png, icon32.png, icon48.png, icon128.png, icon.svg");
