(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.SymbiotePathfinding = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    class MinHeap {
        constructor() {
            this.items = [];
        }

        get size() {
            return this.items.length;
        }

        push(value, priority) {
            const item = { value, priority };
            this.items.push(item);
            let index = this.items.length - 1;
            while (index > 0) {
                const parent = (index - 1) >> 1;
                if (this.items[parent].priority <= priority) break;
                this.items[index] = this.items[parent];
                index = parent;
            }
            this.items[index] = item;
        }

        pop() {
            if (this.items.length === 0) return null;
            const result = this.items[0];
            const tail = this.items.pop();
            if (this.items.length === 0) return result;

            let index = 0;
            while (true) {
                const left = index * 2 + 1;
                const right = left + 1;
                if (left >= this.items.length) break;
                let child = left;
                if (right < this.items.length &&
                    this.items[right].priority < this.items[left].priority) {
                    child = right;
                }
                if (this.items[child].priority >= tail.priority) break;
                this.items[index] = this.items[child];
                index = child;
            }
            this.items[index] = tail;
            return result;
        }
    }

    function heuristic(graph, nodeId, destinationId) {
        const node = graph.nodes[nodeId];
        const destination = graph.nodes[destinationId];
        const scale = graph.heuristicScale ?? 1;
        return Math.hypot(node.x - destination.x, node.y - destination.y) * scale;
    }

    function reconstructPath(previous, previousEdge, originId, destinationId) {
        if (originId === destinationId) {
            return { nodeIds: [originId], edgeIds: [] };
        }
        if (!previous.has(destinationId)) {
            return { nodeIds: [], edgeIds: [] };
        }

        const nodeIds = [destinationId];
        const edgeIds = [];
        let cursor = destinationId;
        while (cursor !== originId) {
            edgeIds.push(previousEdge.get(cursor));
            cursor = previous.get(cursor);
            if (cursor === undefined) return { nodeIds: [], edgeIds: [] };
            nodeIds.push(cursor);
        }
        nodeIds.reverse();
        edgeIds.reverse();
        return { nodeIds, edgeIds };
    }

    /**
     * Runs Dijkstra or A* and records successful relaxations for visualization.
     * Graph shape:
     *   nodes: { [id]: { id, x, y } }
     *   adjacency: { [id]: [{ to, edgeId, cost }] }
     *   heuristicScale?: minimum edge cost per coordinate unit
     */
    function search(graph, originId, destinationId, algorithm) {
        if (!graph.nodes[originId] || !graph.nodes[destinationId]) {
            throw new Error('origin and destination must exist in the graph');
        }
        const mode = algorithm === 'dijkstra' ? 'dijkstra' : 'astar';
        const frontier = new MinHeap();
        const distance = new Map([[originId, 0]]);
        const previous = new Map();
        const previousEdge = new Map();
        const settled = new Set();
        const events = [];

        frontier.push(originId, 0);
        events.push({ type: 'origin', nodeId: originId, cost: 0 });

        while (frontier.size > 0) {
            const currentEntry = frontier.pop();
            const currentId = currentEntry.value;
            if (settled.has(currentId)) continue;
            settled.add(currentId);

            const currentCost = distance.get(currentId);
            events.push({
                type: 'node-settled',
                nodeId: currentId,
                cost: currentCost,
            });

            if (currentId === destinationId) break;

            const neighbours = graph.adjacency[currentId] || [];
            for (const neighbour of neighbours) {
                if (settled.has(neighbour.to)) continue;
                const candidateCost = currentCost + neighbour.cost;
                const knownCost = distance.get(neighbour.to);
                if (knownCost !== undefined && candidateCost >= knownCost) continue;

                distance.set(neighbour.to, candidateCost);
                previous.set(neighbour.to, currentId);
                previousEdge.set(neighbour.to, neighbour.edgeId);
                const remaining = mode === 'astar'
                    ? heuristic(graph, neighbour.to, destinationId)
                    : 0;
                frontier.push(neighbour.to, candidateCost + remaining);
                events.push({
                    type: 'edge-relaxed',
                    edgeId: neighbour.edgeId,
                    from: currentId,
                    to: neighbour.to,
                    cost: candidateCost,
                    priority: candidateCost + remaining,
                });
            }
        }

        const path = reconstructPath(
            previous,
            previousEdge,
            originId,
            destinationId
        );
        const found = path.nodeIds.length > 0;
        events.push({
            type: found ? 'route-found' : 'route-missing',
            nodeIds: path.nodeIds,
            edgeIds: path.edgeIds,
            cost: found ? distance.get(destinationId) : Infinity,
        });

        return {
            algorithm: mode,
            found,
            cost: found ? distance.get(destinationId) : Infinity,
            visitedNodes: settled.size,
            events,
            ...path,
        };
    }

    return { MinHeap, search, reconstructPath };
});
