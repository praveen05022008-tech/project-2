registerPage('dashboard-sponsor', () => {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="dashboard-header animate-fade-in stagger-1" style="margin-bottom: 24px;">
            <h3 style="font-size: 1.6rem; color: var(--text-primary);">Sponsor ROI Dashboard</h3>
            <p style="color: var(--text-muted);">Track your investment performance and engagement.</p>
        </div>
        
        <div class="stats-grid animate-fade-in stagger-2">
            <div class="stat-card card-glow">
                <div class="stat-card-header">
                    <span class="stat-label">Brand Engagements</span>
                    <div class="stat-card-icon"><span class="material-icons-round">qr_code_scanner</span></div>
                </div>
                <div class="stat-value" style="color: #43e97b;">4,200</div>
                <div style="font-size: 0.8rem; margin-top: 8px; color: var(--text-muted);">
                    Unique QR scans at Booth 4
                </div>
            </div>
            
            <div class="stat-card card-glow">
                <div class="stat-card-header">
                    <span class="stat-label">Lead Generation</span>
                    <div class="stat-card-icon"><span class="material-icons-round">contacts</span></div>
                </div>
                <div class="stat-value">850</div>
                <div style="font-size: 0.8rem; margin-top: 8px; color: var(--text-muted);">
                    Verified contact opt-ins
                </div>
            </div>
            
            <div class="stat-card card-glow">
                <div class="stat-card-header">
                    <span class="stat-label">Est. ROI</span>
                    <div class="stat-card-icon"><span class="material-icons-round">trending_up</span></div>
                </div>
                <div class="stat-value">3.2x</div>
                <div style="font-size: 0.8rem; margin-top: 8px; color: #43e97b;">
                    <span class="material-icons-round" style="font-size: 14px; vertical-align: middle;">arrow_upward</span>
                    Above industry average
                </div>
            </div>
        </div>

        <div class="card card-glow animate-fade-in stagger-3" style="margin-top: 20px;">
            <div class="card-header">
                <h3>Live Engagement Heatmap</h3>
            </div>
            <div class="card-body">
                <div style="height: 120px; background: linear-gradient(90deg, rgba(102,126,234,0.1) 0%, rgba(102,126,234,0.3) 50%, rgba(102,126,234,0.1) 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--text-muted);">
                    <span class="material-icons-round" style="margin-right: 8px;">map</span> Interactive Map Loading...
                </div>
                <p style="margin-top: 16px; font-size: 0.9rem; color: var(--text-secondary);">Your booth is currently experiencing high foot traffic. Consider deploying additional representatives.</p>
            </div>
        </div>
    `;
});
