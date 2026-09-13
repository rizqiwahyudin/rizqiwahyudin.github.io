from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import load_config
from .http import fetch
from .runner import loop, poll_all, summarize
from .state import MonitorState
from .stores import STORE_SEARCHERS


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Watch Norwegian stores for ASUS ProArt GR1X and alert on listing/stock."
    )
    parser.add_argument(
        "--config",
        default=None,
        help="Path to config.json (default: ./config.json if present, else built-in defaults)",
    )
    parser.add_argument("--once", action="store_true", help="Single poll, then exit")
    parser.add_argument("--self-check", action="store_true", help="Ping each store and print reachability")
    return parser


def resolve_config_path(raw: str | None) -> Path | None:
    if raw:
        path = Path(raw)
        if not path.exists():
            raise SystemExit(f"config not found: {path}")
        return path
    candidate = Path.cwd() / "config.json"
    example = Path.cwd() / "config.example.json"
    if candidate.exists():
        return candidate
    if example.exists():
        return example
    return None


def self_check(cfg) -> int:
    print(f"queries: {cfg.queries}")
    print(f"oslo postal: {cfg.oslo_postal_code}")
    print(f"interval: {cfg.interval_seconds}s")
    results = poll_all(cfg, fetcher=fetch)
    print(summarize(results))
    code = 0
    for result in results:
        status = "OK"
        detail = f"{len(result.listings)} listing(s)"
        if result.error and not result.listings:
            status = "DOWN"
            detail = result.error
            if result.store in STORE_SEARCHERS:
                code = 0  # stores being blocked from a VPS is expected
        elif result.error:
            status = "PARTIAL"
            detail = f"{len(result.listings)} listing(s); {result.error}"
        print(f"  {status:8} {result.store:10} {detail}")
        for listing in result.listings:
            print(f"           -> {listing.status} {listing.title} {listing.url}")
    print("GR1X is still unlisted if every store shows 0 listing(s). Leave the monitor running.")
    return code


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cfg = load_config(resolve_config_path(args.config))
    if args.self_check:
        return self_check(cfg)
    state = MonitorState.load(cfg.state_file)
    print(
        f"watching GR1X in Norway / Oslo every {cfg.interval_seconds}s "
        f"({', '.join(cfg.enabled_stores)})"
    )
    print(f"state: {cfg.state_file}")
    if cfg.discord_webhook:
        print("discord: on")
    if cfg.telegram_bot_token:
        print("telegram: on")
    try:
        loop(cfg, state, once=args.once)
    except KeyboardInterrupt:
        print("\nstopped")
        state.save()
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
