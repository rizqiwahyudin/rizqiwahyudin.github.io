'use strict';

const assert = require('node:assert/strict');
const Author = require('./pathfinding-cloud-author.js');

const low = Author.qualityProfile(0);
const medium = Author.qualityProfile(1);
const full = Author.qualityProfile(2);
assert.ok(Author.countTubePoints(low) < Author.countTubePoints(medium));
assert.ok(Author.countTubePoints(medium) < Author.countTubePoints(full));

const first = [];
const second = [];
const options = {
    profile: medium,
    limbIndex: 7,
    seed: 19.2,
    pointKind: 1,
    route: false,
};
Author.authorTube(options, point => first.push(point));
Author.authorTube(options, point => second.push(point));
assert.deepEqual(first, second);
assert.equal(first.length, Author.countTubePoints(medium));

for (const point of first) {
    assert.equal(point.limbIndex, 7);
    assert.ok(point.along >= 0 && point.along <= 1);
    assert.ok(point.radialDepth >= 0 && point.radialDepth <= 1);
    assert.ok(point.radialAngle >= 0 && point.radialAngle <= Math.PI * 2);
    assert.ok(Object.values(point).every(Number.isFinite));
}

const nodules = [];
Author.authorNodule(
    { limbIndex: 4, seed: 2, count: 64, route: true },
    point => nodules.push(point)
);
assert.equal(nodules.length, 64);
assert.ok(nodules.every(point => point.route === 1 && point.pointKind === 2));
assert.ok(nodules.every(point => point.polar >= 0 && point.polar <= Math.PI));

const indices = new Set();
for (let slot = 0; slot < 10; slot++) {
    for (let sample = 0; sample < 17; sample++) {
        indices.add(Author.atlasIndex(slot, sample, 17));
    }
}
assert.equal(indices.size, 170);

console.log('pathfinding-cloud-author: all tests passed');
