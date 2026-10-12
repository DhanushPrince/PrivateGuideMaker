/**
 * pii.js — StepSafe PII detectors. Classic script: injected before
 * content/recorder.js (sets globalThis.StepSafePII) and require()-able by
 * node for tests. Each category: regex (+ optional checksum validator).
 */
(function () {
  'use strict';

  const digits = (s) => s.replace(/\D/g, '');

  function luhn(s) {
    const d = digits(s);
    if (d.length < 13 || d.length > 19) return false;
    let sum = 0;
    for (let i = 0; i < d.length; i++) {
      let n = +d[d.length - 1 - i];
      if (i % 2) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
    }
    return sum % 10 === 0;
  }

  const VD = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
  const VP = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  function verhoeff(s) {
    const d = digits(s);
    let c = 0;
    for (let i = 0; i < d.length; i++) c = VD[c][VP[i % 8][+d[d.length - 1 - i]]];
    return d.length > 0 && c === 0;
  }

  // Default-on unless the category is explicitly false; `money` is opt-in.
  const CATEGORIES = {
    emails:      { re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },
    phones:      { re: /\+\d{1,3}[\s.\-]?\(?\d{1,4}\)?(?:[\s.\-]?\d{2,5}){2,4}|(?<!\d)0?[6-9]\d{4}[\s\-]?\d{5}(?!\d)|\(?\b\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/g },
    creditCards: { re: /\b(?:\d[ \-]?){12,18}\d\b/g, check: luhn },
    aadhaar:     { re: /\b[2-9]\d{3}[ \-]?\d{4}[ \-]?\d{4}\b/g, check: verhoeff },
    pan:         { re: /\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b/g },
    upi:         { re: /(?<![\w.\-])[\w.\-]{2,256}@[a-zA-Z]{2,64}(?![\w.\-@])/g },
    ifsc:        { re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
    ssn:         { re: /\b\d{3}[\s\-]?\d{2}[\s\-]?\d{4}\b/g },
    money:       { re: /(?:[\$\u00a3\u20ac\u00a5\u20b9\u20a9\u20ba\u20bd\u20b1\u20b4\u20ab\u20a1\u20b2\u20ad\ufdfc\u20aa]|R\$|RM|Rp|Rs|kr|zł|Kč|Ft)\s?\d{1,3}(?:[,\.]\d{3})*(?:\.\d{1,2})?|\d{1,3}(?:[,\.]\d{3})*(?:\.\d{1,2})?\s?(?:USD|EUR|GBP|JPY|AED|SAR|INR|CNY|SGD|CAD|AUD|CHF)\b/gi, optIn: true },
  };

  // Returns [[start, end, category], ...] for every validated match.
  function findPII(text, cats = {}, custom = []) {
    const out = [];
    if (!text) return out;
    const active = Object.entries(CATEGORIES)
      .filter(([k, c]) => c.optIn ? cats[k] === true : cats[k] !== false)
      .concat(custom.map((re, i) => ['custom' + i, { re }]));
    for (const [k, { re, check }] of active) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        if (!m[0] || (check && !check(m[0]))) continue;
        out.push([m.index, m.index + m[0].length, k]);
      }
    }
    return out;
  }

  // Replace every match with a mask char (used for step text, not pixels).
  function maskPII(text, cats, custom, ch = '•') {
    const hits = findPII(text, cats, custom);
    if (!hits.length) return text;
    const arr = String(text).split('');
    for (const [s, e] of hits) for (let i = s; i < e; i++) arr[i] = ch;
    return arr.join('');
  }

  const api = { luhn, verhoeff, findPII, maskPII, CATEGORIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.StepSafePII = api;
})();
