# FINDINGS

압축한 결과 표다. 서술과 각 숫자 뒤의 논리, 그리고 "우리가 틀린 것" 자료는
[`README.md`](README.md)에 있고, 위협은 [`LIMITATIONS.md`](LIMITATIONS.md)에 있다.

아래 모든 표는 태그되어 있다. **`measured`** = 우리가 직접 돌렸다. **`reported`** = `first-party`
출처에서 읽었다. URL은 `data/C1-sources.md`. **`derived`** = 그들로부터 계산했다. 기계 판독 가능:
`data/matching.json`(`measured`/`derived`), `data/frontier-scores.json`(`reported`).

---

## 1. subject 결론 — `opencode/space-bunny-free`

문항 88개 × 2회 반복 = **176회 실행**, 전부 `measured`.

| 분모 | n | 정답 | 정확도 | Wilson 95% | 반폭 |
|---|---|---|---|---|---|
| `raw` (하네스 그대로) | 176 | 153 | 86.93% | [81.15, 91.15] | 0.0499 |
| `conservative` | 174 | 161 | **92.53%** | [87.64, 95.58] | 0.0397 |
| `full` | 170 | 161 | **94.71%** | [90.25, 97.19] | 0.0347 |

출처: `data/matching.json` → `subject_profile.run_level`. 서술:
`reports/B3-qc-audit.md`, `reports/C2-matching-analysis.md` §1.1.

### 범주별 (심사 후, full) — `measured`

| 범주 | 정답/n | 정확도 | Wilson 95% | 하네스 원시 | 아티팩트 flip |
|---|---|---|---|---|---|
| reasoning | 30/30 | 100% | [88.65, 100] | 100% | 0 |
| function_calling | 16/16 | 100% | [80.64, 100] | 100% | 0 |
| long_context | 14/14 | 100% | [78.47, 100] | 87.5% | 0 |
| format_control | 12/12 | 100% | [75.75, 100] | 75% | 0 |
| robustness | 12/12 | 100% | [75.75, 100] | 100% | 0 |
| abstention_hallucination | 12/12 | 100% | [75.75, 100] | **50%** | **6** |
| instruction_following | 27/28 | 96.43% | [82.29, 99.37] | 96.43% | 0 |
| multilingual | 25/30 | 83.33% | [66.44, 92.66] | 76.67% | 2 |
| code | 13/16 | 81.25% | [56.99, 93.41] | 81.25% | 0 |

**어떤 범주 순위도 지지 가능하다고 할 수 없다.** Wilson 반폭이 0.10–0.31이다. 100%-대-81% 간격은
18.75 pp인데, 이는 한 범주 안의 표본오차보다 작다.

## 2. 신뢰도와 미측정 쌍 — `measured`

| | 값 |
|---|---|
| 시도 | 176 |
| 실패한 시도 | 2 (둘 다 `lc-needle-08`) |
| 신뢰도(하네스가 계산한 값) | 98.9% |
| 실제로 일어난 것 | **모델은 한 번도 호출되지 않았다** — 프롬프트 180,351자 > Linux `MAX_ARG_STRLEN` 131,072 ⇒ `spawn`에서 동기적 `E2BIG` |
| 한계치를 넘는 문항 (88개 중) | **1** (2순위: 120,454) |
| 재현성 | 두 번째 독립 라운드에서 재현됨. non-retriable로 표시됐으므로 자가 치유되지 않는다 |

그 2회 실행은 분모에서 제외했다(R1). **통과 열로 옮기지 않았다.**

## 3. 앵커 — `measured`

전부 동일한 45문항 계층적 부분집합에서, **전부 subject와 같은 규칙 집합으로 심사했다.**

| | subject | `glm-5.3-flash` | `muse-spark-1.3` | `kimi-k3` | `gemini-flash-latest` |
|---|---|---|---|---|---|
| 역할 | subject | 본문 앵커 | 본문 앵커 | 부록 | 부록 |
| 원시 (first attempt) | 86.93% | 77.78% | 91.11% | 61.90% | 0% |
| 심사 후 | **94.71%** | **90.70%** | **97.67%** | **94.74%** | — |
| 심사 이동폭 | **+7.77 pp** | **+12.92 pp** | **+6.56 pp** | **+32.83 pp** | — |
| 본문에서 제외한 이유 | — | — | — | 신뢰도 실패: 28회 실행 중 9회가 텍스트 파트 없이 반환, 45문항 중 21개에만 도달 | 서비스 불가: 두 실행 모두 API 오류, 45문항 중 0개 시도 |

**심사가 앵커를 subject보다 더 크게 움직였다.** subject만 감사하는 것 — subject가 연구 대상일 때
뻔한 선택 — 은 17포인트 격차를 제조하고 "subject가 모든 앵커를 이긴다"는 거짓 결론을 만든다.

### 조건 동일 비교, 채점 가능한 공유 43문항 — `measured`

| | `glm-5.3-flash` | `muse-spark-1.3` |
|---|---|---|
| 앵커 | 90.70% (39/43), Wilson [78.40, 96.32] | 97.67% (42/43), Wilson [87.94, 99.59] |
| subject — 두 반복 모두 정답 (conservative) | 90.70% (39/43) | 90.70% (39/43) |
| subject — 2회 반복 평균 (비편향) | 95.35% (41/43) | 95.35% (41/43) |
| subject — 어느 한 반복이라도 정답 (optimistic) | 100% (43/43) | 100% (43/43) |
| **gap, 비편향 평균** | **+4.65 pp** | **−2.33 pp** |
| gap, 보수적 읽기 | 0.00 pp | −6.98 pp |
| gap, 낙관적 읽기 | +9.30 pp (p = 0.125) | +2.33 pp (p = 1.000) |
| McNemar b / c | 3 / 3 | 0 / 3 |
| **McNemar exact two-sided p** | **1.000** | **0.250** |
| vs. 7.37 pp floor | **안 — 미해결** | **안 — 미해결** |

subject의 항목 수준 정확도는 **폭 9.3 pp의 범위**다(90.70 / 95.35 / 100). 그것은 **두 앵커 간 차이
6.98 pp보다 넓다.** 평균을 보고하는 것은 그것이 유일하게 방어 가능한 수치여서가 아니라 비편향
추량자여서다.

## 4. 재현성 floor — `measured`

| | 두 반복 모두 있는 항목 | 일치 | 비율 | 불일치 | b | c | q | exact McNemar p |
|---|---|---|---|---|---|---|---|---|
| 원시 판정 | 88 | 83 | 94.32% | 5 | 3 | 2 | 0.0568 | 1.000 |
| **심사 후** | **85** | **80** | **94.12%** | **5** | **3** | **2** | **0.0588** | **1.000** |

불일치 문항(심사 후): `cod-anagram`, `ifr-words-6`, `ml-sum-zh`(오답→정답);
`ml-chain-ja`, `ml-reverse_sub-ja`(정답→오답).

| 설계 | α | 검정력 | 최소 검출 가능 효과 |
|---|---|---|---|
| 짝대응 (McNemar), 항목당 1회 | .05 | .80 | **7.3701 pp** |
| 짝대응, 2회 평균 | .05 | .80 | **5.2114 pp** |

사전등록 표본크기 공식은 q = 0.20을 가정했다. **실측** q = 0.0588은 그보다 3.4× 작으므로 floor는
비관적 추측보다 낫다 — 말할 가치가 있다. 비관적 숫자는 추측이었고 이 숫자는 측정이기 때문이다.
`q`는 불일치 문항 5개에 얹혀 있으니 floor를 **7.4 pp ± ~1 pp**로 읽어라.

**결과: 5 pp 주장은 애초에 불가능했다. 선언 효과 규칙은 ≥ 10 pp에서 성립한다.** 그리고 floor는
*우리 하네스의* 것이지 영역 전체의 것이 아니다. 동일 모델이 동일 벤치마크에서 스캐폴드만 바꿔도
4.24–43.64 pp 스윙한다(§5). 이 floor의 최대 약 6×다.

## 5. 프런티어 표의 스캐폴드 민감도 — `reported`

동일 모델, 동일 벤치마크, **오직 하네스나 사고 모드만 바뀐 경우**. 모든 행은 그 행이 명시한
`first-party` 표에서 읽었다. 출처: `reports/C1-frontier-scores.md` §3.

| 벤치마크 | 출처 | 모델 | 구성 A | 구성 B | Δ |
|---|---|---|---|---|---|
| GAIA | HAL (Princeton) | Claude Sonnet 4.5 | HAL generalist **74.55%** | HF Open Deep Research **30.91%** | **+43.64 pp** |
| GAIA | HAL (Princeton) | Claude 3.7 Sonnet | HAL 56.36% | HF-ODR 36.97% | +19.39 pp |
| GAIA | HAL (Princeton) | Claude Opus 4 (May 2025) | HAL 64.85% | HF-ODR 57.58% | +7.27 pp |
| GAIA | HAL (Princeton) | **GPT-5 Medium** | HF-ODR **62.80%** | HAL 59.39% | **−3.41 pp** |
| GAIA | HAL (Princeton) | Claude Opus 4.1 | High 68.48% | unspecified 64.24% | +4.24 pp |
| BFCL V4 | Berkeley | GPT-5.2-2025-12-11 | native FC 55.87% | text-prompt 45.27% | +10.60 pp |
| BFCL V4 | Berkeley | Grok-4-1-fast | reasoning 69.57% | non-reasoning 58.29% | +11.28 pp |
| BFCL V4 | Berkeley | **Gemini-3-Pro-Preview** | native FC 68.14% | text-prompt **72.51%** | **−4.37 pp** |
| HLE | Epoch AI | gpt-5.1 | `thinking` 23.68% | `instant` 6.80% | +16.88 pp |
| HLE | Epoch AI | claude-opus-4-6 | `thinking-max` 34.44% | `Non-Thinking` 19.00% | +15.44 pp |
| GPQA Diamond | Epoch AI | gpt-5.6-luna | best effort 91.6% | lowest effort 63.6% | +28.0 pp |
| GPQA Diamond | Epoch AI | gpt-5.4-2026-03-05 | xhigh 93.3% | none 74.7% | +18.6 pp |

**스윙은 상수가 아니다**(−4.37에서 +43.64 pp) **그리고 부호가 뒤집힌다.** 상수 보정 계수는 존재하지
않는다. 프런티어 숫자가 식별하는 것은 모델이 아니라 `(모델 × 스캐폴드 × 추론 예산 × 툴 접근)`이다.

## 6. 프런티어 매칭 — 답 — `derived`

커버리지: reported 셀 1,711개 → 모델 키 240개 → **≥2축 119 · ≥3축 58 · ≥4축 6 · ≥5축 0.**

**구조적 floor.** k점 순열검정에는 k!개의 순열이 있으므로 도달 가능한 최소 양측 p는 `2/k!`이다:

| k | 최소 도달 가능 p | α = .05에 닿는가? |
|---|---|---|
| 3 | 0.3333 | 아니오 |
| **4** | **0.0833** | **아니오 — 어떤 n에도, 어떤 데이터 품질에도** |
| 5 | 0.0167 | 예, 그러나 5개 축을 가진 모델은 0개 |

**α = .05에서 해결가능 후보: 0.**

**구분력**(band = 0.15, abstention 축은 규약 (ii), decline = not-attempted 기준):

| 축 | subject n | subject 정확도 | Wilson 반폭 | 데이터 있는 모델 | **subject 밴드 밖** | 구분력? |
|---|---|---|---|---|---|---|
| reasoning | 15 | 1.000 | 0.102 | 114 | 26 | 예 |
| code | 8 | 0.8125 | 0.224 | 97 | 4 | 예 |
| function_calling | 8 | 1.000 | 0.162 | 25 | 8 | 예 |
| abstention | 6 | 0.500 | 0.312 | 66 | **0** | **아니오 — null 축** |

| 통계량 | 값 |
|---|---|
| ≥2축 모델(후보) | 119 |
| **완전 일치 — 유효한 모든 축에서 밴드 안** | **86** |
| **straddler — 일부 축은 밴드 안, 다른 축은 밖** | **0** |
| 전축에서 밴드 위인 subject | 2 |
| 구분력 있는 축 | 4개 중 3개 |

밴드 민감도: ±5 pp에서 완전 일치 49 / 전축 상위 23. ±10 pp에서 70 / 13. ±15 pp에서 86 / 2.
±28 pp에서 114 / 0. **어떤 밴드 폭에서도 straddler는 0이다.** "닮았다"가 필요로 하는 프로필
모양은 존재하지 않는다.

> **판정.** 이 라운드의 정밀도 안에서 subject는 실측 앵커 어느 쪽과도 **구분되지 않는다**
> (+4.65 pp, p = 1.000, −2.33 pp, p = 0.250, 둘 다 7.37 pp floor 안). 그리고 **어떤 단일 프런티어
> 모델도 지목할 수 없다.** 지지 가능한 명제는 범위다: *subject는 2025–2026 프런티어 진영의
> mid-to-upper 영역과 양립하며 그 안의 무엇도 배제하지 않는다.*

### 4축 코너는 발견이 아니라 커버리지 인공물이다

4축 모델 여섯 개가 전부 2025년식이고 두 회사 소속이다(`gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`,
`gpt-5-mini`, `claude-haiku-4-5`, `claude-sonnet-4-5`. 출시 2025-04-14~2025-10-15). 네 번째 축이
BFCL이고 **마지막 갱신이 2026-04-12**이므로 2026 플래깅십은 **약해서가 아니라 데이터 낡음
때문에** 없다. 그 코너를 "subject가 2025 중급 모델과 닮았다"로 읽는 것은 도구기가 그 코너만 볼
수 있다는 사실의 재진술일 뿐이다.

### "가장 가까운" 모델을 정렬하지 말 것

중심 거리 기준 가장 가까운 후보: `gemini-2.5-pro-preview-03-25` 6.40 pp(2축),
`qwen3.6-max-preview` 7.32 pp(2축), `deepseek-r1-0528` 7.48 pp(2축), `kimi-k3` 12.77 pp(3축),
`claude-opus-4-8` 15.14 pp(3축), `gpt-5` 15.80 pp(3축). **순위가 아니다:** 축 개수가 다르면 중심
거리는 비교할 수 없고, 상위 세 개는 우리 floor 안에 있다. 이 순서는 축 개수의 산물이다.

## 7. 레이턴스와 토큰 — `measured`

| | end-to-end 중앙값 | 순수 모델 중앙값 | pre-model 비중 |
|---|---|---|---|
| **subject** | 24,817 ms | **496 ms** | **93.33%** |
| `muse-spark-1.3` | 25,201 ms | 2,541 ms | 85.51% |
| `glm-5.3-flash` | 63,270 ms | 8,203 ms | 78.71% |
| `kimi-k3` | 78,544 ms | 2,933 ms | 98.03% |

**subject의 벽시계 시간 중 93%는 프로세스 부팅과 프로바이더 대기열이지 추론이 아니다.** end to end로
subject와 `muse-spark-1.3`는 구분되지 않는다(1.01×). 모든 TTFT 수치는 진짜 첫 토큰 시간의 **상한**이다
(`opencode run`은 토큰 델타를 내놓지 않는다).

| 카운터 | n | 중앙값 | 평균 | p95 | 최댓값 | 합계 |
|---|---|---|---|---|---|---|
| 프롬프트 토큰 | 174 | 18,539 | 20,063 | 34,129 | 57,060 | 3,491,015 |
| 추론 토큰 | 174 | 79.5 | 131.5 | 526 | 1,200 | **22,876** |
| 출력 토큰 | 176 | 3 | 15.5 | 46 | 284 | 2,728 |
| 비용 | 176 | — | — | — | — | **0** (free tier) |

`token_source = mixed|char4`: `ceil(chars/4)` 대리값은 코드를 과소 집계하고 한글/CJK를 과대 집계하므로
다국어 출력 토큰의 추정은 신뢰도가 낮다. **비용은 효율 결과가 아니라 과금 사실이다** — solved-task당 비용 지표는
0/0이 되고 "무료가 최고"로 읽힌다.

## 8. 통계적 무결성

| 검사 | 결과 | 명령 |
|---|---|---|
| 하네스 단위 테스트 | 72 pass / 1 skipped(라이브 스모크, 모델 필요) | `node --test harness/test/` |
| 문항 뱅크: 빌드 + 검증 + 바이트 비교 | 824 checks, 0 failures, exit 0 | `node harness/build-items.mjs --check` |
| 분석 통계 | **234 checks, 0 failures**, exit 0 | `node harness/stat-verify.mjs` |
| 수식 self-test | 0 failures, exit 0 | `node harness/psycho-verify.mjs` |
| 심사, strict | exit 0 | `node harness/adjudicate.mjs --strict` |
| 앵커 심사 + 176/176 self-check | PASSED, integrity 0, exit 0 | `node harness/adjudicate-anchors.mjs --strict` |

통계 스위트는 분석이 보고하는 모든 숫자를 출발 원리에서 재도출한다: abstention 세 규약, 2rep 평균과
두 gap, 실측 q에서의 floor, 4개 모델의 정정 비대칭, `2/k!`, 실제로 쓰인 모든 McNemar exact p,
`gap()`이 0을 반환하는 함정, 그리고 레이턴스 단위 오류 — 각각을 단언한다.

## 9. 프런티어 표 자체의 커버리지 — `derived`

12대 헤드라인 벤치마크 중 **5개가 실제로 2026 프런티어 커버리지를 가진다.** 나머지는 정직한 공백이다.

| 벤치마크 | 셀 | 서로 다른 모델 | 2026 프런티어? | 출처 |
|---|---|---|---|---|
| GPQA Diamond | 231 | 140 | **예** | Epoch AI |
| Terminal-Bench 4.0 | 195 | 42 | **예** | Epoch AI |
| FrontierMath | 94 | 69 | **예** | Epoch AI |
| SimpleQA Verified | 74 | 66 | **예** | Epoch AI |
| HLE | 43 | 35 | **예** | Epoch AI |
| BFCL V4 | 109 | 83 | 아니오 — 낡음 | Berkeley |
| GAIA | 32 | 12 | 아니오 — 낡음 | HAL (Princeton) |
| SWE-bench Verified | 34 | 31 | **예** | Epoch AI |
| LiveCodeBench | 22 | 22 | 아니오 — 낡음(피드가 2025-04-07에 끝남) | LiveCodeBench 공식 피드 |
| BrowseComp | 5 | 4 | 아니오 — 낡음 | OpenAI |
| **SWE-bench Multilingual** | **0** | 0 | **데이터 없음** | — |
| **τ-bench / τ²-bench** | **0** | 0 | **데이터 없음** | — |

같은 파일의 15개 벤치마크에서 추가 872셀(ARC-AGI-2 208, CritPt 152, SciCode 147, DeepSWE 69,
FrontierMath Tier 4 v2 61, MATH Level 5 55, Aider Polyglot 43, METR Time Horizon 34, APEX-Agents 33,
EBR-bench 23, OSWorld 2.0 17, FrontierSWE 13, GDPval 9, FrontierMath Erdős 5, 그리고
ARC-AGI 3 / Zapier AutomationBench / GDPval-AA v2가 각각 1). **27개 벤치마크에 걸쳐 총 1,711셀.**
확신도: **1,685 first-party 검증 · 22 검증된 출처에서 파생 · 4 상대 주장만 · 0 recalled · 0 집계기
출처.**

**의도적으로 제외한 것과 그 이유:**

- **BrowseComp의 Deep Research, 51.5%.** OpenAI 자신의 각주가 그 모델을 *"is trained on data that
  specifically teaches the model to be good at BrowseComp tasks."*라고 적고 있다. 같은 페이지의 준우위는
  9.9%다. 5.7× 비율은 오염이 설명한다. 능력이 아니다.
- **Claude Opus 5 절대 점수.** Anthropic 공식 페이지는 **모든** 벤치마크 결과를 차트 이미지로
  렌더링한다. 텍스트로 존재하는 것은 상대 주장("3×", "1.5×")뿐이다. **구멍을 메우기 위해 지어낸 것은
  없다.**
- **모든 집계기 숫자.** 서로 모순되는 모델명과 점수를 돌려주는 content-farm 리더보드는 통째로
  거부했다. 모순 다섯 건은 `data/C1-sources.md`에 열거했다.
- **LMArena / Elo.** 가져오지 않았다. **이 저장소에는 Elo 숫자가 하나도 없다.**

### 표의 교차 검증

Epoch에서 파생된 데이터가 신뢰할 만하다는 것을 뒷받침하는 가장 강력한 단일 증거: Epoch가 HLE을
독립적으로 재시행한 결과가 **GPT-5 25.32%**이고 HLE 조직 자체 표는 **25.3%**다 — 인쇄된 자릿수까지
일치한다. Gemini 3 Pro: 37.52% 대 38.3%.

### 데이터 무결성 발견 — 테스트가 아니라 감사에서

- **스케일 불일치, 잡음.** Epoch 파일 하나가 정확도를 0–100으로 저장하는데 나머지는 전부 0–1이다.
  변환하지 않았다면 Aider polyglot이 나머지 전부보다 ~100× 강한 것처럼 보여 어떤 상관도 오염시켰을
  것이다. 수정했다. 이제 내놓는 모든 행이 명시적인 `scale`을 갖는다.
- **단위 오류, 잡음.** METR Time Horizon은 확률이 아니라 **분**이다(4.0 → 1,044.8). 첫 빌드가 잘못된
  열을 읽고 단위를 잘못 붙였다. 정확도 열에 대한 상관은 무의미했어야 한다.
- **이름 우주 충돌, 잡음.** 벤더 표기가 Epoch와 다르다(`Claude-Opus-4-5-20251101` 대
  `claude-opus-4-5`). 완전일치 join으로는 툴콜 점수와 reasoning 점수를 모두 가진 모델이 4개밖에
  남지 않았다. 결정론적 정규화 규칙(문서화했고, 별칭 28건 열거, 다중 스냅샷 병합 12건 표시)을 적용해
  6개가 되었다 — **그렇지 않으면 축 커버리지가 조용히 약 십분의 일로 떨어져 데이터 공백처럼
  보였을 것이다.**
- **추측한 URL은 인용하지 않고 버렸다.** `data/C1-sources.md` §3이 실패한 탐색 14건을 모두 적어 둔다
  — 12 × 404, 1 × 403(봇 차단), 1 × 301(저장소 이동) — 그리고 **그중 어느 것도**
  `data/frontier-scores.json` 어디에도 인용되지 않았다. 단언한 모든 URL은 HTTP 200을 반환했고
  2026-09-27에 실제로 읽었다.
