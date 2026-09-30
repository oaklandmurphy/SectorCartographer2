// Building a turnSnapshots entity (see sectorSchema.js) — a frozen, trimmed
// copy of the board for one turn, kept only for redrawing a read-only map
// later (TimelineView -> BoardSnapshotModal), not for editing. Trimmed to the
// fields a map actually draws so a snapshot stays small regardless of how much
// wiki/order/action history the live sector accumulates around it.
//
// Shared by App.jsx (captures the live turn as nextTurn() closes it out) and
// scripts/backfill-turn-snapshots.mjs (reconstructs past turns from a GM's
// manually exported RTDB backups) — one implementation so the two can never
// drift into different shapes.
export function captureBoardSnapshot({ turn, capturedAt, source = "live", systems, links, fleets, agents, factions, layers }) {
  const turnNum = Number(turn) || 0;
  return {
    // Deterministic, not uid() — one snapshot per turn number, always. Re-running
    // Next Turn for the same turn (a GM correcting a mistake) then just overwrites
    // this same node instead of needing the caller to look up whatever id an
    // earlier snapshot for that turn happened to get — which matters now that
    // turnSnapshots is lazy-loaded (only fetched once Timeline opens, see
    // sectorRepo.js), so the caller can't assume the full history is in memory
    // to look an existing id up from.
    id: `snap_turn_${turnNum}`,
    turn: turnNum,
    capturedAt: capturedAt || Date.now(),
    source,
    systems: (systems || []).map((s) => ({
      id: s.id, name: s.name || "", x: s.x, y: s.y, factionId: s.factionId || "fac_none",
      hasJumpGate: !!s.hasJumpGate, isPhantom: !!s.isPhantom,
    })),
    links: (links || []).map((l) => ({ id: l.id, a: l.a, b: l.b })),
    fleets: (fleets || []).map((f) => ({
      id: f.id, name: f.name || "", factionId: f.factionId, systemId: f.systemId || null,
      x: f.x, y: f.y, shipCount: (f.ships || []).length,
    })),
    agents: (agents || []).map((a) => ({
      id: a.id, factionId: a.factionId, systemId: a.systemId || null, name: a.name || "", icon: a.icon || null,
    })),
    factions: (factions || []).map((f) => ({ id: f.id, name: f.name || "", color: f.color || null })),
    layers: (layers || []).map((l) => ({ id: l.id, name: l.name || "", color: l.color || null })),
  };
}
