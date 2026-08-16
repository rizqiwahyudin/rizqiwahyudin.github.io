'use strict';

const assert = require('node:assert/strict');
const { MinHeap, search } = require('./pathfinding-core.js');

function makeGraph() {
    return {
        nodes: {
            a: { id: 'a', x: 0, y: 0 },
            b: { id: 'b', x: 1, y: 0 },
            c: { id: 'c', x: 2, y: 0 },
            d: { id: 'd', x: 1, y: 1 },
        },
        adjacency: {
            a: [
                { to: 'b', edgeId: 0, cost: 1 },
                { to: 'd', edgeId: 2, cost: 4 },
            ],
            b: [
                { to: 'a', edgeId: 0, cost: 1 },
                { to: 'c', edgeId: 1, cost: 1 },
            ],
            c: [
                { to: 'b', edgeId: 1, cost: 1 },
                { to: 'd', edgeId: 3, cost: 1 },
            ],
            d: [
                { to: 'a', edgeId: 2, cost: 4 },
                { to: 'c', edgeId: 3, cost: 1 },
            ],
        },
    };
}

{
    const heap = new MinHeap();
    heap.push('slow', 9);
    heap.push('fast', 1);
    heap.push('medium', 4);
    assert.equal(heap.pop().value, 'fast');
    assert.equal(heap.pop().value, 'medium');
    assert.equal(heap.pop().value, 'slow');
    assert.equal(heap.pop(), null);
}

for (const algorithm of ['dijkstra', 'astar']) {
    const result = search(makeGraph(), 'a', 'c', algorithm);
    assert.equal(result.found, true);
    assert.equal(result.cost, 2);
    assert.deepEqual(result.nodeIds, ['a', 'b', 'c']);
    assert.deepEqual(result.edgeIds, [0, 1]);
    assert.equal(result.events.at(-1).type, 'route-found');
}

{
    const graph = makeGraph();
    graph.adjacency.a = [];
    graph.adjacency.b = [];
    graph.adjacency.c = [];
    graph.adjacency.d = [];
    const result = search(graph, 'a', 'c', 'dijkstra');
    assert.equal(result.found, false);
    assert.equal(result.cost, Infinity);
    assert.deepEqual(result.nodeIds, []);
    assert.equal(result.events.at(-1).type, 'route-missing');
}

{
    const result = search(makeGraph(), 'a', 'a', 'astar');
    assert.equal(result.found, true);
    assert.equal(result.cost, 0);
    assert.deepEqual(result.nodeIds, ['a']);
    assert.deepEqual(result.edgeIds, []);
}

assert.throws(
    () => search(makeGraph(), 'missing', 'a', 'astar'),
    /must exist/
);

console.log('pathfinding-core: all tests passed');
