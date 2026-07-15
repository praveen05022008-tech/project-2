registerPage('budget', initBudget);

let budgetEvents = [];

async function initBudget() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="loading-state"><div class="spinner"></div></div>
    `;

    try {
        budgetEvents = await api.get('/events');
        const activeEvent = budgetEvents.length > 0 ? budgetEvents[0] : null;

        if (!activeEvent) {
            container.innerHTML = `<div class="card"><div class="card-body">No active events found.</div></div>`;
            return;
        }

        renderBudget(activeEvent);
        fetchBudgetAnalysis(activeEvent.id);

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="card"><div class="card-body text-danger">Failed to load Budget AI data.</div></div>`;
    }
}

function selectBudgetEvent(id) {
    const ev = budgetEvents.find(e => String(e.id) === String(id));
    if (!ev) return;
    renderBudget(ev);
    fetchBudgetAnalysis(ev.id);
}

function renderBudget(activeEvent) {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="toolbar fade-in stagger-1">
            ${eventSelectorHTML(budgetEvents, activeEvent.id, 'selectBudgetEvent')}
            <button class="btn btn-primary" onclick="fetchBudgetAnalysis(${activeEvent.id})">
                <i class="material-icons-round">analytics</i> Recalculate
            </button>
        </div>

        <div class="stats-grid fade-in stagger-2" id="budget-kpis">
            <div class="stat-card"><div class="stat-label">Planned Budget</div><div class="stat-value">₹${(activeEvent.budget||0).toLocaleString()}</div></div>
            <div class="stat-card"><div class="stat-label">Projected Cost</div><div class="stat-value">…</div></div>
            <div class="stat-card"><div class="stat-label">Remaining</div><div class="stat-value">…</div></div>
            <div class="stat-card"><div class="stat-label">Cost / Attendee</div><div class="stat-value">…</div></div>
        </div>

        <div class="content-grid fade-in stagger-3" style="align-items:start;">
            <div class="card">
                <div class="card-header"><h3><i class="material-icons-round" style="vertical-align:middle;">pie_chart</i> Cost Breakdown</h3></div>
                <div class="card-body" id="budget-breakdown"><p class="text-muted">Calculating…</p></div>
            </div>
            <div class="card">
                <div class="card-header"><h3><i class="material-icons-round" style="vertical-align:middle;">insights</i> Budget Intelligence</h3></div>
                <div class="card-body" id="ai-budget-feed"><p class="text-muted">Analyzing costs…</p></div>
            </div>
        </div>
    `;
}

async function fetchBudgetAnalysis(eventId) {
    try {
        const analysis = await api.get(`/budget/analysis/${eventId}`);
        updateBudgetUI(analysis);
    } catch (error) {
        console.error("Failed to fetch budget analysis", error);
        const feedEl = document.getElementById('ai-budget-feed');
        if (feedEl) feedEl.innerHTML = `<p class="text-danger">${error.message || 'Failed to run budget analysis.'}</p>`;
    }
}

function budgetStatusColor(status) {
    const s = (status || '').toLowerCase();
    if (s.includes('over')) return '#f5576c';
    if (s.includes('warning')) return '#f5a623';
    if (s.includes('no budget')) return 'var(--text-muted)';
    return '#43e97b';
}

function inr(n) { return '₹' + Math.round(n || 0).toLocaleString('en-IN'); }

function updateBudgetUI(a) {
    // KPI cards
    const kpis = document.getElementById('budget-kpis');
    if (kpis) {
        const remColor = a.remaining < 0 ? '#f5576c' : '#43e97b';
        kpis.innerHTML = `
            <div class="stat-card"><div class="stat-label">Planned Budget</div><div class="stat-value">${inr(a.planned_budget)}</div></div>
            <div class="stat-card"><div class="stat-label">Projected Cost</div><div class="stat-value" style="color:${budgetStatusColor(a.status)}">${inr(a.projected_final_cost)}</div></div>
            <div class="stat-card"><div class="stat-label">Remaining</div><div class="stat-value" style="color:${remColor}">${inr(a.remaining)}</div></div>
            <div class="stat-card"><div class="stat-label">Cost / Attendee</div><div class="stat-value">${inr(a.cost_per_attendee)}</div></div>
        `;
    }

    // Breakdown bars + utilization gauge
    const bd = document.getElementById('budget-breakdown');
    if (bd) {
        const total = a.breakdown.reduce((s, x) => s + x.amount, 0) || 1;
        const util = Math.min(a.utilization_pct, 100);
        const utilColor = budgetStatusColor(a.status);
        let html = `
            <div style="margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;font-size:0.85rem;color:var(--text-secondary);margin-bottom:6px;">
                    <span>Budget utilization</span><span style="color:${utilColor};font-weight:600;">${a.utilization_pct.toFixed(0)}%</span>
                </div>
                <div style="height:10px;background:var(--bg-tertiary);border-radius:6px;overflow:hidden;">
                    <div style="height:100%;width:${util}%;background:${utilColor};transition:width .5s;"></div>
                </div>
            </div>`;
        if (a.breakdown.length) {
            html += a.breakdown.map(b => {
                const pct = (b.amount / total * 100).toFixed(0);
                return `<div style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:4px;">
                        <span style="color:var(--text-primary);">${b.label}</span>
                        <span style="color:var(--text-secondary);">${inr(b.amount)} · ${pct}%</span>
                    </div>
                    <div style="height:6px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden;">
                        <div style="height:100%;width:${pct}%;background:var(--accent-gradient);"></div>
                    </div>
                </div>`;
            }).join('');
        } else {
            html += '<p class="text-muted">No costs recorded yet for this event.</p>';
        }
        bd.innerHTML = html;
    }

    // Intelligence feed: status, narrative, risks, recommendations
    const feed = document.getElementById('ai-budget-feed');
    if (feed) {
        const color = budgetStatusColor(a.status);
        let html = `
            <div class="ai-alert-card" style="border-left-color:${color};background:${color}14;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="badge" style="background:${color};color:#0b0d12;">${a.status}</span>
                    ${a.ai_enabled ? '<span class="badge badge-upcoming">AI narrative</span>' : '<span class="badge badge-inactive">rule-based</span>'}
                </div>
                <p style="margin:10px 0;color:var(--text-secondary);">${a.analysis}</p>
                ${a.margin !== null ? `<p style="font-size:0.85rem;color:var(--text-muted);">Expected revenue ${inr(a.expected_revenue)} · margin ${inr(a.margin)}</p>` : ''}
            </div>`;
        if (a.risk_flags && a.risk_flags.length) {
            html += `<h4 style="margin:16px 0 8px;font-size:0.9rem;color:#f5576c;">⚠ Risk flags</h4>
                <ul style="padding-left:18px;color:var(--text-secondary);font-size:0.85rem;">
                ${a.risk_flags.map(r => `<li style="margin-bottom:6px;">${r}</li>`).join('')}</ul>`;
        }
        html += `<h4 style="margin:16px 0 8px;font-size:0.9rem;">Recommendations</h4>
            <ul style="padding-left:18px;color:var(--text-secondary);font-size:0.85rem;">
            ${a.recommendations.map(r => `<li style="margin-bottom:6px;">${r}</li>`).join('')}</ul>`;
        feed.innerHTML = html;
    }
}
