// ═══════════════════════════════════════════════════════════════
// SDF Magician — document model: scene graph, history, presets,
// persistence (localStorage) and project import/export
// ═══════════════════════════════════════════════════════════════

import { getShape, defaultParams } from './shapes.js';

export const STORAGE_KEY = 'sdfMagician.scene.v1';

export const BLEND_MODES = [
  { id: 'union',            label: 'Union',            hint: 'A ∪ B — merge shapes' },
  { id: 'subtract',         label: 'Subtract',         hint: 'A − B — carve B out of A' },
  { id: 'intersect',        label: 'Intersect',        hint: 'A ∩ B — keep only overlap' },
  { id: 'xor',              label: 'Exclusive OR',     hint: 'Keep non-overlapping parts' },
  { id: 'smooth_union',     label: 'Smooth Union',     hint: 'Organic blend — k = blend radius' },
  { id: 'smooth_subtract',  label: 'Smooth Subtract',  hint: 'Carve with a soft fillet' },
  { id: 'smooth_intersect', label: 'Smooth Intersect', hint: 'Keep overlap, soft corners' },
  { id: 'replace',          label: 'Replace',          hint: 'Discard everything below' },
];

export const makeId = () => 'l' + Math.random().toString(36).slice(2, 9);
const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

// ── scene factories ─────────────────────────────────────────────

export function emptyScene() {
  return {
    app: 'sdf-magician',
    version: 1,
    name: 'Untitled Scene',
    colors: { inside: '#2dd4bf', outside: '#0b1020', accent: '#f8fafc', line: '#05070f' },
    contour: { falloff: 2.5, steps: 14, lineEvery: 0.5, lineStrength: 0.4 },
    grid: { show: true, axes: true, snap: false },
    items: [],
  };
}

export function createItem(shapeId, nameOverride) {
  const def = getShape(shapeId);
  if (!def) return null;
  const kind = !def ? 'shape' : def.modifier ? 'modifier' : 'shape';
  const item = {
    id: makeId(),
    kind,
    shapeId,
    name: nameOverride || def.name.replace(/ ·.*$/, '').replace(/ \/.*$/, ''),
    visible: true,
    blend: 'union',
    k: 0.28,
    transform: { x: 0, y: 0, rotation: 0, scale: 1 },
    height: 0,
    params: defaultParams(def),
  };
  if (kind === 'modifier') item.k = 0;
  return item;
}

export function createCustomItem() {
  return {
    id: makeId(),
    kind: 'custom',
    shapeId: 'custom',
    name: 'Custom SDF',
    visible: true,
    blend: 'union',
    k: 0.28,
    transform: { x: 0, y: 0, rotation: 0, scale: 1 },
    height: 0,
    params: {
      code: [
        '// p is the LOCAL point (already moved into this layer\u2019s frame).',
        '// Helpers available: sdCircle, sdBox, sdRoundedBox, sdRegularPolygon,',
        '//   sdStar, sdHeart, smin, smax, rot2, plus every shape you can add.',
        '// Return the signed distance as a float — negative is inside.',
        'return length(p) - 0.55;',
      ].join('\n'),
    },
  };
}

export function createGroup(name = 'Group') {
  return {
    id: makeId(),
    kind: 'group',
    shapeId: 'group',
    name,
    visible: true,
    blend: 'union',
    k: 0.28,
    transform: { x: 0, y: 0, rotation: 0, scale: 1 },
    height: 0,
    collapsed: false,
    children: [],
  };
}

// ── preset scenes ───────────────────────────────────────────────

function mk(shapeId, name, x, y, blend, params = {}, extra = {}) {
  const item = createItem(shapeId, name);
  Object.assign(item.transform, { x, y });
  item.blend = blend;
  item.params = { ...item.params, ...params };
  Object.assign(item, extra);
  return item;
}

export const PRESETS = [
  {
    id: 'smiley', name: 'Smiley',
    build() {
      const s = emptyScene();
      s.name = 'Smiley';
      s.colors = { inside: '#fbbf24', outside: '#141006', accent: '#fff7ed', line: '#451a03' };
      s.contour = { falloff: 2.2, steps: 10, lineEvery: 0.45, lineStrength: 0.3 };
      s.items = [
        mk('circle', 'Face', 0, 0.05, 'union', { r: 1.2 }),
        mk('circle', 'Eye · left', -0.44, 0.42, 'subtract', { r: 0.16 }),
        mk('circle', 'Eye · right', 0.44, 0.42, 'subtract', { r: 0.16 }),
        mk('capsule', 'Mouth', 0, -0.42, 'subtract', { len: 0.85, r: 0.09 }),
      ];
      return s;
    },
  },
  {
    id: 'gear', name: 'Gear',
    build() {
      const s = emptyScene();
      s.name = 'Gear';
      s.colors = { inside: '#cbd5e1', outside: '#0b1020', accent: '#f8fafc', line: '#0f172a' };
      s.contour = { falloff: 2.4, steps: 12, lineEvery: 0.4, lineStrength: 0.35 };
      s.items = [
        mk('star', 'Teeth', 0, 0, 'union', { r: 1.02, n: 9, inner: 0.84, sharp: 2.3 }),
        mk('circle', 'Body', 0, 0, 'union', { r: 0.82 }),
        mk('circle', 'Hub hole', 0, 0, 'subtract', { r: 0.34 }),
      ];
      return s;
    },
  },
  {
    id: 'heart', name: 'Heart Charm',
    build() {
      const s = emptyScene();
      s.name = 'Heart Charm';
      s.colors = { inside: '#fb7185', outside: '#1a0710', accent: '#ffe4e6', line: '#4c0519' };
      s.contour = { falloff: 2.3, steps: 12, lineEvery: 0.35, lineStrength: 0.35 };
      s.items = [
        mk('heart', 'Heart', 0, -0.08, 'union', { r: 0.8 }),
        mk('heart', 'Inner cut', 0, -0.02, 'subtract', { r: 0.47 }),
      ];
      return s;
    },
  },
  {
    id: 'ghost', name: 'Little Ghost',
    build() {
      const s = emptyScene();
      s.name = 'Little Ghost';
      s.colors = { inside: '#e2e8f0', outside: '#0b1020', accent: '#22d3ee', line: '#0f172a' };
      s.contour = { falloff: 2.4, steps: 12, lineEvery: 0.4, lineStrength: 0.35 };
      s.items = [
        mk('circle', 'Dome', 0, 0.3, 'union', { r: 0.7 }),
        mk('box', 'Skirt', 0, -0.35, 'union', { w: 0.7, h: 0.62 }),
        mk('circle', 'Eye · left', -0.26, 0.32, 'subtract', { r: 0.11 }),
        mk('circle', 'Eye · right', 0.26, 0.32, 'subtract', { r: 0.11 }),
        mk('circle', 'Mouth', 0, -0.28, 'subtract', { r: 0.09 }),
      ];
      return s;
    },
  },
];

export const demoScene = () => PRESETS.find(p => p.id === 'smiley').build();

// ── tree helpers ────────────────────────────────────────────────

export function findItem(rootItems, id, path = []) {
  for (let i = 0; i < rootItems.length; i++) {
    const item = rootItems[i];
    if (item.id === id) return { item, list: rootItems, index: i, path };
    if (item.kind === 'group' && item.children) {
      const found = findItem(item.children, id, [...path, item]);
      if (found) return found;
    }
  }
  return null;
}

export function findParentGroup(rootItems, id) {
  const found = findItem(rootItems, id);
  return found && found.path.length ? found.path[found.path.length - 1] : null;
}

export function countItems(items) {
  let n = 0;
  for (const item of items) {
    n++;
    if (item.kind === 'group') n += countItems(item.children || []);
  }
  return n;
}

function uniqueName(items, base) {
  const all = [];
  const walk = (list) => list.forEach(i => { all.push(i.name); if (i.children) walk(i.children); });
  walk(items);
  if (!all.includes(base)) return base;
  let n = 2;
  while (all.includes(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

function regenIds(item) {
  item.id = makeId();
  if (item.children) item.children.forEach(regenIds);
}

const rotateVec = (x, y, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c * x - s * y, s * x + c * y];
};

// ── the store ───────────────────────────────────────────────────

class Store {
  constructor() {
    this.scene = emptyScene();
    this.selectedId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }

  // ── lifecycle & events ──────────────────────────────────────
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const clean = sanitizeScene(parsed);
        if (clean) { this.scene = clean; return 'storage'; }
      }
    } catch { /* fall through to demo */ }
    this.scene = demoScene();
    return 'demo';
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(meta = {}) { for (const fn of this.listeners) fn(this.scene, meta); }

  snapshot() { return JSON.stringify(this.scene); }

  checkpoint() {
    const snap = this.snapshot();
    if (this.undoStack.length && this.undoStack[this.undoStack.length - 1] === snap) return;
    this.undoStack.push(snap);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  touch(meta = {}) { this.emit({ ...meta, dirty: true }); }

  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.snapshot());
    this.scene = JSON.parse(this.undoStack.pop());
    if (this.selectedId && !findItem(this.scene.items, this.selectedId)) this.selectedId = null;
    this.emit({ dirty: true, structural: true });
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.snapshot());
    this.scene = JSON.parse(this.redoStack.pop());
    if (this.selectedId && !findItem(this.scene.items, this.selectedId)) this.selectedId = null;
    this.emit({ dirty: true, structural: true });
    return true;
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  // ── scene-level operations ──────────────────────────────────
  setSceneName(name) { this.scene.name = name; this.touch(); }
  setGridFlag(key, value) { this.checkpoint(); this.scene.grid[key] = value; this.touch({ structural: true }); }
  setColors(colors) { Object.assign(this.scene.colors, colors); this.touch(); }
  setContour(contour) { Object.assign(this.scene.contour, contour); this.touch(); }

  clearScene() {
    this.checkpoint();
    const name = 'Untitled Scene';
    this.scene = emptyScene();
    this.scene.name = name;
    this.selectedId = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    this.touch({ structural: true });
  }

  loadPreset(presetId) {
    const preset = PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    this.checkpoint();
    this.scene = preset.build();
    this.selectedId = null;
    this.touch({ structural: true });
  }

  replaceScene(scene) {
    this.checkpoint();
    this.scene = scene;
    this.selectedId = null;
    this.touch({ structural: true });
  }

  // ── item operations ─────────────────────────────────────────
  addShape(shapeId) {
    const item = createItem(shapeId);
    if (!item) return null;
    this.checkpoint();
    item.name = uniqueName(this.scene.items, item.name);
    this.scene.items.push(item);
    this.selectedId = item.id;
    this.touch({ structural: true });
    return item;
  }

  addCustom() {
    this.checkpoint();
    const item = createCustomItem();
    item.name = uniqueName(this.scene.items, item.name);
    this.scene.items.push(item);
    this.selectedId = item.id;
    this.touch({ structural: true });
    return item;
  }

  addModifier(shapeId) { return this.addShape(shapeId); }

  deleteItem(id) {
    const found = findItem(this.scene.items, id);
    if (!found) return;
    this.checkpoint();
    found.list.splice(found.index, 1);
    if (this.selectedId === id) this.selectedId = null;
    this.touch({ structural: true });
  }

  deleteSelected() { if (this.selectedId) this.deleteItem(this.selectedId); }

  duplicateItem(id) {
    const found = findItem(this.scene.items, id);
    if (!found) return null;
    this.checkpoint();
    const copy = clone(found.item);
    regenIds(copy);
    copy.name = uniqueName(this.scene.items, copy.name.replace(/ \d+$/, ''));
    found.list.splice(found.index + 1, 0, copy);
    this.selectedId = copy.id;
    this.touch({ structural: true });
    return copy;
  }

  duplicateSelected() { return this.selectedId ? this.duplicateItem(this.selectedId) : null; }

  toggleVisible(id) {
    const found = findItem(this.scene.items, id);
    if (!found) return;
    this.checkpoint();
    found.item.visible = !found.item.visible;
    this.touch({ structural: true });
  }

  renameItem(id, name) {
    const found = findItem(this.scene.items, id);
    if (!found) return;
    found.item.name = name.slice(0, 64) || 'Layer';
    this.touch();
  }

  setBlend(id, blend) {
    const found = findItem(this.scene.items, id);
    if (!found) return;
    this.checkpoint();
    found.item.blend = blend;
    this.touch({ structural: true });
  }

  setK(id, k) {
    const found = findItem(this.scene.items, id);
    if (!found) return;
    found.item.k = Math.min(1.5, Math.max(0.01, Number(k) || 0.01));
    this.touch();
  }

  setHeight(id, h) {
    const found = findItem(this.scene.items, id);
    if (!found) return;
    found.item.height = Math.min(2, Math.max(-2, Number(h) || 0));
    this.touch();
  }

  setParam(id, key, value) {
    const found = findItem(this.scene.items, id);
    if (!found) return;
    found.item.params[key] = Number(value);
    this.touch();
  }

  setCustomCode(id, code) {
    const found = findItem(this.scene.items, id);
    if (!found) return;
    found.item.params.code = code;
    this.touch({ customCode: true });
  }

  setTransform(id, patch, { checkpoint = true } = {}) {
    const found = findItem(this.scene.items, id);
    if (!found) return;
    if (checkpoint) this.checkpoint();
    Object.assign(found.item.transform, patch);
    this.touch();
  }

  nudgeSelected(dx, dy) {
    if (!this.selectedId) return;
    const found = findItem(this.scene.items, this.selectedId);
    if (!found) return;
    found.item.transform.x += dx;
    found.item.transform.y += dy;
    this.touch();
  }

  toggleCollapsed(id) {
    const found = findItem(this.scene.items, id);
    if (found?.item.kind === 'group') {
      found.item.collapsed = !found.item.collapsed;
      this.touch({ structural: true });
    }
  }

  /** Wrap the selected item in a new group (or create an empty group). */
  groupSelected() {
    this.checkpoint();
    const group = createGroup(uniqueName(this.scene.items, 'Group'));
    if (this.selectedId) {
      const found = findItem(this.scene.items, this.selectedId);
      if (found) {
        found.list.splice(found.index, 1);
        // keep the group near where the layer was
        const parent = found.list === this.scene.items ? this.scene.items : found.list;
        group.transform = { ...found.item.transform };
        // undo the child's own transform now that the group carries it? No —
        // keep child local; just reset child's transform so it stays put visually.
        found.item.transform = { x: 0, y: 0, rotation: 0, scale: 1 };
        group.children.push(found.item);
        parent.splice(Math.min(found.index, parent.length), 0, group);
      } else {
        this.scene.items.push(group);
      }
    } else {
      this.scene.items.push(group);
    }
    this.selectedId = group.id;
    this.touch({ structural: true });
  }

  /** Dissolve a group: children keep world placement via transform composition. */
  ungroupSelected() {
    if (!this.selectedId) return;
    const found = findItem(this.scene.items, this.selectedId);
    if (!found || found.item.kind !== 'group') return;
    this.checkpoint();
    const g = found.item;
    const G = g.transform;
    const gRad = (G.rotation || 0) * Math.PI / 180;
    const gs = G.scale || 1;
    for (const child of g.children) {
      const C = child.transform;
      const cRad = (C.rotation || 0) * Math.PI / 180;
      const [rx, ry] = rotateVec(C.x, C.y, gRad);
      child.transform = {
        x: G.x + gs * rx,
        y: G.y + gs * ry,
        rotation: (G.rotation || 0) + (C.rotation || 0),
        scale: gs * (C.scale || 1),
      };
    }
    found.list.splice(found.index, 1, ...g.children);
    this.selectedId = g.children[0]?.id ?? null;
    this.touch({ structural: true });
  }

  /** Reorder / re-nest via drag & drop. */
  moveItem(id, targetId, position /* 'before' | 'after' | 'inside' */) {
    if (id === targetId) return;
    const src = findItem(this.scene.items, id);
    const dst = findItem(this.scene.items, targetId);
    if (!src || !dst) return;
    // prevent nesting a group into itself or its own descendants
    if (src.item.kind === 'group' && (dst.path || []).some(a => a.id === id)) return;
    this.checkpoint();
    src.list.splice(src.index, 1);
    // re-find destination after removal (indices may shift)
    const dst2 = findItem(this.scene.items, targetId);
    if (!dst2) { this.scene.items.push(src.item); }
    else if (position === 'inside' && dst2.item.kind === 'group') {
      dst2.item.collapsed = false;
      dst2.item.children.push(src.item);
    } else {
      const at = dst2.index + (position === 'after' ? 1 : 0);
      dst2.list.splice(at, 0, src.item);
    }
    this.selectedId = id;
    this.touch({ structural: true });
  }

  moveItemToRoot(id, index) {
    const src = findItem(this.scene.items, id);
    if (!src) return;
    this.checkpoint();
    src.list.splice(src.index, 1);
    const at = Math.min(Math.max(0, index), this.scene.items.length);
    this.scene.items.splice(at, 0, src.item);
    this.selectedId = id;
    this.touch({ structural: true });
  }

  // ── persistence ─────────────────────────────────────────────
  saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, this.snapshot());
      return true;
    } catch {
      return false;
    }
  }

  exportProjectJSON() {
    return JSON.stringify(this.scene, null, 2);
  }

  importProjectJSON(text) {
    const parsed = JSON.parse(text);
    const clean = sanitizeScene(parsed);
    if (!clean) throw new Error('Not a valid SDF Magician project file.');
    this.replaceScene(clean);
    return clean;
  }
}

// ── import sanitizer ────────────────────────────────────────────

const BLEND_IDS = new Set(BLEND_MODES.map(b => b.id));
const clampNum = (v, min, max, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

function sanitizeItem(raw, depth = 0) {
  if (!raw || typeof raw !== 'object' || depth > 12) return null;
  const isGroup = raw.kind === 'group';
  const def = raw.kind === 'custom' ? null : getShape(raw.shapeId);
  if (!isGroup && raw.kind !== 'custom' && !def) return null;

  const item = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
    kind: isGroup ? 'group' : raw.kind === 'custom' ? 'custom' : def.modifier ? 'modifier' : 'shape',
    shapeId: raw.shapeId,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 64) : 'Layer',
    visible: raw.visible !== false,
    blend: BLEND_IDS.has(raw.blend) ? raw.blend : 'union',
    k: clampNum(raw.k, 0.01, 1.5, 0.28),
    transform: {
      x: clampNum(raw.transform?.x, -100, 100, 0),
      y: clampNum(raw.transform?.y, -100, 100, 0),
      rotation: clampNum(raw.transform?.rotation, -3600, 3600, 0),
      scale: clampNum(raw.transform?.scale, 0.01, 50, 1),
    },
    height: clampNum(raw.height, -2, 2, 0),
  };

  if (isGroup) {
    item.collapsed = !!raw.collapsed;
    item.children = (Array.isArray(raw.children) ? raw.children : [])
      .map(c => sanitizeItem(c, depth + 1))
      .filter(Boolean);
  } else if (raw.kind === 'custom') {
    item.params = { code: typeof raw.params?.code === 'string' ? raw.params.code.slice(0, 20000) : 'return 1e9;' };
  } else {
    const params = {};
    for (const prm of def.params) {
      params[prm.key] = clampNum(raw.params?.[prm.key], prm.min, prm.max, prm.def);
    }
    item.params = params;
  }
  return item;
}

export function sanitizeScene(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const items = Array.isArray(raw.items) ? raw.items.map(i => sanitizeItem(i, 0)).filter(Boolean) : [];
  // ensure unique ids
  const seen = new Set();
  const walk = (list) => list.forEach(i => {
    if (seen.has(i.id)) i.id = makeId();
    seen.add(i.id);
    if (i.children) walk(i.children);
  });
  walk(items);
  const hex = (v, dflt) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : dflt);
  return {
    app: 'sdf-magician',
    version: 1,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 80) : 'Untitled Scene',
    colors: {
      inside: hex(raw.colors?.inside, '#2dd4bf'),
      outside: hex(raw.colors?.outside, '#0b1020'),
      accent: hex(raw.colors?.accent, '#f8fafc'),
      line: hex(raw.colors?.line, '#05070f'),
    },
    contour: {
      falloff: clampNum(raw.contour?.falloff, 0.6, 6, 2.5),
      steps: Math.round(clampNum(raw.contour?.steps, 0, 48, 14)),
      lineEvery: clampNum(raw.contour?.lineEvery, 0, 1.5, 0.5),
      lineStrength: clampNum(raw.contour?.lineStrength, 0, 1, 0.4),
    },
    grid: {
      show: raw.grid?.show !== false,
      axes: raw.grid?.axes !== false,
      snap: !!raw.grid?.snap,
    },
    items,
  };
}

export const model = new Store();
