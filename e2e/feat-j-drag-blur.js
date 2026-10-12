// Drag-select Blur / Pixelate / Redact boxes on a step screenshot in the viewer editor:
// saved image + exports carry the redacted pixels; Undo and deleting a box leave the image unchanged.
const h = require('./harness'); const fs = require('fs');
const EXT = process.argv[2] || h.EXT; const PROFILE = process.argv[3] || h.PROFILE;

(async () => {
  const srv = await h.serve(); const errs = [];
  const { ctx, url } = await h.launch(EXT, PROFILE);
  const page = await ctx.newPage(); await page.goto(h.SITE_URL + '/pii.html');
  const v = await ctx.newPage(); h.watchErrors(v, 'viewer', errs);
  await v.goto(url('sidepanel/sidepanel.html')); await h.sleep(400);
  // Record a 2-screenshot guide
  const [tab] = await v.evaluate(() => chrome.tabs.query({ url: 'http://localhost/*' }));
  await page.bringToFront();
  const r = await v.evaluate((id) => chrome.runtime.sendMessage({ type: 'START_RECORDING', tabId: id, title: 'Drag blur test' }), tab.id);
  await h.sleep(1500);
  await page.evaluate(() => { document.body.style.background = '#fff7e6'; }); await h.sleep(300);
  await v.evaluate(() => chrome.runtime.sendMessage({ type: 'MANUAL_CAPTURE' })); await h.sleep(1200);
  await page.evaluate(() => { document.body.style.background = '#e8f0ff'; });
  await h.sleep(300);
  await v.evaluate(() => chrome.runtime.sendMessage({ type: 'MANUAL_CAPTURE' })); await h.sleep(1200);
  await v.evaluate(() => chrome.runtime.sendMessage({ type: 'STOP_RECORDING' })); await h.sleep(800);
  const gid = r.guideId;

  await v.goto(url(`viewer/viewer.html?id=${gid}`)); await h.sleep(1500); await v.bringToFront();
  await v.click('.vw-mode-opt[data-mode="edit"]'); await h.sleep(600);
  const canvasBox = async () => (await v.locator('.vw-annotator-canvas-wrap canvas').last().boundingBox());
  const drag = async (b, x0, y0, x1, y1) => { await v.mouse.move(b.x + x0, b.y + y0); await v.mouse.down(); await v.mouse.move(b.x + x1, b.y + y1, { steps: 6 }); await v.mouse.up(); await h.sleep(200); };
  const openAnnot = async (i) => { await v.locator('.vw-step-image').nth(i).click(); await h.sleep(900); return canvasBox(); };
  const save = async () => { await v.click('.vw-annotator-save'); await h.sleep(1500); };

  // Pixel stats: mean abs diff between raw and annotated inside rects (fractions of image size)
  const diff = (raw, ann, rects) => v.evaluate(async ([raw, ann, rects]) => {
    const load = (s) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
    const [a, b] = await Promise.all([load(raw), load(ann || raw)]);
    const W = a.naturalWidth, H = a.naturalHeight;
    const px = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H); return x.getImageData(0, 0, W, H).data; };
    const A = px(a), B = px(b);
    return rects.map(([fx, fy, fw, fh]) => { let s = 0, n = 0;
      for (let y = Math.floor(fy * H); y < (fy + fh) * H; y++) for (let x = Math.floor(fx * W); x < (fx + fw) * W; x++) { const i = (y * W + x) * 4; s += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); n++; }
      return +(s / n / 3).toFixed(2); });
  }, [raw, ann, rects]);

  // Step with image #0: Blur box (default style) + Pixelate + Redact boxes, then Save
  let b = await openAnnot(0);
  await v.click('.vw-tool-btn[data-tool="blur"]'); await drag(b, 20, 20, 0.45 * b.width, 0.25 * b.height);
  await v.click('.vw-tool-btn[data-tool="pixelate"]'); await drag(b, 0.02 * b.width, 0.5 * b.height, 0.5 * b.width, 0.7 * b.height);
  await v.click('.vw-tool-btn[data-tool="redact"]'); await drag(b, 20, 0.35 * b.height, 0.3 * b.width, 0.45 * b.height);
  await v.screenshot({ path: `${h.OUT}/15-drag-blur-boxes.png` });
  await save();
  let steps = (await h.store(v, 'listSteps', gid)).filter(s => s.screenshotRaw && !s.isInitialCapture);
  const s0 = steps[0];
  const fx = (px, W) => px / W;
  const rects = [[fx(30, b.width), fx(30, b.height), 0.3, 0.12], [0.04, 0.52, 0.4, 0.16], [fx(30, b.width), 0.37, 0.2, 0.06], [0.6, 0.75, 0.35, 0.2]];
  const [dBlur, dPix, dRedact, dOutside] = await diff(s0.screenshotRaw, s0.screenshotAnnotated, rects);
  const state0 = JSON.parse(s0.annotationState || '{}').objects?.map(o => o.data?.type) || [];
  await v.screenshot({ path: `${h.OUT}/15-drag-blur-saved.png`, fullPage: false });

  // Exports carry the annotated image (capture Blob contents instead of downloading)
  const exp = await v.evaluate(async (gid) => {
    const st = await import(chrome.runtime.getURL('lib/storage.js'));
    const ex = await import(chrome.runtime.getURL('lib/export.js'));
    const g = await st.getGuide(gid), ss = await st.listSteps(gid);
    const texts = []; const OB = window.Blob; window.Blob = class extends OB { constructor(p, o) { super(p, o); texts.push(p.join('')); } };
    const oc = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
    try { await ex.exportHTML(g, ss, {}); ex.exportMarkdown(g, ss); } finally { window.Blob = OB; HTMLAnchorElement.prototype.click = oc; }
    const ann = ss.find(s => s.screenshotAnnotated); const raw = ann.screenshotRaw;
    return texts.map(t => ({ hasAnn: t.includes(ann.screenshotAnnotated), hasRaw: t.includes(raw) }));
  }, gid);

  // Step with image #1: Undo removes a drawn box; deleting a selected box before save leaves no annotation
  b = await openAnnot(1);
  await v.click('.vw-tool-btn[data-tool="blur"]'); await drag(b, 40, 40, 300, 160);
  await v.click('.vw-tool-btn[data-action="undo"]'); await h.sleep(300);
  await drag(b, 40, 40, 300, 160);
  await v.click('.vw-tool-btn[data-action="delete"]'); await h.sleep(300);
  await save();
  steps = (await h.store(v, 'listSteps', gid)).filter(s => s.screenshotRaw && !s.isInitialCapture);
  const s1 = steps[1];
  const objs1 = JSON.parse(s1.annotationState || '{}').objects?.filter(o => ['blur', 'pixelate', 'redact'].includes(o.data?.type)).length ?? 0;
  const [d1] = await diff(s1.screenshotRaw, s1.screenshotAnnotated, [[0.02, 0.02, 0.3, 0.2]]);

  // Remove boxes after saving: reopen step 0, select each box and delete it, save → back to the original
  b = await openAnnot(0);
  await v.click('.vw-tool-btn[data-tool="select"]');
  for (const [x, y] of [[0.25, 0.14], [0.25, 0.6], [0.16, 0.4]]) { await v.mouse.click(b.x + x * b.width, b.y + y * b.height); await h.sleep(150); await v.click('.vw-tool-btn[data-action="delete"]'); await h.sleep(150); }
  await save();
  const s0b = (await h.store(v, 'listSteps', gid)).filter(s => s.screenshotRaw && !s.isInitialCapture)[0];
  const left0 = JSON.parse(s0b.annotationState || '{}').objects?.filter(o => ['blur', 'pixelate', 'redact'].includes(o.data?.type)).length ?? 0;

  h.record('15a. Drag-select Blur/Pixelate/Redact boxes → saved screenshot pixels changed only in boxes', dBlur > 4 && dPix > 2 && dRedact > 20 && dOutside < 3 && state0.filter(t => ['blur', 'pixelate', 'redact'].includes(t)).length === 3 ? 'PASS' : 'FAIL', '15-drag-blur-boxes.png, 15-drag-blur-saved.png',
    `mean abs diff blur=${dBlur} pixelate=${dPix} redact=${dRedact} outside=${dOutside}; boxes kept in annotationState=${state0.join(',')}`);
  h.record('15b. Exports (HTML, Markdown) embed the blurred image, not the original', exp.length >= 2 && exp.every(e => e.hasAnn && !e.hasRaw) ? 'PASS' : 'FAIL', '', JSON.stringify(exp));
  h.record('15c. Undo / delete a box before Save → screenshot unchanged', !s1.screenshotAnnotated && objs1 === 0 && d1 === 0 ? 'PASS' : 'FAIL', '', `annotated=${!!s1.screenshotAnnotated} boxes=${objs1} diff=${d1}`);
  h.record('15d. Remove saved boxes later (raw kept) → screenshot back to original', !s0b.screenshotAnnotated && left0 === 0 ? 'PASS' : 'FAIL', '', `annotated=${!!s0b.screenshotAnnotated} boxesLeft=${left0}`);
  console.log('errors', errs);
  await ctx.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
