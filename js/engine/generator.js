// Weighted random block generator. Tune SPAWN_CONFIG to change difficulty.

export const SPAWN_CONFIG = {
  // The first N spawned blocks use the opening table (only 2 and 4).
  openingSpawns: 10,
  openingWeights: { 2: 60, 4: 40 },

  // Relative weights after the opening. Smaller numbers are more common.
  weights: { 2: 30, 4: 26, 8: 18, 16: 12, 32: 7, 64: 4, 128: 2, 256: 1 },

  // Largest spawnable value = highest block on board / highestDivisor,
  // clamped to [minMaxSpawn, maxMaxSpawn]. Keeps big numbers rare early on.
  highestDivisor: 16,
  minMaxSpawn: 8,
  maxMaxSpawn: 256,
};

const toEntries = (weights) =>
  Object.entries(weights)
    .map(([v, w]) => [Number(v), Number(w)])
    .filter(([v, w]) => v >= 2 && w > 0)
    .sort((a, b) => a[0] - b[0]);

export function maxSpawnValue(highest, cfg = SPAWN_CONFIG) {
  return Math.min(cfg.maxMaxSpawn, Math.max(cfg.minMaxSpawn, Math.floor(highest / cfg.highestDivisor)));
}

/** Returns the [value, weight] table used for the given context. */
export function spawnTable({ spawnIndex = 0, highest = 0 } = {}, cfg = SPAWN_CONFIG) {
  if (spawnIndex < cfg.openingSpawns) return toEntries(cfg.openingWeights);
  const max = maxSpawnValue(highest, cfg);
  const table = toEntries(cfg.weights).filter(([v]) => v <= max);
  return table.length ? table : [[2, 1]];
}

export function generateValue(rng = Math.random, ctx = {}, cfg = SPAWN_CONFIG) {
  const table = spawnTable(ctx, cfg);
  const total = table.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [v, w] of table) {
    roll -= w;
    if (roll < 0) return v;
  }
  return table[table.length - 1][0];
}

/** Small deterministic PRNG, used by tests. */
export function seededRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
