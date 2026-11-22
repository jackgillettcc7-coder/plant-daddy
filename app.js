// Plant Daddy — app shell, screens, and interactions.

const $app = document.getElementById('app');
const state = { plants: [], logs: [], photos: [] };
const urlCache = new Map();

const SNOOZE_DAYS = { water: 2, fertilize: 7, rotate: 3, photo: 3, repot: 30 };

// ---------- Helpers ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
function photoUrl(photo) {
  if (!photo) return null;
  if (!urlCache.has(photo.id)) urlCache.set(photo.id, URL.createObjectURL(photo.blob));
  return urlCache.get(photo.id);
}
function photosOf(plantId) {
  return state.photos.filter(p => p.plantId === plantId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}
function coverOf(plant) {
  const mine = photosOf(plant.id);
  return mine.find(p => p.id === plant.coverPhotoId) || mine[0] || null;
}
function thumbHTML(plant, cls = '') {
  const c = coverOf(plant);
  return c ? `<img src="${photoUrl(c)}" alt="${esc(plant.name)}" class="${cls}" />` : `<span>${plantEmoji(plant)}</span>`;
}
function displayName(p) { return p.nickname ? `${p.nickname}` : p.name; }

async function load() {
  [state.plants, state.logs, state.photos] = await Promise.all([DB.all('plants'), DB.all('logs'), DB.all('photos')]);
  state.plants.sort((a, b) => a.createdAt - b.createdAt);
}

// Shrink camera photos so ten plants' worth of history stays light on the phone.
function resizeImage(file, max = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('Could not read photo'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read photo')); };
    img.src = url;
  });
}

function pickPhoto() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
    input.click();
  });
}

async function addPhoto(plantId, file, caption = '') {
  const blob = await resizeImage(file);
  const photo = { id: uid(), plantId, date: todayStr(), caption, blob, createdAt: Date.now() };
  await DB.put('photos', photo);
  state.photos.push(photo);
  await logCare(plantId, 'photo', caption, { silent: true });
  return photo;
}

async function logCare(plantId, type, note = '', opts = {}) {
  const entry = { id: uid(), plantId, type, date: opts.date || todayStr(), note, createdAt: Date.now() };
  await DB.put('logs', entry);
  state.logs.push(entry);
  const plant = state.plants.find(p => p.id === plantId);
  if (plant) {
    let changed = false;
    if (plant.snooze && plant.snooze[type]) { delete plant.snooze[type]; changed = true; }
    if (type === 'repot') { plant.lastRepotted = entry.date; changed = true; }
    if (changed) await DB.put('plants', plant);
  }
  if (!opts.silent) toast(`${CARE_TYPES[type] ? CARE_TYPES[type].icon : '📝'} Logged for ${plant ? displayName(plant) : 'plant'}`);
  return entry;
}

async function snooze(plantId, type) {
  const plant = state.plants.find(p => p.id === plantId);
  plant.snooze = plant.snooze || {};
  plant.snooze[type] = addDays(todayStr(), SNOOZE_DAYS[type] || 2);
  await DB.put('plants', plant);
  toast(`⏰ I'll remind you ${prettyDate(plant.snooze[type])}`);
}

// ---------- Router ----------
const routes = [
  [/^#\/today$/, renderToday, 'today'],
  [/^#\/plants$/, renderPlants, 'plants'],
  [/^#\/new$/, () => renderForm(null), 'new'],
  [/^#\/plant\/([\w]+)$/, (m) => renderPlant(m[1]), 'plants'],
  [/^#\/plant\/([\w]+)\/edit$/, (m) => renderForm(m[1]), 'plants'],
  [/^#\/settings$/, renderSettings, 'settings'],
];

async function router() {
  const hash = location.hash || '#/today';
  for (const [re, fn, nav] of routes) {
    const m = hash.match(re);
    if (m) {
      document.querySelectorAll('.bottomnav a').forEach(a => a.classList.toggle('active', a.dataset.nav === nav));
      await fn(m);
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/today';
}
window.addEventListener('hashchange', router);

// ---------- Today ----------
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function taskLabel(t) {
  const name = esc(displayName(t.plant));
  switch (t.type) {
    case 'water': return `Water ${name}`;
    case 'fertilize': return `Feed ${name}`;
    case 'rotate': return `Give ${name} a quarter turn`;
    case 'photo': return `Snap a photo of ${name}`;
    case 'repot': return `Check if ${name} needs a bigger pot`;
  }
}

function taskRow(t, actionable) {
  const overdue = t.due < todayStr();
  const ct = CARE_TYPES[t.type];
  return `
    <div class="task" data-plant="${t.plant.id}" data-type="${t.type}">
      <a class="thumb" href="#/plant/${t.plant.id}">${thumbHTML(t.plant)}</a>
      <div class="body">
        <div class="title">${taskLabel(t)}</div>
        <div class="meta ${overdue ? 'overdue' : ''}"><span class="pill ${t.type}">${ct.icon} ${ct.label}</span> ${relDue(t.due)}</div>
        ${actionable ? `<button class="btn ghost small snooze" style="margin-top:6px">${t.type === 'water' ? 'Soil still damp — not yet' : 'Not yet'}</button>` : ''}
      </div>
      ${actionable ? `<button class="check" aria-label="Mark done">✓</button>` : ''}
    </div>`;
}

async function renderToday() {
  await load();
  if (!state.plants.length) {
    $app.innerHTML = `
      <div class="empty card">
        <img src="icons/logo.png" alt="Plant Daddy" class="wordmark" style="margin-bottom:10px" />
        <h1>Welcome, Plant Daddy</h1>
        <p class="sub">Add your first plant and I'll keep a running to-do list so nothing goes thirsty.</p>
        <a class="btn" href="#/new">＋ Add a plant</a>
      </div>`;
    return;
  }
  const due = tasksFor(state.plants, state.logs, 0);
  const upcoming = tasksFor(state.plants, state.logs, 7).filter(t => t.due > todayStr());
  const thirsty = state.plants.filter(p => moodFor(p, state.logs).key === 'thirsty').length;

  let heroText;
  if (!due.length) heroText = `<strong>Nothing to do today.</strong><p class="small">Everyone's happy. Go touch grass (or a leaf).</p>`;
  else heroText = `<strong>${due.length} thing${due.length > 1 ? 's' : ''} on the list.</strong><p class="small">${thirsty ? `${thirsty} plant${thirsty > 1 ? 's are' : ' is'} thirsty.` : 'Quick round and you’re done.'}</p>`;

  $app.innerHTML = `
    <h1>${greeting()}, Plant Daddy</h1>
    <p class="sub">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    <div class="hero">${due.length ? '<div class="big">🌤️</div>' : '<img src="icons/logo-sm.png" alt="" style="height:76px;width:auto" />'}<div>${heroText}</div></div>
    ${due.length ? `<h2>To do</h2><div class="stack" id="due">${due.map(t => taskRow(t, true)).join('')}</div>` : ''}
    ${upcoming.length ? `<h2>Coming up this week</h2><div class="stack">${upcoming.map(t => taskRow(t, false)).join('')}</div>` : ''}
  `;

  $app.querySelectorAll('#due .task').forEach(row => {
    const plantId = row.dataset.plant, type = row.dataset.type;
    row.querySelector('.check').addEventListener('click', async () => {
      if (type === 'photo') {
        const file = await pickPhoto();
        if (!file) return;
        await addPhoto(plantId, file);
        toast('📸 Photo saved');
      } else if (type === 'repot') {
        const ok = await confirmSheet('Did you repot it?', 'If it doesn’t need it yet, tap “Not yet” instead and I’ll check again in a month.', 'Yes, repotted');
        if (!ok) return;
        await logCare(plantId, 'repot');
      } else {
        await logCare(plantId, type);
      }
      row.classList.add('done');
      setTimeout(renderToday, 280);
    });
    row.querySelector('.snooze').addEventListener('click', async () => {
      await snooze(plantId, type);
      row.classList.add('done');
      setTimeout(renderToday, 280);
    });
  });
}

// ---------- Plants grid ----------
async function renderPlants() {
  await load();
  if (!state.plants.length) return renderToday();
  $app.innerHTML = `
    <h1>Your plants</h1>
    <p class="sub">${state.plants.length} plant${state.plants.length > 1 ? 's' : ''} in the family</p>
    <div class="grid">
      ${state.plants.map(p => {
        const mood = moodFor(p, state.logs);
        return `
          <a class="card plant-card" href="#/plant/${p.id}">
            <div class="cover">${thumbHTML(p)}</div>
            <div class="mood ${mood.key}"><span class="face">${mood.face}</span>${mood.label}</div>
            <div class="info">
              <div class="name">${esc(displayName(p))}</div>
              <div class="species">${esc(p.nickname ? p.name + ' · ' : '')}${esc(p.species)}${p.room ? ' · ' + esc(p.room) : ''}</div>
            </div>
          </a>`;
      }).join('')}
    </div>
    <div style="margin-top:16px"><a class="btn ghost block" href="#/new">＋ Add another plant</a></div>
    <img src="icons/logo.png" alt="" class="wordmark sm" style="margin-top:28px;opacity:.9" />
  `;
}

// ---------- Plant detail ----------
async function renderPlant(id) {
  await load();
  const p = state.plants.find(x => x.id === id);
  if (!p) { location.hash = '#/plants'; return; }
  const mood = moodFor(p, state.logs);
  const cover = coverOf(p);
  const photos = photosOf(p.id);
  const status = careStatus(p, state.logs);
  const logs = state.logs.filter(l => l.plantId === p.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  $app.innerHTML = `
    <div class="detail-hero">
      ${cover ? `<img src="${photoUrl(cover)}" alt="${esc(p.name)}" />` : `<span>${plantEmoji(p)}</span>`}
      <div class="mood ${mood.key}"><span class="face">${mood.face}</span>${mood.label}</div>
    </div>

    <div class="title-row">
      <div>
        <h1>${esc(displayName(p))}</h1>
        <p class="sub" style="margin:0">${esc(p.nickname ? p.name + ' · ' : '')}${esc(p.species)}${p.variety ? ' · ' + esc(p.variety) : ''}</p>
      </div>
      <a class="icon-btn" href="#/plant/${p.id}/edit" aria-label="Edit plant">✏️</a>
    </div>

    <h2>Log care</h2>
    <div class="quick" style="grid-template-columns:repeat(3,1fr)">
      <button data-log="water"><span>💧</span>Watered</button>
      <button data-log="fertilize"><span>🌱</span>Fed</button>
      <button data-log="rotate"><span>🔄</span>Rotated</button>
      <button data-act="photo"><span>📸</span>Photo</button>
      <button data-log="repot"><span>🪴</span>Repotted</button>
      <button data-act="note"><span>📝</span>Note</button>
    </div>

    <h2>Schedule</h2>
    <div class="card">
      ${status.length ? status.map(s => {
        const ct = CARE_TYPES[s.type];
        const overdue = s.due < todayStr();
        return `
          <div class="schedule-row">
            <div class="left"><span class="pill ${s.type}">${ct.icon} ${ct.label}</span><span class="small">every ${s.interval} ${ct.unit === 'months' ? (s.interval > 1 ? 'months' : 'month') : (s.interval > 1 ? 'days' : 'day')}</span></div>
            <div class="when ${overdue ? 'overdue' : ''}">${s.due <= todayStr() ? relDue(s.due) : 'next ' + prettyDate(s.due)}${s.last ? `<br><span class="small">last ${prettyDate(s.last)}</span>` : ''}</div>
          </div>`;
      }).join('') : `<p class="small" style="margin:0">No schedule yet. Tap ✏️ to add one, or ask Claude below.</p>`}
    </div>

    <div class="card claude-card" style="margin-top:14px">
      <h3>🤖 Ask Claude for a care plan</h3>
      <p>Sends Claude this plant's details, care log, and latest photo. Paste the answer back here and I'll update the schedule.</p>
      <div class="btn-row">
        <button class="btn terra small" id="share-claude">${navigator.share ? 'Send to Claude' : 'Copy prompt'}</button>
        ${navigator.share ? `<button class="btn ghost small" id="copy-claude">Copy prompt</button>` : ''}
        <button class="btn ghost small" id="paste-claude">Paste Claude's answer</button>
      </div>
    </div>

    <h2>Photo timeline</h2>
    <div class="timeline">
      <div class="add-photo" id="add-photo">📸<br>Add photo</div>
      ${photos.map(ph => `
        <figure>
          <img src="${photoUrl(ph)}" data-photo="${ph.id}" alt="${esc(p.name)} on ${ph.date}" loading="lazy" />
          <figcaption>${prettyDate(ph.date)}</figcaption>
        </figure>`).join('')}
    </div>

    <h2>Where it lives</h2>
    <div class="facts">
      <div class="fact"><div class="k">Room</div><div class="v">${esc(p.room || '—')}</div></div>
      <div class="fact"><div class="k">Light</div><div class="v">${esc(p.light || '—')}</div></div>
      <div class="fact"><div class="k">Window</div><div class="v">${esc(p.windowDir || '—')}</div></div>
      <div class="fact"><div class="k">From window</div><div class="v">${esc(p.windowDist || '—')}</div></div>
      <div class="fact"><div class="k">Pot</div><div class="v">${p.potSize ? esc(p.potSize) + '″' : '—'}${p.drainage === false ? ' · no drain' : p.drainage ? ' · drains' : ''}</div></div>
      <div class="fact"><div class="k">Last repot</div><div class="v">${p.lastRepotted ? prettyDate(p.lastRepotted) : '—'}</div></div>
    </div>
    ${p.notes ? `<h2>Notes</h2><div class="card"><p style="margin:0;white-space:pre-wrap">${esc(p.notes)}</p></div>` : ''}

    <h2>Care log</h2>
    <div class="card">
      ${logs.length ? `<ul class="log">${logs.slice(0, 40).map(l => `
        <li>
          <span class="d">${prettyDate(l.date)}</span>
          <span><strong>${CARE_TYPES[l.type] ? CARE_TYPES[l.type].icon + ' ' + CARE_TYPES[l.type].label : '📝 Note'}</strong>${l.note ? `<br><span class="small">${esc(l.note)}</span>` : ''}</span>
          <button class="x" data-dellog="${l.id}" aria-label="Delete entry">×</button>
        </li>`).join('')}</ul>` : `<p class="small" style="margin:0">Nothing logged yet.</p>`}
    </div>
  `;

  $app.querySelectorAll('[data-log]').forEach(b => b.addEventListener('click', async () => {
    await logCare(p.id, b.dataset.log);
    renderPlant(p.id);
  }));
  const doPhoto = async () => {
    const file = await pickPhoto();
    if (!file) return;
    await addPhoto(p.id, file);
    toast('📸 Photo saved');
    renderPlant(p.id);
  };
  $app.querySelector('[data-act="photo"]').addEventListener('click', doPhoto);
  $app.querySelector('#add-photo').addEventListener('click', doPhoto);
  $app.querySelector('[data-act="note"]').addEventListener('click', async () => {
    const note = await textSheet('Add a note', 'e.g. “Two yellow leaves at the bottom” or “New leaf unfurling!”');
    if (!note) return;
    await logCare(p.id, 'note', note);
    renderPlant(p.id);
  });
  $app.querySelectorAll('[data-dellog]').forEach(b => b.addEventListener('click', async () => {
    await DB.del('logs', b.dataset.dellog);
    toast('Entry removed');
    renderPlant(p.id);
  }));
  $app.querySelectorAll('[data-photo]').forEach(img => img.addEventListener('click', () => openLightbox(p, img.dataset.photo)));

  const prompt = () => claudePrompt(p, state.logs, photos.length);
  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt()); toast('📋 Copied — paste it into Claude'); }
    catch { await textSheet('Copy this into Claude', '', prompt()); }
  };
  $app.querySelector('#share-claude').addEventListener('click', async () => {
    if (!navigator.share) return copy();
    const data = { title: `Plant Daddy: ${p.name}`, text: prompt() };
    if (cover) {
      const file = new File([cover.blob], `${p.name.replace(/\W+/g, '-')}-${cover.date}.jpg`, { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
    }
    try { await navigator.share(data); } catch (e) { if (e.name !== 'AbortError') copy(); }
  });
  const cc = $app.querySelector('#copy-claude');
  if (cc) cc.addEventListener('click', copy);
  $app.querySelector('#paste-claude').addEventListener('click', () => applyClaudeSheet(p));
}

// ---------- Sheets & lightbox ----------
function sheet(html) {
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  back.innerHTML = `<div class="sheet">${html}</div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back) close(); });
  return { el: back, close };
}

function confirmSheet(title, body, yes = 'Yes') {
  return new Promise(resolve => {
    const s = sheet(`<h3>${esc(title)}</h3><p class="small">${esc(body)}</p>
      <div class="btn-row"><button class="btn" data-y>${esc(yes)}</button><button class="btn ghost" data-n>Cancel</button></div>`);
    s.el.querySelector('[data-y]').onclick = () => { s.close(); resolve(true); };
    s.el.querySelector('[data-n]').onclick = () => { s.close(); resolve(false); };
  });
}

function textSheet(title, placeholder = '', value = '') {
  return new Promise(resolve => {
    const s = sheet(`<h3>${esc(title)}</h3>
      <textarea placeholder="${esc(placeholder)}" style="min-height:${value ? 260 : 110}px">${esc(value)}</textarea>
      <div class="btn-row" style="margin-top:12px"><button class="btn" data-y>${value ? 'Done' : 'Save'}</button><button class="btn ghost" data-n>Cancel</button></div>`);
    const ta = s.el.querySelector('textarea');
    if (value) ta.select(); else ta.focus();
    s.el.querySelector('[data-y]').onclick = () => { s.close(); resolve(value ? null : ta.value.trim()); };
    s.el.querySelector('[data-n]').onclick = () => { s.close(); resolve(null); };
  });
}

function applyClaudeSheet(p) {
  const s = sheet(`<h3>Paste Claude's answer</h3>
    <p class="small">Paste the whole reply. I'll pull out the schedule lines (WATER, FERTILIZE, ROTATE, REPOT CHECK, PHOTO CHECK-IN).</p>
    <textarea id="reply" style="min-height:160px" placeholder="WATER: every 9 days&#10;FERTILIZE: every 30 days&#10;…"></textarea>
    <div id="parsed" style="margin-top:12px"></div>
    <label style="margin-top:12px;display:flex;gap:8px;align-items:center;font-weight:700"><input type="checkbox" id="savenote" checked style="width:auto"> Save Claude's advice as a note</label>
    <div class="btn-row" style="margin-top:12px"><button class="btn" id="apply" disabled>Update schedule</button><button class="btn ghost" data-n>Cancel</button></div>`);
  const ta = s.el.querySelector('#reply');
  const out = s.el.querySelector('#parsed');
  const btn = s.el.querySelector('#apply');
  let parsed = null;
  ta.addEventListener('input', () => {
    parsed = parseClaudeSchedule(ta.value);
    const found = Object.entries(parsed).filter(([, v]) => v !== null);
    btn.disabled = !found.length;
    out.innerHTML = found.length
      ? `<div class="card">${found.map(([k, v]) => `<div class="schedule-row"><span class="pill ${k}">${CARE_TYPES[k].icon} ${CARE_TYPES[k].label}</span><span>${v === 0 ? 'off' : `every ${v} ${CARE_TYPES[k].unit}`} <span class="small">(was ${(p.schedule && p.schedule[k]) || 'off'})</span></span></div>`).join('')}</div>`
      : (ta.value.trim() ? `<p class="small">Couldn't find schedule lines yet. Make sure the reply ends with “WATER: every N days” etc.</p>` : '');
  });
  s.el.querySelector('[data-n]').onclick = s.close;
  btn.onclick = async () => {
    p.schedule = p.schedule || {};
    for (const [k, v] of Object.entries(parsed)) if (v !== null) p.schedule[k] = v;
    await DB.put('plants', p);
    if (s.el.querySelector('#savenote').checked) {
      const advice = ta.value.trim();
      await logCare(p.id, 'note', 'Claude: ' + (advice.length > 600 ? advice.slice(0, 600) + '…' : advice), { silent: true });
    }
    s.close();
    toast('🌿 Schedule updated');
    renderPlant(p.id);
  };
  ta.focus();
}

function openLightbox(plant, photoId) {
  const ph = state.photos.find(x => x.id === photoId);
  if (!ph) return;
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `
    <img src="${photoUrl(ph)}" alt="" />
    <div class="cap">${esc(plant.name)} · ${prettyDate(ph.date)}${ph.caption ? ' · ' + esc(ph.caption) : ''}</div>
    <div class="btn-row">
      <button class="btn small" data-cover>Make cover photo</button>
      <button class="btn danger small" data-del>Delete</button>
      <button class="btn ghost small" data-close>Close</button>
    </div>`;
  document.body.appendChild(lb);
  const close = () => lb.remove();
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  lb.querySelector('[data-close]').onclick = close;
  lb.querySelector('[data-cover]').onclick = async () => {
    plant.coverPhotoId = ph.id;
    await DB.put('plants', plant);
    close(); toast('Cover photo set'); renderPlant(plant.id);
  };
  lb.querySelector('[data-del]').onclick = async () => {
    await DB.del('photos', ph.id);
    if (plant.coverPhotoId === ph.id) { plant.coverPhotoId = null; await DB.put('plants', plant); }
    close(); toast('Photo deleted'); renderPlant(plant.id);
  };
}

// ---------- Add / edit form ----------
function chips(name, options, value) {
  return `<div class="chips">${options.map((o, i) => `
    <input type="radio" name="${name}" id="${name}-${i}" value="${esc(o)}" ${o === value ? 'checked' : ''} />
    <label for="${name}-${i}">${esc(o)}</label>`).join('')}</div>`;
}

async function renderForm(id) {
  await load();
  const editing = id ? state.plants.find(x => x.id === id) : null;
  if (id && !editing) { location.hash = '#/plants'; return; }
  const p = editing || { species: 'Pothos', schedule: { ...pickSchedule(SPECIES.Pothos) }, addedOn: todayStr(), light: SPECIES.Pothos.light };
  const s = p.schedule || {};
  let pendingPhoto = null;

  $app.innerHTML = `
    ${editing ? '' : '<img src="icons/logo.png" alt="" class="wordmark sm" style="margin:0 0 6px" />'}
    <h1>${editing ? 'Edit ' + esc(displayName(p)) : 'New plant'}</h1>
    <p class="sub">${editing ? 'Tweak details or the schedule.' : 'The basics now — you can fill in the rest later.'}</p>
    <form id="plant-form" autocomplete="off">
      ${editing ? '' : `
        <div class="field">
          <div class="add-photo" id="pick" style="width:100%;height:auto;aspect-ratio:4/3;border-radius:20px">📸<br>Add a photo (optional)</div>
        </div>`}

      <div class="field"><label for="name">Name</label>
        <input type="text" id="name" name="name" required placeholder="e.g. Living room pothos" value="${esc(p.name || '')}" /></div>
      <div class="field"><label for="nickname">Nickname <span class="small">(optional, but encouraged)</span></label>
        <input type="text" id="nickname" name="nickname" placeholder="e.g. Kevin Bacon" value="${esc(p.nickname || '')}" /></div>
      <div class="row2">
        <div class="field"><label for="species">Type</label>
          <select id="species" name="species">${Object.keys(SPECIES).map(k => `<option ${k === p.species ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <div class="field"><label for="variety">Variety</label>
          <input type="text" id="variety" name="variety" placeholder="e.g. Golden" value="${esc(p.variety || '')}" /></div>
      </div>

      <div class="section-title">Where it lives</div>
      <div class="field"><label for="room">Room</label>
        <input type="text" id="room" name="room" placeholder="e.g. Living room" value="${esc(p.room || '')}" list="rooms" />
        <datalist id="rooms">${[...new Set(['Living room', 'Bedroom', 'Kitchen', 'Bathroom', 'Office', 'Balcony', ...state.plants.map(x => x.room).filter(Boolean)])].map(r => `<option value="${esc(r)}">`).join('')}</datalist></div>
      <div class="field"><label>Nearest window faces</label>${chips('windowDir', WINDOW_DIRS, p.windowDir)}</div>
      <div class="field"><label>Distance from window</label>${chips('windowDist', WINDOW_DIST, p.windowDist)}</div>
      <div class="field"><label>Light it gets</label>${chips('light', LIGHT_LEVELS, p.light)}
        <div class="hint">South and west windows are the brightest in Denver. Not sure? Ask Claude with a photo.</div></div>

      <div class="section-title">Pot</div>
      <div class="row2">
        <div class="field"><label for="potSize">Pot size (inches)</label>
          <input type="number" id="potSize" name="potSize" inputmode="decimal" min="1" max="30" step="0.5" value="${esc(p.potSize || '')}" /></div>
        <div class="field"><label for="lastRepotted">Last repotted</label>
          <input type="date" id="lastRepotted" name="lastRepotted" value="${esc(p.lastRepotted || '')}" /></div>
      </div>
      <div class="field"><label>Drainage hole?</label>${chips('drainage', ['Yes', 'No', 'Not sure'], p.drainage === true ? 'Yes' : p.drainage === false ? 'No' : 'Not sure')}</div>
      <div class="row2">
        <div class="field"><label for="addedOn">Had it since</label>
          <input type="date" id="addedOn" name="addedOn" value="${esc(p.addedOn || todayStr())}" /></div>
        ${editing ? '' : `<div class="field"><label for="lastWatered">Last watered</label>
          <input type="date" id="lastWatered" name="lastWatered" max="${todayStr()}" /><div class="hint">Leave blank if not sure</div></div>`}
      </div>

      <div class="section-title">Care schedule</div>
      <p class="small" style="margin-top:-4px">${editing ? 'Set to 0 to turn a reminder off.' : 'Filled in from the plant type as a starting point. Ask Claude with a photo to fine-tune it.'}</p>
      <div class="row3">
        <div class="field"><label for="s-water">💧 Water</label><input type="number" id="s-water" min="0" inputmode="numeric" value="${s.water ?? 7}" /><div class="hint">days</div></div>
        <div class="field"><label for="s-fertilize">🌱 Feed</label><input type="number" id="s-fertilize" min="0" inputmode="numeric" value="${s.fertilize ?? 30}" /><div class="hint">days</div></div>
        <div class="field"><label for="s-rotate">🔄 Rotate</label><input type="number" id="s-rotate" min="0" inputmode="numeric" value="${s.rotate ?? 14}" /><div class="hint">days</div></div>
      </div>
      <div class="row2">
        <div class="field"><label for="s-photo">📸 Photo check-in</label><input type="number" id="s-photo" min="0" inputmode="numeric" value="${s.photo ?? 14}" /><div class="hint">days</div></div>
        <div class="field"><label for="s-repot">🪴 Repot check</label><input type="number" id="s-repot" min="0" inputmode="numeric" value="${s.repot ?? 12}" /><div class="hint">months</div></div>
      </div>

      <div class="field"><label for="notes">Notes</label>
        <textarea id="notes" name="notes" placeholder="Anything worth remembering — where you got it, quirks, past drama.">${esc(p.notes || '')}</textarea></div>

      <button class="btn block" type="submit">${editing ? 'Save changes' : 'Add to the family 🌿'}</button>
      ${editing ? `<div style="margin-top:12px" class="btn-row"><a class="btn ghost" href="#/plant/${p.id}">Cancel</a><button type="button" class="btn danger" id="delete">Delete plant</button></div>` : ''}
    </form>
  `;

  const form = $app.querySelector('#plant-form');
  const speciesSel = form.querySelector('#species');
  if (!editing) {
    speciesSel.addEventListener('change', () => {
      const preset = SPECIES[speciesSel.value];
      for (const k of ['water', 'fertilize', 'rotate', 'photo', 'repot']) form.querySelector('#s-' + k).value = preset[k];
      const lightInput = [...form.querySelectorAll('input[name="light"]')].find(i => i.value === preset.light);
      if (lightInput && !lightTouched) lightInput.checked = true;
    });
    let lightTouched = false;
    form.querySelectorAll('input[name="light"]').forEach(i => i.addEventListener('change', () => { lightTouched = true; }));
    const pick = form.querySelector('#pick');
    pick.addEventListener('click', async () => {
      const file = await pickPhoto();
      if (!file) return;
      pendingPhoto = file;
      pick.innerHTML = `<img src="${URL.createObjectURL(file)}" style="width:100%;height:100%;object-fit:cover;border-radius:18px" alt="" />`;
      pick.style.border = '0';
    });
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const num = id => Math.max(0, parseInt(form.querySelector('#s-' + id).value, 10) || 0);
    const drainage = fd.get('drainage');
    const plant = {
      ...(editing || { id: uid(), createdAt: Date.now() }),
      name: fd.get('name').trim(),
      nickname: fd.get('nickname').trim(),
      species: fd.get('species'),
      variety: fd.get('variety').trim(),
      room: fd.get('room').trim(),
      windowDir: fd.get('windowDir') || '',
      windowDist: fd.get('windowDist') || '',
      light: fd.get('light') || '',
      potSize: fd.get('potSize') || '',
      lastRepotted: fd.get('lastRepotted') || '',
      drainage: drainage === 'Yes' ? true : drainage === 'No' ? false : null,
      addedOn: fd.get('addedOn') || todayStr(),
      notes: fd.get('notes').trim(),
      schedule: { water: num('water'), fertilize: num('fertilize'), rotate: num('rotate'), photo: num('photo'), repot: num('repot') },
    };
    if (!plant.name) return;
    await DB.put('plants', plant);
    if (pendingPhoto) await addPhoto(plant.id, pendingPhoto);
    if (!editing && fd.get('lastWatered')) await logCare(plant.id, 'water', '', { date: fd.get('lastWatered'), silent: true });
    toast(editing ? 'Saved' : `🌱 Welcome, ${displayName(plant)}!`);
    location.hash = `#/plant/${plant.id}`;
  });

  const del = form.querySelector('#delete');
  if (del) del.addEventListener('click', async () => {
    const ok = await confirmSheet(`Delete ${displayName(p)}?`, 'This removes its photos and care log too. It can’t be undone.', 'Delete');
    if (!ok) return;
    await DB.deletePlant(p.id);
    toast('Plant removed');
    location.hash = '#/plants';
  });
}

function pickSchedule(preset) {
  const { water, fertilize, rotate, photo, repot } = preset;
  return { water, fertilize, rotate, photo, repot };
}

// ---------- Settings ----------
function blobToDataURL(blob) {
  return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
}
async function dataURLToBlob(url) { return (await fetch(url)).blob(); }

async function renderSettings() {
  await load();
  let usage = '';
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    usage = `${(est.usage / 1048576).toFixed(1)} MB used on this device`;
  }
  $app.innerHTML = `
    <h1>Settings</h1>
    <p class="sub">${state.plants.length} plants · ${state.photos.length} photos · ${state.logs.length} log entries${usage ? ' · ' + usage : ''}</p>

    <h2>Where you live</h2>
    <div class="card">
      <label for="climate">Sent to Claude with every care question</label>
      <input type="text" id="climate" value="${esc(getClimate())}" />
    </div>

    <h2>Backup</h2>
    <div class="card">
      <p class="small" style="margin-top:0">Your plants live on this device only. Save a backup now and then, and use it to move everything to a new phone or browser.</p>
      <div class="btn-row">
        <button class="btn small" id="export">⬇️ Save backup</button>
        <button class="btn ghost small" id="import">⬆️ Restore backup</button>
      </div>
    </div>

    <h2>Put it on your home screen</h2>
    <div class="card small">
      <p style="margin-top:0"><strong>iPhone:</strong> open in Safari → Share → “Add to Home Screen.”</p>
      <p style="margin-bottom:0"><strong>Android:</strong> open in Chrome → ⋮ menu → “Add to Home screen” / “Install app.”</p>
    </div>

    <h2>Danger zone</h2>
    <div class="card">
      <button class="btn danger small" id="wipe">Delete all plant data</button>
    </div>
    <img src="icons/logo.png" alt="Plant Daddy" class="wordmark sm" style="margin-top:28px" />
    <p class="small" style="text-align:center;margin-top:8px">Plant Daddy v1 · made with 🌿 in Denver</p>
  `;

  $app.querySelector('#climate').addEventListener('change', e => { setClimate(e.target.value.trim()); toast('Saved'); });

  $app.querySelector('#export').addEventListener('click', async () => {
    const photos = [];
    for (const ph of state.photos) photos.push({ ...ph, blob: undefined, dataUrl: await blobToDataURL(ph.blob) });
    const data = { app: 'plant-daddy', version: 1, exportedAt: new Date().toISOString(), climate: getClimate(), plants: state.plants, logs: state.logs, photos };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `plant-daddy-backup-${todayStr()}.json`;
    a.click();
    toast('Backup saved');
  });

  $app.querySelector('#import').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      let data;
      try { data = JSON.parse(await file.text()); } catch { toast('That file isn’t a Plant Daddy backup'); return; }
      if (data.app !== 'plant-daddy') { toast('That file isn’t a Plant Daddy backup'); return; }
      const ok = await confirmSheet('Restore this backup?', `It has ${data.plants.length} plants and ${data.photos.length} photos. Plants with the same ID will be overwritten; everything else stays.`, 'Restore');
      if (!ok) return;
      for (const p of data.plants) await DB.put('plants', p);
      for (const l of data.logs) await DB.put('logs', l);
      for (const ph of data.photos) {
        const { dataUrl, ...rest } = ph;
        await DB.put('photos', { ...rest, blob: await dataURLToBlob(dataUrl) });
      }
      if (data.climate) setClimate(data.climate);
      toast('🌿 Backup restored');
      location.hash = '#/plants';
    };
    input.click();
  });

  $app.querySelector('#wipe').addEventListener('click', async () => {
    const ok = await confirmSheet('Delete everything?', 'All plants, photos and care history on this device will be gone. Save a backup first if you might want it.', 'Delete everything');
    if (!ok) return;
    await Promise.all([DB.clear('plants'), DB.clear('logs'), DB.clear('photos')]);
    toast('All clear');
    location.hash = '#/today';
  });
}

// ---------- Boot ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Re-render Today when the app comes back to the foreground on a new day.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (location.hash || '#/today') === '#/today') renderToday();
});
router();
