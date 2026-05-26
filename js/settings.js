/**
 * settings.js — Settings panel management
 * Dual mode:
 * - managed: /api/* proxy, backend controls secrets/models
 * - custom: browser direct with role-based baseUrl/apiKey/model
 */

import { getApiConfig, setApiConfig, testConnection, cleanupLegacyApiConfig } from './api.js';
import { showToast } from './utils.js';

let panelEl = null;
let overlayEl = null;
let modeRadios = [];
let managedSectionEl = null;
let customSectionEl = null;

const ROLE_KEYS = ['structure', 'lighting', 'normalize'];
const roleRefs = {
  structure: { baseUrl: null, apiKey: null, model: null, toggle: null },
  lighting: { baseUrl: null, apiKey: null, model: null, toggle: null },
  normalize: { baseUrl: null, apiKey: null, model: null, toggle: null },
};

const MODE_MANAGED = 'managed';
const MODE_CUSTOM = 'custom';

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

  roleRefs.structure.baseUrl = document.getElementById('role-structure-base-url');
  roleRefs.structure.apiKey = document.getElementById('role-structure-api-key');
  roleRefs.structure.model = document.getElementById('role-structure-model');
  roleRefs.structure.toggle = document.getElementById('toggle-role-structure-key-visibility');

  roleRefs.lighting.baseUrl = document.getElementById('role-lighting-base-url');
  roleRefs.lighting.apiKey = document.getElementById('role-lighting-api-key');
  roleRefs.lighting.model = document.getElementById('role-lighting-model');
  roleRefs.lighting.toggle = document.getElementById('toggle-role-lighting-key-visibility');

  roleRefs.normalize.baseUrl = document.getElementById('role-normalize-base-url');
  roleRefs.normalize.apiKey = document.getElementById('role-normalize-api-key');
  roleRefs.normalize.model = document.getElementById('role-normalize-model');
  roleRefs.normalize.toggle = document.getElementById('toggle-role-normalize-key-visibility');

  cleanupLegacyApiConfig();

  const config = getApiConfig();
  setInitialValues(config);
  renderModeSection(config.mode);

  btnOpen?.addEventListener('click', openSettings);
  btnClose?.addEventListener('click', closeSettings);
  overlayEl?.addEventListener('click', closeSettings);

  for (const radio of modeRadios) {
    radio.addEventListener('change', () => {
      const mode = getSelectedMode();
      renderModeSection(mode);
      setApiConfig({ mode });
    });
  }

  for (const role of ROLE_KEYS) {
    const refs = roleRefs[role];
    refs.toggle?.addEventListener('click', () => {
      const isHidden = refs.apiKey?.type === 'password';
      if (refs.apiKey) refs.apiKey.type = isHidden ? 'text' : 'password';
      refs.toggle.innerHTML = isHidden
        ? '<svg width="18" height="18"><use href="#icon-eye-off"/></svg>'
        : '<svg width="18" height="18"><use href="#icon-eye"/></svg>';
    });
  }

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
      draft.mode === MODE_MANAGED ? '已保存后台托管模式配置' : '已保存用户自定义多角色配置',
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

  for (const role of ROLE_KEYS) {
    const refs = roleRefs[role];
    const roleConfig = config.roles?.[role] || {};
    if (refs.baseUrl) refs.baseUrl.value = roleConfig.baseUrl || '';
    if (refs.apiKey) refs.apiKey.value = roleConfig.apiKey || '';
    if (refs.model) refs.model.value = roleConfig.model || '';
  }
}

function collectDraftConfig() {
  const roles = {};
  for (const role of ROLE_KEYS) {
    const refs = roleRefs[role];
    roles[role] = {
      baseUrl: refs.baseUrl?.value.trim() || '',
      apiKey: refs.apiKey?.value.trim() || '',
      model: refs.model?.value.trim() || '',
    };
  }

  return {
    mode: getSelectedMode(),
    roles,
  };
}

function getMissingCustomFields(config) {
  const missing = [];
  for (const role of ROLE_KEYS) {
    const roleConfig = config.roles?.[role] || {};
    if (!roleConfig.baseUrl) missing.push(`${role}.Base URL`);
    if (!roleConfig.apiKey) missing.push(`${role}.API Key`);
    if (!roleConfig.model) missing.push(`${role}.Model`);
  }
  return missing;
}

export function openSettings() {
  panelEl?.classList.add('open');
  overlayEl?.classList.add('open');
}

export function closeSettings() {
  panelEl?.classList.remove('open');
  overlayEl?.classList.remove('open');
}
