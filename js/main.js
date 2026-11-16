// ═══════════════════════════════════════════════════════════════
// SDF Magician — application bootstrap & UI
// ═══════════════════════════════════════════════════════════════

import { SHAPES, SHAPE_CATEGORIES, getShape, evalScene } from './shapes.js';
import { buildExport } from './glsl.js';
import { SDFRenderer } from './renderer.js';
import { model, BLEND_MODES, findItem, PRESETS } from './model.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const slugify = (s) => (s || 'scene').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'scene';
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ═══════════════ camera / viewport state ═══════════════

const viewport = $('#viewport');
const glCanvas = $('#glCanvas');
const overlay = $('#overlayCanvas');
const octx = overlay.getContext('2d');

const camera = { cx: 0, cy: 0, scale: 100, fitScale: 100 };
let dpr = Math.min(2, window.devicePixelRatio || 1);
let cssW = 800, cssH = 600;
let spaceDown = false;

let renderer = null;
try {
  renderer = new SDFRenderer(glCanvas);
} catch (err) {
  viewport.insertAdjacentHTML('afterbegin',
    `<div style="position:absolute;inset:0;z-index:9;display:grid;place-items:center;color:#fecdd3;background:#0b1020;padding:30px;text-align:center;font:500 13px/1.7 Inter">
       WebGL could not start:<br>${String(err.message || err)}</div>`);
}

let needsRender = true;
const requestRender = () => { needsRender = true; };
const requestOverlay = requestRender;

function computeFitScale() {
  return Math.min(cssW, cssH) / 4.8;
}

function fitView() {
  camera.cx = 0; camera.cy = 0;
  camera.fitScale = computeFitScale() * 0.94;
  camera.scale = camera.fitScale;
  updateZoomLabel();
  requestRender();
}

function updateZoomLabel() {
  $('#zoomLabel').textContent = Math.round((camera.scale / camera.fitScale) * 100) + '%';
}

function resizeCanvases() {
  const rect = viewport.getBoundingClientRect();
  cssW = Math.max(50, rect.width);
  cssH = Math.max(50, rect.height);
  dpr = Math.min(2, window.devicePixelRatio || 1);
  glCanvas.width = Math.round(cssW * dpr);
  glCanvas.height = Math.round(cssH * dpr);
  overlay.width = Math.round(cssW * dpr);
  overlay.height = Math.round(cssH * dpr);
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  requestRender();
}

const worldToScreen = (wx, wy) => ({
  x: (wx - camera.cx) * camera.scale + cssW / 2,
  y: cssH / 2 - (wy - camera.cy) * camera.scale,
});
const screenToWorld = (sx, sy) => ({
  x: (sx - cssW / 2) / camera.scale + camera.cx,
  y: (cssH / 2 - sy) / camera.scale + camera.cy,
});

// ═══════════════ render loop ═══════════════

function draw() {
  if (!needsRender) return;
  needsRender = false;
  const scene = model.scene;
  if (renderer) {
    renderer.render({
      center: { x: camera.cx, y: camera.cy },
      scale: camera.scale * dpr,
      falloff: scene.contour.falloff,
      steps: scene.contour.steps,
      lineEvery: scene.contour.lineEvery,
      lineStrength: scene.contour.lineStrength,
      colors: scene.colors,
      selectedId: model.selectedId,
    });
  }
  drawOverlay();
}

// ═══════════════ overlay: grid, axes, gizmos ═══════════════

function drawGrid() {
  const scene = model.scene;
  if (!scene.grid.show && !scene.grid.axes) return;
  const s = camera.scale;
  const step = s >= 34 ? 0.25 : (s >= 14 ? 0.5 : 1);
  const major = 5;

  if (scene.grid.show) {
    const x0 = Math.floor(screenToWorld(0, 0).x / step) * step;
    const x1 = screenToWorld(cssW, 0).x;
    const y0 = Math.floor(screenToWorld(0, cssH).y / step) * step;
    const y1 = screenToWorld(0, 0).y;
    for (let x = x0; x <= x1; x += step) {
      const sx = worldToScreen(x, 0).x;
      const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
      octx.strokeStyle = isMajor ? 'rgba(148,180,255,0.14)' : 'rgba(148,180,255,0.055)';
      octx.lineWidth = 1;
      octx.beginPath(); octx.moveTo(sx, 0); octx.lineTo(sx, cssH); octx.stroke();
    }
    for (let y = y0; y <= y1; y += step) {
      const sy = worldToScreen(0, y).y;
      const isMajor = Math.abs(y / major - Math.round(y / major)) < 1e-6;
      octx.strokeStyle = isMajor ? 'rgba(148,180,255,0.14)' : 'rgba(148,180,255,0.055)';
      octx.beginPath(); octx.moveTo(0, sy); octx.lineTo(cssW, sy); octx.stroke();
    }
    // unit labels on axes
    const labelStep = s >= 46 ? 1 : 5;
    octx.font = '9px "JetBrains Mono", monospace';
    octx.fillStyle = 'rgba(154,162,199,0.5)';
    if (scene.grid.axes) {
      const yAxisX = worldToScreen(0, 0).x;
      const xAxisY = worldToScreen(0, 0).y;
      for (let x = x0; x <= x1; x += labelStep) {
        if (Math.abs(x) < 1e-9) continue;
        const sx = worldToScreen(x, 0).x;
        octx.fillText(String(Math.round(x * 100) / 100), sx + 3, clamp(xAxisY + 11, 10, cssH - 6));
      }
      for (let y = y0; y <= y1; y += labelStep) {
        if (Math.abs(y) < 1e-9) continue;
        const sy = worldToScreen(0, y).y;
        octx.fillText(String(Math.round(y * 100) / 100), clamp(yAxisX + 5, 2, cssW - 24), sy - 3);
      }
    }
  }

  if (scene.grid.axes) {
    const origin = worldToScreen(0, 0);
    octx.strokeStyle = 'rgba(103,232,249,0.4)';
    octx.lineWidth = 1.2;
    octx.beginPath(); octx.moveTo(0, origin.y); octx.lineTo(cssW, origin.y); octx.stroke();
    octx.strokeStyle = 'rgba(240,171,252,0.4)';
    octx.beginPath(); octx.moveTo(origin.x, 0); octx.lineTo(origin.x, cssH); octx.stroke();
    octx.fillStyle = 'rgba(248,250,252,0.85)';
    octx.beginPath(); octx.arc(origin.x, origin.y, 2.5, 0, Math.PI * 2); octx.fill();
  }
}

const HANDLE_LEN = 58;   // px
const HANDLE_R = 6.5;

function selectedTransformable() {
  if (!model.selectedId) return null;
  const found = findItem(model.scene.items, model.selectedId);
  return found && found.item.kind !== 'modifier' ? found.item : null;
}

function drawOverlay() {
  octx.clearRect(0, 0, cssW, cssH);
  drawGrid();

  const item = selectedTransformable();
  if (!item) return;
  const T = item.transform;
  const c = worldToScreen(T.x, T.y);
  const rot = (T.rotation || 0) * Math.PI / 180;
  const rotHandle = { x: c.x - Math.sin(rot) * HANDLE_LEN, y: c.y - Math.cos(rot) * HANDLE_LEN };
  const scaleHandle = { x: c.x + Math.cos(rot) * HANDLE_LEN, y: c.y + Math.sin(rot) * HANDLE_LEN };

  // connector lines
  octx.save();
  octx.setLineDash([5, 4]);
  octx.lineWidth = 1.4;
  octx.strokeStyle = 'rgba(248,250,252,0.55)';
  octx.beginPath(); octx.moveTo(c.x, c.y); octx.lineTo(rotHandle.x, rotHandle.y); octx.stroke();
  octx.beginPath(); octx.moveTo(c.x, c.y); octx.lineTo(scaleHandle.x, scaleHandle.y); octx.stroke();
  octx.restore();

  // rotation handle
  octx.fillStyle = '#0ea5b7';
  octx.strokeStyle = '#cffafe';
  octx.lineWidth = 1.6;
  octx.beginPath(); octx.arc(rotHandle.x, rotHandle.y, HANDLE_R, 0, Math.PI * 2); octx.fill(); octx.stroke();
  octx.fillStyle = '#ecfeff';
  octx.beginPath();
  octx.arc(rotHandle.x, rotHandle.y, 2.1, 0, Math.PI * 2); octx.fill();

  // scale handle (square)
  octx.save();
  octx.translate(scaleHandle.x, scaleHandle.y);
  octx.rotate(-rot);
  octx.fillStyle = '#a21caf';
  octx.strokeStyle = '#f5d0fe';
  octx.lineWidth = 1.6;
  octx.beginPath(); octx.rect(-HANDLE_R, -HANDLE_R, HANDLE_R * 2, HANDLE_R * 2); octx.fill(); octx.stroke();
  octx.restore();

  // center handle
  octx.fillStyle = '#111827';
  octx.strokeStyle = '#e879f9';
  octx.lineWidth = 2;
  octx.beginPath(); octx.arc(c.x, c.y, 7, 0, Math.PI * 2); octx.fill(); octx.stroke();
  octx.strokeStyle = '#f0abfc';
  octx.lineWidth = 1.4;
  octx.beginPath();
  octx.moveTo(c.x - 4, c.y); octx.lineTo(c.x + 4, c.y);
  octx.moveTo(c.x, c.y - 4); octx.lineTo(c.x, c.y + 4);
  octx.stroke();
}

// ═══════════════ picking ═══════════════

// raw distance of a shape in its own local frame (identity transform wrapper)
function evalShapeLocal(shapeId, x, y, params) {
  return evalScene({
    items: [{
      id: '__pick__', kind: 'shape', shapeId, name: 'pick', visible: true,
      blend: 'union', k: 0.25, height: 0,
      transform: { x: 0, y: 0, rotation: 0, scale: 1 },
      params,
    }],
  }, x, y);
}

function pickLeaf(wx, wy) {
  let best = null, bestD = Infinity;
  const thresh = Math.max(0.12, 12 / camera.scale);
  // walk the tree, carrying the container-space point (mirrors GLSL traversal;
  // coordinate modifiers are intentionally ignored for hit-testing)
  const walk = (list, px, py) => {
    for (const item of list) {
      if (!item.visible) continue;
      if (item.kind === 'group') {
        const T = item.transform;
        const dx = px - T.x, dy = py - T.y;
        const a = -((T.rotation || 0) * Math.PI / 180);
        const ca = Math.cos(a), sa = Math.sin(a);
        const s = T.scale || 1;
        walk(item.children || [], (ca * dx - sa * dy) / s, (sa * dx + ca * dy) / s);
        continue;
      }
      if (item.kind !== 'shape') continue;   // custom GLSL is not CPU-pickable
      const T = item.transform;
      const dx = px - T.x, dy = py - T.y;
      const a = -((T.rotation || 0) * Math.PI / 180);
      const ca = Math.cos(a), sa = Math.sin(a);
      const s = T.scale || 1;
      const lx = (ca * dx - sa * dy) / s, ly = (sa * dx + ca * dy) / s;
      const d = evalShapeLocal(item.shapeId, lx, ly, item.params) * s - (item.height || 0);
      if (d < bestD) { bestD = d; best = item; }
    }
  };
  walk(model.scene.items, wx, wy);
  return best && bestD < thresh ? best : null;
}

// ═══════════════ pointer interactions ═══════════════

let dragState = null;
const _pt = (e) => {
  const r = overlay.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

overlay.addEventListener('pointerdown', (e) => {
  overlay.setPointerCapture(e.pointerId);
  const p = _pt(e);
  const w = screenToWorld(p.x, p.y);

  if (e.button === 1 || e.button === 2 || spaceDown) {
    dragState = { mode: 'pan', startX: p.x, startY: p.y, cx: camera.cx, cy: camera.cy };
    viewport.style.cursor = 'grabbing';
    return;
  }
  if (e.button !== 0) return;

  // gizmo handles first
  const sel = selectedTransformable();
  if (sel) {
    const T = sel.transform;
    const c = worldToScreen(T.x, T.y);
    const rot = (T.rotation || 0) * Math.PI / 180;
    const rotH = { x: c.x - Math.sin(rot) * HANDLE_LEN, y: c.y - Math.cos(rot) * HANDLE_LEN };
    const sclH = { x: c.x + Math.cos(rot) * HANDLE_LEN, y: c.y + Math.sin(rot) * HANDLE_LEN };
    const dRot = Math.hypot(p.x - rotH.x, p.y - rotH.y);
    const dScl = Math.hypot(p.x - sclH.x, p.y - sclH.y);
    const dCtr = Math.hypot(p.x - c.x, p.y - c.y);
    if (dRot < 12 || dScl < 12 || dCtr < 12) {
      model.checkpoint();
      dragState = {
        mode: dRot < 12 ? 'rotate' : dScl < 12 ? 'scale' : 'move',
        id: sel.id, startX: p.x, startY: p.y, w0: w,
        r0: T.rotation || 0, s0: T.scale || 1,
        itemX0: T.x, itemY0: T.y,
        grabDX: T.x - w.x, grabDY: T.y - w.y,
      };
      return;
    }
  }

  // pick a shape
  const leaf = pickLeaf(w.x, w.y);
  if (leaf) {
    model.checkpoint();
    model.selectedId = leaf.id;
    refreshSelectionUI();
    dragState = { mode: 'move', id: leaf.id, startX: p.x, startY: p.y, w0: w, itemX0: leaf.transform.x, itemY0: leaf.transform.y, grabDX: leaf.transform.x - w.x, grabDY: leaf.transform.y - w.y };
    requestRender();
    return;
  }

  dragState = { mode: 'pan', startX: p.x, startY: p.y, cx: camera.cx, cy: camera.cy, maybeDeselect: true, moved: 0 };
});

overlay.addEventListener('pointermove', (e) => {
  const p = _pt(e);
  const w = screenToWorld(p.x, p.y);
  updateReadout(w);

  if (!dragState) { updateHoverCursor(p); return; }

  if (dragState.mode === 'pan') {
    camera.cx = dragState.cx - (p.x - dragState.startX) / camera.scale;
    camera.cy = dragState.cy + (p.y - dragState.startY) / camera.scale;
    if (dragState.maybeDeselect) dragState.moved = (dragState.moved || 0) + Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
    updateZoomLabel();
    requestRender();
    return;
  }

  const item = dragState.id ? findItem(model.scene.items, dragState.id)?.item : null;
  if (!item) { dragState = null; return; }
  const snap = model.scene.grid.snap ? 0.25 : 0;

  if (dragState.mode === 'move') {
    let nx = w.x + dragState.grabDX, ny = w.y + dragState.grabDY;
    if (e.shiftKey && dragState.itemX0 !== undefined) {   // axis lock
      if (Math.abs(nx - dragState.itemX0) >= Math.abs(ny - dragState.itemY0)) ny = dragState.itemY0;
      else nx = dragState.itemX0;
    }
    if (snap) { nx = Math.round(nx / snap) * snap; ny = Math.round(ny / snap) * snap; }
    model.setTransform(item.id, { x: round4(nx), y: round4(ny) }, { checkpoint: false });
  } else if (dragState.mode === 'rotate') {
    const T0 = findItem(model.scene.items, item.id).item.transform;
    const ang = Math.atan2(w.y - T0.y, w.x - T0.x) * 180 / Math.PI;
    // the rotation handle sits on the local +y axis; its bearing is 90° + rotation
    let deg = ang - 90;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    deg = ((deg % 360) + 360) % 360;
    if (deg > 180) deg -= 360;
    model.setTransform(item.id, { rotation: round4(deg) }, { checkpoint: false });
  } else if (dragState.mode === 'scale') {
    const T0 = findItem(model.scene.items, item.id).item.transform;
    const dist = Math.hypot(w.x - T0.x, w.y - T0.y);
    const baseDistWorld = HANDLE_LEN / camera.scale;
    let s = (dragState.s0 || 1) * (dist / baseDistWorld);
    if (e.shiftKey) s = Math.round(s * 10) / 10;
    s = clamp(s, 0.05, 20);
    if (snap) s = Math.round(s / snap) * snap;
    model.setTransform(item.id, { scale: round4(s) }, { checkpoint: false });
  }
  syncInspectorValues();
  requestRender();
});

const round4 = (v) => Math.round(v * 10000) / 10000;

function endDrag(e) {
  if (!dragState) return;
  if (dragState.mode === 'pan' && dragState.maybeDeselect && (dragState.moved || 0) < 6) {
    model.selectedId = null;
    refreshSelectionUI();
    requestRender();
  }
  dragState = null;
  viewport.style.cursor = '';
  model.touch({ structural: false }); // persist
}
overlay.addEventListener('pointerup', endDrag);
overlay.addEventListener('pointercancel', endDrag);
overlay.addEventListener('contextmenu', (e) => e.preventDefault());

overlay.addEventListener('wheel', (e) => {
  e.preventDefault();
  const p = _pt(e);
  const before = screenToWorld(p.x, p.y);
  const factor = Math.exp(-e.deltaY * 0.0012);
  camera.scale = clamp(camera.scale * factor, camera.fitScale * 0.25, camera.fitScale * 40);
  const after = screenToWorld(p.x, p.y);
  camera.cx += before.x - after.x;
  camera.cy += before.y - after.y;
  updateZoomLabel();
  requestRender();
}, { passive: false });

function updateHoverCursor(p) {
  const sel = selectedTransformable();
  if (sel) {
    const T = sel.transform;
    const c = worldToScreen(T.x, T.y);
    const rot = (T.rotation || 0) * Math.PI / 180;
    const rotH = { x: c.x - Math.sin(rot) * HANDLE_LEN, y: c.y - Math.cos(rot) * HANDLE_LEN };
    const sclH = { x: c.x + Math.cos(rot) * HANDLE_LEN, y: c.y + Math.sin(rot) * HANDLE_LEN };
    if (Math.hypot(p.x - rotH.x, p.y - rotH.y) < 12) { viewport.style.cursor = 'grab'; return; }
    if (Math.hypot(p.x - sclH.x, p.y - sclH.y) < 12) { viewport.style.cursor = 'nwse-resize'; return; }
    if (Math.hypot(p.x - c.x, p.y - c.y) < 12) { viewport.style.cursor = 'move'; return; }
  }
  viewport.style.cursor = spaceDown ? 'grab' : 'default';
}

function updateReadout(w) {
  $('#coordReadout').textContent = `${w.x >= 0 ? '+' : ''}${w.x.toFixed(2)}, ${w.y >= 0 ? '+' : ''}${w.y.toFixed(2)}`;
  const d = evalScene(model.scene, w.x, w.y);
  const el = $('#dReadout');
  if (Number.isFinite(d)) {
    el.textContent = (d >= 0 ? '+' : '') + d.toFixed(3);
    el.style.color = d < 0 ? '#67e8f9' : '#9aa2c7';
  } else {
    el.textContent = '—';
    el.style.color = '#9aa2c7';
  }
}

// keyboard pan state
window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !isEditableTarget(e.target)) { spaceDown = true; e.preventDefault(); } });
window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
const isEditableTarget = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

// ═══════════════ layers panel ═══════════════

const EYE_ON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 5c5 0 9.3 3.1 11.3 7.5-2 4.4-6.3 7.5-11.3 7.5S2.7 16.9.7 12.5C2.7 8.1 7 5 12 5zm0 3a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.3 2 2 3.3l3.6 3.6A13.4 13.4 0 0 0 .7 12.5C2.7 17 7 20 12 20a12.6 12.6 0 0 0 5.4-1.2L19.7 22 21 20.7l-7.3-7.3c.2-.8.3-1.6.3-2.4 0-4.1-2.6-7.7-6.6-9.5L3.3 2zm7.2 8.6 2.9 2.9a2.5 2.5 0 0 0-2.9-2.9z"/></svg>';
const GRIP = '<svg viewBox="0 0 10 16"><circle cx="2.5" cy="3" r="1.3" fill="currentColor"/><circle cx="7.5" cy="3" r="1.3" fill="currentColor"/><circle cx="2.5" cy="8" r="1.3" fill="currentColor"/><circle cx="7.5" cy="8" r="1.3" fill="currentColor"/><circle cx="2.5" cy="13" r="1.3" fill="currentColor"/><circle cx="7.5" cy="13" r="1.3" fill="currentColor"/></svg>';
const CARET = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 15.5 4.5 8l1.6-1.6L12 12.3l5.9-5.9L19.5 8z"/></svg>';

const KIND_ICON = {
  shape: (item) => `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l2.4 5.2 5.6.5-4.3 3.7 1.3 5.5L12 14.7 7 17l1.3-5.6-4.3-3.6 5.6-.6L12 2z"/></svg>`,
  group: () => '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>',
  modifier: () => '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 4 7 9H3v2h3l-1 6h2l1-6h4l-1 6h2l1-6h3V9h-3l1-5z"/></svg>',
  custom: () => '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 4a3 3 0 0 0-3 3v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a3 3 0 0 0 3 3h1v-2H8.5a1 1 0 0 1-1-1v-3a4 4 0 0 0-1.5-3A4 4 0 0 0 7.5 9V7a1 1 0 0 1 1-1H9V4H8zm8 0h-1v2h1.5a1 1 0 0 1 1 1v2a4 4 0 0 0 1.5 3 4 4 0 0 0-1.5 3v3a1 1 0 0 1-1 1H15v2h1a3 3 0 0 0 3-3v-3a2 2 0 0 1 2-2 2 2 0 0 1-2-2V7a3 3 0 0 0-3-3h-1z"/></svg>',
};

const BLEND_SHORT = {
  union: 'union', subtract: 'sub', intersect: 'int', xor: 'xor',
  smooth_union: 's·uni', smooth_subtract: 's·sub', smooth_intersect: 's·int', replace: 'repl',
};
const blendBadgeClass = (b) => b?.startsWith('smooth') ? 'smooth' : (b?.includes('subtract') ? 'subtract' : (b?.includes('intersect') ? 'intersect' : ''));

function renderLayers() {
  const list = $('#layerList');
  const scene = model.scene;
  list.innerHTML = '';
  const frag = document.createDocumentFragment();

  const walk = (items, depth) => {
    // top of the list = rendered last = "on top" — iterate reverse
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const li = document.createElement('li');
      li.className = 'layer-row' + (item.id === model.selectedId ? ' selected' : '') + (item.visible ? '' : ' is-hidden-layer');
      li.draggable = true;
      li.dataset.id = item.id;
      li.style.paddingLeft = `${6 + depth * 16}px`;

      const caret = item.kind === 'group'
        ? `<button class="group-caret ${item.collapsed ? 'collapsed' : ''}" data-toggle-collapse title="${item.collapsed ? 'Expand' : 'Collapse'} group">${CARET}</button>`
        : `<span class="indent-guide" style="width:18px;border:0"></span>`;

      const badge = item.kind === 'modifier'
        ? '<span class="blend-badge" title="Field / symmetry modifier">fx</span>'
        : `<span class="blend-badge ${blendBadgeClass(item.blend)}" title="${BLEND_MODES.find(b => b.id === item.blend)?.label ?? item.blend}">${BLEND_SHORT[item.blend] ?? item.blend}</span>`;

      li.innerHTML = `
        <span class="drag-grip" title="Drag to reorder · drop on a group to nest">${GRIP}</span>
        ${caret}
        <button class="visibility-btn ${item.visible ? '' : 'off'}" data-toggle-vis title="${item.visible ? 'Hide' : 'Show'} layer">${item.visible ? EYE_ON : EYE_OFF}</button>
        <span class="layer-kind-icon ${item.kind}">${KIND_ICON[item.kind]?.(item) ?? KIND_ICON.shape(item)}</span>
        <input class="layer-name" value="${escapeAttr(item.name)}" spellcheck="false" aria-label="Layer name" />
        ${badge}`;
      frag.appendChild(li);

      if (item.kind === 'group' && !item.collapsed) walk(item.children || [], depth + 1);
    }
  };
  walk(scene.items, 0);
  list.appendChild(frag);

  $('#layersEmpty').hidden = scene.items.length > 0;
  $('#selectedReadout').textContent = model.selectedId
    ? (findItem(scene.items, model.selectedId)?.item.name ?? 'none')
    : 'none';
}

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// layer list events (delegated)
$('#layerList').addEventListener('click', (e) => {
  const row = e.target.closest('.layer-row');
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.closest('[data-toggle-vis]')) { model.toggleVisible(id); return; }
  if (e.target.closest('[data-toggle-collapse]')) { model.toggleCollapsed(id); return; }
  if (e.target.closest('.layer-name')) return; // renaming
  model.selectedId = id;
  refreshSelectionUI();
  requestRender();
});

$('#layerList').addEventListener('change', (e) => {
  const row = e.target.closest('.layer-row');
  if (!row) return;
  if (e.target.classList.contains('layer-name')) {
    model.renameItem(row.dataset.id, e.target.value.trim() || 'Layer');
  }
});

$('#layerList').addEventListener('focusin', (e) => {
  if (e.target.classList?.contains('layer-name')) model.checkpoint();
});

// drag & drop reordering / nesting
let dragId = null;
$('#layerList').addEventListener('dragstart', (e) => {
  const row = e.target.closest('.layer-row');
  if (!row) return;
  dragId = row.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
});
$('#layerList').addEventListener('dragover', (e) => {
  if (!dragId) return;
  e.preventDefault();
  const row = e.target.closest('.layer-row');
  clearDropHints();
  if (!row) { $('#layerList').classList.add('drop-root-zone'); return; }
  if (row.dataset.id === dragId) return;
  const rect = row.getBoundingClientRect();
  const rel = (e.clientY - rect.top) / rect.height;
  const isGroup = !!row.querySelector('[data-toggle-collapse]');
  let pos = rel < 0.5 ? 'before' : 'after';
  if (isGroup && rel > 0.28 && rel < 0.72) pos = 'inside';
  row.dataset.dropPos = pos;
  row.classList.add(pos === 'inside' ? 'drag-over-inside' : pos === 'before' ? 'drag-over-top' : 'drag-over-bottom');
});
$('#layerList').addEventListener('dragleave', (e) => {
  if (e.target.id === 'layerList') $('#layerList').classList.remove('drop-root-zone');
});
$('#layerList').addEventListener('drop', (e) => {
  e.preventDefault();
  if (!dragId) return;
  const row = e.target.closest('.layer-row');
  clearDropHints();
  if (!row) { model.moveItemToRoot(dragId, model.scene.items.length); dragId = null; return; }
  if (row.dataset.id !== dragId) model.moveItem(dragId, row.dataset.id, row.dataset.dropPos || 'after');
  dragId = null;
});
$('#layerList').addEventListener('dragend', () => { clearDropHints(); dragId = null; });

function clearDropHints() {
  $('#layerList').classList.remove('drop-root-zone');
  $$('#layerList .layer-row').forEach(r => r.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside'));
}

function refreshSelectionUI() {
  renderLayers();
  renderInspector();
  requestRender();
}

// ═══════════════ inspector (selected layer) ═══════════════

function selectedItem() {
  return model.selectedId ? findItem(model.scene.items, model.selectedId)?.item ?? null : null;
}

function renderInspector() {
  const el = $('#inspector');
  const item = selectedItem();
  if (!item) {
    el.innerHTML = `
      <div class="inspector-empty">
        <span class="inspector-empty-icon">✦</span>
        <strong style="color:var(--text-dim)">Nothing selected</strong><br/>
        Click any shape in the canvas or the layer stack to edit it.<br/><br/>
        <button class="btn-ghost" id="quickAddCircle" style="margin:0 auto">Quick add · Circle</button>
      </div>`;
    $('#quickAddCircle')?.addEventListener('click', () => model.addShape('circle'));
    return;
  }

  const def = item.shapeId ? getShape(item.shapeId) : null;
  const isModifier = item.kind === 'modifier';
  const isGroup = item.kind === 'group';
  const isCustom = item.kind === 'custom';
  const isSmooth = item.blend?.startsWith('smooth');

  let html = '';

  // ── blend (not for field/coord modifiers) ──
  if (!isModifier) {
    const opts = BLEND_MODES.map(b => `<option value="${b.id}" ${b.id === item.blend ? 'selected' : ''}>${b.label}</option>`).join('');
    html += `
      <div class="field-group">
        <div class="field-group-title">Blend with layers below</div>
        <select class="select-field" id="blendSelect" aria-label="Blend mode">${opts}</select>
        ${isSmooth ? `
        <div class="blend-k-wrap param-row" style="margin-top:10px">
          <label for="kRange">Blend radius <em style="color:var(--text-faint)">k</em></label>
          <span class="param-value" id="kVal">${item.k.toFixed(2)}</span>
          <input type="range" id="kRange" min="0.02" max="1.5" step="0.01" value="${item.k}" />
        </div>` : ''}
      </div>`;
  }

  // ── height / grow ──
  if (!isModifier) {
    html += `
      <div class="field-group">
        <div class="height-label-row"><label for="heightRange">Height · surface offset</label><em>positive grows the shape</em></div>
        <div class="height-field">
          <div class="height-zero"></div>
          <input type="range" id="heightRange" min="-2" max="2" step="0.01" value="${item.height || 0}" aria-label="Height offset" />
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px">
          <span class="param-value" style="font-size:11px;padding:2px 9px" id="heightVal">${(item.height || 0) >= 0 ? '+' : ''}${(item.height || 0).toFixed(2)}</span>
          <button class="snippet-btn" id="heightReset" title="Reset height to 0">reset</button>
        </div>
      </div>`;
  }

  // ── transform ──
  if (!isModifier) {
    const T = item.transform;
    html += `
      <div class="field-group">
        <div class="height-label-row"><label>Transform</label><button class="snippet-btn" id="transformReset" title="Reset to origin, no rotation, scale 1">reset</button></div>
        <div class="num-grid cols-3">
          <div class="num-field"><label for="tfX">X</label><input type="number" id="tfX" step="0.05" value="${T.x}" /></div>
          <div class="num-field"><label for="tfY">Y</label><input type="number" id="tfY" step="0.05" value="${T.y}" /></div>
          <div class="num-field"><label for="tfRot">Rotate°</label><input type="number" id="tfRot" step="1" value="${T.rotation || 0}" /></div>
          <div class="num-field"><label for="tfScale">Scale</label><input type="number" id="tfScale" step="0.05" min="0.01" value="${T.scale || 1}" /></div>
        </div>
      </div>`;
  }

  // ── shape parameters ──
  if (def && def.params.length) {
    const rows = def.params.map(p => `
      <div class="param-row">
        <label for="param_${p.key}">${escapeHtml(p.label)}${p.unit ? ` <em style="opacity:.6">(${p.unit})</em>` : ''}</label>
        <span class="param-value" id="paramVal_${p.key}">${fmtParam(item.params[p.key], p.step)}</span>
        <input type="range" id="param_${p.key}" data-param="${p.key}" data-step="${p.step}" min="${p.min}" max="${p.max}" step="${p.step}" value="${item.params[p.key]}" />
      </div>`).join('');
    html += `<div class="field-group"><div class="field-group-title">${escapeHtml(def.name)} params</div>${rows}</div>`;
  }

  // ── modifier params ──
  if (isModifier && def?.params?.length) {
    const rows = def.params.map(p => `
      <div class="param-row">
        <label for="param_${p.key}">${escapeHtml(p.label)}</label>
        <span class="param-value" id="paramVal_${p.key}">${fmtParam(item.params[p.key], p.step)}</span>
        <input type="range" id="param_${p.key}" data-param="${p.key}" data-step="${p.step}" min="${p.min}" max="${p.max}" step="${p.step}" value="${item.params[p.key]}" />
      </div>`).join('');
    html += `<div class="field-group"><div class="field-group-title">Modifier</div>${rows}
      <p style="font-size:9.5px;color:var(--text-faint);margin:6px 2px 0;line-height:1.5">Modifiers act on everything <strong>below</strong> them in the stack.</p></div>`;
  }

  // ── group info ──
  if (isGroup) {
    html += `
      <div class="field-group">
        <div class="field-group-title">Group</div>
        <p style="font-size:10.5px;color:var(--text-dim);margin:0 2px 8px;line-height:1.55">${(item.children || []).length} layer(s) inside. The group blends with layers below as one shape.</p>
        <button class="btn-ghost" id="btnUngroup" style="width:100%;justify-content:center">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 3h8v8H3zM11 11h8v8h-8z" transform="translate(1.5 1.5) scale(.88)"/></svg>
          Ungroup (keep world placement)
        </button>
      </div>`;
  }

  // ── custom code ──
  if (isCustom) {
    html += `
      <div class="field-group">
        <div class="field-group-title">Custom SDF · GLSL</div>
        <textarea class="custom-code-area" id="customCode" spellcheck="false" aria-label="Custom SDF code">${escapeHtml(item.params.code || '')}</textarea>
        <div class="custom-error" id="customError"></div>
        <div class="snippet-row">
          <button class="snippet-btn" data-snippet="circle">+ sdCircle</button>
          <button class="snippet-btn" data-snippet="smooth">+ smooth blend</button>
          <button class="snippet-btn" data-snippet="rotate">+ rot2</button>
          <button class="snippet-btn" data-snippet="poly">+ polygon</button>
        </div>
        <p style="font-size:9px;color:var(--text-faint);margin:7px 2px 0;line-height:1.55">Available: <code style="color:#a5f3fc">p</code> (local point), every helper used by the built-in shapes, <code style="color:#a5f3fc">smin/smax/rot2</code>. Return a float distance.</p>
      </div>`;
  }

  // ── actions ──
  html += `
    <div class="inspector-actions">
      <button class="btn-ghost" id="btnDuplicateInspector" title="Duplicate (Ctrl+D)">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 8h12v12H8zM4 4h12v2H6v10H4z"/></svg>Duplicate
      </button>
      <button class="btn-ghost" id="btnDeleteInspector" title="Delete (Del)" style="color:#fda4af;border-color:rgba(251,113,133,.35)">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 3h6a1 1 0 0 1 1 1v1h4v2h-1l-1.2 12.1A3 3 0 0 1 14.8 22h-5.6a3 3 0 0 1-3-2.9L5 7H4V5h4V4a1 1 0 0 1 1-1z"/></svg>Delete
      </button>
    </div>`;

  el.innerHTML = html;
  wireInspector(item);
}

const fmtParam = (v, step) => {
  const n = Number(v) || 0;
  return step >= 1 ? String(Math.round(n)) : n.toFixed(2);
};

function syncInspectorValues() {
  const item = selectedItem();
  if (!item) return;
  const T = item.transform;
  const set = (id, v) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v; };
  set('tfX', round4(T.x)); set('tfY', round4(T.y)); set('tfRot', round4(T.rotation || 0)); set('tfScale', round4(T.scale || 1));
  set('heightRange', item.height || 0);
  const hv = $('#heightVal'); if (hv) hv.textContent = `${(item.height || 0) >= 0 ? '+' : ''}${(item.height || 0).toFixed(2)}`;
}

function wireInspector(item) {
  const el = $('#inspector');
  // note: checkpoint-once-per-gesture is wired once at boot (focusin/pointerdown delegation)

  const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);

  on('blendSelect', 'change', (e) => { model.setBlend(item.id, e.target.value); renderInspector(); });
  on('kRange', 'input', (e) => { model.setK(item.id, e.target.value); $('#kVal').textContent = Number(e.target.value).toFixed(2); });

  on('heightRange', 'input', (e) => { model.setHeight(item.id, e.target.value); syncInspectorValues(); });
  on('heightReset', 'click', () => { model.checkpoint(); model.setHeight(item.id, 0); syncInspectorValues(); });

  const tf = (id, key) => on(id, 'input', (e) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) model.setTransform(item.id, { [key]: v }, { checkpoint: false });
  });
  tf('tfX', 'x'); tf('tfY', 'y'); tf('tfRot', 'rotation'); tf('tfScale', 'scale');
  on('transformReset', 'click', () => { model.setTransform(item.id, { x: 0, y: 0, rotation: 0, scale: 1 }); renderInspector(); });

  el.querySelectorAll('input[data-param]').forEach(input => {
    input.addEventListener('input', () => {
      const key = input.dataset.param;
      model.setParam(item.id, key, input.value);
      const valEl = document.getElementById('paramVal_' + key);
      if (valEl) valEl.textContent = fmtParam(input.value, parseFloat(input.dataset.step));
    });
  });

  on('btnUngroup', 'click', () => model.ungroupSelected());
  on('btnDuplicateInspector', 'click', () => model.duplicateSelected());
  on('btnDeleteInspector', 'click', () => model.deleteSelected());

  // custom code
  const code = $('#customCode');
  if (code) {
    code.addEventListener('input', () => {
      model.setCustomCode(item.id, code.value);
      $('#customError').classList.remove('visible');
    });
    el.querySelectorAll('[data-snippet]').forEach(btn => btn.addEventListener('click', () => {
      const snippets = {
        circle: 'sdCircle(p, 0.5)',
        smooth: 'smin(d1, d2, 0.3)',
        rotate: 'rot2(p, 0.7854)',
        poly: 'sdRegularPolygon(p, 0.6, 6.0)',
      };
      const text = snippets[btn.dataset.snippet] || '';
      const start = code.selectionStart, end = code.selectionEnd;
      code.setRangeText(text, start, end, 'select');
      code.dispatchEvent(new Event('input'));
      code.focus();
    }));
  }
}

// show GLSL compile errors from the custom code
function showCustomError(message) {
  const box = $('#customError');
  if (box) { box.textContent = message; box.classList.add('visible'); }
}

// ═══════════════ shape library (thumbnails) ═══════════════

const thumbCanvases = [];

function buildShapeLibrary() {
  const grid = $('#shapeGrid');
  grid.innerHTML = '';
  thumbCanvases.length = 0;
  const q = '';

  for (const cat of SHAPE_CATEGORIES) {
    const items = SHAPES.filter(s => s.cat === cat.id);
    if (!items.length) continue;
    const label = document.createElement('div');
    label.className = 'shape-cat-label';
    label.textContent = cat.name;
    label.dataset.cat = cat.id;
    grid.appendChild(label);
    for (const shape of items) {
      const btn = document.createElement('button');
      btn.className = 'shape-card';
      btn.dataset.shapeId = shape.id;
      btn.dataset.search = (shape.name + ' ' + shape.id).toLowerCase();
      btn.title = `Add ${shape.name}`;
      if (shape.modifier) {
        btn.innerHTML = `<span class="modifier-glyph">${shape.glyph || 'ƒ'}</span><span>${shape.name}</span>`;
        btn.classList.add('modifier-card');
      } else {
        const cv = document.createElement('canvas');
        cv.width = 96; cv.height = 68;
        btn.appendChild(cv);
        const name = document.createElement('span');
        name.textContent = shape.name;
        btn.appendChild(name);
        thumbCanvases.push({ canvas: cv, shape });
      }
      btn.addEventListener('click', () => {
        if (shape.modifier) model.addModifier(shape.id);
        else model.addShape(shape.id);
        flashCard(btn);
      });
      grid.appendChild(btn);
    }
  }
}

function flashCard(btn) {
  try {
    btn.animate?.(
      [{ boxShadow: '0 0 0 0 rgba(34,211,238,.6)' }, { boxShadow: '0 0 0 6px rgba(34,211,238,0)' }],
      { duration: 450 }
    );
  } catch { /* animation is decorative */ }
}

function hexMix(hexA, hexB, t) {
  const pa = parseInt(hexA.slice(1), 16), pb = parseInt(hexB.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const b = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return [r, g, b];
}

function paintField(canvas, fieldFn) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const img = ctx.createImageData(w, h);
  const cols = model.scene.colors;
  const steps = 9;
  const falloff = 1.25;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const wx = (px / w - 0.5) * 2.5;
      const wy = (0.5 - py / h) * 2.5 * (h / w);
      const d = fieldFn(wx, wy);
      let t = clamp(0.5 + 0.5 * d / falloff, 0, 1);
      if (steps > 0) {
        t = clamp((Math.floor(t * steps) + 0.5) / steps, 0, 1);
      }
      let [r, g, b] = hexMix(cols.inside, cols.outside, t);
      // boundary line
      const bl = 1 - clamp(Math.abs(d) / 0.045, 0, 1);
      const acc = parseInt(cols.accent.slice(1), 16);
      r = r * (1 - bl * 0.85) + ((acc >> 16) & 255) * bl * 0.85;
      g = g * (1 - bl * 0.85) + ((acc >> 8) & 255) * bl * 0.85;
      b = b * (1 - bl * 0.85) + (acc & 255) * bl * 0.85;
      const i = (py * w + px) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function renderShapeThumbnails() {
  for (const { canvas, shape } of thumbCanvases) {
    const item = {
      id: '__thumb__', kind: 'shape', shapeId: shape.id, name: shape.name, visible: true,
      blend: 'union', k: 0.25, height: 0,
      transform: { x: 0, y: 0, rotation: 0, scale: 1 },
      params: Object.fromEntries(shape.params.map(p => [p.key, p.def])),
    };
    paintField(canvas, (x, y) => evalScene({ items: [item] }, x, y));
  }
}

function renderPresetThumbnails() {
  const row = $('#presetRow');
  row.innerHTML = '';
  for (const preset of PRESETS) {
    const scene = preset.build();
    const btn = document.createElement('button');
    btn.className = 'preset-card';
    btn.title = `Load the “${preset.name}” preset`;
    const cv = document.createElement('canvas');
    cv.width = 132; cv.height = 74;
    const cols = scene.colors;
    paintFieldPreset(cv, scene, cols);
    const label = document.createElement('span');
    label.textContent = preset.name;
    btn.appendChild(cv);
    btn.appendChild(label);
    btn.addEventListener('click', () => {
      model.loadPreset(preset.id);
      toast(`Loaded preset “${preset.name}”`, 'success');
    });
    row.appendChild(btn);
  }
}

function paintFieldPreset(canvas, scene, cols) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const img = ctx.createImageData(w, h);
  const range = 1.7;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const wx = (px / w - 0.5) * 2 * range;
      const wy = (0.5 - py / h) * 2 * range * (h / w);
      const d = evalScene(scene, wx, wy);
      let t = clamp(0.5 + 0.5 * d / 1.1, 0, 1);
      const steps = 9;
      t = clamp((Math.floor(t * steps) + 0.5) / steps, 0, 1);
      let [r, g, b] = hexMix(cols.inside, cols.outside, t);
      const bl = 1 - clamp(Math.abs(d) / 0.05, 0, 1);
      const acc = parseInt(cols.accent.slice(1), 16);
      r = r * (1 - bl * 0.9) + ((acc >> 16) & 255) * bl * 0.9;
      g = g * (1 - bl * 0.9) + ((acc >> 8) & 255) * bl * 0.9;
      b = b * (1 - bl * 0.9) + (acc & 255) * bl * 0.9;
      const i = (py * w + px) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

$('#shapeSearch').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  $('#shapeNoResults').hidden = true;
  let visible = 0;
  $$('#shapeGrid .shape-card').forEach(card => {
    const show = !q || card.dataset.search.includes(q);
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  $$('#shapeGrid .shape-cat-label').forEach(label => {
    let any = false;
    let el = label.nextElementSibling;
    while (el && el.classList.contains('shape-card')) {
      if (el.style.display !== 'none') any = true;
      el = el.nextElementSibling;
    }
    label.style.display = any ? '' : 'none';
  });
  if (q && visible === 0) {
    $('#shapeNoResults').hidden = false;
    $('#shapeNoResultsQuery').textContent = q;
  }
});

$('#btnAddCustom').addEventListener('click', () => model.addCustom());

// ═══════════════ scene tab wiring ═══════════════

function fmtContour() {
  $('#falloffVal').textContent = (+$('#falloffRange').value).toFixed(2);
  $('#stepsVal').textContent = $('#stepsRange').value;
  $('#lineEveryVal').textContent = (+$('#lineEveryRange').value).toFixed(2);
  $('#lineStrengthVal').textContent = Math.round(+$('#lineStrengthRange').value) + '%';
}

function syncSceneTab() {
  const s = model.scene;
  $('#colorInside').value = s.colors.inside;
  $('#colorOutside').value = s.colors.outside;
  $('#colorAccent').value = s.colors.accent;
  $('#colorLine').value = s.colors.line;
  $('#swatchInside').style.background = s.colors.inside;
  $('#swatchOutside').style.background = s.colors.outside;
  $('#swatchAccent').style.background = s.colors.accent;
  $('#swatchLine').style.background = s.colors.line;
  $('#falloffRange').value = s.contour.falloff;
  $('#stepsRange').value = s.contour.steps;
  $('#lineEveryRange').value = s.contour.lineEvery;
  $('#lineStrengthRange').value = Math.round(s.contour.lineStrength * 100);
  $('#showGridChk').checked = s.grid.show;
  $('#showAxesChk').checked = s.grid.axes;
  $('#snapChk').checked = s.grid.snap;
  fmtContour();
}

// capture one checkpoint per adjustment-gesture
['falloffRange', 'stepsRange', 'lineEveryRange', 'lineStrengthRange'].forEach(id => {
  $('#' + id).addEventListener('pointerdown', () => model.checkpoint());
  $('#' + id).addEventListener('focus', () => model.checkpoint());
});
['colorInside', 'colorOutside', 'colorAccent', 'colorLine'].forEach(id => {
  $('#' + id).addEventListener('focus', () => model.checkpoint());
  $('#' + id).addEventListener('pointerdown', () => model.checkpoint());
});

$('#falloffRange').addEventListener('input', (e) => { model.setContour({ falloff: +e.target.value }); fmtContour(); });
$('#stepsRange').addEventListener('input', (e) => { model.setContour({ steps: +e.target.value }); fmtContour(); });
$('#lineEveryRange').addEventListener('input', (e) => { model.setContour({ lineEvery: +e.target.value }); fmtContour(); });
$('#lineStrengthRange').addEventListener('input', (e) => { model.setContour({ lineStrength: +e.target.value / 100 }); fmtContour(); });

$('#colorInside').addEventListener('input', (e) => { model.setColors({ inside: e.target.value }); $('#swatchInside').style.background = e.target.value; scheduleThumbRefresh(); });
$('#colorOutside').addEventListener('input', (e) => { model.setColors({ outside: e.target.value }); $('#swatchOutside').style.background = e.target.value; scheduleThumbRefresh(); });
$('#colorAccent').addEventListener('input', (e) => { model.setColors({ accent: e.target.value }); $('#swatchAccent').style.background = e.target.value; });
$('#colorLine').addEventListener('input', (e) => { model.setColors({ line: e.target.value }); $('#swatchLine').style.background = e.target.value; });

$('#showGridChk').addEventListener('change', (e) => { model.setGridFlag('show', e.target.checked); requestRender(); });
$('#showAxesChk').addEventListener('change', (e) => { model.setGridFlag('axes', e.target.checked); requestRender(); });
$('#snapChk').addEventListener('change', (e) => { model.setGridFlag('snap', e.target.checked); });

const scheduleThumbRefresh = debounce(renderShapeThumbnails, 250);

// tabs
$$('.panel-tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.panel-tab').forEach(t => { t.classList.toggle('active', t === tab); t.setAttribute('aria-selected', String(t === tab)); });
  $('#tab-shapes').hidden = tab.dataset.tab !== 'shapes';
  $('#tab-scene').hidden = tab.dataset.tab !== 'scene';
}));

// ═══════════════ HUD ═══════════════

$('#btnZoomIn').addEventListener('click', () => { camera.scale = clamp(camera.scale * 1.28, camera.fitScale * 0.25, camera.fitScale * 40); updateZoomLabel(); requestRender(); });
$('#btnZoomOut').addEventListener('click', () => { camera.scale = clamp(camera.scale / 1.28, camera.fitScale * 0.25, camera.fitScale * 40); updateZoomLabel(); requestRender(); });
$('#btnFit').addEventListener('click', fitView);
$('#zoomLabel').addEventListener('click', () => { camera.cx = 0; camera.cy = 0; updateZoomLabel(); requestRender(); });

// ═══════════════ undo / redo / clear / export ═══════════════

$('#btnUndo').addEventListener('click', () => { if (model.undo()) afterHistoryJump(); });
$('#btnRedo').addEventListener('click', () => { if (model.redo()) afterHistoryJump(); });
function afterHistoryJump() { syncSceneTab(); refreshSelectionUI(); scheduleAutosave(); }

$('#sceneName').addEventListener('input', (e) => model.setSceneName(e.target.value));
$('#sceneName').addEventListener('focus', () => model.checkpoint());

$('#btnClear').addEventListener('click', () => {
  $('#clearModal').hidden = false;
  $('#btnCancelClear').focus();
});
$('#btnCancelClear').addEventListener('click', () => { $('#clearModal').hidden = true; });
$('#btnConfirmClear').addEventListener('click', () => {
  model.clearScene();
  $('#clearModal').hidden = true;
  syncSceneTab();
  refreshSelectionUI();
  toast('Scene cleared — browser copy wiped too', 'success');
});

// export modal
let currentExportTab = 'glsl';
$('#btnExport').addEventListener('click', () => {
  $('#exportModal').hidden = false;
  refreshExportCode();
  $$('.export-tab')[0].focus();
});
$$('.export-tab').forEach(tab => tab.addEventListener('click', () => {
  currentExportTab = tab.dataset.exportTab;
  $$('.export-tab').forEach(t => t.classList.toggle('active', t === tab));
  refreshExportCode();
}));
function refreshExportCode() {
  $('#exportCode').textContent = buildExport(model.scene, currentExportTab);
  $('#downloadCodeLabel').textContent = currentExportTab === 'glsl' ? 'Download .glsl' : currentExportTab === 'shadertoy' ? 'Download .shadertoy.glsl' : 'Download .extrude.glsl';
}
$$('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.hidden = true; });
});
$$('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => { btn.closest('.modal-backdrop').hidden = true; }));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $$('.modal-backdrop').forEach(m => { m.hidden = true; });
});

$('#btnCopyCode').addEventListener('click', async () => {
  const text = $('#exportCode').textContent;
  try {
    await navigator.clipboard.writeText(text);
    toast('Code copied to clipboard', 'success');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast('Code copied to clipboard', 'success');
  }
});

$('#btnDownloadCode').addEventListener('click', () => {
  const suffix = currentExportTab === 'glsl' ? '.glsl' : currentExportTab === 'shadertoy' ? '.shadertoy.glsl' : '.extrude.glsl';
  downloadText(slugify(model.scene.name) + suffix, $('#exportCode').textContent, 'text/plain');
});
$('#btnDownloadPng').addEventListener('click', () => {
  try {
    const dataUrl = SDFRenderer.renderPNG(model.scene, 2048);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = slugify(model.scene.name) + '.png';
    a.click();
    toast('PNG rendered at 2048×2048', 'success');
  } catch (err) {
    toast('PNG export failed: ' + (err.message || err), 'error');
  }
});

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

$('#btnSaveProject').addEventListener('click', () => {
  downloadText(slugify(model.scene.name) + '.sdfmagician.json', model.exportProjectJSON(), 'application/json');
  toast('Project file downloaded', 'success');
});
$('#btnOpen').addEventListener('click', () => $('#fileOpen').click());
$('#fileOpen').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    model.importProjectJSON(text);
    $('#sceneName').value = model.scene.name;
    syncSceneTab();
    refreshSelectionUI();
    toast(`Loaded “${model.scene.name}”`, 'success');
  } catch (err) {
    toast('Could not open project: ' + (err.message || err), 'error');
  }
  e.target.value = '';
});

$('#btnGroup').addEventListener('click', () => model.groupSelected());
$('#btnDuplicateTop').addEventListener('click', () => model.duplicateSelected());
$('#btnDeleteTop').addEventListener('click', () => model.deleteSelected());

// ═══════════════ keyboard shortcuts ═══════════════

window.addEventListener('keydown', (e) => {
  if (isEditableTarget(e.target)) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); if (model.undo()) afterHistoryJump(); return; }
  if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); if (model.redo()) afterHistoryJump(); return; }
  if (mod && key === 'd') { e.preventDefault(); model.duplicateSelected(); return; }
  if (mod && key === 'g' && !e.shiftKey) { e.preventDefault(); model.groupSelected(); return; }
  if (mod && key === 'g' && e.shiftKey) { e.preventDefault(); model.ungroupSelected(); return; }
  if (mod && key === 's') { e.preventDefault(); $('#btnSaveProject').click(); return; }
  if (mod && key === 'e') { e.preventDefault(); $('#btnExport').click(); return; }
  if (key === 'delete' || key === 'backspace') { e.preventDefault(); model.deleteSelected(); return; }
  if (key === 'escape') { model.selectedId = null; refreshSelectionUI(); return; }
  if (key === 'f' || key === '0') { fitView(); return; }
  if (key === '+' || key === '=') { $('#btnZoomIn').click(); return; }
  if (key === '-') { $('#btnZoomOut').click(); return; }
  if (key === '[') { rotateSelected(-15); return; }
  if (key === ']') { rotateSelected(15); return; }

  const nudge = e.shiftKey ? 0.25 : 0.05;
  if (key === 'arrowleft') { e.preventDefault(); throttledNudge(-nudge, 0); }
  else if (key === 'arrowright') { e.preventDefault(); throttledNudge(nudge, 0); }
  else if (key === 'arrowup') { e.preventDefault(); throttledNudge(0, nudge); }
  else if (key === 'arrowdown') { e.preventDefault(); throttledNudge(0, -nudge); }
});

let nudgeAt = 0;
function throttledNudge(dx, dy) {
  if (Date.now() - nudgeAt > 450) model.checkpoint();
  nudgeAt = Date.now();
  model.nudgeSelected(dx, dy);
  syncInspectorValues();
}

let nudgeCheckpointAt = 0;
function rotateSelected(deg) {
  const item = selectedItem();
  if (!item || item.kind === 'modifier') return;
  if (Date.now() - nudgeCheckpointAt > 450) model.checkpoint();
  nudgeCheckpointAt = Date.now();
  model.setTransform(item.id, { rotation: ((item.transform.rotation || 0) + deg) }, { checkpoint: false });
  syncInspectorValues();
}

// ═══════════════ autosave & change plumbing ═══════════════

const scheduleAutosave = debounce(() => {
  const ok = model.saveLocal();
  const el = $('#saveState');
  if (ok) {
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }
}, 450);

const scheduleCompile = debounce(() => {
  if (!renderer) return;
  const result = renderer.compile(model.scene);
  if (!result.ok) {
    showCustomError(result.error);
    toast('Shader error — check your custom SDF code', 'error');
  }
  requestRender();
}, 140);

model.on((_scene, meta) => {
  scheduleAutosave();
  updateUndoButtons();
  if (meta?.structural) {
    renderLayers();
    renderInspector();
  }
  // shape params & transforms are baked into the shader as literals,
  // so every change needs a (debounced) recompile
  scheduleCompile();
});

function updateUndoButtons() {
  $('#btnUndo').disabled = !model.canUndo();
  $('#btnRedo').disabled = !model.canRedo();
}

// ═══════════════ toast ═══════════════

let toastTimer = null;
function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3600);
}

// ═══════════════ boot ═══════════════

// checkpoint once per edit gesture (delegated, wired once)
$('#inspector').addEventListener('focusin', () => model.checkpoint());
$('#inspector').addEventListener('pointerdown', (e) => {
  if (e.target.matches('input[type=range]')) model.checkpoint();
}, true);

function boot() {
  const restored = model.load();
  buildShapeLibrary();
  renderPresetThumbnails();
  renderShapeThumbnails();
  $('#sceneName').value = model.scene.name;
  syncSceneTab();

  resizeCanvases();
  camera.fitScale = computeFitScale() * 0.94;
  camera.scale = camera.fitScale;
  updateZoomLabel();

  if (renderer) {
    const result = renderer.compile(model.scene);
    if (!result.ok) showCustomError(result.error);
  }
  renderLayers();
  renderInspector();
  updateUndoButtons();
  requestRender();
  if (restored === 'storage') toast('Welcome back — your autosaved scene was restored', 'success');

  new ResizeObserver(() => {
    resizeCanvases();
    camera.fitScale = computeFitScale() * 0.94;
    camera.scale = clamp(camera.scale, camera.fitScale * 0.25, camera.fitScale * 40);
    updateZoomLabel();
  }).observe(viewport);

  const raf = () => { draw(); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}

boot();
