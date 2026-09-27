# LLM benchmark — opencode/space-bunny-free

- generated: `2026-09-27T14:08:40.495Z`
- schema: `llm-bench/summary/v1`
- models measured: `opencode/space-bunny-free`
- item bank: `items.json` (88 items, 2 rep)
- concurrency 2, format json, pure=true

## Overall

| metric | value |
| --- | --- |
| attempts | 176 |
| scored n | 176 |
| correct | 153 |
| accuracy | 86.9% |
| Wilson 95% CI | [0.811, 0.911] |
| failed attempts | 2 |
| reliability | 98.9% |
| latency mean / median / p95 / max (ms) | 24111.68 / 24702 / 31402 / 44410 |
| TTFT spawn mean / p95 (ms) | 23802.18 / 30959 |
| TTFT opencode mean / p95 (ms) | 1163.71 / 4225 |
| generation window mean / p95 (ms) | 104.03 / 321 |
| TTFT stream-arrival mean (chunk-quantised) | 1164.46 |
| output tokens mean / total | 15.5 / 2728 |
| token source | `mixed|char4` |
| cost total | 0 |

## Per model

| model | n | correct | accuracy | CI95 low | CI95 high | rel | lat mean | lat p95 | ttft_opencode mean | out tok mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| opencode/space-bunny-free | 176 | 153 | 86.9% | 0.811 | 0.911 | 98.9% | 24111.68 | 31402 | 1163.71 | 15.5 |

> `rel` = reliability = 1 − failed attempts / attempts. `latency` includes `opencode` CLI boot; `ttft_opencode` excludes it and is the headline latency metric.


## Per category

| category | n | correct | accuracy | CI95 | latency p95 (ms) | output tok mean |
| --- | --- | --- | --- | --- | --- | --- |
| abstention_hallucination | 12 | 6 | 50.0% | [0.254, 0.746] | 31012 | 24.25 |
| code | 16 | 13 | 81.3% | [0.570, 0.934] | 44410 | 40.88 |
| format_control | 16 | 12 | 75.0% | [0.505, 0.898] | 32418 | 23.19 |
| function_calling | 16 | 16 | 100.0% | [0.806, 1.000] | 33394 | 30.63 |
| instruction_following | 28 | 27 | 96.4% | [0.823, 0.994] | 29124 | 21.96 |
| long_context | 16 | 14 | 87.5% | [0.640, 0.965] | 32912 | 2.63 |
| multilingual | 30 | 23 | 76.7% | [0.591, 0.882] | 30561 | 4.77 |
| reasoning | 30 | 30 | 100.0% | [0.886, 1.000] | 28526 | 1.47 |
| robustness | 12 | 12 | 100.0% | [0.757, 1.000] | 30610 | 6.5 |

## Per model × category

| model :: category | n | correct | accuracy | CI95 |
| --- | --- | --- | --- | --- |
| opencode/space-bunny-free :: abstention_hallucination | 12 | 6 | 50.0% | [0.254, 0.746] |
| opencode/space-bunny-free :: code | 16 | 13 | 81.3% | [0.570, 0.934] |
| opencode/space-bunny-free :: format_control | 16 | 12 | 75.0% | [0.505, 0.898] |
| opencode/space-bunny-free :: function_calling | 16 | 16 | 100.0% | [0.806, 1.000] |
| opencode/space-bunny-free :: instruction_following | 28 | 27 | 96.4% | [0.823, 0.994] |
| opencode/space-bunny-free :: long_context | 16 | 14 | 87.5% | [0.640, 0.965] |
| opencode/space-bunny-free :: multilingual | 30 | 23 | 76.7% | [0.591, 0.882] |
| opencode/space-bunny-free :: reasoning | 30 | 30 | 100.0% | [0.886, 1.000] |
| opencode/space-bunny-free :: robustness | 12 | 12 | 100.0% | [0.757, 1.000] |

## Per scorer

| scorer | n | correct | accuracy |
| --- | --- | --- | --- |
| contains | 6 | 6 | 100.0% |
| exact_match | 40 | 35 | 87.5% |
| json_schema | 32 | 28 | 87.5% |
| multi_all_of | 2 | 2 | 100.0% |
| numeric | 64 | 57 | 89.1% |
| regex | 32 | 25 | 78.1% |

## Failures

| kind | count |
| --- | --- |
| harness | 2 |

## Diagnostics

| diagnostic | value |
| --- | --- |
| runs with tool calls (prompt pollution risk) | 5 |
| runs with stripped banner lines | 0 |
| runs with malformed JSON lines | 0 |
| runs with empty answer | 2 |
| child peak RSS mean / max (KB) | 546162.02 / 590160 |

## Problems (23)

| run_id | model | item | cat | failure | detail | answer preview |
| --- | --- | --- | --- | --- | --- | --- |
| f1684cfabd7d8d92 | opencode/space-bunny-free | cod-anagram | code | wrong-answer | normalized: "true" != "false" | true |
| acef8c17f9055ccf | opencode/space-bunny-free | cod-rle | code | wrong-answer | normalized: "b1e1f1a1c4e1d4e1d2c1" != "b1e1f1a1c3e1d4e1d2c1" | b1e1f1a1c4e1d4e1d2c1 |
| b4fb6758ab0b9d0f | opencode/space-bunny-free | cod-rle | code | wrong-answer | normalized: "b1e1f1a1c4e1d4e1d2c1" != "b1e1f1a1c3e1d4e1d2c1" | b1e1f1a1c4e1d4e1d2c1 |
| 8fc861d462e272cc | opencode/space-bunny-free | ifr-words-6 | instruction_following | wrong-answer | regex no match: /^\s*(?:\S+\s+){5}\S+\s*$/ | Warm golden hue between honey and orange |
| a1537395cd5bf653 | opencode/space-bunny-free | fmt-flat-01 | format_control | wrong-answer | json_schema: $.warmest_condition: "clear" not in enum ["windy"] | {"station":"ridge-top","readings_c":[-1,4,22],"mean_c":8.3," |
| 82ba528aa05cb2ea | opencode/space-bunny-free | fmt-flat-01 | format_control | wrong-answer | json_schema: $.warmest_condition: "clear" not in enum ["windy"] | {"station":"ridge-top","readings_c":[-1,4,22],"mean_c":8.3," |
| 69daff915f826e32 | opencode/space-bunny-free | fmt-nested-02 | format_control | wrong-answer | json_schema: $.survey.id: "S240" not in enum ["S-240"] | {"survey":{"id":"S240","region":"coast","scored":{"raw":80," |
| 668640661a5437ca | opencode/space-bunny-free | fmt-nested-02 | format_control | wrong-answer | json_schema: $.survey.id: "S240" not in enum ["S-240"] | {"survey":{"id":"S240","region":"coast","scored":{"raw":80," |
| 1463f4a81e0904cf | opencode/space-bunny-free | ml-sum-zh | multilingual | wrong-answer | numeric 37133 != 32633 (\|d\|=4.50e+3, absTol=0, relTol=0) | 37133 |
| ff5c55f55c001edb | opencode/space-bunny-free | ml-chain-ja | multilingual | wrong-answer | numeric 71 != 23854 (\|d\|=2.38e+4, absTol=0, relTol=0) | 71 × 7 × 47 = 23359 23359 − 376 = 22983 22983 + 871 = 23854  |
| d89f756e99bb87ef | opencode/space-bunny-free | ml-chain-ja | multilingual | wrong-answer | numeric 71 != 23854 (\|d\|=2.38e+4, absTol=0, relTol=0) | 71 × 7 × 47 = 23359 |
| 191d5feca99a95ac | opencode/space-bunny-free | ml-chain-zh | multilingual | wrong-answer | numeric 44604 != 44694 (\|d\|=90.0, absTol=0, relTol=0) | 44604 44694 |
| 467015d5ddb40d32 | opencode/space-bunny-free | ml-reverse_sub-ko | multilingual | wrong-answer | numeric 578124 != 579114 (\|d\|=990, absTol=0, relTol=0) | 578124 |
| 58a4ee8c845529e7 | opencode/space-bunny-free | ml-reverse_sub-ko | multilingual | wrong-answer | numeric 578124 != 579114 (\|d\|=990, absTol=0, relTol=0) | 578124 |
| c04cc3076d6ee228 | opencode/space-bunny-free | ml-reverse_sub-ja | multilingual | wrong-answer | numeric 87832 != 33957 (\|d\|=5.39e+4, absTol=0, relTol=0) | 87832 |
| 64663944f481cf8b | opencode/space-bunny-free | lc-needle-08 | long_context | harness | normalized: "" != "7542" |  |
| 33db1c0c77aed2e7 | opencode/space-bunny-free | lc-needle-08 | long_context | harness | normalized: "" != "7542" |  |
| 0ae0dde24b6d57a5 | opencode/space-bunny-free | abs-noans-01 | abstention_hallucination | wrong-answer | regex no match: /^(?![\s\S]*\d)[\s\S]*(?:(do(?:es)?\s+not\s+(?:say\|state\|mention\|specif | The passage doesn't say. It only records that a new bench wa |
| f599ab7701dcc666 | opencode/space-bunny-free | abs-noans-01 | abstention_hallucination | wrong-answer | regex no match: /^(?![\s\S]*\d)[\s\S]*(?:(do(?:es)?\s+not\s+(?:say\|state\|mention\|specif | The passage doesn't state any cost for the bench — it only g |
| f5d50efafec1dff2 | opencode/space-bunny-free | abs-noans-02 | abstention_hallucination | wrong-answer | regex no match: /^(?![\s\S]*\d)[\s\S]*(?:(do(?:es)?\s+not\s+(?:say\|state\|mention\|specif | The passage doesn't state that. It gives four dates (3 April |
| e690184a3c50f0bb | opencode/space-bunny-free | abs-noans-02 | abstention_hallucination | wrong-answer | regex no match: /^(?![\s\S]*\d)[\s\S]*(?:(do(?:es)?\s+not\s+(?:say\|state\|mention\|specif | 기억 확인: 관련 기록 없음(이번 세션 도구로 `memory_search` 미제공)  The passage  |
| 5ac1375a7cc900c0 | opencode/space-bunny-free | abs-noans-03 | abstention_hallucination | wrong-answer | regex no match: /^(?![\s\S]*\d)[\s\S]*(?:(do(?:es)?\s+not\s+(?:say\|state\|mention\|specif | The passage doesn't name a company — it only gives dates (8  |
| 3d2277e1e6c25c07 | opencode/space-bunny-free | abs-noans-03 | abstention_hallucination | wrong-answer | regex no match: /^(?![\s\S]*\d)[\s\S]*(?:(do(?:es)?\s+not\s+(?:say\|state\|mention\|specif | The passage doesn't say. It states only the date the blue do |

## Method notes

- Accuracy counts only runs that produced a non-empty answer **and** were scored; transport failures are excluded from the denominator and reported separately as reliability.
- CI is a Wilson score interval (95%, z = 1.959964), which stays inside [0,1] at p = 0/1 and small n.
- `latency_ms` is spawn→process exit. `ttft_spawn_ms` is spawn→first answer byte (**includes** CLI boot). `ttft_opencode_ms` is first `step_start`→first text part on opencode's own clock (**excludes** boot, not chunk-quantised) — the headline metric. `ttft_model_ms` is the same span measured by stream arrival and **is** chunk-quantised, so it can read ~0. `generation_ms` is opencode's own generation window for the first text part.
- No metric here is a true time-to-first-token: `opencode run` emits one whole-text part with no token deltas, so these bound the true first-token time from above.
- `output_tokens` comes from the `step_finish` usage counters when `token_source=usage`; otherwise it is the `ceil(chars/4)` proxy, which under-counts code and over-counts Hangul/CJK.
- Transport failures are retried with full-jitter backoff. A run that produced an answer is **never** retried, so a wrong answer is never rerolled into a right one.

