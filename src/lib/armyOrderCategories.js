// The categories an Army order is filed under. Labels only for now; they carry
// no mechanical weight, the GM still resolves the order on the odds table.
export const ARMY_ORDER_CATEGORIES = [
  { id: "hold_ground", label: "Hold Ground" },
  { id: "take_ground", label: "Take Ground" },
  { id: "search_destroy", label: "Search and Destroy" },
  { id: "harass_evade", label: "Harass and Evade" },
];

export const armyCategoryLabel = (id) => (ARMY_ORDER_CATEGORIES.find((c) => c.id === id) || {}).label || "";
