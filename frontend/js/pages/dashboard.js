/* ═══════════════════════════════════════════════════════════════════════════
   EventoPro — Dashboard Page
   ═══════════════════════════════════════════════════════════════════════════ */

registerPage('dashboard', initDashboard);

async function initDashboard() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="loading-state"><div class="spinner"></div></div>
    `;

    try {
        const data = await api.get('/dashboard/stats');
        renderDashboard(data);
    } catch (err) {
        container.innerHTML = `
            <div class="stats-grid">
                ${renderStatCards({ todays_events: 0, upcoming_events: 0, total_events_this_month: 0, completed_events: 0, active_vendors: 0, total_revenue: 0 })}
            </div>
            <div class="content-grid">
                <div class="card full-width">
                    <div class="card-body">
                        <div class="empty-state">
                            <span class="material-icons-round">cloud_off</span>
                            <h4>Unable to connect to server</h4>
                            <p>Make sure the backend server is running on port 8000. Click refresh to try again.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

function renderDashboard(data) {
    const container = document.getElementById('page-container');
    const stats = data.stats;

    container.innerHTML = `
        <!-- Stat Cards -->
        <div class="stats-grid">
            ${renderStatCards(stats)}
        </div>

        <!-- Content Grid -->
        <div class="content-grid">
            <!-- Recent Events -->
            <div class="card full-width fade-in stagger-3">
                <div class="card-header">
                    <h3>Recent Events</h3>
                    <button class="btn btn-sm btn-secondary" onclick="navigateTo('events')">
                        <span class="material-icons-round">visibility</span>
                        View All
                    </button>
                </div>
                <div class="card-body">
                    ${renderRecentEventsTable(data.recent_events)}
                </div>
            </div>

            <!-- Status Breakdown -->
            <div class="card fade-in stagger-4">
                <div class="card-header">
                    <h3>Event Status Overview</h3>
                </div>
                <div class="card-body">
                    ${renderStatusChart(data.status_breakdown, stats.total_events)}
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="card fade-in stagger-5">
                <div class="card-header">
                    <h3>Quick Actions</h3>
                </div>
                <div class="card-body">
                    <div style="display:flex;flex-direction:column;gap:10px;">
                        <button class="btn btn-primary" onclick="navigateTo('events')" style="justify-content:center">
                            <span class="material-icons-round">add_circle</span>
                            Create New Event
                        </button>
                        <button class="btn btn-secondary" onclick="navigateTo('vendors')" style="justify-content:center">
                            <span class="material-icons-round">store</span>
                            Manage Vendors
                        </button>
                        <button class="btn btn-secondary" onclick="navigateTo('ai-center')" style="justify-content:center">
                            <span class="material-icons-round">smart_toy</span>
                            Ask AI Assistant
                        </button>
                        <button class="btn btn-secondary" onclick="navigateTo('settings')" style="justify-content:center">
                            <span class="material-icons-round">settings</span>
                            Settings
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Animate stat values
    animateCounters();
}

function renderStatCards(stats) {
    const cards = [
        { label: "Today's Events", value: stats.todays_events, icon: 'today', fmt: 'number' },
        { label: 'Upcoming Events', value: stats.upcoming_events, icon: 'upcoming', fmt: 'number' },
        { label: 'This Month', value: stats.total_events_this_month, icon: 'calendar_month', fmt: 'number' },
        { label: 'Completed', value: stats.completed_events, icon: 'task_alt', fmt: 'number' },
        { label: 'Active Vendors', value: stats.active_vendors, icon: 'storefront', fmt: 'number' },
        { label: 'Total Revenue', value: stats.total_revenue, icon: 'account_balance_wallet', fmt: 'currency' },
    ];

    return cards.map((card, i) => `
        <div class="stat-card fade-in stagger-${i + 1}">
            <div class="stat-card-header">
                <span class="stat-label">${card.label}</span>
                <div class="stat-card-icon">
                    <span class="material-icons-round">${card.icon}</span>
                </div>
            </div>
            <div class="stat-value" data-target="${card.value}" data-format="${card.fmt}">
                ${card.fmt === 'currency' ? '₹0' : '0'}
            </div>
        </div>
    `).join('');
}

function animateCounters() {
    document.querySelectorAll('.stat-value[data-target]').forEach(el => {
        const target = parseFloat(el.dataset.target) || 0;
        const format = el.dataset.format;
        const duration = 1200;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = target * eased;

            if (format === 'currency') {
                el.textContent = formatCurrency(Math.round(current));
            } else {
                el.textContent = Math.round(current).toLocaleString('en-IN');
            }

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    });
}

function renderRecentEventsTable(events) {
    if (!events || events.length === 0) {
        return `
            <div class="empty-state">
                <span class="material-icons-round">event_busy</span>
                <h4>No Events Yet</h4>
                <p>Create your first event to get started!</p>
            </div>
        `;
    }

    return `
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Event</th>
                        <th>Client</th>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Budget</th>
                    </tr>
                </thead>
                <tbody>
                    ${events.map(e => `
                        <tr>
                            <td style="color:var(--text-primary);font-weight:600">${e.title}</td>
                            <td>${e.client_name}</td>
                            <td>${formatDate(e.event_date)}</td>
                            <td><span class="vendor-category-badge">${e.event_type}</span></td>
                            <td>${getStatusBadge(e.status)}</td>
                            <td style="font-weight:600">${formatCurrency(e.budget)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderStatusChart(breakdown, total) {
    if (!breakdown || breakdown.length === 0) {
        return `
            <div class="empty-state">
                <span class="material-icons-round">bar_chart</span>
                <h4>No Data</h4>
                <p>Create events to see status breakdown</p>
            </div>
        `;
    }

    const statusClasses = {
        'Upcoming': 'upcoming',
        'In Progress': 'progress',
        'Completed': 'completed',
        'Cancelled': 'cancelled',
    };

    const donutColors = {
        'Upcoming': '#667eea', 'In Progress': '#f5a623',
        'Completed': '#43e97b', 'Cancelled': '#f5576c',
    };
    const donut = svgDonut(
        breakdown.map(i => ({ label: i.status, value: i.count, color: donutColors[i.status] || '#667eea' })),
        'events'
    );

    return `
        <div style="margin-bottom:18px;">${donut}</div>
        <div class="status-chart">
            ${breakdown.map(item => {
                const pct = total > 0 ? ((item.count / total) * 100).toFixed(0) : 0;
                const cls = statusClasses[item.status] || 'upcoming';
                return `
                    <div class="status-bar-item">
                        <span class="status-bar-label">${item.status}</span>
                        <div class="status-bar-track">
                            <div class="status-bar-fill ${cls}" style="width: ${pct}%"></div>
                        </div>
                        <span class="status-bar-count">${item.count}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}
