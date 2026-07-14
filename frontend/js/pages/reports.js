registerPage('reports', initReports);

let reportsEvents = [];

async function initReports() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="loading-state"><div class="spinner"></div></div>
    `;

    try {
        reportsEvents = await api.get('/events');
        // Only show reports for completed events, or all if none completed for demo
        const activeEvent = reportsEvents.length > 0 ? reportsEvents[0] : null;

        if (!activeEvent) {
            container.innerHTML = `<div class="card"><div class="card-body">No events available for reporting.</div></div>`;
            return;
        }

        renderReports(activeEvent);

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="card"><div class="card-body text-danger">Failed to load Reports data.</div></div>`;
    }
}

function selectReportsEvent(id) {
    const ev = reportsEvents.find(e => String(e.id) === String(id));
    if (!ev) return;
    renderReports(ev);
}

function renderReports(activeEvent) {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="toolbar fade-in stagger-1">
            ${eventSelectorHTML(reportsEvents, activeEvent.id, 'selectReportsEvent')}
            <button class="btn btn-primary" onclick="generateReport(${activeEvent.id})">
                <i class="material-icons-round">description</i> Generate AI Report
            </button>
        </div>

        <div class="card fade-in stagger-2">
            <div class="card-header">
                <h3><i class="material-icons-round" style="vertical-align: middle;">assignment</i> Sponsor ROI & Business Report</h3>
            </div>
            <div class="card-body" id="report-feed">
                <p class="text-muted">Click "Generate AI Report" to create a post-event summary.</p>
            </div>
        </div>

        <div class="card fade-in stagger-3" style="margin-top:16px;">
            <div class="card-header">
                <h3><i class="material-icons-round" style="vertical-align: middle;">reviews</i> Attendee Feedback</h3>
            </div>
            <div class="card-body" id="feedback-feed"><p class="text-muted">Loading feedback…</p></div>
        </div>
    `;
    loadFeedbackSummary(activeEvent.id);
}

async function loadFeedbackSummary(eventId) {
    const el = document.getElementById('feedback-feed');
    if (!el) return;
    try {
        const s = await api.get(`/feedback/${eventId}/summary`);
        if (!s.count) { el.innerHTML = '<p class="text-muted">No feedback submitted yet for this event.</p>'; return; }
        const bar = (n) => {
            const pct = s.count ? Math.round(s.distribution[n] / s.count * 100) : 0;
            return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:0.82rem;">
                <span style="width:34px;color:var(--text-secondary);">${n}★</span>
                <div style="flex:1;height:8px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:var(--accent-gradient);"></div></div>
                <span style="width:34px;text-align:right;color:var(--text-muted);">${s.distribution[n]}</span></div>`;
        };
        el.innerHTML = `
            <div class="stats-grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:14px;">
                <div class="stat-card"><div class="stat-label">Avg Rating</div><div class="stat-value">${s.average_rating} / 5</div></div>
                <div class="stat-card"><div class="stat-label">Responses</div><div class="stat-value">${s.count}</div></div>
                <div class="stat-card"><div class="stat-label">NPS</div><div class="stat-value">${s.nps}</div></div>
            </div>
            ${[5,4,3,2,1].map(bar).join('')}
            <div class="ai-alert-card" style="margin-top:14px;">
                <div style="display:flex;align-items:center;gap:8px;"><strong>AI Sentiment</strong>
                ${s.ai_enabled ? '<span class="badge badge-upcoming">AI</span>' : '<span class="badge badge-inactive">rule-based</span>'}</div>
                <p class="text-muted" style="margin-top:8px;">${s.sentiment}</p>
            </div>
            ${s.recent_comments.length ? `<h4 style="margin:14px 0 8px;font-size:0.9rem;">Recent comments</h4>
                <ul style="padding-left:18px;color:var(--text-secondary);font-size:0.85rem;">${s.recent_comments.map(c => `<li style="margin-bottom:6px;">“${c}”</li>`).join('')}</ul>` : ''}
        `;
    } catch (err) {
        el.innerHTML = `<p class="text-muted">Feedback summary unavailable.</p>`;
    }
}

async function generateReport(eventId) {
    const feedEl = document.getElementById('report-feed');
    if (feedEl) feedEl.innerHTML = '<p class="text-muted">Compiling data and generating AI report...</p>';
    
    try {
        const report = await api.get(`/reports/post-event/${eventId}`);
        updateReportUI(report);
    } catch (error) {
        console.error("Failed to generate report", error);
        if (feedEl) feedEl.innerHTML = '<p class="text-danger">Failed to connect to AI Engine.</p>';
    }
}

function updateReportUI(report) {
    const feedEl = document.getElementById('report-feed');
    if (!feedEl) return;

    const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
    const varColor = report.budget_variance >= 0 ? '#43e97b' : '#f5576c';
    const successesHtml = report.key_successes.map(s => `<li style="margin-bottom:6px;color:#43e97b;">${s}</li>`).join('') || '<li class="text-muted">—</li>';
    const improvementsHtml = report.areas_for_improvement.map(i => `<li style="margin-bottom:6px;color:#f5a623;">${i}</li>`).join('') || '<li class="text-muted">None flagged</li>';

    feedEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:8px;">
                ${report.ai_enabled ? '<span class="badge badge-upcoming">AI executive summary</span>' : '<span class="badge badge-inactive">rule-based</span>'}
                <span class="badge badge-completed">${report.status}</span>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="window.print()"><span class="material-icons-round">print</span> Export / Print</button>
        </div>

        <div class="ai-alert-card" style="border-left-color:#4facfe;margin-bottom:18px;">
            <strong>Executive Summary</strong>
            <p style="margin-top:8px;color:var(--text-secondary);line-height:1.6;">${report.executive_summary}</p>
        </div>

        <div class="stats-grid" style="margin-bottom:8px;">
            <div class="stat-card"><div class="stat-label">Budget Variance</div><div class="stat-value" style="color:${varColor}">${inr(report.budget_variance)}</div><div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">${report.variance_pct}% of plan</div></div>
            <div class="stat-card"><div class="stat-label">Attendance Rate</div><div class="stat-value">${report.attendance_rate_pct}%</div><div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">${report.actual_attendance.toLocaleString()} / ${report.expected_attendance.toLocaleString()}</div></div>
            <div class="stat-card"><div class="stat-label">Sponsor ROI</div><div class="stat-value">${report.sponsor_roi_percentage}%</div><div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">${report.leads_captured} leads · ${report.booth_scans} scans</div></div>
            <div class="stat-card"><div class="stat-label">Event ROI</div><div class="stat-value">${report.event_roi_pct}%</div><div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">profit ${inr(report.projected_profit)}</div></div>
        </div>

        <div class="form-grid" style="margin-top:16px;">
            <div>
                <h4 style="margin-bottom:8px;font-size:0.9rem;">Financial Summary</h4>
                <p class="text-muted" style="font-size:0.88rem;line-height:1.6;">${report.financial_summary}</p>
            </div>
            <div>
                <h4 style="margin-bottom:8px;font-size:0.9rem;">Operational Summary</h4>
                <p class="text-muted" style="font-size:0.88rem;line-height:1.6;">${report.operational_summary}</p>
            </div>
        </div>

        <div class="form-grid" style="margin-top:20px;">
            <div>
                <h4 style="margin-bottom:8px;font-size:0.9rem;">✅ Key Successes</h4>
                <ul style="padding-left:18px;font-size:0.88rem;">${successesHtml}</ul>
            </div>
            <div>
                <h4 style="margin-bottom:8px;font-size:0.9rem;">⚠ Areas for Improvement</h4>
                <ul style="padding-left:18px;font-size:0.88rem;">${improvementsHtml}</ul>
            </div>
        </div>
    `;
}
