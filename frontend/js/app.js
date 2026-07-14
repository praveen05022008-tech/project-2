/* ═══════════════════════════════════════════════════════════════════════════
   EventPro — Main Application (Router, API Service, Utilities)
   ═══════════════════════════════════════════════════════════════════════════ */

// Resolve the API base URL.
// 1. If a global override is set (window.API_BASE_OVERRIDE), use it.
// 2. If the page is served over http/https, call the SAME origin (the backend
//    serves this frontend), so it works on any host/port without edits.
// 3. If opened directly from the filesystem (file://), fall back to localhost.
const PRODUCTION_API_URL = 'https://event-management-zef1.onrender.com/api';

let API_BASE;
if (window.API_BASE_OVERRIDE) {
    API_BASE = window.API_BASE_OVERRIDE;
} else if (window.location.protocol === 'file:') {
    API_BASE = 'http://localhost:8000/api';
} else {
    API_BASE = `${window.location.origin}/api`;
}
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
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `Request failed: ${response.status}`);
        }
        return response.json();
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
    'command-center': { title: 'Command Center', init: null },
    'budget': { title: 'Budget AI', init: null },
    'analytics': { title: 'Analytics', init: null },
    'reports': { title: 'Reports', init: null },
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

        // Audit Logs are visible to Super Admin only.
        if (link === 'audit-logs' && role !== 'SUPER_ADMIN') show = false;

        item.style.display = show ? 'block' : 'none';
    });
}

// ─── Initialization ────────────────────────────────────────────────────────────

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
