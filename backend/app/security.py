
import os
import secrets

from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(
    name="X-API-Key",
    auto_error=False,
)


async def require_api_key(
    supplied_key: str | None = Depends(api_key_header),
):
    expected_key = os.getenv("DEVPILOT_API_KEY")

    if not expected_key:
        raise HTTPException(
            status_code=503,
            detail="API authentication is not configured.",
        )

    if not supplied_key or not secrets.compare_digest(
        supplied_key,
        expected_key,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid API key.",
        )
