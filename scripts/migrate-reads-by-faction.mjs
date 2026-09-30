// One-shot migration: restructures sectorReads/{id} from a flat multi-faction
// blob (wikiReads/actionReads/missionReads/replenishmentReads, each holding
// every faction's receipts mixed together under one root) into per-faction
// nodes — sectorReads/{id}/{factionId}/{collection}/{entityId} = seenAt — see
// READ_COLLECTIONS/decodeReads/buildReadsUpdates in src/lib/sectorSchema.js.
//
// Every consumer (App.jsx's unseenArticles/unseenResolvedActions/etc.) only
// ever reads the current viewer's own faction's receipts, but the old shape
// made every viewer's tab download the WHOLE multi-faction blob (500KB+ for
// a modest campaign, and only growing) any time it went stale and the tab
// regained focus — which, spread across a handful of players switching tabs
// or unlocking their phone all day, was most of this app's Firebase bill.
// The new shape lets a viewer fetch only their own faction's slice, and the
// GM (who has no faction) skips this collection entirely.
//
// Same two-phase shape as migrate-art-wiki.mjs/migrate-wiki-body-split.mjs:
// the old flat keys (wikiReads/actionReads/missionReads/replenishmentReads/
// updatedAt) and the new per-faction keys (faction ids, e.g. fac_gorbulon)
// live at the SAME sectorReads/{id} root but never collide, so this writes
// the new structure additively first — old app code keeps working off the
// old keys the whole time — then, once the new app code is deployed and
// confirmed, --cleanup removes the old flat keys.
//
//   node scripts/migrate-reads-by-faction.mjs --dry-run       # show sizes/counts, write nothing
//   node scripts/migrate-reads-by-faction.mjs                 # write the per-faction copy (?sector=default)
//   node scripts/migrate-reads-by-faction.mjs --sector=campaign-two
//   node scripts/migrate-reads-by-faction.mjs --force         # overwrite existing per-faction data
//   node scripts/migrate-reads-by-faction.mjs --cleanup       # after confirming the new code works: strip
//                                                                the old flat keys out of sectorReads/{id}
//
// A full backup of sectorReads/{id} is written to scripts/ before either the
// copy or the cleanup step touches anything.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.some((a) => a === `--${name}`);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const DRY = flag("dry-run");
const FORCE = flag("force");
const CLEANUP = flag("cleanup");
const SECTOR = opt("sector", "default").replace(/[.#$/[\]]/g, "-");

const OLD_KEYS = ["wikiReads", "actionReads", "missionReads", "replenishmentReads"];
const ENTITY_KEY = { wikiReads: "wikiId", actionReads: "actionId", missionReads: "missionId", replenishmentReads: "replenishmentId" };

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

const bytes = (o) => JSON.stringify(o ?? null).length;
const fmt = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

function backup(raw) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(root, "scripts", `migrate-reads-by-faction-backup-${SECTOR}-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(raw, null, 2));
  console.log(`backup written: ${path.relative(root, backupPath)}`);
}

// Old shape: sectorReads/{id}/{collection}/{oldKey} = { id, factionId, wikiId|actionId|..., seenAt, _ord }.
// New shape: sectorReads/{id}/{factionId}/{collection}/{entityId} = seenAt.
function buildFactionNodes(raw) {
  const byFaction = {}; // factionId -> { wikiReads: {entityId: seenAt}, ..., updatedAt }
  let receiptCount = 0;
  for (const collection of OLD_KEYS) {
    const node = raw[collection];
    if (!node || typeof node !== "object") continue;
    const entityKey = ENTITY_KEY[collection];
    for (const [oldKey, receipt] of Object.entries(node)) {
      if (!receipt || typeof receipt !== "object") continue;
      const factionId = receipt.factionId;
      const entityId = receipt[entityKey];
      const seenAt = receipt.seenAt;
      if (!factionId || !entityId || typeof seenAt !== "number") {
        console.warn(`  skipping malformed ${collection}/${oldKey}:`, receipt);
        continue;
      }
      if (!byFaction[factionId]) byFaction[factionId] = { updatedAt: 0 };
      if (!byFaction[factionId][collection]) byFaction[factionId][collection] = {};
      byFaction[factionId][collection][entityId] = seenAt;
      if (seenAt > byFaction[factionId].updatedAt) byFaction[factionId].updatedAt = seenAt;
      receiptCount++;
    }
  }
  return { byFaction, receiptCount };
}

async function main() {
  console.log(`sector  : ${SECTOR}`);
  console.log(`target  : ${BASE}`);
  console.log(CLEANUP ? "mode    : cleanup — stripping old flat keys out of sectorReads/{id}\n"
    : DRY ? "mode    : dry run — nothing will be written\n" : "mode    : write per-faction copy\n");

  const raw = await req("GET", `sectorReads/${SECTOR}`);
  if (!raw) throw new Error(`sectorReads/${SECTOR} does not exist — nothing to migrate`);

  if (CLEANUP) {
    await cleanup(raw);
    return;
  }

  const { byFaction, receiptCount } = buildFactionNodes(raw);
  const factionIds = Object.keys(byFaction);

  console.log(`plan: ${receiptCount} receipt(s) across ${factionIds.length} faction(s)`);
  for (const fid of factionIds) {
    const node = byFaction[fid];
    const counts = OLD_KEYS.map((c) => `${c}=${Object.keys(node[c] || {}).length}`).join(" ");
    console.log(`  ${fid.padEnd(20)} ${fmt(bytes(node)).padStart(10)}   ${counts}`);
  }
  console.log(`\n${fmt(bytes(byFaction))} total, written across ${factionIds.length} per-faction node(s)`);
  console.log(`(vs. ${fmt(bytes(raw))} today, downloaded in FULL by every faction's tab on every stale refetch)`);

  if (!factionIds.length) {
    console.log("\nNothing to do.");
    return;
  }

  if (DRY) {
    console.log("\nDry run — nothing written. Re-run without --dry-run to write the per-faction copy,");
    console.log("then deploy the new app code, confirm it works, and finally run with --cleanup to strip the old");
    console.log("flat keys out of sectorReads/{id} (that last step is what actually shrinks it back down).");
    return;
  }

  const existing = await req("GET", `sectorReads/${SECTOR}`);
  const alreadyPresent = factionIds.filter((fid) => existing && existing[fid] !== undefined);
  if (alreadyPresent.length && !FORCE) {
    console.log(`\n${alreadyPresent.length} of ${factionIds.length} faction node(s) already exist at the new path. Nothing written (use --force to overwrite).`);
    return;
  }

  backup(raw);

  await req("PATCH", `sectorReads/${SECTOR}`, byFaction);
  console.log("\nwritten: per-faction nodes copied in.");

  const after = await req("GET", `sectorReads/${SECTOR}`);
  const ok = factionIds.every((fid) => {
    const node = after?.[fid];
    return node && OLD_KEYS.every((c) => Object.keys(node[c] || {}).length === Object.keys(byFaction[fid][c] || {}).length);
  });
  console.log(ok
    ? "\nverified: every faction's receipts read back from the new path."
    : "\nFAIL: read-back did not match — investigate before deploying or running --cleanup.");
  if (!ok) { process.exitCode = 1; return; }

  console.log("\nOld flat keys are still in place under sectorReads/" + SECTOR + " — the app keeps working either way.");
  console.log("Deploy the new app code (and database.rules.json if it changed), confirm Updates badges read correctly,");
  console.log(`then run: node scripts/migrate-reads-by-faction.mjs --sector=${SECTOR} --cleanup`);
}

async function cleanup(raw) {
  const toClear = OLD_KEYS.filter((c) => raw[c] !== undefined);
  if (raw.updatedAt !== undefined) toClear.push("updatedAt");
  if (!toClear.length) {
    console.log("Nothing to clean up — sectorReads/" + SECTOR + " has no old flat keys.");
    return;
  }

  // Cross-check the per-faction copy actually has everything the old flat
  // keys do before deleting the only other copy of it.
  const { byFaction, receiptCount } = buildFactionNodes(raw);
  const factionIds = Object.keys(byFaction);
  const missing = factionIds.filter((fid) => {
    const node = raw[fid];
    return !node || OLD_KEYS.some((c) => Object.keys(node[c] || {}).length !== Object.keys(byFaction[fid][c] || {}).length);
  });
  if (missing.length) {
    console.log(`Refusing to clean up — sectorReads/${SECTOR} is missing or mismatched for ${missing.length} of ${factionIds.length} faction(s): ${missing.join(", ")}`);
    console.log("Run without --cleanup first to (re-)copy, or investigate before retrying.");
    process.exitCode = 1;
    return;
  }

  backup(raw);

  const updates = {};
  for (const k of toClear) updates[k] = null;

  console.log(`clearing ${toClear.join(", ")} from sectorReads/${SECTOR} (${receiptCount} old receipt(s))`);
  await req("PATCH", `sectorReads/${SECTOR}`, updates);
  console.log("\ndone. sectorReads/" + SECTOR + " no longer carries the old flat multi-faction blob.");
}

main().catch((e) => { console.error(`\nmigration failed: ${e.message}`); process.exitCode = 1; });
