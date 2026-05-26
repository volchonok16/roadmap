from app.http_auth import expand_login_usernames, password_auth_candidates
from app.tfs_auth import TfsAuth


def test_expand_email_t2_variants() -> None:
    names = expand_login_usernames("alexander.taraskin@t2.ru")
    assert "alexander.taraskin@t2.ru" in names
    assert "alexander.taraskin" in names
    assert "TELE2\\alexander.taraskin" in names


def test_email_skips_ntlm() -> None:
    auth = TfsAuth(
        base_url="https://tfs.t2.ru/tfs/Main",
        project="Tele2",
        username="user@t2.ru",
        password="secret",
    )
    attempts = password_auth_candidates(auth)
    assert all(not item.use_ntlm for item in attempts)
