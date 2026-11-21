// App entry: wires the controller (state), renderer (DOM), input and sound.

import { COLS } from './engine/config.js';
import { isBoardEmpty, highestValue } from './engine/board.js';
import { GameController } from './core/controller.js';
import { createStorage, getLocalStorage } from './core/storage.js';
import { Renderer } from './ui/renderer.js';
import { SoundFX, MusicPlayer } from './ui/audio.js';
import { formatValue, paintTile } from './ui/tiles.js';

const $ = (id) => document.getElementById(id);

const ui = {
  area: $('board-area'),
  board: $('board'),
  queue: $('queue'),
  current: $('current-tile'),
  next: $('next-tile'),
  btnNew: $('btn-new'),
  btnBomb: $('btn-bomb'),
  btnBombLabel: $('btn-bomb-label'),
  btnSound: $('btn-sound'),
  btnSoundLabel: $('btn-sound-label'),
  confirm: $('confirm'),
  confirmOk: $('confirm-ok'),
  confirmCancel: $('confirm-cancel'),
  gameover: $('gameover'),
  gameoverNew: $('gameover-new'),
  win: $('win'),
  winTitle: $('win-title'),
  winTile: $('win-tile'),
  winNew: $('win-new'),
};

const controller = new GameController({ storage: createStorage(getLocalStorage()) });
const sound = new SoundFX(controller.settings.sound);
const music = new MusicPlayer(sound, 'audio/music.ogg');
music.enabled = controller.settings.music; // starts on the first tap
const renderer = new Renderer({
  area: ui.area,
  board: ui.board,
  lanes: $('lanes'),
  blocks: $('blocks'),
  fx: $('fx'),
});

// ---------- view refresh ----------

function refreshControls() {
  const { bombMode, busy } = controller;
  const empty = isBoardEmpty(controller.game.grid);
  ui.btnBomb.disabled = controller.isEnded || (empty && !bombMode);
  ui.btnBomb.classList.toggle('active', bombMode);
  ui.btnBomb.setAttribute('aria-pressed', String(bombMode));
  ui.btnBombLabel.textContent = bombMode ? 'BATAL' : 'BOM';
  ui.board.classList.toggle('bomb-mode', bombMode);
  ui.board.classList.toggle('busy', busy);
  ui.queue.classList.toggle('bomb-mode', bombMode);

  const { sound: sfxOn, music: musicOn } = controller.settings;
  ui.btnSound.classList.toggle('off', !sfxOn);
  ui.btnSound.classList.toggle('no-music', sfxOn && !musicOn);
  ui.btnSound.setAttribute('aria-pressed', String(sfxOn));
  ui.btnSoundLabel.textContent = !sfxOn ? 'SUARA OFF' : musicOn ? 'SUARA ON' : 'MUSIK OFF';
}

function showEndScreen() {
  ui.gameover.hidden = !controller.isOver;
  ui.win.hidden = !controller.isWon;
  if (controller.isWon) {
    const best = highestValue(controller.game.grid);
    ui.winTitle.textContent = `Kamu mencapai ${formatValue(best)}!`;
    paintTile(ui.winTile, best);
  }
}

function refreshPreview(animate) {
  renderer.setPreview(ui.current, controller.game.current, animate);
  renderer.setPreview(ui.next, controller.game.next, animate);
}

function renderAll() {
  renderer.sync(controller.game.grid);
  refreshPreview(false);
  refreshControls();
  showEndScreen();
}

// ---------- action playback ----------

async function playSteps(steps) {
  const epoch = controller.epoch;
  refreshControls();
  try {
    await renderer.play(steps, {
      isCancelled: () => controller.epoch !== epoch,
      onEvent: (name, step) => sound.play(name, step),
    });
  } catch (err) {
    console.error(err);
  }
  if (controller.epoch !== epoch) {
    // New Game was started mid-animation: show the fresh board.
    renderer.sync(controller.game.grid);
    return;
  }
  controller.finishAnimation();
  renderer.sync(controller.game.grid);
  refreshPreview(true);
  refreshControls();
  if (controller.isWon) {
    sound.play('win');
    showEndScreen();
    ui.winNew.focus({ preventScroll: true });
  } else if (controller.isOver) {
    sound.play('gameover');
    showEndScreen();
    ui.gameoverNew.focus({ preventScroll: true });
  }
}

function tryDrop(col) {
  if (controller.busy || controller.isEnded || controller.bombMode) return;
  const res = controller.drop(col);
  if (!res.ok) {
    if (res.reason === 'column-full') {
      renderer.denyLane(col);
      sound.play('error');
    }
    return;
  }
  renderer.setHoverLane(-1);
  renderer.setPreview(ui.current, null); // the current block is falling now
  playSteps(res.steps);
}

function tryBomb(col, row) {
  if (controller.busy || !controller.bombMode) return;
  const res = controller.bombAt(col, row);
  if (!res.ok) {
    // Empty cell: bomb is not used and bomb mode stays active.
    sound.play('error');
    ui.queue.classList.remove('nudge');
    void ui.queue.offsetWidth;
    ui.queue.classList.add('nudge');
    return;
  }
  playSteps(res.steps);
}

function toggleBomb() {
  if (controller.busy || controller.isEnded) return;
  controller.toggleBombMode();
  sound.play('click');
  refreshControls();
}

function startNewGame() {
  controller.newGame();
  renderer.clearFx();
  renderer.sync(controller.game.grid);
  ui.confirm.hidden = true;
  ui.gameover.hidden = true;
  ui.win.hidden = true;
  refreshPreview(true);
  refreshControls();
}

function requestNewGame() {
  sound.play('click');
  const nothingToLose = isBoardEmpty(controller.game.grid) && !controller.busy;
  if (controller.isEnded || nothingToLose) {
    startNewGame();
    return;
  }
  controller.cancelBombMode();
  refreshControls();
  ui.confirm.hidden = false;
  ui.confirmCancel.focus({ preventScroll: true });
}

// ---------- input ----------

ui.board.addEventListener('pointerdown', (e) => {
  // One primary pointer only: ignores extra fingers (multi-touch) and right-click.
  if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault();
  sound.unlock();
  if (controller.busy || controller.isEnded) return;
  const cell = renderer.cellFromPoint(e.clientX, e.clientY);
  if (!cell) return;
  if (controller.bombMode) tryBomb(cell.col, cell.row);
  else tryDrop(cell.col);
});

ui.board.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || controller.busy || controller.bombMode) return;
  const cell = renderer.cellFromPoint(e.clientX, e.clientY);
  renderer.setHoverLane(cell ? cell.col : -1);
});
ui.board.addEventListener('pointerleave', () => renderer.setHoverLane(-1));
ui.board.addEventListener('contextmenu', (e) => e.preventDefault());

ui.btnBomb.addEventListener('click', toggleBomb);
ui.btnNew.addEventListener('click', requestNewGame);
ui.btnSound.addEventListener('click', () => {
  const s = controller.cycleAudio();
  sound.setEnabled(s.sound);
  music.setEnabled(s.music);
  sound.play('click');
  refreshControls();
});

ui.confirmOk.addEventListener('click', () => {
  sound.play('click');
  startNewGame();
});
ui.confirmCancel.addEventListener('click', () => {
  sound.play('click');
  ui.confirm.hidden = true;
});
ui.confirm.addEventListener('pointerdown', (e) => {
  if (e.target === ui.confirm) ui.confirm.hidden = true;
});
ui.gameoverNew.addEventListener('click', () => {
  sound.play('click');
  startNewGame();
});
ui.winNew.addEventListener('click', () => {
  sound.play('click');
  startNewGame();
});

document.addEventListener(
  'pointerdown',
  () => {
    sound.unlock();
    music.unlock();
  },
  { passive: true },
);

// Pause all audio while the app is in the background (saves battery).
document.addEventListener('visibilitychange', () => {
  const ctx = sound.ctx;
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else if (controller.settings.sound || controller.settings.music) ctx.resume().catch(() => {});
});

// Desktop shortcuts: 1-5 drop, B toggles bomb, Esc cancels bomb / dialog.
document.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!ui.confirm.hidden) {
    if (e.key === 'Escape') ui.confirm.hidden = true;
    return;
  }
  const n = Number(e.key);
  if (Number.isInteger(n) && n >= 1 && n <= COLS) {
    sound.unlock();
    music.unlock();
    tryDrop(n - 1);
  } else if (e.key === 'b' || e.key === 'B') {
    toggleBomb();
  } else if (e.key === 'Escape' && controller.bombMode) {
    controller.cancelBombMode();
    refreshControls();
  }
});

// ---------- boot ----------

new ResizeObserver(() => renderer.layout()).observe(ui.area);
renderer.layout();
renderAll();
document.documentElement.classList.add('ready');

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}
