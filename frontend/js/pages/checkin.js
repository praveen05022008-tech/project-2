/* Check-in helpers: attendee FastPass QR + staff/organizer scan modal. */

// Render a real QR FastPass ticket for an event into `slotId`.
async function renderFastPass(slotId, event) {
    const slot = document.getElementById(slotId);
    if (!slot || !event) return;
    try {
        const t = await api.get(`/checkin/my-ticket/${event.id}`);
        slot.innerHTML = `
            <div class="card card-glow animate-fade-in stagger-1" style="margin-bottom:20px;">
                <div class="card-header">
                    <h3><span class="material-icons-round" style="vertical-align:middle;">confirmation_number</span> Your FastPass</h3>
                </div>
                <div class="card-body" style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;">
                    <div id="fastpass-qr" style="background:#fff;padding:12px;border-radius:12px;line-height:0;"></div>
                    <div style="flex:1;min-width:200px;">
                        <div style="font-size:1.25rem;font-weight:700;color:var(--text-primary);">${t.event_title}</div>
                        <div style="color:var(--text-secondary);margin-top:4px;">
                            <span class="material-icons-round" style="font-size:15px;vertical-align:middle;">event</span> ${formatDate(t.event_date)}
                            &nbsp;·&nbsp;
                            <span class="material-icons-round" style="font-size:15px;vertical-align:middle;">place</span> ${t.venue || 'Venue TBD'}
                        </div>
                        <div style="margin-top:12px;color:var(--text-secondary);">Ticket ID: <code style="color:var(--accent-tertiary);">${t.code}</code></div>
                        <div style="margin-top:10px;">
                            ${t.checked_in
                                ? '<span class="badge badge-completed">Checked In</span>'
                                : '<span class="badge badge-upcoming">Show this at the gate</span>'}
                        </div>
                    </div>
                </div>
            </div>`;
        // Render the QR (uses the vendored qrcode library).
        if (window.QRCode) {
            new QRCode(document.getElementById('fastpass-qr'), {
                text: t.code, width: 128, height: 128,
                colorDark: '#0b0d12', colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M,
            });
        } else {
            document.getElementById('fastpass-qr').innerHTML =
                `<div style="color:#000;font-weight:700;padding:20px;">${t.code}</div>`;
        }
    } catch (e) {
        console.error('FastPass load failed', e);
    }
}

// Staff/Organizer/Admin: record a check-in scan (stands in for a physical scanner).
async function openScanModal(defaultEventId) {
    let events = [];
    try { events = await api.get('/events'); } catch (e) { /* ignore */ }
    const opts = events.map(e =>
        `<option value="${e.id}" ${String(e.id) === String(defaultEventId) ? 'selected' : ''}>${e.title}</option>`
    ).join('');

    openModal('Record Check-in', `
        <form id="scan-form" class="form-grid">
            <div class="form-group">
                <label for="sc-event">Event</label>
                <select id="sc-event" class="form-select">${opts}</select>
            </div>
            <div class="form-group">
                <label for="sc-type">Scan Type</label>
                <select id="sc-type" class="form-select">
                    <option value="ENTRY">Entry (gate)</option>
                    <option value="BOOTH">Booth (sponsor)</option>
                    <option value="SESSION">Session</option>
                </select>
            </div>
            <div class="form-group">
                <label for="sc-zone">Zone / Location</label>
                <input id="sc-zone" class="form-input" placeholder="e.g. Gate A / Booth 4">
            </div>
            <div class="form-group">
                <label for="sc-code">Ticket Code (optional)</label>
                <div style="display:flex;gap:8px;">
                    <input id="sc-code" class="form-input" placeholder="FP-XXXXXXXX" style="flex:1;">
                    <button type="button" class="btn btn-secondary" id="sc-scan-btn" onclick="startQrScan()" title="Scan with camera">
                        <span class="material-icons-round">qr_code_scanner</span>
                    </button>
                </div>
                <div id="sc-scan-area" style="display:none;margin-top:10px;">
                    <video id="sc-video" playsinline style="width:100%;border-radius:10px;background:#000;max-height:240px;"></video>
                    <canvas id="sc-canvas" style="display:none;"></canvas>
                    <p id="sc-scan-status" style="font-size:0.8rem;color:var(--text-muted);margin-top:6px;text-align:center;">Point the camera at a FastPass QR…</p>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="stopQrScan()" style="width:100%;justify-content:center;">Stop camera</button>
                </div>
            </div>
            <div class="form-group full-width" id="sc-lead-wrap" style="display:none;">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input type="checkbox" id="sc-lead" style="width:auto;"> Lead captured (visitor opted in)
                </label>
            </div>
            <div class="form-group full-width">
                <div class="modal-footer" style="padding:0;border:none;">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">
                        <span class="material-icons-round">how_to_reg</span> Record Check-in
                    </button>
                </div>
            </div>
        </form>
    `);

    document.getElementById('sc-type').addEventListener('change', (e) => {
        document.getElementById('sc-lead-wrap').style.display = e.target.value === 'BOOTH' ? 'block' : 'none';
    });

    document.getElementById('scan-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
            event_id: parseInt(document.getElementById('sc-event').value),
            scan_type: document.getElementById('sc-type').value,
            zone: document.getElementById('sc-zone').value.trim() || null,
            ticket_code: document.getElementById('sc-code').value.trim() || null,
            lead_captured: (document.getElementById('sc-lead') || {}).checked || false,
        };
        try {
            const res = await api.post('/checkin/scan', body);
            const msg = res.ticket_valid === false ? 'Recorded (ticket not validated)' :
                        res.ticket_valid ? 'Check-in recorded — ticket valid ✓' : 'Check-in recorded';
            showToast(msg, 'success');
            stopQrScan();
            closeModal();
            if (pages[currentPage] && pages[currentPage].init) pages[currentPage].init();
        } catch (err) {
            showToast(err.message || 'Failed to record check-in', 'error');
        }
    });
}

// ── Camera QR scanning (device camera + jsQR) ──────────────────────────────
let _qrStream = null;
let _qrRAF = null;

async function startQrScan() {
    const area = document.getElementById('sc-scan-area');
    const video = document.getElementById('sc-video');
    const status = document.getElementById('sc-scan-status');
    if (!area || !video) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Camera not supported on this device/browser', 'error');
        return;
    }
    area.style.display = 'block';
    try {
        _qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = _qrStream;
        await video.play();
        scanQrFrame();
    } catch (err) {
        if (status) status.textContent = 'Camera access denied. Allow permission and retry.';
        showToast('Camera permission denied', 'error');
    }
}

function scanQrFrame() {
    const video = document.getElementById('sc-video');
    const canvas = document.getElementById('sc-canvas');
    const status = document.getElementById('sc-scan-status');
    if (!video || !canvas || !_qrStream) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) {
            const val = code.data.trim();
            const input = document.getElementById('sc-code');
            if (input) input.value = val;
            if (status) status.textContent = 'Scanned: ' + val;
            showToast('QR scanned: ' + val, 'success');
            stopQrScan();
            return;
        }
    }
    _qrRAF = requestAnimationFrame(scanQrFrame);
}

function stopQrScan() {
    if (_qrRAF) { cancelAnimationFrame(_qrRAF); _qrRAF = null; }
    if (_qrStream) { _qrStream.getTracks().forEach(t => t.stop()); _qrStream = null; }
    const area = document.getElementById('sc-scan-area');
    if (area) area.style.display = 'none';
}
