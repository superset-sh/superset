import copy
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from film import RenderSettings, compose, normalize, sheet, validate_spec


class FilmTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.scratch = tempfile.TemporaryDirectory()
        cls.base = Path(cls.scratch.name)
        subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
            "testsrc2=size=120x260:rate=12", "-t", "1", "-c:v", "libx264",
            "-pix_fmt", "yuv420p", str(cls.base / "source.mp4"),
        ], check=True)
        Image.new("RGB", (160, 100), "teal").save(cls.base / "image.png")

    @classmethod
    def tearDownClass(cls):
        cls.scratch.cleanup()

    def test_rejects_bad_specs_before_rendering(self):
        valid = {"segments": [{"type": "phone", "src": "source.mp4"}]}
        bad_segments = [
            {"speed": 0}, {"start": 0.8, "end": 0.3}, {"end": 2},
            {"start": float("nan")}, {"src": "missing.mp4"}, {"island": "false"},
            {"type": "unknown"}, {"speed": 1000},
        ]
        for override in bad_segments:
            with self.subTest(override=override):
                spec = copy.deepcopy(valid)
                spec["segments"][0].update(override)
                with self.assertRaises(ValueError):
                    validate_spec(spec, self.base)
        for override in [
            {"render": {"width": 301}}, {"render": {"fps": 0}},
            {"render": {"fade": -1}}, {"render": {"typo": 4}},
            {"render": {"phone_width": 1.5}}, {"render": {"crf": True}},
            {"segments": []}, {"output": "source.mp4"}, {"backdrop": "red"},
        ]:
            with self.subTest(override=override):
                with self.assertRaises(ValueError):
                    validate_spec({**valid, **override}, self.base)

    def test_phone_fits_canvas_in_each_orientation(self):
        for width, height in [(1080, 1920), (1920, 1080), (1080, 1080)]:
            settings = RenderSettings(width=width, height=height)
            for src_w, src_h in [(360, 780), (1920, 1080), (100, 4000)]:
                screen_w, screen_h, bezel = settings.phone_size(src_w, src_h)
                self.assertLessEqual(screen_w + 2 * bezel, width)
                self.assertLessEqual(screen_h + 2 * bezel, height)
                self.assertEqual(screen_w % 2, 0)
                self.assertEqual(screen_h % 2, 0)

    def test_renders_mixed_segments_at_configured_size_and_rate(self):
        for width, height, fps in [(180, 320, 30), (320, 180, 24), (240, 240, 12)]:
            with self.subTest(size=(width, height), fps=fps):
                spec = {
                    "output": f"nested/{width}-{height}.mp4",
                    "render": {"width": width, "height": height, "fps": fps, "fade": 0},
                    "segments": [
                        {"type": "phone", "src": "source.mp4", "end": 0.5},
                        {"type": "phone", "src": "source.mp4", "end": 0.5, "island": False},
                        {"type": "raw", "src": "source.mp4", "speed": 2},
                        {"type": "card", "title": "Result", "duration": 0.5},
                        {"type": "card", "title": "Cutaway", "image": "image.png", "duration": 0.5},
                        {"type": "end", "wordmark": "Demo", "duration": 0.5},
                    ],
                }
                path = self.base / "spec.json"
                path.write_text(json.dumps(spec))
                output = compose(path)
                metadata = json.loads(subprocess.check_output([
                    "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(output),
                ]))
                video = metadata["streams"][0]
                self.assertEqual((video["width"], video["height"]), (width, height))
                self.assertEqual(video["r_frame_rate"], f"{fps}/1")
                self.assertAlmostEqual(float(metadata["format"]["duration"]), 3, delta=1 / fps)
                self.assertEqual(len(metadata["streams"]), 1)
                contact = self.base / f"{width}-sheet.jpg"
                sheet(output, contact, frames=6, height=120)
                with Image.open(contact) as img:
                    self.assertEqual(img.height, 120)
                    self.assertGreater(img.width, 120)

    def test_normalize_and_cli_errors(self):
        output = self.base / "normalized/out.mp4"
        normalize(self.base / "source.mp4", output, fps=24)
        self.assertTrue(output.is_file())
        with self.assertRaises(ValueError):
            normalize(output, output)
        spec = self.base / "invalid.json"
        spec.write_text('{"segments": []}')
        result = subprocess.run([
            "python3", str(Path(__file__).with_name("film.py")), "compose", str(spec),
        ], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("segments must be a nonempty array", result.stderr)
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
