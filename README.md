# Shadow Box Lamp Designer

A browser-based 3D design tool for creating **shadow box lamps** — decorative lamps where a single LED projects an image's shadow onto a surface through precisely shaped wall profiles.

Upload any silhouette image, and the tool computes the exact wall geometry needed to cast that shadow. Supports multiple box shapes, internal detail cutouts, and exports production-ready SVG/DXF files for laser cutting.

## How It Works

A shadow box lamp consists of:
- A **point light source** (LED) at the top center
- **Wall panels** arranged in a shape (square, cylinder, star, heart, etc.)
- Each wall has a **height profile** computed via inverse projection
- Light passing over wall edges casts a **shadow on the floor** matching your input image

The math: for a wall point at position `(wx, wy)` with height `wz`, the shadow lands at `(gx, gy) = (wx, wy) * hL / (hL - wz)` where `hL` is the LED height. The tool inverts this to find the wall height needed at each point.

## Features

### Multi-Shape Architecture
- **Square** (4 walls) — classic shadow box
- **Rectangle** (4 walls) — different width/height ratio
- **Cylinder** (16 segments) — smooth circular enclosure
- **Heart** (24 segments) — decorative heart shape
- **Star** (10 segments) — 5-pointed star

Each shape is built from N flat wall segments. The entire pipeline (profile solver, bitmap solver, UI panels, export) adapts dynamically to the wall count.

### Two Rendering Modes

**Profile Mode** — Computes the outer silhouette edge per wall. Each wall gets a smooth top-edge curve. Best for simple, clean silhouettes.

**Detail Mode** — Computes a 2D bitmap per wall (240x150 grid). Solid cells block light (shadow), hole cells let light through (bright spots). This captures **internal details** like eyes, mane lines, facial features — not just the outer outline.

### Real-Time 3D Preview
- Three.js scene with orbit controls
- Walls rendered with actual geometry (profile curves or bitmap holes)
- Floor shadow projection via reverse ray-traced texture (512x512)
- Distance circles with radius labels on the floor
- Wall-color-coded projections on the ground plane
- LED point light with adjustable height

### Export
- **SVG** — Vector outlines for profile mode; embedded bitmap rasters for detail mode. Fullscreen preview with zoom/pan.
- **DXF** — AutoCAD-compatible (AC1015) with proper layers (one per wall), LWPOLYLINE entities, mm units. Ready for laser cutters and CNC machines.

### Controls
| Parameter | Range | Description |
|-----------|-------|-------------|
| LED Height | 30–150 mm | Distance from floor to LED |
| Wall Height | 10–100 mm | Maximum wall panel height |
| Box Width | 40–300 mm | Overall enclosure size |
| Threshold | 0–255 | Image binarization threshold |
| Smooth σ | 0–10 | Gaussian smoothing on contour |
| Resolution | 180–1440 | Profile sampling points per wall |
| Shape | 5 options | Box geometry shape |
| Detail Mode | on/off | Bitmap holes vs profile edge |

## Quick Start

```bash
# Clone
git clone https://github.com/YunusYilmaz/shadow-box-lamp-designer.git
cd shadow-box-lamp-designer

# Install
npm install

# Run
npm run dev
```

Open `http://localhost:3000` in your browser.

## Usage

1. **Select a shape** from the dropdown (square, cylinder, heart, star, rectangle)
2. **Upload an image** — drag & drop or click the upload area. Use high-contrast black silhouettes for best results.
3. **Adjust parameters** — LED height, wall height, threshold
4. **Toggle Detail Mode** to see internal cutouts in walls
5. **Preview SVG** — click Export tab, then fullscreen button for zoom/pan
6. **Export** — download SVG or DXF for fabrication

Built-in test images (Ninja, Lion, Heart, Star) are available for quick experimentation.

## Project Structure

```
src/
├── main.js                  # Application entry, orchestrates all systems
├── constants.js             # Physical dimensions, colors
├── state.js                 # Reactive app state
├── shapes/
│   └── BoxShape.js          # Shape definitions (square, rect, cylinder, heart, star)
├── solver/
│   ├── ContourExtractor.js  # Image → radial contour (web worker)
│   ├── DirectProfileSolver.js # Per-wall ray tracing solver
│   ├── WallBitmapSolver.js  # 2D occupancy grid solver (detail mode)
│   ├── ForwardProjection.js # Wall point → floor point math
│   └── InverseProjection.js # Floor point → wall height math
├── workers/
│   ├── contourWorker.js     # Background contour extraction
│   ├── directProfileWorker.js # Background N-wall profile computation
│   └── wallBitmapWorker.js  # Background N-wall bitmap computation
├── scene/
│   ├── SceneManager.js      # Three.js scene, camera, renderer
│   ├── WallMeshes.js        # N-segment wall geometry (profile + bitmap holes)
│   ├── ShadowOverlay.js     # Floor shadow texture via reverse projection
│   ├── FloorAnnotations.js  # Distance circles, wall projections
│   ├── DetailedWallMesh.js  # Legacy 4-wall bitmap mesh
│   └── ...                  # Lighting, Floor, TargetContour, RayVisualizer
├── layers/
│   ├── LayerManager.js      # Multi-layer management
│   └── LayerComposer.js     # Layer compositing
├── export/
│   ├── SVGExporter.js       # SVG generation (profile curves + bitmap rasters)
│   ├── DXFExporter.js       # DXF generation (LWPOLYLINE, AutoCAD layers)
│   └── ScreenshotExporter.js
├── ui/
│   ├── UIManager.js         # Dynamic N-panel UI, shape selector, modals
│   ├── KeyboardShortcuts.js
│   └── UndoRedo.js
└── styles/
    └── main.css
```

## Tech Stack

- **Three.js** — 3D rendering, orbit controls, shadow mapping
- **Vite** — Dev server with HMR, zero-config bundling
- **Web Workers** — Background computation for contour/profile/bitmap solvers
- **Canvas API** — Image processing, bitmap-to-texture conversion
- No other dependencies. Pure vanilla JS, no frameworks.

## The Math

### Forward Projection
Given LED at `(0, 0, hL)` and wall point `(wx, wy, wz)`:
```
t = hL / (hL - wz)
floor_x = wx * t
floor_y = wy * t
```

### Inverse Projection
Given a desired shadow point `(gx, gy)` on the floor and wall at position `(wx, wy)`:
```
wz = hL * (1 - wx/gx)   // or wy/gy depending on wall orientation
```

### Bitmap Detail Mode
For each cell `(s, h)` in the wall grid:
1. Compute wall 3D point from segment endpoints and height
2. Forward-project to floor
3. Map floor point to image pixel coordinates
4. Sample brightness — dark pixel = solid material, bright = hole

## License

MIT
