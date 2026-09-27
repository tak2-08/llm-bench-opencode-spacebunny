# llm-bench harness — empirical measurement of `opencode run`

Measures a model by **actually invoking it** as a subprocess (`opencode run`) and
scoring the answer, rather than asking the model to self-report.

Subject of the current round: `opencode/space-bunny-free`.
Written by B1 (실측감사단). Read-only w.r.t. every other project; writes only under
this repository. No commits.

---

## 1. Quick start

```bash
cd harness

# offline unit tests (no model calls, ~1 s)
node --test test/parse.test.mjs test/scorers.test.mjs test/aggregate.test.mjs test/pool.test.mjs

# the live smoke test (1 real model call)
BENCH_LIVE=1 node --test test/live-smoke.test.mjs

# plan a run without spending anything
node bin/run-bench.mjs --items ITEMS.example.json \
  --models opencode/space-bunny-free --concurrency 1 --dry-run

# a real run
node bin/run-bench.mjs --items ITEMS.example.json \
  --models opencode/space-bunny-free,nvidia/z-ai/glm-5.3-flash \
  --reps 1 --concurrency 1 --out ../reports/round1
```

Outputs, in `--out`:
- `run-log.jsonl` — append-only, one line per **attempt** (resumable)
- `artifacts/<run_id>.stdout.txt` / `.stderr.txt` / `.meta.json` — full untruncated capture
- `report.md`, `report.json`

Environment: `OPENCODE_BIN` (default `/usr/local/bin/opencode`),
`BENCH_CONCURRENCY` (default concurrency when `--concurrency` is absent),
`BENCH_LIVE=1` (enable the live test), `BENCH_SMOKE_MODEL` (model the smoke test uses).

---

## 2. Isolation flags are not optional — read this before running a batch

The harness defaults to `--format json --pure --dir <fresh temp dir>`.
All three matter for measurement validity, and the first two are **not** about
opencode's features — they are about this workspace.

Measured on 2026-09-27, same model, same prompt ("Count from 1 to 40"), one at a time:

| | `--format json` alone | `+ --pure --dir <empty>` |
|---|---|---|
| wall clock | 22.0 s | **11.0 s** |
| input tokens (incl. cache) | 28,439 | **16,530** |
| tool calls made | 1 (`memory_search`) | **0** |
| answer text | `기억 확인: 관련 기록 없음 …\n\n1\n2\n…` | `1\n2\n…` |

Without isolation the model **inherits this workspace's `AGENTS.md` charter and the
memory/radio plugin protocol**, so it burns ~12k extra tokens, calls `memory_search`
on a trivial prompt, and **prepends a Korean preamble to its answer**. That preamble
structurally breaks `exact_match`, and the extra step roughly doubles latency.

The harness passes `--dir` a freshly created empty temp dir by default. If you point
`--dir` pointing at a directory that is *not* empty, you get the pollution back. Use `--no-pure` only when
deliberately measuring the agentic/tool-using configuration.

---

## 3. What the substrate actually provides (measured, opencode 1.18.22)

**Yes — `opencode run` exposes real usage, via `--format json`.** Each `step_finish`
event carries:

```json
{"type":"step_finish","part":{"type":"step-finish","reason":"stop",
  "tokens":{"total":29509,"input":972,"output":98,"reasoning":0,
            "cache":{"write":0,"read":28439}},"cost":0}}
```

So `output_tokens` is a **real counter**, not an estimate. Per-run values are the
**sum over all steps of the turn**. `cost` is summed the same way (currently `0` —
the subject runs on a free tier, so cost-based metrics are degenerate; see §7).

The default (`--format default`) format exposes **no** counters at all.

Other verified facts:

- **The banner is on STDERR, not stdout.** stdout for a one-word answer is exactly
  `"PING-OK\n"`; stderr is `"\x1b[0m\n> build · space-bunny-free\n\x1b[0m\n"`. The task
  brief assumed stdout; the harness strips banner lines from *both* streams anyway and
  reports what it removed (`stripped_lines`, `banner_on_stderr`) so stripping can never
  silently discard model output.
- **Error signature**:
  `{"type":"error","error":{"name":"UnknownError","data":{"message":"Unexpected server error…","ref":"err_c5491590"}}}`
  — `ref` lives at `error.data.ref`, **not** at the top level. Recorded as `error_ref`
  and used for retry classification. A regex safety net (`findErrRef`) catches the ref
  even when the JSON envelope is unparsable.
- **Events arrive progressively** (verified across separate chunks), so arrival-based
  timing is possible — but see the granularity caveat in §4.
- **The text arrives as one whole part, not token deltas.** `opencode run` does not
  expose token-level streaming, so **no metric in this harness is a true
  time-to-first-token.**
- There is **no `--system` flag.** An item's `system` field is prepended to the user
  message as an explicit `[System instruction]` block. This is a fidelity compromise,
  not a real system role.

---

## 4. Metrics: exact definitions and their known bias

Per run, the record carries:

| field | definition | bias / caveat |
|---|---|---|
| `latency_ms` | spawn → process exit | Includes `opencode` CLI boot. **This is the constant that dominates.** |
| `ttft_spawn_ms` | spawn → arrival of the first answer byte | Includes CLI boot. Quantised by stdout chunk coalescing. |
| `ttft_model_ms` | first opencode event → first text part, **by stream arrival** | Excludes boot, but **chunk-quantised**: if every event lands in one chunk this reads ~0. Observed 1 ms on a real 10.2 s run. Kept for comparison only. |
| `ttft_opencode_ms` | first `step_start` → first text part, on **opencode's own event clock** | **Headline latency metric.** Excludes boot and is immune to chunk coalescing. Can still read `0` when the model answers in a single burst (observed), because it measures *answer completion*, not first token. |
| `generation_ms` | `part.time.end − part.time.start` for the first text part | opencode's own accounting. Can be implausibly small (8–9 ms observed) — treat as indicative, not authoritative. |
| `output_tokens` | Σ `step_finish.tokens.output` when available | **Real counter.** `token_source` records which basis was used. |
| `reasoning_tokens` | Σ `tokens.reasoning` | Real, but only present in `json` mode. |
| `prompt_tokens` | `input + cache.read + cache.write` | Cache-read tokens dominate (~18k of ~18.5k): the harness's own prompt. |
| `cost` | Σ `step_finish.cost` | **`0` on this free tier.** Do not compute cost-per-solved-task; it degenerates to 0/0. |
| `peak_rss_kb` | max `VmRSS` sampled from `/proc/<pid>/status` every 400 ms | Sampling, not a true peak. Drives the concurrency recommendation. |

**The `chars/4` fallback** (`estimateTokensChars4`, used only when `token_source` is
`char4`, i.e. the non-JSON format): `ceil(chars/4)`. Calibrated for English ASCII.
It **under**-counts short/technical output — real counter said 5 tokens for `PING-OK`
(7 chars) where the proxy said 2 — and **over**-counts Hangul/CJK, where ~1.5–2
chars/token means the proxy can overstate by roughly 2–3×. **Prefer
`token_source: "usage"`.** Records carry both (`output_tokens` and
`output_tokens_char4`) so the discrepancy is auditable.

**Aggregate** (see `aggregate.mjs`): accuracy, correct, n, **Wilson 95 % CI**
(z = 1.959964), **reliability** = 1 − failed_attempts/attempts, and latency/token
distributions (mean, median, p95, max, min, sample stdev) broken down per model, per
category, and per model×category. p95 is **nearest-rank** (no interpolation), which is
the conservative choice at small n.

Two decisions worth stating because they change what the numbers mean:

1. **Transport failures are excluded from the accuracy denominator** and reported
   separately as reliability. Counting a timeout as a wrong answer punishes the model
   for the harness's or the provider's transport.
2. **A run that produced an answer is never retried, however badly it scored.**
   Retrying a wrong answer until it turns out right would measure luck, not
   capability. Retries are transport-only.

`Wilson's interval is used rather than Wald because Wald leaves [0,1] at p=0/1 and
collapses to zero width there, both of which occur at small n. An impossible count
(`correct > n`) is clamped rather than allowed to produce NaN — a NaN in a report is
worse than a slightly wrong number.

---

## 5. Item bank schema

Either a bare array of items, or `{ "version": 1, "meta": {...}, "items": [...] }`.
See `ITEMS.example.json`.

```jsonc
{
  "id": "string",                 // required, unique, stable — it is part of run_id
  "category": "reasoning|instruction|math|code|format|factoid|multilingual|agentic",
  "prompt": "full prompt text",   // required
  "system": "optional system override",  // see the --system caveat in §3
  "scorer": "exact_match|contains|regex|json_schema|choice|numeric|multi_all_of|custom_fn",
  "scorer_args": {},              // per-scorer options, see §6
  "expected": "ground truth",     // required for every scorer except custom_fn
  "notes": "provenance of the item",
  "tags": ["..."]                 // optional, used by selectItems()
}
```

Keys starting with `$` are reserved. `validateItems()` never throws: it returns
`{items, errors, meta}` and the CLI refuses to start on any error, so a malformed bank
cannot silently produce a partial benchmark.

`run_id = sha256(model, item_id, rep)`, first 16 hex chars. Stable across processes
and machines — this is the resume key.

---

## 6. Scorers

All are pure, deterministic, unit-tested, and **never throw**: any internal error
becomes `{passed:false, detail:"scorer-error in …"}`. Every scorer returns
`{passed: boolean, detail: string}`.

### `exact_match`
Normalises both sides: strip markdown code fences, NFC compose, collapse all
whitespace, lowercase (unless `case_sensitive`).
`scorer_args`: `case_sensitive`, `ignore_punctuation` (drops `.,!?;:'"\` from **both**
sides), `stripMarkdown`.

### `contains`
`scorer_args`: `case_sensitive`, `all` (require every needle, not any), `ignoreDiacritics`.
`expected` may be a string or an array of strings.

### `regex`
`expected` is the pattern. `scorer_args`: `flags` (a string, e.g. `"i"`).
Refuses subjects over 20,000 chars as a guard against catastrophic backtracking.

### `json_schema`
Structural validation — deliberately **not** a JSON-Schema implementation.
Supported keywords: `type` (`object|array|string|number|integer|boolean|null`, or an
array of them), `required`, `properties`, `items`, `enum`, `additionalProperties:false`,
`minItems`/`maxItems`, `minimum`/`maximum`.
`scorer_args`: `schema` (required), `required` (set `false` to only check parseability),
`maxViolations` in the detail string.
Answers are parsed leniently: a fenced block, or the first balanced object/array
embedded in prose (string-aware, so `{"a":"} not a brace"}` parses correctly).

### `choice`
Two chains, selected by whether the options are all single letters.

**Letter chain** (`allowed: ["A","B","C"]`), first hit wins; a candidate outside the
allowed set is rejected and the chain continues:
1. explicit marker — `ANSWER: B`, `Answer is (C)`, `정답: A`, `답은 D 입니다`
2. `\boxed{B}`
3. bold token — `**B**`
4. bracketed — `(B)` / `[B]` as a standalone token
5. bare letter alone on a line
6. last standalone letter token anywhere

**Token chain** (multi-character options, e.g. `allowed: ["10:00","11:00"]`), because a
letter chain cannot express them: marker → whole-answer exact match → longest option
occurring in the answer.
`scorer_args`: `allowed` (required unless `expected` is a single letter).

### `numeric`
Tolerates thousands separators, `%`, currency prefixes, and `a/b` fractions.
`scorer_args`: `absTol`, `relTol` (pass if `|a−e| ≤ relTol·|e|`), `fromLastLine`
(read only the final line). Extracts the **first** number otherwise.

### `multi_all_of`
`expected` is a string or array of substrings that must **all** appear.
`scorer_args`: `case_sensitive`, `normalize` (default true — whitespace-collapsed,
so substring tests are not defeated by reflowed text).

### `custom_fn`
Escape hatch. Register before running:
```js
import { registerScorer } from './scorers.mjs';
registerScorer('startsWith', (answer, expected, args, ctx) => ({ passed: …, detail: … }));
```
`scorer_args.name` selects it. An unregistered name fails cleanly (it does not throw);
a custom scorer that throws or returns a non-conforming value is contained.

---

## 7. Concurrency — measured, not guessed

Measured on this container (2026-09-27):

- cgroup `memory.max` = **2 GiB**; `memory.current` at rest ≈ **1.125 GiB**
- 2 CPUs (`cpu.max` = 200000/100000), 4 `nproc`, `pids.max` 256
- **one `opencode run` child peaks at ~557–572 MB RSS** (`VmHWM`, sampled)

| concurrency | children peak | headroom in the 2 GiB cgroup | observed |
|---|---|---|---|
| 1 | ~0.56 GiB | comfortable | 10.2 s latency |
| 2 | ~1.11 GiB | ~0.2 GiB — **tight** | worked; 17.5 s latency |
| 3 | ~1.67 GiB | **negative** (with a 1.1 GiB baseline) | will OOM-kill |

**Recommendation: `--concurrency 2` maximum, `1` for anything you intend to compare on
latency.** Two things drive this:

1. **Memory.** 3 × 560 MB of children does not fit alongside the 1.125 GiB baseline.
2. **Contention already distorts latency at 2.** 10.2 s at concurrency 1 vs **17.5 s**
   at concurrency 2 on a trivial prompt. That is not model behaviour; it is CPU and
   memory contention. **Latency comparisons across models are only valid at
   concurrency 1.**

The original measurement machine also had a load gate script (not included; it was part of the operator tooling, not of this study)
(`check` → exit 0 GO / 3 BLOCK; `wrap <cmd>` takes a slot). The harness does not depend
on it, but do not fight it: `throttle.sh wrap node bin/run-bench.mjs …` is the
cooperative way to run a batch here. Note its `memavail_mb` reading comes from
`/proc/meminfo`, which in a cgroup-limited container shows the *host* and so
under-reports the real constraint — the cgroup numbers above are authoritative.

> **Latency caveat that matters more than all of the above:** with `--pure --dir`,
> `ttft_opencode_ms` measured 0–1.3 s and the `generation` window 8–9 ms, while
> `latency_ms` was 10–17 s. **The `opencode` CLI boot, not model inference, dominates
> end-to-end latency here.** Do not present `latency_ms` as "model latency" in a
> cross-model comparison without subtracting boot (use `ttft_opencode_ms`), and do not
> claim a latency difference smaller than the boot jitter.

---

## 8. Resumability and the run log

`run-log.jsonl` is append-only, one JSON object per **attempt** (so a retried run
appears twice, with `attempt` 1, 2, …).

- **Resume** (default on) reads the log, collects `run_id`s, and skips completed ones.
  A run counts as complete if any attempt produced an answer; a run whose only
  attempts failed is retried.
- **Torn lines are tolerated.** A crash mid-append can leave a partial final line.
  `readLog` counts it (`bad`) instead of throwing, and `appendRecord` **heals it** by
  writing a newline before the next record — otherwise the next append would be glued
  onto the fragment and one crash would silently destroy a second run.
- `--no-resume` re-runs everything.
- Ctrl-C (SIGINT/SIGTERM) is graceful: in-flight runs finish and are logged, no new
  runs start, and `stats.aborted` is set. The log stays valid and resumable.

**Retries** are transport-only (server error / transport / empty answer / timeout),
with exponential backoff and full jitter (`backoffMs`, 50–100 % of `baseMs·2^(n−1)`,
capped) so N workers hitting the same server error do not resynchronise into a
thundering herd. A `killed` failure and a harness bug are **not** retried.

---

## 9. Files

| file | purpose |
|---|---|
| `runner.mjs` | one measurement: spawn, stream capture with arrival times, answer extraction, banner/ANSI stripping, usage, error classification, artifact writing |
| `pool.mjs` | JSONL log (read/append/heal), task expansion, bounded worker pool, jittered transport-only retries, resume, graceful abort |
| `scorers.mjs` | 8 pure scorers + the `custom_fn` registry |
| `items.mjs` | item bank loading, schema validation, selection helpers |
| `aggregate.mjs` | Wilson CI, distribution stats, per-model/category breakdowns, diagnostics, problem list |
| `report.mjs` | Markdown + JSON report writer |
| `bin/run-bench.mjs` | CLI |
| `ITEMS.example.json` | 3-item shape demonstration (**not** the real bank — that is A3's) |
| `test/parse.test.mjs` | TTFT/answer parsing from verbatim messy stdout, error signature, failure classification |
| `test/scorers.test.mjs` | every scorer, the choice fallback chain, and a fuzz-ish "never throws" sweep |
| `test/aggregate.test.mjs` | Wilson CI vs. hand-derived and standard closed forms, edge properties, report rendering |
| `test/pool.test.mjs` | resume, retry policy, jitter, concurrency bound, abort — with a fake runner, so no model calls |
| `test/live-smoke.test.mjs` | 1 real model, 1 item, end to end; skipped unless `BENCH_LIVE=1` |

---

## 10. Known limitations

- No true TTFT (§3) — `opencode run` does not stream tokens.
- `system` is emulated as a prompt block, not a real system role.
- `peak_rss_kb` is sampled every 400 ms, so it can under-report a spike.
- The Wilson CI assumes independent Bernoulli trials. **Repeated runs of the same item
  (`--reps`) are correlated**; with reps > 1 the naive interval is too narrow. Either
  aggregate at the item level, or cluster-bootstrap (A2's `P3` prespecification).
- `--dir` isolation means the model does **not** see this workspace's `AGENTS.md`; that
  is intentional for a capability benchmark and wrong if you are trying to measure the
  agentic, tool-using configuration (there, use `--no-pure` and a deliberate `--dir`).
