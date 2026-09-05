'use strict';

import { buildScheduleFromZip, activeVehiclesFromSchedule, tripSidebar, OSLO_TZ } from './gtfs.js';
import { parseTripUpdates } from './gtfs-rt.js';
import { secSinceMidnightInZone } from './time.js';

const GTFS_URL = 'https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_rut-aggregated-gtfs.zip';
const TRIP_UPDATES_URL = 'https://api.entur.io/realtime/v1/gtfs-rt/trip-updates?datasource=RUT';
const CLIENT_NAME = 'rizqi-citywatch';
const SCHEDULE_CACHE_KEY = 'https://citywatch-oslo-transit.internal/schedule.json';
const SCHEDULE_TTL_SEC = 3 * 60 * 60;
const LIVE_TTL_SEC = 15;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200, extra = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': extra.cache || 'no-store',
            ...CORS,
        },
    });
}

async function fetchGtfsZip() {
    const res = await fetch(GTFS_URL, {
        headers: { 'ET-Client-Name': CLIENT_NAME },
    });
    if (!res.ok) throw new Error(`gtfs zip http ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
}

async function buildAndCacheSchedule(ctx) {
    const bytes = await fetchGtfsZip();
    const schedule = await buildScheduleFromZip(bytes, { timeZone: OSLO_TZ });
    const body = JSON.stringify(schedule);
    const res = new Response(body, {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': `public, max-age=${SCHEDULE_TTL_SEC}`,
            ...CORS,
        },
    });
    if (ctx && ctx.waitUntil && typeof caches !== 'undefined') {
        ctx.waitUntil(caches.default.put(new Request(SCHEDULE_CACHE_KEY), res.clone()));
    }
    return { schedule, response: res };
}

async function getSchedule(ctx, force = false) {
    if (!force && typeof caches !== 'undefined') {
        const hit = await caches.default.match(new Request(SCHEDULE_CACHE_KEY));
        if (hit) {
            const schedule = await hit.clone().json();
            return { schedule, response: hit };
        }
    }
    return buildAndCacheSchedule(ctx);
}

async function fetchDelays() {
    try {
        const res = await fetch(TRIP_UPDATES_URL, {
            headers: { 'ET-Client-Name': CLIENT_NAME },
            signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) return new Map();
        const buf = await res.arrayBuffer();
        const updates = parseTripUpdates(buf);
        const map = new Map();
        for (const u of updates) map.set(u.tripId, u.delay || 0);
        return map;
    } catch (e) {
        return new Map();
    }
}

function livePayload(schedule, delays) {
    const now = new Date();
    const nowSec = secSinceMidnightInZone(now, schedule.tz || OSLO_TZ);
    const vehicles = activeVehiclesFromSchedule(schedule, nowSec, delays);
    return {
        serverTime: Math.floor(Date.now() / 1000),
        date: schedule.date,
        tz: schedule.tz,
        vehicles,
    };
}

export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS });
        }

        const url = new URL(request.url);
        const path = url.pathname.replace(/\/+$/, '') || '/';

        try {
            if (path === '/' || path === '/health') {
                return json({ ok: true, service: 'citywatch-oslo-transit' });
            }

            if (path === '/gtfs-rt/oslo-schedule.json' || path === '/schedule') {
                const { response } = await getSchedule(ctx, url.searchParams.get('rebuild') === '1');
                const headers = new Headers(response.headers);
                for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
                return new Response(response.body, { status: 200, headers });
            }

            if (path === '/gtfs-rt/oslo-live.json' || path === '/live') {
                const { schedule } = await getSchedule(ctx);
                const delays = await fetchDelays();
                return json(livePayload(schedule, delays), 200, { cache: `public, max-age=${LIVE_TTL_SEC}` });
            }

            if (path === '/proxy/transit-trip' || path === '/trip') {
                const tripId = url.searchParams.get('tripId') || '';
                const { schedule } = await getSchedule(ctx);
                const nowSec = secSinceMidnightInZone(new Date(), schedule.tz || OSLO_TZ);
                const info = tripSidebar(schedule, tripId, nowSec);
                if (!info) return json({ error: 'not found' }, 404);
                return json(info);
            }

            return json({ error: 'not found' }, 404);
        } catch (err) {
            return json({ error: String(err && err.message ? err.message : err) }, 500);
        }
    },

    async scheduled(event, env, ctx) {
        ctx.waitUntil(buildAndCacheSchedule(ctx).then(() => undefined));
    },
};
