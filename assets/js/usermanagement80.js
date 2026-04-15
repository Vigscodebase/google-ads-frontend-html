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
                    <button class="action-btn edit-btn" onclick="openEdit('${u.id}')">Edit</button>
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

// async function openEdit(id) {
//     try {
//         const res = await fetch(`${API}/auth/single-user/${id}`, {
//             method: 'GET',
//             headers: authH()
//         });

//         const data = await res.json();
//         const user = data.data;

//         document.getElementById('editUserId').value = id;
//         document.getElementById('editName').value = user.fullname;
//         document.getElementById('editEmail').value = user.email;

//         await loadRolesForEdit();

//         document.getElementById('editRole').value = user.role;
//         document.getElementById('editModal').style.display = 'block';

//     } catch (err) {
//         console.error('Error:', err);
//     }

// }

async function openEdit(id) {
    try {
        // ✅ Fetch user details
        const res = await fetch(`${API}/auth/single-user/${id}`, {
            method: 'GET',
            headers: authH()
        });

        const data = await res.json();
        const user = data.data;

        document.getElementById('editUserId').value = id;
        document.getElementById('editName').value = user.fullname;
        document.getElementById('editEmail').value = user.email;

        await loadRolesForEdit();
        document.getElementById('editRole').value = user.role;

        // ✅ Fetch OAuth checkbox data
        const checkbox_res = await fetch(`${API}/auth/oauth/list/${id}`, {
            method: 'GET',
            headers: authH()
        });

        const checkbox_data = await checkbox_res.json();

        const container = document.getElementById('oauthCheckboxList');
        container.innerHTML = '';

        // ✅ Loop users
        for (const userId of checkbox_data.allUserIds) {

            // get name
            const oauthuser_res = await fetch(`${API}/auth/get-oauth-name?userId=${userId}`, {
                method: 'GET',
                headers: authH()
            });

            const oauthuser_data = await oauthuser_res.json();

            const div = document.createElement('div');
            div.className = 'checkbox-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = userId;
            checkbox.className = "account-access"

            // ✅ FIXED
            if (checkbox_data.selectedUserIds.includes(userId)) {
                checkbox.checked = true;
            }

            // ✅ TOGGLE (REAL-TIME DB UPDATE)
            checkbox.addEventListener('change', async (e) => {

                if (e.target.checked) {

                    await fetch(`${API}/auth/oauth/add`, {
                        method: 'POST',
                        headers: {
                            ...authH(),
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            userId,
                            adminId: id   // ✅ FIXED
                        })
                    });

                } else {

                    await fetch(`${API}/auth/oauth/remove`, {
                        method: 'POST',
                        headers: {
                            ...authH(),
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            userId,
                            adminId: id   // ✅ FIXED
                        })
                    });
                }
            });

            const label = document.createElement('label');
            label.innerText = oauthuser_data.data.googleName;
            label.className = "accountacces-label"

            div.appendChild(checkbox);
            div.appendChild(label);

            container.appendChild(div);
        }

        // ✅ Open modal AFTER everything is ready
        document.getElementById('editModal').style.display = 'block';

    } catch (err) {
        console.error('Error:', err);
    }
}

document.getElementById('closeModal').onclick = () => {
    document.getElementById('editModal').style.display = 'none';
};

document.getElementById('closeModal').onclick = () => {
    document.getElementById('editModal').style.display = 'none';
};

async function updateUser() {
    const usr_ID = document.getElementById('editUserId').value;
    const name = document.getElementById('editName').value;
    const email = document.getElementById('editEmail').value;
    const role = document.getElementById('editRole').value;
    const password = document.getElementById('editPassword').value;

    // ✅ collect selected checkboxes
    const checkedBoxes = document.querySelectorAll('#oauthCheckboxList input:checked');
    const accessUserIds = Array.from(checkedBoxes).map(cb => cb.value);

    const bodyData = { name, email, role, accessUserIds };

    if (password && password.trim() !== '') {
        bodyData.password = password;
    }

    try {
        await fetch(`${API}/auth/update-single-user/${usr_ID}`, {
            method: 'PATCH',
            headers: {
                ...authH(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyData)
        });

        document.getElementById('editModal').style.display = 'none';
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

async function loadOauthCheckboxes() {
    try {
        const res = await fetch(`${API}/oauth/list`, {
            headers: authH()
        });

        const data = await res.json();

        const allIds = data.allUserIds || [];
        const selectedIds = data.selectedUserIds || [];

        const container = document.getElementById('oauthCheckboxList');

        if (!allIds.length) {
            container.innerHTML = `<div>No OAuth users found</div>`;
            return;
        }

        container.innerHTML = allIds.map(id => `
            <label class="checkbox-item">
                <input type="checkbox account-access" value="${id}" 
                    ${selectedIds.includes(id) ? 'checked' : ''}>
                ${id}
            </label>
        `).join('');

    } catch (err) {
        console.error('OAuth load error:', err);
    }
}

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

const currentPage = window.location.pathname.split("/").pop();
// ── Auth guard ──────────────────────────────────────────────────────────────
if (!token) {
    window.location.href = 'index.html';
} else {

    let decoded;

    try {
        decoded = jwtDecode(token);
    } catch (e) {
        window.location.href = 'index.html';
    }

    if (decoded && decoded.role !== 'super_admin') {
        if (currentPage === "usermanagement.html") {
            window.location.href = "dashboard.html";
        }
        document.body.classList.remove('auth-pending');
        document.getElementById("usr-management").style.display = "none";
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
    } else {
        // window.location.href = 'accountmanagement.html';
        // if (currentPage === "usermanagement.html") {
        //     // window.location.href = 'dashboard.html';
        //     document.getElementById("usr-management").style.display = "block";
        // }
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
document.getElementById('btn-logout').addEventListener('click', async () => {
    try { await fetch(`${API}/logincheck/logout`, { method: 'POST', headers: { 'x-session-token': token } }); } catch { }
    clearAndRedirect();
});
// ── UI helpers────────────────────────────────────────────────────────────────
function showLoading(state) {
    const ld = document.getElementById('loading');
    const tb = document.getElementById('table-inner');
    if (ld) ld.style.display = state ? 'flex' : 'none';
    if (tb) tb.style.display = state ? 'none' : 'block';
}

document.addEventListener("DOMContentLoaded", function () {
    // const toggle = document.getElementById("googleAdsToggle");
    const newsbreaktoggle = document.getElementById("newsBreakToggle");
    // const dropdown = toggle.parentElement;
    const newsbreakdropdown = newsbreaktoggle.parentElement;

    // toggle.addEventListener("click", function () {
    //     dropdown.classList.toggle("open");
    // });

    newsbreaktoggle.addEventListener("click", function () {
        newsbreakdropdown.classList.toggle("open");
    });
});