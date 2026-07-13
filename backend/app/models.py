from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime, Date, Time,
    ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum

from app.database import Base


# ─── Enums ──────────────────────────────────────────────────────────────────────

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

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, autoincrement=True)
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
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
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
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
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


class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company_name = Column(String(255), default="EventPro Management")
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


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<ChatMessage(session_id='{self.session_id}', role='{self.role}')>"
