export class ScreenshotExporter {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
  }

  async capture(width = 2560, height = 1440) {
    const prevSize = this.renderer.getSize(new (await import('three')).Vector2());
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);

    return new Promise((resolve) => {
      this.renderer.domElement.toBlob((blob) => {
        // Restore
        this.renderer.setSize(prevSize.x, prevSize.y);
        this.camera.aspect = prevSize.x / prevSize.y;
        this.camera.updateProjectionMatrix();
        resolve(blob);
      }, 'image/png');
    });
  }

  async download(filename = 'shadowbox-render.png') {
    const blob = await this.capture();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = filename;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  }
}
