import { test, assert, assertEqual } from './harness.js';
import { COLS, ROWS, STATUS } from '../js/engine/config.js';
import {
  createEmptyGrid,
  applyGravity,
  findGroups,
  mergeValue,
  resolveBoard,
  countBlocks,
  landingRow,
} from '../js/engine/board.js';
import { createGame, dropBlock, bombBlock } from '../js/engine/game.js';
import { generateValue, spawnTable, seededRng, SPAWN_CONFIG } from '../js/engine/generator.js';
import { formatValue } from '../js/ui/tiles.js';

// ---------- helpers ----------

/** Builds a grid from columns listed bottom → top, e.g. [[2, 4], [], [8]]. */
function gridFrom(columns) {
  const grid = createEmptyGrid();
  let id = 1;
  columns.forEach((col, c) =>
    col.forEach((v, r) => {
      if (v) grid[c][r] = { id: id++, value: v };
    }),
  );
  return { grid, nextId: id };
}

function stateFrom(columns, current = 2, next = 2) {
  const { grid, nextId } = gridFrom(columns);
  return { grid, current, next, status: STATUS.PLAYING, nextId, spawned: 50 };
}

/** Columns as value arrays, bottom → top, trailing nulls removed. */
function values(grid) {
  return grid.map((col) => col.filter(Boolean).map((b) => b.value));
}

const rng = () => 0; // deterministic: always the smallest spawn value

function checkInvariants(grid) {
  const ids = new Set();
  for (let c = 0; c < COLS; c++) {
    let gapSeen = false;
    for (let r = 0; r < ROWS; r++) {
      const b = grid[c][r];
      if (!b) {
        gapSeen = true;
        continue;
      }
      assert(!gapSeen, `floating block at ${c},${r}`);
      assert(!ids.has(b.id), `duplicate id ${b.id}`);
      ids.add(b.id);
      assert(Number.isInteger(Math.log2(b.value)) && b.value >= 2, `bad value ${b.value}`);
    }
  }
  assertEqual(findGroups(grid).length, 0, 'unresolved groups left on board');
}

// ---------- merge formula ----------

test('merge formula: V × 2^(N-1) for every table row', () => {
  const table = [
    [2, 2, 4],
    [3, 2, 8],
    [4, 2, 16],
    [5, 2, 32],
    [2, 4, 8],
    [3, 4, 16],
    [4, 4, 32],
    [3, 8, 32],
  ];
  for (const [n, v, expected] of table) assertEqual(mergeValue(v, n), expected, `${n}×${v}`);
});

// ---------- drop ----------

test('1. drop into empty column lands on row 0', () => {
  const res = dropBlock(stateFrom([], 2), 3, rng);
  assert(res.ok);
  assertEqual(values(res.state.grid)[3], [2]);
  assertEqual(res.steps[0].row, 0);
});

test('2. drop into filled column lands on top of the stack', () => {
  const res = dropBlock(stateFrom([[], [8, 16]], 2), 1, rng);
  assert(res.ok);
  assertEqual(res.steps[0].row, 2);
  assertEqual(values(res.state.grid)[1], [8, 16, 2]);
});

test('3. drop into full column is rejected and state is unchanged', () => {
  const full = [2, 4, 8, 16, 32, 64, 128];
  const s = stateFrom([full], 256);
  const res = dropBlock(s, 0, rng);
  assertEqual(res.ok, false);
  assertEqual(res.reason, 'column-full');
  assertEqual(landingRow(s.grid, 0), -1);
});

test('drop advances current ← next and generates a new next', () => {
  const s = stateFrom([], 2, 4);
  const res = dropBlock(s, 0, rng);
  assertEqual(res.state.current, 4);
  assert(res.state.next >= 2);
});

// ---------- multi-block merge ----------

test('4. merge two blocks (horizontal): [2] + 2 → [4] at drop position', () => {
  const res = dropBlock(stateFrom([[2]], 2), 1, rng);
  assertEqual(values(res.state.grid), [[], [4], [], [], []]);
});

test('5. merge three blocks at once: [2] _ [2] + 2 in middle → single [8]', () => {
  const res = dropBlock(stateFrom([[2], [], [2]], 2), 1, rng);
  assertEqual(values(res.state.grid), [[], [8], [], [], []]);
  const merges = res.steps.filter((s) => s.type === 'merge');
  assertEqual(merges.length, 1, 'must be one simultaneous merge, not pairwise');
  assertEqual(merges[0].merges[0].count, 3);
});

test('6. merge four blocks → 16', () => {
  const res = dropBlock(stateFrom([[2], [2], [], [2]], 2), 2, rng);
  assertEqual(values(res.state.grid), [[], [], [16], [], []]);
});

test('7. merge five blocks → 32', () => {
  const res = dropBlock(stateFrom([[2], [2], [], [2], [2]], 2), 2, rng);
  assertEqual(values(res.state.grid), [[], [], [32], [], []]);
});

test('8. horizontal merge with 4s: [4] [4] + 4 → 16', () => {
  const res = dropBlock(stateFrom([[4], [4]], 4), 2, rng);
  assertEqual(values(res.state.grid), [[], [], [16], [], []]);
});

test('9. vertical merge: dropping 2 onto 2 → [4] settles to bottom', () => {
  const res = dropBlock(stateFrom([[2]], 2), 0, rng);
  assertEqual(values(res.state.grid)[0], [4]);
  assertEqual(res.state.grid[0][0].value, 4);
});

test('10. diagonal neighbours never merge', () => {
  // col0 = [8, 2]; dropping 2 into col1 lands at row 0 – diagonal to the 2.
  const res = dropBlock(stateFrom([[8, 2]], 2), 1, rng);
  assertEqual(values(res.state.grid), [[8, 2], [2], [], [], []]);
  assertEqual(res.chains, 0);
});

test('11a. flood fill joins blocks connected through other equal blocks', () => {
  // Snake of 2s around a 4: (0,0)(0,1)(1,1)(2,1)(2,0), with (1,0)=4.
  const { grid } = gridFrom([[2, 2], [4, 2], [2, 2]]);
  const groups = findGroups(grid);
  assertEqual(groups.length, 1);
  assertEqual(groups[0].length, 5);
});

test('11b. different values are never a bridge', () => {
  const { grid } = gridFrom([[2], [4], [2]]);
  assertEqual(findGroups(grid).length, 0);
});

test('11c. drop joins two separate 2s through itself', () => {
  // 2s at (0,1) and (2,1); 2 dropped onto 16 in col1 connects both.
  const res = dropBlock(stateFrom([[8, 2], [16], [8, 2]], 2), 1, rng);
  assertEqual(values(res.state.grid), [[8], [16, 8], [8], [], []]);
});

// ---------- chain + gravity ----------

test('12. chain merge: 2s → 8, 8+8 → 16, 16×3 → 64', () => {
  const res = dropBlock(stateFrom([[16, 2], [8], [16, 2]], 2), 1, rng);
  assertEqual(values(res.state.grid), [[], [64], [], [], []]);
  assertEqual(res.chains, 3);
  const chainVals = res.steps.filter((s) => s.type === 'merge').map((s) => s.merges[0].block.value);
  assertEqual(chainVals, [8, 16, 64]);
});

test('12b. spec example: new 8 falls between three 8s → all four become 64', () => {
  // col2 = [8, 4]; dropping 4 makes 8 at (2,2), which falls to (2,1) where it
  // touches 8s at (1,1), (3,1) and (2,0) → 8 × 2^3 = 64.
  const res = dropBlock(stateFrom([[], [16, 8], [8, 4], [16, 8]], 4), 2, rng);
  assertEqual(values(res.state.grid), [[], [16], [64], [16], []]);
  const merges = res.steps.filter((s) => s.type === 'merge');
  assertEqual(merges.map((m) => [m.merges[0].count, m.merges[0].block.value]), [[2, 8], [4, 64]]);
});

test('12c. T-shaped group of four 8s collapses to one 64 in one step', () => {
  const { grid, nextId } = gridFrom([[8], [8, 8], [8]]);
  const res = resolveBoard(grid, { nextId });
  // No focused block → deterministic fallback: lowest row, then leftmost column.
  assertEqual(values(res.grid), [[64], [], [], [], []]);
  assertEqual(res.chains, 1);
});

test('13. gravity after merge pulls blocks above down', () => {
  // col0 = [2, 8]; drop 2 into col1 → merges with (0,0); 8 must fall to row 0.
  const res = dropBlock(stateFrom([[2, 8]], 2), 1, rng);
  assertEqual(values(res.state.grid), [[8], [4], [], [], []]);
  assert(res.steps.some((s) => s.type === 'gravity'), 'gravity step expected');
  checkInvariants(res.state.grid);
});

test('applyGravity compacts columns and reports moves', () => {
  const grid = createEmptyGrid();
  grid[0][3] = { id: 1, value: 2 };
  grid[0][5] = { id: 2, value: 4 };
  const { grid: g, moves } = applyGravity(grid);
  assertEqual(values(g)[0], [2, 4]);
  assertEqual(moves, [
    { id: 1, col: 0, fromRow: 3, toRow: 0 },
    { id: 2, col: 0, fromRow: 5, toRow: 1 },
  ]);
});

// ---------- bomb ----------

test('14/18. bomb removes one block and blocks above fall', () => {
  const res = bombBlock(stateFrom([[2, 4, 8]]), 0, 1);
  assert(res.ok);
  assertEqual(values(res.state.grid)[0], [2, 8]);
  assertEqual(res.steps[0].type, 'explode');
});

test('15. bombs can be used repeatedly (no limit)', () => {
  let s = stateFrom([[2, 4, 8, 16, 32, 64, 128]]);
  for (let i = 0; i < 7; i++) {
    const res = bombBlock(s, 0, 0);
    assert(res.ok, `bomb #${i + 1}`);
    s = res.state;
  }
  assertEqual(countBlocks(s.grid), 0);
});

test('17. bomb on empty cell is rejected and nothing changes', () => {
  const s = stateFrom([[2]]);
  const res = bombBlock(s, 3, 0);
  assertEqual(res.ok, false);
  assertEqual(res.reason, 'empty-cell');
});

test('19. merge after bomb: falling 8 joins neighbour 8 → 16', () => {
  const res = bombBlock(stateFrom([[2, 4, 8], [16, 8]]), 0, 1);
  assertEqual(values(res.state.grid), [[2, 16], [16], [], [], []]);
  assert(res.steps.some((s) => s.type === 'merge'));
});

test('bomb does not consume current/next block', () => {
  const s = stateFrom([[2, 4]], 8, 16);
  const res = bombBlock(s, 0, 0);
  assertEqual([res.state.current, res.state.next], [8, 16]);
});

// ---------- game over ----------

function nearlyFull() {
  // Checkerboard of 4/8 (no equal neighbours) with the top of col4 empty.
  const cols = [];
  for (let c = 0; c < COLS; c++) {
    const col = [];
    for (let r = 0; r < ROWS; r++) col.push((c + r) % 2 === 0 ? 4 : 8);
    cols.push(col);
  }
  cols[4].pop();
  return cols;
}

test('20. game over when the last free cell is filled without a merge', () => {
  const res = dropBlock(stateFrom(nearlyFull(), 4), 4, rng);
  assert(res.ok);
  assertEqual(res.state.status, STATUS.OVER);
  assertEqual(res.gameOver, true);
  assertEqual(dropBlock(res.state, 0, rng).reason, 'game-over');
  assertEqual(bombBlock(res.state, 0, 0).reason, 'game-over');
});

test('no false game over when the last cell merges away', () => {
  // Last cell (4,6) gets 8, which merges with the 8 neighbours.
  const res = dropBlock(stateFrom(nearlyFull(), 8), 4, rng);
  assertEqual(res.state.status, STATUS.PLAYING);
  checkInvariants(res.state.grid);
});

// ---------- win condition ----------

test('win: merging two 8192 into 16K ends the game as won', () => {
  const res = dropBlock(stateFrom([[8192], [], [2]], 8192), 1, rng);
  assertEqual(values(res.state.grid), [[], [16384], [2], [], []]);
  assertEqual(res.state.status, STATUS.WON);
  assertEqual(res.won, true);
  assertEqual(dropBlock(res.state, 4, rng).reason, 'game-won');
  assertEqual(bombBlock(res.state, 2, 0).reason, 'game-won');
});

test('win: a chain that overshoots (32K) also wins', () => {
  // three 8192 → 8192 × 4 = 32768
  const res = dropBlock(stateFrom([[8192], [], [8192]], 8192), 1, rng);
  assertEqual(values(res.state.grid)[1], [32768]);
  assertEqual(res.state.status, STATUS.WON);
});

test('win: a merge triggered by a bomb can win', () => {
  // bombing the 2 drops 8192 next to the other 8192
  const res = bombBlock(stateFrom([[4, 2, 8192], [16, 8192]]), 0, 1);
  assertEqual(res.state.status, STATUS.WON);
});

test('win on the last free cell (board nearly full) is a win, not game over', () => {
  const cols = nearlyFull();
  cols[3][6] = 8192; // neighbour of the last free cell (4,6)
  const res = dropBlock(stateFrom(cols, 8192), 4, rng);
  assertEqual(res.state.status, STATUS.WON);
});

test('8192 does not win yet', () => {
  const res = dropBlock(stateFrom([[4096]], 4096), 1, rng);
  assertEqual(values(res.state.grid)[1], [8192]);
  assertEqual(res.state.status, STATUS.PLAYING);
});

// ---------- labels ----------

test('labels: full number up to 8192, then 16K 32K … 512K, 1M …', () => {
  const cases = [
    [2, '2'],
    [1024, '1024'],
    [8192, '8192'],
    [16384, '16K'],
    [32768, '32K'],
    [65536, '64K'],
    [524288, '512K'],
    [1048576, '1M'],
    [2097152, '2M'],
    [1073741824, '1G'],
  ];
  for (const [v, label] of cases) assertEqual(formatValue(v), label, String(v));
});

// ---------- generator ----------

test('generator: opening spawns are only 2 and 4', () => {
  const r = seededRng(7);
  for (let i = 0; i < 500; i++) {
    const v = generateValue(r, { spawnIndex: i % SPAWN_CONFIG.openingSpawns, highest: 0 });
    assert(v === 2 || v === 4, `got ${v}`);
  }
});

test('generator: max spawn grows with the highest block, and small values dominate', () => {
  const tbl = spawnTable({ spawnIndex: 100, highest: 64 });
  assertEqual(tbl.map(([v]) => v), [2, 4, 8]);
  const big = spawnTable({ spawnIndex: 100, highest: 1 << 20 });
  assert(big[big.length - 1][0] <= SPAWN_CONFIG.maxMaxSpawn);
  const r = seededRng(3);
  const counts = {};
  for (let i = 0; i < 5000; i++) {
    const v = generateValue(r, { spawnIndex: 100, highest: 4096 });
    counts[v] = (counts[v] || 0) + 1;
  }
  assert(counts[2] > counts[8] && counts[8] > counts[64], JSON.stringify(counts));
});

test('createGame starts empty and playing', () => {
  const g = createGame(seededRng(1));
  assertEqual(countBlocks(g.grid), 0);
  assertEqual(g.status, STATUS.PLAYING);
  assert([2, 4].includes(g.current) && [2, 4].includes(g.next));
});

// ---------- fuzz: no lost/duplicated/floating blocks ----------

test('fuzz: 3000 random drops + bombs keep every invariant', () => {
  const r = seededRng(12345);
  let s = createGame(r);
  let games = 1;
  for (let i = 0; i < 3000; i++) {
    if (s.status === STATUS.OVER) {
      s = createGame(r);
      games++;
      continue;
    }
    const before = countBlocks(s.grid);
    let res;
    if (r() < 0.12 && before > 0) {
      const cells = [];
      s.grid.forEach((col, c) => col.forEach((b, row) => b && cells.push([c, row])));
      const [c, row] = cells[Math.floor(r() * cells.length)];
      res = bombBlock(s, c, row);
      assert(res.ok, 'bomb should succeed');
      const merged = res.steps.filter((x) => x.type === 'merge').flatMap((x) => x.merges);
      const expected = before - 1 - merged.reduce((n, m) => n + m.count - 1, 0);
      assertEqual(countBlocks(res.state.grid), expected, 'block count after bomb');
    } else {
      const open = [];
      for (let c = 0; c < COLS; c++) if (landingRow(s.grid, c) !== -1) open.push(c);
      res = dropBlock(s, open[Math.floor(r() * open.length)], r);
      assert(res.ok, 'drop should succeed');
      const merged = res.steps.filter((x) => x.type === 'merge').flatMap((x) => x.merges);
      for (const m of merged) {
        assertEqual(m.block.value, mergeValue(m.members[0].value, m.count), 'merge value');
        assert(m.members.every((x) => x.value === m.members[0].value), 'mixed-value merge');
      }
      const expected = before + 1 - merged.reduce((n, m) => n + m.count - 1, 0);
      assertEqual(countBlocks(res.state.grid), expected, 'block count after drop');
    }
    s = res.state;
    checkInvariants(s.grid);
    assert(s.nextId > Math.max(0, ...s.grid.flat().filter(Boolean).map((b) => b.id)), 'nextId');
  }
  assert(games >= 1);
});
