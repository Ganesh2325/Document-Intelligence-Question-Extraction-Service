from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _env_files() -> tuple[str, ...]:
    here = Path(__file__).resolve()
    candidates = [
        Path.cwd() / ".env",
        here.parents[3] / ".env" if len(here.parents) >= 4 else None,
        here.parents[2] / ".env",
        here.parents[1] / ".env",
    ]
    files = []
    seen: set[str] = set()
    for path in candidates:
        if path and path.is_file():
            resolved = str(path.resolve())
            if resolved not in seen:
                files.append(resolved)
                seen.add(resolved)
    return tuple(files) or (".env",)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_files(),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    NODE_ENV: str = "development"
    LOG_LEVEL: str = "info"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 3001
    CORS_ORIGIN: str = "http://localhost:3000"
    PUBLIC_API_URL: str = "http://localhost:3001"
    DATABASE_URL: str
    REDIS_URL: str
    JWT_SECRET: str
    JWT_EXPIRES_IN: str = "7d"
    MINIO_ENDPOINT: str = "localhost"
    MINIO_PORT: int = 9000
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_BUCKET: str = "folio-documents"
    MINIO_USE_SSL: bool = False
    MINIO_REGION: str = "us-east-1"
    MAX_FILE_SIZE: int = 26_214_400
    MAX_PAGES: int = 200

    @field_validator("MINIO_USE_SSL", mode="before")
    @classmethod
    def _ssl_flag(cls, value: object) -> bool:
        if isinstance(value, bool):
            return value
        return str(value).lower() == "true"

    @property
    def sqlalchemy_url(self) -> str:
        url = self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
        parsed = urlparse(url)
        query = "&".join(
            part
            for part in (parsed.query or "").split("&")
            if part and not part.startswith("schema=")
        )
        return parsed._replace(query=query).geturl()

    @property
    def cors_origins(self) -> list[str]:
        return [item.strip() for item in self.CORS_ORIGIN.split(",") if item.strip()]

    @property
    def is_production(self) -> bool:
        return self.NODE_ENV == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
