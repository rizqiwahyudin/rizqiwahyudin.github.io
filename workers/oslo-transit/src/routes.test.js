'use strict';

import assert from 'node:assert/strict';
import { modeFromRouteType, hexToRgb01, routeColorHex } from './routes.js';

assert.equal(modeFromRouteType(401), 'metro');
assert.equal(modeFromRouteType('902'), 'tram');
assert.equal(modeFromRouteType(704), 'bus');
assert.equal(modeFromRouteType(1008), 'ferry');
assert.equal(modeFromRouteType(3), 'bus');

assert.deepEqual(hexToRgb01('EC700C'), [0xEC / 255, 0x70 / 255, 0x0C / 255]);
assert.equal(hexToRgb01('zzz'), null);
assert.equal(routeColorHex({ route_color: 'EC700C' }, 'metro'), 'EC700C');
assert.equal(routeColorHex({ route_color: '' }, 'tram'), '0E7C66');

console.log('routes.test.js ok');
