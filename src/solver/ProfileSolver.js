import { inverseProject } from './InverseProjection.js';
import { CubicSpline } from './CubicSpline.js';
import {
  H_L, A, H_W, MAG,
  DEFAULT_PROFILE_POINTS, MIN_WALL_HEIGHT,
  PROFILE_OFFSET_MIN, PROFILE_OFFSET_MAX,
} from '../constants.js';

export class ProfileSolver {
  constructor(options = {}) {
    this.profilePoints = options.profilePoints || DEFAULT_PROFILE_POINTS;
    this.hL = options.hL || H_L;
    this.a = options.a || A;
    this.hW = options.hW || H_W;
    this.mag = this.hL / (this.hL - this.hW);
  }

  /**
   * Solve contour → 4 wall profiles
   * @param {Float64Array} contour - r_norm per angle
   * @param {number} smoothWindow - moving average window (0=off)
   * @returns {Float64Array[]} - 4 profiles of absolute wall height
   */
  solve(contour, smoothWindow = 8) {
    const N = contour.length;
    const wallData = [[], [], [], []]; // sparse { s, offset } per wall

    // Step 1: Inverse project each contour point
    for (let i = 0; i < N; i++) {
      const theta = (i / N) * 2 * Math.PI;
      const rNorm = contour[i];
      if (rNorm < 0.015) continue; // skip near-center

      const shadowR = rNorm * this.a * this.mag;
      const gx = shadowR * Math.cos(theta);
      const gy = shadowR * Math.sin(theta);

      const result = inverseProject(gx, gy, this.hL, this.a);
      if (!result) continue;

      const offset = result.wz - this.hW;
      const clampedOffset = Math.max(PROFILE_OFFSET_MIN, Math.min(PROFILE_OFFSET_MAX, offset));
      wallData[result.wall].push({ s: result.s, offset: clampedOffset });
    }

    // Step 2: Interpolate each wall with cubic spline
    const profiles = [];
    for (let w = 0; w < 4; w++) {
      const profile = new Float64Array(this.profilePoints);
      const data = wallData[w];

      if (data.length < 3) {
        profile.fill(this.hW);
        profiles.push(profile);
        continue;
      }

      // Sort by s, deduplicate close s values (average them)
      data.sort((a, b) => a.s - b.s);
      const merged = this._mergeClosePoints(data, 0.005);

      // Build cubic spline
      const xs = merged.map(d => d.s);
      const ys = merged.map(d => d.offset);
      const spline = new CubicSpline(xs, ys);

      // Evaluate at each profile point
      for (let i = 0; i < this.profilePoints; i++) {
        const s = i / (this.profilePoints - 1);
        const offset = spline.evaluate(s);
        profile[i] = this.hW + offset;
      }

      profiles.push(profile);
    }

    // Step 3: Gaussian profile smoothing (preserves shape better than moving average)
    if (smoothWindow > 0) {
      for (let w = 0; w < 4; w++) {
        profiles[w] = this._gaussianSmooth(profiles[w], smoothWindow);
      }
    }

    // Step 4: Adaptive smoothing pass (preserve sharp features)
    for (let w = 0; w < 4; w++) {
      profiles[w] = this._adaptiveSmooth(profiles[w]);
    }

    // Step 5: Corner continuity
    for (let w = 0; w < 4; w++) {
      const next = (w + 1) % 4;
      const avg = (profiles[w][this.profilePoints - 1] + profiles[next][0]) / 2;
      profiles[w][this.profilePoints - 1] = avg;
      profiles[next][0] = avg;
    }

    // Step 6: Final clamp
    for (let w = 0; w < 4; w++) {
      for (let i = 0; i < this.profilePoints; i++) {
        profiles[w][i] = Math.max(MIN_WALL_HEIGHT, Math.min(this.hW + PROFILE_OFFSET_MAX, profiles[w][i]));
      }
    }

    return profiles;
  }

  _mergeClosePoints(data, threshold) {
    const merged = [];
    let i = 0;
    while (i < data.length) {
      let sumS = data[i].s;
      let sumO = data[i].offset;
      let count = 1;
      while (i + count < data.length && data[i + count].s - data[i].s < threshold) {
        sumS += data[i + count].s;
        sumO += data[i + count].offset;
        count++;
      }
      merged.push({ s: sumS / count, offset: sumO / count });
      i += count;
    }
    return merged;
  }

  _gaussianSmooth(profile, window) {
    const N = profile.length;
    const sigma = window / 2.5;
    const kernelSize = Math.ceil(sigma * 3);
    const kernel = [];
    let kSum = 0;

    for (let k = -kernelSize; k <= kernelSize; k++) {
      const w = Math.exp(-0.5 * (k / sigma) ** 2);
      kernel.push(w);
      kSum += w;
    }

    const smoothed = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      let sum = 0;
      let wSum = 0;
      for (let k = -kernelSize; k <= kernelSize; k++) {
        const idx = i + k;
        if (idx >= 0 && idx < N) {
          const w = kernel[k + kernelSize];
          sum += profile[idx] * w;
          wSum += w;
        }
      }
      smoothed[i] = sum / wSum;
    }
    return smoothed;
  }

  _adaptiveSmooth(profile) {
    // Compute local curvature, reduce smoothing where curvature is high
    const N = profile.length;
    const curvature = new Float64Array(N);
    for (let i = 1; i < N - 1; i++) {
      curvature[i] = Math.abs(profile[i - 1] - 2 * profile[i] + profile[i + 1]);
    }

    // Normalize curvature
    let maxCurv = 0;
    for (let i = 0; i < N; i++) maxCurv = Math.max(maxCurv, curvature[i]);
    if (maxCurv < 0.001) return profile; // already smooth

    const result = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const factor = 1 - Math.min(1, curvature[i] / maxCurv); // 0 at high curvature, 1 at low
      const kernelSize = Math.max(1, Math.round(3 * factor));
      let sum = 0, count = 0;
      for (let k = -kernelSize; k <= kernelSize; k++) {
        const idx = i + k;
        if (idx >= 0 && idx < N) {
          sum += profile[idx];
          count++;
        }
      }
      result[i] = sum / count;
    }
    return result;
  }
}
