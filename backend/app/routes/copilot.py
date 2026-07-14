"""AI Event Copilot — natural-language assistant that can act.

The LLM classifies the user's message into a structured action; the backend
executes it with the caller's role/tenant scope (create events, answer with real
stats/revenue, or draft marketing copy). Falls back to keyword parsing without a key.
"""
import json
import os
from datetime import date, datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func
from cerebras.cloud.sdk import Cerebras

from app.database import get_db
from app.core.deps import require_roles
from app.models import Event, Order, User

router = APIRouter(prefix="/api/copilot", tags=["Copilot"])
copilot_roles = require_roles("SUPER_ADMIN", "ORGANIZER")

api_key = os.getenv("CEREBRAS_API_KEY", "")
client = Cerebras(api_key=api_key) if api_key else None

SYSTEM = """You are EventPro Copilot for an event-management platform.
Decide the user's intent and reply ONLY with a compact JSON object, no markdown:
{"action": "<action>", "params": {...}, "reply": "<short friendly reply>"}

Valid actions:
- "create_event": params {title, client_name, event_date (YYYY-MM-DD), event_type, venue, budget}. If title, client_name, or event_date is missing, instead use action "clarify" and ask for them in reply.
- "get_stats": overview of the user's events.
- "get_revenue": ticket revenue so far.
- "draft_marketing": put the marketing copy in "reply".
- "answer": general help/answer in "reply".
Keep reply under 60 words. Today is %س.""".replace("%س", date.today().isoformat())


class CopilotIn(BaseModel):
    message: str = Field(..., min_length=1)


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
    if client:
        try:
            resp = client.chat.completions.create(
                model="gpt-oss-120b",
                messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": data.message}],
            )
            plan = _parse_llm(resp.choices[0].message.content)
        except Exception:
            plan = _fallback(data.message)
    else:
        plan = _fallback(data.message)

    action = plan.get("action", "answer")
    params = plan.get("params", {}) or {}
    reply = plan.get("reply", "")
    result = None

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

    return {"action": action, "reply": reply, "result": result}
