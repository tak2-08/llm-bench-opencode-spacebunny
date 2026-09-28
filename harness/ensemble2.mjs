#!/usr/bin/env node
/**
 * ensemble2.mjs — round 2, track 1. "Three instances behaving as one model."
 *
 * The entity must emit exactly ONE answer per item. Which answer is a design
 * choice, and the choice is where most of the result lives, so four reductions
 * are computed on the SAME three runs and reported side by side:
 *
 *   A  majority      exact-agreement vote only; a 3-way split yields no answer.
 *                    This is the naive ensemble and it is the honest baseline.
 *   B  judge         the independent third-party panel breaks the split. The
 *                    subject's answers are graded by a different model lineage.
 *   C  judge-lineage the same-lineage panel, reported SEPARATELY and used to
 *                    measure self-preference, never as the headline.
 *   D  oracle        pick the candidate that actually passes. NOT ACHIEVABLE —
 *                    it uses the answer key. It is here to separate "the
 *                    instances produced better answers" from "the selector failed
 *                    to find the good one". D - A is the selector headroom.
 *
 * A reduction that emits nothing scores wrong. That is intentional and it is the
 * reason A is so much worse than D: an ensemble with no tie-break rule is worse
 * than a single instance, and that is a finding, not a bug in the metric.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText, score as scoreDispatch } from './scorers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPORTS = path.resolve(HERE, '..', 'reports');
const OUT = path.join(REPORTS, 'round2', 'ensemble');
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- load inputs

const bankRaw = JSON.parse(fs.readFileSync(path.join(HERE, 'items.json'), 'utf8'));
const items = bankRaw.items ?? bankRaw;
const byId = new Map(items.map((i) => [i.id, i]));

function readLog(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

const r1 = [
  ...readLog(path.join(REPORTS, 'round1', 'subject-88', 'run-log.jsonl')),
  ...readLog(path.join(REPORTS, 'round1', 'subject-lc', 'run-log.jsonl')),
];
const r2 = readLog(path.join(REPORTS, 'round2', 'subject-88', 'run-log.jsonl'));

// Instance index comes from FILE PROVENANCE, not from the `variant` field:
// --variant is absent on some records and a provenance mix-up would silently
// reweight one arm.
function tagged(logPath, instanceFor) {
  return readLog(logPath).map((r) => ({ ...r, __inst: instanceFor(r) }));
}
const allRuns = [
  ...tagged(path.join(REPORTS, 'round1', 'subject-88', 'run-log.jsonl'), (r) => (r.rep === 0 ? 0 : 1)),
  ...tagged(path.join(REPORTS, 'round1', 'subject-lc', 'run-log.jsonl'), (r) => (r.rep === 0 ? 0 : 1)),
  ...tagged(path.join(REPORTS, 'round2', 'subject-88', 'run-log.jsonl'), () => 2),
];

const grid = new Map();
for (const r of allRuns) {
  if (!grid.has(r.item_id)) grid.set(r.item_id, {});
  const slot = grid.get(r.item_id);
  const incomingGood = String(r.answer || '').trim().length > 0;
  const heldGood = slot[r.__inst] && String(slot[r.__inst].answer || '').trim().length > 0;
  if (heldGood) continue;
  if (incomingGood || !slot[r.__inst]) slot[r.__inst] = r;
}

// ------------------------------------------------------------------- scoring

function scoreAnswer(item, answer) {
  return scoreDispatch(String(answer ?? ''), item.expected, item.scorer, item.scorer_args ?? {}, { item });
}

/**
 * Agreement key for voting. Exact-string votes are too brittle for
 * open-ended-but-constraint-satisfying items, where three instances can each
 * be correct and all differ. For numeric items the LAST number is the final
 * value (the round-1 audit found the scorer reading the FIRST number, which is
 * how "44604\n44694" was marked wrong); for everything else normalised text.
 */
function voteKey(item, ans) {
  if (item.scorer === 'numeric') {
    const m = String(ans).match(/-?\d+(?:\.\d+)?/g);
    return m ? String(Number(m[m.length - 1])) : null;
  }
  if (item.scorer === 'json_schema') {
    try { return JSON.stringify(JSON.parse(String(ans).match(/\{[\s\S]*\}/)?.[0] ?? '')); } catch { return normalizeText(ans); }
  }
  return normalizeText(ans);
}

// ------------------------------------------------------------ judge verdicts

/**
 * Collapse a judge run directory into item_id -> {choice: instanceIndex, n}.
 * A judge verdict is only a vote if it parsed; unparsed ballots are counted
 * separately rather than dropped, because a judge that always returns nothing
 * must not be mistaken for a judge that abstains.
 */
function loadPanel(dir) {
  const p = path.join(dir, 'verdicts.jsonl');
  if (!fs.existsSync(p)) return null;
  const recs = readLog(p);
  const by = new Map();
  for (const r of recs) {
    if (r.repeat !== 0) continue;
    if (!by.has(r.item_id)) by.set(r.item_id, { votes: [], unparsed: 0 });
    const e = by.get(r.item_id);
    if (r.unparsed) e.unparsed++;
    else e.votes.push(r.chosen_arm);
  }
  const out = {};
  for (const [id, e] of by) {
    const tally = new Map();
    for (const v of e.votes) tally.set(v, (tally.get(v) ?? 0) + 1);
    let best = null;
    for (const [k, c] of tally) if (!best || c > best[1] || (c === best[1] && k < best[0])) best = [k, c];
    out[id] = { choice: best ? best[0] : null, votes: e.votes.length, unanimous: best ? best[1] === e.votes.length && e.votes.length > 0 : false, unparsed: e.unparsed, tally: Object.fromEntries(tally) };
  }
  return { dir, judges: [...new Set(recs.map((r) => r.judge))], items: out, ballots: recs.filter((r) => !r.unparsed).length, unparsed: recs.filter((r) => r.unparsed).length };
}

const panelInd = loadPanel(path.join(REPORTS, 'round2', 'judge-ind'));
const panelLin = loadPanel(path.join(REPORTS, 'round2', 'judge-lineage'));

// ------------------------------------------------------------------ reduction

function majorityOf(recs, item) {
  const keys = recs.map((r) => voteKey(item, r.answer));
  const tally = new Map();
  keys.forEach((k, i) => { if (k == null) return; if (!tally.has(k)) tally.set(k, []); tally.get(k).push(i); });
  let best = null;
  for (const [k, ix] of tally) if (!best || ix.length > best[1].length) best = [k, ix];
  if (best && best[1].length >= 2) return { idx: best[1][0], method: `majority${best[1].length}/3` };
  return { idx: null, method: 'no-majority', distinct: new Set(keys.filter((k) => k != null)).size };
}

function withPanel(base, recs, panel, label) {
  if (base.idx != null) return { ...base, method: `${base.method}` };
  if (!panel) return { ...base, method: `${base.method}+no-panel` };
  const v = panel.items[base.itemId];
  if (v && v.choice != null) return { idx: v.choice, method: `${base.method}+${label}(${v.votes}votes${v.unanimous ? ',unanimous' : ''})` };
  return { ...base, method: `${base.method}+${label}-unresolved` };
}

/**
 * Random-selector control — the control that decides the whole question.
 *
 * The judged ensemble beat naive majority by ~13.8pp, but "always emit a
 * candidate" is worth a lot when the alternative is "emit nothing and be scored
 * wrong". On the 15 three-way splits, 12 had at least one correct candidate, so
 * a selector that picks blindly is right ~73% of the time. A judged ensemble
 * may only be credited with skill if it beats BLIND, not if it beats abstention.
 * Seeded, so the number is reproducible rather than a lucky draw.
 */
function randomOf(recs, item, seed) {
  let h = 2166136261 >>> 0;
  const k = `${item.id}|${seed}`;
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  h >>>= 0;
  return { idx: h % recs.length, method: 'random-among-split' };
}

function oracleOf(recs, item) {
  for (let i = 0; i < recs.length; i++) if (scoreAnswer(item, recs[i].answer).passed) return { idx: i, method: 'oracle' };
  return { idx: null, method: 'oracle-none' };
}

// ------------------------------------------------------------------ analysis

const rows = [];
for (const [itemId, slot] of grid) {
  const item = byId.get(itemId);
  if (!item) continue;
  if (![0, 1, 2].every((i) => slot[i] && String(slot[i].answer || '').trim())) continue;
  const recs = [slot[0], slot[1], slot[2]];

  const singles = [0, 1, 2].map((i) => scoreAnswer(item, recs[i].answer).passed);
  const maj = majorityOf(recs, item);
  const majItemId = itemId;
  const withInd = withPanel({ ...maj, itemId: majItemId }, recs, panelInd, 'judge-ind');
  const withLin = withPanel({ ...maj, itemId: majItemId }, recs, panelLin, 'judge-lineage');
  const orc = oracleOf(recs, item);
  // Blind fallback: where there is no majority, emit an arbitrary candidate.
  // Identical to the judge arm's decision structure, so the two differ only in
  // whether the choice is informed.
  const rnd = maj.idx != null ? { idx: maj.idx, method: maj.method } : randomOf(recs, item, 20260927);

  const res = (r) => (r.idx == null ? false : scoreAnswer(item, recs[r.idx].answer).passed);
  rows.push({
    item_id: itemId, category: item.category, scorer: item.scorer,
    s0: singles[0], s1: singles[1], s2: singles[2],
    a_majority: res(maj),                                        // abstains on a split
    a2_random: res(rnd),                                         // blind, never abstains
    b_judge: res(withInd),
    c_judge_lineage: res(withLin),
    d_oracle: res(orc),
    methods: { majority: maj.method, random: rnd.method, judge_ind: withInd.method, judge_lineage: withLin.method, distinct: maj.distinct },
  });
}

function mcnemar(b, c) {
  const n = b + c;
  if (!n) return { p: 1, b, c, note: 'no discordant pairs' };
  const k = Math.min(b, c);
  const C = (nn, kk) => { let r = 1; for (let i = 0; i < kk; i++) r = (r * (nn - i)) / (i + 1); return Math.round(r); };
  let tail = 0; for (let i = 0; i <= k; i++) tail += C(n, i) * Math.pow(0.5, n);
  return { p: Math.min(1, 2 * tail), b, c };
}
function wilson(k, n, z = 1.959964) {
  if (!n) return null;
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { low: Math.max(0, c - h), high: Math.min(1, c + h) };
}

const n = rows.length;
const acc = (f) => rows.filter(f).length / n;
const bestSingle = Math.max(acc((r) => r.s0), acc((r) => r.s1), acc((r) => r.s2));

const arms = {
  instance_0: (r) => r.s0, instance_1: (r) => r.s1, instance_2: (r) => r.s2,
  A_majority: (r) => r.a_majority, A2_random_selector: (r) => r.a2_random,
  B_judge_independent: (r) => r.b_judge,
  C_judge_same_lineage: (r) => r.c_judge_lineage, D_oracle: (r) => r.d_oracle,
};
const accuracy = Object.fromEntries(Object.entries(arms).map(([k, f]) => [k, acc(f)]));
const ci95 = Object.fromEntries(Object.entries(arms).map(([k, f]) => [k, wilson(rows.filter(f).length, n)]));

// Paired tests: each reduction against each single instance, and B against C
// (does the independent panel see something different from the same-lineage one?).
function paired(fa, fb) {
  let b = 0, c = 0;
  for (const r of rows) { const A = fa(r), B = fb(r); if (A && !B) c++; else if (!A && B) b++; }
  return { a_only: b, b_only: c, ...mcnemar(b, c) };
}
const tests = {};
for (const [k, f] of Object.entries(arms)) {
  if (k.startsWith('D_')) continue;
  tests[`${k} vs instance_1`] = paired(f, arms.instance_1);
}
tests.B_vs_C_panel_agreement = paired(arms.B_judge_independent, arms.C_judge_same_lineage);

// Instance-vs-instance floor: what does pure noise look like at this n?
let fw = 0, fl = 0;
for (const r of rows) for (const [x, y] of [['s0', 's1'], ['s0', 's2'], ['s1', 's2']]) { if (r[x] && !r[y]) fw++; if (!r[x] && r[y]) fl++; }
const floor = {
  discordant_wins: fw, discordant_losses: fl, pairs: rows.length * 3,
  q: (fw + fl) / (rows.length * 3),
  instance_vs_instance_accuracy: fw / (fw + fl),
  note: 'one instance vs another on the same item, same model, same scaffold. Any ensemble gain smaller than this spread is noise.',
};



const byCat = {};
for (const r of rows) {
  (byCat[r.category] ??= { n: 0, instance: 0, A: 0, B: 0, D: 0 });
  const c = byCat[r.category];
  c.n++; c.instance += Math.max(r.s0, r.s1, r.s2) ? 1 : 0;
  c.A += r.a_majority ? 1 : 0; c.B += r.b_judge ? 1 : 0; c.D += r.d_oracle ? 1 : 0;
}

const out = {
  schema: 'llm-bench/ensemble2/v1',
  items: n,
  panels: { independent: panelInd, same_lineage: panelLin },
  reduction_counts: {
    majority_decided: rows.filter((r) => r.methods.majority.startsWith('majority')).length,
    no_majority: rows.filter((r) => r.methods.majority === 'no-majority').length,
    three_way_splits: rows.filter((r) => r.methods.distinct === 3).length,
    judge_ind_used: rows.filter((r) => r.methods.judge_ind.includes('judge-ind(')).length,
    judge_ind_unresolved: rows.filter((r) => r.methods.judge_ind.includes('unresolved')).length,
  },
  accuracy, ci95,
  reproducibility_floor: floor,
  paired_tests: tests,
  selector_headroom: {
    oracle_minus_majority: (accuracy.D_oracle - accuracy.A_majority) * 100,
    oracle_minus_random: (accuracy.D_oracle - accuracy.A2_random_selector) * 100,
    oracle_minus_judge: (accuracy.D_oracle - accuracy.B_judge_independent) * 100,
  },
  // The decisive comparison: an informed selector versus a blind one that
  // abstains never and sees the same candidates.
  B_vs_random_selector: paired(arms.B_judge_independent, arms.A2_random_selector),
  per_category: byCat,
  rows,
};

// Significance must be judged for the reduction being CLAIMED, not for whichever
// reduction happened to clear .05. An earlier version of this file scanned every
// paired test and let A_majority's p=0.0034 promote B to "significant" while B's
// own test gave p=1.0000. That is reporting a non-result as a result.
const bVs = Object.fromEntries(['instance_0', 'instance_1', 'instance_2'].map((a) => [a, paired(arms.B_judge_independent, arms[a])]));
const bSignificant = Object.values(bVs).some((v) => v.p < 0.05);
const gainB = (accuracy.B_judge_independent - bestSingle) * 100;
out.verdict = {
  best_single_instance: bestSingle * 100,
  naive_majority: accuracy.A_majority * 100,
  judge_assisted: accuracy.B_judge_independent * 100,
  same_lineage_panel: panelLin ? accuracy.C_judge_same_lineage * 100 : null,
  oracle_ceiling: accuracy.D_oracle * 100,
  gain_over_best_single_pp: gainB,
  judged_ensemble_vs_each_instance: bVs,
  significant_vs_any_instance: bSignificant,
  // "best single instance" is the max of three noisy arms, so comparing against
  // it is a winner's-curse comparison. The per-instance tests above are the
  // pre-specified ones.
  best_single_is_winners_curse: true,
  naive_majority_significantly_worse: paired(arms.A_majority, arms.instance_1).p < 0.05,
  panels_disagree: panelLin ? (tests.B_vs_C_panel_agreement.p < 0.05 || accuracy.B_judge_independent !== accuracy.C_judge_same_lineage) : null,
};
out.verdict.judge_beats_blind_selector =
  out.B_vs_random_selector.p < 0.05 && accuracy.B_judge_independent > accuracy.A2_random_selector;
out.verdict.statement =
  `3 instances as one model: naive majority ${(accuracy.A_majority * 100).toFixed(1)}%, ` +
  `blind no-abstain selector ${(accuracy.A2_random_selector * 100).toFixed(1)}%, ` +
  `independent third-party panel ${(accuracy.B_judge_independent * 100).toFixed(1)}%, ` +
  `best single instance ${(bestSingle * 100).toFixed(1)}%, oracle ceiling ${(accuracy.D_oracle * 100).toFixed(1)}%. ` +
  (bSignificant && gainB > 0
    ? `The judged ensemble beats a single instance by ${gainB.toFixed(1)}pp with a paired exact test below .05. `
    : `Neither the naive nor the judged ensemble separates from a single instance: the judged ensemble is ${gainB >= 0 ? '+' : ''}${gainB.toFixed(1)}pp against the best single instance and every paired test is above .05. `) +
  `The naive majority looks catastrophic only because a 3-way split forces it to abstain and abstention is scored as failure — ` +
  `a blind selector that never abstains reaches ${(accuracy.A2_random_selector * 100).toFixed(1)}% on the same items. ` +
  `The judged panel is ${(accuracy.B_judge_independent * 100).toFixed(1)}%, i.e. ${((accuracy.B_judge_independent - accuracy.A2_random_selector) * 100 >= 0 ? '+' : '') + ((accuracy.B_judge_independent - accuracy.A2_random_selector) * 100).toFixed(1)}pp versus blind at paired exact p=${out.B_vs_random_selector.p.toFixed(4)}, which is ` +
  `${out.verdict.judge_beats_blind_selector ? 'a real but small effect' : 'NOT distinguishable from blind selection — so the panel advantage is an abstention artefact, not judging skill'}. ` +
  `Only ${((accuracy.D_oracle - accuracy.B_judge_independent) * 100).toFixed(1)}pp separates the judged selector from an oracle that reads the answer key.`;

// Random-pick control. Without it, a panel's accuracy on the split items has no
// scale: "the judge picked well" and "the judge picked a candidate that happened
// to pass" are indistinguishable. Measured over the SAME items the panel saw.
const splitItems = rows.filter((r) => r.methods.majority === 'no-majority');
function panelAccuracy(panel, pickKey) {
  if (!panel) return null;
  const hits = splitItems.filter((r) => {
    const v = panel.items[r.item_id];
    if (!v || v.choice == null) return false;
    const c = v[pickKey];
    return c == null ? false : [r.s0, r.s1, r.s2][c] === true;
  }).length;
  return { items: splitItems.length, correct: hits, accuracy: splitItems.length ? hits / splitItems.length : null };
}
const ctrl = {
  split_items: splitItems.length,
  any_candidate_correct: splitItems.filter((r) => r.s0 || r.s1 || r.s2).length,
  all_candidates_correct: splitItems.filter((r) => r.s0 && r.s1 && r.s2).length,
  random_pick_expected_accuracy: splitItems.length
    ? splitItems.reduce((sum, r) => sum + ([r.s0, r.s1, r.s2].filter(Boolean).length / 3), 0) / splitItems.length
    : null,
  independent_panel: panelAccuracy(panelInd, 'choice'),
  same_lineage_panel: panelAccuracy(panelLin, 'choice'),
  note: 'random_pick_expected_accuracy is the mean chance level of picking one of the three candidates uniformly. A panel below it is worse than chance; a panel above it is extracting signal.',
};
out.judge_control = ctrl;

// How many split items actually offered a discriminative choice? This is the
// number that decides whether "the judge is good at tie-breaking" is even
// measurable. On this bank, most three-way splits are cosmetic: the instances
// disagree in wording while all being correct, so any selector scores the same.
const disc = splitItems.filter((r) => {
  const c = [r.s0, r.s1, r.s2];
  return c.some(Boolean) && !c.every(Boolean);
});
/**
 * Position-sensitivity probe. The same grader re-presents the same candidates
 * in a different order. A grader that follows the SLOT rather than the content
 * is not measuring the answers. This is loaded rather than recomputed because it
 * costs model calls, and it is reported with its own n because 10 pairs cannot
 * support a tight estimate.
 */
function loadPositionProbe(dir) {
  const p = path.join(dir, 'verdicts.jsonl');
  if (!fs.existsSync(p)) return null;
  const recs = readLog(p);
  const by = new Map();
  for (const r of recs) {
    const k = `${r.item_id}|${r.judge}`;
    if (!by.has(k)) by.set(k, {});
    by.get(k)[r.repeat] = r.unparsed ? null : r.chosen_arm;
  }
  const perJudge = {};
  let pairs = 0, flips = 0;
  for (const [k, v] of by) {
    if (v[0] == null || v[1] == null) continue;
    const flipped = v[0] !== v[1];
    pairs++; if (flipped) flips++;
    const j = k.split('|')[1];
    perJudge[j] ??= { pairs: 0, flips: 0 };
    perJudge[j].pairs++; if (flipped) perJudge[j].flips++;
  }
  if (!pairs) return null;
  // Wilson interval, because 3/10 deserves an interval and not a point estimate.
  const w = wilson(flips, pairs);
  return {
    pairs, flips, flip_rate: flips / pairs,
    flip_rate_ci95: w,
    per_judge: Object.fromEntries(Object.entries(perJudge).map(([k, v]) => [k, { ...v, flip_rate: v.flips / v.pairs }])),
    note: 'A high flip rate is only harmful where the candidates differ in quality. On this bank 10 of 15 split items had all three candidates correct, so most flips swap between interchangeable answers. The one informative item (ifr-words-6) was flipped by @high from a wrong instance to the correct one — by luck, not skill.',
    power_caveat: 'n is 10 pairs. The 95% interval is wide enough that this is suggestive, not established.',
  };
}

const positionProbe = loadPositionProbe(path.join(REPORTS, 'round2', 'judge-position2'))
                   ?? loadPositionProbe(path.join(REPORTS, 'round2', 'judge-position'));
out.discriminative_items = {
  split_items: splitItems.length,
  all_three_correct: splitItems.filter((r) => r.s0 && r.s1 && r.s2).length,
  all_three_wrong: splitItems.filter((r) => !r.s0 && !r.s1 && !r.s2).length,
  discriminative: disc.length,
  discriminative_ids: disc.map((r) => r.item_id),
  note: 'A split where every candidate is correct cannot reward a better selector, and one where none is cannot either. The tie-breaking task is only measurable on `discriminative` items.',
};
out.position_sensitivity = positionProbe;

fs.writeFileSync(path.join(OUT, 'ensemble2.json'), JSON.stringify(out, null, 2));

const pct = (x) => `${(x * 100).toFixed(2)}%`;
console.log(`\nitems with 3 instances: ${n}`);
console.log(`reduction: majority decided ${out.reduction_counts.majority_decided} · no-majority ${out.reduction_counts.no_majority} · 3-way splits ${out.reduction_counts.three_way_splits}`);
console.log(`judge panel: independent=${panelInd ? `${panelInd.ballots} ballots, ${panelInd.unparsed} unparsed, ${panelInd.judges.length} judges` : 'ABSENT'}`);
console.log(`             same-lineage=${panelLin ? `${panelLin.ballots} ballots, ${panelLin.unparsed} unparsed, ${panelLin.judges.length} judges` : 'ABSENT'}`);
console.log('\naccuracy:');
for (const [k, v] of Object.entries(accuracy)) {
  const ci = ci95[k];
  console.log(`  ${k.padEnd(26)} ${pct(v).padStart(7)}  [${(ci.low * 100).toFixed(1)}, ${(ci.high * 100).toFixed(1)}]`);
}
console.log(`\ninstance-vs-instance spread: ${pct(floor.instance_vs_instance_accuracy)} over ${floor.pairs} pairs, q=${floor.q.toFixed(4)}`);
console.log('paired exact tests vs instance_1:');
for (const [k, v] of Object.entries(tests)) console.log(`  ${k.padEnd(38)} p=${v.p.toFixed(4)}  (${v.a_only}/${v.b_only})`);
console.log('\njudge control on the split items only:');
console.log(`  items=${ctrl.split_items}  any-candidate-correct=${ctrl.any_candidate_correct}  random-pick expected=${(ctrl.random_pick_expected_accuracy*100).toFixed(1)}%`);
console.log(`  independent panel : ${ctrl.independent_panel ? (ctrl.independent_panel.accuracy*100).toFixed(1)+'% ('+ctrl.independent_panel.correct+'/'+ctrl.independent_panel.items+')' : 'ABSENT'}`);
console.log(`  same-lineage panel: ${ctrl.same_lineage_panel ? (ctrl.same_lineage_panel.accuracy*100).toFixed(1)+'% ('+ctrl.same_lineage_panel.correct+'/'+ctrl.same_lineage_panel.items+')' : 'ABSENT'}`);
console.log(`\ntie-breaking headroom: ${out.discriminative_items.discriminative} of ${out.discriminative_items.split_items} split items were discriminative (${out.discriminative_items.all_three_correct} all-correct, ${out.discriminative_items.all_three_wrong} all-wrong)`);
if (out.position_sensitivity) {
  const ps = out.position_sensitivity;
  console.log(`position sensitivity: ${ps.flips}/${ps.pairs} pairs flipped on reordering = ${(ps.flip_rate*100).toFixed(0)}% [95% CI ${(ps.flip_rate_ci95.low*100).toFixed(0)}-${(ps.flip_rate_ci95.high*100).toFixed(0)}%]`);
  for (const [j,v] of Object.entries(ps.per_judge)) console.log(`  ${j.padEnd(30)} ${v.flips}/${v.pairs} = ${(v.flip_rate*100).toFixed(0)}%`);
}
console.log(`\nDECISIVE — informed selector vs a blind no-abstain selector:`);
console.log(`  judged ${(accuracy.B_judge_independent * 100).toFixed(2)}%  blind ${(accuracy.A2_random_selector * 100).toFixed(2)}%  paired exact p=${out.B_vs_random_selector.p.toFixed(4)}  (judge-only ${out.B_vs_random_selector.a_only} / blind-only ${out.B_vs_random_selector.b_only})`);
console.log(`  headroom: oracle-majority ${out.selector_headroom.oracle_minus_majority.toFixed(1)}pp | oracle-random ${out.selector_headroom.oracle_minus_random.toFixed(1)}pp | oracle-judge ${out.selector_headroom.oracle_minus_judge.toFixed(1)}pp`);
console.log(`\nVERDICT: ${out.verdict.statement}`);
console.log(`\nwrote ${path.join(OUT, 'ensemble2.json')}`);
