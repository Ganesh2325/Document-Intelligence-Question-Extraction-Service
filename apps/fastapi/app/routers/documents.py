from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.responses import JSONResponse, Response

from ..config import get_settings
from ..db import get_db
from ..deps import current_user, require_document
from ..errors import AppError
from ..models import Answer, Document, DocumentPage, DocumentStatus, ExtractionWarning, ProcessingJob, Question, ReviewItem, User
from ..queue import enqueue_document_processing
from ..serializers import paginated, parse_pagination, serialize_document, serialize_job, serialize_question, serialize_review
from ..storage import build_storage_key, delete_object, get_object_bytes, put_object
from ..validation import sanitize_filename, validate_upload

router = APIRouter(tags=["Documents"])


def _csv_escape(value: str) -> str:
    if any(char in value for char in '",\n'):
        return '"' + value.replace('"', '""') + '"'
    return value


@router.post("/api/v1/documents", status_code=201, summary="Upload a document")
async def upload_document(
    request: Request,
    file: UploadFile | None = File(default=None, alias="file"),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    if file is None:
        raise AppError("MISSING_FILE", "A file part named 'file' is required.", 400)
    buffer = await file.read()
    filename = sanitize_filename(file.filename or "upload")
    validation = validate_upload(filename, len(buffer), buffer, settings.MAX_FILE_SIZE)
    if not validation.ok:
        raise AppError(validation.code or "INVALID_UPLOAD", validation.message or "Upload was rejected.", 400)

    extension = Path(filename).suffix.lower() or ".bin"
    storage_key = build_storage_key(user.id, extension)
    document = Document(
        ownerId=user.id,
        filename=filename,
        mimeType=validation.detected_mime or file.content_type or "application/octet-stream",
        sizeBytes=len(buffer),
        storageKey=storage_key,
        status="UPLOADING",
        currentStage="upload",
        progress=5,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    try:
        put_object(storage_key, buffer, document.mimeType)
    except Exception as exc:
        document.status = "FAILED"
        document.failureCode = "STORAGE_FAILURE"
        document.failureReason = "The document could not be stored."
        document.updatedAt = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.commit()
        raise AppError("STORAGE_FAILURE", "The document could not be stored. Try again.", 503, retryable=True) from exc

    document.status = "UPLOADED"
    document.progress = 8
    document.updatedAt = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(document)
    return JSONResponse({"document": serialize_document(document)}, status_code=201)


@router.get("/api/v1/documents", summary="List documents")
async def list_documents(
    status: str | None = None,
    q: str | None = None,
    page: int | None = None,
    limit: int | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    resolved_page, resolved_limit, skip = parse_pagination(page, limit)
    filters = [Document.ownerId == user.id]
    if status:
        filters.append(Document.status == status)
    if q:
        filters.append(Document.filename.ilike(f"%{q}%"))
    total = await db.scalar(select(func.count()).select_from(Document).where(*filters)) or 0
    result = await db.execute(
        select(Document).where(*filters).order_by(Document.createdAt.desc()).offset(skip).limit(resolved_limit)
    )
    items = result.scalars().all()
    return paginated([serialize_document(item) for item in items], total, resolved_page, resolved_limit)


@router.get("/api/v1/documents/{document_id}", summary="Get document")
async def get_document(
    document_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await require_document(user, document_id, db)
    jobs = (
        await db.execute(
            select(ProcessingJob).where(ProcessingJob.documentId == document.id).order_by(ProcessingJob.createdAt.asc())
        )
    ).scalars().all()
    return {"document": serialize_document(document), "jobs": [serialize_job(job) for job in jobs]}


@router.delete("/api/v1/documents/{document_id}", status_code=204, summary="Delete document")
async def delete_document(
    document_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await require_document(user, document_id, db)
    storage_key = document.storageKey
    await db.delete(document)
    await db.commit()
    try:
        delete_object(storage_key)
    except Exception:
        pass
    return Response(status_code=204)


@router.post("/api/v1/documents/{document_id}/process", tags=["Processing"], summary="Queue document processing")
async def process_document(
    document_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await require_document(user, document_id, db)
    previous_status = document.status.value if hasattr(document.status, "value") else str(document.status)
    next_version = document.processingVersion + 1
    try:
        job_id = await enqueue_document_processing(
            {
                "documentId": document.id,
                "ownerId": user.id,
                "processingVersion": next_version,
                "requestedAt": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception as exc:
        raise AppError(
            "QUEUE_UNAVAILABLE",
            "The processing queue is unavailable. The document was stored but not queued.",
            503,
            retryable=True,
        ) from exc

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if previous_status == "FAILED":
        document.retryCount += 1
    document.status = DocumentStatus.QUEUED
    document.currentStage = "validation"
    document.progress = 10
    document.startedAt = now
    document.completedAt = None
    document.failureReason = None
    document.failureCode = None
    document.processingVersion = next_version
    document.updatedAt = now
    db.add(
        ProcessingJob(
            documentId=document.id,
            queueName="document-processing",
            bullJobId=job_id,
            stage="validation",
            status="QUEUED",
        )
    )
    await db.commit()
    await db.refresh(document)
    return {"document": serialize_document(document), "jobId": job_id}


@router.post("/api/v1/documents/{document_id}/cancel", tags=["Processing"], summary="Cancel processing")
async def cancel_document(
    document_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await require_document(user, document_id, db)
    document.status = "CANCELLED"
    document.currentStage = "cancelled"
    document.completedAt = datetime.now(timezone.utc).replace(tzinfo=None)
    document.updatedAt = document.completedAt
    await db.commit()
    await db.refresh(document)
    return {"document": serialize_document(document)}


@router.get("/api/v1/documents/{document_id}/status", tags=["Processing"], summary="Processing status")
async def document_status(
    document_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await require_document(user, document_id, db)
    jobs = (
        await db.execute(
            select(ProcessingJob).where(ProcessingJob.documentId == document.id).order_by(ProcessingJob.createdAt.asc())
        )
    ).scalars().all()
    return {
        "documentId": document.id,
        "status": document.status.value if hasattr(document.status, "value") else document.status,
        "currentStage": document.currentStage,
        "progress": document.progress,
        "startedAt": serialize_document(document)["startedAt"],
        "completedAt": serialize_document(document)["completedAt"],
        "failureReason": document.failureReason,
        "failureCode": document.failureCode,
        "retryCount": document.retryCount,
        "processingDurationMs": document.processingDurationMs,
        "questionCount": document.questionCount,
        "reviewCount": document.reviewCount,
        "averageConfidence": document.averageConfidence,
        "jobs": [serialize_job(job) for job in jobs],
    }


@router.get("/api/v1/documents/{document_id}/pages", summary="List document pages")
async def list_pages(
    document_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await require_document(user, document_id, db)
    pages = (
        await db.execute(
            select(DocumentPage).where(DocumentPage.documentId == document.id).order_by(DocumentPage.pageNumber.asc())
        )
    ).scalars().all()
    return {
        "items": [
            {
                "id": page.id,
                "pageNumber": page.pageNumber,
                "hasSelectableText": page.hasSelectableText,
                "usedOcr": page.usedOcr,
                "ocrConfidence": page.ocrConfidence,
                "width": page.width,
                "height": page.height,
                "hasPreview": bool(page.storageKey),
            }
            for page in pages
        ]
    }


@router.get("/api/v1/documents/{document_id}/pages/{page_number}/image", summary="Page preview image")
async def page_image(
    document_id: str,
    page_number: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await require_document(user, document_id, db)
    page = (
        await db.execute(
            select(DocumentPage).where(DocumentPage.documentId == document.id, DocumentPage.pageNumber == page_number)
        )
    ).scalar_one_or_none()
    if not page or not page.storageKey:
        raise AppError("PAGE_PREVIEW_UNAVAILABLE", "No preview image is available for this page.", 404)
    body = get_object_bytes(page.storageKey)
    return Response(content=body, media_type="image/png")


@router.get("/api/v1/documents/{document_id}/download", summary="Download original document")
async def download_document(
    document_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await require_document(user, document_id, db)
    body = get_object_bytes(document.storageKey)
    return Response(
        content=body,
        media_type=document.mimeType,
        headers={"Content-Disposition": f'attachment; filename="{document.filename}"'},
    )


@router.get("/api/v1/documents/{document_id}/questions", tags=["Questions"], summary="List questions in a document")
async def list_document_questions(
    document_id: str,
    status: str | None = None,
    type: str | None = Query(default=None),
    q: str | None = None,
    minConfidence: float | None = None,
    maxConfidence: float | None = None,
    pageNumber: int | None = None,
    page: int | None = None,
    limit: int | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await require_document(user, document_id, db)
    resolved_page, resolved_limit, skip = parse_pagination(page, limit, 50)
    filters = [Question.documentId == document.id, Question.processingVersion == document.processingVersion]
    if status:
        filters.append(Question.status == status)
    if type:
        filters.append(Question.questionType == type)
    if q:
        filters.append(or_(Question.questionText.ilike(f"%{q}%"), Question.questionNumber.ilike(f"%{q}%")))
    if minConfidence is not None:
        filters.append(Question.overallConfidence >= minConfidence)
    if maxConfidence is not None:
        filters.append(Question.overallConfidence <= maxConfidence)
    if pageNumber is not None:
        filters.append(Question.sourcePages.contains([pageNumber]))
    total = await db.scalar(select(func.count()).select_from(Question).where(*filters)) or 0
    result = await db.execute(
        select(Question)
        .where(*filters)
        .options(selectinload(Question.options), selectinload(Question.answer), selectinload(Question.reviewItems))
        .order_by(Question.sortOrder.asc())
        .offset(skip)
        .limit(resolved_limit)
    )
    items = result.scalars().unique().all()
    return paginated([serialize_question(item) for item in items], total, resolved_page, resolved_limit)


@router.get("/api/v1/documents/{document_id}/questions/export", tags=["Questions"], summary="Export extracted questions")
async def export_questions(
    document_id: str,
    format: str = "json",
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await require_document(user, document_id, db)
    questions = (
        await db.execute(
            select(Question)
            .where(Question.documentId == document.id, Question.processingVersion == document.processingVersion)
            .options(selectinload(Question.options), selectinload(Question.answer), selectinload(Question.reviewItems))
            .order_by(Question.sortOrder.asc())
        )
    ).scalars().unique().all()
    payload = [serialize_question(question) for question in questions]
    if format.lower() == "csv":
        header = ["number", "type", "text", "options", "answer", "confidence", "pages", "status"]
        rows = [
            ",".join(
                [
                    item["questionNumber"],
                    item["questionType"],
                    _csv_escape(item["questionText"]),
                    _csv_escape(" | ".join(f"{opt['label']}. {opt['text']}" for opt in item.get("options") or [])),
                    item["answer"]["value"] if item.get("answer") and item["answer"].get("value") else "",
                    str(item["confidence"]["overall"]),
                    "-".join(str(page) for page in item["source"]["pages"]),
                    item["status"],
                ]
            )
            for item in payload
        ]
        body = "\n".join([",".join(header), *rows])
        return Response(
            content=body,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{document.filename}-questions.csv"'},
        )
    return JSONResponse(
        {"documentId": document.id, "filename": document.filename, "questions": payload},
        headers={"Content-Disposition": f'attachment; filename="{document.filename}-questions.json"'},
    )


@router.get("/api/v1/documents/{document_id}/answers", tags=["Answers"], summary="List answers for a document")
async def list_answers(
    document_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await require_document(user, document_id, db)
    result = await db.execute(
        select(Answer)
        .join(Question)
        .where(Question.documentId == document.id, Question.processingVersion == document.processingVersion)
        .options(selectinload(Answer.question), selectinload(Answer.sources))
        .order_by(Question.sortOrder.asc())
    )
    answers = result.scalars().unique().all()
    return {
        "items": [
            {
                "id": answer.id,
                "questionId": answer.questionId,
                "questionNumber": answer.question.questionNumber,
                "value": answer.value,
                "confidence": answer.confidence,
                "status": answer.status.value if hasattr(answer.status, "value") else answer.status,
                "sources": [
                    {
                        "id": source.id,
                        "answerId": source.answerId,
                        "documentId": source.documentId,
                        "pages": source.pages,
                        "rawText": source.rawText,
                        "format": source.format,
                    }
                    for source in answer.sources
                ],
            }
            for answer in answers
        ]
    }


@router.get("/api/v1/documents/{document_id}/review-items", tags=["Review"], summary="List review items for a document")
async def list_document_review_items(
    document_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await require_document(user, document_id, db)
    result = await db.execute(
        select(ReviewItem)
        .join(Question)
        .where(ReviewItem.documentId == document.id, Question.processingVersion == document.processingVersion)
        .options(selectinload(ReviewItem.question))
        .order_by(ReviewItem.severity.asc(), ReviewItem.createdAt.desc())
    )
    items = result.scalars().unique().all()
    return {"items": [serialize_review(item) for item in items]}


@router.get("/api/v1/documents/{document_id}/warnings", tags=["Review"], summary="List extraction warnings")
async def list_warnings(
    document_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    document = await require_document(user, document_id, db)
    warnings = (
        await db.execute(
            select(ExtractionWarning)
            .where(ExtractionWarning.documentId == document.id)
            .order_by(ExtractionWarning.createdAt.desc())
        )
    ).scalars().all()
    return {
        "items": [
            {
                "id": warning.id,
                "documentId": warning.documentId,
                "questionId": warning.questionId,
                "code": warning.code,
                "message": warning.message,
                "severity": warning.severity.value if hasattr(warning.severity, "value") else warning.severity,
                "createdAt": warning.createdAt.isoformat() if warning.createdAt else None,
            }
            for warning in warnings
        ]
    }
