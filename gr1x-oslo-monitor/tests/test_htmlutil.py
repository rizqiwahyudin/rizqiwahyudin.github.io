import unittest

from gr1x_monitor import htmlutil


HTML = """
<html><head>
<title>ASUS ProArt GR1X | Elkjøp</title>
<script type="application/ld+json">
{"@type":"Product","name":"ASUS ProArt GR1X","url":"/product/pc/asus-proart-gr1x/900001","sku":"900001"}
</script>
</head>
<body>
<a href="/product/pc/asus-proart-gr1x/900001">ASUS ProArt GR1X Mini PC</a>
<a href="/kampanje">Ignore me</a>
</body></html>
"""


class HtmlUtilTests(unittest.TestCase):
    def test_page_title(self):
        self.assertIn("GR1X", htmlutil.page_title(HTML))

    def test_json_ld_product(self):
        cards = htmlutil.products_from_json_ld(HTML, "https://www.elkjop.no/")
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["sku"], "900001")
        self.assertTrue(cards[0]["url"].endswith("/900001"))

    def test_product_anchors(self):
        cards = htmlutil.productish_anchors(HTML, "https://www.elkjop.no/")
        urls = [c["url"] for c in cards]
        self.assertTrue(any(u.endswith("/900001") for u in urls))


if __name__ == "__main__":
    unittest.main()
