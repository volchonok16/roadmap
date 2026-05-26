from app.tfs_client import _api_version_candidates


def test_api_version_candidates_prefer_configured() -> None:
    versions = _api_version_candidates("6.1")
    assert versions[0] == "6.1"
    assert "7.0" not in versions
