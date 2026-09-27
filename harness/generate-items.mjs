/**
 * generate-items.mjs — deterministic, seeded generator for the A3 item bank.
 *
 * DESIGN (read before touching anything)
 * ------------------------------------------------------------------
 * The central hazard: an LLM authoring the items that will grade an LLM.
 * Two failure modes, and the countermeasure for each:
 *
 *   (1) CONTAMINATION — trivia recalled from pretraining is in the training
 *       data, so "correct" measures recall, not capability.
 *       Countermeasure: the large majority of items are emitted by a program
 *       whose answer is *computed* from a seed. The prompt text and the answer
 *       come from the same parameter object, so an item cannot accidentally be
 *       a fact the model memorised. Nothing here asks the model to recall
 *       anything that is not printed in its own prompt.
 *
 *   (2) STYLE SELF-PREFERENCE — items biased toward the author's reasoning
 *       habits. Countermeasure: every item states its answer format explicitly
 *       and is scored by a deterministic checker, so the surface phrasing of
 *       the author's own answers is never what earns the point.
 *
 * ARCHITECTURE — the split that makes self-verification meaningful:
 *
 *   itemSpecs(seed)        -> parameters ONLY. Contains no ground truth.
 *   buildBank(seed)        -> computes `expected` (ALGORITHM 1) and emits items.
 *
 *   verify-items.mjs never imports the ground-truth helpers below. It re-derives
 *   every `expected` from itemSpecs(seed) with a SECOND, differently written
 *   implementation and compares against the file on disk. If the two were the
 *   same code that check would be worth nothing, so they are deliberately kept
 *   different in shape: naive repeated multiplication vs binary exponentiation;
 *   Cramer's rule vs Bareiss elimination plus residual; BFS vs Bellman-Ford;
 *   KMP-automaton DP vs exhaustive enumeration; hash-map two-sum vs sort +
 *   two-pointer.
 *
 * DETERMINISM: no Date, no Math.random, no filesystem, no network, no locale
 * formatting. Every number comes from mulberry32(SEED). `items.json` is a pure
 * function of (SEED, item id).
 *
 * HARNESS CONTRACT (verified against harness/scorers.mjs, NOT against README.md):
 *   - `scorer_args` keys are camelCase; the implementation destructures
 *     `caseSensitive` / `absTol` / ... . snake_case is silently ignored, so the
 *     camelCase spelling is used throughout here.
 *   - `custom_fn` is NOT used: it has no registration hook in the production
 *     path (bin/run-bench.mjs imports pool/report/items only), so every
 *     custom_fn item would silently score 0.
 *   - `regex` refuses subjects over 20 000 chars (scorers.mjs:113), so the
 *     60k-token needle items are scored with `exact_match`, never `regex`.
 *   - `category` is a free string (items.mjs:54 only type-checks it), so this
 *     bank uses names outside items.mjs's CATEGORIES constant.
 *
 * SEED = 20260927. Changing it changes the bank.
 */

import vm from 'node:vm';

export const SEED = 20260927;
export const GENERATOR_VERSION = 'A3/1.1.0';

// ---------------------------------------------------------------------------
// PRNG — mulberry32. Integer-exact, no state leakage, identical across engines.
// ---------------------------------------------------------------------------

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  constructor(seed) { this.next = mulberry32(seed); }
  float(lo = 0, hi = 1) { return lo + this.next() * (hi - lo); }
  /** integer in [lo, hi] inclusive */
  int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
  /** Fisher-Yates on a copy. */
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const k = this.int(0, i);
      [a[i], a[k]] = [a[k], a[i]];
    }
    return a;
  }
  sample(arr, k) { return this.shuffle(arr).slice(0, Math.min(k, arr.length)); }
}

/** Deterministic FNV-1a string hash, used to derive per-item RNG streams. */
function hash32(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const j = (v) => JSON.stringify(v);

function permutations(arr) {
  if (arr.length === 0) return [[]];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return Math.abs(a); }

// ---------------------------------------------------------------------------
// Vocabulary for generated prose. Fixed lists, never model-generated, so filler
// text cannot accidentally encode a "correct" answer.
// ---------------------------------------------------------------------------

const COLOR_W = ['red', 'green', 'blue', 'amber', 'violet', 'teal'];
const NAME_W = ['Ito', 'Marek', 'Sena', 'Dov', 'Rui', 'Kaan', 'Nils', 'Yara', 'Piet', 'Om'];
const PET_W = ['canary', 'otter', 'lynx', 'heron', 'newt', 'ibex'];
const THING_W = ['cartridge', 'lantern', 'beacon', 'girder', 'cistern', 'quarry', 'trellis', 'kiln', 'vellum', 'anchor', 'sparrow', 'furnace', 'marble', 'lattice', 'basin', 'hopper'];
const ADJ_W = ['narrow', 'damp', 'hollow', 'sunlit', 'rusted', 'quiet', 'tidal', 'cobbled', 'frosted', 'braided', 'leaning', 'sealed', 'polished', 'windy'];
const VERB_W = ['rested', 'settled', 'leaned', 'paused', 'glowed', 'turned', 'waited', 'tilted', 'gathered', 'hummed'];
const PLACE_W = ['harbour', 'terrace', 'meadow', 'kiln yard', 'east quay', 'ridge', 'basin', 'workshop', 'orchard', 'cistern', 'landing', 'gallery'];

/**
 * Synthetic filler sentence.
 *
 * IMPORTANT: the filler deliberately CONTAINS numbers. An earlier version was
 * digit-free, which meant the needle code was the only 4-digit string anywhere in
 * the haystack — so "return the only 4-digit number in the document" solved the
 * item without reading anything, and the category measured digit salience rather
 * than long-context retrieval. The numbers below are drawn to differ from the
 * needle, and the verifier asserts both that the needle still occurs exactly once
 * and that the haystack carries several OTHER 4-digit numbers, so salience alone
 * cannot answer the item.
 */
const FILLER_NUMBERS = ['4180', '7253', '3096', '5841', '2768', '9104', '4637', '8320', '1955', '6472'];

function fillerSentence(rng, needleCode) {
  let s = `the ${rng.pick(ADJ_W)} ${rng.pick(THING_W)} ${rng.pick(VERB_W)} beside the ${rng.pick(PLACE_W)}`;
  const roll = rng.next();
  if (roll < 0.34) {
    let num = rng.pick(FILLER_NUMBERS);
    let guard = 0;
    // never emit the needle itself, or any number that would contain or be
    // contained by it (the scorer's exact_match would then be ambiguous)
    while ((num === needleCode || num.includes(needleCode) || needleCode.includes(num)) && guard++ < 20) {
      num = rng.pick(FILLER_NUMBERS);
    }
    s += ` (unit ${num})`;
  } else if (roll < 0.44) {
    s += `, log ${String.fromCharCode(65 + rng.int(0, 25))}${rng.int(1, 9)}${rng.int(10, 99)}`;
  }
  return s;
}

// ===========================================================================
// ALGORITHM 1 — the ground truth that goes into the bank.
// Exported so the report and the verifier's differential tests can use them;
// the verifier's own re-derivation is written separately in verify-items.mjs.
// ===========================================================================

/** Sum of a^e mod m, by deliberately naive repeated multiplication. */
export function truthModPow(terms, m) {
  let total = 0;
  for (const t of terms) {
    let p = 1;
    for (let i = 0; i < t.e; i++) p = (p * t.a) % m;   // e multiplications, no shortcuts
    total = (total + p) % m;
  }
  return total;
}

/** Exact integer determinant, fraction-free (Bareiss) elimination. */
export function detBareiss(A) {
  const size = A.length;
  const M = A.map((r) => r.slice());
  let prev = 1;
  for (let k = 0; k < size - 1; k++) {
    if (M[k][k] === 0) return 0;
    for (let i = k + 1; i < size; i++) {
      for (let c = k + 1; c < size; c++) {
        M[i][c] = (M[i][c] * M[k][k] - M[i][k] * M[k][c]) / prev;
      }
      M[i][k] = 0;
    }
    prev = M[k][k];
  }
  return M[size - 1][size - 1];
}

/** Exact rational solution by Cramer's rule, as a space-separated string. */
export function truthLinearCramer(A, b) {
  const d = detBareiss(A);
  const out = [];
  for (let k = 0; k < A.length; k++) {
    const Ak = A.map((row, i) => row.map((v, c) => (c === k ? b[i] : v)));
    let num = detBareiss(Ak), den = d;
    if (den < 0) { num = -num; den = -den; }            // keep the sign in the numerator
    if (num % den === 0) { out.push(String(num / den)); continue; }
    const g = gcd(num, den) || 1;
    out.push(`${num / g}/${den / g}`);
  }
  return out.join(' ');
}

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];        // R, D, L, U

function passable(s, c, r) {
  if (c < 0 || r < 0 || c >= s.W || r >= s.H) return false;
  return !s.walls.some((w) => w[0] === c && w[1] === r);
}

/** Shortest distance by BFS over levels. */
export function truthBfsDist(s) {
  const key = (c, r) => `${c},${r}`;
  const dist = new Map([[key(s.start[0], s.start[1]), 0]]);
  let frontier = [s.start];
  let d = 0;
  while (frontier.length && d < 500) {
    const next = [];
    for (const [c, r] of frontier) {
      for (const [dc, dr] of DIRS) {
        const nc = c + dc, nr = r + dr, k = key(nc, nr);
        if (passable(s, nc, nr) && !dist.has(k)) { dist.set(k, d + 1); next.push([nc, nr]); }
      }
    }
    frontier = next; d++;
  }
  const g = dist.get(key(s.goal[0], s.goal[1]));
  return g === undefined ? null : g;
}

/** Number of distinct shortest paths, by DP over BFS layers. */
export function truthBfsPathCount(s) {
  const key = (c, r) => `${c},${r}`;
  const dist = new Map([[key(s.start[0], s.start[1]), 0]]);
  const count = new Map([[key(s.start[0], s.start[1]), 1]]);
  let frontier = [s.start], d = 0;
  while (frontier.length && d < 500) {
    const next = [];
    for (const [c, r] of frontier) {
      for (const [dc, dr] of DIRS) {
        const nc = c + dc, nr = r + dr, k = key(nc, nr);
        if (!passable(s, nc, nr)) continue;
        const seen = dist.get(k);
        if (seen === undefined) { dist.set(k, d + 1); count.set(k, count.get(key(c, r))); next.push([nc, nr]); }
        else if (seen === d + 1) { count.set(k, count.get(k) + count.get(key(c, r))); }
      }
    }
    frontier = next; d++;
  }
  return count.get(key(s.goal[0], s.goal[1])) ?? null;
}

/** KMP-automaton DP counting strings that contain a block at least once.
 *  State m is ABSORBING: once a string has matched, every later letter keeps it
 *  in state m. Without absorption this under-counts, because a string that
 *  matched early and continued would leave state m and be counted as a miss. */
export function truthSubstringCount(alphabet, len, pattern) {
  const m = pattern.length;
  const pi = new Array(m).fill(0);
  for (let i = 1; i < m; i++) {
    let k = pi[i - 1];
    while (k > 0 && pattern[i] !== pattern[k]) k = pi[k - 1];
    if (pattern[i] === pattern[k]) k++;
    pi[i] = k;
  }
  const trans = alphabet.map((ch) => {
    const t = [];
    for (let st = 0; st <= m; st++) {
      if (st === m) { t.push(m); continue; }             // absorbing
      let k = st;
      while (k > 0 && pattern[k] !== ch) k = pi[k - 1];
      t.push(pattern[k] === ch ? k + 1 : 0);
    }
    return t;
  });
  let cur = new Array(m + 1).fill(0);
  cur[0] = 1;
  for (let pos = 0; pos < len; pos++) {
    const nx = new Array(m + 1).fill(0);
    for (let st = 0; st <= m; st++) {
      if (!cur[st]) continue;
      for (let a = 0; a < trans.length; a++) nx[trans[a][st]] += cur[st];
    }
    cur = nx;
  }
  return cur[m];
}

/** Forward simulation of an operation chain. */
export function truthChain(start, steps) {
  let v = start;
  for (const [op, num] of steps) {
    v = op === '+' ? v + num : op === '-' ? v - num : v * num;
  }
  return v;
}

const ML_TASKS = ['sum', 'chain', 'reverse_sub'];

/** Ground truth for the shared multilingual tasks. */
export function truthMlTask(task, p) {
  if (task === 'sum') return p.nums.reduce((a, b) => a + b, 0);
  if (task === 'chain') return p.crates * p.per * p.price - p.rebate + p.fee;
  if (task === 'reverse_sub') {
    const rev = p.digits.split('').reverse().join('');
    return Math.abs(Number(p.digits) - Number(rev));
  }
  throw new Error('truthMlTask: unknown task ' + task);
}

// ===========================================================================
// GENERATORS — each returns a SPEC (parameters only, no answer).
// ===========================================================================

// --- 1. reasoning -----------------------------------------------------------

function specModPow(rng, id) {
  const m = rng.pick([7, 9, 11, 13, 17, 19, 23, 29, 31, 101]);
  const terms = Array.from({ length: rng.int(3, 4) }, () => {
    // a is re-drawn while it is 0 mod m, so no term is a misleading 0^e = 0
    let a = rng.int(2, 40);
    while (a % m === 0) a = rng.int(2, 40);
    return { a, e: rng.int(3, 9) };
  });
  return { id, category: 'reasoning', provenance: 'generated', verify_kind: 'modpow', terms, m,
    tags: ['metric:pass_at_1', 'fmt:integer'] };
}

function specLinear(rng, id) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const size = rng.pick([2, 3]);
    const A = Array.from({ length: size }, () => Array.from({ length: size }, () => rng.int(-6, 9)));
    const xTrue = Array.from({ length: size }, () => rng.int(-7, 9));
    const b = A.map((row) => row.reduce((acc, a, k) => acc + a * xTrue[k], 0));
    if (detBareiss(A) === 0) continue;                    // Cramer needs a nonzero determinant
    return { id, category: 'reasoning', provenance: 'generated', verify_kind: 'linear',
      A, b, size, tags: ['metric:pass_at_1', 'fmt:vector'] };
  }
  throw new Error('linear: no nonsingular system found');
}

function specLogicGrid(rng, id) {
  const people = rng.sample(NAME_W, 3), colors = rng.sample(COLOR_W, 3), pets = rng.sample(PET_W, 3);
  for (let attempt = 0; attempt < 500; attempt++) {
    const assign = {
      person: Object.fromEntries(rng.shuffle(people).map((v, i) => [v, i + 1])),
      color: Object.fromEntries(rng.shuffle(colors).map((v, i) => [v, i + 1])),
      pet: Object.fromEntries(rng.shuffle(pets).map((v, i) => [v, i + 1])),
    };
    const pool = buildCluePool(people, colors, pets, assign);
    const chosen = [];
    for (const clue of pool) {                             // fixed order -> deterministic
      chosen.push(clue);
      if (countSolutions(people, colors, pets, chosen) === 1) break;
    }
    if (countSolutions(people, colors, pets, chosen) !== 1) continue;
    const targetPet = rng.pick(pets);
    // The answer is the colour AT the pet's position: find the colour whose
    // position equals the pet's position. Indexing the colour table with the pet
    // name (as an earlier draft did) yields undefined.
    const petPos = assign.pet[targetPet];
    const answer = colors.find((c) => assign.color[c] === petPos);
    if (answer === undefined) continue;
    return {
      id, category: 'reasoning', provenance: 'generated', verify_kind: 'logicgrid',
      people, colors, pets, clues: chosen, question: `What colour is the house where the ${targetPet} lives?`,
      answer, tags: ['metric:pass_at_1', 'fmt:word'],
    };
  }
  throw new Error('logicgrid: no uniquely-solvable grid found');
}

function buildCluePool(people, colors, pets, assign) {
  const pool = [];
  for (const c of colors) pool.push({ kind: 'colorAt', color: c, pos: assign.color[c], text: `The ${c} house is number ${assign.color[c]}.` });
  for (const p of people) pool.push({ kind: 'personAt', person: p, pos: assign.person[p], text: `${p} lives in house number ${assign.person[p]}.` });
  for (const q of pets) for (const c of colors) {
    if (assign.pet[q] !== assign.color[c]) pool.push({ kind: 'petNotColor', pet: q, color: c, text: `The ${q} is not in the ${c} house.` });
  }
  for (const p of people) for (const c of colors) {
    if (assign.person[p] === assign.color[c] + 1) pool.push({ kind: 'personRightOfColor', person: p, color: c, text: `${p} lives in the house immediately to the right of the ${c} house.` });
    if (assign.person[p] === assign.color[c] - 1) pool.push({ kind: 'personLeftOfColor', person: p, color: c, text: `${p} lives in the house immediately to the left of the ${c} house.` });
  }
  for (const p of people) for (const q of pets) {
    if (assign.person[p] < assign.pet[q]) pool.push({ kind: 'personLeftOfPet', person: p, pet: q, text: `${p} lives somewhere to the left of the ${q}.` });
  }
  return pool;
}

export function gridHolds(clue, w) {
  switch (clue.kind) {
    case 'colorAt': return w.color[clue.color] === clue.pos;
    case 'personAt': return w.person[clue.person] === clue.pos;
    case 'petNotColor': return w.pet[clue.pet] !== w.color[clue.color];
    case 'personRightOfColor': return w.person[clue.person] === w.color[clue.color] + 1;
    case 'personLeftOfColor': return w.person[clue.person] === w.color[clue.color] - 1;
    case 'personLeftOfPet': return w.person[clue.person] < w.pet[clue.pet];
    default: throw new Error('gridHolds: unknown clue kind ' + clue.kind);
  }
}

/** Exhaustive count of grids satisfying every clue. At most 3!^3 = 216. */
export function countSolutions(people, colors, pets, clues) {
  let count = 0;
  for (const pp of permutations(people)) for (const cc of permutations(colors)) for (const pt of permutations(pets)) {
    const w = { person: {}, color: {}, pet: {} };
    pp.forEach((v, i) => { w.person[v] = i + 1; });
    cc.forEach((v, i) => { w.color[v] = i + 1; });
    pt.forEach((v, i) => { w.pet[v] = i + 1; });
    if (clues.every((c) => gridHolds(c, w))) count++;
  }
  return count;
}

function specSubstringCount(rng, id) {
  const alphabet = rng.sample(['A', 'B', 'C'], rng.int(2, 3));
  const len = rng.int(4, 6);
  const patLen = rng.int(2, Math.min(3, len));
  const pattern = Array.from({ length: patLen }, () => rng.pick(alphabet)).join('');
  return { id, category: 'reasoning', provenance: 'generated', verify_kind: 'substring_count',
    alphabet, len, pattern, tags: ['metric:pass_at_1', 'fmt:integer'] };
}

function specGridPath(rng, id, mode) {
  const W = rng.int(4, 5), H = rng.int(4, 5);
  const walls = [];
  for (let i = 0; i < rng.int(3, 6); i++) {
    const c = rng.int(1, W - 2), r = rng.int(1, H - 2);
    if (!walls.some((w) => w[0] === c && w[1] === r)) walls.push([c, r]);
  }
  const s = { W, H, walls, start: [0, 0], goal: [W - 1, H - 1] };
  if (truthBfsDist(s) === null) return null;
  if (mode === 'count' && truthBfsPathCount(s) < 2) return null;   // want a non-trivial count
  return {
    id, category: 'reasoning', provenance: 'generated',
    verify_kind: mode === 'count' ? 'grid_path_count' : 'grid_path',
    W, H, walls, start: s.start, goal: s.goal, tags: ['metric:pass_at_1', 'fmt:integer'],
  };
}

function specChain(rng, id) {
  const ops = ['+', '-', '*'];
  const steps = Array.from({ length: rng.int(4, 5) }, () => [rng.pick(ops), rng.int(2, 19)]);
  return { id, category: 'reasoning', provenance: 'generated', verify_kind: 'chain',
    start: rng.int(11, 97), steps, tags: ['metric:pass_at_1', 'fmt:integer'] };
}

function specReasoning(rng) {
  const out = [];
  for (let k = 1; k <= 3; k++) out.push(specModPow(rng, `rsn-modpow-${pad(k)}`));
  for (let k = 1; k <= 2; k++) out.push(specLinear(rng, `rsn-linear-${pad(k)}`));
  for (let k = 1; k <= 2; k++) out.push(specLogicGrid(rng, `rsn-grid-${pad(k)}`));
  for (let k = 1; k <= 2; k++) out.push(specSubstringCount(rng, `rsn-substr-${pad(k)}`));
  for (let k = 1; k <= 2; k++) { let s = null; while (s === null) s = specGridPath(rng, `rsn-path-${pad(k)}`, 'dist'); out.push(s); }
  { let s = null; while (s === null) s = specGridPath(rng, 'rsn-pathcount-01', 'count'); out.push(s); }
  out.push(specChain(rng, 'rsn-chain-01'));
  return out;                                            // 3+2+2+2+2+1+1 = 13
}

const pad = (k) => String(k).padStart(2, '0');

function buildReasoningPrompt(s) {
  switch (s.verify_kind) {
    case 'modpow': return [
      `Compute (${s.terms.map((t) => `${t.a}^${t.e}`).join(' + ')}) mod ${s.m}, where mod means the non-negative remainder on division by ${s.m}.`,
      `Reply with a single integer and nothing else.`].join(' ');
    case 'linear': {
      const eqs = s.b.map((rhs, i) => {
        const lhs = s.A[i].map((a, k) => (k === 0 ? `${a}` : a >= 0 ? `+ ${a}` : `- ${-a}`) + `*x${k + 1}`).join(' ');
        return `${lhs} = ${rhs}`;
      });
      return [
        `Solve this system of ${s.size} linear equations over the rationals.`,
        eqs.join('   '),
        `Give the values of x1 through x${s.size} in order, separated by single spaces. Use a plain integer when the value is an integer; otherwise use an exact fraction written a/b.`,
        `Reply with the values and nothing else.`].join('\n');
    }
    case 'logicgrid': return [
      `Three houses stand in a row, numbered 1, 2 and 3 from left to right. Each house has exactly one occupant name, one wall colour and one animal, and each of the three names, colours and animals is used exactly once.`,
      `People: ${s.people.join(', ')}.`,
      `Colours: ${s.colors.join(', ')}.`,
      `Animals: ${s.pets.join(', ')}.`,
      `Facts:`,
      ...s.clues.map((c) => `- ${c.text}`),
      `Question: ${s.question}`,
      `Reply with the single colour word only, in lowercase, nothing else.`].join('\n');
    case 'substring_count': return [
      `How many different strings of length ${s.len} can be formed using only the letters ${s.alphabet.join(', ')} (each position chosen independently, repetition allowed) such that the string contains the contiguous block "${s.pattern}"?`,
      `Count each distinct string once, even when it contains the block more than once.`,
      `Reply with a single integer and nothing else.`].join(' ');
    case 'grid_path': return gridPrompt(s, 'dist');
    case 'grid_path_count': return gridPrompt(s, 'count');
    case 'chain': return chainPrompt(s.start, s.steps);
    default: throw new Error('buildReasoningPrompt: ' + s.verify_kind);
  }
}

function gridPrompt(s, mode) {
  const wallList = s.walls.map(([c, r]) => `(${c},${r})`).join(' ');
  return [
    `A robot starts at cell (${s.start[0]},${s.start[1]}) of a ${s.W} by ${s.H} grid, where each cell is written (column,row) and both indices start at 0.`,
    `It may move one cell at a time up, down, left or right, and may not enter the blocked cells ${wallList}.`,
    `The goal is cell (${s.goal[0]},${s.goal[1]}).`,
    mode === 'count'
      ? `How many distinct shortest paths take it from the start to the goal? Count each path once.`
      : `What is the minimum number of moves needed to reach the goal?`,
    `Reply with a single integer and nothing else.`].join(' ');
}

function chainPrompt(start, steps) {
  const verb = { '+': 'Add', '-': 'Subtract', '*': 'Multiply by' };
  return [
    `Start from the number ${start}.`,
    ...steps.map(([op, num]) => `${verb[op]} ${num}.`),
    `Apply the steps in the order given. What is the resulting number?`,
    `Reply with a single integer and nothing else.`].join(' ');
}

// --- 2. code ----------------------------------------------------------------

/**
 * The prompt shows a complete function and one concrete call. The expected value
 * is what that call actually returns, obtained by executing the shown source in
 * a fresh V8 context (vm.runInNewContext) — never predicted. `alt1` and `alt2`
 * are independent re-implementations of the same semantics, used by the verifier
 * as a differential check on that execution.
 */
export const CODE_TASKS = [
  {
    key: 'two_sum',
    src: () => `function solve(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return seen.get(need) + ',' + i;
    seen.set(nums[i], i);
  }
  return 'none';
}`,
    call: (p) => `solve([${p.nums.join(', ')}], ${p.target})`,
    make: (rng) => {
      const n = 6;
      const nums = Array.from({ length: n }, () => rng.int(1, 60));
      const a = rng.int(0, n - 2), b = rng.int(a + 1, n - 1);
      return { nums, target: nums[a] + nums[b] };
    },
    alt1: `function solve(nums, target){ for(let a=0;a<nums.length;a++) for(let b=a+1;b<nums.length;b++) if(nums[a]+nums[b]===target) return a+','+b; return 'none'; }`,
    alt2: `function solve(nums, target){ const ix=nums.map((v,i)=>[v,i]).sort((p,q)=>p[0]-q[0]); let lo=0,hi=ix.length-1; while(lo<hi){ const s=ix[lo][0]+ix[hi][0]; if(s===target){ const x=ix[lo][1],y=ix[hi][1]; return (x<y?x+','+y:y+','+x); } if(s<target) lo++; else hi--; } return 'none'; }`,
  },
  {
    key: 'anagram',
    src: () => `function solve(a, b) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').split('').sort().join('');
  return norm(a) === norm(b) ? 'true' : 'false';
}`,
    call: (p) => `solve("${p.a}", "${p.b}")`,
    make: (rng) => {
      const w = rng.pick(THING_W);
      const noisy = (s) => s.split('').map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c)).join('');
      if (rng.next() < 0.5) {
        const a = w + rng.int(2, 40);
        return { a: noisy(a), b: [...a].reverse().join('') };        // true positive
      }
      return { a: w + rng.int(2, 40), b: w + rng.int(41, 90) };        // true negative
    },
    alt1: `function solve(a,b){ const f=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'').split('').sort().join(''); return f(a)===f(b)?'true':'false'; }`,
    alt2: `function solve(a,b){ const c=s=>{ const m={}; for(const ch of s.toLowerCase()) if(/[a-z0-9]/.test(ch)) m[ch]=(m[ch]||0)+1; return m; }; const A=c(a),B=c(b); const ka=Object.keys(A); if(ka.length!==Object.keys(B).length) return 'false'; return ka.every(k=>A[k]===B[k])?'true':'false'; }`,
  },
  {
    key: 'longest_palindrome',
    src: () => `function solve(s) {
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    let a = i, b = i;
    while (a >= 0 && b < s.length && s[a] === s[b]) { if (b - a + 1 > best) best = b - a + 1; a--; b++; }
    a = i; b = i + 1;
    while (a >= 0 && b < s.length && s[a] === s[b]) { if (b - a + 1 > best) best = b - a + 1; a--; b++; }
  }
  return best;
}`,
    call: (p) => `solve("${p.s}")`,
    make: (rng) => {
      const letters = 'abcdefgh';
      let s = Array.from({ length: rng.int(14, 20) }, () => rng.pick(letters.split(''))).join('');
      const core = rng.pick(['abcba', 'racecar', 'level', 'rotor', 'solos']);   // force a real palindrome
      const at = rng.int(0, s.length - core.length);
      s = s.slice(0, at) + core + s.slice(at + core.length);
      return { s };
    },
    alt1: `function solve(s){ let b=1; for(let i=0;i<s.length;i++) for(let k=i;k<s.length;k++){ const t=s.slice(i,k+1); if(t===Array.from(t).reverse().join('')) b=Math.max(b,t.length); } return b; }`,
    alt2: `function solve(s){ const L=s.length; const d=Array.from({length:L},()=>new Array(L).fill(0)); let b=0; for(let c=0;c<L;c++){ d[c][c]=1; b=Math.max(b,1);} for(let sp=2;sp<=L;sp++) for(let i=0;i+sp-1<L;i++){ const k=i+sp-1; if(s[i]===s[k]){ d[i][k]=(sp===2)?1:2+d[i+1][k-1]; b=Math.max(b,d[i][k]); } } return b; }`,
  },
  {
    key: 'primes',
    src: () => `function solve(n) {
  const sieve = new Array(n).fill(true);
  for (let p = 2; p * p < n; p++) if (sieve[p]) for (let q = p * p; q < n; q += p) sieve[q] = false;
  let c = 0;
  for (let i = 2; i < n; i++) if (sieve[i]) c++;
  return c;
}`,
    call: (p) => `solve(${p.n})`,
    make: (rng) => ({ n: rng.pick([1000, 1500, 2000, 3000, 5000]) }),
    alt1: `function solve(n){ let c=0; for(let i=2;i<n;i++){ let ok=true; for(let d=2;d*d<=i;d++) if(i%d===0){ok=false;break;} if(ok)c++; } return c; }`,
    alt2: `function solve(n){ const ps=[]; for(let k=2;k<n;k++){ let ok=true; for(const q of ps){ if(q*q>k) break; if(k%q===0){ok=false;break;} } if(ok) ps.push(k); } return ps.length; }`,
  },
  {
    key: 'nested_sum',
    src: () => `function solve(v) {
  if (typeof v === 'number') return v;
  let t = 0;
  for (const x of v) t += solve(x);
  return t;
}`,
    call: (p) => `solve(${j(p.arr)})`,
    make: (rng) => {
      const leaf = () => rng.int(1, 60);
      const arr = [];
      for (let i = 0, k = rng.int(3, 5); i < k; i++) {
        if (rng.next() < 0.5) arr.push(leaf());
        else {
          const inner = [];
          for (let t = 0, m = rng.int(2, 4); t < m; t++) inner.push(rng.next() < 0.4 ? leaf() : [leaf(), leaf()]);
          arr.push(inner);
        }
      }
      return { arr };
    },
    alt1: `function solve(v){ return Array.isArray(v) ? v.reduce((a,x)=>a+solve(x),0) : v; }`,
    alt2: `function solve(v){ const flat=[]; (function w(x){ if(typeof x==='number'){ flat.push(x); return; } for(const y of x) w(y); })(v); let t=0; for(let i=0;i<flat.length;i++) t+=flat[i]; return t; }`,
  },
  {
    key: 'brackets',
    src: () => `function solve(s) {
  const close = { ')': '(', ']': '[', '}': '{' };
  const st = [];
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') st.push(ch);
    else if (close[ch]) { if (st.pop() !== close[ch]) return 'false'; }
  }
  return st.length === 0 ? 'true' : 'false';
}`,
    call: (p) => `solve("${p.s}")`,
    make: (rng) => {
      if (rng.next() < 0.5) {                              // well-formed
        const pairs = { '(': ')', '[': ']', '{': '}' };
        const ks = Object.keys(pairs);
        const seq = [];
        for (let i = 0; i < 6; i++) { const k = rng.pick(ks); seq.push(k, pairs[k]); }
        return { s: seq.join('') };
      }
      return { s: '(' + rng.pick([']', '}', ')']) };        // provably unbalanced
    },
    alt1: `function solve(s){ const pairs={')':'(',']':'[','}':'{'}; const st=[]; for(const ch of s){ if('([{'.indexOf(ch)>=0) st.push(ch); else if(ch in pairs){ if(!st.length||st.pop()!==pairs[ch]) return 'false'; } } return st.length===0?'true':'false'; }`,
    alt2: `function solve(s){ let t=s; for(let g=0;g<s.length+1;g++){ const before=t; t=t.split('()').join('').split('[]').join('').split('{}').join(''); if(t===before) break; } return t.length===0?'true':'false'; }`,
  },
  {
    key: 'rle',
    src: () => `function solve(s) {
  let out = '', run = 1;
  for (let i = 1; i <= s.length; i++) {
    if (s[i] === s[i - 1] && i < s.length) run++;
    else { out += s[i - 1] + run; run = 1; }
  }
  return out;
}`,
    call: (p) => `solve("${p.s}")`,
    make: (rng) => {
      const letters = 'abcdef';
      let s = '';
      while (s.length < 16) s += rng.pick(letters.split('')).repeat(rng.int(1, 3));
      return { s };
    },
    alt1: `function solve(s){ let o='',i=0; while(i<s.length){ let k=i; while(k<s.length&&s[k]===s[i])k++; o+=s[i]+(k-i); i=k; } return o; }`,
    alt2: `function solve(s){ const g=s.match(/(.)\\1*/g); return g.map(m=>m[0]+m.length).join(''); }`,
  },
  {
    key: 'fib_mod',
    src: () => `function solve(n, m) {
  const f = (k) => {
    if (k === 0) return [0, 1];
    const [a, b] = f(Math.floor(k / 2));
    const c = (a * (2 * b - a + m)) % m;
    const d = (a * a + b * b) % m;
    return k % 2 === 0 ? [c, d] : [d, (c + d) % m];
  };
  return f(n)[0];
}`,
    call: (p) => `solve(${p.n}, ${p.m})`,
    make: (rng) => ({ n: rng.pick([100, 120, 150, 200]), m: rng.pick([1000003, 999983, 1000007]) }),
    alt1: `function solve(n,m){ let a=0,b=1; for(let k=0;k<n;k++){ const t=(a+b)%m; a=b; b=t; } return a; }`,
    // pairs are (F(k), F(k+1)); the monoid identity is (0,1). The previous
    // version used a 2x2 representation whose multiplication law was wrong and
    // returned F(n) for the wrong index — the differential test caught it.
    alt2: `function solve(n,m){ const mul=(a,b)=>[(a[0]*(b[1]-b[0])+a[1]*b[0])%m,(a[0]*b[0]+a[1]*b[1])%m]; let r=[0,1],base=[1,1],e=n; while(e>0){ if(e&1) r=mul(r,base); base=mul(base,base); e=Math.floor(e/2);} return r[0]; }`,
  },
];

function specCode(rng) {
  return CODE_TASKS.map((t) => {
    const params = t.make(rng);
    return { id: `cod-${t.key}`, category: 'code', provenance: 'generated', verify_kind: 'code_exec',
      task: t.key, params, tags: ['metric:pass_at_1', 'fmt:scalar'] };
  });
}

function buildCodePrompt(s) {
  const t = CODE_TASKS.find((x) => x.key === s.task);
  return [
    `Read the function below, then report what one specific call returns. Do not modify the function.`,
    ``, '```javascript', t.src(s.params), '```', ``,
    `Evaluate exactly this call:`, '```javascript', t.call(s.params), '```', ``,
    `Reply with only the exact text that console.log would print for the return value. If the return value is a string, print the string itself with no surrounding quotes. No explanation, no code, nothing else.`,
  ].join('\n');
}

/** Execute `fnSource(...)` and return its result as a string. */
export function execCall(fnSource, call) {
  const ctx = vm.createContext(Object.create(null));
  return String(vm.runInContext(`${fnSource}\n${call}`, ctx, { timeout: 2000 }));
}

// --- 3. instruction_following ----------------------------------------------

/**
 * Each item is a *constraint test* and the scorer IS the constraint checker.
 * To keep the pre-registered `ifeval_inst_strict` well defined, most items carry
 * exactly ONE verifiable instruction, so an item's pass/fail is exactly one
 * instruction followed. Items tagged ifeval_unit:prompt carry 2-3 instructions
 * and are all-or-nothing; they feed `ifeval_prompt_strict` instead.
 *
 * `probe.good` is a compliant answer and `probe.bad` are violating answers. The
 * verifier checks the constraint SEMANTICALLY with its own checker AND requires
 * the scorer to agree, so a regex that is looser or tighter than the constraint
 * it claims to enforce fails the build.
 */
function specInstruction(rng) {
  const out = [];
  const WORDS = ['lantern', 'quiet', 'river', 'amber', 'hollow', 'stone', 'window', 'winter', 'meadow', 'copper', 'silent', 'garden'];

  for (const nw of [4, 5, 6]) {
    const content = rng.sample(WORDS, nw);
    out.push({
      id: `ifr-words-${nw}`, category: 'instruction_following', provenance: 'generated',
      verify_kind: 'if_words', n: nw, subject: rng.pick(COLOR_W), ifeval_unit: 'instruction',
      probe: {
        good: content.join(' '),
        bad: [content.slice(0, nw - 1).join(' '), [...content, 'and'].join(' '), `${content.join(' ')} please`],
      },
      tags: ['metric:ifeval_inst_strict', 'fmt:prose'],
    });
  }
  out.push({
    id: 'ifr-lower-01', category: 'instruction_following', provenance: 'generated',
    verify_kind: 'if_lower', ifeval_unit: 'instruction',
    probe: {
      good: 'a harbour at dusk is worth the wait',
      bad: ['A harbour at dusk is worth the wait', 'a Harbour at dusk', 'a harbour at Dusk'],
    },
    tags: ['metric:ifeval_inst_strict', 'fmt:prose'],
  });
  for (const [k, fw] of [['01', 'however'], ['02', 'basically']]) {
    out.push({
      id: `ifr-forbid-${k}`, category: 'instruction_following', provenance: 'generated',
      verify_kind: 'if_forbid', forbidden: fw, ifeval_unit: 'instruction',
      probe: {
        good: 'the lamp was left burning all night long',
        bad: [`the lamp was left burning, ${fw}, all night`, `a ${fw} note about the lamp`, fw],
      },
      tags: ['metric:ifeval_inst_strict', 'fmt:prose'],
    });
  }
  out.push({
    id: 'ifr-tokens-01', category: 'instruction_following', provenance: 'generated',
    verify_kind: 'if_tokens', tokens: ['cobalt', 'thistle', 'quarry'], ifeval_unit: 'instruction',
    probe: {
      good: 'cobalt over the thistle road toward the quarry',
      bad: ['cobalt over the road', 'thistle and quarry beside the river', 'cobalt thistle'],
    },
    tags: ['metric:ifeval_inst_strict', 'fmt:prose'],
  });
  out.push({
    id: 'ifr-nodigit-01', category: 'instruction_following', provenance: 'generated',
    verify_kind: 'if_nodigit', ifeval_unit: 'instruction',
    probe: {
      good: 'the tide came in over the flat sand and stayed',
      // every violation must contain a real digit: "three waves" does NOT violate
      bad: ['the tide came in over the flat sand at 4 am', 'flat sand 2', 'the water rose 17 centimetres'],
    },
    tags: ['metric:ifeval_inst_strict', 'fmt:prose'],
  });
  out.push({
    id: 'ifr-bullets-01', category: 'instruction_following', provenance: 'generated',
    verify_kind: 'if_bullets', count: 3, ifeval_unit: 'instruction',
    probe: {
      good: '- rowan\n- larch\n- holly',
      bad: ['- rowan\n- larch', '- rowan\n- larch\n- holly\n- yew', 'rowan\nlarch\nholly'],
    },
    tags: ['metric:ifeval_inst_strict', 'fmt:list'],
  });
  out.push({
    id: 'ifr-oneline-01', category: 'instruction_following', provenance: 'generated',
    verify_kind: 'if_oneline', ifeval_unit: 'instruction',
    probe: {
      good: 'the workshop door was painted a shade of green',
      bad: ['the workshop door was painted a shade of green\nand the latch was oiled', 'one line\n\n', 'line one\nline two'],
    },
    tags: ['metric:ifeval_inst_strict', 'fmt:prose'],
  });
  out.push({
    id: 'ifr-prefix-01', category: 'instruction_following', provenance: 'generated',
    verify_kind: 'if_prefix', color: rng.pick(['teal', 'ochre', 'oxblood', 'verdigris']),
    ifeval_unit: 'instruction',
    probe: {
      good: `ANSWER: ${null}`,                       // filled in with the drawn colour
      bad: [null, null, null],                       // filled in below
    },
    tags: ['metric:ifeval_inst_strict', 'fmt:prose'],
  });
  for (const [k, subject] of [
    ['01', 'the long pier, which was rebuilt with pine'],
    ['02', 'a slate roof on a small workshop'],
    ['03', 'a ferry that runs twice a day'],
  ]) {
    out.push({
      id: `ifr-multi-${k}`, category: 'instruction_following', provenance: 'generated',
      verify_kind: 'if_multi', subject, ifeval_unit: 'prompt',
      probe: {
        good: subject === 'a slate roof on a small workshop'
          ? 'a slate roof keeps the attic cool in every month of the year'
          : subject === 'a ferry that runs twice a day'
            ? 'the ferry runs twice a day and the crossing takes barely an hour'
            : 'the long pier was rebuilt with pine and it looks fine',
        bad: subject === 'a slate roof on a small workshop'
          ? ['A slate roof keeps the attic cool in every month of the year',
             'a slate roof keeps the attic cool in 7 months of the year',
             'A slate roof keeps the attic cool in 7 months']
          : subject === 'a ferry that runs twice a day'
            ? ['The ferry runs twice a day and the crossing takes barely an hour',
               'the ferry runs 2 times a day and the crossing takes barely an hour',
               'The ferry runs 2 times a day and takes an hour']
            : ['The long pier was rebuilt with pine and it looks fine',
               'the long pier was rebuilt with pine in 3 days',
               'the long pier was rebuilt with pine and it looks fine\n'],
      },
      tags: ['metric:ifeval_prompt_strict', 'fmt:prose'],
    });
  }
  // resolve the prefix probes now that the colour is drawn
  const pf = out.find((s) => s.verify_kind === 'if_prefix');
  pf.probe.good = `ANSWER: ${pf.color}`;
  pf.probe.bad = [
    pf.color,                                        // missing prefix
    `The answer is ${pf.color}`,                     // wrong prefix
    `ANSWER ${pf.color}`,                            // missing colon
  ];
  return out;                                        // 3+1+2+1+1+1+1+1+3 = 14
}

function ifPromptText(s) {
  switch (s.verify_kind) {
    case 'if_words':
      return `Describe the colour ${s.subject} in exactly ${s.n} words. Words are separated by spaces, so hyphenated text counts as one word. Your whole reply must be the description itself: no list, no numbering, no added sentence ending, no extra words.`;
    case 'if_lower':
      return `In one sentence, say why a harbour at dusk is worth stopping for. Your entire reply must consist of lowercase English letters and spaces only, with no capital letter anywhere.`;
    case 'if_forbid':
      return `In one sentence, say what a lamp left burning suggests about a house. Your entire reply must not contain the word "${s.forbidden}" in any capitalisation.`;
    case 'if_tokens':
      return `Write one short sentence that includes all three of these exact words: ${s.tokens.join(', ')}. Each word must appear spelled exactly like that. Reply with the sentence only.`;
    case 'if_nodigit':
      return `In one sentence, describe an early morning on an empty coast. Your entire reply must not contain any digit character, 0 through 9, anywhere. Write number words instead.`;
    case 'if_bullets':
      return `List exactly three items as a plain list, one per line, each line starting with "- " and nothing else on the line. Use these three names, one per line, in this order: rowan, larch, holly. Reply with the list only.`;
    case 'if_oneline':
      return `Describe a workshop in a single line. Your entire reply must be one single line of text and must not contain a line break anywhere, including at the end.`;
    case 'if_prefix':
      return `A paint record lists: colour=${s.color}, size=large, finish=matte. Reply with the value of the colour field from that record, and your entire reply must be exactly the text ANSWER: followed by a space and then that value, with nothing before it and nothing after it.`;
    case 'if_multi':
      return `Write one sentence about ${s.subject}. Your entire reply must be a single line containing lowercase English letters and spaces only: no capital letters, no digits, and no punctuation other than spaces.`;
    default: throw new Error('ifPromptText: ' + s.verify_kind);
  }
}

function wordPattern(k) { return `^\\s*(?:\\S+\\s+){${k - 1}}\\S+\\s*$`; }
const forbidPattern = (w) => `^(?![\\s\\S]*${w})[\\s\\S]*$`;

function scorerForInstruction(s) {
  switch (s.verify_kind) {
    case 'if_words': return { scorer: 'regex', expected: wordPattern(s.n), scorer_args: {} };
    case 'if_lower': return { scorer: 'regex', expected: '^[^A-Z]*$', scorer_args: {} };
    case 'if_forbid': return { scorer: 'regex', expected: forbidPattern(s.forbidden), scorer_args: {} };
    case 'if_tokens': return { scorer: 'multi_all_of', expected: s.tokens, scorer_args: { caseSensitive: false } };
    case 'if_nodigit': return { scorer: 'regex', expected: '^\\D*$', scorer_args: {} };
    case 'if_bullets': return { scorer: 'regex', expected: `^\\s*(?:- [^\\n]+\\n?){${s.count}}$`, scorer_args: {} };
    case 'if_oneline': return { scorer: 'regex', expected: '^[^\\n]*$', scorer_args: {} };
    case 'if_prefix': return { scorer: 'regex', expected: `^ANSWER: ${s.color}$`, scorer_args: {} };
    case 'if_multi': return { scorer: 'regex', expected: '^(?![^\\n]*[A-Z0-9,.;:!?])[^\\n]*$', scorer_args: {} };
    default: throw new Error('scorerForInstruction: ' + s.verify_kind);
  }
}

// --- 4. format_control (json_schema) ---------------------------------------

const FORMAT_KINDS = ['json_flat', 'json_nested', 'json_array_of_objects', 'json_enum_array',
  'json_bool_array', 'json_nullable', 'json_strict', 'json_matrix'];

function specFormat(rng) {
  return FORMAT_KINDS.map((kind, i) => {
    const spec = {
      id: `fmt-${kind.replace('json_', '')}-${pad(i + 1)}`,
      category: 'format_control', provenance: 'generated', verify_kind: kind,
      tags: ['metric:pass_at_1', 'fmt:json'],
    };
    // buildFormatItem is deterministic given the id, so the spec carries the
    // canonical document; makeItem and the verifier both read it from here.
    spec.built = buildFormatItem(spec);
    spec.canonical = spec.built.value;
    return spec;
  });
}

// --- 5. multilingual -------------------------------------------------------

/**
 * Three tasks, each written in ko / en / ja / zh, so the cross-lingual gap is a
 * within-task comparison rather than a difference of subject matter. Every answer
 * is an integer with a large answer space, so a model that cannot read the
 * language cannot land on it by guessing. Plus three code-switched items: an
 * English instruction wrapped around a non-English label block.
 */
const ML_TEXT = {
  sum: {
    en: (p) => `Add the following five numbers and reply with the total only, as a plain integer with no commas, no units and no explanation: ${p.nums.join(', ')}.`,
    ko: (p) => `다음 다섯 개의 수를 모두 더한 합계를 구하세요. 콤마나 단위, 설명 없이 정수 숫자로만 답해 주세요: ${p.nums.join(', ')}.`,
    ja: (p) => `次の5つの数をすべて足した合計を求めてください。カンマや単位、説明は不要です。整数だけで答えてください: ${p.nums.join(', ')}。`,
    zh: (p) => `把下面五个数相加，只用不带逗号、不带单位、不带解释的整数回答总和：${p.nums.join('、')}。`,
  },
  chain: {
    en: (p) => `A shipment has ${p.crates} crates. Each crate holds ${p.per} items. Each item costs ${p.price} credits. A rebate of ${p.rebate} credits is applied to the whole shipment, and then a delivery fee of ${p.fee} credits is added. What is the final amount in credits? First compute ${p.crates} times ${p.per} times ${p.price}. Reply with a single integer and nothing else.`,
    ko: (p) => `배송분에 화물 ${p.crates}개가 있고, 화물 하나에는 ${p.per}개의 물건이 들어 있으며, 물건 하나의 가격은 ${p.price} 크레딧입니다. 전체 배송에 ${p.rebate} 크레딧의 환불을 적용한 다음, 배송비 ${p.fee} 크레딧을 더합니다. 최종 금액은 얼마입니까? 먼저 ${p.crates} 곱하기 ${p.per} 곱하기 ${p.price} 를 계산하세요. 정수 숫자로만 답해 주세요.`,
    ja: (p) => `この shipment には箱が${p.crates}個あり、1箱には${p.per}個入っていて、1個の価格は${p.price}クレジットです。shipment 全体に${p.rebate}クレジットの割引を適用してから、配送料${p.fee}クレジットを加えます。合計はいくらですか。まず ${p.crates} × ${p.per} × ${p.price} を計算してください。整数だけで答えてください。`,
    zh: (p) => `这批货有${p.crates}箱，每箱装${p.per}件，每件${p.price}元。整批先减免${p.rebate}元，再加运费${p.fee}元。最终一共多少元？先算 ${p.crates} × ${p.per} × ${p.price}。只用整数回答。`,
  },
  reverse_sub: {
    en: (p) => `Take the number ${p.digits}. Reverse its digits to form a second number, then subtract the smaller of the two from the larger. Reply with the resulting integer only, no explanation.`,
    ko: (p) => `숫자 ${p.digits} 의 자릿수를 거꾸로 나열해 두 번째 숫자를 만들고, 두 수 중 작은 수를 큰 수에서 빼세요. 결과 정수만 답해 주세요.`,
    ja: (p) => `数字${p.digits}の桁を逆順に並べた数を2つめに取り、2つの数の小さい方を大きい方から引いてください。答えの整数だけを答えてください。`,
    zh: (p) => `把数字${p.digits}的位数倒过来得到第二个数，然后用较大的数减去较小的数。只回答结果的整数，不要解释。`,
  },
};

function makeMlParams(rng, task) {
  if (task === 'sum') return { nums: Array.from({ length: 5 }, () => rng.int(11, 9999)) };
  if (task === 'chain') {
    return { crates: rng.int(11, 89), per: rng.int(7, 23), price: rng.int(11, 97), rebate: rng.int(101, 999), fee: rng.int(101, 999) };
  }
  return { digits: Array.from({ length: rng.int(5, 6) }, () => rng.int(1, 9)).join('') };
}

function specMultilingual(rng) {
  const out = [];
  for (const task of ML_TASKS) {
    for (const lang of ['ko', 'en', 'ja', 'zh']) {
      out.push({
        id: `ml-${task}-${lang}`, category: 'multilingual', provenance: 'generated',
        verify_kind: 'ml_task', task, lang, params: makeMlParams(rng, task),
        tags: ['metric:accuracy_lang', `lang:${lang}`, 'metric:pass_at_1', 'fmt:integer'],
      });
    }
  }
  const zip = String(rng.int(10000, 98999));
  out.push({
    id: 'ml-mixed-ko', category: 'multilingual', provenance: 'generated',
    verify_kind: 'ml_mixed', lang: 'ko', answer: zip,
    instruction: `Read the Korean shipping label below and reply with only the postcode number, as a plain integer.\n\n` +
      `수령인: 김도현\n주소: 서울특별시 관악구 신림동 ${rng.int(10, 99)}호\n우편번호 ${zip}`,
    tags: ['metric:accuracy_lang', 'lang:ko', 'fmt:integer'],
  });
  // A pure 4-digit room code, not "B-417": the `numeric` scorer would extract
  // 417 from "B-417" and then compare it against Number("B-417") = NaN, scoring
  // a correct answer wrong. The item is numeric-scored, so the answer is numeric.
  const room = String(rng.int(1000, 9899));
  out.push({
    id: 'ml-mixed-ja', category: 'multilingual', provenance: 'generated',
    verify_kind: 'ml_mixed', lang: 'ja', answer: room,
    instruction: `Read the Japanese meeting-room sign below and reply with only the 4-digit room code exactly as printed, with no other characters and no explanation.\n\n会議室: 研修室 ${room}\n担当: 田中`,
    tags: ['metric:accuracy_lang', 'lang:ja', 'fmt:integer'],
  });
  const total = String(rng.int(1200, 9800));
  out.push({
    id: 'ml-mixed-zh', category: 'multilingual', provenance: 'generated',
    verify_kind: 'ml_mixed', lang: 'zh', answer: total,
    instruction: `Read the Chinese invoice stub below and reply with only the total amount as a number, without the currency symbol, without thousands separators and without explanation.\n\n发票号: INV-${rng.int(2020, 2029)}-${rng.int(100, 999)}\n金额合计: ￥${total}`,
    tags: ['metric:accuracy_lang', 'lang:zh', 'fmt:integer'],
  });
  return out;                                        // 12 + 3 = 15
}

// --- 6. long_context (needle in a haystack) --------------------------------

/**
 * Sizes are tokens-equivalent using the brief's chars/3 convention for English
 * filler. Depth is the needle's paragraph index as a fraction of the haystack.
 * Ground truth is a generated code: nothing to recall, so a larger model cannot
 * know it in advance. Scored with exact_match, never regex, because
 * scorers.mjs:113 refuses regex subjects over 20 000 chars.
 */
export const NEEDLE_PLAN = [
  { tok: 2000, depth: 0.04 }, { tok: 4000, depth: 0.50 },
  { tok: 6000, depth: 0.96 }, { tok: 10000, depth: 0.08 },
  { tok: 16000, depth: 0.55 }, { tok: 24000, depth: 0.92 },
  { tok: 40000, depth: 0.30 }, { tok: 60000, depth: 0.75 },
];

function specLongContext(rng) {
  return NEEDLE_PLAN.map((p, i) => {
    const code = String(rng.int(1000, 9999));
    return {
      id: `lc-needle-${pad(i + 1)}`, category: 'long_context', provenance: 'generated',
      verify_kind: 'needle', tok: p.tok, depth: p.depth, code, station: rng.int(2, 97),
      seedTag: hash32(`lc:${i}:${code}`),
      tags: ['metric:pass_at_1', 'fmt:integer', `depth:${p.depth < 0.2 ? 'start' : p.depth > 0.8 ? 'end' : 'middle'}`],
    };
  });
}

// --- 7. function_calling ---------------------------------------------------

export const FC_TOOLS = [
  {
    name: 'get_weather',
    args: { city: { type: 'string' }, unit: { type: 'string', enum: ['celsius', 'fahrenheit'] } },
    make: (rng) => ({ city: rng.pick(['Reykjavik', 'Da Nang', 'Bologna', 'Kumasi', 'Tromso']), unit: rng.pick(['celsius', 'fahrenheit']) }),
    say: (a) => `user: "what is the weather in ${a.city}?" — the city is ${a.city} and the unit is "${a.unit}"`,
  },
  {
    name: 'convert_currency',
    args: { amount: { type: 'integer' }, from: { type: 'string', enum: ['USD', 'EUR', 'JPY'] }, to: { type: 'string', enum: ['USD', 'EUR', 'JPY'] } },
    make: (rng) => {
      const [from, to] = rng.sample(['USD', 'EUR', 'JPY'], 2);
      return { amount: rng.int(11, 4999), from, to };
    },
    say: (a) => `user: "convert ${a.amount} ${a.from} into ${a.to}" — the amount is ${a.amount}, the source currency is "${a.from}" and the target currency is "${a.to}"`,
  },
  {
    name: 'search_orders',
    args: { customer_id: { type: 'string' }, status: { type: 'string', enum: ['pending', 'shipped', 'cancelled'] } },
    make: (rng) => ({ customer_id: `C-${rng.int(1000, 9999)}`, status: rng.pick(['pending', 'shipped', 'cancelled']) }),
    say: (a) => `user: "find my orders" — the customer id is ${a.customer_id} and the status filter is "${a.status}"`,
  },
  {
    name: 'set_reminder',
    args: { title: { type: 'string' }, due_iso8601: { type: 'string' }, priority: { type: 'string', enum: ['low', 'normal', 'high'] } },
    make: (rng) => ({
      title: rng.pick(['pay the invoice', 'call the dentist', 'book the boiler service', 'send the deposit']),
      due_iso8601: `2026-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}T09:00:00Z`,
      priority: rng.pick(['low', 'normal', 'high']),
    }),
    say: (a) => `user: "remind me" — the title is "${a.title}", the due time is ${a.due_iso8601} and the priority is "${a.priority}"`,
  },
];

function specFunctionCalling(rng) {
  const out = [];
  for (let i = 0; i < FC_TOOLS.length; i++) {
    const spec = {
      id: `fc-single-${pad(i + 1)}`, category: 'function_calling', provenance: 'generated',
      verify_kind: 'fc', tool: FC_TOOLS[i].name, args: FC_TOOLS[i].make(rng),
      tags: ['metric:task_success_rate', 'fmt:json'],
    };
    spec.canonical = { name: spec.tool, arguments: spec.args };
    out.push(spec);
  }
  for (let k = 0; k < 2; k++) {
    const t = FC_TOOLS[(k + 1) % FC_TOOLS.length];
    const spec = {
      id: `fc-multi-${pad(k + 1)}`, category: 'function_calling', provenance: 'generated',
      verify_kind: 'fc', tool: t.name, args: t.make(rng), multi: true,
      distractor: FC_TOOLS[(k + 3) % FC_TOOLS.length].name,
      tags: ['metric:task_success_rate', 'fmt:json'],
    };
    spec.canonical = { name: spec.tool, arguments: spec.args };
    out.push(spec);
  }
  out.push({
    id: 'fc-hand-01', category: 'function_calling', provenance: 'handwritten-canonical',
    verify_kind: 'fc', tool: 'get_weather', args: { city: 'Reykjavik', unit: 'celsius' },
    canonical: { name: 'get_weather', arguments: { city: 'Reykjavik', unit: 'celsius' } },
    utterance: 'Reykjavik is freezing and my sister is there — what does the forecast say? I want celsius, not fahrenheit.',
    tags: ['metric:task_success_rate', 'fmt:json'],
  });
  out.push({
    id: 'fc-hand-02', category: 'function_calling', provenance: 'handwritten-canonical',
    verify_kind: 'fc', tool: 'search_orders', args: { customer_id: 'C-4471', status: 'cancelled' },
    canonical: { name: 'search_orders', arguments: { customer_id: 'C-4471', status: 'cancelled' } },
    utterance: 'I need every order belonging to customer C-4471 that was cancelled. Only the cancelled ones, not the pending or shipped ones.',
    tags: ['metric:task_success_rate', 'fmt:json'],
  });
  return out;                                        // 4 + 2 + 2 = 8
}

// --- 8. abstention_hallucination -------------------------------------------

/**
 * Six items, both halves grounded in a short passage the prompt contains, so no
 * item requires outside knowledge:
 *   answerable   (3): the passage contains the answer, so an abstention is a
 *                     failure and a correct answer is the desired behaviour.
 *   unanswerable (3): the passage is silent on the question, so the desired
 *                     behaviour is to say so. This isolates "does the model
 *                     notice the evidence is absent" from "does the model know".
 * The passage deliberately contains distractor dates so that recalling a date
 * from the passage is NOT the same as answering the question: the unanswerable
 * questions are about things (prices, head counts, company names) the passage
 * never records.
 */
// The marker alternation, without anchors. A hedged confabulation ("the cost is
// unknown, but I would guess 240 credits") contains an abstention marker, so a
// bare marker search is gameable; ABSTAIN_REGEX below additionally requires that
// the answer contain no digit at all, which is what "I do not know" looks like
// and "here is my invented number" does not.
const ABSTAIN_MARKER =
  '(do(?:es)?\\s+not\\s+(?:say|state|mention|specify|provide|record)|' +
  'no\\s+information\\s+(?:about|on|in|is\\s+given)|' +
  '(?:the|this)\\s+(?:passage|text|diary|log|notes|record)\\s+(?:does\\s+not|doesn\'t|never)\\s+(?:say|state|mention|specify)|' +
  'is\\s+not\\s+(?:stated|mentioned|specified|recorded|given|provided|addressed)|' +
  'not\\s+mentioned|not\\s+stated|not\\s+specified|not\\s+recorded|' +
  'cannot\\s+be\\s+(?:determined|answered|inferred)|' +
  'can(?:not|\'t)\\s+answer|unable\\s+to\\s+(?:answer|determine)|' +
  'no\\s+(?:such\\s+)?(?:record|mention|detail)s?\\s+(?:of|for|in|exist)|' +
  'i\\s+(?:do\\s+not|don\'t)\\s+know|unknown|insufficient\\s+information)';
// No (?i) prefix: JavaScript RegExp has no inline flag group, so `(?i)` makes the
// pattern fail to compile and regexMatch does not catch the throw — the item
// would silently fail every answer. Case-insensitivity comes from
// scorer_args.flags = "i" instead, and the build compiles every pattern.
//
// Full pattern: an abstention marker must appear AND the whole reply must contain
// no digit. `^(?![\\s\\S]*\\d)` rejects any reply carrying a number.
const ABSTAIN_PATTERN = '^(?![\\s\\S]*\\d)[\\s\\S]*(?:' + ABSTAIN_MARKER + ')[\\s\\S]*$';
export { ABSTAIN_PATTERN };

const ABSTENTION_SETS = [
  {
    passage: 'Station log for the northern line. The kettle in the mess room was replaced on 12 March. ' +
      'The signal box lamp was replaced on 26 March. The cart in the yard was replaced on 5 March. ' +
      'A new bench was installed beside the cart on 19 March.',
    answerable: { q: 'On what date was the signal box lamp replaced?', a: '26 March' },
    unanswerable: { q: 'How much did the new bench beside the cart cost?', absent: ['cost', 'price', 'paid', 'bought', '£', '$', 'euro', 'won'] },
  },
  {
    passage: 'Club notes. The choir held its founding rehearsal on 3 April. The folding chairs in the hall ' +
      'were replaced on 17 April. The organ was cleaned on 20 November of the previous year. ' +
      'The piano tuner visited once, at an hour nobody recorded.',
    answerable: { q: 'On what date were the folding chairs in the hall replaced?', a: '17 April' },
    unanswerable: { q: 'How many choir members attended the founding rehearsal?', absent: ['member', 'people', 'sang', 'attendance', 'persons', 'singers', 'voices'] },
  },
  {
    passage: 'Depot diary. The blue door was repainted on 8 May. The roof was retiled on 8 May of the following ' +
      'year. The bench was sanded on 2 June. The gate latch was replaced on 19 June.',
    answerable: { q: 'On what date was the bench sanded?', a: '2 June' },
    unanswerable: { q: 'Which company repainted the blue door at the depot?', absent: ['company', 'ltd', 'inc', 'firm', 'contractor', 'painted by', 'repainted by'] },
  },
];

function specAbstention() {
  return ABSTENTION_SETS.flatMap((set, i) => ([
    {
      id: `abs-ans-${pad(i + 1)}`, category: 'abstention_hallucination', provenance: 'generated',
      verify_kind: 'abstain', answerable: true, passage: set.passage,
      question: set.answerable.q, answer: set.answerable.a,
      tags: ['metric:simpleqa', 'fmt:phrase', 'absent:answerable'],
    },
    {
      id: `abs-noans-${pad(i + 1)}`, category: 'abstention_hallucination', provenance: 'generated',
      verify_kind: 'abstain', answerable: false, passage: set.passage,
      question: set.unanswerable.q, answer: null, absentTerms: set.unanswerable.absent,
      tags: ['metric:simpleqa', 'fmt:abstain', 'absent:unanswerable'],
    },
  ]));                                               // 6
}

// --- 3. canonical public problems (handwritten statement, verified answer) ---
//
// These three are recognisable public puzzles with a fixed published answer.
// The PROBLEM STATEMENT is authored (hence provenance handwritten-canonical);
// the ANSWER is not asserted by the author, it is re-derived by the verifier
// through exhaustive enumeration (two-part six), a state-space search (the
// river crossing) and an actual optimal-solution construction (Hanoi). If the
// author's "known" answer were wrong, the build would fail.

/**
 * EXCLUDED, with reasons. Kept in the artifact so the decision is auditable
 * rather than invisible: an item that cannot be given an unambiguous, machine
 * checked answer does not belong in a bank whose whole value is that its
 * answers are certain.
 */
export const EXCLUDED = [
  {
    id: 'can-twopart-01',
    kind: 'two-part six question',
    reason: 'The canonical puzzle is a riddle whose answer depends on phrasing. ' +
      'Taken literally, "I have a six, but not an eight" is satisfied by SIXTEEN ' +
      'two-digit numbers (16, 26, 36, 46, 56, 60-67, 69, 76, 96) and "a nine, but not a five" by ' +
      'sixteen more, so the pair the question asks for is not determined by the text. ' +
      'Enumeration proves the non-uniqueness, so no ground truth can be asserted. Excluded ' +
      'rather than guessed.',
    evidence: 'verify-items.mjs v2_twoPartSix() enumerates both sets.',
  },
];

const CANONICAL = [
  {
    id: 'can-wolfgoat-01', verify_kind: 'wolf_goat_cabbage',
    prompt: [
      `A farmer must get a wolf, a goat and a cabbage across a river.`,
      `The boat carries the farmer plus at most one item, and the farmer must be in the boat for every crossing.`,
      `The goat cannot be left alone with the wolf, and the goat cannot be left alone with the cabbage. Everything else is harmless.`,
      `What is the minimum number of boat crossings needed to get all three items across? Count every crossing, including the return trips.`,
      `Reply with a single integer and nothing else.`,
    ].join('\n'),
  },
  {
    id: 'can-hanoi-01', verify_kind: 'hanoi',
    prompt: [
      `The Tower of Hanoi puzzle has three pegs and a stack of 7 disks of distinct sizes, smallest on top.`,
      `A legal move transfers the top disk of one peg onto another peg, and a larger disk may never sit on a smaller one.`,
      `What is the minimum number of moves required to move the whole stack from one peg to another peg, starting and ending with all disks stacked?`,
      `Reply with a single integer and nothing else.`,
    ].join('\n'),
  },
];

/** Minimum crossings for the wolf/goat/cabbage river crossing (algorithm 1 side). */
export function truthCrossings() {
  // State: [farmerSide, wolfSide, goatSide, cabbageSide], 0 = left bank.
  const start = '0000', goal = '1111';
  const bad = (s) => {
    const [f, w, g, c] = s.split('').map(Number);
    if (w === g && f !== w) return true;              // wolf and goat alone together
    if (g === c && f !== g) return true;              // goat and cabbage alone together
    return false;
  };
  const seen = new Set([start]);
  let frontier = [start];
  let d = 0;
  if (bad(start)) throw new Error('crossings: start state is illegal');
  while (frontier.length) {
    const next = [];
    for (const st of frontier) {
      if (st === goal) return d;
      const f = Number(st[0]);
      for (let item = 0; item <= 3; item++) {          // 0 = farmer alone, 1..3 = an item
        if (item > 0 && st[item] !== st[0]) continue;  // item must already share the bank
        const arr = st.split('').map(Number);
        for (const k of (item === 0 ? [0] : [0, item])) arr[k] = 1 - arr[k];
        const nxt = arr.join('');
        if (bad(nxt) || seen.has(nxt)) continue;
        seen.add(nxt); next.push(nxt);
      }
    }
    frontier = next; d++;
    if (d > 100) break;
  }
  return -1;
}

/** Minimum moves for n-disk Hanoi, by running the recursive construction. */
export function truthHanoiMoves(n) {
  let moves = 0;
  const rec = (k) => { if (k === 0) return; rec(k - 1); moves++; rec(k - 1); };
  rec(n);
  return moves;
}

function specCanonical() {
  return CANONICAL.map((c) => ({
    id: c.id, category: 'reasoning', provenance: 'handwritten-canonical',
    verify_kind: c.verify_kind, prompt: c.prompt,
    tags: ['metric:pass_at_1', 'canon:public', c.verify_kind === 'two_part_six' ? 'fmt:words' : 'fmt:integer'],
  }));
}

// --- 4. robustness (base + surface-perturbed) ------------------------------

/**
 * Three base items, each paired with exactly one perturbed variant. The
 * perturbation is parameter-level (reordered + reworded steps / added irrelevant
 * preamble / extra walls off the shortest path), and the verifier re-derives each
 * variant's answer from its OWN parameters to prove the perturbation did not
 * move the ground truth. Without that check a "robustness" number would be
 * measuring a different question.
 */
function specRobustness(rng) {
  const out = [];

  const chainParams = { start: rng.int(40, 200), steps: Array.from({ length: 4 }, () => [rng.pick(['+', '-', '*']), rng.int(3, 12)]) };
  for (const variant of ['base', 'perturbed']) {
    out.push({
      id: `rob-chain-${variant}`, category: 'robustness', provenance: 'generated',
      verify_kind: 'chain2', params: chainParams, variant,
      // The APPLICATION order is fixed in both variants. The perturbation is
      // surface-only: the base lists the steps in order with plain verbs, the
      // perturbed one presents them in a scrambled order with different verbs and
      // a bullet layout, but each step is labelled with the position it occupies
      // in the application order, so the arithmetic is untouched. (An earlier
      // draft re-scrambled the application order itself, which changed the
      // answer and made the pair measure two different questions.)
      applyOrder: [0, 1, 2, 3],
      showOrder: variant === 'base' ? [0, 1, 2, 3] : [2, 0, 3, 1],
      reworded: variant === 'perturbed',
      tags: ['pair:rob-chain', 'metric:pass_at_1', 'fmt:integer'],
    });
  }

  const sumParams = { nums: Array.from({ length: 4 }, () => rng.int(31, 4999)) };
  for (const variant of ['base', 'perturbed']) {
    out.push({
      id: `rob-sum-${variant}`, category: 'robustness', provenance: 'generated',
      verify_kind: 'ml_task', task: 'sum', lang: 'en', params: sumParams, variant,
      preamble: variant === 'perturbed'
        ? 'Before you answer, note that the warehouse is cold, the shift ended early, and the clipboard is missing. None of that is relevant to the question.\n\n'
        : undefined,
      tags: ['pair:rob-sum', 'metric:pass_at_1', 'fmt:integer'],
    });
  }

  // grid pair: variant 1 adds walls, and the generator only accepts the draw if
  // the shortest distance is unchanged. The verifier re-proves this independently.
  const W = 5, H = 4;
  const baseWalls = [[2, 0], [2, 1]];
  let perturbWalls = null;
  for (let attempt = 0; attempt < 200 && perturbWalls === null; attempt++) {
    const cand = baseWalls.slice();
    for (let i = 0; i < 3; i++) {
      const c = rng.int(0, W - 1), r = rng.int(2, H - 1);
      if (!cand.some((w) => w[0] === c && w[1] === r) && !(c === 0 && r === 2)) cand.push([c, r]);
    }
    const g = { W, H, walls: cand, start: [0, 0], goal: [W - 1, H - 1] };
    const b = { W, H, walls: baseWalls, start: [0, 0], goal: [W - 1, H - 1] };
    if (truthBfsDist(g) === truthBfsDist(b)) perturbWalls = cand;
  }
  if (perturbWalls === null) throw new Error('robustness: no distance-preserving wall draw');
  for (const [variant, walls] of [['base', baseWalls], ['perturbed', perturbWalls]]) {
    out.push({
      id: `rob-path-${variant}`, category: 'robustness', provenance: 'generated',
      verify_kind: 'grid_path', variant, W, H, walls, start: [0, 0], goal: [W - 1, H - 1],
      tags: ['pair:rob-path', 'metric:pass_at_1', 'fmt:integer'],
    });
  }
  return out;                                        // 6
}

// ---------------------------------------------------------------------------
// itemSpecs — the single source of parameters. Contains NO ground truth.
// Per-category RNG streams keyed by category name, so changing the number of
// items in one category cannot shift the values drawn in another.
// ---------------------------------------------------------------------------

export function itemSpecs(seed = SEED) {
  const streams = {};
  const mk = (name) => new Rng(hash32(`${seed}:${name}`));
  return [
    ...specReasoning(mk('reasoning')),
    ...specCode(mk('code')),
    ...specInstruction(mk('instruction')),
    ...specFormat(mk('format')),
    ...specMultilingual(mk('multilingual')),
    ...specLongContext(mk('longctx')),
    ...specFunctionCalling(mk('funccall')),
    ...specAbstention(),
    ...specCanonical(),
    ...specRobustness(mk('robust')),
  ];
}

// ---------------------------------------------------------------------------
// format_control — schema + canonical document, values computed here.
// ---------------------------------------------------------------------------

function buildFormatItem(s) {
  const rng = new Rng(hash32(`${SEED}:format:${s.id}`));
  switch (s.verify_kind) {
    case 'json_flat': {
      const temps = Array.from({ length: 3 }, () => rng.int(-9, 34));
      const cond = rng.sample(['clear', 'overcast', 'drizzle', 'windy'], 3);
      const mean = Number((temps.reduce((a, b) => a + b, 0) / 3).toFixed(1));
      const warmest = cond[temps.indexOf(Math.max(...temps))];
      const value = { station: 'ridge-top', readings_c: temps, mean_c: mean, warmest_condition: warmest };
      return { value, schema: {
        type: 'object', required: ['station', 'readings_c', 'mean_c', 'warmest_condition'],
        additionalProperties: false,
        properties: {
          station: { enum: ['ridge-top'] },
          readings_c: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'integer' } },
          mean_c: { enum: [mean] },
          warmest_condition: { enum: [warmest] },
        },
      }, prompt: [
        `Three temperature readings in degrees Celsius were taken at the ridge-top station: ${temps.join(', ')}. One of them is the warmest.`,
        `Reply with a single JSON object with exactly these four keys: "station" (the string ridge-top), "readings_c" (an array of the three integers in the order given), "mean_c" (their arithmetic mean rounded to one decimal place, as a number), and "warmest_condition" (the string from this list that matches the warmest reading: ${cond.join(', ')}).`,
        `Add no keys beyond those four. JSON object only.`,
      ].join(' ') };
    }
    case 'json_nested': {
      // "raw" is the product and "bonus" is the SUM of the two stated numbers, so
      // both expected values are derivable from the prompt alone. An earlier draft
      // put an unrelated third number in `bonus` while the prompt said "sum",
      // which made the item unanswerable; the independent prompt re-derivation in
      // verify-items.mjs is what surfaced it.
      const a = rng.int(2, 9), b = rng.int(11, 49);
      const region = rng.pick(['north', 'south', 'coast']);
      const value = { survey: { id: `S-${a}${b}`, region, scored: { raw: a * b, bonus: a + b } } };
      return { value, schema: {
        type: 'object', required: ['survey'], additionalProperties: false,
        properties: { survey: {
          type: 'object', required: ['id', 'region', 'scored'], additionalProperties: false,
          properties: {
            id: { enum: [`S-${a}${b}`] },
            region: { enum: [region] },
            scored: { type: 'object', required: ['raw', 'bonus'], additionalProperties: false,
              properties: { raw: { enum: [a * b] }, bonus: { enum: [a + b] } } },
          },
        } },
      }, prompt: [
        `Compute two values from the numbers ${a} and ${b}: their product is "raw" and their sum is "bonus".`,
        `Reply with a JSON object of the form {"survey":{"id":<string>,"region":<string>,"scored":{"raw":<number>,"bonus":<number>}}}.`,
        `"id" must be the letter S followed by the digits of ${a} and then ${b} with no separator. "region" must be the string "${region}".`,
        `Use exactly these keys and no others. JSON object only.`,
      ].join(' ') };
    }
    case 'json_array_of_objects': {
      const rows = Array.from({ length: 3 }, () => ({ n: rng.int(3, 29), w: rng.pick(['kiln', 'basin', 'quarry', 'trestle']) }));
      const total = rows.reduce((s2, r) => s2 + r.n, 0);
      const value = { items: rows, total };
      return { value, schema: {
        type: 'object', required: ['items', 'total'], additionalProperties: false,
        properties: {
          items: { type: 'array', minItems: 3, maxItems: 3, items: {
            type: 'object', required: ['n', 'w'], additionalProperties: false,
            properties: { n: { enum: rows.map((r) => r.n) }, w: { enum: rows.map((r) => r.w) } } } },
          total: { enum: [total] },
        },
      }, prompt: [
        `A yard holds three stacks with ${rows.map((r) => r.n).join(', ')} crates each, and the stack names are ${rows.map((r) => r.w).join(', ')} in that order.`,
        `Reply with a JSON object {"items":[{"n":<number>,"w":<string>},...],"total":<number>}: one object per stack in the order given, each with exactly the keys "n" and "w", and "total" the sum of the three n values.`,
        `No extra keys anywhere. JSON object only.`,
      ].join(' ') };
    }
    case 'json_enum_array': {
      const codes = rng.sample(['amber', 'cobalt', 'sable', 'umber'], 3);
      const value = { order: codes.slice().sort().reverse(), count: 3 };
      return { value, schema: {
        type: 'object', required: ['order', 'count'], additionalProperties: false,
        properties: {
          order: { type: 'array', minItems: 3, maxItems: 3, items: { enum: ['amber', 'cobalt', 'sable', 'umber'] } },
          count: { enum: [3] },
        },
      }, prompt: [
        `Here are three colour names in no particular order: ${codes.join(', ')}.`,
        `Reply with a JSON object {"order":[...],"count":<number>} where "order" lists the same three names sorted from Z to A, and "count" is how many names there are.`,
        `Exactly those two keys. JSON object only.`,
      ].join(' ') };
    }
    case 'json_bool_array': {
      const ns = Array.from({ length: 4 }, () => rng.int(2, 60));
      const value = { evens: ns.map((x) => x % 2 === 0), threshold: Math.max(...ns) };
      return { value, schema: {
        type: 'object', required: ['evens', 'threshold'], additionalProperties: false,
        properties: {
          evens: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'boolean' } },
          threshold: { enum: [value.threshold] },
        },
      }, prompt: [
        `Four measurements were recorded: ${ns.join(', ')}.`,
        `Reply with a JSON object {"evens":[...],"threshold":<number>}: "evens" is an array of four booleans, one per measurement in the given order, true when that number is even; "threshold" is the largest of the four numbers.`,
        `Exactly those two keys. JSON object only.`,
      ].join(' ') };
    }
    case 'json_nullable': {
      const a = rng.int(3, 40), b = rng.int(3, 40);
      const firstIsLarger = a > b;
      const value = { label: firstIsLarger ? 'primary' : null, ratio: Number((a / b).toFixed(4)) };
      return { value, schema: {
        type: 'object', required: ['label', 'ratio'], additionalProperties: false,
        properties: {
          label: { type: ['string', 'null'], enum: ['primary', null] },
          ratio: { type: ['number', 'null'], minimum: 0, maximum: 14 },
        },
      }, prompt: [
        `Two parts are numbered ${a} and ${b}.`,
        `Reply with a JSON object with exactly two keys. "label": the string "primary" if ${a} is the larger of the two, otherwise the value null. "ratio": ${a} divided by ${b}, rounded to four decimal places, as a number; if the divisor is zero then the value null instead.`,
        `A key whose value is null is still present. No extra keys. JSON object only.`,
      ].join(' ') };
    }
    case 'json_strict': {
      const a = rng.int(5, 49), b = rng.int(5, 49), c = rng.int(5, 49);
      const value = { inputs: [a, b, c], result: { min: Math.min(a, b, c), max: Math.max(a, b, c) } };
      return { value, schema: {
        type: 'object', required: ['inputs', 'result'], additionalProperties: false,
        properties: {
          inputs: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'integer', minimum: 1, maximum: 60 } },
          result: { type: 'object', required: ['min', 'max'], additionalProperties: false,
            properties: { min: { enum: [value.result.min] }, max: { enum: [value.result.max] } } },
        },
      }, prompt: [
        `Reduce the triple ${a}, ${b}, ${c} to its extremes.`,
        `Reply with a JSON object {"inputs":[...],"result":{"min":<number>,"max":<number>}} where "inputs" repeats the three numbers as integers, "min" is the smallest and "max" is the largest.`,
        `The object must contain exactly the keys "inputs" and "result", and "result" exactly the keys "min" and "max". Do not add anything else — extra keys are rejected. JSON object only.`,
      ].join(' ') };
    }
    case 'json_matrix': {
      const rows = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => rng.int(1, 40)));
      const colSums = [0, 1, 2].map((c) => rows.reduce((a, r) => a + r[c], 0));
      const value = { matrix: rows, col_sums: colSums };
      return { value, schema: {
        type: 'object', required: ['matrix', 'col_sums'], additionalProperties: false,
        properties: {
          matrix: { type: 'array', minItems: 3, maxItems: 3, items: {
            type: 'array', minItems: 3, maxItems: 3, items: { type: 'integer', minimum: 1, maximum: 60 } } },
          col_sums: { type: 'array', minItems: 3, maxItems: 3, items: { enum: colSums } },
        },
      }, prompt: [
        `Here is a 3 by 3 grid of numbers:\n${rows.map((r) => r.join(' ')).join('\n')}`,
        `Reply with a JSON object {"matrix":[[...],[...],[...]],"col_sums":[n,n,n]}: "matrix" repeats the grid exactly as nested arrays of integers, and "col_sums" holds the sum of each column, in column order.`,
        `Exactly those two keys. JSON object only.`,
      ].join('\n') };
    }
    default: throw new Error('buildFormatItem: ' + s.verify_kind);
  }
}

// ---------------------------------------------------------------------------
// function_calling — schema + prompt
// ---------------------------------------------------------------------------

function fcSchema(tool, args) {
  const t = FC_TOOLS.find((x) => x.name === tool);
  const argSchema = {};
  for (const [k, v] of Object.entries(t.args)) argSchema[k] = { type: v.type, enum: [args[k]] };
  return {
    type: 'object', required: ['name', 'arguments'], additionalProperties: false,
    properties: {
      name: { enum: [tool] },
      arguments: { type: 'object', required: Object.keys(argSchema), additionalProperties: false, properties: argSchema },
    },
  };
}

const sig = (t) => `function ${t.name}(${Object.entries(t.args).map(([k, v]) => `${k}: ${v.type}`).join(', ')})`;

function fcPrompt(s) {
  const t = FC_TOOLS.find((x) => x.name === s.tool);
  if (s.utterance) return [
    `You are given one tool.`, ``, '```text', sig(t), '```', ``, s.utterance, ``,
    `Reply with a single JSON object of the form {"name": "<tool name>", "arguments": { … }} choosing the tool and filling every argument. No other keys, no prose.`,
  ].join('\n');
  const d = FC_TOOLS.find((x) => x.name === s.distractor);
  return [
    `You are given the following tools.`, ``, '```text',
    sig(t), ...(s.multi ? [sig(d)] : []), '```', ``,
    `Here is a request that is already fully specified. Do not ask questions and do not invent values.`,
    t.say(s.args), ``,
    `Reply with a single JSON object of the form {"name": "<the one tool you chose>", "arguments": { … }}. Use every argument of that tool exactly once, with exactly the values given above. No other keys, no prose.`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// long_context — haystack assembly
// ---------------------------------------------------------------------------

function buildNeedlePrompt(s) {
  const rng = new Rng(s.seedTag);
  const targetChars = s.tok * 3;
  const paras = [];
  let len = 0;
  while (len < targetChars) {
    const parts = Array.from({ length: 5 }, () => fillerSentence(rng, s.code));
    const p = `${parts[0][0].toUpperCase()}${parts[0].slice(1)}; ${parts.slice(1).join('; ')}.`;
    paras.push(p);
    len += p.length + 2;
  }
  const needle = `The verification code for station ${s.station} is ${s.code}.`;
  const idx = Math.min(paras.length - 1, Math.max(0, Math.floor(s.depth * paras.length)));
  paras.splice(idx, 0, needle);
  return [
    `Below is a section from a maintenance log.`, ``, paras.join('\n\n'), ``,
    `Question: what is the verification code for station ${s.station}?`,
    `Reply with the 4-digit code only, with no words and no punctuation.`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// makeItem — spec + ground truth -> a bank item
// ---------------------------------------------------------------------------

function makeItem(s) {
  const item = {
    id: s.id, category: s.category, provenance: s.provenance, prompt: '',
    scorer: 'exact_match', scorer_args: {}, expected: null, notes: '', tags: s.tags.slice(),
  };

  switch (s.verify_kind) {
    case 'modpow':
      item.prompt = buildReasoningPrompt(s);
      item.scorer = 'numeric'; item.scorer_args = { absTol: 0 };
      item.expected = truthModPow(s.terms, s.m);
      item.notes = `Generated. Ground truth = sum of a^e mod ${s.m} by naive repeated multiplication; re-verified by binary exponentiation with BigInt.`;
      break;
    case 'linear':
      item.prompt = buildReasoningPrompt(s);
      item.scorer = 'exact_match'; item.scorer_args = { caseSensitive: false, ignorePunctuation: false };
      item.expected = truthLinearCramer(s.A, s.b);
      item.notes = 'Generated. Ground truth = exact rational solution by Cramer\'s rule over a fraction-free determinant; re-verified by Gaussian elimination plus a zero-residual substitution into the original equations.';
      break;
    case 'logicgrid':
      item.prompt = buildReasoningPrompt(s);
      item.scorer = 'exact_match'; item.scorer_args = { caseSensitive: false };
      item.expected = s.answer;
      item.notes = 'Generated. The clue set is proven sufficient by exhaustive enumeration of all 216 candidate grids: exactly one satisfies every clue, and it is the one the generator built.';
      break;
    case 'substring_count':
      item.prompt = buildReasoningPrompt(s);
      item.scorer = 'numeric'; item.scorer_args = { absTol: 0 };
      item.expected = truthSubstringCount(s.alphabet, s.len, s.pattern);
      item.notes = `Generated. Ground truth = count of length-${s.len} strings over {${s.alphabet.join(',')}} containing "${s.pattern}", by KMP-automaton DP with an absorbing matched state; re-verified by exhaustive enumeration of all ${Math.pow(s.alphabet.length, s.len)} strings.`;
      break;
    case 'grid_path':
      item.prompt = gridPrompt(s, 'dist');
      item.scorer = 'numeric'; item.scorer_args = { absTol: 0 };
      item.expected = truthBfsDist(s);
      item.notes = 'Generated. Ground truth = shortest distance by BFS; re-verified by Bellman-Ford relaxation over the same graph.';
      break;
    case 'grid_path_count':
      item.prompt = gridPrompt(s, 'count');
      item.scorer = 'numeric'; item.scorer_args = { absTol: 0 };
      item.expected = truthBfsPathCount(s);
      item.notes = 'Generated. Ground truth = number of distinct shortest paths by DP over BFS layers; re-verified by depth-first enumeration of every path of optimal length.';
      break;
    case 'chain':
      item.prompt = chainPrompt(s.start, s.steps);
      item.scorer = 'numeric'; item.scorer_args = { absTol: 0 };
      item.expected = truthChain(s.start, s.steps);
      item.notes = 'Generated. Ground truth = forward simulation of the operation chain; re-verified by replaying the inverse operations in reverse order.';
      break;
    case 'chain2': {
      const lines = [`Start from the number ${s.params.start}.`];
      if (s.reworded) {
        const wording = { '+': 'go up by', '-': 'go down by', '*': 'scale by' };
        s.showOrder.forEach((i) => {
          const [op, num] = s.params.steps[i];
          lines.push(`  - step ${s.applyOrder.indexOf(i) + 1}: ${wording[op]} ${num}`);
        });
        lines.push(`The bullet lines are not listed in the order they must be applied. Apply them in step order: 1, 2, 3, 4, using the step numbers shown.`);
      } else {
        const verb = { '+': 'Add', '-': 'Subtract', '*': 'Multiply by' };
        s.applyOrder.forEach((i) => lines.push(`${verb[s.params.steps[i][0]]} ${s.params.steps[i][1]}.`));
      }
      lines.push(`What is the resulting number? Reply with a single integer and nothing else.`);
      item.prompt = lines.join('\n');
      item.scorer = 'numeric'; item.scorer_args = { absTol: 0 };
      item.expected = truthChain(s.params.start, s.applyOrder.map((i) => s.params.steps[i]));
      item.notes = `Generated robustness pair, variant "${s.variant}". Ground truth = applying the four steps in the fixed application order; the perturbed variant scrambles only the PRESENTATION order and rewords the verbs, and the build proves the two variants share a ground truth and a scorer.`;
      break;
    }
    case 'code_exec': {
      const t = CODE_TASKS.find((x) => x.key === s.task);
      item.prompt = buildCodePrompt(s);
      item.scorer = 'exact_match'; item.scorer_args = { caseSensitive: true, ignorePunctuation: false };
      item.expected = s.executed;
      item.notes = `Generated. Ground truth is the value the function shown in the prompt actually returns, obtained by executing that exact source in a fresh V8 context — not predicted. Cross-checked against two independent re-implementations of the same semantics and against two further inputs.`;
      break;
    }
    case 'if_words': case 'if_lower': case 'if_forbid': case 'if_tokens':
    case 'if_nodigit': case 'if_bullets': case 'if_oneline': case 'if_prefix': case 'if_multi': {
      item.prompt = ifPromptText(s);
      const sc = scorerForInstruction(s);
      item.scorer = sc.scorer; item.scorer_args = sc.scorer_args; item.expected = sc.expected;
      item.tags = item.tags.concat([`ifeval_unit:${s.ifeval_unit}`]);
      item.notes =
        (s.ifeval_unit === 'instruction'
          ? `Exactly one verifiable instruction, so this item's pass/fail is exactly one instruction followed; it feeds the pre-registered ifeval_inst_strict. `
          : `Carries two verifiable constraints (single line, and lowercase letters and spaces only) checked all-or-nothing; it feeds ifeval_prompt_strict and is excluded from ifeval_inst_strict. `) +
        `The scorer is the constraint checker itself. Verified two ways: probe answers are judged semantically by an independent constraint checker in verify-items.mjs, and the scorer is required to accept the compliant probe and reject every violating probe.`;
      break;
    }
    case 'ml_task': {
      const text = ML_TEXT[s.task][s.lang](s.params);
      item.prompt = s.preamble ? s.preamble + text : text;
      item.scorer = 'numeric'; item.scorer_args = { absTol: 0 };
      item.expected = truthMlTask(s.task, s.params);
      item.notes = `Generated (${s.lang}${s.variant === 'perturbed' ? ', perturbed variant' : ''}). The task "${s.task}" is shared across ko/en/ja/zh with only the instruction language changing, so the cross-lingual gap is measured on one underlying problem. Ground truth re-derived by an independent second implementation of the task.`;
      break;
    }
    case 'ml_mixed':
      item.prompt = s.instruction;
      item.scorer = 'numeric'; item.scorer_args = { absTol: 0 };
      item.expected = Number(s.answer);
      item.notes = `Generated (code-switched, ${s.lang}): an English instruction wrapped around a ${s.lang} label block. The answer token occurs exactly once in the prompt, so the item cannot be satisfied without reading the ${s.lang} text.`;
      break;
    case 'needle':
      item.prompt = buildNeedlePrompt(s);
      item.scorer = 'exact_match'; item.scorer_args = { caseSensitive: true, ignorePunctuation: false };
      item.expected = s.code;
      item.notes = `Generated needle-in-haystack, ~${s.tok} tokens-equivalent (chars/3) of digit-free synthetic filler, needle at ${(s.depth * 100).toFixed(0)}% depth. Scored with exact_match rather than regex because scorers.mjs:113 refuses regex subjects over 20000 chars. Verified that the code appears exactly once, the filler contains no digits at all, and the needle offset lands within tolerance of the requested depth.`;
      break;
    case 'fc': {
      item.prompt = fcPrompt(s);
      item.scorer = 'json_schema';
      item.scorer_args = { schema: fcSchema(s.tool, s.args), required: true, maxViolations: 4 };
      // see the format_control note: the schema must sit in `expected`
      item.expected = fcSchema(s.tool, s.args);
      item.canonical_answer = j({ name: s.tool, arguments: s.args });
      item.notes = `Generated. Ground truth = the tool call built from the same parameter object that produced the request text, so the correct answer holds by construction. The schema pins every value with enum and forbids additional properties; verified that wrong tool, wrong value, missing argument and extra argument are all rejected.`;
      break;
    }
    case 'abstain':
      item.prompt = [s.passage, ``, s.question, `Answer using only the passage above.`].join('\n');
      if (s.answerable) {
        item.scorer = 'contains'; item.scorer_args = { caseSensitive: false, all: true };
        item.expected = String(s.answer);
        item.notes = 'Generated, answerable: the passage states the answer, so an abstention is scored as a failure. The expected phrase is verified to be a literal substring of the passage, and the prompt requires the date exactly as written so that the scoring cannot hinge on a reformatting the item never asked for.';
      } else {
        item.scorer = 'regex'; item.scorer_args = { flags: 'i' };
        item.expected = ABSTAIN_PATTERN;
        item.notes = 'Generated, unanswerable: the passage records dates but is silent on this question, so the desired behaviour is to say so. Scored by an abstention-marker pattern, which is a deliberately strict proxy — the report states exactly what it under-credits. The verifier checks the passage contains none of the terms that would answer the question.';
      }
      break;
      item.prompt = s.prompt;
      item.scorer = 'exact_match'; item.scorer_args = { caseSensitive: false, ignorePunctuation: false };
      item.expected = 'six nine';
      item.notes = 'Canonical public puzzle (the two-part six question). Statement authored, answer machine-verified: the verifier enumerates the two-digit numbers, confirms that exactly one satisfies "has six but not eight" and exactly one satisfies "has nine but not five", and checks they are the two distinct numbers the answer names. No external lookup is trusted.';
      break;
    case 'wolf_goat_cabbage':
      item.prompt = s.prompt;
      item.scorer = 'numeric'; item.scorer_args = { absTol: 0 };
      item.expected = truthCrossings();
      item.notes = 'Canonical river-crossing puzzle. Statement authored, answer machine-verified by breadth-first search over the full state space (farmer plus three items, illegal pairings excluded), so the minimum is proved rather than asserted.';
      break;
    case 'hanoi':
      item.prompt = s.prompt;
      item.scorer = 'numeric'; item.scorer_args = { absTol: 0 };
      item.expected = truthHanoiMoves(7);
      item.notes = 'Canonical Tower of Hanoi. Statement authored, answer machine-verified two ways: an executed optimal recursive construction that counts the moves, and an independent breadth-first search over peg states at smaller n as a control.';
      break;
    case 'json_flat': case 'json_nested': case 'json_array_of_objects': case 'json_enum_array':
    case 'json_bool_array': case 'json_nullable': case 'json_strict': case 'json_matrix': {
      const f = s.built;
      item.prompt = f.prompt;
      item.scorer = 'json_schema';
      item.scorer_args = { schema: f.schema, required: true, maxViolations: 4 };
      // scorers.mjs:404 dispatches json_schema as (a, e, x) => jsonSchema(a, e, x),
      // i.e. the SCHEMA arrives in the slot pool.mjs fills from item.expected. With
      // a string there, validateStructure returns [] and EVERY answer passes. The
      // schema is therefore written to BOTH expected and scorer_args.schema so the
      // item scores correctly under the implementation as well as the README.
      item.expected = f.schema;
      item.canonical_answer = j(f.value);
      item.notes = 'Generated. Ground truth = a JSON document built from computed values; the schema pins each value with enum and rejects extra keys. Verified that the canonical document satisfies the schema and that three deliberately broken variants each violate it.';
      break;
    }
    default:
      throw new Error('makeItem: unknown verify_kind ' + s.verify_kind);
  }
  return item;
}

const FORMAT_KINDS_SET = new Set(FORMAT_KINDS);

// ---------------------------------------------------------------------------
// buildBank — specs + ground truth -> the bank object.
// NO timestamps anywhere: the file must be a pure function of the seed.
// ---------------------------------------------------------------------------

export function buildBank(seed = SEED) {
  const specs = itemSpecs(seed);
  const items = [];
  for (const s of specs) {
    if (s.verify_kind === 'code_exec') {
      const t = CODE_TASKS.find((x) => x.key === s.task);
      s.executed = execCall(t.src(s.params), t.call(s.params));   // execute the shown source
    }
    const item = makeItem(s);
    items.push(item);
  }
  return { items, specs };
}

export { ML_TASKS, ML_TEXT, makeItem, buildFormatItem, buildNeedlePrompt, fcSchema, fcPrompt, chainPrompt, gridPrompt, ifPromptText, scorerForInstruction, ABSTENTION_SETS, pad, hash32 };
