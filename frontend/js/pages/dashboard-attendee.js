// Attendee: data-driven dashboard + a real FastPass QR ticket for the next event.
registerPage('dashboard-attendee', async () => {
    const container = document.getElementById('page-container');
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    try {
        const data = await api.get('/dashboard/role-view');
        container.innerHTML = `<div id="fastpass-slot"></div>` + renderRoleDashboard(data);

        // Pick the soonest upcoming event and render its FastPass QR.
        const events = await api.get('/events');
        const today = new Date().toISOString().slice(0, 10);
        const upcoming = events
            .filter(e => (e.event_date || '') >= today)
            .sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));
        const next = upcoming[0] || events[0];
        if (next) renderFastPass('fastpass-slot', next);
    } catch (err) {
        console.error('Failed to load attendee dashboard', err);
        container.innerHTML = `<div class="card"><div class="card-body text-danger">Failed to load dashboard data.</div></div>`;
    }
});
