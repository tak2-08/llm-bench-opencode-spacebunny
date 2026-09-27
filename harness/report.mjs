/**
 * report.mjs — render a summary as Markdown (+ write the JSON sidecar).
 */
import fs from 'node:fs';
import path from 'node:path';
import { aggregate, summaryRows } from './aggregate.mjs';

export function toMarkdown(summary, { title = 'LLM benchmark report', notes = [] } = {}) {
  const L = [];
  const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
  const ci = (b) => (b.n === 0 ? '—' : `[${b.ci95.low.toFixed(3)}, ${b.ci95.high.toFixed(3)}]`);
  const ms = (v) => (v === null || v === undefined ? '—' : String(v));

  L.push(`# ${title}`, '');
  L.push(`- generated: \`${summary.generated_at ?? new Date().toISOString()}\``);
  L.push(`- schema: \`${summary.schema}\``);
  if (summary.provenance) {
    L.push(`- models measured: ${Object.keys(summary.provenance.models ?? {}).map((m) => `\`${m}\``).join(', ') || '—'}`);
  }
  for (const n of notes) L.push(`- ${n}`);
  L.push('');

  L.push('## Overall', '');
  const o = summary.overall;
  L.push('| metric | value |', '| --- | --- |');
  L.push(`| attempts | ${o.attempts} |`);
  L.push(`| scored n | ${o.n} |`);
  L.push(`| correct | ${o.correct} |`);
  L.push(`| accuracy | ${pct(o.accuracy)} |`);
  L.push(`| Wilson 95% CI | ${ci(o)} |`);
  L.push(`| failed attempts | ${o.failed_attempts} |`);
  L.push(`| reliability | ${pct(o.reliability)} |`);
  L.push(`| latency mean / median / p95 / max (ms) | ${ms(o.latency_ms.mean)} / ${ms(o.latency_ms.median)} / ${ms(o.latency_ms.p95)} / ${ms(o.latency_ms.max)} |`);
  L.push(`| TTFT spawn mean / p95 (ms) | ${ms(o.ttft_spawn_ms.mean)} / ${ms(o.ttft_spawn_ms.p95)} |`);
  L.push(`| TTFT opencode mean / p95 (ms) | ${ms(o.ttft_opencode_ms.mean)} / ${ms(o.ttft_opencode_ms.p95)} |`);
  L.push(`| generation window mean / p95 (ms) | ${ms(o.generation_ms.mean)} / ${ms(o.generation_ms.p95)} |`);
  L.push(`| TTFT stream-arrival mean (chunk-quantised) | ${ms(o.ttft_model_ms.mean)} |`);
  L.push(`| output tokens mean / total | ${ms(o.output_tokens.mean)} / ${o.output_tokens_total} |`);
  L.push(`| token source | \`${o.token_source}\` |`);
  L.push(`| cost total | ${o.cost_total} |`);
  L.push('');

  L.push('## Per model', '');
  L.push(table(summaryRows(summary)));
  L.push('');
  L.push('> `rel` = reliability = 1 − failed attempts / attempts. `latency` includes `opencode` CLI boot; `ttft_opencode` excludes it and is the headline latency metric.', '');
  L.push('');

  const cats = Object.entries(summary.per_category ?? {});
  if (cats.length) {
    L.push('## Per category', '');
    L.push('| category | n | correct | accuracy | CI95 | latency p95 (ms) | output tok mean |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const [c, b] of cats) {
      L.push(`| ${c} | ${b.n} | ${b.correct} | ${pct(b.accuracy)} | ${ci(b)} | ${ms(b.latency_ms.p95)} | ${ms(b.output_tokens.mean)} |`);
    }
    L.push('');
  }

  const mc = Object.entries(summary.per_model_category ?? {});
  if (mc.length > 1) {
    L.push('## Per model × category', '');
    L.push('| model :: category | n | correct | accuracy | CI95 |', '| --- | --- | --- | --- | --- |');
    for (const [k, b] of mc) {
      L.push(`| ${k} | ${b.n} | ${b.correct} | ${pct(b.accuracy)} | ${ci(b)} |`);
    }
    L.push('');
  }

  const sc = Object.entries(summary.per_scorer ?? {});
  if (sc.length) {
    L.push('## Per scorer', '');
    L.push('| scorer | n | correct | accuracy |', '| --- | --- | --- | --- |');
    for (const [s, b] of sc) L.push(`| ${s} | ${b.n} | ${b.correct} | ${pct(b.accuracy)} |`);
    L.push('');
  }

  const fk = Object.entries(summary.failure_kinds ?? {});
  if (fk.length) {
    L.push('## Failures', '');
    L.push('| kind | count |', '| --- | --- |');
    for (const [k, v] of fk) L.push(`| ${k} | ${v} |`);
    L.push('');
  }

  const d = summary.diagnostics ?? {};
  L.push('## Diagnostics', '');
  L.push('| diagnostic | value |', '| --- | --- |');
  L.push(`| runs with tool calls (prompt pollution risk) | ${d.runs_with_tool_calls} |`);
  L.push(`| runs with stripped banner lines | ${d.runs_with_stripped_banner} |`);
  L.push(`| runs with malformed JSON lines | ${d.runs_with_malformed_json} |`);
  L.push(`| runs with empty answer | ${d.runs_with_empty_answer} |`);
  L.push(`| child peak RSS mean / max (KB) | ${ms(d.peak_rss_kb?.mean)} / ${ms(d.peak_rss_kb?.max)} |`);
  L.push('');

  const probs = summary.problems ?? [];
  if (probs.length) {
    L.push(`## Problems (${probs.length})`, '');
    L.push('| run_id | model | item | cat | failure | detail | answer preview |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const p of probs.slice(0, 60)) {
      L.push(`| ${p.run_id} | ${p.model} | ${p.item_id} | ${p.category ?? ''} | ${p.failure?.kind ?? 'wrong-answer'} | ${(p.detail ?? '').replace(/\|/g, '\\|').slice(0, 90)} | ${(p.answer_preview ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 60)} |`);
    }
    if (probs.length > 60) L.push(`| … | | | | | ${probs.length - 60} more in JSON | |`);
    L.push('');
  }

  L.push('## Method notes', '');
  L.push('- Accuracy counts only runs that produced a non-empty answer **and** were scored; transport failures are excluded from the denominator and reported separately as reliability.');
  L.push('- CI is a Wilson score interval (95%, z = 1.959964), which stays inside [0,1] at p = 0/1 and small n.');
  L.push('- `latency_ms` is spawn→process exit. `ttft_spawn_ms` is spawn→first answer byte (**includes** CLI boot). `ttft_opencode_ms` is first `step_start`→first text part on opencode\'s own clock (**excludes** boot, not chunk-quantised) — the headline metric. `ttft_model_ms` is the same span measured by stream arrival and **is** chunk-quantised, so it can read ~0. `generation_ms` is opencode\'s own generation window for the first text part.');
  L.push('- No metric here is a true time-to-first-token: `opencode run` emits one whole-text part with no token deltas, so these bound the true first-token time from above.');
  L.push('- `output_tokens` comes from the `step_finish` usage counters when `token_source=usage`; otherwise it is the `ceil(chars/4)` proxy, which under-counts code and over-counts Hangul/CJK.');
  L.push('- Transport failures are retried with full-jitter backoff. A run that produced an answer is **never** retried, so a wrong answer is never rerolled into a right one.');
  L.push('');
  return L.join('\n');
}

function table(rows) {
  const head = `| ${rows[0].join(' | ')} |`;
  const sep = `| ${rows[0].map(() => '---').join(' | ')} |`;
  const body = rows.slice(1).map((r) => `| ${r.join(' | ')} |`);
  return [head, sep, ...body].join('\n');
}

/** Aggregate records → {summary, markdown}; optionally write both files. */
export function buildReport(records, { outDir, title, notes, provenance, basename = 'report' } = {}) {
  const summary = aggregate(records);
  summary.generated_at = new Date().toISOString();
  if (provenance) summary.provenance = provenance;
  const markdown = toMarkdown(summary, { title, notes });
  let jsonPath = null;
  let mdPath = null;
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    jsonPath = path.join(outDir, `${basename}.json`);
    mdPath = path.join(outDir, `${basename}.md`);
    fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
    fs.writeFileSync(mdPath, `${markdown}\n`);
  }
  return { summary, markdown, jsonPath, mdPath };
}
