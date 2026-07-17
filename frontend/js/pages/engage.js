/* Phase 4 — shared engagement helpers: Q&A, venue map, certificate, event vendors. */

// ── Q&A ──────────────────────────────────────────────────────────────────────
async function openEventQA(eventId, title) {
    openModal('Q&A · ' + title, `<div id="qa-body"><div class="loading-state"><div class="spinner"></div></div></div>`);
    await refreshQA(eventId, title);
}

async function refreshQA(eventId, title) {
    const body = document.getElementById('qa-body');
    if (!body) return;
    const canAnswer = window.currentUser && ['SUPER_ADMIN', 'ORGANIZER'].includes(window.currentUser.role);
    let qs = [];
    try { qs = await api.get(`/portal/qa/${eventId}`); } catch (_) {}
    const esc = (title || '').replace(/'/g, "\\'");
    body.innerHTML = `
        <form id="qa-form" style="display:flex;gap:8px;margin-bottom:14px;">
            <input id="qa-input" class="form-input" placeholder="Ask a question…" style="flex:1;" required>
            <button class="btn btn-primary" type="submit"><span class="material-icons-round">send</span></button>
        </form>
        ${qs.length ? qs.map(q => `
            <div class="ai-alert-card" style="margin-bottom:10px;">
                <strong>Q:</strong> ${q.question}
                ${q.answer
                    ? `<p style="margin-top:6px;color:#1A5FFF;"><strong>A:</strong> ${q.answer}</p>`
                    : `<p style="margin-top:6px;color:var(--text-muted);font-size:0.8rem;">Awaiting answer…</p>
                       ${canAnswer ? `<button class="btn btn-secondary btn-sm" style="margin-top:6px;" onclick="answerQA(${q.id}, ${eventId}, '${esc}')">Answer</button>` : ''}`}
            </div>`).join('') : '<p class="text-muted">No questions yet — be the first to ask.</p>'}`;
    document.getElementById('qa-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = document.getElementById('qa-input').value.trim();
        if (!v) return;
        try { await api.post('/portal/qa', { event_id: eventId, question: v }); showToast('Question posted', 'success'); refreshQA(eventId, title); }
        catch (err) { showToast(err.message || 'Failed', 'error'); }
    });
}

async function answerQA(qid, eventId, title) {
    const ans = window.prompt('Your answer:');
    if (!ans) return;
    try { await api.post(`/portal/qa/${qid}/answer`, { answer: ans }); showToast('Answered', 'success'); refreshQA(eventId, title); }
    catch (e) { showToast(e.message || 'Failed', 'error'); }
}

// ── Venue map (organizer-provided link → QR) ────────────────────────────────
function showVenueMap(ev) {
    if (!ev.venue_map_url) { showToast('No venue map has been provided yet.', 'info'); return; }
    openModal('Venue Map · ' + ev.title, `
        <div style="text-align:center;">
            <div id="vm-qr" style="background:#fff;padding:14px;border-radius:12px;display:inline-block;line-height:0;"></div>
            <p style="margin-top:12px;"><a href="${ev.venue_map_url}" target="_blank" rel="noopener" class="btn btn-primary"><span class="material-icons-round">map</span> Open Venue Map</a></p>
            <p class="text-muted" style="font-size:0.8rem;">Scan or tap to open directions.</p>
        </div>`);
    if (window.QRCode) new QRCode(document.getElementById('vm-qr'),
        { text: ev.venue_map_url, width: 170, height: 170, colorDark: '#0b0d12', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.M });
}

// ── Certificate (for completed events) ──────────────────────────────────────
async function downloadCertificate(ev) {
    if (!window.jspdf) { showToast('PDF engine loading — try again', 'error'); return; }
    const name = (window.currentUser && window.currentUser.email.split('@')[0]) || 'Attendee';
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('l', 'mm', 'a4');   // landscape
    const W = 297, H = 210;
    pdf.setFillColor(15, 17, 21); pdf.rect(0, 0, W, H, 'F');
    pdf.setDrawColor(26, 95, 255); pdf.setLineWidth(3); pdf.rect(10, 10, W - 20, H - 20);
    pdf.setTextColor(26, 95, 255); pdf.setFontSize(14);
    pdf.text('EVENTOPRO', W / 2, 32, { align: 'center' });
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(30);
    pdf.text('Certificate of Participation', W / 2, 70, { align: 'center' });
    pdf.setFontSize(13); pdf.setTextColor(180, 184, 200);
    pdf.text('This certifies that', W / 2, 95, { align: 'center' });
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(26);
    pdf.text(name, W / 2, 115, { align: 'center' });
    pdf.setFontSize(13); pdf.setTextColor(180, 184, 200);
    pdf.text(`attended "${ev.title}"`, W / 2, 135, { align: 'center' });
    pdf.text(`${formatDate(ev.event_date)}${ev.venue ? ' · ' + ev.venue : ''}`, W / 2, 148, { align: 'center' });
    pdf.setFontSize(10); pdf.setTextColor(120, 125, 150);
    pdf.text('Issued by EventoPro', W / 2, 180, { align: 'center' });
    pdf.save(`certificate-${(ev.title || 'event').replace(/[^a-z0-9]+/gi, '_')}.pdf`);
    showToast('Certificate downloaded', 'success');
}

// ── Vendors at an event (attendee: review + budget planning) ─────────────────
async function showEventVendors(eventId, title) {
    openModal('Vendors · ' + title, `<div id="ev-vendors"><div class="loading-state"><div class="spinner"></div></div></div>`);
    let vs = [];
    try { vs = await api.get(`/events/${eventId}/vendors`); } catch (_) {}
    const el = document.getElementById('ev-vendors');
    if (!el) return;
    el.innerHTML = vs.length ? vs.map(v => `
        <div class="ai-alert-card" style="margin-bottom:8px;display:flex;align-items:center;gap:10px;">
            <span class="vendor-category-badge">${v.vendor_category || '—'}</span>
            <strong style="color:var(--text-primary);flex:1;">${v.vendor_name}</strong>
            <span class="text-muted">${formatCurrency(v.agreed_price)}</span>
        </div>`).join('') : '<p class="text-muted">No vendors listed for this event yet.</p>';
}

// ── Organizer tools: attendee list, crowd notify, sponsors, vendor suggestions ──
async function openAttendeeList(eventId, title) {
    openModal('Attendees · ' + title, `<div id="al-body"><div class="loading-state"><div class="spinner"></div></div></div>`);
    let rows = [];
    try { rows = await api.get(`/portal/events/${eventId}/attendees`); } catch (e) {
        document.getElementById('al-body').innerHTML = `<p class="text-danger">${e.message}</p>`; return;
    }
    const el = document.getElementById('al-body');
    el.innerHTML = `
        <p class="text-muted" style="margin-bottom:10px;">${rows.length} ticket holder(s).</p>
        <div class="table-wrapper"><table class="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Tier</th><th>Checked in</th></tr></thead>
            <tbody>${rows.length ? rows.map(r => `<tr>
                <td>${r.name || '—'}</td><td>${r.email}</td><td>${r.tier || '—'}</td>
                <td>${r.checked_in ? '<span class="badge badge-completed">Yes</span>' : '<span class="badge badge-inactive">No</span>'}</td>
            </tr>`).join('') : '<tr><td colspan="4" class="text-muted">No attendees yet.</td></tr>'}</tbody>
        </table></div>`;
}

function openCrowdNotify(eventId, title) {
    openModal('Notify Crowd Size · ' + title, `
        <form id="cn-form">
            <div class="form-group"><label>Message to staff & vendors</label>
                <textarea id="cn-msg" class="form-textarea" placeholder="e.g. Crowd at 80% in Zone A — send extra staff / prep more food" required></textarea></div>
            <div class="modal-footer" style="padding:0;border:none;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary"><span class="material-icons-round">campaign</span> Send Alert</button>
            </div>
        </form>`);
    document.getElementById('cn-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api.post(`/portal/events/${eventId}/notify-crowd`, { message: document.getElementById('cn-msg').value.trim() });
            showToast('Crowd alert sent to staff & vendors', 'success'); closeModal();
        } catch (err) { showToast(err.message || 'Failed', 'error'); }
    });
}

async function openSponsorList() {
    openModal('Interested Sponsors', `<div id="sl-body"><div class="loading-state"><div class="spinner"></div></div></div>`);
    let rows = [];
    try { rows = await api.get('/portal/sponsors/interested'); } catch (e) {
        document.getElementById('sl-body').innerHTML = `<p class="text-danger">${e.message}</p>`; return;
    }
    document.getElementById('sl-body').innerHTML = rows.length ? `
        <div class="table-wrapper"><table class="data-table">
            <thead><tr><th>Sponsor</th><th>Company</th><th>Contact</th><th>Event</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>${rows.map(s => `<tr>
                <td>${s.sponsor_email}</td><td>${s.company || '—'}</td>
                <td>${s.contact_phone || '—'}</td><td>${s.event}</td>
                <td>${formatCurrency(s.amount)}</td><td>${getStatusBadge(s.status === 'Confirmed' ? 'Confirmed' : 'Pending')}</td>
            </tr>`).join('')}</tbody>
        </table></div>` : '<p class="text-muted">No sponsors have expressed interest yet.</p>';
}

async function openVendorSuggestions() {
    openModal('Top Vendor Suggestions', `<div id="vs-body"><div class="loading-state"><div class="spinner"></div></div></div>`);
    let rows = [];
    try { rows = await api.get('/portal/vendors/suggestions'); } catch (e) {
        document.getElementById('vs-body').innerHTML = `<p class="text-danger">${e.message}</p>`; return;
    }
    document.getElementById('vs-body').innerHTML = `
        <p class="text-muted" style="margin-bottom:10px;">Ranked by rating & reviews.</p>
        ${rows.map(v => `<div class="ai-alert-card" style="margin-bottom:8px;display:flex;align-items:center;gap:10px;">
            <span class="vendor-category-badge">${v.category}</span>
            <strong style="color:var(--text-primary);flex:1;">${v.name}</strong>
            <span style="color:#FF2D95;">★ ${v.rating}</span>
            <span class="badge ${v.availability === 'Available' ? 'badge-completed' : 'badge-inactive'}">${v.availability}</span>
        </div>`).join('') || '<p class="text-muted">No vendors found.</p>'}`;
}
