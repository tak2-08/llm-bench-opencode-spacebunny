/**
 * runner.mjs — single measurement: spawn `opencode run`, capture stdout/stderr
 * separately, derive latency / TTFT / token metrics / error signature.
 *
 * Pure(ish) functions below the `runOnce` boundary are exported for unit tests.
 * Nothing here throws: a failed run is a *record with a failure reason*.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const OPENCODE_BIN = process.env.OPENCODE_BIN || '/usr/local/bin/opencode';
export const DEFAULT_TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------------------
// text utilities
// ---------------------------------------------------------------------------

/** Strip ANSI SGR / OSC escape sequences. */
export function stripAnsi(s) {
  if (typeof s !== 'string' || s === '') return '';
  // Written with explicit ESC/u001B escapes so the pattern cannot be mangled
  // by an editor or transfer that strips literal control characters.
  return s
    .replace(/\u001B\[[0-9;?]*[ -\/]*[@-~]/g, '')            // CSI / SGR: ESC [ .. m
    .replace(/\u001B\][\s\S]*?(?:\u0007|\u001B\\)/g, '')   // OSC: ESC ] .. (BEL | ESC backslash)
    .replace(/\u001B[@-Z\\-_]/g, '');                           // 2-char escapes
}

/**
 * Lines opencode prints that are NOT model answer.
 *
 * NOTE (measured 2026-09-27, opencode 1.18.22): the `> build · <model>` banner is
 * emitted on **stderr** in this build, so in practice this list is a no-op safety
 * net for other builds/versions where the banner lands on stdout. Every stripped
 * line is reported in `parse.artifacts.strippedLines` so stripping is auditable
 * and can never silently hide model output.
 */
export const BANNER_PATTERNS = [
  /^>\s*build\s*[·|-]\s*\S+/, // > build · space-bunny-free
  /^\[playmcp\]/i,
  /^Working(\.\.\.| on .*)?$/,
  /^Compiling/i,
];

/**
 * Remove non-answer lines. Returns the cleaned text plus what was removed.
 * Only *whole lines* are matched, so a model answer that happens to contain
 * "PING-OK" is never damaged.
 */
export function stripBannerLines(raw) {
  const text = stripAnsi(raw ?? '');
  if (text === '') return { text: '', strippedLines: [] };
  const kept = [];
  const strippedLines = [];
  // A trailing "" from the final newline must not count as a stripped line.
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLastEmpty = i === lines.length - 1 && line === '';
    if (!isLastEmpty && BANNER_PATTERNS.some((re) => re.test(line.trim()))) {
      strippedLines.push(line);
    } else {
      kept.push(line);
    }
  }
  return { text: kept.join('\n'), strippedLines };
}

/**
 * Character-count token proxy: ceil(chars / 4).
 *
 * KNOWN BIAS (documented in README): the 4-chars-per-token rule is calibrated for
 * English ASCII prose. It *under*-counts for code/punctuation-dense text and
 * *over*-counts for Korean/CJK (Hangul averages ~1.5-2 chars/token), so a Korean
 * answer's real token count can be ~2-3x the proxy. Prefer `usage.output` from
 * `--format json` whenever it is present; the proxy exists only for the default
 * (non-JSON) format, which exposes no counters.
 */
export function estimateTokensChars4(s) {
  const n = typeof s === 'string' ? s.length : 0;
  return n === 0 ? 0 : Math.ceil(n / 4);
}

// ---------------------------------------------------------------------------
// run identity
// ---------------------------------------------------------------------------

/**
 * Stable run_id = sha256(model | item_id | rep), 16 hex chars.
 * Stable across processes and machines — this is what makes resume work.
 */
export function makeRunId(model, itemId, rep) {
  return createHash('sha256')
    .update(`${model}${itemId}${rep}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
}

// ---------------------------------------------------------------------------
// JSON event stream parsing
// ---------------------------------------------------------------------------

/**
 * Parse `--format json` stdout into events, tagging each with the wall-clock ms
 * at which the line *completed* on the stream.
 *
 * Tolerates (by design, because real output is messy):
 *  - ANSI codes anywhere
 *  - blank lines
 *  - a non-JSON banner line mixed into stdout
 *  - a truncated final line (process killed mid-write)
 * Malformed lines are collected, not thrown.
 */
export function parseJsonEvents(raw, { firstEventMs = 0, lineArrivalMs = [] } = {}) {
  const { text } = stripBannerLines(raw ?? '');
  const lines = text.split('\n');
  const events = [];
  const malformed = [];
  lines.forEach((line, idx) => {
    const t = line.trim();
    if (t === '') return;
    try {
      const ev = JSON.parse(t);
      events.push({ ...ev, arrivalMs: lineArrivalMs[idx] ?? firstEventMs });
    } catch {
      malformed.push({ line: t.slice(0, 200), arrivalMs: lineArrivalMs[idx] ?? firstEventMs });
    }
  });
  return { events, malformed };
}

/**
 * Fold events into the metrics we report. Pure — unit tested directly.
 */
export function deriveFromEvents(events) {
  const firstEventMs = events.length ? events[0].arrivalMs : null;

  const textEvents = events.filter((e) => e.type === 'text' && typeof e.part?.text === 'string');
  const firstText = textEvents.find((e) => e.part.text.trim() !== '');
  const firstTextMs = firstText ? firstText.arrivalMs : null;

  const errorEvents = events.filter((e) => e.type === 'error');
  const errRef =
    errorEvents.find((e) => e.error?.data?.ref || e.error?.ref)?.error?.data?.ref ??
    errorEvents.find((e) => e.error?.data?.ref || e.error?.ref)?.error?.ref ??
    null;
  const errName = errorEvents[0]?.error?.name ?? null;
  const errMessage = errorEvents[0]?.error?.data?.message ?? errorEvents[0]?.error?.message ?? null;

  // Real usage counters, summed across all steps of the turn.
  const usage = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  let cost = 0;
  let sawUsage = false;
  for (const e of events) {
    const t = e.part?.tokens;
    if (e.type === 'step_finish' && t) {
      sawUsage = true;
      usage.input += t.input ?? 0;
      usage.output += t.output ?? 0;
      usage.reasoning += t.reasoning ?? 0;
      usage.cacheRead += t.cache?.read ?? 0;
      usage.cacheWrite += t.cache?.write ?? 0;
      usage.total += t.total ?? 0;
      cost += e.part.cost ?? 0;
    }
  }

  const toolCalls = events
    .filter((e) => e.type === 'tool_use' || e.part?.type === 'tool')
    .map((e) => e.part?.tool ?? e.part?.name ?? 'unknown');

  const lastMs = events.length ? events[events.length - 1].arrivalMs : null;

  // --- opencode's own clock (chunk-independent) -----------------------------
  // Arrival times above are quantised by stdout chunk coalescing: when every
  // event lands in one chunk they all share one timestamp and the
  // boot-excluded TTFT degenerates to ~0 (observed: 1 ms on a real 10.2 s run).
  // The `timestamp` field of each event is stamped by opencode itself, so it is
  // immune to that. NOTE this is the time the text PART COMPLETED, not the
  // first decoded token: `opencode run` emits one whole-text part with no token
  // deltas, so no metric here is a true time-to-first-token.
  const firstStepStart = events.find((e) => e.type === 'step_start');
  const firstStepStartTs = typeof firstStepStart?.timestamp === 'number' ? firstStepStart.timestamp : null;
  const textTs = typeof firstText?.timestamp === 'number' ? firstText.timestamp : null;
  const ttftOpencodeMs = firstStepStartTs !== null && textTs !== null ? textTs - firstStepStartTs : null;

  // Duration opencode attributes to the text part's own generation window.
  let generationMs = null;
  if (firstText?.part?.time && typeof firstText.part.time.start === 'number' && typeof firstText.part.time.end === 'number') {
    generationMs = firstText.part.time.end - firstText.part.time.start;
  }

  return {
    answer: textEvents.map((e) => e.part.text).join('\n'),
    textPartCount: textEvents.length,
    firstEventMs,
    firstTextMs,
    // Boot-excluded, but chunk-quantised — can be ~0. Kept for continuity.
    ttftModelMs: firstTextMs !== null && firstEventMs !== null ? firstTextMs - firstEventMs : null,
    // Boot-excluded and NOT chunk-quantised. This is the headline latency number.
    ttftOpencodeMs,
    generationMs,
    firstStepStartTs,
    lastEventMs: lastMs,
    usage,
    cost,
    hasUsage: sawUsage,
    toolCalls,
    error: errRef || errName ? { ref: errRef, name: errName, message: errMessage } : null,
    stepFinishes: events.filter((e) => e.type === 'step_finish').length,
  };
}

// ---------------------------------------------------------------------------
// failure classification (drives retry policy — NEVER score-aware)
// ---------------------------------------------------------------------------

export const FAILURE = {
  TIMEOUT: 'timeout',
  ERROR_EVENT: 'error_event',
  TRANSPORT: 'transport',
  EMPTY_ANSWER: 'empty_answer',
  KILLED: 'killed',
};

/**
 * Decide *why* a run failed. Returns null when the run produced an answer.
 *
 * Retry policy lives in pool.mjs and keys off this: only non-null reasons whose
 * kind is transport-ish are retried. A run that produced an answer is NEVER
 * retried, no matter how badly it scored — otherwise a wrong-but-real answer
 * would be replaced by a lucky reroll and accuracy would be inflated.
 */
export function classifyFailure({ timedOut, killed, exitCode, derived, stderr }) {
  if (timedOut) return { kind: FAILURE.TIMEOUT, retriable: true, reason: 'per-run timeout' };
  if (derived?.error?.ref) {
    return { kind: FAILURE.ERROR_EVENT, retriable: true, reason: `server error ref=${derived.error.ref}` };
  }
  if (derived?.error?.name) {
    return { kind: FAILURE.ERROR_EVENT, retriable: true, reason: `error event name=${derived.error.name}` };
  }
  const answer = (derived?.answer ?? '').trim();
  if (exitCode === 0 && answer !== '') return null;
  if (killed) return { kind: FAILURE.KILLED, retriable: false, reason: 'killed by signal (shutdown)' };
  if (answer === '') {
    return { kind: FAILURE.EMPTY_ANSWER, retriable: true, reason: `exit=${exitCode} with empty answer` };
  }
  return { kind: FAILURE.TRANSPORT, retriable: true, reason: `non-zero exit=${exitCode} despite answer` };
}

/** Regex safety net for `ref` when the JSON envelope is unparsable. */
export function findErrRef(raw) {
  const m = /"ref"\s*:\s*"(err_[A-Za-z0-9_]+)"/.exec(raw ?? '');
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// /proc RSS sampling (drives the concurrency recommendation)
// ---------------------------------------------------------------------------

function readVmRssKb(pid) {
  try {
    const s = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const m = /^VmRSS:\s+(\d+)\s+kB$/m.exec(s);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// the measurement itself
// ---------------------------------------------------------------------------

/**
 * Run one (model, prompt) pair exactly once. Resolves — never rejects.
 *
 * @param {object} o
 * @param {string} o.model          provider/model for `opencode run -m`
 * @param {string} o.prompt         user message
 * @param {string} [o.system]       system override (appended as instruction; opencode CLI has no --system flag)
 * @param {'json'|'default'} [o.format='json']  json gives real token usage
 * @param {number} [o.timeoutMs]
 * @param {string} [o.cwd]          working dir passed as --dir (ISOLATION: see README)
 * @param {boolean} [o.pure=true]   --pure disables external plugins (ISOLATION)
 * @param {string} [o.variant]      --variant reasoning effort
 * @param {string} [o.artifactDir]  where full stdout/stderr are written
 * @param {string} [o.runId]        for artifact naming
 * @param {AbortSignal} [o.signal]
 */
export function runOnce(o) {
  const {
    model,
    prompt,
    system = null,
    format = 'json',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    cwd = null,
    pure = true,
    variant = null,
    extraArgs = [],
    artifactDir = null,
    runId = null,
    env = process.env,
  } = o;

  const args = ['run'];
  if (format === 'json') args.push('--format', 'json');
  if (pure) args.push('--pure');
  if (variant) args.push('--variant', variant);
  if (cwd) args.push('--dir', cwd);
  args.push('-m', model);
  if (extraArgs.length) args.push(...extraArgs);
  // opencode run has no --system flag; a system override is prepended as an
  // explicit instruction block. Documented in README as a known limitation.
  const message = system ? `[System instruction]\n${system}\n\n[Task]\n${prompt}` : prompt;

  const t0 = process.hrtime.bigint();
  const elapsed = () => Number((process.hrtime.bigint() - t0) / 1_000_000n);

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(OPENCODE_BIN, [...args, message], { stdio: ['ignore', 'pipe', 'pipe'], env });
    } catch (e) {
      return resolve(finish({ spawnError: String(e?.message ?? e) }));
    }

    const outChunks = [];   // {text, atMs}
    const errChunks = [];
    const lineArrivalMs = []; // arrival of each completed stdout line (json mode)
    let lineBuf = '';
    let peakRssKb = 0;
    let timedOut = false;
    let killed = false;
    let settled = false;

    const rssTimer = setInterval(() => {
      const kb = readVmRssKb(child.pid);
      if (kb && kb > peakRssKb) peakRssKb = kb;
    }, 400);
    rssTimer.unref?.();

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    timeoutTimer.unref?.();

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      const atMs = elapsed();
      outChunks.push({ text: d, atMs });
      if (format === 'json') {
        lineBuf += d;
        let nl;
        while ((nl = lineBuf.indexOf('\n')) !== -1) {
          lineArrivalMs.push(atMs);
          lineBuf = lineBuf.slice(nl + 1);
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => errChunks.push({ text: d, atMs: elapsed() }));

    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearInterval(rssTimer);
      clearTimeout(timeoutTimer);
      resolve(finish({ spawnError: String(e?.message ?? e) }));
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearInterval(rssTimer);
      clearTimeout(timeoutTimer);
      if (lineBuf.trim() !== '') lineArrivalMs.push(elapsed()); // truncated last line
      resolve(finish({ exitCode: code, signal, killed: signal === 'SIGKILL' && !timedOut }));
    });

    // ---------------------------------------------------------------------
    function finish(extra) {
      const wallMs = elapsed();
      const rawOut = outChunks.map((c) => c.text).join('');
      const rawErr = errChunks.map((c) => c.text).join('');

      let derived;
      if (format === 'json') {
        const { events, malformed } = parseJsonEvents(rawOut, { lineArrivalMs });
        derived = deriveFromEvents(events);
        derived.malformedLineCount = malformed.length;
        derived.malformedSample = malformed.slice(0, 3);
        derived.eventCount = events.length;
      } else {
        const cleaned = stripBannerLines(rawOut);
        // first arrival at which stdout held non-whitespace *answer* text
        let ttft = null;
        let acc = '';
        for (const c of outChunks) {
          acc += c.text;
          if (stripBannerLines(acc).text.trim() !== '') { ttft = c.atMs; break; }
        }
        const errClean = stripBannerLines(rawErr);
        derived = {
          answer: cleaned.text.trim(),
          textPartCount: cleaned.text.trim() === '' ? 0 : 1,
          firstEventMs: null,
          firstTextMs: ttft,
          ttftModelMs: null, // not measurable without --format json
          ttftOpencodeMs: null, // not measurable without --format json
          generationMs: null, // not measurable without --format json
          lastEventMs: null,
          usage: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          cost: null,
          hasUsage: false,
          toolCalls: [],
          error: null,
          stepFinishes: 0,
          malformedLineCount: 0,
          malformedSample: [],
          eventCount: 0,
        };
        if (errClean.strippedLines.length) derived.bannerOnStderr = errClean.strippedLines;
        derived.strippedLines = cleaned.strippedLines;
      }

      if (!derived.error && findErrRef(rawOut)) derived.error = { ref: findErrRef(rawOut), name: null, message: null };

      const failure = classifyFailure({ timedOut, killed: extra.killed, exitCode: extra.exitCode, derived, stderr: rawErr });

      // Token accounting: real counters win; proxy only as a labelled fallback.
      const tokenSource = derived.hasUsage ? 'usage' : 'char4';
      const outputTokens = derived.hasUsage ? derived.usage.output : estimateTokensChars4(derived.answer);
      const reasoningTokens = derived.hasUsage ? derived.usage.reasoning : null;
      const promptTokens = derived.hasUsage ? derived.usage.input + derived.usage.cacheRead + derived.usage.cacheWrite : null;

      const record = {
        schema: 'llm-bench/run/v1',
        run_id: runId ?? null,
        model,
        format,
        pure,
        cwd,
        variant,
        ts: new Date().toISOString(),
        exit_code: extra.exitCode ?? null,
        signal: extra.signal ?? null,
        timed_out: timedOut,
        spawn_error: extra.spawnError ?? null,
        // --- latency ---
        latency_ms: wallMs,
        // spawn -> first answer byte arrival. INCLUDES CLI boot. Chunk-quantised.
        ttft_spawn_ms: derived.firstTextMs,
        // first opencode event -> first text part, by stream arrival.
        // EXCLUDES boot but IS chunk-quantised (can be ~0). Superseded by the
        // next field; kept so both can be compared.
        ttft_model_ms: derived.ttftModelMs,
        // first step_start -> first text part, on opencode's own clock.
        // EXCLUDES boot and is NOT chunk-quantised. Headline latency metric.
        ttft_opencode_ms: derived.ttftOpencodeMs ?? null,
        // opencode's own generation window for the first text part.
        generation_ms: derived.generationMs ?? null,
        // --- tokens ---
        token_source: tokenSource,
        output_tokens: outputTokens,
        reasoning_tokens: reasoningTokens,
        prompt_tokens: promptTokens,
        output_tokens_char4: estimateTokensChars4(derived.answer),
        answer_chars: derived.answer.length,
        usage: derived.usage,
        cost: derived.cost,
        // --- answer ---
        answer: derived.answer,
        answer_preview: derived.answer.slice(0, 400),
        text_part_count: derived.textPartCount,
        tool_calls: derived.toolCalls,
        step_finishes: derived.stepFinishes,
        // --- failure ---
        failure,             // null when the run produced an answer
        error_ref: derived.error?.ref ?? null,
        error_name: derived.error?.name ?? null,
        error_message: derived.error?.message ?? null,
        // --- diagnostics ---
        peak_rss_kb: peakRssKb || null,
        stripped_lines: derived.strippedLines ?? [],
        malformed_line_count: derived.malformedLineCount ?? 0,
        malformed_sample: derived.malformedSample ?? [],
        banner_on_stderr: derived.bannerOnStderr ?? [],
        stdout_bytes: rawOut.length,
        stderr_bytes: rawErr.length,
      };

      if (artifactDir) {
        try {
          fs.mkdirSync(artifactDir, { recursive: true });
          const id = record.run_id ?? makeRunId(model, 'unknown', 0);
          fs.writeFileSync(path.join(artifactDir, `${id}.stdout.txt`), rawOut);
          fs.writeFileSync(path.join(artifactDir, `${id}.stderr.txt`), rawErr);
          fs.writeFileSync(path.join(artifactDir, `${id}.meta.json`), JSON.stringify({ ...record, answer: undefined, stdout_bytes: rawOut.length }, null, 2));
        } catch { /* artifacts are best-effort; never fail a measurement */ }
      }

      return record;
    }
  });
}
