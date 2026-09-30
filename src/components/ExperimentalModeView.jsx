import { ImageOff } from "lucide-react";
import { useConfirm } from "../hooks/useConfirm.jsx";

// Deliberately unstyled, same idea as components/ui/CorruptedTag.jsx and
// CorruptedArt.jsx elsewhere in this app: this tab only exists while signal
// corruption is on (see App.jsx's effectiveGlitch), so instead of a themed
// panel it looks like this one page's CSS never loaded — plain background,
// default browser controls, a broken-image glyph standing in for an icon.
// Every themed property below is put back to a plain default explicitly, not
// merely omitted, since omitting it would just inherit the dark theme from
// the tab content area around it.
const RESET = {
  background: "#fff", color: "#111", fontFamily: "Georgia, 'Times New Roman', Times, serif",
  fontWeight: 400, fontStyle: "normal", letterSpacing: "normal", textTransform: "none",
};

// Visible to the GM and to any signed-in player (App.jsx's navTabs
// `show: (isGM || viewer.kind === "player") && effectiveGlitch`) — never to
// an anonymous viewer. A player's checkbox casts their own advisory vote; the
// three checkboxes below it are a read-only tally, filled in left to right,
// one per vote already cast, capped at three regardless of how many players
// there actually are. The GM instead gets a real <button>, not a checkbox
// they could mistake for a vote — its label says outright that it's the one
// that actually fires App.jsx's endExperimentalMode, on the GM's say-so alone,
// never gated on the vote count above it.
export default function ExperimentalModeView({ isMobile, isGM, viewer, roles, votes, toggleVote, onEnd, removeFlicker, setRemoveFlicker }) {
  const confirm = useConfirm();
  const myVote = !isGM && viewer.roleId ? votes.includes(viewer.roleId) : false;
  const tally = Math.min(votes.length, 3);
  // GM-only: votes only ever stores roleIds (see App.jsx's toggleExperimentalVote),
  // never a display name, so resolve each one against the live roles list the
  // same way GMToolsView's own roleName() lookup does — a role deleted after
  // voting just falls back to "Unknown player" rather than throwing.
  const voterNames = isGM
    ? votes.map((id) => (roles.find((r) => r.id === id) || {}).name || "Unknown player")
    : [];

  return (
    <div style={{ ...RESET, position: "relative", padding: isMobile ? 16 : 24, minHeight: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Personal, per-browser opt-out of the shear/flicker/overlay App.jsx
          renders while effectiveGlitch is on (see App.jsx's showFlicker).
          Anchored to this panel's own top-right corner (not position: fixed
          to the viewport) so it sits below the global tab bar regardless of
          that bar's height — desktop strip vs. mobile dropdown differ, and a
          fixed offset would either overlap one or leave a gap under the
          other. Never touches the shared interfaceGlitch flag, so no one
          else's screen is affected. */}
      <label style={{ ...RESET, position: "absolute", top: isMobile ? 16 : 24, right: isMobile ? 16 : 24, zIndex: 5,
        display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
        border: "1px solid #999", borderRadius: 3, padding: "4px 8px", fontSize: 13 }}>
        <input type="checkbox" checked={removeFlicker} onChange={(e) => setRemoveFlicker(e.target.checked)} />
        Remove Flicker
      </label>

      <ImageOff size={32} color="#999" strokeWidth={1.5} title="Image failed to load" />

      {!isGM && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={myVote} onChange={toggleVote} />
          End Experimental Mode
        </label>
      )}

      <div style={{ ...RESET, fontSize: 28 }}>User Warning: this will undo experimental edits</div>

      <div style={{ display: "flex", gap: 6 }} title={`${votes.length} player${votes.length === 1 ? "" : "s"} voted to end`}>
        {[0, 1, 2].map((i) => (
          <input key={i} type="checkbox" checked={i < tally} disabled readOnly />
        ))}
      </div>

      {isGM && (
        <div style={{ ...RESET, fontSize: 14 }}>
          {voterNames.length === 0 ? "No players have voted to end yet." : `Voted to end: ${voterNames.join(", ")}`}
        </div>
      )}

      {isGM && (
        <button type="button"
          onClick={async () => {
            if (await confirm("End Experimental Mode? Every live experimental edit reverts to its old text for good."))
              onEnd();
          }}>
          REAL BUTTON! CAREFUL
        </button>
      )}
    </div>
  );
}
