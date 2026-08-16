(function (root, factory) {
    const api = factory(root.THREE, root.SymbioteGeometry);
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.SymbioteBiomass = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (THREE, Geo) {
    'use strict';

    if (!THREE) throw new Error('Three.js is required by the biomass renderer');
    if (!Geo) throw new Error('SymbioteGeometry is required by the biomass renderer');

    const MAX_VERTICES = 320000;

    class BiomassRenderer {
        constructor(canvas, graph, world, roadStyle) {
            this.canvas = canvas;
            this.graph = graph;
            this.world = world;
            this.roadStyle = roadStyle;
            this.vertexCursor = 0;
            this.quality = 2;
            this.frameAverage = 12;
            this.fastFrames = 0;

            this.renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: true,
                alpha: false,
                powerPreference: 'high-performance',
            });
            this.renderer.setClearColor(0xf2f1ed, 1);
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.scene = new THREE.Scene();
            this.camera = new THREE.OrthographicCamera(0, world.width, 0, world.height, 0.1, 100);
            this.camera.position.z = 10;

            this.positions = new Float32Array(MAX_VERTICES * 3);
            this.across = new Float32Array(MAX_VERTICES);
            this.along = new Float32Array(MAX_VERTICES);
            this.opacity = new Float32Array(MAX_VERTICES);
            this.route = new Float32Array(MAX_VERTICES);
            this.seed = new Float32Array(MAX_VERTICES);
            this.routeStrandScratch = Array.from(
                { length: 5 },
                () => new Float32Array(34)
            );

            this.dynamicGeometry = new THREE.BufferGeometry();
            this.dynamicGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage)
            );
            this.dynamicGeometry.setAttribute(
                'aAcross',
                new THREE.BufferAttribute(this.across, 1).setUsage(THREE.DynamicDrawUsage)
            );
            this.dynamicGeometry.setAttribute(
                'aAlong',
                new THREE.BufferAttribute(this.along, 1).setUsage(THREE.DynamicDrawUsage)
            );
            this.dynamicGeometry.setAttribute(
                'aOpacity',
                new THREE.BufferAttribute(this.opacity, 1).setUsage(THREE.DynamicDrawUsage)
            );
            this.dynamicGeometry.setAttribute(
                'aRoute',
                new THREE.BufferAttribute(this.route, 1).setUsage(THREE.DynamicDrawUsage)
            );
            this.dynamicGeometry.setAttribute(
                'aSeed',
                new THREE.BufferAttribute(this.seed, 1).setUsage(THREE.DynamicDrawUsage)
            );
            this.dynamicGeometry.setDrawRange(0, 0);

            this.material = new THREE.ShaderMaterial({
                transparent: true,
                depthWrite: false,
                blending: THREE.NormalBlending,
                side: THREE.DoubleSide,
                uniforms: {
                    uTime: { value: 0 },
                    uWetness: { value: 0.72 },
                },
                vertexShader: `
                    attribute float aAcross;
                    attribute float aAlong;
                    attribute float aOpacity;
                    attribute float aRoute;
                    attribute float aSeed;
                    varying float vAcross;
                    varying float vAlong;
                    varying float vOpacity;
                    varying float vRoute;
                    varying float vSeed;
                    void main() {
                        vAcross = aAcross;
                        vAlong = aAlong;
                        vOpacity = aOpacity;
                        vRoute = aRoute;
                        vSeed = aSeed;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    precision highp float;
                    uniform float uTime;
                    uniform float uWetness;
                    varying float vAcross;
                    varying float vAlong;
                    varying float vOpacity;
                    varying float vRoute;
                    varying float vSeed;
                    void main() {
                        float edge = 1.0 - smoothstep(0.64, 1.0, abs(vAcross));
                        float moving = sin(vAlong * 22.0 - uTime * 2.1 + vSeed) * 0.055;
                        float ridgePosition = -0.32 + moving;
                        float ridge = pow(max(0.0, 1.0 - abs(vAcross - ridgePosition) * 3.2), 7.0);
                        float broken = 0.62 + 0.38 * sin(vAlong * 31.0 + vSeed * 2.7);
                        ridge *= smoothstep(0.2, 0.72, broken);
                        vec3 body = mix(vec3(0.055), vec3(0.012), vRoute);
                        vec3 wet = vec3(0.66, 0.67, 0.65) * ridge * uWetness;
                        vec3 color = body + wet;
                        gl_FragColor = vec4(color, edge * vOpacity);
                    }
                `,
            });
            this.dynamicMesh = new THREE.Mesh(this.dynamicGeometry, this.material);
            this.dynamicMesh.frustumCulled = false;
            this.dynamicMesh.renderOrder = 3;
            this.scene.add(this.dynamicMesh);

            this.roadObject = this.buildRoadNetwork();
            this.scene.add(this.roadObject);
            this.originRing = this.createEndpointRing(0x111111, 7);
            this.destinationRing = this.createEndpointRing(0x111111, 11);
            this.scene.add(this.originRing, this.destinationRing);
        }

        buildRoadNetwork() {
            const positions = [];
            for (const edge of this.graph.edges) {
                const spine = Geo.quadraticSpine(edge, this.graph.nodes, edge.a, 8);
                for (let index = 0; index < spine.length / 2 - 1; index++) {
                    positions.push(
                        spine[index * 2], spine[index * 2 + 1], 0,
                        spine[index * 2 + 2], spine[index * 2 + 3], 0
                    );
                }
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(positions, 3)
            );
            const material = new THREE.LineBasicMaterial({
                color: 0xbcbdb9,
                transparent: true,
                opacity: 0.54,
                depthWrite: false,
            });
            const lines = new THREE.LineSegments(geometry, material);
            lines.renderOrder = 0;
            return lines;
        }

        createEndpointRing(color, radius) {
            const points = [];
            for (let index = 0; index < 40; index++) {
                const angle = index / 40 * Geo.TAU;
                points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 4));
            }
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
            const ring = new THREE.LineLoop(geometry, material);
            ring.frustumCulled = false;
            return ring;
        }

        resize(width, height) {
            // Keep desktop output crisp. Geometry complexity adapts before
            // resolution does, and DPR never drops below one physical pixel.
            const pixelBudget = 5200000;
            const budgetRatio = Math.sqrt(pixelBudget / Math.max(1, width * height));
            const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, budgetRatio));
            this.renderer.setPixelRatio(dpr);
            this.renderer.setSize(width, height, false);

            const worldAspect = this.world.width / this.world.height;
            const viewportAspect = width / Math.max(1, height);
            if (viewportAspect > worldAspect) {
                const visibleWidth = this.world.height * viewportAspect;
                const extra = (visibleWidth - this.world.width) * 0.5;
                this.camera.left = -extra;
                this.camera.right = this.world.width + extra;
                this.camera.top = 0;
                this.camera.bottom = this.world.height;
            } else {
                const visibleHeight = this.world.width / viewportAspect;
                const extra = (visibleHeight - this.world.height) * 0.5;
                this.camera.left = 0;
                this.camera.right = this.world.width;
                this.camera.top = -extra;
                this.camera.bottom = this.world.height + extra;
            }
            this.camera.updateProjectionMatrix();
        }

        clientToWorld(clientX, clientY) {
            const rect = this.canvas.getBoundingClientRect();
            const nx = (clientX - rect.left) / Math.max(1, rect.width);
            const ny = (clientY - rect.top) / Math.max(1, rect.height);
            return {
                x: this.camera.left + nx * (this.camera.right - this.camera.left),
                y: this.camera.top + ny * (this.camera.bottom - this.camera.top),
            };
        }

        reset() {
            this.dynamicGeometry.setDrawRange(0, 0);
            this.vertexCursor = 0;
        }

        ensureLimb(tendril, creep) {
            if (tendril.biomass) return tendril.biomass;
            const edge = this.graph.edges[tendril.edgeId];
            const spine = Geo.quadraticSpine(edge, this.graph.nodes, tendril.from, 16);
            const chain = Geo.createChain(spine);
            const branchSeeds = Geo.createBranchSeeds(edge, creep);
            tendril.biomass = {
                spine,
                chain,
                branches: branchSeeds.map(seed => ({
                    seed,
                    chain: null,
                    forkChain: null,
                    visibility: 0,
                })),
            };
            return tendril.biomass;
        }

        writeVertex(x, y, z, across, along, opacity, route, seed) {
            if (this.vertexCursor >= MAX_VERTICES) return false;
            const index = this.vertexCursor++;
            this.positions[index * 3] = x;
            this.positions[index * 3 + 1] = y;
            this.positions[index * 3 + 2] = z;
            this.across[index] = across;
            this.along[index] = along;
            this.opacity[index] = opacity;
            this.route[index] = route;
            this.seed[index] = seed;
            return true;
        }

        appendQuad(a, b, c, d, alongA, alongB, opacity, route, seed, z) {
            this.writeVertex(a.x, a.y, z, -1, alongA, opacity, route, seed);
            this.writeVertex(b.x, b.y, z, 1, alongA, opacity, route, seed);
            this.writeVertex(c.x, c.y, z, -1, alongB, opacity, route, seed);
            this.writeVertex(c.x, c.y, z, -1, alongB, opacity, route, seed);
            this.writeVertex(b.x, b.y, z, 1, alongA, opacity, route, seed);
            this.writeVertex(d.x, d.y, z, 1, alongB, opacity, route, seed);
        }

        appendRibbon(chain, progress, baseWidth, seed, opacity, route, z) {
            const count = chain.length / 2;
            const visible = Geo.clamp01(progress) * (count - 1);
            const segmentCount = Math.min(count - 1, Math.ceil(visible));
            if (segmentCount <= 0) return;
            const pulse = this.material.uniforms.uTime.value * 2.2;

            for (let index = 0; index < segmentCount; index++) {
                const remaining = Math.min(1, visible - index);
                if (remaining <= 0) break;
                const offset = index * 2;
                const x0 = chain[offset];
                const y0 = chain[offset + 1];
                const sourceX1 = chain[offset + 2];
                const sourceY1 = chain[offset + 3];
                const x1 = x0 + (sourceX1 - x0) * remaining;
                const y1 = y0 + (sourceY1 - y0) * remaining;
                const dx = x1 - x0;
                const dy = y1 - y0;
                const length = Math.max(0.001, Math.hypot(dx, dy));
                const nx = -dy / length;
                const ny = dx / length;
                const u0 = index / (count - 1);
                const u1 = (index + remaining) / (count - 1);
                const width0 = baseWidth * Geo.widthProfile(u0, seed, pulse, route > 0.5);
                const width1 = baseWidth * Geo.widthProfile(u1, seed, pulse, route > 0.5);
                const a = { x: x0 + nx * width0, y: y0 + ny * width0 };
                const b = { x: x0 - nx * width0, y: y0 - ny * width0 };
                const c = { x: x1 + nx * width1, y: y1 + ny * width1 };
                const d = { x: x1 - nx * width1, y: y1 - ny * width1 };
                this.appendQuad(a, b, c, d, u0, u1, opacity, route, seed, z);
            }
        }

        appendBridge(x0, y0, x1, y1, width, seed, opacity, z) {
            const dx = x1 - x0;
            const dy = y1 - y0;
            const length = Math.max(0.001, Math.hypot(dx, dy));
            const nx = -dy / length;
            const ny = dx / length;
            const a = { x: x0 + nx * width, y: y0 + ny * width };
            const b = { x: x0 - nx * width, y: y0 - ny * width };
            const c = { x: x1 + nx * width, y: y1 + ny * width };
            const d = { x: x1 - nx * width, y: y1 - ny * width };
            this.appendQuad(a, b, c, d, 0, 1, opacity, 1, seed, z);
        }

        appendBraidedRoute(chain, progress, seed, time, z) {
            const count = chain.length / 2;
            const strandCount = this.routeStrandScratch.length;
            for (let strand = 0; strand < strandCount; strand++) {
                const scratch = this.routeStrandScratch[strand];
                const strandOffset = (strand - (strandCount - 1) * 0.5) * 5.2;
                for (let index = 0; index < count; index++) {
                    const previous = Math.max(0, index - 1) * 2;
                    const next = Math.min(count - 1, index + 1) * 2;
                    const dx = chain[next] - chain[previous];
                    const dy = chain[next + 1] - chain[previous + 1];
                    const length = Math.max(0.001, Math.hypot(dx, dy));
                    const nx = -dy / length;
                    const ny = dx / length;
                    const u = index / (count - 1);
                    const joinEnvelope = Math.pow(Math.sin(Math.PI * u), 0.42);
                    const weave =
                        Math.sin(
                            u * Math.PI * (2.1 + strand * 0.46) +
                            time * 0.0014 +
                            seed * 1.7 +
                            strand * 1.31
                        ) *
                        (1.45 + strand * 0.19);
                    const offset = (strandOffset + weave) * joinEnvelope;
                    scratch[index * 2] = chain[index * 2] + nx * offset;
                    scratch[index * 2 + 1] = chain[index * 2 + 1] + ny * offset;
                }
                this.appendRibbon(
                    scratch,
                    progress,
                    strand === 2 ? 1.0 : 0.72,
                    seed + strand * 13.7,
                    strand === 2 ? 0.98 : 0.86,
                    1,
                    z + strand * 0.01
                );
            }

            // Irregular vascular bridges bind the separate strands together.
            for (let bridge = 0; bridge < 6; bridge++) {
                const u = 0.14 + Geo.hash(seed * 11.3 + bridge * 29.7) * 0.72;
                if (u > progress) continue;
                const point = Geo.sampleChain(chain, u);
                const envelope = Math.pow(Math.sin(Math.PI * u), 0.42);
                const pulse = 0.82 + Math.sin(time * 0.004 + seed + bridge) * 0.18;
                const span = 10.8 * envelope * pulse;
                const skew = (Geo.hash(seed + bridge * 7.1) - 0.5) * 5.2;
                this.appendBridge(
                    point.x - point.nx * span - point.tx * skew,
                    point.y - point.ny * span - point.ty * skew,
                    point.x + point.nx * span + point.tx * skew,
                    point.y + point.ny * span + point.ty * skew,
                    0.46,
                    seed + bridge * 23.9,
                    0.78,
                    z + 0.08
                );
            }
        }

        appendDisc(x, y, radius, opacity, route, seed, z) {
            const segments = this.quality === 0 ? 6 : 10;
            for (let index = 0; index < segments; index++) {
                const a0 = index / segments * Geo.TAU;
                const a1 = (index + 1) / segments * Geo.TAU;
                this.writeVertex(x, y, z, 0, 0.5, opacity, route, seed);
                this.writeVertex(
                    x + Math.cos(a0) * radius,
                    y + Math.sin(a0) * radius,
                    z,
                    -1,
                    index / segments,
                    opacity,
                    route,
                    seed
                );
                this.writeVertex(
                    x + Math.cos(a1) * radius,
                    y + Math.sin(a1) * radius,
                    z,
                    1,
                    (index + 1) / segments,
                    opacity,
                    route,
                    seed
                );
            }
        }

        updateBranch(branch, parent, life, decay, time, deltaSeconds, route) {
            const target = Geo.branchTargets(
                parent,
                branch.seed,
                life,
                time,
                decay,
                branch.chain ? branch.chain.target : undefined
            );
            if (!branch.chain) branch.chain = Geo.createChain(target);
            else branch.chain.target.set(target);

            Geo.stepSpringChain(branch.chain, deltaSeconds, {
                anchor: 20 + decay * 54,
                neighbour: 13 * branch.seed.stiffness,
                damping: branch.seed.adhesion ? 0.86 : 0.79,
            });
            this.appendRibbon(
                branch.chain.position,
                life,
                2.25 * (0.6 + branch.seed.stiffness * 0.4),
                branch.seed.seed,
                0.92 * (1 - decay),
                route,
                2.6
            );

            if (branch.seed.forkAt !== null && life > branch.seed.forkAt) {
                const forkParent = Geo.sampleChain(branch.chain.position, branch.seed.forkAt);
                const forkSeed = {
                    ...branch.seed,
                    seed: branch.seed.seed + 73.7,
                    side: branch.seed.forkSide,
                    length: branch.seed.forkLength,
                    curl: -branch.seed.curl * 0.7,
                    segments: Math.max(4, branch.seed.segments - 2),
                    adhesion: false,
                };
                const forkLife = Geo.easeOutCubic(
                    (life - branch.seed.forkAt) / (1 - branch.seed.forkAt)
                );
                const forkTarget = Geo.branchTargets(
                    forkParent,
                    forkSeed,
                    forkLife,
                    time,
                    decay,
                    branch.forkChain ? branch.forkChain.target : undefined
                );
                if (!branch.forkChain) branch.forkChain = Geo.createChain(forkTarget);
                else branch.forkChain.target.set(forkTarget);
                Geo.stepSpringChain(branch.forkChain, deltaSeconds, {
                    anchor: 24 + decay * 60,
                    neighbour: 11,
                    damping: 0.78,
                });
                this.appendRibbon(
                    branch.forkChain.position,
                    forkLife,
                    1.35,
                    forkSeed.seed,
                    0.82 * (1 - decay),
                    route,
                    2.7
                );
            }
        }

        updateQuality(frameMs, visibleCount) {
            this.frameAverage = this.frameAverage * 0.94 + frameMs * 0.06;
            if (this.frameAverage > 23 || visibleCount > 220) {
                this.quality = 0;
                this.fastFrames = 0;
            } else if (this.frameAverage > 15 || visibleCount > 120) {
                this.quality = Math.min(this.quality, 1);
                this.fastFrames = 0;
            } else {
                this.fastFrames++;
                if (this.fastFrames > 180) {
                    this.quality = Math.min(2, this.quality + 1);
                    this.fastFrames = 0;
                }
            }
        }

        render(state, time, deltaSeconds, creep) {
            const frameStart = performance.now();
            this.vertexCursor = 0;
            const solvedElapsed = state.routeStart ? time - state.routeStart : 0;
            const collapse = state.routeStart
                ? Geo.clamp01((solvedElapsed - 620) / 1800)
                : 0;
            let visibleCount = 0;

            this.material.uniforms.uTime.value = time / 1000;
            this.material.uniforms.uWetness.value = this.quality === 0 ? 0.46 : 0.72;

            for (const tendril of state.tendrils.values()) {
                const edge = this.graph.edges[tendril.edgeId];
                const age = time - tendril.spawnTime;
                const growth = Geo.easeOutCubic(age / tendril.duration);
                const isRoute = state.routeEdgeIds.has(tendril.edgeId);
                const decay = isRoute ? 0 : collapse;
                const visibleProgress = growth * (1 - decay * decay);
                if (visibleProgress <= 0.002) continue;
                visibleCount++;

                const biomass = this.ensureLimb(tendril, creep);
                Geo.updateElasticTargets(
                    biomass.chain,
                    biomass.spine,
                    time,
                    tendril.edgeId * 0.713,
                    creep * (this.quality === 0 ? 0.35 : 1),
                    visibleProgress
                );
                Geo.stepSpringChain(biomass.chain, deltaSeconds, {
                    anchor: 27 + decay * 65,
                    neighbour: 17,
                    damping: 0.82,
                });

                const contraction =
                    0.82 + Math.sin(time * 0.006 - tendril.cost * 0.02 + tendril.edgeId) * 0.18;
                let baseWidth =
                    (edge.kind === 'artery' ? 7.6 : edge.kind === 'track' ? 4.2 : 5.8) *
                    contraction;
                if (state.routeStart && isRoute) baseWidth *= 0.2;
                this.appendRibbon(
                    biomass.chain.position,
                    visibleProgress,
                    baseWidth,
                    tendril.edgeId * 0.713,
                    0.96 * (1 - decay),
                    isRoute ? 1 : 0,
                    2
                );

                const qualityAllowsBranch =
                    this.quality === 2 ||
                    (this.quality === 1 && tendril.edgeId % 2 === 0) ||
                    (this.quality === 0 && edge.kind === 'artery' && tendril.edgeId % 3 === 0);
                for (const branch of biomass.branches) {
                    let visibilityTarget =
                        qualityAllowsBranch && creep > 0.03 && visibleProgress > branch.seed.at
                            ? 1
                            : 0;
                    if (state.routeStart && isRoute) visibilityTarget *= 0.32;
                    // Once a solved, suppressed branch has fully retracted,
                    // quality recovery must not pop it back into the old search.
                    if (state.routeStart && !isRoute && branch.visibility < 0.02) {
                        visibilityTarget = 0;
                    }
                    const transitionRate = visibilityTarget > branch.visibility ? 4.6 : 2.8;
                    const transition = 1 - Math.exp(-transitionRate * deltaSeconds);
                    branch.visibility +=
                        (visibilityTarget - branch.visibility) * transition;
                    if (branch.visibility <= 0.005 || visibleProgress <= branch.seed.at) continue;

                    const sprout = Geo.easeOutCubic(
                        (visibleProgress - branch.seed.at) / 0.2
                    );
                    const life = sprout * (1 - decay) * branch.visibility;
                    if (life <= 0.005) continue;
                    const parent = Geo.sampleChain(
                        biomass.chain.position,
                        Math.min(branch.seed.at, visibleProgress)
                    );
                    this.updateBranch(
                        branch,
                        parent,
                        life * (0.4 + creep * 0.6),
                        decay,
                        time,
                        deltaSeconds,
                        isRoute ? 1 : 0
                    );
                }
            }

            for (const [nodeId, organismNode] of state.settledNodes) {
                const isRoute = state.routeNodeIds.has(nodeId);
                const decay = isRoute ? 0 : collapse;
                if (decay >= 0.99) continue;
                const node = this.graph.nodes[nodeId];
                const age = time - organismNode.spawnTime;
                const arrival = Geo.easeOutCubic(age / 260);
                const pulse = 0.78 + Math.sin(time * 0.005 + organismNode.phase) * 0.16;
                const radius = (isRoute ? 3.1 : 5.8) * pulse * arrival * (1 - decay);
                this.appendDisc(
                    node.x,
                    node.y,
                    radius,
                    0.94 * (1 - decay),
                    isRoute ? 1 : 0,
                    organismNode.phase,
                    2.2
                );
            }

            if (state.result && state.result.found && state.routeReveal > 0) {
                const totalEdges = state.result.edgeIds.length;
                const scaled = state.routeReveal * totalEdges;
                for (let index = 0; index < totalEdges; index++) {
                    const localProgress = Geo.clamp01(scaled - index);
                    if (localProgress <= 0) break;
                    const edgeId = state.result.edgeIds[index];
                    const tendril = state.tendrils.get(edgeId);
                    const edge = this.graph.edges[edgeId];
                    const chain = tendril
                        ? this.ensureLimb(tendril, creep).chain.position
                        : Geo.quadraticSpine(edge, this.graph.nodes, state.result.nodeIds[index], 16);
                    this.appendBraidedRoute(
                        chain,
                        localProgress,
                        edgeId * 0.713,
                        time,
                        3
                    );
                }
            }

            const origin = this.graph.nodes[state.originId];
            const destination = this.graph.nodes[state.destinationId];
            this.originRing.position.set(origin.x, origin.y, 4);
            this.destinationRing.position.set(destination.x, destination.y, 4);
            const ringPulse = 1 + Math.sin(time * 0.003) * 0.12;
            this.originRing.scale.setScalar(ringPulse);
            this.destinationRing.scale.setScalar(2 - ringPulse);

            const attributes = this.dynamicGeometry.attributes;
            attributes.position.needsUpdate = true;
            attributes.aAcross.needsUpdate = true;
            attributes.aAlong.needsUpdate = true;
            attributes.aOpacity.needsUpdate = true;
            attributes.aRoute.needsUpdate = true;
            attributes.aSeed.needsUpdate = true;
            this.dynamicGeometry.setDrawRange(0, this.vertexCursor);
            this.renderer.render(this.scene, this.camera);

            this.updateQuality(performance.now() - frameStart, visibleCount);
            return {
                visibleCount,
                quality: this.quality,
                vertices: this.vertexCursor,
            };
        }

        dispose() {
            this.dynamicGeometry.dispose();
            this.material.dispose();
            this.roadObject.geometry.dispose();
            this.roadObject.material.dispose();
            this.originRing.geometry.dispose();
            this.originRing.material.dispose();
            this.destinationRing.geometry.dispose();
            this.destinationRing.material.dispose();
            this.renderer.dispose();
        }
    }

    return { BiomassRenderer };
});
