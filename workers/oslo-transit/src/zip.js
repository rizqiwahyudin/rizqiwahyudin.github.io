'use strict';

/**
 * Minimal ZIP reader. Inflates one stored/deflated member at a time so a
 * 50 MB GTFS archive does not have to become 300 MB in memory.
 */

function u16(view, off) { return view.getUint16(off, true); }
function u32(view, off) { return view.getUint32(off, true); }

function findEocd(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const start = Math.max(0, bytes.length - 22 - 65535);
    for (let i = bytes.length - 22; i >= start; i--) {
        if (u32(view, i) === 0x06054b50) return i;
    }
    throw new Error('zip: EOCD not found');
}

function readCentralDirectory(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEocd(bytes);
    const count = u16(view, eocd + 10);
    let off = u32(view, eocd + 16);
    const entries = new Map();
    for (let i = 0; i < count; i++) {
        if (u32(view, off) !== 0x02014b50) throw new Error('zip: bad central header');
        const method = u16(view, off + 10);
        const compSize = u32(view, off + 20);
        const uncompSize = u32(view, off + 24);
        const nameLen = u16(view, off + 28);
        const extraLen = u16(view, off + 30);
        const commentLen = u16(view, off + 32);
        const localOff = u32(view, off + 42);
        const name = new TextDecoder().decode(bytes.subarray(off + 46, off + 46 + nameLen));
        entries.set(name, { method, compSize, uncompSize, localOff, name });
        off += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

function memberSlice(bytes, ent) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const localOff = ent.localOff;
    if (u32(view, localOff) !== 0x04034b50) throw new Error(`zip: bad local header ${ent.name}`);
    const nameLen = u16(view, localOff + 26);
    const extraLen = u16(view, localOff + 28);
    const dataOff = localOff + 30 + nameLen + extraLen;
    return { compressed: bytes.subarray(dataOff, dataOff + ent.compSize), method: ent.method };
}

async function inflateRaw(compressed) {
    if (typeof DecompressionStream === 'undefined') {
        const { inflateRawSync } = await import('node:zlib');
        return new Uint8Array(inflateRawSync(compressed));
    }
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([compressed]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
}

function makeInflateStream(compressed, method) {
    if (method === 0) return new Blob([compressed]).stream();
    if (method === 8) {
        if (typeof DecompressionStream !== 'undefined') {
            return new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        }
        throw new Error('zip: DecompressionStream required for streamed deflate');
    }
    throw new Error(`zip: unsupported method ${method}`);
}

export async function readZipText(bytes, fileName) {
    const entries = readCentralDirectory(bytes);
    const ent = entries.get(fileName);
    if (!ent) throw new Error(`zip: missing ${fileName}`);
    const { compressed, method } = memberSlice(bytes, ent);
    let raw;
    if (method === 0) raw = compressed;
    else if (method === 8) raw = await inflateRaw(compressed);
    else throw new Error(`zip: unsupported method ${method} for ${fileName}`);
    return new TextDecoder('utf-8').decode(raw);
}

/**
 * Stream a ZIP member as UTF-8 lines without holding the full uncompressed file.
 * `onLine(line)` is called for every line except a trailing empty one.
 */
export async function forEachZipLine(bytes, fileName, onLine) {
    const entries = readCentralDirectory(bytes);
    const ent = entries.get(fileName);
    if (!ent) throw new Error(`zip: missing ${fileName}`);
    const { compressed, method } = memberSlice(bytes, ent);

    if (typeof DecompressionStream === 'undefined' && method === 8) {
        const text = await readZipText(bytes, fileName);
        for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
            if (line) onLine(line);
        }
        return;
    }

    const stream = makeInflateStream(compressed, method);
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8');
    let pending = '';
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = pending.indexOf('\n')) >= 0) {
            let line = pending.slice(0, nl);
            pending = pending.slice(nl + 1);
            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (line) onLine(line);
        }
    }
    pending += decoder.decode();
    if (pending) onLine(pending);
}

export function listZip(bytes) {
    return [...readCentralDirectory(bytes).keys()];
}
