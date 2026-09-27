#!/usr/bin/env node
/**
 * bin/run-bench.mjs — CLI entry point.
 *
 *   node bin/run-bench.mjs --items ITEMS.example.json \
 *     --models opencode/space-bunny-free,nvidia/z-ai/glm-5.3-flash \
 *     --reps 1 --concurrency 2 --out ../reports/round1
 *
 * Safe defaults: --format json, --pure, and an isolated --dir, because without
 * those three the ambient AGENTS.md/plugin layer injects instructions and tool
 * calls into the measurement (measured: 22.0 s -> 11.0 s, 28.4k -> 16.5k input
 * tokens, and a stray memory_search call prepended text to a trivial answer).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPool } from '../pool.mjs';
import { readLog } from '../pool.mjs';
import { buildReport } from '../report.mjs';
import { validateItems } from '../items.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.resolve(HERE, '..');

function parseArgs(argv) {
  const out = {
    items: null, models: [], reps: 1, concurrency: null, timeoutMs: null,
    out: null, log: null, format: 'json', pure: true, cwd: null, variant: null,
    maxRetries: null, noResume: false, artifacts: true, dryRun: false, quiet: false,
    baseBackoffMs: null, maxBackoffMs: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
    switch (a) {
      case '--items': case '-i': out.items = next(); break;
      case '--models': case '-m': out.models = out.models.concat(next().split(',').map((s) => s.trim()).filter(Boolean)); break;
      case '--reps': case '-r': out.reps = num(next()) ?? 1; break;
      case '--concurrency': case '-c': out.concurrency = num(next()); break;
      case '--timeout': case '-t': out.timeoutMs = num(next()); break;
      case '--out': case '-o': out.out = next(); break;
      case '--log': out.log = next(); break;
      case '--format': out.format = next(); break;
      case '--variant': out.variant = next(); break;
      case '--max-retries': out.maxRetries = num(next()); break;
      case '--base-backoff': out.baseBackoffMs = num(next()); break;
      case '--max-backoff': out.maxBackoffMs = num(next()); break;
      case '--dir': out.cwd = next(); break;
      case '--no-pure': out.pure = false; break;
      case '--no-resume': out.noResume = true; break;
      case '--no-artifacts': out.artifacts = false; break;
      case '--dry-run': out.dryRun = true; break;
      case '--quiet': case '-q': out.quiet = true; break;
      case '--help': case '-h': out.help = true; break;
      default:
        if (a.startsWith('-')) { console.error(`unknown flag: ${a}`); out.help = true; }
    }
  }
  return out;
}

const HELP = `
run-bench — empirical benchmark harness for \`opencode run\`

USAGE
  node bin/run-bench.mjs --items <bank.json> [options]

OPTIONS
  -i, --items <file>        item bank JSON (see ITEMS.example.json / README)
  -m, --models <a,b>        provider/model ids; repeatable or comma-separated
  -r, --reps <n>            repetitions per (model,item); default 1
  -c, --concurrency <n>     max parallel runs; default 1
  -t, --timeout <ms>        per-run timeout; default 180000
  -o, --out <dir>           report output dir (report.md + report.json)
      --log <file>          JSONL run log; default <out>/run-log.jsonl
      --format json|default opencode output format; default json (real usage counters)
      --dir <path>          --dir for opencode (ISOLATION; default: fresh temp dir)
      --no-pure             do not pass --pure (disables plugin isolation — noisier)
      --variant <name>      provider reasoning effort, e.g. high
      --max-retries <n>     retries after the first attempt; default 2
      --base-backoff <ms>   default 1000
      --max-backoff <ms>    default 30000
      --no-resume           ignore existing log, re-run everything
      --no-artifacts        do not write per-run stdout/stderr files
      --dry-run             build the task list and print it, run nothing
  -q, --quiet               suppress per-record progress
  -h, --help                this text

ENV
  OPENCODE_BIN     opencode executable (default /usr/local/bin/opencode)
  BENCH_CONCURRENCY  default concurrency when --concurrency is absent
  TH_MAX_SLOTS / throttle.sh   machine load gate; the harness does not enforce it
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return 0; }
  if (!args.items) { console.error('--items is required\n'); console.log(HELP); return 2; }
  if (args.models.length === 0) { console.error('--models is required'); return 2; }

  const itemsPath = path.resolve(args.items);
  if (!fs.existsSync(itemsPath)) { console.error(`item bank not found: ${itemsPath}`); return 2; }
  let bank;
  try {
    bank = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
  } catch (e) {
    console.error(`item bank is not valid JSON: ${e.message}`); return 2;
  }
  const { items, errors } = validateItems(bank);
  if (errors.length) {
    console.error(`item bank has ${errors.length} problem(s):`);
    for (const e of errors.slice(0, 20)) console.error(`  - ${e}`);
    return 2;
  }
  if (args.models.some((m) => m.startsWith('opencode/') && m !== 'opencode/space-bunny-free')) {
    console.warn('WARNING: known-good-model rule — other opencode/* models fail with "Unexpected server error".');
  }

  const outDir = path.resolve(args.out ?? path.join(HARNESS, '..', 'reports', `bench-${Date.now()}`));
  const logPath = path.resolve(args.log ?? path.join(outDir, 'run-log.jsonl'));
  const artifactDir = args.artifacts ? path.join(outDir, 'artifacts') : null;
  const concurrency = args.concurrency ?? Number(process.env.BENCH_CONCURRENCY ?? 1);
  // Isolation dir: an empty scratch dir keeps the ambient AGENTS.md out.
  const cwd = args.cwd ?? fs.mkdtempSync(path.join(os.tmpdir(), 't2bench-'));

  if (args.dryRun) {
    const { buildTasks } = await import('../pool.mjs');
    const { completedRunIds } = await import('../pool.mjs');
    const tasks = buildTasks({ items, models: args.models, reps: args.reps, skipIds: completedRunIds(logPath) });
    console.log(JSON.stringify({ items: items.length, models: args.models, reps: args.reps, pending: tasks.length, logPath, outDir, cwd, concurrency }, null, 2));
    return 0;
  }

  fs.mkdirSync(outDir, { recursive: true });
  console.error(`[run-bench] items=${items.length} models=${args.models.length} reps=${args.reps} concurrency=${concurrency} format=${args.format} pure=${args.pure}`);
  console.error(`[run-bench] log=${logPath}\n[run-bench] isolation dir=${cwd}`);

  const ac = new AbortController();
  const onSig = (sig) => {
    console.error(`\n[run-bench] ${sig} received — finishing in-flight runs, no new runs will start. Ctrl-C again to abort harder.`);
    ac.abort();
  };
  process.once('SIGINT', () => onSig('SIGINT'));
  process.once('SIGTERM', () => onSig('SIGTERM'));

  let n = 0;
  const t0 = Date.now();
  const stats = await runPool({
    items, models: args.models, reps: args.reps, concurrency, logPath,
    artifactDir, maxRetries: args.maxRetries ?? 2, timeoutMs: args.timeoutMs ?? 180_000,
    format: args.format, cwd, pure: args.pure, variant: args.variant,
    baseBackoffMs: args.baseBackoffMs ?? 1000, maxBackoffMs: args.maxBackoffMs ?? 30_000,
    resume: !args.noResume, signal: ac.signal,
    onRecord: (r) => {
      if (args.quiet) return;
      n++;
      const mark = r.failure ? 'FAIL' : r.passed ? 'pass' : 'FAIL';
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      console.error(`[${String(n).padStart(4)} ${el}s] ${mark} ${r.model} ${r.item_id} rep=${r.rep} att=${r.attempt} lat=${r.latency_ms}ms ttft=${r.ttft_spawn_ms}ms tok=${r.output_tokens}(${r.token_source}) ${r.failure ? r.failure.kind : (r.detail ?? '').slice(0, 60)}`);
    },
  });

  const { records, bad } = readLog(logPath);
  const prov = {
    models: Object.fromEntries(args.models.map((m) => [m, { id: m }])),
    opencode_bin: process.env.OPENCODE_BIN ?? '/usr/local/bin/opencode',
    format: args.format, pure: args.pure, isolation_dir: cwd, concurrency,
    item_bank: itemsPath, logPath, n_items: items.length, reps: args.reps,
  };
  const { summary, markdown, jsonPath, mdPath } = buildReport(records, {
    outDir, title: `LLM benchmark — ${args.models.join(', ')}`,
    notes: [`item bank: \`${path.basename(itemsPath)}\` (${items.length} items, ${args.reps} rep)`, `concurrency ${concurrency}, format ${args.format}, pure=${args.pure}`],
    provenance: prov,
  });

  console.error(`\n[run-bench] done in ${(stats.wall_ms / 1000).toFixed(1)}s — completed=${stats.completed} failed=${stats.failed} retried=${stats.retried} skipped(resume)=${stats.resumed_skipped}${bad ? ` tornLines=${bad}` : ''}`);
  console.error(`[run-bench] report: ${mdPath}`);
  console.error(`[run-bench] summary: ${jsonPath}`);
  console.log(markdown);
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error('[run-bench] fatal:', e); process.exit(1); });
