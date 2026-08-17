(function (root, factory) {
    const Osm =
        typeof module === 'object' && module.exports
            ? require('./pathfinding-tactical-osm.js')
            : root.TacticalOsm;
    const api = factory(Osm);
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.TacticalLive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Osm) {
    'use strict';

    const WORKER = 'https://citywatch-tile-proxy.rizqi-wahyudin.workers.dev';
    const OSRM = 'https://router.project-osrm.org/route/v1/driving';
    const WEATHER = 'https://api.open-meteo.com/v1/forecast';
    const WEATHER_TEXT = {
        0: 'clear',
        1: 'mainly clear',
        2: 'partly cloudy',
        3: 'overcast',
        45: 'fog',
        48: 'rime fog',
        51: 'drizzle',
        61: 'rain',
        63: 'rain',
        65: 'heavy rain',
        71: 'snow',
        80: 'showers',
        95: 'thunder',
    };

    function emptyOsrm() {
        return {
            found: false,
            distance: 0,
            duration: 0,
            points: [],
            status: 'unavailable',
        };
    }

    function extractIncidentPoints(incident) {
        const loc = incident.location || {};
        const points = [];
        if (loc.shape && loc.shape.links) {
            for (const link of loc.shape.links) {
                if (link.points) {
                    for (const point of link.points) {
                        points.push({
                            lat: point.lat,
                            lon: point.lng ?? point.lon,
                        });
                    }
                }
            }
        } else if (loc.geoCoord) {
            points.push({ lat: loc.geoCoord.lat, lon: loc.geoCoord.lng });
        } else if (incident.geometry && incident.geometry.coordinates) {
            const coordinates = incident.geometry.coordinates;
            if (Array.isArray(coordinates[0])) {
                for (const pair of coordinates) {
                    points.push({ lat: pair[1], lon: pair[0] });
                }
            } else {
                points.push({ lat: coordinates[1], lon: coordinates[0] });
            }
        }
        return points.filter(
            point => Number.isFinite(point.lat) && Number.isFinite(point.lon)
        );
    }

    function incidentSeverity(incident) {
        const props = incident.incidentDetails || incident.properties || {};
        const value = props.criticality || props.severity?.code || 0;
        return Math.max(0, Math.min(3, Number(value) || 0));
    }

    async function fetchWeather(lat, lon, options = {}) {
        const fetchImpl = options.fetch || fetch;
        const url =
            `${WEATHER}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
            '&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code' +
            '&wind_speed_unit=ms';
        try {
            const response = await fetchImpl(url);
            if (!response.ok) return null;
            const data = await response.json();
            const current = data.current;
            if (!current) return null;
            const code = current.weather_code ?? 0;
            return {
                temperature: current.temperature_2m,
                windSpeed: current.wind_speed_10m,
                windDirection: current.wind_direction_10m,
                code,
                label: WEATHER_TEXT[code] || 'weather',
            };
        } catch (_error) {
            return null;
        }
    }

    async function fetchTraffic(lat, lon, options = {}) {
        const fetchImpl = options.fetch || fetch;
        const urls = [
            `${WORKER}/proxy/traffic?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&r=2`,
            `${WORKER}/proxy/traffic`,
        ];
        for (const url of urls) {
            try {
                const response = await fetchImpl(url, {
                    signal: options.signal,
                });
                if (!response.ok) continue;
                const data = await response.json();
                const incidents = data.results || data.incidents || [];
                if (!incidents.length) {
                    if (data._note) return { coverage: false, incidents: [] };
                    continue;
                }
                return { coverage: true, incidents };
            } catch (_error) {
                continue;
            }
        }
        return { coverage: false, incidents: [] };
    }

    async function fetchOsrm(origin, destination, options = {}) {
        if (!origin || !destination) return emptyOsrm();
        const fetchImpl = options.fetch || fetch;
        const url =
            `${OSRM}/${origin.lon},${origin.lat};${destination.lon},${destination.lat}` +
            '?overview=full&geometries=geojson';
        try {
            const response = await fetchImpl(url);
            if (!response.ok) return emptyOsrm();
            const data = await response.json();
            const route = data.routes && data.routes[0];
            if (!route) return { ...emptyOsrm(), status: 'no route' };
            return {
                found: true,
                distance: route.distance,
                duration: route.duration,
                points: (route.geometry?.coordinates || []).map(pair => ({
                    lon: pair[0],
                    lat: pair[1],
                })),
                status: 'ok',
            };
        } catch (_error) {
            return emptyOsrm();
        }
    }

    function attachTraffic(graph, trafficResult) {
        const incidents = trafficResult?.incidents || [];
        const coverage = Boolean(trafficResult?.coverage && incidents.length);
        const snapDistance = graph.fit
            ? 70 * graph.fit.scale
            : 48;
        const markers = [];
        for (const edge of graph.rawEdges) edge.trafficSeverity = 0;
        for (const incident of incidents) {
            const severity = Math.max(1, incidentSeverity(incident));
            const points = extractIncidentPoints(incident);
            for (const raw of points) {
                if (
                    Math.abs(raw.lat - graph.lat) > 0.08 ||
                    Math.abs(raw.lon - graph.lon) > 0.12
                ) {
                    continue;
                }
                const point = Osm.projectOntoGraph(graph, raw.lat, raw.lon);
                const snapped = Osm.snapPointsToEdges(
                    graph.nodes,
                    graph.rawEdges,
                    [{ ...point, edgeId: null }],
                    snapDistance
                )[0];
                if (snapped.edgeId == null) continue;
                graph.rawEdges[snapped.edgeId].trafficSeverity = Math.max(
                    graph.rawEdges[snapped.edgeId].trafficSeverity || 0,
                    severity
                );
                markers.push({
                    ...snapped,
                    severity,
                    edgeId: snapped.edgeId,
                });
            }
        }
        graph.traffic = markers;
        graph.trafficCoverage = coverage || markers.length > 0;
        return graph;
    }

    function attachOsrm(graph, osrm) {
        if (!osrm || !osrm.found) {
            graph.osrm = osrm || emptyOsrm();
            return graph;
        }
        graph.osrm = {
            ...osrm,
            points: osrm.points.map(point =>
                Osm.projectOntoGraph(graph, point.lat, point.lon)
            ),
        };
        return graph;
    }

    function attachWeather(graph, weather) {
        graph.weather = weather;
        return graph;
    }

    function overlayNotes(graph, result) {
        const notes = [];
        if (!result?.found || !result.edgeIds.length) return notes;
        const path = new Set(result.edgeIds);
        const cameras = graph.cameras || [];
        const onPathCameras = cameras.filter(camera => path.has(camera.edgeId));
        if (cameras.length) {
            const mark = onPathCameras[0] || cameras[0];
            notes.push({
                id: 'cameras',
                title: 'cameras',
                body: `${onPathCameras.length} on path  ·  ${cameras.length} nearby`,
                x: mark.x,
                y: mark.y,
            });
        }
        const traffic = graph.traffic || [];
        const onPathTraffic = traffic.filter(item => path.has(item.edgeId));
        if (traffic.length) {
            const mark = onPathTraffic[0] || traffic[0];
            notes.push({
                id: 'traffic',
                title: 'traffic',
                body: `${onPathTraffic.length} on path  ·  ${traffic.length} incidents`,
                x: mark.x,
                y: mark.y,
            });
        } else if (graph.trafficCoverage === false) {
            const mid = graph.nodes[result.nodeIds[Math.floor(result.nodeIds.length / 2)]];
            if (mid) {
                notes.push({
                    id: 'traffic',
                    title: 'traffic',
                    body: 'no live coverage here',
                    x: mid.x,
                    y: mid.y,
                });
            }
        }
        if (graph.osrm?.found && graph.osrm.points.length) {
            const mark =
                graph.osrm.points[Math.floor(graph.osrm.points.length / 2)];
            const ours = result.edgeIds.reduce(
                (sum, id) => sum + graph.edges[id].distance,
                0
            );
            notes.push({
                id: 'osrm',
                title: 'osrm',
                body:
                    `${Math.round(graph.osrm.distance)}m router  ·  ` +
                    `${Math.round(ours)} dist here`,
                x: mark.x,
                y: mark.y,
            });
        }
        if (graph.weather) {
            const end = graph.nodes[result.nodeIds.at(-1)];
            notes.push({
                id: 'weather',
                title: 'weather',
                body:
                    `${Math.round(graph.weather.temperature)}°  ·  ` +
                    `${graph.weather.windSpeed.toFixed(1)}m/s  ·  ` +
                    graph.weather.label,
                x: end.x,
                y: end.y,
            });
        }
        return notes;
    }

    async function decorateGraph(graph, origin, destination, options = {}) {
        const [weather, traffic, osrm] = await Promise.all([
            fetchWeather(graph.lat, graph.lon, options),
            fetchTraffic(graph.lat, graph.lon, options),
            fetchOsrm(origin, destination, options),
        ]);
        attachWeather(graph, weather);
        attachTraffic(graph, traffic);
        attachOsrm(graph, osrm);
        return Osm.withProfile(graph, options.profile || graph.profile);
    }

    return {
        WORKER,
        fetchWeather,
        fetchTraffic,
        fetchOsrm,
        attachTraffic,
        attachOsrm,
        attachWeather,
        overlayNotes,
        decorateGraph,
        emptyOsrm,
    };
});
