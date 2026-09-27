import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync('/tmp/c1/lcb_src_mocks_performances_generation.json', 'utf8'));
const marks = [...j.date_marks].sort((a, b) => a - b);
const last = marks[marks.length - 1];
const prev = marks[marks.length - 2];
const now = Math.max(...j.performances.map((p) => p.date));
console.log('date_marks last two:', new Date(prev).toISOString().slice(0, 10), new Date(last).toISOString().slice(0, 10));
console.log('latest perf date  :', new Date(now).toISOString().slice(0, 10));
const repr = Object.fromEntries(j.models.map((m) => [m.model_name, m.model_repr]));

function windowPass(startMs) {
  const acc = {};
  for (const p of j.performances) {
    if (p.date < startMs) continue;
    const k = p.model;
    acc[k] ||= { ok: 0, n: 0 };
    acc[k].n++;
    if (Number(p['pass@1']) > 0) acc[k].ok++;
  }
  return acc;
}
const A = windowPass(last);
const rows = Object.entries(A).map(([k, v]) => ({ model: repr[k] || k, name: k, p: (100 * v.ok) / v.n, n: v.n, nAll: j.performances.filter((p) => p.model === k).length }))
  .filter((r) => r.n >= 30)
  .sort((a, b) => b.p - a.p);
console.log('\n=== LiveCodeBench pass@1, final window (' + new Date(last).toISOString().slice(0, 10) + ' -> latest data), models with n>=30 ===');
for (const r of rows) console.log('  ', r.p.toFixed(2) + '%', r.model.padEnd(40), 'n=' + r.n + '/' + r.nAll);
