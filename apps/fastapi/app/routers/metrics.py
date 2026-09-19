from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import current_user
from ..models import Document, Question, ReviewItem, ReviewStatus, User

router = APIRouter(tags=["Dashboard"])


@router.get("/api/v1/metrics", summary="Live workspace counters for operability")
async def metrics(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    owner = Document.ownerId == user.id
    documents = await db.scalar(select(func.count()).select_from(Document).where(owner)) or 0
    failed = await db.scalar(select(func.count()).select_from(Document).where(owner, Document.status == "FAILED")) or 0
    questions = await db.scalar(select(func.count()).select_from(Question).join(Document).where(owner)) or 0
    review_open = await db.scalar(
        select(func.count())
        .select_from(ReviewItem)
        .join(Document)
        .where(owner, ReviewItem.status.in_([ReviewStatus.OPEN, ReviewStatus.IN_REVIEW]))
    ) or 0
    return {
        "documents_uploaded_total": documents,
        "documents_failed_total": failed,
        "questions_extracted_total": questions,
        "review_items_open_total": review_open,
        "source": "postgresql",
    }
