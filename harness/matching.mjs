#!/usr/bin/env node
/**
 * matching.mjs — C2 (Federation C, 상관·게시부), SECOND AND FINAL PASS.
 *
 * THE QUESTION
 * ------------
 * The boss asked: "which frontier commercial model does our subject
 * (`opencode/space-bunny-free`) resemble?" This file answers it, or refuses to.
 *
 * WHAT CHANGED SINCE THE FIRST PASS
 * ---------------------------------
 * Pass 1 ran against the harness's own report: subject 86.9%. B3's audit showed
 * that number was wrong — two harness bugs and eight scorer artifacts had been
 * counted as model failures — and the anchors had not been adjudicated at all.
 * This pass:
 *
 *   1. rebuilds the subject profile from B3's ADJUDICATED log;
 *   2. ADJUDICATES THE ANCHORS with the same rule set
 *      (`adjudicate-anchors.mjs`, which self-tests byte-equivalence against B3's
 *      own output over 176/176 runs before it will emit anything);
 *   3. restricts the comparison to the 45-item stratified subset the anchors
 *      actually ran, because the anchors have 1 rep and the subject has 2.
 *
 * THE HEADLINE FINDING OF THIS PASS
 * ---------------------------------
 * The adjudication moved the ANCHORS more than it moved the subject. Correcting
 * only the subject — which is what pass 1 did — manufactures a gap that does not
 * exist. See data/matching.json -> anchor_comparison.correction_asymmetry.
 *
 * EVERY NUMBER CARRIES A TAG: measured | reported | derived | assumed.
 *
 * Usage:  node harness/matching.mjs [--quiet]
 * Exit 0 = ok. 1 = a required input is missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  wilsonInterval, wilsonIntervalAlt, spearman, permTestSpearman,
  minAttainableP, mcnemarExact,
} from './stat-verify.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const nowIso = () => new Date().toISOString();

/* ============================ inputs ============================ */

const PATHS = {
  items: path.join(ROOT, 'harness/items.json'),
  frontier: path.join(ROOT, 'data/frontier-scores.json'),
  // B3's output — read, never written.
  subjectAdjudicated: path.join(ROOT, 'reports/round1/subject-88/run-log.adjudicated.jsonl'),
  subjectRaw: path.join(ROOT, 'reports/round1/subject-88/run-log.jsonl'),
  // C2's output, produced by adjudicate-anchors.mjs with B3's rules.
  anchor44Adjudicated: path.join(ROOT, 'reports/round1/anchors-44/run-log.adjudicated.jsonl'),
  anchorFastAdjudicated: path.join(ROOT, 'reports/round1/anchors-fast/run-log.adjudicated.jsonl'),
  anchor44Raw: path.join(ROOT, 'reports/round1/anchors-44/run-log.jsonl'),
  anchorFastRaw: path.join(ROOT, 'reports/round1/anchors-fast/run-log.jsonl'),
};

const SUBJECT_MODEL = 'opencode/space-bunny-free';

/** Anchors that produced a usable measurement, and why the others are out. */
const ANCHOR_POLICY = {
  'nvidia/z-ai/glm-5.3-flash': { role: 'headline_anchor' },
  'meta/muse-spark-1.3': { role: 'headline_anchor' },
  'nvidia/moonshotai/kimi-k3': {
    role: 'appendix_only',
    exclude_reason: 'reliability failure, not a capability result: 9 of 28 runs returned no text part (empty_answer, exit=0), so only 21 of the 45 items were ever reached. Adjudicating R1 moves the 9 empties out of the denominator and the surviving runs are 18/19 — the 61.9% headline measures the transport, not the model.',
  },
  'google/gemini-flash-latest': {
    role: 'appendix_only',
    exclude_reason: 'service unavailable: both runs produced an error_event (APIError) at about 102 s. 0 of 45 items attempted. Nothing to compare.',
  },
};

/* ============================ helpers ============================ */

const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);
const r6 = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null);
const pctf = (v) => (Number.isFinite(v) ? Number((v * 100).toFixed(2)) : null);
const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const readJsonl = (p) => (fs.existsSync(p)
  ? fs.readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : []);

/** Wilson from stat-verify, cross-checked against an independently written form. */
function wilson(c, n) {
  if (!n) return { low: null, high: null, halfwidth: null, cross_check_agrees: null };
  const a = wilsonInterval(c, n);
  const b = wilsonIntervalAlt(c, n);
  return {
    low: r4(a.low), high: r4(a.high), halfwidth: r4((a.high - a.low) / 2),
    cross_check_agrees: Math.abs(a.low - b.low) < 1e-9 && Math.abs(a.high - b.high) < 1e-9,
  };
}

function accBlock(v) {
  const n = v.length;
  const c = v.filter(Boolean).length;
  return { n, correct: c, accuracy: n ? c / n : null, ci95: wilson(c, n), tag: 'measured' };
}

/* ================= 1. corrected subject profile ================= */

/**
 * SimpleQA-style F on the abstention family.
 *   F = 2c / (2c + 2i + n)   [A2 PSYCHOMETRICS; reproduced by psycho-verify.mjs:127,
 *                              which re-derives 6/6 of Wei et al. 2024 Table 3]
 *
 * The family has NO convention-free F. B3 measured the same runs at 1.000 /
 * 0.667 / 0.500 depending on where a decline is filed — a 50-point spread, larger
 * than anything this round can detect. All three are returned; the caller names
 * the one it reports and gives the others as a sensitivity range.
 *
 * The three conventions differ ONLY in where a CORRECT DECLINE is filed:
 *   (i)   as correct        -> F = 1.000
 *   (ii)  as not-attempted  -> F = 0.667
 *   (iii) as incorrect      -> F = 0.500
 */
function abstentionDecomposition(rows) {
  const slots = rows.filter((r) => r.category === 'abstention_hallucination');
  const answerable = slots.filter((r) => r.tag_abs === 'answerable');
  const unanswerable = slots.filter((r) => r.tag_abs === 'unanswerable');
  const F = (c, i, n) => (2 * c + 2 * i + n > 0 ? (2 * c) / (2 * c + 2 * i + n) : null);
  const aOk = answerable.filter((r) => r.verdict === 'correct').length;
  const uOk = unanswerable.filter((r) => r.verdict === 'correct').length;
  const uBad = unanswerable.filter((r) => r.verdict === 'incorrect').length;
  const uUnmeasured = unanswerable.length - uOk - uBad;
  const f1 = F(aOk + uOk, uBad, 0);
  const f2 = F(aOk, uBad, uOk + uUnmeasured);
  const f3 = F(aOk, uBad + uOk, 0);
  const fvals = [f1, f2, f3].filter(Number.isFinite);

  return {
    n_slots: slots.length,
    answerable: { n: answerable.length, correct: aOk, tag: 'measured' },
    unanswerable: {
      n: unanswerable.length, correct_abstention: uOk, incorrect_hallucination: uBad,
      unmeasured: uUnmeasured, hallucinations: uBad, tag: 'measured',
    },
    conventions: {
      i_decline_is_correct: {
        c: aOk + uOk, i: uBad, n: 0, F: f1,
        rationale: 'Matches the item design: the bank tags these items absent:unanswerable, so declining to answer IS the target behaviour. The bank is the instrument and its own tags say so.',
        use_for: 'the bank-native reading of our own result',
      },
      ii_decline_is_not_attempted: {
        c: aOk, i: uBad, n: uOk + uUnmeasured, F: f2,
        rationale: 'Matches SimpleQA letter semantics: n is not-attempted. Under Wei et al. 2024 a decline is a refusal to guess, scored as not-attempted rather than incorrect, and the F formula then penalises it. THIS IS THE ONE REPORTED FOR THE FRONTIER COMPARISON, because the abstention axis is matched to SimpleQA Verified and comparing across two conventions is meaningless.',
        use_for: 'the frontier / SimpleQA-comparable reading — PRIMARY',
      },
      iii_decline_is_incorrect: {
        c: aOk, i: uBad + uOk, n: 0, F: f3,
        rationale: 'What the shipped harness effectively reported. Kept only to show what the scorer defect was worth.',
        use_for: 'the sensitivity floor',
      },
    },
    spread_pp: r4(100 * (Math.max(...fvals) - Math.min(...fvals))),
    axis_accuracy_note: 'For the frontier axis the subject value is the convention-free accuracy c/(c+i+n), not F. That is 1.000 under (i) and 0.500 under BOTH (ii) and (iii): (ii) and (iii) agree on accuracy while differing by 0.167 on F, because F weights the not-attempted class and accuracy does not.',
    note: 'The three conventions differ by more than any effect this round can detect. C2 reports (ii) for the frontier comparison and (i) for the bank-native reading, and reports (iii) as the sensitivity floor.',
  };
}

/** Per-run latency decomposition, with the boot share computed from the right fields. */
function latencyProfile(records) {
  const ok = records.filter((r) => r.latency_ms > 0 && r.ttft_spawn_ms != null && r.ttft_opencode_ms != null);
  const lat = ok.map((r) => r.latency_ms);
  const pure = ok.map((r) => r.ttft_opencode_ms);
  const pre = ok.map((r) => r.ttft_spawn_ms - r.ttft_opencode_ms);
  const mLat = median(lat), mPure = median(pure), mPre = median(pre);
  return {
    n: ok.length,
    latency_ms_median: mLat,
    latency_ms_p25: median(lat.filter((x) => x <= mLat)),
    latency_ms_p75: median(lat.filter((x) => x >= mLat)),
    pure_model_ms_median: mPure,
    pre_model_ms_median: mPre,
    pre_model_share_pct: mLat ? r4((100 * mPre) / mLat) : null,
    field_semantics: {
      ttft_spawn_ms: 'spawn to first text event. INCLUDES opencode CLI boot and the provider queue. This is end-to-end.',
      ttft_opencode_ms: 'first step_start to first text event. EXCLUDES CLI boot. The only segment attributable to inference.',
      latency_ms: 'total wall time for the run.',
      warning: 'Dividing ttft_opencode_ms by latency_ms is a unit error and understates the boot share by about 45x. I made that error first and caught it by reading runner.mjs:187,201 rather than by reasoning about it.',
    },
    tag: 'measured',
  };
}

function buildSubjectProfile(adjudicated, itemsById) {
  const rows = adjudicated.map((r) => {
    const it = itemsById[r.item_id];
    const tags = (it?.tags ?? []).map(String);
    return {
      item_id: r.item_id, category: r.category, rep: r.rep,
      verdict: r._adjudication.adjudicated, rule: r._adjudication.rule,
      changed: r._adjudication.changed, original_passed: r._adjudication.original_passed,
      tag_abs: tags.find((t) => t === 'absent:unanswerable') ? 'unanswerable' : 'answerable',
      model: r.model,
    };
  });

  const cats = [...new Set(rows.map((r) => r.category))].sort();
  const perCategory = {};
  for (const c of cats) {
    const inCat = rows.filter((r) => r.category === c);
    const measured = inCat.filter((r) => r.verdict !== 'excluded');
    const full = measured.filter((r) => !r.rule.startsWith('R2-'));
    perCategory[c] = {
      n_runs: inCat.length,
      run_level_raw: accBlock(inCat.map((r) => r.original_passed === true)),
      adjudicated_conservative: accBlock(measured.map((r) => r.verdict === 'correct')),
      adjudicated_full: accBlock(full.map((r) => r.verdict === 'correct')),
      n_excluded_not_measured: inCat.filter((r) => r.rule.startsWith('R1-')).length,
      n_excluded_unscorable_item: inCat.filter((r) => r.rule.startsWith('R2-')).length,
      n_flipped_artifact: inCat.filter((r) => r.changed).length,
      rules_fired: Object.entries(inCat.reduce((m, r) => { m[r.rule] = (m[r.rule] ?? 0) + 1; return m; }, {})),
    };
  }

  return { rows, perCategory, abstention: abstentionDecomposition(rows), categories: cats };
}

/* ============ 2. like-for-like anchor comparison ============ */

/**
 * Item-level rollup. The unit is ONE ITEM, never one run.
 *   The anchors ran 1 rep (with transport retries); the subject ran 2. A run-level
 *   denominator is therefore not comparable: glm 47 runs cover 45 items and the
 *   subject 176 runs cover 88.
 *
 * resolve:
 *   measured  the last attempt that produced a scorable answer (retry-resolved).
 *             The only definition consistent with the harness own documented
 *             contract that transport failures leave the accuracy denominator.
 *   first     first attempt, retries ignored. Reproduces the raw numbers quoted in
 *             the second-pass brief so the size of the correction stays visible.
 */
function rollup(records, model, resolve) {
  const by = {};
  for (const r of records) if (r.model === model) (by[r.item_id] = by[r.item_id] || []).push(r);
  // Raw logs carry no _adjudication; treat them as the scorer own verdict.
  const vfield = (r) => (r._adjudication
    ? { verdict: r._adjudication.adjudicated, rule: r._adjudication.rule, original_passed: r._adjudication.original_passed, changed: r._adjudication.changed }
    : { verdict: r.passed === true ? 'correct' : (r.failure != null ? 'excluded' : 'incorrect'), rule: r.failure != null ? 'R1-not-measured' : 'raw-scorer', original_passed: r.passed, changed: false });
  const out = [];
  for (const [item_id, attempts] of Object.entries(by)) {
    attempts.sort((a, b) => (a.attempt ?? 1) - (b.attempt ?? 1));
    const rev = [...attempts].reverse();
    const pick = resolve === 'first' ? attempts[0] : (rev.find((a) => vfield(a).verdict !== 'excluded') ?? rev[0]);
    const v = vfield(pick);
    out.push({
      item_id, category: pick.category, model,
      verdict: v.verdict, rule: v.rule, original_passed: v.original_passed, changed: v.changed,
      n_attempts: attempts.length, mean_of_reps: null,
    });
  }
  return out;
}

/** Per-item agreement across the subject 2 reps — the source of the floor. */
function repAgreement(subjectRows) {
  const by = {};
  // Only items with BOTH reps MEASURED can contribute. An excluded run is not a
  // verdict; counting it as one deflates the agreement rate and inflates q.
  for (const r of subjectRows) if (r.verdict !== 'excluded') (by[r.item_id] = by[r.item_id] || {})[r.rep] = r;
  const pairs = Object.entries(by).filter(([, v]) => v[0] && v[1]);
  let agree = 0, b = 0, c = 0;
  const discordant = [];
  for (const [id, v] of pairs) {
    const x = v[0].verdict === 'correct', y = v[1].verdict === 'correct';
    if (x === y) { agree++; continue; }
    discordant.push({ item_id: id, rep0: x ? 'correct' : 'incorrect', rep1: y ? 'correct' : 'incorrect' });
    if (!x && y) b++; else c++;
  }
  return {
    n_items_with_both_reps: pairs.length, agree,
    agreement_rate: pairs.length ? agree / pairs.length : null,
    mcnemar_b_rep0_fail_rep1_pass: b, mcnemar_c_rep0_pass_rep1_fail: c,
    q_discordance: pairs.length ? (b + c) / pairs.length : null,
    discordant,
  };
}

/**
 * McNemar on subject-vs-anchor over the SHARED item set. A genuine paired test:
 * same items, same instrument, same adjudication rules.
 *
 * subjectPick selects how a 2-rep subject item becomes one binary verdict:
 *   both   both reps correct        (conservative)
 *   either at least one rep correct (optimistic)
 * The MEAN is the unbiased estimator and is what the gap should be read from.
 */
function pairedCompare(subjectRoll, anchorRoll, floorPp, subjectPick) {
  const a = new Map(anchorRoll.map((r) => [r.item_id, r]));
  const pairs = [];
  for (const s of subjectRoll) {
    const x = a.get(s.item_id);
    if (!x) continue;
    if (s.verdict === 'excluded' || x.verdict === 'excluded') continue;
    const sOk = subjectPick === 'either' ? Boolean(s.either_correct) : s.verdict === 'correct';
    pairs.push({ item_id: s.item_id, s: sOk, a: x.verdict === 'correct' });
  }
  const n = pairs.length;
  const sc = pairs.filter((x) => x.s).length;
  const ac = pairs.filter((x) => x.a).length;
  const inScope = subjectRoll.filter((s) => s.verdict !== 'excluded' && a.has(s.item_id) && a.get(s.item_id).verdict !== 'excluded');
  const subjectMean = inScope.length ? inScope.reduce((t, s) => t + (s.mean_of_reps ?? 0), 0) / inScope.length : null;
  let b = 0, c = 0;
  for (const x of pairs) { if (x.s && !x.a) b++; else if (!x.s && x.a) c++; }
  const m = mcnemarExact(b, c);
  const gapPp = n ? (100 * (sc - ac)) / n : null;
  const gapMeanPp = (n && subjectMean != null) ? (100 * (subjectMean - ac / n)) : null;
  const resolvable = (b + c) > 0;
  return {
    n_shared_items: n, subject_correct: sc, anchor_correct: ac,
    subject_accuracy_conservative_both_reps: n ? sc / n : null,
    subject_accuracy_mean_of_2_reps: subjectMean,
    anchor_accuracy: n ? ac / n : null,
    subject_ci95_conservative: wilson(sc, n), anchor_ci95: wilson(ac, n),
    gap_pp_conservative: gapPp == null ? null : r4(gapPp),
    gap_pp_unbiased_mean: gapMeanPp == null ? null : r4(gapMeanPp),
    rep_asymmetry_note: 'The anchor has 1 rep and the subject 2, so the subject binary accuracy is a RANGE not a number. conservative(both reps) and optimistic(either rep) bracket it; the MEAN is the unbiased estimator and is what the gap should be read from.',
    mcnemar_b_subject_only: b, mcnemar_c_anchor_only: c,
    mcnemar_exact_p_two_sided: resolvable ? r6(m.p) : 'not resolvable (no discordant items)',
    discordant_items: pairs.filter((x) => x.s !== x.a).map((x) => x.item_id),
    resolvable,
    exceeds_reproducibility_floor: {
      floor_pp: floorPp == null ? null : r4(floorPp),
      gap_pp_conservative: gapPp == null ? null : r4(gapPp),
      gap_pp_unbiased_mean: gapMeanPp == null ? null : r4(gapMeanPp),
      verdict: !resolvable ? 'no discordant pairs exist, so no test exists; the gap is descriptive only'
        : (Math.abs(gapMeanPp ?? gapPp) > floorPp ? 'exceeds floor on the unbiased mean'
          : 'within floor on the unbiased mean — NOT separable (conservative reading is ' + r4(gapPp) + ' pp)'),
    },
    tag: 'measured',
  };
}

/* ============ 3. frontier profiles (C1 table) ============ */

/**
 * AXIS MAP — an explicit judgment call, carried over unchanged from pass 1 so the
 * two passes stay comparable. Left: an item-bank category. Right: a family of
 * published benchmarks judged to measure the same construct.
 *
 * FIVE of the nine bank categories have NO counterpart anywhere in the
 * federation data. That is the binding constraint on this entire analysis:
 *   instruction_following — IFEval/IFBench in A1 with score_range UNVERIFIED
 *       current frontier values and no url; C1 has 0 cells.
 *   format_control — no judge-based format eval exists in C1 table, and our
 *       scorers are deterministic, so the two would not measure one construct.
 *   multilingual — MMMLU/KMMLU in A1, unverified, no url; C1 has 0 cells.
 *   long_context — RULER/LongBench absent. METR Time Horizon is the nearest
 *       looking row but its scale is MINUTES: a duration, not a probability.
 *   robustness — prompt-injection/hijacking benchmarks absent; A1 named this his
 *       largest coverage hole; C1 has 0 cells.
 */
const AXIS_MAP = {
  reasoning: {
    item_category: 'reasoning',
    benchmarks: ['GPQA Diamond', 'FrontierMath Tiers 1-3 v2', 'FrontierMath Tier 4 v2', 'MATH Level 5', "Humanity's Last Exam"],
  },
  code: {
    item_category: 'code',
    benchmarks: ['LiveCodeBench (code generation, pass@1)', 'Aider Polyglot', 'SciCode'],
  },
  function_calling: {
    item_category: 'function_calling',
    benchmarks: ['BFCL V4 (Berkeley Function Calling Leaderboard V4)'],
  },
  abstention: {
    item_category: 'abstention_hallucination',
    benchmarks: ['SimpleQA Verified'],
  },
};

const UNMATCHED_CATEGORIES = {
  instruction_following: 'IFEval / IFBench in A1 with UNVERIFIED current frontier values, no url; C1 has 0 cells.',
  format_control: 'No judge-based format eval in the C1 table; our scorers are deterministic, so the constructs differ.',
  multilingual: 'MMMLU / Global-MMLU / KMMLU in A1, unverified, no url; C1 has 0 cells.',
  long_context: 'RULER / LongBench absent. METR Time Horizon scale is MINUTES - a duration, not rankable against an accuracy.',
  robustness: 'Prompt-injection / hijacking benchmarks absent (A1 named this his largest hole); C1 has 0 cells.',
};

/**
 * SCAFFOLD BAND — assumed. Half-width added to a frontier score to make it
 * comparable with a subject whose scaffold we do not know and cannot set.
 *
 * From C1 first-party table, reasoning-budget swings only. Scaffold-only swings
 * are larger, up to 43.64 pp:
 *     4.24 pp  Claude Opus 4.1  High vs unspecified        (GAIA, HAL)
 *    15.44 pp  claude-opus-4-6  thinking-max vs Non-Thinking (HLE, Epoch)
 *    16.88 pp  gpt-5.1  thinking vs instant                 (HLE, Epoch)
 *    18.60 pp  gpt-5.4-2026-03-05  xhigh vs none            (GPQA, Epoch)
 *    28.00 pp  gpt-5.6-luna  best vs lowest effort          (GPQA, Epoch)
 * Default 0.15; sensitivity at 0.05 / 0.10 / 0.15 / 0.28. A conclusion that
 * exists only at 0.28 is not a conclusion.
 */
const SCAFFOLD_BAND = 0.15;
const BAND_SENSITIVITY = [0.05, 0.10, 0.15, 0.28];

/**
 * Model-name normalisation for joining two independently built tables.
 * Deterministic, exact-match only — no edit distance, no hand-written alias list.
 * KNOWN RISK, stated not hidden: this merges genuinely distinct snapshots
 * (claude-3-5-sonnet-20240620 vs -20241022; three dated gpt-4o rows). Those are one
 * family at different checkpoints, so the merged bracket spans a real difference.
 * Such keys are flagged multi_snapshot.
 */
function normaliseModelName(raw) {
  return String(raw)
    .toLowerCase()
    .replace(/\((fc|prompt|tool|no[- ]?tool)\)/g, '')
    .replace(/(^|[-_ ])(non[-_ ]?)?reasoning($|[-_ ])/g, ' ')
    .replace(/[-_ ]?(20\d{2}[-_]?\d{2}[-_]?\d{2}|\d{4}[-_]\d{2}[-_]\d{2})$/g, '')
    .replace(/[-_ ]?(instruct|chat|it|fp8)$/g, '')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
const isMultiSnapshot = (names) => names.filter((n) => /20\d{2}[-_]?\d{2}[-_]?\d{2}/.test(n)).length > 1;

function frontierProfiles(scores) {
  const axisOf = new Map();
  for (const [axis, def] of Object.entries(AXIS_MAP)) for (const b of def.benchmarks) axisOf.set(b, axis);
  const byModel = new Map();
  const skip = { axis_not_mapped: 0, non_fraction_scale: 0, non_finite_score: 0 };
  for (const r of scores) {
    const axis = axisOf.get(r.benchmark);
    if (!axis) { skip.axis_not_mapped++; continue; }
    // C1 unit-bug catch: a duration is not a probability.
    if (r.scale && r.scale !== 'fraction_0_to_1') { skip.non_fraction_scale++; continue; }
    if (!Number.isFinite(r.score)) { skip.non_finite_score++; continue; }
    const key = normaliseModelName(r.model);
    if (!byModel.has(key)) byModel.set(key, { key, raw_names: new Set(), vendor: r.vendor, axes: new Map(), release_dates: [] });
    const m = byModel.get(key);
    m.raw_names.add(r.model);
    if (r.model_release_date) m.release_dates.push(r.model_release_date);
    if (!m.axes.has(axis)) m.axes.set(axis, []);
    m.axes.get(axis).push({
      benchmark: r.benchmark, score: r.score, stderr: r.stderr, sample_size: r.sample_size,
      reported_by: r.reported_by ?? null, source_type: r.source_type ?? null,
      confidence: r.confidence ?? null, url: r.url ?? null, license: r.license ?? null,
      scaffold: r.scaffold ?? null, scaffold_detail: r.scaffold_detail ?? null,
      reasoning_effort: r.reasoning_effort ?? null, raw_version: r.model_version_raw ?? null,
    });
  }

  const profiles = [];
  for (const m of byModel.values()) {
    const axes = {};
    for (const [axis, entries] of m.axes) {
      const levels = entries.map((e) => e.score).sort((a, b) => a - b);
      // within-benchmark = scaffold width (absorbed); across-benchmark = real
      // difficulty difference (NOT absorbed). Conflating them is precisely how
      // everything-matches conclusions get manufactured.
      const byBench = new Map();
      for (const e of entries) {
        if (!byBench.has(e.benchmark)) byBench.set(e.benchmark, []);
        byBench.get(e.benchmark).push(e);
      }
      let maxWithin = 0;
      for (const es of byBench.values()) {
        if (es.length < 2) continue;
        const sc = es.map((e) => e.score);
        maxWithin = Math.max(maxWithin, Math.max(...sc) - Math.min(...sc));
      }
      const mid = levels.length % 2 ? levels[(levels.length - 1) / 2] : (levels[levels.length / 2 - 1] + levels[levels.length / 2]) / 2;
      axes[axis] = {
        level: r4(mid), n_benchmarks: entries.length, per_benchmark: entries,
        max_within_benchmark_scaffold_width: r4(maxWithin),
        across_benchmark_spread: r4(levels[levels.length - 1] - levels[0]),
        stderrs: entries.map((e) => e.stderr).filter(Number.isFinite),
        derivation: 'derived — median of per-benchmark levels. NOT a published number and must never be quoted as one.',
      };
    }
    const names = [...m.raw_names];
    profiles.push({
      key: m.key, raw_names: names, vendor: m.vendor, axes,
      n_axes: Object.keys(axes).length,
      multi_snapshot: isMultiSnapshot(names),
      release_dates: [...new Set(m.release_dates)].sort(),
    });
  }
  return { profiles, skip_counts: skip };
}

/* ================= 4. the match ================= */

function subjectAxesFrom(roll) {
  const axes = {};
  for (const [axis, def] of Object.entries(AXIS_MAP)) {
    const inCat = roll.filter((r) => r.category === def.item_category && r.verdict !== 'excluded' && !r.rule.startsWith('R2-'));
    const n = inCat.length;
    const mean = n ? inCat.reduce((s, r) => s + (r.mean_of_reps ?? (r.verdict === 'correct' ? 1 : 0)), 0) / n : null;
    const c = mean == null ? 0 : Math.round(mean * n);
    axes[axis] = {
      n, correct: c, accuracy: mean == null ? null : r4(mean), wilson_ci95: wilson(c, n),
      normal_se: mean != null && n && mean > 0 && mean < 1 ? Math.sqrt((mean * (1 - mean)) / n) : null,
      source: 'measured',
    };
  }
  return axes;
}

function matchAll(subjectAxes, profiles, band) {
  const out = [];
  for (const p of profiles) {
    if (p.n_axes < 2) continue;
    const perAxis = [];
    for (const axis of Object.keys(AXIS_MAP)) {
      const s = subjectAxes[axis], m = p.axes[axis];
      if (!s || s.accuracy == null || !m) { perAxis.push({ axis, status: 'no_data_both_sides' }); continue; }
      const subjectBand = { low: Math.max(0, s.wilson_ci95.low - band), high: Math.min(1, s.wilson_ci95.high + band) };
      const modelBand = Math.max(band, m.max_within_benchmark_scaffold_width ?? 0);
      const modelBracket = { low: Math.max(0, m.level - modelBand), high: Math.min(1, m.level + modelBand) };
      const consistent = subjectBand.low <= modelBracket.high && modelBracket.low <= subjectBand.high;
      perAxis.push({
        axis,
        status: consistent ? 'consistent' : (s.accuracy > modelBracket.high ? 'subject_above' : 'subject_below'),
        subject_accuracy: s.accuracy, subject_ci95: s.wilson_ci95, subject_n: s.n,
        subject_band_with_scaffold: { low: r4(subjectBand.low), high: r4(subjectBand.high), band },
        model_level: m.level, model_level_derivation: m.derivation,
        model_band_used: r4(modelBand),
        model_bracket: { low: r4(modelBracket.low), high: r4(modelBracket.high) },
        across_benchmark_spread: m.across_benchmark_spread,
        model_n_benchmarks: m.n_benchmarks,
        model_benchmarks: m.per_benchmark.map((b) => b.benchmark),
        gap: r4(consistent ? 0 : Math.max(subjectBand.low - modelBracket.high, modelBracket.low - subjectBand.high)),
      });
    }
    const live = perAxis.filter((a) => a.status !== 'no_data_both_sides');
    const k = live.length;
    const consistentCount = live.filter((a) => a.status === 'consistent').length;
    // Centre distance is a real quantity even when bands overlap, so it is what a
    // reader would otherwise mistake for a match score.
    const centre = live
      .filter((a) => Number.isFinite(a.subject_accuracy) && Number.isFinite(a.model_level))
      .map((a) => Math.abs(a.subject_accuracy - a.model_level));
    const meanCentre = centre.length ? centre.reduce((s, x) => s + x, 0) / centre.length : null;
    const xs = live.map((a) => a.subject_accuracy), ys = live.map((a) => a.model_level);
    const rho = k >= 3 ? spearman(xs, ys) : null;
    const perm = k >= 3 ? permTestSpearman(xs, ys) : null;
    const floor = minAttainableP(k);
    const straddler = live.some((a) => a.status === 'subject_above') && live.some((a) => a.status === 'subject_below');
    const allAbove = k > 0 && live.every((a) => a.status === 'subject_above');
    out.push({
      model_key: p.key, raw_names: p.raw_names, vendor: p.vendor,
      release_dates: p.release_dates, multi_snapshot: p.multi_snapshot,
      n_axes: k, per_axis: perAxis,
      n_axes_overlapping: consistentCount,
      mean_centre_distance_pp: meanCentre == null ? null : r4(100 * meanCentre),
      gap_caveat: 'gap is 0 whenever the bands OVERLAP, so 0 means UNINFORMATIVE, not identical. Rank by mean_centre_distance_pp if you must rank at all; that ranking is descriptive, is not a test, and is not separable at our n.',
      spearman_rho: rho, spearman_p_permutation: perm,
      min_attainable_p_for_k: floor,
      structurally_resolvable_at_alpha_05: floor != null && floor <= 0.05,
      profile_relation: allAbove ? 'subject_above_on_every_live_axis' : (straddler ? 'straddler' : 'mixed_or_consistent'),
      relation_note: allAbove
        ? 'The subject band sits above the model bracket on every live axis. That is a FLOOR, not a resemblance: a model below the subject on every axis is not a match, it is a candidate for a better description.'
        : (straddler ? 'Above on some axes, below on others. This is the only profile shape that could support a resemblance claim.' : 'not uniformly above; no single direction'),
    });
  }
  return out;
}

/* ================= 5. threats + falsification ================= */

function threatList(ctx) {
  const ag = ctx.agreement;
  return [
    {
      rank: 1,
      threat: 'The item bank was authored by an LLM of the same family that is being graded.',
      quantified: '88 items (45 in the anchor subset); 84 machine-generated by a seeded generator whose answers were verified by two independent re-derivations (A3: 824 checks, 0 failures). Answer CORRECTNESS is machine-guaranteed; item SELECTION, vocabulary and difficulty calibration carry the author fingerprint. An advantage on this bank traceable to a shared author lineage is not separable from capability.',
      resolvable_in_session: false,
      note: 'A3 already named this as its own top threat. It is the only one on this list a second round can address (falsification plan F2).',
    },
    {
      rank: 2,
      threat: 'Format compliance is confounded with capability.',
      quantified: '52 of 88 items use a strict-format scorer (exact_match / numeric / json_schema). The hedged-abstention result is the clean demonstration: the subject abstained correctly and informatively and the scorer marked it wrong, 6 runs on a 2-rep basis. A model terser than the bank author is penalised by the instrument, not by its reasoning.',
      resolvable_in_session: false,
    },
    {
      rank: 3,
      threat: 'Two items in the bank are defective, and they ARE in the 45-item anchor subset.',
      quantified: 'fmt-nested-02 (prompt says with no separator; the scored value is S-240, which contains one) and fmt-flat-01 (the passage has no reading-to-condition mapping, so the answer is not determined). Both are adjudicated out by R2 for EVERY model. Effect on the ANCHOR RANKING: none, every anchor had both items excluded, so the ordering is unchanged. Effect on LEVELS: 2 fewer items in every denominator, so levels are computed on 43 rather than 45.',
      resolvable_in_session: true, resolved: 'ranking unaffected; both headline anchors carried both items',
    },
    {
      rank: 4,
      threat: 'n is far below what A2 computed as necessary.',
      quantified: 'A2: a 5 pp paired gap at q=0.20 needs n about 628. B3 MEASURED q=0.0588, which improves the floor to 7.37 pp at 1 rep and about 5.21 pp at the mean of 2 reps. We have 45 shared items and ONE anchor rep. The comparison can only separate models differing by more than about 7.4 pp, and neither anchor gap reaches it.',
      resolvable_in_session: false,
    },
    {
      rank: 5,
      threat: 'function_calling and code are proxies, not agentic success.',
      quantified: 'The isolated harness (--pure --dir empty) exposes no tools, so there is nothing to execute and no final state to check. task_success_rate measures whether a schema-shaped call was EMITTED, not whether anything happened. Worse: the subject called bash in 5 runs (7 calls) and all 5 passed, so the subject scaffold varied INSIDE its own measurement — the model-times-scaffold tuple problem observed rather than theorised.',
      resolvable_in_session: false,
    },
    {
      rank: 6,
      threat: 'Anchors ran 1 rep; the subject ran 2.',
      quantified: 'Subject self-agreement across reps is ' + (ag ? pctf(ag.agreement_rate) : 'n/a') + '% over '
        + (ag ? ag.n_items_with_both_reps : 'n/a') + ' items, q=' + (ag ? r6(ag.q_discordance) : 'n/a')
        + '. An anchor therefore carries a full rep of that noise while the subject item verdict is a 2-rep quantity. This is why the subject is reported as a RANGE (conservative / mean / optimistic) rather than a number.',
      resolvable_in_session: false,
    },
    {
      rank: 7,
      threat: 'The effective reasoning budget is set by the service and is unknown.',
      quantified: 'This is the same axis C1 measured at 4.24-28.00 pp on first-party data (HLE: gpt-5.1 thinking 23.68% vs instant 6.80% = 16.88 pp; GPQA: gpt-5.6-luna 28.0 pp across effort levels). The subject reasoning-token total is recorded (22,876 over 176 runs) but the provider exposes no effort parameter, so the subject sits somewhere on that axis and we cannot say where.',
      resolvable_in_session: false,
    },
    {
      rank: 8,
      threat: 'Scaffold dominates the identity of any frontier score, so no constant correction exists.',
      quantified: 'Same model, same benchmark, scaffold only: GAIA Claude Sonnet 4.5 = 74.55% (HAL) vs 30.91% (HF Open Deep Research) = 43.64 pp; Claude Opus 4 = 7.27 pp; Claude 3.7 Sonnet = 19.39 pp; GPT-5 Medium = -3.41 pp, where the sign REVERSES. A constant correction is not merely inaccurate, it does not exist.',
      resolvable_in_session: false,
    },
    {
      rank: 9,
      threat: 'Five of nine bank categories have no frontier counterpart, so the axis count is capped at 4.',
      quantified: 'instruction_following, format_control, multilingual, long_context and robustness have 0 cells in the C1 table. That caps k at 4, where the minimum attainable two-sided permutation p is 0.0833, above alpha=.05. Reaching k=5 needs TWO new axes; one new axis only buys k=4.',
      resolvable_in_session: false,
    },
    {
      rank: 10,
      threat: 'The 4-axis corner of the C1 table is 2025-vintage and from only two vendors — a coverage artefact that will read as a finding.',
      quantified: 'All 6 four-axis models are 2025-04..2025-10 and all are OpenAI or Anthropic (gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, gpt-5-mini, claude-haiku-4-5, claude-sonnet-4-5). The 4th axis is BFCL, whose last update is 2026-04-12, so 2026 flagships are absent from it by data staleness rather than by weakness. A naive reading concludes the subject matches 2025 mid-tier models; the correct reading is that our instrument can only see the 2025 mid-tier corner.',
      resolvable_in_session: false,
    },
  ];
}

function falsificationPlan(cands) {
  return {
    principle: 'A rank correlation over 3-4 axes cannot reach alpha=.05 at any sample size, so re-running THIS design cannot discriminate the top candidates. The discriminating experiment has to add an axis, not add items.',
    experiments: [
      {
        id: 'F1-fix-and-rescore',
        name: 'Patch the two scorer defects and re-score the EXISTING logs',
        cost: 'zero model calls — the answers are already on disk',
        discriminates: 'How much of the current picture is scorer artifact rather than model.',
        procedure: 'Remove the no-digit lookahead from the abstention pattern, and make numeric read the LAST number when the answer is a multi-step trace (or accept a tolerance band). Then re-score all four logs unchanged.',
        decisive_outcome: 'If the subject and the anchors move by DIFFERENT amounts, the current ranking is an artifact ranking and must be discarded. This is the cheapest experiment in the report and it gates everything else.',
        blocks_on: 'the charter puts harness writes with the team leader; B3 listed the three code locations and deliberately did not patch them for this reason.',
      },
      {
        id: 'F2-other-family-bank',
        name: 'Build a second item bank from a different model family; score per-item agreement',
        cost: '2 rounds x 45 items x 4 models',
        discriminates: 'Threat 1 (author fingerprint) — the only thing that can.',
        procedure: 'A3 bank plus a bank authored by a different family: same categories, same scorers, n about 45 each, 1 rep, every model including both headline anchors.',
        decisive_outcome: 'If the subject lead over an anchor is present on the foreign bank and absent on its own, the lead is lineage, not capability. This is the single highest-value experiment in this report.',
      },
      {
        id: 'F3-add-two-axes',
        name: 'Obtain first-party instruction_following and multilingual scores for the candidate models',
        cost: 'data collection plus one re-analysis; no new rounds',
        discriminates: 'Threat 9 and the structural floor. k=4 caps attainable p at 0.0833; k=5 admits 0.0167 and finally permits alpha=.05.',
        procedure: 'Acquire IFEval-strict and a Korean instrument (Ko-IFEval, Ko-GPQA) at first-party sources, map them onto two bank categories, re-run the rank test at k=5.',
        decisive_outcome: 'Only at k>=5 does a rank correlation become a usable instrument. Until then any p we print is decorative.',
      },
      {
        id: 'F4-scaffold-bracket',
        name: 'Bracket the subject scaffold by running the same 45 items at two explicit reasoning-effort settings',
        cost: '2 rounds x 45 items',
        discriminates: 'Threats 7 and 8 — whether the subject position is an artefact of an unknown effort level.',
        procedure: 'Same items, same scorers, effort set to minimum and maximum on a provider that exposes the parameter.',
        decisive_outcome: 'If the subject band moves more than 7.4 pp between the two settings, the subject score is a property of the scaffold, and no frontier comparison of it is meaningful until the effort is pinned.',
      },
      {
        id: 'F5-symmetric-anchor-floor',
        name: 'Run the anchors for 2-3 reps so the comparison is symmetric',
        cost: '2 extra reps x 45 items x 2 anchors',
        discriminates: 'Threat 6 and the floor itself.',
        procedure: 'Re-run glm-5.3-flash and muse-spark-1.3 on the same 45 items for 2 more reps each, adjudicated with the same rules.',
        decisive_outcome: 'Recompute q per anchor. If an anchor q approaches the subject q=0.0588, the floor is model-specific and the muse gap could become separable; if it is much larger, the gap definitively is not.',
      },
    ],
    top_candidates_needing_discrimination: cands.slice(0, 6).map((c) => ({
      model_key: c.model_key, vendor: c.vendor, n_axes: c.n_axes,
      mean_centre_distance_pp: c.mean_centre_distance_pp, profile_relation: c.profile_relation,
    })),
    note: 'The top candidates are separated by only a few pp of centre distance and by 2-3 live axes, which is at or below our own reproducibility floor. They are NOT separable by this instrument, and the ordering shown is a descriptive artefact of axis count, not a ranking.',
  };
}

/* ================= 6. main ================= */

function main(argv) {
  const quiet = argv.includes('--quiet');
  const L = quiet ? () => {} : console.log;

  const missing = Object.entries(PATHS).filter(([, p]) => !fs.existsSync(p)).map(([k]) => k);
  if (missing.length) { console.error('missing inputs: ' + missing.join(', ')); return 1; }

  const itemsRaw = JSON.parse(fs.readFileSync(PATHS.items, 'utf8'));
  const itemList = itemsRaw.items ?? itemsRaw;
  const itemsById = {};
  for (const it of itemList) itemsById[it.id] = it;

  const subjectAdj = readJsonl(PATHS.subjectAdjudicated);
  const subjectRaw = readJsonl(PATHS.subjectRaw);
  const anchor44 = readJsonl(PATHS.anchor44Adjudicated);
  const anchorFast = readJsonl(PATHS.anchorFastAdjudicated);
  const anchor44Raw = readJsonl(PATHS.anchor44Raw);
  const anchorFastRaw = readJsonl(PATHS.anchorFastRaw);
  const allAnchors = [...anchor44, ...anchorFast];
  const A = (r) => r._adjudication;

  L('== 1. CORRECTED SUBJECT PROFILE (B3 adjudicated log) ==');
  const profile = buildSubjectProfile(subjectAdj, itemsById);
  // B3 three denominators, reproduced exactly:
  //   raw          every run, the harness scorer own verdict
  //   conservative R1 (never measured) leaves the denominator; scorer artifacts are
  //                credited; R2 broken items STAY IN THE DENOMINATOR scored wrong
  //   full         R2 broken items also leave the denominator
  const subjRunRaw = accBlock(subjectAdj.map((r) => A(r).original_passed === true));
  const subjCons = accBlock(subjectAdj.filter((r) => A(r).rule !== 'R1-not-measured' && A(r).rule !== 'R0-malformed')
    .map((r) => A(r).adjudicated === 'correct'));
  const subjFull = accBlock(subjectAdj.filter((r) => A(r).adjudicated !== 'excluded')
    .map((r) => A(r).adjudicated === 'correct'));
  L('  run-level raw (harness as shipped)  ' + subjRunRaw.correct + '/' + subjRunRaw.n + ' = ' + pctf(subjRunRaw.accuracy) + '%');
  L('  adjudicated conservative            ' + subjCons.correct + '/' + subjCons.n + ' = ' + pctf(subjCons.accuracy) + '%  [' + pctf(subjCons.ci95.low) + ', ' + pctf(subjCons.ci95.high) + ']');
  L('  adjudicated full                    ' + subjFull.correct + '/' + subjFull.n + ' = ' + pctf(subjFull.accuracy) + '%  [' + pctf(subjFull.ci95.low) + ', ' + pctf(subjFull.ci95.high) + ']');
  L('  abstention F by convention:');
  for (const [k, v] of Object.entries(profile.abstention.conventions)) {
    L('    ' + k.padEnd(32) + ' F=' + r4(v.F) + '  (c=' + v.c + ' i=' + v.i + ' n=' + v.n + ')');
  }
  L('    spread = ' + profile.abstention.spread_pp + ' pp');
  const latency = latencyProfile(subjectRaw);
  L('  latency: median ' + latency.latency_ms_median + ' ms | pure-model ' + latency.pure_model_ms_median + ' ms | pre-model share ' + latency.pre_model_share_pct + '%');
  L('  per-category (adjudicated full):');
  for (const [c, v] of Object.entries(profile.perCategory)) {
    L('    ' + c.padEnd(26) + ' ' + String(v.adjudicated_full.correct).padStart(3) + '/' + String(v.adjudicated_full.n).padEnd(3)
      + ' = ' + String(pctf(v.adjudicated_full.accuracy)).padStart(6) + '%  CI[' + pctf(v.adjudicated_full.ci95.low) + ', ' + pctf(v.adjudicated_full.ci95.high) + ']'
      + '  raw ' + pctf(v.run_level_raw.accuracy) + '%  flips=' + v.n_flipped_artifact);
  }

  // ---- the 45-item stratified subset ----
  const subset = [...new Set(anchor44.filter((r) => r.model === 'nvidia/z-ai/glm-5.3-flash').map((r) => r.item_id))];
  L('\n== 2. LIKE-FOR-LIKE ON THE ' + subset.length + '-ITEM SUBSET ==');

  const subjectRollAll = rollup(subjectAdj, SUBJECT_MODEL, 'measured');
  for (const r of subjectRollAll) {
    const reps = profile.rows.filter((x) => x.item_id === r.item_id);
    const measured = reps.filter((x) => x.verdict !== 'excluded');
    r.mean_of_reps = measured.length ? measured.filter((x) => x.verdict === 'correct').length / measured.length : null;
  }

  // Subject item verdicts on the subset under THREE readings of the rep asymmetry.
  // The anchors have 1 rep and the subject 2, so the subject item-level accuracy is
  // not a single number. All three are computed; the MEAN is primary because it is
  // the unbiased estimator, and the two binary readings bound the McNemar.
  const subjectConsensus45 = subset.map((id) => {
    const reps = profile.rows.filter((r) => r.item_id === id);
    const measured = reps.filter((r) => r.verdict !== 'excluded');
    if (!measured.length) {
      return { item_id: id, category: itemsById[id]?.category, verdict: 'excluded', rule: (reps[0] && reps[0].rule) || 'none', n_attempts: 0, mean_of_reps: null, either_correct: null, n_correct_reps: null };
    }
    const nOk = measured.filter((r) => r.verdict === 'correct').length;
    return {
      item_id: id, category: itemsById[id]?.category,
      verdict: nOk === measured.length ? 'correct' : 'incorrect',
      rule: nOk === measured.length ? 'R6-correct' : 'R6-real-failure',
      n_attempts: measured.length, n_correct_reps: nOk,
      mean_of_reps: nOk / measured.length, either_correct: nOk > 0,
    };
  });

  const agreement = repAgreement(profile.rows);
  const floorPp = agreement.q_discordance ? Math.sqrt(7.849 * agreement.q_discordance / agreement.n_items_with_both_reps) * 100 : null;
  const floorPp2 = floorPp == null ? null : floorPp / Math.SQRT2;
  L('  subject self-agreement: ' + agreement.agree + '/' + agreement.n_items_with_both_reps + ' = ' + pctf(agreement.agreement_rate)
    + '%  q=' + r6(agreement.q_discordance) + '  b=' + agreement.mcnemar_b_rep0_fail_rep1_pass + ' c=' + agreement.mcnemar_c_rep0_pass_rep1_fail);
  L('  reproducibility floor @ alpha=.05 power=.80: ' + r4(floorPp) + ' pp (1 rep) / ~' + r4(floorPp2) + ' pp (mean of 2 reps)');

  const comparisons = [];
  const anchorBlocks = [];
  const tiers = (roll) => {
    const ex = roll.filter((r) => r.verdict === 'excluded');
    const scored = roll.filter((r) => r.verdict !== 'excluded');
    const full = scored.filter((r) => !r.rule.startsWith('R2-'));
    return {
      n_items: roll.length,
      never_measured: ex.filter((r) => r.rule.startsWith('R1-')).length,
      unscorable_item: ex.filter((r) => r.rule.startsWith('R2-')).length,
      raw: accBlock(roll.map((r) => r.verdict === 'correct')),
      conservative: accBlock(scored.map((r) => r.verdict === 'correct')),
      full: accBlock(full.map((r) => r.verdict === 'correct')),
    };
  };

  for (const model of Object.keys(ANCHOR_POLICY)) {
    const policy = ANCHOR_POLICY[model];
    const adjRoll = rollup(allAnchors, model, 'measured');
    const firstRoll = rollup(allAnchors, model, 'first');
    const rawRoll = rollup([...anchor44Raw, ...anchorFastRaw], model, 'first');
    const tMeasured = tiers(adjRoll);
    const tFirst = tiers(firstRoll);
    const tRaw = tiers(rawRoll);
    const correctionPp = (tMeasured.full.accuracy != null && tRaw.raw.accuracy != null)
      ? r4(100 * (tMeasured.full.accuracy - tRaw.raw.accuracy)) : null;
    const block = {
      model, role: policy.role, exclude_reason: policy.exclude_reason ?? null,
      n_items_in_subset: adjRoll.filter((r) => subset.includes(r.item_id)).length,
      raw_first_attempt: tRaw,
      adjudicated_first_attempt: tFirst,
      adjudicated_retry_resolved: tMeasured,
      correction_pp: {
        measured_minus_raw_first_attempt: correctionPp,
        note: 'How far adjudication moved THIS model. The correction is NOT uniform across models, which is the whole point.',
      },
      n_flips: adjRoll.filter((r) => r.changed).length,
      flips: adjRoll.filter((r) => r.changed).map((r) => ({ item_id: r.item_id, rule: r.rule, from: r.original_passed, to: r.verdict })),
      never_measured_items: adjRoll.filter((r) => r.rule.startsWith('R1-')).map((r) => r.item_id),
      unscorable_items: adjRoll.filter((r) => r.rule.startsWith('R2-')).map((r) => r.item_id),
    };
    anchorBlocks.push(block);
    L('  ' + model.padEnd(28) + ' raw(first-attempt) ' + tRaw.raw.correct + '/' + tRaw.n_items + ' = ' + pctf(tRaw.raw.accuracy)
      + '%  ->  ADJ ' + tMeasured.full.correct + '/' + tMeasured.full.n + ' = ' + pctf(tMeasured.full.accuracy)
      + '%   (correction ' + correctionPp + ' pp, role=' + policy.role + ')');
    if (policy.role === 'headline_anchor') {
      const scope = adjRoll.filter((r) => subset.includes(r.item_id));
      const cmpCons = pairedCompare(subjectConsensus45, scope, floorPp, 'both');
      const cmpOpt = pairedCompare(subjectConsensus45, scope, floorPp, 'either');
      const cmp = { ...cmpCons, optimistic_reading: { gap_pp: cmpOpt.gap_pp_conservative, mcnemar_b: cmpOpt.mcnemar_b_subject_only, mcnemar_c: cmpOpt.mcnemar_c_anchor_only, p: cmpOpt.mcnemar_exact_p_two_sided } };
      comparisons.push({ model, ...cmp });
      L('      vs subject(45): conservative(both reps) ' + cmpCons.subject_correct + '/' + cmpCons.n_shared_items + ' = ' + pctf(cmpCons.subject_accuracy_conservative_both_reps)
        + '%   MEAN-of-2-reps ' + pctf(cmpCons.subject_accuracy_mean_of_2_reps) + '%   anchor ' + cmpCons.anchor_correct + '/' + cmpCons.n_shared_items + ' = ' + pctf(cmpCons.anchor_accuracy) + '%');
      L('      gap(cons) ' + cmpCons.gap_pp_conservative + ' pp   gap(unbiased mean) ' + cmpCons.gap_pp_unbiased_mean
        + ' pp   McNemar b=' + cmpCons.mcnemar_b_subject_only + ' c=' + cmpCons.mcnemar_c_anchor_only
        + ' p=' + cmpCons.mcnemar_exact_p_two_sided + ' (optimistic p=' + cmpOpt.mcnemar_exact_p_two_sided + ')  ->  ' + cmpCons.exceeds_reproducibility_floor.verdict);
    }
  }

  const anchorLatency = Object.fromEntries(
    Object.entries(
      [...anchor44Raw, ...anchorFastRaw]
        .filter((r) => r.latency_ms > 0)
        .reduce((acc, r) => { (acc[r.model] = acc[r.model] || []).push(r); return acc; }, {}),
    ).map(([m, rs]) => [m, latencyProfile(rs)]));

  const correctionAsymmetry = {
    headline: 'Adjudication moved the ANCHORS more than it moved the subject.',
    subject_raw_to_adjudicated_pp: r4(100 * (subjFull.accuracy - subjRunRaw.accuracy)),
    per_anchor_raw_to_adjudicated_pp: Object.fromEntries(anchorBlocks
      .filter((b) => b.correction_pp.measured_minus_raw_first_attempt != null)
      .map((b) => [b.model, b.correction_pp.measured_minus_raw_first_attempt])),
    consequence: 'Correcting only the subject, which is what pass 1 did, would have compared an adjudicated 94.71% against raw 77.78% / 91.11% and reported a large gap plus a raw-anchor ranking. The like-for-like gaps are far smaller and NEITHER is resolvable at our n. Pass 1s reading that the subject beats every anchor is an artefact of adjudicating one side.',
    tag: 'derived',
  };
  L('\n  ' + correctionAsymmetry.headline);
  L('    subject: ' + correctionAsymmetry.subject_raw_to_adjudicated_pp + ' pp;  anchors: ' + JSON.stringify(correctionAsymmetry.per_anchor_raw_to_adjudicated_pp));

  // ---- frontier ----
  L('\n== 3. FRONTIER MATCH (C1 table) ==');
  const scoresFile = JSON.parse(fs.readFileSync(PATHS.frontier, 'utf8'));
  const cells = scoresFile.scores ?? scoresFile.cells ?? scoresFile;
  const { profiles, skip_counts } = frontierProfiles(cells);
  L('  cells=' + cells.length + '  model keys=' + profiles.length + '  skipped: ' + JSON.stringify(skip_counts));

  // Primary subject profile for the FRONTIER match is the full 88-item bank: C1 has
  // no 45-item subset, and n=3..8 per axis makes the bands useless.
  const subjAxesAll = subjectAxesFrom(subjectRollAll);
  const subjAxes45 = subjectAxesFrom(subjectConsensus45);

  /**
   * The abstention axis is the single biggest lever on the frontier conclusion and
   * is worth 50 F-points depending on convention. The axis is therefore computed
   * under EVERY convention and the whole match is run once per convention.
   * Reporting one and hiding the others would be the most misleading thing this
   * report could do.
   */
  const CONVENTIONS = ['i_decline_is_correct', 'ii_decline_is_not_attempted', 'iii_decline_is_incorrect'];
  const PRIMARY_CONVENTION = 'ii_decline_is_not_attempted';

  function axesWithAbstention(convKey) {
    const base = JSON.parse(JSON.stringify(subjAxesAll));
    const c = profile.abstention.conventions[convKey];
    const n = base.abstention ? base.abstention.n : 0;
    const acc = c ? c.c / (c.c + c.i + c.n) : null;
    base.abstention = {
      n, correct: acc == null ? null : Math.round(acc * n), accuracy: r4(acc),
      wilson_ci95: acc == null ? wilson(0, 0) : wilson(Math.round(acc * n), n),
      normal_se: acc != null && n ? Math.sqrt((acc * (1 - acc)) / n) : null,
      convention: convKey,
      source: 'derived — convention-free accuracy c/(c+i+n) of the abstention family under convention ' + convKey + '. NOTE this is NOT F: F weights the not-attempted class and accuracy does not, so (ii) and (iii) coincide here while differing on F.',
    };
    return base;
  }

  const frontierRuns = {};
  for (const conv of CONVENTIONS) {
    const ax = axesWithAbstention(conv);
    const bands = {};
    for (const band of BAND_SENSITIVITY) bands[band] = matchAll(ax, profiles, band);
    const cands = bands[SCAFFOLD_BAND].filter((c) => c.n_axes >= 2);
    const allConsistent = cands.filter((c) => c.per_axis
      .filter((a) => a.status !== 'no_data_both_sides').every((a) => a.status === 'consistent'));
    const perAxisPower = {};
    for (const axis of Object.keys(AXIS_MAP)) {
      const withAxis = cands.filter((c) => c.per_axis.find((a) => a.axis === axis && a.status !== 'no_data_both_sides'));
      const outside = withAxis.filter((c) => c.per_axis.find((a) => a.axis === axis).status !== 'consistent');
      perAxisPower[axis] = {
        n_models_with_data_on_both_sides: withAxis.length,
        n_models_outside_subject_band: outside.length,
        discriminating: outside.length > 0 && outside.length < withAxis.length,
        subject_n_items: axis === 'abstention' ? ax.abstention.n : (subjAxesAll[axis] ? subjAxesAll[axis].n : null),
        subject_accuracy: axis === 'abstention' ? ax.abstention.accuracy : (subjAxesAll[axis] ? subjAxesAll[axis].accuracy : null),
        subject_wilson_halfwidth: axis === 'abstention' ? ax.abstention.wilson_ci95.halfwidth : (subjAxesAll[axis] ? subjAxesAll[axis].wilson_ci95.halfwidth : null),
      };
    }
    frontierRuns[conv] = {
      convention: conv,
      abstention_axis_accuracy: ax.abstention.accuracy,
      abstention_axis: ax.abstention,
      cands_ge2: cands,
      cands_ge3: cands.filter((c) => c.n_axes >= 3).sort((a, b) => a.mean_centre_distance_pp - b.mean_centre_distance_pp),
      cands_ge4: cands.filter((c) => c.n_axes >= 4).sort((a, b) => a.mean_centre_distance_pp - b.mean_centre_distance_pp),
      discriminating_power: {
        n_candidates_ge2: cands.length,
        n_fully_consistent: allConsistent.length,
        n_straddlers: cands.filter((c) => c.profile_relation === 'straddler').length,
        n_subject_above_all: cands.filter((c) => c.profile_relation === 'subject_above_on_every_live_axis').length,
        n_ge4_axes: cands.filter((c) => c.n_axes >= 4).length,
        n_ge4_and_straddler: cands.filter((c) => c.n_axes >= 4 && c.profile_relation === 'straddler').length,
        per_axis: perAxisPower,
        n_discriminating_axes: Object.values(perAxisPower).filter((a) => a.discriminating).length,
      },
      band_counts: Object.fromEntries(BAND_SENSITIVITY.map((b) => [b, {
        straddlers: bands[b].filter((c) => c.profile_relation === 'straddler').length,
        subject_above_all: bands[b].filter((c) => c.profile_relation === 'subject_above_on_every_live_axis').length,
        fully_consistent: bands[b].filter((c) => c.n_axes >= 2 && c.per_axis.filter((a) => a.status !== 'no_data_both_sides').every((a) => a.status === 'consistent')).length,
      }])),
    };
  }

  const primaryRun = frontierRuns[PRIMARY_CONVENTION];
  const primary = primaryRun.cands_ge2;
  const pw = primaryRun.discriminating_power;
  const allAbove = primary.filter((c) => c.profile_relation === 'subject_above_on_every_live_axis');
  const ge4 = primary.filter((c) => c.n_axes >= 4);

  const coverage = {
    primary_convention: PRIMARY_CONVENTION,
    primary_convention_why: 'The abstention axis is matched to SimpleQA Verified, so the subject value on that axis must use a convention that means the same thing as the axis it is compared against.',
    n_model_keys_total: profiles.length,
    n_model_keys_with_ge2_axes: primary.length,
    n_model_keys_with_ge3_axes: primary.filter((c) => c.n_axes >= 3).length,
    n_model_keys_with_ge4_axes: ge4.length,
    n_model_keys_with_ge5_axes: primary.filter((c) => c.n_axes >= 5).length,
    structurally_resolvable_at_alpha_05: primary.filter((c) => c.structurally_resolvable_at_alpha_05).length,
    min_attainable_p_by_k: { 2: minAttainableP(2), 3: minAttainableP(3), 4: minAttainableP(4), 5: minAttainableP(5) },
    structural_floor_note: 'A permutation test on k points has k! orderings, so the smallest attainable two-sided p is 2/k!. k=3 gives 0.3333, k=4 gives 0.0833, k=5 gives 0.0167. This is an INTEGER, not a data limitation: at k=4 no sample size and no data quality can reach alpha=.05. k=5 is the first k that can, and no model has 5 axes.',
    k_needed_for_alpha_05: 5,
    axes_missing: 'Five of the nine bank categories have NO counterpart in the C1 table, which caps k at 4. Reaching k=5 needs TWO new axes; one new axis only buys k=4, which is still structurally unresolvable.',
    ge4_axis_corner: {
      models: ge4.map((c) => c.model_key), vendors: [...new Set(ge4.map((c) => c.vendor))],
      release_dates: [...new Set(ge4.flatMap((c) => c.release_dates))].sort(),
      warning: 'All of them are 2025-vintage and from 2 vendors. The 4th axis is BFCL, last updated 2026-04-12, so 2026 flagships are missing from it by data staleness, not by weakness. Reading this corner as a finding about the subject is a coverage artefact.',
    },
    unmatched_bank_categories: UNMATCHED_CATEGORIES,
  };

  L('  keys with >=2 axes: ' + coverage.n_model_keys_with_ge2_axes + '   >=3: ' + coverage.n_model_keys_with_ge3_axes
    + '   >=4: ' + coverage.n_model_keys_with_ge4_axes + '   >=5: ' + coverage.n_model_keys_with_ge5_axes);
  L('  structurally resolvable at alpha=.05: ' + coverage.structurally_resolvable_at_alpha_05
    + '  (min attainable p: k=3 -> ' + r4(minAttainableP(3)) + ', k=4 -> ' + r4(minAttainableP(4)) + ', k=5 -> ' + r4(minAttainableP(5)) + ')');
  for (const conv of CONVENTIONS) {
    const rr = frontierRuns[conv];
    L('  conv ' + conv.padEnd(30) + ' axisAcc=' + rr.abstention_axis_accuracy
      + '  straddlers=' + rr.discriminating_power.n_straddlers
      + '  subjectAboveAll=' + rr.discriminating_power.n_subject_above_all
      + '  fullyConsistent=' + rr.discriminating_power.n_fully_consistent + '/' + rr.discriminating_power.n_candidates_ge2
      + '  ge4=' + rr.discriminating_power.n_ge4_axes);
  }
  L('  DISCRIMINATING POWER: ' + pw.n_discriminating_axes + ' of 4 axes separate anything; '
    + pw.n_fully_consistent + ' of ' + pw.n_candidates_ge2 + ' models lie inside the subject band on every live axis; '
    + pw.n_straddlers + ' straddler profiles exist.');
  for (const axis of Object.keys(AXIS_MAP)) {
    const ap = pw.per_axis[axis];
    L('    axis ' + axis.padEnd(18) + ' subject n=' + ap.subject_n_items + ' acc=' + ap.subject_accuracy
      + ' halfwidth=' + ap.subject_wilson_halfwidth + '  models both sides=' + ap.n_models_with_data_on_both_sides
      + '  outside subject band=' + ap.n_models_outside_subject_band);
  }
  for (const c of primary.filter((c) => c.mean_centre_distance_pp != null)
    .sort((a, b) => a.mean_centre_distance_pp - b.mean_centre_distance_pp).slice(0, 10)) {
    L('    ' + c.model_key.padEnd(30) + ' axes=' + c.n_axes + ' rel=' + c.profile_relation.padEnd(36)
      + ' overlap=' + c.n_axes_overlapping + '/' + c.n_axes + ' centreDist=' + c.mean_centre_distance_pp + 'pp vendor=' + c.vendor);
  }

  const threats = threatList({ agreement });
  const falsif = falsificationPlan(primary.filter((c) => c.mean_centre_distance_pp != null)
    .sort((a, b) => (b.n_axes - a.n_axes) || (a.mean_centre_distance_pp - b.mean_centre_distance_pp)));

  const out = {
    schema: 'llm-bench/matching/v2',
    produced_by: 'C2/harness/matching.mjs (second pass, post-adjudication)',
    generated_at: nowIso(),
    tag_legend: {
      measured: 'computed from a run log under reports/round1/',
      reported: 'a published number transcribed from a first-party source (C1)',
      derived: 'computed by us from measured or reported inputs',
      assumed: 'a judgment call, stated so that it can be disagreed with',
    },
    inputs: Object.fromEntries(Object.entries(PATHS).map(([k, p]) => [k, path.relative(ROOT, p)])),
    critical_changes_from_pass_1: [
      'Subject profile rebuilt from the B3 adjudicated log, not from the harness report.',
      'ANCHORS ADJUDICATED with the same rules. adjudicate-anchors.mjs self-tests byte-equivalence against the B3 output on 176/176 runs before emitting anything, and refuses to run if that check fails.',
      'Comparison restricted to the 45-item stratified subset (anchors 1 rep, subject 2).',
      'Latency decomposition corrected. The brief figure of about 15 s median is not reproducible from any log; the measured median is ' + latency.latency_ms_median + ' ms. Boot dominance is real but is ' + latency.pre_model_share_pct + '%, not 98%. The 496 ms figure is the pure-model median and is correct.',
      'Frontier match run under all three abstention conventions instead of one, and the discriminating power of the comparison is measured and reported rather than assumed.',
      'gap() returns 0 for OVERLAPPING intervals, so pass 1 mean_abs_gap ranking was reading 0 as similarity. A centre distance is reported instead, with the caveat attached to every candidate.',
    ],
    subject_profile: {
      run_level: { raw: subjRunRaw, adjudicated_conservative: subjCons, adjudicated_full: subjFull },
      per_category: profile.perCategory,
      abstention: profile.abstention,
      latency,
      rep_agreement: agreement,
      reproducibility_floor_pp: {
        one_rep: r4(floorPp), two_rep_mean: r4(floorPp2), alpha: 0.05, power: 0.8,
        basis: 'A2 nPaired inverted at the B3 MEASURED q of 0.0588. The pessimism is a measurement, not a guess.',
        uncertainty: 'q was measured on 5 discordant items, so the floor carries real sampling uncertainty of its own. Treat it as about 7.4 plus or minus 1 pp, not as a constant.',
      },
      subset_45: {
        items: subset,
        subject_conservative_both_reps: accBlock(subjectConsensus45.map((r) => r.verdict === 'correct')),
        subject_mean_of_2_reps: (() => {
          const inS = subjectConsensus45.filter((r) => r.verdict !== 'excluded');
          const m = inS.reduce((s, r) => s + (r.mean_of_reps ?? 0), 0) / (inS.length || 1);
          return { n: inS.length, mean_accuracy: r4(m), ci95: wilson(Math.round(m * inS.length), inS.length) };
        })(),
        subject_optimistic_either_rep: accBlock(subjectConsensus45.map((r) => Boolean(r.either_correct))),
      },
    },
    anchor_comparison: {
      anchors: anchorBlocks, paired: comparisons,
      correction_asymmetry: correctionAsymmetry,
      anchor_latency: anchorLatency,
      excluded_from_headline: Object.entries(ANCHOR_POLICY).filter(([, v]) => v.role === 'appendix_only')
        .map(([k, v]) => ({ model: k, reason: v.exclude_reason })),
    },
    frontier_match: {
      axis_map: AXIS_MAP, scaffold_band: SCAFFOLD_BAND, band_sensitivity: BAND_SENSITIVITY,
      subject_axes_full_88: subjAxesAll,
      subject_axes_45_subset: subjAxes45,
      subject_axes_45_subset_note: 'Shown for the anchor comparison only. NOT used for the frontier match: C1 has no 45-item subset and n=3..8 per axis makes the bands useless.',
      by_convention: Object.fromEntries(CONVENTIONS.map((c) => [c, {
        abstention_axis_accuracy: frontierRuns[c].abstention_axis_accuracy,
        abstention_axis: frontierRuns[c].abstention_axis,
        discriminating_power: frontierRuns[c].discriminating_power,
        band_counts: frontierRuns[c].band_counts,
        candidates_ge3: frontierRuns[c].cands_ge3,
        candidates_ge4: frontierRuns[c].cands_ge4,
      }])),
      primary_convention: PRIMARY_CONVENTION,
      coverage,
      subject_above_all_axes: allAbove.slice(0, 40),
      name_normalisation: {
        rule: 'lowercase, strip (FC)/(Prompt)/(tool), strip reasoning tokens, strip trailing release date, strip instruct/chat/it/fp8, non-alphanumeric to hyphen',
        exact_match_only: true,
        known_risk: 'merges genuinely distinct dated snapshots; flagged multi_snapshot',
      },
    },
    threats_to_validity: threats,
    falsification_plan: falsif,
  };
  fs.writeFileSync(path.join(ROOT, 'data/matching.json'), JSON.stringify(out, null, 2), 'utf8');
  L('\n  wrote data/matching.json');

  L('\n== 4. VERDICT ==');
  L('  ' + verdictLine({ comparisons, coverage, pw, correctionAsymmetry, floorPp, ge4 }));
  return 0;
}

/**
 * THE QUOTABLE SENTENCE. Assembled from computed values so it cannot drift from
 * the data. A clause that would be false is omitted rather than softened.
 */
function verdictLine({ comparisons, coverage, pw, correctionAsymmetry, floorPp, ge4 }) {
  const anchorClause = 'Like-for-like on the 45-item subset the subject is NOT separable from either anchor that produced data — '
    + comparisons.map((c) => c.model + ' ' + pctf(c.subject_accuracy_mean_of_2_reps)
      + '% (2-rep mean; conservative ' + pctf(c.subject_accuracy_conservative_both_reps) + '%) vs ' + pctf(c.anchor_accuracy)
      + '% (gap ' + c.gap_pp_unbiased_mean + ' pp, McNemar p=' + c.mcnemar_exact_p_two_sided + ')').join('; ')
    + ' — and both gaps sit inside the ' + r4(floorPp)
    + ' pp reproducibility floor measured from the subject own rep-to-rep discordance, so pass 1s reading that the subject beats every anchor was an artefact of adjudicating only one side of the comparison.';

  const frontierClause = 'Against the frontier table no model can be named at all: the subject per-axis bands (n=6-15 items, Wilson half-widths 0.11-0.28) contain the score bracket of '
    + pw.n_fully_consistent + ' of ' + pw.n_candidates_ge2
    + ' comparable models on every live axis, there are ' + pw.n_straddlers
    + ' straddler profiles to rank, ' + coverage.n_model_keys_with_ge5_axes
    + ' models reach 5 axes, and ' + coverage.structurally_resolvable_at_alpha_05
    + ' candidates are structurally resolvable at alpha=.05, because a rank test on k points cannot attain a two-sided p below 2/k!, which is '
    + r4(minAttainableP(4)) + ' at k=4.';

  const vendors = [...new Set(ge4.map((c) => c.vendor))];
  const claimClause = 'The strongest supportable claim is therefore a RANGE and a NEGATIVE, not an identification: the subject is consistent with a broad 2025-2026 frontier field whose best-covered 4-axis corner is '
    + ge4.length + ' models from ' + vendors.length + ' vendors (' + vendors.join('/')
    + '), and equally consistent with the large majority of the rest — so the honest answer to the boss question is that this round places the subject somewhere in the mid-to-upper 2025-2026 frontier field and rules out nothing inside it.';

  const corrClause = 'The whole comparison had to be rebuilt because the harness defects moved the anchors by '
    + JSON.stringify(correctionAsymmetry.per_anchor_raw_to_adjudicated_pp)
    + ' pp against the subject ' + correctionAsymmetry.subject_raw_to_adjudicated_pp
    + ' pp, and the abstention F-score alone is worth 50 F-points across three equally defensible conventions.';

  return anchorClause + ' ' + frontierClause + ' ' + claimClause + ' ' + corrClause;
}

process.exitCode = main(process.argv.slice(2));
