'use strict';

import assert from 'node:assert/strict';
import {
    parseTripUpdates,
    encodeStringField,
    encodeVarintField,
    encodeBytesField,
} from './gtfs-rt.js';

function buildFeed(tripId, delay) {
    const trip = encodeStringField(1, tripId);                 // TripDescriptor.trip_id
    const tripUpdate = [
        ...encodeBytesField(1, trip),                          // TripUpdate.trip
        ...encodeVarintField(5, delay),                        // TripUpdate.delay
    ];
    const entity = encodeBytesField(3, tripUpdate);            // FeedEntity.trip_update
    const feed = encodeBytesField(2, entity);                  // FeedMessage.entity
    return new Uint8Array(feed);
}

{
    const vehicles = parseTripUpdates(buildFeed('RUT:ServiceJourney:abc', 90));
    assert.equal(vehicles.length, 1);
    assert.equal(vehicles[0].tripId, 'RUT:ServiceJourney:abc');
    assert.equal(vehicles[0].delay, 90);
}

{
    const trip = encodeStringField(1, 'trip-2');
    const arrival = encodeVarintField(1, -30);                 // StopTimeEvent.delay
    const stu = encodeBytesField(2, arrival);                  // StopTimeUpdate.arrival
    const tripUpdate = [
        ...encodeBytesField(1, trip),
        ...encodeBytesField(3, stu),
    ];
    const entity = encodeBytesField(3, tripUpdate);
    const vehicles = parseTripUpdates(new Uint8Array(encodeBytesField(2, entity)));
    assert.equal(vehicles[0].tripId, 'trip-2');
    assert.equal(vehicles[0].delay, -30);
}

console.log('gtfs-rt.test.js ok');
