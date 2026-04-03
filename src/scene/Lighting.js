import * as THREE from 'three';
import { H_L } from '../constants.js';

export class Lighting {
  constructor(scene) {
    this.scene = scene;

    // Ambient — moderate so walls are visible but shadows are clear
    this.ambient = new THREE.AmbientLight(0x556688, 0.4);
    scene.add(this.ambient);

    // Hemisphere light — subtle sky/ground fill
    this.hemiLight = new THREE.HemisphereLight(0x4466aa, 0x222233, 0.3);
    scene.add(this.hemiLight);

    // LED point light — the main shadow-casting light
    // Higher intensity, configured for proper shadow mapping
    this.ledLight = new THREE.PointLight(0xffe066, 5, 1000, 1.0);
    this.ledLight.position.set(0, H_L, 0);
    this.ledLight.castShadow = true;
    this.ledLight.shadow.mapSize.set(2048, 2048); // high-res shadow map
    this.ledLight.shadow.radius = 2;
    this.ledLight.shadow.bias = -0.001;
    this.ledLight.shadow.normalBias = 0.02;
    this.ledLight.shadow.camera.near = 1;
    this.ledLight.shadow.camera.far = 500;
    scene.add(this.ledLight);

    // LED glow sphere
    const glowGeo = new THREE.SphereGeometry(2.5, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    this.ledMesh = new THREE.Mesh(glowGeo, glowMat);
    this.ledMesh.position.copy(this.ledLight.position);
    scene.add(this.ledMesh);

    // Fill light — gentle, from above-front, no shadows
    this.fillLight = new THREE.DirectionalLight(0x8899bb, 0.35);
    this.fillLight.position.set(120, 200, 180);
    this.fillLight.castShadow = false;
    scene.add(this.fillLight);

    // Back fill — opposite side
    this.backFill = new THREE.DirectionalLight(0x556677, 0.2);
    this.backFill.position.set(-120, 160, -120);
    this.backFill.castShadow = false;
    scene.add(this.backFill);
  }

  setLedHeight(h) {
    this.ledLight.position.y = h;
    this.ledMesh.position.y = h;
  }

  dispose() {
    this.scene.remove(this.ledLight);
    this.scene.remove(this.ledMesh);
    this.scene.remove(this.ambient);
    this.scene.remove(this.hemiLight);
    this.scene.remove(this.fillLight);
    this.scene.remove(this.backFill);
  }
}
