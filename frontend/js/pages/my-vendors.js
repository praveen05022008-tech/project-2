/* ═══════════════════════════════════════════════════════════════════════════
   EventoPro — Staff "My Vendors"
   Vendors registered for the events this staff member is assigned to, each with
   their full event history. Search + filter (by event / registration status) and
   auto-refresh so newly-registered vendors appear without a reload.
   ═══════════════════════════════════════════════════════════════════════════ */
registerPage('my-vendors', initMyVendors);

let _mvData = [];
let _mvTimer = null;

async function initMyVendors() {
    const c = document.getElementById('page-container');
    c.innerHTML = `
        <div class="toolbar fade-in stagger-1">
            <div class="search-box">
                <span class="material-icons-round">search</span>
                <input type="text" id="mv-search" placeholder="Search vendors…">
            </div>
            <select class="filter-select" id="mv-filter-event"><option value="">All events</option></select>
            <select class="filter-select" id="mv-filter-status">
                <option value="">All statuses</option>
                <option value="Pending">Pending</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Completed">Completed</option>
            </select>
        </div>
        <div id="mv-grid" class="fade-in stagger-2"><div class="loading-state"><div class="spinner"></div></div></div>`;

    document.getElementById('mv-search').addEventListener('input', debounce(renderMyVendors, 300));
    document.getElementById('mv-filter-event').addEventListener('change', renderMyVendors);
    document.getElementById('mv-filter-status').addEventListener('change', renderMyVendors);

    await loadMyVendors();

    // Auto-refresh so new vendor registrations surface without a manual reload.
    if (_mvTimer) clearInterval(_mvTimer);
    _mvTimer = setInterval(() => {
        if (!document.getElementById('mv-grid')) { clearInterval(_mvTimer); return; }
        loadMyVendors(true);
    }, 15000);
}

async function loadMyVendors(silent) {
    const grid = document.getElementById('mv-grid');
    if (!grid) return;
    try {
        _mvData = await api.get('/portal/my-vendors');
    } catch (e) {
        if (!silent) grid.innerHTML = `<div class="card"><div class="card-body text-danger">${e.message || 'Could not load vendors.'}</div></div>`;
        return;
    }
    // Populate the event filter from the vendors' events (preserve current choice).
    const sel = document.getElementById('mv-filter-event');
    if (sel) {
        const cur = sel.value;
        const evs = {};
        _mvData.forEach(v => v.events.forEach(e => { evs[e.event_id] = e.event_name; }));
        sel.innerHTML = '<option value="">All events</option>' +
            Object.entries(evs).map(([id, name]) => `<option value="${id}" ${String(id) === cur ? 'selected' : ''}>${mvEsc(name)}</option>`).join('');
    }
    renderMyVendors();
}

function mvEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function renderMyVendors() {
    const grid = document.getElementById('mv-grid');
    if (!grid) return;
    const q = (document.getElementById('mv-search')?.value || '').trim().toLowerCase();
    const evFilter = document.getElementById('mv-filter-event')?.value || '';
    const stFilter = document.getElementById('mv-filter-status')?.value || '';

    const rows = _mvData.filter(v => {
        if (q) {
            const hay = [v.name, v.company, v.category, v.email, v.phone].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        if (evFilter && !v.events.some(e => String(e.event_id) === evFilter)) return false;
        if (stFilter && !v.events.some(e => e.status === stFilter)) return false;
        return true;
    });

    if (!rows.length) {
        grid.innerHTML = `
            <div class="card"><div class="card-body">
                <div class="empty-state">
                    <span class="material-icons-round">storefront</span>
                    <h4>No vendors found</h4>
                    <p>${_mvData.length ? 'No vendors match your search or filters.' : 'No vendors are registered for your events yet.'}</p>
                </div>
            </div></div>`;
        return;
    }

    grid.innerHTML = `<div class="vendor-grid">${rows.map((v, i) => `
        <div class="vendor-card fade-in" style="animation-delay:${i * 0.04}s">
            <div class="vendor-card-top">
                <div class="vendor-card-info">
                    <h4>${mvEsc(v.name)}</h4>
                    <span class="vendor-category-badge">${mvEsc(v.category || '—')}</span>
                </div>
                ${getStatusBadge(v.status)}
            </div>
            <div class="vendor-card-details">
                <div class="vendor-detail"><span class="material-icons-round">business</span> ${mvEsc(v.company || v.name)}</div>
                ${v.phone ? `<div class="vendor-detail"><span class="material-icons-round">phone</span> ${mvEsc(v.phone)}</div>` : ''}
                ${v.email ? `<div class="vendor-detail"><span class="material-icons-round">email</span> ${mvEsc(v.email)}</div>` : ''}
                <div class="vendor-detail"><span class="material-icons-round">event</span> ${v.events_count} event${v.events_count === 1 ? '' : 's'} registered</div>
            </div>
            <div class="vendor-card-actions" style="margin-top:12px;">
                <button class="btn btn-primary btn-sm" style="flex:1;justify-content:center;" onclick="openMyVendorEvents(${v.vendor_id})">
                    <span class="material-icons-round">visibility</span> View Events
                </button>
            </div>
        </div>`).join('')}</div>`;
}

function openMyVendorEvents(vendorId) {
    const v = _mvData.find(x => x.vendor_id === vendorId);
    if (!v) return;
    const stFilter = document.getElementById('mv-filter-status')?.value || '';
    const evFilter = document.getElementById('mv-filter-event')?.value || '';
    const events = v.events.filter(e =>
        (!stFilter || e.status === stFilter) && (!evFilter || String(e.event_id) === evFilter));
    openModal(`${v.name} · Registered Events`, `
        <div class="table-wrapper"><table class="data-table">
            <thead><tr><th>Event</th><th>Date</th><th>Location</th><th>Role / Service</th><th>Status</th></tr></thead>
            <tbody>${events.length ? events.map(e => `<tr>
                <td style="color:var(--text-primary);font-weight:600;">${mvEsc(e.event_name)}</td>
                <td>${e.event_date ? formatDate(e.event_date) : '—'}</td>
                <td>${mvEsc(e.venue)}</td>
                <td>${mvEsc(e.role)}</td>
                <td>${getStatusBadge(e.status)}</td>
            </tr>`).join('') : '<tr><td colspan="5" class="text-muted">No matching events.</td></tr>'}</tbody>
        </table></div>`);
}
