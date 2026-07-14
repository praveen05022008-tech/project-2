registerPage('command-center', initCommandCenter);

let ccPollInterval = null;
let ccEvents = [];

async function initCommandCenter() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="loading-state"><div class="spinner"></div></div>
    `;

    try {
        ccEvents = await api.get('/events');
        const activeEvent = ccEvents.length > 0 ? ccEvents[0] : null;

        if (!activeEvent) {
            container.innerHTML = `<div class="card"><div class="card-body">No active events found.</div></div>`;
            return;
        }

        startCommandCenter(activeEvent);

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="card"><div class="card-body text-danger">Failed to load Command Center data.</div></div>`;
    }
}

function startCommandCenter(activeEvent) {
    renderCommandCenter(activeEvent);

    // Start polling simulation for the selected event
    fetchLiveData(activeEvent.id);
    if (ccPollInterval) clearInterval(ccPollInterval);
    ccPollInterval = setInterval(() => fetchLiveData(activeEvent.id), 10000);
}

function selectCcEvent(id) {
    const ev = ccEvents.find(e => String(e.id) === String(id));
    if (!ev) return;
    startCommandCenter(ev);
}

// Cleanup interval if user navigates away
window.addEventListener('hashchange', () => {
    if (window.location.hash !== '#command-center' && ccPollInterval) {
        clearInterval(ccPollInterval);
    }
});

function renderCommandCenter(activeEvent) {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="toolbar fade-in stagger-1">
            ${eventSelectorHTML(ccEvents, activeEvent.id, 'selectCcEvent')}
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-primary" onclick="fetchLiveData(${activeEvent.id})">
                    <i class="material-icons-round">refresh</i> Force Refresh
                </button>
                <button class="btn btn-secondary" onclick="openUpdateMetricsModal(${activeEvent.id})">
                    <i class="material-icons-round">edit</i> Update Metrics
                </button>
            </div>
        </div>

        <div class="stats-grid fade-in stagger-2">
            <div class="traffic-light-card" id="health-crowd">
                <div class="traffic-light healthy"></div>
                <h4>Crowd Health</h4>
                <p class="stat-label">Normal</p>
            </div>
            <div class="traffic-light-card" id="health-food">
                <div class="traffic-light healthy"></div>
                <h4>Food Inventory</h4>
                <p class="stat-label">Adequate</p>
            </div>
            <div class="traffic-light-card" id="health-vendor">
                <div class="traffic-light healthy"></div>
                <h4>Vendors</h4>
                <p class="stat-label">All Arrived</p>
            </div>
            <div class="traffic-light-card" id="health-overall">
                <div class="traffic-light healthy"></div>
                <h4>Overall System</h4>
                <p class="stat-label">Optimal</p>
            </div>
        </div>

        <div class="form-grid fade-in stagger-3">
            <div class="card">
                <div class="card-header">
                    <h3><i class="material-icons-round" style="vertical-align: middle;">sensors</i> AI Risk Predictions</h3>
                </div>
                <div class="card-body" id="ai-predictions-feed">
                    <p class="text-muted">Waiting for AI analysis...</p>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3><i class="material-icons-round" style="vertical-align: middle;">map</i> Crowd Heatmap</h3>
                </div>
                <div class="card-body" id="crowd-heatmap">
                    <p class="text-muted">Loading live zones...</p>
                </div>
            </div>
        </div>
    `;
}

async function fetchLiveData(eventId) {
    try {
        const live = await api.get(`/operations/live/${eventId}`);
        const prediction = await api.get(`/operations/predict/${eventId}`);
        updateCCUI(live, prediction);
    } catch (error) {
        console.error("Failed to fetch live data", error);
    }
}

function updateCCUI(live, prediction) {
    // Update Crowd Heatmap
    const heatmapEl = document.getElementById('crowd-heatmap');
    if (heatmapEl) {
        let heatmapHtml = '';
        for (const [zone, density] of Object.entries(live.metrics.crowd_density)) {
            let color = 'rgba(67, 233, 123, 0.1)';
            if (density > 60) color = 'rgba(245, 166, 35, 0.1)';
            if (density > 80) color = 'rgba(245, 87, 108, 0.1)';
            
            heatmapHtml += `
                <div class="heatmap-zone" style="background: ${color};">
                    <strong>${zone}</strong>
                    <span>${density}% Capacity</span>
                </div>
            `;
        }
        heatmapEl.innerHTML = heatmapHtml;
    }

    // Update AI Predictions
    const feedEl = document.getElementById('ai-predictions-feed');
    if (feedEl && prediction.issues) {
        if (prediction.issues.length === 0) {
            feedEl.innerHTML = `<div class="ai-alert-card"><p>✅ No current risks detected. Running smoothly.</p></div>`;
        } else {
            let issuesHtml = '';
            prediction.issues.forEach(issue => {
                const critical = issue.severity.toLowerCase() === 'high' ? 'critical' : '';
                issuesHtml += `
                    <div class="ai-alert-card ${critical}">
                        <strong>[${issue.severity}] ${issue.description}</strong>
                        <p class="text-muted" style="margin-top:5px;">💡 AI Action: ${issue.recommendation}</p>
                    </div>
                `;
            });
            feedEl.innerHTML = issuesHtml;
        }
        
        if (prediction.resource_optimization) {
            feedEl.innerHTML += `
                <div class="ai-alert-card" style="border-left-color: #4facfe;">
                    <strong>Resource Optimizer</strong>
                    <p class="text-muted">${prediction.resource_optimization}</p>
                </div>
            `;
        }
    }

    setLight('overall', prediction.overall_health);
    if (live.metrics.food_inventory_percent < 30) setLight('food', 'Warning');
    else setLight('food', 'Healthy');
    
    let maxCrowd = Math.max(...Object.values(live.metrics.crowd_density));
    if (maxCrowd > 80) setLight('crowd', 'Critical');
    else if (maxCrowd > 60) setLight('crowd', 'Warning');
    else setLight('crowd', 'Healthy');
}

function setLight(id, status) {
    const el = document.getElementById(`health-${id}`);
    if (!el) return;
    const light = el.querySelector('.traffic-light');
    const label = el.querySelector('.stat-label');
    
    light.className = 'traffic-light';
    const s = status.toLowerCase();
    
    if (s.includes('warn') || s.includes('medium')) {
        light.classList.add('warning');
        label.textContent = "Warning";
    } else if (s.includes('crit') || s.includes('high') || s.includes('over')) {
        light.classList.add('critical');
        label.textContent = "Critical";
    } else {
        light.classList.add('healthy');
        label.textContent = "Optimal";
    }
}

window.openUpdateMetricsModal = async function(eventId) {
    try {
        const live = await api.get(`/operations/live/${eventId}`);
        const data = live.metrics;
        const html = `
            <form id="update-metrics-form">
                <div class="form-group">
                    <label>Zone A Crowd Density (%)</label>
                    <input type="number" id="um-zone-a" class="form-control" value="${data.crowd_density['Zone A (Main Hall)']}" min="0" max="100">
                </div>
                <div class="form-group">
                    <label>Zone B Crowd Density (%)</label>
                    <input type="number" id="um-zone-b" class="form-control" value="${data.crowd_density['Zone B (Food Court)']}" min="0" max="100">
                </div>
                <div class="form-group">
                    <label>Entrance Queue (%)</label>
                    <input type="number" id="um-entrance" class="form-control" value="${data.crowd_density['Entrance']}" min="0" max="100">
                </div>
                <div class="form-group">
                    <label>Food Inventory (%)</label>
                    <input type="number" id="um-food" class="form-control" value="${data.food_inventory_percent}" min="0" max="100">
                </div>
                <div class="form-group">
                    <label>Active Staff</label>
                    <input type="number" id="um-staff" class="form-control" value="${data.active_staff}" min="0">
                </div>
                <div style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Updates</button>
                </div>
            </form>
        `;
        openModal("Update Live Metrics", html);

        document.getElementById('update-metrics-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                zone_a_crowd: parseInt(document.getElementById('um-zone-a').value),
                zone_b_crowd: parseInt(document.getElementById('um-zone-b').value),
                entrance_queue: parseInt(document.getElementById('um-entrance').value),
                food_inventory_percent: parseInt(document.getElementById('um-food').value),
                staff_active: parseInt(document.getElementById('um-staff').value)
            };

            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';

            try {
                await api.post(`/operations/live/${eventId}`, payload);
                closeModal();
                if (typeof showToast === 'function') showToast("Live metrics updated successfully", "success");
                fetchLiveData(eventId); // Refresh right away
            } catch (err) {
                console.error(err);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Updates';
                if (typeof showToast === 'function') showToast("Failed to update metrics", "error");
            }
        });
    } catch (err) {
        console.error(err);
        if (typeof showToast === 'function') showToast("Failed to load current metrics", "error");
    }
}
