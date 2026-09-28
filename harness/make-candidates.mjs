#!/usr/bin/env node
/**
 * make-candidates.mjs — build the blind candidate packets the grader needs.
 *
 * Persisted under work/ rather than /tmp on purpose: this container has wiped
 * /tmp twice mid-round, taking the candidate file with it and silently forcing a
 * re-derivation. Anything an experiment depends on belongs next to the data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText } from './scorers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REPORTS = path.join(ROOT, 'reports');
const WORK = path.join(ROOT, 'work');
fs.mkdirSync(WORK, { recursive: true });

const readLog = (p) => (fs.existsSync(p)
  ? fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : []);

const bankRaw = JSON.parse(fs.readFileSync(path.join(HERE, 'items.json'), 'utf8'));
const items = bankRaw.items ?? bankRaw;
const byId = new Map(items.map((i) => [i.id, i]));

const grid = new Map();
const put = (r, inst) => {
  if (!grid.has(r.item_id)) grid.set(r.item_id, {});
  const s = grid.get(r.item_id);
  const incomingGood = String(r.answer || '').trim().length > 0;
  const heldGood = s[inst] && String(s[inst].answer || '').trim().length > 0;
  if (heldGood) return;
  if (incomingGood || !s[inst]) s[inst] = r;
};
for (const r of readLog(path.join(REPORTS, 'round1', 'subject-88', 'run-log.jsonl'))) put(r, r.rep === 0 ? 0 : 1);
for (const r of readLog(path.join(REPORTS, 'round1', 'subject-lc', 'run-log.jsonl'))) put(r, r.rep === 0 ? 0 : 1);
for (const r of readLog(path.join(REPORTS, 'round2', 'subject-88', 'run-log.jsonl'))) put(r, 2);

function voteKey(item, ans) {
  if (item.scorer === 'numeric') {
    const m = String(ans).match(/-?\d+(?:\.\d+)?/g);
    return m ? String(Number(m[m.length - 1])) : null;
  }
  return normalizeText(ans);
}

const flat = [];
let splits = 0;
for (const [id, slot] of grid) {
  const item = byId.get(id);
  if (!item) continue;
  if (![0, 1, 2].every((i) => slot[i] && String(slot[i].answer || '').trim())) continue;
  const recs = [slot[0], slot[1], slot[2]];
  const keys = recs.map((r) => voteKey(item, r.answer));
  const tally = new Map();
  keys.forEach((k, i) => { if (k == null) return; if (!tally.has(k)) tally.set(k, []); tally.get(k).push(i); });
  let best = null;
  for (const [k, ix] of tally) if (!best || ix.length > best[1].length) best = [k, ix];
  if (best && best[1].length >= 2) continue;          // majority exists; no grader needed
  splits++;
  for (let i = 0; i < 3; i++) flat.push({ item_id: id, arm: `inst${i}`, answer: String(recs[i].answer) });
}

fs.writeFileSync(path.join(WORK, 'ensemble-cands-flat.json'), JSON.stringify(flat, null, 1));
const ids = [...new Set(flat.map((a) => a.item_id))].slice(0, 5);
fs.writeFileSync(path.join(WORK, 'position-cands.json'), JSON.stringify(flat.filter((a) => ids.includes(a.item_id)), null, 1));

console.log(`split items: ${splits}`);
console.log(`candidates: ${flat.length} -> work/ensemble-cands-flat.json`);
console.log(`position-probe subset: ${ids.length} items -> work/position-cands.json`);
