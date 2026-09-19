from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import get_db
from ..deps import current_user, require_question
from ..models import Answer, Document, Question, QuestionOption, QuestionStatus, QuestionType, User
from ..schemas import UpdateQuestionBody
from ..serializers import paginated, parse_pagination, serialize_question

router = APIRouter(tags=["Questions"])


@router.get("/api/v1/questions", summary="Search questions across documents")
async def search_questions(
    documentId: str | None = None,
    status: str | None = None,
    type: str | None = None,
    q: str | None = None,
    minConfidence: float | None = None,
    maxConfidence: float | None = None,
    band: str | None = None,
    answered: str | None = None,
    pageNumber: int | None = None,
    page: int | None = None,
    limit: int | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    resolved_page, resolved_limit, skip = parse_pagination(page, limit, 30)
    filters = [Document.ownerId == user.id]
    if documentId:
        filters.append(Question.documentId == documentId)
    if status:
        filters.append(Question.status == status)
    if type:
        filters.append(Question.questionType == type)
    if q:
        filters.append(
            or_(
                Question.questionText.ilike(f"%{q}%"),
                Question.questionNumber.ilike(f"%{q}%"),
                Document.filename.ilike(f"%{q}%"),
            )
        )
    if minConfidence is not None:
        filters.append(Question.overallConfidence >= minConfidence)
    if maxConfidence is not None:
        filters.append(Question.overallConfidence <= maxConfidence)
    if band == "high":
        filters.append(Question.overallConfidence >= 0.85)
    elif band == "medium":
        filters.append(Question.overallConfidence >= 0.7)
        filters.append(Question.overallConfidence < 0.85)
    elif band == "review":
        filters.append(Question.status == QuestionStatus.REVIEW_REQUIRED)
    if answered == "true":
        filters.append(Answer.status == "MATCHED")
    elif answered == "false":
        filters.append(or_(Answer.id.is_(None), Answer.status.in_(["MISSING", "UNCERTAIN"])))
    if pageNumber is not None:
        filters.append(Question.sourcePages.contains([pageNumber]))

    query = (
        select(Question)
        .join(
            Document,
            (Question.documentId == Document.id) & (Question.processingVersion == Document.processingVersion),
        )
        .outerjoin(Answer, Answer.questionId == Question.id)
        .where(*filters)
    )
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    result = await db.execute(
        query.options(selectinload(Question.answer), selectinload(Question.document))
        .order_by(Document.createdAt.asc(), Question.sortOrder.asc())
        .offset(skip)
        .limit(resolved_limit)
    )
    items = result.scalars().unique().all()
    payload = []
    for index, item in enumerate(items):
        row = serialize_question(item, document_filename=item.document.filename)
        row["questionNumber"] = str(skip + index + 1)
        payload.append(row)
    return paginated(payload, total, resolved_page, resolved_limit)


@router.get("/api/v1/questions/{question_id}", summary="Get question inspector payload")
async def get_question(
    question_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    question = await require_question(user, question_id, db)
    return {"question": serialize_question(question)}


@router.patch("/api/v1/questions/{question_id}", summary="Edit an extracted question")
async def update_question(
    question_id: str,
    body: UpdateQuestionBody,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    question = await require_question(user, question_id, db)
    if body.options is not None:
        existing = (
            await db.execute(select(QuestionOption).where(QuestionOption.questionId == question.id))
        ).scalars().all()
        for option in existing:
            await db.delete(option)
        for index, option in enumerate(body.options):
            db.add(
                QuestionOption(
                    questionId=question.id,
                    label=option.label,
                    text=option.text,
                    confidence=1,
                    sortOrder=index,
                )
            )
    if "answerValue" in body.model_fields_set:
        answer = (
            await db.execute(select(Answer).where(Answer.questionId == question.id))
        ).scalar_one_or_none()
        status = "MATCHED" if body.answerValue else "MISSING"
        confidence = 1 if body.answerValue else 0
        if answer:
            answer.value = body.answerValue
            answer.status = status
            answer.confidence = confidence
            answer.updatedAt = datetime.now(timezone.utc).replace(tzinfo=None)
        else:
            db.add(
                Answer(
                    questionId=question.id,
                    value=body.answerValue,
                    status=status,
                    confidence=confidence,
                )
            )
    if body.questionText is not None:
        question.questionText = body.questionText
    if body.questionType is not None:
        question.questionType = QuestionType(body.questionType)
    if body.questionNumber is not None:
        question.questionNumber = body.questionNumber
    question.status = QuestionStatus.VERIFIED
    question.updatedAt = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    question = await require_question(user, question.id, db)
    return {"question": serialize_question(question)}


@router.get("/api/v1/questions/{question_id}/neighbors", summary="Previous and next question in the document")
async def question_neighbors(
    question_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    question = await require_question(user, question_id, db)
    prev = (
        await db.execute(
            select(Question.id, Question.questionNumber)
            .where(
                Question.documentId == question.documentId,
                Question.processingVersion == question.processingVersion,
                Question.sortOrder < question.sortOrder,
            )
            .order_by(Question.sortOrder.desc())
            .limit(1)
        )
    ).first()
    nxt = (
        await db.execute(
            select(Question.id, Question.questionNumber)
            .where(
                Question.documentId == question.documentId,
                Question.processingVersion == question.processingVersion,
                Question.sortOrder > question.sortOrder,
            )
            .order_by(Question.sortOrder.asc())
            .limit(1)
        )
    ).first()
    return {
        "previous": {"id": prev.id, "questionNumber": prev.questionNumber} if prev else None,
        "next": {"id": nxt.id, "questionNumber": nxt.questionNumber} if nxt else None,
    }
