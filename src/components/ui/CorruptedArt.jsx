import { ImageOff } from "lucide-react";

// "Corrupted" haunt, art edition: stands in for an agent's glyph or a
// carrier's hull art (see AgentsView's and FleetView's Corrupted toggles) —
// unlike CorruptedTag (which still shows the real, unstyled text of a
// corrupted modifier), there's no "real" text to fall back to for a picture,
// so this is the classic broken-image glyph: a plain white square, thin gray
// border, no app color or theming. Sized to the box it replaces (agent icons
// are square; ship hulls take a separate height) so nothing around it reflows.
export default function CorruptedArt({ width = 26, height, title = "Image failed to load" }) {
  const h = height == null ? width : height;
  return (
    <div title={title} style={{ width, height: h, flexShrink: 0, display: "flex",
      alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid #ccc" }}>
      <ImageOff size={Math.max(11, Math.round(Math.min(width, h) * 0.5))} color="#999" strokeWidth={1.5} />
    </div>
  );
}
