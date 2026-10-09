import { test } from "node:test";
import assert from "node:assert/strict";
import { lib, local } from "./_lib.mjs";
const L = lib();

test("clock text and parsing", () => {
  assert.equal(L.parseClock("16:00"), 960);
  assert.equal(L.parseClock("4:30 PM"), 990);
  assert.equal(L.parseClock("12 am"), 0);
  assert.equal(L.parseClock("12:15 pm"), 735);
  assert.ok(Number.isNaN(L.parseClock("25:00")));
  assert.ok(Number.isNaN(L.parseClock("9:75")));
  assert.ok(Number.isNaN(L.parseClock("soon")));
  assert.equal(L.clockText(960), "4:00");
  assert.equal(L.clockText(0), "12:00");
  assert.equal(L.clockText(750), "12:30");
  assert.equal(L.clockText(960, true), "16:00");
  assert.equal(L.clockText(-30, true), "23:30");
});

test("tide lists", () => {
  assert.deepEqual([...L.tideList("two")], [540, 960]);
  assert.deepEqual([...L.tideList("three")], [480, 750, 1020]);
  assert.deepEqual([...L.tideList("off")], []);
  assert.deepEqual([...L.tideList([960, 540, 540, "x", 2000, 600])], [540, 600, 960]);
});

test("the last and the next tide", () => {
  const two = L.tideList("two");
  // 2 PM: the last tide was 9 AM today, the next is 4 PM today
  assert.equal(L.lastTideAt(local(2026, 10, 8, 14), two), local(2026, 10, 8, 9));
  assert.equal(L.nextTideAt(local(2026, 10, 8, 14), two), local(2026, 10, 8, 16));
  // 7 AM: the last was 4 PM yesterday, the next 9 AM today
  assert.equal(L.lastTideAt(local(2026, 10, 8, 7), two), local(2026, 10, 7, 16));
  assert.equal(L.nextTideAt(local(2026, 10, 8, 7), two), local(2026, 10, 8, 9));
  // 11 PM: the next is 9 AM tomorrow
  assert.equal(L.nextTideAt(local(2026, 10, 8, 23), two), local(2026, 10, 9, 9));
  // exactly at a tide: that tide has come
  assert.equal(L.lastTideAt(local(2026, 10, 8, 16), two), local(2026, 10, 8, 16));
  assert.equal(L.nextTideAt(local(2026, 10, 8, 16), two), local(2026, 10, 9, 9));
  // across the end of a month
  assert.equal(L.nextTideAt(local(2026, 10, 31, 22), two), local(2026, 11, 1, 9));
  assert.equal(L.lastTideAt(local(2026, 10, 8, 14), []), 0);
});

test("editions and hours", () => {
  assert.equal(L.editionAt(local(2026, 10, 8, 9), 420), local(2026, 10, 8, 7));
  assert.equal(L.editionAt(local(2026, 10, 8, 6), 420), local(2026, 10, 7, 7));
  assert.ok(L.inHours(local(2026, 10, 8, 23, 30), 22 * 60, 6 * 60));
  assert.ok(L.inHours(local(2026, 10, 8, 3), 22 * 60, 6 * 60));
  assert.ok(!L.inHours(local(2026, 10, 8, 6), 22 * 60, 6 * 60));
  assert.ok(!L.inHours(local(2026, 10, 8, 12), 22 * 60, 6 * 60));
  assert.ok(L.inHours(local(2026, 10, 8, 13), 12 * 60, 14 * 60));
  assert.ok(!L.inHours(local(2026, 10, 8, 13), 600, 600));
  assert.equal(L.nextClock(local(2026, 10, 8, 23), 480), local(2026, 10, 9, 8));
  assert.equal(L.nextClock(local(2026, 10, 8, 2), 480), local(2026, 10, 8, 8));
  assert.equal(L.dayWord(local(2026, 10, 9, 8), local(2026, 10, 8, 23)), "tomorrow");
  assert.equal(L.dayWord(local(2026, 10, 8, 8), local(2026, 10, 8, 2)), "today");
});

test("the moon", () => {
  // the new moon of Jan 6, 2000 itself, and the full moon a half month later
  assert.ok(L.moonPhase(Date.UTC(2000, 0, 6, 18, 14)) < 0.001);
  const full = L.moonPhase(Date.UTC(2000, 0, 21, 4, 40));
  assert.ok(Math.abs(full - 0.5) < 0.02, String(full));
  // a known full moon: Oct 6, 2025
  assert.ok(Math.abs(L.moonPhase(Date.UTC(2025, 9, 7, 3, 47)) - 0.5) < 0.03);
  assert.equal(L.moonName(0.5), "Full moon");
  assert.equal(L.moonName(0.01), "New moon");
  assert.equal(L.moonName(0.25), "First quarter");
});

test("the sky through a day", () => {
  const at = (h, m = 0) => L.skyAt(local(2026, 6, 21, h, m), 42);
  assert.equal(at(2).phase, "night");
  assert.equal(at(2).stars, 1);
  assert.equal(at(13).phase, "day");
  assert.equal(at(13).stars, 0);
  assert.ok(at(13).hi > at(2).hi, "day is brighter than night");
  assert.equal(at(23).phase, "night");
  // winter days are shorter than summer ones
  const winter = L.sunTimes(local(2026, 12, 21, 12), 42), summer = L.sunTimes(local(2026, 6, 21, 12), 42);
  assert.ok(summer.set - summer.rise > winter.set - winter.rise + 120);
  for (let h = 0; h < 24; h++) { const s = at(h); for (const c of [s.top, s.mid, s.low]) assert.match(c, /^#[0-9a-f]{6}$/); }
});

test("the days clocks change", () => {
  const two = L.tideList("two");
  // US clocks fall back on Nov 1, 2026 and spring forward on Mar 8, 2026: tides stay on the clock
  assert.equal(new Date(L.nextTideAt(local(2026, 10, 31, 22), two)).getHours(), 9);
  assert.equal(new Date(L.lastTideAt(local(2026, 11, 1, 7), two)).getHours(), 16);
  assert.equal(new Date(L.nextTideAt(local(2026, 3, 7, 22), two)).getHours(), 9);
  assert.equal(new Date(L.nextClock(local(2026, 10, 31, 23), 480)).getHours(), 8);
  assert.equal(new Date(L.editionAt(local(2026, 11, 1, 5), 420)).getHours(), 7);
});
