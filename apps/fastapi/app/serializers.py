from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def enum_value(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    return value


def serialize_document(doc: Any) -> dict[str, Any]:
    return {
        "id": doc.id,
        "ownerId": doc.ownerId,
        "filename": doc.filename,
        "mimeType": doc.mimeType,
        "sizeBytes": doc.sizeBytes,
        "status": enum_value(doc.status),
        "currentStage": doc.currentStage,
        "progress": doc.progress,
        "pageCount": doc.pageCount,
        "startedAt": iso(doc.startedAt),
        "completedAt": iso(doc.completedAt),
        "failureReason": doc.failureReason,
        "failureCode": doc.failureCode,
        "retryCount": doc.retryCount,
        "processingDurationMs": doc.processingDurationMs,
        "processingVersion": doc.processingVersion,
        "averageConfidence": doc.averageConfidence,
        "highConfidenceCount": doc.highConfidenceCount,
        "reviewCount": doc.reviewCount,
        "questionCount": doc.questionCount,
        "detectedAsAnswerKey": doc.detectedAsAnswerKey,
        "createdAt": iso(doc.createdAt),
        "updatedAt": iso(doc.updatedAt),
    }


def serialize_job(job: Any) -> dict[str, Any]:
    return {
        "id": job.id,
        "documentId": job.documentId,
        "queueName": job.queueName,
        "stage": job.stage,
        "status": enum_value(job.status),
        "attempt": job.attempt,
        "startedAt": iso(job.startedAt),
        "completedAt": iso(job.completedAt),
        "durationMs": job.durationMs,
        "error": job.error,
        "createdAt": iso(job.createdAt),
    }


def serialize_question(question: Any, document_filename: str | None = None) -> dict[str, Any]:
    options = list(getattr(question, "options", None) or [])
    options.sort(key=lambda item: item.sortOrder)
    answer = getattr(question, "answer", None)
    sources = list(getattr(answer, "sources", None) or []) if answer else []
    review_items = list(getattr(question, "reviewItems", None) or [])
    needs_review = any(enum_value(item.status) in {"OPEN", "IN_REVIEW"} for item in review_items)
    payload = {
        "id": question.id,
        "documentId": question.documentId,
        "questionNumber": question.questionNumber,
        "questionText": question.questionText,
        "questionType": enum_value(question.questionType),
        "status": enum_value(question.status),
        "options": [
            {
                "id": option.id,
                "label": option.label,
                "text": option.text,
                "confidence": option.confidence,
            }
            for option in options
        ],
        "answer": None
        if answer is None
        else {
            "value": answer.value,
            "confidence": answer.confidence,
            "status": enum_value(answer.status),
            "sourcePages": [page for source in sources for page in (source.pages or [])],
            "sources": [
                {
                    "pages": source.pages,
                    "rawText": source.rawText,
                    "format": source.format,
                    "documentId": source.documentId,
                }
                for source in sources
            ],
        },
        "source": {
            "documentId": question.documentId,
            "pages": question.sourcePages or [],
            "regions": question.sourceRegions,
        },
        "confidence": {
            "overall": question.overallConfidence,
            "text": question.textConfidence,
            "options": question.optionsConfidence,
            "answer": question.answerConfidence,
            "sourceMapping": question.sourceMappingConfidence,
            "boundary": question.boundaryConfidence,
            "numbering": question.numberingConfidence,
        },
        "warnings": question.warnings,
        "startPage": question.startPage,
        "endPage": question.endPage,
        "reviewState": "NEEDS_REVIEW" if needs_review else enum_value(question.status),
        "createdAt": iso(question.createdAt),
        "updatedAt": iso(question.updatedAt),
    }
    if document_filename is not None:
        payload["documentFilename"] = document_filename
    return payload


def serialize_review(item: Any) -> dict[str, Any]:
    question = getattr(item, "question", None)
    return {
        "id": item.id,
        "documentId": item.documentId,
        "questionId": item.questionId,
        "severity": enum_value(item.severity),
        "reason": item.reason,
        "code": item.code,
        "confidence": item.confidence,
        "status": enum_value(item.status),
        "resolution": item.resolution,
        "resolvedAt": iso(item.resolvedAt),
        "createdAt": iso(item.createdAt),
        "question": None
        if question is None
        else {
            "id": question.id,
            "questionNumber": question.questionNumber,
            "questionText": question.questionText,
            "overallConfidence": question.overallConfidence,
            "startPage": question.startPage,
            "endPage": question.endPage,
        },
    }


def paginated(items: list[Any], total: int, page: int, limit: int) -> dict[str, Any]:
    return {
        "items": items,
        "page": page,
        "limit": limit,
        "total": total,
        "totalPages": max(1, (total + limit - 1) // limit) if limit else 1,
    }


def parse_pagination(page: int | None, limit: int | None, default_limit: int = 20) -> tuple[int, int, int]:
    resolved_page = max(1, page or 1)
    resolved_limit = min(100, max(1, limit or default_limit))
    return resolved_page, resolved_limit, (resolved_page - 1) * resolved_limit
