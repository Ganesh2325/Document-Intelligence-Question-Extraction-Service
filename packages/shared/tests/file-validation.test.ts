import { describe, expect, it } from "vitest";
import { detectMimeFromMagic, sanitizeFilename, validateUpload } from "../src/file-validation.js";

function pdfBuffer(): Buffer {
  return Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
}

describe("file validation", () => {
  it("accepts a PDF whose magic bytes and extension match", () => {
    const buffer = pdfBuffer();
    const result = validateUpload({
      filename: "paper.pdf",
      mimeType: "application/pdf",
      sizeBytes: buffer.length,
      buffer,
      maxBytes: 10_000_000,
    });
    expect(result.ok).toBe(true);
    expect(result.detectedMime).toBe("application/pdf");
  });

  it("rejects unsupported extensions", () => {
    const buffer = Buffer.from("hello");
    const result = validateUpload({
      filename: "notes.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: buffer.length,
      buffer,
      maxBytes: 10_000_000,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("UNSUPPORTED_TYPE");
  });

  it("rejects path traversal filenames", () => {
    const buffer = pdfBuffer();
    const result = validateUpload({
      filename: "../secret.pdf",
      mimeType: "application/pdf",
      sizeBytes: buffer.length,
      buffer,
      maxBytes: 10_000_000,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_FILENAME");
  });

  it("rejects files that exceed the size limit", () => {
    const buffer = pdfBuffer();
    const result = validateUpload({
      filename: "paper.pdf",
      mimeType: "application/pdf",
      sizeBytes: 50,
      buffer,
      maxBytes: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("FILE_TOO_LARGE");
  });

  it("detects PNG and JPEG magic bytes", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    expect(detectMimeFromMagic(png)).toBe("image/png");
    expect(detectMimeFromMagic(jpeg)).toBe("image/jpeg");
  });

  it("sanitizes filenames without using them as storage paths", () => {
    expect(sanitizeFilename("C:\\\\uploads\\\\exam (final).pdf")).toBe("exam (final).pdf");
  });
});
