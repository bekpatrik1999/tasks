// ── Config ────────────────────────────────────────────────────────────────────

const COLS = [
  { id: 'crit', label: 'Критично',  color: 'var(--c-crit)' },
  { id: 'high', label: 'Важно',     color: 'var(--c-high)' },
  { id: 'med',  label: 'Обычное',   color: 'var(--c-med)'  },
  { id: 'low',  label: 'Потом',     color: 'var(--c-low)'  },
];

const URG = [
  { id: 'now',  label: 'Срочно'   },
  { id: 'week', label: 'Неделя'   },
  { id: 'late', label: 'Не срочно'},
];

const TIME = [
  { id: '15m',  label: '15м'  },
  { id: '30m',  label: '30м'  },
  { id: '1h',   label: '1ч'   },
  { id: '2h',   label: '2ч'   },
  { id: '4h',   label: '4ч'   },
  { id: 'day',  label: 'День' },
];

const TK  = 'theme-v1';
const AK  = 'api-key-v1';

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
const db = firebase.firestore();
const tasksCol = db.collection('tasks');

// ── State ─────────────────────────────────────────────────────────────────────

let tasks = [];
let openCol = null;
let selUrg  = 'now';
let selTime = '1h';

const getKey = () => localStorage.getItem(AK) || '';

// ── Theme ─────────────────────────────────────────────────────────────────────

const applyTheme = t => {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(TK, t);
};

document.getElementById('theme-btn').onclick = () => {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
};

applyTheme(localStorage.getItem(TK) || 'light');

// ── API key ───────────────────────────────────────────────────────────────────

const keyBtn  = document.getElementById('key-btn');
const keyBar  = document.getElementById('key-bar');
const keyInp  = document.getElementById('key-input');

keyBtn.onclick = () => {
  keyBar.classList.toggle('hidden');
  if (!keyBar.classList.contains('hidden')) { keyInp.value = getKey(); keyInp.focus(); }
};

document.getElementById('key-save').onclick = () => {
  const v = keyInp.value.trim();
  if (v) { localStorage.setItem(AK, v); keyBar.classList.add('hidden'); toast('✨ API ключ сохранён'); }
};

keyInp.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('key-save').click(); });

// ── AI improvement ────────────────────────────────────────────────────────────

async function aiImprove(text) {
  const key = getKey();
  if (!key) return text;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 64,
        messages: [{ role: 'user', content:
          `Исправь орфографию и сделай название задачи грамотным. Только результат, без кавычек и пояснений.\n\n${text}` }],
      }),
    });
    if (!r.ok) return text;
    const d = await r.json();
    return d.content?.[0]?.text?.trim() || text;
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
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Render ────────────────────────────────────────────────────────────────────

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  COLS.forEach(col => {
    const colTasks = tasks.filter(t => t.col === col.id);

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
      if (openCol) {
        const form = document.querySelector(`.col[data-col="${openCol}"] .form-input`);
        if (form) form.focus();
      }
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
      if (getKey()) toast('✨ Улучшаю…');

      const text = await aiImprove(raw);
      if (text !== raw) toast(`✨ «${text}»`);

      const task = {
        id: Date.now().toString(),
        col: btn.dataset.col,
        text,
        urg: selUrg,
        time: selTime,
        done: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      await tasksCol.doc(task.id).set(task);
      openCol = null;
      renderBoard();
    };
  });

  document.querySelectorAll('.form-input').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const col = inp.closest('.col').dataset.col;
        document.querySelector(`.btn-add[data-col="${col}"]`)?.click();
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
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────

let dragState = null;

function startDrag(cx, cy, row, taskId) {
  const rect = row.getBoundingClientRect();
  const ghost = row.cloneNode(true);
  ghost.style.cssText = `
    position:fixed; z-index:1000; pointer-events:none;
    width:${rect.width}px; left:${rect.left}px; top:${rect.top}px;
    opacity:.85; box-shadow:0 6px 24px rgba(0,0,0,.18);
    border-radius:8px; background:var(--col);
  `;
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
  // Mouse
  row.addEventListener('mousedown', e => {
    if (e.target.closest('input') || e.target.closest('.task-del')) return;
    e.preventDefault();
    startDrag(e.clientX, e.clientY, row, taskId);
    const onMove = e => moveDrag(e.clientX, e.clientY);
    const onUp   = e => { endDrag(e.clientX, e.clientY); document.removeEventListener('mousemove', onMove); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
  });

  // Touch (iPad / iPhone)
  row.addEventListener('touchstart', e => {
    if (e.target.closest('input') || e.target.closest('.task-del')) return;
    e.preventDefault();
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY, row, taskId);
    const onMove = e => { e.preventDefault(); const t = e.touches[0]; moveDrag(t.clientX, t.clientY); };
    const onEnd  = e => { const t = e.changedTouches[0]; endDrag(t.clientX, t.clientY); row.removeEventListener('touchmove', onMove); };
    row.addEventListener('touchmove', onMove, { passive: false });
    row.addEventListener('touchend',  onEnd,  { once: true });
    row.addEventListener('touchcancel', cancelDrag, { once: true });
  }, { passive: false });
}

// ── Init ──────────────────────────────────────────────────────────────────────

tasksCol.orderBy('createdAt').onSnapshot(snapshot => {
  tasks = snapshot.docs.map(doc => doc.data());
  renderBoard();
});
