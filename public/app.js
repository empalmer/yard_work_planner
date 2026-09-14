let sectionsData = {};
let selectedId = null;
let zoneElements = [];
const zonesBySectionId = new Map();

const panel = document.getElementById('panel');
const diagramElement = document.getElementById('diagram');

// Map shape IDs from the SVG Sections layer to app section IDs.
const svgShapeToSectionId = {
  rect5: 'back-left-garden',
  rect6: 'back-center',
  rect7: 'side-left-upper',
  rect8: 'back-center-upper-right',
  rect9: 'back-center-left',
  rect10: 'back-right-garden',
  rect11: 'back-right-middle',
  rect12: 'center-bed-left',
  rect13: 'front-right-garden',
  rect14: 'back-right-lower',
  rect15: 'side-right-lower',
  rect16: 'front-garden-right',
  rect17: 'front-left-garden',
  rect18: 'front-garden-left',
  rect19: 'center-bed-middle',
  rect20: 'center-bed-upper',
  rect21: 'center-upper-left',
  rect22: 'front-center',
  rect23: 'center-bed-lower',
  rect31: 'center-border-strip',
  rect32: 'center-bed-cap'
};

// Default section names
const sectionNames = {
  'back-left-garden': 'Back Garden - Left',
  'back-center': 'Back Yard Center',
  'back-center-upper-right': 'Back Center - Upper Right',
  'back-center-left': 'Back Center - Left',
  'back-right-garden': 'Back Garden - Right',
  'back-right-middle': 'Back Right - Middle',
  'back-right-lower': 'Back Right - Lower',
  'side-left-upper': 'Left Side - Upper Garden',
  'side-left-lower': 'Left Side - Lower Garden',
  'side-right-lower': 'Right Side - Lower Garden',
  'front-left-garden': 'Front Garden - Left',
  'front-center': 'Front Yard Center',
  'front-right-garden': 'Front Garden - Right',
  'front-garden-left': 'Far Front Garden - Left',
  'front-garden-right': 'Far Front Garden - Right',
  'center-bed-left': 'Center Bed - Left',
  'center-bed-upper': 'Center Bed - Upper',
  'center-bed-middle': 'Center Bed - Middle',
  'center-bed-lower': 'Center Bed - Lower',
  'center-upper-left': 'Center - Upper Left',
  'center-large-area': 'Center - Large Area',
  'center-border-strip': 'Center Border Strip',
  'center-bed-cap': 'Center Bed Cap'
};

function prettyNameFromId(id) {
  return id
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getDefaultSectionName(id) {
  return sectionNames[id] || prettyNameFromId(id);
}

function ensureSectionRecord(id) {
  if (!sectionsData[id]) {
    sectionsData[id] = {
      name: getDefaultSectionName(id),
      plants: [],
      workLog: [],
      tasks: [],
      sunShade: '',
      sunHours: []
    };
  } else {
    if (!sectionsData[id].name) sectionsData[id].name = getDefaultSectionName(id);
    if (!sectionsData[id].tasks) sectionsData[id].tasks = [];
    if (!sectionsData[id].sunHours) sectionsData[id].sunHours = [];
  }
}

// --- Sun / shade helpers ---

function timeToMinutes(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

function minutesToLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h < 12 ? 'AM' : 'PM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// Returns true if the given minute-of-day falls within any sun range for the section.
function isSunAt(section, minutes) {
  return (section.sunHours || []).some(r => {
    const start = timeToMinutes(r.start);
    const end = timeToMinutes(r.end);
    if (start === end) return false;
    if (start < end) return minutes >= start && minutes < end;
    // Range spans midnight.
    return minutes >= start || minutes < end;
  });
}

function getSunStatus(section) {
  if (!section.sunHours || section.sunHours.length === 0) return 'unknown';
  return isSunAt(section, nowMinutes()) ? 'sun' : 'shade';
}

function buildTimelineHtml(sunHours) {
  const segments = (sunHours || [])
    .map(r => {
      const start = timeToMinutes(r.start);
      const end = timeToMinutes(r.end);
      if (end <= start) return '';
      const left = (start / 1440) * 100;
      const width = ((end - start) / 1440) * 100;
      return `<div class="sun-segment" style="left:${left}%;width:${width}%;" title="Sun ${minutesToLabel(start)} - ${minutesToLabel(end)}"></div>`;
    })
    .join('');

  const nowLeft = (nowMinutes() / 1440) * 100;

  return `
    <div class="sun-timeline-bar">
      ${segments}
      <div class="now-marker" style="left:${nowLeft}%;" title="Now"></div>
    </div>
    <div class="sun-timeline-ticks">
      <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>12am</span>
    </div>
  `;
}

let pendingTaskText = null;
const taskAssignStatus = document.getElementById('taskAssignStatus');
const newTaskForm = document.getElementById('newTaskForm');

if (newTaskForm) {
  newTaskForm.addEventListener('submit', e => {
    e.preventDefault();
    const input = document.getElementById('newTaskInput');
    const value = input.value.trim();
    if (!value) return;
    pendingTaskText = value;
    input.value = '';
    taskAssignStatus.textContent = `Click a section on the diagram to assign: "${value}"`;
  });
}

async function handleZoneClick(id) {
  if (pendingTaskText) {
    ensureSectionRecord(id);
    sectionsData[id].tasks.push({ id: makeTaskId(), text: pendingTaskText, done: false });
    const text = pendingTaskText;
    pendingTaskText = null;
    taskAssignStatus.textContent = '';
    await saveSection(id);
    selectZone(id);
    return;
  }
  selectZone(id);
}

let taskOrder = [];

function makeTaskId() {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function loadData() {
  const res = await fetch('/api/data');
  const data = await res.json();
  sectionsData = data.sections || {};
  taskOrder = data.taskOrder || [];

  // Initialize known sections.
  Object.keys(sectionNames).forEach(id => {
    ensureSectionRecord(id);
  });

  // Backfill ids for tasks that predate the ordering feature.
  Object.values(sectionsData).forEach(section => {
    (section.tasks || []).forEach(task => {
      if (!task.id) task.id = makeTaskId();
    });
  });
}

async function saveTaskOrder() {
  await fetch('/api/task-order', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskOrder })
  });
}

function isWorkLogStale(section) {
  const dates = (section.workLog || [])
    .map(entry => typeof entry === 'string' ? entry : entry.date)
    .filter(Boolean);
  if (!dates.length) return true;
  const mostRecent = dates.sort().reverse()[0];
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 1);
  return new Date(mostRecent + 'T00:00:00') < cutoff;
}

async function flagStaleSections() {
  const staleIds = [];
  Object.keys(sectionsData).forEach(id => {
    if (!zonesBySectionId.has(id)) return;
    const section = sectionsData[id];
    if (!isWorkLogStale(section)) return;
    section.tasks = section.tasks || [];
    const taskText = `Work on ${section.name}`;
    if (section.tasks.some(t => t.text === taskText)) return;
    section.tasks.push({ id: makeTaskId(), text: taskText, done: false });
    staleIds.push(id);
  });
  for (const id of staleIds) {
    await saveSection(id);
  }
}

async function saveSection(id) {
  const res = await fetch(`/api/sections/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sectionsData[id])
  });
  sectionsData[id] = await res.json();
  renderAllTasks();
  renderSunOverview();
}

const allTasksList = document.getElementById('allTasksList');

function renderAllTasks() {
  if (!allTasksList) return;

  const entries = [];
  Object.keys(sectionsData).forEach(id => {
    const section = sectionsData[id];
    (section.tasks || []).forEach((task, index) => {
      if (!task.done) entries.push({ sectionId: id, sectionName: section.name, text: task.text, index, taskId: task.id });
    });
  });

  const orderIndex = new Map(taskOrder.map((id, i) => [id, i]));
  entries.sort((a, b) => {
    const ai = orderIndex.has(a.taskId) ? orderIndex.get(a.taskId) : Infinity;
    const bi = orderIndex.has(b.taskId) ? orderIndex.get(b.taskId) : Infinity;
    return ai - bi;
  });

  if (!entries.length) {
    allTasksList.innerHTML = '<li><span>No active tasks.</span></li>';
    return;
  }

  allTasksList.innerHTML = entries
    .map(e => `<li draggable="true" data-section-id="${e.sectionId}" data-task-id="${e.taskId}"><span class="drag-handle">⠿</span><span class="task-text">${escapeHtml(e.text)}</span><span class="task-section">${escapeHtml(e.sectionName)}</span></li>`)
    .join('');

  let draggedId = null;

  allTasksList.querySelectorAll('li[data-section-id]').forEach(li => {
    const id = li.dataset.sectionId;
    li.addEventListener('mouseenter', () => {
      const zone = zonesBySectionId.get(id);
      if (zone) zone.classList.add('hovered');
    });
    li.addEventListener('mouseleave', () => {
      const zone = zonesBySectionId.get(id);
      if (zone) zone.classList.remove('hovered');
    });
    li.addEventListener('click', () => handleZoneClick(id));

    li.addEventListener('dragstart', e => {
      draggedId = li.dataset.taskId;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      draggedId = null;
    });
    li.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const dragging = allTasksList.querySelector('.dragging');
      if (!dragging || dragging === li) return;
      const rect = li.getBoundingClientRect();
      const before = e.clientY - rect.top < rect.height / 2;
      allTasksList.insertBefore(dragging, before ? li : li.nextSibling);
    });
    li.addEventListener('drop', async e => {
      e.preventDefault();
      taskOrder = Array.from(allTasksList.querySelectorAll('li[data-task-id]')).map(el => el.dataset.taskId);
      await saveTaskOrder();
    });
  });
}

const sunOverviewList = document.getElementById('sunOverviewList');
const sunOverviewClock = document.getElementById('sunOverviewClock');

const statusLabels = {
  sun: 'In Sun',
  shade: 'In Shade',
  unknown: 'No data'
};

function renderSunOverview() {
  if (sunOverviewClock) {
    sunOverviewClock.textContent = `Now: ${minutesToLabel(nowMinutes())}`;
  }
  if (!sunOverviewList) return;

  const entries = Object.keys(sectionsData)
    .map(id => ({ id, section: sectionsData[id], status: getSunStatus(sectionsData[id]) }))
    .sort((a, b) => a.section.name.localeCompare(b.section.name));

  if (!entries.length) {
    sunOverviewList.innerHTML = '<li><span>No sections yet.</span></li>';
    return;
  }

  sunOverviewList.innerHTML = entries
    .map(e => `
      <li data-section-id="${e.id}">
        <span class="task-section-name">${escapeHtml(e.section.name)}</span>
        <span class="sun-status sun-status-${e.status}">${statusLabels[e.status]}</span>
      </li>
    `)
    .join('');

  sunOverviewList.querySelectorAll('li[data-section-id]').forEach(li => {
    const id = li.dataset.sectionId;
    li.addEventListener('mouseenter', () => {
      const zone = zonesBySectionId.get(id);
      if (zone) zone.classList.add('hovered');
    });
    li.addEventListener('mouseleave', () => {
      const zone = zonesBySectionId.get(id);
      if (zone) zone.classList.remove('hovered');
    });
    li.addEventListener('click', () => handleZoneClick(id));
  });
}

function selectZone(id) {
  ensureSectionRecord(id);
  selectedId = id;
  zoneElements.forEach(z => z.classList.remove('selected'));
  const el = zonesBySectionId.get(id);
  if (el) el.classList.add('selected');
  renderPanel();
}

function renderPanel() {
  const section = sectionsData[selectedId];
  if (!section) {
    panel.innerHTML = '<p class="placeholder">Select a section on the diagram to get started.</p>';
    return;
  }

  const plantItems = (section.plants || [])
    .map((p, i) => `<li><span>${escapeHtml(p)}</span><button class="remove-btn" data-type="plant" data-index="${i}">Remove</button></li>`)
    .join('');

  const logItems = (section.workLog || [])
    .map((entry, idx) => ({ idx, date: typeof entry === 'string' ? entry : entry.date, note: typeof entry === 'string' ? '' : (entry.note || '') }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .reverse()
    .map(({ idx, date, note }) => `<li><span>${formatDate(date)}${note ? `<span class="log-note"> — ${escapeHtml(note)}</span>` : ''}</span><button class="remove-btn" data-type="log" data-index="${idx}">Remove</button></li>`)
    .join('');

  const taskItems = (section.tasks || [])
    .map((t, i) => `<li class="${t.done ? 'task-done' : ''}"><label><input type="checkbox" data-index="${i}" class="task-check" ${t.done ? 'checked' : ''}><span>${escapeHtml(t.text)}</span></label><button class="remove-btn" data-type="task" data-index="${i}">Remove</button></li>`)
    .join('');

  panel.innerHTML = `
    <div class="panel-header">
      <h2 id="sectionTitle">${escapeHtml(section.name)}</h2>
      <button class="rename-btn" id="renameSectionBtn" title="Rename section">Rename</button>
    </div>

    <section>
      <h3>Work Log</h3>
      <ul class="log-list">${logItems || '<li><span>No work logged yet.</span></li>'}</ul>
      <form class="inline-form" id="addLogForm">
        <input type="date" id="logDateInput" value="${todayISO()}" required>
        <input type="text" id="logNoteInput" placeholder="Notes (optional)">
        <button type="submit">Log Work</button>
      </form>
    </section>

    <section>
      <h3>Tasks</h3>
      <ul class="task-list">${taskItems || '<li><span>No tasks assigned yet.</span></li>'}</ul>
      <form class="inline-form" id="addTaskForm">
        <input type="text" id="taskInput" placeholder="Add a task..." required>
        <button type="submit">Add</button>
      </form>
    </section>

    <section class="sun-section">
      <div class="sun-section-header">
        <h3>Sun / Shade</h3>
        <button class="edit-btn" id="editSunHoursBtn">Edit</button>
      </div>
      <div id="sunTimeline">${buildTimelineHtml(section.sunHours)}</div>
      <div class="sun-legend"><span class="legend-sun">Sun</span><span class="legend-shade">Shade</span></div>
      <div class="sun-edit-form" id="sunEditForm" hidden>
        <div id="sunRangesList"></div>
        <button type="button" class="add-range-btn" id="addSunRangeBtn">+ Add sun period</button>
        <div class="sun-edit-actions">
          <button type="button" class="save-btn" id="saveSunHoursBtn">Save</button>
          <button type="button" id="cancelSunHoursBtn">Cancel</button>
        </div>
      </div>
    </section>

    <section>
      <div class="plants-section-header">
        <h3>Plants</h3>
        <button class="edit-btn" id="togglePlantFormBtn">Add</button>
      </div>
      <ul class="plant-list">${plantItems || '<li><span>No plants added yet.</span></li>'}</ul>
      <form class="inline-form" id="addPlantForm" hidden>
        <input type="text" id="plantInput" placeholder="Add a plant..." required>
        <button type="submit">Add</button>
      </form>
    </section>
  `;

  document.getElementById('renameSectionBtn').addEventListener('click', async () => {
    const newName = prompt('Enter a new name for this section:', section.name);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === section.name) return;
    section.name = trimmed;
    await saveSection(selectedId);
    renderPanel();
  });

  document.getElementById('togglePlantFormBtn').addEventListener('click', () => {
    document.getElementById('addPlantForm').hidden = false;
    document.getElementById('plantInput').focus();
  });

  document.getElementById('addPlantForm').addEventListener('submit', async e => {
    e.preventDefault();
    const input = document.getElementById('plantInput');
    const value = input.value.trim();
    if (!value) return;
    section.plants = section.plants || [];
    section.plants.push(value);
    await saveSection(selectedId);
    renderPanel();
  });

  document.getElementById('addLogForm').addEventListener('submit', async e => {
    e.preventDefault();
    const value = document.getElementById('logDateInput').value;
    if (!value) return;
    const note = document.getElementById('logNoteInput').value.trim();
    section.workLog = section.workLog || [];
    section.workLog.push(note ? { date: value, note } : { date: value, note: '' });
    await saveSection(selectedId);
    renderPanel();
  });

  document.getElementById('addTaskForm').addEventListener('submit', async e => {
    e.preventDefault();
    const input = document.getElementById('taskInput');
    const value = input.value.trim();
    if (!value) return;
    section.tasks = section.tasks || [];
    section.tasks.push({ id: makeTaskId(), text: value, done: false });
    await saveSection(selectedId);
    renderPanel();
  });

  panel.querySelectorAll('.task-check').forEach(cb => {
    cb.addEventListener('change', async () => {
      const index = Number(cb.dataset.index);
      if (cb.checked) {
        const [completed] = section.tasks.splice(index, 1);
        section.workLog = section.workLog || [];
        section.workLog.push({ date: todayISO(), note: completed.text });
      } else {
        section.tasks[index].done = false;
      }
      await saveSection(selectedId);
      renderPanel();
    });
  });

  document.getElementById('saveSunShadeBtn')?.addEventListener('click', async () => {
    section.sunShade = document.getElementById('sunShadeInput').value;
    await saveSection(selectedId);
  });

  // --- Sun / shade editing ---
  const sunEditForm = document.getElementById('sunEditForm');
  const sunRangesList = document.getElementById('sunRangesList');
  let editRanges = (section.sunHours || []).map(r => ({ ...r }));

  function renderRanges() {
    sunRangesList.innerHTML = editRanges
      .map((r, i) => `
        <div class="sun-range-row" data-index="${i}">
          <input type="time" class="sun-start" value="${r.start || ''}">
          <span>to</span>
          <input type="time" class="sun-end" value="${r.end || ''}">
          <button type="button" class="remove-btn remove-range-btn">Remove</button>
        </div>
      `)
      .join('') || '<p class="placeholder">No sun periods added yet.</p>';

    sunRangesList.querySelectorAll('.sun-range-row').forEach(row => {
      const idx = Number(row.dataset.index);
      row.querySelector('.sun-start').addEventListener('change', e => {
        editRanges[idx].start = e.target.value;
      });
      row.querySelector('.sun-end').addEventListener('change', e => {
        editRanges[idx].end = e.target.value;
      });
      row.querySelector('.remove-range-btn').addEventListener('click', () => {
        editRanges.splice(idx, 1);
        renderRanges();
      });
    });
  }

  document.getElementById('editSunHoursBtn').addEventListener('click', () => {
    editRanges = (section.sunHours || []).map(r => ({ ...r }));
    renderRanges();
    sunEditForm.hidden = !sunEditForm.hidden;
  });

  document.getElementById('addSunRangeBtn').addEventListener('click', () => {
    editRanges.push({ start: '09:00', end: '12:00' });
    renderRanges();
  });

  document.getElementById('cancelSunHoursBtn').addEventListener('click', () => {
    sunEditForm.hidden = true;
  });

  document.getElementById('saveSunHoursBtn').addEventListener('click', async () => {
    section.sunHours = editRanges.filter(r => r.start && r.end);
    await saveSection(selectedId);
    renderPanel();
  });

  panel.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      const index = Number(btn.dataset.index);
      if (type === 'plant') section.plants.splice(index, 1);
      if (type === 'log') section.workLog.splice(index, 1);
      if (type === 'task') section.tasks.splice(index, 1);
      await saveSection(selectedId);
      renderPanel();
    });
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function injectSvgZoneStyles(svgDoc) {
  if (svgDoc.getElementById('app-zone-style')) return;

  const style = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.setAttribute('id', 'app-zone-style');
  style.textContent = `
    .zone { cursor: pointer; transition: fill-opacity 0.15s ease, stroke 0.15s ease, stroke-width 0.15s ease; }
    .zone:hover { fill: #c3e6b1 !important; fill-opacity: 0.35 !important; stroke: #2d5c27 !important; stroke-width: 1.6 !important; }
    .zone.selected { fill: #ffd966 !important; fill-opacity: 0.45 !important; stroke: #d4a500 !important; stroke-width: 1.8 !important; }
    .zone.hovered { fill: #5aa9e6 !important; fill-opacity: 0.45 !important; stroke: #1c5f9c !important; stroke-width: 2.2 !important; }
  `;

  const root = svgDoc.documentElement;
  root.insertBefore(style, root.firstChild);
}

function attachZoneListeners() {
  let svgDoc;
  try {
    svgDoc = diagramElement.contentDocument || diagramElement.contentWindow?.document;
  } catch (e) {
    console.warn('Could not access external SVG:', e);
    return;
  }

  if (!svgDoc) return;

  injectSvgZoneStyles(svgDoc);

  const sectionLayer =
    svgDoc.querySelector('g[inkscape\\:label="Sections"]') ||
    svgDoc.querySelector('g[id="layer1"]');

  if (!sectionLayer) {
    console.warn('No Sections layer found in SVG.');
    return;
  }

  const shapes = sectionLayer.querySelectorAll('rect[id], path[id], polygon[id], circle[id], ellipse[id]');

  zoneElements = Array.from(shapes);
  zonesBySectionId.clear();

  zoneElements.forEach(shape => {
    const shapeId = shape.getAttribute('id') || '';
    const sectionId = svgShapeToSectionId[shapeId] || shapeId;

    shape.classList.add('zone');
    shape.dataset.id = sectionId;

    // Many section shapes have fill="none" in Inkscape; add near-transparent fill so full area is clickable.
    if (!shape.style.fill || shape.style.fill === 'none') {
      shape.style.fill = '#00ff00';
      shape.style.fillOpacity = '0.001';
    }
    shape.style.pointerEvents = 'all';

    ensureSectionRecord(sectionId);
    zonesBySectionId.set(sectionId, shape);

    shape.addEventListener('click', () => handleZoneClick(sectionId));
  });

  if (selectedId && zonesBySectionId.has(selectedId)) {
    zonesBySectionId.get(selectedId).classList.add('selected');
  }
}

const svgLoaded = new Promise(resolve => {
  if (diagramElement) {
    diagramElement.addEventListener('load', () => {
      attachZoneListeners();
      resolve();
    });
  } else {
    resolve();
  }
});

Promise.all([loadData(), svgLoaded]).then(async () => {
  await flagStaleSections();
  renderAllTasks();
  renderSunOverview();
});

// Refresh the "now" marker, sun/shade statuses, and clock every minute.
setInterval(() => {
  renderSunOverview();
  if (selectedId) {
    const timeline = document.getElementById('sunTimeline');
    if (timeline) timeline.innerHTML = buildTimelineHtml(sectionsData[selectedId].sunHours);
  }
}, 60000);
