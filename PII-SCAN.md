# PII scrub record

This repository was assembled for public release. The operator's personal
identifiers were removed before publication. This file records what was removed,
what was deliberately kept, and how to re-run the scan.

## What was removed

| Category | Handling |
|---|---|
| Operator GitHub username appearing in file *contents* | Replaced. It appears only in the repository URL of this project, which is a publication target, not a content identifier. |
| Local filesystem paths belonging to the operator (`/home/node/...`, `/workspace/...`, agent-memory / opencode-memory cache paths) | Replaced with generic placeholders such as `$HOME/...` and `<workdir>/...`. |
| API keys, tokens, secrets | None are present. A GitHub token was present in the *environment* used to publish; it was never written into any file. Referenced in prose only as "present in the environment, not in this repo". |
| Email addresses | The only address found is `agibenchmark@safe.ai`, which is a **public benchmark contact address** published in the AGIBenchmark / SafeBench literature. It is cited content, not personal data, and was kept. |
| Machine hostname | Not present. |
| Captured subprocess output | All 909 raw stdout/stderr artifact files were scanned; zero contained operator paths or identifiers. |

## What was deliberately kept

Model names, benchmark names, vendor names, public URLs, and all research
content. These are the substance of the work. `reported` scores are only
useful if the reader can go and check the source URL, so URLs are part of the
citation apparatus, not personal data.

## Re-running the scan

From the repository root:

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

Expected result at time of publication: (1) no output outside the two project
URL references, (2) no output, (3) no output, (4) exactly one line —
`data/benchmarks.json:agibenchmark@safe.ai`.

## Note on what a repository cannot scrub

Publishing under a GitHub account necessarily exposes that account's public
handle through the repository URL and the commit metadata. That is inherent to
the requested action and is separate from personal data inside the content.
Commit identity was therefore set to a non-personal value for this repository
before the first commit:

```sh
git config user.name  "LLM Benchmark Federation"
git config user.email "noreply@users.noreply.github.com"
```

## Round 2 addendum

Round 2 artifacts were scanned with the same four commands above and were **not
clean on the first pass**. One captured subprocess output
(`reports/round2/subject-88/artifacts/569c3b6b75501e35.stdout.txt`) contained an
operator-local path fragment, because the subject model — during a supposedly
isolated run — issued a `bash` call that touched the operator's memory-store
directory. See ROUND2.md §6.

Because round 2 had not been published at that point, the path fragment was
redacted before first publication by `harness/redact-paths.mjs`, which replaces
only operator-local path fragments. It does **not** touch any measured value,
answer, verdict, or any `.json`/`.jsonl` result file, so every number in the
reports remains derivable from an unmodified file. The manifest of what was
changed is `data/redaction-manifest.json`.

Round 1's logs were left byte-identical: their integrity is what the round-1 audit
rests on, and they scanned clean. The scan is therefore asymmetric by design and
the asymmetry is deliberate, not an oversight.

The scan command must now exclude one more file. `harness/redact-paths.mjs`
contains the patterns it rewrites, so a naive scan flags itself:

```sh
grep -rIlE "$NEEDLE_HOME|$NEEDLE_MEM" . \
  | grep -vE '^\./(PII-SCAN\.md|scripts/verify\.sh|harness/redact-paths\.mjs)$'
```

`scripts/verify.sh` performs exactly this exclusion, so running it is the
authoritative check.
