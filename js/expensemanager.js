PM.ready.then(() => {
  if (!PM.guard()) return;
  PM.initTheme(); PM.wireNav(); PM.processBills();
  const $ = (id) => document.getElementById(id), E = PM.esc, M = PM.money, d0 = () => PM.db();
  let editing = null, mode = 'equal', parts = null, last = null, custom = {};
  const ACC = ['Cash', 'UPI', 'Card', 'Bank'], EM = ['🙋', '👨🏻', '👨🏽', '👩🏻'];
  const tcls = (n) => { const k = n.toLowerCase(); return ['food', 'education', 'transport', 'entertainment', 'income', 'others', 'subscription'].includes(k) ? k : k === 'health' ? 'health-cat' : 'custom-cat'; };
  const bg = (n) => (['food', 'education', 'transport', 'entertainment', 'subscription', 'health'].includes(n.toLowerCase()) ? n.toLowerCase() : 'subscription') + '-bg';
  const say = (el, t, bad) => { el.textContent = t; el.style.color = bad ? 'var(--coral)' : ''; };

  /* one-time DOM additions: account field, form message, bills + friends panels */
  const form = $('transactionForm'), btn = form.querySelector('button[type=submit]');
  btn.insertAdjacentHTML('beforebegin', `<label>Account<select id="transactionAccount">${ACC.map((a) => `<option>${a}</option>`).join('')}</select></label><p id="txMsg" class="status-message" role="alert"></p>`);
  $('transactionDate').max = PM.today(); $('transactionDate').value = PM.today();
  document.querySelector('.goals-pools-below').insertAdjacentHTML('afterend', `<section class="goals-pools-below" style="margin-top:22px"><div class="panel" id="upcoming-bills"><div class="panel-header"><div><h3>Upcoming Bills</h3><small class="panel-subtitle">Recurring payments</small></div><button id="addBillButton" class="add-inline-button" type="button">＋ Add Bill</button></div><div id="billsList" class="goals-manager-list"></div></div><div class="panel" id="friends"><div class="panel-header"><div><h3>Friend Balances</h3><small class="panel-subtitle">Pending amounts only</small></div></div><div id="friendsList" class="goals-manager-list"></div></div></section><section style="grid-column:1 / -1;margin-top:22px"><div class="panel split-tracker" id="splits"><div class="panel-header"><div><h3>Split Tracker</h3><small class="panel-subtitle">Mark who has paid. Pending amounts flow to your Dashboard.</small></div><div id="splitStats" class="tracker-head-stats"></div></div><div class="tracker-sub">Split history <small id="histCount"></small></div><div id="splitHistory" class="history-list"></div><div class="tracker-sub">Pending splits <small id="pendCount"></small></div><div id="splitPending" class="pending-grid"></div></div></section>`);
  document.querySelector('.expense-kpis').insertAdjacentHTML('beforeend', '<span id="owedChip" role="link" tabindex="0" style="cursor:pointer" title="Jump to the Split Tracker"><i class="ph ph-users-three"></i><small>To collect</small><strong id="owedKpi">0</strong></span>');
  const jump = () => $('splits').scrollIntoView({ behavior: 'smooth' }); $('owedChip').onclick = jump; $('owedChip').onkeydown = (e) => { if (e.key === 'Enter') jump(); };
  $('splitName').value = ''; $('splitAmount').value = ''; $('splitName').placeholder = 'e.g. Pizza Party'; $('splitAmount').placeholder = '0';

  function fillSelects() {
    const cats = d0().categories.map((c) => c.name), sel = $('transactionCategory').value, hf = $('historyCategory').value;
    $('transactionCategory').innerHTML = cats.map((c) => `<option>${E(c)}</option>`).join(''); if (cats.includes(sel)) $('transactionCategory').value = sel;
    $('historyCategory').innerHTML = ['All Categories', ...cats, 'Income'].map((c) => `<option>${E(c)}</option>`).join(''); if (hf) $('historyCategory').value = hf;
    $('transactionCategory').disabled = $('transactionType').value === 'Income';
  }
  function budget() {
    const st = PM.stats(), p = Math.min(100, st.usage * 100);
    $('budgetValue').textContent = st.budget ? M(st.budget) : 'Not set'; $('budgetSpent').textContent = M(st.expense); $('budgetLeft').textContent = M(st.left);
    $('budgetFill').style.width = p + '%'; $('budgetPercent').textContent = st.budget ? Math.round(st.usage * 100) + '%' : '–'; $('monthTotal').textContent = M(st.expense); $('budgetUsedKpi').textContent = st.budget ? Math.round(st.usage * 100) + '%' : '–';
    $('budgetFill').style.background = st.usage > 1 ? 'var(--coral)' : '';
  }
  function txTable() {
    const s = $('transactionSearch').value.toLowerCase(), c = $('historyCategory').value, t = $('historyType').value;
    const rows = PM.sorted().filter((x) => (!s || `${x.category} ${x.description}`.toLowerCase().includes(s)) && (c === 'All Categories' || x.category === c) && (t === 'All Types' || x.type === t));
    $('historyTotal').textContent = rows.length + (rows.length === 1 ? ' record' : ' records');
    $('transactionRows').innerHTML = rows.map((x) => `<tr><td>${PM.fdate(x.date, 1)}</td><td><span class="table-category ${tcls(x.category)}">${E(x.category)}</span></td><td>${E(x.description)}</td><td>${x.type}</td><td class="${x.type === 'Expense' ? 'amount-expense' : 'amount-income'}">${M(x.type === 'Expense' ? -x.amount : x.amount, 1)}</td><td><button class="table-action edit-action" data-id="${x.id}" aria-label="Edit"><i class="ph ph-pencil-simple"></i></button> <button class="table-action delete-action" data-id="${x.id}" aria-label="Delete"><i class="ph ph-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="6" class="empty-row">No transactions found</td></tr>';
  }
  function cats() {
    const st = PM.stats(), pct = Object.fromEntries(st.byCat.map((x) => [x.name, x.pct]));
    $('categoryList').innerHTML = d0().categories.map((c, i) => `<div><span class="category-badge ${bg(c.name)}">${c.emoji}</span><span>${E(c.name)}</span><b>${pct[c.name] || 0}%</b><button class="remove-category" data-i="${i}" aria-label="Remove ${E(c.name)}"><i class="ph ph-trash"></i></button></div>`).join('');
  }
  function bars(list, kind) {
    const pace = kind === 'goal' ? PM.pace() : 0;
    return list.map((g) => { const p = Math.min(100, g.saved / g.target * 100), rem = g.target - g.saved;
      return `<div class="${kind}-manager-item"><div class="${kind}-manager-title"><span>${g.emoji}</span><strong>${E(g.name)}</strong><b>${M(g.saved)} / ${M(g.target)}</b><button class="remove-item" data-kind="${kind}" data-id="${g.id}" data-act="add" title="Add money" aria-label="Add money">＋</button><button class="remove-item" data-kind="${kind}" data-id="${g.id}" data-act="del" aria-label="Remove">×</button></div><div class="progress-track"><div class="progress-fill" style="width:${p}%"></div></div>${kind === 'goal' ? `<small style="color:var(--muted)">${rem <= 0 ? '🎉 Reached' : pace > 0 ? '~' + Math.ceil(rem / pace) + ' month(s) at your pace' : ''}</small>` : ''}</div>`; }).join('') || '<p style="color:var(--muted)">Nothing here yet.</p>';
  }
  function bills() {
    $('billsList').innerHTML = d0().bills.map((b) => ({ b, i: PM.dueInfo(b) })).sort((a, z) => a.i.diff - z.i.diff).map(({ b, i }) => `<div class="goal-manager-item"><div class="goal-manager-title"><span>${E(b.icon || '▣')}</span><strong>${E(b.name)}</strong><b>${M(b.amount)} · ${i.text}</b><button class="remove-item" data-bill="${b.id}" data-act="pay" title="Mark paid" aria-label="Mark paid">✓</button><button class="remove-item" data-bill="${b.id}" data-act="del" aria-label="Remove">×</button></div></div>`).join('') || '<p style="color:var(--muted)">No bills yet.</p>';
  }
  function friends() {
    const bal = PM.balances(), q = new URLSearchParams(location.search).get('friend');
    $('friendsList').innerHTML = Object.entries(bal).map(([n, v]) => { return `<div class="goal-manager-item" ${q === n ? 'style="outline:2px solid var(--primary);border-radius:12px"' : ''}><div class="goal-manager-title"><span>👤</span><strong>${E(n)}</strong><b class="${v > 0 ? 'bal-pos' : v < 0 ? 'bal-neg' : ''}">${v > 0 ? 'owes you ' + M(v) : v < 0 ? 'you owe ' + M(-v) : 'all settled'}</b></div></div>`; }).join('') || '<p style="color:var(--muted)">Add a friend in Split Expense to start tracking.</p>';
  }
  const label = { settled: 'Settled', partial: 'Partly settled', pending: 'Pending' };
  function tracker() {
    const d = d0(), t = PM.splitTotals(), q = new URLSearchParams(location.search).get('friend');
    const list = d.splits.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));
    $('splitStats').innerHTML = `<div class="tracker-chip owed"><small>To collect</small><b>${M(t.toReceive)}</b></div><div class="tracker-chip owe"><small>To pay</small><b>${M(t.toPay)}</b></div><div class="tracker-chip"><small>Pending splits</small><b>${t.pending}</b></div>`;
    $('owedKpi').textContent = M(t.toReceive);
    $('histCount').textContent = list.length + (list.length === 1 ? ' split' : ' splits');
    $('splitHistory').innerHTML = list.map((s) => { const i = PM.splitInfo(s), last = Object.values(s.paid).sort().pop();
      return `<div class="history-row"><div><strong>${E(s.name)}</strong><br><small>${PM.fdate(s.date, 1)} · paid by ${E(s.paidBy)}${i.status === 'settled' && last ? ' · settled ' + PM.fdate(last) : ''}</small></div><b>${M(s.total)}</b><span class="status-badge ${i.status}">${i.status === 'partial' ? i.done + ' of ' + i.total + ' paid' : label[i.status]}</span><button class="remove-item" data-del-split="${s.id}" aria-label="Delete ${E(s.name)}">×</button></div>`; }).join('') || '<p style="color:var(--muted)">No splits yet. Use Split Expense to create one.</p>';
    const pend = list.filter((s) => PM.splitInfo(s).status !== 'settled');
    $('pendCount').textContent = pend.length + ' open';
    $('splitPending').innerHTML = pend.map((s, n) => { const i = PM.splitInfo(s), owedAmt = i.owers.filter((p) => !s.paid[p]).reduce((a, p) => a + s.shares[p], 0);
      const rows = i.owers.map((p, k) => { const ok = !!s.paid[p], txt = p === 'You' ? 'you owe ' + E(s.paidBy) : 'owes ' + (s.paidBy === 'You' ? 'you' : E(s.paidBy));
        return `<div class="owe-row ${ok ? 'paid' : ''}"><span class="avatar-mini">${EM[(d.people.indexOf(p) + 4) % 4]}</span><div class="who"><strong>${E(p)}</strong><small>${ok ? 'paid ' + PM.fdate(s.paid[p]) : txt}</small></div><b>${M(s.shares[p])}</b><label class="switch"><input type="checkbox" role="switch" data-split-id="${s.id}" data-person="${E(p)}" aria-label="${E(p)} has paid" ${ok ? 'checked' : ''}><i></i><span>${ok ? 'Settled' : 'Pending'}</span></label></div>`; }).join('');
      return `<div class="split-card ${q && q in s.shares ? 'highlight' : ''}"><div class="split-card-top"><div><strong>${E(s.name)}</strong><small>${PM.fdate(s.date, 1)} · ${M(s.total)} · paid by ${E(s.paidBy)}</small></div><span class="status-badge ${i.status}">${i.done} of ${i.total} paid</span></div><div class="progress-track"><div class="progress-fill" style="width:${i.total ? i.done / i.total * 100 : 100}%"></div></div><div class="owe-list">${rows}<div class="owe-row overall"><div class="who"><strong>Everyone has paid</strong><small>${M(owedAmt)} still pending</small></div><label class="switch"><input type="checkbox" role="switch" data-split-all="${s.id}" aria-label="Mark ${E(s.name)} fully settled" ${i.status === 'settled' ? 'checked' : ''}><i></i><span>Overall</span></label></div></div></div>`; }).join('') || '<p style="color:var(--muted)">Nothing pending. Every split is settled. 🎉</p>';
  }
  function people() {
    const all = d0().people; if (!parts) parts = all.slice(); parts = parts.filter((p) => all.includes(p)); if (!parts.includes('You')) parts.unshift('You');
    $('participantsList').innerHTML = all.map((p, i) => `<span class="person-chip ${parts.includes(p) ? 'is-on' : 'is-off'}" data-toggle="${E(p)}" role="button" ${p === 'You' ? '' : 'tabindex="0"'} aria-pressed="${parts.includes(p)}" title="${p === 'You' ? 'You are always in the split' : 'Tap to include or leave out'}">${EM[i % 4]} ${E(p)}</span>`).join('');
    const pb = $('paidBy').value; $('paidBy').innerHTML = parts.map((p) => `<option>${E(p)}</option>`).join(''); if (parts.includes(pb)) $('paidBy').value = pb;
    $('customAmounts').innerHTML = mode === 'custom' ? parts.map((p) => `<label class="settings-form"><span>${E(p)} custom amount</span><input class="custom-person" data-person="${E(p)}" type="number" min="0" step=".01" value="${custom[p] || 0}"></label>`).join('') : '';
  }
  const all = () => { fillSelects(); budget(); txTable(); cats(); $('goalsList').innerHTML = bars(d0().goals, 'goal'); $('poolsList').innerHTML = bars(d0().pools, 'pool'); bills(); friends(); tracker(); people(); };

  /* transactions */
  $('transactionType').onchange = fillSelects;
  form.onsubmit = (e) => {
    e.preventDefault(); const o = { type: $('transactionType').value, category: $('transactionCategory').value, amount: $('transactionAmount').value, date: $('transactionDate').value, description: $('transactionDescription').value, account: $('transactionAccount').value };
    try { editing ? PM.updateTx(editing, o) : PM.addTx(o); say($('txMsg'), editing ? 'Transaction updated.' : 'Transaction added.'); editing = null; form.reset(); $('transactionDate').value = PM.today(); btn.firstChild.textContent = 'Add Transaction '; fillSelects(); } catch (x) { say($('txMsg'), x.message, 1); }
  };
  $('transactionRows').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('delete-action') && confirm('Delete this transaction?')) PM.delTx(b.dataset.id);
    if (b.classList.contains('edit-action')) { const t = d0().transactions.find((x) => x.id === b.dataset.id); editing = t.id; $('transactionType').value = t.type; fillSelects(); $('transactionCategory').value = t.category; $('transactionAmount').value = t.amount; $('transactionDate').value = t.date; $('transactionDescription').value = t.description; $('transactionAccount').value = t.account || 'Cash'; btn.firstChild.textContent = 'Save changes '; say($('txMsg'), 'Editing: change the fields and save.'); form.scrollIntoView({ behavior: 'smooth' }); }
  };
  ['transactionSearch', 'historyCategory', 'historyType'].forEach((id) => ($(id).oninput = txTable));

  /* budget + categories */
  $('editBudgetButton').onclick = () => { const v = prompt('Set your ' + d0().settings.budgetCycle + ' budget', d0().budget || ''); if (v === null) return; const n = Math.round(Number(v) * 100) / 100; if (!(n > 0) || n > 1e8) return alert('Enter an amount greater than 0.'); d0().budget = n; PM.commit(); };
  $('addCategoryButton').onclick = () => { const n = (prompt('Category name') || '').trim().slice(0, 20); if (!n) return; if (d0().categories.some((c) => c.name.toLowerCase() === n.toLowerCase()) || n.toLowerCase() === 'income') return alert('That category already exists.'); d0().categories.push({ name: n, emoji: (prompt('Emoji for ' + n, '🏷️') || '🏷️').trim().slice(0, 4) }); PM.commit(); };
  $('categoryList').onclick = (e) => {
    const b = e.target.closest('.remove-category'); if (!b) return; const c = d0().categories[+b.dataset.i], used = d0().transactions.filter((t) => t.category === c.name);
    if (c.name === 'Others') return alert('“Others” is the fallback category and cannot be removed.');
    if (used.length && !confirm(`${used.length} transaction(s) use “${c.name}”. Move them to Others and remove it?`)) return;
    if (!d0().categories.some((x) => x.name === 'Others')) d0().categories.push({ name: 'Others', emoji: '🏷️' });
    used.forEach((t) => (t.category = 'Others')); d0().categories.splice(d0().categories.indexOf(c), 1); PM.commit();
  };

  /* goals, pools, bills */
  const money = (m, def) => { const n = Math.round(Number(prompt(m, def || '')) * 100) / 100; return n > 0 && n <= 1e9 ? n : null; };
  const add = (kind) => () => { const n = (prompt(kind + ' name') || '').trim().slice(0, 30); if (!n) return; const t = money('Target amount', 10000); if (!t) return alert('Enter a valid target.'); d0()[kind === 'Goal' ? 'goals' : 'pools'].push({ id: PM.uid(), name: n, saved: 0, target: t, emoji: kind === 'Goal' ? '🎯' : '🤝' }); PM.commit(); };
  $('addGoalButton').onclick = add('Goal'); $('addPoolButton').onclick = add('Pool');
  const listClick = (e) => {
    const b = e.target.closest('[data-kind]'); if (!b) return; const key = b.dataset.kind === 'goal' ? 'goals' : 'pools', it = d0()[key].find((x) => x.id === b.dataset.id);
    if (b.dataset.act === 'del' && confirm('Remove “' + it.name + '”?')) { d0()[key] = d0()[key].filter((x) => x !== it); PM.commit(); }
    if (b.dataset.act === 'add') { const a = money('Amount to add to ' + it.name); if (a) { it.saved = Math.round((it.saved + a) * 100) / 100; PM.commit(); } }
  };
  $('goalsList').onclick = listClick; $('poolsList').onclick = listClick;
  $('addBillButton').onclick = () => { const n = (prompt('Bill name') || '').trim().slice(0, 30); if (!n) return; const a = money('Amount'); const day = Math.round(Number(prompt('Due day of month (1-31)', '1'))); if (!a || !(day >= 1 && day <= 31)) return alert('Enter a valid amount and day.'); d0().bills.push({ id: PM.uid(), name: n, amount: a, day, auto: confirm('Is this an autopay bill? OK = autopay, Cancel = manual'), icon: '▣' }); PM.processBills(); PM.commit(); };
  $('billsList').onclick = (e) => { const b = e.target.closest('[data-bill]'); if (!b) return; if (b.dataset.act === 'pay') PM.payBill(b.dataset.bill); else if (confirm('Remove this bill?')) { d0().bills = d0().bills.filter((x) => x.id !== b.dataset.bill); PM.commit(); } };

  /* split + friends */
  $('addPersonButton').onclick = () => { const n = $('personName').value.trim().slice(0, 24); if (!n || n.toLowerCase() === 'you' || d0().people.some((p) => p.toLowerCase() === n.toLowerCase())) return; d0().people.push(n); parts.push(n); $('personName').value = ''; PM.commit(); };
  const chipToggle = (e) => { const c = e.target.closest('[data-toggle]'), t = c && c.dataset.toggle; if (!t || t === 'You') return; parts = parts.includes(t) ? parts.filter((p) => p !== t) : [...parts, t]; last = null; people(); };
  $('participantsList').onclick = chipToggle; $('participantsList').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chipToggle(e); } };
  document.querySelectorAll('.split-options button').forEach((b) => (b.onclick = () => { document.querySelectorAll('.split-options button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); mode = b.dataset.mode; people(); }));
  $('customAmounts').oninput = (e) => { if (e.target.dataset.person) custom[e.target.dataset.person] = +e.target.value; };
  $('splitForm').onsubmit = (e) => {
    e.preventDefault(); const total = Math.round((+$('splitAmount').value || 0) * 100) / 100, name = $('splitName').value.trim();
    if (!name || !(total > 0)) return alert('Enter a name and an amount above 0.'); if (parts.length < 2) return alert('Pick at least one friend to split with.');
    let shares; if (mode === 'equal') shares = PM.splitEqual(total, parts); else { shares = Object.fromEntries(parts.map((p) => [p, Math.round((+document.querySelector('.custom-person[data-person="' + p + '"]').value || 0) * 100) / 100])); if (Math.round(Object.values(shares).reduce((a, b) => a + b, 0) * 100) !== Math.round(total * 100)) return alert('Custom amounts must add up to ' + M(total) + '.'); }
    last = { name, total, paidBy: $('paidBy').value, shares };
    $('splitResult').innerHTML = `<div class="split-result-title">${E(name)} · ${mode === 'equal' ? 'Equal' : 'Custom'} split</div><div class="split-people">${parts.map((p, i) => `<div class="split-person"><i class="avatar-mini">${EM[i % 4]}</i><span>${E(p)}</span><b>${M(shares[p])}</b></div>`).join('')}</div>`;
  };
  $('saveSplitButton').onclick = () => { if (!last) return alert('Calculate the split first.'); const rec = PM.saveSplit(last); last = null; $('splitResult').innerHTML = '<div class="split-result-title">Saved “' + E(rec.name) + '”. Track who has paid in the Split Tracker below.</div>'; setTimeout(() => $('splits').scrollIntoView({ behavior: 'smooth' }), 150); $('splitName').value = ''; $('splitAmount').value = ''; custom = {}; };
  $('splits').addEventListener('change', (e) => { const t = e.target; if (t.dataset.splitAll) PM.setAllPaid(t.dataset.splitAll, t.checked); else if (t.dataset.splitId) PM.setPaid(t.dataset.splitId, t.dataset.person, t.checked); });
  $('splits').addEventListener('click', (e) => { const b = e.target.closest('[data-del-split]'); if (b && confirm('Delete this split and the expense it created?')) PM.delSplit(b.dataset.delSplit); });

  all(); PM.onData(all);
  if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
});
