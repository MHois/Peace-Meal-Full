// Phase 7, item 32: does the live site serve the current main build? Reads the build stamp the Pages workflow writes
// into lite/sw.js and full/sw.js (the first 12 characters of the commit it deployed), compares it with the latest
// commit on main on GitHub, and compares each live page byte for byte with a local build of that commit.
// Needs the internet (run with NODE_USE_ENV_PROXY=1 behind a proxy). Results: audit/results/live-stamp.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
const LIVE = process.env.PM_LIVE_URL || 'https://mhois.github.io/Peace-Meal-Full/';
const sha = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const main = execFileSync('git', ['ls-remote', 'origin', 'refs/heads/main'], { cwd: ROOT }).toString().split(/\s/)[0];
const out = { checkedAt: new Date().toISOString(), live: LIVE, mainOnGitHub: main.slice(0, 12), builds: {} };
// A local build of that exact commit, in a scratch copy, to compare the pages byte for byte.
const scratch = path.join(ROOT, 'audit/results/tmp/live-compare');
fs.rmSync(scratch, { recursive: true, force: true }); fs.mkdirSync(scratch, { recursive: true });
let local = null;
try {
  execFileSync('git', ['fetch', '--quiet', '--depth=1', 'origin', main], { cwd: ROOT });
  execFileSync('sh', ['-c', `git archive ${main} | tar -x -C "${scratch}"`], { cwd: ROOT });
  execFileSync(process.execPath, ['tools/bundle.mjs', '--lite', '--pages'], { cwd: scratch, stdio: 'pipe' });
  execFileSync(process.execPath, ['tools/bundle.mjs', '--pages'], { cwd: scratch, stdio: 'pipe' });
  local = b => path.join(scratch, 'dist/pages', b, 'index.html');
} catch (e) { out.localBuildError = String(e.message).split('\n')[0]; }
for (const b of ['lite', 'full']) {
  const sw = await (await fetch(LIVE + b + '/sw.js', { cache: 'no-store' })).text();
  const stamp = (sw.match(/const VERSION = APP \+ '([0-9a-f]{12})'/) || sw.match(/pm-pages-(?:lite-|full-)?([0-9a-f]{12})/) || [])[1] || null;
  const page = Buffer.from(await (await fetch(LIVE + b + '/', { cache: 'no-store' })).arrayBuffer());
  const row = { stamp, matchesMain: stamp === main.slice(0, 12), liveBytes: page.length, liveSha256: sha(page) };
  if (local) { const l = fs.readFileSync(local(b)); row.localBytes = l.length; row.localSha256 = sha(l); row.identicalToLocalBuild = row.liveSha256 === row.localSha256; }
  out.builds[b] = row;
  console.log(`${b}: live stamp ${stamp}, main ${main.slice(0, 12)}: ${row.matchesMain ? 'MATCH' : 'DIFFERENT'}; page ${page.length} bytes${local ? `, ${row.identicalToLocalBuild ? 'identical to' : 'DIFFERENT from'} a local build of that commit` : ''}`);
}
fs.writeFileSync(path.join(ROOT, 'audit/results/live-stamp.json'), JSON.stringify(out, null, 1) + '\n');
if (Object.values(out.builds).some(r => !r.matchesMain || r.identicalToLocalBuild === false)) process.exitCode = 1;
