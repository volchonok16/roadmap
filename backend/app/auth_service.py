import html
import json
from dataclasses import replace
from urllib.parse import quote, urlparse

import httpx
from fastapi import HTTPException

from app.account_key import resolve_account_key
from app.auth_sessions import create_session
from app.config import settings
from app.http_auth import auth_attempts
from app.schemas import AuthLoginOut
from app.tfs_auth import TfsAuth
from app.tfs_client import TfsClient


def default_app_url() -> str:
    return settings.app_public_url.rstrip("/")


def default_api_url() -> str:
    return settings.api_public_url.rstrip("/")


def bridge_submit_url() -> str:
    return f"{default_api_url()}/api/auth/bridge-submit"


def bridge_allowed_origins() -> list[str]:
    parsed = urlparse(settings.tfs_base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    origins = [origin, "https://tfs.t2.ru", settings.app_public_url.rstrip("/")]
    origins.extend(settings.cors_origin_list)
    return list(dict.fromkeys(item for item in origins if item))


async def probe_tfs(client: TfsClient, auth: TfsAuth) -> tuple[bool, int | None]:
    last_status: int | None = None

    response = await client.client.get(
        "/_apis/connectionData",
        params={"connectOptions": "includeServices", "lastChangeId": "-1", "api-version": "5.0"},
    )
    last_status = response.status_code
    if response.status_code == 200:
        return True, last_status
    if response.status_code in {401, 403}:
        return False, last_status

    response = await client.client.get("/_apis/projects", params={"$top": "1", "api-version": "5.1"})
    last_status = response.status_code
    if response.status_code == 200:
        return True, last_status
    if response.status_code in {401, 403}:
        return False, last_status

    response = await client.client.get(
        f"/{auth.project}/_apis/projectteams",
        params={"$top": "1", "api-version": "5.1"},
    )
    last_status = response.status_code
    if response.status_code == 200:
        return True, last_status
    if response.status_code in {401, 403}:
        return False, last_status

    from app.tfs_client import wiql_quote

    try:
        await client.run_wiql(
            f"SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = {wiql_quote(auth.project)}"
        )
        return True, 200
    except httpx.HTTPStatusError as exc:
        return exc.response.status_code not in {401, 403}, exc.response.status_code

    return False, last_status


async def resolve_working_auth(auth: TfsAuth) -> tuple[TfsAuth, str]:
    attempts = auth_attempts(auth)
    if not attempts:
        raise HTTPException(status_code=400, detail="Укажите логин и пароль, PAT или Cookie.")

    errors: list[str] = []
    for attempt in attempts:
        client = TfsClient(attempt.auth, use_ntlm=attempt.use_ntlm)
        try:
            ok, status = await probe_tfs(client, attempt.auth)
            if ok:
                account_key = await resolve_account_key(client, attempt.auth)
                resolved_auth = replace(attempt.auth, account_key=account_key)
                return resolved_auth, attempt.label
            errors.append(f"{attempt.label}: HTTP {status or '?'}")
        except httpx.HTTPError as exc:
            errors.append(f"{attempt.label}: {exc}")
        finally:
            await client.close()

    login = (auth.username or "").strip()
    if "@" in login:
        hint = (
            "Для входа вида name@t2.ru TFS за NetScaler обычно не принимает пароль через API (только браузер/SSO). "
            "Создайте PAT: TFS → иконка пользователя → Personal access tokens → New Token "
            "(права Work Items Read). Вставьте PAT во вкладку «Токен PAT». "
            "Либо попробуйте логин TELE2\\имя без @ в настройках."
        )
    else:
        hint = (
            "Проверьте логин/пароль как на tfs.t2.ru. Для корп. ПК: TELE2\\логин в поле «Логин» или домен в настройках. "
            "Надёжный вариант — PAT (Personal access tokens)."
        )
    raise HTTPException(
        status_code=401,
        detail=f"TFS не принял учётные данные ({'; '.join(errors[:6])}). {hint}",
    )


async def verify_tfs_access(auth: TfsAuth) -> TfsAuth:
    resolved, _ = await resolve_working_auth(auth)
    return resolved


async def login_with_auth(auth: TfsAuth) -> AuthLoginOut:
    if not auth.has_credentials():
        raise HTTPException(status_code=400, detail="Укажите логин и пароль, PAT или Cookie.")

    resolved = await verify_tfs_access(auth)
    session_id = create_session(resolved)
    return AuthLoginOut(
        session_id=session_id,
        base_url=resolved.base_url,
        project=resolved.project,
        project_id=resolved.project_id,
    )


def bridge_result_html(session_id: str, app_url: str, error: str | None = None) -> str:
    safe_app = html.escape(app_url)
    if error:
        message = html.escape(error)
        return f"""<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><title>TFS Roadmap</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;">
  <h1>Не удалось подключить сессию</h1>
  <p>{message}</p>
  <p><a href="{safe_app}">Вернуться в Roadmap</a></p>
</body>
</html>"""

    redirect = f"{safe_app}?session={quote(session_id, safe='')}"
    payload = json.dumps({"type": "tfs-bridge", "sessionId": session_id})
    return f"""<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><title>TFS Roadmap — подключено</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;">
  <h1>Сессия TFS подключена</h1>
  <p>Окно закроется автоматически. Если нет — <a href="{redirect}">откройте Roadmap</a>.</p>
  <script>
    (function () {{
      var payload = {payload};
      try {{
        if (window.opener && !window.opener.closed) {{
          window.opener.postMessage(payload, {json.dumps(default_app_url())});
        }}
      }} catch (e) {{}}
      setTimeout(function () {{
        window.location.href = {json.dumps(redirect)};
      }}, 400);
    }})();
  </script>
</body>
</html>"""
