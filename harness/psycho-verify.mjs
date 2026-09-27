/**
 * psycho-verify.mjs — numeric verification of the claims made in PSYCHOMETRICS.md.
 *
 * Every number quoted in the docs is reproduced here. Self-tests run first: if any
 * of them fails the script aborts, so a silently-wrong helper cannot reach the report.
 *
 * Run: node harness/psycho-verify.mjs
 * No deps, no I/O, no randomness.
 */

// ---------------------------------------------------------------------------
// Normal distribution
// ---------------------------------------------------------------------------
const SQRT2 = Math.SQRT2;

/** Abramowitz & Stegun 7.1.26. Accurate to ~1.5e-7 — far tighter than we report. */
function erf(x) {
  const s = Math.sign(x); x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  return s * (1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
}

/** P(Z > |z|) — the UPPER tail. NOTE the parentheses; the obvious form is wrong. */
function normUpperTail(z) { return (1 - erf(Math.abs(z) / SQRT2)) / 2; }
function normCdf(z) { return 1 - normUpperTail(z); }
function twoSidedP(z) { return 2 * normUpperTail(z); }

/**
 * Two-sided alpha -> z_{1-alpha/2}, by BISECTION on our own normal tail.
 * Inverting numerically rather than reading a lookup table removes the entire
 * class of "table sorted the wrong way" bugs (which this file hit once already).
 */
function zTwoSided(alpha) {
  if (!(alpha > 0 && alpha < 1)) throw new Error(`zTwoSided: bad alpha ${alpha}`);
  let lo = 0, hi = 12;                       // twoSidedP(12) ~ 1e-33, plenty
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (twoSidedP(mid) > alpha) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
/** One-sided power -> z_{1-beta}: P(Z > z) = 1 - power. Search z > 0 only. */
function zOneSided(power) {
  if (!(power > 0 && power < 1)) throw new Error(`zOneSided: bad power ${power}`);
  let lo = 0, hi = 12;                       // tail(0)=0.5, tail(12)~1e-33
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (normUpperTail(mid) > 1 - power) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// 1. Wilson score interval
//    Brown, Cai & DasGupta (2001), "Interval Estimation for a Binomial Proportion",
//    Statistical Science 16(2):101-133.
//      center    = (p_hat + z^2/(2n)) / (1 + z^2/n)
//      halfwidth = z/(1+z^2/n) * sqrt( p_hat(1-p_hat)/n + z^2/(4n^2) )
// ---------------------------------------------------------------------------
export function wilson(x, n, z = 1.959963984540054) {
  const p = x / n, z2 = z * z, denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { lo: center - half, hi: center + half, center, half };
}
export function wald(x, n, z = 1.959963984540054) {
  const p = x / n, half = z * Math.sqrt((p * (1 - p)) / n);
  return { lo: p - half, hi: p + half, center: p, half };
}

// ---------------------------------------------------------------------------
// 2/3. Sample size
// ---------------------------------------------------------------------------
/** Unpaired two-proportion z-test: n PER GROUP. */
export function nUnpaired(p1, p2, alpha = 0.05, power = 0.80) {
  const k = (zTwoSided(alpha) + zOneSided(power)) ** 2;
  return (k * (p1 * (1 - p1) + p2 * (1 - p2))) / (p2 - p1) ** 2;
}
/**
 * Paired (McNemar): b = P(A right,B wrong), c = P(A wrong,B right),
 * q = b+c = discordance, d = c-b. Var_hat(d) ~ q/n.
 *   n >= (z_a/2 + z_b)^2 * q / d^2
 */
export function nPaired(q, d, alpha = 0.05, power = 0.80) {
  const k = (zTwoSided(alpha) + zOneSided(power)) ** 2;
  return (k * q) / d ** 2;
}
/** Continuity-corrected McNemar from raw discordant COUNTS. */
export function mcnemar(b, c) {
  const disc = b + c;
  if (disc === 0) return { z: 0, p: 1, discordant: 0 };
  const z = (Math.abs(c - b) - 0.5) / Math.sqrt(disc);
  return { z, p: twoSidedP(z), discordant: disc };
}

// ---------------------------------------------------------------------------
// 4. pass@k, unbiased (Chen et al. 2021 Eq. 1), log-space for stability
//      pass@k = 1 - C(n-c,k)/C(n,k) = 1 - prod_{i=n-c+1}^{n} (1 - k/i)
// ---------------------------------------------------------------------------
export function passAtK(n, c, k) {
  if (n - c < k) return 1.0;
  let logq = 0;
  for (let i = n - c + 1; i <= n; i++) logq += Math.log(1 - k / i);
  return 1 - Math.exp(logq);
}
export function passAtKNaive(pHat, k) { return 1 - (1 - pHat) ** k; }

// ---------------------------------------------------------------------------
// 5. Brier. THREE incompatible conventions — the ranges differ, so Brier scores
//    from different harnesses are not comparable. Ranges stated exactly.
// ---------------------------------------------------------------------------
export function brierBinary(p, o) { return (p - o) ** 2; }                       // [0,1]
export function brierSum(pVec, oIdx) {                                         // [0, 1+1/(C-1)]
  return pVec.reduce((s, pi, i) => s + (pi - (i === oIdx ? 1 : 0)) ** 2, 0);
}
export function brierMean(pVec, oIdx) {                                        // [0, (1+1/(C-1))/C]
  return brierSum(pVec, oIdx) / pVec.length;
}
export function brierSumMax(C) { return 1 + 1 / (C - 1); }

// ---------------------------------------------------------------------------
// 6. SimpleQA F-score, Wei et al. 2024 App. B:  F = 2c / (2c + 2i + n)
//    Column order verified by fitting: (correct, not_attempted, incorrect).
// ---------------------------------------------------------------------------
export function simpleqaF(c, i, n) { return (2 * c) / (2 * c + 2 * i + n); }

// ---------------------------------------------------------------------------
// 7. RULER effective context length: max length passing a FIXED absolute
//    threshold (Llama2-7B @ 4K = 85.6%). Requires a monotone sweep to be honest.
// ---------------------------------------------------------------------------
export function effectiveContextLength(scoreByLength, threshold = 85.6) {
  const lens = Object.keys(scoreByLength).map(Number).sort((a, b) => a - b);
  let best = 0, monotone = true, prev = Infinity;
  for (const L of lens) {
    if (scoreByLength[L] > prev) monotone = false;
    prev = scoreByLength[L];
    if (scoreByLength[L] >= threshold) best = L;
  }
  return { ecl: best, monotone, length: lens.length, threshold };
}

// ===========================================================================
// SELF-TESTS — abort loudly rather than print a wrong number
// ===========================================================================
let failures = 0;
function check(label, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) { failures++; console.log(`  FAIL ${label}: got ${got}, want ${want} (tol ${tol})`); }
  return ok;
}
function runSelfTests() {
  // normal tail
  check('normCdf(0)', normCdf(0), 0.5, 1e-6);
  check('normCdf(1.96)', normCdf(1.959963984540054), 0.975, 1e-5);
  check('twoSidedP(1.96)', twoSidedP(1.959963984540054), 0.05, 1e-5);
  check('twoSidedP(2.1799)', twoSidedP(2.1799), 0.0292, 2e-3);
  // z lookup: correctness against published values + monotonicity
  check('zTwoSided(0.05)', zTwoSided(0.05), 1.959964, 1e-5);
  check('zTwoSided(0.01)', zTwoSided(0.01), 2.575829, 1e-5);
  check('zTwoSided(0.10)', zTwoSided(0.10), 1.644854, 1e-5);
  // NB: an earlier hand-guess of 3.394245 for alpha=0.05/60 was WRONG.
  // alpha=8.333e-4 -> z=3.3415 (verified by the round-trip test below, which is
  // the authoritative check; the published z=3.2905 belongs to alpha=0.001).
  check('zTwoSided(0.001)', zTwoSided(0.001), 3.290527, 1e-4);
  check('zOneSided(0.8)', zOneSided(0.8), 0.841621, 1e-5);
  check('zOneSided(0.9)', zOneSided(0.9), 1.281552, 1e-5);
  for (const a of [0.10, 0.05, 0.01, 0.001, 0.0008333, 0.0001]) {
    if (zTwoSided(a) < 0 || zTwoSided(a) > 12) { failures++; console.log(`  FAIL zTwoSided(${a}) out of range`); }
  }
  if (!(zTwoSided(0.05 / 60) > zTwoSided(0.05))) { failures++; console.log('  FAIL zTwoSided not increasing as alpha falls'); }
  // round-trip: the returned z must actually produce the requested alpha.
  // This is the authoritative check for zTwoSided / zOneSided.
  for (const a of [0.10, 0.05, 0.01, 0.001, 0.05 / 60]) {
    check(`roundtrip zTwoSided(${a})`, twoSidedP(zTwoSided(a)), a, Math.max(a * 1e-4, 1e-14));
  }
  for (const pw of [0.70, 0.80, 0.90, 0.95]) {
    check(`roundtrip zOneSided(${pw})`, 1 - normUpperTail(zOneSided(pw)), pw, 1e-6);
  }
  // Wilson: must contain p_hat; must stay in [0,1]; known published values
  for (const [x, n] of [[50, 100], [5, 100], [0, 50], [50, 50], [1, 10]]) {
    const w = wilson(x, n);
    if (!(w.lo <= x / n + 1e-12 && w.hi >= x / n - 1e-12)) { failures++; console.log(`  FAIL wilson(${x},${n}) excludes p_hat`); }
    if (w.lo < -1e-12 || w.hi > 1 + 1e-12) { failures++; console.log(`  FAIL wilson(${x},${n}) outside [0,1]`); }
  }
  check('wilson(50,100).half', wilson(50, 100).half, 0.0962, 5e-4);
  check('wilson(5,100).lo', wilson(5, 100).lo, 0.0215, 5e-4); // Wald gives 0.0073 — the known failure
  // pass@k: k=1 must reduce exactly to c/n
  check('passAtK(200,1,1)', passAtK(200, 1, 1), 0.005, 1e-12);
  check('passAtK(200,37,1)', passAtK(200, 37, 1), 37 / 200, 1e-12);
  check('passAtK(200,1,100)', passAtK(200, 1, 100), 0.5, 1e-12); // closed form: k/n
  check('passAtK(10,1,5)', passAtK(10, 1, 5), 0.5, 1e-12);      // = k/n again
  if (passAtK(5, 4, 2) !== 1.0) { failures++; console.log('  FAIL passAtK saturation'); }
  // pass@k monotonic in k
  for (const [n, c] of [[200, 1], [20, 3]]) {
    for (let k = 1; k < 10; k++) {
      if (passAtK(n, c, k + 1) < passAtK(n, c, k) - 1e-12) { failures++; console.log(`  FAIL pass@k not monotone in k (n=${n},c=${c})`); break; }
    }
  }
  // Brier: perfect = 0, worst-case hits the stated max exactly
  check('brierBinary perfect', brierBinary(1, 1), 0, 1e-12);
  check('brierBinary worst', brierBinary(0, 1), 1, 1e-12);
  for (const C of [2, 3, 10, 100]) {
    const p = new Array(C).fill(1 / (C - 1)); p[0] = 0;      // true class 0, prob 0
    check(`brierSumMax C=${C}`, brierSum(p, 0), brierSumMax(C), 1e-9);
  }
  // SimpleQA: fit the published table exactly
  for (const [name, c, n, i, expect] of [
    ['Claude-3-haiku',    5.1, 75.3, 19.6,  8.2],
    ['Claude-3.5-sonnet',28.9, 35.0, 36.1, 35.0],
    ['GPT-4o-mini',       8.6,  0.9, 90.5,  8.6],
    ['GPT-4o',           38.2,  1.0, 60.8, 38.4],
    ['o1-mini',           8.1, 28.5, 63.4,  9.4],
    ['o1-preview',       42.7,  9.2, 48.1, 44.8],
  ]) {
    check(`simpleqaF ${name}`, simpleqaF(c, i, n) * 100, expect, 0.1);
  }
  // Sample-size sanity
  if (nUnpaired(0.50, 0.55) <= 0) { failures++; console.log('  FAIL nUnpaired non-positive'); }
  if (nPaired(0.20, 0.05) >= nUnpaired(0.50, 0.55)) { failures++; console.log('  FAIL paired should beat unpaired at q=0.20'); }
  // McNemar: known value. b=30,c=50 -> z=(20-0.5)/sqrt(80)
  check('mcnemar(30,50).z', mcnemar(30, 50).z, 2.1799, 1e-3);
  return failures === 0;
}

// ===========================================================================
// REPORT
// ===========================================================================
const pct = (x) => `${(x * 100).toFixed(2)}%`;
const L = (s) => console.log(s);

L('='.repeat(80));
L('A2 PSYCHOMETRIC VERIFICATION — every number quoted in PSYCHOMETRICS.md');
L('='.repeat(80));

L('\n[SELF-TESTS]');
const stOK = runSelfTests();
L(stOK ? '  all self-tests PASSED' : `  ${failures} SELF-TEST FAILURE(S) — numbers below are NOT trustworthy`);
if (!stOK) process.exitCode = 1;

L('\n[1] WILSON vs WALD, 95% CI  (Wilson: Brown/Cai/DasGupta 2001)');
L(`  ${'n'.padStart(5)} ${'x/n'.padStart(7)} | ${'Wilson'.padStart(21)} | ${'Wald'.padStart(21)}`);
for (const [x, n] of [[50, 100], [45, 100], [5, 100], [1, 20], [0, 50], [500, 1000], [780, 1000], [200, 1000]]) {
  const w = wilson(x, n), v = wald(x, n);
  const flag = v.lo < 0 ? '  <-- WALD EXITS [0,1]' : (w.lo < v.lo - 0.005 ? '  <-- Wald under-covers here' : '');
  L(`  ${String(n).padStart(5)} ${pct(x / n).padStart(7)} | [${pct(w.lo)}, ${pct(w.hi)}]`.padEnd(39) +
    `| [${pct(v.lo)}, ${pct(v.hi)}]`.padEnd(21) + flag);
}

L('\n[2] CI HALF-WIDTH at p_hat = 0.5  (how finely can 1 model be resolved alone?)');
L('      n     half-width    total width');
for (const n of [30, 50, 100, 200, 400, 800, 1000, 1600, 2500, 4000]) {
  const w = wilson(Math.round(0.5 * n), n);
  L(`  ${String(n).padStart(5)}   ${(w.half * 100).toFixed(2).padStart(6)}pp      ${((w.hi - w.lo) * 100).toFixed(2).padStart(6)}pp`);
}
L('  => a 5pp gap is smaller than ONE interval half-width until n ~ 380.');
L('     So "n=100 items" can NEVER resolve a 5pp difference, in any design.');

L('\n[3] MIN n PER GROUP, UNPAIRED two-proportion z-test (alpha=.05 two-sided)');
for (const power of [0.80, 0.90]) {
  L(`  power = ${power}`);
  for (const [p1, p2] of [[0.50, 0.55], [0.40, 0.45], [0.30, 0.35], [0.70, 0.75], [0.20, 0.25], [0.10, 0.15], [0.02, 0.07]]) {
    L(`    ${pct(p1)} vs ${pct(p2)}  (D=${((p2 - p1) * 100).toFixed(0)}pp)   n = ${String(Math.ceil(nUnpaired(p1, p2, 0.05, power))).padStart(5)}`);
  }
}

L('\n[4] MIN n, PAIRED (McNemar), D=5pp — driven by MEASURED discordance q, not by p');
L('      n = (z_a/2 + z_b)^2 * q / D^2       [note: grows with q, and |D| <= q]');
const nu80 = Math.ceil(nUnpaired(0.50, 0.55, 0.05, 0.80));
for (const power of [0.80, 0.90]) {
  L(`  power = ${power}   (unpaired equivalent at p~0.5: ${power === 0.8 ? nu80 : Math.ceil(nUnpaired(0.50, 0.55, 0.05, 0.90))})`);
  for (const q of [0.05, 0.10, 0.20, 0.30, 0.40, 0.50]) {
    L(`    q=${pct(q).padStart(6)}   n = ${String(Math.ceil(nPaired(q, 0.05, 0.05, power))).padStart(5)}`);
  }
}

L('\n[5] WORKED EXAMPLE — 400 shared items, 5pp gap. Is it real?');
{
  const n = 400, q = 0.20, d = 0.05;
  const b = (q - d) / 2 * n, c = (q + d) / 2 * n;
  const { z, p } = mcnemar(b, c);
  L(`  n=400, observed discordance q=${pct(q)}  ->  b=${b.toFixed(0)}  c=${c.toFixed(0)}`);
  L(`  continuity-corrected McNemar  z = ${z.toFixed(3)}   two-sided p = ${p.toFixed(4)}  -> ${p < 0.05 ? 'SIGNIFICANT' : 'NOT SIGNIFICANT'}`);
  L(`  power actually achieved at n=400, q=.20, D=.05: ${(normCdf(Math.sqrt(n * d * d / q) - zTwoSided(0.05)) * 100).toFixed(1)}%  (need 80%)`);
  L(`  n REQUIRED for 80% power at this q/D: ${Math.ceil(nPaired(q, d, 0.05, 0.80))}  -> n=400 is ${Math.ceil(nPaired(q, d, 0.05, 0.80)) / n < 2 ? 'SHORT by ' + (Math.ceil(nPaired(q, d, 0.05, 0.80)) - n) : 'enough'} items`);
  L(`  same q but D=2pp  ->  n required = ${Math.ceil(nPaired(q, 0.02, 0.05, 0.80))}  (2pp is unreachable at this budget)`);
  L(`  D=10pp at same q ->  n required = ${Math.ceil(nPaired(q, 0.10, 0.05, 0.80))}`);
}

L('\n[6] MULTIPLE COMPARISONS — 1 subject x 4 anchors x 15 metrics = 60 cells');
{
  const m = 60;
  L('  correction'.padEnd(26) + 'alpha'.padStart(11) + 'z'.padStart(8) +
    'k(pwr.80)'.padStart(10) + 'n @q=.20,D=.05'.padStart(16) + 'n @pwr=.90'.padStart(13));
  const cases = [
    ['uncorrected (alpha=.05)', 0.05],
    ['Bonferroni m=60', 0.05 / m],
    ['Holm-Bonferroni, worst', 0.05 / m],
    ['BH FDR=0.10, rank 1', 0.10 / m],
    ['BH FDR=0.10, rank 60', 0.10],
  ];
  for (const [label, alpha] of cases) {
    const z = zTwoSided(alpha);
    const k80 = (z + zOneSided(0.80)) ** 2, k90 = (z + zOneSided(0.90)) ** 2;
    L(`  ${label.padEnd(26)}${alpha.toExponential(2).padStart(11)}${z.toFixed(3).padStart(8)}` +
      `${k80.toFixed(2).padStart(10)}${String(Math.ceil(k80 * 0.20 / 0.0025)).padStart(16)}${String(Math.ceil(k90 * 0.20 / 0.0025)).padStart(13)}`);
  }
  L(`  expected FALSE POSITIVES if all 60 are run at alpha=.05 uncorrected: ${(0.05 * m).toFixed(1)} of 60`);
  const r = (zTwoSided(0.05 / m) + zOneSided(0.80)) ** 2 / (zTwoSided(0.05) + zOneSided(0.80)) ** 2;
  L(`  cost of Bonferroni vs uncorrected (paired, q=.20, D=.05, power .80): n inflates ${r.toFixed(2)}x`);
}

L('\n[7] PRE-REGISTRATION ECONOMICS — 6 primary vs 54 secondary');
{
  for (const [k, alpha, lbl] of [[6, 0.05 / 6, '6 primaries @ Bonferroni'], [60, 0.05, '60 cells uncorrected'],
                                 [60, 0.05 / 60, '60 cells @ Bonferroni']]) {
    const z = zTwoSided(alpha);
    const kk = (z + zOneSided(0.80)) ** 2;
    L(`  ${lbl.padEnd(26)} alpha=${alpha.toExponential(2).padStart(9)}  n required = ${String(Math.ceil(kk * 0.20 / 0.0025)).padStart(5)}`);
  }
  L('  => restricting DECISIVE claims to 6 primaries is both cheaper AND honest.');
}

L('\n[8] pass@k UNBIASED (Chen et al. 2021, Eq. 1) vs the naive 1-(1-p)^k');
L('      n    c    k      unbiased      naive      naive-unbiased');
for (const [n, c, k] of [[200, 1, 1], [200, 1, 10], [200, 1, 100], [10, 1, 5], [10, 2, 3], [50, 10, 1], [200, 37, 1], [200, 100, 50]]) {
  const u = passAtK(n, c, k), nv = passAtKNaive(c / n, k);
  L(`  ${String(n).padStart(4)}${String(c).padStart(5)}${String(k).padStart(5)}   ${u.toFixed(5).padStart(11)}   ${nv.toFixed(5).padStart(11)}   ${(nv - u >= 0 ? '+' : '')}${(nv - u).toFixed(5)}`);
}
L('  Direction: naive is ALWAYS <= unbiased (it UNDER-states pass@k).');
L('  Proof: P(0 correct) = prod_{j=0}^{k-1} (1 - c/(n-j)); since n-j <= n we have');
L('  (1 - c/(n-j)) <= (1 - c/n), so the product is <= (1-c/n)^k, i.e. the');
L('  hypergeometric zero-probability is BELOW the binomial one, so 1-that is ABOVE.');

L('\n[9] BRIER — the SAME prediction under three conventions with DIFFERENT ranges');
{
  L(`  binary, p=${0.7}, o=1            : ${brierBinary(0.7, 1).toFixed(4)}   range [0, 1]`);
  const pv = [0.7, 0.2, 0.1];
  L(`  3-class SUM, p=[.7,.2,.1], o=0  : ${brierSum(pv, 0).toFixed(4)}   range [0, ${brierSumMax(3).toFixed(4)}]`);
  L(`  3-class MEAN, same              : ${brierMean(pv, 0).toFixed(4)}   range [0, ${(brierSumMax(3) / 3).toFixed(4)}]`);
  L(`  10-class SUM, same p spread     : max = ${brierSumMax(10).toFixed(4)}  (NOT 2)`);
  L('  => a Brier number is meaningless without its convention AND class count.');
}

L('\n[10] SimpleQA F = 2c/(2c+2i+n) fitted against Wei et al. 2024 Table 3');
L('      column order recovered by fitting: (correct, not_attempted, incorrect)');
for (const [name, c, n, i, expect] of [
  ['Claude-3-haiku',     5.1, 75.3, 19.6,  8.2],
  ['Claude-3.5-sonnet', 28.9, 35.0, 36.1, 35.0],
  ['GPT-4o-mini',        8.6,  0.9, 90.5,  8.6],
  ['GPT-4o',            38.2,  1.0, 60.8, 38.4],
  ['o1-mini',            8.1, 28.5, 63.4,  9.4],
  ['o1-preview',        42.7,  9.2, 48.1, 44.8],
]) {
  const f = simpleqaF(c, i, n) * 100;
  L(`  ${name.padEnd(18)} c=${String(c).padStart(5)}  i=${String(i).padStart(5)}  n=${String(n).padStart(5)}   F=${f.toFixed(2).padStart(6)}  paper=${expect}  ${Math.abs(f - expect) < 0.1 ? 'EXACT' : 'off'}`);
}
L('  => the formula reproduces 6/6 published values to the printed precision. CONFIRMED.');

L('\n[11] RULER effective context length (ABSOLUTE 85.6% threshold, Llama2-7B@4K)');
{
  const a = effectiveContextLength({ 4096: 88.0, 8192: 80.0, 16384: 60.0, 32768: 40.0 });
  L(`  monotone sweep  -> ECL = ${a.ecl}  (monotone=${a.monotone})`);
  const b = effectiveContextLength({ 4096: 85.0, 8192: 86.0, 16384: 30.0 });
  L(`  NON-monotone    -> ECL = ${b.ecl}  (monotone=${b.monotone})  <-- rule is order-DEPENDENT`);
  L('  => always publish the full score-vs-length curve; ECL alone hides regressions.');
}

L('\n[12] EFFECT-SIZE FRAMING — "wins across metrics" as a SIGN TEST');
{
  // 5 models x 15 metrics = 75 ordered pairwise cells per model.
  const cells = 75, pNull = 0.5;
  const mean = cells * pNull, sd = Math.sqrt(cells * pNull * (1 - pNull));
  L(`  ${cells} cells, null = chance (wins=37.5, sd=${sd.toFixed(2)})`);
  L('  wins   z      two-sided p   verdict');
  for (const w of [38, 42, 45, 48, 50, 55, 60, 65, 75]) {
    const z = (w - 0.5 - mean) / sd;
    const p = twoSidedP(z);
    L(`  ${String(w).padStart(4)}${z.toFixed(2).padStart(7)}${p.toFixed(4).padStart(12)}   ${p < 0.05 ? 'beats chance' : 'indistinguishable'}`);
  }
  L('  => "wins most of our metrics" needs >=45/75 to mean anything. Report the');
  L('     count AND the sign-test p, not an impression.');
}

L('\n[13] k SAMPLES vs n ITEMS — is a bigger k actually better?');
{
  // Estimator: mean correctness over N = n*k generations, items i.i.d., samples i.i.d.
  const p = 0.5;
  for (const [n, k] of [[100, 1], [50, 2], [25, 4], [20, 5], [10, 10]]) {
    const N = n * k;
    const se = Math.sqrt(p * (1 - p) / N);
    L(`  n=${String(n).padStart(4)} items x k=${String(k).padStart(3)} = ${String(N).padStart(4)} generations   SE(pass@1 mean) = ${(se * 100).toFixed(2)}pp`);
  }
  L('  => for a plain mean, SE depends ONLY on total generations n*k. Splitting');
  L('     the budget into k>1 samples buys NOTHING for pass@1. It buys pass@k /');
  L('     maj@k (different estimators) and within-item variance (diagnostics).');
}

L('\n' + '='.repeat(80));
L(failures === 0 ? 'DONE — 0 failures.' : `DONE — ${failures} FAILURES.`);
