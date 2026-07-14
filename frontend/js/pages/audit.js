registerPage('audit-logs', initAuditLogs);

const auditFilters = { role: '', method: '', search: '' };

async function initAuditLogs() {
    const container = document.getElementById('page-container');
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;

    try {
        const summary = await api.get('/audit-logs/summary');
        renderAuditShell(summary);
        loadAuditRows();
    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="card"><div class="card-body text-danger">
            Failed to load audit logs. This section is available to Super Admins only.
        </div></div>`;
    }
}

function renderAuditShell(summary) {
    const container = document.getElementById('page-container');
    const roles = ['', 'SUPER_ADMIN', 'ORGANIZER', 'STAFF', 'VENDOR', 'SPONSOR', 'ATTENDEE'];
    const methods = ['', 'POST', 'PUT', 'PATCH', 'DELETE'];

    const roleOpts = roles.map(r => `<option value="${r}">${r || 'All roles'}</option>`).join('');
    const methodOpts = methods.map(m => `<option value="${m}">${m || 'All actions'}</option>`).join('');

    container.innerHTML = `
        <div class="dashboard-header animate-fade-in stagger-1" style="margin-bottom:20px;">
            <h3 style="font-size:1.6rem;color:var(--text-primary);">Audit Trail</h3>
            <p style="color:var(--text-muted);">Every state-changing action across all roles. Total recorded: <strong>${summary.total}</strong>.</p>
        </div>

        <div class="toolbar fade-in stagger-2" style="gap:10px;flex-wrap:wrap;">
            <div class="event-picker" style="padding:0 10px;">
                <span class="material-icons-round">badge</span>
                <select class="event-select" id="audit-role" onchange="setAuditFilter('role', this.value)">${roleOpts}</select>
            </div>
            <div class="event-picker" style="padding:0 10px;">
                <span class="material-icons-round">bolt</span>
                <select class="event-select" id="audit-method" onchange="setAuditFilter('method', this.value)">${methodOpts}</select>
            </div>
            <div class="search-box" style="flex:1;min-width:200px;">
                <span class="material-icons-round">search</span>
                <input type="text" id="audit-search" class="form-input" placeholder="Search actions…"
                       oninput="setAuditFilter('search', this.value)">
            </div>
            <button class="btn btn-secondary" onclick="loadAuditRows()">
                <span class="material-icons-round">refresh</span> Refresh
            </button>
        </div>

        <div class="card card-glow fade-in stagger-3" style="margin-top:16px;">
            <div class="card-body" style="padding:0;">
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Time</th><th>User</th><th>Role</th>
                                <th>Action</th><th>Method</th><th>Status</th>
                            </tr>
                        </thead>
                        <tbody id="audit-tbody">
                            <tr><td colspan="6" style="text-align:center;padding:24px;">Loading…</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

let _auditDebounce;
function setAuditFilter(key, value) {
    auditFilters[key] = value;
    clearTimeout(_auditDebounce);
    _auditDebounce = setTimeout(loadAuditRows, key === 'search' ? 300 : 0);
}

function auditRoleBadge(role) {
    if (!role) return '<span class="badge badge-inactive">—</span>';
    return `<span class="badge badge-upcoming">${role}</span>`;
}

function auditStatusBadge(code) {
    let cls = 'badge-completed';
    if (code >= 500) cls = 'badge-cancelled';
    else if (code === 403 || code === 401) cls = 'badge-cancelled';
    else if (code >= 400) cls = 'badge-progress';
    return `<span class="badge ${cls}">${code ?? '—'}</span>`;
}

async function loadAuditRows() {
    const tbody = document.getElementById('audit-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;">Loading…</td></tr>`;

    const params = new URLSearchParams();
    if (auditFilters.role) params.set('role', auditFilters.role);
    if (auditFilters.method) params.set('method', auditFilters.method);
    if (auditFilters.search) params.set('search', auditFilters.search);
    params.set('limit', '200');

    try {
        const data = await api.get(`/audit-logs?${params.toString()}`);
        if (!data.logs.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No matching activity.</td></tr>`;
            return;
        }
        tbody.innerHTML = data.logs.map(l => {
            const t = l.created_at ? new Date(l.created_at).toLocaleString('en-IN', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
            }) : '—';
            return `<tr>
                <td style="white-space:nowrap;">${t}</td>
                <td>${l.user_email || '<span style="color:var(--text-muted)">anonymous</span>'}</td>
                <td>${auditRoleBadge(l.user_role)}</td>
                <td>${l.action}</td>
                <td><code style="font-size:0.8rem;">${l.method || '—'}</code></td>
                <td>${auditStatusBadge(l.status_code)}</td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;" class="text-danger">Failed to load logs.</td></tr>`;
    }
}
