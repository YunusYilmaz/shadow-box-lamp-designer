export class UndoRedo {
  constructor(maxHistory = 50) {
    this._maxHistory = maxHistory;
    this._undoStack = [];
    this._redoStack = [];
  }

  push(snapshot) {
    // Deep copy Float64Array profiles
    const copy = snapshot.map(p => new Float64Array(p));
    this._undoStack.push(copy);
    if (this._undoStack.length > this._maxHistory) {
      this._undoStack.shift();
    }
    this._redoStack = [];
  }

  undo() {
    if (this._undoStack.length === 0) return null;
    const state = this._undoStack.pop();
    this._redoStack.push(state);
    return this._undoStack.length > 0
      ? this._undoStack[this._undoStack.length - 1].map(p => new Float64Array(p))
      : null;
  }

  redo() {
    if (this._redoStack.length === 0) return null;
    const state = this._redoStack.pop();
    this._undoStack.push(state);
    return state.map(p => new Float64Array(p));
  }

  get canUndo() { return this._undoStack.length > 1; }
  get canRedo() { return this._redoStack.length > 0; }

  clear() {
    this._undoStack = [];
    this._redoStack = [];
  }
}
