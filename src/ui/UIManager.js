import { WALL_COLORS, WALL_NAMES, H_W } from '../constants.js';

export class UIManager {
  constructor(appState, sceneManager, layerManager, callbacks) {
    this.state = appState;
    this.scene = sceneManager;
    this.layers = layerManager;
    this.callbacks = callbacks; // { onImageLoad, onRecompute, onExport, onScreenshot }
    this.profileCanvases = [];
    this._build();
    this._bindEvents();
  }

  _build() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    // ─── Header ───
    const header = this._el('header', 'header');
    header.innerHTML = `
      <div class="header-logo">
        <h1>Shadow Box Designer</h1>
        <span class="subtitle">Multi-Layer Lamp Profile Engine</span>
      </div>
      <div class="tab-bar">
        <button class="tab-btn active" data-tab="view">3D View</button>
        <button class="tab-btn" data-tab="profile-editor">Profile Editor</button>
        <button class="tab-btn" data-tab="layers">Layers</button>
        <button class="tab-btn" data-tab="export">Export</button>
      </div>
      <div class="status">
        <div class="dot" id="status-dot"></div>
        <span id="status-text">Ready</span>
      </div>
      <div class="header-actions">
        <button class="btn btn-sm btn-ghost" id="btn-screenshot" title="Screenshot (high-res)">Capture</button>
        <button class="btn btn-sm" id="btn-export" disabled>Export SVG</button>
        <button class="btn btn-sm btn-ghost" id="btn-export-dxf" disabled title="Export DXF for laser/CNC">Export DXF</button>
      </div>
    `;
    app.appendChild(header);

    // ─── Viewport ───
    this.viewport = this._el('div', 'viewport');
    this.viewport.innerHTML = `
      <div class="viewport-overlay" id="info-overlay">
        LED: 70mm &middot; Box: 120&times;120mm &middot; Wall: 50mm &middot; MAG: 3.5&times;
      </div>
      <div class="compare-panel" id="compare-panel">
        <canvas id="compare-canvas" width="180" height="180"></canvas>
        <p>Target vs Result</p>
      </div>
    `;
    app.appendChild(this.viewport);

    // Profile editor overlay (inside viewport, hidden by default)
    this.profileEditorEl = this._el('div', 'profile-editor');
    this.profileEditorEl.id = 'profile-editor-tab';
    this.profileEditorEl.innerHTML = `
      <div class="profile-editor-toolbar">
        <span style="font-size:12px;color:var(--text-dim);">Click and drag control points to edit wall profiles</span>
        <div style="flex:1"></div>
        <button class="btn btn-sm btn-ghost" id="btn-undo" disabled>Undo</button>
        <button class="btn btn-sm btn-ghost" id="btn-redo" disabled>Redo</button>
      </div>
      <canvas id="profile-editor-canvas"></canvas>
    `;
    this.viewport.appendChild(this.profileEditorEl);

    // ─── Sidebar ───
    const sidebar = this._el('div', 'sidebar');

    sidebar.innerHTML = `
      <!-- RENDER MODE — at top -->
      <div class="panel" style="border:1px solid var(--accent);background:rgba(255,64,112,0.05);">
        <div class="panel-title" style="color:var(--accent);">Render Mode</div>
        <div class="toggle-row" style="padding:6px 0;">
          <label style="font-weight:600;color:var(--accent);">Detail Mode</label>
          <input type="checkbox" id="ctrl-detail-mode">
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">
          ON: Wall holes/cutouts for internal detail<br>
          OFF: Outline profile only (silhouette edge)
        </div>
      </div>

      <!-- IMAGE INPUT with test images -->
      <div class="panel">
        <div class="panel-title">Image Input</div>
        <div class="drop-zone" id="drop-zone">
          <div class="icon">+</div>
          <p>Drop image or click</p>
          <input type="file" id="file-input" accept="image/*" style="display:none">
        </div>
        <div style="margin-top:8px;">
          <div style="font-size:10px;color:var(--text-dim);margin-bottom:4px;">Test Images:</div>
          <div class="test-images" id="test-images" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
        </div>
      </div>

      <!-- CONTOUR -->
      <div class="panel">
        <div class="panel-title">Contour</div>
        <div class="ctrl-row">
          <label>Threshold</label>
          <input type="range" id="ctrl-threshold" min="20" max="220" value="100">
          <span class="val" id="val-threshold">100</span>
        </div>
        <div class="ctrl-row">
          <label>Smooth &sigma;</label>
          <input type="range" id="ctrl-sigma" min="0" max="15" value="3">
          <span class="val" id="val-sigma">3</span>
        </div>
        <div class="ctrl-row">
          <label>Resolution</label>
          <input type="range" id="ctrl-resolution" min="180" max="1440" step="36" value="720">
          <span class="val" id="val-resolution">720</span>
        </div>
      </div>

      <!-- BOX GEOMETRY -->
      <div class="panel">
        <div class="panel-title">Box Geometry</div>
        <div class="ctrl-row">
          <label>Shape</label>
          <select id="ctrl-shape" style="flex:1;background:var(--panel-bg);color:var(--text);border:1px solid #444;border-radius:4px;padding:3px 6px;font-size:11px;">
            <option value="square" selected>◻ Square (4 walls)</option>
            <option value="rectangle">▭ Rectangle (4 walls)</option>
            <option value="cylinder">◯ Cylinder (16 walls)</option>
            <option value="heart">♥ Heart (24 walls)</option>
            <option value="star">★ Star (10 walls)</option>
          </select>
        </div>
        <div class="ctrl-row">
          <label>LED height</label>
          <input type="range" id="ctrl-led-height" min="30" max="150" value="70">
          <span class="val" id="val-led-height">70</span>
        </div>
        <div class="ctrl-row">
          <label>Wall height</label>
          <input type="range" id="ctrl-wall-height" min="10" max="120" value="50">
          <span class="val" id="val-wall-height">50</span>
        </div>
        <div class="ctrl-row">
          <label>Box width</label>
          <input type="range" id="ctrl-box-width" min="40" max="300" value="120">
          <span class="val" id="val-box-width">120</span>
        </div>
        <div style="margin-top:6px;font-size:10px;color:var(--text-muted);" id="mag-label">MAG: 3.5×</div>
      </div>

      <!-- PROFILE -->
      <div class="panel">
        <div class="panel-title">Profile</div>
        <div class="ctrl-row">
          <label>Smoothing</label>
          <input type="range" id="ctrl-profile-smooth" min="0" max="30" value="8">
          <span class="val" id="val-profile-smooth">8</span>
        </div>
      </div>

      <!-- DISPLAY -->
      <div class="panel">
        <div class="panel-title">Display</div>
        <div class="toggle-row">
          <label>Show rays</label>
          <input type="checkbox" id="ctrl-rays">
        </div>
        <div class="toggle-row">
          <label>Wireframe</label>
          <input type="checkbox" id="ctrl-wireframe">
        </div>
        <div class="toggle-row">
          <label>Shadow overlay</label>
          <input type="checkbox" id="ctrl-shadow-overlay" checked>
        </div>
      </div>

      <!-- SVG PREVIEW (small inline) -->
      <div class="panel" id="svg-preview-panel" style="display:none;">
        <div class="panel-title" style="display:flex;align-items:center;justify-content:space-between;">
          <span>SVG Preview</span>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-sm btn-ghost" id="btn-svg-preview-fullscreen" title="Fullscreen preview">⛶</button>
            <button class="btn btn-sm btn-ghost" id="btn-svg-preview-refresh" title="Refresh preview">↻</button>
          </div>
        </div>
        <div id="svg-preview-container" style="background:#fff;border-radius:4px;overflow:auto;max-height:180px;padding:4px;cursor:pointer;" title="Click for fullscreen"></div>
      </div>

      <!-- SVG FULLSCREEN MODAL -->
      <div id="svg-modal-overlay" style="
        display:none; position:fixed; inset:0; z-index:9999;
        background:rgba(0,0,0,0.85); backdrop-filter:blur(8px);
        flex-direction:column; align-items:center; justify-content:center;
      ">
        <div style="
          position:absolute; top:12px; right:16px; display:flex; gap:8px; z-index:10001;
        ">
          <button id="btn-svg-modal-zoom-in" style="
            background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.2);
            color:#fff; width:36px; height:36px; border-radius:8px; font-size:18px; cursor:pointer;
          ">+</button>
          <button id="btn-svg-modal-zoom-out" style="
            background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.2);
            color:#fff; width:36px; height:36px; border-radius:8px; font-size:18px; cursor:pointer;
          ">−</button>
          <button id="btn-svg-modal-fit" style="
            background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.2);
            color:#fff; height:36px; padding:0 12px; border-radius:8px; font-size:13px; cursor:pointer;
          ">Fit</button>
          <button id="btn-svg-modal-refresh" style="
            background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.2);
            color:#fff; width:36px; height:36px; border-radius:8px; font-size:16px; cursor:pointer;
          ">↻</button>
          <button id="btn-svg-modal-close" style="
            background:var(--accent, #ff4060); border:none;
            color:#fff; width:36px; height:36px; border-radius:8px; font-size:20px; cursor:pointer;
          ">✕</button>
        </div>
        <div style="
          position:absolute; top:14px; left:16px; color:rgba(255,255,255,0.5);
          font-size:12px; font-family:monospace; z-index:10001;
        " id="svg-modal-info"></div>
        <div id="svg-modal-viewport" style="
          width:100%; height:100%; overflow:auto; display:flex;
          align-items:center; justify-content:center; padding:40px;
        ">
          <div id="svg-modal-content" style="
            background:#ffffff; border-radius:8px; box-shadow:0 4px 40px rgba(0,0,0,0.5);
            padding:16px; transform-origin:center center; transition:transform 0.15s ease;
          "></div>
        </div>
      </div>

      <!-- LAYERS -->
      <div class="panel" id="layer-panel">
        <div class="panel-title" style="display:flex;align-items:center;justify-content:space-between;">
          <span>Layers</span>
          <button class="btn btn-sm btn-ghost" id="btn-add-layer">+ Add</button>
        </div>
        <div id="layer-list"></div>
      </div>

      <div class="panel" style="margin-top:auto">
        <div class="panel-title">Wall Colors</div>
        <div class="wall-legend">
          <span><div class="dot" style="background:var(--wall-front)"></div>Front</span>
          <span><div class="dot" style="background:var(--wall-right)"></div>Right</span>
          <span><div class="dot" style="background:var(--wall-back)"></div>Back</span>
          <span><div class="dot" style="background:var(--wall-left)"></div>Left</span>
        </div>
        <div style="margin-top:8px;font-size:10px;color:var(--text-muted);">
          R=rays W=wire Space=reset 1-4=tabs Ctrl+Z=undo Ctrl+E=export
        </div>
      </div>
    `;
    app.appendChild(sidebar);

    // ─── Bottom bar (dynamic wall panels) ───
    const bottomBar = this._el('div', 'bottom-bar');
    bottomBar.id = 'wall-panels-bar';
    app.appendChild(bottomBar);

    // Build initial 4-wall panels
    this._rebuildWallPanels(4, WALL_NAMES.map(n => `${n} Wall`), WALL_COLORS);

    this.updateLayerList();
    this._buildTestImages();
  }

  _el(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  _bindEvents() {
    // Drop zone
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) this.callbacks.onImageLoad(e.target.files[0]);
    });

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('active'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('active'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('active');
      if (e.dataTransfer.files[0]) this.callbacks.onImageLoad(e.dataTransfer.files[0]);
    });

    // Range controls
    this._bindRange('ctrl-threshold', 'threshold');
    this._bindRange('ctrl-sigma', 'sigma');
    this._bindRange('ctrl-resolution', 'resolution');
    this._bindRange('ctrl-profile-smooth', 'profileSmooth');

    // Box geometry controls
    this._bindGeometrySlider('ctrl-led-height', 'ledHeight');
    this._bindGeometrySlider('ctrl-wall-height', 'wallHeight');
    this._bindGeometrySlider('ctrl-box-width', 'boxWidth');

    // Detail mode toggle
    document.getElementById('ctrl-detail-mode').addEventListener('change', (e) => {
      this.state.set('detailMode', e.target.checked);
      this.callbacks.onRecompute?.();
    });

    // Toggles
    document.getElementById('ctrl-rays').addEventListener('change', (e) => {
      this.state.set('showRays', e.target.checked);
    });
    document.getElementById('ctrl-wireframe').addEventListener('change', (e) => {
      this.state.set('wireframe', e.target.checked);
    });
    document.getElementById('ctrl-shadow-overlay').addEventListener('change', (e) => {
      this.state.set('shadowOverlay', e.target.checked);
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Shape selector
    document.getElementById('ctrl-shape')?.addEventListener('change', (e) => {
      this.callbacks.onShapeChange?.(e.target.value);
    });

    // Export
    document.getElementById('btn-export').addEventListener('click', () => this.callbacks.onExport?.());
    document.getElementById('btn-export-dxf').addEventListener('click', () => this.callbacks.onExportDXF?.());
    document.getElementById('btn-screenshot').addEventListener('click', () => this.callbacks.onScreenshot?.());

    // SVG preview refresh
    document.getElementById('btn-svg-preview-refresh')?.addEventListener('click', () => {
      this.callbacks.onSvgPreview?.();
    });

    // Move SVG modal to body so position:fixed works (escapes transform contexts)
    const svgModal = document.getElementById('svg-modal-overlay');
    if (svgModal) document.body.appendChild(svgModal);

    // SVG preview fullscreen button
    document.getElementById('btn-svg-preview-fullscreen')?.addEventListener('click', () => {
      this._openSvgModal();
    });
    // Click on small preview to open fullscreen
    document.getElementById('svg-preview-container')?.addEventListener('click', () => {
      this._openSvgModal();
    });

    // SVG modal controls
    this._svgModalZoom = 1;
    document.getElementById('btn-svg-modal-close')?.addEventListener('click', () => this._closeSvgModal());
    document.getElementById('btn-svg-modal-zoom-in')?.addEventListener('click', () => this._zoomSvgModal(1.25));
    document.getElementById('btn-svg-modal-zoom-out')?.addEventListener('click', () => this._zoomSvgModal(0.8));
    document.getElementById('btn-svg-modal-fit')?.addEventListener('click', () => this._zoomSvgModal(0, true));
    document.getElementById('btn-svg-modal-refresh')?.addEventListener('click', () => {
      this.callbacks.onSvgPreview?.();
      setTimeout(() => this._openSvgModal(), 400);
    });
    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._closeSvgModal();
    });
    // Click backdrop to close
    document.getElementById('svg-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'svg-modal-viewport' || e.target.id === 'svg-modal-overlay') {
        this._closeSvgModal();
      }
    });

    // Layers
    document.getElementById('btn-add-layer').addEventListener('click', () => {
      this.layers.addLayer();
      this.updateLayerList();
      this.callbacks.onRecompute?.();
    });
  }

  _bindRange(id, stateKey) {
    const el = document.getElementById(id);
    const valEl = document.getElementById(id.replace('ctrl-', 'val-'));
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      this.state.set(stateKey, v);
      if (valEl) valEl.textContent = v;
    });
    // Recompute on change (not every input tick)
    el.addEventListener('change', () => {
      this.callbacks.onRecompute?.();
    });
  }

  _bindGeometrySlider(id, param) {
    const el = document.getElementById(id);
    const valEl = document.getElementById(id.replace('ctrl-', 'val-'));
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      if (valEl) valEl.textContent = v;
    });
    el.addEventListener('change', () => {
      const v = parseFloat(el.value);
      if (param === 'boxWidth') {
        // boxWidth = full width, halfSide = width/2
        this.callbacks.onGeometryChange?.('halfSide', v / 2);
      } else {
        this.callbacks.onGeometryChange?.(param, v);
      }
      this._updateMagLabel();
    });
    // Also update on input for live feedback of MAG label
    el.addEventListener('input', () => this._updateMagLabel());
  }

  _updateMagLabel() {
    const label = document.getElementById('mag-label');
    if (!label) return;
    const hL = parseFloat(document.getElementById('ctrl-led-height').value);
    const hW = parseFloat(document.getElementById('ctrl-wall-height').value);
    if (hL <= hW) {
      label.textContent = 'MAG: ∞ (LED must be above wall!)';
      label.style.color = 'var(--accent)';
    } else {
      const mag = (hL / (hL - hW)).toFixed(2);
      label.textContent = `MAG: ${mag}×`;
      label.style.color = 'var(--text-muted)';
    }
  }

  _syncGeometrySliders() {
    const layer = this.layers.activeLayer;
    if (!layer) return;

    const setSlider = (id, val) => {
      const el = document.getElementById(id);
      const valEl = document.getElementById(id.replace('ctrl-', 'val-'));
      if (el) el.value = val;
      if (valEl) valEl.textContent = val;
    };

    setSlider('ctrl-led-height', layer.ledHeight);
    setSlider('ctrl-wall-height', layer.wallHeight);
    setSlider('ctrl-box-width', layer.halfSide * 2);
    this._updateMagLabel();
  }

  switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    this.state.set('activeTab', tabId);

    // Show/hide profile editor
    this.profileEditorEl.classList.toggle('active', tabId === 'profile-editor');

    // Show/hide 3D viewport canvas
    const threeCanvas = this.viewport.querySelector('canvas:not(#profile-editor-canvas):not(#compare-canvas)');
    if (threeCanvas) {
      threeCanvas.style.display = tabId === 'profile-editor' ? 'none' : 'block';
    }

    // When switching to export tab, auto-generate SVG preview
    if (tabId === 'export') {
      this.callbacks.onSvgPreview?.();
    }
  }

  updateLayerList() {
    const list = document.getElementById('layer-list');
    if (!list) return;
    list.innerHTML = '';

    this.layers.layers.forEach((layer, i) => {
      const item = this._el('div', `layer-item${i === this.layers.activeLayerIndex ? ' active' : ''}`);
      item.innerHTML = `
        <div class="layer-color" style="background:${i === 0 ? '#4a9eff' : i === 1 ? '#ff6b9d' : i === 2 ? '#4aff9e' : '#ffd94a'}"></div>
        <span class="layer-name">${layer.name}</span>
        <span class="layer-info">${layer.halfSide * 2}mm</span>
        <input type="checkbox" ${layer.visible ? 'checked' : ''} title="Visible" style="accent-color:var(--accent)">
        ${this.layers.layers.length > 1 ? '<button class="btn btn-sm btn-ghost" style="padding:2px 6px;font-size:10px;">X</button>' : ''}
      `;

      // Click to select
      item.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        this.layers.setActiveLayer(i);
        this.updateLayerList();
        this._syncGeometrySliders();
      });

      // Visibility toggle
      const checkbox = item.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', () => {
        layer.visible = checkbox.checked;
        this.callbacks.onRecompute?.();
      });

      // Remove button
      const removeBtn = item.querySelector('button');
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.layers.removeLayer(i);
          this.updateLayerList();
          this.callbacks.onRecompute?.();
        });
      }

      list.appendChild(item);
    });
  }

  setStatus(text, computing = false) {
    const dot = document.getElementById('status-dot');
    const textEl = document.getElementById('status-text');
    if (dot) dot.classList.toggle('computing', computing);
    if (textEl) textEl.textContent = text;
  }

  enableExport(enabled) {
    const btn = document.getElementById('btn-export');
    if (btn) btn.disabled = !enabled;
    const btnDxf = document.getElementById('btn-export-dxf');
    if (btnDxf) btnDxf.disabled = !enabled;
  }

  showImagePreview(img, contour) {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) return;

    const canvas = dropZone.querySelector('canvas') || document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const scale = Math.max(size / img.width, size / img.height);
    const sw = img.width * scale;
    const sh = img.height * scale;
    ctx.drawImage(img, (size - sw) / 2, (size - sh) / 2, sw, sh);

    if (contour) {
      const N = contour.length;
      const cx = size / 2, cy = size / 2;
      const maxR = size / 2 * 0.95;

      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const idx = i % N;
        const theta = (idx / N) * 2 * Math.PI;
        const r = contour[idx] * maxR;
        const x = cx + r * Math.cos(theta);
        const y = cy + r * Math.sin(theta);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    if (!dropZone.querySelector('canvas')) {
      dropZone.innerHTML = '';
      dropZone.appendChild(canvas);
    }
  }

  drawProfilePanels(layers, boxShape) {
    const activeLayer = layers.layers[layers.activeLayerIndex];
    if (!activeLayer) return;
    const profiles = activeLayer.wallProfiles;
    const N = profiles ? profiles.length : 4;

    // Rebuild panels if count changed
    if (this._wallPanelCount !== N && boxShape) {
      this.updateWallPanelsForShape(boxShape);
    }

    for (let w = 0; w < N; w++) {
      const canvas = this.profileCanvases[w];
      if (!canvas) continue;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) continue;
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const cw = rect.width, ch = rect.height;

      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(0, 0, cw, ch);

      const pad = { l: 32, r: 8, t: 8, b: 18 };
      const gw = cw - pad.l - pad.r;
      const gh = ch - pad.t - pad.b;
      const yMin = 0, yMax = 75;
      const toX = s => pad.l + s * gw;
      const toY = h => pad.t + gh - ((h - yMin) / (yMax - yMin)) * gh;

      // Grid
      ctx.strokeStyle = '#1a2a4a';
      ctx.lineWidth = 0.5;
      for (let h = 0; h <= 75; h += 25) {
        ctx.beginPath();
        ctx.moveTo(pad.l, toY(h));
        ctx.lineTo(pad.l + gw, toY(h));
        ctx.stroke();
      }

      // H_W dashed line
      ctx.strokeStyle = '#2a3a5a';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.l, toY(H_W));
      ctx.lineTo(pad.l + gw, toY(H_W));
      ctx.stroke();
      ctx.setLineDash([]);

      // Y labels
      ctx.fillStyle = '#555';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      for (let h = 0; h <= 75; h += 25) ctx.fillText(h, pad.l - 4, toY(h) + 3);

      // X labels
      ctx.textAlign = 'center';
      ctx.fillText('0', toX(0), ch - 4);
      ctx.fillText('120', toX(1), ch - 4);

      const wallColor = N <= 4 ? WALL_COLORS[w] : `hsl(${(w / N) * 360}, 60%, 55%)`;

      if (profiles && profiles[w]) {
        const profile = profiles[w];
        const pLen = profile.length;

        // Fill
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = wallColor;
        ctx.beginPath();
        ctx.moveTo(toX(0), toY(0));
        for (let i = 0; i < pLen; i++) ctx.lineTo(toX(i / (pLen - 1)), toY(profile[i]));
        ctx.lineTo(toX(1), toY(0));
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;

        // Line
        ctx.strokeStyle = wallColor;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const x = toX(i / (N - 1)), y = toY(profile[i]);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Stats
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < N; i++) { min = Math.min(min, profile[i]); max = Math.max(max, profile[i]); }
        ctx.fillStyle = wallColor;
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`max:${max.toFixed(1)}`, pad.l + 4, pad.t + 10);
        ctx.fillText(`min:${min.toFixed(1)}`, pad.l + 4, pad.t + 22);
      } else {
        ctx.strokeStyle = wallColor;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(toX(0), toY(H_W));
        ctx.lineTo(toX(1), toY(H_W));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  /**
   * Rebuild bottom wall panels for N walls (dynamic).
   */
  _rebuildWallPanels(count, names, colors) {
    const bar = document.getElementById('wall-panels-bar');
    if (!bar) return;
    bar.innerHTML = '';
    this.profileCanvases = [];
    this._wallPanelCount = count;

    for (let i = 0; i < count; i++) {
      const card = this._el('div', 'profile-card');
      // For many walls, make cards smaller
      if (count > 6) {
        card.style.minWidth = '100px';
        card.style.flex = '0 0 100px';
      }
      const name = names[i] || `W${i + 1}`;
      const color = colors[i] || `hsl(${(i / count) * 360}, 60%, 55%)`;
      card.innerHTML = `
        <h4 style="color:${color};font-size:${count > 8 ? '9px' : '11px'}">${name}</h4>
        <canvas id="profile-canvas-${i}"></canvas>
      `;
      bar.appendChild(card);
      this.profileCanvases.push(card.querySelector('canvas'));
    }
  }

  /**
   * Update panels for a new shape. Call this when shape changes.
   */
  updateWallPanelsForShape(boxShape) {
    if (!boxShape) return;
    const N = boxShape.wallCount;
    const names = boxShape.segments.map(s => s.name);
    const colors = boxShape.segments.map(s => s.color);
    this._rebuildWallPanels(N, names, colors);
  }

  drawBitmapPanels(bitmapData) {
    if (!bitmapData) return;
    const { bitmaps, gridW, gridH, maxWallH, wallCount } = bitmapData;
    const N = wallCount || bitmaps.length;

    // Rebuild panels if count changed
    if (this._wallPanelCount !== N) {
      const names = Array.from({ length: N }, (_, i) => N <= 4 ? `${WALL_NAMES[i]} Wall` : `W${i + 1}`);
      const colors = Array.from({ length: N }, (_, i) => N <= 4 ? WALL_COLORS[i] : `hsl(${(i / N) * 360}, 60%, 55%)`);
      this._rebuildWallPanels(N, names, colors);
    }

    for (let w = 0; w < N; w++) {
      const canvas = this.profileCanvases[w];
      if (!canvas) continue;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) continue;
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const cw = rect.width, ch = rect.height;

      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(0, 0, cw, ch);

      const bitmap = bitmaps[w];
      const pad = { l: 4, r: 4, t: 4, b: 14 };
      const gw = cw - pad.l - pad.r;
      const gh = ch - pad.t - pad.b;
      const cellW = gw / gridW;
      const cellH = gh / gridH;

      // Draw bitmap: solid=colored, hole=dark
      const color = N <= 4 ? WALL_COLORS[w] : `hsl(${(w / N) * 360}, 60%, 55%)`;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.8;

      for (let si = 0; si < gridW; si++) {
        for (let hi = 0; hi < gridH; hi++) {
          if (bitmap[hi * gridW + si] === 1) {
            const x = pad.l + si * cellW;
            const y = pad.t + (gridH - 1 - hi) * cellH; // flip Y
            ctx.fillRect(x, y, Math.ceil(cellW), Math.ceil(cellH));
          }
        }
      }
      ctx.globalAlpha = 1;

      // Labels
      ctx.fillStyle = '#666';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${gridW}×${gridH} bitmap`, cw / 2, ch - 2);
    }
  }

  drawCompareCanvas(contour, shadowPolygonFn) {
    const panel = document.getElementById('compare-panel');
    const canvas = document.getElementById('compare-canvas');
    if (!canvas || !contour) { if (panel) panel.style.display = 'none'; return; }

    panel.style.display = 'block';
    const ctx = canvas.getContext('2d');
    const size = 180;
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2;
    const activeLayer = this.layers.activeLayer;
    const a = activeLayer ? activeLayer.halfSide : 60;
    const mag = activeLayer ? activeLayer.mag : 3.5;
    const scale = size / (a * mag * 2.2);

    // Target contour (red dashed)
    const N = contour.length;
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const idx = i % N;
      const theta = (idx / N) * 2 * Math.PI;
      const r = contour[idx] * a * mag * scale;
      const x = cx + r * Math.cos(theta);
      const y = cy - r * Math.sin(theta);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Shadow polygon (white)
    if (shadowPolygonFn) {
      const points = shadowPolygonFn();
      if (points && points.length > 2) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i <= points.length; i++) {
          const p = points[i % points.length];
          if (i === 0) ctx.moveTo(cx + p.x * scale, cy - p.y * scale);
          else ctx.lineTo(cx + p.x * scale, cy - p.y * scale);
        }
        ctx.stroke();
      }
    }

    // Box outline
    ctx.strokeStyle = '#2a3a5a';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(cx - a * scale, cy - a * scale, a * 2 * scale, a * 2 * scale);
  }

  // ─── SVG Preview ───
  showSvgPreview(svgString) {
    const panel = document.getElementById('svg-preview-panel');
    const container = document.getElementById('svg-preview-container');
    if (!panel || !container) return;

    this._lastSvgString = svgString;
    panel.style.display = 'block';
    // Inject SVG into container for live preview (small)
    container.innerHTML = svgString
      .replace(/width="[^"]*"/, 'width="100%"')
      .replace(/height="[^"]*"/, '');

    // If modal is open, update it too
    const modalContent = document.getElementById('svg-modal-content');
    const overlay = document.getElementById('svg-modal-overlay');
    if (overlay && overlay.style.display === 'flex') {
      this._renderSvgModal();
    }
  }

  hideSvgPreview() {
    const panel = document.getElementById('svg-preview-panel');
    if (panel) panel.style.display = 'none';
  }

  _openSvgModal() {
    const overlay = document.getElementById('svg-modal-overlay');
    if (!overlay || !this._lastSvgString) return;
    overlay.style.display = 'flex';
    this._svgModalZoom = 1;
    this._renderSvgModal();
  }

  _closeSvgModal() {
    const overlay = document.getElementById('svg-modal-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  _zoomSvgModal(factor, fit = false) {
    if (fit) {
      this._svgModalZoom = 1;
    } else {
      this._svgModalZoom = Math.max(0.25, Math.min(5, this._svgModalZoom * factor));
    }
    const content = document.getElementById('svg-modal-content');
    if (content) {
      content.style.transform = `scale(${this._svgModalZoom})`;
    }
    this._updateSvgModalInfo();
  }

  _renderSvgModal() {
    const content = document.getElementById('svg-modal-content');
    if (!content || !this._lastSvgString) return;

    // Extract viewBox to compute aspect ratio
    const vbMatch = this._lastSvgString.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    const svgW = vbMatch ? parseFloat(vbMatch[1]) : 560;
    const svgH = vbMatch ? parseFloat(vbMatch[2]) : 100;
    const aspect = svgW / svgH;

    // Fit to viewport maintaining aspect ratio
    const vpW = window.innerWidth - 80;
    const vpH = window.innerHeight - 120;
    let displayW, displayH;
    if (vpW / vpH > aspect) {
      displayH = vpH;
      displayW = vpH * aspect;
    } else {
      displayW = vpW;
      displayH = vpW / aspect;
    }

    // Replace width/height with pixel values (viewBox keeps mm coordinate system)
    // Also inject thicker strokes for screen preview (SVG uses mm-scale strokes)
    const pxPerMm = displayW / svgW;
    const screenStroke = Math.max(0.5, 1.5 / pxPerMm); // ~1.5px on screen
    const screenFontSize = Math.max(3, 8 / pxPerMm);

    let svgStr = this._lastSvgString
      .replace(/width="[^"]*"/, `width="${Math.round(displayW)}"`)
      .replace(/height="[^"]*"/, `height="${Math.round(displayH)}"`)
      // Override styles for screen preview
      .replace(
        '</style>',
        `  .cut { stroke-width: ${screenStroke.toFixed(2)} !important; }
  .base { stroke-width: ${(screenStroke * 0.6).toFixed(2)} !important; }
  .outline { stroke-width: ${(screenStroke * 0.4).toFixed(2)} !important; }
  .label, .dim { font-size: ${screenFontSize.toFixed(1)}px !important; }
  .title { font-size: ${(screenFontSize * 1.3).toFixed(1)}px !important; }
</style>`
      );

    content.innerHTML = svgStr;
    content.style.transform = `scale(${this._svgModalZoom})`;
    this._updateSvgModalInfo();
  }

  _updateSvgModalInfo() {
    const info = document.getElementById('svg-modal-info');
    if (info) {
      info.textContent = `SVG Preview · Zoom: ${Math.round(this._svgModalZoom * 100)}% · ESC to close`;
    }
  }

  // ─── Test Images ───
  _buildTestImages() {
    const container = document.getElementById('test-images');
    if (!container) return;

    // Real image files from src/image/
    const fileTests = [
      { name: 'Ninja', src: '/src/image/ninja.webp' },
      { name: 'Lion', src: '/src/image/lion.png' },
    ];

    // Canvas-generated test shapes
    const canvasTests = [
      { name: 'Heart', draw: this._drawHeart },
      { name: 'Star', draw: this._drawStar },
    ];

    // Build file-based test thumbnails
    fileTests.forEach(t => {
      const thumb = document.createElement('div');
      thumb.className = 'test-thumb';
      thumb.title = t.name;
      thumb.style.cssText = 'width:44px;height:44px;border-radius:6px;overflow:hidden;cursor:pointer;border:1px solid #333;transition:border-color 0.2s;';
      const img = document.createElement('img');
      img.src = t.src;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      thumb.appendChild(img);
      thumb.addEventListener('mouseenter', () => { thumb.style.borderColor = 'var(--accent)'; });
      thumb.addEventListener('mouseleave', () => { thumb.style.borderColor = '#333'; });

      thumb.addEventListener('click', () => {
        fetch(t.src)
          .then(r => r.blob())
          .then(blob => {
            const ext = t.src.split('.').pop();
            const file = new File([blob], `${t.name.toLowerCase()}.${ext}`, { type: blob.type });
            this.callbacks.onImageLoad?.(file);
          });
      });

      container.appendChild(thumb);
    });

    // Build canvas-generated test thumbnails
    canvasTests.forEach(t => {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 256, 256);
      t.draw(ctx, 256);

      const thumb = document.createElement('div');
      thumb.className = 'test-thumb';
      thumb.title = t.name;
      thumb.style.cssText = 'width:44px;height:44px;border-radius:6px;overflow:hidden;cursor:pointer;border:1px solid #333;transition:border-color 0.2s;';
      const img = document.createElement('img');
      img.src = canvas.toDataURL();
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      thumb.appendChild(img);
      thumb.addEventListener('mouseenter', () => { thumb.style.borderColor = 'var(--accent)'; });
      thumb.addEventListener('mouseleave', () => { thumb.style.borderColor = '#333'; });

      thumb.addEventListener('click', () => {
        canvas.toBlob(blob => {
          const file = new File([blob], `${t.name.toLowerCase()}.png`, { type: 'image/png' });
          this.callbacks.onImageLoad?.(file);
        });
      });

      container.appendChild(thumb);
    });
  }

  _drawHeart(ctx, s) {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(s*0.5, s*0.85);
    ctx.bezierCurveTo(s*0.04, s*0.55, s*0.04, s*0.22, s*0.5, s*0.38);
    ctx.bezierCurveTo(s*0.96, s*0.22, s*0.96, s*0.55, s*0.5, s*0.85);
    ctx.fill();
  }

  _drawStar(ctx, s) {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    const cx = s*0.5, cy = s*0.5;
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = (i % 2 === 0) ? s*0.38 : s*0.16;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  getViewport() {
    return this.viewport;
  }
}
