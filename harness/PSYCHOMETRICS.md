# PSYCHOMETRICS.md — How to Make a Small Self-Run Benchmark Trustworthy

**Owner:** A2 (표준화연구소 / Standards Lab) · **Status:** v1 · **Date:** 2026-09-27
**Companion:** `METRICS.md` (what to measure) · **Numeric backing:** `psycho-verify.mjs`

> **Every number in this document is produced by `node harness/psycho-verify.mjs`**, which runs
> a self-test suite first and exits non-zero on any failure. If the script and this document
> ever disagree, the script is right and this document is stale. That is deliberate: I found and
> fixed **four** real errors in my own arithmetic this way (§0.4).

---

## 0. Preliminaries

### 0.1 The Wilson score interval

For `x` successes in `n` trials, with `z = z_{1−α/2}`:

```
center    p̃ = (p̂ + z²/(2n)) / (1 + z²/n)
halfwidth h = z/(1+z²/n) · sqrt( p̂(1−p̂)/n + z²/(4n²) )
CI        = [ p̃ − h , p̃ + h ]
```

Source: Brown, Cai & DasGupta (2001), *Interval estimation for a binomial proportion*, Statistical Science 16(2):101–133. `[RECALL]` for the citation; 🧮 the formula is self-tested.

**Never use the Wald interval `p̂ ± z√(p̂(1−p̂)/n)`.** It exits the probability interval entirely:

| n | x/n | Wilson 95% | Wald 95% | |
|---|---|---|---|---|
| 100 | 50.0% | [40.38%, 59.62%] | [40.20%, 59.80%] | Wald is close enough here |
| 100 | 5.0% | [2.15%, 11.18%] | [0.73%, 9.27%] | Wald **under-covers** |
| **20** | **5.0%** | **[0.89%, 23.61%]** | **[−4.55%, 14.55%]** | **Wald returns a negative probability** |
| 1000 | 20.0% | [17.64%, 22.59%] | [17.52%, 22.48%] | close |

If your n is small **or** your p is near 0 or 1, Wald is wrong. Self-tests assert that Wilson always contains `p̂` and always lies inside [0,1].

### 0.2 What a confidence interval does and does not license

A 95% CI is a statement about **the estimator**, not about the model: *"if we repeated this whole procedure many times, 95% of intervals built this way would cover the true value."* It is **not** "there is a 95% probability the true value is in this range." And overlapping CIs do **not** imply a non-significant difference, while non-overlapping ones do imply significance at roughly α<0.005 — which is why we use an explicit paired test instead of eyeballing intervals.

### 0.3 Three numbers, three meanings

| quantity | question it answers | n=400, p≈0.5, Δ=5pp |
|---|---|---|
| Wilson CI half-width | how precisely is one model pinned down? | ±4.88pp |
| McNemar p-value | is the observed difference unlikely under the null? | p=0.0292 → **"significant"** |
| achieved statistical power | *would we have detected a real 5pp gap?* | **60.9%** |

**All three can be true simultaneously, and for our budget they are.** A p<0.05 at 60.9% power means we are more likely than not to *miss* a real 5-point difference. This is the single most important sentence in this document, and it is the one most likely to be omitted from a report.

### 0.4 Errors I made and caught by computing (do not repeat these)

| # | Error | Symptom | Fix |
|---|---|---|---|
| 1 | Parentheses: `1 − erf(x)/2` instead of `(1 − erf(x))/2` | every p-value came out ≈0.97 instead of 0.029 | named the function `normUpperTail`; self-test now asserts the McNemar p |
| 2 | z-lookup table walked in the wrong direction | `zTwoSided(0.05)` returned 1.645 | replaced the table entirely with bisection on our own tail; added a **round-trip** test (`twoSidedP(zTwoSided(α)) == α`) |
| 3 | Hand-guessed `z(α=8.33e−4) = 3.394` | test failed; true value is **3.3415** (3.2905 belongs to α=0.001) | round-trip test made the hardcoded guess unnecessary |
| 4 | Asserted the naive pass@k estimator *over*-states | computing showed it **always under**-states, by up to 10.58pp | corrected, with a proof (§4.3) |

The lesson generalizes: **a formula asserted from memory is a hypothesis; a formula with a self-test is a result.** Errors 2 and 3 both lived in a "lookup table" — the one part of a stats routine nobody re-derives.

---

## 1. Minimum sample size and power

### 1.1 Unpaired design (subject and anchors on *different* items — avoid this)

```
n_per_group = (z_{1−α/2} + z_{1−β})² · (p₁(1−p₁) + p₂(1−p₂)) / (p₂ − p₁)²
```

At α=0.05 two-sided, for a **5pp** difference:

| p₁ → p₂ | n per group (power .80) | n per group (power .90) |
|---|---|---|
| 50% → 55% | **1562** | 2091 |
| 40% → 45% | 1531 | 2049 |
| 30% → 35% | 1374 | 1839 |
| 70% → 75% | 1248 | 1671 |
| 20% → 25% | 1091 | 1461 |
| 10% → 15% | 683 | 915 |
| 2% → 7% | 266 | 356 |

**An unpaired design needs ~1,562 items *per model per metric* to resolve 5pp.** We will not have that. Do not plan as if we will.

### 1.2 Paired design (subject and anchors on the **same** items — required)

Let `b` = items the subject gets right and the anchor wrong, `c` = the reverse, `q = b+c` = **discordance**, `d = c−b` = the accuracy gap. Then `Var̂(d) ≈ q/n`, so

```
n = (z_{1−α/2} + z_{1−β})² · q / d²
```

For **d = 5pp**, α=0.05 two-sided:

| measured discordance q | n (power .80) | n (power .90) |
|---|---|---|
| 5% | 157 | 211 |
| 10% | **314** | 421 |
| **20%** | **628** | **841** |
| 30% | 942 | 1261 |
| 40% | 1256 | 1682 |
| 50% | 1570 | 2102 |

Constraint: `|d| ≤ q`. At d=5pp, q cannot be below 5pp.

**Two properties worth internalizing:**

1. **The paired design is ~2.5× cheaper at q=0.20** (628 vs 1562) and gets *more* so as q falls. This is why §1's rule "same items" is not a nicety — it is the difference between a feasible and an infeasible benchmark.
2. **n scales with `q/d²`, not with `p(1−p)/d²`.** So the number that governs our budget is **how much the models disagree**, which is only knowable *after* running. ⇒ **Run a small pilot first and measure q.** Everything else in the design follows from q.

### 1.3 The worked example, and the trap

n=400 shared items, observed q=20%, observed gap 5pp. From q and d: `b = 0.075×400 = 30`, `c = 0.125×400 = 50`.

```
continuity-corrected McNemar:  z = (|c−b| − 0.5) / sqrt(b+c) = (20 − 0.5)/sqrt(80) = 2.180
two-sided p = 0.0292   →  "significant at α = 0.05"
achieved power = Φ( d·sqrt(n/q) − z_crit ) = Φ(0.05·sqrt(400/0.20) − 1.96) = Φ(0.276) = 60.9%
n required for 80% power = 628   →   we are 228 items short
```

**This is the trap: `p = 0.0292` is significant and the study is underpowered.** 60.9% power means a 39% chance of missing a real 5-point gap — a coin-flip-ish failure rate dressed up as a significant result. **Reporting "significant at p<0.05" from a 400-item run is a false claim about the model's difference, not just a weak one.**

At the same q: a **2pp** gap needs **n=3,925**; a **10pp** gap needs **n=157**.

### 1.4 What n we can actually afford, and what we may therefore claim

CI half-width for a single model at p≈0.5:

| n | Wilson half-width | total CI width |
|---|---|---|
| 100 | ±9.62pp | 19.23pp |
| 200 | ±6.86pp | 13.73pp |
| **400** | **±4.88pp** | 9.75pp |
| 1000 | ±3.09pp | 6.19pp |
| 1600 | ±2.45pp | 4.89pp |

**A 5pp gap is smaller than one CI half-width until n ≈ 380.** So:

> **Recommendation: our primary accuracy metric gets n ≥ 500 items. At n=500 with expected q≈0.20, we have 80% power for a 5pp gap against a single anchor (needs 628 — call it ~70–80%), and comfortable power for ≥10pp.**
> **We will NOT claim 5pp differences as resolved unless the measured q comes in low. We WILL claim ≥10pp differences.**

This is a **design constraint, not a result** — and it must appear in the report as a limitation, not be quietly discovered to be inconvenient after the fact. This is why it is in the pre-registration (§5.7).

### 1.5 Minimum viable n for the non-accuracy primaries

| metric | type | realistic n | note |
|---|---|---|---|
| `task_success_rate` | binary, paired | 60–120 | agentic items are expensive; q is *high* (agents disagree a lot) so this is the **best-powered** comparison per item |
| `ifeval_inst_strict` | per-instruction, paired | 200+ instructions | instructions within a prompt are correlated → **cluster-bootstrap over prompts, not over instructions** |
| `accuracy_lang` (language=ko) | binary, paired | 250+ | same power math as §1.2 |
| `ttft_model` | continuous | 30+ | latency is low-variance but **heavy-tailed** → median + IQR, never mean alone |
| `tokenization_premium` (language=ko) | ratio, deterministic | 20+ passages | essentially zero model variance; cost is a *fixed* count, not noise |

---

## 2. Determinism and reproducibility

### 2.1 What `temperature = 0` actually buys: **less than people assume**

Greedy decoding removes *sampling* randomness. It does **not** make inference bit-reproducible, because identical logits are not guaranteed across runs:

- **Batch-composition dependence.** Floating-point reductions are not associative; a different batch shape changes summation order, changes the last bits of the logits, and can flip an `argmax` on a near-tie. Under continuous batching, batch shape changes *between* runs as traffic arrives.
- **Kernel / hardware selection.** Different reduction algorithms, fusion decisions, or GPU counts give different last bits.
- **Mixture-of-experts routing.** Routing decisions are computed from logits and can flip on near-ties, changing the whole forward pass.

⇒ **Repeat a temperature-0 run 3–5 times on a fixed item subset and measure the observed self-agreement before claiming determinism.** If self-agreement is 99%, then a 1pp difference between two models is *below your own reproducibility floor* and must not be reported. **Publish this floor.** `[RECALL]` for the general numerics argument; it is standard serving-engine lore rather than something I verified in a specific paper this session.

**Independent corroboration that this is not hypothetical:** XSTest's authors report that GPT-4 *"gave slightly different responses to the same prompts when we were testing the model for an earlier preprint, **despite using the same zero-temperature settings**."* That is a frontier lab reporting non-determinism at T=0, observed by a separate research group.

### 2.2 Seed handling

- **Always record** the seed, temperature, top_p, top_k, and max_tokens for every run, whether or not you think they mattered. "We didn't seed" is unrecoverable.
- **Our own harness runs a stateless HTTP provider.** There is no sampling seed to pass. Consequently we *cannot* reproduce a run by re-seeding; the **only** reproducibility available to us is **re-running**. This is a genuine limitation to state.
- **Do not report a single T=0 run as if it were one draw from a fixed distribution.** It is *one* draw from the *serving* distribution, which is wider than the decoding distribution.

### 2.3 k samples and aggregation — the finding that surprises people

🧮 **For a plain mean, k buys nothing.** With items i.i.d. and samples i.i.d., `SE(mean) = sqrt(p(1−p)/(n·k))` depends **only on the product n·k**:

| design | generations | SE(pass@1 mean) |
|---|---|---|
| 100 items × 1 | 100 | 5.00pp |
| 50 × 2 | 100 | 5.00pp |
| 25 × 4 | 100 | 5.00pp |
| 10 × 10 | 100 | 5.00pp |

**Identical precision.** So if the headline is `pass_at_1`, **spend the whole budget on more items.** Splitting into k>1 is only worth it to buy (a) `pass_at_k` / `maj_at_k`, which are different *estimands*, or (b) within-item variance as a *diagnostic*.

**Our recommendation: `k=1` for the pre-registered primary accuracy metric, plus a `k=5` sub-study on a fixed 100-item subset** whose only purpose is to (i) establish the reproducibility floor from §2.1 and (ii) report `consistency_k` and `maj@5` as secondary. That is a clean separation: *precision on one estimand, diagnostics on another.*

### 2.4 The order-of-operations rule that prevents the most common self-deception

> **Never tune prompts, decode parameters, or item selection after seeing scores on the same items you then report.**

If you tune, you must either (a) re-run on a fresh held-out set, or (b) report the tuned configuration's score as **training-set** performance and state it as such. This is not pedantry: it is the single largest source of inflated numbers in small self-run benchmarks, and it is invisible unless declared in advance. Hence the pre-registration in §5.

---

## 3. Judge validity

### 3.1 Known artifacts, with directions

| artifact | what happens | detection | mitigation |
|---|---|---|---|
| **Position bias** | prefers whichever response is shown first | evaluate both orders; the two scores should agree | randomize order; report the order-swap delta |
| **Verbosity bias** | longer answer scores higher regardless of quality | correlate score with length; control length or length-match | report with length as covariate; prefer programmatic scoring |
| **Self-preference / identity bias** | favors outputs stylistically similar to its own | see §3.2 | **use a different judge model** |
| **Format bias** | markdown, headings, bullets score higher | compare raw vs rendered | normalize before judging |
| **Contamination** | judge has seen the reference answer | — | items **newer than the judge's training cutoff**, or undisclosed held-out items |
| **Sycophancy** | judge agrees with a confident/wrong answer | — | instruct the judge to be adversarial; ask for the *error* first |

### 3.2 Self-preference bias, and why grading with a *different* model matters

**The problem.** An LLM judge tends to score higher the output that "looks like" its own output — same phrasing habits, same structure, same confident register. This is a form of self-recognition, not reasoning. If the subject model is asked to judge itself, every score it gives its own answers is inflated, and the *anchors'* answers are penalized. The resulting report says "our model matches frontier models" when it has only established that our model recognises itself.

**How to test for it** (this is the part people skip):

1. **The identity-swap test.** Take `N` response pairs `(A, B)` that a *human* has already labelled with a known ordering or a known gold answer. Grade each pair with the judge. Then grade the same pairs with the *identity strings stripped* — model name, self-referential phrases ("as an AI", "I'm Claude"), signature formatting, and boilerplate removed.
2. **If the judge's verdicts change when identity is stripped, self-preference is present** and is measurable in your data.
3. **Quantify it:** report the swap delta as a number, e.g. *"position-swap Δ = 1.8pp; identity-strip Δ = 4.1pp"*. These are diagnostics about your *harness*, and they belong in the report's limitations.
4. **Also test the judge against a trivial control:** grade a gold answer against itself (must be ~100%) and a random shuffle of wrong answers against gold (must be near the false-positive rate you assume). A judge that fails the shuffle control is unusable at any α.

**Why a different judge model fixes most of this — and what it does not fix.**

Our subject is `opencode/space-bunny-free`. Grading with a different model (an anchor, or a distinct judge) breaks the identity-coupling *for the subject*: the judge has no stylistic investment in the subject's outputs. This is the single highest-value decision in the whole harness.

**But be precise about what it does and does not solve:**

- ✅ **Solved:** the judge cannot prefer the subject *as itself*. The dominant bias term is removed.
- ❌ **Not solved — the judge still has its own family preference.** If the judge is a Llama-family model, it will favor Llama-family anchors, systematically shifting the *baseline* the subject is measured against. **Different-model ≠ bias-free.** So: rotate the judge across ≥2 different families, and if the subject's standing changes between judges, **that instability is the finding** — report the spread, not a single judge's verdict.
- ❌ **Not solved — capability mismatch.** A weak judge cannot evaluate strong responses, and will inflate weak ones (it prefers answers it can verify). Judge capability is a **ceiling on measurable performance**.
- ❌ **Not solved — contamination.** An external judge may know the reference answers.

⇒ **The rule: use a different-family judge, rotate ≥2 families, report the inter-judge spread, and treat any claim that depends on a single judge as exploratory.**

### 3.3 When to prefer exact-match / programmatic grading — **our default**

| criterion | programmatic beats LLM judge |
|---|---|
| ground truth is a string / number / set | ✅ always — no judge needed, no bias to argue about |
| ground truth is a **final program state** (files, DB, exit code) | ✅ always — this is the gold standard for agentic tasks |
| output must satisfy a formal constraint (JSON schema, word count, regex) | ✅ always — and IFEval's authors chose exactly this for exactly this reason |
| semantic equivalence (paraphrase) | ⚠️ only if a deterministic checker exists (e.g. numeric/symbolic equivalence) |
| style, tone, helpfulness, harm | ❌ no programmatic route — judge required, so budget the bias audit |
| long-form factuality | ❌ no deterministic route at this scale |

**Our harness already reflects this correctly.** B1's `scorers.mjs` implements `exactMatch`, `contains`, `regexMatch`, `jsonSchema`, `choice`, `numeric`, `multiAllOf` — **all deterministic, all with no judge in the loop**, and `score()` is documented as never throwing and doing no I/O. **This is the correct design and it should not be diluted.** Our decisive metrics are all programmatic; the judge enters only in the exploratory tier.

### 3.4 The judge's own variance must be measured, not assumed

Run the judge twice on the same pairs (different seeds, or a second judge instance) and report **inter-judge agreement** (Cohen's κ for 2 raters on the same units, Krippendorff's α for >2 and for missing data). `[RECALL]` for the statistic names; the requirement is the point. If κ < 0.6, the judge is not a measurement instrument and the metric must be demoted to exploratory — **regardless of how good the headline number looks.**

---

## 4. Saturation and contamination

### 4.1 Saturation

Saturation = a benchmark cannot separate the models you care about, because the top of the leaderboard is bunched inside the metric's noise floor. Mechanically, with `m` models clustered within a metric's own measurement error, **the score ordering is dominated by noise and the top-ranked model is close to a random draw from the bunch.** Our §1 numbers quantify the floor: at n=400 the half-width is ±4.88pp, so a leaderboard with 2–3pt spacing is reporting measurement error.

**What to do:**

1. **Check the bunching before choosing the metric.** If the anchors are within ~1 CI half-width of each other, the metric cannot rank them. Report a **tied group**, not an ordering.
2. **Move to harder / less-saturated instruments.** MMLU/HellaSwag/HumanEval/GSM8k/MATH-500 are, for 2026 frontier purposes, *discharged* — A1 flagged this from Epoch AI's own saturation and contamination verdicts. Prefer agentic / long-horizon / instruction-following, where the frontier is not bunched.
3. **Prefer metrics with a wide dynamic range across our 5 models.** A metric where all five land in 88–92% is useless for the mission ("find a similar-scoring frontier model") *even if it is a good metric* — it cannot do the job we hired it for.
4. **Do not create saturation by cherry-picking the easy subset.** If we author items and they turn out to be too easy, that is a finding to report, not a reason to quietly harden them after seeing the scores (§2.4).

### 4.2 Contamination

| kind | what it does | our exposure |
|---|---|---|
| **train-set leakage** | the item's answer was in pretraining | **High and unavoidable** for any pre-2026 public benchmark. Our subject's cutoff is not published to us. |
| **judge contamination** | the judge knows the answer | Moderate for public items |
| **harness contamination** | our item bank overlaps a public benchmark | Low if we author fresh items and never publish them pre-run |
| **prompt-format familiarity** | the model has seen this exact prompt *shape* | **High** — format is memorized separately from content |

**Mitigations, in order of strength:**

1. **Fresh, unpublished, author-written items** with **no public provenance**. Strongest available.
2. **Per-run variation from a large generator** (variable names, surface forms, numeric constants, distractor counts) so no single string is memorized.
3. **Recent items** — anything from a window that post-dates the subject's cutoff. ⚠️ **We do not know the subject's cutoff**, so this is unavailable to us. Say so.
4. **Report the exposure, do not claim to have eliminated it.** Any "we verified no contamination" claim without a cutoff date is unsupportable.

**The honest statement for our report:** *we cannot certify non-contamination for a model whose training cutoff we do not know; we therefore (a) author fresh items, (b) perturb surface forms per run, (c) treat any unexpectedly high score on an item as a contamination hypothesis to investigate rather than a capability result to celebrate.* **An implausibly high score is a bug report, not a result.** This is worth a pre-registered rule because the temptation to celebrate is exactly when the error happens.

---

## 5. Multiple-comparisons discipline and the pre-registration

### 5.1 The false-discovery problem, quantified

Our design: **1 subject × 4 anchors × 15 metrics = 60 cells.** At an uncorrected α=0.05 per test, the **expected number of false positives is `0.05 × 60 = 3.0`**. So a table with 60 comparisons will show roughly **three "significant" differences that are pure noise** — and roughly half of those will look like findings, because a p=0.03 does not look like noise to a reader.

This is not a theoretical concern. It is the reason "our model beat the anchor on 7 of 15 metrics" is not a claim.

### 5.2 The cost of correcting, measured

Pairwise, q=20%, Δ=5pp, n required for 80% power:

| correction | α | z | n |
|---|---|---|---|
| uncorrected | 0.05 | 1.960 | **628** |
| Holm–Bonferroni, worst rank (m=60) | 8.33e−4 | 3.342 | 1400 |
| Benjamini–Hochberg, FDR 0.10, rank 1 of 60 | 1.67e−3 | 3.144 | 1271 |
| **Bonferroni over 6 primaries only** | **8.33e−3** | **—** | **969** |

**Correcting all 60 cells inflates n by 2.23× (628 → 1400).** But restricting the *decisive* claims to 6 pre-registered primaries costs only **969** — a **1.54×** inflation, and 31% fewer items than correcting everything.

> **That is the whole argument for pre-registration, in one line: it is both cheaper and more honest than correcting after the fact.**

### 5.3 Pre-registration: what it must fix in advance

1. **The primary metric list** (and the rule that only primaries support decisive claims).
2. **The test** for each primary (paired McNemar, α, and the minimum effect size we will claim).
3. **The analysis** — including the multiple-comparison procedure (Holm across the 6 primaries; Benjamini–Hochberg FDR=0.10 across the secondary tier, reported as *exploratory*).
4. **The stopping rule** — fixed n, no peeking-and-extending (or, if extended, a pre-specified sequential rule; do not ad-hoc).
5. **The exclusions** — what we will not compute at all (`context_utilization`, `time_horizon_50`, `factscore`: not measurable through our interface).
6. **The "this is a bug, not a result" rule** (§4.2).
7. **The decision rule for the mission question** — how a measured profile is turned into "this model is a similar-scoring substitute for frontier model X".

### 5.4 🧮 Effect-size framing: why "wins across metrics" needs a threshold

Scores from different harnesses are not comparable, so we compare **ranks**. With 5 models × 15 metrics = 75 ordered cells, chance gives 37.5 wins with sd 4.33:

| wins | z | two-sided p | verdict |
|---|---|---|---|
| 42 | 0.92 | 0.356 | indistinguishable from chance |
| 45 | 1.62 | 0.106 | **indistinguishable from chance** |
| **48** | 2.31 | 0.021 | beats chance |
| 50 | 2.77 | 0.006 | beats chance |
| 60 | 5.08 | <0.0001 | beats chance |

⇒ **A model must win ≥48 of 75 cells before "wins most of our metrics" is a defensible sentence.** "Won 45/75, best of all five" is reporting noise with a confident voice. **Report the count and the sign-test p together, always.**

### 5.5 Standardized differences, and when raw comparison is invalid

Use a standardized difference when comparing **the same metric across two harnesses with different n or different item difficulty**:

```
d = (p_A − p_B) / sqrt( (p_A(1−p_A) + p_B(1−p_B)) / 2 )
```

Use **rank correlation** (Spearman ρ over the per-metric ranks) to compare **two whole profiles**. Rule for the report: **never present two raw scores as a comparison unless they came from the same items with the same scorer.** If they did not, present the standardized difference or the ρ and say why.

### 5.6 Presenting results so readers do not over-read noise

- **Every decisive number ships with its CI and its n.** No exceptions.
- **Primary and secondary metrics are visually and structurally separated** — different tables, different headers, and the secondary table is captioned *"exploratory — not corrected for multiplicity, not decisive."*
- **Report power or the minimum detectable effect alongside every p-value.** A p-value without power is a trap; we will not publish one.
- **State the discordance q** for every paired comparison, because n and power are functions of q and the reader cannot otherwise judge the design.
- **Report ties as ties.** If three anchors are within one CI half-width, print a tie group.
- **Never lead with a per-metric win/loss table.** Lead with the primary six, then the composite.

### 5.7 ✅ THE PRE-REGISTRATION PROPOSAL

**Primary metrics — 7. Only these support decisive claims. Holm-corrected across the 7. Each tested paired (McNemar) against each anchor on identical items.**

| # | id | what it decides | n | test / min effect |
|---|---|---|---|---|
| **P1** | `pass_at_1` (exact_match, k=1) | **Core capability.** The headline number. | ≥500 | McNemar, declare ≥10pp; 5pp only if measured q ≤ 0.12 |
| **P2** | `task_success_rate` | **Can it do work unattended** (deterministic final-state checker, no judge). | 60–120 | McNemar, declare ≥15pp (agentic items are high-q; power per item is good) |
| **P3** | `ifeval_inst_strict` | **Control.** Does it obey explicit constraints. Program-verified. | ≥200 instructions, cluster-bootstrap over prompts | McNemar, declare ≥8pp |
| **P4** | `accuracy_lang` (language=ko) | **Localization** — our actual reason for caring. Paired with `tokenization_premium` (language=ko) as its cost twin. | ≥250 | McNemar, declare ≥10pp |
| **P5** | `ttft_model` (median, boot-excluded) | **Responsiveness.** Median + IQR, not mean. | ≥30 paired repeats | bootstrap CI on paired median difference, declare ≥100ms |
| **P6** | `shadow_cost_per_solved_task` | **Economics.** Token-priced, tagged `PRICED` with a dated price list. Raw token counters reported alongside. | derived from P1/P2 | bootstrap CI, declare ≥20% |
| **P7** | `sign_test_wins` (composite over the secondary tier) | **The mission answer itself** — is the profile closer to frontier model X than to Y. | 75 cells | sign test, **declare ≥48/75** |

**Why these seven and not others:** all seven are (a) computable through our actual interface, (b) judge-free or judge-audited, (c) not saturating across our 5 models, and (d) each answerable by a *program*. P7 is included as a primary deliberately — the mission is a matching question, and a matching question needs a pre-registered matching statistic or it will be answered by whichever cells look best.

**Secondary / exploratory — everything else. Reported in a separate table, BH FDR=0.10, captioned non-decisive.**

`pass_at_k_unbiased` (k=5 sub-study) · `maj_at_k` · `consistency_k` · `mean_pairwise_agreement` · `contains_match` (as the length diagnostic paired with exact_match) · `relaxed_match` · `token_f1` · `ece_toplabel` (verbalized self-report — **labelled as self-report, not belief**) · `mce` · `nll` · `brier_binary` · `overconfidence_rate` · `auroc_abstention` · `risk_coverage_curve` · `ttft_spawn` · `itl_mean` · `output_tps` · `total_latency` · `tokens_per_tool_call` · `trajectory_efficiency` · `tool_call_f1` · `argument_correctness` · `error_recovery_rate` (+ its failure-rate twin, mandatory) · `plan_adherence` · `state_tracking_correctness` · `long_horizon_slope` (**pending B1's definition confirmation**) · `ifeval_prompt_strict` · `ifeval_prompt_loose` · `ifeval_inst_loose` · `json_schema_conformance` · `format_violation_rate` · `prompt_robustness_delta` · `accuracy_lang` (all non-KO) · `lang_gap_vs_en` · `macro_avg_accuracy` · `micro_avg_accuracy` · `tokens_per_char` / `tokens_per_word` (per language) · `over_refusal_full` / `_partial` · `unsafe_refusal_rate` · `prompt_injection_success_rate` (canary form) · `pii_leak_rate` (canary form) · `simpleqa_correct_rate` · `simpleqa_correct_given_attempted` · `simpleqa_f` (**known gaming direction — exploratory only**) · `position_spread` · `needle_accuracy` · `ecl_absolute` / `ecl_relative` (+ full curve)

**Excluded — declared in advance, so their absence is not a post-hoc excuse:**
`context_utilization` and KV-sink probes (need logit/KV access) · `time_horizon_50` (`h_model` unidentified with our task lengths) · `factscore` (needs a knowledge source + NLI annotator) · `translation_adequacy` (no cheap trustworthy proxy) · `cost_per_solved_task` as a *measured* quantity (subject is free-tier → degenerate; **P6 replaces it with the token-priced version**).

### 5.8 The mission decision rule (pre-registered, so it cannot be reverse-engineered)

> The subject is declared a **similar-scoring substitute for anchor X** iff:
> 1. **P7** sign test: subject wins **≥48 of 75** cells against X's profile (and we state the full profile correlation ρ); **and**
> 2. **No primary metric (P1–P6) shows a significant difference exceeding its declared minimum effect** against X; **and**
> 3. The result **survives rotating the judge** for any judge-dependent secondary metric (≥2 families, spread reported).
>
> If (1) holds but (2) fails on any primary, the verdict is **"similar in aggregate, divergent on \<metric\>"** — and the divergence is reported with its CI. This three-part rule exists to prevent the failure mode where a good aggregate number papers over one decisive weakness.

---

## 6. Reproducibility checklist

Before any number goes in the report:

- [ ] `node harness/psycho-verify.mjs` exits 0 (all self-tests pass)
- [ ] Subject and **all** anchors scored on the **identical** item set
- [ ] Scorer is deterministic (no judge) for every primary metric
- [ ] n, CI, and measured discordance q reported for every comparison
- [ ] Power or minimum detectable effect reported alongside every p-value
- [ ] `temperature`, `top_p`, `max_tokens`, seed (or its absence) recorded per run
- [ ] Reproducibility floor measured (§2.1); no reported difference is smaller than it
- [ ] Primaries and secondaries in separate tables; secondary table captioned non-decisive
- [ ] Holm applied across the 7 primaries; BH FDR=0.10 across secondaries
- [ ] `cost` handled per FM-E1: raw tokens always recorded; prices dated and tagged `PRICED`; missing ≠ zero
- [ ] Contamination exposure stated, not claimed absent
- [ ] No primary metric depends on a single judge; if any does, it is demoted to exploratory
- [ ] Nothing was tuned on the items it is reported on
- [ ] git: no T2Editor file modified; all writes inside ``; no commit

---

## Appendix — Honest limits of this document

1. **The z-quantiles are computed, the power formulas are asymptotic.** The normal approximation is fine at our n; it would not be at n=20 with p=0.02. Our smallest stated n for a primary is 30 (latency), where we use a bootstrap instead of a z-test for exactly this reason.
2. **`mcnemar()` uses a continuity correction** and returns the uncorrected-to-small-sample result. At very low discordance counts, an exact McNemar (binomial) test is preferable; we did not implement it.
3. **We have not run these designs.** This document specifies what a trustworthy small benchmark looks like. The n figures are *requirements*, not achievements. Whether the federation's actual run meets them is B2's and B3's to report, and if the run came in under n, the correct response is to say so (§1.4), not to lower the bar.
4. `[RECALL]` items are catalogued in `METRICS.md` Appendix B.
