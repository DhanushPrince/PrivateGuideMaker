// Run: node --test   (no deps)
const test = require('node:test');
const assert = require('node:assert');
const { luhn, verhoeff, findPII, maskPII } = require('../extension/lib/pii.js');

const cats = (text) => findPII(text).map(h => h[2]);

test('checksums', () => {
  assert.ok(luhn('4111 1111 1111 1111'));
  assert.ok(!luhn('4111 1111 1111 1112'));
  assert.ok(verhoeff('234123412346'));
  assert.ok(!verhoeff('234123412345'));
});

test('positives', () => {
  const pos = {
    emails: 'mail priya.k@example.co.in now',
    phones: 'call +91 98765 43210 or 9876543210 or (415) 555-0132',
    creditCards: 'card 4111-1111-1111-1111',
    aadhaar: 'aadhaar 2341 2341 2346',
    pan: 'PAN ABCPE1234F',
    upi: 'pay priya@okhdfcbank',
    ifsc: 'IFSC HDFC0001234',
  };
  for (const [k, text] of Object.entries(pos)) assert.ok(cats(text).includes(k), `${k}: ${text}`);
});

test('negatives', () => {
  const neg = {
    creditCards: 'order 4111 1111 1111 1112',   // fails Luhn
    aadhaar: 'ref 2341 2341 2345',              // fails Verhoeff
    pan: 'code ABCDE12345',                     // wrong shape
    upi: 'mail priya@example.com',              // email, not UPI
    ifsc: 'HDFC1001234',                        // 5th char must be 0
    phones: 'year 2026, order 12345',
  };
  for (const [k, text] of Object.entries(neg)) assert.ok(!cats(text).includes(k), `${k}: ${text}`);
  assert.deepStrictEqual(findPII('Click "Save settings"'), []);
});

test('toggles + mask', () => {
  assert.strictEqual(findPII('x@y.com', { emails: false }).length, 0);
  assert.strictEqual(findPII('₹1,200', {}).length, 0);          // money is opt-in
  assert.strictEqual(findPII('₹1,200', { money: true }).length, 1);
  assert.strictEqual(maskPII('PAN ABCPE1234F ok'), 'PAN •••••••••• ok');
});
