// Single source of truth for the running app: game state, bomb mode,
// animation lock and settings. Has no DOM dependency, so it is unit-testable.

import { STATUS } from '../engine/config.js';
import { isBoardEmpty } from '../engine/board.js';
import { createGame, dropBlock, bombBlock } from '../engine/game.js';

export const DEFAULT_SETTINGS = Object.freeze({ sound: true });

const fail = (reason) => ({ ok: false, reason });

export class GameController {
  constructor({ storage = null, rng = Math.random } = {}) {
    this.storage = storage;
    this.rng = rng;
    const saved = storage ? storage.loadGame() : null;
    this.resumed = Boolean(saved);
    this.game = saved || createGame(rng);
    this.settings = { ...DEFAULT_SETTINGS, ...(storage ? storage.loadSettings() : {}) };
    this.bombMode = false;
    this.busy = false; // true while the UI animates a resolved action
    this.epoch = 0; // bumps on New Game so stale animations can abort
    if (!saved) this.save();
  }

  get isOver() {
    return this.game.status === STATUS.OVER;
  }

  get canBomb() {
    return !this.busy && !this.isOver && !isBoardEmpty(this.game.grid);
  }

  /**
   * Resolves a drop instantly and locks input until finishAnimation().
   * The final, consistent state is saved right away; the UI replays `steps`.
   */
  drop(col) {
    if (this.busy) return fail('busy');
    if (this.bombMode) return fail('bomb-mode');
    const res = dropBlock(this.game, col, this.rng);
    if (!res.ok) return res;
    this.game = res.state;
    this.busy = true;
    this.save();
    return res;
  }

  /** Returns the new bomb-mode flag. */
  toggleBombMode() {
    if (this.busy) return this.bombMode;
    if (this.bombMode) {
      this.bombMode = false;
      return false;
    }
    if (!this.canBomb) return false;
    this.bombMode = true;
    return true;
  }

  cancelBombMode() {
    this.bombMode = false;
  }

  bombAt(col, row) {
    if (this.busy) return fail('busy');
    if (!this.bombMode) return fail('not-bomb-mode');
    const res = bombBlock(this.game, col, row);
    if (!res.ok) return res; // e.g. empty cell: bomb not used, mode stays active
    this.game = res.state;
    this.bombMode = false;
    this.busy = true;
    this.save();
    return res;
  }

  finishAnimation() {
    this.busy = false;
  }

  newGame() {
    this.epoch++;
    this.game = createGame(this.rng);
    this.bombMode = false;
    this.busy = false;
    this.save();
  }

  setSound(on) {
    this.settings = { ...this.settings, sound: Boolean(on) };
    this.storage?.saveSettings(this.settings);
  }

  save() {
    this.storage?.saveGame(this.game);
  }
}
