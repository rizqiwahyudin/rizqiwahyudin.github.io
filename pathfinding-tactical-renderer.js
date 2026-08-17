(function (root, factory) {
    root.TacticalInterferometryRenderer = factory(
        root.THREE,
        root.SymbioteGeometry,
        root.TacticalSymbols
    );
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
    THREE,
    Geo,
    Symbols
) {
    'use strict';

    const MAX_SIGNAL_VERTICES = 48000;

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
            this.target = new THREE.Vector3(800, 0, -450);
            this.initialPosition = new THREE.Vector3(1120, 720, 520);
            this.camera.position.copy(this.initialPosition);
            this.controls = new THREE.OrbitControls(this.camera, canvas);
            this.controls.target.copy(this.target);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.07;
            this.controls.minDistance = 220;
            this.controls.maxDistance = 2500;
            this.controls.maxPolarAngle = Math.PI * 0.49;
            this.controls.update();

            this.table = null;
            this.grid = null;
            this.world = {
                cx: 800,
                cy: 450,
                width: 1800,
                height: 1100,
                span: 1800,
            };
            this.loadedSignature = '';

            this.signalPositions = new Float32Array(MAX_SIGNAL_VERTICES * 3);
            this.signalColors = new Float32Array(MAX_SIGNAL_VERTICES * 3);
            this.signalGeometry = new THREE.BufferGeometry();
            this.signalGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(this.signalPositions, 3).setUsage(
                    THREE.DynamicDrawUsage
                )
            );
            this.signalGeometry.setAttribute(
                'color',
                new THREE.BufferAttribute(this.signalColors, 3).setUsage(
                    THREE.DynamicDrawUsage
                )
            );
            this.signalGeometry.setDrawRange(0, 0);
            this.signalMaterial = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.96,
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
            this.nodePositions = new Float32Array(0);
            this.nodeColors = new Float32Array(0);
            this.nodeMaterial = new THREE.PointsMaterial({
                size: 8,
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
            this.applyGraph(graph, true);

            this.ghost = new THREE.LineSegments(
                new THREE.BufferGeometry(),
                new THREE.LineBasicMaterial({
                    color: 0xb08a5a,
                    transparent: true,
                    opacity: 0.55,
                    depthWrite: false,
                })
            );
            this.ghost.visible = false;
            this.scene.add(this.ghost);

            this.guidance = new THREE.Line(
                new THREE.BufferGeometry(),
                new THREE.LineBasicMaterial({
                    color: 0x8eb0c0,
                    transparent: true,
                    opacity: 0.85,
                    depthWrite: false,
                })
            );
            this.guidance.visible = false;
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
            this.scanPlane.position.set(this.world.cx, 128, -this.world.cy);
            this.scanPlane.rotation.y = Math.PI / 2;
            this.scanPlane.visible = false;
            this.scene.add(this.scanPlane);

            this.originSymbol = this.createSymbol(Symbols.ring(13), 0xdce5e7);
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

            this.cardGroup = new THREE.Group();
            this.scene.add(this.cardGroup);
            this.notes = [];
            this.notesVisible = false;

            this.raycaster = new THREE.Raycaster();
            this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            this.tmpHit = new THREE.Vector3();
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

        describeGraph(graph) {
            return [
                graph.source || graph.seed || 'synthetic',
                graph.lat || '',
                graph.lon || '',
                Object.keys(graph.nodes).length,
                graph.edges.length,
            ].join('|');
        }

        computeBounds(graph) {
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;
            for (const node of Object.values(graph.nodes)) {
                minX = Math.min(minX, node.x);
                maxX = Math.max(maxX, node.x);
                minY = Math.min(minY, node.y);
                maxY = Math.max(maxY, node.y);
            }
            if (!Number.isFinite(minX)) {
                minX = 0;
                maxX = 1600;
                minY = 0;
                maxY = 900;
            }
            const pad = 90;
            const width = Math.max(400, maxX - minX + pad * 2);
            const height = Math.max(300, maxY - minY + pad * 2);
            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;
            return {
                minX: minX - pad,
                maxX: maxX + pad,
                minY: minY - pad,
                maxY: maxY + pad,
                cx,
                cy,
                width,
                height,
                span: Math.max(width, height),
            };
        }

        disposeObject(object) {
            if (!object) return;
            this.scene.remove(object);
            if (object.geometry) object.geometry.dispose();
            if (Array.isArray(object.material)) {
                object.material.forEach(material => material.dispose());
            } else if (object.material) {
                object.material.dispose();
            }
        }

        applyBounds(resetCamera) {
            const bounds = this.computeBounds(this.graph);
            this.world = bounds;
            this.target.set(bounds.cx, 0, -bounds.cy);
            this.controls.target.copy(this.target);
            this.controls.minDistance = Math.max(80, bounds.span * 0.12);
            this.controls.maxDistance = Math.max(2500, bounds.span * 3.4);
            this.camera.near = Math.max(1, bounds.span * 0.002);
            this.camera.far = Math.max(5000, bounds.span * 6);
            this.camera.updateProjectionMatrix();

            this.disposeObject(this.table);
            this.table = new THREE.Mesh(
                new THREE.PlaneGeometry(bounds.width, bounds.height),
                new THREE.MeshBasicMaterial({ color: 0x0b0e10 })
            );
            this.table.rotation.x = -Math.PI / 2;
            this.table.position.set(bounds.cx, -1.5, -bounds.cy);
            this.scene.add(this.table);

            this.disposeObject(this.grid);
            this.grid = new THREE.GridHelper(
                bounds.span,
                36,
                0x2b3032,
                0x171b1d
            );
            this.grid.position.set(bounds.cx, -0.9, -bounds.cy);
            this.scene.add(this.grid);

            if (this.scanPlane) {
                this.scanPlane.position.set(bounds.cx, 128, -bounds.cy);
                this.scanPlane.scale.set(
                    Math.max(0.4, bounds.height / 900),
                    Math.max(0.4, bounds.span / 1600),
                    1
                );
            }

            const distance = Math.max(720, bounds.span * 0.78);
            const yaw = Math.PI / 4;
            const pitch = Math.atan(1 / Math.sqrt(2));
            this.initialPosition.set(
                bounds.cx + distance * Math.cos(pitch) * Math.sin(yaw),
                distance * Math.sin(pitch),
                -bounds.cy + distance * Math.cos(pitch) * Math.cos(yaw)
            );
            if (resetCamera) this.isoView();
        }

        rebuildNodes() {
            this.nodeGeometry.dispose();
            const count = Object.keys(this.graph.nodes).length;
            this.nodePositions = new Float32Array(count * 3);
            this.nodeColors = new Float32Array(count * 3);
            this.nodeGeometry = new THREE.BufferGeometry();
            this.nodeGeometry.setAttribute(
                'position',
                new THREE.BufferAttribute(this.nodePositions, 3).setUsage(
                    THREE.DynamicDrawUsage
                )
            );
            this.nodeGeometry.setAttribute(
                'color',
                new THREE.BufferAttribute(this.nodeColors, 3).setUsage(
                    THREE.DynamicDrawUsage
                )
            );
            this.nodes.geometry = this.nodeGeometry;
            const span = this.world ? this.world.span : 1600;
            this.nodeMaterial.size = Math.max(
                5,
                Math.min(11, span * 0.006)
            );
        }

        applyGraph(graph, resetCamera) {
            this.graph = graph;
            const signature = this.describeGraph(graph);
            const boundsChanged = signature !== this.loadedSignature;
            this.loadedSignature = signature;
            this.rebuildNodes();
            this.buildConductors();
            if (resetCamera || boundsChanged) this.applyBounds(true);
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
            this.conductors = new THREE.LineSegments(
                geometry,
                new THREE.LineBasicMaterial({
                    vertexColors: true,
                    transparent: true,
                    opacity: 0.82,
                })
            );
            this.conductors.renderOrder = 1;
            this.scene.add(this.conductors);
        }

        setGraph(graph) {
            this.applyGraph(graph, false);
        }

        setGhost(edgeIds) {
            if (this.ghost.geometry) this.ghost.geometry.dispose();
            if (!edgeIds || !edgeIds.length) {
                this.ghost.visible = false;
                this.ghost.geometry = new THREE.BufferGeometry();
                return;
            }
            const positions = [];
            for (const edgeId of edgeIds) {
                const edge = this.graph.edges[edgeId];
                if (!edge) continue;
                const a = this.graph.nodes[edge.a];
                const b = this.graph.nodes[edge.b];
                positions.push(a.x, 4.5, -a.y, b.x, 4.5, -b.y);
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(positions, 3)
            );
            geometry.computeLineDistances();
            this.ghost.geometry = geometry;
            this.ghost.visible = true;
        }

        resetCamera() {
            this.camera.position.copy(this.initialPosition);
            this.controls.target.copy(this.target);
            this.controls.update();
        }

        topView() {
            const span = this.world.span;
            this.camera.position.set(
                this.world.cx,
                Math.max(900, span * 1.05),
                -this.world.cy + 0.01
            );
            this.controls.target.copy(this.target);
            this.controls.update();
        }

        sideView() {
            const span = this.world.span;
            this.camera.position.set(
                this.world.cx,
                Math.max(160, span * 0.16),
                -this.world.cy + Math.max(420, span * 0.62)
            );
            this.controls.target.copy(this.target);
            this.controls.update();
        }

        isoView() {
            this.camera.position.copy(this.initialPosition);
            this.controls.target.copy(this.target);
            this.controls.update();
        }

        resize(width, height) {
            const budget = 5200000;
            const ratio = Math.sqrt(budget / Math.max(1, width * height));
            this.renderer.setPixelRatio(
                Math.max(1, Math.min(window.devicePixelRatio || 1, 2, ratio))
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

        buildSignals(snapshot, time) {
            let cursor = 0;
            for (const edgeState of snapshot.edges) {
                if (edgeState.discoveredAt === null) continue;
                const edge = this.graph.edges[edgeState.edgeId];
                const a = this.graph.nodes[edge.a];
                const b = this.graph.nodes[edge.b];
                const highlighted =
                    edgeState.route && snapshot.routeFound;
                const frontier =
                    !highlighted && edgeState.settledAt === null;
                const color = highlighted
                    ? [0.9, 0.94, 0.95]
                    : frontier
                      ? [0.94, 0.61, 0.21]
                      : [0.62, 0.68, 0.7];
                const pulse = frontier
                    ? 0.55 + 0.45 * Math.sin(time * 0.008)
                    : 1;
                const lit = [
                    color[0] * pulse,
                    color[1] * pulse,
                    color[2] * pulse,
                ];
                const height = highlighted ? 2.8 : frontier ? 4.2 : 1.8;
                const samples = 10;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const length = Math.max(0.001, Math.hypot(dx, dy));
                const ox = (-dy / length) * (frontier ? 2.4 : 1.4);
                const oz = (dx / length) * (frontier ? 2.4 : 1.4);
                for (const offset of [0, 1, -1]) {
                    let previous = null;
                    for (let sample = 0; sample <= samples; sample++) {
                        const t = sample / samples;
                        const point = {
                            x: a.x + dx * t + ox * offset,
                            y: height,
                            z: -(a.y + dy * t) + oz * offset,
                        };
                        if (previous) {
                            cursor = this.writeSignal(cursor, previous, lit);
                            cursor = this.writeSignal(cursor, point, lit);
                        }
                        previous = point;
                    }
                }
            }
            this.signalGeometry.setDrawRange(0, cursor);
            this.signalGeometry.attributes.position.needsUpdate = true;
            this.signalGeometry.attributes.color.needsUpdate = true;
        }

        updateNodes(snapshot) {
            let index = 0;
            for (const node of Object.values(this.graph.nodes)) {
                const state = snapshot.nodes[node.id];
                this.nodePositions[index * 3] = node.x;
                this.nodePositions[index * 3 + 1] = 1.4;
                this.nodePositions[index * 3 + 2] = -node.y;
                const color =
                    state.queueState === 'frontier'
                        ? [1, 0.55, 0.12]
                        : state.queueState === 'settled'
                          ? snapshot.routeFound
                            ? [0.88, 0.92, 0.93]
                            : [0.7, 0.76, 0.77]
                          : [0.13, 0.16, 0.17];
                this.nodeColors[index * 3] = color[0];
                this.nodeColors[index * 3 + 1] = color[1];
                this.nodeColors[index * 3 + 2] = color[2];
                index++;
            }
            this.nodeGeometry.attributes.position.needsUpdate = true;
            this.nodeGeometry.attributes.color.needsUpdate = true;
        }

        updateGuidance(snapshot, destinationId, algorithm) {
            if (algorithm !== 'astar' || !snapshot.frontierNodeId) {
                this.guidance.visible = false;
                return;
            }
            const origin = this.graph.nodes[snapshot.frontierNodeId];
            const destination = this.graph.nodes[destinationId];
            if (!origin || !destination) {
                this.guidance.visible = false;
                return;
            }
            const positions = [
                origin.x,
                3,
                -origin.y,
                destination.x,
                3,
                -destination.y,
            ];
            this.guidance.geometry.dispose();
            this.guidance.geometry = new THREE.BufferGeometry();
            this.guidance.geometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(positions, 3)
            );
            this.guidance.visible = true;
        }

        makeCardTexture(title, body) {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 192;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'rgba(10, 13, 14, 0.92)';
            ctx.strokeStyle = 'rgba(217, 225, 226, 0.28)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.rect(6, 6, 500, 180);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ef9b35';
            ctx.font = '28px monospace';
            ctx.fillText(title, 28, 58);
            ctx.fillStyle = 'rgba(217, 225, 226, 0.78)';
            ctx.font = '22px monospace';
            const words = String(body).split(' ');
            let line = '';
            let y = 104;
            for (const word of words) {
                const next = line ? `${line} ${word}` : word;
                if (ctx.measureText(next).width > 450) {
                    ctx.fillText(line, 28, y);
                    line = word;
                    y += 32;
                } else {
                    line = next;
                }
            }
            if (line) ctx.fillText(line, 28, y);
            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            return texture;
        }

        setNotes(notes) {
            while (this.cardGroup.children.length) {
                const child = this.cardGroup.children[0];
                this.cardGroup.remove(child);
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
                if (child.geometry) child.geometry.dispose();
            }
            this.notes = notes || [];
            this.notes.forEach((note, index) => {
                const lift = 96;
                const slot = index - (this.notes.length - 1) / 2;
                const cx = this.world.cx;
                const cy = this.world.cy;
                const cardX = note.x + (cx - note.x) * 0.18 + slot * 110;
                const cardZ = -note.y + (-cy + note.y) * 0.18;
                const texture = this.makeCardTexture(note.title, note.body);
                const sprite = new THREE.Sprite(
                    new THREE.SpriteMaterial({
                        map: texture,
                        transparent: true,
                        depthTest: false,
                        sizeAttenuation: true,
                    })
                );
                sprite.scale.set(360, 135, 1);
                sprite.position.set(cardX, lift, cardZ);
                sprite.renderOrder = 20;
                sprite.userData.anchor = {
                    x: note.x,
                    y: 1.6,
                    z: -note.y,
                };
                this.cardGroup.add(sprite);

                const leader = new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(note.x, 1.6, -note.y),
                        new THREE.Vector3(cardX, lift - 4, cardZ),
                    ]),
                    new THREE.LineBasicMaterial({
                        color: 0xd5e0e2,
                        transparent: true,
                        opacity: 0.72,
                        depthWrite: false,
                    })
                );
                leader.renderOrder = 19;
                this.cardGroup.add(leader);
            });
            this.cardGroup.visible = this.notesVisible;
        }

        setNotesVisible(visible) {
            this.notesVisible = visible;
            this.cardGroup.visible = visible && this.notes.length > 0;
        }

        render(options) {
            const {
                snapshot,
                time,
                algorithm,
                scanVisible,
                selectedEdgeId,
                originId,
                destinationId,
            } = options;
            this.buildSignals(snapshot, time);
            this.updateNodes(snapshot);
            this.updateGuidance(snapshot, destinationId, algorithm);

            const origin = this.graph.nodes[originId];
            const destination = this.graph.nodes[destinationId];
            this.originSymbol.position.set(origin.x, 1.5, -origin.y);
            this.destinationSymbol.position.set(
                destination.x,
                1.5,
                -destination.y
            );
            this.scanPlane.visible = Boolean(scanVisible);

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
                        ((point.x - a.x) * dx + (point.y - a.y) * dy) /
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
            this.setNotes([]);
            this.signalGeometry.dispose();
            this.signalMaterial.dispose();
            this.nodeGeometry.dispose();
            this.nodeMaterial.dispose();
            this.disposeObject(this.table);
            this.disposeObject(this.grid);
            this.conductors.geometry.dispose();
            this.conductors.material.dispose();
            this.ghost.geometry.dispose();
            this.ghost.material.dispose();
            this.guidance.geometry.dispose();
            this.guidance.material.dispose();
            this.controls.dispose();
            this.renderer.dispose();
        }
    }

    return { Renderer };
});
