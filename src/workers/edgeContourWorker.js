/**
 * Edge-based contour extraction using Sobel edge detection + boundary tracing
 * Returns multiple contour paths (supports disconnected shapes)
 */

self.onmessage = function (e) {
  const { imageData, width, height, threshold } = e.data;
  const pixels = imageData;

  // Step 1: Convert to grayscale binary mask
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const brightness = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
    mask[i] = brightness < threshold ? 1 : 0;
  }

  // Step 2: Morphological close (dilate then erode) to fill small gaps
  const closed = morphClose(mask, width, height, 2);

  // Step 3: Extract boundary pixels (dark pixels with at least one light neighbor)
  const boundary = new Uint8Array(width * height);
  const boundaryPixels = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (closed[idx] === 0) continue;
      // Check 4-neighbors
      if (closed[idx - 1] === 0 || closed[idx + 1] === 0 ||
          closed[idx - width] === 0 || closed[idx + width] === 0) {
        boundary[idx] = 1;
        boundaryPixels.push({ x, y });
      }
    }
  }

  // Step 4: Connected component labeling on the binary mask
  const labels = new Int32Array(width * height);
  let nextLabel = 1;
  const componentBounds = []; // { minX, maxX, minY, maxY, pixelCount }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (closed[idx] === 1 && labels[idx] === 0) {
        // Flood fill
        const label = nextLabel++;
        const queue = [{ x, y }];
        let minX = x, maxX = x, minY = y, maxY = y, count = 0;

        while (queue.length > 0) {
          const p = queue.pop();
          const pi = p.y * width + p.x;
          if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) continue;
          if (labels[pi] !== 0 || closed[pi] !== 1) continue;

          labels[pi] = label;
          count++;
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);

          queue.push({ x: p.x - 1, y: p.y });
          queue.push({ x: p.x + 1, y: p.y });
          queue.push({ x: p.x, y: p.y - 1 });
          queue.push({ x: p.x, y: p.y + 1 });
        }

        componentBounds.push({ label, minX, maxX, minY, maxY, pixelCount: count });
      }
    }
  }

  // Step 5: Sort components by size (largest first) and filter tiny ones
  componentBounds.sort((a, b) => b.pixelCount - a.pixelCount);
  const minSize = width * height * 0.001; // at least 0.1% of image
  const significantComponents = componentBounds.filter(c => c.pixelCount >= minSize);

  // Step 6: For each significant component, extract ordered boundary contour
  const contours = [];

  for (const comp of significantComponents) {
    const contourPoints = [];

    // Get boundary pixels for this component
    for (const bp of boundaryPixels) {
      if (labels[bp.y * width + bp.x] === comp.label) {
        contourPoints.push(bp);
      }
    }

    if (contourPoints.length < 10) continue;

    // Order points by angle from component center
    const ccx = (comp.minX + comp.maxX) / 2;
    const ccy = (comp.minY + comp.maxY) / 2;

    contourPoints.sort((a, b) => {
      const aa = Math.atan2(a.y - ccy, a.x - ccx);
      const ab = Math.atan2(b.y - ccy, b.x - ccx);
      return aa - ab;
    });

    contours.push({
      points: contourPoints,
      bounds: comp,
      center: { x: ccx, y: ccy },
      pixelCount: comp.pixelCount,
    });
  }

  // Step 7: Also generate a radial contour (for compatibility with existing display)
  const cx = width / 2, cy = height / 2;
  const maxR = Math.min(cx, cy) * 0.95;
  const N = 720;
  const radialContour = new Float64Array(N);

  for (let i = 0; i < N; i++) {
    const theta = (i / N) * 2 * Math.PI;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    let outerR = 0;

    for (let r = 1; r <= maxR; r++) {
      const px = Math.round(cx + r * cosT);
      const py = Math.round(cy + r * sinT);
      if (px < 0 || px >= width || py < 0 || py >= height) break;
      if (closed[py * width + px] === 1) {
        outerR = r;
      }
    }
    radialContour[i] = outerR / maxR;
  }

  self.postMessage({
    contours: contours.map(c => ({
      points: c.points,
      center: c.center,
      pixelCount: c.pixelCount,
    })),
    componentCount: significantComponents.length,
    radialContour,
    mask: closed,
  }, [radialContour.buffer, closed.buffer]);
};

function morphClose(mask, w, h, radius) {
  // Dilate
  const dilated = new Uint8Array(w * h);
  for (let y = radius; y < h - radius; y++) {
    for (let x = radius; x < w - radius; x++) {
      let found = false;
      outer: for (let dy = -radius; dy <= radius && !found; dy++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          if (mask[(y + dy) * w + (x + dx)] === 1) found = true;
        }
      }
      dilated[y * w + x] = found ? 1 : 0;
    }
  }

  // Erode
  const eroded = new Uint8Array(w * h);
  for (let y = radius; y < h - radius; y++) {
    for (let x = radius; x < w - radius; x++) {
      let allSet = true;
      outer2: for (let dy = -radius; dy <= radius && allSet; dy++) {
        for (let dx = -radius; dx <= radius && allSet; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          if (dilated[(y + dy) * w + (x + dx)] === 0) allSet = false;
        }
      }
      eroded[y * w + x] = allSet ? 1 : 0;
    }
  }

  return eroded;
}
