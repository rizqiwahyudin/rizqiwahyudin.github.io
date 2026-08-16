(function (root, factory) {
    root.TacticalSymbols = factory(root.THREE);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (THREE) {
    'use strict';

    function ring(radius, segments = 32) {
        const positions = [];
        for (let index = 0; index < segments; index++) {
            const a0 = index / segments * Math.PI * 2;
            const a1 = (index + 1) / segments * Math.PI * 2;
            positions.push(
                Math.cos(a0) * radius,
                0,
                Math.sin(a0) * radius,
                Math.cos(a1) * radius,
                0,
                Math.sin(a1) * radius
            );
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );
        return geometry;
    }

    function reticle(radius) {
        const positions = [
            -radius * 1.5, 0, 0, -radius * 0.55, 0, 0,
            radius * 0.55, 0, 0, radius * 1.5, 0, 0,
            0, 0, -radius * 1.5, 0, 0, -radius * 0.55,
            0, 0, radius * 0.55, 0, 0, radius * 1.5,
        ];
        const geometry = ring(radius, 32);
        const ringPositions = Array.from(
            geometry.getAttribute('position').array
        );
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(
                ringPositions.concat(positions),
                3
            )
        );
        return geometry;
    }

    function cut(radius) {
        const positions = [
            -radius, 0, -radius,
            radius, 0, radius,
            -radius, 0, radius,
            radius, 0, -radius,
        ];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );
        return geometry;
    }

    return { ring, reticle, cut };
});
