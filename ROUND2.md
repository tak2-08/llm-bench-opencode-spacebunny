# Round 2 — "three companies as one model", graded by an independent third party

Round 1 measured a single model. Round 2 measures an **entity that presents as one
model but is internally three solver instances**, and grades it with a panel that
does not share the subject's model lineage. Round 1's artifacts are untouched
under `reports/round1/`; nothing here revises them.

---

## 1. What is under test

| | |
|---|---|
| **System under test** | three independent solver instances of `opencode/space-bunny-free`, presented externally as a single model: given an item, the entity emits exactly one answer |
| **Instances** | `reports/round1/subject-88` rep0 and rep1, plus `reports/round2/subject-88` (a third independent pass, `--variant r2`) |
| **Items** | the same 88-item bank; **87** have all three instances non-empty |
| **Grader** | a panel from a *different* model lineage, blind to which instance produced which answer, seeing candidates in randomised order |
| **Design** | paired: every arm is scored on identical items, so McNemar applies |

Instance identity is taken from **file provenance**, not from the `variant` field —
`--variant` is absent on some records, and a provenance mix-up would have
silently reweighted one arm.

### The grading panel

| Panel | Composition | Role |
|---|---|---|
| **independent** | `nvidia/z-ai/glm-5.3-flash@high`, `@max` | headline grading — different lineage from the subject |
| **same-lineage** | `opencode/space-bunny-free@high`, `@xhigh` | bias control only, never the headline |

`nvidia/z-ai/glm-5.3-flash` at the **default** budget was excluded **with
evidence, not convenience**: it returned no text part on 3 of 5 probe calls and on
both of its first two judge ballots, while the same model at `@high`/`@max`
returned text on every call (30/30 ballots parsed). A rater that emits nothing is
not a rater, and recording those as abstentions would have silently shrunk the
panel to one.

The harness refuses, before any model call, to grade with the subject model at its
own configuration, and refuses a same-lineage panel without `--allow-same-lineage`.

---

## 2. The result

All arms are the **same three runs**, reduced four ways.

| Arm | Reduction rule | Accuracy | Wilson 95% |
|---|---|---|---|
| instance 0 | — | 87.36% | [78.8, 92.8] |
| instance 1 | — | 88.51% | [80.1, 93.6] |
| instance 2 | — | 86.21% | [77.4, 91.9] |
| **A** naive majority | exact-agreement vote; **abstains** on a split | **75.86%** | [65.9, 83.6] |
| **A2** blind selector | same, but picks arbitrarily instead of abstaining | **89.66%** | [81.5, 94.5] |
| **B** independent panel | panel breaks the split | **89.66%** | [81.5, 94.5] |
| **C** same-lineage panel | (bias control) | **89.66%** | [81.5, 94.5] |
| **D** oracle | picks the candidate that passes — **uses the answer key, not achievable** | 91.95% | [84.3, 96.0] |

### The decisive comparison

```
judged  89.66%   blind 89.66%   paired exact p=1.0000   (judge-only 0 / blind-only 0)
```

**The third-party judge is worth exactly zero over picking at random** on this
task. Not "small" — zero, on all 87 items.

---

## 3. Why naive majority collapses — and why that is not what it looks like

Majority voting scores **significantly worse than a single instance**
(75.86% vs 88.51%, paired exact **p=0.0034**). The tempting reading is that
consensus is a bad way to combine models. The data says something narrower and more
useful:

> Majority voting did not make wrong answers. It **abstained** on 15 items, and
> abstention was scored as a wrong answer. A blind selector that *never* abstains
> reaches 89.66% on the identical items.

So the 13.8pp gap between A and B is an **abstention artefact**, not evidence of
judging skill. This is the single most important line in this round, and it is the
reason the blind control exists.

### The structural diagnosis

Of the 15 three-way splits:

| | count |
|---|---|
| **all three candidates correct** | **10** |
| all three candidates wrong | 3 |
| **discriminative** (some right, some wrong) | **2** |

The instances disagree in **wording while all being correct**. Exact-string voting
counts cosmetic differences as disagreement, produces a 3-way split, and then
scores the resulting silence as a failure. Ten of fifteen splits were unwinnable
for *any* selector, and three were unwinnable in the other direction.

The tie-breaking task was measurable on **2 items**. No judge panel can be
evaluated on 2 items — which is why "the judge adds nothing" here means "the task
had no signal to extract", not "the judge is incompetent".

---

## 4. Grader properties, measured separately

Reproducibility and validity are different properties, and this round separated them.

**Reproducibility — good.** The two judges agreed on **12 of 15** items
(80% exact). The two *panels* — independent (`glm-5.3-flash@high/@max`) and
same-lineage (`space-bunny-free@high/@xhigh`) — selected the **same instance on
all 15 items** (paired p=1.0000, 0 discordant). Changing the reasoning budget, and
changing the model lineage, did not move a single verdict.

**Validity — not established.** Against the random-pick baseline of 73.3% on these
items, the independent panel's 80.0% is **not distinguishable from chance**
(P(X≥12 | n=15, p=0.733) = 0.40). The panel is *stable* and *uninformative*, and
the raw 12/15 agreement number would have read as quality evidence if the chance
baseline had not been computed.

The same-lineage panel also landed on 80.0%. It did **not** favour its own
lineage — a self-preference effect large enough to inflate the grade does not
appear here. That is a genuine negative result about the risk, though at 2
discriminative items it is weakly powered.

### Position sensitivity — a grader that follows the slot

The same grader re-presented the same candidates in a **different order**:

| judge | flipped | rate |
|---|---|---|
| `glm-5.3-flash@high` | 2/5 | 40% |
| `glm-5.3-flash@max` | 1/5 | 20% |
| **combined** | **3/10** | **30%** [95% CI 11–60%] |

Changing nothing but the presentation order changed the verdict in 30% of cases.
This is worth taking seriously for two reasons: it is not explained by reasoning
budget (both budgets flip), and on the one genuinely discriminative item
(`ifr-words-6`) the `@high` judge flipped *from a wrong instance to the correct
one* — by luck, not skill. The interval is wide (n=10 pairs), so this is
**suggestive, not established**; the honest reading is that a 30% reorder-sensitivity
is incompatible with treating this grader as a precise instrument.

Note the interaction with §3: most flips are harmless *here* only because 10 of 15
splits had all three candidates correct, so a flip swaps interchangeable answers.
On a bank where candidates differ in quality, the same 30% would cost accuracy
directly.

---

## 5. Answering the question that was asked

> Treat three companies as one model, and have an independent third party grade
> them. Does that produce something better than one model?

**No.** The judged entity scores 89.66% against a best single instance of 88.51% —
**+1.1pp, with every paired test above .05**. An oracle that reads the answer key
reaches only 91.95%, so **at most 2.3pp** exists for any better selector to
capture, and none of the selectors tried here captured it.

The value of the third party is not accuracy on this task. It is that it removes
the abstention failure mode: majority-plus-abstain is *significantly worse* than a
single model, while majority-plus-panel matches it. **If you combine instances,
you must forbid abstention** — that single design choice is worth 13.8pp, and it
costs nothing.

---

## 6. A contamination event the isolation contract did not prevent

Round 1 already recorded that `--pure --dir <empty>` blocks *injection* but not
*the model's own tool use*. Round 2 shows how far that goes.

**5 of 88 subject runs (5.7%) issued `bash` tool calls during a supposedly
isolated measurement.** One of them is worth quoting, because it is the failure
mode in full:

```
bash ~/.cache/<memory-store>/bin/memory.sh search "harbour dusk"
```

`"harbour dusk"` is verbatim content from benchmark item `ifr-lower-01`. The model
reached out of its sandbox and searched **the operator's live memory store** for a
string from the test it was taking. The search returned nothing, so no answer was
lifted — but the isolation contract, and the operator's infrastructure, were both
inside the measurement.

**Effect on the result: none.** All 5 contaminated runs passed, and all 5 also
passed 2/2 in round 1 — the model was reaching for a tool on items it was already
answering correctly. No verdict changed.

**Effect on validity: real, and it is a reproducibility hazard rather than a
scoring error.** Anyone re-running this in a different environment gets different
conditions, because whether the model decides to shell out is a property of the
model, not of the harness. A harness that cannot guarantee the model stays in the
sandbox cannot be used to attribute a score to "the model under no tools" — which
is the condition round 1's report claimed.

Practical fix, and it is not a code change: the isolation directory cannot be the
only barrier when the model can spawn a shell that reaches the rest of the
filesystem. A real containment boundary, or a harness-level tool denylist, is
required before any claim about tool-free capability is safe.

One artifact in this directory contained that path and was redacted before first
publication; the manifest is `data/redaction-manifest.json`. Round 1's logs were
left byte-identical — their integrity is what its audit rests on, and they scanned
clean.

---

## 7. Threats to validity, ranked

0. **The isolation contract failed in 5/88 runs** (§6), including one lookup of
   benchmark content against the operator's own memory store. It changed no verdict
   here, but it means "measured with no tools" is not a guarantee this harness can
   currently make.
1. **Only 2 of 87 items offered a discriminative choice.** The central comparison
   (judged vs blind) is measured where there is almost nothing to measure. A bank
   of open-ended items with several plausible-but-wrong candidates would test the
   panel properly; this bank cannot, and that is a property of the bank, not of the
   panel.
2. **The grader flipped 30% of the time when only the order changed** (n=10 pairs,
   95% CI 11–60%). At that sensitivity, the grader is not a precise instrument, and
   the "stable" result in §4 is partly a consequence of most items being ties.
2. **The item bank was authored by an LLM of the same lineage as the subject**
   (carried over from round 1). Answer correctness is machine-guaranteed, but item
   choice and difficulty carry the author's fingerprint.
3. **Only two independent judges, and they are one model at two reasoning
   budgets.** Their agreement measures grader stability, not inter-model rater
   independence. A genuine cross-family panel was not reachable: every other
   non-subject model in this environment returned no text part or an error
   (`glm-5.3` full, `kimi-k3`, `gemini-flash-latest` quota).
4. **The instances are one model three times, not three organisations.** They share
   a training lineage and, in the harness, a scaffold. A three-*company* result
   would be a different claim; this is a three-*instance* result.
5. **Winner's-curse caveat:** "best single instance" is the maximum of three noisy
   arms. The pre-specified per-instance tests are reported alongside.
6. **Scorer artifacts persist** (round 1's negative-lookahead regex). They penalise
   all arms in the same direction, so the *relative* comparison is sound, but
   absolute levels remain understated — visibly so in the 3 all-wrong splits, which
   are the abstention items the round-1 audit identified as scorer bugs.

## 8. What would change the answer

- **A discriminative tie-break set.** 30+ items where 2 of 3 candidates are wrong
  for *substantive* reasons (an arithmetic slip, a missing constraint, a factual
  error), not a wording difference. This is the one change that would make the
  judge evaluable, and it is cheap to build.
- **A cross-family panel.** Even two judges from different lineages would convert
  "no inter-rater independence" from a caveat into a measurement.
- **A real company.** Instances that plan, criticise, and revise through separate
  contexts would make "three organisations" true rather than nominal.

---

## Reproducing

```sh
node harness/ensemble2.mjs     # reductions, controls, paired tests, verdict
node harness/judge.mjs pick --items harness/items.json \
  --candidates <candidates.json> \
  --judges "nvidia/z-ai/glm-5.3-flash@high,nvidia/z-ai/glm-5.3-flash@max" \
  --out reports/round2/judge-ind
node --test harness/test/       # 93 tests, includes the grader self-test
```

`harness/judge.mjs` refuses to grade with the subject model at its own
configuration, refuses an unflagged same-lineage panel, records unparsed ballots
instead of dropping them, retries a bounded number of empty responses, and pins the
observed `opencode run --format json` event shape in its tests — a parser reading
the wrong level of that stream returns `""` for every run, which is
indistinguishable from a model returning nothing.

Grader self-test: 20/20. Full harness suite: 93 tests, 0 failures.
