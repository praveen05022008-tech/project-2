"""Per-event participation scoping — which events a user may see, by role.

Returns None to mean "all events" (Super Admin). Otherwise a list of event IDs
the user participates in:
  ORGANIZER → events in their tenant
  STAFF     → events they're assigned to (EventStaff)
  VENDOR    → events their vendor profile is booked for (EventVendor)
  SPONSOR   → events they sponsor (EventSponsor)
  ATTENDEE  → events they hold a ticket for
"""
from app.models import Event, EventVendor, EventStaff, EventSponsor, Vendor, Ticket


def user_event_ids(db, user):
    role = user.role
    if role == "SUPER_ADMIN":
        return None  # all events

    if role == "ORGANIZER":
        q = db.query(Event.id)
        if user.tenant_id is not None:
            q = q.filter(Event.tenant_id == user.tenant_id)
        return [r[0] for r in q.all()]

    if role == "STAFF":
        return [r[0] for r in db.query(EventStaff.event_id).filter(EventStaff.staff_email == user.email).all()]

    if role == "VENDOR":
        vendor = db.query(Vendor).filter(Vendor.user_id == user.id).first()
        if not vendor:
            return []
        return [r[0] for r in db.query(EventVendor.event_id).filter(EventVendor.vendor_id == vendor.id).all()]

    if role == "SPONSOR":
        return [r[0] for r in db.query(EventSponsor.event_id).filter(EventSponsor.sponsor_email == user.email).all()]

    if role == "ATTENDEE":
        return [r[0] for r in db.query(Ticket.event_id).filter(Ticket.attendee_email == user.email).distinct().all()]

    return []


def scope_query_to_user(query, user, db):
    """Apply participation scoping to an Event query. Super Admin unrestricted."""
    ids = user_event_ids(db, user)
    if ids is None:
        return query
    if not ids:
        return query.filter(Event.id.in_([-1]))  # none
    return query.filter(Event.id.in_(ids))


def can_access_event(db, user, event_id) -> bool:
    ids = user_event_ids(db, user)
    return ids is None or event_id in ids
