(function (root, factory) {
    const Graph =
        typeof module === 'object' && module.exports
            ? require('./pathfinding-graph.js')
            : root.SymbioteGraph;
    const api = factory(Graph);
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.TacticalOsm = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Graph) {
    'use strict';

    const OVERPASS_MIRRORS = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
        'https://overpass.openstreetmap.ru/api/interpreter',
    ];
    const NOMINATIM = 'https://nominatim.openstreetmap.org';
    const HIGHWAY_KIND = {
        motorway: 'artery',
        motorway_link: 'artery',
        trunk: 'artery',
        trunk_link: 'artery',
        primary: 'artery',
        primary_link: 'artery',
        secondary: 'street',
        secondary_link: 'street',
        tertiary: 'street',
        tertiary_link: 'street',
        unclassified: 'street',
        residential: 'street',
        living_street: 'street',
        service: 'alley',
        footway: 'track',
        path: 'track',
        pedestrian: 'track',
        cycleway: 'track',
        steps: 'track',
        track: 'track',
        bridleway: 'track',
    };
    const HIGHWAY_REGEX = Object.keys(HIGHWAY_KIND).join('|');
    const METERS_PER_DEG_LAT = 111320;
    const MIN_KEEP_METERS = 22;
    const CAMERA_COST = 4;
    const SNAP_METERS = 42;
    const CARDINALS = {
        n: 0, ne: 45, e: 90, se: 135,
        s: 180, sw: 225, w: 270, nw: 315,
    };

    function classifyHighway(type) {
        return HIGHWAY_KIND[type] || null;
    }

    function bboxFromCenter(lat, lon, radiusM) {
        const dLat = radiusM / METERS_PER_DEG_LAT;
        const dLon =
            radiusM /
            (METERS_PER_DEG_LAT *
                Math.max(0.08, Math.cos((lat * Math.PI) / 180)));
        return {
            south: lat - dLat,
            north: lat + dLat,
            west: lon - dLon,
            east: lon + dLon,
        };
    }

    function bboxFromPoints(points, padM, maxSpanM = 2800) {
        const list = points.filter(point => point && Number.isFinite(point.lat));
        if (!list.length) throw new Error('no points for bbox');
        let south = Infinity;
        let north = -Infinity;
        let west = Infinity;
        let east = -Infinity;
        for (const point of list) {
            south = Math.min(south, point.lat);
            north = Math.max(north, point.lat);
            west = Math.min(west, point.lon);
            east = Math.max(east, point.lon);
        }
        const midLat = (south + north) / 2;
        const padLat = padM / METERS_PER_DEG_LAT;
        const padLon =
            padM /
            (METERS_PER_DEG_LAT *
                Math.max(0.08, Math.cos((midLat * Math.PI) / 180)));
        south -= padLat;
        north += padLat;
        west -= padLon;
        east += padLon;
        const spanM = Math.hypot(
            (north - south) * METERS_PER_DEG_LAT,
            (east - west) *
                METERS_PER_DEG_LAT *
                Math.max(0.08, Math.cos((midLat * Math.PI) / 180))
        );
        if (spanM > maxSpanM) {
            return bboxFromCenter(midLat, (west + east) / 2, maxSpanM / 2);
        }
        return { south, north, west, east };
    }

    function projectLocal(lat, lon, originLat, originLon) {
        const metersPerDegLon =
            METERS_PER_DEG_LAT *
            Math.max(0.08, Math.cos((originLat * Math.PI) / 180));
        return {
            x: (lon - originLon) * metersPerDegLon,
            y: (lat - originLat) * METERS_PER_DEG_LAT,
        };
    }

    function computeFit(raw, world) {
        const list = Object.values(raw);
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const node of list) {
            minX = Math.min(minX, node.x);
            maxX = Math.max(maxX, node.x);
            minY = Math.min(minY, node.y);
            maxY = Math.max(maxY, node.y);
        }
        const spanX = Math.max(1, maxX - minX);
        const spanY = Math.max(1, maxY - minY);
        const innerW = world.width - world.marginX * 2;
        const innerH = world.height - world.marginY * 2;
        return {
            scale: Math.min(innerW / spanX, innerH / spanY),
            cx: (minX + maxX) / 2,
            cy: (minY + maxY) / 2,
            ox: world.width / 2,
            oy: world.height / 2,
        };
    }

    function applyFit(x, y, fit) {
        return {
            x: fit.ox + (x - fit.cx) * fit.scale,
            y: fit.oy + (y - fit.cy) * fit.scale,
        };
    }

    function fitNodesToWorld(raw, world) {
        const fit = computeFit(raw, world);
        const nodes = {};
        for (const node of Object.values(raw)) {
            const point = applyFit(node.x, node.y, fit);
            nodes[node.id] = {
                id: node.id,
                x: point.x,
                y: point.y,
                lat: node.lat,
                lon: node.lon,
            };
        }
        return nodes;
    }

    function pointToSegment(point, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSquared = dx * dx + dy * dy || 1;
        const t = Math.max(
            0,
            Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)
        );
        return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
    }

    function parseBearing(value) {
        if (value == null || value === '') return null;
        const numeric = parseFloat(value);
        if (!Number.isNaN(numeric)) return numeric;
        return CARDINALS[String(value).toLowerCase()] ?? null;
    }

    function parseCameras(elements) {
        const cameras = [];
        for (const element of elements) {
            if (element.type !== 'node' || !element.tags) continue;
            if (element.tags.man_made !== 'surveillance') continue;
            cameras.push({
                id: String(element.id),
                lat: element.lat,
                lon: element.lon,
                type:
                    element.tags['camera:type'] ||
                    element.tags['surveillance:type'] ||
                    'fixed',
                direction:
                    parseBearing(element.tags['camera:direction']) ??
                    parseBearing(element.tags.direction),
                edgeId: null,
            });
        }
        return cameras;
    }

    function snapPointsToEdges(nodes, rawEdges, points, maxDistance) {
        for (const point of points) {
            let bestIndex = -1;
            let bestDistance = Infinity;
            for (let index = 0; index < rawEdges.length; index++) {
                const edge = rawEdges[index];
                const distance = pointToSegment(
                    point,
                    nodes[edge.a],
                    nodes[edge.b]
                );
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestIndex = index;
                }
            }
            if (bestIndex >= 0 && bestDistance <= maxDistance) {
                point.edgeId = bestIndex;
            }
        }
        return points;
    }

    function projectOntoGraph(graph, lat, lon) {
        const meters = projectLocal(lat, lon, graph.lat, graph.lon);
        const point = applyFit(meters.x, meters.y, graph.fit);
        return { x: point.x, y: point.y, lat, lon };
    }

    function neighborSets(ways, projected) {
        const neighbors = new Map();
        function link(a, b) {
            if (!projected[a] || !projected[b] || a === b) return;
            if (!neighbors.has(a)) neighbors.set(a, new Set());
            if (!neighbors.has(b)) neighbors.set(b, new Set());
            neighbors.get(a).add(b);
            neighbors.get(b).add(a);
        }
        for (const way of ways) {
            for (let index = 0; index < way.nodes.length - 1; index++) {
                link(String(way.nodes[index]), String(way.nodes[index + 1]));
            }
        }
        return neighbors;
    }

    function simplifyTopology(ways, projected) {
        const neighbors = neighborSets(ways, projected);
        const seen = new Set();
        const rawEdges = [];
        for (const way of ways) {
            let last = null;
            for (let index = 0; index < way.nodes.length; index++) {
                const id = String(way.nodes[index]);
                if (!projected[id]) continue;
                const isEnd = index === 0 || index === way.nodes.length - 1;
                if (last === null) {
                    last = id;
                    continue;
                }
                const span = Math.hypot(
                    projected[id].x - projected[last].x,
                    projected[id].y - projected[last].y
                );
                const degree = neighbors.get(id)?.size || 0;
                const keep =
                    isEnd || degree !== 2 || span >= MIN_KEEP_METERS;
                if (!keep) continue;
                if (last !== id && span >= 0.5) {
                    const key = last < id ? `${last}|${id}` : `${id}|${last}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        rawEdges.push({
                            a: last,
                            b: id,
                            kind: way.kind,
                            name: way.name || '',
                            bend: 0,
                            cameraCount: 0,
                            trafficSeverity: 0,
                        });
                    }
                }
                last = id;
            }
        }
        const nodes = {};
        for (const edge of rawEdges) {
            nodes[edge.a] = projected[edge.a];
            nodes[edge.b] = projected[edge.b];
        }
        return { nodes, rawEdges };
    }

    function assembleGraph(nodes, rawEdges, profileInput, meta) {
        const profile = Graph.normalizeProfile(profileInput);
        const adjacency = {};
        for (const id of Object.keys(nodes)) adjacency[id] = [];
        const edges = [];
        const style = Graph.ROAD_STYLE;
        for (const raw of rawEdges) {
            const id = edges.length;
            const baseCost = raw.distance / style[raw.kind].speed;
            const resistance = Math.max(
                0.1,
                profile.resistance.get(id) || 1
            );
            const preferred = profile.preferredEdges.has(id);
            const blocked = profile.blockedEdges.has(id);
            const cameraCount = raw.cameraCount || 0;
            const trafficSeverity = raw.trafficSeverity || 0;
            const cameraMult =
                profileInput?.avoidCameras && cameraCount ? CAMERA_COST : 1;
            const trafficMult =
                profileInput?.avoidTraffic && trafficSeverity
                    ? 1 + trafficSeverity
                    : 1;
            const effectiveCost =
                baseCost *
                resistance *
                cameraMult *
                trafficMult *
                (preferred ? 0.62 : 1);
            edges.push({
                id,
                a: raw.a,
                b: raw.b,
                kind: raw.kind,
                name: raw.name || '',
                distance: raw.distance,
                bend: raw.bend,
                baseCost,
                effectiveCost,
                resistance: resistance * cameraMult * trafficMult,
                preferred,
                blocked,
                cameraCount,
                trafficSeverity,
            });
            if (!blocked) {
                adjacency[raw.a].push({
                    to: raw.b,
                    edgeId: id,
                    cost: effectiveCost,
                });
                adjacency[raw.b].push({
                    to: raw.a,
                    edgeId: id,
                    cost: effectiveCost,
                });
            }
        }
        const maximumSpeed = Math.max(
            ...Object.values(style).map(styleItem => styleItem.speed)
        );
        return {
            seed: null,
            source: meta.source || 'osm',
            lat: meta.lat,
            lon: meta.lon,
            label: meta.label || '',
            fit: meta.fit || null,
            cameras: meta.cameras || [],
            traffic: meta.traffic || [],
            weather: meta.weather || null,
            osrm: meta.osrm || null,
            originLabel: meta.originLabel || '',
            destinationLabel: meta.destinationLabel || '',
            trafficCoverage: meta.trafficCoverage || false,
            nodes,
            adjacency,
            edges,
            rawEdges,
            heuristicScale: 1 / maximumSpeed,
            profile,
        };
    }

    function graphFromOverpass(payload, options = {}) {
        const originLat = options.lat;
        const originLon = options.lon;
        const world = options.world || Graph.WORLD;
        const elements = payload.elements || payload;
        const osmNodes = new Map();
        const ways = [];
        for (const element of elements) {
            if (element.type === 'node') {
                osmNodes.set(element.id, element);
            } else if (
                element.type === 'way' &&
                element.tags &&
                element.tags.highway
            ) {
                const kind = classifyHighway(element.tags.highway);
                if (kind) {
                    ways.push({
                        nodes: element.nodes || [],
                        kind,
                        name: element.tags.name || '',
                    });
                }
            }
        }

        const used = new Set();
        for (const way of ways) {
            for (const id of way.nodes) {
                if (osmNodes.has(id)) used.add(id);
            }
        }

        const projected = {};
        for (const id of used) {
            const node = osmNodes.get(id);
            const point = projectLocal(
                node.lat,
                node.lon,
                originLat,
                originLon
            );
            projected[String(id)] = {
                id: String(id),
                x: point.x,
                y: point.y,
                lat: node.lat,
                lon: node.lon,
            };
        }

        if (Object.keys(projected).length < 2) {
            throw new Error('not enough street nodes');
        }

        const simplified = simplifyTopology(ways, projected);
        if (Object.keys(simplified.nodes).length < 2) {
            throw new Error('not enough street nodes');
        }
        const fit = computeFit(simplified.nodes, world);
        const nodes = {};
        for (const node of Object.values(simplified.nodes)) {
            const point = applyFit(node.x, node.y, fit);
            nodes[node.id] = {
                id: node.id,
                x: point.x,
                y: point.y,
                lat: node.lat,
                lon: node.lon,
            };
        }
        const rawEdges = simplified.rawEdges.map(edge => ({
            ...edge,
            cameraCount: 0,
            trafficSeverity: 0,
            distance: Math.hypot(
                nodes[edge.b].x - nodes[edge.a].x,
                nodes[edge.b].y - nodes[edge.a].y
            ),
        }));
        if (rawEdges.length < 1) throw new Error('not enough street edges');
        const snapDistance = SNAP_METERS * fit.scale;
        const cameras = snapPointsToEdges(
            nodes,
            rawEdges,
            parseCameras(elements).map(camera => {
                const meters = projectLocal(
                    camera.lat,
                    camera.lon,
                    originLat,
                    originLon
                );
                const point = applyFit(meters.x, meters.y, fit);
                return { ...camera, x: point.x, y: point.y };
            }),
            snapDistance
        );
        for (const camera of cameras) {
            if (camera.edgeId == null) continue;
            rawEdges[camera.edgeId].cameraCount += 1;
        }
        return assembleGraph(nodes, rawEdges, options.profile, {
            source: 'osm',
            lat: originLat,
            lon: originLon,
            label: options.label || '',
            fit,
            cameras,
            traffic: options.traffic || [],
            weather: options.weather || null,
            osrm: options.osrm || null,
            originLabel: options.originLabel || '',
            destinationLabel: options.destinationLabel || '',
        });
    }

    function withProfile(graph, profileInput) {
        return assembleGraph(graph.nodes, graph.rawEdges, profileInput, {
            source: graph.source,
            lat: graph.lat,
            lon: graph.lon,
            label: graph.label,
            fit: graph.fit,
            cameras: graph.cameras,
            traffic: graph.traffic,
            weather: graph.weather,
            osrm: graph.osrm,
            originLabel: graph.originLabel,
            destinationLabel: graph.destinationLabel,
            trafficCoverage: graph.trafficCoverage,
        });
    }

    function nearestNodeToLatLon(graph, lat, lon) {
        let best = null;
        let distance = Infinity;
        for (const node of Object.values(graph.nodes)) {
            const dLat = node.lat - lat;
            const dLon = node.lon - lon;
            const candidate = dLat * dLat + dLon * dLon;
            if (candidate < distance) {
                distance = candidate;
                best = node.id;
            }
        }
        return best;
    }

    function nearestNodeToPoint(graph, point) {
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

    function reachableIds(graph, originId) {
        const seen = new Set([originId]);
        const queue = [originId];
        while (queue.length) {
            const id = queue.shift();
            const neighbors = graph.adjacency[id] || [];
            for (const entry of neighbors) {
                if (seen.has(entry.to)) continue;
                seen.add(entry.to);
                queue.push(entry.to);
            }
        }
        return [...seen];
    }

    function pickDestination(graph, originId) {
        const origin = graph.nodes[originId];
        if (!origin) return null;
        const ids = reachableIds(graph, originId).filter(
            id => id !== originId
        );
        if (!ids.length) return null;
        const ranked = ids
            .map(id => {
                const node = graph.nodes[id];
                return {
                    id,
                    distance: Math.hypot(node.x - origin.x, node.y - origin.y),
                };
            })
            .sort((a, b) => a.distance - b.distance);
        const pick = ranked[Math.floor(ranked.length * 0.72)] || ranked.at(-1);
        return pick.id;
    }

    function pickRandomPair(graph, random) {
        const ids = Object.keys(graph.nodes);
        if (ids.length < 2) return null;
        const originId = ids[Math.floor(random() * ids.length)];
        const destinationId = pickDestination(graph, originId);
        if (!destinationId) return null;
        return { originId, destinationId };
    }

    function overpassQuery(bbox) {
        return `[out:json][timeout:25];(way["highway"~"^(${HIGHWAY_REGEX})$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});node["man_made"="surveillance"](${bbox.south},${bbox.west},${bbox.north},${bbox.east}););out body;>;out skel qt;`;
    }

    async function fetchOverpass(bbox, options = {}) {
        const fetchImpl = options.fetch || fetch;
        const body = `data=${encodeURIComponent(overpassQuery(bbox))}`;
        let lastError = null;
        const start = options.mirrorOffset || 0;
        for (let attempt = 0; attempt < OVERPASS_MIRRORS.length; attempt++) {
            const url =
                OVERPASS_MIRRORS[
                    (start + attempt) % OVERPASS_MIRRORS.length
                ];
            try {
                const response = await fetchImpl(url, {
                    method: 'POST',
                    body,
                    headers: {
                        'Content-Type':
                            'application/x-www-form-urlencoded;charset=UTF-8',
                    },
                });
                if (response.status === 429 || response.status >= 500) {
                    lastError = new Error(`overpass ${response.status}`);
                    continue;
                }
                if (!response.ok) {
                    lastError = new Error(`overpass ${response.status}`);
                    continue;
                }
                return await response.json();
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('all overpass mirrors failed');
    }

    async function searchPlace(query, options = {}) {
        const fetchImpl = options.fetch || fetch;
        const url = `${NOMINATIM}/search?q=${encodeURIComponent(
            query
        )}&format=json&limit=1`;
        const response = await fetchImpl(url, {
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`nominatim ${response.status}`);
        const hits = await response.json();
        if (!hits.length) throw new Error('place not found');
        return {
            lat: Number(hits[0].lat),
            lon: Number(hits[0].lon),
            label: hits[0].display_name,
        };
    }

    async function reverseGeocode(lat, lon, options = {}) {
        const fetchImpl = options.fetch || fetch;
        const url = `${NOMINATIM}/reverse?lat=${encodeURIComponent(
            lat
        )}&lon=${encodeURIComponent(lon)}&format=json`;
        try {
            const response = await fetchImpl(url, {
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
            const hit = await response.json();
            return (
                hit.display_name ||
                `${lat.toFixed(4)}, ${lon.toFixed(4)}`
            );
        } catch (_error) {
            return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        }
    }

    async function graphFromLocation(lat, lon, options = {}) {
        const radiusM = options.radiusM || 900;
        const bbox = bboxFromCenter(lat, lon, radiusM);
        const payload =
            options.payload || (await fetchOverpass(bbox, options));
        return graphFromOverpass(payload, {
            lat,
            lon,
            profile: options.profile,
            world: options.world,
            label: options.label || '',
            originLabel: options.originLabel || options.label || '',
            destinationLabel: options.destinationLabel || '',
        });
    }

    async function graphFromEndpoints(origin, destination, options = {}) {
        const points = [origin, destination].filter(Boolean);
        const bbox = bboxFromPoints(points, options.padM || 450);
        const payload =
            options.payload || (await fetchOverpass(bbox, options));
        const ref = origin || destination;
        return graphFromOverpass(payload, {
            lat: ref.lat,
            lon: ref.lon,
            profile: options.profile,
            world: options.world,
            label: options.label || origin?.label || '',
            originLabel: origin?.label || '',
            destinationLabel: destination?.label || '',
        });
    }

    function requestGeolocation(geolocation) {
        const api =
            geolocation ||
            (typeof navigator !== 'undefined' ? navigator.geolocation : null);
        return new Promise((resolve, reject) => {
            if (!api || typeof api.getCurrentPosition !== 'function') {
                reject(new Error('geolocation unavailable'));
                return;
            }
            api.getCurrentPosition(
                position =>
                    resolve({
                        lat: position.coords.latitude,
                        lon: position.coords.longitude,
                    }),
                error => reject(error),
                {
                    enableHighAccuracy: true,
                    timeout: 12000,
                    maximumAge: 30000,
                }
            );
        });
    }

    return {
        OVERPASS_MIRRORS,
        HIGHWAY_KIND,
        CAMERA_COST,
        classifyHighway,
        bboxFromCenter,
        bboxFromPoints,
        projectLocal,
        computeFit,
        applyFit,
        fitNodesToWorld,
        parseCameras,
        snapPointsToEdges,
        projectOntoGraph,
        graphFromOverpass,
        graphFromLocation,
        graphFromEndpoints,
        withProfile,
        nearestNodeToLatLon,
        nearestNodeToPoint,
        reachableIds,
        pickDestination,
        pickRandomPair,
        overpassQuery,
        fetchOverpass,
        searchPlace,
        reverseGeocode,
        requestGeolocation,
    };
});
