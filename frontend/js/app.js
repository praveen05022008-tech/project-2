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
// Trail commit text msg
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
};

let currentPage = 'dashboard';

function navigateTo(page) {
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

function checkAuth() {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const loginPage = document.getElementById('login-page');
    const appContainer = document.getElementById('app');
    
    if (isLoggedIn === 'true') {
        if (loginPage) loginPage.style.display = 'none';
        if (appContainer) appContainer.style.display = 'flex';
        
        // Route from hash
        const hash = window.location.hash.slice(1);
        const initialPage = hash && pages[hash] ? hash : 'dashboard';
        setTimeout(() => navigateTo(initialPage), 50);
    } else {
        if (loginPage) loginPage.style.display = 'flex';
        if (appContainer) appContainer.style.display = 'none';
    }
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
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const user = document.getElementById('username').value;
            const pass = document.getElementById('password').value;
            if (user === 'admin' && pass === 'admin123') {
                localStorage.setItem('isLoggedIn', 'true');
                showToast('Logged in successfully', 'success');
                checkAuth();
            } else {
                showToast('Invalid ID or Password', 'error');
            }
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('isLoggedIn');
            checkAuth();
            showToast('Logged out', 'info');
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
