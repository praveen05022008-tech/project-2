"""Check-in / scan subsystem.

Powers three real, data-backed features:
  • Attendee FastPass QR ticket  (issue + validate)
  • Staff live crowd density      (ENTRY scans grouped by zone)
  • Sponsor booth engagement      (BOOTH scans + lead opt-ins)

Scans are recorded via /scan (used by a manual "Record Check-in" control in the
UI, standing in for a physical scanner) so every number is a real DB row.
"""
import secrets
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models import Ticket, CheckIn, Event, User
from app.integrations import fire_webhook

router = APIRouter(prefix="/api/checkin", tags=["Check-In"])

# Staff/organizer/admin may record scans.
scanner_roles = require_roles("SUPER_ADMIN", "ORGANIZER", "STAFF")


def _gen_code(db: Session) -> str:
    for _ in range(10):
        code = "FP-" + secrets.token_hex(4).upper()
        if not db.query(Ticket).filter(Ticket.code == code).first():
            return code
    return "FP-" + secrets.token_hex(6).upper()


def _get_or_create_ticket(db: Session, event_id: int, email: str, name: Optional[str] = None) -> Ticket:
    ticket = db.query(Ticket).filter(
        Ticket.event_id == event_id, Ticket.attendee_email == email
    ).first()
    if ticket:
        return ticket
    ticket = Ticket(code=_gen_code(db), event_id=event_id, attendee_email=email, attendee_name=name)
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


def live_aggregates(db: Session, event_id: int) -> dict:
    """Compute live crowd + engagement metrics for an event from check-ins."""
    scans = db.query(CheckIn).filter(CheckIn.event_id == event_id).all()

    by_zone = defaultdict(int)
    entries = 0
    booth = 0
    leads = 0
    attendees = set()
    for s in scans:
        if s.scan_type == "ENTRY":
            entries += 1
            by_zone[s.zone or "Entrance"] += 1
            if s.attendee_email:
                attendees.add(s.attendee_email)
        elif s.scan_type == "BOOTH":
            booth += 1
            if s.lead_captured:
                leads += 1
        elif s.scan_type == "SESSION":
            by_zone[s.zone or "Session"] += 1

    issued = db.query(Ticket).filter(Ticket.event_id == event_id).count()
    checked = db.query(Ticket).filter(Ticket.event_id == event_id, Ticket.checked_in == True).count()

    zones = [{"zone": z, "count": c} for z, c in sorted(by_zone.items(), key=lambda x: -x[1])]
    busiest = zones[0] if zones else None

    return {
        "event_id": event_id,
        "total_entries": entries,
        "unique_attendees": len(attendees),
        "tickets_issued": issued,
        "tickets_checked_in": checked,
        "booth_scans": booth,
        "leads_captured": leads,
        "zones": zones,
        "busiest_zone": busiest,
    }


class ScanRequest(BaseModel):
    event_id: int
    scan_type: str = "ENTRY"          # ENTRY | BOOTH | SESSION
    ticket_code: Optional[str] = None
    attendee_email: Optional[str] = None
    zone: Optional[str] = None
    sponsor_email: Optional[str] = None
    lead_captured: bool = False


@router.get("/my-ticket/{event_id}")
def my_ticket(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return (creating if needed) the current user's FastPass ticket for an event."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    ticket = _get_or_create_ticket(db, event_id, current_user.email)
    return {
        "code": ticket.code,
        "event_id": event_id,
        "event_title": event.title,
        "event_date": event.event_date.isoformat() if event.event_date else None,
        "venue": event.venue,
        "attendee_email": ticket.attendee_email,
        "checked_in": ticket.checked_in,
    }


@router.post("/scan", dependencies=[Depends(scanner_roles)])
def record_scan(req: ScanRequest, db: Session = Depends(get_db)):
    """Record a scan/check-in. Validates a ticket code when supplied."""
    event = db.query(Event).filter(Event.id == req.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    scan_type = req.scan_type.upper()
    if scan_type not in ("ENTRY", "BOOTH", "SESSION"):
        raise HTTPException(status_code=400, detail="Invalid scan_type")

    attendee_email = req.attendee_email
    ticket_valid = None
    if req.ticket_code:
        ticket = db.query(Ticket).filter(
            Ticket.code == req.ticket_code.strip(), Ticket.event_id == req.event_id
        ).first()
        if not ticket:
            raise HTTPException(status_code=404, detail="Invalid ticket for this event")
        ticket.checked_in = True
        attendee_email = attendee_email or ticket.attendee_email
        ticket_valid = True

    scan = CheckIn(
        event_id=req.event_id,
        ticket_code=req.ticket_code,
        attendee_email=attendee_email,
        scan_type=scan_type,
        zone=req.zone,
        sponsor_email=req.sponsor_email,
        lead_captured=req.lead_captured,
    )
    db.add(scan)
    db.commit()

    # A captured sponsor lead is a CRM-worthy event.
    if scan_type == "BOOTH" and req.lead_captured:
        fire_webhook("lead.captured", {
            "event_id": req.event_id, "sponsor_email": req.sponsor_email,
            "attendee_email": attendee_email, "zone": req.zone,
        })

    return {"status": "ok", "ticket_valid": ticket_valid, "live": live_aggregates(db, req.event_id)}


@router.get("/live/{event_id}")
def get_live(event_id: int, db: Session = Depends(get_db)):
    """Live crowd + engagement aggregates for an event (any authenticated user)."""
    if not db.query(Event).filter(Event.id == event_id).first():
        raise HTTPException(status_code=404, detail="Event not found")
    return live_aggregates(db, event_id)
