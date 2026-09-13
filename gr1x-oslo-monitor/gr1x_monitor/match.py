from __future__ import annotations

import re
import unicodedata

GR1X = "gr1x"
PS5_PRO = "ps5-pro"

_GR1X = re.compile(r"gr[\s\-]?1x", re.I)
_SPARK = re.compile(r"rtx\s*spark", re.I)
_ASUS = re.compile(r"\b(asus|proart)\b", re.I)
_LAPTOP = re.compile(
    r"\b(p16|p14|px13|pa32|laptop|bærbar|baerbar|barbar|skjerm|display|monitor)\b",
    re.I,
)
_ACCESSORY = re.compile(
    r"(sleeve|veske|deksel|deksler|case|bag|cover|skin|sticker|klistre|"
    r"diskstasjon|installering|tjeneste|headset|ladekabel|"
    r"\b(lader|gamepad|kontroll|kontroller|faceplate|stand|vertical)\b)",
    re.I,
)
_PS5 = re.compile(r"(ps[\s\-]?5|playstation\s*5)", re.I)
_PRO = re.compile(r"\bpro\b", re.I)
_CONSOLE = re.compile(r"\b(konsoll|console)\b", re.I)


def normalize(text: str) -> str:
    folded = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in folded if not unicodedata.combining(ch)).lower()


def is_gr1x_listing(title: str, snippet: str = "") -> bool:
    return classify(title, snippet) == GR1X


def is_ps5_pro_listing(title: str, snippet: str = "") -> bool:
    return classify(title, snippet) == PS5_PRO


def classify(title: str, snippet: str = "") -> str | None:
    blob = f"{title} {snippet}"
    if not blob.strip():
        return None
    if _GR1X.search(blob):
        return None if _ACCESSORY.search(blob) else GR1X
    if _SPARK.search(blob) and _ASUS.search(blob):
        return None if _LAPTOP.search(blob) else GR1X
    if _PS5.search(blob) and _PRO.search(blob):
        if _ACCESSORY.search(blob):
            return None
        if _CONSOLE.search(blob) or re.search(r"playstation\s*5\s*pro|ps[\s\-]?5\s*pro", blob, re.I):
            return PS5_PRO
    return None


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
