import os
import warnings
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# Fall back to a local SQLite database when DATABASE_URL is not configured so
# the app can be run for local development without a cloud MySQL/TiDB instance.
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./eventpro.db"
    warnings.warn(
        "DATABASE_URL not set — falling back to local SQLite (./eventpro.db). "
        "Set DATABASE_URL to use MySQL/TiDB in production.",
        RuntimeWarning,
    )

# Build engine kwargs based on the backend in use.
engine_kwargs = {"pool_pre_ping": True, "echo": False}

if DATABASE_URL.startswith("sqlite"):
    # SQLite needs this flag for multi-threaded access under uvicorn.
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs.update(
        pool_size=10,
        max_overflow=20,
        pool_recycle=3600,
        connect_args={
            "ssl": {
                "ssl_mode": "VERIFY_IDENTITY",
                "check_hostname": True,
            }
        },
    )

engine = create_engine(DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency that provides a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Create all tables in the database."""
    Base.metadata.create_all(bind=engine)
