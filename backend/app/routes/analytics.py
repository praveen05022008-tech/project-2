from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import os
import json
from cerebras.cloud.sdk import Cerebras

from app.database import get_db
from app.models import Event

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])

# Initialize Cerebras
api_key = os.getenv("CEREBRAS_API_KEY", "")
client = Cerebras(api_key=api_key) if api_key else None

@router.get("/{event_id}")
def get_analytics(event_id: int, db: Session = Depends(get_db)):
    """Predict attendance and analyze marketing ROI using AI."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    analytics_data = {
        "event_title": event.title,
        "event_type": event.event_type,
        "current_registrations": event.attendees_count,
        "expected_attendance": event.expected_attendance,
        "marketing_budget_spent": event.marketing_budget,
        "historical_conversion_rate": "12%", # Mock historical data
        "weather_forecast": "Sunny", # Mock external factor
    }
    
    prompt = f"""
    You are the AI Marketing & Attendance Predictor for EventSphere.
    Analyze the following event data:
    {json.dumps(analytics_data, indent=2)}
    
    Provide an attendance prediction and marketing recommendations.
    Respond strictly in valid JSON format with this structure:
    {{
      "predicted_final_attendance": <number>,
      "attendance_health": "On Track" | "Low Registration",
      "marketing_roi_score": <number between 0 and 100>,
      "marketing_insights": "...",
      "growth_recommendations": [
         "..."
      ]
    }}
    Ensure the output is raw JSON without markdown blocks.
    """
    
    if not client:
        return {
            "predicted_final_attendance": int(event.attendees_count * 1.5),
            "attendance_health": "On Track",
            "marketing_roi_score": 75,
            "marketing_insights": "Cerebras API key not configured. Mock data shown.",
            "growth_recommendations": ["Add CEREBRAS_API_KEY to .env"]
        }
        
    try:
        response = client.chat.completions.create(
            model="gpt-oss-120b",
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.choices[0].message.content.strip()
        if text.startswith("```json"):
            text = text.replace("```json", "", 1)
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
        
        return json.loads(text.strip())
    except Exception as e:
        return {
            "predicted_final_attendance": event.attendees_count,
            "attendance_health": "Low Registration",
            "marketing_roi_score": 0,
            "marketing_insights": f"AI Processing Error: {str(e)}",
            "growth_recommendations": []
        }
