import { useState } from "react";

// Persists in-progress composer text (and any small bit of state alongside
// it, like flagged modifiers or committed craft counts) to localStorage under
// `key`, so it survives the component unmounting. App.jsx conditionally
// mounts each tab (`activeTab === "..." && <View .../>`), so switching tabs
// is a real unmount, not just a hidden pane — without this, a half-written
// action request or squadron mission order vanishes the moment a player
// clicks elsewhere. Not for state the app already persists remotely (that
// survives on its own) — only for text sitting nowhere but this browser
// until it's submitted.
//
// `key` may change across renders (e.g. one composer instance reused for
// whichever agent is selected) — when it does, the new key's draft is loaded
// in the same render rather than flashing the old key's text first.
function readDraft(key, fallback) {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function isEmptyDraft(v) {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v).every(isEmptyDraft);
  return false;
}
function writeDraft(key, value) {
  if (!key) return;
  try {
    if (isEmptyDraft(value)) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode, quota) — draft just won't persist
  }
}

// `[value, setValue, clearDraft]` — same shape as useState, plus a
// `clearDraft()` to call once the draft is submitted or explicitly discarded
// so a finished request doesn't leave a stale one behind for next time.
export function useDraft(key, fallback) {
  const [savedKey, setSavedKey] = useState(key);
  const [value, setValue] = useState(() => readDraft(key, fallback));

  if (key !== savedKey) {
    setSavedKey(key);
    setValue(readDraft(key, fallback));
  }

  function update(next) {
    setValue((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      writeDraft(key, resolved);
      return resolved;
    });
  }

  function clearDraft() {
    writeDraft(key, fallback);
    setValue(fallback);
  }

  return [value, update, clearDraft];
}

export { readDraft, writeDraft };
