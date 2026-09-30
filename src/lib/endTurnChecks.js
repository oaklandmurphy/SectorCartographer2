// End-of-turn checks (GM Tools → End of Turn Checks). Today the only kind is the
// Ossite Surplus check: one per system carrying the ossite trait, rolled 2d6 and
// passing on a target (2-12, defaulting to 8) to hand its controlling faction +1
// Ossite Surplus when the turn advances. Each system sets its own target via
// `ossiteTarget` — a check is stamped with the system's target at roll time, so
// re-rolling picks up a threshold the GM has since changed. The pure bits live
// here so both App.jsx (which owns the state and applies awards in nextTurn) and
// EndTurnChecksPanel (which displays and lets the GM re-roll or override) agree
// on how a roll is made and read.

export const OSSITE_RESOURCE_NAME = "Ossite Surplus";

// Pass threshold used when a system hasn't set its own (or set an invalid one).
export const OSSITE_DEFAULT_TARGET = 8;

// A system's configured pass threshold, clamped to a sane 2d6 range.
export const ossiteTargetFor = (s) => {
  const t = s && Number(s.ossiteTarget);
  return Number.isFinite(t) ? Math.max(2, Math.min(12, Math.round(t))) : OSSITE_DEFAULT_TARGET;
};

// A single 2d6 roll behind a check.
export const roll2d6 = () => ({ d1: 1 + Math.floor(Math.random() * 6), d2: 1 + Math.floor(Math.random() * 6) });

// The two dice summed — 0 if a check somehow has no roll yet.
export const checkTotal = (c) => (((c && c.dice && c.dice.d1) || 0) + ((c && c.dice && c.dice.d2) || 0));

// Whether a check passed: the GM's manual override wins, otherwise the roll
// passes on the check's stamped target (falling back to the default for checks
// rolled before targets existed).
export const ossiteCheckPassed = (c) => (c && c.override
  ? c.override === "success"
  : checkTotal(c) >= ((c && c.target) || OSSITE_DEFAULT_TARGET));
