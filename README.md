# ✦ SDF Magician

**Visual signed distance field studio** — compose complex SDFs out of a library of shapes, blend them with boolean & smooth operators, preview the field with a contour gradient, and export clean, readable GLSL (or drop it straight into Shadertoy).

Live site: <https://sdfmagician.github.io>

![SDF Magician](https://img.shields.io/badge/SDF-Magician-818cf8?style=for-the-badge)

## What it does

- **A library of 20+ shape SDFs** — circle, box, rounded box, ellipse, equilateral triangle, rhombus, capsule, trapezoid, line/strip, regular polygon, hexagon, octagon, star, heart, moon, ring, cross, rounded X, pie wedge, vesica.
- **Boolean & smooth operators per layer** — union, subtract, intersect, XOR, smooth union / smooth subtract / smooth intersect (with *blend radius k*), replace.
- **Layers, groups, nesting** — Photoshop-style stack; drag to reorder, drop onto a group to nest, groups transform as one and ungroup with world placement preserved.
- **Modifiers** — invert field, onion (outline), round/grow, mirror X, mirror Y, quad symmetry. They act on everything *below* them in the stack, like adjustment layers.
- **Per-layer Height / surface offset** — shifts the iso boundary (`d − height`), grows or shrinks any shape, visible live in the gradient.
- **Live field preview** — inside color A → outside color B across a configurable gradient range, with **gradient steps** quantization and **contour lines every x world units**. The `d = 0` boundary gets an accent stroke; the selected layer glows magenta.
- **Scene export three ways** — plain `sceneSDF(vec2)` GLSL function, full Shadertoy `mainImage` with your colors & steps baked in, or a **3D extruded** `sceneSDF3D(vec3)` with rounded edges. Plus PNG render at 2048², and `.sdfmagician.json` project files (save/open).
- **Custom SDF layers** — write raw GLSL; it compiles live into the scene (with error reporting) and is exported as a named function in your code.
- **This browser remembers your work** — every change auto-saves to `localStorage`; **Clear** asks for confirmation and wipes that copy too.
- Power-user extras: undo/redo (Ctrl+Z / Ctrl+Y), duplicate (Ctrl+D), group (Ctrl+G) / ungroup (Ctrl+Shift+G), arrow-key nudging, shift-drag axis lock, shift-rotate 15° snapping, snap-to-grid, axis/grid overlay with unit labels, click-to-select in the canvas, live `d =` readout at the cursor, mouse-wheel zoom, space/middle/right-drag pan, auto-numbered layers, preset scenes (Smiley, Gear, Heart Charm, Little Ghost).

## Controls

| Input | Action |
| --- | --- |
| Drag shape | Move it (shift = axis lock, snap toggle magnetizes to 0.25) |
| Click shape | Select it (nearest by field distance) |
| Magenta halo / cyan & pink handles | Selected: drag center to move, cyan handle to rotate, pink square to scale |
| Mouse wheel | Zoom at cursor |
| `Space`+drag / middle / right drag | Pan |
| Arrow keys | Nudge selection (Shift = bigger step) |
| `[` / `]` | Rotate selection by 15° |
| `Ctrl/⌘+Z` / `Ctrl/⌘+Y` | Undo / redo |
| `Ctrl/⌘+D` | Duplicate layer |
| `Ctrl/⌘+G` / `Ctrl/⌘+Shift+G` | Group / ungroup |
| `Ctrl/⌘+S` | Download project file |
| `Ctrl/⌘+E` | Open export dialog |
| `Del` | Delete selection |
| `F` or `0` | Fit scene |

## Reading the field

Negative distance = inside, positive = outside. The boundary stroke lives at `d = 0`. Gradient steps posterize the falloff into bands; contour lines mark every *x* units of distance, so you can read the exact field — the same math your shader will run.

## Exported code

The export contains only the helpers your scene actually uses, plus your custom layers, in dependency order. A small example (from the Smiley preset):

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

Many primitives are adapted from [Inigo Quilez's SDF list](https://iquilezles.org/articles/distfunctions2d). The star is a polar approximation (kept smooth and fast); it is labelled as such in the export.

## Developing

No build step. Static files only:

```bash
python3 -m http.server 8000    # or any static file server
# open http://localhost:8000
```

Layout:

```
index.html        markup & panels
css/style.css     dark "magic" theme
js/shapes.js      shape catalog + JS evaluator (thumbnails / cursor picking / d-readout)
js/glsl.js        GLSL helper library + shader & export-code generator
js/model.js       scene graph, history, presets, localStorage, import/export
js/renderer.js    WebGL preview renderer + 2048² PNG export
js/main.js        UI wiring, gizmos, layers panel, inspector, shortcuts
```

The preview shader and the export are generated from the **same** scene graph, so what you see is exactly what you export.

## Ideas for later

- Multi-select & marquee, per-layer fill colors, true 3D ray-marched preview
- SVG contour tracing, STL export of the extruded field, Text layer, image/displacement layers
- WebSocket sync for live collaboration
