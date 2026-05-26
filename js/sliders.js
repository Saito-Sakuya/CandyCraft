/**
 * sliders.js — Dynamic slider group generation
 * Renders sliders from AI-provided dimensions, syncs with radar chart
 */

let currentDimensions = [];
let changeCallback = null;
let manualChangeCallback = null;
let containerElement = null;

/**
 * Render slider controls for each dimension
 * @param {string} containerId — ID of the container element
 * @param {Array} dimensions — array of { name, description, min, max, default, value, labels }
 * @param {(dimensions: Array) => void} onChange — called when any slider value changes
 */
export function renderSliders(containerId, dimensions, onChange) {
  containerElement = document.getElementById(containerId);
  if (!containerElement) return;

  // Deep clone dimensions to avoid mutation
  currentDimensions = dimensions.map(d => ({ ...d }));
  changeCallback = onChange;

  containerElement.innerHTML = '';

  currentDimensions.forEach((dim, i) => {
    const item = document.createElement('div');
    item.className = 'slider-item fade-in';
    item.style.animationDelay = `${i * 0.05}s`;

    item.innerHTML = `
      <div class="slider-header">
        <span class="slider-label">${escapeHtml(dim.name)}</span>
        <span class="slider-value" id="slider-val-${i}">${dim.value}</span>
      </div>
      ${dim.description ? `<div class="slider-desc">${escapeHtml(dim.description)}</div>` : ''}
      <input type="range" class="slider-range"
             min="${dim.min}" max="${dim.max}" value="${dim.value}"
             data-index="${i}"
             aria-label="${escapeHtml(dim.name)}">
      <div class="slider-labels">
        <span class="slider-label-min">${escapeHtml(dim.labels[0])}</span>
        <span class="slider-label-max">${escapeHtml(dim.labels[1])}</span>
      </div>
    `;

    containerElement.appendChild(item);

    // Set up the slider input listener
    const input = item.querySelector('.slider-range');
    updateTrackFill(input, dim.value, dim.min, dim.max);

    input.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      const newValue = parseInt(e.target.value, 10);

      currentDimensions[idx].value = newValue;

      // Update the value display
      const valueEl = document.getElementById(`slider-val-${idx}`);
      if (valueEl) valueEl.textContent = newValue;

      // Update track fill color
      updateTrackFill(e.target, newValue, currentDimensions[idx].min, currentDimensions[idx].max);

      // Notify parent
      changeCallback?.(currentDimensions);

      // Notify manual change (for preset deselection)
      manualChangeCallback?.();
    });
  });
}

/**
 * Get current dimension values
 * @returns {Array} copy of current dimensions
 */
export function getSliderValues() {
  return currentDimensions.map(d => ({ ...d }));
}

/**
 * Batch-set slider values from a preset values map
 * @param {Object} valuesMap — { dimensionName: value }
 */
export function setValues(valuesMap) {
  if (!containerElement || !valuesMap) return;

  currentDimensions.forEach((dim, i) => {
    if (typeof valuesMap[dim.name] === 'number') {
      dim.value = Math.max(dim.min, Math.min(dim.max, valuesMap[dim.name]));

      const input = containerElement.querySelector(`input[data-index="${i}"]`);
      if (input) {
        input.value = dim.value;
        updateTrackFill(input, dim.value, dim.min, dim.max);
      }

      const valueEl = document.getElementById(`slider-val-${i}`);
      if (valueEl) valueEl.textContent = dim.value;
    }
  });

  changeCallback?.(currentDimensions);
}

/**
 * Register a callback for manual slider changes (user dragging)
 * Used by presets module to deselect active preset
 */
export function registerManualChangeCallback(cb) {
  manualChangeCallback = cb;
}

/**
 * Reset all sliders to their default values
 */
export function resetSliders() {
  if (!containerElement) return;

  currentDimensions.forEach((dim, i) => {
    dim.value = dim.default;

    const input = containerElement.querySelector(`input[data-index="${i}"]`);
    if (input) {
      input.value = dim.default;
      updateTrackFill(input, dim.default, dim.min, dim.max);
    }

    const valueEl = document.getElementById(`slider-val-${i}`);
    if (valueEl) valueEl.textContent = dim.default;
  });

  changeCallback?.(currentDimensions);
}

/**
 * Clear slider container and reset state
 */
export function destroySliders() {
  if (containerElement) containerElement.innerHTML = '';
  currentDimensions = [];
  changeCallback = null;
}

/* ---- Internal Helpers ---- */

/**
 * Update the slider track fill gradient based on current value
 */
function updateTrackFill(input, value, min, max) {
  if (!input) return;
  const percent = ((value - min) / (max - min)) * 100;
  const { start, fill, empty } = getTrackColors();
  input.style.background = `linear-gradient(to right, ${start} 0%, ${fill} ${percent}%, ${empty} ${percent}%)`;
}

/**
 * Refresh inline range backgrounds after Candy/Pro mode changes.
 */
export function refreshSliderThemes() {
  if (!containerElement) return;

  currentDimensions.forEach((dim, i) => {
    const input = containerElement.querySelector(`input[data-index="${i}"]`);
    updateTrackFill(input, dim.value, dim.min, dim.max);
  });
}

function getTrackColors() {
  const isPro = document.documentElement.dataset.uiMode === 'pro';
  if (isPro) {
    return {
      start: 'var(--color-text-secondary)',
      fill: 'var(--color-text-primary)',
      empty: 'var(--color-border)',
    };
  }

  return {
    start: 'var(--color-candy-pink)',
    fill: 'var(--color-candy-lavender)',
    empty: 'var(--color-border)',
  };
}

/**
 * Basic HTML escaping to prevent XSS
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
