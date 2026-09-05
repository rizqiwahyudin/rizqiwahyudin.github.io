'use strict';

import assert from 'node:assert/strict';
import { parseGtfsTime, yyyymmddInZone, secSinceMidnightInZone, tzOffsetSecAt, adjustSecForOvernight } from './time.js';

assert.equal(parseGtfsTime('07:16:00'), 7 * 3600 + 16 * 60);
assert.equal(parseGtfsTime('25:30:00'), 25 * 3600 + 30 * 60);
assert.equal(parseGtfsTime(''), 0);

{
    // 13:00 UTC on 5 Sep 2026 is 15:00 in Oslo (CEST, UTC+2)
    const d = new Date('2026-09-05T13:00:00Z');
    assert.equal(yyyymmddInZone(d, 'Europe/Oslo'), '20260905');
    assert.equal(secSinceMidnightInZone(d, 'Europe/Oslo'), 15 * 3600);
    assert.equal(tzOffsetSecAt(d, 'Europe/Oslo'), 7200);
}

{
    // 12:00 UTC on 15 Jan 2026 is 13:00 in Oslo (CET, UTC+1)
    const d = new Date('2026-01-15T12:00:00Z');
    assert.equal(yyyymmddInZone(d, 'Europe/Oslo'), '20260115');
    assert.equal(secSinceMidnightInZone(d, 'Europe/Oslo'), 13 * 3600);
    assert.equal(tzOffsetSecAt(d, 'Europe/Oslo'), 3600);
}

assert.equal(adjustSecForOvernight(3600, 90000), 90000);
assert.equal(adjustSecForOvernight(36000, 35000), 36000);

console.log('time.test.js ok');
