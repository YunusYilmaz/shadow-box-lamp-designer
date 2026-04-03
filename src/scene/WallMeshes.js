import * as THREE from 'three';
import { A, H_W, WALL_COLORS } from '../constants.js';

const THICKNESS = 3; // 3mm MDF

export class WallMeshes {
  constructor(scene) {
    this.scene = scene;
    this.layerGroups = new Map();
    this._createLayer('default', A, H_W);
  }

  /**
   * Create a 3mm-thick wall geometry with a curved top profile.
   * Generates: inner face, outer face, top edge, bottom edge, side caps.
   */
  _createWallGeometry(wallIndex, profile, halfSide, profilePoints, fallbackHeight = H_W) {
    const N = profilePoints || (profile ? profile.length : 200);
    const a = halfSide;
    const t = THICKNESS / 2; // half-thickness offset

    // Normal direction for each wall (pointing outward)
    const normals = [
      [0, 0, 1],   // Front: +z
      [1, 0, 0],   // Right: +x
      [0, 0, -1],  // Back: -z
      [-1, 0, 0],  // Left: -x
    ];
    const [nx, , nz] = normals[wallIndex];

    const positions = [];
    const indices = [];

    // For each sample point, we have 4 vertices:
    //   inner-bottom, inner-top, outer-bottom, outer-top
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1);
      const wz = profile ? profile[i] : fallbackHeight;
      let x, z;

      switch (wallIndex) {
        case 0: x = -a + s * 2 * a; z = a; break;
        case 1: x = a; z = a - s * 2 * a; break;
        case 2: x = a - s * 2 * a; z = -a; break;
        case 3: x = -a; z = -a + s * 2 * a; break;
      }

      // Inner face (toward box center)
      const ix = x - nx * t;
      const iz = z - nz * t;
      // Outer face (away from box center)
      const ox = x + nx * t;
      const oz = z + nz * t;

      // 4 vertices per sample: inner-bot, inner-top, outer-bot, outer-top
      positions.push(
        ix, 0, iz,     // [i*4 + 0] inner bottom
        ix, wz, iz,    // [i*4 + 1] inner top
        ox, 0, oz,     // [i*4 + 2] outer bottom
        ox, wz, oz,    // [i*4 + 3] outer top
      );
    }

    // Generate faces
    for (let i = 0; i < N - 1; i++) {
      const a0 = i * 4, a1 = (i + 1) * 4;
      // Inner face (facing inward)
      indices.push(a0, a1, a0 + 1, a0 + 1, a1, a1 + 1);
      // Outer face (facing outward)
      indices.push(a0 + 2, a0 + 3, a1 + 2, a0 + 3, a1 + 3, a1 + 2);
      // Top face (connecting inner-top to outer-top)
      indices.push(a0 + 1, a1 + 1, a0 + 3, a0 + 3, a1 + 1, a1 + 3);
      // Bottom face
      indices.push(a0, a0 + 2, a1, a1, a0 + 2, a1 + 2);
    }

    // Left cap (i=0)
    indices.push(0, 2, 1, 1, 2, 3);
    // Right cap (i=N-1)
    const last = (N - 1) * 4;
    indices.push(last, last + 1, last + 2, last + 1, last + 3, last + 2);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  _createLayer(layerId, halfSide, wallHeight) {
    const layerIndex = this.layerGroups.size;
    const opacityFactor = layerIndex === 0 ? 1.0 : 0.7;

    const meshes = [];
    const materials = WALL_COLORS.map(c => {
      const color = new THREE.Color(c);
      return new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.1,
        roughness: 0.75,
        metalness: 0.05,
        side: THREE.DoubleSide,
        transparent: opacityFactor < 1,
        opacity: opacityFactor,
      });
    });

    for (let i = 0; i < 4; i++) {
      const geo = this._createWallGeometry(i, null, halfSide, 200, wallHeight);
      const mesh = new THREE.Mesh(geo, materials[i]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      meshes.push(mesh);
    }

    this.layerGroups.set(layerId, { meshes, materials, halfSide });
    return { meshes };
  }

  /**
   * N-wall native: use boxShape segments + layer.wallProfiles (already N-dimensional).
   * Profiles[i] corresponds to segment[i] directly — no mapping needed.
   */
  updateFromSegments(boxShape, layer) {
    if (!boxShape || !layer) return;
    const layerId = layer.id || 'default';
    const profiles = layer.wallProfiles; // N profiles from N-wall solver
    const wallHeight = layer.wallHeight || H_W;
    const N = boxShape.wallCount;

    let group = this.layerGroups.get(layerId);
    if (!group || group.meshes.length !== N) {
      this.removeLayer(layerId);
      const meshes = [];
      const materials = [];
      for (let i = 0; i < N; i++) {
        const seg = boxShape.segments[i];
        const color = new THREE.Color(seg.color);
        const mat = new THREE.MeshStandardMaterial({
          color, emissive: color, emissiveIntensity: 0.1,
          roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide,
        });
        materials.push(mat);
        const profile = profiles ? profiles[i] : null;
        const geo = this._createSegmentGeometry(seg, wallHeight, 200, profile);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        meshes.push(mesh);
      }
      this.layerGroups.set(layerId, { meshes, materials, halfSide: boxShape.maxRadius });
    } else {
      // Update geometry only
      for (let i = 0; i < N; i++) {
        const seg = boxShape.segments[i];
        const profile = profiles ? profiles[i] : null;
        const geo = this._createSegmentGeometry(seg, wallHeight, 200, profile);
        group.meshes[i].geometry.dispose();
        group.meshes[i].geometry = geo;
      }
    }
  }

  /**
   * N-wall with bitmap holes: creates wall meshes where solid cells are rendered
   * and hole cells are removed from geometry. This shows internal detail.
   */
  updateFromSegmentsWithBitmaps(boxShape, layer, bitmapData) {
    if (!boxShape || !layer || !bitmapData) return;
    const layerId = layer.id || 'default';
    const { bitmaps, gridW, gridH, maxWallH } = bitmapData;
    const N = boxShape.wallCount;

    // Always rebuild for bitmap mode (geometry is complex)
    this.removeLayer(layerId);
    const meshes = [];
    const materials = [];

    for (let i = 0; i < N; i++) {
      const seg = boxShape.segments[i];
      const color = new THREE.Color(seg.color);
      const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.1,
        roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide,
      });
      materials.push(mat);

      const bitmap = bitmaps[i];
      const geo = bitmap
        ? this._createSegmentBitmapGeometry(seg, bitmap, gridW, gridH, maxWallH)
        : this._createSegmentGeometry(seg, layer.wallHeight || H_W, 200);

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      meshes.push(mesh);
    }

    this.layerGroups.set(layerId, { meshes, materials, halfSide: boxShape.maxRadius });
  }

  /**
   * Create geometry for a wall segment with bitmap holes.
   * Only solid cells (bitmap=1) generate quads; holes are skipped.
   */
  _createSegmentBitmapGeometry(seg, bitmap, gridW, gridH, maxWallH) {
    const [x1, y1] = seg.p1;
    const [x2, y2] = seg.p2;
    const [nx, ny] = seg.normal;
    const t = THICKNESS / 2;

    const positions = [];
    const indices = [];
    let vtxCount = 0;

    for (let si = 0; si < gridW; si++) {
      for (let hi = 0; hi < gridH; hi++) {
        if (bitmap[hi * gridW + si] === 0) continue; // hole — skip

        const s0 = si / gridW;
        const s1 = (si + 1) / gridW;
        const h0 = (hi / gridH) * maxWallH;
        const h1 = ((hi + 1) / gridH) * maxWallH;

        // 4 corners of this cell on the wall surface
        const corners = [];
        for (const [s, h] of [[s0, h0], [s1, h0], [s1, h1], [s0, h1]]) {
          const px = x1 + s * (x2 - x1);
          const pz = y1 + s * (y2 - y1);

          // Inner and outer positions (3mm thickness)
          const ix = px - nx * t;
          const iz = pz - ny * t;
          const ox = px + nx * t;
          const oz = pz + ny * t;

          corners.push({ ix, iz, ox, oz, y: h });
        }

        // Add outer face quad (4 vertices)
        const base = vtxCount;
        for (const c of corners) {
          positions.push(c.ox, c.y, c.oz);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        vtxCount += 4;

        // Add inner face quad (reversed winding)
        const base2 = vtxCount;
        for (const c of corners) {
          positions.push(c.ix, c.y, c.iz);
        }
        indices.push(base2, base2 + 2, base2 + 1, base2, base2 + 3, base2 + 2);
        vtxCount += 4;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * DEPRECATED: Build wall meshes from BoxShape with profile data mapped onto segments.
   * The 4-wall profiles are distributed across N segments based on perimeter position.
   */
  updateFromShapeWithProfiles(boxShape, layer) {
    if (!boxShape || !layer) return;
    const layerId = layer.id || 'default';
    const profiles = layer.wallProfiles;
    const wallHeight = layer.wallHeight || H_W;
    const N = boxShape.wallCount;

    // Check if we already have the right number of meshes
    let group = this.layerGroups.get(layerId);
    if (!group || group.meshes.length !== N) {
      this.removeLayer(layerId);
      group = null;
    }

    if (!group) {
      // Create new meshes for each segment
      const meshes = [];
      const materials = [];

      for (let i = 0; i < N; i++) {
        const seg = boxShape.segments[i];
        const color = new THREE.Color(seg.color);
        const mat = new THREE.MeshStandardMaterial({
          color, emissive: color, emissiveIntensity: 0.1,
          roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide,
        });
        materials.push(mat);

        // Map profile onto this segment
        const segProfile = this._mapProfileToSegment(profiles, boxShape, i, 200);
        const geo = this._createSegmentGeometry(seg, wallHeight, 200, segProfile);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        meshes.push(mesh);
      }

      this.layerGroups.set(layerId, { meshes, materials, halfSide: boxShape.maxRadius });
    } else {
      // Update geometry only
      for (let i = 0; i < N; i++) {
        const seg = boxShape.segments[i];
        const segProfile = this._mapProfileToSegment(profiles, boxShape, i, 200);
        const geo = this._createSegmentGeometry(seg, wallHeight, 200, segProfile);
        group.meshes[i].geometry.dispose();
        group.meshes[i].geometry = geo;
      }
    }
  }

  /**
   * Map 4-wall profiles onto a single segment of the shape.
   * Each segment corresponds to a portion of the perimeter.
   * We sample the profiles based on angle from center.
   */
  _mapProfileToSegment(profiles, boxShape, segIdx, sampleCount) {
    if (!profiles) return null;

    const seg = boxShape.segments[segIdx];
    const result = new Float64Array(sampleCount);
    const N4 = profiles[0].length; // profile points per original wall

    for (let i = 0; i < sampleCount; i++) {
      const s = i / (sampleCount - 1);
      const px = seg.p1[0] + s * (seg.p2[0] - seg.p1[0]);
      const py = seg.p1[1] + s * (seg.p2[1] - seg.p1[1]);

      // Map angle to the 4 original walls using atan2
      const angle = Math.atan2(py, px); // -PI..PI

      let wallIdx, wallS;

      if (angle >= Math.PI / 4 && angle < 3 * Math.PI / 4) {
        // Front wall (y=+a): angle PI/4 to 3PI/4
        wallIdx = 0;
        wallS = (angle - Math.PI / 4) / (Math.PI / 2);
      } else if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
        // Right wall (x=+a): angle -PI/4 to PI/4
        wallIdx = 1;
        wallS = (angle + Math.PI / 4) / (Math.PI / 2);
      } else if (angle >= -3 * Math.PI / 4 && angle < -Math.PI / 4) {
        // Back wall (y=-a): angle -3PI/4 to -PI/4
        wallIdx = 2;
        wallS = (angle + 3 * Math.PI / 4) / (Math.PI / 2);
      } else {
        // Left wall (x=-a): angle 3PI/4 to PI and -PI to -3PI/4
        wallIdx = 3;
        const a2 = angle < 0 ? angle + 2 * Math.PI : angle; // wrap to 0..2PI
        wallS = (a2 - 3 * Math.PI / 4) / (Math.PI / 2);
      }

      wallS = Math.max(0, Math.min(1, wallS));
      const pIdx = Math.min(N4 - 1, Math.round(wallS * (N4 - 1)));
      result[i] = profiles[wallIdx][pIdx];
    }

    return result;
  }

  /**
   * Build wall meshes from a BoxShape (N segments of any shape).
   * Each segment gets its own mesh with proper position/rotation.
   */
  updateFromShape(boxShape, layer) {
    if (!boxShape || !layer) return;
    const layerId = layer.id || 'default';

    // Remove old
    this.removeLayer(layerId);

    const meshes = [];
    const materials = [];
    const wallHeight = layer.wallHeight || H_W;

    for (let i = 0; i < boxShape.wallCount; i++) {
      const seg = boxShape.segments[i];

      // Create material with segment color
      const color = new THREE.Color(seg.color);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.1,
        roughness: 0.75,
        metalness: 0.05,
        side: THREE.DoubleSide,
      });
      materials.push(mat);

      // Build geometry: flat wall panel from p1 to p2, height = wallHeight
      const geo = this._createSegmentGeometry(seg, wallHeight, 200);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      meshes.push(mesh);
    }

    this.layerGroups.set(layerId, { meshes, materials, halfSide: boxShape.maxRadius });
  }

  /**
   * Create geometry for a single wall segment defined by two endpoints.
   * The wall is a flat panel with optional profile curve on top.
   */
  _createSegmentGeometry(seg, wallHeight, N = 200, profile = null) {
    const [x1, y1] = seg.p1;
    const [x2, y2] = seg.p2;
    const [nx, ny] = seg.normal;
    const t = THICKNESS / 2;

    const positions = [];
    const indices = [];

    for (let i = 0; i < N; i++) {
      const s = i / (N - 1);
      const px = x1 + s * (x2 - x1);
      const pz = y1 + s * (y2 - y1); // y in 2D → z in 3D
      const wz = profile ? profile[Math.min(profile.length - 1, Math.round(s * (profile.length - 1)))] : wallHeight;

      // Inner face (toward center)
      const ix = px - nx * t;
      const iz = pz - ny * t;
      // Outer face (away from center)
      const ox = px + nx * t;
      const oz = pz + ny * t;

      // 4 vertices: inner-bot, inner-top, outer-bot, outer-top
      // Note: Three.js Y = up, so height is Y axis
      // 2D x → Three.js X, 2D y → Three.js Z
      positions.push(
        ix, 0, iz,
        ix, wz, iz,
        ox, 0, oz,
        ox, wz, oz,
      );
    }

    for (let i = 0; i < N - 1; i++) {
      const a0 = i * 4, a1 = (i + 1) * 4;
      indices.push(a0, a1, a0 + 1, a0 + 1, a1, a1 + 1);
      indices.push(a0 + 2, a0 + 3, a1 + 2, a0 + 3, a1 + 3, a1 + 2);
      indices.push(a0 + 1, a1 + 1, a0 + 3, a0 + 3, a1 + 1, a1 + 3);
      indices.push(a0, a0 + 2, a1, a1, a0 + 2, a1 + 2);
    }

    // Side caps
    indices.push(0, 2, 1, 1, 2, 3);
    const last = (N - 1) * 4;
    indices.push(last, last + 1, last + 2, last + 1, last + 3, last + 2);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  updateFromProfiles(profiles, layerId = 'default', halfSide = A, wallHeight = H_W) {
    let group = this.layerGroups.get(layerId);

    if (!group || group.halfSide !== halfSide) {
      if (group) this.removeLayer(layerId);
      group = this._createLayer(layerId, halfSide, wallHeight);
    }

    const N = profiles ? profiles[0].length : 200;
    for (let i = 0; i < 4; i++) {
      const geo = this._createWallGeometry(
        i, profiles ? profiles[i] : null, halfSide, N, wallHeight
      );
      group.meshes[i].geometry.dispose();
      group.meshes[i].geometry = geo;
    }
  }

  removeLayer(layerId) {
    const group = this.layerGroups.get(layerId);
    if (!group) return;
    for (const mesh of group.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.layerGroups.delete(layerId);
  }

  setWireframe(on) {
    for (const [, group] of this.layerGroups) {
      for (const mat of group.materials) {
        mat.wireframe = on;
      }
    }
  }

  setLayerVisible(layerId, visible) {
    const group = this.layerGroups.get(layerId);
    if (!group) return;
    for (const mesh of group.meshes) mesh.visible = visible;
  }

  dispose() {
    for (const [id] of this.layerGroups) {
      this.removeLayer(id);
    }
  }
}
