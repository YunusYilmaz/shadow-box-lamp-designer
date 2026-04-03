import * as THREE from 'three';
import { forwardProject } from '../solver/ForwardProjection.js';
import { A, H_L, WALL_COLORS } from '../constants.js';

/**
 * Shadow overlay using texture-based reverse ray tracing.
 * For each floor pixel, traces a ray back to the LED and checks
 * which wall it passes through and whether that wall cell is solid.
 * Result: smooth, high-resolution shadow with optional Gaussian blur (penumbra).
 */
export class ShadowOverlay {
  constructor(scene) {
    this.scene = scene;

    // ─── Profile mode shadow (polygon) ───
    this.mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.mesh.position.y = 0.15;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
    scene.add(this.mesh);

    // ─── Texture-based shadow plane (detail/bitmap mode) ───
    this.texSize = 512;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.texSize;
    this.canvas.height = this.texSize;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    this.shadowTexture = new THREE.CanvasTexture(this.canvas);
    this.shadowTexture.minFilter = THREE.LinearFilter;
    this.shadowTexture.magFilter = THREE.LinearFilter;
    this.shadowTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.shadowTexture.wrapT = THREE.ClampToEdgeWrapping;

    // Floor plane for texture shadow
    const planeGeo = new THREE.PlaneGeometry(1, 1); // will be resized
    const planeMat = new THREE.MeshBasicMaterial({
      map: this.shadowTexture,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.texPlane = new THREE.Mesh(planeGeo, planeMat);
    this.texPlane.rotation.x = -Math.PI / 2;
    this.texPlane.position.y = 0.2;
    this.texPlane.visible = false;
    scene.add(this.texPlane);

    // ─── Old bitmap group (deprecated, kept for cleanup) ───
    this.bitmapGroup = new THREE.Group();
    this.bitmapGroup.visible = false;
    scene.add(this.bitmapGroup);

    // Blur radius for penumbra softness
    this.blurRadius = 3;
  }

  computeShadowPolygon(profiles, halfSide = A, ledHeight = H_L) {
    if (!profiles) return [];
    const points = [];
    const SAMPLES = 150;
    const a = halfSide;
    const N = profiles[0].length;

    for (let w = 0; w < 4; w++) {
      for (let i = 0; i < SAMPLES; i++) {
        const s = i / (SAMPLES - 1);
        const pIdx = Math.min(N - 1, Math.round(s * (N - 1)));
        const wz = profiles[w][pIdx];

        let wx, wy;
        switch (w) {
          case 0: wx = -a + s * 2 * a; wy = a; break;
          case 1: wx = a; wy = a - s * 2 * a; break;
          case 2: wx = a - s * 2 * a; wy = -a; break;
          case 3: wx = -a; wy = -a + s * 2 * a; break;
        }

        const proj = forwardProject(wx, wy, wz, ledHeight);
        if (proj) {
          points.push({ x: proj.gx, y: proj.gy, angle: Math.atan2(proj.gy, proj.gx) });
        }
      }
    }

    points.sort((a, b) => a.angle - b.angle);
    return points;
  }

  /** Profile mode: single shadow polygon */
  update(profiles, halfSide = A, ledHeight = H_L) {
    this.texPlane.visible = false;
    this.bitmapGroup.visible = false;

    if (!profiles) {
      this.mesh.visible = false;
      return;
    }

    const points = this.computeShadowPolygon(profiles, halfSide, ledHeight);
    if (points.length < 3) {
      this.mesh.visible = false;
      return;
    }

    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x, points[i].y);
    }
    shape.closePath();

    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.ShapeGeometry(shape);
    this.mesh.visible = true;
  }

  /**
   * TEXTURE-BASED BITMAP SHADOW (high quality)
   *
   * For each pixel on the floor texture:
   *   1. Map pixel → floor world coordinates (gx, gy)
   *   2. Reverse ray trace: find which wall the LED→floor ray passes through
   *   3. Compute wall position (s) and intersection height (wz)
   *   4. Look up bitmap[wall][s][wz] → solid or hole
   *   5. If solid → shadow pixel, else → transparent
   *   6. Apply Gaussian blur for soft penumbra edges
   */
  updateFromBitmap(bitmaps, gridW, gridH, maxWallH, halfSide = A, ledHeight = H_L) {
    this.mesh.visible = false;
    this._clearBitmapGroup();

    const a = halfSide;
    const hL = ledHeight;
    const mag = hL / (hL - maxWallH);
    const floorExtent = a * mag * 1.5; // how much floor area to cover

    const T = this.texSize;
    const ctx = this.ctx;

    // Create image data for direct pixel manipulation
    const imgData = ctx.createImageData(T, T);
    const pixels = imgData.data;

    // Wall colors as RGB for tinting
    const wallRGB = WALL_COLORS.map(c => {
      const col = new THREE.Color(c);
      return [
        Math.round(col.r * 60),
        Math.round(col.g * 60),
        Math.round(col.b * 60)
      ];
    });

    // For each floor pixel, reverse-project to wall
    for (let py = 0; py < T; py++) {
      for (let px = 0; px < T; px++) {
        // Map pixel to floor world coords
        // px=0 → -floorExtent, px=T-1 → +floorExtent
        const gx = (px / (T - 1)) * 2 * floorExtent - floorExtent;
        const gy = (py / (T - 1)) * 2 * floorExtent - floorExtent;

        // Determine which wall the ray from LED (0,0,hL) to floor (gx,gy,0) passes through
        const absGx = Math.abs(gx);
        const absGy = Math.abs(gy);

        // Skip points inside the box
        if (absGx <= a && absGy <= a) {
          continue; // no shadow inside box
        }

        let wallIdx = -1;
        let s = 0;
        let wz = 0;

        // Which wall face does the ray exit through?
        if (absGy >= absGx && gy > 0) {
          // Front wall (y = +a)
          wallIdx = 0;
          const t = a / gy;
          const wx = gx * t;
          wz = hL * (1 - t);
          s = (wx + a) / (2 * a);
        } else if (absGx >= absGy && gx > 0) {
          // Right wall (x = +a)
          wallIdx = 1;
          const t = a / gx;
          const wy = gy * t;
          wz = hL * (1 - t);
          s = (a - wy) / (2 * a);
        } else if (absGy >= absGx && gy < 0) {
          // Back wall (y = -a)
          wallIdx = 2;
          const t = -a / gy;
          const wx = gx * t;
          wz = hL * (1 - t);
          s = (a - wx) / (2 * a);
        } else if (absGx >= absGy && gx < 0) {
          // Left wall (x = -a)
          wallIdx = 3;
          const t = -a / gx;
          const wy = gy * t;
          wz = hL * (1 - t);
          s = (wy + a) / (2 * a);
        }

        if (wallIdx < 0 || s < 0 || s > 1 || wz < 0 || wz > maxWallH) {
          continue;
        }

        // Look up bitmap
        const si = Math.min(gridW - 1, Math.floor(s * gridW));
        const hi = Math.min(gridH - 1, Math.floor((wz / maxWallH) * gridH));
        const bitmap = bitmaps[wallIdx];

        if (bitmap[hi * gridW + si] === 1) {
          // Shadow pixel — tint with wall color
          const idx = (py * T + px) * 4;
          const rgb = wallRGB[wallIdx];
          pixels[idx] = rgb[0];
          pixels[idx + 1] = rgb[1];
          pixels[idx + 2] = rgb[2];
          pixels[idx + 3] = 200; // alpha
        }
      }
    }

    // Apply Gaussian blur for smooth penumbra edges
    this._gaussianBlur(pixels, T, T, this.blurRadius);

    ctx.putImageData(imgData, 0, 0);
    this.shadowTexture.needsUpdate = true;

    // Size and position the plane
    const planeSize = floorExtent * 2;
    this.texPlane.geometry.dispose();
    this.texPlane.geometry = new THREE.PlaneGeometry(planeSize, planeSize);
    this.texPlane.visible = true;
  }

  /**
   * Also support profile-based texture shadow (for smooth profile mode)
   */
  updateFromProfiles(profiles, halfSide = A, ledHeight = H_L) {
    this.mesh.visible = false;
    this._clearBitmapGroup();

    if (!profiles) {
      this.texPlane.visible = false;
      return;
    }

    const a = halfSide;
    const hL = ledHeight;
    const N = profiles[0].length;

    // Estimate max extent
    let maxH = 0;
    for (let w = 0; w < 4; w++) {
      for (let i = 0; i < N; i++) {
        if (profiles[w][i] > maxH) maxH = profiles[w][i];
      }
    }
    const mag = hL / (hL - maxH);
    const floorExtent = a * mag * 1.3;

    const T = this.texSize;
    const ctx = this.ctx;
    const imgData = ctx.createImageData(T, T);
    const pixels = imgData.data;

    for (let py = 0; py < T; py++) {
      for (let px = 0; px < T; px++) {
        const gx = (px / (T - 1)) * 2 * floorExtent - floorExtent;
        const gy = (py / (T - 1)) * 2 * floorExtent - floorExtent;

        const absGx = Math.abs(gx);
        const absGy = Math.abs(gy);
        if (absGx <= a && absGy <= a) continue;

        let wallIdx = -1, s = 0, wz = 0;

        if (absGy >= absGx && gy > 0) {
          wallIdx = 0;
          const t = a / gy; wz = hL * (1 - t); s = (gx * t + a) / (2 * a);
        } else if (absGx >= absGy && gx > 0) {
          wallIdx = 1;
          const t = a / gx; wz = hL * (1 - t); s = (a - gy * t) / (2 * a);
        } else if (absGy >= absGx && gy < 0) {
          wallIdx = 2;
          const t = -a / gy; wz = hL * (1 - t); s = (a - gx * t) / (2 * a);
        } else if (absGx >= absGy && gx < 0) {
          wallIdx = 3;
          const t = -a / gx; wz = hL * (1 - t); s = (gy * t + a) / (2 * a);
        }

        if (wallIdx < 0 || s < 0 || s > 1 || wz < 0) continue;

        // Get profile height at this wall position
        const pIdx = Math.min(N - 1, Math.round(s * (N - 1)));
        const profileH = profiles[wallIdx][pIdx];

        // If ray intersection height <= profile height → shadow (wall blocks light)
        if (wz <= profileH) {
          const idx = (py * T + px) * 4;
          pixels[idx] = 0;
          pixels[idx + 1] = 0;
          pixels[idx + 2] = 0;
          pixels[idx + 3] = 180;
        }
      }
    }

    this._gaussianBlur(pixels, T, T, 2);

    ctx.putImageData(imgData, 0, 0);
    this.shadowTexture.needsUpdate = true;

    const planeSize = floorExtent * 2;
    this.texPlane.geometry.dispose();
    this.texPlane.geometry = new THREE.PlaneGeometry(planeSize, planeSize);
    this.texPlane.visible = true;
  }

  /**
   * Fast box blur approximation of Gaussian (3 passes)
   * Operates on RGBA pixel array in-place
   */
  _gaussianBlur(pixels, w, h, radius) {
    if (radius < 1) return;

    // Use 3-pass box blur to approximate Gaussian
    const r = Math.round(radius);
    const temp = new Uint8ClampedArray(pixels.length);

    for (let pass = 0; pass < 3; pass++) {
      // Horizontal pass
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let rr = 0, gg = 0, bb = 0, aa = 0, count = 0;
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const idx = (y * w + nx) * 4;
            rr += pixels[idx];
            gg += pixels[idx + 1];
            bb += pixels[idx + 2];
            aa += pixels[idx + 3];
            count++;
          }
          const idx = (y * w + x) * 4;
          temp[idx] = rr / count;
          temp[idx + 1] = gg / count;
          temp[idx + 2] = bb / count;
          temp[idx + 3] = aa / count;
        }
      }

      // Vertical pass
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let rr = 0, gg = 0, bb = 0, aa = 0, count = 0;
          for (let dy = -r; dy <= r; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            const idx = (ny * w + x) * 4;
            rr += temp[idx];
            gg += temp[idx + 1];
            bb += temp[idx + 2];
            aa += temp[idx + 3];
            count++;
          }
          const idx = (y * w + x) * 4;
          pixels[idx] = rr / count;
          pixels[idx + 1] = gg / count;
          pixels[idx + 2] = bb / count;
          pixels[idx + 3] = aa / count;
        }
      }
    }
  }

  _clearBitmapGroup() {
    while (this.bitmapGroup.children.length) {
      const child = this.bitmapGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      this.bitmapGroup.remove(child);
    }
  }

  setVisible(v) {
    this.mesh.visible = v;
  }

  setDetailVisible(v) {
    this.texPlane.visible = v;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();

    this.scene.remove(this.texPlane);
    this.texPlane.geometry.dispose();
    this.texPlane.material.dispose();
    this.shadowTexture.dispose();

    this._clearBitmapGroup();
    this.scene.remove(this.bitmapGroup);
  }
}
