# citywatch-oslo-transit

Cloudflare Worker that turns Entur/Ruter GTFS into the compact JSON CityWatch already interpolates.

Ruter does not publish live GPS. Vehicles are placed on shapes from today's timetable, then delayed with GTFS-RT trip updates when Entur's feed is up.

## Endpoints

| Path | Role |
|---|---|
| `GET /gtfs-rt/oslo-schedule.json` | trips + downsampled shapes for a ~3h window around now |
| `GET /gtfs-rt/oslo-live.json` | `{ serverTime, vehicles: [{ tripId, delay }] }` |
| `GET /proxy/transit-trip?tripId=` | line, headsign, next stops |
| `GET /health` | liveness |

Schedule is rebuilt on a 3-hour cron and cached at the edge. First request after a cold cache downloads the ~53 MB Ruter GTFS zip and streams `stop_times` / `shapes` so the worker never holds the uncompressed 300 MB archive.

Identify as `ET-Client-Name: rizqi-citywatch` (NLOD). Change that string if you deploy under another name.

## Deploy

```bash
cd workers/oslo-transit
npx wrangler login
npx wrangler deploy
```

That publishes `https://citywatch-oslo-transit.<your-subdomain>.workers.dev`. CityWatch is wired to:

`https://citywatch-oslo-transit.rizqi-wahyudin.workers.dev`

If your workers.dev subdomain differs, change `OSLO_TRANSIT_WORKER` in `citywatch.html`.

## Local tests

```bash
cd workers/oslo-transit
npm test
```

No Entur key is required. The GTFS zip is public.
