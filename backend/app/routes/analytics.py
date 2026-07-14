from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import os
import json
from cerebras.cloud.sdk import Cerebras

from app.database import get_db
from app.models import Event
from app.routes.checkin import live_aggregates

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])

# AI narrative is optional — analytics works without it.
api_key = os.getenv("CEREBRAS_API_KEY", "")
client = Cerebras(api_key=api_key) if api_key else None

# Default fraction of registrations that actually show up (used when we have no
# real turnout signal yet).
DEFAULT_SHOWUP_RATE = 0.75


def _clamp(x, lo, hi):
    return max(lo, min(hi, x))


def compute_analytics(event, checked_in):
    registrations = event.attendees_count or 0
    expected = event.expected_attendance or registrations or 0
    marketing = float(event.marketing_budget or 0)
    status = event.status

    # Predicted final attendance
    if status == "Completed":
        predicted = event.actual_attendance or checked_in or registrations
    elif status == "In Progress":
        # Trust real check-ins; assume a few more arrive
        predicted = max(checked_in, round(registrations * 0.9))
    else:  # Upcoming / other
        predicted = round(registrations * DEFAULT_SHOWUP_RATE) if registrations else expected

    fill_rate = (predicted / expected * 100.0) if expected else 0.0

    # Attendance health
    ratio = (predicted / expected) if expected else 0
    if expected == 0:
        health = "No Target Set"
    elif ratio >= 0.9:
        health = "On Track"
    elif ratio >= 0.6:
        health = "Moderate"
    else:
        health = "Low Registration"

    cost_per_registration = (marketing / registrations) if registrations else 0.0
    cost_per_attendee = (marketing / predicted) if predicted else 0.0

    # Marketing ROI score (0-100): reward high fill + low cost-per-attendee
    fill_component = _clamp(ratio, 0, 1) * 60
    eff_component = (1 - _clamp(cost_per_attendee / 1000.0, 0, 1)) * 40 if cost_per_attendee else 40
    roi_score = round(_clamp(fill_component + eff_component, 0, 100))

    # Funnel
    funnel = [
        {"stage": "Expected", "value": expected},
        {"stage": "Registered", "value": registrations},
        {"stage": "Checked in", "value": checked_in},
    ]

    # Rule-based growth recommendations
    recs = []
    if health == "Low Registration":
        recs.append("Registrations are well below target — boost paid promotion and open referral incentives.")
    elif health == "Moderate":
        recs.append("Push a final reminder campaign and early-bird urgency to close the gap to target.")
    else:
        recs.append("On track — shift spend toward on-site experience and upsells.")
    if cost_per_registration and cost_per_registration > 500:
        recs.append(f"Cost per registration is ₹{cost_per_registration:,.0f}; test cheaper channels (organic/social/referral).")
    if registrations and checked_in and status != "Upcoming":
        show = checked_in / registrations * 100
        recs.append(f"Show-up rate is {show:.0f}% — send day-of reminders / calendar holds to lift turnout.")
    if not marketing:
        recs.append("No marketing budget recorded — allocate spend to make ROI measurable.")

    return {
        "registrations": registrations,
        "expected_attendance": expected,
        "checked_in": checked_in,
        "predicted_final_attendance": int(predicted),
        "attendance_health": health,
        "fill_rate_pct": round(fill_rate, 1),
        "marketing_budget": round(marketing, 2),
        "cost_per_registration": round(cost_per_registration, 2),
        "cost_per_attendee": round(cost_per_attendee, 2),
        "marketing_roi_score": roi_score,
        "funnel": funnel,
        "growth_recommendations": recs,
    }


def _ai_insight(event, a):
    if not client:
        return (
            f"{event.title} is predicted to reach {a['predicted_final_attendance']} attendees "
            f"({a['fill_rate_pct']:.0f}% of target) — status: {a['attendance_health']}. "
            f"Marketing efficiency score: {a['marketing_roi_score']}/100."
        )
    try:
        prompt = (
            "You are an event marketing analyst. In 2-3 sentences, summarize attendance and "
            "marketing performance for a non-technical reader. Use INR. Data:\n"
            + json.dumps(a, indent=2)
        )
        resp = client.chat.completions.create(model="gpt-oss-120b",
                                               messages=[{"role": "user", "content": prompt}])
        return resp.choices[0].message.content.strip()
    except Exception:
        return (
            f"{event.title}: predicted {a['predicted_final_attendance']} attendees "
            f"({a['fill_rate_pct']:.0f}% of target), ROI score {a['marketing_roi_score']}/100."
        )


@router.get("/{event_id}")
def get_analytics(event_id: int, db: Session = Depends(get_db)):
    """Attendance prediction + marketing analysis from real data (AI optional)."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    agg = live_aggregates(db, event_id)
    checked_in = agg["total_entries"]

    a = compute_analytics(event, checked_in)
    a["marketing_insights"] = _ai_insight(event, a)
    a["ai_enabled"] = bool(client)
    return a
