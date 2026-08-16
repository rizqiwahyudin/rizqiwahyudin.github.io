(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.SymbioteCloudAuthor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function hash(value) {
        const x = Math.sin(value * 127.1 + 311.7) * 43758.5453123;
        return x - Math.floor(x);
    }

    function qualityProfile(quality) {
        if (quality <= 0) {
            return { longitudinal: 10, radial: 5, layers: 1 };
        }
        if (quality === 1) {
            return { longitudinal: 13, radial: 8, layers: 2 };
        }
        return { longitudinal: 17, radial: 12, layers: 3 };
    }

    function countTubePoints(profile) {
        return profile.longitudinal * profile.radial * profile.layers;
    }

    function authorTube(options, emit) {
        const profile = options.profile;
        let emitted = 0;
        for (let longitudinal = 0; longitudinal < profile.longitudinal; longitudinal++) {
            const along = longitudinal / Math.max(1, profile.longitudinal - 1);
            for (let layer = 0; layer < profile.layers; layer++) {
                const surface = layer === 0;
                for (let radial = 0; radial < profile.radial; radial++) {
                    const particleSeed =
                        options.seed +
                        longitudinal * 19.17 +
                        layer * 53.31 +
                        radial * 7.73;
                    const angleJitter =
                        (hash(particleSeed + 2.4) - 0.5) *
                        (Math.PI * 2 / profile.radial) *
                        0.7;
                    const radialAngle =
                        radial / profile.radial * Math.PI * 2 + angleJitter;
                    const radialDepth = surface
                        ? 0.88 + hash(particleSeed + 4.1) * 0.12
                        : 0.18 + Math.sqrt(hash(particleSeed + 5.9)) * 0.65;
                    emit({
                        limbIndex: options.limbIndex,
                        along,
                        radialAngle,
                        radialDepth,
                        polar: 0,
                        pointKind: options.pointKind ?? 0,
                        route: options.route ? 1 : 0,
                        seed: hash(particleSeed + 8.8),
                    });
                    emitted++;
                }
            }
        }
        return emitted;
    }

    function authorNodule(options, emit) {
        const count = options.count;
        for (let index = 0; index < count; index++) {
            const particleSeed = options.seed + index * 23.71;
            const azimuth = hash(particleSeed + 1) * Math.PI * 2;
            const z = hash(particleSeed + 2) * 2 - 1;
            const polar = Math.acos(Math.max(-1, Math.min(1, z)));
            const depth = 0.25 + Math.cbrt(hash(particleSeed + 3)) * 0.75;
            emit({
                limbIndex: options.limbIndex,
                along: 0,
                radialAngle: azimuth,
                radialDepth: depth,
                polar,
                pointKind: 2,
                route: options.route ? 1 : 0,
                seed: hash(particleSeed + 4),
            });
        }
        return count;
    }

    function atlasIndex(slot, sample, samplesPerLimb) {
        return (slot * samplesPerLimb + sample) * 4;
    }

    return {
        hash,
        qualityProfile,
        countTubePoints,
        authorTube,
        authorNodule,
        atlasIndex,
    };
});
