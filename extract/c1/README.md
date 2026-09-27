# C1 extraction scripts — provenance & reproduction

These are the exact scripts C1 ran on **2026-09-27** to build `data/frontier-scores.json` and
`reports/C1-frontier-scores.md`. They are included so the federation (and C3, at GitHub publication time) can
re-run and audit every number.

**Nothing here touches T2Editor. Nothing commits.**

## Why the scripts exist in this shape

This container has **no `python3` and no `unzip` binary** (`/usr/bin/{curl,wget,node,npm,git}` only). That forced two
decisions that would otherwise look odd:

- `unzip.mjs` — a **from-scratch ZIP reader** (EOCD scan → central directory → local headers → `zlib.inflateRawSync`).
  It exists solely to unpack `https://epoch.ai/data/benchmark_data.zip`. It is ~45 lines and is the only way to get
  Epoch's 88 CSVs in this environment.
- `csv.mjs` — an **RFC4180 parser** rather than a naive `split(',')`. It is required because several Epoch files have
  quoted fields containing embedded newlines and doubled quotes (e.g. `hle_external.csv`'s "Training compute notes",
  `gpqa_diamond.csv` rows spanning ~2 physical lines each). A naive split would silently mis-align every column of
  the largest file.

## Order of operations

```bash
# 0. fetch (all HTTP 200, all recorded in data/C1-sources.md)
curl -sSL -o epoch_data.zip https://epoch.ai/data/benchmark_data.zip
curl -sS  -o hal_gaia.html     https://hal.cs.princeton.edu/gaia
curl -sS  -o bfcl_overall.csv  https://gorilla.cs.berkeley.edu/data_overall.csv
curl -sS  -o lcb_...json  https://raw.githubusercontent.com/livecodebench/livecodebench.github.io/main/src/mocks/performances_generation.json

# 1. unpack + parse
node unzip.mjs epoch_data.zip epochdata

# 2. extract -> four intermediate JSON files
node extract_epoch.mjs     # -> epoch_extracted.json   (scaffold-enriched Epoch rows)
node build.mjs              # -> out_epoch/out_gaia/out_bfcl/out_browsecomp.json

# 3. emit the final dataset (adds meta, coverage, scale, LiveCodeBench derivation)
node emit.mjs               # -> ../../data/frontier-scores.json

# 4. render the human report from the JSON (no number is hand-typed)
node report.mjs             # -> ../../reports/C1-frontier-scores.md
```

Steps 3 and 4 read `/tmp/c1/` intermediates. To re-run end-to-end you must re-fetch into `/tmp/c1/` first, or edit
the paths at the top of `build.mjs` / `emit.mjs` / `report.mjs`.

## Audit scripts

- `integrity.mjs` — the check that resolved whether Epoch's `Best score (across scorers)` column was a problem.
  Result: across 313 GPQA Diamond rows only 5 have Best > mean; max gap 8.18pt (`grok-3-beta`); **0.00 for every
  frontier commercial model**. It also revealed that `hle_external.csv`'s `Name` column is what distinguishes
  *thinking* from *non-thinking* runs — that discovery is the basis of the whole scaffold analysis in the report.
- `lcb3.mjs` — the LiveCodeBench window probe. It established that LiveCodeBench's own final `date_mark`
  (2025-05-01) is **empty** because the feed ends 2025-04-07, which is why `emit.mjs` uses 2024-07-01 → 2025-04-07
  and discloses the substitution.

## Two bugs these scripts caught in C1's own output

Both were found by auditing rather than by a test, and both would have silently corrupted a correlation:

1. **Scale mismatch.** `aider_polyglot_external.csv` stores `Percent correct` on 0–100 (`grok-4-0709 = 79.6`) while
   every other file is 0–1. Unconverted, Aider would have looked ~100× stronger than everything else. Fixed with
   `DIVIDE_100` in `build.mjs`; every emitted row now carries an explicit `scale` field.
2. **METR Time Horizon is minutes, not a probability.** `metr_time_horizons_external.csv` has both `average_score`
   (0–1) and `Time horizon` (minutes, 4.0 → 1,044.8). The first build took the wrong column and mislabelled the unit.
   Fixed to use `Time horizon` with `scale: "minutes (duration, NOT a probability)"`.
