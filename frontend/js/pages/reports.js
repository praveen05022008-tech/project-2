registerPage('reports', initReports);

let reportsEvents = [];
let lastReport = null;
let lastFeedback = null;

async function initReports() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="loading-state"><div class="spinner"></div></div>
    `;

    try {
        reportsEvents = await api.get('/my-events');
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
        lastFeedback = s;
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

// Attractive circular charts (2 gauges + 1 donut). `o` themes for screen vs PDF.
function reportCharts(r, o) {
    const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
    const util = r.planned_budget > 0 ? (r.actual_total_cost / r.planned_budget * 100) : 0;
    const utilColor = util > 100 ? '#f5576c' : (util >= 85 ? '#f5a623' : '#43e97b');
    const attColor = r.attendance_rate_pct >= 90 ? '#43e97b' : (r.attendance_rate_pct >= 60 ? '#f5a623' : '#f5576c');
    const g = { textColor: o.textColor, mutedColor: o.mutedColor, track: o.track };

    const budgetG = svgGauge(util, { ...g, color: utilColor, centerText: Math.round(util) + '%', label: 'of budget' });
    const attG = svgGauge(r.attendance_rate_pct, { ...g, color: attColor, label: 'of target' });
    const revenueD = svgDonut([
        { label: 'Cost', value: r.actual_total_cost, color: '#f5a623' },
        { label: 'Profit', value: Math.max(0, r.projected_profit), color: '#43e97b' },
    ], 'Event ROI', { textColor: o.textColor, mutedColor: o.mutedColor, fmt: inr, centerValue: r.event_roi_pct + '%' });

    const card = (title, chart, center) => `
        <div style="${o.cardStyle}">
            <div style="font-size:0.88rem;font-weight:600;color:${o.textColor};margin-bottom:10px;">${title}</div>
            <div style="display:flex;justify-content:center;align-items:center;">${chart}</div>
        </div>`;

    return `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;">
            ${card('Budget Utilization', `<div style="text-align:center;">${budgetG}</div>`)}
            ${card('Attendance', `<div style="text-align:center;">${attG}</div>`)}
            ${card('Revenue vs Cost', revenueD)}
        </div>`;
}

const REPORT_CHART_SCREEN = {
    textColor: 'var(--text-primary)', mutedColor: 'var(--text-muted)',
    track: 'rgba(150,160,200,0.18)',
    cardStyle: 'background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:16px;',
};
const REPORT_CHART_PDF = {
    textColor: '#111', mutedColor: '#667085', track: '#eceff5',
    cardStyle: 'border:1px solid #e3e7ef;border-radius:10px;padding:14px;flex:1;',
};

function updateReportUI(report) {
    const feedEl = document.getElementById('report-feed');
    if (!feedEl) return;
    lastReport = report;

    const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
    const varColor = report.budget_variance >= 0 ? '#43e97b' : '#f5576c';
    const successesHtml = report.key_successes.map(s => `<li style="margin-bottom:6px;color:#43e97b;">${s}</li>`).join('') || '<li class="text-muted">—</li>';
    const improvementsHtml = report.areas_for_improvement.map(i => `<li style="margin-bottom:6px;color:#f5a623;">${i}</li>`).join('') || '<li class="text-muted">None flagged</li>';

    const chartsHtml = reportCharts(report, REPORT_CHART_SCREEN);

    feedEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:8px;">
                ${report.ai_enabled ? '<span class="badge badge-upcoming">AI executive summary</span>' : '<span class="badge badge-inactive">rule-based</span>'}
                <span class="badge badge-completed">${report.status}</span>
            </div>
            <button class="btn btn-primary btn-sm" onclick="downloadReportPDF()"><span class="material-icons-round">picture_as_pdf</span> Download PDF</button>
        </div>

        <div class="ai-alert-card" style="border-left-color:#4facfe;margin-bottom:18px;">
            <strong>Executive Summary</strong>
            <p style="margin-top:8px;color:var(--text-secondary);line-height:1.6;">${report.executive_summary}</p>
        </div>

        <div class="stats-grid" style="margin-bottom:16px;">
            <div class="stat-card"><div class="stat-label">Budget Variance</div><div class="stat-value" style="color:${varColor}">${inr(report.budget_variance)}</div><div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">${report.variance_pct}% of plan</div></div>
            <div class="stat-card"><div class="stat-label">Attendance Rate</div><div class="stat-value">${report.attendance_rate_pct}%</div><div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">${report.actual_attendance.toLocaleString()} / ${report.expected_attendance.toLocaleString()}</div></div>
            <div class="stat-card"><div class="stat-label">Sponsor ROI</div><div class="stat-value">${report.sponsor_roi_percentage}%</div><div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">${report.leads_captured} leads · ${report.booth_scans} scans</div></div>
            <div class="stat-card"><div class="stat-label">Event ROI</div><div class="stat-value">${report.event_roi_pct}%</div><div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">profit ${inr(report.projected_profit)}</div></div>
        </div>

        <div style="margin-bottom:18px;">
            ${chartsHtml}
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

// ── One-click PDF download (light, print-clean layout → jsPDF) ──────────────
async function downloadReportPDF() {
    if (!lastReport) { showToast('Generate a report first', 'error'); return; }
    if (!window.jspdf || !window.html2canvas) { showToast('PDF engine still loading — try again', 'error'); return; }
    const r = lastReport;
    const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
    showToast('Generating PDF…', 'info');

    const kpi = (label, val, sub) => `<div style="flex:1;border:1px solid #e3e7ef;border-radius:10px;padding:12px;">
        <div style="font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:.5px;">${label}</div>
        <div style="font-size:20px;font-weight:800;color:#111;margin-top:4px;">${val}</div>
        <div style="font-size:11px;color:#98a2b3;margin-top:2px;">${sub || ''}</div></div>`;

    let fb = '';
    if (lastFeedback && lastFeedback.count) {
        const f = lastFeedback;
        fb = `<h3 style="margin:18px 0 8px;color:#111;font-size:15px;">Attendee Feedback</h3>
            <p style="font-size:12px;color:#333;">Average ${f.average_rating}/5 · ${f.count} responses · NPS ${f.nps}</p>
            <p style="font-size:12px;color:#555;margin-top:6px;"><strong>Sentiment:</strong> ${f.sentiment}</p>`;
    }

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:760px;background:#fff;color:#111;padding:36px;font-family:Inter,Arial,sans-serif;';
    wrap.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #667eea;padding-bottom:14px;margin-bottom:18px;">
            <div><div style="font-size:22px;font-weight:800;color:#667eea;">EventoPro</div>
                 <div style="font-size:13px;color:#667085;">Post-Event Business Report</div></div>
            <div style="text-align:right;font-size:12px;color:#667085;">${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>
        </div>
        <h1 style="font-size:20px;color:#111;margin-bottom:2px;">${r.event_title}</h1>
        <div style="font-size:12px;color:#667085;margin-bottom:16px;">Status: ${r.status}</div>

        <div style="display:flex;gap:10px;margin-bottom:18px;">
            ${kpi('Budget Variance', inr(r.budget_variance), r.variance_pct + '% of plan')}
            ${kpi('Attendance', r.attendance_rate_pct + '%', r.actual_attendance + ' / ' + r.expected_attendance)}
            ${kpi('Sponsor ROI', r.sponsor_roi_percentage + '%', r.leads_captured + ' leads')}
            ${kpi('Event ROI', r.event_roi_pct + '%', 'profit ' + inr(r.projected_profit))}
        </div>

        <div style="display:flex;gap:14px;margin-bottom:18px;">
            ${reportCharts(r, REPORT_CHART_PDF)}
        </div>

        <h3 style="font-size:15px;color:#111;margin:14px 0 6px;">Executive Summary</h3>
        <p style="font-size:12px;color:#333;line-height:1.6;">${r.executive_summary}</p>
        <div style="display:flex;gap:20px;margin-top:14px;">
            <div style="flex:1;"><h3 style="font-size:14px;color:#111;margin-bottom:6px;">Financial</h3>
                <p style="font-size:12px;color:#444;line-height:1.6;">${r.financial_summary}</p></div>
            <div style="flex:1;"><h3 style="font-size:14px;color:#111;margin-bottom:6px;">Operational</h3>
                <p style="font-size:12px;color:#444;line-height:1.6;">${r.operational_summary}</p></div>
        </div>
        <div style="display:flex;gap:20px;margin-top:14px;">
            <div style="flex:1;"><h3 style="font-size:14px;color:#15803d;margin-bottom:6px;">Key Successes</h3>
                <ul style="font-size:12px;color:#333;padding-left:16px;">${(r.key_successes||[]).map(s=>`<li style="margin-bottom:4px;">${s}</li>`).join('')||'<li>—</li>'}</ul></div>
            <div style="flex:1;"><h3 style="font-size:14px;color:#b45309;margin-bottom:6px;">Areas for Improvement</h3>
                <ul style="font-size:12px;color:#333;padding-left:16px;">${(r.areas_for_improvement||[]).map(s=>`<li style="margin-bottom:4px;">${s}</li>`).join('')||'<li>None</li>'}</ul></div>
        </div>
        ${fb}
    `;
    document.body.appendChild(wrap);
    try {
        const canvas = await html2canvas(wrap, { scale: 2, backgroundColor: '#ffffff' });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageW = 210, pageH = 297;
        const imgW = pageW;
        const imgH = canvas.height * imgW / canvas.width;
        const img = canvas.toDataURL('image/png');
        let heightLeft = imgH, position = 0;
        pdf.addImage(img, 'PNG', 0, position, imgW, imgH);
        heightLeft -= pageH;
        while (heightLeft > 0) {
            position -= pageH;
            pdf.addPage();
            pdf.addImage(img, 'PNG', 0, position, imgW, imgH);
            heightLeft -= pageH;
        }
        pdf.save(`report-${(r.event_title || 'event').replace(/[^a-z0-9]+/gi, '_')}.pdf`);
        showToast('PDF downloaded', 'success');
    } catch (e) {
        console.error(e);
        showToast('PDF generation failed', 'error');
    } finally {
        wrap.remove();
    }
}
