registerPage('analytics', initAnalytics);

let analyticsEvents = [];

async function initAnalytics() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="loading-state"><div class="spinner"></div></div>
    `;

    try {
        analyticsEvents = await api.get('/events');
        const activeEvent = analyticsEvents.length > 0 ? analyticsEvents[0] : null;

        if (!activeEvent) {
            container.innerHTML = `<div class="card"><div class="card-body">No active events found.</div></div>`;
            return;
        }

        renderAnalytics(activeEvent);
        fetchAnalytics(activeEvent.id);

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="card"><div class="card-body text-danger">Failed to load Analytics data.</div></div>`;
    }
}

function selectAnalyticsEvent(id) {
    const ev = analyticsEvents.find(e => String(e.id) === String(id));
    if (!ev) return;
    renderAnalytics(ev);
    fetchAnalytics(ev.id);
}

function renderAnalytics(activeEvent) {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="toolbar fade-in stagger-1">
            ${eventSelectorHTML(analyticsEvents, activeEvent.id, 'selectAnalyticsEvent')}
            <button class="btn btn-primary" onclick="fetchAnalytics(${activeEvent.id})">
                <i class="material-icons-round">insights</i> Refresh Prediction
            </button>
        </div>

        <div class="stats-grid fade-in stagger-2" id="analytics-kpis">
            <div class="stat-card"><div class="stat-label">Predicted Attendance</div><div class="stat-value">…</div></div>
            <div class="stat-card"><div class="stat-label">Fill Rate</div><div class="stat-value">…</div></div>
            <div class="stat-card"><div class="stat-label">Marketing ROI Score</div><div class="stat-value">…</div></div>
            <div class="stat-card"><div class="stat-label">Cost / Attendee</div><div class="stat-value">…</div></div>
        </div>

        <div class="content-grid fade-in stagger-3" style="align-items:start;">
            <div class="card">
                <div class="card-header"><h3><i class="material-icons-round" style="vertical-align:middle;">groups</i> Attendance Funnel</h3></div>
                <div class="card-body" id="attendance-feed"><p class="text-muted">Loading…</p></div>
            </div>
            <div class="card">
                <div class="card-header"><h3><i class="material-icons-round" style="vertical-align:middle;">campaign</i> Marketing Intelligence</h3></div>
                <div class="card-body" id="marketing-feed"><p class="text-muted">Loading…</p></div>
            </div>
        </div>
    `;
}

async function fetchAnalytics(eventId) {
    try {
        const analysis = await api.get(`/analytics/${eventId}`);
        updateAnalyticsUI(analysis);
    } catch (error) {
        console.error("Failed to fetch analytics", error);
    }
}

function analyticsHealthColor(h) {
    const s = (h || '').toLowerCase();
    if (s.includes('low')) return '#f5576c';
    if (s.includes('moderate')) return '#f5a623';
    if (s.includes('no target')) return 'var(--text-muted)';
    return '#43e97b';
}

function updateAnalyticsUI(a) {
    const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
    const color = analyticsHealthColor(a.attendance_health);

    const kpis = document.getElementById('analytics-kpis');
    if (kpis) {
        kpis.innerHTML = `
            <div class="stat-card"><div class="stat-label">Predicted Attendance</div><div class="stat-value">${a.predicted_final_attendance.toLocaleString()}</div></div>
            <div class="stat-card"><div class="stat-label">Fill Rate</div><div class="stat-value" style="color:${color}">${a.fill_rate_pct}%</div></div>
            <div class="stat-card"><div class="stat-label">Marketing ROI Score</div><div class="stat-value">${a.marketing_roi_score}/100</div></div>
            <div class="stat-card"><div class="stat-label">Cost / Attendee</div><div class="stat-value">${inr(a.cost_per_attendee)}</div></div>
        `;
    }

    const att = document.getElementById('attendance-feed');
    if (att) {
        const maxV = Math.max(...a.funnel.map(f => f.value), 1);
        att.innerHTML = `
            <div class="ai-alert-card" style="border-left-color:${color};background:${color}14;margin-bottom:16px;">
                <span class="badge" style="background:${color};color:#0b0d12;">${a.attendance_health}</span>
                <p style="margin:8px 0 0;color:var(--text-secondary);">Predicted final attendance: <strong>${a.predicted_final_attendance.toLocaleString()}</strong> of ${a.expected_attendance.toLocaleString()} target.</p>
            </div>
            ${a.funnel.map(f => `
                <div style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:4px;">
                        <span style="color:var(--text-primary);">${f.stage}</span>
                        <span style="color:var(--text-secondary);">${f.value.toLocaleString()}</span>
                    </div>
                    <div style="height:8px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden;">
                        <div style="height:100%;width:${(f.value / maxV * 100).toFixed(0)}%;background:var(--accent-gradient);"></div>
                    </div>
                </div>`).join('')}
        `;
    }

    const mk = document.getElementById('marketing-feed');
    if (mk) {
        mk.innerHTML = `
            <div class="ai-alert-card">
                <div style="display:flex;align-items:center;gap:8px;">
                    <strong>ROI Score: ${a.marketing_roi_score}/100</strong>
                    ${a.ai_enabled ? '<span class="badge badge-upcoming">AI narrative</span>' : '<span class="badge badge-inactive">rule-based</span>'}
                </div>
                <p class="text-muted" style="margin-top:10px;">${a.marketing_insights}</p>
                <p style="font-size:0.85rem;color:var(--text-muted);margin-top:8px;">Spend ${inr(a.marketing_budget)} · ${inr(a.cost_per_registration)}/registration</p>
            </div>
            <h4 style="margin:16px 0 8px;font-size:0.9rem;">Growth Recommendations</h4>
            <ul style="padding-left:18px;color:var(--text-secondary);font-size:0.85rem;">
                ${a.growth_recommendations.map(r => `<li style="margin-bottom:6px;">${r}</li>`).join('')}
            </ul>
        `;
    }
}
