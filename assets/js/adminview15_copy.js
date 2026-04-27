/* ══════════════════════════════════════════════
   ADMIN VIEW JS — Amazon/Flipkart multi-select filters
   ══════════════════════════════════════════════ */

const API = 'https://americanssupport.org/gads/api';
const token = localStorage.getItem('sessionToken');
const adminEmail = localStorage.getItem('adminEmail') || '';

const authH = () => ({ 'x-session-token': token });

// ── State ──────────────────────────────────────
let allCampaigns = [];   // raw data from API (merged across selected customers)
let filteredCampaigns = [];   // after status + search filters
let allAccounts = [];
let allCustomers = [];   // full customer list for active account

let activeUserId = null;
let activeAccountIdx = 0;     // index in allAccounts currently selected

// Multi-select state
let selectedCustomerIds = new Set(['__all__']); // '__all__' means every customer
let selectedStatuses = new Set(['ENABLED', 'PAUSED', 'REMOVED']); // all by default
let searchQuery = '';

// ── Helpers ────────────────────────────────────
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
function fmtCurrency(val) {
    return '$' + Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
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

function buildCampaignUrl(userId, customerId) {
    return `${API}/auth/ads-listing?userId=${userId}&customerId=${customerId}&dateRange=LAST_30_DAYS`;
}

// ── UI Helpers ─────────────────────────────────
function showLoading(state) {
    document.getElementById('loading').style.display = state ? 'flex' : 'none';
    document.getElementById('table-inner').style.display = state ? 'none' : 'block';
    document.getElementById('error-box').style.display = 'none';
}
function showError(msg) {
    showLoading(false);
    document.getElementById('error-box').style.display = 'flex';
    document.getElementById('error-msg').textContent =
        typeof msg === 'object' ? JSON.stringify(msg) : msg;
}
function clearAndRedirect() {
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('adminEmail');
    window.location.href = 'index.html';
}
function setAdminUI() {
    document.getElementById('admin-email').textContent = adminEmail || '—';
    document.getElementById('admin-avatar').textContent = adminEmail ? adminEmail[0].toUpperCase() : '?';
}

// ── Stats ──────────────────────────────────────
function renderStats(campaigns) {
    let spend = 0, impr = 0, clicks = 0, active = 0, revenue = 0;
    campaigns.forEach(c => {
        const m = c.metrics || {};
        spend += Number(m.costMicros || 0);
        impr += Number(m.impressions || 0);
        clicks += Number(m.clicks || 0);
        revenue += Number(m.conversionsValue || 0);
        if (c.campaign?.status === 'ENABLED') active++;
    });
    document.getElementById('stat-spend').textContent = fmtSpend(spend);
    document.getElementById('stat-impr').textContent = fmtNum(impr);
    document.getElementById('stat-clicks').textContent = fmtNum(clicks);
    document.getElementById('stat-active').textContent = active;
    const rev = document.getElementById('stat-revenue');
    if (rev) rev.textContent = fmtCurrency(revenue);
    document.getElementById('stat-total-sub').textContent = `of ${campaigns.length} total`;
}

// ── Campaign table ─────────────────────────────
function renderCampaigns(list) {
    const el = document.getElementById('campaign-list');
    const empty = document.getElementById('empty');
    if (!list.length) {
        el.innerHTML = '';
        empty.style.display = 'block';
        empty.textContent = 'No campaigns match the selected filters';
        return;
    }
    empty.style.display = 'none';
    el.innerHTML = list.map((c, i) => {
        const t = getType(c.campaign.name);
        const st = getStatus(c.campaign.status);
        const spend = fmtSpend(c.metrics?.costMicros);
        const impr = fmtNum(c.metrics?.impressions);
        const clicks = fmtNum(c.metrics?.clicks);
        const ctr = fmtCTR(c.metrics?.ctr);
        const cid = c._customerId || '—';
        return `
        <div class="campaign-row" style="animation-delay:${i * 18}ms">
            <div class="cell-num">${String(i + 1).padStart(2, '0')}</div>
            <div class="cell-name">
                <div class="name-main">${c.campaign.name}</div>
                <div class="name-id">${c.campaign.id}</div>
            </div>
            <div class="cell-cid">${cid}</div>
            <div><span class="badge ${t.cls}"><span class="badge-dot"></span>${t.label}</span></div>
            <div class="cell-metric spend">
                ${spend}
                <div class="metric-sub">
                    ${st.label ? `<span class="status-pill ${st.cls}">${st.label}</span>` : ''}
                </div>
            </div>
            <div class="cell-metric">${impr}</div>
            <div class="cell-metric col-clicks">${clicks}</div>
            <div class="cell-metric right col-ctr">${ctr}</div>
        </div>`;
    }).join('');
}

// ══════════════════════════════════════════════
//  FILTER LOGIC
// ══════════════════════════════════════════════

function applyFilters() {
    let data = [...allCampaigns];

    // Status filter (multi-select)
    if (selectedStatuses.size > 0 && selectedStatuses.size < 3) {
        data = data.filter(c => selectedStatuses.has((c.campaign?.status || '').toUpperCase()));
    }

    // Search filter
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        data = data.filter(c =>
            c.campaign.name.toLowerCase().includes(q) ||
            String(c.campaign.id).includes(q) ||
            String(c._customerId || '').includes(q)
        );
    }

    filteredCampaigns = data;
    renderStats(data);
    renderCampaigns(data);
    document.getElementById('count-chip').textContent = data.length;
    updateActiveFilterBar();
}

function onSearch(q) {
    searchQuery = q;
    applyFilters();
}

// ══════════════════════════════════════════════
//  ACTIVE FILTER COUNT BAR
// ══════════════════════════════════════════════

function updateActiveFilterBar() {
    let count = 0;

    // Count non-default filters:
    // Status: default is all 3 checked — if fewer, it's active
    if (selectedStatuses.size < 3) count += (3 - selectedStatuses.size);

    // Customer: if not "all", count selected customers
    if (!selectedCustomerIds.has('__all__')) count += selectedCustomerIds.size;

    // Search
    if (searchQuery.trim()) count++;

    const bar = document.getElementById('fp-active-bar');
    if (count > 0) {
        bar.style.display = 'block';
        document.getElementById('fp-active-count').textContent = count;
    } else {
        bar.style.display = 'none';
    }
}

// ══════════════════════════════════════════════
//  FETCH CAMPAIGNS
// ══════════════════════════════════════════════

async function loadCampaignsForSelectedCustomers() {
    showLoading(true);
    allCampaigns = [];

    // Determine which customer IDs to fetch
    let cidsToFetch = [];
    if (selectedCustomerIds.has('__all__')) {
        cidsToFetch = allCustomers.filter(c => c.status === 'success').map(c => c.id);
    } else {
        cidsToFetch = [...selectedCustomerIds];
    }

    if (!cidsToFetch.length) {
        showError('No valid Customer IDs available for this account.');
        return;
    }

    const results = [];

    await Promise.allSettled(
        cidsToFetch.map(cid =>
            fetch(buildCampaignUrl(activeUserId, cid), { headers: authH() })
                .then(async r => {
                    const data = await r.json();
                    if (!r.ok) throw data;
                    return { cid, data };
                })
                .then(({ cid, data }) => {
                    if (data.results?.length) {
                        data.results.forEach(c => { c._customerId = cid; });
                        results.push(...data.results);
                    }
                })
                .catch(err => {
                    console.warn(`Failed CID ${cid}:`, err);
                })
        )
    );

    allCampaigns = results;

    document.getElementById('meta-time').textContent =
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('footer-count').textContent = allCampaigns.length + ' records';

    showLoading(false);
    applyFilters();
}

// ══════════════════════════════════════════════
//  BUILD FILTER PANEL
// ══════════════════════════════════════════════

function buildAccountFilter(accounts) {
    const body = document.getElementById('fp-body-account');
    body.innerHTML = '';

    accounts.forEach((acc, idx) => {
        const label = acc.googleName || acc.googleEmail || 'Unknown Account';
        const row = document.createElement('label');
        row.className = 'fp-radio-row';
        row.innerHTML = `
            <input type="radio" name="fp-account" value="${acc.userId}" ${idx === 0 ? 'checked' : ''}>
            <span class="fp-radio-label">${label}</span>
        `;
        body.appendChild(row);
    });

    // Wire account radio changes
    body.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const acc = allAccounts.find(a => a.userId === radio.value);
            if (acc) selectAccount(acc);
        });
    });
}

function buildCustomerFilter(customers) {
    const body = document.getElementById('fp-body-customer');
    body.innerHTML = '';

    const validCustomers = customers.filter(c => c.status === 'success');

    if (!validCustomers.length) {
        body.innerHTML = '<div class="fp-loading-text">No valid customers found.</div>';
        return;
    }

    // "Select All" checkbox
    const allRow = document.createElement('label');
    allRow.className = 'fp-checkbox-row fp-select-all';
    allRow.innerHTML = `
        <input type="checkbox" id="fp-customer-all" ${selectedCustomerIds.has('__all__') ? 'checked' : ''}>
        <span class="fp-cb-box"></span>
        <span class="fp-cb-label">All Customers</span>
    `;
    body.appendChild(allRow);

    // Individual customer checkboxes
    validCustomers.forEach(c => {
        const displayName = c.name ? `${c.name}` : `CID: ${c.id}`;
        const row = document.createElement('label');
        row.className = 'fp-checkbox-row';
        row.innerHTML = `
            <input type="checkbox" class="fp-customer-cb" value="${c.id}"
                ${selectedCustomerIds.has('__all__') || selectedCustomerIds.has(c.id) ? 'checked' : ''}>
            <span class="fp-cb-box"></span>
            <span class="fp-cb-label">${displayName}<br>
                <span style="font-size:10px;color:var(--muted);font-weight:400;">${c.id}</span>
            </span>
        `;
        body.appendChild(row);
    });

    // ── Wire "All" checkbox ──
    const allCb = body.querySelector('#fp-customer-all');
    allCb.addEventListener('change', () => {
        const individualCbs = body.querySelectorAll('.fp-customer-cb');
        if (allCb.checked) {
            // Select all → check everything
            selectedCustomerIds = new Set(['__all__']);
            individualCbs.forEach(cb => { cb.checked = true; cb.disabled = true; });
        } else {
            // Deselect all → uncheck everything, enable individual
            selectedCustomerIds = new Set();
            individualCbs.forEach(cb => { cb.checked = false; cb.disabled = false; });
        }
        loadCampaignsForSelectedCustomers();
    });

    // ── Wire individual customer checkboxes ──
    body.querySelectorAll('.fp-customer-cb').forEach(cb => {
        // Disable individual checkboxes if "All" is active
        if (selectedCustomerIds.has('__all__')) cb.disabled = true;

        cb.addEventListener('change', () => {
            if (cb.checked) {
                selectedCustomerIds.add(cb.value);
            } else {
                selectedCustomerIds.delete(cb.value);
            }

            // If nothing selected, re-enable "All" as fallback
            if (selectedCustomerIds.size === 0) {
                selectedCustomerIds = new Set(['__all__']);
                allCb.checked = true;
                body.querySelectorAll('.fp-customer-cb').forEach(c => {
                    c.checked = true;
                    c.disabled = true;
                });
            } else {
                // Uncheck "All" since a specific one is selected
                allCb.checked = false;
            }

            loadCampaignsForSelectedCustomers();
        });
    });
}

// ── Wire status checkboxes ──
function wireStatusCheckboxes() {
    document.querySelectorAll('.fp-status-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                selectedStatuses.add(cb.value);
            } else {
                selectedStatuses.delete(cb.value);
                // Prevent deselecting all — keep at least one
                if (selectedStatuses.size === 0) {
                    cb.checked = true;
                    selectedStatuses.add(cb.value);
                }
            }
            applyFilters();
        });
    });
}

// ── Collapsible section headers ──
function wireCollapsibles() {
    document.querySelectorAll('.fp-section-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.closest('.fp-section');
            section.classList.toggle('collapsed');
        });
    });
}

// ── Clear all filters ──
document.getElementById('fp-clear-all').addEventListener('click', () => {
    // Reset statuses to all
    selectedStatuses = new Set(['ENABLED', 'PAUSED', 'REMOVED']);
    document.querySelectorAll('.fp-status-cb').forEach(cb => { cb.checked = true; });

    // Reset customers to all
    selectedCustomerIds = new Set(['__all__']);
    const allCb = document.getElementById('fp-customer-all');
    if (allCb) {
        allCb.checked = true;
        document.querySelectorAll('.fp-customer-cb').forEach(cb => {
            cb.checked = true;
            cb.disabled = true;
        });
    }

    // Reset search
    searchQuery = '';
    const searchInput = document.getElementById('search');
    if (searchInput) searchInput.value = '';

    loadCampaignsForSelectedCustomers();
});

// ══════════════════════════════════════════════
//  ACCOUNT SELECTION
// ══════════════════════════════════════════════

function selectAccount(acc) {
    activeUserId = acc.userId;

    // Reset customer state
    selectedCustomerIds = new Set(['__all__']);
    allCustomers = [];

    // Show loading in customer section
    const custBody = document.getElementById('fp-body-customer');
    custBody.innerHTML = '<div class="fp-loading-text">Loading customers…</div>';

    fetch(`${API}/auth/customers?userId=${activeUserId}`, { headers: authH() })
        .then(async r => {
            const data = await r.json();
            if (!r.ok) throw data;
            return data;
        })
        .then(data => {
            allCustomers = data.customers || [];
            if (!allCustomers.length) {
                custBody.innerHTML = '<div class="fp-loading-text">No customers found.</div>';
                return;
            }
            buildCustomerFilter(allCustomers);
            loadCampaignsForSelectedCustomers();
        })
        .catch(err => {
            const msg = err?.error || err?.message || 'Failed to load customers';
            custBody.innerHTML = `<div class="fp-loading-text" style="color:var(--red);">${msg}</div>`;
            showError(msg);
        });
}

// ══════════════════════════════════════════════
//  LOAD ALL ACCOUNTS
// ══════════════════════════════════════════════

function loadAllAccounts() {
    showLoading(true);
    fetch(`${API}/auth/accounts?adminEmail=${adminEmail}`, { headers: authH() })
        .then(r => { if (r.status === 401) { clearAndRedirect(); return null; } return r.json(); })
        .then(data => {
            if (!data) return;
            allAccounts = data.accounts || [];
            if (!allAccounts.length) {
                showError('No Google Ads accounts connected.');
                return;
            }
            buildAccountFilter(allAccounts);
            selectAccount(allAccounts[0]);
        })
        .catch(err => showError(err.message || 'Failed to load accounts'));
}

// ══════════════════════════════════════════════
//  AUTH GUARD
// ══════════════════════════════════════════════

const currentPage = window.location.pathname.split('/').pop();

// if (!token) {
//     window.location.href = 'index.html';
// } else {
//     let decoded;
//     try { decoded = jwtDecode(token); } catch (e) { window.location.href = 'index.html'; }

//     const isSuperAdmin = decoded && decoded.role === 'super_admin';

//     if (!isSuperAdmin && currentPage === 'adminview.html') {
//         window.location.href = 'dashboard.html';
//     }

//     document.getElementById('admin-view').style.display = isSuperAdmin ? 'flex' : 'none';
//     document.getElementById('usr-management').style.display = isSuperAdmin ? 'flex' : 'none';

//     fetch(`${API}/logincheck/me`, { headers: { 'x-session-token': token } })
//         .then(r => {
//             if (!r.ok) { clearAndRedirect(); return; }
//             document.body.classList.remove('auth-pending');
//             setAdminUI();
//             wireStatusCheckboxes();
//             wireCollapsibles();
//             loadAllAccounts();
//         })
//         .catch(() => {
//             document.body.classList.remove('auth-pending');
//             setAdminUI();
//             wireStatusCheckboxes();
//             wireCollapsibles();
//             loadAllAccounts();
//         });
// }

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
        if (currentPage === "accountaccess.html") {
            window.location.href = "dashboard.html";
        }

        if (currentPage === "usermanagement.html") {
            window.location.href = "dashboard.html";
        }

        if (currentPage === "adminview.html") {
            window.location.href = "dashboard.html";
        }
        document.body.classList.remove('auth-pending');
        document.getElementById("usr-management").style.display = "none";
        document.getElementById('admin-view').style.display = "none"
        fetch(`${API}/logincheck/me`, { headers: { 'x-session-token': token } })
            .then(r => {
                if (!r.ok) { clearAndRedirect(); return; }
                document.body.classList.remove('auth-pending');
                setAdminUI();
                wireStatusCheckboxes();
                wireCollapsibles();
                loadAllAccounts();
            })
            .catch(() => {
                document.body.classList.remove('auth-pending');
                setAdminUI();
                wireStatusCheckboxes();
                wireCollapsibles();
                loadAllAccounts();
            });
    } else {
        if (currentPage === "usermanagement.html") {
            document.getElementById("usr-management").style.display = "block";
            document.getElementById('admin-view').style.display = "block"
        }

        if (currentPage === "accountaccess.html") {
            document.getElementById("usr-management").style.display = "block";
            document.getElementById('admin-view').style.display = "block"
        }

        if (currentPage === "adminview.html") {
            document.getElementById("usr-management").style.display = "block";
            document.getElementById('admin-view').style.display = "block"
        }
        document.getElementById("usr-management").style.display = "block";
        document.getElementById('admin-view').style.display = "block"
        fetch(`${API}/logincheck/me`, { headers: { 'x-session-token': token } })
            .then(r => {
                if (!r.ok) { clearAndRedirect(); return; }
                document.body.classList.remove('auth-pending');
                setAdminUI();
                wireStatusCheckboxes();
                wireCollapsibles();
                loadAllAccounts();
            })
            .catch(() => {
                document.body.classList.remove('auth-pending');
                setAdminUI();
                wireStatusCheckboxes();
                wireCollapsibles();
                loadAllAccounts();
            });
    }

}

// ── Sidebar nav dropdown ────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('newsBreakToggle');
    const dropdown = toggle?.parentElement;
    toggle?.addEventListener('click', () => dropdown.classList.toggle('open'));

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        try { await fetch(`${API}/logincheck/logout`, { method: 'POST', headers: { 'x-session-token': token } }); } catch { }
        clearAndRedirect();
    });
});
