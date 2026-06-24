import os
import unittest
from unittest.mock import patch

from app.core.config import load_settings


class PhraseSettingsTests(unittest.TestCase):
    def test_adaptive_phrase_defaults(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = load_settings()

        self.assertEqual(settings.phrase_max_sentences, 2)
        self.assertEqual(settings.phrase_inactivity_ms, 800)
        self.assertEqual(settings.phrase_max_age_ms, 10_000)

    def test_adaptive_phrase_environment_overrides(self) -> None:
        with patch.dict(
            os.environ,
            {
                "PHRASE_MAX_SENTENCES": "3",
                "PHRASE_INACTIVITY_MS": "950",
                "PHRASE_MAX_AGE_MS": "12000",
            },
            clear=True,
        ):
            settings = load_settings()

        self.assertEqual(settings.phrase_max_sentences, 3)
        self.assertEqual(settings.phrase_inactivity_ms, 950)
        self.assertEqual(settings.phrase_max_age_ms, 12_000)


if __name__ == "__main__":
    unittest.main()
