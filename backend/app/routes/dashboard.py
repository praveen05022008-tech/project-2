from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import date, datetime, timezone
from typing import Optional, List

from app.database import get_db
from app.models import Event, Vendor, EventVendor
from app.schemas import DashboardResponse, DashboardStats, StatusBreakdown, EventResponse

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardResponse)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get comprehensive dashboard statistics."""
    today = date.today()
    current_month = today.month
    current_year = today.year

    # Today's events
    todays_events = db.query(func.count(Event.id)).filter(
        Event.event_date == today
    ).scalar() or 0

    # Upcoming events
    upcoming_events = db.query(func.count(Event.id)).filter(
        Event.status == "Upcoming",
        Event.event_date >= today
    ).scalar() or 0

    # Total events this month
    total_events_this_month = db.query(func.count(Event.id)).filter(
        extract("month", Event.event_date) == current_month,
        extract("year", Event.event_date) == current_year
    ).scalar() or 0

    # Completed events
    completed_events = db.query(func.count(Event.id)).filter(
        Event.status == "Completed"
    ).scalar() or 0

    # Cancelled events
    cancelled_events = db.query(func.count(Event.id)).filter(
        Event.status == "Cancelled"
    ).scalar() or 0

    # Active vendors
    active_vendors = db.query(func.count(Vendor.id)).filter(
        Vendor.is_active == True
    ).scalar() or 0

    # Total revenue (sum of all event budgets)
    total_revenue = db.query(func.sum(Event.budget)).scalar() or 0.0

    # Total events
    total_events = db.query(func.count(Event.id)).scalar() or 0

    # Recent events (last 5)
    recent_events = db.query(Event).order_by(
        Event.created_at.desc()
    ).limit(5).all()

    # Status breakdown
    status_counts = db.query(
        Event.status,
        func.count(Event.id).label("count")
    ).group_by(Event.status).all()

    status_breakdown = [
        StatusBreakdown(status=s.status, count=s.count)
        for s in status_counts
    ]

    stats = DashboardStats(
        todays_events=todays_events,
        upcoming_events=upcoming_events,
        total_events_this_month=total_events_this_month,
        completed_events=completed_events,
        cancelled_events=cancelled_events,
        active_vendors=active_vendors,
        total_revenue=total_revenue,
        total_events=total_events,
    )

    return DashboardResponse(
        stats=stats,
        recent_events=[EventResponse.model_validate(e) for e in recent_events],
        status_breakdown=status_breakdown,
    )
