# ATTRIBUTION

Licences and credits for every external source in this repository. Read this before
redistributing anything here.

**Retrieval date for all first-party data: 2026-09-27.** Every asserted URL returned HTTP 200
and its content was actually read on that date. Failed probes are recorded in
[`C1-sources.md`](C1-sources.md) §3 so nobody re-derives them; **none of them is cited
anywhere.**

---

## 1. Epoch AI — the backbone, and licence-bearing

**1,685 of the 1,711 cells** in [`frontier-scores.json`](frontier-scores.json) come from here.
**The attribution is not optional.**

- **Source:** Epoch AI public benchmark dataset
- **Data file:** `https://epoch.ai/data/benchmark_data.zip` (2,317,456 B, `application/zip`, 88 CSVs)
- **Discovery page:** `https://epoch.ai/benchmarks/use-this-data`
- **Licence:** **CC BY 4.0.** Epoch's data README states the data is *"free to use, distribute,
  and reproduce provided the source and authors are credited."*
- **Citation format:** as given in the dataset's own `README.md`
- **Also consulted:** `https://epoch.ai/benchmarks`; `https://github.com/epoch-research/epochai-python/`

> **Required credit.** Reproduce this when redistributing `data/frontier-scores.json` or any
> table derived from it:
>
> > Benchmark scores from the **Epoch AI** public benchmark dataset, used under **CC BY 4.0**.
> > Source: `https://epoch.ai/data/benchmark_data.zip` (retrieved 2026-09-27). Reproduced with
> > credit to Epoch AI and the benchmark authors as required by the source licence.

**Benchmarks carried by Epoch in this table:** GPQA Diamond, Humanity's Last Exam,
FrontierMath (4 versions + Erdős), SWE-bench Verified, SimpleQA Verified, Terminal-Bench 4.0,
Aider Polyglot, ARC-AGI-2, CritPt, SciCode, DeepSWE, MATH Level 5, METR Time Horizon, OSWorld 2.0,
APEX-Agents, EBR-bench, FrontierSWE, GDPval, and the ECI index.

**Their original authors are ours to credit, not theirs to absorb:** GPQA (Rein et al.), HLE
(Phan et al. / Center for AI Safety), SWE-bench (Jimenez et al.), SimpleQA (Wei et al.),
FrontierMath (Paturi et al.), τ-bench (Yao et al.), GAIA (Mialon et al.), MATH (Hendrycks et al.),
Aider Polyglot (Aider).

**Independent cross-validation that this data is trustworthy:** Epoch's re-administration of HLE
gives **GPT-5 25.32%**, against the HLE organisation's own table at **25.3%** — agreement to the
printed digit. Gemini 3 Pro: 37.52% vs 38.3%.

## 2. Berkeley Function Calling Leaderboard (BFCL V4) — 109 cells

- **Landing page:** `https://gorilla.cs.berkeley.edu/leaderboard.html`
- **Data file:** `https://gorilla.cs.berkeley.edu/data_overall.csv` (33,046 B, 109 rows, 34 sub-categories, cost and latency columns)
- **The data path was discovered, not guessed:** the page's own `index_main.js` calls
  `init("overall")`, which fetches `./data_${datasetName}.csv`. A directly guessed
  `data_bfcl_v4.csv` returned 404 and was discarded.
- **Licence:** the CSV carries a per-model `License` column. Cited by URL with retrieval date.
- **Authors:** the Berkeley Gorilla team (Shishir Patil et al.)

## 3. HAL GAIA Leaderboard (Princeton) — 32 cells

- **URL:** `https://hal.cs.princeton.edu/gaia`
- **Form:** server-rendered HTML `<table>`, fully parsed (all 32 rows), with per-level accuracy,
  min-max CI across runs, cost, run count and trace links
- **Licence:** cited by URL with retrieval date
- **Authors:** the Princeton HAL ("Holistic Agent Leaderboard") team

**This is the source of the 43.64 pp scaffold swing that the whole report turns on** — the same
Claude Sonnet 4.5 scoring 74.55% under one agent and 30.91% under another.

## 4. LiveCodeBench — 22 cells

- **Data file:** `https://raw.githubusercontent.com/livecodebench/livecodebench.github.io/main/src/mocks/performances_generation.json` (5,445,997 B; 23,210 per-question rows, 22 models, 25 date marks)
- **Path discovered** via the repository trees API, not guessed
- **Licence:** cited by URL with retrieval date
- **Note:** these 22 cells are the **only** records in the table tagged
  `verified_source_derived_value` — the source is first-party, but the aggregate per model was
  **computed by us**, not published by LiveCodeBench. The window substitution is disclosed
  (their final `date_mark` is empty because the feed ends 2025-04-07).
- **Authors:** the LiveCodeBench team (Jain et al.)

## 5. OpenAI — BrowseComp — 5 cells

- **URL:** `https://openai.com/index/browsecomp/`
- **Access note:** 200 via browser-style fetch, **403 to curl** (bot protection). Read verbatim.
- **Licence:** quoted, not redistributed wholesale
- **Includes a canary string**, which we do not reproduce
- **One number deliberately excluded:** the Deep Research model's 51.5%. OpenAI's own footnote
  states the model *"is trained on data that specifically teaches the model to be good at
  BrowseComp tasks."* That is training contamination; using it as a capability anchor would
  import the contamination into our own conclusions. Recorded as a 5th cell with
  `score: null` and the reason attached.
- **Authors:** OpenAI (Mirzakhani et al. for the benchmark)

## 6. Anthropic — relative claims only, no numbers

- **URL:** `https://www.anthropic.com/news/claude-opus-5`
- **Every benchmark result on the page is a chart image.** Only relative claims exist as text
  ("3×", "1.5×"). **We recorded no absolute score for Claude Opus 5.** Four relative claims are
  stored with `score: null` by design.
- **Licence:** quoted, not redistributed

## 7. Artificial Analysis — corroboration only, no values copied

- **URL:** `https://artificialanalysis.ai/evaluations/gpqa-diamond`
- Used to cross-check Epoch's GPQA Diamond top score (Epoch 95.77% for the top model vs AA 96.3%
  — 0.5 pt across two independent organisations). **No AA value was copied into the table.**

## 8. Aider Polyglot — control fetch

- `https://raw.githubusercontent.com/Aider-AI/aider/main/aider/website/_data/polyglot_leaderboard.yml`
- Fetched as a control; Epoch's copy was used for the table. Useful because Epoch's copy of this
  file stores accuracy on **0–100** while every other file uses 0–1 — the scale mismatch we caught
  (see below).

## 9. Papers used for definitions and claims

| work | used for |
|---|---|
| `arXiv:2406.12045` — Yao, Shinn, Razavi, Narasimhan, *τ-bench* | the `pass^k` reliability claim; final-database-state grading |
| `arXiv:2506.07982` — Barres, Dong, Ray, Si, Narasimhan, *τ²-bench* | the definition; results are 2025-vintage |
| Wei et al. 2024, *SimpleQA* | the F-score formula `F = 2c/(2c+2i+n)`, verified against 6/6 of their Table 3 values |
| HLE organisation results table | independent cross-check of Epoch's HLE re-administration |

## 10. Our own work

The harness, audit tool, item bank generator and verifier, statistical self-tests, matching
analysis, and all prose in this repository are ours and are licensed **CC BY 4.0** (see
[`../LICENSE`](../LICENSE)).

**The item bank is 84/88 programmatically generated** from a seeded generator
(`../harness/generate-items.mjs`) with every answer re-derived by a second, independently written
implementation (`../harness/verify-items.mjs`, 824 checks, 0 failures). 4 items are
hand-written canonical cases.

---

## Integrity findings in the source data

All four were found by **auditing** rather than by testing, and all four would have silently
corrupted a correlation. Recorded because they are the kind of thing that a reader reusing this
table will hit again.

| finding | consequence if unfixed | resolution |
|---|---|---|
| **Scale mismatch.** `aider_polyglot_external.csv` stores accuracy on 0–100; every other file uses 0–1 | Aider would look ~100× stronger than everything else | `DIVIDE_100` applied; every emitted row now carries an explicit `scale` field; range check passes with 0 violations |
| **Unit error.** METR Time Horizon is **minutes** (4.0 → 1,044.8), not a probability; the file also has a separate `average_score` (0–1) | correlating a duration against an accuracy column is meaningless | use `Time horizon` with `scale: "minutes (duration, NOT a probability)"` |
| **Name-universe collision.** Vendors and Epoch spell the same model differently (`Claude-Opus-4-5-20251101` vs `claude-opus-4-5`) | exact-match joins left **4** models with both a tool-calling and a reasoning score instead of 6; axis coverage would have looked like a data gap when it was a join failure | a **deterministic, auditable** normalisation rule (documented; 28 aliases and 12 multi-snapshot merges enumerated in `matching.json`). No edit distance, no hand-built alias list |
| **Effort suffixes encode the scaffold.** Model version strings carry `_none`, `_max`, `unknown`, `reasoning` etc. as reasoning-budget markers | group-by-`model` merges different scaffolds and double-weights 7 pairs that share a score | group by `model_version_raw`; scaffold treated as a bracket, not a name |

## Sources we refused

Full list with reasons in [`C1-sources.md`](C1-sources.md) §5. Summary:

- **Content-farm aggregators** (`llm-stats.com`, `benchlm.ai`, `agentguides.dev`, `iternal.ai`,
  `mungomash.com`, and others) — returned mutually contradictory model names and scores matching
  no first-party page. **Zero numbers taken.**
- **A claimed "GAIA Agents-A1-4B 95.1%"** — a 4B model leading a benchmark humans score 92% on is
  an artefact, not a result.
- **Any LMArena / Elo figure** — not fetched. **There is not one Elo number in this repository.**
- **τ²-bench's official result JSONs** — 22–37 MB of raw conversation traces with no summary
  field. Aggregating them ourselves would be a derivation, not a reported score. Recorded as a gap.
- **The Deep Research BrowseComp score** — training contamination by the source's own admission.
- **Claude Opus 5 absolute scores** — the vendor page renders every result as an image. Nothing
  was invented to fill the hole.
