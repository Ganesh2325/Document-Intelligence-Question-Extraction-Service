from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.responses import JSONResponse, Response

from ..db import get_db
from ..deps import current_user, require_document
from ..errors import AppError
from ..models import DocumentGroup, DocumentGroupMember, DocumentRelationship, DocumentRole, RelationshipType, User
from ..schemas import AddGroupDocumentBody, CreateGroupBody, CreateRelationshipBody
from ..serializers import paginated, parse_pagination, serialize_document

router = APIRouter(tags=["Document Groups"])


def _serialize_group(group: DocumentGroup) -> dict:
    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "createdAt": group.createdAt.isoformat() if group.createdAt else None,
        "documents": [
            {"role": member.role.value if hasattr(member.role, "value") else member.role, "document": serialize_document(member.document)}
            for member in group.members
        ],
    }


@router.post("/api/v1/document-groups", status_code=201, summary="Create a document group")
async def create_group(
    body: CreateGroupBody,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    group = DocumentGroup(ownerId=user.id, name=body.name, description=body.description)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return JSONResponse({"group": {"id": group.id, "ownerId": group.ownerId, "name": group.name, "description": group.description, "createdAt": group.createdAt.isoformat(), "updatedAt": group.updatedAt.isoformat()}}, status_code=201)


@router.get("/api/v1/document-groups", summary="List document groups")
async def list_groups(
    page: int | None = None,
    limit: int | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    resolved_page, resolved_limit, skip = parse_pagination(page, limit)
    filters = [DocumentGroup.ownerId == user.id]
    total = await db.scalar(select(func.count()).select_from(DocumentGroup).where(*filters)) or 0
    result = await db.execute(
        select(DocumentGroup)
        .where(*filters)
        .options(selectinload(DocumentGroup.members).selectinload(DocumentGroupMember.document))
        .order_by(DocumentGroup.createdAt.desc())
        .offset(skip)
        .limit(resolved_limit)
    )
    items = result.scalars().unique().all()
    return paginated([_serialize_group(group) for group in items], total, resolved_page, resolved_limit)


@router.get("/api/v1/document-groups/{group_id}", summary="Get a document group")
async def get_group(
    group_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DocumentGroup)
        .where(DocumentGroup.id == group_id, DocumentGroup.ownerId == user.id)
        .options(selectinload(DocumentGroup.members).selectinload(DocumentGroupMember.document))
    )
    group = result.scalar_one_or_none()
    if not group:
        raise AppError("GROUP_NOT_FOUND", "Document group was not found.", 404)
    return {"group": _serialize_group(group)}


@router.post("/api/v1/document-groups/{group_id}/documents", status_code=201, summary="Add a document to a group")
async def add_group_document(
    group_id: str,
    body: AddGroupDocumentBody,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    group = (
        await db.execute(select(DocumentGroup).where(DocumentGroup.id == group_id, DocumentGroup.ownerId == user.id))
    ).scalar_one_or_none()
    if not group:
        raise AppError("GROUP_NOT_FOUND", "Document group was not found.", 404)
    document = await require_document(user, body.documentId, db)
    existing = (
        await db.execute(
            select(DocumentGroupMember).where(
                DocumentGroupMember.groupId == group.id,
                DocumentGroupMember.documentId == document.id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.role = DocumentRole(body.role)
        member = existing
    else:
        member = DocumentGroupMember(groupId=group.id, documentId=document.id, role=DocumentRole(body.role))
        db.add(member)

    if body.role == "ANSWER_KEY":
        paper = (
            await db.execute(
                select(DocumentGroupMember).where(
                    DocumentGroupMember.groupId == group.id,
                    DocumentGroupMember.role == DocumentRole.QUESTION_PAPER,
                    DocumentGroupMember.documentId != document.id,
                )
            )
        ).scalar_one_or_none()
        if paper:
            stmt = (
                insert(DocumentRelationship)
                .values(
                    sourceDocumentId=paper.documentId,
                    targetDocumentId=document.id,
                    type=RelationshipType.ANSWER_KEY_FOR,
                )
                .on_conflict_do_nothing(
                    constraint="DocumentRelationship_sourceDocumentId_targetDocumentId_type_key"
                )
            )
            await db.execute(stmt)
    await db.commit()
    await db.refresh(member)
    return JSONResponse(
        {
            "member": {
                "id": member.id,
                "groupId": member.groupId,
                "documentId": member.documentId,
                "role": member.role.value if hasattr(member.role, "value") else member.role,
                "createdAt": member.createdAt.isoformat(),
            }
        },
        status_code=201,
    )


@router.delete("/api/v1/document-groups/{group_id}/documents/{document_id}", status_code=204, summary="Remove a document from a group")
async def remove_group_document(
    group_id: str,
    document_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    group = (
        await db.execute(select(DocumentGroup).where(DocumentGroup.id == group_id, DocumentGroup.ownerId == user.id))
    ).scalar_one_or_none()
    if not group:
        raise AppError("GROUP_NOT_FOUND", "Document group was not found.", 404)
    members = (
        await db.execute(
            select(DocumentGroupMember).where(
                DocumentGroupMember.groupId == group.id,
                DocumentGroupMember.documentId == document_id,
            )
        )
    ).scalars().all()
    for member in members:
        await db.delete(member)
    await db.commit()
    return Response(status_code=204)


@router.post("/api/v1/documents/{document_id}/relationships", status_code=201, summary="Create a document relationship")
async def create_relationship(
    document_id: str,
    body: CreateRelationshipBody,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    source = await require_document(user, document_id, db)
    target = await require_document(user, body.targetDocumentId, db)
    existing = (
        await db.execute(
            select(DocumentRelationship).where(
                DocumentRelationship.sourceDocumentId == source.id,
                DocumentRelationship.targetDocumentId == target.id,
                DocumentRelationship.type == body.type,
            )
        )
    ).scalar_one_or_none()
    if existing:
        relationship = existing
    else:
        relationship = DocumentRelationship(
            sourceDocumentId=source.id,
            targetDocumentId=target.id,
            type=RelationshipType(body.type),
        )
        db.add(relationship)
        await db.commit()
        await db.refresh(relationship)
    if existing:
        await db.commit()
    return JSONResponse(
        {
            "relationship": {
                "id": relationship.id,
                "sourceDocumentId": relationship.sourceDocumentId,
                "targetDocumentId": relationship.targetDocumentId,
                "type": relationship.type.value if hasattr(relationship.type, "value") else relationship.type,
                "createdAt": relationship.createdAt.isoformat(),
            }
        },
        status_code=201,
    )
