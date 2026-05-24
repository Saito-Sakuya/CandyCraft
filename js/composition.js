/**
 * composition.js — Aspect ratio selector
 * Three options: landscape (16:9), portrait (9:16), square (1:1)
 */

let currentRatio = '16:9';
let changeCallback = null;
let containerEl = null;

const RATIOS = [
  { value: '16:9', label: '横向', icon: 'comp-icon-landscape' },
  { value: '9:16', label: '纵向', icon: 'comp-icon-portrait' },
  { value: '1:1',  label: '方形', icon: 'comp-icon-square' },
];

/**
 * Initialize the composition selector
 * @param {string} containerId
 * @param {(ratio: string) => void} onChange — called with the selected ratio string
 */
export function initComposition(containerId, onChange) {
  containerEl = document.getElementById(containerId);
  if (!containerEl) return;

  changeCallback = onChange;
  containerEl.innerHTML = '';

  RATIOS.forEach((r) => {
    const btn = document.createElement('button');
    btn.className = `comp-option ${r.value === currentRatio ? 'active' : ''}`;
    btn.dataset.ratio = r.value;
    btn.title = r.label;

    // Draw a mini rectangle icon representing the ratio
    const [w, h] = r.value.split(':').map(Number);
    const maxDim = 20;
    const scale = maxDim / Math.max(w, h);
    const rw = Math.round(w * scale);
    const rh = Math.round(h * scale);

    btn.innerHTML = `
      <svg width="${rw + 4}" height="${rh + 4}" viewBox="0 0 ${rw + 4} ${rh + 4}" class="comp-icon">
        <rect x="2" y="2" width="${rw}" height="${rh}" rx="2" ry="2"
              fill="none" stroke="currentColor" stroke-width="1.5"/>
      </svg>
      <span class="comp-label">${r.label}</span>
    `;

    btn.addEventListener('click', () => {
      setRatio(r.value);
    });

    containerEl.appendChild(btn);
  });
}

/**
 * Set the current ratio
 */
export function setRatio(ratio) {
  currentRatio = ratio;

  if (containerEl) {
    containerEl.querySelectorAll('.comp-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ratio === ratio);
    });
  }

  changeCallback?.(ratio);
}

/**
 * Get current aspect ratio
 * @returns {string} e.g. '16:9'
 */
export function getAspectRatio() {
  return currentRatio;
}
