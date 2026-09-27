#!/usr/bin/env node
/**
 * adjudicate-anchors.mjs — C2: apply B3's adjudication to the ANCHOR logs.
 *
 * WHY
 * ---
 * The second pass has a fairness problem that did not exist for the first pass.
 * The subject's log was adjudicated; the anchors' logs were not. The same two
 * scorer defects that B3 found (the no-digit lookahead in the abstention regex,
 * and `numeric`'s "first number" extraction) are still live in the anchor logs.
 * Comparing an adjudicated subject against raw anchors would charge the anchors
 * for a harness bug — and would manufacture the appearance that the subject
 * crushes them.
 *
 * IT DOES NOT MODIFY B3's FILES
 * -----------------------------
 * The rules are B3's, extracted verbatim into `adjudicate-rules.mjs`. This file
 * only drives them over additional logs. Raw logs are never written; corrected
 * verdicts go to a sibling `run-log.adjudicated.jsonl`.
 *
 * THE EQUIVALENCE TEST IS THE POINT
 * ---------------------------------
 * `selfTest()` re-adjudicates the SUBJECT log with this same engine and asserts
 * the result matches B3's own `run-log.adjudicated.jsonl` on verdict, rule id,
 * `changed` and `original_passed` for all 176 runs. If the extraction ever
 * drifts from B3's logic, the tool exits non-zero rather than quietly producing
 * a differently-corrected anchor.
 *
 * Usage:
 *   node harness/adjudicate-anchors.mjs [--strict] [--quiet] [--selftest-only]
 * Exit 0 = ok. 2 = strict integrity failure or equivalence failure. 1 = I/O.
 */
import fs from 'node:fs';
import path from 'node:path';
import { adjudicateRun, loadJudgments, contaminationHits, UNRESOLVABLE_ITEMS } from './adjudicate-rules.mjs';
import { wilsonInterval } from './aggregate.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const q = (s) => `  ${s}`;

const readJsonl = (p) =>
  fs.readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

/** Logs this pass adjudicates beyond the subject. Anchors first, then the subject. */
const LOGS = [
  'reports/round1/anchors-44',
  'reports/round1/anchors-fast',
  'reports/round1/subject-88',
  'reports/round1/subject-lc',
];

/** B3's outputs — never written by this tool; used only as the equivalence oracle. */
const B3_ORACLE = {
  'reports/round1/subject-88': 'reports/round1/subject-88/run-log.adjudicated.jsonl',
  'reports/round1/subject-lc': 'reports/round1/subject-lc/run-log.adjudicated.jsonl',
};

function loadItems() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'harness/items.json'), 'utf8'));
  const list = raw.items ?? raw;
  const byId = {};
  for (const it of list) byId[it.id] = it;
  return byId;
}

function pct(v) { return Number.isFinite(v) ? (v * 100).toFixed(1) + '%' : '—'; }
function f4(v) { return Number.isFinite(v) ? Number(v.toFixed(4)) : null; }

/** Wilson via B1's aggregate.mjs implementation (independently authored + self-tested). */
function wilson(c, n) {
  if (!n) return { low: null, high: null };
  const w = wilsonInterval(c, n);
  return { low: w.low, high: w.high, halfwidth: (w.high - w.low) / 2 };
}

/**
 * Adjudicate one log. Returns {rows, integrity} where rows carry the original raw
 * record fields plus `_adjudication`, exactly like B3's output shape.
 */
function adjudicateLog(relLog, byId, judgments) {
  const raw = readJsonl(path.join(ROOT, relLog, 'run-log.jsonl'));
  const rows = [];
  const integrity = [];

  for (const rec of raw) {
    const item = byId[rec.item_id];
    const a = adjudicateRun(rec, item);
    const needReading = a.rule.startsWith('R3') || a.rule.startsWith('R4');
    const j = judgments[rec.run_id];

    // --- strict gate: every flip by a reading-rule must have a documented reading ---
    if (needReading && a.changed && !j) {
      integrity.push(`${relLog} ${rec.run_id} (${rec.item_id}) flipped by ${a.rule} with NO documented reading`);
    }
    if (j && !needReading) {
      integrity.push(`${relLog} ${rec.run_id} (${rec.item_id}) has a documented reading but no rule fired a reading-rule (fired ${a.rule})`);
    }
    if (j && needReading && j.rule && !a.rule.startsWith(j.rule.replace(/a$/, ''))) {
      integrity.push(`${relLog} ${rec.run_id} documented as ${j.rule} but rule engine fired ${a.rule}`);
    }
    if (j && needReading && j.item_id && j.item_id !== rec.item_id) {
      integrity.push(`${relLog} ${rec.run_id} reading names item ${j.item_id} but run is ${rec.item_id}`);
    }

    rows.push({
      ...rec,
      _adjudication: {
        original_passed: a.original_passed,
        original_detail: rec.detail ?? null,
        adjudicated: a.verdict,
        rule: a.rule,
        changed: a.changed,
        why: a.why,
        contamination: contaminationHits(rec.answer ?? ''),
        tool_call_count: (rec.tool_calls ?? []).length,
        adjudicated_by: 'C2/harness/adjudicate-anchors.mjs (rules verbatim from B3/harness/adjudicate.mjs)',
        raw_log_untouched: true,
        ...(j ? { documented_reading: j.reading, reading_provenance: j.provenance ?? null } : {}),
      },
    });
  }
  return { rows, integrity };
}

/**
 * Item-level rollup. The unit is ONE ITEM, not one run: the anchors ran 1 rep and
 * the subject 2, and the anchors' pool retried transport failures. Run-level
 * denominators are therefore not comparable (an anchor's 47 runs cover 45 items).
 *
 * `resolve` picks which attempt represents an item:
 *   'measured'  — the last attempt that produced a scorable answer (retry-resolved).
 *                 This is the only definition consistent with the harness's own
 *                 documented contract that transport failures are excluded from
 *                 accuracy and reported as reliability.
 *   'first'     — the first attempt, retries ignored. Reproduces the raw numbers
 *                 quoted in the second-pass brief.
 */
function rollup(rows, model, resolve) {
  const by = {};
  for (const r of rows) {
    if (model && r.model !== model) continue;
    (by[r.item_id] = by[r.item_id] || []).push(r);
  }
  const out = [];
  for (const [item_id, attempts] of Object.entries(by)) {
    attempts.sort((a, b) => (a.attempt ?? 1) - (b.attempt ?? 1));
    let pick;
    if (resolve === 'first') {
      pick = attempts[0];
    } else {
      pick = [...attempts].reverse().find((a) => a._adjudication.adjudicated !== 'excluded')
        ?? [...attempts].reverse().find((a) => a._adjudication.adjudicated === 'excluded');
    }
    out.push({
      item_id,
      category: pick.category,
      verdict: pick._adjudication.adjudicated,
      rule: pick._adjudication.rule,
      original_passed: pick._adjudication.original_passed,
      changed: pick._adjudication.changed,
      n_attempts: attempts.length,
      pick_attempt: pick.attempt ?? 1,
      latency_ms: pick.latency_ms,
      model: pick.model,
    });
  }
  return out;
}

/** Split a rollup into (measured) and (never measured) per the three denominator rules. */
function tiers(roll) {
  const excluded = roll.filter((r) => r.verdict === 'excluded');
  const r2 = excluded.filter((r) => r.rule.startsWith('R2-'));
  const r1 = excluded.filter((r) => r.rule.startsWith('R1-') || r.rule.startsWith('R0-'));
  const scored = roll.filter((r) => r.verdict !== 'excluded');
  const full = scored.filter((r) => !r.rule.startsWith('R2-'));
  const acc = (xs) => {
    const n = xs.length;
    const c = xs.filter((r) => r.verdict === 'correct').length;
    return { n, correct: c, accuracy: n ? c / n : null, ...wilson(c, n) };
  };
  return {
    n_items_total: roll.length,
    never_measured: r1.length,          // reliability failure — item leaves the denominator
    unscorable_item: r2.length,         // bank defect
    raw: acc(roll),                     // everything, failures counted wrong  (what the pool reported)
    conservative: acc(scored),          // R1 removed, artifacts credited, R2 kept as wrong
    full: acc(full),                    // R2 removed too
  };
}

function selfTest(byId, judgments) {
  const problems = [];
  for (const [relLog, oracleRel] of Object.entries(B3_ORACLE)) {
    const oraclePath = path.join(ROOT, oracleRel);
    if (!fs.existsSync(oraclePath)) { problems.push(`oracle missing: ${oracleRel}`); continue; }
    const oracle = readJsonl(oraclePath);
    const byRun = {};
    for (const o of oracle) byRun[o.run_id] = o._adjudication;
    const { rows } = adjudicateLog(relLog, byId, judgments);
    let compared = 0;
    for (const r of rows) {
      const b = byRun[r.run_id];
      if (!b) { problems.push(`${relLog} ${r.run_id} absent from B3's oracle`); continue; }
      compared++;
      const a = r._adjudication;
      for (const k of ['adjudicated', 'rule', 'changed', 'original_passed']) {
        if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
          problems.push(`${relLog} ${r.run_id} ${k}: mine=${JSON.stringify(a[k])} B3=${JSON.stringify(b[k])}`);
        }
      }
    }
    if (compared !== oracle.length) problems.push(`${relLog}: compared ${compared} of ${oracle.length}`);
    q(`  ${relLog}: ${compared} runs compared against B3's oracle — ${problems.length ? 'MISMATCH' : 'identical'}`);
  }
  return problems;
}

function main(argv) {
  const strict = argv.includes('--strict');
  const quiet = argv.includes('--quiet');
  const only = argv.includes('--selftest-only');
  const L = quiet ? () => {} : console.log;

  const byId = loadItems();
  let judgments = {};
  const jPath = path.join(ROOT, 'data/adjudication-judgments.json');
  if (fs.existsSync(jPath)) {
    const parsed = JSON.parse(fs.readFileSync(jPath, 'utf8'));
    delete parsed._README;
    judgments = parsed;
  }
  judgments = loadJudgments(judgments);

  L('── SELF-TEST: does the extracted engine still reproduce B3\'s own verdicts? ──');
  const eqProblems = selfTest(byId, judgments);
  for (const p of eqProblems.slice(0, 10)) L(`  !! ${p}`);
  L(`  ${eqProblems.length ? 'FAILED' : 'PASSED'} — extraction is byte-equivalent to B3's rules`);

  if (only) return eqProblems.length ? 2 : 0;
  if (eqProblems.length) {
    console.error('\nREFUSING TO ADJUDICATE: the rule engine no longer matches B3\'s.');
    return 2;
  }

  L('\n── ADJUDICATING ANCHOR + SUBJECT LOGS ─────────────────────────────');
  const allIntegrity = [];
  const results = {};
  const written = [];
  for (const relLog of LOGS) {
    const { rows, integrity } = adjudicateLog(relLog, byId, judgments);
    allIntegrity.push(...integrity);
    results[relLog] = rows;
    // B3 owns the subject logs' adjudicated output. Those are read as the
    // equivalence oracle and are NEVER rewritten — overwriting an independent
    // peer's evidence so that my tool "agrees" with it would destroy the check.
    if (B3_ORACLE[relLog]) {
      L(`  ${relLog.padEnd(30)} ${String(rows.length).padStart(3)} runs  (B3's output kept; read as oracle)`);
      continue;
    }
    const out = path.join(ROOT, relLog, 'run-log.adjudicated.jsonl');
    fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    written.push(path.relative(ROOT, out));
    const byModel = {};
    for (const r of rows) (byModel[r.model] = byModel[r.model] || []).push(r);
    L(`  ${relLog.padEnd(30)} ${String(rows.length).padStart(3)} runs  models=${Object.keys(byModel).join(', ')}  integrity=${integrity.length}`);
  }

  L('\n── INTEGRITY ───────────────────────────────────────────────────────');
  L(`  problems: ${allIntegrity.length}`);
  for (const p of allIntegrity) L(`  !! ${p}`);

  L('\n── ANCHOR NUMBERS: RAW vs ADJUDICATED (item level) ──────────────────');
  for (const relLog of ['reports/round1/anchors-44', 'reports/round1/anchors-fast']) {
    for (const model of [...new Set(results[relLog].map((r) => r.model))]) {
      for (const resolve of ['measured', 'first']) {
        const roll = rollup(results[relLog], model, resolve);
        const t = tiers(roll);
        const lbl = resolve === 'measured' ? 'retry-resolved' : 'first-attempt  ';
        L(`  ${model.padEnd(30)} ${lbl}  raw ${String(t.raw.correct)}/${String(t.raw.n).padEnd(3)} = ${pct(t.raw.accuracy).padStart(6)}`
          + `  |  ADJ-cons ${String(t.conservative.correct)}/${String(t.conservative.n).padEnd(3)} = ${pct(t.conservative.accuracy).padStart(6)}`
          + `  |  ADJ-full ${String(t.full.correct)}/${String(t.full.n).padEnd(3)} = ${pct(t.full.accuracy).padStart(6)}`
          + `  [neverMeasured=${t.never_measured} unscorableItem=${t.unscorable_item}]`);
      }
    }
  }

  L('\n── FILES ───────────────────────────────────────────────────────────');
  for (const w of written) L(`  wrote: ${w}`);
  L('  raw logs were opened read-only; no harness file and no B3 output was modified.');

  if (strict && allIntegrity.length) { console.error('\nSTRICT: integrity failure — exiting 2'); return 2; }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
