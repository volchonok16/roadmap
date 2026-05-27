import hashlib

from app.tfs_auth import TfsAuth


def fallback_account_key(auth: TfsAuth) -> str:
    base = auth.base_url.rstrip("/").lower()
    project = auth.project.strip().lower()
    if auth.username:
        login = auth.username.strip().lower()
        domain = (auth.domain or "").strip().lower()
        identity = f"{domain}\\{login}" if domain else login
        return f"{base}|{project}|{identity}"
    if auth.pat:
        digest = hashlib.sha256(auth.pat.encode("utf-8")).hexdigest()[:20]
        return f"{base}|{project}|pat:{digest}"
    if auth.cookie:
        digest = hashlib.sha256(auth.cookie.encode("utf-8")).hexdigest()[:20]
        return f"{base}|{project}|cookie:{digest}"
    return f"{base}|{project}|anonymous"


async def resolve_account_key(client, auth: TfsAuth) -> str:
    try:
        response = await client.client.get(
            "/_apis/connectionData",
            params={"connectOptions": "includeServices", "lastChangeId": "-1", "api-version": "5.0"},
        )
        if response.status_code == 200:
            payload = response.json()
            user = payload.get("authenticatedUser") or {}
            unique = (user.get("uniqueName") or user.get("descriptor") or auth.username or "").strip()
            if unique:
                return f"{auth.base_url.rstrip('/').lower()}|{unique.lower()}"
    except Exception:
        pass
    return fallback_account_key(auth)
