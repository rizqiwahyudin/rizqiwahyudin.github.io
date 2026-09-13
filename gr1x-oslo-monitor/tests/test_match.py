import unittest

from gr1x_monitor.match import is_gr1x_listing, looks_buyable


class MatchTests(unittest.TestCase):
    def test_gr1x_title(self):
        self.assertTrue(is_gr1x_listing("ASUS ProArt GR1X Mini PC"))
        self.assertTrue(is_gr1x_listing("Asus GR-1X RTX Spark"))
        self.assertTrue(is_gr1x_listing("ProArt GR 1X"))

    def test_spark_desktop_with_asus(self):
        self.assertTrue(is_gr1x_listing("ASUS RTX Spark desktop"))
        self.assertTrue(is_gr1x_listing("ProArt mini PC NVIDIA RTX Spark"))

    def test_ignores_other_proart(self):
        self.assertFalse(is_gr1x_listing("ASUS ProArt P16 H7606"))
        self.assertFalse(is_gr1x_listing("ASUS ProArt PX13"))
        self.assertFalse(is_gr1x_listing("ASUS ProArt Display PA32UCXR"))
        self.assertFalse(is_gr1x_listing("ASUS RTX Spark laptop P16"))

    def test_ignores_accessories(self):
        self.assertFalse(is_gr1x_listing("GR1X sleeve"))
        self.assertFalse(is_gr1x_listing("ProArt GR1X veske"))

    def test_buyable_signals(self):
        self.assertTrue(looks_buyable("På lager — Legg i handlekurv"))
        self.assertTrue(looks_buyable("In stock Add to cart"))
        self.assertFalse(looks_buyable("Ikke på lager Coming soon"))
        self.assertFalse(looks_buyable("Forhåndsbestill — notify me"))
        self.assertFalse(looks_buyable(""))


if __name__ == "__main__":
    unittest.main()
