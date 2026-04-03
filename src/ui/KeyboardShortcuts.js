export class KeyboardShortcuts {
  constructor(handlers) {
    this._handlers = handlers;
    this._listener = (e) => this._onKey(e);
    window.addEventListener('keydown', this._listener);
  }

  _onKey(e) {
    // Don't capture when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this._handlers.undo?.();
    } else if (mod && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      this._handlers.redo?.();
    } else if (mod && e.key === 'e') {
      e.preventDefault();
      this._handlers.export?.();
    } else if (e.key === 'r' && !mod) {
      this._handlers.toggleRays?.();
    } else if (e.key === 'w' && !mod) {
      this._handlers.toggleWireframe?.();
    } else if (e.key === ' ') {
      e.preventDefault();
      this._handlers.resetCamera?.();
    } else if (e.key >= '1' && e.key <= '4' && !mod) {
      this._handlers.switchTab?.(parseInt(e.key) - 1);
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._listener);
  }
}
