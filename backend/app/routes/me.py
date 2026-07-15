"""The current user's own events (role-aware participation scope)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date

from app.database import get_db
from app.core.deps import get_current_user
from app.core.scoping import scope_query_to_user
from app.models import Event, User
from app.schemas import EventResponse

router = APIRouter(prefix="/api/my-events", tags=["My Events"])


@router.get("", response_model=list[EventResponse])
def my_events(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Events the current user participates in (assigned/booked/sponsoring/ticketed)."""
    q = scope_query_to_user(db.query(Event), current_user, db)
    events = q.order_by(Event.event_date.desc()).all()
    return [EventResponse.model_validate(e) for e in events]


@router.get("/upcoming", response_model=list[EventResponse])
def my_upcoming_events(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Attendee-style upcoming feed. Attendees see all upcoming; others see their own upcoming."""
    today = date.today()
    if current_user.role == "ATTENDEE":
        q = db.query(Event).filter(Event.event_date >= today)
    else:
        q = scope_query_to_user(db.query(Event), current_user, db).filter(Event.event_date >= today)
    return [EventResponse.model_validate(e) for e in q.order_by(Event.event_date).all()]
