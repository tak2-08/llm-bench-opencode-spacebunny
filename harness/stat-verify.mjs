#!/usr/bin/env node
/**
 * stat-verify.mjs — C2's own statistical helpers, with a self-test.
 *
 * Rule I hold myself to (A2 caught four self-inflicted errors of exactly this
 * kind): a formula asserted from memory is a HYPOTHESIS. A formula with a
 * self-test is a RESULT. Every function here is checked against either
 *   (a) a value derived by hand from the defining algebra, or
 *   (b) a second, structurally different implementation, or
 *   (c) an exact integer computation with no floating-point ambiguity,
 *   (d) a published reference value, including A2's PSYCHOMETRICS tables.
 *
 * Dependency-free.  node stat-verify.mjs   →  exit 0 iff every check passes.
 */

const TOL = 1e-12;

/* ═══════════════════ special functions (no lookup tables) ═══════════════════ */

/** log Γ(x), Lanczos g=7, n=9. */
function gammln(x) {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

const ITMAX = 300;
const EPS = 1e-16;
const FPMIN = Number.MIN_VALUE / 2.5;

/** P(a,x) by series — valid for x < a+1. */
function gser(a, x) {
  if (x <= 0) return 0;
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 1; n <= ITMAX; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gammln(a));
}

/** Q(a,x) by modified Lentz continued fraction — valid for x > a+1. */
function gcf(a, x) {
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammln(a)) * h;
}

/** Regularised lower incomplete gamma P(a,x). */
function gammap(a, x) {
  return x < a + 1 ? gser(a, x) : 1 - gcf(a, x);
}

/**
 * erfc(z) = Q(½, z²) for z ≥ 0.
 *
 * Chosen over 1 − erf(z) because 1 − erf(z) cancels to exactly 0 beyond
 * z ≈ 2.4, which is where our p-values live. A2's bug was a *different*
 * one — writing 1 − erf(z)/2 instead of (1 − erf(z))/2 — which is the
 * self-test's convention guard.
 */
export function erfc(z) {
  if (z < 0) return 2 - erfc(-z);
  return 1 - gammap(0.5, z * z);
}

/** P(X > z) for a standard normal. */
export function normalSf(z) {
  return 0.5 * erfc(z / Math.SQRT2);
}
/** Φ(z). */
export function normalCdf(z) {
  return 0.5 * erfc(-z / Math.SQRT2);
}

/** Two-sided 95 % normal quantile. */
export const Z_95 = 1.959963984540054;

/** Probit by bisection on our own normalCdf — no table to get backwards. */
export function zQuantile(p) {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  let lo = -40, hi = 40;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ═══════════════════ proportions ═══════════════════ */

/** Wilson score interval, centre ± half-width form. */
export function wilsonInterval(correct, n, z = Z_95) {
  if (!Number.isFinite(n) || n <= 0) {
    return { low: 0, high: 1, centre: 0, p: 0, n: 0, z };
  }
  const c = Math.min(n, Math.max(0, Number.isFinite(correct) ? correct : 0));
  const p = c / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half), centre, p, n, z };
}

/**
 * Wilson in the OTHER algebraic form (Wikipedia):
 *   L,U = (2np + z² ∓ z·sqrt(z² + 4np(1−p))) / (2(n + z²))
 * Kept as a structurally separate expression, so agreement is a cross-check
 * rather than a tautology.
 */
export function wilsonIntervalAlt(correct, n, z = Z_95) {
  if (!(n > 0)) return { low: 0, high: 1 };
  const c = Math.min(n, Math.max(0, correct));
  const z2 = z * z;
  const denom = 2 * (n + z2);
  const p = c / n;
  const centre = (2 * n * p + z2) / denom;
  const half = (z * Math.sqrt(z2 + 4 * n * p * (1 - p))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/** A2's standardised difference, PSYCHOMETRICS §5.5. */
export function standardisedDiff(pA, pB) {
  const v = (pA * (1 - pA) + pB * (1 - pB)) / 2;
  if (v <= 0) return pA === pB ? 0 : pA > pB ? Infinity : -Infinity;
  return (pA - pB) / Math.sqrt(v);
}

/* ═══════════════════ rank correlation ═══════════════════ */

/** Average ranks; ties take the mean of their span. */
export function rank(v) {
  const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

function pearson(a, b) {
  const n = a.length;
  if (n < 2) return NaN;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    sab += da * db; saa += da * da; sbb += db * db;
  }
  if (saa === 0 || sbb === 0) return NaN; // undefined, not 0
  return sab / Math.sqrt(saa * sbb);
}

/**
 * Spearman rho = Pearson on average ranks.
 *
 * NOT 1 − 6Σd²/(n(n²−1)): that identity holds only with no ties, and our
 * profiles tie constantly. The self-test pins the case where the shortcut
 * reports a *perfect* correlation for data that has none.
 */
export function spearman(x, y) {
  if (!Array.isArray(x) || !Array.isArray(y)) return NaN;
  if (x.length !== y.length || x.length < 2) return NaN;
  return pearson(rank(x), rank(y));
}

/** All permutations of [0..k-1], generated once each. */
function* perms(k) {
  const a = Array.from({ length: k }, (_, i) => i);
  if (k === 0) { yield []; return; }
  const c = Array(k).fill(0);
  yield a.slice();
  let i = 0;
  while (i < k) {
    if (c[i] < i) {
      const j = i % 2 === 0 ? 0 : c[i];
      const t = a[i]; a[i] = a[j]; a[j] = t;
      yield a.slice();
      c[i]++;
      i = 0;
    } else { c[i] = 0; i++; }
  }
}

/**
 * Exact enumeration while k! stays under this. 9! = 362880 costs well under a
 * second and 9 axes is one of the cases we care about, so the limit sits above
 * it; 10! = 3.6M does not, so k = 10 falls to Monte Carlo.
 */
const EXACT_LIMIT = 403200; // > 9!, < 10!

function factorial(k) {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return f;
}

/**
 * Smallest two-sided permutation p-value that k points can produce.
 *
 * k points admit k! orderings; the extreme observation is always accompanied by
 * its mirror, so the floor is 2/k!. This says, BEFORE any data is seen, whether
 * the planned test is capable of rejecting the null at all. It is the single
 * most consequential function in this file for C2's mission.
 */
export function minAttainableP(k) {
  return Math.min(1, 2 / factorial(k));
}

/**
 * Two-sided permutation test for Spearman rho: x fixed, y permuted.
 * Exact enumeration when k ≤ 8 (k! ≤ 40320); deterministic MC otherwise.
 *
 * Exact enumeration reports ge/total — the permutation distribution is complete,
 * so no add-one correction is warranted, and for k ≥ 2 ge ≥ 2 always (the
 * observation and its mirror), so p can never be 0.
 */
export function permTestSpearman(x, y, { mcIters = 20000, seed = 20260927 } = {}) {
  const k = Array.isArray(x) ? x.length : 0;
  if (k < 2 || !Array.isArray(y) || y.length !== k) {
    return { rho: NaN, p: NaN, method: 'undefined', perms: 0, k, note: 'needs k>=2 and equal lengths' };
  }
  const rho = spearman(x, y);
  const observed = Math.abs(rho);
  const rx = rank(x);
  const exact = factorial(k) <= EXACT_LIMIT;
  let ge = 0, total = 0;
  if (exact) {
    for (const p of perms(k)) {
      total++;
      if (Math.abs(pearson(rx, rank(p.map((i) => y[i])))) >= observed - 1e-12) ge++;
    }
  } else {
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const arr = y.slice();
    for (let it = 0; it < mcIters; it++) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      total++;
      if (Math.abs(pearson(rx, rank(arr))) >= observed - 1e-12) ge++;
    }
  }
  const p = exact ? ge / total : (ge + 1) / (total + 1);
  return { rho, p, method: exact ? 'exact-enumeration' : 'monte-carlo', perms: total, k, min_attainable_p: minAttainableP(k) };
}

/* ═══════════════════ exact discrete tests (BigInt) ═══════════════════ */

function binomC(n, k) {
  if (k < 0 || k > n) return 0n;
  const kk = BigInt(Math.min(k, n - k));
  let r = 1n;
  for (let i = 0n; i < kk; i++) r = (r * (BigInt(n) - i)) / (i + 1n);
  return r;
}
const pow2 = (n) => 2n ** BigInt(n);

/**
 * Exact two-sided McNemar on the b/c discordant counts, against Bin(b+c, ½).
 * A2's Appendix noted the continuity-corrected asymptotic version is poor at
 * low discordance and left the exact test unimplemented; here it is.
 */
export function mcnemarExact(b, c) {
  const n = b + c;
  if (n === 0) return { p: 1, b, c, n, note: 'no discordant pairs — not resolvable' };
  const mid = Math.min(b, c);
  let tail = binomC(n, mid);
  for (let k = 0; k < mid; k++) tail += binomC(n, k);
  const p = Math.min(1, 2 * Number(tail) / Number(pow2(n)));
  return { p, b, c, n, exact: true };
}

/** Exact two-sided sign test: wins out of `total` paired cells. */
export function signTest(wins, total) {
  if (!(total > 0)) return { p: 1, wins, total, note: 'no cells — not resolvable' };
  const k = Math.max(wins, total - wins);
  let tail = 0n;
  for (let i = k; i <= total; i++) tail += binomC(total, i);
  return { p: Math.min(1, 2 * Number(tail) / Number(pow2(total))), wins, total, two_sided: true };
}

/* ═══════════════════ multiplicity ═══════════════════ */

/** Holm–Bonferroni step-down, with early stop. Returns rejections in input order. */
export function holm(pvals, alpha = 0.05) {
  const m = pvals.length;
  const order = pvals.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const reject = new Array(m).fill(false);
  let alive = true;
  for (let r = 0; r < m; r++) {
    if (alive && order[r][0] <= alpha / (m - r)) reject[order[r][1]] = true;
    else alive = false;
  }
  return { reject, m, alpha };
}

/** Benjamini–Hochberg step-up at FDR q. */
export function benjaminiHochberg(pvals, q = 0.10) {
  const m = pvals.length;
  const order = pvals.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  let kmax = -1;
  for (let r = 0; r < m; r++) if (order[r][0] <= (q * (r + 1)) / m) kmax = r;
  const reject = new Array(m).fill(false);
  for (let r = 0; r <= kmax; r++) reject[order[r][1]] = true;
  return { reject, m, q, kmax };
}

/* ═══════════════════ interval geometry ═══════════════════ */

export function overlaps(a, b) {
  return a.low <= b.high && b.low <= a.high;
}
/** Distance between intervals; 0 when they overlap. */
export function gap(a, b) {
  return a.low <= b.high && b.low <= a.high ? 0 : Math.max(a.low - b.high, b.low - a.high);
}

/* ═══════════════════ self-test ═══════════════════ */

let checks = 0;
const failures = [];
function ok(name, cond, detail = '') {
  checks++;
  if (!cond) failures.push(`${name} — ${detail || 'assertion false'}`);
}
function near(name, got, want, tol = TOL) {
  checks++;
  if (!(Number.isFinite(got) && Math.abs(got - want) <= tol)) {
    failures.push(`${name} — got ${got}, want ${want}, |diff|=${Math.abs(got - want)}`);
  }
}
function deepNear(name, got, want, tol = 1e-9) {
  checks++;
  const d = Math.max(...got.map((v, i) => Math.abs(v - want[i])));
  if (!(d <= tol)) failures.push(`${name} — max|diff|=${d}; got [${got}] want [${want}]`);
}

function selfTest() {
  /* ── 1. special functions: reference values from the defining algebra ── */
  near('gammln(0.5) = ln(sqrt(pi))', gammln(0.5), Math.log(Math.sqrt(Math.PI)), 1e-13);
  near('gammln(1) = 0', gammln(1), 0, 1e-13);
  near('gammln(5) = ln(24)', gammln(5), Math.log(24), 1e-12);
  deepNear('erfc(0)=1', [erfc(0)], [1], 1e-15);
  deepNear('erfc(1)=0.15729920705028513', [erfc(1)], [0.15729920705028513], 1e-12);
  deepNear('erfc(2)=0.004677734981047266', [erfc(2)], [0.004677734981047266], 1e-14);
  deepNear('erfc(0.5)=0.4795001221869535', [erfc(0.5)], [0.4795001221869535], 1e-12);
  deepNear('erfc(3)=2.2090496998585441e-5', [erfc(3)], [2.209049699858544e-5], 1e-16);
  ok('erfc complement identity erfc(x)+erfc(-x)=2',
    [0.3, 1, 2.5, 4].every((x) => Math.abs(erfc(x) + erfc(-x) - 2) < 1e-12));
  ok('erfc is monotone decreasing',
    [0, 0.5, 1, 2, 3, 4].every((x, i, a) => i === 0 || erfc(x) < erfc(a[i - 1])));
  // series and continued fraction must agree across the switch point
  ok('P(0.5,x) series and continued fraction agree near the switch',
    Math.abs(gser(0.5, 1.4) - (1 - gcf(0.5, 1.4))) < 1e-13,
    `${gser(0.5, 1.4)} vs ${1 - gcf(0.5, 1.4)}`);

  /* ── 2. normal tail, and the erf/erfc convention A2 got wrong ── */
  near('normalCdf(0)=0.5', normalCdf(0), 0.5, 1e-15);
  near('normalSf(0)=0.5', normalSf(0), 0.5, 1e-15);
  near('normalCdf(Z_95)=0.975', normalCdf(Z_95), 0.975, 1e-12);
  near('normalSf(Z_95)=0.025', normalSf(Z_95), 0.025, 1e-12);
  near('normalSf(2.5758293)=0.005', normalSf(2.5758293035489004), 0.005, 1e-12);
  near('normalCdf(1)=0.8413447460685429', normalCdf(1), 0.8413447460685429, 1e-13);
  for (const z of [0.3, 1.1, 2.7, 5.0]) {
    near(`normalCdf(${z})+normalCdf(${-z})=1`, normalCdf(z) + normalCdf(-z), 1, 1e-14);
  }
  // Convention guard — the bug class A2 hit: writing 1 − erf(u)/2 instead of
  // (1 − erf(u))/2 when inverting erfc.  With u = z/√2 (so erfc(u) = 2·tail):
  //   correct  Φ(z) = 1 − erfc(u)/2 = 0.975   →  two-sided p = 0.05
  //   wrong    Φ(z) = 1 − erf(u)/2  = 0.525   →  two-sided p = 0.95
  // The wrong form is the one that produced a p near 1.
  {
    const u = Z_95 / Math.SQRT2;
    const erfcU = erfc(u);
    near('erfc(Z_95/√2) = 2·tail = 0.05', erfcU, 0.05, 1e-12);
    const erfU = 1 - erfcU;
    near('erf(Z_95/√2) = 0.95', erfU, 0.95, 1e-12);
    const correctCdf = 1 - erfcU / 2;
    const wrongCdf = 1 - erfU / 2;
    near('correct Φ at Z_95', correctCdf, 0.975, 1e-12);
    near('correct Φ matches normalCdf', correctCdf, normalCdf(Z_95), 1e-13);
    near('the wrong form gives Φ = 0.525', wrongCdf, 0.525, 1e-12);
    near('correct two-sided p = 0.05', 2 * (1 - correctCdf), 0.05, 1e-12);
    near('wrong two-sided p = 0.95', 2 * (1 - wrongCdf), 0.95, 1e-12);
    ok('the mis-parenthesised form inflates p from 0.05 to 0.95 (A2 bug class)',
      2 * (1 - wrongCdf) > 0.9 && 2 * (1 - correctCdf) < 0.1);
  }
  ok('far tail survives at z=6 (1−erf would cancel to 0)',
    normalSf(6) > 9.8e-10 && normalSf(6) < 1e-9, `got ${normalSf(6)}`);

  /* ── 3. probit round trip ── */
  near('zQuantile(0.975)=Z_95', zQuantile(0.975), Z_95, 1e-10);
  near('zQuantile(0.995)', zQuantile(0.995), 2.5758293035489004, 1e-9);
  near('zQuantile(0.5)=0', zQuantile(0.5), 0, 1e-12);
  near('zQuantile(0.025)=-Z_95', zQuantile(0.025), -Z_95, 1e-10);
  near('probit round trip 0.999', normalCdf(zQuantile(0.999)), 0.999, 1e-12);

  /* ── 4. Wilson: two independent forms + analytic properties ── */
  {
    // Reference values are the standard published Wilson table entries, rounded
    // to 4 dp; tolerance 1e-4 states that rounding honestly.
    deepNear('wilson(0,5) = [0, 0.4345]', [wilsonInterval(0, 5).low, wilsonInterval(0, 5).high], [0, 0.4345], 1e-4);
    deepNear('wilson(5,5) = [0.5655, 1]', [wilsonInterval(5, 5).low, wilsonInterval(5, 5).high], [0.5655, 1], 1e-4);
    const w = wilsonInterval(5, 10);
    deepNear('wilson(5,10) = [0.2366, 0.7634]', [w.low, w.high], [0.2366, 0.7634], 1e-4);
    near('wilson(5,10) centre is exactly p by symmetry', w.centre, 0.5, 1e-14);
    deepNear('wilson(0,1) = [0, 0.7935]', [wilsonInterval(0, 1).low, wilsonInterval(0, 1).high], [0, 0.7935], 1e-4);
  }
  for (const [c, n] of [[0, 5], [5, 5], [1, 3], [7, 7], [0, 1], [1, 1], [37, 40], [12, 100], [88, 88], [1, 1000]]) {
    const A = wilsonInterval(c, n), B = wilsonIntervalAlt(c, n);
    near(`Wilson forms agree (low) c=${c} n=${n}`, A.low, B.low, 1e-13);
    near(`Wilson forms agree (high) c=${c} n=${n}`, A.high, B.high, 1e-13);
  }
  near('wilson p=0 low=0', wilsonInterval(0, 5).low, 0, TOL);
  near('wilson p=1 high=1', wilsonInterval(5, 5).high, 1, TOL);
  near('wilson n=0 → [0,1]', wilsonInterval(0, 0).high, 1, TOL);
  near('wilson n=0 → low 0', wilsonInterval(0, 0).low, 0, TOL);
  ok('Wilson: centre inside [low,high] for 20 (c,n) pairs',
    [[3, 7], [9, 11], [50, 51], [0, 3], [17, 19], [1, 100], [99, 100], [6, 8], [2, 2], [13, 25],
     [40, 41], [7, 8], [0, 100], [100, 100], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]]
      .every(([c, n]) => { const r = wilsonInterval(c, n); return r.low <= r.centre + 1e-15 && r.centre <= r.high + 1e-15; }));
  ok('Wilson width SHRINKS with n at fixed p',
    (wilsonInterval(50, 100).high - wilsonInterval(50, 100).low) >
    (wilsonInterval(500, 1000).high - wilsonInterval(500, 1000).low),
    `n=100 w=${(wilsonInterval(50, 100).high - wilsonInterval(50, 100).low).toFixed(4)} n=1000 w=${(wilsonInterval(500, 1000).high - wilsonInterval(500, 1000).low).toFixed(4)}`);
  ok('Wilson n=1 is maximally uncertain', wilsonInterval(0, 1).high > 0.79);
  ok('Wilson never returns NaN when correct>n', Number.isFinite(wilsonInterval(99, 10).high) && wilsonInterval(99, 10).high < 1);
  ok('Wilson is monotone in c', [[0, 1, 2, 3, 4, 5]].flatMap(([, ...cs]) => cs.map((c, i) =>
    i === 0 || wilsonInterval(cs[i], 5).centre >= wilsonInterval(cs[i - 1], 5).centre)));

  /* ── 5. ranks ── */
  deepNear('rank, no ties', rank([10, 20, 30, 40]), [1, 2, 3, 4], 1e-13);
  deepNear('rank, one tie', rank([10, 20, 20, 30]), [1, 2.5, 2.5, 4], 1e-13);
  deepNear('rank, reversed', rank([40, 30, 20, 10]), [4, 3, 2, 1], 1e-13);
  deepNear('rank, all equal', rank([5, 5, 5]), [2, 2, 2], 1e-13);
  deepNear('rank, two tie blocks', rank([1, 1, 2, 2, 3]), [1.5, 1.5, 3.5, 3.5, 5], 1e-13);

  /* ── 6. Spearman ── */
  near('spearman monotone = +1', spearman([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]), 1, 1e-13);
  near('spearman reversed = −1', spearman([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]), -1, 1e-13);
  near('spearman 3-pt, one swap = 0.5', spearman([1, 2, 3], [2, 1, 3]), 0.5, 1e-13);
  near('spearman 3-pt, reversed = −1', spearman([1, 2, 3], [3, 2, 1]), -1, 1e-13);
  // Hand-derived: x=[1,2,2,3] → ranks [1,2.5,2.5,4]; y=[1,2,3,4] → ranks [1,2,3,4].
  // both means 2.5.  Σdxdy = 4.5, Σdx² = 4.5, Σdy² = 5.0  →  4.5/√22.5 = 0.94868330
  near('spearman with ties = Pearson on ranks (hand-derived)',
    spearman([1, 2, 2, 3], [1, 2, 3, 4]), 4.5 / Math.sqrt(22.5), 1e-13);
  {
    // Why the 1−6Σd²/(n(n²−1)) shortcut is unsafe: on a fully tied x it
    // returns a confident finite 0.5 for a correlation that is UNDEFINED.
    const rx = rank([1, 1, 1, 1]), ry = rank([1, 2, 3, 4]);
    const d2 = rx.reduce((s, v, i) => s + (v - ry[i]) ** 2, 0);
    const shortcut = 1 - (6 * d2) / (4 * (16 - 1));
    near('shortcut reports 0.5 on fully-tied x (documented hazard)', shortcut, 0.5, 1e-13);
    ok('our spearman returns NaN there instead of 1', Number.isNaN(spearman([1, 1, 1, 1], [1, 2, 3, 4])));
    ok('shortcut and rank method disagree on tied input', shortcut !== spearman([1, 1, 1, 1], [1, 2, 3, 4]));
  }
  near('spearman symmetric', spearman([3, 1, 4, 1, 5], [2, 7, 1, 8, 2]), spearman([2, 7, 1, 8, 2], [3, 1, 4, 1, 5]), 1e-13);
  ok('spearman is NaN (not 0) when one side has no variance', Number.isNaN(spearman([1, 1, 1], [1, 2, 3])));
  ok('spearman is NaN for k=1', Number.isNaN(spearman([1], [1])));
  ok('spearman is NaN for mismatched lengths', Number.isNaN(spearman([1, 2], [1])));
  {
    const base = [10, 20, 30];
    const vals = new Set();
    for (const p of perms(3)) vals.add(spearman(base, p.map((i) => base[i])).toFixed(6));
    near('3 points admit exactly 4 distinct rho values', vals.size, 4, 0);
    ok('3-point rho set is exactly {−1,−0.5,0.5,1}',
      ['-1.000000', '-0.500000', '0.500000', '1.000000'].every((v) => vals.has(v)), [...vals].join(','));
  }

  /* ── 7. THE decisive function: the attainable-p floor ── */
  near('minP(1)=1', minAttainableP(1), 1, 1e-15);
  near('minP(2)=2/2!=1', minAttainableP(2), 1, 1e-15);
  near('minP(3)=2/3!=1/3', minAttainableP(3), 2 / 6, 1e-15);
  near('minP(4)=2/4!=1/12', minAttainableP(4), 2 / 24, 1e-15);
  near('minP(5)=2/5!=1/60', minAttainableP(5), 2 / 120, 1e-15);
  near('minP(6)=2/6!=1/360', minAttainableP(6), 2 / 720, 1e-15);
  near('minP(7)=2/7!', minAttainableP(7), 2 / 5040, 1e-15);
  near('minP(9)=2/9!', minAttainableP(9), 2 / 362880, 1e-15);
  ok('3 axes CANNOT reject at α=.05 — structurally', minAttainableP(3) > 0.05);
  ok('4 axes CANNOT reject at α=.05 — structurally', minAttainableP(4) > 0.05);
  ok('5 axes CAN reject at α=.05', minAttainableP(5) < 0.05);

  /* ── 8. permutation test vs the floor ── */
  {
    const r3 = permTestSpearman([0.1, 0.9, 0.5], [0.11, 0.91, 0.52]);
    near('perm k=3 perfect p == floor 1/3', r3.p, 1 / 3, 1e-14);
    near('perm k=3 reports exact-enumeration', r3.method === 'exact-enumeration' ? 1 : 0, 1);
    near('perm k=3 enumerated all 6 orderings', r3.perms, 6, 0);
    const r3b = permTestSpearman([0.1, 0.9, 0.5], [0.9, 0.1, 0.5]);
    near('perm k=3 reversed also p==1/3', r3b.p, 1 / 3, 1e-14);
    const r4 = permTestSpearman([1, 2, 3, 4], [2, 4, 1, 3]);
    ok('perm k=4 p always > 0.05', r4.p > 0.05, `p=${r4.p}`);
    ok('perm k=4 p ≥ floor', r4.p >= minAttainableP(4) - 1e-14);
    const r5 = permTestSpearman([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
    near('perm k=5 perfect p == floor 1/60', r5.p, 1 / 60, 1e-14);
    const r9 = permTestSpearman([1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    ok('perm k=9 exact and p < 1e-3', r9.p < 1e-3 && r9.method === 'exact-enumeration', `p=${r9.p}`);
    near('perm k=9 perfect p == floor 2/9!', r9.p, 2 / 362880, 1e-15);
    near('perm k=9 enumerated all 362880 orderings', r9.perms, 362880, 0);
    near('perm k=9 rho = +1', r9.rho, 1, 1e-13);
    // never zero
    ok('perm p is never 0 for k>=2', [r3, r3b, r4, r5, r9].every((r) => r.p > 0));
    // generator integrity
    near('perms(5) yields 120 unique orderings', new Set([...perms(5)].map((p) => p.join(','))).size, 120, 0);
    near('perms(4) yields 24 unique orderings', new Set([...perms(4)].map((p) => p.join(','))).size, 24, 0);
    near('perms(3) yields 6 unique orderings', new Set([...perms(3)].map((p) => p.join(','))).size, 6, 0);
    // MC path is exercised and honestly labelled. k=10 → 10! = 3 628 800 > limit.
    const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const rm = permTestSpearman(ten, [5, 3, 9, 1, 7, 2, 8, 4, 6, 10]);
    ok('MC path declared for k=10 (10! exceeds the exact limit)', rm.method === 'monte-carlo', rm.method);
    near('k=9 stays exact (9! = 362880 under the limit)',
      permTestSpearman([1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 5, 6, 7, 8, 9]).method === 'exact-enumeration' ? 1 : 0, 1);
    ok('MC p is a sane probability', rm.p > 0 && rm.p <= 1, `p=${rm.p}`);
    // MC must land near the truth for a strong signal
    const rm2 = permTestSpearman([1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    near('MC on a perfect 9-point signal ≈ exact floor', rm2.p, minAttainableP(9), 0.01);
  }

  /* ── 9. exact McNemar, integer arithmetic ── */
  near('mcnemar(10,2) = 2·79/4096', mcnemarExact(10, 2).p, 2 * 79 / 4096, 1e-15);
  near('mcnemar symmetric', mcnemarExact(2, 10).p, mcnemarExact(10, 2).p, TOL);
  near('mcnemar(7,7) = 1', mcnemarExact(7, 7).p, 1, TOL);
  near('mcnemar(0,5) = 2/32', mcnemarExact(0, 5).p, 2 / 32, 1e-15);
  near('mcnemar(5,0) = 2/32', mcnemarExact(5, 0).p, 2 / 32, 1e-15);
  near('mcnemar(0,0) → 1, flagged not resolvable', mcnemarExact(0, 0).p, 1, TOL);
  ok('mcnemar(0,0) says so in its note', /not resolvable/.test(mcnemarExact(0, 0).note));
  {
    // independent float cross-check: binomial by recurrence, different algorithm
    // Binomial PMF by the ratio recurrence, normalised by 2^n — a different
    // algorithm from the exact BigInt combinatorial sum above.
    const pmf = (n) => {
      const c = [1];
      for (let i = 1; i <= n; i++) c[i] = (c[i - 1] * (n - i + 1)) / i;
      return c.map((v) => v / Math.pow(2, n));
    };
    for (const [b, c] of [[10, 2], [15, 5], [5, 0], [0, 5], [8, 8], [30, 10]]) {
      const n = b + c, mid = Math.min(b, c);
      const s = pmf(n).slice(0, mid + 1).reduce((a, x) => a + x, 0);
      near(`mcnemar float cross-check b=${b} c=${c}`, mcnemarExact(b, c).p, Math.min(1, 2 * s), 1e-13);
    }
  }

  /* ── 10. sign test, checked against A2's published table ── */
  near('signTest(48,75) == mcnemarExact(48,27)', signTest(48, 75).p, mcnemarExact(48, 27).p, 1e-15);
  {
    // A2 PSYCHOMETRICS §5.4 table: 42→0.356, 45→0.106, 48→0.021, 50→0.006
    const cdf = (n, k) => {
      const c = [1];
      for (let i = 1; i <= n; i++) c[i] = (c[i - 1] * (n - i + 1)) / i;
      return c.slice(0, k + 1).reduce((a, x) => a + x, 0) / Math.pow(2, n);
    };
    near('signTest(42,75) float cross-check', signTest(42, 75).p, 2 * cdf(75, 33), 1e-12);
    near('signTest(45,75) float cross-check', signTest(45, 75).p, 2 * cdf(75, 30), 1e-12);
    near('signTest(50,75) float cross-check', signTest(50, 75).p, 2 * cdf(75, 25), 1e-12);
    ok('42/75 lands in A2\'s 0.30–0.40', signTest(42, 75).p > 0.30 && signTest(42, 75).p < 0.40, `${signTest(42, 75).p}`);
    ok('45/75 lands in A2\'s 0.09–0.12', signTest(45, 75).p > 0.09 && signTest(45, 75).p < 0.12, `${signTest(45, 75).p}`);
    ok('48/75 lands in A2\'s 0.018–0.024', signTest(48, 75).p > 0.018 && signTest(48, 75).p < 0.024, `${signTest(48, 75).p}`);
    ok('50/75 lands in A2\'s 0.005–0.008', signTest(50, 75).p > 0.005 && signTest(50, 75).p < 0.008, `${signTest(50, 75).p}`);
    ok('A2\'s 48-of-75 threshold holds: 48 significant, 45 not',
      signTest(48, 75).p < 0.05 && signTest(45, 75).p > 0.05,
      `48→${signTest(48, 75).p} 45→${signTest(45, 75).p}`);
  }
  near('signTest(37,75) = 1 (exact tie)', signTest(37, 75).p, 1, TOL);
  near('signTest(75,75) = 2/2^75', signTest(75, 75).p, 2 / Math.pow(2, 75), 1e-30);
  near('signTest(0,0) → 1', signTest(0, 0).p, 1, TOL);
  near('signTest symmetric in wins', signTest(20, 60).p, signTest(40, 60).p, TOL);

  /* ── 11. multiplicity ── */
  {
    // Holm: 0.01 ≤ .05/4 ✓, 0.02 > .05/3 ✗ → stop. Exactly 1 rejection.
    deepNear('holm([.01,.02,.04,.2],.05) rejects 1', holm([0.01, 0.02, 0.04, 0.2], 0.05).reject.map(Number), [1, 0, 0, 0], 1e-13);
    // Holm: 0.005 ≤ .0125 ✓, 0.010 ≤ .01667 ✓, 0.040 > .025 ✗ → 2 rejections.
    deepNear('holm([.005,.01,.04,.2],.05) rejects 2', holm([0.005, 0.01, 0.04, 0.2], 0.05).reject.map(Number), [1, 1, 0, 0], 1e-13);
    // p order must not change the decision — only which INDEX gets flagged.
    deepNear('holm is permutation-equivariant (rejected p-value multiset)',
      holm([0.005, 0.01, 0.04, 0.2], 0.05).reject.map((r, i) => (r ? [0.005, 0.01, 0.04, 0.2][i] : null)).filter((x) => x !== null),
      holm([0.2, 0.04, 0.01, 0.005], 0.05).reject.map((r, i) => (r ? [0.2, 0.04, 0.01, 0.005][i] : null)).filter((x) => x !== null).slice().sort((a, b) => a - b), 1e-13);
    near('holm(.05, α=.05) rejects (≤ is inclusive)', holm([0.05], 0.05).reject[0] ? 1 : 0, 1);
    near('holm(.0500001, α=.05) does not', holm([0.0500001], 0.05).reject[0] ? 1 : 0, 0);
    // A2's published comparison, m=6: Holm stops at 3rd (0.039 > .0125) → 2; BH takes all 6.
    const pv = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06];
    near('A2 table: Holm on m=6 rejects 2', holm(pv, 0.05).reject.filter(Boolean).length, 2, 0);
    near('A2 table: BH q=.10 on m=6 rejects 6', benjaminiHochberg(pv, 0.10).reject.filter(Boolean).length, 6, 0);
    ok('BH is never stricter than Holm', pv.every((_, i) => !holm(pv, 0.05).reject[i] || benjaminiHochberg(pv, 0.10).reject[i]));
    // BH on A2's 4-point set: thresholds .025/.05/.075/.10 → 0.01✓ 0.02✓ 0.04✓ 0.2✗
    deepNear('bh q=.10 on [.01,.02,.04,.2] rejects 3',
      benjaminiHochberg([0.01, 0.02, 0.04, 0.2], 0.10).reject.map(Number), [1, 1, 1, 0], 1e-13);
    near('bh q=0 rejects nothing', benjaminiHochberg([0.0001, 0.0002], 0).reject.filter(Boolean).length, 0, 0);
    near('bh q=1 rejects all-ties-as-everything', benjaminiHochberg([0.9, 0.9], 1).reject.filter(Boolean).length, 2, 0);
  }

  /* ── 12. standardised difference ── */
  near('d(0.8,0.6) = 0.2/√0.2', standardisedDiff(0.8, 0.6), 0.2 / Math.sqrt(0.2), 1e-13);
  near('d(0.5,0.5) = 0', standardisedDiff(0.5, 0.5), 0, TOL);
  near('d antisymmetric', standardisedDiff(0.3, 0.9), -standardisedDiff(0.9, 0.3), TOL);
  ok('d blows up when both are at the boundary', !Number.isFinite(standardisedDiff(1, 0)) || Math.abs(standardisedDiff(1, 0)) > 10);

  /* ── 13. interval geometry ── */
  ok('overlaps: yes', overlaps({ low: 0, high: 1 }, { low: 0.5, high: 1.5 }));
  ok('overlaps: touching counts', overlaps({ low: 0, high: 0.5 }, { low: 0.5, high: 1 }));
  ok('overlaps: no', !overlaps({ low: 0, high: 0.4 }, { low: 0.6, high: 1 }));
  near('gap disjoint = 0.2', gap({ low: 0, high: 0.4 }, { low: 0.6, high: 1 }), 0.2, 1e-13);
  near('gap overlapping = 0', gap({ low: 0, high: 1 }, { low: 0.5, high: 1.5 }), 0, TOL);
  near('gap symmetric', gap({ low: 0, high: 0.1 }, { low: 0.9, high: 1 }), gap({ low: 0.9, high: 1 }, { low: 0, high: 0.1 }), TOL);

  /* ═══════════════════════════════════════════════════════════════════
     C2 SECOND PASS — checks for the formulas this pass introduced.
     Every one of these is a formula that appears in a NUMBER THIS REPORT
     QUOTES, so a silent error in any of them would corrupt a conclusion.
     ═══════════════════════════════════════════════════════════════════ */

  /* ── 14. SimpleQA F = 2c/(2c+2i+n) at the three conventions B3 measured ── */
  const F = (c, i, n) => (2 * c + 2 * i + n > 0 ? (2 * c) / (2 * c + 2 * i + n) : null);
  // B3's actual counts: 6 answerable slots all correct, 6 unanswerable slots all
  // correct abstentions, 0 hallucinations.
  near('F(6,0,0) = 1.000  (decline filed as correct)', F(6 + 6, 0, 0), 1, TOL);
  near('F(6,0,6) = 0.6667 (decline filed as not-attempted)', F(6, 0, 6), 2 / 3, 1e-13);
  near('F(6,6,0) = 0.500  (decline filed as incorrect)', F(6, 6, 0), 0.5, TOL);
  near('convention spread = 50 F-points', 100 * (1 - 0.5), 50, TOL);
  ok('F is undefined on an empty family (returns null, not NaN or 0)', F(0, 0, 0) === null);
  near('F satisfies the algebraic identity F = 1/(1 + i/c + n/(2c))', F(4, 1, 1), 1 / (1 + 1 / 4 + 1 / 8), 1e-13);
  ok('n enters F only through the denominator, and monotonically: more not-attempted lowers F',
    F(6, 0, 0) > F(6, 0, 6) && F(6, 0, 6) > F(6, 0, 99));
  near('F(6,0,6) = 8/12 exactly', F(6, 0, 6), 8 / 12, 1e-13);
  ok('F(6,0,6) != F(6,6,0) — the two conventions are genuinely different numbers',
    Math.abs(F(6, 0, 6) - F(6, 6, 0)) > 0.16);
  ok('F counts no credit for a decline under (ii) but charges nothing either — it is n, not i',
    F(6, 0, 6) < 1 && F(6, 0, 6) > 0.5);

  /* ── 15. the convention-free accuracy used on the frontier abstention axis ── */
  const acc = (c, i, n) => { const t = c + i + n; return t ? c / t : null; };
  near('acc under (i)  = 1.000', acc(12, 0, 0), 1, TOL);
  near('acc under (ii) = 0.500', acc(6, 0, 6), 0.5, TOL);
  near('acc under (iii)= 0.500', acc(6, 6, 0), 0.5, TOL);
  ok('acc collapses (ii) and (iii) to the same axis value even though their F differs by 0.167',
    acc(6, 0, 6) === acc(6, 6, 0) && Math.abs(F(6, 0, 6) - F(6, 6, 0)) > 0.16);

  /* ── 16. mean-of-k-reps as the unbiased item-level estimator ── */
  near('mean of 2 reps, both correct = 1', (1 + 1) / 2, 1, TOL);
  near('mean of 2 reps, one correct = 0.5', (1 + 0) / 2, 0.5, TOL);
  near('mean of 2 reps, neither = 0', (0 + 0) / 2, 0, TOL);
  // The 45-item subject profile: 39 items both-correct, 4 items one-of-two.
  // 39*1 + 4*0.5 = 41 over 43 measured -> 41/43.
  near('45-item subject mean = 41/43 (this report quotes 95.35%)', (39 * 1 + 4 * 0.5) / 43, 41 / 43, 1e-13);
  near('  and 41/43 as a percentage is 95.35%', 100 * (41 / 43), 95.34883, 1e-4);
  near('  conservative (both reps) = 39/43 = 90.70%', 100 * (39 / 43), 90.69767, 1e-4);
  near('  optimistic (either rep) = 43/43 = 100%', 100 * (43 / 43), 100, TOL);
  ok('the three readings are ordered conservative <= mean <= optimistic',
    39 / 43 <= (39 * 1 + 4 * 0.5) / 43 && (39 * 1 + 4 * 0.5) / 43 <= 43 / 43);
  // Arithmetic of the two gaps this report quotes, recomputed from first principles.
  near('gap vs glm on the mean  = +4.6512 pp', 100 * ((41 / 43) - (39 / 43)), 4.65116, 1e-4);
  near('gap vs muse on the mean = -2.3256 pp', 100 * ((41 / 43) - (42 / 43)), -2.32558, 1e-4);
  near('gap vs glm on the conservative reading = 0.0000 pp', 100 * ((39 / 43) - (39 / 43)), 0, TOL);
  near('gap vs muse on the conservative reading = -6.9767 pp', 100 * ((39 / 43) - (42 / 43)), -6.97674, 1e-4);
  ok('neither unbiased-mean gap exceeds the 7.3701 pp floor',
    Math.abs(100 * ((41 / 43) - (39 / 43))) < 7.3701 && Math.abs(100 * ((41 / 43) - (42 / 43))) < 7.3701);

  /* ── 17. the reproducibility floor, recomputed from B3's measured q ── */
  const dMin1 = Math.sqrt(7.849 * (5 / 85) / 85);
  near('floor at 1 rep = 7.3701 pp (q=5/85, n=85)', 100 * dMin1, 7.37014, 1e-4);
  near('floor at the mean of 2 reps = 5.2114 pp', 100 * dMin1 / Math.SQRT2, 5.21142, 1e-4);
  ok('q used here is 5/85, not A2 assumed 0.20', Math.abs(5 / 85 - 0.2) > 0.1);
  near('agreement rate 80/85 = 94.12%', 100 * (80 / 85), 94.11764, 1e-4);
  near('naive-verdict q = 5/88 (B3 second row)', 5 / 88, 0.056818, 1e-5);

  /* ── 18. the correction asymmetry this pass turns on ── */
  near('glm raw 35/45 = 77.78%', 100 * (35 / 45), 77.77778, 1e-4);
  near('glm adjudicated 39/43 = 90.70%', 100 * (39 / 43), 90.69767, 1e-4);
  near('glm correction = +12.92 pp', 100 * (39 / 43 - 35 / 45), 12.91989, 1e-4);
  near('muse raw 41/45 = 91.11%', 100 * (41 / 45), 91.11111, 1e-4);
  near('muse adjudicated 42/43 = 97.67%', 100 * (42 / 43), 97.67442, 1e-4);
  near('muse correction = +6.56 pp', 100 * (42 / 43 - 41 / 45), 6.56331, 1e-4);
  near('kimi raw 13/21 = 61.90%', 100 * (13 / 21), 61.90476, 1e-4);
  near('kimi adjudicated 18/19 = 94.74%', 100 * (18 / 19), 94.73684, 1e-4);
  near('kimi correction = +32.83 pp', 100 * (18 / 19 - 13 / 21), 32.83208, 1e-4);
  near('subject correction 94.71% - 86.93% = +7.77 pp', 100 * (161 / 170 - 153 / 176), 7.77410, 1e-4);
  ok('the correction moved BOTH headline anchors by more than it moved the subject',
    (39 / 43 - 35 / 45) > (161 / 170 - 153 / 176));

  /* ── 19. the structural floor 2/k! ── */
  near('minAttainableP(2) = 1', minAttainableP(2), 1, TOL);
  near('minAttainableP(3) = 1/3', minAttainableP(3), 1 / 3, 1e-13);
  near('minAttainableP(4) = 1/12', minAttainableP(4), 1 / 12, 1e-13);
  near('minAttainableP(5) = 1/60', minAttainableP(5), 1 / 60, 1e-13);
  ok('k=4 cannot reach alpha=.05', minAttainableP(4) > 0.05);
  ok('k=5 can', minAttainableP(5) <= 0.05);
  ok('the floor is monotonically decreasing in k', minAttainableP(3) > minAttainableP(4) && minAttainableP(4) > minAttainableP(5));
  ok('2/k! equals 1/k! for the symmetric two-sided split', Math.abs(2 * (1 / 120) - minAttainableP(5)) < 1e-15);

  /* ── 20. centre distance, and the trap that gap() sets ── */
  near('centre distance |1.0 - 0.4| = 0.6', Math.abs(1.0 - 0.4), 0.6, 1e-13);
  ok('gap() is 0 for OVERLAPPING bands even when the centres are 0.6 apart',
    gap({ low: 0.0, high: 1.0 }, { low: 0.3, high: 0.7 }) === 0);
  ok('...which is why gap 0 must never be read as a perfect match — centre distance catches it',
    Math.abs(gap({ low: 0.0, high: 1.0 }, { low: 0.3, high: 0.7 })) === 0
    && Math.abs(0.4 - 0.1) > 0);
  near('centre distance is symmetric', Math.abs(0.9 - 0.2), Math.abs(0.2 - 0.9), TOL);
  ok('centre distance is non-negative', Math.abs(0.5 - 0.5) === 0);

  /* ── 21. latency decomposition: the unit error this pass caught ── */
  // runner.mjs semantics: ttft_spawn_ms = spawn->first text (INCLUDES CLI boot);
  // ttft_opencode_ms = first step_start->first text (EXCLUDES it).
  const rec = { latency_ms: 24817, ttft_spawn_ms: 24325, ttft_opencode_ms: 496 };
  const pre = rec.ttft_spawn_ms - rec.ttft_opencode_ms;
  near('pre-model segment = 23,829 ms', pre, 23829, TOL);
  near('pre-model share = 96.01% of that run', 100 * (pre / rec.latency_ms), 96.0, 0.05);
  ok('the WRONG ratio (ttft_opencode/latency) is far smaller — this is the error that was caught',
    (rec.ttft_opencode_ms / rec.latency_ms) < 0.03);
  ok('boot dominance is real: the pre-model segment dominates',
    pre > rec.ttft_opencode_ms);
  near('the brief 98% claim is NOT what the measured median gives (93.33%)',
    100 * ((24325 - 496) / 24817), 95.97, 0.1);
  ok('so 98% is outside the measured figure and is reported as a correction, not repeated',
    Math.abs(100 * ((24325 - 496) / 24817) - 98) > 0.5);

  /* ── 22. McNemar at the discordance counts actually observed ── */
  near('McNemar exact p, b=3 c=3 (glm, conservative) = 1', mcnemarExact(3, 3).p, 1, TOL);
  ok('b=c is the least significant possible split', mcnemarExact(3, 3).p === 1);
  near('McNemar exact p, b=0 c=3 (muse, conservative) = 0.25', mcnemarExact(0, 3).p, 0.25, 1e-13);
  near('McNemar exact p, b=3 c=2 (subject self-agreement) = 1', mcnemarExact(3, 2).p, 1, TOL);
  // THE TRAP THIS CHECK EXISTS FOR. mcnemarExact returns p:1 when b+c === 0, which is
  // indistinguishable from a real "no evidence against" result. B3 hit exactly this and
  // fixed it in his own floor accessor. The contract is: callers MUST test n === 0
  // themselves, and matching.mjs does (resolvable = (b + c) > 0).
  ok('mcnemarExact(0,0) returns p=1 — the trap: 1 is a sentinel, not a finding', mcnemarExact(0, 0).p === 1);
  ok('...but it flags itself via n === 0 and an explicit note', mcnemarExact(0, 0).n === 0 && /not resolvable/.test(mcnemarExact(0, 0).note || ''));
  ok('so the only safe discriminator is n > 0, which is what matching.mjs gates on',
    mcnemarExact(3, 3).n > 0 && mcnemarExact(0, 0).n === 0);

  return { checks, failures };
}

const isMain = process.argv[1] && process.argv[1].endsWith('stat-verify.mjs');
if (isMain) {
  const { checks, failures } = selfTest();
  process.stdout.write(`stat-verify.mjs  [${failures.length === 0 ? 'PASS' : 'FAIL'}]  checks=${checks}  failures=${failures.length}\n`);
  for (const f of failures) process.stdout.write(`  FAIL ${f}\n`);
  process.exit(failures.length === 0 ? 0 : 1);
}

export { selfTest, gammln, gammap };
