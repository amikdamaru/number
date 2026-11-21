// LocalStorage adapter. Every access is guarded: private mode, quota errors
// or corrupted JSON fall back silently to a fresh game.

import { serializeGame, deserializeGame } from './persistence.js';

export const GAME_KEY = 'numberMerge.game.v1';

export function getLocalStorage() {
  try {
    const s = window.localStorage;
    const k = '__nm_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

/** In-memory backend with the localStorage interface (used by tests). */
export function createMemoryBackend(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  };
}

function readJSON(backend, key) {
  try {
    const raw = backend?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(backend, key, value) {
  try {
    backend?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function createStorage(backend) {
  return {
    loadGame: () => deserializeGame(readJSON(backend, GAME_KEY)),
    saveGame: (state) => writeJSON(backend, GAME_KEY, serializeGame(state)),
    clearGame: () => {
      try {
        backend?.removeItem(GAME_KEY);
      } catch {
        /* ignore */
      }
    },
  };
}
