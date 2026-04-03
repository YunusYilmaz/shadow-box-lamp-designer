import * as THREE from 'three';
import { A, H_L, H_W, WALL_COLORS } from '../constants.js';

/**
 * Floor annotations:
 * 1. Colored wall projection footprints (darker shade of wall color)
 * 2. Distance circles every 10mm with radius labels
 * 3. Light spread diameter indicator
 */
export class FloorAnnotations {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.y = 0.1; // just above floor
    scene.add(this.group);

    this._buildDistanceCircles();
    this._buildWallProjections(A, H_W, H_L);
  }

  /**
   * Build concentric distance circles on floor (10mm intervals)
   */
  _buildDistanceCircles() {
    const maxR = 300; // mm
    const step = 10;  // mm

    for (let r = step; r <= maxR; r += step) {
      const segments = Math.max(32, Math.round(r * 0.8));
      const points = [];
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(r * Math.cos(theta), 0, r * Math.sin(theta)));
      }

      const isMajor = r % 50 === 0;
      const isMedium = r % 20 === 0;
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: isMajor ? 0x556688 : 0x2a3a55,
        transparent: true,
        opacity: isMajor ? 0.5 : isMedium ? 0.3 : 0.15,
      });
      const line = new THREE.Line(geo, mat);
      line.rotation.x = 0; // already on XZ plane
      this.group.add(line);

      // Radius label every 50mm (or 20mm for closer ones)
      if (isMajor || (r <= 100 && isMedium)) {
        this._addLabel(`${r}`, r + 2, 0, isMajor ? 0.7 : 0.4);
      }
    }
  }

  /**
   * Add text label on floor using canvas texture
   */
  _addLabel(text, x, z, opacity = 0.5) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 24;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 12);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, 1, z);
    sprite.scale.set(12, 5, 1);
    this.group.add(sprite);
  }

  /**
   * Build wall projection footprints on the floor
   * Each wall projects a colored trapezoid from its base outward
   */
  _buildWallProjections(halfSide, wallHeight, ledHeight) {
    // Clear old projections
    this._clearProjections();

    const a = halfSide;
    const hL = ledHeight;
    const hW = wallHeight;
    const mag = hL / (hL - hW);

    // Wall normal directions and wall line endpoints
    const wallDefs = [
      // Front wall: y=+a, x from -a to +a
      { p1: [-a, a], p2: [a, a], color: WALL_COLORS[0] },
      // Right wall: x=+a, y from +a to -a
      { p1: [a, a], p2: [a, -a], color: WALL_COLORS[1] },
      // Back wall: y=-a, x from +a to -a
      { p1: [a, -a], p2: [-a, -a], color: WALL_COLORS[2] },
      // Left wall: x=-a, y from -a to +a
      { p1: [-a, -a], p2: [-a, a], color: WALL_COLORS[3] },
    ];

    for (const def of wallDefs) {
      // Inner edge = wall base line (at floor level, inside box)
      const inner1 = def.p1;
      const inner2 = def.p2;

      // Outer edge = projection of wall top at max height (h_W)
      // forward project: t = hL/(hL-hW) = mag
      const outer1 = [inner1[0] * mag, inner1[1] * mag];
      const outer2 = [inner2[0] * mag, inner2[1] * mag];

      // Create trapezoid shape (inner edge → outer edge)
      const shape = new THREE.Shape();
      // In XZ plane (floor), x=right, z=forward
      // Map: real x → Three.js x, real y → Three.js z
      shape.moveTo(inner1[0], inner1[1]);
      shape.lineTo(inner2[0], inner2[1]);
      shape.lineTo(outer2[0], outer2[1]);
      shape.lineTo(outer1[0], outer1[1]);
      shape.closePath();

      const geo = new THREE.ShapeGeometry(shape);
      const color = new THREE.Color(def.color);
      // Darken the color significantly
      color.multiplyScalar(0.25);

      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.08;
      mesh._isProjection = true;
      this.group.add(mesh);

      // Projection outline
      const outlinePoints = [
        new THREE.Vector3(inner1[0], 0, inner1[1]),
        new THREE.Vector3(outer1[0], 0, outer1[1]),
        new THREE.Vector3(outer2[0], 0, outer2[1]),
        new THREE.Vector3(inner2[0], 0, inner2[1]),
        new THREE.Vector3(inner1[0], 0, inner1[1]),
      ];
      const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePoints);
      const outlineMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(def.color).multiplyScalar(0.5),
        transparent: true,
        opacity: 0.4,
      });
      const outline = new THREE.Line(outlineGeo, outlineMat);
      outline.position.y = 0.12;
      outline._isProjection = true;
      this.group.add(outline);
    }

    // Light spread circle (max shadow radius)
    const maxShadowR = a * mag;
    this._addCircleIndicator(maxShadowR, 0xffe066, 0.5, `⌀${Math.round(maxShadowR * 2)}mm`);

    // Box footprint outline
    const boxOutline = [
      new THREE.Vector3(-a, 0.15, -a),
      new THREE.Vector3(a, 0.15, -a),
      new THREE.Vector3(a, 0.15, a),
      new THREE.Vector3(-a, 0.15, a),
      new THREE.Vector3(-a, 0.15, -a),
    ];
    const boxGeo = new THREE.BufferGeometry().setFromPoints(boxOutline);
    const boxMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
    const boxLine = new THREE.Line(boxGeo, boxMat);
    boxLine._isProjection = true;
    this.group.add(boxLine);
  }

  _addCircleIndicator(radius, color, opacity, label) {
    const segments = 80;
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(radius * Math.cos(theta), 0.2, radius * Math.sin(theta)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineDashedMaterial({
      color,
      transparent: true,
      opacity,
      dashSize: 4,
      gapSize: 3,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    line._isProjection = true;
    this.group.add(line);

    if (label) {
      this._addLabel(label, radius + 8, 0, 0.7);
    }
  }

  _clearProjections() {
    const toRemove = [];
    for (const child of this.group.children) {
      if (child._isProjection) toRemove.push(child);
    }
    for (const obj of toRemove) {
      this.group.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }
  }

  /**
   * Update projections when geometry changes
   */
  update(halfSide = A, wallHeight = H_W, ledHeight = H_L) {
    this._buildWallProjections(halfSide, wallHeight, ledHeight);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
  }
}
