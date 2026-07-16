from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime, Date, Time,
    ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum

from app.database import Base


# ─── Enums ──────────────────────────────────────────────────────────────────────

class Role(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ORGANIZER = "ORGANIZER"
    STAFF = "STAFF"
    VENDOR = "VENDOR"
    SPONSOR = "SPONSOR"
    ATTENDEE = "ATTENDEE"


class EventType(str, enum.Enum):
    WEDDING = "Wedding"
    CORPORATE = "Corporate"
    BIRTHDAY = "Birthday"
    CONCERT = "Concert"
    CONFERENCE = "Conference"
    EXHIBITION = "Exhibition"
    SEMINAR = "Seminar"
    OTHER = "Other"


class EventStatus(str, enum.Enum):
    UPCOMING = "Upcoming"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class VendorCategory(str, enum.Enum):
    CATERING = "Catering"
    DECORATION = "Decoration"
    PHOTOGRAPHY = "Photography"
    MUSIC = "Music"
    VENUE = "Venue"
    LIGHTING = "Lighting"
    TRANSPORT = "Transport"
    FLORIST = "Florist"
    SECURITY = "Security"
    OTHER = "Other"


class AssignmentStatus(str, enum.Enum):
    PENDING = "Pending"
    CONFIRMED = "Confirmed"
    CANCELLED = "Cancelled"


# ─── Models ─────────────────────────────────────────────────────────────────────

class Tenant(Base):
    """An organization (tenant) in the SaaS. Organizers and their staff/events
    belong to a tenant; data is isolated per tenant. SUPER_ADMIN spans all."""
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<Tenant(id={self.id}, name='{self.name}')>"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default=Role.ATTENDEE.value)
    is_active = Column(Boolean, default=True)
    # Null for platform-wide roles (SUPER_ADMIN) and cross-tenant consumers
    # (ATTENDEE / SPONSOR who interact with events from any organizer).
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    events = relationship("Event", back_populates="organizer", foreign_keys="[Event.organizer_id]")
    vendor_profile = relationship("Vendor", back_populates="user", uselist=False, foreign_keys="[Vendor.user_id]")

    def __repr__(self):
        return f"<User(id={self.id}, email='{self.email}', role='{self.role}')>"


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    event_type = Column(String(50), default=EventType.OTHER.value)
    status = Column(String(50), default=EventStatus.UPCOMING.value, index=True)
    client_name = Column(String(255), nullable=False)
    client_email = Column(String(255), nullable=True)
    client_phone = Column(String(50), nullable=True)
    venue = Column(String(500), nullable=True)
    event_date = Column(Date, nullable=False, index=True)
    start_time = Column(String(10), nullable=True)
    end_time = Column(String(10), nullable=True)
    budget = Column(Float, default=0.0)
    actual_expenses = Column(Float, default=0.0)
    attendees_count = Column(Integer, default=0)
    expected_attendance = Column(Integer, default=0)
    actual_attendance = Column(Integer, default=0)
    marketing_budget = Column(Float, default=0.0)
    expected_roi = Column(Float, default=0.0)
    notes = Column(Text, nullable=True)
    venue_map_url = Column(String(500), nullable=True)   # organizer-provided venue map link
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    organizer_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    organizer = relationship("User", back_populates="events", foreign_keys=[organizer_id])
    vendors = relationship("EventVendor", back_populates="event", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Event(id={self.id}, title='{self.title}', status='{self.status}')>"


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, index=True)
    category = Column(String(50), default=VendorCategory.OTHER.value)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)
    rating = Column(Float, default=0.0)
    price_range = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    availability = Column(String(20), default="Available")   # Available | Busy | Inactive
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    user = relationship("User", back_populates="vendor_profile", foreign_keys=[user_id])
    events = relationship("EventVendor", back_populates="vendor", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Vendor(id={self.id}, name='{self.name}', category='{self.category}')>"


class EventVendor(Base):
    __tablename__ = "event_vendors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(255), nullable=True)
    agreed_price = Column(Float, default=0.0)
    status = Column(String(50), default=AssignmentStatus.PENDING.value)
    performance_score = Column(Float, default=0.0)
    feedback = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    event = relationship("Event", back_populates="vendors")
    vendor = relationship("Vendor", back_populates="events")

    def __repr__(self):
        return f"<EventVendor(event_id={self.event_id}, vendor_id={self.vendor_id})>"


class EventStaff(Base):
    """Assigns a staff member to a specific event (scopes their access + attendance)."""
    __tablename__ = "event_staff"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_email = Column(String(255), nullable=False, index=True)
    role_label = Column(String(120), nullable=True)          # e.g. "Gate A", "Usher"
    attendance = Column(String(20), default="Pending")       # Pending | Present | Absent | Flagged
    checked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<EventStaff(event_id={self.event_id}, staff='{self.staff_email}')>"


class EventSponsor(Base):
    """Links a sponsor to a specific event they are sponsoring."""
    __tablename__ = "event_sponsors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    sponsor_email = Column(String(255), nullable=False, index=True)
    company = Column(String(255), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    amount = Column(Float, default=0.0)
    status = Column(String(30), default="Interested")        # Interested | Confirmed | Declined
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<EventSponsor(event_id={self.event_id}, sponsor='{self.sponsor_email}')>"


class SponsorProfile(Base):
    """A sponsor's directory profile — surfaced to organizers in the
    'Available Sponsors' panel. Sponsors control their own availability."""
    __tablename__ = "sponsor_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_email = Column(String(255), unique=True, nullable=False, index=True)
    company_name = Column(String(255), nullable=True)
    logo_url = Column(String(500), nullable=True)
    category = Column(String(100), nullable=True)          # industry / sponsorship interest
    budget = Column(Float, default=0.0)                    # sponsorship budget (₹)
    location = Column(String(255), nullable=True)
    availability = Column(String(30), default="Available")  # Available | Open to offers | Not Available
    description = Column(Text, nullable=True)
    contact_phone = Column(String(50), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<SponsorProfile(email='{self.user_email}', company='{self.company_name}')>"


class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company_name = Column(String(255), default="EventoPro Management")
    company_email = Column(String(255), default="info@eventpro.com")
    company_phone = Column(String(50), default="")
    company_address = Column(Text, default="")
    logo_url = Column(String(500), default="")
    currency = Column(String(10), default="INR")
    tax_rate = Column(Float, default=18.0)
    default_event_type = Column(String(50), default=EventType.OTHER.value)
    notification_email = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<Settings(company_name='{self.company_name}')>"


class TicketType(Base):
    """A purchasable ticket tier for an event (e.g. General, VIP)."""
    __tablename__ = "ticket_types"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    price = Column(Float, default=0.0)
    quantity_total = Column(Integer, default=0)     # 0 = unlimited
    quantity_sold = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<TicketType(event_id={self.event_id}, name='{self.name}', price={self.price})>"


class Order(Base):
    """An attendee's purchase/registration for tickets to an event."""
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    ticket_type_id = Column(Integer, ForeignKey("ticket_types.id", ondelete="SET NULL"), nullable=True)
    buyer_email = Column(String(255), nullable=False, index=True)
    buyer_name = Column(String(255), nullable=True)
    quantity = Column(Integer, default=1)
    unit_price = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)
    status = Column(String(20), default="PENDING")   # PENDING | PAID | CANCELLED | REFUNDED
    payment_ref = Column(String(100), nullable=True)     # captured payment id
    gateway_order_id = Column(String(100), nullable=True)  # gateway (Razorpay) order id
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    def __repr__(self):
        return f"<Order(id={self.id}, buyer='{self.buyer_email}', status='{self.status}')>"


class Ticket(Base):
    """A FastPass ticket issued to an attendee for a specific event."""
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(40), unique=True, nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    attendee_email = Column(String(255), nullable=False, index=True)
    attendee_name = Column(String(255), nullable=True)
    tier = Column(String(100), nullable=True)                     # ticket type name
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    checked_in = Column(Boolean, default=False)
    issued_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<Ticket(code='{self.code}', event_id={self.event_id})>"


class CheckIn(Base):
    """A single scan/check-in event — powers live crowd density, sponsor booth
    engagement, and ticket validation."""
    __tablename__ = "check_ins"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    ticket_code = Column(String(40), nullable=True, index=True)
    attendee_email = Column(String(255), nullable=True)
    scan_type = Column(String(20), default="ENTRY")   # ENTRY | BOOTH | SESSION
    zone = Column(String(100), nullable=True)          # e.g. "Gate A", "Zone B", "Booth 4"
    sponsor_email = Column(String(255), nullable=True)  # booth attribution
    lead_captured = Column(Boolean, default=False)      # sponsor lead opt-in
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    def __repr__(self):
        return f"<CheckIn(event_id={self.event_id}, type='{self.scan_type}', zone='{self.zone}')>"


class Notification(Base):
    """In-app notification / announcement. Delivered to users matching any of the
    (nullable) targets; a fully-null target is a global broadcast."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=True)
    level = Column(String(20), default="info")          # info | success | warning | critical
    target_role = Column(String(50), nullable=True)     # e.g. "ORGANIZER"
    target_tenant_id = Column(Integer, nullable=True)   # limit to one tenant
    target_email = Column(String(255), nullable=True)   # limit to one user
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    def __repr__(self):
        return f"<Notification(title='{self.title}')>"


class CopilotMessage(Base):
    """Persisted AI Copilot conversation (per user) so history survives reloads."""
    __tablename__ = "copilot_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_email = Column(String(255), nullable=False, index=True)
    role = Column(String(20), nullable=False)   # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    def __repr__(self):
        return f"<CopilotMessage(user='{self.user_email}', role='{self.role}')>"


class Question(Base):
    """Attendee Q&A for an event (organizer answers)."""
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    asker_email = Column(String(255), nullable=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=True)
    answered_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    def __repr__(self):
        return f"<Question(event_id={self.event_id})>"


class Feedback(Base):
    """Post-event attendee feedback / satisfaction rating."""
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    attendee_email = Column(String(255), nullable=True)
    rating = Column(Integer, default=5)                 # 1-5 satisfaction
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    def __repr__(self):
        return f"<Feedback(event_id={self.event_id}, rating={self.rating})>"


class AuditLog(Base):
    """Records every state-changing action taken by any user, for the
    Super Admin audit trail."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    user_email = Column(String(255), nullable=True, index=True)
    user_role = Column(String(50), nullable=True, index=True)
    action = Column(String(255), nullable=False)          # human-readable summary
    method = Column(String(10), nullable=True)            # HTTP method
    path = Column(String(500), nullable=True)             # request path
    status_code = Column(Integer, nullable=True)          # response status
    ip_address = Column(String(64), nullable=True)
    details = Column(Text, nullable=True)                 # optional extra context

    def __repr__(self):
        return f"<AuditLog(user='{self.user_email}', action='{self.action}')>"


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<ChatMessage(session_id='{self.session_id}', role='{self.role}')>"
