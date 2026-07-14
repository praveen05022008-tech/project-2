/* ═══════════════════════════════════════════════════════════════════════════
   EventPro — Main Application (Router, API Service, Utilities)
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── API base URL resolution ─────────────────────────────────────────────────
// Deployment: the backend runs as a SEPARATE Render service from the frontend,
// so the frontend must call the backend's URL. Update BACKEND_URL if your
// backend service URL changes.
//   • Local dev (localhost) → talks to your local backend on :8000
//   • Deployed (any other host) → talks to BACKEND_URL
// Runtime override (no redeploy needed):
//   localStorage.setItem('api_base', 'https://your-backend.onrender.com/api')
const BACKEND_URL = 'https://event-management-zef1.onrender.com';

let API_BASE;
const _override = window.API_BASE_OVERRIDE || localStorage.getItem('api_base');
const _host = window.location.hostname;
const _isLocal = _host === 'localhost' || _host === '127.0.0.1';

if (_override) {
    API_BASE = _override.replace(/\/+$/, '');
} else if (_isLocal) {
    API_BASE = `${window.location.origin}/api`;   // local dev: backend serves the frontend
} else if (BACKEND_URL) {
    API_BASE = BACKEND_URL.replace(/\/+$/, '') + '/api';  // deployed: separate backend
} else {
    API_BASE = `${window.location.origin}/api`;
}
console.log('[EventPro] API base:', API_BASE);

// ─── API Service ───────────────────────────────────────────────────────────────

const api = {
    async request(method, endpoint, data = null) {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        const token = localStorage.getItem('jwt_token');
        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }
        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }

        let response;
        try {
            response = await fetch(`${API_BASE}${endpoint}`, options);
        } catch (netErr) {
            // Network / CORS failure — the request never got a valid response.
            throw new Error(
                `Cannot reach the API at ${API_BASE}. Check that the backend is ` +
                `running and that CORS/ALLOWED_ORIGINS allows this site. (${netErr.message})`
            );
        }

        // Read the body as text first so empty / non-JSON responses don't crash.
        const raw = await response.text();
        let body = null;
        if (raw) {
            try { body = JSON.parse(raw); } catch (_) { /* not JSON */ }
        }

        if (!response.ok) {
            let detail = body && body.detail ? body.detail : null;
            if (!detail) {
                detail = raw
                    ? `Server error ${response.status}: ${raw.slice(0, 160)}`
                    : `Request failed (HTTP ${response.status}) with an empty response.`;
            }
            throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
        }

        if (raw && body === null) {
            // 2xx but the body wasn't JSON — usually means the request hit the
            // wrong host (e.g. a static site) instead of the API.
            throw new Error(
                `The API at ${API_BASE}${endpoint} returned a non-JSON response. ` +
                `The frontend is likely pointing at the wrong backend URL.`
            );
        }
        return body;
    },

    get(endpoint) { return this.request('GET', endpoint); },
    post(endpoint, data) { return this.request('POST', endpoint, data); },
    put(endpoint, data) { return this.request('PUT', endpoint, data); },
    delete(endpoint) { return this.request('DELETE', endpoint); },
};

// ─── Toast Notifications ───────────────────────────────────────────────────────

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const icons = {
        success: 'check_circle',
        error: 'error',
        info: 'info',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="material-icons-round">${icons[type]}</span>
        <span class="toast-text">${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ─── Modal System ──────────────────────────────────────────────────────────────

function openModal(title, bodyHtml) {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    overlay.classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    // Release the camera if a QR scan was running in the modal.
    if (typeof stopQrScan === 'function') stopQrScan();
}

// Close modal on overlay click or close button
document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
});
document.getElementById('modal-close').addEventListener('click', closeModal);

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

// ─── SPA Router ────────────────────────────────────────────────────────────────

const pages = {
    dashboard: { title: 'Dashboard', init: null },
    events: { title: 'Events', init: null },
    vendors: { title: 'Vendors', init: null },
    'ai-center': { title: 'AI Center', init: null },
    'copilot': { title: 'AI Copilot', init: null },
    'command-center': { title: 'Command Center', init: null },
    'budget': { title: 'Budget AI', init: null },
    'analytics': { title: 'Analytics', init: null },
    'reports': { title: 'Reports', init: null },
    'users': { title: 'User Management', init: null },
    'audit-logs': { title: 'Audit Logs', init: null },
    settings: { title: 'Settings', init: null },
    'dashboard-staff': { title: 'Staff Dashboard', init: null },
    'dashboard-vendor': { title: 'Vendor Dashboard', init: null },
    'dashboard-sponsor': { title: 'Sponsor Dashboard', init: null },
    'dashboard-attendee': { title: 'Attendee Dashboard', init: null },
    'dashboard-superadmin': { title: 'Super Admin Dashboard', init: null },
};

let currentPage = 'dashboard';

function navigateTo(page) {
    // Dynamically override dashboard if user is not organizer
    if (page === 'dashboard' && window.currentUser) {
        const role = window.currentUser.role;
        if (role === 'STAFF') page = 'dashboard-staff';
        else if (role === 'VENDOR') page = 'dashboard-vendor';
        else if (role === 'SPONSOR') page = 'dashboard-sponsor';
        else if (role === 'ATTENDEE') page = 'dashboard-attendee';
        else if (role === 'SUPER_ADMIN') page = 'dashboard-superadmin';
    }

    if (!pages[page]) return;
    currentPage = page;

    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === page);
    });

    // Update title
    document.getElementById('page-title').textContent = pages[page].title;

    // Update hash
    window.location.hash = page;

    // Close mobile sidebar + backdrop
    document.getElementById('sidebar').classList.remove('open');
    const _bd = document.getElementById('sidebar-backdrop');
    if (_bd) _bd.classList.remove('active');

    // Render page
    if (pages[page].init) {
        pages[page].init();
    }
}

// Register page initializers (called from page scripts)
function registerPage(name, initFn) {
    if (pages[name]) {
        pages[name].init = initFn;
    }
}

// ─── Utility Functions ─────────────────────────────────────────────────────────

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(amount || 0);
}

function getStatusBadge(status) {
    const cls = {
        'Upcoming': 'badge-upcoming',
        'In Progress': 'badge-progress',
        'Completed': 'badge-completed',
        'Cancelled': 'badge-cancelled',
        'Pending': 'badge-pending',
        'Confirmed': 'badge-confirmed',
    };
    return `<span class="badge ${cls[status] || 'badge-upcoming'}">${status}</span>`;
}

function getActiveBadge(isActive) {
    return isActive
        ? '<span class="badge badge-active">Active</span>'
        : '<span class="badge badge-inactive">Inactive</span>';
}

function renderStars(rating) {
    let html = '<div class="vendor-rating">';
    for (let i = 1; i <= 5; i++) {
        html += `<span class="material-icons-round star ${i <= rating ? 'filled' : 'empty'}">star</span>`;
    }
    html += '</div>';
    return html;
}

// Shared event-picker <select> used by Budget / Analytics / Reports / Command
// Center so the user can choose which event to analyze (instead of always the
// first one). `handlerName` is the global function called with the chosen id.
function eventSelectorHTML(events, selectedId, handlerName) {
    const opts = events.map(e =>
        `<option value="${e.id}" ${String(e.id) === String(selectedId) ? 'selected' : ''}>${e.title} — ${formatDate(e.event_date)}</option>`
    ).join('');
    return `
        <div class="event-picker">
            <span class="material-icons-round">event</span>
            <select class="event-select" onchange="${handlerName}(this.value)">${opts}</select>
        </div>`;
}

// Renders a role-scoped dashboard payload from /api/dashboard/role-view.
// Everything here is data-driven — cards, table and note all come from the API.
function renderRoleDashboard(data) {
    const cards = (data.cards || []).map((c, i) => `
        <div class="stat-card card-glow animate-fade-in stagger-${(i % 4) + 1}">
            <div class="stat-card-header">
                <span class="stat-label">${c.label}</span>
                <div class="stat-card-icon">
                    <span class="material-icons-round">${c.icon || 'insights'}</span>
                </div>
            </div>
            <div class="stat-value">${c.value}</div>
            ${c.hint ? `<div style="font-size:0.8rem;margin-top:8px;color:var(--text-muted);">${c.hint}</div>` : ''}
        </div>
    `).join('');

    let listHtml = '';
    const list = data.list;
    if (list && list.columns && list.columns.length && list.rows && list.rows.length) {
        const statusIdx = list.columns.findIndex(c => c.toLowerCase() === 'status');
        const head = list.columns.map(c => `<th>${c}</th>`).join('');
        const body = list.rows.map(r => `<tr>${
            r.map((cell, ci) => `<td>${ci === statusIdx ? getStatusBadge(cell) : cell}</td>`).join('')
        }</tr>`).join('');
        listHtml = `
            <div class="card card-glow animate-fade-in stagger-3" style="margin-top:20px;">
                <div class="card-header"><h3>${list.title || 'Details'}</h3></div>
                <div class="card-body" style="padding:0;">
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead><tr>${head}</tr></thead>
                            <tbody>${body}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    }

    let noteHtml = '';
    if (data.note) {
        const n = data.note;
        noteHtml = `
            <div class="card card-glow animate-fade-in stagger-4 ai-alert-card" style="margin-top:20px;border-left-color:${n.accent || 'var(--accent-primary)'};">
                <div class="card-header" style="border:none;padding-bottom:0;">
                    <h3 style="display:flex;align-items:center;gap:8px;">
                        <span class="material-icons-round" style="color:${n.accent || 'var(--accent-primary)'};">${n.icon || 'info'}</span>
                        ${n.title}
                    </h3>
                </div>
                <div class="card-body"><p style="color:var(--text-secondary);">${n.text}</p></div>
            </div>`;
    }

    return `
        <div class="dashboard-header animate-fade-in stagger-1" style="margin-bottom:24px;">
            <h3 style="font-size:1.6rem;color:var(--text-primary);">${data.heading || 'Dashboard'}</h3>
            <p style="color:var(--text-muted);">${data.subheading || ''}</p>
        </div>
        <div class="stats-grid animate-fade-in stagger-2">${cards}</div>
        ${listHtml}
        ${noteHtml}
    `;
}

async function loadRoleDashboard(pageName) {
    const container = document.getElementById('page-container');
    container.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    try {
        const data = await api.get('/dashboard/role-view');
        container.innerHTML = renderRoleDashboard(data);
    } catch (err) {
        console.error(`Failed to load ${pageName}`, err);
        container.innerHTML = `<div class="card"><div class="card-body text-danger">Failed to load dashboard data.</div></div>`;
    }
}

// Lightweight dependency-free SVG donut chart.
// segments: [{label, value, color}]. Returns an SVG string with a legend.
function svgDonut(segments, centerLabel = '') {
    const total = segments.reduce((s, x) => s + (x.value || 0), 0);
    const R = 60, C = 2 * Math.PI * R, cx = 80, cy = 80, sw = 22;
    if (total <= 0) {
        return `<div style="text-align:center;color:var(--text-muted);padding:20px;">No data to chart.</div>`;
    }
    let offset = 0;
    const rings = segments.filter(s => s.value > 0).map(s => {
        const frac = s.value / total;
        const dash = `${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`;
        const circle = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${s.color}" stroke-width="${sw}"
            stroke-dasharray="${dash}" stroke-dashoffset="${(-offset * C).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"
            stroke-linecap="butt"></circle>`;
        offset += frac;
        return circle;
    }).join('');
    const legend = segments.map(s => `
        <div style="display:flex;align-items:center;gap:8px;font-size:0.82rem;margin-bottom:6px;">
            <span style="width:10px;height:10px;border-radius:3px;background:${s.color};display:inline-block;"></span>
            <span style="color:var(--text-secondary);flex:1;">${s.label}</span>
            <span style="color:var(--text-primary);font-weight:600;">${s.value}</span>
        </div>`).join('');
    return `
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
            <svg viewBox="0 0 160 160" width="160" height="160" style="flex-shrink:0;">
                ${rings}
                <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="var(--text-primary)" font-size="26" font-weight="700">${total}</text>
                <text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="var(--text-muted)" font-size="11">${centerLabel}</text>
            </svg>
            <div style="flex:1;min-width:150px;">${legend}</div>
        </div>`;
}

// Download an array of rows as a CSV file (client-side, no backend needed).
function exportCSV(filename, headers, rows) {
    const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Exported ' + filename, 'success');
}

function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// ─── Authentication ────────────────────────────────────────────────────────────

async function checkAuth() {
    const token = localStorage.getItem('jwt_token');
    const loginPage = document.getElementById('login-page');
    const appContainer = document.getElementById('app');
    
    if (token) {
        try {
            const user = await api.get('/auth/me');
            window.currentUser = user;
            if (loginPage) loginPage.style.display = 'none';
            if (appContainer) appContainer.style.display = 'flex';
            
            // Update UI profile
            document.querySelector('.user-name').textContent = user.email.split('@')[0];
            document.querySelector('.user-role').textContent = user.role;

            applyRoleBasedAccess(user.role);
            loadNotifications();

            // Route from hash
            const hash = window.location.hash.slice(1);
            const initialPage = hash && pages[hash] ? hash : 'dashboard';
            setTimeout(() => navigateTo(initialPage), 50);
        } catch (error) {
            console.error("Auth error", error);
            localStorage.removeItem('jwt_token');
            if (loginPage) loginPage.style.display = 'flex';
            if (appContainer) appContainer.style.display = 'none';
        }
    } else {
        if (loginPage) loginPage.style.display = 'flex';
        if (appContainer) appContainer.style.display = 'none';
    }
}

function applyRoleBasedAccess(role) {
    const navItems = document.querySelectorAll('.sidebar-nav li');
    navItems.forEach(item => {
        const link = item.querySelector('a').dataset.page;
        let show = false;
        if (role === 'SUPER_ADMIN') {
            show = true;
        } else if (role === 'ORGANIZER') {
            show = true; 
        } else if (role === 'VENDOR') {
            if (['dashboard', 'events', 'analytics'].includes(link)) show = true;
        } else if (role === 'STAFF') {
            if (['dashboard', 'command-center', 'events'].includes(link)) show = true;
        } else if (role === 'SPONSOR') {
            if (['dashboard', 'analytics', 'reports'].includes(link)) show = true;
        } else if (role === 'ATTENDEE') {
            if (['dashboard', 'events', 'ai-center'].includes(link)) show = true;
        }

        // Audit Logs and User Management are visible to Super Admin only.
        if ((link === 'audit-logs' || link === 'users') && role !== 'SUPER_ADMIN') show = false;
        // Copilot is for managers (Super Admin / Organizer) only.
        if (link === 'copilot' && !['SUPER_ADMIN', 'ORGANIZER'].includes(role)) show = false;

        item.style.display = show ? 'block' : 'none';
    });
}

// ─── Initialization ────────────────────────────────────────────────────────────

// Android APK download link. After the first "Build Android APK" workflow run,
// set this to your release URL, e.g.
//   https://github.com/<owner>/<repo>/releases/download/apk-latest/eventpro.apk
// The button then appears on the login screen (hidden inside the installed app).
const APK_URL = '';

function setupApkButton() {
    const btn = document.getElementById('download-apk');
    if (!btn) return;
    const insideApp = !!window.Capacitor;   // running inside the wrapped Android app
    if (APK_URL && !insideApp) {
        btn.href = APK_URL;
        btn.style.display = 'flex';
    }
}

// ─── Feedback / rating ───────────────────────────────────────────────────────
function openFeedbackForm(eventId, title) {
    openModal('Rate: ' + title, `
        <form id="fb-form">
            <div class="form-group">
                <label>Your rating</label>
                <div id="fb-stars" style="display:flex;gap:6px;font-size:32px;cursor:pointer;">
                    ${[1,2,3,4,5].map(i => `<span class="material-icons-round fb-star" data-v="${i}" style="color:#f5a623;">star</span>`).join('')}
                </div>
                <input type="hidden" id="fb-rating" value="5">
            </div>
            <div class="form-group">
                <label>Comments (optional)</label>
                <textarea id="fb-comment" class="form-textarea" placeholder="What did you think?"></textarea>
            </div>
            <div class="modal-footer" style="padding:0;border:none;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary"><span class="material-icons-round">send</span> Submit</button>
            </div>
        </form>`);
    const paint = (v) => document.querySelectorAll('.fb-star').forEach(s =>
        s.textContent = (parseInt(s.dataset.v) <= v ? 'star' : 'star_border'));
    paint(5);
    document.querySelectorAll('.fb-star').forEach(s => s.addEventListener('click', () => {
        document.getElementById('fb-rating').value = s.dataset.v;
        paint(parseInt(s.dataset.v));
    }));
    document.getElementById('fb-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api.post('/feedback', {
                event_id: eventId,
                rating: parseInt(document.getElementById('fb-rating').value),
                comment: document.getElementById('fb-comment').value.trim() || null,
            });
            showToast('Thanks for your feedback!', 'success');
            closeModal();
        } catch (err) { showToast(err.message || 'Failed to submit', 'error'); }
    });
}

// ─── In-app notifications ────────────────────────────────────────────────────
let _notifs = [];

function _notifReadSet() {
    try { return new Set(JSON.parse(localStorage.getItem('notif_read') || '[]')); }
    catch (_) { return new Set(); }
}

async function loadNotifications() {
    if (!localStorage.getItem('jwt_token')) return;
    try {
        _notifs = await api.get('/notifications');
    } catch (_) { _notifs = []; }
    const read = _notifReadSet();
    const unread = _notifs.filter(n => !read.has(n.id)).length;
    const badge = document.getElementById('notif-badge');
    if (badge) {
        badge.textContent = unread > 9 ? '9+' : String(unread);
        badge.style.display = unread > 0 ? 'flex' : 'none';
    }
}

function renderNotifDropdown() {
    const dd = document.getElementById('notif-dropdown');
    if (!dd) return;
    const read = _notifReadSet();
    if (!_notifs.length) {
        dd.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);">No notifications</div>`;
    } else {
        dd.innerHTML = _notifs.map(n => `
            <div class="notif-item ${n.level} ${read.has(n.id) ? '' : 'unread'}">
                <h5>${n.title}</h5>
                ${n.message ? `<p>${n.message}</p>` : ''}
                <time>${n.created_at ? new Date(n.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</time>
            </div>`).join('');
    }
}

function toggleNotifDropdown() {
    const dd = document.getElementById('notif-dropdown');
    if (!dd) return;
    const opening = !dd.classList.contains('open');
    dd.classList.toggle('open', opening);
    if (opening) {
        renderNotifDropdown();
        // Mark all currently-loaded notifications as read
        localStorage.setItem('notif_read', JSON.stringify(_notifs.map(n => n.id)));
        const badge = document.getElementById('notif-badge');
        if (badge) badge.style.display = 'none';
    }
}

// Register the service worker (PWA / installable + offline shell).
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => { /* non-fatal */ });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Set current date in topbar
    const now = new Date();
    document.getElementById('topbar-date').textContent = now.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    // Nav link click handlers
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(link.dataset.page);
        });
    });

    // Mobile menu toggle (with backdrop)
    const sidebarEl = document.getElementById('sidebar');
    const backdropEl = document.getElementById('sidebar-backdrop');
    function openSidebar() {
        sidebarEl.classList.add('open');
        if (backdropEl) backdropEl.classList.add('active');
    }
    function closeSidebar() {
        sidebarEl.classList.remove('open');
        if (backdropEl) backdropEl.classList.remove('active');
    }
    document.getElementById('menu-toggle').addEventListener('click', () => {
        sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar();
    });
    if (backdropEl) backdropEl.addEventListener('click', closeSidebar);

    // Notifications bell
    const notifBtn = document.getElementById('notif-btn');
    if (notifBtn) {
        notifBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleNotifDropdown(); });
        document.addEventListener('click', (e) => {
            const dd = document.getElementById('notif-dropdown');
            if (dd && dd.classList.contains('open') && !e.target.closest('.notif-wrap')) dd.classList.remove('open');
        });
    }

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
        if (pages[currentPage] && pages[currentPage].init) {
            pages[currentPage].init();
            showToast('Page refreshed', 'info');
        }
    });

    // Auth handlers
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('username').value.trim();
            const pass = document.getElementById('password').value;
            const submitBtn = document.getElementById('login-submit');
            const originalText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Signing in…'; }
            try {
                const res = await api.post('/auth/login', { email: email, password: pass });
                localStorage.setItem('jwt_token', res.access_token);
                showToast('Logged in successfully', 'success');
                await checkAuth();
            } catch (err) {
                showToast(err.message || 'Invalid email or password', 'error');
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
            }
        });
    }

    // Password visibility toggle
    const pwToggle = document.getElementById('password-toggle');
    if (pwToggle) {
        pwToggle.addEventListener('click', () => {
            const input = document.getElementById('password');
            const icon = pwToggle.querySelector('.material-icons-round');
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            icon.textContent = show ? 'visibility_off' : 'visibility';
        });
    }

    // One-click demo role logins
    document.querySelectorAll('.demo-role').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('username').value = btn.dataset.email;
            document.getElementById('password').value = 'password123';
            loginForm.requestSubmit();
        });
    });

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('jwt_token');
            window.currentUser = null;
            checkAuth();
            showToast('Logged out', 'info');
            window.location.hash = '';
        });
    }

    // Show the Android app download button if configured
    setupApkButton();

    // Check authentication on load
    checkAuth();
});

// Handle browser back/forward
window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash && pages[hash] && hash !== currentPage) {
        navigateTo(hash);
    }
});
