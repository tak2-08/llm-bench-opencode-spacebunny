import { parseCSV } from './csv.mjs';
import fs from 'node:fs';

const D = '/tmp/c1/epochdata/';

// ---- frontier commercial model families (2024-09 .. 2026-09 generation window) ----
// Each entry: [display family label, regex on the model-version string]
const FAMILIES = [
  ['OpenAI',            /^gpt-(5(\.\d)?|6|5\.\d-(mini|nano|pro)|5-pro|5-instant)/],
  ['OpenAI-reasoning',  /^(o3|o4-mini)-/],
  ['OpenAI-open',       /^gpt-oss-/],
  ['Anthropic',         /^claude-(opus|sonnet|haiku|fable|3-opus|3-5-sonnet|3-7-sonnet|3-5-haiku)/],
  ['Google',            /^gemini-(3|2\.5)/],
  ['xAI',               /^grok-(4|3)/],
  ['DeepSeek',          /^deepseek-(v4|r1$|r1-|v3)/i],
  ['Moonshot',          /^kimi-(k2|k3)|^fireworks\/kimi/],
  ['Zhipu',             /^glm-(5|4\.7)/],
  ['Alibaba',           /^qwen3(\.[5-9]|8|max)/],
  ['Meta',              /^muse-spark|^Llama-4/],
  ['MiniMax',           /^minimax/i],
  ['Amazon',            /^amazon\.nova/],
  ['Mistral',           /^(mistral|magistral|ministral)/i],
  ['Microsoft',         /^azure|^phi-4/],
  ['ThinkingMachines',  /^inkling/i],
  ['Cohere',            /^command-r/],
];

// Which of the above are "frontier commercial" for the primary table.
// open-weights reference points kept as a clearly separated secondary class.
const OPEN_WEIGHTS = new Set(['OpenAI-open', 'Meta', 'Alibaba', 'DeepSeek', 'Mistral', 'Zhipu', 'Moonshot', 'MiniMax']);

function splitScaffold(mv) {
  const m = mv.match(/^(.*)_([^_]+)$/);
  if (!m) return { model: mv, reasoning: 'unspecified' };
  return { model: m[1], reasoning: m[2] };
}

function familyOf(mv) {
  for (const [label, re] of FAMILIES) if (re.test(mv)) return label;
  return null;
}

const REASONING_WORDS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'thinking', 'reasoning', 'instant', 'unknown', 'customtools', 'base']);

// Epoch source files -> (canonical benchmark id, score column, unit, notes)
const TARGETS = [
  { file: 'gpqa_diamond',              bench: 'GPQA Diamond',      col: 'Best score (across scorers)', unit: 'fraction (1.0 = 100%)', harness: 'Epoch AI via Inspect, no tools' },
  { file: 'hle_external',              bench: "Humanity's Last Exam", col: 'Accuracy', unit: 'fraction (1.0 = 100%)', harness: 'Epoch AI re-administration' },
  { file: 'swe_bench_verified',        bench: 'SWE-bench Verified', col: 'Best score (across scorers)', unit: 'fraction (1.0 = 100% resolved)', harness: 'Epoch AI via Inspect' },
  { file: 'simpleqa_verified',         bench: 'SimpleQA Verified',  col: 'Best score (across scorers)', unit: 'fraction (1.0 = 100% correct)', harness: 'Epoch AI re-administration' },
  { file: 'frontiermath_tiers_1_3_v2', bench: 'FrontierMath Tiers 1-3 v2', col: 'Best score (across scorers)', unit: 'fraction (1.0 = 100%)', harness: 'Epoch AI via Inspect, no tools' },
  { file: 'frontiermath_tier_4_v2',    bench: 'FrontierMath Tier 4 v2',    col: 'Best score (across scorers)', unit: 'fraction (1.0 = 100%)', harness: 'Epoch AI via Inspect, no tools' },
  { file: 'frontiermath_erdos',        bench: 'FrontierMath Erdos',        col: 'Best score (across scorers)', unit: 'fraction (68 unsolved Lean problems)', harness: 'Epoch AI via Inspect, no tools' },
  { file: 'terminalbench_external',    bench: 'Terminal-Bench',     col: 'Accuracy mean', unit: 'fraction (1.0 = 100% resolution rate)', harness: 'row Agent column' },
  { file: 'aider_polyglot_external',   bench: 'Aider Polyglot',    col: 'Percent correct', unit: 'fraction (1.0 = 100%)', harness: 'Aider polyglot harness' },
  { file: 'arc_agi_2_external',        bench: 'ARC-AGI-2',          col: 'Score', unit: 'fraction (1.0 = 100%)', harness: 'Epoch AI via Inspect' },
  { file: 'gdpval_external',           bench: 'GDPval',             col: 'Win Rate (%)', unit: 'fraction (1.0 = 100% win rate)', harness: 'Stirrup (shell+browse agent) + expert blind-compare' },
  { file: 'scicode_external',          bench: 'SciCode',            col: 'Score', unit: 'fraction (1.0 = 100%)', harness: 'Epoch AI via Inspect' },
  { file: 'critpt_external',           bench: 'CritPt',             col: 'Average', unit: 'fraction (1.0 = 100%)', harness: 'Epoch AI via Inspect' },
  { file: 'math_level_5',              bench: 'MATH Level 5',       col: 'Best score (across scorers)', unit: 'fraction (1.0 = 100%)', harness: 'Epoch AI via Inspect, no tools' },
  { file: 'otis_mock_aime_2024_2025',  bench: 'Mock AIME 2024-2025', col: 'Best score (across scorers)', unit: 'fraction (1.0 = 100%)', harness: 'Epoch AI via Inspect, no tools' },
  { file: 'osworld_2_external',        bench: 'OSWorld 2.0',        col: 'Binary accuracy', unit: 'fraction (1.0 = 100%)', harness: 'Epoch AI via Inspect' },
  { file: 'apex_agents_external',      bench: 'APEX-Agents',        col: 'Pass@1 score', unit: 'fraction (1.0 = 100%)', harness: 'Epoch AI via Inspect' },
  { file: 'metr_time_horizons_external', bench: 'METR Time Horizons', col: 'average_score', unit: 'fraction', harness: 'METR task-length fit' },
  { file: 'ebr_bench',                 bench: 'EBR-bench',          col: 'Best score (across scorers)', unit: 'fraction (1.0 = 100%)', harness: 'Epoch AI via Inspect' },
];

const out = [];
for (const t of TARGETS) {
  if (!fs.existsSync(D + t.file + '.csv')) { console.error('MISSING ' + t.file); continue; }
  const rows = parseCSV(fs.readFileSync(D + t.file + '.csv', 'utf8'));
  for (const r of rows) {
    const mv = (r['Model version'] || '').trim();
    if (!mv) continue;
    const fam = familyOf(mv);
    if (!fam) continue;
    const raw = r[t.col];
    const v = Number(raw);
    if (raw === '' || raw === undefined || Number.isNaN(v)) continue;
    const { model, reasoning } = splitScaffold(mv);
    out.push({
      model_raw: mv,
      model,
      family: fam,
      open_weights_ref: OPEN_WEIGHTS.has(fam),
      reasoning_budget: REASONING_WORDS.has(reasoning) ? reasoning : reasoning,
      benchmark: t.bench,
      score: v,
      unit: t.unit,
      scaffold: t.harness,
      scaffold_detail: t.file === 'terminalbench_external' ? (r['Agent'] || '') : (REASONING_WORDS.has(reasoning) ? 'reasoning_effort=' + reasoning : 'no explicit reasoning suffix'),
      org: r['Organization'],
      country: r['Country'],
      release_date: r['Release date'],
      stderr: r['stderr'] || r['Accuracy Standard Error'] || r['Accuracy SE'] || '',
      epoch_run_started: r['Started at'] || r['Run date'] || '',
      reported_by: 'Epoch AI Capabilities & benchmarking hub',
      url: 'https://epoch.ai/data/benchmark_data.zip (file: ' + t.file + '.csv)',
      retrieved: '2026-09-27',
      pass_or_fail: 'mean over scorers; see stderr (Epoch runs 8-16x, CI = +/-1 SE)',
      confidence: 'verified',
      vendor_self_report: false,
      row_source: r['Source Link'] || '',
    });
  }
}
fs.writeFileSync('/tmp/c1/epoch_extracted.json', JSON.stringify(out, null, 1));
console.log('extracted rows:', out.length);
const byBench = {};
for (const r of out) byBench[r.benchmark] = (byBench[r.benchmark] || 0) + 1;
for (const [k, v] of Object.entries(byBench).sort((a, b) => b[1] - a[1])) console.log('  ', k, v);
