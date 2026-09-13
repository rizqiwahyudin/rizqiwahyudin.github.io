from __future__ import annotations

import re
import unicodedata

_GR1X = re.compile(r"gr[\s\-]?1x", re.I)
_SPARK = re.compile(r"rtx\s*spark", re.I)
_ASUS = re.compile(r"\b(asus|proart)\b", re.I)
_LAPTOP = re.compile(
    r"\b(p16|p14|px13|pa32|laptop|bærbar|baerbar|barbar|skjerm|display|monitor)\b",
    re.I,
)
_ACCESSORY = re.compile(
    r"\b(sleeve|veske|deksel|case|bag|cover|skin|sticker|klistre)\b",
    re.I,
)


def normalize(text: str) -> str:
    folded = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in folded if not unicodedata.combining(ch)).lower()


def is_gr1x_listing(title: str, snippet: str = "") -> bool:
    """True only for the GR1X mini PC, not other ProArt laptops/screens."""
    blob = f"{title} {snippet}"
    if not blob.strip():
        return False
    if _GR1X.search(blob):
        return not _ACCESSORY.search(blob)
    if _SPARK.search(blob) and _ASUS.search(blob):
        return not _LAPTOP.search(blob)
    return False


def looks_buyable(text: str) -> bool:
    blob = normalize(text)
    if not blob:
        return False
    blocked = (
        "ikke pa lager",
        "ikke på lager",
        "out of stock",
        "coming soon",
        "kommer snart",
        "notify me",
        "gi meg beskjed",
        "sold out",
        "utsoldt",
        "forhandsbestill",
        "forhåndsbestill",
        "pre-order",
        "preorder",
    )
    if any(token in blob for token in blocked):
        return False
    positive = (
        "pa lager",
        "på lager",
        "in stock",
        "legg i handlekurv",
        "add to cart",
        "kjop na",
        "kjøp nå",
        "buy now",
        "kan kjopes",
        "kan kjøpes",
    )
    return any(token in blob for token in positive)
