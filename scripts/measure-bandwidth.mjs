// Read-only diagnostic: breaks down the byte size of everything a live viewer's
// subscribeSector listener downloads (sectors/{id}), plus the other top-level
// paths, so we can see exactly what's driving RTDB bandwidth. No writes, no
// auth needed — every path here has .read: true (see database.rules.json).
//
//   node scripts/measure-bandwidth.mjs                 # default sector
//   node scripts/measure-bandwidth.mjs --sector=foo
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const SECTOR = opt("sector", "default").replace(/[.#$/[\]]/g, "-");

function envVar(name) {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, "utf8").match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)\\s*$`, "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "").replace(/\/$/, "");
  }
  return null;
}

const BASE = envVar("VITE_FIREBASE_DATABASE_URL");
if (!BASE) throw new Error("VITE_FIREBASE_DATABASE_URL not found in .env.local or .env");

async function get(p) {
  const res = await fetch(`${BASE}/${p}.json`);
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${p} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const bytes = (o) => Buffer.byteLength(JSON.stringify(o ?? null), "utf8");
const fmt = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);
const count = (node) => (node && typeof node === "object" ? Object.keys(node).length : 0);

async function main() {
  console.log(`sector: ${SECTOR}\ndb    : ${BASE}\n`);

  const raw = await get(`sectors/${SECTOR}`);
  if (!raw) { console.log(`sectors/${SECTOR} does not exist`); return; }

  const totalSectorBytes = bytes(raw);
  console.log(`=== sectors/${SECTOR} — the live listener every viewer holds open ===`);
  console.log(`TOTAL: ${fmt(totalSectorBytes)}  (this is downloaded in full on every initial connect AND every reconnect)\n`);

  const rows = Object.keys(raw)
    .map((k) => ({ k, n: count(raw[k]), b: bytes(raw[k]) }))
    .sort((a, b) => b.b - a.b);
  for (const { k, n, b } of rows) {
    const pct = ((b / totalSectorBytes) * 100).toFixed(1);
    console.log(`  ${k.padEnd(24)} ${String(n).padStart(5)} item(s)  ${fmt(b).padStart(10)}  (${pct}%)`);
  }

  // If art is present, break it down entry-by-entry — SVGs are the most likely
  // single-item bloat source.
  if (raw.art) {
    console.log(`\n--- art library entries (each SVG rides along on every sector download) ---`);
    const entries = Object.entries(raw.art)
      .map(([id, a]) => ({ id, name: a?.name || "?", b: bytes(a) }))
      .sort((a, b) => b.b - a.b);
    for (const { id, name, b } of entries) console.log(`  ${fmt(b).padStart(10)}  ${name} (${id})`);
    console.log(`  ${entries.length} entr${entries.length === 1 ? "y" : "ies"} total`);
  }

  // Other top-level paths, for context (these are NOT part of the live listener
  // — see sectorRepo.js comments — but worth knowing their size too).
  console.log(`\n=== other top-level paths (not live-subscribed; fetched on demand) ===`);
  for (const p of ["sectorNotes", "sectorArchive", "sectorSnapshots", "sectorReads", "sectorWikiImages", "sectorWikiBodies"]) {
    const node = await get(`${p}/${SECTOR}`);
    console.log(`  ${p.padEnd(20)} ${fmt(bytes(node)).padStart(10)}`);
  }

  console.log(`\nEstimated cost per full reconnect of the live listener: ${fmt(totalSectorBytes)} x however many viewers x however many reconnects/day.`);
}

main().catch((e) => { console.error(`measure failed: ${e.message}`); process.exitCode = 1; });
