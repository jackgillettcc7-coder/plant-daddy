// Plant Daddy — care logic: species starting points, due dates, moods, and the "Ask Claude" prompt.

const CARE_TYPES = {
  water:     { label: 'Water',     verb: 'Water',            icon: '💧', unit: 'days' },
  fertilize: { label: 'Fertilize', verb: 'Feed',             icon: '🌱', unit: 'days' },
  rotate:    { label: 'Rotate',    verb: 'Rotate',           icon: '🔄', unit: 'days' },
  photo:     { label: 'Photo',     verb: 'Snap a check-in photo of', icon: '📸', unit: 'days' },
  repot:     { label: 'Repot',     verb: 'Check if it’s time to repot', icon: '🪴', unit: 'months' },
};

// Starting points only. Ask Claude with a photo to tune these for your actual plant and spot.
// water / fertilize / rotate / photo in days, repot in months.
const SPECIES = {
  'Pothos':            { water: 7,  fertilize: 30, rotate: 14, photo: 14, repot: 12, emoji: '🌿', light: 'Medium' },
  'Monstera':          { water: 7,  fertilize: 30, rotate: 14, photo: 14, repot: 18, emoji: '🌿', light: 'Bright indirect' },
  'Snake plant':       { water: 14, fertilize: 60, rotate: 30, photo: 30, repot: 24, emoji: '🪴', light: 'Low' },
  'ZZ plant':          { water: 14, fertilize: 60, rotate: 30, photo: 30, repot: 24, emoji: '🌿', light: 'Low' },
  'Fiddle leaf fig':   { water: 7,  fertilize: 30, rotate: 7,  photo: 14, repot: 18, emoji: '🌳', light: 'Bright indirect' },
  'Rubber plant':      { water: 10, fertilize: 30, rotate: 14, photo: 14, repot: 18, emoji: '🌳', light: 'Bright indirect' },
  'Peace lily':        { water: 5,  fertilize: 30, rotate: 14, photo: 14, repot: 12, emoji: '🌸', light: 'Medium' },
  'Spider plant':      { water: 7,  fertilize: 30, rotate: 14, photo: 14, repot: 12, emoji: '🌿', light: 'Medium' },
  'Philodendron':      { water: 7,  fertilize: 30, rotate: 14, photo: 14, repot: 12, emoji: '🌿', light: 'Medium' },
  'Calathea':          { water: 5,  fertilize: 30, rotate: 14, photo: 14, repot: 12, emoji: '🍃', light: 'Medium' },
  'Pilea':             { water: 7,  fertilize: 30, rotate: 7,  photo: 14, repot: 12, emoji: '🪴', light: 'Bright indirect' },
  'Bird of paradise':  { water: 7,  fertilize: 30, rotate: 14, photo: 14, repot: 18, emoji: '🌴', light: 'Bright indirect' },
  'Succulent / cactus':{ water: 14, fertilize: 60, rotate: 30, photo: 30, repot: 24, emoji: '🌵', light: 'Direct sun' },
  'Herb':              { water: 3,  fertilize: 30, rotate: 7,  photo: 14, repot: 12, emoji: '🌱', light: 'Direct sun' },
  'Other':             { water: 7,  fertilize: 30, rotate: 14, photo: 14, repot: 12, emoji: '🪴', light: 'Medium' },
};

const LIGHT_LEVELS = ['Low', 'Medium', 'Bright indirect', 'Direct sun'];
const WINDOW_DIRS = ['North', 'East', 'South', 'West', 'No window'];
const WINDOW_DIST = ['On the sill', '1–3 ft', '3–6 ft', '6+ ft'];

// ---------- Dates (local, YYYY-MM-DD) ----------
function todayStr() { return toDateStr(new Date()); }
function toDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return toDateStr(d); }
function addMonths(s, n) { const d = parseDate(s); d.setMonth(d.getMonth() + n); return toDateStr(d); }
function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
function prettyDate(s) {
  const diff = daysBetween(todayStr(), s);
  if (diff === 0) return 'today';
  if (diff === -1) return 'yesterday';
  if (diff === 1) return 'tomorrow';
  const d = parseDate(s);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}
function relDue(s) {
  const diff = daysBetween(todayStr(), s);
  if (diff < -1) return `${-diff} days overdue`;
  if (diff === -1) return '1 day overdue';
  if (diff === 0) return 'due today';
  if (diff === 1) return 'tomorrow';
  return `in ${diff} days`;
}

// ---------- Due dates ----------
function lastDone(plant, logs, type) {
  const mine = logs.filter(l => l.plantId === plant.id && l.type === type).map(l => l.date).sort();
  if (mine.length) return mine[mine.length - 1];
  if (type === 'repot' && plant.lastRepotted) return plant.lastRepotted;
  return null;
}

// Returns [{type, due, last, interval}] for every care type with a schedule.
function careStatus(plant, logs) {
  const out = [];
  const s = plant.schedule || {};
  for (const type of Object.keys(CARE_TYPES)) {
    const interval = Number(s[type]) || 0;
    if (!interval) continue;
    const last = lastDone(plant, logs, type);
    // If never done, the first one is due on the day the plant was added (water/photo) or one interval later (others).
    const addedInApp = plant.createdAt ? toDateStr(new Date(plant.createdAt)) : todayStr();
    const base = last || (type === 'repot' ? (plant.addedOn || addedInApp) : addedInApp);
    let due;
    if (type === 'repot') due = addMonths(base, interval);
    else if (!last && (type === 'water' || type === 'photo')) due = base;
    else due = addDays(base, interval);
    // "Not yet" snoozes push the due date out (e.g. soil still moist).
    const snooze = plant.snooze && plant.snooze[type];
    if (snooze && snooze > due) due = snooze;
    out.push({ type, due, last, interval });
  }
  return out;
}

function tasksFor(plants, logs, horizonDays = 0) {
  const limit = addDays(todayStr(), horizonDays);
  const tasks = [];
  for (const p of plants) {
    for (const st of careStatus(p, logs)) {
      if (st.due <= limit) tasks.push({ plant: p, ...st });
    }
  }
  const order = { water: 0, fertilize: 1, rotate: 2, repot: 3, photo: 4 };
  return tasks.sort((a, b) => a.due.localeCompare(b.due) || order[a.type] - order[b.type]);
}

// ---------- Mood (driven by water status) ----------
function moodFor(plant, logs) {
  const w = careStatus(plant, logs).find(s => s.type === 'water');
  if (!w) return { key: 'happy', face: '😊', label: 'Chillin’' };
  const diff = daysBetween(todayStr(), w.due);
  if (diff < 0) return { key: 'thirsty', face: '🥵', label: 'Thirsty!' };
  if (diff === 0) return { key: 'soon', face: '🥤', label: 'Drink today' };
  if (diff === 1) return { key: 'soon', face: '🙂', label: 'Thirsty soon' };
  return { key: 'happy', face: '😊', label: 'Happy' };
}

function plantEmoji(plant) { return (SPECIES[plant.species] || SPECIES.Other).emoji; }

// ---------- Ask Claude ----------
const DEFAULT_CLIMATE = 'Denver, CO (dry air, high altitude, strong sun)';
function getClimate() {
  try { return localStorage.getItem('pd-climate') || DEFAULT_CLIMATE; } catch { return DEFAULT_CLIMATE; }
}
function setClimate(v) { try { localStorage.setItem('pd-climate', v); } catch {} }

function claudePrompt(plant, logs, photoCount) {
  const s = plant.schedule || {};
  const recent = logs
    .filter(l => l.plantId === plant.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12)
    .map(l => `- ${l.date}: ${CARE_TYPES[l.type] ? CARE_TYPES[l.type].label : 'Note'}${l.note ? ' — ' + l.note : ''}`)
    .join('\n') || '- (nothing logged yet)';

  const lines = [
    `I'm tracking my houseplant in my Plant Daddy app and want your help keeping it alive and happy.`,
    ``,
    `PLANT`,
    `- Name: ${plant.name}${plant.nickname ? ` ("${plant.nickname}")` : ''}`,
    `- Species: ${plant.species}${plant.variety ? ' (' + plant.variety + ')' : ''}`,
    `- Had it since: ${plant.addedOn || 'unknown'}`,
    ``,
    `SPOT`,
    `- Room: ${plant.room || 'not set'}`,
    `- Nearest window faces: ${plant.windowDir || 'not set'}; distance from window: ${plant.windowDist || 'not set'}`,
    `- Light I'd guess it gets: ${plant.light || 'not set'}`,
    `- Where I live: ${getClimate()}`,
    ``,
    `POT`,
    `- Pot size: ${plant.potSize ? plant.potSize + ' in' : 'not set'}; drainage hole: ${plant.drainage === false ? 'no' : plant.drainage === true ? 'yes' : 'not sure'}`,
    `- Last repotted: ${plant.lastRepotted || 'unknown'}`,
    ``,
    `CURRENT SCHEDULE`,
    `- Water every ${s.water || '—'} days; fertilize every ${s.fertilize || '—'} days; rotate every ${s.rotate || '—'} days; check for repotting every ${s.repot || '—'} months`,
    ``,
    `RECENT CARE LOG`,
    recent,
  ];
  if (plant.notes) lines.push('', 'MY NOTES', plant.notes);
  lines.push(
    '',
    photoCount ? `I've attached a recent photo.` : `(No photo yet.)`,
    '',
    `Please (1) tell me how it looks and flag any problems, (2) say whether the light and pot are right, and (3) end with a schedule in exactly this format so I can enter it in the app:`,
    ``,
    `WATER: every N days`,
    `FERTILIZE: every N days (0 = pause)`,
    `ROTATE: every N days`,
    `REPOT CHECK: every N months`,
    `PHOTO CHECK-IN: every N days`,
  );
  return lines.join('\n');
}

// Pull numbers out of Claude's reply if the person pastes it back in.
function parseClaudeSchedule(text) {
  const grab = (re) => { const m = text.match(re); return m ? Number(m[1]) : null; };
  return {
    water: grab(/WATER:\s*every\s*(\d+)/i),
    fertilize: grab(/FERTILI[SZ]E:\s*every\s*(\d+)/i),
    rotate: grab(/ROTATE:\s*every\s*(\d+)/i),
    repot: grab(/REPOT(?:\s*CHECK)?:\s*every\s*(\d+)/i),
    photo: grab(/PHOTO(?:\s*CHECK-?IN)?:\s*every\s*(\d+)/i),
  };
}
