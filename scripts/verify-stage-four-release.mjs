import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { scanReleaseTree } from './delivery-packages.mjs';

// Isolated delivery acceptance only: never opens the operator's actual database or credential sheet.
const project = resolve(fileURLToPath(new URL('../', import.meta.url)));
const extraction = await mkdtemp(join(tmpdir(), 'careerpilot-stage-four-release-'));
const root = join(extraction, 'source');
const zip = join(project, 'artifacts/stage-four-release/careerpilot-source.zip');
const reportPath = join(project, 'artifacts/stage-four-release-verification.json');
const taskEnv = { ...process.env };
for (const key of Object.keys(taskEnv)) if (key.startsWith('CAREERPILOT_')) delete taskEnv[key];
const children = new Set();
const report = { measuredAt: new Date().toISOString(), status: 'running', extraction, package: {}, checks: {}, limitations: ['loopback / generated initial identities / single Node SQLite', 'No public TLS, PostgreSQL, physical devices, real DeepSeek or production capacity acceptance'] };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function run(executable, args, cwd = root, env = taskEnv) {
  return new Promise((done, reject) => {
    const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    child.stdout.resume(); child.stderr.resume();
    const timer = setTimeout(() => { child.kill(); reject(Error('Verification command timed out')); }, 180000);
    child.once('error', e => { clearTimeout(timer); children.delete(child); reject(e); });
    child.once('exit', code => { clearTimeout(timer); children.delete(child); if (code === 0) done(); else reject(Error(`Verification command exited ${code}: ${args.slice(0, 2).join(' ')}`)); });
  });
}
async function port() {
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const value = server.address().port;
  await new Promise(done => server.close(done));
  return value;
}
async function start(databasePath) {
  const value = await port();
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/cli.ts', 'start'], { cwd: root, env: { ...taskEnv, CAREERPILOT_DATABASE: databasePath, CAREERPILOT_PORT: String(value) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child); child.stdout.resume(); child.stderr.resume();
  const origin = `http://127.0.0.1:${value}`;
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null) throw Error('Packaged CLI exited before readiness');
    try {
      const health = await fetch(origin + '/api/health');
      if (health.ok) { assert.deepEqual(await health.json(), { status: 'ok', schema: 3 }); return { child, origin }; }
    } catch { /* Refused connection while CLI is starting. */ }
    await new Promise(done => setTimeout(done, 100));
  }
  throw Error('Packaged CLI did not become ready');
}
async function stop(child) {
  if (child.exitCode === null) { const exited = new Promise(done => child.once('exit', done)); child.kill(); await exited; }
  children.delete(child);
}
async function login(origin, credentials) {
  const response = await fetch(origin + '/api/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
  assert.equal(response.status, 200);
  const session = await response.json();
  return { ...session, cookie: response.headers.get('set-cookie').split(';')[0] };
}
try {
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${zip.replaceAll("'", "''")}', '${root.replaceAll("'", "''")}')`], project);
  const manifest = JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8'));
  assert.equal(manifest.securityScan.status, 'passed');
  assert.deepEqual(await scanReleaseTree(root), []);
  const actual = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path); else actual.push(relative(root, path).replaceAll('\\', '/'));
    }
  }
  await walk(root);
  assert.deepEqual(actual.filter(p => p !== 'release-manifest.json').sort(), manifest.files.map(f => f.path).sort());
  for (const file of manifest.files) {
    assert(!file.path.split('/').some(p => ['server-data', 'node_modules', '.env', '.git', '.venv'].includes(p)));
    assert(!/\.(?:sqlite|sqlite-wal|sqlite-shm|pem|pfx|key)$/i.test(file.path));
    const bytes = await readFile(join(root, file.path));
    assert.equal(bytes.length, file.bytes, file.path); assert.equal(hash(bytes), file.sha256, file.path);
  }
  assert(actual.includes('start-service.cmd')); assert(actual.includes('docs/stage-four-runbook.md'));
  report.package = { files: manifest.files.length, sha256: hash(await readFile(zip)), manifest: 'matched', securityScan: 'passed' };
  console.log('Manifest, secret exclusions and hashes verified.');
  const npmCli = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  await run(process.execPath, [npmCli, 'ci']); report.checks.install = 'passed';
  await run(process.execPath, [npmCli, 'run', 'typecheck']); report.checks.typecheck = 'passed';
  await run(process.execPath, [npmCli, 'run', 'build']); report.checks.build = 'passed';
  console.log('Extracted source independently installed, typechecked and built.');
  const databasePath = join(extraction, 'acceptance.sqlite'), credentialsPath = join(extraction, 'acceptance-credentials.json');
  await run(process.execPath, ['--import', 'tsx', 'server/cli.ts', 'init', '--credentials-file', credentialsPath], root, { ...taskEnv, CAREERPILOT_DATABASE: databasePath });
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8')); assert.equal(credentials.length, 5);
  let service = await start(databasePath);
  assert.equal((await fetch(service.origin + '/')).status, 200);
  assert.match(await (await fetch(service.origin + '/runtime.js')).text(), /ONLINE__=true/);
  const resources = await (await fetch(service.origin + '/api/public/resources')).json(); assert.equal(resources.resources.length, 7);
  const roles = new Set();
  for (const row of credentials) {
    const session = await login(service.origin, row); roles.add(session.actor.role); assert.equal(session.accountStatus, 'approved');
    const profile = await fetch(service.origin + '/api/account', { headers: { Cookie: session.cookie } });
    assert.equal(profile.status, 200); assert.equal((await profile.json()).login, row.login);
    const logout = await fetch(service.origin + '/api/logout', { method: 'POST', headers: { Origin: service.origin, Cookie: session.cookie, 'X-CSRF-Token': session.csrf, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(logout.status, 200);
  }
  assert.equal(roles.size, 4); report.checks.initialAccountLoginLogout = '5 accounts / 4 roles passed';
  const registration = { login: 'release.student', password: 'Release-test-Password!', displayName: '林川', role: 'student', studentNo: '2027999988', majorId: 'major-1', cohortYear: 2027 };
  const registered = await fetch(service.origin + '/api/register', { method: 'POST', headers: { Origin: service.origin, 'Content-Type': 'application/json' }, body: JSON.stringify(registration) });
  assert.equal(registered.status, 201); report.checks.registration = 'passed';
  await stop(service.child); service = await start(databasePath);
  const pending = await login(service.origin, registration); assert.equal(pending.accountStatus, 'pending');
  assert.equal((await fetch(service.origin + '/api/read/readScopedSnapshot', { headers: { Cookie: pending.cookie } })).status, 403);
  for (const path of ['/server-data/acceptance.sqlite', '/.env', '/server/auth.ts']) assert.equal((await fetch(service.origin + path)).status, 404);
  await stop(service.child); report.checks.cliRestartPendingAccountAndBoundaries = 'passed';
  report.status = 'passed'; report.completedAt = new Date().toISOString();
  console.log('Packaged CLI initialization, five logins, registration, restart and access boundaries verified.');
} catch (error) {
  report.status = 'failed'; report.failure = error instanceof Error ? error.message : 'unknown'; process.exitCode = 1;
} finally {
  for (const child of [...children]) await stop(child);
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Delivery verification ${report.status}; report: ${reportPath}`);
}
