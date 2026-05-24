/**
 * app.js — PromptCraft v2.1 Application Entry Point
 * Orchestrates all modules: API, prompt analysis, sliders, radar,
 * presets, composition, canvas, scene, style toggle, settings, history
 */

import { showToast, copyToClipboard } from './utils.js';
import { streamChat, getApiConfig } from './api.js';
import { buildAnalysisMessages, buildOptimizeMessages, parseAnalysisResponse } from './prompt.js';
import { initRadar, updateRadarValues, destroyRadar } from './radar.js';
import { renderSliders, getSliderValues, resetSliders, setValues, registerManualChangeCallback, destroySliders } from './sliders.js';
import { renderPresets, clearActivePreset, destroyPresets } from './presets.js';
import { initComposition, getAspectRatio, getCompositionData } from './composition.js';
import { initCanvas, updateCanvasAspect, getCanvasData, addElement, destroyCanvas } from './canvas.js';
import { initScene, getSceneData, destroyScene } from './scene.js';
import { initStyleToggle, getStyle } from './style-toggle.js';
import { initSettings } from './settings.js';
import { initHistory, addRecord, onSelectRecord } from './history.js';

/* ============ State ============ */

const state = {
  originalPrompt: '',
  dimensions: [],
  elements: [],     // v3: combined characters + objects
  presets: [],
  optimizedPrompt: '',
  isAnalyzing: false,
  isOptimizing: false,
  abortController: null,
};

/* ============ DOM Refs ============ */

const $ = (id) => document.getElementById(id);

let els = {};

function cacheDom() {
  els = {
    promptInput:      $('prompt-input'),
    btnAnalyze:       $('btn-analyze'),
    presetsSection:   $('presets-section'),
    presetsContainer: $('presets-container'),
    slidersSection:   $('sliders-section'),
    slidersContainer: $('sliders-container'),
    btnResetSliders:  $('btn-reset-sliders'),
    btnOptimize:      $('btn-optimize'),
    canvasSection:    $('canvas-section'),
    canvasBoard:      $('canvas-board'),
    layerPanel:       $('layer-panel'),
    sceneSection:     $('scene-section'),
    sceneContainer:   $('scene-container'),
    radarSection:     $('radar-section'),
    resultSection:    $('result-section'),
    resultContent:    $('result-content'),
    btnCopy:          $('btn-copy'),
    btnReoptimize:    $('btn-reoptimize'),
    loadingSection:   $('loading-section'),
    loadingText:      $('loading-text'),
    guideCards:       $('guide-cards'),
  };
}

/* ============ Initialization ============ */

function init() {
  cacheDom();
  initSettings();
  initHistory();

  // Initialize composition selector (always visible in canvas)
  initComposition('composition-container', handleCompositionChange);

  // Initialize style toggle
  initStyleToggle('style-toggle', () => {
    // Style change doesn't require immediate action, used during analysis/optimization
  });

  // Check API config
  const config = getApiConfig();
  if (!config.apiKey || !config.baseUrl) {
    setTimeout(() => showToast('请先点击左上角齿轮图标配置 API', 'info'), 600);
  }

  // Bind main events
  els.btnAnalyze?.addEventListener('click', handleAnalyze);
  els.btnOptimize?.addEventListener('click', handleOptimize);
  els.btnResetSliders?.addEventListener('click', () => {
    resetSliders();
    clearActivePreset();
  });
  els.btnCopy?.addEventListener('click', handleCopy);
  els.btnReoptimize?.addEventListener('click', handleOptimize);

  // When user manually drags a slider, deselect active preset
  registerManualChangeCallback(() => {
    clearActivePreset();
  });

  // History record selection
  onSelectRecord(handleHistorySelect);

  // Textarea auto-resize
  els.promptInput?.addEventListener('input', () => {
    const ta = els.promptInput;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 400) + 'px';
  });
}

/* ============ Composition Change ============ */

function handleCompositionChange(data) {
  // data may be an object {ratio, orientation} or a string
  const ratio = typeof data === 'string' ? data : getAspectRatio();
  updateCanvasAspect(ratio);
}

/* ============ Analysis ============ */

async function handleAnalyze() {
  const prompt = els.promptInput?.value.trim();
  if (!prompt) {
    showToast('请输入提示词', 'error');
    return;
  }

  const config = getApiConfig();
  if (!config.apiKey || !config.baseUrl) {
    showToast('请先配置 API 地址和 Key', 'error');
    return;
  }

  // Debounce: prevent double-click
  if (state.isAnalyzing) {
    // Already running — abort and cancel
    if (state.abortController) {
      state.abortController.abort();
      state.abortController = null;
    }
    return;
  }

  state.originalPrompt = prompt;
  state.isAnalyzing = true;

  // UI: show loading, hide previous results
  showLoading('正在分析提示词...');
  hideEl(els.presetsSection);
  hideEl(els.slidersSection);
  hideEl(els.canvasSection);
  hideEl(els.sceneSection);
  hideEl(els.radarSection);
  hideEl(els.resultSection);
  // Fade out guide cards
  if (els.guideCards) {
    els.guideCards.classList.add('hiding');
    setTimeout(() => { els.guideCards.style.display = 'none'; }, 400);
  }
  els.btnAnalyze.disabled = true;
  els.btnAnalyze.innerHTML = '<svg width="16" height="16" class="spin"><use href="#icon-refresh"/></svg> 分析中...';

  try {
    const messages = buildAnalysisMessages(prompt, getStyle());
    let fullText = '';

    state.abortController = new AbortController();

    await streamChat(messages, {
      onChunk: (chunk) => { fullText += chunk; },
      onDone: (text) => { fullText = text; },
      onError: (err) => { throw err; },
      signal: state.abortController.signal,
    });

    // Parse the AI response (v2 format: object with dimensions, characters, presets)
    const result = parseAnalysisResponse(fullText);
    if (!result || !result.dimensions || result.dimensions.length === 0) {
      throw new Error('未能从 AI 返回中解析出调节维度，请重试');
    }

    state.dimensions = result.dimensions;
    // v3: merge characters + objects into elements (backward compat)
    if (result.elements) {
      state.elements = result.elements;
    } else {
      // Old format: characters only → map to elements
      state.elements = (result.characters || []).map(c => ({
        ...c,
        type: 'character',
        layer: c.role === '背景' ? 'background' : 'foreground',
        x: c.position?.x ?? c.x ?? 50,
        y: c.position?.y ?? c.y ?? 50,
        w: c.size?.w ?? c.w ?? 18,
        h: c.size?.h ?? c.h ?? 28,
      }));
    }
    state.presets = result.presets || [];

    // Render presets
    if (state.presets.length > 0) {
      renderPresets('presets-container', state.presets, handlePresetSelect);
      showEl(els.presetsSection);
    }

    // Render sliders + radar
    renderSliders('sliders-container', state.dimensions, handleSliderChange);
    initRadar('radar-chart', state.dimensions);
    showEl(els.slidersSection);
    showEl(els.radarSection);

    // Render element canvas with layer panel
    initCanvas('canvas-board', 'layer-panel', state.elements);
    updateCanvasAspect(getAspectRatio());
    showEl(els.canvasSection);

    // Init scene panel
    initScene('scene-container');
    showEl(els.sceneSection);

    hideLoading();
    showToast('分析完成，调节参数后点击优化', 'success');

  } catch (err) {
    hideLoading();
    if (err.name !== 'AbortError') {
      showToast('分析失败: ' + err.message, 'error');
    }
  } finally {
    state.isAnalyzing = false;
    els.btnAnalyze.disabled = false;
    els.btnAnalyze.innerHTML = '<svg width="16" height="16"><use href="#icon-sparkle"/></svg> 分析提示词';
  }
}

/* ============ Preset Select ============ */

function handlePresetSelect(valuesMap) {
  // Batch-set sliders
  setValues(valuesMap);
  // Radar updates via slider change callback
}

/* ============ Slider Change ============ */

function handleSliderChange(dimensions) {
  state.dimensions = dimensions;
  updateRadarValues(dimensions);
}

/* ============ Optimization ============ */

async function handleOptimize() {
  if (!state.dimensions.length) {
    showToast('请先分析提示词', 'error');
    return;
  }

  const config = getApiConfig();
  if (!config.apiKey || !config.baseUrl) {
    showToast('请先配置 API 地址和 Key', 'error');
    return;
  }

  state.isOptimizing = true;
  showLoading('正在优化提示词...');
  showEl(els.resultSection);
  els.resultContent.innerHTML = '<div class="shimmer-bg" style="height:20px;border-radius:8px;margin-bottom:8px"></div><div class="shimmer-bg" style="height:20px;border-radius:8px;width:80%"></div>';

  els.btnOptimize.disabled = true;
  els.btnOptimize.innerHTML = '<svg width="16" height="16" class="spin"><use href="#icon-refresh"/></svg> 优化中...';

  try {
    const dimensions = getSliderValues();
    const canvasData = getCanvasData();
    const sceneData = getSceneData();
    const composition = getCompositionData();

    const messages = buildOptimizeMessages(state.originalPrompt, {
      dimensions,
      composition,
      elements: canvasData.elements,
      links: canvasData.links,
      scene: sceneData,
      style: getStyle(),
    });

    let fullText = '';

    state.abortController = new AbortController();

    await streamChat(messages, {
      onChunk: (chunk) => {
        fullText += chunk;
        if (typeof marked !== 'undefined') {
          els.resultContent.innerHTML = marked.parse(fullText);
        } else {
          els.resultContent.textContent = fullText;
        }
      },
      onDone: (text) => {
        fullText = text;
        if (typeof marked !== 'undefined') {
          els.resultContent.innerHTML = marked.parse(fullText);
        } else {
          els.resultContent.textContent = fullText;
        }
        state.optimizedPrompt = fullText;

        // Save to history
        addRecord({
          originalPrompt: state.originalPrompt,
          optimizedPrompt: fullText,
          dimensions: state.dimensions.map(d => ({ ...d })),
          timestamp: Date.now(),
        });
      },
      onError: (err) => { throw err; },
      signal: state.abortController.signal,
    });

    hideLoading();
    showToast('优化完成', 'success');

  } catch (err) {
    hideLoading();
    if (err.name !== 'AbortError') {
      showToast('优化失败: ' + err.message, 'error');
    }
  } finally {
    state.isOptimizing = false;
    els.btnOptimize.disabled = false;
    els.btnOptimize.innerHTML = '<svg width="16" height="16"><use href="#icon-sparkle"/></svg> 优化提示词';
  }
}

/* ============ Copy ============ */

async function handleCopy() {
  if (!state.optimizedPrompt) {
    showToast('暂无可复制内容', 'info');
    return;
  }
  const ok = await copyToClipboard(state.optimizedPrompt);
  showToast(ok ? '已复制到剪贴板' : '复制失败，请手动复制', ok ? 'success' : 'error');
}

/* ============ History Select ============ */

function handleHistorySelect(record) {
  // Restore prompt
  if (els.promptInput) {
    els.promptInput.value = record.originalPrompt || '';
    els.promptInput.style.height = 'auto';
    els.promptInput.style.height = Math.min(els.promptInput.scrollHeight, 400) + 'px';
  }

  // Restore dimensions
  if (record.dimensions && record.dimensions.length > 0) {
    state.originalPrompt = record.originalPrompt || '';
    state.dimensions = record.dimensions;

    renderSliders('sliders-container', record.dimensions, handleSliderChange);
    initRadar('radar-chart', record.dimensions);
    showEl(els.slidersSection);
    showEl(els.radarSection);
  }

  // Restore optimized result
  if (record.optimizedPrompt) {
    state.optimizedPrompt = record.optimizedPrompt;
    if (typeof marked !== 'undefined') {
      els.resultContent.innerHTML = marked.parse(record.optimizedPrompt);
    } else {
      els.resultContent.textContent = record.optimizedPrompt;
    }
    showEl(els.resultSection);
  }
}

/* ============ UI Helpers ============ */

function showLoading(text) {
  if (els.loadingText) els.loadingText.textContent = text;
  showEl(els.loadingSection);
}

function hideLoading() {
  hideEl(els.loadingSection);
}

function showEl(el) {
  if (!el) return;
  el.style.display = '';
  el.classList.add('fade-in');
  void el.offsetWidth;
}

function hideEl(el) {
  if (!el) return;
  el.style.display = 'none';
  el.classList.remove('fade-in');
}

/* ============ Boot ============ */

document.addEventListener('DOMContentLoaded', init);
