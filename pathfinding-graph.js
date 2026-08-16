(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.SymbioteGraph = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const WORLD = { width: 1600, height: 900, marginX: 90, marginY: 80 };
    const ROAD_STYLE = {
        artery: { width: 1.25, speed: 2.2 },
        street: { width: 0.72, speed: 1.35 },
        alley: { width: 0.48, speed: 0.92 },
        track: { width: 0.42, speed: 0.62 },
    };

    function mulberry32(seed) {
        return function random() {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function normalizeProfile(profile) {
        return {
            blockedEdges: profile?.blockedEdges || new Set(),
            resistance: profile?.resistance || new Map(),
            preferredEdges: profile?.preferredEdges || new Set(),
        };
    }

    function createGraph(seed = 32841, profileInput) {
        const profile = normalizeProfile(profileInput);
        const random = mulberry32(seed);
        const cols = 29;
        const rows = 17;
        const xGap = (WORLD.width - WORLD.marginX * 2) / (cols - 1);
        const yGap = (WORLD.height - WORLD.marginY * 2) / (rows - 1);
        const nodes = {};
        const adjacency = {};
        const edges = [];

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const id = `${col}:${row}`;
                const arterialCol = col % 7 === 0;
                const arterialRow = row % 5 === 0;
                nodes[id] = {
                    id,
                    x:
                        WORLD.marginX +
                        col * xGap +
                        (arterialCol ? 0.24 : 0.68) *
                            (random() - 0.5) *
                            xGap,
                    y:
                        WORLD.marginY +
                        row * yGap +
                        (arterialRow ? 0.24 : 0.68) *
                            (random() - 0.5) *
                            yGap,
                };
                adjacency[id] = [];
            }
        }

        function classify(col, row, diagonal) {
            if (!diagonal && (col % 7 === 0 || row % 5 === 0)) {
                return 'artery';
            }
            if (diagonal) return random() > 0.42 ? 'alley' : 'track';
            return random() > 0.24 ? 'street' : 'alley';
        }

        function addEdge(aId, bId, kind) {
            const a = nodes[aId];
            const b = nodes[bId];
            const id = edges.length;
            const distance = Math.hypot(b.x - a.x, b.y - a.y);
            const bend = (random() - 0.5) * Math.min(32, distance * 0.24);
            const baseCost = distance / ROAD_STYLE[kind].speed;
            const resistance = Math.max(
                0.1,
                profile.resistance.get(id) || 1
            );
            const preferred = profile.preferredEdges.has(id);
            const blocked = profile.blockedEdges.has(id);
            const effectiveCost =
                baseCost * resistance * (preferred ? 0.62 : 1);
            edges.push({
                id,
                a: aId,
                b: bId,
                kind,
                distance,
                bend,
                baseCost,
                effectiveCost,
                resistance,
                preferred,
                blocked,
            });
            if (!blocked) {
                adjacency[aId].push({
                    to: bId,
                    edgeId: id,
                    cost: effectiveCost,
                });
                adjacency[bId].push({
                    to: aId,
                    edgeId: id,
                    cost: effectiveCost,
                });
            }
        }

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const id = `${col}:${row}`;
                if (col < cols - 1) {
                    addEdge(id, `${col + 1}:${row}`, classify(col, row, false));
                }
                if (row < rows - 1) {
                    addEdge(id, `${col}:${row + 1}`, classify(col, row, false));
                }
            }
        }
        for (let row = 0; row < rows - 1; row++) {
            for (let col = 0; col < cols - 1; col++) {
                if (random() < 0.17) {
                    const rising = random() > 0.5;
                    addEdge(
                        `${col}:${rising ? row + 1 : row}`,
                        `${col + 1}:${rising ? row : row + 1}`,
                        classify(col, row, true)
                    );
                }
            }
        }

        const maximumSpeed = Math.max(
            ...Object.values(ROAD_STYLE).map(style => style.speed)
        );
        return {
            seed,
            nodes,
            adjacency,
            edges,
            cols,
            rows,
            heuristicScale: 1 / maximumSpeed,
            profile,
        };
    }

    return {
        WORLD,
        ROAD_STYLE,
        mulberry32,
        createGraph,
        normalizeProfile,
    };
});
