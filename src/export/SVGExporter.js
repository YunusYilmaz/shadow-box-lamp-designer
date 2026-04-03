import { WALL_COLORS, WALL_NAMES } from '../constants.js';

/**
 * SVG Exporter with smooth cubic bezier curves.
 *
 * Profile mode: Converts sampled profile points to optimized cubic bezier paths
 *   using Catmull-Rom → Cubic Bezier conversion for smooth, minimal-node curves.
 *
 * Bitmap mode: Extracts contour paths from bitmap grids using marching squares,
 *   then smooths them with Chaikin subdivision + bezier fitting.
 */
export class SVGExporter {

  // ════════════════════════════════════════════════════════
  //  PROFILE MODE — smooth bezier export
  // ════════════════════════════════════════════════════════

  exportMultiLayer(layers) {
    const wallWidth = 120;
    const maxHeight = 75;
    const gap = 15;
    const margin = 12;
    const layerGap = 20;

    const visibleLayers = layers.filter(l => l.visible && l.wallProfiles);
    const numLayers = visibleLayers.length;
    const totalWidth = margin * 2 + wallWidth * 4 + gap * 3;
    const totalHeight = margin * 2 + (maxHeight + layerGap) * numLayers + 20;

    let svg = this._svgHeader(totalWidth, totalHeight);

    for (let li = 0; li < numLayers; li++) {
      const layer = visibleLayers[li];
      const profiles = layer.wallProfiles;
      const yBase = margin + li * (maxHeight + layerGap) + 16;

      svg += `<text x="${margin}" y="${yBase - 4}" class="label" style="font-size:3.5px;fill:#aaa">${layer.name} (${layer.halfSide * 2}mm, LED ${layer.ledHeight}mm)</text>\n`;

      for (let w = 0; w < 4; w++) {
        const xOff = margin + w * (wallWidth + gap);
        const profile = profiles[w];
        const N = profile.length;
        const yOff = yBase + 8;

        // Wall name
        svg += `<text x="${xOff + wallWidth / 2}" y="${yBase + 4}" text-anchor="middle" class="title" fill="${WALL_COLORS[w]}">${WALL_NAMES[w]}</text>\n`;

        // Downsample profile to key points, then generate smooth bezier
        const points = this._profileToPoints(profile, N, xOff, yOff, wallWidth, maxHeight);
        const simplified = this._rdpSimplify(points, 0.15); // Ramer-Douglas-Peucker
        const bezierPath = this._catmullRomToBezierPath(simplified);

        // Fill area (closed path with bezier top + straight bottom)
        const firstPt = simplified[0];
        const lastPt = simplified[simplified.length - 1];
        const fillPath = `M ${xOff.toFixed(2)},${(yOff + maxHeight).toFixed(2)} ` +
          `L ${firstPt.x.toFixed(2)},${firstPt.y.toFixed(2)} ` +
          bezierPath +
          ` L ${lastPt.x.toFixed(2)},${(yOff + maxHeight).toFixed(2)} Z`;
        svg += `<path d="${fillPath}" class="fill" fill="${WALL_COLORS[w]}" />\n`;

        // Cut line (bezier curve only)
        const cutPath = `M ${firstPt.x.toFixed(2)},${firstPt.y.toFixed(2)} ` + bezierPath;
        svg += `<path d="${cutPath}" class="cut" stroke="${WALL_COLORS[w]}" />\n`;

        // Base line
        svg += `<line x1="${xOff}" y1="${yOff + maxHeight}" x2="${xOff + wallWidth}" y2="${yOff + maxHeight}" class="base" />\n`;

        // Outer rectangle
        svg += `<rect x="${xOff}" y="${yOff}" width="${wallWidth}" height="${maxHeight}" class="outline" />\n`;

        // Registration marks
        this._addRegMarks(svg, xOff, yOff, wallWidth, maxHeight).forEach(s => svg += s);

        // Dimension
        svg += `<text x="${xOff + wallWidth / 2}" y="${yOff + maxHeight + 6}" text-anchor="middle" class="dim">${wallWidth}mm</text>\n`;
      }
    }

    svg += '</svg>';
    return svg;
  }

  /**
   * Convert profile array to {x,y} points
   */
  _profileToPoints(profile, N, xOff, yOff, wallWidth, maxHeight) {
    const points = [];
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1);
      points.push({
        x: xOff + s * wallWidth,
        y: yOff + maxHeight - profile[i]
      });
    }
    return points;
  }

  /**
   * Ramer-Douglas-Peucker simplification.
   * Reduces point count while preserving shape within tolerance.
   */
  _rdpSimplify(points, epsilon) {
    if (points.length <= 2) return points;

    let maxDist = 0;
    let maxIdx = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const d = this._pointLineDistance(points[i], first, last);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }

    if (maxDist > epsilon) {
      const left = this._rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
      const right = this._rdpSimplify(points.slice(maxIdx), epsilon);
      return left.slice(0, -1).concat(right);
    } else {
      return [first, last];
    }
  }

  _pointLineDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return Math.hypot(p.x - projX, p.y - projY);
  }

  /**
   * Convert a sequence of points to SVG cubic bezier commands
   * using Catmull-Rom spline → Cubic Bezier conversion.
   *
   * For points P0, P1, P2, P3, the Catmull-Rom segment from P1→P2 becomes:
   *   CP1 = P1 + (P2 - P0) / (6 * tension)
   *   CP2 = P2 - (P3 - P1) / (6 * tension)
   *
   * This produces G1-continuous curves through all data points.
   */
  _catmullRomToBezierPath(points, tension = 1) {
    if (points.length < 2) return '';
    if (points.length === 2) {
      return `L ${points[1].x.toFixed(2)},${points[1].y.toFixed(2)}`;
    }

    let path = '';
    const n = points.length;

    for (let i = 0; i < n - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(n - 1, i + 2)];

      const t6 = 6 * tension;

      // Control points
      const cp1x = p1.x + (p2.x - p0.x) / t6;
      const cp1y = p1.y + (p2.y - p0.y) / t6;
      const cp2x = p2.x - (p3.x - p1.x) / t6;
      const cp2y = p2.y - (p3.y - p1.y) / t6;

      path += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
    }

    return path;
  }

  // ════════════════════════════════════════════════════════
  //  BITMAP/DETAIL MODE — contour extraction + smooth export
  // ════════════════════════════════════════════════════════

  exportBitmaps(bitmaps, gridW, gridH, maxWallH, wallWidth = 120) {
    const gap = 15;
    const margin = 12;
    const totalW = margin * 2 + wallWidth * 4 + gap * 3;
    const totalH = margin * 2 + maxWallH + 30;

    let svg = this._svgHeader(totalW, totalH);

    const cellW = wallWidth / gridW;
    const cellH = maxWallH / gridH;

    for (let w = 0; w < 4; w++) {
      const bitmap = bitmaps[w];
      const xOff = margin + w * (wallWidth + gap);
      const yOff = margin + 16;

      // Wall label
      svg += `<text x="${xOff + wallWidth / 2}" y="${margin + 10}" text-anchor="middle" class="label" fill="${WALL_COLORS[w]}">${WALL_NAMES[w]}</text>\n`;

      // ── Render bitmap as embedded raster image in SVG
      // This gives a pixel-perfect representation of wall holes
      const bitmapDataURL = this._bitmapToDataURL(bitmap, gridW, gridH, WALL_COLORS[w]);

      // Outer wall rectangle
      svg += `<rect x="${xOff}" y="${yOff}" width="${wallWidth}" height="${maxWallH}" class="base" stroke="${WALL_COLORS[w]}"/>\n`;

      // Embedded bitmap image (flipped vertically: bitmap y=0 is bottom, SVG y=0 is top)
      svg += `<image x="${xOff}" y="${yOff}" width="${wallWidth}" height="${maxWallH}" `
           + `href="${bitmapDataURL}" image-rendering="auto" preserveAspectRatio="none"/>\n`;

      // Registration marks
      this._addRegMarks(svg, xOff, yOff, wallWidth, maxWallH).forEach(s => svg += s);

      // Dimension
      svg += `<text x="${xOff + wallWidth / 2}" y="${yOff + maxWallH + 8}" text-anchor="middle" class="dim">${wallWidth}mm × ${maxWallH}mm</text>\n`;
    }

    svg += '</svg>';
    return svg;
  }

  /**
   * Marching squares contour extraction from binary bitmap.
   * Returns array of contour paths (each is array of {x,y} in grid coords).
   */
  _marchingSquares(bitmap, w, h) {
    const contours = [];
    const visited = new Set();

    // Helper: get cell value (0 or 1)
    const val = (x, y) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return 0;
      return bitmap[y * w + x];
    };

    // For each edge between cells, trace contour
    for (let y = 0; y <= h; y++) {
      for (let x = 0; x <= w; x++) {
        // Check if this vertex is on a boundary
        const tl = val(x - 1, y);
        const tr = val(x, y);
        const bl = val(x - 1, y - 1);
        const br = val(x, y - 1);
        const config = (tl << 3) | (tr << 2) | (br << 1) | bl;

        if (config === 0 || config === 15) continue;

        const key = `${x},${y}`;
        if (visited.has(key)) continue;

        // Trace contour from this boundary point
        const contour = this._traceContour(bitmap, w, h, x, y, visited);
        if (contour && contour.length >= 3) {
          contours.push(contour);
        }
      }
    }

    return contours;
  }

  /**
   * Trace a single contour path starting from boundary vertex (startX, startY)
   */
  _traceContour(bitmap, w, h, startX, startY, visited) {
    const val = (x, y) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return 0;
      return bitmap[y * w + x];
    };

    const points = [];
    let cx = startX, cy = startY;
    let prevDir = -1;
    // Max iterations = full perimeter of grid (safe upper bound)
    const maxIter = 2 * (w + h) + w * h;
    const localVisited = new Set();

    for (let iter = 0; iter < maxIter; iter++) {
      const key = `${cx},${cy},${prevDir}`;
      // Loop detection: same position AND same direction = infinite loop
      if (localVisited.has(key)) break;
      localVisited.add(key);

      if (iter > 0 && cx === startX && cy === startY) break;

      const posKey = `${cx},${cy}`;
      visited.add(posKey);
      points.push({ x: cx, y: cy });

      const tl = val(cx - 1, cy);
      const tr = val(cx, cy);
      const bl = val(cx - 1, cy - 1);
      const br = val(cx, cy - 1);
      const config = (tl << 3) | (tr << 2) | (br << 1) | bl;

      let dir = -1;
      switch (config) {
        case 1: case 5: case 13: dir = 0; break;
        case 2: case 3: case 7: dir = 3; break;
        case 4: case 12: case 14: dir = 2; break;
        case 8: case 10: case 11: dir = 1; break;
        case 6: dir = prevDir === 1 ? 2 : 0; break;
        case 9: dir = prevDir === 0 ? 1 : 3; break;
        default: dir = -1; break;
      }

      if (dir === -1) break;

      prevDir = dir;
      switch (dir) {
        case 0: cx++; break;
        case 1: cy++; break;
        case 2: cx--; break;
        case 3: cy--; break;
      }

      if (cx < 0 || cx > w || cy < 0 || cy > h) break;
    }

    return points;
  }

  /**
   * Chaikin corner-cutting subdivision for smoothing closed polygons.
   * Each iteration doubles point count and rounds corners.
   */
  _chaikinSmooth(points, iterations = 2) {
    let pts = points;
    for (let iter = 0; iter < iterations; iter++) {
      const next = [];
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % n];
        next.push({
          x: 0.75 * p0.x + 0.25 * p1.x,
          y: 0.75 * p0.y + 0.25 * p1.y,
        });
        next.push({
          x: 0.25 * p0.x + 0.75 * p1.x,
          y: 0.25 * p0.y + 0.75 * p1.y,
        });
      }
      pts = next;
    }
    return pts;
  }

  /**
   * Convert closed polygon points to SVG path with cubic bezier curves.
   * Uses Catmull-Rom conversion for smooth closed path.
   */
  _pointsToClosedBezierPath(points) {
    const n = points.length;
    if (n < 3) return '';

    const r = (v) => Math.round(v * 10) / 10; // 1 decimal place

    let path = `M${r(points[0].x)},${r(points[0].y)}`;

    for (let i = 0; i < n; i++) {
      const p0 = points[(i - 1 + n) % n];
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const p3 = points[(i + 2) % n];

      const t6 = 6;
      const cp1x = r(p1.x + (p2.x - p0.x) / t6);
      const cp1y = r(p1.y + (p2.y - p0.y) / t6);
      const cp2x = r(p2.x - (p3.x - p1.x) / t6);
      const cp2y = r(p2.y - (p3.y - p1.y) / t6);

      path += `C${cp1x},${cp1y} ${cp2x},${cp2y} ${r(p2.x)},${r(p2.y)}`;
    }

    path += 'Z';
    return path;
  }

  // ════════════════════════════════════════════════════════
  //  SHARED UTILITIES
  // ════════════════════════════════════════════════════════

  _svgHeader(width, height) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm"
     viewBox="0 0 ${width} ${height}">
<style>
  .cut { fill: none; stroke-width: 0.3; }
  .base { fill: none; stroke: #999; stroke-width: 0.2; }
  .outline { fill: none; stroke: #cc0000; stroke-width: 0.15; stroke-dasharray: 1,1; }
  .label { font-family: monospace; font-size: 3px; fill: #666; }
  .title { font-family: monospace; font-size: 4px; }
  .fill { opacity: 0.12; }
  .reg { fill: none; stroke: #333; stroke-width: 0.15; }
  .dim { font-family: monospace; font-size: 2.5px; fill: #999; }
</style>
`;
  }

  _addRegMarks(svg, xOff, yOff, wallWidth, maxHeight) {
    const ms = 3;
    const lines = [];
    for (const [cx, cy] of [[xOff, yOff], [xOff + wallWidth, yOff], [xOff, yOff + maxHeight], [xOff + wallWidth, yOff + maxHeight]]) {
      lines.push(`<line x1="${cx - ms}" y1="${cy}" x2="${cx + ms}" y2="${cy}" class="reg"/>`);
      lines.push(`<line x1="${cx}" y1="${cy - ms}" x2="${cx}" y2="${cy + ms}" class="reg"/>\n`);
    }
    return lines;
  }

  /**
   * Convert a wall bitmap to a data URL PNG image.
   * Solid cells = wall color, hole cells = white (transparent).
   * Bitmap is flipped vertically (y=0 is bottom in physics, top in canvas).
   */
  _bitmapToDataURL(bitmap, gridW, gridH, wallColorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = gridW;
    canvas.height = gridH;
    const ctx = canvas.getContext('2d');

    // Parse wall color
    const r = parseInt(wallColorHex.slice(1, 3), 16);
    const g = parseInt(wallColorHex.slice(3, 5), 16);
    const b = parseInt(wallColorHex.slice(5, 7), 16);

    const imgData = ctx.createImageData(gridW, gridH);
    const px = imgData.data;

    for (let hi = 0; hi < gridH; hi++) {
      // Flip Y: bitmap hi=0 is bottom, canvas row 0 is top
      const canvasY = gridH - 1 - hi;
      for (let si = 0; si < gridW; si++) {
        const idx = (canvasY * gridW + si) * 4;
        if (bitmap[hi * gridW + si] === 1) {
          // Solid = wall color with some transparency
          px[idx] = r;
          px[idx + 1] = g;
          px[idx + 2] = b;
          px[idx + 3] = 80; // semi-transparent
        } else {
          // Hole = white (light passes through)
          px[idx] = 255;
          px[idx + 1] = 255;
          px[idx + 2] = 255;
          px[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  download(layers, bitmapData = null) {
    let svg;
    if (bitmapData) {
      svg = this.exportBitmaps(
        bitmapData.bitmaps, bitmapData.gridW, bitmapData.gridH,
        bitmapData.maxWallH, layers[0] ? layers[0].halfSide * 2 : 120
      );
    } else {
      svg = this.exportMultiLayer(layers);
    }
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `shadowbox-${ts}.svg`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  }
}
