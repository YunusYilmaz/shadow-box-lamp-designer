import { Layer } from './Layer.js';
import { MAX_LAYERS } from '../constants.js';

export class LayerManager extends EventTarget {
  constructor() {
    super();
    this.layers = [];
    this.activeLayerIndex = 0;
    // Start with one default layer
    this.addLayer();
  }

  get activeLayer() {
    return this.layers[this.activeLayerIndex] || null;
  }

  addLayer(options = {}) {
    if (this.layers.length >= MAX_LAYERS) return null;
    const layer = new Layer(this.layers.length, options);
    this.layers.push(layer);
    this._emit('layer-added', { layer });
    return layer;
  }

  removeLayer(index) {
    if (this.layers.length <= 1) return; // keep at least one
    const [removed] = this.layers.splice(index, 1);
    // Re-index
    this.layers.forEach((l, i) => l.index = i);
    if (this.activeLayerIndex >= this.layers.length) {
      this.activeLayerIndex = this.layers.length - 1;
    }
    this._emit('layer-removed', { layer: removed, index });
    return removed;
  }

  setActiveLayer(index) {
    if (index >= 0 && index < this.layers.length) {
      this.activeLayerIndex = index;
      this._emit('active-layer-changed', { index });
    }
  }

  solveAllLayers(contour, smoothWindow = 8) {
    if (!contour) return;
    for (const layer of this.layers) {
      layer.solveProfiles(contour, smoothWindow);
    }
    this._emit('profiles-updated', { layers: this.layers });
  }

  getVisibleLayers() {
    return this.layers.filter(l => l.visible);
  }

  updateLayerParam(index, param, value) {
    const layer = this.layers[index];
    if (!layer) return;
    layer[param] = value;
    layer._solver = null; // reset solver cache
    this._emit('layer-param-changed', { layer, param, value });
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
