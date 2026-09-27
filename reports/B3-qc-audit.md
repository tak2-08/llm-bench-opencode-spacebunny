# B3 QC audit — is 86.9% right?

**Verdict: no. The headline is wrong, and it is wrong because two harness bugs and
eight scorer artifacts were counted as model failures.**

| | n | correct | accuracy | Wilson 95% |
| --- | --- | --- | --- | --- |
| **as shipped (harness's own report)** | 176 | 153 | **86.9%** | [81.2%, 91.1%] |
| **corrected, conservative** | 174 | 161 | **92.5%** | [87.6%, 95.6%] |
| **corrected, full** | 170 | 161 | **94.7%** | [90.3%, 97.2%] |

- *conservative* = the 2 never-measured runs leave the denominator, the 8 scorer
  artifacts are credited, and the 2 broken items stay in the denominator scored as
  wrong. This is the number to quote if you want the least generous correction.
- *full* additionally drops the 2 items that cannot be answered from their own text
  (4 runs). Both CIs barely overlap the naive CI, so the direction is not in doubt.

Everything is re-derivable: `node harness/adjudicate.mjs --strict` (exit 0).
The raw log is **byte-identical** before and after — md5 `e6f8d8a29525f66e064ef5dbaf0b4f14`
before, after, and after two further runs. Corrected verdicts go to
`reports/round1/subject-88/run-log.adjudicated.jsonl`; the per-run table is
`run-log.adjudication-table.md`; the machine-readable summary is `data/qc-summary.json`
(merged per log, so re-running on another log does not clobber this one).

---

## 1. Defect verdicts

### Defect 1 — scorer artifacts counted as model failures: **CONFIRMED, 8 runs**

The leader's count of 8 is exactly right. The mechanism is not quite the one
hypothesised, and the difference matters for the fix.

**The dominant cause is not "the regex matches the author's phrasing". It is a
negative lookahead that forbids any digit anywhere in the answer.**

`abs-noans-*` items are scored with a pattern that opens:

```
^(?![\s\S]*\d)[\s\S]*(?:do(?:es)?\s+not\s+(?:say|state|...)|... )[\s\S]*$
```

The `(?![\s\S]*\d)` asserts the answer contains **no digit at all**. The natural,
informative way to abstain from a passage full of dates is to enumerate the dates
that *are* present and then say the asked-for fact is absent. Every one of these
answers does exactly that, and that is what the regex rejects.

Decisive test, per run: strip **only** that lookahead, keep the identical
alternation, and the match succeeds. The lookahead is the *sole* blocker in 5 of 6
runs.

| run_id | item rep | abstains? | digit? | full pattern | lookahead removed | blocker |
| --- | --- | --- | --- | --- | --- | --- |
| `0ae0dde24b6d57a5` | abs-noans-01 r0 | yes | yes | fail | **match** | lookahead only |
| `f599ab7701dcc666` | abs-noans-01 r1 | yes | yes | fail | **match** | lookahead only |
| `f5d50efafec1dff2` | abs-noans-02 r0 | yes | yes | fail | **match** | lookahead only |
| `e690184a3c50f0bb` | abs-noans-02 r1 | yes | yes | fail | **match** | lookahead only |
| `5ac1375a7cc900c0` | abs-noans-03 r0 | yes | yes | fail | fail | **lexicon gap** |
| `3d2277e1e6c25c07` | abs-noans-03 r1 | yes | yes | fail | **match** | lookahead only |

The 6th is a genuinely independent second mechanism: `"…doesn't name a company …
there's no way to tell…"` is a correct abstention phrased outside the pattern's
closed list of ~15 alternatives. So **two** defects sit on this one family, and
fixing only the vocabulary would have left 5 of 6 still failing.

This is a scorer artifact, not a model result, in a way that inverts the intended
difficulty: **the more informative the abstention, the more certain the failure.**

**The 2 `numeric` failures: CONFIRMED, and the code says so in its own comment.**
`scorers.mjs:332` — `/** First number in the text, ... */`. A correct multi-step
trace starts with step 1.

| run_id | item rep | answer | scorer read | expected | verdict |
| --- | --- | --- | --- | --- | --- |
| `ff5c55f55c001edb` | ml-chain-ja r0 | `71 × 7 × 47 = 23359` / `23359 − 376 = 22983` / `22983 + 871 = 23854` / `合計: **23854**` | `71` | 23854 | correct final value present |
| `191d5feca99a95ac` | ml-chain-zh r1 | `44604\n44694` | `44604` | 44694 | correct final value present |

`ml-chain-ja` rep1 is **not** an artifact: its answer is only `71 × 7 × 47 = 23359`
— the model stopped after step 1 and never produced 23854. Rule R5a does not fire,
it stays a real failure. That is the rule working, not a miss.

**Net effect:** abstention_hallucination 6/12 (50.0%) → **12/12 (100.0%)**;
multilingual 23/30 (76.7%) → 25/30 (83.3%).

### Defect 2 — empty answer scored as wrong: **CONFIRMED, 2 runs — but the root cause is not transport**

The leader's reading of the symptom is right (empty answer, `latency_ms: 0`, sitting
in the accuracy denominator as wrong). The *cause* is a **harness code bug**, and it
has three distinct links, each independently sufficient to produce the false number.

1. **`harness/runner.mjs:328` — temporal dead zone.** The `catch` around `spawn`
   calls `finish({spawnError: …})`. `finish` is a hoisted function declaration
   (`:386`) but closes over `const outChunks` declared at **`runner.mjs:331`** — three
   lines *later*. In the TDZ, so `finish` throws
   `ReferenceError: Cannot access 'outChunks' before initialization` **instead of**
   returning the intended spawn-error record. A throw inside a `catch` is not caught
   by that same `catch`, so it escapes the Promise executor and **rejects** the
   promise — violating `runner.mjs`'s own documented contract at `:278`
   ("Resolves — never rejects").
2. **`harness/pool.mjs:244` — `applyScore` is unconditional.** It runs on failure
   records too, so `answer: ''` becomes `scored: true, passed: false`.
3. **`harness/aggregate.mjs:81-83` — `isScored` never looks at the failure.**
   ```js
   /** A run counts toward accuracy only if it produced an answer and was scored. */
   function isScored(r) {
     return r && r.scored === true && typeof r.passed === 'boolean';
   }
   ```
   The docstring says "only if it produced an answer". The implementation checks
   neither `r.failure` nor the answer text. **The docstring is a false contract and
   the README repeats it** — `report.md` §Method notes: *"Accuracy counts only runs
   that produced a non-empty answer and were scored; transport failures are excluded
   from the denominator and reported separately as reliability."*
   That sentence is false in code. `reliability: 98.9%` in the same report is
   computed correctly and separately, so the two figures are inconsistent by
   construction: the 2 runs are simultaneously 1.1% of unreliability *and* 1.1% of
   accuracy failures.

**What actually triggered the spawn failure — measured, not inferred:**

`lc-needle-08`'s prompt is **180,351 characters**. Linux caps a *single* argv
element at `MAX_ARG_STRLEN = 32 × PAGE_SIZE = 131,072`. Measured:

```
argv len  100000 -> ok        argv len  131000 -> ok
argv len  131073 -> E2BIG     argv len  180397 -> E2BIG
real spawn('opencode', [..., prompt_180351]) -> threw synchronously: E2BIG
```

`spawn` throws **synchronously** for oversized argv, which is what reaches link 1.
This is exhaustive across the bank — `lc-needle-08` is the **only** item over
131,072 chars (2nd longest: `lc-needle-07` at 120,454). The other 7 long-context
items all pass, which is exactly the pattern a size limit predicts.

**Two consequences the report must state:**

- **The model was never called.** This is not a model failing a long-context task;
  the model was never asked. Nothing about long-context ability can be read from
  these 2 runs in either direction.
- **`lc-needle-08` is unmeasurable through this harness as built.** A ~60k-token
  prompt cannot be passed to `opencode run` as a command-line argument. The defect
  is structural, not a flake: **it reproduced in a second, independent round**
  (`subject-lc/run-log.jsonl` run_id `64663944f481cf8b`, same `outChunks` TDZ), and
  it is marked `retriable: false`, so it will never self-heal.
  Peer A3's heads-up that `lc-needle-08`'s 180,397-char prompt would strain the
  180 s default timeout was **directionally right and mechanistically wrong** — the
  item was never timed, it was never sent.

Effect on the headline: 2 runs move out of the denominator (not into a pass column).
86.9% → 92.5% before any artifact credit.

### Defect 3 — contamination despite `--pure`: **PARTIALLY CONFIRMED, PARTIALLY REFUTED**

**REFUTED: the "someone is still awake" flag is a false positive.** That string is
`ifr-forbid-02`'s **own natural English answer**. The item asks *"In one sentence, say
what a lamp left burning suggests about a house"*; the model answered *"A lamp left
burning suggests someone is still awake inside, so the house feels lived-in,
welcoming, and quietly waiting."* The item's forbidden word is **`basically`**, which
the model avoided. A phrase scanner reading this as a "tool-wrote note" is
pattern-matching on English, not auditing. It is not contamination and is not counted
below.

**CONFIRMED: real boilerplate leakage, 2 of 176 runs (1.14%), directionally neutral.**
Both carry the session-protocol prologue `기억 확인: 관련 기록 없음 …` and both
`memory_search`:

| run_id | item rep | position | effect |
| --- | --- | --- | --- |
| `29d2aa399a6400f2` | ifr-forbid-02 r1 | **appended** after the answer | none |
| `e690184a3c50f0bb` | abs-noans-02 r1 | **prepended** before the answer | none |

`ifr-forbid-02` rep0 has **no** boilerplate, so leakage is **stochastic per run, not
systematic per item** — a run-level coin flip, not an item that invites contamination.
Both affected runs are adjudicated on the answer, not the prefix, and the verdict is
identical either way. **Directional bias: zero.** It neither helped nor hurt the score.

**Separately — this is the finding that matters for interpretation.** Peer B1's
`--format json --pure --dir <empty>` claim is *partly* true and partly overstated:

- **TRUE, and it held:** no run leaked workspace *content*. No AGENTS.md text, no
  T2Editor source, no repository state, no peer findings, and — checked explicitly —
  no `AgentRadio` / `agent-shared-context` / `AGENTS.md` reference in any of the 184
  answers. 181 of the 184 records carry `pure=true, format=json,
  cwd=/tmp/t2bench-*` across two different isolated dirs; the other 3 are the pool's
  synthetic failure records, which never spawned a subprocess, so isolation is moot
  for them.
- **FALSE as stated:** `--pure` blocks ambient workspace *injection*; it does not
  block the model from *using tools itself*. **5 runs called `bash` (7 calls)** —
  `cod-primes` ×1, `cod-fib_mod` ×2, `ifr-oneline-01` ×1, `ifr-multi-01` ×1 — and
  **all 5 passed.** Those two `cod-fib_mod` calls compute a fast-doubling modular
  fibonacci; without them the answer is a different, harder task.

This is a **scaffold variance inside a single measurement**, and it is peer C2's
point about `(model × scaffold)` tuples landing in practice rather than in theory.
The affected items are `code` and `instruction_following` — the two families where
our axis already overlaps a frontier table, so it is exactly where a scaffold offset
would corrupt a comparison. Reported as a diagnostic, not corrected: excluding those
5 runs would invent a second bias.

---

## 2. Two further defects the leader did not raise

Both are bank defects, and both are stronger than anything in the original three.

**`fmt-nested-02` — the prompt contradicts the expected value. 2 runs.**
The prompt says: *"`id` must be the letter S followed by the digits of 2 and then 40
**with no separator**."* The scored value is `"S-240"` — which contains a hyphen.
The model answered `"S240"`, i.e. **exactly what it was instructed**. On the merits
the model is right and the bank is wrong. Excluded (R2a) rather than credited,
because crediting it would assert a capability the item never tested.

**`fmt-flat-01` — the item is unanswerable. 2 runs.**
The prompt gives readings `-1, 4, 22` and asks for *"the string from this list that
matches the warmest reading: drizzle, clear, windy"*. **The passage contains no
mapping from a reading to a condition** — the three condition words appear only
inside the enumeration. The bank's `"windy"` and the model's `"clear"` are equally
unconstrained guesses. Excluded (R2b).

Together these explain why `format_control` went 12/16 → 12/12: the 4 excluded runs
were 2 items whose every rep was unscorable.

**And one bug that did *not* fire, worth recording because A3's defence worked.**
`scorers.mjs:407` dispatches `json_schema: (a, e, x) => jsonSchema(a, e, x)` — it
reads the schema from `item.expected`, while `README.md:206-212` and `items.mjs:74-76`
require it in `item.scorer_args.schema`, and a non-object schema makes
`jsonSchema` **fail-open** (`:143` returns `[]`, so anything passes). Peer A3 flagged
this could make 16 items (18% of the bank) free points. Measured across all 16
`json_schema` items: **0 fail-open, 0 mismatches** — `expected` and `scorer_args.schema`
are byte-identical objects in every one. A3's double-record assertion held, so the
round is unaffected. The latent bug still exists for the next round.

---

## 3. Per-run adjudication table

All 23 non-passing runs, with the rule that fired. Full text of every answer and the
reasoning per run are in `reports/round1/subject-88/run-log.adjudication-table.md`.

| run_id | item | rep | scorer | orig | adjudicated | rule | basis |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `0ae0dde24b6d57a5` | abs-noans-01 | 0 | regex | FAIL | **correct** | `R3a` | abstains; no-digit lookahead is sole blocker |
| `f599ab7701dcc666` | abs-noans-01 | 1 | regex | FAIL | **correct** | `R3a` | "No cost information is available"; cites dates |
| `f5d50efafec1dff2` | abs-noans-02 | 0 | regex | FAIL | **correct** | `R3a` | "attendance figure … can't be determined" |
| `e690184a3c50f0bb` | abs-noans-02 | 1 | regex | FAIL | **correct** | `R3a` | correct abstention; boilerplate prefix does not alter it |
| `5ac1375a7cc900c0` | abs-noans-03 | 0 | regex | FAIL | **correct** | `R4a` | "doesn't name a company / no way to tell" — outside lexicon |
| `3d2277e1e6c25c07` | abs-noans-03 | 1 | regex | FAIL | **correct** | `R3a` | "no company is named"; quotes `8 May` |
| `ff5c55f55c001edb` | ml-chain-ja | 0 | numeric | FAIL | **correct** | `R5a` | `23854` present; scorer read the leading `71` |
| `191d5feca99a95ac` | ml-chain-zh | 1 | numeric | FAIL | **correct** | `R5a` | `44694` present; scorer read the leading `44604` |
| `64663944f481cf8b` | lc-needle-08 | 0 | exact_match | FAIL | **excluded** | `R1` | never measured — TDZ, E2BIG at spawn |
| `33db1c0c77aed2e7` | lc-needle-08 | 1 | exact_match | FAIL | **excluded** | `R1` | never measured — same |
| `a1537395cd5bf653` | fmt-flat-01 | 0 | json_schema | FAIL | **excluded** | `R2b` | no reading→condition mapping exists |
| `82ba528aa05cb2ea` | fmt-flat-01 | 1 | json_schema | FAIL | **excluded** | `R2b` | same |
| `69daff915f826e32` | fmt-nested-02 | 0 | json_schema | FAIL | **excluded** | `R2a` | prompt says "no separator", expected is `S-240` |
| `668640661a5437ca` | fmt-nested-02 | 1 | json_schema | FAIL | **excluded** | `R2a` | same |
| `f1684cfabd7d8d92` | cod-anagram | 0 | exact_match | FAIL | incorrect | `R6` | norm(`sparrow16`)=`16aoprrsw` ≠ `15aoprrsw` → returns `false`; model said `true` |
| `acef8c17f9055ccf` | cod-rle | 0 | exact_match | FAIL | incorrect | `R6` | executed the prompt's own JS: `b1e1f1a1c3e1d4e1d2c1`; model said `…a1c4…` |
| `b4fb6758ab0b9d0f` | cod-rle | 1 | exact_match | FAIL | incorrect | `R6` | same, second rep |
| `8fc861d462e272cc` | ifr-words-6 | 0 | regex | FAIL | incorrect | `R6` | 7 words given, 6 required |
| `1463f4a81e0904cf` | ml-sum-zh | 0 | numeric | FAIL | incorrect | `R6` | 9289+7049+7212+6525+2558 = 32633; model said 37133 |
| `d89f756e99bb87ef` | ml-chain-ja | 1 | numeric | FAIL | incorrect | `R6` | answer stops at `23359`; never produced 23854 |
| `467015d5ddb40d32` | ml-reverse_sub-ko | 0 | numeric | FAIL | incorrect | `R6` | 864582−285468 = 579114; model said 578124 |
| `58a4ee8c845529e7` | ml-reverse_sub-ko | 1 | numeric | FAIL | incorrect | `R6` | same, second rep |
| `c04cc3076d6ee228` | ml-reverse_sub-ja | 1 | numeric | FAIL | incorrect | `R6` | 87835−53878 = 33957; model said 87832 |

Rule fire counts: `R6-correct` 153 · `R6-real-failure` 9 · `R3a` 5 · `R1` 2 · `R2a` 2 ·
`R2b` 2 · `R5a` 2 · `R4a` 1.

**The 9 surviving failures are real and were independently recomputed** (the `cod-*`
ground truths by executing the prompt's own source, the `ml-*` by hand). Whatever is
wrong with this round, it is not that the model was let off lightly.

---

## 4. Reproducibility floor

Per-item agreement between rep0 and rep1:

| | items w/ both reps | agreement | discordant | b (r0 wrong→r1 right) | c (r0 right→r1 wrong) | q | exact McNemar p |
| --- | --- | --- | --- | --- | --- | --- | --- |
| naive verdicts | 88 | 83/88 = **94.32%** | 5 | 3 | 2 | 0.0568 | 1.000 |
| corrected verdicts | 85 | 80/85 = **94.12%** | 5 | 3 | 2 | 0.0588 | 1.000 |

The discordant items (corrected): `cod-anagram`, `ifr-words-6`, `ml-sum-zh` (all
wrong→right), `ml-chain-ja`, `ml-reverse_sub-ja` (right→wrong).

**The measurement is over: the floor is now known, and it is 7.4pp — not an estimate.**

| design | n | α | power | minimum detectable effect |
| --- | --- | --- | --- | --- |
| paired (McNemar), 1 rep/item | 85 | .05 | .80 | **7.37 pp** |
| paired, mean of 2 reps | 85 | .05 | .80 | **≈5.21 pp** (÷√2, approximate) |

Inverting A2's `nPaired(q, d) = k·q/d²` with the **measured** q = 0.0588:
d_min = √(7.849 × 0.0588 / 85) = 0.0737. A2 assumed q = 0.20; the measured
discordance is **3.4× smaller**, so our floor is far better than the pessimistic
number — which is worth saying, because the pessimistic number was a guess and this
one is a measurement.

**Consequences, stated plainly:**

1. **A2's declared-effect rule must hold at ≥10 pp, not 5 pp.** A 5 pp claim is under
   the floor even with 2 reps averaged (5.21 pp).
2. **This floor is the harness's, not the domain's.** Peer C2 established that the
   same model on the same benchmark swings 4.24–43.64 pp when only the scaffold
   changes (GAIA: identical Claude Opus 4.1 at 68.48% vs 64.24%, reasoning budget
   alone). That is **6× our entire reproducibility floor.** Our n is adequate for
   separating models that differ by more than ~7 pp on *this bank under this one
   scaffold*; it says nothing about models that differ mainly in scaffold. Report the
   7.4 pp as what it is and no larger.
3. `q` was measured on a sample of 5 discordant items, so d_min carries real
   sampling uncertainty of its own. Treat 7.4 pp as ±~1 pp, not as a precise constant.

---

## 5. Corrected abstention decomposition (SimpleQA-style)

Formula `F = 2c / (2c + 2i + n)` — taken from A2's `psycho-verify.mjs:127`, which
reproduces 6/6 published Wei et al. 2024 Table 3 values to printed precision. I did not
re-derive it.

Corrected: 6 answerable slots (`abs-ans-*`, 6/6 correct), 6 unanswerable slots
(`abs-noans-*`, 6/6 correct abstentions, **0 hallucinations**).

**The family has no convention-free F, and the spread is enormous:**

| convention | c | i | n | F | rationale |
| --- | --- | --- | --- | --- | --- |
| (i) declining = correct | 12 | 0 | 0 | **1.000** | matches the item design — declining an unanswerable question *is* the target behaviour |
| (ii) declining = not-attempted | 6 | 0 | 6 | **0.667** | matches SimpleQA's letter: `n` means not-attempted |
| (iii) declining = incorrect | 6 | 6 | 0 | **0.500** | what the shipped harness effectively reported |

**50 F-points separate two readings of the same runs.** This is not a rounding
question — it is a definitional fork, and it is far larger than any effect the round
could detect. A2 pre-registered abstention as a primary family; **that pre-registration
needs the convention named before the number is published**, or the family is not
reportable. The item design (declining = correct) supports (i); SimpleQA's semantics
support (ii). I did not pick for the report — the report must.

---

## 6. Method and self-checks

**Adjudication protocol.** Rules R0–R6 are written in the tool's header *before* the
verdicts, applied in order, first match wins, and a rule may only move a verdict in
the direction stated. Every run carries the rule id that fired, so
`run_id → original → new → rule` is traceable end to end.

**Human judgment is exposed, not buried.** R3/R4 turn on "is this a semantic
abstention", which is a reading, not a computation. So each flipped run must appear in
an explicit `SEMANTIC_JUDGMENTS` table with a justification, and `--strict` **fails
with exit 2** if a rule flips a run with no entry, or an entry exists for a run the
rules do not flip, or the rule ids disagree. The judgment is auditable and the tool
stays deterministic. R1, R2, R3a and R5a need no judgment — they are pure code.

**The strict gate earned its keep — it caught three real bugs in this audit, all mine:**

1. R4's abstention-item test tried `expected.replace(/\\\s/g,'')` and looked for
   `"not mentioned"` with a real space, which does not occur in the pattern (it is
   the literal `not\s+mentioned` metasequence). **R4 silently never fired**, and
   `abs-noans-03` rep0 fell through to `R6-real-failure`. Replaced with a structural
   signature test over five unambiguous tokens.
2. `reproducibilityFloor(runs, key)` accepted a verdict accessor as a **string** and
   never used it, so the "naive floor" was a second copy of the "corrected floor" —
   and would have published `p = 1` for both while only one was computed.
3. The summary writer overwrote `qc-summary.json`, so auditing `subject-lc` destroyed
   the `subject-88` entry. Now merged per log.

Also recorded so nobody repeats them: my first non-vacuous fixture for check 2
**was** vacuous — the two accessors happened to produce the same discordance count.
The fixture now differs in count, and I verified it by deliberately breaking the
accessor and confirming strict mode then fails (`EXIT=2`). A test that cannot fail is
not a test.

**Other checks:**

- **Wilson cross-checked against two independently-authored implementations**
  (A2's `psycho-verify.mjs:62` and B1's `aggregate.mjs:24`), agreeing to <1e-9 on
  every figure. Both are self-tested by their authors (`psycho-verify.mjs` runs 0
  failures on import).
- **Determinism:** two consecutive runs produce byte-identical
  `run-log.adjudicated.jsonl` (md5 `1d6325927ce591a3f5e67cde723be437`).
- **Raw trail intact:** `run-log.jsonl` md5 unchanged; confirmed no `_adjudication`
  key leaked into it.
- **Cross-round consistency:** all 8 run_ids shared with `subject-lc/run-log.jsonl`
  get the same verdict in both — **8/8**, including the `lc-needle-08` exclusion,
  which is independent evidence the `outChunks` TDZ is deterministic.
- **No model calls were launched.** CPU-light, no writes outside this repository.

**What I did not fix, and why.** I did not modify `runner.mjs`, `pool.mjs`,
`aggregate.mjs` or any scorer — Defect 2 and Defect 3's `json_schema` bug are real
defects, but this round's log is already in hand and the corrected numbers come from
the adjudicated log. Patching the harness mid-round would change what a re-run means
while the round is still executing, and the charter puts writes with the team leader.
The three code locations are listed above and in `data/qc-summary.json` for whoever
patches them. This report changes no harness file and does not overwrite any raw log.

## 7. Files

| path | what |
| --- | --- |
| `harness/adjudicate.mjs` | the tool. `node harness/adjudicate.mjs --strict` |
| `reports/round1/subject-88/run-log.adjudicated.jsonl` | corrected verdicts, raw log fields preserved |
| `reports/round1/subject-88/run-log.adjudication-table.md` | per-run table + reasoning for every change |
| `reports/round1/subject-lc/run-log.adjudicated.jsonl` | same, for the lc round |
| `data/qc-summary.json` | machine-readable, one entry per audited log |

**Write only inside this repository. T2Editor untouched. No git commit.**
