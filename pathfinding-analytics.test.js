'use strict';

const assert = require('node:assert/strict');
const Core = require('./pathfinding-core.js');
const Graph = require('./pathfinding-graph.js');
const { AnalyticalTimeline } = require('./pathfinding-analytics.js');

for (const algorithm of ['astar', 'dijkstra']) {
    const graph = Graph.createGraph(32841);
    const result = Core.search(graph, '2:13', '26:3', algorithm);
    const timeline = new AnalyticalTimeline(graph, result, '26:3');
    assert.ok(timeline.events.length >= result.events.length);
    const finalState = timeline.snapshot(timeline.events.length);
    assert.equal(finalState.routeFound, true);
    assert.equal(finalState.routeCost, result.cost);
    assert.deepEqual(
        finalState.edges.filter(edge => edge.route).map(edge => edge.edgeId),
        result.edgeIds
    );
    for (const event of timeline.events) {
        if (event.g != null && event.h != null && event.f != null) {
            assert.ok(Math.abs(event.f - (event.g + event.h)) < 1e-8);
        }
    }
    const middle = Math.floor(timeline.events.length / 2);
    assert.deepEqual(timeline.snapshot(middle), timeline.snapshot(middle));
    assert.equal(
        timeline.snapshot(timeline.acquisitionIndex()).routeFound,
        true
    );
}

{
    const graph = Graph.createGraph(32841);
    const result = Core.search(graph, '2:13', '26:3', 'astar');
    const timeline = new AnalyticalTimeline(graph, result, '26:3');
    const finalState = timeline.snapshot(timeline.events.length);
    assert.ok(finalState.conflictCount >= 0);
    assert.ok(finalState.settledCount > 0);
    assert.equal(finalState.frontierSize >= 0, true);
}

console.log('pathfinding-analytics: all tests passed');
