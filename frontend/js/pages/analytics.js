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

        <div class="form-grid fade-in stagger-2">
            <div class="card">
                <div class="card-header">
                    <h3><i class="material-icons-round" style="vertical-align: middle;">groups</i> Attendance Predictor</h3>
                </div>
                <div class="card-body" id="attendance-feed">
                    <p class="text-muted">Loading prediction...</p>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3><i class="material-icons-round" style="vertical-align: middle;">campaign</i> Marketing Analytics</h3>
                </div>
                <div class="card-body" id="marketing-feed">
                    <p class="text-muted">Loading analytics...</p>
                </div>
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

function updateAnalyticsUI(analysis) {
    const attendanceFeed = document.getElementById('attendance-feed');
    if (attendanceFeed) {
        const isHealthy = analysis.attendance_health === "On Track";
        attendanceFeed.innerHTML = `
            <div class="ai-alert-card" style="border-left-color: ${isHealthy ? '#43e97b' : '#f5a623'};">
                <strong>Status: ${analysis.attendance_health}</strong>
                <p style="margin: 10px 0; font-size: 1.1rem;">Predicted Final Attendance: <strong>${analysis.predicted_final_attendance}</strong></p>
            </div>
        `;
    }

    const marketingFeed = document.getElementById('marketing-feed');
    if (marketingFeed) {
        let recsHtml = '';
        analysis.growth_recommendations.forEach(r => {
            recsHtml += `<li style="margin-bottom:6px;">${r}</li>`;
        });
        
        marketingFeed.innerHTML = `
            <div class="ai-alert-card">
                <strong>Marketing ROI Score: ${analysis.marketing_roi_score}/100</strong>
                <p class="text-muted" style="margin-top: 10px;">${analysis.marketing_insights}</p>
            </div>
            <h4 style="margin: 15px 0 10px 0; font-size: 0.9rem;">Growth Recommendations:</h4>
            <ul style="padding-left: 20px; color: var(--text-secondary); font-size: 0.88rem;">
                ${recsHtml}
            </ul>
        `;
    }
}
