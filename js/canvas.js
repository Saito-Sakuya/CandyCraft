/**
 * canvas.js — Element Layout Board with Layer System (v3)
 * Foreground/background layers, draggable elements, layer panel,
 * focus points, depth links
 */

import { generateId, showToast } from './utils.js';

/* ============ State ============ */
let elements = [];
let links = [];
let boardEl = null;
let layerPanelEl = null;
let svgEl = null;
let selectedId = null;
let linkMode = false;
let linkFromId = null;
let editPopupEl = null;
let dragState = null;
let outsideHandler = null;  // click-outside listener ref
let layerFilter = 'all';   // 'all' | 'foreground' | 'background'
let focusMode = {
  active: false,
  targetId: null,
  snapshot: null,
};

const DRAG_START_THRESHOLD_PX = 4;
const MIN_ELEM_W = 8;
const MIN_ELEM_H = 8;
const MAX_ELEM_W = 90;
const MAX_ELEM_H = 90;

const LINK_TYPES = [
  { type: 'same-plane', label: '同一平面' },
  { type: 'gaze',       label: '对视' },
  { type: 'hand',       label: '牵手' },
  { type: 'embrace',    label: '拥抱' },
  { type: 'back',       label: '背靠背' },
  { type: 'talk',       label: '对话' },
  { type: 'confront',   label: '对峙' },
  { type: 'protect',    label: '守护' },
  { type: 'custom',     label: '自定义...' },
];

const LINK_COLORS = ['#FF8FAB', '#C3A6FF', '#7DDFC3', '#FFB997', '#89CFF3'];

/* ============ Public API ============ */

/**
 * Initialize the element layout canvas
 * @param {string} boardId — ID of the board container
 * @param {string} layerPanelId — ID of the layer panel container
 * @param {Array} data — element data from AI analysis (characters + objects)
 */
export function initCanvas(boardId, layerPanelId, data) {
  boardEl = document.getElementById(boardId);
  layerPanelEl = document.getElementById(layerPanelId);
  if (!boardEl) return;

  elements = (data || []).map((e, i) => ({
    id: e.id || generateId(),
    type: e.type || 'character',
    layer: e.layer || 'foreground',
    name: e.name || '未命名',
    description: e.description || '',
    prompt: e.prompt || '',
    role: e.role || '',
    x: e.x ?? e.position?.x ?? (30 + Math.random() * 40),
    y: e.y ?? e.position?.y ?? (30 + Math.random() * 40),
    w: e.w ?? e.size?.w ?? (e.type === 'object' ? 22 : 18),
    h: e.h ?? e.size?.h ?? (e.type === 'object' ? 18 : 28),
    zIndex: e.zIndex ?? i,
    focusPoint: e.focusPoint || null,
  }));
  links = [];
  selectedId = null;
  linkMode = false;
  focusMode = {
    active: false,
    targetId: null,
    snapshot: null,
  };

  render();
  setupBoardEvents();
}

/**
 * Update board aspect ratio — supports any W:H ratio string
 */
export function updateCanvasAspect(ratio) {
  if (!boardEl) return;
  boardEl.setAttribute('data-ratio', ratio);
  // Parse ratio and set CSS aspect-ratio dynamically
  const parts = ratio.split(':').map(Number);
  if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
    boardEl.style.aspectRatio = `${parts[0]} / ${parts[1]}`;
    // Limit height for very tall portraits
    if (parts[1] > parts[0]) {
      boardEl.style.maxHeight = '600px';
    } else {
      boardEl.style.maxHeight = '';
    }
  }
}

/**
 * Get all canvas data for optimization
 */
export function getCanvasData() {
  return {
    elements: elements.map(e => ({ ...e })),
    links: links.map(l => ({ ...l })),
  };
}

/**
 * Add a new element
 */
export function addElement(type = 'character', layer = 'foreground') {
  const isChar = type === 'character';
  const newElem = {
    id: generateId(),
    type,
    layer,
    name: isChar ? '新角色' : '新景物',
    description: '',
    prompt: '',
    role: isChar ? '配角' : '',
    x: 25 + Math.random() * 50,
    y: 25 + Math.random() * 50,
    w: isChar ? 18 : 22,
    h: isChar ? 28 : 18,
    zIndex: elements.length,
    focusPoint: null,
  };
  elements.push(newElem);
  render();
  selectElement(newElem.id);
  return newElem;
}

/** Backward compat alias */
export function addCharacter(charData) {
  return addElement('character', 'foreground');
}

/**
 * Destroy canvas
 */
export function destroyCanvas() {
  if (boardEl) boardEl.innerHTML = '';
  if (layerPanelEl) layerPanelEl.innerHTML = '';
  elements = [];
  links = [];
  selectedId = null;
  focusMode = {
    active: false,
    targetId: null,
    snapshot: null,
  };
  closeAllPopups();
}

/* ============ Render ============ */

function render() {
  if (!boardEl) return;
  closeAllPopups();
  boardEl.innerHTML = '';

  // Crosshairs
  boardEl.insertAdjacentHTML('beforeend', `
    <div class="canvas-crosshair-h"></div>
    <div class="canvas-crosshair-v"></div>
  `);

  // SVG overlay for link lines
  svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.classList.add('binding-svg');
  boardEl.appendChild(svgEl);

  // Sort by zIndex and render
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
  sorted.forEach(elem => {
    const box = renderElementBox(elem);
    // Apply layer filter visibility
    if (layerFilter !== 'all' && elem.layer !== layerFilter) {
      box.classList.add('layer-hidden');
    }
  });

  // Link lines
  renderLinkLines();

  // Layer panel
  renderLayerPanel();
}

function renderElementBox(elem) {
  const box = document.createElement('div');
  const isSelected = elem.id === selectedId;
  const isFg = elem.layer === 'foreground';
  const isChar = elem.type === 'character';
  const isFocusTarget = focusMode.active && elem.id === focusMode.targetId;
  const isFocusMuted = focusMode.active && elem.id !== focusMode.targetId;

  box.className = [
    'elem-box',
    isFg ? 'elem-fg' : 'elem-bg',
    isChar ? 'elem-char' : 'elem-obj',
    isSelected ? 'selected' : '',
    isFocusTarget ? 'focus-target' : '',
    isFocusMuted ? 'focus-muted' : '',
    linkMode && elem.id !== linkFromId ? 'link-target' : '',
  ].filter(Boolean).join(' ');

  box.dataset.id = elem.id;
  box.style.left = `${elem.x}%`;
  box.style.top = `${elem.y}%`;
  box.style.width = `${elem.w}%`;
  box.style.height = `${elem.h}%`;
  box.style.zIndex = elem.zIndex + 10;
  box.style.transform = 'translate(-50%, -50%)';

  const layerTag = isFg ? '前' : '后';

  box.innerHTML = `
    <span class="elem-box-layer">${layerTag}</span>
    <span class="elem-box-name">${esc(elem.name)}</span>
    ${elem.description ? `<span class="elem-box-desc">${esc(trunc(elem.description, 14))}</span>` : ''}
    ${elem.focusPoint ? `<span class="elem-box-focus">焦: ${esc(trunc(elem.focusPoint, 8))}</span>` : ''}
    <button class="elem-box-edit" title="编辑">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>
    <span class="elem-resize-handle" title="拖拽调整大小"></span>
  `;

  // Edit button
  box.querySelector('.elem-box-edit').addEventListener('click', (e) => {
    e.stopPropagation();
    if (focusMode.active && focusMode.targetId !== elem.id) return;
    openEditPopup(elem.id);
  });

  box.querySelector('.elem-resize-handle').addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (focusMode.active && focusMode.targetId !== elem.id) return;
    selectElement(elem.id);
    startResize(e, elem, box);
  });

  // Click to select + drag
  box.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.elem-box-edit') || e.target.closest('.elem-resize-handle')) return;

    if (linkMode && elem.id !== linkFromId) {
      completeLinkPick(elem.id);
      return;
    }

    if (focusMode.active && focusMode.targetId !== elem.id) {
      return;
    }

    e.stopPropagation();

    if ((e.ctrlKey || e.metaKey) && !linkMode) {
      selectThroughOverlap(e.clientX, e.clientY);
      return;
    }

    selectElement(elem.id);
    startDrag(e, elem, box);
  });

  boardEl.appendChild(box);
  return box;
}

/* ============ Layer Panel ============ */

function renderLayerPanel() {
  if (!layerPanelEl) return;
  layerPanelEl.innerHTML = '';

  // Layer filter buttons
  const filterRow = ce('div', 'layer-filter-row');
  ['all', 'foreground', 'background'].forEach(f => {
    const btn = ce('button', `layer-filter-btn ${layerFilter === f ? 'active' : ''}`);
    btn.textContent = f === 'all' ? '全部' : f === 'foreground' ? '前景' : '后景';
    btn.addEventListener('click', () => {
      layerFilter = f;
      render();
    });
    filterRow.appendChild(btn);
  });
  layerPanelEl.appendChild(filterRow);

  // Header with add buttons
  const header = ce('div', 'layer-header');
  header.innerHTML = `
    <button class="layer-add-btn layer-add-fg" title="添加前景元素">+ 前景</button>
    <button class="layer-add-btn layer-add-bg" title="添加后景元素">+ 后景</button>
  `;
  header.querySelector('.layer-add-fg').addEventListener('click', () => addElement('character', 'foreground'));
  header.querySelector('.layer-add-bg').addEventListener('click', () => addElement('object', 'background'));
  layerPanelEl.appendChild(header);

  // Tag list (reverse order: top = highest z-index = rendered on top)
  const list = ce('div', 'layer-list');
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  sorted.forEach(elem => {
    const isFocusTarget = focusMode.active && elem.id === focusMode.targetId;
    const isFocusMuted = focusMode.active && elem.id !== focusMode.targetId;
    const tag = ce('div', `layer-tag ${elem.id === selectedId ? 'layer-tag-active' : ''} ${isFocusTarget ? 'layer-tag-focus-target' : ''} ${isFocusMuted ? 'layer-tag-focus-muted' : ''}`);
    tag.dataset.id = elem.id;
    tag.draggable = !focusMode.active;

    const isFg = elem.layer === 'foreground';
    const isChar = elem.type === 'character';
    const icon = isChar ? '\u2630' : '\u25A3'; // ☰ ▣
    const layerBadge = isFg ? '前' : '后';

    tag.innerHTML = `
      <span class="layer-tag-handle" title="拖拽排序">\u2261</span>
      <span class="layer-tag-icon ${isFg ? 'layer-tag-fg' : 'layer-tag-bg'}">${layerBadge}</span>
      <span class="layer-tag-name">${esc(trunc(elem.name, 8))}</span>
      <button class="layer-tag-edit" title="编辑">\u270E</button>
      <button class="layer-tag-up" title="上移">\u25B2</button>
      <button class="layer-tag-down" title="下移">\u25BC</button>
      <button class="layer-tag-del" title="删除">\u00D7</button>
    `;

    // Click to select
    tag.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        enterFocusMode(elem.id);
        return;
      }
      if (focusMode.active && elem.id !== focusMode.targetId) return;
      selectElement(elem.id);
      scrollToElement(elem.id);
    });
    tag.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      if (focusMode.active && elem.id !== focusMode.targetId) return;
      e.preventDefault();
      e.stopPropagation();
      openEditPopup(elem.id);
    });

    tag.querySelector('.layer-tag-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      if (focusMode.active && elem.id !== focusMode.targetId) return;
      selectElement(elem.id);
      openEditPopup(elem.id);
    });

    // Move up (increase z-index)
    tag.querySelector('.layer-tag-up').addEventListener('click', (e) => {
      e.stopPropagation();
      if (focusMode.active) return;
      moveLayer(elem.id, 1);
    });

    // Move down (decrease z-index)
    tag.querySelector('.layer-tag-down').addEventListener('click', (e) => {
      e.stopPropagation();
      if (focusMode.active) return;
      moveLayer(elem.id, -1);
    });

    // Delete
    tag.querySelector('.layer-tag-del').addEventListener('click', (e) => {
      e.stopPropagation();
      if (focusMode.active) return;
      deleteElement(elem.id);
    });

    // Drag-to-reorder
    tag.addEventListener('dragstart', (e) => {
      if (focusMode.active) return;
      e.dataTransfer.setData('text/plain', elem.id);
      tag.classList.add('layer-tag-dragging');
    });
    tag.addEventListener('dragend', () => {
      tag.classList.remove('layer-tag-dragging');
    });
    tag.addEventListener('dragover', (e) => {
      if (focusMode.active) return;
      e.preventDefault();
      tag.classList.add('layer-tag-dragover');
    });
    tag.addEventListener('dragleave', () => {
      tag.classList.remove('layer-tag-dragover');
    });
    tag.addEventListener('drop', (e) => {
      if (focusMode.active) return;
      e.preventDefault();
      tag.classList.remove('layer-tag-dragover');
      const draggedId = e.dataTransfer.getData('text/plain');
      if (draggedId && draggedId !== elem.id) {
        reorderLayer(draggedId, elem.id);
      }
    });

    list.appendChild(tag);
  });

  layerPanelEl.appendChild(list);

  if (focusMode.active) {
    layerPanelEl.appendChild(renderFocusModeBar());
  }

  // Footer: link button
  const footer = ce('div', 'layer-footer');
  footer.innerHTML = `
    <button class="layer-link-btn ${linkMode ? 'active' : ''}" title="选两个元素建立链接" ${focusMode.active ? 'disabled' : ''}>
      ${linkMode ? '取消链接' : '建立链接'}
    </button>
  `;
  footer.querySelector('.layer-link-btn').addEventListener('click', () => {
    if (focusMode.active) return;
    if (linkMode) {
      linkMode = false;
      linkFromId = null;
      render();
    } else {
      if (elements.length < 2) {
        showToast('至少需要两个元素才能建立链接', 'error');
        return;
      }
      linkMode = true;
      linkFromId = selectedId || elements[0]?.id;
      showToast('点击画板上另一个元素完成链接', 'info');
      render();
    }
  });
  layerPanelEl.appendChild(footer);

  // Existing links display
  if (links.length > 0) {
    const linksSection = ce('div', 'layer-links');
    const title = ce('div', 'layer-links-title');
    title.textContent = '已有链接';
    linksSection.appendChild(title);

    links.forEach((link, idx) => {
      const fromEl = elements.find(e => e.id === link.fromId);
      const toEl = elements.find(e => e.id === link.toId);
      if (!fromEl || !toEl) return;

      const item = ce('div', 'layer-link-item');
      const descHtml = link.description ? `<div class="layer-link-desc">${esc(trunc(link.description, 20))}</div>` : '';
      item.innerHTML = `
        <span>${esc(trunc(fromEl.name, 5))} — ${esc(link.label || link.type)} — ${esc(trunc(toEl.name, 5))}</span>
        ${descHtml}
        <button class="layer-link-del" title="删除链接">\u00D7</button>
      `;
      item.querySelector('.layer-link-del').addEventListener('click', () => {
        links.splice(idx, 1);
        render();
      });
      linksSection.appendChild(item);
    });
    layerPanelEl.appendChild(linksSection);
  }
}

function renderFocusModeBar() {
  const bar = ce('div', 'layer-focus-actions');
  const target = elements.find((e) => e.id === focusMode.targetId);
  const targetName = target?.name || '未命名元素';
  bar.innerHTML = `
    <span class="layer-focus-label">聚焦中：${esc(trunc(targetName, 10))}</span>
    <button class="layer-focus-cancel">取消选择</button>
    <button class="layer-focus-apply">完成</button>
  `;

  bar.querySelector('.layer-focus-cancel')?.addEventListener('click', () => {
    exitFocusMode(false);
  });
  bar.querySelector('.layer-focus-apply')?.addEventListener('click', () => {
    exitFocusMode(true);
  });

  return bar;
}

/* ============ Layer Operations ============ */

function moveLayer(id, direction) {
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
  const idx = sorted.findIndex(e => e.id === id);
  if (idx < 0) return;

  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= sorted.length) return;

  // Swap z-indices
  const tmp = sorted[idx].zIndex;
  sorted[idx].zIndex = sorted[newIdx].zIndex;
  sorted[newIdx].zIndex = tmp;
  render();
}

function reorderLayer(draggedId, targetId) {
  const dragged = elements.find(e => e.id === draggedId);
  const target = elements.find(e => e.id === targetId);
  if (!dragged || !target) return;

  // Swap their z-indices
  const tmp = dragged.zIndex;
  dragged.zIndex = target.zIndex;
  target.zIndex = tmp;
  render();
}

function deleteElement(id) {
  elements = elements.filter(e => e.id !== id);
  links = links.filter(l => l.fromId !== id && l.toId !== id);
  if (selectedId === id) selectedId = null;
  if (focusMode.active && focusMode.targetId === id) {
    focusMode = {
      active: false,
      targetId: null,
      snapshot: null,
    };
  }
  // Reindex
  elements.sort((a, b) => a.zIndex - b.zIndex).forEach((e, i) => e.zIndex = i);
  render();
}

function selectElement(id) {
  selectedId = id;
  // Update board selection
  boardEl?.querySelectorAll('.elem-box').forEach(box => {
    box.classList.toggle('selected', box.dataset.id === id);
  });
  // Update layer panel selection
  layerPanelEl?.querySelectorAll('.layer-tag').forEach(tag => {
    tag.classList.toggle('layer-tag-active', tag.dataset.id === id);
  });
}

function enterFocusMode(id) {
  const target = elements.find((e) => e.id === id);
  if (!target) return;

  focusMode = {
    active: true,
    targetId: id,
    snapshot: {
      x: target.x,
      y: target.y,
      w: target.w,
      h: target.h,
    },
  };
  selectedId = id;
  closeAllPopups();
  render();
  showToast('已进入聚焦模式：可拖拽和缩放该对象，完成后点击“完成”保存', 'info');
}

function exitFocusMode(save) {
  if (!focusMode.active) return;
  const { targetId, snapshot } = focusMode;
  if (!save && targetId && snapshot) {
    const target = elements.find((e) => e.id === targetId);
    if (target) {
      target.x = snapshot.x;
      target.y = snapshot.y;
      target.w = snapshot.w;
      target.h = snapshot.h;
    }
    showToast('已取消聚焦修改', 'info');
  } else if (save) {
    showToast('已保存聚焦修改', 'success');
  }

  focusMode = {
    active: false,
    targetId: null,
    snapshot: null,
  };
  render();
}

function scrollToElement(id) {
  const box = boardEl?.querySelector(`.elem-box[data-id="${id}"]`);
  if (box) {
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Flash animation
    box.classList.add('elem-flash');
    setTimeout(() => box.classList.remove('elem-flash'), 600);
  }
}

/* ============ Drag ============ */

function startDrag(e, elem, boxEl) {
  if (focusMode.active && focusMode.targetId !== elem.id) return;
  e.preventDefault();
  const boardRect = boardEl.getBoundingClientRect();
  let didDrag = false;

  dragState = {
    id: elem.id,
    startX: e.clientX,
    startY: e.clientY,
    origX: elem.x,
    origY: elem.y,
  };

  const move = (ev) => {
    const deltaX = ev.clientX - dragState.startX;
    const deltaY = ev.clientY - dragState.startY;
    if (!didDrag && Math.hypot(deltaX, deltaY) < DRAG_START_THRESHOLD_PX) {
      return;
    }
    didDrag = true;

    const dx = ((ev.clientX - dragState.startX) / boardRect.width) * 100;
    const dy = ((ev.clientY - dragState.startY) / boardRect.height) * 100;
    const nextX = dragState.origX + dx;
    const nextY = dragState.origY + dy;
    const halfW = elem.w / 2;
    const halfH = elem.h / 2;
    elem.x = clamp(nextX, halfW, 100 - halfW);
    elem.y = clamp(nextY, halfH, 100 - halfH);

    boxEl.style.left = `${elem.x}%`;
    boxEl.style.top = `${elem.y}%`;

    showCoordTooltip(boxEl, elem);

    // Update link lines
    renderLinkLines();
  };

  const up = () => {
    dragState = null;
    hideCoordTooltip(boxEl);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
  };

  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function startResize(e, elem, boxEl) {
  if (focusMode.active && focusMode.targetId !== elem.id) return;
  e.preventDefault();
  const boardRect = boardEl.getBoundingClientRect();
  let didResize = false;

  const startX = e.clientX;
  const startY = e.clientY;
  const origW = elem.w;
  const origH = elem.h;

  const move = (ev) => {
    const deltaX = ev.clientX - startX;
    const deltaY = ev.clientY - startY;
    if (!didResize && Math.hypot(deltaX, deltaY) < DRAG_START_THRESHOLD_PX) return;
    didResize = true;

    const dw = (deltaX / boardRect.width) * 200;
    const dh = (deltaY / boardRect.height) * 200;

    elem.w = clamp(origW + dw, MIN_ELEM_W, MAX_ELEM_W);
    elem.h = clamp(origH + dh, MIN_ELEM_H, MAX_ELEM_H);

    const halfW = elem.w / 2;
    const halfH = elem.h / 2;
    elem.x = clamp(elem.x, halfW, 100 - halfW);
    elem.y = clamp(elem.y, halfH, 100 - halfH);

    boxEl.style.width = `${elem.w}%`;
    boxEl.style.height = `${elem.h}%`;
    boxEl.style.left = `${elem.x}%`;
    boxEl.style.top = `${elem.y}%`;
    showCoordTooltip(boxEl, elem);
    renderLinkLines();
  };

  const up = () => {
    hideCoordTooltip(boxEl);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
  };

  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function selectThroughOverlap(clientX, clientY) {
  const nodes = document.elementsFromPoint(clientX, clientY)
    .filter((node) => boardEl?.contains(node) && node.classList?.contains('elem-box'));
  if (!nodes.length) return;

  const ids = [...new Set(nodes.map((node) => node.dataset.id).filter(Boolean))];
  if (!ids.length) return;

  const currentIndex = ids.indexOf(selectedId);
  const nextId = ids[(currentIndex + 1 + ids.length) % ids.length];
  selectElement(nextId);
}

function showCoordTooltip(boxEl, elem) {
  let tip = boxEl.querySelector('.elem-box-coords');
  if (!tip) {
    tip = document.createElement('span');
    tip.className = 'elem-box-coords';
    boxEl.appendChild(tip);
  }
  tip.textContent = `X${Math.round(elem.x)} Y${Math.round(elem.y)} · ${Math.round(elem.w)}x${Math.round(elem.h)}`;
}

function hideCoordTooltip(boxEl) {
  boxEl?.querySelector('.elem-box-coords')?.remove();
}

/* ============ Links ============ */

function completeLinkPick(toId) {
  if (!linkFromId || linkFromId === toId) return;

  // Check duplicate
  const exists = links.some(l =>
    (l.fromId === linkFromId && l.toId === toId) ||
    (l.fromId === toId && l.toId === linkFromId)
  );
  if (exists) {
    showToast('这两个元素已有链接', 'error');
    linkMode = false;
    linkFromId = null;
    render();
    return;
  }

  openLinkTypePicker(linkFromId, toId);
}

function openLinkTypePicker(fromId, toId) {
  closeAllPopups();
  const popup = ce('div', 'link-picker-popup');

  const fromEl = elements.find(e => e.id === fromId);
  const toEl = elements.find(e => e.id === toId);

  popup.innerHTML = `
    <div class="popup-title">${esc(fromEl?.name || '?')} \u2194 ${esc(toEl?.name || '?')}</div>
    <div class="popup-options">
      ${LINK_TYPES.map(lt => `<button class="popup-opt" data-type="${lt.type}">${lt.label}</button>`).join('')}
    </div>
    <div class="popup-field" style="margin-top:8px">
      <label style="font-size:0.8rem;color:var(--color-text-secondary)">关系说明（可选）</label>
      <input type="text" class="popup-input link-desc-input" placeholder="如: 两人在雨中对视" style="width:100%;margin-top:4px">
    </div>
  `;

  popup.querySelectorAll('.popup-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      let label = LINK_TYPES.find(t => t.type === type)?.label || type;

      if (type === 'custom') {
        const custom = window.prompt('输入自定义关系:');
        if (!custom) { closeAllPopups(); linkMode = false; linkFromId = null; render(); return; }
        label = custom;
      }

      const description = popup.querySelector('.link-desc-input')?.value?.trim() || '';

      links.push({
        fromId,
        toId,
        type,
        label,
        description,
        color: LINK_COLORS[links.length % LINK_COLORS.length],
      });

      linkMode = false;
      linkFromId = null;
      closeAllPopups();
      render();
    });
  });

  document.body.appendChild(popup);
  // Position in viewport center
  const boardRect = boardEl.getBoundingClientRect();
  popup.style.left = `${boardRect.left + boardRect.width / 2 - 100}px`;
  popup.style.top = `${boardRect.top + boardRect.height / 2 - 100}px`;
  registerOutsideClose(popup);
}

function renderLinkLines() {
  if (!svgEl) return;
  svgEl.innerHTML = '';

  links.forEach(link => {
    const fromEl = elements.find(e => e.id === link.fromId);
    const toEl = elements.find(e => e.id === link.toId);
    if (!fromEl || !toEl) return;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', `${fromEl.x}%`);
    line.setAttribute('y1', `${fromEl.y}%`);
    line.setAttribute('x2', `${toEl.x}%`);
    line.setAttribute('y2', `${toEl.y}%`);
    line.setAttribute('stroke', link.color || '#C3A6FF');
    line.setAttribute('stroke-width', link.type === 'same-plane' ? '2.5' : '1.5');
    line.setAttribute('stroke-dasharray', link.type === 'same-plane' ? '6,3' : 'none');
    line.setAttribute('stroke-opacity', '0.5');
    svgEl.appendChild(line);

    // Label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', `${(fromEl.x + toEl.x) / 2}%`);
    text.setAttribute('y', `${(fromEl.y + toEl.y) / 2}%`);
    text.setAttribute('fill', link.color || '#C3A6FF');
    text.setAttribute('font-size', '10');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dy', '-4');
    text.textContent = link.label;
    svgEl.appendChild(text);
  });
}

/* ============ Edit Popup ============ */

function openEditPopup(id) {
  const elem = elements.find(e => e.id === id);
  if (!elem) return;

  closeAllPopups();
  selectElement(id);

  const popup = ce('div', 'edit-popup');
  editPopupEl = popup;

  const isChar = elem.type === 'character';

  popup.innerHTML = `
    <div class="popup-title">编辑${isChar ? '角色' : '景物'}</div>
    <div class="popup-field">
      <label>名称</label>
      <input type="text" class="popup-input" data-key="name" value="${esc(elem.name)}">
    </div>
    <div class="popup-field">
      <label>描述</label>
      <textarea class="popup-textarea" data-key="description" rows="2">${esc(elem.description)}</textarea>
    </div>
    <div class="popup-field">
      <label>提示词片段</label>
      <textarea class="popup-textarea" data-key="prompt" rows="2" placeholder="该元素的具体提示词...">${esc(elem.prompt)}</textarea>
    </div>
    <div class="popup-field">
      <label>层</label>
      <div class="popup-layer-toggle">
        <button class="popup-layer-btn ${elem.layer === 'foreground' ? 'active' : ''}" data-layer="foreground">前景</button>
        <button class="popup-layer-btn ${elem.layer === 'background' ? 'active' : ''}" data-layer="background">后景</button>
      </div>
    </div>
    <div class="popup-field">
      <label>类型</label>
      <div class="popup-layer-toggle">
        <button class="popup-type-btn ${elem.type === 'character' ? 'active' : ''}" data-type="character">人物</button>
        <button class="popup-type-btn ${elem.type === 'object' ? 'active' : ''}" data-type="object">景物</button>
      </div>
    </div>
    <div class="popup-field">
      <label>焦点物品</label>
      <input type="text" class="popup-input" data-key="focusPoint" value="${esc(elem.focusPoint || '')}" placeholder="如: 手中的信件">
    </div>
    <div class="popup-actions">
      <button class="popup-delete">删除</button>
      <button class="popup-close">完成</button>
    </div>
  `;

  // Input changes
  popup.querySelectorAll('.popup-input, .popup-textarea').forEach(input => {
    input.addEventListener('input', () => {
      const key = input.dataset.key;
      if (key) elem[key] = input.value;
    });
  });

  // Layer toggle
  popup.querySelectorAll('.popup-layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      elem.layer = btn.dataset.layer;
      popup.querySelectorAll('.popup-layer-btn').forEach(b => b.classList.toggle('active', b.dataset.layer === elem.layer));
    });
  });

  // Type toggle
  popup.querySelectorAll('.popup-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      elem.type = btn.dataset.type;
      popup.querySelectorAll('.popup-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === elem.type));
    });
  });

  // Delete
  popup.querySelector('.popup-delete').addEventListener('click', () => {
    deleteElement(id);
  });

  // Close
  popup.querySelector('.popup-close').addEventListener('click', () => {
    closeAllPopups();
    render();
  });

  // Position near the element using fixed viewport coords
  const box = boardEl.querySelector(`.elem-box[data-id="${id}"]`);
  if (box) {
    const boxRect = box.getBoundingClientRect();
    let left = boxRect.right + 8;
    let top = boxRect.top;
    // Keep within viewport
    if (left + 240 > window.innerWidth) left = boxRect.left - 248;
    if (top + 400 > window.innerHeight) top = window.innerHeight - 410;
    if (top < 10) top = 10;
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  } else {
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
  }

  document.body.appendChild(popup);
  registerOutsideClose(popup);
}

/* ============ Board Events ============ */

function setupBoardEvents() {
  if (!boardEl) return;

  // Click on empty area to deselect
  boardEl.addEventListener('pointerdown', (e) => {
    if (e.target === boardEl || e.target.classList.contains('canvas-crosshair-h') || e.target.classList.contains('canvas-crosshair-v')) {
      if (!focusMode.active) {
        selectedId = null;
      } else {
        selectedId = focusMode.targetId;
      }
      if (linkMode) {
        linkMode = false;
        linkFromId = null;
      }
      closeAllPopups();
      render();
    }
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (!boardEl || !boardEl.offsetParent) return; // not visible
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'Escape') {
      if (focusMode.active) {
        exitFocusMode(false);
      } else if (linkMode) {
        linkMode = false;
        linkFromId = null;
        render();
      } else {
        selectedId = null;
        closeAllPopups();
        render();
      }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      if (focusMode.active && selectedId !== focusMode.targetId) return;
      deleteElement(selectedId);
    }
  });
}

/* ============ Helpers ============ */

function ce(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function closeAllPopups() {
  boardEl?.querySelectorAll('.edit-popup, .link-picker-popup').forEach(p => p.remove());
  document.querySelectorAll('body > .edit-popup, body > .link-picker-popup').forEach(p => p.remove());
  editPopupEl = null;
  if (outsideHandler) {
    document.removeEventListener('pointerdown', outsideHandler, true);
    outsideHandler = null;
  }
}

function registerOutsideClose(popupEl) {
  // Delay to avoid catching the same click that opened the popup
  setTimeout(() => {
    outsideHandler = (e) => {
      if (!popupEl.contains(e.target)) {
        closeAllPopups();
        render();
      }
    };
    document.addEventListener('pointerdown', outsideHandler, true);
  }, 50);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function trunc(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
