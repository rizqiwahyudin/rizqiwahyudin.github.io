(function () {
    'use strict';

    const canvas = document.getElementById('scene');
    const ui = {
        state: document.getElementById('state'),
        algorithm: document.getElementById('algorithm-stat'),
        visited: document.getElementById('visited'),
        tendrils: document.getElementById('tendrils'),
        quality: document.getElementById('quality'),
        points: document.getElementById('points'),
        cost: document.getElementById('cost'),
        astar: document.getElementById('astar'),
        dijkstra: document.getElementById('dijkstra'),
        run: document.getElementById('run'),
        random: document.getElementById('random'),
        pause: document.getElementById('pause'),
        resetView: document.getElementById('reset-view'),
        topView: document.getElementById('top-view'),
        speed: document.getElementById('speed'),
        creep: document.getElementById('creep'),
        unsupported: document.getElementById('unsupported'),
    };

    const WORLD = { width: 1600, height: 900, marginX: 90, marginY: 80 };
    const ROAD_STYLE = {
        artery: { speed: 2.2 },
        street: { speed: 1.35 },
        alley: { speed: 0.92 },
        track: { speed: 0.62 },
    };
    let graph;
    let view;
    let simulation;
    let originId = '2:13';
    let destinationId = '26:3';
    let selecting = 'origin';
    let algorithm = 'astar';
    let paused = false;
    let hidden = document.hidden;
    let simulationTime = 0;
    let lastFrame = performance.now();
    let lastRenderAt = 0;
    let lastRenderSimulationTime = 0;
    let lastPhase = 'idle';
    let pointerStart = null;
    let topView = false;

    function mulberry32(seed) {
        return function random() {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function createGraph(seed) {
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
            edges.push({ id, a: aId, b: bId, kind, distance, bend });
            const cost = distance / ROAD_STYLE[kind].speed;
            adjacency[aId].push({ to: bId, edgeId: id, cost });
            adjacency[bId].push({ to: aId, edgeId: id, cost });
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
            nodes,
            adjacency,
            edges,
            cols,
            rows,
            heuristicScale: 1 / maximumSpeed,
        };
    }

    function update(deltaSeconds) {
        if (paused || hidden || !simulation.result) return;
        simulation.update(
            deltaSeconds,
            simulationTime,
            Number(ui.speed.value)
        );
        ui.visited.textContent = simulation.settledCount;
        if (simulation.phase !== lastPhase) {
            lastPhase = simulation.phase;
            if (simulation.phase === 'resolved') {
                ui.state.textContent = 'route bonded';
                ui.cost.textContent = `${Math.round(simulation.routeCost)} units`;
            } else if (simulation.phase === 'failed') {
                ui.state.textContent = 'no connection';
            }
        }
    }

    function render(deltaSeconds) {
        const metrics = view.render(
            simulation.frame(originId, destinationId, simulationTime),
            simulationTime,
            deltaSeconds,
            Number(ui.creep.value) / 100
        );
        ui.tendrils.textContent = metrics.visibleCount;
        ui.quality.textContent = [
            'adaptive low',
            'adaptive medium',
            'full',
        ][metrics.quality];
        ui.points.textContent = metrics.points.toLocaleString();
    }

    function animate(now) {
        requestAnimationFrame(animate);
        const rawDelta = Math.max(0, now - lastFrame);
        lastFrame = now;
        if (hidden || !view) return;
        if (!paused) {
            simulationTime += rawDelta;
            update(rawDelta / 1000);
        }
        const interval = 1000 / 60;
        if (lastRenderAt === 0) lastRenderAt = now - interval;
        if (now - lastRenderAt < interval) return;
        const renderDelta = Math.min(
            1 / 20,
            Math.max(
                0,
                (simulationTime - lastRenderSimulationTime) / 1000
            )
        );
        lastRenderAt += interval;
        if (now - lastRenderAt > interval * 2) lastRenderAt = now;
        lastRenderSimulationTime = simulationTime;
        render(paused ? 0 : renderDelta);
    }

    function runSearch() {
        simulation.start(originId, destinationId, algorithm);
        lastPhase = 'searching';
        paused = false;
        view.reset();
        ui.state.textContent = 'propagating';
        ui.visited.textContent = '0';
        ui.tendrils.textContent = '0';
        ui.points.textContent = '0';
        ui.cost.textContent = '--';
        ui.pause.textContent = 'pause';
    }

    function setAlgorithm(next) {
        algorithm = next;
        ui.astar.classList.toggle('active', algorithm === 'astar');
        ui.dijkstra.classList.toggle('active', algorithm === 'dijkstra');
        ui.algorithm.textContent = algorithm === 'astar' ? 'a*' : 'dijkstra';
        runSearch();
    }

    function randomEndpoints() {
        const random = mulberry32(
            Math.floor(performance.now() * 1000) ^ 32841
        );
        const left = 1 + Math.floor(random() * 5);
        const right = graph.cols - 2 - Math.floor(random() * 5);
        originId = `${left}:${1 + Math.floor(random() * (graph.rows - 2))}`;
        destinationId = `${right}:${1 + Math.floor(random() * (graph.rows - 2))}`;
        selecting = 'origin';
        runSearch();
    }

    function nearestNode(point) {
        let best = null;
        let bestDistance = Infinity;
        for (const node of Object.values(graph.nodes)) {
            const distance =
                (node.x - point.x) ** 2 + (node.y - point.y) ** 2;
            if (distance < bestDistance) {
                bestDistance = distance;
                best = node.id;
            }
        }
        return best;
    }

    function handleGroundPick(clientX, clientY) {
        const point = view.groundPoint(clientX, clientY);
        if (!point) return;
        const nodeId = nearestNode(point);
        if (selecting === 'origin') {
            originId = nodeId;
            selecting = 'destination';
            ui.state.textContent = 'select destination';
            return;
        }
        destinationId = nodeId;
        selecting = 'origin';
        if (destinationId === originId) {
            ui.state.textContent = 'choose another node';
            return;
        }
        runSearch();
    }

    canvas.addEventListener('pointerdown', event => {
        pointerStart = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener('pointerup', event => {
        if (!pointerStart) return;
        const distance = Math.hypot(
            event.clientX - pointerStart.x,
            event.clientY - pointerStart.y
        );
        pointerStart = null;
        if (distance <= 4) handleGroundPick(event.clientX, event.clientY);
    });

    ui.astar.addEventListener('click', () => setAlgorithm('astar'));
    ui.dijkstra.addEventListener('click', () => setAlgorithm('dijkstra'));
    ui.run.addEventListener('click', runSearch);
    ui.random.addEventListener('click', randomEndpoints);
    ui.pause.addEventListener('click', () => {
        paused = !paused;
        ui.pause.textContent = paused ? 'resume' : 'pause';
        ui.state.textContent = paused
            ? 'suspended'
            : simulation.routeStart
              ? 'route bonded'
              : 'propagating';
    });
    ui.resetView.addEventListener('click', () => {
        topView = false;
        ui.topView.classList.remove('active');
        view.resetCamera();
    });
    ui.topView.addEventListener('click', () => {
        topView = !topView;
        ui.topView.classList.toggle('active', topView);
        view.setTopDownReference(topView);
    });

    window.addEventListener('keydown', event => {
        if (event.code === 'Space') {
            event.preventDefault();
            ui.pause.click();
        } else if (event.key.toLowerCase() === 'r') {
            runSearch();
        } else if (event.key.toLowerCase() === 'a') {
            setAlgorithm(algorithm === 'astar' ? 'dijkstra' : 'astar');
        }
    });
    window.addEventListener('resize', () => {
        if (view) view.resize(window.innerWidth, window.innerHeight);
    });
    document.addEventListener('visibilitychange', () => {
        hidden = document.hidden;
        lastFrame = performance.now();
        lastRenderAt = 0;
    });
    window.addEventListener('pagehide', event => {
        if (!event.persisted && view) view.dispose();
    });

    graph = SymbioteGraph.createGraph(32841);
    simulation = new SymbioteOrganism.OrganismSimulation(graph);
    try {
        view = new SymbioteCloudRenderer.PointCloudRenderer(
            canvas,
            graph,
            WORLD,
            {
                onContextLost() {
                    ui.state.textContent = 'graphics context lost';
                },
                onContextRestored() {
                    ui.state.textContent = 'graphics restored';
                },
            }
        );
        view.resize(window.innerWidth, window.innerHeight);
        requestAnimationFrame(animate);
        setTimeout(runSearch, 500);
    } catch (error) {
        console.error(error);
        ui.unsupported.hidden = false;
        ui.unsupported.querySelector('span').textContent = error.message;
    }
})();
