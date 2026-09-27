import path from 'node:path';
import { fileURLToPath } from 'node:url';
// repo root = two levels above this file (extract/c1/<this>.mjs -> <root>)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
import fs from 'node:fs';
const db = JSON.parse(fs.readFileSync(path.join(ROOT,'data/frontier-scores.json'), 'utf8'));
const all = db.scores;
const pct = (x) => (x === null || x === undefined ? '—' : (x * 100).toFixed(2) + '%');
const L = [];
const p = (s) => L.push(s === undefined ? '' : s);

// Which of the 12 de-facto headline benchmarks A1 named, and where we stand.
const HEADLINE = [
  ['GPQA Diamond', 'GPQA Diamond'],
  ["Humanity's Last Exam", "Humanity's Last Exam"],
  ['FrontierMath', 'FrontierMath Tiers 1-3 v2'],
  ['SWE-bench Verified', 'SWE-bench Verified'],
  ['SWE-bench Multilingual', null],
  ['Terminal-Bench 4.0', 'Terminal-Bench'],
  ['LiveCodeBench', 'LiveCodeBench (code generation, pass@1)'],
  ['τ-bench / τ²-bench', null],
  ['BFCL V4', 'BFCL V4 (Berkeley Function Calling Leaderboard V4)'],
  ['GAIA', 'GAIA (public validation set, 165 questions)'],
  ['SimpleQA', 'SimpleQA Verified'],
  ['BrowseComp', 'BrowseComp (1,266 problems)'],
];

p('# C1 — Reported scores of frontier commercial models');
p('');
p('**Agent:** C1 (Federation C / 상관·게시부) · **Date:** 2026-09-27 · **Machine-readable:** `data/frontier-scores.json` · **Sources:** `data/C1-sources.md`');
p('');
p('> **Subject of the federation\'s measurement:** `opencode/space-bunny-free`. We **cannot run any paid frontier model**');
p('> ourselves (gpt-5.x / claude-opus-5 / gemini-3-pro / grok-4.7 all return "Unexpected server error" — no API credits).');
p('> Therefore **every number in this report was reported by somebody else, never measured by us.**');
p('');
p('## 0. The one rule that governs this whole document');
p('');
p('> **An agentic benchmark score is not a model property. It is a tuple of (model × scaffold × reasoning budget × tool access).**');
p('');
p('Section 3 documents same-model score swings of **43.64pt** (GAIA), **16.88pt** (HLE) and **10.60pt** (BFCL) that are');
p('*entirely* attributable to changing the scaffold or the thinking mode. Any matching exercise that treats a bare score');
p('as a model attribute is measuring the harness, not the model.');
p('');
p('## 1. Provenance rules I obeyed');
p('');
p('| Trust tier | Source class | Used here |');
p('|---|---|---|');
p('| 1 | Vendor model card / lab blog | Yes — `vendor_self_report: true` (OpenAI BrowseComp, Anthropic Opus 5 claims) |');
p('| 2 | Independent eval org | **Yes — the bulk.** Epoch AI hub, HAL (Princeton), BFCL (Berkeley), LiveCodeBench |');
p('| 3 | arXiv paper | Yes — definitions + the τ-bench `pass^k` claim |');
p('| 4 | Content-farm aggregator | **REJECTED. Zero numbers taken.** See `C1-sources.md` §5 |');
p('');
p('**No URL in these deliverables was guessed.** Nine `raw.githubusercontent.com/` and `gorilla.cs.berkeley.edu/data_*.csv` paths I');
p('probed returned 404 and were discarded rather than cited. Every asserted URL returned HTTP 200 and its content was');
p('actually read on 2026-09-27.');
p('');
p('## 2. Headline benchmark coverage — the honest picture');
p('');
p('| # | Headline benchmark | Cells | Distinct models | Vendors | 2026 frontier models? | Source |');
p('|---|---|---|---|---|---|---|');
HEADLINE.forEach(([name, key], i) => {
  const rows = key ? all.filter((r) => r.benchmark === key) : [];
  const cov = key ? db.meta.coverage_summary.by_benchmark[key] : null;
  const src = rows.length ? [...new Set(rows.map((r) => r.reported_by.split(' —')[0]))].join(', ') : '— none —';
  const has = cov?.has_2026_frontier_model ? '**yes**' : (rows.length ? 'no (stale)' : '**NO DATA**');
  p(`| ${i + 1} | ${name} | ${rows.length || 0} | ${cov?.distinct_models || 0} | ${cov?.distinct_vendors || 0} | ${has} | ${src} |`);
});
p('');
p('**Bottom line: 5 of the 12 headline benchmarks have real 2026-frontier coverage** (GPQA Diamond, HLE, FrontierMath,');
p('SWE-bench Verified, SimpleQA Verified — all via the Epoch AI hub). **SWE-bench Multilingual and τ-bench/τ²-bench have no');
p('2026 data at all.** LiveCodeBench, BFCL V4 and GAIA have data but are frozen at 2025 generations. Details in §6.');
p('');
p('## 3. ⚠️ Scaffold swings — read this before C2 correlates anything');
p('');
p('All numbers below were read directly from the first-party table named in the row. Same model, same benchmark,');
p('**only the scaffold / thinking mode changed.**');
p('');
p('| Benchmark | Source | Model | Configuration A | Configuration B | Δ | Direction |');
p('|---|---|---|---|---|---|---|');
p('| GAIA | HAL (Princeton) | Claude Sonnet 4.5 | HAL Generalist Agent **74.55%** | HF Open Deep Research **30.91%** | **43.64pt** | scaffold dominates |');
p('| GAIA | HAL (Princeton) | Claude 3.7 Sonnet | HAL 56.36% | HF Open Deep Research 36.97% | 19.39pt | scaffold dominates |');
p('| GAIA | HAL (Princeton) | Claude Opus 4 (May 2025) | HAL 64.85% | HF Open Deep Research 57.58% | 7.27pt | scaffold dominates |');
p('| GAIA | HAL (Princeton) | **GPT-5 Medium** | HF Open Deep Research **62.80%** | HAL **59.39%** | −3.41pt | **reversed** |');
p('| GAIA | HAL (Princeton) | Claude Opus 4.1 | High 68.48% | unspecified 64.24% | 4.24pt | reasoning budget |');
p('| BFCL V4 | Berkeley | GPT-5.2-2025-12-11 | native tool calling 55.87% | text-prompt 45.27% | 10.60pt | FC wins |');
p('| BFCL V4 | Berkeley | Grok-4-1-fast | reasoning 69.57% | non-reasoning 58.29% | 11.28pt | thinking wins |');
p('| BFCL V4 | Berkeley | **Gemini-3-Pro-Preview** | native tool calling 68.14% | text-prompt **72.51%** | −4.37pt | **reversed** |');
p('| HLE | Epoch AI | gpt-5.1 | `gpt-5.1-thinking` 23.68% | `gpt-5.1-instant` 6.80% | 16.88pt | thinking wins |');
p('| HLE | Epoch AI | claude-opus-4-6 | `thinking-max` 34.44% | `Non-Thinking` 19.00% | 15.44pt | thinking wins |');
p('| GPQA Diamond | Epoch AI | gpt-5.6-luna | best effort 91.6% | lowest effort 63.6% | 28.0pt | reasoning budget |');
p('| GPQA Diamond | Epoch AI | gpt-5.4-2026-03-05 | xhigh 93.3% | none 74.7% | 18.6pt | reasoning budget |');
p('');
p('**Four consequences for the federation:**');
p('');
p('1. **The swing is not a constant.** It ranges from −3.41pt to +43.64pt, and *reverses sign* for two models. A single');
p('   "scaffold correction factor" would be wrong.');
p('2. **GAIA spread (43.6pt) is ~6× a generational model gap.** Peer A1 flagged the 7.27pt Opus-4 case; the Sonnet-4.5 case is');
p('   six times larger. A model\'s GAIA number identifies the *agent* more than the *model*.');
p('3. **Reasoning budget alone is worth 15–28pt on HLE/GPQA.** Any single measured value for our subject sits inside a band');
p('   that wide. Matching to a specific frontier row is only meaningful if the reasoning budget is matched too.');
p('4. **Native tool-calling is not uniformly better** (Gemini 3 Pro loses 4.37pt with it). "Agentic score" is not one axis.');
p('');

// ---- per-benchmark tables ----
const ORDER = ['GPQA Diamond', "Humanity's Last Exam", 'FrontierMath Tiers 1-3 v2', 'FrontierMath Tier 4 v2',
  'FrontierMath Erdos', 'SWE-bench Verified', 'SimpleQA Verified', 'Terminal-Bench', 'GAIA (public validation set, 165 questions)',
  'BFCL V4 (Berkeley Function Calling Leaderboard V4)', 'BrowseComp (1,266 problems)', 'LiveCodeBench (code generation, pass@1)',
  'DeepSWE', 'Aider Polyglot', 'ARC-AGI-2', 'OSWorld 2.0', 'GDPval', 'APEX-Agents', 'METR Time Horizon', 'MATH Level 5',
  'SciCode', 'CritPt', 'EBR-bench', 'FrontierSWE', 'ARC-AGI 3', 'Zapier AutomationBench', 'GDPval-AA v2'];
p('## 4. Per-benchmark tables');
p('');
p('Scores are the source\'s own value. `effort` = reasoning budget where the source exposes it. `source` = who published it.');
p('Every row is `verified` unless the "confidence" column says otherwise.');
p('');
for (const bench of ORDER) {
  const rows = all.filter((r) => r.benchmark === bench);
  if (!rows.length) continue;
  const withScore = rows.filter((r) => r.score !== null);
  const relOnly = rows.filter((r) => r.score === null);
  p(`### ${bench}`);
  p('');
  const srcs = [...new Set(rows.map((r) => r.reported_by))];
  p(`**Source:** ${srcs.join(' · ')}  \n**URL:** ${[...new Set(rows.map((r) => r.url))].join(' · ')}  \n**Retrieved:** ${rows[0].retrieval_date}  \n**Cells:** ${rows.length} (${withScore.length} with a score, ${relOnly.length} relative-claim-only)`);
  p('');
  if (withScore.length) {
    const top = [...withScore].sort((a, b) => b.score - a.score).slice(0, 22);
    p('| Model | Vendor | effort | Score | Scaffold detail | confidence |');
    p('|---|---|---|---|---|---|');
    for (const r of top) {
      p(`| ${r.model} | ${r.vendor} | ${r.reasoning_effort || '—'} | **${pct(r.score)}** | ${String(r.scaffold_detail || '').slice(0, 90)} | ${r.confidence === 'verified' ? 'verified' : r.confidence} |`);
    }
  }
  if (relOnly.length) {
    p('');
    p('Relative claims only — **no absolute score published, so none is recorded** (would be fabrication):');
    p('');
    for (const r of relOnly) p(`- **${r.model}** on ${r.benchmark}: *"${r.relative_claim}"*  — ${r.reported_by}, ${r.retrieval_date}`);
  }
  p('');
}

// ---- vendor self-report section ----
p('## 5. Vendor self-reports vs independently measured');
p('');
const vend = all.filter((r) => r.vendor_self_report);
p(`Vendor self-reported cells: **${vend.length}** of ${all.length}. Independently administered: **${all.length - vend.length}**.`);
p('');
p('| Model | Benchmark | Score | Source | Caveat |');
p('|---|---|---|---|---|');
for (const r of vend) {
  p(`| ${r.model} | ${r.benchmark} | ${pct(r.score)} | ${r.reported_by} | ${r.contamination_caveat ? '**training-contaminated by the vendor\'s own footnote**' : (r.score === null ? 'relative claim only' : 'vendor-run')} |`);
}
p('');
p('### ⚠️ The Deep Research / BrowseComp number must not be used as a capability score');
p('');
p('OpenAI\'s own BrowseComp page footnotes the headline 51.5% figure:');
p('> *"Note that the Deep Research model is trained on data that specifically teaches the model to be good on BrowseComp tasks."*');
p('');
p('This is a **training-contaminated** figure, not a clean measurement. It is 5.7× the next-best model on the same page and');
p('that ratio is largely explained by the contamination. C2 must not treat it as a capability anchor.');
p('');

// ---- gaps ----
p('## 6. Honest gaps (no number invented to fill them)');
p('');
for (const g of db.meta.known_gaps_honest) p('- ' + g);
p('');
p('## 7. Data-integrity traps I found and fixed — read before using this table');
p('');
p('**7.1 Scale normalisation (a live bug I caught in my own output).** Epoch\'s `aider_polyglot_external.csv` stores');
p('`Percent correct` on a **0–100** scale (e.g. `grok-4-0709 = 79.6`) while every other file in the bundle is **0–1**. My');
p('first build passed 79.6 through unconverted, which would have made Aider Polyglot look ~100× better than every other');
p('benchmark and silently destroyed any correlation computed across benchmarks. Fixed: divided by 100, and **every row');
p('now carries an explicit `scale` field** — 1,673 rows are `fraction_0_to_1`, 34 are `minutes`, 4 are `null` (no number).');
p('Audit: **0 fraction rows fall outside [0,1]**.');
p('');
p('**7.2 METR Time Horizon is a DURATION, not a probability.** Its `scale` is `minutes`, values 4.0 → 1,044.8 min');
p('(`claude-mythos-preview-early` 1,044.8 min TH50 / 185.9 min TH80). **It must not be correlated against the accuracy');
p('columns** — it is minutes of human task length, a different physical quantity.');
p('');
p('**7.3 Terminal-Bench rows are per-AGENT, not per-model.** `claude-opus-4-6` has **12 rows** because it was run on 12');
p('different agent harnesses (`ForgeCode`, `Meta-Harness`, `Capy`, `Terminus-KIRA`, `MAYA-V2`, `TongAgents`, …). These rows');
p('range widely. **Averaging them measures the average agent, not the model.** The agent name is in `scaffold_detail`.');
p('');
p('**7.4 There are duplicate-looking rows that are NOT duplicates — and some that are.**');
p('- **16 keys** repeat with an *identical* score (mostly ARC-AGI-2, e.g. `gpt-5.6-sol_xhigh` twice at 0.90).');
p('- **72 keys** repeat with *different* scores. These are legitimate (the Terminal-Bench multi-agent rows of 7.3).');
p('- **7 model+benchmark pairs carry two different effort labels with an identical score** — a silent double-count risk if');
p('  you group by model: `gpt-5-2025-08-07` on HLE (`high` and `unknown`, both 0.2532), `nova-2.0-pro-preview` on CritPt');
p('  (`medium`/`none`/`low`, all 0), `qwen3.7-flash` on FrontierMath, `grok-4-0709` on Aider Polyglot, and 3 more.');
p('  **Group by `model_version_raw`, not by `model`, or these will be double-weighted.**');
p('');
p('**7.5 Epoch\'s `score_column` is "Best score (across scorers)"** — a max-over-grader, which reads like an optimistic pick.');
p('I checked it: across all 313 GPQA Diamond rows, only **5** have Best > mean, and the largest gap is `grok-3-beta` at');
p('**8.18pt**. For frontier commercial models the gap is **0.00**. Both `score` and `score_mean_across_scorers` are');
p('recorded for every Epoch row so this can be re-checked.');
p('');
p('**7.6 The model-version suffix is the scaffold, not the model name.** `claude-opus-4-6` is *Non-Thinking* while');
p('`claude-opus-4-6_max` is *thinking-max*; `gpt-5.1-..._none` is *gpt-5.1-instant*. Epoch\'s `hle_external.csv` has a');
p('`Name` column that states this explicitly, and I copied it into `scaffold_detail`. A pipeline that strips the suffix');
p('and keeps one number per model will silently average a thinking model with a non-thinking one.');
p('');
p('## 8. Cross-validation — two sources agree');
p('');
p('Epoch AI\'s independent re-administration of HLE agrees with HLE\'s own published table (which peer A1 verified on');
p('lastexam.ai): **GPT-5 25.32% vs 25.3% reported — exact match**; Gemini 3 Pro 37.52% vs 38.3% (0.8pt). This is the one');
p('place in this dataset where an independent org and a benchmark\'s maintainer can be compared directly, and they agree.');
p('It raises confidence that the Epoch rows are trustworthy for the other benchmarks where no maintainer table exists.');
p('');
p('## 9. Reproduction');
p('');
p('- Extraction scripts: `/tmp/c1/{csv,extract_epoch,build,emit}.mjs` (the Epoch zip extractor is `/tmp/c1/unzip.mjs` — this');
p('  container has no `unzip` and no `python3`, so the ZIP was parsed in Node via `zlib.inflateRawSync`).');
p('- Epoch CSVs were extracted to `/tmp/c1/epochdata/`; every row in the JSON names the `source_file` it came from.');
p('- **Nothing in T2Editor was read or written. No git commit was made.**');

fs.writeFileSync(path.join(ROOT,'reports/C1-frontier-scores.md'), L.join('\n'));
console.log('WROTE reports/C1-frontier-scores.md', L.length, 'lines');
