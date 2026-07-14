from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import os
import json
from collections import defaultdict
from cerebras.cloud.sdk import Cerebras

from app.database import get_db
from app.models import Event, EventVendor, Vendor, Settings

router = APIRouter(prefix="/api/budget", tags=["Budget"])

# Initialize Cerebras (AI narrative is optional — the analysis works without it)
api_key = os.getenv("CEREBRAS_API_KEY", "")
client = Cerebras(api_key=api_key) if api_key else None


def _round(x):
    return round(float(x or 0), 2)


def compute_budget_intelligence(event, vendors_with_cat, tax_rate):
    """Deterministic budget analysis — always works, no AI required."""
    planned = float(event.budget or 0)

    # Vendor costs split by confirmation status
    confirmed = sum(v["price"] for v in vendors_with_cat if v["status"] == "Confirmed")
    pending = sum(v["price"] for v in vendors_with_cat if v["status"] == "Pending")
    # Cancelled vendors are excluded entirely
    committed_vendor = confirmed + pending
    other_expenses = float(event.actual_expenses or 0)

    subtotal = committed_vendor + other_expenses
    tax = subtotal * (float(tax_rate or 0) / 100.0)
    projected = subtotal + tax

    remaining = planned - projected
    utilization = (projected / planned * 100.0) if planned > 0 else 0.0

    attendance = event.expected_attendance or event.attendees_count or 0
    cost_per_attendee = (projected / attendance) if attendance else 0.0

    # Expected revenue / margin (only meaningful if an ROI target is set)
    expected_revenue = planned * float(event.expected_roi or 0) if event.expected_roi else 0.0
    margin = (expected_revenue - projected) if expected_revenue else None

    # Category breakdown for the chart
    by_cat = defaultdict(float)
    for v in vendors_with_cat:
        if v["status"] != "Cancelled":
            by_cat[v["category"] or "Other"] += v["price"]
    breakdown = [{"label": k, "amount": _round(a)} for k, a in sorted(by_cat.items(), key=lambda x: -x[1])]
    if other_expenses:
        breakdown.append({"label": "Other / Misc", "amount": _round(other_expenses)})
    if tax:
        breakdown.append({"label": f"Tax ({_round(tax_rate)}%)", "amount": _round(tax)})

    # Status
    if planned <= 0:
        status = "No Budget Set"
    elif projected > planned:
        status = "Over Budget"
    elif utilization >= 85:
        status = "Warning"
    else:
        status = "On Track"

    # Rule-based risk flags
    risks = []
    if planned > 0 and projected > planned:
        risks.append(f"Projected cost exceeds the planned budget by ₹{_round(projected - planned):,.0f}.")
    elif utilization >= 85 and planned > 0:
        risks.append(f"Budget is {utilization:.0f}% utilized — little headroom remains.")
    if pending > 0 and planned > 0 and pending > 0.20 * planned:
        risks.append(f"₹{_round(pending):,.0f} of vendor cost is still unconfirmed (pending), a large exposure.")
    if margin is not None and margin < 0:
        risks.append(f"Projected spend is above expected revenue (ROI {event.expected_roi}x) — negative margin of ₹{_round(-margin):,.0f}.")
    if not vendors_with_cat and planned > 0:
        risks.append("No vendors assigned yet — projections will change once vendors are booked.")

    # Rule-based recommendations
    recs = []
    if status == "Over Budget":
        recs.append("Reduce scope or renegotiate the highest vendor category below.")
        if pending > 0:
            recs.append("Review pending vendor quotes before confirming to bring costs down.")
    elif status == "Warning":
        recs.append("Track remaining spend closely; keep a 10% contingency untouched.")
    else:
        recs.append(f"You have ₹{_round(remaining):,.0f} of headroom — allocate to contingency or marketing.")
    if breakdown:
        top = breakdown[0]
        recs.append(f"Largest cost driver is '{top['label']}' at ₹{top['amount']:,.0f} — negotiate volume discounts there first.")
    if attendance:
        recs.append(f"Cost per attendee is ₹{_round(cost_per_attendee):,.0f}; benchmark this against ticket/sponsor income.")

    return {
        "status": status,
        "planned_budget": _round(planned),
        "confirmed_vendor_costs": _round(confirmed),
        "pending_vendor_costs": _round(pending),
        "other_expenses": _round(other_expenses),
        "tax": _round(tax),
        "projected_final_cost": _round(projected),
        "remaining": _round(remaining),
        "utilization_pct": _round(utilization),
        "cost_per_attendee": _round(cost_per_attendee),
        "expected_revenue": _round(expected_revenue),
        "margin": (_round(margin) if margin is not None else None),
        "breakdown": breakdown,
        "risk_flags": risks,
        "recommendations": recs,
    }


def _ai_narrative(event, analysis):
    """Ask the LLM for a short human narrative on top of the computed numbers."""
    if not client:
        # Deterministic narrative fallback
        return (
            f"{event.title} is projected to finish at ₹{analysis['projected_final_cost']:,.0f} "
            f"against a ₹{analysis['planned_budget']:,.0f} budget "
            f"({analysis['utilization_pct']:.0f}% utilized) — status: {analysis['status']}."
        )
    try:
        prompt = (
            "You are a concise event budget analyst. In 2-3 sentences, summarize the health of "
            "this event budget for a non-financial reader. Use INR. Data:\n"
            + json.dumps(analysis, indent=2)
        )
        resp = client.chat.completions.create(
            model="gpt-oss-120b",
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content.strip()
    except Exception:
        # Never surface raw errors to the client
        return (
            f"{event.title} is projected at ₹{analysis['projected_final_cost']:,.0f} "
            f"vs a ₹{analysis['planned_budget']:,.0f} budget ({analysis['status']})."
        )


@router.get("/analysis/{event_id}")
def get_budget_analysis(event_id: int, db: Session = Depends(get_db)):
    """Full budget intelligence: deterministic math + optional AI narrative."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Join assignments with vendor categories
    assignments = db.query(EventVendor).filter(EventVendor.event_id == event_id).all()
    vendors_with_cat = []
    for a in assignments:
        vendor = db.query(Vendor).filter(Vendor.id == a.vendor_id).first()
        vendors_with_cat.append({
            "category": vendor.category if vendor else "Other",
            "price": float(a.agreed_price or 0),
            "status": a.status,
        })

    settings = db.query(Settings).first()
    tax_rate = settings.tax_rate if settings else 0.0

    analysis = compute_budget_intelligence(event, vendors_with_cat, tax_rate)
    analysis["analysis"] = _ai_narrative(event, analysis)
    analysis["ai_enabled"] = bool(client)
    return analysis
