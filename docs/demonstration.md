# Demonstration evidence

The scenarios below are the required demonstration set. Sample inputs live in `samples/`. Representative structured outputs live in `samples/extracted/`. The Next.js workspace at http://localhost:3000 is the operator UI; FastAPI at http://localhost:3001 is the integration surface.

Sign in with `recruiter@folio.dev` / `RecruiterDemo123!`.

| # | Scenario | Input | How to show it | Expected evidence |
| --- | --- | --- | --- | --- |
| 1 | Upload a PDF | `samples/01-clean-digital.pdf` | Documents → upload → Process | Document row, storage in MinIO, status moves off `UPLOADED` |
| 2 | Upload an image | `samples/06-image-question.png` | Same upload flow | `image/png` accepted; OCR path used |
| 3 | Scanned / low-quality document | `samples/02-scanned.pdf`, `samples/03-low-quality-scan.pdf` | Document timeline shows OCR | `usedOcr` on pages; possible review items |
| 4 | Multiple questions | Clean digital PDF | Questions list | Five questions with mixed types |
| 5 | Question spanning pages | `samples/04-multipage-question.pdf` | Open Question 14 | `source.pages` includes 1 and 2 |
| 6 | Options | Any MCQ sample | Inspector | Labels A–D with option text |
| 7 | Answer key association | `05-question-paper.pdf` + `05-answer-key.pdf` | Groups: paper + answer key | Answers `MATCHED` where numbers align |
| 8 | Uncertain / low-confidence | `samples/08-ambiguous-answer-key.pdf` | Answers panel | `UNCERTAIN`, `value: null`, review item |
| 9 | Structured question data | Export JSON or `GET .../questions` | Inspector + export | Schema with text, options, answer, pages, confidence |
| 10 | Invalid / unsupported document | `samples/07-unsupported.txt` | Upload | HTTP 400 `UNSUPPORTED_TYPE`; file is not stored as a processable document |

## API walkthrough (Swagger / Postman)

1. `POST /api/v1/auth/login`
2. `POST /api/v1/documents` with multipart file
3. `POST /api/v1/documents/{id}/process` — returns immediately with `QUEUED`
4. Poll `GET /api/v1/documents/{id}/status`
5. `GET /api/v1/documents/{id}/questions`
6. `GET /api/v1/questions/{id}`
7. `GET /api/v1/documents/{id}/answers`
8. `GET /api/v1/documents/{id}/warnings` and `/api/v1/review-items`
9. `POST /api/v1/document-groups` then add paper + key
10. Repeat upload of `07-unsupported.txt` and confirm structured error

## Notes

Extraction is intentionally not a perfect OCR system. The product demonstrates a reliable engineering envelope around imperfect input: validation, async jobs, provenance, confidence, and human review.
