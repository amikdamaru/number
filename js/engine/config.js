// Board dimensions and persistent-state version.
export const COLS = 5;
export const ROWS = 7;
export const STATE_VERSION = 1;

// Creating a block of this value (or larger) wins the game.
export const WIN_VALUE = 16384;

export const STATUS = Object.freeze({
  PLAYING: 'playing',
  OVER: 'over',
  WON: 'won',
});
