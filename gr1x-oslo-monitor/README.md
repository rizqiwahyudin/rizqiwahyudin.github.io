# Oslo drop monitor — ASUS ProArt GR1X + PS5 Pro

Watches Norwegian retailers for the **ASUS ProArt GR1X** and **PlayStation 5 Pro**. Pings you when a listing appears or stock flips to buyable. Power also checks Oslo pickup for postal `0150`.

GR1X is still unlisted (IFA 2026). PS5 Pro is listed and usually sold out — that listing is the live proof the store search works.

Copy this whole folder anywhere. It does not depend on the rest of this repository. Python 3.11+ standard library only.

## Run it

```bash
cd gr1x-oslo-monitor
cp config.example.json config.json
# edit config.json — add a Discord or Telegram webhook if you want a phone ping
python3 run.py --once          # one pass, see current status
python3 run.py                 # keep watching
python3 run.py --self-check    # which stores answer from your network
```

`--once` is what you want the first time. You should see the PS5 Pro console on Power as `listed` (not buyable). GR1X should stay at zero until it exists.

The process has to stay alive to keep polling. Laptop with sleep off, a Pi on your home network, or a cheap VPS. Home IP reaches Elkjøp/Komplett more often than a datacenter.

```bash
tmux new -s gr1x 'cd /path/to/gr1x-oslo-monitor && python3 run.py'
```

## What it does on a hit

1. Prints a loud banner with store, title, price, URL, Oslo pickup if known
2. Writes `alerts.log`
3. Opens the product page in your default browser (`open_browser`)
4. Posts Discord / Telegram / generic webhook if configured
5. Remembers the listing so it does not spam — re-alerts if it flips from *listed* to *buyable*

It does **not** enter card details or complete checkout. You buy it on the store page it opens.

## Stores

| Store | How it searches | Oslo angle |
| --- | --- | --- |
| Power.no | Public product-list JSON | Store stock for postal `0150` (Lille Grensen, Storo, Alnabru, …) |
| Elkjøp | Search page | Works best from a normal home IP |
| Komplett | Search page | Same — Akamai often blocks datacenters |
| NetOnNet | Search page | |
| Multicom | Search page | |
| Kjell & Company | Search page | |
| Proshop | Search page | Cloudflare; home IP is better |
| CDON | Search page | |
| ASUS Norge / global | Official GR1X pages + search | Fires only when a Norwegian retailer is named on the product page |

Power is the store used to verify the hookup: it returns `PlayStation 5 Pro-konsoll` (10 999 NOK, stock 0) and ignores covers/disk drives. Elkjøp/Komplett/Proshop/CDON are often blocked from datacenters and work from a home IP in Oslo.

Add extra product URLs to `watch_urls` in `config.json` the second you see a SKU anywhere (Twitter, Discord, ASUS mail). Those pages get polled every cycle.

## Matching

- **GR1X:** title has GR1X, or RTX Spark + ASUS/ProArt on a desktop/mini-PC. Ignores P16 / P14 / PX13 / skjerm / sleeves.
- **PS5 Pro:** PlayStation 5 / PS5 + Pro + console/konsoll. Ignores covers, disk drives, install services.

## Config

`config.example.json` is the template. `config.json` is gitignored.

Useful knobs:

- `interval_seconds` / `interval_max_seconds` — each cycle waits a random time in that window (default 20–45s). Floor is 8.
- `backoff_max_seconds` — a store that returns 429/403/timeout is skipped and the wait doubles, up to this cap (default 300s). Success puts it back on the normal cadence.
- `oslo_postal_code` — `0150` for Sentrum; `0480` Storo, `0661` Alnabru if you prefer those Power stores first.
- `open_browser` — set `false` on a headless VPS.
- `discord_webhook` — Discord channel → Integrations → Webhooks → copy URL.
- `telegram_bot_token` + `telegram_chat_id` — message `@BotFather`, then message your bot, then `https://api.telegram.org/bot<token>/getUpdates` for the chat id.

## Transfer

Zip or `scp` the folder. On the new machine:

```bash
python3 run.py --self-check
python3 -m unittest discover -s tests -v
python3 run.py
```

State lives in `gr1x-state.json` next to the config. Delete it if you want every current listing treated as new.

## Tests

```bash
python3 -m unittest discover -s tests -v
```
