import { Swords, MapPin, Trash2, ExternalLink, Route } from "lucide-react";
import { T, inputStyle, selStyle, lbl } from "../theme.js";
import { useConfirm } from "../hooks/useConfirm.jsx";
import Btn from "./ui/Btn.jsx";
import MapPopup from "./ui/MapPopup.jsx";

// The map's popup for an army, anchored beside its marker. Renaming is open to
// the owning faction's players (`canRename`, same gate as renaming a fleet);
// location and removal are GM-only (`canEdit`) since the GM owns the roster
// and places pieces. Divisions are listed read-only here — they're edited in
// the Armies tab — and only for the owner and GM (`showDivisions`), the same
// "composition is private intel" rule a fleet's roster follows.
export default function ArmyPopup({
  army, faction, anchor, containerSize, isMobile, canRename, canEdit, showDivisions,
  systems, patchArmy, renameArmy, removeArmy, onOpenArmy, onOrderMove, onClose,
}) {
  const confirm = useConfirm();
  const systemName = (id) => (systems.find((s) => s.id === id) || {}).name || "";
  const divisions = army.divisions || [];
  return (
    <MapPopup anchor={anchor} containerSize={containerSize} isMobile={isMobile} width={288} gap={10}
      color={faction ? faction.color : T.accent} icon={<Swords size={13} />} title="ARMY" onClose={onClose}>
      <div>
        <div style={{ ...lbl, marginBottom: 4 }}>Name</div>
        {canRename ? (
          <input style={inputStyle} value={army.name || ""} placeholder="Unnamed army"
            onChange={(e) => renameArmy(army.id, e.target.value)} />
        ) : (
          <div style={{ fontSize: 12.5, color: T.text }}>{army.name || "Unnamed army"}</div>
        )}
        {faction && <div style={{ fontSize: 10.5, color: T.mut, marginTop: 3 }}>{faction.name}</div>}
      </div>

      <div>
        <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
          <MapPin size={12} /> Location
        </div>
        {canEdit ? (
          <select style={selStyle} value={army.systemId || ""}
            onChange={(e) => { if (e.target.value) patchArmy(army.id, { systemId: e.target.value }); }}>
            {!army.systemId && <option value="" disabled hidden>Unplaced — select a system</option>}
            {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : (
          <div style={{ fontSize: 12.5, color: T.text }}>{army.systemId ? systemName(army.systemId) : "Unplaced"}</div>
        )}
      </div>

      {showDivisions && (
        <div>
          <div style={{ ...lbl, marginBottom: 4 }}>Divisions</div>
          {divisions.length === 0 ? (
            <div style={{ fontSize: 11.5, color: T.faint, fontStyle: "italic" }}>No divisions assigned</div>
          ) : divisions.map((d) => (
            <div key={d.id} className="mono" style={{ fontSize: 12, color: T.text }}>
              <span style={{ color: T.accent, fontWeight: 700 }}>{Number(d.count) || 0}</span>
              <span style={{ color: T.faint }}> × </span>{d.model || "unnamed division"}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Btn onClick={onOpenArmy} title="Open this army in the Armies tab">
          <ExternalLink size={13} /> Armies tab
        </Btn>
        {canRename && (
          <Btn kind="primary" onClick={onOrderMove} title="Plot this army's move order on the map (send Army orders from the Armies tab)">
            <Route size={13} /> Move order
          </Btn>
        )}
      </div>

      {canEdit && (
        <Btn kind="danger" style={{ alignSelf: "flex-start" }}
          onClick={async () => { if (await confirm("Remove this army?")) { removeArmy(army.id); onClose(); } }}>
          <Trash2 size={13} /> Remove army
        </Btn>
      )}
    </MapPopup>
  );
}
