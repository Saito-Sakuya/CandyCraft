/**
 * templates.js — Local poster/canvas templates.
 * Keeps persistence and import/export UI out of app orchestration.
 */

import { generateId, showToast } from './utils.js';

export const TEMPLATE_VERSION = 'cc.template.v1';
const STORAGE_KEY = 'cc_templates';

let containerEl = null;
let getSnapshot = null;
let applySnapshot = null;
let fileInputEl = null;

export function initTemplates(containerId, handlers = {}) {
  containerEl = document.getElementById(containerId);
  if (!containerEl) return;
  getSnapshot = typeof handlers.getSnapshot === 'function' ? handlers.getSnapshot : null;
  applySnapshot = typeof handlers.applySnapshot === 'function' ? handlers.applySnapshot : null;
  getFileInput();
  renderTemplates();
}

export function getTemplates() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setTemplates(templates) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

function renderTemplates() {
  if (!containerEl) return;
  const templates = getTemplates();
  containerEl.innerHTML = '';

  const form = ce('div', 'template-form');
  const nameInput = ce('input', 'template-name-input');
  nameInput.type = 'text';
  nameInput.placeholder = '模板名称';
  nameInput.value = makeDefaultTemplateName();

  const saveBtn = ce('button', 'btn-primary btn-sm');
  saveBtn.type = 'button';
  saveBtn.textContent = '保存当前';
  saveBtn.addEventListener('click', () => saveCurrentTemplate(nameInput.value));

  const importBtn = ce('button', 'btn-secondary btn-sm');
  importBtn.type = 'button';
  importBtn.textContent = '导入 JSON';
  importBtn.addEventListener('click', () => getFileInput().click());

  form.appendChild(nameInput);
  form.appendChild(saveBtn);
  form.appendChild(importBtn);
  containerEl.appendChild(form);

  const list = ce('div', 'template-list');
  if (templates.length === 0) {
    const empty = ce('div', 'template-empty');
    empty.textContent = '暂无模板。保存当前画板后可在这里复用。';
    list.appendChild(empty);
  } else {
    templates.forEach((template) => list.appendChild(renderTemplateItem(template)));
  }
  containerEl.appendChild(list);
}

function renderTemplateItem(template) {
  const item = ce('article', 'template-item');
  const meta = ce('div', 'template-item-meta');
  const title = ce('strong', 'template-item-title');
  title.textContent = template.name || '未命名模板';
  const desc = ce('span', 'template-item-desc');
  desc.textContent = formatTemplateSummary(template);
  meta.appendChild(title);
  meta.appendChild(desc);

  const actions = ce('div', 'template-item-actions');
  const applyBtn = makeActionButton('应用', 'btn-primary');
  applyBtn.addEventListener('click', async () => {
    const confirmed = await openTemplateConfirm(template);
    if (!confirmed || !applySnapshot) return;
    const ok = applySnapshot(template);
    if (ok !== false) showToast(`已应用模板：${template.name || '未命名模板'}`, 'success');
  });

  const exportBtn = makeActionButton('导出', 'btn-secondary');
  exportBtn.addEventListener('click', () => exportTemplate(template));

  const deleteBtn = makeActionButton('删除', 'btn-text');
  deleteBtn.addEventListener('click', async () => {
    const confirmed = await openTemplateConfirm(template, {
      title: '删除模板',
      description: '删除后仅从当前浏览器移除，不影响已导出的 JSON 文件。',
      applyText: '删除',
    });
    if (!confirmed) return;
    setTemplates(getTemplates().filter((item) => item.id !== template.id));
    renderTemplates();
    showToast('模板已删除', 'info');
  });

  actions.appendChild(applyBtn);
  actions.appendChild(exportBtn);
  actions.appendChild(deleteBtn);
  item.appendChild(meta);
  item.appendChild(actions);
  return item;
}

function saveCurrentTemplate(rawName) {
  if (!getSnapshot) return;
  const snapshot = getSnapshot();
  const template = normalizeTemplate(
    {
      ...snapshot,
      name: String(rawName || '').trim() || makeDefaultTemplateName(),
      createdAt: new Date().toISOString(),
    },
    snapshot,
  ).template;
  const templates = [template, ...getTemplates().filter((item) => item.id !== template.id)];
  setTemplates(templates);
  renderTemplates();
  showToast(`已保存模板：${template.name}`, 'success');
}

function exportTemplate(template) {
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFileName(template.name || 'candy-template')}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getFileInput() {
  if (fileInputEl) return fileInputEl;
  fileInputEl = document.createElement('input');
  fileInputEl.id = 'template-import-file';
  fileInputEl.type = 'file';
  fileInputEl.accept = 'application/json,.json';
  fileInputEl.className = 'hidden';
  fileInputEl.addEventListener('change', handleImportFile);
  document.body.appendChild(fileInputEl);
  return fileInputEl;
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    const raw = JSON.parse(text);
    const fallback = getSnapshot ? getSnapshot() : {};
    const rawTemplates = Array.isArray(raw) ? raw : [raw];
    const normalized = rawTemplates.map((item) => normalizeTemplate(item, fallback));
    const existing = getTemplates();
    const imported = normalized.map((item) => item.template);
    setTemplates([...imported, ...existing]);
    renderTemplates();

    const migratedCount = normalized.filter((item) => item.migrated).length;
    const suffix = migratedCount > 0 ? `，其中 ${migratedCount} 个已兼容迁移` : '';
    showToast(`已导入 ${imported.length} 个模板${suffix}`, 'success');
  } catch (error) {
    showToast(`模板导入失败：${error.message}`, 'error');
  }
}

function normalizeTemplate(raw, fallback = {}) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('模板 JSON 不是对象');
  }
  const composition = normalizeComposition(raw.composition, fallback.composition);
  const canvas = raw.canvas || {};
  const sourceElements = Array.isArray(raw.elements) ? raw.elements : (Array.isArray(canvas.elements) ? canvas.elements : []);
  const migrated = raw.templateVersion !== TEMPLATE_VERSION
    || !hasCompleteComposition(raw.composition)
    || raw.canvasNegativePrompt === undefined
    || sourceElements.some((item) => item?.negativePrompt === undefined);
  const template = {
    templateVersion: TEMPLATE_VERSION,
    id: generateId(),
    name: String(raw.name || makeDefaultTemplateName()).trim(),
    createdAt: raw.createdAt || new Date().toISOString(),
    composition,
    elements: sourceElements.map(normalizeTemplateElement),
    links: Array.isArray(raw.links) ? raw.links : (Array.isArray(canvas.links) ? canvas.links : []),
    canvasNegativePrompt: normalizeNegativePrompt(raw.canvasNegativePrompt || canvas.canvasNegativePrompt || fallback.canvasNegativePrompt),
    scene: raw.scene && typeof raw.scene === 'object' ? raw.scene : (fallback.scene || null),
    dimensions: Array.isArray(raw.dimensions) ? raw.dimensions : (Array.isArray(fallback.dimensions) ? fallback.dimensions : []),
  };
  return { template, migrated };
}

function normalizeTemplateElement(item) {
  const source = item && typeof item === 'object' ? item : {};
  return {
    ...source,
    negativePrompt: normalizeNegativePrompt(source.negativePrompt),
  };
}

function normalizeNegativePrompt(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = String(source.text || '');
  return {
    enabled: Boolean(source.enabled && text.trim()),
    text,
  };
}

function normalizeComposition(composition, fallback = {}) {
  const source = composition && typeof composition === 'object' ? composition : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  return {
    sizeMode: source.sizeMode === 'custom_pixel' ? 'custom_pixel' : (base.sizeMode || 'preset_resolution'),
    ratio: source.ratio || source.baseRatio || base.ratio || '16:9',
    orientation: source.orientation || base.orientation || 'landscape',
    resolutionLongEdge: Number.parseInt(source.resolutionLongEdge || base.resolutionLongEdge || 1536, 10),
    width: Number.parseInt(source.width || base.width || 1536, 10),
    height: Number.parseInt(source.height || base.height || 864, 10),
    ratioLock: typeof source.ratioLock === 'boolean' ? source.ratioLock : (base.ratioLock ?? true),
  };
}

function hasCompleteComposition(composition) {
  if (!composition || typeof composition !== 'object') return false;
  return ['sizeMode', 'ratio', 'resolutionLongEdge', 'width', 'height', 'orientation']
    .every((key) => composition[key] !== undefined && composition[key] !== null && composition[key] !== '');
}

function openTemplateConfirm(template, options = {}) {
  return new Promise((resolve) => {
    const overlay = getTemplateConfirmOverlay();
    overlay.querySelector('.template-confirm-title').textContent = options.title || '应用模板';
    overlay.querySelector('.template-confirm-desc').textContent = options.description || '应用后会覆盖当前画板、构图、场景和维度状态。';
    overlay.querySelector('.template-confirm-name').textContent = template.name || '未命名模板';
    const cancelBtn = overlay.querySelector('.template-confirm-cancel');
    const applyBtn = overlay.querySelector('.template-confirm-apply');
    applyBtn.textContent = options.applyText || '确认应用';

    const cleanup = () => {
      overlay.classList.remove('open');
      cancelBtn.removeEventListener('click', onCancel);
      applyBtn.removeEventListener('click', onApply);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
    };
    const finalize = (value) => {
      cleanup();
      resolve(value);
    };
    const onCancel = () => finalize(false);
    const onApply = () => finalize(true);
    const onOverlayClick = (event) => {
      if (event.target === overlay) finalize(false);
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') finalize(false);
    };

    cancelBtn.addEventListener('click', onCancel);
    applyBtn.addEventListener('click', onApply);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);
    overlay.classList.add('open');
  });
}

function getTemplateConfirmOverlay() {
  let overlay = document.getElementById('template-confirm-overlay');
  if (overlay) return overlay;
  overlay = ce('div', 'overlay template-confirm-overlay');
  overlay.id = 'template-confirm-overlay';
  overlay.innerHTML = `
    <div class="template-confirm-dialog" role="dialog" aria-modal="true">
      <h3 class="template-confirm-title">应用模板</h3>
      <p class="template-confirm-desc"></p>
      <p class="template-confirm-name"></p>
      <div class="template-confirm-actions">
        <button type="button" class="btn-secondary template-confirm-cancel">取消</button>
        <button type="button" class="btn-primary template-confirm-apply">确认应用</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function formatTemplateSummary(template) {
  const c = template.composition || {};
  const size = c.width && c.height ? `${c.width} x ${c.height}px` : '未知尺寸';
  const count = Array.isArray(template.elements) ? template.elements.length : 0;
  return `${size} · ${c.ratio || '未知比例'} · ${count} 个元素`;
}

function makeDefaultTemplateName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `模板 ${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function makeActionButton(label, className) {
  const btn = ce('button', `${className} btn-sm`);
  btn.type = 'button';
  btn.textContent = label;
  return btn;
}

function safeFileName(value) {
  return String(value).trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) || 'candy-template';
}

function ce(tag, className = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}
