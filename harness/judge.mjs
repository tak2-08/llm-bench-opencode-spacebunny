#!/usr/bin/env node
/**
 * judge.mjs — independent third-party grading harness (round 2, tracks 1 and 2).
 *
 * Design constraints that make the resulting number mean something:
 *
 *  1. IDENTITY BLINDING. The judge is never told which model, arm or company
 *     produced an answer, and never told that other answers came from models in
 *     the judge panel. Answers are labelled A/B/C only.
 *  2. POSITION RANDOMISATION. Candidate order is permuted by a seed. The
 *     position-bias probe (--repeats >1) re-presents the SAME candidates in a
 *     different order; if the judge's pick changes, that is measured position
 *     sensitivity, not reported as a pass.
 *  3. PANEL, NOT A SINGLE JUDGE. Three judges from three different vendors run
 *     independently. Inter-judge agreement is reported alongside the score, so
 *     a reader can see whether the grading is stable or is one model's taste.
 *  4. PARSES NOTHING BY HAND. Judges must answer in a fixed line format. A
 *     verdict that cannot be parsed is recorded as unparsed, never guessed.
 *  5. NO SELF-GRADE. `validate` refuses a judge whose model id equals the
 *     subject model id.
 *
 * Usage:
 *   node judge.mjs rubric --items items-openended.json --candidates cand.json \
 *        --judges a,b,c --out out/
 *   node judge.mjs pick   --candidates cand.json --judges a,b,c --repeats 2
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const SUBJECT_MODEL = 'opencode/space-bunny-free';

// ---------------------------------------------------------------- utilities

/** Deterministic 32-bit hash -> used to seed the per-packet permutation. */
export function hash32(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** Mulberry32 PRNG: seeded, reproducible, dependency-free. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * One model call. The opencode banner and any plugin chatter are stripped, and
 * an answer with no text part is reported as EMPTY rather than as an answer —
 * measured at 32-43% for some nvidia-hosted models, so it must never be
 * silently scored as a wrong answer.
 */
function ask(model, prompt, { timeoutMs = 180000, cwd, pure = true, variant = null } = {}) {
  return new Promise((resolve) => {
    const args = ['run', '-m', model, '--format', 'json', prompt];
    if (pure) args.push('--pure');
    if (variant) args.push('--variant', variant);
    if (cwd) args.push('--dir', cwd);
    const t0 = Date.now();
    let out = '', err = '';
    let done = false;
    const child = spawn('opencode', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const kill = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { if (done) return; done = true; clearTimeout(kill); resolve({ text: '', error: String(e?.message ?? e), ms: Date.now() - t0 }); });
    child.on('close', (code) => {
      if (done) return; done = true; clearTimeout(kill);
      resolve({ text: extractText(out), raw: out, stderr: err, code, ms: Date.now() - t0 });
    });
  });
}

/**
 * Pull the assistant text out of `opencode run --format json` event stream.
 *
 * The text lives at `event.part.text`, NOT at `event.text`. Reading the wrong
 * level yields an empty string for every run, which is indistinguishable from
 * a model that returned nothing — a failure mode that would have silently
 * voided an entire judging round. Both levels are handled, and the observed
 * real shape is pinned by test/judge.test.mjs against a captured line.
 */
export function extractText(jsonl) {
  let text = '';
  for (const line of jsonl.split('\n')) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    let ev; try { ev = JSON.parse(s); } catch { continue; }
    if (ev.type === 'error') return { __error: ev?.error?.data?.ref ?? ev?.error?.message ?? 'error', text: '' };
    // observed real shape
    if (typeof ev?.part?.text === 'string') { text += ev.part.text; continue; }
    // tolerated variants
    if (ev.type === 'text' && typeof ev.text === 'string') { text += ev.text; continue; }
    if (ev.type === 'message' && ev.role === 'assistant') {
      for (const p of (ev.parts ?? ev.content ?? [])) if (typeof p?.text === 'string') text += p.text;
    }
  }
  return text;
}

// ------------------------------------------------------------------- prompts

export const PICK_PROMPT = (q, cands) => `You are an independent technical grader. Below is one question and three candidate answers, labelled A, B and C in an arbitrary order.

The candidates are anonymous. You do not know who wrote them and it is irrelevant.

<question>
${q}
</question>

<candidate A>
${cands[0]}
</candidate>

<candidate B>
${cands[1]}
</candidate>

<candidate C>
${cands[2]}
</candidate>

Choose the single best candidate. Judge correctness of the final answer first, then absence of errors, then completeness. If two or more are fully correct, choose the most concise one. If none is correct, choose the one with the smallest error.

Reply in exactly this format and nothing else:
PICK: <A|B|C>
WHY: <one sentence>`

export const RUBRIC_PROMPT = (item, answer) => `You are an independent technical grader. Score an anonymous answer against a fixed rubric. The rubric is the standard; your own taste is not.

<question>
${item.prompt}
</question>

<answer>
${answer}
</answer>

<rubric>
${item.rubric.map((r, i) => `${i + 1}. ${r}`).join('\n')}
</rubric>

Award 1 point for each rubric criterion the answer genuinely satisfies. No partial points. Do not award a criterion the answer only gestures at. Do not invent criteria.

Reply in exactly this format and nothing else:
SCORE: <integer>
CRITERIA: <comma-separated 1-based indices you awarded>
NOTE: <at most 20 words>`

// -------------------------------------------------------------------- parsers

export function parsePick(text) {
  if (!text) return { ok: false, reason: 'empty' };
  const m = /^PICK:\s*([ABC])\s*$/im.exec(text.trim());
  if (!m) return { ok: false, reason: 'no PICK line' };
  const why = /WHY:\s*(.+)/im.exec(text);
  return { ok: true, pick: m[1].toUpperCase(), why: why ? why[1].trim() : '' };
}

export function parseRubric(text) {
  if (!text) return { ok: false, reason: 'empty' };
  const s = /^SCORE:\s*(-?\d+)\s*$/im.exec(text.trim());
  if (!s) return { ok: false, reason: 'no SCORE line' };
  const c = /CRITERIA:\s*([\d,\s]*)/im.exec(text);
  const idx = c && c[1].trim()
    ? c[1].split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const note = /NOTE:\s*(.+)/im.exec(text);
  return {
    ok: true,
    score: parseInt(s[1], 10),
    criteria: [...new Set(idx)].sort((a, b) => a - b),
    note: note ? note[1].trim() : '',
  };
}

// -------------------------------------------------------------- judge worker

async function judgeOnce({ model, variant, prompt, cwd, timeoutMs, retries = 1 }) {
  let last = { ok: false, reason: 'no attempt', ms: 0 };
  for (let a = 0; a <= retries; a++) {
    const r = await ask(model, prompt, { cwd, timeoutMs, variant });
    if (r.error) { last = { ok: false, reason: r.error, ms: r.ms }; continue; }
    if (typeof r.text === 'string' && r.text.trim()) return { ok: true, text: r.text, ms: r.ms, attempts: a + 1 };
    last = { ok: false, reason: 'empty', ms: r.ms, attempts: a + 1 };
  }
  return last;
}

// ------------------------------------------------------------------ agreement

/**
 * Cohen's kappa on two raters' integer scores.
 *
 * Observed agreement is a diagonal sum over a full 2xC confusion matrix. The
 * obvious one-array shortcut — incrementing O[a[i]] — computes a's *marginal*
 * instead, which returns 1.0 for any input where a happens to be sorted, and
 * silently inflates kappa. Caught by the self-test in test/judge.test.mjs.
 */
export function cohenKappa(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return null;
  const cats = [...new Set([...a.slice(0, n), ...b.slice(0, n)])].sort();
  const idx = new Map(cats.map((c, i) => [c, i]));
  const m = cats.length;
  const rowA = new Float64Array(m), rowB = new Float64Array(m);
  let agree = 0;
  for (let i = 0; i < n; i++) {
    const ia = idx.get(a[i]), ib = idx.get(b[i]);
    rowA[ia]++; rowB[ib]++;
    if (a[i] === b[i]) agree++;
  }
  const po = agree / n;
  let pe = 0;
  for (let k = 0; k < m; k++) pe += (rowA[k] / n) * (rowB[k] / n);
  if (pe >= 1) return 1;           // chance agreement is total: kappa is undefined, report perfect
  return (po - pe) / (1 - pe);
}

// ----------------------------------------------------------------------- main

/**
 * A judge is specified as "model" or "model@effort". The effort is passed to
 * opencode as --variant, which selects the provider's reasoning budget.
 *
 * Lineage is recorded alongside the judge because a judge that shares the
 * subject's model family is NOT an independent rater, and the report has to be
 * able to separate the independent panel from the same-lineage one.
 */
function parseJudgeSpec(spec) {
  const [model, variant] = String(spec).split('@');
  const lineage = /space-bunny/.test(model) ? 'subject' : 'other';
  return { spec: String(spec), model, variant: variant || null, lineage };
}

function parseArgs(argv) {
  const o = { mode: argv[2], items: null, candidates: null, judges: [], out: null,
              repeats: 1, concurrency: 1, timeoutMs: 180000, seed: 20260927, allowSameLineage: false };
  for (let i = 3; i < argv.length; i++) {
    const n = () => argv[++i];
    switch (argv[i]) {
      case '--items': o.items = n(); break;
      case '--candidates': o.candidates = n(); break;
      case '--judges': o.judges = n().split(',').map((s) => s.trim()).filter(Boolean).map(parseJudgeSpec); break;
      case '--out': o.out = n(); break;
      case '--repeats': o.repeats = Number(n()) || 1; break;
      case '--concurrency': o.concurrency = Number(n()) || 1; break;
      case '--timeout': o.timeoutMs = Number(n()) || 180000; break;
      case '--seed': o.seed = Number(n()) || 20260927; break;
      case '--allow-same-lineage': o.allowSameLineage = true; break;
      default: break;
    }
  }
  return o;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!['pick', 'rubric'].includes(args.mode)) { console.error('mode must be pick|rubric'); process.exit(1); }
  if (!args.judges.length) { console.error('--judges required'); process.exit(1); }

  // Gate 5: a judge may not be the subject model.
  // A judge at a different reasoning effort is NOT a self-grade of the same
  // configuration, but it IS the same lineage, so it is permitted only when
  // --allow-same-lineage is passed, and the report always labels it.
  const sameLineage = args.judges.filter((j) => j.lineage === 'subject');
  for (const j of args.judges) {
    if (j.model === SUBJECT_MODEL && !j.variant) {
      console.error(`refusing: judge "${j.spec}" is the subject model at its own configuration`); process.exit(2);
    }
  }
  if (sameLineage.length && !args.allowSameLineage) {
    console.error(`refusing: ${sameLineage.length} judge(s) share the subject's lineage ${JSON.stringify(sameLineage.map((j) => j.spec))}. ` +
                  'Same-lineage raters carry a known self-preference bias. Pass --allow-same-lineage to use them anyway; ' +
                  'the report will separate the independent panel from the same-lineage panel.');
    process.exit(2);
  }
  const seen = new Set();
  for (const j of args.judges) {
    if (seen.has(j.spec)) { console.error(`duplicate judge ${j.spec}`); process.exit(2); }
    seen.add(j.spec);
  }
  if (args.judges.length < 2) console.error(`WARNING: single judge — no inter-judge reliability can be reported.`);
  console.error(`[judge] panel: ${args.judges.map((j) => `${j.spec}(${j.lineage})`).join(' ')}  independent=${args.judges.length - sameLineage.length}/${args.judges.length}`);

  const items = args.items ? (JSON.parse(fs.readFileSync(args.items, 'utf8')).items ?? []) : [];
  const candFile = JSON.parse(fs.readFileSync(args.candidates, 'utf8'));
  const cands = Array.isArray(candFile) ? candFile : candFile.candidates;
  if (!cands.length) { console.error('no candidates'); process.exit(1); }

  const outDir = args.out ?? `judge-${args.mode}`;
  fs.mkdirSync(outDir, { recursive: true });
  const logPath = path.join(outDir, 'verdicts.jsonl');

  // Group candidates by item.
  const byItem = new Map();
  for (const c of cands) {
    if (!byItem.has(c.item_id)) byItem.set(c.item_id, []);
    byItem.get(c.item_id).push(c);
  }

  // Build the task list: one packet per (item, judge, repeat).
  const tasks = [];
  for (const [itemId, list] of byItem) {
    const item = items.find((i) => i.id === itemId) ?? { id: itemId, prompt: '(question text unavailable)', rubric: [] };
    for (let rep = 0; rep < args.repeats; rep++) {
      // Position permutation is seeded by (itemId, judge, repeat) so it is
      // reproducible, and rep>0 differs from rep=0 for the bias probe.
      for (const judge of args.judges) {
        const seed = hash32(`${itemId}|${judge}|${rep}|${args.seed}`);
        const order = shuffle(list.map((_, i) => i), rng(seed));
        const shown = order.map((i) => list[i]);
        tasks.push({ itemId, item, judge, rep, order, shown });
      }
    }
  }

  console.error(`[judge] mode=${args.mode} items=${byItem.size} judges=${args.judges.length} repeats=${args.repeats} tasks=${tasks.length}`);
  console.error(`[judge] concurrency=${args.concurrency} (model latency is high; 1 is the safe setting)`);

  const results = [];
  let cursor = 0;
  const isoDir = fs.mkdtempSync('/tmp/judge-');
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= tasks.length) return;
      const t = tasks[i];
      const rec = { item_id: t.itemId, judge: t.judge.spec, model: t.judge.model, variant: t.judge.variant, lineage: t.judge.lineage, repeat: t.rep, order: t.order, ts: new Date().toISOString() };
      if (args.mode === 'pick') {
        const prompt = PICK_PROMPT(t.item.prompt, t.shown.map((c) => c.answer));
        const r = await judgeOnce({ model: t.judge.model, variant: t.judge.variant, prompt, cwd: isoDir, timeoutMs: args.timeoutMs });
        rec.ms = r.ms; rec.attempts = r.attempts ?? 1;
        const p = r.ok ? parsePick(r.text) : { ok: false, reason: r.reason };
        if (p.ok) {
          const slot = ['A', 'B', 'C'].indexOf(p.pick);
          rec.chosen_arm = t.order[slot];
          rec.why = p.why;
        } else {
          rec.unparsed = p.reason;
        }
      } else {
        const prompt = RUBRIC_PROMPT(t.item, t.shown[0]?.answer ?? '');
        const r = await judgeOnce({ model: t.judge.model, variant: t.judge.variant, prompt, cwd: isoDir, timeoutMs: args.timeoutMs });
        rec.ms = r.ms; rec.attempts = r.attempts ?? 1;
        const p = r.ok ? parseRubric(r.text) : { ok: false, reason: r.reason };
        if (p.ok) { rec.score = p.score; rec.criteria = p.criteria; rec.note = p.note; rec.arm = t.shown[0]?.arm ?? null; }
        else rec.unparsed = p.reason;
      }
      fs.appendFileSync(logPath, JSON.stringify(rec) + '\n');
      results.push(rec);
      const tag = rec.unparsed ? `UNPARSED(${rec.unparsed})` : (args.mode === 'pick' ? `pick=${rec.chosen_arm}` : `score=${rec.score}`);
      console.error(`[judge] ${String(results.length).padStart(3)}/${tasks.length} ${t.judge.spec} ${t.itemId} r${t.rep} ${tag}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, args.concurrency) }, worker));

  // ------------------------------------------------------------------ report
  const unparsed = results.filter((r) => r.unparsed);
  const report = { mode: args.mode, judges: args.judges.map((j) => j.spec),
                   panel: args.judges.map((j) => ({ spec: j.spec, model: j.model, variant: j.variant, lineage: j.lineage })),
                   independent_judges: args.judges.filter((j) => j.lineage !== 'subject').length,
                   repeats: args.repeats,
                   items: byItem.size, tasks: tasks.length, verdicts: results.length,
                   unparsed: unparsed.length,
                   unparsed_by_judge: Object.fromEntries(args.judges.map((j) => [j.spec, unparsed.filter((r) => r.judge === j.spec).length])),
                   position_sensitivity: null, inter_judge: null, per_item: null };

  // Position-bias probe: in `pick` mode with repeats>1, did the same judge pick
  // the same underlying arm when the presentation order changed?
  if (args.mode === 'pick' && args.repeats > 1) {
    const byIJ = new Map();
    for (const r of results) {
      if (r.unparsed) continue;
      const k = `${r.judge}|${r.item_id}`;
      if (!byIJ.has(k)) byIJ.set(k, []);
      byIJ.get(k).push(r);
    }
    let same = 0, tot = 0;
    const flips = [];
    for (const [, rs] of byIJ) {
      const picks = new Set(rs.map((r) => r.chosen_arm));
      tot++;
      if (picks.size === 1) same++;
      else flips.push({ judge: rs[0].judge, item_id: rs[0].item_id, picks: [...picks] });
    }
    report.position_sensitivity = { items_judged: tot, stable: same, flipped: tot - same,
                                    flip_rate: tot ? (tot - same) / tot : null, flips };
  }

  // Inter-judge agreement: raw score equality and Cohen's kappa, pairwise.
  if (args.mode === 'rubric' && args.judges.length >= 2) {
    const perItem = new Map();
    for (const r of results) {
      if (r.unparsed || r.repeat !== 0) continue;
      if (!perItem.has(r.item_id)) perItem.set(r.item_id, {});
      perItem.get(r.item_id)[r.judge] = r;
    }
    const pairs = [];
    for (let i = 0; i < args.judges.length; i++) {
      for (let j = i + 1; j < args.judges.length; j++) {
        const A = [], B = [];
        for (const [, m] of perItem) {
          const ra = m[args.judges[i].spec], rb = m[args.judges[j].spec];
          if (ra?.score != null && rb?.score != null) { A.push(ra.score); B.push(rb.score); }
        }
        const exact = A.filter((x, k) => x === B[k]).length;
        const within1 = A.filter((x, k) => Math.abs(x - B[k]) <= 1).length;
        pairs.push({ a: args.judges[i].spec, b: args.judges[j].spec, n: A.length,
                     exact_agreement: A.length ? exact / A.length : null,
                     within_one: A.length ? within1 / A.length : null,
                     cohens_kappa: cohenKappa(A, B),
                     mean_score_a: A.length ? A.reduce((s, x) => s + x, 0) / A.length : null,
                     mean_score_b: B.length ? B.reduce((s, x) => s + x, 0) / B.length : null });
      }
    }
    report.inter_judge = pairs;
  }

  // Per-item mean score per arm, so the caller can compare arms.
  if (args.mode === 'rubric') {
    const agg = new Map();
    for (const r of results) {
      if (r.unparsed || r.arm == null) continue;
      if (!agg.has(r.item_id)) agg.set(r.item_id, {});
      const m = agg.get(r.item_id);
      (m[r.arm] ??= []).push(r.score);
    }
    const out = {};
    for (const [id, m] of agg) {
      out[id] = Object.fromEntries(Object.entries(m).map(([arm, v]) => [arm,
        { n: v.length, mean: v.reduce((s, x) => s + x, 0) / v.length, scores: v }]));
    }
    report.per_item = out;
  }

  fs.writeFileSync(path.join(outDir, 'judge-report.json'), JSON.stringify(report, null, 2));
  console.error(`\n[judge] verdicts=${report.verdicts} unparsed=${report.unparsed} (${JSON.stringify(report.unparsed_by_judge)})`);
  if (report.position_sensitivity) console.error(`[judge] position flip-rate=${report.position_sensitivity.flip_rate}`);
  if (report.inter_judge) for (const p of report.inter_judge) console.error(`[judge] ${p.a} vs ${p.b}: exact=${p.exact_agreement} within1=${p.within_one} kappa=${p.cohens_kappa}`);
  console.error(`[judge] wrote ${path.join(outDir, 'judge-report.json')}`);
}

// Only run when invoked directly. Importing this file (as test/judge.test.mjs
// does) must not launch model calls.
const isEntry = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isEntry) main().catch((e) => { console.error('[judge] fatal:', e); process.exit(1); });
