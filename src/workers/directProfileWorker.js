/**
 * Direct Profile Worker — N-wall segment ray tracing
 *
 * Accepts arbitrary wall segments (not just 4 square walls).
 * For each segment, traces projection rays outward to find shadow boundary.
 */

self.onmessage = function (e) {
  const {
    imageData, width, height, threshold,
    hL, a, hW, profilePoints, sigma,
    segments, // Array of { p1: [x,y], p2: [x,y] } — if provided, use N-wall mode
  } = e.data;

  const pixels = imageData;
  const cx = width / 2;
  const cy = height / 2;
  const mag = hL / (hL - hW);
  const maxShadowR = a * mag;
  const imgHalf = Math.min(cx, cy) * 0.95;
  const pxPerMm = imgHalf / maxShadowR;

  function sampleBrightness(px, py) {
    if (px < 0.5 || px >= width - 1.5 || py < 0.5 || py >= height - 1.5) return 255;
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const x1 = x0 + 1, y1 = y0 + 1;
    const fx = px - x0, fy = py - y0;
    const i00 = (y0 * width + x0) * 4;
    const i10 = (y0 * width + x1) * 4;
    const i01 = (y1 * width + x0) * 4;
    const i11 = (y1 * width + x1) * 4;
    const b00 = (pixels[i00] + pixels[i00 + 1] + pixels[i00 + 2]) / 3;
    const b10 = (pixels[i10] + pixels[i10 + 1] + pixels[i10 + 2]) / 3;
    const b01 = (pixels[i01] + pixels[i01 + 1] + pixels[i01 + 2]) / 3;
    const b11 = (pixels[i11] + pixels[i11 + 1] + pixels[i11 + 2]) / 3;
    return b00 * (1 - fx) * (1 - fy) + b10 * fx * (1 - fy) +
           b01 * (1 - fx) * fy + b11 * fx * fy;
  }

  function realToPixel(gx, gy) {
    return {
      px: cx + gx * pxPerMm,
      py: cy - gy * pxPerMm,
    };
  }

  // Determine wall definitions: either from segments or 4-wall default
  const wallDefs = segments || [
    { p1: [-a, a], p2: [a, a] },     // Front
    { p1: [a, a], p2: [a, -a] },     // Right
    { p1: [a, -a], p2: [-a, -a] },   // Back
    { p1: [-a, -a], p2: [-a, a] },   // Left
  ];

  const wallCount = wallDefs.length;
  const profiles = [];

  for (let w = 0; w < wallCount; w++) {
    const profile = new Float64Array(profilePoints);
    const seg = wallDefs[w];
    const [x1, y1] = seg.p1;
    const [x2, y2] = seg.p2;

    for (let si = 0; si < profilePoints; si++) {
      const s = si / (profilePoints - 1);

      // Wall point position
      const wx = x1 + s * (x2 - x1);
      const wy = y1 + s * (y2 - y1);

      // Scan from low height to high — find outermost dark pixel
      const heightSteps = 200;
      const wzMin = Math.max(1, hW - 40);
      const wzMax = Math.min(hL - 0.5, hW + 25);

      let bestWz = hW;
      let foundAnyDark = false;

      for (let hi = 0; hi <= heightSteps; hi++) {
        const wz = wzMin + (hi / heightSteps) * (wzMax - wzMin);
        const t = hL / (hL - wz);
        const gx = wx * t;
        const gy = wy * t;

        const { px, py } = realToPixel(gx, gy);
        const brightness = sampleBrightness(px, py);

        if (brightness < threshold) {
          bestWz = wz;
          foundAnyDark = true;
        }
      }

      // Sub-pixel refinement
      if (foundAnyDark && bestWz > wzMin && bestWz < wzMax) {
        const step = (wzMax - wzMin) / heightSteps;
        for (let ri = 0; ri <= 20; ri++) {
          const wz = bestWz + ri * step * 0.05;
          if (wz >= wzMax) break;
          const t = hL / (hL - wz);
          const { px, py } = realToPixel(wx * t, wy * t);
          if (sampleBrightness(px, py) < threshold) {
            bestWz = wz;
          } else {
            break;
          }
        }
      }

      profile[si] = foundAnyDark ? bestWz : (hW - 5);
    }

    profiles.push(profile);
  }

  // Gaussian smoothing per profile
  if (sigma > 0) {
    for (let w = 0; w < wallCount; w++) {
      const src = profiles[w];
      const dst = new Float64Array(profilePoints);
      const kernelSize = Math.ceil(sigma * 2.5);
      const kernel = [];
      let kSum = 0;
      for (let k = -kernelSize; k <= kernelSize; k++) {
        const v = Math.exp(-0.5 * (k / sigma) ** 2);
        kernel.push(v);
        kSum += v;
      }
      for (let i = 0; i < profilePoints; i++) {
        let sum = 0, ws = 0;
        for (let k = -kernelSize; k <= kernelSize; k++) {
          const idx = i + k;
          if (idx >= 0 && idx < profilePoints) {
            const kw = kernel[k + kernelSize];
            sum += src[idx] * kw;
            ws += kw;
          }
        }
        dst[i] = sum / ws;
      }
      profiles[w] = dst;
    }
  }

  const buffers = profiles.map(p => p.buffer);
  self.postMessage(profiles, buffers);
};
