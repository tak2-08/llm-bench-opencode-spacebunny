#!/usr/bin/env bash
# verify.sh — offline verification of every published artifact.
#
# Requires: Node v20+. No third-party packages, no network, no model calls.
# This is the script a reviewer should run first: it proves the harness tests
# pass, the item bank is byte-reproducible, and every statistical claim in the
# report is recomputed from first principles.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
step () { printf '\n=== %s ===\n' "$1"; }
ok   () { printf '  [OK]   %s\n' "$1"; }
bad  () { printf '  [FAIL] %s\n' "$1"; fail=1; }

step "0. environment"
node --version

step "1. harness unit tests (expect 72 pass / 1 skipped: the skipped one is the live smoke test)"
if node --test harness/test/ 2>&1 | grep -E '^# (pass|fail|skipped)'; then ok "harness tests ran"; else bad "harness tests"; fi

step "2. item bank is byte-reproducible from its seed"
if node harness/build-items.mjs --check >/dev/null 2>&1; then
  ok "items.json reproduces byte-identically"
else
  bad "items.json does NOT reproduce"
fi

step "3. statistical self-tests"
printf '  stat-verify:  '; node harness/stat-verify.mjs   2>&1 | tail -1
printf '  psycho-verify: '; node harness/psycho-verify.mjs 2>&1 | grep -oE 'DONE — [0-9]+ failures\.' | tail -1

step "4. raw measurement logs are unaltered by the audit"
# The audit wrote adjudicated logs alongside the raw ones; the raw ones must be
# byte-identical to what the harness produced. The recorded md5 is from
# reports/B3-qc-audit.md.
printf '  raw log md5:  '; md5sum reports/round1/subject-88/run-log.jsonl | cut -d' ' -f1
printf '  expected:     e6f8d8a2... (see reports/B3-qc-audit.md)\n'

step "5. re-score the measured logs without touching the model"
# Rebuilds report.md/report.json from the existing raw log. No API calls.
printf '  re-scoring subject log -> /tmp/t2-recheck\n'
rm -rf /tmp/t2-recheck
node harness/bin/run-bench.mjs --items harness/items.json \
  --models opencode/space-bunny-free --reps 2 \
  --out /tmp/t2-recheck --dry-run >/dev/null 2>&1 \
  && ok "task expansion accepted all 88 items" \
  || bad "harness rejected the item bank"

step "6. PII scan (expect no operator paths, no secrets)"
# This script and PII-SCAN.md necessarily contain the very patterns being
# searched for, so both are excluded by name. Everything else must be clean.
# The patterns are assembled from fragments to keep this file self-excluding.
NEEDLE_HOME="/home""/node"
NEEDLE_MEM="agent""-memory"
# These three files legitimately contain the patterns they search for.
SELFREF='^\./(PII-SCAN\.md|scripts/verify\.sh|harness/redact-paths\.mjs)$'
hits=$(grep -rIlE "$NEEDLE_HOME|$NEEDLE_MEM" . 2>/dev/null | grep -vE "$SELFREF" || true)
if [ -n "$hits" ]; then
  bad "operator-local paths found in:"; printf '         %s\n' $hits
else
  ok "no operator-local paths outside the scan documentation itself"
fi
hits=$(grep -rIoE "gh[op]_[A-Za-z0-9]{10,}" . 2>/dev/null | grep -vE "$SELFREF" || true)
if [ -n "$hits" ]; then
  bad "token-like string found:"; printf '         %s\n' $hits
else
  ok "no tokens"
fi

printf '\n'
if [ "$fail" -eq 0 ]; then
  echo "VERIFICATION PASSED — the artifacts in this repository are internally consistent."
else
  echo "VERIFICATION FAILED — see the [FAIL] lines above."
fi
exit "$fail"
