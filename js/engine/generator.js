// Weighted random block generator. Tune SPAWN_CONFIG to change difficulty.
//
// Spawn odds scale with `best`: the highest value merged so far in the
// current game. The tier with the largest `from` ≤ best is used, so as the
// player progresses, small blocks (2, 4) become rarer and larger blocks
// appear more often. Weights are relative (they do not need to sum to 100).

export const SPAWN_CONFIG = {
  tiers: [
    { from: 0, weights: { 2: 60, 4: 40 } },
    { from: 32, weights: { 2: 45, 4: 35, 8: 20 } },
    { from: 128, weights: { 2: 30, 4: 32, 8: 25, 16: 13 } },
    { from: 256, weights: { 2: 20, 4: 28, 8: 27, 16: 17, 32: 8 } },
    { from: 512, weights: { 2: 12, 4: 22, 8: 27, 16: 22, 32: 12, 64: 5 } },
    { from: 1024, weights: { 2: 6, 4: 14, 8: 24, 16: 26, 32: 18, 64: 9, 128: 3 } },
    { from: 2048, weights: { 2: 3, 4: 8, 8: 17, 16: 24, 32: 24, 64: 15, 128: 7, 256: 2 } },
    { from: 4096, weights: { 2: 2, 4: 5, 8: 11, 16: 19, 32: 24, 64: 20, 128: 12, 256: 5, 512: 2 } },
    { from: 8192, weights: { 2: 1, 4: 3, 8: 8, 16: 15, 32: 22, 64: 22, 128: 16, 256: 9, 512: 4 } },
  ],
};

const toEntries = (weights) =>
  Object.entries(weights)
    .map(([v, w]) => [Number(v), Number(w)])
    .filter(([v, w]) => v >= 2 && w > 0)
    .sort((a, b) => a[0] - b[0]);

export function spawnTier(best = 0, cfg = SPAWN_CONFIG) {
  let tier = cfg.tiers[0];
  for (const t of cfg.tiers) if (best >= t.from) tier = t;
  return tier;
}

/** Returns the [value, weight] table used for the given progress. */
export function spawnTable({ best = 0 } = {}, cfg = SPAWN_CONFIG) {
  const table = toEntries(spawnTier(best, cfg).weights);
  return table.length ? table : [[2, 1]];
}

/** Probability (0..1) of each value for the given progress, e.g. { 2: 0.06, … }. */
export function spawnOdds(ctx, cfg = SPAWN_CONFIG) {
  const table = spawnTable(ctx, cfg);
  const total = table.reduce((s, [, w]) => s + w, 0);
  return Object.fromEntries(table.map(([v, w]) => [v, w / total]));
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
