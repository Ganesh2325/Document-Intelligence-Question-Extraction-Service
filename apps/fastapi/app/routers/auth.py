from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import current_user
from ..errors import AppError
from ..models import User
from ..queue import get_redis
from ..schemas import LoginBody, RegisterBody
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


async def _hit_auth_limit(request: Request) -> None:
    try:
        redis = await get_redis()
        ip = request.client.host if request.client else "unknown"
        key = f"rl:auth:{ip}"
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, 60)
        if count > 10:
            raise AppError("RATE_LIMITED", "Too many requests. Please wait and try again.", 429)
    except AppError:
        raise
    except Exception:
        return


@router.post("/register", status_code=status.HTTP_201_CREATED, summary="Register a new user")
async def register(body: RegisterBody, request: Request, db: AsyncSession = Depends(get_db)):
    await _hit_auth_limit(request)
    email = body.email.lower()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise AppError("EMAIL_IN_USE", "An account with this email already exists.", 409)
    user = User(name=body.name.strip(), email=email, passwordHash=hash_password(body.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(user.id, user.email)
    return {"token": token, "user": {"id": user.id, "email": user.email, "name": user.name}}


@router.post("/login", summary="Login")
async def login(body: LoginBody, request: Request, db: AsyncSession = Depends(get_db)):
    await _hit_auth_limit(request)
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.passwordHash):
        raise AppError("INVALID_CREDENTIALS", "Email or password is incorrect.", 401)
    token = create_access_token(user.id, user.email)
    return {"token": token, "user": {"id": user.id, "email": user.email, "name": user.name}}


@router.get("/me", summary="Current user")
async def me(user: User = Depends(current_user)):
    return {"user": {"id": user.id, "email": user.email, "name": user.name}}
