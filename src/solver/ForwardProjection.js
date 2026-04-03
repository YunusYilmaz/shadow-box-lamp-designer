import { H_L } from '../constants.js';

/**
 * Forward project: wall top point → floor shadow point
 * @param {number} wx - wall x coordinate (README coords)
 * @param {number} wy - wall y coordinate (README coords)
 * @param {number} wz - wall z (height) coordinate
 * @param {number} hL - LED height (default H_L)
 * @returns {{ gx: number, gy: number } | null}
 */
export function forwardProject(wx, wy, wz, hL = H_L) {
  if (wz >= hL) return null;
  const t = hL / (hL - wz);
  return { gx: wx * t, gy: wy * t };
}
