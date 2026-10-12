// Feature 4: redaction per PII category, Alt+click, dynamic content, settings toggles (via real dashboard UI), redact style.
const h = require('./harness');
const fs = require('fs');
const EXT = process.argv[2] || h.EXT;
const PROFILE = process.argv[3] || h.PROFILE;
const IDS = ['c-email', 'c-phone', 'c-inphone91', 'c-inphone', 'c-card', 'c-cardbad', 'c-aadhaar', 'c-aadhaarbad', 'c-pan', 'c-upi', 'c-ifsc', 'c-money', 'c-ctrl', 'c-marked', 'c-alt', 'c-pw', 'c-text', 'c-dynupi', 'c-dyncard'];
const DEFAULT_BLUR = ['c-email', 'c-phone', 'c-inphone91', 'c-inphone', 'c-card', 'c-aadhaar', 'c-pan', 'c-upi', 'c-ifsc', 'c-marked', 'c-pw'];
const CAT_UI = { emails: '#sp-cat-emails', phones: '#sp-cat-phones', creditCards: '#sp-cat-cards', ssn: '#sp-cat-ssn', aadhaar: '[data-cat="aadhaar"]', pan: '[data-cat="pan"]', upi: '[data-cat="upi"]', ifsc: '[data-cat="ifsc"]', money: '#sp-cat-money', formFields: '#sp-cat-form-fields', tableData: '#sp-cat-table-data' };
const CAT_IDS = { emails: ['c-email'], phones: ['c-phone', 'c-inphone91', 'c-inphone'], creditCards: ['c-card'], aadhaar: ['c-aadhaar'], pan: ['c-pan'], upi: ['c-upi'], ifsc: ['c-ifsc'] };

(async () => {
  const srv = await h.serve();
  const errs = [];
  const { ctx, sw, url } = await h.launch(EXT, PROFILE);
  const page = await ctx.newPage(); h.watchErrors(page, 'pii', errs);
  await page.goto(h.SITE_URL + '/pii.html');
  const dash = await ctx.newPage(); h.watchErrors(dash, 'dashboard', errs);

  async function setSettingsUI({ off = [], on = [], style = 'blur', auto = true, custom = null } = {}) {
    await dash.goto(url('dashboard/dashboard.html#settings')); await h.sleep(700);
    const setAuto = async (v) => { if ((await dash.isChecked('#sp-auto-redact')) !== v) await dash.click('label.sp-toggle:has(#sp-auto-redact)'); };
    await setAuto(true);
    for (const [k, sel] of Object.entries(CAT_UI)) {
      const want = on.includes(k) ? true : off.includes(k) ? false : !['money', 'formFields', 'tableData'].includes(k);
      await dash.setChecked(sel, want);
    }
    await dash.selectOption('#sp-redact-style', style);
    // custom patterns: clear rows, optionally add one
    await dash.evaluate(() => document.querySelectorAll('#sp-custom-pattern-list .sp-premove').forEach(b => b.click()));
    if (custom) { await dash.click('#sp-add-pattern-btn'); await dash.fill('#sp-custom-pattern-list .sp-pattern-row:last-child .sp-pregex', custom); }
    await setAuto(auto);
    await dash.click('#sp-save-btn'); await h.sleep(600);
    return (await dash.evaluate(() => chrome.storage.local.get('pagewalk_settings'))).pagewalk_settings;
  }
  const domState = () => page.evaluate((ids) => Object.fromEntries(ids.map(id => {
    const el = document.getElementById(id); if (!el) return [id, 'absent'];
    let blur = false; for (let e = el; e; e = e.parentElement) if (/blur/.test(getComputedStyle(e).filter)) blur = true;
    return [id, blur ? 'blur' : /█/.test(el.textContent) ? 'mask' : 'clear'];
  })), IDS);

  async function run(name, cfg, extra) {
    const settings = await setSettingsUI(cfg);
    await page.reload(); await page.bringToFront(); await h.sleep(300);
    const [tab] = await dash.evaluate(() => chrome.tabs.query({ url: 'http://localhost/*' }));
    const r = await dash.evaluate((id) => chrome.runtime.sendMessage({ type: 'START_RECORDING', tabId: id, title: 'Redact test' }), tab.id);
    await h.sleep(1500);
    if (extra) await extra();
    const dom = await domState();
    await dash.evaluate(() => chrome.runtime.sendMessage({ type: 'MANUAL_CAPTURE' }));
    await h.sleep(800);
    const steps = await h.store(dash, 'listSteps', r.guideId);
    const shot = steps[steps.length - 1]?.screenshotRaw;
    const file = `04-redact-${name}.jpg`;
    if (shot) h.saveDataUrl(shot, `${h.OUT}/${file}`);
    await dash.evaluate(() => chrome.runtime.sendMessage({ type: 'DISCARD_RECORDING' }));
    await h.sleep(400);
    return { dom, file, settings, desc: steps.map(s => s.description) };
  }
  const fmt = (dom) => Object.entries(dom).map(([k, v]) => `${k.slice(2)}=${v}`).join(' ');
  const out = {};

  // A. defaults + dynamic content + Alt+click toggle
  let altAfter1, altAfter2, dynBefore;
  const a = await run('00-defaults-dynamic-altclick', {}, async () => {
    dynBefore = (await domState())['c-dynupi'];
    await page.click('#c-show'); await h.sleep(500);
    await page.click('#c-alt', { modifiers: ['Alt'] }); await h.sleep(300);
    altAfter1 = await page.$eval('#c-alt', e => e.hasAttribute('data-stepsafe-blur'));
  });
  out.defaults = a;
  const expectBlur = [...DEFAULT_BLUR, 'c-alt', 'c-dynupi', 'c-dyncard'];
  const expectClear = ['c-cardbad', 'c-aadhaarbad', 'c-money', 'c-ctrl', 'c-text'];
  const wrongA = [...expectBlur.filter(id => a.dom[id] !== 'blur'), ...expectClear.filter(id => a.dom[id] !== 'clear')];
  const stepsRecordedAlt = a.desc.filter(d => /Nickname|Load dynamic/.test(d));
  h.record('4a. Redaction — default categories (email, intl phone, Indian phone ×2, card/Luhn, Aadhaar/Verhoeff, PAN, UPI, IFSC, password, data-stepsafe-blur)', wrongA.filter(x => !['c-alt', 'c-dynupi', 'c-dyncard'].includes(x)).length ? 'FAIL' : 'PASS', a.file,
    `DOM after start: ${fmt(a.dom)}. Checksum negatives (bad Luhn card, bad Verhoeff Aadhaar), money, control text, plain input stay clear. Mismatches: ${wrongA.join(',') || 'none'}`);
  h.record('4b. Redaction — dynamic content (added after recording started)', ['c-dynupi', 'c-dyncard'].every(i => a.dom[i] === 'blur') ? 'PASS' : 'FAIL', a.file,
    `Injected via page button after start: dyn UPI=${a.dom['c-dynupi']}, dyn card=${a.dom['c-dyncard']} (MutationObserver)`);
  // Alt toggle off check needs a second pass
  const a2 = await run('00b-altclick-toggle-off', {}, async () => {
    await page.click('#c-alt', { modifiers: ['Alt'] }); await h.sleep(300);
    await page.click('#c-alt', { modifiers: ['Alt'] }); await h.sleep(300);
    altAfter2 = await page.$eval('#c-alt', e => e.hasAttribute('data-stepsafe-blur'));
  });
  h.record('4c. Redaction — Alt+click mark-to-blur (toggle)', altAfter1 && a.dom['c-alt'] === 'blur' && !altAfter2 && a2.dom['c-alt'] === 'clear' ? 'PASS' : 'FAIL', `${a.file}, ${a2.file}`,
    `Real Alt+click: marked=${altAfter1} → ${a.dom['c-alt']}; second Alt+click unmarks=${!altAfter2} → ${a2.dom['c-alt']}. Alt+clicks recorded as steps: ${stepsRecordedAlt.filter(d => /Nickname/.test(d)).length} (expected 0)`);

  // B. each category off via real settings UI
  const toggles = [];
  for (const cat of Object.keys(CAT_IDS)) {
    const r = await run(`10-off-${cat}`, { off: [cat] });
    const offIds = CAT_IDS[cat];
    const nowClear = offIds.every(id => r.dom[id] === 'clear');
    const othersStill = DEFAULT_BLUR.filter(id => !offIds.includes(id)).every(id => r.dom[id] === 'blur');
    const saved = r.settings.redactCategories[cat] === false;
    toggles.push({ cat, ok: nowClear && othersStill && saved, file: r.file, detail: offIds.map(id => `${id.slice(2)}=${r.dom[id]}`).join(',') + (othersStill ? '' : ' OTHERS-CHANGED: ' + fmt(r.dom)) });
  }
  h.record('4d. Settings toggles: each category OFF stops blurring it (emails, phones, cards, Aadhaar, PAN, UPI, IFSC)', toggles.every(t => t.ok) ? 'PASS' : 'FAIL', toggles.map(t => t.file).join(', '),
    'Unchecked in real dashboard Settings UI + Save: ' + toggles.map(t => `${t.cat}:${t.ok ? 'ok' : 'FAIL'}(${t.detail})`).join('; '));

  // C. opt-in categories + custom pattern
  const m = await run('20-on-money-tabledata-formfields', { on: ['money', 'formFields'] });
  const cu = await run('21-custom-pattern', { custom: 'Order \\d+' });
  h.record('4e. Opt-in categories (money, all form fields) + custom regex pattern', m.dom['c-money'] === 'blur' && m.dom['c-text'] === 'blur' && cu.dom['c-ctrl'] === 'blur' ? 'PASS' : 'FAIL', `${m.file}, ${cu.file}`,
    `money=${m.dom['c-money']}, plain input with formFields=${m.dom['c-text']}, custom /Order \\d+/ → control text=${cu.dom['c-ctrl']} (UI-added pattern)`);

  // D. redact style "Black blocks"
  const bb = await run('30-style-black-blocks', { style: 'redact' });
  const masked = DEFAULT_BLUR.filter(id => !['c-pw', 'c-marked'].includes(id)).every(id => bb.dom[id] === 'mask');
  const restored = await page.$eval('#c-email', e => e.textContent);
  h.record('4f. Redact style option: Blur vs Black blocks (████)', masked && bb.dom['c-pw'] === 'blur' && restored === 'priya.sharma@example.com' ? 'PASS' : 'FAIL', bb.file,
    `style=redact: text categories → ${fmt(Object.fromEntries(Object.entries(bb.dom).filter(([k]) => DEFAULT_BLUR.includes(k))))}; inputs/marked still blurred; page text restored after stop ("${restored}")`);

  // E. master toggle off
  const off = await run('40-autoredact-off', { auto: false });
  const anyBlur = Object.values(off.dom).filter(v => v !== 'clear' && v !== 'absent').length;
  h.record('4g. Auto-redact master toggle OFF', anyBlur === 0 ? 'PASS' : 'PARTIAL', off.file,
    `autoRedact=false → blurred elements on page: ${anyBlur} (${fmt(off.dom)})`);

  await setSettingsUI({}); // restore defaults
  fs.writeFileSync(`${h.OUT}/04-redaction-results.json`, JSON.stringify({ out, toggles, m: m.dom, cu: cu.dom, bb: bb.dom, off: off.dom }, null, 2));
  fs.writeFileSync(`${h.OUT}/logs-b.txt`, errs.join('\n'));
  console.log('errors', errs);
  await ctx.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
