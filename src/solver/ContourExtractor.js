import { DEFAULT_THRESHOLD, DEFAULT_CONTOUR_RESOLUTION, DEFAULT_SIGMA } from '../constants.js';

export class ContourExtractor {
  constructor() {
    this._worker = null;
  }

  /**
   * Extract contour from image data using Web Worker
   * @param {Uint8ClampedArray} imageData - RGBA pixel data
   * @param {number} width
   * @param {number} height
   * @param {object} options
   * @returns {Promise<Float64Array>} - r_norm per angle
   */
  async extract(imageData, width, height, options = {}) {
    const {
      threshold = DEFAULT_THRESHOLD,
      resolution = DEFAULT_CONTOUR_RESOLUTION,
      sigma = DEFAULT_SIGMA,
    } = options;

    this.terminate();

    return new Promise((resolve, reject) => {
      this._worker = new Worker(
        new URL('../workers/contourWorker.js', import.meta.url),
        { type: 'module' }
      );

      this._worker.onmessage = (e) => {
        resolve(e.data.contour);
        this.terminate();
      };

      this._worker.onerror = (e) => {
        reject(new Error(`Worker error: ${e.message}`));
        this.terminate();
      };

      this._worker.postMessage({
        imageData,
        width,
        height,
        threshold,
        resolution,
        sigma,
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
