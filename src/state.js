import {
  DEFAULT_THRESHOLD, DEFAULT_SIGMA, DEFAULT_CONTOUR_RESOLUTION,
  DEFAULT_PROFILE_SMOOTH, DEFAULT_PROFILE_POINTS,
} from './constants.js';

class AppState extends EventTarget {
  constructor() {
    super();
    this._data = {
      // Contour settings
      threshold: DEFAULT_THRESHOLD,
      sigma: DEFAULT_SIGMA,
      resolution: DEFAULT_CONTOUR_RESOLUTION,

      // Profile settings
      profileSmooth: DEFAULT_PROFILE_SMOOTH,
      profilePoints: DEFAULT_PROFILE_POINTS,

      // Display
      showRays: false,
      wireframe: false,
      shadowOverlay: true,
      floorDist: 200,
      activeTab: 'view',
      detailMode: false, // false=profile (outline only), true=bitmap (internal detail)

      // Data
      sourceImage: null,
      contour: null,          // Float64Array per-angle r_norm
      activeLayerIndex: 0,

      // Flags
      computing: false,
    };
  }

  get(key) {
    return this._data[key];
  }

  set(key, value) {
    const old = this._data[key];
    if (old === value) return;
    this._data[key] = value;
    this.dispatchEvent(new CustomEvent('change', {
      detail: { key, value, oldValue: old },
    }));
  }

  batch(updates) {
    const changes = [];
    for (const [key, value] of Object.entries(updates)) {
      const old = this._data[key];
      if (old !== value) {
        this._data[key] = value;
        changes.push({ key, value, oldValue: old });
      }
    }
    if (changes.length > 0) {
      this.dispatchEvent(new CustomEvent('batch', { detail: { changes } }));
      for (const c of changes) {
        this.dispatchEvent(new CustomEvent('change', { detail: c }));
      }
    }
  }

  getAll() {
    return { ...this._data };
  }
}

export const appState = new AppState();
