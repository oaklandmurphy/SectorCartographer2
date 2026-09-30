// One-shot backfill: reconstructs turnSnapshots (see src/lib/turnSnapshot.js)
// for turns played before that collection existed, from the GM's manually
// exported RTDB backups sitting in backups/. Going forward, App.jsx's
// nextTurn() captures a snapshot automatically every time the GM advances the
// turn — this script only fills in the turns that already happened before
// that existed.
//
// Each backup that carries a turn number (sectors/{sector}/turn/number) is a
// candidate for that turn's snapshot; a backup with no turn field at all (an
// export taken before turn tracking existed) is skipped outright — there's
// nothing to label it with. Where several backups share a turn number, the
// one with the latest meta.updatedAt wins, on the theory that it's closest to
// how the board looked when that turn actually closed.
//
// A turn that already has a snapshot is left alone unless --force is given —
// so re-running this after the live capture has taken over never clobbers a
// more accurate, GM-verified record with a reconstructed one.
//
//   node scripts/backfill-turn-snapshots.mjs --dry-run
//   node scripts/backfill-turn-snapshots.mjs                    # backfill ?sector=default
//   node scripts/backfill-turn-snapshots.mjs --sector=campaign-two
//   node scripts/backfill-turn-snapshots.mjs --force             # overwrite existing snapshots too
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { COLLECTIONS, decodeCollection, decodeV2Fleets, nestFleets, encodeEntity } from "../src/lib/sectorSchema.js";
import { captureBoardSnapshot } from "../src/lib/turnSnapshot.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.some((a) => a === `--${name}`);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const DRY = flag("dry-run");
const FORCE = flag("force");
const SECTOR = opt("sector", "default").replace(/[.#$/[\]]/g, "-");
const BACKUPS_DIR = path.join(root, "backups");

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

// The database rules require auth != null to write (see database.rules.json)
// — the app satisfies that with a silent anonymous sign-in (src/lib/firebase.js).
// Reads stay public, so only writes need the token attached.
let idToken = null;
async function ensureAuth() {
  if (idToken) return idToken;
  const apiKey = envVar("VITE_FIREBASE_API_KEY");
  if (!apiKey) throw new Error("VITE_FIREBASE_API_KEY not found in .env.local or .env — needed to sign in anonymously");
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`anonymous sign-in failed -> ${res.status} ${JSON.stringify(data)}`);
  idToken = data.idToken;
  return idToken;
}

const url = (p, token) => `${BASE}/${p}.json${token ? `?auth=${token}` : ""}`;

async function req(method, p, body) {
  const token = method === "GET" ? null : await ensureAuth();
  const res = await fetch(url(p, token), {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// Decodes a raw backup export the same way the app would (sectorRepo.js can't
// be imported directly here — it pulls in the browser Firebase SDK via
// firebase.js, which needs import.meta.env from Vite, not plain Node).
// Every backup this script actually processes is schema >= 2 (schema 1/v1
// exports predate the `turn` field entirely, so loadBackups() below has
// already filtered them out as "no labeled turn").
function decodeSector(raw) {
  const schema = raw.meta && Number(raw.meta.schema);
  const data = {};
  if (schema === 2) {
    for (const c of COLLECTIONS) {
      if (c === "fleets" || c === "ships" || c === "turnSnapshots") continue;
      data[c] = decodeCollection(c, raw[c]);
    }
    data.fleets = decodeV2Fleets(raw.fleets);
    return data;
  }
  for (const c of COLLECTIONS) {
    if (c === "turnSnapshots") continue;
    data[c] = decodeCollection(c, raw[c]);
  }
  return nestFleets(data);
}

function loadBackups() {
  const files = fs.existsSync(BACKUPS_DIR) ? fs.readdirSync(BACKUPS_DIR).filter((f) => f.endsWith(".json")) : [];
  const candidates = []; // { file, turn, updatedAt, sector }
  const skipped = [];
  for (const f of files) {
    const p = path.join(BACKUPS_DIR, f);
    let raw;
    try { raw = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { skipped.push(`${f}: unparseable JSON (${e.message})`); continue; }
    const sector = raw.sectors && raw.sectors[SECTOR];
    if (!sector) { skipped.push(`${f}: no sectors/${SECTOR} node in this export`); continue; }
    const turn = sector.turn && Number(sector.turn.number);
    if (!Number.isFinite(turn) || turn < 0) { skipped.push(`${f}: no labeled turn`); continue; }
    const stat = fs.statSync(p);
    const updatedAt = (sector.meta && Number(sector.meta.updatedAt)) || stat.mtimeMs;
    candidates.push({ file: f, turn, updatedAt, sector });
  }
  return { candidates, skipped };
}

async function main() {
  console.log(`sector  : ${SECTOR}`);
  console.log(`target  : ${BASE}`);
  console.log(`backups : ${path.relative(root, BACKUPS_DIR)}`);
  console.log(DRY ? "mode    : dry run — nothing will be written\n" : "mode    : live\n");

  const { candidates, skipped } = loadBackups();
  if (skipped.length) {
    console.log(`skipped ${skipped.length} backup file(s):`);
    skipped.forEach((s) => console.log(`  ${s}`));
    console.log("");
  }
  if (!candidates.length) { console.log("No labeled backups found — nothing to backfill."); return; }

  // Most recent backup per turn wins.
  const byTurn = new Map();
  for (const c of candidates) {
    const cur = byTurn.get(c.turn);
    if (!cur || c.updatedAt > cur.updatedAt) byTurn.set(c.turn, c);
  }
  const chosen = [...byTurn.values()].sort((a, b) => a.turn - b.turn);

  console.log(`${candidates.length} labeled backup(s) across ${chosen.length} turn(s):`);
  for (const c of chosen) {
    const others = candidates.filter((x) => x.turn === c.turn && x.file !== c.file).map((x) => x.file);
    console.log(`  turn ${c.turn}: ${c.file}  (${new Date(c.updatedAt).toLocaleString()})${others.length ? `  [superseded: ${others.join(", ")}]` : ""}`);
  }
  console.log("");

  // What's already there, so a plain run only fills gaps. Keyed by turn ->
  // existing record id, so a --force overwrite replaces that record in place
  // instead of leaving the old one behind alongside a new one.
  // turnSnapshots lives at its own path now, not under sectors/{id} — see
  // SNAPSHOT_COLLECTIONS in src/lib/sectorSchema.js.
  const existingRaw = await req("GET", `sectorSnapshots/${SECTOR}/turnSnapshots`);
  const existingIdByTurn = new Map(Object.entries(existingRaw || {}).map(([id, s]) => [s.turn, id]));

  const updates = {};
  const report = [];
  let newCount = 0;
  for (const c of chosen) {
    const existingId = existingIdByTurn.get(c.turn);
    if (existingId && !FORCE) {
      report.push(`turn ${c.turn}: already has a snapshot — skipped (use --force to overwrite)`);
      continue;
    }
    const data = decodeSector(c.sector);
    const snapshot = captureBoardSnapshot({
      turn: c.turn, capturedAt: c.updatedAt, source: "backfill",
      systems: data.systems, links: data.links, fleets: data.fleets, agents: data.agents,
      factions: data.factions, layers: data.layers,
    });
    if (existingId) snapshot.id = existingId; // overwrite in place rather than duplicating
    else newCount += 1;
    updates[`turnSnapshots/${snapshot.id}`] = encodeEntity("turnSnapshots", snapshot, c.turn);
    report.push(`turn ${c.turn}: ${data.systems.length} system(s), ${data.fleets.length} fleet(s), ${data.agents.length} agent(s) <- ${c.file}`);
  }
  console.log(report.map((l) => `  ${l}`).join("\n"));

  const paths = Object.keys(updates);
  if (!paths.length) { console.log("\nNothing to write."); return; }
  console.log(`\n${paths.length} snapshot(s) to write`);

  if (DRY) { console.log("\nDry run — nothing written."); return; }

  // Back up whatever's currently under turnSnapshots (same convention as
  // rename-ids.mjs / backfill-faction-tags.mjs) before touching anything,
  // even though this only ever adds/replaces snapshot records.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(root, "scripts", `backfill-turn-snapshots-backup-${SECTOR}-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(existingRaw || {}, null, 2));
  console.log(`backup written: ${path.relative(root, backupPath)}`);

  await req("PATCH", `sectorSnapshots/${SECTOR}`, updates);
  console.log("written.\n");

  const after = await req("GET", `sectorSnapshots/${SECTOR}/turnSnapshots`);
  const afterCount = after ? Object.keys(after).length : 0;
  const expected = existingIdByTurn.size + newCount;
  console.log(afterCount === expected
    ? `verified: turnSnapshots now has ${afterCount} record(s).`
    : `FAIL: turnSnapshots has ${afterCount} record(s), expected ${expected} — investigate before trusting the new shape.`);
}

main().catch((e) => { console.error(`\nbackfill failed: ${e.message}`); process.exitCode = 1; });
