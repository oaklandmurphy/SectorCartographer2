import { useEffect, useMemo, useRef, useState } from "react";
import { Users, Plus, Maximize2, Network, User, Star, Lock, LockOpen, Ghost } from "lucide-react";
import { T, F, cut, sceneBackdrop, floatingPanel } from "../theme.js";
import { SUBNODE_ZOOM, RELATION_TYPES, relationType, MIN_ZOOM, MAX_ZOOM } from "../constants.js";
import { fitView } from "../lib/fitView.js";
import { usePoliticsInteractions } from "../hooks/usePoliticsInteractions.js";
import TargetBrackets from "./ui/TargetBrackets.jsx";
import Starfield from "./ui/Starfield.jsx";
import FactionPopup from "./FactionPopup.jsx";
import MemberPopup from "./MemberPopup.jsx";

const NODE_R = 62;   // collapsed faction badge radius, world units
const CARD_W = 300;  // expanded roster card width, screen px
const CARD_W_MOBILE = 226; // narrower so it doesn't eat the whole phone viewport

function popupPos(w2s, containerSize, wx, wy, cardW, cardH) {
  const w = Math.min(cardW, Math.max(8, containerSize.w - 16)); // never wider than the viewport has room for
  const s = w2s(wx, wy);
  let x = s.x + 40, y = s.y - 24;
  if (x + w + 10 > containerSize.w) x = s.x - w - 40;
  x = Math.min(Math.max(8, x), Math.max(8, containerSize.w - w - 8));
  y = Math.min(Math.max(8, y), Math.max(8, containerSize.h - cardH - 8));
  return { x, y };
}

export default function PoliticsView({
  factions, relations, canEdit, isMobile, wiki, viewer,
  editLocked, setEditLocked, showLock,
  patchFaction, addFaction, deleteFaction, setRelation,
  addMember, patchMember, patchMemberTitle, removeMember,
  goToCodex, createEntry, loadImage,
  agents, canManageAgents, goToAgentAction,
}) {
  const [view, setView] = useState({ scale: 0.72, ox: 400, oy: 300 });
  const [selFac, setSelFac] = useState(null);
  const [selMem, setSelMem] = useState(null); // { facId, memId }
  const centeredRef = useRef(false);
  // `showLock` doubles as "is this the GM/open-mode viewer" — same overload
  // used for canEdit elsewhere (see MapCanvas isGM comment) — it's only ever
  // passed true for the raw GM flag, never for a merely-unlocked player.
  const isGM = showLock;

  /* ------------------------------------------------ phantom factions: a GM decoy
     (faction.isPhantom) that exists in the data but isn't really there — same
     trick as phantom systems (see App.jsx). A non-GM viewer gets a 1-in-50 shot
     per phantom faction of it rendering at all, rolled once per mount of this
     view. The GM always sees every phantom so they can place and manage them. */
  const [phantomRevealed, setPhantomRevealed] = useState(() => new Set());
  const phantomRolledRef = useRef(false);
  useEffect(() => {
    if (isGM || phantomRolledRef.current) return;
    phantomRolledRef.current = true;
    const revealed = new Set();
    for (const f of factions) if (f.isPhantom && Math.random() < 1 / 50) revealed.add(f.id);
    if (revealed.size) setPhantomRevealed(revealed);
  }, [isGM, factions]);
  // Dropped for anyone but the GM unless this session's roll happened to
  // reveal it — used everywhere factions reach a non-GM viewer in this view.
  const displayFactions = useMemo(
    () => (isGM ? factions : factions.filter((f) => !f.isPhantom || phantomRevealed.has(f.id))),
    [factions, isGM, phantomRevealed]
  );

  // node center in world space — the stored px/py, or an auto circular layout
  // for factions created before this view existed (older saves).
  const nodePos = useMemo(() => {
    const out = {}; const n = displayFactions.length;
    displayFactions.forEach((f, i) => {
      if (typeof f.px === "number" && typeof f.py === "number") out[f.id] = { x: f.px, y: f.py };
      else {
        const ang = -Math.PI / 2 + i * ((Math.PI * 2) / Math.max(1, n));
        out[f.id] = { x: Math.cos(ang) * 260, y: Math.sin(ang) * 260 };
      }
    });
    return out;
  }, [displayFactions]);

  const { mapRef, containerSize, onBackgroundPointerDown, startFactionDrag } = usePoliticsInteractions({
    view, setView, canEdit,
    onFactionTap: (id) => {
      // A non-GM viewer noticing a phantom faction and clicking it: it quietly
      // vanishes for the rest of this session, no popup — see the systems
      // version of this trick in App.jsx onSystemTap.
      if (!isGM) {
        const fac = factions.find((f) => f.id === id);
        if (fac && fac.isPhantom) {
          setPhantomRevealed((prev) => { if (!prev.has(id)) return prev; const next = new Set(prev); next.delete(id); return next; });
          return;
        }
      }
      setSelMem(null); setSelFac(id);
    },
    onFactionMove: (id, px, py) => patchFaction(id, { px, py }),
    onBackgroundTap: () => { setSelFac(null); setSelMem(null); },
  });

  const w2s = (x, y) => ({ x: x * view.scale + view.ox, y: y * view.scale + view.oy });
  // "Reset" — frame the actual faction layout rather than snapping back to a
  // fixed pan/zoom, which drifts meaningless once factions are dragged around.
  const centerView = () => setView(fitView(
    displayFactions.map((f) => nodePos[f.id]),
    containerSize.w, containerSize.h,
    { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, padding: NODE_R + 60, fallbackScale: 0.72 }
  ));

  // center the sector's faction layout on first load
  useEffect(() => {
    if (!centeredRef.current && containerSize.w > 1) { centeredRef.current = true; centerView(); }
    // eslint-disable-next-line
  }, [containerSize]);

  const cardW = isMobile ? CARD_W_MOBILE : CARD_W;
  const showMembers = view.scale >= SUBNODE_ZOOM;

  // Portrait images (a starred member's linked codex entry) live at their own
  // database path now, not on the wiki entity — see lib/codexImage.js and
  // sectorRepo.js loadWikiImage. Only fetch the ones a roster card could
  // actually show right now: starred members, and only once zoomed in enough
  // for roster cards to render at all.
  const starredWikiIds = useMemo(() => {
    if (!showMembers) return [];
    const ids = new Set();
    for (const f of displayFactions) for (const m of f.members || []) if (m.star && m.wikiId) ids.add(m.wikiId);
    return [...ids];
  }, [displayFactions, showMembers]);
  const [portraitCache, setPortraitCache] = useState({});
  useEffect(() => {
    const missing = starredWikiIds.filter((id) => !(id in portraitCache));
    if (!missing.length) return;
    let cancelled = false;
    // .catch(() => null): a failed fetch is cached as "no portrait" rather
    // than retried every time this effect re-runs.
    Promise.all(missing.map((id) => loadImage(id).then((img) => [id, img]).catch(() => [id, null])))
      .then((pairs) => { if (!cancelled) setPortraitCache((c) => ({ ...c, ...Object.fromEntries(pairs) })); });
    return () => { cancelled = true; };
  }, [starredWikiIds, portraitCache, loadImage]);
  const selFacObj = displayFactions.find((f) => f.id === selFac) || null;
  const selMemFac = selMem ? displayFactions.find((f) => f.id === selMem.facId) : null;
  const selMemObj = selMemFac ? (selMemFac.members || []).find((m) => m.id === selMem.memId) : null;
  // Whether the selected character is tied to an agent — `agents` here is
  // already visibility-filtered (strictly own-faction, even for allies), so an
  // enemy or allied viewer never learns a character is a covert operative.
  const selMemAgent = selMemFac && selMemObj
    ? (agents || []).find((a) => a.factionId === selMemFac.id && a.memberId === selMemObj.id)
    : null;

  return (
    <div ref={mapRef} style={{ ...sceneBackdrop, cursor: "grab" }}>

      {/* gesture surface — empty-space pan / tap-to-deselect */}
      <div onPointerDown={onBackgroundPointerDown}
        style={{ position: "absolute", inset: 0, zIndex: 1, touchAction: "none", cursor: "grab" }} />

      <Starfield zIndex={2} />

      {/* relationship edges */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 4 }}>
        {relations.map((r) => {
          const A = nodePos[r.a], B = nodePos[r.b];
          if (!A || !B) return null;
          const p = w2s(A.x, A.y), q = w2s(B.x, B.y);
          const meta = relationType(r.type);
          const width = meta.width * Math.min(1.4, Math.max(0.55, view.scale));
          return (
            <g key={r.id}>
              <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={meta.color} strokeOpacity={0.16} strokeWidth={width + 6} />
              <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={meta.color} strokeOpacity={0.8}
                strokeWidth={width} strokeDasharray={meta.dash || undefined} strokeLinecap="round" />
            </g>
          );
        })}
      </svg>

      {/* relationship edge labels */}
      {view.scale >= 0.5 && relations.map((r) => {
        const A = nodePos[r.a], B = nodePos[r.b];
        if (!A || !B) return null;
        const p = w2s(A.x, A.y), q = w2s(B.x, B.y);
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        const meta = relationType(r.type); const Ic = meta.icon;
        return (
          <div key={`lbl_${r.id}`} style={{ position: "absolute", left: mx, top: my, transform: "translate(-50%,-50%)",
            zIndex: 5, pointerEvents: "none", display: "flex", alignItems: "center", gap: 5,
            background: `${T.panel}e6`, border: `1px solid ${meta.color}`, ...cut(5), padding: "3px 8px",
            color: meta.color, fontFamily: F.body, fontSize: 12.5, fontWeight: 600,
            letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            <Ic size={13} /> {meta.label}
          </div>
        );
      })}

      {/* faction nodes */}
      {displayFactions.map((f) => {
        const c = nodePos[f.id]; const p = w2s(c.x, c.y);
        const isSel = selFac === f.id && !selMem;
        const members = f.members || [];
        const starred = members.filter((m) => m.star);
        const listed = members.filter((m) => !m.star);
        const isMemSel = (m) => selMem && selMem.facId === f.id && selMem.memId === m.id;
        const pickMember = (e, m) => { e.stopPropagation(); setSelFac(null); setSelMem({ facId: f.id, memId: m.id }); };

        // zoomed out: compact square badge (cut corners) with sigil + count
        if (!showMembers) {
          const screenR = NODE_R * view.scale;
          return (
            <div key={f.id} onPointerDown={(e) => startFactionDrag(e, f.id, c.x, c.y)}
              style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%,-50%)",
                width: screenR * 2, height: screenR * 2, touchAction: "none",
                zIndex: isSel ? 22 : 12, cursor: canEdit ? "grab" : "pointer" }}>
              <div style={{ position: "absolute", inset: 0, ...cut(Math.max(6, 13 * view.scale)),
                background: `radial-gradient(circle at 50% 34%, ${f.color}66, ${f.color}3a 60%, ${f.color}26 100%), ${T.panel}`,
                border: `2px solid ${f.color}`,
                boxShadow: `0 0 ${16 * view.scale}px ${f.color}44, inset 0 0 ${22 * view.scale}px ${f.color}22` }} />
              {isSel && <TargetBrackets color={T.accent} inset={-5} armLen={Math.max(8, 11 * view.scale)} thick={2} />}
              {/* Only ever rendered for the GM — a player who gets unlucky
                  enough to see the phantom at all must not be able to tell it
                  apart from a real faction. */}
              {isGM && f.isPhantom && (
                <div title="Phantom faction — visible to you only"
                  style={{ position: "absolute", top: -5, right: -5, width: 15, height: 15, zIndex: 3,
                    borderRadius: "50%", background: T.ink, border: `1px solid ${T.accent}`,
                    display: "flex", alignItems: "center", justifyContent: "center", color: T.accent }}>
                  <Ghost size={9} />
                </div>
              )}
              <div className="stencil" style={{ position: "absolute", left: "50%", top: 0, transform: "translate(-50%,-130%)",
                whiteSpace: "nowrap", background: `${T.panel}f0`, border: `1px solid ${f.color}`, ...cut(4),
                padding: "2px 8px", fontSize: 12.5, fontWeight: 700, letterSpacing: ".04em", color: T.text,
                boxShadow: "0 2px 6px rgba(0,0,0,.5)" }}>{f.name}</div>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 2, color: f.color, pointerEvents: "none" }}>
                <Users size={Math.max(13, 20 * view.scale)} />
                <span className="mono" style={{ fontSize: Math.max(10, 13 * view.scale), color: T.mut }}>{members.length}</span>
              </div>
            </div>
          );
        }

        // zoomed in: roster card — portrait grid for important characters, list for the rest
        return (
          <div key={f.id} onPointerDown={(e) => startFactionDrag(e, f.id, c.x, c.y)}
            style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%,-50%)",
              width: cardW, touchAction: "none", zIndex: isSel ? 22 : 12, cursor: canEdit ? "grab" : "pointer" }}>
            {isSel && <TargetBrackets color={T.accent} inset={-6} armLen={16} thick={2.5} />}
            <div style={{ ...cut(15), overflow: "hidden", background: `${T.panel}f5`,
              border: `2px solid ${f.color}`, boxShadow: `0 0 18px ${f.color}40, 0 12px 30px rgba(0,0,0,.6)` }}>

              {/* header / name plate */}
              <div className="stencil" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 13px",
                borderBottom: `1px solid ${f.color}55`, background: `linear-gradient(${f.color}26, transparent)` }}>
                <Users size={17} style={{ color: f.color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 16.5, fontWeight: 700, letterSpacing: ".04em",
                  color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                {isGM && f.isPhantom && <Ghost size={13} title="Phantom faction — visible to you only" style={{ color: T.accent, flexShrink: 0 }} />}
                <span className="mono" style={{ fontSize: 12.5, color: T.faint }}>{members.length}</span>
              </div>

              {members.length === 0 && (
                <div style={{ padding: "16px 13px", textAlign: "center", color: T.faint, fontSize: 13 }}>no characters</div>
              )}

              {/* important characters: uniform portrait grid, always 3 across */}
              {starred.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: isMobile ? 6 : 10, padding: isMobile ? 8 : 12 }}>
                  {starred.map((m) => {
                    const sel = isMemSel(m);
                    const portrait = m.wikiId ? portraitCache[m.wikiId] : null;
                    return (
                      <div key={m.id} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => pickMember(e, m)}
                        title={`${m.name}${m.role ? " · " + m.role : ""}`} style={{ minWidth: 0, cursor: "pointer", textAlign: "center" }}>
                        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", ...cut(5), overflow: "hidden",
                          background: portrait ? "#000" : `linear-gradient(150deg, ${f.color}, ${f.color}aa 60%, #000 150%)`,
                          border: `2px solid ${sel ? T.accent : T.ink}`, display: "flex",
                          alignItems: "center", justifyContent: "center", color: T.onAccent,
                          boxShadow: "inset 0 1px 2px rgba(255,255,255,.15), 0 2px 4px rgba(0,0,0,.6)" }}>
                          {portrait
                            ? <img src={portrait} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
                            : <User size={34} />}
                          <Star size={13} style={{ position: "absolute", top: 3, right: 3, color: T.amber, fill: T.amber }} />
                        </div>
                        <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.3,
                          color: sel ? T.accent : T.text, overflow: "hidden", wordBreak: "break-word", whiteSpace: "normal" }}>
                          {m.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {starred.length > 0 && listed.length > 0 && (
                <div style={{ height: 1, background: T.line, margin: "0 12px 3px" }} />
              )}

              {/* everyone else: compact list */}
              {listed.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "6px 8px 11px" }}>
                  {listed.map((m) => {
                    const sel = isMemSel(m);
                    return (
                      <div key={m.id} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => pickMember(e, m)}
                        title={`${m.name}${m.role ? " · " + m.role : ""}`}
                        style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 7px", cursor: "pointer",
                          borderRadius: 2, background: sel ? `${T.accent}22` : "transparent" }}>
                        <span style={{ width: 9, height: 9, flexShrink: 0, ...cut(2), background: f.color, border: `1px solid ${T.ink}` }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: sel ? T.accent : T.text,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                        {m.role && (
                          <span style={{ flexShrink: 1, minWidth: 0, maxWidth: 120, fontSize: 12, color: T.faint,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.role}</span>
                        )}
                        {m.wikiId && <span style={{ width: 6, height: 6, flexShrink: 0, borderRadius: "50%",
                          background: T.accent }} title="Has codex entry" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* CRT scan-line texture */}
      <div className="scanlines" style={{ position: "absolute", inset: 0, zIndex: 31, opacity: 0.5, pointerEvents: "none" }} />

      {/* floating toolbar */}
      <div style={{ position: "absolute", left: 12, top: 12, zIndex: 34, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {showLock && (
          <button onClick={() => setEditLocked((v) => !v)}
            title={editLocked ? "Editing locked — click to unlock politics" : "Lock editing to stop accidental drags, adds & deletes"}
            style={{ display: "flex", alignItems: "center", gap: 7,
              background: editLocked ? T.accent : `${T.panel}e6`,
              border: `1px solid ${editLocked ? T.accent : T.line}`, ...cut(7),
              color: editLocked ? T.onAccent : T.text, cursor: "pointer", padding: "9px 14px",
              fontFamily: F.body, fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
            {editLocked ? <Lock size={17} /> : <LockOpen size={17} />} {editLocked ? "Locked" : "Lock"}
          </button>
        )}
        {canEdit && (
          <button onClick={() => addFaction()} title="Add a faction"
            style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(159,194,58,.14)",
              border: `1px solid rgba(159,194,58,.5)`, ...cut(7), color: T.accent, cursor: "pointer", padding: "9px 14px",
              fontFamily: F.body, fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
            <Plus size={17} /> Faction
          </button>
        )}
        <button onClick={centerView} title="Reset view"
          style={{ display: "flex", alignItems: "center", gap: 7, background: `${T.panel}e6`,
            border: `1px solid ${T.line}`, ...cut(7), color: T.text, cursor: "pointer", padding: "9px 14px",
            fontFamily: F.body, fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
          <Maximize2 size={17} /> Reset
        </button>
      </div>

      {/* legend — dropped on mobile: alongside the hint below, there isn't room for both
          without them colliding on a narrow phone, and the hint is the more useful one */}
      {!isMobile && (
        <div style={{ position: "absolute", right: 12, bottom: 10, zIndex: 32, padding: "10px 14px",
          pointerEvents: "none", maxWidth: 240, ...floatingPanel }}>
          <div className="stencil" style={{ fontSize: 13, letterSpacing: ".1em", color: T.mut, marginBottom: 7 }}>RELATIONS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {RELATION_TYPES.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 26, height: 0, borderTop: `${Math.max(2, r.width)}px ${r.dash ? "dashed" : "solid"} ${r.color}`, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: T.text, fontFamily: F.body, letterSpacing: ".02em" }}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* hint */}
      <div style={{ position: "absolute", left: 12, bottom: 10, zIndex: 32, pointerEvents: "none",
        padding: isMobile ? "7px 10px" : "9px 13px", fontSize: isMobile ? 11 : 13, color: T.mut,
        maxWidth: isMobile ? containerSize.w - 24 : 420, lineHeight: 1.5, ...floatingPanel }}>
        <Network size={15} style={{ color: T.accent, verticalAlign: "-2px", marginRight: 6 }} />
        {canEdit
          ? <span><b style={{ color: T.text }}>Politics</b> · drag factions to arrange · click one to edit its relations & characters · <b style={{ color: T.amber }}>zoom in</b> to reveal the characters inside each faction</span>
          : <span><b style={{ color: T.amber }}>View only</b> · click a faction for its characters & relations · <b style={{ color: T.amber }}>zoom in</b> to reveal characters · scroll to zoom, drag to pan</span>}
        {!showMembers && <span style={{ color: T.amber }}> · zoomed out</span>}
      </div>

      {/* faction editor popup */}
      {selFacObj && !selMemObj && (
        <FactionPopup
          faction={selFacObj} factions={displayFactions} relations={relations} viewer={viewer} isGM={isGM}
          pos={popupPos(w2s, containerSize, nodePos[selFacObj.id].x, nodePos[selFacObj.id].y, 320, 470)}
          containerHeight={containerSize.h} isMobile={isMobile} canEdit={canEdit} wiki={wiki}
          patchFaction={patchFaction} deleteFaction={deleteFaction} setRelation={setRelation}
          addMember={addMember} patchMember={patchMember} patchMemberTitle={patchMemberTitle} removeMember={removeMember}
          goToCodex={goToCodex} createEntry={createEntry} onClose={() => setSelFac(null)}
        />
      )}

      {/* member popup — anchored at its faction's card */}
      {selMemObj && selMemFac && (() => {
        const c = nodePos[selMemFac.id];
        return (
          <MemberPopup
            faction={selMemFac} member={selMemObj} viewer={viewer}
            pos={popupPos(w2s, containerSize, c.x, c.y, 288, 360)}
            containerHeight={containerSize.h} isMobile={isMobile} canEdit={canEdit} wiki={wiki}
            patchMember={patchMember} patchMemberTitle={patchMemberTitle} removeMember={removeMember}
            goToCodex={goToCodex} createEntry={createEntry} onClose={() => setSelMem(null)}
            agent={selMemAgent}
            canManageAgent={selMemAgent && canManageAgents ? canManageAgents(selMemFac.id) : false}
            onRequestAction={selMemAgent && goToAgentAction
              ? () => { goToAgentAction(selMemAgent.id, selMemFac.id); setSelMem(null); }
              : undefined}
          />
        );
      })()}
    </div>
  );
}
