const API = 'https://americanssupport.org/gads/api';
const token = localStorage.getItem('sessionToken');
const adminEmail = localStorage.getItem('adminEmail') || '';

// ── Load admin list (for grant dropdown) ──────────────────────────────────────
function loadUserList() {
    return fetch(`${API}/auth/admin-list`, { headers: authH() })
        .then(r => r.json())
        .then(data => { allAdmins = data.admins || []; })
        .catch(() => { });
}

// ── Auth guard ──────────────────────────────────────────────────────────────
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
    localStorage.removeItem('sessionToken'); localStorage.removeItem('adminEmail');
    window.location.href = 'index.html';
}

function setAdminUI() {
    const e = document.getElementById('admin-email');
    const a = document.getElementById('admin-avatar');
    if (e) e.textContent = adminEmail || '—';
    if (a) a.textContent = adminEmail ? adminEmail[0].toUpperCase() : '?';
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function showLoading(state) {
    const ld = document.getElementById('loading');
    const tb = document.getElementById('table-inner');
    if (ld) ld.style.display = state ? 'flex' : 'none';
    if (tb) tb.style.display = state ? 'none' : 'block';
}

// ── Load & render accounts ────────────────────────────────────────────────────
function loadAccounts() {
    showLoading(true);
    return fetch(`${API}/auth/accounts`, { headers: authH() })
        .then(r => { if (r.status === 401) { clearAndRedirect(); return null; } return r.json(); })
        .then(data => {
            if (!data) return;
            allAccounts = data.accounts || [];
            updateStats(); renderAccounts(allAccounts); showLoading(false);
        })
        .catch(() => { allAccounts = []; updateStats(); renderAccounts([]); showLoading(false); });
}