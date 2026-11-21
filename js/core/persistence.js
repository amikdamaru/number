// (De)serialization of game state with strict validation, so a corrupted
// save can never put an invalid board on screen.

import { COLS, ROWS, STATE_VERSION } from '../engine/config.js';
import { applyGravity, highestValue } from '../engine/board.js';
import { evaluateStatus } from '../engine/game.js';

export function isValidValue(v) {
  return Number.isSafeInteger(v) && v >= 2 && Number.isInteger(Math.log2(v));
}

export function serializeGame(state) {
  return {
    v: STATE_VERSION,
    grid: state.grid.map((col) => col.map((b) => (b ? [b.id, b.value] : 0))),
    current: state.current,
    next: state.next,
    status: state.status,
    nextId: state.nextId,
    spawned: state.spawned,
    best: state.best || 0,
  };
}

export function deserializeGame(data) {
  if (!data || typeof data !== 'object' || data.v !== STATE_VERSION) return null;
  if (!Array.isArray(data.grid) || data.grid.length !== COLS) return null;
  if (!isValidValue(data.current) || !isValidValue(data.next)) return null;

  const ids = new Set();
  let maxId = 0;
  const grid = [];
  for (const col of data.grid) {
    if (!Array.isArray(col) || col.length !== ROWS) return null;
    const out = [];
    for (const cell of col) {
      if (cell === 0 || cell === null) {
        out.push(null);
        continue;
      }
      if (!Array.isArray(cell) || cell.length !== 2) return null;
      const [id, value] = cell;
      if (!Number.isSafeInteger(id) || id < 1 || ids.has(id) || !isValidValue(value)) return null;
      ids.add(id);
      if (id > maxId) maxId = id;
      out.push({ id, value });
    }
    grid.push(out);
  }

  const compact = applyGravity(grid).grid;
  return {
    grid: compact,
    current: data.current,
    next: data.next,
    status: evaluateStatus(compact),
    nextId: Number.isSafeInteger(data.nextId) && data.nextId > maxId ? data.nextId : maxId + 1,
    spawned: Number.isSafeInteger(data.spawned) && data.spawned >= 0 ? data.spawned : 2,
    // Older saves have no record: fall back to the highest block on the board.
    best: Math.max(isValidValue(data.best) ? data.best : 0, highestValue(compact)),
  };
}
