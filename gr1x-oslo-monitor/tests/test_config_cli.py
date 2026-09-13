import json
import tempfile
import unittest
from pathlib import Path

from gr1x_monitor.cli import build_parser, resolve_config_path
from gr1x_monitor.config import load_config


class ConfigTests(unittest.TestCase):
    def test_defaults(self):
        cfg = load_config(None)
        self.assertIn("GR1X", cfg.queries)
        self.assertIn("PS5 Pro", cfg.queries)
        self.assertTrue(cfg.has_product("gr1x"))
        self.assertTrue(cfg.has_product("ps5-pro"))
        self.assertGreaterEqual(cfg.interval_seconds, 8)
        self.assertIn("power", cfg.enabled_stores)

    def test_floor_interval(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            path.write_text(json.dumps({"interval_seconds": 1}), encoding="utf-8")
            cfg = load_config(path)
            self.assertEqual(cfg.interval_seconds, 8)
            self.assertEqual(cfg.root, path.parent)

    def test_parser(self):
        args = build_parser().parse_args(["--once", "--self-check"])
        self.assertTrue(args.once)
        self.assertTrue(args.self_check)


class ResolveConfigTests(unittest.TestCase):
    def test_missing_explicit_path(self):
        with self.assertRaises(SystemExit):
            resolve_config_path("/tmp/does-not-exist-gr1x.json")


if __name__ == "__main__":
    unittest.main()
