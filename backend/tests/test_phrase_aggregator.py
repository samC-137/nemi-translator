import unittest

from app.services.translation_quality import PhraseAggregator


class PhraseAggregatorTests(unittest.TestCase):
    def make_aggregator(self) -> PhraseAggregator:
        return PhraseAggregator(
            max_sentences=2,
            max_chars=300,
            inactivity_ms=800,
            max_age_ms=10_000,
        )

    def test_first_sentence_waits(self) -> None:
        aggregator = self.make_aggregator()

        self.assertIsNone(aggregator.push("Одно предложение.", now_ms=0))
        self.assertTrue(aggregator.has_pending())

    def test_second_sentence_flushes_immediately(self) -> None:
        aggregator = self.make_aggregator()
        self.assertIsNone(aggregator.push("Первое предложение.", now_ms=0))

        result = aggregator.push("Второе предложение!", now_ms=300)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.text, "Первое предложение. Второе предложение!")
        self.assertEqual(result.reason, "sentence_limit")
        self.assertEqual(result.age_ms, 300)
        self.assertEqual(result.sentence_count, 2)

    def test_new_fragment_moves_inactivity_deadline(self) -> None:
        aggregator = self.make_aggregator()
        aggregator.push("Начало", now_ms=0)
        aggregator.push("продолжение", now_ms=700)

        self.assertIsNone(aggregator.flush_due(now_ms=800))
        result = aggregator.flush_due(now_ms=1500)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.reason, "inactivity")

    def test_inactivity_flushes_unfinished_text(self) -> None:
        aggregator = self.make_aggregator()
        aggregator.push("Незаконченная мысль", now_ms=100)

        self.assertIsNone(aggregator.flush_due(now_ms=899))
        result = aggregator.flush_due(now_ms=900)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.text, "Незаконченная мысль")
        self.assertEqual(result.reason, "inactivity")

    def test_max_age_wins_during_continuous_fragments(self) -> None:
        aggregator = self.make_aggregator()
        aggregator.push("Начало", now_ms=0)
        aggregator.push("ещё", now_ms=9_500)

        result = aggregator.flush_due(now_ms=10_000)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.reason, "max_age")

    def test_max_age_can_flush_during_push(self) -> None:
        aggregator = self.make_aggregator()
        aggregator.push("Начало", now_ms=0)

        result = aggregator.push("продолжение", now_ms=10_000)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.reason, "max_age")

    def test_max_chars_flushes_immediately(self) -> None:
        aggregator = PhraseAggregator(
            max_sentences=2,
            max_chars=10,
            inactivity_ms=800,
            max_age_ms=10_000,
        )

        result = aggregator.push("1234567890", now_ms=0)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.reason, "max_chars")

    def test_stale_timer_cannot_flush_twice(self) -> None:
        aggregator = self.make_aggregator()

        result = aggregator.push("Первая. Вторая.", now_ms=0)

        self.assertIsNotNone(result)
        self.assertIsNone(aggregator.flush_due(now_ms=800))

    def test_manual_flush_returns_remainder(self) -> None:
        aggregator = self.make_aggregator()
        aggregator.push("Остаток", now_ms=100)

        result = aggregator.flush(now_ms=200)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.text, "Остаток")
        self.assertEqual(result.reason, "manual_flush")
        self.assertEqual(result.age_ms, 100)

    def test_colon_and_semicolon_are_not_sentence_boundaries(self) -> None:
        aggregator = self.make_aggregator()

        self.assertIsNone(aggregator.push("Тема: STT; MT.", now_ms=0))
        self.assertTrue(aggregator.has_pending())

    def test_repeated_punctuation_is_one_sentence_boundary(self) -> None:
        aggregator = self.make_aggregator()

        self.assertIsNone(aggregator.push("Правда?!", now_ms=0))
        self.assertTrue(aggregator.has_pending())

    def test_next_deadline_prefers_inactivity(self) -> None:
        aggregator = self.make_aggregator()
        aggregator.push("Начало", now_ms=100)

        self.assertEqual(aggregator.next_deadline_ms(), 900)


if __name__ == "__main__":
    unittest.main()
