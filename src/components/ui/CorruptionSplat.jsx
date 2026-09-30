// A flat, plain white jagged splat blotting out from a corrupted system — the
// map's answer to CorruptedArt/CorruptedTag for something that reads as a
// *place*, not just an icon: rather than only swapping the plate for a
// broken-image square (see MapPieces.jsx's SystemPlate), the surface around
// it looks like it's been struck off, exposing bare white underneath — the
// same flat, unstyled white CorruptedArt/CorruptedTag already stand for,
// spreading well past the system's own footprint instead of staying inside
// it. One solid shape, one flat fill, no outline, no shadow, no gradient —
// deliberately plain rather than a rendered "sticker".
//
// The shape's *extent* is a real Voronoi cell, not an arbitrary blob: given
// `neighbors` (every other system's screen position relative to this one —
// see MapCanvas's call site), the splat is clipped to whichever side of each
// neighbor's perpendicular bisector is closer to this system, exactly like a
// Voronoi diagram's cell construction (successive half-plane intersection).
// So the whiteout only ever covers ground that's actually closer to the
// corrupted system than to any other system on the map — it visibly shrinks
// toward a crowded system and balloons out from an isolated one, which reads
// as the corruption claiming "its" territory rather than a fixed-size icon
// effect. `reach` caps how far it can balloon (an isolated system's true
// Voronoi cell is unbounded) and is also the fallback size when `neighbors`
// isn't supplied at all.
//
// The cell itself is a clean convex polygon; the jaggedness is layered on
// top by pulling extra points along each edge inward toward the shape's own
// center. Inward-only is deliberate, not just a style choice — it guarantees
// the jagged outline never pokes outside the true Voronoi boundary, so the
// "only what's closer to this system" guarantee from the clip step actually
// holds for the shape that gets drawn, not just its unjagged skeleton.
//
// Shape is derived from a seeded PRNG keyed on the system's id, not
// Math.random() — otherwise every re-render (a drag elsewhere on the map, a
// prop update) would reshuffle the splat, which reads as noise rather than a
// fixed, worsening blot. Same system always draws the same jaggedness; only
// the underlying Voronoi bound moves, and only when a system actually moves.
//
// Purely decorative: absolutely positioned over the piece, centered on it,
// pointer-events:none so it never steals the system's own click/drag target.

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// mulberry32 — small, fast, good enough spread for a decorative shape (not
// cryptography); deterministic per seed, which is the only property that
// actually matters here.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sutherland-Hodgman: clips convex polygon `poly` to the half-plane
// a*x + b*y <= c, i.e. keeps only the side of the line closer to the origin
// when (a,b,c) is a Voronoi bisector (see voronoiCell below).
function clipHalfPlane(poly, a, b, c) {
  if (poly.length === 0) return poly;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i], prev = poly[(i - 1 + poly.length) % poly.length];
    const dCur = a * cur[0] + b * cur[1] - c;
    const dPrev = a * prev[0] + b * prev[1] - c;
    const curIn = dCur <= 0, prevIn = dPrev <= 0;
    if (curIn !== prevIn) {
      const t = dPrev / (dPrev - dCur);
      out.push([prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]);
    }
    if (curIn) out.push(cur);
  }
  return out;
}

// This system's Voronoi cell, in screen pixels relative to its own position
// (the origin) — every point in the returned polygon is closer to (0,0) than
// to any [nx, ny] in `neighbors`. Starts from a big square and clips it down
// once per neighbor (the perpendicular-bisector half-plane, standard Voronoi
// construction), then clips again against a `reach`-radius decagon so an
// isolated system's unbounded cell still ends up something sane to draw.
function voronoiCell(neighbors, reach) {
  const R = reach * 1.6;
  let poly = [[-R, -R], [R, -R], [R, R], [-R, R]];
  for (const [nx, ny] of neighbors) {
    if (nx === 0 && ny === 0) continue; // guard against a same-position dupe
    const c = (nx * nx + ny * ny) / 2;
    poly = clipHalfPlane(poly, nx, ny, c);
    if (poly.length === 0) return poly;
  }
  const CAP_SIDES = 10;
  for (let k = 0; k < CAP_SIDES; k++) {
    const theta = (k / CAP_SIDES) * Math.PI * 2;
    poly = clipHalfPlane(poly, Math.cos(theta), Math.sin(theta), reach);
    if (poly.length === 0) return poly;
  }
  return poly;
}

// Adds jagged inward notches along each edge of a convex polygon. Every
// inserted point is pulled toward the polygon's own centroid, which for a
// convex shape guarantees it stays inside — the jagged result is always a
// subset of `poly`, never wider than it.
function jaggedize(rng, poly) {
  if (poly.length < 3) return poly;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    out.push(a);
    const notches = 1 + Math.floor(rng() * 2); // 1-2 jagged notches per edge
    for (let k = 1; k <= notches; k++) {
      const t = k / (notches + 1);
      const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
      const pull = 0.1 + rng() * 0.24; // inward only, see comment above
      out.push([px + (cx - px) * pull, py + (cy - py) * pull]);
    }
  }
  return out;
}

export default function CorruptionSplat({ seed, neighbors, reach = 70 }) {
  const rng = mulberry32(hashSeed(String(seed)));
  const cell = voronoiCell(neighbors || [], reach);
  // Degenerate fallback (a neighbor sitting exactly on top of this system,
  // or some other edge case that clips the cell to nothing) — a small plain
  // jagged square beats rendering nothing.
  const base = cell.length >= 3 ? cell : [[-reach * 0.18, -reach * 0.18], [reach * 0.18, -reach * 0.18],
    [reach * 0.18, reach * 0.18], [-reach * 0.18, reach * 0.18]];
  const pts = jaggedize(rng, base);
  const box = reach * 3.4; // generous — an isolated system's cell can reach all the way to `reach`
  const cx = box / 2, cy = box / 2;
  const d = `M ${pts.map((p) => `${p[0] + cx},${p[1] + cy}`).join(" L ")} Z`;
  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`}
      style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
        overflow: "visible", pointerEvents: "none", zIndex: 0 }}>
      <path d={d} fill="#fff"
        style={{ animation: "corruption-pulse 5.4s ease-in-out infinite", transformOrigin: `${cx}px ${cy}px` }} />
    </svg>
  );
}
