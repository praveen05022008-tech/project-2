"""In-app notifications / announcements."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.database import get_db, SessionLocal
from app.core.deps import get_current_user, require_roles
from app.models import Notification, User

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])
announce_roles = require_roles("SUPER_ADMIN", "ORGANIZER")


class AnnouncementIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    message: Optional[str] = None
    level: str = "info"
    target_role: Optional[str] = None
    target_tenant_id: Optional[int] = None
    target_email: Optional[str] = None


def _n(n: Notification):
    return {
        "id": n.id, "title": n.title, "message": n.message, "level": n.level,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


def push_notification(title, message="", level="info", target_role=None, target_tenant_id=None, target_email=None):
    """Create a notification from anywhere (best-effort, own session)."""
    db = SessionLocal()
    try:
        db.add(Notification(title=title, message=message, level=level, target_role=target_role,
                            target_tenant_id=target_tenant_id, target_email=target_email))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@router.get("")
def list_notifications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Tenant filter needs a concrete comparison (avoid ORM attr edge cases)
    items = db.query(Notification).filter(
        or_(
            and_(Notification.target_role.is_(None),
                 Notification.target_tenant_id.is_(None),
                 Notification.target_email.is_(None)),
            Notification.target_email == current_user.email,
            Notification.target_role == current_user.role,
            (Notification.target_tenant_id == current_user.tenant_id) if current_user.tenant_id is not None else False,
        )
    ).order_by(Notification.created_at.desc()).limit(50).all()
    return [_n(n) for n in items]


@router.post("", status_code=201, dependencies=[Depends(announce_roles)])
def create_announcement(data: AnnouncementIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Organizers can only broadcast within their own tenant.
    tenant_id = data.target_tenant_id
    if current_user.role == "ORGANIZER":
        tenant_id = current_user.tenant_id
    n = Notification(
        title=data.title, message=data.message, level=data.level,
        target_role=data.target_role, target_tenant_id=tenant_id, target_email=data.target_email,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return _n(n)
