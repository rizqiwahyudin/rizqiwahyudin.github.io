'use strict';

const assert = require('node:assert/strict');
const Core = require('./pathfinding-core.js');
const Osm = require('./pathfinding-tactical-osm.js');
const {
    AnalyticalTimeline,
    buildBriefingNotes,
} = require('./pathfinding-analytics.js');

const ORIGIN = { lat: 51.5074, lon: -0.1278 };

function squareFixture() {
    return {
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
            {
                type: 'way',
                id: 14,
                nodes: [1, 3],
                tags: { highway: 'footway' },
            },
            {
                type: 'way',
                id: 15,
                nodes: [2, 3],
                tags: { highway: 'residential' },
            },
            {
                type: 'way',
                id: 16,
                nodes: [1, 2],
                tags: { highway: 'proposed' },
            },
            {
                type: 'node',
                id: 99,
                lat: ORIGIN.lat,
                lon: ORIGIN.lon + 0.001,
                tags: {
                    man_made: 'surveillance',
                    'camera:type': 'fixed',
                    'camera:direction': '90',
                },
            },
        ],
    };
}

{
    assert.equal(Osm.classifyHighway('primary'), 'artery');
    assert.equal(Osm.classifyHighway('residential'), 'street');
    assert.equal(Osm.classifyHighway('service'), 'alley');
    assert.equal(Osm.classifyHighway('footway'), 'track');
    assert.equal(Osm.classifyHighway('proposed'), null);
}

{
    const bbox = Osm.bboxFromCenter(ORIGIN.lat, ORIGIN.lon, 850);
    assert.ok(bbox.north > ORIGIN.lat);
    assert.ok(bbox.south < ORIGIN.lat);
    assert.ok(bbox.east > ORIGIN.lon);
    assert.ok(bbox.west < ORIGIN.lon);
    assert.ok(
        Math.abs(bbox.north - ORIGIN.lat - (ORIGIN.lat - bbox.south)) < 1e-9
    );
}

{
    const graph = Osm.graphFromOverpass(squareFixture(), ORIGIN);
    assert.equal(Object.keys(graph.nodes).length, 4);
    assert.equal(graph.edges.length, 5);
    assert.equal(
        graph.edges.filter(edge => edge.kind === 'artery').length,
        1
    );
    assert.equal(
        graph.edges.filter(edge => edge.kind === 'track').length,
        1
    );
    assert.ok(graph.edges.every(edge => edge.bend === 0));
    assert.ok(graph.heuristicScale > 0);
    for (const node of Object.values(graph.nodes)) {
        assert.ok(node.x > 0 && node.x < 1600);
        assert.ok(node.y > 0 && node.y < 900);
        assert.ok(typeof node.lat === 'number');
    }
    assert.equal(graph.cameras.length, 1);
    assert.equal(graph.cameras[0].edgeId, 0);
    assert.ok(graph.edges[0].cameraCount >= 1);
}

{
    const base = Osm.graphFromOverpass(squareFixture(), ORIGIN);
    const avoided = Osm.withProfile(base, { avoidCameras: true });
    const cameraEdge = avoided.edges.find(edge => edge.cameraCount > 0);
    assert.ok(cameraEdge);
    assert.ok(cameraEdge.effectiveCost > cameraEdge.baseCost);
    const plain = Osm.withProfile(base, { avoidCameras: false });
    assert.equal(
        plain.edges[cameraEdge.id].effectiveCost,
        plain.edges[cameraEdge.id].baseCost
    );
}

{
    const graph = Osm.graphFromOverpass(squareFixture(), ORIGIN);
    const originId = Osm.nearestNodeToLatLon(
        graph,
        ORIGIN.lat,
        ORIGIN.lon
    );
    assert.equal(originId, '1');
    const destinationId = Osm.pickDestination(graph, originId);
    assert.ok(destinationId);
    assert.notEqual(destinationId, originId);
    const reachable = new Set(Osm.reachableIds(graph, originId));
    assert.ok(reachable.has(destinationId));

    const result = Core.search(graph, originId, destinationId, 'astar');
    assert.equal(result.found, true);
    assert.ok(result.edgeIds.length > 0);
}

{
    const base = Osm.graphFromOverpass(squareFixture(), ORIGIN);
    const blockedId = base.edges.find(edge => edge.a === '1' && edge.b === '3')
        .id;
    const blocked = Osm.withProfile(base, {
        blockedEdges: new Set([blockedId]),
    });
    assert.equal(blocked.edges[blockedId].blocked, true);
    assert.equal(
        blocked.adjacency['1'].some(entry => entry.edgeId === blockedId),
        false
    );
    const preferred = Osm.withProfile(base, {
        preferredEdges: new Set([blockedId]),
    });
    assert.ok(
        preferred.edges[blockedId].effectiveCost <
            preferred.edges[blockedId].baseCost
    );
}

{
    const graph = Osm.graphFromOverpass(squareFixture(), ORIGIN);
    const pair = Osm.pickRandomPair(graph, () => 0);
    assert.equal(pair.originId, Object.keys(graph.nodes)[0]);
    assert.ok(pair.destinationId);
}

{
    const raw = {
        a: { id: 'a', x: 0, y: 0, lat: 1, lon: 2 },
        b: { id: 'b', x: 100, y: 0, lat: 1, lon: 2.1 },
    };
    const fitted = Osm.fitNodesToWorld(raw, {
        width: 1600,
        height: 900,
        marginX: 90,
        marginY: 80,
    });
    assert.ok(fitted.a.x < fitted.b.x);
    assert.ok(Math.abs(fitted.a.y - fitted.b.y) < 1e-6);
}

{
    const origin = ORIGIN;
    const elements = [];
    for (let index = 0; index < 12; index++) {
        elements.push({
            type: 'node',
            id: index + 1,
            lat: origin.lat,
            lon: origin.lon + index * 0.00004,
        });
    }
    elements.push({
        type: 'way',
        id: 99,
        nodes: elements.filter(el => el.type === 'node').map(el => el.id),
        tags: { highway: 'residential' },
    });
    const graph = Osm.graphFromOverpass({ elements }, origin);
    assert.ok(Object.keys(graph.nodes).length < 12);
    assert.ok(Object.keys(graph.nodes).length >= 2);
    assert.ok(graph.nodes['1']);
    assert.ok(graph.nodes['12']);
}

{
    const graph = Osm.graphFromOverpass(squareFixture(), ORIGIN);
    const result = Core.search(graph, '1', '3', 'astar');
    assert.equal(result.found, true);
    const timeline = new AnalyticalTimeline(graph, result, '3');
    const pathEdges = new Set(result.edgeIds);
    for (const event of timeline.events) {
        if (event.type === 'edge-relaxed') {
            assert.ok(pathEdges.has(event.edgeId));
        }
    }
    const notes = buildBriefingNotes(graph, result, graph.profile, null);
    assert.ok(notes.length > 0);
}

{
    assert.throws(() => Osm.graphFromOverpass({ elements: [] }, ORIGIN));
}

async function testLocationFetch() {
    let calls = 0;
    const fetchImpl = async () => {
        calls += 1;
        return {
            ok: true,
            status: 200,
            json: async () => squareFixture(),
        };
    };
    const graph = await Osm.graphFromLocation(ORIGIN.lat, ORIGIN.lon, {
        fetch: fetchImpl,
        label: 'fixture',
    });
    assert.equal(calls, 1);
    assert.equal(graph.label, 'fixture');
    assert.equal(graph.edges.length, 5);

    const place = await Osm.searchPlace('anywhere', {
        fetch: async () => ({
            ok: true,
            json: async () => [
                { lat: '10.5', lon: '20.25', display_name: 'Anywhere' },
            ],
        }),
    });
    assert.equal(place.lat, 10.5);
    assert.equal(place.lon, 20.25);

    const position = await Osm.requestGeolocation({
        getCurrentPosition(success) {
            success({ coords: { latitude: 51.5, longitude: -0.12 } });
        },
    });
    assert.equal(position.lat, 51.5);
    assert.equal(position.lon, -0.12);
}

testLocationFetch()
    .then(() => {
        console.log('pathfinding-tactical-osm: all tests passed');
    })
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
