/* ══════════════════════════════════════════════
   ADMIN VIEW JS
   Super admin  ·  Date range  ·  Multi-select
   Account & Customer dropdowns  ·  Campaign modal
   ══════════════════════════════════════════════ */

const API = 'https://americanssupport.org/gads/api';
const token = localStorage.getItem('sessionToken');
const adminEmail = localStorage.getItem('adminEmail') || '';
const authH = () => ({ 'x-session-token': token });

/* ══════════════════════════════════════════════
   SESSION EXPIRY — global handler for adminview
   ══════════════════════════════════════════════ */
function handleSessionExpiry() {
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('adminEmail');
    // Hide all page content
    const main   = document.querySelector('.main');
    const layout = document.querySelector('.layout');
    if (main)   main.style.display   = 'none';
    if (layout) layout.style.display = 'none';
    const modal = document.getElementById('campaign-modal');
    if (modal) modal.style.display = 'none';

    const toast = document.createElement('div');
    toast.style.cssText = [
        'position:fixed','inset:0','display:flex','align-items:center',
        'justify-content:center','background:rgba(0,0,0,0.6)',
        'z-index:9999','color:#fff','font-size:16px','font-weight:600',
        'font-family:sans-serif','flex-direction:column','gap:10px'
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

async function secureFetch(url, options = {}) {
    const res = await fetch(url, options);
    if (res.status === 401) { handleSessionExpiry(); return { ok: false, status: 401, json: async () => ({}) }; }
    if (!res.ok) {
        try {
            const clone = res.clone();
            const body  = await clone.json();
            const msg   = (body?.message || body?.error || '').toLowerCase();
            if (msg.includes('session') && (msg.includes('expire') || msg.includes('invalid'))) {
                handleSessionExpiry();
                return { ok: false, status: res.status, json: async () => ({}) };
            }
        } catch (_) {}
    }
    return res;
}

/* Inject CSS for disabled dropdown items (error customers) */
(function() {
    const s = document.createElement('style');
    s.textContent = `
    .ms-option-disabled { opacity: 0.72; cursor: default !important; }
    .ms-option-disabled:hover { background: transparent !important; }
    .ms-option-disabled .ms-cb { opacity: 0; }
    `;
    document.head.appendChild(s);
})();

// ── State ──────────────────────────────────────────────────────────
let allCampaigns = [];
let allAccounts = [];   // every account visible to super admin
let allCustomers = [];   // customers for ALL currently-selected accounts (merged)

// Multi-select state
let selectedAccountIds = new Set(['__all__']);   // __all__ = every account
let selectedCustomerIds = new Set(['__all__']);   // __all__ = every customer
let selectedStatuses = new Set(['ENABLED', 'PAUSED', 'REMOVED']);
let searchQuery = '';

// Date range state
let activeDateRange = 'LAST_30_DAYS';
let activeStartDate = '';
let activeEndDate = '';

// Modal state
let modalCampaignId = null;
let modalUserId = null;
let modalCustomerId = null;


/* ══════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════ */
const fmtSpend = m => {
    if (!m && m !== 0) return '—';
    const d = m / 1_000_000;
    return d >= 1000 ? '$' + (d / 1000).toFixed(1) + 'k' : '$' + d.toFixed(2);
};
const fmtNum = n => {
    if (!n && n !== 0) return '—';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
    return String(n);
};
const fmtCTR = v => (!v && v !== 0) ? '—' : (v * 100).toFixed(2) + '%';
const fmtCurrency = v => '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    let url = `${API}/auth/ads-listing?userId=${userId}&customerId=${customerId}&dateRange=${activeDateRange}`;
    if (activeDateRange === 'CUSTOM' && activeStartDate && activeEndDate) {
        url += `&startDate=${activeStartDate}&endDate=${activeEndDate}`;
    }
    return url;
}

/* ── UI helpers ── */
function showLoading(on) {
    document.getElementById('loading').style.display = on ? 'flex' : 'none';
    document.getElementById('table-inner').style.display = on ? 'none' : 'block';
    document.getElementById('error-box').style.display = 'none';
}
function showError(msg) {
    showLoading(false);
    document.getElementById('error-box').style.display = 'flex';
    document.getElementById('error-msg').textContent =
        typeof msg === 'object' ? JSON.stringify(msg) : msg;
}

/* Show "please select a filter" state — used when account or customer set is empty */
function showNoFilterMessage() {
    allCampaigns = [];
    // Hide spinner / error, show table area
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error-box').style.display = 'none';
    document.getElementById('table-inner').style.display = 'block';

    const el    = document.getElementById('campaign-list');
    const empty = document.getElementById('empty');
    el.innerHTML = '';
    empty.style.display = 'block';
    empty.innerHTML = `
        <div style="text-align:center;padding:48px 20px;">
            <div style="font-size:36px;margin-bottom:12px;">🔍</div>
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px;">No filters selected</div>
            <div style="font-size:13px;color:var(--muted);">Please select a filter to view campaigns</div>
        </div>`;

    // Reset stats to zero
    renderStats([]);
    document.getElementById('count-chip').textContent = '0';
    updateActiveBar();
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

function updatePeriodChip() {
    const labels = {
        TODAY: 'Today', LAST_7_DAYS: 'Last 7 Days', LAST_14_DAYS: 'Last 14 Days',
        LAST_30_DAYS: 'Last 30 Days', THIS_MONTH: 'This Month', LAST_MONTH: 'Last Month'
    };
    const text = activeDateRange === 'CUSTOM' && activeStartDate && activeEndDate
        ? `${activeStartDate} → ${activeEndDate}`
        : (labels[activeDateRange] || activeDateRange);

    const chip = document.getElementById('period-chip');
    if (chip) chip.textContent = text;
    const mr = document.getElementById('meta-range');
    if (mr) mr.textContent = text;
    const sub = document.getElementById('stat-spend-sub');
    if (sub) sub.textContent = text;
}


/* ══════════════════════════════════════════════
   DATE FILTER BAR
   ══════════════════════════════════════════════ */
document.querySelectorAll('.dfb-btn:not(#dfb-custom-btn)').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.dfb-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeDateRange = btn.dataset.range;
        activeStartDate = '';
        activeEndDate = '';
        document.getElementById('dfb-custom-panel').classList.remove('open');
        updatePeriodChip();
        if (allAccounts.length) triggerReload();
    });
});

document.getElementById('dfb-custom-btn').addEventListener('click', () => {
    document.querySelectorAll('.dfb-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('dfb-custom-btn').classList.add('active');
    const panel = document.getElementById('dfb-custom-panel');
    panel.classList.toggle('open');
});

document.getElementById('dfb-apply').addEventListener('click', () => {
    const s = document.getElementById('date-start').value;
    const e = document.getElementById('date-end').value;
    if (!s || !e) { alert('Please select both From and To dates.'); return; }
    if (s > e) { alert('Start date must be before end date.'); return; }
    activeDateRange = 'CUSTOM';
    activeStartDate = s;
    activeEndDate = e;
    updatePeriodChip();
    triggerReload();
});

// Max date = today
const todayStr = new Date().toISOString().split('T')[0];
['date-start', 'date-end'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.max = todayStr;
});


/* ══════════════════════════════════════════════
   MULTI-SELECT DROPDOWN  (reusable factory)
   ══════════════════════════════════════════════ */

/**
 * Build a multi-select dropdown inside a container element.
 * @param {HTMLElement} container   - Where to render
 * @param {Array}       items       - [{ value, label, sub }]
 * @param {Set}         selectedSet - Mutable Set that this widget reads/writes
 * @param {Function}    onChange    - Called after selection changes
 * @param {string}      placeholder - Trigger button default label
 */
function buildCustomerMultiSelect(container, items, selectedSet, onChange, placeholder) {
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'ms-dropdown';

    // ── Trigger button ──
    const trigger = document.createElement('button');
    trigger.className = 'ms-trigger';
    trigger.type = 'button';
    trigger.innerHTML = `
        <span class="ms-trigger-label">${placeholder}</span>
        <span class="ms-trigger-count"></span>
        <span class="ms-chevron-icon">▾</span>
    `;

    // ── Panel ──
    const panel = document.createElement('div');
    panel.className = 'ms-panel';
    panel.innerHTML = `
        <div class="ms-search-wrap">
            <input class="ms-search-input" type="text" placeholder="Search…" />
        </div>
        <div class="ms-options"></div>
    `;

    wrapper.appendChild(trigger);
    wrapper.appendChild(panel);
    container.appendChild(wrapper);

    const labelEl = trigger.querySelector('.ms-trigger-label');
    const countEl = trigger.querySelector('.ms-trigger-count');
    const searchEl = panel.querySelector('.ms-search-input');
    const optsList = panel.querySelector('.ms-options');

    // ── Render options ──
    function renderOptions(filterText) {
        optsList.innerHTML = '';

        // "All" row
        const allOpt = document.createElement('div');
        allOpt.className = 'ms-option select-all-opt' + (selectedSet.has('__all__') ? ' checked' : '');
        allOpt.innerHTML = `<span class="ms-cb"></span><span class="ms-option-text">All</span>`;
        allOpt.addEventListener('click', e => {
            e.stopPropagation();
            if (selectedSet.has('__all__')) {
                // Currently all → uncheck all (allow truly empty)
                selectedSet.clear();
            } else {
                // Partial/empty → select all
                selectedSet.clear();
                selectedSet.add('__all__');
            }
            refreshTrigger();
            renderOptions(searchEl.value);
            onChange();
        });
        optsList.appendChild(allOpt);

        const filtered = filterText
            ? items.filter(i =>
                i.label.toLowerCase().includes(filterText.toLowerCase()) ||
                (i.sub || '').toLowerCase().includes(filterText.toLowerCase()))
            : items;

        if (!filtered.length) {
            const noRes = document.createElement('div');
            noRes.className = 'ms-no-results';
            noRes.textContent = 'No results';
            optsList.appendChild(noRes);
            return;
        }

        filtered.forEach(item => {
            const isDisabled = !!item.disabled;
            const isChecked  = !isDisabled && (selectedSet.has('__all__') || selectedSet.has(item.value));
            const opt = document.createElement('div');
            opt.className = 'ms-option' + (isChecked ? ' checked' : '') + (isDisabled ? ' ms-option-disabled' : '');
            opt.dataset.value = item.value;
            opt.innerHTML = `
                <span class="ms-cb"></span>
                <span class="ms-option-text">
                    ${item.label}
                    ${item.sub ? `<span class="ms-option-sub" style="${isDisabled ? 'color:#ef4444;' : ''}">${item.sub}</span>` : ''}
                </span>
            `;
            if (!isDisabled) {
                opt.addEventListener('click', e => {
                    e.stopPropagation();
                    if (selectedSet.has('__all__')) {
                        selectedSet.clear();
                        items.filter(i => !i.disabled).forEach(i => selectedSet.add(i.value));
                        selectedSet.delete(item.value);
                    } else {
                        if (selectedSet.has(item.value)) {
                            selectedSet.delete(item.value);
                        } else {
                            selectedSet.add(item.value);
                            const nonDisabledCount = items.filter(i => !i.disabled).length;
                            if (selectedSet.size === nonDisabledCount) {
                                selectedSet.clear();
                                selectedSet.add('__all__');
                            }
                        }
                    }
                    refreshTrigger();
                    renderOptions(searchEl.value);
                    onChange();
                });
            }
            optsList.appendChild(opt);
        });
    }

    function refreshTrigger() {
        if (selectedSet.has('__all__')) {
            labelEl.textContent = `All (${items.length})`;
            countEl.textContent = '';
            countEl.classList.remove('visible');
        } else {
            const n = selectedSet.size;
            labelEl.textContent = n === 1
                ? (items.find(i => i.value === [...selectedSet][0])?.label || '1 selected')
                : `${n} selected`;
            countEl.textContent = n;
            countEl.classList.add('visible');
        }
    }

    // ── Search ──
    searchEl.addEventListener('input', e => renderOptions(e.target.value));
    searchEl.addEventListener('click', e => e.stopPropagation());

    // ── Toggle open/close ──
    trigger.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = panel.classList.contains('open');
        // Close all other panels first
        document.querySelectorAll('.ms-panel.open').forEach(p => {
            p.classList.remove('open');
            p.closest('.ms-dropdown')?.querySelector('.ms-trigger')?.classList.remove('open');
        });
        if (!isOpen) {
            // Position panel using fixed coords relative to the trigger button
            const rect = trigger.getBoundingClientRect();
            // panel.style.top  = (rect.bottom + 4) + 'px';
            panel.style.top = '199.5px';
            // panel.style.left = rect.left + 'px';
            panel.style.left = '13px';
            panel.style.width = Math.max(rect.width, 222) + 'px';
            panel.classList.add('open');
            trigger.classList.add('open');
            searchEl.value = '';
            renderOptions('');
        }
    });

    // Close on outside click
    document.addEventListener('click', () => {
        panel.classList.remove('open');
        trigger.classList.remove('open');
    });

    // Initial render
    renderOptions('');
    refreshTrigger();

    // Expose a refresh method so JS can update the widget externally
    wrapper._refresh = () => { renderOptions(searchEl.value); refreshTrigger(); };
    wrapper._setItems = (newItems) => {
        items.length = 0;
        newItems.forEach(i => items.push(i));
        renderOptions(searchEl.value);
        refreshTrigger();
    };

    return wrapper;
}

/**
 * Build a multi-select dropdown inside a container element.
 * @param {HTMLElement} container   - Where to render
 * @param {Array}       items       - [{ value, label, sub }]
 * @param {Set}         selectedSet - Mutable Set that this widget reads/writes
 * @param {Function}    onChange    - Called after selection changes
 * @param {string}      placeholder - Trigger button default label
 */
function buildAccountsMultiSelect(container, items, selectedSet, onChange, placeholder) {
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'ms-dropdown';

    // ── Trigger button ──
    const trigger = document.createElement('button');
    trigger.className = 'ms-trigger';
    trigger.type = 'button';
    trigger.innerHTML = `
        <span class="ms-trigger-label">${placeholder}</span>
        <span class="ms-trigger-count"></span>
        <span class="ms-chevron-icon">▾</span>
    `;

    // ── Panel ──
    const panel = document.createElement('div');
    panel.className = 'ms-panel';
    panel.innerHTML = `
        <div class="ms-search-wrap">
            <input class="ms-search-input" type="text" placeholder="Search…" />
        </div>
        <div class="ms-options"></div>
    `;

    wrapper.appendChild(trigger);
    wrapper.appendChild(panel);
    container.appendChild(wrapper);

    const labelEl = trigger.querySelector('.ms-trigger-label');
    const countEl = trigger.querySelector('.ms-trigger-count');
    const searchEl = panel.querySelector('.ms-search-input');
    const optsList = panel.querySelector('.ms-options');

    // ── Render options ──
    function renderOptions(filterText) {
        optsList.innerHTML = '';

        // "All" row
        const allOpt = document.createElement('div');
        allOpt.className = 'ms-option select-all-opt' + (selectedSet.has('__all__') ? ' checked' : '');
        allOpt.innerHTML = `<span class="ms-cb"></span><span class="ms-option-text">All</span>`;
        allOpt.addEventListener('click', e => {
            e.stopPropagation();
            if (selectedSet.has('__all__')) {
                // Currently all → uncheck all (allow truly empty)
                selectedSet.clear();
            } else {
                // Partial/empty → select all
                selectedSet.clear();
                selectedSet.add('__all__');
            }
            refreshTrigger();
            renderOptions(searchEl.value);
            onChange();
        });
        optsList.appendChild(allOpt);

        const filtered = filterText
            ? items.filter(i =>
                i.label.toLowerCase().includes(filterText.toLowerCase()) ||
                (i.sub || '').toLowerCase().includes(filterText.toLowerCase()))
            : items;

        if (!filtered.length) {
            const noRes = document.createElement('div');
            noRes.className = 'ms-no-results';
            noRes.textContent = 'No results';
            optsList.appendChild(noRes);
            return;
        }

        filtered.forEach(item => {
            const isChecked = selectedSet.has('__all__') || selectedSet.has(item.value);
            const opt = document.createElement('div');
            opt.className = 'ms-option' + (isChecked ? ' checked' : '');
            opt.dataset.value = item.value;
            opt.innerHTML = `
                <span class="ms-cb"></span>
                <span class="ms-option-text">
                    ${item.label}
                    ${item.sub ? `<span class="ms-option-sub">${item.sub}</span>` : ''}
                </span>
            `;
            opt.addEventListener('click', e => {
                e.stopPropagation();
                if (selectedSet.has('__all__')) {
                    // Switch from "all" to individual
                    selectedSet.clear();
                    items.forEach(i => selectedSet.add(i.value)); // check all individually
                    selectedSet.delete(item.value); // uncheck clicked
                } else {
                    if (selectedSet.has(item.value)) {
                        selectedSet.delete(item.value);
                        // !! Allow empty — do NOT fall back to __all__
                    } else {
                        selectedSet.add(item.value);
                        // If all items are now checked, collapse back to __all__
                        if (selectedSet.size === items.length) {
                            selectedSet.clear();
                            selectedSet.add('__all__');
                        }
                    }
                }
                refreshTrigger();
                renderOptions(searchEl.value);
                onChange();
            });
            optsList.appendChild(opt);
        });
    }

    function refreshTrigger() {
        if (selectedSet.has('__all__')) {
            labelEl.textContent = `All (${items.length})`;
            countEl.textContent = '';
            countEl.classList.remove('visible');
        } else {
            const n = selectedSet.size;
            labelEl.textContent = n === 1
                ? (items.find(i => i.value === [...selectedSet][0])?.label || '1 selected')
                : `${n} selected`;
            countEl.textContent = n;
            countEl.classList.add('visible');
        }
    }

    // ── Search ──
    searchEl.addEventListener('input', e => renderOptions(e.target.value));
    searchEl.addEventListener('click', e => e.stopPropagation());

    // ── Toggle open/close ──
    trigger.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = panel.classList.contains('open');
        // Close all other panels first
        document.querySelectorAll('.ms-panel.open').forEach(p => {
            p.classList.remove('open');
            p.closest('.ms-dropdown')?.querySelector('.ms-trigger')?.classList.remove('open');
        });
        if (!isOpen) {
            // Position panel using fixed coords relative to the trigger button
            const rect = trigger.getBoundingClientRect();
            // panel.style.top  = (rect.bottom + 4) + 'px';
            panel.style.top = '113.5px';
            // panel.style.left = rect.left + 'px';
            panel.style.left = '13px';
            panel.style.width = Math.max(rect.width, 222) + 'px';
            panel.classList.add('open');
            trigger.classList.add('open');
            searchEl.value = '';
            renderOptions('');
        }
    });

    // Close on outside click
    document.addEventListener('click', () => {
        panel.classList.remove('open');
        trigger.classList.remove('open');
    });

    // Initial render
    renderOptions('');
    refreshTrigger();

    // Expose a refresh method so JS can update the widget externally
    wrapper._refresh = () => { renderOptions(searchEl.value); refreshTrigger(); };
    wrapper._setItems = (newItems) => {
        items.length = 0;
        newItems.forEach(i => items.push(i));
        renderOptions(searchEl.value);
        refreshTrigger();
    };

    return wrapper;
}


/* ══════════════════════════════════════════════
   STATS + TABLE RENDER
   ══════════════════════════════════════════════ */
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
        const uid = c._userId || '—';
        return `
        <div class="campaign-row" style="animation-delay:${i * 16}ms"
             onclick="openCampaignModal('${c.campaign.id}','${uid}','${cid}','${c.campaign.name}')">
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


/* ══════════════════════════════════════════════
   FILTER + SEARCH
   ══════════════════════════════════════════════ */
function applyFilters() {
    let data = [...allCampaigns];

    // Status
    if (selectedStatuses.size < 3) {
        data = data.filter(c => selectedStatuses.has((c.campaign?.status || '').toUpperCase()));
    }
    // Search
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        data = data.filter(c =>
            c.campaign.name.toLowerCase().includes(q) ||
            String(c.campaign.id).includes(q) ||
            String(c._customerId || '').includes(q)
        );
    }

    renderStats(data);
    renderCampaigns(data);
    document.getElementById('count-chip').textContent = data.length;
    updateActiveBar();
}

function onSearch(q) {
    searchQuery = q;
    applyFilters();
}

function updateActiveBar() {
    let n = 0;
    if (!selectedAccountIds.has('__all__')) n += selectedAccountIds.size;
    if (!selectedCustomerIds.has('__all__')) n += selectedCustomerIds.size;
    if (selectedStatuses.size < 3) n += (3 - selectedStatuses.size);
    if (searchQuery.trim()) n++;

    const bar = document.getElementById('fp-active-bar');
    bar.style.display = n ? 'block' : 'none';
    document.getElementById('fp-active-count').textContent = n;
}


/* ══════════════════════════════════════════════
   CAMPAIGN FETCH
   ══════════════════════════════════════════════ */
async function triggerReload() {
    // If no accounts or no customers are selected, show the "please select filter" message
    if (selectedAccountIds.size === 0 || selectedCustomerIds.size === 0) {
        showNoFilterMessage();
        return;
    }

    showLoading(true);
    allCampaigns = [];

    // Determine which (userId, customerId) pairs to fetch
    const pairs = [];

    // Which accounts?
    const accountsToUse = selectedAccountIds.has('__all__')
        ? allAccounts
        : allAccounts.filter(a => selectedAccountIds.has(a.userId));

    for (const acc of accountsToUse) {
        // Which customers for this account?
        const accCustomers = allCustomers.filter(c => c._userId === acc.userId);
        const validCustomers = accCustomers.filter(c => c.status === 'success');

        let cidsForThisAccount;
        if (selectedCustomerIds.has('__all__')) {
            cidsForThisAccount = validCustomers.map(c => c.id);
        } else {
            cidsForThisAccount = validCustomers
                .filter(c => selectedCustomerIds.has(c.id))
                .map(c => c.id);
        }

        cidsForThisAccount.forEach(cid => pairs.push({ userId: acc.userId, cid }));
    }

    if (!pairs.length) {
        showError('No valid Customer IDs available.');
        return;
    }

    const results = [];
    await Promise.allSettled(
        pairs.map(({ userId, cid }) =>
            fetch(buildCampaignUrl(userId, cid), { headers: authH() })
                .then(async r => {
                    const data = await r.json();
                    if (!r.ok) throw data;
                    return { userId, cid, data };
                })
                .then(({ userId, cid, data }) => {
                    if (data.results?.length) {
                        data.results.forEach(c => {
                            c._customerId = cid;
                            c._userId = userId;
                        });
                        results.push(...data.results);
                    }
                })
                .catch(err => console.warn(`Failed (userId=${userId}, cid=${cid}):`, err))
        )
    );

    allCampaigns = results;
    document.getElementById('meta-time').textContent =
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('footer-count').textContent = allCampaigns.length + ' records';
    showLoading(false);
    applyFilters();
}


/* ══════════════════════════════════════════════
   ACCOUNT + CUSTOMER MULTI-SELECT SETUP
   ══════════════════════════════════════════════ */

// Account items list (kept mutable for _setItems)
let accountItems = [];
let customerItems = [];
let acctWidget = null;
let custWidget = null;

function buildAccountDropdown(accounts) {
    accountItems = accounts.map(a => ({
        value: a.userId,
        label: a.googleName || a.googleEmail || 'Unknown',
        sub: a.googleEmail || ''
    }));

    const body = document.getElementById('fp-body-account');
    acctWidget = buildAccountsMultiSelect(
        body,
        accountItems,
        selectedAccountIds,
        onAccountFilterChange,
        'All Accounts'
    );
}

async function onAccountFilterChange() {
    // Which accounts are now selected?
    const selectedAccounts = selectedAccountIds.has('__all__')
        ? allAccounts
        : allAccounts.filter(a => selectedAccountIds.has(a.userId));

    // Reset customer selection
    selectedCustomerIds.clear();
    selectedCustomerIds.add('__all__');

    const body = document.getElementById('fp-body-customer');

    // If no accounts selected, clear customer filter and show message
    if (selectedAccounts.length === 0) {
        body.innerHTML = '<div class="fp-loading-text">Select an account first…</div>';
        allCustomers = [];
        custWidget = null;
        showNoFilterMessage();
        return;
    }

    body.innerHTML = '<div class="fp-loading-text">Loading customers…</div>';

    // Fetch customers for all newly-selected accounts in parallel (super admin: use customers-all)
    const freshCustomers = [];
    await Promise.allSettled(
        selectedAccounts.map(acc =>
            fetch(`${API}/auth/customers?userId=${acc.userId}`, { headers: authH() })
                .then(async r => {
                    const d = await r.json();
                    if (!r.ok) throw d;
                    return d;
                })
                .then(d => {
                    (d.customers || []).forEach(c => {
                        c._userId = acc.userId;
                        freshCustomers.push(c);
                    });
                })
                .catch(err => console.warn(`Customer fetch failed for ${acc.userId}:`, err))
        )
    );

    allCustomers = freshCustomers;
    buildCustomerDropdown(freshCustomers);
    triggerReload();
}

function buildCustomerDropdown(customers) {
    // Include ALL customers — valid ones are selectable, error ones show with ❌ and are disabled
    customerItems = customers.map(c => {
        if (c.status === 'error') {
            const errMsg = typeof c.error === 'string' ? c.error
                : c.error?.message || c.error?.error?.message || 'Google API error';
            return {
                value:    c.id,
                label:    `❌ ${c.name || c.id}`,
                sub:      errMsg,
                disabled: true
            };
        }
        return {
            value: c.id,
            label: c.name || `CID: ${c.id}`,
            sub:   c.id
        };
    });

    const body = document.getElementById('fp-body-customer');

    if (!customerItems.length) {
        body.innerHTML = '<div class="fp-loading-text">No valid customers found.</div>';
        custWidget = null;
        return;
    }

    custWidget = buildCustomerMultiSelect(
        body,
        customerItems,
        selectedCustomerIds,
        triggerReload,
        'All Customers'
    );
}


/* ══════════════════════════════════════════════
   STATUS CHECKBOXES
   ══════════════════════════════════════════════ */
function wireStatusCheckboxes() {
    document.querySelectorAll('.fp-status-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                selectedStatuses.add(cb.value);
            } else {
                selectedStatuses.delete(cb.value);
                if (selectedStatuses.size === 0) {
                    cb.checked = true;
                    selectedStatuses.add(cb.value);
                }
            }
            applyFilters();
        });
    });
}


/* ══════════════════════════════════════════════
   COLLAPSIBLE SECTIONS
   ══════════════════════════════════════════════ */
function wireCollapsibles() {
    document.querySelectorAll('.fp-section-header').forEach(h => {
        h.addEventListener('click', () => h.closest('.fp-section').classList.toggle('collapsed'));
    });
}


/* ══════════════════════════════════════════════
   CLEAR ALL
   ══════════════════════════════════════════════ */
document.getElementById('fp-clear-all').addEventListener('click', () => {
    // Statuses
    selectedStatuses.clear();
    selectedStatuses.add('ENABLED');
    selectedStatuses.add('PAUSED');
    selectedStatuses.add('REMOVED');
    document.querySelectorAll('.fp-status-cb').forEach(cb => cb.checked = true);

    // Accounts
    selectedAccountIds.clear();
    selectedAccountIds.add('__all__');
    if (acctWidget) acctWidget._refresh?.();

    // Customers
    selectedCustomerIds.clear();
    selectedCustomerIds.add('__all__');
    if (custWidget) custWidget._refresh?.();

    // Search
    searchQuery = '';
    document.getElementById('search').value = '';

    triggerReload();
});


/* ══════════════════════════════════════════════
   CAMPAIGN MODAL
   ══════════════════════════════════════════════ */
function openCampaignModal(campaignId, userId, customerId, campaignName) {
    modalCampaignId = campaignId;
    modalUserId = userId;
    modalCustomerId = customerId;

    const modal = document.getElementById('campaign-modal');
    const body = document.getElementById('modal-body');
    //const footer = document.getElementById('modal-footer');
    document.getElementById('modal-title').textContent = campaignName || 'Campaign Details';
    body.innerHTML = `
        <div class="modal-loading">
            <div class="spinner"></div>
            <span>Loading campaign…</span>
        </div>`;
    //footer.style.display = 'none';
    modal.style.display = 'flex';

    fetch(`${API}/auth/single-campaign?campaignId=${campaignId}&userId=${userId}&customerId=${customerId}`, {
        headers: authH()
    })
        .then(r => r.json())
        .then(data => renderModalBody(data))
        .catch(() => {
            body.innerHTML = `<div style="color:var(--red);padding:16px 0;">Failed to load campaign details.</div>`;
        });
}

function renderModalBody(data) {
    const c = data.results?.[0];
    //const footer = document.getElementById('modal-footer');
    if (!c) return;

    const body = document.getElementById('modal-body');

    body.innerHTML = `
    <div class="form-group">
        <label>Name:</label>
         <input type="text" value="${c.campaign.name}" id="editcampname">
    </div>

    <div class="form-group">
        <label>Budget:</label>
        <input type="text" value="$${c.campaignBudget?.amountMicros || 'N/A'}" id="editcampname">
    </div>

    <div class="form-group">
        <label>Status:</label>
        <select id="update-status">
            <option value="ENABLED" ${c.campaign.status === 'ENABLED' ? 'selected' : ''}>Enabled</option>
            <option value="PAUSED" ${c.campaign.status === 'PAUSED' ? 'selected' : ''}>Paused</option>
        </select>
    </div>
    `;
    //footer.style.display = 'flex';
}

// function renderModalBody(data) {
//     const c = data.results?.[0];
//     const body   = document.getElementById('modal-body');
//     const footer = document.getElementById('modal-footer');

//     if (!c) {
//         body.innerHTML = '<div style="color:var(--muted);padding:12px 0;">No data returned.</div>';
//         return;
//     }

//     const m  = c.metrics || {};
//     const st = getStatus(c.campaign?.status);
//     const budget = c.campaignBudget?.amountMicros
//         ? '$' + (c.campaignBudget.amountMicros / 1_000_000).toFixed(2)
//         : 'N/A';

//     body.innerHTML = `
//         <!-- Metrics grid -->
//         <div class="modal-meta-grid">
//             <div class="modal-meta-item">
//                 <div class="modal-meta-label">Spend</div>
//                 <div class="modal-meta-value blue">${fmtSpend(m.costMicros)}</div>
//             </div>
//             <div class="modal-meta-item">
//                 <div class="modal-meta-label">Status</div>
//                 <div class="modal-meta-value">
//                     <span class="status-pill ${st.cls}">${st.label}</span>
//                 </div>
//             </div>
//             <div class="modal-meta-item">
//                 <div class="modal-meta-label">Impressions</div>
//                 <div class="modal-meta-value">${fmtNum(m.impressions)}</div>
//             </div>
//             <div class="modal-meta-item">
//                 <div class="modal-meta-label">Clicks</div>
//                 <div class="modal-meta-value">${fmtNum(m.clicks)}</div>
//             </div>
//             <div class="modal-meta-item">
//                 <div class="modal-meta-label">CTR</div>
//                 <div class="modal-meta-value">${fmtCTR(m.ctr)}</div>
//             </div>
//             <div class="modal-meta-item">
//                 <div class="modal-meta-label">Budget</div>
//                 <div class="modal-meta-value green">${budget}</div>
//             </div>
//         </div>

//         <!-- Editable fields -->
//         <div class="modal-form-group">
//             <label>Campaign Name</label>
//             <input type="text" id="modal-camp-name" value="${c.campaign?.name || ''}" />
//         </div>
//         <div class="modal-form-group">
//             <label>Daily Budget</label>
//             <input type="text" id="modal-camp-budget" value="${budget}" />
//         </div>
//         <div class="modal-form-group">
//             <label>Status</label>
//             <select id="modal-camp-status">
//                 <option value="ENABLED"  ${c.campaign?.status === 'ENABLED'  ? 'selected' : ''}>✅ Active</option>
//                 <option value="PAUSED"   ${c.campaign?.status === 'PAUSED'   ? 'selected' : ''}>⏸️ Paused</option>
//                 <option value="REMOVED"  ${c.campaign?.status === 'REMOVED'  ? 'selected' : ''}>🗑️ Removed</option>
//             </select>
//         </div>
//     `;

//     footer.style.display = 'flex';
// }

// Update campaign
document.getElementById('modal-update-btn').addEventListener('click', () => {
    const status = document.getElementById('modal-camp-status')?.value;
    if (!status || !modalCampaignId) return;

    fetch(`${API}/auth/update-campaign`, {
        method: 'POST',
        headers: { ...authH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: modalCampaignId, status })
    })
        .then(r => r.json())
        .then(() => {
            closeModal();
            triggerReload();
        })
        .catch(() => alert('Update failed. Please try again.'));
});

// Close modal
function closeModal() {
    document.getElementById('campaign-modal').style.display = 'none';
    modalCampaignId = null;
}

document.getElementById('modal-close-btn').addEventListener('click', closeModal);
document.getElementById('campaign-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('campaign-modal')) closeModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });


/* ══════════════════════════════════════════════
   LOAD ALL ACCOUNTS  (super admin — global access)
   ══════════════════════════════════════════════ */
async function loadAllAccounts() {
    showLoading(true);
    try {
        // Super admin: fetch all accounts — backend handles role-based filtering
        const r = await secureFetch(`${API}/auth/accounts?adminEmail=${adminEmail}&superAdmin=true`, { headers: authH() });
        if (r.status === 401) { return; } // handleSessionExpiry already called
        const data = await r.json();
        allAccounts = data.accounts || [];

        if (!allAccounts.length) { showError('No Google Ads accounts found.'); return; }

        buildAccountDropdown(allAccounts);

        // Fetch customers for ALL accounts in parallel (global access — use usermgmt endpoint
        // which reads oauthUser.customerIds directly, bypassing customerAccess intersection)
        const allCust = [];
        await Promise.allSettled(
            allAccounts.map(acc =>
                fetch(`${API}/auth/customers?userId=${acc.userId}`, { headers: authH() })
                    .then(async r2 => { const d = await r2.json(); if (!r2.ok) throw d; return d; })
                    .then(d => {
                        (d.customers || []).forEach(c => {
                            c._userId = acc.userId;
                            allCust.push(c);
                        });
                    })
                    .catch(err => console.warn(`Customers failed for ${acc.userId}:`, err))
            )
        );

        allCustomers = allCust;
        buildCustomerDropdown(allCust);
        triggerReload();

    } catch (err) {
        showError(err.message || 'Failed to load accounts');
    }
}


/* ══════════════════════════════════════════════
   AUTH GUARD
   ══════════════════════════════════════════════ */
const currentPage = window.location.pathname.split('/').pop();

if (!token) {
    window.location.href = 'index.html';
} else {
    let decoded;
    try { decoded = jwtDecode(token); } catch { window.location.href = 'index.html'; }

    const isSuperAdmin = decoded?.role === 'super_admin';

    // Only super admins can access this page
    if (!isSuperAdmin) { window.location.href = 'dashboard.html'; }

    // Show super-admin-only nav items
    document.getElementById('admin-view-link').style.display = 'flex';
    document.getElementById('usr-management').style.display = 'flex';

    secureFetch(`${API}/logincheck/me`, { headers: { 'x-session-token': token } })
        .then(r => { if (!r.ok) { clearAndRedirect(); return; } bootstrap(); })
        .catch(() => bootstrap());
}

function bootstrap() {
    document.body.classList.remove('auth-pending');
    setAdminUI();
    wireStatusCheckboxes();
    wireCollapsibles();
    updatePeriodChip();
    loadAllAccounts();
}


/* ── Sidebar nav dropdown + logout ── */
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('newsBreakToggle');
    const dropdown = toggle?.parentElement;
    toggle?.addEventListener('click', () => dropdown.classList.toggle('open'));

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        try {
            await fetch(`${API}/logincheck/logout`, { method: 'POST', headers: { 'x-session-token': token } });
        } catch { }
        clearAndRedirect();
    });
});
