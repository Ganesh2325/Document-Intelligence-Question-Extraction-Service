# Reliability

## Retries

Transient failures (storage timeouts, Redis blips, OCR network errors) are retried with exponential backoff on the queue. Permanent failures (empty file, unsupported type, corrupt PDF, cancellation) are not retried endlessly.

Retry count is stored on the document.

## Idempotency

Jobs carry `{ documentId, processingVersion }`. A worker that sees a stale version exits. Persistence for a version happens in a transaction: questions, options, answers, warnings, and review items are written together. Reprocess replaces the current version rather than duplicating rows for the operator-facing APIs (reads filter `processingVersion`).

## Failure isolation

- One bad document marks **that** document `FAILED`. The API and other jobs continue.
- Worker exceptions are caught per job.
- Invalid uploads never enter the queue.
- Redis enqueue failure returns `QUEUE_UNAVAILABLE` without deleting the stored object.

## Health

- `GET /health` — process liveness
- `GET /health/ready` — PostgreSQL, Redis, MinIO

Compose services use health checks. The API starts even if MinIO is slow; readiness then reports storage error.

## Graceful degradation

If a page cannot be rasterized, page-level provenance is still stored. If an answer key conflicts, the answer stays `UNCERTAIN` with `value: null`. Partial extraction can finish as `PARTIALLY_COMPLETED` / `REVIEW_REQUIRED` instead of discarding the document.

## Cancellation

`POST /api/v1/documents/{id}/cancel` sets `CANCELLED`. The worker checks that status at every stage (`markStage`). Already-persisted metadata is left in place; later stages do not run.

## Worker recovery

If the worker process dies, Redis still holds the job (BullMQ path) or `folio:document-jobs` list. Restarting the worker resumes consumption. Persist is version-scoped.

## External providers

OCR and optional OpenAI sit behind interfaces. Timeouts and schema validation apply. Malformed provider JSON is not written to PostgreSQL. Default `AI_PROVIDER=heuristic` is deterministic and labelled as such.
