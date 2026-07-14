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
                <i class="material-icons-round">analytics</i> Run AI Analysis
            </button>
        </div>

        <div class="form-grid fade-in stagger-2">
            <div class="card">
                <div class="card-header">
                    <h3><i class="material-icons-round" style="vertical-align: middle;">pie_chart</i> Budget Overview</h3>
                </div>
                <div class="card-body">
                    <div class="stats-grid" style="grid-template-columns: 1fr; margin-bottom: 0;">
                        <div class="stat-card" style="margin-bottom: 15px;">
                            <div class="stat-label">Planned Budget</div>
                            <div class="stat-value">₹${activeEvent.budget.toLocaleString()}</div>
                        </div>
                        <div class="stat-card" id="actual-cost-card" style="margin-bottom: 15px;">
                            <div class="stat-label">Current Actual Costs (Vendor + Misc)</div>
                            <div class="stat-value">Loading...</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3><i class="material-icons-round" style="vertical-align: middle;">smart_toy</i> AI Budget Prediction</h3>
                </div>
                <div class="card-body" id="ai-budget-feed">
                    <p class="text-muted">Analyzing costs and running prediction models...</p>
                </div>
            </div>
        </div>
    `;
}

async function fetchBudgetAnalysis(eventId) {
    const feedEl = document.getElementById('ai-budget-feed');
    if (feedEl) feedEl.innerHTML = '<p class="text-muted">Analyzing costs and running prediction models...</p>';
    
    try {
        const analysis = await api.get(`/budget/analysis/${eventId}`);
        updateBudgetUI(analysis);
    } catch (error) {
        console.error("Failed to fetch budget analysis", error);
        if (feedEl) feedEl.innerHTML = '<p class="text-danger">Failed to connect to AI Engine.</p>';
    }
}

function updateBudgetUI(analysis) {
    const feedEl = document.getElementById('ai-budget-feed');
    if (feedEl) {
        const isWarning = analysis.status.toLowerCase().includes('warning');
        const isOver = analysis.status.toLowerCase().includes('over');
        let alertClass = '';
        if (isOver) alertClass = 'critical';
        else if (isWarning) alertClass = 'warning';
        
        // CSS hack for warning since it doesn't exist explicitly in ai-alert-card
        const bgColor = isWarning ? 'rgba(245, 166, 35, 0.05)' : (isOver ? 'rgba(245, 87, 108, 0.05)' : 'rgba(102, 126, 234, 0.05)');
        const borderColor = isWarning ? '#f5a623' : (isOver ? '#f5576c' : 'var(--accent-primary)');

        let html = `
            <div class="ai-alert-card" style="background: ${bgColor}; border-left-color: ${borderColor};">
                <strong>Status: ${analysis.status}</strong>
                <p style="margin: 10px 0; font-size: 1.1rem;">Projected Final Cost: <strong>₹${analysis.projected_final_cost.toLocaleString()}</strong></p>
                <p class="text-muted">${analysis.analysis}</p>
            </div>
            
            <h4 style="margin: 15px 0 10px 0; font-size: 0.9rem;">AI Recommendations:</h4>
            <ul style="padding-left: 20px; color: var(--text-secondary); font-size: 0.88rem;">
        `;
        
        analysis.recommendations.forEach(rec => {
            html += `<li style="margin-bottom: 6px;">${rec}</li>`;
        });
        
        html += `</ul>`;
        feedEl.innerHTML = html;
    }

    const costCard = document.getElementById('actual-cost-card');
    if (costCard) {
        const val = costCard.querySelector('.stat-value');
        val.textContent = "AI Analysis Complete";
    }
}
