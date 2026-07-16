/* ═══════════════════════════════════════════════════════════════════════════
   EventoPro — Collapsible dashboard directory side-panels
   • "Available Sponsors"  → organiser dashboard  (find & request sponsors)
   • "Active Organisers"   → sponsor dashboard    (find & collaborate on events)
   Both share one engine: search + filters + auto-refresh polling.
   ═══════════════════════════════════════════════════════════════════════════ */

const DIRECTORY_CONFIG = {
    sponsors: {
        title: 'Available Sponsors',
        icon: 'handshake',
        endpoint: '/directory/sponsors',
        empty: 'No available sponsors match your search.',
        searchPlaceholder: 'Search sponsors…',
        filters: [
            { param: 'category', label: 'All categories',
              options: ['Technology', 'Finance', 'FMCG', 'Automobile', 'Media', 'Healthcare', 'Education', 'Retail', 'General'] },
            { param: 'availability', label: 'All availability',
              options: ['Available', 'Open to offers', 'Not Available'] },
        ],
        render: renderSponsorCard,
    },
    organisers: {
        title: 'Active Organisers',
        icon: 'groups',
        endpoint: '/directory/organisers',
        empty: 'No active organisers match your search.',
        searchPlaceholder: 'Search organisers…',
        filters: [
            { param: 'category', label: 'All event types',
              options: ['Wedding', 'Corporate', 'Birthday', 'Concert', 'Conference', 'Exhibition', 'Seminar', 'Other'] },
            { param: 'status', label: 'All statuses',
              options: ['Upcoming', 'In Progress'] },
        ],
        render: renderOrganiserCard,
    },
};

window.__dirState = window.__dirState || {};   // per-key { rows, timer }

// ─── HTML shell ─────────────────────────────────────────────────────────────
function renderDirectoryPanel(key) {
    const cfg = DIRECTORY_CONFIG[key];
    if (!cfg) return '';
    const collapsed = localStorage.getItem('dir_collapsed_' + key) === '1';
    const filtersHtml = cfg.filters.map((f, i) => `
        <select class="filter-select dir-filter" id="dir-f${i}-${key}" data-param="${f.param}">
            <option value="">${f.label}</option>
            ${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}
        </select>`).join('');

    return `
    <aside class="side-panel${collapsed ? ' collapsed' : ''}" id="dir-panel-${key}">
        <div class="side-panel-head">
            <button class="side-panel-toggle" onclick="toggleDirPanel('${key}')" title="Expand / collapse">
                <span class="material-icons-round">${cfg.icon}</span>
            </button>
            <span class="side-panel-title">${cfg.title}</span>
            <span class="side-panel-count" id="dir-count-${key}"></span>
            <button class="btn-icon side-panel-refresh" onclick="refreshDir('${key}')" title="Refresh">
                <span class="material-icons-round">refresh</span>
            </button>
            <button class="btn-icon side-panel-chevron" onclick="toggleDirPanel('${key}')" title="Collapse">
                <span class="material-icons-round">chevron_right</span>
            </button>
        </div>
        <div class="side-panel-controls">
            <div class="search-box side-panel-search">
                <span class="material-icons-round">search</span>
                <input type="text" id="dir-search-${key}" placeholder="${cfg.searchPlaceholder}">
            </div>
            <div class="side-panel-filters">${filtersHtml}</div>
        </div>
        <div class="side-panel-body" id="dir-body-${key}">
            <div class="loading-state"><div class="spinner"></div></div>
        </div>
    </aside>`;
}

// ─── Wiring + polling ───────────────────────────────────────────────────────
function initDirectoryPanel(key) {
    const cfg = DIRECTORY_CONFIG[key];
    if (!cfg) return;
    const search = document.getElementById('dir-search-' + key);
    if (search) search.addEventListener('input', debounce(() => loadDir(key), 400));
    document.querySelectorAll(`#dir-panel-${key} .dir-filter`).forEach(sel =>
        sel.addEventListener('change', () => loadDir(key)));

    // Delegated actions (avoids quote-escaping issues with names/emails).
    const body = document.getElementById('dir-body-' + key);
    if (body) body.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const d = btn.dataset;
        if (d.act === 'profile') viewSponsorProfile(d.email);
        else if (d.act === 'request') openSponsorRequest(d.email, d.company);
        else if (d.act === 'event') viewOrganiserEvent(parseInt(d.eid), d.ename);
        else if (d.act === 'collab') openCollabRequest(parseInt(d.eid), d.ename);
    });

    loadDir(key);

    // Auto-refresh so availability changes appear without a manual reload.
    if (window.__dirState[key] && window.__dirState[key].timer) clearInterval(window.__dirState[key].timer);
    window.__dirState[key] = window.__dirState[key] || {};
    window.__dirState[key].timer = setInterval(() => {
        // Self-cleanup once the panel leaves the DOM (navigation away).
        if (!document.getElementById('dir-body-' + key)) { clearInterval(window.__dirState[key].timer); return; }
        const panel = document.getElementById('dir-panel-' + key);
        if (panel && !panel.classList.contains('collapsed')) loadDir(key, true);
    }, 25000);
}

function toggleDirPanel(key) {
    const panel = document.getElementById('dir-panel-' + key);
    if (!panel) return;
    const collapsed = panel.classList.toggle('collapsed');
    localStorage.setItem('dir_collapsed_' + key, collapsed ? '1' : '0');
    if (!collapsed) loadDir(key);   // refresh on expand
}

function refreshDir(key) {
    const icon = document.querySelector(`#dir-panel-${key} .side-panel-refresh .material-icons-round`);
    if (icon) { icon.style.transition = 'transform .5s'; icon.style.transform = 'rotate(360deg)'; setTimeout(() => { icon.style.transform = ''; }, 500); }
    loadDir(key);
}

async function loadDir(key, silent) {
    const cfg = DIRECTORY_CONFIG[key];
    const body = document.getElementById('dir-body-' + key);
    if (!cfg || !body) return;
    const params = new URLSearchParams();
    const q = (document.getElementById('dir-search-' + key) || {}).value;
    if (q && q.trim()) params.set('q', q.trim());
    document.querySelectorAll(`#dir-panel-${key} .dir-filter`).forEach(sel => {
        if (sel.value) params.set(sel.dataset.param, sel.value);
    });
    if (!silent) body.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    try {
        const rows = await api.get(cfg.endpoint + (params.toString() ? '?' + params.toString() : ''));
        window.__dirState[key] = window.__dirState[key] || {};
        window.__dirState[key].rows = rows;
        const count = document.getElementById('dir-count-' + key);
        if (count) count.textContent = rows.length;
        body.innerHTML = rows.length ? rows.map(cfg.render).join('') : `<div class="side-panel-empty">${cfg.empty}</div>`;
    } catch (err) {
        if (!silent) body.innerHTML = `<div class="side-panel-empty">Couldn't load right now.</div>`;
    }
}

// ─── Card renderers ─────────────────────────────────────────────────────────
function dirEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function dirAvatar(name, logoUrl) {
    if (logoUrl) return `<img class="dir-avatar" src="${dirEsc(logoUrl)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'dir-avatar dir-avatar-fallback',textContent:'${(dirInitials(name))}'}))">`;
    return `<div class="dir-avatar dir-avatar-fallback">${dirInitials(name)}</div>`;
}
function dirInitials(name) {
    const parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
    return parts.map(p => p[0] ? p[0].toUpperCase() : '').join('') || '?';
}
function dirAvailBadge(a) {
    const cls = a === 'Available' ? 'badge-completed' : (a === 'Open to offers' ? 'badge-upcoming' : 'badge-inactive');
    return `<span class="badge ${cls}">${dirEsc(a)}</span>`;
}

function renderSponsorCard(s) {
    return `
    <div class="dir-card">
        <div class="dir-card-top">
            ${dirAvatar(s.company_name, s.logo_url)}
            <div class="dir-card-main">
                <div class="dir-card-name">${dirEsc(s.company_name)}</div>
                <span class="vendor-category-badge">${dirEsc(s.category)}</span>
            </div>
            ${dirAvailBadge(s.availability)}
        </div>
        <div class="dir-card-meta">
            <span><span class="material-icons-round">payments</span> ${formatCurrency(s.budget)}</span>
            <span><span class="material-icons-round">place</span> ${dirEsc(s.location)}</span>
            ${s.interested ? '<span class="badge badge-upcoming">Interested</span>' : ''}
        </div>
        <div class="dir-card-actions">
            <button class="btn btn-secondary btn-sm" data-act="profile" data-email="${dirEsc(s.email)}"><span class="material-icons-round">person</span> Profile</button>
            <button class="btn btn-primary btn-sm" data-act="request" data-email="${dirEsc(s.email)}" data-company="${dirEsc(s.company_name)}"><span class="material-icons-round">send</span> Request</button>
        </div>
    </div>`;
}

function renderOrganiserCard(o) {
    return `
    <div class="dir-card">
        <div class="dir-card-top">
            ${dirAvatar(o.organiser_name, null)}
            <div class="dir-card-main">
                <div class="dir-card-name">${dirEsc(o.organiser_name)}</div>
                <div class="dir-card-sub">${dirEsc(o.organisation)}</div>
            </div>
            ${getStatusBadge(o.event_status)}
        </div>
        <div class="dir-card-event">
            <div class="dir-event-name">${dirEsc(o.event_name)}</div>
            <div class="dir-card-meta">
                <span class="vendor-category-badge">${dirEsc(o.event_category)}</span>
                <span><span class="material-icons-round">event</span> ${formatDate(o.event_date)}</span>
                <span><span class="material-icons-round">place</span> ${dirEsc(o.location)}</span>
            </div>
        </div>
        <div class="dir-card-actions">
            <button class="btn btn-secondary btn-sm" data-act="event" data-eid="${o.event_id}" data-ename="${dirEsc(o.event_name)}"><span class="material-icons-round">visibility</span> Event</button>
            <button class="btn btn-primary btn-sm" data-act="collab" data-eid="${o.event_id}" data-ename="${dirEsc(o.event_name)}"><span class="material-icons-round">handshake</span> Collaborate</button>
        </div>
    </div>`;
}

// ─── Actions ────────────────────────────────────────────────────────────────
async function viewSponsorProfile(email) {
    openModal('Sponsor Profile', `<div id="sp-detail"><div class="loading-state"><div class="spinner"></div></div></div>`);
    let s = null;
    try { s = await api.get('/directory/sponsors/' + encodeURIComponent(email)); }
    catch (e) { document.getElementById('sp-detail').innerHTML = `<p class="text-danger">${e.message || 'Not found'}</p>`; return; }
    document.getElementById('sp-detail').innerHTML = `
        <div class="dir-card-top" style="margin-bottom:14px;">
            ${dirAvatar(s.company_name, s.logo_url)}
            <div class="dir-card-main">
                <div class="dir-card-name" style="font-size:1.05rem;">${dirEsc(s.company_name)}</div>
                <span class="vendor-category-badge">${dirEsc(s.category)}</span>
            </div>
            ${dirAvailBadge(s.availability)}
        </div>
        <div class="detail-rows">
            <div><span class="material-icons-round">payments</span> Budget: <strong>${formatCurrency(s.budget)}</strong></div>
            <div><span class="material-icons-round">place</span> Location: <strong>${dirEsc(s.location)}</strong></div>
            ${s.contact_phone ? `<div><span class="material-icons-round">call</span> ${dirEsc(s.contact_phone)}</div>` : ''}
            ${s.description ? `<p style="margin-top:8px;color:var(--text-secondary);">${dirEsc(s.description)}</p>` : ''}
        </div>
        <div class="modal-footer" style="padding-top:14px;border:none;">
            <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            <button class="btn btn-primary" onclick="closeModal();openSponsorRequest('${dirEsc(s.email)}','${dirEsc(s.company_name)}')"><span class="material-icons-round">send</span> Send Request</button>
        </div>`;
}

async function openSponsorRequest(email, company) {
    let events = [];
    try { events = await api.get('/my-events'); } catch (_) {}
    const opts = events.map(e => `<option value="${e.id}">${dirEsc(e.title)}</option>`).join('');
    openModal('Sponsorship Request · ' + company, `
        <form id="sr-form" class="form-grid">
            <div class="form-group full-width">
                <label>Event</label>
                <select id="sr-event" class="form-select">${opts || '<option value="">— No events —</option>'}</select>
            </div>
            <div class="form-group full-width">
                <label>Message (optional)</label>
                <textarea id="sr-msg" class="form-textarea" placeholder="Tell ${dirEsc(company)} why they'd be a great fit…"></textarea>
            </div>
            <div class="form-group full-width"><div class="modal-footer" style="padding:0;border:none;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary"><span class="material-icons-round">send</span> Send Request</button>
            </div></div>
        </form>`);
    document.getElementById('sr-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const eid = document.getElementById('sr-event').value;
        try {
            await api.post('/directory/sponsors/' + encodeURIComponent(email) + '/request', {
                event_id: eid ? parseInt(eid) : null,
                message: document.getElementById('sr-msg').value.trim() || null,
            });
            showToast('Sponsorship request sent', 'success');
            closeModal();
        } catch (err) { showToast(err.message || 'Failed', 'error'); }
    });
}

function viewOrganiserEvent(eventId, eventName) {
    const row = ((window.__dirState.organisers || {}).rows || []).find(r => r.event_id === eventId);
    const info = row ? `
        <div class="detail-rows">
            <div><span class="material-icons-round">person</span> ${dirEsc(row.organiser_name)} · ${dirEsc(row.organisation)}</div>
            <div><span class="material-icons-round">category</span> ${dirEsc(row.event_category)}</div>
            <div><span class="material-icons-round">event</span> ${formatDate(row.event_date)}</div>
            <div><span class="material-icons-round">place</span> ${dirEsc(row.location)}</div>
            <div><span class="material-icons-round">flag</span> ${getStatusBadge(row.event_status)}</div>
        </div>` : '';
    openModal(eventName || 'Event', `
        ${info}
        <div class="modal-footer" style="padding-top:14px;border:none;">
            <a class="btn btn-secondary" href="/e/${eventId}" target="_blank" rel="noopener"><span class="material-icons-round">open_in_new</span> Public page</a>
            <button class="btn btn-primary" onclick="closeModal();openCollabRequest(${eventId}, '${dirEsc(eventName)}')"><span class="material-icons-round">handshake</span> Collaborate</button>
        </div>`);
}

function openCollabRequest(eventId, eventName) {
    openModal('Collaboration Request · ' + eventName, `
        <form id="cr-form" class="form-grid">
            <div class="form-group full-width">
                <label>Proposed amount (₹, optional)</label>
                <input id="cr-amount" type="number" class="form-input" min="0" value="0">
            </div>
            <div class="form-group full-width">
                <label>Message (optional)</label>
                <textarea id="cr-msg" class="form-textarea" placeholder="Introduce your brand and what you'd like to sponsor…"></textarea>
            </div>
            <div class="form-group full-width"><div class="modal-footer" style="padding:0;border:none;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary"><span class="material-icons-round">send</span> Send Request</button>
            </div></div>
        </form>`);
    document.getElementById('cr-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api.post('/directory/organisers/' + eventId + '/collaborate', {
                amount: parseFloat(document.getElementById('cr-amount').value) || 0,
                message: document.getElementById('cr-msg').value.trim() || null,
            });
            showToast('Collaboration request sent — the organiser has been notified', 'success');
            closeModal();
        } catch (err) { showToast(err.message || 'Failed', 'error'); }
    });
}
