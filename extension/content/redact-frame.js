/**
 * redact-frame.js — PII blur inside iframes (same- and cross-origin).
 * recorder.js only runs in the top frame; captureVisibleTab still paints
 * iframe content, so subframes get this small blur-only engine.
 * Injected with allFrames by the SW; no-op in the top frame.
 */
(function () {
  if (window === window.top || window.__stepsafeFrameRedact) return;
  window.__stepsafeFrameRedact = true;
  const PII = globalThis.StepSafePII;
  const BLUR = 'blur(8px)';
  let cfg = null, backup = [], obs = null, active = true;

  function blurEl(el) {
    if (backup.some(e => e.el === el)) return;
    backup.push({ el, original: el.style.getPropertyValue('filter'), priority: el.style.getPropertyPriority('filter') });
    el.style.setProperty('filter', BLUR, 'important');
  }
  function restore() {
    for (const e of backup) e.original ? e.el.style.setProperty('filter', e.original, e.priority || '') : e.el.style.removeProperty('filter');
    backup = [];
  }
  function roots() {
    const r = [document];
    for (let i = 0; i < r.length; i++) for (const el of r[i].querySelectorAll('*')) if (el.shadowRoot) r.push(el.shadowRoot);
    return r;
  }
  function run() {
    if (!cfg || !document.body || !PII) return;
    if (obs) obs.disconnect();
    restore();
    const hit = (t) => PII.findPII(t, cfg.cats, cfg.custom).length > 0;
    const rs = roots();
    for (const root of rs) {
      for (const el of root.querySelectorAll('input, textarea, select')) {
        const type = (el.type || '').toLowerCase();
        if (type === 'hidden') continue;
        if (cfg.cats.formFields || type === 'password' || (el.value && hit(el.value)) || (el.value && ['email', 'tel'].includes(type))) blurEl(el);
      }
      for (const el of root.querySelectorAll('[data-stepsafe-blur]')) blurEl(el);
      if (cfg.cats.tableData) for (const el of root.querySelectorAll('td, th')) blurEl(el);
      const w = document.createTreeWalker(root === document ? document.body : root, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) {
        const p = n.parentElement;
        if (p && !p.closest('script, style, noscript') && hit(n.textContent)) blurEl(p);
      }
    }
    obs = obs || new MutationObserver(run);
    obs.takeRecords();
    for (const root of rs) obs.observe(root === document ? document.body : root, { childList: true, subtree: true, characterData: true });
  }
  function stop() { if (obs) obs.disconnect(); obs = null; cfg = null; restore(); }
  function configure(s) {
    if (!s || s.autoRedact === false) return stop();
    const lines = Array.isArray(s.redactCustomPatterns) ? s.redactCustomPatterns.map(p => p && p.pattern) : String(s.redactCustomPatterns || '').split('\n');
    const custom = [];
    for (const p of lines) { if (p && p.trim()) try { custom.push(new RegExp(p.trim(), 'g')); } catch (_) {} }
    cfg = { cats: s.redactCategories || {}, custom };
    run();
  }
  document.addEventListener('input', () => cfg && run(), true);
  chrome.storage.local.get('pagewalk_settings').then(({ pagewalk_settings: s }) => configure(s || { autoRedact: true })).catch(() => {});
  chrome.storage.onChanged.addListener((c, area) => { if (active && area === 'local' && c.pagewalk_settings) configure(c.pagewalk_settings.newValue); });
  chrome.runtime.onMessage.addListener((msg) => {
    // Never sendResponse here: the top-frame recorder answers REDACT_FOR_CAPTURE.
    if (msg.type === 'REDACT_FOR_CAPTURE') active = true, chrome.storage.local.get('pagewalk_settings').then(({ pagewalk_settings: s }) => configure(s || { autoRedact: true }));
    if (msg.type === 'REDACT_PERSISTENT_STOP') { active = false; stop(); }
  });
})();
