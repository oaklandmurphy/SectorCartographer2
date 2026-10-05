import { useMemo } from "react";
import { X, Rocket, Swords, Send, TriangleAlert } from "lucide-react";
import { T, F, panelStyle, inputStyle, selStyle, lbl, cut } from "../theme.js";
import { squadronsOf } from "../lib/carriers.js";
import { ARMY_ORDER_CATEGORIES } from "../lib/armyOrderCategories.js";
import { useDraft } from "../hooks/useDraft.js";
import Btn from "./ui/Btn.jsx";
import AutoTextarea from "./ui/AutoTextarea.jsx";

// The player-side composer for a squadron mission: pick any combination of
// fighters/bombers across every carrier in one fleet — whole squadrons or part
// of one — write what they're being sent to do, and submit. Committed craft
// come straight out of their squadrons' counts the moment this submits (see
// App.jsx submitMission), which is what makes them unavailable for a second
// mission until this one is resolved or withdrawn.
//
// The same composer serves Army orders: pass `army` instead of `fleet` and the
// rows become that army's divisions (an army has no carriers, so each row is
// just a division type), with the wording to match.
export default function SquadronOrderModal({ fleet, army, isMobile, onClose, onSubmit }) {
  const unit = army || fleet;
  const isArmy = !!army;
  const Icon = isArmy ? Swords : Rocket;
  const noun = isArmy ? "division" : "craft";
  // Kept in localStorage (keyed per fleet) so a half-written order survives
  // closing this modal to check something else, or FleetView unmounting
  // entirely from a tab switch — cleared only once the order actually submits.
  const [draft, setDraft, clearDraft] = useDraft(`galaxy-sector-draft-${isArmy ? "army" : "squadron"}-order:${unit.id}:v1`, { counts: {}, text: "", category: "" });
  const counts = draft.counts; // squadronId -> typed text
  const text = draft.text;
  const setCounts = (next) => setDraft((d) => ({ ...d, counts: typeof next === "function" ? next(d.counts) : next }));
  const setText = (v) => setDraft((d) => ({ ...d, text: v }));
  // Army orders must be filed under a category; squadron orders have none.
  const category = ARMY_ORDER_CATEGORIES.some((c) => c.id === draft.category) ? draft.category : "";
  const setCategory = (v) => setDraft((d) => ({ ...d, category: v }));

  // Every squadron across the fleet's carriers that has craft available right
  // now — one with nothing left in it (already fully committed elsewhere) has
  // nothing to offer this mission, so it's left off the list entirely.
  const rows = useMemo(() => {
    const out = [];
    if (isArmy) {
      for (const d of army.divisions || []) {
        const avail = Number(d.count) || 0;
        if (avail > 0) out.push({ shipId: army.id, shipName: army.name, squadronId: d.id, model: d.model, avail });
      }
      return out;
    }
    for (const sh of fleet.ships || []) {
      for (const sq of squadronsOf(sh)) {
        const avail = Number(sq.count) || 0;
        if (avail > 0) out.push({ shipId: sh.id, shipName: sh.name, squadronId: sq.id, model: sq.model, avail });
      }
    }
    return out;
  }, [fleet, army]);

  const commitFor = (row) => Math.min(row.avail, Math.max(0, Math.floor(Number(counts[row.squadronId]) || 0)));
  const total = rows.reduce((n, r) => n + commitFor(r), 0);
  const ready = !!text.trim() && total > 0 && (!isArmy || !!category);

  const setCount = (squadronId, v) => setCounts((c) => ({ ...c, [squadronId]: v }));
  const setAll = (row) => setCount(row.squadronId, String(row.avail));
  const setNone = (row) => setCount(row.squadronId, "0");

  const submit = () => {
    if (!ready) return;
    const detachments = rows
      .map((r) => ({ shipId: r.shipId, squadronId: r.squadronId, model: r.model, count: commitFor(r) }))
      .filter((d) => d.count > 0);
    onSubmit(detachments, text, isArmy ? { category } : undefined);
    clearDraft();
  };

  return (
    <div onPointerDown={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(6,5,3,.72)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onPointerDown={(e) => e.stopPropagation()}
        style={{ ...panelStyle, ...cut(10), width: "100%", maxWidth: 560, maxHeight: "88vh",
          display: "flex", flexDirection: "column", background: T.panel }}>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px",
          borderBottom: `2px solid ${T.line}`, flexShrink: 0 }}>
          <Icon size={16} color={T.accent} />
          <div className="stencil" style={{ fontSize: 15, letterSpacing: ".05em", color: T.text, flex: 1, minWidth: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {isArmy ? "Army order" : "Squadron order"} — {unit.name}
          </div>
          <button onClick={onClose} title="Cancel"
            style={{ background: "none", border: "none", color: T.faint, cursor: "pointer", padding: 2 }}>
            <X size={16} />
          </button>
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 12 : 16,
          display: "flex", flexDirection: "column", gap: 12 }}>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={lbl}>{isArmy ? "Divisions to commit" : "Craft to commit"}</span>
            {rows.length === 0 && (
              <div style={{ fontSize: 11.5, color: T.faint, padding: "10px 0" }}>
                {isArmy
                  ? "No divisions available in this army — every division is already committed to an order."
                  : "No craft available in this fleet's hangars — every squadron is empty or already on a mission."}
              </div>
            )}
            {rows.map((r) => {
              const committed = commitFor(r);
              return (
                <div key={r.squadronId} style={{ display: "flex", alignItems: "center", gap: 8,
                  border: `1px solid ${committed > 0 ? T.accent : T.line}`, borderRadius: 2,
                  background: committed > 0 ? "rgba(159,194,58,.1)" : T.panel2, padding: "6px 9px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap" }}>
                      {r.model || <span style={{ color: T.faint, fontStyle: "italic" }}>{isArmy ? "unnamed division" : "unnamed model"}</span>}
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: T.faint }}>
                      {r.shipName} · {r.avail} available
                    </div>
                  </div>
                  <button onClick={() => setNone(r)} title="Commit none"
                    style={{ background: "none", border: `1px solid ${T.line}`, borderRadius: 2, color: T.faint,
                      cursor: "pointer", fontSize: 10, padding: "3px 6px" }}>None</button>
                  <input className="mono" type="number" min="0" max={r.avail} step="1"
                    value={counts[r.squadronId] ?? ""} placeholder="0"
                    onChange={(e) => setCount(r.squadronId, e.target.value)}
                    style={{ ...inputStyle, width: 60, textAlign: "right", padding: "4px 6px" }} />
                  <button onClick={() => setAll(r)} title="Commit all"
                    style={{ background: "none", border: `1px solid ${T.line}`, borderRadius: 2, color: T.faint,
                      cursor: "pointer", fontSize: 10, padding: "3px 6px" }}>All</button>
                </div>
              );
            })}
          </div>

          {isArmy && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={lbl}>Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={selStyle}>
                <option value="">Select category…</option>
                {ARMY_ORDER_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={lbl}>Mission</span>
            <AutoTextarea value={text} onChange={(e) => setText(e.target.value)} autoFocus
              placeholder={isArmy ? "Describe what this army order should attempt…" : "Describe what this squadron order should attempt…"}
              style={{ ...inputStyle, minHeight: 80, resize: "vertical",
                fontFamily: F.mono,
                fontSize: 14, lineHeight: 1.65, padding: 10 }} />
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, border: `1px solid ${T.amber}`,
            borderRadius: 2, background: "rgba(217,143,43,.1)", padding: "8px 10px" }}>
            <TriangleAlert size={14} style={{ color: T.amber, flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 11.5, color: T.mut, lineHeight: 1.5 }}>
              Once submitted, this order is locked in — you won't be able to cancel it or get the
              committed {noun === "craft" ? "craft" : "divisions"} back until the GM resolves the mission.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
          borderTop: `2px solid ${T.line}`, flexShrink: 0 }}>
          <span className="mono" style={{ fontSize: 11.5, color: total > 0 ? T.accent : T.faint }}>
            {total} {noun}{isArmy && total !== 1 ? "s" : ""} committed
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn kind="primary" onClick={submit} disabled={!ready}
              title={total === 0 ? `Commit at least one ${noun}` : isArmy && !category ? "Choose a category" : !text.trim() ? "Describe the mission first" : "Send this order to the GM"}>
              <Send size={13} /> Submit
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
