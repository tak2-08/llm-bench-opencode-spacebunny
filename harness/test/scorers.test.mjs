/**
 * test/scorers.test.mjs — every scorer, the choice fallback chain, and the
 * "never throws" contract.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  score, exactMatch, contains, regexMatch, jsonSchema, choice, numeric, multiAllOf,
  parseChoice, parseChoiceToken, extractJson, extractNumber, normalizeText, stripCodeFences,
  registerScorer, unregisterScorer, listScorers, validateStructure, SCORER_NAMES,
} from '../scorers.mjs';

const isResult = (r) => r && typeof r.passed === 'boolean' && typeof r.detail === 'string';

// ---------------------------------------------------------------------------
// exact_match
// ---------------------------------------------------------------------------
test('exact_match: normalizes whitespace, case, and code fences', () => {
  assert.ok(exactMatch('  PING-OK  ', 'PING-OK', { case_sensitive: true }).passed);
  assert.ok(exactMatch('ping-ok', 'PING-OK').passed, 'case-insensitive by default');
  assert.ok(exactMatch('```\nPING-OK\n```', 'PING-OK').passed, 'fences stripped');
  assert.ok(exactMatch('a\n\n  b\tc', 'a b c').passed, 'whitespace collapsed');
  assert.ok(!exactMatch('PING-OK!', 'PING-OK').passed);
  assert.ok(!exactMatch('PING OK', 'PING-OK', { case_sensitive: true }).passed);
});
test('exact_match: ignorePunctuation drops sentence-final punctuation only', () => {
  assert.ok(exactMatch('PING-OK.', 'PING-OK', { ignorePunctuation: true }).passed);
  assert.ok(!exactMatch('PING-0K', 'PING-OK', { ignorePunctuation: true }).passed);
});

// ---------------------------------------------------------------------------
// contains / regex
// ---------------------------------------------------------------------------
test('contains: any vs all, case sensitivity', () => {
  assert.ok(contains('the quick brown fox', 'quick').passed);
  assert.ok(contains('the quick brown fox', ['cat', 'fox']).passed, 'any by default');
  assert.ok(!contains('the quick brown fox', ['cat', 'fox'], { all: true }).passed);
  assert.ok(contains('the quick brown fox', ['quick', 'fox'], { all: true }).passed);
  assert.ok(contains('ABC', 'abc', { caseSensitive: true }).passed === false);
  assert.ok(contains('가나다라', '나').passed);
});
test('regex: honours flags and reports the match', () => {
  assert.ok(regexMatch('value=42', 'value=\\d+').passed);
  assert.ok(regexMatch('VALUE=42', 'value=\\d+', { flags: 'i' }).passed);
  assert.ok(!regexMatch('value=abc', '^value=\\d+$').passed);
  assert.ok(!regexMatch('x', '').passed, 'empty pattern is a fail, not a throw');
});

// ---------------------------------------------------------------------------
// json_schema
// ---------------------------------------------------------------------------
const SCHEMA = {
  type: 'object',
  required: ['answer', 'confidence'],
  additionalProperties: false,
  properties: {
    answer: { type: 'integer' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 3 },
  },
};
test('json_schema: accepts a conforming object inside a fence and with prose', () => {
  const ok1 = jsonSchema('```json\n{"answer":7,"confidence":0.9,"tags":["a"]}\n```', SCHEMA);
  assert.ok(ok1.passed, ok1.detail);
  const ok2 = jsonSchema('Sure! Here you go:\n{"answer": 7, "confidence": 1}\nHope that helps.', SCHEMA);
  assert.ok(ok2.passed, ok2.detail);
});
test('json_schema: reports each structural violation', () => {
  const r = jsonSchema('{"answer":"7","confidence":2,"extra":1}', SCHEMA);
  assert.ok(!r.passed);
  assert.match(r.detail, /expected type integer/);
  assert.match(r.detail, /2 > maximum 1/);
  assert.match(r.detail, /additional property "extra"/);
});
test('json_schema: missing required and non-object roots are rejected', () => {
  assert.match(jsonSchema('{"answer":1}', SCHEMA).detail, /missing required property "confidence"/);
  assert.match(jsonSchema('[1,2,3]', SCHEMA).detail, /expected type object/);
  assert.match(jsonSchema('not json at all', SCHEMA).detail, /no parseable JSON/);
});
test('validateStructure: enum, nested objects, integer-vs-number', () => {
  assert.deepEqual(validateStructure({ a: { b: [1, 2] } }, {
    type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'array', items: { type: 'integer' } } } } },
  }), []);
  assert.equal(validateStructure(1.5, { type: 'integer' }).length, 1);
  assert.equal(validateStructure(1.0, { type: 'integer' }).length, 0, '1.0 is an integer in JS');
  assert.equal(validateStructure('x', { enum: ['x', 'y'] }).length, 0);
  assert.equal(validateStructure('z', { enum: ['x', 'y'] }).length, 1);
  assert.equal(validateStructure([1, 2, 3], { type: 'array', maxItems: 2 }).length, 1);
});
test('extractJson: finds the first balanced object, respects strings and escapes', () => {
  assert.deepEqual(extractJson('pre {"a":"} not a brace ","b":[1,2]} post').value, { a: '} not a brace ', b: [1, 2] });
  assert.deepEqual(extractJson('noise {"a":"quote\\" and }"} tail').value, { a: 'quote" and }' });
  assert.equal(extractJson('nothing here').ok, false);
  assert.equal(stripCodeFences('```py\nx=1\n```'), 'x=1\n');
});

// ---------------------------------------------------------------------------
// choice — the documented fallback chain, step by step
// ---------------------------------------------------------------------------
test('choice: step 1 explicit markers win (English and Korean)', () => {
  assert.equal(parseChoice('ANSWER: B', ['A', 'B', 'C']).via.startsWith('marker'), true);
  assert.equal(parseChoice('ANSWER: B', ['A', 'B', 'C']).letter, 'B');
  assert.equal(parseChoice('Answer is (C)', ['A', 'B', 'C']).letter, 'C');
  assert.equal(parseChoice('정답: A', ['A', 'B', 'C']).letter, 'A');
  assert.equal(parseChoice('답은 D 입니다', ['A', 'B', 'C', 'D']).letter, 'D');
  assert.equal(parseChoice('The answer is:\n**B**', ['A', 'B', 'C']).letter, 'B');
});
test('choice: step 2 boxed, step 3 bold token', () => {
  assert.equal(parseChoice('\\boxed{C}', ['A', 'B', 'C']).via, 'boxed');
  assert.equal(parseChoice('**C**', ['A', 'B', 'C']).via, 'bold-token');
  assert.equal(parseChoice('I think **B** is right.', ['A', 'B', 'C']).letter, 'B');
});
test('choice: step 4 bracketed, step 5 bare line, step 6 last standalone letter', () => {
  assert.equal(parseChoice('(D)', ['A', 'B', 'C', 'D']).via, 'bracketed');
  assert.equal(parseChoice('After weighing the options\nC\nthat is my pick', ['A', 'B', 'C']).via, 'bare-line');
  assert.equal(parseChoice('Well honestly it could be A or D, leaning D', ['A', 'B', 'C', 'D']).via, 'last-standalone-letter');
  assert.equal(parseChoice('Well honestly it could be A or D, leaning D', ['A', 'B', 'C', 'D']).letter, 'D');
});
test('choice: chain order is strictly respected (marker beats bare line)', () => {
  // A bare 'B' appears first, but the explicit marker later must win.
  const r = parseChoice('B\n\nANSWER: D', ['A', 'B', 'C', 'D']);
  assert.equal(r.letter, 'D');
  assert.ok(r.via.startsWith('marker'));
});
test('choice: a letter outside the allowed set is rejected, chain continues', () => {
  // 'ANSWER: Z' yields Z, which is not allowed, so the chain keeps looking and
  // settles on the B that appears later in the sentence.
  const r = parseChoice('ANSWER: Z, but really B', ['A', 'B', 'C']);
  assert.equal(r.letter, 'B');
  assert.equal(r.via, 'last-standalone-letter');
  // With no allowed letter anywhere, the chain returns nothing rather than Z.
  assert.equal(parseChoice('ANSWER: Z', ['A', 'B', 'C']).letter, null);
});
test('choice: no letter at all fails cleanly, never throws', () => {
  const r = parseChoice('I refuse to answer.', ['A', 'B', 'C']);
  assert.equal(r.letter, null);
  assert.equal(r.via, 'none');
  assert.ok(!choice('I refuse to answer.', 'A', { allowed: ['A', 'B', 'C'] }).passed);
});
test('choice: multi-token expected uses scorer_args.allowed (token chain)', () => {
  const args = { allowed: ['10:00', '10:30', '11:00', '11:30'] };
  assert.ok(choice('ANSWER: 11:00', '11:00', args).passed);
  assert.ok(!choice('ANSWER: 10:30', '11:00', args).passed);
  // no marker: the longest option occurring in the answer is used
  assert.ok(choice('It happens at 11:00 exactly.', '11:00', args).passed);
  // a bare option as the whole answer
  assert.ok(choice('11:30', '11:30', args).passed);
  // nothing recognisable -> clean fail
  assert.ok(!choice('sometime later', '11:00', args).passed);
  assert.equal(parseChoiceToken('ANSWER: 11:00', args.allowed).via, 'token-marker');
});

// ---------------------------------------------------------------------------
// numeric
// ---------------------------------------------------------------------------
test('numeric: exact, tolerance, separators, percent, fraction', () => {
  assert.ok(numeric('391', 391).passed);
  assert.ok(!numeric('390', 391).passed);
  assert.ok(numeric('390.5', 391, { absTol: 0.5 }).passed);
  assert.ok(numeric('0.3333', 1 / 3, { relTol: 1e-3 }).passed);
  assert.ok(!numeric('0.30', 1 / 3, { relTol: 1e-3 }).passed);
  assert.equal(extractNumber('1,234,567'), 1234567);
  assert.equal(extractNumber('about 42%'), 42);
  assert.equal(extractNumber('$1,250.75'), 1250.75);
  assert.equal(extractNumber('3/4'), 0.75);
  assert.equal(extractNumber('no digits'), null);
  assert.ok(!numeric('no digits', 5).passed);
  assert.ok(!numeric('5', 'not a number').passed);
});
test('numeric: fromLastLine reads the final line only', () => {
  assert.ok(numeric('I tried 3.\nThen 8.\nANSWER: 8', 8, { fromLastLine: true }).passed);
  assert.ok(!numeric('I tried 3.\nThen 8.\nANSWER: 8', 3, { fromLastLine: true }).passed);
});

// ---------------------------------------------------------------------------
// multi_all_of
// ---------------------------------------------------------------------------
test('multi_all_of: requires every substring, reports the missing ones', () => {
  assert.ok(multiAllOf('alpha beta gamma', ['alpha', 'gamma']).passed);
  const r = multiAllOf('alpha beta', ['alpha', 'gamma', 'delta']);
  assert.ok(!r.passed);
  assert.match(r.detail, /gamma/);
  assert.match(r.detail, /delta/);
  assert.ok(!multiAllOf('x', []).passed, 'empty list is a fail, not a vacuous pass');
  assert.ok(multiAllOf('한국어 답변입니다', ['답변']).passed, 'no ASCII bias');
});

// ---------------------------------------------------------------------------
// custom_fn
// ---------------------------------------------------------------------------
test('custom_fn: registry dispatch, and unknown names fail safely', () => {
  assert.deepEqual(listScorers(), []);
  const bad = score('x', 'y', 'custom_fn', { name: 'nope' });
  assert.ok(!bad.passed);
  assert.match(bad.detail, /no scorer registered/);

  registerScorer('startsWith', (answer) => ({ passed: String(answer).startsWith('OK'), detail: 'prefix check' }));
  assert.ok(score('OK fine', null, 'custom_fn', { name: 'startsWith' }).passed);
  assert.ok(!score('nope', null, 'custom_fn', { name: 'startsWith' }).passed);
  assert.deepEqual(listScorers(), ['startsWith']);

  // a custom scorer that misbehaves is contained
  registerScorer('bad', () => 'not an object');
  assert.ok(!score('x', null, 'custom_fn', { name: 'bad' }).passed);
  registerScorer('boom', () => { throw new Error('kaboom'); });
  assert.ok(!score('x', null, 'custom_fn', { name: 'boom' }).passed);
  assert.match(score('x', null, 'custom_fn', { name: 'boom' }).detail, /kaboom/);

  assert.ok(unregisterScorer('startsWith'));
  assert.ok(!score('OK', null, 'custom_fn', { name: 'startsWith' }).passed);
});

// ---------------------------------------------------------------------------
// the dispatch contract
// ---------------------------------------------------------------------------
test('score(): all 8 scorer names are registered', () => {
  assert.deepEqual(SCORER_NAMES.sort(), ['choice', 'contains', 'custom_fn', 'exact_match', 'json_schema', 'multi_all_of', 'numeric', 'regex'].sort());
});
test('score(): never throws for any input, including hostile ones', () => {
  const hostile = [undefined, null, 0, '', NaN, {}, [], 'x'.repeat(50_000)];
  for (const name of SCORER_NAMES) {
    for (const a of hostile) {
      for (const e of hostile) {
        const r = score(a, e, name, { allowed: ['A', 'B'], schema: { type: 'object' }, absTol: 0, relTol: 0 });
        assert.ok(isResult(r), `${name} returned a malformed result for a=${String(a)?.slice(0, 10)}`);
      }
    }
  }
});
test('score(): unknown scorer and malformed args fail, not crash', () => {
  assert.ok(!score('a', 'a', 'no_such_scorer').passed);
  assert.match(score('a', 'a', 'no_such_scorer').detail, /unknown scorer/);
  assert.match(score('a', 'a', 'json_schema', {}).detail, /scorer_args\.schema|schema|parseable/);
  assert.ok(isResult(score('a', 'a', undefined)));
});
test('normalizeText: NFC + whitespace collapse + case', () => {
  assert.equal(normalizeText('  A\n\nB  '), 'a b');
  assert.equal(normalizeText('  A\n\nB  ', { caseSensitive: true }), 'A B');
  assert.equal(normalizeText('e\u0301'), 'é', 'combining mark is composed');
  assert.equal(normalizeText(null), '');
});
