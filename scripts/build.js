#!/usr/bin/env node
// Zips extension/ (+ LICENSE, NOTICE) into dist/StepSafe.zip with manifest.json at the zip root.
// Pure Node (no zip binary or npm deps needed). Unzip it and "Load unpacked", or upload it to the Chrome Web Store.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'extension');
const OUT = path.join(ROOT, 'dist', 'StepSafe.zip');
const SKIP = /(^|\/)(\.DS_Store|Thumbs\.db|\..*\.swp|.*~)$|(^|\/)(test|tests|e2e|node_modules)(\/|$)/;

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, e.name), rel = path.relative(SRC, abs).split(path.sep).join('/');
    if (SKIP.test(rel)) continue;
    if (e.isDirectory()) walk(abs); else files.push([rel, abs]);
  }
})(SRC);
for (const f of ['LICENSE', 'NOTICE']) files.push([f, path.join(ROOT, f)]);

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

const parts = [], central = []; let offset = 0;
for (const [name, abs] of files) {
  const data = fs.readFileSync(abs), comp = zlib.deflateRawSync(data, { level: 9 }), nameBuf = Buffer.from(name, 'utf8'), crc = crc32(data);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
  lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
  ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
  parts.push(lh, nameBuf, comp); central.push(ch, nameBuf); offset += 30 + nameBuf.length + comp.length;
}
const cd = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([...parts, cd, end]));
const v = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'))).version;
console.log(`Built ${path.relative(ROOT, OUT)} — StepSafe v${v}, ${files.length} files, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
