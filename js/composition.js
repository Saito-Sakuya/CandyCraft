/**
 * composition.js — Aspect Ratio / Resolution / Orientation Selector (v4)
 * Supports arbitrary ratio recommendations + manual change tracking.
 */

import {
  normalizeCompositionRatio,
  inferOrientationFromRatio,
  normalizeCompositionOrientation,
} from './composition-recommendation.js';

let currentRatio = '16:9';          // base ratio; for non-square always W>=H
let currentOrientation = 'landscape'; // landscape | portrait | square
let currentResolution = '';
let changeCallback = null;
let containerEl = null;
let manualCompositionChanged = false;

const RATIOS = [
  { value: '1:1',  label: '1:1' },
  { value: '4:3',  label: '4:3' },
  { value: '3:2',  label: '3:2' },
  { value: '16:9', label: '16:9' },
  { value: '21:9', label: '21:9' },
];

const RESOLUTIONS = [
  { value: '',   label: '不设置' },
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

/**
 * Initialize the composition selector
 */
export function initComposition(containerId, onChange) {
  containerEl = document.getElementById(containerId);
  if (!containerEl) return;

  changeCallback = onChange;
  render();
}

export function getCompositionRecommendationState() {
  return {
    orientation: currentOrientation,
    ratio: getEffectiveRatio(),
  };
}

export function hasManualCompositionChanges() {
  return manualCompositionChanged;
}

export function clearManualCompositionChanges() {
  manualCompositionChanged = false;
}

export function applyCompositionRecommendation(reco, { source = 'auto' } = {}) {
  if (!reco || typeof reco !== 'object') return false;

  const ratio = normalizeCompositionRatio(reco.ratio);
  const orientation = normalizeCompositionOrientation(reco.orientation);
  let changed = false;

  if (ratio) {
    const parsed = parseRatio(ratio);
    if (!parsed) return false;

    const normalized = toBaseRatio(parsed.w, parsed.h);
    const nextRatio = `${normalized.w}:${normalized.h}`;
    const nextOrientation = inferOrientationFromRatio(ratio) || currentOrientation;

    if (currentRatio !== nextRatio || currentOrientation !== nextOrientation) {
      currentRatio = nextRatio;
      currentOrientation = nextOrientation;
      changed = true;
    }
  } else if (orientation) {
    if (orientation === 'square') {
      if (currentRatio !== '1:1' || currentOrientation !== 'square') {
        currentRatio = '1:1';
        currentOrientation = 'square';
        changed = true;
      }
    } else if (currentRatio !== '1:1' && currentOrientation !== orientation) {
      currentOrientation = orientation;
      changed = true;
    }
  }

  if (!changed) return false;

  render();
  fireChange();
  if (source === 'auto' || source === 'user-confirmed') {
    clearManualCompositionChanges();
  }
  return true;
}

function render() {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  const knownRatios = new Set(RATIOS.map((item) => item.value));

  // Ratio row
  const ratioRow = ce('div', 'comp-row');
  RATIOS.forEach((r) => {
    const btn = ce('button', `comp-pill ${r.value === currentRatio ? 'active' : ''}`);
    btn.textContent = r.label;
    btn.dataset.ratio = r.value;
    btn.addEventListener('click', () => setRatio(r.value, { markManual: true }));
    ratioRow.appendChild(btn);
  });

  if (!knownRatios.has(currentRatio)) {
    const custom = ce('button', 'comp-pill comp-pill-custom active');
    custom.textContent = currentRatio;
    custom.title = 'AI 推荐的自定义比例';
    custom.dataset.ratio = currentRatio;
    custom.addEventListener('click', () => setRatio(currentRatio, { markManual: true }));
    ratioRow.appendChild(custom);
  }

  // Orientation toggle
  const oriBtn = ce('button', 'comp-ori-btn');
  const isSquare = currentRatio === '1:1';
  if (isSquare) {
    oriBtn.title = '当前为方形构图';
    oriBtn.disabled = true;
    oriBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="4" y="4" width="16" height="16" rx="2"/>
      </svg><span>方</span>
    `;
  } else {
    oriBtn.title = currentOrientation === 'landscape' ? '切换为纵向' : '切换为横向';
    oriBtn.innerHTML = currentOrientation === 'landscape'
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/></svg><span>横</span>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/></svg><span>纵</span>`;
    oriBtn.addEventListener('click', () => {
      currentOrientation = currentOrientation === 'landscape' ? 'portrait' : 'landscape';
      manualCompositionChanged = true;
      fireChange();
      render();
    });
  }
  ratioRow.appendChild(oriBtn);
  containerEl.appendChild(ratioRow);

  // Resolution row
  const resRow = ce('div', 'comp-row comp-row-res');
  const resLabel = ce('span', 'comp-res-label');
  resLabel.textContent = '分辨率';
  resRow.appendChild(resLabel);

  RESOLUTIONS.forEach((r) => {
    const btn = ce('button', `comp-pill comp-pill-sm ${r.value === currentResolution ? 'active' : ''}`);
    btn.textContent = r.label;
    btn.addEventListener('click', () => {
      currentResolution = r.value;
      fireChange();
      render();
    });
    resRow.appendChild(btn);
  });
  containerEl.appendChild(resRow);
}

function setRatio(ratioValue, { markManual = false } = {}) {
  const normalizedRatio = normalizeCompositionRatio(ratioValue);
  if (!normalizedRatio) return;

  const parsed = parseRatio(normalizedRatio);
  if (!parsed) return;

  const normalized = toBaseRatio(parsed.w, parsed.h);
  currentRatio = `${normalized.w}:${normalized.h}`;
  currentOrientation = inferOrientationFromRatio(normalizedRatio) || currentOrientation;

  if (markManual) {
    manualCompositionChanged = true;
  }
  fireChange();
  render();
}

function fireChange() {
  changeCallback?.(getCompositionData());
}

/**
 * Get current composition data
 */
export function getCompositionData() {
  const effectiveRatio = getEffectiveRatio();
  return {
    ratio: effectiveRatio,
    baseRatio: currentRatio,
    orientation: currentOrientation,
    resolution: currentResolution,
  };
}

/**
 * Get effective aspect ratio for canvas
 */
export function getAspectRatio() {
  return getEffectiveRatio();
}

function getEffectiveRatio() {
  if (currentRatio === '1:1' || currentOrientation === 'square') return '1:1';

  const parsed = parseRatio(currentRatio);
  if (!parsed) return '16:9';

  if (currentOrientation === 'portrait') {
    return `${parsed.h}:${parsed.w}`;
  }
  return `${parsed.w}:${parsed.h}`;
}

function parseRatio(ratioValue) {
  const m = String(ratioValue || '').match(/^(\d+):(\d+)$/);
  if (!m) return null;
  const w = Number.parseInt(m[1], 10);
  const h = Number.parseInt(m[2], 10);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return null;
  return { w, h };
}

function toBaseRatio(w, h) {
  if (w === h) return { w: 1, h: 1 };
  return w >= h ? { w, h } : { w: h, h: w };
}

/* ---- Helpers ---- */
function ce(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
