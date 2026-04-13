const API = 'https://americanssupport.org/gads/api';
const token = localStorage.getItem('sessionToken');
const adminEmail = localStorage.getItem('adminEmail') || '';

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

const authH = () => ({ 'x-session-token': token });

async function loadAccounts() {
    const res = await fetch(`${API}/auth/oauth/list`, { method: 'GET', headers: authH() });
    const data = await res.json();

    const container = document.getElementById('userList');
    document.getElementById('count-chip').textContent = data.allUserIds.length

    data.allUserIds.forEach(async userId => {
        const oauthuser_res = await fetch(`${API}/auth/get-oauth-name?userId=${userId}`, { method: 'GET', headers: authH() });
        const oauthuser_data = await oauthuser_res.json();
        const div = document.createElement('div');
        div.className = 'user-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = userId;

        if (data.selectedUserIds.includes(userId)) {
            checkbox.checked = true;
        }

        checkbox.addEventListener('change', async (e) => {
            if (e.target.checked) {
                await fetch(`${API}/auth/oauth/add`, {
                    method: 'POST',
                    headers: {
                        ...authH(),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ userId })
                });
            } else {
                await fetch(`${API}/auth/oauth/remove`, {
                    method: 'POST',
                    headers: {
                        ...authH(),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ userId })
                });
            }
        });

        const label = document.createElement('label');
        label.innerText = oauthuser_data.data.googleName;

        div.appendChild(checkbox);
        div.appendChild(label);

        container.appendChild(div);
    });
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
        if (currentPage !== "accountaccess.html") {
            window.location.href = "accountaccess.html";
        }
        document.body.classList.remove('auth-pending');
        document.getElementById("usr-management").style.display = "none";
        fetch(`${API}/logincheck/me`, { headers: { 'x-session-token': token } })
            .then(r => {
                if (!r.ok) { clearAndRedirect(); return; }
                document.body.classList.remove('auth-pending');
                Promise.all([loadAccounts(), setAdminUI()]);
            })
            .catch(() => {
                document.body.classList.remove('auth-pending');
                Promise.all([loadAccounts(), setAdminUI()]);
            });
    } else {
        // window.location.href = 'accountmanagement.html';
        if (currentPage === "usermanagement.html") {
            // window.location.href = 'dashboard.html';
            document.getElementById("usr-management").style.display = "block";
        }
        fetch(`${API}/logincheck/me`, { headers: { 'x-session-token': token } })
            .then(r => {
                if (!r.ok) { clearAndRedirect(); return; }
                document.body.classList.remove('auth-pending');
                Promise.all([loadAccounts(), setAdminUI()]);
            })
            .catch(() => {
                document.body.classList.remove('auth-pending');
                Promise.all([loadAccounts(), setAdminUI()]);
            });
    }

}

async function saveAccounts() {
    await fetch("/auth/update-access-accounts", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            accessAccounts: Array.from(selectedAccounts)
        })
    });

    alert("Saved successfully!");
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

document.getElementById('btn-logout')?.addEventListener('click', async () => {
    try { await fetch(`${API}/logincheck/logout`, { method: 'POST', headers: { 'x-session-token': token } }); } catch { }
    clearAndRedirect();
});