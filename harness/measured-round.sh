#!/usr/bin/env bash
# measured-round.sh — sequential measured runs.
# Concurrency 2 for accuracy (concurrency does not affect accuracy);
# concurrency 1 for the latency pass, because concurrency 2 measurably
# inflates latency (10.2s -> 17.5s) and would make the comparison a
# measurement of contention instead of the model.
set -u
cd "$(dirname "$0")"
mkdir -p /tmp/llmbench-runs
LOG=/tmp/llmbench-runs/driver.log
: > "$LOG"

phase () {
  echo "=== $1 START $(date -u +%FT%TZ) ===" >> "$LOG"
  shift
  "$@" >> "$LOG" 2>&1
  echo "=== phase END rc=$? $(date -u +%FT%TZ) ===" >> "$LOG"
}

# A) subject, full 88-item bank, 2 reps (reproducibility floor + pass@1 variance)
phase A node bin/run-bench.mjs --items items.json \
  --models opencode/space-bunny-free --reps 2 --concurrency 2 \
  --timeout 240000 --out ../reports/round1/subject-88

# B) subject, long-context only, 1 rep, concurrency 1, long timeout.
#    lc-needle-08 is 180,351 chars (~60k tokens) and the harness needs
#    the extended timeout or it is scored as a wrong answer.
phase B node bin/run-bench.mjs --items /tmp/items-lc.json \
  --models opencode/space-bunny-free --reps 1 --concurrency 1 \
  --timeout 600000 --out ../reports/round1/subject-lc

# C) anchors, stratified 45-item subset, 1 rep
phase C node bin/run-bench.mjs --items ../data/items-anchor-44.json \
  --models nvidia/z-ai/glm-5.3-flash,nvidia/moonshotai/kimi-k3,google/gemini-flash-latest,meta/muse-spark-1.3 \
  --reps 1 --concurrency 2 --timeout 240000 --out ../reports/round1/anchors-44

# D) latency pass, concurrency 1 only
phase D node bin/run-bench.mjs --items /tmp/items-lat.json \
  --models opencode/space-bunny-free,nvidia/z-ai/glm-5.3-flash,nvidia/moonshotai/kimi-k3,google/gemini-flash-latest,meta/muse-spark-1.3 \
  --reps 1 --concurrency 1 --timeout 240000 --out ../reports/round1/latency

echo "ALL PHASES DONE $(date -u +%FT%TZ)" >> "$LOG"
