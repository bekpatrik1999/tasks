// ── Config ────────────────────────────────────────────────────────────────────

const COLS = [
  { id: 'crit', label: 'Критично', color: 'var(--c-crit)' },
  { id: 'high', label: 'Важно',    color: 'var(--c-high)' },
  { id: 'med',  label: 'Обычное',  color: 'var(--c-med)'  },
  { id: 'low',  label: 'Потом',    color: 'var(--c-low)'  },
];

const URG = [
  { id: 'now',  label: 'Срочно'    },
  { id: 'week', label: 'Неделя'    },
  { id: 'late', label: 'Не срочно' },
];

const TIME = [
  { id: '15m', label: '15м'  },
  { id: '30m', label: '30м'  },
  { id: '1h',  label: '1ч'   },
  { id: '2h',  label: '2ч'   },
  { id: '4h',  label: '4ч'   },
  { id: 'day', label: 'День' },
];

const PALETTE = ['#e53935','#f57c00','#fdd835','#43a047','#00acc1','#1e88e5','#8e24aa','#6d4c41'];

const TK = 'theme-v1';
const AK = 'api-key-v1';

// ── Firebase ──────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: "AIzaSyCPVnifgDhXGnbYi9mhn0diq2ZR_4Qykq8",
  authDomain: "tasks-1a853.firebaseapp.com",
  projectId: "tasks-1a853",
  storageBucket: "tasks-1a853.firebasestorage.app",
  messagingSenderId: "39342365836",
  appId: "1:39342365836:web:9c885f70b34c4aacfdefa9",
};

firebase.initializeApp(firebaseConfig);
const db          = firebase.firestore();
const tasksCol    = db.collection('tasks');
const projectsCol = db.collection('projects');

// ── State ─────────────────────────────────────────────────────────────────────

let tasks           = [];
let projects        = [];
let activeProjectId = null;   // null = all
let openCol         = null;
let openTaskId      = null;
let selUrg          = 'now';
let selTime         = '1h';

const getKey = () => localStorage.getItem(AK) || '';

// ── Theme ─────────────────────────────────────────────────────────────────────

const applyTheme = t => {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(TK, t);
};

document.getElementById('theme-btn').onclick = () =>
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');

applyTheme(localStorage.getItem(TK) || 'light');

// ── API key ───────────────────────────────────────────────────────────────────

const keyBtn = document.getElementById('key-btn');
const keyBar = document.getElementById('key-bar');
const keyInp = document.getElementById('key-input');

keyBtn.onclick = () => {
  keyBar.classList.toggle('hidden');
  if (!keyBar.classList.contains('hidden')) { keyInp.value = getKey(); keyInp.focus(); }
};

document.getElementById('key-save').onclick = () => {
  const v = keyInp.value.trim();
  if (v) { localStorage.setItem(AK, v); keyBar.classList.add('hidden'); toast('✨ API ключ сохранён'); }
};

keyInp.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('key-save').click(); });

// ── Sidebar toggle ────────────────────────────────────────────────────────────

document.getElementById('sidebar-toggle').onclick = () =>
  document.getElementById('sidebar').classList.toggle('open');

// ── Claude API call (browser-side) ───────────────────────────────────────────

async function claudeCall({ system, userMsg, maxTokens = 256 }) {
  const key = getKey();
  if (!key) return null;
  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: userMsg }],
  };
  if (system) body.system = system;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('API error ' + r.status);
  const d = await r.json();
  return d.content?.[0]?.text?.trim() || null;
}

// ── AI improve title ──────────────────────────────────────────────────────────

async function aiImprove(text) {
  if (!getKey()) return text;
  try {
    const result = await claudeCall({
      userMsg: `Исправь орфографию и сделай название задачи грамотным. Только результат, без кавычек и пояснений.\n\n${text}`,
      maxTokens: 64,
    });
    return result || text;
  } catch { return text; }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

let toastTimer;
function toast(msg) {
  let el = document.querySelector('.ai-toast');
  if (!el) { el = document.createElement('div'); el.className = 'ai-toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function dueCls(iso) {
  if (!iso) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso + 'T00:00:00');
  if (d < today) return 'due-overdue';
  if (d.getTime() === today.getTime()) return 'due-today';
  return 'due-future';
}

function nextColor() {
  const used = new Set(projects.map(p => p.color));
  return PALETTE.find(c => !used.has(c)) || PALETTE[projects.length % PALETTE.length];
}

// ── Projects ──────────────────────────────────────────────────────────────────

document.getElementById('add-project-btn').onclick = () => {
  const name = prompt('Название проекта:')?.trim();
  if (!name) return;
  const id = Date.now().toString();
  projectsCol.doc(id).set({
    id,
    name,
    color: nextColor(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
};

function renderSidebar() {
  const list = document.getElementById('project-list');

  const allCount = tasks.filter(t => !t.done).length;
  let html = `
    <div class="project-item ${activeProjectId === null ? 'active' : ''}" data-pid="all">
      <span class="project-dot" style="background:var(--muted)"></span>
      <span class="project-name">Все задачи</span>
      ${allCount ? `<span class="project-count">${allCount}</span>` : ''}
    </div>`;

  for (const p of projects) {
    const count = tasks.filter(t => t.projectId === p.id && !t.done).length;
    html += `
      <div class="project-item ${activeProjectId === p.id ? 'active' : ''}" data-pid="${p.id}">
        <span class="project-dot" style="background:${escHtml(p.color)}"></span>
        <span class="project-name">${escHtml(p.name)}</span>
        ${count ? `<span class="project-count">${count}</span>` : ''}
        <button class="project-del" data-pid="${p.id}">×</button>
      </div>`;
  }

  list.innerHTML = html;

  list.querySelectorAll('.project-item').forEach(item => {
    item.onclick = e => {
      if (e.target.classList.contains('project-del')) return;
      activeProjectId = item.dataset.pid === 'all' ? null : item.dataset.pid;
      openCol = null;
      const proj = projects.find(p => p.id === activeProjectId);
      document.getElementById('current-project-name').textContent =
        activeProjectId === null ? 'Все задачи' : (proj?.name || 'Задачи');
      renderSidebar();
      renderBoard();
      if (window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
    };
  });

  list.querySelectorAll('.project-del').forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      const proj = projects.find(p => p.id === btn.dataset.pid);
      if (!confirm(`Удалить проект «${proj?.name}»? Задачи не удалятся.`)) return;
      await projectsCol.doc(btn.dataset.pid).delete();
      if (activeProjectId === btn.dataset.pid) {
        activeProjectId = null;
        document.getElementById('current-project-name').textContent = 'Все задачи';
        renderBoard();
      }
    };
  });
}

// ── Voice ─────────────────────────────────────────────────────────────────────

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition    = null;
let finalTranscript = '';
let voiceActive    = false;

function initVoice() {
  const voiceBtn = document.getElementById('voice-btn');
  if (!SpeechRecognition) {
    voiceBtn.title   = 'Голосовой ввод не поддерживается этим браузером';
    voiceBtn.style.opacity = '.4';
    voiceBtn.onclick = () => openVoiceOverlay(); // still allow typed commands
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = navigator.language || 'ru-RU';
  recognition.continuous      = true;
  recognition.interimResults  = true;

  recognition.onresult = e => {
    let interim = '';
    finalTranscript = '';
    for (let i = 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript + ' ';
      else interim += e.results[i][0].transcript;
    }
    finalTranscript = finalTranscript.trim();
    const display = finalTranscript || interim;
    document.getElementById('voice-transcript').textContent = display || 'Говорите…';
  };

  recognition.onerror = e => {
    if (e.error !== 'no-speech') toast('Ошибка распознавания: ' + e.error);
  };

  recognition.onend = () => {
    document.getElementById('voice-waves').classList.remove('active');
    voiceActive = false;
  };

  voiceBtn.onclick = openVoiceOverlay;
}

function openVoiceOverlay() {
  finalTranscript = '';
  document.getElementById('voice-transcript').textContent = recognition ? 'Говорите…' : 'Введите команду:';
  document.getElementById('voice-text').value = '';
  document.getElementById('voice-overlay').classList.remove('hidden');

  if (recognition) {
    try {
      recognition.start();
      document.getElementById('voice-waves').classList.add('active');
      voiceActive = true;
    } catch { /* already started */ }
  }
}

function closeVoiceOverlay() {
  if (recognition && voiceActive) {
    recognition.stop();
    voiceActive = false;
  }
  document.getElementById('voice-overlay').classList.add('hidden');
  document.getElementById('voice-waves').classList.remove('active');
  finalTranscript = '';
}

async function sendVoiceCommand() {
  const voiceText = finalTranscript.trim();
  const typedText = document.getElementById('voice-text').value.trim();
  const text = voiceText || typedText;
  if (!text) { toast('Скажите или введите команду'); return; }
  if (!getKey()) { toast('Сначала введите API ключ (кнопка ⚿)'); return; }

  closeVoiceOverlay();
  toast('⏳ Обрабатываю…');

  const projectList = projects.length
    ? projects.map(p => `  - name: "${p.name}", id: "${p.id}"`).join('\n')
    : '  (нет проектов)';

  const taskList = tasks.length
    ? tasks.slice(0, 60).map(t => {
        const proj = projects.find(p => p.id === t.projectId);
        return `  - id: "${t.id}", text: "${t.text}", project: "${proj?.name || 'нет'}", col: "${t.col}", done: ${t.done}${t.dueDate ? `, due: ${t.dueDate}` : ''}`;
      }).join('\n')
    : '  (нет задач)';

  const system = `Ты ассистент для управления задачами. Разбери команду пользователя и верни JSON с действиями.

Текущие проекты:
${projectList}

Текущие задачи:
${taskList}

Возможные типы действий:
- create_project: { "type": "create_project", "name": "string", "color": "hex-color" }
- create_task: { "type": "create_task", "projectId": "существующий id ИЛИ имя нового проекта ИЛИ null", "text": "string", "col": "crit|high|med|low", "urg": "now|week|late", "time": "15m|30m|1h|2h|4h|day", "description": "string", "dueDate": "YYYY-MM-DD или null" }
- update_task: { "type": "update_task", "taskId": "id", "updates": { поля } }
- complete_task: { "type": "complete_task", "taskId": "id" }
- move_task: { "type": "move_task", "taskId": "id", "col": "crit|high|med|low" }
- delete_task: { "type": "delete_task", "taskId": "id" }

Правила:
- col: crit=Критично, high=Важно, med=Обычное, low=Потом
- urg: now=Срочно, week=Неделя, late=Не срочно
- Если создаёшь задачу для нового проекта из той же команды, укажи имя проекта в projectId
- Верни ТОЛЬКО валидный JSON без markdown-блоков

Формат: { "actions": [...], "reply": "Краткое подтверждение на языке команды" }`;

  try {
    const raw = await claudeCall({ system, userMsg: text, maxTokens: 1024 });
    if (!raw) throw new Error('empty response');
    const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const result = JSON.parse(clean);

    if (result.actions?.length) await executeActions(result.actions);
    if (result.reply) toast('✨ ' + result.reply);
  } catch (err) {
    console.error(err);
    toast('Ошибка: не удалось обработать команду');
  }
}

async function executeActions(actions) {
  // Process create_project first so tasks can reference new projects by name
  const projectActions = actions.filter(a => a.type === 'create_project');
  const otherActions   = actions.filter(a => a.type !== 'create_project');

  for (const action of projectActions) {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 5);
    const project = {
      id,
      name: action.name,
      color: action.color || nextColor(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    await projectsCol.doc(id).set(project);
    // Optimistically update local state so tasks can find the new project by name
    projects.push({ ...project });
  }

  for (const action of otherActions) {
    await executeAction(action);
  }
}

async function executeAction(action) {
  switch (action.type) {
    case 'create_task': {
      let projectId = action.projectId || null;
      // Resolve projectId: might be a project name if it came from a create_project action
      if (projectId && !projects.find(p => p.id === projectId)) {
        const byName = projects.find(p => p.name.toLowerCase() === projectId.toLowerCase());
        projectId = byName?.id || null;
      }
      const id = Date.now().toString() + Math.random().toString(36).slice(2, 5);
      await tasksCol.doc(id).set({
        id,
        projectId,
        text: action.text || 'Задача',
        col: action.col || 'med',
        urg: action.urg || 'week',
        time: action.time || '1h',
        description: action.description || '',
        dueDate: action.dueDate || null,
        subtasks: [],
        done: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      break;
    }
    case 'update_task':
      if (action.taskId && action.updates) {
        await tasksCol.doc(action.taskId).update(action.updates);
      }
      break;
    case 'complete_task':
      if (action.taskId) await tasksCol.doc(action.taskId).update({ done: true });
      break;
    case 'move_task':
      if (action.taskId && action.col) await tasksCol.doc(action.taskId).update({ col: action.col });
      break;
    case 'delete_task':
      if (action.taskId) await tasksCol.doc(action.taskId).delete();
      break;
  }
}

document.getElementById('voice-btn').onclick  = openVoiceOverlay;
document.getElementById('voice-cancel').onclick = closeVoiceOverlay;
document.getElementById('voice-send').onclick   = sendVoiceCommand;

document.getElementById('voice-overlay').addEventListener('click', e => {
  if (e.target.id === 'voice-overlay') closeVoiceOverlay();
});

document.getElementById('voice-text').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendVoiceCommand();
});

// ── Render board ──────────────────────────────────────────────────────────────

function getFilteredTasks() {
  return activeProjectId === null ? tasks : tasks.filter(t => t.projectId === activeProjectId);
}

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  const filtered = getFilteredTasks();

  COLS.forEach(col => {
    const colTasks = filtered.filter(t => t.col === col.id);

    const el = document.createElement('div');
    el.className = 'col';
    el.dataset.col = col.id;

    el.innerHTML = `
      <div class="col-head">
        <span class="col-dot" style="background:${col.color}"></span>
        <span class="col-name">${col.label}</span>
        <span class="col-count">${colTasks.length || ''}</span>
        <button class="col-plus" data-col="${col.id}" title="Добавить задачу">+</button>
      </div>`;

    const form = document.createElement('div');
    form.className = 'add-form' + (openCol === col.id ? '' : ' hidden');
    form.innerHTML = `
      <input class="form-input" placeholder="Название задачи…" autocomplete="off">
      <div class="tag-row">
        <label>Срочность</label>
        ${URG.map(u => `<button class="pick ${selUrg === u.id ? 'sel' : ''}" data-urg="${u.id}">${u.label}</button>`).join('')}
      </div>
      <div class="tag-row">
        <label>Время</label>
        ${TIME.map(t => `<button class="pick ${selTime === t.id ? 'sel' : ''}" data-time="${t.id}">${t.label}</button>`).join('')}
      </div>
      <div class="tag-row">
        <label>Дедлайн</label>
        <input type="date" class="form-date">
      </div>
      <div class="add-actions">
        <button class="btn-add" data-col="${col.id}">Добавить</button>
        <button class="btn-cancel">Отмена</button>
      </div>`;
    el.appendChild(form);

    const taskList = document.createElement('div');
    taskList.className = 'tasks';

    if (colTasks.length === 0 && openCol !== col.id) {
      taskList.innerHTML = `<div class="col-empty">—</div>`;
    } else {
      colTasks.forEach(task => {
        const urgObj  = URG.find(u => u.id === task.urg);
        const timeObj = TIME.find(t => t.id === task.time);
        const proj    = projects.find(p => p.id === task.projectId);

        const row = document.createElement('div');
        row.className = 'task' + (task.done ? ' done' : '');
        row.dataset.id = task.id;
        row.innerHTML = `
          <input type="checkbox" ${task.done ? 'checked' : ''}>
          <div class="task-body">
            <span class="task-title">${escHtml(task.text)}</span>
            <div class="task-badges">
              ${urgObj  ? `<span class="badge urg-${task.urg}">${urgObj.label}</span>` : ''}
              ${timeObj ? `<span class="badge">${timeObj.label}</span>` : ''}
              ${task.dueDate ? `<span class="badge ${dueCls(task.dueDate)}">${fmtDate(task.dueDate)}</span>` : ''}
              ${proj && activeProjectId === null ? `<span class="badge project-tag" style="--pc:${proj.color}">${escHtml(proj.name)}</span>` : ''}
            </div>
          </div>
          <button class="task-del" data-id="${task.id}">×</button>`;
        initDrag(row, task.id);
        taskList.appendChild(row);
      });
    }

    el.appendChild(taskList);
    board.appendChild(el);
  });

  attachEvents();
}

// ── Events ────────────────────────────────────────────────────────────────────

function attachEvents() {
  document.querySelectorAll('.col-plus').forEach(btn => {
    btn.onclick = () => {
      openCol = openCol === btn.dataset.col ? null : btn.dataset.col;
      renderBoard();
      if (openCol) document.querySelector(`.col[data-col="${openCol}"] .form-input`)?.focus();
    };
  });

  document.querySelectorAll('.btn-cancel').forEach(btn => {
    btn.onclick = () => { openCol = null; renderBoard(); };
  });

  document.querySelectorAll('[data-urg]').forEach(btn => {
    btn.onclick = () => {
      selUrg = btn.dataset.urg;
      document.querySelectorAll('[data-urg]').forEach(b => b.classList.toggle('sel', b.dataset.urg === selUrg));
    };
  });

  document.querySelectorAll('[data-time]').forEach(btn => {
    btn.onclick = () => {
      selTime = btn.dataset.time;
      document.querySelectorAll('[data-time]').forEach(b => b.classList.toggle('sel', b.dataset.time === selTime));
    };
  });

  document.querySelectorAll('.btn-add').forEach(btn => {
    btn.onclick = async () => {
      const form  = btn.closest('.add-form');
      const input = form.querySelector('.form-input');
      const raw   = input.value.trim();
      if (!raw) { input.focus(); return; }

      btn.disabled = true;
      toast('✨ Улучшаю…');

      const text    = await aiImprove(raw);
      const dueDate = form.querySelector('.form-date').value || null;
      if (text !== raw) toast(`✨ «${text}»`);

      const id = Date.now().toString();
      await tasksCol.doc(id).set({
        id,
        projectId: activeProjectId || null,
        col: btn.dataset.col,
        text,
        urg: selUrg,
        time: selTime,
        dueDate,
        description: '',
        subtasks: [],
        done: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      openCol = null;
      renderBoard();
    };
  });

  document.querySelectorAll('.form-input').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        document.querySelector(`.btn-add[data-col="${inp.closest('.col').dataset.col}"]`)?.click();
      }
      if (e.key === 'Escape') { openCol = null; renderBoard(); }
    });
  });

  document.querySelectorAll('.task input[type="checkbox"]').forEach(cb => {
    cb.onchange = async () => {
      const id = cb.closest('.task').dataset.id;
      await tasksCol.doc(id).update({ done: cb.checked });
    };
  });

  document.querySelectorAll('.task-del').forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      await tasksCol.doc(btn.dataset.id).delete();
    };
  });

  document.querySelectorAll('.task-body').forEach(body => {
    body.onclick = () => {
      const id = body.closest('.task').dataset.id;
      openTaskId = id;
      renderModal(id);
    };
    body.addEventListener('touchend', e => {
      if (!dragState) {
        e.preventDefault();
        const id = body.closest('.task').dataset.id;
        openTaskId = id;
        renderModal(id);
      }
    });
  });
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function renderModal(taskId) {
  document.querySelector('.modal-overlay')?.remove();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const subtasks  = task.subtasks || [];
  const doneCount = subtasks.filter(s => s.done).length;
  const pct       = subtasks.length ? Math.round(doneCount / subtasks.length * 100) : 0;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <input class="modal-title" placeholder="Название">
        <button class="modal-close">×</button>
      </div>
      <div class="modal-tags">
        <div class="tag-row">
          <label>Срочность</label>
          ${URG.map(u => `<button class="pick ${task.urg === u.id ? 'sel' : ''}" data-murg="${u.id}">${u.label}</button>`).join('')}
        </div>
        <div class="tag-row">
          <label>Время</label>
          ${TIME.map(t => `<button class="pick ${task.time === t.id ? 'sel' : ''}" data-mtime="${t.id}">${t.label}</button>`).join('')}
        </div>
        <div class="tag-row">
          <label>Дедлайн</label>
          <input type="date" class="modal-due">
        </div>
        <div class="tag-row">
          <label>Проект</label>
          <select class="modal-project">
            <option value="">Без проекта</option>
            ${projects.map(p => `<option value="${p.id}"${task.projectId === p.id ? ' selected' : ''}>${escHtml(p.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-section">
        <label class="modal-label">Описание</label>
        <textarea class="modal-desc" placeholder="Добавьте описание…"></textarea>
      </div>
      <div class="modal-section">
        <label class="modal-label">
          Подзадачи
          ${subtasks.length ? `<span class="subtask-progress">${doneCount}/${subtasks.length}</span>` : ''}
        </label>
        ${subtasks.length ? `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>` : ''}
        <div class="subtask-list">
          ${subtasks.map(s => `
            <div class="subtask" data-sid="${s.id}">
              <input type="checkbox" ${s.done ? 'checked' : ''}>
              <span class="subtask-text">${escHtml(s.text)}</span>
              <button class="subtask-del">×</button>
            </div>`).join('')}
        </div>
        <div class="subtask-add-row">
          <input class="subtask-input" placeholder="Добавить подзадачу…" autocomplete="off">
          <button class="subtask-add-btn">+</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-save">Сохранить</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.querySelector('.modal-title').value = task.text;
  overlay.querySelector('.modal-desc').value  = task.description || '';
  overlay.querySelector('.modal-due').value   = task.dueDate || '';

  let localUrg     = task.urg;
  let localTime    = task.time;
  let localProject = task.projectId || '';

  overlay.querySelector('.modal-project').onchange = e => { localProject = e.target.value; };

  overlay.querySelectorAll('[data-murg]').forEach(btn => {
    btn.onclick = () => {
      localUrg = btn.dataset.murg;
      overlay.querySelectorAll('[data-murg]').forEach(b => b.classList.toggle('sel', b.dataset.murg === localUrg));
    };
  });

  overlay.querySelectorAll('[data-mtime]').forEach(btn => {
    btn.onclick = () => {
      localTime = btn.dataset.mtime;
      overlay.querySelectorAll('[data-mtime]').forEach(b => b.classList.toggle('sel', b.dataset.mtime === localTime));
    };
  });

  overlay.querySelectorAll('.subtask input[type="checkbox"]').forEach(cb => {
    cb.onchange = async () => {
      const sid = Number(cb.closest('.subtask').dataset.sid);
      const cur = tasks.find(t => t.id === taskId);
      if (!cur) return;
      await tasksCol.doc(taskId).update({
        subtasks: (cur.subtasks || []).map(s => s.id === sid ? { ...s, done: cb.checked } : s),
      });
    };
  });

  overlay.querySelectorAll('.subtask-del').forEach(btn => {
    btn.onclick = async () => {
      const sid = Number(btn.closest('.subtask').dataset.sid);
      const cur = tasks.find(t => t.id === taskId);
      if (!cur) return;
      await tasksCol.doc(taskId).update({
        subtasks: (cur.subtasks || []).filter(s => s.id !== sid),
      });
    };
  });

  const subtaskInput = overlay.querySelector('.subtask-input');
  const addSubtask = async () => {
    const text = subtaskInput.value.trim();
    if (!text) return;
    const cur = tasks.find(t => t.id === taskId);
    if (!cur) return;
    await tasksCol.doc(taskId).update({
      subtasks: [...(cur.subtasks || []), { id: Date.now(), text, done: false }],
    });
    subtaskInput.value = '';
    subtaskInput.focus();
  };
  overlay.querySelector('.subtask-add-btn').onclick = addSubtask;
  subtaskInput.addEventListener('keydown', e => { if (e.key === 'Enter') addSubtask(); });

  overlay.querySelector('.modal-save').onclick = async () => {
    const newText = overlay.querySelector('.modal-title').value.trim();
    const newDesc = overlay.querySelector('.modal-desc').value;
    const newDue  = overlay.querySelector('.modal-due').value || null;
    if (!newText) return;
    let text = newText;
    if (newText !== task.text) {
      toast('✨ Улучшаю…');
      text = await aiImprove(newText);
      if (text !== newText) toast(`✨ «${text}»`);
    }
    await tasksCol.doc(taskId).update({
      text,
      urg: localUrg,
      time: localTime,
      description: newDesc,
      dueDate: newDue,
      projectId: localProject || null,
    });
    closeModal();
  };

  const closeModal = () => {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', vpResize);
      window.visualViewport.removeEventListener('scroll', vpResize);
    }
    overlay.remove();
    openTaskId = null;
  };

  const vpResize = () => {
    if (!window.visualViewport) return;
    overlay.style.height = window.visualViewport.height + 'px';
    overlay.style.top    = window.visualViewport.offsetTop + 'px';
  };
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', vpResize);
    window.visualViewport.addEventListener('scroll', vpResize);
  }

  overlay.querySelector('.modal-close').onclick = closeModal;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  const onEsc = e => { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onEsc); } };
  document.addEventListener('keydown', onEsc);
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────

let dragState = null;

function startDrag(cx, cy, row, taskId) {
  const rect  = row.getBoundingClientRect();
  const ghost = row.cloneNode(true);
  ghost.style.cssText = `
    position:fixed; z-index:1000; pointer-events:none;
    width:${rect.width}px; left:${rect.left}px; top:${rect.top}px;
    opacity:.85; box-shadow:0 6px 24px rgba(0,0,0,.18);
    border-radius:8px; background:var(--col);`;
  document.body.appendChild(ghost);
  row.style.opacity = '.25';
  dragState = { taskId, ghost, row, ox: cx - rect.left, oy: cy - rect.top };
}

function moveDrag(cx, cy) {
  if (!dragState) return;
  dragState.ghost.style.left = (cx - dragState.ox) + 'px';
  dragState.ghost.style.top  = (cy - dragState.oy) + 'px';
  document.querySelectorAll('.col').forEach(c => c.classList.remove('drag-over'));
  dragState.ghost.style.display = 'none';
  const target = document.elementFromPoint(cx, cy)?.closest('.col');
  dragState.ghost.style.display = '';
  if (target) target.classList.add('drag-over');
}

async function endDrag(cx, cy) {
  if (!dragState) return;
  dragState.ghost.style.display = 'none';
  const target = document.elementFromPoint(cx, cy)?.closest('.col');
  dragState.ghost.style.display = '';
  const newCol = target?.dataset.col;
  dragState.ghost.remove();
  dragState.row.style.opacity = '';
  document.querySelectorAll('.col').forEach(c => c.classList.remove('drag-over'));
  const oldCol = tasks.find(t => t.id === dragState.taskId)?.col;
  if (newCol && newCol !== oldCol) await tasksCol.doc(dragState.taskId).update({ col: newCol });
  dragState = null;
}

function cancelDrag() {
  if (!dragState) return;
  dragState.ghost.remove();
  dragState.row.style.opacity = '';
  document.querySelectorAll('.col').forEach(c => c.classList.remove('drag-over'));
  dragState = null;
}

function initDrag(row, taskId) {
  row.addEventListener('mousedown', e => {
    if (e.target.closest('input') || e.target.closest('.task-del')) return;
    e.preventDefault();
    startDrag(e.clientX, e.clientY, row, taskId);
    const onMove = e => moveDrag(e.clientX, e.clientY);
    const onUp   = e => { endDrag(e.clientX, e.clientY); document.removeEventListener('mousemove', onMove); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
  });

  row.addEventListener('touchstart', e => {
    if (e.target.closest('input') || e.target.closest('.task-del')) return;
    const t0 = e.touches[0];
    const sx = t0.clientX, sy = t0.clientY;
    let dragging = false;

    const onMove = e => {
      const t = e.touches[0];
      if (!dragging && Math.hypot(t.clientX - sx, t.clientY - sy) > 8) {
        dragging = true;
        startDrag(sx, sy, row, taskId);
      }
      if (dragging) { e.preventDefault(); moveDrag(t.clientX, t.clientY); }
    };
    const onEnd = e => {
      row.removeEventListener('touchmove', onMove);
      if (dragging) endDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    };
    const onCancel = () => { row.removeEventListener('touchmove', onMove); if (dragging) cancelDrag(); };
    row.addEventListener('touchmove',   onMove,    { passive: false });
    row.addEventListener('touchend',    onEnd,     { once: true });
    row.addEventListener('touchcancel', onCancel,  { once: true });
  }, { passive: true });
}

// ── Init ──────────────────────────────────────────────────────────────────────

initVoice();

projectsCol.orderBy('createdAt').onSnapshot(snapshot => {
  projects = snapshot.docs.map(doc => doc.data());
  renderSidebar();
  renderBoard(); // re-render to update project badges
});

tasksCol.orderBy('createdAt').onSnapshot(snapshot => {
  tasks = snapshot.docs.map(doc => doc.data());
  renderSidebar();
  renderBoard();
  if (openTaskId) {
    const titleVal = document.querySelector('.modal-title')?.value;
    const descVal  = document.querySelector('.modal-desc')?.value;
    renderModal(openTaskId);
    if (titleVal !== undefined) document.querySelector('.modal-title').value = titleVal;
    if (descVal  !== undefined) document.querySelector('.modal-desc').value  = descVal;
  }
});
