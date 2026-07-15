/* ═══════════════════════════════════════════════════════════════════════════
   EventoPro — Events Page (Full CRUD)
   ═══════════════════════════════════════════════════════════════════════════ */

registerPage('events', initEvents);

const eventTypes = ['Wedding', 'Corporate', 'Birthday', 'Concert', 'Conference', 'Exhibition', 'Seminar', 'Other'];
const eventStatuses = ['Upcoming', 'In Progress', 'Completed', 'Cancelled'];

// Only these roles may create/edit/delete events (matches the backend rules).
// Attendees, Vendors and Sponsors get a read-only view.
function canManageEvents() {
    return ['SUPER_ADMIN', 'ORGANIZER', 'STAFF'].includes(window.currentUser && window.currentUser.role);
}

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
            <input type="date" class="filter-select" id="event-filter-date" title="Filter by date" style="padding-right: 14px;">
            <div class="toolbar-spacer"></div>
            <button class="btn btn-secondary" onclick="exportEventsCSV()">
                <span class="material-icons-round">download</span> Export
            </button>
            ${canManageEvents() ? `
            <button class="btn btn-primary" id="btn-add-event">
                <span class="material-icons-round">add</span>
                New Event
            </button>` : ''}
        </div>
        <div class="card fade-in stagger-2">
            <div class="card-body" id="events-table-body">
                <div class="loading-state"><div class="spinner"></div></div>
            </div>
        </div>
    `;

    // Bind events
    const addBtn = document.getElementById('btn-add-event');
    if (addBtn) addBtn.addEventListener('click', () => openEventForm());
    document.getElementById('event-search').addEventListener('input', debounce(loadEvents, 400));
    document.getElementById('event-filter-status').addEventListener('change', loadEvents);
    document.getElementById('event-filter-type').addEventListener('change', loadEvents);
    document.getElementById('event-filter-date').addEventListener('change', loadEvents);

    await loadEvents();
}

// Generate + download a standards-based iCalendar (.ics) file for an event,
// importable into Google / Outlook / Apple Calendar.
async function addToCalendar(eventId) {
    try {
        const e = await api.get(`/events/${eventId}`);
        const pad = n => String(n).padStart(2, '0');
        const dt = (dateStr, timeStr) => {
            const d = dateStr.replace(/-/g, '');
            if (!timeStr) return { value: d, allDay: true };
            return { value: d + 'T' + timeStr.replace(':', '') + '00', allDay: false };
        };
        const start = dt(e.event_date, e.start_time);
        const end = e.end_time ? dt(e.event_date, e.end_time) : null;
        const esc = s => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
        const startLine = start.allDay ? `DTSTART;VALUE=DATE:${start.value}` : `DTSTART:${start.value}`;
        const endLine = end ? (end.allDay ? `DTEND;VALUE=DATE:${end.value}` : `DTEND:${end.value}`) : '';
        const ics = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EventoPro//EN', 'CALSCALE:GREGORIAN',
            'BEGIN:VEVENT',
            `UID:event-${e.id}@eventpro`,
            startLine, endLine,
            `SUMMARY:${esc(e.title)}`,
            `LOCATION:${esc(e.venue)}`,
            `DESCRIPTION:${esc(e.description || (e.event_type + ' event'))}`,
            'END:VEVENT', 'END:VCALENDAR',
        ].filter(Boolean).join('\r\n');
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${e.title.replace(/[^a-z0-9]+/gi, '_')}.ics`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        showToast('Calendar file downloaded', 'success');
    } catch (err) { showToast('Failed to create calendar file', 'error'); }
}

// Copy the shareable public event page link (served by the backend at /e/{id}).
function sharePublicLink(eventId) {
    const base = (typeof BACKEND_URL !== 'undefined' && BACKEND_URL) ? BACKEND_URL.replace(/\/+$/, '') : window.location.origin;
    const url = `${base}/e/${eventId}`;
    const done = () => openModal('Share Event', `
        <p style="color:var(--text-secondary);margin-bottom:10px;">Public registration link (no login needed):</p>
        <input class="form-input" value="${url}" readonly onclick="this.select()" style="margin-bottom:12px;">
        <a href="${url}" target="_blank" rel="noopener" class="btn btn-primary" style="width:100%;justify-content:center;">
            <span class="material-icons-round">open_in_new</span> Open public page</a>`);
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => { showToast('Public link copied', 'success'); done(); }).catch(done);
    } else { done(); }
}

async function exportEventsCSV() {
    try {
        const events = await api.get('/events?limit=500');
        exportCSV('events.csv',
            ['ID', 'Title', 'Client', 'Type', 'Status', 'Date', 'Venue', 'Budget', 'Expected Attendance'],
            events.map(e => [e.id, e.title, e.client_name, e.event_type, e.status, e.event_date, e.venue, e.budget, e.expected_attendance]));
    } catch (err) { showToast('Export failed', 'error'); }
}

async function loadEvents() {
    const tbody = document.getElementById('events-table-body');
    const search = document.getElementById('event-search')?.value || '';
    const status = document.getElementById('event-filter-status')?.value || '';
    const type = document.getElementById('event-filter-type')?.value || '';
    const date = document.getElementById('event-filter-date')?.value || '';

    let query = '/events?';
    if (search) query += `search=${encodeURIComponent(search)}&`;
    if (status) query += `status=${encodeURIComponent(status)}&`;
    if (type) query += `event_type=${encodeURIComponent(type)}&`;
    if (date) {
        query += `date_from=${encodeURIComponent(date)}&date_to=${encodeURIComponent(date)}&`;
    }

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
                                    ${!canManageEvents() ? `
                                    <button class="action-btn action-btn-view" title="Get Tickets" onclick="openTicketPurchase(${e.id}, '${e.title.replace(/'/g, "\\'")}')">
                                        <span class="material-icons-round">confirmation_number</span>
                                    </button>
                                    <button class="action-btn action-btn-view" title="Rate this event" onclick="openFeedbackForm(${e.id}, '${e.title.replace(/'/g, "\\'")}')">
                                        <span class="material-icons-round">rate_review</span>
                                    </button>` : ''}
                                    ${canManageEvents() ? `
                                    <button class="action-btn action-btn-view" title="Manage Tickets" onclick="openTicketManage(${e.id}, '${e.title.replace(/'/g, "\\'")}')">
                                        <span class="material-icons-round">local_activity</span>
                                    </button>
                                    <button class="action-btn action-btn-view" title="Share public link" onclick="sharePublicLink(${e.id})">
                                        <span class="material-icons-round">share</span>
                                    </button>
                                    <button class="action-btn action-btn-view" title="Attendees" onclick="openAttendeeList(${e.id}, '${e.title.replace(/'/g, "\\'")}')">
                                        <span class="material-icons-round">groups</span>
                                    </button>` : ''}
                                    ${canManageEvents() ? `
                                    <button class="action-btn action-btn-edit" title="Edit" onclick="openEventForm(${e.id})">
                                        <span class="material-icons-round">edit</span>
                                    </button>
                                    <button class="action-btn action-btn-delete" title="Delete" onclick="confirmDeleteEvent(${e.id}, '${e.title.replace(/'/g, "\\'")}')">
                                        <span class="material-icons-round">delete</span>
                                    </button>` : ''}
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
            <div class="form-group full-width">
                <label for="ef-venuemap">Venue Map URL (shown to attendees as a QR)</label>
                <input type="url" id="ef-venuemap" class="form-input" placeholder="https://maps.google.com/...">
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
            document.getElementById('ef-venuemap').value = event.venue_map_url || '';
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
            venue_map_url: document.getElementById('ef-venuemap').value.trim() || null,
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
            <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
                <button class="btn btn-secondary btn-sm" onclick="addToCalendar(${event.id})">
                    <span class="material-icons-round">event_available</span> Add to Calendar
                </button>
            </div>
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
