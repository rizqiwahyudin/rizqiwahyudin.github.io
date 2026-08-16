'use strict';

const assert = require('node:assert/strict');
const geometry = require('./pathfinding-geometry.js');

const nodes = {
    a: { id: 'a', x: 0, y: 0 },
    b: { id: 'b', x: 100, y: 0 },
};
const edge = { id: 7, a: 'a', b: 'b', distance: 100, bend: 12, kind: 'street' };

{
    const forward = geometry.quadraticSpine(edge, nodes, 'a', 8);
    const reverse = geometry.quadraticSpine(edge, nodes, 'b', 8);
    assert.equal(forward.length, 18);
    assert.equal(forward[0], 0);
    assert.equal(forward[1], 0);
    assert.equal(forward.at(-2), 100);
    assert.equal(reverse[0], 100);
    assert.equal(reverse.at(-2), 0);
}

{
    const first = geometry.createBranchSeeds(edge, 0.8);
    const second = geometry.createBranchSeeds(edge, 0.8);
    assert.deepEqual(first, second);
    assert.ok(first.length >= 1);
    for (const branch of first) {
        assert.ok(branch.at > 0 && branch.at < 1);
        assert.ok(branch.length > 0);
        assert.ok(branch.side === -1 || branch.side === 1);
    }
}

{
    const root = geometry.widthProfile(0, 1, 0, false);
    const middle = geometry.widthProfile(0.5, 1, 0, false);
    const tip = geometry.widthProfile(1, 1, 0, false);
    assert.ok(middle > root);
    assert.ok(middle > tip);
    assert.ok(geometry.widthProfile(0.5, 1, 0, true) > middle);
}

{
    const spine = geometry.quadraticSpine(edge, nodes, 'a', 8);
    const chain = geometry.createChain(spine);
    geometry.updateElasticTargets(chain, spine, 500, 3.7, 0.9, 0.7);
    const before = Array.from(chain.position);
    geometry.stepSpringChain(chain, 1 / 60, {
        anchor: 30,
        neighbour: 15,
        damping: 0.82,
    });
    assert.notDeepEqual(Array.from(chain.position), before);
    assert.ok(Array.from(chain.position).every(Number.isFinite));
    assert.equal(chain.position[0], chain.target[0]);
    assert.equal(chain.position.at(-2), chain.target.at(-2));
}

{
    const parent = { x: 20, y: 30, tx: 1, ty: 0, nx: 0, ny: 1 };
    const seed = geometry.createBranchSeeds(edge, 1)[0];
    const target = new Float32Array((seed.segments + 1) * 2);
    const result = geometry.branchTargets(parent, seed, 1, 200, 0, target);
    assert.equal(result, target);
    assert.equal(result[0], parent.x);
    assert.equal(result[1], parent.y);
    assert.ok(Array.from(result).every(Number.isFinite));
}

{
    const chain = new Float32Array([0, 0, 10, 0, 20, 10]);
    const sample = geometry.sampleChain(chain, 0.75);
    assert.equal(sample.x, 15);
    assert.equal(sample.y, 5);
    assert.ok(Math.abs(Math.hypot(sample.tx, sample.ty) - 1) < 1e-6);
}

console.log('pathfinding-geometry: all tests passed');
