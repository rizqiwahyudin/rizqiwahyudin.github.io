(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.PathfindingAnalytics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const CHECKPOINT_INTERVAL = 48;

    function heuristic(graph, nodeId, destinationId) {
        const node = graph.nodes[nodeId];
        const destination = graph.nodes[destinationId];
        return (
            Math.hypot(node.x - destination.x, node.y - destination.y) *
            graph.heuristicScale
        );
    }

    function carrierLocked(routeIndex, routeLength, carrierLock) {
        if (carrierLock <= 0 || routeIndex < 0) return false;
        if (carrierLock >= 1) return true;
        const start = Math.ceil(
            (1 - carrierLock) * Math.max(1, routeLength)
        );
        return routeIndex >= start;
    }

    function isolineCrossing(ax, ay, valueA, bx, by, valueB, threshold) {
        if (
            valueA == null ||
            valueB == null ||
            valueA === valueB ||
            (valueA - threshold) * (valueB - threshold) > 0
        ) {
            return null;
        }
        const t = (threshold - valueA) / (valueB - valueA);
        if (t < 0 || t > 1) return null;
        return {
            x: ax + (bx - ax) * t,
            y: ay + (by - ay) * t,
            t,
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
            settledCount: state.settledCount,
            conflictCount: state.conflictCount,
            routeCost: state.routeCost,
            routeFound: state.routeFound,
            carrierLock: state.carrierLock,
            eventType: state.eventType,
        };
    }

    class AnalyticalTimeline {
        constructor(graph, result, destinationId) {
            this.graph = graph;
            this.result = result;
            this.destinationId = destinationId;
            this.events = this.instrument(result.events);
            this.checkpoints = new Map([[0, blankState(graph)]]);
            this.maxG = 1;
            this.maxH = 1;
            this.maxF = 1;
            this.buildCheckpoints();
        }

        instrument(sourceEvents) {
            const events = [];
            const predecessorByNode = new Map();
            const frontier = new Set();
            let sequence = 0;

            for (const source of sourceEvents) {
                if (source.type === 'origin') {
                    frontier.add(source.nodeId);
                    events.push({
                        type: 'origin',
                        sequence: sequence++,
                        nodeId: source.nodeId,
                        frontierSize: frontier.size,
                    });
                    continue;
                }
                if (source.type === 'edge-relaxed') {
                    const previous = predecessorByNode.get(source.to);
                    if (previous && previous.edgeId !== source.edgeId) {
                        events.push({
                            type: 'predecessor-superseded',
                            sequence: sequence++,
                            nodeId: source.to,
                            oldEdgeId: previous.edgeId,
                            newEdgeId: source.edgeId,
                            improvement: Math.max(
                                0,
                                previous.g - source.cost
                            ),
                            frontierSize: frontier.size,
                        });
                    }
                    predecessorByNode.set(source.to, {
                        edgeId: source.edgeId,
                        g: source.cost,
                    });
                    frontier.add(source.to);
                    const f = source.priority ?? source.cost;
                    events.push({
                        type: 'edge-relaxed',
                        sequence: sequence++,
                        edgeId: source.edgeId,
                        from: source.from,
                        to: source.to,
                        g: source.cost,
                        h: Math.max(0, f - source.cost),
                        f,
                        previousG: previous?.g ?? null,
                        frontierSize: frontier.size,
                    });
                    continue;
                }
                if (source.type === 'node-settled') {
                    frontier.delete(source.nodeId);
                    const g = source.cost;
                    const h =
                        this.result.algorithm === 'dijkstra'
                            ? 0
                            : heuristic(
                                this.graph,
                                source.nodeId,
                                this.destinationId
                            );
                    events.push({
                        type: 'node-settled',
                        sequence: sequence++,
                        nodeId: source.nodeId,
                        g,
                        h,
                        f: g + h,
                        frontierSize: frontier.size,
                    });
                    continue;
                }
                if (source.type === 'route-found') {
                    events.push({
                        type: 'route-found',
                        sequence: sequence++,
                        edgeIds: [...source.edgeIds],
                        nodeIds: [...source.nodeIds],
                        cost: source.cost,
                        frontierSize: frontier.size,
                    });
                    for (let step = 1; step <= 8; step++) {
                        events.push({
                            type: 'carrier-lock',
                            sequence: sequence++,
                            step,
                            progress: step / 8,
                            frontierSize: frontier.size,
                        });
                    }
                }
                if (source.type === 'route-missing') {
                    events.push({
                        type: 'route-missing',
                        sequence: sequence++,
                        frontierSize: frontier.size,
                    });
                }
            }
            return events;
        }

        apply(state, event, index) {
            state.eventType = event.type;
            state.frontierSize = event.frontierSize ?? state.frontierSize;
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
                edge.amplitude =
                    event.previousG === null
                        ? 0.5
                        : Math.min(
                            1,
                            Math.max(0.2, event.previousG - event.g)
                        );
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
            if (event.type === 'predecessor-superseded') {
                state.conflictCount++;
                state.nodes[event.nodeId].conflictCount++;
                state.edges[event.oldEdgeId].supersededAt.push(index);
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
                return;
            }
            if (event.type === 'carrier-lock') {
                state.carrierLock = event.progress;
            }
        }

        buildCheckpoints() {
            const state = blankState(this.graph);
            for (let index = 0; index < this.events.length; index++) {
                const event = this.events[index];
                this.apply(state, event, index);
                if (event.g != null) this.maxG = Math.max(this.maxG, event.g);
                if (event.h != null) this.maxH = Math.max(this.maxH, event.h);
                if (event.f != null) this.maxF = Math.max(this.maxF, event.f);
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
        carrierLocked,
        isolineCrossing,
    };
});
