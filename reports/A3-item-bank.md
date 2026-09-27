# A3 — Test item bank: design, verification, and threats to validity

**Owner:** A3 (Federation A · 표준화연구소) — 시험문항은행
**Artifact:** `harness/items.json` (610 874 bytes, 88 items)
**Seed:** `20260927` — `items.json` is a pure function of `(meta.seed, item id)`
**Rebuild:** `cd harness && node build-items.mjs` (exits 0) · `--check` verifies the file on disk without writing

---

## 1. The design problem, and what was actually done about it

An LLM authored the items that grade an LLM. That creates two failure modes, and
neither is solved by writing careful items.

### 1.1 Contamination — answered by computation, not recall

If I write trivia from memory, the item is almost certainly inside the training
data of the model being graded, and "correct" measures recall rather than
capability. Worse, a model that memorised the item scores well for a reason that
has nothing to do with the capability under test.

The countermeasure is that **the answer is computed, not remembered.** For 84 of
88 items (95.5%) a seeded program emits the prompt text *and* the answer from the
same parameter object. If an item is a modular-arithmetic residue, the number
cannot be in anyone's training data, because it is a function of a seed. A larger
model is not advantaged; it has to actually do the modular arithmetic.

The 4 authored items are the ones where a template would be unnatural (2 natural
tool-call utterances) or where the problem is *known* rather than constructed (2
canonical puzzles). Their answers are still machine-derived — see §3.

### 1.2 Self-preference — answered by explicit formats and deterministic scorers

If the author's own answer style is what earns the point, the bank measures
self-similarity. Mitigations in place:

- every item states its answer format in the prompt ("reply with a single integer
  and nothing else"), so the target form is a fact about the item, not a habit;
- every answer is scored by a deterministic checker, never by a judgement call;
- no item requires outside knowledge except the 3 unanswerable abstention items,
  and those are grounded in a passage the prompt itself contains.

What this does **not** remove is the choice of *which* problems to ask. That is
threat #1 in §8 and it is not mitigable inside this session.

### 1.3 The generated/handwritten split, and why it is 95/5 rather than 70/30

| provenance | count | share |
|---|---|---|
| `generated` | 84 | 95.5% |
| `handwritten-canonical` | 4 | 4.5% |

The brief asked for ≥70% generated and ≤30% hand-written. The result is far more
skewed than requested, and deliberately so: every task I could construct
programmatically, I constructed programmatically, because every such item came
with machine-checkable ground truth for free. The 4 authored items are exactly
those where a template would have been *worse* — a tool-call request that reads
like something a user would say, and two famous puzzles. Hand-writing more would
have meant hand-writing answers, which is the thing the whole design avoids.

---

## 2. Item inventory

| category | n | generated | authored | scorers | prompt chars min/med/max |
|---|---|---|---|---|---|
| reasoning | 15 | 13 | 2 | numeric, exact_match | 143 / 345 / 766 |
| code | 8 | 8 | 0 | exact_match | 532 / 642 / 745 |
| instruction_following | 14 | 14 | 0 | regex, multi_all_of | 146 / 218 / 261 |
| format_control | 8 | 8 | 0 | json_schema | 275 / 370 / 517 |
| multilingual | 15 | 15 | 0 | numeric | 49 / 140 / 306 |
| long_context | 8 | 8 | 0 | exact_match | 6 217 / 48 255 / 180 397 |
| function_calling | 8 | 6 | 2 | json_schema | 353 / 544 / 620 |
| abstention_hallucination | 6 | 6 | 0 | contains, regex | 248 / 322 / 333 |
| robustness | 6 | 6 | 0 | numeric | 148 / 333 / 364 |
| **total** | **88** | **84** | **4** | | |

Scorer distribution: `numeric` 32 · `exact_match` 20 · `regex` 16 · `json_schema`
16 · `contains` 3 · `multi_all_of` 1. No `custom_fn` — see §7.

Per category:

- **reasoning** — modular-power residues; exact rational linear systems; logic
  grids proven to have exactly one solution by exhaustive enumeration; substring
  counting; shortest-path distance and shortest-path *count*; arithmetic chains;
  and 2 canonical public puzzles.
- **code** — the prompt shows a complete function and one concrete call. The
  expected value is obtained by **executing that exact source** in a fresh V8
  context, not predicted.
- **instruction_following** — 11 single-constraint items + 3 two-constraint items.
- **format_control** — JSON documents whose *values are computed*; the schema pins
  each value with `enum` and rejects extra keys.
- **multilingual** — 3 tasks × 4 languages (ko/en/ja/zh) = 12, plus 3
  code-switched items (English instruction around a Korean / Japanese / Chinese
  label block). Every answer has ≥4 digits, so guessing is not a strategy.
- **long_context** — needle in a synthetic haystack, ~2.1k to ~60k tokens-equivalent
  (chars/3), depth varied across start / middle / end.
- **function_calling** — BFCL-style: a tool signature, a request, and a required
  JSON call. The correct call is built from the same parameters that produced the
  request text, so it holds *by construction*.
- **abstention_hallucination** — 3 answerable + 3 unanswerable, both grounded in a
  short passage inside the prompt.
- **robustness** — 3 base items each paired with one surface-perturbed variant
  (scrambled presentation + reworded verbs / irrelevant preamble / extra walls off
  the optimal path). The build *proves* each pair shares a ground truth and a scorer.

---

## 3. How the independent re-verification works

`verify-items.mjs` imports exactly two things from the generator: `itemSpecs`
(parameters, which contain no answers) and `CODE_TASKS` (source code and input
generators, which also contain no answers). Every ground truth is re-derived with
a second implementation written in a deliberately different *shape*. If both sides
were the same code, the check would be worth nothing.

| task | bank (algorithm 1) | verifier (algorithm 2) |
|---|---|---|
| modular powers | naive repeated multiplication | binary exponentiation, BigInt |
| linear systems | Cramer over a fraction-free determinant | Gauss-Jordan with exact `Frac` + zero-residual substitution |
| logic grid | generated assignment, clue minimisation | exhaustive enumeration of all 216 grids; requires exactly one |
| substring count | KMP-automaton DP, absorbing matched state | enumerate all \|A\|^n strings |
| grid distance | BFS | Bellman-Ford relaxation |
| shortest-path count | DP over BFS layers | DFS enumeration of every optimal-length path |
| arithmetic chain | forward simulation | build a parenthesised expression, evaluate with a recursive-descent parser |
| code items | execute the shown source | execute it again, plus two independent re-implementations, plus two further inputs |
| format documents | generator's own computation | **re-parse the numbers out of the prompt text and recompute** |
| tool calls | parameter object | schema conformance + *entailment* (every value must appear in the prompt) |
| needle items | generated code | count occurrences, depth tolerance, distractor audit |
| river crossing | BFS over a 4-char state string | BFS over a 4-bit bitmask |
| two-part six | (authored answer) | enumerate the two-digit numbers |
| Hanoi | recursive move counter | BFS over peg states at n ≤ 5, plus the closed form |

### Scorer validity, not just answer validity

An answer being correct does not mean the scorer *measures* it. Three further
mechanisms run on every build:

- **Positive control (88/88).** A synthesised correct answer is fed to the real
  harness scorer and must be **accepted**. Without this, a scorer that failed
  everything would satisfy every negative control — the same silent failure,
  mirrored.
- **Negative control (80/80).** A plausible wrong answer must be **rejected**.
- **Mutation campaign (55/55).** Each item's expected value is corrupted in turn
  and the re-derivation must notice **every single one**. This is the check that
  makes the verifier falsifiable: a verifier that cannot fail is not a verifier.

For `instruction_following`, the constraint is additionally evaluated by a
hand-written semantic checker that shares no code with the item's regex, and the
scorer must agree with it on a compliant probe and on every violating probe.

Total on the current bank: **824 checks, 0 failures.**

### What the verification actually caught

The verification earned its keep. It found **11 real defects**, 9 in the generator
and 2 in the verifier itself:

| # | defect | consequence if shipped |
|---|---|---|
| 1 | substring-count DP had no absorbing matched state | returns 6 where the truth is 4 — wrong answer, would have been unexplainable |
| 2 | river-crossing BFS had an inverted guard | returned −1 for a puzzle whose answer is 7 |
| 3 | room answer `B-417` scored with `numeric` | `Number("B-417")` is `NaN`; a correct answer scored wrong |
| 4 | `json_nested` prompt said `bonus` is the *sum*, bank stored an unrelated number | item was **unanswerable** |
| 5 | `json_nested` prompt allowed 3 regions, schema pinned 1 | item was **unanswerable** |
| 6 | logic-grid answer indexed the colour table with a *pet* name | `expected` was `undefined`; harness rejected the item |
| 7 | `gaussSolve` never normalised the pivot row | **verifier** disagreed with a hand-checked system; the bank was right |
| 8 | `fib_mod` second implementation used a wrong matrix law | **verifier** disagreed on n=90; bank was right |
| 9 | a "violating" token probe contained the token it meant to omit | the probe suite was vacuous |
| 10 | the robustness pair reordered the *application* order | not a surface perturbation; it measured two different questions |
| 11 | `(?i)` inline flag in a JS regex | pattern does not compile; `regexMatch` does not catch the throw, so all 3 items would have silently failed every answer |

Defects 1, 4, 5, 6 and 11 would have produced a bank that was quietly wrong in
ways no reviewer would have caught by reading. Defects 7 and 8 were in the
verifier — the disagreement is what exposed them, which is the whole argument for
two independent implementations.

### Documented exclusion

`meta.excluded` in `items.json` records one item removed rather than guessed:

- **`can-twopart-01`** (the two-part six question). Taken literally, "I have a six,
  but not an eight" is satisfied by **sixteen** two-digit numbers (16, 26, 36, 46,
  56, 60–67, 69, 76, 96) and "a nine, but not a five" by sixteen more. The pair the
  question asks for is not determined by the text; the canonical answer is a riddle
  convention. Enumeration proves the non-uniqueness, so no ground truth can be
  asserted. Excluded rather than shipped on reputation.

---

## 4. `ifeval_inst_strict` — which items, and does the scorer validate?

**11 items supply it**, each carrying **exactly one** verifiable instruction, so an
item's pass/fail *is* one instruction followed:

| item | constraint | scorer | does the scorer really validate it? |
|---|---|---|---|
| `ifr-words-4/5/6` | exactly N whitespace-separated words | `regex` | yes — anchored whole-string match, and a semantic word counter agrees |
| `ifr-lower-01` | no capital letter anywhere | `regex` `^[^A-Z]*$` | yes |
| `ifr-forbid-01/02` | must not contain "however" / "basically" | `regex` with a negative lookahead | yes |
| `ifr-tokens-01` | must contain `cobalt`, `thistle`, `quarry` | `multi_all_of` | yes — `all` semantics; each missing token fails |
| `ifr-nodigit-01` | no digit character anywhere | `regex` `^\D*$` | yes |
| `ifr-bullets-01` | exactly 3 lines, each starting `- ` | `regex` | yes — a 4-line list cannot satisfy the 3rd repetition |
| `ifr-oneline-01` | no line break anywhere, including trailing | `regex` `^[^\n]*$` | yes |
| `ifr-prefix-01` | reply is exactly `ANSWER: <colour from a record>` | `regex` | yes — **and** the right format with the wrong colour is rejected |

`ifr-prefix-01` deserves the note: its regex pins the *content*, not just the
prefix, and the build asserts that `ANSWER: crimson` fails when the record says
`teal`. A format-only checker would have passed it.

**3 further items** (`ifr-multi-01/02/03`) carry two constraints (single line, and
lowercase letters and spaces only) and are all-or-nothing. They feed
`ifeval_prompt_strict` and are **excluded from `ifeval_inst_strict`**, tagged
`ifeval_unit:prompt` so the split is machine-readable. Without this separation
`ifeval_inst_strict` would be undefined, because the harness yields one binary
verdict per item and instruction-level accuracy needs one instruction per item.

---

## 5. `accuracy_lang` and the cross-lingual design

3 shared tasks × 4 languages, so the gap is a within-task comparison rather than a
difference of subject matter:

| | ko | en | ja | zh |
|---|---|---|---|---|
| items | 4 | 3 | 4 | 4 |

`accuracy_lang(ko)` — the pre-registered instance — is supplied by `ml-sum-ko`,
`ml-chain-ko`, `ml-reverse_sub-ko`, `ml-mixed-ko`. All four have ≥4-digit answers.
The code-switched items are the sharpest: the answer token occurs exactly once, in
a labelled non-English field, so the item cannot be satisfied without reading that
language.

---

## 6. SimpleQA F-score, and how binary verdicts map onto it

`F = 2c / (2c + 2i + n)`, with the convention that an abstained *answerable* item
counts as both incorrect and not-attempted. From this bank's per-item verdicts:

- `c` = answerable items passed
- `i` = (answerable items failed) + (unanswerable items that answered confidently)
- `n` = (answerable items failed) + (unanswerable items that abstained)

The build self-tests the formula on hand-checked vectors — `F(1,0,1) = 2/3`,
`F(3,2,1) = 6/11`, `F(0,0,0) = NaN`, `F(5,0,0) = 1`, `F(0,0,5) = 0`. (Two of my
own earlier expectations here were arithmetically wrong and the self-test caught
them.)

The abstention detector requires **both** an abstention marker **and** the absence
of any digit. The digit condition matters: without it, "the cost is unknown, but I
would guess 240 credits" passes, so a bare marker search is gameable. Verified:

| answer | verdict |
|---|---|
| "The passage does not say how much the bench cost." | PASS |
| "The cost is unknown, but I would guess 240 credits." | fail |
| "The bench cost 240 credits." | fail |
| "It was replaced on 19 March." (a real date from the passage) | fail |

The last row is deliberate: reciting a date that *is* in the passage is not
answering the question, so it must not earn credit.

---

## 7. Harness contract findings (for B1)

Two defects in the existing harness affect this bank. Both were broadcast to
`worklog`; neither is B1's file and I changed neither.

1. **`json_schema` reads the schema from `item.expected`, not
   `scorer_args.schema`.** `scorers.mjs:404` dispatches `json_schema` as
   `(a, e, x) => jsonSchema(a, e, x)`, so the schema arrives in the slot `pool.mjs`
   fills from `item.expected`; and `scorers.mjs:143` returns `[]` for a non-object
   schema. **A `json_schema` item whose `expected` is a string therefore passes
   every possible answer, including total garbage.** `README.md` and `items.mjs`
   both say the schema lives in `scorer_args.schema`, so the documented form
   silently accepts everything. This would have inflated 16 of 88 items (18%) to a
   guaranteed 100%. Mitigation: the schema is written to **both** `expected` and
   `scorer_args.schema`, and the build asserts the two are identical.

2. **`scorer_args` keys are camelCase; `README.md` §6 and `ITEMS.example.json` use
   snake_case.** `exactMatch` destructures `caseSensitive`, not `case_sensitive`, so
   the documented spelling is silently ignored. Two of B1's own tests use the
   snake_case spelling but assert on inputs that differ by whitespace, so they
   cannot detect it. This bank uses camelCase throughout, and the build rejects any
   `scorer_args` key ending in `_`.

Also noted: `custom_fn` has no registration hook in the production path
(`bin/run-bench.mjs` imports `pool`/`report`/`items` only), so any `custom_fn` item
would score 0 with a message that reads like a scoring result. This bank uses
`custom_fn` **zero** times.

---

## 8. Threats to validity, ranked

**1. The item bank was authored by the same model family it grades.** Every
prompt, every instruction-following constraint, every "what counts as a natural
request" judgement came from `space-bunny-free`, and `space-bunny-free` is the
subject. The ground truth is machine-derived and the scoring is deterministic, so
*correctness* is not in question — but the choice of problems, the phrasing, and
the calibration of difficulty all carry the author's fingerprint, and a systematic
advantage on our own bank would be indistinguishable from capability. **Unmitigated
within this session.** The only real fix is authoring by a different model family
and comparing the two banks' per-item agreement.

**2. `function_calling` and `code` measure proxies, not the real thing.** The
harness runs `--pure --dir <empty>` with no tools, so there is no tool execution to
observe. `function_calling` is schema-conformant call *emission* against a prompt
whose values are stated in the request; `code` is execution *simulation* against
code shown in the prompt. `task_success_rate` in particular must **not** be reported
as agentic task success — there is no final state to check. The `code` answers are
at least grounded in actually executing the reference solution, so the ground truth
is real; what is missing is a real environment.

**3. Answer-format compliance is confounded with capability.** 52 of 88 items are
scored by `numeric` or `exact_match` against a format the prompt states. A model
that reasons correctly and answers `"The verification code for station 7 is 4821."`
instead of `4821` may be marked wrong. I mitigated by asking for the bare form
everywhere, and the `numeric` scorer's first-number extraction absorbs a short
preamble — but the coupling is unquantified, and `pass_at_1` should be read as
"correct *and* correctly formatted" until a format-robustness arm exists. The
`robustness` category is a first probe of exactly this, at n=3 pairs, which is far
too small to quantify it.

**4. Statistical power is far below what the pre-registered metrics need.** A2's
own calculation (α=.05, power=.80, q=0.20 paired) requires **n≈628** to resolve a
5-point gap. This bank has 88 items; even at 3 repetitions that is 264 runs, and
only 11 items supply `ifeval_inst_strict` (33 at 3 reps). No primary metric from
this bank can support a 5-point claim. Treat every number it produces as
`≥10pt`-resolution or as exploratory. This is a property of the budget, not a
defect of the bank, but it constrains what may be written.

**5. The abstention detector is a keyword proxy with a known false negative.** It
requires an English marker and no digits, so it under-credits an honest abstention
that adds a true, irrelevant aside ("Not stated, though the kettle went on 12
March" fails). It is also English-only: a subject that abstains in Korean is scored
incorrect. The 3 unanswerable items are grounding tests, not knowledge tests, which
removes world-knowledge confounds but also means they say nothing about whether the
model *knows* a fact is unknowable.

**6. The long-context haystack is synthetic and formulaic.** Filler is generated
from a 60-word vocabulary in a fixed sentence shape, so it is far more compressible
than natural prose — a model may do better on this than on real documents. An
earlier version of this bank was digit-free, which let "return the only 4-digit
number" answer the item without reading; that is fixed (49–1161 distractor numbers
per item, asserted), but the filler remains unnatural. Depth is measured as a
character offset, and the brief's chars/3 token conversion is calibrated for ASCII
English — the subject's real tokenizer is not published, so the advertised
"60k tokens" is an estimate in the right order of magnitude and no more.

**7. The author is also the item reviewer.** Every check in this document was run by
the same agent that wrote the bank. The controls are designed to be mechanical, and
the mutation campaign demonstrates the verifier can fail, but no independent party
has confirmed that the checks test what they claim.

**8. This bank has no scaffold axis, and C1's measurements say that is fatal to any
external comparison.** C1 established from first-party tables that holding the
model fixed and changing only the scaffold moves the score by **18–43 points**
(GAIA: the same Claude Sonnet 4.5 scores 74.55% under HAL and 30.91% under HF Open
Deep Research — a 43.6-point swing from the harness alone; GPQA Diamond shows
18–28 points). This bank measures `opencode/space-bunny-free` under exactly **one**
scaffold: one prompt template, one isolation configuration, one scorers
implementation, zero repetitions in the current plan. So the subject's score carries
an **unmeasured scaffold offset of the same order as any gap anyone would want to
detect**. Concretely: a frontier model measured under a *different* scaffold can
differ from our subject by more than the whole accuracy range of this bank, while
being the same model. Any statement of the form "our subject resembles model X"
therefore cannot be supported by a single number from this bank, independent of
C1's data quality. Matching requires either running our subject under the compared
model's own reported scaffold configuration, or reporting a range whose width is
this offset. This also means `pass_at_1` here is a property of
(subject × this scaffold), not of the subject, and should be labelled that way in
every table.

---

## 8b. Note on what this bank cannot decide

Two things the federation might hope to get from it, which it structurally cannot
deliver: an absolute capability level comparable to a published leaderboard (threat
#8, and A1/C1's contamination and staleness findings), and any resolution of the
"how similar is our subject to a frontier model" question. The bank is built to make
one subject's results *internally* reliable and *reproducible* — every answer
machine-derived, every scorer validated in both directions, the whole artifact a
pure function of a seed. Reliability within a run is what was achievable here, and
comparability across runs with different scaffolds is not.

---

## 9. Operational notes for B2

- **The long-context items will need a larger `--timeout`.** `lc-needle-08` carries
  a 180 397-character prompt (~60k tokens-equivalent) and the default per-run
  timeout is 180 s, which is mostly CLI boot plus a very large prefill. Run the
  `long_context` category with `--tags`-style selection and a raised `--timeout`,
  and record a timeout as a *transport* failure, not a wrong answer — otherwise the
  item penalises the harness.
- **Concurrency 1 for anything latency-related**, per B1's measurement. The
  `long_context` prefill is the most likely place for contention to distort
  timings.
- **Do not report `task_success_rate` as agentic success** — see threat #2.
- **Report `ifeval_inst_strict` from the 11 `ifeval_unit:instruction` items only.**
  The 3 `ifeval_unit:prompt` items are a different metric.
- **A2's `ttft_model` should stay the headline latency metric.** Nothing in this
  bank changes B1's finding that CLI boot dominates end-to-end latency.
- The 8 `code` items give an unusually clean capability signal because their ground
  truth came from executing the reference implementation. If a round is ever budget-
  constrained, these are the items worth keeping.

---

## 10. Files

| file | role |
|---|---|
| `harness/generate-items.mjs` | seeded generator; `itemSpecs(seed)` returns parameters only |
| `harness/verify-items.mjs` | independent algorithm-2 re-derivation, controls, mutation campaign |
| `harness/build-items.mjs` | runs both, structural checks, reproducibility check, writes `items.json`, exits non-zero on any failure |
| `harness/items.json` | the bank, committed as a real artifact |
| `reports/A3-item-bank.md` | this document |

`node build-items.mjs` → **exit 0**, 88 items, sha256
`0295e0382e4c4d600ff4906d3fea0fdff36dfcab95a209cc113d37eb3fed22d9`, byte-identical
across repeated builds and under `--check`. No timestamps are written anywhere,
which is what makes that check meaningful.

No file outside `` was modified. No git commit was made.
