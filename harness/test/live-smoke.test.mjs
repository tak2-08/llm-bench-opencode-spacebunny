/**
 * test/live-smoke.test.mjs — ONE real model call, ONE item, end to end.
 *
 * SKIPPED unless BENCH_LIVE=1, because it costs a model call (~10-25 s) and the
 * container is memory-constrained. Run it with:
 *
 *   BENCH_LIVE=1 node --test test/live-smoke.test.mjs
 *
 * The test asserts the *harness contract*, not model quality: the point is that a
 * real `opencode run` invocation is captured, timed, tokenised and scored
 * correctly. A model that gets the answer wrong must not fail this test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runOnce, makeRunId } from '../runner.mjs';
import { runPool, readLog, completedRunIds } from '../pool.mjs';
import { aggregate, wilsonInterval } from '../aggregate.mjs';
import { buildReport } from '../report.mjs';

const LIVE = process.env.BENCH_LIVE === '1';
const MODEL = process.env.BENCH_SMOKE_MODEL || 'opencode/space-bunny-free';
const skip = LIVE ? false : 'set BENCH_LIVE=1 to run the live smoke test';

test('live: one real opencode run is captured with real usage + TTFT', { skip, timeout: 240_000 }, async () => {
  const iso = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-live-'));
  const runId = makeRunId(MODEL, 'smoke-1', 0);
  const art = path.join(iso, 'artifacts');

  const rec = await runOnce({
    model: MODEL,
    prompt: 'Reply with exactly: PING-OK',
    format: 'json',
    pure: true,
    cwd: iso, // isolation: keeps the ambient AGENTS.md out of the measurement
    timeoutMs: 200_000,
    artifactDir: art,
    runId,
  });

  // --- the call itself must have succeeded ---
  assert.equal(rec.failure, null, `run failed: ${JSON.stringify(rec.failure)} err_ref=${rec.error_ref} stderr_bytes=${rec.stderr_bytes}`);
  assert.equal(rec.exit_code, 0);
  assert.equal(rec.timed_out, false);
  assert.equal(rec.error_ref, null);

  // --- the answer must have been extracted, not swallowed by banner stripping ---
  assert.match(rec.answer, /PING-OK/, `answer was ${JSON.stringify(rec.answer_preview)}`);
  assert.equal(rec.answer.trim(), 'PING-OK', 'exact, so banner/tool noise would fail this');

  // --- real usage counters must be present (not the char proxy) ---
  assert.equal(rec.token_source, 'usage', 'json format must yield real token counters');
  assert.ok(rec.usage.output > 0, `output tokens ${rec.usage.output}`);
  assert.ok(rec.usage.prompt_tokens_total !== 0 || rec.prompt_tokens > 0, 'prompt-side tokens recorded');
  assert.ok(Number.isInteger(rec.usage.input));
  assert.ok(Array.isArray(rec.tool_calls));

  // --- latency: boot-inclusive and boot-excluded must both be sane and ordered ---
  assert.ok(rec.latency_ms > 0);
  assert.ok(rec.ttft_spawn_ms > 0, 'ttft_spawn_ms must be set in json mode');
  assert.ok(rec.ttft_spawn_ms <= rec.latency_ms, 'first byte cannot follow process exit');
  assert.ok(rec.ttft_model_ms !== null, 'json mode must yield a boot-excluded TTFT');
  assert.ok(rec.ttft_model_ms >= 0, `ttft_model_ms ${rec.ttft_model_ms} must be >= 0`);
  assert.ok(rec.ttft_model_ms <= rec.ttft_spawn_ms, 'boot-excluded TTFT cannot exceed the boot-inclusive one');

  // --- the chunk-independent headline metric must be a real, non-negative span ---
  assert.ok(rec.ttft_opencode_ms !== null, 'json mode must yield ttft_opencode_ms');
  assert.ok(rec.ttft_opencode_ms >= 0, `ttft_opencode_ms ${rec.ttft_opencode_ms} must be >= 0`);
  assert.ok(rec.ttft_opencode_ms <= rec.latency_ms, 'model span cannot exceed process lifetime');
  if (rec.generation_ms !== null) assert.ok(rec.generation_ms >= 0);

  // --- memory accounting, which drives the concurrency recommendation ---
  assert.ok(rec.peak_rss_kb > 0, 'peak RSS sampled from /proc');
  assert.ok(rec.peak_rss_kb < 2_000_000, `peak RSS ${rec.peak_rss_kb} KB looks implausible`);

  // --- artifacts written, answer excluded from the meta sidecar ---
  assert.ok(fs.existsSync(path.join(art, `${runId}.stdout.txt`)));
  assert.ok(fs.existsSync(path.join(art, `${runId}.stderr.txt`)));
  const meta = JSON.parse(fs.readFileSync(path.join(art, `${runId}.meta.json`), 'utf8'));
  assert.equal(meta.answer, undefined, 'meta must not duplicate the full answer');
  assert.ok(meta.latency_ms > 0);

  // --- a transport failure would be classified as such, not as a wrong answer ---
  const log = path.join(iso, 'run-log.jsonl');
  const stats = await runPool({
    items: [{ id: 'smoke-1', category: 'format', prompt: 'Reply with exactly: PING-OK', scorer: 'exact_match', scorer_args: { case_sensitive: true }, expected: 'PING-OK' }],
    models: [MODEL], reps: 1, concurrency: 1, logPath: log,
    format: 'json', pure: true, cwd: iso, timeoutMs: 200_000, maxRetries: 1,
  });
  assert.equal(stats.completed, 1);
  assert.equal(stats.failed, 0, 'a live smoke run must not be classified as failed');

  const { records } = readLog(log);
  assert.equal(records.length, 1);
  assert.equal(records[0].run_id, runId, 'run_id is the resume key');
  assert.equal(records[0].scored, true);
  assert.equal(records[0].passed, true, 'exact_match must score the known-good answer as a pass');
  assert.ok(completedRunIds(log).has(runId), 'and the run must count as complete for resume');

  // --- the full reporting path must work on real data, with no NaN ---
  const outDir = path.join(iso, 'reports');
  const { summary, markdown, jsonPath, mdPath } = buildReport(records, { outDir, title: 'live smoke' });
  assert.equal(summary.overall.n, 1);
  assert.equal(summary.overall.correct, 1);
  assert.equal(summary.overall.accuracy, 1);
  assert.ok(!markdown.includes('NaN'), 'NaN must never reach a report');
  assert.ok(!markdown.includes('Infinity'));
  // n=1 at p=1 is maximally uncertain: the Wilson interval must not collapse
  const ci = wilsonInterval(1, 1);
  assert.ok(ci.high === 1 && ci.low < 0.6, JSON.stringify(ci));
  assert.ok(fs.existsSync(mdPath) && fs.existsSync(jsonPath));

  console.error(`[live-smoke] ${MODEL} lat=${rec.latency_ms}ms ttft_spawn=${rec.ttft_spawn_ms}ms ttft_opencode=${rec.ttft_opencode_ms}ms ttft_model(chunky)=${rec.ttft_model_ms}ms gen=${rec.generation_ms}ms out_tok=${rec.output_tokens} prompt_tok=${rec.prompt_tokens} peak_rss=${Math.round(rec.peak_rss_kb / 1024)}MB`);
});
