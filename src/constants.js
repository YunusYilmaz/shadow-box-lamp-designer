// Physics constants — MUST match README exactly
export const H_L = 70;          // LED height mm
export const A = 60;            // box half-side mm (120×120mm box)
export const H_W = 50;          // wall base height mm
export const MAG = H_L / (H_L - H_W); // 3.5×

// Profile constraints
export const PROFILE_OFFSET_MIN = -40;  // mm below H_W
export const PROFILE_OFFSET_MAX = 25;   // mm above H_W
export const MIN_WALL_HEIGHT = 10;      // mm absolute minimum

// Defaults
export const DEFAULT_PROFILE_POINTS = 720;
export const DEFAULT_CONTOUR_RESOLUTION = 720;
export const DEFAULT_THRESHOLD = 100;
export const DEFAULT_SIGMA = 3;
export const DEFAULT_PROFILE_SMOOTH = 8;
export const DEFAULT_CANVAS_SIZE = 512;

// Visual
export const WALL_COLORS = ['#4a9eff', '#ff6b9d', '#4aff9e', '#ffd94a'];
export const WALL_NAMES = ['Front', 'Right', 'Back', 'Left'];
export const WALL_COLORS_RGB = [
  [74, 158, 255],
  [255, 107, 157],
  [74, 255, 158],
  [255, 217, 74],
];

// Multi-layer
export const MAX_LAYERS = 4;
export const DEFAULT_LAYER_CONFIGS = [
  { halfSide: 60, ledHeight: 70, wallHeight: 50 },
  { halfSide: 48, ledHeight: 65, wallHeight: 45 },
  { halfSide: 36, ledHeight: 60, wallHeight: 40 },
  { halfSide: 24, ledHeight: 55, wallHeight: 35 },
];
