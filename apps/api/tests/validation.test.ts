import { describe, expect, it } from "vitest";
import { AppError } from "@folio/shared";
import { validateUpload } from "@folio/shared";

describe("API error contract", () => {
  it("uses structured application errors", () => {
    const error = new AppError("DOCUMENT_NOT_FOUND", "Document was not found.", 404);
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("DOCUMENT_NOT_FOUND");
  });
});

describe("upload rejection", () => {
  it("rejects an unsupported file before storage", () => {
    const buffer = Buffer.from("this is not a pdf");
    const result = validateUpload({
      filename: "paper.txt",
      mimeType: "text/plain",
      sizeBytes: buffer.length,
      buffer,
      maxBytes: 1_000_000,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("UNSUPPORTED_TYPE");
  });
});
