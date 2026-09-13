from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .match import GR1X, PS5_PRO

DEFAULT_PRODUCTS: list[dict[str, Any]] = [
    {
        "id": GR1X,
        "label": "ASUS ProArt GR1X",
        "queries": ["GR1X", "ProArt GR1X", "ASUS GR1X"],
    },
    {
        "id": PS5_PRO,
        "label": "PlayStation 5 Pro",
        "queries": ["PS5 Pro", "PlayStation 5 Pro"],
    },
]

DEFAULTS: dict[str, Any] = {
    "interval_seconds": 20,
    "open_browser": True,
    "beep": True,
    "oslo_postal_code": "0150",
    "oslo_store_name_hints": [
        "Oslo",
        "Lille Grensen",
        "Storo",
        "Alnabru",
        "Alna",
        "Oslo City",
        "Karl Johan",
        "Sandvika",
    ],
    "products": DEFAULT_PRODUCTS,
    "watch_urls": [],
    "enabled_stores": [
        "power",
        "elkjop",
        "komplett",
        "netonnet",
        "multicom",
        "kjell",
        "proshop",
        "cdon",
        "asus",
    ],
    "discord_webhook": "",
    "telegram_bot_token": "",
    "telegram_chat_id": "",
    "generic_webhook": "",
    "state_path": "gr1x-state.json",
    "log_path": "alerts.log",
    "request_timeout_seconds": 15,
}


@dataclass(frozen=True)
class Product:
    id: str
    label: str
    queries: list[str]


@dataclass
class Config:
    interval_seconds: int = 20
    open_browser: bool = True
    beep: bool = True
    oslo_postal_code: str = "0150"
    oslo_store_name_hints: list[str] = field(default_factory=list)
    products: list[Product] = field(default_factory=list)
    watch_urls: list[str] = field(default_factory=list)
    enabled_stores: list[str] = field(default_factory=list)
    discord_webhook: str = ""
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    generic_webhook: str = ""
    state_path: str = "gr1x-state.json"
    log_path: str = "alerts.log"
    request_timeout_seconds: float = 15
    root: Path = field(default_factory=lambda: Path.cwd())

    @property
    def queries(self) -> list[str]:
        seen: list[str] = []
        for product in self.products:
            for query in product.queries:
                if query not in seen:
                    seen.append(query)
        return seen

    @property
    def state_file(self) -> Path:
        path = Path(self.state_path)
        return path if path.is_absolute() else self.root / path

    @property
    def log_file(self) -> Path:
        path = Path(self.log_path)
        return path if path.is_absolute() else self.root / path

    def has_product(self, product_id: str) -> bool:
        return any(product.id == product_id for product in self.products)

    def product_label(self, product_id: str) -> str:
        for product in self.products:
            if product.id == product_id:
                return product.label
        return product_id

    def queries_for(self, product_id: str) -> list[str]:
        for product in self.products:
            if product.id == product_id:
                return list(product.queries)
        return []


def _parse_products(data: dict[str, Any]) -> list[Product]:
    raw = data.get("products")
    if raw:
        products: list[Product] = []
        for item in raw:
            queries = [str(q) for q in item.get("queries") or [] if str(q).strip()]
            if not queries:
                continue
            products.append(
                Product(
                    id=str(item.get("id") or queries[0]).lower().replace(" ", "-"),
                    label=str(item.get("label") or item.get("id") or queries[0]),
                    queries=queries,
                )
            )
        if products:
            return products
    legacy = [str(x) for x in data.get("queries") or [] if str(x).strip()]
    if legacy:
        return [Product(id="custom", label="Custom", queries=legacy)]
    return [
        Product(id=str(item["id"]), label=str(item["label"]), queries=list(item["queries"]))
        for item in DEFAULT_PRODUCTS
    ]


def load_config(path: Path | None) -> Config:
    data = dict(DEFAULTS)
    root = Path.cwd()
    if path is not None:
        loaded = json.loads(path.read_text(encoding="utf-8"))
        data.update(loaded)
        root = path.parent
    interval = max(8, int(data["interval_seconds"]))
    return Config(
        interval_seconds=interval,
        open_browser=bool(data["open_browser"]),
        beep=bool(data["beep"]),
        oslo_postal_code=str(data["oslo_postal_code"]),
        oslo_store_name_hints=[str(x) for x in data["oslo_store_name_hints"]],
        products=_parse_products(data),
        watch_urls=[str(x) for x in data["watch_urls"] if str(x).strip()],
        enabled_stores=[str(x) for x in data["enabled_stores"]],
        discord_webhook=str(data.get("discord_webhook") or ""),
        telegram_bot_token=str(data.get("telegram_bot_token") or ""),
        telegram_chat_id=str(data.get("telegram_chat_id") or ""),
        generic_webhook=str(data.get("generic_webhook") or ""),
        state_path=str(data["state_path"]),
        log_path=str(data["log_path"]),
        request_timeout_seconds=float(data["request_timeout_seconds"]),
        root=root,
    )
