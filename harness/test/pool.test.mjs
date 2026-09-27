/**
 * test/pool.test.mjs — resumability, retry policy, jitter, graceful shutdown.
 * Uses an injected fake runner, so NO model is called by this file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPool, readLog, appendRecord, completedRunIds, buildTasks, backoffMs, applyScore } from '../pool.mjs';
import { makeRunId } from '../runner.mjs';

function tmpLog(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-test-'));
  return path.join(dir, `${name}.jsonl`);
}

const ITEMS = [
  { id: 'i1', category: 'math', prompt: '1+1?', scorer: 'exact_match', expected: '2', scorer_args: {} },
  { id: 'i2', category: 'code', prompt: 'code?', scorer: 'exact_match', expected: 'x', scorer_args: {} },
];

const goodRec = (o = {}) => ({
  schema: 'llm-bench/run/v1', run_id: o.runId, model: o.model, answer: o.answer ?? '2',
  answer_preview: o.answer ?? '2', answer_chars: 2, latency_ms: 100, ttft_spawn_ms: 50,
  ttft_model_ms: 10, output_tokens: 1, output_tokens_char4: 1, token_source: 'usage',
  reasoning_tokens: 0, prompt_tokens: 10, usage: {}, cost: 0, exit_code: 0, timed_out: false,
  tool_calls: [], stripped_lines: [], malformed_line_count: 0, peak_rss_kb: 500,
  failure: null, error_ref: null, ts: '2026-09-27T00:00:00.000Z', ...o,
});

// ---------------------------------------------------------------------------
// log + run_id
// ---------------------------------------------------------------------------
test('appendRecord/readLog round-trip, and a torn final line is tolerated', () => {
  const log = tmpLog('rt');
  assert.deepEqual(readLog(log), { records: [], bad: 0 });
  appendRecord(log, goodRec({ run_id: 'a', answer: 'first' }));
  appendRecord(log, goodRec({ run_id: 'b', answer: 'second' }));
  assert.equal(readLog(log).records.length, 2);
  // Simulate a crash mid-write: the last line has no newline and is truncated.
  fs.appendFileSync(log, '{"run_id":"c","answer":"tru');
  const r = readLog(log);
  assert.equal(r.records.length, 2, 'complete lines still parse');
  assert.equal(r.bad, 1, 'the torn line is counted, not thrown');
  // A later good write recovers cleanly.
  appendRecord(log, goodRec({ run_id: 'd' }));
  assert.equal(readLog(log).records.length, 3);
});

test('run_id is the resume key and is stable across processes', () => {
  const log = tmpLog('ids');
  appendRecord(log, goodRec({ run_id: makeRunId('m', 'i1', 0) }));
  appendRecord(log, goodRec({ run_id: makeRunId('m', 'i2', 0) }));
  appendRecord(log, goodRec({ run_id: makeRunId('m', 'i1', 1) }));
  const done = completedRunIds(log);
  assert.equal(done.size, 3);
  assert.ok(done.has(makeRunId('m', 'i1', 0)));
  assert.ok(!done.has(makeRunId('m', 'i1', 9)), 'a different rep is a different run');
});

test('completedRunIds ignores runs whose only attempts failed', () => {
  const log = tmpLog('fail');
  appendRecord(log, goodRec({ run_id: 'ok', answer: 'x' }));
  appendRecord(log, goodRec({ run_id: 'bad', answer: '', failure: { kind: 'timeout', retriable: true, reason: 'x' } }));
  const done = completedRunIds(log);
  assert.ok(done.has('ok'));
  assert.ok(!done.has('bad'), 'a failed-only run must be retried on resume');
});

test('completedRunIds: a later successful attempt revives a previously failed run', () => {
  const log = tmpLog('revive');
  appendRecord(log, goodRec({ run_id: 'r', answer: '', failure: { kind: 'timeout', retriable: true, reason: 'x' } }));
  assert.ok(!completedRunIds(log).has('r'));
  appendRecord(log, goodRec({ run_id: 'r', answer: 'good' }));
  assert.ok(completedRunIds(log).has('r'));
});

test('buildTasks crosses models x items x reps and honours skipIds', () => {
  const all = buildTasks({ items: ITEMS, models: ['m/a', 'm/b'], reps: 3 });
  assert.equal(all.length, 2 * 2 * 3);
  const skip = new Set([makeRunId('m/a', 'i1', 0), makeRunId('m/b', 'i2', 2)]);
  const kept = buildTasks({ items: ITEMS, models: ['m/a', 'm/b'], reps: 3, skipIds: skip });
  assert.equal(kept.length, all.length - 2);
  assert.ok(!kept.some((t) => t.runId === makeRunId('m/a', 'i1', 0)));
  // order is deterministic: model, then item, then rep
  // order is model, then item, then rep: after dropping (m/a,i1,0) the head is i1/1, i1/2
  assert.deepEqual(kept.slice(0, 2).map((t) => `${t.model}/${t.item.id}/${t.rep}`), ['m/a/i1/1', 'm/a/i1/2']);
});

// ---------------------------------------------------------------------------
// backoff
// ---------------------------------------------------------------------------
test('backoffMs grows exponentially, is capped, and is jittered', () => {
  const noJitter = { baseMs: 1000, capMs: 30_000, rand: () => 1 };
  assert.equal(backoffMs(1, noJitter), 1000);
  assert.equal(backoffMs(2, noJitter), 2000);
  assert.equal(backoffMs(3, noJitter), 4000);
  assert.equal(backoffMs(10, noJitter), 30_000, 'capped');
  assert.equal(backoffMs(0, noJitter), 1000, 'attempt 0 treated as attempt 1');
  // rand=0 -> 50% of the exponential value (full jitter, lower half)
  assert.equal(backoffMs(3, { baseMs: 1000, capMs: 30_000, rand: () => 0 }), 2000);
  // the same attempt with different rng must be able to give different waits
  const a = backoffMs(4, { baseMs: 1000, rand: () => 0.2 });
  const b = backoffMs(4, { baseMs: 1000, rand: () => 0.9 });
  assert.notEqual(a, b);
  assert.ok(a >= 800 * 0.5 && b <= 8000);
});

// ---------------------------------------------------------------------------
// applyScore
// ---------------------------------------------------------------------------
test('applyScore attaches pass/fail, and marks items with no scorer as unscored', () => {
  const p = applyScore(goodRec({ answer: '2' }), ITEMS[0]);
  assert.equal(p.scored, true);
  assert.equal(p.passed, true);
  assert.equal(p.scorer, 'exact_match');
  const f = applyScore(goodRec({ answer: 'nope' }), ITEMS[0]);
  assert.equal(f.passed, false);
  const u = applyScore(goodRec({ answer: '2' }), { id: 'x', prompt: 'p' });
  assert.equal(u.scored, false);
  assert.equal(u.passed, null);
});

// ---------------------------------------------------------------------------
// runPool: happy path
// ---------------------------------------------------------------------------
test('runPool: runs every task once and logs a scored record each', async () => {
  const log = tmpLog('happy');
  const calls = [];
  const stats = await runPool({
    items: ITEMS, models: ['m/a'], reps: 2, concurrency: 2, logPath: log,
    runner: async (o) => {
      calls.push(o);
      return goodRec({ runId: o.runId, model: o.model, answer: o.prompt === 'code?' ? 'x' : '2' });
    },
    sleep: async () => {},
  });
  assert.equal(calls.length, 4);
  assert.equal(stats.completed, 4);
  assert.equal(stats.failed, 0);
  assert.equal(stats.retried, 0);
  const { records } = readLog(log);
  assert.equal(records.length, 4);
  assert.ok(records.every((r) => r.scored));
  // the fake answers i1 with '2' (expected '2') and i2 with 'x' (expected 'x')
  assert.equal(records.filter((r) => r.passed).length, 4);
  assert.ok(records.every((r) => r.item_id && r.category && r.attempt === 1));
  assert.equal(new Set(records.map((r) => r.run_id)).size, 4, 'each run_id appears once');
});

test('runPool: passes the isolation flags through to the runner', async () => {
  const log = tmpLog('flags');
  const seen = [];
  await runPool({
    items: [ITEMS[0]], models: ['m/a'], concurrency: 1, logPath: log,
    format: 'json', cwd: '/tmp/isolated', pure: true, timeoutMs: 1234, variant: 'high',
    runner: async (o) => { seen.push(o); return goodRec({ runId: o.runId }); },
    sleep: async () => {},
  });
  assert.equal(seen[0].cwd, '/tmp/isolated');
  assert.equal(seen[0].pure, true);
  assert.equal(seen[0].format, 'json');
  assert.equal(seen[0].timeoutMs, 1234);
  assert.equal(seen[0].variant, 'high');
  assert.equal(seen[0].prompt, '1+1?');
});

// ---------------------------------------------------------------------------
// runPool: retry policy
// ---------------------------------------------------------------------------
test('runPool: retries a transport failure with jitter, then gives up after maxRetries', async () => {
  const log = tmpLog('retry');
  let n = 0;
  const stats = await runPool({
    items: [ITEMS[0]], models: ['m/a'], concurrency: 1, logPath: log, maxRetries: 2,
    baseBackoffMs: 10, maxBackoffMs: 100,
    runner: async (o) => {
      n++;
      return goodRec({ runId: o.runId, model: o.model, answer: '', failure: { kind: 'error_event', retriable: true, reason: 'err_x' }, error_ref: 'err_x' });
    },
    sleep: async () => {},
  });
  assert.equal(n, 3, 'first attempt + 2 retries');
  assert.equal(stats.retried, 2);
  assert.equal(stats.failed, 1);
  const { records } = readLog(log);
  assert.equal(records.length, 3, 'every attempt is logged');
  assert.deepEqual(records.map((r) => r.attempt), [1, 2, 3]);
  assert.ok(records.every((r) => r.failure.kind === 'error_event'));
});

test('runPool: NEVER retries a run that produced an answer, even a wrong one', async () => {
  // This is the accuracy-integrity rule: a wrong-but-real answer must not be
  // rerolled, or accuracy would measure luck rather than capability.
  const log = tmpLog('noretry');
  let n = 0;
  const stats = await runPool({
    items: [ITEMS[0]], models: ['m/a'], concurrency: 1, logPath: log, maxRetries: 5,
    runner: async (o) => { n++; return goodRec({ runId: o.runId, model: o.model, answer: 'definitely wrong' }); },
    sleep: async () => {},
  });
  assert.equal(n, 1, 'exactly one attempt for a wrong answer');
  assert.equal(stats.retried, 0);
  assert.equal(stats.failed, 0, 'a wrong answer is not a failure');
  const { records } = readLog(log);
  assert.equal(records[0].passed, false);
});

test('runPool: a non-retriable failure (killed) is not retried', async () => {
  const log = tmpLog('killed');
  let n = 0;
  await runPool({
    items: [ITEMS[0]], models: ['m/a'], concurrency: 1, logPath: log, maxRetries: 5,
    runner: async (o) => { n++; return goodRec({ runId: o.runId, model: o.model, answer: '', failure: { kind: 'killed', retriable: false, reason: 'shutdown' } }); },
    sleep: async () => {},
  });
  assert.equal(n, 1);
});

test('runPool: a retry that then succeeds logs both attempts and counts as done', async () => {
  const log = tmpLog('recover');
  let n = 0;
  const stats = await runPool({
    items: [ITEMS[0]], models: ['m/a'], concurrency: 1, logPath: log, maxRetries: 3,
    baseBackoffMs: 1,
    runner: async (o) => {
      n++;
      return n === 1
        ? goodRec({ runId: o.runId, model: o.model, answer: '', failure: { kind: 'timeout', retriable: true, reason: 't/o' } })
        : goodRec({ runId: o.runId, model: o.model, answer: '2' });
    },
    sleep: async () => {},
  });
  assert.equal(n, 2);
  assert.equal(stats.retried, 1);
  assert.equal(stats.failed, 0);
  const { records } = readLog(log);
  assert.equal(records.length, 2);
  assert.equal(records[1].passed, true);
  // and the run is now complete for a future resume
  assert.ok(completedRunIds(log).has(makeRunId('m/a', 'i1', 0)));
});

test('runPool: a throwing runner is contained into a failed record', async () => {
  const log = tmpLog('throw');
  const stats = await runPool({
    items: [ITEMS[0]], models: ['m/a'], concurrency: 1, logPath: log, maxRetries: 0,
    runner: async () => { throw new Error('kaboom'); },
    sleep: async () => {},
  });
  assert.equal(stats.completed, 1);
  const { records } = readLog(log);
  assert.equal(records[0].failure.kind, 'harness');
  assert.equal(records[0].failure.retriable, false, 'a harness bug must not be retried as if it were flaky');
  assert.match(records[0].failure.reason, /kaboom/);
});

// ---------------------------------------------------------------------------
// runPool: resume
// ---------------------------------------------------------------------------
test('runPool: resume skips completed runs and re-runs only the missing ones', async () => {
  const log = tmpLog('resume');
  // First pass: only i1 completes (i2 is never reached — simulate interruption).
  await runPool({
    items: [ITEMS[0]], models: ['m/a'], reps: 1, concurrency: 1, logPath: log,
    runner: async (o) => goodRec({ runId: o.runId, model: o.model, answer: '2' }),
    sleep: async () => {},
  });
  assert.equal(readLog(log).records.length, 1);

  // Second pass: both items requested; i1 must be skipped, i2 must run.
  const calls = [];
  const stats = await runPool({
    items: ITEMS, models: ['m/a'], reps: 1, concurrency: 1, logPath: log, resume: true,
    runner: async (o) => { calls.push(o.prompt); return goodRec({ runId: o.runId, model: o.model, answer: o.prompt === 'code?' ? 'x' : '2' }); },
    sleep: async () => {},
  });
  assert.deepEqual(calls, ['code?'], 'only the unfinished item was re-run');
  assert.equal(stats.resumed_skipped, 1);
  assert.equal(readLog(log).records.length, 2);
});

test('runPool: resume:false re-runs everything even when the log is full', async () => {
  const log = tmpLog('noressume');
  let n = 0;
  const runner = async (o) => { n++; return goodRec({ runId: o.runId, model: o.model, answer: '2' }); };
  await runPool({ items: [ITEMS[0]], models: ['m/a'], logPath: log, runner, sleep: async () => {} });
  assert.equal(n, 1);
  await runPool({ items: [ITEMS[0]], models: ['m/a'], logPath: log, resume: false, runner, sleep: async () => {} });
  assert.equal(n, 2, 're-ran from scratch');
  assert.equal(readLog(log).records.length, 2);
});

// ---------------------------------------------------------------------------
// concurrency + shutdown
// ---------------------------------------------------------------------------
test('runPool: never exceeds the configured concurrency', async () => {
  const log = tmpLog('conc');
  let live = 0;
  let peak = 0;
  await runPool({
    items: Array.from({ length: 12 }, (_, i) => ({ ...ITEMS[0], id: `i${i}` })),
    models: ['m/a'], concurrency: 3, logPath: log,
    runner: async (o) => {
      live++; peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return goodRec({ runId: o.runId, model: o.model, answer: '2' });
    },
    sleep: async () => {},
  });
  assert.ok(peak <= 3, `peak concurrency ${peak} exceeded 3`);
  assert.equal(readLog(log).records.length, 12);
});

test('runPool: an already-aborted signal runs nothing', async () => {
  const log = tmpLog('abort0');
  const ac = new AbortController();
  ac.abort();
  let n = 0;
  const stats = await runPool({
    items: ITEMS, models: ['m/a'], concurrency: 1, logPath: log, signal: ac.signal,
    runner: async (o) => { n++; return goodRec({ runId: o.runId }); },
    sleep: async () => {},
  });
  assert.equal(n, 0);
  assert.equal(stats.aborted, true);
});

test('runPool: aborting mid-batch stops handing out new work but keeps the log valid', async () => {
  const log = tmpLog('abortmid');
  const ac = new AbortController();
  let n = 0;
  const stats = await runPool({
    items: Array.from({ length: 10 }, (_, i) => ({ ...ITEMS[0], id: `i${i}` })),
    models: ['m/a'], concurrency: 2, logPath: log, signal: ac.signal,
    runner: async (o) => {
      n++;
      if (n === 3) ac.abort(); // abort while in flight
      await new Promise((r) => setTimeout(r, 2));
      return goodRec({ runId: o.runId, model: o.model, answer: '2' });
    },
    sleep: async () => {},
  });
  assert.equal(stats.aborted, true);
  assert.ok(n < 10, `aborted early, ran ${n} of 10`);
  const { records, bad } = readLog(log);
  assert.equal(bad, 0, 'no torn lines after an abort');
  assert.equal(records.length, n);
  // everything logged is resumable
  assert.equal(completedRunIds(log).size, records.length);
});
