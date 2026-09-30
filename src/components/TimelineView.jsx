import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { History, Newspaper, LayoutList, FileText, Clock, Check, X, Pencil, ExternalLink, Map as MapIcon, ChevronDown, ChevronRight, Eye, EyeOff, Trash2, Link2 } from "lucide-react";
import { T, F, lbl, inputStyle, cut } from "../theme.js";
import { WIKI_CATS } from "../constants.js";
import Btn from "./ui/Btn.jsx";
import CodexBody from "./CodexBody.jsx";
import BoardSnapshotModal from "./BoardSnapshotModal.jsx";

// The article date the timeline sorts and buckets on: when the page was
// published (publishedAt) — the moment it became a real article — falling back
// to when it was first drafted, then its last edit, for legacy entries that
// predate the publishedAt stamp. A news article about a turn's events is
// published around that turn, so its publish time is the closest thing to
// "when it happened" the codex records.
const articleDate = (e) => e.publishedAt || e.createdAt || e.updatedAt || 0;
const catMeta = (id) => WIKI_CATS.find((c) => c.id === id) || { label: id, icon: FileText };

const fmtFull = (ms) => (ms ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms)) : null);
const fmtShort = (ms) => (ms ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(ms)) : "");

// <input type="datetime-local"> speaks a local "YYYY-MM-DDTHH:mm" string, not an
// epoch — convert both ways, and keep the value in local time so the GM types
// the wall-clock time they mean rather than a UTC offset.
function toLocalInput(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v) {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// A horizontal, left-to-right campaign timeline: codex articles laid out as
// boxes in three staggered rows above an axis, each box stemming down to its
// exact spot, the whole thing split into turn columns. Which turn an article
// falls in comes from comparing its date against the recorded turn-start times
// (stamped by Next Turn, adjustable here by the GM). News only by default, with
// a toggle for every category. Clicking a box opens its article inline below the
// strip rather than leaving for the Codex.
export default function TimelineView({ wiki, factions, threads = [], addThread, patchThread, removeThread, turns, turnNumber, isGM, isMobile, goToCodex, setTurnStart, setTurnName, loadImage, loadBody, loadSnapshot }) {
  const titleOf = (e) => e.title;
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState(null); // article shown in the reader below
  const [editingTurn, setEditingTurn] = useState(null); // turn number the GM is editing (start time + name)
  const [draft, setDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [hoverId, setHoverId] = useState(null);
  const [viewingSnapshotTurn, setViewingSnapshotTurn] = useState(null); // turn number whose board-state modal is open — GM only
  const [collapsed, setCollapsed] = useState(() => new Set()); // turn numbers whose article boxes are hidden, this browser only

  // Board-state snapshots are a GM tool (see App.jsx nextTurn/lib/turnSnapshot.js)
  // — a player never sees the button or the viewer, same as any other isGM gate
  // in this app. A snapshot's id is deterministic per turn (see
  // lib/turnSnapshot.js), so rather than loading every turn's frozen board up
  // front, this fetches just the one turn a GM actually opens the viewer for —
  // see loadSnapshot (sectorRepo.js loadSnapshotForTurn). Every past turn is
  // assumed to have one (true for anything nextTurn() has ever closed out) so
  // the "Board" button always shows without needing that checked in advance;
  // the rare turn that genuinely has none (predates the feature and was never
  // backfilled — see scripts/backfill-turn-snapshots.mjs) just resolves to
  // nothing when opened.
  const [snapshotCache, setSnapshotCache] = useState({});
  useEffect(() => {
    if (!isGM || viewingSnapshotTurn === null || viewingSnapshotTurn in snapshotCache) return;
    let cancelled = false;
    loadSnapshot(viewingSnapshotTurn)
      .catch(() => null)
      .then((s) => { if (!cancelled) setSnapshotCache((c) => ({ ...c, [viewingSnapshotTurn]: s })); });
    return () => { cancelled = true; };
  }, [isGM, viewingSnapshotTurn, snapshotCache, loadSnapshot]);
  const snapshotOf = (turn) => snapshotCache[turn] || null;
  const toggleCollapsed = (turn) => setCollapsed((cur) => {
    const next = new Set(cur);
    if (next.has(turn)) next.delete(turn); else next.add(turn);
    return next;
  });
  const stripRef = useRef(null);
  const readerRef = useRef(null);
  const didInitRef = useRef(false); // guards the one-time default below

  const factionColor = (id) => (factions.find((f) => f.id === id) || {}).color || null;

  // The turn-start records that actually have a time, in turn order. The Timeline
  // treats these as the boundaries between turns.
  const marks = useMemo(
    () => (turns || []).filter((t) => Number.isFinite(t.startedAt) && t.startedAt > 0).sort((a, b) => a.turn - b.turn),
    [turns],
  );
  const startOf = (turn) => {
    const m = marks.find((x) => x.turn === turn);
    return m ? m.startedAt : null;
  };
  // The GM's name for a turn, if any. Read straight from `turns` (not `marks`) —
  // a turn can be named without having a start time set.
  const nameOf = (turn) => {
    const m = (turns || []).find((x) => x.turn === turn);
    return (m && m.name) || "";
  };
  // The turn a given date belongs to: the highest turn whose recorded start is at
  // or before the date. A date earlier than every recorded start belongs to the
  // turn just before the earliest one (never below 0). Robust to a GM setting
  // non-monotonic starts — it picks the max qualifying turn rather than assuming
  // order — which is why it can't just walk the sorted list and break.
  const turnOfDate = useMemo(() => (d) => {
    let best = null;
    for (const m of marks) if (d >= m.startedAt && (best === null || m.turn > best)) best = m.turn;
    if (best !== null) return best;
    return marks.length ? Math.max(0, marks[0].turn - 1) : 0;
  }, [marks]);

  // The articles that go on the timeline: published pages (never drafts or
  // pending submissions) that carry a date, filtered to news unless "All" is on,
  // sorted oldest-first and tagged with the turn they fall in.
  const shown = useMemo(() => {
    const base = (wiki || []).filter((e) => e.status !== "pending" && e.status !== "draft" && articleDate(e) > 0);
    const filtered = showAll ? base : base.filter((e) => e.category === "news");
    return filtered
      .map((e) => ({ ...e, _date: articleDate(e) }))
      .sort((a, b) => a._date - b._date)
      .map((e) => ({ ...e, turnIndex: turnOfDate(e._date) }));
  }, [wiki, showAll, turnOfDate]);

  // How far the axis runs: through the current turn, plus any turn an article or
  // a recorded start reaches beyond it. Columns cover 0..endTurn inclusive, so
  // even turns with nothing in them still show as a segment of elapsed time.
  const endTurn = useMemo(() => {
    let m = Number(turnNumber) || 0;
    for (const mk of marks) m = Math.max(m, mk.turn);
    for (const a of shown) m = Math.max(m, a.turnIndex);
    return Math.max(0, m);
  }, [turnNumber, marks, shown]);

  const byTurn = useMemo(() => {
    const map = new Map();
    for (const a of shown) {
      if (!map.has(a.turnIndex)) map.set(a.turnIndex, []);
      map.get(a.turnIndex).push(a); // already oldest-first from `shown`
    }
    return map;
  }, [shown]);

  /* ------------------------------------------------ layout geometry
     Transit-map layout (modeled on the Chronicle in flagellumdei): one row per
     narrative thread plus an "Unthreaded" row for untagged articles, crossed
     with one column per turn. An article renders once, in its "home" thread's
     row; each thread then draws its own colored line from one of its articles
     straight to the next in time, dipping to touch a card on another row (a
     nub marks a secondary tag). A column widens to fit its articles, which sit
     at their chronological slot so an idle thread leaves a gap, not a pack. */
  const SLOT_W = isMobile ? 132 : 160;
  const SLOT_GAP = 26;
  const CELL_PAD = 16;
  const COL_MIN_W = isMobile ? 150 : 190;
  const COLLAPSED_W = 34;
  const ROW_HEADER_W = isMobile ? 120 : 180;
  const HEADER_H = 68;
  const CARD_H = isMobile ? 58 : 66;
  const MISC_ID = "__misc";
  const MISC_COLOR = T.mut;

  const sortedThreads = useMemo(() => [...(threads || [])], [threads]);
  const threadById = useMemo(() => new Map(sortedThreads.map((t) => [t.id, t])), [sortedThreads]);
  const [hiddenThreads, setHiddenThreads] = useState(() => new Set()); // this browser only
  const toggleThreadHidden = (id) => setHiddenThreads((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [newThreadName, setNewThreadName] = useState("");

  const tagsOf = (a) => (a.threadIds || []).filter((id) => threadById.has(id));
  // The thread an article lives on: its first tag in thread-list order, else Misc.
  const homeOf = (a) => {
    const ids = tagsOf(a);
    if (!ids.length) return MISC_ID;
    return sortedThreads.find((t) => ids.includes(t.id)).id;
  };
  const threadCount = (id) => shown.filter((a) => (id === MISC_ID ? tagsOf(a).length === 0 : tagsOf(a).includes(id))).length;

  const rows = useMemo(() => {
    const list = sortedThreads.map((t) => ({ id: t.id, name: t.name, color: t.color || T.accent }));
    if (!list.length || shown.some((a) => tagsOf(a).length === 0)) {
      list.push({ id: MISC_ID, name: "Unthreaded", color: MISC_COLOR, misc: true });
    }
    return list.filter((r) => !hiddenThreads.has(r.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedThreads, shown, hiddenThreads]);
  // An article whose home row is hidden falls back to its next visible tagged
  // row; if every tag is hidden it renders nowhere.
  const rowOf = (a) => {
    const home = homeOf(a);
    if (rows.some((r) => r.id === home)) return home;
    const fb = rows.find((r) => !r.misc && tagsOf(a).includes(r.id));
    return fb ? fb.id : null;
  };

  const columns = useMemo(() => {
    const list = [];
    for (let turn = 0; turn <= endTurn; turn += 1) {
      const all = byTurn.get(turn) || [];
      const isCol = collapsed.has(turn);
      const arts = isCol ? [] : all.filter((a) => rowOf(a) !== null);
      const n = arts.length;
      const width = isCol ? COLLAPSED_W
        : Math.max(COL_MIN_W, n * SLOT_W + Math.max(0, n - 1) * SLOT_GAP + CELL_PAD * 2);
      list.push({ turn, width, arts, slots: new Map(arts.map((a, i) => [a.id, i])), hiddenCount: all.length - arts.length });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byTurn, endTurn, isMobile, collapsed, rows]);

  const gridInnerRef = useRef(null);
  const rowRefs = useRef(new Map());
  const cardRefs = useRef(new Map());
  const [overlay, setOverlay] = useState({ lines: [], dividers: [], width: 0, height: 0 });

  // Measure the committed DOM and build each thread's path. Coordinates are
  // relative to the grid itself, so they hold at any scroll position.
  useLayoutEffect(() => {
    const gridEl = gridInnerRef.current;
    if (!gridEl) return;
    const g = gridEl.getBoundingClientRect();
    const rowY = new Map();
    rowRefs.current.forEach((el, id) => { const r = el.getBoundingClientRect(); rowY.set(id, (r.top + r.bottom) / 2 - g.top); });
    const anchors = new Map();
    const rects = new Map();
    cardRefs.current.forEach((el, id) => {
      const a = shown.find((x) => x.id === id);
      if (!a) return;
      const home = rowOf(a);
      const py = rowY.get(home);
      if (py == null) return;
      const per = new Map([[home, py]]);
      const sec = tagsOf(a).filter((t) => t !== home && rowY.has(t));
      const above = sec.filter((t) => rowY.get(t) < py).sort((x, y) => rowY.get(y) - rowY.get(x));
      const below = sec.filter((t) => rowY.get(t) > py).sort((x, y) => rowY.get(x) - rowY.get(y));
      above.forEach((t, i) => per.set(t, py - Math.min(12 + i * 10, 28)));
      below.forEach((t, i) => per.set(t, py + Math.min(12 + i * 10, 28)));
      anchors.set(id, per);
      const r = el.getBoundingClientRect();
      rects.set(id, { l: r.left - g.left, r: r.right - g.left });
    });
    const lines = rows.filter((r) => rowY.has(r.id)).map((row) => {
      const pts = shown
        .filter((a) => (row.misc ? tagsOf(a).length === 0 : tagsOf(a).includes(row.id)))
        .filter((a) => anchors.has(a.id) && anchors.get(a.id).has(row.id))
        .map((a) => ({ enterX: rects.get(a.id).l, exitX: rects.get(a.id).r, y: anchors.get(a.id).get(row.id), home: rowOf(a) === row.id }));
      let d = "";
      pts.forEach((p, i) => {
        if (i === 0) { d += `M${p.enterX},${p.y} L${p.exitX},${p.y}`; return; }
        const prev = pts[i - 1];
        const cx = (prev.exitX + p.enterX) / 2;
        d += ` C${cx},${prev.y} ${cx},${p.y} ${p.enterX},${p.y} L${p.exitX},${p.y}`;
      });
      return { id: row.id, color: row.color, misc: !!row.misc, d, nubs: pts.filter((p) => !p.home).map((p) => [(p.enterX + p.exitX) / 2, p.y]), has: pts.length > 0 };
    });
    const dividers = [];
    gridEl.querySelectorAll("[data-turn-head]").forEach((el) => dividers.push(el.getBoundingClientRect().left - g.left));
    setOverlay({ lines, dividers, width: g.width, height: g.height });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, threads, columns, rows, isMobile, editingTurn]);

  // First paint only: collapse every cycle except the current one, and scroll
  // the strip so the current cycle sits at the left edge of the view — a
  // fresh viewer lands on "what's happening now" instead of the campaign's
  // start. Guarded by a ref (not state) so it fires exactly once, whenever
  // real data first shows up, and never fights a GM/player's own toggling
  // or scrolling afterward.
  useEffect(() => {
    if (didInitRef.current) return;
    if (!byTurn.size && endTurn === 0) return; // wait for real data to arrive
    didInitRef.current = true;
    const current = Number(turnNumber) || 0;
    const nextCollapsed = new Set();
    for (let t = 0; t <= endTurn; t += 1) if (t !== current) nextCollapsed.add(t);
    setCollapsed(nextCollapsed);
    // Wait a frame so this runs after the collapse above has actually
    // re-rendered the strip at its narrower (collapsed) column widths —
    // otherwise scrollLeft would be computed against the still-expanded DOM.
    requestAnimationFrame(() => {
      if (stripRef.current) stripRef.current.scrollLeft = stripRef.current.scrollWidth;
    });
  }, [byTurn, endTurn, turnNumber]);

  const fullEmpty = shown.length === 0 && endTurn === 0 && marks.length === 0;

  // The article shown in the reader below — looked up in the full list so its
  // body is available even when the strip is filtered to News only. Clears itself
  // if the entry is gone (deleted, or no longer visible to this viewer).
  const selected = selectedId ? (wiki || []).find((e) => e.id === selectedId) : null;
  useEffect(() => {
    if (selectedId && !(wiki || []).some((e) => e.id === selectedId)) setSelectedId(null);
  }, [wiki, selectedId]);
  // Start each newly opened article at the top of the reader.
  useEffect(() => { if (readerRef.current) readerRef.current.scrollTop = 0; }, [selectedId]);

  // A page's raster image lives at its own database path, not on the entity —
  // see lib/codexImage.js and sectorRepo.js loadWikiImage — so only fetch the
  // one article actually open in the reader.
  const [imageCache, setImageCache] = useState({});
  useEffect(() => {
    if (!selectedId || selectedId in imageCache) return;
    let cancelled = false;
    loadImage(selectedId)
      .catch(() => null)
      .then((img) => { if (!cancelled) setImageCache((c) => ({ ...c, [selectedId]: img })); });
    return () => { cancelled = true; };
  }, [selectedId, imageCache, loadImage]);
  const selectedImage = selectedId ? imageCache[selectedId] : null;

  // Same idea for the article's full text — see sectorSchema.js's wiki codec
  // comment: only `excerpt` (used in the strip cards above) rides the live
  // wiki listener now, so the reader below fetches the real body itself.
  const selectedBodyId = selectedId;
  const [bodyCache, setBodyCache] = useState({});
  useEffect(() => {
    if (!selectedBodyId || selectedBodyId in bodyCache) return;
    let cancelled = false;
    loadBody(selectedBodyId)
      .catch(() => "")
      .then((text) => { if (!cancelled) setBodyCache((c) => ({ ...c, [selectedBodyId]: text })); });
    return () => { cancelled = true; };
  }, [selectedBodyId, bodyCache, loadBody]);
  const selectedBody = selectedBodyId ? (bodyCache[selectedBodyId] ?? "") : "";

  const openEditor = (turn) => {
    setEditingTurn(turn);
    setDraft(toLocalInput(startOf(turn)));
    setNameDraft(nameOf(turn));
  };

  const toggle = (
    <div style={{ display: "flex", gap: 3, background: T.panel3, padding: 3, border: `1px solid ${T.line}` }}>
      <Btn active={!showAll} onClick={() => setShowAll(false)} title="Show only News articles"
        style={{ border: "none", borderRadius: 0, justifyContent: "center" }}>
        <Newspaper size={13} /> News
      </Btn>
      <Btn active={showAll} onClick={() => setShowAll(true)} title="Show articles from every category"
        style={{ border: "none", borderRadius: 0, justifyContent: "center" }}>
        <LayoutList size={13} /> All
      </Btn>
    </div>
  );

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: isMobile ? "12px 14px" : "14px 20px",
      borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <History size={20} color={T.accent} />
        <div className="stencil" style={{ fontSize: isMobile ? 17 : 20, letterSpacing: ".05em", color: T.text }}>TIMELINE</div>
      </div>
      <span className="mono" style={{ fontSize: 10.5, color: T.faint }}>
        {shown.length} article{shown.length === 1 ? "" : "s"}
      </span>
      <div style={{ marginLeft: "auto" }}>{toggle}</div>
    </div>
  );

  // Nothing recorded at all — no articles, no turns advanced. Show a hint rather
  // than an empty axis.
  if (fullEmpty) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
        {header}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 12, color: T.faint, padding: 24, textAlign: "center" }}>
          <History size={40} strokeWidth={1.2} />
          <div className="stencil" style={{ fontSize: 15, letterSpacing: ".06em", color: T.mut }}>NOTHING ON THE TIMELINE YET</div>
          <div style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 340 }}>
            {showAll
              ? "Published codex articles appear here in chronological order once they carry a date."
              : "News articles appear here in chronological order. Toggle “All” to place every category, or add a News article in the Codex."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
      {header}

      {/* Thread bar: hide/show rows (this browser only); the GM can add threads. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "8px 14px",
        borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
        {sortedThreads.map((t) => {
          const hidden = hiddenThreads.has(t.id);
          const c = t.color || T.accent;
          return (
            <Btn key={t.id} onClick={() => toggleThreadHidden(t.id)} title={hidden ? "Show this thread" : "Hide this thread"}
              style={{ padding: "3px 9px", fontSize: 11, opacity: hidden ? 0.5 : 1,
                borderColor: hidden ? T.line : c, background: hidden ? T.panel2 : `${c}33`, color: hidden ? T.mut : c }}>
              {hidden ? <EyeOff size={11} /> : <Eye size={11} />} {t.name || "Untitled thread"}
              <span className="mono" style={{ fontSize: 9, color: T.faint }}>{threadCount(t.id)}</span>
            </Btn>
          );
        })}
        {isGM && (
          <input value={newThreadName} placeholder="New thread… (Enter)" onChange={(e) => setNewThreadName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newThreadName.trim()) { addThread(newThreadName); setNewThreadName(""); } }}
            style={{ ...inputStyle, width: 160 }} />
        )}
        {!sortedThreads.length && !isGM && <span style={{ fontSize: 10.5, color: T.faint }}>No narrative threads yet.</span>}
      </div>

      {/* The grid: thread rows x turn columns, connector lines behind the cards. */}
      <div ref={stripRef} className="scroll" style={{ flexShrink: 0, maxHeight: "55%", overflow: "auto", background: T.void }}>
        <div ref={gridInnerRef} style={{ display: "grid", position: "relative", width: "max-content", minWidth: "100%",
          gridTemplateColumns: [`${ROW_HEADER_W}px`, ...columns.map((c) => `${c.width}px`)].join(" ") }}>
          <svg width={overlay.width} height={overlay.height} viewBox={`0 0 ${overlay.width || 1} ${overlay.height || 1}`}
            style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "visible" }}>
            {overlay.dividers.map((x, i) => <line key={i} x1={x} y1={0} x2={x} y2={overlay.height} stroke={T.line} opacity={0.45} />)}
            {overlay.lines.map((l) => l.has && (
              <g key={l.id}>
                <path d={l.d} fill="none" stroke={l.color} strokeWidth={l.misc ? 2 : 2.5}
                  strokeDasharray={l.misc ? "2 5" : undefined} opacity={l.misc ? 0.55 : 1} />
                {l.nubs.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={4} fill={l.color} stroke={T.void} strokeWidth={1.5} />)}
              </g>
            ))}
          </svg>

          <div style={{ position: "sticky", top: 0, left: 0, zIndex: 5, background: T.panel, height: HEADER_H,
            borderBottom: `1px solid ${T.line}`, borderRight: `2px solid ${T.line}` }} />
          {columns.map((col) => {
            const isCurrent = col.turn === (Number(turnNumber) || 0);
            const start = startOf(col.turn);
            const turnName = nameOf(col.turn);
            const isCol = collapsed.has(col.turn);
            return (
              <div key={`h${col.turn}`} data-turn-head style={{ position: "sticky", top: 0, zIndex: editingTurn === col.turn ? 20 : 3,
                height: HEADER_H, background: isCurrent ? "#1d2110" : T.panel, borderBottom: `1px solid ${T.line}`,
                borderLeft: `1px ${isCurrent ? "solid" : "dashed"} ${isCurrent ? T.accent : T.line}` }}>
                <div style={{ width: "100%", height: "100%", padding: isCol ? "8px 2px" : "8px 10px",
                  display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => toggleCollapsed(col.turn)}
                      title={isCol ? "Expand this cycle" : "Collapse this cycle"}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: T.faint, display: "flex", flexShrink: 0 }}>
                      {isCol ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </button>
                    {!isCol && isGM && (
                      <button onClick={() => openEditor(col.turn)} title="Name this cycle or set when it began"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: T.faint, display: "flex", flexShrink: 0 }}>
                        <Pencil size={12} />
                      </button>
                    )}
                    {!isCol && (
                      <span className="stencil" style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".05em",
                        color: isCurrent ? T.accent : T.text, whiteSpace: "nowrap" }}>
                        CYCLE {col.turn}
                      </span>
                    )}
                    {!isCol && isGM && col.turn <= turnNumber && (
                      <button onClick={() => setViewingSnapshotTurn(col.turn)} title="See the board as this cycle looked"
                        style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 4,
                          background: "rgba(159,194,58,.16)", border: `1px solid ${T.accent}`, borderRadius: 2,
                          padding: "2px 6px", cursor: "pointer", color: T.accent, fontSize: 9, fontWeight: 700,
                          letterSpacing: ".06em", textTransform: "uppercase" }}>
                        <MapIcon size={11} /> {!isMobile && "Board"}
                      </button>
                    )}
                  </div>
                  {isCol ? (
                    <div className="mono" style={{ fontSize: 10, color: T.faint, textAlign: "center" }}>{col.turn}{col.hiddenCount > 0 ? ` · ${col.hiddenCount}` : ""}</div>
                  ) : (
                    <>
                      {(turnName || isGM) && (
                        <div title={turnName || undefined}
                          style={{ fontFamily: F.body, fontSize: 12.5, fontWeight: turnName ? 600 : 400,
                            fontStyle: turnName ? "normal" : "italic", lineHeight: 1.2,
                            color: turnName ? (isCurrent ? T.accent : T.text) : T.faint,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {turnName || "Unnamed cycle"}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9.5, color: start ? T.mut : T.faint, minWidth: 0 }}>
                        <Clock size={10} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {start ? fmtFull(start) : (isGM ? "Set a start time…" : "No start time set")}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                {isGM && editingTurn === col.turn && (
                  <div style={{ position: "absolute", top: 6, left: 8, zIndex: 30, width: 236, background: T.panel,
                    border: `1px solid ${T.accent}`, ...cut(6), padding: 10, display: "flex", flexDirection: "column", gap: 8,
                    boxShadow: "0 12px 28px rgba(0,0,0,.6)" }}>
                    <span style={lbl}>Cycle {col.turn} — name</span>
                    <input type="text" value={nameDraft} maxLength={60} placeholder="e.g. The Siege of Kessler"
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { setTurnName(col.turn, nameDraft); setTurnStart(col.turn, fromLocalInput(draft)); setEditingTurn(null); } }}
                      style={{ ...inputStyle }} />
                    <span style={lbl}>Start time</span>
                    <input type="datetime-local" value={draft} onChange={(e) => setDraft(e.target.value)}
                      style={{ ...inputStyle, fontFamily: F.mono }} />
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Btn kind="primary" onClick={() => { setTurnName(col.turn, nameDraft); setTurnStart(col.turn, fromLocalInput(draft)); setEditingTurn(null); }}>
                        <Check size={12} /> Save
                      </Btn>
                      {start != null && (
                        <Btn onClick={() => { setTurnStart(col.turn, null); setEditingTurn(null); }} title="Remove this cycle's start time (keeps its name)">
                          <X size={12} /> Clear time
                        </Btn>
                      )}
                      <Btn onClick={() => setEditingTurn(null)} style={{ marginLeft: "auto" }}>Cancel</Btn>
                    </div>
                    <span style={{ fontSize: 9.5, color: T.faint, lineHeight: 1.5 }}>
                      The name labels this cycle on the timeline. Articles dated on or after the start move into Cycle {col.turn}.
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {rows.map((row) => (
            <Fragment key={row.id}>
              <div ref={(el) => { if (el) rowRefs.current.set(row.id, el); else rowRefs.current.delete(row.id); }}
                style={{ position: "sticky", left: 0, zIndex: 2, background: T.panel, borderRight: `2px solid ${T.line}`,
                  borderLeft: `4px solid ${row.color}`, padding: "8px", display: "flex", alignItems: "center", gap: 5,
                  minHeight: CARD_H + 28, minWidth: 0 }}>
                {isGM && !row.misc ? (
                  <>
                    <label style={{ position: "relative", width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} title="Thread color">
                      <span style={{ display: "block", width: "100%", height: "100%", borderRadius: 2, background: row.color, border: `1px solid ${T.line}` }} />
                      <input type="color" value={row.color} onChange={(e) => patchThread(row.id, { color: e.target.value })}
                        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
                    </label>
                    <input value={row.name} placeholder="Thread name" onChange={(e) => patchThread(row.id, { name: e.target.value })}
                      style={{ ...inputStyle, fontWeight: 700, padding: "4px 6px", flex: 1, minWidth: 0 }} />
                    <button title="Delete thread (articles keep their text, lose this tag)"
                      onClick={() => { if (window.confirm(`Delete thread "${row.name || "Untitled"}"? Articles stay, but lose this tag.`)) removeThread(row.id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: T.faint, display: "flex", padding: 2 }}>
                      <Trash2 size={12} />
                    </button>
                  </>
                ) : (
                  <span className="display" style={{ fontSize: 12, fontWeight: 700, color: row.misc ? T.mut : T.text, flex: 1, minWidth: 0,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.name || "Untitled thread"}
                  </span>
                )}
                <button title="Hide this row" onClick={() => toggleThreadHidden(row.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: T.faint, display: "flex", padding: 2 }}>
                  <EyeOff size={11} />
                </button>
              </div>
              {columns.map((col) => {
                const here = col.arts.filter((a) => rowOf(a) === row.id);
                const atSlot = new Map(here.map((a) => [col.slots.get(a.id), a]));
                return (
                  <div key={`c-${row.id}-${col.turn}`} style={{ padding: 6, minWidth: 0, minHeight: CARD_H + 28,
                    display: "flex", flexDirection: "row", alignItems: "center", gap: SLOT_GAP, paddingLeft: CELL_PAD }}>
                    {Array.from({ length: col.arts.length }, (_, i) => {
                      const a = atSlot.get(i);
                      if (!a) return <div key={`g${i}`} style={{ width: SLOT_W, flexShrink: 0 }} />;
                      const active = selectedId === a.id;
                      const on = active || hoverId === a.id;
                      const fc = a.factionId ? factionColor(a.factionId) : null;
                      const c = row.color;
                      const Ic = catMeta(a.category).icon;
                      const secondary = tagsOf(a).filter((t) => t !== row.id).map((t) => threadById.get(t));
                      return (
                        <button key={a.id} onClick={() => setSelectedId((cur) => (cur === a.id ? null : a.id))}
                          ref={(el) => { if (el) cardRefs.current.set(a.id, el); else cardRefs.current.delete(a.id); }}
                          onMouseEnter={() => setHoverId(a.id)} onMouseLeave={() => setHoverId((h) => (h === a.id ? null : h))}
                          title={`${titleOf(a) || "Untitled"} — ${fmtFull(a._date)}`}
                          style={{ position: "relative", zIndex: 1, width: SLOT_W, minHeight: CARD_H, flexShrink: 0, textAlign: "left",
                            cursor: "pointer", display: "flex", flexDirection: "column", gap: 3,
                            background: on ? "#232a12" : T.panel2,
                            border: `1px solid ${on ? T.accent : c}`, borderLeft: `5px solid ${on ? T.accent : c}`,
                            borderRadius: 2, padding: "6px 8px", color: T.text, fontFamily: "inherit",
                            boxShadow: active ? `0 0 0 1px ${T.accent}, 0 6px 16px rgba(0,0,0,.55)` : "0 3px 9px rgba(0,0,0,.4)" }}>
                          <span style={{ fontFamily: F.body, fontSize: isMobile ? 12.5 : 13, lineHeight: 1.28,
                            color: on ? T.accent : T.text, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {titleOf(a) || "Untitled"}
                          </span>
                          <span style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 10,
                            color: T.mut, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {fc && <span style={{ width: 6, height: 6, borderRadius: "50%", background: fc, flexShrink: 0 }} />}
                            <Ic size={10} style={{ flexShrink: 0 }} /> {catMeta(a.category).label} · {fmtShort(a._date)}
                          </span>
                          {secondary.length > 0 && (
                            <span style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", fontSize: 9, color: T.faint }}>
                              <Link2 size={8} style={{ flexShrink: 0 }} />
                              {secondary.map((t) => (
                                <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.color }} />{t.name}
                                </span>
                              ))}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* The reader — the selected article, rendered inline below the strip. */}
      <div ref={readerRef} className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto",
        borderTop: `2px solid ${T.line}`, background: T.panel }}>
        {selected ? (() => {
          const Ic = catMeta(selected.category).icon;
          const fc = selected.factionId ? factionColor(selected.factionId) : null;
          const faction = selected.factionId ? factions.find((f) => f.id === selected.factionId) : null;
          return (
            <div style={{ maxWidth: 820, margin: "0 auto", padding: isMobile ? 16 : "22px 24px",
              display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, ...lbl, color: T.accent }}>
                  <Ic size={13} /> {catMeta(selected.category).label}
                </span>
                {faction && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: T.mut }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: fc || T.faint }} />
                    {faction.name}
                  </span>
                )}
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <Btn onClick={() => goToCodex(selected.id)} title="Open this article in the Codex">
                    <ExternalLink size={13} /> {!isMobile && "Open in Codex"}
                  </Btn>
                  <Btn onClick={() => setSelectedId(null)} title="Close">
                    <X size={13} /> {!isMobile && "Close"}
                  </Btn>
                </div>
              </div>
              <div className="stencil" style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, letterSpacing: ".03em", color: T.text }}>
                {titleOf(selected) || "Untitled"}
              </div>
              {tagsOf(selected).length > 0 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {tagsOf(selected).map((id) => {
                    const t = threadById.get(id);
                    return (
                      <span key={id} style={{ fontSize: 10, color: t.color, border: `1px solid ${t.color}`, borderRadius: 2, padding: "2px 6px" }}>
                        {t.name || "Untitled thread"}
                      </span>
                    );
                  })}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: T.faint }}>
                <Clock size={11} /> {fmtFull(articleDate(selected))}
              </div>
              {selectedImage && (
                <div style={{ border: `1px solid ${T.line}`, background: T.panel3, padding: 6, alignSelf: "flex-start",
                  maxWidth: "100%", borderRadius: 2 }}>
                  <img src={selectedImage} alt={selected.title || ""}
                    style={{ display: "block", maxWidth: "100%", maxHeight: isMobile ? 320 : 440 }} />
                </div>
              )}
              <CodexBody body={selectedBody} isMobile={isMobile} />
            </div>
          );
        })() : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%",
            gap: 8, color: T.faint, padding: 24, textAlign: "center" }}>
            <FileText size={26} strokeWidth={1.3} />
            <div style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 320 }}>
              Select an event on the timeline to read its article here.
            </div>
          </div>
        )}
      </div>

      {isGM && viewingSnapshotTurn !== null && snapshotOf(viewingSnapshotTurn) && (
        <BoardSnapshotModal snapshot={snapshotOf(viewingSnapshotTurn)} turnName={nameOf(viewingSnapshotTurn)}
          onClose={() => setViewingSnapshotTurn(null)} />
      )}
    </div>
  );
}
