(function () {
    'use strict';

    const canvas = document.getElementById('scene');
    const ui = {
        state: document.getElementById('state'),
        algorithm: document.getElementById('algorithm-stat'),
        visited: document.getElementById('visited'),
        tendrils: document.getElementById('tendrils'),
        quality: document.getElementById('quality'),
        cost: document.getElementById('cost'),
        astar: document.getElementById('astar'),
        dijkstra: document.getElementById('dijkstra'),
        run: document.getElementById('run'),
        random: document.getElementById('random'),
        pause: document.getElementById('pause'),
        speed: document.getElementById('speed'),
        creep: document.getElementById('creep'),
    };

    const WORLD = { width: 1600, height: 900, marginX: 90, marginY: 80 };
    const ROAD_STYLE = {
        artery: { width: 1.25, speed: 2.2 },
        street: { width: 0.72, speed: 1.35 },
        alley: { width: 0.48, speed: 0.92 },
        track: { width: 0.42, speed: 0.62 },
    };

    let graph;
    let view;
    let graphSeed = 32841;
    let originId = '2:13';
    let destinationId = '26:3';
    let selecting = 'origin';
    let algorithm = 'astar';
    let result = null;
    let eventCursor = 0;
    let eventCredit = 0;
    let tendrils = new Map();
    let settledNodes = new Map();
    let routeEdgeIds = new Set();
    let routeNodeIds = new Set();
    let routeStart = 0;
    let routeReveal = 0;
    let state = 'idle';
    let paused = false;
    let documentHidden = document.hidden;
    let simulationTime = 0;
    let settledCount = 0;
    let lastFrame = performance.now();
    let lastRenderAt = 0;
    let lastRenderSimulationTime = 0;

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
                const jitterX =
                    (arterialCol ? 0.24 : 0.68) * (random() - 0.5) * xGap;
                const jitterY =
                    (arterialRow ? 0.24 : 0.68) * (random() - 0.5) * yGap;
                nodes[id] = {
                    id,
                    x: WORLD.marginX + col * xGap + jitterX,
                    y: WORLD.marginY + row * yGap + jitterY,
                };
                adjacency[id] = [];
            }
        }

        function classify(col, row, diagonal) {
            if (!diagonal && (col % 7 === 0 || row % 5 === 0)) return 'artery';
            if (diagonal) return random() > 0.42 ? 'alley' : 'track';
            return random() > 0.24 ? 'street' : 'alley';
        }

        function addEdge(aId, bId, kind) {
            const a = nodes[aId];
            const b = nodes[bId];
            if (!a || !b) return;
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

    function processEvent(event, time) {
        if (event.type === 'node-settled') {
            settledCount++;
            if (!settledNodes.has(event.nodeId)) {
                settledNodes.set(event.nodeId, {
                    spawnTime: time,
                    phase: settledCount * 0.917,
                });
            }
            return;
        }
        if (event.type === 'edge-relaxed') {
            const existing = tendrils.get(event.edgeId);
            if (!existing || existing.cost > event.cost) {
                const edge = graph.edges[event.edgeId];
                tendrils.set(event.edgeId, {
                    edgeId: event.edgeId,
                    from: event.from,
                    cost: event.cost,
                    spawnTime: time,
                    duration: 260 + Math.min(520, edge.distance * 3.1),
                    phase: event.edgeId * 0.713,
                });
            }
            return;
        }
        if (event.type === 'route-found') {
            routeEdgeIds = new Set(event.edgeIds);
            routeNodeIds = new Set(event.nodeIds);
            routeStart = time;
            state = 'resolved';
            ui.state.textContent = 'route bonded';
            ui.cost.textContent = `${Math.round(event.cost)} units`;
            return;
        }
        if (event.type === 'route-missing') {
            state = 'failed';
            ui.state.textContent = 'no connection';
        }
    }

    function update(deltaSeconds) {
        if (paused || documentHidden || !result) return;
        if (state === 'searching') {
            eventCredit += deltaSeconds * Number(ui.speed.value);
            let allowance = Math.min(120, Math.floor(eventCredit));
            eventCredit -= allowance;
            while (allowance-- > 0 && eventCursor < result.events.length) {
                processEvent(result.events[eventCursor++], simulationTime);
            }
            ui.visited.textContent = settledCount;
        }
        if (routeStart) {
            routeReveal = SymbioteGeometry.easeOutCubic(
                (simulationTime - routeStart) / 1450
            );
        }
    }

    function render(deltaSeconds) {
        const metrics = view.render(
            {
                result,
                tendrils,
                settledNodes,
                routeEdgeIds,
                routeNodeIds,
                routeStart,
                routeReveal,
                originId,
                destinationId,
            },
            simulationTime,
            deltaSeconds,
            Number(ui.creep.value) / 100
        );
        ui.tendrils.textContent = metrics.visibleCount;
        ui.quality.textContent = ['adaptive low', 'adaptive medium', 'full'][metrics.quality];
    }

    function animate(now) {
        requestAnimationFrame(animate);
        const rawDeltaMs = Math.max(0, now - lastFrame);
        lastFrame = now;
        if (documentHidden) return;

        if (!paused) {
            simulationTime += rawDeltaMs;
            update(rawDeltaMs / 1000);
        }
        if (paused) return;

        // High-refresh monitors do not need to redraw this scene above 60 Hz.
        const renderInterval = 1000 / 60;
        if (lastRenderAt === 0) lastRenderAt = now - renderInterval;
        if (now - lastRenderAt < renderInterval) return;
        const renderDelta = Math.min(
            1 / 20,
            Math.max(0, (simulationTime - lastRenderSimulationTime) / 1000)
        );
        lastRenderAt += renderInterval;
        if (now - lastRenderAt > renderInterval * 2) lastRenderAt = now;
        lastRenderSimulationTime = simulationTime;
        render(renderDelta);
    }

    function runSearch() {
        result = SymbiotePathfinding.search(
            graph,
            originId,
            destinationId,
            algorithm
        );
        tendrils = new Map();
        settledNodes = new Map();
        routeEdgeIds = new Set();
        routeNodeIds = new Set();
        eventCursor = 0;
        eventCredit = 0;
        settledCount = 0;
        routeStart = 0;
        routeReveal = 0;
        state = 'searching';
        paused = false;
        view.reset();
        ui.state.textContent = 'propagating';
        ui.visited.textContent = '0';
        ui.tendrils.textContent = '0';
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
        const random = mulberry32(Math.floor(performance.now() * 1000) ^ graphSeed);
        const leftCol = 1 + Math.floor(random() * 5);
        const rightCol = graph.cols - 2 - Math.floor(random() * 5);
        originId = `${leftCol}:${1 + Math.floor(random() * (graph.rows - 2))}`;
        destinationId = `${rightCol}:${1 + Math.floor(random() * (graph.rows - 2))}`;
        selecting = 'origin';
        runSearch();
    }

    function nearestNode(clientX, clientY) {
        const worldPoint = view.clientToWorld(clientX, clientY);
        let bestId = null;
        let bestDistance = Infinity;
        for (const node of Object.values(graph.nodes)) {
            const distance =
                (node.x - worldPoint.x) ** 2 + (node.y - worldPoint.y) ** 2;
            if (distance < bestDistance) {
                bestDistance = distance;
                bestId = node.id;
            }
        }
        return bestId;
    }

    function resize() {
        view.resize(window.innerWidth, window.innerHeight);
    }

    canvas.addEventListener('pointerup', event => {
        const nodeId = nearestNode(event.clientX, event.clientY);
        if (!nodeId) return;
        if (selecting === 'origin') {
            originId = nodeId;
            selecting = 'destination';
            ui.state.textContent = 'select destination';
        } else {
            destinationId = nodeId;
            selecting = 'origin';
            if (destinationId === originId) {
                ui.state.textContent = 'choose another node';
                return;
            }
            runSearch();
        }
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
            : routeStart
              ? 'route bonded'
              : 'propagating';
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

    document.addEventListener('visibilitychange', () => {
        documentHidden = document.hidden;
        lastFrame = performance.now();
        lastRenderAt = 0;
    });
    window.addEventListener('resize', resize);
    window.addEventListener('pagehide', event => {
        if (!event.persisted) view.dispose();
    });

    graph = createGraph(graphSeed);
    view = new SymbioteBiomass.BiomassRenderer(canvas, graph, WORLD, ROAD_STYLE);
    resize();
    requestAnimationFrame(animate);
    setTimeout(runSearch, 450);
})();
