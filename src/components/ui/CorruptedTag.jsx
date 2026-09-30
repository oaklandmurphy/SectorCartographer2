import CorruptedArt from "./CorruptedArt.jsx";

// "Corrupted" haunt: a modifier the GM has flagged as corrupted (see
// AssetsView's Corrupted toggle) renders through this instead of its real
// styled chip/card everywhere a player would normally see it. The content
// is still real — the actual name/description — just stripped of every bit
// of this app's styling (its dark theme, fonts, letter-spacing, borders,
// uppercase) down to plain black-on-white text, like the page's CSS failed
// to load for exactly this one piece. No app color — the raw text itself is
// the "error" — but callers standing in for a modifier (as opposed to an
// agent, which already supplies its own CorruptedArt for its glyph) pass
// `icon` to also show the broken-image glyph alongside the plain text, since
// a modifier normally has no art of its own to fall back to either.
//
// "chip" (default) sits inline where a small modifier badge normally would
// (see callers in AgentsView/ActionArchiveView) — unstyled text, no border,
// no background box beyond plain white, so it doesn't read as a component at
// all. "block" fills a card-sized area instead — used by AssetsView to stand
// in for a corrupted modifier's whole name+description, with no card
// chrome (border/background/padding) around it, only around the plain text.
const RESET = {
  background: "#fff", color: "#111", fontFamily: "Georgia, 'Times New Roman', Times, serif",
  fontWeight: 400, fontStyle: "normal", letterSpacing: "normal", textTransform: "none", textAlign: "left",
};

export default function CorruptedTag({ variant = "chip", icon = false, children }) {
  if (variant === "block") {
    return (
      <div style={{ ...RESET, fontSize: 15, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 4 }}>
        {icon && <CorruptedArt width={26} title="Asset unavailable" />}
        {children}
      </div>
    );
  }
  return (
    <span style={{ ...RESET, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}>
      {icon && <CorruptedArt width={13} title="Asset unavailable" />}
      {children}
    </span>
  );
}
