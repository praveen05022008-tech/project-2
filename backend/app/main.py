from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from app.database import create_tables
from app.core.deps import get_current_user
from app.audit import AuditMiddleware
from app.routes import (
    dashboard, events, vendors, settings, ai_chat,
    operations, budget, analytics, reports, auth, audit,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup."""
    print("[*] Starting EventPro Management API...")
    try:
        create_tables()
        print("[OK] Database tables created/verified successfully")
    except Exception as e:
        print(f"[WARN] Database setup warning: {e}")
    yield


# Create FastAPI application
app = FastAPI(
    title="EventPro Management API",
    description="Professional Event Management SaaS Platform API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware. Origins are configurable via the ALLOWED_ORIGINS env var
# (comma-separated). A wildcard is intentionally NOT combined with credentials,
# which is invalid per the CORS spec and rejected by browsers.
_origins_env = os.getenv("ALLOWED_ORIGINS", "").strip()
if _origins_env:
    allowed_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]
    allow_credentials = True
else:
    # Sensible local-development defaults.
    allowed_origins = [
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
    ]
    allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Audit trail — records every state-changing API request.
app.add_middleware(AuditMiddleware)

# Public routers (no authentication required).
app.include_router(auth.router)

# Protected routers — every endpoint requires a valid authenticated user.
# Fine-grained role checks are applied at the individual endpoint level.
protected = [dashboard, events, vendors, settings, ai_chat, operations, budget, analytics, reports, audit]
for module in protected:
    app.include_router(module.router, dependencies=[Depends(get_current_user)])


@app.get("/health")
def health_check():
    return {"status": "healthy"}


# Serve frontend static files
frontend_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "frontend")
if os.path.exists(frontend_path):
    app.mount("/css", StaticFiles(directory=os.path.join(frontend_path, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(frontend_path, "js")), name="js")

    @app.get("/")
    def serve_frontend_index():
        return FileResponse(os.path.join(frontend_path, "index.html"))
