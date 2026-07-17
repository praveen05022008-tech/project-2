// Attendee dashboard — FastPass + upcoming events as cards with per-event actions.
registerPage('dashboard-attendee', async () => {
    const container = document.getElementById('page-container');
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    try {
        const events = await api.get('/my-events/upcoming');
        const today = new Date().toISOString().slice(0, 10);
        const next = events[0] || null;

        container.innerHTML = `
            <div class="dashboard-header animate-fade-in stagger-1" style="margin-bottom:18px;">
                <h3 style="font-size:1.6rem;color:var(--text-primary);">Your Events</h3>
                <p style="color:var(--text-muted);">Tickets, venue maps, Q&A and more.</p>
            </div>
            <div id="fastpass-slot"></div>
            <h4 style="margin:8px 0 12px;font-size:1rem;color:var(--text-primary);">Upcoming Events</h4>
            <div class="vendor-grid" id="att-events">
                ${events.length ? events.map(attendeeEventCard).join('') : '<p class="text-muted">No upcoming events right now. Check back soon!</p>'}
            </div>`;

        if (next) renderFastPass('fastpass-slot', next);
        // Stash events so card actions can look them up
        window.__attEvents = {};
        events.forEach(e => { window.__attEvents[e.id] = e; });
    } catch (err) {
        console.error('Attendee dashboard failed', err);
        container.innerHTML = `<div class="card"><div class="card-body text-danger">Failed to load your events.</div></div>`;
    }
});

function attendeeEventCard(e) {
    const t = e.title.replace(/'/g, "\\'");
    const done = e.status === 'Completed';
    return `
        <div class="vendor-card">
            <div class="vendor-card-top"></div>
            <div style="padding:16px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                    <span class="vendor-category-badge">${e.event_type}</span>
                    ${getStatusBadge(e.status)}
                </div>
                <h4 style="margin:10px 0 4px;color:var(--text-primary);">${e.title}</h4>
                <div style="font-size:0.82rem;color:var(--text-muted);">
                    <span class="material-icons-round" style="font-size:14px;vertical-align:middle;">event</span> ${formatDate(e.event_date)}
                    &nbsp;·&nbsp;<span class="material-icons-round" style="font-size:14px;vertical-align:middle;">place</span> ${e.venue || 'TBA'}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:14px;">
                    <button class="btn btn-primary btn-sm" onclick="openTicketPurchase(${e.id}, '${t}')"><span class="material-icons-round">confirmation_number</span> Tickets</button>
                    <button class="btn btn-secondary btn-sm" onclick="showVenueMap(window.__attEvents[${e.id}])"><span class="material-icons-round">map</span> Map</button>
                    <button class="btn btn-secondary btn-sm" onclick="openEventQA(${e.id}, '${t}')"><span class="material-icons-round">forum</span> Q&A</button>
                    <button class="btn btn-secondary btn-sm" onclick="showEventVendors(${e.id}, '${t}')"><span class="material-icons-round">store</span> Vendors</button>
                    <button class="btn btn-secondary btn-sm" onclick="openFeedbackForm(${e.id}, '${t}')"><span class="material-icons-round">rate_review</span> Rate</button>
                    ${done ? `<button class="btn btn-secondary btn-sm" onclick="downloadCertificate(window.__attEvents[${e.id}])"><span class="material-icons-round">workspace_premium</span> Certificate</button>` : ''}
                </div>
            </div>
        </div>`;
}
