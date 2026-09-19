# Efficiency

Sustainability here means not wasting CPU, memory, network, storage, or paid model calls.

## CPU and memory

- Digital PDFs use selectable text first. OCR is skipped when text is already present.
- Pages are processed in a controlled loop rather than loading a giant in-memory parse of every page at once.
- Page previews render one page at a time.
- The browser never downloads an entire question bank for a list view.

## Network

- Debounced search.
- Paginated lists.
- Status polling slows down when nothing is in flight.
- Export is on-demand, not on every page load.

## OCR and AI

Preferred hierarchy:

1. Deterministic parser on native text
2. OCR only for scans/images
3. Optional LLM (`AI_PROVIDER=openai`) only when configured

The default path does **not** send every page to a paid model. Intermediate page text is reused for question and answer stages in the same job.

## Storage

Binaries stay in MinIO. PostgreSQL stores metadata and structured questions. Derived previews are overwritten on reprocess instead of accumulating unbounded versions in the operator API. Unsupported files are rejected before object storage.

## Database

Dashboard and list queries use counts and indexed filters. Question inspector loads one question with options, not the whole document.

## Browser

Heavy preview work is isolated to the inspector. Reduced-motion users skip shimmer/pulse. Client JS is limited to interactive routes (upload, poll, review).
