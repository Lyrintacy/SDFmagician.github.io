// ═══════════════════════════════════════════════════════════════
// SDF Magician — shape catalog + JavaScript evaluator
// The JS evaluator mirrors the GLSL helpers in glsl.js so the
// cursor read-out, thumbnail rendering and click-picking all
// agree with what the GPU draws.
// ═══════════════════════════════════════════════════════════════

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dot2 = (x, y) => x * x + y * y;

function rot2(x, y, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c * x - s * y, s * x + c * y];
}

// ── JS mirror of every SDF ──────────────────────────────────────

const JS_SDF = {
  circle: (x, y, P) => Math.hypot(x, y) - P.r,

  box: (x, y, P) => {
    const dx = Math.abs(x) - P.w, dy = Math.abs(y) - P.h;
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
  },

  rbox: (x, y, P) => {
    const r = Math.min(P.r, Math.min(P.w, P.h));
    const dx = Math.abs(x) - (P.w - r), dy = Math.abs(y) - (P.h - r);
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
  },

  ellipse: (x, y, P) => {
    // iq exact method (https://iquilezles.org/articles/distfunctions2d/), guarded
    if (Math.abs(P.rx - P.ry) < 1e-6) return Math.hypot(x, y) - P.rx;   // circle fast path
    if (x === 0 && y === 0) return -Math.min(P.rx, P.ry);
    let pX = Math.abs(x), pY = Math.abs(y);
    let aX = P.rx, aY = P.ry;
    if (pX > pY) { const t = pX; pX = pY; pY = t; const t2 = aX; aX = aY; aY = t2; }
    const l = aY * aY - aX * aX;
    const m = aX * pX / l;            const m2 = m * m;
    const n = aY * pY / l;            const n2 = n * n;
    const c = (m2 + n2 - 1) / 3;      const c3 = c * c * c;
    const q = c3 + m2 * n2 * 2;
    const d = c3 + m2 * n2;
    const g = m + m * n2;
    let co;
    if (d < 0) {
      const h = Math.acos(Math.min(1, Math.max(-1, q / c3))) / 3;
      const s = Math.cos(h);
      const t = Math.sin(h) * Math.sqrt(3);
      const rx = Math.sqrt(Math.max(0, -c * (s + t + 2) + m2));
      const ry = Math.sqrt(Math.max(0, -c * (s - t + 2) + m2));
      co = (ry + Math.sign(l) * rx + Math.abs(g) / Math.max(rx * ry, 1e-9) - m) / 2;
    } else {
      const h = 2 * m * n * Math.sqrt(d);
      const s = Math.sign(q + h) * Math.pow(Math.abs(q + h), 1 / 3);
      const u = Math.sign(q - h) * Math.pow(Math.abs(q - h), 1 / 3);
      const rx = -s - u - c * 4 + 2 * m2;
      const ry = (s - u) * Math.sqrt(3);
      const rm = Math.sqrt(Math.max(0, rx * rx + ry * ry));
      co = (ry / Math.sqrt(Math.max(rm - rx, 1e-9)) + 2 * g / Math.max(rm, 1e-9) - m) / 2;
    }
    co = Math.min(1, Math.max(-1, co));
    const ry2 = Math.sqrt(Math.max(0, 1 - co * co));
    const dx = aX * co - pX, dy = aY * ry2 - pY;
    return Math.hypot(dx, dy) * Math.sign(pY - aY * ry2);
  },

  triangle: (x, y, P) => {
    // equilateral, circumscribed radius P.r (inigo quilez)
    const k = Math.sqrt(3);
    let px = Math.abs(x) - P.r;
    let py = y + P.r / k;
    if (px + k * py > 0) {
      const nx = px - k * py, ny = -k * px - py;
      px = nx / 2; py = ny / 2;
    }
    px -= clamp(px, -2 * P.r, 0);
    return -Math.hypot(px, py) * Math.sign(py);
  },

  polygon: (x, y, P) => {
    const n = Math.max(3, Math.round(P.n));
    const an = Math.PI / n;
    let a = Math.atan2(y, x);
    a = ((a + an) % (2 * an) + 2 * an) % (2 * an) - an;
    const len = Math.hypot(x, y);
    const qx = len * Math.cos(a), qy = Math.abs(len * Math.sin(a));
    const ax = P.r * Math.cos(an), ay = -P.r * Math.sin(an);
    const bx = P.r * Math.cos(an), by = P.r * Math.sin(an);
    const pax = qx - ax, pay = qy - ay, bax = bx - ax, bay = by - ay;
    const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
    const dx = pax - bax * h, dy = pay - bay * h;
    return Math.hypot(dx, dy) * Math.sign(qx - P.r * Math.cos(an));
  },

  hexagon: (x, y, P) => JS_SDF.polygon(x, y, { r: P.r, n: 6 }),
  octagon: (x, y, P) => JS_SDF.polygon(x, y, { r: P.r, n: 8 }),

  star: (x, y, P) => {
    const n = Math.max(3, Math.round(P.n));
    const inner = clamp(P.inner, 0.05, 0.98);
    const sharp = P.sharp ?? 1.6;
    const a = Math.atan2(y, x);
    const c = Math.cos(a * n);
    const R = P.r * (inner + (1 - inner) * Math.pow(0.5 + 0.5 * c, sharp));
    return Math.hypot(x, y) - R;
  },

  heart: (x, y, P) => {
    // inigo quilez sdHeart (raw shape spans y ∈ [0,1]), centered & scaled by P.r
    let px = Math.abs(x) / P.r, py = y / P.r + 0.5;
    let d;
    if (py + px > 1.0) {
      d = Math.hypot(px - 0.25, py - 0.75) - Math.SQRT2 / 4;
    } else {
      const d1 = dot2(px, py - 1.0);
      const m = 0.5 * Math.max(px + py, 0);
      const d2 = dot2(px - m, py - m);
      d = Math.sqrt(Math.min(d1, d2)) * Math.sign(px - py);
    }
    return d * P.r;
  },

  moon: (x, y, P) => {
    // classic crescent: outer circle minus a shifted inner circle
    return Math.max(Math.hypot(x, y) - P.ra, -(Math.hypot(x - P.d, y) - P.rb));
  },

  ring: (x, y, P) => Math.abs(Math.hypot(x, y) - P.r) - P.t,

  cross: (x, y, P) => {
    const a = JS_SDF.box(x, y, { w: P.w, h: P.arm });
    const b = JS_SDF.box(x, y, { w: P.arm, h: P.w });
    return Math.min(a, b) - P.r;
  },

  roundedx: (x, y, P) => {
    const px = Math.abs(x), py = Math.abs(y);
    const m = Math.min(px + py, P.w) * 0.5;
    return Math.hypot(px - m, py - m) - P.r;
  },

  pie: (x, y, P) => {
    // wedge centered on +y axis, half-angle P.angle (radians)
    const angle = P.angle;
    const cx = Math.sin(angle), cy = Math.cos(angle);
    const px = Math.abs(x);
    const l = Math.hypot(px, y) - P.r;
    const cl = clamp(px * cx + y * cy, 0, P.r);
    const m = Math.hypot(px - cx * cl, y - cy * cl);
    return Math.max(l, m * (cy * px - cx * y < 0 ? -1 : 1));
  },

  trapezoid: (x, y, P) => {
    // inigo quilez sdTrapezoid(p, r1=bottom half width, r2=top half width, he=half height)
    const r1 = P.r1, r2 = P.r2, he = P.he;
    const px = Math.abs(x);
    const k1x = r2, k1y = he;
    const k2x = r2 - r1, k2y = 2 * he;
    const cax = px - Math.min(px, y < 0 ? r1 : r2);
    const cay = Math.abs(y) - he;
    const t = clamp(((k1x - px) * k2x + (k1y - y) * k2y) / (k2x * k2x + k2y * k2y), 0, 1);
    const cbx = px - k1x + k2x * t;
    const cby = y - k1y + k2y * t;
    const s = (cbx < 0 && cay < 0) ? -1 : 1;
    return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
  },

  rhombus: (x, y, P) => {
    const px = Math.abs(x), py = Math.abs(y);
    const ax = P.b, ay = 0, bx = 0, by = P.h;
    const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
    const t = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
    const dx = pax - bax * t, dy = pay - bay * t;
    return Math.hypot(dx, dy) * Math.sign(px / P.b + py / P.h - 1);
  },

  vesica: (x, y, P) => {
    // inigo quilez sdVesica(p, r, d)
    const px = Math.abs(x), py = y;
    const r = P.r, d = clamp(P.d, 0.01, P.r * 0.99);
    const b = Math.sqrt(Math.max(r * r - d * d, 0));
    if ((py - b) * d > px * (b - r)) {
      return Math.hypot(px, py - b) - r;
    }
    return Math.hypot(px + d, py) - r;
  },

  capsule: (x, y, P) => {
    // horizontal capsule centered at origin
    const half = P.len * 0.5;
    const qx = Math.abs(x) - half;  // > 0 beyond the segment ends
    if (qx <= 0) return Math.abs(y) - P.r;   // alongside the segment
    return Math.hypot(qx, y) - P.r;          // round caps
  },

  line: (x, y, P) => Math.abs(y) - P.w,
};

// (capsule defined inline above)

// ── shape catalog ───────────────────────────────────────────────
// params: key, label, unit range, default

export const SHAPE_CATEGORIES = [
  { id: 'basic', name: 'Basic' },
  { id: 'polygon', name: 'Polygons & Stars' },
  { id: 'curved', name: 'Curved & Ornamental' },
  { id: 'modifier', name: 'Modifiers · field & symmetry' },
];

export const SHAPES = [
  // ─── Basic ───
  { id: 'circle', name: 'Circle', cat: 'basic',
    params: [{ key: 'r', label: 'Radius', min: 0.05, max: 2.2, step: 0.01, def: 0.72 }] },
  { id: 'box', name: 'Box / Square', cat: 'basic',
    params: [
      { key: 'w', label: 'Half width', min: 0.05, max: 2.2, step: 0.01, def: 0.68 },
      { key: 'h', label: 'Half height', min: 0.05, max: 2.2, step: 0.01, def: 0.48 }] },
  { id: 'rbox', name: 'Rounded Box', cat: 'basic',
    params: [
      { key: 'w', label: 'Half width', min: 0.05, max: 2.2, step: 0.01, def: 0.68 },
      { key: 'h', label: 'Half height', min: 0.05, max: 2.2, step: 0.01, def: 0.48 },
      { key: 'r', label: 'Corner radius', min: 0, max: 1.2, step: 0.01, def: 0.18 }] },
  { id: 'ellipse', name: 'Ellipse', cat: 'basic',
    params: [
      { key: 'rx', label: 'Radius X', min: 0.05, max: 2.2, step: 0.01, def: 0.85 },
      { key: 'ry', label: 'Radius Y', min: 0.05, max: 2.2, step: 0.01, def: 0.5 }] },
  { id: 'triangle', name: 'Equilateral Triangle', cat: 'basic',
    params: [{ key: 'r', label: 'Radius', min: 0.1, max: 2.2, step: 0.01, def: 0.75 }] },
  { id: 'rhombus', name: 'Rhombus / Diamond', cat: 'basic',
    params: [
      { key: 'b', label: 'Half width', min: 0.05, max: 2.2, step: 0.01, def: 0.5 },
      { key: 'h', label: 'Half height', min: 0.05, max: 2.2, step: 0.01, def: 0.68 }] },
  { id: 'capsule', name: 'Capsule', cat: 'basic',
    params: [
      { key: 'len', label: 'Length', min: 0.1, max: 3.5, step: 0.01, def: 1.1 },
      { key: 'r', label: 'Radius', min: 0.03, max: 1.1, step: 0.01, def: 0.24 }] },
  { id: 'line', name: 'Line / Strip', cat: 'basic',
    params: [{ key: 'w', label: 'Half thickness', min: 0.01, max: 1.2, step: 0.01, def: 0.06 }] },
  { id: 'trapezoid', name: 'Trapezoid', cat: 'basic',
    params: [
      { key: 'r1', label: 'Bottom half-width', min: 0.05, max: 2.2, step: 0.01, def: 0.85 },
      { key: 'r2', label: 'Top half-width', min: 0.05, max: 2.2, step: 0.01, def: 0.45 },
      { key: 'he', label: 'Half height', min: 0.05, max: 2.2, step: 0.01, def: 0.55 }] },

  // ─── Polygons & stars ───
  { id: 'polygon', name: 'Regular Polygon', cat: 'polygon',
    params: [
      { key: 'r', label: 'Radius', min: 0.1, max: 2.2, step: 0.01, def: 0.72 },
      { key: 'n', label: 'Sides', min: 3, max: 16, step: 1, def: 5 }] },
  { id: 'hexagon', name: 'Hexagon', cat: 'polygon',
    params: [{ key: 'r', label: 'Radius', min: 0.1, max: 2.2, step: 0.01, def: 0.72 }] },
  { id: 'octagon', name: 'Octagon', cat: 'polygon',
    params: [{ key: 'r', label: 'Radius', min: 0.1, max: 2.2, step: 0.01, def: 0.72 }] },
  { id: 'star', name: 'Star', cat: 'polygon',
    params: [
      { key: 'r', label: 'Outer radius', min: 0.1, max: 2.2, step: 0.01, def: 0.8 },
      { key: 'n', label: 'Points', min: 3, max: 14, step: 1, def: 5 },
      { key: 'inner', label: 'Inner ratio', min: 0.1, max: 0.95, step: 0.01, def: 0.45 },
      { key: 'sharp', label: 'Sharpness', min: 0.5, max: 6, step: 0.05, def: 1.7 }] },

  // ─── Curved & ornamental ───
  { id: 'heart', name: 'Heart', cat: 'curved',
    params: [{ key: 'r', label: 'Size', min: 0.1, max: 1.6, step: 0.01, def: 0.62 }] },
  { id: 'moon', name: 'Moon / Crescent', cat: 'curved',
    params: [
      { key: 'd', label: 'Offset', min: 0.05, max: 1.6, step: 0.01, def: 0.42 },
      { key: 'ra', label: 'Outer radius', min: 0.15, max: 2.0, step: 0.01, def: 0.78 },
      { key: 'rb', label: 'Bite radius', min: 0.15, max: 2.0, step: 0.01, def: 0.7 }] },
  { id: 'ring', name: 'Ring', cat: 'curved',
    params: [
      { key: 'r', label: 'Radius', min: 0.08, max: 2.0, step: 0.01, def: 0.62 },
      { key: 't', label: 'Half thickness', min: 0.02, max: 0.6, step: 0.01, def: 0.11 }] },
  { id: 'cross', name: 'Cross / Plus', cat: 'curved',
    params: [
      { key: 'w', label: 'Arm half length', min: 0.15, max: 2.0, step: 0.01, def: 0.62 },
      { key: 'arm', label: 'Arm half width', min: 0.05, max: 1.0, step: 0.01, def: 0.2 },
      { key: 'r', label: 'Roundness', min: 0, max: 0.3, step: 0.01, def: 0.06 }] },
  { id: 'roundedx', name: 'Rounded X', cat: 'curved',
    params: [
      { key: 'w', label: 'Thickness', min: 0.1, max: 1.4, step: 0.01, def: 0.62 },
      { key: 'r', label: 'Corner radius', min: 0.02, max: 0.5, step: 0.01, def: 0.14 }] },
  { id: 'pie', name: 'Pie / Wedge', cat: 'curved',
    params: [
      { key: 'r', label: 'Radius', min: 0.1, max: 2.2, step: 0.01, def: 0.7 },
      { key: 'angle', label: 'Half angle', min: 0.05, max: 3.1, step: 0.01, def: 0.8, unit: 'rad' }] },
  { id: 'vesica', name: 'Vesica (Lens)', cat: 'curved',
    params: [
      { key: 'r', label: 'Circle radius', min: 0.2, max: 2.2, step: 0.01, def: 0.78 },
      { key: 'd', label: 'Offset', min: 0.05, max: 1.5, step: 0.01, def: 0.42 }] },

  // ─── Modifiers ───
  { id: 'mod_invert', name: 'Invert Field', cat: 'modifier', modifier: 'field', mod: 'invert',
    glyph: '¬', params: [] },
  { id: 'mod_onion', name: 'Onion / Outline', cat: 'modifier', modifier: 'field', mod: 'onion',
    glyph: '◎', params: [{ key: 't', label: 'Outline half-width', min: 0.02, max: 0.6, step: 0.01, def: 0.09 }] },
  { id: 'mod_round', name: 'Round (grow)', cat: 'modifier', modifier: 'field', mod: 'round',
    glyph: '＋', params: [{ key: 'r', label: 'Grow radius', min: 0, max: 0.8, step: 0.01, def: 0.12 }] },
  { id: 'mod_mirrorx', name: 'Mirror X · below', cat: 'modifier', modifier: 'coord', mod: 'mirrorX',
    glyph: '◧', params: [] },
  { id: 'mod_mirrory', name: 'Mirror Y · below', cat: 'modifier', modifier: 'coord', mod: 'mirrorY',
    glyph: '⬒', params: [] },
  { id: 'mod_quad', name: 'Quad symmetry', cat: 'modifier', modifier: 'coord', mod: 'quad',
    glyph: '❖', params: [] },
];

// ── direct-manipulation handles (anchor in LOCAL layer frame) ──
// anchor(P) → [x, y]        where the grab dot sits
// compute(local, P) → value  new param value while dragging
const _hypot = (l) => Math.hypot(l[0], l[1]);
const _absX = (l) => Math.abs(l[0]);
const _absY = (l) => Math.abs(l[1]);

export const SHAPE_HANDLES = {
  circle:    [{ param: 'r',  anchor: P => [P.r, 0],  compute: _hypot }],
  box:       [{ param: 'w',  anchor: P => [P.w, 0],  compute: _absX },
              { param: 'h',  anchor: P => [0, P.h],  compute: _absY }],
  rbox:      [{ param: 'w',  anchor: P => [P.w, 0],  compute: _absX },
              { param: 'h',  anchor: P => [0, P.h],  compute: _absY }],
  ellipse:   [{ param: 'rx', anchor: P => [P.rx, 0], compute: _absX },
              { param: 'ry', anchor: P => [0, P.ry], compute: _absY }],
  triangle:  [{ param: 'r',  anchor: P => [0, P.r],  compute: _hypot }],
  rhombus:   [{ param: 'b',  anchor: P => [P.b, 0],  compute: _absX },
              { param: 'h',  anchor: P => [0, P.h],  compute: _absY }],
  capsule:   [{ param: 'len', anchor: P => [P.len / 2, 0], compute: l => Math.abs(l[0]) * 2 },
              { param: 'r',  anchor: P => [0, P.r],  compute: _absY }],
  line:      [{ param: 'w',  anchor: P => [0, P.w],  compute: _absY }],
  trapezoid: [{ param: 'r2', anchor: P => [P.r2, P.he],  compute: _absX },
              { param: 'r1', anchor: P => [P.r1, -P.he], compute: _absX },
              { param: 'he', anchor: P => [0, P.he],     compute: _absY }],
  polygon:   [{ param: 'r',  anchor: P => [0, P.r],  compute: _hypot }],
  hexagon:   [{ param: 'r',  anchor: P => [0, P.r],  compute: _hypot }],
  octagon:   [{ param: 'r',  anchor: P => [0, P.r],  compute: _hypot }],
  star:      [{ param: 'r',     anchor: P => [0, P.r],        compute: _hypot },
              { param: 'inner', anchor: P => [0, P.r * P.inner], compute: (l, P) => clamp(_hypot(l) / P.r, 0.05, 0.98) }],
  heart:     [{ param: 'r',  anchor: P => [0, -P.r * 0.5], compute: l => _hypot(l) / 0.5 }],
  moon:      [{ param: 'ra', anchor: P => [0, P.ra], compute: _hypot },
              { param: 'rb', anchor: P => [P.d, P.rb], compute: _absY },
              { param: 'd',  anchor: P => [P.d, 0],   compute: l => Math.max(0.05, l[0]) }],
  ring:      [{ param: 'r',  anchor: P => [P.r, 0],     compute: _hypot },
              { param: 't',  anchor: P => [P.r + P.t, 0], compute: (l, P) => _hypot(l) - P.r }],
  cross:     [{ param: 'w',   anchor: P => [P.w, 0],   compute: _absX },
              { param: 'arm', anchor: P => [0, P.arm], compute: _absY }],
  roundedx:  [{ param: 'w',   anchor: P => [P.w * 0.7, P.w * 0.7], compute: l => _hypot(l) / 0.9899 }],
  pie:       [{ param: 'r',     anchor: P => [0, P.r],  compute: _hypot },
              { param: 'angle', anchor: P => [Math.sin(P.angle) * P.r * 0.75, Math.cos(P.angle) * P.r * 0.75],
                compute: l => clamp(Math.abs(Math.atan2(l[0], l[1])), 0.05, 3.1) }],
  vesica:    [{ param: 'd',  anchor: P => [P.d, 0], compute: (l, P) => clamp(_absX(l), 0.05, P.r * 0.99) }],
};

export function getShape(id) {
  return SHAPES.find(s => s.id === id) || null;
}

export function defaultParams(shape) {
  const p = {};
  for (const prm of shape.params || []) p[prm.key] = prm.def;
  return p;
}

export const TAU2 = TAU;

// ── field modifiers (applied to the accumulated distance below) ──

function applyFieldModifier(mod, d, params) {
  switch (mod) {
    case 'invert': return -d;
    case 'onion': return Math.abs(d) - (params.t ?? 0.09);
    case 'round': return d - (params.r ?? 0.12);
    default: return d;
  }
}

// ── transform helpers ───────────────────────────────────────────
// T: {x, y, rotation (deg), scale}

export function worldToLocal(T, x, y) {
  // translate → rotate → unscale (mirrors the GLSL pipeline)
  const dx = x - T.x, dy = y - T.y;
  const a = -((T.rotation || 0) * Math.PI / 180);
  const [rx, ry] = rot2(dx, dy, a);
  const s = T.scale && T.scale !== 0 ? T.scale : 1;
  return [rx / s, ry / s, s];
}

export function applyCoordModifiers(ops, x, y) {
  // ops: array of 'mirrorX' | 'mirrorY' | 'quad' applied to container-space coords
  let px = x, py = y;
  for (const op of ops) {
    if (op === 'mirrorX' || op === 'quad') px = Math.abs(px);
    if (op === 'mirrorY' || op === 'quad') py = Math.abs(py);
  }
  return [px, py];
}

export function blendDistances(blend, a, b, k) {
  switch (blend) {
    case 'union': return Math.min(a, b);
    case 'subtract': return Math.max(a, -b);
    case 'intersect': return Math.max(a, b);
    case 'xor': return Math.max(Math.min(a, b), -Math.max(a, b));
    case 'smooth_union': return smin(a, b, k);
    case 'smooth_subtract': return -smin(-a, b, k); // = smax(a, -b, k)
    case 'smooth_intersect': return smax(a, b, k);
    case 'replace': return b;
    default: return Math.min(a, b);
  }
}

export function smin(a, b, k) {
  if (!(k > 0)) return Math.min(a, b);
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}
export function smax(a, b, k) { return -smin(-a, -b, k); }

// ── evaluate a single leaf (shape/custom) in world coords ──────

export function evalLeaf(item, wx, wy, coordOps) {
  const [mx, my] = applyCoordModifiers(coordOps, wx, wy);
  const T = item.transform;
  const [lx, ly, s] = worldToLocal(T, mx, my);
  let d;
  if (item.kind === 'custom') {
    d = Infinity; // GLSL-only; not measurable on CPU
  } else {
    const fn = JS_SDF[item.shapeId];
    if (!fn) return Infinity;
    d = fn(lx, ly, item.params) * s;
  }
  return d - (item.height || 0);
}

// ── evaluate a container (scene root or group children) ─────────
// returns signed distance of the whole container

export function evalContainer(items, wx, wy) {
  let d = Infinity;
  const coordOps = [];
  for (const item of items) {
    if (!item.visible) continue;

    if (item.kind === 'modifier') {
      const shape = getShape(item.shapeId);
      if (shape?.modifier === 'field') {
        d = applyFieldModifier(shape.mod, d, item.params);
      } else if (shape?.modifier === 'coord') {
        coordOps.push(shape.mod);
      }
      continue;
    }

    let di;
    if (item.kind === 'group') {
      // groups are pure containers — children always live in world space
      di = evalContainer(item.children || [], wx, wy);
    } else {
      di = evalLeaf(item, wx, wy, coordOps);
    }
    d = blendDistances(item.blend || 'union', d, di, item.k ?? 0.25);
  }
  return d;
}

export function evalScene(scene, x, y) {
  return evalContainer(scene.items, x, y);
}
