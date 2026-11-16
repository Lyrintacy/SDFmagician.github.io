// ═══════════════════════════════════════════════════════════════
// SDF Magician — document model: scene graph, history, presets,
// multi-selection, persistence, project import/export
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
    version: 2,
    name: 'Untitled Scene',
    colors: { inside: '#42536e', outside: '#c87c2c', accent: '#ffffff', line: '#16100a' },
    contour: { falloff: 2.1, steps: 16, lineEvery: 0.32, lineStrength: 0.55 },
    grid: { show: true, axes: true, snap: false },
    items: [],
  };
}

export function createItem(shapeId, nameOverride) {
  const def = getShape(shapeId);
  if (!def) return null;
  const kind = def.modifier ? 'modifier' : 'shape';
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
        '// p is the LOCAL point (already moved into this layer’s frame).',
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
      s.colors = { inside: '#d99a2b', outside: '#241505', accent: '#ffe9c2', line: '#170c02' };
      s.contour = { falloff: 2.1, steps: 14, lineEvery: 0.3, lineStrength: 0.5 };
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
      s.colors = { inside: '#4a5568', outside: '#c87c2c', accent: '#ffffff', line: '#16100a' };
      s.contour = { falloff: 2.1, steps: 16, lineEvery: 0.32, lineStrength: 0.55 };
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
      s.colors = { inside: '#8a3b4d', outside: '#c87c2c', accent: '#ffe4e6', line: '#16100a' };
      s.contour = { falloff: 2.1, steps: 16, lineEvery: 0.3, lineStrength: 0.55 };
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
      s.colors = { inside: '#556279', outside: '#1b1104', accent: '#a5f3fc', line: '#140c04' };
      s.contour = { falloff: 2.1, steps: 14, lineEvery: 0.32, lineStrength: 0.5 };
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

/** every selectable item under the given ids (groups count, leaves count) — DFS order */
export function collectSelectedItems(items, selectedIds) {
  const out = [];
  const wanted = new Set(selectedIds);
  const walk = (list) => {
    for (const item of list) {
      if (wanted.has(item.id)) out.push(item);
      if (item.children) walk(item.children);
    }
  };
  walk(items);
  return out;
}

/** world-space centroid of a mixed selection (leaves + group contents) */
export function selectionCentroid(items, selectedIds) {
  const wanted = new Set(selectedIds);
  let sx = 0, sy = 0, n = 0;
  const walk = (list) => {
    for (const item of list) {
      if (item.kind === 'group') {
        if (wanted.has(item.id)) {
          // count every descendant drawable leaf of a selected group
          const collect = (l) => l.forEach(i => {
            if (i.kind === 'group') return collect(i.children || []);
            if (i.kind === 'modifier') return;
            sx += i.transform.x; sy += i.transform.y; n++;
          });
          collect(item.children || []);
        } else {
          walk(item.children || []);
        }
        continue;
      }
      if (wanted.has(item.id) && item.kind !== 'modifier') { sx += item.transform.x; sy += item.transform.y; n++; }
    }
  };
  walk(items);
  return n ? { x: sx / n, y: sy / n, count: n } : null;
}

// ── the store ───────────────────────────────────────────────────

class Store {
  constructor() {
    this.scene = emptyScene();
    this.selectedIds = [];
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }

  // ── selection ───────────────────────────────────────────────
  /** primary = last-clicked selection (drives gizmos / single-edit inspector) */
  get selectedId() { return this.selectedIds[this.selectedIds.length - 1] ?? null; }
  set selectedId(v) { this.selectedIds = v == null ? [] : [v]; }

  isSelected(id) { return this.selectedIds.includes(id); }
  selCount() { return this.selectedIds.length; }
  clearSelection() { this.selectedIds = []; }
  selectOnly(id) { this.selectedIds = id ? [id] : []; }
  toggleSelected(id) {
    const i = this.selectedIds.indexOf(id);
    if (i >= 0) this.selectedIds.splice(i, 1);
    else this.selectedIds.push(id);
  }
  selectAll() {
    this.selectedIds = [];
    const walk = (list) => list.forEach(i => { if (i.kind !== 'modifier') this.selectedIds.push(i.id); if (i.children) walk(i.children); });
    walk(this.scene.items);
  }
  selectedItems() {
    const out = [];
    for (const id of this.selectedIds) {
      const f = findItem(this.scene.items, id);
      if (f) out.push(f.item);
    }
    return out;
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

  _validateSelection() {
    this.selectedIds = this.selectedIds.filter(id => findItem(this.scene.items, id));
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.snapshot());
    this.scene = JSON.parse(this.undoStack.pop());
    this._validateSelection();
    this.emit({ dirty: true, structural: true });
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.snapshot());
    this.scene = JSON.parse(this.redoStack.pop());
    this._validateSelection();
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
    this.scene = emptyScene();
    this.selectedIds = [];
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    this.touch({ structural: true });
  }

  loadPreset(presetId) {
    const preset = PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    this.checkpoint();
    this.scene = preset.build();
    this.selectedIds = [];
    this.touch({ structural: true });
  }

  replaceScene(scene) {
    this.checkpoint();
    this.scene = scene;
    this.selectedIds = [];
    this.touch({ structural: true });
  }

  // ── item operations ─────────────────────────────────────────
  addShape(shapeId) {
    const item = createItem(shapeId);
    if (!item) return null;
    this.checkpoint();
    item.name = uniqueName(this.scene.items, item.name);
    this.scene.items.push(item);
    this.selectedIds = [item.id];
    this.touch({ structural: true });
    return item;
  }

  addCustom() {
    this.checkpoint();
    const item = createCustomItem();
    item.name = uniqueName(this.scene.items, item.name);
    this.scene.items.push(item);
    this.selectedIds = [item.id];
    this.touch({ structural: true });
    return item;
  }

  addModifier(shapeId) { return this.addShape(shapeId); }

  deleteItem(id) {
    const found = findItem(this.scene.items, id);
    if (!found) return;
    this.checkpoint();
    found.list.splice(found.index, 1);
    this.selectedIds = this.selectedIds.filter(s => s !== id);
    this.touch({ structural: true });
  }

  deleteSelected() {
    if (!this.selectedIds.length) return;
    this.checkpoint();
    const ids = new Set(this.selectedIds);
    const prune = (list) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const it = list[i];
        if (ids.has(it.id)) { list.splice(i, 1); continue; }
        if (it.children) prune(it.children);
      }
    };
    prune(this.scene.items);
    this.selectedIds = [];
    this.touch({ structural: true });
  }

  duplicateSelected() {
    if (!this.selectedIds.length) return;
    this.checkpoint();
    const newIds = [];
    const dupAfter = (list, i) => {
      const original = list[i];
      if (!this.selectedIds.includes(original.id)) return;
      const copy = clone(original);
      regenIds(copy);
      copy.name = uniqueName(this.scene.items, copy.name.replace(/ \d+$/, ''));
      list.splice(i + 1, 0, copy);
      newIds.push(copy.id);
    };
    // clone each selected subtree whole, in-place
    const walk = (list) => {
      for (let i = list.length - 1; i >= 0; i--) {
        if (this.selectedIds.includes(list[i].id)) { dupAfter(list, i); continue; }
        if (list[i].children) walk(list[i].children);
      }
    };
    walk(this.scene.items);
    this.selectedIds = newIds;
    this.touch({ structural: true });
    return newIds;
  }

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

  /** apply a value to every selected item that supports it */
  setBlendForSelection(blend) {
    this.checkpoint();
    for (const id of this.selectedIds) {
      const f = findItem(this.scene.items, id);
      if (f && f.item.kind !== 'modifier') f.item.blend = blend;
    }
    this.touch({ structural: true });
  }

  setK(id, k) {
    const found = findItem(this.scene.items, id);
    if (!found) return;
    found.item.k = Math.min(1.5, Math.max(0.01, Number(k) || 0.01));
    this.touch();
  }

  setKForSelection(k) {
    const kk = Math.min(1.5, Math.max(0.01, Number(k) || 0.01));
    for (const id of this.selectedIds) {
      const f = findItem(this.scene.items, id);
      if (f && f.item.kind !== 'modifier') f.item.k = kk;
    }
    this.touch();
  }

  setHeight(id, h) {
    const found = findItem(this.scene.items, id);
    if (!found) return;
    found.item.height = Math.min(50, Math.max(-50, Number(h) || 0));
    this.touch();
  }

  setHeightForSelection(h) {
    const hh = Math.min(50, Math.max(-50, Number(h) || 0));
    for (const id of this.selectedIds) {
      const f = findItem(this.scene.items, id);
      if (f && f.item.kind !== 'modifier' && f.item.kind !== 'group') f.item.height = hh;
    }
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

  /** translate every selected drawable (groups move their contents) */
  nudgeSelected(dx, dy) {
    if (!this.selectedIds.length) return;
    this._eachSelectedTransformable((item) => {
      item.transform.x += dx;
      item.transform.y += dy;
    });
    this.touch();
  }

  rotateSelectedBy(deltaDeg, pivot) {
    if (!this.selectedIds.length) return;
    const rad = (deltaDeg || 0) * Math.PI / 180;
    const c = pivot || this.selectionPivot();
    this._eachSelectedTransformable((item) => {
      const T = item.transform;
      if (c) {
        const dx = T.x - c.x, dy = T.y - c.y;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        T.x = c.x + cos * dx - sin * dy;
        T.y = c.y + sin * dx + cos * dy;
      }
      T.rotation = ((T.rotation || 0) + deltaDeg) % 360;
    });
    this.touch();
  }

  scaleSelectedBy(factor, pivot) {
    if (!this.selectedIds.length) return;
    const f = Math.min(20, Math.max(0.05, factor || 1));
    const c = pivot || this.selectionPivot();
    this._eachSelectedTransformable((item) => {
      const T = item.transform;
      if (c) {
        T.x = c.x + (T.x - c.x) * f;
        T.y = c.y + (T.y - c.y) * f;
      }
      T.scale = Math.min(50, Math.max(0.01, (T.scale || 1) * f));
    });
    this.touch();
  }

  /** pivot for rotate/scale gizmos: own centroid when multi, else self */
  selectionPivot() {
    const centroid = selectionCentroid(this.scene.items, this.selectedIds);
    return centroid ? { x: centroid.x, y: centroid.y } : null;
  }

  /** iterate selected items, expanding groups into their descendant leaves */
  _eachSelectedTransformable(fn) {
    const wanted = new Set(this.selectedIds);
    const walk = (list) => {
      for (const item of list) {
        if (item.kind === 'group') {
          if (wanted.has(item.id)) {
            // group selected as a unit → move all descendant leaves
            const leaves = [];
            const collect = (l) => l.forEach(i => i.kind === 'group' ? collect(i.children || []) : leaves.push(i));
            collect(item.children || []);
            leaves.forEach(fn);
          } else {
            walk(item.children || []);
          }
          continue;
        }
        if (wanted.has(item.id) && item.kind !== 'modifier') fn(item);
      }
    };
    walk(this.scene.items);
  }

  toggleCollapsed(id) {
    const found = findItem(this.scene.items, id);
    if (found?.item.kind === 'group') {
      found.item.collapsed = !found.item.collapsed;
      this.touch({ structural: true });
    }
  }

  /** wrap ALL selected items in one new group (appended at root top) */
  groupSelected() {
    this.checkpoint();
    const group = createGroup(uniqueName(this.scene.items, 'Group'));
    const wanted = new Set(this.selectedIds);
    const detached = [];
    const collect = (list) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const it = list[i];
        if (wanted.has(it.id)) {
          detached.unshift(it);
          list.splice(i, 1);
          continue;
        }
        if (it.children) collect(it.children);
      }
    };
    collect(this.scene.items);
    if (!detached.length) {
      this.scene.items.push(group);
    } else {
      group.children = detached;
      this.scene.items.push(group);
    }
    this.selectedIds = [group.id];
    this.touch({ structural: true });
    return group;
  }

  /** dissolve every selected group; children keep their (world) placement */
  ungroupSelected() {
    const groups = this.selectedItems().filter(i => i.kind === 'group');
    if (!groups.length) return;
    this.checkpoint();
    const newSelection = [];
    for (const g of groups) {
      const found = findItem(this.scene.items, g.id);
      if (!found) continue;
      const children = found.item.children || [];
      found.list.splice(found.index, 1, ...children);
      newSelection.push(...children.map(c => c.id));
    }
    this.selectedIds = newSelection;
    this.touch({ structural: true });
  }

  /** reorder / re-nest via drag & drop */
  moveItem(id, targetId, position /* 'before' | 'after' | 'inside' */) {
    if (id === targetId) return;
    const src = findItem(this.scene.items, id);
    const dst = findItem(this.scene.items, targetId);
    if (!src || !dst) return;
    if (src.item.kind === 'group' && (dst.path || []).some(a => a.id === id)) return;
    this.checkpoint();
    src.list.splice(src.index, 1);
    const dst2 = findItem(this.scene.items, targetId);
    if (!dst2) { this.scene.items.push(src.item); }
    else if (position === 'inside' && dst2.item.kind === 'group') {
      dst2.item.collapsed = false;
      dst2.item.children.push(src.item);
    } else {
      const at = dst2.index + (position === 'after' ? 1 : 0);
      dst2.list.splice(at, 0, src.item);
    }
    this.touch({ structural: true });
  }

  moveItemToRoot(id, index) {
    const src = findItem(this.scene.items, id);
    if (!src) return;
    this.checkpoint();
    src.list.splice(src.index, 1);
    const at = Math.min(Math.max(0, index), this.scene.items.length);
    this.scene.items.splice(at, 0, src.item);
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
    shapeId: isGroup ? 'group' : raw.shapeId,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 64) : 'Layer',
    visible: raw.visible !== false,
    blend: BLEND_IDS.has(raw.blend) ? raw.blend : 'union',
    k: clampNum(raw.k, 0.01, 1.5, 0.28),
  };

  if (item.kind !== 'modifier' && item.kind !== 'group') {
    item.transform = {
      x: clampNum(raw.transform?.x, -100, 100, 0),
      y: clampNum(raw.transform?.y, -100, 100, 0),
      rotation: clampNum(raw.transform?.rotation, -3600, 3600, 0),
      scale: clampNum(raw.transform?.scale, 0.01, 50, 1),
    };
    item.height = clampNum(raw.height, -2, 2, 0);
  }

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
    version: 2,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 80) : 'Untitled Scene',
    colors: {
      inside: hex(raw.colors?.inside, '#42536e'),
      outside: hex(raw.colors?.outside, '#c87c2c'),
      accent: hex(raw.colors?.accent, '#ffffff'),
      line: hex(raw.colors?.line, '#16100a'),
    },
    contour: {
      falloff: clampNum(raw.contour?.falloff, 0.6, 6, 2.1),
      steps: Math.round(clampNum(raw.contour?.steps, 0, 48, 16)),
      lineEvery: clampNum(raw.contour?.lineEvery, 0, 1.5, 0.32),
      lineStrength: clampNum(raw.contour?.lineStrength, 0, 1, 0.55),
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
