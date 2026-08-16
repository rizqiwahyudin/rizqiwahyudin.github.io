'use strict';

const assert = require('node:assert/strict');
const Core = require('./pathfinding-core.js');
const Graph = require('./pathfinding-graph.js');
const {
    AnalyticalTimeline,
    carrierLocked,
    isolineCrossing,
} = require('./pathfinding-analytics.js');

assert.equal(carrierLocked(33, 34, 0), false);
assert.equal(carrierLocked(0, 34, 0), false);
assert.equal(carrierLocked(33, 34, 1), true);
assert.equal(carrierLocked(0, 34, 1), true);
assert.equal(carrierLocked(33, 34, 0.125), true);
assert.equal(carrierLocked(0, 34, 0.125), false);

{
    const mid = isolineCrossing(0, 0, 0, 10, 0, 10, 5);
    assert.equal(mid.x, 5);
    assert.equal(mid.y, 0);
    assert.equal(isolineCrossing(0, 0, 0, 10, 0, 4, 5), null);
    assert.equal(isolineCrossing(0, 0, 1, 10, 0, 1, 5), null);
    assert.equal(isolineCrossing(0, 0, null, 10, 0, 10, 5), null);
}

for (const algorithm of ['astar', 'dijkstra']) {
    const graph = Graph.createGraph(32841);
    const result = Core.search(graph, '2:13', '26:3', algorithm);
    const timeline = new AnalyticalTimeline(graph, result, '26:3');
    assert.ok(timeline.events.length >= result.events.length);
    const finalState = timeline.snapshot(timeline.events.length);
    assert.equal(finalState.routeFound, true);
    assert.equal(finalState.routeCost, result.cost);
    assert.deepEqual(
        new Set(
            finalState.edges
                .filter(edge => edge.route)
                .map(edge => edge.edgeId)
        ),
        new Set(result.edgeIds)
    );
    for (const event of timeline.events) {
        if (event.g != null && event.h != null && event.f != null) {
            assert.ok(Math.abs(event.f - (event.g + event.h)) < 1e-8);
        }
    }
    const middle = Math.floor(timeline.events.length / 2);
    assert.deepEqual(timeline.snapshot(middle), timeline.snapshot(middle));
    const acquisition = timeline.snapshot(timeline.acquisitionIndex());
    assert.equal(acquisition.routeFound, true);
    assert.equal(acquisition.carrierLock, 0);
    assert.equal(finalState.carrierLock, 1);
    assert.equal(timeline.snapshot(1).carrierLock, 0);
    const lockEvents = timeline.events.filter(
        event => event.type === 'carrier-lock'
    );
    assert.equal(lockEvents.length, 8);
    const foundIndex = timeline.events.findIndex(
        event => event.type === 'route-found'
    );
    assert.equal(timeline.events[foundIndex + 1].type, 'carrier-lock');
    assert.equal(lockEvents[0].progress, 0.125);
    assert.equal(lockEvents[7].progress, 1);
}

{
    const graph = Graph.createGraph(32841);
    const result = Core.search(graph, '2:13', '26:3', 'astar');
    const timeline = new AnalyticalTimeline(graph, result, '26:3');
    const finalState = timeline.snapshot(timeline.events.length);
    assert.ok(finalState.conflictCount >= 0);
    assert.ok(finalState.settledCount > 0);
    assert.equal(finalState.frontierSize >= 0, true);

    const origin = graph.nodes['2:13'];
    const distances = [];
    const threshold = timeline.maxG * 0.5;
    for (const edge of graph.edges) {
        const crossing = isolineCrossing(
            graph.nodes[edge.a].x,
            graph.nodes[edge.a].y,
            finalState.nodes[edge.a].g,
            graph.nodes[edge.b].x,
            graph.nodes[edge.b].y,
            finalState.nodes[edge.b].g,
            threshold
        );
        if (!crossing) continue;
        distances.push(
            Math.hypot(crossing.x - origin.x, crossing.y - origin.y)
        );
    }
    assert.ok(distances.length > 8);
    assert.ok(Math.max(...distances) - Math.min(...distances) > 80);

    const firstLocked = result.edgeIds.findIndex((_, index) =>
        carrierLocked(index, result.edgeIds.length, 0.5)
    );
    assert.ok(firstLocked > 0);
    assert.ok(firstLocked < result.edgeIds.length);
}

console.log('pathfinding-analytics: all tests passed');
