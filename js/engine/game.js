// Game rules: drop and bomb actions. Pure functions over an immutable state.
//
// State shape:
//   { grid, current, next, status, nextId, spawned }

import { COLS, ROWS, STATUS, WIN_VALUE } from './config.js';
import {
  createEmptyGrid,
  cloneGrid,
  landingRow,
  isBoardFull,
  highestValue,
  resolveBoard,
} from './board.js';
import { generateValue } from './generator.js';

const fail = (reason) => ({ ok: false, reason });

/** Win (a block ≥ WIN_VALUE exists) beats game over (board full). */
export function evaluateStatus(grid) {
  if (highestValue(grid) >= WIN_VALUE) return STATUS.WON;
  if (isBoardFull(grid)) return STATUS.OVER;
  return STATUS.PLAYING;
}

function ensurePlaying(state) {
  if (state.status === STATUS.OVER) return fail('game-over');
  if (state.status === STATUS.WON) return fail('game-won');
  return null;
}

export function createGame(rng = Math.random, cfg) {
  return {
    grid: createEmptyGrid(),
    current: generateValue(rng, { spawnIndex: 0, highest: 0 }, cfg),
    next: generateValue(rng, { spawnIndex: 1, highest: 0 }, cfg),
    status: STATUS.PLAYING,
    nextId: 1,
    spawned: 2,
  };
}

/**
 * DROP PROCESS
 * validate → place on top of column → resolve merges/chains/gravity →
 * check game over → advance current/next.
 */
export function dropBlock(state, col, rng = Math.random, cfg) {
  const ended = ensurePlaying(state);
  if (ended) return ended;
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return fail('invalid-column');
  const row = landingRow(state.grid, col);
  if (row === -1) return fail('column-full');

  const grid = cloneGrid(state.grid);
  const block = { id: state.nextId, value: state.current };
  grid[col][row] = block;

  const steps = [{ type: 'drop', block: { ...block }, col, row, grid: cloneGrid(grid) }];
  const res = resolveBoard(grid, { focus: new Map([[block.id, 2]]), nextId: state.nextId + 1 });
  steps.push(...res.steps);

  const status = evaluateStatus(res.grid);
  const next = generateValue(rng, { spawnIndex: state.spawned, highest: highestValue(res.grid) }, cfg);

  return {
    ok: true,
    steps,
    chains: res.chains,
    gameOver: status === STATUS.OVER,
    won: status === STATUS.WON,
    state: {
      ...state,
      grid: res.grid,
      current: state.next,
      next,
      status,
      nextId: res.nextId,
      spawned: state.spawned + 1,
    },
  };
}

/**
 * BOMB PROCESS
 * validate target → remove block → gravity → merges/chains → game over check.
 * Current/next blocks are not consumed.
 */
export function bombBlock(state, col, row) {
  const ended = ensurePlaying(state);
  if (ended) return ended;
  if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || col >= COLS || row < 0 || row >= ROWS) {
    return fail('invalid-cell');
  }
  const target = state.grid[col][row];
  if (!target) return fail('empty-cell');

  const grid = cloneGrid(state.grid);
  grid[col][row] = null;
  const steps = [{ type: 'explode', block: { ...target }, col, row, grid: cloneGrid(grid) }];
  const res = resolveBoard(grid, { nextId: state.nextId });
  steps.push(...res.steps);

  const status = evaluateStatus(res.grid);
  return {
    ok: true,
    steps,
    chains: res.chains,
    gameOver: status === STATUS.OVER,
    won: status === STATUS.WON,
    state: { ...state, grid: res.grid, status, nextId: res.nextId },
  };
}
