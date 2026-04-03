import { WALL_COLORS, WALL_NAMES } from '../constants.js';

/**
 * DXF Exporter for shadow box wall profiles.
 *
 * Exports wall profiles as DXF format suitable for laser cutting / CNC.
 *
 * Profile mode:  Each wall as a closed LWPOLYLINE (base + profile curve + sides).
 * Detail mode:   Each wall as a rectangle + hole contours from bitmap scan-line extraction.
 *
 * Each wall lives on its own DXF layer (FRONT, RIGHT, BACK, LEFT) with a distinct color.
 * Units are millimeters. LWPOLYLINE entities with group codes per AutoCAD spec.
 */

// DXF color indices mapped to the four walls
const DXF_LAYER_COLORS = [5, 1, 3, 2]; // blue, red, green, yellow
const DXF_LAYER_NAMES  = ['FRONT', 'RIGHT', 'BACK', 'LEFT'];

export class DXFExporter {

  // ════════════════════════════════════════════════════════
  //  PROFILE MODE
  // ════════════════════════════════════════════════════════

  /**
   * Export all visible layers' wall profiles as DXF.
   * Each wall becomes a closed LWPOLYLINE on its own layer.
   * Walls are laid out left-to-right with a gap; layers stack vertically.
   *
   * @param {Array} layers - Array of layer objects with .visible, .wallProfiles, .halfSide, .name
   * @returns {string} Complete DXF file content
   */
  exportProfiles(layers) {
    const gap = 15;        // mm between walls horizontally
    const layerGap = 20;   // mm between layers vertically
    const margin = 10;

    const visibleLayers = layers.filter(l => l.visible && l.wallProfiles);
    const entities = [];

    for (let li = 0; li < visibleLayers.length; li++) {
      const layer = visibleLayers[li];
      const profiles = layer.wallProfiles;
      const wallWidth = layer.halfSide * 2;
      const yBase = margin + li * (80 + layerGap); // 80 = generous max height area

      for (let w = 0; w < 4; w++) {
        const profile = profiles[w];
        const N = profile.length;
        const xOff = margin + w * (wallWidth + gap);
        const yOff = yBase;

        // Build closed polyline vertices:
        //   bottom-left -> bottom-right -> right side up -> profile right-to-left -> close
        const verts = [];

        // Bottom-left
        verts.push([xOff, yOff]);
        // Bottom-right
        verts.push([xOff + wallWidth, yOff]);
        // Right side up to profile end
        verts.push([xOff + wallWidth, yOff + profile[N - 1]]);
        // Profile curve from right to left
        for (let i = N - 1; i >= 0; i--) {
          const x = xOff + (i / (N - 1)) * wallWidth;
          const y = yOff + profile[i];
          verts.push([x, y]);
        }
        // Left side back down handled by closing (returns to bottom-left)

        entities.push(this._lwpolyline(verts, DXF_LAYER_NAMES[w], true));
      }
    }

    return this._buildDXF(entities);
  }

  // ════════════════════════════════════════════════════════
  //  BITMAP / DETAIL MODE
  // ════════════════════════════════════════════════════════

  /**
   * Export wall bitmaps as DXF with outer rectangles and hole contours.
   *
   * @param {Array} bitmaps   - Array of 4 flat arrays (one per wall), 1=solid, 0=hole
   * @param {number} gridW    - Bitmap grid width (columns)
   * @param {number} gridH    - Bitmap grid height (rows)
   * @param {number} maxWallH - Physical wall height in mm
   * @param {number} wallWidth - Physical wall width in mm
   * @returns {string} Complete DXF file content
   */
  exportBitmaps(bitmaps, gridW, gridH, maxWallH, wallWidth = 120) {
    const gap = 15;
    const margin = 10;
    const cellW = wallWidth / gridW;
    const cellH = maxWallH / gridH;
    const entities = [];

    for (let w = 0; w < 4; w++) {
      const bitmap = bitmaps[w];
      const xOff = margin + w * (wallWidth + gap);
      const yOff = margin;
      const layerName = DXF_LAYER_NAMES[w];

      // Outer wall rectangle
      entities.push(this._lwpolyline([
        [xOff, yOff],
        [xOff + wallWidth, yOff],
        [xOff + wallWidth, yOff + maxWallH],
        [xOff, yOff + maxWallH],
      ], layerName, true));

      // Extract hole regions via scan-line and merge into rectangles
      const holeRects = this._extractHoleRects(bitmap, gridW, gridH);

      for (const rect of holeRects) {
        // rect = { x, y, w, h } in grid coordinates
        // Convert to mm; bitmap y=0 is bottom row
        const rx = xOff + rect.x * cellW;
        const ry = yOff + rect.y * cellH;
        const rw = rect.w * cellW;
        const rh = rect.h * cellH;

        entities.push(this._lwpolyline([
          [rx, ry],
          [rx + rw, ry],
          [rx + rw, ry + rh],
          [rx, ry + rh],
        ], layerName, true));
      }
    }

    return this._buildDXF(entities);
  }

  /**
   * Scan-line hole extraction from a bitmap grid.
   * Finds runs of 0-valued cells per row, then merges vertically adjacent
   * runs of the same x-span into larger rectangles.
   *
   * @param {Array} bitmap - Flat array of 0/1 values, length = gridW * gridH
   * @param {number} gridW
   * @param {number} gridH
   * @returns {Array<{x,y,w,h}>} Merged rectangle regions (grid coordinates)
   */
  _extractHoleRects(bitmap, gridW, gridH) {
    // Step 1: collect horizontal runs of holes per row
    const runs = []; // { x, y, w }
    for (let row = 0; row < gridH; row++) {
      let col = 0;
      while (col < gridW) {
        if (bitmap[row * gridW + col] === 0) {
          const startCol = col;
          while (col < gridW && bitmap[row * gridW + col] === 0) col++;
          runs.push({ x: startCol, y: row, w: col - startCol });
        } else {
          col++;
        }
      }
    }

    // Step 2: merge vertically adjacent runs with same x-span
    // Sort by x, then y for grouping
    runs.sort((a, b) => a.x - b.x || a.w - b.w || a.y - b.y);

    const merged = [];
    const used = new Array(runs.length).fill(false);

    for (let i = 0; i < runs.length; i++) {
      if (used[i]) continue;
      used[i] = true;

      let rect = { x: runs[i].x, y: runs[i].y, w: runs[i].w, h: 1 };

      // Try to extend downward (increasing y)
      let nextRow = rect.y + rect.h;
      let extended = true;
      while (extended) {
        extended = false;
        for (let j = i + 1; j < runs.length; j++) {
          if (used[j]) continue;
          if (runs[j].x === rect.x && runs[j].w === rect.w && runs[j].y === nextRow) {
            used[j] = true;
            rect.h++;
            nextRow++;
            extended = true;
            break;
          }
        }
      }

      merged.push(rect);
    }

    return merged;
  }

  // ════════════════════════════════════════════════════════
  //  DOWNLOAD
  // ════════════════════════════════════════════════════════

  /**
   * Generate DXF and trigger a browser file download.
   *
   * @param {Array} layers      - Layer data (used for profile mode)
   * @param {Object|null} bitmapData - If provided, uses bitmap/detail mode
   *   { bitmaps, gridW, gridH, maxWallH }
   */
  download(layers, bitmapData = null) {
    let dxf;
    if (bitmapData) {
      dxf = this.exportBitmaps(
        bitmapData.bitmaps,
        bitmapData.gridW,
        bitmapData.gridH,
        bitmapData.maxWallH,
        layers[0] ? layers[0].halfSide * 2 : 120
      );
    } else {
      dxf = this.exportProfiles(layers);
    }

    const blob = new Blob([dxf], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `shadowbox-${ts}.dxf`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ════════════════════════════════════════════════════════
  //  DXF BUILDING INTERNALS
  // ════════════════════════════════════════════════════════

  /**
   * Assemble a complete DXF string from an array of entity strings.
   */
  _buildDXF(entities) {
    let dxf = '';
    dxf += this._headerSection();
    dxf += this._tablesSection();
    dxf += this._entitiesSection(entities);
    dxf += this._eof();
    return dxf;
  }

  /**
   * DXF HEADER section.
   * Sets AutoCAD version (AC1015 = AutoCAD 2000) and units to millimeters.
   */
  _headerSection() {
    return [
      '0', 'SECTION',
      '2', 'HEADER',
      // AutoCAD version
      '9', '$ACADVER',
      '1', 'AC1015',
      // Insert units: 4 = millimeters
      '9', '$INSUNITS',
      '70', '4',
      // Measurement: 1 = metric
      '9', '$MEASUREMENT',
      '70', '1',
      '0', 'ENDSEC',
    ].join('\n') + '\n';
  }

  /**
   * DXF TABLES section defining layers.
   * Each wall gets its own layer with a distinct DXF color.
   */
  _tablesSection() {
    const lines = [
      '0', 'SECTION',
      '2', 'TABLES',
      // LAYER table
      '0', 'TABLE',
      '2', 'LAYER',
      '70', String(DXF_LAYER_NAMES.length), // max number of layers
    ];

    for (let i = 0; i < DXF_LAYER_NAMES.length; i++) {
      lines.push(
        '0', 'LAYER',
        '2', DXF_LAYER_NAMES[i],  // layer name
        '70', '0',                  // flags (0 = normal)
        '62', String(DXF_LAYER_COLORS[i]), // color
        '6', 'CONTINUOUS',          // linetype
      );
    }

    lines.push(
      '0', 'ENDTAB',
      '0', 'ENDSEC',
    );

    return lines.join('\n') + '\n';
  }

  /**
   * DXF ENTITIES section wrapping the given entity strings.
   */
  _entitiesSection(entities) {
    const lines = [
      '0', 'SECTION',
      '2', 'ENTITIES',
    ];
    let result = lines.join('\n') + '\n';
    for (const ent of entities) {
      result += ent;
    }
    result += '0\nENDSEC\n';
    return result;
  }

  /**
   * DXF EOF marker.
   */
  _eof() {
    return '0\nEOF\n';
  }

  /**
   * Build a LWPOLYLINE entity string.
   *
   * @param {Array<[number,number]>} vertices - Array of [x, y] coordinate pairs
   * @param {string} layerName - DXF layer name
   * @param {boolean} closed - Whether the polyline is closed (flag 1)
   * @returns {string} DXF entity string
   */
  _lwpolyline(vertices, layerName, closed = true) {
    const lines = [
      '0', 'LWPOLYLINE',
      '8', layerName,                          // layer
      '90', String(vertices.length),           // vertex count
      '70', closed ? '1' : '0',               // flags: 1 = closed
    ];

    for (const [x, y] of vertices) {
      lines.push(
        '10', x.toFixed(4),   // X coordinate
        '20', y.toFixed(4),   // Y coordinate
      );
    }

    return lines.join('\n') + '\n';
  }
}
