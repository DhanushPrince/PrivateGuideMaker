// Features 7 (dashboard list/search/rename/pin/tag/delete, persistence across restart), 11 (import), 10a (Guide Me).
const h = require('./harness');
const fs = require('fs');
const EXT = process.argv[2] || h.EXT;
const PROFILE = process.argv[3] || h.PROFILE;
(async () => {
  const { gid, dupId } = JSON.parse(fs.readFileSync(`${h.OUT}/state-c.json`));
  const errs = [];
  const srv = await h.serve();
  let L = await h.launch(EXT, PROFILE);
  let dash = await L.ctx.newPage(); h.watchErrors(dash, 'dashboard', errs);
  await dash.goto(L.url('dashboard/dashboard.html')); await h.sleep(1000);
  const nStore = (await h.store(dash, 'listGuides')).length;
  const nCards = await dash.locator('.guide-card').count();
  // search
  const dupTitle = (await h.store(dash, 'getGuide', dupId)).title;
  await dash.fill('#search-input', 'Copy of'); await h.sleep(500);
  const nSearch = await dash.locator('.guide-card:visible').count();
  await dash.screenshot({ path: `${h.OUT}/07a2-dashboard-search.png` });
  await dash.fill('#search-input', ''); await h.sleep(400);
  // rename original, pin it, tag it (real clicks)
  const card = (id) => dash.locator('.guide-card', { has: dash.locator(`#title-${id}`) });
  await card(gid).hover(); await card(gid).locator('.rename-btn').click({ force: true });
  await dash.keyboard.press('ControlOrMeta+A'); await dash.keyboard.type('Acme profile walkthrough'); await dash.keyboard.press('Enter'); await h.sleep(500);
  await card(gid).hover(); await card(gid).locator('.pin-btn').click({ force: true }); await h.sleep(500);
  await card(gid).locator('.tag-add-btn').click({ force: true }); await dash.keyboard.type('support'); await dash.keyboard.press('Enter'); await h.sleep(500);
  const g1 = await h.store(dash, 'getGuide', gid);
  await dash.screenshot({ path: `${h.OUT}/07a-dashboard-guides.png`, fullPage: true });
  h.record('7a. Dashboard: guides listed, search, rename, pin, tag (real clicks)', nCards === nStore && nSearch === 1 && g1.title === 'Acme profile walkthrough' && g1.pinned && (g1.tags || []).includes('support') ? 'PASS' : 'FAIL', '07a-dashboard-guides.png, 07a2-dashboard-search.png',
    `cards=${nCards} vs IndexedDB guides=${nStore}; search "Copy of" (dup title "${dupTitle}") → ${nSearch} card; rename→"${g1.title}", pinned=${g1.pinned}, tags=${JSON.stringify(g1.tags)}`);

  // persistence across full browser restart (same profile dir)
  await L.ctx.close(); await h.sleep(1000);
  L = await h.launch(EXT, PROFILE);
  dash = await L.ctx.newPage(); h.watchErrors(dash, 'dashboard2', errs);
  await dash.goto(L.url('dashboard/dashboard.html')); await h.sleep(1000);
  const afterTitles = await dash.locator('.guide-title').allTextContents();
  const stepsAfter = (await h.store(dash, 'listSteps', gid)).length;
  const settingsAfter = (await dash.evaluate(() => chrome.storage.local.get('pagewalk_settings'))).pagewalk_settings;
  await dash.screenshot({ path: `${h.OUT}/07b-dashboard-after-browser-restart.png`, fullPage: true });
  h.record('7b. Storage persists across browser restart (same profile)', afterTitles.length === nStore && afterTitles.includes('Acme profile walkthrough') && stepsAfter > 0 && settingsAfter ? 'PASS' : 'FAIL', '07b-dashboard-after-browser-restart.png',
    `Closed Chromium, relaunched with same user-data-dir: ${afterTitles.length} guides (${afterTitles.map(t => JSON.stringify(t)).join(', ')}), ${stepsAfter} steps on renamed guide, settings present`);

  // Import (Settings → Backup → Import) using the JSON exported by feat-d
  const backup = fs.readdirSync(h.EXPORTS).find(f => /backup.*\.json$/.test(f));
  await dash.goto(L.url('dashboard/dashboard.html#settings')); await h.sleep(800);
  const before = (await h.store(dash, 'listGuides')).length;
  const payload = JSON.parse(fs.readFileSync(`${h.EXPORTS}/${backup}`));
  await dash.setInputFiles('#sp-import-input', `${h.EXPORTS}/${backup}`); await h.sleep(500);
  await dash.screenshot({ path: `${h.OUT}/11a-import-confirm.png` });
  await dash.click('.cm-btn-confirm'); await h.sleep(2500);
  const afterG = await h.store(dash, 'listGuides');
  const imported = afterG.filter(g => !payload.guides.some(p => p.guide.id === g.id));
  const impSteps = imported.length ? (await h.store(dash, 'listSteps', imported[0].id)).length : 0;
  await dash.goto(L.url('dashboard/dashboard.html')); await h.sleep(800);
  await dash.screenshot({ path: `${h.OUT}/11b-dashboard-after-import.png`, fullPage: true });
  h.record('11. Import (JSON backup restore)', afterG.length === before + payload.guides.length && impSteps > 0 ? 'PASS' : 'FAIL', '11a-import-confirm.png, 11b-dashboard-after-import.png',
    `Real file input (setInputFiles on hidden #sp-import-input, as a user's file pick) + Import confirm: ${before} → ${afterG.length} guides (+${payload.guides.length}), new IDs assigned, first imported guide has ${impSteps} steps. Only StepSafe/Pagewalk JSON backups are importable.`);

  // Guide Me replay
  const v = await L.ctx.newPage(); h.watchErrors(v, 'viewer', errs);
  await v.goto(L.url(`viewer/viewer.html?id=${gid}`)); await h.sleep(1200);
  const tabP = L.ctx.waitForEvent('page');
  await v.click('#guide-me-btn');
  const gm = await tabP; await gm.waitForLoadState('load'); await h.sleep(2500);
  await gm.screenshot({ path: `${h.OUT}/10a-guide-me-step1.png` });
  const st1 = await v.evaluate(() => chrome.storage.session.get('pw_guideme'));
  const idx1 = st1.pw_guideme?.currentIndex;
  let overlay = await gm.locator('#sl-next-btn').count();
  let idx2 = null, ended = null;
  if (overlay) {
    await gm.click('#sl-next-btn'); await h.sleep(1500);
    idx2 = (await v.evaluate(() => chrome.storage.session.get('pw_guideme'))).pw_guideme?.currentIndex;
    await gm.screenshot({ path: `${h.OUT}/10a2-guide-me-step2.png` });
    await gm.click('#sl-close-btn'); await h.sleep(800);
    ended = !(await v.evaluate(() => chrome.storage.session.get('pw_guideme'))).pw_guideme;
  }
  h.record('10a. Guide Me interactive replay', overlay && idx2 === idx1 + 1 && ended ? 'PASS' : 'FAIL', '10a-guide-me-step1.png, 10a2-guide-me-step2.png',
    `Real click "Guide Me" → new tab ${gm.url()} with player overlay (Next button present=${!!overlay}); Next → index ${idx1}→${idx2}; Close ends session=${ended}`);
  await gm.close().catch(() => {});

  // Delete a guide (real click + confirm modal)
  await dash.goto(L.url('dashboard/dashboard.html')); await h.sleep(800);
  const nBefore = await dash.locator('.guide-card').count();
  await card(dupId).hover(); await card(dupId).locator('.delete-btn').click({ force: true }); await h.sleep(300);
  await dash.screenshot({ path: `${h.OUT}/07c-delete-confirm.png` });
  await dash.click('#delete-confirm'); await h.sleep(1000);
  const nAfter = await dash.locator('.guide-card').count();
  const gone = !(await h.store(dash, 'getGuide', dupId)) && (await h.store(dash, 'listSteps', dupId)).length === 0;
  await dash.screenshot({ path: `${h.OUT}/07d-dashboard-after-delete.png`, fullPage: true });
  h.record('7c. Delete guide', nAfter === nBefore - 1 && gone ? 'PASS' : 'FAIL', '07c-delete-confirm.png, 07d-dashboard-after-delete.png',
    `Real click Delete → confirm: cards ${nBefore}→${nAfter}; guide + its steps removed from IndexedDB=${gone}`);

  fs.writeFileSync(`${h.OUT}/logs-e.txt`, errs.join('\n'));
  console.log('errors', errs);
  await L.ctx.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
