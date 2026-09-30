import { Bell, Check, CheckCheck, Clock, FileText, VenetianMask, Ship, PackagePlus } from "lucide-react";
import { T } from "../theme.js";
import Btn from "./ui/Btn.jsx";
import { revealsExperimentalEdit } from "../lib/experimentalReveal.js";

const dateTime = (value) => value ? new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium", timeStyle: "short",
}).format(new Date(value)) : "Unknown";

// One acknowledgeable item: an icon, a title line, a "when" line, an Acknowledge
// button and a primary link to jump to the full result. Shared shape for all
// three Updates sections (articles, resolved actions, resolved missions) —
// only the icon, title/subtitle text and the two callbacks differ.
function UpdateCard({ icon, title, subtitle, when, isMobile, onAcknowledge, onOpen, openLabel }) {
  return (
    <div style={{ border: `1px solid ${T.line}`, background: T.panel, padding: "13px 14px", display: "flex", gap: 12, alignItems: "center" }}>
      {icon}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="stencil" style={{ fontSize: 16, letterSpacing: ".04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 12, color: T.mut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{subtitle}</div>
        )}
        <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 4, fontSize: 10.5, color: T.faint }}>
          <Clock size={11} /> {when}
        </div>
      </div>
      <Btn title="Dismiss without opening" onClick={onAcknowledge}>
        <Check size={14} /> {!isMobile && "Acknowledge"}
      </Btn>
      <Btn kind="primary" onClick={onOpen}>{openLabel}</Btn>
    </div>
  );
}

// A counted section header: icon, stencil label, count, and an "Acknowledge
// all" button that only shows once there's something to clear.
function SectionHeader({ icon, label, count, isMobile, onAcknowledgeAll }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {icon}
      <div className="stencil" style={{ fontSize: 15, letterSpacing: ".05em", flex: 1 }}>{label} ({count})</div>
      {count > 0 && (
        <Btn onClick={onAcknowledgeAll} title={`Dismiss every ${label.toLowerCase()} entry below without opening it`}>
          <CheckCheck size={14} /> {!isMobile && "Acknowledge all"}
        </Btn>
      )}
    </div>
  );
}

export default function UpdatesView({
  articles, factionName, isMobile, openArticle, acknowledgeArticle, acknowledgeAll,
  isGM, viewer, globalExperimentalEditing,
  resolvedActions, openAction, acknowledgeAction, acknowledgeAllActions,
  resolvedMissions, openMission, acknowledgeMission, acknowledgeAllMissions,
  replenishments, openReplenishment, acknowledgeReplenishment, acknowledgeAllReplenishments,
  hauntedUpdates, dismissHauntedUpdate,
  hauntedActions, openHauntedAction, dismissHauntedAction,
}) {
  // An article notifying a non-revealed viewer while under active Experimental
  // Editing announces itself under its old (pre-edit) title — same rule as the
  // Codex and Timeline; see lib/experimentalReveal.js.
  const titleOf = (a) => (revealsExperimentalEdit(a, { isGM, viewer, globalExperimentalEditing })
    ? a.title : (a.testEditBeforeTitle || a.title));
  const actions = resolvedActions || [];
  const missions = resolvedMissions || [];
  const replen = replenishments || [];
  const haunts = hauntedUpdates || [];
  const actionHaunts = hauntedActions || [];
  // Real unseen resolved actions and haunted fake ones (GM Tools' kind:
  // "action" — a phantom ruling planted on one of this player's own agents),
  // interleaved by date so a planted one reads as just another resolution.
  const actionItems = [
    ...actions.map((a) => ({ real: a, when: a.resolvedAt || 0 })),
    ...actionHaunts.map((h) => ({ haunt: h, when: h.createdAt || 0 })),
  ].sort((a, b) => b.when - a.when);
  // Real unseen articles and haunted fake ones, interleaved by date so a
  // planted entry reads as just another new article rather than a separate,
  // obviously-labeled category.
  const articleItems = [
    ...(articles || []).map((a) => ({ real: a, when: a.updatedAt || a.createdAt || 0 })),
    ...haunts.map((h) => ({ haunt: h, when: h.createdAt || 0 })),
  ].sort((a, b) => b.when - a.when);
  return (
    <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: isMobile ? 14 : 24 }}>
      <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bell size={22} color={T.accent} />
          <div className="stencil" style={{ fontSize: 20, letterSpacing: ".05em", flex: 1 }}>UPDATES</div>
        </div>

        {!factionName ? null : (
          <>
            {/* Resolved action requests and resolved squadron missions are their
                own counters, separate from the codex counter below — a player
                should be able to tell "the GM ruled on something" apart from
                "there's new lore to read" at a glance. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <SectionHeader icon={<VenetianMask size={18} color={T.accent} />} label="Action requests resolved"
                count={actionItems.length} isMobile={isMobile} onAcknowledgeAll={acknowledgeAllActions} />
              {actionItems.length === 0 ? (
                <div style={{ border: `1px dashed ${T.line}`, color: T.faint, padding: "16px", textAlign: "center", fontSize: 12 }}>
                  No unread resolutions.
                </div>
              ) : actionItems.map((item) => item.haunt ? (
                // A "haunted" action (GM Tools' kind: "action") — a phantom
                // ruling with no real request behind it, permanently on that
                // agent's card in AgentsView (see phantomActionsFor there).
                // Both buttons here just dismiss this Updates notification and
                // jump to the agent, same as a real one would.
                <UpdateCard key={item.haunt.id} isMobile={isMobile}
                  icon={<VenetianMask size={18} color={T.accent} style={{ flexShrink: 0 }} />}
                  title={item.haunt.message || "Action request"}
                  subtitle={item.haunt.agentName}
                  when={`Resolved ${dateTime(item.haunt.createdAt)}`}
                  onAcknowledge={() => dismissHauntedAction(item.haunt.id)}
                  onOpen={() => { dismissHauntedAction(item.haunt.id); openHauntedAction(item.haunt); }}
                  openLabel="View" />
              ) : (
                <UpdateCard key={item.real.id} isMobile={isMobile}
                  icon={<VenetianMask size={18} color={T.accent} style={{ flexShrink: 0 }} />}
                  title={item.real.text || "Action request"}
                  subtitle={item.real.agentName}
                  when={`Resolved ${dateTime(item.real.resolvedAt)}`}
                  onAcknowledge={() => acknowledgeAction(item.real)}
                  onOpen={() => openAction(item.real.agentId, item.real.factionId)}
                  openLabel="View" />
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <SectionHeader icon={<Ship size={18} color={T.accent} />} label="Squadron missions resolved"
                count={missions.length} isMobile={isMobile} onAcknowledgeAll={acknowledgeAllMissions} />
              {missions.length === 0 ? (
                <div style={{ border: `1px dashed ${T.line}`, color: T.faint, padding: "16px", textAlign: "center", fontSize: 12 }}>
                  No unread resolutions.
                </div>
              ) : missions.map((m) => (
                <UpdateCard key={m.id} isMobile={isMobile}
                  icon={<Ship size={18} color={T.accent} style={{ flexShrink: 0 }} />}
                  title={m.text || "Squadron mission"}
                  subtitle={m.fleetName}
                  when={`Resolved ${dateTime(m.resolvedAt)}`}
                  onAcknowledge={() => acknowledgeMission(m)}
                  onOpen={() => openMission(m.fleetId)}
                  openLabel="View" />
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <SectionHeader icon={<PackagePlus size={18} color={T.accent} />} label="Strike craft replenished"
                count={replen.length} isMobile={isMobile} onAcknowledgeAll={acknowledgeAllReplenishments} />
              {replen.length === 0 ? (
                <div style={{ border: `1px dashed ${T.line}`, color: T.faint, padding: "16px", textAlign: "center", fontSize: 12 }}>
                  No new resupply.
                </div>
              ) : replen.map((r) => (
                <UpdateCard key={r.id} isMobile={isMobile}
                  icon={<PackagePlus size={18} color={T.accent} style={{ flexShrink: 0 }} />}
                  title={r.fleetName || "Fleet"}
                  subtitle={r.systemName ? `${r.summary} · ${r.systemName}` : r.summary}
                  when={`Replenished ${dateTime(r.revealedAt)}`}
                  onAcknowledge={() => acknowledgeReplenishment(r)}
                  onOpen={() => openReplenishment(r.fleetId)}
                  openLabel="View" />
              ))}
            </div>
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FileText size={18} color={T.accent} />
          <div className="stencil" style={{ fontSize: 15, letterSpacing: ".05em", flex: 1 }}>CODEX ARTICLES ({articleItems.length})</div>
          {articles.length > 0 && (
            <Btn onClick={acknowledgeAll} title="Dismiss every real article below without reading it">
              <CheckCheck size={14} /> {!isMobile && "Acknowledge all"}
            </Btn>
          )}
        </div>
        {!factionName ? null : articleItems.length === 0 ? (
          <div style={{ border: `1px dashed ${T.line}`, color: T.faint, padding: "28px 16px", textAlign: "center", fontSize: 12 }}>
            Your faction is caught up.
          </div>
        ) : articleItems.map((item) => item.haunt ? (
          // A "haunted" update (GM Tools' kind: "update") — indistinguishable
          // from a real article notification. Neither button here does what it
          // looks like it does: there's no real page behind it, so both
          // Acknowledge and Read just make it vanish (dismissHauntedUpdate,
          // from App.jsx — stamps seenAt so it doesn't come back).
          <UpdateCard key={item.haunt.id} isMobile={isMobile}
            icon={<FileText size={18} color={T.accent} style={{ flexShrink: 0 }} />}
            title={item.haunt.title || "Untitled"}
            when={`Updated ${dateTime(item.haunt.createdAt)}`}
            onAcknowledge={() => dismissHauntedUpdate(item.haunt.id)}
            onOpen={() => dismissHauntedUpdate(item.haunt.id)}
            openLabel="Read" />
        ) : (
          <UpdateCard key={item.real.id} isMobile={isMobile}
            icon={<FileText size={18} color={T.accent} style={{ flexShrink: 0 }} />}
            title={titleOf(item.real) || "Untitled"}
            when={`Updated ${dateTime(item.real.updatedAt || item.real.createdAt)}`}
            onAcknowledge={() => acknowledgeArticle(item.real)}
            onOpen={() => openArticle(item.real.id)}
            openLabel="Read" />
        ))}
      </div>
    </div>
  );
}
