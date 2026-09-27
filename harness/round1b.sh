#!/usr/bin/env bash
# round1b.sh — fill the two anchor models that never ran, then a clean
# concurrency-1 latency pass. Separate log dirs because phase C in
# measured-round.sh exited early without a completion line (harness defect
# recorded in B3's audit; the raw trail is preserved as-is).
set -u
cd "$(dirname "$0")"
LOG=/tmp/llmbench-runs/driver-b.log
: > "$LOG"

run () {
  echo "=== $1 START $(date -u +%FT%TZ) ===" >> "$LOG"
  shift
  "$@" >> "$LOG" 2>&1
  echo "=== END rc=$? $(date -u +%FT%TZ) ===" >> "$LOG"
}

# E) the two fast anchors that never started in phase C
run E node bin/run-bench.mjs --items ../data/items-anchor-44.json \
  --models google/gemini-flash-latest,meta/muse-spark-1.3 \
  --reps 1 --concurrency 2 --timeout 180000 \
  --out ../reports/round1/anchors-fast

echo "PHASE_E_DONE $(date -u +%FT%TZ)" >> "$LOG"
