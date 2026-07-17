/* ═══════════════════════════════════════════════════════════════════════════
   EventoPro — Ask AI (attendee event Q&A)
   Auto-generated FAQ chips from the event's details + a natural-language chat
   answered ONLY from the selected event's information.
   ═══════════════════════════════════════════════════════════════════════════ */
registerPage('event-qa', initEventQA);

let _qaEvents = [];
let _qaEventId = null;

async function initEventQA() {
    const c = document.getElementById('page-container');
    c.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
    try {
        _qaEvents = await api.get('/my-events');
    } catch (_) { _qaEvents = []; }

    if (!_qaEvents.length) {
        c.innerHTML = `
            <div class="card fade-in"><div class="card-body">
                <div class="empty-state">
                    <span class="material-icons-round">question_answer</span>
                    <h4>No events yet</h4>
                    <p>Register for an event to ask the AI assistant about it.</p>
                    <button class="btn btn-primary" style="margin-top:12px;" onclick="navigateTo('events')"><span class="material-icons-round">event</span> Browse Events</button>
                </div>
            </div></div>`;
        return;
    }
    _qaEventId = _qaEvents[0].id;
    renderQAPage();
    loadQAEvent(_qaEventId);
}

function renderQAPage() {
    const c = document.getElementById('page-container');
    c.innerHTML = `
        <div class="dashboard-header animate-fade-in stagger-1" style="margin-bottom:16px;">
            <h3 style="font-size:1.6rem;color:var(--text-primary);">
                <span class="material-icons-round" style="vertical-align:middle;color:var(--accent-primary);">smart_toy</span>
                Ask AI
            </h3>
            <p style="color:var(--text-muted);">Instant answers about your event — venue, timings, schedule, check-in and more.</p>
        </div>

        <div class="toolbar fade-in stagger-2" style="margin-bottom:16px;">
            ${eventSelectorHTML(_qaEvents, _qaEventId, 'selectQAEvent')}
        </div>

        <div class="card card-glow fade-in stagger-2" id="qa-event-card" style="margin-bottom:16px;"></div>

        <div class="card card-glow fade-in stagger-3">
            <div class="card-body">
                <p class="text-muted" style="font-size:0.82rem;margin-bottom:8px;">Suggested questions</p>
                <div id="qa-suggestions" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;"></div>
                <div id="qa-log" style="min-height:180px;max-height:46vh;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-bottom:8px;"></div>
                <form id="qa-form" style="display:flex;gap:10px;margin-top:12px;">
                    <input id="qa-input" class="form-input" placeholder="Ask anything about this event…" autocomplete="off" style="flex:1;">
                    <button class="btn btn-primary" type="submit"><span class="material-icons-round">send</span></button>
                </form>
            </div>
        </div>`;
    document.getElementById('qa-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = document.getElementById('qa-input').value.trim();
        if (v) askQA(v);
    });
}

function selectQAEvent(id) {
    _qaEventId = parseInt(id);
    const log = document.getElementById('qa-log');
    if (log) log.innerHTML = '';
    loadQAEvent(_qaEventId);
}

async function loadQAEvent(eventId) {
    const card = document.getElementById('qa-event-card');
    const sug = document.getElementById('qa-suggestions');
    if (card) card.innerHTML = `<div class="card-body"><div class="loading-state"><div class="spinner"></div></div></div>`;
    let info = null;
    try { info = await api.get(`/portal/event-qa/${eventId}`); } catch (e) {
        if (card) card.innerHTML = `<div class="card-body text-danger">${e.message || 'Could not load event.'}</div>`;
        return;
    }
    const ev = info.event;
    if (card) card.innerHTML = `
        <div class="card-body">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
                <div>
                    <h3 style="color:var(--text-primary);font-size:1.15rem;">${ev.title}</h3>
                    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;color:var(--text-secondary);font-size:0.86rem;">
                        <span><span class="material-icons-round" style="font-size:15px;vertical-align:middle;">event</span> ${formatDate(ev.event_date)}${ev.start_time ? ' · ' + ev.start_time : ''}</span>
                        <span><span class="material-icons-round" style="font-size:15px;vertical-align:middle;">place</span> ${ev.venue || 'Venue TBA'}</span>
                    </div>
                </div>
                ${info.maps_url ? `<a href="${info.maps_url}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm"><span class="material-icons-round">map</span> Google Maps</a>` : ''}
            </div>
        </div>`;
    if (sug) sug.innerHTML = (info.suggestions || []).map(q =>
        `<button class="chip qa-chip" onclick="askQA(this.textContent)">${q}</button>`).join('');

    // Reset the conversation with a friendly greeting scoped to this event.
    const log = document.getElementById('qa-log');
    if (log) { log.innerHTML = ''; qaBubble('assistant', `Hi! Ask me anything about <strong>${ev.title}</strong> — tap a suggestion above or type your question.`); }
}

function qaBubble(who, html) {
    const log = document.getElementById('qa-log');
    if (!log) return null;
    const mine = who === 'user';
    const div = document.createElement('div');
    div.style.cssText = `max-width:85%;padding:12px 14px;border-radius:14px;align-self:${mine ? 'flex-end' : 'flex-start'};` +
        (mine ? 'background:var(--accent-gradient);color:#fff;' : 'background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);');
    div.innerHTML = html;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
}

// Turn bare URLs (e.g. the Google Maps link) into clickable links.
function qaLinkify(text) {
    return String(text).replace(/(https?:\/\/[^\s]+)/g,
        '<a href="$1" target="_blank" rel="noopener" style="color:var(--ruby-bright);text-decoration:underline;">$1</a>');
}

async function askQA(question) {
    const input = document.getElementById('qa-input');
    if (input) input.value = '';
    qaBubble('user', question);
    const thinking = qaBubble('assistant', '<em style="color:var(--text-muted)">Thinking…</em>');
    try {
        const res = await api.post('/portal/event-qa', { event_id: _qaEventId, question });
        if (thinking) thinking.innerHTML = qaLinkify(res.answer || '…');
    } catch (err) {
        if (thinking) thinking.innerHTML = `<span class="text-danger">${err.message || 'Failed to get an answer'}</span>`;
    }
    const log = document.getElementById('qa-log');
    if (log) log.scrollTop = log.scrollHeight;
}
