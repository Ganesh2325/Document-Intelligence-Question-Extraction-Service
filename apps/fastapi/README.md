# Folio FastAPI

This is the HTTP API required by the problem statement. It preserves the existing `/api/v1` contracts so the Next.js workspace does not change.

```bash
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 3001
```

Run from this directory, with the repository `.env` present at the project root.

- Swagger: http://localhost:3001/docs
- OpenAPI: http://localhost:3001/openapi.json
- Health: http://localhost:3001/health
