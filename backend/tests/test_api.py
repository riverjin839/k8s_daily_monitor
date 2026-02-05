import os
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["DATABASE_URL"] = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/k8s_monitor_test"
)
os.environ["REDIS_URL"] = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

from app.main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


def test_root_endpoint(client):
    """Test the root endpoint returns app info."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "name" in data
    assert "version" in data
    assert "status" in data
    assert data["status"] == "running"


def test_health_endpoint(client):
    """Test the health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


def test_liveness_endpoint(client):
    """Test the Kubernetes liveness probe endpoint."""
    response = client.get("/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "alive"


def test_readiness_endpoint(client):
    """Test the Kubernetes readiness probe endpoint."""
    response = client.get("/health/ready")
    assert response.status_code == 200
    data = response.json()
    # May be "ready" or "not_ready" depending on DB connection
    assert "status" in data


def test_docs_endpoint(client):
    """Test that API docs are accessible."""
    response = client.get("/docs")
    assert response.status_code == 200


def test_openapi_schema(client):
    """Test that OpenAPI schema is accessible."""
    response = client.get("/openapi.json")
    assert response.status_code == 200
    data = response.json()
    assert "openapi" in data
    assert "info" in data
    assert "paths" in data
