const API = 'https://americanssupport.org/gads/api';
const token = localStorage.getItem('sessionToken');
const adminEmail = localStorage.getItem('adminEmail') || '';

// ✅ BULK STATE
let selectedUsers = new Set();
let selectedAdmins = new Set();

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

const authH = () => ({ 'x-session-token': token });

function openModal(admin) {

    const modal = document.getElementById('adminModal');
    const body = document.getElementById('modalBody');
    const title = document.getElementById('modalTitle');

    title.innerText = `Edit Access - ${admin.fullname}`;
    body.innerHTML = '';

    GLOBAL_DATA.oauthUsers.forEach(user => {

        const row = document.createElement('div');
        row.className = 'account-row';

        const label = document.createElement('div');
        label.innerText = `${user.googleName} (${user.googleEmail})`;

        const toggle = document.createElement('label');
        toggle.className = 'switch';

        const input = document.createElement('input');
        input.type = 'checkbox';

        if (admin.accessUserIds?.includes(user.userId)) {
            input.checked = true;
        }

        const slider = document.createElement('span');
        slider.className = 'slider';

        input.addEventListener('change', async (e) => {

            const url = e.target.checked
                ? `${API}/auth/oauth/add`
                : `${API}/auth/oauth/remove`;

            try {
                await fetch(url, {
                    method: 'POST',
                    headers: {
                        ...authH(),
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        userId: user.userId,
                        adminId: admin._id
                    })
                });
            } catch (err) {
                console.error(err);
            }
        });

        toggle.appendChild(input);
        toggle.appendChild(slider);

        row.appendChild(label);
        row.appendChild(toggle);

        body.appendChild(row);
    });

    modal.style.display = 'flex';
}

document.getElementById('closeModal').onclick = closeModal;

function closeModal() {
    document.getElementById('adminModal').style.display = 'none';
}

/* CLOSE MODAL */
document.getElementById('closeModal').onclick = () => {
    document.getElementById('adminModal').style.display = 'none';
};

window.onclick = (e) => {
    const modal = document.getElementById('accessModal');
    if (e.target === modal) modal.style.display = 'none';
};

/* ===============================
   LOAD TABLE
================================= */
let GLOBAL_DATA = null;

async function loadAccounts() {
    const res = await fetch(`${API}/auth/access-matrix`, {
        headers: authH()
    });

    const data = await res.json();
    GLOBAL_DATA = data;

    const container = document.getElementById('userList');
    container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'admin-table';

    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Admin Name</th>
            <th>Email</th>
            <th>Action</th>
        </tr>
    `;

    const tbody = document.createElement('tbody');

    data.admins.forEach(admin => {

        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${admin.fullname}</td>
            <td>${admin.email || '-'}</td>
            <td>
                <button class="edit-btn">Edit Access</button>
            </td>
        `;

        tr.querySelector('.edit-btn').onclick = () => openModal(admin);

        tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    container.appendChild(table);
}

/* ===============================
   BULK ASSIGN
================================= */
async function bulkAssign() {

    if (!selectedUsers.size || !selectedAdmins.size) {
        alert("Select users and admins first");
        return;
    }

    try {
        const res = await fetch(`${API}/auth/oauth/bulk-assign`, {
            method: 'POST',
            headers: {
                ...authH(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userIds: Array.from(selectedUsers),
                adminIds: Array.from(selectedAdmins)
            })
        });

        const data = await res.json();
        console.log("Bulk result:", data);

        alert("Bulk assignment done ✅");

        selectedUsers.clear();
        selectedAdmins.clear();

        loadAccounts();

    } catch (err) {
        console.error(err);
    }
}

/* ===============================
   ADD BULK BUTTON
================================= */
function addBulkButton() {
    const toolbar = document.querySelector('.toolbar-left');

    const btn = document.createElement('button');
    btn.innerText = 'Bulk Assign';
    btn.onclick = bulkAssign;

    toolbar.appendChild(btn);
}

/* ===============================
   AUTH
================================= */
const currentPage = window.location.pathname.split("/").pop();

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
        document.getElementById("account-access").style.display = "none";
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
            document.getElementById("account-access").style.display = "block";
        }

        if (currentPage === "accountaccess.html") {
            // window.location.href = 'dashboard.html';
            document.getElementById("usr-management").style.display = "block";
            document.getElementById("account-access").style.display = "block";
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

/* ===============================
   UI EVENTS
================================= */
document.addEventListener("DOMContentLoaded", function () {
    const newsbreaktoggle = document.getElementById("newsBreakToggle");
    const newsbreakdropdown = newsbreaktoggle.parentElement;

    newsbreaktoggle.addEventListener("click", function () {
        newsbreakdropdown.classList.toggle("open");
    });
});

document.getElementById('btn-logout')?.addEventListener('click', async () => {
    try {
        await fetch(`${API}/logincheck/logout`, {
            method: 'POST',
            headers: authH()
        });
    } catch { }
    clearAndRedirect();
});