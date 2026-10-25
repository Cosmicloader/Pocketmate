PM.ready.then(() => {
  const $ = (id) => document.getElementById(id), si = $('signin-form'), su = $('signup-form'), f = si || su;
  const go = () => { const n = new URLSearchParams(location.search).get('next'); return n && /^(dashboard|expensemanager|reports|settings)\.html/.test(n) ? n : 'dashboard.html'; };
  if (PM.session() && PM.user()) { location.replace('dashboard.html'); return; }
  f.removeAttribute('action'); f.removeAttribute('method'); f.noValidate = false;
  const err = document.createElement('p'); err.className = 'status-message'; err.setAttribute('role', 'alert'); err.style.color = 'var(--coral)';
  f.querySelector('.submit-button').before(err);
  const btn = f.querySelector('.submit-button'), label = btn.innerHTML;
  if (si && new URLSearchParams(location.search).get('registered') === '1') { // arrived here straight after signing up
    err.style.color = 'var(--ok-ink, #0f7a5a)'; err.textContent = 'Account created successfully. Please sign in to continue.';
    const pf = sessionStorage.getItem('pm:v1:prefill'); sessionStorage.removeItem('pm:v1:prefill'); if (pf) $('signin-email').value = pf; $('signin-password').focus();
  }
  const busy = (b) => { btn.disabled = b; btn.innerHTML = b ? 'Please wait…' : label; };
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = ''; err.style.color = 'var(--coral)'; busy(true);
    try {
      if (si) { await PM.login($('signin-email').value, $('signin-password').value, $('signin-remember').checked); location.href = go(); }
      else {
        if ($('signup-password').value !== $('signup-confirm-password').value) throw new Error('Passwords do not match.');
        await PM.signup({ name: $('signup-name').value, email: $('signup-email').value, password: $('signup-password').value });
        sessionStorage.setItem('pm:v1:prefill', $('signup-email').value.trim().toLowerCase()); // remembered only to pre-fill the sign-in form
        location.href = 'signin.html?registered=1'; // account exists, but the user is NOT signed in yet
      }
    } catch (x) { err.textContent = x.message; busy(false); }
  });
  const demo = document.querySelector('.demo-credentials a');
  if (demo && si) demo.addEventListener('click', (e) => { e.preventDefault(); $('signin-email').value = 'test@student.com'; $('signin-password').value = 'demo123'; $('signin-password').focus(); err.textContent = ''; });
  const fp = document.querySelector('a[href="#forgot-password"]');
  if (fp) fp.addEventListener('click', (e) => { e.preventDefault(); err.textContent = 'Password reset by email arrives with the server phase. For now, use the demo account or create a new one.'; });
});
