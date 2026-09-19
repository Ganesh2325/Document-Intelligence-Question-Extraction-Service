from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import get_settings
from .errors import AppError
from .queue import close_queue
from .routers import auth, dashboard, documents, groups, health, metrics, questions, review
from .storage import ensure_bucket

logger = logging.getLogger("folio.api")


def error_payload(code: str, message: str, request_id: str, details: object | None = None) -> dict:
    settings = get_settings()
    body: dict = {"error": {"code": code, "message": message, "requestId": request_id}}
    if details is not None and not settings.is_production:
        body["error"]["details"] = details
    return body


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        ensure_bucket()
    except Exception as exc:
        logger.warning("storage_init_skipped: %s", exc)
    yield
    await close_queue()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Folio Document Intelligence API",
        description=(
            "Document Processing & Question Extraction Service. Upload PDF/image examination material, "
            "process it asynchronously, and retrieve structured questions, answers, confidence scores, "
            "source pages, and human-review items through a system-independent HTTP API."
        ),
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        swagger_ui_parameters={"docExpansion": "list", "deepLinking": True},
    )

    cors: dict = {
        "allow_origins": settings.cors_origins,
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
        "expose_headers": ["x-request-id"],
    }
    if not settings.is_production:
        cors["allow_origin_regex"] = r"https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    app.add_middleware(CORSMiddleware, **cors)

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        response.headers["x-content-type-options"] = "nosniff"
        response.headers["referrer-policy"] = "no-referrer"
        return response

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        payload = error_payload(exc.code, exc.message, getattr(request.state, "request_id", str(uuid4())), exc.details)
        if exc.retryable:
            payload["error"]["retryable"] = True
        return JSONResponse(payload, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            error_payload(
                "VALIDATION_ERROR",
                "Request validation failed.",
                getattr(request.state, "request_id", str(uuid4())),
                exc.errors(),
            ),
            status_code=400,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request: Request, exc: StarletteHTTPException):
        code = "NOT_FOUND" if exc.status_code == 404 else "REQUEST_FAILED"
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(
            error_payload(code, message, getattr(request.state, "request_id", str(uuid4()))),
            status_code=exc.status_code,
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception):
        logger.exception("unhandled_error")
        message = "An unexpected error occurred." if settings.is_production else str(exc)
        return JSONResponse(
            error_payload("INTERNAL_ERROR", message, getattr(request.state, "request_id", str(uuid4()))),
            status_code=500,
        )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(documents.router)
    app.include_router(questions.router)
    app.include_router(review.router)
    app.include_router(groups.router)
    app.include_router(dashboard.router)
    app.include_router(metrics.router)

    @app.get("/", include_in_schema=False)
    async def root():
        return {
            "service": "folio-api",
            "framework": "FastAPI",
            "docs": "/docs",
            "openapi": "/openapi.json",
            "health": "/health",
        }

    @app.get("/docs/json", include_in_schema=False)
    async def openapi_json_alias():
        return JSONResponse(app.openapi())

    def custom_openapi():
        if app.openapi_schema:
            return app.openapi_schema
        from fastapi.openapi.utils import get_openapi

        schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )
        schema["servers"] = [{"url": settings.PUBLIC_API_URL, "description": "Current environment"}]
        schema.setdefault("components", {}).setdefault("securitySchemes", {})["bearerAuth"] = {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }
        schema["security"] = [{"bearerAuth": []}]
        public_paths = {"/health", "/health/ready", "/api/v1/auth/login", "/api/v1/auth/register"}
        for path, methods in schema.get("paths", {}).items():
            if path in public_paths:
                for method in methods.values():
                    if isinstance(method, dict):
                        method["security"] = []
        app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = custom_openapi
    return app


app = create_app()
