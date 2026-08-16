(function () {
    'use strict';

    const canvas = document.getElementById('scene');
    const ui = Object.fromEntries(
        [
            'state', 'algorithm-stat', 'event-index', 'event-type',
            'frontier', 'settled', 'conflicts', 'route-cost',
            'carrier-lock', 'selected-readout', 'timeline', 'play',
            'step-back', 'step-forward', 'acquisition', 'astar',
            'dijkstra', 'run', 'random', 'endpoints', 'scan',
            'contour', 'inspect', 'cut', 'resist', 'amplify',
            'clear', 'reset-view', 'top-view', 'side-view',
            'speed', 'specimen',
        ].map(id => [id, document.getElementById(id)])
    );

    let algorithm = 'astar';
    let graph;
    let result;
    let timeline;
    let snapshot;
    let renderer;
    let originId = '2:13';
    let destinationId = '26:3';
    let eventPosition = 0;
    let playing = true;
    let lastFrame = performance.now();
    let lastRender = 0;
    let interactionMode = 'inspect';
    let endpointStage = null;
    let selectedEdgeId = null;
    let scanVisible = true;
    let contourMode = 'f';
    let pointerStart = null;
    const profile = {
        blockedEdges: new Set(),
        resistance: new Map(),
        preferredEdges: new Set(),
    };

    function runSearch() {
        graph = SymbioteGraph.createGraph(32841, profile);
        result = SymbiotePathfinding.search(
            graph,
            originId,
            destinationId,
            algorithm
        );
        timeline = new PathfindingAnalytics.AnalyticalTimeline(
            graph,
            result,
            destinationId
        );
        eventPosition = 0;
        playing = true;
        ui.timeline.max = String(timeline.events.length);
        ui.timeline.value = '0';
        ui.play.textContent = 'pause';
        ui.state.textContent = 'transmitting';
        ui['algorithm-stat'].textContent =
            algorithm === 'astar' ? 'a* phased' : 'dijkstra uniform';
        renderer.setGraph(graph);
        updateSnapshot();
    }

    function updateSnapshot() {
        snapshot = timeline.snapshot(eventPosition);
        ui['event-index'].textContent =
            `${snapshot.eventIndex}/${timeline.events.length}`;
        ui['event-type'].textContent =
            snapshot.event?.type || 'ready';
        ui.frontier.textContent = String(snapshot.frontierSize);
        ui.settled.textContent = String(snapshot.settledCount);
        ui.conflicts.textContent = String(snapshot.conflictCount);
        ui['route-cost'].textContent =
            snapshot.routeCost === null
                ? '--'
                : `${Math.round(snapshot.routeCost)} units`;
        const lock =
            snapshot.eventIndex < timeline.acquisitionIndex()
                ? 0
                : Math.min(
                    100,
                    Math.round(
                        ((snapshot.eventIndex -
                            timeline.acquisitionIndex() +
                            1) /
                            8) *
                            100
                    )
                );
        ui['carrier-lock'].textContent = `${lock}%`;
        ui.timeline.value = String(snapshot.eventIndex);
        if (snapshot.routeFound) {
            ui.state.textContent = 'carrier locked';
        }
        updateSpecimen();
    }

    function updateSpecimen() {
        if (selectedEdgeId === null || !snapshot) {
            ui.specimen.innerHTML =
                '<div class="specimen-empty">select a conductor</div>';
            ui['selected-readout'].textContent = '--';
            return;
        }
        const edge = graph.edges[selectedEdgeId];
        const state = snapshot.edges[selectedEdgeId];
        ui['selected-readout'].textContent = `edge ${selectedEdgeId}`;
        ui.specimen.innerHTML = `
            <div class="specimen-title">edge ${selectedEdgeId} // ${edge.kind}</div>
            <div>distance <span>${edge.distance.toFixed(1)}</span></div>
            <div>base cost <span>${edge.baseCost.toFixed(2)}</span></div>
            <div>resistance <span>${edge.resistance.toFixed(2)}x</span></div>
            <div>effective <span>${edge.effectiveCost.toFixed(2)}</span></div>
            <div>g <span>${state.g == null ? '--' : state.g.toFixed(2)}</span></div>
            <div>h <span>${state.h == null ? '--' : state.h.toFixed(2)}</span></div>
            <div>f <span>${state.f == null ? '--' : state.f.toFixed(2)}</span></div>
            <div>discovered <span>${state.discoveredAt ?? '--'}</span></div>
            <div>settled <span>${state.settledAt ?? '--'}</span></div>
            <div>route <span>${state.route ? 'yes' : 'no'}</span></div>
            <div>blocked <span>${edge.blocked ? 'yes' : 'no'}</span></div>
        `;
    }

    function setAlgorithm(next) {
        algorithm = next;
        ui.astar.classList.toggle('active', next === 'astar');
        ui.dijkstra.classList.toggle('active', next === 'dijkstra');
        runSearch();
    }

    function setInteraction(next) {
        interactionMode = next;
        for (const id of ['inspect', 'cut', 'resist', 'amplify', 'clear']) {
            ui[id].classList.toggle('active', id === next);
        }
    }

    function applyIntervention(edgeId) {
        if (interactionMode === 'cut') {
            profile.blockedEdges.add(edgeId);
            profile.resistance.delete(edgeId);
            profile.preferredEdges.delete(edgeId);
        } else if (interactionMode === 'resist') {
            profile.blockedEdges.delete(edgeId);
            profile.resistance.set(
                edgeId,
                Math.min(8, (profile.resistance.get(edgeId) || 1) * 1.8)
            );
            profile.preferredEdges.delete(edgeId);
        } else if (interactionMode === 'amplify') {
            profile.blockedEdges.delete(edgeId);
            profile.resistance.delete(edgeId);
            profile.preferredEdges.add(edgeId);
        } else if (interactionMode === 'clear') {
            profile.blockedEdges.delete(edgeId);
            profile.resistance.delete(edgeId);
            profile.preferredEdges.delete(edgeId);
        }
        if (interactionMode !== 'inspect') runSearch();
    }

    function nearestNode(point) {
        let best = null;
        let distance = Infinity;
        for (const node of Object.values(graph.nodes)) {
            const candidate =
                (node.x - point.x) ** 2 + (node.y - point.y) ** 2;
            if (candidate < distance) {
                distance = candidate;
                best = node.id;
            }
        }
        return best;
    }

    function handleClick(clientX, clientY) {
        const point = renderer.groundPoint(clientX, clientY);
        if (!point) return;
        if (endpointStage) {
            const nodeId = nearestNode(point);
            if (endpointStage === 'origin') {
                originId = nodeId;
                endpointStage = 'destination';
                ui.state.textContent = 'select destination';
            } else {
                destinationId = nodeId;
                endpointStage = null;
                ui.endpoints.classList.remove('active');
                runSearch();
            }
            return;
        }
        selectedEdgeId = renderer.nearestEdge(point);
        applyIntervention(selectedEdgeId);
        updateSpecimen();
    }

    function animate(now) {
        requestAnimationFrame(animate);
        const delta = Math.max(0, now - lastFrame);
        lastFrame = now;
        if (playing && timeline) {
            eventPosition = Math.min(
                timeline.events.length,
                eventPosition +
                    (delta / 1000) * Number(ui.speed.value)
            );
            updateSnapshot();
            if (eventPosition >= timeline.events.length) {
                playing = false;
                ui.play.textContent = 'play';
            }
        }
        if (now - lastRender < 1000 / 60 || !snapshot) return;
        lastRender = now;
        renderer.render({
            snapshot,
            timeline,
            time: now,
            algorithm,
            contourMode,
            scanVisible,
            selectedEdgeId,
            originId,
            destinationId,
        });
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
        if (distance <= 4) handleClick(event.clientX, event.clientY);
    });

    ui.astar.addEventListener('click', () => setAlgorithm('astar'));
    ui.dijkstra.addEventListener('click', () => setAlgorithm('dijkstra'));
    ui.run.addEventListener('click', runSearch);
    ui.random.addEventListener('click', () => {
        const random = SymbioteGraph.mulberry32(
            Math.floor(performance.now() * 1000)
        );
        originId = `${1 + Math.floor(random() * 5)}:${1 + Math.floor(random() * 15)}`;
        destinationId = `${23 + Math.floor(random() * 5)}:${1 + Math.floor(random() * 15)}`;
        runSearch();
    });
    ui.endpoints.addEventListener('click', () => {
        endpointStage = endpointStage ? null : 'origin';
        ui.endpoints.classList.toggle('active', Boolean(endpointStage));
        ui.state.textContent = endpointStage
            ? 'select transmitter'
            : 'ready';
    });
    ui.play.addEventListener('click', () => {
        playing = !playing;
        ui.play.textContent = playing ? 'pause' : 'play';
    });
    ui['step-back'].addEventListener('click', () => {
        playing = false;
        eventPosition = Math.max(0, Math.floor(eventPosition) - 1);
        updateSnapshot();
    });
    ui['step-forward'].addEventListener('click', () => {
        playing = false;
        eventPosition = Math.min(
            timeline.events.length,
            Math.floor(eventPosition) + 1
        );
        updateSnapshot();
    });
    ui.acquisition.addEventListener('click', () => {
        playing = false;
        eventPosition = timeline.acquisitionIndex();
        updateSnapshot();
    });
    ui.timeline.addEventListener('input', () => {
        playing = false;
        eventPosition = Number(ui.timeline.value);
        updateSnapshot();
    });
    ui.scan.addEventListener('click', () => {
        scanVisible = !scanVisible;
        ui.scan.classList.toggle('active', scanVisible);
    });
    ui.contour.addEventListener('change', () => {
        contourMode = ui.contour.value;
    });
    for (const mode of ['inspect', 'cut', 'resist', 'amplify', 'clear']) {
        ui[mode].addEventListener('click', () => setInteraction(mode));
    }
    ui['reset-view'].addEventListener('click', () => renderer.resetCamera());
    ui['top-view'].addEventListener('click', () => renderer.topView());
    ui['side-view'].addEventListener('click', () => renderer.sideView());
    window.addEventListener('resize', () =>
        renderer.resize(window.innerWidth, window.innerHeight)
    );
    window.addEventListener('pagehide', event => {
        if (!event.persisted) renderer.dispose();
    });

    graph = SymbioteGraph.createGraph(32841, profile);
    renderer = new TacticalInterferometryRenderer.Renderer(canvas, graph);
    renderer.resize(window.innerWidth, window.innerHeight);
    setInteraction('inspect');
    runSearch();
    requestAnimationFrame(animate);
})();
