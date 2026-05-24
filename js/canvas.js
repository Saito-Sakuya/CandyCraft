/**
 * canvas.js — Character Layout Board
 * Draggable character boxes with edit popup and binding relationships
 */

import { generateId, showToast } from './utils.js';

/* ============ State ============ */
let characters = [];
let bindings = [];
let boardEl = null;
let svgEl = null;
let selectedId = null;
let bindingMode = false;    // true when user is selecting a second char for binding
let bindingFromId = null;
let editPopupEl = null;
let bindingPickerEl = null;
let dragState = null;

const BINDING_TYPES = [
  { type: 'gaze', label: '对视' },
  { type: 'hand', label: '牵手' },
  { type: 'embrace', label: '拥抱' },
  { type: 'back', label: '背靠背' },
  { type: 'talk', label: '对话' },
  { type: 'confront', label: '对峙' },
  { type: 'protect', label: '守护' },
  { type: 'custom', label: '自定义...' },
];

const BIND_COLORS = ['#FF8FAB', '#C3A6FF', '#7DDFC3', '#FFB997', '#89CFF3'];

/* ============ Init ============ */

/**
 * Initialize the character layout canvas
 * @param {string} containerId — ID of the board container
 * @param {Array} chars — character data from AI analysis
 */
export function initCanvas(containerId, chars) {
  boardEl = document.getElementById(containerId);
  if (!boardEl) return;

  // Deep clone
  characters = (chars || []).map(c => ({ ...c }));
  bindings = [];
  selectedId = null;
  bindingMode = false;

  render();
  setupBoardEvents();
}

/**
 * Update board aspect ratio
 */
export function updateCanvasAspect(ratio) {
  if (!boardEl) return;
  boardEl.setAttribute('data-ratio', ratio);
}

/**
 * Get all canvas data for optimization
 */
export function getCanvasData() {
  return {
    characters: characters.map(c => ({ ...c })),
    bindings: bindings.map(b => ({ ...b })),
  };
}

/**
 * Add a new character to the board
 */
export function addCharacter(charData) {
  const newChar = {
    id: charData?.id || generateId(),
    name: charData?.name || '新角色',
    description: charData?.description || '',
    role: charData?.role || '配角',
    prompt: charData?.prompt || '',
    x: charData?.x ?? 50,
    y: charData?.y ?? 50,
    w: charData?.w ?? 18,
    h: charData?.h ?? 28,
    selected: false,
  };
  characters.push(newChar);
  render();
  return newChar;
}

/**
 * Destroy canvas
 */
export function destroyCanvas() {
  if (boardEl) boardEl.innerHTML = '';
  characters = [];
  bindings = [];
  selectedId = null;
  closeAllPopups();
}

/* ============ Render ============ */

function render() {
  if (!boardEl) return;
  closeAllPopups();

  // Clear
  boardEl.innerHTML = '';

  // Crosshairs
  boardEl.innerHTML += `
    <div class="canvas-crosshair-h"></div>
    <div class="canvas-crosshair-v"></div>
  `;

  // SVG overlay for binding lines
  svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.classList.add('binding-svg');
  boardEl.appendChild(svgEl);

  // Render characters
  characters.forEach(ch => renderCharBox(ch));

  // Render binding lines
  renderBindings();
}

function renderCharBox(ch) {
  const box = document.createElement('div');
  box.className = `char-box ${ch.id === selectedId ? 'selected' : ''} ${bindingMode && ch.id !== bindingFromId ? 'bind-target' : ''}`;
  box.dataset.id = ch.id;
  box.style.left = `${ch.x}%`;
  box.style.top = `${ch.y}%`;
  box.style.width = `${ch.w}%`;
  box.style.height = `${ch.h}%`;
  box.style.transform = 'translate(-50%, -50%)';

  const roleLabel = { '主角': 'MAIN', '配角': 'SUB', '背景': 'BG' }[ch.role] || ch.role;

  box.innerHTML = `
    <span class="char-box-role">${escapeHtml(roleLabel)}</span>
    <span class="char-box-name">${escapeHtml(ch.name)}</span>
    ${ch.description ? `<span class="char-box-desc">${escapeHtml(truncate(ch.description, 16))}</span>` : ''}
    <button class="char-box-edit" title="编辑">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>
  `;

  // Edit button click
  const editBtn = box.querySelector('.char-box-edit');
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openEditPopup(ch.id);
  });

  // Box click — select or binding target
  box.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.char-box-edit')) return;

    if (bindingMode && ch.id !== bindingFromId) {
      // Complete binding
      openBindingPicker(bindingFromId, ch.id, e);
      return;
    }

    // Select
    selectChar(ch.id);

    // Start drag
    startDrag(e, ch, box);
  });

  boardEl.appendChild(box);
}

/* ============ Drag ============ */

function startDrag(e, ch, box) {
  e.preventDefault();
  box.setPointerCapture(e.pointerId);
  box.classList.add('dragging');

  const boardRect = boardEl.getBoundingClientRect();
  const startX = e.clientX;
  const startY = e.clientY;
  const origPctX = ch.x;
  const origPctY = ch.y;

  dragState = { ch, box, boardRect, startX, startY, origPctX, origPctY };

  const onMove = (ev) => {
    if (!dragState) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    const newX = origPctX + (dx / boardRect.width) * 100;
    const newY = origPctY + (dy / boardRect.height) * 100;

    ch.x = clamp(newX, ch.w / 2, 100 - ch.w / 2);
    ch.y = clamp(newY, ch.h / 2, 100 - ch.h / 2);

    box.style.left = `${ch.x}%`;
    box.style.top = `${ch.y}%`;

    // Show coordinate tooltip
    showCoordTooltip(box, ch.x, ch.y);

    renderBindings();
  };

  const onUp = () => {
    box.classList.remove('dragging');
    hideCoordTooltip(box);
    box.removeEventListener('pointermove', onMove);
    box.removeEventListener('pointerup', onUp);
    dragState = null;
  };

  box.addEventListener('pointermove', onMove);
  box.addEventListener('pointerup', onUp);
}

/* ============ Selection ============ */

function selectChar(id) {
  selectedId = id;
  boardEl.querySelectorAll('.char-box').forEach(b => {
    b.classList.toggle('selected', b.dataset.id === id);
  });
}

/* ============ Edit Popup ============ */

function openEditPopup(charId) {
  closeAllPopups();
  const ch = characters.find(c => c.id === charId);
  if (!ch) return;

  selectChar(charId);

  const box = boardEl.querySelector(`.char-box[data-id="${charId}"]`);
  if (!box) return;

  editPopupEl = document.createElement('div');
  editPopupEl.className = 'char-edit-popup';

  // Position near the box
  const boxRect = box.getBoundingClientRect();
  const boardRect = boardEl.getBoundingClientRect();
  let popLeft = boxRect.right - boardRect.left + 8;
  let popTop = boxRect.top - boardRect.top;
  if (popLeft + 270 > boardRect.width) popLeft = boxRect.left - boardRect.left - 268;
  if (popTop + 260 > boardRect.height) popTop = boardRect.height - 270;
  popTop = Math.max(4, popTop);

  editPopupEl.style.left = popLeft + 'px';
  editPopupEl.style.top = popTop + 'px';

  editPopupEl.innerHTML = `
    <div class="form-group">
      <label>名称</label>
      <input type="text" id="edit-char-name" value="${escapeAttr(ch.name)}">
    </div>
    <div class="form-group">
      <label>描述 / 提示词</label>
      <textarea id="edit-char-desc">${escapeHtml(ch.prompt || ch.description)}</textarea>
    </div>
    <div class="form-group">
      <label>角色</label>
      <select id="edit-char-role" style="padding:6px 10px;border:1.5px solid var(--color-border);border-radius:var(--radius-sm);font-size:0.82rem;background:var(--color-bg-input)">
        <option value="主角" ${ch.role === '主角' ? 'selected' : ''}>主角</option>
        <option value="配角" ${ch.role === '配角' ? 'selected' : ''}>配角</option>
        <option value="背景" ${ch.role === '背景' ? 'selected' : ''}>背景</option>
      </select>
    </div>
    <div class="char-edit-actions">
      <button class="btn-text" id="edit-char-delete" style="color:var(--color-error)">删除</button>
      <div style="display:flex;gap:var(--space-xs)">
        ${characters.length > 1 ? `<button class="btn-secondary btn-sm" id="edit-char-bind">绑定关系</button>` : ''}
        <button class="btn-primary btn-sm" id="edit-char-save">保存</button>
      </div>
    </div>
  `;

  boardEl.appendChild(editPopupEl);

  // Stop clicks inside popup from propagating
  editPopupEl.addEventListener('pointerdown', e => e.stopPropagation());

  // Save
  editPopupEl.querySelector('#edit-char-save').addEventListener('click', () => {
    ch.name = editPopupEl.querySelector('#edit-char-name').value.trim() || ch.name;
    ch.prompt = editPopupEl.querySelector('#edit-char-desc').value.trim();
    ch.description = ch.prompt;
    ch.role = editPopupEl.querySelector('#edit-char-role').value;
    render();
  });

  // Delete
  editPopupEl.querySelector('#edit-char-delete').addEventListener('click', () => {
    characters = characters.filter(c => c.id !== charId);
    bindings = bindings.filter(b => b.fromId !== charId && b.toId !== charId);
    selectedId = null;
    render();
  });

  // Bind
  const bindBtn = editPopupEl.querySelector('#edit-char-bind');
  if (bindBtn) {
    bindBtn.addEventListener('click', () => {
      closeAllPopups();
      startBindingMode(charId);
    });
  }

  // Close on outside click
  setTimeout(() => {
    const closeHandler = (e) => {
      if (editPopupEl && !editPopupEl.contains(e.target)) {
        closeAllPopups();
        document.removeEventListener('pointerdown', closeHandler);
      }
    };
    document.addEventListener('pointerdown', closeHandler);
  }, 50);
}

/* ============ Binding Mode ============ */

function startBindingMode(fromId) {
  bindingMode = true;
  bindingFromId = fromId;
  showToast('点击另一个角色建立关系', 'info');

  // Visual feedback
  boardEl.querySelectorAll('.char-box').forEach(b => {
    if (b.dataset.id !== fromId) {
      b.classList.add('bind-target');
    }
  });
}

function exitBindingMode() {
  bindingMode = false;
  bindingFromId = null;
  boardEl?.querySelectorAll('.char-box').forEach(b => {
    b.classList.remove('bind-target');
  });
}

function openBindingPicker(fromId, toId, event) {
  closeAllPopups();
  exitBindingMode();

  const fromChar = characters.find(c => c.id === fromId);
  const toChar = characters.find(c => c.id === toId);
  if (!fromChar || !toChar) return;

  // Check for existing binding
  const existing = bindings.find(b =>
    (b.fromId === fromId && b.toId === toId) || (b.fromId === toId && b.toId === fromId)
  );

  bindingPickerEl = document.createElement('div');
  bindingPickerEl.className = 'binding-picker';

  const boardRect = boardEl.getBoundingClientRect();
  bindingPickerEl.style.left = (event.clientX - boardRect.left + 8) + 'px';
  bindingPickerEl.style.top = (event.clientY - boardRect.top) + 'px';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:0.75rem;color:var(--color-text-tertiary);padding:4px 12px 8px;border-bottom:1px solid var(--color-border-light);margin-bottom:4px';
  title.textContent = `${fromChar.name} ↔ ${toChar.name}`;
  bindingPickerEl.appendChild(title);

  BINDING_TYPES.forEach(bt => {
    const opt = document.createElement('div');
    opt.className = 'binding-option';
    opt.textContent = bt.label;
    opt.addEventListener('click', () => {
      if (bt.type === 'custom') {
        const customLabel = prompt('输入自定义关系：');
        if (customLabel) {
          addBinding(fromId, toId, 'custom', customLabel);
        }
      } else {
        addBinding(fromId, toId, bt.type, bt.label);
      }
      closeAllPopups();
    });
    bindingPickerEl.appendChild(opt);
  });

  if (existing) {
    const divider = document.createElement('div');
    divider.style.cssText = 'height:1px;background:var(--color-border-light);margin:4px 0';
    bindingPickerEl.appendChild(divider);

    const removeOpt = document.createElement('div');
    removeOpt.className = 'binding-option';
    removeOpt.style.color = 'var(--color-error)';
    removeOpt.textContent = '移除关系';
    removeOpt.addEventListener('click', () => {
      removeBinding(existing.id);
      closeAllPopups();
    });
    bindingPickerEl.appendChild(removeOpt);
  }

  boardEl.appendChild(bindingPickerEl);

  setTimeout(() => {
    const closeHandler = (e) => {
      if (bindingPickerEl && !bindingPickerEl.contains(e.target)) {
        closeAllPopups();
        document.removeEventListener('pointerdown', closeHandler);
      }
    };
    document.addEventListener('pointerdown', closeHandler);
  }, 50);
}

function addBinding(fromId, toId, type, label) {
  // Remove existing binding between these two
  bindings = bindings.filter(b =>
    !((b.fromId === fromId && b.toId === toId) || (b.fromId === toId && b.toId === fromId))
  );

  bindings.push({
    id: generateId(),
    fromId,
    toId,
    type,
    label,
  });

  render();
}

function removeBinding(bindId) {
  bindings = bindings.filter(b => b.id !== bindId);
  render();
}

/* ============ Binding Lines (SVG) ============ */

function renderBindings() {
  if (!svgEl) return;
  svgEl.innerHTML = '';

  bindings.forEach((bind, i) => {
    const fromChar = characters.find(c => c.id === bind.fromId);
    const toChar = characters.find(c => c.id === bind.toId);
    if (!fromChar || !toChar) return;

    const color = BIND_COLORS[i % BIND_COLORS.length];

    // Calculate center points (percentage → SVG coordinates)
    const x1 = fromChar.x;
    const y1 = fromChar.y;
    const x2 = toChar.x;
    const y2 = toChar.y;

    // Bezier control point for a slight curve
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const offset = Math.min(len * 0.2, 8);
    const cx = mx + (dy / len) * offset;
    const cy = my - (dx / len) * offset;

    // Line
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
    path.setAttribute('stroke', color);
    path.setAttribute('class', 'binding-line');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    path.style.pointerEvents = 'stroke';
    svgEl.setAttribute('viewBox', '0 0 100 100');
    svgEl.setAttribute('preserveAspectRatio', 'none');

    path.addEventListener('click', (e) => {
      e.stopPropagation();
      openBindingPicker(bind.fromId, bind.toId, e);
    });

    svgEl.appendChild(path);

    // Label background + text
    const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const labelStr = bind.label || bind.type;

    labelText.setAttribute('x', cx);
    labelText.setAttribute('y', cy);
    labelText.setAttribute('class', 'binding-label-text');
    labelText.textContent = labelStr;

    // Approximate label width (very rough)
    const lblW = labelStr.length * 2.5 + 4;
    const lblH = 4;
    labelBg.setAttribute('x', cx - lblW / 2);
    labelBg.setAttribute('y', cy - lblH / 2);
    labelBg.setAttribute('width', lblW);
    labelBg.setAttribute('height', lblH);
    labelBg.setAttribute('class', 'binding-label-bg');

    svgEl.appendChild(labelBg);
    svgEl.appendChild(labelText);
  });
}

/* ============ Popups ============ */

function closeAllPopups() {
  if (editPopupEl && editPopupEl.parentNode) {
    editPopupEl.parentNode.removeChild(editPopupEl);
  }
  editPopupEl = null;

  if (bindingPickerEl && bindingPickerEl.parentNode) {
    bindingPickerEl.parentNode.removeChild(bindingPickerEl);
  }
  bindingPickerEl = null;

  exitBindingMode();
}

/* ============ Helpers ============ */

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function truncate(str, len) {
  return str.length > len ? str.substring(0, len) + '...' : str;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/* ============ Board Events (click-to-deselect + keyboard) ============ */

function setupBoardEvents() {
  if (!boardEl) return;

  // Click on empty board area → deselect
  boardEl.addEventListener('pointerdown', (e) => {
    if (e.target === boardEl || e.target.classList.contains('canvas-crosshair-h') || e.target.classList.contains('canvas-crosshair-v')) {
      selectedId = null;
      boardEl.querySelectorAll('.char-box').forEach(b => b.classList.remove('selected'));
      closeAllPopups();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
}

function handleKeyboard(e) {
  if (!boardEl) return;

  // Escape → exit binding mode
  if (e.key === 'Escape') {
    if (bindingMode) {
      exitBindingMode();
      e.preventDefault();
    }
    closeAllPopups();
    return;
  }

  // Delete/Backspace → remove selected character (only when not in a text input)
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;

    characters = characters.filter(c => c.id !== selectedId);
    bindings = bindings.filter(b => b.fromId !== selectedId && b.toId !== selectedId);
    selectedId = null;
    render();
    e.preventDefault();
  }
}

/* ============ Coordinate Tooltip ============ */

function showCoordTooltip(box, x, y) {
  let tooltip = box.querySelector('.char-box-coords');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'char-box-coords';
    box.appendChild(tooltip);
  }
  tooltip.textContent = `${Math.round(x)}, ${Math.round(y)}`;
}

function hideCoordTooltip(box) {
  const tooltip = box.querySelector('.char-box-coords');
  if (tooltip) tooltip.remove();
}
