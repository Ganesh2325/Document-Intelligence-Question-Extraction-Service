from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from uuid import uuid4

from minio import Minio

from .config import get_settings

_client: Minio | None = None


def storage_client() -> Minio:
    global _client
    if _client is None:
        settings = get_settings()
        _client = Minio(
            f"{settings.MINIO_ENDPOINT}:{settings.MINIO_PORT}",
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_USE_SSL,
            region=settings.MINIO_REGION,
        )
    return _client


def ensure_bucket() -> None:
    settings = get_settings()
    client = storage_client()
    if not client.bucket_exists(settings.MINIO_BUCKET):
        client.make_bucket(settings.MINIO_BUCKET, location=settings.MINIO_REGION)


def build_storage_key(owner_id: str, extension: str) -> str:
    now = datetime.now(timezone.utc)
    return f"documents/{owner_id}/{now.year}/{now.month:02d}/{uuid4()}{extension}"


def put_object(key: str, body: bytes, mime_type: str) -> None:
    settings = get_settings()
    storage_client().put_object(
        settings.MINIO_BUCKET,
        key,
        BytesIO(body),
        length=len(body),
        content_type=mime_type,
    )


def get_object_bytes(key: str) -> bytes:
    settings = get_settings()
    response = storage_client().get_object(settings.MINIO_BUCKET, key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def delete_object(key: str) -> None:
    settings = get_settings()
    storage_client().remove_object(settings.MINIO_BUCKET, key)


def bucket_exists() -> bool:
    settings = get_settings()
    return storage_client().bucket_exists(settings.MINIO_BUCKET)
