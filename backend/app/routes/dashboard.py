from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import date, datetime, timezone
from typing import Optional, List

from app.database import get_db
from app.core.deps import get_current_user
from app.models import Event, Vendor, EventVendor, User, CheckIn, Order
from app.routes.checkin import live_aggregates


def _ticket_revenue(db):
    return float(db.query(func.coalesce(func.sum(Order.total_amount), 0.0))
                 .filter(Order.status == "PAID").scalar() or 0)
from app.schemas import DashboardResponse, DashboardStats, StatusBreakdown, EventResponse

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardResponse)
def get_dashboard_stats(db: Session = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    """Get dashboard statistics (scoped to the caller's tenant for organizer/staff)."""
    today = date.today()
    current_month = today.month
    current_year = today.year

    # Tenant scope: organizers/staff only see their own tenant's events.
    tid = current_user.tenant_id if current_user.role in ("ORGANIZER", "STAFF") else None

    def ev(*conditions):
        q = db.query(func.count(Event.id))
        if tid is not None:
            q = q.filter(Event.tenant_id == tid)
        for c in conditions:
            q = q.filter(c)
        return q.scalar() or 0

    todays_events = ev(Event.event_date == today)
    upcoming_events = ev(Event.status == "Upcoming", Event.event_date >= today)
    total_events_this_month = ev(
        extract("month", Event.event_date) == current_month,
        extract("year", Event.event_date) == current_year,
    )
    completed_events = ev(Event.status == "Completed")
    cancelled_events = ev(Event.status == "Cancelled")

    # Active vendors (shared marketplace — not tenant-scoped)
    active_vendors = db.query(func.count(Vendor.id)).filter(Vendor.is_active == True).scalar() or 0

    rev_q = db.query(func.sum(Event.budget))
    total_q = db.query(func.count(Event.id))
    recent_q = db.query(Event)
    status_q = db.query(Event.status, func.count(Event.id).label("count"))
    if tid is not None:
        rev_q = rev_q.filter(Event.tenant_id == tid)
        total_q = total_q.filter(Event.tenant_id == tid)
        recent_q = recent_q.filter(Event.tenant_id == tid)
        status_q = status_q.filter(Event.tenant_id == tid)

    total_revenue = rev_q.scalar() or 0.0
    total_events = total_q.scalar() or 0
    recent_events = recent_q.order_by(Event.created_at.desc()).limit(5).all()
    status_counts = status_q.group_by(Event.status).all()

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


# ─── Role-scoped, personalized dashboard ────────────────────────────────────────

def _card(label, value, hint="", icon="insights", accent="var(--accent-primary)"):
    return {"label": label, "value": value, "hint": hint, "icon": icon, "accent": accent}


def _fmt_inr(amount):
    """Compact INR formatting (₹1.2L / ₹3.4Cr) for display values."""
    amount = float(amount or 0)
    if amount >= 1_00_00_000:
        return f"₹{amount / 1_00_00_000:.2f} Cr"
    if amount >= 1_00_000:
        return f"₹{amount / 1_00_000:.2f} L"
    if amount >= 1_000:
        return f"₹{amount / 1_000:.1f} K"
    return f"₹{amount:.0f}"


@router.get("/role-view")
def role_view(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return a dashboard payload computed from real data, tailored to the
    caller's role (and personalized to the user where applicable)."""
    role = current_user.role
    today = date.today()

    if role == "SUPER_ADMIN":
        return _super_admin_view(db, today)
    if role == "STAFF":
        return _staff_view(db, today)
    if role == "VENDOR":
        return _vendor_view(db, current_user, today)
    if role == "SPONSOR":
        return _sponsor_view(db)
    if role == "ATTENDEE":
        return _attendee_view(db, today)
    # ORGANIZER (and any fallback) use the full operational dashboard elsewhere.
    return _organizer_view(db, today)


def _super_admin_view(db, today):
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_events = db.query(func.count(Event.id)).scalar() or 0
    active_vendors = db.query(func.count(Vendor.id)).filter(Vendor.is_active == True).scalar() or 0
    total_revenue = db.query(func.sum(Event.budget)).scalar() or 0.0

    recent_users = db.query(User).order_by(User.created_at.desc()).limit(6).all()
    rows = [[u.email, u.role, "Active" if u.is_active else "Disabled"] for u in recent_users]

    return {
        "role": "SUPER_ADMIN",
        "heading": "Super Admin · Platform Overview",
        "subheading": "Live metrics across every account and event.",
        "cards": [
            _card("Total Accounts", str(total_users), "Registered users", "group", "var(--accent-primary)"),
            _card("Events Managed", str(total_events), "Across all tenants", "event", "var(--accent-tertiary)"),
            _card("Active Vendors", str(active_vendors), "In marketplace", "store", "#43e97b"),
            _card("Budget Tracked", _fmt_inr(total_revenue), "Total event budgets", "payments", "#f5a623"),
            _card("Ticket Sales", _fmt_inr(_ticket_revenue(db)), "Paid ticket revenue", "confirmation_number", "#4facfe"),
        ],
        "list": {
            "title": "Recent Account Signups",
            "columns": ["Email", "Role", "Status"],
            "rows": rows,
        },
    }


def _staff_view(db, today):
    upcoming = db.query(func.count(Event.id)).filter(
        Event.status == "Upcoming", Event.event_date >= today
    ).scalar() or 0
    pending_vendors = db.query(func.count(EventVendor.id)).filter(
        EventVendor.status == "Pending"
    ).scalar() or 0

    # Live crowd density comes from real check-ins on the most active event
    # (in progress, else the soonest upcoming).
    active = (db.query(Event).filter(Event.status == "In Progress").order_by(Event.event_date).first()
              or db.query(Event).filter(Event.event_date >= today).order_by(Event.event_date).first())
    agg = live_aggregates(db, active.id) if active else None

    live_entries = agg["total_entries"] if agg else 0
    busiest = agg["busiest_zone"] if agg else None
    busiest_label = f"{busiest['zone']} ({busiest['count']})" if busiest else "—"

    focus = db.query(Event).filter(Event.event_date >= today).order_by(Event.event_date).limit(6).all()
    rows = [[e.title, e.event_date.strftime("%d %b %Y"), e.venue or "—", e.status] for e in focus]

    # Crowd alert driven by the real busiest-zone count.
    note = None
    if active and busiest and busiest["count"] >= 15:
        note = {
            "title": "Crowd Density Alert",
            "icon": "warning",
            "accent": "#f5576c",
            "text": f"High footfall at {busiest['zone']} ({busiest['count']} check-ins) for "
                    f"{active.title}. Consider redirecting arrivals to a quieter zone.",
        }
    elif active:
        note = {
            "title": "Live Monitoring",
            "icon": "sensors",
            "accent": "var(--accent-primary)",
            "text": f"Monitoring {active.title}: {live_entries} entries so far across "
                    f"{len(agg['zones']) if agg else 0} zone(s). {pending_vendors} vendor confirmation(s) pending.",
        }

    return {
        "role": "STAFF",
        "heading": "Staff Command View",
        "subheading": "Live operations and assignments that need attention.",
        "cards": [
            _card("Upcoming Events", str(upcoming), "Scheduled ahead", "upcoming", "var(--accent-primary)"),
            _card("Live Entries", str(live_entries), active.title if active else "No active event", "login", "#f5a623"),
            _card("Busiest Zone", busiest_label, "Highest footfall", "groups", "#f5576c"),
            _card("Pending Confirmations", str(pending_vendors), "Vendors to confirm", "pending", "#43e97b"),
        ],
        "list": {
            "title": "Upcoming Events",
            "columns": ["Event", "Date", "Venue", "Status"],
            "rows": rows,
        },
        "note": note,
    }


def _vendor_view(db, current_user, today):
    vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not vendor:
        return {
            "role": "VENDOR",
            "heading": "Vendor Portal",
            "subheading": "No vendor profile is linked to your account yet.",
            "cards": [
                _card("Active Gigs", "0", "Nothing assigned", "work", "var(--accent-primary)"),
                _card("Contracted Value", _fmt_inr(0), "", "payments", "#43e97b"),
                _card("Rating", "—", "No reviews yet", "star", "#f5a623"),
                _card("Confirmed", "0", "", "task_alt", "var(--accent-tertiary)"),
            ],
            "list": {"title": "Your Assignments", "columns": ["Event", "Date", "Role", "Value", "Status"], "rows": []},
            "note": {
                "title": "Get set up",
                "icon": "info",
                "accent": "var(--accent-primary)",
                "text": "Ask an organizer to link a vendor profile to your account to see live gigs here.",
            },
        }

    assignments = db.query(EventVendor).filter(EventVendor.vendor_id == vendor.id).all()
    total_value = sum(a.agreed_price or 0 for a in assignments)
    confirmed = sum(1 for a in assignments if a.status == "Confirmed")

    rows = []
    active_gigs = 0
    for a in assignments:
        ev = db.query(Event).filter(Event.id == a.event_id).first()
        if not ev:
            continue
        if ev.event_date >= today and ev.status in ("Upcoming", "In Progress"):
            active_gigs += 1
        rows.append([
            ev.title,
            ev.event_date.strftime("%d %b %Y"),
            a.role or "—",
            _fmt_inr(a.agreed_price),
            a.status,
        ])

    return {
        "role": "VENDOR",
        "heading": f"Vendor Portal · {vendor.name}",
        "subheading": "Your gigs, contracted value and performance.",
        "cards": [
            _card("Active Gigs", str(active_gigs), "Upcoming / in progress", "work", "var(--accent-primary)"),
            _card("Contracted Value", _fmt_inr(total_value), "Across all events", "payments", "#43e97b"),
            _card("Rating", f"{vendor.rating:.1f} / 5", vendor.category, "star", "#f5a623"),
            _card("Confirmed", f"{confirmed}/{len(assignments)}", "Assignments confirmed", "task_alt", "var(--accent-tertiary)"),
        ],
        "list": {
            "title": "Your Assignments",
            "columns": ["Event", "Date", "Role", "Value", "Status"],
            "rows": rows,
        },
    }


def _sponsor_view(db):
    events = db.query(Event).all()
    total_marketing = sum(e.marketing_budget or 0 for e in events)
    sponsored = [e for e in events if (e.marketing_budget or 0) > 0]
    roi_values = [e.expected_roi for e in sponsored if e.expected_roi]
    avg_roi = (sum(roi_values) / len(roi_values)) if roi_values else 0

    # Real booth engagement from check-ins (BOOTH scans + lead opt-ins).
    booth_scans = db.query(func.count(CheckIn.id)).filter(CheckIn.scan_type == "BOOTH").scalar() or 0
    leads = db.query(func.count(CheckIn.id)).filter(
        CheckIn.scan_type == "BOOTH", CheckIn.lead_captured == True
    ).scalar() or 0
    conversion = (leads / booth_scans * 100) if booth_scans else 0

    top = sorted(sponsored, key=lambda e: (e.expected_roi or 0), reverse=True)[:6]
    rows = [[
        e.title,
        _fmt_inr(e.marketing_budget),
        f"{(e.expected_roi or 0):.1f}x",
        f"{(e.expected_attendance or 0):,}",
    ] for e in top]

    return {
        "role": "SPONSOR",
        "heading": "Sponsor ROI Dashboard",
        "subheading": "Live booth engagement and investment performance.",
        "cards": [
            _card("Booth Scans", str(booth_scans), "Live QR scans at booths", "qr_code_scanner", "var(--accent-primary)"),
            _card("Leads Captured", str(leads), f"{conversion:.0f}% scan-to-lead", "contacts", "#43e97b"),
            _card("Marketing Spend", _fmt_inr(total_marketing), "Total committed", "payments", "#f5a623"),
            _card("Avg Expected ROI", f"{avg_roi:.1f}x", "Across sponsored events", "trending_up", "var(--accent-tertiary)"),
        ],
        "list": {
            "title": "Top Events by ROI",
            "columns": ["Event", "Marketing", "Expected ROI", "Reach"],
            "rows": rows,
        },
    }


def _attendee_view(db, today):
    upcoming = db.query(Event).filter(Event.event_date >= today).order_by(Event.event_date).all()
    upcoming_count = len(upcoming)
    nxt = upcoming[0] if upcoming else None

    rows = [[e.title, e.event_date.strftime("%d %b %Y"), e.venue or "—", e.event_type] for e in upcoming[:6]]

    note = None
    if nxt:
        note = {
            "title": "AI Concierge",
            "icon": "smart_toy",
            "accent": "var(--accent-tertiary)",
            "text": f"Your next event is \"{nxt.title}\" on {nxt.event_date.strftime('%d %b %Y')} "
                    f"at {nxt.venue or 'a venue to be announced'}. Tap Events to see the full schedule.",
        }

    return {
        "role": "ATTENDEE",
        "heading": "Attendee Experience",
        "subheading": "Your upcoming events and personalized concierge.",
        "cards": [
            _card("Upcoming Events", str(upcoming_count), "You can attend", "event", "var(--accent-primary)"),
            _card("Next Event", nxt.title if nxt else "—", nxt.event_date.strftime("%d %b %Y") if nxt else "Nothing scheduled", "star", "var(--accent-tertiary)"),
            _card("Venue", (nxt.venue if nxt and nxt.venue else "TBD"), "Next event location", "place", "#43e97b"),
            _card("Event Type", nxt.event_type if nxt else "—", "Category", "category", "#f5a623"),
        ],
        "list": {
            "title": "Upcoming Events",
            "columns": ["Event", "Date", "Venue", "Type"],
            "rows": rows,
        },
        "note": note,
    }


def _organizer_view(db, today):
    total_events = db.query(func.count(Event.id)).scalar() or 0
    upcoming = db.query(func.count(Event.id)).filter(
        Event.status == "Upcoming", Event.event_date >= today
    ).scalar() or 0
    active_vendors = db.query(func.count(Vendor.id)).filter(Vendor.is_active == True).scalar() or 0
    revenue = db.query(func.sum(Event.budget)).scalar() or 0.0
    return {
        "role": "ORGANIZER",
        "heading": "Organizer Dashboard",
        "subheading": "Your events at a glance.",
        "cards": [
            _card("Total Events", str(total_events), "", "event", "var(--accent-primary)"),
            _card("Upcoming", str(upcoming), "", "event_upcoming", "var(--accent-tertiary)"),
            _card("Active Vendors", str(active_vendors), "", "store", "#43e97b"),
            _card("Budget", _fmt_inr(revenue), "", "payments", "#f5a623"),
            _card("Ticket Sales", _fmt_inr(_ticket_revenue(db)), "Paid ticket revenue", "confirmation_number", "#4facfe"),
        ],
        "list": {"title": "", "columns": [], "rows": []},
    }
