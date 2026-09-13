from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

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
    "queries": ["GR1X", "ProArt GR1X", "ASUS GR1X"],
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


@dataclass
class Config:
    interval_seconds: int = 20
    open_browser: bool = True
    beep: bool = True
    oslo_postal_code: str = "0150"
    oslo_store_name_hints: list[str] = field(default_factory=list)
    queries: list[str] = field(default_factory=list)
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
    def state_file(self) -> Path:
        path = Path(self.state_path)
        return path if path.is_absolute() else self.root / path

    @property
    def log_file(self) -> Path:
        path = Path(self.log_path)
        return path if path.is_absolute() else self.root / path


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
        queries=[str(x) for x in data["queries"] if str(x).strip()],
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
