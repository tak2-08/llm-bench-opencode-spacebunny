# METRICS.md — Evaluation Metric Taxonomy for Text LLMs (2026)

**Owner:** A2 (표준화연구소 / Standards Lab) · **Status:** v1 · **Date:** 2026-09-27
**Machine-readable twin:** `../data/metrics.json`

---

## How to read this document

Every metric gets: **formula** · **unit** · **range** · **direction** · **known failure modes** · **source**.

Three honesty rules govern everything below:

1. **A metric without a range and a failure mode is not a metric, it's a vibe.** Every entry states both.
2. **Numbers from different harnesses are not comparable** unless the *convention* matches (see §0.3). Three of the entries in this document exist solely to record that trap: `brier_*`, `simpleqa_f`, `ecl_*`.
3. **A metric that can be gamed will be gamed.** Where a metric has a known degenerate optimum, it is marked ⚠️GAMABLE and the counter-metric is named.

### Citation honesty markers

| Marker | Meaning |
|---|---|
| ✅ | Definition read verbatim from the primary source this session. Quotation verified. |
| 🧮 | Formula re-derived and numerically self-tested in `harness/psycho-verify.mjs` (self-tests pass). |
| `[RECALL]` | Cited from knowledge; **not** verified online this session. Treat the citation, not the arithmetic, as provisional. |

### §0.3 The three non-negotiables for *any* comparison

1. **Same items.** Subject and anchors must be scored on the *identical* item set. This enables a paired test, which is ~2.5× cheaper than an unpaired one at comparable power (see `PSYCHOMETRICS.md` §1).
2. **Same convention.** State the exact normalization. `brier_sum` on 2 classes and `brier_sum` on 10 classes are different quantities.
3. **Same budget.** A score obtained with k=40 samples per item is not comparable to one obtained with k=1, and a model that is *better* at pass@1 can be *worse* at pass@40. Never compare across budgets without saying so.

---

## 1. Accuracy family

The workhorses. All are "fraction of items scored correct" unless noted; the interesting content is entirely in *how "correct" is decided* and in the estimator variance.

| id | Metric | Formula | Range | Better | Source |
|---|---|---|---|---|---|
| `exact_match` | Exact match | `1[normalize(pred) == normalize(gold)]` | {0,1} | ↑ | SQuAD-style [RECALL] |
| `relaxed_match` | Relaxed / soft match | `1[normalize(pred) ⊇ normalize(gold)]` (substring after normalization) | {0,1} | ↑ | — |
| `contains_match` | Contains | `1[gold ⊆ pred]` | {0,1} | ↑ | — |
| `regex_match` | Regex match | `1[re.search(pattern, pred) != None]` | {0,1} | ↑ | — |
| `token_f1` | Token-level F1 | `2PR/(P+R)`, `P = overlap/|pred|`, `R = overlap/|gold|`, tokens after normalization | [0,1] | ↑ | SQuAD v2 [RECALL] |
| `pass_at_1` | Single-sample accuracy | `mean_i 1[correct(x_i, y_1)]` | [0,1] | ↑ | ✅ Chen et al. 2021 §2.1 |
| `pass_at_k_unbiased` | Unbiased pass@k | `1 - C(n-c, k) / C(n, k)` | [0,1] | ↑ | ✅ Chen et al. 2021 Eq.1 · 🧮 |
| `pass_at_k_naive` | Naive pass@k (**do not use**) | `1 - (1 - p̂)^k` | [0,1] | ↑ | ✅ Chen et al. 2021 App.A (shown biased) · 🧮 |
| `maj_at_k` | Majority vote @ k | `acc( argmax_a Σ_j 1[a_j = a] )` | [0,1] | ↑ | ✅ Wang et al. 2022 |
| `consistency_k` | Within-item agreement | `mean_i ( Σ_a p_i(a)² )`, `p_i(a) = (#j: a_j=a)/k` | [1/k, 1] | ↑ | construction — see FM-A4 |
| `mean_pairwise_agreement` | Pairwise agreement | `mean_{i<j} 1[a_i == a_j]` | [0,1] | ↑ | construction — see FM-A4 |
| `partial_credit` | Fractional credit | `mean_i score_i`, `score_i ∈ [0,1]` set by the task's own rubric | [0,1] | ↑ | construction — see FM-A5 |

### ✅ `pass_at_k_unbiased` — the definition, verified verbatim

> `pass@k := E_Problems [ 1 - C(n-c, k) / C(n, k) ]`  — Chen et al. 2021, Eq. 1

with `n` = samples generated per problem, `c` = number of those that pass, `k` ≤ n. The paper's own numerically-stable reference implementation:

```
def pass_at_k(n, c, k):
    if n - c < k: return 1.0
    return 1.0 - np.prod(1.0 - k / np.arange(n - c + 1, n + 1))
```

**🧮 Bias direction — the naive form UNDER-states pass@k.** I initially asserted the opposite; computing it proved me wrong. Since

```
P(0 correct) = Π_{j=0}^{k-1} (1 - c/(n-j))   and   n - j <= n  =>  1 - c/(n-j) <= 1 - c/n
```

each factor is ≤ its binomial counterpart, so the product ≤ `(1-c/n)^k`. The hypergeometric zero-probability is **below** the binomial one, so `1 - that` is **above**. Hence `pass@k_unbiased >= pass@k_naive` always. Measured:

| n | c | k | unbiased | naive | error |
|---|---|---|---|---|---|
| 200 | 1 | 100 | 0.50000 | 0.39423 | **−10.58pp** |
| 10 | 1 | 5 | 0.50000 | 0.40951 | −9.05pp |
| 200 | 1 | 10 | 0.05000 | 0.04889 | −0.11pp |
| 200 | 37 | 1 | 0.18500 | 0.18500 | 0 (k=1 is exact) |

⚠️**GAMABLE / MISLEADING:** the error is negligible at `k=1` and catastrophic at small `c` with large `k` — exactly the regime (`c=1` of 200 at k=100) where pass@100 is the headline number. Anyone reporting pass@100 from `p̂` alone is reporting 21% low.

### ✅ `maj_at_k` — self-consistency is a *decoding method*, not a metric

> "self-consistency applies a marginalization over r_i by taking a **majority vote** over a_i": `argmax_a Σ_{i=1}^{m} 1(a_i = a)` — Wang et al. 2022

The reported **metric is plain accuracy**. The paper swept `k ∈ {1, 5, 10, 20, 40}` and recommends *"a small number of paths (e.g., 5 or 10) as a starting point."* Length-normalized weighting was tested and **rejected** (Table 1, PaLM-540B GSM8K: weighted-avg-normalized 22.1 vs unweighted-sum 74.4).

> "self-consistency can be applied only to problems where the final answer is from a fixed answer set" — author's own limitation. **There is no consistency metric for open-ended text.** If our subject is graded on free-form output, maj@k does not apply and we must say so.

**Failure modes (FM-A1 …):**

- **FM-A1 — Denominator blindness.** `exact_match` and `contains_match` disagree on verbosity. A chatty model loses EM, wins contains. Never report one without the other. Report **both** and let the gap be visible: a large `contains − exact` gap is a *length* finding, not a *capability* finding.
- **FM-A2 — Verifier = the benchmark.** Unit-test-based pass@k is only as good as the tests. Codex's own §4.4 *filters out problems the model cannot solve* when building HumanEval-adjacent data — i.e. their task set is conditioned on model ability. Beware of any "hard" set that was difficulty-filtered with the subject model.
- **FM-A3 — pass@k rewards diversity, not accuracy.** Chen et al. §3.3: optimal temperature for pass@1 is T*=0.2 but T*=0.8 for pass@100. So pass@100 partly measures *entropy*. Two models can have identical pass@1 and wildly different pass@100. Never report pass@k without the temperature.
- **FM-A4 — Consistency ≠ correctness.** High `consistency_k` is achievable by being confidently and consistently wrong. A model that emits the same wrong answer k times scores 1.0 on `consistency_k` and 0.0 on `pass_at_k`. **Always report consistency jointly with accuracy**, or it is uninterpretable.
- **FM-A5 — Partial credit hides the thing that matters.** `partial_credit` compresses a bimodal outcome (0 or 1) into a continuum. For agentic tasks, report `task_success_rate` (binary) as the headline and `partial_credit` only as a diagnostic.
- **FM-A6 — k-samples buy nothing for pass@1.** 🧮 Verified: for a mean over `n·k` i.i.d. generations, `SE = sqrt(p(1-p)/(n·k))` depends *only* on the product. Splitting a fixed budget into k>1 gives **identical** precision. k>1 is only worth buying for pass@k / maj@k (different estimand) or for within-item variance diagnostics. See `PSYCHOMETRICS.md` §2.

---

## 2. Calibration family

"Does the model's stated confidence match its actual correctness rate?" For a free/zen-tier model whose `cost` field is likely 0, this family is often the *only* place self-knowledge shows up, so it is worth more here than in a paid-model study.

### ✅ `ece_toplabel` — Expected Calibration Error

> `ECE = Σ_{m=1}^{M} (|B_m| / n) · |acc(B_m) − conf(B_m)|`  — Guo et al. 2017, Eq. 3

where `B_m = { i : P̂_i ∈ I_m }`, `I_m = ((m−1)/M, m/M]`,
`acc(B_m) = (1/|B_m|) Σ_{i∈B_m} 1[ŷ_i = y_i]`, `conf(B_m) = (1/|B_m|) Σ_{i∈B_m} p̂_i`.
Guo et al. used **M = 15** bins. Perfect calibration target: `E[ 1(ŷ=y) | P̂=p ] = p`.

Guo et al. attribute the estimator to Naeini et al. 2015 ✅ and also define:

- **MCE** (Maximum Calibration Error, Eq. 5): `MCE = max_m |acc(B_m) − conf(B_m)|` — the *worst* bin. Use this, not ECE, when a single high-stakes bin matters.
- **NLL** (Eq. 6): `−Σ_i log π̂(y_i|x_i)` — proper scoring rule; unlike ECE it is not binnable-dependent and is *properly* minimized at the true conditional.

| id | Metric | Formula | Range | Better | Source |
|---|---|---|---|---|---|
| `ece_toplabel` | Top-label ECE | as above, M=15 | [0,1] | ↓ | ✅ Guo et al. 2017 Eq.3 |
| `mce` | Maximum Calibration Error | `max_m |acc(B_m) − conf(B_m)|` | [0,1] | ↓ | ✅ Guo et al. 2017 Eq.5 |
| `ace_adaptive` | Adaptive/classwise ECE | `E_m ( |B_m|/n · |acc(B_m) − conf(B_m)| )` over **equal-mass** bins | [0,1] | ↓ | [RECALL] — Kull et al. 2019 |
| `brier_binary` | Brier, single event | `(1/N) Σ_i (p_i − o_i)²` | **[0,1]** | ↓ | [RECALL] — Brier 1950 · 🧮 |
| `brier_sum` | Brier, C-class SUM | `(1/N) Σ_i Σ_c (p_ic − y_ic)²` | **[0, 1+1/(C−1)]** | ↓ | 🧮 |
| `brier_mean` | Brier, C-class MEAN | `brier_sum / C` | [0, (1+1/(C−1))/C] | ↓ | 🧮 |
| `nll` | Negative log-likelihood | `−(1/N) Σ_i log π̂(y_i|x_i)` | [0, ∞) | ↓ | ✅ Guo et al. 2017 Eq.6 |
| `overconfidence_rate` | Overconfidence | `mean_i 1[p̂_i > y_i] · (p̂_i − y_i)` — signed excess confidence on wrong answers | [0,1] | ↓ | construction — FM-C3 |
| `auroc_abstention` | AUROC of the correctness signal | AUROC for separating correct from incorrect using `p̂` | [0,1] | ↑ | [RECALL] — Hanley & McNeil 1982 |
| `selective_risk_R` | Selective risk at coverage R | `error_rate among the R most-confident items` | [0,1] | ↓ | [RECALL] — El-Yaniv & Wiener 2010 |
| `risk_coverage_curve` | R–C curve | `{ (coverage(c), risk(c)) : c ∈ [0,1] }` | — | — | [RECALL] — El-Yaniv & Wiener 2010 |
| `aurc` | Area under R–C | `∫ risk(c) dc` | [0,1] | ↓ | [RECALL] — Geifman & El-Yaniv 2017 |

### 🧮 FM-C1 — Brier has **three** conventions with **three different ranges**

The same prediction, scored three ways:

| Convention | Value for `p=0.7, o=1` | Range |
|---|---|---|
| `brier_binary` | 0.0900 | [0, 1] |
| `brier_sum` on 3 classes, `p=[.7,.2,.1]` | 0.1400 | [0, **1.5**] |
| `brier_mean`, same | 0.0467 | [0, **0.5**] |
| `brier_sum` worst case, 10 classes | — | max = **1.1111**, *not* 2 |

**A Brier number reported without its convention and class count is meaningless, and two harnesses' Brier scores are not comparable.** This is a real, not hypothetical, trap: "Brier 0.21" appears in leaderboards with no statement of which of three scales it is on.

### FM-C2 — ECE is binning-dependent and non-monotone under refinement

`M=15` is a convention, not a theorem. ECE **decreases** as you add bins, mechanically, because each bin's `acc` and `conf` are computed from fewer samples. So ECE is not comparable across harnesses that chose different `M`. Always publish `M` alongside the number. Prefer `NLL` or a **proper** score when you need cross-harness comparability; ECE and MCE are *summary statistics of a binned estimate*, not proper scoring rules. [`RECALL`] — the refinement-bias point follows directly from the estimator definition in Guo et al. Eq. 3; the "proper scoring rule" framing is standard.

### FM-C3 — A chat LLM has no first-class confidence

`p̂` for a chat model must be obtained somehow (logprob of the answer token, verbalized "I'm 80% sure", or a probe). Each choice defines a *different* metric. The opencode JSON event stream exposes **token usage and cost, not token logprobs** — so the cheapest honest route in our harness is **verbalized self-assessment** on a fixed rubric, which is a *self-report*, not a calibrated probability. Treat `ece_toplabel` over verbalized confidence as measuring **calibration of self-report**, and label it that way. ⚠️ Do not let it be read as calibration of the underlying belief.

### FM-C4 — ⚠️GAMABLE: selective-prediction metrics have a degenerate optimum

`selective_risk` and `aurc` are computed over the *most confident* items. A model that abstains on everything has coverage 0 and trivially low risk. **Always report the risk–coverage curve, never a single (risk, coverage) point**, and never compare AURC across different abstention policies.

---

## 3. Long-context family

| id | Metric | Formula | Range | Better | Source |
|---|---|---|---|---|---|
| `ecl_absolute` | Effective context length (absolute rule) | `max{ L : score(L) >= 85.6% }` | length | ↑ | ✅ Hsieh et al. 2024 (RULER) |
| `ecl_relative` | ECL (self-referenced) | `max{ L : score(L) >= α · score(L_short) }` | length | ↑ | construction — FM-L1 |
| `needle_accuracy` | Single-needle retrieval | `1[needle value appears in output]` | [0,1] | ↑ | ✅ RULER (recall-based) |
| `multi_needle_recall` | Multi-needle recall | `#needles recovered / #needles inserted` | [0,1] | ↑ | ✅ RULER |
| `position_spread` | Best−worst over needle position | `max_pos acc − min_pos acc` | [0,1] | ↓ | ✅ Liu et al. 2023 |
| `position_curvature` | U-shape / primacy-recency | second difference across position bins | — | — | ✅ Liu et al. 2023 |
| `kv_retrieval_accuracy` | Synthetic KV retrieval | exact-value accuracy vs key position | [0,1] | ↑ | ✅ Liu et al. 2023 |
| `cliff_index` | Context-length cliff | largest single-interval accuracy drop, normalized | [0,1] | ↓ | construction — FM-L2 |
| `context_utilization` | Fraction of context used | tokens actually attended-to / tokens supplied | [0,1] | ↑ | ⚠️ needs logit access — FM-L3 |

### ✅ The lost-in-the-middle finding, and what it does *not* provide

> "we observe a distinctive **U-shaped performance curve**—models are often much better at using relevant information that occurs at the very beginning (**primacy bias**) and very end of contexts (**recency bias**), and suffer degraded performance when forced to use information within the middle" — Liu et al. 2023

They name the phenomenon after the **serial-position effect** (Ebbinghaus 1913; Murdock 1962). Headline number: *"GPT-3.5-Turbo's multi-document QA performance can drop by more than 20%"* — and in the worst case falls *below closed-book* performance (56.1%).

**⚠️ There is no named metric symbol and no named benchmark in this paper.** It contributes a **protocol** plus a **phenomenon name**, not a metric. Anyone citing "the lost-in-the-middle score" is citing something that does not exist. The correct citable object is `position_spread` (best−worst), defined above as our own construction from their protocol.

### ✅ RULER's ECL threshold is **absolute**, and the rule is order-dependent

> "We use the performance of **Llama2-7b model at the 4K context length** as the threshold" (= 85.6%) … "The effective context length is **the maximum length passing this threshold**" — Hsieh et al. 2024 §4

This is **85.6% absolute**, *not* "% of the model's own short-context score". The paper's own word for it is a *"qualitative threshold"* — it is borrowed from a weak 7B chat model, not derived from first principles.

🧮 **And the rule is order-dependent if the sweep is non-monotone.** Verified: scores `{4k: 85.0, 8k: 86.0, 16k: 30.0}` yield `ECL = 8192` — a model that scored *below* threshold at 4K is credited with a 8K effective context, because the rule takes `max{L : score(L) ≥ θ}` over the raw grid rather than a monotone envelope. **Always publish the full score-vs-length curve alongside any ECL number**, and flag non-monotonicity explicitly (our `effectiveContextLength()` returns a `monotone` boolean for exactly this).

### FM-L1 / FM-L2 / FM-L3

- **FM-L1 — "Effective context length" has at least three published meanings** (absolute-threshold RULER; self-referenced fraction; a vendor's claimed window). Reporting "ECL = 128K" without naming the rule is meaningless. Name the rule in the column header, every time.
- **FM-L2 — cliff detection is metric-choice-sensitive.** `cliff_index` depends on the sweep grid: a coarse grid (4k/8k/16k/32k) will average a cliff away; a fine grid multiplies cost. Declare the grid in advance (pre-registration — see `PSYCHOMETRICS.md` §5).
- **FM-L3 — `context_utilization` and KV-sink probes are not measurable through our interface.** Attention weights and KV tensors are internal. Our harness sees text and usage counters only. These are marked `computable_without_hidden_ground_truth: false` / not-computable in `metrics.json` and are **excluded from the pre-registered primaries** — not because they are unimportant, but because we cannot measure them, and pretending otherwise is the failure mode this whole document exists to prevent.
- **FM-L4 — Needle-in-a-haystack is a *lower bound* on retrieval, not a measure of understanding.** A model can pattern-match a literal needle string. Liu et al. say so: *"extended-context models are not necessarily better at using their input context."*

---

## 4. Efficiency & latency family

| id | Metric | Formula | Unit | Better | Source |
|---|---|---|---|---|---|
| `ttft_spawn` | TTFT, wall-clock from spawn | `t(first non-empty text) − t(spawn)` | ms | ↓ | construction |
| `ttft_model` | TTFT, boot-excluded | `t(first text) − t(first opencode event)` | ms | ↓ | construction — ✅ see note |
| `itl_mean` | Inter-token latency | `(t(last) − t(first)) / (n_out_tokens − 1)` | ms/token | ↓ | construction |
| `output_tps` | Output throughput | `n_out_tokens / (t(last) − t(first))` | tok/s | ↑ | construction |
| `total_latency` | End-to-end | `t(last event) − t(spawn)` | ms | ↓ | construction |
| `cost_per_1k_tokens` | Price efficiency | `cost / (tokens/1000)` | currency | ↓ | vendor pricing |
| `cost_per_solved_task` | **Industry-preferred agent metric** | `total_cost / #tasks_solved` | currency/task | ↓ | construction — ⚠️ FM-E1 |
| `shadow_cost_per_solved_task` | Token-priced cost/solved | `Σ shadow_price · tokens / #solved` | currency/task | ↓ | construction — FM-E1 |
| `tokens_per_tool_call` | Output tokens per tool call | `n_out_tokens / n_tool_calls` | tokens | ↓ | construction |
| `parallel_scaling_efficiency` | Parallel efficiency | `T_sequential / (T_parallel · n_workers)` | ratio [0,1] | ↑ | construction |
| `intelligence_per_dollar` | Value ratio | `primary_accuracy / cost_per_solved_task` | acc/$ | ↑ | construction — ⚠️ FM-E2 |

### ✅ Why `ttft_model` is the right primary and `ttft_spawn` is not

Our harness already implements this distinction and **it is correct**: B1's `runner.mjs:183` computes `ttftModelMs` as `firstTextMs − firstEventMs`, i.e. from the first opencode event (once a provider call is actually in flight), not from process spawn. Measured on our own subject, CLI boot is **8–14s** — if you fold that into TTFT you will report a CLI startup constant as model latency and the number will be meaningless across harnesses. Record **both**, headline only `ttft_model`.

### ⚠️ FM-E1 — **`cost_per_solved_task` is undefined for a free-tier subject.** This is not hypothetical for us.

Our subject runs on a free/zen tier. `cost` is expected to be `0` or absent. Then:

- `cost_per_solved_task = 0 / n = 0` for **every** model, including a model that solves nothing. Reporting it as a win produces the nonsense conclusion *"free = best value"*.
- Worse, if the anchor models return a small non-zero cost, `0` makes the ratio **infinite** and any division downstream is garbage.

**Mandatory handling (I am broadcasting this to B1/B2):**
1. Record raw token counters (input / output / reasoning / cache-read) **always**, independent of whether `cost` is present. They are the only currency-free basis for a cost comparison.
2. Compute `shadow_cost_per_solved_task` using an **explicitly stated, dated** price list (input / output / cached-input $/1M). Tag it `PRICED`, never `MEASURED`, and print the price list next to the number.
3. If no price list can be sourced for a model, that cell is **missing**, not zero. Never impute.
4. Never rank on cost at all if prices are not contemporaneous. Report the **ratio** and the absolute token counts instead.

### ⚠️ FM-E2 — `intelligence_per_dollar` is a compound of two noisy quantities

It divides a metric with ~±5pp CI by a cost with provider-side noise, and it is **maximized by a model that is free and bad**. Report it only paired with the raw accuracy, never alone. It belongs in the *secondary* tier.

### FM-E3 — ITL vs throughput is not a free choice of denominator

`itl_mean` divides by `(n_out_tokens − 1)`, which **blows up for 1-token answers** and is undefined for 0-token (empty) answers — which our harness explicitly classifies as a retryable failure (`EMPTY_ANSWER`). Publish the distribution, not the mean: ITL is strongly right-skewed and the mean is dominated by the slowest tokens.

---

## 5. Agentic family

| id | Metric | Formula | Range | Better | Source |
|---|---|---|---|---|---|
| `task_success_rate` | Binary task success | `mean_i 1[final state passes checker]` | [0,1] | ↑ | construction — FM-G1 |
| `trajectory_efficiency` | Step efficiency | `optimal_steps / actual_steps`, clipped to [0,1] | [0,1] | ↑ | construction — FM-G2 |
| `tool_call_precision` | Did every tool call belong? | `TP / (TP + FP)` over emitted calls | [0,1] | ↑ | construction |
| `tool_call_recall` | Was every required call made? | `TP / (TP + FN)` vs reference plan | [0,1] | ↑ | construction |
| `tool_call_f1` | Tool-call F1 | harmonic mean of the two | [0,1] | ↑ | construction |
| `argument_correctness` | Argument validity | `mean_calls 1[args match the required schema+values]` | [0,1] | ↑ | construction |
| `error_recovery_rate` | Recovery after a failed call | `mean 1[ failed call AND subsequent final state correct ] / #failed calls` | [0,1] | ↑ | construction — FM-G3 |
| `plan_adherence` | Adherence to reference plan | LCS / len(reference plan) over emitted order | [0,1] | ↑ | construction — FM-G4 |
| `state_tracking_correctness` | Env-state fidelity | `mean 1[final env state == expected]` | [0,1] | ↑ | construction |
| `long_horizon_slope` | Per-step success decay | OLS slope of per-step success on step index | pp/step | →0 | construction — FM-G5 |
| `human_intervention_rate` | Handoff rate | `#tasks needing intervention / #tasks` | [0,1] | ↓ | construction |
| `time_horizon_50` | **METR time horizon** | see below | duration | ↑ | ✅ Kwa et al. (METR) 2025 |

### ✅ METR's time horizon, verified

> "we propose a new metric: **50%-task-completion time horizon**. This is the time humans typically take to complete tasks that AI models can complete with 50% success rate." — Kwa et al., *Measuring AI Ability to Complete Long Tasks*, NeurIPS 2025

Estimated by a logistic (IRT-style) fit, verbatim from §4.1:

```
p_success(model, task) = sigma( (log h_model − log t_task) · beta_model )
```

`h_model` **is** the 50%-horizon; `t_task` is **the geometric mean wall-clock time of successful human baselines**. Trend is fit by linear regression of `log(horizon)` on release date: doubling every **212 days** (95% CI 171–249, ±19%).

**Task length is human wall-clock time**, not a step count. This is why the metric is the right one for "can this model be left alone".

⚠️ **Three caveats METR itself states, which we must carry:**
1. **It is an extrapolation, not a measurement.** RE-Bench tasks cap at **8 hours**, so a 50% horizon of ~50 min is interpolated *inside* the measured range, but anything beyond 8h is pure fit. METR: *"we cannot confidently measure time horizons at very high success rates."*
2. **Reference-population dependence.** *"time horizon is always measured relative to a task distribution and baseliners' levels of context and skill."* Their expert baseliners took *"5x–18x longer"* than repository maintainers on contract issues.
3. **Trend > point estimate.** *"we are more confident in the slope of the time horizon trend than in the time horizon of any particular model."*

**Can we measure it?** Only if we can (a) build tasks with defensible human wall-clock baselines and (b) observe the logistic in the `h` range where our subject sits. For a small self-run harness, **no** — we would have almost all tasks on one side of the curve, making `h_model` unidentified. Marked non-computable in `metrics.json`; **excluded from primaries**.

### FM-G1 / FM-G2 / FM-G3 / FM-G4 / FM-G5

- **FM-G1 — "Success" must be checked by a program, not by a model.** A task checker that is itself an LLM inherits every judge-validity problem in §9. Prefer a deterministic final-state assertion (file contents, DB rows, exit status). This is also why `state_tracking_correctness` is listed separately from `task_success_rate`: final-state comparison is the least gameable success criterion.
- **FM-G2 — `trajectory_efficiency` needs a defensible `optimal_steps`,** and "optimal" is a property of the *task*, not the model. If we author tasks ourselves, our notion of optimal is our own bias. ⚠️ A model can also game efficiency by taking *fewer, larger* steps (fewer tool calls, more work per call) — so `trajectory_efficiency` and `tokens_per_tool_call` can move in opposite directions. Report both.
- **FM-G3 — `error_recovery_rate` has a selection-effect trap.** It is conditioned on the model having made a failed call. A model that never fails has **no denominator**. A model that fails more often has more chances to look good at recovery. Report it **jointly with the failure rate**, never alone.
- **FM-G4 — `plan_adherence` presumes there is a single right plan.** For open-ended tasks there isn't. Use it only where a reference trajectory genuinely exists; otherwise this metric is measuring conformity to our authorial style, not competence.
- **FM-G5 — ⚠️ `long_horizon_slope` has a denominator trap specific to our harness.** B1's `runner.mjs:190` counts `stepFinishes`, which is the number of **LLM API steps**, not agent/tool steps. These differ. A model that packs 10 tool calls into one LLM step has a *low* `stepFinishes` count and therefore a *flatter* apparent decay slope — an artifact of our event schema, not a capability. **Confirm the definition with B1 before using this as a slope denominator.**

---

## 6. Instruction-following / control family

### ✅ IFEval's four headline metrics, verified verbatim

> 1. *"Prompt-level strict-accuracy: The percentage of prompts that all verifiable instructions in each prompt are followed."*
> 2. *"Inst-level strict-accuracy: The percentage of verifiable instructions that are followed."*
> 3. *"Prompt-level loose-accuracy: Prompt-level accuracy computed with the loose criterion."*
> 4. *"Inst-level loose-accuracy: Instruction-level accuracy computed with a loose criterion."*
> — Zhou et al. 2023 (IFEval), 25 instruction types, 541 prompts

**Strict** is `is_followed(resp, inst) ∈ {True, False}` (their Eq. 1).
**Loose** is `is_followed_loose(resp, inst) = Any(is_followed(transform_t(resp), inst) for t = 1..8)` (their Eq. 2), with **eight** transforms: identity, remove markdown font modifiers (`*`, `**`), remove first line, remove last line, and every pairwise and three-way combination.

| id | Metric | Range | Better | Source |
|---|---|---|---|---|
| `ifeval_prompt_strict` | Prompt-level strict | [0,1] | ↑ | ✅ Zhou et al. 2023 |
| `ifeval_inst_strict` | Instruction-level strict | [0,1] | ↑ | ✅ Zhou et al. 2023 |
| `ifeval_prompt_loose` | Prompt-level loose | [0,1] | ↑ | ✅ Zhou et al. 2023 |
| `ifeval_inst_loose` | Instruction-level loose | [0,1] | ↑ | ✅ Zhou et al. 2023 |
| `json_schema_conformance` | Schema conformance | [0,1] | ↑ | construction — implemented in `scorers.mjs:jsonSchema` |
| `format_violation_rate` | Format violations | [0,1] | ↓ | construction |
| `constraint_violation_severity` | Severity-weighted violation | `Σ severity_j · 1[violated] / #constraints` | [0,1] | ↓ | construction — ⚠️ FM-I1 |
| `prompt_robustness_delta` | Robustness under perturbation | `metric(clean) − metric(perturbed)`, averaged over perturbation types | [−1,1] | ↓ | construction |

### FM-I1 — severity weighting is an authorial choice dressed as a measurement

`constraint_violation_severity` requires *you* to assign severities ("did the model wrap the answer in JSON?" is trivial; "did it produce a numerically wrong answer in a valid format?" is not a *format* violation at all). Any large severity gap is your prior, not the model's. **Ship the unweighted violation count alongside, always.**

### ✅ IFEval's own caveat, which should shape how we read it

> "Although this loose instruction-following verification process reduces false negatives, it is likely to introduce **false positives**. For example, a response that does not follow a given word-count instruction would be miss-recognized as following the instruction if the first line of the response is removed. **Due to this reason, we consider this loose criterion as a complement to the original criterion.**"

⇒ **Report strict as primary, loose as a bound.** Never report loose alone. Also note IFEval is *program-verified* by design — the authors chose it precisely because *"LLM-based auto-evaluation is potentially biased"*. That is a direct argument against LLM-judging in our harness (§9).

---

## 7. Multilingual family

**This family matters disproportionately for us: Korean is our primary working language, and tokenizer efficiency is a direct multiplier on cost, latency, and effective context.**

| id | Metric | Formula | Unit | Range | Better | Source |
|---|---|---|---|---|---|---|
| `accuracy_lang` | Per-language accuracy | `mean over items of that language` | — | [0,1] | ↑ | — |
| `lang_gap_vs_en` | Gap vs English | `acc_en − acc_lang` | pp | [−1,1] | ↓ | construction |
| `macro_avg_accuracy` | Macro-average | `mean over languages` (equal weight per language) | — | [0,1] | ↑ | — |
| `micro_avg_accuracy` | Micro-average | `mean over all items` | — | [0,1] | ↑ | — |
| `tokens_per_char` | Tokenizer efficiency | `n_tokens / n_chars` | tokens/char | >0 | ↓ | ✅ Petrov et al. 2023 |
| `tokens_per_word` | Tokenizer efficiency | `n_tokens / n_words` | tokens/word | >0 | ↓ | ✅ Petrov et al. 2023 |
| `tokenization_premium` | Premium vs English | `ratio_lang / ratio_en` | ratio | ≥1 | ↓ | ✅ Petrov et al. 2023 |
| `translation_adequacy` | Adequacy proxy | task-judged semantic preservation | — | [0,1] | ↑ | construction |

### ✅ The tokenizer-unfairness finding, and a caveat about the *numbers*

> "The same text translated into different languages can have drastically different tokenization lengths, with differences **up to 15 times in some cases**." — Petrov et al. 2023 (NeurIPS 2023), abstract ✅
> "Character-level and byte-level models also exhibit over 4 times the difference in the encoding length for some language pairs." ✅

Author's project page: tokenization lengths computed over **2000 sentences from the FLORES-200 parallel corpus** ✅.

⚠️ **What I could not verify, and what it changes.** The full text of this paper is not machine-readable (ar5iv conversion fails; no LaTeXML HTML; e-print serves PDF only), so **the per-language table below is DERIVED by a peer agent from the authors' own released `assets/tokenization_lengths.csv`, not quoted from the paper.** The ratios are:

| language | GPT-2 | cl100k_base | LLaMA | ByT5 (char) |
|---|---|---|---|---|
| English (reference) | 1.00× | 1.00× | 1.00× | 1.00× |
| **Korean** | **5.07×** | **2.38×** | **3.18×** | 1.20× |
| Russian | 5.74× | 2.49× | 1.64× | 1.98× |
| Standard Arabic | 4.40× | 3.04× | 3.42× | 1.60× |
| Simplified Chinese | 3.21× | 1.91× | 2.00× | 0.93× |
| Japanese | 3.00× | 2.30× | 2.24× | 1.27× |
| Thai | 9.05× | 4.39× | 4.35× | 2.75× |
| Standard Tibetan | 14.93× | 11.27× | 6.67× | 3.31× |
| Shan (global max) | 18.76× | 15.05× | 11.85× | 3.94× |

**Two consequences we must not skip:**

1. **The multiplier is tokenizer-specific, not a per-language constant.** Korean is 5.07× on GPT-2 but 2.38× on cl100k. Any statement of the form "Korean costs N× more" **must name the tokenizer**. Our subject's tokenizer is not published in our inputs, so our own premium must be **measured directly** (`tokens_per_char` on a fixed Korean corpus), never imported from this table.
2. **English is the minimum for every subword BPE tokenizer tested.** So a "macro-average across languages" that treats English as one language among many *understates* the aggregate cost, because English is the cheapest language, not a typical one. Report `tokens_per_char` per language, never a single average.

⚠️ Also: the authors ship a `tokenization_lengths_validated.csv` that drops language–tokenizer pairs with >10% UNK mapping — i.e. **raw length is confounded by UNK blowup** for low-resource pairs. Use the validated variant or restrict to high-resource languages.

### FM-M1 — macro vs micro averages disagree, and can disagree in *direction*

A model that is excellent at Korean and poor at English loses under **micro** averaging (which weights by item count) and can look equal under **macro**. Always report both; a large gap between them is itself the finding.

### FM-M2 — `translation_adequacy` has no accepted cheap proxy

Com adequacy-based MT metrics (COMET-family) with a stated reference. `[RECALL]`. Using an LLM judge reintroduces every §9 problem, and *in a language we are weaker in*, which is precisely where the judge is least reliable. Mark exploratory only.

---

## 8. Robustness & safety family

| id | Metric | Formula | Range | Better | Source |
|---|---|---|---|---|---|
| `over_refusal_full` | Over-refusal (full) | `#full refusals on safe prompts / #safe prompts` | [0,1] | ↓ | ✅ Röttger et al. 2024 |
| `over_refusal_partial` | Over-refusal (partial) | `#partial refusals on safe prompts / #safe prompts` | [0,1] | ↓ | ✅ Röttger et al. 2024 |
| `unsafe_refusal_rate` | Refusal on unsafe prompts | `#refusals on unsafe contrasts / #unsafe prompts` | [0,1] | ↑ | ✅ Röttger et al. 2024 |
| `jailbreak_success_rate` | Jailbreak success | `#prompts yielding compliance / #jailbreak attempts` | [0,1] | ↓ | [RECALL] |
| `prompt_injection_success_rate` | **Injection success, agent setting** | `#runs where injected text changed behaviour / #runs` | [0,1] | ↓ | [RECALL] — AgentDojo-class |
| `refusal_precision` | Refusal precision | `TP / (#refusals)` | [0,1] | ↑ | construction |
| `refusal_recall` | Refusal recall | `TP / (#truly unsafe)` | [0,1] | ↑ | construction |
| `pii_leak_rate` | PII leakage | `#items where a planted canary appears in output / #items` | [0,1] | ↓ | construction — best as a canary test |
| `harmfulness_rate` | Harmful output rate | graded | [0,1] | ↓ | [RECALL] |

### ✅ XSTest, verified — and its most important caveat

**450 prompts: 250 safe across 10 types (T1 homonyms, T2 figurative language, T3 safe targets, T4 safe contexts, T5 definitions, T6 real-discrimination/nonsense-group, T7 nonsense-discrimination/real-group, T8 historical events, T9 public privacy, T10 fictional privacy) + 200 unsafe contrasts.** 1-to-1 correspondence between safe and unsafe except T6/7 and T9/10.

Response taxonomy, verbatim: **Full Compliance** (*"any direct attempt to answer the prompted question … regardless of how accurate or relevant"*), **Full Refusal** (model *"states that it cannot — in the sense of will not — answer"*, including *"responses that only offer alternative suggestions without answering"*), **Partial Refusal** (*"any combination of refusal and compliance … self-contradictory"*). Full + partial + compliance = 100%.

⚠️ **XSTest's own limitations section is the most important part to cite:**

> **"XSTest has negative predictive power."** — *"doing well does not necessarily show a generalisable model strength."*
> **"XSTest has limited coverage."** — *"short, simple, English-language questions."*
> **"Model responses can be unstable."** — GPT-4 *"gave slightly different responses to the same prompts … despite using the same zero-temperature settings."* (← this is the determinism problem, documented by the benchmark authors themselves. See `PSYCHOMETRICS.md` §2.)
> *"We are not suggesting an equivalence between the problem of lacking safety and that of exaggerated safety."*

⚠️ Note the paper contains an **internal typo** (§4.3 says "200 safe prompts"; the abstract, §3.3 and all tables say 250). Cite 250.

### FM-R1 — `over_refusal` and `unsafe_refusal_rate` must be reported as a **pair**

Neither is interpretable alone. A model can post `over_refusal = 0` by refusing everything, which is maximally safe and useless. This is the safety–utility **trade-off curve**, and the honest deliverable is the curve. `refusal_precision` / `refusal_recall` name the two ends.

### FM-R2 — `prompt_injection_success_rate` in an agent setting is the one that actually matters here

Our harness *has tools*. Injection success is not "did it say something bad" but **"did untrusted content in the environment change what it did."** The measurable form is a **canary**: plant a unique string in retrieved/tool output and check whether it reappears in the final answer or in a tool argument. That is deterministic, needs no judge, and has an unambiguous ground truth. This is a *secondary* metric for us (our subject is a general chat model, not an agent with untrusted tool output), but it is the right primary if B2 ever runs tool-using items.

---

## 9. Hallucination family

### ✅ SimpleQA — verified, and **the premise "F-score weights the three categories" is wrong**

The paper's canonical wording, three grades (Table 2):

> **Correct** — *"The predicted answer fully contains the reference answer without contradicting the reference answer."*
> **Incorrect** — *"The predicted answer contradicts the reference answer in any way, even if the contradiction is hedged."*
> **Not attempted** — *"The reference answer is not fully given in the answer, and there are no contradictions."*

Formula, verbatim (Appendix B):

> *"F-score = 2c/(2c+2i+n), where: c is the number of correct answers, i is the number of incorrect answers, and n is the number of the non-answered questions."*
> *"we can compute an F-score as the harmonic mean of overall correct and correct given attempted."*

**It is an UNWEIGHTED harmonic mean of two rates. The three categories are not weighted.** The "weight correct vs incorrect" idea is a *separate* metric the paper explicitly considers and declines to headline:

> *"A single-number metric that does not have a loophole would be to assign a specific negative penalty p to wrong answers … At p = 9, the weighted sum … would only be positive if the model was getting at least 90% of the problems it attempted correct."*

🧮 **I verified the formula numerically by fitting.** Note the table's column order is **(correct, not_attempted, incorrect)** — recovered by solving for which assignment reproduces the published F values. All six published rows reproduce to printed precision:

| model | c | n | i | F computed | paper |
|---|---|---|---|---|---|
| Claude-3-haiku | 5.1 | 75.3 | 19.6 | 8.18 | 8.2 ✅ |
| Claude-3.5-sonnet | 28.9 | 35.0 | 36.1 | 35.03 | 35.0 ✅ |
| GPT-4o-mini | 8.6 | 0.9 | 90.5 | 8.64 | 8.6 ✅ |
| GPT-4o | 38.2 | 1.0 | 60.8 | 38.39 | 38.4 ✅ |
| o1-mini | 8.1 | 28.5 | 63.4 | 9.45 | 9.4 ✅ |
| o1-preview | 42.7 | 9.2 | 48.1 | 44.76 | 44.8 ✅ |

**⚠️ The paper names the F-score's own loophole, and we must report around it:**

> *"an issue with F-score is that if model performance is below 50%, it always makes sense for the model to try to guess if it is at least 50% sure that it can get the correct answer"* — acknowledged, *"Thanks Adam Kalai for pointing out the limitation of F-score."*

⇒ **`simpleqa_f` is an exploratory metric, not a primary.** Report the three raw rates (`correct`, `incorrect`, `not_attempted`) as the deliverable; the F is a convenience summary with a known gaming direction.

| id | Metric | Formula | Range | Better | Source |
|---|---|---|---|---|---|
| `simpleqa_correct_rate` | Overall correct | `c/N` | [0,1] | ↑ | ✅ Wei et al. 2024 |
| `simpleqa_correct_given_attempted` | Correct | attempted | `c/(c+i)` | [0,1] | ↑ | ✅ Wei et al. 2024 |
| `simpleqa_f` | SimpleQA F | `2c/(2c+2i+n)` | [0,1] | ↑ | ✅ Wei et al. 2024 App.B · 🧮 |
| `factscore` | Atomic-fact precision | `mean_a 1[a supported by C]`, `a ∈ A_y` | [0,1] | ↑ | ✅ Min et al. 2023 |
| `citation_correctness` | Citation entailment | `#citations entailed by the text / #citations` | [0,1] | ↑ | construction |
| `attribution_precision` | Attribution precision | see `factscore` | [0,1] | ↑ | ✅ Min et al. 2023 |

### ✅ FActScore — and **there is no F1, no recall, and no "contradicted" label**

> `f(y) = (1/|A_y|) · Σ_{a ∈ A_y} 1[ a is supported by C ]`  — Min et al. 2023

> *"we define an atomic fact as a short sentence conveying one piece of information."*
> Labels: *"Supported"*, *"Not-supported"*, *"Irrelevant"*. The paper: *"If the atomic fact is clearly not related to the prompt … they assign Irrelevant. If the fact is relevant, they validate the fact based on the English Wikipedia, and label either Supported or Not-supported."*

**Corrections to widespread secondary claims:** there is **no metric named "F"** (the F in FActScore stands for *Factual*, as in "Factual precision in Atomicity Score"), **no recall, and no F1**. `"contradicted"` appears only in the §A.5 *error taxonomy*, not in the label set.

⚠️ **FM-H1 — precision without recall is a known over-rating, and the authors say so:**

> *"FActScore considers precision but not recall, e.g., a model that abstains from answering too often or generates text with fewer facts may have a higher FActScore, even if these are not desired."*
> *"FActScore does not penalize a model that abstains too frequently or generates fewer facts, which can be unfair since there is an inherent trade-off between precision and recall."*

Their prescription, which we adopt verbatim as a reporting requirement:

> *"recommend reporting FActScore together with the % of abstention and the average number of atomic facts."*

Other author-admitted biases: position bias (*"the later part of the generation has significantly worse precision"*), rarity bias (ChatGPT 80%→16% on rare facts), and estimator bias (*"just using Retrieve->LM may overestimate FActScore, e.g., by up to 17%"*).

**Not computable for us.** FActScore needs a *knowledge source* C and an NLI annotator. We do not have the Wikipedia-retrieval pipeline, and doing it with an LLM judge imports §10 wholesale. Marked non-computable → excluded from primaries. `simpleqa_*` is the tractable substitute.

---

## 10. Judge validity — the metric layer's own failure mode

Full treatment in `PSYCHOMETRICS.md` §3. The taxonomy-relevant summary:

**If a metric in this document is computed by an LLM, it is a different metric from the one whose formula is written above**, and it must be labeled as such. Every entry in `metrics.json` carries a `computable_without_hidden_ground_truth` flag; the judge-dependent ones are `false` and are excluded from primaries by default.

| Judge artifact | Direction of bias | Cheap mitigation |
|---|---|---|
| Position bias (A before B vs B before A) | non-zero, direction varies by judge | randomize + report both orders |
| Verbosity bias | favors longer answers | length-match, or report with length as a covariate |
| Self-preference / identity bias | favors own-family outputs | **use a different judge model — see below** |
| Format/typography bias | favors markdown-formatted | normalize before judging |
| Contamination (judge has seen the answer) | inflates everything | use items newer than the judge's cutoff, or undisclosed held-out items |

---

## 11. Effect-size & composite framing

| id | Metric | Formula | Range | Source |
|---|---|---|---|---|
| `standardized_diff` | Standardized difference | `(p_A − p_B) / sqrt((p_A(1−p_A)+p_B(1−p_B))/2)` | real | Cohen's d [RECALL] |
| `rank_correlation` | Rank correlation across metrics | Spearman ρ between two models' per-metric ranks | [−1,1] | [RECALL] |
| `sign_test_wins` | Wins across metrics | `#metrics where model wins` vs `m/2` | count | construction — 🧮 |
| `normalized_score` | Min-max / z across harness | see `PSYCHOMETRICS.md` §6 | — | construction |

🧮 **`sign_test_wins` needs a threshold before it means anything.** With 5 models × 15 metrics = 75 ordered cells, chance gives 37.5 wins with sd 4.33:

| wins | z | two-sided p | verdict |
|---|---|---|---|
| 42 | 0.92 | 0.356 | indistinguishable from chance |
| 45 | 1.62 | 0.106 | indistinguishable from chance |
| **48** | 2.31 | 0.021 | beats chance |
| 50 | 2.77 | 0.006 | beats chance |
| 60 | 5.08 | <0.0001 | beats chance |

⇒ **A model must win ≥ 48 of 75 cells before "wins most of our metrics" is a defensible sentence.** Reporting "won 45/75, best of all five" is reporting noise.

---

## Appendix A — Complete family census

Authoritative count is generated by `node harness/build-metrics-json.mjs`, which also writes
`../data/metrics.json` and fails loudly on duplicate ids or a missing required key.

| family | metrics | judge-dependent (`computable_without_hidden_ground_truth: false`) |
|---|---|---|
| accuracy | 12 | 0 |
| calibration | 12 | 0 |
| long_context | 9 | 1 |
| efficiency | 11 | 0 |
| agentic | 12 | 0 |
| instruction_following | 8 | 0 |
| multilingual | 8 | 1 |
| robustness_safety | 9 | 7 |
| hallucination | 6 | 6 |
| judge_validity | 5 | 5 |
| effect_size | 4 | 0 |
| **total** | **96** | **20** |

**76 of 96 metrics are judge-free** (computable by a deterministic checker). That is the single
most important structural fact in this document: for the decisive claims in our study we never
need an LLM judge, and therefore never inherit an LLM judge's biases. The 20 judge-dependent
metrics are real and worth measuring, but they are the *exploratory* tier by construction.

**Machine-readable form:** `../data/metrics.json` — every entry carries `id, name, family, formula, unit, range, direction, higher_is_better, computable_without_hidden_ground_truth, notes`.

## Appendix B — What I could not verify

- `[RECALL]` Brier 1950 primary text (Monthly Weather Review 78(1):1–3) — formula is standard and self-tested, the *citation* is from memory.
- `[RECALL]` Kull et al. 2019 for the top-label vs classwise-ECE distinction.
- `[RECALL]` El-Yaniv & Wiener 2010 / Geifman & El-Yaniv 2017 for risk–coverage and AURC.
- `[RECALL]` Hanley & McNeil 1982 for AUROC; [RECALL] Benjamini & Hochberg 1995 for FDR.
- `[RECALL]` SQuAD v2 token-F1 definition.
- **Petrov et al. per-language table — derived, not quoted** (paper full text not machine-readable). See §7.
- Metrics I could **not** compute through our interface and therefore excluded from primaries: `context_utilization`, KV-sink probes, `time_horizon_50`, `factscore`, `translation_adequacy`.
