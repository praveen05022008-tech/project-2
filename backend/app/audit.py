"""Audit logging: records every state-changing action by any role.

- `record_audit(...)` writes a row directly (used by the auth routes for
  login/logout/register, where there's no bearer token yet).
- `AuditMiddleware` transparently records every mutating API request
  (POST/PUT/PATCH/DELETE), identifying the actor from their JWT.
"""
import re

from jose import jwt, JWTError
from starlette.middleware.base import BaseHTTPMiddleware

from app.database import SessionLocal
from app.models import AuditLog
from app.core.security import SECRET_KEY, ALGORITHM

# Methods that change state and should be audited.
_AUDITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Auth endpoints are audited explicitly inside their routes (they carry no token
# yet / need the request body), so the middleware skips them to avoid duplicates.
_SKIP_PATHS = {"/api/auth/login", "/api/auth/register", "/api/auth/logout"}


def record_audit(db, *, user_email=None, user_role=None, action="",
                 method=None, path=None, status_code=None, ip_address=None, details=None):
    """Persist a single audit entry. Never raises — auditing must not break the app."""
    try:
        entry = AuditLog(
            user_email=user_email, user_role=user_role, action=action,
            method=method, path=path, status_code=status_code,
            ip_address=ip_address, details=details,
        )
        db.add(entry)
        db.commit()
    except Exception as e:  # pragma: no cover
        print(f"[AUDIT WARN] could not write audit log: {e}")
        try:
            db.rollback()
        except Exception:
            pass


def _identify(request):
    """Best-effort: pull the user email/role out of the bearer token."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None, None
    token = auth.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub"), payload.get("role")
    except JWTError:
        return None, None


def describe_action(method, path):
    """Turn an HTTP method + path into a human-readable action label."""
    # /api/<resource>/<id?>/<subresource?>...
    parts = [p for p in path.split("/") if p and p != "api"]
    resource = parts[0] if parts else "resource"
    singular = {
        "events": "event", "vendors": "vendor", "settings": "settings",
        "chat": "AI chat message", "operations": "live operations",
        "budget": "budget", "analytics": "analytics", "reports": "report",
    }.get(resource, resource)

    # Pull a trailing/embedded numeric id if present
    ids = re.findall(r"/(\d+)", path)
    id_txt = f" #{ids[0]}" if ids else ""

    verb = {"POST": "Created", "PUT": "Updated", "PATCH": "Updated", "DELETE": "Deleted"}.get(method, method)

    # Special cases
    if resource == "events" and path.rstrip("/").endswith("vendors") and method == "POST":
        return f"Assigned a vendor to event{id_txt}"
    if resource == "events" and "/vendors/" in path and method == "DELETE":
        return f"Removed a vendor from event{id_txt}"
    if resource == "operations":
        return f"Updated live metrics for event{id_txt}"
    if resource == "settings":
        return "Updated company settings"
    if resource == "chat":
        return "Sent an AI chat message"

    return f"{verb} {singular}{id_txt}"


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)

        try:
            path = request.url.path
            method = request.method.upper()
            if (method in _AUDITED_METHODS
                    and path.startswith("/api/")
                    and path not in _SKIP_PATHS):
                email, role = _identify(request)
                client_ip = request.client.host if request.client else None
                db = SessionLocal()
                try:
                    record_audit(
                        db,
                        user_email=email,
                        user_role=role,
                        action=describe_action(method, path),
                        method=method,
                        path=path,
                        status_code=response.status_code,
                        ip_address=client_ip,
                    )
                finally:
                    db.close()
        except Exception as e:  # pragma: no cover
            print(f"[AUDIT WARN] middleware error: {e}")

        return response
