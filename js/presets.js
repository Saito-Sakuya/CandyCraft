/**
 * presets.js — Preset optimization profiles
 * Renders clickable preset cards that batch-set slider values
 */

let presetsData = [];
let selectCallback = null;
let containerEl = null;
let activePresetIdx = -1;

/**
 * Render preset cards
 * @param {string} containerId
 * @param {Array<{name: string, description: string, values: Object}>} presets
 * @param {(values: Object) => void} onSelect — called with the preset's values map
 */
export function renderPresets(containerId, presets, onSelect) {
  containerEl = document.getElementById(containerId);
  if (!containerEl) return;

  presetsData = presets;
  selectCallback = onSelect;
  activePresetIdx = -1;

  containerEl.innerHTML = '';

  if (!presets || presets.length === 0) {
    containerEl.style.display = 'none';
    return;
  }

  containerEl.style.display = '';

  presets.forEach((preset, i) => {
    const card = document.createElement('button');
    card.className = 'preset-card';
    card.dataset.index = i;
    card.innerHTML = `
      <span class="preset-card-name">${escapeHtml(preset.name)}</span>
      <span class="preset-card-desc">${escapeHtml(preset.description)}</span>
    `;

    card.addEventListener('click', () => {
      setActivePreset(i);
      selectCallback?.(preset.values);
    });

    containerEl.appendChild(card);
  });
}

/**
 * Set active preset by index (-1 = custom/none)
 */
export function setActivePreset(index) {
  activePresetIdx = index;
  if (!containerEl) return;

  containerEl.querySelectorAll('.preset-card').forEach((card, i) => {
    card.classList.toggle('active', i === index);
  });
}

/**
 * Mark as custom (no preset active) — called when user manually moves a slider
 */
export function clearActivePreset() {
  setActivePreset(-1);
}

/**
 * Get currently active preset name
 */
export function getActivePresetName() {
  return activePresetIdx >= 0 ? presetsData[activePresetIdx]?.name : null;
}

/**
 * Destroy presets
 */
export function destroyPresets() {
  if (containerEl) containerEl.innerHTML = '';
  presetsData = [];
  selectCallback = null;
  activePresetIdx = -1;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
