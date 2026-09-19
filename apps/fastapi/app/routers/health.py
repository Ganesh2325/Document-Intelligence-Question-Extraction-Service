from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from ..config import get_settings
from ..db import get_db
from ..queue import ping_redis
from ..storage import bucket_exists

router = APIRouter(tags=["Health"])


@router.get("/health", summary="Liveness probe")
async def health() -> dict:
    return {"status": "ok", "service": "folio-api", "time": datetime.now(timezone.utc).isoformat()}


@router.get("/health/ready", summary="Readiness probe")
async def ready(db: AsyncSession = Depends(get_db)):
    checks = {"database": "ok", "redis": "ok", "storage": "ok"}
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        checks["database"] = "error"
    try:
        if not await ping_redis():
            checks["redis"] = "error"
    except Exception:
        checks["redis"] = "error"
    try:
        get_settings()
        if not bucket_exists():
            checks["storage"] = "error"
    except Exception:
        checks["storage"] = "error"
    ready_ok = all(value == "ok" for value in checks.values())
    return JSONResponse(
        {"status": "ready" if ready_ok else "not_ready", "checks": checks},
        status_code=200 if ready_ok else 503,
    )
