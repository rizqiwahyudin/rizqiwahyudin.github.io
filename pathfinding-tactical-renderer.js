(function (root, factory) {
    root.TacticalInterferometryRenderer = factory(
        root.THREE,
        root.SymbioteGeometry,
        root.TacticalSymbols,
        root.PathfindingAnalytics
    );
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
    THREE,
    Geo,
    Symbols,
    Analytics
) {
    'use strict';

    const MAX_SIGNAL_VERTICES = 120000;

    class Renderer {
        constructor(canvas, graph) {
            this.canvas = canvas;
            this.graph = graph;
            this.scene = new THREE.Scene();
            this.renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: true,
                alpha: false,
                powerPreference: 'high-performance',
            });
            this.renderer.setClearColor(0x080a0b, 1);
            this.renderer.outputEncoding = THREE.sRGBEncoding;

            this.camera = new THREE.PerspectiveCamera(47, 1, 1, 5000);
            this.initialPosition = new THREE.Vector3(1120, 720, 520);
            this.target = new THREE.Vector3(800, 0, -450);
            this.camera.position.copy(this.initialPosition);
            this.controls = new THREE.OrbitControls(this.camera, canvas);
            this.controls.target.copy(this.target);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.07;
            this.controls.minDistance = 220;
            this.controls.maxDistance = 2500;
            this.controls.maxPolarAngle = Math.PI * 0.49;
            this.controls.update();

            const table = new THREE.Mesh(
                new THREE.PlaneGeometry(1800, 1100),
                new THREE.MeshBasicMaterial({
                    color: 0x0b0e10,
                    transparent: false,
                })
            );
            table.rotation.x = -Math.PI / 2;
            table.position.set(800, -1.5, -450);
            this.scene.add(table);

            const grid = new THREE.GridHelper(
                1800,
                36,
                0x2b3032,
                0x171b1d
            );
            grid.position.set(800, -0.9, -450);
            this.scene.add(grid);

            this.signalPositions = new Float32Array(
                MAX_SIGNAL_VERTICES * 3
            );
            this.signalColors = new Float32Array(
                MAX_SIGNAL_VERTICES * 3
            );
            this.signalGeometry = new THREE.BufferGeometry();
            this.signalGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(
                    this.signalPositions,
                    3
                ).setUsage(THREE.DynamicDrawUsage)
            );
            this.signalGeometry.setAttribute(
                'color',
                new THREE.BufferAttribute(
                    this.signalColors,
                    3
                ).setUsage(THREE.DynamicDrawUsage)
            );
            this.signalGeometry.setDrawRange(0, 0);
            this.signalMaterial = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.94,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });
            this.signals = new THREE.LineSegments(
                this.signalGeometry,
                this.signalMaterial
            );
            this.signals.frustumCulled = false;
            this.signals.renderOrder = 4;
            this.scene.add(this.signals);

            this.nodeGeometry = new THREE.BufferGeometry();
            this.nodePositions = new Float32Array(
                Object.keys(graph.nodes).length * 3
            );
            this.nodeColors = new Float32Array(
                Object.keys(graph.nodes).length * 3
            );
            this.nodeGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(
                    this.nodePositions,
                    3
                ).setUsage(THREE.DynamicDrawUsage)
            );
            this.nodeGeometry.setAttribute(
                'color',
                new THREE.BufferAttribute(
                    this.nodeColors,
                    3
                ).setUsage(THREE.DynamicDrawUsage)
            );
            this.nodeMaterial = new THREE.PointsMaterial({
                size: 4,
                sizeAttenuation: true,
                vertexColors: true,
                transparent: true,
                opacity: 0.95,
            });
            this.nodes = new THREE.Points(
                this.nodeGeometry,
                this.nodeMaterial
            );
            this.nodes.frustumCulled = false;
            this.scene.add(this.nodes);

            this.conductors = null;
            this.buildConductors();

            this.contourGroup = new THREE.Group();
            this.scene.add(this.contourGroup);
            this.guidance = new THREE.LineSegments(
                new THREE.BufferGeometry(),
                new THREE.LineBasicMaterial({
                    color: 0x5c7f95,
                    transparent: true,
                    opacity: 0.27,
                    depthWrite: false,
                })
            );
            this.scene.add(this.guidance);

            this.scanPlane = new THREE.Mesh(
                new THREE.PlaneGeometry(900, 260),
                new THREE.MeshBasicMaterial({
                    color: 0xb6d9e8,
                    transparent: true,
                    opacity: 0.07,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                })
            );
            this.scanPlane.position.set(0, 128, -450);
            this.scanPlane.rotation.y = Math.PI / 2;
            this.scene.add(this.scanPlane);

            this.originSymbol = this.createSymbol(
                Symbols.ring(13),
                0xdce5e7
            );
            this.destinationSymbol = this.createSymbol(
                Symbols.reticle(15),
                0xf0b35a
            );
            this.selectedSymbol = this.createSymbol(
                Symbols.reticle(10),
                0xd66a4a
            );
            this.selectedSymbol.visible = false;
            this.scene.add(
                this.originSymbol,
                this.destinationSymbol,
                this.selectedSymbol
            );

            this.raycaster = new THREE.Raycaster();
            this.groundPlane = new THREE.Plane(
                new THREE.Vector3(0, 1, 0),
                0
            );
            this.tmpHit = new THREE.Vector3();
            this.lastContourMode = null;
        }

        createSymbol(geometry, color) {
            const line = new THREE.LineSegments(
                geometry,
                new THREE.LineBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.95,
                })
            );
            line.frustumCulled = false;
            return line;
        }

        buildConductors() {
            if (this.conductors) {
                this.scene.remove(this.conductors);
                this.conductors.geometry.dispose();
                this.conductors.material.dispose();
            }
            const positions = [];
            const colors = [];
            for (const edge of this.graph.edges) {
                const spine = Geo.quadraticSpine(
                    edge,
                    this.graph.nodes,
                    edge.a,
                    8
                );
                const color = edge.blocked
                    ? [0.72, 0.16, 0.08]
                    : edge.preferred
                      ? [0.62, 0.72, 0.76]
                      : edge.resistance > 1
                        ? [0.62, 0.28, 0.12]
                        : [0.25, 0.29, 0.3];
                for (let index = 0; index < spine.length / 2 - 1; index++) {
                    positions.push(
                        spine[index * 2],
                        0,
                        -spine[index * 2 + 1],
                        spine[index * 2 + 2],
                        0,
                        -spine[index * 2 + 3]
                    );
                    colors.push(...color, ...color);
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
            const material = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.82,
            });
            this.conductors = new THREE.LineSegments(
                geometry,
                material
            );
            this.conductors.renderOrder = 1;
            this.scene.add(this.conductors);
        }

        setGraph(graph) {
            this.graph = graph;
            this.lastContourMode = null;
            this.buildConductors();
        }

        resetCamera() {
            this.camera.position.copy(this.initialPosition);
            this.controls.target.copy(this.target);
            this.controls.update();
        }

        topView() {
            this.camera.position.set(800, 1450, -449);
            this.controls.target.copy(this.target);
            this.controls.update();
        }

        sideView() {
            this.camera.position.set(800, 240, 900);
            this.controls.target.copy(this.target);
            this.controls.update();
        }

        resize(width, height) {
            const budget = 5200000;
            const ratio = Math.sqrt(budget / Math.max(1, width * height));
            this.renderer.setPixelRatio(
                Math.max(
                    1,
                    Math.min(window.devicePixelRatio || 1, 2, ratio)
                )
            );
            this.renderer.setSize(width, height, false);
            this.camera.aspect = width / Math.max(1, height);
            this.camera.updateProjectionMatrix();
        }

        writeSignal(index, point, color) {
            if (index >= MAX_SIGNAL_VERTICES) return index;
            this.signalPositions[index * 3] = point.x;
            this.signalPositions[index * 3 + 1] = point.y;
            this.signalPositions[index * 3 + 2] = point.z;
            this.signalColors[index * 3] = color[0];
            this.signalColors[index * 3 + 1] = color[1];
            this.signalColors[index * 3 + 2] = color[2];
            return index + 1;
        }

        signalColor(edgeState, snapshot, currentIndex, timeline) {
            if (edgeState.route && snapshot.routeFound) {
                const locked = Analytics.carrierLocked(
                    timeline.result.edgeIds.indexOf(edgeState.edgeId),
                    timeline.result.edgeIds.length,
                    snapshot.carrierLock
                )
                    ? 1
                    : 0;
                return [
                    0.74 + locked * 0.18,
                    0.8 + locked * 0.16,
                    0.82 + locked * 0.16,
                ];
            }
            if (edgeState.settledAt !== null) {
                return [0.55, 0.62, 0.64];
            }
            if (
                edgeState.discoveredAt !== null &&
                edgeState.discoveredAt < currentIndex
            ) {
                return [0.95, 0.52, 0.12];
            }
            return [0.16, 0.2, 0.21];
        }

        signalHot(edgeState, snapshot) {
            if (edgeState.settledAt === null) return true;
            return (
                edgeState.route &&
                snapshot.routeFound &&
                snapshot.carrierLock < 1
            );
        }

        signalFrequency(edge, hot) {
            return hot
                ? 2.4 + Math.min(4.2, edge.effectiveCost / 20)
                : 1.5 + Math.min(2.0, edge.effectiveCost / 30);
        }

        signalSubdivisions(edge, hot) {
            const frequency = this.signalFrequency(edge, hot);
            const samplesPerCycle = hot ? 16 : 8;
            const minimum = hot ? 36 : 18;
            return Math.max(
                minimum,
                Math.round(frequency * samplesPerCycle)
            );
        }

        allocateSubdivisions(active, snapshot) {
            const groups = [
                active.filter(edgeState =>
                    this.signalHot(edgeState, snapshot)
                ),
                active.filter(
                    edgeState => !this.signalHot(edgeState, snapshot)
                ),
            ];
            const floors = [28, 14];
            const subdivisions = new Map();
            let remaining = MAX_SIGNAL_VERTICES;
            groups.forEach((group, groupIndex) => {
                if (!group.length || remaining < floors[groupIndex] * 2) {
                    return;
                }
                let need = 0;
                const desired = group.map(edgeState => {
                    const count = this.signalSubdivisions(
                        this.graph.edges[edgeState.edgeId],
                        groupIndex === 0
                    );
                    need += count * 2;
                    return count;
                });
                const scale = need > remaining ? remaining / need : 1;
                group.forEach((edgeState, index) => {
                    const count = Math.max(
                        floors[groupIndex],
                        Math.round(desired[index] * scale)
                    );
                    subdivisions.set(edgeState.edgeId, count);
                    remaining -= count * 2;
                });
            });
            return subdivisions;
        }

        buildSignals(snapshot, timeline, time) {
            const active = [];
            for (const edgeState of snapshot.edges) {
                if (edgeState.discoveredAt === null) continue;
                active.push(edgeState);
            }
            const subdivisionsByEdge = this.allocateSubdivisions(
                active,
                snapshot
            );

            let cursor = 0;
            for (const edgeState of active) {
                const edge = this.graph.edges[edgeState.edgeId];
                const a = this.graph.nodes[edge.a];
                const b = this.graph.nodes[edge.b];
                const hot = this.signalHot(edgeState, snapshot);
                const color = this.signalColor(
                    edgeState,
                    snapshot,
                    snapshot.eventIndex,
                    timeline
                );
                const fHeight =
                    timeline.normalize(edgeState.f, 'f') * 190;
                const settledFactor =
                    edgeState.settledAt !== null ? 0.42 : 1;
                let routeFactor = 1;
                if (edgeState.route && snapshot.routeFound) {
                    const locked = Analytics.carrierLocked(
                        timeline.result.edgeIds.indexOf(edgeState.edgeId),
                        timeline.result.edgeIds.length,
                        snapshot.carrierLock
                    );
                    routeFactor = locked ? 0.12 : 1;
                }
                const height =
                    4 + fHeight * settledFactor * routeFactor;
                const frequency = this.signalFrequency(edge, hot);
                const amplitude =
                    edgeState.route && snapshot.routeFound
                        ? 2.5
                        : 5 + edgeState.amplitude * 9;
                const subdivisions =
                    subdivisionsByEdge.get(edgeState.edgeId) || 16;
                const dx = b.x - a.x;
                const dz = -(b.y - a.y);
                const length = Math.max(0.001, Math.hypot(dx, dz));
                const nx = -dz / length;
                const nz = dx / length;
                let previous = null;
                for (let sample = 0; sample <= subdivisions; sample++) {
                    const t = sample / subdivisions;
                    const x = a.x + (b.x - a.x) * t;
                    const z = -(a.y + (b.y - a.y) * t);
                    const phase =
                        time * 0.004 -
                        t * frequency * Math.PI * 2 +
                        edgeState.phase * 0.19;
                    const wave = Math.sin(phase) * amplitude;
                    const point = {
                        x: x + nx * wave,
                        y: height + wave * 0.22,
                        z: z + nz * wave,
                    };
                    if (previous) {
                        cursor = this.writeSignal(
                            cursor,
                            previous,
                            color
                        );
                        cursor = this.writeSignal(cursor, point, color);
                    }
                    previous = point;
                }
            }
            this.signalGeometry.setDrawRange(0, cursor);
            this.signalGeometry.attributes.position.needsUpdate = true;
            this.signalGeometry.attributes.color.needsUpdate = true;
        }

        updateNodes(snapshot, timeline) {
            let index = 0;
            for (const node of Object.values(this.graph.nodes)) {
                const state = snapshot.nodes[node.id];
                this.nodePositions[index * 3] = node.x;
                this.nodePositions[index * 3 + 1] =
                    state.f === null
                        ? 0.8
                        : 2 + timeline.normalize(state.f, 'f') * 190;
                this.nodePositions[index * 3 + 2] = -node.y;
                const color =
                    state.queueState === 'settled'
                        ? [0.78, 0.84, 0.85]
                        : state.queueState === 'frontier'
                          ? [1, 0.55, 0.12]
                          : [0.13, 0.16, 0.17];
                this.nodeColors[index * 3] = color[0];
                this.nodeColors[index * 3 + 1] = color[1];
                this.nodeColors[index * 3 + 2] = color[2];
                index++;
            }
            this.nodeGeometry.attributes.position.needsUpdate = true;
            this.nodeGeometry.attributes.color.needsUpdate = true;
        }

        rebuildContours(mode, snapshot, timeline) {
            const key = `${mode}:${Math.floor(snapshot.eventIndex / 12)}:${snapshot.settledCount}`;
            if (key === this.lastContourMode) return;
            this.lastContourMode = key;
            while (this.contourGroup.children.length) {
                const child = this.contourGroup.children.pop();
                child.geometry.dispose();
                child.material.dispose();
            }
            if (mode === 'off') return;
            const max =
                mode === 'g'
                    ? timeline.maxG
                    : mode === 'h'
                      ? timeline.maxH
                      : timeline.maxF;
            for (let band = 1; band <= 7; band++) {
                const threshold = (band / 7) * max;
                const positions = [];
                for (const edge of this.graph.edges) {
                    const a = this.graph.nodes[edge.a];
                    const b = this.graph.nodes[edge.b];
                    const crossing = Analytics.isolineCrossing(
                        a.x,
                        a.y,
                        snapshot.nodes[edge.a][mode],
                        b.x,
                        b.y,
                        snapshot.nodes[edge.b][mode],
                        threshold
                    );
                    if (!crossing) continue;
                    const dx = b.x - a.x;
                    const dz = -(b.y - a.y);
                    const length = Math.max(0.001, Math.hypot(dx, dz));
                    const nx = -dz / length;
                    const nz = dx / length;
                    const half = 5.5;
                    const x = crossing.x;
                    const z = -crossing.y;
                    positions.push(
                        x - nx * half,
                        1,
                        z - nz * half,
                        x + nx * half,
                        1,
                        z + nz * half
                    );
                }
                if (!positions.length) continue;
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute(
                    'position',
                    new THREE.Float32BufferAttribute(positions, 3)
                );
                const line = new THREE.LineSegments(
                    geometry,
                    new THREE.LineBasicMaterial({
                        color:
                            mode === 'h'
                                ? 0x58748a
                                : 0x4d5659,
                        transparent: true,
                        opacity: 0.32,
                    })
                );
                this.contourGroup.add(line);
            }
        }

        updateGuidance(snapshot, destinationId, algorithm) {
            if (algorithm !== 'astar') {
                this.guidance.geometry.setDrawRange(0, 0);
                return;
            }
            const destination = this.graph.nodes[destinationId];
            const positions = [];
            let count = 0;
            for (const node of Object.values(this.graph.nodes)) {
                const state = snapshot.nodes[node.id];
                if (state.queueState !== 'frontier') continue;
                if (count++ > 80) break;
                positions.push(
                    node.x,
                    3,
                    -node.y,
                    destination.x,
                    3,
                    -destination.y
                );
            }
            this.guidance.geometry.dispose();
            this.guidance.geometry = new THREE.BufferGeometry();
            this.guidance.geometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(positions, 3)
            );
        }

        render(options) {
            const {
                snapshot,
                timeline,
                time,
                algorithm,
                contourMode,
                scanVisible,
                selectedEdgeId,
                originId,
                destinationId,
            } = options;
            this.buildSignals(snapshot, timeline, time);
            this.updateNodes(snapshot, timeline);
            this.rebuildContours(contourMode, snapshot, timeline);
            this.updateGuidance(snapshot, destinationId, algorithm);

            const origin = this.graph.nodes[originId];
            const destination = this.graph.nodes[destinationId];
            this.originSymbol.position.set(origin.x, 1.5, -origin.y);
            this.destinationSymbol.position.set(
                destination.x,
                1.5,
                -destination.y
            );
            this.scanPlane.visible = scanVisible;
            this.scanPlane.position.x =
                (snapshot.eventIndex /
                    Math.max(1, timeline.events.length)) *
                1600;

            if (selectedEdgeId !== null) {
                const edge = this.graph.edges[selectedEdgeId];
                const a = this.graph.nodes[edge.a];
                const b = this.graph.nodes[edge.b];
                this.selectedSymbol.visible = true;
                this.selectedSymbol.position.set(
                    (a.x + b.x) * 0.5,
                    2,
                    -(a.y + b.y) * 0.5
                );
            } else {
                this.selectedSymbol.visible = false;
            }

            this.controls.update();
            this.renderer.render(this.scene, this.camera);
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
            return hit ? { x: hit.x, y: -hit.z } : null;
        }

        nearestEdge(point) {
            let bestId = null;
            let bestDistance = Infinity;
            for (const edge of this.graph.edges) {
                const a = this.graph.nodes[edge.a];
                const b = this.graph.nodes[edge.b];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const lengthSquared = dx * dx + dy * dy || 1;
                const t = Math.max(
                    0,
                    Math.min(
                        1,
                        ((point.x - a.x) * dx +
                            (point.y - a.y) * dy) /
                            lengthSquared
                    )
                );
                const x = a.x + dx * t;
                const y = a.y + dy * t;
                const distance = (point.x - x) ** 2 + (point.y - y) ** 2;
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestId = edge.id;
                }
            }
            return bestId;
        }

        dispose() {
            this.signalGeometry.dispose();
            this.signalMaterial.dispose();
            this.nodeGeometry.dispose();
            this.nodeMaterial.dispose();
            this.conductors.geometry.dispose();
            this.conductors.material.dispose();
            this.controls.dispose();
            this.renderer.dispose();
        }
    }

    return { Renderer };
});
