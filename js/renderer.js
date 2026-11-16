// ═══════════════════════════════════════════════════════════════
// SDF Magician — WebGL renderer for the live preview & PNG export
// ═══════════════════════════════════════════════════════════════

import { buildPreviewFragment, selectionIndices } from './glsl.js';

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

export class SDFRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false })
      || canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true, alpha: false });
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.gl = gl;
    this.program = null;
    this.uniforms = {};
    this.selMap = new Map();

    // full-screen triangle
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  }

  /** Recompile the shader from the scene. Returns {ok, error}. */
  compile(scene) {
    try {
      const gl = this.gl;
      const source = buildPreviewFragment(scene);
      const prog = createProgram(gl, source);
      if (this.program) gl.deleteProgram(this.program);
      this.program = prog;
      this.selMap = selectionIndices(scene);
      gl.useProgram(prog);
      const aPos = gl.getAttribLocation(prog, 'a_pos');
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      this.uniforms = {};
      for (const name of ['u_resolution', 'u_center', 'u_scale', 'u_falloff', 'u_steps', 'u_lineEvery', 'u_lineStrength', 'u_inside', 'u_outside', 'u_accent', 'u_line', 'u_selIndex']) {
        this.uniforms[name] = gl.getUniformLocation(prog, name);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  resize(cssWidth, cssHeight, dpr) {
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render({ center, scale, falloff, steps, lineEvery, lineStrength, colors, selectedId }) {
    const gl = this.gl;
    if (!this.program) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    const sel = (selectedId != null && this.selMap.has(selectedId)) ? this.selMap.get(selectedId) : -1;
    const u = this.uniforms;
    gl.uniform2f(u.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.u_center, center.x, center.y);
    gl.uniform1f(u.u_scale, scale);
    gl.uniform1f(u.u_falloff, falloff);
    gl.uniform1f(u.u_steps, steps);
    gl.uniform1f(u.u_lineEvery, lineEvery);
    gl.uniform1f(u.u_lineStrength, lineStrength);
    gl.uniform3fv(u.u_inside, hexToRgb(colors.inside));
    gl.uniform3fv(u.u_outside, hexToRgb(colors.outside));
    gl.uniform3fv(u.u_accent, hexToRgb(colors.accent));
    gl.uniform3fv(u.u_line, hexToRgb(colors.line));
    gl.uniform1i(u.u_selIndex, sel);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Render the field to a data-URL PNG at the given pixel size (default 2048²). */
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
    gl.uniform2f(L('u_resolution'), size, size);
    gl.uniform2f(L('u_center'), 0, 0);
    gl.uniform1f(L('u_scale'), size / 4.8);
    gl.uniform1f(L('u_falloff'), scene.contour.falloff);
    gl.uniform1f(L('u_steps'), scene.contour.steps);
    gl.uniform1f(L('u_lineEvery'), scene.contour.lineEvery);
    gl.uniform1f(L('u_lineStrength'), scene.contour.lineStrength);
    gl.uniform3fv(L('u_inside'), hexToRgb(scene.colors.inside));
    gl.uniform3fv(L('u_outside'), hexToRgb(scene.colors.outside));
    gl.uniform3fv(L('u_accent'), hexToRgb(scene.colors.accent));
    gl.uniform3fv(L('u_line'), hexToRgb(scene.colors.line));
    gl.uniform1i(L('u_selIndex'), -1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return canvas.toDataURL('image/png');
  }
}
