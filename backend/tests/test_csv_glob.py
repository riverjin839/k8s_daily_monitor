"""Unit tests for _matches_csv_glob helper used by /analyze namespace filtering."""
from app.routers.analyze import _matches_csv_glob


def test_matches_csv_glob_empty_passes_through():
    assert _matches_csv_glob("anything", "")
    assert _matches_csv_glob("anything", "   ")


def test_matches_csv_glob_exact_name():
    assert _matches_csv_glob("monitoring", "monitoring")
    assert not _matches_csv_glob("monitoring2", "monitoring")


def test_matches_csv_glob_wildcard_star():
    assert _matches_csv_glob("kube-system", "kube-*")
    assert _matches_csv_glob("kube-public", "kube-*")
    assert not _matches_csv_glob("default", "kube-*")


def test_matches_csv_glob_wildcard_question_mark():
    assert _matches_csv_glob("ns1", "ns?")
    assert _matches_csv_glob("nsa", "ns?")
    assert not _matches_csv_glob("ns12", "ns?")


def test_matches_csv_glob_csv_or_logic():
    assert _matches_csv_glob("monitoring", "kube-*,monitoring,argocd")
    assert _matches_csv_glob("argocd", "kube-*,monitoring,argocd")
    assert _matches_csv_glob("kube-system", "kube-*,monitoring,argocd")
    assert not _matches_csv_glob("istio-system", "kube-*,monitoring,argocd")


def test_matches_csv_glob_ignores_whitespace_in_patterns():
    assert _matches_csv_glob("monitoring", " kube-* , monitoring , argocd ")


def test_matches_csv_glob_ignores_empty_segments():
    # 빈 세그먼트(연속 콤마)는 무시되어야 함 — 빈 패턴이 모든 것을 매치하면 안 됨
    assert _matches_csv_glob("monitoring", "kube-*,,monitoring")
    assert not _matches_csv_glob("default", ",,,")
