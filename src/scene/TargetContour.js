import * as THREE from 'three';
import { A, MAG } from '../constants.js';

export class TargetContour {
  constructor(scene) {
    this.scene = scene;
    this.line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({
        color: 0xff3333,
        dashSize: 5,
        gapSize: 3,
        transparent: true,
        opacity: 0.8,
      })
    );
    this.line.position.y = 0.25;
    this.line.rotation.x = -Math.PI / 2;
    this.line.visible = false;
    scene.add(this.line);
  }

  update(contour, halfSide = A, mag = MAG) {
    if (!contour) {
      this.line.visible = false;
      return;
    }

    const N = contour.length;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const idx = i % N;
      const theta = (idx / N) * 2 * Math.PI;
      const r = contour[idx] * halfSide * mag;
      pts.push(new THREE.Vector3(r * Math.cos(theta), r * Math.sin(theta), 0));
    }

    this.line.geometry.dispose();
    this.line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.line.computeLineDistances();
    this.line.visible = true;
  }

  setVisible(v) {
    this.line.visible = v;
  }

  dispose() {
    this.scene.remove(this.line);
    this.line.geometry.dispose();
    this.line.material.dispose();
  }
}
