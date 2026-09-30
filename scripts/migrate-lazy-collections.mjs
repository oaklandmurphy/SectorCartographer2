// One-shot migration: moves archivedActions/archivedMissions/turnSnapshots/
// wikiReads/actionReads/missionReads/replenishmentReads out of sectors/{id}
// into their own paths (sectorArchive/sectorSnapshots/sectorReads/{id}), and
// moves each wiki entry's `image` field out of wiki/{id} into
// sectorWikiImages/{id}/{wikiId} — see ARCHIVE_COLLECTIONS/SNAPSHOT_COLLECTIONS/
// READ_COLLECTIONS in src/lib/sectorSchema.js and the wiki codec's comment
// there for why.
//
// Unlike scripts/migrate-notes.mjs, leaving the old copies in place does NOT
// make this a no-op for bandwidth: they're still children of sectors/{id},
// which every viewer's live listener downloads in full on every connect. The
// whole point of this migration is to shrink that document, so this script
// has a real cleanup step — gated behind its own flag so nothing is deleted
// until you've deployed the new app code and confirmed it reads correctly
// from the new paths.
//
//   node scripts/migrate-lazy-collections.mjs --dry-run       # show sizes/counts, write nothing
//   node scripts/migrate-lazy-collections.mjs                 # copy to the new paths (?sector=default)
//   node scripts/migrate-lazy-collections.mjs --sector=campaign-two
//   node scripts/migrate-lazy-collections.mjs --force         # overwrite an existing copy at the new paths
//   node scripts/migrate-lazy-collections.mjs --cleanup       # after confirming the new code works: strip
//                                                              # the old copies out of sectors/{id}
//
// A full backup of sectors/{id} is written to scripts/ before either the copy
// or the cleanup step touches anything.
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
const count = (node) => (node && typeof node === "object" ? Object.keys(node).length : 0);

const ARCHIVE_COLLECTIONS = ["archivedActions", "archivedMissions"];
const SNAPSHOT_COLLECTIONS = ["turnSnapshots"];
const READ_COLLECTIONS = ["wikiReads", "actionReads", "missionReads", "replenishmentReads"];

function backup(raw) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(root, "scripts", `migrate-lazy-collections-backup-${SECTOR}-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(raw, null, 2));
  console.log(`backup written: ${path.relative(root, backupPath)}`);
}

async function planCopy(raw) {
  const archiveNode = {};
  for (const c of ARCHIVE_COLLECTIONS) archiveNode[c] = raw[c] || {};
  const snapshotsNode = {};
  for (const c of SNAPSHOT_COLLECTIONS) snapshotsNode[c] = raw[c] || {};
  const readsNode = {};
  for (const c of READ_COLLECTIONS) readsNode[c] = raw[c] || {};
  const wikiImagesNode = {};
  for (const [id, entry] of Object.entries(raw.wiki || {})) {
    if (entry && typeof entry.image === "string" && entry.image) wikiImagesNode[id] = entry.image;
  }
  return { archiveNode, snapshotsNode, readsNode, wikiImagesNode };
}

async function main() {
  console.log(`sector  : ${SECTOR}`);
  console.log(`target  : ${BASE}`);
  console.log(CLEANUP ? "mode    : cleanup — removing old copies from sectors/{id}\n"
    : DRY ? "mode    : dry run — nothing will be written\n" : "mode    : copy to new paths\n");

  const raw = await req("GET", `sectors/${SECTOR}`);
  if (!raw) throw new Error(`sectors/${SECTOR} does not exist — nothing to migrate`);

  if (CLEANUP) {
    await cleanup(raw);
    return;
  }

  const { archiveNode, snapshotsNode, readsNode, wikiImagesNode } = await planCopy(raw);

  console.log("plan:");
  console.log(`  sectorArchive/${SECTOR}      archivedActions: ${count(archiveNode.archivedActions)}, archivedMissions: ${count(archiveNode.archivedMissions)}  (${fmt(bytes(archiveNode))})`);
  console.log(`  sectorSnapshots/${SECTOR}    turnSnapshots: ${count(snapshotsNode.turnSnapshots)}  (${fmt(bytes(snapshotsNode))})`);
  console.log(`  sectorReads/${SECTOR}        wikiReads: ${count(readsNode.wikiReads)}, actionReads: ${count(readsNode.actionReads)}, missionReads: ${count(readsNode.missionReads)}, replenishmentReads: ${count(readsNode.replenishmentReads)}  (${fmt(bytes(readsNode))})`);
  console.log(`  sectorWikiImages/${SECTOR}   ${count(wikiImagesNode)} image(s)  (${fmt(bytes(wikiImagesNode))})`);
  const totalBytes = bytes(archiveNode) + bytes(snapshotsNode) + bytes(readsNode) + bytes(wikiImagesNode);
  console.log(`\n${fmt(totalBytes)} total, currently inside every viewer's live sectors/${SECTOR} download`);

  if (DRY) {
    console.log("\nDry run — nothing written. Old copies are untouched either way; re-run without --dry-run to copy,");
    console.log("then deploy the new app code, confirm it works, and finally run with --cleanup to remove the old copies");
    console.log("(that last step is what actually shrinks sectors/{id} and saves bandwidth).");
    return;
  }

  const existing = await Promise.all([
    req("GET", `sectorArchive/${SECTOR}`),
    req("GET", `sectorSnapshots/${SECTOR}`),
    req("GET", `sectorReads/${SECTOR}`),
    req("GET", `sectorWikiImages/${SECTOR}`),
  ]);
  if (existing.some(Boolean) && !FORCE) {
    console.log("\nOne or more target paths already have data. Nothing written (use --force to overwrite).");
    return;
  }

  backup(raw);

  await req("PUT", `sectorArchive/${SECTOR}`, archiveNode);
  await req("PUT", `sectorSnapshots/${SECTOR}`, snapshotsNode);
  await req("PUT", `sectorReads/${SECTOR}`, readsNode);
  await req("PUT", `sectorWikiImages/${SECTOR}`, wikiImagesNode);
  console.log("\nwritten to the new paths.");

  const [afterArchive, afterSnapshots, afterReads, afterImages] = await Promise.all([
    req("GET", `sectorArchive/${SECTOR}`),
    req("GET", `sectorSnapshots/${SECTOR}`),
    req("GET", `sectorReads/${SECTOR}`),
    req("GET", `sectorWikiImages/${SECTOR}`),
  ]);
  const ok =
    count(afterArchive?.archivedActions) === count(archiveNode.archivedActions) &&
    count(afterArchive?.archivedMissions) === count(archiveNode.archivedMissions) &&
    count(afterSnapshots?.turnSnapshots) === count(snapshotsNode.turnSnapshots) &&
    count(afterReads?.wikiReads) === count(readsNode.wikiReads) &&
    count(afterReads?.actionReads) === count(readsNode.actionReads) &&
    count(afterReads?.missionReads) === count(readsNode.missionReads) &&
    count(afterReads?.replenishmentReads) === count(readsNode.replenishmentReads) &&
    count(afterImages) === count(wikiImagesNode);

  console.log(ok
    ? "\nverified: every record reads back from its new path."
    : "\nFAIL: read-back did not match — investigate before deploying or running --cleanup.");
  if (!ok) { process.exitCode = 1; return; }

  console.log("\nOld copies are still in place under sectors/" + SECTOR + " — the app keeps working either way.");
  console.log("Deploy the new app code (and database.rules.json), confirm it reads correctly from the new paths,");
  console.log(`then run: node scripts/migrate-lazy-collections.mjs --sector=${SECTOR} --cleanup`);
}

async function cleanup(raw) {
  const hadImage = Object.entries(raw.wiki || {}).filter(([, e]) => e && typeof e.image === "string" && e.image).map(([id]) => id);
  const toClear = [...ARCHIVE_COLLECTIONS, ...SNAPSHOT_COLLECTIONS, ...READ_COLLECTIONS].filter((c) => raw[c] !== undefined);

  if (!toClear.length && !hadImage.length) {
    console.log("Nothing to clean up — sectors/" + SECTOR + " has no old copies of the migrated collections.");
    return;
  }

  // Cross-check the new paths actually have this sector's data before deleting
  // the only other copy of it.
  const [archive, snapshots, reads, images] = await Promise.all([
    req("GET", `sectorArchive/${SECTOR}`),
    req("GET", `sectorSnapshots/${SECTOR}`),
    req("GET", `sectorReads/${SECTOR}`),
    req("GET", `sectorWikiImages/${SECTOR}`),
  ]);
  const checks = [
    ["archivedActions", archive?.archivedActions, raw.archivedActions],
    ["archivedMissions", archive?.archivedMissions, raw.archivedMissions],
    ["turnSnapshots", snapshots?.turnSnapshots, raw.turnSnapshots],
    ["wikiReads", reads?.wikiReads, raw.wikiReads],
    ["actionReads", reads?.actionReads, raw.actionReads],
    ["missionReads", reads?.missionReads, raw.missionReads],
    ["replenishmentReads", reads?.replenishmentReads, raw.replenishmentReads],
  ];
  const mismatched = checks.filter(([, newCount, oldNode]) => count(newCount) !== count(oldNode));
  const imagesMismatch = count(images) !== hadImage.length;
  if (mismatched.length || imagesMismatch) {
    console.log("Refusing to clean up — the new paths don't match sectors/" + SECTOR + " yet:");
    for (const [name, newNode, oldNode] of mismatched) {
      console.log(`  ${name}: sectorArchive/sectorSnapshots/sectorReads has ${count(newNode)}, sectors/${SECTOR} has ${count(oldNode)}`);
    }
    if (imagesMismatch) console.log(`  wiki images: sectorWikiImages has ${count(images)}, sectors/${SECTOR}/wiki has ${hadImage.length}`);
    console.log("Run without --cleanup first to (re-)copy, or investigate before retrying.");
    process.exitCode = 1;
    return;
  }

  backup(raw);

  const updates = {};
  for (const c of toClear) updates[c] = null;
  for (const id of hadImage) updates[`wiki/${id}/image`] = null;

  console.log(`clearing ${Object.keys(updates).length} path(s) under sectors/${SECTOR}:`);
  console.log(`  ${toClear.join(", ")}${hadImage.length ? `, wiki/*/image (${hadImage.length})` : ""}`);

  await req("PATCH", `sectors/${SECTOR}`, updates);
  console.log("\ndone. sectors/" + SECTOR + " no longer carries the migrated collections or wiki images.");
}

main().catch((e) => { console.error(`\nmigration failed: ${e.message}`); process.exitCode = 1; });
