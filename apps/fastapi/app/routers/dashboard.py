from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import get_db
from ..deps import current_user
from ..models import Document, JobStatus, ProcessingJob, Question, ReviewItem, ReviewStatus, User
from ..serializers import serialize_document

router = APIRouter(tags=["Dashboard"])

PROCESSING_STATUSES = [
    "QUEUED",
    "VALIDATING",
    "PREPROCESSING",
    "OCR_PROCESSING",
    "STRUCTURE_ANALYSIS",
    "QUESTION_EXTRACTION",
    "ANSWER_ANALYSIS",
    "VALIDATING_RESULTS",
]
COMPLETED_STATUSES = ["COMPLETED", "PARTIALLY_COMPLETED", "REVIEW_REQUIRED"]


@router.get("/api/v1/dashboard/stats", summary="Workspace metrics from live data")
async def dashboard_stats(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    owner = Document.ownerId == user.id
    total_documents = await db.scalar(select(func.count()).select_from(Document).where(owner)) or 0
    completed_documents = await db.scalar(
        select(func.count()).select_from(Document).where(owner, Document.status.in_(COMPLETED_STATUSES))
    ) or 0
    processing_documents = await db.scalar(
        select(func.count()).select_from(Document).where(owner, Document.status.in_(PROCESSING_STATUSES))
    ) or 0
    failed_documents = await db.scalar(
        select(func.count()).select_from(Document).where(owner, Document.status == "FAILED")
    ) or 0
    questions_extracted = await db.scalar(
        select(func.count()).select_from(Question).join(Document).where(owner)
    ) or 0
    review_open = await db.scalar(
        select(func.count())
        .select_from(ReviewItem)
        .join(Document)
        .where(owner, ReviewItem.status.in_([ReviewStatus.OPEN, ReviewStatus.IN_REVIEW]))
    ) or 0
    average_confidence = await db.scalar(
        select(func.avg(Question.overallConfidence)).join(Document).where(owner)
    )
    recent = (
        await db.execute(select(Document).where(owner).order_by(Document.createdAt.desc()).limit(8))
    ).scalars().all()
    active_jobs = (
        await db.execute(
            select(ProcessingJob)
            .join(Document)
            .where(owner, ProcessingJob.status.in_([JobStatus.QUEUED, JobStatus.ACTIVE]))
            .options(selectinload(ProcessingJob.document))
            .order_by(ProcessingJob.createdAt.desc())
            .limit(10)
        )
    ).scalars().unique().all()
    processed = completed_documents + failed_documents
    success_rate = None if processed == 0 else completed_documents / processed
    average_time = await db.scalar(
        select(func.avg(Document.processingDurationMs)).where(owner, Document.processingDurationMs.is_not(None))
    )
    return {
        "documentsProcessed": total_documents,
        "completedDocuments": completed_documents,
        "processingDocuments": processing_documents,
        "failedDocuments": failed_documents,
        "questionsExtracted": questions_extracted,
        "reviewRequired": review_open,
        "averageConfidence": float(average_confidence) if average_confidence is not None else None,
        "processingSuccessRate": success_rate,
        "averageProcessingTimeMs": float(average_time) if average_time is not None else None,
        "recentDocuments": [serialize_document(doc) for doc in recent],
        "activeJobs": [
            {
                "id": job.id,
                "documentId": job.documentId,
                "filename": job.document.filename,
                "stage": job.stage,
                "status": job.status.value if hasattr(job.status, "value") else job.status,
                "progress": job.document.progress,
            }
            for job in active_jobs
        ],
    }
