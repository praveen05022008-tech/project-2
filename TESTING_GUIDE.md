# EventPro — Complete Testing Guide

A step-by-step guide to test **every role** and **every tab**. Follow it top to
bottom the first time; afterwards use the per-role sections as a checklist.

---

## 1. Start the app

**Database:** the app uses your **TiDB Cloud** database (configured in
`backend/.env` → `DATABASE_URL`). All data you see is live from TiDB.

```bash
cd backend
pip install -r requirements.txt          # first time only
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then open **http://localhost:8000/** in a browser. The FastAPI server serves both
the API and the frontend.

> **Local-only option (no TiDB):** run `python run_dev.py` instead. It uses a
> throwaway local SQLite file so you can test offline. Run `python seed_data.py`
> once first to populate it.

> **Tip:** add a fixed `SECRET_KEY` to `backend/.env` (e.g.
> `python -c "import secrets;print(secrets.token_urlsafe(48))"`). Without it,
> every server restart logs everyone out.

---

## 2. Login credentials

All six accounts share the password **`password123`**. On the login page you can
either type the email or click a **Quick Demo Login** button.

| Role | Email |
|------|-------|
| Super Admin | `superadmin@eventpro.com` |
| Organizer | `organizer@eventpro.com` |
| Staff | `staff@eventpro.com` |
| Vendor | `vendor@eventpro.com` |
| Sponsor | `sponsor@eventpro.com` |
| Attendee | `attendee@eventpro.com` |

**Test the login itself:**
1. Enter a wrong password → you should see a red "Incorrect email or password" toast.
2. Click the 👁 icon in the password box → password becomes visible.
3. Click any demo button → you're logged straight into that role's dashboard.
4. Click the logout icon (bottom-left) → you return to the login screen.

---

## 3. Which tabs each role can see

The sidebar is built dynamically from your role. This is the expected visibility:

| Tab | Super Admin | Organizer | Staff | Vendor | Sponsor | Attendee |
|-----|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Command Center | ✅ | ✅ | ✅ | — | — | — |
| Budget AI | ✅ | ✅ | — | — | — | — |
| Analytics | ✅ | ✅ | — | ✅ | ✅ | — |
| Reports | ✅ | ✅ | — | — | ✅ | — |
| Events | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Vendors | ✅ | ✅ | — | — | — | — |
| AI Center | ✅ | ✅ | — | — | — | ✅ |
| Audit Logs | ✅ | — | — | — | — | — |
| Settings | ✅ | ✅ | — | — | — | — |

> **First quick test:** log in as each role and confirm the sidebar shows exactly
> the ticked tabs above — nothing more.

Behind the scenes the **backend also enforces permissions**, so even if someone
bypasses the UI, protected actions are blocked (see §10).

---

## 4. Super Admin — full walkthrough

Login: `superadmin@eventpro.com`. Sees **all 9 tabs**.

### Dashboard
- **Expect:** "Super Admin · Platform Overview" with 4 live cards — Total Accounts
  (**6**), Events Managed (**8**), Active Vendors (**5**), Revenue Tracked
  (**≈₹72.5L**) — plus a "Recent Account Signups" table listing the 6 users.
- **Test:** every number is pulled live from TiDB. If you add an event in the
  Events tab and come back, "Events Managed" increases.

### Events
- See §8 (full CRUD walkthrough). Super Admin can create/edit/delete freely.

### Vendors
- See §9. Super Admin can add/edit/delete vendors.

### Audit Logs (Super Admin only)
- **Expect:** an "Audit Trail" page with a total count, filters (role, action type,
  search), and a table of **every state-changing action by every role** — newest
  first: time, user, role, action, method, status.
- **Test it live:**
  1. In another browser/incognito, log in as **Organizer** and create an event.
  2. Log in as **Attendee** and try to create an event (it's denied).
  3. Back on the Super Admin **Audit Logs** tab, click **Refresh** — you'll see:
     - `ORGANIZER … Created event … 201`
     - `ATTENDEE … Created event … 403` (the **denied attempt** is recorded)
     - `… Logged in … 200` entries, and any `Failed login attempt … 401`.
  4. Filter by role (e.g. VENDOR) or method (e.g. DELETE) to narrow the trail.
- **What's captured:** logins (success + failure), registrations, and all
  create/update/delete actions on events, vendors, settings, assignments, live
  metrics, and AI chat — including who did it, when, from which IP, and whether it
  succeeded or was blocked. (Read-only page views are intentionally not logged, to
  keep the trail focused on actions.)

### Command Center / Budget AI / Analytics / Reports / AI Center / Settings
- Same behaviour as described in §6, §8, §9, §11. Super Admin has access to all.

---

## 5. Organizer — full walkthrough

Login: `organizer@eventpro.com`. Sees **all 9 tabs** (operational owner).

### Dashboard
- **Expect:** the main operational dashboard — stat cards (Today's / Upcoming /
  This Month / Completed / Active Vendors / Total Revenue) and a **Recent Events**
  table with real events, status badges, and budgets.
- **Test:** click **View All** → jumps to the Events tab.

### All other tabs
- Organizer has the same full access as Super Admin for day-to-day work: manage
  Events, Vendors, Settings; use Budget AI, Analytics, Reports, Command Center,
  AI Center. Walk through §6–§11 as this role.

---

## 6. Staff — full walkthrough

Login: `staff@eventpro.com`. Sees **Dashboard, Command Center, Events**.

### Dashboard
- **Expect:** "Staff Command View" with 4 live cards — Upcoming Events,
  In Progress, Pending Confirmations, Confirmed Vendors — an "Upcoming Events"
  table, and a **"Next Up"** note highlighting the nearest event.
- **Test:** confirm the numbers reflect real events (compare with the Events tab).

### Command Center
1. **Expect:** an **event picker** dropdown at the top (choose which event to
   monitor), four traffic-light health cards (Crowd / Food / Vendors / Overall),
   and live metric panels.
2. Change the event in the dropdown → the panel reloads for that event.
3. Click **Update Metrics** → a modal opens; change crowd/food/staff values and
   save → the health lights update.
4. Click **Force Refresh** → metrics refetch. The page also auto-refreshes every
   10 seconds.
5. If a Cerebras API key is set, an AI risk analysis appears; otherwise you'll see
   a "not configured" note (this is expected without a key).

### Events
- Staff **can view and edit** events and assign vendors (see §8), but **cannot**
  manage the vendor directory or settings (those tabs aren't shown, and the API
  blocks them).

---

## 7. Vendor — full walkthrough

Login: `vendor@eventpro.com`. Sees **Dashboard, Events, Analytics**.

### Dashboard (personalized!)
- **Expect:** "Vendor Portal · Royal Cuisine Catering" — this account is linked to
  a real vendor profile. Cards: Active Gigs (**2**), Contracted Value (**₹7.0L**),
  Rating (**4.8/5**), Confirmed (**2/2**), plus a table of **their** assignments
  (event, date, role, value, status).
- **Test:** this data is specific to the linked vendor. If an organizer assigns
  this vendor to another event (Events → vendors), the vendor's dashboard reflects
  it.

### Events
- Vendor can **view** events (read-only). They will **not** be able to create or
  delete (the API returns 403 — see §10).

### Analytics
- See §8's Analytics description (read-only insight into an event's attendance/
  marketing prediction).

---

## 8. Sponsor — full walkthrough

Login: `sponsor@eventpro.com`. Sees **Dashboard, Analytics, Reports**.

### Dashboard
- **Expect:** "Sponsor ROI Dashboard" with live cards — Sponsored Events (**8**),
  Marketing Spend (**≈₹18.7L**), Avg Expected ROI (**≈3.2x**), Total Reach
  (**≈12,225**) — and a "Top Events by ROI" table.
- **Why it used to show 0:** these numbers come from each event's
  `marketing_budget` / `expected_roi` / `expected_attendance`. Those were all `0`
  in the database; they've now been populated, so the dashboard is fully filled.

### Analytics
- Pick an event from the **event picker** → view its attendance predictor and
  marketing insight. Click **Refresh Prediction** to recompute.

### Reports
- Pick an event → click **Generate AI Report** → a post-event / ROI report renders
  (uses AI if a key is set, otherwise a computed summary).

---

## 9. Attendee — full walkthrough

Login: `attendee@eventpro.com`. Sees **Dashboard, Events, AI Center**.

### Dashboard
- **Expect:** "Attendee Experience" with cards — Upcoming Events (**6**), Next
  Event (name), Venue, Event Type — an "Upcoming Events" table, and an **AI
  Concierge** note referencing your next event.
- **Test:** the "Next Event" is the soonest upcoming event in the database.

### Events
- Read-only list of events with search/filter.

### AI Center
- See §11 — chat with the EventPro AI assistant.

---

## 10. Shared feature: Events tab (CRUD)

Available to Super Admin, Organizer, Staff (full) and Vendor/Attendee (read-only).

1. **List & search:** the table shows all 8 events. Use the search box (title /
   client / venue) and the status/type/date filters — the list updates.
2. **Create** (Admin/Organizer/Staff): click **+ New Event** → fill the form →
   Save → a success toast appears and the event shows in the list.
3. **Edit:** click an event's edit action → change a field → Save → row updates.
4. **Assign a vendor:** open an event → add a vendor with a role and agreed price
   → it appears under that event; status can be Pending/Confirmed.
5. **Delete:** delete an event → confirm → it disappears.
6. **Permission check (important):** log in as **Attendee** or **Vendor** and try
   to create/delete — the UI hides those controls, and the API returns **403
   Forbidden** if called directly. This proves role control works server-side.

---

## 11. Shared feature: Vendors tab (CRUD)

Available to **Super Admin & Organizer only**.

1. **List/search/filter** the 5 vendors by category or name.
2. **Create / Edit / Delete** vendors (name, category, rating, price range, etc.).
3. **Permission check:** as **Staff** the Vendors tab isn't shown; a direct API
   call to create a vendor returns **403**.

---

## 12. Shared feature: Budget AI / Analytics / Reports / Command Center

All four now include an **event picker** dropdown so you choose which event to
analyze (previously they were locked to the first event).

- **Budget AI:** pick an event → "Run AI Analysis" → shows planned vs. projected
  cost and recommendations.
- **Analytics:** pick an event → attendance & marketing prediction.
- **Reports:** pick an event → "Generate AI Report" → post-event/ROI report.
- **Command Center:** pick an event → live operational monitoring (see §6).

> If no Cerebras API key is configured, AI sections show a graceful "not
> configured / temporary issue" message instead of crashing — this is expected.

---

## 13. Shared feature: AI Center

Available to Super Admin, Organizer, Attendee.

1. Type a question (e.g. *"help me plan a wedding budget"*) → send.
2. **With** a Cerebras key: a real AI reply. **Without** a key: a smart built-in
   fallback reply (wedding/corporate/budget/vendor tips). Both are expected.
3. Chat history persists per session; use the clear/new-session controls.

---

## 14. Settings tab

Available to **Super Admin & Organizer only**.

1. View/edit company name, email, phone, currency, tax rate, etc. → Save.
2. **Permission check:** as **Sponsor/Staff/Vendor/Attendee** the tab is hidden and
   a direct `PUT /api/settings` returns **403**.

---

## 15. Permission / security tests (negative testing)

These confirm the backend — not just the UI — enforces roles. If you have `curl`:

```bash
# 1) Get a token for a low-privilege role
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"attendee@eventpro.com","password":"password123"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# 2) Reading events works (200)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/events -H "Authorization: Bearer $TOKEN"

# 3) Creating an event is forbidden (403)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/api/events \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"x","client_name":"y","event_date":"2026-09-01"}'

# 4) No token at all is rejected (401)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/events
```

Expected results: **200**, then **403**, then **401**.

Matrix of who can modify what (all reads allowed for any logged-in user):

| Action | Allowed roles |
|--------|---------------|
| Create/edit/delete events, assign vendors | Super Admin, Organizer, Staff |
| Create/edit/delete vendors | Super Admin, Organizer |
| Change settings | Super Admin, Organizer |
| Self-register (`POST /api/auth/register`) | New Attendee / Vendor / Sponsor only |

---

## 16. Responsive testing (phone / tablet / laptop / desktop)

1. Open the app, press **F12** → toggle the device toolbar (Ctrl+Shift+M in
   Chrome).
2. **Desktop (≥1100px):** sidebar fixed, multi-column grids.
3. **Tablet (~768–1024px):** grids collapse to fewer columns.
4. **Phone (≤768px):** the sidebar hides; a **hamburger menu** appears in the top
   bar. Tap it → the sidebar slides in over a dark **backdrop**. Tap the backdrop
   or pick a menu item → it closes.
5. **Small phone (≤480px):** stat cards stack to one column; wide tables scroll
   horizontally; the login card and modals fit the screen.

---

## 17. Quick smoke-test checklist

- [ ] Each of the 6 demo logins works and lands on the right dashboard
- [ ] Sidebar shows only the tabs from the §3 matrix for each role
- [ ] Every dashboard shows real numbers (not blanks/zeros)
- [ ] Sponsor dashboard is populated (spend/ROI/reach)
- [ ] Vendor dashboard is personalized to "Royal Cuisine Catering"
- [ ] Events CRUD works for Organizer; blocked (403) for Attendee
- [ ] Vendors CRUD works for Admin; tab hidden for Staff
- [ ] Budget/Analytics/Reports/Command Center event pickers switch events
- [ ] AI Center replies (real or fallback)
- [ ] Mobile hamburger + backdrop work
