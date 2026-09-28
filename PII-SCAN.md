# PII 정소 기록

이 저장소는 공개 릴리스를 위해 조립됐다. 운영자의 개인 식별자는 게시 전에 제거했다. 이 파일은 무엇을
제거했는지, 무엇을 의도적으로 남겼는지, 그리고 스캔을 어떻게 다시 돌리는지 기록한다.

## 제거한 것

| 분류 | 처리 |
|---|---|
| 파일 *내용*에 나타나는 운영자 GitHub 사용자 이름 | 치환했다. 이 프로젝트의 저장소 URL에만 나타나는데, 그건 내용 식별자가 아니라 게시 대상이다. |
| 운영자의 로컬 파일시스템 경로(`/home/node/...`, `/workspace/...`, agent-memory / opencode-memory 캐시 경로) | `$HOME/...`와 `<workdir>/...` 같은 일반 플레이스홀더로 치환했다. |
| API 키, 토큰, 시크릿 | 존재하지 않는다. 게시에 쓴 *환경*에는 GitHub 토큰이 있었지만 어떤 파일에도 쓰인 적 없다. 산문에서는 "환경에 있을 뿐 이 저장소에는 없다"로만 언급한다. |
| 이메일 주소 | 찾은 주소는 `agibenchmark@safe.ai` 하나뿐인데, AGIBenchmark / SafeBench 문헌에 공개된 **공개 벤치마크 연락처 주소**다. 인용된 내용이지 개인정보가 아니라 남겼다. |
| 기계 호스트네임 | 없다. |
| 캡처한 서브프로세스 출력 | 원본 stdout/stderr 아티팩트 파일 909개를 전부 스캔했고, 운영자 경로나 식별자가 들어 있는 것은 하나도 없었다. |

## 의도적으로 남긴 것

모델 이름, 벤치마크 이름, 벤더 이름, 공개 URL, 그리고 모든 연구 내용. 이것들이 작업의 실체다.
`reported` 점수는 독자가 가서 출처 URL을 확인할 수 있을 때만 쓸모가 있으므로, URL은 인용 장치의
일부이지 개인정보가 아니다.

## 스캔 다시 돌리기

저장소 루트에서:

```sh
# 1. operator username in file contents
grep -rIl "tak2-08" . | grep -v '^./CITATION.cff$' | grep -v '^./README.md$'

# 2. operator-local paths
grep -rIlE "/home/node|/workspace/|agent-memory|opencode-memory|\.cache/opencode" .

# 3. secrets
grep -rIoE "gho_[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{20,}" .

# 4. email addresses (expect only the public benchmark address)
grep -rIoE "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}" . | sort -u
```

게시 시점 기준 기대 결과: (1) 두 프로젝트 URL 참조 밖에서는 출력 없음, (2) 출력 없음, (3) 출력 없음,
(4) 정확히 한 줄 — `data/benchmarks.json:agibenchmark@safe.ai`.

## 저장소가 정소할 수 없는 것

GitHub 계정으로 게시하면 그 계정의 공개 핸들이 저장소 URL과 커밋 메타데이터를 통해 반드시 드러난다.
이는 요청된 행위에 내재하는 것이지 내용 안의 개인정보와는 별개다. 그래서 이 저장소의 커밋 정체성은
첫 커밋 전에 비개인 값으로 설정했다:

```sh
git config user.name  "LLM Benchmark Federation"
git config user.email "noreply@users.noreply.github.com"
```

## 라운드 2 부록

라운드 2 산출물은 위의 같은 네 명령으로 스캔했고 **첫 패스에서 깨끗하지 않았다.** 캡처한 서브프로세스
출력 하나(`reports/round2/subject-88/artifacts/569c3b6b75501e35.stdout.txt`)에 운영자 로컬 경로
조각이 들어 있었다. 주어 모델이 — 격리된 줄 알았던 실행 중에 — 운영자의 메모리 저장소 디렉터리를 건드린
`bash` 호출을 냈기 때문이다. ROUND2.md §6 참고.

그 시점에 라운드 2는 아직 게시되지 않았으므로 `harness/redact-paths.mjs`가 최초 게시 전에 그 경로 조각을
마스킹했다. 이 스크립트는 운영자 로컬 경로 조각만 치환한다. 측정값·답·판정, 어떤 `.json`/`.jsonl`
결과 파일도 **건드리지 않는다.** 그래서 보고서의 모든 숫자는 수정되지 않은 파일에서 그대로 도출된다.
무엇이 바뀌었는지 매니페스트는 `data/redaction-manifest.json`이다.

라운드 1의 로그는 바이트 단위로 그대로 뒀다. 그 무결성이 라운드 1 감사의 근거이고, 스캔 결과도
깨끗했기 때문이다. 따라서 이 스캔은 설계상 비대칭이며 그 비대칭은 실수가 아니라 의도다.

이제 스캔 명령이 파일 하나를 더 제외해야 한다. `harness/redact-paths.mjs`가 자신이 다시 쓰는 패턴을
담고 있어서, 그대로 돌리면 스스로를 잡아낸다:

```sh
grep -rIlE "$NEEDLE_HOME|$NEEDLE_MEM" . \
  | grep -vE '^\./(PII-SCAN\.md|scripts/verify\.sh|harness/redact-paths\.mjs)$'
```

`scripts/verify.sh`가 정확히 이 제외를 수행하므로, 그것을 돌리는 것이 권위 있는 검사다.
