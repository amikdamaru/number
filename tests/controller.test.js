import { test, assert, assertEqual } from './harness.js';
import { STATUS } from '../js/engine/config.js';
import { createEmptyGrid, countBlocks } from '../js/engine/board.js';
import { seededRng } from '../js/engine/generator.js';
import { GameController } from '../js/core/controller.js';
import { createStorage, createMemoryBackend, GAME_KEY, SETTINGS_KEY } from '../js/core/storage.js';
import { serializeGame, deserializeGame } from '../js/core/persistence.js';

function setup(seed = 1) {
  const backend = createMemoryBackend();
  const storage = createStorage(backend);
  const ctl = new GameController({ storage, rng: seededRng(seed) });
  return { backend, storage, ctl };
}

function seedBoard(ctl, columns, current = 2, next = 4) {
  const grid = createEmptyGrid();
  let id = 1;
  columns.forEach((col, c) => col.forEach((v, r) => (grid[c][r] = { id: id++, value: v })));
  ctl.game = { grid, current, next, status: STATUS.PLAYING, nextId: id, spawned: 40 };
}

test('double input: second drop is ignored while animation is running', () => {
  const { ctl } = setup();
  assert(ctl.drop(0).ok);
  assertEqual(ctl.drop(1).reason, 'busy');
  assertEqual(countBlocks(ctl.game.grid), 1);
  ctl.finishAnimation();
  assert(ctl.drop(1).ok);
});

test('bomb mode cannot be enabled on an empty board', () => {
  const { ctl } = setup();
  assertEqual(ctl.toggleBombMode(), false);
  assertEqual(ctl.bombMode, false);
});

test('16. cancelling bomb mode (tap bomb again) has no consequences', () => {
  const { ctl } = setup();
  seedBoard(ctl, [[2, 4]]);
  const before = JSON.stringify(ctl.game);
  assertEqual(ctl.toggleBombMode(), true);
  assertEqual(ctl.toggleBombMode(), false);
  assertEqual(JSON.stringify(ctl.game), before);
});

test('bomb mode blocks dropping; empty-cell tap keeps bomb mode', () => {
  const { ctl } = setup();
  seedBoard(ctl, [[2, 4]]);
  ctl.toggleBombMode();
  assertEqual(ctl.drop(3).reason, 'bomb-mode');
  assertEqual(ctl.bombAt(3, 0).reason, 'empty-cell');
  assertEqual(ctl.bombMode, true, 'still in bomb mode');
  assertEqual(countBlocks(ctl.game.grid), 2);
});

test('successful bomb exits bomb mode automatically and can be reused', () => {
  const { ctl } = setup();
  seedBoard(ctl, [[2, 4, 8, 16]]);
  for (let i = 0; i < 3; i++) {
    assert(ctl.toggleBombMode(), `enter bomb mode #${i + 1}`);
    assert(ctl.bombAt(0, 0).ok);
    assertEqual(ctl.bombMode, false);
    ctl.finishAnimation();
  }
  assertEqual(countBlocks(ctl.game.grid), 1);
});

test('21. New Game resets board, status, bomb mode and blocks', () => {
  const { ctl } = setup();
  seedBoard(ctl, [[2, 4, 8]]);
  ctl.game.status = STATUS.OVER;
  ctl.bombMode = true;
  const epoch = ctl.epoch;
  ctl.newGame();
  assertEqual(countBlocks(ctl.game.grid), 0);
  assertEqual(ctl.game.status, STATUS.PLAYING);
  assertEqual(ctl.bombMode, false);
  assertEqual(ctl.busy, false);
  assert(ctl.epoch > epoch, 'epoch bump cancels running animations');
  assert([2, 4].includes(ctl.game.current));
});

test('22. auto save: storage holds the post-move state immediately', () => {
  const { backend, ctl } = setup();
  ctl.drop(2);
  const saved = deserializeGame(JSON.parse(backend.getItem(GAME_KEY)));
  assertEqual(saved.grid, ctl.game.grid);
  assertEqual([saved.current, saved.next], [ctl.game.current, ctl.game.next]);
});

test('23. continue game: a new controller resumes the saved state', () => {
  const { storage, ctl } = setup();
  ctl.drop(0);
  ctl.finishAnimation();
  ctl.drop(4);
  ctl.finishAnimation();
  const again = new GameController({ storage, rng: seededRng(99) });
  assertEqual(again.resumed, true);
  assertEqual(again.game.grid, ctl.game.grid);
  assertEqual([again.game.current, again.game.next], [ctl.game.current, ctl.game.next]);
});

test('game over state is restored as game over', () => {
  const { storage, ctl } = setup();
  const cols = [];
  for (let c = 0; c < 5; c++) {
    const col = [];
    for (let r = 0; r < 7; r++) col.push((c + r) % 2 ? 8 : 4);
    cols.push(col);
  }
  seedBoard(ctl, cols);
  ctl.game.status = STATUS.OVER;
  ctl.save();
  const again = new GameController({ storage });
  assertEqual(again.isOver, true);
  assertEqual(again.drop(0).reason, 'game-over');
});

test('24. sound preference persists', () => {
  const { backend, storage, ctl } = setup();
  assertEqual(ctl.settings.sound, true);
  ctl.setSound(false);
  assertEqual(JSON.parse(backend.getItem(SETTINGS_KEY)).sound, false);
  assertEqual(new GameController({ storage }).settings.sound, false);
});

test('corrupted save falls back to a fresh game', () => {
  for (const bad of ['{not json', '{"v":1,"grid":[]}', JSON.stringify({ v: 1, grid: [[[1, 3]]] })]) {
    const backend = createMemoryBackend({ [GAME_KEY]: bad });
    const ctl = new GameController({ storage: createStorage(backend) });
    assertEqual(ctl.resumed, false, bad);
    assertEqual(countBlocks(ctl.game.grid), 0);
  }
});

test('deserialize rejects duplicate ids and non power-of-two values', () => {
  const { ctl } = setup();
  seedBoard(ctl, [[2, 4]]);
  const data = serializeGame(ctl.game);
  assert(deserializeGame(data), 'valid data accepted');
  const dup = structuredClone(data);
  dup.grid[1][0] = [1, 8];
  assertEqual(deserializeGame(dup), null);
  const odd = structuredClone(data);
  odd.grid[0][0] = [1, 6];
  assertEqual(deserializeGame(odd), null);
});

test('storage failures never throw', () => {
  const broken = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('quota');
    },
    removeItem() {},
  };
  const ctl = new GameController({ storage: createStorage(broken) });
  assert(ctl.drop(0).ok);
  ctl.setSound(false);
});
