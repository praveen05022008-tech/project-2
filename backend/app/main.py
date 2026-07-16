from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from app.database import create_tables, engine
from app.core.deps import get_current_user
from app.audit import AuditMiddleware
from app.observability import (
    RequestTimingMiddleware, register_exception_handlers, init_sentry, logger,
)
from app.routes import (
    dashboard, events, vendors, settings, ai_chat,
    operations, budget, analytics, reports, auth, audit, checkin, orders, users, admin,
    public, feedback, notifications, copilot, me, attendance, portal, directory,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup."""
    logger.info("Starting EventoPro Management API...")
    init_sentry()
    try:
        create_tables()
        logger.info("Database tables created/verified successfully")
    except Exception as e:
        logger.warning(f"Database setup warning: {e}")
    yield


# Create FastAPI application
app = FastAPI(
    title="EventoPro Management API",
    description="Professional Event Management SaaS Platform API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware. Origins are configurable via the ALLOWED_ORIGINS env var
# (comma-separated). A wildcard is intentionally NOT combined with credentials,
# which is invalid per the CORS spec and rejected by browsers.
_origins_env = os.getenv("ALLOWED_ORIGINS", "").strip()
if _origins_env:
    # Normalize: strip whitespace AND any trailing slash. A browser's Origin
    # header never has a trailing slash, and CORS matching is an exact compare —
    # so "https://site.com/" would silently fail to match "https://site.com".
    allowed_origins = [o.strip().rstrip("/") for o in _origins_env.split(",") if o.strip()]
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
# Request timing + structured logging.
app.add_middleware(RequestTimingMiddleware)
# Global error handler (clean JSON + server-side trace, feeds Sentry if enabled).
register_exception_handlers(app)

# Public routers (no authentication required).
app.include_router(auth.router)
app.include_router(public.router)   # browse events + guest ticket checkout

# Protected routers — every endpoint requires a valid authenticated user.
# Fine-grained role checks are applied at the individual endpoint level.
protected = [dashboard, events, vendors, settings, ai_chat, operations, budget, analytics, reports,
             audit, checkin, orders, users, admin, feedback, notifications, copilot, me, attendance, portal, directory]
for module in protected:
    app.include_router(module.router, dependencies=[Depends(get_current_user)])


@app.get("/health")
def health_check():
    """Liveness + DB connectivity check."""
    from sqlalchemy import text
    db_ok = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        db_ok = False
        logger.warning(f"Health check DB error: {e}")
    return {"status": "healthy" if db_ok else "degraded", "database": "up" if db_ok else "down"}


# Serve frontend static files
frontend_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "frontend")
if os.path.exists(frontend_path):
    app.mount("/css", StaticFiles(directory=os.path.join(frontend_path, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(frontend_path, "js")), name="js")

    @app.get("/")
    def serve_frontend_index():
        return FileResponse(os.path.join(frontend_path, "index.html"))

    # PWA assets must be served from the site root (scope "/").
    @app.get("/manifest.json")
    def serve_manifest():
        return FileResponse(os.path.join(frontend_path, "manifest.json"), media_type="application/manifest+json")

    @app.get("/sw.js")
    def serve_sw():
        return FileResponse(os.path.join(frontend_path, "sw.js"), media_type="application/javascript")

    @app.get("/icon.svg")
    def serve_icon():
        return FileResponse(os.path.join(frontend_path, "icon.svg"), media_type="image/svg+xml")

    @app.get("/logo.png")
    def serve_logo():
        return FileResponse(os.path.join(frontend_path, "logo.png"), media_type="image/png")

    @app.get("/e/{event_id}")
    def serve_public_event(event_id: int):
        """Shareable public event page (no login)."""
        return FileResponse(os.path.join(frontend_path, "public.html"))
