# ✦ SDF Magician

**Visual signed distance field studio** — compose SDFs out of a library of shapes, blend them with boolean & smooth operators, preview the field with a banded iso-contour gradient, and export clean, readable code (GLSL, Shadertoy, HLSL, or 3D-extruded).

Live site: <https://sdfmagician.github.io>

![SDF Magician](https://img.shields.io/badge/SDF-Magician-1e2733?style=for-the-badge)

## What it does

- **A library of 20+ shape SDFs** — circle, box, rounded box, ellipse (iq's *exact* method), equilateral triangle, rhombus, capsule, trapezoid, line/strip, regular polygon, hexagon, octagon, star, heart, moon (crescent), ring, cross, rounded X, pie wedge, vesica.
- **Boolean & smooth operators per layer** — union, subtract, intersect, XOR, smooth union / smooth subtract / smooth intersect (with *blend radius k*), replace.
- **Layers, groups, nesting** — Photoshop-style stack. Drag to reorder, drop onto a group to nest. **Groups are pure containers**: children keep their world positions, so moving a group moves everything inside it — no hidden offsets, ever. Groups ungroup with world placement preserved.
- **Modifiers** — invert field, onion (outline), round/grow, mirror X, mirror Y, quad symmetry. They act on everything *below* them in the stack, like adjustment layers — and they apply **live at runtime**, no respawning required.
- **Multi-select with Shift** — shift-click on the canvas or in the layer stack; shared properties (blend mode, blend radius, height) edit every selected layer at once. `Ctrl/⌘+A` selects everything.
- **Nearest-SDF picking** — click anywhere on the board: the *closest* SDF (inside first, then nearest boundary, then nearest center) is selected. Shift-click toggles membership.
- **Direct edge dragging** — shapes made of lines (trapezoid, triangle, capsule, ring, star, moon, …) get on-canvas handles; grab an edge and drag to reshape.
- **Per-layer Height / surface offset** — shifts the iso boundary (`d − height`), grows or shrinks any shape, visible live in the gradient.
- **Live, smooth preview** — edits ease in on the GPU (uniforms lerp toward their targets every frame); nothing ever recompiles for value tweaks, so dragging feels physical. Inside color A → outside color B across a configurable gradient range, with **gradient steps** posterization, **contour lines**, and a configurable **boundary stroke** (50 % alpha for the whole SDF when nothing is focused).
- **Export tab** — a full inspector tab with **live, syntax-plain code** of the current SDF plus one-click export as GLSL, Shadertoy, HLSL (SM5), or 3D-extruded GLSL. Also: PNG render at 2048², and `.sdfmagician.json` project files (save/open).
- **Custom SDF layers** — write raw GLSL; it compiles live into the scene (with error reporting) and is exported as a named function in your code.
- **This browser remembers your work** — every change auto-saves to `localStorage`; **Clear** asks for confirmation and wipes that copy too.
- Power-user extras: undo/redo (Ctrl+Z / Ctrl+Y), duplicate (Ctrl+D), group (Ctrl+G) / ungroup (Ctrl+Shift+G), arrow-key nudging, shift-drag axis lock, shift-rotate 15° snapping, snap-to-grid, grid overlay with unit labels, mouse-wheel zoom, space/middle/right-drag pan, presets (Smiley, Gear, Heart Charm, Little Ghost).

## Controls

| Input | Action |
| --- | --- |
| Click board | Select the closest SDF (Shift = add/remove from selection) |
| Drag shape | Move selection (Shift = axis lock, snap toggle magnetizes to 0.25) |
| Drag white dots on a selected shape | Reshape it directly (edge params) |
| Cyan dot above selection | Rotate (Shift = 15° steps) |
| Amber square right of selection | Scale |
| `Esc` | Clear selection → whole-SDF 50 % outline returns |
| Mouse wheel | Zoom at cursor |
| `Space`+drag / middle / right drag | Pan |
| Arrow keys | Nudge selection (Shift = bigger step) |
| `[` / `]` | Rotate selection by 15° |
| `Ctrl/⌘+A` | Select all |
| `Ctrl/⌘+Z` / `Ctrl/⌘+Y` | Undo / redo |
| `Ctrl/⌘+D` | Duplicate selection |
| `Ctrl/⌘+G` / `Ctrl/⌘+Shift+G` | Group / ungroup |
| `Ctrl/⌘+S` | Download project file |
| `Ctrl/⌘+E` | Open the Export tab |
| `Del` | Delete selection |
| `F` or `0` | Fit scene |

## Reading the field

Negative distance = inside, positive = outside. The boundary stroke lives at `d = 0`. Gradient steps posterize the falloff into bands; contour lines mark every *x* world units of distance, so you can read the exact field — the same math your shader will run. The status bar shows `d` at the cursor.

## Exported code

The export contains only the helpers your scene actually uses, plus your custom layers, in dependency order, with per-layer comments. Example (Smiley preset):

```glsl
float sdCircle(vec2 p, float r) { return length(p) - r; }

float sceneSDF(vec2 p) {
  float d = 1e9;
  // ── Face · union ──
  vec2 q0 = p;
  q0 -= vec2(0.0000, 0.0500);
  float d0 = sdCircle(q0, 1.2000);
  d = min(d, d0);
  // ...
  return d;
}
```

Many primitives are adapted from [Inigo Quilez's SDF list](https://iquilezles.org/articles/distfunctions2d). The star is a polar approximation labelled as such in the export. Shape authoring notes:

- **Ellipse** uses iq's exact quartic solution (circle fast path included).
- **Moon** is the `max(outer, −offset inner)` crescent construction.
- **Heights**: every layer honors `d − height`, so code exported from SDF Magician behaves exactly like the preview.

## Developing

No build step. Static files only:

```bash
python3 -m http.server 8000    # or any static file server
# open http://localhost:8000
```

Layout:

```
index.html        markup & panels
css/style.css     bright "ice" theme — light chrome, black canvas
js/shapes.js      shape catalog + JS evaluator (thumbnails / picking / d-readout)
js/glsl.js        GLSL helper library + preview-fragment & export-code generators
js/model.js       scene graph, history, presets, multi-select, localStorage, import/export
js/renderer.js    WebGL preview — uniform arrays + exponential lerp; 2048² PNG export
js/main.js        UI wiring, gizmos, layers/inspector/export panels, shortcuts
```

The preview and the export are generated from the **same** scene graph, so what you see is exactly what you export. The preview path uploads per-layer uniforms (`u_t / u_r / u_p / u_q / u_k / u_sel`) and eases them toward their targets every frame; the exported code is the literal, readable twin of that circuit.

Scene format is versioned (`version: 2`); groups no longer carry a transform by design (pure containers). Auto-saved scenes from older versions load fine — any stored group offsets are ignored in favor of world placement.

## Ideas for later

- Marquee selection & per-layer fill colors
- SVG contour tracing, STL export of the extruded field, Text layer
- True 3D ray-marched preview alongside the extrude export
