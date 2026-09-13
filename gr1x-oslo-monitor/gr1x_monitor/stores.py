from __future__ import annotations

import json
import re
import urllib.parse
from collections.abc import Callable
from typing import Any

from . import htmlutil
from .config import Config
from .http import HttpResponse, abs_url, fetch
from .match import is_gr1x_listing, looks_buyable
from .models import Listing, StoreResult

Fetcher = Callable[..., HttpResponse]


def _price(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = re.sub(r"[^\d,.]", "", str(value)).replace(" ", "")
    if not text:
        return None
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _listing_from_card(
    store: str,
    card: dict[str, str],
    query: str,
    page_text: str = "",
) -> Listing | None:
    title = card.get("title") or ""
    snippet = card.get("snippet") or ""
    if not is_gr1x_listing(title, snippet):
        return None
    blob = f"{title} {snippet} {page_text}"
    return Listing(
        store=store,
        title=title or "ASUS ProArt GR1X",
        url=card["url"],
        sku=card.get("sku") or "",
        price_nok=_price(card.get("price")),
        buyable=looks_buyable(blob),
        stock_text=snippet,
        query=query,
    )


def _dedupe(listings: list[Listing]) -> list[Listing]:
    seen: set[str] = set()
    out: list[Listing] = []
    for item in listings:
        if item.key in seen:
            continue
        seen.add(item.key)
        out.append(item)
    return out


def search_power(cfg: Config, fetcher: Fetcher = fetch) -> StoreResult:
    listings: list[Listing] = []
    total = 0
    last_error = ""
    for query in cfg.queries:
        url = (
            "https://www.power.no/api/v2/productlists?"
            + urllib.parse.urlencode({"q": query, "size": 24, "startIndex": 0})
        )
        try:
            resp = fetcher(url, timeout=cfg.request_timeout_seconds, accept="application/json")
        except Exception as exc:
            last_error = str(exc)
            continue
        if resp.status != 200:
            last_error = f"HTTP {resp.status}"
            continue
        try:
            payload = resp.json()
        except json.JSONDecodeError:
            last_error = "invalid json"
            continue
        products = payload.get("products") or []
        total += int(payload.get("totalProductCount") or len(products))
        for product in products:
            title = str(product.get("title") or "")
            snippet = str(product.get("shortDescription") or "")
            if not is_gr1x_listing(title, snippet):
                continue
            path = str(product.get("url") or "")
            product_url = abs_url("https://www.power.no/", path)
            buyable = bool(product.get("canAddToCart")) or int(product.get("stockCount") or 0) > 0
            oslo = ""
            sku = str(product.get("productId") or "")
            if sku:
                oslo = _power_oslo_stock(cfg, sku, fetcher)
            listings.append(
                Listing(
                    store="power",
                    title=title,
                    url=product_url,
                    sku=sku,
                    price_nok=_price(product.get("price")),
                    buyable=buyable,
                    stock_text=str(product.get("webStockText") or ""),
                    oslo_stock=oslo,
                    query=query,
                )
            )
    return StoreResult(store="power", listings=_dedupe(listings), error=last_error, raw_count=total)


def _power_oslo_stock(cfg: Config, product_id: str, fetcher: Fetcher) -> str:
    url = (
        f"https://www.power.no/api/v2/products/{product_id}/stores?"
        + urllib.parse.urlencode({"postalCode": cfg.oslo_postal_code})
    )
    try:
        resp = fetcher(url, timeout=cfg.request_timeout_seconds, accept="application/json")
        stores = resp.json()
    except Exception:
        return ""
    if not isinstance(stores, list):
        return ""
    hints = [h.lower() for h in cfg.oslo_store_name_hints]
    bits: list[str] = []
    for store in stores:
        name = str(store.get("name") or "")
        city = str(store.get("city") or "")
        region = str(store.get("region") or "")
        blob = f"{name} {city} {region}".lower()
        if not any(h in blob for h in hints):
            continue
        qty = store.get("storeDisplayStock")
        avail = store.get("storeAvailability")
        if qty or avail in (1, 2):
            bits.append(f"{name}: {qty}")
    return "; ".join(bits[:8])


def _html_search(
    store: str,
    search_url: str,
    cfg: Config,
    fetcher: Fetcher,
    extra_href_needles: tuple[str, ...] = (),
) -> StoreResult:
    listings: list[Listing] = []
    last_error = ""
    raw = 0
    for query in cfg.queries:
        url = search_url.format(q=urllib.parse.quote_plus(query))
        try:
            resp = fetcher(url, timeout=cfg.request_timeout_seconds)
        except Exception as exc:
            last_error = str(exc)
            continue
        if resp.status != 200:
            last_error = f"HTTP {resp.status}"
            continue
        html = resp.body
        raw += 1
        cards = htmlutil.products_from_json_ld(html, resp.url)
        cards.extend(htmlutil.productish_anchors(html, resp.url))
        if extra_href_needles:
            for href, text in htmlutil.anchors(html):
                if any(needle in href.lower() for needle in extra_href_needles):
                    cards.append(
                        {
                            "title": text or htmlutil.page_title(html),
                            "url": abs_url(resp.url, href),
                            "sku": "",
                        }
                    )
        title = htmlutil.page_title(html)
        if is_gr1x_listing(title, html[:4000]) and not cards:
            cards.append({"title": title, "url": resp.url, "sku": ""})
        for card in cards:
            item = _listing_from_card(store, card, query, html[:6000])
            if item:
                listings.append(item)
    return StoreResult(store=store, listings=_dedupe(listings), error=last_error, raw_count=raw)


def search_elkjop(cfg: Config, fetcher: Fetcher = fetch) -> StoreResult:
    return _html_search("elkjop", "https://www.elkjop.no/search?q={q}", cfg, fetcher)


def search_komplett(cfg: Config, fetcher: Fetcher = fetch) -> StoreResult:
    return _html_search(
        "komplett",
        "https://www.komplett.no/search?q={q}&list_view=list",
        cfg,
        fetcher,
    )


def search_netonnet(cfg: Config, fetcher: Fetcher = fetch) -> StoreResult:
    return _html_search(
        "netonnet",
        "https://www.netonnet.no/search?query={q}",
        cfg,
        fetcher,
        extra_href_needles=("/art/",),
    )


def search_multicom(cfg: Config, fetcher: Fetcher = fetch) -> StoreResult:
    return _html_search("multicom", "https://www.multicom.no/search?q={q}", cfg, fetcher)


def search_kjell(cfg: Config, fetcher: Fetcher = fetch) -> StoreResult:
    return _html_search("kjell", "https://www.kjell.com/no/sok?q={q}", cfg, fetcher)


def search_proshop(cfg: Config, fetcher: Fetcher = fetch) -> StoreResult:
    return _html_search("proshop", "https://www.proshop.no/Search?s={q}", cfg, fetcher)


def search_cdon(cfg: Config, fetcher: Fetcher = fetch) -> StoreResult:
    return _html_search("cdon", "https://cdon.no/search?q={q}", cfg, fetcher)


_ASUS_PAGES = (
    "https://www.asus.com/no/displays-desktops/mini-pcs/proart-mini-pc-series/proart-gr1x-mini-pc/",
    "https://www.asus.com/displays-desktops/mini-pcs/proart-mini-pc-series/proart-gr1x-mini-pc/",
    "https://www.asus.com/us/displays-desktops/mini-pcs/proart-mini-pc-series/proart-gr1x-mini-pc/",
)

_RETAILER_HINT = re.compile(
    r"(where to buy|hvor du kan kj.pe|authorized dealer|forhandler|buy now|kj.p n.|shop now|retailer)",
    re.I,
)


def search_asus(cfg: Config, fetcher: Fetcher = fetch) -> StoreResult:
    listings: list[Listing] = []
    last_error = ""
    raw = 0
    for page in _ASUS_PAGES:
        try:
            resp = fetcher(page, timeout=cfg.request_timeout_seconds)
        except Exception as exc:
            last_error = str(exc)
            continue
        raw += 1
        if resp.status != 200:
            last_error = f"HTTP {resp.status} on {page}"
            continue
        title = htmlutil.page_title(resp.body) or "ASUS ProArt GR1X"
        if not is_gr1x_listing(title, resp.body[:3000]) and "gr1x" not in page.lower():
            continue
        buyable = bool(_RETAILER_HINT.search(resp.body)) and looks_buyable(resp.body)
        # Official spec page existing is useful, but we only alert as a listing
        # once retailer/buy language appears, or the NO search starts returning it.
        if _RETAILER_HINT.search(resp.body) or "elkjop" in resp.body.lower() or "komplett" in resp.body.lower():
            listings.append(
                Listing(
                    store="asus",
                    title=title,
                    url=resp.url,
                    buyable=buyable,
                    stock_text="retailer links present on official page",
                    query="official",
                )
            )
    search_url = "https://www.asus.com/no/searchresult?searchKey={q}"
    extra = _html_search("asus", search_url, cfg, fetcher)
    listings.extend(extra.listings)
    if extra.error and not last_error:
        last_error = extra.error
    return StoreResult(store="asus", listings=_dedupe(listings), error=last_error, raw_count=raw)


def watch_urls(cfg: Config, fetcher: Fetcher = fetch) -> StoreResult:
    listings: list[Listing] = []
    last_error = ""
    for url in cfg.watch_urls:
        try:
            resp = fetcher(url, timeout=cfg.request_timeout_seconds)
        except Exception as exc:
            last_error = str(exc)
            continue
        if resp.status != 200:
            last_error = f"HTTP {resp.status}"
            continue
        title = htmlutil.page_title(resp.body) or url
        snippet = resp.body[:8000]
        if not is_gr1x_listing(title, snippet) and "gr1x" not in url.lower():
            # User pinned this URL on purpose.
            pass
        listings.append(
            Listing(
                store="watch",
                title=title,
                url=resp.url,
                buyable=looks_buyable(snippet),
                stock_text="pinned URL",
                query="watch_urls",
            )
        )
    return StoreResult(store="watch", listings=_dedupe(listings), error=last_error, raw_count=len(cfg.watch_urls))


STORE_SEARCHERS: dict[str, Callable[[Config, Fetcher], StoreResult]] = {
    "power": search_power,
    "elkjop": search_elkjop,
    "komplett": search_komplett,
    "netonnet": search_netonnet,
    "multicom": search_multicom,
    "kjell": search_kjell,
    "proshop": search_proshop,
    "cdon": search_cdon,
    "asus": search_asus,
}


def poll_store(name: str, cfg: Config, fetcher: Fetcher = fetch) -> StoreResult:
    if name == "watch":
        return watch_urls(cfg, fetcher)
    searcher = STORE_SEARCHERS.get(name)
    if searcher is None:
        return StoreResult(store=name, error=f"unknown store {name}")
    return searcher(cfg, fetcher)
