// Breathe: the 10-minute Visual Reset, a self-contained grounding activity, embedded as-is.
// It runs from breathe.html when the app is served from a folder, or from inline HTML in the single-file build.
import { uiPageHeader, uiIcon } from './common.js';

export function renderBreatheScreen(main) {
  const inline = typeof window !== 'undefined' && window.__APP_DATA__ && window.__APP_DATA__.breatheHtml;
  main.innerHTML = `
    ${uiPageHeader('Take a minute to breathe', 'A short visual reset. Nothing here is tracked or saved. Press play, follow the screen, and come back when you are ready. Ten minutes is the full version; stopping early is fine.', `<button type="button" class="btn small" id="breathe-full">${uiIcon('share')}Full screen</button>`)}
    <div class="breathe-frame">
      <iframe id="breathe-iframe" title="Visual reset" ${inline ? '' : 'src="breathe.html"'} loading="eager"></iframe>
    </div>`;
  const frame = main.querySelector('#breathe-iframe');
  if (inline) frame.srcdoc = window.__APP_DATA__.breatheHtml;
  main.querySelector('#breathe-full').addEventListener('click', () => {
    const el = frame;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) req.call(el).catch(() => {});
  });
}
