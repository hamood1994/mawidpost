// MawidPost background worker: publishes due posts every minute, runs Autopilot hourly,
// and takes a daily followers snapshot. Run with PM2 (see scripts/README-deploy.md).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const base = process.env.WORKER_BASE_URL || "http://127.0.0.1:3010";
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET is missing in .env.local");
  process.exit(1);
}

let busy = new Set();
async function hit(path) {
  if (busy.has(path)) return;
  busy.add(path);
  try {
    const res = await fetch(base + path, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(280000) });
    const text = await res.text();
    if (!res.ok || (path !== "/api/cron/publish") || !/"processed":0/.test(text)) console.log(new Date().toISOString(), path, res.status, text.slice(0, 200));
  } catch (e) {
    console.error(new Date().toISOString(), path, "failed:", e instanceof Error ? e.message : e);
  } finally {
    busy.delete(path);
  }
}

const MIN = 60_000;
setInterval(() => hit("/api/cron/publish"), MIN);
setInterval(() => hit("/api/cron/autopilot"), 60 * MIN);
setInterval(() => hit("/api/cron/snapshot"), 24 * 60 * MIN);
setTimeout(() => { hit("/api/cron/publish"); hit("/api/cron/autopilot"); }, 15_000);
console.log("mawidpost-worker started ->", base);
