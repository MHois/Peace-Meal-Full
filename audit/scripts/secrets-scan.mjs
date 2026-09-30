// Phase 2, item 9: secrets and personal details in every blob of every commit on every branch, in commit messages,
// and in the working tree. Matches are reported by location and pattern name only; the matched text is never printed.
// A private list of real names can be checked too: PM_PRIVATE_NAMES_FILE=/path/outside/repo (one name per line). The
// list is never read from, or written to, the repository.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../../', import.meta.url).pathname;
const git = (...a) => execFileSync('git', a, { cwd: root, maxBuffer: 1 << 30 });
const SECRET = {
  'AWS access key id': /\bAKIA[0-9A-Z]{16}\b/,
  'GitHub token': /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/,
  'Slack token': /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  'Google API key': /\bAIza[0-9A-Za-z_-]{35}\b/,
  'Stripe live key': /\b[sr]k_live_[0-9a-zA-Z]{20,}/,
  'OpenAI key': /\bsk-(proj-)?[A-Za-z0-9_-]{20,}T3BlbkFJ/,
  'Anthropic key': /\bsk-ant-[A-Za-z0-9_-]{20,}/,
  'Private key block': /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/,
  'JSON Web Token': /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  'Private JWK (EC/RSA "d")': /"kty"\s*:\s*"(EC|RSA)"[^}]*"d"\s*:\s*"[A-Za-z0-9_-]{20,}"/,
  'Credentials in a URL': /\bhttps?:\/\/[^\s/:@'"]+:[^\s/:@'"]{3,}@[^\s'"]+/,
  'Password or key assignment': /\b(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i
};
const PERSONAL = {
  'Email address': /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  'US phone number': /(?<![\d-])\(?\b[2-9]\d{2}\)?[-. ][2-9]\d{2}[-. ]\d{4}\b/,
  'Street address': /\b\d{2,5}\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?\s+(Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|Boulevard|Blvd|Way)\b\.?/,
  'Date of birth wording': /\b(DOB|date of birth|born on)\b/i
};
// Known public, non-personal addresses (commit trailers, licences, support lines already cited in the app's sources).
const ALLOW_EMAIL = /^(noreply@anthropic\.com|noreply@github\.com|[a-z0-9._+-]+@users\.noreply\.github\.com|.*@(example|test)\.(com|org))$/i;
// Public organisation numbers the app cites on purpose (the National Alliance for Eating Disorders helpline, a source).
const ALLOW_PHONE = /866\D{0,3}662\D{0,3}1235/;
const privateNames = process.env.PM_PRIVATE_NAMES_FILE && fs.existsSync(process.env.PM_PRIVATE_NAMES_FILE)
  ? fs.readFileSync(process.env.PM_PRIVATE_NAMES_FILE, 'utf8').split('\n').map(s => s.trim()).filter(s => s.length >= 3) : [];
const nameRes = privateNames.map(n => new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'));

const findings = [];
function scan(text, where) {
  const lines = text.split('\n');
  lines.forEach((l, i) => {
    for (const [name, re] of Object.entries(SECRET)) if (re.test(l)) findings.push({ kind: 'secret', pattern: name, where, line: i + 1 });
    for (const [name, re] of Object.entries(PERSONAL)) {
      const m = l.match(new RegExp(re.source, re.flags + 'g'));
      if (!m) continue;
      const real = name === 'Email address' ? m.filter(x => !ALLOW_EMAIL.test(x)) : name === 'US phone number' ? m.filter(x => !ALLOW_PHONE.test(x)) : m;
      if (real.length) findings.push({ kind: 'personal', pattern: name, where, line: i + 1, count: real.length });
    }
    nameRes.forEach(re => { if (re.test(l)) findings.push({ kind: 'private name list', pattern: 'a name on the private list', where, line: i + 1 }); });
  });
}
// 1. every blob reachable from any ref
const objects = git('rev-list', '--all', '--objects').toString().trim().split('\n').map(l => { const [sha, ...p] = l.split(' '); return { sha, path: p.join(' ') }; });
const typeOf = new Map(execFileSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], { cwd: root, input: objects.map(o => o.sha).join('\n'), maxBuffer: 1 << 28 }).toString().trim().split('\n').map(l => { const [s, t, z] = l.split(' '); return [s, { t, z: Number(z) }]; }));
let blobs = 0, bytes = 0;
const seen = new Set();
for (const o of objects) {
  const t = typeOf.get(o.sha);
  if (!t || t.t !== 'blob' || seen.has(o.sha)) continue;
  seen.add(o.sha);
  const buf = git('cat-file', '-p', o.sha);
  blobs++; bytes += buf.length;
  if (/\.(png|jpe?g|gif|woff2?|ico|pdf|zip|gz)$/i.test(o.path)) continue;   // binary: see the image note in the report
  scan(buf.toString('utf8'), `blob ${o.sha.slice(0, 10)} ${o.path}`);
}
// 2. commit messages and author lines
const log = git('log', '--all', '--format=%H%x00%an <%ae>%x00%cn <%ce>%x00%B%x01').toString().split('\x01').filter(s => s.trim());
for (const entry of log) { const [h, a, c, body] = entry.trim().split('\x00'); scan(body || '', `commit message ${h.slice(0, 10)}`); scan(`${a}\n${c}`, `commit author ${h.slice(0, 10)}`); }
// 3. files in the working tree that are not committed yet (this audit's own output)
for (const f of git('ls-files', '--others', '--exclude-standard').toString().trim().split('\n').filter(Boolean).filter(f => f !== 'audit/scripts/secrets-scan.mjs' && f !== 'audit/results/secrets-scan.json')) {
  if (/\.(png|jpe?g|gif|woff2?)$/i.test(f)) continue;
  scan(fs.readFileSync(root + f, 'utf8'), `working tree ${f}`);
}
const summary = { commits: log.length, blobsScanned: blobs, bytes, privateNamesChecked: privateNames.length, secrets: findings.filter(f => f.kind === 'secret'), personal: findings.filter(f => f.kind === 'personal'), privateNameHits: findings.filter(f => f.kind === 'private name list').length };
fs.writeFileSync(root + 'audit/results/secrets-scan.json', JSON.stringify(summary, null, 1) + '\n');
console.log(JSON.stringify({ commits: summary.commits, blobsScanned: blobs, bytes, secrets: summary.secrets.length, personal: summary.personal.length, privateNamesChecked: summary.privateNamesChecked, privateNameHits: summary.privateNameHits }, null, 1));
for (const f of [...summary.secrets, ...summary.personal]) console.log(`${f.kind} | ${f.pattern} | ${f.where}:${f.line}`);
