/* PocketMate core: auth, sessions, per-user store, calculations. Local "backend" (localStorage) behind a clean API
   so every function can later be swapped for a fetch() call. */
(function () {
  'use strict';
  try { const r = document.documentElement, t = localStorage.getItem('pocketmate-theme'), z = localStorage.getItem('pocketmate-text-size'); r.dataset.theme = t === 'dark' ? 'dark' : 'light'; r.dataset.textSize = z === 'compact' || z === 'large' ? z : 'comfortable'; } catch (e) {}
  try { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { document.documentElement.classList.add('pm-intro'); setTimeout(() => document.documentElement.classList.remove('pm-intro'), 1700); } } catch (e) {}
  const DAY = 864e5, SYM = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
  const K = { users: 'pm:v1:users', sess: 'pm:v1:session', inbox: 'pm:v1:inbox', att: 'pm:v1:attempts', data: (i) => 'pm:v1:data:' + i };
  const rd = (s, k, d) => { try { const v = JSON.parse(s.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const wr = (s, k, v) => s.setItem(k, JSON.stringify(v));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => iso(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CATS = [['Food', '🍔'], ['Education', '🎓'], ['Transport', '🚌'], ['Entertainment', '🎬'], ['Subscription', '💳'], ['Health', '❤️'], ['Others', '🏷️']];
  const blank = () => ({ budget: 0, categories: CATS.map(([name, emoji]) => ({ name, emoji })), transactions: [], goals: [], pools: [], people: ['You'], splits: [], settlements: [], bills: [], messages: [], settings: { currency: 'INR', budgetCycle: 'monthly' } });

  /* ---------- hashing (PBKDF2 where available; weak fallback on insecure origins) ---------- */
  async function hash(pw, salt) {
    if (window.crypto && crypto.subtle) {
      const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
      const b = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, k, 256);
      return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381; for (const c of salt + pw) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return 'x' + h;
  }

  /* ---------- session + store ---------- */
  let _db = null;
  const users = () => rd(localStorage, K.users, []);
  function session() {
    const s = rd(sessionStorage, K.sess, null) || rd(localStorage, K.sess, null);
    if (s && s.exp > Date.now()) return s;
    if (s) { sessionStorage.removeItem(K.sess); localStorage.removeItem(K.sess); }
    return null;
  }
  const user = () => { const s = session(); return s ? users().find((u) => u.id === s.uid) || null : null; };
  function db() {
    if (!_db) { const s = session(); if (!s) return null; _db = rd(localStorage, K.data(s.uid), null) || blank(); if (migrate(_db)) save(); }
    return _db;
  }
  function save() {
    const s = session(); if (!s || !_db) return;
    try { wr(localStorage, K.data(s.uid), _db); } catch (e) { alert('Storage is full or blocked. Export your data and clear space.'); }
  }
  window.addEventListener('storage', (e) => {
    if (e.key === K.sess && !e.newValue && !rd(sessionStorage, K.sess, null)) { if (/dashboard|expensemanager|reports|settings/.test(location.pathname)) location.replace('signin.html'); }
    if (e.key && e.key.indexOf('pm:v1:data:') === 0) { _db = null; window.dispatchEvent(new Event('pm:data')); }
  });
  const onData = (fn) => window.addEventListener('pm:data', fn);
  const commit = () => { save(); window.dispatchEvent(new Event('pm:data')); };

  async function signup({ name, email, password }, skipPolicy) {
    email = String(email).trim().toLowerCase(); name = String(name).trim();
    if (!name) throw new Error('Enter your full name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address.');
    if (!skipPolicy && password.length < 8) throw new Error('Password must be at least 8 characters.');
    if (users().some((u) => u.email === email)) throw new Error('An account with this email already exists. Sign in instead.');
    const salt = uid() + uid();
    const u = { id: uid(), name, email, salt, hash: await hash(password, salt), createdAt: new Date().toISOString(), accountType: 'Student account' };
    wr(localStorage, K.users, [...users(), u]); wr(localStorage, K.data(u.id), blank());
    return u;
  }
  async function login(email, pw, remember) {
    email = String(email).trim().toLowerCase();
    const a = rd(localStorage, K.att, {}), at = a[email] || { n: 0, until: 0 };
    if (at.until > Date.now()) throw new Error(`Too many attempts. Try again in ${Math.ceil((at.until - Date.now()) / 60000)} min.`);
    const u = users().find((x) => x.email === email);
    if (!u || u.hash !== (await hash(pw, u.salt))) {
      at.n++; if (at.n >= 5) { at.until = Date.now() + 3e5; at.n = 0; } a[email] = at; wr(localStorage, K.att, a);
      throw new Error('Incorrect email or password.');
    }
    delete a[email]; wr(localStorage, K.att, a);
    sessionStorage.removeItem(K.sess); localStorage.removeItem(K.sess); _db = null;
    wr(remember ? localStorage : sessionStorage, K.sess, { uid: u.id, exp: Date.now() + (remember ? 30 * DAY : 12 * 36e5) });
    return u;
  }
  function logout() { sessionStorage.removeItem(K.sess); localStorage.removeItem(K.sess); _db = null; location.href = 'homepage.html'; }
  function guard() {
    if (session() && user()) return user();
    location.replace('signin.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search + location.hash)); return null;
  }
  async function changePassword(cur, next) {
    const u = user(); if (!u) throw new Error('Not signed in.');
    if (u.hash !== (await hash(cur, u.salt))) throw new Error('Current password is incorrect.');
    if (next.length < 8) throw new Error('New password must be at least 8 characters.');
    const salt = uid() + uid(), h = await hash(next, salt);
    wr(localStorage, K.users, users().map((x) => (x.id === u.id ? { ...x, salt, hash: h } : x)));
  }
  function updateProfile(p) {
    const u = user(), email = p.email.trim().toLowerCase();
    if (!p.name.trim()) throw new Error('Name cannot be empty.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address.');
    if (users().some((x) => x.email === email && x.id !== u.id)) throw new Error('That email is already used by another account.');
    wr(localStorage, K.users, users().map((x) => (x.id === u.id ? { ...x, name: p.name.trim(), email, accountType: p.accountType } : x)));
  }
  function resetData() { _db = blank(); commit(); }
  function deleteAccount() {
    const s = session(); if (!s) return;
    wr(localStorage, K.users, users().filter((u) => u.id !== s.uid)); localStorage.removeItem(K.data(s.uid)); logout();
  }
  function saveContact(m) { const l = rd(localStorage, K.inbox, []); l.push({ id: uid(), at: new Date().toISOString(), uid: (session() || {}).uid || null, ...m }); wr(localStorage, K.inbox, l); }

  /* ---------- formatting ---------- */
  const cur = () => ((db() || {}).settings || {}).currency || 'INR';
  function money(v, sign) {
    const c = cur(), n = Math.abs(v).toLocaleString(c === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: Number.isInteger(+v) ? 0 : 2, maximumFractionDigits: 2 });
    return (v < 0 ? '-' : sign && v > 0 ? '+' : '') + SYM[c] + n;
  }
  const kfmt = (v) => (v >= 1000 ? +(v / 1000).toFixed(1) + 'k' : String(Math.round(v)));
  const fdate = (s, y) => parse(s).toLocaleDateString('en-IN', y ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: '2-digit', month: 'short' });
  const emoji = (c) => { const x = (db().categories.find((k) => k.name === c) || {}).emoji; return x || (c === 'Income' ? '💵' : '🏷️'); };
  
  /* ---------- transactions ---------- */
  function validTx(o) {
    const d = db(), a = Math.round(Number(o.amount) * 100) / 100;
    if (!(a > 0) || a > 1e8) throw new Error('Enter an amount greater than 0.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date) || isNaN(parse(o.date))) throw new Error('Pick a valid date.');
    if (o.date > today()) throw new Error('Date cannot be in the future.');
    if (!['Expense', 'Income'].includes(o.type)) throw new Error('Invalid type.');
    const cat = o.type === 'Income' ? 'Income' : o.category;
    if (cat !== 'Income' && !d.categories.some((c) => c.name === cat)) throw new Error('Pick a category.');
    return { date: o.date, type: o.type, category: cat, amount: a, description: String(o.description || '').trim().slice(0, 80) || (o.type === 'Income' ? 'Income' : 'Expense'), account: o.account || 'Cash' };
  }
  function addTx(o, extra) { const t = { id: uid(), ...validTx(o), ...(extra || {}) }; db().transactions.push(t); commit(); return t; }
  function updateTx(id, o) { const d = db(), i = d.transactions.findIndex((t) => t.id === id); if (i < 0) throw new Error('Transaction not found.'); d.transactions[i] = { ...d.transactions[i], ...validTx(o) }; commit(); }
  function delTx(id) { const d = db(); d.transactions = d.transactions.filter((t) => t.id !== id); commit(); }
  const sorted = () => db().transactions.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));

  /* ---------- periods + analytics ---------- */
  function range(cycle, off) {
    off = off || 0; const n = new Date();
    if (cycle === 'weekly') { const d = new Date(n); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); const f = iso(d); return { from: f, to: addDays(f, 6) }; }
    if (cycle === 'yearly') { const y = n.getFullYear() + off; return { from: y + '-01-01', to: y + '-12-31' }; }
    return { from: iso(new Date(n.getFullYear(), n.getMonth() + off, 1)), to: iso(new Date(n.getFullYear(), n.getMonth() + off + 1, 0)) };
  }
  const inR = (x, r) => x.date >= r.from && x.date <= r.to;
  const sum = (l, t) => l.filter((x) => x.type === t).reduce((s, x) => s + x.amount, 0);
  const delta = (c, p) => (p ? Math.round(((c - p) / Math.abs(p)) * 100) : null);
  function byCat(list) {
    const m = {}; list.filter((x) => x.type === 'Expense').forEach((x) => (m[x.category] = (m[x.category] || 0) + x.amount));
    const tot = Object.values(m).reduce((a, b) => a + b, 0);
    return Object.entries(m).map(([name, amount]) => ({ name, amount, pct: tot ? Math.round((amount / tot) * 100) : 0 })).sort((a, b) => b.amount - a.amount);
  }
  function stats(cycle) {
    const d = db(), c = cycle || d.settings.budgetCycle, r = range(c), p = range(c, -1), l = d.transactions;
    const cu = l.filter((x) => inR(x, r)), pr = l.filter((x) => inR(x, p));
    const income = sum(cu, 'Income'), expense = sum(cu, 'Expense'), pi = sum(pr, 'Income'), pe = sum(pr, 'Expense'), b = d.budget;
    const left = Math.max(0, b - expense), pleft = Math.max(0, b - pe);
    return { cycle: c, range: r, cur: cu, income, expense, savings: income - expense, budget: b, left, usage: b ? expense / b : 0, byCat: byCat(cu),
      d: { income: delta(income, pi), expense: delta(expense, pe), savings: delta(income - expense, pi - pe), left: b ? delta(left, pleft) : null } };
  }
  function health(st) {
    const d = db(), rate = st.income > 0 ? (st.income - st.expense) / st.income : 0, u = st.usage, has = d.transactions.length > 0;
    const sv = has ? Math.round(Math.max(0, Math.min(1, rate / 0.3)) * 35) : 0;
    const sp = !has ? 0 : Math.round(!st.budget ? 15 : u <= 0.8 ? 30 : u <= 1 ? 30 - ((u - 0.8) / 0.2) * 15 : Math.max(0, 15 - (u - 1) * 50));
    const cf = !has ? 0 : st.income >= st.expense ? 20 : Math.round((20 * st.income) / st.expense);
    const avg = d.goals.length ? d.goals.reduce((s, g) => s + Math.min(1, g.saved / g.target), 0) / d.goals.length : null;
    const gl = !has ? 0 : avg == null ? 7 : Math.round(avg * 15), total = sv + sp + cf + gl;
    return { total, has, label: !has ? 'No data yet' : total >= 80 ? 'Optimal' : total >= 60 ? 'Good' : total >= 40 ? 'Fair' : 'Needs attention',
      factors: [
        { k: 'Savings', pts: sv, max: 35, note: !has ? 'Add income and expenses' : rate >= 0.3 ? 'Strong savings rate' : rate > 0 ? 'Steady growth' : 'Not saving yet', icon: '💰', cls: 'blue-fill' },
        { k: 'Smart Spending', pts: sp, max: 30, note: !st.budget ? 'Set a budget' : u <= 0.8 ? 'Within budget' : u <= 1 ? 'Near your limit' : 'Over budget', icon: '🛍️', cls: 'purple-fill' },
        { k: 'Cash Flow', pts: cf, max: 20, note: !has ? 'No activity' : st.income >= st.expense ? 'Positive balance' : 'Spending exceeds income', icon: '↔', cls: 'cyan-fill' },
        { k: 'Goals', pts: gl, max: 15, note: avg == null ? 'No goals yet' : Math.round(avg * 100) + '% average progress', icon: '🎯', cls: 'orange-fill' }] };
  }
  function buckets(period) {
    const r = range(period), l = db().transactions; let b = [];
    if (period === 'weekly') for (let i = 0; i < 7; i++) { const f = addDays(r.from, i); b.push({ label: parse(f).toLocaleDateString('en-IN', { weekday: 'short' }), from: f, to: f }); }
    else if (period === 'yearly') { const y = +r.from.slice(0, 4); for (let m = 0; m < 12; m++) b.push({ label: new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'short' }), from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) }); }
    else { const last = +r.to.slice(8), ym = r.from.slice(0, 8), mon = parse(r.from).toLocaleDateString('en-IN', { month: 'short' }); [1, 8, 15, 22, 29].forEach((s, i) => { if (s > last) return; b.push({ label: s + ' ' + mon, from: ym + pad(s), to: ym + pad(i === 4 ? last : s + 6) }); }); }
    return b.map((x) => { const t = l.filter((y) => inR(y, x)); return { ...x, income: sum(t, 'Income'), expense: sum(t, 'Expense') }; });
  }
  function pace() { // average monthly net savings over the last 3 months
    const l = db().transactions; let n = 0; for (let m = -2; m <= 0; m++) { const r = range('monthly', m), t = l.filter((x) => inR(x, r)); n += sum(t, 'Income') - sum(t, 'Expense'); } return n / 3;
  }

  /* ---------- bills ---------- */
  const dim = (y, m) => new Date(y, m + 1, 0).getDate();
  function dueInfo(b) {
    const n = new Date(); let y = n.getFullYear(), m = n.getMonth();
    if (b.paidMonth === today().slice(0, 7)) { m++; if (m > 11) { m = 0; y++; } }
    const due = iso(new Date(y, m, Math.min(b.day, dim(y, m)))), diff = Math.round((parse(due) - parse(today())) / DAY);
    return { due, diff, text: b.auto ? 'autopay on ' + b.day + (['th', 'st', 'nd', 'rd'][(b.day % 100 > 10 && b.day % 100 < 14) || b.day % 10 > 3 ? 0 : b.day % 10]) : diff < 0 ? 'overdue by ' + -diff + 'd' : diff === 0 ? 'due today' : diff === 1 ? 'due tomorrow' : 'due in ' + diff + ' days' };
  }
  function payBill(id, date) {
    const d = db(), b = d.bills.find((x) => x.id === id); if (!b) return;
    d.transactions.push({ id: uid(), date: date || today(), type: 'Expense', category: d.categories.some((c) => c.name === 'Subscription') ? 'Subscription' : 'Others', amount: b.amount, description: b.name, account: b.auto ? 'Autopay' : 'UPI', billId: b.id });
    b.paidMonth = (date || today()).slice(0, 7); commit();
  }
  function processBills() { // autopay catch-up: post any auto bill whose day has passed this month
    const d = db(), n = new Date(), ym = today().slice(0, 7); let c = 0;
    d.bills.filter((b) => b.auto && b.paidMonth !== ym).forEach((b) => { const day = Math.min(b.day, dim(n.getFullYear(), n.getMonth())); if (n.getDate() >= day) { payBill(b.id, ym + '-' + pad(day)); c++; } });
    return c;
  }

  /* ---------- friends / splits (per-person settled state) ---------- */
  // split = { id, date, name, total, paidBy, shares:{person:amount}, paid:{person:'YYYY-MM-DD'} }
  // Everyone except the payer owes the payer their share until marked paid. Toggling never creates a transaction:
  // your own share was already booked as an expense when the split was saved.
  const owers = (s) => Object.keys(s.shares).filter((p) => p !== s.paidBy);
  function splitInfo(s) { const o = owers(s), n = o.filter((p) => s.paid && s.paid[p]).length; return { owers: o, done: n, total: o.length, status: n === o.length ? 'settled' : n ? 'partial' : 'pending' }; }
  function migrate(d) {
    let ch = false;
    (d.splits || []).forEach((s) => { if (!s.paid) { s.paid = {}; ch = true; } });
    if (d.settlements && d.settlements.length) { // legacy lump-sum settlements -> per-split flags
      d.settlements.forEach((x) => { let rem = x.amount; d.splits.forEach((s) => { const who = x.dir === 'received' ? x.person : 'You', a = s.shares[who]; if (a != null && (x.dir === 'received' ? s.paidBy === 'You' : s.paidBy === x.person) && !s.paid[who] && rem >= a - 0.005) { s.paid[who] = x.date || today(); rem -= a; } }); });
      d.settlements = []; ch = true;
    }
    return ch;
  }
  function balances() { // pending amounts only: positive = they owe you, negative = you owe them
    const d = db(), o = {}; d.people.filter((p) => p !== 'You').forEach((p) => (o[p] = 0));
    d.splits.forEach((s) => {
      if (s.paidBy === 'You') owers(s).forEach((p) => { if (!s.paid[p] && p in o) o[p] += s.shares[p]; });
      else if (s.shares.You && !s.paid.You && s.paidBy in o) o[s.paidBy] -= s.shares.You;
    });
    Object.keys(o).forEach((k) => (o[k] = Math.round(o[k] * 100) / 100)); return o;
  }
  function splitTotals() { const b = Object.values(balances()); return { toReceive: b.filter((v) => v > 0).reduce((a, v) => a + v, 0), toPay: -b.filter((v) => v < 0).reduce((a, v) => a + v, 0), pending: db().splits.filter((s) => splitInfo(s).status !== 'settled').length }; }
  function splitEqual(total, names) { const c = Math.round(total * 100), n = names.length, b = Math.floor(c / n), r = c - b * n; return Object.fromEntries(names.map((p, i) => [p, (b + (i < r ? 1 : 0)) / 100])); }
  function saveSplit(s) {
    const d = db(), rec = { id: uid(), date: today(), ...s, paid: {} }; d.splits.push(rec);
    Object.keys(s.shares).concat(s.paidBy).forEach((p) => { if (!d.people.includes(p)) d.people.push(p); });
    if (s.shares.You) d.transactions.push({ id: uid(), date: today(), type: 'Expense', category: 'Others', amount: s.shares.You, description: 'Split: ' + s.name, account: s.paidBy === 'You' ? 'UPI' : 'Owed', splitId: rec.id });
    commit(); return rec;
  }
  function setPaid(id, person, val) { const s = db().splits.find((x) => x.id === id); if (!s || person === s.paidBy || !(person in s.shares)) return; if (val) s.paid[person] = today(); else delete s.paid[person]; commit(); }
  function setAllPaid(id, val) { const s = db().splits.find((x) => x.id === id); if (!s) return; s.paid = {}; if (val) owers(s).forEach((p) => (s.paid[p] = today())); commit(); }
  function delSplit(id) { const d = db(); d.splits = d.splits.filter((s) => s.id !== id); d.transactions = d.transactions.filter((t) => t.splitId !== id); commit(); }

  /* ---------- category colours (same theme variables the original CSS used, so dark mode follows) ---------- */
  const CC = { Food: 'var(--coral)', Education: 'var(--sky)', Transport: 'var(--gold)', Entertainment: 'var(--mint)', Others: 'var(--lav)', Health: 'var(--teal)', Subscription: 'var(--peach)' };
  const XC = ['var(--teal)', 'var(--peach)', 'var(--primary)', 'var(--green)', 'var(--yellow)', 'var(--blue)'];
  const catColor = (n) => CC[n] || XC[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % XC.length];
  const dot = (n) => (['Food', 'Education', 'Transport', 'Entertainment', 'Others'].includes(n) ? `<i class="dot ${n.toLowerCase()}"></i>` : `<i class="dot" style="background:${catColor(n)}"></i>`);
  const gradient = (list, total) => { let a = 0; return list.map((x) => { const f = a; a += (x.amount / total) * 100; return `${catColor(x.name)} ${f}% ${a}%`; }).join(','); };

  /* ---------- seed demo account (dates are relative to today, never hardcoded) ---------- */
  function seedData() {
    const d = blank(), now = new Date(), t = today(); d.budget = 12000;
    for (let m = 2; m >= 0; m--) {
      const b = new Date(now.getFullYear(), now.getMonth() - m, 1);
      [[1, 'Income', 'Salary', 'Income', 25000, 'Bank'], [12, 'Income', 'Freelance payment', 'Income', 3500, 'UPI'], [2, 'Food', 'Groceries', 'Expense', 1250, 'UPI'], [3, 'Transport', 'Metro card', 'Expense', 600, 'Cash'], [4, 'Education', 'Books', 'Expense', 900, 'Card'], [6, 'Food', 'Pizza', 'Expense', 350, 'UPI'], [8, 'Entertainment', 'Movie night', 'Expense', 750, 'Card'], [9, 'Subscription', 'Cloud storage', 'Expense', 130, 'Card'], [11, 'Food', 'Lunch', 'Expense', 280, 'Cash'], [14, 'Transport', 'Bus pass', 'Expense', 450, 'Cash'], [16, 'Education', 'Stationery', 'Expense', 480, 'UPI'], [18, 'Food', 'Coffee', 'Expense', 200, 'UPI'], [20, 'Health', 'Pharmacy', 'Expense', 420, 'Cash'], [22, 'Food', 'Dinner out', 'Expense', 640, 'Card'], [24, 'Others', 'Gift', 'Expense', 500, 'UPI'], [27, 'Food', 'Groceries', 'Expense', 1100, 'UPI']].forEach(([day, category, description, type, amount, account]) => {
        const dt = iso(new Date(b.getFullYear(), b.getMonth(), day)); if (dt <= t) d.transactions.push({ id: uid(), date: dt, category, description, type, amount, account });
      });
    }
    d.goals = [{ id: uid(), name: 'MacBook', saved: 80000, target: 100000, emoji: '💻' }, { id: uid(), name: 'Emergency Fund', saved: 18000, target: 30000, emoji: '🛟' }, { id: uid(), name: 'Goa Trip', saved: 6000, target: 15000, emoji: '✈️' }];
    d.pools = [{ id: uid(), name: 'Room Rent', saved: 12000, target: 20000, emoji: '🏠' }, { id: uid(), name: 'Goa Trip', saved: 8500, target: 15000, emoji: '✈️' }];
    d.people = ['You', 'Rahul', 'Aman', 'Priya'];
    d.splits = [{ id: uid(), date: addDays(t, -6), name: 'Pizza Party', total: 500, paidBy: 'You', shares: { You: 250, Rahul: 250 }, paid: {} }, { id: uid(), date: addDays(t, -4), name: 'Cab ride', total: 240, paidBy: 'Aman', shares: { You: 120, Aman: 120 }, paid: {} }, { id: uid(), date: addDays(t, -9), name: 'Movie tickets', total: 500, paidBy: 'You', shares: { You: 250, Priya: 250 }, paid: { Priya: addDays(t, -2) } }];
    d.settlements = [];
    d.bills = [{ id: uid(), name: 'Electricity Bill', amount: 800, day: parse(addDays(t, 3)).getDate(), auto: false, icon: '⚡' }, { id: uid(), name: 'Netflix', amount: 199, day: 25, auto: true, icon: '▣' }, { id: uid(), name: 'Spotify', amount: 119, day: parse(addDays(t, 1)).getDate(), auto: false, icon: '♫' }];
    return d;
  }
  const ready = (async function () {
    if (!users().some((u) => u.email === 'test@student.com')) { const u = await signup({ name: 'Test Student', email: 'test@student.com', password: 'demo123' }, true).catch((e) => { console.error("PM seed failed", e); return null; }); if (u) wr(localStorage, K.data(u.id), seedData()); }
  })();

  /* ---------- UI helpers ---------- */
  function initTheme() {
    const r = document.documentElement, set = (v) => { r.dataset.theme = v === 'dark' ? 'dark' : 'light'; };
    set(localStorage.getItem('pocketmate-theme')); r.dataset.textSize = localStorage.getItem('pocketmate-text-size') || 'comfortable';
    window.addEventListener('storage', (e) => { if (e.key === 'pocketmate-theme') set(e.newValue); if (e.key === 'pocketmate-text-size') r.dataset.textSize = e.newValue === 'compact' || e.newValue === 'large' ? e.newValue : 'comfortable'; });
  }
  function wireNav() {
    document.querySelectorAll('.logout').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); logout(); }));
    if (session()) { const si = document.querySelector('.desktop-buttons .signin'), su = document.querySelector('.desktop-buttons .signup'); if (si) { si.textContent = 'Dashboard'; si.href = 'dashboard.html'; } if (su) su.style.display = 'none'; }
  }
  function download(content, name, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500); }
  function csv() {
    const q = (v) => { v = String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return ['Date,Category,Description,Type,Amount,Account'].concat(sorted().map((t) => [t.date, t.category, t.description, t.type, t.amount, t.account || ''].map(q).join(','))).join('\n');
  }

  window.PM = { ready, K, esc, iso, parse, today, addDays, uid, signup, login, logout, guard, session, user, db, save, commit, onData, changePassword, updateProfile, resetData, deleteAccount, saveContact,
    money, kfmt, fdate, emoji, catColor, dot, gradient, addTx, updateTx, delTx, sorted, range, stats, health, buckets, pace, byCat, dueInfo, payBill, processBills, balances, splitInfo, splitTotals, splitEqual, saveSplit, setPaid, setAllPaid, delSplit, initTheme, wireNav, download, csv, SYM, blank };
})();
