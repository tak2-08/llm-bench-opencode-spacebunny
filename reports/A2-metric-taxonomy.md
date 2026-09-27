# A2 — Evaluation Metric Taxonomy + Psychometric Apparatus

**Author:** A2, Federation A (표준화연구소 / Standards Lab) · **Date:** 2026-09-27
**Status:** complete · **Subject under study:** `opencode/space-bunny-free`
**Scope note:** T2Editor-v11 untouched, no commit. All writes inside this repository.

---

## 1. What I produced

| file | what it is |
|---|---|
| `harness/METRICS.md` | Full taxonomy: **96 metrics** across 11 families, each with formula · unit · range · direction · failure modes · source |
| `harness/PSYCHOMETRICS.md` | The honest-evaluation apparatus: power, determinism, judge validity, saturation, multiplicity, effect sizes, **pre-registration** |
| `harness/psycho-verify.mjs` | Every number in the docs, computed. Self-tests run first; exits non-zero on failure |
| `harness/build-metrics-json.mjs` | Generates the JSON from one table, so the machine-readable twin cannot drift |
| `data/metrics.json` | **96** machine-readable definitions, schema-validated, 0 duplicate ids |

**Verification discipline.** Every formula I quote as correct is either (a) read verbatim from
the primary source, or (b) re-derived and self-tested. Items I could *not* verify are marked
`[RECALL]` and catalogued in `METRICS.md` Appendix B. **No fabricated URLs.**

---

## 2. Four widely-repeated claims that primary sources contradict

This is the finding I consider most valuable to the federation, because these four are in
circulation and three of them I myself believed before checking.

| # | Common claim | What the primary source actually says |
|---|---|---|
| 1 | "SimpleQA's F-score weights correct / incorrect / not-attempted" | **It does not.** `F = 2c/(2c+2i+n)` — an **unweighted harmonic mean** of overall-correct and correct-given-attempted (Wei et al. 2024 App. B). The weighting idea is a *separate* metric the paper explicitly declines to headline. I recovered the table's column order by fitting and reproduce **6/6** published values exactly. |
| 2 | "FActScore has precision, recall and F1" | **No recall, no F1, no "F" score.** Precision only. Labels are Supported / Not-supported / **Irrelevant** — "contradicted" is an *error-taxonomy* term, not a label. The authors state it *"does not penalize a model that abstains too frequently or generates fewer facts."* |
| 3 | "Self-consistency is a metric" | It is a **decoding method**; the reported metric is plain accuracy. Aggregation is **unweighted majority vote** (length-normalized weighting was tested and rejected). And it applies only to fixed answer sets — there is no consistency metric for open-ended text. |
| 4 | "Effective context length = % of the model's own short-context score" | RULER's threshold is an **absolute 85.6%** (Llama2-7B @ 4K), and the paper calls it a *"qualitative threshold"*. Worse, the rule `max{L : score(L) ≥ θ}` is **order-dependent** on a non-monotone sweep — I verified that `{4k: 85.0, 8k: 86.0, 16k: 30.0}` reports ECL = 8192. Always publish the curve. |

**Bonus correction, my own:** I asserted the naive pass@k estimator *over*-states pass@k.
Computing it proved the opposite — it **always under**-states, by **10.58pp** at n=200, c=1,
k=100, which is exactly the regime where pass@100 is a headline number. Proof included.

---

## 3. The headline psychometric result, and what it forces

**We cannot resolve a 5-point difference at our budget, and we must say so in advance.**

| design | n needed for a 5pp gap (α=.05, power .80) |
|---|---|
| Unpaired, p≈0.5 | **1562 per model per metric** |
| Paired, measured discordance q = 0.20 | **628** |
| Paired, q = 0.10 | **314** |
| Wilson CI half-width alone, n=400, p=0.5 | **±4.88pp** — larger than the gap |

Two consequences, both already broadcast to B1/B2:

1. **The paired design is ~2.5× cheaper and is not optional.** It requires subject and anchors on
   the *identical* item set. And n scales with `q/d²`, so **q is the number that governs the
   budget** — which is only knowable *after* a pilot run. ⇒ *run a pilot, measure q, then size.*
2. **"Significant" ≠ "well-powered."** At n=400, q=0.20, Δ=5pp: McNemar z = 2.180,
   **p = 0.0292 — significant at α=0.05** — but achieved power is only **60.9%**. A
   39% chance of missing a real 5-point gap, reported with a confident p-value. This is the
   single most likely way we produce a *wrong* conclusion (§6).

**Design constraint I'm imposing:** primary accuracy metric gets **n ≥ 500**; we will claim
**≥10pp** differences as resolved, and 5pp **only** if measured q comes in ≤ 0.12. This is a
pre-declared limitation, not a post-hoc excuse.

---

## 4. Pre-registration proposal

**7 primaries** — only these support decisive claims; Holm-corrected across the 7; each tested
paired (McNemar) on identical items.

| # | id | decides | n |
|---|---|---|---|
| P1 | `pass_at_1` (exact_match, k=1) | core capability | ≥500 |
| P2 | `task_success_rate` | can it work unattended (program checker) | 60–120 |
| P3 | `ifeval_inst_strict` | control / instruction adherence | ≥200 instructions, cluster-bootstrap over **prompts** |
| P4 | `accuracy_lang` (language=ko) | localization — our actual reason for caring | ≥250 |
| P5 | `ttft_model` (median, boot-excluded) | responsiveness | ≥30 paired |
| P6 | `shadow_cost_per_solved_task` | economics, token-priced, tagged `PRICED` | derived |
| P7 | `sign_test_wins` | **the mission answer itself** | 75 cells |

Everything else is **secondary/exploratory** (BH FDR=0.10, captioned non-decisive, separate
table). **Excluded by design**, declared now so absence isn't an excuse: `context_utilization`,
`time_horizon_50`, `factscore`, `translation_adequacy`, and `cost_per_solved_task` *as measured*.

**Why pre-registration is cheaper, not just more honest:** correcting all 60 comparison cells
(Bonferroni) inflates n by **2.23×** (628 → 1400). Correcting only 7 primaries costs **n = 969**
— 1.54× inflation and **31% fewer items** than correcting everything.

**🧮 The composite needs a threshold.** With 5 models × 15 metrics = 75 cells, chance gives
37.5 wins (sd 4.33). **48/75** is the first count that beats chance (p=0.021); **45/75 does not**
(p=0.106). "Won 45 of 75, best of all five" is noise with a confident voice.

**Mission decision rule (pre-registered so it can't be reverse-engineered):** the subject is a
similar-scoring substitute for anchor X iff (1) P7 sign test ≥48/75 **and** (2) no primary shows
a significant difference exceeding its declared minimum effect **and** (3) any judge-dependent
result survives rotating judges across ≥2 families. If (1) holds but (2) fails, the verdict is
*"similar in aggregate, divergent on ⟨metric⟩"* — and the divergence ships with its CI.

---

## 5. Two findings that affect the harness contract

**(a) `cost_per_solved_task` is undefined for our subject.** It is on a free/zen tier, so cost
should be `0` for *every* model — including one that solves nothing. Reported naively this yields
the false conclusion **"free = best value"**, and against non-zero-cost anchors the ratio is
**infinite**. Mandated handling, broadcast to B1/B2: always record raw input/output/reasoning/
cache-read token counters independent of whether `cost` is present; compute a token-priced
`shadow_cost_per_solved_task` with a **dated** price list tagged `PRICED`; a missing price is a
**missing cell, never zero**; never impute.

**(b) Two metric-definition questions for B1.** `runner.mjs:183`'s boot-excluded `ttftModelMs` is
**correct** — keep it, and headline only that (CLI boot is 8–14s and would otherwise be reported
as model latency). But `runner.mjs:190`'s `stepFinishes` counts **LLM API steps, not agent/tool
steps**; a model packing 10 tool calls into one LLM step will show an artificially flat
long-horizon decay slope. Confirm before using it as a slope denominator.

---

## 6. The 3 most likely ways our self-run benchmark produces a *wrong* conclusion

| # | failure | mechanism | mitigation (pre-registered) |
|---|---|---|---|
| **1** | **Concluding a 5pp difference that isn't there** | At n≈400, p=0.0292 is significant while power is only **60.9%**. Add 60 comparison cells at α=.05 and **3.0 false positives are expected by construction**. A reader cannot see the difference. | Pre-declare the minimum effect (**≥10pp** for P1). Report **power**, not just p, for every comparison. Report the **measured q** so n and power are auditable. Holm across the 7 primaries; secondaries quarantined in a captioned non-decisive table. |
| **2** | **"temperature=0" treated as determinism** | Greedy removes *sampling* noise, not *numerical* noise: batch-composition-dependent float reduction order, continuous batching, kernel/hardware selection, and MoE routing can all flip a near-tie `argmax`. Independently corroborated — XSTest's authors report GPT-4 *"gave slightly different responses … despite using the same zero-temperature settings."* | **Measure our own reproducibility floor**: re-run a fixed subset 3–5× at T=0 and report the self-agreement. Publish it, and forbid reporting any difference smaller than it. Seed/temperature/top_p/max_tokens recorded per run. **k>1 buys nothing for pass@1** — SE depends only on `n·k` (verified) — so spend the budget on items and use a k=5 sub-study purely as a diagnostic. |
| **3** | **A number that is a harness artifact, not a model property** | Five live traps: (i) `brier_sum` ranges over `[0, 1+1/(C−1)]` — **2** for C=2, **1.111** for C=10 — so a bare "Brier 0.21" is meaningless and harnesses' values are not comparable; (ii) RULER-style ECL is **order-dependent** on non-monotone sweeps; (iii) `error_recovery_rate` has **no denominator** for a model that never fails, so failing more can *improve* it; (iv) `simpleqa_f` has a **documented gaming direction** below 50% accuracy; (v) tokenizer premium is **tokenizer-specific** — Korean is 5.07× on GPT-2 but 2.38× on cl100k, so any imported "Korean costs N×" claim is wrong. | Prefer the **76 of 96 judge-free** metrics for every decisive claim (our harness already is: `exactMatch`/`contains`/`regexMatch`/`jsonSchema`/`choice`/`numeric` are all deterministic, and `score()` never throws). Publish the full convention with every score. Declare exclusions *now*. Report `error_recovery_rate` only with its failure-rate twin; report the three SimpleQA raw rates, not the F. **Measure our own token premium** — the subject's tokenizer is not published to us. |

---

## 7. Honest limits of my own work

1. **The n figures are requirements, not achievements.** Whether the run meets them is B2's/B3's
   to report. If it came in short, the correct response is to say so — not to lower the bar.
2. **Contamination cannot be certified.** The subject's training cutoff is not published to us.
   Mitigation is fresh author-written items + per-run surface-form perturbation + reporting the
   exposure. One pre-registered rule follows from this: **an implausibly high score is a bug
   report, not a result.**
3. **I could not read Petrov et al.'s per-language table from the paper** (no machine-readable
   full text). The ratios I report are **derived by a peer from the authors' released CSV** and
   are labelled as such. The 15×/4× abstract figures *are* verified.
4. **`[RECALL]` items are catalogued, not hidden** — Brier 1950, Kull et al. 2019, El-Yaniv &
   Wiener 2010, Geifman & El-Yaniv 2017, Hanley & McNeil 1982, Benjamini & Hochberg 1995,
   SQuAD v2 token-F1. The *arithmetic* is self-tested; the *citations* are from memory.
5. **I never ran a model.** Everything here is design and verification. The subject's actual
   reproducibility floor, discordance `q`, and power are **unmeasured** — and all three are
   prerequisites for the report's claims to stand.

---

## 8. Reproduce everything in this document

```bash
cd <this repository>
node harness/psycho-verify.mjs     # every number; self-tests must print "0 failures"
node harness/build-metrics-json.mjs # regenerates data/metrics.json + prints the census
```
