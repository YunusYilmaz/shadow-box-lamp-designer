import { H_L, A } from '../constants.js';

/**
 * Inverse project: floor shadow point → wall hit
 * @param {number} gx - shadow x coordinate (mm)
 * @param {number} gy - shadow y coordinate (mm)
 * @param {number} hL - LED height
 * @param {number} a  - box half-side
 * @returns {{ wall: number, s: number, wz: number, t: number } | null}
 *   wall: 0=front(y=+a), 1=right(x=+a), 2=back(y=-a), 3=left(x=-a)
 *   s: parameter along wall [0,1]
 *   wz: height on wall
 *   t: ray parameter (smaller = closer to LED)
 */
export function inverseProject(gx, gy, hL = H_L, a = A) {
  const candidates = [];

  // Wall 0: front, y = +a
  if (gy !== 0) {
    const t = a / gy;
    if (t > 0) {
      const wx = gx * t;
      const wz = hL * (1 - t);
      const s = (wx + a) / (2 * a);
      if (wx >= -a && wx <= a && wz >= 0 && wz < hL && s >= 0 && s <= 1) {
        candidates.push({ wall: 0, s, wz, t });
      }
    }
  }

  // Wall 1: right, x = +a
  if (gx !== 0) {
    const t = a / gx;
    if (t > 0) {
      const wy = gy * t;
      const wz = hL * (1 - t);
      const s = (a - wy) / (2 * a);
      if (wy >= -a && wy <= a && wz >= 0 && wz < hL && s >= 0 && s <= 1) {
        candidates.push({ wall: 1, s, wz, t });
      }
    }
  }

  // Wall 2: back, y = -a
  if (gy !== 0) {
    const t = -a / gy;
    if (t > 0) {
      const wx = gx * t;
      const wz = hL * (1 - t);
      const s = (a - wx) / (2 * a);
      if (wx >= -a && wx <= a && wz >= 0 && wz < hL && s >= 0 && s <= 1) {
        candidates.push({ wall: 2, s, wz, t });
      }
    }
  }

  // Wall 3: left, x = -a
  if (gx !== 0) {
    const t = -a / gx;
    if (t > 0) {
      const wy = gy * t;
      const wz = hL * (1 - t);
      const s = (wy + a) / (2 * a);
      if (wy >= -a && wy <= a && wz >= 0 && wz < hL && s >= 0 && s <= 1) {
        candidates.push({ wall: 3, s, wz, t });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.t - b.t);
  return candidates[0];
}
