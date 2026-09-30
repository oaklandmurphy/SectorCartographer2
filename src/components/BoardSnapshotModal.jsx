import { useEffect, useMemo, useRef, useState } from "react";
import { X, History } from "lucide-react";
import { T, panelStyle, cut, sceneBackdrop } from "../theme.js";
import { OVERVIEW_ZOOM } from "../constants.js";
import { SystemPlate, SystemLabel, FleetGlyph, AgentGlyph, LINK_LINE_PROPS } from "./ui/MapPieces.jsx";

// A read-only replay of the board as one turn closed out (see
// lib/turnSnapshot.js) — same piece glyphs and hyperlane styling as the live
// MapCanvas (shared via components/ui/MapPieces.jsx) so a past turn looks
// like the same map, not a lookalike. What's deliberately left out: no
// editing, no orders, no popups — pan (drag) and zoom (wheel) only.
const MIN_SCALE = 0.15, MAX_SCALE = 3;

export default function BoardSnapshotModal({ snapshot, turnName, onClose }) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ scale: 1, ox: 0, oy: 0 });
  const dragRef = useRef(null);
  const [fitted, setFitted] = useState(false);

  const factionOf = (id) => (snapshot.factions || []).find((x) => x.id === id) || null;
  const factionColor = (id) => (factionOf(id) || {}).color || T.faint;
  const factionName = (id) => (factionOf(id) || {}).name || "Unaligned";

  const systems = snapshot.systems || [];
  const links = snapshot.links || [];
  const fleets = snapshot.fleets || [];
  const agents = snapshot.agents || [];
  const overview = view.scale <= OVERVIEW_ZOOM;

  // Fleets and agents parked at the same system fan out from its center, same
  // idea as App.jsx's fleetPos/agentPos but simplified to one ring/column —
  // this is a still frame, not something a player will drag pieces around on.
  const fleetPos = useMemo(() => {
    const grouping = new Map();
    fleets.forEach((f) => { if (f.systemId) { if (!grouping.has(f.systemId)) grouping.set(f.systemId, []); grouping.get(f.systemId).push(f.id); } });
    const out = {};
    fleets.forEach((f) => {
      const sys = f.systemId && systems.find((s) => s.id === f.systemId);
      if (sys) {
        const arr = grouping.get(f.systemId); const idx = arr.indexOf(f.id); const n = arr.length;
        const ang = n <= 1 ? 0 : -Math.PI / 2 + idx * (Math.PI / (n - 1));
        out[f.id] = { x: sys.x + Math.cos(ang) * 42, y: sys.y + Math.sin(ang) * 42 };
      } else {
        out[f.id] = { x: f.x || 0, y: f.y || 0 };
      }
    });
    return out;
  }, [fleets, systems]);

  const agentPos = useMemo(() => {
    const grouping = new Map();
    agents.forEach((a) => { if (a.systemId) { if (!grouping.has(a.systemId)) grouping.set(a.systemId, []); grouping.get(a.systemId).push(a.id); } });
    const out = {};
    agents.forEach((a) => {
      const sys = a.systemId && systems.find((s) => s.id === a.systemId);
      if (!sys) return;
      const arr = grouping.get(a.systemId); const idx = arr.indexOf(a.id); const n = arr.length;
      out[a.id] = { x: sys.x - 34, y: sys.y + (idx - (n - 1) / 2) * 22 };
    });
    return out;
  }, [agents, systems]);

  const bounds = useMemo(() => {
    const pts = [
      ...systems.map((s) => ({ x: s.x, y: s.y })),
      ...Object.values(fleetPos), ...Object.values(agentPos),
    ].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!pts.length) return null;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [systems, fleetPos, agentPos]);

  // Container size, tracked so the initial fit and screen-space math both have
  // real numbers to work with.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Fit the whole board in view exactly once, as soon as both the bounds and a
  // real container size are known — after that the GM/player's own pan/zoom
  // takes over and this never runs again for this snapshot.
  useEffect(() => {
    if (fitted || !bounds || size.w < 10) return;
    const PAD = 90;
    const bw = Math.max(1, bounds.maxX - bounds.minX), bh = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((size.w - PAD * 2) / bw, (size.h - PAD * 2) / bh)));
    const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
    setView({ scale, ox: size.w / 2 - cx * scale, oy: size.h / 2 - cy * scale });
    setFitted(true);
  }, [fitted, bounds, size]);

  // Wheel zoom centered on the cursor — non-passive so preventDefault actually
  // stops the page from scrolling underneath the modal (same trick TimelineView
  // uses for its horizontal strip).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        const wx = (lx - v.ox) / v.scale, wy = (ly - v.oy) / v.scale;
        return { scale: ns, ox: lx - wx * ns, oy: ly - wy * ns };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: view.ox, oy: view.oy };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    setView((v) => ({ ...v, ox: d.ox + (e.clientX - d.startX), oy: d.oy + (e.clientY - d.startY) }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const w2s = (x, y) => ({ x: x * view.scale + view.ox, y: y * view.scale + view.oy });

  const usedFactions = useMemo(() => {
    const ids = new Set();
    systems.forEach((s) => s.factionId && s.factionId !== "fac_none" && ids.add(s.factionId));
    fleets.forEach((f) => f.factionId && ids.add(f.factionId));
    return (snapshot.factions || []).filter((f) => ids.has(f.id));
  }, [systems, fleets, snapshot.factions]);

  return (
    <div onPointerDown={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2100, background: "rgba(6,5,3,.78)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onPointerDown={(e) => e.stopPropagation()}
        style={{ ...panelStyle, ...cut(10), width: "100%", maxWidth: 1100, height: "88vh",
          display: "flex", flexDirection: "column", background: T.panel }}>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px",
          borderBottom: `2px solid ${T.accent}`, flexShrink: 0 }}>
          <History size={16} color={T.accent} />
          <div className="stencil" style={{ fontSize: 15, letterSpacing: ".05em", color: T.text, flex: 1, minWidth: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Board state — Cycle {snapshot.turn}{turnName ? ` · ${turnName}` : ""}
          </div>
          {snapshot.source === "backfill" && (
            <span className="mono" title="Reconstructed from a GM export rather than captured live — positions may be approximate"
              style={{ fontSize: 9, letterSpacing: ".08em", textTransform: "uppercase", color: T.faint,
                border: `1px solid ${T.line}`, borderRadius: 2, padding: "2px 6px", flexShrink: 0 }}>
              Reconstructed
            </span>
          )}
          <button onClick={onClose} title="Close"
            style={{ background: "none", border: "none", color: T.faint, cursor: "pointer", padding: 2, flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div ref={wrapRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
          style={{ ...sceneBackdrop, cursor: dragRef.current ? "grabbing" : "grab" }}>
          {!bounds ? (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              color: T.faint, fontSize: 12, textAlign: "center", padding: 24 }}>
              This snapshot has no system positions to draw.
            </div>
          ) : (
            <>
              <svg width={size.w} height={size.h} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {links.map((l) => {
                  const a = systems.find((s) => s.id === l.a), b = systems.find((s) => s.id === l.b);
                  if (!a || !b) return null;
                  const pa = w2s(a.x, a.y), pb = w2s(b.x, b.y);
                  return <line key={l.id} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} {...LINK_LINE_PROPS} />;
                })}
              </svg>

              {systems.map((s) => {
                const p = w2s(s.x, s.y);
                const plate = overview ? 14 : 34, half = plate / 2;
                return (
                  <div key={s.id} title={`${s.name || "Unnamed"} — ${factionName(s.factionId)}`}
                    style={{ position: "absolute", left: p.x, top: p.y - half, transform: "translateX(-50%)",
                      textAlign: "center", pointerEvents: "none" }}>
                    <div style={{ position: "relative", width: plate, height: plate, margin: "0 auto" }}>
                      <SystemPlate factionId={s.factionId} factionColor={factionColor(s.factionId)} overview={overview} />
                    </div>
                    {!overview && <SystemLabel name={s.name || "Unnamed"} />}
                  </div>
                );
              })}

              {!overview && agents.map((a) => {
                const pos = agentPos[a.id];
                if (!pos) return null;
                const p = w2s(pos.x, pos.y);
                return (
                  <div key={a.id} title={`${a.name || "Agent"} — ${factionName(a.factionId)}`}
                    style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
                    <AgentGlyph factionColor={factionColor(a.factionId)} icon={a.icon} />
                  </div>
                );
              })}

              {fleets.map((f) => {
                const pos = fleetPos[f.id];
                if (!pos) return null;
                const p = w2s(pos.x, pos.y);
                return (
                  <div key={f.id} title={`${f.name || "Fleet"} — ${factionName(f.factionId)} · ${f.shipCount || 0} carrier${f.shipCount === 1 ? "" : "s"}`}
                    style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
                    <FleetGlyph factionId={f.factionId} factionColor={factionColor(f.factionId)} carrierCount={f.shipCount || 0} />
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "8px 14px",
          borderTop: `1px solid ${T.line}`, flexShrink: 0 }}>
          <span style={{ fontSize: 9.5, color: T.faint }}>
            Captured {snapshot.capturedAt ? new Date(snapshot.capturedAt).toLocaleString() : "—"} · drag to pan, scroll to zoom
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            {usedFactions.map((f) => (
              <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: T.mut }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: f.color || T.faint, flexShrink: 0 }} />
                {f.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
