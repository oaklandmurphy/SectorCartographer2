// The kinds of squadron mission a player can order. For now these are labels
// only; they carry no mechanical weight yet.
export const MISSION_TYPES = [
  { id: "strike_ship", label: "Strike ship" },
  { id: "strike_surface", label: "Strike surface" },
  { id: "scout", label: "Scout" },
  { id: "defend_ship", label: "Defend ship" },
  { id: "defend_surface", label: "Defend surface" },
  { id: "hunt_strike_craft", label: "Hunt strike craft" },
];

export const missionTypeLabel = (id) => (MISSION_TYPES.find((t) => t.id === id) || {}).label || "";

// Systems a fleet's squadrons can be sent to: its own system plus any system
// joined to it by a link.
export function targetableSystems(systems, links, homeSystemId) {
  if (!homeSystemId) return [];
  const ids = new Set([homeSystemId]);
  for (const l of links || []) {
    if (l.a === homeSystemId) ids.add(l.b);
    else if (l.b === homeSystemId) ids.add(l.a);
  }
  return (systems || []).filter((s) => ids.has(s.id));
}

// "Scout · Kepler Reach / Outer Belt" for a mission, or "" for an older one
// that predates targets and types.
export function missionTargetLine(m) {
  const where = m.target ? [m.target.systemName, m.target.subregionName].filter(Boolean).join(" / ") : "";
  return [missionTypeLabel(m.missionType), where].filter(Boolean).join(" · ");
}
