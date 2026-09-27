#!/usr/bin/env node
/**
 * adjudicate-rules.mjs — C2: B3's adjudication rule engine, extracted verbatim
 * so that the SAME rule set can be applied to the anchor logs.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The fairness requirement for this second pass: the anchors were scored 1 rep
 * and NOT adjudicated, while the subject was adjudicated. Comparing an
 * adjudicated subject against raw anchors would penalise the anchors for the
 * same two harness bugs (the no-digit lookahead in the abstention regex, and
 * the numeric scorer's "first number" extraction) that B3 found.
 *
 * Duplicating the rules would guarantee they drift. So the rules are extracted
 * from B3's `adjudicate.mjs` into one module, and `adjudicate-anchors.mjs`
 * asserts that this module reproduces B3's own `run-log.adjudicated.jsonl`
 * for the subject log **byte for byte**. That equivalence is a test, not a
 * claim: if the extraction drifts, the test fails.
 *
 * THE ONE DELIBERATE DIFFERENCE
 * -----------------------------
 * B3 hard-codes `SEMANTIC_JUDGMENTS` as a literal table keyed by `run_id`,
 * because B3 only ever adjudicated one log. Here the judgments are INJECTED —
 * they come from `data/adjudication-judgments.json`, which contains B3's six
 * original entries verbatim (same run_ids, same rule, same text) plus the
 * anchor entries C2 added. The strict gate — "a rule may not flip a run with no
 * documented reading, and a documented reading may not exist for a run no rule
 * flips" — is preserved exactly, and it is what forced me to actually read
 * every anchor answer I credited.
 *
 * Rules R0-R6 are reproduced from `harness/adjudicate.mjs` without change.
 * See that file's header for the protocol and the rationale per rule.
 */

// ===========================================================================
// TABLES (verbatim from adjudicate.mjs)
// ===========================================================================

/** R2: items whose own text does not determine the value being scored. */
export const UNRESOLVABLE_ITEMS = {
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
 *
 * NOTE (C2): the entries below are byte-identical to B3's literal. The anchor
 * entries live in `data/adjudication-judgments.json` and are merged in by
 * `loadJudgments()`, which fails loudly on a run_id collision with a differing
 * body — so "B3's table" and "the file" cannot silently diverge.
 */
export const SUBJECT_SEMANTIC_JUDGMENTS = {
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
      + 'information is available." Denies cost explicitly. Cites the four dates '
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

/** R4's abstention detector. Written independently of the item's own regex. */
export const ABSTENTION_MARKERS = [
  /\b(?:does\s*n[o']?t|do\s+not|does\s+not|never|no)\b[^.\n]{0,80}?\b(?:say|state|mention|specify|provide|record|give|name|list|indicate|report|contain|include|show|note|answer)\b/i,
  /\bno\s+(?:information|cost|price|data|figure|numbers?|count|detail|record|mention|amount|total|company|list|entry|value|times?|date|vendor|attendance|number\s+of)\b/i,
  /\b(?:is|are|was|were)\s+not\s+(?:stated|mentioned|specified|recorded|given|provided|addressed|available|listed|named|included|known|shown|present)\b/i,
  /\bnot\s+(?:stated|mentioned|specified|recorded|given|provided|addressed|available|listed|named|included|known|shown|present|determined)\b/i,
  /\bno\s+way\s+to\s+(?:tell|determine|know|find|establish)\b/i,
  /\bcan(?:not|'t|not)\s+be\s+(?:determined|answered|inferred|told|known|established|established\s+from)\b/i,
  /\bunable\s+to\s+(?:answer|determine|tell|know|find|establish)\b/i,
  /\bi\s+(?:do\s+not|don't)\s+know\b/i,
  /\binsufficient\s+information\b/i,
  /\bunknown\b/i,
  /\bthere\s+is\s+no\b/i,
  /\bno\s+such\b/i,
  /\bisn'?t\b[^.\n]{0,60}\b(?:in|anywhere)\s+(?:the\s+)?(?:passage|text|log|diary|notes|record)\b/i,
  /\b(?:passage|text|log|diary|notes|record)\b[^.\n]{0,60}\b(?:is\s+silent|remains\s+silent)\b/i,
];

/** Contamination boilerplate this session's own plugin conventions inject. */
export const CONTAMINATION_PATTERNS = [
  { id: 'memory-prologue-ko', re: /기억\s*확인\s*:/, note: 'Korean memory-core session-start boilerplate' },
  { id: 'memory-tool-name', re: /memory_search|memory_get|memory_write/, note: 'memory-core tool name leaked into the answer' },
  { id: 'radio-protocol', re: /AgentRadio|agent-shared-context|AGENTS\.md/, note: 'agent-radio / agent-shared-context protocol reference' },
];

// ===========================================================================
// helpers (verbatim)
// ===========================================================================

/** Standalone number token: not glued to another digit or a decimal point. */
export function hasStandaloneNumberToken(haystack, value) {
  const s = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(s)) return false;
  const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\d.])(${esc})(?![\\d.])`).test(haystack);
}

/** Reproduce scorers.mjs `extractNumber` — the "FIRST number" rule. */
export function extractNumberFirst(text) {
  const s = String(text ?? '').replace(/```[a-zA-Z0-9_+-]*[ \t]*\r?\n?/g, '').replace(/```/g, '');
  const frac = /(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(s);
  if (frac) { const d = Number(frac[2]); if (d !== 0) return Number(frac[1]) / d; }
  const m = /-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/.exec(s);
  if (!m) return null;
  const v = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
}

/** An abstention is semantic if it marks absence of information OR lack of ability. */
export function looksLikeAbstention(answer) {
  return ABSTENTION_MARKERS.some((re) => re.test(answer));
}

const ABSTENTION_PATTERN_SIGNATURES = [
  'insufficient\\s+information',
  "i\\s+(?:do\\s+not|don't)\\s+know",
  'no\\s+such\\s+',
  'no\\s+information\\s+(?:about|on|in|is\\s+given)',
  'unknown',
];
export function isAbstentionPattern(expected) {
  if (typeof expected !== 'string') return false;
  return ABSTENTION_PATTERN_SIGNATURES.filter((s) => expected.includes(s)).length >= 2;
}

export function contaminationHits(answer) {
  return CONTAMINATION_PATTERNS.filter((c) => c.re.test(answer)).map((c) => c.id);
}

// ===========================================================================
// THE RULES — verbatim from adjudicate.mjs
// ===========================================================================

/**
 * @param {object} rec        run record from the raw jsonl
 * @param {object} item       the item definition (or undefined if not found)
 * @returns {{verdict:'correct'|'incorrect'|'excluded', rule:string, why:string,
 *            original_passed:boolean|null, changed:boolean}}
 */
export function adjudicateRun(rec, item) {
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

/**
 * Merge the built-in subject table with an on-disk table. Fails loudly on a
 * run_id collision whose body differs, so the two sources cannot drift.
 */
export function loadJudgments(onDisk = {}) {
  const merged = { ...SUBJECT_SEMANTIC_JUDGMENTS };
  for (const [k, v] of Object.entries(onDisk)) {
    if (merged[k] && JSON.stringify(merged[k]) !== JSON.stringify(v)) {
      throw new Error(`adjudication-judgments.json conflicts with B3's table for run_id ${k}`);
    }
    merged[k] = v;
  }
  return merged;
}
