import unittest

from gr1x_monitor.match import GR1X, PS5_PRO, classify, is_gr1x_listing, looks_buyable


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

    def test_ps5_pro_console(self):
        self.assertEqual(classify("PlayStation 5 Pro-konsoll"), PS5_PRO)
        self.assertEqual(classify("Sony PS5 Pro console"), PS5_PRO)
        self.assertIsNone(classify("PlayStation 5 Slim"))
        self.assertIsNone(classify("PS5 Pro-konsolldeksler – Marvel's Wolverine"))
        self.assertIsNone(classify("Diskstasjon for PlayStation 5 Slim Digital Edition/PS5 Pro"))
        self.assertIsNone(classify("Bruksklar PlayStation 5 og Installering Av SSD"))
        self.assertIsNone(classify("Corsair MP600 ELITE for PS5 2TB", "optimalisert for PS5 og PS5 PRO"))
        self.assertIsNone(classify("Deltaco Wireless PS5 Pro Controller with RGB"))
        self.assertIsNone(classify("Sony PS5 Slim Ultra HD Blu-ray Disc Drive Diskleser for PS5 Digital Slim og PS5 Pro"))
        self.assertEqual(classify("Sony PlayStation 5 Pro (2025)", "PlayStation®5 Pro Console – 2TB"), PS5_PRO)

    def test_classify_ids(self):
        self.assertEqual(classify("ASUS ProArt GR1X Mini PC"), GR1X)

    def test_buyable_signals(self):
        self.assertTrue(looks_buyable("På lager — Legg i handlekurv"))
        self.assertTrue(looks_buyable("In stock Add to cart"))
        self.assertFalse(looks_buyable("Ikke på lager Coming soon"))
        self.assertFalse(looks_buyable("Forhåndsbestill — notify me"))
        self.assertFalse(looks_buyable(""))


if __name__ == "__main__":
    unittest.main()
