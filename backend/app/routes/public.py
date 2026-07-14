"""Public, unauthenticated endpoints: browse events + guest ticket checkout.
Powers shareable public event pages (/e/{id}). Payment security is enforced by
the gateway (Razorpay signature verify); simulated mode is for demo only.
"""
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from datetime import date

from app.database import get_db
from app.models import Event, TicketType, Order
from app import payments
from app.routes.orders import _finalize_paid_order

router = APIRouter(prefix="/api/public", tags=["Public"])


def _pub_event(e: Event, with_desc=False):
    d = {
        "id": e.id, "title": e.title, "event_type": e.event_type, "status": e.status,
        "venue": e.venue, "event_date": e.event_date.isoformat() if e.event_date else None,
        "start_time": e.start_time, "end_time": e.end_time,
    }
    if with_desc:
        d["description"] = e.description
    return d


@router.get("/events")
def public_events(db: Session = Depends(get_db)):
    """Upcoming/in-progress events open to the public."""
    today = date.today()
    events = db.query(Event).filter(
        Event.status.in_(["Upcoming", "In Progress"]), Event.event_date >= today
    ).order_by(Event.event_date).limit(100).all()
    return [_pub_event(e) for e in events]


@router.get("/events/{event_id}")
def public_event_detail(event_id: int, db: Session = Depends(get_db)):
    e = db.query(Event).filter(Event.id == event_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    tiers = db.query(TicketType).filter(
        TicketType.event_id == event_id, TicketType.is_active == True
    ).all()
    return {
        "event": _pub_event(e, with_desc=True),
        "ticket_types": [{
            "id": t.id, "name": t.name, "description": t.description, "price": t.price,
            "remaining": (None if t.quantity_total == 0 else max(0, t.quantity_total - t.quantity_sold)),
        } for t in tiers],
    }


@router.get("/payment-config")
def public_payment_config():
    return {"provider": payments.provider(), "key_id": payments.public_key()}


class PublicOrderIn(BaseModel):
    ticket_type_id: int
    quantity: int = Field(1, ge=1, le=20)
    buyer_name: str = Field(..., min_length=1, max_length=255)
    buyer_email: EmailStr


@router.post("/orders", status_code=201)
def public_create_order(data: PublicOrderIn, db: Session = Depends(get_db)):
    tt = db.query(TicketType).filter(TicketType.id == data.ticket_type_id, TicketType.is_active == True).first()
    if not tt:
        raise HTTPException(status_code=404, detail="Ticket type not available")
    if tt.quantity_total and (tt.quantity_sold + data.quantity) > tt.quantity_total:
        raise HTTPException(status_code=400, detail="Not enough tickets remaining")

    order = Order(
        event_id=tt.event_id, ticket_type_id=tt.id,
        buyer_email=data.buyer_email, buyer_name=data.buyer_name,
        quantity=data.quantity, unit_price=tt.price,
        total_amount=round(tt.price * data.quantity, 2), status="PENDING",
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    if payments.razorpay_enabled():
        gid = payments.create_gateway_order(order.total_amount, receipt=f"pub_{order.id}")
        if gid:
            order.gateway_order_id = gid
            db.commit()
            db.refresh(order)

    return {
        "order_id": order.id, "total_amount": order.total_amount,
        "payment": {
            "provider": payments.provider(), "key_id": payments.public_key(),
            "gateway_order_id": order.gateway_order_id,
            "amount": int(round(order.total_amount * 100)), "currency": "INR",
            "buyer_email": order.buyer_email,
        },
    }


def _get_pending(db, order_id):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == "PAID":
        raise HTTPException(status_code=400, detail="Order already paid")
    return order


@router.post("/orders/{order_id}/pay")
def public_pay(order_id: int, db: Session = Depends(get_db)):
    """Simulated checkout (only when no real gateway is configured)."""
    if payments.razorpay_enabled():
        raise HTTPException(status_code=400, detail="Use Razorpay checkout + /verify")
    order = _get_pending(db, order_id)
    return _finalize_paid_order(db, order, "SIMPAY-" + secrets.token_hex(6).upper())


class PublicVerify(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str


@router.post("/orders/{order_id}/verify")
def public_verify(order_id: int, req: PublicVerify, db: Session = Depends(get_db)):
    order = _get_pending(db, order_id)
    if req.razorpay_order_id != (order.gateway_order_id or ""):
        raise HTTPException(status_code=400, detail="Order/payment mismatch")
    if not payments.verify_signature(order.gateway_order_id, req.razorpay_payment_id, req.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment verification failed")
    return _finalize_paid_order(db, order, req.razorpay_payment_id)
