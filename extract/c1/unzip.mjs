#!/usr/bin/env node
// Minimal ZIP extractor: parse End Of Central Directory -> central directory -> local headers -> inflateRaw.
import fs from 'node:fs';
import zlib from 'node:zlib';

const [, , zipPath, outDir] = process.argv;
const buf = fs.readFileSync(zipPath);
if (outDir) fs.mkdirSync(outDir, { recursive: true });

// find EOCD (signature 0x06054b50) scanning backwards
let eocd = -1;
for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) { console.error('EOCD not found'); process.exit(1); }
const count = buf.readUInt16LE(eocd + 10);
const cdOff = buf.readUInt32LE(eocd + 16);
let p = cdOff;
let n = 0;
for (let k = 0; k < count; k++) {
  if (buf.readUInt32LE(p) !== 0x02014b50) break;
  const method = buf.readUInt16LE(p + 10);
  const compSize = buf.readUInt32LE(p + 20);
  const nameLen = buf.readUInt16LE(p + 28);
  const extraLen = buf.readUInt16LE(p + 30);
  const cmtLen = buf.readUInt16LE(p + 32);
  const localOff = buf.readUInt32LE(p + 42);
  const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
  // local header
  const lNameLen = buf.readUInt16LE(localOff + 26);
  const lExtraLen = buf.readUInt16LE(localOff + 28);
  const dataStart = localOff + 30 + lNameLen + lExtraLen;
  const raw = buf.slice(dataStart, dataStart + compSize);
  let out;
  if (method === 0) out = raw;
  else if (method === 8) out = zlib.inflateRawSync(raw);
  else { console.error('skip method ' + method + ' ' + name); p += 46 + nameLen + extraLen + cmtLen; continue; }
  if (outDir) {
    const dest = outDir + '/' + name;
    fs.mkdirSync(dest.substring(0, dest.lastIndexOf('/')), { recursive: true });
    fs.writeFileSync(dest, out);
  }
  n++;
  p += 46 + nameLen + extraLen + cmtLen;
}
console.error('extracted ' + n + '/' + count + ' entries -> ' + (outDir || '(dry)'));
