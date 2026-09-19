export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(code: string, message: string, statusCode = 400, options?: { details?: unknown; retryable?: boolean }) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = options?.details;
    this.retryable = options?.retryable ?? false;
  }
}

export class PermanentProcessingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PermanentProcessingError";
    this.code = code;
  }
}

export class TransientProcessingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TransientProcessingError";
    this.code = code;
  }
}

export function isTransientError(error: unknown): boolean {
  if (error instanceof TransientProcessingError) return true;
  if (error instanceof PermanentProcessingError) return false;
  if (error instanceof AppError) return error.retryable;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("econnrefused") ||
    message.includes("socket hang up") ||
    message.includes("temporarily unavailable") ||
    message.includes("429") ||
    message.includes("503") ||
    message.includes("timeout")
  );
}
