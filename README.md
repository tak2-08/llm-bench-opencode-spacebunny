# What does `opencode/space-bunny-free` resemble among frontier commercial models?

**A self-measured comparison, published with its audit trail intact.**

Subject: `opencode/space-bunny-free` · Round 1 · 88 programmatic items × 2 repetitions = **176 measured runs** ·
Harness and audit written from scratch, no third-party dependencies.

---

> # ⚠️ READ THIS FIRST — measured vs. reported
>
> This repository contains **two different kinds of number** and conflating them would
> invalidate everything below.
>
> | | What it means | How many |
> |---|---|---|
> | **`measured`** | We ran it ourselves, in this environment, and the raw log is in `reports/round1/`. | subject `opencode/space-bunny-free`, plus 3 other models that this service could actually reach |
> | **`reported`** | Somebody else ran it and published the number. We read their page. | **1,711 of the 1,711 frontier cells** in `data/frontier-scores.json` |
>
> **We measured no frontier commercial model, and that is a hard environmental fact, not a choice.**
> From this environment, `gpt-5.x`, `claude-opus-5`, `gemini-3-pro` and `grok-4.7` all return
> `"Unexpected server error"` (the provider endpoint has no API credits for this account);
> `gemini-3.1-pro-preview` exceeded its free-tier quota. So every frontier number in this
> repository is **second-hand**, tagged `reported`, and carries the URL it was read from.
>
> The models we *could* reach — `nvidia/z-ai/glm-5.3-flash`, `meta/muse-spark-1.3`,
> `nvidia/moonshotai/kimi-k3`, `google/gemini-flash-latest` — are **not frontier flagship
> models**. They are anchors of convenience. Calling them "frontier" would be false.
>
> Every claim in this repository is tagged `measured` | `reported` | `derived` | `assumed`.
> If a number has no tag, treat it as a mistake and report it.

---

## 1. The headline, stated correctly

The harness's own report said **86.9%**. **That number was wrong**, and an independent audit of
the same raw log corrected it. The correction is the interesting part of this repository.

| Denominator | n | correct | accuracy | Wilson 95% CI | source |
|---|---|---|---|---|---|
| `raw` — harness as shipped, any failure counts as wrong | 176 | 153 | **86.93%** | [81.15, 91.15] | `data/matching.json` → `subject_profile.run_level.raw` |
| `conservative` — never-measured runs removed, scorer artifacts credited, broken items **kept and scored wrong** | 174 | 161 | **92.53%** | [87.64, 95.58] | `…run_level.adjudicated_conservative` |
| `full` — additionally drops the 2 items that cannot be answered from their own text | 170 | 161 | **94.71%** | [90.25, 97.19] | `…run_level.adjudicated_full` |

**Quote 92.5% if you want the least generous correction. 94.7% is the same data with the two
defective items removed.** Both CIs barely overlap the naive CI, so the *direction* is not in
doubt even though the *level* moved 7.8 points. All three: `measured`.

### Per category (adjudicated, full) — `measured`

| category | correct/n | accuracy | Wilson 95% | as-shipped | artifact flips |
|---|---|---|---|---|---|
| reasoning | 30/30 | 100% | [88.65, 100] | 100% | 0 |
| function_calling | 16/16 | 100% | [80.64, 100] | 100% | 0 |
| long_context | 14/14 | 100% | [78.47, 100] | 87.5% | 0 |
| format_control | 12/12 | 100% | [75.75, 100] | 75% | 0 |
| robustness | 12/12 | 100% | [75.75, 100] | 100% | 0 |
| **abstention_hallucination** | **12/12** | **100%** | [75.75, 100] | **50%** | **6** |
| instruction_following | 27/28 | 96.43% | [82.29, 99.37] | 96.43% | 0 |
| multilingual | 25/30 | 83.33% | [66.44, 92.66] | 76.67% | 2 |
| code | 13/16 | 81.25% | [56.99, 93.41] | 81.25% | 0 |

Source: `data/matching.json` → `subject_profile.per_category`; narrative in
`reports/C2-matching-analysis.md` §1.2.

> **Do not read a ranking into this table.** The Wilson half-widths run 0.10–0.31. The gap
> between the 100% categories and the 81% category is 18.75 pp — *smaller than the sampling
> error inside a single category*. Any "the model is better at reasoning than at code" story
> is unsupported by this data. The 50% → 100% move in `abstention_hallucination` is the one
> real change, and all 6 flips were harness defects, not model behaviour (§5).

---

## 2. The scaffold caveat — read this before any comparison

> ### An agentic benchmark score is not a model property.
> ### It identifies a tuple of (model × scaffold × reasoning budget × tool access).

We did not assume this; we read it off first-party leaderboards. Same model, same benchmark,
**only the harness or the thinking mode changed**:

| Benchmark | Source | Model | Configuration A | Configuration B | Δ |
|---|---|---|---|---|---|
| GAIA | HAL (Princeton) | Claude Sonnet 4.5 | HAL generalist agent **74.55%** | HF Open Deep Research **30.91%** | **43.64 pp** |
| GAIA | HAL (Princeton) | Claude 3.7 Sonnet | HAL 56.36% | HF Open Deep Research 36.97% | 19.39 pp |
| GAIA | HAL (Princeton) | Claude Opus 4 (May 2025) | HAL 64.85% | HF Open Deep Research 57.58% | 7.27 pp |
| GAIA | HAL (Princeton) | **GPT-5 Medium** | HF-ODR **62.80%** | HAL 59.39% | **−3.41 pp (sign reverses)** |
| BFCL V4 | Berkeley | GPT-5.2-2025-12-11 | native tool calling 55.87% | text-prompt 45.27% | 10.60 pp |
| BFCL V4 | Berkeley | **Gemini-3-Pro-Preview** | native FC 68.14% | text-prompt **72.51%** | **−4.37 pp (sign reverses)** |
| HLE | Epoch AI | gpt-5.1 | `thinking` 23.68% | `instant` 6.80% | 16.88 pp |
| HLE | Epoch AI | claude-opus-4-6 | `thinking-max` 34.44% | `Non-Thinking` 19.00% | 15.44 pp |
| GPQA Diamond | Epoch AI | gpt-5.6-luna | best effort 91.6% | lowest effort 63.6% | 28.0 pp |

Source: `reports/C1-frontier-scores.md` §3; all rows `reported`, every number read from the
first-party table named in its row.

Three consequences, and they are not hedges:

1. **A constant correction factor does not exist.** The swing ranges from −4.37 pp to
   +43.64 pp and reverses sign for at least two models. Any "adjust for scaffold" step is
   guesswork.
2. **The GAIA spread (43.6 pp) is roughly six times a generational model gap.** A model's
   GAIA number identifies the *agent* more than the *model*.
3. **Our subject was measured under exactly one scaffold**, whose reasoning budget the
   service does not disclose. So an absolute-score match to any frontier row is not
   supportable — not "imprecise", **not supportable**.

This is why the answer below is a range and not a name.

---

## 3. The two measured anchors — and the fairness trap

Three other models were reachable. Two produced usable data. All were run on the **identical
45-item stratified subset** of the same bank, and — critically — **the same adjudication was
applied to the anchors as to the subject.**

| | subject | `nvidia/z-ai/glm-5.3-flash` | `meta/muse-spark-1.3` | `nvidia/moonshotai/kimi-k3` |
|---|---|---|---|---|
| raw (first attempt) | 86.93% | 77.78% | 91.11% | 61.90% |
| **after adjudication** | **94.71%** | **90.70%** | **97.67%** | **94.74%** |
| movement from adjudication | **+7.77 pp** | **+12.92 pp** | **+6.56 pp** | **+32.83 pp** |

Source: `data/matching.json` → `anchor_comparison.correction_asymmetry`.

> ### The single most important methodological result in this repository
>
> **Adjudication moved the anchors *more* than it moved the subject.**
>
> Our first analytical pass audited the subject and left the anchors raw — the natural,
> obvious thing to do when the subject is the thing under study. That produced
> "subject 94.71% vs glm 77.78%", a 17-point gap, and the confident claim *the subject beats
> every anchor*. **That entire finding was an artefact of auditing only one side.**
>
> This is why `harness/adjudicate-anchors.mjs` re-audits the subject log with *its own* rule
> engine and **asserts verdict/rule/changed/original agreement with the original audit on
> 176 of 176 runs**, refusing to proceed (exit 2) on any mismatch. Fairness here is not a
> promise; it is a check that fails loudly.

### Like-for-like on the 43 shared scorable items

| | `glm-5.3-flash` | `muse-spark-1.3` |
|---|---|---|
| anchor accuracy | 90.70% (39/43) | 97.67% (42/43) |
| subject — both reps correct (conservative) | 90.70% (39/43) | 90.70% (39/43) |
| subject — mean of 2 reps (unbiased) | 95.35% (41/43) | 95.35% (41/43) |
| subject — either rep correct (optimistic) | 100% (43/43) | 100% (43/43) |
| **gap (unbiased mean)** | **+4.65 pp** | **−2.33 pp** |
| McNemar b / c | 3 / 3 | 0 / 3 |
| **McNemar exact two-sided p** | **1.000** | **0.250** |
| vs. the reproducibility floor (§4) | **inside — not resolvable** | **inside — not resolvable** |

Source: `data/matching.json` → `anchor_comparison.paired`; all `measured`.

**Read the subject's row as a range, not a number.** The anchors ran 1 repetition; the subject
ran 2. The subject's item-level accuracy is therefore 90.70 / 95.35 / 100 — a **9.3 pp wide
range, wider than the 6.98 pp difference between the two anchors.** Reporting the mean alone
would be a choice; we report the bracket and take the mean for the gap, because the mean is
the unbiased estimator.

Two other anchors were run and are reported in the appendix rather than the headline:
`kimi-k3` failed on **reliability, not capability** (9 of 28 runs returned no text part, so
only 21 of 45 items were ever reached — its 61.9% measures the transport); `gemini-flash-latest`
produced an API error on both runs, 0 of 45 items attempted.

---

## 4. The reproducibility floor — a measurement, not an estimate

We measured our own noise instead of assuming it. 85 items have both repetitions in the
adjudicated log:

| | n items | agree | rate | discordant | b (r0 wrong→r1 right) | c (r0 right→r1 wrong) | q | exact McNemar p |
|---|---|---|---|---|---|---|---|---|
| raw verdicts | 88 | 83 | 94.32% | 5 | 3 | 2 | 0.0568 | 1.000 |
| **adjudicated verdicts** | **85** | **80** | **94.12%** | **5** | **3** | **2** | **0.0588** | **1.000** |

Source: `data/matching.json` → `subject_profile.rep_agreement`; `reports/B3-qc-audit.md` §4.

Inverting the pre-registered sample-size formula at the **measured** q = 0.0588:

| design | α | power | **minimum detectable effect** |
|---|---|---|---|
| paired (McNemar), 1 rep/item | .05 | .80 | **7.37 pp** |
| paired, mean of 2 reps | .05 | .80 | **≈5.21 pp** |

Source: `data/matching.json` → `subject_profile.reproducibility_floor_pp`.

Three things follow, and they are load-bearing:

1. **Both anchor gaps are inside the floor.** +4.65 pp and −2.33 pp against a 7.37 pp floor.
   We cannot separate the subject from either anchor. Not "the difference is small" — *not
   resolvable at this n*.
2. **A 5 pp claim was never available.** Our pre-registered declared-effect rule therefore
   holds at **≥10 pp**, not 5 pp.
3. **This floor is our harness's, not the domain's.** The same model on the same benchmark
   swings 4.24–43.64 pp when only the scaffold changes (§2). **That is up to ~6× our entire
   reproducibility floor.** Our *n* is adequate for separating models that differ by more than
   ~7 pp on *this bank under this one scaffold*; it says nothing about models that differ
   mainly in scaffold.
4. `q` rests on 5 discordant items, so the floor carries real sampling uncertainty of its own.
   Treat it as **7.4 pp ± ~1 pp**, not as a constant.

---

## 5. What we got wrong — and how we found out

This section is the point of the repository, not an apology for it.

### 5.1 The harness shipped a false contract

`harness/report.mjs` and `harness/README.md` both state:

> *"Accuracy counts only runs that produced a non-empty answer and were scored; transport
> failures are excluded from the denominator and reported separately as reliability."*

**That sentence was false in code.** `harness/aggregate.mjs:81-83` implements `isScored(r)` as
`r.scored === true && typeof r.passed === 'boolean'`, which checks neither `r.failure` nor
whether the answer is empty. The same report printed `reliability: 98.9%`, computed correctly
and separately — so 2 runs were counted **simultaneously** as 1.1% unreliability *and* 1.1%
accuracy failure. A docstring and a README were describing behaviour the code did not have.

Behind it sat a three-link chain, each link independently sufficient:

1. `harness/runner.mjs:328` — the `catch` around `spawn` calls `finish()`, which closes over
   `const outChunks` declared three lines later at `runner.mjs:331`. Temporal dead zone →
   `ReferenceError` thrown *from inside a catch*, which the same catch cannot catch → the
   promise **rejects**, violating `runner.mjs`'s own documented contract at `:278`
   ("Resolves — never rejects").
2. `harness/pool.mjs:244` — `applyScore` runs unconditionally, including on failure records,
   so `answer: ''` becomes `scored: true, passed: false`.
3. `harness/aggregate.mjs:81-83` — as above.

**What actually triggered it, measured not inferred:** item `lc-needle-08`'s prompt is
**180,351 characters**. Linux caps a single `argv` element at `MAX_ARG_STRLEN = 131,072`.
Measured: 131,000 → ok, 131,073 → `E2BIG`, and a real `spawn` of `opencode` with that prompt
throws synchronously. **`lc-needle-08` is the only item of 88 over the limit** (2nd longest:
120,454), and the other 7 long-context items all pass — exactly the pattern a size limit
predicts. **The model was never called.** `lc-needle-08` is unmeasurable through this harness
as built; it reproduced in a second independent round and is marked non-retriable, so it will
never self-heal. Source: `reports/B3-qc-audit.md` §1.

### 5.2 Eight scorer artifacts were charged to the model

The abstention items are scored with a pattern opening `^(?![\s\S]*\d)`, a negative lookahead
that forbids **any digit anywhere in the answer**. The natural, informative way to abstain from
a passage full of dates is to enumerate the dates that *are* present and then say the asked-for
fact is absent. Every one of these answers does exactly that, and that is what the regex
punishes. Strip **only** the lookahead and 5 of 6 match immediately. The 6th is a second,
independent defect (a correct abstention phrased outside the pattern's closed ~15-word
vocabulary). The effect **inverts the intended difficulty: the more informative the
abstention, the more certain the failure.**

Two `numeric` failures have the same shape; `harness/scorers.mjs:332` documents itself as
*"First number in the text"* while a correct multi-step trace starts at step 1.

**We did not patch the harness mid-round.** The round's log was already in hand, and changing
what a re-run means while the round is live is worse than a known defect. The three code
locations are recorded in `data/qc-summary.json` for whoever patches them.

### 5.3 The item bank itself had two defective items

Neither found by a test; both found by auditing the failures.

- **`fmt-nested-02` — the prompt contradicts its own expected answer.** The prompt says the id
  must be *"the letter S followed by the digits of 2 and then 40 **with no separator**"*; the
  scored value is `"S-240"`, which contains a hyphen. The model answered `"S240"` — exactly
  what it was told. **On the merits the model is right and the bank is wrong.** Excluded rather
  than credited, because crediting it would assert a capability the item never tested.
- **`fmt-flat-01` — the item is unanswerable.** It gives readings `-1, 4, 22` and asks for
  *"the string that matches the warmest reading: drizzle, clear, windy"*, but the passage
  contains **no mapping from a reading to a condition**. The bank's `"windy"` and the model's
  `"clear"` are equally unconstrained guesses. There is no right answer.

Both are excluded for **all** models, and both are inside the 45-item anchor subset — so the
anchor *ranking* is unaffected (both anchors hold both items); only the level moves, 45 → 43.

### 5.4 Contamination: partly confirmed, partly a false positive

- **Refuted.** The phrase *"someone is still awake"* in one answer was flagged as a
  tool-written note. It is that item's own natural English answer, and the item's forbidden
  word was `basically`, which the model avoided. A scanner reading this as contamination is
  pattern-matching on English, not auditing.
- **Confirmed, and small.** 2 of 176 runs (1.14%) carried a session-protocol prologue. Both
  were adjudicated on the answer, not the prefix; the verdict is identical either way.
  **Directional bias: zero.** The item in question is boilerplate-free in its other
  repetition, so the leakage is a per-run coin flip, not a per-item property.
- **The finding that matters for interpretation.** `--pure` blocks ambient workspace
  *injection*; it does not stop the model from *using tools itself*. **5 runs called `bash`
  (7 calls) and all 5 passed** — two of them computed a fast-doubling modular Fibonacci, so
  without the tool the task would have been different and harder. **The scaffold varied inside
  a single measurement.** Reported as a diagnostic, not corrected: excluding those runs would
  invent a second bias.

### 5.5 Statistical tools that lie, and how we knew

Both were caught by auditing rather than by a test, and both are documented because they are
the kind of thing that silently flattens a correlation:

- A `gap()` helper returned **0 when two intervals overlapped**. Read as a distance, "0" looks
  like "identical"; it actually means *no information*. An entire first analytical pass ranked
  candidates by that zero. Replaced with centre distance.
- A floor accessor accepted its verdict function as a **string** and never called it, so the
  "naive floor" was a byte-copy of the "corrected floor" — two numbers, one computation, and
  both about to be published with `p = 1`.
- The audit's own `--strict` gate caught **three real bugs in the audit itself** (one rule that
  silently never fired, the accessor above, a summary writer that clobbered another log's
  entry). Its first fixture was also vacuous; it was fixed and then verified by *deliberately
  breaking the accessor* and confirming the gate fails with exit 2. A test that cannot fail is
  not a test.
- We recomputed one formula in the wrong direction. The naive `1-(1-p̂)^k` pass@k estimator is
  always an **under**-estimate of the unbiased one, by up to 10.6 pp at n=200 — we had it
  backwards, and the self-test corrected us.

**What we did *not* get wrong, and checked anyway:** the item bank's answers are not
hand-typed. 84 of 88 items are emitted by a seeded generator, and every answer is re-derived
by a **second, deliberately different implementation** (naive repeated multiplication ↔ binary
exponentiation with BigInt; Cramer's rule ↔ Gauss-Jordan over exact rationals; BFS ↔
Bellman-Ford; forward simulation ↔ recursive-descent expression parsing). 824 checks, 0
failures — including 88/88 positive controls (a correct answer must be *accepted*), 80/80
negative controls (a plausible wrong answer must be *rejected*) and 55/55 mutations. Without
positive controls, a scorer that rejects everything would pass every negative control.

**The raw trail is preserved byte-identical.** `reports/round1/subject-88/run-log.jsonl` has
md5 `e6f8d8a29525f66e064ef5dbaf0b4f14` before the audit, after it, and after two further runs.
Corrected verdicts live in a **separate** file (`run-log.adjudicated.jsonl`) with the raw
fields preserved. Adjudication emits the rule id that fired for every changed verdict, so
`run_id → original → corrected → rule` is traceable end to end, and the human readings are in
an explicit table rather than buried in code.

---

## 6. The answer to the question

> ### Within this round's precision, the subject is **not distinguishable** from either measured anchor…
>
> +4.65 pp vs `glm-5.3-flash` (McNemar exact p = 1.000) and −2.33 pp vs `muse-spark-1.3`
> (p = 0.250), both inside the 7.37 pp reproducibility floor.
>
> ### …and against the frontier table, **no single model can be named.**
>
> - The subject's per-axis bands (n = 6–15 items, Wilson half-width 0.10–0.31) contain the
>   score interval of **86 of the 119** comparable models **on every live axis**.
> - **Straddler count is 0.** There is no profile that is above the subject on some axes and
>   below on others — the shape that "resembles" would have to take does not exist in this data.
> - The **minimum attainable permutation p is 2/k! = 0.0833 at k = 4**, and 0 models reach
>   k = 4 axes. This is an integer, not a data limitation: **at k = 4 no sample size and no
>   data quality can reach α = .05.** Zero candidates are resolvable.
> - Per-axis, only 3 of 4 axes discriminate at all: `abstention` is a **null axis** (0 of 66
>   models fall outside the subject's band there).
>
> **The defensible claim is a range, not a name:** *the subject is consistent with the
> mid-to-upper region of the 2025–2026 frontier field, and excludes nothing inside it.*

Source: `data/matching.json` → `frontier_match.discriminating_power`, `frontier_match.coverage`.

### Why the name-matching attempt is a dead end — 4-axis coverage is an artefact

Six models reach 4 axes, and **all six are 2025-vintage from two vendors** (`gpt-4.1`,
`gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-5-mini`, `claude-haiku-4-5`, `claude-sonnet-4-5`). The
fourth axis is BFCL, last updated **2026-04-12**, so 2026 flagships are missing from it
**by data staleness, not by weakness**. Reading that corner as "the subject resembles a 2025
mid-tier model" is a restatement of the fact that our instrument can only see that corner.

Five of the bank's nine categories have **no counterpart at all** in the frontier table
(`instruction_following`, `format_control`, `multilingual`, `long_context`, `robustness` →
0 cells), which caps the axis count at 4. Reaching k = 5 — the first k that *can* clear α = .05
— needs **two** new axes, and one new axis only buys k = 4, which is still structurally
unresolvable.

### The obvious alternative is a trap: do not rank the "closest" models

Centre distances to the nearest candidates are `gemini-2.5-pro-preview-03-25` 6.40 pp (2 axes),
`qwen3.6-max-preview` 7.32 pp (2 axes), `deepseek-r1-0528` 7.48 pp (2 axes), `kimi-k3` 12.77 pp
(3 axes), `claude-opus-4-8` 15.14 pp (3 axes), `gpt-5` 15.80 pp (3 axes). **This is not a
ranking.** Centre distances across different axis counts are not comparable, and the top three
sit within our own floor. The ordering is a technical product of axis count, nothing more.

---

## 7. Latency, with the units right

| | end-to-end median | pure-model segment median | pre-model share |
|---|---|---|---|
| **subject** `opencode/space-bunny-free` | 24,817 ms | **496 ms** | **93.33%** |
| `meta/muse-spark-1.3` | 25,201 ms | 2,541 ms | 85.51% |
| `nvidia/z-ai/glm-5.3-flash` | 63,270 ms | 8,203 ms | 78.71% |
| `nvidia/moonshotai/kimi-k3` | 78,544 ms | 2,933 ms | 98.03% |

Source: `data/matching.json` → `subject_profile.latency`, `anchor_comparison.anchor_latency`.

**93% of the subject's end-to-end latency is process boot and provider queueing, not
inference.** End-to-end, the subject and `muse-spark-1.3` are indistinguishable (1.01×). The
subject is 5–16× faster only in the pure-model segment. Reporting end-to-end wall time as
"model latency" would measure the CLI, not the model. This is also why the concurrency
recommendation is 1: measured peak child RSS was ~557–572 MB against a 2 GiB cgroup, and at
concurrency 2 the same runs took 17.5 s instead of 10.2 s.

**No metric here is a true time-to-first-token.** `opencode run` emits one whole-text part with
no token deltas, so every TTFT figure here is an **upper bound** on the true first-token time.

**Cost is not reported as a capability.** The subject ran on a free tier, so `cost = 0` is a
billing fact, not efficiency. A cost-per-solved-task metric would be 0/0. Token counters are
recorded instead, and any shadow price must carry a dated, sourced price table.

### Token counters — the real cost proxies

| counter | n | median | mean | p95 | max | total |
|---|---|---|---|---|---|---|
| prompt tokens | 174 | 18,539 | 20,063 | 34,129 | 57,060 | 3,491,015 |
| reasoning tokens | 174 | 79.5 | 131.5 | 526 | 1,200 | **22,876** |
| output tokens | 176 | 3 | 15.5 | 46 | 284 | 2,728 |
| cost | 176 | — | — | — | — | **0** (free tier) |

Source: `reports/round1/subject-88/report.json` → `overall`.

Two cautions. First, `token_source` is **`mixed|char4`**: output tokens come from the
`step_finish` usage counters where available and fall back to a `ceil(chars/4)` proxy
otherwise, which **under-counts code and over-counts Hangul/CJK** — our multilingual items are
affected. Second, a median of **3 output tokens** is the honest shape of this bank: these are
short factual answers, not essays. That is a property of the instrument, and it is why
`long_context` shows 42 total output tokens across 16 runs.

---

## 8. Threats to validity, ranked

Full list with quantifications in [`LIMITATIONS.md`](LIMITATIONS.md). The top five:

1. **The item bank was written by an LLM of the same family that grades it.** Answer
   *correctness* is machine-guaranteed by two independent derivations (824 checks, 0 fail), but
   item *selection*, vocabulary and difficulty calibration carry the author's fingerprint. An
   advantage on this bank cannot be separated from genealogy. **Unresolvable within one
   session.**
2. **Format compliance is confounded with capability.** 52 of 88 items use strict format
   scorers. The subject's *hinted* abstentions were correct but scored wrong, costing 6 runs.
3. **n is below what a 5 pp claim needs.** Measured q = 0.0588 → floor 7.37 pp; we share 45
   items and the anchors ran 1 repetition. Both gaps sit inside the floor.
4. **`function_calling` and `code` are proxies, not agentic success.** The isolated harness
   exposes no tools and has no final-state check, so "task success" here means *a
   schema-shaped call was emitted*. Worse, 5 subject runs used `bash` — the scaffold moved
   inside one measurement.
5. **The reasoning budget is chosen by the service and never disclosed.** The subject emitted
   **22,876 reasoning tokens** (median 79.5, max 1,200) across the 174 runs that reported the
   field, but the effort parameter itself is not exposed. This is exactly the axis worth
   15–28 pp on the benchmarks we are compared against, and we cannot locate ourselves on it.

Ranks 6–10 (5, 3, 9, 10, 2 in the internal ordering) cover: the service is free-tier so cost
degenerate; the abstention family has **no convention-free F** — two defensible readings of the
same runs are 50 F-points apart, and the convention is named explicitly on the axis; nine
categories but five have no frontier counterpart; the 4-axis corner is 2025-only; one
long-context item is unmeasurable through a command-line harness.

---

## 9. Reproducing this

**Requirements: Node.js v20+ and nothing else.** The harness imports only Node built-ins
(`node:fs`, `node:path`, `node:crypto`, `node:child_process`, `node:url`, `node:os`, `node:vm`).
There is no `package.json`, no lockfile, no `node_modules`, and no third-party package. You can
confirm it yourself:

```bash
grep -rhoE "from '[^']+'" harness/*.mjs harness/bin/*.mjs | sort -u
```

A GitHub token was present in the original measurement environment; it is **not** in this
repository, and nothing here needs one except pushing.

### One command

```bash
./scripts/verify.sh
```

Runs the offline unit tests, rebuilds and byte-compares the item bank, and executes both
statistical self-test suites. No model calls, no network, a few seconds.

### Re-running the measurement (costs real model calls)

```bash
cd harness
node bin/run-bench.mjs --items items.json \
  --models opencode/space-bunny-free \
  --reps 2 --concurrency 1 --out ../reports/round1/subject-88
```

Then re-derive every number in this README:

```bash
node harness/adjudicate.mjs --strict        # per-run verdicts + floor
node harness/adjudicate-anchors.mjs --strict # anchors, with a 176/176 self-check
node harness/stat-verify.mjs                  # 234 checks, 0 failures
node harness/psycho-verify.mjs                # formula self-tests
node harness/matching.mjs                     # data/matching.json
```

Rebuilding the frontier table requires network access and the raw downloads described in
`extract/c1/README.md`; `data/frontier-scores.json` and `reports/C1-frontier-scores.md` are
committed, and `node extract/c1/report.mjs` regenerates the report from the JSON with no
hand-typed numbers (verified byte-identical).

### Determinism

`data/matching.json` is deterministic apart from its `generated_at` field. The adjudicated
logs are byte-identical across consecutive runs. `harness/items.json` is byte-identical to a
rebuild from the recorded seed.

---

## 10. Repository map

| path | what |
|---|---|
| `README.md` | this document |
| `METHODOLOGY.md` | how the measurement works; what it does and does not measure |
| `FINDINGS.md` | condensed result tables |
| `LIMITATIONS.md` | threats to validity, ranked and quantified |
| `PII-SCAN.md` | the scrubbing command and its verbatim clean output |
| `CITATION.cff` | citation metadata |
| `LICENSE` | CC BY 4.0 (see `data/ATTRIBUTION.md` for the Epoch carve-out) |
| `harness/` | the measurement harness, the audit tool, the item-bank generator, statistical self-tests, `METRICS.md`, `PSYCHOMETRICS.md`, 73 tests |
| `data/` | `benchmarks.json` (76 benchmarks), `metrics.json` (96 metrics), **`frontier-scores.json` (1,711 reported cells — Epoch AI, CC BY 4.0)**, `matching.json`, `qc-summary.json`, `ATTRIBUTION.md` |
| `reports/` | the six working reports (mostly Korean, as written) and `round1/` — **the raw evidence**: per-run logs, full untruncated subprocess captures, adjudication tables, per-round reports |
| `extract/c1/` | the scripts that built `frontier-scores.json`, plus the audit scripts and a record of two bugs they caught |
| `scripts/` | `verify.sh` (offline, no model calls) and `reproduce.sh` (full analysis chain) |

The raw run logs and subprocess captures are ~9 MB and are kept deliberately: **a claim
without its raw trail is not publishable.** `reports/round1/*/artifacts/<run_id>.stdout.txt`
is the complete, untruncated child output for every single run.

---

## 11. Attribution

**Our own work — harness, audit tool, item bank, analysis, prose — is CC BY 4.0.**

`data/frontier-scores.json` is **not** ours. 1,685 of its 1,711 cells are derived from the
**Epoch AI public benchmark dataset, licensed CC BY 4.0**, which requires crediting the source
and authors. That data remains under CC BY 4.0 regardless of this repository's licence terms.
The remaining 26 cells come from other first-party sources, each with its own terms, listed in
[`data/ATTRIBUTION.md`](data/ATTRIBUTION.md).

`data/benchmarks.json` and `data/metrics.json` describe benchmarks and metrics that other
people designed; their definitions are quoted from the primary papers and official
documentation, with URLs.

Full credits, licences, retrieval dates and per-cell confidence in
**[`data/ATTRIBUTION.md`](data/ATTRIBUTION.md)**.

---

## 12. Citation

See [`CITATION.cff`](CITATION.cff). If you use the frontier-score table, cite Epoch AI; if you
use the harness, item bank or audit, cite this repository. The measured-vs-reported distinction
in the banner is the citation boundary: **citing this repository does not make you cite our
second-hand frontier numbers as our own.**
