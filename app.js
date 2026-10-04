// Global State
let AppState = {
  data: {
    config: { days: [], periods: [] },
    batches: [],
    teachers: [],
    rooms: [],
    subjects: []
  },
  schedule: [],
  currentMode: 'batch', // 'batch' | 'teacher' | 'room'
  currentFilterId: 'SE' // default to SE
};

// DOM Loaded Entrypoint
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadData();
});

// Load Initial Data
async function loadData() {
  try {
    const res = await fetch('/api/data');
    const result = await res.json();
    AppState.data = result.data;
    AppState.schedule = result.schedule || [];

    updateMetrics();
    populateFormDropdowns();
    renderSubjectsTable();
    renderTeachersTable();
    renderRoomsTable();
    renderBatchesTable();
    initFilterDropdown();
    renderTimetable();
  } catch (err) {
    showToast('Failed to load application data: ' + err.message, 'error');
  }
}

// Event Listeners Setup
function initEventListeners() {
  // Tabs Navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // Mode Pills (Batch / Teacher / Room)
  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.currentMode = btn.getAttribute('data-mode');
      initFilterDropdown();
      renderTimetable();
    });
  });

  // Filter Dropdown Change
  document.getElementById('filter-select').addEventListener('change', (e) => {
    AppState.currentFilterId = e.target.value;
    renderTimetable();
  });

  // Dynamic Sub-Batch selector in Add Subject Modal
  const subBatchSelect = document.getElementById('sub-batch');
  if (subBatchSelect) {
    subBatchSelect.addEventListener('change', updateSubBatchOptionsInModal);
  }

  // Action Buttons
  document.getElementById('btn-generate').addEventListener('click', generateTimetable);
  document.getElementById('btn-reset').addEventListener('click', resetSampleData);
  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    if (AppState.schedule.length === 0) {
      showToast('Please generate a timetable before exporting CSV.', 'error');
      return;
    }
    window.location.href = '/api/export/csv';
  });

  // Modal Open Buttons
  document.getElementById('btn-open-add-subject').addEventListener('click', () => openModal('modal-add-subject'));
  document.getElementById('btn-open-add-teacher').addEventListener('click', () => openModal('modal-add-teacher'));
  document.getElementById('btn-open-add-room').addEventListener('click', () => openModal('modal-add-room'));
  document.getElementById('btn-open-add-batch').addEventListener('click', () => openModal('modal-add-batch'));

  // Modal Close Handlers
  document.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', () => {
      const modalId = el.getAttribute('data-close');
      closeModal(modalId);
    });
  });

  // Forms Submissions
  document.getElementById('form-add-subject').addEventListener('submit', handleAddSubject);
  document.getElementById('form-add-teacher').addEventListener('submit', handleAddTeacher);
  document.getElementById('form-add-room').addEventListener('submit', handleAddRoom);
  document.getElementById('form-add-batch').addEventListener('submit', handleAddBatch);
}

// Generate Timetable Handler
async function generateTimetable() {
  const btn = document.getElementById('btn-generate');
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> Solving & Minimizing Gaps...';

  try {
    const res = await fetch('/api/generate', { method: 'POST' });
    const result = await res.json();

    if (result.success) {
      AppState.schedule = result.schedule;
      const gapsMsg = result.gaps === 0 ? 'Zero Gaps (Continuous lectures guaranteed!)' : `${result.gaps} gap(s)`;
      showToast(`Success! Solved conflict-free in ${result.attempts} attempts. ${gapsMsg}`, 'success');
      updateMetrics(true, result);
      renderTimetable();
    } else {
      AppState.schedule = result.schedule || [];
      showToast(`Partial schedule: ${result.total_scheduled}/${result.total_requested} hours. Try relaxing constraints.`, 'error');
      updateMetrics(false, result);
      renderTimetable();
    }
  } catch (err) {
    showToast('Failed to generate timetable: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>⚡</span> Generate Timetable';
  }
}

// Reset Sample Data Handler
async function resetSampleData() {
  if (!confirm('Reset all classes (SE, TE, BE), sub-batches (H1, H2, H3), teachers, and labs back to standard college dataset?')) return;

  try {
    const res = await fetch('/api/data/reset', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      showToast('Sample dataset restored successfully.', 'success');
      loadData();
    }
  } catch (err) {
    showToast('Failed to reset: ' + err.message, 'error');
  }
}

// Update Dashboard Stat Cards
function updateMetrics(hasGenerated = null, genResult = null) {
  const d = AppState.data;
  document.getElementById('metric-batches').textContent = `${d.batches.length} Classes`;
  document.getElementById('metric-subjects').textContent = d.subjects.length;
  document.getElementById('metric-teachers').textContent = d.teachers.length;
  document.getElementById('metric-rooms').textContent = d.rooms.length;

  const statusBadge = document.getElementById('metric-status');
  if (hasGenerated === true) {
    const gapText = genResult?.gaps === 0 ? '0 Gaps ✓ Continuous' : `${genResult?.gaps} Gaps`;
    statusBadge.textContent = `${gapText}`;
    statusBadge.className = 'metric-value status-badge badge-success';
  } else if (hasGenerated === false) {
    statusBadge.textContent = `${genResult?.conflicts || 0} Unassigned`;
    statusBadge.className = 'metric-value status-badge badge-warning';
  } else if (AppState.schedule.length > 0) {
    statusBadge.textContent = 'Conflict-Free ✓ Continuous';
    statusBadge.className = 'metric-value status-badge badge-success';
  } else {
    statusBadge.textContent = 'Not Generated';
    statusBadge.className = 'metric-value status-badge badge-pending';
  }
}

// Populate Filter Dropdown
function initFilterDropdown() {
  const select = document.getElementById('filter-select');
  const label = document.getElementById('filter-label');
  select.innerHTML = '';

  const d = AppState.data;

  if (AppState.currentMode === 'batch') {
    label.textContent = 'Select Class / Batch:';
    
    d.batches.forEach(b => {
      // Group header / Whole Class
      const optGroup = document.createElement('optgroup');
      optGroup.label = b.name;

      const wholeOpt = document.createElement('option');
      wholeOpt.value = b.id;
      wholeOpt.textContent = `🎓 ${b.name} (Whole Class + All Labs)`;
      optGroup.appendChild(wholeOpt);

      // Sub-batches (e.g. H1, H2, H3)
      if (b.sub_batches && b.sub_batches.length > 0) {
        b.sub_batches.forEach(sub => {
          const subOpt = document.createElement('option');
          subOpt.value = `${b.id}:${sub}`;
          subOpt.textContent = `   🔬 Sub-Batch ${b.id}-${sub} (Capacity 25)`;
          optGroup.appendChild(subOpt);
        });
      }

      select.appendChild(optGroup);
    });

    // Default select SE or first batch
    AppState.currentFilterId = select.options.length > 0 ? select.options[0].value : null;

  } else if (AppState.currentMode === 'teacher') {
    label.textContent = 'Select Faculty:';
    d.teachers.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `👨‍🏫 ${t.name} (${t.dept})`;
      select.appendChild(opt);
    });
    AppState.currentFilterId = d.teachers.length > 0 ? d.teachers[0].id : null;

  } else if (AppState.currentMode === 'room') {
    label.textContent = 'Select Room / Lab:';
    d.rooms.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.type.toLowerCase() === 'lab' ? '🔬' : '🏛️'} ${r.name} [${r.type}]`;
      select.appendChild(opt);
    });
    AppState.currentFilterId = d.rooms.length > 0 ? d.rooms[0].id : null;
  }

  if (AppState.currentFilterId) {
    select.value = AppState.currentFilterId;
  }
}

// Render Timetable Grid Matrix
function renderTimetable() {
  const emptyState = document.getElementById('empty-schedule-prompt');
  const table = document.getElementById('timetable-table');
  const headerRow = document.getElementById('timetable-header-row');
  const tbody = document.getElementById('timetable-body');
  const counterBadge = document.getElementById('schedule-counter-badge');

  if (AppState.schedule.length === 0) {
    emptyState.classList.remove('hidden');
    table.classList.add('hidden');
    counterBadge.textContent = 'No schedule generated yet.';
    return;
  }

  emptyState.classList.add('hidden');
  table.classList.remove('hidden');

  const config = AppState.data.config;
  const days = config.days;
  const periods = config.periods;

  // Build Header Row
  headerRow.innerHTML = `<th class="day-header-col">Day / Time</th>`;
  periods.forEach(p => {
    if (p.is_break) {
      headerRow.innerHTML += `<th class="break-header">${p.label}<br><span style="font-size:0.7rem;font-weight:normal">${p.time}</span></th>`;
    } else {
      headerRow.innerHTML += `<th>${p.label}<br><span style="font-size:0.7rem;font-weight:normal;color:#64748b">${p.time}</span></th>`;
    }
  });

  // Maps for lookups
  const subMap = {};
  AppState.data.subjects.forEach(s => subMap[s.id] = s);
  const teacherMap = {};
  AppState.data.teachers.forEach(t => teacherMap[t.id] = t);
  const roomMap = {};
  AppState.data.rooms.forEach(r => roomMap[r.id] = r);
  const batchMap = {};
  AppState.data.batches.forEach(b => batchMap[b.id] = b);

  // Parsing current filter
  let filterBatchId = null;
  let filterSubBatchId = null;
  if (AppState.currentMode === 'batch' && AppState.currentFilterId) {
    if (AppState.currentFilterId.includes(':')) {
      const parts = AppState.currentFilterId.split(':');
      filterBatchId = parts[0];
      filterSubBatchId = parts[1];
    } else {
      filterBatchId = AppState.currentFilterId;
    }
  }

  let totalSlotsShown = 0;

  // Build Day Rows
  tbody.innerHTML = '';
  days.forEach(day => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="day-cell">${day}</td>`;

    periods.forEach(period => {
      if (period.is_break) {
        tr.innerHTML += `<td class="break-cell"><div class="break-vertical-text">LUNCH BREAK</div></td>`;
        return;
      }

      // Collect all slots matching this cell based on mode
      let cellSlots = [];

      if (AppState.currentMode === 'batch') {
        if (filterSubBatchId) {
          // Viewing a specific sub-batch e.g. "SE:H1"
          // Shows: common SE lectures (sub_batch_id === null) OR H1's own labs!
          cellSlots = AppState.schedule.filter(s => 
            s.day === day && s.period_id === period.id && s.batch_id === filterBatchId &&
            (s.sub_batch_id === null || s.sub_batch_id === filterSubBatchId)
          );
        } else {
          // Viewing whole class e.g. "SE"
          // Shows whole class lectures AND all parallel sub-batch labs (H1, H2, H3)!
          cellSlots = AppState.schedule.filter(s => 
            s.day === day && s.period_id === period.id && s.batch_id === filterBatchId
          );
        }
      } else if (AppState.currentMode === 'teacher') {
        cellSlots = AppState.schedule.filter(s => 
          s.day === day && s.period_id === period.id && s.teacher_id === AppState.currentFilterId
        );
      } else if (AppState.currentMode === 'room') {
        cellSlots = AppState.schedule.filter(s => 
          s.day === day && s.period_id === period.id && s.room_id === AppState.currentFilterId
        );
      }

      totalSlotsShown += cellSlots.length;

      if (cellSlots.length === 0) {
        tr.innerHTML += `
          <td class="slot-cell">
            <div class="slot-empty">Available</div>
          </td>
        `;
      } else if (cellSlots.length === 1 && !cellSlots[0].sub_batch_id) {
        // Standard single whole-class lecture
        const slot = cellSlots[0];
        const sub = subMap[slot.subject_id] || { code: 'SUB', name: 'Unknown', color: '#4f46e5' };
        const teacher = teacherMap[slot.teacher_id] || { short: 'Faculty' };
        const room = roomMap[slot.room_id] || { name: 'Room' };
        const batch = batchMap[slot.batch_id] || { name: 'Batch' };

        const displayMeta = AppState.currentMode === 'teacher'
          ? `<span class="slot-teacher">${batch.name}</span><span class="slot-room">📍 ${room.name}</span>`
          : AppState.currentMode === 'room'
          ? `<span class="slot-teacher">${teacher.short}</span><span class="slot-room">🎓 ${batch.name}</span>`
          : `<span class="slot-teacher">${teacher.short}</span><span class="slot-room">📍 ${room.name}</span>`;

        tr.innerHTML += `
          <td class="slot-cell">
            <div class="slot-card" style="border-left-color: ${sub.color || '#4f46e5'}">
              <div class="slot-top">
                <span class="slot-code">${sub.code}</span>
                <span style="font-size:0.65rem;color:var(--text-muted);font-weight:600;">Theory</span>
              </div>
              <div class="slot-name" title="${sub.name}">${sub.name}</div>
              <div class="slot-meta">
                ${displayMeta}
              </div>
            </div>
          </td>
        `;
      } else {
        // Multi-slot practical lab session (parallel sub-batches H1, H2, H3)
        let innerHtml = `<div class="multi-slot-container">`;
        cellSlots.forEach(slot => {
          const sub = subMap[slot.subject_id] || { code: 'LAB', name: 'Lab Practical', color: '#10b981' };
          const teacher = teacherMap[slot.teacher_id] || { short: 'Faculty' };
          const room = roomMap[slot.room_id] || { name: 'Lab' };
          const subBatchTag = slot.sub_batch_id ? slot.sub_batch_id : 'All';

          innerHtml += `
            <div class="sub-batch-lab-card" style="border-left-color: ${sub.color || '#10b981'}">
              <div class="sub-batch-lab-header">
                <span class="sub-batch-pill">${subBatchTag}</span>
                <span class="sub-batch-code">${sub.code}</span>
              </div>
              <div class="sub-batch-details">
                👨‍🏫 ${teacher.short} &nbsp;|&nbsp; 📍 ${room.name}
              </div>
            </div>
          `;
        });
        innerHtml += `</div>`;

        tr.innerHTML += `<td class="slot-cell">${innerHtml}</td>`;
      }
    });

    tbody.appendChild(tr);
  });

  counterBadge.textContent = `Showing active continuous schedule for ${AppState.currentMode} (${totalSlotsShown} assigned periods).`;
}

// Populate Modal Dropdowns
function populateFormDropdowns() {
  const subBatch = document.getElementById('sub-batch');
  const subTeacher = document.getElementById('sub-teacher');
  if (!subBatch || !subTeacher) return;

  subBatch.innerHTML = '';
  AppState.data.batches.forEach(b => {
    subBatch.innerHTML += `<option value="${b.id}">${b.name}</option>`;
  });

  subTeacher.innerHTML = '';
  AppState.data.teachers.forEach(t => {
    subTeacher.innerHTML += `<option value="${t.id}">${t.name} (${t.dept})</option>`;
  });

  updateSubBatchOptionsInModal();
}

function updateSubBatchOptionsInModal() {
  const subBatchSelect = document.getElementById('sub-batch');
  const subSubBatchSelect = document.getElementById('sub-sub-batch');
  if (!subBatchSelect || !subSubBatchSelect) return;

  const selectedBatchId = subBatchSelect.value;
  const batch = AppState.data.batches.find(b => b.id === selectedBatchId);

  subSubBatchSelect.innerHTML = `<option value="">Whole Class (All Sub-Batches together)</option>`;
  if (batch && batch.sub_batches) {
    batch.sub_batches.forEach(sb => {
      subSubBatchSelect.innerHTML += `<option value="${sb}">Sub-Batch ${sb} only (Lab Practical)</option>`;
    });
  }
}

// Render Subjects Table
function renderSubjectsTable() {
  const tbody = document.getElementById('subjects-table-body');
  tbody.innerHTML = '';

  const teacherMap = {};
  AppState.data.teachers.forEach(t => teacherMap[t.id] = t.name);
  const batchMap = {};
  AppState.data.batches.forEach(b => batchMap[b.id] = b.name);

  AppState.data.subjects.forEach(sub => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${sub.code}</strong></td>
      <td>
        <span class="color-dot" style="background-color: ${sub.color || '#3b82f6'}"></span>
        ${sub.name}
      </td>
      <td><strong>${sub.batch_id}</strong></td>
      <td>
        ${sub.sub_batch_id 
          ? `<span class="sub-batch-pill">${sub.sub_batch_id}</span>` 
          : `<span style="color:#64748b;font-size:0.75rem;">Whole Class</span>`
        }
      </td>
      <td>${teacherMap[sub.teacher_id] || sub.teacher_id}</td>
      <td><span class="${sub.is_lab ? 'slot-badge-lab' : ''}">${sub.is_lab ? 'Practical Lab' : 'Lecture'}</span></td>
      <td><strong>${sub.weekly_hours} hrs/week</strong></td>
      <td><code>${sub.color || '#3b82f6'}</code></td>
      <td>
        <button class="btn btn-danger-outline" onclick="deleteSubject('${sub.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Teachers Table
function renderTeachersTable() {
  const tbody = document.getElementById('teachers-table-body');
  tbody.innerHTML = '';

  AppState.data.teachers.forEach(t => {
    const hours = AppState.data.subjects
      .filter(s => s.teacher_id === t.id)
      .reduce((sum, s) => sum + s.weekly_hours, 0);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${t.id}</code></td>
      <td><strong>${t.name}</strong></td>
      <td><span class="slot-teacher">${t.short}</span></td>
      <td>${t.dept}</td>
      <td><strong>${hours} hrs/week</strong></td>
      <td>
        <button class="btn btn-danger-outline" onclick="deleteTeacher('${t.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Rooms Table
function renderRoomsTable() {
  const tbody = document.getElementById('rooms-table-body');
  tbody.innerHTML = '';

  AppState.data.rooms.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${r.id}</code></td>
      <td><strong>${r.name}</strong></td>
      <td><span class="${r.type.toLowerCase() === 'lab' ? 'slot-badge-lab' : ''}">${r.type}</span></td>
      <td>${r.capacity} seats</td>
      <td>
        <button class="btn btn-danger-outline" onclick="deleteRoom('${r.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Batches Table
function renderBatchesTable() {
  const tbody = document.getElementById('batches-table-body');
  tbody.innerHTML = '';

  AppState.data.batches.forEach(b => {
    const hours = AppState.data.subjects
      .filter(s => s.batch_id === b.id)
      .reduce((sum, s) => sum + s.weekly_hours, 0);

    const subBatchesHtml = b.sub_batches && b.sub_batches.length > 0
      ? b.sub_batches.map(sb => `<span class="sub-batch-pill" style="margin-right:4px;">${sb}</span>`).join('')
      : '<em>None</em>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${b.id}</strong></td>
      <td><strong>${b.name}</strong></td>
      <td>${subBatchesHtml}</td>
      <td>${b.capacity || 75} students</td>
      <td><strong>${hours} hrs/week</strong></td>
      <td>
        <button class="btn btn-danger-outline" onclick="deleteBatch('${b.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Form Handlers
async function handleAddSubject(e) {
  e.preventDefault();
  const subSubBatch = document.getElementById('sub-sub-batch').value.trim();
  const payload = {
    code: document.getElementById('sub-code').value,
    name: document.getElementById('sub-name').value,
    batch_id: document.getElementById('sub-batch').value,
    sub_batch_id: subSubBatch ? subSubBatch : null,
    teacher_id: document.getElementById('sub-teacher').value,
    weekly_hours: parseInt(document.getElementById('sub-hours').value),
    is_lab: document.getElementById('sub-is-lab').value === 'true',
    color: document.getElementById('sub-color').value
  };

  try {
    const res = await fetch('/api/subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Subject ${payload.code} added.`, 'success');
      closeModal('modal-add-subject');
      e.target.reset();
      loadData();
    }
  } catch (err) {
    showToast('Failed to add subject: ' + err.message, 'error');
  }
}

async function handleAddTeacher(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('teacher-name').value,
    short: document.getElementById('teacher-short').value,
    dept: document.getElementById('teacher-dept').value
  };

  try {
    const res = await fetch('/api/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Faculty ${payload.name} added.`, 'success');
      closeModal('modal-add-teacher');
      e.target.reset();
      loadData();
    }
  } catch (err) {
    showToast('Failed to add faculty: ' + err.message, 'error');
  }
}

async function handleAddRoom(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('room-name').value,
    type: document.getElementById('room-type').value,
    capacity: parseInt(document.getElementById('room-capacity').value)
  };

  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Room ${payload.name} added.`, 'success');
      closeModal('modal-add-room');
      e.target.reset();
      loadData();
    }
  } catch (err) {
    showToast('Failed to add room: ' + err.message, 'error');
  }
}

async function handleAddBatch(e) {
  e.preventDefault();
  const payload = {
    id: document.getElementById('batch-id').value.trim().toUpperCase(),
    name: document.getElementById('batch-name').value.trim(),
    sub_batches: document.getElementById('batch-sub-batches').value,
    capacity: parseInt(document.getElementById('batch-capacity').value)
  };

  try {
    const res = await fetch('/api/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Class ${payload.name} added.`, 'success');
      closeModal('modal-add-batch');
      e.target.reset();
      loadData();
    }
  } catch (err) {
    showToast('Failed to add batch: ' + err.message, 'error');
  }
}

// Delete Handlers
async function deleteSubject(id) {
  if (!confirm('Are you sure you want to remove this subject?')) return;
  await fetch(`/api/subjects/${id}`, { method: 'DELETE' });
  showToast('Subject removed.', 'success');
  loadData();
}

async function deleteTeacher(id) {
  if (!confirm('Are you sure you want to remove this faculty member? Their subjects will also be removed.')) return;
  await fetch(`/api/teachers/${id}`, { method: 'DELETE' });
  showToast('Faculty member removed.', 'success');
  loadData();
}

async function deleteRoom(id) {
  if (!confirm('Are you sure you want to remove this room?')) return;
  await fetch(`/api/rooms/${id}`, { method: 'DELETE' });
  showToast('Room removed.', 'success');
  loadData();
}

async function deleteBatch(id) {
  if (!confirm('Are you sure you want to remove this class/batch?')) return;
  await fetch(`/api/batches/${id}`, { method: 'DELETE' });
  showToast('Class removed.', 'success');
  loadData();
}

// Modal Helpers
function openModal(id) {
  populateFormDropdowns();
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// Toast Notification
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : '⚠️'}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
