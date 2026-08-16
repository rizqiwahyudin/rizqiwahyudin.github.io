(function (root, factory) {
    const api = factory(
        root.THREE,
        root.SymbioteGeometry,
        root.SymbioteCloudAuthor
    );
    root.SymbioteCloudRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (THREE, Geo, Author) {
    'use strict';

    const MAX_POINTS = 360000;
    const MAX_LIMBS = 4096;
    const CHAIN_SAMPLES = 17;

    class PointCloudRenderer {
        constructor(canvas, graph, world, options = {}) {
            if (!THREE || !THREE.OrbitControls) {
                throw new Error('Three.js and OrbitControls are required');
            }
            this.canvas = canvas;
            this.graph = graph;
            this.world = world;
            this.pointCount = 0;
            this.particleAttributesDirty = false;
            this.nextSlot = 0;
            this.quality = 2;
            this.qualityValue = 1;
            this.frameAverage = 12;
            this.contextLost = false;
            this.mainClouds = new Map();
            this.nodeClouds = new Map();
            this.routeClouds = new Map();
            this.slotOwners = new Map();

            this.renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: true,
                alpha: false,
                powerPreference: 'high-performance',
            });
            this.renderer.setClearColor(0xf2f1ed, 1);
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.renderer.sortObjects = false;

            const hasFloatTextures =
                this.renderer.capabilities.isWebGL2 ||
                this.renderer.extensions.has('OES_texture_float');
            if (
                this.renderer.capabilities.maxVertexTextures < 2 ||
                !hasFloatTextures
            ) {
                throw new Error('This point-cloud study requires vertex texture support');
            }

            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(48, 1, 1, 5000);
            this.initialCamera = new THREE.Vector3(
                world.width * 0.72,
                650,
                world.height * 0.55
            );
            this.initialTarget = new THREE.Vector3(
                world.width * 0.5,
                0,
                -world.height * 0.5
            );
            this.camera.position.copy(this.initialCamera);

            this.controls = new THREE.OrbitControls(this.camera, canvas);
            this.controls.target.copy(this.initialTarget);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.07;
            this.controls.minDistance = 180;
            this.controls.maxDistance = 2600;
            this.controls.minPolarAngle = 0.08;
            this.controls.maxPolarAngle = Math.PI * 0.49;
            this.controls.update();

            this.skeletonData = new Float32Array(
                CHAIN_SAMPLES * MAX_LIMBS * 4
            );
            this.stateData = new Float32Array(MAX_LIMBS * 4);
            this.skeletonTexture = new THREE.DataTexture(
                this.skeletonData,
                CHAIN_SAMPLES,
                MAX_LIMBS,
                THREE.RGBAFormat,
                THREE.FloatType
            );
            this.skeletonTexture.minFilter = THREE.NearestFilter;
            this.skeletonTexture.magFilter = THREE.NearestFilter;
            this.skeletonTexture.generateMipmaps = false;
            this.skeletonTexture.needsUpdate = true;
            this.stateTexture = new THREE.DataTexture(
                this.stateData,
                1,
                MAX_LIMBS,
                THREE.RGBAFormat,
                THREE.FloatType
            );
            this.stateTexture.minFilter = THREE.NearestFilter;
            this.stateTexture.magFilter = THREE.NearestFilter;
            this.stateTexture.generateMipmaps = false;
            this.stateTexture.needsUpdate = true;

            this.attributes = {
                position: new Float32Array(MAX_POINTS * 3),
                aAlong: new Float32Array(MAX_POINTS),
                aAngle: new Float32Array(MAX_POINTS),
                aDepth: new Float32Array(MAX_POINTS),
                aPolar: new Float32Array(MAX_POINTS),
                aLimb: new Float32Array(MAX_POINTS),
                aKind: new Float32Array(MAX_POINTS),
                aRoute: new Float32Array(MAX_POINTS),
                aSeed: new Float32Array(MAX_POINTS),
            };
            this.geometry = new THREE.BufferGeometry();
            for (const [name, array] of Object.entries(this.attributes)) {
                const size = name === 'position' ? 3 : 1;
                const attribute = new THREE.BufferAttribute(array, size);
                attribute.setUsage(THREE.DynamicDrawUsage);
                this.geometry.setAttribute(name, attribute);
            }
            this.geometry.setDrawRange(0, 0);

            this.material = new THREE.ShaderMaterial({
                transparent: true,
                depthWrite: true,
                depthTest: true,
                blending: THREE.NormalBlending,
                uniforms: {
                    uSkeleton: { value: this.skeletonTexture },
                    uState: { value: this.stateTexture },
                    uAtlasSize: {
                        value: new THREE.Vector2(CHAIN_SAMPLES, MAX_LIMBS),
                    },
                    uTime: { value: 0 },
                    uPixelRatio: { value: 1 },
                    uDensity: { value: 1 },
                },
                vertexShader: `
                    precision highp float;
                    attribute float aAlong;
                    attribute float aAngle;
                    attribute float aDepth;
                    attribute float aPolar;
                    attribute float aLimb;
                    attribute float aKind;
                    attribute float aRoute;
                    attribute float aSeed;
                    uniform sampler2D uSkeleton;
                    uniform sampler2D uState;
                    uniform vec2 uAtlasSize;
                    uniform float uTime;
                    uniform float uPixelRatio;
                    uniform float uDensity;
                    varying float vAlpha;
                    varying float vRoute;
                    varying float vSurface;
                    varying float vSeed;

                    vec4 readSkeleton(float slot, float sampleIndex) {
                        vec2 uv = vec2(
                            (sampleIndex + 0.5) / uAtlasSize.x,
                            (slot + 0.5) / uAtlasSize.y
                        );
                        return texture2D(uSkeleton, uv);
                    }

                    void main() {
                        vec4 state = texture2D(
                            uState,
                            vec2(0.5, (aLimb + 0.5) / uAtlasSize.y)
                        );
                        float progress = state.x;
                        float opacity = state.y;
                        float radius = state.z;
                        float activeState = state.w;
                        float scaled = aAlong * (uAtlasSize.x - 1.0);
                        float sampleA = floor(scaled);
                        float sampleB = min(uAtlasSize.x - 1.0, sampleA + 1.0);
                        float fraction = scaled - sampleA;
                        vec3 center = mix(
                            readSkeleton(aLimb, sampleA).xyz,
                            readSkeleton(aLimb, sampleB).xyz,
                            fraction
                        );
                        vec3 previous = readSkeleton(
                            aLimb,
                            max(0.0, sampleA - 1.0)
                        ).xyz;
                        vec3 following = readSkeleton(
                            aLimb,
                            min(uAtlasSize.x - 1.0, sampleB + 1.0)
                        ).xyz;
                        vec3 tangent = normalize(following - previous + vec3(0.0001));
                        vec3 horizontal = normalize(cross(vec3(0.0, 1.0, 0.0), tangent));
                        if (length(horizontal) < 0.1) horizontal = vec3(1.0, 0.0, 0.0);
                        vec3 vertical = normalize(cross(tangent, horizontal));

                        float taper = pow(max(0.02, sin(3.14159265 * aAlong)), 0.48);
                        float fatty = 0.76 + aSeed * 0.42;
                        float pulse =
                            1.0 +
                            sin(uTime * (2.4 + aSeed) - aAlong * 17.0 + aSeed * 9.0) *
                            0.14;
                        float localRadius = radius * (taper * fatty + 0.08) * pulse;
                        vec3 offset;
                        if (aKind > 1.5) {
                            vec3 sphereDirection = vec3(
                                sin(aPolar) * cos(aAngle),
                                cos(aPolar),
                                sin(aPolar) * sin(aAngle)
                            );
                            offset = sphereDirection * localRadius * aDepth;
                        } else {
                            offset =
                                horizontal * cos(aAngle) * localRadius * aDepth +
                                vertical * sin(aAngle) * localRadius * aDepth;
                        }
                        vec3 transformed = center + offset;
                        float growth = 1.0 - smoothstep(
                            progress - 0.035,
                            progress + 0.008,
                            aAlong
                        );
                        float densityThreshold = mix(0.72, 0.0, uDensity);
                        float density = smoothstep(
                            densityThreshold - 0.08,
                            densityThreshold + 0.08,
                            aSeed
                        );
                        float visible = activeState * opacity * growth * density;
                        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
                        gl_Position = projectionMatrix * mvPosition;
                        float perspective = 480.0 / max(80.0, -mvPosition.z);
                        gl_PointSize = clamp(
                            (1.3 + aDepth * 1.15 + aRoute * 0.35) *
                            uPixelRatio *
                            perspective,
                            0.0,
                            7.0
                        ) * step(0.004, visible);
                        vAlpha = visible;
                        vRoute = aRoute;
                        vSurface = aDepth;
                        vSeed = aSeed;
                    }
                `,
                fragmentShader: `
                    precision highp float;
                    uniform float uTime;
                    varying float vAlpha;
                    varying float vRoute;
                    varying float vSurface;
                    varying float vSeed;
                    void main() {
                        vec2 point = gl_PointCoord - 0.5;
                        float radius = dot(point, point);
                        if (radius > 0.25 || vAlpha <= 0.002) discard;
                        float edge = 1.0 - smoothstep(0.16, 0.25, radius);
                        float wetBand =
                            pow(max(0.0, 1.0 - abs(point.x + 0.18) * 4.0), 7.0);
                        wetBand *= 0.35 + 0.65 * sin(
                            uTime * 1.7 + vSeed * 24.0
                        ) * sin(uTime * 1.7 + vSeed * 24.0);
                        vec3 body = mix(vec3(0.07), vec3(0.018), vRoute);
                        vec3 wet = vec3(0.62) * wetBand * vSurface * 0.55;
                        gl_FragColor = vec4(body + wet, vAlpha * edge);
                    }
                `,
            });
            this.points = new THREE.Points(this.geometry, this.material);
            this.points.frustumCulled = false;
            this.points.renderOrder = 2;
            this.scene.add(this.points);

            this.roadPoints = this.buildRoadCloud();
            this.scene.add(this.roadPoints);
            this.originRing = this.createRing(8);
            this.destinationRing = this.createRing(12);
            this.scene.add(this.originRing, this.destinationRing);

            this.raycaster = new THREE.Raycaster();
            this.groundPlane = new THREE.Plane(
                new THREE.Vector3(0, 1, 0),
                0
            );
            this.tmpHit = new THREE.Vector3();

            canvas.addEventListener('webglcontextlost', event => {
                event.preventDefault();
                this.contextLost = true;
                if (options.onContextLost) options.onContextLost();
            });
            canvas.addEventListener('webglcontextrestored', () => {
                this.contextLost = false;
                this.skeletonTexture.needsUpdate = true;
                this.stateTexture.needsUpdate = true;
                for (const attribute of Object.values(this.geometry.attributes)) {
                    attribute.needsUpdate = true;
                }
                if (options.onContextRestored) options.onContextRestored();
            });
        }

        buildRoadCloud() {
            const positions = [];
            const colors = [];
            for (const edge of this.graph.edges) {
                const spine = Geo.quadraticSpine(
                    edge,
                    this.graph.nodes,
                    edge.a,
                    12
                );
                const count = spine.length / 2;
                for (let index = 0; index < count - 1; index++) {
                    const x0 = spine[index * 2];
                    const z0 = -spine[index * 2 + 1];
                    const x1 = spine[index * 2 + 2];
                    const z1 = -spine[index * 2 + 3];
                    const distance = Math.hypot(x1 - x0, z1 - z0);
                    const samples = Math.max(2, Math.ceil(distance / 5));
                    for (let sample = 0; sample <= samples; sample++) {
                        const t = sample / samples;
                        positions.push(
                            x0 + (x1 - x0) * t,
                            0,
                            z0 + (z1 - z0) * t
                        );
                        const shade = edge.kind === 'artery' ? 0.61 : 0.7;
                        colors.push(shade, shade, shade * 0.98);
                    }
                }
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(positions, 3)
            );
            geometry.setAttribute(
                'color',
                new THREE.Float32BufferAttribute(colors, 3)
            );
            const material = new THREE.PointsMaterial({
                size: 1.35,
                sizeAttenuation: true,
                vertexColors: true,
                transparent: true,
                opacity: 0.52,
                depthWrite: false,
            });
            return new THREE.Points(geometry, material);
        }

        createRing(radius) {
            const points = [];
            for (let index = 0; index < 48; index++) {
                const angle = index / 48 * Geo.TAU;
                points.push(
                    new THREE.Vector3(
                        Math.cos(angle) * radius,
                        0.35,
                        Math.sin(angle) * radius
                    )
                );
            }
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({
                color: 0x111111,
                transparent: true,
                opacity: 0.9,
            });
            const ring = new THREE.LineLoop(geometry, material);
            ring.frustumCulled = false;
            return ring;
        }

        resetCamera() {
            this.camera.position.copy(this.initialCamera);
            this.controls.target.copy(this.initialTarget);
            this.controls.update();
        }

        resize(width, height) {
            const pixelBudget = 5200000;
            const ratio = Math.sqrt(
                pixelBudget / Math.max(1, width * height)
            );
            const dpr = Math.max(
                1,
                Math.min(window.devicePixelRatio || 1, 2, ratio)
            );
            this.renderer.setPixelRatio(dpr);
            this.renderer.setSize(width, height, false);
            this.camera.aspect = width / Math.max(1, height);
            this.camera.updateProjectionMatrix();
            this.material.uniforms.uPixelRatio.value = dpr;
        }

        allocateSlot(owner) {
            if (this.nextSlot >= MAX_LIMBS) return -1;
            const slot = this.nextSlot++;
            this.slotOwners.set(slot, owner);
            return slot;
        }

        writePoint(point) {
            if (this.pointCount >= MAX_POINTS) return false;
            const index = this.pointCount++;
            this.attributes.position[index * 3] = 0;
            this.attributes.position[index * 3 + 1] = 0;
            this.attributes.position[index * 3 + 2] = 0;
            this.attributes.aAlong[index] = point.along;
            this.attributes.aAngle[index] = point.radialAngle;
            this.attributes.aDepth[index] = point.radialDepth;
            this.attributes.aPolar[index] = point.polar;
            this.attributes.aLimb[index] = point.limbIndex;
            this.attributes.aKind[index] = point.pointKind;
            this.attributes.aRoute[index] = point.route;
            this.attributes.aSeed[index] = point.seed;
            return true;
        }

        allocateTube(owner, profile, pointKind, route, seed) {
            const slot = this.allocateSlot(owner);
            if (slot < 0) return null;
            const start = this.pointCount;
            Author.authorTube(
                {
                    profile,
                    limbIndex: slot,
                    pointKind,
                    route,
                    seed,
                },
                point => this.writePoint(point)
            );
            this.particleAttributesDirty = true;
            return { slot, start, count: this.pointCount - start };
        }

        allocateNodule(owner, route, seed, count) {
            const slot = this.allocateSlot(owner);
            if (slot < 0) return null;
            const start = this.pointCount;
            Author.authorNodule(
                { limbIndex: slot, route, seed, count },
                point => this.writePoint(point)
            );
            this.particleAttributesDirty = true;
            return { slot, start, count: this.pointCount - start };
        }

        flushParticleAttributes() {
            this.geometry.setDrawRange(0, this.pointCount);
            for (const attribute of Object.values(this.geometry.attributes)) {
                attribute.needsUpdate = true;
            }
            this.particleAttributesDirty = false;
        }

        uploadChain(slot, chain, height) {
            const sourceCount = chain.length / 2;
            for (let sample = 0; sample < CHAIN_SAMPLES; sample++) {
                const u = sample / (CHAIN_SAMPLES - 1);
                const scaled = u * (sourceCount - 1);
                const index = Math.min(sourceCount - 2, Math.floor(scaled));
                const fraction = scaled - index;
                const offset = index * 2;
                const next = offset + 2;
                const atlas = Author.atlasIndex(
                    slot,
                    sample,
                    CHAIN_SAMPLES
                );
                this.skeletonData[atlas] =
                    chain[offset] + (chain[next] - chain[offset]) * fraction;
                this.skeletonData[atlas + 1] = height;
                this.skeletonData[atlas + 2] =
                    -(chain[offset + 1] +
                    (chain[next + 1] - chain[offset + 1]) * fraction);
                this.skeletonData[atlas + 3] = 1;
            }
        }

        uploadPoint(slot, x, z, height) {
            for (let sample = 0; sample < CHAIN_SAMPLES; sample++) {
                const atlas = Author.atlasIndex(slot, sample, CHAIN_SAMPLES);
                this.skeletonData[atlas] = x;
                this.skeletonData[atlas + 1] = height;
                this.skeletonData[atlas + 2] = -z;
                this.skeletonData[atlas + 3] = 1;
            }
        }

        setLimbState(slot, progress, opacity, radius, active) {
            const offset = slot * 4;
            this.stateData[offset] = progress;
            this.stateData[offset + 1] = opacity;
            this.stateData[offset + 2] = radius;
            this.stateData[offset + 3] = active;
        }

        ensureMain(tendril) {
            let cloud = this.mainClouds.get(tendril.edgeId);
            if (cloud) return cloud;
            const edge = this.graph.edges[tendril.edgeId];
            const spine = Geo.quadraticSpine(
                edge,
                this.graph.nodes,
                tendril.from,
                CHAIN_SAMPLES - 1
            );
            const allocation = this.allocateTube(
                `main:${tendril.edgeId}`,
                { longitudinal: 17, radial: 8, layers: 2 },
                0,
                false,
                tendril.edgeId * 0.713
            );
            if (!allocation) return null;
            cloud = {
                ...allocation,
                spine,
                chain: Geo.createChain(spine),
                branches: Geo.createBranchSeeds(edge, 0.82).map(seed => ({
                    seed,
                    allocation: null,
                    forkAllocation: null,
                    chain: null,
                    forkChain: null,
                    visibility: 0,
                })),
            };
            this.mainClouds.set(tendril.edgeId, cloud);
            return cloud;
        }

        deactivateMain(cloud) {
            if (!cloud) return;
            this.setLimbState(cloud.slot, 0, 0, 1, 0);
            for (const branch of cloud.branches) {
                if (branch.allocation) {
                    this.setLimbState(
                        branch.allocation.slot,
                        0,
                        0,
                        1,
                        0
                    );
                }
                if (branch.forkAllocation) {
                    this.setLimbState(
                        branch.forkAllocation.slot,
                        0,
                        0,
                        1,
                        0
                    );
                }
            }
        }

        ensureBranch(branch, edgeId, route) {
            if (branch.allocation) return branch.allocation;
            branch.allocation = this.allocateTube(
                `branch:${edgeId}:${branch.seed.seed}`,
                { longitudinal: 8, radial: 5, layers: 1 },
                1,
                route,
                branch.seed.seed
            );
            return branch.allocation;
        }

        ensureFork(branch, edgeId, route, forkSeed) {
            if (branch.forkAllocation) return branch.forkAllocation;
            branch.forkAllocation = this.allocateTube(
                `fork:${edgeId}:${branch.seed.seed}`,
                { longitudinal: 6, radial: 4, layers: 1 },
                1,
                route,
                forkSeed.seed
            );
            return branch.forkAllocation;
        }

        updateBranch(branch, parent, life, decay, time, delta, edgeId, route) {
            const allocation = this.ensureBranch(branch, edgeId, route);
            if (!allocation) return;
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
            Geo.stepSpringChain(branch.chain, delta, {
                anchor: 20 + decay * 54,
                neighbour: 13 * branch.seed.stiffness,
                damping: branch.seed.adhesion ? 0.86 : 0.79,
            });
            this.uploadChain(allocation.slot, branch.chain.position, 3.2);
            this.setLimbState(
                allocation.slot,
                life,
                Math.max(0, 1 - decay),
                2.1,
                1
            );

            if (branch.seed.forkAt !== null && life > branch.seed.forkAt) {
                const forkParent = Geo.sampleChain(
                    branch.chain.position,
                    branch.seed.forkAt
                );
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
                    (life - branch.seed.forkAt) /
                    (1 - branch.seed.forkAt)
                );
                const forkAllocation = this.ensureFork(
                    branch,
                    edgeId,
                    route,
                    forkSeed
                );
                if (!forkAllocation) return;
                const forkTarget = Geo.branchTargets(
                    forkParent,
                    forkSeed,
                    forkLife,
                    time,
                    decay,
                    branch.forkChain
                        ? branch.forkChain.target
                        : undefined
                );
                if (!branch.forkChain) {
                    branch.forkChain = Geo.createChain(forkTarget);
                } else {
                    branch.forkChain.target.set(forkTarget);
                }
                Geo.stepSpringChain(branch.forkChain, delta, {
                    anchor: 24 + decay * 60,
                    neighbour: 11,
                    damping: 0.78,
                });
                this.uploadChain(
                    forkAllocation.slot,
                    branch.forkChain.position,
                    3.4
                );
                this.setLimbState(
                    forkAllocation.slot,
                    forkLife,
                    Math.max(0, 1 - decay),
                    1.35,
                    1
                );
            } else if (branch.forkAllocation) {
                this.setLimbState(
                    branch.forkAllocation.slot,
                    0,
                    0,
                    1,
                    0
                );
            }
        }

        ensureNode(nodeId, organismNode, route) {
            let cloud = this.nodeClouds.get(nodeId);
            if (cloud) return cloud;
            const allocation = this.allocateNodule(
                `node:${nodeId}`,
                route,
                organismNode.phase,
                54
            );
            if (!allocation) return null;
            cloud = { ...allocation };
            this.nodeClouds.set(nodeId, cloud);
            return cloud;
        }

        strandChain(chain, strand, seed, time) {
            const count = chain.length / 2;
            const result = new Float32Array(chain.length);
            const identity = strand - 2;
            const strandSeed = seed + strand * 17.73;
            for (let index = 0; index < count; index++) {
                const previous = Math.max(0, index - 1) * 2;
                const next = Math.min(count - 1, index + 1) * 2;
                const dx = chain[next] - chain[previous];
                const dy = chain[next + 1] - chain[previous + 1];
                const length = Math.max(0.001, Math.hypot(dx, dy));
                const nx = -dy / length;
                const ny = dx / length;
                const u = index / (count - 1);
                const envelope = Math.pow(Math.sin(Math.PI * u), 0.42);
                const spacing =
                    0.38 +
                    (Geo.smoothNoise(u * 2.7, seed + 91.4) + 1) * 0.34;
                const sprawl =
                    Geo.smoothNoise(u * 4.8, strandSeed) * 4.8 +
                    Geo.smoothNoise(u * 10.3, strandSeed + 6.2) * 1.7;
                const squirm =
                    Math.sin(
                        time * (0.001 + strand * 0.00013) +
                        u * (7.4 + Geo.hash(strandSeed) * 8.7) +
                        strandSeed
                    ) *
                    (1.1 + Math.abs(identity) * 0.42);
                const offset =
                    (identity * 4.7 * spacing + sprawl + squirm) *
                    envelope;
                result[index * 2] = chain[index * 2] + nx * offset;
                result[index * 2 + 1] = chain[index * 2 + 1] + ny * offset;
            }
            return result;
        }

        ensureRouteCloud(edgeId, chain, seed) {
            let route = this.routeClouds.get(edgeId);
            if (route) return route;
            const strands = [];
            for (let strand = 0; strand < 5; strand++) {
                const allocation = this.allocateTube(
                    `route:${edgeId}:${strand}`,
                    { longitudinal: 17, radial: 6, layers: 2 },
                    3,
                    true,
                    seed + strand * 13.7
                );
                if (allocation) strands.push({ ...allocation, strand });
            }
            const connectors = [];
            const connectorCount =
                2 + Math.floor(Geo.hash(seed * 3.1) * 3);
            for (let connector = 0; connector < connectorCount; connector++) {
                const allocation = this.allocateTube(
                    `route-connector:${edgeId}:${connector}`,
                    { longitudinal: 6, radial: 4, layers: 1 },
                    3,
                    true,
                    seed + connector * 23.9
                );
                if (allocation) {
                    connectors.push({
                        ...allocation,
                        connector,
                        chain: new Float32Array(12),
                    });
                }
            }
            route = { strands, connectors };
            this.routeClouds.set(edgeId, route);
            return route;
        }

        updateRoute(edgeId, chain, progress, time) {
            const seed = edgeId * 0.713;
            const route = this.ensureRouteCloud(edgeId, chain, seed);
            for (const strand of route.strands) {
                const strandChain = this.strandChain(
                    chain,
                    strand.strand,
                    seed,
                    time
                );
                this.uploadChain(strand.slot, strandChain, 5 + strand.strand * 0.22);
                this.setLimbState(
                    strand.slot,
                    progress,
                    0.98,
                    strand.strand === 2 ? 1.8 : 1.25,
                    1
                );
            }
            for (const connector of route.connectors) {
                const bridgeSeed = seed * 11.3 + connector.connector * 29.7;
                const u = 0.14 + Geo.hash(bridgeSeed) * 0.72;
                if (u > progress) {
                    this.setLimbState(
                        connector.slot,
                        0,
                        0,
                        1,
                        0
                    );
                    continue;
                }
                const point = Geo.sampleChain(chain, u);
                const envelope = Math.pow(Math.sin(Math.PI * u), 0.42);
                const pulse =
                    0.82 +
                    Math.sin(time * 0.004 + seed + connector.connector) *
                        0.18;
                const span =
                    (7.4 + Geo.hash(bridgeSeed + 2) * 5.8) *
                    envelope *
                    pulse;
                const hook = (Geo.hash(bridgeSeed + 4) - 0.5) * 10;
                for (let sample = 0; sample < 6; sample++) {
                    const t = sample / 5;
                    const lateral = -span + span * 2 * t;
                    const curl =
                        Math.sin(Math.PI * t) * hook +
                        Geo.smoothNoise(
                            t * 3.2 + time * 0.0004,
                            bridgeSeed
                        ) *
                            1.6;
                    connector.chain[sample * 2] =
                        point.x + point.nx * lateral + point.tx * curl;
                    connector.chain[sample * 2 + 1] =
                        point.y + point.ny * lateral + point.ty * curl;
                }
                this.uploadChain(
                    connector.slot,
                    connector.chain,
                    6.2
                );
                this.setLimbState(
                    connector.slot,
                    1,
                    0.9,
                    1.25,
                    1
                );
            }
        }

        updateQuality(frameMs, visibleLimbs) {
            this.frameAverage = this.frameAverage * 0.94 + frameMs * 0.06;
            let target = 1;
            if (this.frameAverage > 23 || visibleLimbs > 220) {
                this.quality = 0;
                target = 0.34;
            } else if (this.frameAverage > 15 || visibleLimbs > 120) {
                this.quality = 1;
                target = 0.66;
            } else {
                this.quality = 2;
            }
            this.qualityValue += (target - this.qualityValue) * 0.045;
            this.material.uniforms.uDensity.value = this.qualityValue;
        }

        render(frame, time, delta, creep) {
            if (this.contextLost) return { visibleCount: 0, quality: 0 };
            const started = performance.now();
            let visibleCount = 0;

            this.material.uniforms.uTime.value = time / 1000;
            for (const tendril of frame.tendrils.values()) {
                const edge = this.graph.edges[tendril.edgeId];
                const age = time - tendril.spawnTime;
                const growth = Geo.easeOutCubic(age / tendril.duration);
                const route = frame.routeEdgeIds.has(tendril.edgeId);
                const decay = route ? 0 : frame.collapse;
                const progress = growth * (1 - decay * decay);
                if (progress <= 0.002) {
                    this.deactivateMain(
                        this.mainClouds.get(tendril.edgeId)
                    );
                    continue;
                }
                visibleCount++;
                const cloud = this.ensureMain(tendril);
                if (!cloud) continue;
                Geo.updateElasticTargets(
                    cloud.chain,
                    cloud.spine,
                    time,
                    tendril.edgeId * 0.713,
                    creep * (this.quality === 0 ? 0.35 : 1),
                    progress
                );
                Geo.stepSpringChain(cloud.chain, delta, {
                    anchor: 27 + decay * 65,
                    neighbour: 17,
                    damping: 0.82,
                });
                this.uploadChain(cloud.slot, cloud.chain.position, 3);
                const contraction =
                    0.82 +
                    Math.sin(
                        time * 0.006 -
                        tendril.cost * 0.02 +
                        tendril.edgeId
                    ) *
                    0.18;
                const base =
                    (edge.kind === 'artery'
                        ? 7.6
                        : edge.kind === 'track'
                          ? 4.2
                          : 5.8) * contraction;
                this.setLimbState(
                    cloud.slot,
                    progress,
                    Math.max(0, 1 - decay),
                    frame.routeStart && route ? base * 0.46 : base,
                    1
                );

                for (const branch of cloud.branches) {
                    let target =
                        creep > 0.03 && progress > branch.seed.at ? 1 : 0;
                    if (frame.routeStart && route) target = target ? 0.84 : 0;
                    if (
                        frame.routeStart &&
                        !route &&
                        branch.visibility < 0.02
                    ) {
                        target = 0;
                    }
                    const rate = target > branch.visibility ? 4.6 : 2.8;
                    branch.visibility +=
                        (target - branch.visibility) *
                        (1 - Math.exp(-rate * delta));
                    if (
                        branch.visibility <= 0.005 ||
                        progress <= branch.seed.at
                    ) {
                        if (branch.allocation) {
                            this.setLimbState(
                                branch.allocation.slot,
                                0,
                                0,
                                1,
                                0
                            );
                        }
                        continue;
                    }
                    const sprout = Geo.easeOutCubic(
                        (progress - branch.seed.at) / 0.2
                    );
                    const life =
                        sprout *
                        (1 - decay) *
                        branch.visibility *
                        (0.4 + creep * 0.6) *
                        (frame.routeStart && route
                            ? 0.86 +
                              Math.sin(time * 0.006 + branch.seed.seed) *
                              0.14
                            : 1);
                    const parent = Geo.sampleChain(
                        cloud.chain.position,
                        Math.min(branch.seed.at, progress)
                    );
                    this.updateBranch(
                        branch,
                        parent,
                        life,
                        decay,
                        time,
                        delta,
                        tendril.edgeId,
                        route
                    );
                }
            }

            for (const [nodeId, organismNode] of frame.settledNodes) {
                const route = frame.routeNodeIds.has(nodeId);
                const decay = route ? 0 : frame.collapse;
                if (decay >= 0.99) {
                    const existing = this.nodeClouds.get(nodeId);
                    if (existing) {
                        this.setLimbState(
                            existing.slot,
                            0,
                            0,
                            1,
                            0
                        );
                    }
                    continue;
                }
                const cloud = this.ensureNode(
                    nodeId,
                    organismNode,
                    route
                );
                if (!cloud) continue;
                const node = this.graph.nodes[nodeId];
                this.uploadPoint(cloud.slot, node.x, node.y, 2.8);
                const age = time - organismNode.spawnTime;
                const arrival = Geo.easeOutCubic(age / 260);
                const pulse =
                    0.78 +
                    Math.sin(time * 0.005 + organismNode.phase) * 0.16;
                this.setLimbState(
                    cloud.slot,
                    1,
                    Math.max(0, 1 - decay),
                    (route ? 4.4 : 5.8) * pulse * arrival,
                    1
                );
            }

            if (frame.result && frame.result.found && frame.routeReveal > 0) {
                const scaled =
                    frame.routeReveal * frame.result.edgeIds.length;
                for (
                    let index = 0;
                    index < frame.result.edgeIds.length;
                    index++
                ) {
                    const progress = Geo.clamp01(scaled - index);
                    if (progress <= 0) break;
                    const edgeId = frame.result.edgeIds[index];
                    const tendril = frame.tendrils.get(edgeId);
                    if (!tendril) continue;
                    const cloud = this.ensureMain(tendril);
                    this.updateRoute(
                        edgeId,
                        cloud.chain.position,
                        progress,
                        time
                    );
                }
            }

            const origin = this.graph.nodes[frame.originId];
            const destination = this.graph.nodes[frame.destinationId];
            this.originRing.position.set(origin.x, 0.35, -origin.y);
            this.destinationRing.position.set(
                destination.x,
                0.35,
                -destination.y
            );
            const ringPulse = 1 + Math.sin(time * 0.003) * 0.12;
            this.originRing.scale.setScalar(ringPulse);
            this.destinationRing.scale.setScalar(2 - ringPulse);

            this.skeletonTexture.needsUpdate = true;
            this.stateTexture.needsUpdate = true;
            if (this.particleAttributesDirty) {
                this.flushParticleAttributes();
            }
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
            this.updateQuality(
                performance.now() - started,
                visibleCount
            );
            return {
                visibleCount,
                quality: this.quality,
                points: this.pointCount,
            };
        }

        groundPoint(clientX, clientY) {
            const rect = this.canvas.getBoundingClientRect();
            const ndc = new THREE.Vector2(
                ((clientX - rect.left) / rect.width) * 2 - 1,
                -((clientY - rect.top) / rect.height) * 2 + 1
            );
            this.raycaster.setFromCamera(ndc, this.camera);
            const hit = this.raycaster.ray.intersectPlane(
                this.groundPlane,
                this.tmpHit
            );
            return hit
                ? { x: hit.x, y: -hit.z }
                : null;
        }

        reset() {
            this.pointCount = 0;
            this.particleAttributesDirty = false;
            this.nextSlot = 0;
            this.mainClouds.clear();
            this.nodeClouds.clear();
            this.routeClouds.clear();
            this.slotOwners.clear();
            this.skeletonData.fill(0);
            this.stateData.fill(0);
            this.geometry.setDrawRange(0, 0);
            this.skeletonTexture.needsUpdate = true;
            this.stateTexture.needsUpdate = true;
        }

        setTopDownReference(enabled) {
            if (enabled) {
                this.camera.position.set(
                    this.world.width * 0.5,
                    1350,
                    -this.world.height * 0.5
                );
                this.controls.target.copy(this.initialTarget);
                this.controls.update();
            } else {
                this.resetCamera();
            }
        }

        dispose() {
            this.geometry.dispose();
            this.material.dispose();
            this.skeletonTexture.dispose();
            this.stateTexture.dispose();
            this.roadPoints.geometry.dispose();
            this.roadPoints.material.dispose();
            this.originRing.geometry.dispose();
            this.originRing.material.dispose();
            this.destinationRing.geometry.dispose();
            this.destinationRing.material.dispose();
            this.controls.dispose();
            this.renderer.dispose();
        }
    }

    return { PointCloudRenderer };
});
