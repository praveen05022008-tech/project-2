from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import os
import json
from cerebras.cloud.sdk import Cerebras

from app.database import get_db
from app.models import Event, EventVendor

router = APIRouter(prefix="/api/reports", tags=["Reports"])

# Initialize Cerebras
api_key = os.getenv("CEREBRAS_API_KEY", "")
client = Cerebras(api_key=api_key) if api_key else None

@router.get("/post-event/{event_id}")
def generate_post_event_report(event_id: int, db: Session = Depends(get_db)):
    """Generate a comprehensive post-event business report and Sponsor ROI using AI."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    vendors = db.query(EventVendor).filter(EventVendor.event_id == event_id).all()
    vendor_costs = sum([v.agreed_price for v in vendors if v.status != "Cancelled"])
    total_cost = event.actual_expenses + vendor_costs
    
    report_data = {
        "event_title": event.title,
        "event_type": event.event_type,
        "planned_budget": event.budget,
        "actual_total_cost": total_cost,
        "expected_attendance": event.expected_attendance,
        "actual_attendance": event.actual_attendance,
        "marketing_budget": event.marketing_budget,
        "expected_roi_target": event.expected_roi,
        "vendor_performance_average": sum([v.performance_score for v in vendors]) / len(vendors) if vendors else 0,
        "total_vendors": len(vendors)
    }
    
    prompt = f"""
    You are the Chief Analytics Officer for EventSphere.
    Analyze the following post-event data to generate a business report:
    {json.dumps(report_data, indent=2)}
    
    Provide a Sponsor ROI calculation and a Post-Event Business Report.
    Respond strictly in valid JSON format with this structure:
    {{
      "sponsor_roi_percentage": <number>,
      "financial_summary": "...",
      "operational_summary": "...",
      "key_successes": [
         "..."
      ],
      "areas_for_improvement": [
         "..."
      ]
    }}
    Ensure the output is raw JSON without markdown blocks.
    """
    
    if not client:
        return {
            "sponsor_roi_percentage": 0,
            "financial_summary": f"Event cost ₹{total_cost} against a budget of ₹{event.budget}.",
            "operational_summary": "Cerebras API key not configured.",
            "key_successes": ["System running", "Fallback data active"],
            "areas_for_improvement": ["Add CEREBRAS_API_KEY to .env"]
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
            "sponsor_roi_percentage": 0,
            "financial_summary": f"AI Error: {str(e)}",
            "operational_summary": "Unable to generate summary due to AI error.",
            "key_successes": [],
            "areas_for_improvement": []
        }
