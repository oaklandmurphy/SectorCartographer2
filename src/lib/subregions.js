// Subregions: every star system is a main node (the circle) plus a settable
// number of pie-slice subregions around it. Ships, fleets and agents are tied
// to a (system, subregion) pair, which is what combat and mission destinations
// hang off.
//
// Storage: a system carries `subregions` (a count, 0 = none) and a piece
// carries `subregion`, either null/absent (the main node) or the slice's
// number as a string ("1".."n"). Names derive from the parent system and are
// never stored, so renaming the system renames its regions: "Primag-main",
// "Primag-1", "Primag-2"...
//
// Everything here is pure and in world units; the map overlays scale it by zoom.

export const MAIN = "main";
export const MAX_SUBREGIONS = 12;

// Detail geometry, world units from the system's center.
export const MAIN_R = 26;      // the main node's circle
export const RING_IN = 30;     // inner edge of the pie slices (a small gap off the circle)
export const RING_OUT = 80;    // outer edge of the pie slices
const SLICE_GAP = 0.03;        // radians trimmed off each side of a slice so neighbors read as separate

export function subregionCount(system) {
  const n = Math.floor(Number(system && system.subregions) || 0);
  return Math.max(0, Math.min(MAX_SUBREGIONS, n));
}

// A piece's subregion key normalized against its system: anything unset, or
// pointing past a slice that has since been removed, reads as the main node.
export function subregionKey(system, sub) {
  if (sub == null || sub === "" || sub === MAIN) return MAIN;
  const i = Number(sub);
  return Number.isInteger(i) && i >= 1 && i <= subregionCount(system) ? String(i) : MAIN;
}

export function subregionName(system, sub) {
  const base = (system && system.name) || "system";
  return `${base}-${subregionKey(system, sub)}`;
}

// How a location reads in the UI: the region's own name once the system has
// subregions ("Primag-2"), plain system name otherwise.
export function locationName(system, sub) {
  if (!system) return "";
  return subregionCount(system) > 0 ? subregionName(system, sub) : system.name;
}

// Every selectable region of a system, main first: [{ key, name }].
export function subregionOptions(system) {
  const out = [{ key: MAIN, name: subregionName(system, MAIN) }];
  for (let i = 1; i <= subregionCount(system); i++) out.push({ key: String(i), name: subregionName(system, String(i)) });
  return out;
}

// Stored value for a key: the main node is stored as null.
export const storedSubregion = (key) => (key === MAIN || key == null ? null : key);

// Slice i (1-based) of n covers [start, end] radians, slice 1 starting at 12
// o'clock and running clockwise.
export function sliceAngles(i, n) {
  const step = (Math.PI * 2) / n;
  const start = -Math.PI / 2 + (i - 1) * step;
  return { start, end: start + step, mid: start + step / 2 };
}

// World-space center of a region: the system itself for main, the slice's
// centroid for a pie slice.
export function subregionCenter(system, sub) {
  const key = subregionKey(system, sub);
  if (key === MAIN) return { x: system.x, y: system.y };
  const { mid } = sliceAngles(Number(key), subregionCount(system));
  const r = (RING_IN + RING_OUT) / 2;
  return { x: system.x + Math.cos(mid) * r, y: system.y + Math.sin(mid) * r };
}

// Which region of `system` a world point falls in. Inside the main circle (or
// with no slices) is main; otherwise the slice whose angle it lies on.
export function subregionAt(system, wx, wy) {
  const n = subregionCount(system);
  if (n === 0) return MAIN;
  const dx = wx - system.x, dy = wy - system.y;
  if (Math.hypot(dx, dy) <= (MAIN_R + RING_IN) / 2) return MAIN;
  const step = (Math.PI * 2) / n;
  let a = Math.atan2(dy, dx) + Math.PI / 2; // 0 at 12 o'clock, clockwise
  a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return String(Math.min(n, Math.floor(a / step) + 1));
}

// SVG path for slice i of n as an annular sector, centered on (0,0).
export function slicePath(i, n, rIn = RING_IN, rOut = RING_OUT) {
  const { start, end } = sliceAngles(i, n);
  const a0 = start + SLICE_GAP, a1 = end - SLICE_GAP;
  const p = (r, a) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  if (n === 1) { // a single slice is the whole ring
    return `M ${rOut} 0 A ${rOut} ${rOut} 0 1 1 ${-rOut} 0 A ${rOut} ${rOut} 0 1 1 ${rOut} 0 Z `
      + `M ${rIn} 0 A ${rIn} ${rIn} 0 1 0 ${-rIn} 0 A ${rIn} ${rIn} 0 1 0 ${rIn} 0 Z`;
  }
  return `M ${p(rIn, a0)} L ${p(rOut, a0)} A ${rOut} ${rOut} 0 ${large} 1 ${p(rOut, a1)} `
    + `L ${p(rIn, a1)} A ${rIn} ${rIn} 0 ${large} 0 ${p(rIn, a0)} Z`;
}

// World positions for pieces sitting in a region's slots. Fleets take a row
// just above the region's center and agents one just below, each row wrapping
// after PER_ROW so a crowded region grows downward/upward instead of sideways
// out of its slice. `idx`/`n` are the piece's place among same-kind pieces in
// that region.
const SLOT_PITCH = 19, ROW_PITCH = 21, PER_ROW = 3;
export function slotPosition(center, kind, idx, n) {
  const row = Math.floor(idx / PER_ROW);
  const inRow = Math.min(PER_ROW, n - row * PER_ROW);
  const col = idx % PER_ROW;
  const dir = kind === "fleet" ? -1 : 1;
  return {
    x: center.x + (col - (inRow - 1) / 2) * SLOT_PITCH,
    y: center.y + dir * (ROW_PITCH / 2 + row * ROW_PITCH),
  };
}

// Positions for a list of pieces ({ id, systemId, subregion }) in detail zoom:
// { [id]: {x, y} } for every piece whose system is in `systems`.
export function detailPositions(pieces, systems, kind) {
  const groups = new Map(); // "systemId|key" -> [piece ids]
  const sysOf = new Map(systems.map((s) => [s.id, s]));
  for (const p of pieces) {
    const sys = p.systemId && sysOf.get(p.systemId);
    if (!sys) continue;
    const k = `${sys.id}|${subregionKey(sys, p.subregion)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p.id);
  }
  const out = {};
  for (const p of pieces) {
    const sys = p.systemId && sysOf.get(p.systemId);
    if (!sys) continue;
    const key = subregionKey(sys, p.subregion);
    const arr = groups.get(`${sys.id}|${key}`);
    out[p.id] = slotPosition(subregionCenter(sys, key), kind, arr.indexOf(p.id), arr.length);
  }
  return out;
}
