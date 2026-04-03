/**
 * Web Worker: High-resolution contour extraction with sub-pixel sampling
 */

self.onmessage = function (e) {
  const { imageData, width, height, threshold, resolution, sigma } = e.data;
  const pixels = imageData;
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(cx, cy) * 0.95;
  const N = resolution;
  const contour = new Float64Array(N);

  // Bilinear interpolation for sub-pixel brightness
  function sampleBilinear(px, py) {
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);
    const fx = px - x0;
    const fy = py - y0;

    const i00 = (y0 * width + x0) * 4;
    const i10 = (y0 * width + x1) * 4;
    const i01 = (y1 * width + x0) * 4;
    const i11 = (y1 * width + x1) * 4;

    const b00 = (pixels[i00] + pixels[i00 + 1] + pixels[i00 + 2]) / 3;
    const b10 = (pixels[i10] + pixels[i10 + 1] + pixels[i10 + 2]) / 3;
    const b01 = (pixels[i01] + pixels[i01 + 1] + pixels[i01 + 2]) / 3;
    const b11 = (pixels[i11] + pixels[i11 + 1] + pixels[i11 + 2]) / 3;

    return b00 * (1 - fx) * (1 - fy) +
           b10 * fx * (1 - fy) +
           b01 * (1 - fx) * fy +
           b11 * fx * fy;
  }

  // Extract contour — outermost dark pixel per angle with sub-pixel precision
  for (let i = 0; i < N; i++) {
    const theta = (i / N) * 2 * Math.PI;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    let outerR = 0;

    // Coarse pass: step by 1 pixel
    for (let r = 1; r <= maxR; r++) {
      const px = cx + r * cosT;
      const py = cy + r * sinT;
      if (px < 0 || px >= width - 1 || py < 0 || py >= height - 1) break;

      const brightness = sampleBilinear(px, py);
      if (brightness < threshold) {
        outerR = r;
      }
    }

    // Fine pass: sub-pixel refinement around the boundary
    if (outerR > 0 && outerR < maxR) {
      // Search 0.5 pixel steps around outerR
      let bestR = outerR;
      for (let dr = -2; dr <= 2; dr += 0.25) {
        const r = outerR + dr;
        if (r <= 0 || r > maxR) continue;
        const px = cx + r * cosT;
        const py = cy + r * sinT;
        if (px < 0 || px >= width - 1 || py < 0 || py >= height - 1) continue;

        const brightness = sampleBilinear(px, py);
        if (brightness < threshold) {
          bestR = Math.max(bestR, r);
        }
      }
      outerR = bestR;
    }

    contour[i] = outerR / maxR;
  }

  // Multi-pass Gaussian angular smoothing
  function gaussianPass(data, sig) {
    if (sig <= 0) return data;
    const len = data.length;
    const smoothed = new Float64Array(len);
    const kernelSize = Math.ceil(sig * 3);
    const kernel = [];
    let kernelSum = 0;

    for (let k = -kernelSize; k <= kernelSize; k++) {
      const w = Math.exp(-0.5 * (k / sig) ** 2);
      kernel.push(w);
      kernelSum += w;
    }

    for (let i = 0; i < len; i++) {
      let sum = 0;
      for (let k = -kernelSize; k <= kernelSize; k++) {
        const idx = ((i + k) % len + len) % len;
        sum += data[idx] * kernel[k + kernelSize];
      }
      smoothed[i] = sum / kernelSum;
    }
    return smoothed;
  }

  // Pass 1: main smoothing
  let result = gaussianPass(contour, sigma);

  // Pass 2: light refinement (half sigma)
  if (sigma > 1) {
    result = gaussianPass(result, sigma * 0.4);
  }

  self.postMessage({ contour: result }, [result.buffer]);
};
