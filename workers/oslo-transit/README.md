# Oslo Ruter transit (static)

Turns Entur/Ruter GTFS into the compact JSON CityWatch interpolates. No Cloudflare Worker.

Ruter does not publish live GPS. Vehicles sit on today's shapes. The browser optionally layers GTFS-RT trip-update delays from Entur (CORS is open).

## Files

| Path | Role |
|---|---|
| `oslo-schedule.json` (repo root) | Full-day compact timetable, rebuilt by GitHub Actions |
| `build-schedule.mjs` | Downloads the Ruter GTFS zip and writes that JSON |
| `src/` | Parser, downsample, tests |

## Refresh

`.github/workflows/oslo-schedule.yml` runs four times a day and on `workflow_dispatch`. It commits `oslo-schedule.json` when the timetable changes.

Local rebuild:

```bash
cd workers/oslo-transit
npm test
npm run build
```

Identify as `ET-Client-Name: rizqi-citywatch` (NLOD).
