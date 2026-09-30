// Phase 6, item 26: Lighthouse 13 on both hosted-style builds, served locally under /Peace-Meal-Full/. Lighthouse's
// default mobile run: a simulated mid-range phone (4x slower CPU, slow 4G), a clean browser profile, so the first
// screen is the welcome screen. Chromium from this machine (CHROME_PATH), headless.
// Results: audit/results/lighthouse.json (scores and key numbers); full reports in audit/results/tmp/.
import fs from 'node:fs';
import path from 'node:path';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { buildSite, serve, CHROMIUM, ROOT, TMP } from './site.mjs';

// LIVE=1 runs against the live site instead (https://mchoisington.github.io/Peace-Meal-Full/), which GitHub Pages serves
// gzip-compressed; the local test server does not compress, so its download times are longer than a phone's would be.
// Behind a proxy (HTTPS_PROXY), Chromium is pointed at it and trusts its certificate authority (key hash computed here).
import crypto from 'node:crypto';
const LIVE = process.env.LIVE === '1';
const PROXY = process.env.HTTPS_PROXY || '';
const spki = (() => { const f = '/root/.ccr/agent-proxy-ca.crt'; if (!fs.existsSync(f)) return []; return (fs.readFileSync(f, 'utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []).map(p => crypto.createHash('sha256').update(new crypto.X509Certificate(p).publicKey.export({ type: 'spki', format: 'der' })).digest('base64')); })();
const netFlags = LIVE && PROXY ? ['--proxy-server=' + PROXY, ...(spki.length ? ['--ignore-certificate-errors-spki-list=' + spki.join(',')] : [])] : [];
if (!LIVE) buildSite();
const srv = LIVE ? { origin: 'https://mchoisington.github.io', close: async () => {} } : await serve();
const out = { lighthouse: null, target: LIVE ? 'live site (gzip)' : 'local test server (no compression)', runs: {} };
try {
  for (const build of ['lite', 'full']) {
    const chrome = await chromeLauncher.launch({ chromePath: process.env.CHROME_PATH || CHROMIUM, chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', ...netFlags] });
    try {
      const r = await lighthouse(`${srv.origin}/Peace-Meal-Full/${build}/`, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices'] });
      const lhr = r.lhr;
      out.lighthouse = lhr.lighthouseVersion;
      fs.writeFileSync(path.join(TMP, `lighthouse-${LIVE ? 'live-' : ''}${build}.json`), r.report);
      const a = id => lhr.audits[id] || {};
      out.runs[build] = {
        // A category whose audits could not all run has no score (null), which is not the same as 0.
        scores: Object.fromEntries(Object.entries(lhr.categories).map(([k, c]) => [k, c.score == null ? null : Math.round(c.score * 100)])),
        auditsThatErrored: Object.values(lhr.audits).filter(x => x.scoreDisplayMode === 'error').map(x => `${x.id}: ${String(x.errorMessage || '').slice(0, 160)}`),
        firstContentfulPaintMs: Math.round(a('first-contentful-paint').numericValue),
        largestContentfulPaintMs: Math.round(a('largest-contentful-paint').numericValue),
        totalBlockingTimeMs: Math.round(a('total-blocking-time').numericValue),
        speedIndexMs: Math.round(a('speed-index').numericValue),
        interactiveMs: Math.round(a('interactive').numericValue || 0) || null,
        mainThreadWorkMs: Math.round(a('mainthread-work-breakdown').numericValue),
        bootupTimeMs: Math.round(a('bootup-time').numericValue),
        totalByteWeight: a('total-byte-weight').numericValue,
        failedAudits: Object.values(lhr.audits).filter(x => x.score !== null && x.score < 0.9 && x.scoreDisplayMode !== 'informative' && x.scoreDisplayMode !== 'manual' && x.scoreDisplayMode !== 'notApplicable').map(x => `${x.id}: ${x.displayValue || x.score}`).slice(0, 20),
        runWarnings: lhr.runWarnings
      };
      console.log(build, JSON.stringify(out.runs[build].scores), `FCP ${out.runs[build].firstContentfulPaintMs} ms, LCP ${out.runs[build].largestContentfulPaintMs} ms, TBT ${out.runs[build].totalBlockingTimeMs} ms`);
    } finally { await chrome.kill(); }
  }
} finally { await srv.close(); }
fs.writeFileSync(path.join(ROOT, `audit/results/lighthouse${LIVE ? '-live' : ''}.json`), JSON.stringify(out, null, 1) + '\n');
