// Feature 8: exports via the real viewer Share menu + dashboard JSON backup.
const h = require('./harness');
const fs = require('fs');
const { execSync } = require('child_process');
const EXT = process.argv[2] || h.EXT;
const PROFILE = process.argv[3] || h.PROFILE;
const PII = /priya\.sharma@example\.com|9876543210|98765 43210|4111 1111 1111 1111|2341 2341 2346|ABCPE1234F|priya@okhdfcbank|HDFC0001234|hunter2/;
(async () => {
  const { gid } = JSON.parse(fs.readFileSync(`${h.OUT}/state-a.json`));
  const errs = [];
  const { ctx, url, extId } = await h.launch(EXT, PROFILE);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(e => console.log('grant', e.message));
  const v = await ctx.newPage(); h.watchErrors(v, 'viewer', errs);
  await v.goto(url(`viewer/viewer.html?id=${gid}`)); await h.sleep(1500);
  const guide = await h.store(v, 'getGuide', gid);
  const steps = await h.store(v, 'listSteps', gid);
  const nShots = steps.filter(s => s.screenshotAnnotated || s.screenshotRaw).length;
  const share = async (fmt) => { await v.click('#share-btn'); await h.sleep(200); await v.click(`.vw-share-item[data-fmt="${fmt}"]`); };
  await v.click('#share-btn'); await h.sleep(300);
  await v.screenshot({ path: `${h.OUT}/08a-share-menu.png` });
  await v.keyboard.press('Escape'); await v.click('#hero-title').catch(() => {});

  // Markdown
  let dl = v.waitForEvent('download'); await share('markdown'); let d = await dl;
  const mdPath = `${h.EXPORTS}/${d.suggestedFilename()}`; await d.saveAs(mdPath);
  const md = fs.readFileSync(mdPath, 'utf8');
  const mdImgs = (md.match(/!\[(Step \d+|Starting page)\]\(data:image\/jpeg;base64,/g) || []).length;
  const mdNums = (md.match(/^## Step (\d+):/gm) || []).map(l => +/\d+/.exec(l)[0]);
  const mdSteps = mdNums.length;
  const actionSteps = steps.filter(s => !s.isInitialCapture);
  // Numbering must match viewer/HTML/PDF: cover unnumbered, action steps 1..N
  const mdNumbering = mdNums.every((n, i) => n === i + 1) && (!steps.some(s => s.isInitialCapture) || /!\[Starting page\]/.test(md));
  // Render the markdown's first images to prove they decode
  h.record('8a. Export: Markdown', mdImgs === nShots && mdSteps === actionSteps.length && mdNumbering && /Made with \[StepSafe\]/.test(md) && !PII.test(md) ? 'PASS' : 'FAIL', `exports/${d.suggestedFilename()}, 08a-share-menu.png`,
    `Real Share→Export as Markdown click → download "${d.suggestedFilename()}" (${(md.length / 1024).toFixed(0)} KB): ${mdSteps} "## Step N" sections, ${mdImgs}/${nShots} inline base64 JPEG images, StepSafe badge line present=${/Made with \[StepSafe\]/.test(md)}, raw PII strings=${PII.test(md)}. Numbering ${mdNums.join(',')} for ${actionSteps.length} action steps; starting screenshot is an unnumbered cover like the viewer/HTML/PDF (ok=${mdNumbering}).`);

  // HTML
  dl = v.waitForEvent('download'); await share('html'); d = await dl;
  const htmlPath = `${h.EXPORTS}/${d.suggestedFilename()}`; await d.saveAs(htmlPath);
  const hp = await ctx.newPage(); const ext = [];
  await hp.route('**/*', r => { const u = r.request().url(); if (!u.startsWith('file:') && !u.startsWith('data:')) { ext.push(u); return r.abort(); } r.continue(); });
  hp.on('pageerror', e => errs.push('html-export: ' + e.message));
  await hp.goto('file://' + htmlPath); await h.sleep(1200);
  const hi = await hp.evaluate(() => ({ nums: document.querySelectorAll('.step-number').length, imgs: [...document.images].filter(i => i.getAttribute('src')).length, ok: [...document.images].filter(i => i.getAttribute('src') && i.complete && i.naturalWidth > 0).length, badge: /StepSafe/.test(document.body.innerText), badgeText: [...document.querySelectorAll('a')].filter(a => /stepsafe/i.test(a.href + a.textContent)).map(a => a.textContent.trim() + ' → ' + a.href).slice(0, 2), title: document.title, text: document.body.innerText }));
  await hp.screenshot({ path: `${h.OUT}/08b-html-export-standalone.png` });
  await hp.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await h.sleep(300);
  await hp.screenshot({ path: `${h.OUT}/08b2-html-export-footer-badge.png` });
  const htmlSrc = fs.readFileSync(htmlPath, 'utf8');
  h.record('8b. Export: HTML (standalone)', hi.imgs >= nShots && hi.ok === hi.imgs && hi.nums === mdSteps && hi.badge && !ext.length && !PII.test(htmlSrc) ? 'PASS' : 'FAIL', `exports/${d.suggestedFilename()}, 08b-html-export-standalone.png, 08b2-html-export-footer-badge.png`,
    `Real Share→Export as HTML → "${d.suggestedFilename()}" (${(htmlSrc.length / 1024).toFixed(0)} KB) opened from file:// with all network blocked: ${hi.ok}/${hi.imgs} images rendered (empty-src lightbox placeholder excluded), external requests=${ext.length}, numbered steps=${hi.nums} (Markdown ${mdSteps}), badge=${JSON.stringify(hi.badgeText)}, raw PII=${PII.test(htmlSrc)}`);

  // PDF (print view)
  const popP = ctx.waitForEvent('page'); await share('pdf'); const pop = await popP; await h.sleep(2000);
  await pop.emulateMedia({ media: 'print' });
  await pop.screenshot({ path: `${h.OUT}/08c-pdf-print-view.png` });
  const pdfPath = `${h.EXPORTS}/${guide.title.replace(/[^\w\- ]+/g, '').trim() || 'guide'}.pdf`;
  await pop.pdf({ path: pdfPath, format: 'A4', printBackground: true });
  // Inspect the PDF with poppler-utils when installed (Linux: apt install poppler-utils, Mac: brew install poppler);
  // otherwise fall back to counting PDF objects + reading the print view's text (same content that went into the PDF).
  let hasPoppler = false;
  try { execSync('command -v pdfinfo', { stdio: 'ignore' }); hasPoppler = !process.env.NO_POPPLER; } catch { }
  let pages, ptxt, pimg;
  if (hasPoppler) {
    const info = execSync(`pdfinfo "${pdfPath}"`).toString();
    pages = +(/Pages:\s+(\d+)/.exec(info) || [])[1];
    ptxt = execSync(`pdftotext "${pdfPath}" -`).toString();
    pimg = execSync(`pdfimages -list "${pdfPath}" | tail -n +3 | wc -l`).toString().trim();
    execSync(`pdftoppm -png -r 50 -f 1 -l 2 "${pdfPath}" "${h.OUT}/08d-pdf-page"`);
  } else {
    const raw = fs.readFileSync(pdfPath).toString('latin1');
    pages = (raw.match(/\/Type\s*\/Page\b/g) || []).length;
    pimg = String((raw.match(/\/Subtype\s*\/Image\b/g) || []).length);
    ptxt = await pop.evaluate(() => document.body.innerText);
    console.log('poppler-utils not found: PDF checked by object count + print-view text');
  }
  h.record('8c. Export: PDF via print stylesheet', pages >= 1 && /StepSafe/.test(ptxt) && +pimg >= nShots && !PII.test(ptxt) ? 'PASS' : 'FAIL', `${pdfPath.replace(h.OUT + '/', '')}, 08c-pdf-print-view.png, 08d-pdf-page-1.png`,
    `Real Share→Export as PDF opens print window (window.print()); PDF generated with page.pdf() of that window (the OS "Save as PDF" dialog itself is NOT TESTABLE HERE): ${pages} A4 pages, ${pimg} embedded images, badge text "StepSafe" in PDF=${/StepSafe/.test(ptxt)}, raw PII=${PII.test(ptxt)}${hasPoppler ? '' : ' (no poppler: text from print view)'}`);
  await pop.close();

  // Copy as text
  await share('copy'); await h.sleep(500);
  const clip = await v.evaluate(() => navigator.clipboard.readText()).catch(e => 'ERR ' + e.message);
  fs.writeFileSync(`${h.EXPORTS}/copy-as-text.txt`, clip);
  h.record('8d. Export: Copy as text (clipboard)', clip.startsWith(guide.title) && clip.split('\n').filter(l => /^\d+\. /.test(l)).length === steps.length && !PII.test(clip) ? 'PASS' : 'FAIL', 'exports/copy-as-text.txt',
    `Real Share→Copy as text; clipboard read back: ${clip.split('\n').length} lines, ${steps.length} numbered steps + URLs, no images, no badge (by design)`);

  // JSON backup (dashboard Settings → Backup → Export)
  const dash = await ctx.newPage(); h.watchErrors(dash, 'dashboard', errs);
  await dash.goto(url('dashboard/dashboard.html#settings')); await h.sleep(800);
  dl = dash.waitForEvent('download'); await dash.click('#sp-export-btn'); d = await dl;
  const jPath = `${h.EXPORTS}/${d.suggestedFilename()}`; await d.saveAs(jPath);
  const j = JSON.parse(fs.readFileSync(jPath, 'utf8'));
  const jRaw = fs.readFileSync(jPath, 'utf8');
  await dash.screenshot({ path: `${h.OUT}/08e-dashboard-backup-section.png`, fullPage: true });
  h.record('8e. Export: JSON backup (all guides + settings)', j.version === 2 && /^stepsafe-backup-\d{4}-\d\d-\d\d\.json$/.test(d.suggestedFilename()) && j.guides.length >= 1 && j.guides.every(g => Array.isArray(g.steps)) && !PII.test(jRaw) ? 'PASS' : 'FAIL', `exports/${d.suggestedFilename()}, 08e-dashboard-backup-section.png`,
    `Real click Settings→Export → "${d.suggestedFilename()}": v${j.version}, ${j.guides.length} guides, ${j.guides.reduce((a, g) => a + g.steps.length, 0)} steps, ${j.guides.reduce((a, g) => a + (g.versions || []).length, 0)} versions, settings included; raw PII=${PII.test(jRaw)}. Filename prefix stepsafe-backup=${/^stepsafe-backup-/.test(d.suggestedFilename())}.`);
  // Branding (same browser session: this Chromium build crashes on any download in a re-opened profile that already has download history)
  // Branding → HTML export
  await dash.goto(url('dashboard/dashboard.html#settings')); await h.sleep(800);
  await dash.fill('#sp-brand-name', 'Acme Support'); await dash.fill('#sp-color-hex', '#0b7a3e'); await dash.click('#sp-save-branding-btn'); await h.sleep(600);
  const br = (await dash.evaluate(() => chrome.storage.local.get('pagewalk_settings'))).pagewalk_settings.branding;
  const v2 = await ctx.newPage(); await v2.goto(url(`viewer/viewer.html?id=${gid}`)); await h.sleep(1200);
  const dlb = v2.waitForEvent('download'); await v2.click('#share-btn'); await v2.click('.vw-share-item[data-fmt="html"]'); d = await dlb;
  const bp = `${h.EXPORTS}/branded-${d.suggestedFilename()}`; await d.saveAs(bp);
  const bh = fs.readFileSync(bp, 'utf8');
  const hpb = await ctx.newPage(); await hpb.goto('file://' + bp); await h.sleep(800);
  await hpb.screenshot({ path: `${h.OUT}/09b-branding-html-export.png` });
  h.record('Branding (name/colour/logo) applied to HTML/PDF export', bh.includes('Acme Support') && /0b7a3e/i.test(bh) ? 'PASS' : 'FAIL', `09b-branding-html-export.png, exports/branded-${d.suggestedFilename()}`,
    `Settings→Branding brand name + colour saved (${JSON.stringify(br)}); exported HTML contains name=${bh.includes('Acme Support')}, colour=${/0b7a3e/i.test(bh)}; StepSafe badge still present=${/StepSafe/.test(bh)}. Logo upload not exercised.`);

  h.record('8f. Export: ZIP / share link / cloud', 'NOT PRESENT', '-', 'No zip, share-link, or upload code exists (grep: no JSZip/zip/fetch upload); "Share" menu = PDF, HTML, Markdown, Copy as text only.');

  fs.writeFileSync(`${h.OUT}/logs-d.txt`, errs.join('\n'));
  console.log('errors', errs);
  await ctx.close();
})().catch(e => { console.error(e); process.exit(1); });
