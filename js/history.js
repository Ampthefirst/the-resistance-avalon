// Undo stack plus localStorage persistence.
// Each entry is one step of the game: { state, log, label }. The visible log is
// derived from the entries currently on the stack, so reverted steps leave no trace.

const SAVE_KEY = 'avalon.save.v1';
const SETUP_KEY = 'avalon.setup.v1';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the game still works, it just will not survive a refresh.
  }
}

export class History {
  constructor(entries = []) {
    this.entries = entries;
  }

  static load() {
    const saved = read(SAVE_KEY);
    return new History(Array.isArray(saved) ? saved : []);
  }

  get current() {
    return this.entries.length ? this.entries[this.entries.length - 1].state : null;
  }

  get log() {
    return this.entries.flatMap((e) => e.log);
  }

  get length() {
    return this.entries.length;
  }

  push(step) {
    this.entries.push(step);
    this.save();
  }

  undo() {
    this.entries.pop();
    this.save();
  }

  // Keep entries 0..index, making entry `index` the current step.
  revertTo(index) {
    this.entries.length = index + 1;
    this.save();
  }

  clear() {
    this.entries = [];
    this.save();
  }

  save() {
    write(SAVE_KEY, this.entries.length ? this.entries : null);
  }
}

export function loadSetup() {
  return read(SETUP_KEY);
}

export function saveSetup(setup) {
  write(SETUP_KEY, setup);
}
