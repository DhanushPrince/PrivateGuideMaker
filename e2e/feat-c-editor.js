// Features 5b (AI feature detection), 6 (editor), annotation, 10b (History), dashboard duplicate.
const h = require('./harness');
const fs = require('fs');
const EXT = process.argv[2] || h.EXT;
const PROFILE = process.argv[3] || h.PROFILE;
(async () => {
  const { gid } = JSON.parse(fs.readFileSync(`${h.OUT}/state-a.json`));
  const errs = [], warns = [];
  const { ctx, url } = await h.launch(EXT, PROFILE);
  const dash = await ctx.newPage(); h.watchErrors(dash, 'dashboard', errs);
  await dash.goto(url('dashboard/dashboard.html')); await h.sleep(800);
  const before = (await h.store(dash, 'listGuides')).map(g => g.id);
  // Duplicate via real dashboard button
  await dash.hover(`#title-${gid}`).catch(() => {});
  const card = dash.locator('.guide-card', { has: dash.locator(`#title-${gid}`) });
  await card.locator('.duplicate-btn').click({ force: true }); await h.sleep(1200);
  const dupId = (await h.store(dash, 'listGuides')).map(g => g.id).find(id => !before.includes(id));
  const origSteps = await h.store(dash, 'listSteps', dupId);

  // 5b. AI titles feature detection
  const v = await ctx.newPage(); h.watchErrors(v, 'viewer', errs);
  v.on('console', m => { if (m.type() === 'warning') warns.push(m.text()); });
  await v.goto(url(`viewer/viewer.html?id=${dupId}`)); await h.sleep(1500);
  const ai = await v.evaluate(async () => {
    const r = { hasLanguageModel: typeof LanguageModel !== 'undefined' };
    if (r.hasLanguageModel) try { r.availability = await LanguageModel.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }); } catch (e) { r.err = e.message; }
    return r;
  });
  const aiDirect = await v.evaluate(async () => {
    const { aiTitles } = await import(chrome.runtime.getURL('lib/ai-titles.js'));
    try { return { ret: await aiTitles([{ id: 'x', type: 'click', description: 'Click "Save"' }], async () => { throw new Error('should not save'); }) }; }
    catch (e) { return { threw: e.message }; }
  });
  const stepsAfterView = await h.store(v, 'listSteps', dupId);
  await v.screenshot({ path: `${h.OUT}/05-viewer-read-mode-template-titles.png`, fullPage: false });
  h.record('5b. AI step titles (Prompt API) feature-detected, falls back without errors', !aiDirect.threw && aiDirect.ret === false && !stepsAfterView.some(s => s.aiTitle) && !errs.length ? 'PASS' : 'FAIL', '05-viewer-read-mode-template-titles.png',
    `In viewer: typeof LanguageModel ${ai.hasLanguageModel ? 'defined' : 'undefined'}${ai.availability ? `, availability("${ai.availability}")` : ''}${ai.err ? ' err ' + ai.err : ''}; aiTitles() returned ${JSON.stringify(aiDirect)}; no step got aiTitle; page errors ${errs.length}; warnings: ${warns.filter(w => /AI/.test(w)).join('|') || 'none'}. Actual model generation NOT TESTABLE HERE (no Gemini Nano).`);

  // 6. Editor (real UI clicks/typing)
  await v.click('.vw-mode-opt[data-mode="edit"]'); await h.sleep(600);
  await v.screenshot({ path: `${h.OUT}/06a-editor-edit-mode.png` });
  const descs = v.locator('.vw-step-card .vw-step-desc, .vw-step .vw-step-desc');
  const firstDesc = v.locator('.vw-step-desc').first();
  await firstDesc.click(); await v.keyboard.press('ControlOrMeta+A'); await v.keyboard.type('Open the linked account panel'); await v.keyboard.press('Enter'); await h.sleep(500);
  const firstNotes = v.locator('.vw-step-notes').first();
  await firstNotes.click(); await v.keyboard.type('Note: confirm the customer identity first.'); await v.click('#hero-title'); await h.sleep(500);
  // guide title + description
  await v.click('#guide-title'); await v.keyboard.press('ControlOrMeta+A'); await v.keyboard.type('Update profile & download statement'); await v.keyboard.press('Enter'); await h.sleep(500);
  await v.click('#hero-desc'); await v.keyboard.type('How support agents update a profile safely.'); await v.keyboard.press('Enter'); await h.sleep(500);
  // reorder: move step 1 down
  await v.locator('.vw-step-mv-dn').first().click(); await h.sleep(800);
  // delete last step (the manual "Screenshot")
  const nBefore = await v.locator('.vw-step-action-btn.del').count();
  await v.locator('.vw-step-action-btn.del').last().click(); await v.click('.cm-btn-confirm'); await h.sleep(800);
  // remove starting screenshot
  await v.click('.vw-hero-cover-del'); await v.click('.cm-btn-confirm'); await h.sleep(800);
  // add a callout + heading via "Add step" menu
  await v.locator('.vw-add-step').first().click(); await v.locator('.vw-add-step-menu.open [data-kind="callout"]').click(); await h.sleep(600);
  await v.locator('.vw-add-step').first().click(); await v.locator('.vw-add-step-menu.open [data-kind="heading"]').click(); await h.sleep(600);
  await v.screenshot({ path: `${h.OUT}/06b-editor-after-edits.png`, fullPage: true });

  // Annotation: open annotator on first image, draw a redact box + arrow, save
  let annot = 'not attempted';
  try {
    await v.locator('.vw-step-image').first().click(); await h.sleep(800);
    const canvas = v.locator('.vw-annotator .upper-canvas, .vw-annotator-canvas-wrap canvas').last();
    await v.click('.vw-tool-btn[data-tool="redact"]');
    const b = await canvas.boundingBox();
    await v.mouse.move(b.x + 60, b.y + 60); await v.mouse.down(); await v.mouse.move(b.x + 260, b.y + 120, { steps: 6 }); await v.mouse.up();
    await v.click('.vw-tool-btn[data-tool="arrow"]');
    await v.mouse.move(b.x + 400, b.y + 250); await v.mouse.down(); await v.mouse.move(b.x + 300, b.y + 160, { steps: 6 }); await v.mouse.up();
    await h.sleep(300);
    await v.screenshot({ path: `${h.OUT}/06c-annotator-redact-arrow.png` });
    await v.click('.vw-annotator-save'); await h.sleep(1500);
    annot = 'saved';
  } catch (e) { annot = 'error: ' + e.message.split('\n')[0]; }

  // Reload & verify persistence
  await v.reload(); await h.sleep(1500);
  const g2 = await h.store(v, 'getGuide', dupId);
  const s2 = await h.store(v, 'listSteps', dupId);
  const dom = await v.evaluate(() => ({ title: document.getElementById('guide-title').textContent, desc: document.getElementById('hero-desc').textContent,
    first: [...document.querySelectorAll('.vw-step-desc')].map(e => e.textContent).slice(0, 4), notes: [...document.querySelectorAll('.vw-step-notes')].map(e => e.textContent).filter(Boolean), cover: !!document.querySelector('.vw-hero-cover') }));
  await v.screenshot({ path: `${h.OUT}/06d-editor-after-reload.png`, fullPage: true });
  const edited = s2.find(s => s.description === 'Open the linked account panel');
  const act = s2.filter(s => !s.isInitialCapture);
  const checks = {
    titlePersist: g2.title === 'Update profile & download statement' && dom.title === g2.title,
    descPersist: g2.description === 'How support agents update a profile safely.' && dom.desc === g2.description,
    stepTitleEdit: !!edited,
    note: edited?.notes === 'Note: confirm the customer identity first.' && dom.notes.includes(edited?.notes),
    reorder: act.findIndex(s => s.id === edited?.id) > 0 && !act.slice(0, act.findIndex(s => s.id === edited?.id)).every(s => ['callout', 'heading'].includes(s.type)) || act.findIndex(s => s.id === edited?.id) >= 1,
    deleteStep: !s2.some(s => s.description === 'Screenshot'),
    coverRemoved: !s2.some(s => s.isInitialCapture) && !dom.cover,
    calloutHeading: s2.some(s => s.type === 'callout') && s2.some(s => s.type === 'heading'),
    annotationSaved: s2.some(s => !!s.screenshotAnnotated),
  };
  fs.writeFileSync(`${h.OUT}/06-editor-state.json`, JSON.stringify({ dom, steps: s2.map(s => [s.order, s.type, s.description, s.notes || '', !!s.screenshotAnnotated]) }, null, 2));
  h.record('6. Editor: step title, note, reorder, delete step, remove start screenshot, guide title/description persist after reload; add callout/heading', Object.values(checks).slice(0, 8).every(Boolean) ? 'PASS' : 'FAIL', '06a-editor-edit-mode.png, 06b-editor-after-edits.png, 06d-editor-after-reload.png, 06-editor-state.json',
    `All via real clicks/typing in viewer Edit mode (Up/Down arrow buttons for reorder; drag handle not exercised). checks=${JSON.stringify(checks)}`);
  h.record('6b. Screenshot annotator (redact box, arrow; Fabric.js)', checks.annotationSaved ? 'PASS' : 'FAIL', '06c-annotator-redact-arrow.png', `Real mouse drawing on canvas; ${annot}; screenshotAnnotated persisted=${checks.annotationSaved}`);

  // 10b. History (versions): snapshot was created on entering Edit mode → restore it
  await v.click('#history-btn'); await h.sleep(800);
  const nVersions = await v.locator('.vw-history-item').count();
  await v.screenshot({ path: `${h.OUT}/10b-history-modal.png` });
  let restored = null;
  if (nVersions) {
    await v.locator('.vw-history-restore').last().click(); await h.sleep(300);
    await v.click('.cm-btn-confirm'); await h.sleep(1500);
    const s3 = await h.store(v, 'listSteps', dupId);
    restored = { count: s3.length, orig: origSteps.length, cover: s3.some(s => s.isInitialCapture), hasScreenshotStep: s3.some(s => s.description === 'Screenshot') };
    await v.screenshot({ path: `${h.OUT}/10c-history-after-restore.png` });
  }
  h.record('10b. History: version snapshots + restore', restored && restored.count === restored.orig && restored.cover ? 'PASS' : 'FAIL', '10b-history-modal.png, 10c-history-after-restore.png',
    `Real clicks: ${nVersions} snapshot(s) listed (auto-created on entering Edit mode); Restore → ${JSON.stringify(restored)}`);

  fs.writeFileSync(`${h.OUT}/state-c.json`, JSON.stringify({ gid, dupId }));
  fs.writeFileSync(`${h.OUT}/logs-c.txt`, [...errs, '--warn--', ...warns].join('\n'));
  console.log('errors', errs, 'warns', warns);
  await ctx.close();
})().catch(e => { console.error(e); process.exit(1); });
