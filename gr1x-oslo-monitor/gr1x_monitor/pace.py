from __future__ import annotations

import random
import re
import time

from .config import Config
from .models import StoreResult

_BLOCKED = re.compile(
    r"(429|403|503|502|timed?\s*out|timeout|too many requests|challenge)",
    re.I,
)


def is_blocked(result: StoreResult) -> bool:
    if result.listings:
        return False
    return bool(result.error) and bool(_BLOCKED.search(result.error))


class Pacer:
    """Jittered cycle delay plus per-store cooldown after 429/403/timeouts."""

    def __init__(
        self,
        cfg: Config,
        *,
        rng: random.Random | None = None,
        clock=time.monotonic,
    ) -> None:
        self.cfg = cfg
        self.rng = rng or random.Random()
        self.clock = clock
        self.ready_at: dict[str, float] = {}
        self.strikes: dict[str, int] = {}

    def due_stores(self, names: list[str]) -> tuple[list[str], list[tuple[str, float]]]:
        now = self.clock()
        due: list[str] = []
        cooling: list[tuple[str, float]] = []
        for name in names:
            wait = self.ready_at.get(name, 0) - now
            if wait > 0:
                cooling.append((name, wait))
            else:
                due.append(name)
        return due, cooling

    def note(self, results: list[StoreResult]) -> None:
        now = self.clock()
        for result in results:
            if is_blocked(result):
                strikes = self.strikes.get(result.store, 0) + 1
                self.strikes[result.store] = strikes
                delay = min(
                    self.cfg.backoff_max_seconds,
                    float(self.cfg.interval_seconds) * (2**strikes),
                )
                self.ready_at[result.store] = now + delay
            else:
                self.strikes[result.store] = 0
                self.ready_at.pop(result.store, None)

    def next_sleep(self) -> float:
        low = float(self.cfg.interval_seconds)
        high = float(max(self.cfg.interval_seconds, self.cfg.interval_max_seconds))
        if high <= low:
            return low
        return self.rng.uniform(low, high)

    def cooling_text(self, cooling: list[tuple[str, float]]) -> str:
        if not cooling:
            return ""
        bits = [f"{name}={wait:.0f}s" for name, wait in cooling]
        return "cooling " + " ".join(bits)
