"""Pytest fixtures: isolated SQLite DB, seeded once, with per-role auth headers.

Environment is set BEFORE importing the app so it never touches the real TiDB
and so AI calls fall back to deterministic logic (no network in tests).
"""
import os

os.environ["DATABASE_URL"] = "sqlite:///./test_eventpro.db"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["CEREBRAS_API_KEY"] = ""  # force deterministic (no AI network calls)

import pytest
from fastapi.testclient import TestClient

# Remove any stale test DB before the run
if os.path.exists("test_eventpro.db"):
    os.remove("test_eventpro.db")

from app.database import create_tables
from app.main import app
import seed_data


@pytest.fixture(scope="session", autouse=True)
def _setup_db():
    create_tables()
    seed_data.seed_data()
    yield
    try:
        seed_data.db.close()
    except Exception:
        pass


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


def _headers(client, role):
    r = client.post("/api/auth/login", json={"email": f"{role}@eventpro.com", "password": "password123"})
    assert r.status_code == 200, f"login failed for {role}: {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def superadmin(client):
    return _headers(client, "superadmin")


@pytest.fixture(scope="session")
def organizer(client):
    return _headers(client, "organizer")


@pytest.fixture(scope="session")
def staff(client):
    return _headers(client, "staff")


@pytest.fixture(scope="session")
def vendor(client):
    return _headers(client, "vendor")


@pytest.fixture(scope="session")
def sponsor(client):
    return _headers(client, "sponsor")


@pytest.fixture(scope="session")
def attendee(client):
    return _headers(client, "attendee")


@pytest.fixture(scope="session")
def organizer2(client):
    r = client.post("/api/auth/login", json={"email": "organizer2@eventpro.com", "password": "password123"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def first_event_id(client, organizer):
    events = client.get("/api/events", headers=organizer).json()
    return events[0]["id"]


@pytest.fixture(scope="session")
def upcoming_event_id(client, organizer):
    events = client.get("/api/events", headers=organizer).json()
    up = [e for e in events if e["status"] == "Upcoming"]
    return (up[0] if up else events[0])["id"]
