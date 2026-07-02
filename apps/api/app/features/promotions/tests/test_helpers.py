"""Unit tests for the pure Promotions helpers.

These mirror the tests on the TS side (`suggestion.test.ts`,
`next-class-resolver.test.ts`, `academic-year.test.ts`). Both sides
share the same rule set so must produce the same output for the same
input; when either side changes a rule the twin test must move too.
"""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.features.promotions.academic_year import next_academic_year
from app.features.promotions.next_class import (
    ClassLike,
    auto_pick_target_class,
    division_has_next_year_classes,
    next_level_name,
    same_level_name,
)
from app.features.promotions.suggestion import (
    CoreSubject,
    ScoreForSuggestion,
    compute_suggestion,
)


class TestAcademicYear:
    def test_increments_both_halves(self) -> None:
        assert next_academic_year("2025/2026") == "2026/2027"
        assert next_academic_year("2030/2031") == "2031/2032"

    def test_rejects_malformed(self) -> None:
        with pytest.raises(ValueError):
            next_academic_year("2025-2026")
        with pytest.raises(ValueError):
            next_academic_year("nonsense")


class TestNextClassResolver:
    def test_next_level_name_promotes_through_sequence(self) -> None:
        assert next_level_name("KG 1") == "KG 2"
        assert next_level_name("Primary 5") == "Primary 6"
        assert next_level_name("Primary 6") == "JHS 1"
        assert next_level_name("JHS 2") == "JHS 3"

    def test_next_level_name_terminal_jhs3(self) -> None:
        # JHS 3 graduates — no next level.
        assert next_level_name("JHS 3") is None

    def test_next_level_name_unknown(self) -> None:
        # Anything outside the fixed sequence is a data error upstream;
        # we return None so the caller doesn't guess a target class.
        assert next_level_name("SHS 1") is None

    def test_same_level_name(self) -> None:
        assert same_level_name("Primary 3") == "Primary 3"

    def test_auto_pick_promote_matches_by_name(self) -> None:
        p6 = ClassLike(id="p6", name="Primary 6", division="Upper Primary")
        jhs1 = ClassLike(id="jhs1", name="JHS 1", division="JHS")
        assert auto_pick_target_class("Primary 6", [p6, jhs1], "promote") == "jhs1"

    def test_auto_pick_repeat_matches_by_name(self) -> None:
        p6 = ClassLike(id="p6", name="Primary 6", division="Upper Primary")
        jhs1 = ClassLike(id="jhs1", name="JHS 1", division="JHS")
        assert auto_pick_target_class("Primary 6", [p6, jhs1], "repeat") == "p6"

    def test_auto_pick_returns_none_when_no_match(self) -> None:
        assert auto_pick_target_class("JHS 3", [], "promote") is None
        assert (
            auto_pick_target_class(
                "Primary 6",
                [ClassLike(id="only-p4", name="Primary 4", division="Upper Primary")],
                "promote",
            )
            is None
        )

    def test_division_has_next_year_classes(self) -> None:
        classes = [
            ClassLike(id="a", name="JHS 1", division="JHS"),
            ClassLike(id="b", name="KG 2", division="KG"),
        ]
        assert division_has_next_year_classes("JHS", classes) is True
        assert division_has_next_year_classes("KG", classes) is True
        assert division_has_next_year_classes("Lower Primary", classes) is False


class TestSuggestion:
    def test_no_suggestion_without_published_exam(self) -> None:
        result = compute_suggestion(
            class_name="Primary 5",
            division_core_subjects=[],
            scores_for_student=[],
            exam_published=False,
        )
        assert result is None

    def test_jhs3_graduates_unconditionally(self) -> None:
        result = compute_suggestion(
            class_name="JHS 3",
            division_core_subjects=[],
            scores_for_student=[],
            exam_published=True,
        )
        assert result is not None
        assert result.suggested_decision == "graduate"
        assert result.failed_core_subjects == 0

    def test_repeat_when_three_or_more_failed_cores(self) -> None:
        subjects = [
            CoreSubject(id=f"sub-{i}", name=name)
            for i, name in enumerate(["English", "Maths", "Science", "RME"])
        ]
        # Fail three of four cores.
        scores = [
            ScoreForSuggestion(subject_id="sub-0", total_score=30),  # English
            ScoreForSuggestion(subject_id="sub-1", total_score=25),  # Maths
            ScoreForSuggestion(subject_id="sub-2", total_score=38),  # Science
            ScoreForSuggestion(subject_id="sub-3", total_score=60),  # RME OK
        ]
        result = compute_suggestion(
            class_name="Primary 5",
            division_core_subjects=subjects,
            scores_for_student=scores,
            exam_published=True,
        )
        assert result is not None
        assert result.suggested_decision == "repeat"
        assert result.failed_core_subjects == 3
        assert "English" in result.suggested_reason

    def test_promote_when_fewer_than_three_failed(self) -> None:
        subjects = [
            CoreSubject(id="a", name="Maths"),
            CoreSubject(id="b", name="English"),
        ]
        scores = [
            ScoreForSuggestion(subject_id="a", total_score=45),
            ScoreForSuggestion(subject_id="b", total_score=39),
        ]
        result = compute_suggestion(
            class_name="Primary 5",
            division_core_subjects=subjects,
            scores_for_student=scores,
            exam_published=True,
        )
        assert result is not None
        assert result.suggested_decision == "promote"
        assert result.failed_core_subjects == 1

    def test_missing_score_does_not_count_as_failed(self) -> None:
        # A missing score is ambiguous (not entered yet). Don't push
        # toward repeat.
        sub_a = CoreSubject(id="a", name="Maths")
        sub_b = CoreSubject(id="b", name="English")
        sub_c = CoreSubject(id="c", name="Science")
        result = compute_suggestion(
            class_name="Primary 5",
            division_core_subjects=[sub_a, sub_b, sub_c],
            scores_for_student=[
                # Only Maths score recorded, and it's a fail.
                ScoreForSuggestion(subject_id="a", total_score=20),
            ],
            exam_published=True,
        )
        assert result is not None
        assert result.suggested_decision == "promote"
        assert result.failed_core_subjects == 1

    def test_uuid_ids_serialise_correctly(self) -> None:
        # The service will typically pass UUIDs, not strings. Verify the
        # id-based lookup still matches.
        sub_id = uuid4()
        result = compute_suggestion(
            class_name="Primary 5",
            division_core_subjects=[CoreSubject(id=sub_id, name="Maths")],
            scores_for_student=[ScoreForSuggestion(subject_id=sub_id, total_score=25)],
            exam_published=True,
        )
        assert result is not None
        assert result.failed_core_subjects == 1
