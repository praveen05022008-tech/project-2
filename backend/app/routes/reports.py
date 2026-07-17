from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import os
import json
from cerebras.cloud.sdk import Cerebras

from app.database import get_db
from app.core.deps import get_current_user
from app.core.scoping import can_access_event
from app.models import Event, EventVendor, Settings, User
from app.routes.checkin import live_aggregates

router = APIRouter(prefix="/api/reports", tags=["Reports"])

# AI narrative is optional — the report is computed either way.
api_key = os.getenv("CEREBRAS_API_KEY", "")
client = Cerebras(api_key=api_key) if api_key else None


def _pct(part, whole):
    return round(part / whole * 100.0, 1) if whole else 0.0


def compute_report(event, vendors, tax_rate, checked_in, booth_scans, leads):
    vendor_costs = sum(v.agreed_price or 0 for v in vendors if v.status != "Cancelled")
    other = float(event.actual_expenses or 0)
    subtotal = vendor_costs + other
    tax = subtotal * (float(tax_rate or 0) / 100.0)
    total_cost = subtotal + tax

    planned = float(event.budget or 0)
    budget_variance = planned - total_cost
    variance_pct = _pct(budget_variance, planned)

    expected_att = event.expected_attendance or event.attendees_count or 0
    actual_att = event.actual_attendance or checked_in or 0
    attendance_rate = _pct(actual_att, expected_att)

    # Revenue / ROI (expected_roi is a multiple of the planned budget)
    expected_roi = float(event.expected_roi or 0)
    revenue = planned * expected_roi if expected_roi else 0.0
    profit = revenue - total_cost
    event_roi_pct = _pct(profit, total_cost) if total_cost else 0.0

    # Sponsor engagement (real, from check-ins)
    cost_per_lead = (float(event.marketing_budget or 0) / leads) if leads else 0.0
    sponsor_roi_pct = round((expected_roi - 1) * 100, 1) if expected_roi else 0.0

    perf_scores = [v.performance_score for v in vendors if v.performance_score]
    vendor_perf = round(sum(perf_scores) / len(perf_scores), 1) if perf_scores else 0.0

    # Rule-based narrative bullets
    successes, improvements = [], []
    if budget_variance >= 0:
        successes.append(f"Delivered under budget by ₹{budget_variance:,.0f} ({variance_pct:.0f}% of plan).")
    else:
        improvements.append(f"Ran over budget by ₹{-budget_variance:,.0f} ({-variance_pct:.0f}% overrun).")
    if attendance_rate >= 90:
        successes.append(f"Strong turnout — {attendance_rate:.0f}% of expected attendance.")
    elif expected_att:
        improvements.append(f"Turnout was {attendance_rate:.0f}% of target — investigate drop-off.")
    if leads:
        successes.append(f"Generated {leads} sponsor leads from {booth_scans} booth scans.")
    elif booth_scans:
        improvements.append(f"{booth_scans} booth scans but no leads captured — improve opt-in flow.")
    if profit > 0:
        successes.append(f"Positive projected profit of ₹{profit:,.0f} (ROI {event_roi_pct:.0f}%).")
    elif revenue:
        improvements.append("Projected costs exceed expected revenue — revisit pricing or scope.")
    if vendor_perf:
        (successes if vendor_perf >= 4 else improvements).append(f"Average vendor performance: {vendor_perf}/5.")

    fin = (
        f"Total spend ₹{total_cost:,.0f} against a ₹{planned:,.0f} budget "
        f"({'under' if budget_variance >= 0 else 'over'} by ₹{abs(budget_variance):,.0f}). "
        + (f"Expected revenue ₹{revenue:,.0f}, profit ₹{profit:,.0f}." if revenue else "")
    )
    ops = (
        f"{actual_att:,} attendees ({attendance_rate:.0f}% of target) across {len(vendors)} vendor(s). "
        + (f"{booth_scans} booth scans, {leads} leads." if booth_scans else "")
    )

    return {
        "event_title": event.title,
        "status": event.status,
        "planned_budget": round(planned, 2),
        "actual_total_cost": round(total_cost, 2),
        "budget_variance": round(budget_variance, 2),
        "variance_pct": variance_pct,
        "expected_attendance": expected_att,
        "actual_attendance": actual_att,
        "attendance_rate_pct": attendance_rate,
        "expected_revenue": round(revenue, 2),
        "projected_profit": round(profit, 2),
        "event_roi_pct": event_roi_pct,
        "sponsor_roi_percentage": sponsor_roi_pct,
        "booth_scans": booth_scans,
        "leads_captured": leads,
        "cost_per_lead": round(cost_per_lead, 2),
        "vendor_performance_average": vendor_perf,
        "total_vendors": len(vendors),
        "financial_summary": fin,
        "operational_summary": ops,
        "key_successes": successes,
        "areas_for_improvement": improvements,
    }


def _ai_augment(event, r):
    """Add an executive-summary narrative via AI when available."""
    if not client:
        return r["financial_summary"] + " " + r["operational_summary"]
    try:
        prompt = (
            "You are a Chief Analytics Officer. Write a 3-4 sentence executive summary of this "
            "post-event report for stakeholders/sponsors. Use INR. Data:\n" + json.dumps(r, indent=2)
        )
        resp = client.chat.completions.create(model="gpt-oss-120b",
                                               messages=[{"role": "user", "content": prompt}])
        return resp.choices[0].message.content.strip()
    except Exception:
        return r["financial_summary"] + " " + r["operational_summary"]


@router.get("/post-event/{event_id}")
def generate_post_event_report(event_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Post-event business + sponsor-ROI report from real data (AI optional)."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not can_access_event(db, current_user, event_id):
        raise HTTPException(status_code=403, detail="This event is outside your access")

    vendors = db.query(EventVendor).filter(EventVendor.event_id == event_id).all()
    settings = db.query(Settings).first()
    tax_rate = settings.tax_rate if settings else 0.0

    agg = live_aggregates(db, event_id)
    report = compute_report(event, vendors, tax_rate, agg["total_entries"], agg["booth_scans"], agg["leads_captured"])
    report["executive_summary"] = _ai_augment(event, report)
    report["ai_enabled"] = bool(client)
    return report
