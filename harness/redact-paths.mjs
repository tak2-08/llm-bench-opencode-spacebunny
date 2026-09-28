#!/usr/bin/env node
/**
 * redact-paths.mjs — first-publication redaction of operator-local paths in
 * round-2 artifacts.
 *
 * Scope and rationale, stated so a reader can object:
 *
 *  - Round 2 has NOT been published before, so redacting now changes no already
 *    public evidence. Round 1's logs are left byte-identical, because their
 *    integrity is what the audit trail rests on, and they scanned clean.
 *  - Only operator-local PATH FRAGMENTS are replaced. No measured value, no
 *    answer, no verdict, and no token is touched: the harness's own summaries
 *    and the JSONL run logs are not modified, so every number in the reports is
 *    still derivable from an unmodified file.
 *  - A manifest is written so the redaction is auditable rather than silent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

// Ordered longest-first so ~/.cache/agent-memory is replaced before agent-memory.
const RULES = [
  [/~\/\.cache\/agent-memory/g, '~/.cache/<memory-store>'],
  [/\/home\/node\/\.cache\/agent-memory/g, '/home/<user>/.cache/<memory-store>'],
  [/\/home\/node\//g, '/home/<user>/'],
  [/\/workspace\/T2Editor[^\s"']*/g, '<workdir>/T2Editor'],
  [/\/workspace\/llm-bench/g, '<workdir>/llm-bench'],
  [/\/workspace\//g, '<workdir>/'],
];

function scrub(text) {
  let t = text;
  for (const [re, to] of RULES) t = t.replace(re, to);
  return t;
}

const roots = ['reports/round2'].map((r) => path.join(ROOT, r));
const manifest = { schema: 'llm-bench/redaction/v1',
                   reason: 'operator-local path fragments in captured subprocess output, first publication',
                   rule_count: RULES.length, files: [] };

let changed = 0, scanned = 0;
for (const base of roots) {
  if (!fs.existsSync(base)) continue;
  for (const abs of walk(base)) {
    scanned++;
    const st = fs.statSync(abs);
    if (!st.isFile()) continue;
    // Never touch the machine-readable results: they carry the numbers.
    if (/\.(json|jsonl)$/.test(abs)) continue;
    const before = fs.readFileSync(abs, 'utf8');
    const after = scrub(before);
    if (before === after) continue;
    fs.writeFileSync(abs, after);
    changed++;
    manifest.files.push({ file: path.relative(ROOT, abs), bytes_before: st.size, bytes_after: Buffer.byteLength(after) });
  }
}
manifest.files_scanned = scanned;
manifest.files_changed = changed;
fs.writeFileSync(path.join(ROOT, 'data', 'redaction-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`scanned ${scanned} files under reports/round2, redacted ${changed}`);
for (const f of manifest.files) console.log(`  ${f.file}  ${f.bytes_before} -> ${f.bytes_after}`);

/** Returns absolute paths, because the caller joins them into the manifest by
 *  walking UP from ROOT; a relative return value here previously produced
 *  "reports/round2/reports/round2/..." and a crash. */
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
