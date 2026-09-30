import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, ChevronLeft, FileText, EyeOff, Users, Table, Eye, Pencil,
  Image as ImageIcon, ImagePlus, X, AlertTriangle, Inbox, CheckCircle2, Undo2, Send, Clock, Search, Globe,
  ArrowUpDown, Filter, BellOff, Copy, Check, Link2, Wand2 } from "lucide-react";
import { T, F, inputStyle, selStyle, lbl } from "../theme.js";
import { useConfirm } from "../hooks/useConfirm.jsx";
import { WIKI_CATS, DISCORD_GAME_ROLE } from "../constants.js";
import { formatHash } from "../lib/routing.js";
import { isRestricted } from "../lib/visibility.js";
import { bodyExcerpt, CSV_TEMPLATE, CSV_TEMPLATE_CAPTION } from "../lib/codexBody.js";
import { revealsExperimentalEdit } from "../lib/experimentalReveal.js";
import { processImage } from "../lib/codexImage.js";
import Btn from "./ui/Btn.jsx";
import AutoTextarea from "./ui/AutoTextarea.jsx";
import CodexBody from "./CodexBody.jsx";
import CodexDiff, { DiffLegend } from "./CodexDiff.jsx";
import VisibilityRow from "./VisibilityRow.jsx";
import MobileTabRail from "./ui/MobileTabRail.jsx";

const formatUpdatedAt = (value) => value ? new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium", timeStyle: "short",
}).format(new Date(value)) : null;

// GM Tools "haunted message" (kind: "wiki") standing in for the real article
// this specific viewer would otherwise see — subtler than the full-screen
// error prank, since the page around it looks completely normal. Clicking it
// reveals the real title/body underneath (dismissHaunt, from App.jsx's
// displayedWikiHaunt) rather than navigating anywhere.
function HauntedArticle({ haunt, onReveal }) {
  return (
    <div onClick={onReveal} title="Something's off about this — click to refocus" style={{
      cursor: "pointer", display: "flex", flexDirection: "column", gap: 10,
      border: "1px solid #5c1f1f", background: "rgba(92,31,31,.08)", padding: 16,
    }}>
      <div className="stencil" style={{ fontSize: 24, fontWeight: 800, letterSpacing: ".03em", color: "#c9504f",
        textShadow: "1px 0 #2ab6d9, -1px 0 #e63946" }}>
        {haunt.title || "Untitled"}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "#d8bcbc", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
        {haunt.message}
      </div>
      <div style={{ fontSize: 10, color: "#8a6666", letterSpacing: ".04em" }}>click to refocus</div>
    </div>
  );
}

export default function WikiView({ wiki, roles = [], factions = [], threads = [], addThread, canEdit, isMobile, viewer, activeCat, setActiveCat, selectedId, setSelectedId,
  addEntry, patchEntry, deleteEntry, submitEntry, patchOwnEntry, withdrawEntry, approveEntry,
  publishEntry, unpublishEntry, publishEntryQuietly, proposeEdit,
  loadImage, saveImage, loadBody, saveBody, loadAllBodies, haunt, dismissHaunt, globalExperimentalEditing }) {
  const confirm = useConfirm();
  const catMeta = WIKI_CATS.find((c) => c.id === activeCat) || WIKI_CATS[0];
  const catLabel = (id) => (WIKI_CATS.find((c) => c.id === id) || {}).label || id;
  // A character/location/faction entry's faction tint — a quick visual cue in
  // the list for which faction an entry belongs to, without opening it.
  const factionColor = (id) => (factions.find((f) => f.id === id) || {}).color || null;
  // A signed-in player (not the GM, not anonymous) can submit a new entry.
  const canSubmit = !!(viewer && viewer.kind === "player");
  const isMine = (e) => !!(viewer && viewer.roleId != null && e.submittedBy && e.submittedBy.roleId === viewer.roleId);
  // GM-only inbox: every submission awaiting review, across all categories,
  // instead of the active category's list. Local/unrouted, same as previewOf
  // below — it's a triage view, not a page worth bookmarking.
  const [queueMode, setQueueMode] = useState(false);
  const pendingCount = wiki.filter((e) => e.status === "pending" && e.ready).length;
  // Free-text search across the whole codex. A non-empty query overrides both
  // category browsing and the queue, listing every live entry whose title, body
  // or category matches — pending submissions aren't articles yet, so they stay
  // out of results (the GM has the Review Queue for those).
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const terms = searching ? q.split(/\s+/) : [];
  // Body text isn't in `wiki` any more (see sectorSchema.js's wiki codec) —
  // matching against it means actually having it. Rather than pay that cost on
  // every load, fetch every body exactly once, the first time this browser
  // types a search — a deliberate, occasional cost instead of the default
  // every session used to pay. Falls back to the stored excerpt for whatever
  // hasn't loaded yet (a brief window right as the fetch is in flight).
  const [allBodies, setAllBodies] = useState(null); // null = not fetched yet
  useEffect(() => {
    if (!searching || allBodies !== null) return;
    let cancelled = false;
    loadAllBodies().then((bodies) => { if (!cancelled) setAllBodies(bodies || {}); })
      .catch((e) => { console.warn("[wiki] search body load error", e); if (!cancelled) setAllBodies({}); });
    return () => { cancelled = true; };
  }, [searching, allBodies, loadAllBodies]);
  const matches = (e) => {
    const body = (allBodies && allBodies[e.id]) || e.excerpt || "";
    const hay = `${e.title || ""}\n${body}\n${catLabel(e.category)}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  };
  // How the list is ordered, and (when relevant) narrowed to one faction.
  // The faction filter resets on category/queue switches (selectCat/openQueue)
  // rather than sticking — a category without the previously-filtered faction
  // has no way to show the faction select to turn it back off otherwise.
  const [sortMode, setSortMode] = useState("updated"); // "updated" | "created" | "alpha"
  const [filterFaction, setFilterFaction] = useState(""); // "" = all factions
  function sortCmp(a, b) {
    if (sortMode === "alpha") return (a.title || "").localeCompare(b.title || "");
    if (sortMode === "created") return (b.publishedAt || b.createdAt || 0) - (a.publishedAt || a.createdAt || 0);
    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0); // "updated"
  }
  // Normal category browsing hides everyone else's pending submissions — they
  // aren't real pages yet — but still shows the viewer's own, so a player can
  // find and keep editing what they just wrote.
  const baseEntries = searching
    ? wiki.filter((e) => e.status !== "pending" && matches(e)).sort(sortCmp)
    : queueMode
      // Submissions the player has marked ready sort above ones they're still
      // drafting, so the GM sees what's actually waiting on them first; the
      // chosen sort only breaks ties within each of those two groups.
      ? wiki.filter((e) => e.status === "pending").sort((a, b) => (b.ready ? 1 : 0) - (a.ready ? 1 : 0) || sortCmp(a, b))
      : wiki.filter((e) => e.category === activeCat && (e.status !== "pending" || isMine(e))).sort(sortCmp);
  // The faction filter only offers (and only appears for) factions actually
  // present in the current list — "when available", per the ask.
  const factionIdsInView = [...new Set(baseEntries.map((e) => e.factionId).filter(Boolean))];
  const entries = filterFaction ? baseEntries.filter((e) => e.factionId === filterFaction) : baseEntries;
  const selected = wiki.find((e) => e.id === selectedId);
  // A change proposal's own diff (below) also needs the live entry it revises —
  // fetch both images together rather than only the open entry's.
  const originalId = (selected && selected.editOf) || null;
  // A live entry published through Experimental Editing keeps its pre-edit body
  // stashed at this derived id (see App.jsx's approveWikiEntry) so the
  // highlighted diff can still be rendered long after the proposal itself is
  // gone — fetched whenever the entry is under Experimental Editing at all,
  // since a viewer the GM hasn't revealed it to (see revealed below) reads
  // this old body as the article's plain content, not just the GM/revealed
  // viewer's diff.
  const testEditBeforeId = (selected && selected.testEditCanon) ? `${selected.id}__testEditBefore` : null;
  const revealed = revealsExperimentalEdit(selected, { isGM: canEdit, viewer, globalExperimentalEditing });
  // A page's raster image lives at its own database path, not on the entity —
  // see lib/codexImage.js and sectorRepo.js loadWikiImage/saveWikiImage — so
  // only whichever page(s) are actually on screen get fetched. Keyed by wiki
  // id; a key present with value `null` means "confirmed no image", distinct
  // from not yet having asked.
  const [imageCache, setImageCache] = useState({});
  useEffect(() => {
    const ids = [selectedId, originalId].filter(Boolean);
    const missing = ids.filter((id) => !(id in imageCache));
    if (!missing.length) return;
    let cancelled = false;
    // .catch(() => null): a failed fetch is cached as "no image" rather than
    // left forever missing — otherwise a network hiccup would retry every
    // render this effect re-runs, hammering the database instead of degrading
    // to "no picture shown".
    Promise.all(missing.map((id) => loadImage(id).then((img) => [id, img]).catch(() => [id, null])))
      .then((pairs) => { if (!cancelled) setImageCache((c) => ({ ...c, ...Object.fromEntries(pairs) })); });
    return () => { cancelled = true; };
  }, [selectedId, originalId, imageCache, loadImage]);
  const imageFor = (id) => (id && imageCache[id]) || null;

  // Same idea for an article's full text — see sectorSchema.js's wiki codec:
  // only `excerpt` rides the live wiki listener now. `allBodies` (from the
  // search fetch above) can already answer for an id; only ask the database
  // for whichever one(s) aren't covered by that.
  const [bodyCache, setBodyCache] = useState({});
  useEffect(() => {
    const ids = [selectedId, originalId, testEditBeforeId].filter(Boolean);
    const missing = ids.filter((id) => !(id in bodyCache) && !(allBodies && id in allBodies));
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(missing.map((id) => loadBody(id).then((text) => [id, text]).catch(() => [id, ""])))
      .then((pairs) => { if (!cancelled) setBodyCache((c) => ({ ...c, ...Object.fromEntries(pairs) })); });
    return () => { cancelled = true; };
  }, [selectedId, originalId, testEditBeforeId, bodyCache, allBodies, loadBody]);
  const bodyFor = (id) => (id ? (bodyCache[id] ?? (allBodies && allBodies[id]) ?? "") : "");

  // Debounced per-article body save — one independent timer per id (kept in a
  // ref, not React state, so navigating away from the article being edited
  // doesn't cancel its pending save; see the comment on scheduleBodySave).
  // `patch` is whichever write path the current viewer has (GM's patchEntry or
  // a player's own patchOwnEntry) — it carries the small `excerpt` field
  // through the normal sector autosave; the body itself is written directly.
  const bodySaveTimers = useRef({});
  // `patch` is optional — omitted for a body that isn't itself a wiki entity and
  // has nowhere to keep an excerpt. `entryId`/`excerptField` default to `id`/
  // "excerpt" for a normal body save, but the testEditBeforeId box below (an
  // experimental article's stashed "old text", saved at a derived id, not its
  // own entity) passes the live entry's id and "testEditBeforeExcerpt" instead,
  // so a non-revealed viewer's list/timeline preview has an old-text excerpt to
  // read alongside the old title/body — see lib/experimentalReveal.js.
  function scheduleBodySave(id, text, patch, entryId = id, excerptField = "excerpt") {
    if (bodySaveTimers.current[id]) clearTimeout(bodySaveTimers.current[id]);
    bodySaveTimers.current[id] = setTimeout(() => {
      delete bodySaveTimers.current[id];
      saveBody(id, text).catch((e) => console.warn("[wiki] body save error", e));
      if (patch) patch(entryId, { [excerptField]: bodyExcerpt(text).slice(0, 90) });
    }, 600);
  }
  function handleBodyChange(id, text, patch, entryId = id, excerptField = "excerpt") {
    setBodyCache((c) => ({ ...c, [id]: text }));
    scheduleBodySave(id, text, patch, entryId, excerptField);
  }
  // Editors see only the raw textarea, so a ```csv block is invisible while
  // writing — hence the preview toggle. It's keyed to an entry id, not a bare
  // flag, so leaving for another entry ends the preview, and a brand-new entry
  // (selected up in App, not via selectEntry) opens ready to type in, not read-only.
  const [previewOf, setPreviewOf] = useState(null);
  const preview = previewOf != null && previewOf === selectedId;
  const bodyRef = useRef(null);
  const imgRef = useRef(null);
  // Upload errors are per-entry and transient; cleared on picking a fresh file
  // and whenever the open entry changes.
  const [imgError, setImgError] = useState(null);
  // GM-only: while reviewing a proposed edit, show the highlighted diff against
  // the live entry. On by default (it's the point of the review); reset whenever
  // the open entry changes.
  const [showDiff, setShowDiff] = useState(true);
  // Transient "Copied" confirmation on the copy-for-Discord button; the id keeps
  // the tick on the entry that was actually copied, so switching entries clears it.
  const [copiedId, setCopiedId] = useState(null);
  // Same, for the separate "copy link" button used when an article's too long
  // to paste into Discord directly.
  const [copiedLinkId, setCopiedLinkId] = useState(null);
  // setActiveCat clears the open entry itself (see App.jsx) — clearing it here
  // too would be a second URL change, i.e. two Back presses for one click.
  const selectCat = (id) => { setQueueMode(false); setQuery(""); setFilterFaction(""); setActiveCat(id); };
  const openQueue = () => { setQueueMode(true); setQuery(""); setFilterFaction(""); setSelectedId(null); };
  const selectEntry = (id) => { setPreviewOf(null); setImgError(null); setShowDiff(true); setCopiedId(null); setCopiedLinkId(null); setSelectedId(id); };
  // Typing a query leaves the queue (results are live articles, not submissions).
  const onSearch = (v) => { setQuery(v); if (v) setQueueMode(false); };

  // Downscale/re-encode a picked raster file and store the resulting data URI
  // at its own path (see loadImage/saveImage — lib/codexImage.js has the full
  // story on why it doesn't ride the entity itself). Rejects (with a message)
  // rather than pushing an oversized image.
  async function onPickImage(entry, e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // let the same file be re-picked after an error
    if (!file) return;
    setImgError(null);
    const res = await processImage(file);
    if (res.error) { setImgError(res.error); return; }
    const previous = imageFor(entry.id);
    setImageCache((c) => ({ ...c, [entry.id]: res.dataUri }));
    try {
      await saveImage(entry.id, res.dataUri);
    } catch (err) {
      console.warn("[wiki] image save error", err);
      setImgError("could not save that image — try again");
      setImageCache((c) => ({ ...c, [entry.id]: previous }));
    }
  }

  // Drops a starter CSV block in at the caret. Only reachable while the textarea
  // is on screen (the button hides in preview), so bodyRef is live here.
  function insertTable(entry, patch) {
    const el = bodyRef.current;
    const body = bodyFor(entry.id);
    const at = el ? el.selectionStart : body.length;
    const before = body.slice(0, at);
    const after = body.slice(at);
    // A fence only opens at the start of its own line, and wants a blank line
    // between it and any prose either side.
    const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const tail = after === "" ? "\n" : after.startsWith("\n") ? "\n" : "\n\n";
    handleBodyChange(entry.id, before + lead + CSV_TEMPLATE + tail + after, patch);
    // Select the placeholder caption so the writer just types over it.
    const start = before.length + lead.length + CSV_TEMPLATE.indexOf(CSV_TEMPLATE_CAPTION);
    requestAnimationFrame(() => {
      if (!bodyRef.current) return;
      bodyRef.current.focus();
      bodyRef.current.setSelectionRange(start, start + CSV_TEMPLATE_CAPTION.length);
    });
  }

  // Copy a Discord-ready version of an entry to the clipboard: the game's role
  // ping, then the title in bold, then the body — each separated by a blank line
  // so it pastes into Discord already formatted for an announcement.
  async function copyForDiscord(entry) {
    const text = `${DISCORD_GAME_ROLE}\n\n**${(entry.title || "Untitled").trim()}**\n\n${bodyFor(entry.id).trim()}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 1600);
    } catch (e) { /* clipboard unavailable */ }
  }

  // Copy a short Discord post that just points at the codex page, for entries
  // whose body is too long to paste directly.
  async function copyForDiscordLink(entry) {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}`
      + formatHash({ tab: "codex", cat: entry.category, wikiId: entry.id });
    const text = `${DISCORD_GAME_ROLE}\n**${(entry.title || "Untitled").trim()}**\nToo long to publish on discord\n${url}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLinkId(entry.id);
      setTimeout(() => setCopiedLinkId((id) => (id === entry.id ? null : id)), 1600);
    } catch (e) { /* clipboard unavailable */ }
  }

  // A codex image is always a raster data URI shown through <img> — never inline
  // markup — see the security note in lib/codexImage.js.
  const imageFrame = (src, maxHeight, alt) => (
    <div style={{ border: `1px solid ${T.line}`, background: T.panel3, padding: 6,
      alignSelf: "flex-start", maxWidth: "100%", borderRadius: 2, flexShrink: 0 }}>
      <img src={src} alt={alt || ""} style={{ display: "block", maxWidth: "100%", maxHeight }} />
    </div>
  );

  // Image control: preview + add/replace/remove. Hidden entirely from
  // read-only viewers — they see the picture (via imageFrame) only when one
  // is present.
  const imageEditor = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 6 }}>
        <ImageIcon size={12} /> Image
        <span style={{ marginLeft: "auto", color: imageFor(selected.id) ? T.accent : T.faint,
          textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
          {imageFor(selected.id) ? "Shown on this page" : "None"}
        </span>
      </div>
      {imageFor(selected.id) && imageFrame(imageFor(selected.id), 260)}
      <input ref={imgRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => onPickImage(selected, e)} style={{ display: "none" }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Btn onClick={() => imgRef.current && imgRef.current.click()}
          title={imageFor(selected.id) ? "Choose a different picture" : "Upload a picture for this page"}>
          <ImagePlus size={13} /> {imageFor(selected.id) ? "Replace image" : "Add image"}
        </Btn>
        {imageFor(selected.id) && (
          <Btn kind="danger" onClick={() => {
            setImageCache((c) => ({ ...c, [selected.id]: null }));
            saveImage(selected.id, null).catch((err) => console.warn("[wiki] image remove error", err));
          }} title="Remove this page's image">
            <X size={13} /> Remove
          </Btn>
        )}
      </div>
      {imgError && (
        <div style={{ fontSize: 10, color: T.dangerText, display: "flex", alignItems: "center", gap: 5, lineHeight: 1.5 }}>
          <AlertTriangle size={11} style={{ flexShrink: 0 }} /> {imgError}
        </div>
      )}
      <div style={{ ...lbl, fontSize: 9, color: T.faint, textTransform: "none", letterSpacing: 0, lineHeight: 1.5 }}>
        Players see this picture on the page only when one is set. Large images are resized automatically.
      </div>
    </div>
  );

  // NOTE: these are plain functions returning JSX (called, not mounted as <Components>),
  // so editing inputs/textarea don't lose focus on each keystroke from a remount.
  const searchBar = () => (
    <div style={{ padding: 8, borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <Search size={14} style={{ position: "absolute", left: 9, color: searching ? T.accent : T.faint, pointerEvents: "none" }} />
        <input value={query} onChange={(e) => onSearch(e.target.value)} placeholder="Search the codex…"
          style={{ ...inputStyle, padding: "7px 30px" }} />
        {query && (
          <button onClick={() => onSearch("")} title="Clear search"
            style={{ position: "absolute", right: 5, display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none", color: T.faint, cursor: "pointer", padding: 4 }}>
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );

  const categoryRail = (vertical) => (
    <div className={vertical ? "" : "scroll"} style={{ display: "flex", flexDirection: vertical ? "column" : "row",
      gap: 4, padding: vertical ? "10px 8px" : "8px", overflowX: vertical ? "visible" : "auto",
      borderBottom: vertical ? `1px solid ${T.line}` : `2px solid ${T.line}`, flexShrink: 0 }}>
      {canEdit && (
        <button onClick={openQueue} title="Entries submitted by players, awaiting your approval"
          style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", whiteSpace: "nowrap",
            border: `1px solid ${queueMode ? T.amber : T.line}`, borderRadius: 2, padding: "7px 10px",
            background: queueMode ? "rgba(217,143,43,.14)" : T.panel2, color: queueMode ? T.amber : T.text,
            fontFamily: F.body, fontSize: 12.5, fontWeight: 600, letterSpacing: ".03em",
            textTransform: "uppercase", justifyContent: vertical ? "flex-start" : "center", flex: vertical ? "none" : "0 0 auto" }}>
          <Inbox size={15} /> <span style={{ flex: 1, textAlign: "left" }}>Review Queue</span>
          {pendingCount > 0 && (
            <span className="mono" style={{ fontSize: 10, color: T.amber, fontWeight: 700 }}>{pendingCount}</span>
          )}
        </button>
      )}
      {WIKI_CATS.map((cat) => {
        const Ic = cat.icon; const count = wiki.filter((e) => e.category === cat.id && e.status !== "pending").length;
        const on = !queueMode && !searching && cat.id === activeCat;
        return (
          <button key={cat.id} onClick={() => selectCat(cat.id)} title={cat.label}
            style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", whiteSpace: "nowrap",
              border: `1px solid ${on ? T.accent : T.line}`, borderRadius: 2, padding: "7px 10px",
              background: on ? "rgba(159,194,58,.14)" : T.panel2, color: on ? T.accent : T.text,
              fontFamily: F.body, fontSize: 12.5, fontWeight: 600, letterSpacing: ".03em",
              textTransform: "uppercase", justifyContent: vertical ? "flex-start" : "center", flex: vertical ? "none" : "0 0 auto" }}>
            <Ic size={15} /> <span style={{ flex: 1, textAlign: "left" }}>{cat.label}</span>
            <span className="mono" style={{ fontSize: 10, color: on ? T.accent : T.faint }}>{count}</span>
          </button>
        );
      })}
    </div>
  );

  const sortFilterBar = () => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", flex: "1 1 130px", minWidth: 130 }}>
        <ArrowUpDown size={12} style={{ position: "absolute", left: 7, color: T.faint, pointerEvents: "none" }} />
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} title="Sort order"
          style={{ ...selStyle, paddingLeft: 24, fontSize: 11 }}>
          <option value="updated">Recently updated</option>
          <option value="created">Recently created</option>
          <option value="alpha">A–Z</option>
        </select>
      </div>
      {factionIdsInView.length > 0 && (
        <div style={{ position: "relative", display: "flex", alignItems: "center", flex: "1 1 130px", minWidth: 130 }}>
          <Filter size={12} style={{ position: "absolute", left: 7, color: filterFaction ? T.accent : T.faint, pointerEvents: "none" }} />
          <select value={filterFaction} onChange={(e) => setFilterFaction(e.target.value)} title="Filter by faction"
            style={{ ...selStyle, paddingLeft: 24, fontSize: 11,
              color: filterFaction ? (factionColor(filterFaction) || T.text) : T.text,
              borderColor: filterFaction ? (factionColor(filterFaction) || T.line) : T.line }}>
            <option value="">All factions</option>
            {factions.filter((f) => factionIdsInView.includes(f.id)).map((f) => (
              <option key={f.id} value={f.id} style={{ color: f.color }}>{f.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );

  const entryList = () => (
    <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10,
      display: "flex", flexDirection: "column", gap: 6 }}>
      {sortFilterBar()}
      {canEdit && !queueMode && !searching && (
        <Btn kind="primary" onClick={() => addEntry(activeCat)} style={{ justifyContent: "center" }}>
          <Plus size={14} /> New {catMeta.label} entry
        </Btn>
      )}
      {canSubmit && !queueMode && !searching && (
        <Btn kind="primary" onClick={() => submitEntry(activeCat)} style={{ justifyContent: "center" }}>
          <Plus size={14} /> Draft new {catMeta.label.toLowerCase()} entry
        </Btn>
      )}
      {searching && entries.length > 0 && (
        <div style={{ ...lbl, color: T.faint, padding: "0 2px 2px" }}>
          {entries.length} result{entries.length === 1 ? "" : "s"}
        </div>
      )}
      {entries.length === 0 && (
        <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
          border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
          {searching
            ? `No entries match “${query.trim()}”.`
            : filterFaction && baseEntries.length > 0
              ? "No entries for this faction."
              : queueMode
                ? "Nothing waiting for review."
                : `No ${catMeta.label.toLowerCase()} entries yet.${canEdit ? " Add one below." : canSubmit ? " Draft one below." : ""}`}
        </div>
      )}
      {entries.map((e) => {
        const on = e.id === selectedId;
        // A GM draft — only the GM ever has one in their list (players never
        // receive drafts in `wiki`) — shows a "Draft" badge and hides the
        // restricted badge, which is moot while nobody but the GM can see it.
        const draft = canEdit && e.status === "draft";
        const restricted = canEdit && !draft && roles.length > 0 && isRestricted(e);
        const gmOnly = restricted && e.visibility.length === 0;
        const pending = e.status === "pending";
        const isEditProp = pending && !!e.editOf;
        const ready = pending && !!e.ready; // player has flagged it done
        const who = e.submittedBy && e.submittedBy.roleName;
        const fc = e.factionId ? factionColor(e.factionId) : null;
        // A card for an entry currently under Experimental Editing shows its old
        // (pre-edit) title/excerpt to anyone not revealed — same rule as the
        // article page itself; see lib/experimentalReveal.js.
        const revealed = revealsExperimentalEdit(e, { isGM: canEdit, viewer, globalExperimentalEditing });
        const cardTitle = revealed ? e.title : (e.testEditBeforeTitle || e.title);
        const cardExcerpt = revealed ? e.excerpt : (e.testEditBeforeExcerpt || e.excerpt);
        return (
          <button key={e.id} onClick={() => selectEntry(e.id)}
            style={{ textAlign: "left", cursor: "pointer", background: on ? "rgba(159,194,58,.1)" : fc ? `${fc}1f` : T.panel2,
              border: `1px solid ${on ? T.accent : fc || T.line}`, borderRadius: 2, padding: "8px 10px", color: T.text,
              fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="stencil" style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, letterSpacing: ".03em",
                color: on ? T.accent : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {cardTitle || "Untitled"}
              </span>
              {pending && (
                <span title={`${isEditProp ? "Proposed edit" : "New entry"} · ${ready ? "Ready for review" : "Draft — still being written"}${who ? ` · ${who}` : ""}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0,
                    color: ready ? T.amber : T.faint, border: `1px solid ${ready ? T.amber : T.line}`,
                    borderRadius: 2, padding: "1px 4px", fontSize: 8.5, letterSpacing: ".08em", textTransform: "uppercase" }}>
                  {ready ? <Send size={9} /> : <Pencil size={9} />}
                  {queueMode ? (who || (ready ? "Ready" : "Draft")) : (ready ? "Submitted" : "Draft")}
                </span>
              )}
              {canEdit && pending && e.testEdited && (
                <span title="Player used Experimental Editing on this" style={{ display: "inline-flex", color: T.accent, flexShrink: 0 }}>
                  <Wand2 size={11} />
                </span>
              )}
              {draft && (
                <span title="Draft — not published; only you can see this"
                  style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0, color: T.faint,
                    border: `1px solid ${T.line}`, borderRadius: 2, padding: "1px 4px", fontSize: 8.5,
                    letterSpacing: ".08em", textTransform: "uppercase" }}>
                  <EyeOff size={9} /> Draft
                </span>
              )}
              {restricted && !pending && (
                <span title={gmOnly ? "GM only" : "Restricted to some players"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0, color: gmOnly ? T.amber : T.mut,
                    border: `1px solid ${gmOnly ? T.amber : T.line}`, borderRadius: 2, padding: "1px 4px", fontSize: 8.5,
                    letterSpacing: ".08em", textTransform: "uppercase" }}>
                  {gmOnly ? <EyeOff size={9} /> : <Users size={9} />}{gmOnly ? "GM" : e.visibility.length}
                </span>
              )}
            </span>
            <span style={{ fontSize: 10.5, color: T.faint, lineHeight: 1.4, overflow: "hidden",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {cardExcerpt || "—"}
            </span>
            {/* Results span every category, so tag each with the one it lives in. */}
            {searching && (
              <span style={{ ...lbl, fontSize: 8.5, color: T.faint }}>{catLabel(e.category)}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  const detail = (onBack) => {
    if (!selected) {
      return (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 12, color: T.faint, padding: 24, textAlign: "center" }}>
          <FileText size={40} strokeWidth={1.2} />
          <div className="stencil" style={{ fontSize: 15, letterSpacing: ".06em", color: T.mut }}>NO ENTRY SELECTED</div>
          <div style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 300 }}>
            Pick an entry from the list to read it{canEdit ? ", or create a new one." : canSubmit ? ", or draft a new one." : "."}
          </div>
        </div>
      );
    }
    const catOf = WIKI_CATS.find((c) => c.id === selected.category) || catMeta;
    const CatIc = catOf.icon;
    const pending = selected.status === "pending";
    // A GM-authored page still held back from players (see App.addWikiEntry).
    const draft = canEdit && selected.status === "draft";
    // A player only ever gets the edit form back for their own not-yet-reviewed
    // submission — canSeeSubmission upstream already keeps anyone else's pending
    // entries out of `wiki`, so this can't fire for someone else's.
    const own = !canEdit && pending && isMine(selected);
    // Has the player flagged this submission as done? Purely a signal to the GM —
    // it never changes who can see the entry, only what the badge/banner say.
    const ready = pending && !!selected.ready;
    // A change proposal points back (via `editOf`) at the live entry it revises;
    // `original` is that entry (null if it's since been deleted).
    const isEditProposal = !!selected.editOf;
    const original = isEditProposal ? wiki.find((e) => e.id === selected.editOf) : null;
    // On a live entry, a player's own already-submitted proposal for it (if any),
    // so we offer "open it" rather than a second "propose an edit".
    // Whether this viewer is allowed to see the highlighted change on a page
    // published through Experimental Editing — the same role list the GM uses
    // to reveal the button itself (see the "Experimental Editing revealed to"
    // row), or every viewer at once if the GM's global toggle is on. Everyone
    // else reads the old (pre-edit) text, same as any normal article — see
    // `revealed` above and lib/experimentalReveal.js.
    const canSeeHighlight = revealed;
    const myPendingEdit = canSubmit && !pending
      ? wiki.find((e) => e.status === "pending" && e.editOf === selected.id && isMine(e))
      : null;
    // Shared field markup for the GM's edit form and a player's own-submission
    // form — only which `patch` function actually writes differs between them.
    const editForm = (patch) => (
      <>
        <input value={selected.title} onChange={(e) => patch(selected.id, { title: e.target.value })}
          placeholder="Entry title"
          style={{ ...inputStyle, fontSize: 18, fontFamily: F.display,
            fontWeight: 700, letterSpacing: ".04em", padding: "8px 10px" }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={lbl}>Category</span>
          <select value={selected.category} onChange={(e) => patch(selected.id, { category: e.target.value })}
            style={{ ...selStyle, width: "auto", minWidth: 130 }}>
            {WIKI_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        {selected.category === "news" && (canEdit || (selected.threadIds || []).length > 0) && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={lbl}>Threads</span>
            {(canEdit ? threads : threads.filter((t) => (selected.threadIds || []).includes(t.id))).map((t) => {
              const ids = selected.threadIds || [];
              const on = ids.includes(t.id);
              return (
                <button key={t.id} type="button" disabled={!canEdit}
                  onClick={() => patch(selected.id, { threadIds: on ? ids.filter((x) => x !== t.id) : [...ids, t.id] })}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: canEdit ? "pointer" : "default",
                    border: `1px solid ${on ? t.color : T.line}`, borderRadius: 2, padding: "3px 8px",
                    background: on ? `${t.color}33` : T.panel2, color: on ? t.color : T.mut,
                    fontFamily: F.body, fontSize: 11, fontWeight: 600 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.color }} />
                  {t.name || "Untitled thread"}
                </button>
              );
            })}
            {canEdit && addThread && (
              <input placeholder="+ New thread (Enter)" style={{ ...inputStyle, width: 150 }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || !e.currentTarget.value.trim()) return;
                  const id = addThread(e.currentTarget.value);
                  if (id) patch(selected.id, { threadIds: [...(selected.threadIds || []), id] });
                  e.currentTarget.value = "";
                }} />
            )}
          </div>
        )}
        {(selected.category === "characters" || selected.category === "locations") && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={lbl}>Faction</span>
            <select value={selected.factionId || ""} onChange={(e) => patch(selected.id, { factionId: e.target.value || null })}
              style={{ ...selStyle, width: "auto", minWidth: 130 }}>
              <option value="">— Unassigned —</option>
              {factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}
        {/* GM-only: fake the same highlighted-change publishing a player's
            Experimental Editing produces, on any entry the GM is writing
            directly — no proposal/approval needed. Turning it on seeds "Old
            text" with a copy of whatever's live right now, so the GM starts
            from two identical boxes and edits either side from there. */}
        {!pending && (
          <div>
            <Btn active={!!selected.testEditCanon} onClick={() => {
              const on = !selected.testEditCanon;
              patch(selected.id, { testEditCanon: on, ...(on ? { testEditBeforeExcerpt: selected.excerpt } : {}) });
              if (on) {
                const beforeId = `${selected.id}__testEditBefore`;
                const current = bodyFor(selected.id);
                setBodyCache((c) => ({ ...c, [beforeId]: current }));
                saveBody(beforeId, current).catch((err) => console.warn("[wiki] could not seed the old text", err));
              }
            }} title={selected.testEditCanon
              ? "Publish this entry as plain text again"
              : "Publish this entry as a highlighted change (green/red) — write the old and new text yourself"}>
              <Wand2 size={13} /> Experimental Editing
            </Btn>
          </div>
        )}
        {selected.testEditCanon ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={lbl}>New text</span>
              <AutoTextarea ref={bodyRef} value={bodyFor(selected.id)} onChange={(e) => handleBodyChange(selected.id, e.target.value, patch)}
                placeholder="The text as it reads once published"
                style={{ ...inputStyle, minHeight: isMobile ? 160 : 240, resize: "vertical", lineHeight: 1.6,
                  fontFamily: F.mono, fontSize: 12.5, padding: 12 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={lbl}>Old text</span>
              <AutoTextarea value={bodyFor(testEditBeforeId)}
                onChange={(e) => handleBodyChange(testEditBeforeId, e.target.value, patch, selected.id, "testEditBeforeExcerpt")}
                placeholder="The text this replaced — shown struck through in red"
                style={{ ...inputStyle, minHeight: isMobile ? 160 : 240, resize: "vertical", lineHeight: 1.6,
                  fontFamily: F.mono, fontSize: 12.5, padding: 12 }} />
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ ...lbl, flex: 1 }}>Body</span>
              {!preview && (
                <Btn onClick={() => insertTable(selected, patch)} title="Insert a CSV table block at the cursor">
                  <Table size={13} /> Insert table
                </Btn>
              )}
              <Btn onClick={() => setPreviewOf(preview ? null : selected.id)} title={preview ? "Back to editing" : "See how this entry reads"}>
                {preview ? <><Pencil size={13} /> Edit</> : <><Eye size={13} /> Preview</>}
              </Btn>
            </div>
            {preview ? (
              <div style={{ minHeight: isMobile ? 220 : 340, border: `1px dashed ${T.line}`, borderRadius: 2, padding: 12,
                display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
                {imageFor(selected.id) && imageFrame(imageFor(selected.id), isMobile ? 320 : 480, selected.title)}
                <CodexBody body={bodyFor(selected.id)} isMobile={isMobile} />
              </div>
            ) : (
              <AutoTextarea ref={bodyRef} value={bodyFor(selected.id)} onChange={(e) => handleBodyChange(selected.id, e.target.value, patch)}
                placeholder="Write anything here — lore, notes, stats, rules…"
                style={{ ...inputStyle, minHeight: isMobile ? 220 : 340, resize: "vertical", lineHeight: 1.6,
                  fontFamily: F.mono, fontSize: 12.5, padding: 12 }} />
            )}
          </>
        )}
        {!preview && imageEditor()}
      </>
    );
    return (
      <div className="scroll" style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto", padding: isMobile ? 14 : 22,
        display: "flex", flexDirection: "column", gap: 12 }}>
        {onBack && (
          <button onClick={onBack} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 5,
            background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 2, color: T.text, cursor: "pointer",
            padding: "6px 10px", fontFamily: F.body, fontSize: 12, textTransform: "uppercase" }}>
            <ChevronLeft size={15} /> Back
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: catMeta ? T.accent : T.mut }}>
          <CatIc size={16} style={{ color: T.accent }} />
          <span style={{ ...lbl, color: T.faint }}>{catOf.label}</span>
        </div>
        {pending && (() => {
          const who = (selected.submittedBy && selected.submittedBy.roleName) || "a player";
          const origTitle = (original && original.title) || "a deleted entry";
          const editRef = isEditProposal ? `Proposed edit to "${origTitle}" by ${who}` : `Submitted by ${who}`;
          const msg = canEdit
            ? (ready
                ? `${editRef} — ready for your review.${isEditProposal ? " Approving replaces the live entry." : ""}`
                : (isEditProposal
                    ? `Proposed edit to "${origTitle}" by ${who} — still a draft; ${who} hasn't submitted it for review yet.`
                    : `Draft by ${who} — still being written; not submitted for review yet.`))
            : (ready
                ? "Submitted for review — the GM has been notified. You can still edit, or unsubmit to keep working."
                : (isEditProposal
                    ? "Draft edit — the live entry is unchanged. Submit it when you're ready for the GM to review."
                    : "Draft — only you and the GM can see this. Submit it when you're ready for the GM to review."));
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11,
              color: ready ? T.amber : T.mut, border: `1px solid ${ready ? T.amber : T.line}`, borderRadius: 2,
              padding: "6px 10px", background: ready ? "rgba(217,143,43,.1)" : "rgba(107,98,80,.08)" }}>
              {ready ? <Send size={13} style={{ flexShrink: 0 }} /> : <Pencil size={13} style={{ flexShrink: 0 }} />}
              {msg}
            </div>
          );
        })()}
        {/* GM-only: the player used Experimental Editing on this proposal — a persistent
            flag (survives even after they close it again), not a one-off toast,
            so it's still visible whenever the GM gets around to reviewing this. */}
        {canEdit && pending && isEditProposal && selected.testEdited && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: T.mut }}>
            <Wand2 size={12} style={{ flexShrink: 0 }} />
            {(selected.submittedBy && selected.submittedBy.roleName) || "This player"} used Experimental Editing on this proposal
            {formatUpdatedAt(selected.testEditedAt) ? ` (${formatUpdatedAt(selected.testEditedAt)}).` : "."}
          </div>
        )}
        {draft && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.mut,
            border: `1px solid ${T.line}`, borderRadius: 2, padding: "6px 10px", background: "rgba(107,98,80,.08)" }}>
            <EyeOff size={13} style={{ flexShrink: 0 }} />
            Draft — only you can see this. Players won't see it, or get an Updates notification, until you publish.
          </div>
        )}
        {canEdit ? (
          <>
            {/* Always visible in edit mode, unlike the pending banner above
                (which only covers submissions/proposals awaiting review) — a
                page with no submittedBy was written by the GM directly. */}
            <div style={{ fontSize: 10.5, color: T.faint, fontStyle: "italic" }}>
              Author: {selected.submittedBy ? (selected.submittedBy.roleName || "a player") : "GM"}
            </div>
            {editForm(patchEntry)}
            {/* Visibility lives on the live entry, not the proposal — approving a
                change never rewrites it, so editing it here would be a no-op. */}
            {!isEditProposal && (
              <VisibilityRow roles={roles} value={selected.visibility}
                onChange={(v) => patchEntry(selected.id, { visibility: v })} />
            )}
            {/* Which players (if any) see the Experimental Editing button when they propose
                a change to this entry — off (nobody) until the GM opts specific
                roles in, same idea as visibility but a separate switch: a player
                can be able to read a page without being able to test-edit it.
                The GM's global toggle (GM Tools' haunt pane) overrides this list
                for everyone without changing it, so it's called out separately
                rather than folded into the role count below. */}
            {!isEditProposal && roles.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 6 }}>
                  <Wand2 size={12} /> Experimental Editing revealed to
                  <span style={{ marginLeft: "auto", color: (selected.testEditRoles || []).length ? T.accent : T.faint,
                    textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
                    {(selected.testEditRoles || []).length
                      ? `${selected.testEditRoles.length} role${selected.testEditRoles.length === 1 ? "" : "s"}`
                      : "Nobody"}
                  </span>
                </div>
                {globalExperimentalEditing && (
                  <div style={{ fontSize: 10.5, color: T.accent }}>
                    GM Tools' global toggle is on — every player sees it here regardless of this list.
                  </div>
                )}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {roles.map((r) => {
                    const on = (selected.testEditRoles || []).includes(r.id);
                    return (
                      <button key={r.id} type="button" title={`${on ? "Stop revealing" : "Reveal"} Experimental Editing to ${r.name || "this player"}`}
                        onClick={() => {
                          const cur = selected.testEditRoles || [];
                          patchEntry(selected.id, { testEditRoles: on ? cur.filter((x) => x !== r.id) : [...cur, r.id] });
                        }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", whiteSpace: "nowrap",
                          border: `1px solid ${on ? (r.color || T.accent) : T.line}`, borderRadius: 2, padding: "4px 8px",
                          background: on ? `${r.color || T.accent}26` : T.panel2, color: on ? (r.color || T.accent) : T.mut,
                          fontFamily: F.body, fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase" }}>
                        {r.name || "Unnamed"}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {isEditProposal && original && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, border: `1px solid ${T.line}`,
                borderRadius: 2, padding: 12, background: T.panel2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ ...lbl, color: T.faint }}>Changes vs. live entry</span>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                    {showDiff && <DiffLegend />}
                    <Btn onClick={() => setShowDiff((s) => !s)} title={showDiff ? "Hide the change highlights" : "Show what changed"}>
                      {showDiff ? <><EyeOff size={13} /> Hide</> : <><Eye size={13} /> Show changes</>}
                    </Btn>
                  </div>
                </div>
                {showDiff && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {selected.title !== original.title && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ ...lbl, color: T.faint }}>Title</span>
                        <CodexDiff before={original.title} after={selected.title} />
                      </div>
                    )}
                    {selected.category !== original.category && (
                      <div style={{ fontSize: 11, color: T.mut }}>
                        Category:{" "}
                        <span style={{ color: T.dangerText, textDecoration: "line-through" }}>{catLabel(original.category)}</span>
                        {" → "}
                        <span style={{ color: T.accent }}>{catLabel(selected.category)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ ...lbl, color: T.faint }}>Body</span>
                      <CodexDiff before={bodyFor(original.id)} after={bodyFor(selected.id)} />
                    </div>
                    {(imageFor(original.id) || "") !== (imageFor(selected.id) || "") && (
                      <div style={{ fontSize: 11, color: T.mut }}>
                        {!imageFor(original.id) ? <span style={{ color: T.accent }}>Image added.</span>
                          : !imageFor(selected.id) ? <span style={{ color: T.dangerText }}>Image removed.</span>
                          : "Image replaced."}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {pending && (
                <Btn kind="primary" onClick={async () => {
                  // Approving a change proposal overwrites the live entry's
                  // image/body at editOf (and its __testEditBefore) once the
                  // writes land — but this session may already have those ids
                  // cached (e.g. from the diff shown above), and the cache never
                  // re-fetches an id it already has an answer for. Drop them so
                  // the next render pulls the freshly-approved text instead of
                  // what was live a moment ago.
                  const targetId = selected.editOf;
                  await approveEntry(selected.id);
                  if (targetId) {
                    const beforeId = `${targetId}__testEditBefore`;
                    setBodyCache((c) => { const { [targetId]: _a, [beforeId]: _b, ...rest } = c; return rest; });
                    setImageCache((c) => { const { [targetId]: _a, ...rest } = c; return rest; });
                  }
                }}>
                  <CheckCircle2 size={14} /> {isEditProposal ? "Approve & apply" : "Approve & publish"}
                </Btn>
              )}
              {draft && (
                <>
                  <Btn kind="primary" onClick={() => publishEntry(selected.id)}
                    title="Make this entry visible to players and announce it in their Updates">
                    <Globe size={14} /> Publish
                  </Btn>
                  <Btn onClick={() => publishEntryQuietly(selected.id)}
                    title="Make this entry visible to players, but skip the Updates notification">
                    <BellOff size={14} /> Publish quietly
                  </Btn>
                </>
              )}
              {!pending && !draft && (
                <>
                  <Btn onClick={() => unpublishEntry(selected.id)}
                    title="Hide this entry from players again while you rework it — publishing re-announces it">
                    <EyeOff size={14} /> Unpublish
                  </Btn>
                  <Btn onClick={() => publishEntryQuietly(selected.id)}
                    title="Settle any edits you've just made without pinging players' Updates feed">
                    <BellOff size={14} /> Save quietly
                  </Btn>
                </>
              )}
              {!pending && (
                <>
                  <Btn onClick={() => copyForDiscord(selected)}
                    title="Copy a Discord-ready announcement — role ping, bold title, then the body — to your clipboard">
                    {copiedId === selected.id
                      ? <><Check size={14} /> Copied</>
                      : <><Copy size={14} /> Copy for Discord</>}
                  </Btn>
                  <Btn onClick={() => copyForDiscordLink(selected)}
                    title="Copy a short Discord post — role ping, bold title, and a link to this codex page — for entries too long to paste directly">
                    {copiedLinkId === selected.id
                      ? <><Check size={14} /> Copied</>
                      : <><Link2 size={14} /> Copy link for Discord</>}
                  </Btn>
                </>
              )}
              <Btn kind="danger"
                onClick={async () => {
                  const msg = pending
                    ? (isEditProposal ? "Discard this proposed edit?" : "Reject and delete this submission?")
                    : "Delete this entry? This cannot be undone.";
                  if (await confirm(msg)) deleteEntry(selected.id);
                }}>
                <Trash2 size={14} /> {pending ? (isEditProposal ? "Reject (discard)" : "Reject (delete)") : "Delete entry"}
              </Btn>
            </div>
          </>
        ) : own ? (
          <>
            {editForm(patchOwnEntry)}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {/* A player's own proposed edit: if the GM has revealed Experimental Editing
                  for the entry it revises, this flags the proposal for it — once
                  approved, the live article shows the change highlighted (green
                  added / red removed) as its actual published content instead of
                  plain merged text, so everyone can see it was published that way.
                  No preview here; the highlighting only ever appears on the real,
                  published page. The GM's global toggle (GM Tools' haunt pane)
                  reveals it for every player on every entry, same as it does
                  for the highlight above, regardless of this entry's own
                  testEditRoles. */}
              {isEditProposal && original && (globalExperimentalEditing
                || (original.testEditRoles || []).includes(viewer && viewer.roleId)) && (
                <Btn active={!!selected.testEdited} onClick={() => patchOwnEntry(selected.id,
                  { testEdited: !selected.testEdited, testEditedAt: Date.now() })}
                  title={selected.testEdited
                    ? "On — once approved, this article will publish with the change highlighted, not plain text"
                    : "Publish this change highlighted (green/red) as part of the live article, instead of plain merged text"}>
                  <Wand2 size={14} /> Experimental Editing
                </Btn>
              )}
              {ready ? (
                <Btn onClick={() => patchOwnEntry(selected.id, { ready: false })}
                  title="Take this back to a draft so you can keep working — the GM sees it's no longer ready">
                  <Undo2 size={14} /> Unsubmit
                </Btn>
              ) : (
                <Btn kind="primary" onClick={() => patchOwnEntry(selected.id, { ready: true })}
                  title="Tell the GM you're done and this is ready to review">
                  <Send size={14} /> Submit for review
                </Btn>
              )}
              <Btn kind="danger"
                onClick={async () => {
                  const msg = isEditProposal ? "Discard these proposed changes?" : "Withdraw this submission?";
                  if (await confirm(msg)) withdrawEntry(selected.id);
                }}>
                <Trash2 size={14} /> {isEditProposal ? "Discard proposed changes" : "Withdraw submission"}
              </Btn>
            </div>
          </>
        ) : haunt && haunt.wikiId === selected.id ? (
          <HauntedArticle haunt={haunt} onReveal={dismissHaunt} />
        ) : (
          <>
            {/* An entry published through Experimental Editing shows its change
                highlighted (green added / red removed) as the actual published
                content — but only to a viewer the GM has revealed it to (see
                "Experimental Editing revealed to" and canSeeHighlight above).
                Everyone else reads the old (pre-edit) title/body instead, as if
                the edit never happened; nothing about the page looks different
                to them. The pre-edit title/body was stashed at approval/enable
                time (see App.jsx's approveWikiEntry and the GM's own toggle
                above) so this still renders correctly long after the proposal
                itself is gone. */}
            {canSeeHighlight && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <DiffLegend />
              </div>
            )}
            {canSeeHighlight && selected.testEditBeforeTitle && selected.testEditBeforeTitle !== selected.title ? (
              <CodexDiff before={selected.testEditBeforeTitle} after={selected.title} />
            ) : (
              <div className="stencil" style={{ fontSize: 24, fontWeight: 800, letterSpacing: ".03em", color: T.text }}>
                {(revealed ? selected.title : (selected.testEditBeforeTitle || selected.title)) || "Untitled"}
              </div>
            )}
            {formatUpdatedAt(selected.updatedAt || selected.createdAt) && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: T.faint }}>
                <Clock size={11} /> Last updated {formatUpdatedAt(selected.updatedAt || selected.createdAt)}
              </div>
            )}
            {selected.submittedBy && (
              <div style={{ fontSize: 10.5, color: T.faint, fontStyle: "italic" }}>
                Submitted by {selected.submittedBy.roleName || "a player"}
              </div>
            )}
            {/* Players see the image section only when a picture is present. */}
            {imageFor(selected.id) && imageFrame(imageFor(selected.id), isMobile ? 320 : 480, selected.title)}
            {canSeeHighlight
              ? <CodexDiff before={bodyFor(testEditBeforeId)} after={bodyFor(selected.id)} />
              : <CodexBody body={bodyFor(revealed ? selected.id : testEditBeforeId)} isMobile={isMobile} />}
            {/* A signed-in player can propose a change to this live entry; the GM
                reviews it before it goes live, same as a new-entry submission. */}
            {canSubmit && !pending && (myPendingEdit ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11, color: T.amber,
                border: `1px solid ${T.amber}`, borderRadius: 2, padding: "8px 10px", background: "rgba(217,143,43,.1)" }}>
                <Clock size={13} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>
                  {myPendingEdit.ready ? "You have a proposed edit awaiting review." : "You have a draft edit in progress."}
                </span>
                <Btn onClick={() => selectEntry(myPendingEdit.id)}>
                  <Pencil size={13} /> Open it
                </Btn>
              </div>
            ) : (
              <Btn kind="primary" onClick={() => proposeEdit(selected.id)} style={{ alignSelf: "flex-start", marginTop: 4 }}>
                <Pencil size={14} /> Propose an edit
              </Btn>
            ))}
          </>
        )}
      </div>
    );
  };

  if (isMobile) {
    const CatIcon = catMeta.icon;
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
        {selected ? detail(() => selectEntry(null)) : (
          <>
            {searchBar()}
            <MobileTabRail
              label={queueMode ? "Review Queue" : searching ? `Search: "${query.trim()}"` : catMeta.label}
              icon={queueMode ? <Inbox size={15} /> : !searching ? <CatIcon size={15} /> : undefined}
              accentColor={queueMode ? T.amber : !searching ? T.accent : undefined}>
              {categoryRail(true)}
            </MobileTabRail>
            {entryList()}
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", background: T.void }}>
      <div style={{ width: 300, flexShrink: 0, borderRight: `2px solid ${T.line}`, background: T.panel,
        display: "flex", flexDirection: "column", minHeight: 0 }}>
        {searchBar()}
        {categoryRail(true)}
        {entryList()}
      </div>
      {detail(null)}
    </div>
  );
}
