/**
 * pool.mjs — bounded worker pool, append-only JSONL run log, resume, retry.
 *
 * Design rules that protect measurement validity:
 *  - A run is keyed by run_id = hash(model,item_id,rep) (see runner.makeRunId),
 *    so an interrupted batch resumes without redoing completed work.
 *  - Retries happen ONLY for transport-class failures (see runner.classifyFailure).
 *    A run that produced an answer is never retried, so accuracy can never be
 *    inflated by rerolling until a wrong answer turns into a right one.
 *  - Retries use exponential backoff with FULL jitter, so N workers that all hit
 *    a server error do not resynchronise into a thundering herd.
 *  - The log is append-only and one line per completed *attempt*, written with a
 *    single write() call so a torn line can only be the last one; the resume
 *    reader tolerates exactly that.
 */
import fs from 'node:fs';
import path from 'node:path';
import { runOnce, makeRunId, classifyFailure } from './runner.mjs';
import { score } from './scorers.mjs';

// ---------------------------------------------------------------------------
// JSONL log
// ---------------------------------------------------------------------------

/** Read a JSONL log, tolerating a truncated final line. Returns {records, bad}. */
export function readLog(logPath) {
  if (!logPath || !fs.existsSync(logPath)) return { records: [], bad: 0 };
  const raw = fs.readFileSync(logPath, 'utf8');
  const lines = raw.split('\n');
  const records = [];
  let bad = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t === '') continue;
    try {
      records.push(JSON.parse(t));
    } catch {
      bad++;
    }
  }
  return { records, bad };
}

/**
 * Append one record as a single line. Returns false on write failure.
 *
 * Heals a torn line first: if the file does not end in a newline (a crash during
 * a previous append), the partial line is terminated before the new record is
 * written. Without this, the next append would be glued onto the fragment and
 * BOTH lines would be lost — one crash would silently destroy a second run.
 */
export function appendRecord(logPath, record) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    let prefix = '';
    try {
      const st = fs.statSync(logPath);
      if (st.size > 0) {
        const fd = fs.openSync(logPath, 'r');
        try {
          const buf = Buffer.alloc(1);
          fs.readSync(fd, buf, 0, 1, st.size - 1);
          if (buf[0] !== 0x0a) prefix = '\n';
        } finally {
          fs.closeSync(fd);
        }
      }
    } catch {
      prefix = ''; // file does not exist yet -> plain append
    }
    fs.appendFileSync(logPath, `${prefix}${JSON.stringify(record)}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** run_ids already present in the log (final attempt per run_id wins). */
export function completedRunIds(logPath) {
  const { records } = readLog(logPath);
  const done = new Map();
  for (const r of records) {
    if (!r?.run_id) continue;
    const prev = done.get(r.run_id);
    // A run counts as done if ANY attempt produced an answer; a later attempt that
    // failed must not un-finish it.
    if (!prev || (prev.failure && !r.failure)) done.set(r.run_id, r);
  }
  return new Set([...done.entries()].filter(([, r]) => !r.failure).map(([id]) => id));
}

// ---------------------------------------------------------------------------
// task expansion
// ---------------------------------------------------------------------------

/** Cross models × items × reps into a deterministic, resumable task list. */
export function buildTasks({ items, models, reps = 1, skipIds = new Set() }) {
  const tasks = [];
  for (const model of models) {
    for (const item of items) {
      for (let rep = 0; rep < reps; rep++) {
        const runId = makeRunId(model, item.id, rep);
        if (skipIds.has(runId)) continue;
        tasks.push({ runId, model, item, rep });
      }
    }
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// backoff
// ---------------------------------------------------------------------------

/** Exponential backoff with FULL jitter. `rand` injectable for tests. */
export function backoffMs(attempt, { baseMs = 1000, capMs = 30_000, rand = Math.random } = {}) {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.floor(exp * (0.5 + 0.5 * rand())); // full-ish jitter in [50%,100%]
}

// ---------------------------------------------------------------------------
// scoring a record
// ---------------------------------------------------------------------------

/** Attach score fields to a raw run record. Never throws. */
export function applyScore(record, item) {
  if (!item?.scorer) return { ...record, scored: false, passed: null, detail: 'no scorer on item' };
  const r = score(record.answer ?? '', item.expected, item.scorer, item.scorer_args ?? {}, { item, run: record });
  return { ...record, scored: true, scorer: item.scorer, passed: r.passed, detail: r.detail };
}

// ---------------------------------------------------------------------------
// the pool
// ---------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {Array} o.items
 * @param {string[]} o.models
 * @param {number} [o.reps=1]
 * @param {number} [o.concurrency=1]
 * @param {string} o.logPath            append-only JSONL run log
 * @param {string} [o.artifactDir]      full stdout/stderr per run
 * @param {number} [o.maxRetries=2]     retries *after* the first attempt
 * @param {number} [o.timeoutMs]
 * @param {'json'|'default'} [o.format='json']
 * @param {string} [o.cwd]              --dir (isolation)
 * @param {boolean} [o.pure=true]       --pure
 * @param {number} [o.baseBackoffMs]
 * @param {number} [o.maxBackoffMs]
 * @param {boolean} [o.resume=true]
 * @param {(rec:object)=>void} [o.onRecord]
 * @param {AbortSignal} [o.signal]
 * @param {()=>number} [o.rand]         injectable RNG for jitter (tests)
 * @param {()=>number} [o.now]          injectable clock (tests)
 * @param {(o:object)=>Promise<object>} [o.runner] injectable runOnce (tests)
 */
export async function runPool(o) {
  const {
    items, models, reps = 1, concurrency = 1, logPath,
    artifactDir = null, maxRetries = 2, timeoutMs = 180_000,
    format = 'json', cwd = null, pure = true, variant = null,
    baseBackoffMs = 1000, maxBackoffMs = 30_000, resume = true,
    onRecord = null, signal = null,
    rand = Math.random, now = Date.now, runner = runOnce,
    sleep = defaultSleep,
  } = o;

  if (!logPath) throw new TypeError('runPool: logPath is required');
  const started = now();

  const skip = resume ? completedRunIds(logPath) : new Set();
  const tasks = buildTasks({ items, models, reps, skipIds: skip });

  const stats = {
    started_at: new Date(started).toISOString(),
    concurrency,
    total_tasks: tasks.length,
    resumed_skipped: skip.size,
    completed: 0,
    failed: 0,
    retried: 0,
    aborted: false,
  };

  let cursor = 0;
  let aborted = false;

  const onAbort = () => { aborted = true; };
  if (signal) {
    if (signal.aborted) aborted = true;
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  async function worker() {
    for (;;) {
      if (aborted) return;
      const i = cursor++;
      if (i >= tasks.length) return;
      const task = tasks[i];

      let attempt = 0;
      let lastRecord = null;
      // attempt loop — retries ONLY on transport-class failure
      for (;;) {
        attempt++;
        const runOnceOpts = {
          model: task.model,
          prompt: task.item.prompt,
          system: task.item.system ?? null,
          format, timeoutMs, cwd, pure, variant,
          artifactDir,
          runId: task.runId,
        };
        let rec;
        try {
          rec = await runner(runOnceOpts);
        } catch (err) {
          // runner is contracted not to throw. If it does, that is a HARNESS bug,
          // not a flaky network: mark it non-retriable and loud, so a coding
          // mistake cannot masquerade as a transport error and get retried.
          rec = {
            schema: 'llm-bench/run/v1', run_id: task.runId, model: task.model,
            item_id: task.item.id, category: task.item.category ?? null, rep: task.rep,
            prompt_preview: String(task.item.prompt ?? '').slice(0, 200),
            answer: '', answer_preview: '', latency_ms: 0, ttft_spawn_ms: null, ttft_model_ms: null,
            output_tokens: 0, output_tokens_char4: 0, answer_chars: 0, token_source: 'char4',
            exit_code: null, timed_out: false,
            failure: { kind: 'harness', retriable: false, reason: `runner threw: ${err?.message ?? err}` },
            error_ref: null, tool_calls: [], stripped_lines: [], malformed_line_count: 0, peak_rss_kb: null,
          };
        }

        rec = {
          ...rec,
          run_id: task.runId,
          item_id: task.item.id,
          category: task.item.category ?? null,
          rep: task.rep,
          attempt,
          ts: rec.ts ?? new Date(now()).toISOString(),
          prompt_preview: String(task.item.prompt ?? '').slice(0, 200),
        };
        rec = applyScore(rec, task.item);
        appendRecord(logPath, rec);
        lastRecord = rec;
        stats.completed++;
        onRecord?.(rec);

        const failure = rec.failure ?? null;
        const retriable = failure && failure.retriable === true;
        if (!retriable || attempt > maxRetries) {
          if (failure) stats.failed++;
          break;
        }
        stats.retried++;
        const wait = backoffMs(attempt, { baseMs: baseBackoffMs, capMs: maxBackoffMs, rand });
        if (wait > 0) await sleep(wait, signal);
        if (aborted) break;
      }
      void lastRecord;
    }
  }

  const nWorkers = Math.max(1, Math.min(concurrency, tasks.length || 1));
  await Promise.all(Array.from({ length: nWorkers }, () => worker()));

  if (signal) signal.removeEventListener?.('abort', onAbort);
  stats.aborted = aborted;
  stats.finished_at = new Date(now()).toISOString();
  stats.wall_ms = now() - started;
  return stats;
}

function defaultSleep(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
    signal?.addEventListener?.('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

export { classifyFailure };
