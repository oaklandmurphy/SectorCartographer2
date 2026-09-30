import { VenetianMask } from "lucide-react";
import { T, cut } from "../../theme.js";
import { AGENT_ICONS } from "../../constants.js";
import FactionSymbol from "../../lib/factionSymbols.jsx";
import CorruptedArt from "./CorruptedArt.jsx";
import CorruptionSplat from "./CorruptionSplat.jsx";

// The pure visuals for the three things that sit on the map — a system's
// plate, a fleet's wedge, an agent's diamond — factored out of MapCanvas so a
// second renderer (BoardSnapshotModal's read-only past-turn view) can draw
// the exact same pieces instead of drifting into its own look. Every prop
// here is display data only: no drag/selection/popup wiring, which stays in
// each caller since only the live map has any of that.

// A system: a chamfered plate in the controlling faction's color with their
// heraldry centered on it, or — zoomed out past OVERVIEW_ZOOM — a small plain
// swatch. Caller positions and sizes the wrapping box; this fills it.
// Corrupted (SystemPopup's toggle) drops the plate/faction chrome for the
// same broken-image square agents and fleets use, plus a jagged white splat
// (CorruptionSplat) blotting out past the plate's own footprint like paint
// that's been struck off and exposed bare white underneath — the one
// corrupted piece that visibly spreads past its box rather than just
// replacing what was inside it, since a system reads as a fixed place on the
// map, not just an icon, when it starts failing. `neighbors` (other systems'
// screen positions relative to this one, from MapCanvas) bounds the splat to
// a Voronoi-style cell — see CorruptionSplat — so it only ever covers ground
// actually closer to this system than to any other one on the map; omit it
// (as BoardSnapshotModal's read-only caller does) and it just falls back to
// a plain capped blob. Shown to the GM too, same as a corrupted fleet/agent —
// SystemPopup's own Corrupted checkbox (opened by clicking this same piece)
// is unaffected, so un-corrupting it always stays reachable.
export function SystemPlate({ id, factionId, factionColor, overview, corrupted, neighbors }) {
  if (corrupted) {
    const size = overview ? 14 : 34;
    return (
      <>
        <CorruptionSplat seed={id || factionId || "system"} neighbors={neighbors} reach={overview ? 26 : 62} />
        <CorruptedArt width={size} title="System data unavailable" />
      </>
    );
  }
  if (overview) {
    return (
      <div style={{ position: "absolute", inset: 0, ...cut(3), display: "flex",
        alignItems: "center", justifyContent: "center",
        background: factionColor, border: `1px solid ${T.ink}`, boxShadow: "0 1px 3px rgba(0,0,0,.7)" }}>
        <FactionSymbol factionId={factionId} size={9} color={T.ink} />
      </div>
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

// The mono system-name label MapCanvas hangs under a (non-overview) plate.
export function SystemLabel({ name }) {
  return (
    <div className="mono" style={{ fontSize: 11, marginTop: 4, color: T.text, fontWeight: 600,
      textShadow: "0 1px 4px #000", whiteSpace: "nowrap" }}>{name}</div>
  );
}

// A fleet: an arrowhead wedge in the faction's color with hull shading, its
// heraldry near the bow, and a carrier-count badge. 30x30, matching MapCanvas.
// Corrupted (any one of its carriers flagged — see FleetView's toggle and
// MapCanvas's call site) drops the wedge/faction chrome entirely for the same
// plain broken-image square agents use, same footprint — the whole fleet
// piece reads as broken, not just the carrier that's actually corrupted,
// since a fleet is one glyph on the map with no per-carrier view here.
export function FleetGlyph({ factionId, factionColor, carrierCount, corrupted }) {
  if (corrupted) {
    return (
      <div style={{ position: "relative", width: 30, height: 30 }}>
        <CorruptedArt width={30} title="Fleet art unavailable" />
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
// 29x29, matching MapCanvas. Corrupted (GM Tools' theme, see AgentsView's
// toggle) drops the diamond/faction-color chrome entirely for a plain
// broken-image square, same footprint — the badge (a real number, not art)
// still shows over it.
export function AgentGlyph({ factionColor, icon, corrupted, badge, badgeTitle }) {
  const Icon = AGENT_ICONS[icon] || VenetianMask;
  if (corrupted) {
    return (
      <div style={{ position: "relative", width: 29, height: 29 }}>
        <CorruptedArt width={29} title="Agent glyph unavailable" />
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

// A hyperlane: the dashed line MapCanvas draws between two linked systems.
// Exported as prebuilt <line> props so both callers stay in sync on a stroke
// tweak without hunting down two copies.
export const LINK_LINE_PROPS = { stroke: "#7a6a48", strokeOpacity: 0.6, strokeWidth: 1.4, strokeDasharray: "6 5" };
