"""AI Event Copilot — natural-language assistant that can act.

The LLM classifies the user's message into a structured action; the backend
executes it with the caller's role/tenant scope (create events, answer with real
stats/revenue, or draft marketing copy). Falls back to keyword parsing without a key.
"""
import json
import os
import re
from datetime import date, datetime
from typing import Optional, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func
from cerebras.cloud.sdk import Cerebras

from app.database import get_db
from app.core.deps import require_roles
from app.models import Event, Order, User, CopilotMessage

router = APIRouter(prefix="/api/copilot", tags=["Copilot"])
copilot_roles = require_roles("SUPER_ADMIN", "ORGANIZER", "SPONSOR")

api_key = os.getenv("CEREBRAS_API_KEY", "")
client = Cerebras(api_key=api_key) if api_key else None

SYSTEM = """You are EventoPro Copilot for an event-management platform.
Read the WHOLE conversation and gather details across multiple messages — the user
often provides the event title, client, date, venue, type and budget over several
turns. Remember everything already given; never ask again for something the user
already provided earlier in the conversation.

Reply ONLY with a compact JSON object, no markdown:
{"action": "<action>", "params": {...}, "reply": "<short friendly reply>"}

Valid actions:
- "create_event": params {title, client_name, event_date (YYYY-MM-DD), event_type, venue, budget}.
  As soon as you have title, client_name AND event_date (from anywhere in the
  conversation), use create_event with ALL known params. Only if one of those three
  is still missing, use action "clarify" and ask ONLY for the missing field(s).
- "get_stats": overview of the user's events.
- "get_revenue": ticket revenue so far.
- "draft_marketing": put the marketing copy in "reply".
- "answer": general help/answer in "reply".

Normalize dates to YYYY-MM-DD (e.g. "2026_08-01" -> "2026-08-01"). Do NOT invent
specific numbers in reply — the app appends real figures. Keep reply under 50 words.
Today is %س.""".replace("%س", date.today().isoformat())


SPONSOR_SYSTEM = """You are EventoPro Copilot for SPONSORS — you help brands decide
sponsorships. Read the WHOLE conversation and remember details already given.

Reply ONLY with a compact JSON object, no markdown:
{"action": "<action>", "params": {...}, "reply": "<short friendly reply>"}

Valid actions:
- "sponsor_roi": params {amount (number, rupees), event_title (optional)}. Use when the
  user asks what return / profit / leads / ROI they'd get for a given spend.
- "suggest_amount": params {event_title (optional)}. Use when the user asks how much
  they should sponsor.
- "answer": general help / advice in "reply".

Do NOT invent specific numbers in reply — the app appends the real projection.
Keep reply under 45 words. Today is %س.""".replace("%س", date.today().isoformat())


def _pick_event(db, title=None):
    q = db.query(Event).filter(Event.status.in_(["Upcoming", "In Progress"]))
    if title:
        e = q.filter(Event.title.ilike(f"%{title.strip()}%")).first()
        if e:
            return e
    return q.order_by(Event.expected_attendance.desc(), Event.event_date.asc()).first()


def _sponsor_roi(db, amount, title=None):
    amount = float(amount or 0)
    event = _pick_event(db, title)
    if not event:
        return {"kind": "roi", "error": "No upcoming events to project against yet."}
    attendance = int(event.expected_attendance or event.attendees_count or 500)
    budget = float(event.budget or 0)
    share = (amount / budget) if budget > 0 else 0.5
    rate = min(0.08, max(0.02, 0.02 + 0.06 * min(share, 1.0)))   # 2%–8% lead conversion
    impressions = attendance
    leads = max(0, round(attendance * rate))
    value_per_lead, value_per_impression = 2500, 25   # ₹ business value per lead / brand impression
    est_return = leads * value_per_lead + impressions * value_per_impression
    profit = est_return - amount
    roi_multiple = (est_return / amount) if amount > 0 else 0.0
    cost_per_lead = (amount / leads) if leads > 0 else 0.0
    return {
        "kind": "roi", "event": event.title, "amount": round(amount),
        "impressions": impressions, "leads": leads,
        "cost_per_lead": round(cost_per_lead), "estimated_return": round(est_return),
        "profit": round(profit), "roi_multiple": round(roi_multiple, 2),
    }


def _suggest_amount(db, title=None):
    event = _pick_event(db, title)
    if not event:
        return {"kind": "suggest", "error": "No upcoming events to recommend for yet."}
    attendance = int(event.expected_attendance or event.attendees_count or 500)
    rec = max(50000, round(attendance * 150 / 10000) * 10000)   # ~₹150 / expected attendee
    tiers = [
        {"name": "Bronze", "amount": round(rec * 0.5), "perks": "Logo on website + 2 passes"},
        {"name": "Silver", "amount": rec, "perks": "Exhibit booth + stage logo + 5 passes"},
        {"name": "Gold", "amount": rec * 2, "perks": "Headline branding + keynote mention + 10 passes"},
    ]
    return {"kind": "suggest", "event": event.title, "attendance": attendance,
            "recommended": rec, "tiers": tiers}


def _sponsor_fallback(message):
    m = message.lower()
    nums = re.findall(r"[\d,]+", m.replace("₹", ""))
    amount = None
    for n in nums:
        val = n.replace(",", "")
        if val.isdigit() and int(val) >= 1000:
            amount = int(val)
            break
    if amount:
        return {"action": "sponsor_roi", "params": {"amount": amount}, "reply": f"Here's the projected return on a ₹{amount:,} sponsorship:"}
    if "how much" in m or "suggest" in m or "recommend" in m or "should i" in m:
        return {"action": "suggest_amount", "params": {}, "reply": "Here's a recommended sponsorship for the top upcoming event:"}
    return {"action": "answer", "params": {},
            "reply": "Ask me things like ‘if I sponsor ₹5,00,000 how much profit?’ or ‘how much should I sponsor?’."}


class CopilotMsg(BaseModel):
    role: str
    content: str


class CopilotIn(BaseModel):
    message: str = Field(..., min_length=1)
    history: Optional[List[CopilotMsg]] = None


def _tenant_events_q(db, user):
    q = db.query(Event)
    if user.role != "SUPER_ADMIN" and user.tenant_id is not None:
        q = q.filter(Event.tenant_id == user.tenant_id)
    return q


def _do_stats(db, user):
    q = _tenant_events_q(db, user)
    total = q.count()
    upcoming = q.filter(Event.status == "Upcoming").count()
    completed = q.filter(Event.status == "Completed").count()
    budget = _tenant_events_q(db, user).with_entities(func.coalesce(func.sum(Event.budget), 0.0)).scalar() or 0
    return {"total_events": total, "upcoming": upcoming, "completed": completed, "total_budget": float(budget)}


def _do_revenue(db, user):
    q = db.query(func.coalesce(func.sum(Order.total_amount), 0.0)).filter(Order.status == "PAID")
    if user.role != "SUPER_ADMIN" and user.tenant_id is not None:
        q = q.join(Event, Event.id == Order.event_id).filter(Event.tenant_id == user.tenant_id)
    return {"ticket_revenue": float(q.scalar() or 0)}


def _parse_llm(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if "```" in text[3:] else text.strip("`")
        text = text.replace("json", "", 1).strip()
    try:
        return json.loads(text)
    except Exception:
        return {"action": "answer", "params": {}, "reply": text[:400]}


def _fallback(message):
    m = message.lower()
    if "revenue" in m or "sales" in m:
        return {"action": "get_revenue", "params": {}, "reply": "Here's your ticket revenue:"}
    if "stat" in m or "how many" in m or "overview" in m:
        return {"action": "get_stats", "params": {}, "reply": "Here's your event overview:"}
    return {"action": "answer", "params": {},
            "reply": "AI is not configured (set CEREBRAS_API_KEY). I can still show stats or revenue — try 'show my stats' or 'show revenue'."}


@router.post("")
def copilot(data: CopilotIn, current_user: User = Depends(copilot_roles), db: Session = Depends(get_db)):
    is_sponsor = current_user.role == "SPONSOR"
    system_prompt = SPONSOR_SYSTEM if is_sponsor else SYSTEM
    fallback = _sponsor_fallback if is_sponsor else _fallback

    # Load the user's stored conversation as context (source of truth for memory).
    stored = db.query(CopilotMessage).filter(
        CopilotMessage.user_email == current_user.email
    ).order_by(CopilotMessage.created_at).all()

    if client:
        try:
            messages = [{"role": "system", "content": system_prompt}]
            for h in stored[-12:]:
                messages.append({"role": ("assistant" if h.role == "assistant" else "user"),
                                 "content": (h.content or "")[:1000]})
            messages.append({"role": "user", "content": data.message})
            resp = client.chat.completions.create(model="gpt-oss-120b", messages=messages)
            plan = _parse_llm(resp.choices[0].message.content)
        except Exception:
            plan = fallback(data.message)
    else:
        plan = fallback(data.message)

    action = plan.get("action", "answer")
    params = plan.get("params", {}) or {}
    reply = plan.get("reply", "")
    result = None

    # ── Sponsor actions ──────────────────────────────────────────────────────
    if is_sponsor:
        if action == "sponsor_roi":
            result = _sponsor_roi(db, params.get("amount"), params.get("event_title"))
            if result.get("error"):
                reply = result["error"]
            elif not reply:
                reply = f"Projected return for a ₹{result['amount']:,} sponsorship of {result['event']}:"
        elif action == "suggest_amount":
            result = _suggest_amount(db, params.get("event_title"))
            if result.get("error"):
                reply = result["error"]
            elif not reply:
                reply = f"Recommended sponsorship for {result['event']}:"
        # persist + return below
        try:
            db.add(CopilotMessage(user_email=current_user.email, role="user", content=data.message[:2000]))
            db.add(CopilotMessage(user_email=current_user.email, role="assistant", content=(reply or "")[:2000]))
            db.commit()
        except Exception:
            db.rollback()
        return {"action": action, "reply": reply, "result": result}

    if action == "create_event":
        try:
            ev = Event(
                title=params.get("title"),
                client_name=params.get("client_name"),
                event_date=datetime.strptime(params["event_date"], "%Y-%m-%d").date(),
                event_type=params.get("event_type") or "Other",
                venue=params.get("venue"),
                budget=float(params.get("budget") or 0),
                status="Upcoming",
                tenant_id=(current_user.tenant_id if current_user.role != "SUPER_ADMIN" else None),
            )
            db.add(ev)
            db.commit()
            db.refresh(ev)
            result = {"event_id": ev.id, "title": ev.title}
            reply = reply or f"Created '{ev.title}' on {ev.event_date}."
        except Exception as e:
            action = "clarify"
            reply = "I need a title, client name, and date (YYYY-MM-DD) to create an event."
    elif action == "get_stats":
        result = _do_stats(db, current_user)
    elif action == "get_revenue":
        result = _do_revenue(db, current_user)

    # Persist the turn so the conversation continues next time (ChatGPT-style).
    try:
        db.add(CopilotMessage(user_email=current_user.email, role="user", content=data.message[:2000]))
        db.add(CopilotMessage(user_email=current_user.email, role="assistant", content=(reply or "")[:2000]))
        db.commit()
    except Exception:
        db.rollback()

    return {"action": action, "reply": reply, "result": result}


@router.get("/history")
def copilot_history(current_user: User = Depends(copilot_roles), db: Session = Depends(get_db)):
    """Return the user's saved Copilot conversation (oldest first)."""
    msgs = db.query(CopilotMessage).filter(
        CopilotMessage.user_email == current_user.email
    ).order_by(CopilotMessage.created_at).all()
    return [{"role": m.role, "content": m.content,
             "created_at": m.created_at.isoformat() if m.created_at else None} for m in msgs]


@router.delete("/history")
def clear_copilot_history(current_user: User = Depends(copilot_roles), db: Session = Depends(get_db)):
    """Start a new chat — clear the user's saved conversation."""
    db.query(CopilotMessage).filter(CopilotMessage.user_email == current_user.email).delete()
    db.commit()
    return {"status": "cleared"}
