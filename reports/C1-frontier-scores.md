# C1 — Reported scores of frontier commercial models

**Agent:** C1 (Federation C / 상관·게시부) · **Date:** 2026-09-27 · **Machine-readable:** `data/frontier-scores.json` · **Sources:** `data/C1-sources.md`

> **Subject of the federation's measurement:** `opencode/space-bunny-free`. We **cannot run any paid frontier model**
> ourselves (gpt-5.x / claude-opus-5 / gemini-3-pro / grok-4.7 all return "Unexpected server error" — no API credits).
> Therefore **every number in this report was reported by somebody else, never measured by us.**

## 0. The one rule that governs this whole document

> **An agentic benchmark score is not a model property. It is a tuple of (model × scaffold × reasoning budget × tool access).**

Section 3 documents same-model score swings of **43.64pt** (GAIA), **16.88pt** (HLE) and **10.60pt** (BFCL) that are
*entirely* attributable to changing the scaffold or the thinking mode. Any matching exercise that treats a bare score
as a model attribute is measuring the harness, not the model.

## 1. Provenance rules I obeyed

| Trust tier | Source class | Used here |
|---|---|---|
| 1 | Vendor model card / lab blog | Yes — `vendor_self_report: true` (OpenAI BrowseComp, Anthropic Opus 5 claims) |
| 2 | Independent eval org | **Yes — the bulk.** Epoch AI hub, HAL (Princeton), BFCL (Berkeley), LiveCodeBench |
| 3 | arXiv paper | Yes — definitions + the τ-bench `pass^k` claim |
| 4 | Content-farm aggregator | **REJECTED. Zero numbers taken.** See `C1-sources.md` §5 |

**No URL in these deliverables was guessed.** Nine `raw.githubusercontent.com/` and `gorilla.cs.berkeley.edu/data_*.csv` paths I
probed returned 404 and were discarded rather than cited. Every asserted URL returned HTTP 200 and its content was
actually read on 2026-09-27.

## 2. Headline benchmark coverage — the honest picture

| # | Headline benchmark | Cells | Distinct models | Vendors | 2026 frontier models? | Source |
|---|---|---|---|---|---|---|
| 1 | GPQA Diamond | 231 | 140 | 13 | **yes** | Epoch AI |
| 2 | Humanity's Last Exam | 43 | 35 | 7 | **yes** | Epoch AI |
| 3 | FrontierMath | 94 | 69 | 10 | **yes** | Epoch AI |
| 4 | SWE-bench Verified | 34 | 31 | 7 | **yes** | Epoch AI |
| 5 | SWE-bench Multilingual | 0 | 0 | 0 | **NO DATA** | — none — |
| 6 | Terminal-Bench 4.0 | 195 | 42 | 8 | **yes** | Epoch AI |
| 7 | LiveCodeBench | 22 | 22 | 6 | no (stale) | LiveCodeBench official leaderboard DATA (derived by C1 from official per-question rows) |
| 8 | τ-bench / τ²-bench | 0 | 0 | 0 | **NO DATA** | — none — |
| 9 | BFCL V4 | 109 | 83 | 10 | no (stale) | Berkeley Function Calling Leaderboard (gorilla.cs.berkeley.edu) |
| 10 | GAIA | 32 | 12 | 4 | no (stale) | HAL: GAIA Leaderboard (Princeton) |
| 11 | SimpleQA | 74 | 66 | 10 | **yes** | Epoch AI |
| 12 | BrowseComp | 5 | 4 | 1 | no (stale) | OpenAI |

**Bottom line: 5 of the 12 headline benchmarks have real 2026-frontier coverage** (GPQA Diamond, HLE, FrontierMath,
SWE-bench Verified, SimpleQA Verified — all via the Epoch AI hub). **SWE-bench Multilingual and τ-bench/τ²-bench have no
2026 data at all.** LiveCodeBench, BFCL V4 and GAIA have data but are frozen at 2025 generations. Details in §6.

## 3. ⚠️ Scaffold swings — read this before C2 correlates anything

All numbers below were read directly from the first-party table named in the row. Same model, same benchmark,
**only the scaffold / thinking mode changed.**

| Benchmark | Source | Model | Configuration A | Configuration B | Δ | Direction |
|---|---|---|---|---|---|---|
| GAIA | HAL (Princeton) | Claude Sonnet 4.5 | HAL Generalist Agent **74.55%** | HF Open Deep Research **30.91%** | **43.64pt** | scaffold dominates |
| GAIA | HAL (Princeton) | Claude 3.7 Sonnet | HAL 56.36% | HF Open Deep Research 36.97% | 19.39pt | scaffold dominates |
| GAIA | HAL (Princeton) | Claude Opus 4 (May 2025) | HAL 64.85% | HF Open Deep Research 57.58% | 7.27pt | scaffold dominates |
| GAIA | HAL (Princeton) | **GPT-5 Medium** | HF Open Deep Research **62.80%** | HAL **59.39%** | −3.41pt | **reversed** |
| GAIA | HAL (Princeton) | Claude Opus 4.1 | High 68.48% | unspecified 64.24% | 4.24pt | reasoning budget |
| BFCL V4 | Berkeley | GPT-5.2-2025-12-11 | native tool calling 55.87% | text-prompt 45.27% | 10.60pt | FC wins |
| BFCL V4 | Berkeley | Grok-4-1-fast | reasoning 69.57% | non-reasoning 58.29% | 11.28pt | thinking wins |
| BFCL V4 | Berkeley | **Gemini-3-Pro-Preview** | native tool calling 68.14% | text-prompt **72.51%** | −4.37pt | **reversed** |
| HLE | Epoch AI | gpt-5.1 | `gpt-5.1-thinking` 23.68% | `gpt-5.1-instant` 6.80% | 16.88pt | thinking wins |
| HLE | Epoch AI | claude-opus-4-6 | `thinking-max` 34.44% | `Non-Thinking` 19.00% | 15.44pt | thinking wins |
| GPQA Diamond | Epoch AI | gpt-5.6-luna | best effort 91.6% | lowest effort 63.6% | 28.0pt | reasoning budget |
| GPQA Diamond | Epoch AI | gpt-5.4-2026-03-05 | xhigh 93.3% | none 74.7% | 18.6pt | reasoning budget |

**Four consequences for the federation:**

1. **The swing is not a constant.** It ranges from −3.41pt to +43.64pt, and *reverses sign* for two models. A single
   "scaffold correction factor" would be wrong.
2. **GAIA spread (43.6pt) is ~6× a generational model gap.** Peer A1 flagged the 7.27pt Opus-4 case; the Sonnet-4.5 case is
   six times larger. A model's GAIA number identifies the *agent* more than the *model*.
3. **Reasoning budget alone is worth 15–28pt on HLE/GPQA.** Any single measured value for our subject sits inside a band
   that wide. Matching to a specific frontier row is only meaningful if the reasoning budget is matched too.
4. **Native tool-calling is not uniformly better** (Gemini 3 Pro loses 4.37pt with it). "Agentic score" is not one axis.

## 4. Per-benchmark tables

Scores are the source's own value. `effort` = reasoning budget where the source exposes it. `source` = who published it.
Every row is `verified` unless the "confidence" column says otherwise.

### GPQA Diamond

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 231 (231 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| gpt-6-astra | OpenAI | max | **95.77%** | reasoning_effort=max | verified |
| gemini-3.8-flash | Google | high | **95.39%** | reasoning_effort=high | verified |
| gemini-3.7-flash | Google | high | **94.82%** | reasoning_effort=high | verified |
| gpt-5.4-pro-2026-03-05 | OpenAI | xhigh | **94.60%** | reasoning_effort=xhigh | verified |
| gemini-3.1-pro-preview | Google | high | **94.44%** | reasoning_effort=high | verified |
| gemini-3.6-flash | Google | high | **94.13%** | reasoning_effort=high | verified |
| gemini-3.1-pro-preview | Google | — | **94.10%** | reasoning_effort=unspecified | verified |
| grok-4.6 | xAI | high | **94.00%** | reasoning_effort=high | verified |
| gpt-5.5-pre-release | OpenAI | xhigh | **94.00%** | reasoning_effort=xhigh | verified |
| gpt-5.5-pro-pre-release | OpenAI | xhigh | **93.92%** | reasoning_effort=xhigh | verified |
| claude-opus-5 | Anthropic | max | **93.88%** | reasoning_effort=max | verified |
| gpt-5.6-sol | OpenAI | max | **93.50%** | reasoning_effort=max | verified |
| grok-4.5 | xAI | high | **93.43%** | reasoning_effort=high | verified |
| gpt-5.6-terra | OpenAI | max | **93.31%** | reasoning_effort=max | verified |
| gpt-5.4-2026-03-05 | OpenAI | xhigh | **93.30%** | reasoning_effort=xhigh | verified |
| grok-4.6 | xAI | xhigh | **93.18%** | reasoning_effort=xhigh | verified |
| kimi-k3 | Moonshot | max | **93.12%** | reasoning_effort=max | verified |
| claude-opus-5 | Anthropic | — | **92.93%** | reasoning_effort=unspecified | verified |
| gemini-3.5-flash | Google | high | **92.80%** | reasoning_effort=high | verified |
| qwen3.8-max | Alibaba | xhigh | **92.68%** | reasoning_effort=xhigh | verified |
| gemini-3-pro-preview | Google | — | **92.61%** | reasoning_effort=unspecified | verified |
| qwen3.8-max-0902 | Alibaba | xhigh | **92.30%** | reasoning_effort=xhigh | verified |

### Humanity's Last Exam

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 43 (43 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| gpt-6-astra | OpenAI | unknown | **54.80%** | GPT 6 Astra | verified |
| claude-fable-5-1 | Anthropic | xhigh | **46.50%** | Fable 5.1 (xhigh) | verified |
| gemini-3.1-pro-preview | Google | — | **46.44%** | Gemini 3.1 Pro Preview (thinking high) | verified |
| gemini-3.8-flash | Google | unknown | **44.52%** | Gemini 3.8 Flash | verified |
| gpt-5.4-pro-2026-03-05 | OpenAI | unknown | **44.32%** | GPT-5.4 Pro | verified |
| muse-spark | Meta | — | **40.56%** | Muse Spark | verified |
| gemini-3-pro-preview | Google | — | **37.52%** | gemini-3-pro-preview | verified |
| gpt-5.4-2026-03-05 | OpenAI | xhigh | **36.24%** | gpt-5.4-2026-03-05 (xhigh thinking) | verified |
| claude-opus-4-7 | Anthropic | unknown | **36.20%** | Claude Opus 4.7 | verified |
| claude-opus-4-6 | Anthropic | max | **34.44%** | claude-opus-4-6-thinking-max | verified |
| gpt-5-pro-2025-10-06 | OpenAI | unknown | **31.64%** | gpt-5-pro-2025-10-06 | verified |
| gpt-5.2-2025-12-11 | OpenAI | unknown | **27.80%** | gpt-5.2-2025-12-11 | verified |
| gpt-5-2025-08-07 | OpenAI | high | **25.32%** | gpt-5-2025-08-07 | verified |
| gpt-5-2025-08-07 | OpenAI | unknown | **25.32%** | gpt-5-2025-08-07 | verified |
| claude-opus-4-5-20251101 | Anthropic | unknown | **25.20%** | claude-opus-4-5-20251101-thinking | verified |
| kimi-k2.5 | Moonshot | — | **24.37%** | kimi-k2.5 | verified |
| gpt-5.1-2025-11-13 | OpenAI | unknown | **23.68%** | gpt-5.1-thinking | verified |
| gemini-2.5-pro-preview-06-05 | Google | — | **21.64%** | gemini-2.5-pro-preview-06-05 | verified |
| gpt-5-mini-2025-08-07 | OpenAI | unknown | **19.44%** | gpt-5-mini-2025-08-07 | verified |
| claude-opus-4-6 | Anthropic | — | **19.00%** | claude-opus-4-6 (Non-Thinking) | verified |
| gemini-2.5-pro-exp-03-25 | Google | — | **18.16%** | Gemini 2.5 Pro Experimental (March 2025) | verified |
| gemini-2.5-pro-preview-05-06 | Google | — | **17.80%** | Gemini 2.5 Pro Preview (May 06 2025) | verified |

### FrontierMath Tiers 1-3 v2

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 94 (94 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| gpt-6-astra | OpenAI | max | **93.68%** | reasoning_effort=max | verified |
| claude-fable-5-1 | Anthropic | max | **90.18%** | reasoning_effort=max | verified |
| gpt-5.6-sol | OpenAI | max | **89.12%** | reasoning_effort=max | verified |
| gpt-5.5-pro | OpenAI | xhigh | **87.72%** | reasoning_effort=xhigh | verified |
| claude-fable-5 | Anthropic | max | **87.02%** | reasoning_effort=max | verified |
| gpt-5.6-terra | OpenAI | max | **85.96%** | reasoning_effort=max | verified |
| claude-opus-5 | Anthropic | max | **85.61%** | reasoning_effort=max | verified |
| gpt-5.5 | OpenAI | xhigh | **85.26%** | reasoning_effort=xhigh | verified |
| gpt-5.4-pro-2026-03-05 | OpenAI | xhigh | **82.46%** | reasoning_effort=xhigh | verified |
| gpt-5.6-luna | OpenAI | max | **82.11%** | reasoning_effort=max | verified |
| claude-opus-4-8 | Anthropic | max | **80.00%** | reasoning_effort=max | verified |
| gpt-5.4-2026-03-05 | OpenAI | xhigh | **78.60%** | reasoning_effort=xhigh | verified |
| qwen3.8-max | Alibaba | xhigh | **74.74%** | reasoning_effort=xhigh | verified |
| muse-spark-1.3 | Meta | xhigh | **74.39%** | reasoning_effort=xhigh | verified |
| muse-spark-1.3 | Meta | max | **74.04%** | reasoning_effort=max | verified |
| gpt-5.2-pro-2025-12-11 | OpenAI | xhigh | **74.00%** | reasoning_effort=xhigh | verified |
| kimi-k3 | Moonshot | max | **72.18%** | reasoning_effort=max | verified |
| gemini-3.7-flash | Google | high | **71.58%** | reasoning_effort=high | verified |
| claude-opus-4-7 | Anthropic | max | **70.18%** | reasoning_effort=max | verified |
| glm-5.3 | Zhipu | max | **68.77%** | reasoning_effort=max | verified |
| gemini-3.8-flash | Google | high | **68.42%** | reasoning_effort=high | verified |
| gpt-5.2-2025-12-11 | OpenAI | xhigh | **67.40%** | reasoning_effort=xhigh | verified |

### FrontierMath Tier 4 v2

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 61 (61 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| gpt-6-astra | OpenAI | high | **97.60%** | reasoning_effort=high | verified |
| gpt-6-astra | OpenAI | xhigh | **97.60%** | reasoning_effort=xhigh | verified |
| gpt-6-astra | OpenAI | max | **97.60%** | reasoning_effort=max | verified |
| gpt-6-astra | OpenAI | medium | **97.56%** | reasoning_effort=medium | verified |
| claude-fable-5 | Anthropic | max | **90.20%** | reasoning_effort=max | verified |
| claude-fable-5-1 | Anthropic | max | **87.80%** | reasoning_effort=max | verified |
| gpt-6-astra | OpenAI | low | **87.80%** | reasoning_effort=low | verified |
| gpt-6-astra | OpenAI | none | **82.93%** | reasoning_effort=none | verified |
| gpt-5.6-sol | OpenAI | max | **82.93%** | reasoning_effort=max | verified |
| gpt-5.6-sol | OpenAI | promax | **80.49%** | reasoning_effort=promax | verified |
| gpt-5.5-pro | OpenAI | xhigh | **78.05%** | reasoning_effort=xhigh | verified |
| claude-opus-5 | Anthropic | max | **73.17%** | reasoning_effort=max | verified |
| gpt-5.5 | OpenAI | xhigh | **72.50%** | reasoning_effort=xhigh | verified |
| gpt-5.6-terra | OpenAI | max | **70.73%** | reasoning_effort=max | verified |
| gpt-5.6-luna | OpenAI | max | **60.98%** | reasoning_effort=max | verified |
| gpt-5.4-pro-2026-03-05 | OpenAI | xhigh | **58.54%** | reasoning_effort=xhigh | verified |
| claude-opus-4-8 | Anthropic | max | **56.10%** | reasoning_effort=max | verified |
| gpt-5.4-2026-03-05 | OpenAI | xhigh | **49.00%** | reasoning_effort=xhigh | verified |
| muse-spark-1.3 | Meta | max | **46.34%** | reasoning_effort=max | verified |
| qwen3.8-max | Alibaba | xhigh | **46.34%** | reasoning_effort=xhigh | verified |
| gpt-5.2-pro-2025-12-11 | OpenAI | xhigh | **46.00%** | reasoning_effort=xhigh | verified |
| muse-spark-1.3 | Meta | xhigh | **41.46%** | reasoning_effort=xhigh | verified |

### FrontierMath Erdos

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 5 (5 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| gpt-6-astra | OpenAI | max | **2.94%** | reasoning_effort=max | verified |
| claude-fable-5-1 | Anthropic | max | **0.00%** | reasoning_effort=max | verified |
| gpt-5.5 | OpenAI | xhigh | **0.00%** | reasoning_effort=xhigh | verified |
| claude-fable-5 | Anthropic | max | **0.00%** | reasoning_effort=max | verified |
| gpt-5.6-sol | OpenAI | max | **0.00%** | reasoning_effort=max | verified |

### SWE-bench Verified

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 34 (34 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| claude-opus-4-7 | Anthropic | max | **83.47%** | reasoning_effort=max | verified |
| gpt-5.5-pre-release | OpenAI | xhigh | **80.58%** | reasoning_effort=xhigh | verified |
| gemini-3.5-flash | Google | high | **79.34%** | reasoning_effort=high | verified |
| claude-opus-4-6 | Anthropic | — | **78.72%** | reasoning_effort=unspecified | verified |
| glm-5.2 | Zhipu | max | **78.70%** | reasoning_effort=max | verified |
| deepseek-v4-pro | DeepSeek | max | **77.64%** | reasoning_effort=max | verified |
| qwen3.7-max | Alibaba | — | **77.27%** | reasoning_effort=unspecified | verified |
| gpt-5.4-2026-03-05 | OpenAI | high | **76.86%** | reasoning_effort=high | verified |
| qwen3.6-max-preview | Alibaba | — | **76.65%** | reasoning_effort=unspecified | verified |
| kimi-k2.6 | Moonshot | — | **76.65%** | reasoning_effort=unspecified | verified |
| claude-opus-4-5-20251101 | Anthropic | — | **76.65%** | reasoning_effort=unspecified | verified |
| gemini-3.1-pro-preview-customtools | Google | — | **75.62%** | reasoning_effort=unspecified | verified |
| claude-opus-4-6 | Anthropic | — | **75.62%** | reasoning_effort=unspecified | verified |
| gemini-3-flash-preview | Google | — | **75.41%** | reasoning_effort=unspecified | verified |
| claude-sonnet-4-6 | Anthropic | — | **75.21%** | reasoning_effort=unspecified | verified |
| gpt-5.3-codex | OpenAI | high | **74.79%** | reasoning_effort=high | verified |
| glm-5.1 | Zhipu | — | **74.17%** | reasoning_effort=unspecified | verified |
| kimi-k2.5 | Moonshot | — | **73.76%** | reasoning_effort=unspecified | verified |
| gpt-5.2-2025-12-11 | OpenAI | high | **73.76%** | reasoning_effort=high | verified |
| gpt-5-2025-08-07 | OpenAI | high | **73.55%** | reasoning_effort=high | verified |
| claude-opus-4-1-20250805 | Anthropic | — | **73.35%** | reasoning_effort=unspecified | verified |
| gemini-3-pro-preview | Google | — | **72.93%** | reasoning_effort=unspecified | verified |

### SimpleQA Verified

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 74 (74 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| gpt-6-astra | OpenAI | max | **75.60%** | reasoning_effort=max | verified |
| gemini-3.1-pro-preview | Google | high | **73.50%** | reasoning_effort=high | verified |
| claude-fable-5-1 | Anthropic | max | **70.80%** | reasoning_effort=max | verified |
| claude-fable-5 | Anthropic | xhigh | **70.70%** | reasoning_effort=xhigh | verified |
| gemini-3.8-flash | Google | high | **69.70%** | reasoning_effort=high | verified |
| gpt-5.6-sol | OpenAI | max | **69.70%** | reasoning_effort=max | verified |
| gemini-3.7-flash | Google | high | **69.20%** | reasoning_effort=high | verified |
| gemini-3-flash-preview | Google | high | **66.80%** | reasoning_effort=high | verified |
| gemini-3.5-flash | Google | high | **66.20%** | reasoning_effort=high | verified |
| gemini-3.6-flash | Google | high | **66.20%** | reasoning_effort=high | verified |
| gpt-5.5 | OpenAI | xhigh | **63.00%** | reasoning_effort=xhigh | verified |
| muse-spark-1.2 | Meta | xhigh | **60.30%** | reasoning_effort=xhigh | verified |
| claude-opus-5 | Anthropic | max | **59.90%** | reasoning_effort=max | verified |
| muse-spark-1.1 | Meta | — | **57.79%** | reasoning_effort=unspecified | verified |
| qwen3.7-max | Alibaba | — | **55.77%** | reasoning_effort=unspecified | verified |
| claude-opus-4-8 | Anthropic | max | **53.00%** | reasoning_effort=max | verified |
| deepseek-v4-pro-0813 | DeepSeek | max | **52.91%** | reasoning_effort=max | verified |
| qwen3.6-max-preview | Alibaba | — | **52.00%** | reasoning_effort=unspecified | verified |
| claude-opus-4-7 | Anthropic | xhigh | **51.70%** | reasoning_effort=xhigh | verified |
| kimi-k3 | Moonshot | max | **50.60%** | reasoning_effort=max | verified |
| gpt-5-2025-08-07 | OpenAI | high | **50.10%** | reasoning_effort=high | verified |
| grok-4.6 | xAI | high | **49.30%** | reasoning_effort=high | verified |

### Terminal-Bench

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 195 (195 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| gpt-5.5 | OpenAI | unknown | **84.72%** | GPT-5.5 | Agent=NexAU-AHE | verified |
| gpt-5.5 | OpenAI | unknown | **83.15%** | GPT-5.5 | Agent=Capy | verified |
| gpt-5.5 | OpenAI | unknown | **82.25%** | GPT-5.5 | Agent=Codex CLI | verified |
| gpt-5.5 | OpenAI | unknown | **82.00%** | GPT-5.5 | Agent=Codex | verified |
| gpt-5.4-2026-03-05 | OpenAI | unknown | **81.80%** | GPT-5.4 | Agent=ForgeCode | verified |
| gemini-3.1-pro-preview | Google | — | **80.22%** | Gemini 3.1 Pro | Agent=TongAgents | verified |
| claude-opus-4-7 | Anthropic | unknown | **80.22%** | Claude Opus 4.7 | Agent=WOZCODE | verified |
| claude-opus-4-6 | Anthropic | unknown | **79.80%** | Claude Opus 4.6 | Agent=ForgeCode | verified |
| gpt-5.3-codex | OpenAI | — | **78.43%** | GPT-5.3-Codex | Agent=SageAgent | verified |
| gemini-3.1-pro-preview | Google | — | **78.40%** | Agent=Forge Code | verified |
| gemini-3.1-pro-preview | Google | — | **78.40%** | Gemini 3.1 Pro | Agent=ForgeCode | verified |
| gpt-5.3-codex | OpenAI | — | **77.30%** | GPT-5.3-Codex | Agent=Droid | verified |
| claude-opus-4-6 | Anthropic | unknown | **76.40%** | Claude Opus 4.6 | Agent=Meta-Harness | verified |
| gpt-5.3-codex | OpenAI | — | **75.84%** | GPT-5.3-Codex | Agent=CodeBrain-1.5 | verified |
| gpt-5.3-codex | OpenAI | — | **75.73%** | GPT-5.3-Codex | Agent=Codelia | verified |
| claude-opus-4-6 | Anthropic | unknown | **75.28%** | Claude Opus 4.6 | Agent=Capy | verified |
| gpt-5.3-codex | OpenAI | — | **75.06%** | GPT-5.3-Codex | Agent=Simple Codex | verified |
| gemini-3.1-pro-preview | Google | — | **74.83%** | Gemini 3.1 Pro | Agent=Terminus-KIRA | verified |
| claude-opus-4-6 | Anthropic | unknown | **74.72%** | Claude Opus 4.6 | Agent=Terminus-KIRA | verified |
| gpt-5.3-codex | OpenAI | — | **74.61%** | GPT-5.3-Codex | Agent=Mux | verified |
| claude-opus-4-6 | Anthropic | unknown | **72.08%** | Claude 4.6 Opus | Agent=MAYA-V2 | verified |
| claude-opus-4-6 | Anthropic | unknown | **71.91%** | Claude Opus 4.6 | Agent=TongAgents | verified |

### GAIA (public validation set, 165 questions)

**Source:** HAL: GAIA Leaderboard (Princeton)  
**URL:** https://hal.cs.princeton.edu/gaia  
**Retrieved:** 2026-09-27  
**Cells:** 32 (32 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| Claude Sonnet 4.5 | Anthropic | — | **74.55%** | HAL Generalist Agent Pareto optimal | HAL reasoning budget: 1024=low, 2048=medium, 4096=hi | verified |
| Claude Sonnet 4.5 | Anthropic | high | **70.91%** | HAL Generalist Agent | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page he | verified |
| Claude Opus 4.1 | Anthropic | high | **68.48%** | HAL Generalist Agent | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page he | verified |
| Claude Opus 4 | Anthropic | high | **64.85%** | HAL Generalist Agent | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page he | verified |
| Claude-3.7 Sonnet | Anthropic | high | **64.24%** | HAL Generalist Agent | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page he | verified |
| Claude Opus 4.1 | Anthropic | — | **64.24%** | HAL Generalist Agent | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page he | verified |
| GPT-5 | OpenAI | medium | **62.80%** | HF Open Deep Research | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page h | verified |
| GPT-5 | OpenAI | medium | **59.39%** | HAL Generalist Agent | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page he | verified |
| o4-mini | OpenAI | low | **58.18%** | HAL Generalist Agent Pareto optimal | HAL reasoning budget: 1024=low, 2048=medium, 4096=hi | verified |
| Claude Opus 4 | Anthropic | — | **57.58%** | HF Open Deep Research | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page h | verified |
| Claude-3.7 Sonnet | Anthropic | — | **56.36%** | HAL Generalist Agent | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page he | verified |
| Claude Haiku 4.5 | Anthropic | — | **56.36%** | HAL Generalist Agent | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page he | verified |
| o4-mini | OpenAI | high | **55.76%** | HF Open Deep Research | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page h | verified |
| o4-mini | OpenAI | high | **54.55%** | HAL Generalist Agent Pareto optimal | HAL reasoning budget: 1024=low, 2048=medium, 4096=hi | verified |
| GPT-4.1 | OpenAI | — | **50.30%** | HF Open Deep Research | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page h | verified |
| GPT-4.1 | OpenAI | — | **49.70%** | HAL Generalist Agent | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page he | verified |
| o4-mini | OpenAI | low | **47.88%** | HF Open Deep Research | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page h | verified |
| Claude-3.7 Sonnet | Anthropic | — | **36.97%** | HF Open Deep Research | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page h | verified |
| Claude-3.7 Sonnet | Anthropic | high | **35.76%** | HF Open Deep Research | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page h | verified |
| Gemini 2.0 Flash | Google | — | **32.73%** | HAL Generalist Agent Pareto optimal | HAL reasoning budget: 1024=low, 2048=medium, 4096=hi | verified |
| o3 | OpenAI | medium | **32.73%** | HF Open Deep Research | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page h | verified |
| Claude Sonnet 4.5 | Anthropic | — | **30.91%** | HF Open Deep Research | HAL reasoning budget: 1024=low, 2048=medium, 4096=high (per page h | verified |

### BFCL V4 (Berkeley Function Calling Leaderboard V4)

**Source:** Berkeley Function Calling Leaderboard (gorilla.cs.berkeley.edu)  
**URL:** https://gorilla.cs.berkeley.edu/data_overall.csv  
**Retrieved:** 2026-09-27  
**Cells:** 109 (109 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| Claude-Opus-4-5-20251101 | Anthropic | — | **77.47%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| Claude-Sonnet-4-5-20250929 | Anthropic | — | **73.24%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| Gemini-3-Pro-Preview | Google | — | **72.51%** | text-prompt workaround (Prompt) | non-live AST, live, multi-turn, web-search, memory sub-c | verified |
| GLM-4.6 (FC thinking) | Zhipu | reasoning | **72.38%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| Grok-4-1-fast-reasoning | xAI | reasoning | **69.57%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| Claude-Haiku-4-5-20251001 | Anthropic | — | **68.70%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| Gemini-3-Pro-Preview | Google | — | **68.14%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| o3-2025-04-16 | OpenAI | — | **63.05%** | text-prompt workaround (Prompt) | non-live AST, live, multi-turn, web-search, memory sub-c | verified |
| Grok-4-0709 | xAI | — | **62.97%** | text-prompt workaround (Prompt) | non-live AST, live, multi-turn, web-search, memory sub-c | verified |
| Grok-4-0709 | xAI | — | **61.38%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| Moonshotai-Kimi-K2-Instruct | Moonshot | — | **59.06%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| Grok-4-1-fast-non-reasoning | xAI | reasoning | **58.29%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| Command A Reasoning | other | reasoning | **57.06%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| DeepSeek-V3.2-Exp | DeepSeek | reasoning | **56.73%** | text-prompt workaround (Prompt) | non-live AST, live, multi-turn, web-search, memory sub-c | verified |
| Gemini-2.5-Flash | Google | — | **56.24%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| GPT-5.2-2025-12-11 | OpenAI | — | **55.87%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| GPT-5-mini-2025-08-07 | OpenAI | — | **55.46%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| xLAM-2-32b-fc-r | other | — | **54.66%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| DeepSeek-V3.2-Exp | DeepSeek | — | **54.12%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| GPT-4.1-2025-04-14 | OpenAI | — | **53.96%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| o4-mini-2025-04-16 | OpenAI | — | **53.24%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |
| xLAM-2-70b-fc-r | other | — | **53.07%** | native function calling (FC) | non-live AST, live, multi-turn, web-search, memory sub-cate | verified |

### BrowseComp (1,266 problems)

**Source:** OpenAI — "BrowseComp: a benchmark for browsing agents" (2025-04-10)  
**URL:** https://openai.com/index/browsecomp/  
**Retrieved:** 2026-09-27  
**Cells:** 5 (5 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| Deep Research (OpenAI) | OpenAI | — | **51.50%** | agentic deep-research model, single attempt | verified |
| OpenAI o1 | OpenAI | — | **9.90%** | no browsing (medium effort) | verified |
| GPT-4o | OpenAI | — | **1.90%** | with web browsing tool | verified |
| GPT-4.5 | OpenAI | — | **0.90%** | no browsing | verified |
| GPT-4o | OpenAI | — | **0.60%** | no browsing | verified |

### LiveCodeBench (code generation, pass@1)

**Source:** LiveCodeBench official leaderboard DATA (derived by C1 from official per-question rows)  
**URL:** https://raw.githubusercontent.com/livecodebench/livecodebench.github.io/main/src/mocks/performances_generation.json  
**Retrieved:** 2026-09-27  
**Cells:** 22 (22 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| DeepSeek-R1-0528 | other | — | **88.25%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| O4-Mini (High) | OpenAI | — | **81.08%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| O3 (High) | OpenAI | — | **76.10%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| O4-Mini (Medium) | OpenAI | — | **75.50%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| Gemini-2.5-Pro-05-06 | Google | — | **73.11%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| O3-Mini-2025-01-31 (High) | OpenAI | — | **68.92%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| Grok-3-Mini (High) | xAI | — | **67.93%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| Qwen3-235B-A22B | Alibaba | — | **67.53%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| O4-Mini (Low) | OpenAI | — | **66.73%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| O3-Mini-2025-01-31 (Med) | OpenAI | — | **64.34%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| Gemini-2.5-Flash-Preview | Google | — | **61.95%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| O3-Mini-2025-01-31 (Low) | OpenAI | — | **58.57%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| Claude-Opus-4 (Thinking) | Anthropic | — | **58.37%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| Claude-Sonnet-4 (Thinking) | Anthropic | — | **56.97%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| Claude-Opus-4 | Anthropic | — | **48.41%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| Claude-Sonnet-4 | Anthropic | — | **48.41%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| Claude-3.5-Sonnet-20241022 | Anthropic | — | **41.43%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| GPT-4O-2024-08-06 | OpenAI | — | **39.44%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| DeepSeek-V3 | other | — | **37.85%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| GPT-4-Turbo-2024-04-09 | OpenAI | — | **37.85%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| GPT-4O-mini-2024-07-18 | OpenAI | — | **34.46%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |
| Claude-3-Haiku | Anthropic | — | **23.51%** | window 2024-07-01 -> 2025-04-07 (last ~9 contiguous months of the official feed; LiveCodeB | verified_source_derived_value |

### DeepSWE

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 69 (69 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| gpt-6-astra | OpenAI | xhigh | **74.12%** | gpt-6-astra (xhigh) | Harness=mini-swe-agent | Reasoning effort=xhigh | verified |
| gemini-3.8-flash | Google | high | **73.83%** | gemini-3-8-flash (high) | Harness=mini-swe-agent | Reasoning effort=high | verified |
| claude-opus-5 | Anthropic | max | **73.65%** | claude-opus-5 (max) | Harness=mini-swe-agent | Reasoning effort=max | verified |
| gpt-6-astra | OpenAI | high | **73.23%** | gpt-6-astra (high) | Harness=mini-swe-agent | Reasoning effort=high | verified |
| gpt-6-astra | OpenAI | max | **73.23%** | gpt-6-astra (max) | Harness=mini-swe-agent | Reasoning effort=max | verified |
| claude-opus-5 | Anthropic | xhigh | **73.15%** | claude-opus-5 (xhigh) | Harness=mini-swe-agent | Reasoning effort=xhigh | verified |
| claude-opus-5 | Anthropic | high | **72.83%** | claude-opus-5 (high) | Harness=mini-swe-agent | Reasoning effort=high | verified |
| gpt-6-astra | OpenAI | medium | **72.79%** | gpt-6-astra (medium) | Harness=mini-swe-agent | Reasoning effort=medium | verified |
| gpt-5.6-sol | OpenAI | max | **72.67%** | gpt-5-6-sol (max) | Harness=mini-swe-agent | Reasoning effort=max | verified |
| gemini-3.8-flash | Google | medium | **71.02%** | gemini-3-8-flash (medium) | Harness=mini-swe-agent | Reasoning effort=medium | verified |
| gpt-5.6-sol | OpenAI | xhigh | **70.73%** | gpt-5-6-sol (xhigh) | Harness=mini-swe-agent | Reasoning effort=xhigh | verified |
| claude-fable-5 | Anthropic | xhigh | **69.91%** | claude-fable-5 (xhigh) | Harness=mini-swe-agent | Reasoning effort=xhigh | verified |
| claude-fable-5 | Anthropic | max | **69.72%** | claude-fable-5 (max) | Harness=mini-swe-agent | Reasoning effort=max | verified |
| gpt-5.6-terra | OpenAI | max | **69.62%** | gpt-5-6-terra (max) | Harness=mini-swe-agent | Reasoning effort=max | verified |
| gpt-5.6-sol | OpenAI | high | **69.40%** | gpt-5-6-sol (high) | Harness=mini-swe-agent | Reasoning effort=high | verified |
| glm-5.3 | Zhipu | max | **68.96%** | glm-5-3 (max) | Harness=mini-swe-agent | Reasoning effort=max | verified |
| claude-opus-5 | Anthropic | medium | **68.90%** | claude-opus-5 (medium) | Harness=mini-swe-agent | Reasoning effort=medium | verified |
| claude-fable-5 | Anthropic | high | **68.60%** | claude-fable-5 (high) | Harness=mini-swe-agent | Reasoning effort=high | verified |
| kimi-k3 | Moonshot | max | **68.51%** | kimi-k3 (max) | Harness=mini-swe-agent | Reasoning effort=max | verified |
| grok-4.6 | xAI | medium | **67.48%** | grok-4-6 (medium) | Harness=mini-swe-agent | Reasoning effort=medium | verified |
| gpt-5.6-luna | OpenAI | max | **67.19%** | gpt-5-6-luna (max) | Harness=mini-swe-agent | Reasoning effort=max | verified |
| gpt-5.5 | OpenAI | xhigh | **67.04%** | gpt-5-5 (xhigh) | Harness=mini-swe-agent | Reasoning effort=xhigh | verified |

### Aider Polyglot

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 43 (43 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| gpt-5-2025-08-07 | OpenAI | high | **88.00%** | reasoning_effort=high | verified |
| gpt-5-2025-08-07 | OpenAI | medium | **86.70%** | reasoning_effort=medium | verified |
| gemini-2.5-pro-preview-06-05 | Google | 32K | **83.10%** | reasoning_effort=32K | verified |
| gpt-5-2025-08-07 | OpenAI | low | **81.30%** | reasoning_effort=low | verified |
| grok-4-0709 | xAI | — | **79.60%** | reasoning_effort=unspecified | verified |
| grok-4-0709 | xAI | high | **79.60%** | reasoning_effort=high | verified |
| gemini-2.5-pro-preview-06-05 | Google | — | **79.10%** | reasoning_effort=unspecified | verified |
| gemini-2.5-pro-preview-05-06 | Google | — | **76.90%** | reasoning_effort=unspecified | verified |
| DeepSeek-V3.2-Exp | DeepSeek | thinking | **74.20%** | reasoning_effort=thinking | verified |
| gemini-2.5-pro-exp-03-25 | Google | — | **72.90%** | reasoning_effort=unspecified | verified |
| gemini-2.5-pro-preview-03-25 | Google | — | **72.90%** | reasoning_effort=unspecified | verified |
| claude-opus-4-20250514 | Anthropic | 32K | **72.00%** | reasoning_effort=32K | verified |
| DeepSeek-R1-0528 | DeepSeek | — | **71.40%** | reasoning_effort=unspecified | verified |
| claude-opus-4-20250514 | Anthropic | — | **70.70%** | reasoning_effort=unspecified | verified |
| DeepSeek-V3.2-Exp | DeepSeek | — | **70.20%** | reasoning_effort=unspecified | verified |
| claude-3-7-sonnet-20250219 | Anthropic | 32K | **64.90%** | reasoning_effort=32K | verified |
| claude-sonnet-4-20250514 | Anthropic | 32K | **61.30%** | reasoning_effort=32K | verified |
| claude-3-7-sonnet-20250219 | Anthropic | — | **60.40%** | reasoning_effort=unspecified | verified |
| Qwen3-235B-A22B | Alibaba | — | **59.60%** | reasoning_effort=unspecified | verified |
| Qwen3-235B-A22B-Instruct-2507 | Alibaba | — | **59.60%** | reasoning_effort=unspecified | verified |
| Kimi-K2-Instruct | Moonshot | — | **59.10%** | reasoning_effort=unspecified | verified |
| moonshotai/kimi-k2-0905 | Moonshot | — | **59.10%** | reasoning_effort=unspecified | verified |

### ARC-AGI-2

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 208 (208 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| gpt-6-astra | OpenAI | max | **95.00%** | GPT-6 Astra (Max) | verified |
| gpt-6-astra | OpenAI | xhigh | **93.33%** | GPT-6 Astra (XHigh) | verified |
| gpt-5.6-sol | OpenAI | max | **92.50%** | GPT-5.6 Sol (Max) | verified |
| gpt-6-astra | OpenAI | high | **92.08%** | GPT-6 Astra (High) | verified |
| gpt-6-astra | OpenAI | medium | **92.08%** | GPT-6 Astra (Medium) | verified |
| claude-opus-5 | Anthropic | max | **90.42%** | Claude Opus 5 (Max) | verified |
| gpt-5.6-sol | OpenAI | xhigh | **90.00%** | GPT-5.6 Sol (xHigh) | verified |
| gpt-5.6-sol | OpenAI | xhigh | **90.00%** | GPT-5.6 Sol (XHigh) | verified |
| claude-fable-5-1 | Anthropic | max | **90.00%** | Claude Fable 5.1 (Max) | verified |
| claude-fable-5-1 | Anthropic | xhigh | **90.00%** | Claude Fable 5.1 (XHigh) | verified |
| claude-fable-5 | Anthropic | max | **89.17%** | Claude Fable 5 (Max) | verified |
| claude-fable-5-1 | Anthropic | high | **88.75%** | Claude Fable 5.1 (High) | verified |
| claude-fable-5 | Anthropic | xhigh | **88.33%** | Claude Fable 5 (XHigh) | verified |
| claude-opus-5 | Anthropic | max | **88.33%** | Claude Opus 5 (High) | verified |
| claude-opus-5 | Anthropic | high | **88.33%** | Claude Opus 5 (High) | verified |
| claude-fable-5 | Anthropic | high | **87.50%** | Claude Fable 5 (High) | verified |
| claude-fable-5-1 | Anthropic | medium | **86.25%** | Claude Fable 5.1 (Medium) | verified |
| gpt-5.6-sol | OpenAI | high | **85.42%** | GPT-5.6 Sol (High) | verified |
| gpt-6-astra | OpenAI | low | **85.42%** | GPT-6 Astra (Low) | verified |
| gpt-5.5 | OpenAI | xhigh | **85.00%** | GPT-5.5 (xHigh) | verified |
| gpt-5.5 | OpenAI | xhigh | **85.00%** | GPT-5.5 (XHigh) | verified |
| gemini-3.7-flash | Google | high | **84.58%** | Gemini 3.7 Flash (High) | verified |

### OSWorld 2.0

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration) · Anthropic — "Introducing Claude Opus 5"  
**URL:** https://epoch.ai/data/benchmark_data.zip · https://www.anthropic.com/news/claude-opus-5  
**Retrieved:** 2026-09-27  
**Cells:** 17 (16 with a score, 1 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| claude-opus-5 | Anthropic | max | **31.43%** | Claude Opus 5 (max) | Tool setting=batch tool | Step budget=500 | Reasoning=max | verified |
| claude-opus-5 | Anthropic | xhigh | **30.21%** | Claude Opus 5 (xhigh) | Tool setting=batch tool | Step budget=500 | Reasoning=xhigh | verified |
| claude-opus-5 | Anthropic | high | **28.98%** | Claude Opus 5 (high) | Tool setting=batch tool | Step budget=500 | Reasoning=high | verified |
| gpt-5.6-sol | OpenAI | max | **27.34%** | GPT-5.6 Sol (max) | Tool setting=batch tool | Step budget=500 | Reasoning=max | verified |
| claude-opus-5 | Anthropic | medium | **25.33%** | Claude Opus 5 (medium) | Tool setting=batch tool | Step budget=500 | Reasoning=medium | verified |
| claude-opus-5 | Anthropic | low | **22.32%** | Claude Opus 5 (low) | Tool setting=batch tool | Step budget=500 | Reasoning=low | verified |
| claude-opus-4-8 | Anthropic | max | **20.60%** | Claude Opus 4.8 (max) | Tool setting=batched tool | Step budget=500 | Reasoning=max | verified |
| claude-opus-4-8 | Anthropic | max | **18.52%** | Claude Opus 4.8 (max) | Tool setting=standard | Step budget=500 | Reasoning=max | verified |
| claude-opus-4-7 | Anthropic | max | **18.20%** | Claude Opus 4.7 (max) | Tool setting=batched tool | Step budget=500 | Reasoning=max | verified |
| claude-opus-4-7 | Anthropic | max | **13.90%** | Claude Opus 4.7 (max) | Tool setting=standard | Step budget=500 | Reasoning=max | verified |
| gpt-5.5 | OpenAI | xhigh | **13.00%** | GPT-5.5 (xhigh) | Tool setting=batch tool | Step budget=500 | Reasoning=xhigh | verified |
| claude-sonnet-4-6 | Anthropic | medium | **9.30%** | Claude Sonnet 4.6 (medium) | Tool setting=standard | Step budget=500 | Reasoning=medium | verified |
| claude-sonnet-4-6 | Anthropic | max | **8.30%** | Claude Sonnet 4.6 (max) | Tool setting=standard | Step budget=500 | Reasoning=max | verified |
| MiniMax-M3 | MiniMax | — | **4.60%** | MiniMax M3 (enabled) | Tool setting=standard | Step budget=500 | Reasoning=enabled | verified |
| kimi-k2.6 | Moonshot | — | **4.60%** | Kimi 2.6 (enabled) | Tool setting=standard | Step budget=500 | Reasoning=enabled | verified |
| qwen3.7-plus | Alibaba | — | **2.80%** | Qwen 3.7-Plus (thinking) | Tool setting=standard | Step budget=500 | Reasoning=thinking | verified |

Relative claims only — **no absolute score published, so none is recorded** (would be fabrication):

- **Claude Opus 5** on OSWorld 2.0: *"outperforms every other model at any given cost, surpassing Fable 5 best result at just over a third of the cost"*  — Anthropic — "Introducing Claude Opus 5", 2026-09-27

### GDPval

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 9 (9 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| gpt-5.2-2025-12-11 | OpenAI | none | **49.70%** | GPT-5.2 | verified |
| claude-opus-4-5-20251101 | Anthropic | — | **45.50%** | Claude Opus 4.5 | verified |
| claude-opus-4-1-20250805 | Anthropic | — | **43.60%** | Claude Opus 4.1 | verified |
| claude-sonnet-4-5-20250929 | Anthropic | — | **42.50%** | Claude Sonnet 4.5 | verified |
| gemini-3-pro-preview | Google | — | **40.30%** | Gemini 3 Pro | verified |
| gpt-5-2025-08-07 | OpenAI | medium | **34.80%** | GPT-5 | verified |
| gemini-2.5-pro | Google | — | **23.30%** | Gemini 2.5 Pro | verified |
| grok-4-0709 | xAI | high | **21.10%** | Grok 4 | verified |
| gpt-4o-2024-11-20 | OpenAI | — | **9.90%** | GPT-4o | verified |

### APEX-Agents

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 33 (33 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| claude-fable-5-1 | Anthropic | unknown | **68.60%** | Fable 5.1 [claude-fable-5.1] | verified |
| gemini-3.7-flash | Google | unknown | **67.80%** | Gemini 3.7 Flash | verified |
| claude-opus-5 | Anthropic | max | **65.80%** | Opus 5 | verified |
| grok-4.6 | xAI | unknown | **65.30%** | Grok 4.6 | verified |
| gpt-6-astra | OpenAI | unknown | **64.70%** | GPT-6 Astra | verified |
| gemini-3.8-flash | Google | unknown | **64.30%** | Gemini 3.8 Flash | verified |
| claude-fable-5 | Anthropic | — | **63.60%** | Fable 5 | verified |
| claude-fable-5-1 | Anthropic | high | **59.70%** | Fable 5.1 (High) | verified |
| gpt-5.6-terra | OpenAI | max | **58.20%** | GPT-5.6 Terra | verified |
| muse-spark-1.3 | Meta | unknown | **57.80%** | Muse Spark 1.3 | verified |
| glm-5.3 | Zhipu | unknown | **56.60%** | GLM-5.3 | verified |
| grok-4.5 | xAI | unknown | **56.20%** | Grok 4.5 | verified |
| gpt-5.5 | OpenAI | unknown | **55.10%** | GPT-5.5 | verified |
| claude-sonnet-5 | Anthropic | unknown | **54.50%** | Sonnet 5 | verified |
| glm-5.3-flash | Zhipu | unknown | **52.80%** | GLM-5.3-Flash | verified |
| gpt-5.4-2026-03-05 | OpenAI | unknown | **52.40%** | GPT-5.4 | verified |
| gpt-5.6-sol | OpenAI | promax | **51.40%** | GPT-5.6 Sol | verified |
| kimi-k3 | Moonshot | unknown | **50.60%** | Kimi K3 | verified |
| claude-opus-4-7 | Anthropic | max | **49.20%** | Opus 4.7 | verified |
| claude-opus-4-8 | Anthropic | max | **48.90%** | Opus 4.8 | verified |
| deepseek-v4-pro-0813 | DeepSeek | unknown | **47.30%** | DeepSeek-V4-Pro-0813 | verified |
| gemini-3.6-flash | Google | unknown | **46.90%** | Gemini 3.6 Flash | verified |

### MATH Level 5

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 55 (55 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| gpt-5-2025-08-07 | OpenAI | high | **98.13%** | reasoning_effort=high | verified |
| gpt-5-2025-08-07 | OpenAI | medium | **97.92%** | reasoning_effort=medium | verified |
| gpt-5-mini-2025-08-07 | OpenAI | high | **97.85%** | reasoning_effort=high | verified |
| claude-sonnet-4-5-20250929 | Anthropic | 32K | **97.73%** | reasoning_effort=32K | verified |
| qwen3-max-2025-09-23 | Alibaba | — | **97.13%** | reasoning_effort=unspecified | verified |
| gpt-5-mini-2025-08-07 | OpenAI | medium | **96.79%** | reasoning_effort=medium | verified |
| DeepSeek-R1-0528 | DeepSeek | — | **96.64%** | reasoning_effort=unspecified | verified |
| claude-haiku-4-5-20251001 | Anthropic | 32K | **96.36%** | reasoning_effort=32K | verified |
| gemini-2.5-pro-preview-05-06 | Google | — | **95.90%** | reasoning_effort=unspecified | verified |
| gemini-2.5-pro-preview-03-25 | Google | — | **95.56%** | reasoning_effort=unspecified | verified |
| gpt-5-nano-2025-08-07 | OpenAI | medium | **95.24%** | reasoning_effort=medium | verified |
| gpt-5-nano-2025-08-07 | OpenAI | high | **94.90%** | reasoning_effort=high | verified |
| DeepSeek-R1 | DeepSeek | — | **93.05%** | reasoning_effort=unspecified | verified |
| claude-3-7-sonnet-20250219 | Anthropic | 64K | **91.16%** | reasoning_effort=64K | verified |
| grok-3-mini-beta | xAI | low | **90.94%** | reasoning_effort=low | verified |
| claude-3-7-sonnet-20250219 | Anthropic | 32K | **90.03%** | reasoning_effort=32K | verified |
| DeepSeek-R1-Distill-Llama-70B | DeepSeek | — | **89.90%** | reasoning_effort=unspecified | verified |
| grok-3-beta | xAI | — | **88.75%** | reasoning_effort=unspecified | verified |
| grok-3-mini-beta | xAI | high | **88.07%** | reasoning_effort=high | verified |
| gpt-4.1-mini-2025-04-14 | OpenAI | — | **87.29%** | reasoning_effort=unspecified | verified |
| DeepSeek-R1-Distill-Qwen-14B | DeepSeek | — | **87.12%** | reasoning_effort=unspecified | verified |
| claude-haiku-4-5-20251001 | Anthropic | — | **86.91%** | reasoning_effort=unspecified | verified |

### SciCode

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 147 (147 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| claude-fable-5-1 | Anthropic | max | **63.08%** | Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback) | verified |
| claude-fable-5 | Anthropic | max | **61.00%** | Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback) | verified |
| claude-fable-5-1 | Anthropic | xhigh | **60.88%** | Claude Fable 5.1 (Adaptive Reasoning, Xhigh Effort, Default Fallback) | verified |
| gemini-3.7-flash | Google | medium | **59.84%** | Gemini 3.7 Flash (medium) | verified |
| muse-spark-1.3 | Meta | xhigh | **59.72%** | Muse Spark 1.3 (xhigh) | verified |
| kimi-k3 | Moonshot | max | **59.49%** | Kimi K3 (max) | verified |
| glm-5.3 | Zhipu | max | **59.03%** | GLM-5.3 (max) | verified |
| gemini-3.1-pro-preview | Google | — | **58.91%** | Gemini 3.1 Pro Preview | verified |
| muse-spark-1.1 | Meta | — | **58.80%** | Muse Spark 1.1 (xhigh) | verified |
| muse-spark-1.3 | Meta | max | **58.80%** | Muse Spark 1.3 (max) | verified |
| kimi-k3 | Moonshot | unknown | **58.68%** | Kimi K3 | verified |
| claude-fable-5-1 | Anthropic | high | **57.64%** | Claude Fable 5.1 (Adaptive Reasoning, High Effort, Default Fallback) | verified |
| grok-4.7 | xAI | xhigh | **57.41%** | Grok 4.7 (xhigh) | verified |
| gpt-5.6-sol | OpenAI | max | **57.06%** | GPT-5.6 Sol (max) | verified |
| gpt-5.6-sol | OpenAI | high | **56.94%** | GPT-5.6 Sol (high) | verified |
| gemini-3.7-flash | Google | high | **56.83%** | Gemini 3.7 Flash (high) | verified |
| gpt-5.4-2026-03-05 | OpenAI | xhigh | **56.60%** | GPT-5.4 (xhigh) | verified |
| gemini-3.8-flash | Google | high | **56.60%** | Gemini 3.8 Flash (high) | verified |
| gpt-5.6-sol | OpenAI | medium | **56.48%** | GPT-5.6 Sol (medium) | verified |
| grok-4.6 | xAI | high | **56.48%** | Grok 4.6 (high) | verified |
| gpt-6-astra | OpenAI | max | **56.48%** | GPT-6 Astra (max) | verified |
| claude-opus-5 | Anthropic | max | **56.37%** | Claude Opus 5 (Adaptive Reasoning, Max Effort) | verified |

### CritPt

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 152 (152 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| gpt-5.6-sol | OpenAI | max | **32.29%** | GPT-5.6 Sol (max) | verified |
| gpt-6-astra | OpenAI | max | **31.71%** | GPT-6 Astra (max) | verified |
| gpt-6-astra | OpenAI | xhigh | **31.43%** | GPT-6 Astra (xhigh) | verified |
| claude-fable-5-1 | Anthropic | xhigh | **31.14%** | Claude Fable 5.1 (Adaptive Reasoning, Xhigh Effort, Default Fallback) | verified |
| gpt-5.5-pro | OpenAI | xhigh | **30.57%** | GPT-5.5 Pro (xhigh) | verified |
| claude-fable-5-1 | Anthropic | high | **30.29%** | Claude Fable 5.1 (Adaptive Reasoning, High Effort, Default Fallback) | verified |
| gpt-5.4-pro-2026-03-05 | OpenAI | xhigh | **30.00%** | GPT-5.4 Pro (xhigh) | verified |
| gpt-5.6-terra | OpenAI | max | **30.00%** | GPT-5.6 Terra (max) | verified |
| claude-fable-5-1 | Anthropic | max | **29.71%** | Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback) | verified |
| claude-opus-5 | Anthropic | max | **29.14%** | Claude Opus 5 (Adaptive Reasoning, Max Effort) | verified |
| claude-fable-5-1 | Anthropic | medium | **29.14%** | Claude Fable 5.1 (Adaptive Reasoning, Medium Effort, Default Fallback) | verified |
| gpt-6-astra | OpenAI | medium | **29.14%** | GPT-6 Astra (medium) | verified |
| gpt-6-astra | OpenAI | high | **28.86%** | GPT-6 Astra (high) | verified |
| gpt-5.6-sol | OpenAI | xhigh | **28.60%** | GPT-5.6 Sol (xhigh) | verified |
| claude-fable-5 | Anthropic | max | **28.57%** | Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback) | verified |
| claude-opus-5 | Anthropic | high | **28.29%** | Claude Opus 5 (Adaptive Reasoning, High Effort) | verified |
| claude-opus-5 | Anthropic | xhigh | **27.71%** | Claude Opus 5 (Adaptive Reasoning, Xhigh Effort) | verified |
| claude-fable-5-1 | Anthropic | low | **27.71%** | Claude Fable 5.1 (Adaptive Reasoning, Low Effort, Default Fallback) | verified |
| gpt-5.5 | OpenAI | xhigh | **27.14%** | GPT-5.5 (xhigh) | verified |
| gpt-5.6-terra | OpenAI | xhigh | **27.14%** | GPT-5.6 Terra (xhigh) | verified |
| claude-opus-5 | Anthropic | medium | **26.86%** | Claude Opus 5 (Adaptive Reasoning, Medium Effort) | verified |
| gpt-6-astra | OpenAI | low | **26.29%** | GPT-6 Astra (low) | verified |

### EBR-bench

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 23 (23 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| gpt-6-astra | OpenAI | max | **76.19%** | reasoning_effort=max | verified |
| claude-opus-5-5 | Anthropic | max | **71.43%** | reasoning_effort=max | verified |
| claude-fable-5-1 | Anthropic | max | **57.14%** | reasoning_effort=max | verified |
| gpt-6-sol | OpenAI | max | **53.33%** | reasoning_effort=max | verified |
| claude-opus-5 | Anthropic | max | **45.71%** | reasoning_effort=max | verified |
| gpt-5.6-sol | OpenAI | max | **44.76%** | reasoning_effort=max | verified |
| claude-fable-5 | Anthropic | max | **39.52%** | reasoning_effort=max | verified |
| gpt-5.5 | OpenAI | xhigh | **34.29%** | reasoning_effort=xhigh | verified |
| grok-4.6 | xAI | xhigh | **30.48%** | reasoning_effort=xhigh | verified |
| claude-opus-4-8 | Anthropic | max | **28.57%** | reasoning_effort=max | verified |
| gpt-5.4-2026-03-05 | OpenAI | xhigh | **25.40%** | reasoning_effort=xhigh | verified |
| gpt-5.2-2025-12-11 | OpenAI | xhigh | **23.02%** | reasoning_effort=xhigh | verified |
| claude-opus-4-7 | Anthropic | max | **19.05%** | reasoning_effort=max | verified |
| claude-opus-4-5-20251101 | Anthropic | 128K | **14.29%** | reasoning_effort=128K | verified |
| gemini-3.1-pro-preview | Google | — | **14.29%** | reasoning_effort=unspecified | verified |
| claude-opus-4-6 | Anthropic | max | **12.70%** | reasoning_effort=max | verified |
| gpt-5-2025-08-07 | OpenAI | high | **12.70%** | reasoning_effort=high | verified |
| glm-5.2 | Zhipu | max | **9.52%** | reasoning_effort=max | verified |
| qwen3.7-max | Alibaba | — | **9.52%** | reasoning_effort=unspecified | verified |
| claude-opus-4-1-20250805 | Anthropic | — | **7.94%** | reasoning_effort=unspecified | verified |
| gemini-3.5-flash | Google | high | **4.76%** | reasoning_effort=high | verified |
| kimi-k2.6 | Moonshot | — | **2.38%** | reasoning_effort=unspecified | verified |

### FrontierSWE

**Source:** Epoch AI — Capabilities & benchmarking hub (independent re-administration)  
**URL:** https://epoch.ai/data/benchmark_data.zip  
**Retrieved:** 2026-09-27  
**Cells:** 13 (13 with a score, 0 relative-claim-only)

| Model | Vendor | effort | Score | Scaffold detail | confidence |
|---|---|---|---|---|---|
| gpt-6-astra | OpenAI | max | **65.51%** | GPT-6 Astra | Harness=proximus | verified |
| claude-fable-5-1 | Anthropic | max | **56.29%** | Claude Fable 5.1 | Harness=proximus | verified |
| claude-opus-5 | Anthropic | max | **52.01%** | Claude Opus 5 | Harness=proximus | verified |
| claude-fable-5 | Anthropic | max | **46.96%** | Claude Fable 5 | Harness=proximus | verified |
| gpt-5.6-sol | OpenAI | max | **32.20%** | GPT-5.6 | Harness=proximus | verified |
| glm-5.3 | Zhipu | max | **30.18%** | GLM-5.3 | Harness=proximus | verified |
| kimi-k3 | Moonshot | max | **25.87%** | Kimi K3 | Harness=proximus | verified |
| grok-4.6 | xAI | xhigh | **25.29%** | Grok 4.6 | Harness=proximus | verified |
| gemini-3.7-flash | Google | high | **20.26%** | Gemini 3.7 Flash | Harness=proximus | verified |
| gemini-3.8-flash | Google | high | **19.63%** | Gemini 3.8 Flash | Harness=proximus | verified |
| qwen3.8-max | Alibaba | xhigh | **15.81%** | Qwen3.8-Max | Harness=proximus | verified |
| muse-spark-1.2 | Meta | xhigh | **11.97%** | Muse Spark 1.2 | Harness=proximus | verified |
| Inkling | ThinkingMachines | xhigh | **4.12%** | Inkling | Harness=proximus | verified |

### ARC-AGI 3

**Source:** Anthropic — "Introducing Claude Opus 5"  
**URL:** https://www.anthropic.com/news/claude-opus-5  
**Retrieved:** 2026-09-27  
**Cells:** 1 (0 with a score, 1 relative-claim-only)


Relative claims only — **no absolute score published, so none is recorded** (would be fabrication):

- **Claude Opus 5** on ARC-AGI 3: *"Opus 5's score is three times as high as the next-best model"*  — Anthropic — "Introducing Claude Opus 5", 2026-09-27

### Zapier AutomationBench

**Source:** Anthropic — "Introducing Claude Opus 5"  
**URL:** https://www.anthropic.com/news/claude-opus-5  
**Retrieved:** 2026-09-27  
**Cells:** 1 (0 with a score, 1 relative-claim-only)


Relative claims only — **no absolute score published, so none is recorded** (would be fabrication):

- **Claude Opus 5** on Zapier AutomationBench: *"pass rate is around 1.5x the next-best model for the same cost per task; even at lowest effort Opus 5 passes more tasks than any other model"*  — Anthropic — "Introducing Claude Opus 5", 2026-09-27

### GDPval-AA v2

**Source:** Anthropic — "Introducing Claude Opus 5"  
**URL:** https://www.anthropic.com/news/claude-opus-5  
**Retrieved:** 2026-09-27  
**Cells:** 1 (0 with a score, 1 relative-claim-only)


Relative claims only — **no absolute score published, so none is recorded** (would be fabrication):

- **Claude Opus 5** on GDPval-AA v2: *"at max effort performs within 0.5% of Fable 5 peak score, at half the cost per task"*  — Anthropic — "Introducing Claude Opus 5", 2026-09-27

## 5. Vendor self-reports vs independently measured

Vendor self-reported cells: **9** of 1711. Independently administered: **1702**.

| Model | Benchmark | Score | Source | Caveat |
|---|---|---|---|---|
| GPT-4o | BrowseComp (1,266 problems) | 0.60% | OpenAI — "BrowseComp: a benchmark for browsing agents" (2025-04-10) | vendor-run |
| GPT-4o | BrowseComp (1,266 problems) | 1.90% | OpenAI — "BrowseComp: a benchmark for browsing agents" (2025-04-10) | vendor-run |
| GPT-4.5 | BrowseComp (1,266 problems) | 0.90% | OpenAI — "BrowseComp: a benchmark for browsing agents" (2025-04-10) | vendor-run |
| OpenAI o1 | BrowseComp (1,266 problems) | 9.90% | OpenAI — "BrowseComp: a benchmark for browsing agents" (2025-04-10) | vendor-run |
| Deep Research (OpenAI) | BrowseComp (1,266 problems) | 51.50% | OpenAI — "BrowseComp: a benchmark for browsing agents" (2025-04-10) | **training-contaminated by the vendor's own footnote** |
| Claude Opus 5 | ARC-AGI 3 | — | Anthropic — "Introducing Claude Opus 5" | relative claim only |
| Claude Opus 5 | Zapier AutomationBench | — | Anthropic — "Introducing Claude Opus 5" | relative claim only |
| Claude Opus 5 | OSWorld 2.0 | — | Anthropic — "Introducing Claude Opus 5" | relative claim only |
| Claude Opus 5 | GDPval-AA v2 | — | Anthropic — "Introducing Claude Opus 5" | relative claim only |

### ⚠️ The Deep Research / BrowseComp number must not be used as a capability score

OpenAI's own BrowseComp page footnotes the headline 51.5% figure:
> *"Note that the Deep Research model is trained on data that specifically teaches the model to be good on BrowseComp tasks."*

This is a **training-contaminated** figure, not a clean measurement. It is 5.7× the next-best model on the same page and
that ratio is largely explained by the contamination. C2 must not treat it as a capability anchor.

## 6. Honest gaps (no number invented to fill them)

- LiveCodeBench: official data stops 2025-04-07 — zero 2026 frontier models.
- tau-bench / tau2-bench: official results cover only gpt-4.1, gpt-4.1-mini, o4-mini, claude-3-7-sonnet (2025). No 2026 frontier model has published a tau-bench score. The official result JSONs are 22-37MB raw conversation traces with no summary field, so no aggregate is quoted here.
- BFCL V4: official CSV last updated 2026-04-12; newest entries are Claude Opus 4.5, GPT-5.2, Gemini 3 Pro. No 2026 flagships.
- GAIA: the HAL leaderboard has been PAUSED by its maintainers ("We have paused updating HAL leaderboard with new models and are currently focusing on measuring reliability in AI agents"). Newest is Claude Sonnet 4.5 / GPT-5 Medium (2025).
- BrowseComp: no frontier model since 2025-04 has published a BrowseComp score on a first-party page I could reach. Deep Research 51.5% is vendor-reported and explicitly training-contaminated by OpenAI's own footnote.
- SimpleQA: two distinct benchmarks share the name. Epoch runs 'SimpleQA Verified' (a different dataset from OpenAI's original 4,326-question SimpleQA). They must NOT be pooled as one metric.
- Anthropic publishes Claude Opus 5 benchmark results only as chart images with relative claims, so no absolute vendor numbers could be recorded for it.

## 7. Data-integrity traps I found and fixed — read before using this table

**7.1 Scale normalisation (a live bug I caught in my own output).** Epoch's `aider_polyglot_external.csv` stores
`Percent correct` on a **0–100** scale (e.g. `grok-4-0709 = 79.6`) while every other file in the bundle is **0–1**. My
first build passed 79.6 through unconverted, which would have made Aider Polyglot look ~100× better than every other
benchmark and silently destroyed any correlation computed across benchmarks. Fixed: divided by 100, and **every row
now carries an explicit `scale` field** — 1,673 rows are `fraction_0_to_1`, 34 are `minutes`, 4 are `null` (no number).
Audit: **0 fraction rows fall outside [0,1]**.

**7.2 METR Time Horizon is a DURATION, not a probability.** Its `scale` is `minutes`, values 4.0 → 1,044.8 min
(`claude-mythos-preview-early` 1,044.8 min TH50 / 185.9 min TH80). **It must not be correlated against the accuracy
columns** — it is minutes of human task length, a different physical quantity.

**7.3 Terminal-Bench rows are per-AGENT, not per-model.** `claude-opus-4-6` has **12 rows** because it was run on 12
different agent harnesses (`ForgeCode`, `Meta-Harness`, `Capy`, `Terminus-KIRA`, `MAYA-V2`, `TongAgents`, …). These rows
range widely. **Averaging them measures the average agent, not the model.** The agent name is in `scaffold_detail`.

**7.4 There are duplicate-looking rows that are NOT duplicates — and some that are.**
- **16 keys** repeat with an *identical* score (mostly ARC-AGI-2, e.g. `gpt-5.6-sol_xhigh` twice at 0.90).
- **72 keys** repeat with *different* scores. These are legitimate (the Terminal-Bench multi-agent rows of 7.3).
- **7 model+benchmark pairs carry two different effort labels with an identical score** — a silent double-count risk if
  you group by model: `gpt-5-2025-08-07` on HLE (`high` and `unknown`, both 0.2532), `nova-2.0-pro-preview` on CritPt
  (`medium`/`none`/`low`, all 0), `qwen3.7-flash` on FrontierMath, `grok-4-0709` on Aider Polyglot, and 3 more.
  **Group by `model_version_raw`, not by `model`, or these will be double-weighted.**

**7.5 Epoch's `score_column` is "Best score (across scorers)"** — a max-over-grader, which reads like an optimistic pick.
I checked it: across all 313 GPQA Diamond rows, only **5** have Best > mean, and the largest gap is `grok-3-beta` at
**8.18pt**. For frontier commercial models the gap is **0.00**. Both `score` and `score_mean_across_scorers` are
recorded for every Epoch row so this can be re-checked.

**7.6 The model-version suffix is the scaffold, not the model name.** `claude-opus-4-6` is *Non-Thinking* while
`claude-opus-4-6_max` is *thinking-max*; `gpt-5.1-..._none` is *gpt-5.1-instant*. Epoch's `hle_external.csv` has a
`Name` column that states this explicitly, and I copied it into `scaffold_detail`. A pipeline that strips the suffix
and keeps one number per model will silently average a thinking model with a non-thinking one.

## 8. Cross-validation — two sources agree

Epoch AI's independent re-administration of HLE agrees with HLE's own published table (which peer A1 verified on
lastexam.ai): **GPT-5 25.32% vs 25.3% reported — exact match**; Gemini 3 Pro 37.52% vs 38.3% (0.8pt). This is the one
place in this dataset where an independent org and a benchmark's maintainer can be compared directly, and they agree.
It raises confidence that the Epoch rows are trustworthy for the other benchmarks where no maintainer table exists.

## 9. Reproduction

- Extraction scripts: `/tmp/c1/{csv,extract_epoch,build,emit}.mjs` (the Epoch zip extractor is `/tmp/c1/unzip.mjs` — this
  container has no `unzip` and no `python3`, so the ZIP was parsed in Node via `zlib.inflateRawSync`).
- Epoch CSVs were extracted to `/tmp/c1/epochdata/`; every row in the JSON names the `source_file` it came from.
- **Nothing in T2Editor was read or written. No git commit was made.**