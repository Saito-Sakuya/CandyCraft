/**
 * history.js — History record management
 * Stores optimization records in localStorage with CRUD operations
 */

import { generateId, formatDate, showToast } from './utils.js';

const STORAGE_KEY = 'pc_history';
const MAX_RECORDS = 50;

let selectCallback = null;
let listEl = null;
let panelEl = null;
let overlayEl = null;

/**
 * Initialize history panel: bind events, render initial list
 */
export function initHistory() {
  panelEl = document.getElementById('history-panel');
  overlayEl = document.getElementById('history-overlay');
  listEl = document.getElementById('history-list');

  const btnOpen = document.getElementById('btn-history');
  const btnClose = document.getElementById('close-history');
  const btnClear = document.getElementById('clear-history');

  btnOpen?.addEventListener('click', openHistory);
  btnClose?.addEventListener('click', closeHistory);
  overlayEl?.addEventListener('click', closeHistory);

  btnClear?.addEventListener('click', () => {
    if (getRecords().length === 0) return;
    clearHistory();
  });

  renderHistoryList();
}

/**
 * Add a new optimization record
 * @param {{ originalPrompt: string, optimizedPrompt: string, dimensions: Array, timestamp: number }}
 */
export function addRecord({ originalPrompt, optimizedPrompt, dimensions, timestamp }) {
  const records = getRecords();
  records.unshift({
    id: generateId(),
    originalPrompt,
    optimizedPrompt,
    dimensions,
    timestamp: timestamp || Date.now(),
  });

  // Prune to max
  if (records.length > MAX_RECORDS) {
    records.length = MAX_RECORDS;
  }

  saveRecords(records);
  renderHistoryList();
}

/**
 * Get all history records
 * @returns {Array}
 */
export function getRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Delete a specific record by ID
 * @param {string} id
 */
export function deleteRecord(id) {
  const records = getRecords().filter(r => r.id !== id);
  saveRecords(records);
  renderHistoryList();
}

/**
 * Clear all history records
 */
export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
  renderHistoryList();
  showToast('历史记录已清空', 'info');
}

/**
 * Open the history panel
 */
export function openHistory() {
  renderHistoryList(); // Refresh before showing
  panelEl?.classList.add('open');
  overlayEl?.classList.add('open');
}

/**
 * Close the history panel
 */
export function closeHistory() {
  panelEl?.classList.remove('open');
  overlayEl?.classList.remove('open');
}

/**
 * Register a callback for when user selects a history item
 * @param {(record: Object) => void} callback
 */
export function onSelectRecord(callback) {
  selectCallback = callback;
}

/* ---- Internal ---- */

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function renderHistoryList() {
  if (!listEl) return;

  const records = getRecords();

  if (records.length === 0) {
    listEl.innerHTML = '<div class="empty-state">暂无历史记录</div>';
    return;
  }

  listEl.innerHTML = records.map(record => `
    <div class="history-item" data-id="${record.id}">
      <div class="history-prompt">${escapeHtml(truncate(record.originalPrompt, 60))}</div>
      <div class="history-date">${formatDate(record.timestamp)}</div>
      <button class="history-delete" data-id="${record.id}" title="删除">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `).join('');

  // Bind click events
  listEl.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', (e) => {
      // Don't trigger select if clicking the delete button
      if (e.target.closest('.history-delete')) return;

      const id = el.dataset.id;
      const record = records.find(r => r.id === id);
      if (record && selectCallback) {
        selectCallback(record);
        closeHistory();
      }
    });
  });

  listEl.querySelectorAll('.history-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      deleteRecord(id);
    });
  });
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
