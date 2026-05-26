/**
 * composition.js — Aspect Ratio / Pixel Size Selector (v6)
 * Single truth: final pixel width/height + aspect ratio.
 */

import {
  normalizeCompositionRatio,
  inferOrientationFromRatio,
  normalizeCompositionOrientation,
} from './composition-recommendation.js';

let currentRatio = '16:9';
let currentSizeMode = 'preset_resolution'; // preset_resolution | custom_pixel
let currentResolutionLongEdge = 1536;
let currentWidth = 1536;
let currentHeight = 864;
let ratioLock = true;
let uiMode = 'candy';
let changeCallback = null;
let containerEl = null;
let manualCompositionChanged = false;
let inputError = '';

const SIZE_MIN = 256;
const SIZE_MAX = 8192;
const LONG_EDGE_PRESETS = [1024, 1536, 1920, 2048, 2560, 2712, 3072, 3840, 4096, 7680];
const FREE_RATIO_VALUE = 'free';

export const RATIO_GROUPS = [
  {
    key: 'landscape',
    label: '横向',
    items: ['16:9', '4:3', '3:2', '21:9', '2:1', '5:4'],
  },
  {
    key: 'portrait',
    label: '纵向',
    items: ['2:3', '9:16', '3:4', '4:5', '1:2', '5:7'],
  },
  {
    key: 'square',
    label: '方形',
    items: ['1:1'],
  },
  {
    key: 'golden',
    label: '黄金',
    items: ['1618:1000', '1000:1618'],
  },
  {
    key: 'paper',
    label: '纸张比例',
    items: ['210:297', '297:210', '297:420', '420:297', '420:594', '594:420'],
  },
];

const CANDY_RATIO_GROUPS = [
  { key: 'landscape', label: '横向', items: ['16:9', '4:3', '3:2', '21:9'] },
  { key: 'portrait', label: '纵向', items: ['2:3', '9:16', '4:5'] },
  { key: 'square', label: '方形', items: ['1:1'] },
  { key: 'golden', label: '黄金', items: ['1618:1000', '1000:1618'] },
];

// Backward-compatible export name for planned Pro menu consumers.
export const PRO_RATIO_GROUPS = RATIO_GROUPS;

const SIZE_MODE_OPTIONS = [
  { value: 'preset_resolution', label: '长边分辨率' },
  { value: 'custom_pixel', label: '自定义像素' },
];

export function initComposition(containerId, onChange) {
  containerEl = document.getElementById(containerId);
  if (!containerEl) return;

  changeCallback = onChange;
  recalcSizeFromMode({ source: 'init' });
  render();
}

export function getCompositionRecommendationState() {
  return {
    orientation: getOrientation(),
    ratio: getEffectiveRatio(),
  };
}

export function hasManualCompositionChanges() {
  return manualCompositionChanged;
}

export function setCompositionUiMode(mode) {
  uiMode = mode === 'pro' ? 'pro' : 'candy';
  render();
}

export function clearManualCompositionChanges() {
  manualCompositionChanged = false;
}

export function applyCompositionRecommendation(reco, { source = 'auto' } = {}) {
  if (!reco || typeof reco !== 'object') return false;

  const ratio = normalizeCompositionRatio(reco.ratio);
  const orientation = normalizeCompositionOrientation(reco.orientation);
  let nextRatio = ratio;

  if (!nextRatio && orientation) {
    nextRatio = getDefaultRatioForOrientation(orientation);
  }
  if (!nextRatio || nextRatio === currentRatio) return false;

  currentRatio = nextRatio;
  if (currentSizeMode === 'custom_pixel') {
    ratioLock = true;
  }
  recalcSizeFromMode({ source: 'apply-reco' });
  render();
  fireChange();
  if (source === 'auto' || source === 'user-confirmed') {
    clearManualCompositionChanges();
  }
  return true;
}

export function applyCompositionData(data, { markManual = true } = {}) {
  if (!data || typeof data !== 'object') return false;

  const nextMode = data.sizeMode === 'custom_pixel' ? 'custom_pixel' : 'preset_resolution';
  const normalizedRatio = normalizeCompositionRatio(data.ratio || data.baseRatio);
  const nextWidth = normalizeSize(data.width);
  const nextHeight = normalizeSize(data.height);
  const inferredRatio = nextWidth && nextHeight ? simplifyRatio(nextWidth, nextHeight) : '';
  const nextRatio = normalizedRatio || normalizeCompositionRatio(inferredRatio) || currentRatio;

  currentSizeMode = nextMode;
  currentRatio = nextRatio;
  ratioLock = typeof data.ratioLock === 'boolean' ? data.ratioLock : true;
  inputError = '';

  if (currentSizeMode === 'preset_resolution') {
    currentResolutionLongEdge = normalizeLongEdge(data.resolutionLongEdge || data.resolution);
    recalcSizeFromMode({ source: 'template-preset' });
  } else {
    currentWidth = nextWidth || currentWidth;
    currentHeight = nextHeight || currentHeight;
    if (ratioLock) {
      recalcSizeFromMode({ source: 'template-custom' });
    } else {
      currentRatio = simplifyRatio(currentWidth, currentHeight);
    }
  }

  manualCompositionChanged = Boolean(markManual);
  render();
  fireChange();
  return true;
}

function render() {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  const effectiveRatio = getEffectiveRatio();

  const outputTitle = ce('div', 'comp-section-title');
  outputTitle.textContent = '输出';
  containerEl.appendChild(outputTitle);
  renderFinalSummary(effectiveRatio);
  renderCompositionNote();

  const ratioTitle = ce('div', 'comp-section-title');
  ratioTitle.textContent = '选比例';
  containerEl.appendChild(ratioTitle);
  renderRatioSelect(effectiveRatio);

  const modeTitle = ce('div', 'comp-section-title');
  modeTitle.textContent = '选尺寸';
  containerEl.appendChild(modeTitle);

  const modeRow = ce('div', 'comp-row comp-row-res');
  SIZE_MODE_OPTIONS.forEach((opt) => {
    const btn = ce('button', `comp-pill comp-pill-sm ${opt.value === currentSizeMode ? 'active' : ''}`);
    btn.type = 'button';
    btn.textContent = opt.label;
    btn.dataset.sizeMode = opt.value;
    btn.addEventListener('click', () => setSizeMode(opt.value));
    modeRow.appendChild(btn);
  });
  containerEl.appendChild(modeRow);

  if (currentSizeMode === 'preset_resolution') {
    renderLongEdgeControls();
  } else {
    renderCustomPixelControls();
  }

  if (inputError) {
    const err = ce('div', 'comp-size-error');
    err.textContent = inputError;
    containerEl.appendChild(err);
  }
}

function renderFinalSummary(effectiveRatio) {
  const finalRow = ce('div', 'comp-final-size');
  const items = [
    { label: '最终输出', value: `${currentWidth} x ${currentHeight} px` },
    { label: '比例', value: effectiveRatio },
    { label: '方向', value: getOrientationLabel(getOrientation()) },
  ];
  items.forEach((item) => {
    const block = ce('div', 'comp-final-block');
    const label = ce('span', 'comp-final-label');
    const value = ce('strong', 'comp-final-value');
    label.textContent = item.label;
    value.textContent = item.value;
    block.appendChild(label);
    block.appendChild(value);
    finalRow.appendChild(block);
  });
  containerEl.appendChild(finalRow);
}

function renderCompositionNote() {
  const note = ce('p', 'module-note comp-note');
  note.textContent = '说明：比例与像素尺寸会写入优化上下文；若生图平台不支持硬性宽高参数，AI 可能只能按画面比例近似遵循。';
  containerEl.appendChild(note);
}

function renderLongEdgeControls() {
  const resRow = ce('div', 'comp-select-row');
  const resLabel = ce('span', 'comp-res-label');
  resLabel.textContent = '长边像素';
  resRow.appendChild(resLabel);

  const options = LONG_EDGE_PRESETS.map((px) => ({
    value: String(px),
    label: formatLongEdgeLabel(px),
  }));
  const onSelect = (value) => {
    currentResolutionLongEdge = Number.parseInt(value, 10);
    manualCompositionChanged = true;
    inputError = '';
    recalcSizeFromMode({ source: 'long-edge-change' });
    fireChange();
    render();
  };

  resRow.appendChild(createNativeSelect({
    className: 'comp-long-edge-select',
    options,
    value: String(currentResolutionLongEdge),
    onSelect,
  }));
  resRow.appendChild(createDropdown({
    className: 'comp-long-edge-dropdown',
    groups: [{ label: '长边像素', items: options }],
    value: String(currentResolutionLongEdge),
    onSelect,
  }));
  containerEl.appendChild(resRow);
}

function renderRatioSelect(effectiveRatio) {
  const activeGroups = uiMode === 'pro' ? RATIO_GROUPS : CANDY_RATIO_GROUPS;
  const knownRatios = new Set(activeGroups.flatMap((group) => group.items));
  const selectValue = currentSizeMode === 'custom_pixel' && !ratioLock ? FREE_RATIO_VALUE : effectiveRatio;
  const dropdownGroups = [{
    label: '自由',
    items: [{
      value: FREE_RATIO_VALUE,
      label: '自由 · 不锁定比例',
    }],
  }, ...activeGroups.map((group) => ({
    label: group.label,
    items: group.items.map((ratio) => ({
      value: ratio,
      label: formatRatioOptionLabel(ratio),
    })),
  }))];

  if (selectValue !== FREE_RATIO_VALUE && !knownRatios.has(effectiveRatio)) {
    dropdownGroups.push({
      label: '当前',
      items: [{
        value: effectiveRatio,
        label: `${effectiveRatio} · ${getOrientationLabel(getOrientation())}`,
      }],
    });
  }

  const onSelect = (value) => setRatio(value, { markManual: true });
  containerEl.appendChild(createNativeSelect({
    className: 'comp-ratio-select',
    groups: dropdownGroups,
    value: selectValue,
    onSelect,
  }));
  containerEl.appendChild(createDropdown({
    className: 'comp-ratio-dropdown',
    groups: dropdownGroups,
    value: selectValue,
    onSelect,
  }));
}

function createNativeSelect({ className, groups = null, options = null, value, onSelect }) {
  const select = ce('select', `comp-select ${className} comp-native-select`);
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  const normalizedGroups = groups || [{ label: '', items: options || [] }];
  normalizedGroups.forEach((group) => {
    const parent = group.label ? document.createElement('optgroup') : select;
    if (group.label) parent.label = group.label;
    group.items.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.label;
      opt.selected = item.value === value;
      parent.appendChild(opt);
    });
    if (group.label) select.appendChild(parent);
  });
  select.addEventListener('change', () => onSelect(select.value));
  return select;
}

function createDropdown({ className, groups, value, onSelect }) {
  const root = ce('div', `comp-dropdown ${className}`);
  const trigger = ce('button', 'comp-dropdown-trigger');
  const selected = ce('span', 'comp-dropdown-selected');
  const arrow = ce('span', 'comp-dropdown-arrow');
  const menu = ce('div', 'comp-dropdown-menu hidden');

  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  selected.textContent = findDropdownLabel(groups, value);
  arrow.textContent = '⌄';
  trigger.appendChild(selected);
  trigger.appendChild(arrow);

  groups.forEach((group) => {
    const groupEl = ce('div', 'comp-dropdown-group');
    if (group.label) {
      const label = ce('div', 'comp-dropdown-group-label');
      label.textContent = group.label;
      groupEl.appendChild(label);
    }

    group.items.forEach((item) => {
      const option = ce('button', `comp-dropdown-option ${item.value === value ? 'active' : ''}`);
      option.type = 'button';
      option.dataset.value = item.value;
      option.textContent = item.label;
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        closeCompositionDropdowns();
        if (item.value !== value) {
          onSelect(item.value);
        }
      });
      groupEl.appendChild(option);
    });

    menu.appendChild(groupEl);
  });

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    const shouldOpen = !root.classList.contains('open');
    closeCompositionDropdowns();
    root.classList.toggle('open', shouldOpen);
    root.closest('.poster-group')?.classList.toggle('dropdown-open', shouldOpen);
    menu.classList.toggle('hidden', !shouldOpen);
    trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  });

  root.appendChild(trigger);
  root.appendChild(menu);
  return root;
}

function closeCompositionDropdowns() {
  document.querySelectorAll('.comp-dropdown.open').forEach((dropdown) => {
    dropdown.classList.remove('open');
    dropdown.closest('.poster-group')?.classList.remove('dropdown-open');
    dropdown.querySelector('.comp-dropdown-menu')?.classList.add('hidden');
    dropdown.querySelector('.comp-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
  });
}

document.addEventListener('click', closeCompositionDropdowns);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeCompositionDropdowns();
});

function renderCustomPixelControls() {
  const lockRow = ce('label', 'comp-lock-row');
  const lockInput = document.createElement('input');
  lockInput.type = 'checkbox';
  lockInput.checked = ratioLock;
  lockInput.addEventListener('change', () => {
    ratioLock = lockInput.checked;
    manualCompositionChanged = true;
    if (ratioLock) {
      currentRatio = getEffectiveRatio();
    }
    inputError = '';
    fireChange();
    render();
  });
  const lockText = ce('span');
  lockText.textContent = ratioLock ? `锁定当前比例 ${currentRatio}（选“自由”可解除）` : '不锁定比例，按像素反推';
  lockRow.appendChild(lockInput);
  lockRow.appendChild(lockText);
  containerEl.appendChild(lockRow);

  const sizeRow = ce('div', 'comp-size-row');
  const widthInput = createSizeInput('width', currentWidth);
  const heightInput = createSizeInput('height', currentHeight);

  widthInput.addEventListener('input', () => handleDimensionInput('width', widthInput.value, { live: true, widthInput, heightInput }));
  heightInput.addEventListener('input', () => handleDimensionInput('height', heightInput.value, { live: true, widthInput, heightInput }));
  widthInput.addEventListener('focus', () => widthInput.select());
  heightInput.addEventListener('focus', () => heightInput.select());
  widthInput.addEventListener('change', () => {
    if (handleDimensionInput('width', widthInput.value, { live: true, widthInput, heightInput })) {
      render();
    } else {
      syncSizeInputValues(widthInput, heightInput);
      render();
    }
  });
  heightInput.addEventListener('change', () => {
    if (handleDimensionInput('height', heightInput.value, { live: true, widthInput, heightInput })) {
      render();
    } else {
      syncSizeInputValues(widthInput, heightInput);
      render();
    }
  });

  const widthWrap = ce('label', 'comp-size-field');
  const widthText = ce('span', 'comp-size-label');
  widthText.textContent = '宽 px';
  widthWrap.appendChild(widthText);
  widthWrap.appendChild(widthInput);

  const heightWrap = ce('label', 'comp-size-field');
  const heightText = ce('span', 'comp-size-label');
  heightText.textContent = '高 px';
  heightWrap.appendChild(heightText);
  heightWrap.appendChild(heightInput);

  sizeRow.appendChild(widthWrap);
  sizeRow.appendChild(heightWrap);
  containerEl.appendChild(sizeRow);
}

function createSizeInput(field, value) {
  const input = document.createElement('input');
  input.className = 'comp-size-input';
  input.dataset.field = field;
  input.type = 'number';
  input.min = String(SIZE_MIN);
  input.max = String(SIZE_MAX);
  input.step = '1';
  input.value = String(value);
  return input;
}

function setSizeMode(nextMode) {
  if (nextMode !== 'preset_resolution' && nextMode !== 'custom_pixel') return;
  if (nextMode === currentSizeMode) return;
  currentSizeMode = nextMode;
  manualCompositionChanged = true;
  inputError = '';
  if (currentSizeMode === 'custom_pixel') {
    ratioLock = true;
  }
  recalcSizeFromMode({ source: 'mode-change' });
  fireChange();
  render();
}

function handleDimensionInput(field, rawValue, { live = false, widthInput = null, heightInput = null } = {}) {
  const parsed = Number.parseInt(String(rawValue || '').trim(), 10);
  if (!Number.isFinite(parsed)) {
    inputError = '请输入整数像素值';
    return false;
  }
  if (parsed < SIZE_MIN || parsed > SIZE_MAX) {
    inputError = `像素范围需在 ${SIZE_MIN}-${SIZE_MAX}`;
    return false;
  }

  inputError = '';
  manualCompositionChanged = true;

  if (ratioLock) {
    const ratio = parseRatio(currentRatio) || { w: 16, h: 9 };
    if (field === 'width') {
      currentWidth = parsed;
      currentHeight = clampSize(Math.round((parsed * ratio.h) / ratio.w));
      if (heightInput) heightInput.value = String(currentHeight);
    } else {
      currentHeight = parsed;
      currentWidth = clampSize(Math.round((parsed * ratio.w) / ratio.h));
      if (widthInput) widthInput.value = String(currentWidth);
    }
  } else {
    if (field === 'width') currentWidth = parsed;
    else currentHeight = parsed;
    currentRatio = simplifyRatio(currentWidth, currentHeight);
  }

  if (!live) {
    syncSizeInputValues(widthInput, heightInput);
  }
  fireChange();
  updateRenderedSummary();

  if (!live) {
    render();
  }
  return true;
}

function updateRenderedSummary() {
  if (!containerEl) return;
  const values = containerEl.querySelectorAll('.comp-final-value');
  if (values.length < 3) return;
  values[0].textContent = `${currentWidth} x ${currentHeight} px`;
  values[1].textContent = getEffectiveRatio();
  values[2].textContent = getOrientationLabel(getOrientation());
}

function syncSizeInputValues(widthInput, heightInput) {
  if (widthInput) widthInput.value = String(currentWidth);
  if (heightInput) heightInput.value = String(currentHeight);
}

function setRatio(ratioValue, { markManual = false } = {}) {
  if (ratioValue === FREE_RATIO_VALUE) {
    currentSizeMode = 'custom_pixel';
    ratioLock = false;
    currentRatio = simplifyRatio(currentWidth, currentHeight);
    if (markManual) manualCompositionChanged = true;
    inputError = '';
    recalcSizeFromMode({ source: 'ratio-free' });
    fireChange();
    render();
    return;
  }

  const normalizedRatio = normalizeCompositionRatio(ratioValue);
  if (!normalizedRatio) return;

  currentRatio = normalizedRatio;
  if (currentSizeMode === 'custom_pixel') {
    ratioLock = true;
  }
  if (markManual) manualCompositionChanged = true;
  inputError = '';
  recalcSizeFromMode({ source: 'ratio-change' });
  fireChange();
  render();
}

function recalcSizeFromMode({ source = '' } = {}) {
  const ratio = parseRatio(currentRatio) || { w: 16, h: 9 };

  if (currentSizeMode === 'preset_resolution') {
    const longEdge = normalizeLongEdge(currentResolutionLongEdge);
    currentResolutionLongEdge = longEdge;
    if (ratio.w >= ratio.h) {
      currentWidth = longEdge;
      currentHeight = clampSize(Math.round((longEdge * ratio.h) / ratio.w));
    } else {
      currentHeight = longEdge;
      currentWidth = clampSize(Math.round((longEdge * ratio.w) / ratio.h));
    }
    return;
  }

  if (currentSizeMode === 'custom_pixel' && ratioLock) {
    if (source === 'init') {
      currentWidth = 1536;
    }
    currentWidth = clampSize(currentWidth);
    currentHeight = clampSize(Math.round((currentWidth * ratio.h) / ratio.w));
    return;
  }

  currentWidth = clampSize(currentWidth);
  currentHeight = clampSize(currentHeight);
  currentRatio = simplifyRatio(currentWidth, currentHeight);
}

function fireChange() {
  changeCallback?.(getCompositionData());
}

export function getCompositionData() {
  const effectiveRatio = getEffectiveRatio();
  return {
    ratio: effectiveRatio,
    baseRatio: effectiveRatio,
    orientation: getOrientation(),
    sizeMode: currentSizeMode,
    resolutionLongEdge: currentResolutionLongEdge,
    width: currentWidth,
    height: currentHeight,
    ratioLock,
    // compatibility for old readers
    resolution: currentResolutionLongEdge ? `${currentResolutionLongEdge}px` : '',
  };
}

export function getAspectRatio() {
  return getEffectiveRatio();
}

function getEffectiveRatio() {
  if (currentSizeMode === 'custom_pixel' && !ratioLock) {
    return simplifyRatio(currentWidth, currentHeight);
  }
  return currentRatio;
}

function getOrientation() {
  return inferOrientationFromRatio(getEffectiveRatio()) || 'landscape';
}

function getOrientationLabel(orientation) {
  if (orientation === 'portrait') return '纵向';
  if (orientation === 'square') return '方形';
  return '横向';
}

function getDefaultRatioForOrientation(orientation) {
  if (orientation === 'portrait') return '2:3';
  if (orientation === 'square') return '1:1';
  return '16:9';
}

function formatRatioLabel(ratio) {
  if (ratio === '1618:1000') return '1.618:1';
  if (ratio === '1000:1618') return '1:1.618';
  return ratio;
}

function formatRatioOptionLabel(ratio) {
  return `${formatRatioLabel(ratio)} · ${getOrientationLabel(inferOrientationFromRatio(ratio))}`;
}

function formatLongEdgeLabel(px) {
  const labels = {
    1024: '轻量',
    1536: '1.5K',
    1920: '1K / FHD',
    2048: '2K',
    2560: '2.5K',
    2712: '2.7K',
    3072: '3K',
    3840: '4K UHD',
    4096: '4K DCI',
    7680: '8K',
  };
  return labels[px] ? `${px}px · ${labels[px]}` : `${px}px`;
}

function findDropdownLabel(groups, value) {
  for (const group of groups) {
    const match = group.items.find((item) => item.value === value);
    if (match) return match.label;
  }
  return value;
}

function parseRatio(ratioValue) {
  const m = String(ratioValue || '').match(/^(\d{1,4}):(\d{1,4})$/);
  if (!m) return null;
  const w = Number.parseInt(m[1], 10);
  const h = Number.parseInt(m[2], 10);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return null;
  return { w, h };
}

function normalizeLongEdge(px) {
  const n = Number.parseInt(String(px), 10);
  if (LONG_EDGE_PRESETS.includes(n)) return n;
  return 1536;
}

function clampSize(px) {
  const n = Number.parseInt(String(px), 10);
  if (!Number.isFinite(n)) return SIZE_MIN;
  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, n));
}

function normalizeSize(px) {
  const n = Number.parseInt(String(px), 10);
  if (!Number.isFinite(n) || n < SIZE_MIN || n > SIZE_MAX) return null;
  return n;
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function simplifyRatio(w, h) {
  const ww = clampSize(w);
  const hh = clampSize(h);
  const d = gcd(ww, hh);
  return `${Math.max(1, Math.round(ww / d))}:${Math.max(1, Math.round(hh / d))}`;
}

function ce(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
