import json
import unittest

from gr1x_monitor.config import load_config
from gr1x_monitor.http import HttpResponse
from gr1x_monitor.stores import (
    search_asus,
    search_elkjop,
    search_kjell,
    search_netonnet,
    search_power,
    watch_urls,
)


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
        self.assertEqual(hit.product, "gr1x")

    def test_ps5_pro_console_not_accessories(self):
        payload = {
            "totalProductCount": 3,
            "products": [
                {
                    "title": "PlayStation 5 Pro-konsoll",
                    "shortDescription": "PS5 Pro",
                    "url": "/gaming/playstation/playstation-5-pro-konsoll/p-4193724/",
                    "productId": 4193724,
                    "price": 10999.0,
                    "stockCount": 0,
                    "canAddToCart": False,
                    "webStockText": "Product.Stock.WebStock",
                },
                {
                    "title": "PS5 Pro-konsolldeksler – Marvel's Wolverine Battle Yellow Limited Edition",
                    "shortDescription": "deksel",
                    "url": "/gaming/playstation/ps5-pro-konsolldeksler/p-4520968/",
                    "productId": 4520968,
                    "price": 899.0,
                    "stockCount": 54,
                    "canAddToCart": True,
                    "webStockText": "Product.Stock.GoodStock",
                },
                {
                    "title": "Diskstasjon for PlayStation 5 Slim Digital Edition/PS5 Pro",
                    "shortDescription": "diskstasjon",
                    "url": "/gaming/playstation/diskstasjon/p-2856457/",
                    "productId": 2856457,
                    "price": 1799.0,
                    "stockCount": 0,
                    "canAddToCart": True,
                    "webStockText": "Product.Stock.ComingIn",
                },
            ],
        }
        fake = FakeHttp(
            {
                "productlists": HttpResponse(
                    "https://www.power.no/api/v2/productlists",
                    200,
                    json.dumps(payload),
                    "application/json",
                ),
                "/stores": HttpResponse(
                    "https://www.power.no/api/v2/products/4193724/stores",
                    200,
                    json.dumps(POWER_STORES),
                    "application/json",
                ),
            }
        )
        result = search_power(_cfg(), fake)
        self.assertEqual([item.title for item in result.listings], ["PlayStation 5 Pro-konsoll"])
        self.assertEqual(result.listings[0].product, "ps5-pro")
        self.assertFalse(result.listings[0].buyable)
        self.assertEqual(result.listings[0].price_nok, 10999.0)


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

    def test_netonnet_optical_drive_is_ignored(self):
        html = """<html><head><title>Søk: ASUS GR1X</title></head>
        <body><a href="/art/data-og-nettbrett/tilbehor/cddvdogblu-ray/asus-sdrw/1002762.11080/">ASUS SDRW-08U9M</a>
        </body></html>"""
        fake = FakeHttp(
            {
                "netonnet.no": HttpResponse(
                    "https://www.netonnet.no/search?query=ASUS+GR1X", 200, html, "text/html"
                )
            }
        )
        self.assertEqual(search_netonnet(_cfg(), fake).listings, [])

    def test_kjell_empty_search_is_not_a_listing(self):
        html = """<html><head><title>GR1X | Kjell &amp; Company</title></head>
        <body><p>Vi fant ingen produkter</p></body></html>"""
        fake = FakeHttp(
            {
                "kjell.com": HttpResponse(
                    "https://www.kjell.com/no/sok?q=GR1X", 200, html, "text/html"
                )
            }
        )
        self.assertEqual(search_kjell(_cfg(), fake).listings, [])

    def test_asus_homepage_redirect_ignored(self):
        html = """<html><head><title>ASUS Norge</title></head>
        <body>Kjøp nå hos Elkjøp og Komplett</body></html>"""
        spec = """<html><head><title>ProArt GR1X Mini PC</title></head>
        <body>Create without limits. Where to buy coming soon.</body></html>"""
        fake = FakeHttp(
            {
                "asus.com/no/displays": HttpResponse("https://www.asus.com/no/", 200, html, "text/html"),
                "asus.com/displays": HttpResponse(
                    "https://www.asus.com/displays-desktops/mini-pcs/proart-mini-pc-series/proart-gr1x-mini-pc/",
                    200,
                    spec,
                    "text/html",
                ),
                "asus.com/us/": HttpResponse(
                    "https://www.asus.com/us/displays-desktops/mini-pcs/proart-mini-pc-series/proart-gr1x-mini-pc/",
                    200,
                    spec,
                    "text/html",
                ),
                "searchresult": HttpResponse(
                    "https://www.asus.com/no/searchresult?searchKey=GR1X",
                    200,
                    "<html><head><title>Søk - GR1X</title></head><body>Vi fant ingen resultater</body></html>",
                    "text/html",
                ),
            }
        )
        self.assertEqual(search_asus(_cfg(), fake).listings, [])

    def test_asus_alerts_when_elkjop_appears(self):
        spec = """<html><head><title>ProArt GR1X Mini PC</title></head>
        <body>Kjøp hos Elkjøp.no — på lager</body></html>"""
        fake = FakeHttp(
            {
                "asus.com/no/displays": HttpResponse(
                    "https://www.asus.com/no/displays-desktops/mini-pcs/proart-mini-pc-series/proart-gr1x-mini-pc/",
                    200,
                    spec,
                    "text/html",
                ),
                "asus.com/displays": HttpResponse(
                    "https://www.asus.com/displays-desktops/mini-pcs/proart-mini-pc-series/proart-gr1x-mini-pc/",
                    200,
                    spec,
                    "text/html",
                ),
                "asus.com/us/": HttpResponse(
                    "https://www.asus.com/us/displays-desktops/mini-pcs/proart-mini-pc-series/proart-gr1x-mini-pc/",
                    200,
                    spec,
                    "text/html",
                ),
                "searchresult": HttpResponse(
                    "https://www.asus.com/no/searchresult",
                    200,
                    "<html><head><title>Søk</title></head><body></body></html>",
                    "text/html",
                ),
            }
        )
        result = search_asus(_cfg(), fake)
        self.assertGreaterEqual(len(result.listings), 1)
        self.assertTrue(any("elkjop" in (item.stock_text or "").lower() or item.store == "asus" for item in result.listings))


if __name__ == "__main__":
    unittest.main()
