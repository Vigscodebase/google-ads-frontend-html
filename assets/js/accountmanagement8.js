/* ── Account Management JS ── */

const API        = 'https://americanssupport.org/gads/api';
const token      = localStorage.getItem('sessionToken');
const adminEmail = localStorage.getItem('adminEmail') || '';

let allAccounts     = [];
let pendingDeleteId = null;

if (!token) {
    window.location.href = 'index.html';
} else {
    fetch(`${API}/logincheck/me`, { headers: { 'x-session-token': token } })
        .then(r => {
            if (!r.ok) { clearAndRedirect(); return; }
            document.body.classList.remove('auth-pending');
            setAdminUI(); loadAccounts();
        })
        .catch(() => {
            document.body.classList.remove('auth-pending');
            setAdminUI(); loadAccounts();
        });
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
document.getElementById('btn-logout')?.addEventListener('click', async () => {
    try { await fetch(`${API}/logincheck/logout`, { method:'POST', headers:{ 'x-session-token':token }}); } catch {}
    clearAndRedirect();
});

// Google OAuth
const CLIENT_ID    = '476397425230-589marau60i4fog9skjabvimr5pihfgd.apps.googleusercontent.com';
const REDIRECT_URI = encodeURIComponent(`${API}/auth/oauth/callback`);
const SCOPE        = encodeURIComponent('https://www.googleapis.com/auth/adwords');

document.getElementById('btn-google')?.addEventListener('click', () => {
    const state = crypto.randomUUID();
    localStorage.setItem('oauth_state', state);
    window.location.href =
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}` +
        `&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${SCOPE}` +
        `&access_type=offline&prompt=consent&state=${state}`;
});

const authH = () => ({ 'x-session-token': token });

function fmtDate(str) {
    if (!str) return '—';
    const d = new Date(str);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
}
function getInitials(name, email) {
    if (name?.trim()) {
        const p = name.trim().split(/\s+/);
        return p.length >= 2 ? (p[0][0]+p[p.length-1][0]).toUpperCase() : p[0][0].toUpperCase();
    }
    return email ? email[0].toUpperCase() : '?';
}
function getDisplayInfo(acc) {
    const email = acc.googleEmail || null;
    const name  = acc.googleName  || null;
    const displayName  = name || (email ? email.split('@')[0] : acc.userId || 'Unknown');
    const displayEmail = email || acc.userId || '—';
    return { displayName, displayEmail, name, email };
}
function getTokenStatus(acc) {
    if (!acc.tokenRefreshedAt) return { label:'NO TOKEN', cls:'status-pending' };
    const age = Date.now() - new Date(acc.tokenRefreshedAt).getTime();
    return age < 55*60*1000
        ? { label:'ACTIVE', cls:'status-active' }
        : { label:'NEEDS REFRESH', cls:'status-expired' };
}

function loadAccounts() {
    showLoading(true);
    fetch(`${API}/auth/accounts`, { headers: authH() })
        .then(r => { if (r.status===401) { clearAndRedirect(); return null; } return r.json(); })
        .then(data => {
            if (!data) return;
            allAccounts = data.accounts || [];
            updateStats(); renderAccounts(allAccounts); showLoading(false);
        })
        .catch(() => { allAccounts=[]; updateStats(); renderAccounts([]); showLoading(false); });
}

function updateStats() {
    const total    = allAccounts.length;
    const active   = allAccounts.filter(a => getTokenStatus(a).label==='ACTIVE').length;
    const totalCids= allAccounts.reduce((s,a)=>s+(Array.isArray(a.customerIds)?a.customerIds.length:0),0);
    const el = id => document.getElementById(id);
    if (el('stat-total'))  el('stat-total').textContent  = total;
    if (el('stat-active')) el('stat-active').textContent = active;
    if (el('stat-cids'))   el('stat-cids').textContent   = totalCids;
    if (el('count-chip'))  el('count-chip').textContent  = total;
}

function renderAccounts(list) {
    const tbody = document.getElementById('account-list');
    const empty = document.getElementById('empty');
    if (!tbody) return;
    if (!list.length) { tbody.innerHTML=''; if(empty) empty.style.display='block'; return; }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = list.map((acc, i) => {
        const id  = acc._id;
        const { displayName, displayEmail, name, email } = getDisplayInfo(acc);
        const st  = getTokenStatus(acc);
        const added = fmtDate(acc.created || acc.createdAt);
        const refreshed = fmtDate(acc.tokenRefreshedAt);
        const cids = Array.isArray(acc.customerIds) ? acc.customerIds : [];

        const cidsHtml = cids.length
            ? cids.map(c=>`<span class="cid-chip" title="CID: ${c}">${c}</span>`).join('')
            : `<span class="cid-chip no-cid">None — click Refresh</span>`;

        const noProfile = !acc.googleEmail;
        const warnBadge = noProfile
            ? `<span style="font-size:10px;color:var(--amber);margin-left:6px;cursor:help;" title="Click Refresh to sync profile">⚠</span>`
            : '';

        const safeEmail = (email || acc.userId || '').replace(/'/g, "\\'");

        return `
        <div class="account-row" style="animation-delay:${i*35}ms" data-id="${id}">
            <div class="cell-num">${String(i+1).padStart(2,'0')}</div>
            <div class="account-name-wrap">
                <div class="account-avatar">${getInitials(name,email)}</div>
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
            <div class="cell-date col-date">${added}</div>
            <div class="cell-actions">
                <button class="action-btn-refresh" onclick="refreshAccount('${id}')" title="Refresh token &amp; sync profile/CIDs">↻ Refresh</button>
                <button class="action-btn-delete"  onclick="confirmDelete('${id}','${safeEmail}')" title="Remove account">✕ Remove</button>
            </div>
        </div>`;
    }).join('');
}

function filterAccounts(q) {
    q = q.toLowerCase();
    const f = allAccounts.filter(a =>
        (a.googleEmail||'').toLowerCase().includes(q) ||
        (a.googleName||'').toLowerCase().includes(q)  ||
        (a.customerIds||[]).join(' ').includes(q)
    );
    document.getElementById('count-chip').textContent = f.length;
    renderAccounts(f);
}

function refreshAccount(id) {
    showToast('Refreshing token & syncing profile…','default');
    fetch(`${API}/auth/refresh/${id}`, { method:'POST', headers:authH() })
        .then(r=>r.json())
        .then(d=>{ showToast(d.message||'Refreshed','success'); loadAccounts(); })
        .catch(()=>showToast('Refresh failed','error'));
}

function confirmDelete(id, email) {
    pendingDeleteId = id;
    const el = document.getElementById('modal-del-email');
    if (el) el.textContent = email;
    document.getElementById('modal-confirm')?.classList.add('open');
}
document.getElementById('modal-cancel')?.addEventListener('click', () => {
    pendingDeleteId=null; document.getElementById('modal-confirm')?.classList.remove('open');
});
document.getElementById('modal-confirm')?.addEventListener('click', e => {
    if (e.target===e.currentTarget) { pendingDeleteId=null; e.currentTarget.classList.remove('open'); }
});
document.getElementById('modal-delete-btn')?.addEventListener('click', () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId; pendingDeleteId=null;
    document.getElementById('modal-confirm')?.classList.remove('open');
    fetch(`${API}/auth/accounts/${id}`, { method:'DELETE', headers:authH() })
        .then(r=>{ if(!r.ok) throw new Error(); showToast('Account removed','success'); loadAccounts(); })
        .catch(()=>showToast('Failed to remove account','error'));
});

function showLoading(state) {
    const ld = document.getElementById('loading');
    const tb = document.getElementById('table-inner');
    if (ld) ld.style.display = state ? 'flex' : 'none';
    if (tb) tb.style.display = state ? 'none' : 'block';
}

let toastTimer;
function showToast(msg, type='default') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.className = `toast ${type}`;
    const tx = t.querySelector('.toast-text');
    if (tx) tx.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>t.classList.remove('show'), 3500);
}
