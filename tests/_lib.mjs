// Loads src/lib/*.js on their own (they touch nothing on the page) and hands back any name defined in them.
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

const dir = new URL("../src/lib/", import.meta.url);
export function lib() {
  const ctx = vm.createContext({ console, URL, URLSearchParams });
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js")).sort()) vm.runInContext(readFileSync(new URL(f, dir), "utf8"), ctx, { filename: f });
  return new Proxy({}, { get: (t, name) => vm.runInContext(String(name), ctx) });
}
// a local time, built the way the browser would (the tests run in the machine's own time zone)
export const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
