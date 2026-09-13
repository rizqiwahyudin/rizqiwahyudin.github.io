import json
import unittest

from gr1x_monitor.config import load_config
from gr1x_monitor.http import HttpResponse
from gr1x_monitor.stores import search_elkjop, search_power, watch_urls


def _cfg():
    return load_config(None)


class FakeHttp:
    def __init__(self, routes: dict[str, HttpResponse]):
        self.routes = routes
        self.calls: list[str] = []

    def __call__(self, url: str, **kwargs) -> HttpResponse:
        self.calls.append(url)
        for needle, resp in self.routes.items():
            if needle in url:
                return resp
        raise AssertionError(f"unexpected url {url}")


POWER_HIT = {
    "totalProductCount": 1,
    "products": [
        {
            "title": "ASUS ProArt GR1X Mini PC",
            "shortDescription": "NVIDIA RTX Spark desktop",
            "url": "/data-og-tilbehoer/mini-pc/asus-proart-gr1x/p-9990001/",
            "productId": 9990001,
            "price": 29999.0,
            "stockCount": 4,
            "canAddToCart": True,
            "webStockText": "Product.Stock.GoodStock",
        }
    ],
}

POWER_EMPTY = {"totalProductCount": 0, "products": []}

POWER_STORES = [
    {
        "name": "POWER Lille Grensen",
        "city": "Oslo",
        "region": "Oslo",
        "storeDisplayStock": 2,
        "storeAvailability": 1,
    },
    {
        "name": "POWER Bergen",
        "city": "Bergen",
        "region": "Vestland",
        "storeDisplayStock": 9,
        "storeAvailability": 1,
    },
]


class PowerStoreTests(unittest.TestCase):
    def test_empty_search(self):
        fake = FakeHttp(
            {
                "productlists": HttpResponse(
                    "https://www.power.no/api/v2/productlists",
                    200,
                    json.dumps(POWER_EMPTY),
                    "application/json",
                )
            }
        )
        result = search_power(_cfg(), fake)
        self.assertEqual(result.listings, [])
        self.assertEqual(result.error, "")

    def test_hit_and_oslo_stock(self):
        fake = FakeHttp(
            {
                "productlists": HttpResponse(
                    "https://www.power.no/api/v2/productlists",
                    200,
                    json.dumps(POWER_HIT),
                    "application/json",
                ),
                "/stores": HttpResponse(
                    "https://www.power.no/api/v2/products/9990001/stores",
                    200,
                    json.dumps(POWER_STORES),
                    "application/json",
                ),
            }
        )
        result = search_power(_cfg(), fake)
        self.assertEqual(len(result.listings), 1)
        hit = result.listings[0]
        self.assertEqual(hit.store, "power")
        self.assertTrue(hit.buyable)
        self.assertEqual(hit.price_nok, 29999.0)
        self.assertIn("Lille Grensen: 2", hit.oslo_stock)
        self.assertNotIn("Bergen", hit.oslo_stock)
        self.assertTrue(hit.url.startswith("https://www.power.no/"))


class HtmlStoreTests(unittest.TestCase):
    def test_elkjop_json_ld(self):
        html = """
        <html><head><title>Søk GR1X</title>
        <script type="application/ld+json">
        {"@type":"Product","name":"ASUS ProArt GR1X","url":"/product/pc/asus-proart-gr1x/42","sku":"42"}
        </script></head>
        <body><p>På lager Legg i handlekurv</p></body></html>
        """
        fake = FakeHttp(
            {
                "elkjop.no/search": HttpResponse(
                    "https://www.elkjop.no/search?q=GR1X", 200, html, "text/html"
                )
            }
        )
        result = search_elkjop(_cfg(), fake)
        self.assertEqual(len(result.listings), 1)
        self.assertEqual(result.listings[0].sku, "42")
        self.assertTrue(result.listings[0].buyable)

    def test_watch_url(self):
        html = "<html><head><title>ASUS ProArt GR1X</title></head><body>Coming soon</body></html>"
        cfg = _cfg()
        cfg.watch_urls = ["https://shop.example/gr1x"]
        fake = FakeHttp(
            {"shop.example/gr1x": HttpResponse("https://shop.example/gr1x", 200, html, "text/html")}
        )
        result = watch_urls(cfg, fake)
        self.assertEqual(len(result.listings), 1)
        self.assertFalse(result.listings[0].buyable)


if __name__ == "__main__":
    unittest.main()
