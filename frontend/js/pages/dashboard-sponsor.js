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

        c.innerHTML = `
          <div class="dash-with-panel">
            <div class="dash-main">
              ${renderRoleDashboard(data)}
              <div id="sponsor-profile-card" style="margin-top:20px;"></div>
              <h4 style="margin:20px 0 12px;font-size:1rem;color:var(--text-primary);">Sponsorship Opportunities</h4>
              <div class="vendor-grid">
                ${upcoming.length ? upcoming.map(e => sponsorEventCard(e, mineIds.has(e.id))).join('') : '<p class="text-muted">No upcoming events.</p>'}
              </div>
            </div>
            ${renderDirectoryPanel('organisers')}
          </div>`;
        initDirectoryPanel('organisers');
        loadSponsorProfileCard();
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

// ── My Sponsor Profile (controls how the sponsor appears to organisers) ───────
const SPONSOR_CATEGORIES = ['Technology', 'Finance', 'FMCG', 'Automobile', 'Media', 'Healthcare', 'Education', 'Retail', 'General'];
const SPONSOR_AVAILABILITY = ['Available', 'Open to offers', 'Not Available'];

function sponsorAvailBadge(a) {
    const cls = a === 'Available' ? 'badge-completed' : (a === 'Open to offers' ? 'badge-upcoming' : 'badge-inactive');
    return `<span class="badge ${cls}">${a || 'Available'}</span>`;
}

async function loadSponsorProfileCard() {
    const el = document.getElementById('sponsor-profile-card');
    if (!el) return;
    let p = null;
    try { p = await api.get('/directory/my-profile'); } catch (_) { el.innerHTML = ''; return; }
    window.__sponsorProfile = p;
    el.innerHTML = `
        <div class="card card-glow">
            <div class="card-header">
                <h3><span class="material-icons-round" style="vertical-align:middle;">badge</span> My Sponsor Profile</h3>
                <button class="btn btn-primary btn-sm" onclick="openSponsorProfileEdit()"><span class="material-icons-round">edit</span> Edit Profile</button>
            </div>
            <div class="card-body">
                <p class="text-muted" style="font-size:0.85rem;margin-bottom:12px;">This is how organisers see you in their <strong>Available Sponsors</strong> panel.</p>
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                    <strong style="color:var(--text-primary);font-size:1.05rem;">${p.company_name || '—'}</strong>
                    <span class="vendor-category-badge">${p.category || 'General'}</span>
                    ${sponsorAvailBadge(p.availability)}
                </div>
                <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:12px;color:var(--text-secondary);font-size:0.88rem;">
                    <span><span class="material-icons-round" style="font-size:15px;vertical-align:middle;">payments</span> Budget: <strong>${formatCurrency(p.budget)}</strong></span>
                    <span><span class="material-icons-round" style="font-size:15px;vertical-align:middle;">place</span> ${p.location || '—'}</span>
                    ${p.contact_phone ? `<span><span class="material-icons-round" style="font-size:15px;vertical-align:middle;">call</span> ${p.contact_phone}</span>` : ''}
                </div>
                ${p.description ? `<p style="margin-top:10px;color:var(--text-muted);font-size:0.85rem;">${p.description}</p>` : ''}
            </div>
        </div>`;
}

function openSponsorProfileEdit() {
    const p = window.__sponsorProfile || {};
    openModal('Edit Sponsor Profile', `
        <form id="spp-form" class="form-grid">
            <div class="form-group">
                <label>Company name</label>
                <input id="spp-company" class="form-input" value="${(p.company_name || '').replace(/"/g, '&quot;')}" placeholder="Your brand">
            </div>
            <div class="form-group">
                <label>Category</label>
                <select id="spp-category" class="form-select">
                    ${SPONSOR_CATEGORIES.map(c => `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Sponsorship budget (₹)</label>
                <input id="spp-budget" type="number" min="0" class="form-input" value="${p.budget || 0}">
            </div>
            <div class="form-group">
                <label>Location</label>
                <input id="spp-location" class="form-input" value="${(p.location || '').replace(/"/g, '&quot;')}" placeholder="City, Country">
            </div>
            <div class="form-group">
                <label>Availability</label>
                <select id="spp-availability" class="form-select">
                    ${SPONSOR_AVAILABILITY.map(a => `<option value="${a}" ${p.availability === a ? 'selected' : ''}>${a}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Contact phone</label>
                <input id="spp-phone" class="form-input" value="${(p.contact_phone || '').replace(/"/g, '&quot;')}" placeholder="+91 …">
            </div>
            <div class="form-group full-width">
                <label>Logo URL (optional)</label>
                <input id="spp-logo" class="form-input" value="${(p.logo_url || '').replace(/"/g, '&quot;')}" placeholder="https://…/logo.png">
            </div>
            <div class="form-group full-width">
                <label>About your brand</label>
                <textarea id="spp-desc" class="form-textarea" placeholder="What kinds of events do you sponsor?">${p.description || ''}</textarea>
            </div>
            <div class="form-group full-width"><div class="modal-footer" style="padding:0;border:none;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary"><span class="material-icons-round">save</span> Save Profile</button>
            </div></div>
        </form>`);
    document.getElementById('spp-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api.put('/directory/my-profile', {
                company_name: document.getElementById('spp-company').value.trim() || null,
                category: document.getElementById('spp-category').value,
                budget: parseFloat(document.getElementById('spp-budget').value) || 0,
                location: document.getElementById('spp-location').value.trim() || null,
                availability: document.getElementById('spp-availability').value,
                contact_phone: document.getElementById('spp-phone').value.trim() || null,
                logo_url: document.getElementById('spp-logo').value.trim() || null,
                description: document.getElementById('spp-desc').value.trim() || null,
            });
            showToast('Profile updated — organisers can now see your details', 'success');
            closeModal();
            loadSponsorProfileCard();
        } catch (err) { showToast(err.message || 'Failed to save', 'error'); }
    });
}
