// Vendor dashboard — metrics + availability + gigs/profit + reviews + staff attendance.
registerPage('dashboard-vendor', async () => {
    const c = document.getElementById('page-container');
    c.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    try {
        const data = await api.get('/dashboard/role-view');
        c.innerHTML = renderRoleDashboard(data) + `
            <div class="card card-glow" style="margin-top:20px;">
                <div class="card-header">
                    <h3><span class="material-icons-round" style="vertical-align:middle;">event_seat</span> Availability</h3>
                    <div id="vendor-avail"></div>
                </div>
                <div class="card-body"><p class="text-muted" style="font-size:0.85rem;">Set <strong>Available</strong> so organizers can find and book you.</p></div>
            </div>
            <div class="card card-glow" style="margin-top:16px;">
                <div class="card-header"><h3><span class="material-icons-round" style="vertical-align:middle;">work</span> My Gigs & Profit</h3></div>
                <div class="card-body" id="vendor-gigs"><div class="loading-state"><div class="spinner"></div></div></div>
            </div>`;
        loadVendorAvailability();
        loadVendorGigs();
    } catch (err) {
        console.error(err);
        c.innerHTML = `<div class="card"><div class="card-body text-danger">Failed to load dashboard.</div></div>`;
    }
});

async function loadVendorAvailability() {
    const el = document.getElementById('vendor-avail');
    if (!el) return;
    let cur = 'Available';
    try { cur = (await api.get('/portal/my-vendor')).availability || 'Available'; } catch (_) {}
    const opts = ['Available', 'Busy', 'Inactive'];
    el.innerHTML = `<select class="event-select" style="background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:8px;padding:6px 10px;" onchange="setVendorAvailability(this.value)">
        ${opts.map(o => `<option value="${o}" ${o === cur ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
}

async function setVendorAvailability(v) {
    try { await api.put('/portal/my-vendor/availability', { availability: v }); showToast(`You're now ${v}`, 'success'); }
    catch (e) { showToast(e.message || 'Failed', 'error'); }
}

async function loadVendorGigs() {
    const el = document.getElementById('vendor-gigs');
    if (!el) return;
    let data = { gigs: [], totals: {} };
    try { data = await api.get('/portal/my-gigs'); } catch (_) {}
    const inrf = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
    if (!data.gigs.length) { el.innerHTML = '<p class="text-muted">No gigs booked yet.</p>'; return; }
    el.innerHTML = `
        <div class="stats-grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:14px;">
            <div class="stat-card"><div class="stat-label">Total Income</div><div class="stat-value">${inrf(data.totals.income)}</div></div>
            <div class="stat-card"><div class="stat-label">Est. Profit</div><div class="stat-value" style="color:#1A5FFF;">${inrf(data.totals.est_profit)}</div></div>
            <div class="stat-card"><div class="stat-label">Gigs</div><div class="stat-value">${data.totals.gig_count}</div></div>
        </div>
        ${data.gigs.map(g => `
            <div class="ai-alert-card" style="margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                    <strong style="color:var(--text-primary);">${g.event}</strong>
                    <span>${getStatusBadge(g.status === 'Confirmed' ? 'Confirmed' : 'Pending')}</span>
                </div>
                <ul style="padding-left:18px;margin-top:8px;color:var(--text-secondary);font-size:0.85rem;">
                    ${g.points.map(p => `<li style="margin-bottom:4px;">${p}</li>`).join('')}
                </ul>
                ${g.event_id && !g.event_over ? `<button class="btn btn-secondary btn-sm" style="margin-top:6px;" onclick="showParticipantQR(${g.event_id}, '${(g.event || '').replace(/'/g, "\\'")}')"><span class="material-icons-round">qr_code_2</span> My Attendance QR</button>` : ''}
            </div>`).join('')}`;
}
