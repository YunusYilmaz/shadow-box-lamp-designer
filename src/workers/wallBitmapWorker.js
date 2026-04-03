/**
 * Wall Bitmap Worker — N-wall segment 2D occupancy grids
 *
 * For each wall segment, creates a 2D grid [s × h] where:
 *   1 = solid material (blocks light → shadow)
 *   0 = hole (light passes → bright spot)
 *
 * Accepts arbitrary wall segments via `segments` parameter.
 */

self.onmessage = function (e) {
  const {
    imageData, width, height, threshold,
    hL, a, hW, gridW, gridH, maxWallH,
    segments, // Array of { p1: [x,y], p2: [x,y] } — if provided, N-wall mode
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

  // Wall definitions: from segments or 4-wall default
  const wallDefs = segments || [
    { p1: [-a, a], p2: [a, a] },
    { p1: [a, a], p2: [a, -a] },
    { p1: [a, -a], p2: [-a, -a] },
    { p1: [-a, -a], p2: [-a, a] },
  ];

  const wallCount = wallDefs.length;
  const wallBitmaps = [];

  for (let w = 0; w < wallCount; w++) {
    const seg = wallDefs[w];
    const [x1, y1] = seg.p1;
    const [x2, y2] = seg.p2;
    const bitmap = new Uint8Array(gridW * gridH);

    for (let si = 0; si < gridW; si++) {
      const s = si / (gridW - 1);
      const wx = x1 + s * (x2 - x1);
      const wy = y1 + s * (y2 - y1);

      for (let hi = 0; hi < gridH; hi++) {
        const h = (hi / (gridH - 1)) * maxWallH;

        if (h >= hL - 0.5) {
          bitmap[hi * gridW + si] = 0;
          continue;
        }

        const t = hL / (hL - h);
        const gx = wx * t;
        const gy = wy * t;

        const { px, py } = realToPixel(gx, gy);
        const brightness = sampleBrightness(px, py);

        bitmap[hi * gridW + si] = brightness < threshold ? 1 : 0;
      }
    }

    // Morphological cleanup
    const cleaned = morphClean(bitmap, gridW, gridH);

    // Structural base rows
    const minBaseRows = Math.max(2, Math.floor(gridH * 0.05));
    for (let hi = 0; hi < minBaseRows; hi++) {
      for (let si = 0; si < gridW; si++) {
        cleaned[hi * gridW + si] = 1;
      }
    }

    // Structural edge columns
    const edgeWidth = Math.max(1, Math.floor(gridW * 0.01));
    for (let hi = 0; hi < gridH; hi++) {
      for (let ei = 0; ei < edgeWidth; ei++) {
        cleaned[hi * gridW + ei] = 1;
        cleaned[hi * gridW + (gridW - 1 - ei)] = 1;
      }
    }

    wallBitmaps.push(cleaned);
  }

  const buffers = wallBitmaps.map(b => b.buffer);
  self.postMessage({
    bitmaps: wallBitmaps,
    gridW,
    gridH,
    maxWallH,
    wallCount,
  }, buffers);
};

function morphClean(bitmap, w, h) {
  const result = new Uint8Array(bitmap);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (result[y * w + x] === 1) {
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (result[(y + dy) * w + (x + dx)] === 1) neighbors++;
          }
        }
        if (neighbors < 2) result[y * w + x] = 0;
      }
    }
  }

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (result[y * w + x] === 0) {
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (result[(y + dy) * w + (x + dx)] === 1) neighbors++;
          }
        }
        if (neighbors >= 6) result[y * w + x] = 1;
      }
    }
  }

  return result;
}
