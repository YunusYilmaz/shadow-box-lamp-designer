import './styles/main.css';
import { appState } from './state.js';
import { SceneManager } from './scene/SceneManager.js';
import { Lighting } from './scene/Lighting.js';
import { Floor } from './scene/Floor.js';
import { WallMeshes } from './scene/WallMeshes.js';
import { ShadowOverlay } from './scene/ShadowOverlay.js';
import { TargetContour } from './scene/TargetContour.js';
import { RayVisualizer } from './scene/RayVisualizer.js';
import { FloorAnnotations } from './scene/FloorAnnotations.js';
import { ContourExtractor } from './solver/ContourExtractor.js';
import { DirectProfileSolver } from './solver/DirectProfileSolver.js';
import { WallBitmapSolver } from './solver/WallBitmapSolver.js';
import { LayerManager } from './layers/LayerManager.js';
import { LayerComposer } from './layers/LayerComposer.js';
import { UIManager } from './ui/UIManager.js';
import { KeyboardShortcuts } from './ui/KeyboardShortcuts.js';
import { UndoRedo } from './ui/UndoRedo.js';
import { SVGExporter } from './export/SVGExporter.js';
import { DXFExporter } from './export/DXFExporter.js';
import { ScreenshotExporter } from './export/ScreenshotExporter.js';
import { DetailedWallMesh } from './scene/DetailedWallMesh.js';
import { BoxShape, SHAPE_PRESETS } from './shapes/BoxShape.js';
import { DEFAULT_CANVAS_SIZE } from './constants.js';

// ─── Initialize ───
const layerManager = new LayerManager();
const contourExtractor = new ContourExtractor();
const directSolver = new DirectProfileSolver();
const bitmapSolver = new WallBitmapSolver();
const layerComposer = new LayerComposer();
const svgExporter = new SVGExporter();
const dxfExporter = new DXFExporter();
const undoRedo = new UndoRedo();
let currentBitmapData = null; // cached for export
let boxShape = new BoxShape('square', { size: 120 });

// ─── UI ───
const ui = new UIManager(appState, null, layerManager, {
  onImageLoad: handleFile,
  onRecompute: recompute,
  onExport: doExport,
  onExportDXF: doExportDXF,
  onScreenshot: doScreenshot,
  onGeometryChange: handleGeometryChange,
  onShapeChange: handleShapeChange,
  onSvgPreview: updateSvgPreview,
});

// ─── Scene ───
const sceneManager = new SceneManager(ui.getViewport());
// Debug: expose to window for inspection
window.__scene = sceneManager;
window.__getBoxShape = () => boxShape;
window.__getWallMeshes = () => wallMeshes;
const lighting = new Lighting(sceneManager.scene);
const floor = new Floor(sceneManager.scene);
const wallMeshes = new WallMeshes(sceneManager.scene);
const shadowOverlay = new ShadowOverlay(sceneManager.scene);
const targetContour = new TargetContour(sceneManager.scene);
const rayVisualizer = new RayVisualizer(sceneManager.scene);
const detailedWallMesh = new DetailedWallMesh(sceneManager.scene);
const floorAnnotations = new FloorAnnotations(sceneManager.scene);

const screenshotExporter = new ScreenshotExporter(
  sceneManager.renderer, sceneManager.scene, sceneManager.camera
);

// ─── State ───
let sourceImage = null;

// ─── State change handlers ───
appState.addEventListener('change', (e) => {
  const { key, value } = e.detail;

  switch (key) {
    case 'showRays':
      if (value) {
        const layer = layerManager.activeLayer;
        if (layer?.wallProfiles) {
          rayVisualizer.update(layer.wallProfiles, layer.halfSide, layer.ledHeight);
        }
      } else {
        rayVisualizer.clear();
      }
      break;

    case 'wireframe':
      wallMeshes.setWireframe(value);
      break;

    case 'shadowOverlay':
      shadowOverlay.setVisible(value);
      targetContour.setVisible(value);
      break;
  }
});

// ─── Layer events ───
layerManager.addEventListener('profiles-updated', () => {
  updateSceneFromLayers();
});

// ─── Pipeline functions ───
function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      appState.set('sourceImage', img);
      processImage();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// Cached offscreen canvas data
let cachedImageData = null;
let cachedSize = 0;

function renderToOffscreen() {
  const size = DEFAULT_CANVAS_SIZE;
  const offscreen = document.createElement('canvas');
  offscreen.width = size;
  offscreen.height = size;
  const ctx = offscreen.getContext('2d');

  // White background so non-image areas are "light"
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const scale = Math.max(size / sourceImage.width, size / sourceImage.height);
  const sw = sourceImage.width * scale;
  const sh = sourceImage.height * scale;
  ctx.drawImage(sourceImage, (size - sw) / 2, (size - sh) / 2, sw, sh);

  cachedImageData = ctx.getImageData(0, 0, size, size);
  cachedSize = size;
  return cachedImageData;
}

async function processImage() {
  if (!sourceImage) return;

  const detailMode = appState.get('detailMode');
  const isCustomShape = boxShape && boxShape.type !== 'square';
  ui.setStatus(detailMode ? 'Computing detailed bitmap...' : 'Computing profiles...', true);

  const imageData = renderToOffscreen();
  const size = cachedSize;
  const threshold = appState.get('threshold');
  const sigma = appState.get('sigma');
  const layer = layerManager.activeLayer;

  // Prepare segment data for N-wall solvers
  const segmentData = isCustomShape ? boxShape.segments.map(s => ({ p1: s.p1, p2: s.p2 })) : null;

  try {
    // Always extract radial contour for preview
    const contourPromise = contourExtractor.extract(
      new Uint8ClampedArray(imageData.data), size, size,
      { threshold, resolution: appState.get('resolution'), sigma }
    );

    const isCustomShape = boxShape && boxShape.type !== 'square';

    // ─── Always compute profiles (needed for both modes + custom shapes) ───
    const directPromises = layerManager.layers.map(l =>
      directSolver.solve(
        new Uint8ClampedArray(imageData.data), size, size,
        {
          threshold,
          hL: l.ledHeight,
          a: l.halfSide,
          hW: l.wallHeight,
          profilePoints: l.profilePoints,
          sigma: Math.max(1, sigma * 0.7),
          segments: segmentData,
        }
      )
    );

    if (detailMode) {
      // ─── DETAIL MODE ───
      const bitmapPromise = bitmapSolver.solve(
        new Uint8ClampedArray(imageData.data), size, size,
        {
          threshold,
          hL: layer.ledHeight,
          a: layer.halfSide,
          hW: layer.wallHeight,
          gridW: 240,
          gridH: 150,
          maxWallH: 75,
          segments: segmentData,
        }
      );

      const [contour, bitmapData, ...layerProfiles] = await Promise.all([
        contourPromise, bitmapPromise, ...directPromises,
      ]);

      // Store profiles on layers (needed for wall rendering)
      for (let i = 0; i < layerManager.layers.length; i++) {
        layerManager.layers[i].wallProfiles = layerProfiles[i];
      }

      appState.set('contour', contour);
      currentBitmapData = bitmapData;

      if (isCustomShape) {
        // Custom shape: show walls WITH bitmap holes (internal detail)
        detailedWallMesh.clear();
        wallMeshes.removeLayer('default');
        wallMeshes.updateFromSegmentsWithBitmaps(boxShape, layer, bitmapData);
      } else {
        // Square: use detailed wall mesh with holes
        wallMeshes.setLayerVisible('default', false);
        for (const l of layerManager.layers) {
          wallMeshes.setLayerVisible(l.id, false);
        }
        detailedWallMesh.update(
          bitmapData.bitmaps, bitmapData.gridW, bitmapData.gridH,
          bitmapData.maxWallH, layer.halfSide
        );
      }

      // Shadow texture on floor (works for all shapes — uses 4-wall projection)
      shadowOverlay.updateFromBitmap(
        bitmapData.bitmaps, bitmapData.gridW, bitmapData.gridH,
        bitmapData.maxWallH, layer.halfSide, layer.ledHeight
      );
      targetContour.update(contour, layer.halfSide, layer.mag);

      ui.showImagePreview(sourceImage, contour);
      ui.enableExport(true);
      ui.drawBitmapPanels(bitmapData);

      const shapeLabel = isCustomShape ? ` [${boxShape.type}]` : '';
      ui.setStatus(`Detail mode${shapeLabel} — ${bitmapData.gridW}×${bitmapData.gridH} grid`, false);
      updateSvgPreview();

    } else {
      // ─── PROFILE MODE ───
      detailedWallMesh.clear();
      shadowOverlay.setDetailVisible(false);
      currentBitmapData = null;

      const [contour, ...layerProfiles] = await Promise.all([
        contourPromise, ...directPromises,
      ]);

      for (let i = 0; i < layerManager.layers.length; i++) {
        layerManager.layers[i].wallProfiles = layerProfiles[i];
      }

      appState.set('contour', contour);
      const activeProfiles = layerManager.activeLayer?.wallProfiles;
      if (activeProfiles) undoRedo.push(activeProfiles);

      updateSceneFromLayers();
      ui.enableExport(true);

      const shapeLabel = isCustomShape ? ` [${boxShape.type}]` : '';
      ui.setStatus(`Profile mode${shapeLabel} — ${layerManager.layers[0]?.profilePoints || 720} pts/wall`, false);
      updateSvgPreview();
    }

    ui.showImagePreview(sourceImage, appState.get('contour'));
    if (!appState.get('detailMode')) {
      ui.drawProfilePanels(layerManager, boxShape);
    }

  } catch (err) {
    console.error('Computation failed:', err);
    ui.setStatus('Error: ' + err.message, false);
  }
}

async function recompute() {
  if (sourceImage) {
    await processImage();
  } else {
    // No image yet — ensure correct mode is shown
    const detailMode = appState.get('detailMode');
    if (detailMode) {
      // Detail mode without image: hide profile walls, show nothing (no bitmap to compute)
      // Keep walls visible so user sees the box
      detailedWallMesh.clear();
    } else {
      detailedWallMesh.clear();
    }
    updateSceneFromLayers();
    ui.drawProfilePanels(layerManager, boxShape);
  }
}

function handleShapeChange(shapeKey) {
  const preset = SHAPE_PRESETS[shapeKey];
  if (!preset) return;

  boxShape = new BoxShape(preset.type, preset.params);
  appState.set('boxShape', boxShape);

  // Update active layer halfSide based on shape radius
  const layer = layerManager.activeLayer;
  if (layer) {
    layer.halfSide = Math.round(boxShape.maxRadius);
  }

  // Rebuild bottom panels for N walls
  ui.updateWallPanelsForShape(boxShape);

  // Rebuild 3D wall meshes for the new shape
  rebuildShapeWalls();

  // Re-process image if loaded
  if (sourceImage) {
    processImage();
  }

  ui.setStatus(`Shape: ${preset.label}`, false);
}

function rebuildShapeWalls() {
  // Remove existing wall meshes
  for (const layer of layerManager.layers) {
    wallMeshes.removeLayer(layer.id);
  }
  wallMeshes.removeLayer('default');

  // Build new wall meshes from boxShape segments
  wallMeshes.updateFromShape(boxShape, layerManager.activeLayer);

  // Update floor annotations
  const layer = layerManager.activeLayer;
  if (layer) {
    floorAnnotations.update(layer.halfSide, layer.wallHeight, layer.ledHeight);
  }
}

function handleGeometryChange(param, value) {
  // Update active layer's geometry
  const layer = layerManager.activeLayer;
  if (!layer) return;

  layer[param] = value;
  layer._solver = null; // reset cached solver

  // Update LED light position if ledHeight changed
  if (param === 'ledHeight') {
    lighting.setLedHeight(value);
  }

  // Re-solve with direct solver if we have an image
  if (sourceImage) {
    processImage(); // async — will rebuild everything
    return;
  }

  // No image: just rebuild wall meshes with new dimensions
  wallMeshes.removeLayer(layer.id);
  wallMeshes.removeLayer('default');
  if (boxShape && boxShape.type !== 'square') {
    wallMeshes.updateFromSegments(boxShape, layer);
  } else {
    wallMeshes.updateFromProfiles(layer.wallProfiles, layer.id, layer.halfSide, layer.wallHeight);
  }
  updateSceneFromLayers();

  // Update info overlay
  const overlay = document.getElementById('info-overlay');
  if (overlay) {
    const mag = layer.ledHeight > layer.wallHeight
      ? (layer.ledHeight / (layer.ledHeight - layer.wallHeight)).toFixed(1)
      : '∞';
    overlay.textContent = `LED: ${layer.ledHeight}mm · Box: ${layer.halfSide * 2}×${layer.halfSide * 2}mm · Wall: ${layer.wallHeight}mm · MAG: ${mag}×`;
  }

  // Update floor annotations with new geometry
  floorAnnotations.update(layer.halfSide, layer.wallHeight, layer.ledHeight);
}

function updateSceneFromLayers() {
  const isCustomShape = boxShape && boxShape.type !== 'square';

  // Remove default layer — real layers replace it
  wallMeshes.removeLayer('default');

  // Remove meshes for deleted layers
  for (const [id] of wallMeshes.layerGroups) {
    if (!layerManager.layers.find(l => l.id === id)) {
      wallMeshes.removeLayer(id);
    }
  }

  // Update wall meshes for each layer
  for (const layer of layerManager.layers) {
    if (isCustomShape) {
      // Custom shape: N-segment walls with native N profiles
      wallMeshes.updateFromSegments(boxShape, layer);
    } else {
      // Standard square: original 4-wall system
      wallMeshes.updateFromProfiles(
        layer.wallProfiles, layer.id, layer.halfSide, layer.wallHeight
      );
    }
    wallMeshes.setLayerVisible(layer.id, layer.visible);
  }

  // Shadow overlay (active layer) — use texture-based for both modes
  const active = layerManager.activeLayer;
  if (active?.wallProfiles && appState.get('shadowOverlay') && !currentBitmapData) {
    shadowOverlay.updateFromProfiles(active.wallProfiles, active.halfSide, active.ledHeight);
  } else if (!currentBitmapData) {
    shadowOverlay.setVisible(false);
    shadowOverlay.setDetailVisible(false);
  }

  // Target contour
  const contour = appState.get('contour');
  if (contour && appState.get('shadowOverlay') && active) {
    targetContour.update(contour, active.halfSide, active.mag);
  } else {
    targetContour.setVisible(false);
  }

  // Rays
  if (appState.get('showRays') && active?.wallProfiles) {
    rayVisualizer.update(active.wallProfiles, active.halfSide, active.ledHeight);
  }

  // Profile panels
  ui.drawProfilePanels(layerManager, boxShape);

  // Compare canvas
  if (contour) {
    ui.drawCompareCanvas(contour, () => {
      return shadowOverlay.computeShadowPolygon(
        active?.wallProfiles, active?.halfSide, active?.ledHeight
      );
    });
  }

  // Floor annotations — update with active layer geometry
  if (active) {
    floorAnnotations.update(active.halfSide, active.wallHeight, active.ledHeight);
  }
}

// ─── SVG Preview ───
let _svgPreviewTimer = null;
function updateSvgPreview() {
  // Debounce + defer to avoid blocking main thread
  clearTimeout(_svgPreviewTimer);
  _svgPreviewTimer = setTimeout(() => {
    try {
      let svg;
      if (currentBitmapData) {
        svg = svgExporter.exportBitmaps(
          currentBitmapData.bitmaps, currentBitmapData.gridW, currentBitmapData.gridH,
          currentBitmapData.maxWallH, layerManager.layers[0] ? layerManager.layers[0].halfSide * 2 : 120
        );
      } else {
        svg = svgExporter.exportMultiLayer(layerManager.layers);
      }
      ui.showSvgPreview(svg);
    } catch (e) {
      console.warn('SVG preview error:', e);
    }
  }, 300);
}

// ─── Export ───
function doExport() {
  svgExporter.download(layerManager.layers, currentBitmapData);
}

function doExportDXF() {
  dxfExporter.download(layerManager.layers, currentBitmapData);
}

async function doScreenshot() {
  await screenshotExporter.download();
}

// ─── Keyboard shortcuts ───
const shortcuts = new KeyboardShortcuts({
  undo: () => {
    const prev = undoRedo.undo();
    if (prev && layerManager.activeLayer) {
      layerManager.activeLayer.wallProfiles = prev;
      updateSceneFromLayers();
    }
  },
  redo: () => {
    const next = undoRedo.redo();
    if (next && layerManager.activeLayer) {
      layerManager.activeLayer.wallProfiles = next;
      updateSceneFromLayers();
    }
  },
  export: doExport,
  toggleRays: () => {
    const v = !appState.get('showRays');
    appState.set('showRays', v);
    document.getElementById('ctrl-rays').checked = v;
  },
  toggleWireframe: () => {
    const v = !appState.get('wireframe');
    appState.set('wireframe', v);
    document.getElementById('ctrl-wireframe').checked = v;
  },
  resetCamera: () => sceneManager.resetCamera(),
  switchTab: (i) => {
    const tabs = ['view', 'profile-editor', 'layers', 'export'];
    if (tabs[i]) ui.switchTab(tabs[i]);
  },
});

// ─── Initial draw ───
setTimeout(() => {
  ui.drawProfilePanels(layerManager, boxShape);
  sceneManager.resize();
}, 100);
