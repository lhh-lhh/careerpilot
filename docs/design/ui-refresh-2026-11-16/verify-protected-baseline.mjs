// Read-only source inspection. The sole write is this folder's generated report.
// No app imports, database/credential reads, network calls or service starts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../../..');
const baseline = JSON.parse(fs.readFileSync(path.join(dir, 'protected-baseline.json'), 'utf8'));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const changed = [], missing = [], scriptChanged = [], scriptMissing = [], current = [];
function walk(relative) {
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    if (entry.name === '__pycache__') continue;
    const name = relative + '/' + entry.name;
    if (entry.isDirectory()) walk(name);
    else current.push(name);
  }
}
for (const scope of ['src', 'server', 'gateway/app']) walk(scope);
current.push('package.json', 'package-lock.json');
for (const [name, expected] of Object.entries(baseline.files)) {
  const absolute = path.join(root, name);
  if (!fs.existsSync(absolute)) missing.push(name);
  else if (sha(fs.readFileSync(absolute)) !== expected) changed.push(name);
}
for (const [name, expected] of Object.entries(baseline.vueScriptBlocks)) {
  const absolute = path.join(root, name);
  if (!fs.existsSync(absolute)) { scriptMissing.push(name); continue; }
  const source = fs.readFileSync(absolute, 'utf8');
  const blocks = [...source.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map(match => match[0]).join('\n');
  if (sha(blocks) !== expected) scriptChanged.push(name);
}
const added = current.filter(name => !Object.hasOwn(baseline.files, name));
const report = {
  checkedAt: new Date().toISOString(),
  comparedWith: baseline.capturedAt,
  algorithm: 'sha256',
  kind: 'source identity verification, NOT a functional test or backup',
  scope: ['src/**', 'server/**', 'gateway/app/** (excluding __pycache__)', 'package.json', 'package-lock.json'],
  fileCount: Object.keys(baseline.files).length,
  vueScriptCount: Object.keys(baseline.vueScriptBlocks).length,
  changed, missing, added, scriptChanged, scriptMissing,
  unchanged: ![changed, missing, added, scriptChanged, scriptMissing].some(items => items.length),
  limitations: [
    'Compared only with the baseline captured during this design turn',
    'No application unit/E2E/build/performance or paid AI checks were run',
    'Database and credentials deliberately excluded and never read by this script',
    'File identity is not proof of correctness, recoverability or future non-regression'
  ]
};
fs.writeFileSync(path.join(dir, 'baseline-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.unchanged) process.exitCode = 1;
