const API = 'https://americanssupport.org/gads/api';
const token = localStorage.getItem('sessionToken');
const adminEmail = localStorage.getItem('adminEmail') || '';

/* ══════════════════════════════════════════════
   SESSION EXPIRY — global handler
   Called whenever any API returns 401 or a session-expired signal.
   Hides all page content and redirects to login.
   ══════════════════════════════════════════════ */
function handleSessionExpiry() {
    // Clear stored credentials
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('adminEmail');

    // Hide entire page content so nothing is visible while redirecting
    const main   = document.querySelector('.main');
    const layout = document.querySelector('.layout');
    if (main)   main.style.display   = 'none';
    if (layout) layout.style.display = 'none';

    // Close any open modals
    ['editModal', 'deleteModal', 'addUserModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Show a brief toast then redirect
    const toast = document.createElement('div');
    toast.style.cssText = [
        'position:fixed', 'inset:0', 'display:flex', 'align-items:center',
        'justify-content:center', 'background:rgba(0,0,0,0.6)',
        'z-index:9999', 'color:#fff', 'font-size:16px', 'font-weight:600',
        'font-family:sans-serif', 'flex-direction:column', 'gap:10px'
    ].join(';');
    toast.innerHTML = `
        <div style="background:#1e293b;border-radius:12px;padding:28px 36px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,0.4);">
            <div style="font-size:28px;margin-bottom:10px;">🔒</div>
            <div>Session expired</div>
            <div style="font-size:13px;color:#94a3b8;margin-top:6px;">Redirecting to login…</div>
        </div>`;
    document.body.appendChild(toast);
    setTimeout(() => { window.location.href = 'index.html'; }, 1800);
}

/**
 * A wrapper around fetch() that auto-handles 401 / session-expired responses.
 * Use everywhere instead of raw fetch().
 */
async function secureFetch(url, options = {}) {
    const res = await fetch(url, options);
    if (res.status === 401) {
        handleSessionExpiry();
        // Return a dummy object so callers don't crash on await res.json()
        return { ok: false, status: 401, json: async () => ({}) };
    }
    // Also check JSON body for session-expired signals (some backends return 200 with an error key)
    if (!res.ok) {
        try {
            const clone = res.clone();
            const body  = await clone.json();
            const msg   = (body?.message || body?.error || '').toLowerCase();
            if (msg.includes('session') && (msg.includes('expire') || msg.includes('invalid'))) {
                handleSessionExpiry();
                return { ok: false, status: res.status, json: async () => ({}) };
            }
        } catch (_) { /* non-JSON body, ignore */ }
    }
    return res;
}

/* ── Inject modal-open loader CSS (no HTML changes needed) ── */
(function injectLoaderStyles() {
    const s = document.createElement('style');
    s.textContent = `
    /* Full-page loader shown while edit modal data is fetching */
    #um-fetch-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.38);
        backdrop-filter: blur(2px);
        z-index: 1200;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 14px;
    }
    #um-fetch-overlay.visible { display: flex; }
    #um-fetch-overlay .ov-card {
        background: #fff;
        border-radius: 12px;
        padding: 28px 36px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.18);
    }
    #um-fetch-overlay .ov-spinner {
        width: 36px; height: 36px;
        border: 3.5px solid #e5e7eb;
        border-top-color: #2563eb;
        border-radius: 50%;
        animation: spin 0.75s linear infinite;
    }
    #um-fetch-overlay .ov-label {
        font-size: 13.5px;
        font-weight: 600;
        color: #374151;
    }
    #um-fetch-overlay .ov-sub {
        font-size: 11.5px;
        color: #6b7280;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Inline Google API error row inside Account Access */
    .cust-api-error {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 5px 4px;
        font-size: 11.5px;
        line-height: 1.45;
        color: #6b7280;
        user-select: none;
    }
    .cust-api-error .err-icon { flex-shrink: 0; font-size: 12px; margin-top: 1px; }
    .cust-api-error .err-name { font-weight: 600; color: #374151; }
    .cust-api-error .err-msg  { color: #ef4444; font-weight: 500; }
    `;
    document.head.appendChild(s);

    /* Create the overlay element once */
    const ov = document.createElement('div');
    ov.id = 'um-fetch-overlay';
    ov.innerHTML = `
        <div class="ov-card">
            <div class="ov-spinner"></div>
            <div class="ov-label">Loading user data…</div>
            <div class="ov-sub">Fetching accounts &amp; customers</div>
        </div>`;
    document.body.appendChild(ov);
})();

function showFetchOverlay(on) {
    const ov = document.getElementById('um-fetch-overlay');
    if (ov) ov.classList.toggle('visible', on);
}

/* Extract a clean Google API error string from the error value stored by backend */
function extractGoogleApiError(err) {
    if (!err) return 'Google API error';
    if (typeof err === 'string') return err;
    if (typeof err === 'object') {
        return err.message || err.error?.message || JSON.stringify(err);
    }
    return String(err);
}

/* ================= LOAD USERS ================= */
async function loadUserList() {
    showLoading(true);

    try {
        const response = await secureFetch(`${API}/auth/admin-list`, {
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
            <div class="campaign-row" data-id="${u._id}">
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
        const res = await secureFetch(`${API}/role/all-roles`, {
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
let GLOBAL_CUSTOMERS_MAP = {}; // ✅ move here (global)

function syncChildrenState(parentChecked, container) {
    container.querySelectorAll(".child-checkbox").forEach(cb => {
        cb.disabled = !parentChecked;
        if (!parentChecked) cb.checked = false;
    });
}

async function openEdit(id) {
    showFetchOverlay(true);   // ← show loader BEFORE any async work
    try {
        // ✅ Load user basic info
        const res = await secureFetch(`${API}/auth/single-user/${id}`, {
            headers: authH()
        });
        const data = await res.json();
        const user = data.data;
        const selectedIds = user.accessUserIds || []; // ✅ reuse here
        //let GLOBAL_CUSTOMERS_MAP = {}; // cache customers per account

        const customerAccessMap = {};
        (user.customerAccess || []).forEach(entry => {
            customerAccessMap[entry.userId] = entry.customerIds;
        });

        document.getElementById('editUserId').value = id;
        document.getElementById('editName').value = user.fullname;
        document.getElementById('editEmail').value = user.email;

        await loadRolesForEdit();
        document.getElementById('editRole').value = user.role;

        /* ── Admin View Access checkbox ── */
        const adminViewCb = document.getElementById('editAdminViewAccess');
        if (adminViewCb) {
            adminViewCb.checked = !!user.canAccessAdminView;

            // Remove any previous listener to avoid duplicates
            const newCb = adminViewCb.cloneNode(true);
            adminViewCb.parentNode.replaceChild(newCb, adminViewCb);

            // Instant-save on toggle (mirrors the customer-access toggle pattern)
            newCb.addEventListener('change', async (e) => {
                try {
                    await secureFetch(`${API}/auth/toggle-adminview-access`, {
                        method: 'POST',
                        headers: { ...authH(), 'Content-Type': 'application/json' },
                        body: JSON.stringify({ adminId: id, checked: e.target.checked })
                    });
                } catch (err) {
                    console.error('Toggle adminview access failed:', err);
                }
            });
        }

        /* ===============================
           ✅ LOAD ALL ACCOUNTS (ONLY ONCE)
        =============================== */
        if (!GLOBAL_ACCOUNTS) {
            const matrixRes = await secureFetch(`${API}/auth/access-matrix`, {
                headers: authH()
            });

            const matrixData = await matrixRes.json();
            GLOBAL_ACCOUNTS = matrixData.oauthUsers; // ✅ ALL accounts
        }

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

            const customerIds = customerAccessMap[account.userId] || [];
            const isParentChecked = customerIds.length > 0;

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
                try {
                    const custRes = await secureFetch(`${API}/auth/customers-lite?userId=${account.userId}`, {
                        headers: authH()
                    });
                    const custData = await custRes.json();
                    GLOBAL_CUSTOMERS_MAP[account.userId] = custData.customers || [];
                } catch (e) {
                    GLOBAL_CUSTOMERS_MAP[account.userId] = [];
                }
            }

            const customers = GLOBAL_CUSTOMERS_MAP[account.userId];

            customers.forEach(c => {
                const row = document.createElement('div');

                /* ── Google API error customer: show inline error, no checkbox ── */

                if (c.status === 'error') {
                    row.className = 'cust-api-error';
                    // Format matches dashboard: ❌ Name (ID) — Error message
                    const errText = extractGoogleApiError(c.error);
                    row.innerHTML = `
                        <span class="err-icon">❌</span>
                        <span>
                            <span class="err-name">${c.name || 'Customer'} (${c.id})</span>
                            <span class="err-msg"> — ${errText}</span>
                        </span>`;
                    customerContainer.appendChild(row);
                    return;  // skip checkbox logic for error customers
                }

                const cb = document.createElement('input');
                cb.type = "checkbox";
                cb.className = "child-checkbox";
                cb.value = c.id;

                cb.addEventListener("change", async (e) => {
                    const checked = e.target.checked;

                    try {

                        await secureFetch(`${API}/auth/oauth/toggle-customer-access`, {
                            method: "POST",
                            headers: {
                                ...authH(),
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                adminId: id,
                                userId: account.userId,   // ✅ parent
                                customerId: c.id,         // ✅ child
                                checked: checked
                            })
                        });

                    } catch (err) {
                        console.error("Child toggle failed", err);
                    }

                    const checkedChildren = customerContainer.querySelectorAll(".child-checkbox:checked");

                    if (checkedChildren.length > 0) {
                        parentCheckbox.checked = true;
                    } else {
                        parentCheckbox.checked = false;
                    }

                });

                cb.checked = (customerAccessMap[account.userId] || []).includes(c.id);
                cb.disabled = !isParentChecked;

                const label = document.createElement('label');
                label.innerText = `${c.name || 'Customer'} (${c.id})`;
                label.className = "child-label";

                row.appendChild(cb);
                row.appendChild(label);

                customerContainer.appendChild(row);
            });

            /* =========================
               ✅ TOGGLE LOGIC
            ========================= */
            parentCheckbox.addEventListener("change", async (e) => {
                const enabled = e.target.checked;

                // ✅ UI sync
                syncChildrenState(enabled, customerContainer);

                const children = customerContainer.querySelectorAll(".child-checkbox");

                for (const cb of children) {
                    try {
                        await secureFetch(`${API}/auth/oauth/toggle-customer-access`, {
                            method: "POST",
                            headers: {
                                ...authH(),
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                adminId: id,
                                userId: account.userId,
                                customerId: cb.value,
                                checked: cb.checked
                            })
                        });
                    } catch (err) {
                        console.error("Parent bulk toggle failed", err);
                    }
                }
            });

            accountWrapper.appendChild(parentRow);
            accountWrapper.appendChild(customerContainer);

            container.appendChild(accountWrapper);
        }

        showFetchOverlay(false);   // ← hide loader
        document.getElementById('editModal').style.display = 'block';

    } catch (err) {
        console.error('Error:', err);
        showFetchOverlay(false);   // ← always hide on error too
    }
}

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
    const checkedParents = document.querySelectorAll('.parent-checkbox:checked');
    const accessUserIds = Array.from(checkedParents).map(cb => cb.value);

    // ✅ include Admin View access
    const canAccessAdminView = !!(document.getElementById('editAdminViewAccess')?.checked);

    const bodyData = { name, email, role, accessUserIds, canAccessAdminView };

    if (password && password.trim() !== '') {
        bodyData.password = password;
    }

    try {
        await secureFetch(`${API}/auth/update-single-user/${usr_ID}`, {
            method: 'PATCH',
            headers: { ...authH(), 'Content-Type': 'application/json' },
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
        await secureFetch(`${API}/auth/delete-user/${id}`, {
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
        const res = await secureFetch(`${API}/auth/roles`, {
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
        const res = await secureFetch(`${API}/oauth/list`, {
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
        const res = await secureFetch(`${API}/role/all-roles`, {
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
        await secureFetch(`${API}/auth/create-user`, {
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
        secureFetch(`${API}/logincheck/me`, { headers: { 'x-session-token': token } })
            .then(r => {
                if (!r.ok) { clearAndRedirect(); return; }
                document.body.classList.remove('auth-pending');
                setAdminUI();
                checkAdminViewAccess();
                injectMobileMenu();
                Promise.all([loadUserList()]);
            })
            .catch(() => {
                document.body.classList.remove('auth-pending');
                setAdminUI();
                injectMobileMenu();
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
        secureFetch(`${API}/logincheck/me`, { headers: { 'x-session-token': token } })
            .then(r => {
                if (!r.ok) { clearAndRedirect(); return; }
                document.body.classList.remove('auth-pending');
                setAdminUI();
                checkAdminViewAccess();
                injectMobileMenu();
                Promise.all([loadUserList()]);
            })
            .catch(() => {
                document.body.classList.remove('auth-pending');
                setAdminUI();
                injectMobileMenu();
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

/* ── Check canAccessAdminView permission and hide nav + protect adminview URL ── */
async function checkAdminViewAccess() {
    try {
        const res = await secureFetch(`${API}/auth/my-permissions`, { headers: authH() });
        if (!res.ok) return;
        const data = await res.json();

        // super_admin always has access
        if (data.role === 'super_admin') return;

        if (!data.canAccessAdminView) {
            // Hide admin-view nav link on all pages
            const navLink = document.getElementById('admin-view');
            if (navLink) navLink.style.display = 'none';

            // If currently on adminview.html, redirect away
            if (currentPage === 'adminview.html') {
                window.location.href = 'dashboard.html';
            }
        }
    } catch (err) {
        console.error('checkAdminViewAccess error:', err);
    }
}

/* ── Mobile sidebar hamburger — injected into DOM, no HTML changes needed ── */
function injectMobileMenu() {
    if (document.getElementById('mob-menu-btn')) return;
    const sidebar  = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Hamburger button
    const btn = document.createElement('button');
    btn.id = 'mob-menu-btn';
    btn.setAttribute('aria-label', 'Toggle menu');
    btn.innerHTML = `<span></span><span></span><span></span>`;
    document.body.appendChild(btn);

    // Backdrop overlay
    const overlay = document.createElement('div');
    overlay.id = 'mob-overlay';
    document.body.appendChild(overlay);

    btn.addEventListener('click', () => {
        sidebar.classList.toggle('mob-open');
        overlay.classList.toggle('mob-overlay-visible');
        btn.classList.toggle('mob-open');
    });
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('mob-open');
        overlay.classList.remove('mob-overlay-visible');
        btn.classList.remove('mob-open');
    });
}
document.getElementById('btn-logout').addEventListener('click', async () => {
    try { await secureFetch(`${API}/logincheck/logout`, { method: 'POST', headers: { 'x-session-token': token } }); } catch { }
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