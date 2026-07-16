"""Discovery directories that power the collapsible dashboard side-panels:

 - Organizers browse **Available Sponsors** (sponsor profiles that are available /
   open to offers, plus any sponsor already interested in the organizer's events).
 - Sponsors browse **Active Organisers** (organizers running upcoming / in-progress
   events), with a one-click collaboration request.

Both endpoints accept a `q` search term + simple filters and are safe to poll, so
the front-end refreshes automatically whenever availability changes.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models import Event, EventSponsor, SponsorProfile, User, Tenant
from app.routes.notifications import push_notification

router = APIRouter(prefix="/api/directory", tags=["Directory"])

organizer_admin = require_roles("SUPER_ADMIN", "ORGANIZER")
sponsor_only = require_roles("SPONSOR")

ACTIVE_STATUSES = ("Upcoming", "In Progress")
AVAILABILITY_OPEN = ("Available", "Open to offers")
VALID_AVAILABILITY = ("Available", "Open to offers", "Not Available")


def _display_name(email: str) -> str:
    local = (email or "").split("@")[0]
    words = local.replace(".", " ").replace("_", " ").replace("-", " ").split()
    return " ".join(w.capitalize() for w in words) or (email or "Unknown")


def _sponsor_dict(p: SponsorProfile, interested: bool = False):
    return {
        "email": p.user_email,
        "company_name": p.company_name or _display_name(p.user_email),
        "logo_url": p.logo_url,
        "category": p.category or "General",
        "budget": p.budget or 0.0,
        "location": p.location or "—",
        "availability": p.availability or "Available",
        "description": p.description,
        "contact_phone": p.contact_phone,
        "interested": interested,
    }


# ─── Organizer view: Available Sponsors ─────────────────────────────────────
@router.get("/sponsors", dependencies=[Depends(organizer_admin)])
def available_sponsors(
    q: Optional[str] = None,
    category: Optional[str] = None,
    availability: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Sponsors already interested in this organizer's events (tenant-scoped).
    isq = db.query(EventSponsor.sponsor_email).join(Event, Event.id == EventSponsor.event_id)
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id is not None:
        isq = isq.filter(Event.tenant_id == current_user.tenant_id)
    interested_emails = {e for (e,) in isq.all()}

    query = db.query(SponsorProfile)
    if category:
        query = query.filter(SponsorProfile.category == category)
    if availability:
        query = query.filter(SponsorProfile.availability == availability)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            SponsorProfile.company_name.ilike(like),
            SponsorProfile.category.ilike(like),
            SponsorProfile.location.ilike(like),
        ))

    out = []
    for p in query.all():
        is_int = p.user_email in interested_emails
        # "available OR interested"
        if (p.availability in AVAILABILITY_OPEN) or is_int:
            out.append(_sponsor_dict(p, is_int))

    order = {"Available": 0, "Open to offers": 1, "Not Available": 2}
    out.sort(key=lambda s: (not s["interested"], order.get(s["availability"], 3), -s["budget"]))
    return out


@router.get("/sponsors/{email}", dependencies=[Depends(organizer_admin)])
def sponsor_detail(email: str, db: Session = Depends(get_db)):
    p = db.query(SponsorProfile).filter(SponsorProfile.user_email == email).first()
    if not p:
        raise HTTPException(status_code=404, detail="Sponsor not found")
    return _sponsor_dict(p)


class SponsorshipRequest(BaseModel):
    event_id: Optional[int] = None
    message: Optional[str] = None


@router.post("/sponsors/{email}/request", dependencies=[Depends(organizer_admin)])
def request_sponsorship(email: str, data: SponsorshipRequest,
                        current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(SponsorProfile).filter(SponsorProfile.user_email == email).first()
    if not p:
        raise HTTPException(status_code=404, detail="Sponsor not found")
    ev = db.query(Event).filter(Event.id == data.event_id).first() if data.event_id else None
    ev_title = ev.title if ev else "an upcoming event"
    who = _display_name(current_user.email)
    msg = (data.message or "").strip() or f"{who} would like you to sponsor {ev_title}."
    push_notification(title="Sponsorship request", message=msg, level="info", target_email=email)
    return {"status": "ok"}


# ─── Sponsor view: Active Organisers ────────────────────────────────────────
@router.get("/organisers", dependencies=[Depends(sponsor_only)])
def active_organisers(
    q: Optional[str] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Event).filter(Event.status.in_(ACTIVE_STATUSES))
    if status:
        query = query.filter(Event.status == status)
    if category:
        query = query.filter(Event.event_type == category)
    events = query.order_by(Event.event_date.asc()).all()

    tenants = {t.id: t.name for t in db.query(Tenant).all()}
    term = q.strip().lower() if (q and q.strip()) else None
    out = []
    for e in events:
        org = db.query(User).filter(User.id == e.organizer_id).first() if e.organizer_id else None
        org_email = (org.email if org else e.client_email) or ""
        org_name = _display_name(org_email) if org_email else (e.client_name or "Organizer")
        organisation = tenants.get(e.tenant_id) or (e.client_name or "Independent")
        row = {
            "organiser_email": org_email,
            "organiser_name": org_name,
            "organisation": organisation,
            "event_id": e.id,
            "event_name": e.title,
            "event_category": e.event_type,
            "event_date": e.event_date.isoformat() if e.event_date else None,
            "location": e.venue or "TBA",
            "event_status": e.status,
        }
        if term:
            hay = " ".join([org_name, organisation, e.title, e.event_type or "", e.venue or ""]).lower()
            if term not in hay:
                continue
        out.append(row)
    return out


class CollabRequest(BaseModel):
    message: Optional[str] = None
    amount: float = 0.0


@router.post("/organisers/{event_id}/collaborate", dependencies=[Depends(sponsor_only)])
def request_collaboration(event_id: int, data: CollabRequest,
                          current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    prof = db.query(SponsorProfile).filter(SponsorProfile.user_email == current_user.email).first()
    company = prof.company_name if prof else None

    existing = db.query(EventSponsor).filter(
        EventSponsor.event_id == event_id, EventSponsor.sponsor_email == current_user.email
    ).first()
    if existing:
        existing.status = "Interested"
        if data.amount:
            existing.amount = data.amount
        if company and not existing.company:
            existing.company = company
    else:
        db.add(EventSponsor(event_id=event_id, sponsor_email=current_user.email,
                            company=company, contact_phone=(prof.contact_phone if prof else None),
                            amount=data.amount or 0.0, status="Interested"))
    db.commit()
    msg = (data.message or "").strip() or f"{company or current_user.email} wants to collaborate on {event.title}."
    push_notification(title="Collaboration request", message=msg, level="success",
                      target_role="ORGANIZER", target_tenant_id=event.tenant_id)
    return {"status": "ok"}


# ─── Sponsor self-service profile (drives availability) ─────────────────────
class ProfileIn(BaseModel):
    company_name: Optional[str] = None
    logo_url: Optional[str] = None
    category: Optional[str] = None
    budget: Optional[float] = None
    location: Optional[str] = None
    availability: Optional[str] = None
    description: Optional[str] = None
    contact_phone: Optional[str] = None


@router.get("/my-profile", dependencies=[Depends(sponsor_only)])
def my_profile(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(SponsorProfile).filter(SponsorProfile.user_email == current_user.email).first()
    if not p:
        p = SponsorProfile(user_email=current_user.email, availability="Available",
                           company_name=_display_name(current_user.email))
        db.add(p)
        db.commit()
        db.refresh(p)
    return _sponsor_dict(p)


@router.put("/my-profile", dependencies=[Depends(sponsor_only)])
def update_my_profile(data: ProfileIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(SponsorProfile).filter(SponsorProfile.user_email == current_user.email).first()
    if not p:
        p = SponsorProfile(user_email=current_user.email)
        db.add(p)
    prev = p.availability
    for field in ("company_name", "logo_url", "category", "location", "description", "contact_phone"):
        v = getattr(data, field)
        if v is not None:
            setattr(p, field, v)
    if data.budget is not None:
        p.budget = data.budget
    if data.availability is not None:
        if data.availability not in VALID_AVAILABILITY:
            raise HTTPException(status_code=400, detail="Invalid availability")
        p.availability = data.availability
    db.commit()
    db.refresh(p)
    # Let organizers know when a sponsor opens up for business.
    if data.availability and data.availability != prev and p.availability in AVAILABILITY_OPEN:
        push_notification(title="Sponsor available",
                          message=f"{p.company_name or current_user.email} is now {p.availability} for sponsorships.",
                          level="success", target_role="ORGANIZER")
    return _sponsor_dict(p)
