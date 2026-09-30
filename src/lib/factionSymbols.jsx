// Per-faction heraldry, one hand-drawn glyph per faction in the default
// sector's Codex — each a monochrome (black-on-transparent) symbol so it
// reads as a solid mark regardless of the faction's own accent color. Used
// wherever a system or fleet's controlling faction needs a shape, not just a
// color, to identify it (MapCanvas). Every glyph draws on the same 24x24
// grid so they drop in at any size without per-glyph adjustment.
//
// Themes come straight from each faction's Codex entry:
//   fac_gorbulon  — Gorbulon, the old feudal power        -> coronet
//   fac_flubbadite— Flubbadite, rising industrial/mining   -> hex-nut + ore shard
//   fac_luuk      — Children of Luuk, refugee faith        -> eternal flame
//   fac_11th      — The 11th Fleet, Zakar's admiralty      -> fleet star + bar
//   fac_imperial  — The Empire                             -> orb and cross
//   fac_3_u8n1    — House of Dorn, the sector's drug trade -> crying eye
//   fac_7_f2d6    — House of Bord, shipbuilders            -> gear
//   fac_5_gjgk    — House of Vega, merchants of Vega Gate  -> big star + three in a row
//   fac_4_csl9    — The Shipwright Guild                   -> crossed power drill & welding torch
//   fac_3_7gen    — The Prophet                            -> thumbs up
//   fac_3_57qu    — new faction, no Codex entry yet         -> file-not-found page
//   fac_none      — Unaligned                              -> broken ring
// Anything else (a faction the GM adds later with no glyph of its own) falls
// back to a plain diamond so it still reads as "a faction," not an error.

function Crown() {
  return (
    <>
      <path d="M4,17 L4,10 L7.5,13.5 L12,6 L16.5,13.5 L20,10 L20,17 Z" />
      <rect x="4" y="17" width="16" height="3.4" rx="0.5" />
      <circle cx="12" cy="7.8" r="1.3" />
      <circle cx="6.4" cy="12.2" r="1" />
      <circle cx="17.6" cy="12.2" r="1" />
    </>
  );
}

function HexNutCrystal() {
  return (
    <>
      <path fillRule="evenodd"
        d="M21,12 16.5,20 7.5,20 3,12 7.5,4 16.5,4 Z M17.5,12 14.5,17 9.5,17 6.5,12 9.5,7 14.5,7 Z" />
      <polygon points="12,9 14.5,12 12,15 9.5,12" />
    </>
  );
}

function Flame() {
  return (
    <>
      <path d="M12,3 C9.2,7 7.8,9.4 7.8,12.1 C7.8,15.3 9.6,17.2 12,17.2
        C14.4,17.2 16.2,15.3 16.2,12.1 C16.2,9.4 14.8,7 12,3 Z" />
      <rect x="11" y="17.2" width="2" height="2.3" />
      <rect x="7" y="19.5" width="10" height="2" rx="1" />
    </>
  );
}

function StarBar() {
  return (
    <>
      <polygon points="12,2 13.8,8 20,8 15,11.8 16.8,18 12,14.3 7.2,18 9,11.8 4,8 10.2,8" />
      <rect x="5" y="19.4" width="14" height="2.2" />
    </>
  );
}

function OrbCross() {
  return (
    <>
      <circle cx="12" cy="15.5" r="6" />
      <rect x="11" y="2.5" width="2" height="7" />
      <rect x="8" y="5.5" width="8" height="2" />
    </>
  );
}

function CryingEye() {
  return (
    <>
      <path fillRule="evenodd"
        d="M1,9 C5,2.5 19,2.5 23,9 C19,15.5 5,15.5 1,9 Z M9,9 A3,3 0 1,0 15,9 A3,3 0 1,0 9,9 Z" />
      <path d="M12,16 C9.3,19 9.3,21.7 12,22.5 C14.7,21.7 14.7,19 12,16 Z" />
    </>
  );
}

function Gear() {
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <>
      {teeth.map((a) => (
        <rect key={a} x="10.5" y="0.6" width="3" height="3" transform={`rotate(${a} 12 12)`} />
      ))}
      <path fillRule="evenodd"
        d="M4,12 A8,8 0 1,0 20,12 A8,8 0 1,0 4,12 Z M9,12 A3,3 0 1,0 15,12 A3,3 0 1,0 9,12 Z" />
    </>
  );
}

function FourStars() {
  return (
    <>
      <circle cx="12" cy="6.5" r="4.2" />
      <circle cx="5" cy="18" r="2.6" />
      <circle cx="12" cy="18" r="2.6" />
      <circle cx="19" cy="18" r="2.6" />
    </>
  );
}

function DrillTorch() {
  return (
    <>
      {/* power drill: chunky body, tapered chuck, pistol grip */}
      <g transform="rotate(-45 12 12)">
        <rect x="2.5" y="10.6" width="10.5" height="3" rx="1" />
        <rect x="12.5" y="10.2" width="4" height="3.8" rx="0.6" />
        <polygon points="16.5,9.2 21,12 16.5,14.8" />
        <rect x="4.5" y="13.6" width="3.6" height="6" rx="1.2" />
      </g>
      {/* welding torch: slim tube, flared nozzle, flame */}
      <g transform="rotate(45 12 12)">
        <rect x="2.5" y="11" width="12" height="2.6" rx="1" />
        <path d="M14.5,9.7 L20,10.8 L20,13.2 L14.5,14.3 Z" />
        <polygon points="20,9.5 24,12 20,14.5" />
      </g>
    </>
  );
}

function ThumbsUp() {
  return (
    <path d="M2,11 H5.4 V22 H2 Z
      M7.3,10 C7.3,9.2 7.6,8.5 8.1,8 L12.6,3.1 C13,2.7 13.6,2.6 14.1,2.9
      C14.7,3.2 15,3.9 14.8,4.6 L13.8,8.3 H18.8
      C20,8.3 20.8,9.6 20.3,10.7 L17.7,17.6
      C17.3,18.6 16.4,19.2 15.4,19.2 H9.3
      C8.2,19.2 7.3,18.3 7.3,17.2 Z" />
  );
}

function FileNotFound() {
  return (
    <>
      <path d="M5,3 H14 L19,8 V21 H5 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14,3 L14,8 L19,8 Z" />
      <path d="M9.6,11.4 C9.6,9.4 10.9,8.3 12.2,8.3 C13.7,8.3 15,9.2 15,10.8 C15,12.3 13.6,12.7 13,13.5 C12.6,14 12.5,14.6 12.5,15.6"
        fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12.4" cy="18.2" r="1" />
    </>
  );
}

function BrokenRing() {
  return <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="3"
    strokeDasharray="6 5" strokeLinecap="round" />;
}

function Diamond() {
  return <polygon points="12,3 21,12 12,21 3,12" />;
}

const GLYPHS = {
  fac_gorbulon: Crown,
  fac_flubbadite: HexNutCrystal,
  fac_luuk: Flame,
  fac_11th: StarBar,
  fac_imperial: OrbCross,
  fac_3_u8n1: CryingEye,
  fac_7_f2d6: Gear,
  fac_5_gjgk: FourStars,
  fac_4_csl9: DrillTorch,
  fac_3_7gen: ThumbsUp,
  fac_3_57qu: FileNotFound,
  fac_none: BrokenRing,
};

export const FACTION_SYMBOL_KEYS = Object.keys(GLYPHS);

// Drop-in icon, same calling convention as the lucide icons already used
// elsewhere on the map (`<Icon size={16} color={...} />`) — every shape fills
// with `currentColor` so a single `color` prop recolors the whole glyph.
export default function FactionSymbol({ factionId, size = 16, color = "#000", style, title }) {
  const Glyph = GLYPHS[factionId] || Diamond;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"
      style={{ color, display: "block", flexShrink: 0, ...style }}
      aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <Glyph />
    </svg>
  );
}
