'use strict';

/**
 * Minimal protobuf decoder for GTFS-RT FeedMessage trip updates.
 * Only the fields CityWatch needs: trip_id + delay seconds.
 *
 * Wire types: 0 varint, 1 64-bit, 2 length-delimited, 5 32-bit.
 */

function readVarint(u8, i) {
    let n = 0;
    let shift = 0;
    while (i < u8.length) {
        const b = u8[i++];
        n += (b & 0x7f) * Math.pow(2, shift);
        if ((b & 0x80) === 0) break;
        shift += 7;
    }
    return [n, i];
}

function skip(u8, i, wire) {
    if (wire === 0) {
        const r = readVarint(u8, i);
        return r[1];
    }
    if (wire === 1) return i + 8;
    if (wire === 5) return i + 4;
    if (wire === 2) {
        const [len, j] = readVarint(u8, i);
        return j + len;
    }
    throw new Error(`protobuf: unknown wire ${wire}`);
}

function decodeString(u8, start, end) {
    return new TextDecoder().decode(u8.subarray(start, end));
}

function decodeMessage(u8, start, end, onField) {
    let i = start;
    while (i < end) {
        const [tag, j] = readVarint(u8, i);
        i = j;
        const field = tag >>> 3;
        const wire = tag & 7;
        if (wire === 2) {
            const [len, k] = readVarint(u8, i);
            onField(field, wire, u8, k, k + len);
            i = k + len;
        } else if (wire === 0) {
            const [n, k] = readVarint(u8, i);
            onField(field, wire, n, 0, 0);
            i = k;
        } else {
            i = skip(u8, i, wire);
        }
    }
}

function decodeStopTimeEvent(u8, start, end) {
    let delay = null;
    decodeMessage(u8, start, end, (field, wire, a) => {
        if (field === 1 && wire === 0) delay = a | 0; // delay
    });
    return delay;
}

function decodeTripDescriptor(u8, start, end) {
    let tripId = null;
    decodeMessage(u8, start, end, (field, wire, a, s, e) => {
        if (field === 1 && wire === 2) tripId = decodeString(a, s, e);
    });
    return tripId;
}

function decodeTripUpdate(u8, start, end) {
    let tripId = null;
    let delay = null;
    decodeMessage(u8, start, end, (field, wire, a, s, e) => {
        if (field === 1 && wire === 2) {
            tripId = decodeTripDescriptor(a, s, e);
        } else if (field === 5 && wire === 0) {
            delay = a | 0;
        } else if (field === 3 && wire === 2 && delay == null) {
            // first StopTimeUpdate: prefer arrival.delay, then departure.delay
            let stuDelay = null;
            decodeMessage(a, s, e, (f2, w2, a2, s2, e2) => {
                if ((f2 === 2 || f2 === 3) && w2 === 2 && stuDelay == null) {
                    const ev = decodeStopTimeEvent(a2, s2, e2);
                    if (ev != null) stuDelay = ev;
                }
            });
            if (stuDelay != null) delay = stuDelay;
        }
    });
    return { tripId, delay: delay || 0 };
}

function decodeEntity(u8, start, end) {
    let update = null;
    decodeMessage(u8, start, end, (field, wire, a, s, e) => {
        if (field === 3 && wire === 2) update = decodeTripUpdate(a, s, e);
    });
    return update;
}

/** @returns {{ tripId: string, delay: number }[]} */
export function parseTripUpdates(buffer) {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const vehicles = [];
    decodeMessage(u8, 0, u8.length, (field, wire, a, s, e) => {
        if (field === 2 && wire === 2) {
            const upd = decodeEntity(a, s, e);
            if (upd && upd.tripId) vehicles.push(upd);
        }
    });
    return vehicles;
}

/** Encode helpers used only by tests. */
export function encodeVarint(n) {
    const out = [];
    let x = n >>> 0;
    while (x > 0x7f) {
        out.push((x & 0x7f) | 0x80);
        x >>>= 7;
    }
    out.push(x);
    return out;
}

export function encodeKey(field, wire) {
    return encodeVarint((field << 3) | wire);
}

export function encodeStringField(field, str) {
    const bytes = new TextEncoder().encode(str);
    return [...encodeKey(field, 2), ...encodeVarint(bytes.length), ...bytes];
}

export function encodeVarintField(field, n) {
    return [...encodeKey(field, 0), ...encodeVarint(n >>> 0)];
}

export function encodeBytesField(field, inner) {
    return [...encodeKey(field, 2), ...encodeVarint(inner.length), ...inner];
}
