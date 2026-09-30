// Whether a viewer reads an experimentally-edited article (testEditCanon) as its
// live, newly-published content, or as its stashed pre-edit ("old") content —
// the same rule wherever an article can be read: WikiView's own article page,
// the codex list/search cards, and the Timeline. The GM (who writes both sides
// directly) and anyone the GM has actually revealed it to — this entry's own
// testEditRoles, or the GM's global toggle (GM Tools) — see the new
// text (and, for a player, the green/red diff on top of it); everyone else
// reads the old text, as if the edit never happened, until the GM ends
// Experimental Mode for good (see App.jsx's endExperimentalMode).
export function revealsExperimentalEdit(entry, { isGM, viewer, globalExperimentalEditing }) {
  if (!entry || !entry.testEditCanon) return true;
  if (isGM) return true;
  if (globalExperimentalEditing) return true;
  return !!(viewer && viewer.roleId != null && (entry.testEditRoles || []).includes(viewer.roleId));
}
