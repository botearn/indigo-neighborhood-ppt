import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import indigo_generator  # noqa: E402
from tests.test_indigo_pptx_images import _story  # noqa: E402


class IndigoGeneratorEditTest(unittest.TestCase):
    def test_reordered_edit_keeps_beat_identity_and_images(self) -> None:
        original = _story()
        data = original.model_dump(mode="json")
        data["beats"] = [data["beats"][2], data["beats"][0], data["beats"][1], *data["beats"][3:]]
        for field in indigo_generator.IMAGE_FIELDS:
            data["beats"][0][field] = None

        updated = indigo_generator._load_indigo_json(
            json.dumps(data, ensure_ascii=False),
            original.city,
            original.district,
            original.hotel_en,
            apply_fixed_fields=False,
        )
        preserved = indigo_generator._renumber_beats(indigo_generator._preserve_images(original, updated))

        self.assertEqual(preserved.beats[0].num, "01")
        self.assertEqual(preserved.beats[0].space_zh, "空间3")
        self.assertEqual(preserved.beats[0].ghost_en, "BEAT\n3")
        self.assertEqual(preserved.beats[0].image_url, original.beats[2].image_url)
        self.assertEqual(preserved.beats[0].mood_image_url, original.beats[2].mood_image_url)


if __name__ == "__main__":
    unittest.main()
