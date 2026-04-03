import * as THREE from 'three';
import { WALL_COLORS, A } from '../constants.js';

const THICKNESS = 3; // 3mm MDF

/**
 * Renders walls with 3mm thickness and internal holes/cutouts.
 * Each solid cell is a 3D box (extruded quad) that properly casts shadows.
 * Holes are actual gaps in the geometry — light physically passes through.
 */
export class DetailedWallMesh {
  constructor(scene) {
    this.scene = scene;
    this.meshes = [];
    this._created = false;
  }

  update(bitmaps, gridW, gridH, maxWallH, halfSide = A) {
    this.clear();

    for (let w = 0; w < 4; w++) {
      const bitmap = bitmaps[w];
      const color = new THREE.Color(WALL_COLORS[w]);

      const geometry = this._buildThickWall(bitmap, gridW, gridH, w, halfSide, maxWallH);

      if (geometry) {
        const material = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.08,
          roughness: 0.8,
          metalness: 0.02,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.meshes.push(mesh);
      }
    }

    this._created = true;
  }

  _buildThickWall(bitmap, gridW, gridH, wallIndex, halfSide, maxWallH) {
    const a = halfSide;
    const cellW = (2 * a) / gridW;
    const cellH = maxWallH / gridH;
    const t = THICKNESS / 2;

    // Wall normal (outward direction)
    const normals = [
      [0, 0, 1],   // Front
      [1, 0, 0],   // Right
      [0, 0, -1],  // Back
      [-1, 0, 0],  // Left
    ];
    const [nx, , nz] = normals[wallIndex];

    const positions = [];
    const indices = [];
    let vtx = 0;

    for (let si = 0; si < gridW; si++) {
      for (let hi = 0; hi < gridH; hi++) {
        if (bitmap[hi * gridW + si] === 0) continue;

        const s0 = si / gridW;
        const s1 = (si + 1) / gridW;
        const h0 = (hi / gridH) * maxWallH;
        const h1 = ((hi + 1) / gridH) * maxWallH;

        // Wall centerline corners
        const corners2D = [[s0, h0], [s1, h0], [s1, h1], [s0, h1]];
        const inner = [];
        const outer = [];

        for (const [s, h] of corners2D) {
          let x, z;
          switch (wallIndex) {
            case 0: x = -a + s * 2 * a; z = a; break;
            case 1: x = a; z = a - s * 2 * a; break;
            case 2: x = a - s * 2 * a; z = -a; break;
            case 3: x = -a; z = -a + s * 2 * a; break;
          }
          inner.push(x - nx * t, h, z - nz * t);
          outer.push(x + nx * t, h, z + nz * t);
        }

        // 8 vertices: inner corners 0-3, outer corners 4-7
        // inner/outer are flat arrays: [x0,y0,z0, x1,y1,z1, x2,y2,z2, x3,y3,z3]
        const base = vtx;
        for (let vi = 0; vi < 12; vi++) positions.push(inner[vi]);  // vertices 0,1,2,3
        for (let vi = 0; vi < 12; vi++) positions.push(outer[vi]);  // vertices 4,5,6,7
        vtx += 8;

        // Inner face (0,1,2,3) — facing inward
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        // Outer face (4,5,6,7) — facing outward
        indices.push(base + 4, base + 6, base + 5, base + 4, base + 7, base + 6);
        // Top face (3,2,6,7)
        indices.push(base + 3, base + 2, base + 6, base + 3, base + 6, base + 7);
        // Bottom face (0,4,1,5)
        indices.push(base, base + 4, base + 1, base + 1, base + 4, base + 5);

        // Side faces — only if neighbor is hole/edge (to save polygons)
        // Left side (0,3,4,7)
        if (si === 0 || bitmap[hi * gridW + (si - 1)] === 0) {
          indices.push(base, base + 3, base + 4, base + 3, base + 7, base + 4);
        }
        // Right side (1,2,5,6)
        if (si === gridW - 1 || bitmap[hi * gridW + (si + 1)] === 0) {
          indices.push(base + 1, base + 5, base + 2, base + 2, base + 5, base + 6);
        }
        // Bottom-height side (0,1,4,5) — if below is hole
        if (hi === 0 || bitmap[(hi - 1) * gridW + si] === 0) {
          indices.push(base, base + 1, base + 4, base + 1, base + 5, base + 4);
        }
        // Top-height side (2,3,6,7) — if above is hole
        if (hi === gridH - 1 || bitmap[(hi + 1) * gridW + si] === 0) {
          indices.push(base + 2, base + 6, base + 3, base + 3, base + 6, base + 7);
        }
      }
    }

    if (positions.length === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  setVisible(visible) {
    for (const m of this.meshes) m.visible = visible;
  }

  clear() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this.meshes = [];
    this._created = false;
  }

  get isCreated() { return this._created; }
  dispose() { this.clear(); }
}
