"""Observability: structured logging, request timing, a global error handler,
and optional Sentry error monitoring (enabled only when SENTRY_DSN is set)."""
import logging
import os
import time

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s | %(message)s",
)
logger = logging.getLogger("eventpro")


def init_sentry():
    """Initialize Sentry only if SENTRY_DSN is configured and the SDK is present."""
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        logger.info("Sentry disabled (no SENTRY_DSN).")
        return
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=dsn,
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            environment=os.getenv("ENVIRONMENT", "production"),
        )
        logger.info("Sentry error monitoring enabled.")
    except Exception as e:  # pragma: no cover
        logger.warning(f"Sentry not initialized: {e}")


class RequestTimingMiddleware(BaseHTTPMiddleware):
    """Log every request with method, path, status and latency (ms)."""

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            elapsed = (time.perf_counter() - start) * 1000
            logger.exception(f"{request.method} {request.url.path} -> 500 in {elapsed:.0f}ms")
            raise
        elapsed = (time.perf_counter() - start) * 1000
        response.headers["X-Response-Time-ms"] = f"{elapsed:.0f}"
        level = logging.WARNING if response.status_code >= 500 else logging.INFO
        logger.log(level, f"{request.method} {request.url.path} -> {response.status_code} in {elapsed:.0f}ms")
        return response


def register_exception_handlers(app):
    """Catch unhandled exceptions: log full trace server-side, return clean JSON."""
    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        logger.exception(f"Unhandled error on {request.method} {request.url.path}: {exc}")
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
