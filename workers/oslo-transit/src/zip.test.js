'use strict';

import assert from 'node:assert/strict';
import { readZipText, listZip, forEachZipLine } from './zip.js';

/** Build a store-only (method 0) ZIP with one text member. */
function storeZip(name, text) {
    const nameBytes = new TextEncoder().encode(name);
    const data = new TextEncoder().encode(text);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 0, true); // method store
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    central.set(nameBytes, 46);

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, 1, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(12, central.length, true);
    ev.setUint32(16, local.length, true);

    const out = new Uint8Array(local.length + central.length + eocd.length);
    out.set(local, 0);
    out.set(central, local.length);
    out.set(eocd, local.length + central.length);
    return out;
}

const zip = storeZip('hello.txt', 'alpha\nbeta\n');
assert.deepEqual(listZip(zip), ['hello.txt']);
assert.equal(await readZipText(zip, 'hello.txt'), 'alpha\nbeta\n');

const lines = [];
await forEachZipLine(zip, 'hello.txt', (line) => lines.push(line));
assert.deepEqual(lines, ['alpha', 'beta']);

console.log('zip.test.js ok');
