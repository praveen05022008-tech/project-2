registerPage('command-center', initCommandCenter);

let ccPollInterval = null;
let ccEvents = [];

function isVendorCC() { return (window.currentUser || {}).role === 'VENDOR'; }

async function initCommandCenter() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="loading-state"><div class="spinner"></div></div>
    `;

    try {
        ccEvents = await api.get('/my-events');
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
    if (isVendorCC()) loadVendorCC(activeEvent.id);
    if (ccPollInterval) clearInterval(ccPollInterval);
    ccPollInterval = setInterval(() => {
        fetchLiveData(activeEvent.id);
        // Refresh pending attendance requests so new scans surface within ~10s.
        if (isVendorCC()) loadVendorRequests(activeEvent.id);
    }, 10000);
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
    if (isVendorCC()) return renderVendorCommandCenter(activeEvent);
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="toolbar fade-in stagger-1">
            ${eventSelectorHTML(ccEvents, activeEvent.id, 'selectCcEvent')}
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-primary" onclick="fetchLiveData(${activeEvent.id})">
                    <i class="material-icons-round">refresh</i> Force Refresh
                </button>
                <button class="btn btn-secondary" onclick="openUpdateMetricsModal(${activeEvent.id})">
                    <i class="material-icons-round">edit</i> Update Metrics
                </button>
                <button class="btn btn-secondary" onclick="openScanModal(${activeEvent.id})">
                    <i class="material-icons-round">qr_code_scanner</i> Record Check-in
                </button>
                <button class="btn btn-secondary" onclick="showAttendanceQR(${activeEvent.id}, '${activeEvent.title.replace(/'/g, "\\'")}')">
                    <i class="material-icons-round">qr_code_2</i> Attendance QR
                </button>
                <button class="btn btn-secondary" onclick="openAttendanceRoster(${activeEvent.id}, '${activeEvent.title.replace(/'/g, "\\'")}')">
                    <i class="material-icons-round">how_to_reg</i> Staff Attendance
                </button>
                <button class="btn btn-secondary" onclick="openCrowdNotify(${activeEvent.id}, '${activeEvent.title.replace(/'/g, "\\'")}')">
                    <i class="material-icons-round">campaign</i> Notify Crowd
                </button>
                <button class="btn btn-secondary" onclick="showParticipantQR(${activeEvent.id}, '${activeEvent.title.replace(/'/g, "\\'")}')">
                    <i class="material-icons-round">badge</i> My Attendance QR
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

// ═══════════════════════════════════════════════════════════════════════════
//  Vendor Command Center — same layout/design as the organiser's, scoped to a
//  vendor: crowd status (read-only) + Attendance QR + Staff Attendance +
//  My Attendance QR with inline Accept/Decline requests + Notifications.
// ═══════════════════════════════════════════════════════════════════════════
function renderVendorCommandCenter(activeEvent) {
    const container = document.getElementById('page-container');
    const t = activeEvent.title.replace(/'/g, "\\'");
    container.innerHTML = `
        <div class="toolbar fade-in stagger-1">
            ${eventSelectorHTML(ccEvents, activeEvent.id, 'selectCcEvent')}
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-primary" onclick="fetchLiveData(${activeEvent.id});loadVendorCC(${activeEvent.id});">
                    <i class="material-icons-round">refresh</i> Force Refresh
                </button>
                <button class="btn btn-secondary" onclick="showAttendanceQR(${activeEvent.id}, '${t}')">
                    <i class="material-icons-round">qr_code_2</i> Attendance QR
                </button>
                <button class="btn btn-secondary" onclick="openAttendanceRoster(${activeEvent.id}, '${t}')">
                    <i class="material-icons-round">how_to_reg</i> Staff Attendance
                </button>
                <button class="btn btn-secondary" onclick="showParticipantQR(${activeEvent.id}, '${t}')">
                    <i class="material-icons-round">badge</i> My Attendance QR
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

        <div class="form-grid fade-in stagger-4" style="margin-top:20px;">
            <div class="card">
                <div class="card-header">
                    <h3><i class="material-icons-round" style="vertical-align: middle;">badge</i> My Attendance QR</h3>
                    <button class="btn btn-secondary btn-sm" onclick="loadVendorCC(${activeEvent.id})"><i class="material-icons-round">refresh</i></button>
                </div>
                <div class="card-body">
                    <div style="text-align:center;">
                        <div id="vcc-qr" style="background:#fff;padding:14px;border-radius:12px;display:inline-block;line-height:0;min-height:60px;"></div>
                        <p class="text-muted" style="font-size:0.82rem;margin-top:10px;">Show this to a staff member. Scanned requests appear below — you decide.</p>
                    </div>
                    <h4 style="margin:16px 0 10px;font-size:0.95rem;color:var(--text-primary);">Pending Attendance Requests</h4>
                    <div id="vcc-requests"><div class="loading-state"><div class="spinner"></div></div></div>
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <h3><i class="material-icons-round" style="vertical-align: middle;">notifications</i> Notifications</h3>
                </div>
                <div class="card-body" id="vcc-notifs"><div class="loading-state"><div class="spinner"></div></div></div>
            </div>
        </div>
    `;
}

async function loadVendorCC(eventId) {
    loadVendorQR(eventId);
    loadVendorRequests(eventId);
    loadVendorNotifs();
}

async function loadVendorQR(eventId) {
    const el = document.getElementById('vcc-qr');
    if (!el) return;
    try {
        const q = await api.get(`/attendance/my-qr/${eventId}`);
        el.innerHTML = '';
        if (window.QRCode) new QRCode(el, { text: q.code, width: 170, height: 170, colorDark: '#0b0d12', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.M });
    } catch (err) {
        el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem;padding:20px;">${err.message || 'QR unavailable'}</div>`;
    }
}

async function loadVendorRequests(eventId) {
    const el = document.getElementById('vcc-requests');
    if (!el) return;
    let rows = [];
    try { rows = await api.get('/attendance/requests'); } catch (_) { rows = []; }
    const pending = (rows || []).filter(r => r.status === 'Pending' && r.event_id === eventId);
    if (!pending.length) { el.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">No pending attendance requests.</p>'; return; }
    el.innerHTML = pending.map(r => {
        const when = r.created_at ? new Date(r.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        const staff = r.requested_by || 'A staff member';
        return `<div class="ai-alert-card" style="margin-bottom:10px;">
            <div><strong style="color:var(--text-primary);">${staff}</strong> scanned your QR</div>
            <div class="text-muted" style="font-size:0.82rem;margin-top:4px;">
                <span class="material-icons-round" style="font-size:13px;vertical-align:middle;">event</span> ${r.event_title}
                &nbsp;·&nbsp;<span class="material-icons-round" style="font-size:13px;vertical-align:middle;">schedule</span> ${when}
            </div>
            <div style="display:flex;gap:8px;margin-top:10px;">
                <button class="btn btn-primary btn-sm" onclick="ccRespondRequest(${r.id}, true, ${eventId})"><span class="material-icons-round">check</span> Accept</button>
                <button class="btn btn-secondary btn-sm" onclick="ccRespondRequest(${r.id}, false, ${eventId})"><span class="material-icons-round">close</span> Decline</button>
            </div>
        </div>`;
    }).join('');
}

async function ccRespondRequest(id, accept, eventId) {
    try {
        const r = await api.post(`/attendance/requests/${id}/respond`, { accept });
        showToast(r.message || (accept ? 'Attendance confirmed' : 'Request declined'), accept ? 'success' : 'info');
        loadVendorRequests(eventId);
        if (typeof loadNotifications === 'function') loadNotifications();
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
}

async function loadVendorNotifs() {
    const el = document.getElementById('vcc-notifs');
    if (!el) return;
    let items = [];
    try { items = await api.get('/notifications'); } catch (_) { items = []; }
    if (!items.length) { el.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">No notifications yet.</p>'; return; }
    el.innerHTML = items.slice(0, 8).map(n => `
        <div class="ai-alert-card" style="margin-bottom:8px;">
            <h5 style="color:var(--text-primary);font-size:0.88rem;">${n.title}</h5>
            ${n.message ? `<p style="color:var(--text-secondary);font-size:0.82rem;margin-top:3px;">${n.message}</p>` : ''}
            <time style="color:var(--text-muted);font-size:0.72rem;">${n.created_at ? new Date(n.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</time>
        </div>`).join('');
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
