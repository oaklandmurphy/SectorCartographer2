// One-shot migration: moves each wiki entry's `body` out of wiki/{id} into
// sectorWikiBodies/{sectorId}/{wikiId}, and writes a short `excerpt` (used by
// the entry list/search) onto wiki/{id} itself — see the wiki codec's comment
// in src/lib/sectorSchema.js for why. Separate from
// scripts/migrate-lazy-collections.mjs (which already moved archived history/
// read receipts/wiki images) since that script's all-or-nothing "does the
// target already have data" check would otherwise refuse to run again for
// paths it already populated.
//
// Two things happen in the main pass, not just one: unlike a pure move, the
// `excerpt` write has to land on the *live* wiki entity right away — every
// viewer's listener reads that collection, and the entry list has nothing to
// show for a page until it does. Stripping the old `body` field is what
// actually shrinks sectors/{id}, so — same as migrate-lazy-collections.mjs —
// that part waits for --cleanup, once the new app code is confirmed working.
//
//   node scripts/migrate-wiki-body-split.mjs --dry-run       # show sizes/counts, write nothing
//   node scripts/migrate-wiki-body-split.mjs                 # copy bodies + write excerpts (?sector=default)
//   node scripts/migrate-wiki-body-split.mjs --sector=campaign-two
//   node scripts/migrate-wiki-body-split.mjs --force         # overwrite existing sectorWikiBodies data
//   node scripts/migrate-wiki-body-split.mjs --cleanup       # after confirming the new code works: strip
//                                                              # `body` out of sectors/{id}/wiki/*
//
// A full backup of sectors/{id} is written to scripts/ before either the copy
// or the cleanup step touches anything.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { bodyExcerpt } from "../src/lib/codexBody.js";

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

function backup(raw) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(root, "scripts", `migrate-wiki-body-split-backup-${SECTOR}-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(raw, null, 2));
  console.log(`backup written: ${path.relative(root, backupPath)}`);
}

async function main() {
  console.log(`sector  : ${SECTOR}`);
  console.log(`target  : ${BASE}`);
  console.log(CLEANUP ? "mode    : cleanup — stripping body out of sectors/{id}/wiki/*\n"
    : DRY ? "mode    : dry run — nothing will be written\n" : "mode    : copy bodies + write excerpts\n");

  const raw = await req("GET", `sectors/${SECTOR}`);
  if (!raw) throw new Error(`sectors/${SECTOR} does not exist — nothing to migrate`);
  const wiki = raw.wiki || {};

  if (CLEANUP) {
    await cleanup(wiki);
    return;
  }

  const withBody = Object.entries(wiki).filter(([, e]) => e && typeof e.body === "string" && e.body);
  const bodiesNode = {};
  const excerptUpdates = {};
  for (const [id, entry] of withBody) {
    bodiesNode[id] = entry.body;
    excerptUpdates[`wiki/${id}/excerpt`] = bodyExcerpt(entry.body).slice(0, 90);
  }

  console.log(`plan: ${withBody.length} of ${Object.keys(wiki).length} wiki entries have a body`);
  console.log(`  sectorWikiBodies/${SECTOR}   ${fmt(bytes(bodiesNode))}`);
  console.log(`  sectors/${SECTOR}/wiki/*/excerpt   ${Object.keys(excerptUpdates).length} field(s) to write`);

  if (!withBody.length) {
    console.log("\nNothing to do.");
    return;
  }

  if (DRY) {
    console.log("\nDry run — nothing written. Re-run without --dry-run to copy bodies and write excerpts,");
    console.log("then deploy the new app code, confirm it works, and finally run with --cleanup to strip the old");
    console.log("`body` field out of sectors/{id}/wiki/* (that last step is what actually shrinks the live document).");
    return;
  }

  const existing = await req("GET", `sectorWikiBodies/${SECTOR}`);
  if (existing && !FORCE) {
    console.log(`\nsectorWikiBodies/${SECTOR} already has data. Nothing written (use --force to overwrite).`);
    return;
  }

  backup(raw);

  await req("PUT", `sectorWikiBodies/${SECTOR}`, bodiesNode);
  await req("PATCH", `sectors/${SECTOR}`, excerptUpdates);
  console.log("\nwritten: bodies copied, excerpts stamped onto the live entries.");

  const after = await req("GET", `sectorWikiBodies/${SECTOR}`);
  const ok = Object.keys(after || {}).length === withBody.length;
  console.log(ok
    ? "\nverified: every body reads back from its new path."
    : "\nFAIL: read-back did not match — investigate before deploying or running --cleanup.");
  if (!ok) { process.exitCode = 1; return; }

  console.log("\nOld `body` fields are still in place under sectors/" + SECTOR + "/wiki/* — the app keeps working");
  console.log("either way (the wiki codec strips `body` on write regardless). Deploy the new app code (and");
  console.log("database.rules.json), confirm it reads bodies correctly, then run:");
  console.log(`  node scripts/migrate-wiki-body-split.mjs --sector=${SECTOR} --cleanup`);
}

async function cleanup(wiki) {
  const hadBody = Object.entries(wiki).filter(([, e]) => e && typeof e.body === "string" && e.body).map(([id]) => id);
  if (!hadBody.length) {
    console.log("Nothing to clean up — sectors/" + SECTOR + "/wiki has no old `body` fields.");
    return;
  }

  // Cross-check sectorWikiBodies actually has this sector's bodies before
  // deleting the only other copy of them.
  const bodies = await req("GET", `sectorWikiBodies/${SECTOR}`);
  const missing = hadBody.filter((id) => !bodies || typeof bodies[id] !== "string");
  if (missing.length) {
    console.log(`Refusing to clean up — sectorWikiBodies/${SECTOR} is missing ${missing.length} of ${hadBody.length} bodies still in sectors/${SECTOR}/wiki.`);
    console.log("Run without --cleanup first to (re-)copy, or investigate before retrying.");
    process.exitCode = 1;
    return;
  }

  const raw = await req("GET", `sectors/${SECTOR}`);
  backup(raw);

  const updates = {};
  for (const id of hadBody) updates[`wiki/${id}/body`] = null;

  console.log(`clearing body from ${hadBody.length} wiki entr${hadBody.length === 1 ? "y" : "ies"} under sectors/${SECTOR}.`);

  await req("PATCH", `sectors/${SECTOR}`, updates);
  console.log("\ndone. sectors/" + SECTOR + "/wiki no longer carries body text.");
}

main().catch((e) => { console.error(`\nmigration failed: ${e.message}`); process.exitCode = 1; });
