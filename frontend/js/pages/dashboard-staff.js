registerPage('dashboard-staff', () => {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="dashboard-header animate-fade-in stagger-1" style="margin-bottom: 24px;">
            <h3 style="font-size: 1.6rem; color: var(--text-primary);">Staff Command View</h3>
            <p style="color: var(--text-muted);">Live operations and task assignments.</p>
        </div>
        
        <div class="stats-grid animate-fade-in stagger-2">
            <div class="stat-card card-glow">
                <div class="stat-card-header">
                    <span class="stat-label">Active Tasks</span>
                    <div class="stat-card-icon"><span class="material-icons-round">assignment</span></div>
                </div>
                <div class="stat-value">12</div>
                <div style="font-size: 0.8rem; margin-top: 8px; color: #f5a623;">
                    3 tasks high priority
                </div>
            </div>
            
            <div class="stat-card card-glow">
                <div class="stat-card-header">
                    <span class="stat-label">Zone Capacity</span>
                    <div class="stat-card-icon"><span class="material-icons-round">groups</span></div>
                </div>
                <div class="stat-value">85%</div>
                <div style="font-size: 0.8rem; margin-top: 8px; color: var(--text-muted);">
                    Main hall near capacity.
                </div>
            </div>
        </div>

        <div class="card card-glow animate-fade-in stagger-3 pulse-alert" style="margin-top: 20px;">
            <div class="card-header" style="border: none; padding-bottom: 0;">
                <h3 style="display: flex; align-items: center; gap: 8px;">
                    <span class="material-icons-round" style="color: #f5576c;">warning</span>
                    Crowd Density Alert
                </h3>
            </div>
            <div class="card-body">
                <p style="color: var(--text-primary); font-weight: 500; margin-bottom: 8px;">AI detected severe crowding at Gate A (98% capacity).</p>
                <p style="color: var(--text-secondary); margin-bottom: 16px;">Please redirect new arrivals to Gate B immediately to prevent bottlenecks.</p>
                <button class="btn btn-danger btn-sm">Acknowledge & Redirect</button>
            </div>
        </div>
    `;
});
