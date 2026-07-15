// Sponsor dashboard — ROI metrics + sponsorship opportunities (interest, reviews, ROI).
registerPage('dashboard-sponsor', async () => {
    const c = document.getElementById('page-container');
    c.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    try {
        const [data, allEvents, mine] = await Promise.all([
            api.get('/dashboard/role-view'),
            api.get('/events?limit=100'),
            api.get('/my-events'),
        ]);
        const today = new Date().toISOString().slice(0, 10);
        const mineIds = new Set(mine.map(e => e.id));
        const upcoming = allEvents.filter(e => (e.event_date || '') >= today);
        window.__spEvents = {};
        allEvents.forEach(e => { window.__spEvents[e.id] = e; });

        c.innerHTML = renderRoleDashboard(data) + `
            <h4 style="margin:20px 0 12px;font-size:1rem;color:var(--text-primary);">Sponsorship Opportunities</h4>
            <div class="vendor-grid">
                ${upcoming.length ? upcoming.map(e => sponsorEventCard(e, mineIds.has(e.id))).join('') : '<p class="text-muted">No upcoming events.</p>'}
            </div>`;
    } catch (err) {
        console.error(err);
        c.innerHTML = `<div class="card"><div class="card-body text-danger">Failed to load dashboard.</div></div>`;
    }
});

function sponsorEventCard(e, sponsoring) {
    const t = e.title.replace(/'/g, "\\'");
    return `
        <div class="vendor-card">
            <div class="vendor-card-top"></div>
            <div style="padding:16px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                    <span class="vendor-category-badge">${e.event_type}</span>
                    ${sponsoring ? '<span class="badge badge-completed">Sponsoring</span>' : getStatusBadge(e.status)}
                </div>
                <h4 style="margin:10px 0 4px;color:var(--text-primary);">${e.title}</h4>
                <div style="font-size:0.82rem;color:var(--text-muted);">
                    <span class="material-icons-round" style="font-size:14px;vertical-align:middle;">event</span> ${formatDate(e.event_date)}
                    &nbsp;·&nbsp;${e.expected_attendance ? e.expected_attendance.toLocaleString() + ' expected' : (e.venue || 'TBA')}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:14px;">
                    ${sponsoring
                        ? `<button class="btn btn-secondary btn-sm" onclick="showEventReviews(${e.id}, '${t}')"><span class="material-icons-round">reviews</span> Reviews</button>
                           <button class="btn btn-secondary btn-sm" onclick="navigateTo('analytics')"><span class="material-icons-round">insights</span> ROI</button>`
                        : `<button class="btn btn-primary btn-sm" onclick="openSponsorInterest(${e.id}, '${t}')"><span class="material-icons-round">handshake</span> Express Interest</button>`}
                </div>
            </div>
        </div>`;
}

function openSponsorInterest(eventId, title) {
    openModal('Express Interest · ' + title, `
        <form id="sp-form" class="form-grid">
            <div class="form-group"><label>Company</label><input id="sp-company" class="form-input" placeholder="Your brand"></div>
            <div class="form-group"><label>Contact phone</label><input id="sp-phone" class="form-input" placeholder="+91 …"></div>
            <div class="form-group full-width"><label>Proposed amount (₹)</label><input id="sp-amount" type="number" class="form-input" min="0" value="0"></div>
            <div class="form-group full-width"><div class="modal-footer" style="padding:0;border:none;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary"><span class="material-icons-round">send</span> Submit Interest</button>
            </div></div>
        </form>`);
    document.getElementById('sp-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api.post(`/portal/events/${eventId}/sponsor-interest`, {
                company: document.getElementById('sp-company').value.trim() || null,
                contact_phone: document.getElementById('sp-phone').value.trim() || null,
                amount: parseFloat(document.getElementById('sp-amount').value) || 0,
            });
            showToast('Interest submitted — the organizer has been notified', 'success');
            closeModal();
            if (pages[currentPage] && pages[currentPage].init) pages[currentPage].init();
        } catch (err) { showToast(err.message || 'Failed', 'error'); }
    });
}

// Product/attendee reviews for a sponsored event
async function showEventReviews(eventId, title) {
    openModal('Reviews · ' + title, `<div id="rev-body"><div class="loading-state"><div class="spinner"></div></div></div>`);
    let d = { count: 0, average_rating: 0, reviews: [] };
    try { d = await api.get(`/portal/events/${eventId}/reviews`); } catch (e) {
        document.getElementById('rev-body').innerHTML = `<p class="text-danger">${e.message}</p>`; return;
    }
    const el = document.getElementById('rev-body');
    el.innerHTML = `
        <div class="stats-grid" style="grid-template-columns:1fr 1fr;margin-bottom:12px;">
            <div class="stat-card"><div class="stat-label">Avg Rating</div><div class="stat-value">${d.average_rating} / 5</div></div>
            <div class="stat-card"><div class="stat-label">Reviews</div><div class="stat-value">${d.count}</div></div>
        </div>
        ${d.reviews.length ? d.reviews.map(r => `<div class="ai-alert-card" style="margin-bottom:8px;">${'★'.repeat(r.rating)}<span style="color:var(--text-muted);">${'☆'.repeat(5 - r.rating)}</span><p style="margin-top:4px;color:var(--text-secondary);">“${r.comment}”</p></div>`).join('') : '<p class="text-muted">No written reviews yet.</p>'}`;
}
