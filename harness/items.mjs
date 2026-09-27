/**
 * items.mjs — item bank loading + schema validation.
 *
 * Accepted shapes (both are valid; a bare array is shorthand for {items:[…]}):
 *   [ {id, category, prompt, scorer, …}, … ]
 *   { "version": 1, "items": [ … ], "meta": { … } }
 */
import fs from 'node:fs';

export const CATEGORIES = [
  'reasoning', 'instruction', 'math', 'code', 'format', 'factoid', 'multilingual', 'agentic',
];

/** Scorers understood by scorers.mjs. `custom_fn` needs a registered function. */
export const ITEM_SCORERS = [
  'exact_match', 'choice', 'numeric', 'json_schema', 'multi_all_of', 'regex', 'contains', 'custom_fn',
];

const REQUIRED = ['id', 'prompt', 'scorer'];

/**
 * @returns {{items: object[], errors: string[], meta: object}}
 * `items` contains only the entries that are usable; `errors` explains the rest.
 * Validation never throws.
 */
export function validateItems(bank) {
  const errors = [];
  let raw = [];
  let meta = {};

  if (Array.isArray(bank)) raw = bank;
  else if (bank && typeof bank === 'object' && Array.isArray(bank.items)) {
    raw = bank.items;
    meta = typeof bank.meta === 'object' && bank.meta !== null ? bank.meta : {};
  } else {
    return { items: [], meta: {}, errors: ['item bank must be an array of items, or an object with an `items` array'] };
  }

  const items = [];
  const seenIds = new Set();

  raw.forEach((it, idx) => {
    const where = `items[${idx}]`;
    if (!it || typeof it !== 'object' || Array.isArray(it)) {
      errors.push(`${where}: not an object`);
      return;
    }
    for (const k of REQUIRED) {
      if (it[k] === undefined || it[k] === null || (typeof it[k] === 'string' && it[k].trim() === '')) {
        errors.push(`${where}: missing required field "${k}"`);
      }
    }
    if (it.id !== undefined && typeof it.id !== 'string') errors.push(`${where}: "id" must be a string`);
    if (it.id !== undefined && seenIds.has(it.id)) errors.push(`${where}: duplicate id "${it.id}"`);
    if (typeof it.id === 'string') seenIds.add(it.id);
    if (it.prompt !== undefined && typeof it.prompt !== 'string') errors.push(`${where}: "prompt" must be a string`);
    if (it.system !== undefined && typeof it.system !== 'string') errors.push(`${where}: "system" must be a string`);
    if (it.scorer !== undefined && !ITEM_SCORERS.includes(it.scorer)) {
      errors.push(`${where}: unknown scorer "${it.scorer}" (known: ${ITEM_SCORERS.join(', ')})`);
    }
    if (it.category !== undefined && typeof it.category !== 'string') {
      errors.push(`${where}: "category" must be a string`);
    }
    if (it.scorer_args !== undefined && (typeof it.scorer_args !== 'object' || it.scorer_args === null || Array.isArray(it.scorer_args))) {
      errors.push(`${where}: "scorer_args" must be an object`);
    }
    // `expected` is required by every scorer except custom_fn (which gets it as a free arg).
    if (it.expected === undefined && it.scorer !== 'custom_fn') {
      errors.push(`${where}: "expected" is required for scorer "${it.scorer}"`);
    }
    if (it.scorer === 'regex' && typeof it.expected !== 'string' && typeof it.scorer_args?.pattern !== 'string') {
      errors.push(`${where}: regex scorer needs "expected" (the pattern) or scorer_args.pattern`);
    }
    if (it.scorer === 'json_schema' && (typeof it.scorer_args?.schema !== 'object' || it.scorer_args?.schema === null)) {
      errors.push(`${where}: json_schema scorer needs scorer_args.schema (an object)`);
    }
    if (it.scorer === 'choice' && it.scorer_args?.allowed === undefined && !/^[A-Za-z]$/.test(String(it.expected ?? ''))) {
      errors.push(`${where}: choice scorer needs a single-letter "expected" or scorer_args.allowed`);
    }
    if (Object.keys(it).some((k) => k.startsWith('$'))) {
      errors.push(`${where}: keys starting with "$" are reserved`);
    }
    if (errors.length && errors.some((e) => e.startsWith(where))) return; // skip unusable item
    items.push(normalizeItem(it));
  });

  return { items, errors, meta };
}

function normalizeItem(it) {
  return {
    id: it.id,
    category: it.category ?? 'uncategorised',
    prompt: it.prompt,
    system: it.system ?? null,
    scorer: it.scorer,
    scorer_args: it.scorer_args ?? {},
    expected: it.expected ?? null,
    notes: it.notes ?? null,
    tags: Array.isArray(it.tags) ? it.tags : [],
  };
}

/** Read + validate a bank file. Never throws; errors land in `.errors`. */
export function loadItems(filePath) {
  try {
    const bank = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return validateItems(bank);
  } catch (e) {
    return { items: [], meta: {}, errors: [`cannot read item bank: ${e.message}`] };
  }
}

/**
 * Select items by id / category / tag. Returns a new array.
 * Used by the CLI to run a subset without editing the bank.
 */
export function selectItems(items, { ids = null, categories = null, tags = null, limit = null } = {}) {
  let out = items;
  if (ids) { const s = new Set(ids); out = out.filter((i) => s.has(i.id)); }
  if (categories) { const s = new Set(categories); out = out.filter((i) => s.has(i.category)); }
  if (tags) { const s = new Set(tags); out = out.filter((i) => i.tags.some((t) => s.has(t))); }
  if (limit !== null && limit > 0) out = out.slice(0, limit);
  return out;
}
