import { H_L, A, H_W } from '../constants.js';

/**
 * Wall Bitmap Solver — computes 2D occupancy grids for walls with internal detail
 *
 * Each wall gets a bitmap where 1=solid material, 0=hole/cutout.
 * When fabricated, light passes through holes creating detailed shadow patterns.
 */
export class WallBitmapSolver {
  constructor() {
    this._worker = null;
  }

  /**
   * @param {Uint8ClampedArray} imageData
   * @param {number} width - image width
   * @param {number} height - image height
   * @param {object} options
   * @returns {Promise<{bitmaps: Uint8Array[], gridW: number, gridH: number, maxWallH: number}>}
   */
  async solve(imageData, width, height, options = {}) {
    const {
      threshold = 100,
      hL = H_L,
      a = A,
      hW = H_W,
      gridW = 240,
      gridH = 150,
      maxWallH = 75,
      segments = null,
    } = options;

    this.terminate();

    return new Promise((resolve, reject) => {
      this._worker = new Worker(
        new URL('../workers/wallBitmapWorker.js', import.meta.url),
        { type: 'module' }
      );

      this._worker.onmessage = (e) => {
        resolve(e.data);
        this.terminate();
      };

      this._worker.onerror = (err) => {
        reject(new Error(`WallBitmap worker error: ${err.message}`));
        this.terminate();
      };

      this._worker.postMessage({
        imageData, width, height, threshold,
        hL, a, hW, gridW, gridH, maxWallH, segments,
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
