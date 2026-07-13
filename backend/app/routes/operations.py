from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import random
import os
import json
from cerebras.cloud.sdk import Cerebras

from app.database import get_db
from app.models import Event, Vendor, EventVendor
from pydantic import BaseModel

router = APIRouter(prefix="/api/operations", tags=["Operations"])

# Initialize Cerebras
api_key = os.getenv("CEREBRAS_API_KEY", "")
client = Cerebras(api_key=api_key) if api_key else None

# A simple state holder for the simulation
SIMULATION_STATE = {}

@router.get("/live/{event_id}")
def get_live_data(event_id: int, db: Session = Depends(get_db)):
    """Simulate real-time operational data for an event."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Initialize state if not present
    state = SIMULATION_STATE.get(event_id, {
        "zone_a_crowd": 20,
        "zone_b_crowd": 15,
        "entrance_queue": 5,
        "food_inventory_percent": 100,
        "staff_active": 10
    })
    
    SIMULATION_STATE[event_id] = state
    
    return {
        "event_id": event_id,
        "timestamp": "now",
        "metrics": {
            "crowd_density": {
                "Zone A (Main Hall)": state["zone_a_crowd"],
                "Zone B (Food Court)": state["zone_b_crowd"],
                "Entrance": state["entrance_queue"]
            },
            "food_inventory_percent": state["food_inventory_percent"],
            "active_staff": state["staff_active"],
            "vendor_status": "All Arrived" if state["food_inventory_percent"] > 20 else "Restock Delayed"
        }
    }

class LiveStateUpdate(BaseModel):
    zone_a_crowd: int
    zone_b_crowd: int
    entrance_queue: int
    food_inventory_percent: int
    staff_active: int

@router.post("/live/{event_id}")
def update_live_data(event_id: int, update: LiveStateUpdate, db: Session = Depends(get_db)):
    """Manually update real-time operational data for an event."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    SIMULATION_STATE[event_id] = {
        "zone_a_crowd": max(0, min(100, update.zone_a_crowd)),
        "zone_b_crowd": max(0, min(100, update.zone_b_crowd)),
        "entrance_queue": max(0, min(100, update.entrance_queue)),
        "food_inventory_percent": max(0, min(100, update.food_inventory_percent)),
        "staff_active": max(0, update.staff_active)
    }
    
    return {"status": "success", "message": "Live data updated successfully"}

@router.get("/predict/{event_id}")
def get_ai_prediction(event_id: int, db: Session = Depends(get_db)):
    """Analyze live simulation data using Gemini AI and return recommendations."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    live_data = get_live_data(event_id, db)
    
    prompt = f"""
    You are the AI engine for EventSphere, an intelligent event command center.
    Analyze the following real-time data for the event '{event.title}':
    {json.dumps(live_data, indent=2)}
    
    Identify any operational risks (crowds > 70 are high risk, food < 30 is high risk).
    Respond strictly in valid JSON format with the following structure:
    {{
      "overall_health": "Healthy" | "Warning" | "Critical",
      "issues": [
         {{"severity": "High", "description": "...", "recommendation": "..."}}
      ],
      "resource_optimization": "..."
    }}
    Ensure the output is raw JSON without markdown blocks.
    """
    
    if not client:
        return {
            "overall_health": "Warning",
            "issues": [
                {
                    "description": "Cerebras API key not configured.",
                    "severity": "Medium",
                    "recommendation": "Add CEREBRAS_API_KEY to .env to enable AI predictions."
                }
            ],
            "resource_optimization": "AI optimization unavailable."
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
            "overall_health": "Error",
            "issues": [
                {
                    "description": f"AI Engine Error: {str(e)}",
                    "severity": "Medium",
                    "recommendation": "Check API logs"
                }
            ],
            "resource_optimization": "Processing failed."
        }
