/* ── Dashboard JS — multi-account dropdown ── */

const API        = 'https://americanssupport.org/gads/api';
const token      = localStorage.getItem('sessionToken');
const adminEmail = localStorage.getItem('adminEmail') || '';

let allCampaigns    = [];
let allAccounts     = [];   // [{_id, userId, googleEmail, googleName, customerIds}]
let activeUserId    = null;
let activeCustomerId= null;

// ── Auth guard ──────────────────────────────────────────────────────────────
if (!token) {
    window.location.href = 'index.html';
} else {
    fetch(`${API}/logincheck/me`, { headers: { 'x-session-token': token } })
        .then(r => {
            if (!r.ok) { clearAndRedirect(); return; }
            document.body.classList.remove('auth-pending');
            setAdminUI();
            loadAllAccounts();
        })
        .catch(() => {
            document.body.classList.remove('auth-pending');
            setAdminUI();
            loadAllAccounts();
        });
}

function clearAndRedirect() {
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('adminEmail');
    window.location.href = 'index.html';
}

function setAdminUI() {
    document.getElementById('admin-email').textContent  = adminEmail || '—';
    document.getElementById('admin-avatar').textContent = adminEmail ? adminEmail[0].toUpperCase() : '?';
}

document.getElementById('btn-logout').addEventListener('click', async () => {
    try { await fetch(`${API}/logincheck/logout`, { method: 'POST', headers: { 'x-session-token': token } }); } catch {}
    clearAndRedirect();
});

const authH = () => ({ 'x-session-token': token });

// ── Step 1: Load all connected accounts, build dropdown ─────────────────────
function loadAllAccounts() {
    showLoading(true);

    fetch(`${API}/auth/accounts`, { headers: authH() })
        .then(r => {
            if (r.status === 401) { clearAndRedirect(); return null; }
            return r.json();
        })
        .then(data => {
            if (!data) return;
            allAccounts = data.accounts || [];

            if (!allAccounts.length) {
                showError('No Google Ads accounts connected. Go to Account Management to connect one.');
                return;
            }

            buildAccountDropdown(allAccounts);

            // Auto-select the first account
            const first = allAccounts[0];
            selectAccount(first);
        })
        .catch(err => {
            showError(err.message || 'Failed to load accounts');
        });
}

// ── Build the account <select> dropdown ─────────────────────────────────────
function buildAccountDropdown(accounts) {
    const sel = document.getElementById('account-select');
    sel.innerHTML = '';
    accounts.forEach(acc => {
        const label = acc.googleEmail || acc.googleName || acc.userId || 'Unknown Account';
        const opt   = document.createElement('option');
        opt.value   = acc.userId;
        opt.textContent = label;
        // Store customerId on option for quick access
        opt.dataset.cids = JSON.stringify(acc.customerIds || []);
        sel.appendChild(opt);
    });
}

// ── When user picks an account in the dropdown ───────────────────────────────
document.getElementById('account-select').addEventListener('change', function () {
    const userId = this.value;
    const acc    = allAccounts.find(a => a.userId === userId);
    if (acc) selectAccount(acc);
});

// ── Select account → resolve customerId → load campaigns ─────────────────────
function selectAccount(acc) {
    activeUserId = acc.userId;
    document.getElementById('account-select').value = acc.userId;
    showLoading(true);

    // Use cached customerIds first; if empty, fetch live
    const cachedCids = acc.customerIds || [];

    if (cachedCids.length) {
        activeCustomerId = cachedCids[0];
        updateCidLabel(activeCustomerId);
        loadCampaigns(activeUserId, activeCustomerId);
    } else {
        // Fetch live customer IDs
        fetch(`${API}/auth/customers?userId=${activeUserId}`, { headers: authH() })
            .then(r => r.json())
            .then(data => {
                const cids = data.customerIds || [];
                if (!cids.length) throw new Error('No Customer IDs for this account.');
                activeCustomerId = cids[0];
                updateCidLabel(activeCustomerId);
                loadCampaigns(activeUserId, activeCustomerId);
            })
            .catch(err => showError(err.message));
    }
}

function updateCidLabel(cid) {
    const el = document.getElementById('meta-cid');
    if (el) el.textContent = 'CID · ' + cid;
}

// ── Load campaigns for selected account ──────────────────────────────────────
function loadCampaigns(userId, customerId) {
    fetch(`${API}/auth/ads-listing?userId=${userId}&customerId=${customerId}`, { headers: authH() })
        .then(r => {
            if (r.status === 401) { clearAndRedirect(); return null; }
            return r.json();
        })
        .then(data => {
            if (!data) return;
            if (data.error) throw new Error(data.error);

            allCampaigns = data.results || [];
            renderStats(allCampaigns);
            renderCampaigns(allCampaigns);

            document.getElementById('count-chip').textContent     = allCampaigns.length;
            document.getElementById('footer-count').textContent   = allCampaigns.length + ' records';
            document.getElementById('meta-time').textContent      =
                new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            showLoading(false);
        })
        .catch(err => {
            if (err.response?.status === 401) clearAndRedirect();
            else showError(err.message || 'Failed to load campaigns');
        });
}

// ── Render stats row ─────────────────────────────────────────────────────────
function renderStats(campaigns) {
    let totalSpend = 0, totalImpr = 0, totalClicks = 0, activeCount = 0;
    campaigns.forEach(c => {
        totalSpend  += Number(c.metrics?.costMicros  || 0);
        totalImpr   += Number(c.metrics?.impressions || 0);
        totalClicks += Number(c.metrics?.clicks      || 0);
        if (c.campaign.status === 'ENABLED') activeCount++;
    });
    document.getElementById('stat-spend').textContent     = fmtSpend(totalSpend);
    document.getElementById('stat-spend-sub').textContent = 'Last 30 days';
    document.getElementById('stat-impr').textContent      = fmtNum(totalImpr);
    document.getElementById('stat-clicks').textContent    = fmtNum(totalClicks);
    document.getElementById('stat-active').textContent    = activeCount;
    document.getElementById('stat-total-sub').textContent = `of ${campaigns.length} total`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getType(name) {
    const n = name.toUpperCase();
    if (n.includes('PMAX'))  return { label: 'PMAX',   cls: 'badge-pmax'   };
    if (n.includes('TCPA'))  return { label: 'TCPA',   cls: 'badge-tcpa'   };
    if (n.startsWith('M -')) return { label: 'MOBILE', cls: 'badge-mobile' };
    return                          { label: 'SEARCH', cls: 'badge-search' };
}
function getStatus(s) {
    if (!s) return { label: '—', cls: '' };
    const v = s.toUpperCase();
    if (v === 'ENABLED')  return { label: 'ACTIVE',  cls: 'status-enabled'  };
    if (v === 'PAUSED')   return { label: 'PAUSED',  cls: 'status-paused'   };
    if (v === 'REMOVED')  return { label: 'REMOVED', cls: 'status-removed'  };
    return { label: v, cls: '' };
}
function fmtSpend(micros) {
    if (!micros && micros !== 0) return '—';
    const d = micros / 1_000_000;
    if (d >= 1000) return '$' + (d / 1000).toFixed(1) + 'k';
    return '$' + d.toFixed(2);
}
function fmtNum(n) {
    if (!n && n !== 0) return '—';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
    return String(n);
}
function fmtCTR(v) {
    if (!v && v !== 0) return '—';
    return (v * 100).toFixed(2) + '%';
}

function renderCampaigns(list) {
    const el    = document.getElementById('campaign-list');
    const empty = document.getElementById('empty');
    if (!list.length) { el.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    el.innerHTML = list.map((c, i) => {
        const t   = getType(c.campaign.name);
        const st  = getStatus(c.campaign.status);
        const spend  = fmtSpend(c.metrics?.costMicros);
        const impr   = fmtNum(c.metrics?.impressions);
        const clicks = fmtNum(c.metrics?.clicks);
        const ctr    = fmtCTR(c.metrics?.ctr);

        return `
        <div class="campaign-row" style="animation-delay:${i * 25}ms">
            <div class="cell-num">${String(i+1).padStart(2,'0')}</div>
            <div class="cell-name">
                <div class="name-main" title="${c.campaign.name}">${c.campaign.name}</div>
                <div class="name-id">${c.campaign.id}</div>
            </div>
            <div><span class="badge ${t.cls}"><span class="badge-dot"></span>${t.label}</span></div>
            <div class="cell-metric spend">
                ${spend}
                <div class="metric-sub">${st.label ? `<span class="status-pill ${st.cls}">${st.label}</span>` : ''}</div>
            </div>
            <div class="cell-metric">${impr}</div>
            <div class="cell-metric col-clicks">${clicks}</div>
            <div class="cell-metric right col-ctr">${ctr}</div>
        </div>`;
    }).join('');
}

function filterCampaigns(q) {
    q = q.toLowerCase();
    const f = allCampaigns.filter(c =>
        c.campaign.name.toLowerCase().includes(q) || c.campaign.id.includes(q)
    );
    document.getElementById('count-chip').textContent = f.length;
    renderCampaigns(f);
}

function showLoading(state) {
    document.getElementById('loading').style.display     = state ? 'flex' : 'none';
    document.getElementById('table-inner').style.display = state ? 'none' : 'block';
    document.getElementById('error-box').style.display   = 'none';
}
function showError(msg) {
    document.getElementById('loading').style.display     = 'none';
    document.getElementById('table-inner').style.display = 'none';
    document.getElementById('error-box').style.display   = 'flex';
    document.getElementById('error-msg').textContent     =
        typeof msg === 'object' ? JSON.stringify(msg) : msg;
}
