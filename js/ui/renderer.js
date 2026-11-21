// DOM renderer. Blocks are absolutely positioned elements keyed by block id
// and moved with the CSS `translate` property, so `scale`/`rotate` effects
// never disturb positioning. The engine hands over an animation script
// (steps); this module plays it and finally re-syncs to the true grid.

import { COLS, ROWS } from '../engine/config.js';
import { landingRow } from '../engine/board.js';
import { paintTile, tileStyle } from './tiles.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const FALL = 'cubic-bezier(.5,0,.9,.55)';

export class Renderer {
  constructor({ area, board, lanes, blocks, fx }) {
    this.area = area;
    this.board = board;
    this.lanesEl = lanes;
    this.blocksEl = blocks;
    this.fx = fx;
    this.els = new Map();
    this.metrics = null;
    this.speed = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.5 : 1;
    this.lanes = [];
    for (let c = 0; c < COLS; c++) {
      const lane = document.createElement('div');
      lane.className = 'lane';
      lane.dataset.col = String(c);
      this.lanesEl.appendChild(lane);
      this.lanes.push(lane);
    }
  }

  t(ms) {
    return Math.round(ms * this.speed);
  }

  // ---------- layout ----------

  layout() {
    const w = this.area.clientWidth;
    const h = this.area.clientHeight;
    if (!w || !h) return;
    const gap = Math.max(4, Math.min(8, Math.round(w * 0.018)));
    const pad = gap + 3;
    let cell = Math.floor(
      Math.min((w - 2 * pad - (COLS - 1) * gap) / COLS, (h - 2 * pad - (ROWS - 1) * gap) / ROWS),
    );
    cell = Math.max(20, Math.min(cell, 92));
    const bw = 2 * pad + COLS * cell + (COLS - 1) * gap;
    const bh = 2 * pad + ROWS * cell + (ROWS - 1) * gap;
    this.metrics = { cell, gap, pad, bw, bh };

    const s = this.board.style;
    s.width = `${bw}px`;
    s.height = `${bh}px`;
    s.setProperty('--cell', `${cell}px`);
    s.setProperty('--gap', `${gap}px`);
    s.setProperty('--pad', `${pad}px`);

    this.lanes.forEach((lane, c) => {
      lane.style.left = `${pad + c * (cell + gap)}px`;
      lane.style.top = `${pad}px`;
      lane.style.width = `${cell}px`;
      lane.style.height = `${bh - 2 * pad}px`;
    });

    for (const el of this.els.values()) {
      this.place(el, Number(el.dataset.col), Number(el.dataset.row), 'none');
    }
  }

  pos(col, row) {
    if (!this.metrics) return { x: 0, y: 0 };
    const { cell, gap, pad } = this.metrics;
    return { x: pad + col * (cell + gap), y: pad + (ROWS - 1 - row) * (cell + gap) };
  }

  place(el, col, row, transition = '') {
    el.style.transition = transition;
    const p = this.pos(col, row);
    el.style.translate = `${p.x}px ${p.y}px`;
    el.dataset.col = String(col);
    el.dataset.row = String(row);
  }

  /** Maps a pointer position to the nearest board cell. */
  cellFromPoint(clientX, clientY) {
    if (!this.metrics) return null;
    const rect = this.board.getBoundingClientRect();
    const { cell, gap, pad } = this.metrics;
    const step = cell + gap;
    const x = clientX - rect.left - pad;
    const y = clientY - rect.top - pad;
    const col = Math.min(COLS - 1, Math.max(0, Math.floor((x + gap / 2) / step)));
    const fromTop = Math.min(ROWS - 1, Math.max(0, Math.floor((y + gap / 2) / step)));
    return { col, row: ROWS - 1 - fromTop };
  }

  // ---------- static rendering ----------

  createEl(block) {
    const el = document.createElement('div');
    el.className = 'block tile';
    el.dataset.id = String(block.id);
    paintTile(el, block.value);
    this.blocksEl.appendChild(el);
    this.els.set(block.id, el);
    return el;
  }

  removeEl(id) {
    const el = this.els.get(id);
    if (el) el.remove();
    this.els.delete(id);
  }

  /** Makes the DOM exactly match `grid` (no animation). */
  sync(grid) {
    const seen = new Set();
    for (let c = 0; c < grid.length; c++) {
      for (let r = 0; r < grid[c].length; r++) {
        const b = grid[c][r];
        if (!b) continue;
        seen.add(b.id);
        let el = this.els.get(b.id);
        if (!el) el = this.createEl(b);
        else if (el.dataset.value !== String(b.value)) paintTile(el, b.value);
        el.className = 'block tile';
        el.style.zIndex = '';
        this.place(el, c, r, 'none');
      }
    }
    for (const id of [...this.els.keys()]) if (!seen.has(id)) this.removeEl(id);
    this.lanes.forEach((lane, c) => lane.classList.toggle('full', landingRow(grid, c) === -1));
  }

  clearFx() {
    this.fx.replaceChildren();
  }

  setPreview(el, value, animate = false) {
    el.classList.toggle('empty', value == null);
    if (value == null) {
      el.textContent = '';
      el.removeAttribute('data-len');
      return;
    }
    paintTile(el, value);
    if (animate) bump(el, 'pop');
  }

  /**
   * Move-mode highlights. move = null (off) or { from: null | col }.
   * Picking phase: top block of every non-empty column is marked "movable".
   * Target phase: the picked block lifts and valid destination lanes glow.
   */
  setMoveState(grid, move) {
    for (const el of this.els.values()) el.classList.remove('movable', 'picked');
    this.lanes.forEach((lane) => lane.classList.remove('target', 'source'));
    if (!move) return;
    const top = (c) => {
      for (let r = grid[c].length - 1; r >= 0; r--) if (grid[c][r]) return grid[c][r];
      return null;
    };
    if (move.from === null) {
      for (let c = 0; c < grid.length; c++) {
        const b = top(c);
        if (b) this.els.get(b.id)?.classList.add('movable');
      }
      return;
    }
    const picked = top(move.from);
    if (picked) this.els.get(picked.id)?.classList.add('picked');
    this.lanes[move.from]?.classList.add('source');
    this.lanes.forEach((lane, c) => {
      if (c !== move.from && landingRow(grid, c) !== -1) lane.classList.add('target');
    });
  }

  setHoverLane(col) {
    this.lanes.forEach((lane, c) => lane.classList.toggle('hover', c === col));
  }

  denyLane(col) {
    const lane = this.lanes[col];
    if (lane) bump(lane, 'deny');
  }

  // ---------- animation ----------

  async play(steps, { isCancelled = () => false, onEvent = () => {} } = {}) {
    for (const step of steps) {
      if (isCancelled()) return;
      switch (step.type) {
        case 'drop':
          await this.animDrop(step, () => onEvent('drop', step));
          break;
        case 'move':
          await this.animMove(step, () => onEvent('land', step));
          break;
        case 'explode':
          onEvent('bomb', step);
          await this.animExplode(step);
          break;
        case 'gravity':
          await this.animGravity(step, () => onEvent('land', step));
          break;
        case 'merge':
          onEvent(step.chain > 1 ? 'chain' : 'merge', step);
          await this.animMerge(step);
          break;
        default:
          break;
      }
    }
  }

  async animDrop({ block, col, row }, onLand = () => {}) {
    const el = this.createEl(block);
    const start = this.pos(col, ROWS);
    el.style.transition = 'none';
    el.style.translate = `${start.x}px ${start.y}px`;
    void el.offsetWidth;
    const dur = this.t(110 + 42 * (ROWS - row));
    this.place(el, col, row, `translate ${dur}ms ${FALL}`);
    await wait(dur);
    onLand(); // collision
    bump(el, 'land');
    await wait(this.t(50));
  }

  /**
   * Picked block rises out of its column (leaving the board at the top),
   * then falls from the top into the target column like a normal drop.
   */
  async animMove({ block, from, to }, onLand = () => {}) {
    const el = this.els.get(block.id);
    if (!el) return;
    el.classList.remove('picked');
    el.style.zIndex = '4';

    // 1. rise out of the source column, above the board edge (clipped there)
    const rise = this.t(120 + 30 * (ROWS - from.row));
    this.place(el, from.col, ROWS, `translate ${rise}ms cubic-bezier(.3,0,.6,.4)`);
    await wait(rise);

    // 2. jump (hidden above the board) to the top of the target column
    const top = this.pos(to.col, ROWS);
    el.style.transition = 'none';
    el.style.translate = `${top.x}px ${top.y}px`;
    void el.offsetWidth;

    // 3. fall into place with the same gravity curve as a drop
    const fall = this.t(110 + 42 * (ROWS - to.row));
    this.place(el, to.col, to.row, `translate ${fall}ms ${FALL}`);
    await wait(fall);
    el.style.zIndex = '';
    onLand(); // collision
    bump(el, 'land');
    await wait(this.t(60));
  }

  async animGravity({ moves }, onLand = () => {}) {
    let max = 0;
    const moved = [];
    const landings = new Set();
    for (const m of moves) {
      const el = this.els.get(m.id);
      if (!el) continue;
      const dur = this.t(90 + 55 * (m.fromRow - m.toRow));
      max = Math.max(max, dur);
      landings.add(dur);
      this.place(el, m.col, m.toRow, `translate ${dur}ms ${FALL}`);
      moved.push(el);
    }
    // One collision sound per distinct landing moment.
    for (const t of landings) setTimeout(onLand, t);
    await wait(max);
    moved.forEach((el) => bump(el, 'land'));
    await wait(this.t(70));
  }

  async animMerge({ chain, merges }) {
    const dur = this.t(170);
    for (const mg of merges) {
      const t = this.pos(mg.target.col, mg.target.row);
      for (const mem of mg.members) {
        const el = this.els.get(mem.id);
        if (!el) continue;
        el.style.zIndex = '3';
        el.style.transition = `translate ${dur}ms ease-in, scale ${dur}ms ease-in, opacity ${dur}ms ease-in`;
        el.style.translate = `${t.x}px ${t.y}px`;
        el.classList.add('merging');
      }
    }
    await wait(dur);

    for (const mg of merges) {
      for (const mem of mg.members) this.removeEl(mem.id);
      const el = this.createEl(mg.block);
      this.place(el, mg.target.col, mg.target.row, 'none');
      el.classList.add('pop', chain > 1 ? 'glow-chain' : 'glow');
      const p = this.pos(mg.target.col, mg.target.row);
      this.burst(p, tileStyle(mg.block.value).bg, chain > 1 ? 12 : 8, 0.55);
    }
    if (chain > 1) this.chainLabel(chain, merges[0]);
    await wait(this.t(chain > 1 ? 360 : 280));
  }

  async animExplode({ block, col, row }) {
    const el = this.els.get(block.id);
    const p = this.pos(col, row);
    this.burst(p, tileStyle(block.value).bg, 18, 1);
    this.shockwave(p);
    bump(this.board, 'shake');
    if (el) el.classList.add('exploding');
    await wait(this.t(320));
    this.removeEl(block.id);
  }

  // ---------- effects ----------

  burst(p, color, count, power) {
    const { cell } = this.metrics || { cell: 60 };
    const cx = p.x + cell / 2;
    const cy = p.y + cell / 2;
    for (let i = 0; i < count; i++) {
      const d = document.createElement('span');
      d.className = 'particle';
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const dist = cell * (0.55 + Math.random() * 0.8) * power + cell * 0.25;
      const size = Math.round((4 + Math.random() * 6) * (0.6 + power * 0.5));
      d.style.left = `${cx}px`;
      d.style.top = `${cy}px`;
      d.style.setProperty('--s', `${size}px`);
      d.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
      d.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
      d.style.background = i % 3 === 0 ? '#ffe17a' : color;
      this.fx.appendChild(d);
      setTimeout(() => d.remove(), 900);
    }
  }

  shockwave(p) {
    const { cell } = this.metrics || { cell: 60 };
    const s = document.createElement('span');
    s.className = 'shock';
    s.style.left = `${p.x + cell / 2}px`;
    s.style.top = `${p.y + cell / 2}px`;
    this.fx.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }

  chainLabel(chain, merge) {
    const { cell } = this.metrics || { cell: 60 };
    const p = this.pos(merge.target.col, merge.target.row);
    const label = document.createElement('span');
    label.className = 'chain-label';
    label.textContent = `CHAIN ×${chain}`;
    label.style.left = `${p.x + cell / 2}px`;
    label.style.top = `${p.y}px`;
    label.style.setProperty('--c', tileStyle(merge.block.value).bg);
    this.fx.appendChild(label);
    setTimeout(() => label.remove(), 1100);
  }
}

function bump(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
