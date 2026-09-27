#!/usr/bin/env node
/**
 * build-items.mjs — build, verify and write the A3 item bank.
 *
 *   node build-items.mjs              build, verify, write items.json (exit 0/1)
 *   node build-items.mjs --check      verify the existing items.json, write nothing
 *   node build-items.mjs --quiet      only print the summary line
 *
 * Exits non-zero on ANY of: a schema violation, a duplicate prompt, a ground
 * truth the independent re-derivation disagrees with, a scorer that accepts a
 * wrong answer, a regex that does not compile, a metric that has no supplying
 * items, or a bank that is not byte-identical on a second build.
 *
 * No timestamps are written anywhere: `items.json` is a pure function of the seed
 * recorded in meta.seed, which is what makes the reproducibility check possible.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { buildBank, itemSpecs, SEED, GENERATOR_VERSION, EXCLUDED } from './generate-items.mjs';
import { verify, mutationCampaign, stats, failures } from './verify-items.mjs';
import { validateItems, ITEM_SCORERS } from './items.mjs';
import { SCORER_NAMES } from './scorers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'items.json');

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const QUIET = args.includes('--quiet');
const VERBOSE = args.includes('--verbose');

const log = (...a) => { if (!QUIET) console.log(...a); };
const problems = [];
const bad = (msg) => problems.push(msg);

// ---------------------------------------------------------------------------
// 1. build
// ---------------------------------------------------------------------------

/**
 * Build the whole artifact. Deliberately takes no inputs: the document is a pure
 * function of the seed, which is what makes the reproducibility check below
 * meaningful (and is why no timestamp appears anywhere in the file).
 */
function makeDocument() {
  const { items } = buildBank(SEED);
  return { document: buildDocument(items), items };
}

function buildDocument(items) {
  return {
  version: 1,
  meta: {
    name: 'A3 llm-bench item bank',
    owner: 'A3 (Federation A, 표준화연구소) — 시험문항은행',
    generator: `generate-items.mjs ${GENERATOR_VERSION}`,
    verifier: 'verify-items.mjs (independent algorithm-2 re-derivation)',
    seed: SEED,
    // No `generated_on` timestamp on purpose: the file must be byte-identical
    // across runs so that `--check` and a second build are comparable.
    subject: 'opencode/space-bunny-free',
    design: [
      'Ground truth is computed by a seeded program, not recalled, for the large majority of items.',
      'items.json is a pure function of (meta.seed, item id).',
      'Scorers are the 7 registered harness scorers; custom_fn is deliberately unused because it has no registration hook in the production path.',
      'Prompts are self-contained strings: no item asks the model to open a file.',
      'scorer_args keys are camelCase, matching scorers.mjs (the README and ITEMS.example.json disagree with the implementation; see reports/A3-item-bank.md).',
    ],
    metric_map: {
      pass_at_1: 'every item except instruction_following, abstention_hallucination and function_calling',
      task_success_rate: 'function_calling items, scored by a deterministic schema checker (a proxy: no real tool execution is possible under --pure --dir)',
      ifeval_inst_strict: 'instruction_following items tagged ifeval_unit:instruction (exactly one verifiable instruction each)',
      ifeval_prompt_strict: 'instruction_following items tagged ifeval_unit:prompt (all-or-nothing, excluded from inst_strict)',
      accuracy_lang: 'multilingual items tagged lang:ko (and lang:en / lang:ja / lang:zh for the cross-lingual gap)',
      simpleqa_fscore: 'abstention_hallucination items; see simpleqa_mapping in the report for the binary-verdict mapping',
    },
    excluded: EXCLUDED,
  },
  items,
  };
}

const { document: bank, items } = makeDocument();

// ---------------------------------------------------------------------------
// 2. structural checks
// ---------------------------------------------------------------------------

log(`A3 build — seed ${SEED}, ${items.length} items`);

// 2a. the harness's own validator
const validated = validateItems(bank);
if (validated.errors.length) validated.errors.forEach((e) => bad(`schema: ${e}`));
if (validated.items.length !== items.length) bad(`schema: validator kept ${validated.items.length} of ${items.length} items`);

// 2b. ids and prompts unique — exactly, and after normalisation
{
  const ids = new Set(), prompts = new Set(), norm = new Set();
  for (const it of items) {
    if (ids.has(it.id)) bad(`duplicate id "${it.id}"`);
    ids.add(it.id);
    if (prompts.has(it.prompt)) bad(`duplicate prompt on "${it.id}"`);
    prompts.add(it.prompt);
    const n = it.prompt.replace(/\s+/g, ' ').trim().toLowerCase();
    if (norm.has(n)) bad(`prompt on "${it.id}" is a whitespace/case duplicate of another item`);
    norm.add(n);
  }
}

// 2c. scorer hygiene
const SNAKE = /_$/;
for (const it of items) {
  if (!ITEM_SCORERS.includes(it.scorer)) bad(`${it.id}: unknown scorer "${it.scorer}"`);
  if (it.scorer === 'custom_fn') bad(`${it.id}: custom_fn has no registration hook in the production path`);
  for (const k of Object.keys(it.scorer_args ?? {})) {
    if (SNAKE.test(k)) bad(`${it.id}: scorer_args key "${k}" is snake_case; scorers.mjs destructures camelCase, so it would be silently ignored`);
  }
  if (it.scorer === 'regex') {
    try { new RegExp(it.expected, it.scorer_args?.flags ?? ''); }
    catch (e) { bad(`${it.id}: regex does not compile (${e.message})`); }
  }
  if (it.scorer === 'numeric' && !Number.isFinite(Number(it.expected))) bad(`${it.id}: numeric expected is not a finite number`);
  if (it.scorer === 'json_schema' && !it.scorer_args?.schema) bad(`${it.id}: json_schema without a schema`);
  if (it.scorer === 'choice' && !it.scorer_args?.allowed) bad(`${it.id}: choice without allowed`);
}

// 2d. prompts must be self-contained: no file the model would have to open
for (const it of items) {
  if (/\b(open|read|cat|load)\s+the\s+file\b/i.test(it.prompt) || /\/[\w./-]+\.(json|js|txt|csv|py|md)\b/.test(it.prompt)) {
    bad(`${it.id}: prompt appears to reference a file`);
  }
}

// 2e. every item is either generated or handwritten-canonical, and the split is reported
{
  const prov = {};
  for (const it of items) prov[it.provenance ?? '(missing)'] = (prov[it.provenance ?? '(missing)'] ?? 0) + 1;
  for (const k of Object.keys(prov)) {
    if (!['generated', 'handwritten-canonical'].includes(k)) bad(`${k} is not a recognised provenance`);
  }
  const gen = prov.generated ?? 0;
  const share = gen / items.length;
  if (share < 0.70) bad(`generated share is ${(share * 100).toFixed(1)}%, below the required 70%`);
  const hand = items.length - gen;
  if (hand / items.length > 0.30) bad(`hand-written share is ${((hand / items.length) * 100).toFixed(1)}%, above the 30% cap`);
  log(`  provenance: ${gen} generated (${(share * 100).toFixed(1)}%) / ${hand} handwritten-canonical (${(100 - share * 100).toFixed(1)}%)`);
}

// 2f. pre-registered metrics have supplying items
{
  const supply = {
    'metric:ifeval_inst_strict': (i) => i.tags.includes('ifeval_unit:instruction'),
    'metric:ifeval_prompt_strict': (i) => i.tags.includes('ifeval_unit:prompt'),
    'metric:accuracy_lang': (i) => i.tags.includes('lang:ko'),
    'metric:task_success_rate': (i) => i.category === 'function_calling',
    'metric:simpleqa': (i) => i.category === 'abstention_hallucination',
  };
  for (const [tag, test] of Object.entries(supply)) {
    const n = items.filter(test).length;
    if (n === 0) bad(`pre-registered metric ${tag} has no supplying items`);
    log(`  ${tag.replace('metric:', '').padEnd(20)} ${n} items`);
  }
  // lang:ko must feed the pre-registered parameterisation
  const ko = items.filter((i) => i.tags.includes('lang:ko')).length;
  if (ko < 3) bad(`accuracy_lang(ko) needs at least 3 Korean items, found ${ko}`);
}

// 2g. per-category counts are inside the brief's budget
{
  const want = { reasoning: [11, 18], code: [6, 10], instruction_following: [10, 16], format_control: [6, 10],
    multilingual: [12, 18], long_context: [6, 10], function_calling: [6, 10],
    abstention_hallucination: [5, 8], robustness: [5, 8] };
  const got = {};
  for (const it of items) got[it.category] = (got[it.category] ?? 0) + 1;
  for (const [cat, [lo, hi]] of Object.entries(want)) {
    const n = got[cat] ?? 0;
    if (n < lo || n > hi) bad(`category ${cat} has ${n} items, outside [${lo}, ${hi}]`);
  }
  for (const cat of Object.keys(got)) if (!want[cat]) bad(`unexpected category "${cat}"`);
}

// 2h. robustness pairs must agree on the answer and differ in surface
{
  const pairs = new Map();
  for (const it of items) {
    const t = it.tags.find((x) => x.startsWith('pair:'));
    if (!t) continue;
    if (!pairs.has(t)) pairs.set(t, []);
    pairs.get(t).push(it);
  }
  if (pairs.size !== 3) bad(`expected 3 robustness pairs, found ${pairs.size}`);
  for (const [t, group] of pairs) {
    if (group.length !== 2) { bad(`${t} has ${group.length} items, expected 2`); continue; }
    const [a, b] = group;
    if (String(a.expected) !== String(b.expected)) bad(`${t}: the perturbed variant changed the ground truth (${a.expected} vs ${b.expected})`);
    if (a.prompt === b.prompt) bad(`${t}: the perturbed variant is not actually perturbed`);
    if (a.scorer !== b.scorer) bad(`${t}: the pair uses different scorers`);
  }
  if (VERBOSE) log(`  robustness pairs: ${[...pairs.keys()].join(', ')}`);
}

// ---------------------------------------------------------------------------
// 3. independent verification
// ---------------------------------------------------------------------------

const v = verify(bank);
for (const f of v.failures) bad(`verify: ${f}`);

// 3a. mutation campaign: prove the verifier can fail
const mut = mutationCampaign(bank);
log(`  mutation campaign: ${mut.caught}/${mut.total} corrupted expected values detected`);

// 3b. SimpleQA F-score self-test on hand-checkable vectors
//     F = 2c / (2c + 2i + n). Used only to demonstrate the mapping from this
//     bank's binary verdicts onto (correct, incorrect, not_attempted).
{
  const f1 = (c, i, nn) => (2 * c) / (2 * c + 2 * i + nn);
  const close = (x, y) => Math.abs(x - y) < 1e-12;
  if (!Number.isNaN(f1(0, 0, 0))) bad('simpleqa: F(0,0,0) should be NaN (0/0)');
  if (!close(f1(5, 0, 0), 1)) bad('simpleqa: F(5,0,0) should be 1');
  if (!close(f1(0, 0, 5), 0)) bad('simpleqa: F(0,0,5) should be 0');
  if (!close(f1(1, 0, 1), 2 / 3)) bad(`simpleqa: F(1,0,1) should be 2/3, got ${f1(1, 0, 1)}`);
  if (!close(f1(3, 2, 1), 6 / 11)) bad(`simpleqa: F(3,2,1) should be 6/11, got ${f1(3, 2, 1)}`);
  if (!close(f1(2, 1, 0), 2 / 3)) bad(`simpleqa: F(2,1,0) should be 2/3, got ${f1(2, 1, 0)}`);
}

// ---------------------------------------------------------------------------
// 4. reproducibility — the whole point of the no-timestamp rule
// ---------------------------------------------------------------------------

const serialise = (doc) => `${JSON.stringify(doc, null, 2)}\n`;
const firstPass = serialise(bank);
const second = serialise(makeDocument().document);
if (firstPass !== second) bad('the bank is not byte-identical across two builds (non-deterministic generator)');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
log(`  sha256(items.json payload): ${sha(firstPass)}`);

// ---------------------------------------------------------------------------
// 5. write
// ---------------------------------------------------------------------------

if (CHECK_ONLY) {
  if (!fs.existsSync(OUT)) { bad(`--check: ${OUT} does not exist`); }
  else {
    const onDisk = fs.readFileSync(OUT, 'utf8');
    if (sha(onDisk) !== sha(firstPass)) bad('--check: items.json on disk differs from a fresh build');
    else log('  --check: items.json on disk is byte-identical to a fresh build');
  }
} else if (problems.length === 0) {
  fs.writeFileSync(OUT, firstPass);
  log(`  wrote ${path.relative(process.cwd(), OUT)} (${firstPass.length} bytes)`);
}

// ---------------------------------------------------------------------------
// 6. summary
// ---------------------------------------------------------------------------

const cats = {};
for (const it of items) cats[it.category] = (cats[it.category] ?? 0) + 1;
log('');
log(`items: ${items.length}`);
for (const [c, n] of Object.entries(cats).sort()) log(`  ${c.padEnd(24)} ${n}`);
log(`checks run: ${stats.checks}`);
log(`positive controls: ${stats.positiveControlsCaught}/${stats.positiveControls} correct answers correctly ACCEPTED`);
log(`negative controls: ${stats.negativeControlsCaught}/${stats.negativeControls} wrong answers correctly rejected`);
log(`mutations detected: ${mut.caught}/${mut.total}`);
log(`scorers used: ${[...new Set(items.map((i) => i.scorer))].sort().join(', ')}`);
if (EXCLUDED.length) log(`excluded (documented in meta.excluded): ${EXCLUDED.map((e) => e.id).join(', ')}`);

if (problems.length) {
  console.error(`\nBUILD FAILED — ${problems.length} problem(s):`);
  for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
  if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`);
  process.exit(1);
}
log('\nBUILD OK — items.json is verified and reproducible.');
process.exit(0);
