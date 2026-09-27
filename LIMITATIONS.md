# LIMITATIONS — threats to validity, ranked

Ten threats, ordered by how much each could change the conclusion. Each is quantified where it
can be. The internal ordering used in the working reports differs slightly in the tail; what
follows is the ordering by expected effect on the headline claim.

**Machine-readable:** `data/matching.json` → `threats_to_validity`.
**Scrubbing audit:** [`PII-SCAN.md`](PII-SCAN.md).

---

## Summary

| # | threat | resolvable in this study? |
|---|---|---|
| 1 | The item bank was written by an LLM of the same family that grades it | **no** — only a second bank could |
| 2 | Format compliance is confounded with capability | no |
| 3 | n is below what a 5 pp claim requires | no |
| 4 | `function_calling` and `code` are proxies, not agentic success | no |
| 5 | The reasoning budget is undisclosed and worth 15–28 pp | no |
| 6 | Scaffold dominates score identity; no constant correction exists | no |
| 7 | Anchors ran 1 rep, the subject 2 | partially (falsification F5) |
| 8 | The abstention family has no convention-free F | resolved by naming the convention |
| 9 | 5 of 9 categories have no frontier counterpart, capping the axis count | no (falsification F3) |
| 10 | The 4-axis corner is 2025-vintage and two-vendor only | no (data staleness) |

---

## 1. The item bank was written by the same family of model that grades it — **UNRESOLVABLE HERE**

**88 items** (45 in the shared anchor subset). 84 are emitted by a seeded generator; 4 are
hand-written canonical cases. Every answer is re-derived by a **second, deliberately different
implementation** — 824 checks, 0 failures, including 88/88 positive controls, 80/80 negative
controls and 55/55 mutations.

**What that buys:** answer *correctness* is machine-guaranteed. Reading the code cannot find
these — an absorbing state missing from a substring DP returned 6 where the truth is 4; a
`B-417` answer scored with a numeric scorer became `NaN` so the *right* answer scored wrong; an
item's prompt contradicted its own expected output.

**What it does not buy:** item *selection*, vocabulary, phrasing and difficulty calibration
carry the author's fingerprint. **An advantage on this bank cannot be separated from genealogy.**
Any per-item or per-category pattern could be a property of the bank rather than of the model.

**The only experiment that addresses it:** build a second bank with a different model family and
measure per-item agreement (falsification **F2** — the highest-value experiment available,
because everything else is downstream of it). Two further limitations compound this: the
grading model and the bank-writing model are from the same lineage, and the anchors' model
families are *not* the bank's.

## 2. Format compliance is confounded with capability

**52 of 88 items** use strict format scorers (`exact_match`, `numeric`, `json_schema`,
`regex`). A model that computes the right thing and formats it differently scores zero.

The clearest instance: the subject's *hinted* abstentions were **correct** and scored wrong,
costing 6 runs before adjudication. Inverting the item's own hint — making a hinted abstention a
*wrong* answer — flips the difficulty of the whole family.

**Consequence:** a chunk of the 8.4 pp raw-to-conservative movement is format credit, not
capability credit. We cannot cleanly separate the two with this bank.

## 3. n is below what a 5 pp claim needs — **quantified**

Pre-registration computed that a 5 pp paired gap needs n ≈ 628 at an assumed q = 0.20. The
**measured** q is 0.0588 (85 items with both reps, 5 discordant), giving a **minimum detectable
effect of 7.3701 pp** at 1 rep and **5.2114 pp** at the mean of 2 reps.

We share **45 items** (43 scorable) and the anchors ran **1 repetition**. **Both anchor gaps
(+4.65 pp, −2.33 pp) are inside the floor.** A 5 pp claim is not available at this design; the
declared-effect rule was tightened to **≥10 pp**.

`q` rests on 5 discordant items, so the floor carries real sampling uncertainty: read it as
**7.4 pp ± ~1 pp**, not as a constant.

## 4. `function_calling` and `code` are proxies, not agentic success

The isolated harness **exposes no tools and has no final-state check**. Nothing is executed and
no final state is compared. What is actually measured is *a schema-shaped call was emitted* —
a proxy for the thing it is named after.

**Worse: the scaffold moved inside a single measurement.** 5 subject runs called `bash` (7 calls)
and all 5 passed; two of them computed a fast-doubling modular Fibonacci, so without the tool the
item would have been a different and harder task. `--pure` blocks ambient workspace *injection*
but does not stop the model from using tools itself.

Those 5 runs are **reported as a diagnostic, not corrected** — excluding them would invent a
second bias in the opposite direction.

## 5. The reasoning budget is chosen by the service and never disclosed

The subject emitted **22,876 reasoning tokens** (median 79.5, max 1,200) across the 174 runs that
reported the field. **The effort parameter is not exposed.** This is precisely the axis that is
worth **15.44–28.00 pp** on HLE and GPQA Diamond for frontier models — and we cannot locate
ourselves on it.

**Falsification F4** would settle it: run the same 45 items at minimum and maximum effort. If
the band shift exceeds 7.4 pp, the subject's score is a property of the scaffold and no frontier
comparison is meaningful until the budget is fixed.

## 6. Scaffold dominates score identity — and no constant correction exists

Same model, same benchmark, only the agent harness or thinking mode changed, read from
first-party leaderboards:

| benchmark | model | Δ |
|---|---|---|
| GAIA | Claude Sonnet 4.5 | **+43.64 pp** |
| GAIA | Claude 3.7 Sonnet | +19.39 pp |
| GAIA | Claude Opus 4 (May 2025) | +7.27 pp |
| GAIA | **GPT-5 Medium** | **−3.41 pp (sign reverses)** |
| BFCL V4 | **Gemini-3-Pro-Preview** | **−4.37 pp (sign reverses)** |
| HLE | gpt-5.1 | +16.88 pp |
| GPQA Diamond | gpt-5.6-luna | +28.00 pp |

**The range is −4.37 to +43.64 pp and the sign reverses for at least two models.** A single
"correct for scaffold" factor would be wrong. Our subject was measured under exactly one
scaffold, so **an absolute-score match to any frontier row is not supportable.** This is why the
conclusion is a range, not a name.

## 7. Anchors ran 1 repetition, the subject 2

The subject's item-level accuracy is a **range**: 90.70% (both reps correct) / 95.35% (mean) /
100% (either rep) — **9.3 pp wide, wider than the 6.98 pp difference between the two anchors.**

The mean is used for the gap because it is the unbiased estimator. McNemar is computed on the
conservative reading, which is maximally generous to the single-draw anchors. Note the direction:
the subject's extra repetition **helps the subject**, so p-values are inflated in both
directions and must be read as weak boundaries, never as verdicts.

**Falsification F5** would symmetrise this and let the floor be measured per model. If an
anchor's own q approaches 0.0588, the muse gap may become separable; if it is larger, the
inseparability is confirmed.

## 8. The abstention family has no convention-free F — **RESOLVED BY NAMING IT**

`F = 2c/(2c+2i+n)`, verified against 6/6 published values. On the same adjudicated runs:

| convention | c | i | n | F |
|---|---|---|---|---|
| (i) declining = correct | 12 | 0 | 0 | **1.000** |
| (ii) declining = not-attempted (SimpleQA's letter) | 6 | 0 | 6 | **0.667** |
| (iii) declining = incorrect | 12 | 6 | 0 | **0.500** |

**50 F-points separate two defensible readings of identical runs** — larger than any effect the
round could detect. Leaving it unnamed would make the family unreportable; choosing silently
would be a choice made in the reader's absence.

**Resolution:** convention (ii) is used on the frontier axis, because the axis it is compared
against is SimpleQA Verified and the convention must mean the same thing. (i) is reported as
this bank's own reading and (iii) as a lower bound. Note the frontier axis uses
convention-free accuracy `c/(c+i+n)`, under which (ii) and (iii) **coincide at 0.500** while
differing on F — and that choice *changes* the matching result.

**Hallucination count: 0** across 6 unanswerable slots. 6 of 6 answerable slots correct.

## 9. Five of nine categories have no frontier counterpart — the axis count is capped at 4

`instruction_following`, `format_control`, `multilingual`, `long_context`, `robustness` have
**0 cells** in the frontier table. That caps k at 4, where the minimum attainable permutation p is
`2/k! = 0.0833` — **structurally above α = .05 for any n and any data quality.** k = 5 is the
first reachable value, and it needs **two** new axes; one new axis only buys k = 4, which is
still unresolvable.

The missing axes point at the field's own largest gap: **prompt injection and agent hijacking are
absent from the frontier table entirely** (AgentDojo, InjecAgent, CyberGym, XSTest, OR-Bench all
unconfirmed at first-party sources, so nothing was asserted). Also missing: LMArena / Elo — there
is not one Elo number in this repository.

**Falsification F3** (first-party `instruction_following` and multilingual scores) needs new data
collection but **no new model round** — the highest-value analysis-only option.

## 10. The 4-axis corner is 2025-vintage and two-vendor only

All six models reaching 4 axes are from **2025-04-14 to 2025-10-15**, and all are OpenAI or
Anthropic: `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-5-mini`, `claude-haiku-4-5`,
`claude-sonnet-4-5`. The fourth axis is BFCL, **last updated 2026-04-12**.

**2026 flagships are missing from that corner by data staleness, not by weakness.** Reading it as
"the subject resembles a 2025 mid-tier model" is a restatement of the fact that the instrument
can only see that corner. More data makes this bias *worse*, not better: the axis that arrives
last is the stale one.

---

## Threats that were found and are **not** counted above

Recorded because a reader deserves to know they were checked.

| checked | result |
|---|---|
| workspace content leaking into answers | **0 of 184** answers reference the charter, the repository source, or the agent protocols. 181 of 184 records carry `pure=true, format=json, cwd=<isolated temp dir>`; the other 3 are synthetic failure records that never spawned a subprocess |
| per-run boilerplate leakage | 2 of 176 (1.14%), **directional bias 0**; the item is clean in its other repetition, so it is a per-run coin flip, not a per-item property |
| "someone is still awake" flagged as a tool-written note | **false positive** — it is that item's own natural English answer and the forbidden word (`basically`) was avoided |
| answers re-rolled until correct | **never** — a run that produced an answer is not retried, by design and in code |
| malformed or unparseable model output | 0 runs |
| harness self-consistency | 72 unit tests + 824 item-bank checks + 234 statistical checks, 0 failures |
| adjudicated log determinism | two consecutive runs byte-identical |
| raw log integrity | md5 unchanged before/after the audit; no adjudication field leaked into it |
| cross-round verdict consistency | 8/8 shared run_ids get the same verdict in two independent rounds, including the structural exclusion |
| `json_schema` fail-open bug | present in the code, **0 impact on this round** — all 16 items carry byte-identical `expected` and `scorer_args.schema` |
| double-counted transport failures | 2 runs were simultaneously 1.1% unreliability and 1.1% accuracy failure; fixed in the adjudicated denominator, **not** in the code |

---

## The harness defects this repository ships with

Fixed in the numbers, **not** in the code, because patching mid-round would change what a re-run
means while the round is live. Full detail in [`METHODOLOGY.md`](METHODOLOGY.md) §3 and
`data/qc-summary.json`.

| file:line | defect |
|---|---|
| `harness/runner.mjs:328` | temporal dead zone on `const outChunks` (`:331`) — the `catch` throws from inside a catch, so the promise **rejects**, violating the documented contract at `:278` |
| `harness/pool.mjs:244` | `applyScore` runs on failure records, so `answer: ''` becomes `passed: false` |
| `harness/aggregate.mjs:81-83` | `isScored` checks neither `r.failure` nor the answer, while its docstring and `harness/README.md` both claim it does — **a false contract** |
| `harness/scorers.mjs:407` | `json_schema` reads the schema from `item.expected` instead of `item.scorer_args.schema`, and a non-object schema fails **open**. Measured impact on this round: 0 |
| `harness/scorers.mjs:332` | `numeric` reads the **first** number in the text (documented in its own comment), so a correct multi-step trace that starts at step 1 scores wrong |
| abstention item patterns | open with `^(?![\s\S]*\d)`, forbidding **any digit** in the answer — the sole blocker in 5 of 6 affected runs |

**Two of these are design lessons rather than typos.** The lookahead makes the *more informative*
abstention the *more certain* failure. The `numeric` first-number rule makes a *correct
multi-step trace* the *wrong* answer. In both cases the scorer encodes a simpler fiction about
what a good answer looks like than the task actually requires.

**Additionally, one item is unmeasurable through a command-line harness:** `lc-needle-08`'s
prompt is 180,351 characters and Linux caps a single `argv` element at 131,072
(`MAX_ARG_STRLEN`), so `spawn` throws `E2BIG` synchronously and the model is never called.
Measured: 131,000 → ok, 131,073 → `E2BIG`. It is the **only** such item of 88. Passing it would
require stdin or a file, not a longer command line.

---

## Privacy scrubbing

This repository was assembled from a working tree containing an operator's home directory,
absolute workspace paths, a GitHub token, and a machine with a fixed hostname. **The assembled
tree was scanned and scrubbed**; the command and its verbatim clean output are in
[`PII-SCAN.md`](PII-SCAN.md), so any reader can re-run it.

**Deliberately kept**, because they are evidence, not identifiers: the per-run isolated working
directories (`/tmp/t2bench-XXXXXXXX` — `mkdtemp` names, and the audit cites them as proof that
isolation ran), model names, benchmark names, public URLs, and every research number.

**Not included:** a GitHub token was present in the measurement environment. It is **not in this
repository** and nothing here needs one except pushing.
