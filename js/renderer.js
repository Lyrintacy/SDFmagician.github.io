// ═══════════════════════════════════════════════════════════════
// SDF Magician — WebGL renderer: uniform-driven preview with
// critically-damped-ish lerp. Editing any value (params, transforms,
// heights, blend radii, modifier params) never recompiles — the
// GPU just eases toward the new target. Rebuilds only happen on
// structural changes (add/remove/reorder/blend-mode/code edits).
// ═══════════════════════════════════════════════════════════════

import { buildPreviewFragment, slotMap } from './glsl.js';
import { getShape } from './shapes.js';

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '#000000');
  const int = m ? parseInt(m[1], 16) : 0;
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
};

function createProgram(gl, fragSource) {
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) || 'unknown shader error';
      gl.deleteShader(sh);
      throw new Error(log);
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, fragSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || 'program link error';
    throw new Error(log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

/** walk the same DFS order as the emitter and snapshot every uniform */
function buildTargets(scene, slots) {
  const count = Math.max(1, slots.size);
  const t = new Float32Array(count * 4);
  const r = new Float32Array(count * 2);
  const p = new Float32Array(count * 4);
  const q = new Float32Array(count * 4);
  const k = new Float32Array(count);
  const intFlags = new Uint8Array(count * 8);  // which param slots are int-valued

  const walk = (items) => {
    for (const item of items) {
      const slot = slots.get(item.id);
      const i4 = slot * 4, i2 = slot * 2, i8 = slot * 8;
      if (item.kind === 'modifier') {
        const def = getShape(item.shapeId);
        const val = item.params?.t ?? item.params?.r ?? 0.1;
        p[i4] = val;
        continue;
      }
      if (item.kind === 'group') {
        t[i4] = 0; t[i4 + 1] = 0; t[i4 + 2] = 1; t[i4 + 3] = 0;
        r[i2] = 1; r[i2 + 1] = 0;
        k[slot] = item.k ?? 0.28;
        continue;
      }
      const T = item.transform || { x: 0, y: 0, rotation: 0, scale: 1 };
      const rotRad = ((T.rotation || 0) * Math.PI) / 180;
      t[i4] = T.x || 0;
      t[i4 + 1] = T.y || 0;
      t[i4 + 2] = T.scale || 1;
      t[i4 + 3] = item.height || 0;
      r[i2] = Math.cos(rotRad);
      r[i2 + 1] = Math.sin(rotRad);
      k[slot] = item.k ?? 0.28;
      if (item.kind === 'shape' || item.kind === 'custom') {
        const def = item.kind === 'shape' ? getShape(item.shapeId) : null;
        const keys = def?.params.map(prm => prm.key) ?? [];
        for (let j = 0; j < keys.length; j++) {
          const key = keys[j];
          const v = Number(item.params?.[key]) || 0;
          if (j < 4) p[i4 + j] = v; else q[i4 + (j - 4)] = v;
          const isInt = item.kind === 'shape' && def?.params[j]?.step >= 1;
          if (isInt) intFlags[i8 + j] = 1;
        }
      }
    }
  };
  walk(scene.items || []);
  return { t, r, p, q, k, intFlags, count };
}

export class SDFRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false })
      || canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true, alpha: false });
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.gl = gl;
    this.program = null;
    this.uniforms = {};
    this.slots = new Map();
    this.layoutSnapshot = new Map();  // itemId → previous targets (for remap on recompile)
    this.cur = null;                  // current (lerped) target arrays
    this.tgt = null;
    this.intFlags = null;
    this.lastFrameAt = 0;
    this.lastSource = '';

    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  }

  /** recompile only when the emitted GLSL actually changed (value-only edits produce identical source → no-op) */
  compileIfChanged(scene) {
    let source;
    try {
      source = buildPreviewFragment(scene);
    } catch (err) {
      return { ok: false, changed: false, error: String(err.message || err) };
    }
    if (source === this.lastSource) return { ok: true, changed: false };
    const result = this.compile(scene);
    if (result.ok) this.lastSource = source;
    return { ...result, changed: true };
  }

  /** Recompile from the scene (structural changes). Value edits don't need this. */
  compile(scene) {
    try {
      const gl = this.gl;
      const source = buildPreviewFragment(scene);
      this.lastSource = source;
      const prog = createProgram(gl, source);
      if (this.program) gl.deleteProgram(this.program);
      this.program = prog;
      gl.useProgram(prog);
      const aPos = gl.getAttribLocation(prog, 'a_pos');
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      this.slots = slotMap(scene);
      const N = Math.max(1, this.slots.size);
      this.uniforms = {};
      for (const name of ['u_resolution', 'u_center', 'u_scale', 'u_falloff', 'u_steps', 'u_lineEvery', 'u_lineStrength', 'u_boundaryAlpha', 'u_inside', 'u_outside', 'u_accent', 'u_line']) {
        this.uniforms[name] = gl.getUniformLocation(prog, name);
      }
      for (const name of ['u_t', 'u_r', 'u_p', 'u_q', 'u_k', 'u_sel']) {
        this.uniforms[name] = gl.getUniformLocation(prog, `${name}[0]`);
      }

      // new targets…
      const tgt = buildTargets(scene, this.slots);
      // …but keep the previous values for layers that existed before (remap by id)
      const cur = {
        t: new Float32Array(tgt.t), r: new Float32Array(tgt.r),
        p: new Float32Array(tgt.p), q: new Float32Array(tgt.q), k: new Float32Array(tgt.k),
      };
      const oldSlots = this.slots && this.layoutSnapshot ? this.layoutSnapshot.slots : null;
      const oldCur = this.layoutSnapshot ? this.layoutSnapshot.cur : null;
      if (oldSlots && oldCur) {
        for (const [id, newSlot] of this.slots) {
          const oldSlot = oldSlots.get(id);
          if (oldSlot == null) continue;
          for (let j = 0; j < 4; j++) {
            cur.t[newSlot * 4 + j] = oldCur.t[oldSlot * 4 + j];
            cur.p[newSlot * 4 + j] = oldCur.p[oldSlot * 4 + j];
            cur.q[newSlot * 4 + j] = oldCur.q[oldSlot * 4 + j];
          }
          cur.r[newSlot * 2] = oldCur.r[oldSlot * 2];
          cur.r[newSlot * 2 + 1] = oldCur.r[oldSlot * 2 + 1];
          cur.k[newSlot] = oldCur.k[oldSlot];
        }
      }
      this.cur = cur;
      this.tgt = tgt;
      this.intFlags = tgt.intFlags;
      this.layoutSnapshot = { slots: this.slots, cur: { ...cur, t: Float32Array.from(cur.t), r: Float32Array.from(cur.r), p: Float32Array.from(cur.p), q: Float32Array.from(cur.q), k: Float32Array.from(cur.k) } };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  /** lerp current → target; returns true while still animating */
  updateUniforms(scene, dtSeconds) {
    if (!this.cur) return false;
    const tgt = buildTargets(scene, this.slots);
    this.tgt = tgt;
    const rate = 1 - Math.exp(-dtSeconds * 13);
    let maxDelta = 0;
    const step = (cur, tgtA, i) => {
      const d = tgtA[i] - cur[i];
      if (d === 0) return;
      if (Math.abs(d) < 1e-4) { cur[i] = tgtA[i]; return; }
      cur[i] += d * rate;
      const rem = Math.abs(tgtA[i] - cur[i]);
      if (rem > maxDelta) maxDelta = rem;
    };
    for (let i = 0; i < this.cur.t.length; i++) step(this.cur.t, tgt.t, i);
    for (let i = 0; i < this.cur.r.length; i++) step(this.cur.r, tgt.r, i);
    for (let i = 0; i < this.cur.p.length; i++) {
      if (this.intFlags[(i >> 2) * 8 + (i & 3)]) this.cur.p[i] = tgt.p[i];
      else step(this.cur.p, tgt.p, i);
    }
    for (let i = 0; i < this.cur.q.length; i++) {
      if (this.intFlags[(i >> 2) * 8 + 4 + (i & 3)]) this.cur.q[i] = tgt.q[i];
      else step(this.cur.q, tgt.q, i);
    }
    for (let i = 0; i < this.cur.k.length; i++) step(this.cur.k, tgt.k, i);
    return maxDelta > 1e-4;
  }

  resize(cssWidth, cssHeight, dpr) {
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  _uploadLayerUniforms() {
    const gl = this.gl, u = this.uniforms, N = this.cur.t.length / 4;
    gl.uniform4fv(u.u_t, this.cur.t);
    gl.uniform2fv(u.u_r, this.cur.r);
    gl.uniform4fv(u.u_p, this.cur.p);
    gl.uniform4fv(u.u_q, this.cur.q);
    gl.uniform1fv(u.u_k, this.cur.k);
    return N;
  }

  _uploadSelection(selectedIds) {
    const gl = this.gl, u = this.uniforms;
    const N = Math.max(1, this.cur ? this.cur.t.length / 4 : 1);
    const flags = new Float32Array(N);
    if (selectedIds) for (const id of selectedIds) {
      const slot = this.slots.get(id);
      if (slot != null && slot < N) flags[slot] = 1;
    }
    gl.uniform1fv(u.u_sel, flags);
  }

  render({ scene, center, scale, falloff, steps, lineEvery, lineStrength, colors, selectedIds, boundaryAlpha }) {
    const gl = this.gl;
    if (!this.program || !this.cur) return false;

    const now = performance.now() / 1000;
    const dt = this.lastFrameAt ? Math.min(0.05, now - this.lastFrameAt) : 1 / 60;
    this.lastFrameAt = now;
    const animating = this.updateUniforms(scene, dt);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    const u = this.uniforms;
    gl.uniform2f(u.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.u_center, center.x, center.y);
    gl.uniform1f(u.u_scale, scale);
    gl.uniform1f(u.u_falloff, falloff);
    gl.uniform1f(u.u_steps, steps);
    gl.uniform1f(u.u_lineEvery, lineEvery);
    gl.uniform1f(u.u_lineStrength, lineStrength);
    gl.uniform1f(u.u_boundaryAlpha, boundaryAlpha ?? (selectedIds && selectedIds.length ? 0.35 : 0.6));
    gl.uniform3fv(u.u_inside, hexToRgb(colors.inside));
    gl.uniform3fv(u.u_outside, hexToRgb(colors.outside));
    gl.uniform3fv(u.u_accent, hexToRgb(colors.accent));
    gl.uniform3fv(u.u_line, hexToRgb(colors.line));
    this._uploadLayerUniforms();
    this._uploadSelection(selectedIds);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return animating;
  }

  /** Render the field to a data-URL PNG (default 2048²). */
  static renderPNG(scene, size = 2048) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) throw new Error('WebGL unavailable for export');
    const source = buildPreviewFragment(scene);
    const prog = createProgram(gl, source);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(prog);
    const L = (n) => gl.getUniformLocation(prog, n);
    const slots = slotMap(scene);
    const targets = buildTargets(scene, slots);
    const N = Math.max(1, slots.size);
    gl.uniform2f(L('u_resolution'), size, size);
    gl.uniform2f(L('u_center'), 0, 0);
    gl.uniform1f(L('u_scale'), size / 4.8);
    gl.uniform1f(L('u_falloff'), scene.contour.falloff);
    gl.uniform1f(L('u_steps'), scene.contour.steps);
    gl.uniform1f(L('u_lineEvery'), scene.contour.lineEvery);
    gl.uniform1f(L('u_lineStrength'), scene.contour.lineStrength);
    gl.uniform1f(L('u_boundaryAlpha'), 0.6);
    gl.uniform3fv(L('u_inside'), hexToRgb(scene.colors.inside));
    gl.uniform3fv(L('u_outside'), hexToRgb(scene.colors.outside));
    gl.uniform3fv(L('u_accent'), hexToRgb(scene.colors.accent));
    gl.uniform3fv(L('u_line'), hexToRgb(scene.colors.line));
    gl.uniform4fv(L('u_t[0]'), targets.t);
    gl.uniform2fv(L('u_r[0]'), targets.r);
    gl.uniform4fv(L('u_p[0]'), targets.p);
    gl.uniform4fv(L('u_q[0]'), targets.q);
    gl.uniform1fv(L('u_k[0]'), targets.k);
    gl.uniform1fv(L('u_sel[0]'), new Float32Array(N));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return canvas.toDataURL('image/png');
  }
}
