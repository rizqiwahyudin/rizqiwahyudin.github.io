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

console.log('pathfinding-organism: all tests passed');
