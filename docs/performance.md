# Performance

Performance is treated as a product feature. Long-running extraction never runs inside an HTTP request or freezes the workspace.

## Frontend

- Client components are used only where polling, uploads, or review actions need the browser.
- Question lists are **server-paginated** (default 30). Search is **debounced** (250 ms) so typing does not fire a request per keystroke.
- Document search is likewise debounced. Processing status polls every 2s only while jobs are in flight, otherwise 8s.
- The inspector loads **only the source page(s)** for the selected question, not the whole PDF.
- Page previews are fetched as authenticated blobs and revoked on unmount.
- Skeletons distinguish loading from empty. `prefers-reduced-motion` disables decorative animation.
- Lists use stable keys (`id`). Navigation stays enabled while a document processes.

## API

- FastAPI handlers validate, authorize, enqueue, and read models. They do not OCR.
- List endpoints return DTOs with pagination: `items`, `page`, `limit`, `total`, `totalPages`.
- Document list payloads omit questions, options, and binaries.
- SQLAlchemy uses connection pooling (`pool_size=10`). Ownership filters hit indexed `ownerId` columns.
- Uploads are rejected before storage when type, size, or magic bytes fail.

## Database

Prisma migrations define indexes on:

- `Document(ownerId, status, createdAt)`
- `Question(documentId, processingVersion, overallConfidence, questionNumber)`
- `ReviewItem(status, severity, documentId)`

Unbounded `SELECT *` of all questions for a tenant is not part of the product API.

## Async processing

Workers consume Redis jobs concurrently (`WORKER_CONCURRENCY`). Pages are extracted incrementally. OCR runs only when selectable text is missing. Reprocess increments `processingVersion` so a stale job is dropped.

## Caching

Stable reads (dashboard, question lists) come from PostgreSQL, not a fake cache. Rapidly changing status is polled from the document row. Correctness is preferred over stale-while-revalidate for extraction state.

## Resource cleanup

Originals live in MinIO. Derived page previews are rewritten per processing version. Cancelled jobs stop at the next stage boundary. Temporary render buffers are not kept as database blobs.

## What is not claimed

No synthetic benchmark numbers are published. The implementation supports low-latency API responses and non-blocking UX; measure locally with representative files in `samples/`.
