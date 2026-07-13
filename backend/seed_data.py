import sys
import os
import random
from datetime import date, datetime, timedelta

# Ensure app can be imported
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, engine, Base
from app.models import Event, Vendor, EventVendor, Settings, ChatMessage
from app.models import EventType, EventStatus, VendorCategory, AssignmentStatus

# Create a database session
db = SessionLocal()

def seed_data():
    print("Seeding database...")
    
    # 1. Add Settings
    if not db.query(Settings).first():
        settings = Settings(
            company_name="EventPro Elite",
            company_email="contact@eventproelite.com",
            company_phone="+91 98765 43210",
            company_address="123 Marina Bay, Event Hub, Singapore",
            currency="INR",
            tax_rate=18.0,
            default_event_type="Wedding"
        )
        db.add(settings)
        print("Settings seeded.")

    # 2. Add Vendors
    vendors_data = [
        {"name": "Royal Cuisine Catering", "category": "Catering", "email": "info@royalcuisine.in", "phone": "+91 99999 11111", "address": "Delhi, India", "rating": 4.8, "price_range": "₹1,00,000 - ₹5,00,000", "description": "Premium catering for all events."},
        {"name": "Crystal Decorators", "category": "Decoration", "email": "decor@crystal.in", "phone": "+91 99999 22222", "address": "Mumbai, India", "rating": 4.5, "price_range": "₹50,000 - ₹2,00,000", "description": "Elegant and modern decorations."},
        {"name": "Lens & Light Photography", "category": "Photography", "email": "hello@lenslight.com", "phone": "+91 99999 33333", "address": "Bangalore, India", "rating": 4.9, "price_range": "₹80,000 - ₹3,00,000", "description": "Capturing your best moments."},
        {"name": "Harmony Music Band", "category": "Music", "email": "bookings@harmony.com", "phone": "+91 99999 44444", "address": "Pune, India", "rating": 4.2, "price_range": "₹30,000 - ₹1,00,000", "description": "Live music for weddings and parties."},
        {"name": "Grand Palace Venue", "category": "Venue", "email": "book@grandpalace.com", "phone": "+91 99999 55555", "address": "Jaipur, India", "rating": 4.7, "price_range": "₹2,00,000 - ₹10,00,000", "description": "Heritage property for grand weddings."}
    ]

    db_vendors = []
    if db.query(Vendor).count() == 0:
        for v in vendors_data:
            vendor = Vendor(**v)
            db.add(vendor)
            db_vendors.append(vendor)
        db.commit()
        print("Vendors seeded.")
    else:
        db_vendors = db.query(Vendor).all()

    # 3. Add Events
    today = date.today()
    events_data = [
        {
            "title": "Sharma Wedding", "description": "A grand traditional wedding.", "event_type": "Wedding",
            "status": "Upcoming", "client_name": "Rahul Sharma", "client_email": "rahul.s@example.com",
            "client_phone": "+91 98765 00001", "venue": "Grand Palace Venue", "event_date": today + timedelta(days=15),
            "start_time": "18:00", "end_time": "23:00", "budget": 1500000.0, "attendees_count": 500, "notes": "VIP guests arriving."
        },
        {
            "title": "Tech Innovators Summit 2026", "description": "Annual tech conference for developers.", "event_type": "Conference",
            "status": "In Progress", "client_name": "Tech Corp India", "client_email": "events@techcorp.in",
            "client_phone": "+91 98765 00002", "venue": "Bangalore Exhibition Center", "event_date": today,
            "start_time": "09:00", "end_time": "18:00", "budget": 800000.0, "attendees_count": 1200, "notes": "Requires high speed internet."
        },
        {
            "title": "Aarav's 10th Birthday", "description": "Superhero themed birthday party.", "event_type": "Birthday",
            "status": "Upcoming", "client_name": "Priya Patel", "client_email": "priya.p@example.com",
            "client_phone": "+91 98765 00003", "venue": "FunZone Kids Arena", "event_date": today + timedelta(days=5),
            "start_time": "16:00", "end_time": "19:00", "budget": 50000.0, "attendees_count": 50, "notes": "Spiderman cake requested."
        },
        {
            "title": "Summer Music Festival", "description": "Outdoor concert featuring local bands.", "event_type": "Concert",
            "status": "Completed", "client_name": "Rhythm Events", "client_email": "hello@rhythmevents.com",
            "client_phone": "+91 98765 00004", "venue": "Mumbai Open Grounds", "event_date": today - timedelta(days=10),
            "start_time": "17:00", "end_time": "23:30", "budget": 1200000.0, "attendees_count": 3000, "notes": "Huge success."
        },
        {
            "title": "Corporate Annual Gala", "description": "End of year celebration.", "event_type": "Corporate",
            "status": "Cancelled", "client_name": "Global Solutions Ltd", "client_email": "hr@globalsolutions.com",
            "client_phone": "+91 98765 00005", "venue": "Taj Hotel", "event_date": today + timedelta(days=20),
            "start_time": "19:00", "end_time": "23:00", "budget": 500000.0, "attendees_count": 200, "notes": "Cancelled due to scheduling conflict."
        }
    ]

    db_events = []
    if db.query(Event).count() == 0:
        for e in events_data:
            event = Event(**e)
            db.add(event)
            db_events.append(event)
        db.commit()
        print("Events seeded.")
    else:
        db_events = db.query(Event).all()

    # 4. Add Event-Vendor Assignments
    if db.query(EventVendor).count() == 0 and db_events and db_vendors:
        # Sharma Wedding assignments
        ev1 = EventVendor(event_id=db_events[0].id, vendor_id=db_vendors[0].id, role="Main Caterer", agreed_price=400000.0, status="Confirmed")
        ev2 = EventVendor(event_id=db_events[0].id, vendor_id=db_vendors[1].id, role="Wedding Decorator", agreed_price=150000.0, status="Confirmed")
        ev3 = EventVendor(event_id=db_events[0].id, vendor_id=db_vendors[2].id, role="Pre-wedding & Event Photography", agreed_price=120000.0, status="Pending")
        
        # Tech Summit
        ev4 = EventVendor(event_id=db_events[1].id, vendor_id=db_vendors[0].id, role="Lunch Buffet", agreed_price=300000.0, status="Confirmed")
        
        # Birthday
        ev5 = EventVendor(event_id=db_events[2].id, vendor_id=db_vendors[1].id, role="Theme Decoration", agreed_price=15000.0, status="Confirmed")
        
        # Concert
        ev6 = EventVendor(event_id=db_events[3].id, vendor_id=db_vendors[3].id, role="Opening Act", agreed_price=50000.0, status="Completed")

        db.add_all([ev1, ev2, ev3, ev4, ev5, ev6])
        db.commit()
        print("Event-Vendor assignments seeded.")

    # 5. Add Sample Chat History
    if db.query(ChatMessage).count() == 0:
        session_id = "sample-session-123"
        msg1 = ChatMessage(session_id=session_id, role="user", content="Hi, I need help planning a corporate event.")
        msg2 = ChatMessage(session_id=session_id, role="assistant", content="Hello! I'd be happy to help you plan your corporate event. Corporate events can range from conferences and seminars to team-building retreats and annual galas.\n\nTo get started, could you tell me a bit more about:\n1. The main objective of the event\n2. Estimated number of attendees\n3. Approximate budget\n4. Preferred location/city")
        msg3 = ChatMessage(session_id=session_id, role="user", content="It's an annual gala for about 200 people. Budget is around ₹5,00,000.")
        msg4 = ChatMessage(session_id=session_id, role="assistant", content="Excellent! An annual gala for 200 people with a ₹5,00,000 budget is a great project. \n\nHere is a quick suggested budget breakdown for you:\n\n*   **Venue & Food (50%):** ₹2,50,000 (Look for premium hotel banquets)\n*   **Decor & Lighting (20%):** ₹1,00,000 (Elegant corporate theme)\n*   **Entertainment (15%):** ₹75,000 (Live band or a good DJ)\n*   **Photography/Videography (10%):** ₹50,000\n*   **Miscellaneous/Contingency (5%):** ₹25,000\n\nWould you like me to suggest some suitable venue types or vendors in your area?")
        
        db.add_all([msg1, msg2, msg3, msg4])
        db.commit()
        print("Chat messages seeded.")

    print("Data seeding completed successfully!")

if __name__ == "__main__":
    try:
        seed_data()
    except Exception as e:
        print(f"Error seeding data: {e}")
    finally:
        db.close()
