"""Commerce: ticket tiers, orders, (simulated) payment, ticket issuance, revenue.

Payment here is a SIMULATED gateway so the flow is complete end-to-end without
external keys. The `pay` step is exactly where a real Stripe/Razorpay webhook
would confirm payment — swap `_simulate_capture` for the real capture call.
"""
import secrets
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models import TicketType, Order, Ticket, Event, User
from app.routes.checkin import _gen_code
from app.integrations import fire_webhook
from app import payments

router = APIRouter(prefix="/api/commerce", tags=["Commerce"])

manage_roles = require_roles("SUPER_ADMIN", "ORGANIZER")
staff_roles = require_roles("SUPER_ADMIN", "ORGANIZER", "STAFF")


# ─── Schemas ─────────────────────────────────────────────────────────────────
class TicketTypeIn(BaseModel):
    event_id: int
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    price: float = Field(0, ge=0)
    quantity_total: int = Field(0, ge=0)   # 0 = unlimited


class TicketTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = Field(None, ge=0)
    quantity_total: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class OrderIn(BaseModel):
    ticket_type_id: int
    quantity: int = Field(1, ge=1, le=20)
    buyer_name: Optional[str] = None


def _tt_dict(tt: TicketType):
    remaining = None if tt.quantity_total == 0 else max(0, tt.quantity_total - tt.quantity_sold)
    return {
        "id": tt.id, "event_id": tt.event_id, "name": tt.name, "description": tt.description,
        "price": tt.price, "quantity_total": tt.quantity_total, "quantity_sold": tt.quantity_sold,
        "remaining": remaining, "is_active": tt.is_active,
    }


def _order_dict(o: Order):
    return {
        "id": o.id, "event_id": o.event_id, "ticket_type_id": o.ticket_type_id,
        "buyer_email": o.buyer_email, "buyer_name": o.buyer_name, "quantity": o.quantity,
        "unit_price": o.unit_price, "total_amount": o.total_amount, "status": o.status,
        "payment_ref": o.payment_ref, "gateway_order_id": o.gateway_order_id,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    }


# ─── Ticket types ────────────────────────────────────────────────────────────
@router.get("/ticket-types")
def list_ticket_types(event_id: int = Query(...), db: Session = Depends(get_db)):
    tiers = db.query(TicketType).filter(
        TicketType.event_id == event_id, TicketType.is_active == True
    ).all()
    return [_tt_dict(t) for t in tiers]


@router.post("/ticket-types", status_code=201, dependencies=[Depends(manage_roles)])
def create_ticket_type(data: TicketTypeIn, db: Session = Depends(get_db)):
    if not db.query(Event).filter(Event.id == data.event_id).first():
        raise HTTPException(status_code=404, detail="Event not found")
    tt = TicketType(**data.model_dump())
    db.add(tt)
    db.commit()
    db.refresh(tt)
    return _tt_dict(tt)


@router.put("/ticket-types/{tt_id}", dependencies=[Depends(manage_roles)])
def update_ticket_type(tt_id: int, data: TicketTypeUpdate, db: Session = Depends(get_db)):
    tt = db.query(TicketType).filter(TicketType.id == tt_id).first()
    if not tt:
        raise HTTPException(status_code=404, detail="Ticket type not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(tt, k, v)
    db.commit()
    db.refresh(tt)
    return _tt_dict(tt)


@router.delete("/ticket-types/{tt_id}", dependencies=[Depends(manage_roles)])
def delete_ticket_type(tt_id: int, db: Session = Depends(get_db)):
    tt = db.query(TicketType).filter(TicketType.id == tt_id).first()
    if not tt:
        raise HTTPException(status_code=404, detail="Ticket type not found")
    tt.is_active = False   # soft delete to preserve order history
    db.commit()
    return {"message": "Ticket type removed", "id": tt_id}


# ─── Orders & payment ────────────────────────────────────────────────────────
@router.post("/orders", status_code=201)
def create_order(data: OrderIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a PENDING order (reserves nothing until paid)."""
    tt = db.query(TicketType).filter(TicketType.id == data.ticket_type_id, TicketType.is_active == True).first()
    if not tt:
        raise HTTPException(status_code=404, detail="Ticket type not available")

    if tt.quantity_total and (tt.quantity_sold + data.quantity) > tt.quantity_total:
        raise HTTPException(status_code=400, detail="Not enough tickets remaining")

    order = Order(
        event_id=tt.event_id,
        ticket_type_id=tt.id,
        buyer_email=current_user.email,
        buyer_name=data.buyer_name,
        quantity=data.quantity,
        unit_price=tt.price,
        total_amount=round(tt.price * data.quantity, 2),
        status="PENDING",
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    # If a real gateway is configured, create a gateway order to pay against.
    if payments.razorpay_enabled():
        gid = payments.create_gateway_order(order.total_amount, receipt=f"order_{order.id}")
        if gid:
            order.gateway_order_id = gid
            db.commit()
            db.refresh(order)

    resp = _order_dict(order)
    resp["payment"] = {
        "provider": payments.provider(),
        "key_id": payments.public_key(),
        "gateway_order_id": order.gateway_order_id,
        "amount": int(round(order.total_amount * 100)),  # paise
        "currency": "INR",
        "buyer_email": order.buyer_email,
    }
    return resp


@router.get("/payment-config")
def payment_config():
    """Tells the frontend which checkout flow to use."""
    return {"provider": payments.provider(), "key_id": payments.public_key()}


def _finalize_paid_order(db: Session, order: Order, payment_ref: str):
    """Mark an order PAID, decrement stock, issue tickets, fire webhook."""
    tt = db.query(TicketType).filter(TicketType.id == order.ticket_type_id).first()
    if tt and tt.quantity_total and (tt.quantity_sold + order.quantity) > tt.quantity_total:
        raise HTTPException(status_code=400, detail="Tickets sold out")

    order.payment_ref = payment_ref
    order.status = "PAID"
    if tt:
        tt.quantity_sold += order.quantity

    issued = []
    for _ in range(order.quantity):
        t = Ticket(
            code=_gen_code(db), event_id=order.event_id,
            attendee_email=order.buyer_email, attendee_name=order.buyer_name,
            tier=tt.name if tt else None, order_id=order.id,
        )
        db.add(t)
        db.flush()
        issued.append(t.code)

    db.commit()

    fire_webhook("order.paid", {
        "order_id": order.id, "event_id": order.event_id, "buyer_email": order.buyer_email,
        "quantity": order.quantity, "amount": order.total_amount, "tickets": issued,
    })

    # In-app notification to the event's organizers.
    try:
        from app.routes.notifications import push_notification
        ev = db.query(Event).filter(Event.id == order.event_id).first()
        push_notification(
            title="New ticket sale",
            message=f"{order.quantity} ticket(s) sold for {ev.title if ev else 'an event'} (₹{order.total_amount:,.0f}).",
            level="success", target_role="ORGANIZER",
            target_tenant_id=(ev.tenant_id if ev else None),
        )
    except Exception:
        pass

    return {"status": "PAID", "payment_ref": order.payment_ref, "tickets": issued, "order": _order_dict(order)}


def _authz_order(order, current_user):
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.buyer_email != current_user.email and current_user.role not in ("SUPER_ADMIN", "ORGANIZER"):
        raise HTTPException(status_code=403, detail="You can only pay for your own order")
    if order.status == "PAID":
        raise HTTPException(status_code=400, detail="Order already paid")


@router.post("/orders/{order_id}/pay")
def pay_order(order_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Simulated-gateway payment (used when no real gateway is configured)."""
    if payments.razorpay_enabled():
        raise HTTPException(status_code=400, detail="Use the Razorpay checkout + /verify for this order")
    order = db.query(Order).filter(Order.id == order_id).first()
    _authz_order(order, current_user)
    return _finalize_paid_order(db, order, "SIMPAY-" + secrets.token_hex(6).upper())


class VerifyRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str


@router.post("/orders/{order_id}/verify")
def verify_order(order_id: int, req: VerifyRequest,
                 current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Verify a Razorpay payment signature → issue tickets."""
    order = db.query(Order).filter(Order.id == order_id).first()
    _authz_order(order, current_user)
    if req.razorpay_order_id != (order.gateway_order_id or ""):
        raise HTTPException(status_code=400, detail="Order/payment mismatch")
    if not payments.verify_signature(order.gateway_order_id, req.razorpay_payment_id, req.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment verification failed")
    return _finalize_paid_order(db, order, req.razorpay_payment_id)


@router.get("/my-orders")
def my_orders(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    orders = db.query(Order).filter(Order.buyer_email == current_user.email).order_by(Order.created_at.desc()).all()
    return [_order_dict(o) for o in orders]


@router.get("/orders", dependencies=[Depends(staff_roles)])
def list_orders(event_id: Optional[int] = None, status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Order)
    if event_id:
        q = q.filter(Order.event_id == event_id)
    if status:
        q = q.filter(Order.status == status.upper())
    return [_order_dict(o) for o in q.order_by(Order.created_at.desc()).limit(500).all()]


@router.get("/revenue")
def revenue(event_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Real ticket revenue from PAID orders."""
    q = db.query(func.coalesce(func.sum(Order.total_amount), 0.0)).filter(Order.status == "PAID")
    tickets_q = db.query(func.coalesce(func.sum(Order.quantity), 0)).filter(Order.status == "PAID")
    if event_id:
        q = q.filter(Order.event_id == event_id)
        tickets_q = tickets_q.filter(Order.event_id == event_id)
    return {"event_id": event_id, "ticket_revenue": float(q.scalar() or 0), "tickets_sold": int(tickets_q.scalar() or 0)}
