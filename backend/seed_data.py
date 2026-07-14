import sys
import os
import random
from datetime import date, datetime, timedelta

# Ensure app can be imported
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, engine, Base
from app.models import Event, Vendor, EventVendor, Settings, ChatMessage, User, CheckIn, Ticket, TicketType, Order, Tenant
from app.models import EventType, EventStatus, VendorCategory, AssignmentStatus, Role
from app.core.security import get_password_hash

# Create a database session
db = SessionLocal()

def seed_data():
    print("Seeding database...")

    # Ensure all tables exist before we try to query/insert.
    Base.metadata.create_all(bind=engine)

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

    # 1.2 Add Tenants (organizations) — demonstrates multi-tenant isolation
    tenant_a = db.query(Tenant).filter(Tenant.name == "EventPro Elite").first()
    if not tenant_a:
        tenant_a = Tenant(name="EventPro Elite")
        tenant_b = Tenant(name="Stellar Events")
        db.add_all([tenant_a, tenant_b])
        db.commit()
        print("Tenants seeded.")
    else:
        tenant_b = db.query(Tenant).filter(Tenant.name == "Stellar Events").first()

    # 1.5 Add Users (7 Test Accounts across 2 tenants)
    if db.query(User).count() == 0:
        default_password = get_password_hash("password123")
        users = [
            # Platform owner — no tenant (sees everything)
            User(email="superadmin@eventpro.com", hashed_password=default_password, role=Role.SUPER_ADMIN.value),
            # Tenant A: EventPro Elite
            User(email="organizer@eventpro.com", hashed_password=default_password, role=Role.ORGANIZER.value, tenant_id=tenant_a.id),
            User(email="staff@eventpro.com", hashed_password=default_password, role=Role.STAFF.value, tenant_id=tenant_a.id),
            # Tenant B: Stellar Events (second organizer to prove isolation)
            User(email="organizer2@eventpro.com", hashed_password=default_password, role=Role.ORGANIZER.value, tenant_id=tenant_b.id),
            # Cross-tenant consumers / marketplace (no tenant)
            User(email="vendor@eventpro.com", hashed_password=default_password, role=Role.VENDOR.value),
            User(email="sponsor@eventpro.com", hashed_password=default_password, role=Role.SPONSOR.value),
            User(email="attendee@eventpro.com", hashed_password=default_password, role=Role.ATTENDEE.value),
        ]
        db.add_all(users)
        db.commit()
        print("Test users seeded.")
    else:
        users = db.query(User).all()

    # Map vendor user
    vendor_user = next((u for u in users if u.role == Role.VENDOR.value), None)
    organizer2 = next((u for u in users if u.email == "organizer2@eventpro.com"), None)

    # 2. Add Vendors
    vendors_data = [
        {"name": "Royal Cuisine Catering", "category": "Catering", "email": "info@royalcuisine.in", "phone": "+91 99999 11111", "address": "Delhi, India", "rating": 4.8, "price_range": "₹1,00,000 - ₹5,00,000", "description": "Premium catering for all events.", "user_id": vendor_user.id if vendor_user else None},
        {"name": "Crystal Decorators", "category": "Decoration", "email": "decor@crystal.in", "phone": "+91 99999 22222", "address": "Mumbai, India", "rating": 4.5, "price_range": "₹50,000 - ₹2,00,000", "description": "Elegant and modern decorations.", "user_id": None},
        {"name": "Lens & Light Photography", "category": "Photography", "email": "hello@lenslight.com", "phone": "+91 99999 33333", "address": "Bangalore, India", "rating": 4.9, "price_range": "₹80,000 - ₹3,00,000", "description": "Capturing your best moments.", "user_id": None},
        {"name": "Harmony Music Band", "category": "Music", "email": "bookings@harmony.com", "phone": "+91 99999 44444", "address": "Pune, India", "rating": 4.2, "price_range": "₹30,000 - ₹1,00,000", "description": "Live music for weddings and parties.", "user_id": None},
        {"name": "Grand Palace Venue", "category": "Venue", "email": "book@grandpalace.com", "phone": "+91 99999 55555", "address": "Jaipur, India", "rating": 4.7, "price_range": "₹2,00,000 - ₹10,00,000", "description": "Heritage property for grand weddings.", "user_id": None}
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

    # Map organizer user
    organizer_user = next((u for u in users if u.role == Role.ORGANIZER.value), None)

    # 3. Add Events
    today = date.today()
    events_data = [
        {
            "title": "Sharma Wedding", "description": "A grand traditional wedding.", "event_type": "Wedding",
            "status": "Upcoming", "client_name": "Rahul Sharma", "client_email": "rahul.s@example.com",
            "client_phone": "+91 98765 00001", "venue": "Grand Palace Venue", "event_date": today + timedelta(days=15),
            "start_time": "18:00", "end_time": "23:00", "budget": 1500000.0, "attendees_count": 500, "notes": "VIP guests arriving.",
            "marketing_budget": 200000.0, "expected_roi": 2.6, "expected_attendance": 550, "actual_attendance": 0,
            "organizer_id": organizer_user.id if organizer_user else None
        },
        {
            "title": "Tech Innovators Summit 2026", "description": "Annual tech conference for developers.", "event_type": "Conference",
            "status": "In Progress", "client_name": "Tech Corp India", "client_email": "events@techcorp.in",
            "client_phone": "+91 98765 00002", "venue": "Bangalore Exhibition Center", "event_date": today,
            "start_time": "09:00", "end_time": "18:00", "budget": 800000.0, "attendees_count": 1200, "notes": "Requires high speed internet.",
            "marketing_budget": 300000.0, "expected_roi": 3.8, "expected_attendance": 1300, "actual_attendance": 1150,
            "organizer_id": organizer_user.id if organizer_user else None
        },
        {
            "title": "Aarav's 10th Birthday", "description": "Superhero themed birthday party.", "event_type": "Birthday",
            "status": "Upcoming", "client_name": "Priya Patel", "client_email": "priya.p@example.com",
            "client_phone": "+91 98765 00003", "venue": "FunZone Kids Arena", "event_date": today + timedelta(days=5),
            "start_time": "16:00", "end_time": "19:00", "budget": 50000.0, "attendees_count": 50, "notes": "Spiderman cake requested.",
            "marketing_budget": 8000.0, "expected_roi": 1.3, "expected_attendance": 55, "actual_attendance": 0,
            "organizer_id": None
        },
        {
            "title": "Summer Music Festival", "description": "Outdoor concert featuring local bands.", "event_type": "Concert",
            "status": "Completed", "client_name": "Rhythm Events", "client_email": "hello@rhythmevents.com",
            "client_phone": "+91 98765 00004", "venue": "Mumbai Open Grounds", "event_date": today - timedelta(days=10),
            "start_time": "17:00", "end_time": "23:30", "budget": 1200000.0, "actual_expenses": 950000.0, "attendees_count": 3000, "notes": "Huge success.",
            "marketing_budget": 400000.0, "expected_roi": 4.5, "expected_attendance": 3200, "actual_attendance": 3050,
            "organizer_id": None
        },
        {
            "title": "Corporate Annual Gala", "description": "End of year celebration.", "event_type": "Corporate",
            "status": "Cancelled", "client_name": "Global Solutions Ltd", "client_email": "hr@globalsolutions.com",
            "client_phone": "+91 98765 00005", "venue": "Taj Hotel", "event_date": today + timedelta(days=20),
            "start_time": "19:00", "end_time": "23:00", "budget": 500000.0, "attendees_count": 200, "notes": "Cancelled due to scheduling conflict.",
            "marketing_budget": 120000.0, "expected_roi": 2.1, "expected_attendance": 220, "actual_attendance": 0,
            "organizer_id": None
        },
        {
            "title": "Global Fintech Expo 2026", "description": "Largest fintech exhibition in South Asia.", "event_type": "Exhibition",
            "status": "Upcoming", "client_name": "FinConnect India", "client_email": "expo@finconnect.in",
            "client_phone": "+91 98765 00010", "venue": "Hyderabad Convention Centre", "event_date": today + timedelta(days=40),
            "start_time": "10:00", "end_time": "18:00", "budget": 2000000.0, "attendees_count": 5000, "notes": "500+ exhibitor booths.",
            "marketing_budget": 500000.0, "expected_roi": 4.2, "expected_attendance": 5000, "actual_attendance": 0,
            "organizer_id": organizer_user.id if organizer_user else None
        },
        {
            "title": "Startup Pitch Night", "description": "Investor pitch evening for early-stage startups.", "event_type": "Seminar",
            "status": "Upcoming", "client_name": "Nexus Ventures", "client_email": "events@nexusvc.com",
            "client_phone": "+91 98765 00011", "venue": "WeWork Koramangala", "event_date": today + timedelta(days=8),
            "start_time": "17:30", "end_time": "21:00", "budget": 300000.0, "attendees_count": 400, "notes": "20 startups pitching.",
            "marketing_budget": 90000.0, "expected_roi": 3.1, "expected_attendance": 400, "actual_attendance": 0,
            "organizer_id": organizer_user.id if organizer_user else None
        },
        {
            "title": "Diwali Cultural Gala", "description": "Company-wide festival celebration.", "event_type": "Corporate",
            "status": "Completed", "client_name": "Aurora Systems", "client_email": "hr@aurorasys.com",
            "client_phone": "+91 98765 00012", "venue": "ITC Grand Chola", "event_date": today - timedelta(days=20),
            "start_time": "19:00", "end_time": "23:30", "budget": 900000.0, "actual_expenses": 850000.0, "attendees_count": 1500, "notes": "Live music + dinner.",
            "marketing_budget": 250000.0, "expected_roi": 3.9, "expected_attendance": 1500, "actual_attendance": 1420,
            "organizer_id": organizer_user.id if organizer_user else None
        }
    ]

    # All base events belong to Tenant A (EventPro Elite)
    for e in events_data:
        e["tenant_id"] = tenant_a.id

    # A couple of events for Tenant B (Stellar Events) to demonstrate isolation
    events_data += [
        {
            "title": "Stellar Product Launch", "description": "Flagship product reveal.", "event_type": "Corporate",
            "status": "Upcoming", "client_name": "Stellar Tech", "client_email": "launch@stellar.io",
            "client_phone": "+91 98765 09001", "venue": "Chennai Trade Centre", "event_date": today + timedelta(days=12),
            "start_time": "10:00", "end_time": "14:00", "budget": 600000.0, "attendees_count": 300, "notes": "Press invited.",
            "marketing_budget": 150000.0, "expected_roi": 3.0, "expected_attendance": 300, "actual_attendance": 0,
            "organizer_id": organizer2.id if organizer2 else None, "tenant_id": tenant_b.id
        },
        {
            "title": "Stellar Charity Run", "description": "5K fundraising run.", "event_type": "Other",
            "status": "Upcoming", "client_name": "Stellar Foundation", "client_email": "run@stellar.io",
            "client_phone": "+91 98765 09002", "venue": "Marina Beach", "event_date": today + timedelta(days=25),
            "start_time": "06:00", "end_time": "09:00", "budget": 200000.0, "attendees_count": 800, "notes": "Charity event.",
            "marketing_budget": 40000.0, "expected_roi": 1.5, "expected_attendance": 800, "actual_attendance": 0,
            "organizer_id": organizer2.id if organizer2 else None, "tenant_id": tenant_b.id
        },
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

    # 6. Add Check-ins (live crowd density + sponsor booth engagement)
    if db.query(CheckIn).count() == 0 and db_events:
        live_event = next((e for e in db_events if e.status == "In Progress"), db_events[0])
        checkins = []
        # ENTRY scans distributed across zones (Gate A intentionally busiest)
        zone_counts = {"Gate A": 22, "Gate B": 9, "Zone A (Main Hall)": 18, "Zone B (Food Court)": 12}
        for zone, n in zone_counts.items():
            for i in range(n):
                checkins.append(CheckIn(
                    event_id=live_event.id, scan_type="ENTRY", zone=zone,
                    attendee_email=f"guest_{zone[0].lower()}{i}@demo.com",
                ))
        # BOOTH scans with ~1-in-3 converting to a lead
        for i in range(42):
            checkins.append(CheckIn(
                event_id=live_event.id, scan_type="BOOTH", zone="Booth 4",
                sponsor_email="sponsor@eventpro.com", lead_captured=(i % 3 == 0),
            ))
        db.add_all(checkins)
        db.commit()
        print("Check-ins seeded.")

    # 7. Ticket tiers + sample paid orders (commerce / revenue)
    if db.query(TicketType).count() == 0 and db_events:
        for e in db_events:
            if e.status not in ("Upcoming", "In Progress", "Completed"):
                continue
            gen = TicketType(event_id=e.id, name="General", description="Standard entry", price=500.0, quantity_total=500)
            vip = TicketType(event_id=e.id, name="VIP", description="Premium access + lounge", price=2500.0, quantity_total=50)
            db.add_all([gen, vip])
            db.flush()
            # a few paid orders on the General tier
            for i in range(3):
                qty = i + 1
                o = Order(event_id=e.id, ticket_type_id=gen.id, buyer_email=f"buyer{i}@demo.com",
                          buyer_name=f"Buyer {i}", quantity=qty, unit_price=gen.price,
                          total_amount=gen.price * qty, status="PAID",
                          payment_ref="SEED-" + str(e.id) + str(i))
                gen.quantity_sold += qty
                db.add(o)
                db.flush()
                for _ in range(qty):
                    db.add(Ticket(code=f"FP-SEED{e.id}{i}{_}".upper()[:20], event_id=e.id,
                                  attendee_email=o.buyer_email, tier="General", order_id=o.id))
        db.commit()
        print("Ticket types + orders seeded.")

    print("Data seeding completed successfully!")

if __name__ == "__main__":
    try:
        seed_data()
    except Exception as e:
        print(f"Error seeding data: {e}")
    finally:
        db.close()
