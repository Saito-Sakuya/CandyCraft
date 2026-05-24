/**
 * composition.js — Aspect Ratio / Resolution / Orientation Selector (v3)
 * Controls: ratio presets, orientation flip, resolution presets
 */

let currentRatio = '16:9';
let currentOrientation = 'landscape';
let currentResolution = '';
let changeCallback = null;
let containerEl = null;

const RATIOS = [
  { value: '1:1',  label: '1:1' },
  { value: '4:3',  label: '4:3' },
  { value: '3:2',  label: '3:2' },
  { value: '16:9', label: '16:9' },
  { value: '21:9', label: '21:9' },
];

const RESOLUTIONS = [
  { value: '',       label: '不设置' },
  { value: '1K',     label: '1K' },
  { value: '2K',     label: '2K' },
  { value: '4K',     label: '4K' },
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

function render() {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  // Ratio row
  const ratioRow = ce('div', 'comp-row');
  RATIOS.forEach(r => {
    const btn = ce('button', `comp-pill ${r.value === currentRatio ? 'active' : ''}`);
    btn.textContent = r.label;
    btn.dataset.ratio = r.value;
    btn.addEventListener('click', () => setRatio(r.value));
    ratioRow.appendChild(btn);
  });

  // Orientation toggle
  const oriBtn = ce('button', 'comp-ori-btn');
  oriBtn.title = currentOrientation === 'landscape' ? '切换为纵向' : '切换为横向';
  oriBtn.innerHTML = currentOrientation === 'landscape'
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/></svg><span>横</span>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/></svg><span>纵</span>`;
  oriBtn.addEventListener('click', () => {
    currentOrientation = currentOrientation === 'landscape' ? 'portrait' : 'landscape';
    fireChange();
    render();
  });
  ratioRow.appendChild(oriBtn);
  containerEl.appendChild(ratioRow);

  // Resolution row
  const resRow = ce('div', 'comp-row comp-row-res');
  const resLabel = ce('span', 'comp-res-label');
  resLabel.textContent = '分辨率';
  resRow.appendChild(resLabel);

  RESOLUTIONS.forEach(r => {
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

function setRatio(ratio) {
  currentRatio = ratio;
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
  return {
    ratio: currentRatio,
    orientation: currentOrientation,
    resolution: currentResolution,
  };
}

/**
 * Get aspect ratio string for canvas (backward compat)
 * Returns effective ratio considering orientation
 */
export function getAspectRatio() {
  if (currentRatio === '1:1') return '1:1';
  const [w, h] = currentRatio.split(':').map(Number);
  if (currentOrientation === 'portrait') {
    return `${h}:${w}`;
  }
  return currentRatio;
}

/* ---- Helpers ---- */
function ce(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
