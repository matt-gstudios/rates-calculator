/* ═══════════════════════════════════════════════════════════════════
   RATES CALCULATOR — client app
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
let deliverables  = [];   // KB: deliverable types
let studios       = [];   // KB: studio hire definitions
let extrasCatalog = [];   // KB: extras definitions

let quoteItems    = [];   // QB: current deliverable line items
let studioItems   = [];   // QB: current studio hire line items
let quoteExtras   = [];   // QB: current extras line items

let quotes        = [];   // saved quotes

// Studio form state
let studioFormBlocks = []; // [{hours, price}] being edited

// ─── Utility ─────────────────────────────────────────────────────────────────

function fmt(amount, currency = 'AUD') {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(amount);
}

function fmtHrs(h) { return `${parseFloat(h).toFixed(1)} hrs`; }

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function escape(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function unitLabel(unit) {
  return { item: 'per item', day: 'per day', 'half-day': 'per half-day', session: 'per session' }[unit] || unit;
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function toast(msg, type = 'default', duration = 3000) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast${type !== 'default' ? ' ' + type : ''}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  el.innerHTML = `<span>${icon}</span> <span>${escape(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error((json && json.error) || `HTTP ${r.status}`);
  return json;
}

// ─── Tab navigation ──────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(id).classList.add('active');
    });
  });
}

function switchToTab(id) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${id}"]`).classList.add('active');
  document.getElementById(id).classList.add('active');
}

function updateQuotesBadge() {
  const badge = document.getElementById('quotes-badge');
  badge.textContent = quotes.length;
  badge.hidden = quotes.length === 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  KB — DELIVERABLES
// ═══════════════════════════════════════════════════════════════════════════════

async function loadDeliverables() {
  deliverables = await api('GET', '/api/deliverables');
  renderDeliverables();
  renderDeliverablePicker();
}

function renderDeliverables() {
  const tbody     = document.getElementById('deliverables-tbody');
  const empty     = document.getElementById('kb-empty');
  const tableWrap = document.getElementById('kb-table-wrap');

  if (deliverables.length === 0) { empty.hidden = false; tableWrap.hidden = true; return; }
  empty.hidden = true; tableWrap.hidden = false;

  tbody.innerHTML = deliverables.map(d => {
    const total = (d.minShootHours || 0) + (d.minEditHours || 0);
    return `
    <tr>
      <td class="del-name">${escape(d.name)}</td>
      <td class="text-center"><span class="hour-chip">${d.minShootHours}</span></td>
      <td class="text-center"><span class="hour-chip">${d.minEditHours}</span></td>
      <td class="text-center"><span class="hour-chip total">${total}</span></td>
      <td class="notes-cell ${d.notes ? '' : 'empty'}">${d.notes ? escape(d.notes) : 'No notes'}</td>
      <td><div class="row-actions">
        <button class="btn-icon" title="Edit"   onclick="editDeliverable('${d.id}')">✏️</button>
        <button class="btn-icon danger" title="Delete" onclick="deleteDeliverable('${d.id}')">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

function renderDeliverablePicker() {
  const picker = document.getElementById('deliverable-picker');
  const saved  = picker.value;
  picker.innerHTML = `<option value="">— Pick from Knowledge Base —</option>` +
    deliverables.map(d =>
      `<option value="${d.id}">${escape(d.name)} (shoot: ${d.minShootHours}h, edit: ${d.minEditHours}h)</option>`
    ).join('');
  if (saved) picker.value = saved;
}

function showDeliverableForm(d = null) {
  const card = document.getElementById('deliverable-form-card');
  document.getElementById('form-title').textContent = d ? 'Edit Deliverable' : 'New Deliverable';
  document.getElementById('edit-id').value    = d ? d.id : '';
  document.getElementById('del-name').value   = d ? d.name : '';
  document.getElementById('del-shoot').value  = d ? d.minShootHours : '';
  document.getElementById('del-edit').value   = d ? d.minEditHours  : '';
  document.getElementById('del-notes').value  = d ? d.notes : '';
  card.hidden = false;
  card.classList.add('slide-in');
  document.getElementById('del-name').focus();
  document.getElementById('add-deliverable-btn').textContent = '✕ Cancel';
}

function hideDeliverableForm() {
  document.getElementById('deliverable-form-card').hidden = true;
  document.getElementById('deliverable-form').reset();
  document.getElementById('edit-id').value = '';
  document.getElementById('add-deliverable-btn').textContent = '+ New Deliverable';
}

function editDeliverable(id) {
  const d = deliverables.find(x => x.id === id);
  if (d) showDeliverableForm(d);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteDeliverable(id) {
  const d = deliverables.find(x => x.id === id);
  if (!d || !confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/api/deliverables/${id}`);
    deliverables = deliverables.filter(x => x.id !== id);
    renderDeliverables();
    renderDeliverablePicker();
    quoteItems = quoteItems.filter(qi => qi.deliverableId !== id);
    renderQuoteItems(); updateSummary();
    toast(`"${d.name}" deleted.`);
  } catch (err) { toast(err.message, 'error'); }
}

function initKnowledgeBase() {
  document.getElementById('add-deliverable-btn').addEventListener('click', () => {
    const card = document.getElementById('deliverable-form-card');
    card.hidden ? showDeliverableForm() : hideDeliverableForm();
  });
  document.getElementById('cancel-form-btn').addEventListener('click', hideDeliverableForm);

  document.getElementById('deliverable-form').addEventListener('submit', async e => {
    e.preventDefault();
    const id    = document.getElementById('edit-id').value;
    const name  = document.getElementById('del-name').value.trim();
    const shoot = parseFloat(document.getElementById('del-shoot').value) || 0;
    const edit  = parseFloat(document.getElementById('del-edit').value)  || 0;
    const notes = document.getElementById('del-notes').value.trim();
    if (!name) { toast('Please enter a deliverable name.', 'error'); return; }
    const payload = { name, minShootHours: shoot, minEditHours: edit, notes };
    try {
      if (id) {
        const updated = await api('PUT', `/api/deliverables/${id}`, payload);
        const idx = deliverables.findIndex(d => d.id === id);
        if (idx !== -1) deliverables[idx] = updated;
        toast(`"${name}" updated!`, 'success');
      } else {
        const created = await api('POST', '/api/deliverables', payload);
        deliverables.push(created);
        toast(`"${name}" added!`, 'success');
      }
      renderDeliverables(); renderDeliverablePicker(); hideDeliverableForm();
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  KB — STUDIOS
// ═══════════════════════════════════════════════════════════════════════════════

async function loadStudios() {
  studios = await api('GET', '/api/studios');
  renderStudios();
  renderStudioPicker();
}

function renderStudios() {
  const grid = document.getElementById('studios-grid');

  if (studios.length === 0) {
    grid.innerHTML = `<div class="card empty-state" style="grid-column: 1/-1">
      <div class="empty-icon">🏢</div>
      <p class="empty-title">No studios yet</p>
      <p class="empty-sub">Click <strong>+ New Studio</strong> above to add one.</p>
    </div>`;
    return;
  }

  grid.innerHTML = studios.map(s => `
    <div class="studio-kb-card">
      <div class="studio-kb-header">
        <span class="studio-kb-name">${escape(s.name)}</span>
        <div class="row-actions">
          <button class="btn-icon" title="Edit"   onclick="editStudio('${s.id}')">✏️</button>
          <button class="btn-icon danger" title="Delete" onclick="deleteStudio('${s.id}')">🗑</button>
        </div>
      </div>
      <div class="studio-kb-body">
        ${s.blocks && s.blocks.length > 0
          ? s.blocks.map(b => `
            <div class="studio-block-row">
              <span class="studio-block-label">${b.hours}hr block</span>
              <span class="studio-block-price">${fmt(b.price)}</span>
            </div>`).join('')
          : `<div class="studio-kb-empty">No time blocks defined</div>`
        }
      </div>
    </div>`).join('');
}

function renderStudioPicker() {
  const picker = document.getElementById('studio-picker');
  const saved  = picker.value;
  picker.innerHTML = `<option value="">— Select Studio —</option>` +
    studios.map(s => `<option value="${s.id}">${escape(s.name)}</option>`).join('');
  if (saved) { picker.value = saved; updateBlockPicker(); }
}

function updateBlockPicker() {
  const studioId = document.getElementById('studio-picker').value;
  const blockPicker = document.getElementById('block-picker');
  const studio = studios.find(s => s.id === studioId);

  if (!studio || !studio.blocks || studio.blocks.length === 0) {
    blockPicker.innerHTML = `<option value="">— Select Block —</option>`;
    blockPicker.disabled = true;
    return;
  }

  blockPicker.disabled = false;
  blockPicker.innerHTML = `<option value="">— Select Block —</option>` +
    studio.blocks.map(b =>
      `<option value="${b.id}" data-price="${b.price}" data-hours="${b.hours}">${b.hours}hr block — ${fmt(b.price)}</option>`
    ).join('');
}

// ── Studio form ──────────────────────────────────────────────────

function renderStudioFormBlocks() {
  const list = document.getElementById('studio-blocks-list');
  if (studioFormBlocks.length === 0) {
    list.innerHTML = `<div class="blocks-empty-hint">No blocks yet — click <strong>+ Add Block</strong> above.</div>`;
    return;
  }
  list.innerHTML = studioFormBlocks.map((b, i) => `
    <div class="block-edit-row">
      <div class="block-hours-wrap">
        <input type="number" class="block-hours-input" data-idx="${i}"
          value="${b.hours}" min="0.5" step="0.5" placeholder="Hrs" />
        <span class="block-hrs-label">hr</span>
      </div>
      <div class="input-affix-wrap">
        <span class="input-prefix">$</span>
        <input type="number" class="block-price-input has-prefix" data-idx="${i}"
          value="${b.price}" min="0" step="1" placeholder="0" />
      </div>
      <button type="button" class="btn-icon danger" onclick="removeStudioFormBlock(${i})" title="Remove">✕</button>
    </div>`).join('');

  // Sync inputs back to studioFormBlocks on change
  list.querySelectorAll('.block-hours-input').forEach(inp =>
    inp.addEventListener('change', e => {
      studioFormBlocks[+e.target.dataset.idx].hours = parseFloat(e.target.value) || 0;
    })
  );
  list.querySelectorAll('.block-price-input').forEach(inp =>
    inp.addEventListener('change', e => {
      studioFormBlocks[+e.target.dataset.idx].price = parseFloat(e.target.value) || 0;
    })
  );
}

function addStudioFormBlock() {
  studioFormBlocks.push({ hours: '', price: '' });
  renderStudioFormBlocks();
  // Focus the new hours input
  const inputs = document.querySelectorAll('.block-hours-input');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function removeStudioFormBlock(idx) {
  studioFormBlocks.splice(idx, 1);
  renderStudioFormBlocks();
}

function showStudioForm(studio = null) {
  const card = document.getElementById('studio-form-card');
  document.getElementById('studio-form-title').textContent = studio ? 'Edit Studio' : 'New Studio';
  document.getElementById('studio-edit-id').value       = studio ? studio.id : '';
  document.getElementById('studio-name-input').value    = studio ? studio.name : '';
  studioFormBlocks = studio ? studio.blocks.map(b => ({ hours: b.hours, price: b.price, id: b.id })) : [];
  renderStudioFormBlocks();
  card.hidden = false;
  card.classList.add('slide-in');
  document.getElementById('studio-name-input').focus();
  document.getElementById('add-studio-btn').textContent = '✕ Cancel';
}

function hideStudioForm() {
  document.getElementById('studio-form-card').hidden = true;
  document.getElementById('studio-form').reset();
  document.getElementById('studio-edit-id').value = '';
  studioFormBlocks = [];
  document.getElementById('add-studio-btn').textContent = '+ New Studio';
}

function editStudio(id) {
  const s = studios.find(x => x.id === id);
  if (s) showStudioForm(s);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteStudio(id) {
  const s = studios.find(x => x.id === id);
  if (!s || !confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/api/studios/${id}`);
    studios = studios.filter(x => x.id !== id);
    renderStudios(); renderStudioPicker();
    studioItems = studioItems.filter(si => si.studioId !== id);
    renderStudioItems(); updateSummary();
    toast(`"${s.name}" deleted.`);
  } catch (err) { toast(err.message, 'error'); }
}

function initStudios() {
  document.getElementById('add-studio-btn').addEventListener('click', () => {
    const card = document.getElementById('studio-form-card');
    card.hidden ? showStudioForm() : hideStudioForm();
  });
  document.getElementById('cancel-studio-btn').addEventListener('click', hideStudioForm);
  document.getElementById('add-block-btn').addEventListener('click', addStudioFormBlock);

  document.getElementById('studio-form').addEventListener('submit', async e => {
    e.preventDefault();
    const id   = document.getElementById('studio-edit-id').value;
    const name = document.getElementById('studio-name-input').value.trim();
    if (!name) { toast('Please enter a studio name.', 'error'); return; }

    // Read current values from inputs (in case user didn't blur)
    document.querySelectorAll('.block-hours-input').forEach(inp =>
      studioFormBlocks[+inp.dataset.idx].hours = parseFloat(inp.value) || 0);
    document.querySelectorAll('.block-price-input').forEach(inp =>
      studioFormBlocks[+inp.dataset.idx].price = parseFloat(inp.value) || 0);

    const payload = { name, blocks: studioFormBlocks };
    try {
      if (id) {
        const updated = await api('PUT', `/api/studios/${id}`, payload);
        const idx = studios.findIndex(s => s.id === id);
        if (idx !== -1) studios[idx] = updated;
        toast(`"${name}" updated!`, 'success');
      } else {
        const created = await api('POST', '/api/studios', payload);
        studios.push(created);
        toast(`"${name}" added!`, 'success');
      }
      renderStudios(); renderStudioPicker(); hideStudioForm();
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  KB — EXTRAS
// ═══════════════════════════════════════════════════════════════════════════════

async function loadExtras() {
  extrasCatalog = await api('GET', '/api/extras');
  renderExtras();
  renderExtraPicker();
}

function renderExtras() {
  const tbody     = document.getElementById('extras-tbody');
  const empty     = document.getElementById('extras-empty');
  const tableWrap = document.getElementById('extras-table-wrap');

  if (extrasCatalog.length === 0) { empty.hidden = false; tableWrap.hidden = true; return; }
  empty.hidden = true; tableWrap.hidden = false;

  tbody.innerHTML = extrasCatalog.map(e => `
    <tr>
      <td class="del-name">${escape(e.name)}</td>
      <td class="text-right"><strong>${fmt(e.price)}</strong></td>
      <td class="text-center"><span class="unit-pill">${escape(unitLabel(e.unit))}</span></td>
      <td><div class="row-actions">
        <button class="btn-icon" title="Edit"   onclick="editExtra('${e.id}')">✏️</button>
        <button class="btn-icon danger" title="Delete" onclick="deleteExtra('${e.id}')">🗑</button>
      </div></td>
    </tr>`).join('');
}

function renderExtraPicker() {
  const picker = document.getElementById('extra-picker');
  const saved  = picker.value;
  picker.innerHTML = `<option value="">— Select Extra —</option>` +
    extrasCatalog.map(e =>
      `<option value="${e.id}">${escape(e.name)} (${fmt(e.price)} ${unitLabel(e.unit)})</option>`
    ).join('');
  if (saved) picker.value = saved;
}

function showExtraForm(ex = null) {
  const card = document.getElementById('extra-form-card');
  document.getElementById('extra-form-title').textContent = ex ? 'Edit Extra' : 'New Extra';
  document.getElementById('extra-edit-id').value       = ex ? ex.id : '';
  document.getElementById('extra-name-input').value    = ex ? ex.name : '';
  document.getElementById('extra-price-input').value   = ex ? ex.price : '';
  document.getElementById('extra-unit-input').value    = ex ? ex.unit : 'item';
  card.hidden = false;
  card.classList.add('slide-in');
  document.getElementById('extra-name-input').focus();
  document.getElementById('add-extra-btn').textContent = '✕ Cancel';
}

function hideExtraForm() {
  document.getElementById('extra-form-card').hidden = true;
  document.getElementById('extra-form').reset();
  document.getElementById('extra-edit-id').value = '';
  document.getElementById('add-extra-btn').textContent = '+ New Extra';
}

function editExtra(id) {
  const e = extrasCatalog.find(x => x.id === id);
  if (e) showExtraForm(e);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteExtra(id) {
  const e = extrasCatalog.find(x => x.id === id);
  if (!e || !confirm(`Delete "${e.name}"? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/api/extras/${id}`);
    extrasCatalog = extrasCatalog.filter(x => x.id !== id);
    renderExtras(); renderExtraPicker();
    quoteExtras = quoteExtras.filter(qi => qi.extraId !== id);
    renderQuoteExtras(); updateSummary();
    toast(`"${e.name}" deleted.`);
  } catch (err) { toast(err.message, 'error'); }
}

function initExtras() {
  document.getElementById('add-extra-btn').addEventListener('click', () => {
    const card = document.getElementById('extra-form-card');
    card.hidden ? showExtraForm() : hideExtraForm();
  });
  document.getElementById('cancel-extra-btn').addEventListener('click', hideExtraForm);

  document.getElementById('extra-form').addEventListener('submit', async e => {
    e.preventDefault();
    const id    = document.getElementById('extra-edit-id').value;
    const name  = document.getElementById('extra-name-input').value.trim();
    const price = parseFloat(document.getElementById('extra-price-input').value) || 0;
    const unit  = document.getElementById('extra-unit-input').value;
    if (!name) { toast('Please enter a name.', 'error'); return; }
    const payload = { name, price, unit };
    try {
      if (id) {
        const updated = await api('PUT', `/api/extras/${id}`, payload);
        const idx = extrasCatalog.findIndex(x => x.id === id);
        if (idx !== -1) extrasCatalog[idx] = updated;
        toast(`"${name}" updated!`, 'success');
      } else {
        const created = await api('POST', '/api/extras', payload);
        extrasCatalog.push(created);
        toast(`"${name}" added!`, 'success');
      }
      renderExtras(); renderExtraPicker(); hideExtraForm();
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  QUOTE BUILDER — DELIVERABLES
// ═══════════════════════════════════════════════════════════════════════════════

function renderQuoteItems() {
  const empty   = document.getElementById('qi-empty');
  const wrapper = document.getElementById('qi-wrapper');
  const list    = document.getElementById('qi-list');

  if (quoteItems.length === 0) { empty.hidden = false; wrapper.hidden = true; return; }
  empty.hidden = true; wrapper.hidden = false;

  list.innerHTML = quoteItems.map((item, idx) => {
    const totalHrs = ((item.shootHours || 0) + (item.editHours || 0)) * (item.qty || 1);
    return `
    <div class="quote-item" data-index="${idx}">
      <div class="qi-name">
        <strong>${escape(item.deliverableName)}</strong>
        <small>Min: ${item.minShootHours}h shoot + ${item.minEditHours}h edit</small>
      </div>
      <div class="qi-num-wrap">
        <input type="number" class="qi-shoot" value="${item.shootHours}"
          min="${item.minShootHours}" step="0.5" data-index="${idx}" title="Shoot hours (min ${item.minShootHours})" />
        <span class="qi-hint">min ${item.minShootHours}h</span>
      </div>
      <div class="qi-num-wrap">
        <input type="number" class="qi-edit" value="${item.editHours}"
          min="${item.minEditHours}" step="0.5" data-index="${idx}" title="Edit hours (min ${item.minEditHours})" />
        <span class="qi-hint">min ${item.minEditHours}h</span>
      </div>
      <div class="qi-num-wrap">
        <input type="number" class="qi-qty" value="${item.qty}" min="1" step="1"
          data-index="${idx}" title="Quantity" />
      </div>
      <div class="qi-total">${totalHrs.toFixed(1)}</div>
      <div class="qi-remove">
        <button onclick="removeQuoteItem(${idx})" title="Remove">✕</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.qi-shoot').forEach(inp =>
    inp.addEventListener('change', e => {
      const i = +e.target.dataset.index;
      const min = quoteItems[i].minShootHours;
      let val = parseFloat(e.target.value) || 0;
      if (val < min) { val = min; e.target.value = val; }
      quoteItems[i].shootHours = val;
      refreshQuoteItemTotal(i); updateSummary();
    }));
  list.querySelectorAll('.qi-edit').forEach(inp =>
    inp.addEventListener('change', e => {
      const i = +e.target.dataset.index;
      const min = quoteItems[i].minEditHours;
      let val = parseFloat(e.target.value) || 0;
      if (val < min) { val = min; e.target.value = val; }
      quoteItems[i].editHours = val;
      refreshQuoteItemTotal(i); updateSummary();
    }));
  list.querySelectorAll('.qi-qty').forEach(inp =>
    inp.addEventListener('change', e => {
      const i = +e.target.dataset.index;
      let val = parseInt(e.target.value) || 1;
      if (val < 1) { val = 1; e.target.value = val; }
      quoteItems[i].qty = val;
      refreshQuoteItemTotal(i); updateSummary();
    }));
}

function refreshQuoteItemTotal(idx) {
  const item  = quoteItems[idx];
  const total = ((item.shootHours || 0) + (item.editHours || 0)) * (item.qty || 1);
  const el    = document.querySelector(`.quote-item[data-index="${idx}"] .qi-total`);
  if (el) el.textContent = total.toFixed(1);
}

function removeQuoteItem(idx) {
  quoteItems.splice(idx, 1);
  renderQuoteItems(); updateSummary();
}

function addDeliverableToQuote() {
  const picker = document.getElementById('deliverable-picker');
  const id = picker.value;
  if (!id) { toast('Please select a deliverable first.', 'error'); return; }
  const d = deliverables.find(x => x.id === id);
  if (!d) return;
  quoteItems.push({
    deliverableId: d.id, deliverableName: d.name,
    minShootHours: d.minShootHours, minEditHours: d.minEditHours,
    shootHours: d.minShootHours, editHours: d.minEditHours, qty: 1
  });
  picker.value = '';
  renderQuoteItems(); updateSummary();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  QUOTE BUILDER — STUDIO HIRE
// ═══════════════════════════════════════════════════════════════════════════════

function renderStudioItems() {
  const empty = document.getElementById('si-empty');
  const list  = document.getElementById('si-list');

  if (studioItems.length === 0) { empty.hidden = false; list.hidden = true; return; }
  empty.hidden = true; list.hidden = false;

  const currency = document.getElementById('currency').value;
  list.innerHTML = `<div class="flat-items-list">` +
    studioItems.map((item, idx) => `
      <div class="flat-item">
        <div>
          <span class="flat-name">${escape(item.studioName)}</span>
          <span class="flat-detail">${item.blockHours}hr block</span>
        </div>
        <span class="flat-qty">×${item.qty}</span>
        <span class="flat-price">${fmt(item.blockPrice * item.qty, currency)}</span>
        <div class="flat-remove">
          <button onclick="removeStudioItem(${idx})" title="Remove">✕</button>
        </div>
      </div>`).join('') +
    `</div>`;
}

function removeStudioItem(idx) {
  studioItems.splice(idx, 1);
  renderStudioItems(); updateSummary();
}

function addStudioToQuote() {
  const studioId   = document.getElementById('studio-picker').value;
  const blockPicker = document.getElementById('block-picker');
  const blockId    = blockPicker.value;

  if (!studioId) { toast('Please select a studio.', 'error'); return; }
  if (!blockId)  { toast('Please select a time block.', 'error'); return; }

  const studio  = studios.find(s => s.id === studioId);
  const block   = studio?.blocks.find(b => b.id === blockId);
  if (!studio || !block) return;

  studioItems.push({
    studioId:   studio.id,
    studioName: studio.name,
    blockId:    block.id,
    blockHours: block.hours,
    blockPrice: block.price,
    qty: 1
  });

  document.getElementById('studio-picker').value = '';
  blockPicker.innerHTML = `<option value="">— Select Block —</option>`;
  blockPicker.disabled = true;
  renderStudioItems(); updateSummary();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  QUOTE BUILDER — EXTRAS
// ═══════════════════════════════════════════════════════════════════════════════

function renderQuoteExtras() {
  const empty = document.getElementById('ei-empty');
  const list  = document.getElementById('ei-list');

  if (quoteExtras.length === 0) { empty.hidden = false; list.hidden = true; return; }
  empty.hidden = true; list.hidden = false;

  const currency = document.getElementById('currency').value;
  list.innerHTML = `<div class="flat-items-list">` +
    quoteExtras.map((item, idx) => `
      <div class="flat-item">
        <div>
          <span class="flat-name">${escape(item.extraName)}</span>
          <span class="flat-detail">${unitLabel(item.unit)}</span>
        </div>
        <span class="flat-qty">×${item.qty}</span>
        <span class="flat-price">${fmt(item.price * item.qty, currency)}</span>
        <div class="flat-remove">
          <button onclick="removeQuoteExtra(${idx})" title="Remove">✕</button>
        </div>
      </div>`).join('') +
    `</div>`;
}

function removeQuoteExtra(idx) {
  quoteExtras.splice(idx, 1);
  renderQuoteExtras(); updateSummary();
}

function addExtraToQuote() {
  const picker = document.getElementById('extra-picker');
  const id     = picker.value;
  const qty    = Math.max(1, parseInt(document.getElementById('extra-qty-input').value) || 1);

  if (!id) { toast('Please select an extra first.', 'error'); return; }
  const ex = extrasCatalog.find(x => x.id === id);
  if (!ex) return;

  quoteExtras.push({
    extraId: ex.id, extraName: ex.name,
    price: ex.price, unit: ex.unit, qty
  });

  picker.value = '';
  document.getElementById('extra-qty-input').value = 1;
  renderQuoteExtras(); updateSummary();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  QUOTE BUILDER — CALCULATION & SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

function calcSummary() {
  const shootRate = parseFloat(document.getElementById('shoot-rate').value)   || 0;
  const editRate  = parseFloat(document.getElementById('edit-rate').value)    || 0;
  const margin    = parseFloat(document.getElementById('profit-margin').value) || 0;

  let totalShoot = 0, totalEdit = 0;
  quoteItems.forEach(item => {
    const qty = item.qty || 1;
    totalShoot += (item.shootHours || 0) * qty;
    totalEdit  += (item.editHours  || 0) * qty;
  });

  const totalHrs  = totalShoot + totalEdit;
  const shootCost = totalShoot * shootRate;
  const editCost  = totalEdit  * editRate;

  const studioCost = studioItems.reduce((sum, si) => sum + si.blockPrice * (si.qty || 1), 0);
  const extrasCost = quoteExtras.reduce((sum, ei) => sum + ei.price * (ei.qty || 1), 0);

  const baseCost   = shootCost + editCost + studioCost + extrasCost;
  const profitAmt  = baseCost * (margin / 100);
  const finalPrice = baseCost + profitAmt;

  return { shootRate, editRate, margin, totalShoot, totalEdit, totalHrs,
           shootCost, editCost, studioCost, extrasCost, baseCost, profitAmt, finalPrice };
}

function updateSummary() {
  const currency = document.getElementById('currency').value;
  const {
    shootRate, editRate, margin, totalShoot, totalEdit, totalHrs,
    shootCost, editCost, studioCost, extrasCost, baseCost, profitAmt, finalPrice
  } = calcSummary();

  document.getElementById('sum-shoot').textContent     = fmtHrs(totalShoot);
  document.getElementById('sum-edit').textContent      = fmtHrs(totalEdit);
  document.getElementById('sum-total-hrs').textContent = fmtHrs(totalHrs);
  document.getElementById('sum-shoot-cost').textContent = fmt(shootCost, currency);
  document.getElementById('sum-edit-cost').textContent  = fmt(editCost,  currency);
  document.getElementById('sum-shoot-sub').textContent  = `${fmtHrs(totalShoot)} × ${fmt(shootRate, currency)}/hr`;
  document.getElementById('sum-edit-sub').textContent   = `${fmtHrs(totalEdit)}  × ${fmt(editRate,  currency)}/hr`;

  const studioRow = document.getElementById('sum-studio-row');
  const extrasRow = document.getElementById('sum-extras-row');
  studioRow.hidden = studioCost === 0;
  extrasRow.hidden = extrasCost === 0;
  document.getElementById('sum-studio').textContent = fmt(studioCost, currency);
  document.getElementById('sum-extras').textContent = fmt(extrasCost, currency);

  document.getElementById('sum-base').textContent       = fmt(baseCost,   currency);
  document.getElementById('sum-profit').textContent     = fmt(profitAmt,  currency);
  document.getElementById('sum-margin-pct').textContent = margin;
  document.getElementById('sum-final').textContent      = fmt(finalPrice, currency);
  document.getElementById('sum-currency').textContent   = currency;

  // Per-deliverable breakdown
  const breakdownEl   = document.getElementById('summary-breakdown');
  const breakdownList = document.getElementById('breakdown-list');
  const hasBreakdown  = quoteItems.length > 0 || studioItems.length > 0 || quoteExtras.length > 0;

  if (hasBreakdown) {
    breakdownEl.hidden = false;
    const deliverableLines = quoteItems.map(item => {
      const qty  = item.qty || 1;
      const sHrs = (item.shootHours || 0) * qty;
      const eHrs = (item.editHours  || 0) * qty;
      const cost = sHrs * shootRate + eHrs * editRate;
      return `<div class="breakdown-item">
        <span><strong>${escape(item.deliverableName)}</strong>${qty > 1 ? ` ×${qty}` : ''}</span>
        <span>${fmtHrs(sHrs + eHrs)} → ${fmt(cost, currency)}</span>
      </div>`;
    });
    const studioLines = studioItems.map(si => {
      const total = si.blockPrice * (si.qty || 1);
      return `<div class="breakdown-item">
        <span>🏢 <strong>${escape(si.studioName)}</strong> ${si.blockHours}hr${si.qty > 1 ? ` ×${si.qty}` : ''}</span>
        <span>${fmt(total, currency)}</span>
      </div>`;
    });
    const extraLines = quoteExtras.map(ei => {
      const total = ei.price * (ei.qty || 1);
      return `<div class="breakdown-item">
        <span>✨ <strong>${escape(ei.extraName)}</strong>${ei.qty > 1 ? ` ×${ei.qty}` : ''}</span>
        <span>${fmt(total, currency)}</span>
      </div>`;
    });
    breakdownList.innerHTML = [...deliverableLines, ...studioLines, ...extraLines].join('');
  } else {
    breakdownEl.hidden = true;
  }

  // Refresh flat item prices when currency changes
  renderStudioItems();
  renderQuoteExtras();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  QUOTE BUILDER — SAVE / CLEAR / LOAD
// ═══════════════════════════════════════════════════════════════════════════════

async function saveCurrentQuote() {
  const currency = document.getElementById('currency').value;
  const {
    shootRate, editRate, margin, totalShoot, totalEdit, totalHrs,
    shootCost, editCost, studioCost, extrasCost, baseCost, profitAmt, finalPrice
  } = calcSummary();

  if (quoteItems.length === 0 && studioItems.length === 0 && quoteExtras.length === 0) {
    toast('Add at least one item before saving.', 'error');
    return;
  }

  const payload = {
    jobTitle:     document.getElementById('job-title').value.trim(),
    clientName:   document.getElementById('client-name').value.trim(),
    description:  document.getElementById('job-desc').value.trim(),
    items: quoteItems.map(item => ({
      deliverableId: item.deliverableId, deliverableName: item.deliverableName,
      minShootHours: item.minShootHours, minEditHours: item.minEditHours,
      shootHours: item.shootHours, editHours: item.editHours, qty: item.qty
    })),
    studioItems: studioItems.map(si => ({
      studioId: si.studioId, studioName: si.studioName,
      blockId: si.blockId, blockHours: si.blockHours,
      blockPrice: si.blockPrice, qty: si.qty
    })),
    extraItems: quoteExtras.map(ei => ({
      extraId: ei.extraId, extraName: ei.extraName,
      price: ei.price, unit: ei.unit, qty: ei.qty
    })),
    shootRate, editRate, profitMargin: margin, currency,
    totalShootHours: totalShoot, totalEditHours: totalEdit, totalHours: totalHrs,
    shootCost, editCost, studioCost, extrasCost, baseCost,
    profitAmount: profitAmt, finalPrice
  };

  try {
    const saved = await api('POST', '/api/quotes', payload);
    quotes.unshift(saved);
    updateQuotesBadge(); renderSavedQuotes();
    toast('Quote saved! 🎉', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

function clearQuote() {
  const hasContent = quoteItems.length > 0 || studioItems.length > 0 || quoteExtras.length > 0 ||
    document.getElementById('job-title').value || document.getElementById('client-name').value;
  if (!hasContent) return;
  if (!confirm('Clear the current quote? This will remove all items and job details.')) return;
  quoteItems = []; studioItems = []; quoteExtras = [];
  document.getElementById('job-title').value   = '';
  document.getElementById('client-name').value = '';
  document.getElementById('job-desc').value    = '';
  renderQuoteItems(); renderStudioItems(); renderQuoteExtras(); updateSummary();
}

function loadQuoteIntoBuilder(quote) {
  if (!confirm('Load this quote into the builder? It will replace your current work.')) return;
  quoteItems  = (quote.items       || []).map(it => ({ ...it }));
  studioItems = (quote.studioItems || []).map(si => ({ ...si }));
  quoteExtras = (quote.extraItems  || []).map(ei => ({ ...ei }));
  document.getElementById('job-title').value     = quote.jobTitle    || '';
  document.getElementById('client-name').value   = quote.clientName  || '';
  document.getElementById('job-desc').value      = quote.description || '';
  document.getElementById('shoot-rate').value    = quote.shootRate   ?? quote.hourlyRate ?? 150;
  document.getElementById('edit-rate').value     = quote.editRate    ?? quote.hourlyRate ?? 100;
  document.getElementById('profit-margin').value = quote.profitMargin;
  document.getElementById('currency').value      = quote.currency    || 'AUD';
  renderQuoteItems(); renderStudioItems(); renderQuoteExtras(); updateSummary();
  switchToTab('quote-builder');
  toast('Quote loaded into builder.', 'success');
}

function initQuoteBuilder() {
  document.getElementById('add-to-quote-btn').addEventListener('click', addDeliverableToQuote);
  document.getElementById('deliverable-picker').addEventListener('keydown', e => {
    if (e.key === 'Enter') addDeliverableToQuote();
  });

  document.getElementById('studio-picker').addEventListener('change', updateBlockPicker);
  document.getElementById('add-studio-to-quote-btn').addEventListener('click', addStudioToQuote);

  document.getElementById('add-extra-to-quote-btn').addEventListener('click', addExtraToQuote);
  document.getElementById('extra-picker').addEventListener('keydown', e => {
    if (e.key === 'Enter') addExtraToQuote();
  });

  ['shoot-rate', 'edit-rate', 'profit-margin', 'currency'].forEach(id => {
    document.getElementById(id).addEventListener('input',  updateSummary);
    document.getElementById(id).addEventListener('change', updateSummary);
  });

  document.getElementById('save-quote-btn').addEventListener('click',  saveCurrentQuote);
  document.getElementById('clear-quote-btn').addEventListener('click', clearQuote);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SAVED QUOTES
// ═══════════════════════════════════════════════════════════════════════════════

async function loadQuotes() {
  quotes = await api('GET', '/api/quotes');
  renderSavedQuotes(); updateQuotesBadge();
}

function renderSavedQuotes() {
  const empty = document.getElementById('sq-empty');
  const list  = document.getElementById('sq-list');

  if (quotes.length === 0) { empty.hidden = false; list.innerHTML = ''; return; }
  empty.hidden = true;

  list.innerHTML = quotes.map(q => {
    const currency   = q.currency || 'AUD';
    const itemCount  = (q.items || []).length;
    const studioCount = (q.studioItems || []).length;
    const extrasCount = (q.extraItems  || []).length;
    const totalItems  = itemCount + studioCount + extrasCount;

    // Deliverables table rows
    const deliverableRows = (q.items || []).map(item => {
      const sHrs = (item.shootHours || 0) * (item.qty || 1);
      const eHrs = (item.editHours  || 0) * (item.qty || 1);
      const hrs  = sHrs + eHrs;
      const cost = sHrs * (q.shootRate ?? q.hourlyRate ?? 0) + eHrs * (q.editRate ?? q.hourlyRate ?? 0);
      return `<tr>
        <td><strong>${escape(item.deliverableName)}</strong></td>
        <td class="text-center">${item.shootHours}h</td>
        <td class="text-center">${item.editHours}h</td>
        <td class="text-center">${item.qty}</td>
        <td class="text-center">${hrs.toFixed(1)}h</td>
        <td class="text-right">${fmt(cost, currency)}</td>
      </tr>`;
    }).join('');

    // Studio hire rows
    const studioRows = (q.studioItems || []).map(si =>
      `<tr>
        <td colspan="4"><strong>🏢 ${escape(si.studioName)}</strong> — ${si.blockHours}hr block${si.qty > 1 ? ` ×${si.qty}` : ''}</td>
        <td></td>
        <td class="text-right">${fmt(si.blockPrice * (si.qty || 1), currency)}</td>
      </tr>`
    ).join('');

    // Extras rows
    const extraRows = (q.extraItems || []).map(ei =>
      `<tr>
        <td colspan="4"><strong>✨ ${escape(ei.extraName)}</strong>${ei.qty > 1 ? ` ×${ei.qty}` : ''} <span style="color:var(--text-muted);font-size:.8em">${unitLabel(ei.unit)}</span></td>
        <td></td>
        <td class="text-right">${fmt(ei.price * (ei.qty || 1), currency)}</td>
      </tr>`
    ).join('');

    const hasTable = deliverableRows || studioRows || extraRows;

    return `
    <div class="sq-card" id="sq-${q.id}">
      <div class="sq-head" onclick="toggleSavedQuote('${q.id}')">
        <div class="sq-meta">
          <div class="sq-title">${escape(q.jobTitle || 'Untitled Quote')}</div>
          <div class="sq-subtitle">
            ${q.clientName ? `<span>👤 ${escape(q.clientName)}</span>` : ''}
            <span>📅 ${fmtDate(q.createdAt)}</span>
            <span class="sq-pill">${totalItems} item${totalItems !== 1 ? 's' : ''}</span>
            ${q.totalHours ? `<span class="sq-pill">${fmtHrs(q.totalHours)}</span>` : ''}
          </div>
        </div>
        <div class="sq-price">
          <div class="sq-price-val">${fmt(q.finalPrice || 0, currency)}</div>
          <div class="sq-price-cur">${currency} ex-GST</div>
        </div>
        <span class="sq-chevron">▾</span>
      </div>

      <div class="sq-body">
        <div class="sq-body-grid">
          <div>
            <div class="sq-body-label">Job</div>
            <div class="sq-body-value">${escape(q.jobTitle || '—')}</div>
          </div>
          <div>
            <div class="sq-body-label">Client</div>
            <div class="sq-body-value">${escape(q.clientName || '—')}</div>
          </div>
          ${q.description ? `<div style="grid-column:span 2">
            <div class="sq-body-label">Notes</div>
            <div class="sq-body-desc">${escape(q.description)}</div>
          </div>` : ''}
        </div>

        ${hasTable ? `
        <div style="margin-top:1rem">
          <div class="sq-body-label">Items</div>
          <table class="sq-items-table">
            <thead><tr>
              <th>Item</th>
              <th class="text-center">Shoot</th>
              <th class="text-center">Edit</th>
              <th class="text-center">Qty</th>
              <th class="text-center">Hrs</th>
              <th class="text-right">Cost</th>
            </tr></thead>
            <tbody>${deliverableRows}${studioRows}${extraRows}</tbody>
          </table>
        </div>` : ''}

        <div class="sq-body-grid" style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border)">
          <div>
            <div class="sq-body-label">Shoot Rate</div>
            <div class="sq-body-value">${fmt(q.shootRate ?? q.hourlyRate ?? 0, currency)}/hr</div>
          </div>
          <div>
            <div class="sq-body-label">Edit Rate</div>
            <div class="sq-body-value">${fmt(q.editRate ?? q.hourlyRate ?? 0, currency)}/hr</div>
          </div>
          <div>
            <div class="sq-body-label">Shoot Labour</div>
            <div class="sq-body-value">${fmt(q.shootCost || 0, currency)}</div>
          </div>
          <div>
            <div class="sq-body-label">Edit Labour</div>
            <div class="sq-body-value">${fmt(q.editCost || 0, currency)}</div>
          </div>
          ${q.studioCost ? `<div>
            <div class="sq-body-label">Studio Hire</div>
            <div class="sq-body-value">${fmt(q.studioCost, currency)}</div>
          </div>` : ''}
          ${q.extrasCost ? `<div>
            <div class="sq-body-label">Extras</div>
            <div class="sq-body-value">${fmt(q.extrasCost, currency)}</div>
          </div>` : ''}
          <div>
            <div class="sq-body-label">Profit Margin</div>
            <div class="sq-body-value">${q.profitMargin || 0}%</div>
          </div>
          <div>
            <div class="sq-body-label">Profit Amount</div>
            <div class="sq-body-value">${fmt(q.profitAmount || 0, currency)}</div>
          </div>
        </div>

        <div style="background:var(--primary);border-radius:var(--radius-sm);padding:.875rem 1.25rem;margin-top:1rem;display:flex;justify-content:space-between;align-items:center">
          <span style="color:rgba(255,255,255,.7);font-size:.875rem;font-weight:500">Recommended Quote <span style="color:rgba(255,255,255,.35);font-size:.75rem">ex-GST</span></span>
          <span style="color:var(--accent);font-size:1.35rem;font-weight:800;letter-spacing:-.02em">
            ${fmt(q.finalPrice || 0, currency)}
            <span style="color:rgba(255,255,255,.4);font-size:.8rem;font-weight:400">${currency}</span>
          </span>
        </div>

        <div class="sq-actions">
          <button class="btn btn-ghost btn-sm" data-load-quote="${q.id}">📋 Load into Builder</button>
          <button class="btn btn-danger btn-sm" onclick="deleteQuote('${q.id}')">🗑 Delete</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleSavedQuote(id) {
  document.getElementById(`sq-${id}`)?.classList.toggle('open');
}

function initSavedQuotes() {
  document.getElementById('sq-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-load-quote]');
    if (!btn) return;
    const q = quotes.find(x => x.id === btn.dataset.loadQuote);
    if (q) loadQuoteIntoBuilder(q);
  });
}

async function deleteQuote(id) {
  const q = quotes.find(x => x.id === id);
  if (!confirm(`Delete the quote "${q ? q.jobTitle : id}"? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/api/quotes/${id}`);
    quotes = quotes.filter(x => x.id !== id);
    renderSavedQuotes(); updateQuotesBadge();
    toast('Quote deleted.', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════════════════

async function init() {
  initTabs();
  initKnowledgeBase();
  initStudios();
  initExtras();
  initQuoteBuilder();
  initSavedQuotes();

  try {
    await Promise.all([
      loadDeliverables(),
      loadStudios(),
      loadExtras(),
      loadQuotes()
    ]);
    updateSummary();
  } catch (err) {
    console.error('Init error:', err);
    toast('Could not connect to server. Is it running?', 'error', 6000);
  }
}

// Globals for inline onclick handlers in dynamically rendered HTML
window.editDeliverable    = editDeliverable;
window.deleteDeliverable  = deleteDeliverable;
window.removeQuoteItem    = removeQuoteItem;
window.editStudio         = editStudio;
window.deleteStudio       = deleteStudio;
window.removeStudioFormBlock = removeStudioFormBlock;
window.removeStudioItem   = removeStudioItem;
window.editExtra          = editExtra;
window.deleteExtra        = deleteExtra;
window.removeQuoteExtra   = removeQuoteExtra;
window.toggleSavedQuote   = toggleSavedQuote;
window.deleteQuote        = deleteQuote;

document.addEventListener('DOMContentLoaded', init);
