from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "postgresql://folio:folio@localhost:5432/folio")
os.environ.setdefault("REDIS_URL", "redis://localhost:6380")
os.environ.setdefault("JWT_SECRET", "change-me-in-development-use-a-long-random-value")
os.environ.setdefault("MINIO_ACCESS_KEY", "minioadmin")
os.environ.setdefault("MINIO_SECRET_KEY", "minioadmin")
os.environ.setdefault("NODE_ENV", "test")
