# LLM benchmark — opencode/space-bunny-free

- generated: `2026-09-27T18:32:13.535Z`
- schema: `llm-bench/summary/v1`
- models measured: `opencode/space-bunny-free`
- item bank: `r2-77.json` (11 items, 1 rep)
- concurrency 2, format json, pure=true

## Overall

| metric | value |
| --- | --- |
| attempts | 88 |
| scored n | 88 |
| correct | 75 |
| accuracy | 85.2% |
| Wilson 95% CI | [0.763, 0.912] |
| failed attempts | 1 |
| reliability | 98.9% |
| latency mean / median / p95 / max (ms) | 16244.81 / 15490 / 23763 / 39714 |
| TTFT spawn mean / p95 (ms) | 16178.56 / 23498 |
| TTFT opencode mean / p95 (ms) | 1745.83 / 5474 |
| generation window mean / p95 (ms) | 67.37 / 385 |
| TTFT stream-arrival mean (chunk-quantised) | 1746.26 |
| output tokens mean / total | 18.27 / 1608 |
| token source | `mixed|char4` |
| cost total | 0 |

## Per model

| model | n | correct | accuracy | CI95 low | CI95 high | rel | lat mean | lat p95 | ttft_opencode mean | out tok mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| opencode/space-bunny-free | 88 | 75 | 85.2% | 0.763 | 0.912 | 98.9% | 16244.81 | 23763 | 1745.83 | 18.27 |

> `rel` = reliability = 1 − failed attempts / attempts. `latency` includes `opencode` CLI boot; `ttft_opencode` excludes it and is the headline latency metric.


## Per category

| category | n | correct | accuracy | CI95 | latency p95 (ms) | output tok mean |
| --- | --- | --- | --- | --- | --- | --- |
| abstention_hallucination | 6 | 3 | 50.0% | [0.188, 0.812] | 21491 | 20 |
| code | 8 | 7 | 87.5% | [0.529, 0.978] | 23763 | 32.5 |
| format_control | 8 | 6 | 75.0% | [0.409, 0.928] | 19273 | 23.13 |
| function_calling | 8 | 8 | 100.0% | [0.676, 1.000] | 15584 | 30.75 |
| instruction_following | 14 | 12 | 85.7% | [0.601, 0.960] | 29240 | 22.36 |
| long_context | 8 | 7 | 87.5% | [0.529, 0.978] | 16957 | 2.63 |
| multilingual | 15 | 11 | 73.3% | [0.480, 0.891] | 18399 | 12.07 |
| reasoning | 15 | 15 | 100.0% | [0.796, 1.000] | 39714 | 15.8 |
| robustness | 6 | 6 | 100.0% | [0.610, 1.000] | 36012 | 7.5 |

## Per model × category

| model :: category | n | correct | accuracy | CI95 |
| --- | --- | --- | --- | --- |
| opencode/space-bunny-free :: abstention_hallucination | 6 | 3 | 50.0% | [0.188, 0.812] |
| opencode/space-bunny-free :: code | 8 | 7 | 87.5% | [0.529, 0.978] |
| opencode/space-bunny-free :: format_control | 8 | 6 | 75.0% | [0.409, 0.928] |
| opencode/space-bunny-free :: function_calling | 8 | 8 | 100.0% | [0.676, 1.000] |
| opencode/space-bunny-free :: instruction_following | 14 | 12 | 85.7% | [0.601, 0.960] |
| opencode/space-bunny-free :: long_context | 8 | 7 | 87.5% | [0.529, 0.978] |
| opencode/space-bunny-free :: multilingual | 15 | 11 | 73.3% | [0.480, 0.891] |
| opencode/space-bunny-free :: reasoning | 15 | 15 | 100.0% | [0.796, 1.000] |
| opencode/space-bunny-free :: robustness | 6 | 6 | 100.0% | [0.610, 1.000] |

## Per scorer

| scorer | n | correct | accuracy |
| --- | --- | --- | --- |
| contains | 3 | 3 | 100.0% |
| exact_match | 20 | 18 | 90.0% |
| json_schema | 16 | 14 | 87.5% |
| multi_all_of | 1 | 1 | 100.0% |
| numeric | 32 | 28 | 87.5% |
| regex | 16 | 11 | 68.8% |

## Failures

| kind | count |
| --- | --- |
| harness | 1 |

## Diagnostics

| diagnostic | value |
| --- | --- |
| runs with tool calls (prompt pollution risk) | 5 |
| runs with stripped banner lines | 0 |
| runs with malformed JSON lines | 0 |
| runs with empty answer | 1 |
| child peak RSS mean / max (KB) | 560179.13 / 574972 |

## Problems (13)

| run_id | model | item | cat | failure | detail | answer preview |
| --- | --- | --- | --- | --- | --- | --- |
| acef8c17f9055ccf | opencode/space-bunny-free | cod-rle | code | wrong-answer | normalized: "b1e1f1a1c4e1d4e1d2c1" != "b1e1f1a1c3e1d4e1d2c1" | b1e1f1a1c4e1d4e1d2c1 |
| 8fc861d462e272cc | opencode/space-bunny-free | ifr-words-6 | instruction_following | wrong-answer | regex no match: /^\s*(?:\S+\s+){5}\S+\s*$/ | Warm golden hue between yellow and orange |
| 589e80987cd51996 | opencode/space-bunny-free | ifr-words-5 | instruction_following | wrong-answer | regex no match: /^\s*(?:\S+\s+){4}\S+\s*$/ | Calm, deep, endless sky. |
| 69daff915f826e32 | opencode/space-bunny-free | fmt-nested-02 | format_control | wrong-answer | json_schema: $.survey.id: "S240" not in enum ["S-240"] | {"survey":{"id":"S240","region":"coast","scored":{"raw":80," |
| a1537395cd5bf653 | opencode/space-bunny-free | fmt-flat-01 | format_control | wrong-answer | json_schema: $.warmest_condition: "clear" not in enum ["windy"] | {"station":"ridge-top","readings_c":[-1,4,22],"mean_c":8.3," |
| 30df5242f62248df | opencode/space-bunny-free | ml-sum-ja | multilingual | wrong-answer | numeric 7016 != 25498 (\|d\|=1.85e+4, absTol=0, relTol=0) | 기억 확인: 관련 기록 없음  7016 + 453 + 9432 + 8172 + 425 = 29498 |
| ff5c55f55c001edb | opencode/space-bunny-free | ml-chain-ja | multilingual | wrong-answer | numeric 71 != 23854 (\|d\|=2.38e+4, absTol=0, relTol=0) | 71 × 7 = 497 497 × 47 = 23359 23359 − 376 = 22983 22983 + 87 |
| c57b03e3a25db504 | opencode/space-bunny-free | ml-chain-zh | multilingual | wrong-answer | numeric 59 != 44694 (\|d\|=4.46e+4, absTol=0, relTol=0) | 59 × 21 × 36 = 1239 × 36 = 44604 44604 − 784 + 874 = 44694   |
| f092df850dbf3df5 | opencode/space-bunny-free | ml-reverse_sub-ja | multilingual | wrong-answer | numeric 87832 != 33957 (\|d\|=5.39e+4, absTol=0, relTol=0) | 87832 |
| 64663944f481cf8b | opencode/space-bunny-free | lc-needle-08 | long_context | harness | normalized: "" != "7542" |  |
| 0ae0dde24b6d57a5 | opencode/space-bunny-free | abs-noans-01 | abstention_hallucination | wrong-answer | regex no match: /^(?![\s\S]*\d)[\s\S]*(?:(do(?:es)?\s+not\s+(?:say\|state\|mention\|specif | The passage doesn't say. It only states that a new bench was |
| f5d50efafec1dff2 | opencode/space-bunny-free | abs-noans-02 | abstention_hallucination | wrong-answer | regex no match: /^(?![\s\S]*\d)[\s\S]*(?:(do(?:es)?\s+not\s+(?:say\|state\|mention\|specif | Cannot be determined — the passage never states attendance.  |
| 5ac1375a7cc900c0 | opencode/space-bunny-free | abs-noans-03 | abstention_hallucination | wrong-answer | regex no match: /^(?![\s\S]*\d)[\s\S]*(?:(do(?:es)?\s+not\s+(?:say\|state\|mention\|specif | The passage doesn't say. It only records that the blue door  |

## Method notes

- Accuracy counts only runs that produced a non-empty answer **and** were scored; transport failures are excluded from the denominator and reported separately as reliability.
- CI is a Wilson score interval (95%, z = 1.959964), which stays inside [0,1] at p = 0/1 and small n.
- `latency_ms` is spawn→process exit. `ttft_spawn_ms` is spawn→first answer byte (**includes** CLI boot). `ttft_opencode_ms` is first `step_start`→first text part on opencode's own clock (**excludes** boot, not chunk-quantised) — the headline metric. `ttft_model_ms` is the same span measured by stream arrival and **is** chunk-quantised, so it can read ~0. `generation_ms` is opencode's own generation window for the first text part.
- No metric here is a true time-to-first-token: `opencode run` emits one whole-text part with no token deltas, so these bound the true first-token time from above.
- `output_tokens` comes from the `step_finish` usage counters when `token_source=usage`; otherwise it is the `ceil(chars/4)` proxy, which under-counts code and over-counts Hangul/CJK.
- Transport failures are retried with full-jitter backoff. A run that produced an answer is **never** retried, so a wrong answer is never rerolled into a right one.

