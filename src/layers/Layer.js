import { ProfileSolver } from '../solver/ProfileSolver.js';
import { DEFAULT_PROFILE_POINTS, H_L, A, H_W, DEFAULT_LAYER_CONFIGS } from '../constants.js';

let layerIdCounter = 0;

export class Layer {
  constructor(index = 0, options = {}) {
    const defaults = DEFAULT_LAYER_CONFIGS[index] || DEFAULT_LAYER_CONFIGS[0];
    this.id = `layer-${layerIdCounter++}`;
    this.name = options.name || `Layer ${index + 1}`;
    this.index = index;
    this.halfSide = options.halfSide ?? defaults.halfSide;
    this.ledHeight = options.ledHeight ?? defaults.ledHeight;
    this.wallHeight = options.wallHeight ?? defaults.wallHeight;
    this.profilePoints = options.profilePoints || DEFAULT_PROFILE_POINTS;
    this.visible = true;
    this.opacity = 1.0;
    this.wallProfiles = null; // Float64Array[4]
    this._solver = null;
  }

  get mag() {
    return this.ledHeight / (this.ledHeight - this.wallHeight);
  }

  get boxSize() {
    return this.halfSide * 2;
  }

  _getSolver() {
    if (!this._solver || this._solver.a !== this.halfSide) {
      this._solver = new ProfileSolver({
        profilePoints: this.profilePoints,
        hL: this.ledHeight,
        a: this.halfSide,
        hW: this.wallHeight,
      });
    }
    return this._solver;
  }

  solveProfiles(contour, smoothWindow = 8) {
    const solver = this._getSolver();
    this.wallProfiles = solver.solve(contour, smoothWindow);
    return this.wallProfiles;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      index: this.index,
      halfSide: this.halfSide,
      ledHeight: this.ledHeight,
      wallHeight: this.wallHeight,
      visible: this.visible,
      opacity: this.opacity,
    };
  }
}
