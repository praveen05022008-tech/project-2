registerPage('users', initUsers);

const USER_ROLES = ['SUPER_ADMIN', 'ORGANIZER', 'STAFF', 'VENDOR', 'SPONSOR', 'ATTENDEE'];

async function initUsers() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="toolbar fade-in stagger-1">
            <div class="search-box">
                <span class="material-icons-round">search</span>
                <input type="text" id="user-search" placeholder="Search users...">
            </div>
            <select class="filter-select" id="user-role-filter">
                <option value="">All roles</option>
                ${USER_ROLES.map(r => `<option value="${r}">${r}</option>`).join('')}
            </select>
            <div class="toolbar-spacer"></div>
            <button class="btn btn-secondary" onclick="downloadBackup()"><span class="material-icons-round">backup</span> Backup</button>
            <button class="btn btn-secondary" onclick="exportUsersCSV()"><span class="material-icons-round">download</span> Export</button>
            <button class="btn btn-primary" onclick="openUserForm()"><span class="material-icons-round">person_add</span> New User</button>
        </div>
        <div class="card fade-in stagger-2"><div class="card-body" id="users-table"><div class="loading-state"><div class="spinner"></div></div></div></div>
    `;
    document.getElementById('user-search').addEventListener('input', debounce(loadUsers, 400));
    document.getElementById('user-role-filter').addEventListener('change', loadUsers);
    await loadUsers();
}

async function loadUsers() {
    const el = document.getElementById('users-table');
    const search = document.getElementById('user-search')?.value || '';
    const role = document.getElementById('user-role-filter')?.value || '';
    let q = '/users?';
    if (search) q += `search=${encodeURIComponent(search)}&`;
    if (role) q += `role=${encodeURIComponent(role)}&`;
    try {
        const users = await api.get(q);
        el.innerHTML = `
            <div class="table-wrapper"><table class="data-table">
                <thead><tr><th>ID</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>${users.map(u => `
                    <tr>
                        <td>${u.id}</td>
                        <td style="color:var(--text-primary);font-weight:600;">${u.email}</td>
                        <td><span class="badge badge-upcoming">${u.role}</span></td>
                        <td>${u.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Disabled</span>'}</td>
                        <td><div class="action-btns">
                            <button class="action-btn action-btn-edit" title="Edit" onclick='openUserForm(${JSON.stringify(u)})'><span class="material-icons-round">edit</span></button>
                            <button class="action-btn action-btn-delete" title="Delete" onclick="confirmDeleteUser(${u.id}, '${u.email.replace(/'/g,"\\'")}')"><span class="material-icons-round">delete</span></button>
                        </div></td>
                    </tr>`).join('')}</tbody>
            </table></div>`;
    } catch (err) {
        el.innerHTML = `<div class="empty-state"><span class="material-icons-round">cloud_off</span><h4>Failed to load users</h4><p>${err.message}</p></div>`;
    }
}

async function downloadBackup() {
    showToast('Preparing backup…', 'info');
    try {
        const data = await api.get('/admin/backup');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
        a.href = url;
        a.download = `eventpro-backup-${stamp}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        const total = Object.values(data.counts || {}).reduce((s, n) => s + n, 0);
        showToast(`Backup downloaded (${total} rows)`, 'success');
    } catch (err) { showToast(err.message || 'Backup failed', 'error'); }
}

async function exportUsersCSV() {
    try {
        const users = await api.get('/users');
        exportCSV('users.csv', ['ID', 'Email', 'Role', 'Active', 'Created'],
            users.map(u => [u.id, u.email, u.role, u.is_active, u.created_at]));
    } catch (err) { showToast('Export failed', 'error'); }
}

function openUserForm(user) {
    const isEdit = !!(user && user.id);
    openModal(isEdit ? 'Edit User' : 'Create User', `
        <form id="user-form" class="form-grid">
            <div class="form-group full-width">
                <label>Email</label>
                <input id="uf-email" type="email" class="form-input" value="${isEdit ? user.email : ''}" ${isEdit ? 'disabled' : ''} required>
            </div>
            <div class="form-group">
                <label>Role</label>
                <select id="uf-role" class="form-select">
                    ${USER_ROLES.map(r => `<option value="${r}" ${isEdit && user.role === r ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>${isEdit ? 'New Password (optional)' : 'Password'}</label>
                <input id="uf-pass" type="password" class="form-input" placeholder="${isEdit ? 'Leave blank to keep' : 'min 6 chars'}" ${isEdit ? '' : 'required'}>
            </div>
            ${isEdit ? `<div class="form-group full-width"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="uf-active" style="width:auto;" ${user.is_active ? 'checked' : ''}> Account active</label></div>` : ''}
            <div class="form-group full-width"><div class="modal-footer" style="padding:0;border:none;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary"><span class="material-icons-round">save</span> ${isEdit ? 'Save' : 'Create'}</button>
            </div></div>
        </form>
    `);

    document.getElementById('user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            if (isEdit) {
                const body = { role: document.getElementById('uf-role').value, is_active: document.getElementById('uf-active').checked };
                const pass = document.getElementById('uf-pass').value;
                if (pass) body.password = pass;
                await api.put(`/users/${user.id}`, body);
                showToast('User updated', 'success');
            } else {
                await api.post('/users', {
                    email: document.getElementById('uf-email').value.trim(),
                    password: document.getElementById('uf-pass').value,
                    role: document.getElementById('uf-role').value,
                });
                showToast('User created', 'success');
            }
            closeModal();
            loadUsers();
        } catch (err) { showToast(err.message || 'Failed to save user', 'error'); }
    });
}

function confirmDeleteUser(id, email) {
    openModal('Delete User', `
        <div class="confirm-dialog">
            <span class="material-icons-round">warning</span>
            <h4>Delete ${email}?</h4>
            <p>This permanently removes the account. This cannot be undone.</p>
            <div class="confirm-actions">
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn btn-danger" onclick="deleteUser(${id})"><span class="material-icons-round">delete_forever</span> Delete</button>
            </div>
        </div>`);
}

async function deleteUser(id) {
    try { await api.delete(`/users/${id}`); showToast('User deleted', 'success'); closeModal(); loadUsers(); }
    catch (err) { showToast(err.message || 'Failed to delete', 'error'); }
}
