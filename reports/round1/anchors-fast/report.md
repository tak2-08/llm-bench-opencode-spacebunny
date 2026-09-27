# LLM benchmark — meta/muse-spark-1.3

- generated: `2026-09-27T16:46:41.229Z`
- schema: `llm-bench/summary/v1`
- models measured: `meta/muse-spark-1.3`
- item bank: `chunk-meta_muse-spark-1_3-36.json` (9 items, 1 rep)
- concurrency 2, format json, pure=true

## Overall

| metric | value |
| --- | --- |
| attempts | 48 |
| scored n | 48 |
| correct | 42 |
| accuracy | 87.5% |
| Wilson 95% CI | [0.753, 0.941] |
| failed attempts | 3 |
| reliability | 93.8% |
| latency mean / median / p95 / max (ms) | 31180.73 / 25419 / 74728 / 102094 |
| TTFT spawn mean / p95 (ms) | 26501 / 45569 |
| TTFT opencode mean / p95 (ms) | 5753.16 / 21123 |
| generation window mean / p95 (ms) | 73.76 / 238 |
| TTFT stream-arrival mean (chunk-quantised) | 5756.78 |
| output tokens mean / total | 127.5 / 6120 |
| token source | `usage` |
| cost total | 0.9830733000000001 |

## Per model

| model | n | correct | accuracy | CI95 low | CI95 high | rel | lat mean | lat p95 | ttft_opencode mean | out tok mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| google/gemini-flash-latest | 2 | 0 | 0.0% | 0.000 | 0.658 | 0.0% | 101961.5 | 102094 | — | 179.5 |
| meta/muse-spark-1.3 | 46 | 42 | 91.3% | 0.797 | 0.966 | 97.8% | 28103.3 | 53001 | 5753.16 | 125.24 |

> `rel` = reliability = 1 − failed attempts / attempts. `latency` includes `opencode` CLI boot; `ttft_opencode` excludes it and is the headline latency metric.


## Per category

| category | n | correct | accuracy | CI95 | latency p95 (ms) | output tok mean |
| --- | --- | --- | --- | --- | --- | --- |
| abstention_hallucination | 3 | 3 | 100.0% | [0.439, 1.000] | 30754 | 33 |
| code | 4 | 4 | 100.0% | [0.510, 1.000] | 35705 | 115.25 |
| format_control | 4 | 2 | 50.0% | [0.150, 0.850] | 32472 | 63.5 |
| function_calling | 4 | 4 | 100.0% | [0.510, 1.000] | 28754 | 46.75 |
| instruction_following | 7 | 7 | 100.0% | [0.646, 1.000] | 36723 | 38.14 |
| long_context | 5 | 4 | 80.0% | [0.376, 0.964] | 74728 | 498.8 |
| multilingual | 8 | 7 | 87.5% | [0.529, 0.978] | 57214 | 94 |
| reasoning | 10 | 8 | 80.0% | [0.490, 0.943] | 102094 | 157 |
| robustness | 3 | 3 | 100.0% | [0.439, 1.000] | 23300 | 12 |

## Per model × category

| model :: category | n | correct | accuracy | CI95 |
| --- | --- | --- | --- | --- |
| google/gemini-flash-latest :: reasoning | 2 | 0 | 0.0% | [0.000, 0.658] |
| meta/muse-spark-1.3 :: abstention_hallucination | 3 | 3 | 100.0% | [0.439, 1.000] |
| meta/muse-spark-1.3 :: code | 4 | 4 | 100.0% | [0.510, 1.000] |
| meta/muse-spark-1.3 :: format_control | 4 | 2 | 50.0% | [0.150, 0.850] |
| meta/muse-spark-1.3 :: function_calling | 4 | 4 | 100.0% | [0.510, 1.000] |
| meta/muse-spark-1.3 :: instruction_following | 7 | 7 | 100.0% | [0.646, 1.000] |
| meta/muse-spark-1.3 :: long_context | 5 | 4 | 80.0% | [0.376, 0.964] |
| meta/muse-spark-1.3 :: multilingual | 8 | 7 | 87.5% | [0.529, 0.978] |
| meta/muse-spark-1.3 :: reasoning | 8 | 8 | 100.0% | [0.676, 1.000] |
| meta/muse-spark-1.3 :: robustness | 3 | 3 | 100.0% | [0.439, 1.000] |

## Per scorer

| scorer | n | correct | accuracy |
| --- | --- | --- | --- |
| contains | 2 | 2 | 100.0% |
| exact_match | 13 | 12 | 92.3% |
| json_schema | 8 | 6 | 75.0% |
| multi_all_of | 1 | 1 | 100.0% |
| numeric | 17 | 14 | 82.3% |
| regex | 7 | 7 | 100.0% |

## Failures

| kind | count |
| --- | --- |
| empty_answer | 1 |
| error_event | 2 |

## Diagnostics

| diagnostic | value |
| --- | --- |
| runs with tool calls (prompt pollution risk) | 10 |
| runs with stripped banner lines | 0 |
| runs with malformed JSON lines | 0 |
| runs with empty answer | 3 |
| child peak RSS mean / max (KB) | 552334.58 / 594688 |

## Problems (6)

| run_id | model | item | cat | failure | detail | answer preview |
| --- | --- | --- | --- | --- | --- | --- |
| 1acedf5203fdbfc1 | google/gemini-flash-latest | rsn-modpow-01 | reasoning | error_event | numeric: no number in answer "" |  |
| 6da06dd5c6bbbe52 | google/gemini-flash-latest | rsn-modpow-02 | reasoning | error_event | numeric: no number in answer "" |  |
| 29a0c1e4ebd0966a | meta/muse-spark-1.3 | fmt-flat-01 | format_control | wrong-answer | json_schema: $.warmest_condition: "clear" not in enum ["windy"] | {"station": "ridge-top", "readings_c": [-1, 4, 22], "mean_c" |
| 0adfb25f1f73c0dc | meta/muse-spark-1.3 | fmt-nested-02 | format_control | wrong-answer | json_schema: $.survey.id: "S240" not in enum ["S-240"] | {"survey":{"id":"S240","region":"coast","scored":{"raw":80," |
| 5e7db37ebb7cfbc7 | meta/muse-spark-1.3 | ml-chain-ja | multilingual | wrong-answer | numeric 23359 != 23854 (\|d\|=495, absTol=0, relTol=0) | 23359 |
| 80cf9322ce58c54b | meta/muse-spark-1.3 | lc-needle-01 | long_context | empty_answer | normalized: "" != "2080" |  |

## Method notes

- Accuracy counts only runs that produced a non-empty answer **and** were scored; transport failures are excluded from the denominator and reported separately as reliability.
- CI is a Wilson score interval (95%, z = 1.959964), which stays inside [0,1] at p = 0/1 and small n.
- `latency_ms` is spawn→process exit. `ttft_spawn_ms` is spawn→first answer byte (**includes** CLI boot). `ttft_opencode_ms` is first `step_start`→first text part on opencode's own clock (**excludes** boot, not chunk-quantised) — the headline metric. `ttft_model_ms` is the same span measured by stream arrival and **is** chunk-quantised, so it can read ~0. `generation_ms` is opencode's own generation window for the first text part.
- No metric here is a true time-to-first-token: `opencode run` emits one whole-text part with no token deltas, so these bound the true first-token time from above.
- `output_tokens` comes from the `step_finish` usage counters when `token_source=usage`; otherwise it is the `ceil(chars/4)` proxy, which under-counts code and over-counts Hangul/CJK.
- Transport failures are retried with full-jitter backoff. A run that produced an answer is **never** retried, so a wrong answer is never rerolled into a right one.

