# FINDINGS

Condensed result tables. The narrative, the reasoning behind each number, and the "what we got
wrong" material live in [`README.md`](README.md); the threats live in
[`LIMITATIONS.md`](LIMITATIONS.md).

Every table below is tagged. **`measured`** = we ran it. **`reported`** = read from a
first-party source, URL in `data/C1-sources.md`. **`derived`** = computed from those.
Machine-readable: `data/matching.json` (`measured`/`derived`),
`data/frontier-scores.json` (`reported`).

---

## 1. Subject headline — `opencode/space-bunny-free`

88 items × 2 repetitions = **176 runs**, all `measured`.

| denominator | n | correct | accuracy | Wilson 95% | half-width |
|---|---|---|---|---|---|
| `raw` (harness as shipped) | 176 | 153 | 86.93% | [81.15, 91.15] | 0.0499 |
| `conservative` | 174 | 161 | **92.53%** | [87.64, 95.58] | 0.0397 |
| `full` | 170 | 161 | **94.71%** | [90.25, 97.19] | 0.0347 |

Source: `data/matching.json` → `subject_profile.run_level`; narrative:
`reports/B3-qc-audit.md`, `reports/C2-matching-analysis.md` §1.1.

### Per category (adjudicated, full) — `measured`

| category | correct/n | accuracy | Wilson 95% | as-shipped | artifact flips |
|---|---|---|---|---|---|
| reasoning | 30/30 | 100% | [88.65, 100] | 100% | 0 |
| function_calling | 16/16 | 100% | [80.64, 100] | 100% | 0 |
| long_context | 14/14 | 100% | [78.47, 100] | 87.5% | 0 |
| format_control | 12/12 | 100% | [75.75, 100] | 75% | 0 |
| robustness | 12/12 | 100% | [75.75, 100] | 100% | 0 |
| abstention_hallucination | 12/12 | 100% | [75.75, 100] | **50%** | **6** |
| instruction_following | 27/28 | 96.43% | [82.29, 99.37] | 96.43% | 0 |
| multilingual | 25/30 | 83.33% | [66.44, 92.66] | 76.67% | 2 |
| code | 13/16 | 81.25% | [56.99, 93.41] | 81.25% | 0 |

**No category ranking is supportable.** Wilson half-widths run 0.10–0.31; the 100%-vs-81% gap
is 18.75 pp, smaller than the sampling error within one category.

## 2. Reliability and the never-measured pair — `measured`

| | value |
|---|---|
| attempts | 176 |
| failed attempts | 2 (both `lc-needle-08`) |
| reliability (as the harness computed it) | 98.9% |
| what actually happened | the **model was never called** — prompt 180,351 chars > Linux `MAX_ARG_STRLEN` 131,072 ⇒ synchronous `E2BIG` at `spawn` |
| items over the limit, of 88 | **1** (2nd longest: 120,454) |
| reproducibility | reproduced in a second independent round; marked non-retriable, so it will not self-heal |

The 2 runs are excluded from the denominator (R1), **not moved into a pass column**.

## 3. Anchors — `measured`

All on the identical 45-item stratified subset, **all adjudicated with the same rule set as the
subject**.

| | subject | `glm-5.3-flash` | `muse-spark-1.3` | `kimi-k3` | `gemini-flash-latest` |
|---|---|---|---|---|---|
| role | subject | headline anchor | headline anchor | appendix | appendix |
| raw (first attempt) | 86.93% | 77.78% | 91.11% | 61.90% | 0% |
| after adjudication | **94.71%** | **90.70%** | **97.67%** | **94.74%** | — |
| adjudication movement | **+7.77 pp** | **+12.92 pp** | **+6.56 pp** | **+32.83 pp** | — |
| why excluded from headline | — | — | — | reliability failure: 9 of 28 runs returned no text part, only 21 of 45 items ever reached | service unavailable: API error both runs, 0 of 45 attempted |

**Adjudication moved the anchors more than it moved the subject.** Auditing only the subject —
the obvious choice when the subject is under study — manufactures a 17-point gap and a false
"the subject beats every anchor" conclusion.

### Like-for-like, 43 shared scorable items — `measured`

| | `glm-5.3-flash` | `muse-spark-1.3` |
|---|---|---|
| anchor | 90.70% (39/43), Wilson [78.40, 96.32] | 97.67% (42/43), Wilson [87.94, 99.59] |
| subject — both reps correct (conservative) | 90.70% (39/43) | 90.70% (39/43) |
| subject — mean of 2 reps (unbiased) | 95.35% (41/43) | 95.35% (41/43) |
| subject — either rep correct (optimistic) | 100% (43/43) | 100% (43/43) |
| **gap, unbiased mean** | **+4.65 pp** | **−2.33 pp** |
| gap, conservative reading | 0.00 pp | −6.98 pp |
| gap, optimistic reading | +9.30 pp (p = 0.125) | +2.33 pp (p = 1.000) |
| McNemar b / c | 3 / 3 | 0 / 3 |
| **McNemar exact two-sided p** | **1.000** | **0.250** |
| vs. 7.37 pp floor | **inside — not resolvable** | **inside — not resolvable** |

The subject's item-level accuracy is a **9.3 pp wide range** (90.70 / 95.35 / 100), which is
**wider than the 6.98 pp difference between the two anchors.** The mean is reported because it
is the unbiased estimator, not because it is the only defensible one.

## 4. Reproducibility floor — `measured`

| | items with both reps | agree | rate | discordant | b | c | q | exact McNemar p |
|---|---|---|---|---|---|---|---|---|
| raw verdicts | 88 | 83 | 94.32% | 5 | 3 | 2 | 0.0568 | 1.000 |
| **adjudicated** | **85** | **80** | **94.12%** | **5** | **3** | **2** | **0.0588** | **1.000** |

Discordant items (adjudicated): `cod-anagram`, `ifr-words-6`, `ml-sum-zh` (wrong→right);
`ml-chain-ja`, `ml-reverse_sub-ja` (right→wrong).

| design | α | power | minimum detectable effect |
|---|---|---|---|
| paired (McNemar), 1 rep/item | .05 | .80 | **7.3701 pp** |
| paired, mean of 2 reps | .05 | .80 | **5.2114 pp** |

The pre-registered sample-size formula had assumed q = 0.20; the **measured** q = 0.0588 is
3.4× smaller, so the floor is better than the pessimistic guess — worth saying, because the
pessimistic number was a guess and this one is a measurement. `q` rests on 5 discordant items,
so treat the floor as **7.4 pp ± ~1 pp**.

**Consequence: a 5 pp claim was never available. The declared-effect rule holds at ≥ 10 pp.**
And the floor is *our harness's*, not the domain's: the same model on the same benchmark swings
4.24–43.64 pp when only the scaffold changes (§5), up to ~6× this floor.

## 5. Scaffold sensitivity of the frontier table — `reported`

Same model, same benchmark, **only the harness or thinking mode changed**. Every row read from
the first-party table named in it. Source: `reports/C1-frontier-scores.md` §3.

| benchmark | source | model | config A | config B | Δ |
|---|---|---|---|---|---|
| GAIA | HAL (Princeton) | Claude Sonnet 4.5 | HAL generalist **74.55%** | HF Open Deep Research **30.91%** | **+43.64 pp** |
| GAIA | HAL (Princeton) | Claude 3.7 Sonnet | HAL 56.36% | HF-ODR 36.97% | +19.39 pp |
| GAIA | HAL (Princeton) | Claude Opus 4 (May 2025) | HAL 64.85% | HF-ODR 57.58% | +7.27 pp |
| GAIA | HAL (Princeton) | **GPT-5 Medium** | HF-ODR **62.80%** | HAL 59.39% | **−3.41 pp** |
| GAIA | HAL (Princeton) | Claude Opus 4.1 | High 68.48% | unspecified 64.24% | +4.24 pp |
| BFCL V4 | Berkeley | GPT-5.2-2025-12-11 | native FC 55.87% | text-prompt 45.27% | +10.60 pp |
| BFCL V4 | Berkeley | Grok-4-1-fast | reasoning 69.57% | non-reasoning 58.29% | +11.28 pp |
| BFCL V4 | Berkeley | **Gemini-3-Pro-Preview** | native FC 68.14% | text-prompt **72.51%** | **−4.37 pp** |
| HLE | Epoch AI | gpt-5.1 | `thinking` 23.68% | `instant` 6.80% | +16.88 pp |
| HLE | Epoch AI | claude-opus-4-6 | `thinking-max` 34.44% | `Non-Thinking` 19.00% | +15.44 pp |
| GPQA Diamond | Epoch AI | gpt-5.6-luna | best effort 91.6% | lowest effort 63.6% | +28.0 pp |
| GPQA Diamond | Epoch AI | gpt-5.4-2026-03-05 | xhigh 93.3% | none 74.7% | +18.6 pp |

**The swing is not a constant** (−4.37 to +43.64 pp) **and it reverses sign.** No constant
correction factor exists. A frontier number identifies `(model × scaffold × reasoning budget ×
tool access)`, not a model.

## 6. Frontier matching — the answer — `derived`

Coverage: 1,711 reported cells → 240 model keys → **≥2 axes 119 · ≥3 axes 58 · ≥4 axes 6 ·
≥5 axes 0.**

**Structural floor.** A permutation test on k points has k! orderings, so the smallest
attainable two-sided p is `2/k!`:

| k | min attainable p | reachable at α = .05? |
|---|---|---|
| 3 | 0.3333 | no |
| **4** | **0.0833** | **no — for any n, any data quality** |
| 5 | 0.0167 | yes, but 0 models have 5 axes |

**Resolvable candidates at α = .05: 0.**

**Discriminating power** (band = 0.15; the abstention axis under convention (ii),
decline = not-attempted):

| axis | subject n | subject accuracy | Wilson half-width | models with data | **outside subject band** | discriminating? |
|---|---|---|---|---|---|---|
| reasoning | 15 | 1.000 | 0.102 | 114 | 26 | yes |
| code | 8 | 0.8125 | 0.224 | 97 | 4 | yes |
| function_calling | 8 | 1.000 | 0.162 | 25 | 8 | yes |
| abstention | 6 | 0.500 | 0.312 | 66 | **0** | **no — null axis** |

| statistic | value |
|---|---|
| models with ≥2 axes (candidates) | 119 |
| **fully consistent — in band on every live axis** | **86** |
| **straddlers — in band on some, outside on others** | **0** |
| subject above the band on all axes | 2 |
| discriminating axes | 3 of 4 |

Band sensitivity: at ±5 pp, 49 fully consistent / 23 above-all; at ±10 pp, 70 / 13; at ±15 pp,
86 / 2; at ±28 pp, 114 / 0. **Straddlers are 0 at every band width.** The profile shape that
"resembles" would need does not exist.

> **Verdict.** Within this round's precision the subject is **not distinguishable** from either
> measured anchor (+4.65 pp, p = 1.000; −2.33 pp, p = 0.250; both inside the 7.37 pp floor). And
> **no single frontier model can be named.** The supportable claim is a range: *the subject is
> consistent with the mid-to-upper region of the 2025–2026 frontier field and excludes nothing
> inside it.*

### The 4-axis corner is a coverage artefact, not a finding

All six 4-axis models are 2025-vintage and from two vendors (`gpt-4.1`, `gpt-4.1-mini`,
`gpt-4.1-nano`, `gpt-5-mini`, `claude-haiku-4-5`, `claude-sonnet-4-5`; released 2025-04-14 to
2025-10-15). The fourth axis is BFCL, **last updated 2026-04-12**, so 2026 flagships are absent
**by data staleness, not by weakness.** Reading that corner as "the subject resembles a 2025
mid-tier model" restates the fact that the instrument can only see that corner.

### Do not rank the "closest" models

Nearest candidates by centre distance: `gemini-2.5-pro-preview-03-25` 6.40 pp (2 axes),
`qwen3.6-max-preview` 7.32 pp (2 axes), `deepseek-r1-0528` 7.48 pp (2 axes), `kimi-k3` 12.77 pp
(3 axes), `claude-opus-4-8` 15.14 pp (3 axes), `gpt-5` 15.80 pp (3 axes). **Not a ranking:**
centre distances across different axis counts are not comparable, and the top three sit within
our own floor. The ordering is a product of axis count.

## 7. Latency and tokens — `measured`

| | end-to-end median | pure-model median | pre-model share |
|---|---|---|---|
| **subject** | 24,817 ms | **496 ms** | **93.33%** |
| `muse-spark-1.3` | 25,201 ms | 2,541 ms | 85.51% |
| `glm-5.3-flash` | 63,270 ms | 8,203 ms | 78.71% |
| `kimi-k3` | 78,544 ms | 2,933 ms | 98.03% |

**93% of the subject's wall time is process boot and provider queue, not inference.** End to
end, subject and `muse-spark-1.3` are indistinguishable (1.01×). Every TTFT figure is an
**upper bound** on true first-token time (`opencode run` emits no token deltas).

| counter | n | median | mean | p95 | max | total |
|---|---|---|---|---|---|---|
| prompt tokens | 174 | 18,539 | 20,063 | 34,129 | 57,060 | 3,491,015 |
| reasoning tokens | 174 | 79.5 | 131.5 | 526 | 1,200 | **22,876** |
| output tokens | 176 | 3 | 15.5 | 46 | 284 | 2,728 |
| cost | 176 | — | — | — | — | **0** (free tier) |

`token_source = mixed|char4`: the `ceil(chars/4)` proxy under-counts code and over-counts
Hangul/CJK, so multilingual output tokens are soft. **Cost is a billing fact, not an efficiency
result** — a cost-per-solved-task metric would be 0/0 and would read as "free is best".

## 8. Statistical integrity

| check | result | command |
|---|---|---|
| harness unit tests | 72 pass / 1 skipped (live smoke, needs a model) | `node --test harness/test/` |
| item bank: build + verify + byte-compare | 824 checks, 0 failures, exit 0 | `node harness/build-items.mjs --check` |
| analysis statistics | **234 checks, 0 failures**, exit 0 | `node harness/stat-verify.mjs` |
| formula self-tests | 0 failures, exit 0 | `node harness/psycho-verify.mjs` |
| adjudication, strict | exit 0 | `node harness/adjudicate.mjs --strict` |
| anchor adjudication + 176/176 self-check | PASSED, integrity 0, exit 0 | `node harness/adjudicate-anchors.mjs --strict` |

The statistical suite re-derives, from first principles, every number the analysis reports:
the three abstention conventions, the 2-rep mean and both gaps, the floor at the measured q, the
4-model correction asymmetry, `2/k!`, every McNemar exact p actually used, the `gap()`-returns-0
trap, and the latency unit error — asserting each of them.

## 9. The frontier table's own coverage — `derived`

Of 12 headline benchmarks, **5 have real 2026-frontier coverage**; the rest are honest gaps.

| benchmark | cells | distinct models | 2026 frontier? | source |
|---|---|---|---|---|
| GPQA Diamond | 231 | 140 | **yes** | Epoch AI |
| Terminal-Bench 4.0 | 195 | 42 | **yes** | Epoch AI |
| FrontierMath | 94 | 69 | **yes** | Epoch AI |
| SimpleQA Verified | 74 | 66 | **yes** | Epoch AI |
| HLE | 43 | 35 | **yes** | Epoch AI |
| BFCL V4 | 109 | 83 | no — stale | Berkeley |
| GAIA | 32 | 12 | no — stale | HAL (Princeton) |
| SWE-bench Verified | 34 | 31 | **yes** | Epoch AI |
| LiveCodeBench | 22 | 22 | no — stale (feed ends 2025-04-07) | LiveCodeBench official feed |
| BrowseComp | 5 | 4 | no — stale | OpenAI |
| **SWE-bench Multilingual** | **0** | 0 | **no data** | — |
| **τ-bench / τ²-bench** | **0** | 0 | **no data** | — |

Plus 872 cells from 15 further benchmarks in the same file (ARC-AGI-2 208, CritPt 152,
SciCode 147, DeepSWE 69, FrontierMath Tier 4 v2 61, MATH Level 5 55, Aider Polyglot 43,
METR Time Horizon 34, APEX-Agents 33, EBR-bench 23, OSWorld 2.0 17, FrontierSWE 13, GDPval 9,
FrontierMath Erdős 5, and 1 each for ARC-AGI 3 / Zapier AutomationBench / GDPval-AA v2).
**Total 1,711 cells across 27 benchmarks**; confidence: **1,685 first-party-verified · 22 derived
from a verified source · 4 relative-claim only · 0 recalled · 0 from aggregators.**

**Deliberately excluded, and why:**

- **Deep Research on BrowseComp, 51.5%.** OpenAI's own footnote states the model *"is trained on
  data that specifically teaches the model to be good at BrowseComp tasks."* The same page's
  runner-up scores 9.9%; a 5.7× ratio is explained by contamination, not capability.
- **Claude Opus 5 absolute scores.** Anthropic's official page renders **every** benchmark result
  as a chart image. Only relative claims ("3×", "1.5×") exist as text. **Nothing was invented to
  fill the hole.**
- **All aggregator numbers.** Content-farm leaderboards returning mutually contradictory model
  names and scores were rejected outright; five specific contradictions are listed in
  `data/C1-sources.md`.
- **LMArena / Elo.** Not fetched. **There is not one Elo number in this repository.**

### Cross-validation of the table

The strongest single piece of evidence that the Epoch-derived data is trustworthy: Epoch's
independent re-administration of HLE gives **GPT-5 25.32%** against the HLE organisation's own
table at **25.3%** — agreement to the printed digit. Gemini 3 Pro: 37.52% vs 38.3%.

### Data-integrity findings, from auditing rather than testing

- **Scale mismatch, caught.** One Epoch file stores accuracy on 0–100 while all others use 0–1.
  Unconverted, Aider polyglot would have looked ~100× stronger than everything else and
  corrupted any correlation. Fixed; every emitted row now carries an explicit `scale`.
- **Unit error, caught.** METR Time Horizon is **minutes** (4.0 → 1,044.8), not a probability.
  The first build read the wrong column and mislabelled the unit. A correlation against an
  accuracy column would have been meaningless.
- **Name-universe collision, caught.** Vendor spellings differ from Epoch's
  (`Claude-Opus-4-5-20251101` vs `claude-opus-4-5`). Exact-match joins left only 4 models with
  both a tool-calling score and a reasoning score. A deterministic normalisation rule
  (documented, 28 aliases enumerated, 12 multi-snapshot merges flagged) brought it to 6 —
  **otherwise axis coverage would have silently dropped to about a tenth and looked like a
  data gap.**
- **Guessed URLs were discarded rather than cited.** `data/C1-sources.md` §3 records all 14
  failed probes — 12 × 404, 1 × 403 (bot protection), 1 × 301 (repo moved) — and **none of them
  is cited anywhere** in `data/frontier-scores.json`. Every asserted URL returned HTTP 200 and
  was actually read on 2026-09-27.
