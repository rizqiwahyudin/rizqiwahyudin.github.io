'use strict';

const assert = require('node:assert/strict');
const Core = require('./pathfinding-core.js');
const Graph = require('./pathfinding-graph.js');
const {
    AnalyticalTimeline,
    buildBriefingNotes,
} = require('./pathfinding-analytics.js');

for (const algorithm of ['astar', 'dijkstra']) {
    const graph = Graph.createGraph(32841);
    const result = Core.search(graph, '2:13', '26:3', algorithm);
    const timeline = new AnalyticalTimeline(graph, result, '26:3');
    assert.ok(timeline.events.length < result.events.length);
    assert.ok(
        timeline.events.length <= result.nodeIds.length * 2 + 4
    );
    const pathNodes = new Set(result.nodeIds);
    const pathEdges = new Set(result.edgeIds);
    for (const event of timeline.events) {
        if (event.type === 'edge-relaxed') {
            assert.ok(pathEdges.has(event.edgeId));
            assert.ok(pathNodes.has(event.from));
            assert.ok(pathNodes.has(event.to));
        }
        if (event.type === 'node-settled' || event.type === 'origin') {
            assert.ok(pathNodes.has(event.nodeId));
        }
        assert.equal(event.type === 'carrier-lock', false);
    }
    const middle = Math.floor(timeline.events.length / 2);
    const midState = timeline.snapshot(middle);
    assert.ok(midState.frontierSize <= 1);
    if (midState.frontierSize === 1) {
        assert.ok(pathNodes.has(midState.frontierNodeId));
    }
    const finalState = timeline.snapshot(timeline.events.length);
    assert.equal(finalState.routeFound, true);
    assert.equal(finalState.routeCost, result.cost);
    assert.equal(finalState.frontierSize, 0);
    assert.deepEqual(
        new Set(
            finalState.edges
                .filter(edge => edge.route)
                .map(edge => edge.edgeId)
        ),
        pathEdges
    );
    assert.equal(
        timeline.snapshot(timeline.acquisitionIndex()).routeFound,
        true
    );
}

{
    const graph = Graph.createGraph(32841);
    const result = Core.search(graph, '2:13', '26:3', 'astar');
    const notes = buildBriefingNotes(graph, result, {
        blockedEdges: new Set(),
        resistance: new Map(),
        preferredEdges: new Set(),
    }, null);
    assert.equal(notes[0].title, 'path');
    assert.ok(notes.some(note => note.title === 'long stretch'));

    const blockedId = result.edgeIds[Math.floor(result.edgeIds.length / 2)];
    const blocked = Graph.createGraph(32841, {
        blockedEdges: new Set([blockedId]),
    });
    const reroute = Core.search(blocked, '2:13', '26:3', 'astar');
    const compared = buildBriefingNotes(
        blocked,
        reroute,
        { blockedEdges: new Set([blockedId]), resistance: new Map(), preferredEdges: new Set() },
        result
    );
    assert.ok(compared.some(note => note.title === 'closed'));
    assert.ok(compared.some(note => note.title === 'reroute'));
}

console.log('pathfinding-analytics: all tests passed');
