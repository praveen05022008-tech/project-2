/* Commerce UI: attendee ticket purchase + organizer ticket management. */

const inrC = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');

// ── Attendee: buy tickets ──────────────────────────────────────────────────
async function openTicketPurchase(eventId, eventTitle) {
    let tiers = [];
    try { tiers = await api.get(`/commerce/ticket-types?event_id=${eventId}`); }
    catch (e) { showToast('Could not load tickets', 'error'); return; }

    if (!tiers.length) {
        openModal('Get Tickets', `<p class="text-muted">No tickets are on sale for "${eventTitle}" yet.</p>`);
        return;
    }

    const options = tiers.map((t, i) => `
        <label class="tier-option" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--border-color);border-radius:10px;margin-bottom:8px;cursor:pointer;">
            <span style="display:flex;align-items:center;gap:10px;">
                <input type="radio" name="tier" value="${t.id}" data-price="${t.price}" ${i === 0 ? 'checked' : ''} style="width:auto;">
                <span><strong style="color:var(--text-primary);">${t.name}</strong>
                <span style="display:block;font-size:0.8rem;color:var(--text-muted);">${t.description || ''} ${t.remaining !== null ? `· ${t.remaining} left` : ''}</span></span>
            </span>
            <strong>${inrC(t.price)}</strong>
        </label>`).join('');

    openModal(`Get Tickets · ${eventTitle}`, `
        <form id="buy-form">
            <div class="form-group"><label>Choose a ticket</label>${options}</div>
            <div class="form-group">
                <label for="buy-qty">Quantity</label>
                <input type="number" id="buy-qty" class="form-input" value="1" min="1" max="20">
            </div>
            <div class="ai-alert-card" style="margin:6px 0 14px;">
                <div style="display:flex;justify-content:space-between;">
                    <span>Total</span><strong id="buy-total" style="font-size:1.2rem;color:var(--text-primary);">${inrC(tiers[0].price)}</strong>
                </div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">Demo checkout — no real charge is made.</div>
            </div>
            <div class="modal-footer" style="padding:0;border:none;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary"><span class="material-icons-round">lock</span> Pay ${inrC(tiers[0].price)}</button>
            </div>
        </form>
    `);

    const recalc = () => {
        const price = parseFloat(document.querySelector('input[name="tier"]:checked').dataset.price);
        const qty = Math.max(1, parseInt(document.getElementById('buy-qty').value) || 1);
        const total = price * qty;
        document.getElementById('buy-total').textContent = inrC(total);
        document.querySelector('#buy-form button[type="submit"]').innerHTML =
            `<span class="material-icons-round">lock</span> Pay ${inrC(total)}`;
    };
    document.querySelectorAll('input[name="tier"]').forEach(r => r.addEventListener('change', recalc));
    document.getElementById('buy-qty').addEventListener('input', recalc);

    document.getElementById('buy-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const tierId = parseInt(document.querySelector('input[name="tier"]:checked').value);
        const qty = Math.max(1, parseInt(document.getElementById('buy-qty').value) || 1);
        try {
            const order = await api.post('/commerce/orders', { ticket_type_id: tierId, quantity: qty });
            const pay = order.payment || { provider: 'simulated' };

            if (pay.provider === 'razorpay' && pay.gateway_order_id && window.Razorpay) {
                // Real Razorpay checkout (test or live keys)
                const rzp = new Razorpay({
                    key: pay.key_id,
                    amount: pay.amount,
                    currency: pay.currency || 'INR',
                    name: 'EventoPro',
                    description: eventTitle,
                    order_id: pay.gateway_order_id,
                    prefill: { email: pay.buyer_email },
                    theme: { color: '#1A5FFF' },
                    handler: async (resp) => {
                        try {
                            const paid = await api.post(`/commerce/orders/${order.id}/verify`, {
                                razorpay_payment_id: resp.razorpay_payment_id,
                                razorpay_order_id: resp.razorpay_order_id,
                                razorpay_signature: resp.razorpay_signature,
                            });
                            showPurchaseSuccess(paid, eventTitle);
                        } catch (err) {
                            showToast(err.message || 'Payment verification failed', 'error');
                        }
                    },
                });
                rzp.on('payment.failed', (r) => showToast('Payment failed: ' + (r.error && r.error.description || ''), 'error'));
                rzp.open();
            } else {
                // Simulated gateway (no keys configured)
                const paid = await api.post(`/commerce/orders/${order.id}/pay`, {});
                showPurchaseSuccess(paid, eventTitle);
            }
        } catch (err) {
            showToast(err.message || 'Payment failed', 'error');
        }
    });
}

function showPurchaseSuccess(paid, eventTitle) {
    openModal('🎟️ Payment Successful', `
        <div style="text-align:center;padding:10px 0;">
            <span class="material-icons-round" style="font-size:56px;color:#1A5FFF;">check_circle</span>
            <h3 style="margin:12px 0;color:var(--text-primary);">You're in!</h3>
            <p class="text-muted">${paid.tickets.length} ticket(s) issued for ${eventTitle}.</p>
            <p style="margin-top:10px;">Ticket code: <code style="color:var(--accent-tertiary);">${paid.tickets[0]}</code></p>
            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:6px;">Payment ref: ${paid.payment_ref}</p>
            <button class="btn btn-primary" style="margin-top:16px;" onclick="closeModal(); if(window.currentUser && window.currentUser.role==='ATTENDEE'){navigateTo('dashboard');}">View my FastPass</button>
        </div>`);
    showToast('Ticket purchased!', 'success');
}

// ── Organizer/Admin: manage tiers + view orders/revenue ────────────────────
async function openTicketManage(eventId, eventTitle) {
    openModal(`Tickets · ${eventTitle}`, `<div id="tm-body"><div class="loading-state"><div class="spinner"></div></div></div>`);
    await refreshTicketManage(eventId, eventTitle);
}

async function refreshTicketManage(eventId, eventTitle) {
    const body = document.getElementById('tm-body');
    if (!body) return;
    let tiers = [], orders = [], rev = { ticket_revenue: 0, tickets_sold: 0 };
    try {
        [tiers, orders, rev] = await Promise.all([
            api.get(`/commerce/ticket-types?event_id=${eventId}`),
            api.get(`/commerce/orders?event_id=${eventId}`),
            api.get(`/commerce/revenue?event_id=${eventId}`),
        ]);
    } catch (e) { body.innerHTML = `<p class="text-danger">${e.message}</p>`; return; }

    body.innerHTML = `
        <div class="stats-grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px;">
            <div class="stat-card"><div class="stat-label">Ticket Revenue</div><div class="stat-value">${inrC(rev.ticket_revenue)}</div></div>
            <div class="stat-card"><div class="stat-label">Tickets Sold</div><div class="stat-value">${rev.tickets_sold}</div></div>
        </div>

        <h4 style="margin:8px 0;font-size:0.9rem;">Ticket Tiers</h4>
        <div class="table-wrapper"><table class="data-table"><thead><tr><th>Name</th><th>Price</th><th>Sold</th><th>Left</th><th></th></tr></thead>
        <tbody>${tiers.length ? tiers.map(t => `<tr>
            <td style="color:var(--text-primary);font-weight:600;">${t.name}</td>
            <td>${inrC(t.price)}</td><td>${t.quantity_sold}</td>
            <td>${t.remaining === null ? '∞' : t.remaining}</td>
            <td><button class="action-btn action-btn-delete" onclick="removeTier(${t.id}, ${eventId}, '${eventTitle.replace(/'/g,"\\'")}')"><span class="material-icons-round">delete</span></button></td>
        </tr>`).join('') : '<tr><td colspan="5" class="text-muted">No tiers yet.</td></tr>'}</tbody></table></div>

        <form id="tier-form" class="form-grid" style="margin-top:14px;">
            <div class="form-group"><label>Tier name</label><input id="tier-name" class="form-input" placeholder="e.g. General" required></div>
            <div class="form-group"><label>Price (₹)</label><input id="tier-price" type="number" class="form-input" min="0" value="0"></div>
            <div class="form-group"><label>Quantity (0 = unlimited)</label><input id="tier-qty" type="number" class="form-input" min="0" value="0"></div>
            <div class="form-group" style="align-self:end;"><button type="submit" class="btn btn-primary"><span class="material-icons-round">add</span> Add Tier</button></div>
        </form>

        <h4 style="margin:18px 0 8px;font-size:0.9rem;">Recent Orders (${orders.length})</h4>
        <div class="table-wrapper"><table class="data-table"><thead><tr><th>Buyer</th><th>Qty</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>${orders.length ? orders.slice(0, 20).map(o => `<tr>
            <td>${o.buyer_email}</td><td>${o.quantity}</td><td>${inrC(o.total_amount)}</td><td>${getStatusBadge(o.status === 'PAID' ? 'Confirmed' : 'Pending')}</td>
        </tr>`).join('') : '<tr><td colspan="4" class="text-muted">No orders yet.</td></tr>'}</tbody></table></div>
    `;

    document.getElementById('tier-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api.post('/commerce/ticket-types', {
                event_id: eventId,
                name: document.getElementById('tier-name').value.trim(),
                price: parseFloat(document.getElementById('tier-price').value) || 0,
                quantity_total: parseInt(document.getElementById('tier-qty').value) || 0,
            });
            showToast('Tier added', 'success');
            refreshTicketManage(eventId, eventTitle);
        } catch (err) { showToast(err.message || 'Failed', 'error'); }
    });
}

async function removeTier(tierId, eventId, eventTitle) {
    try {
        await api.delete(`/commerce/ticket-types/${tierId}`);
        showToast('Tier removed', 'info');
        refreshTicketManage(eventId, eventTitle);
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
}
