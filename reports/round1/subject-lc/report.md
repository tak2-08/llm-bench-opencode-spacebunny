# LLM benchmark — opencode/space-bunny-free

- generated: `2026-09-27T14:11:04.612Z`
- schema: `llm-bench/summary/v1`
- models measured: `opencode/space-bunny-free`
- item bank: `items-lc.json` (8 items, 1 rep)
- concurrency 1, format json, pure=true

## Overall

| metric | value |
| --- | --- |
| attempts | 8 |
| scored n | 8 |
| correct | 7 |
| accuracy | 87.5% |
| Wilson 95% CI | [0.529, 0.978] |
| failed attempts | 1 |
| reliability | 87.5% |
| latency mean / median / p95 / max (ms) | 17992.13 / 20613 / 24161 / 24161 |
| TTFT spawn mean / p95 (ms) | 20206.14 / 22836 |
| TTFT opencode mean / p95 (ms) | 182.43 / 993 |
| generation window mean / p95 (ms) | 12 / 16 |
| TTFT stream-arrival mean (chunk-quantised) | 183 |
| output tokens mean / total | 2.38 / 19 |
| token source | `mixed|char4` |
| cost total | 0 |

## Per model

| model | n | correct | accuracy | CI95 low | CI95 high | rel | lat mean | lat p95 | ttft_opencode mean | out tok mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| opencode/space-bunny-free | 8 | 7 | 87.5% | 0.529 | 0.978 | 87.5% | 17992.13 | 24161 | 182.43 | 2.38 |

> `rel` = reliability = 1 − failed attempts / attempts. `latency` includes `opencode` CLI boot; `ttft_opencode` excludes it and is the headline latency metric.


## Per category

| category | n | correct | accuracy | CI95 | latency p95 (ms) | output tok mean |
| --- | --- | --- | --- | --- | --- | --- |
| long_context | 8 | 7 | 87.5% | [0.529, 0.978] | 24161 | 2.38 |

## Per scorer

| scorer | n | correct | accuracy |
| --- | --- | --- | --- |
| exact_match | 8 | 7 | 87.5% |

## Failures

| kind | count |
| --- | --- |
| harness | 1 |

## Diagnostics

| diagnostic | value |
| --- | --- |
| runs with tool calls (prompt pollution risk) | 0 |
| runs with stripped banner lines | 0 |
| runs with malformed JSON lines | 0 |
| runs with empty answer | 1 |
| child peak RSS mean / max (KB) | 558985.14 / 563372 |

## Problems (1)

| run_id | model | item | cat | failure | detail | answer preview |
| --- | --- | --- | --- | --- | --- | --- |
| 64663944f481cf8b | opencode/space-bunny-free | lc-needle-08 | long_context | harness | normalized: "" != "7542" |  |

## Method notes

- Accuracy counts only runs that produced a non-empty answer **and** were scored; transport failures are excluded from the denominator and reported separately as reliability.
- CI is a Wilson score interval (95%, z = 1.959964), which stays inside [0,1] at p = 0/1 and small n.
- `latency_ms` is spawn→process exit. `ttft_spawn_ms` is spawn→first answer byte (**includes** CLI boot). `ttft_opencode_ms` is first `step_start`→first text part on opencode's own clock (**excludes** boot, not chunk-quantised) — the headline metric. `ttft_model_ms` is the same span measured by stream arrival and **is** chunk-quantised, so it can read ~0. `generation_ms` is opencode's own generation window for the first text part.
- No metric here is a true time-to-first-token: `opencode run` emits one whole-text part with no token deltas, so these bound the true first-token time from above.
- `output_tokens` comes from the `step_finish` usage counters when `token_source=usage`; otherwise it is the `ceil(chars/4)` proxy, which under-counts code and over-counts Hangul/CJK.
- Transport failures are retried with full-jitter backoff. A run that produced an answer is **never** retried, so a wrong answer is never rerolled into a right one.

