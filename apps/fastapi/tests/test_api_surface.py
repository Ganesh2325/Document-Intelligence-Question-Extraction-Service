from fastapi.testclient import TestClient

from app.main import app


def test_health_liveness():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "folio-api"


def test_protected_route_requires_auth():
    client = TestClient(app)
    response = client.get("/api/v1/documents")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_openapi_and_docs_are_published():
    client = TestClient(app)
    docs = client.get("/docs")
    openapi = client.get("/openapi.json")
    alias = client.get("/docs/json")
    assert docs.status_code == 200
    assert openapi.status_code == 200
    assert alias.status_code == 200
    schema = openapi.json()
    assert schema["info"]["title"].startswith("Folio")
    paths = schema["paths"]
    for required in (
        "/api/v1/documents",
        "/api/v1/documents/{document_id}/status",
        "/api/v1/documents/{document_id}/questions",
        "/api/v1/questions/{question_id}",
        "/api/v1/documents/{document_id}/answers",
        "/api/v1/documents/{document_id}/warnings",
        "/api/v1/review-items",
        "/api/v1/document-groups",
    ):
        assert required in paths
