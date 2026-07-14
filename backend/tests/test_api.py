"""End-to-end API tests for EventPro. Run: pytest -q (from backend/)."""


# ─── Health & Auth ───────────────────────────────────────────────────────────
def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "healthy" and body["database"] == "up"


def test_login_success(client):
    r = client.post("/api/auth/login", json={"email": "superadmin@eventpro.com", "password": "password123"})
    assert r.status_code == 200 and r.json()["access_token"]


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"email": "superadmin@eventpro.com", "password": "nope"})
    assert r.status_code == 401


def test_me(client, organizer):
    r = client.get("/api/auth/me", headers=organizer)
    assert r.status_code == 200 and r.json()["role"] == "ORGANIZER"


def test_unauthenticated_blocked(client):
    assert client.get("/api/events").status_code == 401


def test_register_role_restriction(client):
    ok = client.post("/api/auth/register", json={"email": "newattendee@test.com", "password": "secret1", "role": "ATTENDEE"})
    assert ok.status_code == 201
    bad = client.post("/api/auth/register", json={"email": "hacker@test.com", "password": "secret1", "role": "SUPER_ADMIN"})
    assert bad.status_code == 403


# ─── Events: read for all, write role-gated ──────────────────────────────────
def test_events_read_any_role(client, attendee):
    assert client.get("/api/events", headers=attendee).status_code == 200


def test_events_create_forbidden_for_attendee(client, attendee):
    r = client.post("/api/events", headers=attendee,
                    json={"title": "X", "client_name": "Y", "event_date": "2027-01-01"})
    assert r.status_code == 403


def test_events_crud_organizer(client, organizer):
    r = client.post("/api/events", headers=organizer,
                    json={"title": "Test Gala", "client_name": "QA", "event_date": "2027-02-02", "budget": 1000})
    assert r.status_code == 201
    eid = r.json()["id"]
    up = client.put(f"/api/events/{eid}", headers=organizer, json={"status": "Completed"})
    assert up.status_code == 200 and up.json()["status"] == "Completed"
    assert client.delete(f"/api/events/{eid}", headers=organizer).status_code == 200


# ─── Multi-tenant isolation ──────────────────────────────────────────────────
def test_tenant_isolation_lists(client, organizer, organizer2, superadmin, attendee):
    a = client.get("/api/events", headers=organizer).json()
    b = client.get("/api/events", headers=organizer2).json()
    sa = client.get("/api/events", headers=superadmin).json()
    att = client.get("/api/events", headers=attendee).json()
    a_titles = {e["title"] for e in a}
    b_titles = {e["title"] for e in b}
    assert a_titles.isdisjoint(b_titles)           # no overlap between tenants
    assert len(sa) >= len(a) + len(b)              # super admin sees everything
    assert len(att) == len(sa)                     # attendees browse globally


def test_tenant_cross_edit_forbidden(client, organizer, organizer2):
    b_events = client.get("/api/events", headers=organizer2).json()
    r = client.put(f"/api/events/{b_events[0]['id']}", headers=organizer, json={"status": "Cancelled"})
    assert r.status_code == 403


# ─── Vendors: write is admin/organizer only ──────────────────────────────────
def test_vendor_create_forbidden_for_staff(client, staff):
    r = client.post("/api/vendors", headers=staff, json={"name": "Sneaky"})
    assert r.status_code == 403


def test_vendor_crud_organizer(client, organizer):
    r = client.post("/api/vendors", headers=organizer, json={"name": "QA Vendor", "category": "Catering"})
    assert r.status_code == 201
    vid = r.json()["id"]
    assert client.delete(f"/api/vendors/{vid}", headers=organizer).status_code == 200


# ─── Settings: write role-gated ──────────────────────────────────────────────
def test_settings_update_forbidden_for_sponsor(client, sponsor):
    assert client.put("/api/settings", headers=sponsor, json={"company_name": "Hacked"}).status_code == 403


# ─── Role dashboards ─────────────────────────────────────────────────────────
def test_role_view_all_roles(client, superadmin, organizer, staff, vendor, sponsor, attendee):
    for h in (superadmin, organizer, staff, vendor, sponsor, attendee):
        d = client.get("/api/dashboard/role-view", headers=h).json()
        assert d["cards"] and "heading" in d


def test_role_view_vendor_personalized(client, vendor):
    d = client.get("/api/dashboard/role-view", headers=vendor).json()
    assert "Vendor Portal" in d["heading"]


# ─── Check-in / QR ───────────────────────────────────────────────────────────
def test_attendee_gets_ticket(client, attendee, upcoming_event_id):
    r = client.get(f"/api/checkin/my-ticket/{upcoming_event_id}", headers=attendee)
    assert r.status_code == 200 and r.json()["code"].startswith("FP-")


def test_scan_permission_and_live(client, staff, attendee, upcoming_event_id):
    before = client.get(f"/api/checkin/live/{upcoming_event_id}", headers=staff).json()["total_entries"]
    ok = client.post("/api/checkin/scan", headers=staff,
                     json={"event_id": upcoming_event_id, "scan_type": "ENTRY", "zone": "Gate A"})
    assert ok.status_code == 200
    after = client.get(f"/api/checkin/live/{upcoming_event_id}", headers=staff).json()["total_entries"]
    assert after == before + 1
    # attendee cannot scan
    assert client.post("/api/checkin/scan", headers=attendee,
                       json={"event_id": upcoming_event_id, "scan_type": "ENTRY"}).status_code == 403


# ─── Commerce ────────────────────────────────────────────────────────────────
def test_commerce_purchase_flow(client, attendee, upcoming_event_id):
    tiers = client.get(f"/api/commerce/ticket-types?event_id={upcoming_event_id}", headers=attendee).json()
    assert tiers, "expected seeded ticket tiers"
    order = client.post("/api/commerce/orders", headers=attendee,
                        json={"ticket_type_id": tiers[0]["id"], "quantity": 2}).json()
    assert order["status"] == "PENDING" and order["total_amount"] == tiers[0]["price"] * 2
    paid = client.post(f"/api/commerce/orders/{order['id']}/pay", headers=attendee).json()
    assert paid["status"] == "PAID" and len(paid["tickets"]) == 2


def test_commerce_tier_create_forbidden_for_attendee(client, attendee, upcoming_event_id):
    r = client.post("/api/commerce/ticket-types", headers=attendee,
                    json={"event_id": upcoming_event_id, "name": "Hack", "price": 0})
    assert r.status_code == 403


def test_commerce_revenue(client, organizer):
    r = client.get("/api/commerce/revenue", headers=organizer).json()
    assert r["ticket_revenue"] >= 0 and r["tickets_sold"] >= 0


def test_payment_config_simulated_in_ci(client, attendee):
    # No Razorpay keys in CI → simulated provider, and /pay works (covered above).
    cfg = client.get("/api/commerce/payment-config", headers=attendee).json()
    assert cfg["provider"] == "simulated"


# ─── Admin user management ───────────────────────────────────────────────────
def test_users_list_superadmin_only(client, superadmin, organizer):
    assert client.get("/api/users", headers=superadmin).status_code == 200
    assert client.get("/api/users", headers=organizer).status_code == 403


def test_users_crud_and_guards(client, superadmin):
    r = client.post("/api/users", headers=superadmin,
                    json={"email": "tempuser@test.com", "password": "secret1", "role": "STAFF"})
    assert r.status_code == 201
    uid = r.json()["id"]
    assert client.put(f"/api/users/{uid}", headers=superadmin, json={"role": "VENDOR"}).json()["role"] == "VENDOR"
    assert client.delete(f"/api/users/{uid}", headers=superadmin).status_code == 200
    # cannot delete the last super admin
    admins = [u for u in client.get("/api/users", headers=superadmin).json() if u["role"] == "SUPER_ADMIN"]
    if len(admins) == 1:
        assert client.delete(f"/api/users/{admins[0]['id']}", headers=superadmin).status_code == 400


# ─── Intelligence endpoints ──────────────────────────────────────────────────
def test_budget_analysis(client, organizer, first_event_id):
    a = client.get(f"/api/budget/analysis/{first_event_id}", headers=organizer).json()
    for k in ("status", "projected_final_cost", "utilization_pct", "breakdown", "recommendations"):
        assert k in a


def test_analytics(client, organizer, first_event_id):
    a = client.get(f"/api/analytics/{first_event_id}", headers=organizer).json()
    for k in ("predicted_final_attendance", "attendance_health", "marketing_roi_score", "funnel"):
        assert k in a


def test_reports(client, organizer, first_event_id):
    r = client.get(f"/api/reports/post-event/{first_event_id}", headers=organizer).json()
    for k in ("actual_total_cost", "attendance_rate_pct", "sponsor_roi_percentage", "key_successes"):
        assert k in r


# ─── Audit ───────────────────────────────────────────────────────────────────
def test_audit_superadmin_only(client, superadmin, organizer):
    assert client.get("/api/audit-logs", headers=superadmin).status_code == 200
    assert client.get("/api/audit-logs", headers=organizer).status_code == 403


# ─── Public pages + guest checkout ───────────────────────────────────────────
def test_public_events_no_auth(client):
    r = client.get("/api/public/events")   # no Authorization header
    assert r.status_code == 200 and isinstance(r.json(), list)


def test_public_guest_purchase(client):
    events = client.get("/api/public/events").json()
    assert events, "expected public events"
    detail = client.get(f"/api/public/events/{events[0]['id']}").json()
    tiers = detail["ticket_types"]
    assert tiers
    order = client.post("/api/public/orders", json={
        "ticket_type_id": tiers[0]["id"], "quantity": 1,
        "buyer_name": "Guest", "buyer_email": "guest@example.com",
    }).json()
    paid = client.post(f"/api/public/orders/{order['order_id']}/pay", json={}).json()
    assert paid["status"] == "PAID" and paid["tickets"]


# ─── Feedback ────────────────────────────────────────────────────────────────
def test_feedback_submit_and_summary(client, attendee, organizer, first_event_id):
    r = client.post("/api/feedback", headers=attendee,
                    json={"event_id": first_event_id, "rating": 5, "comment": "Great event!"})
    assert r.status_code == 201
    s = client.get(f"/api/feedback/{first_event_id}/summary", headers=organizer).json()
    assert s["count"] >= 1 and s["average_rating"] > 0 and "sentiment" in s
    # attendees cannot read the manager summary
    assert client.get(f"/api/feedback/{first_event_id}/summary", headers=attendee).status_code == 403


# ─── Notifications ───────────────────────────────────────────────────────────
def test_notifications_flow(client, organizer, attendee):
    created = client.post("/api/notifications", headers=organizer,
                          json={"title": "Test announcement", "message": "Hi", "level": "info", "target_role": "ATTENDEE"})
    assert created.status_code == 201
    items = client.get("/api/notifications", headers=attendee).json()
    assert any(n["title"] == "Test announcement" for n in items)
    # attendees cannot broadcast
    assert client.post("/api/notifications", headers=attendee, json={"title": "x"}).status_code == 403


# ─── Copilot ─────────────────────────────────────────────────────────────────
def test_copilot_stats(client, organizer, attendee):
    r = client.post("/api/copilot", headers=organizer, json={"message": "show my stats"})
    assert r.status_code == 200 and r.json()["action"] in ("get_stats", "answer")
    # copilot is a manager tool
    assert client.post("/api/copilot", headers=attendee, json={"message": "hi"}).status_code == 403


# ─── Admin backup ────────────────────────────────────────────────────────────
def test_backup_superadmin_only(client, superadmin, organizer):
    r = client.get("/api/admin/backup", headers=superadmin)
    assert r.status_code == 200
    body = r.json()
    assert "tables" in body and "users" in body["tables"] and body["counts"]["users"] >= 6
    assert client.get("/api/admin/backup", headers=organizer).status_code == 403


def test_audit_records_actions(client, superadmin, organizer):
    # generate an auditable action
    client.post("/api/events", headers=organizer,
                json={"title": "Audit Probe", "client_name": "QA", "event_date": "2027-03-03"})
    logs = client.get("/api/audit-logs?limit=50", headers=superadmin).json()["logs"]
    assert any("event" in (l["action"] or "").lower() for l in logs)
