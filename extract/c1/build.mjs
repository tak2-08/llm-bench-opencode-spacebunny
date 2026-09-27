// C1 — build frontier-scores.json from first-party sources actually read on 2026-09-27.
// No invented numbers. Every record carries reported_by + url + retrieved + confidence.
import { parseCSV } from './csv.mjs';
import fs from 'node:fs';

const D = '/tmp/c1/epochdata/';
const RETRIEVED = '2026-09-27';
const EPOCH_URL = 'https://epoch.ai/data/benchmark_data.zip';

const FAMILIES = [
  ['OpenAI', /^(gpt-(5|6|o3|o4-mini|4\.1|4o)|gpt-oss)/],
  ['Anthropic', /^claude-/],
  ['Google', /^gemini-(2\.5|3)/],
  ['xAI', /^grok-(3|4)/],
  ['DeepSeek', /^deepseek-(v4|r1|v3)/i],
  ['Moonshot', /kimi/i],
  ['Zhipu', /^glm-(4\.7|5)/],
  ['Alibaba', /^qwen3/i],
  ['Meta', /^(muse-spark|Llama-4)/],
  ['MiniMax', /minimax/i],
  ['Amazon', /nova/i],
  ['Mistral', /^(mistral|magistral|ministral|mixtral)/i],
  ['Microsoft', /^(phi|azure)/],
  ['ThinkingMachines', /inkling/i],
  ['Cohere', /^command/i],
];
const familyOf = (mv) => (FAMILIES.find(([, re]) => re.test(mv)) || [null])[0];

const REASONING = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'thinking', 'reasoning', 'instant', 'unknown', 'customtools', 'base']);
function splitScaffold(mv) {
  const m = mv.match(/^(.*)_([^_]+)$/);
  if (!m) return { model: mv, effort: 'unspecified' };
  return { model: m[1], effort: REASONING.has(m[2]) ? m[2] : m[2] };
}

// ---------------- Epoch AI (independently administered, 1st party) ----------------
const EPOCH_TARGETS = [
  ['gpqa_diamond', 'GPQA Diamond', 'Best score (across scorers)', 'mean_score', 'accuracy (%)', 'Epoch AI via Inspect, no tools, no tools/web', 'pass@1 equivalent (single-sample MCQ, mean over 8-16 runs)'],
  ['hle_external', "Humanity's Last Exam", 'Accuracy', null, 'accuracy (%)', 'Epoch AI re-administration (dataset version may differ from HLE org table)', 'single attempt, mean over runs'],
  ['swe_bench_verified', 'SWE-bench Verified', 'Best score (across scorers)', 'mean_score', '% resolved (500 instances)', 'Epoch AI via Inspect agentic harness', 'best-of-N across scorers; pass rate over instances'],
  ['simpleqa_verified', 'SimpleQA Verified', 'Best score (across scorers)', 'mean_score', '% correct', 'Epoch AI re-administration', 'best score across scorers'],
  ['frontiermath_tiers_1_3_v2', 'FrontierMath Tiers 1-3 v2', 'Best score (across scorers)', 'mean_score', 'accuracy (%)', 'Epoch AI via Inspect, no tools', 'mean over 8-16 runs'],
  ['frontiermath_tier_4_v2', 'FrontierMath Tier 4 v2', 'Best score (across scorers)', 'mean_score', 'accuracy (%)', 'Epoch AI via Inspect, no tools', 'mean over 8-16 runs'],
  ['frontiermath_erdos', 'FrontierMath Erdos', 'Best score (across scorers)', 'mean_score', 'fraction of 68 unsolved Lean problems', 'Epoch AI via Inspect, no tools', 'single attempt'],
  ['terminalbench_external', 'Terminal-Bench', 'Accuracy mean', null, '% resolution rate', 'see scaffold_detail (agent harness name from Terminal-Bench leaderboard)', 'mean over task runs'],
  ['aider_polyglot_external', 'Aider Polyglot', 'Percent correct', null, 'accuracy (% of exercises fully passing) — /100 to reach 0-1', 'Aider polyglot harness (225 Exercism exercises)', 'pass_rate_1 / pass_rate_2 per --tries'],
  ['arc_agi_2_external', 'ARC-AGI-2', 'Score', null, 'challenge score (fraction 0-1)', 'Epoch AI via Inspect', 'challenge score'],
  ['gdpval_external', 'GDPval', 'Win Rate (%)', null, 'win rate vs human expert deliverable (fraction 0-1)', 'Stirrup (shell + web browsing agent) + blind expert pairwise compare', 'win rate (Elo also produced by AA)'],
  ['apex_agents_external', 'APEX-Agents', 'Pass@1 score', 'Mean score', 'pass@1 (fraction 0-1)', 'Epoch AI via Inspect', 'pass@1 explicitly'],
  ['math_level_5', 'MATH Level 5', 'Best score (across scorers)', 'mean_score', 'accuracy (fraction 0-1)', 'Epoch AI via Inspect, no tools', 'mean over 8 runs'],
  ['scicode_external', 'SciCode', 'Score', null, 'subproblem score (fraction 0-1)', 'Epoch AI via Inspect', 'score'],
  ['osworld_2_external', 'OSWorld 2.0', 'Binary accuracy', 'Partial score', 'binary task success (fraction 0-1)', 'see scaffold_detail (reasoning / tool setting / step budget columns)', 'binary task success'],
  ['deepswe_external', 'DeepSWE', 'Pass@1', 'Pass@4', 'pass@1 (fraction 0-1); Pass@4 also in score_mean_across_scorers', 'see scaffold_detail (Harness + Reasoning effort columns)', 'pass@1 and pass@4 both published'],
  ['metr_time_horizons_external', 'METR Time Horizon (50% success)', 'Time horizon', 'Time Horizon (80%)', 'MINUTES of human task length at 50% success (this is a DURATION, not a probability — do not correlate it with accuracy columns)', 'METR logistic fit of success probability vs human task length', 'TH50 = score; TH80 = score_mean_across_scorers'],
  ['ebr_bench', 'EBR-bench', 'Best score (across scorers)', 'mean_score', 'mastery fraction (0-1)', 'Epoch AI via Inspect', 'mean over runs'],
  ['frontierswe_external', 'FrontierSWE', 'Score', 'Best@5', 'score (fraction 0-1); Best@5 in score_mean_across_scorers', 'see scaffold_detail (Harness column; separate Implementation/Performance/Research leaderboards)', 'score, Best@5, Worst@5 all published'],
  ['critpt_external', 'CritPt', 'Accuracy', null, 'accuracy (fraction 0-1)', 'Epoch AI via Inspect', 'accuracy'],
];

// Benchmarks whose source column is on a 0-100 scale and must be divided by 100.
const DIVIDE_100 = new Set(['aider_polyglot_external']);

const epochRows = [];
for (const [file, bench, col, meanCol, unit, scaffold, passOrFail] of EPOCH_TARGETS) {
  if (!fs.existsSync(D + file + '.csv')) { console.error('MISSING ' + file); continue; }
  const rows = parseCSV(fs.readFileSync(D + file + '.csv', 'utf8'));
  for (const r of rows) {
    const mv = (r['Model version'] || '').trim();
    if (!mv) continue;
    const fam = familyOf(mv);
    if (!fam) continue;
    const raw = r[col];
    if (raw === '' || raw === undefined || Number.isNaN(Number(raw))) continue;
    const div = DIVIDE_100.has(file) ? 100 : 1;
    const { model, effort } = splitScaffold(mv);
    // scaffold detail: prefer explicit per-benchmark scaffold columns
    let detail = r['Name'] || '';
    for (const k of ['Agent', 'Harness', 'Reasoning effort', 'Tool setting', 'Step budget', 'Reasoning']) {
      if (r[k]) detail += (detail ? ' | ' : '') + k + '=' + r[k];
    }
    if (!detail) detail = 'reasoning_effort=' + effort;
    epochRows.push({
      model, model_version_raw: mv, vendor: fam, benchmark: bench,
      score: Number(raw) / div,
      score_mean_across_scorers: meanCol ? (r[meanCol] === '' ? null : Number(r[meanCol]) / (meanCol === 'Best@5' ? 1 : div)) : null,
      scale: file === 'metr_time_horizons_external' ? 'minutes (duration, NOT a probability)' : 'fraction_0_to_1',
      unit, scaffold, scaffold_detail: detail,
      reasoning_effort: effort === 'unspecified' ? null : effort,
      pass_or_fail: passOrFail,
      reported_by: 'Epoch AI — Capabilities & benchmarking hub (independent re-administration)',
      source_type: 'independent_eval_org',
      vendor_self_report: false,
      url: EPOCH_URL,
      source_file: file + '.csv',
      upstream_row_source: r['Source Link'] || null,
      organization: r['Organization'] || null,
      country: r['Country'] || null,
      model_release_date: r['Release date'] || null,
      run_started: r['Started at'] || r['Run date'] || null,
      stderr: r['stderr'] ? Number(r['stderr']) : (r['Accuracy Standard Error'] || r['Accuracy SE'] || r['Pass@1 Standard Error'] ? Number(r['stderr'] || r['Accuracy Standard Error'] || r['Accuracy SE'] || r['Pass@1 Standard Error']) : null),
      retrieval_date: RETRIEVED, confidence: 'verified',
      license: 'CC BY 4.0 (per Epoch AI data README)',
    });
  }
}

// ---------------- GAIA — HAL (Princeton) first-party leaderboard ----------------
const hal = JSON.parse(fs.readFileSync('/tmp/c1/hal_gaia_rows.json', 'utf8'));
const gaiaRows = [];
for (const c of hal.rows) {
  const acc = c[4] || '';
  const m = acc.match(/^([\d.]+)%/);
  if (!m) continue;
  const scaffold = (c[1] || '').trim();
  const primary = (c[2] || '').trim();
  const verified = (c[3] || '').includes('✓');
  const ci = acc.match(/\(([-+][\d.]+)\/([+][\d.]+)\)/);
  const parts = primary.match(/^(.*?)\s*(High|Medium|Low)?\s*(\((?:[A-Za-z]+ \d{4})\))?$/);
  gaiaRows.push({
    model: (parts ? parts[1] : primary).trim(),
    model_effort_label: parts && parts[2] ? parts[2] : null,
    model_version_raw: primary,
    vendor: /claude/i.test(primary) ? 'Anthropic' : (/gpt|o4|o3/i.test(primary) ? 'OpenAI' : (/gemini/i.test(primary) ? 'Google' : (/deepseek/i.test(primary) ? 'DeepSeek' : 'other'))),
    benchmark: 'GAIA (public validation set, 165 questions)',
    score: Number(m[1]) / 100,
    scale: 'fraction_0_to_1',
    unit: 'accuracy (%)', score_mean_across_scorers: null,
    scaffold: 'agent scaffold: ' + scaffold,
    scaffold_detail: scaffold + ' | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page header)',
    reasoning_effort: parts && parts[2] ? parts[2].toLowerCase() : null,
    pass_or_fail: 'accuracy on 165-question public validation set',
    level1: c[5] || null, level2: c[6] || null, level3: c[7] || null,
    cost_usd: c[8] || null, runs: c[9] || null,
    results_reproduced_by_hal: verified,
    ci: ci ? { min: ci[1], max: ci[2] } : null,
    reported_by: 'HAL: GAIA Leaderboard (Princeton)',
    source_type: 'independent_eval_org',
    vendor_self_report: false,
    url: 'https://hal.cs.princeton.edu/gaia',
    source_file: 'server-rendered HTML <table>',
    organization: null, country: 'United States', model_release_date: null, run_started: null, stderr: null,
    retrieval_date: RETRIEVED, confidence: 'verified', license: null,
  });
}

// ---------------- BFCL V4 — official leaderboard CSV ----------------
const bfcl = parseCSV(fs.readFileSync('/tmp/c1/bfcl_overall.csv', 'utf8'));
const bfclRows = bfcl.map((r) => {
  const name = (r['Model'] || '').trim();
  const fam = /claude/i.test(name) ? 'Anthropic' : (/gpt|o3|o4/i.test(name) ? 'OpenAI' : (/gemini/i.test(name) ? 'Google' : (/grok/i.test(name) ? 'xAI' : (/kimi|moonshot/i.test(name) ? 'Moonshot' : (/glm|zai|zhipu/i.test(name) ? 'Zhipu' : (/qwen/i.test(name) ? 'Alibaba' : (/deepseek/i.test(name) ? 'DeepSeek' : (/grok/i.test(name) ? 'xAI' : (/nova|amazon/i.test(name) ? 'Amazon' : 'other')))))))));
  const sc = /FC/.test(name) ? 'native function calling (FC)' : (/Prompt/i.test(name) ? 'text-prompt workaround (Prompt)' : 'unspecified');
  return {
    model: name.replace(/\s*\((FC|Prompt[^)]*|Prompt \+ Thinking)\)\s*$/i, '').trim(),
    model_version_raw: name, vendor: fam,
    benchmark: 'BFCL V4 (Berkeley Function Calling Leaderboard V4)',
    score: Number(String(r['Overall Acc'] || '').replace('%', '')) / 100,
    scale: 'fraction_0_to_1',
    unit: 'overall accuracy (%) — unweighted average of all sub-categories',
    score_mean_across_scorers: null,
    scaffold: 'tool-calling interface: ' + sc,
    scaffold_detail: sc + ' | non-live AST, live, multi-turn, web-search, memory sub-categories | format-sensitivity cases apply only to Prompt models',
    reasoning_effort: /reasoning|thinking/i.test(name) ? 'reasoning' : (/non-reasoning/i.test(name) ? 'non-reasoning' : null),
    pass_or_fail: 'overall accuracy (not pass@k)',
    rank: Number(r['Rank']), cost_usd: Number(r['Total Cost ($)']) || null,
    latency_mean_s: Number(r['Latency Mean (s)']) || null,
    organization: r['Organization'] || null, license: r['License'] || null,
    reported_by: 'Berkeley Function Calling Leaderboard (gorilla.cs.berkeley.edu)',
    source_type: 'independent_eval_org', vendor_self_report: false,
    url: 'https://gorilla.cs.berkeley.edu/data_overall.csv',
    source_file: 'data_overall.csv (loaded by index_main.js via fetch("./data_overall.csv"))',
    model_release_date: null, run_started: null, stderr: null,
    retrieval_date: RETRIEVED, confidence: 'verified', notes: 'Leaderboard last updated 2026-04-12 per A1; newest flagship present is Claude Opus 4.5 / GPT-5.2 / Gemini 3 Pro — no 2026 flagships.',
  };
}).filter((r) => !Number.isNaN(r.score));

// ---------------- BrowseComp — OpenAI first-party ----------------
const browsecomp = [
  { model: 'GPT-4o', score: 0.6, scaffold: 'no browsing' },
  { model: 'GPT-4o', score: 1.9, scaffold: 'with web browsing tool' },
  { model: 'GPT-4.5', score: 0.9, scaffold: 'no browsing' },
  { model: 'OpenAI o1', score: 9.9, scaffold: 'no browsing (medium effort)' },
  { model: 'Deep Research (OpenAI)', score: 51.5, scaffold: 'agentic deep-research model, single attempt' },
].map((x) => ({
  model: x.model, model_version_raw: x.model, vendor: 'OpenAI',
  benchmark: 'BrowseComp (1,266 problems)',
  score: x.score / 100, scale: 'fraction_0_to_1', unit: 'accuracy (%)', score_mean_across_scorers: null,
  scaffold: x.scaffold, scaffold_detail: x.scaffold,
  reasoning_effort: null,
  pass_or_fail: 'single attempt accuracy (aggregation of 64 samples adds 15-25% per OpenAI)',
  reported_by: 'OpenAI — "BrowseComp: a benchmark for browsing agents" (2025-04-10)',
  source_type: 'vendor_self_report', vendor_self_report: true,
  url: 'https://openai.com/index/browsecomp/',
  source_file: 'in-page table "Model / Accuracy (%)"',
  organization: 'OpenAI', country: 'United States', model_release_date: null, run_started: null, stderr: null,
  retrieval_date: RETRIEVED, confidence: 'verified',
  contamination_caveat: x.model === 'Deep Research (OpenAI)' ? 'OpenAI states verbatim: "the Deep Research model is trained on data that specifically teaches the model to be good at BrowseComp tasks." Treat as training-contaminated, NOT a clean capability score.' : null,
}));

fs.writeFileSync('/tmp/c1/out_epoch.json', JSON.stringify(epochRows, null, 1));
fs.writeFileSync('/tmp/c1/out_gaia.json', JSON.stringify(gaiaRows, null, 1));
fs.writeFileSync('/tmp/c1/out_bfcl.json', JSON.stringify(bfclRows, null, 1));
fs.writeFileSync('/tmp/c1/out_browsecomp.json', JSON.stringify(browsecomp, null, 1));
console.log('epoch', epochRows.length, '| gaia', gaiaRows.length, '| bfcl', bfclRows.length, '| browsecomp', browsecomp.length);
