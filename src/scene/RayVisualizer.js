import * as THREE from 'three';
import { forwardProject } from '../solver/ForwardProjection.js';
import { A, H_L } from '../constants.js';

export class RayVisualizer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  update(profiles, halfSide = A, ledHeight = H_L) {
    this.clear();
    if (!profiles) return;

    const a = halfSide;
    const N = profiles[0].length;
    const step = Math.max(1, Math.floor(N / 30)); // ~30 rays per wall
    const ledPos = new THREE.Vector3(0, ledHeight, 0);
    const rayMat = new THREE.LineBasicMaterial({
      color: 0xffe066,
      transparent: true,
      opacity: 0.12,
    });

    for (let w = 0; w < 4; w++) {
      for (let i = 0; i < N; i += step) {
        const s = i / (N - 1);
        const wz = profiles[w][i];
        let wx, wy;

        switch (w) {
          case 0: wx = -a + s * 2 * a; wy = a; break;
          case 1: wx = a; wy = a - s * 2 * a; break;
          case 2: wx = a - s * 2 * a; wy = -a; break;
          case 3: wx = -a; wy = -a + s * 2 * a; break;
        }

        const wallPt = new THREE.Vector3(wx, wz, wy);
        const proj = forwardProject(wx, wy, wz, ledHeight);
        if (!proj) continue;
        const floorPt = new THREE.Vector3(proj.gx, 0, proj.gy);

        const geo = new THREE.BufferGeometry().setFromPoints([ledPos, wallPt, floorPt]);
        this.group.add(new THREE.Line(geo, rayMat));
      }
    }
  }

  clear() {
    while (this.group.children.length) {
      const child = this.group.children[0];
      child.geometry.dispose();
      this.group.remove(child);
    }
  }

  setVisible(v) {
    this.group.visible = v;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}
