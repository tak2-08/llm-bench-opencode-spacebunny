/**
 * test/parse.test.mjs — TTFT / answer extraction from messy real stdout.
 * All fixtures below are verbatim shapes captured from opencode 1.18.22.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stripAnsi, stripBannerLines, parseJsonEvents, deriveFromEvents, estimateTokensChars4,
  makeRunId, classifyFailure, findErrRef, FAILURE,
} from '../runner.mjs';

const ESC = String.fromCharCode(27);

test('stripAnsi removes SGR colour codes and OSC sequences', () => {
  assert.equal(stripAnsi(`${ESC}[0m\n${ESC}[1;32mOK${ESC}[0m`), '\nOK');
  assert.equal(stripAnsi(`${ESC}]0;title${String.fromCharCode(7)}tail`), 'tail');
  assert.equal(stripAnsi('plain'), 'plain');
  assert.equal(stripAnsi(''), '');
  assert.equal(stripAnsi(undefined), '');
});

test('stripBannerLines drops the opencode banner but keeps model output', () => {
  // VERBATIM from opencode 1.18.22 default format: banner is on STDERR, but this
  // guards the case where a build puts it on stdout.
  const raw = `${ESC}[0m\n> build · space-bunny-free\n${ESC}[0m\nPING-OK\n`;
  const r = stripBannerLines(raw);
  assert.equal(r.strippedLines.length, 1);
  assert.match(r.strippedLines[0], /build · space-bunny-free/);
  assert.equal(r.text.trim(), 'PING-OK');
});

test('stripBannerLines never eats a model answer that looks like a banner', () => {
  const r = stripBannerLines('The build · deploy step failed\n> not a banner line\n');
  assert.ok(r.strippedLines.length <= 1);
  assert.match(r.text, /not a banner line/);
});

test('parseJsonEvents: verbatim happy path with per-line arrival times', () => {
  const stdout = [
    '{"type":"step_start","timestamp":1790512384948,"part":{"type":"step-start"}}',
    '{"type":"text","timestamp":1790512386533,"part":{"type":"text","text":"1\\n2\\n3","time":{"start":1,"end":2}}}',
    '{"type":"step_finish","timestamp":1790512386533,"part":{"type":"step-finish","reason":"stop","tokens":{"total":28329,"input":23,"output":49,"reasoning":129,"cache":{"write":0,"read":28128}},"cost":0}}',
  ].join('\n');
  const { events, malformed } = parseJsonEvents(stdout, { lineArrivalMs: [8948, 10533, 10533] });
  assert.equal(malformed.length, 0);
  assert.equal(events.length, 3);

  const d = deriveFromEvents(events);
  assert.equal(d.answer, '1\n2\n3');
  assert.equal(d.firstEventMs, 8948);
  assert.equal(d.firstTextMs, 10533);
  // TTFT excluding CLI boot: first event -> first non-empty text part
  assert.equal(d.ttftModelMs, 10533 - 8948);
  assert.equal(d.hasUsage, true);
  assert.equal(d.usage.output, 49);
  assert.equal(d.usage.reasoning, 129);
  assert.equal(d.usage.input, 23);
  assert.equal(d.usage.cacheRead, 28128);
  assert.equal(d.cost, 0);
  assert.equal(d.error, null);
  assert.deepEqual(d.toolCalls, []);
});

test('parseJsonEvents: sums usage across multiple steps and collects tool calls', () => {
  const stdout = [
    '{"type":"step_start","part":{"type":"step-start"}}',
    '{"type":"tool_use","part":{"type":"tool","tool":"memory_search","state":{"status":"completed"}}}',
    '{"type":"step_finish","part":{"type":"step-finish","tokens":{"total":28441,"input":13,"output":42,"reasoning":252,"cache":{"write":0,"read":28134}},"cost":0}}',
    '{"type":"step_start","part":{"type":"step-start"}}',
    '{"type":"text","part":{"type":"text","text":"done"}}',
    '{"type":"step_finish","part":{"type":"step-finish","tokens":{"total":29509,"input":972,"output":98,"reasoning":0,"cache":{"write":0,"read":28439}},"cost":0}}',
  ].join('\n');
  const { events } = parseJsonEvents(stdout, { lineArrivalMs: [1, 2, 3, 4, 5, 6] });
  const d = deriveFromEvents(events);
  assert.equal(d.answer, 'done');
  assert.equal(d.usage.output, 140, '42 + 98 across steps');
  assert.equal(d.usage.total, 57950);
  assert.deepEqual(d.toolCalls, ['memory_search']);
  assert.equal(d.stepFinishes, 2);
});

test('parseJsonEvents: tolerates junk lines and a truncated final line', () => {
  const stdout = [
    '> build · space-bunny-free',                                   // banner on stdout
    'totally not json',                                             // garbage
    '{"type":"text","part":{"type":"text","text":"ok"}}',
    '{"type":"text","part":{"type":"tex',                            // killed mid-write
  ].join('\n');
  const { events, malformed } = parseJsonEvents(stdout, { lineArrivalMs: [10, 11, 12, 13] });
  assert.equal(events.length, 1);
  assert.equal(events[0].part.text, 'ok');
  assert.equal(malformed.length, 2, 'banner + garbage are malformed, not fatal');
  assert.equal(deriveFromEvents(events).answer, 'ok');
});

test('parseJsonEvents: ignores whitespace-only text parts when timing TTFT', () => {
  const stdout = [
    '{"type":"text","part":{"type":"text","text":"   \\n"}}',
    '{"type":"text","part":{"type":"text","text":"real answer"}}',
  ].join('\n');
  const { events } = parseJsonEvents(stdout, { lineArrivalMs: [100, 500] });
  const d = deriveFromEvents(events);
  assert.equal(d.firstTextMs, 500, 'whitespace-only part must not count as first text');
  // answer joins all text parts with '\n', so the blank part contributes a separator.
  assert.equal(d.answer, '   \n\nreal answer', 'but its content is still kept');
  assert.equal(d.textPartCount, 2);
});

test('parseJsonEvents: extracts the real error signature (err_ ref)', () => {
  // VERBATIM from a failing opencode run on 2026-09-27.
  const stdout = '{"type":"error","timestamp":1790512419295,"sessionID":"ses_x","error":{"name":"UnknownError","data":{"message":"Unexpected server error. Check server logs for details.","ref":"err_c5491590"}}}';
  const { events } = parseJsonEvents(stdout, { lineArrivalMs: [9394] });
  const d = deriveFromEvents(events);
  assert.equal(d.error.ref, 'err_c5491590');
  assert.equal(d.error.name, 'UnknownError');
  assert.equal(d.answer, '', 'an error event yields no answer');
  assert.equal(findErrRef(stdout), 'err_c5491590');
});

test('parseJsonEvents: opencode-clock TTFT is immune to chunk coalescing', () => {
  // Regression: the arrival-based ttftModelMs is quantised by stdout chunking and
  // reads ~0 when every event lands in one chunk (observed: 1 ms on a real run).
  // The event `timestamp` field is stamped by opencode, so it is not.
  const stdout = [
    '{"type":"step_start","timestamp":1790512465506,"part":{"type":"step-start"}}',
    '{"type":"text","timestamp":1790512472464,"part":{"type":"text","text":"1\\n2","time":{"start":1790512471769,"end":1790512472430}}}',
    '{"type":"step_finish","timestamp":1790512472464,"part":{"type":"step-finish","tokens":{"total":1,"input":1,"output":2,"reasoning":0,"cache":{"read":0,"write":0}},"cost":0}}',
  ].join('\n');
  // ALL THREE LINES SHARE ONE ARRIVAL TIME, as they do when coalesced.
  const { events } = parseJsonEvents(stdout, { lineArrivalMs: [10087, 10087, 10087] });
  const d = deriveFromEvents(events);
  assert.equal(d.ttftModelMs, 0, 'arrival-based collapses to 0 when coalesced');
  assert.equal(d.ttftOpencodeMs, 1790512472464 - 1790512465506, 'opencode clock still resolves 6958 ms');
  assert.equal(d.generationMs, 1790512472430 - 1790512471769, 'generation window is 661 ms');
});

test('parseJsonEvents: opencode-clock fields are null when timestamps are absent', () => {
  const { events } = parseJsonEvents('{"type":"step_start","part":{}}\n{"type":"text","part":{"type":"text","text":"x"}}', { lineArrivalMs: [1, 2] });
  const d = deriveFromEvents(events);
  assert.equal(d.ttftOpencodeMs, null);
  assert.equal(d.generationMs, null);
  assert.equal(d.ttftModelMs, 1, 'the arrival-based metric still works');
});

test('estimateTokensChars4 documents its bias: ceil(chars/4)', () => {
  assert.equal(estimateTokensChars4(''), 0);
  assert.equal(estimateTokensChars4('12345678'), 2);
  assert.equal(estimateTokensChars4('1234567'), 2, 'rounds up');
  // The real counter said 5 tokens for "PING-OK" (7 chars) => the proxy reports 2.
  // This under-counting of short ASCII answers is why usage counters are preferred.
  assert.ok(estimateTokensChars4('PING-OK') < 5);
});

test('makeRunId is stable, order-sensitive, and rep-sensitive', () => {
  assert.equal(makeRunId('m', 'i', 0), makeRunId('m', 'i', 0));
  assert.notEqual(makeRunId('m', 'i', 0), makeRunId('m', 'i', 1));
  assert.notEqual(makeRunId('m', 'i', 0), makeRunId('i', 'm', 0));
  assert.notEqual(makeRunId('m', 'i', 0), makeRunId('m', 'j', 0));
  assert.match(makeRunId('m', 'i', 0), /^[0-9a-f]{16}$/);
});

test('classifyFailure: an answered run is never a failure, whatever it scored', () => {
  const derived = { answer: 'wrong but real', error: null };
  assert.equal(classifyFailure({ timedOut: false, killed: false, exitCode: 0, derived, stderr: '' }), null);
});

test('classifyFailure: classifies every transport shape as retriable', () => {
  const base = { timedOut: false, killed: false, exitCode: 0, stderr: '' };
  const timedout = classifyFailure({ ...base, timedOut: true, derived: { answer: '', error: null } });
  assert.equal(timedout.kind, FAILURE.TIMEOUT);
  assert.equal(timedout.retriable, true);

  const errEvent = classifyFailure({ ...base, derived: { answer: '', error: { ref: 'err_c5491590' } } });
  assert.equal(errEvent.kind, FAILURE.ERROR_EVENT);
  assert.equal(errEvent.retriable, true);

  const empty = classifyFailure({ ...base, exitCode: 0, derived: { answer: '   ', error: null } });
  assert.equal(empty.kind, FAILURE.EMPTY_ANSWER);
  assert.equal(empty.retriable, true);

  const killed = classifyFailure({ ...base, killed: true, exitCode: null, derived: { answer: '', error: null } });
  assert.equal(killed.kind, FAILURE.KILLED);
  assert.equal(killed.retriable, false, 'shutdown kill must not be retried');
});
