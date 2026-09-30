// One-shot migration: moves the `art` and `wiki` collections out of
// sectors/{id} into their own paths (sectorArt/sectorWiki/{id}) — see
// ART_COLLECTION/WIKI_COLLECTION in src/lib/sectorSchema.js for why: both are
// large-ish and mostly-static compared to the map state that actually needs
// to be live, but every viewer's root listener was re-downloading them in
// full on every reconnect regardless.
//
// Same two-phase shape as migrate-lazy-collections.mjs before it: copy first
// (additive, old copies untouched), deploy the new app code, confirm it reads
// correctly, THEN run --cleanup to strip the old copies and actually shrink
// sectors/{id}.
//
//   node scripts/migrate-art-wiki.mjs --dry-run       # show sizes/counts, write nothing
//   node scripts/migrate-art-wiki.mjs                 # copy to the new paths (?sector=default)
//   node scripts/migrate-art-wiki.mjs --sector=campaign-two
//   node scripts/migrate-art-wiki.mjs --force         # overwrite an existing copy at the new paths
//   node scripts/migrate-art-wiki.mjs --cleanup       # after confirming the new code works: strip
//                                                       # the old copies out of sectors/{id}
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

function backup(raw) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(root, "scripts", `migrate-art-wiki-backup-${SECTOR}-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(raw, null, 2));
  console.log(`backup written: ${path.relative(root, backupPath)}`);
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

  // sectorArt/{id}/art/{entityId} and sectorWiki/{id}/wiki/{entityId} — the
  // nested "art"/"wiki" key matches how buildCollectionUpdates (see
  // sectorSchema.js) writes diffs there, which loadArt/loadWiki (sectorRepo.js)
  // unwrap on the way back out.
  const artNode = { art: raw.art || {}, updatedAt: Date.now() };
  const wikiNode = { wiki: raw.wiki || {}, updatedAt: Date.now() };

  console.log("plan:");
  console.log(`  sectorArt/${SECTOR}   ${count(artNode.art)} entr${count(artNode.art) === 1 ? "y" : "ies"}   (${fmt(bytes(artNode))})`);
  console.log(`  sectorWiki/${SECTOR}  ${count(wikiNode.wiki)} entr${count(wikiNode.wiki) === 1 ? "y" : "ies"}  (${fmt(bytes(wikiNode))})`);
  console.log(`\n${fmt(bytes(artNode) + bytes(wikiNode))} total, currently inside every viewer's live sectors/${SECTOR} download`);

  if (DRY) {
    console.log("\nDry run — nothing written. Old copies are untouched either way; re-run without --dry-run to copy,");
    console.log("then deploy the new app code, confirm it works, and finally run with --cleanup to remove the old copies");
    console.log("(that last step is what actually shrinks sectors/{id} and saves bandwidth).");
    return;
  }

  const [existingArt, existingWiki] = await Promise.all([
    req("GET", `sectorArt/${SECTOR}`),
    req("GET", `sectorWiki/${SECTOR}`),
  ]);
  if ((existingArt || existingWiki) && !FORCE) {
    console.log("\nOne or both target paths already have data. Nothing written (use --force to overwrite).");
    return;
  }

  backup(raw);

  await req("PUT", `sectorArt/${SECTOR}`, artNode);
  await req("PUT", `sectorWiki/${SECTOR}`, wikiNode);
  console.log("\nwritten to the new paths.");

  const [afterArt, afterWiki] = await Promise.all([
    req("GET", `sectorArt/${SECTOR}`),
    req("GET", `sectorWiki/${SECTOR}`),
  ]);
  const ok = count(afterArt?.art) === count(artNode.art) && count(afterWiki?.wiki) === count(wikiNode.wiki);

  console.log(ok
    ? "\nverified: every record reads back from its new path."
    : "\nFAIL: read-back did not match — investigate before deploying or running --cleanup.");
  if (!ok) { process.exitCode = 1; return; }

  console.log("\nOld copies are still in place under sectors/" + SECTOR + " — the app keeps working either way.");
  console.log("Deploy the new app code (and database.rules.json), confirm it reads correctly from the new paths,");
  console.log(`then run: node scripts/migrate-art-wiki.mjs --sector=${SECTOR} --cleanup`);
}

async function cleanup(raw) {
  const toClear = ["art", "wiki"].filter((c) => raw[c] !== undefined);
  if (!toClear.length) {
    console.log("Nothing to clean up — sectors/" + SECTOR + " has no old copies of art/wiki.");
    return;
  }

  const [art, wiki] = await Promise.all([
    req("GET", `sectorArt/${SECTOR}`),
    req("GET", `sectorWiki/${SECTOR}`),
  ]);
  const mismatched = [
    ["art", art?.art, raw.art],
    ["wiki", wiki?.wiki, raw.wiki],
  ].filter(([, newNode, oldNode]) => count(newNode) !== count(oldNode));
  if (mismatched.length) {
    console.log("Refusing to clean up — the new paths don't match sectors/" + SECTOR + " yet:");
    for (const [name, newNode, oldNode] of mismatched) {
      console.log(`  ${name}: new path has ${count(newNode)}, sectors/${SECTOR} has ${count(oldNode)}`);
    }
    console.log("Run without --cleanup first to (re-)copy, or investigate before retrying.");
    process.exitCode = 1;
    return;
  }

  backup(raw);

  const updates = {};
  for (const c of toClear) updates[c] = null;

  console.log(`clearing ${toClear.join(", ")} from sectors/${SECTOR}`);
  await req("PATCH", `sectors/${SECTOR}`, updates);
  console.log("\ndone. sectors/" + SECTOR + " no longer carries art or wiki.");
}

main().catch((e) => { console.error(`\nmigration failed: ${e.message}`); process.exitCode = 1; });
