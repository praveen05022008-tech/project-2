from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import os
import json
from cerebras.cloud.sdk import Cerebras

from app.database import get_db
from app.models import Event, EventVendor

router = APIRouter(prefix="/api/budget", tags=["Budget"])

# Initialize Cerebras
api_key = os.getenv("CEREBRAS_API_KEY", "")
client = Cerebras(api_key=api_key) if api_key else None

@router.get("/analysis/{event_id}")
def get_budget_analysis(event_id: int, db: Session = Depends(get_db)):
    """Analyze event budget vs actuals and predict cost overruns using AI."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    vendors = db.query(EventVendor).filter(EventVendor.event_id == event_id).all()
    vendor_costs = sum([v.agreed_price for v in vendors if v.status != "Cancelled"])
    
    # Calculate a rough estimate of other expenses (e.g., random simulation for demo)
    # Let's say actual_expenses field in Event tracks non-vendor costs.
    total_actual = event.actual_expenses + vendor_costs
    
    budget_data = {
        "event_title": event.title,
        "planned_budget": event.budget,
        "current_total_expenses": total_actual,
        "vendor_committed_costs": vendor_costs,
        "other_expenses": event.actual_expenses,
        "expected_attendance": event.expected_attendance or event.attendees_count,
        "vendor_count": len(vendors)
    }
    
    prompt = f"""
    You are the AI Budget Analyst for EventSphere.
    Analyze the following budget data for the event '{event.title}':
    {json.dumps(budget_data, indent=2)}
    
    Calculate if they are over budget or likely to go over budget.
    Provide a JSON response with this strict structure:
    {{
      "status": "On Track" | "Warning" | "Over Budget",
      "projected_final_cost": <number>,
      "analysis": "...",
      "recommendations": [
         "..."
      ]
    }}
    Ensure the output is raw JSON without markdown blocks.
    """
    
    if not client:
        status = "On Track"
        if total_actual > event.budget:
            status = "Over Budget"
        elif total_actual > event.budget * 0.8:
            status = "Warning"
            
        return {
            "status": "Healthy",
            "projected_final_cost": total_actual * 1.1,
            "analysis": "Cerebras API key not configured. Showing raw costs.",
            "recommendations": ["Add CEREBRAS_API_KEY to .env to enable AI budget analysis."]
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
            "status": "Error",
            "projected_final_cost": total_actual,
            "analysis": f"AI Processing Error: {str(e)}",
            "recommendations": []
        }
