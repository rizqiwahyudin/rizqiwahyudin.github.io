'use strict';

const assert = require('node:assert/strict');
const Osm = require('./pathfinding-tactical-osm.js');
const Live = require('./pathfinding-tactical-live.js');
const Core = require('./pathfinding-core.js');

const ORIGIN = { lat: 51.5074, lon: -0.1278 };

function squareGraph() {
    return Osm.graphFromOverpass(
        {
            elements: [
                { type: 'node', id: 1, lat: ORIGIN.lat, lon: ORIGIN.lon },
                {
                    type: 'node',
                    id: 2,
                    lat: ORIGIN.lat,
                    lon: ORIGIN.lon + 0.002,
                },
                {
                    type: 'node',
                    id: 3,
                    lat: ORIGIN.lat + 0.002,
                    lon: ORIGIN.lon + 0.002,
                },
                {
                    type: 'node',
                    id: 4,
                    lat: ORIGIN.lat + 0.002,
                    lon: ORIGIN.lon,
                },
                {
                    type: 'way',
                    id: 10,
                    nodes: [1, 2],
                    tags: { highway: 'residential' },
                },
                {
                    type: 'way',
                    id: 11,
                    nodes: [2, 3],
                    tags: { highway: 'primary' },
                },
                {
                    type: 'way',
                    id: 12,
                    nodes: [3, 4],
                    tags: { highway: 'residential' },
                },
                {
                    type: 'way',
                    id: 13,
                    nodes: [4, 1],
                    tags: { highway: 'service' },
                },
            ],
        },
        ORIGIN
    );
}

{
    const graph = squareGraph();
    Live.attachWeather(graph, {
        temperature: 12,
        windSpeed: 3.2,
        windDirection: 180,
        code: 0,
        label: 'clear',
    });
    Live.attachOsrm(graph, {
        found: true,
        distance: 420,
        duration: 80,
        points: [
            { lat: ORIGIN.lat, lon: ORIGIN.lon },
            { lat: ORIGIN.lat + 0.002, lon: ORIGIN.lon + 0.002 },
        ],
        status: 'ok',
    });
    assert.equal(graph.weather.label, 'clear');
    assert.equal(graph.osrm.points.length, 2);
    assert.ok(graph.osrm.points[0].x > 0);

    const trafficGraph = Live.attachTraffic(graph, {
        coverage: true,
        incidents: [
            {
                incidentDetails: { criticality: 3 },
                location: {
                    geoCoord: { lat: ORIGIN.lat, lng: ORIGIN.lon + 0.001 },
                },
            },
        ],
    });
    assert.ok(trafficGraph.traffic.length >= 1);
    const hot = trafficGraph.rawEdges.find(edge => edge.trafficSeverity >= 3);
    assert.ok(hot);
    const avoided = Osm.withProfile(trafficGraph, { avoidTraffic: true });
    const avoidedEdge = avoided.edges.find(edge => edge.trafficSeverity >= 3);
    assert.ok(avoidedEdge);
    assert.ok(avoidedEdge.effectiveCost > avoidedEdge.baseCost);

    const result = Core.search(avoided, '1', '3', 'astar');
    const notes = Live.overlayNotes(avoided, result);
    assert.ok(notes.some(note => note.title === 'osrm'));
    assert.ok(notes.some(note => note.title === 'weather'));
    assert.ok(notes.some(note => note.title === 'traffic'));
}

async function testFetches() {
    const weather = await Live.fetchWeather(ORIGIN.lat, ORIGIN.lon, {
        fetch: async () => ({
            ok: true,
            json: async () => ({
                current: {
                    temperature_2m: 8,
                    wind_speed_10m: 2,
                    wind_direction_10m: 90,
                    weather_code: 61,
                },
            }),
        }),
    });
    assert.equal(weather.label, 'rain');

    const osrm = await Live.fetchOsrm(
        { lat: 1, lon: 2 },
        { lat: 1.01, lon: 2.01 },
        {
            fetch: async () => ({
                ok: true,
                json: async () => ({
                    routes: [
                        {
                            distance: 900,
                            duration: 120,
                            geometry: {
                                coordinates: [
                                    [2, 1],
                                    [2.01, 1.01],
                                ],
                            },
                        },
                    ],
                }),
            }),
        }
    );
    assert.equal(osrm.found, true);
    assert.equal(osrm.distance, 900);

    const traffic = await Live.fetchTraffic(ORIGIN.lat, ORIGIN.lon, {
        fetch: async () => ({
            ok: true,
            json: async () => ({ _note: 'no key', results: [] }),
        }),
    });
    assert.equal(traffic.coverage, false);
}

testFetches()
    .then(() => {
        console.log('pathfinding-tactical-live: all tests passed');
    })
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
