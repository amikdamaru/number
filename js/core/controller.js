// Single source of truth for the running app: game state, bomb / move mode
// and the animation lock. Has no DOM dependency, so it is unit-testable.

import { STATUS } from '../engine/config.js';
import { isBoardEmpty } from '../engine/board.js';
import { createGame, dropBlock, bombBlock, moveBlock } from '../engine/game.js';

const fail = (reason) => ({ ok: false, reason });

export class GameController {
  constructor({ storage = null, rng = Math.random } = {}) {
    this.storage = storage;
    this.rng = rng;
    const saved = storage ? storage.loadGame() : null;
    this.resumed = Boolean(saved);
    this.game = saved || createGame(rng);
    this.bombMode = false;
    this.move = null; // null, or { from: null | column } while moving a block
    this.busy = false; // true while the UI animates a resolved action
    this.epoch = 0; // bumps on New Game so stale animations can abort
    if (!saved) this.save();
  }

  get isOver() {
    return this.game.status === STATUS.OVER;
  }

  get isWon() {
    return this.game.status === STATUS.WON;
  }

  /** Game finished, either by winning or by game over. */
  get isEnded() {
    return this.game.status !== STATUS.PLAYING;
  }

  /** Bomb and Move both need a running game with at least one block. */
  get canUseTool() {
    return !this.busy && !this.isEnded && !isBoardEmpty(this.game.grid);
  }

  get canBomb() {
    return this.canUseTool;
  }

  get moveMode() {
    return this.move !== null;
  }

  /** Column whose top block is picked up, or null. */
  get moveFrom() {
    return this.move ? this.move.from : null;
  }

  /**
   * Resolves a drop instantly and locks input until finishAnimation().
   * The final, consistent state is saved right away; the UI replays `steps`.
   */
  drop(col) {
    if (this.busy) return fail('busy');
    if (this.bombMode) return fail('bomb-mode');
    if (this.move) return fail('move-mode');
    const res = dropBlock(this.game, col, this.rng);
    if (!res.ok) return res;
    this.game = res.state;
    this.busy = true;
    this.save();
    return res;
  }

  // ---------- bomb ----------

  /** Returns the new bomb-mode flag. Turning bomb mode on cancels move mode. */
  toggleBombMode() {
    if (this.busy) return this.bombMode;
    if (this.bombMode) {
      this.bombMode = false;
      return false;
    }
    if (!this.canBomb) return false;
    this.move = null;
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

  // ---------- move ----------

  /** Returns the new move-mode flag. Turning move mode on cancels bomb mode. */
  toggleMoveMode() {
    if (this.busy) return this.moveMode;
    if (this.move) {
      this.move = null;
      return false;
    }
    if (!this.canUseTool) return false;
    this.bombMode = false;
    this.move = { from: null };
    return true;
  }

  cancelMoveMode() {
    this.move = null;
  }

  /**
   * Tap on a column while in move mode.
   * 1st tap picks the source column (must have a block); tapping it again
   * puts the block back; tapping another column moves the block there.
   * Returns { ok, action: 'picked' | 'unpicked' } or the engine result.
   */
  moveSelect(col) {
    if (this.busy) return fail('busy');
    if (!this.move) return fail('not-move-mode');
    if (this.move.from === null) {
      const column = this.game.grid[col];
      if (!column || !column.some(Boolean)) return fail('empty-column');
      this.move = { from: col };
      return { ok: true, action: 'picked' };
    }
    if (col === this.move.from) {
      this.move = { from: null };
      return { ok: true, action: 'unpicked' };
    }
    const res = moveBlock(this.game, this.move.from, col);
    if (!res.ok) return res; // e.g. full column: keep the block picked
    this.game = res.state;
    this.move = null;
    this.busy = true;
    this.save();
    return { ...res, action: 'moved' };
  }

  // ---------- lifecycle ----------

  finishAnimation() {
    this.busy = false;
  }

  newGame() {
    this.epoch++;
    this.game = createGame(this.rng);
    this.bombMode = false;
    this.move = null;
    this.busy = false;
    this.save();
  }

  save() {
    this.storage?.saveGame(this.game);
  }
}
