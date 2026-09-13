from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import BUYABLE, Listing


class MonitorState:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.seen: dict[str, str] = {}

    @classmethod
    def load(cls, path: Path) -> MonitorState:
        state = cls(path)
        if not path.exists():
            return state
        raw = json.loads(path.read_text(encoding="utf-8"))
        seen = raw.get("seen", raw)
        if isinstance(seen, dict):
            state.seen = {str(k): str(v) for k, v in seen.items()}
        return state

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload: dict[str, Any] = {"seen": self.seen}
        self.path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    def fresh_hits(self, listings: list[Listing]) -> list[Listing]:
        hits: list[Listing] = []
        for listing in listings:
            previous = self.seen.get(listing.key)
            if previous is None:
                hits.append(listing)
                self.seen[listing.key] = listing.status
                continue
            if previous != BUYABLE and listing.buyable:
                hits.append(listing)
                self.seen[listing.key] = BUYABLE
        return hits
