/* ═══════════════════════════════════════════════════════════════════════════
   EventPro — Main Application (Router, API Service, Utilities)
   ═══════════════════════════════════════════════════════════════════════════ */

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
// Change this to your actual Render backend URL once it's deployed
const PRODUCTION_API_URL = 'https://event-management-zef1.onrender.com/api';

const API_BASE = isLocal ? 'http://localhost:8000/api' : PRODUCTION_API_URL;
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

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');

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

window.toggleTheme = function(theme) {
    if (theme === 'light') {
        document.body.classList.add('light-theme');
        localStorage.setItem('theme', 'light');
    } else {
        document.body.classList.remove('light-theme');
        localStorage.setItem('theme', 'dark');
    }
};

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

    // Mobile menu toggle
    document.getElementById('menu-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

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
            const email = document.getElementById('username').value;
            const pass = document.getElementById('password').value;
            try {
                const res = await api.post('/auth/login', { email: email, password: pass });
                localStorage.setItem('jwt_token', res.access_token);
                showToast('Logged in successfully', 'success');
                checkAuth();
            } catch (err) {
                showToast(err.message || 'Invalid ID or Password', 'error');
            }
        });
    }

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
