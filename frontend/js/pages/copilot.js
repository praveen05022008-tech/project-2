registerPage('copilot', initCopilot);

// Conversation memory so the Copilot remembers details across messages.
let copilotHistory = [];

const COPILOT_SUGGESTIONS = [
    'Show my event stats',
    'How much ticket revenue so far?',
    'Create a Corporate event "Annual Meet" for client Acme on 2026-12-01, budget 500000',
    'Write a short marketing post for my next event',
];

async function initCopilot() {
    copilotHistory = [];
    const c = document.getElementById('page-container');
    c.innerHTML = `
        <div class="dashboard-header animate-fade-in stagger-1" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
            <div>
                <h3 style="font-size:1.6rem;color:var(--text-primary);">
                    <span class="material-icons-round" style="vertical-align:middle;color:var(--accent-primary);">auto_awesome</span>
                    AI Copilot
                </h3>
                <p style="color:var(--text-muted);">Ask in plain English — create events, check stats/revenue, draft marketing copy.</p>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="newCopilotChat()"><span class="material-icons-round">add</span> New chat</button>
        </div>
        <div class="card card-glow fade-in stagger-2">
            <div class="card-body">
                <div id="copilot-log" style="min-height:280px;max-height:52vh;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-bottom:8px;"></div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;" id="copilot-suggestions">
                    ${COPILOT_SUGGESTIONS.map(s => `<button class="chip" onclick="copilotAsk(this.textContent)" style="background:var(--bg-tertiary);border:1px solid var(--border-color);color:var(--text-secondary);padding:6px 12px;border-radius:20px;font-size:0.8rem;">${s}</button>`).join('')}
                </div>
                <form id="copilot-form" style="display:flex;gap:10px;">
                    <input id="copilot-input" class="form-input" placeholder="e.g. create a wedding for client Sharma on 2026-11-20" autocomplete="off" style="flex:1;">
                    <button class="btn btn-primary" type="submit"><span class="material-icons-round">send</span></button>
                </form>
            </div>
        </div>`;
    document.getElementById('copilot-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = document.getElementById('copilot-input').value.trim();
        if (v) copilotAsk(v);
    });

    // Load saved conversation (ChatGPT-style continuity).
    let past = [];
    try { past = await api.get('/copilot/history'); } catch (_) { past = []; }
    if (past.length) {
        past.forEach(m => {
            copilotBubble(m.role === 'assistant' ? 'assistant' : 'user', m.content);
            copilotHistory.push({ role: m.role, content: m.content });
        });
    } else {
        copilotBubble('assistant', "Hi! I'm your Copilot. Try: “show my stats”, “how much revenue?”, or “create a Corporate event for client Acme on 2026-12-01”.");
    }
}

async function newCopilotChat() {
    try { await api.delete('/copilot/history'); } catch (_) { /* ignore */ }
    copilotHistory = [];
    const log = document.getElementById('copilot-log');
    if (log) log.innerHTML = '';
    copilotBubble('assistant', "New chat started. What would you like to do?");
    showToast('Started a new chat', 'info');
}

function copilotBubble(who, html) {
    const log = document.getElementById('copilot-log');
    if (!log) return;
    const mine = who === 'user';
    const div = document.createElement('div');
    div.style.cssText = `max-width:85%;padding:12px 14px;border-radius:14px;align-self:${mine ? 'flex-end' : 'flex-start'};` +
        (mine ? 'background:var(--accent-gradient);color:#fff;' : 'background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);');
    div.innerHTML = html;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
}

function renderCopilotResult(result) {
    if (!result) return '';
    if (result.total_events !== undefined) {
        return `<div style="margin-top:8px;font-size:0.85rem;color:var(--text-secondary);">
            📊 Events: <strong>${result.total_events}</strong> · Upcoming: <strong>${result.upcoming}</strong> · Completed: <strong>${result.completed}</strong> · Budget: <strong>₹${Math.round(result.total_budget).toLocaleString('en-IN')}</strong></div>`;
    }
    if (result.ticket_revenue !== undefined) {
        return `<div style="margin-top:8px;font-size:0.95rem;">💰 Ticket revenue: <strong>₹${Math.round(result.ticket_revenue).toLocaleString('en-IN')}</strong></div>`;
    }
    if (result.event_id) {
        return `<div style="margin-top:8px;font-size:0.85rem;color:#43e97b;">✅ Created event #${result.event_id}: <strong>${result.title}</strong></div>`;
    }
    return '';
}

async function copilotAsk(message) {
    const input = document.getElementById('copilot-input');
    if (input) input.value = '';
    copilotBubble('user', message);
    const thinking = copilotBubble('assistant', '<em style="color:var(--text-muted)">Thinking…</em>');
    try {
        const res = await api.post('/copilot', { message, history: copilotHistory.slice(-10) });
        thinking.innerHTML = (res.reply || '…') + renderCopilotResult(res.result);
        // Record the turn so the Copilot remembers context on the next message.
        copilotHistory.push({ role: 'user', content: message });
        copilotHistory.push({ role: 'assistant', content: res.reply || '' });
        if (copilotHistory.length > 20) copilotHistory = copilotHistory.slice(-20);
        // Refresh relevant page data if an event was created
        if (res.action === 'create_event' && res.result && res.result.event_id) {
            showToast('Event created by Copilot', 'success');
        }
    } catch (err) {
        thinking.innerHTML = `<span class="text-danger">${err.message || 'Copilot failed'}</span>`;
    }
    const log = document.getElementById('copilot-log');
    if (log) log.scrollTop = log.scrollHeight;
}
