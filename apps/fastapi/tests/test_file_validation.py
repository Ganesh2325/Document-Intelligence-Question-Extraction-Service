from app.validation import detect_mime_from_magic, sanitize_filename, validate_upload


def test_rejects_unsupported_extension():
    result = validate_upload("notes.txt", 12, b"not a pdf", 1_000_000)
    assert result.ok is False
    assert result.code == "UNSUPPORTED_TYPE"


def test_rejects_empty_file():
    result = validate_upload("paper.pdf", 0, b"", 1_000_000)
    assert result.code == "EMPTY_FILE"


def test_rejects_extension_content_mismatch():
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
    result = validate_upload("paper.pdf", len(png), png, 1_000_000)
    assert result.code == "CONTENT_MISMATCH"


def test_accepts_pdf_magic_bytes():
    pdf = b"%PDF-1.7\n1 0 obj\n"
    result = validate_upload("exam.pdf", len(pdf), pdf, 1_000_000)
    assert result.ok is True
    assert result.detected_mime == "application/pdf"


def test_accepts_jpeg_and_png():
    jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 20
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    assert validate_upload("scan.jpg", len(jpeg), jpeg, 1_000_000).ok
    assert validate_upload("diagram.png", len(png), png, 1_000_000).ok


def test_detects_magic_and_sanitizes_paths():
    assert detect_mime_from_magic(b"%PDF-1.4") == "application/pdf"
    assert sanitize_filename("C:\\\\uploads\\\\exam (final).pdf") == "exam (final).pdf"
