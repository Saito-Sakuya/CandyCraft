/**
 * settings.js — Settings panel management
 * Dual mode:
 * - managed: /api/chat proxy, model only
 * - custom: browser direct with baseUrl/apiKey/model
 */

import { getApiConfig, setApiConfig, testConnection, cleanupLegacyApiConfig } from './api.js';
import { showToast } from './utils.js';

let panelEl = null;
let overlayEl = null;
let modeRadios = [];
let managedSectionEl = null;
let customSectionEl = null;
let managedModelInput = null;
let customBaseUrlInput = null;
let customApiKeyInput = null;
let customModelInput = null;
let customKeyToggleBtn = null;

const MODE_MANAGED = 'managed';
const MODE_CUSTOM = 'custom';

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
  modeRadios = Array.from(document.querySelectorAll('input[name="api-mode"]'));
  managedSectionEl = document.getElementById('managed-config-section');
  customSectionEl = document.getElementById('custom-config-section');
  managedModelInput = document.getElementById('managed-model-name');
  customBaseUrlInput = document.getElementById('custom-api-base-url');
  customApiKeyInput = document.getElementById('custom-api-key');
  customModelInput = document.getElementById('custom-model-name');
  customKeyToggleBtn = document.getElementById('toggle-custom-key-visibility');

  cleanupLegacyApiConfig();

  const config = getApiConfig();
  setInitialValues(config);
  renderModeSection(config.mode);

  btnOpen?.addEventListener('click', openSettings);
  btnClose?.addEventListener('click', closeSettings);
  overlayEl?.addEventListener('click', closeSettings);

  for (const radio of modeRadios) {
    radio.addEventListener('change', () => {
      renderModeSection(getSelectedMode());
    });
  }

  customKeyToggleBtn?.addEventListener('click', () => {
    if (!customApiKeyInput) return;
    const isHidden = customApiKeyInput.type === 'password';
    customApiKeyInput.type = isHidden ? 'text' : 'password';
    customKeyToggleBtn.innerHTML = isHidden
      ? '<svg width="18" height="18"><use href="#icon-eye-off"/></svg>'
      : '<svg width="18" height="18"><use href="#icon-eye"/></svg>';
  });

  btnSave?.addEventListener('click', () => {
    const draft = collectDraftConfig();
    if (draft.mode === MODE_CUSTOM) {
      const missing = getMissingCustomFields(draft);
      if (missing.length > 0) {
        showToast(`请先填写：${missing.join(' / ')}`, 'error');
        return;
      }
    }

    setApiConfig(draft);
    showToast(
      draft.mode === MODE_MANAGED ? '已保存后台托管模式配置' : '已保存用户自定义模式配置',
      'success'
    );
    closeSettings();
  });

  btnTest?.addEventListener('click', async () => {
    btnTest.disabled = true;
    btnTest.textContent = '测试中...';

    const draft = collectDraftConfig();
    const result = await testConnection(draft);

    btnTest.disabled = false;
    btnTest.textContent = '测试连接';
    showToast(result.message, result.success ? 'success' : 'error');
  });
}

function getSelectedMode() {
  const checked = modeRadios.find((radio) => radio.checked);
  return checked?.value === MODE_CUSTOM ? MODE_CUSTOM : MODE_MANAGED;
}

function renderModeSection(mode) {
  const isCustom = mode === MODE_CUSTOM;
  managedSectionEl?.classList.toggle('hidden', isCustom);
  customSectionEl?.classList.toggle('hidden', !isCustom);
}

function setInitialValues(config) {
  const mode = config.mode === MODE_CUSTOM ? MODE_CUSTOM : MODE_MANAGED;
  for (const radio of modeRadios) {
    radio.checked = radio.value === mode;
  }

  if (managedModelInput) managedModelInput.value = config.managedModel || '';
  if (customBaseUrlInput) customBaseUrlInput.value = config.customBaseUrl || '';
  if (customApiKeyInput) customApiKeyInput.value = config.customApiKey || '';
  if (customModelInput) customModelInput.value = config.customModel || '';
}

function collectDraftConfig() {
  return {
    mode: getSelectedMode(),
    managedModel: managedModelInput?.value.trim() || '',
    customBaseUrl: customBaseUrlInput?.value.trim() || '',
    customApiKey: customApiKeyInput?.value.trim() || '',
    customModel: customModelInput?.value.trim() || '',
  };
}

function getMissingCustomFields(config) {
  const missing = [];
  if (!config.customBaseUrl) missing.push('Base URL');
  if (!config.customApiKey) missing.push('API Key');
  if (!config.customModel) missing.push('Model');
  return missing;
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
