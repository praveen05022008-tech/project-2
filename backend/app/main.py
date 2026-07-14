from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from app.database import create_tables
from app.routes import dashboard, events, vendors, settings, ai_chat, operations, budget, analytics, reports, auth

# Create FastAPI application
app = FastAPI(
    title="EventPro Management API",
    description="Professional Event Management SaaS Platform API",
    version="1.0.0",
)

# CORS middleware - allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(dashboard.router)
app.include_router(events.router)
app.include_router(vendors.router)
app.include_router(settings.router)
app.include_router(ai_chat.router)
app.include_router(operations.router)
app.include_router(budget.router)
app.include_router(analytics.router)
app.include_router(reports.router)
app.include_router(auth.router)


@app.on_event("startup")
def on_startup():
    """Create database tables on startup."""
    print("[*] Starting EventPro Management API...")
    try:
        create_tables()
        print("[OK] Database tables created/verified successfully")
    except Exception as e:
        print(f"[WARN] Database setup warning: {e}")



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
