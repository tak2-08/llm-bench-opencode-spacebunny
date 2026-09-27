/**
 * test/aggregate.test.mjs — Wilson CI against hand-computed values, latency
 * stats, and the per-model / per-category breakdowns.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { wilsonInterval, describe as describeStats, aggregate, Z_95, summaryRows } from '../aggregate.mjs';
import { toMarkdown } from '../report.mjs';

// ---------------------------------------------------------------------------
// Wilson CI — checked against values derived by hand from the closed form.
// ---------------------------------------------------------------------------
test('Z_95 is the two-sided 95% normal quantile', () => {
  assert.equal(Z_95, 1.959963984540054);
  assert.ok(Math.abs(Z_95 - 1.959963984) < 1e-8);
});

test('wilsonInterval: p=0.5 n=10 reproduces the textbook [0.2365, 0.7635]', () => {
  // Hand derivation:
  //   z^2 = 3.841458820694124 ; z^2/n = 0.3841458820694124 ; denom = 1.3841458820694124
  //   centre = (0.5 + 3.841458820694124/20) / 1.3841458820694124
  //          = 0.6920729410347062 / 1.3841458820694124 = 0.5   (exact by symmetry)
  //   half   = 1.959963984540054/1.3841458820694124 * sqrt(0.25/10 + 3.841458820694124/400)
  //          = 1.4159451...  * sqrt(0.034603647051735) = 1.4159451... * 0.1860202... = 0.263391...
  const r = wilsonInterval(5, 10);
  assert.ok(Math.abs(r.centre - 0.5) < 1e-12, `centre ${r.centre}`);
  assert.ok(Math.abs(r.low - 0.2366) < 5e-4, `low ${r.low}`);
  assert.ok(Math.abs(r.high - 0.7634) < 5e-4, `high ${r.high}`);
  assert.ok(Math.abs(r.low + r.high - 1) < 1e-12, 'symmetric at p=0.5');
  assert.equal(r.p, 0.5);
  assert.equal(r.n, 10);
});

test('wilsonInterval: matches the standard closed form (Wikipedia form)', () => {
  // L = (2np + z^2 - z*sqrt(z^2 + 4np(1-p))) / (2(n + z^2))
  // U = (2np + z^2 + z*sqrt(z^2 + 4np(1-p))) / (2(n + z^2))
  // Written in a deliberately different shape from aggregate.mjs (rationalised
  // vs. centre +/- half-width) so this is a real cross-check, not a restatement.
  const z = 1.959963984540054;
  const ref = (c, n) => {
    const p = c / n;
    const z2 = z * z;
    const s = z * Math.sqrt(z2 + 4 * n * p * (1 - p));
    return [(2 * n * p + z2 - s) / (2 * (n + z2)), (2 * n * p + z2 + s) / (2 * (n + z2))];
  };
  for (const [c, n] of [[0, 5], [1, 5], [3, 10], [5, 10], [7, 10], [15, 20], [50, 100], [99, 100], [1, 1], [0, 1], [2, 7], [380, 400]]) {
    const [expectLow, expectHigh] = ref(c, n);
    const got = wilsonInterval(c, n, z);
    assert.ok(Math.abs(got.low - expectLow) < 1e-12, `low c=${c} n=${n}: ${got.low} vs ${expectLow}`);
    assert.ok(Math.abs(got.high - expectHigh) < 1e-12, `high c=${c} n=${n}: ${got.high} vs ${expectHigh}`);
  }
});

test('wilsonInterval: clamps an impossible count instead of returning NaN', () => {
  // Regression: correct > n used to make p*(1-p) negative -> sqrt -> NaN, which
  // would then flow silently into a report.
  for (const [c, n] of [[50, 20], [10, 1], [-5, 10]]) {
    const r = wilsonInterval(c, n);
    assert.ok(Number.isFinite(r.low) && Number.isFinite(r.high), `NaN leaked for c=${c} n=${n}`);
    assert.ok(r.low >= 0 && r.high <= 1, `out of range for c=${c} n=${n}`);
  }
  assert.equal(wilsonInterval(10, 1).high, 1, 'over-count is treated as 1/1');
  assert.equal(wilsonInterval(NaN, 10).low, 0);
});

test('wilsonInterval: analytic properties hold at the edges', () => {
  // p=0 -> lower bound exactly 0, upper > 0
  const zero = wilsonInterval(0, 20);
  assert.equal(zero.low, 0);
  assert.ok(zero.high > 0 && zero.high < 0.2, `high ${zero.high}`);
  // p=1 -> upper bound exactly 1
  const one = wilsonInterval(20, 20);
  assert.equal(one.high, 1);
  assert.ok(one.low > 0.8, `low ${one.low}`);
  // Wald would give a zero-width or out-of-range interval here; Wilson does not.
  assert.ok(one.low < 1, 'width stays positive');
  // n=1 is maximally uncertain
  const n1 = wilsonInterval(1, 1);
  assert.ok(n1.low < 0.6 && n1.high > 0.99, JSON.stringify(n1));
  // n=0 is defined as total uncertainty
  const n0 = wilsonInterval(0, 0);
  assert.deepEqual([n0.low, n0.high, n0.n], [0, 1, 0]);
  // the interval always contains the point estimate
  for (const [c, n] of [[1, 3], [2, 3], [1, 4], [5, 9], [10, 11]]) {
    const r = wilsonInterval(c, n);
    assert.ok(r.low <= r.p && r.p <= r.high, `p=${r.p} not inside [${r.low},${r.high}]`);
  }
  // narrower as n grows, holding p fixed at 0.5 (50/100 vs 10/20)
  const narrow = wilsonInterval(50, 100);
  const wide = wilsonInterval(10, 20);
  assert.ok(narrow.high - narrow.low < wide.high - wide.low,
    `n=100 width ${narrow.high - narrow.low} should be < n=20 width ${wide.high - wide.low}`);
});

test('wilsonInterval: negative or non-finite n degrades to full uncertainty', () => {
  for (const bad of [0, -1, NaN, undefined, 'x']) {
    const r = wilsonInterval(0, bad);
    assert.equal(r.low, 0);
    assert.equal(r.high, 1);
  }
});

// ---------------------------------------------------------------------------
// describe(): latency / token distribution
// ---------------------------------------------------------------------------
test('describe: mean, median (both parities), p95 nearest-rank, max, min', () => {
  const d = describeStats([10, 20, 30, 40]);
  assert.equal(d.n, 4);
  assert.equal(d.mean, 25);
  assert.equal(d.median, 25, 'even n averages the two middle values');
  assert.equal(d.min, 10);
  assert.equal(d.max, 40);
  assert.equal(d.p95, 40, 'nearest-rank: ceil(0.95*4)=4 -> 4th value');
  assert.equal(describeStats([1, 3, 2]).median, 2, 'odd n takes the middle value');
  assert.equal(describeStats([5]).stdev, 0, 'stdev of one sample is 0');
  assert.equal(describeStats([2, 4, 4, 4, 5, 5, 7, 9]).stdev, 2.14, 'sample stdev, n-1 denominator');
  // 20 samples: ceil(0.95*20)=19 -> 19th smallest
  assert.equal(describeStats(Array.from({ length: 20 }, (_, i) => i + 1)).p95, 19);
});
test('describe: empty and non-finite inputs are safe', () => {
  assert.deepEqual(describeStats([]), { n: 0, mean: null, median: null, p95: null, max: null, min: null, stdev: null, sum: 0 });
  assert.equal(describeStats([1, null, undefined, NaN, 3]).n, 2, 'non-finite values are dropped, not counted as 0');
  assert.equal(describeStats([1, null, undefined, NaN, 3]).mean, 2);
  assert.equal(describeStats(undefined).n, 0);
});

// ---------------------------------------------------------------------------
// aggregate()
// ---------------------------------------------------------------------------
function rec(o) {
  return {
    schema: 'llm-bench/run/v1', run_id: `r${o.item_id}${o.rep ?? 0}`, item_id: 'i', rep: 0,
    model: 'm/a', category: 'math', scorer: 'exact_match', scored: true, passed: true,
    latency_ms: 100, ttft_spawn_ms: 50, ttft_model_ms: 10, ttft_opencode_ms: 8, generation_ms: 6, output_tokens: 5,
    reasoning_tokens: 1, prompt_tokens: 100, token_source: 'usage', cost: 0,
    answer: 'x', answer_preview: 'x', tool_calls: [], stripped_lines: [], malformed_line_count: 0,
    peak_rss_kb: 1000, failure: null, ...o,
  };
}

test('aggregate: accuracy denominator excludes transport failures', () => {
  const s = aggregate([
    rec({ item_id: '1', passed: true }),
    rec({ item_id: '2', passed: true }),
    rec({ item_id: '3', passed: false }),
    rec({ item_id: '4', scored: false, passed: null, failure: { kind: 'timeout', retriable: true, reason: 'x' }, latency_ms: 180000 }),
  ]);
  assert.equal(s.overall.attempts, 4);
  assert.equal(s.overall.n, 3, 'only the 3 answered+scored runs count');
  assert.equal(s.overall.correct, 2);
  assert.ok(Math.abs(s.overall.accuracy - 2 / 3) < 1e-4);
  assert.equal(s.overall.failed_attempts, 1);
  assert.equal(s.overall.reliability, 0.75);
  assert.deepEqual(s.failure_kinds, { timeout: 1 });
  // latency stats DO include the failure, so slow timeouts stay visible
  assert.equal(s.overall.latency_ms.max, 180000);
});

test('aggregate: per-model and per-category breakdowns are computed independently', () => {
  const s = aggregate([
    rec({ model: 'm/a', category: 'math', item_id: '1', passed: true }),
    rec({ model: 'm/a', category: 'code', item_id: '2', passed: false }),
    rec({ model: 'm/b', category: 'math', item_id: '3', passed: true }),
  ]);
  assert.deepEqual(Object.keys(s.per_model).sort(), ['m/a', 'm/b']);
  assert.equal(s.per_model['m/a'].n, 2);
  assert.equal(s.per_model['m/a'].accuracy, 0.5);
  assert.equal(s.per_model['m/b'].accuracy, 1);
  assert.equal(s.per_category.math.n, 2);
  assert.equal(s.per_category.math.accuracy, 1);
  assert.equal(s.per_category.code.accuracy, 0);
  assert.deepEqual(Object.keys(s.per_model_category), ['m/a :: code', 'm/a :: math', 'm/b :: math']);
  assert.equal(s.per_scorer.exact_match.n, 3);
});

test('aggregate: diagnostics tally pollution signals', () => {
  const s = aggregate([
    rec({ item_id: '1', tool_calls: ['memory_search'] }),
    rec({ item_id: '2', stripped_lines: ['> build · x'] }),
    rec({ item_id: '3', malformed_line_count: 2 }),
    rec({ item_id: '4', answer: '   ' }),
  ]);
  assert.equal(s.diagnostics.runs_with_tool_calls, 1);
  assert.equal(s.diagnostics.runs_with_stripped_banner, 1);
  assert.equal(s.diagnostics.runs_with_malformed_json, 1);
  assert.equal(s.diagnostics.runs_with_empty_answer, 1);
  assert.equal(s.diagnostics.peak_rss_kb.max, 1000);
});

test('aggregate: problems list captures wrong answers and failures for triage', () => {
  const s = aggregate([
    rec({ item_id: 'ok', passed: true }),
    rec({ item_id: 'wrong', passed: false, detail: 'normalized: "a" != "b"', answer_preview: 'a' }),
    rec({ item_id: 'boom', scored: false, passed: null, failure: { kind: 'error_event', retriable: true, reason: 'err_1' }, error_ref: 'err_1' }),
  ]);
  assert.equal(s.problems.length, 2);
  assert.deepEqual(s.problems.map((p) => p.item_id).sort(), ['boom', 'wrong']);
  assert.equal(s.problems.find((p) => p.item_id === 'boom').failure.kind, 'error_event');
});

test('aggregate: token_source reports honestly when counters are mixed', () => {
  assert.equal(aggregate([rec({ item_id: '1' })]).overall.token_source, 'usage');
  const mixed = aggregate([rec({ item_id: '1' }), rec({ item_id: '2', token_source: 'char4' })]);
  assert.equal(mixed.overall.token_source, 'mixed|char4');
  assert.equal(aggregate([rec({ item_id: '1', token_source: 'char4' })]).overall.token_source, 'mixed|char4');
});

test('aggregate: tolerates an empty or garbage input', () => {
  for (const input of [[], undefined, null, 'nope', [{}, null, 7]]) {
    const s = aggregate(input);
    assert.equal(s.overall.n, 0);
    assert.equal(s.overall.accuracy, null);
    assert.equal(s.overall.ci95.low, 1 - 1, 'empty n renders as a dash-friendly pair');
  }
});

// ---------------------------------------------------------------------------
// report rendering
// ---------------------------------------------------------------------------
test('toMarkdown: renders all sections and never throws on an empty summary', () => {
  const s = aggregate([rec({ item_id: '1', model: 'opencode/space-bunny-free' })]);
  s.generated_at = '2026-09-27T00:00:00.000Z';
  const md = toMarkdown(s, { title: 'T', notes: ['a note'] });
  for (const needle of ['# T', '## Overall', '## Per model', '## Per category', '## Per scorer', '## Diagnostics', 'Wilson', 'a note', 'opencode/space-bunny-free']) {
    assert.ok(md.includes(needle), `markdown is missing "${needle}"`);
  }
  const empty = toMarkdown(aggregate([]), { title: 'empty' });
  assert.ok(empty.includes('## Overall'));
  assert.ok(empty.includes('—'), 'n=0 renders as em-dashes, not NaN');
  assert.ok(!empty.includes('NaN'), 'NaN must never reach the report');
  assert.equal(summaryRows(aggregate([])).length, 1, 'header row only');
});
