registerPage('dashboard-superadmin', () => {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="dashboard-header">
            <h3>Super Admin SaaS View</h3>
            <p>Global platform overview.</p>
        </div>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon"><span class="material-icons-round">business</span></div>
                <div class="stat-info">
                    <span class="stat-label">Total Tenants</span>
                    <span class="stat-value">124</span>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><span class="material-icons-round">payments</span></div>
                <div class="stat-info">
                    <span class="stat-label">MRR</span>
                    <span class="stat-value">₹12,45,000</span>
                </div>
            </div>
        </div>
    `;
});
