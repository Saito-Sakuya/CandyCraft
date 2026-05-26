/**
 * ui-mode.js — Candy / Pro visual theme switch.
 * Independent from light/dark theme.
 */

const STORAGE_KEY = 'cc_ui_mode';
const MODE_CANDY = 'candy';
const MODE_PRO = 'pro';

let changeCallback = null;

export function initUiMode({ onChange } = {}) {
  changeCallback = typeof onChange === 'function' ? onChange : null;
  applyUiMode(getUiMode());
  bindUiModeControls();
}

export function getUiMode() {
  return localStorage.getItem(STORAGE_KEY) === MODE_PRO ? MODE_PRO : MODE_CANDY;
}

export function setUiMode(mode) {
  const nextMode = mode === MODE_PRO ? MODE_PRO : MODE_CANDY;
  localStorage.setItem(STORAGE_KEY, nextMode);
  applyUiMode(nextMode);
}

function bindUiModeControls() {
  document.querySelectorAll('[data-ui-mode]').forEach((btn) => {
    btn.addEventListener('click', () => setUiMode(btn.dataset.uiMode));
  });
}

function applyUiMode(mode) {
  document.documentElement.dataset.uiMode = mode;
  document.querySelectorAll('[data-ui-mode]').forEach((btn) => {
    const active = btn.dataset.uiMode === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  changeCallback?.(mode);
}
