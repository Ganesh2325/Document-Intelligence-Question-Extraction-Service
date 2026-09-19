# Processing pipeline

Jobs are enqueued on `document-processing`. Logical stages still map onto dedicated queue names in `ProcessingJob` rows so operators can see OCR vs matching time.

```
validation
preprocessing
ocr
structure
questions
answers
validation_results
persist
```

## Stage notes

1. **Validation** — document exists, version matches, file is non-empty.
2. **Preprocessing** — PDF.js page detection / image treated as one page. Too many pages fail permanently.
3. **OCR** — pages with selectable text skip OCR. Scanned pages and images are preprocessed with sharp and recognized with Tesseract. Page previews are stored; previous version artifacts are deleted.
4. **Structure** — lines clustered by y-position; headings and answer-key sections tagged.
5. **Questions** — numbering, options, types, multi-page merge.
6. **Answers** — same-document key plus `ANSWER_KEY_FOR` related documents. Conflicts → `UNCERTAIN` + `value: null`.
7. **Validation** — review-rule evaluation.
8. **Persist** — transaction deletes the current `processingVersion` snapshot and writes questions, options, answers, warnings, and review items. No duplicates on retry of the same version.

Transient errors (timeouts, 503, connection resets) retry with exponential backoff. Invalid PDFs, empty files, and unreadable scans use `UnrecoverableError`.
