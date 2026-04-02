const API = 'https://americanssupport.org/gads/api';
const token = localStorage.getItem('sessionToken');
const adminEmail = localStorage.getItem('adminEmail') || '';

/* ================= LOAD USERS ================= */
async function loadUserList() {
    showLoading(true);

    try {
        const response = await fetch(`${API}/auth/admin-list`, { headers: authH() });
        const data = await response.json();

        const users = data.final_user || [];
        const el = document.getElementById('usr-management-list');
        const empty = document.getElementById('empty');

        if (!users.length) {
            el.innerHTML = '';
            empty.style.display = 'block';
            showLoading(false);
            return;
        }

        empty.style.display = 'none';

        el.innerHTML = users.map((u, i) => `
            <div class="campaign-row" data-id="${u.id}">
                <div class="cell-num">${i + 1}</div>
                <div class="cell-name"><div class="name-main">${u.name}</div></div>
                <div class="cell-name"><div class="name-main">${u.email}</div></div>
                <div class="cell-name"><div class="name-main">${u.role}</div></div>

                <div>
                    <button class="action-btn edit-btn" onclick="openEdit('${u.id}','${u.name}','${u.email}','${u.role}')">Edit</button>
                    <button class="action-btn delete-btn" onclick="openDelete('${u.id}')">Delete</button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error(err);
    }

    showLoading(false);
}

/* ================= EDIT ================= */
function openEdit(id, name, email, role) {
    document.getElementById('editUserId').value = id;
    document.getElementById('editName').value = name;
    document.getElementById('editEmail').value = email;
    document.getElementById('editRole').value = role;

    document.getElementById('editModal').style.display = 'block';
}

document.getElementById('closeModal').onclick = () => {
    document.getElementById('editModal').style.display = 'none';
};

/* ================= EDIT ================= */
/* Load roles for Edit modal */
async function loadRolesForEdit() {
    try {
        const res = await fetch(`${API}/role/all-roles`, {
            headers: authH()
        });

        const data = await res.json();
        const roles = data.data || [];

        const dropdown = document.getElementById('editRole');

        dropdown.innerHTML = roles.map(role => `
            <option value="${role.role_slug}">${role.role_name}</option>
        `).join('');

    } catch (err) {
        console.error('Error loading roles:', err);
    }
}

function openEdit(id, name, email, role) {
    document.getElementById('editUserId').value = id;
    document.getElementById('editName').value = name;
    document.getElementById('editEmail').value = email;
    document.getElementById('editRole').value = role;
    // load roles dynamically
    loadRolesForEdit();
    document.getElementById('editModal').style.display = 'block';
}

document.getElementById('closeModal').onclick = () => {
    document.getElementById('editModal').style.display = 'none';
};

async function updateUser() {
    const id = document.getElementById('editUserId').value;
    const name = document.getElementById('editName').value;
    const email = document.getElementById('editEmail').value;
    const role = document.getElementById('editRole').value;
    const password = document.getElementById('editPassword').value;

    const bodyData = { name, email, role };

    // ✅ Only include password if provided
    if (password && password.trim() !== '') {
        bodyData.password = password;
    }

    try {
        await fetch(`${API}/auth/update-user/${id}`, {
            method: 'PUT',
            headers: {
                ...authH(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyData)
        });

        document.getElementById('editModal').style.display = 'none';

        // reset password field after update
        document.getElementById('editPassword').value = '';

        loadUserList();

    } catch (err) {
        console.error(err);
    }
}

/* ================= DELETE MODAL ================= */

function openDelete(id) {
    document.getElementById('deleteUserId').value = id;
    document.getElementById('deleteModal').style.display = 'block';
}

function closeDelete() {
    document.getElementById('deleteModal').style.display = 'none';
}

document.getElementById('closeDeleteModal').onclick = closeDelete;

/* ================= DELETE ================= */
async function confirmDelete() {
    const id = document.getElementById('deleteUserId').value;

    try {
        await fetch(`${API}/auth/delete-user/${id}`, {
            method: 'DELETE',
            headers: authH()
        });

        closeDelete();
        loadUserList();

    } catch (err) {
        console.error(err);
    }
}

/* ================= FETCH ROLES ================= */

async function loadRoles(selectedRole = null) {
    try {
        const res = await fetch(`${API}/auth/roles`, {
            headers: authH()
        });

        const data = await res.json();
        const roles = data.data || []; // adjust if API key differs

        const dropdown = document.getElementById('editRole');

        dropdown.innerHTML = roles.map(role => `
            <option value="${role.role_slug}" ${role.role_slug === selectedRole ? 'selected' : ''}>
                ${role.role_name}
            </option>
        `).join('');

    } catch (err) {
        console.error('Error loading roles:', err);
    }
}

/* ================= ADD USER ================= */

function openAddUser() {
    document.getElementById('addUserModal').style.display = 'block';

    // load roles dynamically
    loadRolesForAdd();
}

function closeAddUser() {
    document.getElementById('addUserModal').style.display = 'none';
}

document.getElementById('closeAddModal').onclick = closeAddUser;

/* Load roles for ADD modal */
async function loadRolesForAdd() {
    try {
        const res = await fetch(`${API}/role/all-roles`, {
            headers: authH()
        });

        const data = await res.json();
        const roles = data.data || [];

        const dropdown = document.getElementById('addRole');

        dropdown.innerHTML = roles.map(role => `
            <option value="${role.role_slug}">${role.role_name}</option>
        `).join('');

    } catch (err) {
        console.error('Error loading roles:', err);
    }
}

/* Create user */
async function createUser() {
    const name = document.getElementById('addName').value;
    const email = document.getElementById('addEmail').value;
    const password = document.getElementById('addPassword').value;
    const role = document.getElementById('addRole').value;

    if (!name || !email || !password) {
        alert('Name, Email and Password are required');
        return;
    }

    try {
        await fetch(`${API}/auth/create-user`, {
            method: 'POST',
            headers: {
                ...authH(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, password, role })
        });

        closeAddUser();

        // reset fields
        document.getElementById('addName').value = '';
        document.getElementById('addEmail').value = '';
        document.getElementById('addPassword').value = '';

        loadUserList();

    } catch (err) {
        console.error(err);
    }
}

// ── Auth guard──────────────────────────────────────────────────────────────
if (!token) {
    window.location.href = 'index.html';
} else {
    fetch(`${API}/logincheck/me`, { headers: { 'x-session-token': token } })
        .then(r => {
            if (!r.ok) { clearAndRedirect(); return; }
            document.body.classList.remove('auth-pending');
            setAdminUI();
            Promise.all([loadUserList()]);
        })
        .catch(() => {
            document.body.classList.remove('auth-pending');
            setAdminUI();
            Promise.all([loadUserList()]);
        });
}

const authH = () => ({ 'x-session-token': token });

function clearAndRedirect() {
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('adminEmail');
    window.location.href = 'index.html';
}

function setAdminUI() {
    const e = document.getElementById('admin-email');
    const a = document.getElementById('admin-avatar');
    if (e) e.textContent = adminEmail || '—';
    if (a) a.textContent = adminEmail ? adminEmail[0].toUpperCase() : '?';
}

// ── UI helpers────────────────────────────────────────────────────────────────
function showLoading(state) {
    const ld = document.getElementById('loading');
    const tb = document.getElementById('table-inner');
    if (ld) ld.style.display = state ? 'flex' : 'none';
    if (tb) tb.style.display = state ? 'none' : 'block';
}