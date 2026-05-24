/**
 * settings.js — Settings panel management
 * API configuration, connection testing, key visibility toggle
 */

import { getApiConfig, setApiConfig, testConnection } from './api.js';
import { showToast } from './utils.js';

let panelEl = null;
let overlayEl = null;

/**
 * Initialize the settings panel: load config, bind events
 */
export function initSettings() {
  panelEl = document.getElementById('settings-panel');
  overlayEl = document.getElementById('settings-overlay');

  const btnOpen = document.getElementById('btn-settings');
  const btnClose = document.getElementById('close-settings');
  const btnSave = document.getElementById('save-settings');
  const btnTest = document.getElementById('test-connection');
  const btnToggleKey = document.getElementById('toggle-key-visibility');

  const inputBaseUrl = document.getElementById('api-base-url');
  const inputApiKey = document.getElementById('api-key');
  const inputModel = document.getElementById('model-name');

  // Load current config into fields
  const config = getApiConfig();
  if (inputBaseUrl) inputBaseUrl.value = config.baseUrl;
  if (inputApiKey) inputApiKey.value = config.apiKey;
  if (inputModel) inputModel.value = config.model;

  // Open / close
  btnOpen?.addEventListener('click', openSettings);
  btnClose?.addEventListener('click', closeSettings);
  overlayEl?.addEventListener('click', closeSettings);

  // Save settings
  btnSave?.addEventListener('click', () => {
    setApiConfig({
      baseUrl: inputBaseUrl?.value.trim() || '',
      apiKey: inputApiKey?.value.trim() || '',
      model: inputModel?.value.trim() || 'gpt-4o',
    });
    showToast('设置已保存', 'success');
    closeSettings();
  });

  // Test connection
  btnTest?.addEventListener('click', async () => {
    // Temporarily save before testing
    setApiConfig({
      baseUrl: inputBaseUrl?.value.trim() || '',
      apiKey: inputApiKey?.value.trim() || '',
      model: inputModel?.value.trim() || 'gpt-4o',
    });

    btnTest.disabled = true;
    btnTest.textContent = '测试中...';

    const result = await testConnection();

    btnTest.disabled = false;
    btnTest.textContent = '测试连接';

    showToast(result.message, result.success ? 'success' : 'error');
  });

  // Toggle API key visibility
  btnToggleKey?.addEventListener('click', () => {
    if (!inputApiKey) return;
    const isPassword = inputApiKey.type === 'password';
    inputApiKey.type = isPassword ? 'text' : 'password';
    // Update icon
    const svg = btnToggleKey.querySelector('svg use');
    if (svg) {
      svg.setAttribute('href', isPassword ? '#icon-eye-off' : '#icon-eye');
    }
  });
}

/**
 * Open the settings panel
 */
export function openSettings() {
  panelEl?.classList.add('open');
  overlayEl?.classList.add('open');
}

/**
 * Close the settings panel
 */
export function closeSettings() {
  panelEl?.classList.remove('open');
  overlayEl?.classList.remove('open');
}
