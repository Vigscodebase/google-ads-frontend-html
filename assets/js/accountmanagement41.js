/* ── Account Management JS + User Access Roles ── */

const API = 'https://americanssupport.org/gads/api';
const token = localStorage.getItem('sessionToken');
const adminEmail = localStorage.getItem('adminEmail') || '';

let allAccounts = [];
let allAdmins = [];       // all admin users for grant-access dropdown
let pendingDeleteId = null;
let accessModalAccId = null;     // which account the access modal is open for
let isSuperAdmin = false;

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
    const main = document.querySelector('.main');
    const layout = document.querySelector('.layout');
    if (main) main.style.display = 'none';
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
            const body = await clone.json();
            const msg = (body?.message || body?.error || '').toLowerCase();
            if (msg.includes('session') && (msg.includes('expire') || msg.includes('invalid'))) {
                handleSessionExpiry();
                return { ok: false, status: res.status, json: async () => ({}) };
            }
        } catch (_) { /* non-JSON body, ignore */ }
    }
    return res;
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
        isSuperAdmin = false;
        handleRoleUI();
        if (currentPage === "accountaccess.html") {
            window.location.href = "dashboard.html";
        }

        if (currentPage === "usermanagement.html") {
            window.location.href = "dashboard.html";
        }

        // if (currentPage === "adminview.html") {
        //     window.location.href = "dashboard.html";
        // }

        document.body.classList.remove('auth-pending');
        document.getElementById("usr-management").style.display = "none";
        //document.getElementById('admin-view').style.display = "none"
        secureFetch(`${API}/logincheck/me`, { headers: { 'x-session-token': token } })
            .then(r => {
                if (!r.ok) { clearAndRedirect(); return; }
                document.body.classList.remove('auth-pending');
                setAdminUI();
                checkAdminViewAccess();
                Promise.all([loadAccounts(), loadAdminList()]);
            })
            .catch(() => {
                document.body.classList.remove('auth-pending');
                setAdminUI();
                Promise.all([loadAccounts(), loadAdminList()]);
            });
    } else {
        // window.location.href = 'accountmanagement.html';
        isSuperAdmin = true;
        handleRoleUI();
        if (currentPage === "usermanagement.html") {
            // window.location.href = 'dashboard.html';
            document.getElementById("usr-management").style.display = "block";
            //document.getElementById('admin-view').style.display = "block"
        }

        if (currentPage === "accountaccess.html") {
            // window.location.href = 'dashboard.html';
            document.getElementById("usr-management").style.display = "block";
            //document.getElementById('admin-view').style.display = "block"
        }

        // if (currentPage === "adminview.html") {
        //     document.getElementById("usr-management").style.display = "block";
        //     document.getElementById('admin-view').style.display = "block"
        // }

        document.getElementById("usr-management").style.display = "block";
        //document.getElementById('admin-view').style.display = "block"

        secureFetch(`${API}/logincheck/me`, { headers: { 'x-session-token': token } })
            .then(r => {
                if (!r.ok) { clearAndRedirect(); return; }
                document.body.classList.remove('auth-pending');
                setAdminUI();
                checkAdminViewAccess();
                Promise.all([loadAccounts(), loadAdminList()]);
            })
            .catch(() => {
                document.body.classList.remove('auth-pending');
                setAdminUI();
                Promise.all([loadAccounts(), loadAdminList()]);
            });
    }

}
function clearAndRedirect() {
    localStorage.removeItem('sessionToken'); localStorage.removeItem('adminEmail');
    window.location.href = 'index.html';
}
function setAdminUI() {
    const e = document.getElementById('admin-email');
    const a = document.getElementById('admin-avatar');
    if (e) e.textContent = adminEmail || '—';
    if (a) a.textContent = adminEmail ? adminEmail[0].toUpperCase() : '?';
}

// ══════════════════════════════════════════════════
//  ACCOUNTS
// ══════════════════════════════════════════════════

function loadAllAccounts() {
    showLoading(true);
    //fetch(`${API}/auth/accounts?adminEmail=${adminEmail}`, { headers: authH() })
    secureFetch(`${API}/auth/accounts`, { headers: authH() })
        .then(r => { if (r.status === 401) { clearAndRedirect(); return null; } return r.json(); })
        .then(data => {
            if (!data) return;
            allAccounts = data.accounts || [];
            console.log(allAccounts)
            if (!allAccounts.length) {
                showError('No Google Ads accounts connected. Go to Account Management to connect one.');
                return;
            }
            buildAccountDropdown(allAccounts);
            selectAccount(allAccounts[0]);
        })
        .catch(err => showError(err.message || 'Failed to load accounts'));
}

document.getElementById('btn-logout')?.addEventListener('click', async () => {
    try { await secureFetch(`${API}/logincheck/logout`, { method: 'POST', headers: { 'x-session-token': token } }); } catch { }
    clearAndRedirect();
});

// Google OAuth
const CLIENT_ID = '476397425230-589marau60i4fog9skjabvimr5pihfgd.apps.googleusercontent.com';
const REDIRECT_URI = encodeURIComponent(`${API}/auth/oauth/callback`);
const SCOPE = encodeURIComponent(
    [
        'https://www.googleapis.com/auth/adwords',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email'
    ].join(' ')
);

document.getElementById('btn-google')?.addEventListener('click', () => {
    const state = crypto.randomUUID();
    localStorage.setItem('oauth_state', state);

    window.location.href =
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}` +
        `&redirect_uri=${REDIRECT_URI}` +
        `&response_type=code` +
        `&scope=${SCOPE}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&state=${state}`;
});

const authH = () => ({ 'x-session-token': token });

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(str) {
    if (!str) return '—';
    const d = new Date(str);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function getInitials(name, email) {
    if (name?.trim()) {
        const p = name.trim().split(/\s+/);
        return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : p[0][0].toUpperCase();
    }
    return email ? email[0].toUpperCase() : '?';
}
function getDisplayInfo(acc) {
    const email = acc.googleEmail || null;
    const name = acc.googleName || null;
    return {
        displayName: name || (email ? email.split('@')[0] : acc.userId || 'Unknown'),
        displayEmail: email || acc.userId || '—',
        name, email,
    };
}
function getTokenStatus(acc) {
    if (!acc.tokenRefreshedAt) return { label: 'NO TOKEN', cls: 'status-pending' };
    const age = Date.now() - new Date(acc.tokenRefreshedAt).getTime();
    return age < 55 * 60 * 1000
        ? { label: 'ACTIVE', cls: 'status-active' }
        : { label: 'NEEDS REFRESH', cls: 'status-expired' };
}
function roleColor(role) {
    if (role === 'owner') return 'role-owner';
    if (role === 'editor') return 'role-editor';
    return 'role-viewer';
}
function roleBadge(role) {
    return `<span class="role-badge ${roleColor(role)}">${role}</span>`;
}

// ── Load admin list (for grant dropdown) ──────────────────────────────────────
function loadAdminList() {
    return secureFetch(`${API}/auth/admin-list`, { headers: authH() })
        .then(r => r.json())
        .then(data => { allAdmins = data.admins || []; })
        .catch(() => { });
}

// ── Load & render accounts ────────────────────────────────────────────────────
function loadAccounts() {
    showLoading(true);
    return secureFetch(`${API}/auth/accounts?adminEmail=${adminEmail}`, { headers: authH() })
        .then(r => { if (r.status === 401) { clearAndRedirect(); return null; } return r.json(); })
        .then(data => {
            if (!data) return;
            allAccounts = data.accounts || [];
            updateStats(); renderAccounts(allAccounts); showLoading(false);
        })
        .catch(() => { allAccounts = []; updateStats(); renderAccounts([]); showLoading(false); });
}

function updateStats() {
    const total = allAccounts.length;
    const active = allAccounts.filter(a => getTokenStatus(a).label === 'ACTIVE').length;
    const totalCids = allAccounts.reduce((s, a) => s + (Array.isArray(a.customerIds) ? a.customerIds.length : 0), 0);
    const el = id => document.getElementById(id);
    if (el('stat-total')) el('stat-total').textContent = total;
    if (el('stat-active')) el('stat-active').textContent = active;
    if (el('stat-cids')) el('stat-cids').textContent = totalCids;
    if (el('count-chip')) el('count-chip').textContent = total;
}

function handleRoleUI() {
    const actionsHeader = document.getElementById('actions-header');
    if (!isSuperAdmin && actionsHeader) {
        actionsHeader.style.display = 'none';
    }
}

function renderAccounts(list) {
    const tbody = document.getElementById('account-list');
    const empty = document.getElementById('empty');
    if (!tbody) return;
    if (!list.length) { tbody.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = list.map((acc, i) => {
        const id = acc._id;
        const { displayName, displayEmail, name, email } = getDisplayInfo(acc);
        const st = getTokenStatus(acc);
        const added = fmtDate(acc.created || acc.createdAt);
        const refreshed = fmtDate(acc.tokenRefreshedAt);
        const cids = Array.isArray(acc.customerIds) ? acc.customerIds : [];
        const roles = acc.accessRoles || [];

        const cidsHtml = cids.length
            ? cids.map(c => `<span class="cid-chip" title="CID: ${c}">${c}</span>`).join('')
            : `<span class="cid-chip no-cid">None — click Refresh</span>`;

        const warnBadge = !acc.googleEmail
            ? `<span style="font-size:10px;color:var(--amber);margin-left:6px;cursor:help;" title="Click Refresh to sync profile">⚠</span>`
            : '';

        // Compact access summary shown in the row
        const accessSummary = roles.length
            ? roles.map(r => {
                const label = r.adminEmail ? r.adminEmail.split('@')[0] : 'User';
                return `<span class="role-badge ${roleColor(r.role)}" title="${r.adminEmail || ''}">${label}: ${r.role}</span>`;
            }).join('')
            : `<span class="no-access-label">No users assigned</span>`;

        const safeEmail = (email || acc.userId || '').replace(/'/g, "\\'");

        return `
        <div class="account-row" style="animation-delay:${i * 35}ms" data-id="${id}">
            <div class="cell-num">${String(i + 1).padStart(2, '0')}</div>

            <div class="account-name-wrap">
                <div class="account-avatar">${getInitials(name, email)}</div>
                <div class="account-info">
                    <div class="account-name">${displayName}${warnBadge}</div>
                    <div class="account-email" title="${displayEmail}">${displayEmail}</div>
                </div>
            </div>

            <div>
                <span class="status-pill ${st.cls}"><span class="status-dot"></span>${st.label}</span>
                <div class="last-refresh">Last: ${refreshed}</div>
            </div>

            <div class="cids-wrap col-cids">${cidsHtml}</div>

           <!-- <div class="col-access">
                <div class="access-summary">${accessSummary}</div>
            </div> -->

            <div class="cell-date col-date">${added}</div>

           <div class="cell-actions">
    <!-- <button class="action-btn-access" onclick="openAccessModal('${id}')" title="Manage access">👥 Access</button> -->
     ${isSuperAdmin ? `
    <button class="action-btn-refresh" onclick="refreshAccount('${id}')" title="Refresh token">↻ Refresh</button>
    <button class="action-btn-delete"  onclick="confirmDelete('${id}','${safeEmail}')" title="Remove account">✕ Remove</button>
    ` : ``}
</div>
        </div>`;
    }).join('');
}

function filterAccounts(q) {
    q = q.toLowerCase();
    const f = allAccounts.filter(a =>
        (a.googleEmail || '').toLowerCase().includes(q) ||
        (a.googleName || '').toLowerCase().includes(q) ||
        (a.customerIds || []).join(' ').includes(q)
    );
    document.getElementById('count-chip').textContent = f.length;
    renderAccounts(f);
}

// ── Refresh & Delete ──────────────────────────────────────────────────────────
function refreshAccount(id) {
    showToast('Refreshing token & syncing profile…', 'default');
    secureFetch(`${API}/auth/refresh/${id}`, { method: 'POST', headers: authH() })
        .then(r => r.json())
        .then(d => { showToast(d.message || 'Refreshed', 'success'); loadAccounts(); })
        .catch(() => showToast('Refresh failed', 'error'));
}
function confirmDelete(id, email) {
    pendingDeleteId = id;
    const el = document.getElementById('modal-del-email');
    if (el) el.textContent = email;
    document.getElementById('modal-confirm')?.classList.add('open');
}
document.getElementById('modal-cancel')?.addEventListener('click', () => {
    pendingDeleteId = null; document.getElementById('modal-confirm')?.classList.remove('open');
});
document.getElementById('modal-confirm')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) { pendingDeleteId = null; e.currentTarget.classList.remove('open'); }
});
document.getElementById('modal-delete-btn')?.addEventListener('click', () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId; pendingDeleteId = null;
    document.getElementById('modal-confirm')?.classList.remove('open');
    secureFetch(`${API}/auth/accounts/${id}`, { method: 'DELETE', headers: authH() })
        .then(r => { if (!r.ok) throw new Error(); showToast('Account removed', 'success'); loadAccounts(); })
        .catch(() => showToast('Failed to remove', 'error'));
});

// ══════════════════════════════════════════════════
//  USER ACCESS ROLES MODAL
// ══════════════════════════════════════════════════

function openAccessModal(accountId) {
    accessModalAccId = accountId;

    const acc = allAccounts.find(a => a._id === accountId);
    const name = acc ? (getDisplayInfo(acc).displayName) : accountId;

    document.getElementById('access-modal-title').textContent = `User Access — ${name}`;
    document.getElementById('access-modal').classList.add('open');

    // ✅ Ensure admins loaded before rendering
    if (!allAdmins.length) {
        loadAdminList().then(() => {
            renderGrantForm();
        });
    } else {
        renderGrantForm();
    }

    loadAccessRoles(accountId);
}

document.getElementById('access-modal-close')?.addEventListener('click', closeAccessModal);
document.getElementById('access-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAccessModal();
});
function closeAccessModal() {
    accessModalAccId = null;
    document.getElementById('access-modal')?.classList.remove('open');
}

// Build the grant-access form (admin dropdown + role picker)
function renderGrantForm() {
    const sel = document.getElementById('grant-admin-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select user —</option>';
    allAdmins.forEach(adm => {
        const opt = document.createElement('option');
        opt.value = adm._id;
        opt.textContent = `${adm.email}${adm.fullname ? ' (' + adm.fullname + ')' : ''}`;
        sel.appendChild(opt);
    });
}

// Load current access roles for the account
function loadAccessRoles(accountId) {
    const list = document.getElementById('access-roles-list');
    if (!list) return;
    list.innerHTML = '<div class="access-loading">Loading…</div>';

    secureFetch(`${API}/auth/accounts/${accountId}/access`, { headers: authH() })
        .then(r => r.json())
        .then(data => {
            const roles = data.accessRoles || [];
            if (!roles.length) {
                list.innerHTML = '<div class="access-empty">No users have been granted access yet.</div>';
                return;
            }
            list.innerHTML = roles.map(r => `
                <div class="access-role-row">
                    <div class="access-user-info">
                        <div class="access-user-avatar">${(r.adminEmail || '?')[0].toUpperCase()}</div>
                        <div>
                            <div class="access-user-email">${r.adminEmail || r.adminId}</div>
                            ${r.adminFullname ? `<div class="access-user-name">${r.adminFullname}</div>` : ''}
                        </div>
                    </div>
                    <div class="access-role-meta">
                        ${roleBadge(r.role)}
                        <div class="access-granted-date">Granted ${fmtDate(r.grantedAt)}</div>
                    </div>
                    <div class="access-role-actions">
                        <select class="role-change-select" onchange="changeRole('${accountId}','${r.adminId}',this.value)">
                            <option value="viewer"  ${r.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                            <option value="editor"  ${r.role === 'editor' ? 'selected' : ''}>Editor</option>
                            <option value="owner"   ${r.role === 'owner' ? 'selected' : ''}>Owner</option>
                        </select>
                        <button class="btn-revoke" onclick="revokeAccess('${accountId}','${r.adminId}')">Revoke</button>
                    </div>
                </div>
            `).join('');
        })
        .catch(() => { list.innerHTML = '<div class="access-empty">Failed to load access roles.</div>'; });
}

// Grant access
document.getElementById('btn-grant-access')?.addEventListener('click', () => {
    const adminId = document.getElementById('grant-admin-select').value;
    const role = document.getElementById('grant-role-select').value;
    if (!adminId) { showToast('Please select a user first.', 'error'); return; }
    if (!accessModalAccId) return;

    secureFetch(`${API}/auth/accounts/${accessModalAccId}/access`, {
        method: 'POST',
        headers: { ...authH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId, role }),
    })
        .then(r => r.json())
        .then(d => {
            showToast(d.message || 'Access granted', 'success');
            loadAccessRoles(accessModalAccId);
            loadAccounts();  // refresh the summary row
            // Reset form
            document.getElementById('grant-admin-select').value = '';
            document.getElementById('grant-role-select').value = 'viewer';
        })
        .catch(() => showToast('Failed to grant access', 'error'));
});

// Change role inline
function changeRole(accountId, adminId, newRole) {
    secureFetch(`${API}/auth/accounts/${accountId}/access`, {
        method: 'POST',
        headers: { ...authH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId, role: newRole }),
    })
        .then(r => r.json())
        .then(d => { showToast(d.message || 'Role updated', 'success'); loadAccounts(); })
        .catch(() => showToast('Failed to update role', 'error'));
}

// Revoke access
function revokeAccess(accountId, adminId) {
    if (!confirm('Revoke this user\'s access?')) return;
    secureFetch(`${API}/auth/accounts/${accountId}/access/${adminId}`, {
        method: 'DELETE',
        headers: authH(),
    })
        .then(r => r.json())
        .then(d => {
            showToast(d.message || 'Access revoked', 'success');
            loadAccessRoles(accountId);
            loadAccounts();
        })
        .catch(() => showToast('Failed to revoke access', 'error'));
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function showLoading(state) {
    const ld = document.getElementById('loading');
    const tb = document.getElementById('table-inner');
    if (ld) ld.style.display = state ? 'flex' : 'none';
    if (tb) tb.style.display = state ? 'none' : 'block';
}

function showError(msg) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('table-inner').style.display = 'none';
    document.getElementById('error-box').style.display = 'flex';
    document.getElementById('error-msg').textContent = typeof msg === 'object' ? JSON.stringify(msg) : "No Data Found";
}

let toastTimer;
function showToast(msg, type = 'default') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.className = `toast ${type}`;
    const tx = t.querySelector('.toast-text');
    if (tx) tx.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
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