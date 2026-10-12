#!/usr/bin/env node
// Runs every end-to-end feature test in order against the unpacked extension/ folder,
// then prints a summary and exits non-zero if any check FAILed.
//   npm run test:e2e                 (headless)
//   HEADLESS=0 npm run test:e2e      (watch the browser; add SLOWMO=200 to slow it down)
//   node e2e/run-all.js feat-b       (run only scripts whose name contains "feat-b")
// feat-c/d/e reuse the guide recorded by feat-a (shared profile in e2e/output/profile), so run feat-a first.
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');

const OUT = path.resolve(process.env.E2E_OUT || path.join(__dirname, 'output'));
const SCRIPTS = ['feat-a-record.js', 'feat-a2-altmark-race.js', 'feat-b-redact.js', 'feat-c-editor.js', 'feat-d-exports.js', 'feat-e-dashboard.js'];
const only = process.argv[2];
const list = only ? SCRIPTS.filter(s => s.includes(only)) : SCRIPTS;

if (!only) fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const RESULTS = path.join(OUT, 'results.json');

// Pick free ports for the test site and Chromium's DevTools endpoint (shared by all scripts so recorded URLs stay valid).
const net = require('net');
const free = (p) => new Promise(r => { const s = net.createServer().once('error', () => r(false)).listen(p, () => s.close(() => r(true))); });
async function pick(start) { for (let p = start; p < start + 100; p++) if (await free(p)) return p; throw new Error('no free port near ' + start); }

(async () => {
const env = { ...process.env };
env.E2E_PORT = env.E2E_PORT || String(await pick(8765));
env.E2E_CDP_PORT = env.E2E_CDP_PORT || String(await pick(9333));
console.log(`Extension: ${path.resolve(process.env.EXT_DIR || path.join(__dirname, '..', 'extension'))}  site: http://localhost:${env.E2E_PORT}  headless: ${process.env.HEADLESS !== '0'}`);
const crashed = [];
for (const s of list) {
  console.log(`\n=== ${s} ===`);
  const r = spawnSync(process.execPath, [path.join(__dirname, s)], { stdio: 'inherit', env });
  if (r.status !== 0) crashed.push(`${s} (exit ${r.status})`);
}

const results = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, 'utf8')) : {};
const rows = Object.entries(results);
const bad = rows.filter(([, v]) => v.result === 'FAIL' || v.result === 'PARTIAL');
const md = ['# StepSafe e2e results', '', `Run: ${new Date().toString()}`, '', '| Result | Check | Evidence | Notes |', '|---|---|---|---|',
  ...rows.map(([k, v]) => `| ${v.result} | ${k} | ${v.evidence} | ${String(v.notes).replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`)];
fs.writeFileSync(path.join(OUT, 'SUMMARY.md'), md.join('\n') + '\n');

console.log('\n=== Summary ===');
for (const [k, v] of rows) console.log(`${v.result.padEnd(12)} ${k}`);
const pass = rows.filter(([, v]) => v.result === 'PASS').length;
console.log(`\n${pass} PASS, ${bad.length} FAIL/PARTIAL, ${rows.length - pass - bad.length} informational; crashed scripts: ${crashed.join(', ') || 'none'}`);
console.log(`Screenshots, exports and SUMMARY.md: ${OUT}`);
process.exit(bad.length || crashed.length || !rows.length ? 1 : 0);
})();
