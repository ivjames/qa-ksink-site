from __future__ import annotations

from typing import Any, Callable

from fastapi import Depends, Header, HTTPException

from .data import DEMO_USERS

TOKEN_PREFIX = "Bearer demo-token-"


def current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.startswith(TOKEN_PREFIX):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    role = authorization.removeprefix(TOKEN_PREFIX)
    for user in DEMO_USERS:
        if user["role"] == role:
            return user
    raise HTTPException(status_code=401, detail="Unknown token")


def require_role(*roles: str) -> Callable[..., dict[str, Any]]:
    def dependency(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail=f"Requires role: {' or '.join(roles)}")
        return user

    return dependency
