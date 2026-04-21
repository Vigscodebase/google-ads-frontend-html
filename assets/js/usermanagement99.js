const API = 'https://americanssupport.org/gads/api';
const token = localStorage.getItem('sessionToken');
const adminEmail = localStorage.getItem('adminEmail') || '';

/* ================= LOAD USERS ================= */
async function loadUserList() {
    showLoading(true);

    try {
        const response = await fetch(`${API}/auth/admin-list`, {
            headers: authH()
        });

        if (!response.ok) {
            throw new Error("API failed");
        }

        const data = await response.json();

        // console.log("API RESPONSE:", data); // ✅ debug

        // ✅ FIX: correct key
        const users = data.admins || data.final_user || [];

        const el = document.getElementById('usr-management-list');
        const empty = document.getElementById('empty');
        const table = document.getElementById('table-inner');

        if (!users.length) {
            el.innerHTML = '';
            empty.style.display = 'block';
            table.style.display = 'block'; // ✅ show table area
            showLoading(false);
            return;
        }

        empty.style.display = 'none';

        el.innerHTML = users.map((u, i) => `
            <div class="campaign-row" data-id="${u.id}">
                <div class="cell-num">${i + 1}</div>
                <div class="cell-name"><div class="name-main">${u.name || u.fullname || '-'}</div></div>
                <div class="cell-name"><div class="name-main">${u.email || '-'}</div></div>
                <div class="cell-name"><div class="name-main">${u.role || '-'}</div></div>

                <div>
                    <button class="action-btn edit-btn" onclick="openEdit('${u._id}')">Edit</button>
                    <button class="action-btn delete-btn" onclick="openDelete('${u._id}')">Delete</button>
                </div>
            </div>
        `).join('');

        table.style.display = 'block'; // ✅ IMPORTANT

    } catch (err) {
        console.error("LOAD USER ERROR:", err);
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

let GLOBAL_ACCOUNTS = null; // cache

async function openEdit(id) {
    try {
        // ✅ Load user basic info
        const res = await fetch(`${API}/auth/single-user/${id}`, {
            headers: authH()
        });
        const data = await res.json();
        const user = data.data;
        let GLOBAL_CUSTOMERS_MAP = {}; // cache customers per account

        document.getElementById('editUserId').value = id;
        document.getElementById('editName').value = user.fullname;
        document.getElementById('editEmail').value = user.email;

        await loadRolesForEdit();
        document.getElementById('editRole').value = user.role;

        /* ===============================
           ✅ LOAD ALL ACCOUNTS (ONLY ONCE)
        =============================== */
        if (!GLOBAL_ACCOUNTS) {
            const matrixRes = await fetch(`${API}/auth/access-matrix`, {
                headers: authH()
            });

            const matrixData = await matrixRes.json();
            GLOBAL_ACCOUNTS = matrixData.oauthUsers; // ✅ ALL accounts
        }

        /* ===============================
           ✅ GET CURRENT ADMIN ACCESS
        =============================== */
        const adminRes = await fetch(`${API}/auth/single-user/${id}`, {
            headers: authH()
        });
        const adminData = await adminRes.json();
        const selectedIds = adminData.data.accessUserIds || [];

        /* ===============================
           ✅ RENDER CHECKBOXES
        =============================== */
        const container = document.getElementById('oauthCheckboxList');
        container.innerHTML = '';

        for (const account of GLOBAL_ACCOUNTS) {

            const accountWrapper = document.createElement('div');
            accountWrapper.className = "oauth-account-block";

            /* =========================
               ✅ PARENT
            ========================= */
            const parentRow = document.createElement('div');
            parentRow.className = "parent-account";

            const parentCheckbox = document.createElement('input');
            parentCheckbox.type = "checkbox";
            parentCheckbox.className = "parent-checkbox";
            parentCheckbox.value = account.userId;

            const isParentChecked = selectedIds.includes(account.userId);
            parentCheckbox.checked = isParentChecked;

            const parentLabel = document.createElement('label');
            parentLabel.innerHTML = `
        <b>${account.googleName || "Unknown"}</b>
        <span style="color:#777">(${account.googleEmail || "-"})</span>
    `;
            parentLabel.className = "parent-label";

            parentRow.appendChild(parentCheckbox);
            parentRow.appendChild(parentLabel);

            /* =========================
               ✅ CHILDREN (CUSTOMERS)
            ========================= */
            const customerContainer = document.createElement('div');
            customerContainer.className = "customer-list";

            // fetch customers once
            if (!GLOBAL_CUSTOMERS_MAP[account.userId]) {
                const custRes = await fetch(`${API}/auth/customers-lite?userId=${account.userId}`, {
                    headers: authH()
                });
                const custData = await custRes.json();
                GLOBAL_CUSTOMERS_MAP[account.userId] = custData.customers || [];
            }

            const customers = GLOBAL_CUSTOMERS_MAP[account.userId];

            customers.forEach(c => {
                const row = document.createElement('div');

                const cb = document.createElement('input');
                cb.type = "checkbox";
                cb.className = "child-checkbox";
                cb.value = c.id;

                cb.addEventListener("change", async (e) => {
                    const checked = e.target.checked;

                    try {
                        await fetch(`${API}/auth/oauth/toggle-access`, {
                            method: "POST",
                            headers: {
                                ...authH(),
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                adminId: id,
                                userId: c.id,   // 👈 IMPORTANT (child customer id)
                                enable: checked
                            })
                        });

                    } catch (err) {
                        console.error("Child toggle failed", err);
                    }

                    /* =========================
                       OPTIONAL: SYNC PARENT
                    ========================= */

                    const allChildren = customerContainer.querySelectorAll(".child-checkbox");
                    const checkedChildren = customerContainer.querySelectorAll(".child-checkbox:checked");

                    // if ANY child checked → parent checked
                    parentCheckbox.checked = checkedChildren.length > 0;
                });

                // ✅ checked if saved
                cb.checked = selectedIds.includes(c.id);

                // ✅ disabled if parent unchecked
                cb.disabled = !isParentChecked;

                const label = document.createElement('label');

                // ✅ SHOW NAME + ID
                label.innerText = `${c.name || 'Customer'} (${c.id})`;
                label.className = "child-label";

                row.appendChild(cb);
                row.appendChild(label);

                customerContainer.appendChild(row);
            });

            /* =========================
               ✅ TOGGLE LOGIC
            ========================= */
            parentCheckbox.addEventListener("change", (e) => {
                const enabled = e.target.checked;

                customerContainer
                    .querySelectorAll("input[type='checkbox']")
                    .forEach(cb => {
                        cb.disabled = !enabled;

                        // OPTIONAL: uncheck when disabling
                        if (!enabled) cb.checked = false;
                    });

                // backend sync
                fetch(`${API}/auth/oauth/toggle-access`, {
                    method: "POST",
                    headers: {
                        ...authH(),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        adminId: id,
                        userId: account.userId,
                        enable: enabled
                    })
                });
            });

            accountWrapper.appendChild(parentRow);
            accountWrapper.appendChild(customerContainer);

            container.appendChild(accountWrapper);
        }

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
                <input type="checkbox" class="account-access" value="${id}" 
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
        if (currentPage === "accountaccess.html") {
            window.location.href = "dashboard.html";
        }

        if (currentPage === "usermanagement.html") {
            window.location.href = "dashboard.html";
        }

        document.body.classList.remove('auth-pending');
        document.getElementById("usr-management").style.display = "none";
        //document.getElementById("account-access").style.display = "none";
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
        if (currentPage === "usermanagement.html") {
            // window.location.href = 'dashboard.html';
            document.getElementById("usr-management").style.display = "block";
            //document.getElementById("account-access").style.display = "block";
        }

        if (currentPage === "accountaccess.html") {
            // window.location.href = 'dashboard.html';
            document.getElementById("usr-management").style.display = "block";
            //document.getElementById("account-access").style.display = "block";
        }
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