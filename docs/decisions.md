# Architecture decision records

## ADR-001 — Asynchronous processing

HTTP handlers must not extract documents. Recruiter demos, 40-page scans, and concurrent uploads would otherwise block the API. BullMQ jobs own the pipeline. The API returns as soon as the document is stored and the job is queued.

## ADR-002 — S3-compatible object storage

Binaries do not belong in PostgreSQL. MinIO gives us a Dockerized S3 API, generated object keys, and a clean replacement path to AWS S3/GCS. The database stores metadata and storage keys only. Internal paths are never sent to the browser; the API streams or signs access after an ownership check.

## ADR-003 — Confidence scoring

A single opaque 0.94 is worse than useless. Folio stores component scores (text, options, answer, source mapping, boundary, numbering) and a documented weighted overall score. See [confidence.md](confidence.md). Low scores create review items instead of being rounded up.

## ADR-004 — Human review

Examination data is used downstream for item banks. Silent mistakes are worse than incomplete extraction. Review items are first-class records with severity, reason, and persisted approve/edit/dismiss actions.

## ADR-005 — Provider abstraction

PDF.js, Tesseract, a heuristic parser, and an optional OpenAI client all implement small interfaces. Environment variables select implementations. The rest of the pipeline stays stable. `AI_PROVIDER=mock` exists for tests and is not a silent production default.

## ADR-006 — PostgreSQL relational model

Questions have options, answers, assets, warnings, and review items. Users own documents. Groups and relationships are explicit. SQL constraints and indexes beat a document store for this shape. Prisma migrations — not `db push` — are used for schema change.

## ADR-007 — Heuristic extraction as the default "AI"

The assignment forbids fake AI. A local, testable parser that actually finds `Question 14` across a page break is more honest than a hardcoded JSON blob labelled "GPT". OpenAI is available behind a flag when a key exists, and it still cannot invent answers.

## ADR-008 — FastAPI as the HTTP API

The problem statement requires FastAPI for the API layer. Folio keeps the Next.js workspace and the Node extraction worker, and exposes the same `/api/v1` contracts from Python so the UI does not change. PostgreSQL remains the source of truth; SQLAlchemy talks to the Prisma-managed schema. Redis remains the async boundary between HTTP and OCR/extraction.

## ADR-009 — FastAPI over Fastify for the HTTP layer

A later quality prompt preferred Fastify. The assignment specification remains the functional source of truth, so FastAPI stays the API. Fastify in `apps/api` is not used by `npm run dev`. The Node worker still owns OCR and extraction.

