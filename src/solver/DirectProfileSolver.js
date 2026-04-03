import {
  H_L, A, H_W, DEFAULT_PROFILE_POINTS,
  MIN_WALL_HEIGHT, PROFILE_OFFSET_MAX,
} from '../constants.js';

/**
 * Direct Profile Solver — uses per-wall ray tracing worker.
 * Supports N arbitrary wall segments (not just 4 square walls).
 */
export class DirectProfileSolver {
  constructor() {
    this._worker = null;
  }

  /**
   * Solve directly from image data → N wall profiles
   * @param {Uint8ClampedArray} imageData
   * @param {number} width
   * @param {number} height
   * @param {object} options
   * @returns {Promise<Float64Array[]>} N profiles (4 default, or N if segments provided)
   */
  async solve(imageData, width, height, options = {}) {
    const {
      threshold = 100,
      hL = H_L,
      a = A,
      hW = H_W,
      profilePoints = DEFAULT_PROFILE_POINTS,
      sigma = 2,
      segments = null, // Array of { p1: [x,y], p2: [x,y] } for N-wall mode
    } = options;

    const wallCount = segments ? segments.length : 4;

    this.terminate();

    return new Promise((resolve, reject) => {
      this._worker = new Worker(
        new URL('../workers/directProfileWorker.js', import.meta.url),
        { type: 'module' }
      );

      this._worker.onmessage = (e) => {
        // Worker returns array of Float64Arrays (might come as regular arrays after transfer)
        const rawProfiles = e.data;
        const profiles = [];
        for (let w = 0; w < wallCount; w++) {
          const p = rawProfiles[w] instanceof Float64Array
            ? rawProfiles[w]
            : new Float64Array(rawProfiles[w]);
          // Clamp
          for (let i = 0; i < p.length; i++) {
            p[i] = Math.max(MIN_WALL_HEIGHT, Math.min(hW + PROFILE_OFFSET_MAX, p[i]));
          }
          profiles.push(p);
        }
        resolve(profiles);
        this.terminate();
      };

      this._worker.onerror = (err) => {
        reject(new Error(`DirectProfile worker error: ${err.message}`));
        this.terminate();
      };

      this._worker.postMessage({
        imageData, width, height, threshold,
        hL, a, hW, profilePoints, sigma, segments,
      });
    });
  }

  terminate() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
  }
}
