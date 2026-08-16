'use strict';

const assert = require('node:assert/strict');
const Graph = require('./pathfinding-graph.js');
const Core = require('./pathfinding-core.js');

const first = Graph.createGraph(32841);
const second = Graph.createGraph(32841);
assert.deepEqual(first.nodes, second.nodes);
assert.deepEqual(first.edges, second.edges);
assert.equal(first.edges.length, second.edges.length);

const baseRoute = Core.search(first, '2:13', '26:3', 'astar');
assert.equal(baseRoute.found, true);

const blockedId = baseRoute.edgeIds[Math.floor(baseRoute.edgeIds.length / 2)];
const blocked = Graph.createGraph(32841, {
    blockedEdges: new Set([blockedId]),
});
assert.equal(
    blocked.adjacency[blocked.edges[blockedId].a].some(
        entry => entry.edgeId === blockedId
    ),
    false
);
const alternate = Core.search(blocked, '2:13', '26:3', 'astar');
assert.equal(alternate.found, true);
assert.ok(!alternate.edgeIds.includes(blockedId));

const resisted = Graph.createGraph(32841, {
    resistance: new Map([[blockedId, 5]]),
});
assert.ok(
    resisted.edges[blockedId].effectiveCost >
        resisted.edges[blockedId].baseCost
);

const preferred = Graph.createGraph(32841, {
    preferredEdges: new Set([blockedId]),
});
assert.ok(
    preferred.edges[blockedId].effectiveCost <
        preferred.edges[blockedId].baseCost
);

console.log('pathfinding-graph: all tests passed');
