registerPage('copilot', initCopilot);

// Conversation memory so the Copilot remembers details across messages.
let copilotHistory = [];

const COPILOT_SUGGESTIONS_MANAGER = [
    'Show my event stats',
    'How much ticket revenue so far?',
    'Create a Corporate event "Annual Meet" for client Acme on 2026-12-01, budget 500000',
    'Write a short marketing post for my next event',
];

const COPILOT_SUGGESTIONS_SPONSOR = [
    'If I sponsor ₹5,00,000, how much profit will I get?',
    'How much should I sponsor?',
    'What ROI can I expect for ₹2,00,000?',
    'Which event gives the best sponsorship value?',
];

function isSponsorCopilot() {
    return (window.currentUser || {}).role === 'SPONSOR';
}
function copilotSuggestions() {
    return isSponsorCopilot() ? COPILOT_SUGGESTIONS_SPONSOR : COPILOT_SUGGESTIONS_MANAGER;
}

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
                <p style="color:var(--text-muted);">${isSponsorCopilot() ? 'Ask sponsorship questions — projected ROI, leads, and how much to invest.' : 'Ask in plain English — create events, check stats/revenue, draft marketing copy.'}</p>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="newCopilotChat()"><span class="material-icons-round">add</span> New chat</button>
        </div>
        <div class="card card-glow fade-in stagger-2">
            <div class="card-body">
                <div id="copilot-log" style="min-height:280px;max-height:52vh;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-bottom:8px;"></div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;" id="copilot-suggestions">
                    ${copilotSuggestions().map(s => `<button class="chip" onclick="copilotAsk(this.textContent)" style="background:var(--bg-tertiary);border:1px solid var(--border-color);color:var(--text-secondary);padding:6px 12px;border-radius:20px;font-size:0.8rem;">${s}</button>`).join('')}
                </div>
                <form id="copilot-form" style="display:flex;gap:10px;">
                    <input id="copilot-input" class="form-input" placeholder="${isSponsorCopilot() ? 'e.g. if I sponsor ₹3,00,000 how much profit?' : 'e.g. create a wedding for client Sharma on 2026-11-20'}" autocomplete="off" style="flex:1;">
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
    } else if (isSponsorCopilot()) {
        copilotBubble('assistant', "Hi! I'm your Sponsorship Copilot. Ask me things like “if I sponsor ₹5,00,000, how much profit?” or “how much should I sponsor?” and I'll project reach, leads and ROI.");
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
    const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
    // Sponsor: ROI projection
    if (result.kind === 'roi') {
        if (result.error) return '';
        const pos = result.profit >= 0;
        return `<div style="margin-top:10px;border-top:1px solid var(--border-color);padding-top:10px;font-size:0.85rem;">
            <div style="color:var(--text-muted);margin-bottom:6px;">Projection for <strong style="color:var(--text-primary);">${result.event}</strong> · spend ${inr(result.amount)}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div>👁️ Impressions: <strong>${result.impressions.toLocaleString('en-IN')}</strong></div>
                <div>🎯 Est. leads: <strong>${result.leads.toLocaleString('en-IN')}</strong></div>
                <div>🧮 Cost / lead: <strong>${inr(result.cost_per_lead)}</strong></div>
                <div>💵 Est. return: <strong>${inr(result.estimated_return)}</strong></div>
                <div>📈 Est. profit: <strong style="color:${pos ? '#1A5FFF' : '#E4007C'};">${inr(result.profit)}</strong></div>
                <div>🚀 ROI: <strong style="color:${result.roi_multiple >= 1 ? '#1A5FFF' : '#FF2D95'};">${result.roi_multiple}×</strong></div>
            </div>
            <div style="color:var(--text-muted);font-size:0.72rem;margin-top:8px;">Illustrative estimate based on expected attendance & spend share.</div>
        </div>`;
    }
    // Sponsor: recommended amount + tiers
    if (result.kind === 'suggest') {
        if (result.error) return '';
        return `<div style="margin-top:10px;border-top:1px solid var(--border-color);padding-top:10px;font-size:0.85rem;">
            <div style="color:var(--text-muted);margin-bottom:8px;">For <strong style="color:var(--text-primary);">${result.event}</strong> (${(result.attendance || 0).toLocaleString('en-IN')} expected) — recommended <strong>${inr(result.recommended)}</strong>.</div>
            ${result.tiers.map(t => `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border-color);">
                <span><strong>${t.name}</strong> · <span style="color:var(--text-muted);">${t.perks}</span></span>
                <strong>${inr(t.amount)}</strong></div>`).join('')}
        </div>`;
    }
    if (result.total_events !== undefined) {
        return `<div style="margin-top:8px;font-size:0.85rem;color:var(--text-secondary);">
            📊 Events: <strong>${result.total_events}</strong> · Upcoming: <strong>${result.upcoming}</strong> · Completed: <strong>${result.completed}</strong> · Budget: <strong>₹${Math.round(result.total_budget).toLocaleString('en-IN')}</strong></div>`;
    }
    if (result.ticket_revenue !== undefined) {
        return `<div style="margin-top:8px;font-size:0.95rem;">💰 Ticket revenue: <strong>₹${Math.round(result.ticket_revenue).toLocaleString('en-IN')}</strong></div>`;
    }
    if (result.event_id) {
        return `<div style="margin-top:8px;font-size:0.85rem;color:#1A5FFF;">✅ Created event #${result.event_id}: <strong>${result.title}</strong></div>`;
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
