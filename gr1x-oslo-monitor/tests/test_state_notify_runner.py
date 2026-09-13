import json
import tempfile
import unittest
from io import StringIO
from pathlib import Path

from gr1x_monitor.config import load_config
from gr1x_monitor.http import HttpResponse
from gr1x_monitor.models import Listing
from gr1x_monitor.notify import fire, format_alert
from gr1x_monitor.runner import run_pass
from gr1x_monitor.state import MonitorState


def listing(**kwargs) -> Listing:
    data = dict(
        store="power",
        title="ASUS ProArt GR1X",
        url="https://www.power.no/p-1/",
        sku="1",
        buyable=False,
    )
    data.update(kwargs)
    return Listing(**data)


class StateTests(unittest.TestCase):
    def test_new_then_upgrade_to_buyable(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "state.json"
            state = MonitorState.load(path)
            first = listing(buyable=False)
            self.assertEqual(len(state.fresh_hits([first])), 1)
            self.assertEqual(state.fresh_hits([first]), [])
            upgraded = listing(buyable=True)
            hits = state.fresh_hits([upgraded])
            self.assertEqual(len(hits), 1)
            self.assertTrue(hits[0].buyable)
            self.assertEqual(state.fresh_hits([upgraded]), [])
            state.save()
            reloaded = MonitorState.load(path)
            self.assertEqual(reloaded.seen[first.key], "buyable")


class NotifyTests(unittest.TestCase):
    def test_fire_writes_log_webhook_and_opens(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = load_config(None)
            cfg.root = Path(tmp)
            cfg.state_path = "state.json"
            cfg.log_path = "alerts.log"
            cfg.discord_webhook = "https://discord.example/hook"
            cfg.telegram_bot_token = "tok"
            cfg.telegram_chat_id = "42"
            cfg.generic_webhook = "https://hook.example/x"
            cfg.open_browser = True
            cfg.beep = False
            posted: list[str] = []
            opened: list[str] = []

            def poster(url, payload, timeout=15):
                posted.append(url)
                return HttpResponse(url, 204, "")

            out = StringIO()
            item = listing(buyable=True, price_nok=19999)
            fire(cfg, item, poster=poster, opener=opened.append, stdout=out)
            text = out.getvalue()
            self.assertIn("BUYABLE", text)
            self.assertIn("GR1X", format_alert(item))
            self.assertTrue((Path(tmp) / "alerts.log").exists())
            self.assertEqual(len(posted), 3)
            self.assertEqual(opened, [item.url])


class RunnerTests(unittest.TestCase):
    def test_run_pass_alerts_once(self):
        payload = {
            "totalProductCount": 1,
            "products": [
                {
                    "title": "ASUS ProArt GR1X Mini PC",
                    "shortDescription": "RTX Spark",
                    "url": "/mini/gr1x/p-7/",
                    "productId": 7,
                    "price": 10,
                    "stockCount": 1,
                    "canAddToCart": True,
                    "webStockText": "ok",
                }
            ],
        }
        stores = [{"name": "POWER Storo", "city": "Oslo", "region": "Oslo", "storeDisplayStock": 1, "storeAvailability": 1}]

        def fetcher(url: str, **kwargs):
            if "productlists" in url:
                return HttpResponse(url, 200, json.dumps(payload), "application/json")
            if "/stores" in url:
                return HttpResponse(url, 200, json.dumps(stores), "application/json")
            return HttpResponse(url, 200, "<html><title>Søk</title></html>", "text/html")

        with tempfile.TemporaryDirectory() as tmp:
            cfg = load_config(None)
            cfg.root = Path(tmp)
            cfg.enabled_stores = ["power"]
            cfg.watch_urls = []
            cfg.open_browser = False
            cfg.beep = False
            fired: list[Listing] = []
            state = MonitorState(Path(tmp) / "state.json")
            out = StringIO()
            hits = run_pass(cfg, state, fetcher=fetcher, fire_alert=lambda c, l: fired.append(l), stdout=out)
            self.assertEqual(len(hits), 1)
            self.assertEqual(len(fired), 1)
            hits2 = run_pass(cfg, state, fetcher=fetcher, fire_alert=lambda c, l: fired.append(l), stdout=out)
            self.assertEqual(hits2, [])
            self.assertEqual(len(fired), 1)


if __name__ == "__main__":
    unittest.main()
