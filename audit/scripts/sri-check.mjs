// Phase 7, item 28 (second half): do the SHA-384 hashes pinned in src/ui/check.js match the photo reader's files as the
// CDNs serve them today? Reads the five URLs and hashes from the source (nothing hard-coded here), downloads each file,
// hashes it, and compares. Needs the internet. Run with NODE_USE_ENV_PROXY=1 behind a proxy.
// Results: audit/results/sri.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
const src = fs.readFileSync(path.join(ROOT, 'src/ui/check.js'), 'utf8');
const lines = src.split('\n');
const files = [];
lines.forEach((l, i) => {
  const m = l.match(/^\s*(\w+): \{ url: '([^']+)', integrity: '(sha384-[^']+)' \}/);
  if (m) files.push({ name: m[1], line: `src/ui/check.js:${i + 1}`, url: m[2], pinned: m[3] });
});
if (files.length !== 5) throw new Error(`expected 5 pinned files in check.js, found ${files.length}`);
const out = [];
for (const f of files) {
  const t0 = Date.now();
  try {
    const res = await fetch(f.url, { redirect: 'follow' });
    const buf = Buffer.from(await res.arrayBuffer());
    const actual = 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
    out.push({ ...f, status: res.status, bytes: buf.length, actual, match: actual === f.pinned, cacheControl: res.headers.get('cache-control'), ms: Date.now() - t0 });
  } catch (e) {
    out.push({ ...f, error: String(e.cause && e.cause.code || e.message) });
  }
}
fs.writeFileSync(path.join(ROOT, 'audit/results/sri.json'), JSON.stringify({ checkedAt: new Date().toISOString(), files: out }, null, 1) + '\n');
for (const r of out) console.log(`${r.match ? 'MATCH' : r.error ? 'ERROR' : 'DIFFERENT'}  ${r.name.padEnd(8)} ${r.line}  ${r.status || ''} ${r.bytes || ''} bytes  ${r.error || ''}`);
console.log(`${out.filter(r => r.match).length} of ${out.length} served files match their pinned hash; total ${(out.reduce((n, r) => n + (r.bytes || 0), 0) / 1048576).toFixed(2)} MB`);
if (out.some(r => !r.match)) process.exitCode = 1;
