registerPage('dashboard-attendee', () => {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="dashboard-header animate-fade-in stagger-1" style="margin-bottom: 24px;">
            <h3 style="font-size: 1.6rem; color: var(--text-primary);">Attendee Experience</h3>
            <p style="color: var(--text-muted);">Your personalized event schedule, maps, and AI concierge.</p>
        </div>
        
        <div class="stats-grid animate-fade-in stagger-2">
            <div class="stat-card card-glow">
                <div class="stat-card-header">
                    <span class="stat-label">Upcoming Session</span>
                    <div class="stat-card-icon"><span class="material-icons-round">event</span></div>
                </div>
                <div class="stat-value" style="font-size: 1.4rem;">Keynote Speech</div>
                <div style="font-size: 0.8rem; margin-top: 8px; color: var(--accent-tertiary);">
                    <span class="material-icons-round" style="font-size: 14px; vertical-align: middle;">schedule</span>
                    Starts in 45 mins
                </div>
            </div>
            
            <div class="stat-card card-glow">
                <div class="stat-card-header">
                    <span class="stat-label">Location</span>
                    <div class="stat-card-icon"><span class="material-icons-round">place</span></div>
                </div>
                <div class="stat-value" style="font-size: 1.4rem;">Main Auditorium</div>
                <div style="font-size: 0.8rem; margin-top: 8px; color: var(--text-muted);">
                    Follow the blue signs from the lobby.
                </div>
            </div>
            
            <div class="stat-card card-glow" style="display: flex; align-items: center; justify-content: center; flex-direction: column;">
                <span class="material-icons-round" style="font-size: 48px; color: var(--accent-primary); margin-bottom: 8px;">qr_code_2</span>
                <button class="btn btn-primary btn-sm" style="width: 100%; justify-content: center;">Show FastPass Ticket</button>
            </div>
        </div>

        <div class="card card-glow animate-fade-in stagger-3 ai-alert-card" style="margin-top: 20px; border-left-color: var(--accent-tertiary); background: rgba(0, 210, 255, 0.05);">
            <div class="card-header" style="border: none; padding-bottom: 0;">
                <h3 style="display: flex; align-items: center; gap: 8px;">
                    <span class="material-icons-round" style="color: var(--accent-tertiary);">smart_toy</span>
                    AI Concierge Suggestion
                </h3>
            </div>
            <div class="card-body">
                <p style="color: var(--text-secondary); margin-bottom: 12px;">"Since you attended the Python Workshop yesterday, you might enjoy the 'Future of AI' panel happening in Room B at 2:00 PM today. Would you like me to add it to your schedule?"</p>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-secondary btn-sm" style="background: var(--accent-gradient-2); color: white; border: none;">Add to Schedule</button>
                    <button class="btn btn-secondary btn-sm">Dismiss</button>
                </div>
            </div>
        </div>
    `;
});
