from __future__ import annotations

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .db import get_db
from .errors import AppError
from .models import Answer, Document, Question, User
from .security import decode_access_token


async def current_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError("UNAUTHORIZED", "Authentication is required.", 401)
    payload = decode_access_token(authorization.split(" ", 1)[1].strip())
    user_id = payload.get("sub")
    if not user_id:
        raise AppError("UNAUTHORIZED", "Authentication is required.", 401)
    user = await db.get(User, user_id)
    if not user:
        raise AppError("UNAUTHORIZED", "Authentication is required.", 401)
    return user


async def require_document(user: User, document_id: str, db: AsyncSession) -> Document:
    result = await db.execute(select(Document).where(Document.id == document_id, Document.ownerId == user.id))
    document = result.scalar_one_or_none()
    if not document:
        raise AppError("DOCUMENT_NOT_FOUND", "Document was not found.", 404)
    return document


async def require_question(user: User, question_id: str, db: AsyncSession) -> Question:
    result = await db.execute(
        select(Question)
        .join(Document)
        .where(Question.id == question_id, Document.ownerId == user.id)
        .options(
            selectinload(Question.options),
            selectinload(Question.assets),
            selectinload(Question.reviewItems),
            selectinload(Question.answer).selectinload(Answer.sources),
            selectinload(Question.document),
        )
    )
    question = result.scalar_one_or_none()
    if not question:
        raise AppError("QUESTION_NOT_FOUND", "Question was not found.", 404)
    return question
