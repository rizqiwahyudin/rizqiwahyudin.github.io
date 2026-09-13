import random
import unittest

from gr1x_monitor.config import load_config
from gr1x_monitor.models import StoreResult
from gr1x_monitor.pace import Pacer, is_blocked
from gr1x_monitor.runner import loop, store_names


class PaceTests(unittest.TestCase):
    def test_sleep_stays_in_window(self):
        cfg = load_config(None)
        cfg.interval_seconds = 20
        cfg.interval_max_seconds = 45
        pacer = Pacer(cfg, rng=random.Random(0))
        samples = [pacer.next_sleep() for _ in range(40)]
        self.assertTrue(all(20 <= value <= 45 for value in samples))
        self.assertGreater(max(samples) - min(samples), 5)

    def test_429_skips_store_then_recovers(self):
        cfg = load_config(None)
        cfg.interval_seconds = 10
        cfg.backoff_max_seconds = 80
        now = {"t": 0.0}

        def clock():
            return now["t"]

        pacer = Pacer(cfg, rng=random.Random(1), clock=clock)
        pacer.note([StoreResult(store="elkjop", error="HTTP 429")])
        due, cooling = pacer.due_stores(["power", "elkjop"])
        self.assertEqual(due, ["power"])
        self.assertEqual(cooling[0][0], "elkjop")
        self.assertAlmostEqual(cooling[0][1], 20.0)
        now["t"] = 21
        due2, cooling2 = pacer.due_stores(["power", "elkjop"])
        self.assertEqual(due2, ["power", "elkjop"])
        self.assertEqual(cooling2, [])
        pacer.note([StoreResult(store="elkjop", listings=[])])
        due3, cooling3 = pacer.due_stores(["elkjop"])
        self.assertEqual(due3, ["elkjop"])
        self.assertEqual(cooling3, [])

    def test_strikes_double_up_to_cap(self):
        cfg = load_config(None)
        cfg.interval_seconds = 10
        cfg.backoff_max_seconds = 50
        pacer = Pacer(cfg, rng=random.Random(2), clock=lambda: 0.0)
        pacer.note([StoreResult(store="komplett", error="The read operation timed out")])
        pacer.note([StoreResult(store="komplett", error="timeout")])
        pacer.note([StoreResult(store="komplett", error="HTTP 403")])
        self.assertEqual(pacer.strikes["komplett"], 3)
        self.assertEqual(pacer.ready_at["komplett"], 50)

    def test_listings_are_not_blocked(self):
        from gr1x_monitor.models import Listing

        result = StoreResult(
            store="power",
            listings=[Listing(store="power", title="x", url="http://x")],
            error="HTTP 403",
        )
        self.assertFalse(is_blocked(result))


class LoopPaceTests(unittest.TestCase):
    def test_loop_sleeps_variable_delay(self):
        cfg = load_config(None)
        cfg.enabled_stores = []
        cfg.watch_urls = []
        cfg.interval_seconds = 12
        cfg.interval_max_seconds = 18
        slept: list[float] = []
        from io import StringIO
        from pathlib import Path
        import tempfile

        from gr1x_monitor.state import MonitorState

        pacer = Pacer(cfg, rng=random.Random(3))
        with tempfile.TemporaryDirectory() as tmp:
            state = MonitorState(Path(tmp) / "state.json")
            out = StringIO()

            def once_sleeper(delay: float) -> None:
                slept.append(delay)
                raise KeyboardInterrupt

            with self.assertRaises(KeyboardInterrupt):
                loop(
                    cfg,
                    state,
                    fetcher=lambda *a, **k: None,
                    sleeper=once_sleeper,
                    stdout=out,
                    pacer=pacer,
                )
        self.assertEqual(len(slept), 1)
        self.assertGreaterEqual(slept[0], 12)
        self.assertLessEqual(slept[0], 18)
        self.assertIn("next in", out.getvalue())
        self.assertEqual(store_names(cfg), [])


if __name__ == "__main__":
    unittest.main()
