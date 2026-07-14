from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.core.deps import require_roles
from app.models import AuditLog

router = APIRouter(prefix="/api/audit-logs", tags=["Audit"])

# Only Super Admin may read the audit trail.
super_admin_only = require_roles("SUPER_ADMIN")


@router.get("", dependencies=[Depends(super_admin_only)])
def list_audit_logs(
    role: Optional[str] = None,
    user_email: Optional[str] = None,
    method: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Return recent audit entries (newest first), with optional filters."""
    query = db.query(AuditLog)
    if role:
        query = query.filter(AuditLog.user_role == role)
    if user_email:
        query = query.filter(AuditLog.user_email.ilike(f"%{user_email}%"))
    if method:
        query = query.filter(AuditLog.method == method.upper())
    if search:
        query = query.filter(AuditLog.action.ilike(f"%{search}%"))

    total = query.count()
    rows = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()

    return {
        "total": total,
        "count": len(rows),
        "logs": [
            {
                "id": r.id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "user_email": r.user_email,
                "user_role": r.user_role,
                "action": r.action,
                "method": r.method,
                "path": r.path,
                "status_code": r.status_code,
                "ip_address": r.ip_address,
            }
            for r in rows
        ],
    }


@router.get("/summary", dependencies=[Depends(super_admin_only)])
def audit_summary(db: Session = Depends(get_db)):
    """High-level counts for the audit dashboard header."""
    total = db.query(func.count(AuditLog.id)).scalar() or 0
    by_role = dict(
        db.query(AuditLog.user_role, func.count(AuditLog.id)).group_by(AuditLog.user_role).all()
    )
    by_method = dict(
        db.query(AuditLog.method, func.count(AuditLog.id)).group_by(AuditLog.method).all()
    )
    return {"total": total, "by_role": by_role, "by_method": by_method}
