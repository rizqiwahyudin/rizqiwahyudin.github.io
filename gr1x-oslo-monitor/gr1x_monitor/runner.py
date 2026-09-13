from __future__ import annotations

import concurrent.futures
import sys
import time
from collections.abc import Callable

from .config import Config
from .http import fetch
from .models import Listing, StoreResult
from .notify import fire
from .pace import Pacer
from .state import MonitorState
from .stores import STORE_SEARCHERS, poll_store


def store_names(cfg: Config) -> list[str]:
    names = [name for name in cfg.enabled_stores if name in STORE_SEARCHERS]
    if cfg.watch_urls:
        names.append("watch")
    return names


def poll_all(cfg: Config, fetcher=fetch, names: list[str] | None = None) -> list[StoreResult]:
    chosen = names if names is not None else store_names(cfg)
    results: list[StoreResult] = []
    if not chosen:
        return results
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, max(1, len(chosen)))) as pool:
        futures = {pool.submit(poll_store, name, cfg, fetcher): name for name in chosen}
        for future in concurrent.futures.as_completed(futures):
            name = futures[future]
            try:
                results.append(future.result())
            except Exception as exc:
                results.append(StoreResult(store=name, error=str(exc)))
    results.sort(key=lambda item: item.store)
    return results


def flatten(results: list[StoreResult]) -> list[Listing]:
    listings: list[Listing] = []
    for result in results:
        listings.extend(result.listings)
    return listings


def summarize(results: list[StoreResult]) -> str:
    parts: list[str] = []
    for result in results:
        if result.error and not result.listings:
            parts.append(f"{result.store}=err({result.error})")
        else:
            extra = f" err={result.error}" if result.error else ""
            parts.append(f"{result.store}={len(result.listings)}{extra}")
    return " ".join(parts)


def run_pass(
    cfg: Config,
    state: MonitorState,
    *,
    fetcher=fetch,
    fire_alert: Callable[..., None] = fire,
    stdout=None,
    pacer: Pacer | None = None,
    names: list[str] | None = None,
) -> list[Listing]:
    out = stdout or sys.stdout
    results = poll_all(cfg, fetcher=fetcher, names=names)
    if pacer is not None:
        pacer.note(results)
    listings = flatten(results)
    hits = state.fresh_hits(listings)
    stamp = time.strftime("%H:%M:%S")
    out.write(f"[{stamp}] {summarize(results)} hits={len(hits)}\n")
    out.flush()
    for listing in hits:
        fire_alert(cfg, listing)
    if hits:
        state.save()
    return hits


def loop(
    cfg: Config,
    state: MonitorState,
    *,
    once: bool = False,
    fetcher=fetch,
    sleeper: Callable[[float], None] = time.sleep,
    fire_alert: Callable[..., None] = fire,
    stdout=None,
    pacer: Pacer | None = None,
) -> None:
    pace = pacer or Pacer(cfg)
    out = stdout or sys.stdout
    while True:
        due, cooling = pace.due_stores(store_names(cfg))
        cool = pace.cooling_text(cooling)
        if cool:
            out.write(f"{cool}\n")
            out.flush()
        try:
            if due:
                run_pass(
                    cfg,
                    state,
                    fetcher=fetcher,
                    fire_alert=fire_alert,
                    stdout=out,
                    pacer=pace,
                    names=due,
                )
            else:
                out.write("all stores cooling\n")
                out.flush()
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            out.write(f"cycle error: {exc}\n")
        if once:
            state.save()
            return
        delay = pace.next_sleep()
        out.write(f"next in {delay:.1f}s\n")
        out.flush()
        sleeper(delay)
