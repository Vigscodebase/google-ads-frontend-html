const API = 'https://americanssupport.org/gads/api';

// Skip login if already authenticated
const existingToken = localStorage.getItem('sessionToken');
if (existingToken) {
    fetch(`${API}/logincheck/me`, { headers: { 'x-session-token': existingToken } })
        .then(r => { if (r.ok) window.location.href = 'dashboard.html'; })
        .catch(() => {});
}

document.getElementById('toggle-pw').addEventListener('click', function () {
    const pw = document.getElementById('password');
    pw.type = pw.type === 'password' ? 'text' : 'password';
    this.style.color = pw.type === 'text' ? '#2563eb' : '';
});

function showError(msg) {
    document.getElementById('error-msg').textContent = msg;
    document.getElementById('alert-error').classList.add('show');
    document.getElementById('alert-ok').classList.remove('show');
}

async function doLogin() {
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btn      = document.getElementById('btn-login');

    if (!email || !password) { showError('Please enter your email and password.'); return; }

    btn.classList.add('loading'); btn.disabled = true;

    try {
        const res  = await fetch(`${API}/logincheck/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok) { showError(data.error || data.message || 'Login failed.'); return; }

        localStorage.setItem('sessionToken', data.token);
        localStorage.setItem('adminEmail',   data.email);

        document.getElementById('alert-ok').classList.add('show');
        document.getElementById('alert-error').classList.remove('show');
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);

    } catch { showError('Could not connect to server. Please try again.'); }
    finally  { btn.classList.remove('loading'); btn.disabled = false; }
}

document.getElementById('btn-login').addEventListener('click', doLogin);
['email', 'password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
});
