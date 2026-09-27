#!/usr/bin/env node
/**
 * run-plan.mjs — batch driver for the measured round.
 *
 * Builds two stratified subsets from items.json and emits the exact shell
 * commands for the measured runs. Kept separate from bin/run-bench.mjs so the
 * subsetting decision is auditable and reproducible rather than hidden in a flag.
 *
 *   node run-plan.mjs plan     # print the run matrix
 *   node run-plan.mjs subsets  # write the subset files
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const bank = JSON.parse(fs.readFileSync(path.join(HERE, 'items.json'), 'utf8'));
const items = bank.items || bank;

export const SUBJECT = 'opencode/space-bunny-free';

// Anchors: the only models empirically verified callable in this environment
// (all other opencode-zen models fail: no credits).
export const ANCHORS = [
  'nvidia/z-ai/glm-5.3-flash',
  'nvidia/moonshotai/kimi-k3',
  'google/gemini-flash-latest',
  'meta/muse-spark-1.3',
];

// Stratified subset: preserve per-category proportion so accuracy stays
// comparable to the full bank up to sampling noise.
export function stratified(n) {
  const byCat = new Map();
  for (const it of items) {
    if (!byCat.has(it.category)) byCat.set(it.category, []);
    byCat.get(it.category).push(it);
  }
  const out = [];
  for (const [, list] of byCat) {
    const take = Math.max(1, Math.round((list.length * n) / items.length));
    for (let i = 0; i < take && i < list.length; i++) out.push(list[i]);
  }
  return out;
}

// Long-context prompts are up to 180k chars; they need their own timeout and
// are the dominant wall-clock cost, so they are kept in every bank.
export const LONG_CTX_TIMEOUT_MS = 600000;
export const STD_TIMEOUT_MS = 240000;

const mode = process.argv[2];

if (mode === 'subsets') {
  const sub = stratified(44);
  const dir = path.join(HERE, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'items-subject-88.json'), JSON.stringify(items, null, 1));
  fs.writeFileSync(path.join(dir, 'items-anchor-44.json'), JSON.stringify(sub, null, 1));
  const cats = {};
  for (const i of sub) cats[i.category] = (cats[i.category] || 0) + 1;
  console.log(`full bank: ${items.length}`);
  console.log(`anchor subset: ${sub.length}`);
  console.log(`  ${JSON.stringify(cats)}`);
} else {
  const sub = stratified(44);
  const R = 'node bin/run-bench.mjs';
  const L = 'timeout 180';
  console.log('# A) SUBJECT, full bank, 2 reps, concurrency 2 (accuracy+consistency)');
  console.log(`${L} ${R} --items items.json --models ${SUBJECT} --reps 2 --concurrency 2 --timeout ${STD_TIMEOUT_MS} --out ../reports/round1/subject-88`);
  console.log('');
  console.log('# A2) SUBJECT long-context only, 2 reps, concurrency 1, long timeout');
  const lc = items.filter((i) => i.category === 'long_context');
  fs.writeFileSync('/tmp/items-lc.json', JSON.stringify(lc, null, 1));
  console.log(`${L} ${R} --items /tmp/items-lc.json --models ${SUBJECT} --reps 2 --concurrency 1 --timeout ${LONG_CTX_TIMEOUT_MS} --out ../reports/round1/subject-lc`);
  console.log('');
  console.log('# B) ANCHORS, stratified 44, 1 rep, concurrency 2 (harness calibration)');
  console.log(`${L} ${R} --items ../data/items-anchor-44.json --models ${ANCHORS.join(',')} --reps 1 --concurrency 2 --timeout ${STD_TIMEOUT_MS} --out ../reports/round1/anchors-44`);
  console.log('');
  console.log('# C) LATENCY pass, concurrency 1 (only valid at 1), 4 short items x all models');
  const short = sub.filter((i) => i.prompt.length < 1500).slice(0, 4);
  fs.writeFileSync('/tmp/items-lat.json', JSON.stringify(short, null, 1));
  console.log(`${L} ${R} --items /tmp/items-lat.json --models ${[SUBJECT, ...ANCHORS].join(',')} --reps 1 --concurrency 1 --timeout ${STD_TIMEOUT_MS} --out ../reports/round1/latency`);
  console.log('');
  console.log(`# estimated calls: ${items.length * 2 + lc.length * 2 + sub.length * ANCHORS.length + short.length * (ANCHORS.length + 1)}`);
}
