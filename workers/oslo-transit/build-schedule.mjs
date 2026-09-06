#!/usr/bin/env node
'use strict';

/**
 * Download today's Ruter GTFS and write a full-day compact schedule JSON.
 * Used by the GitHub Action and for local rebuilds.
 *
 *   node workers/oslo-transit/build-schedule.mjs
 *   node workers/oslo-transit/build-schedule.mjs --out /tmp/oslo-schedule.json
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScheduleFromZip, OSLO_TZ } from './src/gtfs.js';

const GTFS_URL = 'https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_rut-aggregated-gtfs.zip';
const CLIENT_NAME = 'rizqi-citywatch';

function argValue(flag, fallback) {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const outPath = resolve(argValue('--out', resolve(root, 'oslo-schedule.json')));

const res = await fetch(GTFS_URL, { headers: { 'ET-Client-Name': CLIENT_NAME } });
if (!res.ok) throw new Error(`gtfs zip http ${res.status}`);
const bytes = new Uint8Array(await res.arrayBuffer());
console.log(`downloaded ${(bytes.length / 1e6).toFixed(1)} MB`);

const t0 = Date.now();
const schedule = await buildScheduleFromZip(bytes, {
    timeZone: OSLO_TZ,
    windowSec: 'day',
});
const json = JSON.stringify(schedule);
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, json);
const modes = {};
for (const t of Object.values(schedule.trips)) modes[t.m] = (modes[t.m] || 0) + 1;
console.log(JSON.stringify({
    out: outPath,
    date: schedule.date,
    trips: Object.keys(schedule.trips).length,
    shapes: Object.keys(schedule.shapes).length,
    modes,
    bytes: json.length,
    build_ms: Date.now() - t0,
}, null, 2));
