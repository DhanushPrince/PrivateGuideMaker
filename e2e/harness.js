// Shared helpers for the StepSafe feature tests (dev-only).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

// All paths are relative to the repo. Override with env vars if needed.
const ROOT = path.resolve(__dirname, '..');
const EXT = path.resolve(process.env.EXT_DIR || path.join(ROOT, 'extension'));   // folder with manifest.json
const OUT = path.resolve(process.env.E2E_OUT || path.join(__dirname, 'output'));  // screenshots, exports, results.json
const EXPORTS = path.join(OUT, 'exports');
const RESULTS = path.join(OUT, 'results.json');
const PROFILE = path.join(OUT, 'profile');  // Chromium profile shared by feat-a..e (state carries over between them)
const HEADLESS = process.env.HEADLESS !== '0';  // HEADLESS=0 shows the browser window
const SLOWMO = +process.env.SLOWMO || 0;
const SITE = path.join(__dirname, 'site');
// Test site + DevTools ports (run-all.js picks free ones and passes them down; defaults 8765 / 9333).
const PORT = +process.env.E2E_PORT || 8765;
const CDP_PORT = +process.env.E2E_CDP_PORT || 9333;
const SITE_URL = `http://localhost:${PORT}`;
fs.mkdirSync(EXPORTS, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function serve(port = PORT) {
  return new Promise((res, rej) => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      const f = path.join(SITE, path.normalize(p));
      if (!f.startsWith(SITE) || !fs.existsSync(f)) { r.statusCode = 404; return r.end('nf'); }
      r.setHeader('content-type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream');
      r.end(fs.readFileSync(f));
    }).on('error', e => rej(new Error(`Cannot serve test site on port ${port} (${e.code}). Set E2E_PORT to a free port.`))).listen(port, () => res(srv));
  });
}

async function launch(extDir, profile) {
  const ctx = await chromium.launchPersistentContext(profile, {
    // channel 'chromium' = Playwright's full bundled Chromium (from `npx playwright install chromium`).
    // Extensions need it: the default headless-shell build cannot load extensions. headless:true then runs Chrome's "new" headless mode.
    channel: 'chromium', headless: HEADLESS, slowMo: SLOWMO, viewport: { width: 1100, height: 850 }, acceptDownloads: true,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, `--remote-debugging-port=${CDP_PORT}`],
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  const swLogs = [];
  sw.on('console', m => swLogs.push(`[${m.type()}] ${m.text()}`));
  return { ctx, sw, extId, swLogs, url: (p) => `chrome-extension://${extId}/${p}` };
}

// Collect page errors / console errors for an extension page.
function watchErrors(page, tag, sink) {
  page.on('pageerror', e => sink.push(`${tag}: pageerror ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') sink.push(`${tag}: console.error ${m.text()}`); });
}

function record(feature, result, evidence, notes) {
  const all = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, 'utf8')) : {};
  all[feature] = { result, evidence, notes, at: new Date().toISOString() };
  fs.writeFileSync(RESULTS, JSON.stringify(all, null, 2));
  console.log(`${result.padEnd(8)} ${feature} — ${notes}`);
}

// Run storage.js functions from an extension page.
const store = (page, fn, ...args) => page.evaluate(async ([fn, args]) => {
  const m = await import(chrome.runtime.getURL('lib/storage.js'));
  return m[fn](...args);
}, [fn, args]);

const saveDataUrl = (dataUrl, file) => fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

module.exports = { PORT, CDP_PORT, SITE_URL, ROOT, EXT, PROFILE, HEADLESS, OUT, EXPORTS, sleep, serve, launch, watchErrors, record, store, saveDataUrl };

// Minimal raw-CDP client for targets Playwright doesn't expose (the real side panel).
async function cdpTarget(port, match) {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const t = list.find(x => x.url.includes(match));
    if (t) {
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
      let id = 0; const pend = new Map();
      ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
      const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
      const evaluate = async (expr) => {
        const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
        return r.result?.result?.value;
      };
      const click = async (sel) => {
        const box = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; e.scrollIntoView({block:'center'}); const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
        if (!box) throw new Error('no element ' + sel);
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
          await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
      };
      const screenshot = async (file) => {
        const r = await send('Page.captureScreenshot', { format: 'png' });
        require('fs').writeFileSync(file, Buffer.from(r.result.data, 'base64'));
      };
      await send('Runtime.enable'); await send('Page.enable');
      return { t, ws, send, evaluate, click, screenshot, close: () => ws.close() };
    }
    await sleep(300);
  }
  throw new Error('target not found: ' + match);
}

// Open the real side panel via chrome.sidePanel.open() from a trusted (Playwright) click in an extension page.
async function openSidePanel(extPage) {
  const win = await extPage.evaluate(() => new Promise(r => chrome.windows.getCurrent(w => r(w.id))));
  await extPage.evaluate((w) => {
    const b = document.createElement('button'); b.id = '__open_sp'; b.textContent = 'open side panel';
    b.style = 'position:fixed;top:0;left:0;z-index:2147483647';
    b.onclick = () => chrome.sidePanel.open({ windowId: w }).then(() => b.dataset.ok = '1', e => b.dataset.err = e.message);
    document.body.appendChild(b);
  }, win);
  await extPage.click('#__open_sp'); await sleep(800);
  const res = await extPage.$eval('#__open_sp', b => ({ ...b.dataset }));
  await extPage.evaluate(() => document.getElementById('__open_sp').remove());
  return res;
}
module.exports.cdpTarget = cdpTarget;
module.exports.openSidePanel = openSidePanel;
