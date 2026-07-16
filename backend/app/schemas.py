from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import date, datetime

# ─── Auth & User Schemas ────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: Optional[str] = "ATTENDEE"

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    role: str
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Event Schemas ──────────────────────────────────────────────────────────────

class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    event_type: Optional[str] = "Other"
    status: Optional[str] = "Upcoming"
    client_name: str = Field(..., min_length=1, max_length=255)
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    venue: Optional[str] = None
    event_date: date
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    budget: Optional[float] = 0.0
    actual_expenses: Optional[float] = 0.0
    attendees_count: Optional[int] = 0
    expected_attendance: Optional[int] = 0
    actual_attendance: Optional[int] = 0
    marketing_budget: Optional[float] = 0.0
    expected_roi: Optional[float] = 0.0
    notes: Optional[str] = None
    venue_map_url: Optional[str] = None


class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    event_type: Optional[str] = None
    status: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    venue: Optional[str] = None
    event_date: Optional[date] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    budget: Optional[float] = None
    actual_expenses: Optional[float] = None
    attendees_count: Optional[int] = None
    expected_attendance: Optional[int] = None
    actual_attendance: Optional[int] = None
    marketing_budget: Optional[float] = None
    expected_roi: Optional[float] = None
    notes: Optional[str] = None
    venue_map_url: Optional[str] = None


class EventResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    event_type: str
    status: str
    client_name: str
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    venue: Optional[str] = None
    event_date: date
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    budget: float
    actual_expenses: float
    attendees_count: int
    expected_attendance: int
    actual_attendance: int
    marketing_budget: float
    expected_roi: float
    notes: Optional[str] = None
    venue_map_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Vendor Schemas ─────────────────────────────────────────────────────────────

class VendorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    category: Optional[str] = "Other"
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    rating: Optional[float] = Field(0.0, ge=0, le=5)
    price_range: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = True


class VendorUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    rating: Optional[float] = Field(None, ge=0, le=5)
    price_range: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class VendorResponse(BaseModel):
    id: int
    name: str
    category: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    rating: float
    price_range: Optional[str] = None
    description: Optional[str] = None
    is_active: bool
    availability: Optional[str] = "Available"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Event-Vendor Assignment Schemas ────────────────────────────────────────────

class EventVendorCreate(BaseModel):
    event_id: int
    vendor_id: int
    role: Optional[str] = None
    agreed_price: Optional[float] = 0.0
    status: Optional[str] = "Pending"


class EventVendorUpdate(BaseModel):
    role: Optional[str] = None
    agreed_price: Optional[float] = None
    status: Optional[str] = None


class EventVendorResponse(BaseModel):
    id: int
    event_id: int
    vendor_id: int
    role: Optional[str] = None
    agreed_price: float
    status: str
    performance_score: float
    vendor_name: Optional[str] = None
    vendor_category: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Settings Schemas ───────────────────────────────────────────────────────────

class SettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    company_email: Optional[str] = None
    company_phone: Optional[str] = None
    company_address: Optional[str] = None
    logo_url: Optional[str] = None
    currency: Optional[str] = None
    tax_rate: Optional[float] = None
    default_event_type: Optional[str] = None
    notification_email: Optional[bool] = None


class SettingsResponse(BaseModel):
    id: int
    company_name: str
    company_email: str
    company_phone: str
    company_address: str
    logo_url: str
    currency: str
    tax_rate: float
    default_event_type: str
    notification_email: bool
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Chat Schemas ───────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    session_id: str = Field(..., min_length=1)


class ChatMessageResponse(BaseModel):
    id: int
    session_id: str
    role: str
    content: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ChatResponse(BaseModel):
    reply: str
    session_id: str


# ─── Dashboard Schemas ──────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    todays_events: int = 0
    upcoming_events: int = 0
    total_events_this_month: int = 0
    completed_events: int = 0
    cancelled_events: int = 0
    active_vendors: int = 0
    total_revenue: float = 0.0
    total_events: int = 0


class StatusBreakdown(BaseModel):
    status: str
    count: int


class DashboardResponse(BaseModel):
    stats: DashboardStats
    recent_events: List[EventResponse] = []
    status_breakdown: List[StatusBreakdown] = []
