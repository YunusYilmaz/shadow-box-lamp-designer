import { forwardProject } from '../solver/ForwardProjection.js';

export class LayerComposer {
  /**
   * Compose shadow polygons from all visible layers
   * @param {Layer[]} layers
   * @returns {Array<{x,y,angle,layerId}>[]} - one polygon per layer
   */
  composeShadows(layers) {
    const results = [];
    for (const layer of layers) {
      if (!layer.visible || !layer.wallProfiles) continue;
      const polygon = this._layerShadow(layer);
      results.push({ layerId: layer.id, polygon, opacity: layer.opacity });
    }
    return results;
  }

  _layerShadow(layer) {
    const points = [];
    const SAMPLES = 150;
    const a = layer.halfSide;
    const hL = layer.ledHeight;
    const N = layer.wallProfiles[0].length;

    for (let w = 0; w < 4; w++) {
      for (let i = 0; i < SAMPLES; i++) {
        const s = i / (SAMPLES - 1);
        const pIdx = Math.min(N - 1, Math.round(s * (N - 1)));
        const wz = layer.wallProfiles[w][pIdx];

        let wx, wy;
        switch (w) {
          case 0: wx = -a + s * 2 * a; wy = a; break;
          case 1: wx = a; wy = a - s * 2 * a; break;
          case 2: wx = a - s * 2 * a; wy = -a; break;
          case 3: wx = -a; wy = -a + s * 2 * a; break;
        }

        const proj = forwardProject(wx, wy, wz, hL);
        if (proj) {
          points.push({ x: proj.gx, y: proj.gy, angle: Math.atan2(proj.gy, proj.gx) });
        }
      }
    }

    points.sort((a, b) => a.angle - b.angle);
    return points;
  }
}
