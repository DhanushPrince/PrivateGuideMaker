// Regression for fix 46a6705: Alt+click-mark a field, then click it with a FAST (Playwright-instant) click.
// Before the fix the click reused a stale post-previous-click frame where the field was not yet blurred.
const h = require('./harness');
const fs = require('fs');
const EXT = process.argv[2] || h.EXT;
(async () => {
  const srv = await h.serve();
  const { ctx, url } = await h.launch(EXT, fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'ss-alt-')));
  const page = await ctx.newPage(); await page.goto(h.SITE_URL + '/index.html');
  const dash = await ctx.newPage(); await dash.goto(url('dashboard/dashboard.html'));
  const [tab] = await dash.evaluate(() => chrome.tabs.query({ url: 'http://localhost/*' }));
  const r = await dash.evaluate((id) => chrome.runtime.sendMessage({ type: 'START_RECORDING', tabId: id, title: 'alt' }), tab.id);
  await page.bringToFront(); await h.sleep(2000);
  await page.hover('#show'); await h.sleep(1200);
  await page.click('#show'); await h.sleep(2500);               // instant click (no delay) — triggers the race
  await page.click('#nick', { modifiers: ['Alt'] }); await h.sleep(300);
  const box = await page.$eval('#nick', e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  await page.click('#nick'); await h.sleep(600);
  await page.keyboard.press('End'); await page.keyboard.type(' x'); await page.keyboard.press('Tab'); await h.sleep(2500);
  await dash.evaluate(() => chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }));
  const steps = await h.store(dash, 'listSteps', r.guideId);
  const st = steps.find(s => /Nickname/.test(s.description));
  const file = `${h.OUT}/04h-altmark-then-fast-click.jpg`;
  h.saveDataUrl(st.screenshotRaw, file);
  // dark (text) pixels inside the field: crisp "Priya" → many; blurred → ~0
  const dark = await dash.evaluate(async ([src, b]) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = new OffscreenCanvas(b.w - 8, b.h - 8); const g = c.getContext('2d');
    g.drawImage(img, b.x + 4, b.y + 4, b.w - 8, b.h - 8, 0, 0, b.w - 8, b.h - 8);
    const d = g.getImageData(0, 0, b.w - 8, b.h - 8).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 200) n++;
    return n;
  }, [st.screenshotRaw, box]);
  h.record('4h. Alt+click-marked field stays blurred in the next (fast) click step [regression for fix]', dark < 15 ? 'PASS' : 'FAIL', '04h-altmark-then-fast-click.jpg (old build: 04h-altmark-then-click-BEFORE-fix.jpg)',
    `Step "${st.description}": ${dark} crisp dark pixels inside the marked field (old build showed the unblurred value "Priya"). Instant Playwright clicks used to trigger it.`);
  await ctx.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
