import { Check, Minus, Plus, Target, Trash2, Trophy, Gauge } from "lucide-react";
import { T, F, inputStyle } from "../theme.js";
import { useConfirm } from "../hooks/useConfirm.jsx";
import Btn from "./ui/Btn.jsx";
import AutoTextarea from "./ui/AutoTextarea.jsx";

// What the players are supposed to be doing to win. Two kinds of objective,
// both GM-managed and visible to everyone:
//   Metrics — ongoing stats with a running point tally. The GM nudges `value`
//     up and down by hand; each unit is worth `pointsPer`.
//   Goals   — large military or narrative events that pay a lump sum of
//     `points` once the GM toggles them achieved.
// Everything is manual for now; squadron/army missions and agent actions will
// eventually feed these automatically.

const num = (v) => Number(v) || 0;
const metricPoints = (o) => num(o.value) * num(o.pointsPer);
const goalPoints = (o) => (o.achieved ? num(o.points) : 0);

const counterBtnStyle = {
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  width: 26, height: 26, border: `1px solid ${T.line}`, borderRadius: 2,
  background: T.panel3, color: T.text, flexShrink: 0,
};
const smallLbl = { fontSize: 10, color: T.faint, textTransform: "uppercase", letterSpacing: ".05em" };

export default function ObjectivesView({ objectives, isGM, isMobile, addObjective, patchObjective, removeObjective }) {
  const confirm = useConfirm();
  const metrics = objectives.filter((o) => o.type !== "goal");
  const goals = objectives.filter((o) => o.type === "goal");
  const total = metrics.reduce((s, o) => s + metricPoints(o), 0) + goals.reduce((s, o) => s + goalPoints(o), 0);
  const achievedCount = goals.filter((g) => g.achieved).length;

  const header = (o, color, placeholder) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "-10px -10px 0", padding: "6px 10px",
      background: `${color}1f`, borderBottom: `2px solid ${color}` }}>
      {isGM ? (
        <input value={o.name} onChange={(e) => patchObjective(o.id, { name: e.target.value })}
          placeholder={placeholder}
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
            fontSize: 14, fontWeight: 800, fontFamily: F.body, letterSpacing: ".05em",
            textTransform: "uppercase", color }} />
      ) : (
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, fontFamily: F.body,
          letterSpacing: ".05em", textTransform: "uppercase", color }}>
          {o.name || "Untitled objective"}
        </div>
      )}
      {isGM && (
        <Btn kind="danger" onClick={async () => { if (await confirm("Remove this objective?")) removeObjective(o.id); }}>
          <Trash2 size={13} />
        </Btn>
      )}
    </div>
  );

  const description = (o) => (isGM ? (
    <AutoTextarea value={o.text || ""} onChange={(e) => patchObjective(o.id, { text: e.target.value })}
      placeholder="Description…" style={{ ...inputStyle, fontSize: 12 }} />
  ) : (o.text ? <div style={{ fontSize: 12, color: T.mut, whiteSpace: "pre-wrap" }}>{o.text}</div> : null));

  const cardStyle = { border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel2,
    padding: 10, display: "flex", flexDirection: "column", gap: 8 };

  const renderMetric = (o) => {
    const value = num(o.value);
    return (
      <div key={o.id} style={cardStyle}>
        {header(o, T.accent, "METRIC NAME…")}
        {description(o)}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {isGM && (
            <button onClick={() => patchObjective(o.id, { value: value - 1 })} title="Decrement" style={counterBtnStyle}>
              <Minus size={13} />
            </button>
          )}
          {isGM ? (
            <input type="number" value={value}
              onChange={(e) => patchObjective(o.id, { value: Math.trunc(Number(e.target.value)) || 0 })}
              style={{ ...inputStyle, width: 64, textAlign: "center", padding: "5px 4px", fontWeight: 800 }} />
          ) : (
            <span className="mono" style={{ fontSize: 18, fontWeight: 800, minWidth: 40, textAlign: "center" }}>{value}</span>
          )}
          {isGM && (
            <button onClick={() => patchObjective(o.id, { value: value + 1 })} title="Increment" style={counterBtnStyle}>
              <Plus size={13} />
            </button>
          )}
          <span style={{ ...smallLbl, marginLeft: 6 }}>× pts each</span>
          {isGM ? (
            <input type="number" value={num(o.pointsPer)}
              onChange={(e) => patchObjective(o.id, { pointsPer: Number(e.target.value) || 0 })}
              style={{ ...inputStyle, width: 56, textAlign: "center", padding: "5px 4px", fontWeight: 800 }} />
          ) : (
            <span className="mono" style={{ fontSize: 12 }}>{num(o.pointsPer)}</span>
          )}
          <span className="mono" style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: T.accent }}>
            = {metricPoints(o)} pts
          </span>
        </div>
      </div>
    );
  };

  const renderGoal = (o) => {
    const on = !!o.achieved;
    const color = on ? T.accent : T.amber;
    return (
      <div key={o.id} style={{ ...cardStyle, opacity: on ? 1 : 0.95 }}>
        {header(o, color, "GOAL NAME…")}
        {description(o)}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={smallLbl}>Reward</span>
          {isGM ? (
            <input type="number" value={num(o.points)}
              onChange={(e) => patchObjective(o.id, { points: Number(e.target.value) || 0 })}
              style={{ ...inputStyle, width: 70, textAlign: "center", padding: "5px 4px", fontWeight: 800 }} />
          ) : (
            <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{num(o.points)}</span>
          )}
          <span style={smallLbl}>pts</span>
          <div style={{ marginLeft: "auto" }}>
            {isGM ? (
              <Btn kind={on ? "primary" : "ghost"} active={on}
                title={on ? "Mark as not achieved" : "Mark as achieved"}
                onClick={() => patchObjective(o.id, { achieved: !on })}>
                <Check size={13} /> {on ? "Achieved" : "Not achieved"}
              </Btn>
            ) : (
              <span className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color }}>
                {on ? "ACHIEVED" : "PENDING"}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const section = (title, Icon, items, render, type, emptyText) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={15} color={T.accent} />
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", fontFamily: F.body }}>
          {title}
        </span>
        <span className="mono" style={{ fontSize: 11, color: T.faint }}>{items.length}</span>
        {isGM && (
          <Btn style={{ marginLeft: "auto" }} onClick={() => addObjective(type)}><Plus size={13} /> Add {type}</Btn>
        )}
      </div>
      {items.length === 0 && (
        <div style={{ fontSize: 12, color: T.faint, padding: "8px 2px" }}>{emptyText}</div>
      )}
      {items.map(render)}
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 12 : 20 }}>
      <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${T.line}`,
          background: T.panel, borderRadius: 2, padding: "12px 14px" }}>
          <Target size={22} color={T.accent} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em" }}>OBJECTIVES</div>
            <div style={{ fontSize: 11, color: T.faint }}>
              {metrics.length} metric{metrics.length === 1 ? "" : "s"} · {achievedCount}/{goals.length} goals achieved
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: 26, fontWeight: 800, color: T.accent, lineHeight: 1 }}>{total}</div>
            <div style={smallLbl}>Total points</div>
          </div>
        </div>
        {section("Metrics", Gauge, metrics, renderMetric, "metric", "No metrics yet. Metrics are ongoing stats that build a running point tally.")}
        {section("Goals", Trophy, goals, renderGoal, "goal", "No goals yet. Goals are large military or narrative events that award a lump sum of points.")}
      </div>
    </div>
  );
}
