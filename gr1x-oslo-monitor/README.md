# ASUS ProArt GR1X — Oslo drop monitor

Watches Norwegian retailers for the **ASUS ProArt GR1X** (RTX Spark mini PC) and pings you the moment a listing or buyable stock appears. Oslo store stock is checked on Power once a product ID exists.

Announced at IFA 2026. No Norwegian listing as of 13 Sep 2026. This is ready to leave running until that changes.

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

`--once` is what you want the first time. Then leave `python3 run.py` running in tmux / a terminal.

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

Live check from a datacenter on 13 Sep 2026: Power, Kjell, NetOnNet, Multicom, ASUS answered; **0 GR1X listings**. Elkjøp (429), Komplett (timeout), Proshop/CDON (403) are blocked here — they usually work from a home IP in Oslo.

Add extra product URLs to `watch_urls` in `config.json` the second you see a SKU anywhere (Twitter, Discord, ASUS mail). Those pages get polled every cycle.

## Matching

A hit needs **GR1X** in the title/snippet, or **RTX Spark** together with ASUS/ProArt on a desktop/mini-PC (not P16 / P14 / PX13 / skjerm).

## Config

`config.example.json` is the template. `config.json` is gitignored.

Useful knobs:

- `interval_seconds` — 20 is a reasonable default. Do not go below 8.
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
