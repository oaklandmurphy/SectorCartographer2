import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Menu } from "lucide-react";
import { T, F } from "../../theme.js";

// A mobile substitute for a horizontal-scrolling tab strip. Instead of a row of
// chips that can run off the edge of a phone screen (and hide entries with no
// visual sign there's more), this collapses to a single button showing the
// current selection; tapping it drops down the full list, styled like the
// vertical desktop rail, to pick from. Closes itself on any tap inside —
// selecting an item is expected to close it; callers don't need to manage that.
//
// The open list is `position: fixed`, placed from the trigger's own
// getBoundingClientRect rather than nested absolutely under the trigger.
// Several callers (GM Tools' section switch, the player rail inside it,
// squadron missions' player rail) mount this inside their own scrolling
// column — an absolutely-positioned list there gets clipped by that column's
// overflow, or capped under whatever else on the page happens to carry a
// z-index, instead of floating over it. Fixed positioning escapes both.
//
// The root wrapper deliberately carries no z-index of its own: giving a
// positioned element a z-index opens a *new* stacking context, which would
// trap the fixed-position list inside it. Pages like GM Tools and Agents
// stack two of these rails one after another — with each wrapper stacking
// on its own, the later rail's trigger (same z-index, later in DOM order)
// would always paint over an earlier rail's open list, no matter how high
// that list's own z-index went. Leaving the wrapper un-indexed lets the
// list's z-index (below) be compared directly against the whole page.
export default function MobileTabRail({ label, icon, accentColor, children }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!open) return;
    const measure = () => setRect(btnRef.current ? btnRef.current.getBoundingClientRect() : null);
    measure();
    window.addEventListener("resize", measure);
    // capture: true — scroll on an ancestor pane doesn't bubble to window, but
    // it does fire there during capture, which is what keeps the list glued
    // to the trigger when the surrounding page (not the window) scrolls.
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  return (
    <div style={{ position: "relative", flexShrink: 0,
      borderBottom: open ? "none" : `2px solid ${T.line}` }}>
      <button ref={btnRef} onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          border: "none", padding: "11px 12px", background: T.panel, color: accentColor || T.text,
          fontFamily: F.body, fontSize: 13, fontWeight: 600, letterSpacing: ".03em",
          textTransform: "uppercase" }}>
        {icon || <Menu size={15} />}
        <span style={{ flex: 1, minWidth: 0, textAlign: "left", overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && rect && (
        <div className="scroll" onClick={() => setOpen(false)}
          style={{ position: "fixed", top: rect.bottom, left: rect.left, width: rect.width, zIndex: 200,
            maxHeight: `min(60vh, ${Math.max(120, window.innerHeight - rect.bottom - 8)}px)`, overflowY: "auto",
            background: T.panel, borderBottom: `2px solid ${T.line}`, boxShadow: "0 14px 30px rgba(0,0,0,.6)",
            padding: 8, display: "flex", flexDirection: "column", gap: 5 }}>
          {children}
        </div>
      )}
    </div>
  );
}
