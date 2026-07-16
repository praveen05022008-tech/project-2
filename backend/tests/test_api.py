"""End-to-end API tests for EventoPro. Run: pytest -q (from backend/)."""


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
    # Every role except SUPER_ADMIN may self-register.
    org = client.post("/api/auth/register", json={"email": "neworg@test.com", "password": "secret1", "role": "ORGANIZER"})
    assert org.status_code == 201 and org.json()["role"] == "ORGANIZER"
    stf = client.post("/api/auth/register", json={"email": "newstaff@test.com", "password": "secret1", "role": "STAFF"})
    assert stf.status_code == 201
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


def test_copilot_history_persists(client, organizer):
    client.delete("/api/copilot/history", headers=organizer)
    client.post("/api/copilot", headers=organizer, json={"message": "show my stats"})
    hist = client.get("/api/copilot/history", headers=organizer).json()
    assert len(hist) >= 2 and hist[0]["role"] == "user"
    client.delete("/api/copilot/history", headers=organizer)
    assert client.get("/api/copilot/history", headers=organizer).json() == []


# ─── Per-event scoping (Phase 1) ─────────────────────────────────────────────
def test_my_events_scoped(client, superadmin, staff, attendee):
    sa = client.get("/api/my-events", headers=superadmin).json()
    st = client.get("/api/my-events", headers=staff).json()
    assert len(sa) >= len(st)                       # super admin sees all
    # staff only sees assigned events (fewer than all)
    assert all("id" in e for e in st)


def test_event_access_guard(client, staff, superadmin):
    mine = client.get("/api/my-events", headers=staff).json()
    all_ev = client.get("/api/events", headers=superadmin).json()
    mine_ids = {e["id"] for e in mine}
    outside = next((e["id"] for e in all_ev if e["id"] not in mine_ids), None)
    if outside and mine:
        assert client.get(f"/api/analytics/{mine[0]['id']}", headers=staff).status_code == 200
        assert client.get(f"/api/analytics/{outside}", headers=staff).status_code == 403


# ─── Staff QR attendance (Phase 2) ───────────────────────────────────────────
def test_staff_attendance_flow(client, staff, organizer):
    mine = client.get("/api/my-events", headers=staff).json()
    if not mine:
        return
    eid = mine[0]["id"]
    qr = client.get(f"/api/attendance/qr/{eid}", headers=staff).json()
    assert qr["code"].startswith("ATT-")
    r1 = client.post("/api/attendance/scan", headers=staff, json={"code": qr["code"]}).json()
    assert r1["status"] == "present"
    r2 = client.post("/api/attendance/scan", headers=staff, json={"code": qr["code"]}).json()
    assert r2["status"] == "flagged"                # duplicate → double-verify
    assert client.post("/api/attendance/scan", headers=staff, json={"code": "ATT-999-BADSIG"}).status_code == 400
    roster = client.get(f"/api/attendance/{eid}", headers=organizer).json()
    assert roster["total"] >= 1


# ─── Phase 3/4 portal ────────────────────────────────────────────────────────
def test_vendor_availability_and_gigs(client, vendor):
    r = client.put("/api/portal/my-vendor/availability", headers=vendor, json={"availability": "Available"})
    assert r.status_code == 200 and r.json()["availability"] == "Available"
    gigs = client.get("/api/portal/my-gigs", headers=vendor).json()
    assert "gigs" in gigs and "totals" in gigs


def test_vendor_suggestions_and_sponsors(client, organizer):
    sug = client.get("/api/portal/vendors/suggestions", headers=organizer).json()
    assert isinstance(sug, list)
    assert client.get("/api/portal/sponsors/interested", headers=organizer).status_code == 200


def test_sponsor_interest_flow(client, sponsor, organizer):
    ev = client.get("/api/events", headers=sponsor).json()[0]["id"]
    r = client.post(f"/api/portal/events/{ev}/sponsor-interest", headers=sponsor,
                    json={"company": "TestCo", "contact_phone": "+91 1", "amount": 1000})
    assert r.status_code == 200


def test_qa_flow(client, attendee, organizer):
    ev = client.get("/api/events", headers=attendee).json()[0]["id"]
    assert client.post("/api/portal/qa", headers=attendee, json={"event_id": ev, "question": "Parking?"}).status_code == 201
    qs = client.get(f"/api/portal/qa/{ev}", headers=attendee).json()
    assert qs and qs[0]["question"]
    assert client.post(f"/api/portal/qa/{qs[0]['id']}/answer", headers=organizer, json={"answer": "Yes"}).status_code == 200
    # attendee cannot answer
    assert client.post(f"/api/portal/qa/{qs[0]['id']}/answer", headers=attendee, json={"answer": "x"}).status_code == 403


def test_attendee_list_manager_only(client, organizer, attendee):
    ev = client.get("/api/events", headers=organizer).json()[0]["id"]
    assert client.get(f"/api/portal/events/{ev}/attendees", headers=organizer).status_code == 200
    assert client.get(f"/api/portal/events/{ev}/attendees", headers=attendee).status_code == 403


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


# ─── Directory side-panels (Available Sponsors / Active Organisers) ───────────
def test_directory_sponsors_organizer(client, organizer, sponsor):
    r = client.get("/api/directory/sponsors", headers=organizer)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 1
    assert {"company_name", "category", "budget", "location", "availability"} <= set(rows[0].keys())
    # only available-or-interested surface (no purely "Not Available" sponsor)
    assert all(x["availability"] != "Not Available" or x["interested"] for x in rows)
    # sponsors cannot browse the sponsor directory
    assert client.get("/api/directory/sponsors", headers=sponsor).status_code == 403


def test_directory_sponsors_search_and_filter(client, organizer):
    assert all("tech" in (x["company_name"] + x["category"] + x["location"]).lower()
               for x in client.get("/api/directory/sponsors?q=tech", headers=organizer).json())
    fin = client.get("/api/directory/sponsors?category=Finance", headers=organizer).json()
    assert all(x["category"] == "Finance" for x in fin)


def test_directory_sponsorship_request(client, organizer):
    email = client.get("/api/directory/sponsors", headers=organizer).json()[0]["email"]
    r = client.post(f"/api/directory/sponsors/{email}/request", headers=organizer,
                    json={"event_id": None, "message": "Join us"})
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_directory_organisers_sponsor(client, sponsor, organizer):
    r = client.get("/api/directory/organisers", headers=sponsor)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 1
    assert {"organiser_name", "organisation", "event_name", "event_category",
            "event_date", "location", "event_status"} <= set(rows[0].keys())
    # only active (Upcoming / In Progress) events surface
    assert all(x["event_status"] in ("Upcoming", "In Progress") for x in rows)
    # organizers cannot browse the organiser directory
    assert client.get("/api/directory/organisers", headers=organizer).status_code == 403


def test_directory_collaborate(client, sponsor):
    eid = client.get("/api/directory/organisers", headers=sponsor).json()[0]["event_id"]
    r = client.post(f"/api/directory/organisers/{eid}/collaborate", headers=sponsor,
                    json={"amount": 50000, "message": "Let's collaborate"})
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_directory_my_profile(client, sponsor):
    assert client.get("/api/directory/my-profile", headers=sponsor).status_code == 200
    r = client.put("/api/directory/my-profile", headers=sponsor,
                   json={"availability": "Open to offers", "budget": 999999})
    assert r.status_code == 200
    body = r.json()
    assert body["availability"] == "Open to offers" and body["budget"] == 999999
    # invalid availability rejected
    assert client.put("/api/directory/my-profile", headers=sponsor,
                      json={"availability": "Whenever"}).status_code == 400
