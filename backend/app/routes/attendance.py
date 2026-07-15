"""Staff attendance via a per-event QR code.

Flow:
  • Organizer displays the event's attendance QR (ONE QR per event).
  • Assigned staff scan it → marked Present; organizer + event vendors are notified.
  • Suspicious scans (not assigned, or duplicate) are Flagged and need a second
    confirmation from the organizer (double verification).
  • Organizer/vendor can 'request' staff to check in (sends a notification).
"""
import hashlib
import hmac
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.scoping import can_access_event
from app.core.security import SECRET_KEY
from app.models import Event, EventStaff, EventVendor, Vendor, User
from app.routes.notifications import push_notification

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])

organizer_admin = require_roles("SUPER_ADMIN", "ORGANIZER")
staff_only = require_roles("STAFF")


# ─── QR helpers ──────────────────────────────────────────────────────────────
def _sig(event_id: int) -> str:
    return hmac.new(SECRET_KEY.encode(), f"ATT{event_id}".encode(), hashlib.sha256).hexdigest()[:8].upper()


def event_qr_code(event_id: int) -> str:
    return f"ATT-{event_id}-{_sig(event_id)}"


def parse_qr(code: str) -> Optional[int]:
    parts = (code or "").strip().split("-")
    if len(parts) != 3 or parts[0] != "ATT":
        return None
    try:
        eid = int(parts[1])
    except ValueError:
        return None
    return eid if parts[2].upper() == _sig(eid) else None


def _notify_event_stakeholders(db, event, title, message, level="info"):
    """Notify the organizer(s) of the tenant + each vendor booked for the event."""
    push_notification(title=title, message=message, level=level,
                      target_role="ORGANIZER", target_tenant_id=event.tenant_id)
    for ev in db.query(EventVendor).filter(EventVendor.event_id == event.id).all():
        vendor = db.query(Vendor).filter(Vendor.id == ev.vendor_id).first()
        if vendor and vendor.user_id:
            u = db.query(User).filter(User.id == vendor.user_id).first()
            if u:
                push_notification(title=title, message=message, level=level, target_email=u.email)


def _row(es: EventStaff):
    return {
        "id": es.id, "event_id": es.event_id, "staff_email": es.staff_email,
        "role_label": es.role_label, "attendance": es.attendance,
        "checked_at": es.checked_at.isoformat() if es.checked_at else None,
    }


# ─── Endpoints ───────────────────────────────────────────────────────────────
@router.get("/qr/{event_id}")
def get_event_qr(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The attendance QR payload to display for an event (staff scan this)."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not can_access_event(db, current_user, event_id):
        raise HTTPException(status_code=403, detail="This event is outside your access")
    return {"code": event_qr_code(event_id), "event_id": event_id, "event_title": event.title}


class AttendanceScan(BaseModel):
    code: str


@router.post("/scan")
def scan_attendance(req: AttendanceScan, current_user: User = Depends(staff_only), db: Session = Depends(get_db)):
    """A staff member scans the event QR to mark themselves present."""
    event_id = parse_qr(req.code)
    if not event_id:
        raise HTTPException(status_code=400, detail="Invalid or tampered QR code")
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    es = db.query(EventStaff).filter(
        EventStaff.event_id == event_id, EventStaff.staff_email == current_user.email
    ).first()

    # Suspicious: staff scanning an event they aren't assigned to.
    if not es:
        push_notification(title="⚠ Suspicious attendance scan",
                          message=f"{current_user.email} scanned {event.title} but is not assigned. Needs verification.",
                          level="warning", target_role="ORGANIZER", target_tenant_id=event.tenant_id)
        raise HTTPException(status_code=403, detail="You are not assigned to this event — flagged for organizer verification")

    # Suspicious: duplicate check-in → flag for double verification.
    if es.attendance == "Present":
        es.attendance = "Flagged"
        db.commit()
        _notify_event_stakeholders(db, event, "⚠ Duplicate attendance scan",
                                   f"{current_user.email} scanned twice for {event.title}. Please verify.", "warning")
        return {"status": "flagged", "message": "Already checked in — flagged for verification.", "attendance": "Flagged"}

    es.attendance = "Present"
    es.checked_at = datetime.now(timezone.utc)
    db.commit()
    _notify_event_stakeholders(db, event, "Staff checked in ✅",
                               f"{current_user.email} is now present at {event.title}.", "success")
    return {"status": "present", "message": "You're checked in!", "attendance": "Present"}


@router.get("/{event_id}")
def list_attendance(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Staff attendance roster for an event (organizer / vendor / staff with access)."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not can_access_event(db, current_user, event_id):
        raise HTTPException(status_code=403, detail="This event is outside your access")
    rows = db.query(EventStaff).filter(EventStaff.event_id == event_id).all()
    present = sum(1 for r in rows if r.attendance == "Present")
    return {"event_id": event_id, "total": len(rows), "present": present,
            "flagged": sum(1 for r in rows if r.attendance == "Flagged"),
            "staff": [_row(r) for r in rows]}


class SetAttendance(BaseModel):
    attendance: str   # Present | Absent | Pending


@router.post("/{staff_id}/status", dependencies=[Depends(organizer_admin)])
def set_attendance(staff_id: int, data: SetAttendance, db: Session = Depends(get_db)):
    """Organizer accepts/overrides attendance — also resolves a flagged (double-verify) row."""
    es = db.query(EventStaff).filter(EventStaff.id == staff_id).first()
    if not es:
        raise HTTPException(status_code=404, detail="Staff assignment not found")
    status = data.attendance.capitalize()
    if status not in ("Present", "Absent", "Pending"):
        raise HTTPException(status_code=400, detail="Invalid status")
    es.attendance = status
    es.checked_at = datetime.now(timezone.utc) if status == "Present" else es.checked_at
    db.commit()
    event = db.query(Event).filter(Event.id == es.event_id).first()
    if event:
        _notify_event_stakeholders(db, event, f"Staff marked {status}",
                                   f"{es.staff_email} was marked {status} for {event.title}.",
                                   "success" if status == "Present" else "warning")
    return _row(es)


@router.post("/{event_id}/request", dependencies=[Depends(require_roles("SUPER_ADMIN", "ORGANIZER", "VENDOR"))])
def request_attendance(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Organizer/vendor asks assigned staff to check in (sends notifications)."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not can_access_event(db, current_user, event_id):
        raise HTTPException(status_code=403, detail="This event is outside your access")
    staff = db.query(EventStaff).filter(EventStaff.event_id == event_id).all()
    for es in staff:
        push_notification(title="Attendance requested",
                          message=f"Please check in for {event.title}.",
                          level="info", target_email=es.staff_email)
    return {"status": "ok", "requested": len(staff)}
