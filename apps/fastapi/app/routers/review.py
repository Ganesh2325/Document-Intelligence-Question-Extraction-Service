from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import get_db
from ..deps import current_user
from ..errors import AppError
from ..models import Document, Question, QuestionStatus, ReviewItem, ReviewStatus, User
from ..schemas import ReviewActionBody, ReviewPatchBody
from ..serializers import paginated, parse_pagination, serialize_review

router = APIRouter(tags=["Review"])


async def _read_optional_body(request: Request) -> dict:
    import json

    raw = await request.body()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


async def _load_item(db: AsyncSession, user_id: str, item_id: str) -> ReviewItem:
    result = await db.execute(
        select(ReviewItem)
        .join(Document)
        .where(ReviewItem.id == item_id, Document.ownerId == user_id)
        .options(selectinload(ReviewItem.question))
    )
    item = result.scalar_one_or_none()
    if not item:
        raise AppError("REVIEW_ITEM_NOT_FOUND", "Review item was not found.", 404)
    return item


async def _mutate_review(
    db: AsyncSession,
    user: User,
    item_id: str,
    status: ReviewStatus,
    question_status: QuestionStatus | None = None,
    resolution: str | None = None,
) -> dict:
    item = await _load_item(db, user.id, item_id)
    if question_status is not None:
        question = await db.get(Question, item.questionId)
        if question:
            question.status = question_status
            question.updatedAt = datetime.now(timezone.utc).replace(tzinfo=None)
    item.status = status
    item.resolution = resolution or ("Dismissed by reviewer" if status == ReviewStatus.DISMISSED else "Approved by reviewer")
    item.actorId = user.id
    item.resolvedAt = datetime.now(timezone.utc).replace(tzinfo=None)
    item.updatedAt = item.resolvedAt
    await db.flush()

    open_count = await db.scalar(
        select(func.count())
        .select_from(ReviewItem)
        .where(ReviewItem.documentId == item.documentId, ReviewItem.status.in_([ReviewStatus.OPEN, ReviewStatus.IN_REVIEW]))
    ) or 0
    if open_count == 0:
        remaining = await db.scalar(
            select(func.count())
            .select_from(ReviewItem)
            .join(Question)
            .where(ReviewItem.documentId == item.documentId, Question.status == QuestionStatus.REVIEW_REQUIRED)
        ) or 0
        document = await db.get(Document, item.documentId)
        if document:
            document.reviewCount = open_count
            if remaining == 0:
                document.status = "COMPLETED"
            document.updatedAt = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    item = await _load_item(db, user.id, item.id)
    return {"reviewItem": serialize_review(item)}


@router.get("/api/v1/review-items", summary="List review queue")
async def list_review_items(
    status: str | None = None,
    severity: str | None = None,
    documentId: str | None = None,
    page: int | None = None,
    limit: int | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    resolved_page, resolved_limit, skip = parse_pagination(page, limit)
    filters = [Document.ownerId == user.id]
    if status:
        filters.append(ReviewItem.status == status)
    if severity:
        filters.append(ReviewItem.severity == severity)
    if documentId:
        filters.append(ReviewItem.documentId == documentId)
    query = select(ReviewItem).join(Document).where(*filters)
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    result = await db.execute(
        query.options(selectinload(ReviewItem.question))
        .order_by(ReviewItem.status.asc(), ReviewItem.severity.asc(), ReviewItem.createdAt.desc())
        .offset(skip)
        .limit(resolved_limit)
    )
    items = result.scalars().unique().all()
    return paginated([serialize_review(item) for item in items], total, resolved_page, resolved_limit)


@router.post("/api/v1/review-items/{item_id}/approve", summary="Approve a review item")
async def approve_review(item_id: str, request: Request, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    body = ReviewActionBody.model_validate(await _read_optional_body(request))
    return await _mutate_review(db, user, item_id, ReviewStatus.RESOLVED, QuestionStatus.VERIFIED, body.resolution)


@router.post("/api/v1/review-items/{item_id}/dismiss", summary="Dismiss a review item")
async def dismiss_review(item_id: str, request: Request, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    body = ReviewActionBody.model_validate(await _read_optional_body(request))
    return await _mutate_review(db, user, item_id, ReviewStatus.DISMISSED, None, body.resolution)


@router.post("/api/v1/review-items/{item_id}/resolve", summary="Resolve a review item")
async def resolve_review(item_id: str, request: Request, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    body = ReviewActionBody.model_validate(await _read_optional_body(request))
    return await _mutate_review(db, user, item_id, ReviewStatus.RESOLVED, QuestionStatus.VERIFIED, body.resolution)


@router.patch("/api/v1/review-items/{item_id}", summary="Update review status")
async def patch_review(
    item_id: str,
    body: ReviewPatchBody,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await _load_item(db, user.id, item_id)
    item.status = ReviewStatus(body.status)
    item.resolution = body.resolution
    item.actorId = user.id
    item.resolvedAt = (
        datetime.now(timezone.utc).replace(tzinfo=None) if body.status in {"RESOLVED", "DISMISSED"} else None
    )
    item.updatedAt = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    item = await _load_item(db, user.id, item.id)
    return {"reviewItem": serialize_review(item)}
