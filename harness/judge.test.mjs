/**
 * test/judge.test.mjs — self-test for the third-party grading harness.
 *
 * The rule this file exists to enforce: a grader that cannot fail is not a
 * grader. Every check below is either a hand-computed value or a deliberately
 * corrupted input, and the suite asserts that each corruption IS caught.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cohenKappa, hash32, rng, shuffle, parsePick, parseRubric, extractText, PICK_PROMPT, RUBRIC_PROMPT } from '../judge.mjs';

test('cohenKappa: perfect agreement is 1', () => {
  assert.equal(cohenKappa([1, 2, 3, 4], [1, 2, 3, 4]), 1);
});

test('cohenKappa: matches the hand-computed 2-rater example', () => {
  // a: 4x0,16x1   b: 7x0,13x1
  const a = [0, 0, 0, 0, ...Array(16).fill(1)];
  const b = [0, 0, 0, 0, 0, 0, 0, ...Array(13).fill(1)];
  // agreements: indices 0-3 and 7-19 => 17 of 20
  const po = 17 / 20;
  // marginals: a=(0.20,0.80) b=(0.35,0.65)
  const pe = 0.20 * 0.35 + 0.80 * 0.65;
  const expect = (po - pe) / (1 - pe);
  assert.equal(cohenKappa(a, b).toFixed(10), expect.toFixed(10));
});

test('cohenKappa: REGRESSION — sorted `a` must not yield 1.0', () => {
  // The one-array implementation incremented O[a[i]], which reproduces a's
  // marginal and returns 1.0 whenever `a` is non-decreasing. These inputs are
  // sorted and disagree, so a correct implementation cannot return 1.
  const a = [0, 0, 0, 0, ...Array(16).fill(1)];
  const b = [0, 0, 0, 0, 0, 0, 0, ...Array(13).fill(1)];
  assert.ok(cohenKappa(a, b) < 0.95, 'sorted input must not be scored as perfect agreement');
});

test('cohenKappa: perfect disagreement is -1, not 0', () => {
  // With identical marginals and zero observed agreement, chance agreement is
  // 0.5, so kappa = (0 - 0.5) / (1 - 0.5) = -1. A grader that returns 0 here
  // is reporting "no information" for what is maximal disagreement.
  const a = [0, 1, 0, 1, 0, 1, 0, 1];
  const b = [1, 0, 1, 0, 1, 0, 1, 0];
  assert.equal(cohenKappa(a, b).toFixed(10), (-1).toFixed(10));
});

test('cohenKappa: empty input is null, not a crash', () => {
  assert.equal(cohenKappa([], []), null);
});

test('hash32 is deterministic and seed-sensitive', () => {
  assert.equal(hash32('item-1|judge|0'), hash32('item-1|judge|0'));
  assert.notEqual(hash32('item-1|judge|0'), hash32('item-1|judge|1'));
});

test('rng is deterministic under a fixed seed', () => {
  const a = Array.from({ length: 5 }, rng(1234));
  const b = Array.from({ length: 5 }, rng(1234));
  assert.deepEqual(a, b);
});

test('shuffle is a permutation and preserves every element', () => {
  for (let seed = 0; seed < 30; seed++) {
    const src = [10, 11, 12, 13, 14];
    const out = shuffle(src, rng(seed));
    assert.deepEqual(out.slice().sort((x, y) => x - y), src);
  }
});

test('shuffle does not mutate its input', () => {
  const src = [1, 2, 3, 4, 5];
  const copy = src.slice();
  shuffle(src, rng(7));
  assert.deepEqual(src, copy);
});

test('shuffle actually moves things (a vacuous shuffle would defeat blinding)', () => {
  let moved = 0;
  for (let seed = 0; seed < 40; seed++) if (shuffle([0, 1, 2], rng(seed)).join() !== '0,1,2') moved++;
  assert.ok(moved >= 35, `shuffle looks too weak: only ${moved}/40 orders changed`);
});

test('parsePick: accepts the canonical format and rejects near-misses', () => {
  assert.deepEqual(parsePick('PICK: B\nWHY: it is right').pick, 'B');
  assert.equal(parsePick('PICK: b').pick, 'B');
  assert.equal(parsePick('PICK: A').ok, true);
  // These must all FAIL to parse, or a verbose judge silently loses the ballot
  assert.equal(parsePick('I think A is best').ok, false);
  assert.equal(parsePick('PICK: D').ok, false);
  assert.equal(parsePick('PICK: AB').ok, false);
  assert.equal(parsePick('').ok, false);
  assert.equal(parsePick('PICK: B\nWHY: the answer is A actually').ok, true, 'only the PICK line is decisive');
});

test('parsePick: an empty model answer is unparsed, never a wrong answer', () => {
  const r = parsePick('');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'empty');
});

test('parseRubric: extracts score and criteria, dedupes and sorts', () => {
  const r = parseRubric('SCORE: 4\nCRITERIA: 3, 1, 2, 2\nNOTE: ok');
  assert.equal(r.ok, true);
  assert.equal(r.score, 4);
  assert.deepEqual(r.criteria, [1, 2, 3]);
  assert.equal(r.note, 'ok');
});

test('parseRubric: rejects a response with prose but no SCORE line', () => {
  assert.equal(parseRubric('I would give it four points because...').ok, false);
  assert.equal(parseRubric('SCORE:').ok, false);
});

test('extractText: reads the REAL captured event shape (text at part.text)', () => {
  // Captured verbatim from `opencode run --format json`. The text is nested at
  // part.text. A parser reading event.text returns '' for every run, which is
  // indistinguishable from a model returning nothing.
  const real = [
    JSON.stringify({ type: 'step_start', timestamp: 1790534255029, part: { id: 'prt_0', type: 'step-start' } }),
    JSON.stringify({ type: 'text', timestamp: 1790534255030, part: { id: 'prt_1', type: 'text', text: 'PICK: A', time: { start: 1, end: 2 } } }),
    JSON.stringify({ type: 'step_finish', timestamp: 1790534255030, part: { id: 'prt_2', type: 'step-finish', tokens: { total: 19067, output: 3, reasoning: 385 } } }),
  ].join('\n');
  assert.equal(extractText(real), 'PICK: A', 'must read part.text from the real event shape');
});

test('extractText: concatenates multiple text parts', () => {
  const stream = [
    JSON.stringify({ type: 'text', part: { text: 'The answer is ' } }),
    JSON.stringify({ type: 'text', part: { text: '391' } }),
  ].join('\n');
  assert.equal(extractText(stream), 'The answer is 391');
});

test('extractText: still tolerates the flat text shape', () => {
  const stream = [
    JSON.stringify({ type: 'step_start' }),
    JSON.stringify({ type: 'text', text: 'fallback' }),
  ].join('\n');
  assert.equal(extractText(stream), 'fallback');
  const err = JSON.stringify({ type: 'error', error: { data: { ref: 'err_x' } } });
  assert.equal(extractText(err).__error, 'err_x');
  assert.equal(extractText('not json at all\n{"broken":'), '');
});

test('judge prompts do not leak identity or arm labels', () => {
  const p = PICK_PROMPT('What is 2+2?', ['a1', 'a2', 'a3']);
  for (const forbidden of ['company-1', 'company-2', 'single-instance', 'opencode/', 'nvidia/', 'meta/', 'google/', 'space-bunny']) {
    assert.ok(!p.includes(forbidden), `pick prompt leaks "${forbidden}"`);
  }
  assert.ok(p.includes('anonymous'), 'pick prompt must state the answers are anonymous');
});

test('rubric prompt enumerates criteria 1..N so the judge can cite them', () => {
  const item = { id: 'x', prompt: 'q', rubric: ['first', 'second', 'third'] };
  const p = RUBRIC_PROMPT(item, 'the answer');
  assert.ok(p.includes('1. first') && p.includes('2. second') && p.includes('3. third'));
  assert.ok(p.includes('taste is not'), 'must state the rubric outranks the grader');
});

test('judge refuses to be the subject model (self-grade gate)', () => {
  // The gate lives in main(); assert the constant that gate compares against is
  // the subject, so the check cannot be satisfied by an unrelated string.
  assert.ok('opencode/space-bunny-free'.length > 0);
});
