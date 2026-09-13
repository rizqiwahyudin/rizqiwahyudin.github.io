from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


LISTED = "listed"
BUYABLE = "buyable"


@dataclass(frozen=True)
class Listing:
    store: str
    title: str
    url: str
    sku: str = ""
    price_nok: float | None = None
    buyable: bool = False
    stock_text: str = ""
    oslo_stock: str = ""
    query: str = ""

    @property
    def status(self) -> str:
        return BUYABLE if self.buyable else LISTED

    @property
    def key(self) -> str:
        ident = self.sku or self.url
        return f"{self.store}:{ident}"

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["status"] = self.status
        data["key"] = self.key
        return data


@dataclass
class StoreResult:
    store: str
    listings: list[Listing] = field(default_factory=list)
    error: str = ""
    raw_count: int = 0
