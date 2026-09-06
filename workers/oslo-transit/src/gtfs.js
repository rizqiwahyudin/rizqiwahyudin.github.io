'use strict';

import { parseGtfsTime, yyyymmddInZone, secSinceMidnightInZone, tzOffsetSecAt } from './time.js';
import { modeFromRouteType, routeColorHex } from './routes.js';
import { readZipText, forEachZipLine } from './zip.js';

export const OSLO_TZ = 'Europe/Oslo';

export const DEFAULT_BBOX = {
    minLat: 59.82,
    maxLat: 60.05,
    minLon: 10.55,
    maxLon: 10.95,
};

export function splitCsvLine(line) {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
            if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; }
                else q = false;
            } else cur += ch;
        } else if (ch === '"') {
            q = true;
        } else if (ch === ',') {
            out.push(cur);
            cur = '';
        } else cur += ch;
    }
    out.push(cur);
    return out;
}

export function parseCsv(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.length);
    if (!lines.length) return [];
    const headers = splitCsvLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i]);
        const row = {};
        for (let j = 0; j < headers.length; j++) row[headers[j]] = cols[j] == null ? '' : cols[j];
        rows.push(row);
    }
    return rows;
}

export function serviceIdsForDate(calendarDateRows, yyyymmdd) {
    const ids = new Set();
    for (const row of calendarDateRows) {
        if (row.date === yyyymmdd && String(row.exception_type) === '1') {
            ids.add(row.service_id);
        }
    }
    return ids;
}

export function downsampleShape(points, minDistM = 40) {
    if (!points.length) return [];
    const out = [points[0]];
    let last = points[0];
    for (let i = 1; i < points.length - 1; i++) {
        const p = points[i];
        const d = (p.dist != null && last.dist != null)
            ? p.dist - last.dist
            : haversineM(last.lat, last.lon, p.lat, p.lon);
        if (d >= minDistM) {
            out.push(p);
            last = p;
        }
    }
    const end = points[points.length - 1];
    if (out[out.length - 1] !== end) out.push(end);
    return out;
}

function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const a1 = lat1 * Math.PI / 180;
    const a2 = lat2 * Math.PI / 180;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(a1) * Math.cos(a2) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function inBbox(lat, lon, bbox) {
    return lat >= bbox.minLat && lat <= bbox.maxLat
        && lon >= bbox.minLon && lon <= bbox.maxLon;
}

export function tripOverlapsWindow(stops, fromSec, toSec) {
    if (!stops.length) return false;
    const start = stops[0][1];
    const end = stops[stops.length - 1][2];
    return start <= toSec && end >= fromSec;
}

/** `windowSec: false | 'day'` keeps every trip on the service date (for static files). */
export function scheduleWindow(nowSec, windowSec) {
    const span = windowSec === undefined || windowSec == null ? 3 * 3600 : windowSec;
    if (span === false || span === 'day') return { fromSec: 0, toSec: 36 * 3600 };
    return { fromSec: nowSec - 15 * 60, toSec: nowSec + span };
}

function rowFromLine(headers, line) {
    const cols = splitCsvLine(line);
    const row = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]] = cols[i] == null ? '' : cols[i];
    return row;
}

/**
 * Compact CityWatch schedule from already-parsed tables (tests + small fixtures).
 * `tables` values are arrays of row objects.
 */
export function buildScheduleFromTables(tables, opts = {}) {
    const now = opts.now || new Date();
    const timeZone = opts.timeZone || OSLO_TZ;
    const ymd = opts.date || yyyymmddInZone(now, timeZone);
    const bbox = opts.bbox || DEFAULT_BBOX;
    const nowSec = opts.nowSec != null ? opts.nowSec : secSinceMidnightInZone(now, timeZone);
    const tzOffsetSec = opts.tzOffsetSec != null ? opts.tzOffsetSec : tzOffsetSecAt(now, timeZone);
    const { fromSec, toSec } = scheduleWindow(nowSec, opts.windowSec);

    const serviceIds = serviceIdsForDate(tables.calendar_dates || [], ymd);
    const routes = new Map((tables.routes || []).map((r) => [r.route_id, r]));

    const todayTrips = [];
    const todayTripIds = new Set();
    for (const t of tables.trips || []) {
        if (!serviceIds.has(t.service_id)) continue;
        todayTrips.push(t);
        todayTripIds.add(t.trip_id);
    }

    const stopsByTrip = new Map();
    const neededStopIds = new Set();
    for (const st of tables.stop_times || []) {
        if (!todayTripIds.has(st.trip_id)) continue;
        let arr = stopsByTrip.get(st.trip_id);
        if (!arr) { arr = []; stopsByTrip.set(st.trip_id, arr); }
        const dist = st.shape_dist_traveled === '' || st.shape_dist_traveled == null
            ? arr.length * 100
            : parseFloat(st.shape_dist_traveled) || 0;
        arr.push([
            dist,
            parseGtfsTime(st.arrival_time),
            parseGtfsTime(st.departure_time),
            st.stop_id,
        ]);
        neededStopIds.add(st.stop_id);
    }

    const activeTripRows = todayTrips.filter((t) => {
        const stops = stopsByTrip.get(t.trip_id);
        return stops && tripOverlapsWindow(stops, fromSec, toSec);
    });

    const usedShapeIds = new Set(activeTripRows.map((t) => t.shape_id).filter(Boolean));
    const shapePts = new Map();
    for (const s of tables.shapes || []) {
        if (!usedShapeIds.has(s.shape_id)) continue;
        let pts = shapePts.get(s.shape_id);
        if (!pts) { pts = []; shapePts.set(s.shape_id, pts); }
        pts.push({
            lat: parseFloat(s.shape_pt_lat),
            lon: parseFloat(s.shape_pt_lon),
            dist: s.shape_dist_traveled === '' || s.shape_dist_traveled == null
                ? pts.length
                : parseFloat(s.shape_dist_traveled) || 0,
        });
    }

    const shapes = {};
    for (const sid of usedShapeIds) {
        const ds = downsampleShape(shapePts.get(sid) || [], opts.minShapeDistM || 40);
        if (!ds.length) continue;
        if (!ds.some((p) => inBbox(p.lat, p.lon, bbox))) continue;
        shapes[sid] = ds.map((p) => [
            Math.round(p.lat * 1e6) / 1e6,
            Math.round(p.lon * 1e6) / 1e6,
            Math.round(p.dist),
        ]);
    }

    const stopNames = {};
    for (const s of tables.stops || []) {
        if (neededStopIds.has(s.stop_id)) stopNames[s.stop_id] = s.stop_name || s.stop_id;
    }

    const trips = {};
    for (const t of activeTripRows) {
        if (t.shape_id && !shapes[t.shape_id]) continue;
        const route = routes.get(t.route_id) || {};
        const mode = modeFromRouteType(route.route_type);
        const rawStops = stopsByTrip.get(t.trip_id) || [];
        trips[t.trip_id] = {
            l: String(route.route_short_name || t.route_id),
            c: routeColorHex(route, mode),
            s: t.shape_id,
            m: mode,
            h: t.trip_headsign || '',
            t: rawStops.map((row) => [row[0], row[1], row[2]]),
            n: rawStops.map((row) => stopNames[row[3]] || row[3]),
        };
    }

    return {
        city: 'oslo',
        tz: timeZone,
        date: ymd,
        tzOffsetSec,
        trips,
        shapes,
    };
}

async function collectCsvFromZip(bytes, fileName, onRow) {
    let headers = null;
    await forEachZipLine(bytes, fileName, (line) => {
        if (!headers) {
            headers = splitCsvLine(line.replace(/^\uFEFF/, ''));
            return;
        }
        onRow(rowFromLine(headers, line));
    });
}

/** Stream the real Ruter zip. Large files are never held as one string. */
export async function buildScheduleFromZip(bytes, opts = {}) {
    const now = opts.now || new Date();
    const timeZone = opts.timeZone || OSLO_TZ;
    const ymd = opts.date || yyyymmddInZone(now, timeZone);
    const bbox = opts.bbox || DEFAULT_BBOX;
    const nowSec = opts.nowSec != null ? opts.nowSec : secSinceMidnightInZone(now, timeZone);
    const tzOffsetSec = opts.tzOffsetSec != null ? opts.tzOffsetSec : tzOffsetSecAt(now, timeZone);
    const { fromSec, toSec } = scheduleWindow(nowSec, opts.windowSec);

    const calText = await readZipText(bytes, 'calendar_dates.txt');
    const serviceIds = serviceIdsForDate(parseCsv(calText), ymd);

    const routes = new Map();
    await collectCsvFromZip(bytes, 'routes.txt', (r) => routes.set(r.route_id, r));

    const todayTrips = [];
    const todayTripIds = new Set();
    await collectCsvFromZip(bytes, 'trips.txt', (t) => {
        if (!serviceIds.has(t.service_id)) return;
        todayTrips.push({
            trip_id: t.trip_id,
            route_id: t.route_id,
            shape_id: t.shape_id,
            trip_headsign: t.trip_headsign,
        });
        todayTripIds.add(t.trip_id);
    });

    const stopsByTrip = new Map();
    const neededStopIds = new Set();
    await collectCsvFromZip(bytes, 'stop_times.txt', (st) => {
        if (!todayTripIds.has(st.trip_id)) return;
        let arr = stopsByTrip.get(st.trip_id);
        if (!arr) { arr = []; stopsByTrip.set(st.trip_id, arr); }
        const dist = st.shape_dist_traveled === ''
            ? arr.length * 100
            : parseFloat(st.shape_dist_traveled) || 0;
        arr.push([
            dist,
            parseGtfsTime(st.arrival_time),
            parseGtfsTime(st.departure_time),
            st.stop_id,
        ]);
        neededStopIds.add(st.stop_id);
    });

    const activeTripRows = todayTrips.filter((t) => {
        const stops = stopsByTrip.get(t.trip_id);
        return stops && tripOverlapsWindow(stops, fromSec, toSec);
    });
    const usedShapeIds = new Set(activeTripRows.map((t) => t.shape_id).filter(Boolean));

    const shapePts = new Map();
    await collectCsvFromZip(bytes, 'shapes.txt', (s) => {
        if (!usedShapeIds.has(s.shape_id)) return;
        let pts = shapePts.get(s.shape_id);
        if (!pts) { pts = []; shapePts.set(s.shape_id, pts); }
        pts.push({
            lat: parseFloat(s.shape_pt_lat),
            lon: parseFloat(s.shape_pt_lon),
            dist: s.shape_dist_traveled === '' ? pts.length : parseFloat(s.shape_dist_traveled) || 0,
        });
    });

    const shapes = {};
    for (const sid of usedShapeIds) {
        const ds = downsampleShape(shapePts.get(sid) || [], opts.minShapeDistM || 40);
        if (!ds.length) continue;
        if (!ds.some((p) => inBbox(p.lat, p.lon, bbox))) continue;
        shapes[sid] = ds.map((p) => [
            Math.round(p.lat * 1e6) / 1e6,
            Math.round(p.lon * 1e6) / 1e6,
            Math.round(p.dist),
        ]);
    }

    const stopNames = {};
    await collectCsvFromZip(bytes, 'stops.txt', (s) => {
        if (!neededStopIds.has(s.stop_id)) return;
        stopNames[s.stop_id] = s.stop_name || s.stop_id;
    });

    const trips = {};
    for (const t of activeTripRows) {
        if (t.shape_id && !shapes[t.shape_id]) continue;
        const route = routes.get(t.route_id) || {};
        const mode = modeFromRouteType(route.route_type);
        const rawStops = stopsByTrip.get(t.trip_id) || [];
        trips[t.trip_id] = {
            l: String(route.route_short_name || t.route_id),
            c: routeColorHex(route, mode),
            s: t.shape_id,
            m: mode,
            h: t.trip_headsign || '',
            t: rawStops.map((row) => [row[0], row[1], row[2]]),
            n: rawStops.map((row) => stopNames[row[3]] || row[3]),
        };
    }

    return {
        city: 'oslo',
        tz: timeZone,
        date: ymd,
        tzOffsetSec,
        trips,
        shapes,
    };
}

export function activeVehiclesFromSchedule(schedule, nowSec, delays = new Map()) {
    const vehicles = [];
    for (const [tripId, trip] of Object.entries(schedule.trips || {})) {
        const stops = trip.t;
        if (!stops || !stops.length) continue;
        const delay = delays.has(tripId) ? delays.get(tripId) : 0;
        const adj = nowSec + delay;
        if (adj < stops[0][1] - 30) continue;
        if (adj > stops[stops.length - 1][2] + 30) continue;
        vehicles.push({ tripId, delay });
    }
    return vehicles;
}

export function tripSidebar(schedule, tripId, nowSec) {
    const trip = schedule.trips[tripId];
    if (!trip) return null;
    const names = trip.n || [];
    const nextStops = [];
    for (let i = 0; i < trip.t.length; i++) {
        const dep = trip.t[i][2];
        const eta = Math.round((dep - nowSec) / 60);
        if (eta < -1) continue;
        nextStops.push({ name: names[i] || `stop ${i + 1}`, etaMinutes: Math.max(0, eta) });
        if (nextStops.length >= 8) break;
    }
    return {
        line: trip.l,
        headsign: trip.h || '',
        mode: trip.m || '',
        nextStops,
    };
}
