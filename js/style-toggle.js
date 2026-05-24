/**
 * style-toggle.js → style-slider.js
 * 10-step slider: 1 = pure anime ↔ 10 = pure realistic
 * Persisted via localStorage
 */

const STORAGE_KEY = 'pc_style_level';
const MIN = 1;
const MAX = 10;
const DEFAULT = 3;

let currentLevel = DEFAULT;
let changeCallback = null;
let containerEl = null;

/**
 * Initialize the style slider
 * @param {string} containerId
 * @param {(level: number) => void} onChange
 */
export function initStyleToggle(containerId, onChange) {
  containerEl = document.getElementById(containerId);
  if (!containerEl) return;

  changeCallback = onChange;

  // Load saved preference
  const saved = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  if (saved >= MIN && saved <= MAX) {
    currentLevel = saved;
  }

  render();
}

/**
 * Get current style level (1-10)
 * @returns {number}
 */
export function getStyle() {
  return currentLevel;
}

function render() {
  containerEl.innerHTML = '';
  containerEl.className = 'style-slider-wrap';

  const pct = ((currentLevel - MIN) / (MAX - MIN)) * 100;

  containerEl.innerHTML = `
    <span class="style-slider-label style-slider-label-left">动漫</span>
    <div class="style-slider-track-wrap">
      <input type="range" class="style-slider-input" min="${MIN}" max="${MAX}" value="${currentLevel}" step="1">
      <div class="style-slider-ticks">
        ${Array.from({ length: MAX }, (_, i) => `<span class="style-slider-tick ${i + 1 === currentLevel ? 'active' : ''}"></span>`).join('')}
      </div>
    </div>
    <span class="style-slider-label style-slider-label-right">写实</span>
    <span class="style-slider-value">${currentLevel}</span>
  `;

  const input = containerEl.querySelector('.style-slider-input');
  updateTrackFill(input, currentLevel);

  input.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    currentLevel = val;
    localStorage.setItem(STORAGE_KEY, val);
    updateTrackFill(input, val);

    // Update ticks
    containerEl.querySelectorAll('.style-slider-tick').forEach((tick, i) => {
      tick.classList.toggle('active', i + 1 === val);
    });

    // Update value badge
    const badge = containerEl.querySelector('.style-slider-value');
    if (badge) badge.textContent = val;

    changeCallback?.(val);
  });
}

function updateTrackFill(input, value) {
  const pct = ((value - MIN) / (MAX - MIN)) * 100;
  // Anime side = pink, realistic side = sky blue
  input.style.background = `linear-gradient(to right, #FF8FAB 0%, #C3A6FF ${pct}%, #F0E6F0 ${pct}%)`;
}
