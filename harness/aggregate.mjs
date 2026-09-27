/**
 * aggregate.mjs — turn scored run records into statistics.
 * Pure functions only: no I/O, no clock.
 */

/** z for a two-sided 95 % normal quantile. */
export const Z_95 = 1.959963984540054;

/**
 * Wilson score interval for a binomial proportion.
 *
 *            z²/2n + z·sqrt( p̂(1-p̂)/n + z²/4n² )
 *   centre ± ─────────────────────────────────────────────
 *                       1 + z²/n
 *
 * Chosen over the Wald interval because Wald produces probabilities outside
 * [0,1] and collapses to zero width at p̂=0 or 1 — both common with small n.
 *
 * @param {number} correct
 * @param {number} n
 * @param {number} [z]
 * @returns {{low:number, high:number, centre:number, p:number, n:number, z:number}}
 */
export function wilsonInterval(correct, n, z = Z_95) {
  if (!Number.isFinite(n) || n <= 0) {
    return { low: 0, high: 1, centre: 0, p: 0, n: 0, z };
  }
  // Clamp the count: a caller that passes correct > n would otherwise make
  // p*(1-p) negative and the whole interval NaN, which then silently poisons
  // a report. Better a slightly wrong number than an unreadable one.
  const c = Math.min(n, Math.max(0, Number.isFinite(correct) ? correct : 0));
  const p = c / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    low: Math.max(0, centre - half),
    high: Math.min(1, centre + half),
    centre,
    p,
    n,
    z,
  };
}

/**
 * Latency / token distribution. `p95` uses the nearest-rank method on the
 * sorted sample (no interpolation), which is the conservative choice for small n.
 */
export function describe(values) {
  const xs = (values ?? []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = xs.length;
  if (n === 0) {
    return { n: 0, mean: null, median: null, p95: null, max: null, min: null, stdev: null, sum: 0 };
  }
  const sum = xs.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
  const p95 = xs[Math.min(n - 1, Math.max(0, Math.ceil(0.95 * n) - 1))];
  const variance = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return {
    n,
    mean: round(mean, 2),
    median: round(median, 2),
    p95: round(p95, 2),
    max: round(xs[n - 1], 2),
    min: round(xs[0], 2),
    stdev: round(Math.sqrt(variance), 2),
    sum: round(sum, 2),
  };
}

function round(v, d) {
  if (!Number.isFinite(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/** A run counts toward accuracy only if it produced an answer and was scored. */
function isScored(r) {
  return r && r.scored === true && typeof r.passed === 'boolean';
}

function block(records) {
  const scored = records.filter(isScored);
  const n = scored.length;
  const correct = scored.filter((r) => r.passed).length;
  const ci = wilsonInterval(correct, n);
  const attempts = records.length;
  const failed = records.filter((r) => r.failure).length;
  const usageTok = records.filter((r) => r.token_source === 'usage');
  return {
    attempts,
    n,
    correct,
    accuracy: n ? round(correct / n, 4) : null,
    ci95: { low: round(ci.low, 4), high: round(ci.high, 4) },
    ci95_centre: round(ci.centre, 4),
    failed_attempts: failed,
    reliability: attempts ? round(1 - failed / attempts, 4) : null,
    latency_ms: describe(records.map((r) => r.latency_ms)),
    ttft_spawn_ms: describe(records.map((r) => r.ttft_spawn_ms)),
    ttft_model_ms: describe(records.map((r) => r.ttft_model_ms)),
    ttft_opencode_ms: describe(records.map((r) => r.ttft_opencode_ms)),
    generation_ms: describe(records.map((r) => r.generation_ms)),
    output_tokens: describe(records.map((r) => r.output_tokens)),
    reasoning_tokens: usageTok.length ? describe(usageTok.map((r) => r.reasoning_tokens)) : describe([]),
    prompt_tokens: usageTok.length ? describe(usageTok.map((r) => r.prompt_tokens)) : describe([]),
    output_tokens_total: records.reduce((a, r) => a + (Number.isFinite(r.output_tokens) ? r.output_tokens : 0), 0),
    token_source: usageTok.length === records.length && records.length > 0 ? 'usage' : 'mixed|char4',
    cost_total: records.reduce((a, r) => a + (Number.isFinite(r.cost) ? r.cost : 0), 0),
  };
}

function groupBy(records, keyFn) {
  const m = new Map();
  for (const r of records) {
    const k = keyFn(r) ?? '(uncategorised)';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

/**
 * Full summary: overall, per-model, per-category, per-model×category,
 * plus score/diagnostic tallies and a list of failed runs for triage.
 */
export function aggregate(records) {
  // Drop non-objects so one malformed log line cannot crash the whole report.
  const recs = (Array.isArray(records) ? records : []).filter((r) => r && typeof r === 'object' && !Array.isArray(r));
  const byModel = new Map();
  for (const r of recs) {
    const k = r.model ?? '(unknown)';
    if (!byModel.has(k)) byModel.set(k, []);
    byModel.get(k).push(r);
  }

  const categories = groupBy(recs, (r) => r.category);
  const modelCategory = groupBy(recs, (r) => `${r.model ?? '(unknown)'} :: ${r.category ?? '(uncategorised)'}`);

  const scorers = groupBy(recs.filter(isScored), (r) => r.scorer);
  const failures = groupBy(recs.filter((r) => r.failure), (r) => r.failure.kind);

  return {
    schema: 'llm-bench/summary/v1',
    overall: block(recs),
    per_model: Object.fromEntries([...byModel].map(([m, rs]) => [m, block(rs)]).sort((a, b) => a[0].localeCompare(b[0]))),
    per_category: Object.fromEntries([...categories].map(([c, rs]) => [c, block(rs)]).sort((a, b) => a[0].localeCompare(b[0]))),
    per_model_category: Object.fromEntries([...modelCategory].map(([c, rs]) => [c, block(rs)]).sort((a, b) => a[0].localeCompare(b[0]))),
    per_scorer: Object.fromEntries([...scorers].map(([s, rs]) => [s, { n: rs.length, correct: rs.filter((r) => r.passed).length, accuracy: round(rs.filter((r) => r.passed).length / rs.length, 4) }]).sort((a, b) => a[0].localeCompare(b[0]))),
    failure_kinds: Object.fromEntries([...failures].map(([k, rs]) => [k, rs.length]).sort((a, b) => a[0].localeCompare(b[0]))),
    diagnostics: {
      runs_with_tool_calls: recs.filter((r) => (r.tool_calls ?? []).length > 0).length,
      runs_with_stripped_banner: recs.filter((r) => (r.stripped_lines ?? []).length > 0).length,
      runs_with_malformed_json: recs.filter((r) => (r.malformed_line_count ?? 0) > 0).length,
      runs_with_empty_answer: recs.filter((r) => (r.answer ?? '').trim() === '').length,
      peak_rss_kb: describe(recs.map((r) => r.peak_rss_kb)),
    },
    // Triage list: every non-passing or failing run, most useful first.
    problems: recs
      .filter((r) => r.failure || r.passed === false)
      .map((r) => ({
        run_id: r.run_id, model: r.model, item_id: r.item_id, rep: r.rep,
        category: r.category, scorer: r.scorer,
        failure: r.failure ?? null, detail: r.detail ?? null,
        answer_preview: (r.answer_preview ?? '').slice(0, 160),
      })),
  };
}

/** Split a summary block into markdown table rows. */
export function summaryRows(summary) {
  const rows = [['model', 'n', 'correct', 'accuracy', 'CI95 low', 'CI95 high', 'rel', 'lat mean', 'lat p95', 'ttft_opencode mean', 'out tok mean']];
  for (const [model, b] of Object.entries(summary.per_model)) {
    rows.push([
      model,
      String(b.n),
      String(b.correct),
      b.accuracy === null ? '—' : `${(b.accuracy * 100).toFixed(1)}%`,
      b.ci95.low === null ? '—' : b.ci95.low.toFixed(3),
      b.ci95.high === null ? '—' : b.ci95.high.toFixed(3),
      b.reliability === null ? '—' : `${(b.reliability * 100).toFixed(1)}%`,
      b.latency_ms.mean === null ? '—' : String(b.latency_ms.mean),
      b.latency_ms.p95 === null ? '—' : String(b.latency_ms.p95),
      b.ttft_opencode_ms.mean === null ? '—' : String(b.ttft_opencode_ms.mean),
      b.output_tokens.mean === null ? '—' : String(b.output_tokens.mean),
    ]);
  }
  return rows;
}
