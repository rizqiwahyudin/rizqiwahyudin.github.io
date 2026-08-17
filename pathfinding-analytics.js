(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.PathfindingAnalytics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const CHECKPOINT_INTERVAL = 8;

    function heuristic(graph, nodeId, destinationId) {
        const node = graph.nodes[nodeId];
        const destination = graph.nodes[destinationId];
        return (
            Math.hypot(node.x - destination.x, node.y - destination.y) *
            graph.heuristicScale
        );
    }

    function edgeAnchor(graph, edgeId) {
        const edge = graph.edges[edgeId];
        const a = graph.nodes[edge.a];
        const b = graph.nodes[edge.b];
        return {
            x: (a.x + b.x) * 0.5,
            y: (a.y + b.y) * 0.5,
            edgeId,
        };
    }

    function createEdgeState(edge) {
        return {
            edgeId: edge.id,
            discoveredAt: null,
            settledAt: null,
            supersededAt: [],
            g: null,
            h: null,
            f: null,
            phase: 0,
            amplitude: 0,
            predecessor: false,
            route: false,
            blocked: edge.blocked,
            resistance: edge.resistance,
        };
    }

    function createNodeState(nodeId) {
        return {
            nodeId,
            queueState: 'undiscovered',
            settledOrder: null,
            predecessorEdgeId: null,
            conflictCount: 0,
            g: null,
            h: null,
            f: null,
        };
    }

    function blankState(graph) {
        const nodes = {};
        for (const nodeId of Object.keys(graph.nodes)) {
            nodes[nodeId] = createNodeState(nodeId);
        }
        return {
            edges: graph.edges.map(createEdgeState),
            nodes,
            frontierSize: 0,
            frontierNodeId: null,
            settledCount: 0,
            conflictCount: 0,
            routeCost: null,
            routeFound: false,
            carrierLock: 0,
            eventType: 'ready',
        };
    }

    function cloneState(state) {
        return {
            edges: state.edges.map(edge => ({
                ...edge,
                supersededAt: [...edge.supersededAt],
            })),
            nodes: Object.fromEntries(
                Object.entries(state.nodes).map(([id, node]) => [
                    id,
                    { ...node },
                ])
            ),
            frontierSize: state.frontierSize,
            frontierNodeId: state.frontierNodeId,
            settledCount: state.settledCount,
            conflictCount: state.conflictCount,
            routeCost: state.routeCost,
            routeFound: state.routeFound,
            carrierLock: state.carrierLock,
            eventType: state.eventType,
        };
    }

    function pathDistance(graph, edgeIds) {
        let distance = 0;
        for (const edgeId of edgeIds) {
            distance += graph.edges[edgeId].distance;
        }
        return distance;
    }

    function buildBriefingNotes(graph, result, profile, previousResult) {
        const notes = [];
        if (!result?.found || !result.edgeIds.length) return notes;

        const mid = edgeAnchor(
            graph,
            result.edgeIds[Math.floor(result.edgeIds.length / 2)]
        );
        notes.push({
            id: 'summary',
            title: 'path',
            body:
                `${result.edgeIds.length} legs  ·  ` +
                `${Math.round(result.cost)} cost  ·  ` +
                `${Math.round(pathDistance(graph, result.edgeIds))} dist`,
            x: mid.x,
            y: mid.y,
        });

        const blocked = profile?.blockedEdges || new Set();
        for (const edgeId of blocked) {
            const anchor = edgeAnchor(graph, edgeId);
            notes.push({
                id: `closed-${edgeId}`,
                title: 'closed',
                body: `edge ${edgeId}`,
                x: anchor.x,
                y: anchor.y,
            });
        }

        const resistance = profile?.resistance || new Map();
        for (const [edgeId, value] of resistance) {
            const anchor = edgeAnchor(graph, edgeId);
            notes.push({
                id: `avoid-${edgeId}`,
                title: 'avoid',
                body: `${Number(value).toFixed(1)}x cost`,
                x: anchor.x,
                y: anchor.y,
            });
        }

        const preferred = profile?.preferredEdges || new Set();
        for (const edgeId of preferred) {
            const anchor = edgeAnchor(graph, edgeId);
            notes.push({
                id: `preferred-${edgeId}`,
                title: 'preferred',
                body: `edge ${edgeId}`,
                x: anchor.x,
                y: anchor.y,
            });
        }

        let longest = null;
        for (const edgeId of result.edgeIds) {
            const edge = graph.edges[edgeId];
            if (!longest || edge.distance > longest.distance) longest = edge;
        }
        if (longest) {
            const anchor = edgeAnchor(graph, longest.id);
            notes.push({
                id: `long-${longest.id}`,
                title: 'long stretch',
                body: `${longest.distance.toFixed(0)} dist`,
                x: anchor.x,
                y: anchor.y,
            });
        }

        if (previousResult?.found && previousResult.edgeIds) {
            const oldSet = new Set(previousResult.edgeIds);
            const appeared = result.edgeIds.find(id => !oldSet.has(id));
            const anchor = edgeAnchor(
                graph,
                appeared ?? result.edgeIds[0]
            );
            const delta = result.cost - previousResult.cost;
            const sign = delta >= 0 ? '+' : '';
            notes.push({
                id: 'reroute',
                title: 'reroute',
                body:
                    `${sign}${Math.round(delta)} cost  ·  ` +
                    `${previousResult.edgeIds.length} → ${result.edgeIds.length} legs`,
                x: anchor.x,
                y: anchor.y,
            });
        }

        return notes;
    }

    class AnalyticalTimeline {
        constructor(graph, result, destinationId) {
            this.graph = graph;
            this.result = result;
            this.destinationId = destinationId;
            this.events = this.instrumentPath(result);
            this.checkpoints = new Map([[0, blankState(graph)]]);
            this.maxG = 1;
            this.maxH = 1;
            this.maxF = 1;
            this.buildCheckpoints();
        }

        instrumentPath(result) {
            const events = [];
            let sequence = 0;
            const nodeIds = result.nodeIds || [];
            const edgeIds = result.edgeIds || [];
            if (!result.found || nodeIds.length === 0) {
                events.push({
                    type: 'route-missing',
                    sequence: sequence++,
                    frontierSize: 0,
                    frontierNodeId: null,
                });
                return events;
            }

            events.push({
                type: 'origin',
                sequence: sequence++,
                nodeId: nodeIds[0],
                frontierSize: 1,
                frontierNodeId: nodeIds[0],
            });

            let cost = 0;
            for (let index = 0; index < edgeIds.length; index++) {
                const edge = this.graph.edges[edgeIds[index]];
                const from = nodeIds[index];
                const to = nodeIds[index + 1];
                const fromCost = cost;
                cost += edge.effectiveCost;
                events.push({
                    type: 'edge-relaxed',
                    sequence: sequence++,
                    edgeId: edgeIds[index],
                    from,
                    to,
                    g: cost,
                    h: 0,
                    f: cost,
                    previousG: null,
                    frontierSize: 1,
                    frontierNodeId: to,
                });
                events.push({
                    type: 'node-settled',
                    sequence: sequence++,
                    nodeId: from,
                    g: fromCost,
                    h: 0,
                    f: fromCost,
                    frontierSize: 1,
                    frontierNodeId: to,
                });
            }

            events.push({
                type: 'node-settled',
                sequence: sequence++,
                nodeId: nodeIds[nodeIds.length - 1],
                g: cost,
                h: 0,
                f: cost,
                frontierSize: 0,
                frontierNodeId: null,
            });
            events.push({
                type: 'route-found',
                sequence: sequence++,
                edgeIds: [...edgeIds],
                nodeIds: [...nodeIds],
                cost: result.cost,
                frontierSize: 0,
                frontierNodeId: null,
            });
            return events;
        }

        apply(state, event, index) {
            state.eventType = event.type;
            state.frontierSize = event.frontierSize ?? state.frontierSize;
            state.frontierNodeId =
                event.frontierNodeId === undefined
                    ? state.frontierNodeId
                    : event.frontierNodeId;
            if (event.type === 'origin') {
                state.nodes[event.nodeId].queueState = 'frontier';
                return;
            }
            if (event.type === 'edge-relaxed') {
                const edge = state.edges[event.edgeId];
                const target = state.nodes[event.to];
                if (edge.discoveredAt === null) edge.discoveredAt = index;
                edge.g = event.g;
                edge.h = event.h;
                edge.f = event.f;
                edge.phase = index;
                edge.amplitude = 0.5;
                if (target.predecessorEdgeId !== null) {
                    state.edges[target.predecessorEdgeId].predecessor = false;
                }
                target.predecessorEdgeId = event.edgeId;
                target.queueState = 'frontier';
                target.g = event.g;
                target.h = event.h;
                target.f = event.f;
                edge.predecessor = true;
                return;
            }
            if (event.type === 'node-settled') {
                const node = state.nodes[event.nodeId];
                node.queueState = 'settled';
                node.settledOrder = state.settledCount++;
                node.g = event.g;
                node.h = event.h;
                node.f = event.f;
                if (node.predecessorEdgeId !== null) {
                    state.edges[node.predecessorEdgeId].settledAt = index;
                }
                return;
            }
            if (event.type === 'route-found') {
                state.routeFound = true;
                state.routeCost = event.cost;
                for (const edgeId of event.edgeIds) {
                    state.edges[edgeId].route = true;
                }
            }
        }

        buildCheckpoints() {
            const state = blankState(this.graph);
            for (let index = 0; index < this.events.length; index++) {
                const event = this.events[index];
                this.apply(state, event, index);
                if (event.g != null) this.maxG = Math.max(this.maxG, event.g);
                const applied = index + 1;
                if (
                    applied % CHECKPOINT_INTERVAL === 0 ||
                    applied === this.events.length
                ) {
                    this.checkpoints.set(applied, cloneState(state));
                }
            }
        }

        snapshot(eventIndex) {
            const target = Math.max(
                0,
                Math.min(this.events.length, Math.floor(eventIndex))
            );
            let checkpointIndex = 0;
            for (const index of this.checkpoints.keys()) {
                if (index <= target && index >= checkpointIndex) {
                    checkpointIndex = index;
                }
            }
            const state = cloneState(
                this.checkpoints.get(checkpointIndex)
            );
            for (let index = checkpointIndex; index < target; index++) {
                this.apply(state, this.events[index], index);
            }
            state.eventIndex = target;
            state.event = target > 0 ? this.events[target - 1] : null;
            if (state.frontierNodeId == null) {
                for (const node of Object.values(state.nodes)) {
                    if (node.queueState === 'frontier') {
                        state.frontierNodeId = node.nodeId;
                        break;
                    }
                }
            }
            return state;
        }

        acquisitionIndex() {
            const index = this.events.findIndex(
                event => event.type === 'route-found'
            );
            return index < 0 ? this.events.length : index + 1;
        }

        normalize(value, channel) {
            if (value == null) return 0;
            const maximum =
                channel === 'g'
                    ? this.maxG
                    : channel === 'h'
                      ? this.maxH
                      : this.maxF;
            return Math.max(0, Math.min(1, value / maximum));
        }
    }

    return {
        AnalyticalTimeline,
        blankState,
        cloneState,
        heuristic,
        buildBriefingNotes,
        pathDistance,
        edgeAnchor,
    };
});
