registerPage('reports', initReports);

async function initReports() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="loading-state"><div class="spinner"></div></div>
    `;

    try {
        const events = await api.get('/events');
        // Only show reports for completed events, or all if none completed for demo
        const activeEvent = events.length > 0 ? events[0] : null;

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

function renderReports(activeEvent) {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="toolbar fade-in stagger-1">
            <p>Post-Event Report for: <strong>${activeEvent.title}</strong></p>
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
    `;
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

    let successesHtml = report.key_successes.map(s => `<li style="margin-bottom:6px; color:#43e97b;">${s}</li>`).join('');
    let improvementsHtml = report.areas_for_improvement.map(i => `<li style="margin-bottom:6px; color:#f5a623;">${i}</li>`).join('');

    feedEl.innerHTML = `
        <div class="ai-alert-card" style="border-left-color: #4facfe;">
            <strong>Estimated Sponsor ROI</strong>
            <p style="margin: 10px 0; font-size: 1.5rem; font-weight: bold; color: var(--text-primary);">
                ${report.sponsor_roi_percentage}%
            </p>
        </div>
        
        <div class="form-grid" style="margin-top: 20px;">
            <div>
                <h4 style="margin-bottom: 10px; font-size: 0.9rem;">Financial Summary</h4>
                <p class="text-muted" style="font-size: 0.88rem; line-height: 1.5;">${report.financial_summary}</p>
            </div>
            <div>
                <h4 style="margin-bottom: 10px; font-size: 0.9rem;">Operational Summary</h4>
                <p class="text-muted" style="font-size: 0.88rem; line-height: 1.5;">${report.operational_summary}</p>
            </div>
        </div>
        
        <div class="form-grid" style="margin-top: 20px;">
            <div>
                <h4 style="margin-bottom: 10px; font-size: 0.9rem;">Key Successes</h4>
                <ul style="padding-left: 20px; font-size: 0.88rem;">${successesHtml}</ul>
            </div>
            <div>
                <h4 style="margin-bottom: 10px; font-size: 0.9rem;">Areas For Improvement</h4>
                <ul style="padding-left: 20px; font-size: 0.88rem;">${improvementsHtml}</ul>
            </div>
        </div>
    `;
}
