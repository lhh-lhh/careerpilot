import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createOnlineApp } from '../server/app';

// Isolated synthetic localhost load, never a production capacity promise.
const root = await mkdtemp(join(tmpdir(), 'careerpilot-load-'));
const app = await createOnlineApp({ databasePath: join(root, 'load.sqlite'), seed: true });
const results: { operation: string; ms: number; status: number }[] = [];
const subscriptions: { abort: AbortController; reader: ReadableStreamDefaultReader<Uint8Array> }[] = [];
try {
  for (let i = 2; i <= 13; i++) await app.provision(`student${String(i).padStart(3,'0')}`, 'Load-test-Password-only!');
  await app.listen(0); const address = app.server.address(); if (!address || typeof address === 'string') throw Error('no port');
  const base = `http://127.0.0.1:${address.port}`;
  const clients = await Promise.all(Array.from({ length: 12 }, async (_, index) => {
    const response = await fetch(base + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: `student${String(index + 2).padStart(3,'0')}`, password: 'Load-test-Password-only!' }) });
    if (!response.ok) throw Error('load fixture login failed');
    const { csrf } = await response.json(); const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
    const abort = new AbortController(), events = await fetch(base + '/api/events', { headers: { Cookie: cookie }, signal: abort.signal });
    const reader = events.body!.getReader(); await reader.read(); subscriptions.push({ abort, reader });
    return { cookie, csrf };
  }));
  const started = performance.now();
  await Promise.all(clients.map(async (client) => {
    for (let i = 0; i < 10; i++) {
      let tick = performance.now();
      const read = await fetch(base + '/api/read/readScopedSnapshot', { headers: { Cookie: client.cookie } }); const snapshot = await read.json();
      results.push({ operation: 'scopedRead', ms: performance.now() - tick, status: read.status });
      if (!read.ok) throw Error('load read failed');
      if (i % 2) continue;
      const resume = snapshot.resumes[0]; tick = performance.now();
      const write = await fetch(base + '/api/commands', { method: 'POST', headers: { Cookie: client.cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': client.csrf }, body: JSON.stringify({ type: 'SAVE_RESUME', commandId: crypto.randomUUID(), entityId: resume.id, expectedRevision: resume.revision, payload: { sections: resume.sections } }) });
      await write.arrayBuffer(); results.push({ operation: 'resumeWrite', ms: performance.now() - tick, status: write.status });
    }
  }));
  const elapsedMs = performance.now() - started;
  const summary = (rows: typeof results) => {
    const times = rows.map(r => r.ms).sort((a,b) => a-b), percentile = (p: number) => Number(times[Math.ceil(times.length*p)-1]!.toFixed(2));
    return { count: rows.length, p50Ms: percentile(.5), p95Ms: percentile(.95), maxMs: percentile(1), errors: rows.filter(r => r.status >= 400).length };
  };
  const report = { measuredAt: new Date().toISOString(), scope: 'synthetic-loopback-single-node-sqlite', node: process.version, platform: process.platform, cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryGiB: Number((totalmem()/1024**3).toFixed(1)), concurrency: clients.length, sseConnections: subscriptions.length, elapsedMs: Number(elapsedMs.toFixed(2)), all: summary(results), reads: summary(results.filter(r => r.operation === 'scopedRead')), writes: summary(results.filter(r => r.operation === 'resumeWrite')), errorRate: results.filter(r => r.status >= 400).length / results.length, limits: 'No TLS, WAN, disk contention, PostgreSQL or production data volumes; not a real-user capacity guarantee.' };
  await mkdir(resolve('artifacts'), { recursive: true }); await writeFile(resolve('artifacts/online-load.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if (report.all.errors) process.exitCode = 1;
} finally {
  for (const s of subscriptions) { s.abort.abort(); await s.reader.cancel().catch(() => undefined); }
  await app.close(); await rm(root, { recursive: true, force: true });
}
