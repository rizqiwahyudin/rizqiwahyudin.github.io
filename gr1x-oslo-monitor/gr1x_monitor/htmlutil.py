from __future__ import annotations

import html as html_lib
import json
import re
from html.parser import HTMLParser
from typing import Any

from .http import abs_url

_JSON_LD = re.compile(
    r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.I | re.S,
)
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)


def unescape(text: str) -> str:
    return html_lib.unescape(re.sub(r"\s+", " ", text or "")).strip()


def page_title(html: str) -> str:
    match = _TITLE.search(html)
    return unescape(re.sub(r"<[^>]+>", "", match.group(1))) if match else ""


def iter_json_ld(html: str) -> list[Any]:
    blobs: list[Any] = []
    for match in _JSON_LD.finditer(html):
        raw = match.group(1).strip()
        if not raw:
            continue
        try:
            blobs.append(json.loads(raw))
        except json.JSONDecodeError:
            continue
    return blobs


def products_from_json_ld(html: str, base_url: str) -> list[dict[str, str]]:
    found: list[dict[str, str]] = []

    def walk(node: Any) -> None:
        if isinstance(node, list):
            for item in node:
                walk(item)
            return
        if not isinstance(node, dict):
            return
        types = node.get("@type", "")
        type_list = types if isinstance(types, list) else [types]
        type_names = {str(t).lower() for t in type_list}
        if "product" in type_names:
            name = str(node.get("name") or "")
            url = str(node.get("url") or node.get("@id") or "")
            sku = str(node.get("sku") or node.get("mpn") or "")
            if name and url:
                found.append({"title": unescape(name), "url": abs_url(base_url, url), "sku": sku})
        for value in node.values():
            walk(value)

    for blob in iter_json_ld(html):
        walk(blob)
    return found


class _AnchorParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.anchors: list[tuple[str, str]] = []
        self._href: str | None = None
        self._chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self._href = href
            self._chunks = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._chunks.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._href is not None:
            text = unescape(" ".join(self._chunks))
            self.anchors.append((self._href, text))
            self._href = None
            self._chunks = []


def anchors(html: str) -> list[tuple[str, str]]:
    parser = _AnchorParser()
    try:
        parser.feed(html)
    except Exception:
        return []
    return parser.anchors


_PRODUCT_HREF = re.compile(
    r"/(product|art|p-|produkt|productid)/",
    re.I,
)


def productish_anchors(html: str, base_url: str) -> list[dict[str, str]]:
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for href, text in anchors(html):
        if href.startswith("#") or href.startswith("javascript:"):
            continue
        if not (_PRODUCT_HREF.search(href) or "/p-" in href):
            continue
        url = abs_url(base_url, href)
        if url in seen:
            continue
        seen.add(url)
        sku = ""
        tail = url.rstrip("/").split("/")[-1]
        if re.fullmatch(r"\d+", tail) or re.fullmatch(r"p-\d+", tail):
            sku = tail.removeprefix("p-")
        out.append({"title": text, "url": url, "sku": sku})
    return out
