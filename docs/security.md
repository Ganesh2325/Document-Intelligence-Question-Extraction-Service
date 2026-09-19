# Security

## Authentication

- `POST /api/v1/auth/register` and `/login` issue a JWT signed with `JWT_SECRET`
- Passwords are hashed with bcrypt (cost 12 in register, 10 in seed)
- `/api/v1/auth/me` and every data route require a valid bearer token
- Auth routes are rate-limited via Redis

## Authorization

Ownership is enforced in the API, never in the UI.

- Documents: `findFirst({ id, ownerId })`
- Questions, answers, review items: joined through `document.ownerId`
- Groups: `ownerId` on the group, and member documents must also belong to the caller

User A cannot read, process, or delete User B's files by guessing UUIDs.

## File validation

Uploads are rejected unless:

- extension is `.pdf`, `.jpg`, `.jpeg`, or `.png`
- size is within `MAX_FILE_SIZE`
- magic bytes match PDF / JPEG / PNG
- the filename does not contain `..` or NUL

The original filename is sanitized for display only. Storage keys are generated UUIDs.

## Storage isolation

Objects are stored per owner prefix. Access URLs are not public bucket listings. Page images and originals are streamed by the API after auth.

## Secret handling

`.env` is gitignored. `.env.example` contains placeholders. JWT secrets, MinIO keys, and `AI_API_KEY` are server-side only. The browser receives `NEXT_PUBLIC_API_URL` and JWTs, never database or bucket credentials. Logs redact authorization headers and secrets.

## Upload restrictions

Multipart limits follow `MAX_FILE_SIZE`. A page cap (`MAX_PAGES`) prevents runaway rasterization.

## Rate limiting

Global 200 req/min per IP, tighter on auth (10/min). Loopback is allow-listed for local demos.

## Error handling

Production responses never include stack traces. Clients get `code`, `message`, and `requestId`.

## Logging

Structured Pino logs include `requestId`, `documentId`, `jobId`, and stage names. Document bodies and secrets are not logged.
