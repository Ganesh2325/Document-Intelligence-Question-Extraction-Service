# Requirements mapping

This document maps the official Document Processing & Question Extraction problem statement onto Folio. The workspace UI (colors, layout, and interaction patterns) is unchanged. The HTTP API is FastAPI on port 3001 with the same `/api/v1` contracts the frontend already consumes.

## 1. Core requirements

| Requirement | Where it lives |
| --- | --- |
| Upload PDF or image | `POST /api/v1/documents` (multipart `file`) |
| Track processing status | `GET /api/v1/documents/{id}/status` and document detail |
| Retrieve extracted questions | `GET /api/v1/documents/{id}/questions`, `GET /api/v1/questions` |
| Retrieve individual question details | `GET /api/v1/questions/{id}` |
| Retrieve associated answers | `GET /api/v1/documents/{id}/answers` plus `answer` on each question |
| Identify unconfident extractions | Question `status`, `confidence`, review items, warnings |
| Access original source/page information | `source.pages`, `source.regions`, `startPage`, `endPage`, page preview images |
| Asynchronous processing | Upload returns immediately; `POST /process` enqueues Redis/BullMQ |

## 2. Document processing

Supported inputs: digitally generated PDFs, scanned PDFs, JPG/JPEG, PNG, multi-page files, mixed layouts.

The pipeline does not assume selectable text or a single template. Native PDF text is used when present; Tesseract OCR is used for scans and images. Worker stages: validate → preprocess → OCR → structure → extract questions → associate answers → score confidence → persist.

## 3. Question extraction

Each persisted question includes number, text, options, type, associated assets, source document, and source page(s). Multi-page questions are reconstructed into one record (`startPage` / `endPage` / `sourcePages`). Numbering styles include `1.`, `1)`, `(1)`, `Q1`, `Question 14`, `Question No. 1`.

## 4. Answer key

Answer keys may appear at the beginning, end, or another page of the same document, or in a related document (`ANSWER_KEY_FOR` relationship / document group role `ANSWER_KEY`). Matching is by question number. Conflicts stay `UNCERTAIN` with `value: null` rather than a guessed letter.

## 5. Imperfect documents

Low-quality scans, OCR noise, missing numbers, split questions, missing keys, and embedded diagrams are first-class cases. They produce partial records, warnings, and review items instead of silent invention.

## 6. Confidence and validation

Overall and component scores are stored: text, options, answer, source mapping, boundary, numbering. Bands:

- successfully extracted
- partially extracted (`PARTIAL`)
- requiring review (`REVIEW_REQUIRED` + review queue)
- unmatched/uncertain answers (`MISSING` / `UNCERTAIN`)

Source pages remain available for a human to verify against the original.

## 7. Structured output

Export is system-independent JSON (and CSV). Shape:

```json
{
  "question": "Which of the following is a vector quantity?",
  "options": ["Mass", "Speed", "Velocity", "Time"],
  "answer": "C",
  "source_pages": [1],
  "confidence": 0.91
}
```

The live API uses a richer but still frontend-agnostic schema (`questionText`, `options[]`, `answer`, `source`, `confidence`). See `samples/extracted/`.

## 8. Multiple documents

Document groups associate a question paper with an answer key. Explicit relationships (`ANSWER_KEY_FOR`, `SOLUTION_FOR`, `RELATED`) are stored independently of the UI.

## 9. Security and file handling

JWT auth, owner-scoped authorization, file-size and type limits, magic-byte validation, generated object keys in MinIO, no public bucket listing, OCR/AI credentials only on the server. `.env` is not committed.

## 10. Technical constraints

| Constraint | Implementation |
| --- | --- |
| FastAPI API layer | `apps/fastapi` |
| PostgreSQL metadata and structured data | Prisma schema + SQLAlchemy read/write against the same tables |
| Redis for async processing | BullMQ `document-processing` queue |
| PDF and image uploads | Validated in FastAPI |
| Asynchronous processing | Worker in `apps/worker` |
| Environment-based configuration | `.env` / pydantic-settings |
| Secrets not in the repository | `.gitignore` + `.env.example` |
| Validation and error handling | Structured `{ error: { code, message, requestId } }` |
| Concurrent documents | Worker concurrency + queue |
| External OCR/AI | Tesseract locally; optional OpenAI behind `AI_PROVIDER` |

## 11. Required API surface

| Capability | Method and path |
| --- | --- |
| Upload | `POST /api/v1/documents` |
| Status | `GET /api/v1/documents/{id}/status` |
| Extracted questions | `GET /api/v1/documents/{id}/questions` |
| Individual question | `GET /api/v1/questions/{id}` |
| Answer-key information | `GET /api/v1/documents/{id}/answers` |
| Warnings / review | `GET /api/v1/documents/{id}/warnings`, `GET /api/v1/review-items` |
| Related documents | `POST/GET /api/v1/document-groups`, `POST /api/v1/documents/{id}/relationships` |

Swagger UI: `/docs`. OpenAPI JSON: `/openapi.json` and `/docs/json`.

## 12–14. Demonstration, deliverables, architecture

See [demonstration.md](demonstration.md), [architecture.md](architecture.md), `samples/`, `postman/`, `prisma/migrations/`, and `apps/fastapi/tests/`.
