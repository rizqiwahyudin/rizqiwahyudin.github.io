(function (root, factory) {
    const api = factory(root.SymbiotePathfinding);
    if (typeof module === 'object' && module.exports) {
        api.configure(require('./pathfinding-core.js'));
        module.exports = api;
    }
    root.SymbioteOrganism = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (initialCore) {
    'use strict';

    let Core = initialCore;

    class OrganismSimulation {
        constructor(graph) {
            this.graph = graph;
            this.reset();
        }

        setGraph(graph) {
            this.graph = graph;
            this.reset();
        }

        reset() {
            this.result = null;
            this.tendrils = new Map();
            this.settledNodes = new Map();
            this.routeEdgeIds = new Set();
            this.routeNodeIds = new Set();
            this.routeStart = 0;
            this.routeReveal = 0;
            this.eventCursor = 0;
            this.eventCredit = 0;
            this.settledCount = 0;
            this.phase = 'idle';
            this.routeCost = null;
        }

        start(originId, destinationId, algorithm) {
            if (!Core) throw new Error('SymbiotePathfinding is not configured');
            this.reset();
            this.result = Core.search(
                this.graph,
                originId,
                destinationId,
                algorithm
            );
            this.algorithm = algorithm;
            this.phase = 'searching';
            return this.result;
        }

        processEvent(event, time) {
            if (event.type === 'node-settled') {
                this.settledCount++;
                if (!this.settledNodes.has(event.nodeId)) {
                    this.settledNodes.set(event.nodeId, {
                        spawnTime: time,
                        phase: this.settledCount * 0.917,
                    });
                }
                return;
            }
            if (event.type === 'edge-relaxed') {
                const existing = this.tendrils.get(event.edgeId);
                if (!existing || existing.cost > event.cost) {
                    const edge = this.graph.edges[event.edgeId];
                    this.tendrils.set(event.edgeId, {
                        edgeId: event.edgeId,
                        from: event.from,
                        cost: event.cost,
                        spawnTime: time,
                        duration: 260 + Math.min(520, edge.distance * 3.1),
                        phase: event.edgeId * 0.713,
                    });
                }
                return;
            }
            if (event.type === 'route-found') {
                this.routeEdgeIds = new Set(event.edgeIds);
                this.routeNodeIds = new Set(event.nodeIds);
                this.routeStart = time;
                this.routeCost = event.cost;
                this.phase = 'resolved';
                return;
            }
            if (event.type === 'route-missing') {
                this.phase = 'failed';
            }
        }

        update(deltaSeconds, simulationTime, propagationRate) {
            if (!this.result) return;
            if (this.phase === 'searching') {
                this.eventCredit += deltaSeconds * propagationRate;
                let allowance = Math.min(120, Math.floor(this.eventCredit));
                this.eventCredit -= allowance;
                while (allowance-- > 0 && this.eventCursor < this.result.events.length) {
                    this.processEvent(
                        this.result.events[this.eventCursor++],
                        simulationTime
                    );
                }
            }
            if (this.routeStart) {
                const elapsed = (simulationTime - this.routeStart) / 1450;
                const clamped = Math.max(0, Math.min(1, elapsed));
                this.routeReveal = 1 - Math.pow(1 - clamped, 3);
            }
        }

        frame(originId, destinationId, simulationTime) {
            return {
                result: this.result,
                tendrils: this.tendrils,
                settledNodes: this.settledNodes,
                routeEdgeIds: this.routeEdgeIds,
                routeNodeIds: this.routeNodeIds,
                routeStart: this.routeStart,
                routeReveal: this.routeReveal,
                collapse: this.routeStart
                    ? Math.max(
                        0,
                        Math.min(1, (simulationTime - this.routeStart - 620) / 1800)
                    )
                    : 0,
                phase: this.phase,
                routeCost: this.routeCost,
                settledCount: this.settledCount,
                eventCursor: this.eventCursor,
                originId,
                destinationId,
            };
        }
    }

    return {
        OrganismSimulation,
        configure(core) {
            Core = core;
        },
    };
});
