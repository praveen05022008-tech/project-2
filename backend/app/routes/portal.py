"""Phase 3 & 4 cross-role endpoints: vendor availability + suggestions, sponsor
interest, attendee lists, crowd alerts, Q&A, vendor gigs, reviews."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.scoping import can_access_event
from app.models import (
    Event, Vendor, EventVendor, EventSponsor, EventStaff, Ticket, Question, Feedback, User,
)
from app.routes.notifications import push_notification

router = APIRouter(prefix="/api/portal", tags=["Portal"])

organizer_admin = require_roles("SUPER_ADMIN", "ORGANIZER")
vendor_only = require_roles("VENDOR")
sponsor_only = require_roles("SPONSOR")
staff_org = require_roles("SUPER_ADMIN", "ORGANIZER", "STAFF")


# ─── Vendor: availability, my profile, gigs ─────────────────────────────────
def _vendor_dict(v: Vendor):
    return {"id": v.id, "name": v.name, "category": v.category, "rating": v.rating,
            "price_range": v.price_range, "phone": v.phone, "email": v.email,
            "availability": v.availability, "is_active": v.is_active}


@router.get("/my-vendor")
def my_vendor(current_user: User = Depends(vendor_only), db: Session = Depends(get_db)):
    v = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not v:
        raise HTTPException(status_code=404, detail="No vendor profile linked to your account")
    return _vendor_dict(v)


class AvailabilityIn(BaseModel):
    availability: str  # Available | Busy | Inactive


@router.put("/my-vendor/availability")
def set_availability(data: AvailabilityIn, current_user: User = Depends(vendor_only), db: Session = Depends(get_db)):
    v = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not v:
        raise HTTPException(status_code=404, detail="No vendor profile linked to your account")
    status = data.availability.capitalize()
    if status not in ("Available", "Busy", "Inactive"):
        raise HTTPException(status_code=400, detail="Invalid availability")
    v.availability = status
    db.commit()
    # Let organizers know a vendor became available to book.
    if status == "Available":
        push_notification(title="Vendor available to book",
                          message=f"{v.name} ({v.category}) is now available for booking.",
                          level="success", target_role="ORGANIZER")
    return _vendor_dict(v)


@router.get("/my-gigs")
def my_gigs(current_user: User = Depends(vendor_only), db: Session = Depends(get_db)):
    """Vendor's gigs with intake/output profit bullet points."""
    v = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not v:
        return {"gigs": [], "totals": {}}
    rows = db.query(EventVendor).filter(EventVendor.vendor_id == v.id).all()
    gigs, total_income = [], 0.0
    for a in rows:
        ev = db.query(Event).filter(Event.id == a.event_id).first()
        income = a.agreed_price or 0
        total_income += income
        # simple cost model: 60% of contract is cost → 40% margin (illustrative)
        est_cost = round(income * 0.6, 2)
        gigs.append({
            "event": ev.title if ev else "—",
            "event_id": ev.id if ev else None,
            "event_over": bool(ev and (ev.status in ("Completed", "Cancelled"))),
            "date": ev.event_date.isoformat() if ev and ev.event_date else None,
            "role": a.role, "status": a.status,
            "income": income, "est_cost": est_cost, "est_profit": round(income - est_cost, 2),
            "points": [
                f"Contract value ₹{income:,.0f} for {a.role or 'services'}",
                f"Est. cost ₹{est_cost:,.0f} → est. profit ₹{income - est_cost:,.0f}",
                f"Status: {a.status}",
            ],
        })
    return {"gigs": gigs, "totals": {"income": round(total_income, 2),
            "est_profit": round(total_income * 0.4, 2), "gig_count": len(gigs)}}


# ─── Organizer: vendor suggestions + available vendors ──────────────────────
@router.get("/vendors/suggestions", dependencies=[Depends(organizer_admin)])
def vendor_suggestions(category: Optional[str] = None, db: Session = Depends(get_db)):
    """Top vendors ranked by rating (super-suggestions)."""
    q = db.query(Vendor).filter(Vendor.is_active == True)
    if category:
        q = q.filter(Vendor.category == category)
    vendors = q.order_by(Vendor.rating.desc()).limit(20).all()
    return [_vendor_dict(v) for v in vendors]


@router.get("/vendors/available", dependencies=[Depends(organizer_admin)])
def available_vendors(db: Session = Depends(get_db)):
    vendors = db.query(Vendor).filter(Vendor.is_active == True, Vendor.availability == "Available")\
        .order_by(Vendor.rating.desc()).all()
    return [_vendor_dict(v) for v in vendors]


# ─── Organizer: attendee list + crowd alert + sponsors ──────────────────────
@router.get("/events/{event_id}/attendees", dependencies=[Depends(organizer_admin)])
def event_attendees(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not can_access_event(db, current_user, event_id):
        raise HTTPException(status_code=403, detail="Outside your access")
    tickets = db.query(Ticket).filter(Ticket.event_id == event_id).all()
    return [{"code": t.code, "email": t.attendee_email, "name": t.attendee_name,
             "tier": t.tier, "checked_in": t.checked_in} for t in tickets]


class CrowdNotify(BaseModel):
    message: str = Field(..., min_length=1)


@router.post("/events/{event_id}/notify-crowd", dependencies=[Depends(staff_org)])
def notify_crowd(event_id: int, data: CrowdNotify, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not can_access_event(db, current_user, event_id):
        raise HTTPException(status_code=403, detail="Outside your access")
    # Notify staff + vendors of the event.
    for es in db.query(EventStaff).filter(EventStaff.event_id == event_id).all():
        push_notification(title=f"Crowd update · {event.title}", message=data.message, level="warning", target_email=es.staff_email)
    for ev in db.query(EventVendor).filter(EventVendor.event_id == event_id).all():
        vendor = db.query(Vendor).filter(Vendor.id == ev.vendor_id).first()
        if vendor and vendor.user_id:
            u = db.query(User).filter(User.id == vendor.user_id).first()
            if u:
                push_notification(title=f"Crowd update · {event.title}", message=data.message, level="warning", target_email=u.email)
    return {"status": "ok"}


@router.get("/events/{event_id}/sponsors", dependencies=[Depends(organizer_admin)])
def event_sponsors(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not can_access_event(db, current_user, event_id):
        raise HTTPException(status_code=403, detail="Outside your access")
    rows = db.query(EventSponsor).filter(EventSponsor.event_id == event_id).all()
    return [{"id": s.id, "sponsor_email": s.sponsor_email, "company": s.company,
             "contact_phone": s.contact_phone, "amount": s.amount, "status": s.status} for s in rows]


@router.get("/sponsors/interested", dependencies=[Depends(organizer_admin)])
def interested_sponsors(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """All sponsors interested in the organizer's events, with contact numbers."""
    q = db.query(EventSponsor, Event).join(Event, Event.id == EventSponsor.event_id)
    if current_user.role != "SUPER_ADMIN" and current_user.tenant_id is not None:
        q = q.filter(Event.tenant_id == current_user.tenant_id)
    out = []
    for s, e in q.order_by(EventSponsor.created_at.desc()).all():
        out.append({"sponsor_email": s.sponsor_email, "company": s.company, "contact_phone": s.contact_phone,
                    "amount": s.amount, "status": s.status, "event": e.title, "event_id": e.id})
    return out


# ─── Sponsor: express interest ──────────────────────────────────────────────
class SponsorInterest(BaseModel):
    company: Optional[str] = None
    contact_phone: Optional[str] = None
    amount: float = 0.0


@router.post("/events/{event_id}/sponsor-interest")
def sponsor_interest(event_id: int, data: SponsorInterest, current_user: User = Depends(sponsor_only), db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    existing = db.query(EventSponsor).filter(
        EventSponsor.event_id == event_id, EventSponsor.sponsor_email == current_user.email
    ).first()
    if existing:
        existing.company = data.company or existing.company
        existing.contact_phone = data.contact_phone or existing.contact_phone
        existing.amount = data.amount or existing.amount
        existing.status = "Interested"
    else:
        db.add(EventSponsor(event_id=event_id, sponsor_email=current_user.email,
                            company=data.company, contact_phone=data.contact_phone,
                            amount=data.amount, status="Interested"))
    db.commit()
    push_notification(title="New sponsor interest",
                      message=f"{current_user.email} is interested in sponsoring {event.title}.",
                      level="success", target_role="ORGANIZER", target_tenant_id=event.tenant_id)
    return {"status": "ok"}


# ─── Q&A ─────────────────────────────────────────────────────────────────────
class QuestionIn(BaseModel):
    event_id: int
    question: str = Field(..., min_length=1)


class AnswerIn(BaseModel):
    answer: str = Field(..., min_length=1)


@router.post("/qa", status_code=201)
def ask_question(data: QuestionIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == data.event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    q = Question(event_id=data.event_id, asker_email=current_user.email, question=data.question.strip())
    db.add(q)
    db.commit()
    push_notification(title="New question",
                      message=f"Q on {event.title}: {data.question[:80]}",
                      level="info", target_role="ORGANIZER", target_tenant_id=event.tenant_id)
    return {"status": "ok"}


@router.get("/qa/{event_id}")
def list_qa(event_id: int, db: Session = Depends(get_db)):
    rows = db.query(Question).filter(Question.event_id == event_id).order_by(Question.created_at.desc()).all()
    return [{"id": q.id, "asker_email": q.asker_email, "question": q.question,
             "answer": q.answer, "answered_by": q.answered_by,
             "created_at": q.created_at.isoformat() if q.created_at else None} for q in rows]


@router.post("/qa/{qid}/answer", dependencies=[Depends(organizer_admin)])
def answer_question(qid: int, data: AnswerIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(Question).filter(Question.id == qid).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    q.answer = data.answer.strip()
    q.answered_by = current_user.email
    db.commit()
    if q.asker_email:
        push_notification(title="Your question was answered",
                          message=data.answer[:100], level="success", target_email=q.asker_email)
    return {"status": "ok"}


# ─── Reviews (vendor/sponsor can see feedback for events they're part of) ────
@router.get("/events/{event_id}/reviews")
def event_reviews(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not can_access_event(db, current_user, event_id):
        raise HTTPException(status_code=403, detail="Outside your access")
    rows = db.query(Feedback).filter(Feedback.event_id == event_id).all()
    count = len(rows)
    avg = round(sum(r.rating for r in rows) / count, 2) if count else 0.0
    return {"event_id": event_id, "count": count, "average_rating": avg,
            "reviews": [{"rating": r.rating, "comment": r.comment,
                         "at": r.created_at.isoformat() if r.created_at else None}
                        for r in rows if r.comment][-15:][::-1]}
