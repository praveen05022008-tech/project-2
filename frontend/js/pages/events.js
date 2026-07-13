/* ═══════════════════════════════════════════════════════════════════════════
   EventPro — Events Page (Full CRUD)
   ═══════════════════════════════════════════════════════════════════════════ */

registerPage('events', initEvents);

const eventTypes = ['Wedding', 'Corporate', 'Birthday', 'Concert', 'Conference', 'Exhibition', 'Seminar', 'Other'];
const eventStatuses = ['Upcoming', 'In Progress', 'Completed', 'Cancelled'];

async function initEvents() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="toolbar fade-in">
            <div class="search-box">
                <span class="material-icons-round">search</span>
                <input type="text" id="event-search" placeholder="Search events...">
            </div>
            <select class="filter-select" id="event-filter-status">
                <option value="">All Statuses</option>
                ${eventStatuses.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
            <select class="filter-select" id="event-filter-type">
                <option value="">All Types</option>
                ${eventTypes.map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
            <div class="toolbar-spacer"></div>
            <button class="btn btn-primary" id="btn-add-event">
                <span class="material-icons-round">add</span>
                New Event
            </button>
        </div>
        <div class="card fade-in stagger-2">
            <div class="card-body" id="events-table-body">
                <div class="loading-state"><div class="spinner"></div></div>
            </div>
        </div>
    `;

    // Bind events
    document.getElementById('btn-add-event').addEventListener('click', () => openEventForm());
    document.getElementById('event-search').addEventListener('input', debounce(loadEvents, 400));
    document.getElementById('event-filter-status').addEventListener('change', loadEvents);
    document.getElementById('event-filter-type').addEventListener('change', loadEvents);

    await loadEvents();
}

async function loadEvents() {
    const tbody = document.getElementById('events-table-body');
    const search = document.getElementById('event-search')?.value || '';
    const status = document.getElementById('event-filter-status')?.value || '';
    const type = document.getElementById('event-filter-type')?.value || '';

    let query = '/events?';
    if (search) query += `search=${encodeURIComponent(search)}&`;
    if (status) query += `status=${encodeURIComponent(status)}&`;
    if (type) query += `event_type=${encodeURIComponent(type)}&`;

    try {
        const events = await api.get(query);
        renderEventsTable(events);
    } catch (err) {
        tbody.innerHTML = `
            <div class="empty-state">
                <span class="material-icons-round">cloud_off</span>
                <h4>Connection Error</h4>
                <p>Could not load events. Check if the backend server is running.</p>
            </div>
        `;
    }
}

function renderEventsTable(events) {
    const tbody = document.getElementById('events-table-body');

    if (!events || events.length === 0) {
        tbody.innerHTML = `
            <div class="empty-state">
                <span class="material-icons-round">event_busy</span>
                <h4>No Events Found</h4>
                <p>Create your first event by clicking the "New Event" button above.</p>
            </div>
        `;
        return;
    }

    tbody.innerHTML = `
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Event Name</th>
                        <th>Client</th>
                        <th>Date</th>
                        <th>Venue</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Budget</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${events.map(e => `
                        <tr>
                            <td style="color:var(--text-primary);font-weight:600">${e.title}</td>
                            <td>${e.client_name}</td>
                            <td>${formatDate(e.event_date)}</td>
                            <td>${e.venue || '—'}</td>
                            <td><span class="vendor-category-badge">${e.event_type}</span></td>
                            <td>${getStatusBadge(e.status)}</td>
                            <td style="font-weight:600">${formatCurrency(e.budget)}</td>
                            <td>
                                <div class="action-btns">
                                    <button class="action-btn action-btn-view" title="View Details" onclick="viewEventDetails(${e.id})">
                                        <span class="material-icons-round">visibility</span>
                                    </button>
                                    <button class="action-btn action-btn-edit" title="Edit" onclick="openEventForm(${e.id})">
                                        <span class="material-icons-round">edit</span>
                                    </button>
                                    <button class="action-btn action-btn-delete" title="Delete" onclick="confirmDeleteEvent(${e.id}, '${e.title.replace(/'/g, "\\'")}')">
                                        <span class="material-icons-round">delete</span>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function openEventForm(eventId = null) {
    const isEdit = eventId !== null;
    const title = isEdit ? 'Edit Event' : 'Create New Event';

    const formHtml = `
        <form id="event-form" class="form-grid">
            <div class="form-group">
                <label for="ef-title">Event Title *</label>
                <input type="text" id="ef-title" class="form-input" placeholder="Enter event title" required>
            </div>
            <div class="form-group">
                <label for="ef-type">Event Type</label>
                <select id="ef-type" class="form-select">
                    ${eventTypes.map(t => `<option value="${t}">${t}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="ef-client">Client Name *</label>
                <input type="text" id="ef-client" class="form-input" placeholder="Client name" required>
            </div>
            <div class="form-group">
                <label for="ef-email">Client Email</label>
                <input type="email" id="ef-email" class="form-input" placeholder="client@email.com">
            </div>
            <div class="form-group">
                <label for="ef-phone">Client Phone</label>
                <input type="text" id="ef-phone" class="form-input" placeholder="+91 XXXXX XXXXX">
            </div>
            <div class="form-group">
                <label for="ef-venue">Venue</label>
                <input type="text" id="ef-venue" class="form-input" placeholder="Event venue">
            </div>
            <div class="form-group">
                <label for="ef-date">Event Date *</label>
                <input type="date" id="ef-date" class="form-input" required>
            </div>
            <div class="form-group">
                <label for="ef-status">Status</label>
                <select id="ef-status" class="form-select">
                    ${eventStatuses.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="ef-start">Start Time</label>
                <input type="time" id="ef-start" class="form-input">
            </div>
            <div class="form-group">
                <label for="ef-end">End Time</label>
                <input type="time" id="ef-end" class="form-input">
            </div>
            <div class="form-group">
                <label for="ef-budget">Budget (₹)</label>
                <input type="number" id="ef-budget" class="form-input" placeholder="0" min="0">
            </div>
            <div class="form-group">
                <label for="ef-attendees">Expected Attendees</label>
                <input type="number" id="ef-attendees" class="form-input" placeholder="0" min="0">
            </div>
            <div class="form-group full-width">
                <label for="ef-desc">Description</label>
                <textarea id="ef-desc" class="form-textarea" placeholder="Event description..."></textarea>
            </div>
            <div class="form-group full-width">
                <label for="ef-notes">Notes</label>
                <textarea id="ef-notes" class="form-textarea" placeholder="Additional notes..."></textarea>
            </div>
            <div class="form-group full-width" style="margin-top:8px">
                <div class="modal-footer" style="padding:0;border:none;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">
                        <span class="material-icons-round">${isEdit ? 'save' : 'add_circle'}</span>
                        ${isEdit ? 'Update Event' : 'Create Event'}
                    </button>
                </div>
            </div>
        </form>
    `;

    openModal(title, formHtml);

    if (isEdit) {
        // Fetch event data and populate form
        api.get(`/events/${eventId}`).then(event => {
            document.getElementById('ef-title').value = event.title || '';
            document.getElementById('ef-type').value = event.event_type || 'Other';
            document.getElementById('ef-client').value = event.client_name || '';
            document.getElementById('ef-email').value = event.client_email || '';
            document.getElementById('ef-phone').value = event.client_phone || '';
            document.getElementById('ef-venue').value = event.venue || '';
            document.getElementById('ef-date').value = event.event_date || '';
            document.getElementById('ef-status').value = event.status || 'Upcoming';
            document.getElementById('ef-start').value = event.start_time || '';
            document.getElementById('ef-end').value = event.end_time || '';
            document.getElementById('ef-budget').value = event.budget || '';
            document.getElementById('ef-attendees').value = event.attendees_count || '';
            document.getElementById('ef-desc').value = event.description || '';
            document.getElementById('ef-notes').value = event.notes || '';
        }).catch(() => showToast('Failed to load event data', 'error'));
    }

    // Handle form submission
    document.getElementById('event-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            title: document.getElementById('ef-title').value.trim(),
            event_type: document.getElementById('ef-type').value,
            client_name: document.getElementById('ef-client').value.trim(),
            client_email: document.getElementById('ef-email').value.trim() || null,
            client_phone: document.getElementById('ef-phone').value.trim() || null,
            venue: document.getElementById('ef-venue').value.trim() || null,
            event_date: document.getElementById('ef-date').value,
            status: document.getElementById('ef-status').value,
            start_time: document.getElementById('ef-start').value || null,
            end_time: document.getElementById('ef-end').value || null,
            budget: parseFloat(document.getElementById('ef-budget').value) || 0,
            attendees_count: parseInt(document.getElementById('ef-attendees').value) || 0,
            description: document.getElementById('ef-desc').value.trim() || null,
            notes: document.getElementById('ef-notes').value.trim() || null,
        };

        if (!data.title || !data.client_name || !data.event_date) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        try {
            if (isEdit) {
                await api.put(`/events/${eventId}`, data);
                showToast('Event updated successfully!', 'success');
            } else {
                await api.post('/events', data);
                showToast('Event created successfully!', 'success');
            }
            closeModal();
            loadEvents();
        } catch (err) {
            showToast(err.message || 'Failed to save event', 'error');
        }
    });
}

async function viewEventDetails(eventId) {
    try {
        const event = await api.get(`/events/${eventId}`);
        let vendorsHtml = '';
        try {
            const vendors = await api.get(`/events/${eventId}/vendors`);
            if (vendors.length > 0) {
                vendorsHtml = `
                    <div style="margin-top:20px">
                        <h4 style="font-size:0.9rem;font-weight:600;margin-bottom:10px;color:var(--text-primary)">Assigned Vendors</h4>
                        ${vendors.map(v => `
                            <div style="display:flex;align-items:center;gap:10px;padding:8px;background:rgba(102,126,234,0.05);border-radius:8px;margin-bottom:6px">
                                <span class="vendor-category-badge">${v.vendor_category || 'N/A'}</span>
                                <span style="font-weight:600;color:var(--text-primary)">${v.vendor_name}</span>
                                <span style="flex:1"></span>
                                ${getStatusBadge(v.status)}
                                <span style="font-weight:600">${formatCurrency(v.agreed_price)}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        } catch (e) { /* no vendors */ }

        const detailsHtml = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                <div class="form-group">
                    <label>Event Type</label>
                    <span class="vendor-category-badge" style="width:fit-content">${event.event_type}</span>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <div>${getStatusBadge(event.status)}</div>
                </div>
                <div class="form-group">
                    <label>Client Name</label>
                    <p style="color:var(--text-primary);font-weight:500">${event.client_name}</p>
                </div>
                <div class="form-group">
                    <label>Client Email</label>
                    <p style="color:var(--text-secondary)">${event.client_email || '—'}</p>
                </div>
                <div class="form-group">
                    <label>Client Phone</label>
                    <p style="color:var(--text-secondary)">${event.client_phone || '—'}</p>
                </div>
                <div class="form-group">
                    <label>Venue</label>
                    <p style="color:var(--text-secondary)">${event.venue || '—'}</p>
                </div>
                <div class="form-group">
                    <label>Event Date</label>
                    <p style="color:var(--text-primary);font-weight:500">${formatDate(event.event_date)}</p>
                </div>
                <div class="form-group">
                    <label>Time</label>
                    <p style="color:var(--text-secondary)">${event.start_time || '—'} - ${event.end_time || '—'}</p>
                </div>
                <div class="form-group">
                    <label>Budget</label>
                    <p style="color:var(--accent-primary);font-weight:700;font-size:1.1rem">${formatCurrency(event.budget)}</p>
                </div>
                <div class="form-group">
                    <label>Attendees</label>
                    <p style="color:var(--text-primary);font-weight:500">${event.attendees_count || 0}</p>
                </div>
                <div class="form-group full-width">
                    <label>Description</label>
                    <p style="color:var(--text-secondary)">${event.description || 'No description provided.'}</p>
                </div>
                <div class="form-group full-width">
                    <label>Notes</label>
                    <p style="color:var(--text-secondary)">${event.notes || 'No notes.'}</p>
                </div>
            </div>
            ${vendorsHtml}
        `;

        openModal(`📋 ${event.title}`, detailsHtml);
    } catch (err) {
        showToast('Failed to load event details', 'error');
    }
}

function confirmDeleteEvent(id, title) {
    openModal('Delete Event', `
        <div class="confirm-dialog">
            <span class="material-icons-round">warning</span>
            <h4>Are you sure?</h4>
            <p>This will permanently delete "<strong>${title}</strong>" and all associated data. This action cannot be undone.</p>
            <div class="confirm-actions">
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn btn-danger" onclick="deleteEvent(${id})">
                    <span class="material-icons-round">delete_forever</span>
                    Delete Event
                </button>
            </div>
        </div>
    `);
}

async function deleteEvent(id) {
    try {
        await api.delete(`/events/${id}`);
        showToast('Event deleted successfully', 'success');
        closeModal();
        loadEvents();
    } catch (err) {
        showToast(err.message || 'Failed to delete event', 'error');
    }
}
