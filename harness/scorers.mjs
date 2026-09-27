/**
 * scorers.mjs — pure, deterministic, unit-testable answer scorers.
 *
 * CONTRACT (enforced by `score()`):
 *   - never throws; any internal error becomes {passed:false, detail:'scorer-error: …'}
 *   - returns {passed: boolean, detail: string}
 *   - no I/O, no clock, no randomness
 */

// ---------------------------------------------------------------------------
// normalization
// ---------------------------------------------------------------------------

/** Trim, strip markdown code fences, collapse all whitespace, NFC. */
export function normalizeText(s, { caseSensitive = false, stripMarkdown = true } = {}) {
  let t = typeof s === 'string' ? s : '';
  if (stripMarkdown) t = stripCodeFences(t);
  t = t.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!caseSensitive) t = t.toLowerCase();
  return t;
}

/**
 * Remove ``` fences, keeping the content. Handles a fence that wraps the whole
 * answer ("```json\n{…}\n```") and a fence embedded mid-answer.
 */
export function stripCodeFences(s) {
  return String(s ?? '')
    .replace(/```[a-zA-Z0-9_+-]*[ \t]*\r?\n?/g, '')
    .replace(/```/g, '');
}

/** Pull the first balanced JSON object/array out of messy text. */
export function extractJson(text) {
  const src = stripCodeFences(String(text ?? '')).trim();
  try {
    return { ok: true, value: JSON.parse(src) };
  } catch { /* fall through to scanning */ }
  for (const open of ['{', '[']) {
    const close = open === '{' ? '}' : ']';
    const start = src.indexOf(open);
    if (start === -1) continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try {
            return { ok: true, value: JSON.parse(src.slice(start, i + 1)) };
          } catch { break; }
        }
      }
    }
  }
  return { ok: false, value: null };
}

const ok = (detail) => ({ passed: true, detail });
const no = (detail) => ({ passed: false, detail });

// ---------------------------------------------------------------------------
// 1. exact_match
// ---------------------------------------------------------------------------

export function exactMatch(answer, expected, args = {}) {
  const { caseSensitive = false, ignorePunctuation = false, stripMarkdown = true } = args;
  const a = normalizeText(answer, { caseSensitive, stripMarkdown });
  let e = normalizeText(expected, { caseSensitive, stripMarkdown });
  if (ignorePunctuation) {
    // Must strip from BOTH sides: 'PING-OK.' and 'PING-OK' are the same answer.
    const p = (x) => x.replace(/[.,!?;:'"`]/g, '');
    const pa = p(a);
    return pa === p(e) ? ok('exact match (punctuation-insensitive)') : no(`normalized: ${JSON.stringify(trunc(pa))} != ${JSON.stringify(trunc(p(e)))}`);
  }
  return a === e ? ok('exact match') : no(`normalized: ${JSON.stringify(trunc(a))} != ${JSON.stringify(trunc(e))}`);
}

// ---------------------------------------------------------------------------
// 2. contains
// ---------------------------------------------------------------------------

export function contains(answer, needle, args = {}) {
  const { caseSensitive = false, all = false, ignoreDiacritics = false } = args;
  const needles = Array.isArray(needle) ? needle : [needle];
  if (needles.length === 0) return no('contains: empty needle list');
  const norm = (x) => {
    let v = normalizeText(x, { caseSensitive });
    if (ignoreDiacritics) v = v.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return v;
  };
  const a = norm(answer);
  const hits = needles.map((n) => ({ n, hit: a.includes(norm(n)) }));
  const pass = all ? hits.every((h) => h.hit) : hits.some((h) => h.hit);
  return pass ? ok(`contains ${all ? 'all' : 'any'} of ${needles.length}`) : no(`missing: ${hits.filter((h) => !h.hit).map((h) => JSON.stringify(trunc(h.n))).join(', ')}`);
}

// ---------------------------------------------------------------------------
// 3. regex
// ---------------------------------------------------------------------------

// Guard against catastrophic backtracking: refuse absurdly long subjects.
const MAX_REGEX_SUBJECT = 20_000;

export function regexMatch(answer, pattern, args = {}) {
  const { flags = '' } = args;
  if (typeof pattern !== 'string' || pattern === '') return no('regex: empty pattern');
  const a = stripCodeFences(String(answer ?? ''));
  if (a.length > MAX_REGEX_SUBJECT) return no(`regex: subject too long (${a.length} > ${MAX_REGEX_SUBJECT})`);
  const re = new RegExp(pattern, flags);
  const m = re.exec(a);
  return m ? ok(`regex matched: ${JSON.stringify(trunc(m[0]))}`) : no(`regex no match: /${pattern}/${flags}`);
}

// ---------------------------------------------------------------------------
// 4. json_schema (structural subset — NOT a JSON-Schema implementation)
// ---------------------------------------------------------------------------

/**
 * Supported schema keywords (documented in README):
 *   type: 'object'|'array'|'string'|'number'|'integer'|'boolean'|'null'
 *   required: string[]
 *   properties: { key: <schema> }
 *   items: <schema>
 *   enum: any[]
 *   additionalProperties: false        (rejects keys not in `properties`)
 *   minItems / maxItems: number
 * Returns a list of human-readable violations.
 */
export function validateStructure(value, schema, path = '$') {
  const errs = [];
  if (schema === true || schema === undefined) return errs;
  if (schema === false) return [`${path}: schema forbids any value`];
  if (typeof schema !== 'object' || schema === null) return errs;

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      errs.push(`${path}: expected type ${types.join('|')}, got ${describeType(value)}`);
      return errs; // further keyword checks would be noise
    }
  }
  if (schema.enum !== undefined && Array.isArray(schema.enum)) {
    if (!schema.enum.some((e) => deepEqual(e, value))) {
      errs.push(`${path}: ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`);
    }
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errs.push(`${path}: ${value} < minimum ${schema.minimum}`);
    if (typeof schema.maximum === 'number' && value > schema.maximum) errs.push(`${path}: ${value} > maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errs.push(`${path}: ${value.length} items < minItems ${schema.minItems}`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errs.push(`${path}: ${value.length} items > maxItems ${schema.maxItems}`);
    if (schema.items !== undefined) {
      value.forEach((v, i) => errs.push(...validateStructure(v, schema.items, `${path}[${i}]`)));
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errs.push(`${path}: missing required property "${key}"`);
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        errs.push(...validateStructure(value[key], sub, `${path}.${key}`));
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) errs.push(`${path}: additional property "${key}" not allowed`);
      }
    }
  }
  return errs;
}

export function jsonSchema(answer, schema, args = {}) {
  const { required = true, maxViolations = 4 } = args;
  const { ok: parsed, value } = extractJson(answer);
  if (!parsed) return no('json_schema: no parseable JSON found in answer');
  if (required === false) return ok('json_schema: parseable JSON (schema not enforced)');
  const errs = validateStructure(value, schema);
  if (errs.length === 0) return ok('json_schema: conforms');
  return no(`json_schema: ${errs.slice(0, maxViolations).join('; ')}${errs.length > maxViolations ? ` (+${errs.length - maxViolations} more)` : ''}`);
}

// ---------------------------------------------------------------------------
// 5. choice (multiple choice) — documented fallback chain
// ---------------------------------------------------------------------------

/**
 * Fallback chain for LETTER options (allowed = ['A','B','C']), tried in order;
 * the first that yields an allowed letter wins:
 *   1. explicit marker   `ANSWER: B` / `정답: B` / `답: B` / `Answer is (B)`
 *   2. boxed             `\boxed{B}`
 *   3. bold token        `**B**`
 *   4. bracketed letter  `(B)` / `[B]` as a standalone token
 *   5. bare letter       a single letter alone on a line
 *   6. last resort       the final standalone letter token in the answer
 * A candidate must be within the allowed set; otherwise the chain continues.
 * This chain deliberately cannot score multi-character options — see
 * `parseChoiceToken`, which the dispatcher uses when options are not all letters.
 */
const MARKER_WORD = '(?:ANSWER|Answer|answer|정답|답|回答|Respuesta)';
// A colon (or fullwidth colon / dash) after the marker word is the common case
// (`ANSWER: B`) and must be accepted, otherwise the canonical format silently
// falls through to a weaker fallback and reports the wrong provenance.
const MARKER_RES = [
  new RegExp(`(?:^|\\n)\\s*${MARKER_WORD}\\s*(?:는|은|is)?\\s*[:：\\-]?\\s*\\(?\\[?\\s*([A-Za-z])\\s*\\]?\\)?\\s*(?:$|\\n|[.,)])`),
  new RegExp(`${MARKER_WORD}\\s*(?:는|은|is)?\\s*[:：\\-]?\\s*\\(?\\[?\\s*([A-Za-z])\\s*\\]?\\)?`),
];

export function parseChoice(answer, allowed, args = {}) {
  const letters = (allowed ?? []).map((l) => String(l).trim()).filter(Boolean);
  const set = new Set(letters);
  const text = stripCodeFences(String(answer ?? ''));
  const accept = (ch) => {
    if (!ch) return null;
    const up = ch.toUpperCase();
    return set.has(up) ? up : null;
  };

  for (const re of MARKER_RES) {
    const m = re.exec(text);
    const got = accept(m?.[1]);
    if (got) return { letter: got, via: `marker(${re.source.slice(0, 24)}…)` };
  }
  {
    const m = /\\boxed\{\s*([A-Za-z])\s*\}/.exec(text);
    const got = accept(m?.[1]);
    if (got) return { letter: got, via: 'boxed' };
  }
  {
    // bold/boxed single letter standing alone, e.g. **B** or __B__
    const bold = /(?<![A-Za-z0-9])\*{1,2}([A-Za-z])\*{1,2}(?![A-Za-z0-9])/.exec(text);
    const got = accept(bold?.[1]);
    if (got) return { letter: got, via: 'bold-token' };
  }
  {
    const m = /(?<![A-Za-z0-9])[\[(]\s*([A-Za-z])\s*[\])](?![A-Za-z0-9])/.exec(text);
    const got = accept(m?.[1]);
    if (got) return { letter: got, via: 'bracketed' };
  }
  {
    const m = /(?:^|\n)\s*([A-Za-z])\s*(?:$|\n)/.exec(text);
    const got = accept(m?.[1]);
    if (got) return { letter: got, via: 'bare-line' };
  }
  {
    const all = [...text.matchAll(/(?<![A-Za-z0-9])([A-Za-z])(?![A-Za-z0-9])/g)].map((m) => accept(m[1])).filter(Boolean);
    if (all.length) return { letter: all[all.length - 1], via: 'last-standalone-letter' };
  }
  return { letter: null, via: 'none' };
}

/**
 * Fallback chain for MULTI-CHARACTER options (allowed = ['10:00','11:00',…]),
 * which the letter chain above cannot express:
 *   1. explicit marker   `ANSWER: 11:00` / `정답: 11:00`
 *   2. exact match       the whole normalised answer equals an option
 *   3. marked option     the option appears right after a marker word
 *   4. longest option    the longest option occurring anywhere in the answer
 * Longest-first ordering stops a short option from shadowing a more specific one.
 */
const TOKEN_MARKER_RE = /(?:ANSWER|Answer|answer|정답|답|回答|Respuesta)\s*(?:는|은|is)?\s*[:\-]?\s*([^\n]{1,40})/;

export function parseChoiceToken(answer, allowed) {
  const opts = (allowed ?? []).map((o) => String(o).trim()).filter(Boolean);
  if (opts.length === 0) return { value: null, via: 'none' };
  const norm = (s) => normalizeText(s, { caseSensitive: false });
  const text = stripCodeFences(String(answer ?? ''));
  const hit = (raw) => {
    const n = norm(raw);
    return opts.find((o) => norm(o) === n) ?? null;
  };

  {
    const m = TOKEN_MARKER_RE.exec(text);
    const got = m ? hit(m[1]) : null;
    if (got) return { value: got, via: 'token-marker' };
  }
  {
    const got = hit(text);
    if (got) return { value: got, via: 'token-exact' };
  }
  {
    const n = norm(text);
    for (const o of [...opts].sort((a, b) => b.length - a.length)) {
      if (n.includes(norm(o))) return { value: o, via: 'token-contains' };
    }
  }
  return { value: null, via: 'none' };
}

export function choice(answer, expected, args = {}) {
  const { allowed = null, caseSensitive = false } = args;
  const exp = String(expected ?? '').trim().toUpperCase();
  const allowedSet = allowed ?? (exp && /^[A-Za-z]$/.test(exp) ? [exp] : null);
  const opts = allowedSet ?? exp;

  // All-letter options use the letter chain; anything else uses the token chain.
  const allLetters = opts.every((o) => /^[A-Za-z]$/.test(String(o).trim()));
  let value; let via;
  if (allLetters) {
    const r = parseChoice(answer, opts, { caseSensitive });
    value = r.letter; via = r.via;
  } else {
    const r = parseChoiceToken(answer, opts);
    value = r.value; via = r.via;
  }

  if (value === null) return no(`choice: no option extracted (allowed=${JSON.stringify(opts)})`);
  if (String(value).toUpperCase() === exp) return ok(`choice ${value} via ${via}`);
  return no(`choice ${value} != ${exp} (via ${via})`);
}

// ---------------------------------------------------------------------------
// 6. numeric (tolerance)
// ---------------------------------------------------------------------------

/** First number in the text, tolerating thousands separators, %, currency, and `a/b`. */
export function extractNumber(text) {
  const s = stripCodeFences(String(text ?? ''));
  const frac = /(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(s);
  if (frac) {
    const d = Number(frac[2]);
    if (d !== 0) return Number(frac[1]) / d;
  }
  const m = /-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/.exec(s);
  if (!m) return null;
  const v = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
}

export function numeric(answer, expected, args = {}) {
  const { absTol = 0, relTol = 0, fromLastLine = false } = args;
  const subject = fromLastLine ? String(answer ?? '').trim().split('\n').slice(-1)[0] : answer;
  const a = extractNumber(subject);
  const e = Number(typeof expected === 'number' ? expected : extractNumber(expected));
  if (a === null) return no(`numeric: no number in answer ${JSON.stringify(trunc(answer))}`);
  if (!Number.isFinite(e)) return no(`numeric: expected not numeric: ${JSON.stringify(trunc(expected))}`);
  const diff = Math.abs(a - e);
  const pass = diff <= absTol || (relTol > 0 && diff <= relTol * Math.abs(e));
  return pass
    ? ok(`numeric ${a} ~= ${e} (|d|=${diff.toPrecision(3)})`)
    : no(`numeric ${a} != ${e} (|d|=${diff.toPrecision(3)}, absTol=${absTol}, relTol=${relTol})`);
}

// ---------------------------------------------------------------------------
// 7. multi_all_of
// ---------------------------------------------------------------------------

export function multiAllOf(answer, expected, args = {}) {
  const { caseSensitive = false, normalize = true } = args;
  const parts = (Array.isArray(expected) ? expected : [expected]).map((x) => String(x)).filter((x) => x !== '');
  if (parts.length === 0) return no('multi_all_of: empty requirement list');
  const a = normalize ? normalizeText(answer, { caseSensitive }) : String(answer ?? '');
  const missing = parts.filter((p) => !a.includes(normalize ? normalizeText(p, { caseSensitive }) : p));
  return missing.length === 0
    ? ok(`multi_all_of: all ${parts.length} present`)
    : no(`multi_all_of: missing ${missing.map((m) => JSON.stringify(trunc(m))).join(', ')}`);
}

// ---------------------------------------------------------------------------
// 8. custom_fn registry
// ---------------------------------------------------------------------------

const registry = new Map();

/** Register an escape-hatch scorer. fn(answer, expected, args, ctx) -> {passed, detail} */
export function registerScorer(name, fn) {
  if (typeof name !== 'string' || name === '') throw new TypeError('registerScorer: name required');
  if (typeof fn !== 'function') throw new TypeError(`registerScorer(${name}): fn must be a function`);
  registry.set(name, fn);
}

export function unregisterScorer(name) { return registry.delete(name); }
export function listScorers() { return [...registry.keys()]; }

function customFn(answer, expected, args, ctx) {
  const name = args.name ?? args.fn ?? expected;
  const fn = registry.get(String(name));
  if (!fn) return no(`custom_fn: no scorer registered under "${name}" (have: ${listScorers().join(', ') || 'none'})`);
  const r = fn(answer, expected, args, ctx);
  if (!r || typeof r.passed !== 'boolean') return no(`custom_fn "${name}": must return {passed:boolean, detail:string}`);
  return { passed: r.passed, detail: String(r.detail ?? '') };
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

const TABLE = {
  exact_match: (a, e, x) => exactMatch(a, e, x),
  contains: (a, e, x) => contains(a, e, x),
  regex: (a, e, x) => regexMatch(a, e, x),
  json_schema: (a, e, x) => jsonSchema(a, e, x),
  choice: (a, e, x) => choice(a, e, x),
  numeric: (a, e, x) => numeric(a, e, x),
  multi_all_of: (a, e, x) => multiAllOf(a, e, x),
  custom_fn: (a, e, x, c) => customFn(a, e, x, c),
};

export const SCORER_NAMES = Object.keys(TABLE);

/**
 * Score one answer. **Never throws.**
 * @param {string} answer
 * @param {string|number|any[]|object} expected
 * @param {string} scorerName
 * @param {object} [args]
 * @param {object} [ctx] passed through to custom_fn
 */
export function score(answer, expected, scorerName, args = {}, ctx = {}) {
  const name = String(scorerName ?? '');
  const fn = TABLE[name];
  if (!fn) return no(`unknown scorer "${name}" (known: ${SCORER_NAMES.join(', ')})`);
  try {
    const r = fn(answer, expected, args ?? {}, ctx);
    if (!r || typeof r.passed !== 'boolean') return no(`scorer "${name}" returned a malformed result`);
    return { passed: r.passed, detail: String(r.detail ?? '') };
  } catch (err) {
    return no(`scorer-error in "${name}": ${err?.message ?? String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function trunc(s, n = 120) {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function describeType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function matchesType(v, t) {
  switch (t) {
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
    case 'array': return Array.isArray(v);
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'integer': return typeof v === 'number' && Number.isInteger(v);
    case 'boolean': return typeof v === 'boolean';
    case 'null': return v === null;
    default: return false;
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  if (typeof a === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}
