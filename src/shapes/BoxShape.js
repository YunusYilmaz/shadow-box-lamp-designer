/**
 * BoxShape — Defines the box perimeter as N flat wall segments.
 *
 * Each segment is defined by:
 *   - p1: start point [x, y]
 *   - p2: end point [x, y]
 *   - normal: outward normal [nx, ny]
 *   - width: segment length (mm)
 *   - color: display color hex
 *   - name: label
 *
 * The shape is a closed polygon on the XY floor plane.
 * LED is always at (0, 0, hL) — center of the shape.
 *
 * Shapes available:
 *   square     — 4 equal sides
 *   rectangle  — 4 sides, different width/depth
 *   cylinder   — N-gon approximation of circle
 *   heart      — heart-shaped perimeter
 *   star       — 5-pointed star
 */

const COLORS_4 = ['#4A90D9', '#D94A6B', '#4AD9A7', '#D9C34A'];
const NAMES_4 = ['Front', 'Right', 'Back', 'Left'];

function makeColor(i, total) {
  const hue = (i / total) * 360;
  return `hsl(${hue}, 60%, 55%)`;
}

function makeName(i, total) {
  if (total <= 4) return NAMES_4[i] || `Wall ${i}`;
  return `W${i + 1}`;
}

function segmentFromPoints(p1, p2, i, total) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  // Outward normal (perpendicular, pointing away from center)
  const nx = dy / len;
  const ny = -dx / len;
  return {
    p1: [...p1],
    p2: [...p2],
    normal: [nx, ny],
    width: len,
    color: total <= 4 ? COLORS_4[i] : makeColor(i, total),
    name: makeName(i, total),
    index: i,
  };
}

export class BoxShape {
  /**
   * @param {string} type — 'square' | 'rectangle' | 'cylinder' | 'heart' | 'star'
   * @param {object} params
   *   square:    { size: 120 }
   *   rectangle: { width: 150, depth: 100 }
   *   cylinder:  { diameter: 120, segments: 12 }
   *   heart:     { size: 120, segments: 24 }
   *   star:      { outerR: 60, innerR: 30, points: 5 }
   */
  constructor(type = 'square', params = {}) {
    this.type = type;
    this.params = params;
    this.segments = [];
    this._build();
  }

  get wallCount() { return this.segments.length; }

  /** Total perimeter length */
  get perimeter() {
    return this.segments.reduce((sum, s) => sum + s.width, 0);
  }

  /** Max distance from center to any vertex */
  get maxRadius() {
    let r = 0;
    for (const s of this.segments) {
      r = Math.max(r, Math.hypot(s.p1[0], s.p1[1]));
      r = Math.max(r, Math.hypot(s.p2[0], s.p2[1]));
    }
    return r;
  }

  /** Get all vertices (closed polygon) */
  get vertices() {
    const verts = this.segments.map(s => s.p1);
    return verts;
  }

  _build() {
    switch (this.type) {
      case 'square': this._buildSquare(); break;
      case 'rectangle': this._buildRectangle(); break;
      case 'cylinder': this._buildCylinder(); break;
      case 'heart': this._buildHeart(); break;
      case 'star': this._buildStar(); break;
      default: this._buildSquare();
    }
  }

  _buildSquare() {
    const size = this.params.size || 120;
    const a = size / 2;
    const corners = [
      [-a, a], [a, a], [a, -a], [-a, -a]
    ];
    this.segments = [];
    for (let i = 0; i < 4; i++) {
      const p1 = corners[i];
      const p2 = corners[(i + 1) % 4];
      this.segments.push(segmentFromPoints(p1, p2, i, 4));
    }
  }

  _buildRectangle() {
    const w = this.params.width || 150;
    const d = this.params.depth || 100;
    const hw = w / 2, hd = d / 2;
    const corners = [
      [-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]
    ];
    this.segments = [];
    for (let i = 0; i < 4; i++) {
      const p1 = corners[i];
      const p2 = corners[(i + 1) % 4];
      this.segments.push(segmentFromPoints(p1, p2, i, 4));
    }
  }

  _buildCylinder() {
    const diameter = this.params.diameter || 120;
    const R = diameter / 2;
    const N = this.params.segments || 16;
    this.segments = [];
    for (let i = 0; i < N; i++) {
      const a1 = (i / N) * Math.PI * 2 + Math.PI / 2; // start from top
      const a2 = ((i + 1) / N) * Math.PI * 2 + Math.PI / 2;
      const p1 = [R * Math.cos(a1), R * Math.sin(a1)];
      const p2 = [R * Math.cos(a2), R * Math.sin(a2)];
      this.segments.push(segmentFromPoints(p1, p2, i, N));
    }
  }

  _buildHeart() {
    const size = this.params.size || 120;
    const N = this.params.segments || 24;
    const scale = size / 120;

    // Heart parametric curve
    const heartPoint = (t) => {
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      return [x * scale * 3.5, y * scale * 3.5];
    };

    const points = [];
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      points.push(heartPoint(t));
    }

    this.segments = [];
    for (let i = 0; i < N; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % N];
      this.segments.push(segmentFromPoints(p1, p2, i, N));
    }
  }

  _buildStar() {
    const outerR = this.params.outerR || 60;
    const innerR = this.params.innerR || 28;
    const pts = this.params.points || 5;
    const N = pts * 2;

    const points = [];
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      points.push([r * Math.cos(angle), r * Math.sin(angle)]);
    }

    this.segments = [];
    for (let i = 0; i < N; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % N];
      this.segments.push(segmentFromPoints(p1, p2, i, N));
    }
  }

  /**
   * For a given floor point (gx, gy), find which wall segment
   * a ray from LED (0,0,hL) to floor (gx,gy,0) passes through.
   *
   * Returns { segIdx, s, wz } or null
   *   segIdx: wall segment index
   *   s: parameter along segment [0,1]
   *   wz: height where ray intersects wall plane
   */
  reverseProject(gx, gy, hL) {
    // Ray from (0,0,hL) to (gx,gy,0): P(t) = (t*gx, t*gy, hL*(1-t))
    // Find intersection with each wall segment's infinite line,
    // then check if intersection is within segment bounds

    let bestT = Infinity;
    let result = null;

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const [x1, y1] = seg.p1;
      const [x2, y2] = seg.p2;

      // Wall segment line: P = p1 + u*(p2-p1), u ∈ [0,1]
      // Ray on floor: R(t) = (t*gx, t*gy), t ∈ [0,1]
      //
      // Solve: t*gx = x1 + u*(x2-x1)
      //        t*gy = y1 + u*(y2-y1)

      const dx = x2 - x1;
      const dy = y2 - y1;

      // Cramer's rule: det = gx*dy - gy*dx
      const det = gx * dy - gy * dx;
      if (Math.abs(det) < 1e-10) continue; // parallel

      // t = (x1*dy - y1*dx) / det ... wait, let me redo this
      // t*gx - u*dx = x1
      // t*gy - u*dy = y1
      // [gx, -dx] [t]   [x1]
      // [gy, -dy] [u] = [y1]
      // det = gx*(-dy) - (-dx)*gy = -gx*dy + dx*gy = -(gx*dy - dx*gy)
      const D = -(gx * dy - dx * gy);
      if (Math.abs(D) < 1e-10) continue;

      const t = -(x1 * (-dy) - (-dx) * y1) / D;
      const u = -(gx * y1 - gy * x1) / D;

      if (t < 0 || t > 1 || u < 0 || u > 1) continue;

      // Height at intersection
      const wz = hL * (1 - t);

      if (t < bestT && wz >= 0) {
        bestT = t;
        result = { segIdx: i, s: u, wz };
      }
    }

    return result;
  }

  /**
   * Forward project: given wall segment index, position s, and height wz,
   * compute the floor point where the shadow falls.
   */
  forwardProject(segIdx, s, wz, hL) {
    const seg = this.segments[segIdx];
    const [x1, y1] = seg.p1;
    const [x2, y2] = seg.p2;

    const wx = x1 + s * (x2 - x1);
    const wy = y1 + s * (y2 - y1);

    if (wz >= hL - 0.01) return null;
    const t = hL / (hL - wz);
    return { gx: wx * t, gy: wy * t };
  }

  /**
   * Get wall point at segment index and parameter s
   */
  wallPoint(segIdx, s) {
    const seg = this.segments[segIdx];
    return {
      x: seg.p1[0] + s * (seg.p2[0] - seg.p1[0]),
      y: seg.p1[1] + s * (seg.p2[1] - seg.p1[1]),
    };
  }

  /** Serialize for worker transfer */
  toTransferable() {
    return {
      type: this.type,
      wallCount: this.segments.length,
      segments: this.segments.map(s => ({
        p1: s.p1,
        p2: s.p2,
        width: s.width,
        index: s.index,
      })),
    };
  }
}

/** Preset shape configurations */
export const SHAPE_PRESETS = {
  square:    { label: 'Square (4 walls)',    type: 'square',    params: { size: 120 } },
  rectangle: { label: 'Rectangle (4 walls)', type: 'rectangle', params: { width: 150, depth: 100 } },
  cylinder:  { label: 'Cylinder (16 walls)', type: 'cylinder',  params: { diameter: 120, segments: 16 } },
  heart:     { label: 'Heart (24 walls)',     type: 'heart',     params: { size: 120, segments: 24 } },
  star:      { label: 'Star (10 walls)',      type: 'star',      params: { outerR: 60, innerR: 28, points: 5 } },
};
