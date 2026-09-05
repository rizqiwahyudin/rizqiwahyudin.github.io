'use strict';

/** Extended GTFS route_type → citywatch mode. */
export const ROUTE_TYPE_MODE = {
    0: 'tram',
    1: 'metro',
    2: 'rail',
    3: 'bus',
    4: 'ferry',
    5: 'tram',
    6: 'gondola',
    7: 'funicular',
    401: 'metro',   // T-bane
    702: 'bus',     // express / E-lines
    704: 'bus',     // regional
    705: 'bus',     // night
    712: 'bus',     // local / school
    900: 'tram',
    902: 'tram',    // trikk
    1000: 'ferry',
    1008: 'ferry',  // øyene
};

export const MODE_DEFAULT_HEX = {
    metro: 'EC700C',
    tram: '0E7C66',
    bus: 'E60000',
    ferry: '0077C8',
    rail: '6B4C9A',
};

export function modeFromRouteType(routeType) {
    const n = parseInt(routeType, 10);
    return ROUTE_TYPE_MODE[n] || 'bus';
}

export function hexToRgb01(hex) {
    const h = String(hex || '').replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [
        parseInt(h.slice(0, 2), 16) / 255,
        parseInt(h.slice(2, 4), 16) / 255,
        parseInt(h.slice(4, 6), 16) / 255,
    ];
}

export function routeColorHex(route, mode) {
    const raw = (route && route.route_color) || '';
    const cleaned = String(raw).replace('#', '').trim();
    if (/^[0-9a-fA-F]{6}$/.test(cleaned)) return cleaned.toUpperCase();
    return MODE_DEFAULT_HEX[mode] || MODE_DEFAULT_HEX.bus;
}
