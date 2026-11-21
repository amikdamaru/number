// Pure board logic. No DOM, no randomness.
//
// Grid layout: grid[col][row], row 0 = bottom. Each cell is null or { id, value }.
// All functions return new grids; inputs are never mutated.

import { COLS, ROWS } from './config.js';

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function createEmptyGrid(cols = COLS, rows = ROWS) {
  return Array.from({ length: cols }, () => Array(rows).fill(null));
}

export function cloneGrid(grid) {
  return grid.map((col) => col.map((b) => (b ? { id: b.id, value: b.value } : null)));
}

/** Row where a block dropped into `col` would land, or -1 if the column is full. */
export function landingRow(grid, col) {
  const column = grid[col];
  for (let r = column.length - 1; r >= 0; r--) {
    if (column[r]) return r + 1 < column.length ? r + 1 : -1;
  }
  return 0;
}

export function canDrop(grid, col) {
  return Number.isInteger(col) && col >= 0 && col < grid.length && landingRow(grid, col) !== -1;
}

export function isBoardFull(grid) {
  return grid.every((_, c) => landingRow(grid, c) === -1);
}

export function isBoardEmpty(grid) {
  return grid.every((col) => col.every((b) => !b));
}

export function countBlocks(grid) {
  let n = 0;
  for (const col of grid) for (const b of col) if (b) n++;
  return n;
}

export function highestValue(grid) {
  let max = 0;
  for (const col of grid) for (const b of col) if (b && b.value > max) max = b.value;
  return max;
}

/** Multi-block merge formula: N connected blocks of value V become V × 2^(N-1). */
export function mergeValue(value, count) {
  return value * 2 ** (count - 1);
}

/** Compacts every column downward. Returns the new grid and the list of moves. */
export function applyGravity(grid) {
  const next = cloneGrid(grid);
  const moves = [];
  for (let c = 0; c < next.length; c++) {
    let write = 0;
    for (let r = 0; r < next[c].length; r++) {
      const b = next[c][r];
      if (!b) continue;
      if (r !== write) {
        next[c][write] = b;
        next[c][r] = null;
        moves.push({ id: b.id, col: c, fromRow: r, toRow: write });
      }
      write++;
    }
  }
  return { grid: next, moves };
}

/**
 * Connected components (BFS flood fill) of equal-valued blocks.
 * Only horizontal/vertical neighbours count; diagonals never connect.
 * Returns groups with at least `minSize` members, in deterministic order.
 */
export function findGroups(grid, minSize = 2) {
  const cols = grid.length;
  const rows = grid[0].length;
  const seen = grid.map((col) => col.map(() => false));
  const groups = [];

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const start = grid[c][r];
      if (!start || seen[c][r]) continue;
      seen[c][r] = true;
      const queue = [[c, r]];
      const cells = [];
      for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i];
        cells.push({ col: x, row: y, block: grid[x][y] });
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[nx][ny]) continue;
          const nb = grid[nx][ny];
          if (nb && nb.value === start.value) {
            seen[nx][ny] = true;
            queue.push([nx, ny]);
          }
        }
      }
      if (cells.length >= minSize) groups.push(cells);
    }
  }
  return groups;
}

/**
 * Where the merged block appears. Prefers the member with the highest focus
 * priority (the block just dropped / just merged / just moved); ties and
 * unfocused groups fall back to lowest row, then leftmost column.
 */
export function chooseTarget(cells, focus = new Map()) {
  let best = null;
  let bestP = -1;
  for (const cell of cells) {
    const p = focus.get(cell.block.id) ?? 0;
    if (
      !best ||
      p > bestP ||
      (p === bestP && (cell.row < best.row || (cell.row === best.row && cell.col < best.col)))
    ) {
      best = cell;
      bestP = p;
    }
  }
  return { col: best.col, row: best.row };
}

/**
 * Runs gravity + multi-block merge + chain merges until the board is stable.
 *
 * Every round merges ALL current groups at once (each group collapses into a
 * single block using mergeValue), then applies gravity. Each round removes at
 * least one block, so the loop always terminates.
 *
 * Returns { grid, steps, nextId, chains } where steps is the animation script:
 *   { type: 'gravity', moves, grid }
 *   { type: 'merge', chain, merges: [{ members, target, block, count }], grid }
 */
export function resolveBoard(inputGrid, { focus = new Map(), nextId = 1 } = {}) {
  let grid = cloneGrid(inputGrid);
  let id = nextId;
  let chain = 0;
  let focusMap = new Map(focus);
  const steps = [];
  const limit = grid.length * grid[0].length + 1;

  const settle = (prio) => {
    const g = applyGravity(grid);
    if (g.moves.length) {
      grid = g.grid;
      steps.push({ type: 'gravity', moves: g.moves, grid: cloneGrid(grid) });
      for (const m of g.moves) if (!prio.has(m.id)) prio.set(m.id, 1);
    }
  };

  settle(focusMap);

  for (;;) {
    const groups = findGroups(grid);
    if (!groups.length) break;
    if (++chain > limit) throw new Error('resolveBoard: iteration limit exceeded');

    const merges = [];
    const nextFocus = new Map();
    for (const cells of groups) {
      const target = chooseTarget(cells, focusMap);
      const block = { id: id++, value: mergeValue(cells[0].block.value, cells.length) };
      for (const cell of cells) grid[cell.col][cell.row] = null;
      grid[target.col][target.row] = block;
      merges.push({
        members: cells.map((c) => ({ id: c.block.id, col: c.col, row: c.row, value: c.block.value })),
        target,
        block: { ...block },
        count: cells.length,
      });
      nextFocus.set(block.id, 2);
    }
    steps.push({ type: 'merge', chain, merges, grid: cloneGrid(grid) });
    settle(nextFocus);
    focusMap = nextFocus;
  }

  return { grid, steps, nextId: id, chains: chain };
}
