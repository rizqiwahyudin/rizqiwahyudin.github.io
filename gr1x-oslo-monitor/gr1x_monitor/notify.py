from __future__ import annotations

import datetime as dt
import sys
import webbrowser
from typing import Callable

from .config import Config
from .http import post_json
from .models import Listing

Poster = Callable[..., object]


def format_alert(listing: Listing) -> str:
    price = f"{listing.price_nok:.0f} NOK" if listing.price_nok is not None else "price unknown"
    oslo = listing.oslo_stock or "no Oslo pickup count yet"
    return (
        f"GR1X {listing.status.upper()} @ {listing.store}\n"
        f"{listing.title}\n"
        f"{price}\n"
        f"{listing.url}\n"
        f"stock: {listing.stock_text or 'n/a'}\n"
        f"Oslo: {oslo}"
    )


def banner(listing: Listing) -> str:
    body = format_alert(listing)
    line = "=" * 72
    return f"\n{line}\n{body}\n{line}\n"


def append_log(cfg: Config, listing: Listing) -> None:
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    cfg.log_file.parent.mkdir(parents=True, exist_ok=True)
    with cfg.log_file.open("a", encoding="utf-8") as handle:
        handle.write(f"[{stamp}]\n{format_alert(listing)}\n\n")


def notify_discord(cfg: Config, listing: Listing, poster: Poster = post_json) -> None:
    if not cfg.discord_webhook:
        return
    poster(
        cfg.discord_webhook,
        {
            "content": f"@everyone GR1X {listing.status} on {listing.store}",
            "embeds": [
                {
                    "title": listing.title,
                    "url": listing.url,
                    "description": format_alert(listing),
                    "color": 0xFF0033 if listing.buyable else 0xFFAA00,
                }
            ],
        },
        timeout=cfg.request_timeout_seconds,
    )


def notify_telegram(cfg: Config, listing: Listing, poster: Poster = post_json) -> None:
    if not (cfg.telegram_bot_token and cfg.telegram_chat_id):
        return
    url = f"https://api.telegram.org/bot{cfg.telegram_bot_token}/sendMessage"
    poster(
        url,
        {
            "chat_id": cfg.telegram_chat_id,
            "text": format_alert(listing),
            "disable_web_page_preview": False,
        },
        timeout=cfg.request_timeout_seconds,
    )


def notify_generic(cfg: Config, listing: Listing, poster: Poster = post_json) -> None:
    if not cfg.generic_webhook:
        return
    poster(cfg.generic_webhook, listing.to_dict(), timeout=cfg.request_timeout_seconds)


def open_listing(listing: Listing, opener: Callable[[str], bool] | None = None) -> None:
    open_fn = opener or webbrowser.open
    open_fn(listing.url)


def beep() -> None:
    sys.stdout.write("\a")
    sys.stdout.flush()


def fire(
    cfg: Config,
    listing: Listing,
    *,
    poster: Poster = post_json,
    opener: Callable[[str], bool] | None = None,
    stdout=None,
) -> None:
    out = stdout or sys.stdout
    out.write(banner(listing))
    out.flush()
    append_log(cfg, listing)
    if cfg.beep:
        beep()
    notify_discord(cfg, listing, poster=poster)
    notify_telegram(cfg, listing, poster=poster)
    notify_generic(cfg, listing, poster=poster)
    if cfg.open_browser:
        open_listing(listing, opener=opener)
