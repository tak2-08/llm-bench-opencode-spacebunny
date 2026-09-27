import { parseCSV } from './csv.mjs';
import fs from 'node:fs';

const h = parseCSV(fs.readFileSync('/tmp/c1/epochdata/hle_external.csv', 'utf8'));
console.log('=== HLE rows for gpt-5.1 / claude-opus-4-6 (the big swings) ===');
for (const r of h) {
  if (/gpt-5\.1-2025-11-13|claude-opus-4-6/.test(r['Model version'])) {
    console.log(' ', r['Model version'], '| acc=' + r['Accuracy'], '| Name=' + r['Name'], '| CalErr=' + r['Calibration Error'], '| Notes=' + JSON.stringify(r['Notes'] || '').slice(0, 160));
  }
}
console.log();
console.log('=== distinct Notes values in HLE ===');
const notes = {};
for (const r of h) if (r['Notes']) notes[r['Notes'].slice(0, 120)] = (notes[r['Notes'].slice(0, 120)] || 0) + 1;
for (const [k, v] of Object.entries(notes)) console.log('  n=' + v, JSON.stringify(k));
console.log();
const g = parseCSV(fs.readFileSync('/tmp/c1/epochdata/gpqa_diamond.csv', 'utf8'));
console.log('=== GPQA: mean vs Best gap distribution (n=' + g.length + ') ===');
let maxGap = 0, gt0 = 0;
for (const r of g) {
  const m = Number(r['mean_score']), b = Number(r['Best score (across scorers)']);
  if (Number.isNaN(m) || Number.isNaN(b)) continue;
  const gap = b - m;
  if (gap > 1e-9) gt0++;
  if (gap > maxGap) maxGap = gap;
}
console.log('  rows where Best > mean:', gt0, '| max gap:', (maxGap * 100).toFixed(2) + 'pt');
console.log('  biggest gaps:');
const gaps = g.map((r) => ({ mv: r['Model version'], gap: Number(r['Best score (across scorers)']) - Number(r['mean_score']) })).filter((x) => !Number.isNaN(x.gap)).sort((a, b) => b.gap - a.gap);
for (const x of gaps.slice(0, 8)) console.log('   ', x.mv, (x.gap * 100).toFixed(2) + 'pt');
console.log();
console.log('=== GPQA duplicate model+reasoning rows? (e.g. gpt-5-2025-08-07_none vs _unknown) ===');
const seen = {};
for (const r of g) { const k = r['Model version']; (seen[k] ||= []).push(r['Best score (across scorers)']); }
for (const [k, v] of Object.entries(seen)) if (v.length > 1) console.log('  ', k, '->', v.join(' , '));
