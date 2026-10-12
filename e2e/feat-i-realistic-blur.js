// Realistic app page (SPA routes, table, inputs, contenteditable, shadow DOM, same/cross-origin iframes, canvas):
// blur is applied on screen while recording, in shadow roots and iframes, and follows the side-panel toggle.
const h = require('./harness'); const fs = require('fs');
const EXT = process.argv[2] || h.EXT; const OUTD = h.OUT; const PROFILE = process.argv[3] || (h.OUT + '/profile-realistic');
fs.rmSync(PROFILE, { recursive: true, force: true });
const blurred = (frame, sel, shadowHost) => frame.evaluate(([sel, sh]) => {
  let el = sh ? document.querySelector(sh)?.shadowRoot?.querySelector(sel) : document.querySelector(sel);
  if (!el) return 'absent';
  for (let e = el; e; e = e.parentElement || e.getRootNode()?.host) if (/blur/.test(getComputedStyle(e).filter)) return 'BLUR';
  return 'clear';
}, [sel, shadowHost]).catch(e => 'err:' + e.message.slice(0, 40));
(async () => {
  const srv = await h.serve();
  const { ctx, url } = await h.launch(EXT, PROFILE);
  const page = await ctx.newPage(); await page.goto(h.SITE_URL + '/app.html'); await h.sleep(800);
  const sp = await ctx.newPage(); await sp.goto(url('sidepanel/sidepanel.html')); await h.sleep(400);
  const report = {};
  async function state(tag) {
    const fs_ = page.frames(); const same = fs_.find(f => f.url().includes('localhost') && f !== page.mainFrame()); const cross = fs_.find(f => f.url().includes('127.0.0.1'));
    const r = {};
    for (const s of ['#t-name', '#t-email', '#t-phone', '#i-email', '#i-name', '#ce', '#s-email', '#s-key']) r[s] = await blurred(page.mainFrame(), s);
    r.shadow = await blurred(page.mainFrame(), '#sh-email', '#host');
    r.iframeSame = same ? await blurred(same, '#f-email') : 'noframe';
    r.iframeCross = cross ? await blurred(cross, '#f-email') : 'noframe';
    report[tag] = r; console.log(tag, JSON.stringify(r));
  }
  const tab = async () => (await sp.evaluate(() => chrome.tabs.query({ url: 'http://localhost/*' })))[0].id;
  const start = async () => { await page.bringToFront(); return sp.evaluate((id) => chrome.runtime.sendMessage({ type: 'START_RECORDING', tabId: id, title: 'probe' }), await tab()); };
  const snap = async (name) => { await sp.evaluate(() => chrome.runtime.sendMessage({ type: 'MANUAL_CAPTURE' })); await h.sleep(900); };
  const save = async (gid, name) => { const st = await h.store(sp, 'listSteps', gid); const s = st[st.length - 1]?.screenshotRaw; if (s) h.saveDataUrl(s, `${OUTD}/13-${name}.jpg`); };
  // A. tab opened before recording; default ON
  let r = await start(); await h.sleep(1500); await state('A-on-start');
  await snap(); await save(r.guideId, 'A-users');
  await page.click('#i-name'); await page.keyboard.type(' x'); await h.sleep(300);
  await page.click('#nav-settings'); await h.sleep(800); await state('A-after-spa-route'); await snap(); await save(r.guideId, 'A-settings');
  await sp.evaluate(() => chrome.runtime.sendMessage({ type: 'DISCARD_RECORDING' })); await h.sleep(500);
  await page.goto(h.SITE_URL + '/app.html'); await h.sleep(800); await state('A-after-stop');
  // B. toggle OFF before start, then ON mid-recording
  await sp.bringToFront(); await sp.click('label.sp-blur-switch'); await h.sleep(300);
  r = await start(); await h.sleep(1500); await state('B-off-start');
  await sp.bringToFront(); await sp.click('label.sp-blur-switch'); await h.sleep(600); await page.bringToFront(); await h.sleep(300);
  await state('B-on-mid'); await snap(); await save(r.guideId, 'B-on-mid');
  await sp.evaluate(() => chrome.runtime.sendMessage({ type: 'DISCARD_RECORDING' })); await h.sleep(500);
  // D. start → discard → start again without navigating
  await sp.bringToFront(); r = await start(); await h.sleep(1200);
  await sp.evaluate(() => chrome.runtime.sendMessage({ type: 'DISCARD_RECORDING' })); await h.sleep(500);
  r = await start(); await h.sleep(1500); await state('D-restart-same-page');
  await sp.evaluate(() => chrome.runtime.sendMessage({ type: 'DISCARD_RECORDING' })); await h.sleep(500);
  const A = report['A-on-start'], R = report['A-after-spa-route'], S = report['A-after-stop'], B0 = report['B-off-start'], B1 = report['B-on-mid'], D = report['D-restart-same-page'];
  const pii = (x) => ['#t-email', '#t-phone', '#i-email', '#ce'].every(k => x[k] === 'BLUR');
  h.record('13a. Realistic app: table/input/contenteditable PII blurred on screen at record start (tab opened before recording)', pii(A) ? 'PASS' : 'FAIL', '13-A-users.jpg', JSON.stringify(A));
  h.record('13b. Realistic app: open shadow DOM + same-origin + cross-origin iframe PII blurred', A.shadow === 'BLUR' && A.iframeSame === 'BLUR' && A.iframeCross === 'BLUR' ? 'PASS' : 'FAIL', '13-A-users.jpg', `shadow=${A.shadow} same=${A.iframeSame} cross=${A.iframeCross}`);
  h.record('13c. Realistic app: SPA route change content blurred', R['#s-email'] === 'BLUR' ? 'PASS' : 'FAIL', '13-A-settings.jpg', JSON.stringify(R));
  h.record('13d. Realistic app: blur removed after recording stops', Object.values(S).every(v => v !== 'BLUR') ? 'PASS' : 'FAIL', '', JSON.stringify(S));
  h.record('13e. Toggle OFF at start → nothing blurred; ON mid-recording → applied live (incl. shadow/iframes)', Object.values(B0).every(v => v !== 'BLUR') && pii(B1) && B1.shadow === 'BLUR' && B1.iframeCross === 'BLUR' ? 'PASS' : 'FAIL', '13-B-on-mid.jpg', JSON.stringify({ B0, B1 }));
  h.record('13f. Restart recording on same page (no reload) re-applies blur', pii(D) ? 'PASS' : 'FAIL', '', JSON.stringify(D));
  h.record('13g. Not blurred by design: names without PII pattern, non-pattern secrets, canvas text', 'INFO', '13-A-users.jpg', `name=${A['#t-name']} nameInput=${A['#i-name']} apiKey=${R['#s-key']} (canvas text is pixels; use Alt+click or the annotator)`);
  fs.writeFileSync(OUTD + '/13-realistic-report.json', JSON.stringify(report, null, 2));
  await ctx.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
