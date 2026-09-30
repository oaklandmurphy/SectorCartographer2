// Computes a { scale, ox, oy } view that frames a set of world-space points —
// used by "reset view" buttons so they center/zoom to the actual layout
// instead of a fixed hardcoded pan/zoom.
export function fitView(points, containerW, containerH, { minZoom, maxZoom, padding = 80, fallbackScale = 1 } = {}) {
  const fallback = { scale: fallbackScale, ox: containerW / 2, oy: containerH / 2 };
  if (!points.length || containerW <= 0 || containerH <= 0) return fallback;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX, h = maxY - minY;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

  let scale = w > 0 && h > 0
    ? Math.min((containerW - padding * 2) / w, (containerH - padding * 2) / h)
    : fallbackScale;
  if (!isFinite(scale) || scale <= 0) scale = fallbackScale;
  if (minZoom != null) scale = Math.max(minZoom, scale);
  if (maxZoom != null) scale = Math.min(maxZoom, scale);

  return { scale, ox: containerW / 2 - cx * scale, oy: containerH / 2 - cy * scale };
}
