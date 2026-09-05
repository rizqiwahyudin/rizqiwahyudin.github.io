'use strict';

import assert from 'node:assert/strict';
import {
    buildScheduleFromTables,
    activeVehiclesFromSchedule,
    tripSidebar,
    tripOverlapsWindow,
    downsampleShape,
    serviceIdsForDate,
} from './gtfs.js';

assert.deepEqual(
    [...serviceIdsForDate([
        { service_id: 'A', date: '20260905', exception_type: '1' },
        { service_id: 'B', date: '20260906', exception_type: '1' },
        { service_id: 'C', date: '20260905', exception_type: '2' },
    ], '20260905')],
    ['A']
);

assert.equal(tripOverlapsWindow([[0, 36000, 36000], [100, 39000, 39000]], 37000, 40000), true);
assert.equal(tripOverlapsWindow([[0, 1000, 1000], [100, 2000, 2000]], 5000, 8000), false);

{
    const pts = [];
    for (let i = 0; i < 10; i++) pts.push({ lat: 59.9, lon: 10.7 + i * 0.001, dist: i * 10 });
    const ds = downsampleShape(pts, 40);
    assert.ok(ds.length < pts.length);
    assert.equal(ds[0].dist, 0);
    assert.equal(ds[ds.length - 1].dist, 90);
}

const tables = {
    calendar_dates: [
        { service_id: 'DAY', date: '20260905', exception_type: '1' },
        { service_id: 'OTHER', date: '20260906', exception_type: '1' },
    ],
    routes: [
        { route_id: 'RUT:Line:5', route_short_name: '5', route_type: '401', route_color: 'EC700C' },
        { route_id: 'RUT:Line:31', route_short_name: '31', route_type: '704', route_color: 'E60000' },
    ],
    trips: [
        {
            trip_id: 'metro-now',
            route_id: 'RUT:Line:5',
            service_id: 'DAY',
            shape_id: 'shape-metro',
            trip_headsign: 'Sognsvann',
        },
        {
            trip_id: 'bus-now',
            route_id: 'RUT:Line:31',
            service_id: 'DAY',
            shape_id: 'shape-bus',
            trip_headsign: 'Grorud',
        },
        {
            trip_id: 'metro-later',
            route_id: 'RUT:Line:5',
            service_id: 'DAY',
            shape_id: 'shape-metro',
            trip_headsign: 'Vestli',
        },
        {
            trip_id: 'wrong-day',
            route_id: 'RUT:Line:5',
            service_id: 'OTHER',
            shape_id: 'shape-metro',
            trip_headsign: 'nope',
        },
    ],
    stop_times: [
        { trip_id: 'metro-now', stop_id: 'Q1', arrival_time: '14:50:00', departure_time: '14:50:00', shape_dist_traveled: '0' },
        { trip_id: 'metro-now', stop_id: 'Q2', arrival_time: '15:10:00', departure_time: '15:10:00', shape_dist_traveled: '2000' },
        { trip_id: 'bus-now', stop_id: 'Q3', arrival_time: '14:40:00', departure_time: '14:40:00', shape_dist_traveled: '0' },
        { trip_id: 'bus-now', stop_id: 'Q4', arrival_time: '15:20:00', departure_time: '15:20:00', shape_dist_traveled: '4000' },
        { trip_id: 'metro-later', stop_id: 'Q1', arrival_time: '20:00:00', departure_time: '20:00:00', shape_dist_traveled: '0' },
        { trip_id: 'metro-later', stop_id: 'Q2', arrival_time: '20:20:00', departure_time: '20:20:00', shape_dist_traveled: '2000' },
        { trip_id: 'wrong-day', stop_id: 'Q1', arrival_time: '15:00:00', departure_time: '15:00:00', shape_dist_traveled: '0' },
        { trip_id: 'wrong-day', stop_id: 'Q2', arrival_time: '15:10:00', departure_time: '15:10:00', shape_dist_traveled: '100' },
    ],
    shapes: [
        { shape_id: 'shape-metro', shape_pt_lat: '59.911', shape_pt_lon: '10.750', shape_dist_traveled: '0' },
        { shape_id: 'shape-metro', shape_pt_lat: '59.950', shape_pt_lon: '10.740', shape_dist_traveled: '4000' },
        { shape_id: 'shape-bus', shape_pt_lat: '59.913', shape_pt_lon: '10.752', shape_dist_traveled: '0' },
        { shape_id: 'shape-bus', shape_pt_lat: '59.940', shape_pt_lon: '10.880', shape_dist_traveled: '8000' },
    ],
    stops: [
        { stop_id: 'Q1', stop_name: 'Jernbanetorget' },
        { stop_id: 'Q2', stop_name: 'Sognsvann' },
        { stop_id: 'Q3', stop_name: 'Jernbanetorget' },
        { stop_id: 'Q4', stop_name: 'Grorud' },
    ],
};

const schedule = buildScheduleFromTables(tables, {
    date: '20260905',
    nowSec: 15 * 3600,
    timeZone: 'Europe/Oslo',
    tzOffsetSec: 7200,
    windowSec: 3 * 3600,
});

assert.equal(schedule.city, 'oslo');
assert.ok(schedule.trips['metro-now']);
assert.ok(schedule.trips['bus-now']);
assert.equal(schedule.trips['metro-later'], undefined, 'trip outside window excluded');
assert.equal(schedule.trips['wrong-day'], undefined, 'other service date excluded');
assert.equal(schedule.trips['metro-now'].l, '5');
assert.equal(schedule.trips['metro-now'].m, 'metro');
assert.equal(schedule.trips['metro-now'].c, 'EC700C');
assert.equal(schedule.trips['metro-now'].n[0], 'Jernbanetorget');
assert.ok(schedule.shapes['shape-metro']);
assert.equal(schedule.trips['bus-now'].m, 'bus');

const live = activeVehiclesFromSchedule(schedule, 15 * 3600, new Map([['metro-now', 45]]));
const byId = Object.fromEntries(live.map((v) => [v.tripId, v.delay]));
assert.equal(byId['metro-now'], 45);
assert.equal(byId['bus-now'], 0);

const side = tripSidebar(schedule, 'metro-now', 15 * 3600);
assert.equal(side.line, '5');
assert.equal(side.headsign, 'Sognsvann');
assert.equal(side.nextStops[0].name, 'Sognsvann');
assert.equal(side.nextStops[0].etaMinutes, 10);

console.log('gtfs.test.js ok');
