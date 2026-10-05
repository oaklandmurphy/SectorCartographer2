// Fleet composition model.
//
// A fleet's `ships` are all carriers — the only vessels tracked by name. The
// craft they fight with are tracked in bulk as squadrons in the carrier's
// hangar: a count of one model, e.g. 24 x "v1_fighters", 13 x "b4_bombers".
//
// Carriers saved before the hangar existed have no `squadrons` field at all, so
// every read goes through squadronsOf rather than touching `.squadrons` direct.
export const squadronsOf = (carrier) => (carrier && carrier.squadrons) || [];

// Counts are user-typed, so treat anything non-numeric as zero rather than
// letting a stray NaN poison a fleet-wide total.
export const craftInCarrier = (carrier) =>
  squadronsOf(carrier).reduce((n, sq) => n + (Number(sq.count) || 0), 0);

export const craftInFleet = (fleet) =>
  ((fleet && fleet.ships) || []).reduce((n, c) => n + craftInCarrier(c), 0);

// Rewrite one carrier's squadron list, returning a new fleet array. fleet ->
// carrier -> squadron is deep enough that every add/patch/remove would otherwise
// repeat this same three-level map; untouched fleets and carriers keep their
// identity so React skips re-rendering them.
export function withSquadrons(fleets, fleetId, shipId, fn) {
  return fleets.map((f) => (f.id !== fleetId ? f : {
    ...f,
    ships: f.ships.map((s) => (s.id !== shipId ? s : { ...s, squadrons: fn(squadronsOf(s)) })),
  }));
}

// Distinct squadron model names already flying somewhere in the sector. Feeds
// the model field's autocomplete so a model can be reused without being retyped
// — and, more to the point, without being mistyped into a near-duplicate.
export function knownModels(fleets) {
  const seen = new Set();
  for (const f of fleets || []) {
    for (const c of f.ships || []) {
      for (const sq of squadronsOf(c)) {
        const m = (sq.model || "").trim();
        if (m) seen.add(m);
      }
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

// Commit craft to a squadron mission: decrement each named squadron by its
// detachment's count. Counts are clamped to what was available when the
// mission was built (see App.jsx submitMission), so this never goes negative.
export function commitDetachments(fleets, fleetId, detachments) {
  return fleets.map((f) => (f.id !== fleetId ? f : {
    ...f,
    ships: f.ships.map((s) => {
      const dets = detachments.filter((d) => d.shipId === s.id);
      if (dets.length === 0) return s;
      return { ...s, squadrons: squadronsOf(s).map((sq) => {
        const d = dets.find((x) => x.squadronId === sq.id);
        return d ? { ...sq, count: Math.max(0, (Number(sq.count) || 0) - d.count) } : sq;
      }) };
    }),
  }));
}

// Return craft from a mission — either survivors after a resolved strike, or
// the full detachment if the request is withdrawn before resolution. Craft are
// routed home by carrier id (each detachment's `shipId`), never by the fleet
// they launched from: while the mission was away the player may have split that
// fleet (moving the carrier under a brand-new fleet id) or renamed it, so the
// launching fleet is not a reliable handle on where the carrier lives now.
// Adds each detachment's count back onto its source squadron wherever that
// carrier currently is, or recreates the squadron (by the model it flew as) if
// the hangar slot was removed while it was away. A detachment whose carrier no
// longer exists anywhere (scrapped or destroyed mid-mission) has nothing to
// land on and is dropped — the same as before, just now checked sector-wide.
export function returnDetachments(fleets, detachments) {
  const backs = (detachments || []).filter((d) => d.count > 0);
  if (backs.length === 0) return fleets;
  return fleets.map((f) => {
    // Leave fleets holding none of these carriers untouched, so React can skip
    // re-rendering them — same identity-preserving intent as the old per-fleet
    // guard, just no longer tied to a single fleetId.
    if (!f.ships.some((s) => backs.some((d) => d.shipId === s.id))) return f;
    return {
      ...f,
      ships: f.ships.map((s) => {
        const mine = backs.filter((d) => d.shipId === s.id);
        if (mine.length === 0) return s;
        let squadrons = squadronsOf(s);
        for (const d of mine) {
          const idx = squadrons.findIndex((q) => q.id === d.squadronId);
          squadrons = idx === -1
            ? [...squadrons, { id: d.squadronId, count: d.count, model: d.model }]
            : squadrons.map((q, i) => (i === idx ? { ...q, count: (Number(q.count) || 0) + d.count } : q));
        }
        return { ...s, squadrons };
      }),
    };
  });
}

// Army orders reuse the squadron-mission pipeline: an army detachment is
// { shipId: armyId, squadronId: divisionId, model, count }, so a mission's
// survivingDetachments/loss bookkeeping works unchanged. These two are the
// army-side twins of commitDetachments/returnDetachments above.
export function commitArmyDivisions(armies, armyId, detachments) {
  return armies.map((r) => (r.id !== armyId ? r : {
    ...r,
    divisions: (r.divisions || []).map((d) => {
      const det = detachments.find((x) => x.squadronId === d.id);
      return det ? { ...d, count: Math.max(0, (Number(d.count) || 0) - det.count) } : d;
    }),
  }));
}

// Divisions come home by army id; a division removed while away is recreated
// by the model it fought as, and one whose army is gone has nowhere to land.
export function returnArmyDivisions(armies, detachments) {
  const backs = (detachments || []).filter((d) => d.count > 0);
  if (backs.length === 0) return armies;
  return armies.map((r) => {
    const mine = backs.filter((d) => d.shipId === r.id);
    if (mine.length === 0) return r;
    let divisions = r.divisions || [];
    for (const d of mine) {
      const idx = divisions.findIndex((x) => x.id === d.squadronId);
      divisions = idx === -1
        ? [...divisions, { id: d.squadronId, count: d.count, model: d.model }]
        : divisions.map((x, i) => (i === idx ? { ...x, count: (Number(x.count) || 0) + d.count } : x));
    }
    return { ...r, divisions };
  });
}

// A mission's craft aren't back in their carrier's hangar until it resolves —
// survivors unknown while "pending" — or, if resolved with "delay resolution",
// until Next Turn hands them back (see App.jsx resolveMission/nextTurn).
// Recomputes the same per-squadron split resolveMission applies at resolve
// time: an exact loss the GM logged for that squadron if there is one,
// otherwise casualtyPct spread evenly. A pending mission has no resolution
// yet, so cas is 0 and every craft counts as coming home — the optimistic
// "nothing lost yet" figure, corrected once the GM actually rules on it.
export function survivingDetachments(mission) {
  const resolution = mission && mission.resolution;
  const cas = Number(resolution && resolution.casualtyPct) || 0;
  const lossMap = new Map((resolution && resolution.detachmentLosses || []).map((d) => [d.squadronId, d.loss]));
  return ((mission && mission.detachments) || []).map((d) => {
    const loss = lossMap.has(d.squadronId)
      ? Math.max(0, Math.min(d.count, Math.floor(Number(lossMap.get(d.squadronId)) || 0)))
      : Math.round(d.count * (cas / 100));
    return { ...d, count: d.count - loss };
  });
}

// Craft still off a carrier's books because they're out on a mission that
// hasn't landed yet — "pending" (outcome unknown) or "delayed" (outcome
// known, held back until Next Turn). Indexed both by shipId+model, for a
// single hangar slot, and by shipId alone, for a carrier's total — so a
// screen like Replenish can show what a carrier will actually have once its
// current missions return, not just what's sitting in its hangar right now.
export function incomingCraft(missions) {
  const byShipModel = new Map();
  const byShip = new Map();
  for (const m of missions || []) {
    if (m.status !== "pending" && m.status !== "delayed") continue;
    for (const d of survivingDetachments(m)) {
      if (d.count <= 0) continue;
      const key = `${d.shipId}::${d.model || ""}`;
      byShipModel.set(key, (byShipModel.get(key) || 0) + d.count);
      byShip.set(d.shipId, (byShip.get(d.shipId) || 0) + d.count);
    }
  }
  return { byShipModel, byShip };
}

export const incomingFor = (incoming, shipId, model) =>
  (incoming && incoming.byShipModel.get(`${shipId}::${model || ""}`)) || 0;

export const incomingForShip = (incoming, shipId) =>
  (incoming && incoming.byShip.get(shipId)) || 0;

// A carrier's optional `model` is its design ("Gorb-class Carrier") — what sister
// ships share and what the art library matches on. Distinct from the old `cls`
// field, which sorted hulls into Frigate/Cruiser/… and became meaningless once
// every named ship was a carrier.
export function knownCarrierModels(fleets) {
  const seen = new Set();
  for (const f of fleets || []) {
    for (const c of f.ships || []) {
      const m = (c.model || "").trim();
      if (m) seen.add(m);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}
