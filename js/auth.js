PM.ready.then(() => {
  const $ = (id) => document.getElementById(id), si = $('signin-form'), su = $('signup-form'), f = si || su;
  const go = () => { const n = new URLSearchParams(location.search).get('next'); return n && /^(dashboard|expensemanager|reports|settings)\.html/.test(n) ? n : 'dashboard.html'; };
  if (PM.session() && PM.user()) { location.replace('dashboard.html'); return; }
  f.removeAttribute('action'); f.removeAttribute('method'); f.noValidate = false;
  const err = document.createElement('p'); err.className = 'status-message'; err.setAttribute('role', 'alert'); err.style.color = 'var(--coral)';
  f.querySelector('.submit-button').before(err);
  const btn = f.querySelector('.submit-button'), label = btn.innerHTML;
  const busy = (b) => { btn.disabled = b; btn.innerHTML = b ? 'Please wait…' : label; };
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = ''; busy(true);
    try {
      if (si) { await PM.login($('signin-email').value, $('signin-password').value, $('signin-remember').checked); location.href = go(); }
      else {
        if ($('signup-password').value !== $('signup-confirm-password').value) throw new Error('Passwords do not match.');
        await PM.signup({ name: $('signup-name').value, email: $('signup-email').value, password: $('signup-password').value });
        await PM.login($('signup-email').value, $('signup-password').value, true); location.href = 'dashboard.html';
      }
    } catch (x) { err.textContent = x.message; busy(false); }
  });
  const demo = document.querySelector('.demo-credentials a');
  if (demo && si) demo.addEventListener('click', (e) => { e.preventDefault(); $('signin-email').value = 'test@student.com'; $('signin-password').value = 'demo123'; $('signin-password').focus(); err.textContent = ''; });
  const fp = document.querySelector('a[href="#forgot-password"]');
  if (fp) fp.addEventListener('click', (e) => { e.preventDefault(); err.textContent = 'Password reset by email arrives with the server phase. For now, use the demo account or create a new one.'; });
});
