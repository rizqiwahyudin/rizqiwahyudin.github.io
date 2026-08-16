(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.SymbioteGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const TAU = Math.PI * 2;

    function clamp01(value) {
        return Math.max(0, Math.min(1, value));
    }

    function easeOutCubic(value) {
        const t = clamp01(value);
        return 1 - Math.pow(1 - t, 3);
    }

    function hash(value) {
        const x = Math.sin(value * 127.1 + 311.7) * 43758.5453123;
        return x - Math.floor(x);
    }

    function smoothNoise(value, seed) {
        const cell = Math.floor(value);
        const fraction = value - cell;
        const eased = fraction * fraction * (3 - 2 * fraction);
        const a = hash(cell + seed * 19.19);
        const b = hash(cell + 1 + seed * 19.19);
        return (a + (b - a) * eased) * 2 - 1;
    }

    function quadraticSpine(edge, nodes, fromId, segments = 16) {
        const reverse = fromId === edge.b;
        const start = nodes[reverse ? edge.b : edge.a];
        const end = nodes[reverse ? edge.a : edge.b];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.max(0.001, Math.hypot(dx, dy));
        const controlX = (start.x + end.x) * 0.5 - dy / length * edge.bend;
        const controlY = (start.y + end.y) * 0.5 + dx / length * edge.bend;
        const output = new Float32Array((segments + 1) * 2);

        for (let index = 0; index <= segments; index++) {
            const t = index / segments;
            const oneMinus = 1 - t;
            output[index * 2] =
                oneMinus * oneMinus * start.x +
                2 * oneMinus * t * controlX +
                t * t * end.x;
            output[index * 2 + 1] =
                oneMinus * oneMinus * start.y +
                2 * oneMinus * t * controlY +
                t * t * end.y;
        }
        return output;
    }

    function createChain(spine) {
        return {
            position: new Float32Array(spine),
            velocity: new Float32Array(spine.length),
            target: new Float32Array(spine),
        };
    }

    function updateElasticTargets(chain, spine, time, seed, creep, progress) {
        chain.target.set(spine);
        const count = spine.length / 2;
        for (let index = 1; index < count - 1; index++) {
            const u = index / (count - 1);
            const previous = (index - 1) * 2;
            const next = (index + 1) * 2;
            const dx = spine[next] - spine[previous];
            const dy = spine[next + 1] - spine[previous + 1];
            const length = Math.max(0.001, Math.hypot(dx, dy));
            const envelope = Math.sin(Math.PI * u);
            const stableShape =
                smoothNoise(u * 5.2, seed) * 2.4 +
                smoothNoise(u * 11.7, seed + 4.7) * 0.9;
            const squirm =
                Math.sin(time * 0.0031 + u * 10.5 + seed) * 1.5 +
                Math.sin(time * 0.0017 - u * 5.1 + seed * 1.9) * 0.8;
            const tipFreedom = progress < 0.995 ? 0.7 + u * u * 1.7 : 0.75;
            const offset = (stableShape + squirm) * creep * envelope * tipFreedom;
            chain.target[index * 2] += -dy / length * offset;
            chain.target[index * 2 + 1] += dx / length * offset;
        }
    }

    function stepSpringChain(chain, deltaSeconds, options) {
        const count = chain.position.length / 2;
        const dt = Math.min(1 / 30, Math.max(0, deltaSeconds));
        const anchor = options.anchor ?? 32;
        const neighbour = options.neighbour ?? 18;
        const damping = options.damping ?? 0.82;

        for (let index = 1; index < count - 1; index++) {
            const offset = index * 2;
            const previous = offset - 2;
            const next = offset + 2;
            const px = chain.position[offset];
            const py = chain.position[offset + 1];
            const ax =
                (chain.target[offset] - px) * anchor +
                (chain.position[previous] + chain.position[next] - px * 2) * neighbour;
            const ay =
                (chain.target[offset + 1] - py) * anchor +
                (chain.position[previous + 1] + chain.position[next + 1] - py * 2) * neighbour;
            chain.velocity[offset] = (chain.velocity[offset] + ax * dt) * damping;
            chain.velocity[offset + 1] = (chain.velocity[offset + 1] + ay * dt) * damping;
        }

        for (let index = 1; index < count - 1; index++) {
            const offset = index * 2;
            chain.position[offset] += chain.velocity[offset] * dt;
            chain.position[offset + 1] += chain.velocity[offset + 1] * dt;
        }

        // Roots and tips remain attached to the routing graph.
        chain.position[0] = chain.target[0];
        chain.position[1] = chain.target[1];
        const final = chain.position.length - 2;
        chain.position[final] = chain.target[final];
        chain.position[final + 1] = chain.target[final + 1];
    }

    function widthProfile(u, seed, pulse, route) {
        const root = Math.pow(Math.sin(Math.PI * clamp01(u)), 0.48);
        const rootBulge = Math.exp(-Math.pow((u - 0.08) / 0.11, 2)) * 0.42;
        const fattyNoise =
            0.78 +
            smoothNoise(u * 4.3, seed + 2.1) * 0.27 +
            smoothNoise(u * 10.7, seed + 8.4) * 0.11;
        const constriction = 0.83 + 0.17 * Math.sin(u * 17 + seed * 2.3 + pulse);
        const routeBoost = route ? 1.2 : 1;
        return Math.max(0.025, (root * fattyNoise * constriction + rootBulge) * routeBoost);
    }

    function createBranchSeeds(edge, density) {
        const count = Math.max(
            1,
            Math.min(4, Math.round(edge.distance / 65 * (0.55 + density)))
        );
        const branches = [];
        for (let index = 0; index < count; index++) {
            const seed = edge.id * 17.17 + index * 41.31;
            const position = 0.15 + hash(seed + 1) * 0.7;
            const length = 12 + hash(seed + 2) * 36;
            branches.push({
                seed,
                at: position,
                side: hash(seed + 3) > 0.5 ? 1 : -1,
                length,
                stiffness: 0.55 + hash(seed + 4) * 0.75,
                curl: (hash(seed + 5) - 0.5) * 26,
                forkAt: hash(seed + 6) > 0.62 ? 0.48 + hash(seed + 7) * 0.3 : null,
                forkSide: hash(seed + 8) > 0.5 ? 1 : -1,
                forkLength: length * (0.24 + hash(seed + 9) * 0.35),
                adhesion: hash(seed + 10) > 0.54,
                segments: 5 + Math.floor(hash(seed + 11) * 4),
            });
        }
        return branches.sort((a, b) => a.at - b.at);
    }

    function branchTargets(parent, seed, life, time, decay, output) {
        const count = seed.segments + 1;
        const target = output && output.length === count * 2
            ? output
            : new Float32Array(count * 2);
        const tension = seed.adhesion ? 1.25 : 1;
        const recoil = 1 + decay * 1.8;
        const breathing = 0.86 + Math.sin(time * 0.005 + seed.seed) * 0.14;
        const totalLength = seed.length * life * breathing * tension;

        for (let index = 0; index < count; index++) {
            const u = index / (count - 1);
            const curl = Math.sin(Math.PI * u) * seed.curl * recoil;
            const squirm =
                smoothNoise(u * 5 + time * 0.00045, seed.seed) *
                4.5 *
                life *
                (0.25 + u);
            const reach = totalLength * u;
            target[index * 2] =
                parent.x +
                parent.nx * seed.side * reach +
                parent.tx * (curl + squirm);
            target[index * 2 + 1] =
                parent.y +
                parent.ny * seed.side * reach +
                parent.ty * (curl + squirm);
        }
        return target;
    }

    function sampleChain(chain, u) {
        const count = chain.length / 2;
        const scaled = clamp01(u) * (count - 1);
        const index = Math.min(count - 2, Math.floor(scaled));
        const fraction = scaled - index;
        const offset = index * 2;
        const next = offset + 2;
        const x = chain[offset] + (chain[next] - chain[offset]) * fraction;
        const y = chain[offset + 1] + (chain[next + 1] - chain[offset + 1]) * fraction;
        const dx = chain[next] - chain[offset];
        const dy = chain[next + 1] - chain[offset + 1];
        const length = Math.max(0.001, Math.hypot(dx, dy));
        return {
            x,
            y,
            tx: dx / length,
            ty: dy / length,
            nx: -dy / length,
            ny: dx / length,
        };
    }

    return {
        TAU,
        clamp01,
        easeOutCubic,
        hash,
        smoothNoise,
        quadraticSpine,
        createChain,
        updateElasticTargets,
        stepSpringChain,
        widthProfile,
        createBranchSeeds,
        branchTargets,
        sampleChain,
    };
});
