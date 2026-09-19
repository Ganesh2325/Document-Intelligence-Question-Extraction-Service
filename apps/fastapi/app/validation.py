from __future__ import annotations

from dataclasses import dataclass

ALLOWED_MIME_TYPES = ("application/pdf", "image/jpeg", "image/png")
ALLOWED_EXTENSIONS = (".pdf", ".jpg", ".jpeg", ".png")


@dataclass
class FileValidationResult:
    ok: bool
    code: str | None = None
    message: str | None = None
    detected_mime: str | None = None
    extension: str | None = None


def extname(filename: str) -> str:
    cleaned = filename.replace("\\", "/").split("/")[-1]
    idx = cleaned.rfind(".")
    return cleaned[idx:].lower() if idx >= 0 else ""


def detect_mime_from_magic(buffer: bytes) -> str | None:
    if len(buffer) >= 5 and buffer[:5] == b"%PDF-":
        return "application/pdf"
    if buffer.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if buffer.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    return None


def sanitize_filename(filename: str) -> str:
    base = filename.replace("\\", "/").split("/")[-1]
    cleaned = []
    for char in base:
        if char.isalnum() or char in "._- ()[]":
            cleaned.append(char)
        else:
            cleaned.append("_")
    result = "".join(cleaned)[:180]
    return result or "upload"


def validate_upload(filename: str, size_bytes: int, buffer: bytes, max_bytes: int) -> FileValidationResult:
    if not filename or ".." in filename or "\0" in filename:
        return FileValidationResult(
            ok=False,
            code="INVALID_FILENAME",
            message="Filename is invalid or contains path traversal characters.",
        )
    if size_bytes <= 0:
        return FileValidationResult(ok=False, code="EMPTY_FILE", message="The uploaded file is empty.")
    if size_bytes > max_bytes:
        return FileValidationResult(
            ok=False,
            code="FILE_TOO_LARGE",
            message=f"File exceeds the maximum size of {round(max_bytes / (1024 * 1024))} MB.",
        )
    extension = extname(filename)
    if extension not in ALLOWED_EXTENSIONS:
        return FileValidationResult(
            ok=False,
            code="UNSUPPORTED_TYPE",
            message="Only PDF, JPG, JPEG, and PNG files are accepted.",
            extension=extension,
        )
    detected = detect_mime_from_magic(buffer)
    if not detected:
        return FileValidationResult(
            ok=False,
            code="CONTENT_MISMATCH",
            message="File contents do not match a supported PDF or image format.",
        )
    expected = {
        ".pdf": ["application/pdf"],
        ".png": ["image/png"],
        ".jpg": ["image/jpeg"],
        ".jpeg": ["image/jpeg"],
    }
    if detected not in expected.get(extension, []):
        return FileValidationResult(
            ok=False,
            code="CONTENT_MISMATCH",
            message=f"File extension {extension} does not match detected content type {detected}.",
            detected_mime=detected,
            extension=extension,
        )
    return FileValidationResult(ok=True, detected_mime=detected, extension=extension)
