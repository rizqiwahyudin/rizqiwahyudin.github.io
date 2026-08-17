(function () {
    'use strict';

    const canvas = document.getElementById('scene');
    const ui = Object.fromEntries(
        [
            'state', 'algorithm-stat', 'event-index',
            'route-cost', 'selected-readout', 'timeline', 'play',
            'step-back', 'step-forward', 'acquisition', 'astar',
            'dijkstra', 'run', 'random', 'endpoints', 'scan',
            'inspect', 'cut', 'resist', 'amplify',
            'clear', 'reset-view', 'top-view', 'iso-view', 'side-view',
            'speed', 'specimen',
        ].map(id => [id, document.getElementById(id)])
    );

    let algorithm = 'astar';
    let graph;
    let result;
    let previousResult = null;
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
    let scanVisible = false;
    let pointerStart = null;
    const profile = {
        blockedEdges: new Set(),
        resistance: new Map(),
        preferredEdges: new Set(),
    };

    function runSearch(options) {
        const keepGhost = Boolean(options && options.keepGhost && result);
        if (keepGhost) previousResult = result;
        else previousResult = null;

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
        ui.state.textContent = 'searching';
        ui['algorithm-stat'].textContent = algorithm === 'astar' ? 'a*' : 'dijkstra';
        renderer.setGraph(graph);
        renderer.setGhost(
            keepGhost && previousResult && previousResult.edgeIds
                ? previousResult.edgeIds
                : []
        );
        renderer.setNotes(
            PathfindingAnalytics.buildBriefingNotes(
                graph,
                result,
                profile,
                keepGhost ? previousResult : null
            )
        );
        renderer.setNotesVisible(false);
        updateSnapshot();
    }

    function updateSnapshot() {
        snapshot = timeline.snapshot(eventPosition);
        ui['event-index'].textContent =
            `${snapshot.eventIndex}/${timeline.events.length}`;
        ui['route-cost'].textContent =
            snapshot.routeCost === null
                ? '--'
                : `${Math.round(snapshot.routeCost)}`;
        ui.timeline.value = String(snapshot.eventIndex);
        ui.state.textContent = snapshot.routeFound
            ? 'path found'
            : playing
              ? 'searching'
              : 'paused';
        renderer.setNotesVisible(Boolean(snapshot.routeFound));
        updateSpecimen();
    }

    function updateSpecimen() {
        if (selectedEdgeId === null || !snapshot) {
            ui.specimen.innerHTML =
                '<div class="specimen-empty">select an edge</div>';
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
            <div>preferred <span>${edge.preferred ? 'yes' : 'no'}</span></div>
            <div>effective <span>${edge.effectiveCost.toFixed(2)}</span></div>
            <div>on path <span>${state.route ? 'yes' : 'no'}</span></div>
            <div>closed <span>${edge.blocked ? 'yes' : 'no'}</span></div>
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
        if (interactionMode !== 'inspect') runSearch({ keepGhost: true });
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
            time: now,
            algorithm,
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
    ui.run.addEventListener('click', () => runSearch());
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
            ? 'select origin'
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
    for (const mode of ['inspect', 'cut', 'resist', 'amplify', 'clear']) {
        ui[mode].addEventListener('click', () => setInteraction(mode));
    }
    ui['reset-view'].addEventListener('click', () => renderer.resetCamera());
    ui['top-view'].addEventListener('click', () => renderer.topView());
    ui['iso-view'].addEventListener('click', () => renderer.isoView());
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
