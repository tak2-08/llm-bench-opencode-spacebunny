import path from 'node:path';
import { fileURLToPath } from 'node:url';
// repo root = two levels above this file (extract/c1/<this>.mjs -> <root>)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
import fs from 'node:fs';
const epoch = JSON.parse(fs.readFileSync('/tmp/c1/out_epoch.json', 'utf8'));
const gaia = JSON.parse(fs.readFileSync('/tmp/c1/out_gaia.json', 'utf8'));
const bfcl = JSON.parse(fs.readFileSync('/tmp/c1/out_bfcl.json', 'utf8'));
const bc = JSON.parse(fs.readFileSync('/tmp/c1/out_browsecomp.json', 'utf8'));

// ---- LiveCodeBench: DERIVED from LiveCodeBench's own per-question release data ----
const lcb = JSON.parse(fs.readFileSync('/tmp/c1/lcb_src_mocks_performances_generation.json', 'utf8'));
const repr = Object.fromEntries(lcb.models.map((m) => [m.model_name, m.model_repr]));
// LiveCodeBench's own final date_mark (2025-05-01) is EMPTY — data ends 2025-04-07.
// So I use the last ~9 contiguous months of the official feed instead, and say so.
const WIN_START = Date.UTC(2024, 6, 1);            // 2024-07-01
const WIN_END = Date.UTC(2025, 3, 8);              // 2025-04-08 (one past last data point)
const winStart = WIN_START;
const acc = {};
for (const p of lcb.performances) {
  if (p.date < winStart) continue;
  acc[p.model] ||= { ok: 0, n: 0 };
  acc[p.model].n++;
  if (Number(p['pass@1']) > 0) acc[p.model].ok++;
}
const lcbRows = Object.entries(acc).filter(([, v]) => v.n >= 30).map(([k, v]) => ({
  model: repr[k] || k, model_version_raw: repr[k] || k,
  vendor: /claude/i.test(repr[k] || k) ? 'Anthropic' : (/gpt|o3|o4/i.test(repr[k] || k) ? 'OpenAI' : (/gemini/i.test(repr[k] || k) ? 'Google' : (/grok/i.test(repr[k] || k) ? 'xAI' : (/qwen|qwq/i.test(repr[k] || k) ? 'Alibaba' : 'other')))),
  benchmark: 'LiveCodeBench (code generation, pass@1)',
  score: v.ok / v.n, scale: 'fraction_0_to_1', unit: 'pass@1 (%)', score_mean_across_scorers: null,
  scaffold: 'LiveCodeBench official harness, no retrieval, sampled once',
  scaffold_detail: "window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeBench's own final date_mark 2025-05-01 is EMPTY because data ends 2025-04-07); n=" + v.n + ' sampled problems in window',
  reasoning_effort: (repr[k] || '').match(/\((Low|Med|Medium|High|Thinking)\)/i)?.[1] || null,
  pass_or_fail: 'pass@1 (single sample per problem)',
  n_problems_in_window: v.n,
  reported_by: 'LiveCodeBench official leaderboard DATA (derived by C1 from official per-question rows)',
  source_type: 'independent_eval_org_derived',
  vendor_self_report: false, derivation: 'C1 computed mean of per-question pass@1 over LiveCodeBench\'s own final date-mark window',
  url: 'https://raw.githubusercontent.com/livecodebench/livecodebench.github.io/main/src/mocks/performances_generation.json',
  source_file: 'src/mocks/performances_generation.json (performances[])',
  organization: null, country: null, model_release_date: null, run_started: null, stderr: null,
  retrieval_date: '2026-09-27', confidence: 'verified_source_derived_value',
  notes: 'LiveCodeBench data stops at 2025-04-07; newest models are O3/O4-Mini/Claude-4/Gemini-2.5. NO 2026 frontier models present.',
})).sort((a, b) => b.score - a.score);

// ---- Anthropic Claude Opus 5 vendor page: RELATIVE claims only (charts are images) ----
const anthropicVendor = [
  { bench: 'ARC-AGI 3', claim: "Opus 5's score is three times as high as the next-best model", model: 'Claude Opus 5' },
  { bench: 'Zapier AutomationBench', claim: "pass rate is around 1.5x the next-best model for the same cost per task; even at lowest effort Opus 5 passes more tasks than any other model", model: 'Claude Opus 5' },
  { bench: 'OSWorld 2.0', claim: 'outperforms every other model at any given cost, surpassing Fable 5 best result at just over a third of the cost', model: 'Claude Opus 5' },
  { bench: 'GDPval-AA v2', claim: 'at max effort performs within 0.5% of Fable 5 peak score, at half the cost per task', model: 'Claude Opus 5' },
].map((x) => ({
  model: x.model, model_version_raw: x.model, vendor: 'Anthropic',
  benchmark: x.bench, score: null, scale: null, unit: 'NOT MACHINE-READABLE', score_mean_across_scorers: null,
  scaffold: 'not stated as text; results presented as chart images with effort-setting curves',
  scaffold_detail: 'Anthropic shows performance as a function of the model effort setting; the underlying chart images were not machine-readable from the page source',
  reasoning_effort: 'multi-effort curve (low/medium/high/xhigh/max)', pass_or_fail: 'not stated',
  reported_by: 'Anthropic — "Introducing Claude Opus 5"',
  source_type: 'vendor_self_report', vendor_self_report: true,
  url: 'https://www.anthropic.com/news/claude-opus-5',
  source_file: 'article body text',
  relative_claim: x.claim,
  organization: 'Anthropic', country: 'United States', model_release_date: null, run_started: null, stderr: null,
  retrieval_date: '2026-09-27', confidence: 'verified_relative_claim_only',
  notes: 'DELIBERATE OMISSION: no absolute score is asserted because the page publishes these as chart images. Recording a number here would be fabrication.',
}));

const all = [...epoch, ...gaia, ...bfcl, ...bc, ...lcbRows, ...anthropicVendor];

// ---------- coverage ----------
const byBench = {};
for (const r of all) {
  byBench[r.benchmark] ||= { rows: 0, models: new Set(), vendors: new Set(), verified: 0, has2026: false };
  const b = byBench[r.benchmark];
  b.rows++; b.models.add(r.model); b.vendors.add(r.vendor);
  if (r.confidence === 'verified') b.verified++;
  if ((r.model || '').match(/gpt-5\.5|gpt-5\.6|gpt-6|claude-opus-5|claude-fable|claude-sonnet-5|gemini-3\.[5-8]|grok-4\.[3-6]|kimi-k3|glm-5\.3|qwen3\.8|muse-spark-1\.3|deepseek-v4/i)) b.has2026 = true;
}
const coverage = Object.fromEntries(Object.entries(byBench).map(([k, v]) => [k, {
  rows: v.rows, distinct_models: v.models.size, distinct_vendors: v.vendors.size,
  verified: v.verified, has_2026_frontier_model: v.has2026,
}]));

const out = {
  meta: {
    generated_by: 'C1 (Federation C / 상관·게시부)',
    generated_at: '2026-09-27',
    retrieval_date: '2026-09-27',
    purpose: 'Reported-score table for frontier commercial models, to be matched by C2 against our own measurements of opencode/space-bunny-free.',
    subject_model: 'opencode/space-bunny-free (we cannot run any paid frontier model — see credential_constraint)',
    credential_constraint: {
      statement: 'The federation was told, and I independently accept, that no paid frontier model can be executed by us: gpt-5.x, claude-opus-5, gemini-3-pro and grok-4.7 all fail with "Unexpected server error" because the account has no API credits. I did not attempt to re-verify this (it is not my remit and B1/B2 own live execution).',
      consequence: 'The "which frontier model has similar scores" question CANNOT be answered by direct measurement. It must be answered by matching our measurements against these REPORTED scores. Every number below is reported_by someone else, never measured by us.',
      cross_reference: 'Peer A2 (psycho-verify.mjs) and B1 (results-B1-harness) both independently report cost=0 / free-tier and warn that cost_per_solved_task degenerates. Consistent with this constraint.',
    },
    epistemic_legend: {
      verified: 'The number was read directly from a first-party page or first-party machine-readable data file during this session. The URL is asserted and was actually fetched on 2026-09-27.',
      verified_source_derived_value: 'The source data is first-party and verified, but the aggregate value was COMPUTED by C1 (not published as-is by the source). Flagged in the "derivation" field. Only one such record set (LiveCodeBench).',
      verified_relative_claim_only: 'The vendor page was read and its comparative claim recorded, but it publishes no machine-readable absolute number (chart images). score is null by design.',
      recalled: 'From model training knowledge, NOT confirmed against any page this session. Excluded from the primary table on purpose.',
      unverified_aggregator: 'Only available from a content-farm aggregator. Rejected outright — see data/C1-sources.md section 5.',
    },
    trust_hierarchy_applied: [
      '1. vendor model card / lab blog (openai.com, anthropic.com) — recorded with vendor_self_report=true',
      '2. independent eval org (Epoch AI hub, HAL Princeton, BFCL Berkeley, LiveCodeBench) — the bulk of this table',
      '3. arXiv papers — used for definitions and for the tau-bench pass^k claim',
      '4. content-farm aggregators — REJECTED (see C1-sources.md section 5)',
    ],
    no_fabrication_rule: 'No URL in this file was guessed. 8 raw.githubusercontent paths I probed returned 404 and were discarded, not cited. Every asserted URL returned HTTP 200 and its content was actually read.',
    licence_note: 'Epoch AI data is CC BY 4.0 (stated in its data README) and requires source+author credit. HAL, BFCL and LiveCodeBench are cited as URLs with retrieval dates. C3 must reproduce these attributions if publishing to GitHub.',
    coverage_summary: {
      total_cells: all.length,
      verified: all.filter((r) => r.confidence === 'verified').length,
      derived_from_verified_source: all.filter((r) => r.confidence === 'verified_source_derived_value').length,
      relative_claim_only: all.filter((r) => r.confidence === 'verified_relative_claim_only').length,
      recalled: 0,
      unverified_aggregator: 0,
      by_benchmark: coverage,
    },
    known_gaps_honest: [
      'LiveCodeBench: official data stops 2025-04-07 — zero 2026 frontier models.',
      'tau-bench / tau2-bench: official results cover only gpt-4.1, gpt-4.1-mini, o4-mini, claude-3-7-sonnet (2025). No 2026 frontier model has published a tau-bench score. The official result JSONs are 22-37MB raw conversation traces with no summary field, so no aggregate is quoted here.',
      'BFCL V4: official CSV last updated 2026-04-12; newest entries are Claude Opus 4.5, GPT-5.2, Gemini 3 Pro. No 2026 flagships.',
      'GAIA: the HAL leaderboard has been PAUSED by its maintainers ("We have paused updating HAL leaderboard with new models and are currently focusing on measuring reliability in AI agents"). Newest is Claude Sonnet 4.5 / GPT-5 Medium (2025).',
      "BrowseComp: no frontier model since 2025-04 has published a BrowseComp score on a first-party page I could reach. Deep Research 51.5% is vendor-reported and explicitly training-contaminated by OpenAI's own footnote.",
      "SimpleQA: two distinct benchmarks share the name. Epoch runs 'SimpleQA Verified' (a different dataset from OpenAI's original 4,326-question SimpleQA). They must NOT be pooled as one metric.",
      'Anthropic publishes Claude Opus 5 benchmark results only as chart images with relative claims, so no absolute vendor numbers could be recorded for it.',
    ],
  },
  scores: all,
};
fs.writeFileSync(path.join(ROOT,'data/frontier-scores.json'), JSON.stringify(out, null, 1));
console.log('WROTE data/frontier-scores.json');
console.log('total cells:', all.length, '| verified:', out.meta.coverage_summary.verified, '| derived:', out.meta.coverage_summary.derived_from_verified_source, '| relative-only:', out.meta.coverage_summary.relative_claim_only);
console.log('\ncoverage by benchmark:');
for (const [k, v] of Object.entries(coverage).sort((a, b) => b[1].rows - a[1].rows)) {
  console.log('  ', k.padEnd(46), 'rows=' + String(v.rows).padEnd(5), 'models=' + String(v.distinct_models).padEnd(4), 'vendors=' + String(v.distinct_vendors).padEnd(3), v.has_2026_frontier_model ? 'HAS-2026' : 'no-2026');
}
