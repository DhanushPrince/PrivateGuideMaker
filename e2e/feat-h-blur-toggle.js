// Blur on/off toggle in the side panel: persists in chrome.storage.local, ON blurs PII in captures, OFF does not.
const h = require('./harness');
const fs = require('fs');
const EXT = process.argv[2] || h.EXT;
const PROFILE = process.argv[3] || h.PROFILE;

(async () => {
  const srv = await h.serve();
  const errs = [];
  const { ctx, url } = await h.launch(EXT, PROFILE);
  const page = await ctx.newPage(); h.watchErrors(page, 'pii', errs);
  await page.goto(h.SITE_URL + '/pii.html');
  const sp = await ctx.newPage(); h.watchErrors(sp, 'sidepanel', errs);
  await sp.setViewportSize({ width: 380, height: 700 });
  await sp.goto(url('sidepanel/sidepanel.html')); await h.sleep(500);
  const state = () => sp.evaluate(() => ({ checked: document.getElementById('blur-toggle').checked, label: document.getElementById('blur-label').textContent, warn: !document.getElementById('blur-warn').classList.contains('hidden') }));
  const setBlur = async (on) => { if ((await state()).checked !== on) await sp.click('label.sp-blur-switch'); await h.sleep(400); };
  const emailBlurred = () => page.evaluate(() => { for (let e = document.getElementById('c-email'); e; e = e.parentElement) if (/blur/.test(getComputedStyle(e).filter)) return true; return false; });

  async function capture(name) {
    await page.reload(); await page.bringToFront(); await h.sleep(300);
    const [tab] = await sp.evaluate(() => chrome.tabs.query({ url: 'http://localhost/*' }));
    const r = await sp.evaluate((id) => chrome.runtime.sendMessage({ type: 'START_RECORDING', tabId: id, title: 'Blur toggle test' }), tab.id);
    await h.sleep(1500);
    const blurred = await emailBlurred();
    await sp.evaluate(() => chrome.runtime.sendMessage({ type: 'MANUAL_CAPTURE' })); await h.sleep(800);
    const steps = await h.store(sp, 'listSteps', r.guideId);
    const file = `08-blur-toggle-${name}.jpg`;
    const shot = steps[steps.length - 1]?.screenshotRaw;
    if (shot) h.saveDataUrl(shot, `${h.OUT}/${file}`);
    await sp.evaluate(() => chrome.runtime.sendMessage({ type: 'DISCARD_RECORDING' })); await h.sleep(400);
    return { blurred, file, shot: !!shot };
  }

  const def = await state();
  await setBlur(true);
  await sp.bringToFront(); await sp.screenshot({ path: `${h.OUT}/08-sidepanel-blur-on.png` });
  const on = await capture('on');
  await sp.bringToFront(); await setBlur(false);
  const offState = await state();
  await sp.screenshot({ path: `${h.OUT}/08-sidepanel-blur-off.png` });
  await sp.reload(); await h.sleep(500);
  const afterReload = await state();
  const stored = (await sp.evaluate(() => chrome.storage.local.get('pagewalk_settings'))).pagewalk_settings;
  const off = await capture('off');
  await sp.bringToFront(); await setBlur(true); // restore default

  h.record('12a. Blur toggle: default ON, label/warning reflect state', def.checked && def.label === 'Blur: On' && !def.warn && offState.label === 'Blur: Off' && offState.warn ? 'PASS' : 'FAIL', '08-sidepanel-blur-on.png, 08-sidepanel-blur-off.png', JSON.stringify({ def, offState }));
  h.record('12b. Blur toggle ON → PII blurred in capture; OFF → not blurred', on.blurred && on.shot && !off.blurred && off.shot ? 'PASS' : 'FAIL', `${on.file}, ${off.file}`, `on: email blurred=${on.blurred}; off: email blurred=${off.blurred}`);
  h.record('12c. Blur toggle persists in chrome.storage.local across reload', !afterReload.checked && afterReload.label === 'Blur: Off' && stored?.autoRedact === false ? 'PASS' : 'FAIL', '', `after reload ${JSON.stringify(afterReload)}, stored autoRedact=${stored?.autoRedact}`);
  console.log('errors', errs);
  await ctx.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
