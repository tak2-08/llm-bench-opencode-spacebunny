#!/usr/bin/env node
/**
 * company-run.mjs — track 2: a real multi-agent "company" as one unit of output.
 *
 * Track 1 treated three independent solver instances as one model. That is the
 * statistically powerful version, but it is not literally a company: each
 * instance is a single agent. This file runs the literal version.
 *
 * A company here is ONE opencode process that is handed a charter requiring it
 * to organise its own internal roles (analyst / critic / writer) and emit a
 * single consolidated answer. It cannot spawn real sub-processes, so this is a
 * single-process company — stated plainly rather than dressed up.
 *
 * The honest limitation, recorded in the output: a company that is one process
 * with a role charter is not a company with independent members. Its members
 * share one context and cannot disagree through a real channel.
 *
 * Usage: node company-run.mjs --items items-openended.json --item <id> --out <file>
 *                     [--chars N] [--company]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CHARTER = `You are a COMPANY, not an individual. Operate as a small firm with distinct internal roles, working the task in sequence and explicitly switching roles:

1. ANALYSTIST — restate the task, list what a complete answer must contain, and flag any ambiguity that changes the answer.
2. SOLVER(S) — do the actual work. If the task has independent parts, solve each part and show the work.
3. CRITIC — attack the SOLVER's output. Name the weakest claim, the likeliest error, and anything asserted without support. Do not rubber-stamp.
4. WRITER — produce the final consolidated answer, incorporating anything the CRITIC caught.

Rules for the final answer:
- Answer the task that was actually asked. No preamble, no meta-commentary about being a company.
- If a role's work is invisible in the final answer, it should not have been done.
- Be concrete. Prefer a specific example to an adjective.
- Write the final answer only, under a single line "=== ANSWER ===".`;

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const itemId = arg('--item', null);
const outFile = arg('--out', null);
const budget = Number(arg('--chars', 1200));
const companyMode = process.argv.includes('--company');

if (!itemId) { console.error('--item required'); process.exit(1); }

const bank = JSON.parse(fs.readFileSync(arg('--items', 'items-openended.json'), 'utf8'));
const item = (bank.items ?? bank).find((i) => i.id === itemId);
if (!item) { console.error(`no item ${itemId}`); process.exit(1); }

const head = companyMode ? CHARTER : 'You are a careful individual solver. Answer the task directly.';
const prompt = `${head}

Stay within about ${budget} characters for the answer body.

=== TASK ===
${item.prompt}
=== END TASK ===`;

const model = arg('--model', 'opencode/space-bunny-free');
const t0 = Date.now();
const child = spawn('opencode', ['run', '-m', model, '--format', 'json', '--pure', prompt], { stdio: ['ignore', 'pipe', 'pipe'] });
let out = '', err = '';
child.stdout.on('data', (d) => { out += d; });
child.stderr.on('data', (d) => { err += d; });
child.on('close', () => {
  let text = '';
  for (const line of out.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'error') { text = ''; err += `\nERROR ${ev?.error?.data?.ref ?? ''}`; break; }
    if (typeof ev?.part?.text === 'string') text += ev.part.text;
  }
  const answer = text.includes('=== ANSWER ===')
    ? text.split('=== ANSWER ===').slice(1).join('=== ANSWER ===').trim()
    : text.trim();
  const rec = { item_id: itemId, arm: companyMode ? 'company' : 'single', model,
                company_charter: companyMode, answer, chars: answer.length,
                empty: answer.length === 0, ms: Date.now() - t0 };
  if (outFile) { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.appendFileSync(outFile, JSON.stringify(rec) + '\n'); }
  console.error(`[company] ${itemId} ${rec.arm} empty=${rec.empty} chars=${rec.chars} ${rec.ms}ms`);
  process.exit(rec.empty ? 1 : 0);
});
