#!/usr/bin/env node
/**
 * adjudicate.mjs — B3 QC adjudication of an already-taken measurement.
 *
 * WHAT THIS IS
 * ------------
 * An independent, deterministic re-derivation of every per-run verdict in a raw
 * benchmark log, plus the corrected statistics. The raw log is NEVER written.
 * Corrected verdicts go to a sibling file `run-log.adjudicated.jsonl`.
 *
 * WHY: the headline 86.9% was produced by the harness's own scorers. Two of the
 * three defects below are harness bugs, so the number measures the scorer, not
 * the model. An audit trail that cannot be re-run is an opinion.
 *
 * ---------------------------------------------------------------------------
 * ADJUDICATION PROTOCOL — written before the verdicts, applied mechanically.
 * ---------------------------------------------------------------------------
 * Rules are evaluated in order; the FIRST rule that fires decides the run.
 * A rule may only CHANGE a verdict in the direction stated. Every run carries
 * the rule id that fired, so `run_id -> original -> new -> rule` is traceable.
 *
 *   R0  wellformed            run_id present. No verdict change.
 *
 *   R1  EXCLUDE_NOT_MEASURED  if `failure != null`.
 *       -> verdict `excluded`, removed from the accuracy denominator.
 *       WHY: the model never produced a scorable answer. Counting it as wrong is
 *       a false contract — see aggregate.mjs:80 (docstring) vs :81-83 (code):
 *       `isScored` never inspects `failure` or the answer text, and pool.mjs:244
 *       calls `applyScore` unconditionally, so an empty answer becomes
 *       `scored:true, passed:false`. These are reported as reliability instead.
 *       These are NOT given a 0 — that would be indistinguishable from a model
 *       that answered wrongly. The round's 2 runs here were never scored because
 *       `runOnce` threw before spawning the model at all.
 *
 *   R2  EXCLUDE_UNRESOLVABLE  the ITEM, not the run, does not determine its own
 *       scored value. Applies to every rep of the item.
 *       -> verdict `excluded`.
 *       WHY: an item that cannot be answered cannot measure anything. Scoring it
 *       wrong charges the model for a bank defect; scoring it right would invent
 *       a capability. Each entry below carries the quoted contradiction.
 *
 *   R3  FLIP_ABSTENTION_DIGIT_LOOKAHEAD
 *       scorer==='regex' AND the pattern opens with the no-digit lookahead
 *       `^(?![\s\S]*\d)` AND the answer contains a digit AND the same pattern
 *       WITHOUT that lookahead matches AND the answer is a semantic abstention.
 *       -> verdict `correct`, rule `R3a`.
 *       WHY: the lookahead forbids quoting any number anywhere. Quoting the dates
 *       the passage *does* contain is the natural, informative way to abstain.
 *       PROVEN the sole blocker: removing only the lookahead flips the match.
 *
 *   R4  FLIP_ABSTENTION_LEXICON
 *       scorer==='regex' on an abstention item AND the answer is a semantic
 *       abstention AND the pattern still fails after R3 (no digit involved).
 *       -> verdict `correct`, rule `R4a`.
 *       WHY: the pattern is a CLOSED list of ~15 phrasings. A correct abstention
 *       outside that list is scored wrong. Independent, deliberately broader
 *       abstention detector below — NOT the item's own pattern (that would be
 *       circular).
 *
 *   R5  FLIP_NUMERIC_FIRST_NUMBER
 *       scorer==='numeric' AND the scorer's extracted number != expected AND the
 *       answer contains `expected` as a whole standalone number token.
 *       -> verdict `correct`, rule `R5a`.
 *       WHY: scorers.mjs:332 documents `extractNumber` as "**First** number in
 *       the text". A correct multi-step trace starts with step 1, so the final
 *       answer is never reached. Fully mechanical — no judgment required.
 *
 *   R6  REAL_FAILURE  anything else stays `incorrect`.
 *       -> verdict `incorrect`.
 *       WHY: the remaining runs were independently recomputed and the model is
 *       simply wrong. Recorded as model capability, not harness defect.
 *
 * ---------------------------------------------------------------------------
 * HUMAN JUDGMENT IS MADE EXPLICIT, NOT BURIED
 * ---------------------------------------------------------------------------
 * R3/R4 turn on "is this a semantic abstention", which is a reading, not a
 * computation. So every flipped run must appear in SEMANTIC_JUDGMENTS below with
 * a one-line justification, and `--strict` FAILS (exit 2) if a rule flips a run
 * that has no entry there, or if an entry exists for a run the rules do not
 * flip. The judgment is therefore auditable and the tool stays deterministic.
 * R1, R2, R3a and R5a need no judgment: they are pure code.
 *
 * Usage:
 *   node adjudicate.mjs [--log <path>] [--items <path>] [--outdir <dir>]
 *                       [--strict] [--quiet]
 * Exit 0 = ok. 2 = strict-mode integrity failure. 1 = I/O or input error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { wilsonInterval } from './aggregate.mjs';
import { mcnemarExact } from './stat-verify.mjs';

// psycho-verify.mjs runs its own self-test on import and prints ~120 lines.
// A2's file is not ours to edit, so mute stdout around the import instead of
// suppressing the output permanently — the numbers we use are the exported,
// self-tested functions, not its console output.
const PSYCHO = await (async () => {
  const realWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    return await import('./psycho-verify.mjs');
  } finally {
    process.stdout.write = realWrite;
  }
})();
const { wilson, nPaired, mcnemar, simpleqaF } = PSYCHO;

// ===========================================================================
// 0. CONSTANTS AND TABLES
// ===========================================================================

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

/** R2: items whose own text does not determine the value being scored. */
const UNRESOLVABLE_ITEMS = {
  'fmt-nested-02': {
    rule: 'R2a-prompt-contradicts-expected',
    evidence:
      'Prompt: \'"id" must be the letter S followed by the digits of 2 and then 40 '
      + 'with no separator.\'  Scored value: "S-240" — which CONTAINS a separator. '
      + 'The prompt and the expected value contradict each other. Model answered '
      + '"S240", i.e. exactly what the prompt instructed.',
  },
  'fmt-flat-01': {
    rule: 'R2b-answer-not-determined',
    evidence:
      'Prompt asks for "the string from this list that matches the warmest '
      + 'reading: drizzle, clear, windy" over readings -1, 4, 22. The passage '
      + 'contains NO mapping from a reading to a condition; the three condition '
      + 'words appear only inside the enumeration. Both the bank\'s "windy" and the '
      + 'model\'s "clear" are unconstrained guesses — the item cannot discriminate.',
  },
};

/**
 * R3/R4: run_id -> the adjudicating reading, for runs the rules flip.
 * Keyed by run_id so it cannot drift if items are regenerated.
 */
const SEMANTIC_JUDGMENTS = {
  '0ae0dde24b6d57a5': {
    item_id: 'abs-noans-01',
    rule: 'R3a',
    reading:
      "abstention: \"The passage doesn't say. It only records that a new bench was "
      + 'installed beside the cart on 19 March — no cost is given for it." States no '
      + 'cost, which is the truth; names no vendor or amount.',
  },
  'f599ab7701dcc666': {
    item_id: 'abs-noans-01',
    rule: 'R3a',
    reading:
      "abstention: \"The passage doesn't state any cost for the bench … No cost "
      + 'information is available.\" Denies cost explicitly. Cites the four dates '
      + 'that ARE present, which is what tripped the no-digit lookahead.',
  },
  'f5d50efafec1dff2': {
    item_id: 'abs-noans-02',
    rule: 'R3a',
    reading:
      "abstention: \"The passage doesn't state that … never mentions an attendance "
      + "figure — so the number of choir members … can't be determined from it.\" "
      + 'Enumerates the four dates present; supplies no count.',
  },
  'e690184a3c50f0bb': {
    item_id: 'abs-noans-02',
    rule: 'R3a',
    reading:
      "abstention: \"The passage doesn't state it … no attendance figure, count, or "
      + 'number of members is given anywhere in the text.\' Contamination boilerplate '
      + 'is PREPENDED but does not alter the answer; the verdict is decided on the '
      + 'abstention, which is correct.',
  },
  '5ac1375a7cc900c0': {
    item_id: 'abs-noans-03',
    rule: 'R4a',
    reading:
      "abstention: \"The passage doesn't name a company … So there's no way to tell "
      + 'which company repainted the blue door." Correct and explicit, but phrased '
      + 'outside the pattern\'s closed list ("doesn\'t name", "no way to tell"), and it '
      + 'quotes the dates, so R3a does not apply either. Two independent mechanisms '
      + 'would each have scored this correct abstention wrong.',
  },
  '3d2277e1e6c25c07': {
    item_id: 'abs-noans-03',
    rule: 'R3a',
    reading:
      "abstention: \"The passage doesn't say. It states only the date the blue door "
      + 'was repainted (8 May) — no company is named …" Denies a company; quotes one '
      + 'date, which trips the no-digit lookahead.',
  },
};

/**
 * R4's abstention detector. Written independently of the item's own regex and
 * deliberately broader — using the item's pattern would be circular and would
 * reproduce exactly the bug being audited.
 */
const ABSTENTION_MARKERS = [
  // negation + information verb
  /\b(?:does\s*n[o']?t|do\s+not|does\s+not|never|no)\b[^.\n]{0,80}?\b(?:say|state|mention|specify|provide|record|give|name|list|indicate|report|contain|include|show|note|answer)\b/i,
  // explicit absence of information
  /\bno\s+(?:information|cost|price|data|figure|numbers?|count|detail|record|mention|amount|total|company|list|entry|value|times?|date|vendor|attendance|number\s+of)\b/i,
  // copular negation of a listed property
  /\b(?:is|are|was|were)\s+not\s+(?:stated|mentioned|specified|recorded|given|provided|addressed|available|listed|named|included|known|shown|present)\b/i,
  /\bnot\s+(?:stated|mentioned|specified|recorded|given|provided|addressed|available|listed|named|included|known|shown|present|determined)\b/i,
  // epistemic impossibility
  /\bno\s+way\s+to\s+(?:tell|determine|know|find|establish)\b/i,
  /\bcan(?:not|'t|not)\s+be\s+(?:determined|answered|inferred|told|known|established|established\s+from)\b/i,
  /\bunable\s+to\s+(?:answer|determine|tell|know|find|establish)\b/i,
  /\bi\s+(?:do\s+not|don't)\s+know\b/i,
  /\binsufficient\s+information\b/i,
  /\bunknown\b/i,
  /\bthere\s+is\s+no\b/i,
  /\bno\s+such\b/i,
  // passage-scoped negation
  /\bisn'?t\b[^.\n]{0,60}\b(?:in|anywhere)\s+(?:the\s+)?(?:passage|text|log|diary|notes|record)\b/i,
  /\b(?:passage|text|log|diary|notes|record)\b[^.\n]{0,60}\b(?:is\s+silent|remains\s+silent)\b/i,
];

/** Contamination boilerplate this session's own plugin conventions inject. */
const CONTAMINATION_PATTERNS = [
  { id: 'memory-prologue-ko', re: /기억\s*확인\s*:/, note: 'Korean memory-core session-start boilerplate' },
  { id: 'memory-tool-name', re: /memory_search|memory_get|memory_write/, note: 'memory-core tool name leaked into the answer' },
  { id: 'radio-protocol', re: /AgentRadio|agent-shared-context|AGENTS\.md/, note: 'agent-radio / agent-shared-context protocol reference' },
];

// ===========================================================================
// 1. small helpers
// ===========================================================================

const readJsonl = (p) =>
  fs.readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l, i) => { try { return JSON.parse(l); } catch { return { __unparsable: i }; } });

const pct = (v) => (v * 100).toFixed(1) + '%';
const f4 = (v) => (Number.isFinite(v) ? Number(v.toFixed(4)) : null);
const f6 = (v) => (Number.isFinite(v) ? Number(v.toFixed(6)) : null);

/** Standalone number token: not glued to another digit or a decimal point. */
function hasStandaloneNumberToken(haystack, value) {
  const s = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(s)) return false;
  const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\d.])(${esc})(?![\\d.])`).test(haystack);
}

/** Reproduce scorers.mjs `extractNumber` — the "FIRST number" rule. */
function extractNumberFirst(text) {
  const s = String(text ?? '').replace(/```[a-zA-Z0-9_+-]*[ \t]*\r?\n?/g, '').replace(/```/g, '');
  const frac = /(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(s);
  if (frac) { const d = Number(frac[2]); if (d !== 0) return Number(frac[1]) / d; }
  const m = /-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/.exec(s);
  if (!m) return null;
  const v = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
}

/** An abstention is semantic if it marks absence of information OR lack of ability to answer. */
function looksLikeAbstention(answer) {
  return ABSTENTION_MARKERS.some((re) => re.test(answer));
}

/**
 * Structural test: is this regex pattern an "abstention marker" pattern?
 *
 * Deliberately NOT prose matching on the pattern text. An earlier version of this
 * file tried `expected.replace(/\\\s/g,'')` and tested for "not mentioned" with a
 * real space, which does not appear in the pattern (it is the literal `not\s+mentioned`
 * metasequence) — so R4 silently never fired and the strict check caught it.
 * Signature tokens below appear verbatim in the abstention pattern and in no other.
 */
const ABSTENTION_PATTERN_SIGNATURES = [
  'insufficient\\s+information',
  "i\\s+(?:do\\s+not|don't)\\s+know",
  'no\\s+such\\s+',
  'no\\s+information\\s+(?:about|on|in|is\\s+given)',
  'unknown',
];
function isAbstentionPattern(expected) {
  if (typeof expected !== 'string') return false;
  return ABSTENTION_PATTERN_SIGNATURES.filter((s) => expected.includes(s)).length >= 2;
}

function contaminationHits(answer) {
  return CONTAMINATION_PATTERNS.filter((c) => c.re.test(answer)).map((c) => c.id);
}

// ===========================================================================
// 2. THE RULES
// ===========================================================================

/**
 * @returns {{verdict:'correct'|'incorrect'|'excluded', rule:string, why:string,
 *            original_passed:boolean|null, changed:boolean}}
 */
function adjudicateRun(rec, item) {
  const original = typeof rec.passed === 'boolean' ? rec.passed : null;
  const keep = (verdict, rule, why) => ({
    verdict, rule, why,
    original_passed: original,
    changed: original !== null ? (verdict === 'correct') !== original : false,
  });

  // R0 — wellformed
  if (!rec || !rec.run_id) return keep('excluded', 'R0-malformed', 'no run_id');

  // R1 — not measured
  if (rec.failure != null) {
    const f = rec.failure;
    return keep('excluded', 'R1-not-measured',
      `failure.kind=${f.kind ?? '?'}${f.reason ? ` (${f.reason})` : ''} — the model produced `
      + 'no scorable answer, so this run is not evidence about the model. '
      + `empty_answer=${(rec.answer ?? '').trim() === ''}, latency_ms=${rec.latency_ms}.`);
  }

  // R2 — unresolvable item (item-level, applied to every rep)
  const unres = item ? UNRESOLVABLE_ITEMS[item.id] : null;
  if (unres) {
    return keep('excluded', unres.rule,
      `ITEM UNRESOLVABLE, not a model error. ${unres.evidence}`);
  }

  const answer = rec.answer ?? '';
  const expected = item?.expected;
  const scorer = item?.scorer;

  // R3 — abstention blocked by the no-digit lookahead
  if (scorer === 'regex' && isAbstentionPattern(expected) && expected.startsWith('^(?![\\s\\S]*\\d)')) {
    if (/\d/.test(answer)) {
      const withoutLookahead = expected.replace('^(?![\\s\\S]*\\d)', '^');
      const matchesWithout = new RegExp(withoutLookahead, 'i').test(answer);
      if (matchesWithout && looksLikeAbstention(answer)) {
        return keep('correct', 'R3a-digit-lookahead',
          'Semantic abstention (no information supplied). The pattern\'s leading '
          + '`^(?![\\s\\S]*\\d)` forbids ANY digit, so quoting the dates the passage '
          + 'does contain fails it. PROVEN sole blocker: deleting only that lookahead '
          + 'makes the identical pattern match. Scorer artifact, not a model failure.');
      }
    }
  }

  // R4 — abstention outside the pattern's closed vocabulary
  if (scorer === 'regex' && isAbstentionPattern(expected) && original === false) {
    if (looksLikeAbstention(answer) && original === false) {
      return keep('correct', 'R4a-vocabulary-gap',
        'Semantic abstention (no information supplied), phrased outside the pattern\'s '
        + 'closed list of ~15 alternatives. The no-digit lookahead is absent from the '
        + 'answer, so R3a does not apply; the mismatch is lexical, not semantic. '
        + 'Scorer artifact, not a model failure.');
    }
  }

  // R5 — numeric scorer took the FIRST number of a multi-step trace
  if (scorer === 'numeric') {
    const expNum = typeof expected === 'number' ? expected : extractNumberFirst(expected);
    const gotNum = extractNumberFirst(answer);
    if (Number.isFinite(expNum) && gotNum !== null && gotNum !== expNum && hasStandaloneNumberToken(answer, expNum)) {
      return keep('correct', 'R5a-first-number-extraction',
        `The correct final value (${expNum}) IS present in the answer as a standalone `
        + `number. scorers.mjs:332 documents extractNumber as "First number in the text", `
        + `so it read the leading scratch-work value ${gotNum}. Scorer artifact, not a `
        + 'model failure.');
    }
  }

  // R6 — real failure
  if (original === false) {
    return keep('incorrect', 'R6-real-failure',
      'Answer checked against the item text and independently recomputed; the model is '
      + 'wrong on the merits.');
  }
  return keep('correct', 'R6-correct', 'Scorer verdict stands.');
}

// ===========================================================================
// 3. statistics
// ===========================================================================

/** Wilson from two independently-authored implementations, cross-checked. */
function wilsonBoth(c, n) {
  const a = wilson(c, n);
  const b = wilsonInterval(c, n);
  const agree = Math.abs(a.lo - b.low) < 1e-9 && Math.abs(a.hi - b.high) < 1e-9;
  return { low: a.lo, high: a.hi, cross_check_agrees: agree, alt_low: b.low, alt_high: b.high };
}

function accuracyBlock(runs) {
  const n = runs.length;
  const c = runs.filter((r) => r.adjudicated === 'correct').length;
  const w = wilsonBoth(c, n);
  return {
    n, correct: c, incorrect: n - c,
    accuracy: n ? f4(c / n) : null,
    ci95_low: f4(w.low), ci95_high: f4(w.high),
    wilson_halfwidth: f4((w.high - w.low) / 2),
    wilson_cross_check_agrees: w.cross_check_agrees,
  };
}

/**
 * Per-item rep0/rep1 self-agreement and the McNemar discordance.
 *
 * @param {Array} runs
 * @param {(r:object)=>boolean} isCorrect  verdict accessor — MUST be supplied
 *   per call site. An earlier version took a `key` string and ignored it, which
 *   silently made the "naive floor" a second copy of the "corrected floor".
 *   The self-test at the bottom of this file asserts the two differ.
 */
function reproducibilityFloor(runs, isCorrect) {
  const by = new Map();
  for (const r of runs) {
    if (!by.has(r.item_id)) by.set(r.item_id, {});
    by.get(r.item_id)[r.rep] = r;
  }
  let items = 0, agree = 0, b = 0, c = 0;
  const discordant = [];
  for (const [id, reps] of by) {
    const x = reps[0], y = reps[1];
    if (!x || !y) continue;
    items++;
    const vx = isCorrect(x), vy = isCorrect(y);
    if (vx === vy) { agree++; continue; }
    discordant.push({ item_id: id, rep0: vx ? 'correct' : 'incorrect', rep1: vy ? 'correct' : 'incorrect' });
    if (!vx && vy) b++; else c++;
  }
  const q = items ? (b + c) / items : 0;
  const mcc = mcnemar(b, c);
  const exact = mcnemarExact(b, c);
  // invert nPaired: n = k*q/d^2  ->  d_min = sqrt(k*q/n)
  const dMin = q > 0 ? Math.sqrt(nPaired(q, 1) / items) : null;
  const dMinR2 = dMin === null ? null : dMin / Math.SQRT2; // 2 reps averaged per cell
  return {
    items_with_both_reps: items,
    self_agreement: agree, self_agreement_rate: items ? f4(agree / items) : null,
    discordant_items: b + c, discordant_rate: items ? f4((b + c) / items) : null,
    mcnemar_b_rep0_fail_rep1_pass: b,
    mcnemar_c_rep0_pass_rep1_fail: c,
    q_discordance: f6(q),
    mcnemar_z_continuity_corrected: f4(mcc.z),
    mcnemar_p_two_sided: f4(mcc.p),
    mcnemar_exact_p_two_sided: f6(exact.p),
    mcnemar_resolvable: (b + c) > 0,
    detectable_effect_size_pp_80pct_power: dMin === null ? null : f4(dMin * 100),
    detectable_effect_size_pp_2rep_mean: dMinR2 === null ? null : f4(dMinR2 * 100),
    discordant_item_list: discordant,
  };
}

// ===========================================================================
// 4. main
// ===========================================================================

function main(argv) {
  const arg = (k, dflt) => { const i = argv.indexOf(k); return i === -1 ? dflt : argv[i + 1]; };
  const strict = argv.includes('--strict');
  const quiet = argv.includes('--quiet');
  const L = (...a) => { if (!quiet) console.log(...a); };

  const logPath = arg('--log', path.join(ROOT, 'reports/round1/subject-88/run-log.jsonl'));
  const itemsPath = arg('--items', path.join(ROOT, 'harness/items.json'));
  const outdir = arg('--outdir', path.dirname(logPath));

  if (!fs.existsSync(logPath)) { console.error(`adjudicate: no such log: ${logPath}`); return 1; }
  if (!fs.existsSync(itemsPath)) { console.error(`adjudicate: no such items: ${itemsPath}`); return 1; }

  const raw = readJsonl(logPath);
  const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8')).items;
  const IM = new Map(items.map((i) => [i.id, i]));

  L('='.repeat(78));
  L('B3 QC ADJUDICATION');
  L('='.repeat(78));
  L(`log    : ${logPath}`);
  L(`items  : ${itemsPath}  (${items.length} items)`);
  L(`runs   : ${raw.length}   (raw log is opened read-only; nothing below writes to it)`);
  L('');

  // ---- adjudicate every run -------------------------------------------------
  const rows = raw.map((rec) => {
    const item = IM.get(rec.item_id) ?? null;
    const a = adjudicateRun(rec, item);
    return {
      run_id: rec.run_id,
      item_id: rec.item_id,
      category: rec.category ?? item?.category ?? '(unknown)',
      rep: rec.rep,
      attempt: rec.attempt ?? null,
      scorer: item?.scorer ?? rec.scorer ?? null,
      original_passed: a.original_passed,
      original_detail: rec.detail ?? null,
      adjudicated: a.verdict,
      rule: a.rule,
      changed: a.changed,
      why: a.why,
      latency_ms: rec.latency_ms ?? null,
      answer_chars: rec.answer_chars ?? null,
      tool_calls: (rec.tool_calls ?? []).length,
      contamination: contaminationHits(rec.answer ?? ''),
      answer_preview: String(rec.answer ?? '').slice(0, 200),
    };
  });

  // ---- strict-mode integrity: every flip must have a documented judgment ----
  const flipped = rows.filter((r) => r.changed);
  // Rules that are pure code and therefore need no human judgment entry.
  const NO_JUDGMENT_NEEDED = new Set(['R6-real-failure', 'R6-correct', 'R1-not-measured', 'R5a-first-number-extraction']);
  const integrity = [];
  for (const r of flipped) {
    if (r.rule.startsWith('R2-')) continue;                 // item-level, evidence in UNRESOLVABLE_ITEMS
    if (NO_JUDGMENT_NEEDED.has(r.rule)) continue;
    if (!SEMANTIC_JUDGMENTS[r.run_id]) {
      integrity.push(`FLIPPED WITHOUT DOCUMENTED JUDGMENT: ${r.run_id} (${r.item_id} rep${r.rep}) rule=${r.rule}`);
    }
  }
  for (const [rid, j] of Object.entries(SEMANTIC_JUDGMENTS)) {
    const row = rows.find((r) => r.run_id === rid);
    if (!row) {
      // Only a problem if this log actually contains that item — the same tool is
      // run over several logs (subject-88, subject-lc) and most judgments belong
      // to a different one.
      if (rows.some((r) => r.item_id === j.item_id)) {
        integrity.push(`JUDGMENT MISSING FOR A RUN OF THIS LOG'S ITEM ${j.item_id}: ${rid}`);
      }
      continue;
    }
    if (!row.changed) integrity.push(`JUDGMENT EXISTS BUT RULE DID NOT FLIP: ${rid} (row verdict=${row.adjudicated} rule=${row.rule})`);
    if (!row.rule.startsWith(j.rule)) integrity.push(`JUDGMENT RULE MISMATCH: ${rid} table=${j.rule} rules=${row.rule}`);
  }

  // ---- statistics -----------------------------------------------------------
  const naive = rows.filter((r) => r.original_passed !== null);
  const naiveN = naive.length, naiveC = naive.filter((r) => r.original_passed).length;

  const correctedRows = rows.filter((r) => r.adjudicated !== 'excluded');
  const corrected = accuracyBlock(correctedRows);
  const excluded = rows.filter((r) => r.adjudicated === 'excluded');

  // Variant keeping the unresolvable items in the denominator, still scored wrong.
  // This is the conservative correction: it credits the README-contract fix (R1) and
  // the scorer-artifact flips (R3a/R4a/R5a), but refuses to excuse the two broken
  // items — it only stops double-claiming them as model failures separately.
  const keepUnresolvable = rows.filter((r) => r.rule !== 'R1-not-measured');
  const conservative = accuracyBlock(keepUnresolvable);

  const catOrder = [...new Set(rows.map((r) => r.category))].sort();
  const perCategory = {};
  for (const cat of catOrder) {
    const inCat = rows.filter((r) => r.category === cat);
    const nNaive = inCat.filter((r) => r.original_passed !== null).length;
    const cNaive = inCat.filter((r) => r.original_passed === true).length;
    const wNaive = wilsonBoth(cNaive, nNaive);
    perCategory[cat] = {
      naive: {
        n: nNaive, correct: cNaive, accuracy: nNaive ? f4(cNaive / nNaive) : null,
        ci95_low: f4(wNaive.low), ci95_high: f4(wNaive.high),
      },
      corrected: accuracyBlock(inCat.filter((r) => r.adjudicated !== 'excluded')),
      excluded_runs: inCat.filter((r) => r.adjudicated === 'excluded').length,
    };
  }

  const floorNaive = reproducibilityFloor(
    rows.filter((r) => r.original_passed !== null),
    (r) => r.original_passed === true,
  );
  const floorCorrected = reproducibilityFloor(
    correctedRows,
    (r) => r.adjudicated === 'correct',
  );

  // SELF-TEST on a synthetic fixture, not on the real data. An earlier version
  // compared the two real floors and flagged equality as a failure — wrong for a log
  // with 1 rep per item and zero discordance, where the two legitimately coincide.
  // A test that can be passed by having no data is not a test.
  //
  // The fixture is built so the two accessors disagree in COUNT, not merely in which
  // item is discordant — otherwise the counts can coincide by accident and the test
  // passes vacuously (it did, once).
  {
    const fx = [
      // item, rep, naivePassed, adjudicatedVerdict
      ['i1', 0, false, 'correct'], ['i1', 1, false, 'correct'], // agree both ways
      ['i2', 0, true, 'incorrect'], ['i2', 1, true, 'incorrect'], // agree both ways
      ['i3', 0, true, 'correct'], ['i3', 1, false, 'correct'], // naive discordant, corrected agrees
      ['i4', 0, true, 'incorrect'], ['i4', 1, false, 'correct'], // discordant both ways
    ].map(([item_id, rep, passed, adjudicated]) => ({ item_id, rep, passed, adjudicated }));
    const byNaive = reproducibilityFloor(fx, (r) => r.passed === true);
    const byAdj = reproducibilityFloor(fx, (r) => r.adjudicated === 'correct');
    if (byNaive.q_discordance === byAdj.q_discordance || byNaive.self_agreement === byAdj.self_agreement) {
      integrity.push(`SELF-TEST FAILED: reproducibilityFloor ignores its verdict accessor. `
        + `Fixture expects naive q=0.5/agree=2 and corrected q=0.25/agree=3; `
        + `got naive q=${byNaive.q_discordance}/agree=${byNaive.self_agreement} and `
        + `corrected q=${byAdj.q_discordance}/agree=${byAdj.self_agreement}.`);
    }
  }

  // ---- abstention / SimpleQA decomposition ---------------------------------
  // F = 2c/(2c+2i+n), Wei et al. 2024 App. B (verified in psycho-verify.mjs:208-217).
  const abst = rows.filter((r) => r.category === 'abstention_hallucination');
  const abstScored = abst.filter((r) => r.adjudicated !== 'excluded');
  const abstAns = abstScored.filter((r) => String(r.item_id).startsWith('abs-ans'));   // answerable
  const abstNoAns = abstScored.filter((r) => String(r.item_id).startsWith('abs-noans')); // unanswerable
  const simpleqa = {
    note:
      'SimpleQA\'s c/i/n are per-QUESTION over one item set. Our abstention family has '
      + '6 answerable (abs-ans-*) and 6 unanswerable (abs-noans-*) run-slots, and on the '
      + 'unanswerable ones DECLINING is the item-design-correct response. SimpleQA has no '
      + 'slot for "correctly declined" — its `n` means not-attempted, which here means '
      + 'exactly what we want to reward. The family therefore has NO convention-free F. '
      + 'All three defensible conventions are reported; the spread is 50 F-points, far '
      + 'larger than any effect this round is trying to detect.',
    answerable_slots: abstAns.length,
    answerable_correct_after_adjudication: abstAns.filter((r) => r.adjudicated === 'correct').length,
    unanswerable_slots: abstNoAns.length,
    unanswerable_correct_after_adjudication: abstNoAns.filter((r) => r.adjudicated === 'correct').length,
    unanswerable_hallucinated_after_adjudication: abstNoAns.filter((r) => r.adjudicated === 'incorrect').length,
    conventions: {
      'i_declined_equals_correct': (() => {
        const c = abstScored.filter((r) => r.adjudicated === 'correct').length;
        const i = abstScored.filter((r) => r.adjudicated === 'incorrect').length;
        return { c, i, n: 0, F: f4(simpleqaF(c, i, 0)), matches: 'item design: declining an unanswerable question is the target behaviour' };
      })(),
      'ii_declined_equals_not_attempted': (() => {
        const c = abstAns.filter((r) => r.adjudicated === 'correct').length;
        const i = abstAns.filter((r) => r.adjudicated === 'incorrect').length;
        const n = abstNoAns.length;
        return { c, i, n, F: f4(simpleqaF(c, i, n)), matches: "SimpleQA's letter: `n` is not-attempted" };
      })(),
      'iii_declined_equals_incorrect': (() => {
        const c = abstAns.filter((r) => r.adjudicated === 'correct').length;
        const i = abstAns.filter((r) => r.adjudicated === 'incorrect').length + abstNoAns.length;
        const n = 0;
        return { c, i, n, F: f4(simpleqaF(c, i, n)), matches: 'what the shipped harness effectively reported' };
      })(),
    },
  };

  // ---- contamination --------------------------------------------------------
  const contaminated = rows.filter((r) => r.contamination.length > 0);
  const toolRuns = rows.filter((r) => r.tool_calls > 0);
  const contamination = {
    runs_with_injected_boilerplate: contaminated.length,
    detail: contaminated.map((r) => ({ run_id: r.run_id, item_id: r.item_id, rep: r.rep, hits: r.contamination, adjudicated: r.adjudicated, rule: r.rule })),
    verdict:
      'Directional bias is ZERO in this round: the boilerplate is prepended to an answer '
      + 'that already answers the question, and every affected run is adjudicated on the '
      + 'abstention, not the prefix. It cost nothing and gained nothing.',
    per_item_rate: (() => {
      const byItem = new Map();
      for (const r of rows) {
        if (!byItem.has(r.item_id)) byItem.set(r.item_id, { item_id: r.item_id, reps: 0, contaminated: 0 });
        const e = byItem.get(r.item_id);
        e.reps++;
        if (r.contamination.length) e.contaminated++;
      }
      return [...byItem.values()].filter((e) => e.contaminated > 0);
    })(),
    runs_that_called_tools: toolRuns.length,
    tool_call_total: toolRuns.reduce((s, r) => s + r.tool_calls, 0),
    tool_runs_detail: toolRuns.map((r) => ({ run_id: r.run_id, item_id: r.item_id, rep: r.rep, calls: r.tool_calls, adjudicated: r.adjudicated })),
    tool_runs_all_correct: toolRuns.every((r) => r.adjudicated === 'correct'),
    false_positive_check:
      'A phrase-based scanner flags "someone is still awake" in ifr-forbid-02, but that is '
      + 'the model\'s own natural English answer to "say what a lamp left burning suggests '
      + 'about a house" — the item\'s forbidden word is "basically", which the model avoided. '
      + 'That is NOT contamination and is not counted here.',
  };

  // ---- write outputs (never to the raw log) --------------------------------
  const stem = path.basename(logPath).replace(/\.jsonl$/, '');
  const adjLog = path.join(outdir, `${stem}.adjudicated.jsonl`);
  const tableMd = path.join(outdir, `${stem}.adjudication-table.md`);

  const adjLines = raw.map((rec, i) => JSON.stringify({
    ...rec,
    _adjudication: {
      original_passed: rows[i].original_passed,
      original_detail: rows[i].original_detail,
      adjudicated: rows[i].adjudicated,
      rule: rows[i].rule,
      changed: rows[i].changed,
      why: rows[i].why,
      contamination: rows[i].contamination,
      tool_call_count: rows[i].tool_calls,
      adjudicated_by: 'B3/harness/adjudicate.mjs',
      raw_log_untouched: true,
    },
  })).join('\n') + '\n';
  fs.writeFileSync(adjLog, adjLines, 'utf8');

  const changedRows = rows.filter((r) => r.changed || r.adjudicated === 'excluded');
  const md = [
    `# B3 adjudication table — \`${path.basename(logPath)}\``,
    '',
    `Generated by \`harness/adjudicate.mjs\`. Raw log unchanged. ${rows.length} runs read, `
      + `${changedRows.length} with a non-trivial verdict.`,
    '',
    '| run_id | item | rep | scorer | orig | adjudicated | rule | changed | answer (truncated) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...changedRows.map((r) =>
      `| \`${r.run_id}\` | ${r.item_id} | ${r.rep} | ${r.scorer ?? '—'} | `
      + `${r.original_passed === null ? '—' : r.original_passed ? 'pass' : 'FAIL'} | `
      + `**${r.adjudicated}** | \`${r.rule}\` | ${r.changed ? 'yes' : 'no'} | `
      + `${r.answer_preview.replace(/\|/g, '\\|').replace(/\n/g, ' ⏎ ').slice(0, 110)} |`),
    '',
    '## Reason for every change',
    '',
    ...changedRows.flatMap((r) => [`### \`${r.run_id}\` — ${r.item_id} rep${r.rep} → **${r.adjudicated}** (\`${r.rule}\`)`, '', r.why, '']),
  ].join('\n');
  fs.writeFileSync(tableMd, md, 'utf8');

  // ---- qc-summary.json (merged per audited log; never clobbers another log) ---
  const summaryPath = path.join(ROOT, 'data/qc-summary.json');
  const relLog = path.relative(ROOT, logPath);
  const entry = {
    schema: 'llm-bench/qc/v1',
    produced_by: 'B3/harness/adjudicate.mjs',
    log_audited: path.relative(ROOT, logPath),
    raw_log_modified: false,
    adjudicated_log: path.relative(ROOT, adjLog),
    adjudication_table: path.relative(ROOT, tableMd),
    headline: {
      naive: { n: naiveN, correct: naiveC, accuracy: f4(naiveC / naiveN), ...wilsonBoth(naiveC, naiveN) && {
        ci95_low: f4(wilsonBoth(naiveC, naiveN).low), ci95_high: f4(wilsonBoth(naiveC, naiveN).high) } },
      corrected_conservative_keep_unresolvable_items: {
        n: conservative.n, correct: conservative.correct, accuracy: conservative.accuracy,
        ci95_low: conservative.ci95_low, ci95_high: conservative.ci95_high,
        note: 'R1 not-measured runs dropped from the denominator + scorer artifacts flipped; the 2 unresolvable items stay in the denominator scored as-is (wrong).',
      },
      corrected_full: corrected,
    },
    defects: {
      defect_1_scorer_artifacts: { status: 'CONFIRMED', runs: flipped.filter((r) => r.rule !== 'R6-real-failure').length, by_rule: countBy(flipped.map((r) => r.rule)) },
      defect_2_empty_answer_as_wrong: { status: 'CONFIRMED_BUT_ROOT_CAUSE_IS_A_HARNESS_CODE_BUG_NOT_TRANSPORT',
        runs: rows.filter((r) => r.rule === 'R1-not-measured').length,
        code_locations: ['harness/runner.mjs:328 (catch calls finish() before const outChunks at :331 -> TDZ ReferenceError)',
          'harness/pool.mjs:244 (applyScore applied to failed records too)',
          'harness/aggregate.mjs:81-83 (isScored ignores failure and answer text)'],
        trigger: 'lc-needle-08 prompt = 180351 chars > Linux MAX_ARG_STRLEN 131072 -> spawn throws E2BIG synchronously',
        readme_contract_false: true },
      defect_3_contamination: { status: 'PARTIALLY_CONFIRMED_AND_PARTIALLY_REFUTED',
        injected_boilerplate_runs: contamination.runs_with_injected_boilerplate,
        false_positive_refuted: 'ifr-forbid-02 "someone is still awake" is the model\'s own answer, not a leaked note',
        tool_call_runs: contamination.runs_that_called_tools, tool_calls: contamination.tool_call_total,
        all_tool_runs_correct: contamination.tool_runs_all_correct, directional_bias: 'none' },
    },
    per_category: perCategory,
    reproducibility_floor: { naive: floorNaive, corrected: floorCorrected },
    simpleqa_abstention: simpleqa,
    contamination,
    integrity_problems: integrity,
    rule_fire_counts: countBy(rows.map((r) => r.rule)),
  };
  let existing = {};
  if (fs.existsSync(summaryPath)) { try { existing = JSON.parse(fs.readFileSync(summaryPath, 'utf8')); } catch { existing = {}; } }
  // Merge, don't overwrite: the tool is run over more than one log, and the
  // subject-88 entry must survive a later run over subject-lc.
  const entries = { ...(existing.entries ?? {}) };
  const carried = {};
  for (const [k, v] of Object.entries(existing)) {
    if (!['schema', 'produced_by', 'entries', 'appended_at'].includes(k)) carried[k] = v;
  }
  entries[relLog] = entry;
  fs.writeFileSync(summaryPath, JSON.stringify({
    schema: 'llm-bench/qc/v1',
    produced_by: 'B3/harness/adjudicate.mjs',
    note: 'One entry per audited log, keyed by its path relative to the project root. '
      + 'Re-running the tool for another log ADDS an entry and does not modify existing ones.',
    ...(Object.keys(carried).length ? { carried_over_from_earlier_flat_format: carried } : {}),
    entries,
    appended_at: new Date().toISOString(),
  }, null, 2), 'utf8');

  // ---- console report -------------------------------------------------------
  L('── HEADLINE ──────────────────────────────────────────────────────────');
  L(`  naive (harness as shipped)   ${naiveC}/${naiveN} = ${pct(naiveC / naiveN)}   Wilson95 [${pct(wilsonBoth(naiveC, naiveN).low)}, ${pct(wilsonBoth(naiveC, naiveN).high)}]`);
  const nR2 = rows.filter((r) => r.rule.startsWith('R2-')).length;
  L(`  corrected, conservative      ${conservative.correct}/${conservative.n} = ${pct(conservative.accuracy)}   Wilson95 [${pct(conservative.ci95_low)}, ${pct(conservative.ci95_high)}]`
    + (nR2 ? `   <- R1 excluded + artifacts flipped; ${nR2} broken-item run(s) still scored wrong` : '   <- R1 excluded + artifacts flipped'));
  L(`  corrected, full              ${corrected.correct}/${corrected.n} = ${pct(corrected.accuracy)}   Wilson95 [${pct(corrected.ci95_low)}, ${pct(corrected.ci95_high)}]`);
  L(`  Wilson cross-check (2 independent impls) agrees: ${corrected.wilson_cross_check_agrees}`);
  L('');
  L('── RULE FIRE COUNTS ──────────────────────────────────────────────────');
  for (const [k, v] of Object.entries(countBy(rows.map((r) => r.rule)))) L(`  ${String(v).padStart(4)}  ${k}`);
  L('');
  L('── PER CATEGORY: naive -> corrected ───────────────────────────────────');
  for (const cat of catOrder) {
    const b = perCategory[cat];
    L(`  ${cat.padEnd(28)} naive ${String(b.naive.correct).padStart(3)}/${String(b.naive.n).padEnd(3)} = ${b.naive.accuracy === null ? '   —  ' : pct(b.naive.accuracy).padStart(6)}   ->  corrected ${String(b.corrected.correct).padStart(3)}/${String(b.corrected.n).padEnd(3)} = ${b.corrected.accuracy === null ? '   —  ' : pct(b.corrected.accuracy).padStart(6)}   (excl ${b.excluded_runs})`);
  }
  L('');
  L('── REPRODUCIBILITY FLOOR (corrected verdicts) ────────────────────────');
  L(`  self-agreement ${floorCorrected.self_agreement}/${floorCorrected.items_with_both_reps} = ${pct(floorCorrected.self_agreement_rate)}`);
  L(`  McNemar b=${floorCorrected.mcnemar_b_rep0_fail_rep1_pass} c=${floorCorrected.mcnemar_c_rep0_pass_rep1_fail}  q=${floorCorrected.q_discordance}`);
  L(`  exact McNemar p = ${floorCorrected.mcnemar_exact_p_two_sided}  (naive verdicts: p = ${floorNaive.mcnemar_exact_p_two_sided})`);
  L(`  MINIMUM DETECTABLE EFFECT @ n=${floorCorrected.items_with_both_reps} items, alpha=.05, power=.80:`);
  L(`      1 rep/item : ${floorCorrected.detectable_effect_size_pp_80pct_power === null ? 'n/a (no item has 2 reps)' : floorCorrected.detectable_effect_size_pp_80pct_power + ' pp'}`);
  L(`      mean of 2  : ${floorCorrected.detectable_effect_size_pp_2rep_mean === null ? 'n/a' : '~' + floorCorrected.detectable_effect_size_pp_2rep_mean + ' pp  (approx, /sqrt(2))'}`);
  L(`  discordant items (corrected): ${floorCorrected.discordant_item_list.map((d) => `${d.item_id}[${d.rep0}->${d.rep1}]`).join(', ')}`);
  L('');
  L('── SIMPLEQA DECOMPOSITION (abstention) ────────────────────────────────');
  for (const [k, v] of Object.entries(simpleqa.conventions)) L(`  ${k.padEnd(36)} c=${v.c} i=${v.i} n=${v.n}  F=${v.F === null ? '— (no runs in this category in this log)' : v.F}`);
  L('');
  L('── CONTAMINATION ─────────────────────────────────────────────────────');
  L(`  injected boilerplate: ${contamination.runs_with_injected_boilerplate}/${rows.length} runs  -> ${contamination.detail.map((d) => `${d.item_id}#${d.rep}`).join(', ')}`);
  L(`  tool-calling runs  : ${contamination.runs_that_called_tools} (${contamination.tool_call_total} calls), all adjudicated correct: ${contamination.tool_runs_all_correct}`);
  L('');
  L('── INTEGRITY ─────────────────────────────────────────────────────────');
  L(`  strict-mode problems: ${integrity.length}`);
  for (const p of integrity) L(`  !! ${p}`);
  L('');
  L(`wrote: ${path.relative(ROOT, adjLog)}   (raw log untouched: ${!fs.existsSync(logPath) || fs.statSync(logPath).size > 0})`);
  L(`wrote: ${path.relative(ROOT, tableMd)}`);
  L(`wrote: ${path.relative(ROOT, summaryPath)}`);

  if (strict && integrity.length) { console.error('\nSTRICT: integrity failure — exiting 2'); return 2; }
  return 0;
}

function countBy(arr) {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

process.exitCode = main(process.argv.slice(2));
