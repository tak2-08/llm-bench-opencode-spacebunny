#!/usr/bin/env bash
# round1c.sh — chunked execution.
#
# Observed failure mode: runPool completes cleanly on fast models (verified
# 4/4 in a foreground probe) but returns early without a completion line when a
# batch contains long-latency models (phase C stopped at 75/180, phase D at
# 6/20, phase E at 2/90 — all rc=0, all with the slow model in the batch).
# Rather than ship a fix into a harness whose raw logs must stay pristine, this
# driver chunks the work so each invocation is small and self-verifying, and
# resumes via the harness's own run_id skip set.
set -u
cd "$(dirname "$0")"
LOG=/tmp/llmbench-runs/driver-c.log
: > "$LOG"
OUT=../reports/round1/anchors-fast
RESUME=""

chunk () {                      # chunk <model> <start> <count> <timeout-ms>
  local model=$1 start=$2 count=$3 tmo=$4
  local tmp=/tmp/chunk-$(echo "$model" | tr '/.' '__')-$start.json
  node -e "
    const fs=require('fs');
    const b=JSON.parse(fs.readFileSync('../data/items-anchor-44.json','utf8'));
    const it=(b.items||b).slice($start, $((start+count)));
    fs.writeFileSync('$tmp', JSON.stringify(it));
    if(!it.length) process.exit(3);
  " || { echo "no items at $start for $model" >> "$LOG"; return 0; }
  echo "--- $model items[$start..$((start+count-1))] $(date -u +%T) ---" >> "$LOG"
  node bin/run-bench.mjs --items "$tmp" --models "$model" --reps 1 \
    --concurrency 2 --timeout "$tmo" --out "$OUT" $RESUME >> "$LOG" 2>&1
  echo "--- rc=$? $(date -u +%T) ---" >> "$LOG"
}

for start in 0 9 18 27 36; do
  chunk meta/muse-spark-1.3 "$start" 9 120000
done

echo "ROUND1C_ANCHORS_DONE $(date -u +%FT%TZ)" >> "$LOG"
