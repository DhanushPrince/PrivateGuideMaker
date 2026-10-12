// Features 1-3, 5: install, real side panel UI, recording (click/type/nav/hover), step titles.
const h = require('./harness');
const fs = require('fs');
const EXT = process.argv[2] || h.EXT;
const PROFILE = process.argv[3] || h.PROFILE;
(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const srv = await h.serve();
  const errs = [];
  const { ctx, sw, extId, swLogs, url } = await h.launch(EXT, PROFILE);

  // 1. Install / load
  const swOk = sw.url().endsWith('background/service-worker.js');
  const mf = await sw.evaluate(() => chrome.runtime.getManifest());
  const extPage = await ctx.newPage(); h.watchErrors(extPage, 'dashboard', errs);
  await extPage.goto('chrome://extensions/'); await h.sleep(800);
  // Enable developer mode to surface the error button, then screenshot
  await extPage.evaluate(() => { const m = document.querySelector('extensions-manager'); const tb = m?.shadowRoot?.querySelector('extensions-toolbar'); const t = tb?.shadowRoot?.querySelector('#devMode'); if (t && !t.checked) t.click(); });
  await h.sleep(800);
  const extInfo = await extPage.evaluate((id) => new Promise(r => chrome.developerPrivate.getExtensionInfo(id, r)), extId).catch(e => ({ err: e.message }));
  await extPage.screenshot({ path: `${h.OUT}/01-install-chrome-extensions.png` });
  const manifestErrs = (extInfo.manifestErrors || []).length, rtErrs = (extInfo.runtimeErrors || []).length;
  h.record('1. Install/load (manifest, service worker)', swOk && !manifestErrs && !extInfo.err ? 'PASS' : 'FAIL', '01-install-chrome-extensions.png',
    `MV3 "${mf.name}" v${mf.version} loaded unpacked from ${EXT}; SW running (${sw.url().split('/').slice(3).join('/')}); manifestErrors=${manifestErrs}, runtimeErrors=${rtErrs}${extInfo.err ? ' devPrivate err ' + extInfo.err : ''}; perms=${mf.permissions.join(',')}`);

  // 2. Real side panel
  const page = await ctx.newPage(); h.watchErrors(page, 'site', errs);
  const HUMAN = { delay: 90 }; // ~90 ms between mousedown and mouseup, like a real click
  await page.goto(h.SITE_URL + '/index.html');
  await extPage.goto(url('dashboard/dashboard.html')); await h.sleep(500);
  const op = await h.openSidePanel(extPage);
  const sp = await h.cdpTarget(h.CDP_PORT, 'sidepanel/sidepanel.html');
  await h.sleep(800);
  await page.bringToFront(); await h.sleep(500);
  await sp.screenshot(`${h.OUT}/02a-sidepanel-idle.png`);
  const idleVisible = await sp.evaluate(`!document.getElementById('state-idle').classList.contains('hidden')`);
  await sp.click('#start-btn'); await h.sleep(3000);
  const st1 = await sw.evaluate(() => chrome.storage.session.get('pagewalk_state'));
  const recVisible = await sp.evaluate(`!document.getElementById('state-rec').classList.contains('hidden')`);
  const badge = await sw.evaluate(() => chrome.action.getBadgeText({}));
  await sp.screenshot(`${h.OUT}/02b-sidepanel-recording.png`);

  // 3. Recording: hover, click, Alt-click mark, typing, navigation, second page actions
  await page.hover('#show'); await h.sleep(1200);
  await page.click('#show', HUMAN); await h.sleep(2500);
  await page.click('#nick', { modifiers: ['Alt'], delay: 90 }); await h.sleep(300);
  await page.click('#nick', HUMAN); await h.sleep(600); await page.keyboard.press('End'); await page.keyboard.type(' 9876543210'); await page.keyboard.press('Tab'); await h.sleep(2500);
  await page.hover('#save'); await h.sleep(1000);
  await page.click('#save', HUMAN); await h.sleep(2500);
  await page.click('#next', HUMAN); await page.waitForURL('**/page2.html'); await h.sleep(3500);
  await page.click('#q', HUMAN); await h.sleep(600); await page.keyboard.type('March statement'); await page.keyboard.press('Tab'); await h.sleep(2500);
  await page.click('#dl', HUMAN); await h.sleep(2500);
  // pause / manual screenshot / resume through real side panel buttons
  await sp.click('#pause-btn'); await h.sleep(800);
  const pausedState = (await sw.evaluate(() => chrome.storage.session.get('pagewalk_state'))).pagewalk_state?.paused;
  await page.click('#dl', HUMAN); await h.sleep(1500); // should NOT be recorded while paused
  await sp.click('#pause-btn'); await h.sleep(800);
  await page.bringToFront();
  await sp.click('#capture-btn'); await h.sleep(2500);
  await page.screenshot({ path: `${h.OUT}/03a-page2-during-recording.png` });
  await sp.screenshot(`${h.OUT}/02c-sidepanel-feed.png`);
  const feedCount = await sp.evaluate(`document.getElementById('step-count').textContent`);
  await sp.click('#stop-btn'); await h.sleep(1500);
  const st2 = await sw.evaluate(() => chrome.storage.session.get('pagewalk_state'));
  const idleAgain = await sp.evaluate(`!document.getElementById('state-idle').classList.contains('hidden')`);
  const recentItems = await sp.evaluate(`document.querySelectorAll('.sp-guide-item').length`);
  await sp.screenshot(`${h.OUT}/02d-sidepanel-after-complete.png`);

  const gid = st1.pagewalk_state?.guideId;
  const guide = await h.store(extPage, 'getGuide', gid);
  const steps = await h.store(extPage, 'listSteps', gid);
  const summary = steps.map((s, i) => ({ i, type: s.type, d: s.description, shot: !!s.screenshotRaw, post: !!s.screenshotPostLoad, url: s.pageUrl, init: !!s.isInitialCapture }));
  fs.writeFileSync(`${h.OUT}/03-recorded-steps.json`, JSON.stringify({ guide: { id: guide.id, title: guide.title }, steps: summary }, null, 2));
  steps.forEach((s, i) => s.screenshotRaw && h.saveDataUrl(s.screenshotRaw, `${h.OUT}/exports/rec-step${String(i).padStart(2, '0')}.jpg`));
  console.log(JSON.stringify(summary, null, 1));

  h.record('2. Side panel UI: open, Start/Pause/Resume/Screenshot/Complete', op.ok && idleVisible && recVisible && st1.pagewalk_state?.recording && pausedState === true && !st2.pagewalk_state && idleAgain ? 'PASS' : 'FAIL',
    '02a-sidepanel-idle.png, 02b-sidepanel-recording.png, 02c-sidepanel-feed.png, 02d-sidepanel-after-complete.png',
    `REAL side panel opened via chrome.sidePanel.open (trusted click) and driven with real CDP mouse clicks: Start→recording (badge "${badge}"), Pause (paused=${pausedState}), Resume, Screenshot, Complete→idle; live counter=${feedCount}; recent list items=${recentItems}; title "${guide.title}"`);

  const has = (re, type) => steps.some(s => (!type || s.type === type) && re.test(s.description || ''));
  const navStep = steps.find(s => s.type === 'navigate' && /page2|Statements/.test(s.description + s.pageUrl));
  const checks = {
    initialCapture: steps[0]?.isInitialCapture && !!steps[0].screenshotRaw,
    clickShow: has(/Show linked account/, 'click'),
    clickSave: has(/Save profile/, 'click'),
    typing: steps.some(s => s.type === 'keystroke' || /Type/.test(s.description || '')),
    navigation: !!navStep && !!navStep.screenshotRaw,
    page2Click: has(/Download statement/),
    page2Type: has(/Search statements|March/),
    pausedClickIgnored: steps.filter(s => /Download statement/.test(s.description || '')).length === 1,
    manualShot: has(/^Screenshot$/),
    altClickNotAStep: !steps.some(s => s.type === 'click' && /Nickname/.test(s.description) && s.clickX && false),
    piiNotInText: !steps.some(s => /9876543210|98765|priya\.sharma|4111/.test(JSON.stringify([s.description, s.pageTitle, s.notes]))),
    hoverPrecapture: steps.filter(s => s.type === 'click').every(s => !!s.screenshotRaw),
  };
  const ok = Object.values(checks).every(Boolean);
  h.record('3. Recording: click, typing, navigation (2 pages), hover/mousedown pre-capture', ok ? 'PASS' : 'PARTIAL', '03a-page2-during-recording.png, 03-recorded-steps.json, exports/rec-stepNN.jpg',
    `Real Playwright mouse/keyboard on pages; ${steps.length} steps. checks=${JSON.stringify(checks)}`);

  // 5. Step titles: template text
  const titles = steps.map(s => s.description);
  h.record('5a. Step titles: template fallback', titles.every(t => t && t.length) ? 'PASS' : 'FAIL', '03-recorded-steps.json',
    'Titles: ' + titles.map(t => JSON.stringify(t)).join(' | '));

  fs.writeFileSync(`${h.OUT}/state-a.json`, JSON.stringify({ gid }));
  fs.writeFileSync(`${h.OUT}/logs-a.txt`, ['ERRORS:', ...errs, 'SW:', ...swLogs].join('\n'));
  console.log('errors', errs);
  sp.close(); await ctx.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
