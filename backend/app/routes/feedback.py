"""Post-event feedback / satisfaction + AI sentiment summary."""
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func
from cerebras.cloud.sdk import Cerebras

from app.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models import Feedback, Event, User

router = APIRouter(prefix="/api/feedback", tags=["Feedback"])
manage_roles = require_roles("SUPER_ADMIN", "ORGANIZER", "STAFF")

api_key = os.getenv("CEREBRAS_API_KEY", "")
client = Cerebras(api_key=api_key) if api_key else None


class FeedbackIn(BaseModel):
    event_id: int
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


@router.post("", status_code=201)
def submit_feedback(data: FeedbackIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.query(Event).filter(Event.id == data.event_id).first():
        raise HTTPException(status_code=404, detail="Event not found")
    fb = Feedback(event_id=data.event_id, attendee_email=current_user.email,
                  rating=data.rating, comment=(data.comment or "").strip() or None)
    db.add(fb)
    db.commit()
    return {"status": "ok", "message": "Thanks for your feedback!"}


def _sentiment(avg, comments):
    if client and comments:
        try:
            prompt = ("Summarize attendee sentiment in 2 sentences and list the top theme. "
                      f"Average rating {avg:.1f}/5. Comments:\n- " + "\n- ".join(comments[:30]))
            r = client.chat.completions.create(model="gpt-oss-120b",
                                               messages=[{"role": "user", "content": prompt}])
            return r.choices[0].message.content.strip()
        except Exception:
            pass
    if avg >= 4.2:
        return "Overwhelmingly positive — attendees were highly satisfied."
    if avg >= 3.4:
        return "Generally positive with room to improve."
    if avg >= 2.5:
        return "Mixed — notable dissatisfaction to address."
    if avg > 0:
        return "Largely negative — significant issues reported."
    return "No feedback yet."


@router.get("/{event_id}/summary", dependencies=[Depends(manage_roles)])
def feedback_summary(event_id: int, db: Session = Depends(get_db)):
    rows = db.query(Feedback).filter(Feedback.event_id == event_id).all()
    count = len(rows)
    avg = (sum(r.rating for r in rows) / count) if count else 0.0
    dist = {i: 0 for i in range(1, 6)}
    for r in rows:
        dist[r.rating] = dist.get(r.rating, 0) + 1
    # Simple NPS-style score: (%5s + %4s) - (%1-2s)
    promoters = dist[5] + dist[4]
    detractors = dist[1] + dist[2]
    nps = round(((promoters - detractors) / count) * 100) if count else 0
    comments = [r.comment for r in rows if r.comment]
    return {
        "event_id": event_id,
        "count": count,
        "average_rating": round(avg, 2),
        "distribution": dist,
        "nps": nps,
        "recent_comments": comments[-8:][::-1],
        "sentiment": _sentiment(avg, comments),
        "ai_enabled": bool(client),
    }
