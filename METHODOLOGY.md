# METHODOLOGY

How the measurement works, and — more importantly — what it does and does not measure.

Read [`README.md`](README.md) first for the result. This file is the instrument description.

---

## 1. What kind of measurement this is

**A measurement, not a self-report.** The subject model is invoked as a subprocess
(`opencode run`) and its answer is scored by a deterministic program. The model is never asked
how it did. The full, untruncated stdout/stderr of every run is captured under
`reports/round1/*/artifacts/`.

Three things follow from the subprocess design:

| consequence | why |
|---|---|
| usage counters are real, not estimated | the CLI emits `step_finish` with `tokens.{input,output,reasoning,cache.{read,write}}` |
| a run that produced an answer is **never retried** | re-rolling a wrong answer is gambling, not measuring |
| transport failures are a *different* quantity from wrong answers | they measure the plumbing, not the model |

## 2. The bank: 88 programmatic items

`harness/items.json` (610,874 B, 9 categories). 84 items are emitted by a seeded generator
(`harness/generate-items.mjs`); 4 are hand-written canonical cases where a template would be
worse (2 tool-call utterances that must read like a user, 2 puzzles whose answers are already
known).

| category | items | what it probes |
|---|---|---|
| reasoning | 15 | multi-step arithmetic, modular exponentiation, graph traversal, dynamic programming |
| multilingual | 15 | the same 3 base tasks across ko / en / ja / zh, plus 3 code-switch items. Every answer ≥ 4 digits, so guessing is impossible |
| instruction_following | 14 | 11 items with **exactly one** verifiable instruction each (1:1 with the `ifeval_inst_strict` metric); 3 items with 2 instructions, scored all-or-nothing and tagged separately |
| format_control | 8 | JSON-schema conformance, nesting, no-separator string construction |
| long_context | 8 | needle retrieval from 100k–180k character passages |
| function_calling | 8 | tool-call emission against a signature, single and multiple tools |
| abstention_hallucination | 6 | 3 answerable + 3 unanswerable; abstention and non-hallucination |
| robustness | 6 | equivalent surface forms and reordered operations |

### Why the answers can be trusted even though the bank is generated

`harness/verify-items.mjs` imports **only the answer-free parameters** from the generator and
re-derives every answer with a **second, deliberately different implementation**:

- naive repeated multiplication ↔ binary exponentiation with `BigInt`
- Cramer's rule ↔ Gauss-Jordan over exact rationals, with residual checking
- BFS ↔ Bellman-Ford
- dynamic programming ↔ brute-force enumeration
- forward simulation ↔ recursive-descent expression parsing
- executing the prompt's own source ↔ two independent re-implementations plus two extra inputs
- **re-parsing the numbers out of the prompt text and recomputing**
- forced/tool call ↔ 4-bit bitmask BFS

`harness/build-items.mjs` runs build + verification + write, and **exits non-zero without
writing** if anything fails:

```
checks run: 824
positive controls: 88/88 correct answers correctly ACCEPTED
negative controls: 80/80 wrong answers correctly rejected
mutations detected: 55/55
```

**The positive controls are the load-bearing part.** Without them, a scorer that rejects
everything would pass every negative control. The negative controls use plausible wrong
answers, not garbage. The mutation campaign breaks each expected value in turn and requires
the independent derivation to catch it.

**The verification found 11 real defects** — 9 in the generator, 2 in the verifier itself — of
which five are the kind that reading cannot catch: an absorbing state missing from a substring
DP (returned 6 where the truth is 4), a `B-417` answer scored with a numeric scorer
(`Number("B-417")` = `NaN`, so the *right answer scored as wrong*), an item whose prompt
contradicts its own expected output, a region rule permitting 3 values where the schema fixed 1,
and a robustness pair that reordered the operations and so measured a different problem.

## 3. The harness contract

- `--format json` — required, or the usage counters are absent
- `--pure --dir <empty>` — **required**, see §4
- `--concurrency 1` — recommended, see §7
- Append-only `run-log.jsonl`, one line per **attempt**, resumable
- `artifacts/<run_id>.stdout.txt` / `.stderr.txt` / `.meta.json` — complete, untruncated

Scorers: `exact_match`, `contains`, `numeric` (abs/rel tolerance), `regex`, `json_schema`,
`multi_all_of`. **All deterministic. No LLM judge anywhere in the reported numbers.**

### Known contract defects, present in this round's harness and NOT fixed

Recorded here rather than patched, because patching mid-round would change what a re-run means
while the round is live, and the corrected numbers come from the adjudicated log instead.

| # | file:line | defect | consequence |
|---|---|---|---|
| 1 | `harness/runner.mjs:328` | the `catch` around `spawn` calls `finish()`, which closes over `const outChunks` declared at `:331` — temporal dead zone. A throw from inside a catch is not caught by that catch, so the promise **rejects**, violating the documented contract at `:278` ("Resolves — never rejects") | oversized-argv spawn errors surface as an exception instead of a record |
| 2 | `harness/pool.mjs:244` | `applyScore` runs unconditionally, including on failure records | `answer: ''` becomes `scored: true, passed: false` |
| 3 | `harness/aggregate.mjs:81-83` | `isScored(r)` checks neither `r.failure` nor whether the answer is empty, while its docstring and `harness/README.md` both claim it excludes transport failures | **the docstring and README are a false contract**; 2 runs were double-counted as both 1.1% unreliability and 1.1% accuracy failure |
| 4 | `harness/scorers.mjs:407` | `json_schema` dispatches `(a, e, x) => jsonSchema(a, e, x)`, reading the schema from `item.expected`, while `harness/README.md:206-212` and `harness/items.mjs:74-76` require it in `item.scorer_args.schema`; a non-object schema makes `jsonSchema` **fail open** (`:143` returns `[]`, so anything passes) | latent. **Measured impact on this round: 0.** All 16 `json_schema` items carry byte-identical `expected` and `scorer_args.schema` objects, so the bank's double-record assertion held |

## 4. Contamination control, and what it does not control

`--pure --dir <empty temporary directory>` is mandatory. Measured effect, not assumed: with
the flags, a trivial "count from 1 to 40" prompt costs 22.0 s wall and 28,439 prompt tokens;
without them the workspace charter and session protocols are injected, the model calls a
retrieval tool, and the answer is prefixed with a recall notice. That is **~2× slower and
~12k tokens more**, and it structurally destroys any exact-match scorer.

**What `--pure` does control:** no run leaked workspace *content* — no charter text, no
repository source, no peer findings. 181 of 184 records carry `pure=true, format=json,
cwd=<isolated temp dir>` across two different directories; the other 3 are synthetic failure
records that never spawned a subprocess.

**What it does not control — and this is a finding, not a footnote:**

- **The model can still use tools itself.** 5 runs called `bash` (7 calls) and **all 5 passed.**
  Two of them computed a fast-doubling modular Fibonacci, so without the tool the item would
  have been a different and harder task. **The scaffold varied inside a single measurement.**
- **Per-run boilerplate leakage is still possible.** 2 of 176 runs (1.14%) carried a
  session-protocol prologue; both were adjudicated on the answer, not the prefix, and the
  verdict is identical either way. **Directional bias: zero.** The affected item is clean in its
  other repetition, so this is a per-run coin flip, not a per-item property.
- A phrase-scanner flagged the string *"someone is still awake"* as a tool-written note. It is
  that item's own natural English answer, and the item's forbidden word (`basically`) was
  avoided. **A false positive, recorded because pattern-matching English is not auditing.**

## 5. The audit (`harness/adjudicate.mjs`)

Rules R0–R6 are written in the tool's header **before** the verdicts, applied in order, first
match wins, and **a rule may only move a verdict in the direction stated.** Every changed
verdict carries the rule id, so `run_id → original → corrected → rule` is traceable end to end.

| rule | moves | direction | needs judgement? |
|---|---|---|---|
| R1 | never-measured run | out of the denominator | no (pure code) |
| R2a/R2b | item is defective | out of the denominator | no (pure code) |
| R3a | correct abstention, blocked only by a no-digit lookahead | → correct | **yes** |
| R4a | correct abstention phrased outside the pattern's vocabulary | → correct | **yes** |
| R5a | correct final value present, scorer read an earlier number | → correct | no (pure code) |
| R6 | real failure | unchanged | no |

**Human judgement is exposed, not buried.** R3/R4 turn on "is this a semantic abstention",
which is a reading, not a computation. So every flipped run must appear in an explicit
`SEMANTIC_JUDGMENTS` table with a justification, and `--strict` **fails with exit 2** if a rule
flips a run with no entry, if an entry exists for a run the rules do not flip, or if the rule
ids disagree. The judgement is auditable and the tool stays deterministic.

The gate earned its keep by catching three real bugs **in the audit itself**: one rule that
silently never fired; a floor accessor that took its verdict function as a string and never
called it, making two "different" numbers one computation; and a summary writer that clobbered
another log's entry. The first fixture was also vacuous — it was replaced and then verified by
**deliberately breaking the accessor** and confirming the gate fails (exit 2).

## 6. The fairness guarantee

`harness/adjudicate-anchors.mjs` applies the identical rule set to the anchor logs, and then
**re-audits the subject log with its own engine**, asserting agreement with the original audit
on `verdict`, `rule`, `changed` and `original_passed` for **176 of 176 runs**. Any mismatch
aborts the anchor adjudication with exit 2.

This is not belt-and-braces politeness. Our first analytical pass audited the subject and left
the anchors raw, and that produced a confident, entirely artefactual "the subject beats every
anchor by 17 points". **Adjudication moved glm by +12.92 pp and the subject by only +7.77 pp.**
Auditing one side of a comparison is not a neutral act.

## 7. Latency accounting, and the field-name trap

| field | meaning |
|---|---|
| `latency_ms` | spawn → process exit. End to end. |
| `ttft_spawn_ms` | spawn → first text event. **Includes** CLI boot and provider queueing. |
| `ttft_opencode_ms` | first `step_start` → first text event. **Excludes** boot. The only segment attributable to inference. |
| `ttft_model_ms` | the same span measured by stream arrival. Chunk-quantised, so it can read ~0. |

**93.33% of the subject's end-to-end latency is pre-model.** Dividing `ttft_opencode_ms` by
`latency_ms` is a unit error that understates the boot share by ~45×; we made it, and caught it
by reading `harness/runner.mjs:187,201` rather than by reasoning about it.

**No metric here is a true time-to-first-token.** `opencode run` emits one whole-text part with
no token deltas, so every TTFT figure is an **upper bound**.

**Concurrency 1.** Measured peak child RSS 557–572 MB against a 2 GiB cgroup: 1 child = 0.56 GiB
(comfortable), 2 children = 1.11 GiB (0.2 GiB headroom, and latency rose 10.2 s → 17.5 s from
CPU/memory contention), 3 = OOM. **Latency comparisons are only valid at concurrency 1.**

## 8. Statistics

Everything cited is machine-verified. `harness/stat-verify.mjs` → **234 checks, 0 failures**;
`harness/psycho-verify.mjs` → **0 failures**. Both exit non-zero on failure.

- **Wilson score intervals** (95%, z = 1.959964), which stay inside [0,1] at p = 0/1 and small
  n. Cross-checked against **two independently authored implementations**
  (`harness/psycho-verify.mjs:62` and `harness/aggregate.mjs:24`), agreeing to < 1e-9.
- **McNemar exact test** with exact `BigInt` combinatorics, on the paired discordant counts.
  Asserted trap: `mcnemarExact(0,0)` returns p = 1, so a caller must check `n > 0` itself.
- **Pass@k**: the naive `1-(1-p̂)^k` is always an **under**-estimate of the unbiased estimator
  (by up to 10.6 pp at n=200, k=100). We had the direction backwards; the self-test corrected us.
- **Brier score** has three conventions with different ranges (`[0,1]`, `[0, 1+1/(C-1)]`,
  `[0, (1+1/(C-1))/C]`). A Brier figure without a stated class count is meaningless.
- **The abstention family has no convention-free F.** `F = 2c/(2c+2i+n)` (verified against 6/6
  published values) gives **1.000** if declining counts as correct, **0.667** if declining counts
  as not-attempted (SimpleQA's letter), **0.500** if declining counts as incorrect. **50 F-points
  separate two defensible readings of the same runs** — larger than any effect the round could
  detect. The convention is therefore named on the axis; on the frontier axis we use (ii) because
  the axis it is compared against is SimpleQA Verified, and we publish (i) and (iii) as bounds.
- **Where a p-value cannot be computed, none is printed.** All frontier permutation tests at
  k ≤ 4 are recorded as *structurally unresolvable* rather than as p = 1.

## 9. What this instrument does **not** measure

- **Not agentic task success.** No tools, no environment, no final-state check. The
  `function_calling` and `code` families measure *a schema-shaped answer was emitted*, which is
  a proxy. The strongest available signal is that 5 runs used `bash`.
- **Not a knowledge benchmark.** There are no questions with a knowable right answer in the
  world; the bank is fully programmatic, so it cannot measure hallucination about facts, only
  hallucination about a supplied passage.
- **Not a reasoning-effort measurement.** The effort parameter is never exposed.
- **Not a cost measurement.** Free tier ⇒ `cost = 0` is a billing fact. A cost-per-solved-task
  metric would be 0/0 and would read as "free is best".
- **Not a tokenisation-portable result.** Korean and CJK token counts depend on the tokenizer,
  which for this subject is undisclosed. Literature values must not be transplanted; the premium
  must be measured directly.
- **Not a frontier measurement.** No frontier commercial model is callable here. Every frontier
  number in this repository is `reported` by a vendor or an eval organisation.
- **Not a single-scaffold fact.** The subject was measured under exactly one agent scaffold whose
  budget is unknown. That is the largest caveat in the whole report.
