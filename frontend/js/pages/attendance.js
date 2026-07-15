/* Phase 2 — Staff QR attendance UI (camera check-in, QR display, roster). */

// ── Staff: scan the event QR to check in ────────────────────────────────────
let _attStream = null, _attRAF = null;

async function openAttendanceScan() {
    openModal('Check In', `
        <p class="text-muted" style="margin-bottom:10px;">Point your camera at the event's attendance QR.</p>
        <video id="att-video" playsinline style="width:100%;border-radius:10px;background:#000;max-height:280px;"></video>
        <canvas id="att-canvas" style="display:none;"></canvas>
        <p id="att-status" style="text-align:center;color:var(--text-muted);margin-top:8px;">Starting camera…</p>
        <div class="modal-footer" style="padding:0;border:none;"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button></div>`);
    const video = document.getElementById('att-video');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        document.getElementById('att-status').textContent = 'Camera not supported on this device.';
        return;
    }
    try {
        _attStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = _attStream; await video.play();
        document.getElementById('att-status').textContent = 'Scanning…';
        attScanLoop();
    } catch (e) {
        document.getElementById('att-status').textContent = 'Camera denied. Allow permission and retry.';
    }
}

function attScanLoop() {
    const video = document.getElementById('att-video'), canvas = document.getElementById('att-canvas');
    if (!video || !_attStream) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) { stopAttendanceScan(); submitAttendance(code.data.trim()); return; }
    }
    _attRAF = requestAnimationFrame(attScanLoop);
}

function stopAttendanceScan() {
    if (_attRAF) { cancelAnimationFrame(_attRAF); _attRAF = null; }
    if (_attStream) { _attStream.getTracks().forEach(t => t.stop()); _attStream = null; }
}

async function submitAttendance(code) {
    try {
        const r = await api.post('/attendance/scan', { code });
        closeModal();
        if (r.status === 'present') showToast('✅ Checked in!', 'success');
        else if (r.status === 'flagged') showToast('Already checked in — flagged for verification', 'info');
        if (pages[currentPage] && pages[currentPage].init) pages[currentPage].init();
    } catch (err) {
        closeModal();
        showToast(err.message || 'Check-in failed', 'error');
    }
}

// ── Organizer/Staff: display the event's attendance QR ──────────────────────
async function showAttendanceQR(eventId, title) {
    try {
        const q = await api.get(`/attendance/qr/${eventId}`);
        openModal('Attendance QR · ' + title, `
            <div style="text-align:center;">
                <div id="att-qr" style="background:#fff;padding:16px;border-radius:12px;display:inline-block;line-height:0;"></div>
                <p class="text-muted" style="margin-top:12px;">Staff scan this to mark attendance.</p>
                <p style="margin-top:4px;"><code style="color:var(--accent-tertiary);">${q.code}</code></p>
            </div>`);
        if (window.QRCode) new QRCode(document.getElementById('att-qr'),
            { text: q.code, width: 190, height: 190, colorDark: '#0b0d12', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.M });
    } catch (err) { showToast(err.message || 'Could not load QR', 'error'); }
}

// ── Organizer/Vendor: attendance roster ─────────────────────────────────────
function attBadge(a) {
    const m = { Present: 'badge-completed', Absent: 'badge-cancelled', Flagged: 'badge-progress', Pending: 'badge-upcoming' };
    return `<span class="badge ${m[a] || 'badge-upcoming'}">${a}</span>`;
}

async function openAttendanceRoster(eventId, title) {
    openModal('Staff Attendance · ' + title, `<div id="att-roster"><div class="loading-state"><div class="spinner"></div></div></div>`);
    await refreshRoster(eventId, title);
}

async function refreshRoster(eventId, title) {
    const body = document.getElementById('att-roster');
    if (!body) return;
    const canManage = window.currentUser && ['SUPER_ADMIN', 'ORGANIZER'].includes(window.currentUser.role);
    let d;
    try { d = await api.get(`/attendance/${eventId}`); } catch (e) { body.innerHTML = `<p class="text-danger">${e.message}</p>`; return; }
    const esc = s => (title || '').replace(/'/g, "\\'");
    body.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
            <span class="badge badge-completed">${d.present} present</span>
            <span class="badge badge-inactive">${d.total} assigned</span>
            ${d.flagged ? `<span class="badge badge-cancelled">${d.flagged} flagged</span>` : ''}
            <span style="flex:1"></span>
            <button class="btn btn-secondary btn-sm" onclick="requestAttendance(${eventId})"><span class="material-icons-round">campaign</span> Request check-in</button>
        </div>
        <div class="table-wrapper"><table class="data-table">
            <thead><tr><th>Staff</th><th>Zone</th><th>Status</th>${canManage ? '<th>Verify</th>' : ''}</tr></thead>
            <tbody>${d.staff.length ? d.staff.map(s => `<tr>
                <td>${s.staff_email}</td><td>${s.role_label || '—'}</td><td>${attBadge(s.attendance)}</td>
                ${canManage ? `<td><div class="action-btns">
                    <button class="action-btn action-btn-view" title="Mark present" onclick="setAtt(${s.id},'Present',${eventId},'${esc()}')"><span class="material-icons-round">check_circle</span></button>
                    <button class="action-btn action-btn-delete" title="Mark absent" onclick="setAtt(${s.id},'Absent',${eventId},'${esc()}')"><span class="material-icons-round">cancel</span></button>
                </div></td>` : ''}
            </tr>`).join('') : `<tr><td colspan="4" class="text-muted">No staff assigned to this event.</td></tr>`}</tbody>
        </table></div>`;
}

async function setAtt(id, status, eventId, title) {
    try { await api.post(`/attendance/${id}/status`, { attendance: status }); showToast(`Marked ${status}`, 'success'); refreshRoster(eventId, title); }
    catch (e) { showToast(e.message || 'Failed', 'error'); }
}

async function requestAttendance(eventId) {
    try { const r = await api.post(`/attendance/${eventId}/request`, {}); showToast(`Requested ${r.requested} staff to check in`, 'success'); }
    catch (e) { showToast(e.message || 'Failed', 'error'); }
}
