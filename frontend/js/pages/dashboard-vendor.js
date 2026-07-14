registerPage('dashboard-vendor', () => {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="dashboard-header animate-fade-in stagger-1" style="margin-bottom: 24px;">
            <h3 style="font-size: 1.6rem; color: var(--text-primary);">Vendor Portal</h3>
            <p style="color: var(--text-muted);">Manage your active gigs, invoices, and AI insights.</p>
        </div>
        
        <div class="stats-grid animate-fade-in stagger-2">
            <div class="stat-card card-glow">
                <div class="stat-card-header">
                    <span class="stat-label">Live Order Count</span>
                    <div class="stat-card-icon"><span class="material-icons-round">restaurant</span></div>
                </div>
                <div class="stat-value">1,150</div>
                <div style="font-size: 0.8rem; margin-top: 8px; color: #43e97b;">
                    <span class="material-icons-round" style="font-size: 14px; vertical-align: middle;">arrow_upward</span>
                    Plates required today
                </div>
            </div>
            
            <div class="stat-card card-glow">
                <div class="stat-card-header">
                    <span class="stat-label">AI Prediction</span>
                    <div class="stat-card-icon"><span class="material-icons-round">psychology</span></div>
                </div>
                <div class="stat-value" style="color: #f5a623;">-220</div>
                <div style="font-size: 0.8rem; margin-top: 8px; color: var(--text-muted);">
                    Drop-outs predicted based on weather.
                </div>
            </div>
            
            <div class="stat-card card-glow">
                <div class="stat-card-header">
                    <span class="stat-label">Performance Rating</span>
                    <div class="stat-card-icon"><span class="material-icons-round">star</span></div>
                </div>
                <div class="stat-value">4.8 / 5</div>
                <div style="font-size: 0.8rem; margin-top: 8px; color: var(--text-muted);">
                    Based on 12 past events
                </div>
            </div>
        </div>

        <div class="card card-glow animate-fade-in stagger-3 ai-alert-card" style="margin-top: 20px;">
            <div class="card-header" style="border: none; padding-bottom: 0;">
                <h3 style="display: flex; align-items: center; gap: 8px;">
                    <span class="material-icons-round" style="color: var(--accent-primary);">tips_and_updates</span>
                    AI Optimization Suggestion
                </h3>
            </div>
            <div class="card-body">
                <p style="color: var(--text-secondary); margin-bottom: 12px;">Based on the 220 predicted drop-outs for today's Sharma Wedding, we suggest scaling down the premium dessert prep by 15% to save on material costs without affecting attendee satisfaction.</p>
                <button class="btn btn-secondary btn-sm">Apply Optimization</button>
            </div>
        </div>
    `;
});
