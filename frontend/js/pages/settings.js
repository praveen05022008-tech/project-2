/* ═══════════════════════════════════════════════════════════════════════════
   EventPro — Settings Page
   ═══════════════════════════════════════════════════════════════════════════ */

registerPage('settings', initSettings);

async function initSettings() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="loading-state"><div class="spinner"></div></div>
    `;

    try {
        const settings = await api.get('/settings');
        renderSettings(settings);
    } catch (err) {
        container.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <div class="empty-state">
                        <span class="material-icons-round">cloud_off</span>
                        <h4>Connection Error</h4>
                        <p>Could not load settings. Check if the backend server is running.</p>
                    </div>
                </div>
            </div>
        `;
    }
}

function renderSettings(settings) {
    const container = document.getElementById('page-container');
    const eventTypes = ['Wedding', 'Corporate', 'Birthday', 'Concert', 'Conference', 'Exhibition', 'Seminar', 'Other'];
    const currencies = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];

    container.innerHTML = `
        <form id="settings-form" class="fade-in">
            <!-- Company Information -->
            <div class="card" style="margin-bottom:24px;">
                <div class="card-header">
                    <h3>
                        <span class="material-icons-round" style="color:var(--accent-primary);font-size:20px;vertical-align:middle;margin-right:8px">business</span>
                        Company Information
                    </h3>
                </div>
                <div class="card-body">
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="sf-company">Company Name</label>
                            <input type="text" id="sf-company" class="form-input" value="${settings.company_name || ''}" placeholder="Your company name">
                        </div>
                        <div class="form-group">
                            <label for="sf-email">Company Email</label>
                            <input type="email" id="sf-email" class="form-input" value="${settings.company_email || ''}" placeholder="company@email.com">
                        </div>
                        <div class="form-group">
                            <label for="sf-phone">Company Phone</label>
                            <input type="text" id="sf-phone" class="form-input" value="${settings.company_phone || ''}" placeholder="+91 XXXXX XXXXX">
                        </div>
                        <div class="form-group">
                            <label for="sf-logo">Logo URL</label>
                            <input type="text" id="sf-logo" class="form-input" value="${settings.logo_url || ''}" placeholder="https://example.com/logo.png">
                        </div>
                        <div class="form-group full-width">
                            <label for="sf-address">Company Address</label>
                            <textarea id="sf-address" class="form-textarea" placeholder="Full address...">${settings.company_address || ''}</textarea>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Business Settings -->
            <div class="card" style="margin-bottom:24px;">
                <div class="card-header">
                    <h3>
                        <span class="material-icons-round" style="color:var(--accent-primary);font-size:20px;vertical-align:middle;margin-right:8px">tune</span>
                        Business Settings
                    </h3>
                </div>
                <div class="card-body">
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="sf-currency">Default Currency</label>
                            <select id="sf-currency" class="form-select">
                                ${currencies.map(c => `<option value="${c}" ${settings.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="sf-tax">Tax Rate (%)</label>
                            <input type="number" id="sf-tax" class="form-input" value="${settings.tax_rate || 18}" min="0" max="100" step="0.1">
                        </div>
                        <div class="form-group">
                            <label for="sf-default-type">Default Event Type</label>
                            <select id="sf-default-type" class="form-select">
                                ${eventTypes.map(t => `<option value="${t}" ${settings.default_event_type === t ? 'selected' : ''}>${t}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="sf-notif">Email Notifications</label>
                            <select id="sf-notif" class="form-select">
                                <option value="true" ${settings.notification_email ? 'selected' : ''}>Enabled</option>
                                <option value="false" ${!settings.notification_email ? 'selected' : ''}>Disabled</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Appearance -->
            <div class="card" style="margin-bottom:24px;">
                <div class="card-header">
                    <h3>
                        <span class="material-icons-round" style="color:var(--accent-primary);font-size:20px;vertical-align:middle;margin-right:8px">palette</span>
                        Appearance
                    </h3>
                </div>
                <div class="card-body">
                    <div class="form-grid">
                        <div class="form-group full-width">
                            <label for="sf-theme">Application Theme</label>
                            <select id="sf-theme" class="form-select" onchange="window.toggleTheme(this.value)">
                                <option value="dark" ${localStorage.getItem('theme') !== 'light' ? 'selected' : ''}>Dark Mode (Default)</option>
                                <option value="light" ${localStorage.getItem('theme') === 'light' ? 'selected' : ''}>Light Mode</option>
                            </select>
                            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 6px;">
                                Changes are applied instantly and saved to your device.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Save Button -->
            <div style="display:flex;justify-content:flex-end;gap:12px" class="fade-in stagger-3">
                <button type="button" class="btn btn-secondary" onclick="initSettings()">
                    <span class="material-icons-round">refresh</span>
                    Reset
                </button>
                <button type="submit" class="btn btn-primary">
                    <span class="material-icons-round">save</span>
                    Save Settings
                </button>
            </div>
        </form>
    `;

    // Handle form submission
    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            company_name: document.getElementById('sf-company').value.trim(),
            company_email: document.getElementById('sf-email').value.trim(),
            company_phone: document.getElementById('sf-phone').value.trim(),
            company_address: document.getElementById('sf-address').value.trim(),
            logo_url: document.getElementById('sf-logo').value.trim(),
            currency: document.getElementById('sf-currency').value,
            tax_rate: parseFloat(document.getElementById('sf-tax').value) || 0,
            default_event_type: document.getElementById('sf-default-type').value,
            notification_email: document.getElementById('sf-notif').value === 'true',
        };

        try {
            await api.put('/settings', data);
            showToast('Settings saved successfully!', 'success');
        } catch (err) {
            showToast(err.message || 'Failed to save settings', 'error');
        }
    });
}
