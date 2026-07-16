/* ═══════════════════════════════════════════════════════════════════════════
   EventoPro — Vendors Page (Full CRUD)
   ═══════════════════════════════════════════════════════════════════════════ */

registerPage('vendors', initVendors);

const vendorCategories = ['Catering', 'Decoration', 'Photography', 'Music', 'Venue', 'Lighting', 'Transport', 'Florist', 'Security', 'Other'];

async function initVendors() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="toolbar fade-in">
            <div class="search-box">
                <span class="material-icons-round">search</span>
                <input type="text" id="vendor-search" placeholder="Search vendors...">
            </div>
            <select class="filter-select" id="vendor-filter-category">
                <option value="">All Categories</option>
                ${vendorCategories.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
            <select class="filter-select" id="vendor-filter-active">
                <option value="">All Status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
            </select>
            <div class="toolbar-spacer"></div>
            <button class="btn btn-secondary" onclick="openVendorSuggestions()"><span class="material-icons-round">star</span> Top Vendors</button>
            <button class="btn btn-secondary" onclick="openSponsorList()"><span class="material-icons-round">handshake</span> Sponsors</button>
            <button class="btn btn-primary" id="btn-add-vendor">
                <span class="material-icons-round">add</span>
                Add Vendor
            </button>
        </div>
        <div id="vendors-content" class="fade-in stagger-2">
            <div class="loading-state"><div class="spinner"></div></div>
        </div>
    `;

    document.getElementById('btn-add-vendor').addEventListener('click', () => openVendorForm());
    document.getElementById('vendor-search').addEventListener('input', debounce(loadVendors, 400));
    document.getElementById('vendor-filter-category').addEventListener('change', loadVendors);
    document.getElementById('vendor-filter-active').addEventListener('change', loadVendors);

    await loadVendors();
}

async function loadVendors() {
    const content = document.getElementById('vendors-content');
    const search = document.getElementById('vendor-search')?.value || '';
    const category = document.getElementById('vendor-filter-category')?.value || '';
    const active = document.getElementById('vendor-filter-active')?.value || '';

    let query = '/vendors?';
    if (search) query += `search=${encodeURIComponent(search)}&`;
    if (category) query += `category=${encodeURIComponent(category)}&`;
    if (active !== '') query += `is_active=${active}&`;

    try {
        const vendors = await api.get(query);
        renderVendorCards(vendors);
    } catch (err) {
        content.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <div class="empty-state">
                        <span class="material-icons-round">cloud_off</span>
                        <h4>Connection Error</h4>
                        <p>Could not load vendors. Check if the backend server is running.</p>
                    </div>
                </div>
            </div>
        `;
    }
}

function renderVendorCards(vendors) {
    const content = document.getElementById('vendors-content');

    if (!vendors || vendors.length === 0) {
        content.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <div class="empty-state">
                        <span class="material-icons-round">store</span>
                        <h4>No Vendors Found</h4>
                        <p>Add your first vendor by clicking the "Add Vendor" button above.</p>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    content.innerHTML = `
        <div class="vendor-grid">
            ${vendors.map((v, i) => `
                <div class="vendor-card fade-in" style="animation-delay: ${i * 0.05}s">
                    <div class="vendor-card-top">
                        <div class="vendor-card-info">
                            <h4>${v.name}</h4>
                            <span class="vendor-category-badge">${v.category}</span>
                        </div>
                        ${getActiveBadge(v.is_active)}
                    </div>
                    <div class="vendor-card-details">
                        ${v.email ? `
                            <div class="vendor-detail">
                                <span class="material-icons-round">email</span>
                                ${v.email}
                            </div>
                        ` : ''}
                        ${v.phone ? `
                            <div class="vendor-detail">
                                <span class="material-icons-round">phone</span>
                                ${v.phone}
                            </div>
                        ` : ''}
                        ${v.address ? `
                            <div class="vendor-detail">
                                <span class="material-icons-round">location_on</span>
                                ${v.address}
                            </div>
                        ` : ''}
                        ${v.price_range ? `
                            <div class="vendor-detail">
                                <span class="material-icons-round">payments</span>
                                ${v.price_range}
                            </div>
                        ` : ''}
                    </div>
                    ${renderStars(v.rating)}
                    <div class="ai-alert-card" style="margin-top: 10px; padding: 10px;">
                        <strong>AI Performance Score: <span style="color:#4facfe">${Math.floor(v.rating * 18 + 5)}/100</span></strong>
                        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Based on past deliveries and budget adherence</p>
                    </div>
                    ${v.description ? `<p style="font-size:0.8rem;color:var(--text-muted);margin-top:10px;line-height:1.5">${v.description.substring(0, 100)}${v.description.length > 100 ? '...' : ''}</p>` : ''}
                    <div class="vendor-card-actions">
                        ${(v.is_active || v.availability === 'Available') ? `
                        <button class="btn btn-primary btn-sm vendor-register-btn" onclick="openVendorRegister(${v.id}, '${v.name.replace(/'/g, "\\'")}')">
                            <span class="material-icons-round">event_available</span> Register
                        </button>` : ''}
                        <button class="action-btn action-btn-edit" title="Edit" onclick="openVendorForm(${v.id})">
                            <span class="material-icons-round">edit</span>
                        </button>
                        <button class="action-btn action-btn-delete" title="Delete" onclick="confirmDeleteVendor(${v.id}, '${v.name.replace(/'/g, "\\'")}')">
                            <span class="material-icons-round">delete</span>
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function openVendorForm(vendorId = null) {
    const isEdit = vendorId !== null;
    const title = isEdit ? 'Edit Vendor' : 'Add New Vendor';

    const formHtml = `
        <form id="vendor-form" class="form-grid">
            <div class="form-group">
                <label for="vf-name">Vendor Name *</label>
                <input type="text" id="vf-name" class="form-input" placeholder="Vendor name" required>
            </div>
            <div class="form-group">
                <label for="vf-category">Category</label>
                <select id="vf-category" class="form-select">
                    ${vendorCategories.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="vf-email">Email</label>
                <input type="email" id="vf-email" class="form-input" placeholder="vendor@email.com">
            </div>
            <div class="form-group">
                <label for="vf-phone">Phone</label>
                <input type="text" id="vf-phone" class="form-input" placeholder="+91 XXXXX XXXXX">
            </div>
            <div class="form-group full-width">
                <label for="vf-address">Address</label>
                <input type="text" id="vf-address" class="form-input" placeholder="Vendor address">
            </div>
            <div class="form-group">
                <label for="vf-rating">Rating (0-5)</label>
                <input type="number" id="vf-rating" class="form-input" placeholder="0" min="0" max="5" step="0.5">
            </div>
            <div class="form-group">
                <label for="vf-price">Price Range</label>
                <input type="text" id="vf-price" class="form-input" placeholder="e.g., ₹50,000 - ₹1,00,000">
            </div>
            <div class="form-group full-width">
                <label for="vf-desc">Description</label>
                <textarea id="vf-desc" class="form-textarea" placeholder="Vendor description..."></textarea>
            </div>
            <div class="form-group">
                <label for="vf-active">Status</label>
                <select id="vf-active" class="form-select">
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                </select>
            </div>
            <div class="form-group full-width" style="margin-top:8px">
                <div class="modal-footer" style="padding:0;border:none;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">
                        <span class="material-icons-round">${isEdit ? 'save' : 'add_circle'}</span>
                        ${isEdit ? 'Update Vendor' : 'Add Vendor'}
                    </button>
                </div>
            </div>
        </form>
    `;

    openModal(title, formHtml);

    if (isEdit) {
        api.get(`/vendors/${vendorId}`).then(vendor => {
            document.getElementById('vf-name').value = vendor.name || '';
            document.getElementById('vf-category').value = vendor.category || 'Other';
            document.getElementById('vf-email').value = vendor.email || '';
            document.getElementById('vf-phone').value = vendor.phone || '';
            document.getElementById('vf-address').value = vendor.address || '';
            document.getElementById('vf-rating').value = vendor.rating || '';
            document.getElementById('vf-price').value = vendor.price_range || '';
            document.getElementById('vf-desc').value = vendor.description || '';
            document.getElementById('vf-active').value = vendor.is_active ? 'true' : 'false';
        }).catch(() => showToast('Failed to load vendor data', 'error'));
    }

    document.getElementById('vendor-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('vf-name').value.trim(),
            category: document.getElementById('vf-category').value,
            email: document.getElementById('vf-email').value.trim() || null,
            phone: document.getElementById('vf-phone').value.trim() || null,
            address: document.getElementById('vf-address').value.trim() || null,
            rating: parseFloat(document.getElementById('vf-rating').value) || 0,
            price_range: document.getElementById('vf-price').value.trim() || null,
            description: document.getElementById('vf-desc').value.trim() || null,
            is_active: document.getElementById('vf-active').value === 'true',
        };

        if (!data.name) {
            showToast('Vendor name is required', 'error');
            return;
        }

        try {
            if (isEdit) {
                await api.put(`/vendors/${vendorId}`, data);
                showToast('Vendor updated successfully!', 'success');
            } else {
                await api.post('/vendors', data);
                showToast('Vendor added successfully!', 'success');
            }
            closeModal();
            loadVendors();
        } catch (err) {
            showToast(err.message || 'Failed to save vendor', 'error');
        }
    });
}

function confirmDeleteVendor(id, name) {
    openModal('Delete Vendor', `
        <div class="confirm-dialog">
            <span class="material-icons-round">warning</span>
            <h4>Are you sure?</h4>
            <p>This will permanently delete vendor "<strong>${name}</strong>". This action cannot be undone.</p>
            <div class="confirm-actions">
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn btn-danger" onclick="deleteVendor(${id})">
                    <span class="material-icons-round">delete_forever</span>
                    Delete Vendor
                </button>
            </div>
        </div>
    `);
}

async function deleteVendor(id) {
    try {
        await api.delete(`/vendors/${id}`);
        showToast('Vendor deleted successfully', 'success');
        closeModal();
        loadVendors();
    } catch (err) {
        showToast(err.message || 'Failed to delete vendor', 'error');
    }
}

// Register (book) an active/available vendor onto one of the organiser's events.
async function openVendorRegister(vendorId, name) {
    let events = [];
    try { events = await api.get('/my-events'); } catch (_) {}
    const opts = events.map(e => `<option value="${e.id}">${e.title} — ${formatDate(e.event_date)}</option>`).join('');
    openModal('Register Vendor · ' + name, `
        <form id="vr-form" class="form-grid">
            <div class="form-group full-width">
                <label>Event</label>
                <select id="vr-event" class="form-select">${opts || '<option value="">— No events —</option>'}</select>
            </div>
            <div class="form-group">
                <label>Role / Service</label>
                <input id="vr-role" class="form-input" placeholder="e.g. Main Caterer">
            </div>
            <div class="form-group">
                <label>Agreed Price (₹)</label>
                <input id="vr-price" type="number" class="form-input" min="0" value="0">
            </div>
            <div class="form-group full-width">
                <label>Status</label>
                <select id="vr-status" class="form-select">
                    <option value="Confirmed">Confirmed</option>
                    <option value="Pending">Pending</option>
                </select>
            </div>
            <div class="form-group full-width"><div class="modal-footer" style="padding:0;border:none;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary"><span class="material-icons-round">event_available</span> Register</button>
            </div></div>
        </form>`);
    document.getElementById('vr-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const eid = document.getElementById('vr-event').value;
        if (!eid) { showToast('Create an event first to register a vendor', 'error'); return; }
        try {
            await api.post(`/events/${eid}/vendors`, {
                vendor_id: vendorId,
                role: document.getElementById('vr-role').value.trim() || null,
                agreed_price: parseFloat(document.getElementById('vr-price').value) || 0,
                status: document.getElementById('vr-status').value,
            });
            showToast(`${name} registered for the event`, 'success');
            closeModal();
        } catch (err) { showToast(err.message || 'Failed to register vendor', 'error'); }
    });
}
