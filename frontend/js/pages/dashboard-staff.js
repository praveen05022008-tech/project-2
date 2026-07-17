// Staff dashboard — live metrics + my attendance (QR check-in).
registerPage('dashboard-staff', async () => {
    const c = document.getElementById('page-container');
    c.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    try {
        const data = await api.get('/dashboard/role-view');
        c.innerHTML = renderRoleDashboard(data) + `
            <div class="card card-glow" style="margin-top:20px;">
                <div class="card-header">
                    <h3><span class="material-icons-round" style="vertical-align:middle;">how_to_reg</span> My Attendance</h3>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="btn btn-secondary btn-sm" onclick="openParticipantScan()"><span class="material-icons-round">qr_code_2</span> Scan Vendor/Organiser</button>
                        <button class="btn btn-primary btn-sm" onclick="openAttendanceScan()"><span class="material-icons-round">qr_code_scanner</span> Check In</button>
                    </div>
                </div>
                <div class="card-body" id="staff-att-list"><div class="loading-state"><div class="spinner"></div></div></div>
            </div>`;
        loadStaffAttendance();
    } catch (err) {
        console.error(err);
        c.innerHTML = `<div class="card"><div class="card-body text-danger">Failed to load dashboard.</div></div>`;
    }
});

async function loadStaffAttendance() {
    const el = document.getElementById('staff-att-list');
    if (!el) return;
    try {
        const events = await api.get('/my-events');
        if (!events.length) { el.innerHTML = '<p class="text-muted">You are not assigned to any events yet.</p>'; return; }
        const rows = await Promise.all(events.map(async (e) => {
            let mine = 'Pending';
            try {
                const d = await api.get(`/attendance/${e.id}`);
                const r = d.staff.find(s => s.staff_email === window.currentUser.email);
                if (r) mine = r.attendance;
            } catch (_) { /* ignore */ }
            return { e, mine };
        }));
        el.innerHTML = `
            <p class="text-muted" style="margin-bottom:10px;font-size:0.85rem;">Tap <strong>Check In</strong> and scan the event's attendance QR shown by your organizer.</p>
            <div class="table-wrapper"><table class="data-table">
                <thead><tr><th>Event</th><th>Date</th><th>Venue</th><th>My Status</th></tr></thead>
                <tbody>${rows.map(({ e, mine }) => `<tr>
                    <td style="color:var(--text-primary);font-weight:600;">${e.title}</td>
                    <td>${formatDate(e.event_date)}</td>
                    <td>${e.venue || '—'}</td>
                    <td>${attBadge(mine)}</td>
                </tr>`).join('')}</tbody>
            </table></div>`;
    } catch (err) {
        el.innerHTML = `<p class="text-muted">Could not load your attendance.</p>`;
    }
}
