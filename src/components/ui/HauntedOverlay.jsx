import { useEffect } from "react";
import { WifiOff } from "lucide-react";

// A full-screen fake error page for the "haunted messages" GM prank (see
// GMToolsView's Haunt section and App.jsx's pendingHaunt/displayedHaunt).
// Deliberately styled nothing like the rest of this app — system fonts,
// plain browser/server chrome — so it reads as a real fault, not an in-game
// popup. Covers everything (zIndex above every modal in the app) and blocks
// interaction with the page underneath until the viewer clicks anywhere,
// which calls onDismiss. A refresh is the other way out: App.jsx stamps the
// haunt's `seenAt` the instant this mounts, so reloading lands on a clean app
// rather than the same error again.
export default function HauntedOverlay({ haunt, onDismiss }) {
  useEffect(() => {
    if (!haunt) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, [haunt]);

  if (!haunt) return null;
  const style = haunt.style || "http500";
  if (style === "chrome") return <ChromeError haunt={haunt} onDismiss={onDismiss} />;
  if (style === "glitch") return <GlitchError haunt={haunt} onDismiss={onDismiss} />;
  return <ServerError haunt={haunt} onDismiss={onDismiss} />;
}

const SYS_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
const overlayBase = {
  position: "fixed", inset: 0, zIndex: 99999, overflow: "auto", cursor: "default",
};

// Old-school "500 Internal Server Error" default error page — the kind a
// misconfigured Apache/nginx box still serves.
function ServerError({ haunt, onDismiss }) {
  return (
    <div onClick={onDismiss} style={{ ...overlayBase, background: "#fff", color: "#000", fontFamily: SYS_FONT }}>
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "56px 24px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 400, borderBottom: "1px solid #999", paddingBottom: 10, margin: 0 }}>
          {haunt.title || "Internal Server Error"}
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 18 }}>
          The server encountered an internal error or misconfiguration and was unable to
          complete your request.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>
          Please contact the server administrator to inform them of the time this error
          occurred, and the actions you performed just before this error.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>
          More information about this error may be available in the server error log.
        </p>
        {haunt.message && (
          <pre style={{ background: "#f3f3f3", border: "1px solid #ccc", padding: "10px 12px",
            fontSize: 12.5, whiteSpace: "pre-wrap", marginTop: 14, fontFamily: "monospace" }}>
            {haunt.message}
          </pre>
        )}
        <p style={{ fontSize: 11.5, color: "#666", marginTop: 34, borderTop: "1px solid #ccc", paddingTop: 10 }}>
          {haunt.code || "Apache/2.4.41 (Ubuntu) Server"}
        </p>
      </div>
    </div>
  );
}

// A Chrome-style "can't be reached" connection page.
function ChromeError({ haunt, onDismiss }) {
  const host = typeof window !== "undefined" ? window.location.hostname : "this site";
  return (
    <div onClick={onDismiss} style={{ ...overlayBase, background: "#fff", color: "#202124", fontFamily: SYS_FONT }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "72px 24px" }}>
        <WifiOff size={44} color="#5f6368" strokeWidth={1.4} />
        <h1 style={{ fontSize: 20, fontWeight: 400, marginTop: 22 }}>
          {haunt.title || "This site can't be reached"}
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.7, marginTop: 10 }}>
          <b>{host}</b> unexpectedly closed the connection.
        </p>
        {haunt.message && (
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#3c4043" }}>{haunt.message}</p>
        )}
        <p style={{ fontSize: 13, lineHeight: 1.9, marginTop: 16, color: "#3c4043" }}>
          Try:
          <br />— Checking the connection
          <br />— Checking the proxy and the firewall
          <br />— Running Windows Network Diagnostics
        </p>
        <button style={{ marginTop: 22, background: "#fff", border: "1px solid #dadce0", color: "#1a73e8",
          fontFamily: SYS_FONT, fontSize: 13.5, padding: "8px 18px", borderRadius: 4, cursor: "default" }}>
          Reload
        </button>
        <p style={{ fontSize: 12, color: "#a0a4a8", marginTop: 26 }}>{haunt.code || "ERR_CONNECTION_RESET"}</p>
      </div>
    </div>
  );
}

// The overtly uncanny option: a corrupted-terminal glitch page rather than a
// page that plausibly explains itself as mundane. Runs its own small
// stylesheet for the flicker/scan animation (inline style can't do keyframes).
function GlitchError({ haunt, onDismiss }) {
  return (
    <div onClick={onDismiss} style={{ ...overlayBase, background: "#000", color: "#e63946",
      fontFamily: '"Courier New", monospace' }}>
      <style>{`
        @keyframes haunt-flicker { 0%,100%{opacity:1} 42%{opacity:1} 43%{opacity:.72} 44%{opacity:1} 71%{opacity:1} 72%{opacity:.5} 74%{opacity:1} }
        @keyframes haunt-scan { 0%{transform:translateY(-100%)} 100%{transform:translateY(100%)} }
        .haunt-glitch-root{animation:haunt-flicker 3.6s infinite}
        .haunt-glitch-scan{position:absolute;left:0;right:0;height:35%;
          background:linear-gradient(rgba(255,255,255,.05),rgba(255,255,255,0));
          animation:haunt-scan 5s linear infinite;pointer-events:none}
      `}</style>
      <div className="haunt-glitch-root" style={{ position: "relative", height: "100%" }}>
        <div className="haunt-glitch-scan" />
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "80px 24px", position: "relative" }}>
          <div style={{ fontSize: 12, letterSpacing: ".2em", color: "#7a8a99", marginBottom: 8 }}>
            {haunt.code || "0xC0000005"}
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: ".04em", margin: 0,
            textShadow: "2px 0 #2ab6d9, -2px 0 #e63946" }}>
            {haunt.title || "SYSTEM ERROR"}
          </h1>
          {haunt.message && (
            <pre style={{ marginTop: 26, fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap",
              color: "#e6e6e6", borderLeft: "2px solid #e63946", paddingLeft: 14 }}>
              {haunt.message}
            </pre>
          )}
          <div style={{ marginTop: 40, fontSize: 11, color: "#4a5560", letterSpacing: ".08em" }}>
            press anywhere to continue_
          </div>
        </div>
      </div>
    </div>
  );
}
