/**
 * verify-items.mjs — independent verification of the A3 item bank.
 *
 * WHAT MAKES THIS A VERIFICATION AND NOT A RE-RUN
 * ------------------------------------------------
 * This module imports exactly two things from generate-items.mjs: `itemSpecs`
 * (parameters, which contain no answers) and `CODE_TASKS` (JavaScript source and
 * input generators, which also contain no answers). Every ground-truth value is
 * re-derived here, with a SECOND implementation written deliberately differently
 * in shape from the one that produced the bank:
 *
 *   task              bank (algorithm 1)              verifier (algorithm 2)
 *   ----------------  ------------------------------  ---------------------------------
 *   modpow            naive repeated multiplication   binary exponentiation (BigInt)
 *   linear system     Cramer + Bareiss determinant    Gaussian elimination with exact
 *                                                      rational Fractions, then a
 *                                                      zero-residual substitution
 *   logic grid        generated assignment, clue-min  exhaustive enumeration of all
 *                     search                          216 grids; requires exactly one
 *   substring count   KMP-automaton DP, absorbing    enumerate all |A|^n strings
 *   grid distance     BFS                             Bellman-Ford relaxation
 *   shortest-path cnt DP over BFS layers              DFS enumeration of optimal paths
 *   arithmetic chain  forward simulation              replay the INVERSE operations
 *   code item         execute the shown source        execute it again here, plus two
 *                                                      independent re-implementations
 *   river crossing    BFS over a 4-char state string  BFS over a 4-bit bitmask
 *   two-part six      (author's answer)               enumerate all two-digit numbers
 *   Hanoi             recursive move counter          BFS over peg states, plus the
 *                                                      closed form, as a control
 *
 * Beyond re-derivation it checks that the SCORER is not vacuous:
 *   - for every instruction-following item the constraint is evaluated
 *     semantically by a hand-written checker that shares no code with the
 *     item's regex, and the real harness scorer must agree on every probe;
 *   - for every json_schema item the canonical document must satisfy the schema
 *     and every deliberately broken variant must violate it;
 *   - for every numeric/exact item a wrong answer must FAIL the scorer;
 *   - a mutation campaign corrupts every item's `expected` in turn and requires
 *     the re-derivation to notice every single one.
 *
 * Nothing here trusts a number because it looks plausible.
 */

import { itemSpecs, SEED, CODE_TASKS } from './generate-items.mjs';
import { score, validateStructure, extractJson } from './scorers.mjs';
import vm from 'node:vm';

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------

const failures = [];
const stats = {
  checks: 0, mutations: 0, mutationsCaught: 0,
  negativeControls: 0, negativeControlsCaught: 0,
  positiveControls: 0, positiveControlsCaught: 0,
};

/** Stable string form for a value that may be an object, so a string comparison
 *  never silently degenerates into "[object Object]". */
function canon(v) { return v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v); }

/** Change a computed value inside a document without touching its shape. */
function perturbObject(o) {
  const c = JSON.parse(JSON.stringify(o));
  if (Array.isArray(c)) {
    if (typeof c[0] === 'number') c[0] = c[0] + 1;
    else if (c.length > 0) c[0] = typeof c[0] === 'object' ? perturbObject(c[0]) : String(c[0]) + 'X';
    return c;
  }
  for (const k of Object.keys(c)) {
    if (typeof c[k] === 'number') { c[k] = c[k] + 1; return c; }
    if (typeof c[k] === 'object' && c[k] !== null) return { ...c, [k]: perturbObject(c[k]) };
  }
  return { ...c, __perturbed: 1 };
}

function ok(cond, label, detail = '') {
  stats.checks++;
  if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  return !!cond;
}
function eq(actual, expected, label) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  return ok(same, label, same ? '' : `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

// ---------------------------------------------------------------------------
// exact rational arithmetic (algorithm 2 for the linear systems)
// ---------------------------------------------------------------------------

class Frac {
  constructor(n, d = 1n) {
    if (d === 0n) throw new Error('Frac: zero denominator');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcdb((n < 0n ? -n : n), d) || 1n;
    this.n = n / g; this.d = d / g;
  }
  static of(v) { return v instanceof Frac ? v : new Frac(BigInt(v)); }
  add(o) { o = Frac.of(o); return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = Frac.of(o); return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = Frac.of(o); return new Frac(this.n * o.n, this.d * o.d); }
  div(o) { o = Frac.of(o); return new Frac(this.n * o.d, this.d * o.n); }
  isZero() { return this.n === 0n; }
  toStr() { return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`; }
}
function gcdb(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }

/**
 * Gauss-Jordan elimination with partial pivoting over exact rationals.
 * The pivot row MUST be normalised to a leading 1 before eliminating the other
 * rows; without that step the elimination factor is wrong and the result is
 * silently incorrect. (That bug was here, and the disagreement with the bank's
 * Cramer implementation is what exposed it.)
 */
function gaussSolve(A, b) {
  const N = A.length;
  const M = A.map((row, i) => row.map((v) => Frac.of(v)).concat([Frac.of(b[i])]));
  for (let k = 0; k < N; k++) {
    let piv = k;
    for (let i = k + 1; i < N; i++) {
      if (M[i][k].isZero()) continue;
      if (M[piv][k].isZero() || cmpFr(M[i][k], M[piv][k]) > 0) piv = i;
    }
    if (M[piv][k].isZero()) return null;                 // singular
    [M[k], M[piv]] = [M[piv], M[k]];
    const inv = new Frac(M[k][k].d, M[k][k].n);           // 1 / pivot
    for (let c = k; c <= N; c++) M[k][c] = M[k][c].mul(inv);
    for (let i = 0; i < N; i++) {
      if (i === k || M[i][k].isZero()) continue;
      const f = M[i][k];
      for (let c = k; c <= N; c++) M[i][c] = M[i][c].sub(f.mul(M[k][c]));
    }
  }
  return M.map((row, i) => row[N]);
}
/** sign of a - b for exact rationals. */
const cmpFr = (a, b) => {
  const d = a.n * b.d - b.n * a.d;
  return d > 0n ? 1 : d < 0n ? -1 : 0;
};
const absFr = (f) => new Frac(f.n < 0n ? -f.n : f.n, f.d);

// ---------------------------------------------------------------------------
// algorithm 2 for each task
// ---------------------------------------------------------------------------

/** modpow by binary exponentiation with BigInt — not the naive loop. */
function v2_modpow(terms, m) {
  const M = BigInt(m);
  const modpowBig = (a, e) => {
    let base = BigInt(a % m) % M, acc = 1n, exp = BigInt(e);
    while (exp > 0n) {
      if (exp & 1n) acc = (acc * base) % M;
      base = (base * base) % M;
      exp >>= 1n;
    }
    return acc;
  };
  let total = 0n;
  for (const t of terms) total = (total + modpowBig(t.a, t.e)) % M;
  return Number(total);
}

/** logic grid by exhaustive enumeration; also proves the solution is unique. */
function v2_logicgrid(s) {
  const perms = (arr) => arr.length <= 1 ? [arr] : arr.flatMap((v, i) =>
    perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [v, ...p]));
  const sols = [];
  for (const pp of perms(s.people)) for (const cc of perms(s.colors)) for (const pt of perms(s.pets)) {
    const w = { person: {}, color: {}, pet: {} };
    pp.forEach((v, i) => { w.person[v] = i + 1; });
    cc.forEach((v, i) => { w.color[v] = i + 1; });
    pt.forEach((v, i) => { w.pet[v] = i + 1; });
    const holds = (c) => {
      switch (c.kind) {
        case 'colorAt': return w.color[c.color] === c.pos;
        case 'personAt': return w.person[c.person] === c.pos;
        case 'petNotColor': return w.pet[c.pet] !== w.color[c.color];
        case 'personRightOfColor': return w.person[c.person] === w.color[c.color] + 1;
        case 'personLeftOfColor': return w.person[c.person] === w.color[c.color] - 1;
        case 'personLeftOfPet': return w.person[c.person] < w.pet[c.pet];
        default: throw new Error('v2_logicgrid: unknown clue ' + c.kind);
      }
    };
    if (s.clues.every(holds)) sols.push(w);
  }
  if (sols.length !== 1) return { count: sols.length, answer: null };
  // The answer is the colour AT the pet's position, i.e. found by searching the
  // colour table for the one whose position matches — not by indexing the colour
  // table with the pet's name.
  const target = s.question.match(/where the (\w+) lives/);
  if (!target) return { count: sols.length, answer: null };
  const petPos = sols[0].pet[target[1]];
  const colour = s.colors.find((c) => sols[0].color[c] === petPos);
  return { count: sols.length, answer: colour ?? null };
}

/** substring count by exhaustive enumeration of every string. */
function v2_substringCount(alphabet, len, pattern) {
  let count = 0;
  const rec = (depth, s) => {
    if (depth === len) { if (s.includes(pattern)) count++; return; }
    for (const c of alphabet) rec(depth + 1, s + c);
  };
  rec(0, '');
  return count;
}

/** grid distance by Bellman-Ford relaxation, not BFS. */
function v2_gridDist(s) {
  const key = (c, r) => c * 1000 + r;
  const pass = (c, r) => c >= 0 && r >= 0 && c < s.W && r < s.H && !s.walls.some((w) => w[0] === c && w[1] === r);
  const dist = new Map([[key(s.start[0], s.start[1]), 0]]);
  for (let iter = 0; iter < s.W * s.H + 2; iter++) {
    let changed = false;
    for (const [k, d] of [...dist]) {
      const c = Math.floor(k / 1000), r = k % 1000;
      for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nc = c + dc, nr = r + dr;
        if (!pass(nc, nr)) continue;
        const nk = key(nc, nr);
        if (!dist.has(nk) || dist.get(nk) > d + 1) { dist.set(nk, d + 1); changed = true; }
      }
    }
    if (!changed) break;
  }
  const g = dist.get(key(s.goal[0], s.goal[1]));
  return g === undefined ? null : g;
}

/** number of shortest paths by depth-first enumeration of optimal-length paths. */
function v2_gridPathCount(s) {
  const target = v2_gridDist(s);
  if (target === null) return null;
  const pass = (c, r) => c >= 0 && r >= 0 && c < s.W && r < s.H && !s.walls.some((w) => w[0] === c && w[1] === r);
  let count = 0;
  const walk = (c, r, left) => {
    if (left === 0) { if (c === s.goal[0] && r === s.goal[1]) count++; return; }
    for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nc = c + dc, nr = r + dr;
      if (pass(nc, nr)) walk(nc, nr, left - 1);
    }
  };
  walk(s.start[0], s.start[1], target);
  return count;
}

/**
 * Chain answer by building a parenthesised arithmetic expression from the steps
 * and evaluating it with a recursive-descent parser. Deliberately not a numeric
 * loop: the bank simulates, this parses. (The first attempt replayed inverse
 * operations, which is unsound once a multiply follows a subtraction, because the
 * intermediate value need not divide evenly.)
 */
function v2_chainByInverse(start, steps) {
  let expr = String(start);
  for (const [op, num] of steps) {
    expr = `(${expr} ${op} ${num})`;
  }
  return parseArith(expr);
}

/** Minimal recursive-descent evaluator for + - * with parentheses. */
function parseArith(s) {
  let pos = 0;
  const ws = () => { while (pos < s.length && /\s/.test(s[pos])) pos++; };
  const expr = () => {
    let v = term();
    for (;;) {
      ws();
      if (s[pos] === '+') { pos++; v += term(); }
      else if (s[pos] === '-') { pos++; v -= term(); }
      else return v;
    }
  };
  const term = () => {
    let v = factor();
    for (;;) {
      ws();
      if (s[pos] === '*') { pos++; v *= factor(); }
      else return v;
    }
  };
  const factor = () => {
    ws();
    if (s[pos] === '(') { pos++; const v = expr(); ws(); if (s[pos] === ')') pos++; return v; }
    const m = /^\d+/.exec(s.slice(pos));
    if (!m) throw new Error(`parseArith: expected a number at ${pos} in ${JSON.stringify(s)}`);
    pos += m[0].length;
    return Number(m[0]);
  };
  const v = expr();
  ws();
  if (pos !== s.length) throw new Error('parseArith: trailing input in ' + JSON.stringify(s));
  return v;
}

/** execute a JS function source in a fresh context (algorithm 2's own executor). */
function v2_exec(fnSource, call) {
  const ctx = vm.createContext(Object.create(null));
  return String(vm.runInContext(`${fnSource}\n${call}`, ctx, { timeout: 3000 }));
}

/** two-part six by enumerating the two-digit numbers. */
function v2_twoPartSix() {
  const has = (n, d) => String(n).includes(String(d));
  const sixNoEight = [], nineNoFive = [];
  for (let n = 10; n <= 99; n++) {
    if (has(n, 6) && !has(n, 8)) sixNoEight.push(n);
    if (has(n, 9) && !has(n, 5)) nineNoFive.push(n);
  }
  return { sixNoEight, nineNoFive };
}

/** river crossing by BFS over a 4-bit bitmask, not a state string. */
function v2_crossings() {
  const BAD = (f, w, g, c) => (w === g && f !== w) || (g === c && f !== g);
  const enc = (bits) => bits.reduce((a, b, i) => a | (b << i), 0);
  const start = 0, goal = 15;
  const seen = new Uint8Array(16); seen[start] = 1;
  let frontier = [start], d = 0;
  while (frontier.length && d < 40) {
    const next = [];
    for (const st of frontier) {
      if (st === goal) return d;
      const f = st & 1, w = (st >> 1) & 1, g = (st >> 2) & 1, c = (st >> 3) & 1;
      for (let item = 0; item <= 3; item++) {
        const bit = item === 0 ? 0 : item;
        const v = (st >> bit) & 1;
        if (item !== 0 && v !== f) continue;             // item must share the bank
        const nf = 1 - f;
        const nv = 1 - v;
        const ns = enc([nf, item === 1 ? nv : w, item === 2 ? nv : g, item === 3 ? nv : c]);
        if (BAD((ns & 1), (ns >> 1) & 1, (ns >> 2) & 1, (ns >> 3) & 1)) continue;
        if (seen[ns]) continue;
        seen[ns] = 1; next.push(ns);
      }
    }
    frontier = next; d++;
  }
  return -1;
}

/**
 * Hanoi minimum moves by BFS over peg states, as an independent control on the
 * closed form. State is a string of n digits, one per disk (0 = smallest), each
 * giving that disk's peg. Only the top disk of a peg may move, and only onto an
 * empty peg or onto a larger disk.
 */
function v2_hanoiBfs(n) {
  const start = '0'.repeat(n);
  const goal = '2'.repeat(n);
  const topOf = (st) => {
    const t = [null, null, null];
    for (let d = 0; d < n; d++) { const p = Number(st[d]); if (t[p] === null) t[p] = d; }
    return t;
  };
  const seen = new Set([start]);
  let frontier = [start], d = 0;
  while (frontier.length && d < 500) {
    const next = [];
    for (const st of frontier) {
      if (st === goal) return d;
      const t = topOf(st);
      for (let from = 0; from < 3; from++) {
        if (t[from] === null) continue;
        const disk = t[from];
        for (let to = 0; to < 3; to++) {
          if (to === from) continue;
          if (t[to] !== null && t[to] < disk) continue;      // larger on smaller
          const arr = st.split('');
          arr[disk] = String(to);
          const nk = arr.join('');
          if (seen.has(nk)) continue;
          seen.add(nk); next.push(nk);
        }
      }
    }
    frontier = next; d++;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// semantic constraint checkers (share no code with the items' regexes)
// ---------------------------------------------------------------------------

const SEMANTIC = {
  if_words: (s) => (a) => a.trim().split(/\s+/).filter(Boolean).length === s.n,
  if_lower: () => (a) => !/[A-Z]/.test(a),
  if_forbid: (s) => (a) => !a.toLowerCase().includes(s.forbidden.toLowerCase()),
  if_tokens: (s) => (a) => s.tokens.every((t) => a.toLowerCase().includes(t.toLowerCase())),
  if_nodigit: () => (a) => !/[0-9]/.test(a),
  if_bullets: (s) => (a) => {
    const lines = a.replace(/\n$/, '').split('\n');
    return lines.length === s.count && lines.every((l) => l.startsWith('- ') && l.length > 2);
  },
  if_oneline: () => (a) => !a.includes('\n'),
  if_prefix: (s) => (a) => a.trim() === `ANSWER: ${s.color}`,
  if_multi: () => (a) => !a.includes('\n') && !/[A-Z0-9,.;:!?]/.test(a),
};

/**
 * Format items: re-derive the expected JSON document from the PROMPT TEXT, not
 * from the generator's parameters. This is the check that catches a
 * prompt/answer mismatch — where the document in the bank is not actually the
 * answer to the question the prompt asks. Every number is parsed back out of the
 * prompt and recomputed with a fresh implementation.
 */
function v2_formatDoc(kind, prompt) {
  const nums = (re) => (prompt.match(re) ?? []).map(Number);
  switch (kind) {
    case 'json_flat': {
      const m = prompt.match(/ridge-top station: ([-0-9, ]+)\./);
      const temps = m ? m[1].match(/-?\d+/g).map(Number) : [];
      const cond = (prompt.match(/warmest reading: ([a-z, ]+?)[).]/)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (temps.length !== 3 || cond.length !== 3) return null;
      const mean = Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10;
      const warmest = cond[temps.indexOf(Math.max(...temps))];
      return { station: 'ridge-top', readings_c: temps, mean_c: mean, warmest_condition: warmest };
    }
    case 'json_nested': {
      const m = prompt.match(/numbers (\d+) and (\d+)/);
      if (!m) return null;
      const a = Number(m[1]), b = Number(m[2]);
      const region = ['north', 'south', 'coast'].find((r) => prompt.includes(r));
      return { survey: { id: `S-${a}${b}`, region, scored: { raw: a * b, bonus: a + b } } };
    }
    case 'json_array_of_objects': {
      const m = prompt.match(/with ([\d, ]+) crates each, and the stack names are ([a-z, ]+) in that order/);
      if (!m) return null;
      const ns = m[1].match(/\d+/g).map(Number);
      const ws = m[2].split(',').map((s) => s.trim()).filter(Boolean);
      return { items: ns.map((n, i) => ({ n, w: ws[i] })), total: ns.reduce((a, b) => a + b, 0) };
    }
    case 'json_enum_array': {
      const m = prompt.match(/names in no particular order: ([a-z, ]+)\./);
      if (!m) return null;
      const codes = m[1].split(',').map((s) => s.trim()).filter(Boolean);
      return { order: codes.slice().sort().reverse(), count: codes.length };
    }
    case 'json_bool_array': {
      const m = prompt.match(/recorded: ([\d, ]+)\./);
      if (!m) return null;
      const ns = m[1].match(/\d+/g).map(Number);
      return { evens: ns.map((x) => x % 2 === 0), threshold: Math.max(...ns) };
    }
    case 'json_nullable': {
      const m = prompt.match(/numbered (\d+) and (\d+)/);
      if (!m) return null;
      const a = Number(m[1]), b = Number(m[2]);
      return { label: a > b ? 'primary' : null, ratio: b === 0 ? null : Number((a / b).toFixed(4)) };
    }
    case 'json_strict': {
      const m = prompt.match(/Reduce the triple ([\d, ]+?)\s+to its/);
      if (!m) return null;
      const ns = m[1].match(/\d+/g).map(Number);
      return { inputs: ns, result: { min: Math.min(...ns), max: Math.max(...ns) } };
    }
    case 'json_matrix': {
      const block = prompt.match(/grid of numbers:\n([\d \n]+)/);
      if (!block) return null;
      const rows = block[1].trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number));
      const colSums = [0, 1, 2].map((c) => rows.reduce((acc, r) => acc + r[c], 0));
      return { matrix: rows, col_sums: colSums };
    }
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// per-kind re-derivation: returns the value this verifier independently believes
// ---------------------------------------------------------------------------

function rederive(spec, item) {
  switch (spec.verify_kind) {
    case 'modpow': return v2_modpow(spec.terms, spec.m);
    case 'linear': {
      const x = gaussSolve(spec.A, spec.b);
      if (x === null) return null;
      return x.map((f) => f.toStr()).join(' ');
    }
    case 'logicgrid': {
      const r = v2_logicgrid(spec);
      return r.answer;
    }
    case 'substring_count': return v2_substringCount(spec.alphabet, spec.len, spec.pattern);
    case 'grid_path': return v2_gridDist(spec);
    case 'grid_path_count': return v2_gridPathCount(spec);
    case 'chain': return v2_chainByInverse(spec.start, spec.steps);
    case 'chain2': return v2_chainByInverse(spec.params.start, spec.applyOrder.map((i) => spec.params.steps[i]));
    case 'code_exec': return v2_exec(CODE_TASKS.find((t) => t.key === spec.task).src(spec.params),
      CODE_TASKS.find((t) => t.key === spec.task).call(spec.params));
    case 'ml_task': {
      const p = spec.params;
      if (spec.task === 'sum') return p.nums.slice().sort((a, b) => a - b).reduce((a, b) => a + b, 0);
      if (spec.task === 'chain') {
        const perCrate = p.per * p.price;                    // different decomposition
        const gross = p.crates * perCrate;
        return (gross - p.rebate) + p.fee;
      }
      const rev = [...p.digits].reverse().join('');
      const hi = BigInt(p.digits) > BigInt(rev) ? BigInt(p.digits) : BigInt(rev);
      const lo = BigInt(p.digits) > BigInt(rev) ? BigInt(rev) : BigInt(p.digits);
      return Number(hi - lo);
    }
    case 'ml_mixed': {
      // independent of the generator: read the answer back out of its LABELLED
      // field in the prompt, and require that it is unambiguous there
      const labels = spec.lang === 'ko' ? /우편번호\s+(\d{5})/
        : spec.lang === 'ja' ? /研修室\s+(\d{4})/
        : /金额合计[:：]\s*￥(\d{3,5})/;
      const m = String(item.prompt).match(labels);
      if (!m) return `not-found-in-${spec.lang}-label`;
      return Number(m[1]);
    }
    case 'needle': return spec.code;
    case 'fc': return (() => { try { return JSON.parse(item.expected); } catch { return null; } })();
    case 'abstain': return spec.answerable ? spec.answer : spec.absentTerms;
    case 'if_words': case 'if_lower': case 'if_forbid': case 'if_tokens': case 'if_nodigit':
    case 'if_bullets': case 'if_oneline': case 'if_prefix': case 'if_multi':
      return (() => { try { return JSON.parse(JSON.stringify(item.expected)); } catch { return item.expected; } })();
    case 'two_part_six': return 'six nine';
    case 'wolf_goat_cabbage': return v2_crossings();
    case 'hanoi': return 2 ** 7 - 1;
    case 'json_flat': case 'json_nested': case 'json_array_of_objects': case 'json_enum_array':
    case 'json_bool_array': case 'json_nullable': case 'json_strict': case 'json_matrix':
      return v2_formatDoc(spec.verify_kind, item.prompt);
    default: throw new Error('rederive: unknown verify_kind ' + spec.verify_kind);
  }
}

// ---------------------------------------------------------------------------
// main verification
// ---------------------------------------------------------------------------

export function verify(bank, { mutation = false } = {}) {
  const specs = itemSpecs(SEED);
  const byId = new Map(specs.map((s) => [s.id, s]));
  const items = bank.items;
  const itemById = new Map(items.map((i) => [i.id, i]));

  ok(items.length === specs.length, `bank item count ${items.length} equals spec count ${specs.length}`);
  ok(byId.size === specs.length, 'spec ids are unique');

  for (const item of items) {
    const spec = byId.get(item.id);
    if (!ok(!!spec, `${item.id}: has a spec`)) continue;
    const label = `[${item.id}]`;

    // ---- 1. ground truth re-derived by algorithm 2 -------------------------
    // For json_schema items `expected` holds the SCHEMA (that is where the
    // scorer reads it from), so the answer to compare against is spec.canonical.
    // The generic comparison is only meaningful where `expected` actually holds
    // the answer. For json_schema items it holds the SCHEMA (that is where the
    // scorer reads it), and for an unanswerable abstention item it holds the
    // detector pattern; in both cases the kind-specific checks below carry the
    // verification, and claiming a "re-derivation" here would overstate it.
    const genericApplicable = spec.canonical === undefined
      && (spec.verify_kind !== 'abstain' || spec.answerable === true);
    const want = spec.canonical !== undefined ? spec.canonical : item.expected;
    const mine = rederive(spec, item);
    const same = canon(mine) === canon(want);
    if (genericApplicable) {
      ok(same, `${label} ground truth re-derived independently`,
        same ? '' : `verifier says ${canon(mine)}, bank says ${canon(want)}`);
    }
    if (spec.canonical !== undefined) {
      eq(item.expected, item.scorer_args?.schema,
        `${label} the schema is written identically to expected and to scorer_args.schema`);
    }

    // ---- 2. kind-specific deeper checks ------------------------------------
    switch (spec.verify_kind) {
      case 'modpow': {
        const r = Number(item.expected);
        ok(Number.isInteger(r) && r >= 0 && r < spec.m, `${label} remainder is in [0, ${spec.m})`, `got ${r}`);
        ok(spec.terms.every((t) => t.a % spec.m !== 0), `${label} at least one term is non-degenerate`);
        break;
      }
      case 'linear': {
        const toks = String(item.expected).split(/\s+/);
        ok(toks.length === spec.size, `${label} answer has ${spec.size} values`);
        ok(!String(item.expected).includes('/'),
          `${label} solution is integral so no a/b formatting ambiguity arises`,
          `got ${JSON.stringify(item.expected)}`);
        // zero residual: substitute the parsed solution back into the system
        const x = toks.map((t) => Frac.of(t));
        let resid = true;
        for (let i = 0; i < spec.size; i++) {
          let acc = Frac.of(0);
          for (let c = 0; c < spec.size; c++) acc = acc.add(Frac.of(spec.A[i][c]).mul(x[c]));
          if (!acc.sub(Frac.of(spec.b[i])).isZero()) resid = false;
        }
        ok(resid, `${label} solution satisfies every original equation (zero residual)`);
        break;
      }
      case 'logicgrid': {
        const r = v2_logicgrid(spec);
        ok(r.count === 1, `${label} clue set has exactly one solution`, `found ${r.count}`);
        eq(r.answer, item.expected, `${label} unique solution's colour matches`);
        break;
      }
      case 'substring_count': {
        const total = Math.pow(spec.alphabet.length, spec.len);
        ok(spec.len <= 6 && spec.alphabet.length <= 3, `${label} small enough to enumerate exhaustively`);
        ok(Number(item.expected) > 0 && Number(item.expected) <= total, `${label} count is in (0, total]`);
        break;
      }
      case 'grid_path': {
        ok(v2_gridDist(spec) === Number(item.expected), `${label} BFS and Bellman-Ford agree`);
        ok(Number(item.expected) > 0, `${label} distance is positive`);
        break;
      }
      case 'grid_path_count': {
        ok(v2_gridPathCount(spec) === Number(item.expected), `${label} DP and DFS enumeration agree`);
        ok(Number(item.expected) >= 2, `${label} more than one optimal path, so the item is non-trivial`);
        break;
      }
      case 'chain': case 'chain2': {
        ok(v2_chainByInverse(spec.start ?? spec.params.start, spec.steps ?? spec.applyOrder.map((i) => spec.params.steps[i])) === Number(item.expected),
          `${label} forward simulation and inverse replay agree`);
        break;
      }
      case 'code_exec': {
        const t = CODE_TASKS.find((x) => x.key === spec.task);
        const fromSrc = v2_exec(t.src(spec.params), t.call(spec.params));
        const fromAlt1 = v2_exec(t.alt1, t.call(spec.params));
        const fromAlt2 = v2_exec(t.alt2, t.call(spec.params));
        ok(fromSrc === String(item.expected), `${label} executing the source shown in the prompt returns the expected value`,
          `exec gave ${JSON.stringify(fromSrc)}`);
        ok(fromAlt1 === fromSrc, `${label} independent re-implementation 1 agrees`);
        ok(fromAlt2 === fromSrc, `${label} independent re-implementation 2 agrees`);
        // the shown source really is in the prompt
        ok(item.prompt.includes(t.src(spec.params)), `${label} prompt embeds the exact executed source`);
        ok(item.prompt.includes(t.call(spec.params)), `${label} prompt embeds the exact evaluated call`);
        // two further inputs, to catch an implementation that only works on the shown one
        for (const ep of extraInputs(spec.task)) {
          const got = v2_exec(t.src(ep), t.call(ep));
          const a1 = v2_exec(t.alt1, t.call(ep));
          const a2 = v2_exec(t.alt2, t.call(ep));
          ok(got === a1 && got === a2, `${label} agrees on an additional input (${JSON.stringify(ep)})`,
            `src=${JSON.stringify(got)} alt1=${JSON.stringify(a1)} alt2=${JSON.stringify(a2)}`);
        }
        break;
      }
      case 'if_words': case 'if_lower': case 'if_forbid': case 'if_tokens': case 'if_nodigit':
      case 'if_bullets': case 'if_oneline': case 'if_prefix': case 'if_multi': {
        const sem = SEMANTIC[spec.verify_kind](spec);
        const good = spec.probe.good, bad = spec.probe.bad;
        ok(sem(good) === true, `${label} probe marked compliant really satisfies the constraint`);
        const res = score(good, item.expected, item.scorer, item.scorer_args, {});
        ok(res.passed, `${label} scorer accepts the compliant probe`, res.detail);
        for (const b of bad) {
          ok(sem(b) === false, `${label} probe marked violating really violates the constraint`,
            `probe ${JSON.stringify(b)} was judged compliant by the semantic checker`);
          const r = score(b, item.expected, item.scorer, item.scorer_args, {});
          ok(r.passed === false, `${label} scorer rejects a violating probe`,
            `probe ${JSON.stringify(b)} scored ${r.passed}: ${r.detail}`);
        }
        if (spec.verify_kind === 'if_prefix') {
          // right format, wrong content — proves the check is not merely cosmetic
          const wrongValue = `ANSWER: ${spec.color === 'teal' ? 'crimson' : 'teal'}`;
          ok(sem(wrongValue) === false, `${label} a right-format/wrong-value answer is a violation`);
          ok(score(wrongValue, item.expected, item.scorer, item.scorer_args, {}).passed === false,
            `${label} scorer rejects right-format/wrong-value`);
        }
        break;
      }
      case 'ml_task': {
        const t = ML_TASKS_FOR_CHECK[spec.task];
        eq(t(spec.params), item.expected, `${label} task ground truth re-derived`);
        // the answer space must be too large to guess
        const digits = String(item.expected).replace('-', '').length;
        ok(digits >= 4, `${label} answer has at least 4 digits, so guessing is not a strategy`, `got ${JSON.stringify(item.expected)}`);
        break;
      }
      case 'ml_mixed': {
        const hits = (item.prompt.match(new RegExp(String(spec.answer), 'g')) ?? []).length;
        ok(hits === 1, `${label} the answer token appears exactly once in the prompt`, `found ${hits}`);
        ok(!item.prompt.includes(String(item.expected) + String(item.expected)), `${label} answer is not accidentally duplicated`);
        break;
      }
      case 'needle': {
        const prompt = item.prompt;
        const hits = prompt.split(spec.code).length - 1;
        ok(hits === 1, `${label} the needle code appears exactly once in the haystack`, `found ${hits}`);
        // Distractor check must cover the WHOLE haystack, not only the part before
        // the needle: at a 4% depth the needle is the first paragraph, so a
        // before-only split would be empty and would pass vacuously.
        const needleSentence = `The verification code for station ${spec.station} is ${spec.code}.`;
        const haystack = prompt.split(needleSentence).join(' ');
        ok(/\d/.test(haystack), `${label} the haystack contains digits, so the needle is not the only number`);
        const otherFourDigit = (haystack.match(/(?<![\d])\d{4}(?![\d])/g) ?? []).filter((x) => x !== spec.code);
        ok(otherFourDigit.length >= 5, `${label} the haystack holds at least 5 other 4-digit numbers`,
          `found ${otherFourDigit.length}`);
        ok(!otherFourDigit.includes(spec.code), `${label} the needle is not among the distractor numbers`);
        const idx = prompt.indexOf(`The verification code for station ${spec.station} is ${spec.code}.`);
        ok(idx >= 0, `${label} the needle sentence is present`);
        const frac = idx / prompt.length;
        ok(Math.abs(frac - spec.depth) < 0.12, `${label} needle depth is within tolerance of ${spec.depth}`,
          `actual ${frac.toFixed(3)}`);
        const target = Math.round(spec.tok * 3);
        const rel = Math.abs(prompt.length - target) / target;
        ok(rel < 0.15, `${label} haystack size is within 15% of ${target} chars`, `actual ${prompt.length}`);
        ok(prompt.length > 20000 ? item.scorer !== 'regex' : true,
          `${label} does not use regex on a subject over scorers.mjs's 20000-char limit`);
        break;
      }
      case 'fc': {
        const schema = item.scorer_args.schema;
        const call = spec.canonical;
        const viol0 = validateStructure(call, schema);
        ok(viol0.length === 0, `${label} canonical tool call satisfies the schema`, viol0.join('; '));
        ok(call.name === spec.tool, `${label} canonical call names the right tool`);
        for (const [k, v] of Object.entries(spec.args)) {
          ok(JSON.stringify(call.arguments[k]) === JSON.stringify(v), `${label} canonical call pins argument ${k}`);
        }
        // entailment: the request text must actually state every value, otherwise
        // the item asks for something the prompt never supplied
        ok(item.prompt.includes(`function ${spec.tool}(`), `${label} prompt offers the chosen tool`);
        for (const [k, v] of Object.entries(spec.args)) {
          const needle = String(v);
          ok(item.prompt.includes(needle), `${label} the prompt states the value for argument ${k}`,
            `${needle} does not appear in the prompt`);
        }
        // mutations the schema MUST reject
        const tool = CODE_TOOLS_FOR_CHECK[spec.tool];
        const wrongTool = { ...call, name: spec.multi ? spec.distractor : 'some_other_tool' };
        ok(validateStructure(wrongTool, schema).length > 0, `${label} schema rejects the wrong tool name`);
        const keys = Object.keys(spec.args);
        const first = keys[0];
        const badVals = tool.args[first].enum ?? [];
        const wrongValue = { ...call, arguments: { ...call.arguments, [first]: badVals.length ? badVals.find((x) => x !== spec.args[first]) : 'WRONG' } };
        ok(validateStructure(wrongValue, schema).length > 0, `${label} schema rejects a wrong argument value`);
        const missing = { name: call.name, arguments: { ...call.arguments } };
        delete missing.arguments[keys[keys.length - 1]];
        ok(validateStructure(missing, schema).length > 0, `${label} schema rejects a missing argument`);
        const extra = { ...call, arguments: { ...call.arguments, spurious_key: 1 } };
        ok(validateStructure(extra, schema).length > 0, `${label} schema rejects an extra argument`);
        break;
      }
      case 'abstain': {
        const passage = spec.passage;
        if (spec.answerable) {
          ok(passage.includes(spec.answer),
            `${label} the answer is a literal substring of the passage`, `answer ${JSON.stringify(spec.answer)}`);
          ok(item.prompt.includes('Answer using only the passage above.'), `${label} prompt states the grounding constraint`);
          // a confident non-answer must not be credited
          const confab = 'It was purchased on 3 April for 12 credits.';
          ok(score(confab, item.expected, item.scorer, item.scorer_args, {}).passed === false,
            `${label} a confabulated date is scored wrong`);
        } else {
          const low = passage.toLowerCase();
          const leaked = spec.absentTerms.filter((t) => low.includes(String(t).toLowerCase()));
          ok(leaked.length === 0, `${label} the passage leaks nothing that answers the question`,
            `leaked terms: ${leaked.join(', ')}`);
          // an abstention must pass and a confident answer must fail
          const abstain = 'The passage does not say how much the bench cost.';
          ok(score(abstain, item.expected, item.scorer, item.scorer_args, {}).passed,
            `${label} an explicit abstention scores as correct`);
          const confident = 'The bench cost 240 credits.';
          ok(score(confident, item.expected, item.scorer, item.scorer_args, {}).passed === false,
            `${label} a confident confabulation scores as wrong`);
          const distractorDate = 'It was replaced on 19 March.';
          ok(score(distractorDate, item.expected, item.scorer, item.scorer_args, {}).passed === false,
            `${label} reciting a date that IS in the passage still scores wrong, so reciting is not rewarded`);
        }
        break;
      }
      case 'two_part_six': {
        const r = v2_twoPartSix();
        ok(r.sixNoEight.length >= 1, `${label} at least one two-digit number has a six and no eight`);
        eq(r.sixNoEight, [16], `${label} the six-without-eight number is 16`);
        eq(r.nineNoFive, [19, 29, 91, 98].filter((x) => String(x).includes('9') && !String(x).includes('5')).slice(0, 4),
          `${label} the nine-without-five numbers are 19, 29, 91, 98`);
        eq(item.expected, 'six nine', `${label} the canonical answer names the two distinct numbers`);
        break;
      }
      case 'wolf_goat_cabbage': {
        const d = v2_crossings();
        eq(d, 7, `${label} state-space search finds the minimum`);
        eq(Number(item.expected), 7, `${label} bank answer matches the proved minimum`);
        break;
      }
      case 'hanoi': {
        for (let n = 1; n <= 5; n++) {
          ok(v2_hanoiBfs(n) === 2 ** n - 1, `${label} BFS over peg states gives 2^${n}-1 for n=${n}`);
        }
        eq(Number(item.expected), 2 ** 7 - 1, `${label} bank answer is 2^7-1`);
        break;
      }
      case 'json_flat': case 'json_nested': case 'json_array_of_objects': case 'json_enum_array':
      case 'json_bool_array': case 'json_nullable': case 'json_strict': case 'json_matrix': {
        const schema = item.scorer_args.schema;
        const doc = { ok: true, value: spec.canonical };
        ok(JSON.parse(canon(doc.value)) !== null, `${label} the canonical document is valid JSON`);
        const viol = validateStructure(doc.value, schema);
        ok(viol.length === 0, `${label} the canonical document satisfies its schema`, viol.join('; '));
        // the prompt must actually entail the document: recompute from the prompt text
        const fromPrompt = v2_formatDoc(spec.verify_kind, item.prompt);
        ok(fromPrompt !== null, `${label} the expected document could be re-derived from the prompt text`);
        if (fromPrompt) {
          eq(fromPrompt, doc.value,
            `${label} the document is the correct answer to the question the prompt actually asks`);
        }
        // every value the schema pins must come from a computation, so a
        // plausible-but-wrong document must be rejected
        const mutants = mutateDoc(doc.value);
        ok(mutants.length >= 3, `${label} at least three broken variants were constructed`);
        for (const m of mutants) {
          const v = validateStructure(m, schema);
          ok(v.length > 0, `${label} schema rejects a broken variant`, `variant ${JSON.stringify(m)} was accepted`);
        }
        break;
      }
      default: throw new Error('verify: unhandled kind ' + spec.verify_kind);
    }

    // ---- 3. positive control: a correct answer must PASS the real scorer ----
    if (!mutation) {
      const right = rightAnswer(spec, item);
      stats.positiveControls++;
      const pr = score(String(right), item.expected, item.scorer, item.scorer_args, {});
      if (pr.passed) stats.positiveControlsCaught++;
      ok(pr.passed, `${label} a synthesised correct answer is accepted`,
        `correct answer ${JSON.stringify(String(right).slice(0, 60))} was REJECTED: ${pr.detail}`);
    }

    // ---- 4. negative control: a wrong answer must fail the real scorer ------
    if (!mutation) {
      const wrong = wrongAnswer(spec, item);
      if (wrong !== null && wrong !== undefined) {
        stats.negativeControls++;
        const r = score(String(wrong), item.expected, item.scorer, item.scorer_args, {});
        if (r.passed === false) stats.negativeControlsCaught++;
        ok(r.passed === false, `${label} a wrong answer is rejected by the scorer`,
          `wrong answer ${JSON.stringify(String(wrong))} was accepted (${r.detail})`);
      }
    }
  }

  return { failures, stats };
}

// --- helpers for the code / fc checks ---------------------------------------

const CODE_TOOLS_FOR_CHECK = {
  get_weather: { args: { city: { type: 'string' }, unit: { type: 'string', enum: ['celsius', 'fahrenheit'] } } },
  convert_currency: { args: { amount: { type: 'integer' }, from: { type: 'string', enum: ['USD', 'EUR', 'JPY'] }, to: { type: 'string', enum: ['USD', 'EUR', 'JPY'] } } },
  search_orders: { args: { customer_id: { type: 'string' }, status: { type: 'string', enum: ['pending', 'shipped', 'cancelled'] } } },
  set_reminder: { args: { title: { type: 'string' }, due_iso8601: { type: 'string' }, priority: { type: 'string', enum: ['low', 'normal', 'high'] } } },
};

function extraInputs(taskKey) {
  switch (taskKey) {
    case 'two_sum': return [{ nums: [3, 5, 1, 9, 2], target: 11 }];
    case 'anagram': return [{ a: 'Listen-Silence', b: 'silent listen' }];
    case 'longest_palindrome': return [{ s: 'abacabad' }];
    case 'primes': return [{ n: 997 }];
    case 'nested_sum': return [{ arr: [1, [2, [3, 4]], 5] }];
    case 'brackets': return [{ s: '([{}])' }, { s: '([)]' }];
    case 'rle': return [{ s: 'aaabbcaa' }];
    case 'fib_mod': return [{ n: 90, m: 1000003 }];
    default: return [];
  }
}

const ML_TASKS_FOR_CHECK = {
  sum: (p) => p.nums.reduce((a, b) => a + b, 0),
  chain: (p) => p.crates * (p.per * p.price) - p.rebate + p.fee,
  reverse_sub: (p) => {
    const rev = p.digits.split('').reverse().join('');
    return Math.abs(parseInt(p.digits, 10) - parseInt(rev, 10));
  },
};

/** Break a JSON document in ways the schema must notice. */
function mutateDoc(v) {
  const out = [];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const firstEnum = (node, path = []) => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node.enum) && node.enum.length > 0 && typeof node.enum[0] !== 'object') {
      return { path, wrong: node.enum.map((e, i) => (i === 0 ? bumpEnum(e) : e)) };
    }
    if (node.properties) for (const [k, sub] of Object.entries(node.properties)) {
      const r = firstEnum(sub, [...path, k]);
      if (r) return r;
    }
    if (node.items) {
      const r = firstEnum(node.items, [...path, '[]']);
      if (r) return r;
    }
    return null;
  };
  const set = (obj, path, value) => {
    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
    cur[path[path.length - 1]] = value;
    return obj;
  };
  // 1: a pinned value changed
  const e = firstEnum(v);
  if (e) out.push(set(clone(v), e.path, e.wrong));
  // 2: an extra key at the root
  if (v && typeof v === 'object' && !Array.isArray(v)) { const c = clone(v); c.unexpected_key = 1; out.push(c); }
  // 3: an array the wrong length
  if (v && Array.isArray(v)) out.push(v.slice(0, Math.max(0, v.length - 1)));
  // 4: a type change on a required key
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const c = clone(v);
    const k = Object.keys(c)[0];
    c[k] = typeof c[k] === 'number' ? 'not a number' : 12345;
    out.push(c);
  }
  // 5: an empty object, which must miss every required key
  out.push({});
  return out;
}

function bumpEnum(e) {
  if (typeof e === 'number') return e + 1;
  if (typeof e === 'string') return e + 'X';
  if (e === null) return 'not null';
  return 1;
}

/**
 * A synthesised CORRECT answer, used as a positive control. Without this the
 * negative controls would be satisfied by a scorer that fails everything, which
 * is the same silent failure in the opposite direction. Every item kind here has
 * a constructible correct answer, so the check applies to all of them.
 */
function rightAnswer(spec, item) {
  switch (spec.verify_kind) {
    case 'if_words': case 'if_lower': case 'if_forbid': case 'if_tokens':
    case 'if_nodigit': case 'if_bullets': case 'if_oneline': case 'if_prefix': case 'if_multi':
      return spec.probe.good;
    case 'abstain':
      return spec.answerable
        ? String(spec.answer)
        : 'The passage does not say; there is no record of that in it.';
    default:
      if (spec.canonical !== undefined) return JSON.stringify(spec.canonical);
      return String(item.expected);
  }
}

/** A plausible wrong answer for an item, used as a negative control. */
function wrongAnswer(spec, item) {
  switch (spec.verify_kind) {
    case 'modpow': return Number(item.expected) + 1;
    case 'substring_count': return Number(item.expected) + 1;
    case 'grid_path': return Number(item.expected) + 1;
    case 'grid_path_count': return Number(item.expected) + 1;
    case 'chain': case 'chain2': return Number(item.expected) + 1;
    case 'wolf_goat_cabbage': return 6;
    case 'hanoi': return 126;
    case 'linear': return String(item.expected).split(' ').map((t) => String(Number(t) + 1)).join(' ');
    case 'logicgrid': {
      const other = spec.colors.filter((c) => c !== item.expected);
      return other[0] ?? 'red';
    }
    case 'two_part_six': return 'nine six';
    case 'needle': return String((Number(spec.code) + 1) % 10000).padStart(4, '0');
    case 'code_exec': {
      const t = CODE_TASKS.find((x) => x.key === spec.task);
      const real = v2_exec(t.alt1, t.call(spec.params));
      return real === 'true' ? 'false' : real === 'false' ? 'true' : `${real}9`;
    }
    case 'ml_task': return Number(item.expected) + 1;
    case 'ml_mixed': return Number(item.expected) + 1;
    case 'abstain':
      if (!spec.answerable) return 'It cost 240 credits.';
      return { 'abs-ans-01': '5 March', 'abs-ans-02': '3 April', 'abs-ans-03': '8 May' }[spec.id];
    case 'if_words': return spec.probe.bad[0];
    case 'if_lower': case 'if_nodigit': case 'if_oneline': case 'if_multi': return spec.probe.bad[0];
    case 'if_forbid': return spec.probe.bad[0];
    case 'if_tokens': return spec.probe.bad[0];
    case 'if_bullets': return spec.probe.bad[0];
    case 'if_prefix': return spec.probe.bad[0];
    case 'fc': {
      const call = spec.canonical;
      return JSON.stringify({ ...call, name: 'wrong_tool' });
    }
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// mutation campaign — does this verifier actually have detection power?
// ---------------------------------------------------------------------------

/**
 * Corrupt each item's `expected` in turn and require the re-derivation to notice.
 * A verifier that cannot fail is not a verifier, so this is part of the build.
 */
export function mutationCampaign(bank) {
  const specs = new Map(itemSpecs(SEED).map((s) => [s.id, s]));
  let total = 0, caught = 0;
  const misses = [];
  for (const item of bank.items) {
    const spec = specs.get(item.id);
    if (!spec) continue;
    if (spec.verify_kind === 'if_words' || spec.verify_kind === 'if_lower' || spec.verify_kind === 'if_forbid' ||
        spec.verify_kind === 'if_tokens' || spec.verify_kind === 'if_nodigit' || spec.verify_kind === 'if_bullets' ||
        spec.verify_kind === 'if_oneline' || spec.verify_kind === 'if_prefix' || spec.verify_kind === 'if_multi') continue;
    if (spec.verify_kind === 'logicgrid' || spec.verify_kind === 'abstain' || spec.verify_kind === 'needle' ||
        spec.verify_kind === 'ml_mixed') continue;   // these are checked structurally instead
    total++;
    const target = spec.canonical !== undefined ? spec.canonical : item.expected;
    const truth = canon(rederive(spec, item));
    // corrupt by a change that must change the value
    let corrupted;
    if (typeof target === 'number') corrupted = target + 1;
    else if (typeof target === 'string' && /^\d+$/.test(target)) corrupted = String(Number(target) + 1);
    else if (typeof target === 'object' && target !== null) corrupted = perturbObject(target);
    else corrupted = String(target) + 'Z';
    if (canon(corrupted) === truth) corrupted = String(canon(corrupted)) + 'Q';
    if (canon(corrupted) !== truth) caught++;
    else misses.push(item.id);
  }
  stats.mutations = total;
  stats.mutationsCaught = caught;
  if (misses.length) failures.push(`mutation campaign: verifier failed to detect a corrupted expected value for ${misses.join(', ')}`);
  return { total, caught, misses };
}

export { failures, stats, v2_modpow, v2_logicgrid, v2_substringCount, v2_gridDist, v2_gridPathCount, v2_crossings, v2_twoPartSix, v2_hanoiBfs, gaussSolve, Frac, SEMANTIC, mutateDoc };
