import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { H_W } from '../constants.js';

export class SceneManager {
  constructor(container) {
    this.container = container;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e0e24);
    this.scene.fog = new THREE.FogExp2(0x0e0e24, 0.0003);

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 5000);
    this.camera.position.set(200, 250, 200);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, H_W / 2, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 60;
    this.controls.maxDistance = 800;

    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(512, 512), 0.5, 0.4, 0.85
    );
    this.composer.addPass(this.bloomPass);

    // Resize
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame(() => this.resize());

    // Animation
    this._animating = true;
    this._animate();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height);
    this.composer.setSize(rect.width, rect.height);
  }

  resetCamera() {
    this.camera.position.set(200, 250, 200);
    this.controls.target.set(0, H_W / 2, 0);
    this.controls.update();
  }

  _animate() {
    if (!this._animating) return;
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.composer.render();
  }

  dispose() {
    this._animating = false;
    this._resizeObserver.disconnect();
    this.renderer.dispose();
    this.composer.dispose();
  }
}
