/* =================================================================== time, tides, the sky (pure)
   Nothing here touches the page: the tests in tests/ load this file on its own. */

/* "16:00" or "4:30 PM" → minutes after midnight (NaN when it isn't a time) */
function parseClock(s) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*$/i.exec(String(s || ""));
  if (!m) return NaN;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59) return NaN;
  const ap = (m[3] || "").toLowerCase().replace(/\./g, "");
  if (ap) { if (h < 1 || h > 12) return NaN; if (ap === "pm" && h !== 12) h += 12; if (ap === "am" && h === 12) h = 0; }
  if (h > 23) return NaN;
  return h * 60 + min;
}
/* minutes after midnight → "4:00", the way a clock on the wall says it (12-hour unless asked) */
function clockText(min, h24) {
  min = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(min / 60), m = min % 60;
  if (h24) return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  return ((h % 12) || 12) + ":" + String(m).padStart(2, "0");
}
/* the tide times for a setting: "two", "three", or your own list of minutes */
const TIDE_PRESETS = { two: [9 * 60, 16 * 60], three: [8 * 60, 12 * 60 + 30, 17 * 60] };
function tideList(setting) {
  const raw = Array.isArray(setting) ? setting : TIDE_PRESETS[setting] || [];
  return [...new Set(raw.map(Number).filter((x) => Number.isFinite(x) && x >= 0 && x < 1440).map((x) => Math.round(x)))].sort((a, b) => a - b);
}
/* the same time of day, n days on (by the calendar) */
function dayShift(t, n) { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
/* the moment `min` minutes after midnight on the day of `t` (local time) */
// (set on the clock, not added as milliseconds: on the days clocks change, a day isn't 24 hours)
function atClock(t, min) { const d = new Date(t); d.setHours(Math.floor(min / 60), min % 60, 0, 0); return d.getTime(); }
/* the last tide at or before `now` (yesterday's last one before today's first), or 0 without tides */
function lastTideAt(now, mins) {
  if (!mins.length) return 0;
  for (let i = mins.length - 1; i >= 0; i--) { const t = atClock(now, mins[i]); if (t <= now) return t; }
  return atClock(dayShift(now, -1), mins[mins.length - 1]);
}
/* the next tide after `now` (tomorrow's first after today's last), or 0 without tides */
function nextTideAt(now, mins) {
  if (!mins.length) return 0;
  for (const m of mins) { const t = atClock(now, m); if (t > now) return t; }
  return atClock(dayShift(now, 1), mins[0]);
}
/* when the paper's current edition came out: today's edition time, or yesterday's if it's earlier than that */
function editionAt(now, min) { const t = atClock(now, min); return t <= now ? t : atClock(dayShift(now, -1), min); }
/* the hours you'd rather not send mail in: is `t` inside [from, to) (which can wrap past midnight)? */
function inHours(t, from, to) {
  const d = new Date(t), m = d.getHours() * 60 + d.getMinutes();
  if (from === to) return false;
  return from < to ? m >= from && m < to : m >= from || m < to;
}
/* the next time it's `min` after `t` ("8:00 tomorrow" late at night, "8:00 today" in the small hours) */
function nextClock(t, min) { const x = atClock(t, min); return x > t ? x : atClock(dayShift(t, 1), min); }
/* "today", "tomorrow", or the weekday, for a time soon after `now` */
function dayWord(t, now) {
  const day = (x) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const diff = Math.round((day(t) - day(now)) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(t).getDay()];
}

/* ---- the moon: how full it is (0 new, .5 full, back to 1), from the length of a lunar month */
function moonPhase(t) {
  const known = Date.UTC(2000, 0, 6, 18, 14); // a new moon
  const month = 29.530588853 * 86400000;
  const p = ((t - known) % month) / month;
  return p < 0 ? p + 1 : p;
}
function moonName(p) {
  if (p < 0.03 || p > 0.97) return "New moon";
  if (p < 0.22) return "Waxing crescent";
  if (p < 0.28) return "First quarter";
  if (p < 0.47) return "Waxing gibbous";
  if (p < 0.53) return "Full moon";
  if (p < 0.72) return "Waning gibbous";
  if (p < 0.78) return "Last quarter";
  return "Waning crescent";
}

/* ---- the sky at a moment: roughly when the sun is up where you are (from the season and the time), and
   the colors of the sky for it. lat: about where you are (north is positive); 40° unless told. */
function sunTimes(t, lat) {
  const d = new Date(t);
  const start = new Date(d.getFullYear(), 0, 0);
  const doy = Math.floor((d - start) / 86400000);
  const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (doy + 10)) * Math.PI / 180;
  const phi = (lat == null ? 40 : lat) * Math.PI / 180;
  const x = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(decl)));
  const half = Math.acos(x) * 180 / Math.PI / 15; // hours of daylight on each side of noon
  const noon = 12.5 * 60; // clocks run a little ahead of the sun (time zones, summer time): good enough for colors
  return { rise: noon - half * 60, set: noon + half * 60 };
}
const SKY = {
  night: ["#0b1022", "#151c36", "#1d2440"],
  dawn: ["#2b2f5c", "#9b6f8e", "#f2b48a"],
  day: ["#5c8fd6", "#8fb6e8", "#cfe1f5"],
  gold: ["#4f6fb0", "#e0a36a", "#f6d29a"],
  dusk: ["#1f2450", "#7a4f7c", "#e88a6a"],
};
const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbToHex = (c) => "#" + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
function mixHex(a, b, k) { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x.map((v, i) => v + (y[i] - v) * k)); }
function mixSky(a, b, k) { return a.map((c, i) => mixHex(c, b[i], k)); }
function skyAt(t, lat) {
  const d = new Date(t), m = d.getHours() * 60 + d.getMinutes();
  const { rise, set } = sunTimes(t, lat);
  let colors, stars = 0, phase;
  const ease = (x) => Math.max(0, Math.min(1, x));
  if (m < rise - 50 || m > set + 70) { colors = SKY.night; stars = 1; phase = "night"; }
  else if (m < rise + 40) { const k = ease((m - (rise - 50)) / 90); colors = k < 0.5 ? mixSky(SKY.night, SKY.dawn, k * 2) : mixSky(SKY.dawn, SKY.day, (k - 0.5) * 2); stars = ease(1 - k * 2); phase = "dawn"; }
  else if (m < set - 90) { colors = SKY.day; phase = "day"; }
  else if (m < set) { colors = mixSky(SKY.day, SKY.gold, ease((m - (set - 90)) / 90)); phase = "golden hour"; }
  else { const k = ease((m - set) / 70); colors = k < 0.5 ? mixSky(SKY.gold, SKY.dusk, k * 2) : mixSky(SKY.dusk, SKY.night, (k - 0.5) * 2); stars = ease((k - 0.4) / 0.6); phase = "dusk"; }
  const lum = (hex) => { const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ls = colors.map(lum);
  return { top: colors[0], mid: colors[1], low: colors[2], stars, phase, hi: Math.max(...ls), lo: Math.min(...ls) };
}
