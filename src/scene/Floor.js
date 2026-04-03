import * as THREE from 'three';

export class Floor {
  constructor(scene) {
    this.scene = scene;

    // Floor plane — neutral tone so colored projections are visible
    const floorGeo = new THREE.PlaneGeometry(1200, 1200);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1e1e35,
      roughness: 0.9,
      metalness: 0.0,
    });
    this.floor = new THREE.Mesh(floorGeo, floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0;
    this.floor.receiveShadow = true;
    scene.add(this.floor);
  }

  dispose() {
    this.scene.remove(this.floor);
    this.floor.geometry.dispose();
    this.floor.material.dispose();
  }
}
