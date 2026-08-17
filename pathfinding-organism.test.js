'use strict';

const assert = require('node:assert/strict');
const { OrganismSimulation } = require('./pathfinding-organism.js');

const graph = {
    nodes: {
        a: { id: 'a', x: 0, y: 0 },
        b: { id: 'b', x: 1, y: 0 },
        c: { id: 'c', x: 2, y: 0 },
    },
    edges: [
        { id: 0, a: 'a', b: 'b', distance: 1 },
        { id: 1, a: 'b', b: 'c', distance: 1 },
    ],
    adjacency: {
        a: [{ to: 'b', edgeId: 0, cost: 1 }],
        b: [
            { to: 'a', edgeId: 0, cost: 1 },
            { to: 'c', edgeId: 1, cost: 1 },
        ],
        c: [{ to: 'b', edgeId: 1, cost: 1 }],
    },
};

const simulation = new OrganismSimulation(graph);
const result = simulation.start('a', 'c', 'astar');
assert.equal(result.cost, 2);
assert.equal(simulation.phase, 'searching');

simulation.update(1, 1000, 100);
assert.equal(simulation.phase, 'resolved');
assert.equal(simulation.routeCost, 2);
assert.deepEqual([...simulation.routeEdgeIds], [0, 1]);
assert.deepEqual([...simulation.routeNodeIds], ['a', 'b', 'c']);
assert.ok(simulation.tendrils.size > 0);
assert.equal(simulation.frame('a', 'c', 1000).collapse, 0);

simulation.update(0, 2450, 0);
assert.equal(simulation.routeReveal, 1);
assert.equal(simulation.frame('a', 'c', 3420).collapse, 1);

simulation.start('a', 'c', 'dijkstra');
assert.equal(simulation.tendrils.size, 0);
assert.equal(simulation.routeStart, 0);
assert.equal(simulation.settledCount, 0);

{
    const Osm = require('./pathfinding-tactical-osm.js');
    const streets = Osm.graphFromOverpass(
        {
            elements: [
                { type: 'node', id: 1, lat: 51.5, lon: -0.12 },
                { type: 'node', id: 2, lat: 51.5, lon: -0.118 },
                { type: 'node', id: 3, lat: 51.502, lon: -0.118 },
                { type: 'node', id: 4, lat: 51.502, lon: -0.12 },
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
        { lat: 51.5, lon: -0.12 }
    );
    simulation.setGraph(streets);
    const origin = Osm.nearestNodeToLatLon(streets, 51.5, -0.12);
    const destination = Osm.pickDestination(streets, origin);
    const streetResult = simulation.start(origin, destination, 'astar');
    assert.equal(streetResult.found, true);
    assert.ok(streetResult.edgeIds.length > 0);
}

console.log('pathfinding-organism: all tests passed');
