import { VenetianMask, Swords } from "lucide-react";
import { T, cut } from "../../theme.js";
import { AGENT_ICONS } from "../../constants.js";
import FactionSymbol from "../../lib/factionSymbols.jsx";
import { subregionCount, subregionName, sliceAngles, slicePath, RING_OUT } from "../../lib/subregions.js";

// The pure visuals for the three things that sit on the map — a system's
// plate, a fleet's wedge, an agent's diamond — factored out of MapCanvas so a
// second renderer (BoardSnapshotModal's read-only past-turn view) can draw
// the exact same pieces instead of drifting into its own look. Every prop
// here is display data only: no drag/selection/popup wiring, which stays in
// each caller since only the live map has any of that.

// A system: a chamfered plate in the controlling faction's color with their
// heraldry centered on it, or — zoomed out past OVERVIEW_ZOOM — a small plain
// swatch. Caller positions and sizes the wrapping box; this fills it.
// `round` (zoomed into detail) draws the system as its main-node circle, the
// hub its subregion slices ring.
export function SystemPlate({ factionId, factionColor, overview, round = false, symbolSize = 18 }) {
  if (overview) {
    return (
      <div style={{ position: "absolute", inset: 0, ...cut(3), display: "flex",
        alignItems: "center", justifyContent: "center",
        background: factionColor, border: `1px solid ${T.ink}`, boxShadow: "0 1px 3px rgba(0,0,0,.7)" }}>
        <FactionSymbol factionId={factionId} size={9} color={T.ink} />
      </div>
    );
  }
  if (round) {
    return (
      <>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%",
          background: `radial-gradient(circle at 38% 30%, ${factionColor}, ${factionColor}bb 55%, #000 150%)`,
          border: `2px solid ${T.ink}`,
          boxShadow: "inset 0 2px 3px rgba(255,255,255,.16), inset 0 -4px 5px rgba(0,0,0,.55), 0 2px 5px rgba(0,0,0,.6)" }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FactionSymbol factionId={factionId} size={symbolSize} color={T.ink} />
        </div>
      </>
    );
  }
  return (
    <>
      <div style={{ position: "absolute", inset: 2, ...cut(5),
        background: `linear-gradient(155deg, ${factionColor}, ${factionColor}bb 55%, #000 140%)`,
        border: `1.5px solid ${T.ink}`,
        boxShadow: "inset 0 2px 3px rgba(255,255,255,.16), inset 0 -4px 5px rgba(0,0,0,.55), 0 2px 5px rgba(0,0,0,.6)" }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        <FactionSymbol factionId={factionId} size={18} color={T.ink} />
      </div>
    </>
  );
}

// The pie slices around a system's main node, drawn from the system's own
// subregion count. Sized in screen pixels from the map scale so they track
// zoom; the caller centers it on the system and leaves pointer events to the
// pieces above. `lit` is the set of slice keys to highlight.
export function SubregionRing({ system, factionColor, scale, lit }) {
  const n = subregionCount(system);
  if (n === 0) return null;
  const size = RING_OUT * 2 * scale;
  return (
    <svg width={size} height={size} viewBox={`${-RING_OUT} ${-RING_OUT} ${RING_OUT * 2} ${RING_OUT * 2}`}
      style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
        pointerEvents: "none", zIndex: -1, overflow: "visible" }}>
      {Array.from({ length: n }, (_, k) => {
        const i = k + 1; const on = lit && lit.has(String(i));
        const { mid } = sliceAngles(i, n);
        const r = RING_OUT - 8;
        return (
          <g key={i}>
            <path d={slicePath(i, n)} fill={factionColor} fillOpacity={on ? 0.42 : 0.16}
              stroke={factionColor} strokeOpacity={0.85} strokeWidth={1.2 / scale} fillRule="evenodd" />
            <text x={Math.cos(mid) * r} y={Math.sin(mid) * r} textAnchor="middle" dominantBaseline="middle"
              className="mono" fontSize={9 / scale} fontWeight="700" fill={T.text} stroke={T.ink}
              strokeWidth={2.4 / scale} paintOrder="stroke" style={{ letterSpacing: ".04em" }}>
              {subregionName(system, String(i))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// The mono system-name label MapCanvas hangs under a (non-overview) plate.
export function SystemLabel({ name }) {
  return (
    <div className="mono" style={{ fontSize: 11, marginTop: 4, color: T.text, fontWeight: 600,
      textShadow: "0 1px 4px #000", whiteSpace: "nowrap" }}>{name}</div>
  );
}

// A fleet: an arrowhead wedge in the faction's color with hull shading, its
// heraldry near the bow, and a carrier-count badge. 30x30, matching MapCanvas.
export function FleetGlyph({ factionId, factionColor, carrierCount }) {
  return (
    <div style={{ position: "relative", width: 30, height: 30,
      filter: `drop-shadow(0 2px 3px rgba(0,0,0,.7)) drop-shadow(0 0 3px ${factionColor}77)` }}>
      <svg width="30" height="30" viewBox="0 0 30 30">
        <polygon points="15,2 27,26 15,20 3,26" fill={factionColor} stroke={T.ink} strokeWidth="1.6" strokeLinejoin="round" />
        <polygon points="15,3 15,20 3,26" fill="#000000" opacity="0.22" />
        <polygon points="15,3 15,20 27,26" fill="#ffffff" opacity="0.10" />
      </svg>
      <div style={{ position: "absolute", left: "50%", top: "47%", transform: "translate(-50%,-50%)" }}>
        <FactionSymbol factionId={factionId} size={11} color={T.ink} />
      </div>
      {carrierCount != null && (
        <div className="mono" style={{ position: "absolute", right: -7, bottom: -6, minWidth: 15, height: 14,
          padding: "0 3px", background: T.ink, border: `1px solid ${factionColor}`,
          color: factionColor, fontSize: 9.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {carrierCount}
        </div>
      )}
    </div>
  );
}

// An agent: a rotated diamond in the faction's color, their assigned glyph
// (AGENT_ICONS, falling back to VenetianMask) centered on it, and an optional
// badge (MapCanvas uses this for the agent's remaining action-request count).
// 29x29, matching MapCanvas.
export function AgentGlyph({ factionColor, icon, badge, badgeTitle }) {
  const Icon = AGENT_ICONS[icon] || VenetianMask;
  return (
    <div style={{ position: "relative", width: 29, height: 29,
      filter: `drop-shadow(0 2px 3px rgba(0,0,0,.7)) drop-shadow(0 0 3px ${factionColor}77)` }}>
      <div style={{ position: "absolute", inset: 5, transform: "rotate(45deg)",
        background: `radial-gradient(circle at 50% 32%, ${factionColor}, ${factionColor}bb 60%, #000 150%)`,
        border: `1.5px solid ${T.ink}`,
        boxShadow: "inset 0 1px 2px rgba(255,255,255,.18)" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={16} color={T.ink} />
      </div>
      {badge != null && (
        <div className="mono" title={badgeTitle} style={{ position: "absolute", right: -7, bottom: -6, minWidth: 15, height: 14,
          padding: "0 3px", background: T.ink, border: `1px solid ${factionColor}`,
          color: factionColor, fontSize: 9.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {badge}
        </div>
      )}
    </div>
  );
}

// An army: a chamfered square plate in the faction's color with crossed swords
// on it and a division-count badge — squarer and heavier than an agent's diamond
// or a fleet's wedge so the three read apart at a glance. 28x28, matching MapCanvas.
export function ArmyGlyph({ factionColor, badge, badgeTitle }) {
  return (
    <div style={{ position: "relative", width: 28, height: 28,
      filter: `drop-shadow(0 2px 3px rgba(0,0,0,.7)) drop-shadow(0 0 3px ${factionColor}77)` }}>
      <div style={{ position: "absolute", inset: 2, ...cut(6),
        background: `linear-gradient(155deg, ${factionColor}, ${factionColor}bb 60%, #000 150%)`,
        border: `1.5px solid ${T.ink}`,
        boxShadow: "inset 0 1px 2px rgba(255,255,255,.18)" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Swords size={15} color={T.ink} />
      </div>
      {badge != null && (
        <div className="mono" title={badgeTitle} style={{ position: "absolute", right: -7, bottom: -6, minWidth: 15, height: 14,
          padding: "0 3px", background: T.ink, border: `1px solid ${factionColor}`,
          color: factionColor, fontSize: 9.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {badge}
        </div>
      )}
    </div>
  );
}

// A hyperlane: the dashed line MapCanvas draws between two linked systems.
// Exported as prebuilt <line> props so both callers stay in sync on a stroke
// tweak without hunting down two copies.
export const LINK_LINE_PROPS = { stroke: "#7a6a48", strokeOpacity: 0.6, strokeWidth: 1.4, strokeDasharray: "6 5" };
