from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List
from datetime import date

from app.database import get_db
from app.core.deps import require_roles, get_current_user, scope_events_to_tenant, assert_event_manageable
from app import models
from app.models import Event, EventVendor, Vendor
from app.schemas import (
    EventCreate, EventUpdate, EventResponse,
    EventVendorCreate, EventVendorUpdate, EventVendorResponse
)

router = APIRouter(prefix="/api/events", tags=["Events"])

# Roles allowed to create/modify events and vendor assignments.
manage_events = require_roles("SUPER_ADMIN", "ORGANIZER", "STAFF")


# ─── Event CRUD ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[EventResponse])
def list_events(
    status: Optional[str] = None,
    event_type: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List events (scoped to the caller's tenant for organizer/staff)."""
    query = scope_events_to_tenant(db.query(Event), current_user)

    if status:
        query = query.filter(Event.status == status)
    if event_type:
        query = query.filter(Event.event_type == event_type)
    if search:
        query = query.filter(
            or_(
                Event.title.ilike(f"%{search}%"),
                Event.client_name.ilike(f"%{search}%"),
                Event.venue.ilike(f"%{search}%"),
            )
        )
    if date_from:
        query = query.filter(Event.event_date >= date_from)
    if date_to:
        query = query.filter(Event.event_date <= date_to)

    events = query.order_by(Event.event_date.desc()).offset(skip).limit(limit).all()
    return [EventResponse.model_validate(e) for e in events]


@router.get("/{event_id}", response_model=EventResponse)
def get_event(event_id: int, db: Session = Depends(get_db)):
    """Get a single event by ID."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return EventResponse.model_validate(event)


@router.post("", response_model=EventResponse, status_code=201)
def create_event(event_data: EventCreate, db: Session = Depends(get_db),
                 current_user: models.User = Depends(manage_events)):
    """Create a new event (assigned to the creator's tenant)."""
    event = Event(**event_data.model_dump())
    # Scope the event to the organizer/staff's tenant.
    if current_user.role != "SUPER_ADMIN":
        event.tenant_id = current_user.tenant_id
    db.add(event)
    db.commit()
    db.refresh(event)
    return EventResponse.model_validate(event)


@router.put("/{event_id}", response_model=EventResponse)
def update_event(event_id: int, event_data: EventUpdate, db: Session = Depends(get_db),
                 current_user: models.User = Depends(manage_events)):
    """Update an existing event."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    assert_event_manageable(current_user, event)

    update_data = event_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(event, key, value)

    db.commit()
    db.refresh(event)
    return EventResponse.model_validate(event)


@router.delete("/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db),
                 current_user: models.User = Depends(manage_events)):
    """Delete an event."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    assert_event_manageable(current_user, event)

    db.delete(event)
    db.commit()
    return {"message": "Event deleted successfully", "id": event_id}


# ─── Event-Vendor Assignments ──────────────────────────────────────────────────

@router.get("/{event_id}/vendors", response_model=List[EventVendorResponse])
def get_event_vendors(event_id: int, db: Session = Depends(get_db)):
    """Get all vendors assigned to an event."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    assignments = db.query(EventVendor).filter(
        EventVendor.event_id == event_id
    ).all()

    result = []
    for a in assignments:
        vendor = db.query(Vendor).filter(Vendor.id == a.vendor_id).first()
        resp = EventVendorResponse(
            id=a.id,
            event_id=a.event_id,
            vendor_id=a.vendor_id,
            role=a.role,
            agreed_price=a.agreed_price,
            status=a.status,
            vendor_name=vendor.name if vendor else None,
            vendor_category=vendor.category if vendor else None,
            created_at=a.created_at,
        )
        result.append(resp)
    return result


@router.post("/{event_id}/vendors", response_model=EventVendorResponse, status_code=201)
def assign_vendor_to_event(
    event_id: int,
    data: EventVendorCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(manage_events),
):
    """Assign a vendor to an event."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    assert_event_manageable(current_user, event)

    vendor = db.query(Vendor).filter(Vendor.id == data.vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    # Check if already assigned
    existing = db.query(EventVendor).filter(
        EventVendor.event_id == event_id,
        EventVendor.vendor_id == data.vendor_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Vendor already assigned to this event")

    assignment = EventVendor(
        event_id=event_id,
        vendor_id=data.vendor_id,
        role=data.role,
        agreed_price=data.agreed_price,
        status=data.status,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    return EventVendorResponse(
        id=assignment.id,
        event_id=assignment.event_id,
        vendor_id=assignment.vendor_id,
        role=assignment.role,
        agreed_price=assignment.agreed_price,
        status=assignment.status,
        vendor_name=vendor.name,
        vendor_category=vendor.category,
        created_at=assignment.created_at,
    )


@router.delete("/{event_id}/vendors/{assignment_id}")
def remove_vendor_from_event(
    event_id: int,
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(manage_events),
):
    """Remove a vendor assignment from an event."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if event:
        assert_event_manageable(current_user, event)
    assignment = db.query(EventVendor).filter(
        EventVendor.id == assignment_id,
        EventVendor.event_id == event_id,
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    db.delete(assignment)
    db.commit()
    return {"message": "Vendor removed from event", "id": assignment_id}
