import httpx


def friendly_http_error(exc: httpx.HTTPStatusError) -> str:
    status = exc.response.status_code
    url = str(exc.request.url)
    if status == 401:
        if "_boards/directory" in url:
            return (
                "TFS отклонил доступ к списку досок (401). Обычно PAT не видит web-API досок — "
                "создайте PAT с правами Work Items (Read) и Code/Project: чтение; либо войдите заново. "
                "Выгрузка ЗНИ продолжится с доской по умолчанию."
            )
        return (
            "TFS вернул 401 Unauthorized. Сессия истекла или неверный PAT. "
            "Войдите снова (вкладка «Токен PAT») или обновите токен."
        )
    if status == 403:
        return f"TFS отклонил доступ (403) к {url}"
    if status == 400:
        detail = ""
        try:
            payload = exc.response.json()
            if isinstance(payload, dict):
                detail = str(payload.get("message") or payload)
        except Exception:
            detail = exc.response.text[:300]
        if "out of range" in detail.lower():
            return (
                f"TFS отклонил запрос (400): несовместимая версия REST API. {detail} "
                "Укажите TFS_API_VERSION=6.1 в .env (максимум для вашего сервера)."
            )
        if "/wiql" in url.lower():
            return (
                f"TFS отклонил WIQL-запрос (400). {detail or url} "
                "Проверьте CHANGE_REQUEST_STATES в .env — имена статусов должны совпадать с TFS."
            )
        return f"TFS отклонил запрос (400). {detail or url}"
    return f"TFS HTTP {status} для {url}"
