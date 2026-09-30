// Reading and writing the shared sector.
//
// Under v1 the entire sector was a single JSON string at one key, so changing a
// squadron count re-uploaded every system, link and codex entry — ~33KB per
// keystroke — and two GMs editing different things clobbered each other wholesale.
// Here each entity is its own node, and a save writes only what actually changed.
//
// The app above this layer still deals in plain arrays; the array/tree translation
// (and everything RTDB mangles on the way) lives in sectorSchema.js.
import { ref, get as dbGet, onValue, update as dbUpdate, set as dbSet, query, orderByChild, equalTo } from "firebase/database";
import { db, firebaseReady, authReady } from "./firebase.js";
import {
  SCHEMA_VERSION, COLLECTIONS, V1_STATE_KEY, V1_ART_KEY, V1_ACCESS_KEY, NOTES_COLLECTION,
  ART_COLLECTION, WIKI_COLLECTION, ARCHIVE_COLLECTIONS, SNAPSHOT_COLLECTIONS, READ_COLLECTIONS,
  decodeCollection, decodeEntity, decodeV2Fleets, nestFleets, emptySector, buildSectorUpdates, buildCollectionUpdates, buildGroupUpdates,
  decodeReads, buildReadsUpdates,
} from "./sectorSchema.js";

export { emptySector };

// One Firebase project can host several independent sector maps
// (e.g. https://yoursite.com/?sector=campaign-two) without extra setup.
const params = new URLSearchParams(window.location.search);
export const SECTOR_ID = (params.get("sector") || "default").replace(/[.#$/[\]]/g, "-");

const root = () => `sectors/${SECTOR_ID}`;
// Notes live outside the sector tree entirely (see sectorSchema.js) so a
// listener at root() never has to carry them — subscribeNotes below only
// attaches once GM Tools is actually opened.
const notesRoot = () => `sectorNotes/${SECTOR_ID}`;
// Same idea for resolved history, turn snapshots and read receipts (see
// ARCHIVE_COLLECTIONS/SNAPSHOT_COLLECTIONS/READ_COLLECTIONS in sectorSchema.js)
// — each gets its own path so root()'s listener, which every viewer holds open
// for as long as the app is on screen, never has to carry them.
const archiveRoot = () => `sectorArchive/${SECTOR_ID}`;
const snapshotsRoot = () => `sectorSnapshots/${SECTOR_ID}`;
const readsRoot = () => `sectorReads/${SECTOR_ID}`;
// Ship art and the wiki index (see ART_COLLECTION/WIKI_COLLECTION in
// sectorSchema.js) — each large-ish and mostly-static compared to the map
// state that actually needs to be instant, so each gets its own path and is
// loaded/kept-fresh the same way as sectorReads below: a one-shot fetch plus
// a tiny live `updatedAt` marker, rather than riding root()'s listener and
// being re-downloaded in full on every reconnect.
const artRoot = () => `sectorArt/${SECTOR_ID}`;
const wikiRoot = () => `sectorWiki/${SECTOR_ID}`;
// A wiki page's raster image (see lib/codexImage.js) — split out from the wiki
// entity itself for the same reason, keyed by the same wiki entry id. One
// path per sector, not nested under sectors/{id}/wiki, so it never rides the
// live wiki listener that every viewer holds open.
const wikiImagesRoot = () => `sectorWikiImages/${SECTOR_ID}`;
// A wiki page's body text — same idea, same key, so an article's picture and
// its prose are fetched (and cached) independently of each other and of the
// title/excerpt that stays in the live wiki listener.
const wikiBodiesRoot = () => `sectorWikiBodies/${SECTOR_ID}`;

/* ------------------------------------------------ reading */

// v1: every collection packed into one JSON string, art and lock code in two more.
function fromV1(raw) {
  const data = emptySector();
  try {
    const d = JSON.parse(raw[V1_STATE_KEY] || "{}");
    for (const c of COLLECTIONS) if (Array.isArray(d[c])) data[c] = d[c];
  } catch (e) {
    // Unparseable blob — better an empty sector the GM can see is empty than a
    // half-read one they might save over.
    console.warn("[sector] could not parse the v1 state blob; starting empty", e);
  }
  try {
    const a = JSON.parse(raw[V1_ART_KEY] || "[]");
    if (Array.isArray(a)) data.art = a;
  } catch (e) {
    console.warn("[sector] could not parse the v1 art library; ships will draw without art", e);
  }
  // wiki rode the same COLLECTIONS loop as everything else in v1's combined
  // blob — now that it lives at its own path (see ART_COLLECTION/WIKI_COLLECTION
  // in sectorSchema.js), pull it out explicitly here so a sector migrating
  // straight from v1 still keeps its wiki. This only makes the in-memory
  // decode correct; a real v1 sector still needs scripts/migrate-art-wiki.mjs
  // (or the older v2/v3 scripts, in sequence) run to actually write data.art/
  // data.wiki into sectorArt/sectorWiki.
  try {
    const d = JSON.parse(raw[V1_STATE_KEY] || "{}");
    if (Array.isArray(d.wiki)) data.wiki = d.wiki;
  } catch (e) {
    // already warned above when the same parse failed for COLLECTIONS
  }
  data.lockCode = typeof raw[V1_ACCESS_KEY] === "string" ? raw[V1_ACCESS_KEY] : "";
  return { data, schema: 1 };
}

function readAccess(data, raw) {
  data.lockCode = (raw.access && typeof raw.access.lockCode === "string") ? raw.access.lockCode : "";
  // Fleet positions are public unless the GM has explicitly switched that off.
  data.fleetsPublic = !(raw.access && raw.access.fleetsPublic === false);
}

// The GM's turn counter, bumped by nextTurn() in App.jsx and stamped onto
// actions as they're archived so Previous Actions can show which turn a
// request was resolved on. Absent (a sector predating this, or v1) means 0 —
// campaigns start at turn 0.
function readTurn(data, raw) {
  const n = raw.turn && Number(raw.turn.number);
  data.turnNumber = Number.isFinite(n) && n >= 0 ? n : 0;
}

// Current tree shape (schema >= SCHEMA_VERSION): every collection, including
// ships, decoded generically, then regrouped onto their fleets — see
// nestFleets in sectorSchema.js.
function fromCurrent(raw) {
  const data = emptySector();
  for (const c of COLLECTIONS) data[c] = decodeCollection(c, raw[c]);
  readAccess(data, raw);
  readTurn(data, raw);
  return { data: nestFleets(data), schema: SCHEMA_VERSION };
}

// Schema 2: the per-entity tree exists, but ships were still embedded on each
// fleet — there was no separate ships collection yet. Reads fleets the old
// way instead of looking for one. Migrates to the current shape in place on
// its first save (App.jsx forces a full resave the first time it sees a
// schema below SCHEMA_VERSION, the same trick used for v1->v2 below).
function fromV2Legacy(raw) {
  const data = emptySector();
  for (const c of COLLECTIONS) {
    if (c === "fleets" || c === "ships") continue;
    data[c] = decodeCollection(c, raw[c]);
  }
  data.fleets = decodeV2Fleets(raw.fleets);
  readAccess(data, raw);
  readTurn(data, raw);
  return { data, schema: 2 };
}

// Turns a raw database snapshot into { data, schema }, preferring the current
// tree and falling back through schema 2 (ships still embedded) to the v1
// blob, so a sector nobody has migrated still opens. The schema is reported
// back so the caller can force a full resave on the sector's first write,
// migrating it in place either way.
function decode(raw) {
  if (!raw) return { data: emptySector(), schema: null };
  const schema = raw.meta && Number(raw.meta.schema);
  if (schema >= SCHEMA_VERSION) return fromCurrent(raw);
  if (schema === 2) return fromV2Legacy(raw);
  return fromV1(raw);
}

// One-shot read, still used where a single snapshot is enough.
export async function loadSector() {
  if (!firebaseReady) throw new Error("Firebase is not configured");
  const snap = await dbGet(ref(db, root()));
  return decode(snap.val());
}

// Live subscription: onData fires with { data, schema } on open and again every
// time the sector changes in the database — another GM's edit, or this browser's
// own save echoing back — so viewers see updates without reloading. Returns an
// unsubscribe function; call it to detach the listener.
export function subscribeSector(onData, onError) {
  if (!firebaseReady) {
    onError?.(new Error("Firebase is not configured"));
    return () => {};
  }
  return onValue(
    ref(db, root()),
    (snap) => onData(decode(snap.val())),
    (err) => onError?.(err),
  );
}

// Live subscription for GM Tools notes, kept separate from subscribeSector so
// a viewer who never opens that tab never fetches them. Same onData/onError
// shape as subscribeSector, but onData gets the plain decoded array directly
// (there's no schema/migration concern for a collection with no v1 history).
export function subscribeNotes(onData, onError) {
  if (!firebaseReady) {
    onError?.(new Error("Firebase is not configured"));
    return () => {};
  }
  return onValue(
    ref(db, notesRoot()),
    (snap) => onData(decodeCollection(NOTES_COLLECTION, snap.val())),
    (err) => onError?.(err),
  );
}

// One-shot read of one faction's reads slice — it doesn't need to be live (see
// READ_COLLECTIONS in sectorSchema.js): nothing in the app shows another
// editor's change to it mid-session, so a plain get() at app start is enough,
// and unlike onValue it never re-downloads on a reconnect. `factionId` is
// required: everything that consumes this (Updates badges) only ever looks at
// the current viewer's own faction, so a viewer with none — the GM, open mode,
// anonymous — never fetches this at all.
export async function loadReads(factionId) {
  if (!firebaseReady || !factionId) return decodeReads(factionId, {});
  const snap = await dbGet(ref(db, `${readsRoot()}/${factionId}`));
  return decodeReads(factionId, snap.val() || {});
}

// A tiny always-live marker at readsRoot()/{factionId}/updatedAt, bumped by
// saveReads (and seedWikiReadForFactions) on every write to that faction's
// receipts. One marker per faction, not one for the whole sector — a faction's
// tab only needs to know when *its own* slice changed, not every other
// faction's read activity, so its stale check (and the refetch it gates) never
// fires on a bump that has nothing to do with it.
export function subscribeReadsVersion(factionId, onVersion, onError) {
  if (!firebaseReady || !factionId) return () => {};
  return onValue(
    ref(db, `${readsRoot()}/${factionId}/updatedAt`),
    (snap) => onVersion(snap.val() || 0),
    (err) => onError?.(err),
  );
}

// Ship art and the wiki index: same one-shot-get-plus-version-marker shape as
// reads above. buildCollectionUpdates keys its diff as `${collection}/${id}`,
// which is exactly the sectorArt/{id}/art/{entityId} (resp. .../wiki/...)
// layout these read/write, so loadArt/loadWiki unwrap that one nesting level
// and saveArt/saveWiki can hand buildCollectionUpdates' output straight to
// dbUpdate unchanged.
export async function loadArt() {
  if (!firebaseReady) return [];
  const snap = await dbGet(ref(db, artRoot()));
  return decodeCollection(ART_COLLECTION, (snap.val() || {})[ART_COLLECTION]);
}
export function subscribeArtVersion(onVersion, onError) {
  if (!firebaseReady) {
    onError?.(new Error("Firebase is not configured"));
    return () => {};
  }
  return onValue(
    ref(db, `${artRoot()}/updatedAt`),
    (snap) => onVersion(snap.val() || 0),
    (err) => onError?.(err),
  );
}
export async function saveArt(prev, next) {
  if (!firebaseReady) return false;
  const updates = buildCollectionUpdates(ART_COLLECTION, prev, next);
  if (!Object.keys(updates).length) return false;
  updates.updatedAt = Date.now();
  await authReady;
  await dbUpdate(ref(db, artRoot()), updates);
  return true;
}

export async function loadWiki() {
  if (!firebaseReady) return [];
  const snap = await dbGet(ref(db, wikiRoot()));
  return decodeCollection(WIKI_COLLECTION, (snap.val() || {})[WIKI_COLLECTION]);
}
export function subscribeWikiVersion(onVersion, onError) {
  if (!firebaseReady) {
    onError?.(new Error("Firebase is not configured"));
    return () => {};
  }
  return onValue(
    ref(db, `${wikiRoot()}/updatedAt`),
    (snap) => onVersion(snap.val() || 0),
    (err) => onError?.(err),
  );
}
export async function saveWiki(prev, next) {
  if (!firebaseReady) return false;
  const updates = buildCollectionUpdates(WIKI_COLLECTION, prev, next);
  if (!Object.keys(updates).length) return false;
  updates.updatedAt = Date.now();
  await authReady;
  await dbUpdate(ref(db, wikiRoot()), updates);
  return true;
}

// One turn's worth of archived actions/missions — not the whole campaign's
// history. Browsing past turns (Action Archive, an agent's/fleet's Past Turns,
// GM Tools Previous Actions/Recap) pages through this one turn at a time
// instead of holding the entire archive in memory, so looking back over a long
// campaign costs only what's actually opened. Needs .indexOn: "turn" on
// sectorArchive/{id}/archivedActions and .../archivedMissions (see
// database.rules.json) for the query to be a targeted read rather than a full
// scan of the collection.
export async function loadArchiveTurn(turnNumber) {
  if (!firebaseReady) return { archivedActions: [], archivedMissions: [] };
  const [actionsSnap, missionsSnap] = await Promise.all([
    dbGet(query(ref(db, `${archiveRoot()}/archivedActions`), orderByChild("turn"), equalTo(turnNumber))),
    dbGet(query(ref(db, `${archiveRoot()}/archivedMissions`), orderByChild("turn"), equalTo(turnNumber))),
  ]);
  return {
    archivedActions: decodeCollection("archivedActions", actionsSnap.val()),
    archivedMissions: decodeCollection("archivedMissions", missionsSnap.val()),
  };
}

// One turn's frozen board snapshot — ids are deterministic (snap_turn_{N}, see
// lib/turnSnapshot.js), so this is a direct key lookup, not a query: the
// Timeline tab only ever needs the one turn a GM/player actually opens the
// board-state modal for.
export async function loadSnapshotForTurn(turnNumber) {
  if (!firebaseReady) return null;
  const id = `snap_turn_${turnNumber}`;
  const snap = await dbGet(ref(db, `${snapshotsRoot()}/turnSnapshots/${id}`));
  const v = snap.val();
  return v ? decodeEntity("turnSnapshots", { ...v, id: v.id || id }) : null;
}

// A wiki page's raster image, fetched only for the article actually on
// screen — see lib/codexImage.js and WikiView.jsx. Returns null for "no
// image", same as an absent field.
export async function loadWikiImage(wikiId) {
  if (!firebaseReady || !wikiId) return null;
  const snap = await dbGet(ref(db, `${wikiImagesRoot()}/${wikiId}`));
  const v = snap.val();
  return typeof v === "string" ? v : null;
}

// A wiki page's body text, fetched only for the article(s) actually on
// screen — see WikiView.jsx. Returns "" for "no body yet" (a brand-new draft),
// same as an absent field.
export async function loadWikiBody(wikiId) {
  if (!firebaseReady || !wikiId) return "";
  const snap = await dbGet(ref(db, `${wikiBodiesRoot()}/${wikiId}`));
  const v = snap.val();
  return typeof v === "string" ? v : "";
}

// Every wiki body at once — used only when the player/GM actually types into
// the codex search box, which needs to match against body text the live wiki
// listener no longer carries. A deliberate, occasional cost (one fetch per
// session a search is used) rather than the default one every load used to pay.
export async function loadAllWikiBodies() {
  if (!firebaseReady) return {};
  const snap = await dbGet(ref(db, wikiBodiesRoot()));
  return snap.val() || {};
}

/* ------------------------------------------------ writing */

// Returns false when there was nothing to write, so the caller can leave the
// save indicator alone rather than flashing "saved" at an idle sector.
export async function saveSector(prev, next) {
  if (!firebaseReady) return false;
  const updates = buildSectorUpdates(prev, next);
  if (!Object.keys(updates).length) return false;
  updates["meta/schema"] = SCHEMA_VERSION;
  updates["meta/updatedAt"] = Date.now();
  await authReady; // the .write rule requires auth != null
  await dbUpdate(ref(db, root()), updates);
  return true;
}

// Same shape as saveSector, for the notes collection at its own path.
export async function saveNotes(prev, next) {
  if (!firebaseReady) return false;
  const updates = buildCollectionUpdates(NOTES_COLLECTION, prev, next);
  if (!Object.keys(updates).length) return false;
  await authReady;
  await dbUpdate(ref(db, notesRoot()), updates);
  return true;
}

// Same shape as saveNotes, one per split-out group — see loadArchive/
// loadSnapshots/loadReads above. `prev`/`next` are `{ [collection]: list }`
// objects, exactly what buildGroupUpdates already expects.
export async function saveArchive(prev, next) {
  if (!firebaseReady) return false;
  const updates = buildGroupUpdates(ARCHIVE_COLLECTIONS, prev, next);
  if (!Object.keys(updates).length) return false;
  await authReady;
  await dbUpdate(ref(db, archiveRoot()), updates);
  return true;
}
export async function saveSnapshots(prev, next) {
  if (!firebaseReady) return false;
  const updates = buildGroupUpdates(SNAPSHOT_COLLECTIONS, prev, next);
  if (!Object.keys(updates).length) return false;
  await authReady;
  await dbUpdate(ref(db, snapshotsRoot()), updates);
  return true;
}
export async function saveReads(factionId, prev, next) {
  if (!firebaseReady || !factionId) return false;
  const updates = buildReadsUpdates(READ_COLLECTIONS, prev, next);
  if (!Object.keys(updates).length) return false;
  updates.updatedAt = Date.now();
  await authReady;
  await dbUpdate(ref(db, `${readsRoot()}/${factionId}`), updates);
  return true;
}

// GM-only: seed every faction's wikiReads receipt for one article at once (see
// App.jsx's publishWikiEntryQuietly, which marks a quietly-published entry
// already "seen" everywhere so it doesn't ping Updates). A direct multi-path
// write rather than the usual load-diff-save flow above — the GM's own tab
// never loads any faction's reads (it has none of its own), so there is
// nothing local to diff against; this writes the one entity straight to every
// faction's node, bumping each one's version marker so an open player tab
// picks it up the same way any other reads change would.
export async function seedWikiReadForFactions(factionIds, wikiId, seenAt) {
  if (!firebaseReady || !factionIds || !factionIds.length) return false;
  const updates = {};
  for (const fid of factionIds) {
    updates[`${fid}/wikiReads/${wikiId}`] = seenAt;
    updates[`${fid}/updatedAt`] = seenAt;
  }
  await authReady;
  await dbUpdate(ref(db, readsRoot()), updates);
  return true;
}

// Writes (or, with null, clears) one wiki page's image. A direct set() rather
// than a diffed update — there's exactly one leaf here, not a collection —
// gated the same way every other write is (auth != null; see
// database.rules.json). The UI only ever calls this from a context that
// already has edit rights to the page (WikiView's imageEditor), same trust
// model as the rest of this world-writable database.
export async function saveWikiImage(wikiId, dataUri) {
  if (!firebaseReady || !wikiId) return false;
  await authReady;
  await dbSet(ref(db, `${wikiImagesRoot()}/${wikiId}`), dataUri || null);
  return true;
}

// Same idea as saveWikiImage, for a page's body text.
export async function saveWikiBody(wikiId, text) {
  if (!firebaseReady || !wikiId) return false;
  await authReady;
  await dbSet(ref(db, `${wikiBodiesRoot()}/${wikiId}`), text || null);
  return true;
}
