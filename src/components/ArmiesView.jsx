import { useEffect, useMemo, useRef, useState } from "react";
import { Swords, Anchor, Plus, X, StickyNote, Route, ChevronDown, ChevronUp, Trash2, Check, Clock, Lock, History } from "lucide-react";
import { T, F, inputStyle, selStyle, lbl, cut } from "../theme.js";
import { useConfirm } from "../hooks/useConfirm.jsx";
import Btn from "./ui/Btn.jsx";
import AutoTextarea from "./ui/AutoTextarea.jsx";
import SquadronOrderModal from "./SquadronOrderModal.jsx";
import MissionResolution from "./ui/MissionResolution.jsx";

// Every division model already fielded somewhere in the sector — feeds the model
// field's autocomplete so a type can be reused without being retyped into a
// near-duplicate (same idea as carriers.js's knownModels for squadrons).
const knownDivisionModels = (armies) => {
  const seen = new Set();
  for (const r of armies || []) for (const d of r.divisions || []) {
    const m = (d.model || "").trim();
    if (m) seen.add(m);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
};
const divisionsIn = (army) => (army.divisions || []).reduce((n, d) => n + (Number(d.count) || 0), 0);

// The army selector up top: the same custom dropdown FleetView uses (faction
// stripe over a name and a meta line), since a native <select> can't do either.
function ArmyPicker({ armies, value, onChange, factionById, systems, isMobile, viewerFactionId, canEdit }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const selected = armies.find((r) => r.id === value) || null;
  const minWidth = isMobile ? 150 : 200;
  const metaFor = (r) => {
    const fac = factionById(r.factionId) || {};
    const home = r.systemId ? systems.find((s) => s.id === r.systemId) : null;
    const reveal = canEdit || r.factionId === viewerFactionId;
    return `${fac.name || "No faction"}${reveal ? ` · ${divisionsIn(r)} div` : ""} · ${home ? home.name : "Unplaced"}`;
  };
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button type="button" disabled={armies.length === 0} onClick={() => setOpen((o) => !o)}
        style={{ ...selStyle, width: "auto", minWidth, display: "flex", alignItems: "center", gap: 7,
          opacity: armies.length === 0 ? 0.5 : 1, cursor: armies.length === 0 ? "default" : "pointer" }}>
        {selected ? (
          <>
            <span style={{ width: 9, height: 9, flexShrink: 0, ...cut(2), background: (factionById(selected.factionId) || {}).color }} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: T.text }}>
              {selected.name || "Unnamed army"}
            </span>
          </>
        ) : (
          <span style={{ flex: 1, minWidth: 0, color: T.faint }}>No armies</span>
        )}
        {open ? <ChevronUp size={13} style={{ flexShrink: 0, color: T.faint }} />
          : <ChevronDown size={13} style={{ flexShrink: 0, color: T.faint }} />}
      </button>
      {open && (
        <div className="scroll" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 60,
          width: "max-content", minWidth, maxWidth: isMobile ? 260 : 340, maxHeight: 320, overflowY: "auto",
          background: T.panel, border: `1px solid ${T.line}`, borderRadius: 2,
          boxShadow: "0 14px 30px rgba(0,0,0,.6)", padding: 4, display: "flex", flexDirection: "column", gap: 2 }}>
          {armies.map((r) => {
            const on = r.id === value;
            const fac = factionById(r.factionId) || {};
            return (
              <button key={r.id} type="button" onClick={() => { onChange(r.id); setOpen(false); }}
                style={{ display: "flex", alignItems: "stretch", gap: 8, width: "100%", textAlign: "left",
                  background: on ? "rgba(159,194,58,.14)" : "transparent",
                  border: `1px solid ${on ? T.accent : "transparent"}`, borderRadius: 2, padding: "5px 7px", cursor: "pointer" }}>
                <span style={{ width: 4, minHeight: 24, background: fac.color, flexShrink: 0, borderRadius: 1 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: T.text,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name || "Unnamed army"}</span>
                  <span className="mono" style={{ display: "block", fontSize: 10, color: T.faint, marginTop: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{metaFor(r)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Who commands what on the ground: one army at a time, with its divisions laid
// out below its header. Mirrors FleetView (picker bar, header with rename and
// order buttons, a roster of assigned units) — an army's divisions are what a
// carrier's squadrons are. The GM creates armies and assigns divisions; the
// owning faction's players rename theirs, send it Army orders (the ground twin
// of a squadron order: commit divisions to a free-text order the GM resolves on
// the mission odds table) and plot move orders on the map.
//
// Like FleetView, the pane renderers are plain functions returning JSX (called,
// not mounted as <Components>) so typing in an input never remounts the subtree.
export default function ArmiesView({
  armies, systems, canEdit, isMobile, factionById, factions = [],
  armyId, setArmyId,
  addArmy, patchArmy, renameArmy, removeArmy,
  addDivision, patchDivision, removeDivision,
  canOrderFor, onOrderArmyMove, orders = [], viewerFactionId = null,
  missions = [], archivedMissions = [], submitArmyMission, loadOlderArchiveTurn, canLoadOlderArchive,
}) {
  const confirm = useConfirm();
  const [orderArmyId, setOrderArmyId] = useState(null); // army whose Army-order composer is open
  const [historyOpen, setHistoryOpen] = useState({}); // per army: past orders revealed
  const orderArmy = armies.find((r) => r.id === orderArmyId) || null;
  const [newFactionId, setNewFactionId] = useState("");
  const models = useMemo(() => knownDivisionModels(armies), [armies]);
  const MODELS_ID = "armiesview-models";
  const army = armies.find((r) => r.id === armyId) || armies[0] || null;

  // The first faction is a sensible default for "Add army" until the GM picks one.
  const addFactionId = factions.some((f) => f.id === newFactionId) ? newFactionId : (factions[0] && factions[0].id) || "";

  const header = (r) => {
    const fac = factionById(r.factionId) || {};
    const home = r.systemId ? systems.find((s) => s.id === r.systemId) : null;
    const canGiveOrder = !!canOrderFor && canOrderFor(r.factionId);
    const reveal = canEdit || r.factionId === viewerFactionId;
    const n = (r.divisions || []).length;
    return (
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.line}`, background: T.panel,
        flexShrink: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, background: fac.color, flexShrink: 0, ...cut(2) }} />
          {(canEdit || canGiveOrder) ? (
            <input value={r.name} onChange={(e) => renameArmy(r.id, e.target.value)} placeholder="Unnamed army"
              className="stencil" style={{ ...inputStyle, flex: "0 1 auto", minWidth: 80, maxWidth: 240,
                fontSize: 17, fontWeight: 800, letterSpacing: ".04em", padding: "3px 6px" }} />
          ) : (
            <span className="stencil" style={{ fontSize: 17, fontWeight: 800, letterSpacing: ".04em", color: T.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name || "Unnamed army"}</span>
          )}
          {canGiveOrder && (
            <Btn kind="primary" onClick={() => setOrderArmyId(r.id)} disabled={divisionsIn(r) === 0}
              title={divisionsIn(r) === 0 ? "No divisions available in this army" : "Send divisions on an order"}
              style={{ marginLeft: "auto", flexShrink: 0 }}>
              <Swords size={12} /> {!isMobile && "Army order"}
            </Btn>
          )}
          {canGiveOrder && (
            <Btn onClick={() => onOrderArmyMove(r.id)} disabled={!r.systemId}
              title={r.systemId ? "Jump to the map, zoomed in on this army, ready to plot its move order"
                : "This army has no location to move from yet"}
              style={{ flexShrink: 0 }}>
              <Route size={12} /> {!isMobile && "Move"}
            </Btn>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 10.5, color: T.mut }}>
          {canEdit ? (
            <select value={r.factionId || ""} title="Change this army's allegiance"
              onChange={(e) => patchArmy(r.id, { factionId: e.target.value })}
              style={{ ...selStyle, width: "auto", padding: "2px 5px", fontSize: 10.5 }}>
              {factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          ) : (
            <span>{fac.name}</span>
          )}
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Anchor size={11} style={{ color: T.faint }} />
            {canEdit ? (
              <select value={r.systemId || ""} title="Where this army is stationed"
                onChange={(e) => patchArmy(r.id, { systemId: e.target.value || null })}
                style={{ ...selStyle, width: "auto", padding: "2px 5px", fontSize: 10.5 }}>
                <option value="">Unplaced</option>
                {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (home ? home.name : "Unplaced")}
          </span>
          {reveal && (
            <span className="mono" style={{ color: T.faint }}>
              {divisionsIn(r)} division{divisionsIn(r) === 1 ? "" : "s"} · {n} formation{n === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
    );
  };

  // One row of the roster: a count of one division type, the ground twin of a
  // squadron. Only the GM edits these; the owner reads them.
  const divisionRow = (r, d) => (
    <div key={d.id} style={{ display: "flex", gap: 6, alignItems: "center", background: T.panel2,
      border: `1px solid ${T.line}`, borderRadius: 2, padding: 8 }}>
      {canEdit ? (
        <>
          <input className="mono" type="number" min="0" step="1" value={d.count}
            onChange={(e) => patchDivision(r.id, d.id, { count: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            style={{ ...inputStyle, padding: "3px 4px", width: 56, textAlign: "right" }} />
          <span style={{ color: T.faint, fontSize: 11, flexShrink: 0 }}>×</span>
          <input className="mono" list={MODELS_ID} value={d.model || ""} placeholder="division type"
            onChange={(e) => patchDivision(r.id, d.id, { model: e.target.value })}
            style={{ ...inputStyle, padding: "3px 6px", flex: 1, minWidth: 0 }} />
          <button onClick={() => removeDivision(r.id, d.id)} title="Remove division"
            style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: 2, flexShrink: 0 }}>
            <X size={13} />
          </button>
        </>
      ) : (
        <div className="mono" style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: 13, minWidth: 0 }}>
          <span style={{ color: T.accent, fontWeight: 700, minWidth: 30, textAlign: "right" }}>{Number(d.count) || 0}</span>
          <span style={{ color: T.faint }}>×</span>
          <span style={{ color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d.model || <span style={{ color: T.faint, fontStyle: "italic" }}>unnamed division</span>}
          </span>
        </div>
      )}
    </div>
  );

  // The army's own standing order, if its faction has filed one: route and
  // notes, and whether it's been submitted as ready or is still a draft.
  const orderCard = (r) => {
    const o = orders.find((x) => x.pieceType === "army" && x.pieceId === r.id && !x.suggestion);
    if (!o || !o.path || o.path.length === 0) return null;
    const nameOf = (id) => (systems.find((s) => s.id === id) || {}).name || "?";
    const route = [r.systemId ? nameOf(r.systemId) : "—", ...o.path.map(nameOf)].join(" → ");
    return (
      <div style={{ border: `1px solid ${o.committed ? T.accent : T.line}`, borderRadius: 2, background: T.panel2,
        padding: 9, display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}><Route size={11} /> Army order</span>
        <div className="mono" style={{ fontSize: 12, color: T.text }}>{route}</div>
        {o.notes && <div style={{ fontSize: 12, color: T.mut, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{o.notes}</div>}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 700,
          letterSpacing: ".06em", textTransform: "uppercase", color: o.committed ? T.accent : T.amber }}>
          {o.committed ? <><Check size={11} /> Submitted</> : "Draft"}
        </span>
      </div>
    );
  };

  /* ------------------------------------------------ one army order (a squadron-mission twin) */
  const detachmentSummary = (m) => (m.detachments || [])
    .map((d) => `${d.count}×${d.model || "unnamed"}`).join(", ");
  const missionCard = (m) => {
    const resolved = m.status === "resolved";
    return (
      <div key={m.id} style={{ border: `1px solid ${resolved ? T.line : T.accent}`, borderRadius: 2,
        background: T.panel2, display: "flex", flexDirection: "column", gap: 7, padding: 9 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 700,
            letterSpacing: ".06em", textTransform: "uppercase", color: resolved ? T.accent : T.amber }}>
            {resolved ? <Check size={11} /> : <Clock size={11} />}{resolved ? "Resolved" : "Under orders"}
          </span>
          <span className="mono" style={{ fontSize: 10.5, color: T.mut }}>{detachmentSummary(m)}</span>
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 14, lineHeight: 1.65, color: T.text, whiteSpace: "pre-wrap",
          borderLeft: `2px solid ${T.accent}`, paddingLeft: 12 }}>{m.text}</div>
        {resolved && (
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>
            {m.resolution
              ? <MissionResolution resolution={m.resolution} />
              : <div style={{ fontSize: 11.5, color: T.mut }}>Resolved (no ruling recorded).</div>}
          </div>
        )}
      </div>
    );
  };
  const ordersSection = (r) => {
    const own = missions.filter((m) => m.armyId === r.id);
    const pending = own.filter((m) => m.status !== "resolved").sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const resolved = own.filter((m) => m.status === "resolved").sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0));
    const past = archivedMissions.filter((m) => m.armyId === r.id).sort((a, b) => (b.turnEndedAt || 0) - (a.turnEndedAt || 0));
    if (own.length === 0 && past.length === 0 && !canLoadOlderArchive) return null;
    const open = !!historyOpen[r.id];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8, marginTop: 2, borderTop: `1px solid ${T.line}` }}>
        <span style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}><Swords size={11} /> Army orders</span>
        {pending.map(missionCard)}
        {resolved.map(missionCard)}
        {(past.length > 0 || canLoadOlderArchive) && (
          <>
            <Btn onClick={() => setHistoryOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}
              title={open ? "Hide previous turns' orders" : "See this army's orders from previous turns"}
              style={{ justifyContent: "center", marginTop: 2 }}>
              <History size={13} /> {open ? "Hide" : "Show"} past orders{past.length > 0 ? ` (${past.length})` : ""}
              {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </Btn>
            {open && past.map(missionCard)}
            {open && loadOlderArchiveTurn && canLoadOlderArchive && (
              <Btn onClick={loadOlderArchiveTurn} style={{ justifyContent: "center" }}>+ Load an earlier turn</Btn>
            )}
          </>
        )}
      </div>
    );
  };

  const pane = (r) => {
    const reveal = canEdit || r.factionId === viewerFactionId;
    return (
      <div style={{ flex: 1, minWidth: 0, minHeight: isMobile ? "auto" : 0, display: "flex", flexDirection: "column" }}>
        {header(r)}
        <div className={isMobile ? "" : "scroll"}
          style={{ flex: 1, minHeight: 0, overflowY: isMobile ? "visible" : "auto", padding: 10,
            display: "flex", flexDirection: "column", gap: 8 }}>
          {reveal ? (
            <>
              {(r.divisions || []).length === 0 && (
                <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
                  border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
                  No divisions assigned to this army.{canEdit ? " Add one below." : ""}
                </div>
              )}
              {(r.divisions || []).map((d) => divisionRow(r, d))}
              {canEdit && (
                <Btn kind="primary" onClick={() => addDivision(r.id)} style={{ justifyContent: "center" }}>
                  <Plus size={14} /> Add division
                </Btn>
              )}
            </>
          ) : (
            <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
              border: `1px dashed ${T.line}`, lineHeight: 1.6, display: "flex", alignItems: "center",
              justifyContent: "center", gap: 6 }}>
              <Lock size={12} /> This army's divisions are known only to its own faction.
            </div>
          )}
          {orderCard(r)}
          {ordersSection(r)}
          {(canEdit || r.notes) && reveal && (
            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <StickyNote size={11} style={{ color: T.faint, flexShrink: 0 }} />
                <span style={lbl}>Notes</span>
              </div>
              {canEdit ? (
                <AutoTextarea value={r.notes || ""} placeholder="Track anything about this army…"
                  onChange={(e) => patchArmy(r.id, { notes: e.target.value })} rows={2}
                  style={{ ...inputStyle, padding: "5px 8px", resize: "vertical", minHeight: 44, lineHeight: 1.5 }} />
              ) : (
                <div style={{ fontSize: 12, color: T.mut, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{r.notes}</div>
              )}
            </div>
          )}
          {canEdit && (
            <Btn kind="danger" style={{ alignSelf: "flex-start" }}
              onClick={async () => { if (await confirm("Remove this army?")) removeArmy(r.id); }}>
              <Trash2 size={13} /> Remove army
            </Btn>
          )}
        </div>
      </div>
    );
  };

  const bar = (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "8px 10px",
      background: `linear-gradient(180deg, ${T.panel}, ${T.panel2})`, borderBottom: `2px solid ${T.line}`, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Swords size={14} style={{ color: T.accent, flexShrink: 0 }} />
        <span style={lbl}>Army</span>
        <ArmyPicker armies={armies} value={army ? army.id : null} onChange={setArmyId}
          factionById={factionById} systems={systems} isMobile={isMobile}
          viewerFactionId={viewerFactionId} canEdit={canEdit} />
      </div>
      {canEdit && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <select value={addFactionId} onChange={(e) => setNewFactionId(e.target.value)}
            style={{ ...selStyle, width: "auto", padding: "4px 6px", fontSize: 11.5 }}>
            {factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <Btn kind="primary" disabled={!addFactionId}
            onClick={() => { const id = addArmy(addFactionId); if (id) setArmyId(id); }}>
            <Plus size={13} /> New army
          </Btn>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
      <datalist id={MODELS_ID}>
        {models.map((m) => <option key={m} value={m} />)}
      </datalist>
      {bar}
      {orderArmy && (
        <SquadronOrderModal army={orderArmy} isMobile={isMobile}
          onClose={() => setOrderArmyId(null)}
          onSubmit={(detachments, text) => { submitArmyMission(orderArmy.id, detachments, text); setOrderArmyId(null); }} />
      )}
      {!army ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 12, color: T.faint, padding: 24, textAlign: "center" }}>
          <Swords size={40} strokeWidth={1.2} />
          <div className="stencil" style={{ fontSize: 15, letterSpacing: ".06em", color: T.mut }}>NO ARMIES</div>
          <div style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 320 }}>
            This sector has no armies{canEdit ? " — add one from the bar above." : " visible to you."}
          </div>
        </div>
      ) : (
        <div className={isMobile ? "scroll" : ""}
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: isMobile ? "auto" : "hidden" }}>
          {pane(army)}
        </div>
      )}
    </div>
  );
}
