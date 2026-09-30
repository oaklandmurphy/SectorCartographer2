import { Star, Plus, Trash2, X, Rocket, Zap, Fuel, Ghost, PieChart } from "lucide-react";
import { T, inputStyle, selStyle, lbl } from "../theme.js";
import { ICONS, ICON_KEYS } from "../constants.js";
import { useConfirm } from "../hooks/useConfirm.jsx";
import Btn from "./ui/Btn.jsx";
import MapPopup from "./ui/MapPopup.jsx";
import CodexLink from "./CodexLink.jsx";
import { subregionCount, MAX_SUBREGIONS } from "../lib/subregions.js";

export default function SystemPopup({
  system, anchor, containerSize, isMobile, canEdit, isGM, factions, layers, factionById, layerById,
  patchSystem, addMarker, patchMarker, removeMarker, deployFleetAt, deleteSystem, onClose,
  wiki, goToCodex, createEntry,
}) {
  const confirm = useConfirm();
  return (
    <MapPopup anchor={anchor} containerSize={containerSize} isMobile={isMobile} width={300}
      color={factionById(system.factionId).color} icon={<Star size={13} />}
      title="STAR SYSTEM" onClose={onClose}>
        <div>
          <div style={lbl}>Name</div>
          <input style={{ ...inputStyle, marginTop: 4 }} value={system.name} disabled={!canEdit}
            onChange={(e) => patchSystem(system.id, { name: e.target.value })} />
        </div>
        <div>
          <div style={lbl}>Affiliation</div>
          <select style={{ ...selStyle, marginTop: 4 }} value={system.factionId} disabled={!canEdit}
            onChange={(e) => patchSystem(system.id, { factionId: e.target.value })}>
            {factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        {canEdit && (
          <div title={`Pie-slice subregions around the main node, named ${system.name}-1, ${system.name}-2... Visible when zoomed in close.`}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <PieChart size={13} color={subregionCount(system) > 0 ? T.accent : T.faint} />
              <span style={lbl}>Subregions</span>
              <input type="number" min={0} max={MAX_SUBREGIONS} value={subregionCount(system)}
                onChange={(e) => patchSystem(system.id, { subregions: Math.max(0, Math.min(MAX_SUBREGIONS, Math.floor(Number(e.target.value) || 0))) })}
                style={{ ...inputStyle, width: 52, padding: "3px 4px", textAlign: "center", marginLeft: "auto" }} />
            </div>
            <div style={{ fontSize: 10, color: T.faint, marginTop: 3 }}>
              {system.name}-main{subregionCount(system) > 0 ? `, ${system.name}-1${subregionCount(system) > 1 ? ` to ${system.name}-${subregionCount(system)}` : ""}` : ""}
            </div>
          </div>
        )}
        {isGM && (
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 7,
              cursor: canEdit ? "pointer" : "default" }}>
              <input type="checkbox" checked={!!system.hasJumpGate} disabled={!canEdit}
                onChange={(e) => patchSystem(system.id, { hasJumpGate: e.target.checked })} />
              <Zap size={13} color={system.hasJumpGate ? T.accent : T.faint} />
              <span style={lbl}>Jump gate</span>
            </label>
          </div>
        )}
        {isGM && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7,
                cursor: canEdit ? "pointer" : "default" }}
                title="Runs the Ossite Surplus check each turn — see GM Tools → End of Turn Checks">
                <input type="checkbox" checked={!!system.hasOssite} disabled={!canEdit}
                  onChange={(e) => patchSystem(system.id, { hasOssite: e.target.checked })} />
                <Fuel size={13} color={system.hasOssite ? T.accent : T.faint} />
                <span style={lbl}>Ossite deposit</span>
              </label>
              {system.hasOssite && (
                <label style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto" }}
                  title="Roll needed on 2d6 for this system's Ossite Surplus check to pass (2-12)">
                  <span style={{ ...lbl, whiteSpace: "nowrap" }}>Target</span>
                  <input type="number" min={2} max={12} value={system.ossiteTarget != null ? system.ossiteTarget : 8}
                    disabled={!canEdit}
                    onChange={(e) => patchSystem(system.id, { ossiteTarget: e.target.value === "" ? "" : Number(e.target.value) })}
                    style={{ ...inputStyle, width: 44, padding: "3px 4px", textAlign: "center" }} />
                </label>
              )}
            </div>
          </div>
        )}
        {isGM && (
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 7,
              cursor: canEdit ? "pointer" : "default" }}
              title="Only ever shows up for a player on a 1-in-50 roll at page load, and quietly vanishes for their session the moment they click it.">
              <input type="checkbox" checked={!!system.isPhantom} disabled={!canEdit}
                onChange={(e) => patchSystem(system.id, { isPhantom: e.target.checked })} />
              <Ghost size={13} color={system.isPhantom ? T.accent : T.faint} />
              <span style={lbl}>Phantom system (GM decoy)</span>
            </label>
          </div>
        )}
        <CodexLink wiki={wiki} value={system.wikiId} canEdit={canEdit}
          onChange={(id) => patchSystem(system.id, { wikiId: id })}
          onNavigate={goToCodex} onCreate={createEntry}
          createTitle={system.name} createCategory="locations" />
        <div>
          <div style={{ ...lbl, marginBottom: 5, display: "flex", justifyContent: "space-between" }}>
            <span>Status markers</span><span style={{ color: T.faint }}>{system.markers.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {system.markers.map((m) => {
              const L = layerById(m.layerId); const Ic = ICONS[m.iconKey] || Star;
              return (
                <div key={m.id} style={{ display: "flex", gap: 5, alignItems: "center",
                  background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 2, padding: 5 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 2, flexShrink: 0, display: "flex",
                    alignItems: "center", justifyContent: "center", color: L ? L.color : T.mut,
                    background: T.ink, border: `1px solid ${L ? L.color : T.line}` }}>
                    <Ic size={13} />
                  </div>
                  <input value={m.label} disabled={!canEdit} onChange={(e) => patchMarker(system.id, m.id, { label: e.target.value })}
                    style={{ ...inputStyle, padding: "3px 6px", flex: 1 }} />
                  <select value={m.iconKey} disabled={!canEdit} onChange={(e) => patchMarker(system.id, m.id, { iconKey: e.target.value })}
                    style={{ ...selStyle, padding: "3px 4px", width: 66 }}>
                    {ICON_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <select value={m.layerId} disabled={!canEdit} onChange={(e) => patchMarker(system.id, m.id, { layerId: e.target.value })}
                    style={{ ...selStyle, padding: "3px 4px", width: 74 }}>
                    {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  {canEdit && (
                    <button onClick={() => removeMarker(system.id, m.id)} title="Remove marker"
                      style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: 2 }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {canEdit && (
            <Btn kind="primary" onClick={() => addMarker(system.id, layers[0].id)}
              style={{ marginTop: 7, width: "100%", justifyContent: "center" }}>
              <Plus size={14} /> Add marker
            </Btn>
          )}
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 7 }}>
            <Btn onClick={() => deployFleetAt(system.id)} style={{ flex: 1, justifyContent: "center" }}>
              <Rocket size={14} /> Deploy fleet
            </Btn>
            <Btn kind="danger" title="Delete system"
              onClick={async () => { if (await confirm(`Delete system "${system.name}"? This cannot be undone.`)) deleteSystem(system.id); }}>
              <Trash2 size={14} />
            </Btn>
          </div>
        )}
    </MapPopup>
  );
}
