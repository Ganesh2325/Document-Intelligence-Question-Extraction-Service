export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"] as const;

export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

export interface FileValidationInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
  maxBytes: number;
}

export interface FileValidationResult {
  ok: boolean;
  code?: string;
  message?: string;
  detectedMime?: AllowedMime;
  extension?: (typeof ALLOWED_EXTENSIONS)[number];
}

function extname(filename: string): string {
  const cleaned = filename.replace(/\\/g, "/").split("/").pop() ?? filename;
  const idx = cleaned.lastIndexOf(".");
  return idx >= 0 ? cleaned.slice(idx).toLowerCase() : "";
}

function hasMagic(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((b, i) => buffer[i] === b);
}

export function detectMimeFromMagic(buffer: Buffer): AllowedMime | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (hasMagic(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (hasMagic(buffer, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  return null;
}

export function sanitizeFilename(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "upload";
  return base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180) || "upload";
}

export function validateUpload(input: FileValidationInput): FileValidationResult {
  if (!input.filename || input.filename.includes("..") || input.filename.includes("\0")) {
    return {
      ok: false,
      code: "INVALID_FILENAME",
      message: "Filename is invalid or contains path traversal characters.",
    };
  }

  if (input.sizeBytes <= 0) {
    return { ok: false, code: "EMPTY_FILE", message: "The uploaded file is empty." };
  }

  if (input.sizeBytes > input.maxBytes) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `File exceeds the maximum size of ${Math.round(input.maxBytes / (1024 * 1024))} MB.`,
    };
  }

  const extension = extname(input.filename);
  if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) {
    return {
      ok: false,
      code: "UNSUPPORTED_TYPE",
      message: "Only PDF, JPG, JPEG, and PNG files are accepted.",
      extension: extension as FileValidationResult["extension"],
    };
  }

  const detected = detectMimeFromMagic(input.buffer);
  if (!detected) {
    return {
      ok: false,
      code: "CONTENT_MISMATCH",
      message: "File contents do not match a supported PDF or image format.",
    };
  }

  const expectedByExt: Record<string, AllowedMime[]> = {
    ".pdf": ["application/pdf"],
    ".png": ["image/png"],
    ".jpg": ["image/jpeg"],
    ".jpeg": ["image/jpeg"],
  };

  if (!expectedByExt[extension]?.includes(detected)) {
    return {
      ok: false,
      code: "CONTENT_MISMATCH",
      message: `File extension ${extension} does not match detected content type ${detected}.`,
      detectedMime: detected,
      extension: extension as FileValidationResult["extension"],
    };
  }

  return { ok: true, detectedMime: detected, extension: extension as FileValidationResult["extension"] };
}
