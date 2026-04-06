/* ── Dashboard JS — multi-account dropdown + date range filter ── */

const API = 'https://americanssupport.org/gads/api';
const token = localStorage.getItem('sessionToken');
const adminEmail = localStorage.getItem('adminEmail') || '';

let allCampaigns = [];
let filteredCampaigns = [];
let allAccounts = [];
let activeUserId = null;
let activeCustomerId = null;

// Current date filter state
let activeDateRange = 'LAST_30_DAYS';
let activeStartDate = '';
let activeEndDate = '';

const currentPage = window.location.pathname.split("/").pop();
// ── Auth guard ──────────────────────────────────────────────────────────────
if (!token) {
    if (currentPage !== "index.html") {
        window.location.href = "index.html";
    }
} else {

    let decoded;

    try {
        decoded = jwtDecode(token);
    } catch (e) {
        if (currentPage !== "index.html") {
            window.location.href = "index.html";
        }
    }

    if (decoded && decoded.role !== 'super_admin') {
        if (currentPage !== "dashboard.html") {
            window.location.href = "dashboard.html";
        }
        document.body.classList.remove('auth-pending');
        document.getElementById("usr-management").style.display = "none";
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
    } else if (decoded) {
        // window.location.href = 'dashboard.html';
        document.getElementById("usr-management").style.display = "block";
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

}

const authH = () => ({ 'x-session-token': token });

// ══════════════════════════════════════════════════
//  DATE FILTER
// ══════════════════════════════════════════════════

// Preset quick buttons
document.querySelectorAll('.date-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('date-custom-btn').classList.remove('active')
        btn.classList.add('active');
        activeDateRange = btn.dataset.range;
        activeStartDate = '';
        activeEndDate = '';
        // Hide custom picker
        document.getElementById('custom-range-wrap').style.display = 'none';
        updatePeriodChip();
        if (activeUserId && activeCustomerId) reloadCampaigns();
    });
});

// Custom range
const customBtn = document.getElementById('date-custom-btn');
if (customBtn) {
    customBtn.addEventListener('click', () => {
        document.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));
        customBtn.classList.add('active');
        activeDateRange = 'custom';
        document.getElementById('custom-range-wrap').style.display = 'flex';
    });
}

document.getElementById('apply-custom-range')?.addEventListener('click', () => {
    const s = document.getElementById('date-start').value;
    const e = document.getElementById('date-end').value;
    if (!s || !e) { alert('Please select both start and end dates.'); return; }
    if (s > e) { alert('Start date must be before end date.'); return; }
    activeStartDate = s;
    activeEndDate = e;
    updatePeriodChip();
    if (activeUserId && activeCustomerId) reloadCampaigns();
});

// Set default max date on date inputs to today
const today = new Date().toISOString().split('T')[0];
['date-start', 'date-end'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.max = today;
});

function updatePeriodChip() {
    const chip = document.getElementById('period-chip-label');
    if (!chip) return;
    if (activeDateRange === 'custom' && activeStartDate && activeEndDate) {
        chip.textContent = `${activeStartDate}  →  ${activeEndDate}`;
    } else {
        const labels = {
            'TODAY': 'Today',
            'LAST_7_DAYS': 'Last 7 Days',
            'LAST_14_DAYS': 'Last 14 Days',
            'LAST_30_DAYS': 'Last 30 Days',
            'LAST_90_DAYS': 'Last 90 Days',
            'THIS_MONTH': 'This Month',
            'LAST_MONTH': 'Last Month',
        };
        chip.textContent = labels[activeDateRange] || activeDateRange;
    }
    // Update the stat-spend-sub label too
    const sub = document.getElementById('stat-spend-sub');
    if (sub) sub.textContent = chip.textContent;
}

function buildCampaignUrl(userId, customerId) {
    let url = `${API}/auth/ads-listing?userId=${userId}&customerId=${customerId}&dateRange=${activeDateRange}`;
    if (activeDateRange === 'custom' && activeStartDate && activeEndDate) {
        url += `&startDate=${activeStartDate}&endDate=${activeEndDate}`;
    }
    return url;
}

function reloadCampaigns() {
    showLoading(true);
    loadCampaigns(activeUserId, activeCustomerId);
}

function setAdminUI() {
    document.getElementById('admin-email').textContent = adminEmail || '—';
    document.getElementById('admin-avatar').textContent = adminEmail ? adminEmail[0].toUpperCase() : '?';
}

// ══════════════════════════════════════════════════
//  ACCOUNTS
// ══════════════════════════════════════════════════

function loadAllAccounts() {
    showLoading(true);
    fetch(`${API}/auth/accounts`, { headers: authH() })
        .then(r => { if (r.status === 401) { clearAndRedirect(); return null; } return r.json(); })
        .then(data => {
            if (!data) return;
            allAccounts = data.accounts || [];
            if (!allAccounts.length) {
                showError('No Google Ads accounts connected. Go to Account Management to connect one.');
                return;
            }
            buildAccountDropdown(allAccounts);
            selectAccount(allAccounts[0]);
        })
        .catch(err => showError(err.message || 'Failed to load accounts'));
}

function buildAccountDropdown(accounts) {
    const sel = document.getElementById('account-select');
    sel.innerHTML = '';
    accounts.forEach(acc => {
        const label = acc.googleEmail || acc.googleName || acc.userId || 'Unknown Account';
        const opt = document.createElement('option');
        opt.value = acc.userId;
        opt.textContent = label;
        opt.dataset.cids = JSON.stringify(acc.customerIds || []);
        sel.appendChild(opt);
    });
}

document.getElementById('account-select').addEventListener('change', function () {
    const acc = allAccounts.find(a => a.userId === this.value);
    if (acc) selectAccount(acc);
});

function selectAccount(acc) {
    activeUserId = acc.userId;
    document.getElementById('account-select').value = acc.userId;
    showLoading(true);
    const cachedCids = acc.customerIds || [];
    if (cachedCids.length) {
        activeCustomerId = cachedCids[0];
        updateCidLabel(activeCustomerId);
        loadCampaigns(activeUserId, activeCustomerId);
    } else {
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

// ══════════════════════════════════════════════════
//  CAMPAIGNS
// ══════════════════════════════════════════════════

function loadCampaigns(userId, customerId) {
    const url = buildCampaignUrl(userId, customerId);
    fetch(url, { headers: authH() })
        .then(r => { if (r.status === 401) { clearAndRedirect(); return null; } return r.json(); })
        .then(data => {
            if (!data) return;
            if (data.error) throw new Error(data.error);
            allCampaigns = data.results || [];
            filteredCampaigns = allCampaigns;
            renderStats(allCampaigns);
            renderCampaigns(allCampaigns);
            document.getElementById('count-chip').textContent = allCampaigns.length;
            document.getElementById('footer-count').textContent = allCampaigns.length + ' records';
            document.getElementById('meta-time').textContent =
                new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            updatePeriodChip();
            showLoading(false);
        })
        .catch(err => showError(err.message || 'Failed to load campaigns'));
}

function fmtCurrency(val) {
    return '$' + Number(val).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// function renderStats(campaigns) {
//     let spend = 0, impr = 0, clicks = 0, active = 0;
//     campaigns.forEach(c => {
//         spend += Number(c.metrics?.costMicros || 0);
//         impr += Number(c.metrics?.impressions || 0);
//         clicks += Number(c.metrics?.clicks || 0);
//         if (c.campaign.status === 'ENABLED') active++;
//     });
//     document.getElementById('stat-spend').textContent = fmtSpend(spend);
//     document.getElementById('stat-impr').textContent = fmtNum(impr);
//     document.getElementById('stat-clicks').textContent = fmtNum(clicks);
//     document.getElementById('stat-active').textContent = active;
//     document.getElementById('stat-total-sub').textContent = `of ${campaigns.length} total`;
// }

function renderStats(campaigns) {
    let spend = 0, impr = 0, clicks = 0, active = 0, revenue = 0;

    campaigns.forEach(c => {
        const m = c.metrics || {};

        // Summing values - using Number() to handle strings/nulls
        spend += Number(m.costMicros || 0);
        impr += Number(m.impressions || 0);
        clicks += Number(m.clicks || 0);

        // Use conversionsValue (CamelCase as returned by API)
        // If it's missing from the JSON, it defaults to 0
        revenue += Number(m.conversionsValue || 0);

        if (c.campaign?.status === 'ENABLED') active++;
    });

    // Update the HTML elements
    document.getElementById('stat-spend').textContent = fmtSpend(spend);
    document.getElementById('stat-impr').textContent = fmtNum(impr);
    document.getElementById('stat-clicks').textContent = fmtNum(clicks);
    document.getElementById('stat-active').textContent = active;

    // NEW: Update the Revenue field
    const revenueEl = document.getElementById('stat-revenue');
    if (revenueEl) {
        revenueEl.textContent = fmtCurrency(revenue);
    }

    document.getElementById('stat-total-sub').textContent = `of ${campaigns.length} total`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getType(name) {
    const n = name.toUpperCase();
    if (n.includes('PMAX')) return { label: 'PMAX', cls: 'badge-pmax' };
    if (n.includes('TCPA')) return { label: 'TCPA', cls: 'badge-tcpa' };
    if (n.startsWith('M -')) return { label: 'MOBILE', cls: 'badge-mobile' };
    return { label: 'SEARCH', cls: 'badge-search' };
}
function getStatus(s) {
    if (!s) return { label: '—', cls: '' };
    const v = s.toUpperCase();
    if (v === 'ENABLED') return { label: 'ACTIVE', cls: 'status-enabled' };
    if (v === 'PAUSED') return { label: 'PAUSED', cls: 'status-paused' };
    if (v === 'REMOVED') return { label: 'REMOVED', cls: 'status-removed' };
    return { label: v, cls: '' };
}
function fmtSpend(m) {
    if (!m && m !== 0) return '—';
    const d = m / 1_000_000;
    if (d >= 1000) return '$' + (d / 1000).toFixed(1) + 'k';
    return '$' + d.toFixed(2);
}
function fmtNum(n) {
    if (!n && n !== 0) return '—';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
    return String(n);
}
function fmtCTR(v) {
    if (!v && v !== 0) return '—';
    return (v * 100).toFixed(2) + '%';
}

function renderCampaigns(list) {
    const el = document.getElementById('campaign-list');
    const empty = document.getElementById('empty');
    if (!list.length) { el.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    el.innerHTML = list.map((c, i) => {
        const t = getType(c.campaign.name);
        const st = getStatus(c.campaign.status);
        const spend = fmtSpend(c.metrics?.costMicros);
        const impr = fmtNum(c.metrics?.impressions);
        const clicks = fmtNum(c.metrics?.clicks);
        const ctr = fmtCTR(c.metrics?.ctr);
        return `
        <div class="campaign-row" style="animation-delay:${i * 22}ms">
            <div class="cell-num">${String(i + 1).padStart(2, '0')}</div>
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
    document.getElementById('loading').style.display = state ? 'flex' : 'none';
    document.getElementById('table-inner').style.display = state ? 'none' : 'block';
    document.getElementById('error-box').style.display = 'none';
}
function showError(msg) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('table-inner').style.display = 'none';
    document.getElementById('error-box').style.display = 'flex';
    document.getElementById('error-msg').textContent = typeof msg === 'object' ? JSON.stringify(msg) : "No Data Found";
}

function clearAndRedirect() {
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('adminEmail');
    window.location.href = 'index.html';
}

document.getElementById('btn-logout').addEventListener('click', async () => {
    try { await fetch(`${API}/logincheck/logout`, { method: 'POST', headers: { 'x-session-token': token } }); } catch { }
    clearAndRedirect();
});
