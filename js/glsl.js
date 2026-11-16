// ═══════════════════════════════════════════════════════════════
// SDF Magician — GLSL emitter
// Builds the live-preview fragment shader AND the human-readable
// export code from the same scene graph, so what you see is
// literally what you export.
//
// Preview: every layer gets a slot; transforms / params / heights /
// blend radii / modifier params are UNIFORMS, so editing never
// needs a recompile (the renderer lerps them on the GPU side).
// Export:  same graph, literal values, fully commented code.
// ═══════════════════════════════════════════════════════════════

import { getShape } from './shapes.js';

const F = (n) => {
  const v = Number(n) || 0;
  return v.toFixed(4);
};
const RAD = (deg) => (Number(deg) || 0) * Math.PI / 180;

// ── helper library ──────────────────────────────────────────────

const HELPERS = {
  PI: { code: 'const float PI = 3.14159265359;', deps: [] },

  smin: { code: `float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}`, deps: [] },

  smax: { code: `float smax(float a, float b, float k) { return -smin(-a, -b, k); }`, deps: ['smin'] },

  rot2: { code: `vec2 rot2(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c) * p;
}`, deps: [] },

  sdCircle: { code: `float sdCircle(vec2 p, float r) { return length(p) - r; }`, deps: [] },

  sdBox: { code: `float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}`, deps: [] },

  sdRoundedBox: { code: `float sdRoundedBox(vec2 p, vec2 b, float r) {
  r = min(r, min(b.x, b.y));
  return sdBox(p, b - r) - r;
}`, deps: ['sdBox'] },

sdEllipse: { code: `// iq exact method — https://iquilezles.org/articles/distfunctions2d/ (guarded)
float sdEllipse(vec2 p, vec2 ab) {
  if (abs(ab.x - ab.y) < 1e-6) return length(p) - ab.x;   // circle fast path
  p = abs(p); if (p.x > p.y) { p = p.yx; ab = ab.yx; }
  if (p.x == 0.0 && p.y == 0.0) return -min(ab.x, ab.y);
  float l = ab.y*ab.y - ab.x*ab.x;
  float m = ab.x*p.x/l;      float m2 = m*m;
  float n = ab.y*p.y/l;      float n2 = n*n;
  float c = (m2+n2-1.0)/3.0; float c3 = c*c*c;
  float q = c3 + m2*n2*2.0;
  float d = c3 + m2*n2;
  float g = m + m*n2;
  float co;
  if (d < 0.0) {
    float h = acos(clamp(q/c3, -1.0, 1.0))/3.0;
    float s = cos(h);
    float t = sin(h)*sqrt(3.0);
    float rx = sqrt(max(0.0, -c*(s + t + 2.0) + m2));
    float ry = sqrt(max(0.0, -c*(s - t + 2.0) + m2));
    co = (ry + sign(l)*rx + abs(g)/max(rx*ry, 1e-9) - m)/2.0;
  } else {
    float h = 2.0*m*n*sqrt(d);
    float s = sign(q+h)*pow(abs(q+h), 1.0/3.0);
    float u = sign(q-h)*pow(abs(q-h), 1.0/3.0);
    float rx = -s - u - c*4.0 + 2.0*m2;
    float ry = (s - u)*sqrt(3.0);
    float rm = sqrt(max(0.0, rx*rx + ry*ry));
    co = (ry/sqrt(max(rm-rx, 1e-9)) + 2.0*g/max(rm, 1e-9) - m)/2.0;
  }
  co = clamp(co, -1.0, 1.0);
  vec2 r = ab * vec2(co, sqrt(max(0.0, 1.0 - co*co)));
  return length(r-p) * sign(p.y-r.y);
}`, deps: [] },

  sdEquilateralTriangle: { code: `float sdEquilateralTriangle(vec2 p, float r) {
  const float k = sqrt(3.0);
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}`, deps: [] },

  sdRegularPolygon: { code: `float sdRegularPolygon(vec2 p, float r, float n) {
  float an = PI / n;
  float a = mod(atan(p.y, p.x) + an, 2.0 * an) - an;
  vec2 q = length(p) * vec2(cos(a), abs(sin(a)));
  vec2 A = vec2(r * cos(an), -r * sin(an));
  vec2 B = vec2(r * cos(an),  r * sin(an));
  vec2 pa = q - A, ba = B - A;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) * sign(q.x - r * cos(an));
}`, deps: ['PI'] },

  sdStar: { code: `// polar star — smooth boundary, approximate SDF
float sdStar(vec2 p, float r, float n, float inner, float sharp) {
  float a = atan(p.y, p.x);
  float c = cos(a * n);
  float R = r * mix(inner, 1.0, pow(0.5 + 0.5 * c, sharp));
  return length(p) - R;
}`, deps: [] },

  sdHeart: { code: `// inigo quilez — raw shape spans y in [0,1]; recentred on the origin
float sdHeart(vec2 p, float s) {
  p /= s;
  p.y += 0.5;
  p.x = abs(p.x);
  float d;
  if (p.y + p.x > 1.0) {
    d = length(p - vec2(0.25, 0.75)) - 0.353553;
  } else {
    vec2 d1 = p - vec2(0.0, 1.0);
    float m = 0.5 * max(p.x + p.y, 0.0);
    vec2 d2 = p - vec2(m, m);
    d = sqrt(min(dot(d1, d1), dot(d2, d2))) * sign(p.x - p.y);
  }
  return d * s;
}`, deps: [] },

  sdMoon: { code: `float sdMoon(vec2 p, float d, float ra, float rb) {
  return max(length(p) - ra, -(length(p - vec2(d, 0.0)) - rb));
}`, deps: [] },

  sdRing: { code: `float sdRing(vec2 p, float r, float t) { return abs(length(p) - r) - t; }`, deps: [] },

  sdCross: { code: `float sdCross(vec2 p, float w, float arm, float r) {
  float d = min(sdBox(p, vec2(w, arm)), sdBox(p, vec2(arm, w)));
  return d - r;
}`, deps: ['sdBox'] },

  sdRoundedX: { code: `// inigo quilez
float sdRoundedX(vec2 p, float w, float r) {
  p = abs(p);
  return length(p - min(p.x + p.y, w) * 0.5) - r;
}`, deps: [] },

  sdPie: { code: `// inigo quilez — wedge centered on +y axis
float sdPie(vec2 p, float angle, float r) {
  vec2 c = vec2(sin(angle), cos(angle));
  p.x = abs(p.x);
  float l = length(p) - r;
  float m = length(p - c * clamp(dot(p, c), 0.0, r));
  return max(l, m * sign(c.y * p.x - c.x * p.y));
}`, deps: [] },

  sdTrapezoid: { code: `// inigo quilez — r1 bottom half-width, r2 top half-width, he half height
float sdTrapezoid(vec2 p, float r1, float r2, float he) {
  vec2 k1 = vec2(r2, he);
  vec2 k2 = vec2(r2 - r1, 2.0 * he);
  p.x = abs(p.x);
  vec2 ca = vec2(p.x - min(p.x, p.y < 0.0 ? r1 : r2), abs(p.y) - he);
  vec2 cb = p - k1 + k2 * clamp(dot(k1 - p, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}`, deps: [] },

  sdRhombus: { code: `float sdRhombus(vec2 p, float b, float h) {
  p = abs(p);
  vec2 A = vec2(b, 0.0), B = vec2(0.0, h);
  vec2 pa = p - A, ba = B - A;
  float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * t) * sign(p.x / b + p.y / h - 1.0);
}`, deps: [] },

  sdVesica: { code: `// inigo quilez
float sdVesica(vec2 p, float r, float d) {
  p = abs(p);
  float b = sqrt(r * r - d * d);
  return ((p.y - b) * d > p.x * (b - r)) ? length(p - vec2(0.0, b)) - r : length(p - vec2(-d, 0.0)) - r;
}`, deps: [] },

  sdCapsule: { code: `// segment from (-len/2, 0) to (len/2, 0)
float sdCapsule(vec2 p, float len, float r) {
  vec2 pa = p - vec2(-0.5 * len, 0.0);
  vec2 ba = vec2(len, 0.0);
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}`, deps: [] },

  sdLine: { code: `float sdLine(vec2 p, float w) { return abs(p.y) - w; }`, deps: [] },
};

const HELPER_NAMES = Object.keys(HELPERS);

function collectHelpers(used) {
  const out = [];
  const seen = new Set();
  const add = (name) => {
    if (seen.has(name) || !HELPERS[name]) return;
    seen.add(name);
    for (const dep of HELPERS[name].deps) add(dep);
    out.push(HELPERS[name].code);
  };
  for (const name of used) add(name);
  return out.join('\n\n');
}

/** also scan custom user code for helper references so nothing is missing */
function scanCustomCode(code, used) {
  for (const name of HELPER_NAMES) {
    if (code && code.includes(name)) used.add(name);
  }
}

// ── shape → helper call ─────────────────────────────────────────
// each entry: deps + call(q, paramsExpr) — paramsExpr maps key → float expr

const SHAPE_GLSL = {
  circle:   { deps: ['sdCircle'],              argKeys: ['r'],                 call: (q, a) => `sdCircle(${q}, ${a.r})` },
  box:      { deps: ['sdBox'],                 argKeys: ['w', 'h'],            call: (q, a) => `sdBox(${q}, vec2(${a.w}, ${a.h}))` },
  rbox:     { deps: ['sdRoundedBox', 'sdBox'], argKeys: ['w', 'h', 'r'],       call: (q, a) => `sdRoundedBox(${q}, vec2(${a.w}, ${a.h}), ${a.r})` },
  ellipse:  { deps: ['sdEllipse'],             argKeys: ['rx', 'ry'],          call: (q, a) => `sdEllipse(${q}, vec2(${a.rx}, ${a.ry}))` },
  triangle: { deps: ['sdEquilateralTriangle'], argKeys: ['r'],                 call: (q, a) => `sdEquilateralTriangle(${q}, ${a.r})` },
  rhombus:  { deps: ['sdRhombus'],             argKeys: ['b', 'h'],            call: (q, a) => `sdRhombus(${q}, ${a.b}, ${a.h})` },
  capsule:  { deps: ['sdCapsule'],             argKeys: ['len', 'r'],          call: (q, a) => `sdCapsule(${q}, ${a.len}, ${a.r})` },
  line:     { deps: ['sdLine'],                argKeys: ['w'],                 call: (q, a) => `sdLine(${q}, ${a.w})` },
  trapezoid:{ deps: ['sdTrapezoid'],           argKeys: ['r1', 'r2', 'he'],    call: (q, a) => `sdTrapezoid(${q}, ${a.r1}, ${a.r2}, ${a.he})` },
  polygon:  { deps: ['sdRegularPolygon'],      argKeys: ['r', 'n'],            call: (q, a) => `sdRegularPolygon(${q}, ${a.r}, ${a.n})` },
  hexagon:  { deps: ['sdRegularPolygon'],      argKeys: ['r'],                 call: (q, a) => `sdRegularPolygon(${q}, ${a.r}, 6.0)` },
  octagon:  { deps: ['sdRegularPolygon'],      argKeys: ['r'],                 call: (q, a) => `sdRegularPolygon(${q}, ${a.r}, 8.0)` },
  star:     { deps: ['sdStar'],                argKeys: ['r', 'n', 'inner', 'sharp'], call: (q, a) => `sdStar(${q}, ${a.r}, ${a.n}, ${a.inner}, ${a.sharp})` },
  heart:    { deps: ['sdHeart'],               argKeys: ['r'],                 call: (q, a) => `sdHeart(${q}, ${a.r})` },
  moon:     { deps: ['sdMoon'],                argKeys: ['d', 'ra', 'rb'],     call: (q, a) => `sdMoon(${q}, ${a.d}, ${a.ra}, ${a.rb})` },
  ring:     { deps: ['sdRing'],                argKeys: ['r', 't'],            call: (q, a) => `sdRing(${q}, ${a.r}, ${a.t})` },
  cross:    { deps: ['sdCross', 'sdBox'],      argKeys: ['w', 'arm', 'r'],     call: (q, a) => `sdCross(${q}, ${a.w}, ${a.arm}, ${a.r})` },
  roundedx: { deps: ['sdRoundedX'],            argKeys: ['w', 'r'],            call: (q, a) => `sdRoundedX(${q}, ${a.w}, ${a.r})` },
  pie:      { deps: ['sdPie'],                 argKeys: ['r', 'angle'],        call: (q, a) => `sdPie(${q}, ${a.angle}, ${a.r})` },
  vesica:   { deps: ['sdVesica'],              argKeys: ['r', 'd'],            call: (q, a) => `sdVesica(${q}, ${a.r}, ${a.d})` },
};
// int-valued params (snapped, not lerped): sides / points
const INT_PARAMS = new Set(['n']);

const BLEND_LABEL = {
  union: 'union', subtract: 'subtract', intersect: 'intersect', xor: 'xor',
  smooth_union: 'smooth union', smooth_subtract: 'smooth subtract',
  smooth_intersect: 'smooth intersect', replace: 'replace',
};

function blendExpr(blend, a, b, kExpr) {
  switch (blend) {
    case 'union': return `min(${a}, ${b})`;
    case 'subtract': return `max(${a}, -${b})`;
    case 'intersect': return `max(${a}, ${b})`;
    case 'xor': return `max(min(${a}, ${b}), -max(${a}, ${b}))`;
    case 'smooth_union': return `smin(${a}, ${b}, ${kExpr})`;
    case 'smooth_subtract': return `smax(${a}, -${b}, ${kExpr})`;
    case 'smooth_intersect': return `smax(${a}, ${b}, ${kExpr})`;
    case 'replace': return b;
    default: return `min(${a}, ${b})`;
  }
}

const safeIdent = (id) => 'custom_' + String(id).replace(/[^a-zA-Z0-9_]/g, '_');
const isSmooth = (b) => b && b.startsWith('smooth');
const needsSmax = (b) => b === 'smooth_subtract' || b === 'smooth_intersect';
const needsSmin = (b) => b === 'smooth_union';

// ── traversal helpers shared by preview & export ───────────────

/** every item (shape/group/custom/modifier) gets a slot, DFS order */
function assignSlots(scene) {
  const map = new Map();
  let i = 0;
  const walk = (items) => {
    for (const item of items) {
      map.set(item.id, i++);
      if (item.children) walk(item.children);
    }
  };
  walk(scene.items || []);
  return map;
}

function emitItems(items, lines, indent, base, acc, ctx) {
  const ind = '  '.repeat(indent);
  const coordOps = ctx.coordOps;

  for (const item of items) {
    if (!item.visible) continue;
    const slot = ctx.slots.get(item.id);
    const T = item.transform || { x: 0, y: 0, rotation: 0, scale: 1 };
    const scale = T.scale || 1;

    // ── modifiers ───────────────────────────────────────────────
    if (item.kind === 'modifier') {
      const def = getShape(item.shapeId);
      if (def?.modifier === 'field') {
        lines.push(`${ind}// ── ${item.name} · field modifier ──`);
        const tExpr = ctx.uniforms ? `u_p[${slot}].x` : F(item.params?.t ?? item.params?.r ?? 0.1);
        if (def.mod === 'invert') lines.push(`${ind}${acc} = -${acc};`);
        else if (def.mod === 'onion') lines.push(`${ind}${acc} = abs(${acc}) - ${tExpr};`);
        else if (def.mod === 'round') lines.push(`${ind}${acc} = ${acc} - ${tExpr};`);
      } else if (def?.modifier === 'coord') {
        coordOps.push({ type: def.mod, name: item.name });
        lines.push(`${ind}// ▼ ${item.name} — mirrors every layer below this one`);
      }
      continue;
    }

    // ── selectable items (shape / group / custom) ───────────────
    const vc = ctx.vc++;
    const q = `q${vc}`;
    const dv = `d${vc}`;
    const blend = item.blend || 'union';
    const smoothNote = isSmooth(blend) ? ` · k=${ctx.uniforms ? 'u_k' : F(item.k ?? 0.25)}` : '';
    const blendName = BLEND_LABEL[blend] || blend;
    const kExpr = ctx.uniforms ? `u_k[${slot}]` : F(item.k ?? 0.25);

    lines.push(`${ind}// ── ${item.name} · ${blendName}${smoothNote} ──`);
    lines.push(`${ind}vec2 ${q} = ${base};`);
    for (const op of coordOps) {
      if (op.type === 'mirrorX') lines.push(`${ind}${q}.x = abs(${q}.x);   // ${op.name}`);
      else if (op.type === 'mirrorY') lines.push(`${ind}${q}.y = abs(${q}.y);   // ${op.name}`);
      else if (op.type === 'quad') lines.push(`${ind}${q} = abs(${q});   // ${op.name}`);
    }

    // local frame
    if (item.kind === 'group') {
      // groups are pure containers: children already live in world space
      const gd = `gd${vc}`;
      lines.push(`${ind}float ${gd} = 1e9;`);
      const childCtx = { ...ctx, coordOps: [] };
      emitItems(item.children || [], lines, indent + 1, q, gd, childCtx);
      lines.push(`${ind}${acc} = ${blendExpr(blend, acc, gd, kExpr)};`);
      if (ctx.uniforms) {
        lines.push(`${ind}if (u_sel[${slot}] > 0.5 && abs(${gd}) < abs(g_selD)) g_selD = ${gd};`);
      }
      if (needsSmin(blend)) ctx.helpers.add('smin');
      if (needsSmax(blend)) { ctx.helpers.add('smax'); ctx.helpers.add('smin'); }
      continue;
    }

    // transform into the layer's frame
    if (ctx.uniforms) {
      lines.push(`${ind}${q} -= u_t[${slot}].xy;`);
      lines.push(`${ind}${q} = mat2(u_r[${slot}].x, -u_r[${slot}].y, u_r[${slot}].y, u_r[${slot}].x) * ${q};`);  // world → layer frame = R(-θ)
      lines.push(`${ind}${q} /= u_t[${slot}].z;`);
    } else {
      lines.push(`${ind}${q} -= vec2(${F(T.x)}, ${F(T.y)});`);
      if (Math.abs(RAD(T.rotation || 0)) > 1e-6) { lines.push(`${ind}${q} = rot2(${q}, ${F(RAD(T.rotation || 0))});`); ctx.helpers.add('rot2'); }
      if (Math.abs(scale - 1) > 1e-6) lines.push(`${ind}${q} /= ${F(scale)};`);
    }

    // shape / custom call
    let sdfExpr;
    if (item.kind === 'custom') {
      const fname = safeIdent(item.id);
      ctx.customFns.push({ name: fname, layerName: item.name, code: item.params?.code ?? 'return 1e9;' });
      scanCustomCode(item.params?.code, ctx.helpers);
      sdfExpr = `${fname}(${q})`;
    } else {
      const g = SHAPE_GLSL[item.shapeId];
      if (!g) {
        lines.push(`${ind}// !! unknown shape "${item.shapeId}" — skipped (distance = infinity)`);
        sdfExpr = '1e9';
      } else {
        for (const dep of g.deps) ctx.helpers.add(dep);
        // param expressions: uniform slots or literals
        const a = {};
        if (ctx.uniforms) {
          const def = getShape(item.shapeId);
          const keys = def?.params.map(p => p.key) ?? [];
          for (let i = 0; i < keys.length; i++) {
            a[keys[i]] = (i < 4 ? `u_p` : `u_q`) + `[${slot}].` + 'xyzw'[i % 4];
          }
        } else {
          const p = item.params || {};
          for (const key of g.argKeys ?? Object.keys(p)) {
            if (key === 'n') a[key] = F(Math.round(p.n)); else a[key] = F(p[key]);
          }
        }
        sdfExpr = g.call(q, a);
      }
    }

    let dline = `${ind}float ${dv} = ${sdfExpr}`;
    if (ctx.uniforms) {
      dline += ` * u_t[${slot}].z - u_t[${slot}].w`;
    } else {
      if (Math.abs(scale - 1) > 1e-6) dline += ` * ${F(scale)}`;
      if (item.height) dline += ` - ${F(item.height)}`;
    }
    lines.push(dline + ';');

    lines.push(`${ind}${acc} = ${blendExpr(blend, acc, dv, kExpr)};`);
    if (ctx.uniforms) {
      lines.push(`${ind}if (u_sel[${slot}] > 0.5 && abs(${dv}) < abs(g_selD)) g_selD = ${dv};`);
    }
    if (needsSmin(blend)) ctx.helpers.add('smin');
    if (needsSmax(blend)) { ctx.helpers.add('smax'); ctx.helpers.add('smin'); }
  }
}

function emitSceneBody(scene, { mode }) {
  const uniforms = mode === 'preview';
  const lines = [];
  const ctx = {
    vc: 0,
    uniforms,
    helpers: new Set(),
    customFns: [],
    coordOps: [],
    slots: assignSlots(scene),
  };
  lines.push('float sceneSDF(vec2 p) {');
  lines.push('  float d = 1e9;');
  emitItems(scene.items || [], lines, 1, 'p', 'd', ctx);
  lines.push('  return d;');
  lines.push('}');
  return { body: lines.join('\n'), helpers: ctx.helpers, customFns: ctx.customFns, slotCount: ctx.slots.size };
}

/** id → slot map for the preview renderer */
export function slotMap(scene) {
  return assignSlots(scene);
}

const hexToVec3 = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '#000000');
  const int = m ? parseInt(m[1], 16) : 0;
  const r = ((int >> 16) & 255) / 255, g = ((int >> 8) & 255) / 255, b = (int & 255) / 255;
  return `vec3(${F(r)}, ${F(g)}, ${F(b)})`;
};

const indentCode = (code, pad) => code.split('\n').map(l => pad + l).join('\n');

function emitCustomFns(customFns) {
  return customFns.map(({ name, layerName, code }) =>
    `// custom layer "${layerName}" — written by the user, evaluated locally in the layer's frame\nfloat ${name}(vec2 p) {\n${indentCode(code.trimEnd(), '  ')}\n}`
  ).join('\n\n');
}

// ── live-preview fragment shader ────────────────────────────────

export function buildPreviewFragment(scene) {
  const { body, helpers, customFns, slotCount } = emitSceneBody(scene, { mode: 'preview' });
  const helperCode = collectHelpers(helpers);
  const customCode = emitCustomFns(customFns);
  const N = Math.max(1, slotCount);
  return `precision highp float;

uniform vec2  u_resolution;
uniform vec2  u_center;
uniform float u_scale;          // pixels per world unit
uniform float u_falloff;        // gradient range (world units)
uniform float u_steps;          // gradient steps (0 = smooth)
uniform float u_lineEvery;      // contour spacing in world units (0 = off)
uniform float u_lineStrength;   // 0..1
uniform float u_boundaryAlpha;  // strength of the d = 0 line
uniform vec3  u_inside;
uniform vec3  u_outside;
uniform vec3  u_accent;
uniform vec3  u_line;

// per-layer uniforms (slot = DFS order)
uniform vec4  u_t[${N}];        // x, y, scale, height
uniform vec2  u_r[${N}];        // cos(rot), sin(rot)
uniform vec4  u_p[${N}];        // params 0..3
uniform vec4  u_q[${N}];        // params 4..7
uniform float u_k[${N}];        // blend radius (smooth ops)
uniform float u_sel[${N}];      // 1.0 when the layer is selected

float g_selD = 1e9;

${helperCode}
${customCode ? '\n' + customCode + '\n' : ''}
${body}

void main() {
  vec2 p = u_center + (gl_FragCoord.xy - 0.5 * u_resolution) / u_scale;
  float d = sceneSDF(p);

  float px = 1.7 / u_scale;   // ~1.7 px, world units

  // normalized gradient coordinate: 0 = deep inside → 1 = far outside
  float t = clamp(0.5 + 0.5 * d / u_falloff, 0.0, 1.0);
  if (u_steps > 0.5) {
    float n = u_steps;
    float aa = clamp(2.6 * n / (u_falloff * u_scale), 0.03, 0.45);
    float f = t * n;
    float fl = floor(f);
    float fr = smoothstep(0.5 - aa, 0.5 + aa, f - fl);
    t = (fl + fr) / n;
  }

  vec3 base = mix(u_inside, u_outside, t);
  base *= mix(0.88, 1.08, t);            // subtle depth shading

  // contour lines every u_lineEvery world units
  if (u_lineEvery > 0.0001) {
    float w = u_lineEvery;
    float g = abs(fract(d / w + 0.5) - 0.5) * w;
    float line = 1.0 - smoothstep(px * 0.8, px * 2.4, g);
    base = mix(base, u_line, line * u_lineStrength);
  }

  // boundary (the d = 0 line) — bold when nothing is selected, quiet when focused
  float boundary = 1.0 - smoothstep(px * 1.15, px * 3.1, abs(d));
  base = mix(base, u_accent, boundary * u_boundaryAlpha);
  base = mix(base, u_accent, boundary * boundary * 0.22);   // hot core

  // selection highlight — nearest selected layer's boundary
  if (g_selD < 1e8) {
    float sel = 1.0 - smoothstep(px * 1.3, px * 3.6, abs(g_selD));
    base = mix(base, vec3(0.45, 0.88, 0.98), sel * 0.9);
  }

  // vignette — pulls corners back so the field reads as artwork
  vec2 vd = (gl_FragCoord.xy / u_resolution - 0.5) * vec2(1.3, 1.05);
  base *= 1.0 - dot(vd, vd) * 0.52;

  gl_FragColor = vec4(base, 1.0);
}`;
}

// ── export code (literal, readable) ─────────────────────────────

const GLSL_HEADER = (scene) => `// ═════════════════════════════════════════════════════════════
//  SDF Magician · "${scene.name || 'Untitled Scene'}"
//  Exported ${new Date().toISOString().slice(0, 10)} · sdfmagician
//
//  A 2D signed distance field built from ${(scene.items || []).length} layer(s).
//  Sign convention: NEGATIVE inside, POSITIVE outside.
//  Units are world units; the canvas shows roughly [-2.4, 2.4].
//
//  Many distance primitives are adapted from Inigo Quilez's
//  wonderful list: https://iquilezles.org/articles/distfunctions2d
// ═════════════════════════════════════════════════════════════

`;

/** mechanical GLSL→HLSL (SM5) port of the export output; keeps the code readable */
function portGlslToHlsl(src) {
  let out = src;
  // column-major mat2 → row-major shim preserves GLSL semantics exactly
  const shim = '// Auto-ported from GLSL to HLSL (SM5): vecN→floatN, mat2→glslMat2.\n// glslMat2 reproduces GLSL\'s column-major constructor semantics exactly.\nfloat2x2 glslMat2(float a, float b, float c, float d) { return float2x2(a, c, b, d); }\n\n';
  // strip the GLSL-only header comment line about porting? keep header; insert shim after it
  const headerEnd = out.indexOf('\n\n');
  out = out.slice(0, headerEnd + 2) + shim + out.slice(headerEnd + 2);
  out = out
    .replace(/\bmat2\s*\(/g, 'glslMat2(')
    .replace(/\bvec2\b/g, 'float2')
    .replace(/\bvec3\b/g, 'float3')
    .replace(/\bvec4\b/g, 'float4')
    .replace(/\bivec2\b/g, 'int2')
    .replace(/\bivec3\b/g, 'int3');
  out = out
    .replace(/\bmix\s*\(/g, 'lerp(')
    .replace(/\bfract\s*\(/g, 'frac(')
    .replace(/\bmod\s*\(/g, 'fmod(')
    .replace(/\biTime\b/g, '_Time.y');
  return out;
}

export function buildExport(scene, target = 'glsl') {
  const { body, helpers, customFns } = emitSceneBody(scene, { mode: 'export' });
  const helperCode = collectHelpers(helpers);
  const customCode = emitCustomFns(customFns);
  const parts = [GLSL_HEADER(scene)];
  if (helperCode) parts.push(helperCode, '\n');
  if (customCode) parts.push(customCode, '\n');
  parts.push(body);

  if (target === 'shadertoy') {
    parts.push(`
// ── drop-in Shadertoy mainImage ────────────────────────────────
const vec3 INSIDE  = ${hexToVec3(scene.colors?.inside)};
const vec3 OUTSIDE = ${hexToVec3(scene.colors?.outside)};
const vec3 ACCENT  = ${hexToVec3(scene.colors?.accent)};
const vec3 LINE    = ${hexToVec3(scene.colors?.line)};
const float FALLOFF = ${F(scene.contour?.falloff ?? 2.1)};
const float STEPS   = ${F(scene.contour?.steps ?? 16)};   // 0 = smooth
const float LINE_EVERY = ${F(scene.contour?.lineEvery ?? 0.32)};
const float LINE_STRENGTH = ${F(scene.contour?.lineStrength ?? 0.55)};

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 5.0;
  float d = sceneSDF(p);
  float px = 5.0 / iResolution.y * 1.7;

  float t = clamp(0.5 + 0.5 * d / FALLOFF, 0.0, 1.0);
  if (STEPS > 0.5) {
    float aa = clamp(2.6 * STEPS / (FALLOFF * (iResolution.y / 5.0)), 0.03, 0.45);
    float f = t * STEPS;
    float fl = floor(f);
    t = (fl + smoothstep(0.5 - aa, 0.5 + aa, f - fl)) / STEPS;
  }
  vec3 col = mix(INSIDE, OUTSIDE, t);
  col *= mix(0.88, 1.08, t);
  if (LINE_EVERY > 0.0001) {
    float g = abs(fract(d / LINE_EVERY + 0.5) - 0.5) * LINE_EVERY;
    col = mix(col, LINE, (1.0 - smoothstep(px * 0.8, px * 2.4, g)) * LINE_STRENGTH);
  }
  col = mix(col, ACCENT, (1.0 - smoothstep(px * 1.15, px * 3.1, abs(d))) * 0.55);
  fragColor = vec4(col, 1.0);
}
`);
  } else if (target === 'extrude') {
    parts.push(`
// ── 3D extrusion (call sceneSDF3D instead of sceneSDF) ─────────
const float SDF_EXTRUDE_HEIGHT = 0.45;  // half height along Z — edit me
const float SDF_EDGE_ROUND     = 0.10;  // rounded edge radius — edit me

float sceneSDF3D(vec3 p) {
  vec2 w = vec2(sceneSDF(p.xy), abs(p.z) - SDF_EXTRUDE_HEIGHT);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - SDF_EDGE_ROUND;
}
`);
  }

  if (target === 'hlsl') {
    return portGlslToHlsl(parts.join('\n'));
  }
  return parts.join('\n');
}
