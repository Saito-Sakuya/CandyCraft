/**
 * app.js — PromptCraft v2.1 Application Entry Point
 * Orchestrates all modules: API, prompt analysis, sliders, radar,
 * presets, composition, canvas, scene, style toggle, settings, history
 */

import { showToast, copyToClipboard } from './utils.js';
import { streamChat, getApiConfig, requestAnalyzeOrchestrate } from './api.js';
import {
  buildAnalysisMessages,
  buildPresetRefreshMessages,
  buildDimensionsRefreshMessages,
  buildIterationMessages,
  buildReplaceDimensionMessages,
  buildOptimizeMessages,
  buildLightingMessages,
  buildLightingRetryMessages,
  parseAnalysisResponse,
  parsePresetRefreshResponse,
  parseDimensionsRefreshResponse,
  parseDimensionReplacementResponse,
  parseLightingRecommendationEnvelope,
  parseOptimizeResponse,
} from './prompt.js';
import { initRadar, updateRadarValues, destroyRadar, refreshRadarTheme } from './radar.js';
import { renderSliders, getSliderValues, resetSliders, setValues, registerManualChangeCallback, destroySliders, refreshSliderThemes } from './sliders.js';
import { renderPresets, clearActivePreset, destroyPresets } from './presets.js';
import {
  initComposition,
  getAspectRatio,
  getCompositionData,
  getCompositionRecommendationState,
  hasManualCompositionChanges,
  applyCompositionRecommendation,
  applyCompositionData,
  setCompositionUiMode,
} from './composition.js';
import { initCanvas, updateCanvasAspect, getCanvasData, destroyCanvas } from './canvas.js';
import {
  initScene,
  getSceneData,
  destroyScene,
  getSceneRecommendationState,
  getLightTuningState,
  hasManualSceneChanges,
  applySceneRecommendation,
  applyLightingRecommendation,
  applySceneData,
  subscribeSceneState,
  getScenePreviewState,
} from './scene.js';
import { initScenePreview3D, updateScenePreview3D, destroyScenePreview3D } from './scene-preview-3d.js';
import { initStyleToggle, getStyle, refreshStyleToggleTheme } from './style-toggle.js';
import { initSettings } from './settings.js';
import { initHistory, addRecord, onSelectRecord } from './history.js';
import { initTheme } from './theme.js';
import { initTemplates } from './templates.js';
import { initUiMode } from './ui-mode.js';
import { APP_VERSION } from './version.js';
import {
  inferSceneRecommendationFromPrompt,
  mergeSceneRecommendations,
  applySceneRecommendationConstraints,
  hasSceneRecommendationDiff,
  formatSceneRecommendationDiffText,
} from './scene-recommendation.js';
import {
  inferCompositionRecommendationFromPrompt,
  mergeCompositionRecommendations,
  hasCompositionRecommendationDiff,
  formatCompositionRecommendationDiffText,
} from './composition-recommendation.js';
import {
  validateLightingRecommendation,
  summarizeLightingValidation,
  detectLightingKeyNamingMode,
  classifySceneForLumens,
  applyLumensSoftCaps,
  hasLightingRecommendationDiff,
  formatLightingRecommendationDiffText,
} from './lighting-recommendation.js';

/* ============ State ============ */

const state = {
  originalPrompt: '',
  dimensions: [],
  elements: [],     // v3: combined characters + objects
  presets: [],
  optimizedPrompt: '',
  isAnalyzing: false,
  isOptimizing: false,
  isPosterMode: false,
  isPosterWorkspaceActive: false,
  isPosterInspectorOpenMobile: false,
  activePosterFloatingPanel: null,
  posterEntryReusedData: false,
  prePosterPrompt: '',
  posterDomHomes: null,
  guideCardsHideTimer: null,
  abortController: null,
  analyzeTelemetry: null,
  stepTelemetry: {},
  optimizeTelemetry: null,
  scenePreviewUnsubscribe: null,
};

/* ============ DOM Refs ============ */

const $ = (id) => document.getElementById(id);

let els = {};

function cacheDom() {
  els = {
    promptInput:      $('prompt-input'),
    posterEntryCard:  $('poster-entry-card'),
    btnAnalyze:       $('btn-analyze'),
    btnPosterMode:    $('btn-poster-mode'),
    posterModeStatus: $('poster-mode-status'),
    btnExitPosterWorkspace: $('btn-exit-poster-workspace'),
    btnOpenPosterInspector: $('btn-open-poster-inspector'),
    btnClosePosterInspector: $('btn-close-poster-inspector'),
    presetsSection:   $('presets-section'),
    presetsContainer: $('presets-container'),
    slidersSection:   $('sliders-section'),
    analysisActionSection: $('analysis-action-section'),
    slidersContainer: $('sliders-container'),
    btnResetSliders:  $('btn-reset-sliders'),
    btnRefreshPresets: $('btn-refresh-presets'),
    btnRefreshDimensions: $('btn-refresh-dimensions'),
    btnIterateAnalysis: $('btn-iterate-analysis'),
    btnReplaceDimension: $('btn-replace-dimension'),
    btnOptimize:      $('btn-optimize'),
    canvasSection:    $('canvas-section'),
    canvasBoard:      $('canvas-board'),
    layerPanel:       $('layer-panel'),
    compositionContainer: $('composition-container'),
    compositionToolbar: $('composition-toolbar'),
    templateSection: $('template-section'),
    templateContainer: $('template-container'),
    posterSlotTemplates: $('poster-slot-templates'),
    appVersion: $('app-version'),
    sceneSection:     $('scene-section'),
    sceneContainer:   $('scene-container'),
    posterInspector: $('poster-inspector'),
    posterInspectorBody: $('poster-inspector-body'),
    posterFloatingTools: $('poster-floating-tools'),
    posterFloatingPanel: $('poster-floating-panel'),
    posterFloatingTitle: $('poster-floating-title'),
    btnPosterFloatScene: $('btn-poster-float-scene'),
    btnPosterFloatDimensions: $('btn-poster-float-dimensions'),
    btnClosePosterFloating: $('btn-close-poster-floating'),
    posterFloatingScene: $('poster-floating-scene'),
    posterFloatingDimensions: $('poster-floating-dimensions'),
    posterSlotWorkflow: $('poster-slot-workflow'),
    posterSlotComposition: $('poster-slot-composition'),
    posterSlotLayers: $('poster-slot-layers'),
    posterSlotFloatingScene: $('poster-slot-floating-scene'),
    posterSlotFloatingDimensionsControls: $('poster-slot-floating-dimensions-controls'),
    posterSlotFloatingDimensionsRadar: $('poster-slot-floating-dimensions-radar'),
    posterSlotResult: $('poster-slot-result'),
    radarSection:     $('radar-section'),
    resultSection:    $('result-section'),
    resultContent:    $('result-content'),
    btnCopy:          $('btn-copy'),
    btnReoptimize:    $('btn-reoptimize'),
    loadingSection:   $('loading-section'),
    loadingText:      $('loading-text'),
    guideCards:       $('guide-cards'),
    sceneConfirmOverlay: $('scene-confirm-overlay'),
    sceneConfirmSummary: $('scene-confirm-summary'),
    sceneConfirmReason: $('scene-confirm-reason'),
    btnSceneConfirmApply: $('scene-confirm-apply'),
    btnSceneConfirmKeep: $('scene-confirm-keep'),
    analysisFormOverlay: $('analysis-form-overlay'),
    analysisFormTitle: $('analysis-form-title'),
    analysisFormDesc: $('analysis-form-desc'),
    analysisFormDimensionGroup: $('analysis-form-dimension-group'),
    analysisFormDimensionSelect: $('analysis-form-dimension-select'),
    analysisFormInputLabel: $('analysis-form-input-label'),
    analysisFormInput: $('analysis-form-input'),
    btnAnalysisFormCancel: $('analysis-form-cancel'),
    btnAnalysisFormConfirm: $('analysis-form-confirm'),
  };
}

/* ============ Initialization ============ */

function init() {
  cacheDom();
  initTheme();
  if (els.appVersion) els.appVersion.textContent = APP_VERSION;
  initUiMode({ onChange: handleUiModeChange });
  initSettings();
  initHistory();
  state.posterDomHomes = capturePosterDomHomes();
  document.body.classList.remove('poster-workspace-active');
  updatePosterModeUi(false);
  applyPosterInspectorMobileState(false);

  // Initialize composition selector (always visible in canvas)
  initComposition('composition-container', handleCompositionChange);
  initTemplates('template-container', {
    getSnapshot: buildTemplateSnapshot,
    applySnapshot: applyTemplateSnapshot,
  });

  // Initialize style toggle
  initStyleToggle('style-toggle', () => {
    // Style change doesn't require immediate action, used during analysis/optimization
  });

  // Startup config hint
  const config = getApiConfig();
  if (config.mode === 'custom') {
    const missing = getMissingCustomApiFields(config);
    if (missing.length > 0) {
      setTimeout(() => {
        showToast(`当前为用户自定义模式，请先填写：${missing.join(' / ')}`, 'info');
      }, 600);
    }
  } else {
    setTimeout(() => showToast('当前为后台托管模式，模型由服务端统一控制', 'info'), 600);
  }

  // Bind main events
  els.btnAnalyze?.addEventListener('click', handleAnalyze);
  els.btnPosterMode?.addEventListener('click', handleEnterPosterMode);
  els.btnExitPosterWorkspace?.addEventListener('click', () => exitPosterMode({ keepPrompt: false, silent: false }));
  els.btnOpenPosterInspector?.addEventListener('click', () => applyPosterInspectorMobileState(true));
  els.btnClosePosterInspector?.addEventListener('click', () => applyPosterInspectorMobileState(false));
  els.btnPosterFloatScene?.addEventListener('click', () => togglePosterFloatingPanel('scene'));
  els.btnPosterFloatDimensions?.addEventListener('click', () => togglePosterFloatingPanel('dimensions'));
  els.btnClosePosterFloating?.addEventListener('click', () => closePosterFloatingPanel());
  window.addEventListener('resize', syncPosterLayerPanelPlacement);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.isPosterMode && state.isPosterInspectorOpenMobile) {
      applyPosterInspectorMobileState(false);
      return;
    }
    if (event.key === 'Escape' && state.isPosterMode && state.activePosterFloatingPanel) {
      closePosterFloatingPanel();
    }
  });
  els.btnOptimize?.addEventListener('click', handleOptimize);
  els.btnResetSliders?.addEventListener('click', () => {
    resetSliders();
    clearActivePreset();
  });
  els.btnRefreshPresets?.addEventListener('click', handleRefreshPresets);
  els.btnRefreshDimensions?.addEventListener('click', handleRefreshDimensions);
  els.btnIterateAnalysis?.addEventListener('click', handleIterateAnalysis);
  els.btnReplaceDimension?.addEventListener('click', handleReplaceDimension);
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

  window.addEventListener('cc:theme-change', refreshThemeAwareControls);
}

/* ============ Composition Change ============ */

function handleCompositionChange(data) {
  // data may be an object {ratio, orientation} or a string
  const ratio = typeof data === 'string' ? data : getAspectRatio();
  updateCanvasAspect(ratio);
}

function handleUiModeChange(mode) {
  setCompositionUiMode(mode);
  refreshThemeAwareControls();
}

function refreshThemeAwareControls() {
  refreshStyleToggleTheme();
  refreshSliderThemes();
  refreshRadarTheme();
}

/* ============ Analysis ============ */

async function handleAnalyze() {
  const prompt = els.promptInput?.value.trim();
  if (!prompt) {
    showToast('请输入提示词', 'error');
    return;
  }
  if (!ensureApiReadyForRun()) return;

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
  state.stepTelemetry = {};
  setAnalysisToolsDisabled(true);

  // UI: show loading, hide previous results
  showLoading('正在分析提示词...');
  hideEl(els.presetsSection);
  hideEl(els.slidersSection);
  hideEl(els.analysisActionSection);
  hideEl(els.canvasSection);
  hideEl(els.sceneSection);
  hideEl(els.radarSection);
  hideEl(els.resultSection);
  // Fade out guide cards
  if (els.guideCards) {
    els.guideCards.classList.add('hiding');
    if (state.guideCardsHideTimer) {
      clearTimeout(state.guideCardsHideTimer);
      state.guideCardsHideTimer = null;
    }
    state.guideCardsHideTimer = setTimeout(() => {
      if (els.guideCards) {
        els.guideCards.style.display = 'none';
      }
      state.guideCardsHideTimer = null;
    }, 400);
  }
  els.btnAnalyze.innerHTML = '<svg width="16" height="16" class="spin"><use href="#icon-refresh"/></svg> 分析中...';

  try {
    const analysisMessages = buildAnalysisMessages(prompt, getStyle());
    const currentCompositionState = getCompositionRecommendationState();
    const currentSceneState = getSceneRecommendationState();
    const config = getApiConfig();

    state.abortController = new AbortController();

    let result = null;
    let finalCompositionRecommendation = null;
    let finalSceneRecommendation = null;
    let sceneConstraintResult = {
      recommendation: {},
      sceneConstraintApplied: false,
      constraintMode: 'none',
    };
    let lightingRecommendation = null;
    let lightingAuditMeta = {
      round2RetryUsed: false,
      keyNamingMode: 'unknown',
      lumensCappedCount: 0,
      lumensProfile: 'unknown',
    };
    let orchestrationMeta = null;

    const ruleCompositionRecommendation = inferCompositionRecommendationFromPrompt(prompt);
    const ruleSceneRecommendation = inferSceneRecommendationFromPrompt(prompt);

    if (config.mode === 'managed') {
      showLoading('正在分析提示词（托管编排）...');

      const prefilledCompositionRecommendation = mergeCompositionRecommendations({
        current: currentCompositionState,
        rule: ruleCompositionRecommendation,
        ai: null,
      });
      const prefilledSceneMerged = mergeSceneRecommendations({
        current: currentSceneState,
        rule: ruleSceneRecommendation,
        ai: null,
      });
      const prefilledSceneConstraint = applySceneRecommendationConstraints(prompt, prefilledSceneMerged);
      const prefilledSceneForModel = sanitizeSceneRecommendationForModel(prefilledSceneConstraint.recommendation || {});

      const lightingMessages = buildLightingMessages(prompt, {
        sceneRecommendation: prefilledSceneForModel,
        compositionRecommendation: prefilledCompositionRecommendation,
      });
      const retryMessages = buildLightingRetryMessages(
        prompt,
        {
          sceneRecommendation: prefilledSceneForModel,
          compositionRecommendation: prefilledCompositionRecommendation,
        },
        '请严格修复为完整四灯 JSON'
      );

      const orchestrationResponse = await requestAnalyzeOrchestrate(
        {
          roles: {
            structure: { messages: analysisMessages },
            lighting: {
              messages: lightingMessages,
              retryMessages,
            },
          },
        },
        { signal: state.abortController.signal },
      );

      orchestrationMeta = orchestrationResponse?.orchestration || null;
      const structureText = orchestrationResponse?.outputs?.structure?.content || '';
      result = parseAnalysisResponse(structureText);
      if (!result || !Array.isArray(result.dimensions) || result.dimensions.length !== 8) {
        throw new Error('托管编排返回的结构分析结果无效');
      }
      setStepTelemetry('analysis', result.__contract || {
        step: 'analysis',
        schemaVersion: 'cc.analysis.v1',
        contractValid: true,
        contractErrors: [],
        semanticConflicts: [],
        retryUsed: false,
        fallbackUsed: false,
        conflictCount: 0,
        finalSource: 'first-pass',
      });

      finalCompositionRecommendation = mergeCompositionRecommendations({
        current: currentCompositionState,
        rule: ruleCompositionRecommendation,
        ai: result.compositionRecommendation || null,
      });
      const mergedSceneRecommendation = mergeSceneRecommendations({
        current: currentSceneState,
        rule: ruleSceneRecommendation,
        ai: result.sceneRecommendation || null,
      });
      sceneConstraintResult = applySceneRecommendationConstraints(prompt, mergedSceneRecommendation);
      finalSceneRecommendation = sceneConstraintResult.recommendation || {};

      const firstText = orchestrationResponse?.outputs?.lighting?.content || '';
      const firstRound = parseLightingRoundText(firstText);
      let candidate = firstRound.recommendation;
      let validation = validateLightingRecommendation(candidate);
      lightingAuditMeta.keyNamingMode = firstRound.keyNamingMode;
      let selectedLightingContractMeta = firstRound.contractMeta || null;

      const retryUsed = orchestrationResponse?.outputs?.lightingRetry?.used === true;
      const retryText = orchestrationResponse?.outputs?.lightingRetry?.content || '';
      if ((!validation.isValid || !validation.isComplete) && retryUsed && retryText) {
        lightingAuditMeta.round2RetryUsed = true;
        const retryRound = parseLightingRoundText(retryText);
        candidate = retryRound.recommendation;
        validation = validateLightingRecommendation(candidate);
        selectedLightingContractMeta = retryRound.contractMeta || selectedLightingContractMeta;
        if (lightingAuditMeta.keyNamingMode === 'unknown') {
          lightingAuditMeta.keyNamingMode = retryRound.keyNamingMode;
        } else if (retryRound.keyNamingMode && retryRound.keyNamingMode !== 'unknown' && retryRound.keyNamingMode !== lightingAuditMeta.keyNamingMode) {
          lightingAuditMeta.keyNamingMode = `${lightingAuditMeta.keyNamingMode}->${retryRound.keyNamingMode}`;
        }
      }

      if (!validation.isValid || !validation.isComplete) {
        lightingRecommendation = null;
        setStepTelemetry('lighting', {
          ...(selectedLightingContractMeta || {}),
          contractValid: false,
          contractErrors: validation.issues || ['schema_error:invalid_lighting'],
          retryUsed: lightingAuditMeta.round2RetryUsed,
          finalSource: lightingAuditMeta.round2RetryUsed ? 'retry' : 'first-pass',
        });
        showToast('托管编排的逐灯建议不完整，已保留第一轮布光设置', 'info');
      } else {
        const lumensProfile = classifySceneForLumens(prompt, finalSceneRecommendation);
        const cappedResult = applyLumensSoftCaps(candidate, lumensProfile);
        lightingRecommendation = cappedResult.recommendation;
        lightingAuditMeta.lumensCappedCount = cappedResult.lumensCappedCount;
        lightingAuditMeta.lumensProfile = cappedResult.profile;
        if (cappedResult.lumensCappedCount > 0) {
          showToast(`逐灯流明已按 ${lumensProfile} 档位校正 (${cappedResult.lumensCappedCount} 项)`, 'info');
        }
        setStepTelemetry('lighting', {
          ...(selectedLightingContractMeta || {}),
          contractValid: true,
          contractErrors: [],
          retryUsed: lightingAuditMeta.round2RetryUsed,
          finalSource: lightingAuditMeta.round2RetryUsed ? 'retry' : 'first-pass',
        });
      }

      if (orchestrationMeta?.fallbackUsed) {
        showToast('托管编排触发了角色降级，已自动回退单模型链路', 'info');
      }
    } else {
      let fullText = '';
      await streamChat(analysisMessages, {
        onChunk: (chunk) => { fullText += chunk; },
        onDone: (text) => { fullText = text; },
        onError: (err) => { throw err; },
        signal: state.abortController.signal,
        role: 'structure',
      });

      result = parseAnalysisResponse(fullText);
      if (!result || !result.dimensions || result.dimensions.length === 0) {
        throw new Error('未能从 AI 返回中解析出调节维度，请重试');
      }
      setStepTelemetry('analysis', result.__contract || {
        step: 'analysis',
        schemaVersion: 'cc.analysis.v1',
        contractValid: true,
        contractErrors: [],
        semanticConflicts: [],
        retryUsed: false,
        fallbackUsed: false,
        conflictCount: 0,
        finalSource: 'first-pass',
      });

      finalCompositionRecommendation = mergeCompositionRecommendations({
        current: currentCompositionState,
        rule: ruleCompositionRecommendation,
        ai: result.compositionRecommendation || null,
      });

      const mergedSceneRecommendation = mergeSceneRecommendations({
        current: currentSceneState,
        rule: ruleSceneRecommendation,
        ai: result.sceneRecommendation || null,
      });
      sceneConstraintResult = applySceneRecommendationConstraints(prompt, mergedSceneRecommendation);
      finalSceneRecommendation = sceneConstraintResult.recommendation || {};
      const sceneRecommendationForModel = sanitizeSceneRecommendationForModel(finalSceneRecommendation);

      try {
        showLoading('正在分析提示词（2/2：灯光细化）...');
        const lightingMessages = buildLightingMessages(prompt, {
          sceneRecommendation: sceneRecommendationForModel,
          compositionRecommendation: finalCompositionRecommendation,
        });

        const firstRound = await requestLightingRound(lightingMessages, state.abortController.signal, 'lighting');
        let candidate = firstRound.recommendation;
        let validation = validateLightingRecommendation(candidate);
        lightingAuditMeta.keyNamingMode = firstRound.keyNamingMode;
        let selectedLightingContractMeta = firstRound.contractMeta || null;

        if (!validation.isValid || !validation.isComplete) {
          lightingAuditMeta.round2RetryUsed = true;
          showLoading('正在分析提示词（2/2：灯光纠错重试）...');

          const retryMessages = buildLightingRetryMessages(
            prompt,
            {
              sceneRecommendation: sceneRecommendationForModel,
              compositionRecommendation: finalCompositionRecommendation,
            },
            summarizeLightingValidation(validation, firstRound.parseError)
          );

          const retryRound = await requestLightingRound(retryMessages, state.abortController.signal, 'lighting');
          candidate = retryRound.recommendation;
          validation = validateLightingRecommendation(candidate);
          selectedLightingContractMeta = retryRound.contractMeta || selectedLightingContractMeta;

          if (lightingAuditMeta.keyNamingMode === 'unknown') {
            lightingAuditMeta.keyNamingMode = retryRound.keyNamingMode;
          } else if (retryRound.keyNamingMode && retryRound.keyNamingMode !== 'unknown' && retryRound.keyNamingMode !== lightingAuditMeta.keyNamingMode) {
            lightingAuditMeta.keyNamingMode = `${lightingAuditMeta.keyNamingMode}->${retryRound.keyNamingMode}`;
          }
        }

        if (!validation.isValid || !validation.isComplete) {
          lightingRecommendation = null;
          setStepTelemetry('lighting', {
            ...(selectedLightingContractMeta || {}),
            contractValid: false,
            contractErrors: validation.issues || ['schema_error:invalid_lighting'],
            retryUsed: lightingAuditMeta.round2RetryUsed,
            finalSource: lightingAuditMeta.round2RetryUsed ? 'retry' : 'first-pass',
          });
          showToast('灯光细化建议结构不完整，已保留第一轮布光设置', 'info');
        } else {
          const lumensProfile = classifySceneForLumens(prompt, finalSceneRecommendation);
          const cappedResult = applyLumensSoftCaps(candidate, lumensProfile);
          lightingRecommendation = cappedResult.recommendation;
          lightingAuditMeta.lumensCappedCount = cappedResult.lumensCappedCount;
          lightingAuditMeta.lumensProfile = cappedResult.profile;

          if (cappedResult.lumensCappedCount > 0) {
            showToast(`逐灯流明已按 ${lumensProfile} 档位校正 (${cappedResult.lumensCappedCount} 项)`, 'info');
          }
          setStepTelemetry('lighting', {
            ...(selectedLightingContractMeta || {}),
            contractValid: true,
            contractErrors: [],
            retryUsed: lightingAuditMeta.round2RetryUsed,
            finalSource: lightingAuditMeta.round2RetryUsed ? 'retry' : 'first-pass',
          });
        }
      } catch (round2Error) {
        showToast(`灯光细化阶段失败，已保留第一轮设置：${round2Error.message}`, 'info');
        lightingRecommendation = null;
        markStepFailure('lighting', 'upstream_error', round2Error.message);
      }
    }

    if (!result || !result.dimensions || result.dimensions.length === 0) {
      throw new Error('未能完成分析结果解析，请重试');
    }

    state.dimensions = result.dimensions;
    if (result.elements && result.elements.length > 0) {
      state.elements = result.elements.map((e, i) => ({
        id: e.id || `elem_${i + 1}`,
        type: e.type || 'character',
        layer: e.layer || 'foreground',
        name: e.name || `元素${i + 1}`,
        description: e.description || '',
        prompt: e.prompt || '',
        role: e.role || '',
        x: e.position?.x ?? e.x ?? 50,
        y: e.position?.y ?? e.y ?? 50,
        w: e.size?.w ?? e.w ?? 18,
        h: e.size?.h ?? e.h ?? 28,
        zIndex: i,
        focusPoint: e.focusPoint || '',
        textPassthrough: normalizeTextPassthroughState(e.textPassthrough),
        negativePrompt: normalizeNegativePromptState(e.negativePrompt),
        selected: false,
      }));
    } else {
      state.elements = (result.characters || []).map((c, i) => ({
        id: c.id || `char_${i + 1}`,
        type: 'character',
        layer: c.role === '背景' || c.role === '背景景物' ? 'background' : 'foreground',
        name: c.name || `角色${i + 1}`,
        description: c.description || '',
        prompt: '',
        role: c.role || '',
        x: c.position?.x ?? c.x ?? 50,
        y: c.position?.y ?? c.y ?? 50,
        w: c.size?.w ?? c.w ?? 18,
        h: c.size?.h ?? c.h ?? 28,
        zIndex: i,
        focusPoint: '',
        textPassthrough: normalizeTextPassthroughState(null),
        negativePrompt: normalizeNegativePromptState(null),
        selected: false,
      }));
    }
    state.presets = result.presets || [];

    state.analyzeTelemetry = {
      ...lightingAuditMeta,
      sceneConstraintApplied: sceneConstraintResult.sceneConstraintApplied,
      sceneConstraintMode: sceneConstraintResult.constraintMode,
      steps: { ...state.stepTelemetry },
      orchestration: orchestrationMeta
        ? {
            path: orchestrationMeta.path || [],
            roleStatus: orchestrationMeta.roleStatus || {},
            fallbackUsed: Boolean(orchestrationMeta.fallbackUsed),
          }
        : null,
    };

    // Render presets
    if (state.presets.length > 0) {
      renderPresets('presets-container', state.presets, handlePresetSelect);
      showEl(els.presetsSection);
    }

    // Render sliders + radar
    renderSliders('sliders-container', state.dimensions, handleSliderChange);
    initRadar('radar-chart', state.dimensions);
    showEl(els.slidersSection);
    showEl(els.analysisActionSection);
    showEl(els.radarSection);

    // Render element canvas with layer panel
    initCanvas('canvas-board', 'layer-panel', state.elements);

    if (hasCompositionRecommendationDiff(currentCompositionState, finalCompositionRecommendation)) {
      await applyCompositionRecommendationWithPolicy(currentCompositionState, finalCompositionRecommendation);
    }
    updateCanvasAspect(getAspectRatio());
    showEl(els.canvasSection);

    // Init scene panel
    initScene('scene-container');
    setupScenePreviewBinding();
    showEl(els.sceneSection);

    hideLoading();

    if (hasSceneRecommendationDiff(currentSceneState, finalSceneRecommendation)) {
      await applySceneRecommendationWithPolicy(currentSceneState, finalSceneRecommendation);
    }

    const currentLightState = getLightTuningState();
    if (lightingRecommendation && hasLightingRecommendationDiff(currentLightState, lightingRecommendation)) {
      await applyLightingRecommendationWithPolicy(currentLightState, lightingRecommendation);
    }
    showToast('分析完成，调节参数后点击优化', 'success');

  } catch (err) {
    hideLoading();
    markStepFailure('analysis', 'parse_error', err.message);
    if (err.name !== 'AbortError') {
      showToast('分析失败: ' + err.message, 'error');
    }
  } finally {
    state.isAnalyzing = false;
    setAnalysisToolsDisabled(false);
    els.btnAnalyze.innerHTML = '<svg width="16" height="16"><use href="#icon-sparkle"/></svg> 分析提示词';
  }
}

function buildPosterDefaultDimensions() {
  return [
    { name: '画面细节', description: '细节层次', min: 0, max: 100, default: 68, value: 68, labels: ['简洁', '细腻'] },
    { name: '光影层次', description: '明暗对比', min: 0, max: 100, default: 72, value: 72, labels: ['平缓', '强烈'] },
    { name: '色调氛围', description: '色彩取向', min: 0, max: 100, default: 66, value: 66, labels: ['克制', '浓郁'] },
    { name: '构图张力', description: '构图力度', min: 0, max: 100, default: 65, value: 65, labels: ['稳定', '张力'] },
    { name: '材质表现', description: '材质真实度', min: 0, max: 100, default: 61, value: 61, labels: ['概括', '写实'] },
    { name: '叙事深度', description: '叙事信息量', min: 0, max: 100, default: 58, value: 58, labels: ['直给', '隐喻'] },
    { name: '风格强度', description: '风格化程度', min: 0, max: 100, default: 70, value: 70, labels: ['克制', '鲜明'] },
    { name: '氛围渲染', description: '氛围表达', min: 0, max: 100, default: 64, value: 64, labels: ['自然', '戏剧'] },
  ];
}

function buildPosterDefaultElements() {
  return [
    {
      id: 'poster_fg_1',
      type: 'character',
      layer: 'foreground',
      name: '主体',
      description: '前景主体',
      prompt: '',
      role: '主角',
      x: 50,
      y: 58,
      w: 20,
      h: 32,
      zIndex: 1,
      focusPoint: '',
      textPassthrough: normalizeTextPassthroughState(null),
      negativePrompt: normalizeNegativePromptState(null),
      selected: false,
    },
    {
      id: 'poster_bg_1',
      type: 'object',
      layer: 'background',
      name: '背景',
      description: '后景环境',
      prompt: '',
      role: '背景景物',
      x: 50,
      y: 42,
      w: 58,
      h: 40,
      zIndex: 0,
      focusPoint: '',
      textPassthrough: normalizeTextPassthroughState(null),
      negativePrompt: normalizeNegativePromptState(null),
      selected: false,
    },
  ];
}

function buildPosterPromptFallback() {
  return 'Poster mode composition with controlled canvas size and editable layout elements.';
}

function captureDomHome(node) {
  if (!node || !node.parentNode) return null;
  return {
    node,
    parent: node.parentNode,
    nextSibling: node.nextSibling,
  };
}

function capturePosterDomHomes() {
  const promptCard = els.promptInput?.closest('.card') || null;
  return {
    promptCard: captureDomHome(promptCard),
    loadingSection: captureDomHome(els.loadingSection),
    analysisActionSection: captureDomHome(els.analysisActionSection),
    presetsSection: captureDomHome(els.presetsSection),
    slidersSection: captureDomHome(els.slidersSection),
    radarSection: captureDomHome(els.radarSection),
    sceneSection: captureDomHome(els.sceneSection),
    resultSection: captureDomHome(els.resultSection),
    compositionToolbar: captureDomHome(els.compositionToolbar),
    templateSection: captureDomHome(els.templateSection),
    layerPanel: captureDomHome(els.layerPanel),
  };
}

function moveNodeToSlot(node, slot) {
  if (!node || !slot) return;
  if (node.parentNode === slot) return;
  slot.appendChild(node);
}

function restoreNodeFromHome(home) {
  if (!home || !home.node || !home.parent) return;
  const { node, parent, nextSibling } = home;
  if (nextSibling && nextSibling.parentNode === parent) {
    parent.insertBefore(node, nextSibling);
  } else {
    parent.appendChild(node);
  }
}

function mountPosterWorkspaceNodes() {
  if (!state.posterDomHomes) {
    state.posterDomHomes = capturePosterDomHomes();
  }

  const promptCardNode = state.posterDomHomes?.promptCard?.node || null;
  moveNodeToSlot(promptCardNode, els.posterSlotWorkflow);
  moveNodeToSlot(state.posterDomHomes?.analysisActionSection?.node || null, els.posterSlotWorkflow);
  moveNodeToSlot(state.posterDomHomes?.loadingSection?.node || null, els.posterSlotWorkflow);

  moveNodeToSlot(state.posterDomHomes?.compositionToolbar?.node || null, els.posterSlotComposition);
  moveNodeToSlot(state.posterDomHomes?.templateSection?.node || null, els.posterSlotTemplates);

  moveNodeToSlot(state.posterDomHomes?.sceneSection?.node || null, els.posterSlotFloatingScene);

  moveNodeToSlot(state.posterDomHomes?.presetsSection?.node || null, els.posterSlotFloatingDimensionsControls);
  moveNodeToSlot(state.posterDomHomes?.slidersSection?.node || null, els.posterSlotFloatingDimensionsControls);
  moveNodeToSlot(state.posterDomHomes?.radarSection?.node || null, els.posterSlotFloatingDimensionsRadar);

  moveNodeToSlot(state.posterDomHomes?.resultSection?.node || null, els.posterSlotResult);
  syncPosterLayerPanelPlacement();
}

function restorePosterWorkspaceNodes() {
  if (!state.posterDomHomes) return;
  closePosterFloatingPanel();
  restoreNodeFromHome(state.posterDomHomes.layerPanel);
  restoreNodeFromHome(state.posterDomHomes.promptCard);
  restoreNodeFromHome(state.posterDomHomes.analysisActionSection);
  restoreNodeFromHome(state.posterDomHomes.loadingSection);
  restoreNodeFromHome(state.posterDomHomes.presetsSection);
  restoreNodeFromHome(state.posterDomHomes.slidersSection);
  restoreNodeFromHome(state.posterDomHomes.radarSection);
  restoreNodeFromHome(state.posterDomHomes.sceneSection);
  restoreNodeFromHome(state.posterDomHomes.resultSection);
  restoreNodeFromHome(state.posterDomHomes.compositionToolbar);
  restoreNodeFromHome(state.posterDomHomes.templateSection);
}

function setPosterFloatingPanel(nextPanel) {
  state.activePosterFloatingPanel = nextPanel || null;
  const active = state.activePosterFloatingPanel;

  els.posterFloatingPanel?.classList.toggle('hidden', !active);
  els.posterFloatingTools?.classList.toggle('hidden', !state.isPosterWorkspaceActive);
  els.posterFloatingScene?.classList.toggle('hidden', active !== 'scene');
  els.posterFloatingDimensions?.classList.toggle('hidden', active !== 'dimensions');
  els.btnPosterFloatScene?.classList.toggle('active', active === 'scene');
  els.btnPosterFloatDimensions?.classList.toggle('active', active === 'dimensions');

  if (els.posterFloatingTitle) {
    els.posterFloatingTitle.textContent = active === 'dimensions' ? '维度与雷达' : '场景控制';
  }

  if (active === 'scene') {
    expandPosterSceneFloatingGroups();
  }
}

function togglePosterFloatingPanel(panel) {
  if (!state.isPosterWorkspaceActive) return;
  setPosterFloatingPanel(state.activePosterFloatingPanel === panel ? null : panel);
}

function closePosterFloatingPanel() {
  setPosterFloatingPanel(null);
}

function expandPosterSceneFloatingGroups() {
  const groups = els.posterSlotFloatingScene?.querySelectorAll('.scene-fold');
  groups?.forEach((group) => {
    if (group instanceof HTMLDetailsElement) {
      group.open = true;
    }
  });
}

function shouldUseMobilePosterInspector() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function syncPosterLayerPanelPlacement() {
  if (!state.isPosterWorkspaceActive || !state.posterDomHomes?.layerPanel) return;
  if (shouldUseMobilePosterInspector()) {
    moveNodeToSlot(state.posterDomHomes.layerPanel.node, els.posterSlotLayers);
    return;
  }
  restoreNodeFromHome(state.posterDomHomes.layerPanel);
}

function applyPosterInspectorMobileState(open) {
  state.isPosterInspectorOpenMobile = Boolean(open);
  if (!els.posterInspector) return;
  els.posterInspector.classList.toggle('open', state.isPosterInspectorOpenMobile);
}

function applyPosterWorkspaceLayout(active) {
  state.isPosterWorkspaceActive = Boolean(active);
  document.body.classList.toggle('poster-workspace-active', state.isPosterWorkspaceActive);
  if (!els.posterInspector) return;

  if (state.isPosterWorkspaceActive) {
    mountPosterWorkspaceNodes();
    els.posterInspector.classList.remove('hidden');
    els.posterFloatingTools?.classList.remove('hidden');
  } else {
    applyPosterInspectorMobileState(false);
    closePosterFloatingPanel();
    els.posterFloatingTools?.classList.add('hidden');
    els.posterInspector.classList.add('hidden');
    restorePosterWorkspaceNodes();
  }
}

function resetPosterInspectorGroupState() {
  const groups = els.posterInspectorBody?.querySelectorAll('.poster-group');
  if (!groups) return;
  groups.forEach((group) => {
    if (!(group instanceof HTMLDetailsElement)) return;
    const cls = group.className || '';
    group.open = cls.includes('poster-group-workflow') ||
      cls.includes('poster-group-composition') ||
      cls.includes('poster-group-result') ||
      cls.includes('poster-group-templates') ||
      (shouldUseMobilePosterInspector() && cls.includes('poster-group-layers'));
  });
}

function handleEnterPosterMode() {
  if (state.isAnalyzing || state.isOptimizing) return;

  if (state.isPosterMode) {
    exitPosterMode({ keepPrompt: false, silent: false });
    return;
  }

  const reuseCurrentData = hasReusablePosterSource();
  state.prePosterPrompt = (els.promptInput?.value || '').trim();
  state.posterEntryReusedData = reuseCurrentData;
  state.isPosterMode = true;

  if (!reuseCurrentData) {
    state.originalPrompt = buildPosterPromptFallback();
    state.dimensions = buildPosterDefaultDimensions();
    state.elements = buildPosterDefaultElements();
    state.presets = [];

    if (els.promptInput) {
      els.promptInput.value = state.originalPrompt;
      els.promptInput.style.height = 'auto';
      els.promptInput.style.height = Math.min(els.promptInput.scrollHeight, 400) + 'px';
    }
  }

  if (reuseCurrentData && els.promptInput && !els.promptInput.value.trim()) {
    els.promptInput.value = state.originalPrompt || state.prePosterPrompt || '';
  }

  updatePosterModeUi(true);
  applyPosterWorkspaceLayout(true);
  resetPosterInspectorGroupState();
  hideEl(els.posterEntryCard);

  if (els.guideCards) {
    els.guideCards.classList.add('hiding');
    if (state.guideCardsHideTimer) {
      clearTimeout(state.guideCardsHideTimer);
      state.guideCardsHideTimer = null;
    }
    state.guideCardsHideTimer = setTimeout(() => {
      if (els.guideCards) {
        els.guideCards.style.display = 'none';
      }
      state.guideCardsHideTimer = null;
    }, 300);
  }
  hideEl(els.loadingSection);
  if (reuseCurrentData) {
    showPosterSectionsForCurrentData();
    setupScenePreviewBinding();
  } else {
    hideEl(els.presetsSection);
    hideEl(els.resultSection);
    renderSliders('sliders-container', state.dimensions, handleSliderChange);
    initRadar('radar-chart', state.dimensions);
    showEl(els.slidersSection);
    showEl(els.analysisActionSection);
    showEl(els.radarSection);

    initCanvas('canvas-board', 'layer-panel', state.elements);
    updateCanvasAspect(getAspectRatio());
    showEl(els.canvasSection);

    initScene('scene-container');
    setupScenePreviewBinding();
    showEl(els.sceneSection);
  }
  applyPosterInspectorMobileState(false);

  showToast(reuseCurrentData ? '已携带当前分析数据进入海报模式' : '已进入海报模式，可直接编辑画布与尺寸', 'success');
}

function hasReusablePosterSource() {
  return Boolean(
    state.originalPrompt ||
    state.dimensions.length > 0 ||
    state.elements.length > 0 ||
    state.optimizedPrompt
  );
}

function showPosterSectionsForCurrentData() {
  if (state.dimensions.length > 0) {
    showEl(els.slidersSection);
    showEl(els.analysisActionSection);
    showEl(els.radarSection);
  }
  if (state.presets.length > 0) showEl(els.presetsSection);
  showEl(els.canvasSection);
  showEl(els.sceneSection);
  if (state.optimizedPrompt) showEl(els.resultSection);
  updateCanvasAspect(getAspectRatio());
  syncPosterLayerPanelPlacement();
}

function exitPosterMode({ keepPrompt = false, silent = false } = {}) {
  if (!state.isPosterMode) return;

  const shouldPreserveCurrentData = state.posterEntryReusedData;
  state.isPosterMode = false;
  updatePosterModeUi(false);
  applyPosterWorkspaceLayout(false);
  showEl(els.posterEntryCard);

  const restoredPrompt = keepPrompt
    ? ((els.promptInput?.value || '').trim() || state.prePosterPrompt)
    : state.prePosterPrompt;

  if (els.promptInput) {
    els.promptInput.value = restoredPrompt || '';
    els.promptInput.style.height = 'auto';
    els.promptInput.style.height = Math.min(els.promptInput.scrollHeight, 400) + 'px';
  }
  if (!keepPrompt && !shouldPreserveCurrentData) {
    state.presets = [];
    state.originalPrompt = '';
    state.dimensions = [];
    state.elements = [];
    hideEl(els.presetsSection);
    hideEl(els.slidersSection);
    hideEl(els.analysisActionSection);
    hideEl(els.radarSection);
    hideEl(els.canvasSection);
    hideEl(els.sceneSection);
    hideEl(els.resultSection);
    teardownScenePreviewBinding();
    destroyScene();
    destroyCanvas();
    destroyRadar();
    destroyPresets();
    destroySliders();
    if (els.guideCards) {
      if (state.guideCardsHideTimer) {
        clearTimeout(state.guideCardsHideTimer);
        state.guideCardsHideTimer = null;
      }
      els.guideCards.style.display = '';
      els.guideCards.classList.remove('hiding');
    }
  } else if (shouldPreserveCurrentData) {
    showPosterSectionsForCurrentData();
  }

  state.prePosterPrompt = '';
  state.posterEntryReusedData = false;
  if (!silent) {
    showToast('已退出海报模式，恢复普通分析流程', 'info');
  }
}

function updatePosterModeUi(inPosterMode) {
  if (els.btnPosterMode) {
    els.btnPosterMode.innerHTML = inPosterMode
      ? '<svg width="16" height="16"><use href="#icon-close"/></svg> 退出海报模式'
      : '<svg width="16" height="16"><use href="#icon-frame"/></svg> 进入海报模式';
    els.btnPosterMode.classList.toggle('btn-primary', inPosterMode);
    els.btnPosterMode.classList.toggle('btn-secondary', !inPosterMode);
  }
  if (els.posterModeStatus) {
    els.posterModeStatus.classList.toggle('hidden', !inPosterMode);
  }
  if (els.btnOpenPosterInspector) {
    els.btnOpenPosterInspector.classList.toggle('hidden', !inPosterMode);
  }
}

async function requestChatText(messages, { signal = undefined, role = 'structure' } = {}) {
  let fullText = '';
  await streamChat(messages, {
    onChunk: (chunk) => { fullText += chunk; },
    onDone: (text) => { fullText = text; },
    onError: (err) => { throw err; },
    signal,
    role,
  });
  return fullText;
}

function setStepTelemetry(step, meta = {}) {
  if (!step) return;
  state.stepTelemetry[step] = {
    ...meta,
    step,
  };
}

function markStepFailure(step, errorType, detail = '') {
  setStepTelemetry(step, {
    contractValid: false,
    contractErrors: [errorType],
    semanticConflicts: [],
    retryUsed: false,
    fallbackUsed: false,
    finalSource: 'failed',
    detail: String(detail || '').slice(0, 240),
  });
}

function getExactTextList(elements = []) {
  if (!Array.isArray(elements)) return [];
  return elements
    .map((item) => item?.textPassthrough?.enabled ? String(item.textPassthrough.text || '').trim() : '')
    .filter(Boolean);
}

function getNegativePromptList(canvasData = {}) {
  const entries = [];
  const globalNegative = normalizeNegativePromptState(canvasData.canvasNegativePrompt);
  if (globalNegative.enabled) {
    entries.push({ scope: 'global', text: globalNegative.text });
  }
  for (const item of Array.isArray(canvasData.elements) ? canvasData.elements : []) {
    const negative = normalizeNegativePromptState(item?.negativePrompt);
    if (!negative.enabled) continue;
    entries.push({
      scope: 'object',
      elementId: item.id || '',
      elementName: item.name || '',
      elementLayer: item.layer || '',
      text: negative.text,
    });
  }
  return entries;
}

function normalizeTextPassthroughState(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = String(source.text || '');
  const typographyHint = String(source.typographyHint || '');
  return {
    enabled: Boolean(source.enabled && text.trim()),
    text,
    typographyHint,
  };
}

function normalizeNegativePromptState(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = String(source.text || '');
  return {
    enabled: Boolean(source.enabled && text.trim()),
    text,
  };
}

function buildAnalysisSnapshot() {
  const canvasData = getCanvasData();
  const snapshotElements = canvasData.elements?.length ? canvasData.elements : state.elements;
  return {
    dimensions: state.dimensions.map((item) => ({ ...item })),
    elements: snapshotElements.map((item) => ({
      id: item.id,
      type: item.type,
      layer: item.layer,
      name: item.name,
      description: item.description,
      prompt: item.prompt,
      role: item.role,
      position: { x: item.x, y: item.y },
      size: { w: item.w, h: item.h },
      zIndex: item.zIndex,
      focusPoint: item.focusPoint || '',
      textPassthrough: normalizeTextPassthroughState(item.textPassthrough),
      negativePrompt: normalizeNegativePromptState(item.negativePrompt),
    })),
    canvasNegativePrompt: canvasData.canvasNegativePrompt,
    presets: state.presets.map((item) => ({ ...item })),
    sceneRecommendation: getSceneRecommendationState(),
    compositionRecommendation: getCompositionRecommendationState(),
  };
}

function buildTemplateSnapshot() {
  const canvasData = getCanvasData();
  return {
    composition: getCompositionData(),
    elements: canvasData.elements,
    links: canvasData.links,
    canvasNegativePrompt: canvasData.canvasNegativePrompt,
    scene: getScenePreviewState(),
    dimensions: state.dimensions.map((item) => ({ ...item })),
  };
}

function applyTemplateSnapshot(template) {
  if (!template || typeof template !== 'object') {
    showToast('模板数据无效', 'error');
    return false;
  }

  const nextDimensions = Array.isArray(template.dimensions) ? template.dimensions : [];
  const nextElements = Array.isArray(template.elements) ? template.elements : [];
  const nextLinks = Array.isArray(template.links) ? template.links : [];

  applyCompositionData(template.composition, { markManual: true });
  updateCanvasAspect(getAspectRatio());

  state.dimensions = nextDimensions.map((item) => ({ ...item }));
  if (state.dimensions.length > 0) {
    renderSliders('sliders-container', state.dimensions, handleSliderChange);
    initRadar('radar-chart', state.dimensions);
    showEl(els.slidersSection);
    showEl(els.analysisActionSection);
    showEl(els.radarSection);
  }

  state.elements = nextElements.map((item, index) => ({
    ...item,
    id: item.id || `tpl_elem_${index + 1}`,
    zIndex: item.zIndex ?? index,
    textPassthrough: normalizeTextPassthroughState(item.textPassthrough),
    negativePrompt: normalizeNegativePromptState(item.negativePrompt),
  }));
  initCanvas('canvas-board', 'layer-panel', {
    elements: state.elements,
    links: nextLinks,
    canvasNegativePrompt: normalizeNegativePromptState(template.canvasNegativePrompt),
  });
  updateCanvasAspect(getAspectRatio());
  showEl(els.canvasSection);
  syncPosterLayerPanelPlacement();

  initScene('scene-container');
  if (template.scene) {
    applySceneData(template.scene, { markManual: true });
  }
  setupScenePreviewBinding();
  showEl(els.sceneSection);

  if (!state.originalPrompt) {
    state.originalPrompt = state.isPosterMode ? buildPosterPromptFallback() : 'Template based prompt composition.';
  }
  clearActivePreset();
  return true;
}

function setAnalysisToolsDisabled(disabled) {
  const list = [
    els.btnAnalyze,
    els.btnRefreshPresets,
    els.btnRefreshDimensions,
    els.btnIterateAnalysis,
    els.btnReplaceDimension,
  ];
  for (const btn of list) {
    if (!btn) continue;
    btn.disabled = Boolean(disabled);
  }
}

function ensureAnalyzedState() {
  if (!state.originalPrompt || !Array.isArray(state.dimensions) || state.dimensions.length !== 8) {
    showToast('请先完成一次分析（并生成8个维度）', 'error');
    return false;
  }
  return true;
}

async function handleRefreshPresets() {
  if (!ensureAnalyzedState()) return;
  if (!ensureApiReadyForRun()) return;
  if (state.isAnalyzing || state.isOptimizing) return;

  try {
    state.isAnalyzing = true;
    setAnalysisToolsDisabled(true);
    showLoading('正在独立刷新预设方案...');

    const messages = buildPresetRefreshMessages(
      state.originalPrompt,
      buildAnalysisSnapshot(),
      getStyle()
    );

    const fullText = await requestChatText(messages);
    const parsed = parsePresetRefreshResponse(fullText, state.dimensions);
    if (!parsed || !Array.isArray(parsed.presets) || parsed.presets.length === 0) {
      throw new Error('预设刷新结果格式无效');
    }
    setStepTelemetry('presets_refresh', parsed.__contract || {
      contractValid: false,
      contractErrors: ['schema_error:missing_contract_meta'],
      finalSource: 'fallback',
    });

    state.presets = parsed.presets;
    renderPresets('presets-container', state.presets, handlePresetSelect);
    showEl(els.presetsSection);
    showToast('预设方案已刷新', 'success');
  } catch (err) {
    markStepFailure('presets_refresh', 'parse_error', err.message);
    showToast(`预设刷新失败: ${err.message}`, 'error');
  } finally {
    hideLoading();
    state.isAnalyzing = false;
    setAnalysisToolsDisabled(false);
  }
}

async function handleRefreshDimensions() {
  if (!ensureAnalyzedState()) return;
  if (!ensureApiReadyForRun()) return;
  if (state.isAnalyzing || state.isOptimizing) return;

  try {
    state.isAnalyzing = true;
    setAnalysisToolsDisabled(true);
    showLoading('正在独立刷新维度...');

    const messages = buildDimensionsRefreshMessages(
      state.originalPrompt,
      buildAnalysisSnapshot(),
      getStyle()
    );

    const fullText = await requestChatText(messages);
    const parsed = parseDimensionsRefreshResponse(fullText);
    if (!parsed || !Array.isArray(parsed.dimensions) || parsed.dimensions.length !== 8) {
      throw new Error('维度刷新结果格式无效');
    }
    setStepTelemetry('dimensions_refresh', parsed.__contract || {
      contractValid: false,
      contractErrors: ['schema_error:missing_contract_meta'],
      finalSource: 'fallback',
    });

    state.dimensions = parsed.dimensions;
    renderSliders('sliders-container', state.dimensions, handleSliderChange);
    initRadar('radar-chart', state.dimensions);

    state.presets = [];
    hideEl(els.presetsSection);
    clearActivePreset();
    showToast('维度已刷新（8项），请按需再刷新预设', 'success');
  } catch (err) {
    markStepFailure('dimensions_refresh', 'parse_error', err.message);
    showToast(`维度刷新失败: ${err.message}`, 'error');
  } finally {
    hideLoading();
    state.isAnalyzing = false;
    setAnalysisToolsDisabled(false);
  }
}

async function handleIterateAnalysis() {
  if (!ensureAnalyzedState()) return;
  if (!ensureApiReadyForRun()) return;
  if (state.isAnalyzing || state.isOptimizing) return;

  const modalResult = await openAnalysisFormDialog({
    mode: 'iterate',
    dimensions: state.dimensions,
  });
  if (!modalResult) return;
  if (!modalResult.inputText) {
    return;
  }

  try {
    state.isAnalyzing = true;
    setAnalysisToolsDisabled(true);
    showLoading('正在执行迭代分析...');

    const messages = buildIterationMessages(
      state.originalPrompt,
      buildAnalysisSnapshot(),
      modalResult.inputText,
      getStyle()
    );

    const fullText = await requestChatText(messages);
    const parsed = parseAnalysisResponse(fullText);
    if (!parsed || !Array.isArray(parsed.dimensions) || parsed.dimensions.length !== 8) {
      throw new Error('迭代结果格式无效');
    }
    setStepTelemetry('iteration_analysis', parsed.__contract || {
      contractValid: true,
      finalSource: 'first-pass',
      schemaVersion: 'cc.analysis.v1',
      contractErrors: [],
      semanticConflicts: [],
    });

    state.dimensions = parsed.dimensions;
    state.presets = parsed.presets || [];

    if (parsed.elements?.length) {
      state.elements = parsed.elements.map((item, i) => ({
        id: item.id || `elem_${i + 1}`,
        type: item.type || 'character',
        layer: item.layer || 'foreground',
        name: item.name || `元素${i + 1}`,
        description: item.description || '',
        prompt: item.prompt || '',
        role: item.role || '',
        x: item.position?.x ?? item.x ?? 50,
        y: item.position?.y ?? item.y ?? 50,
        w: item.size?.w ?? item.w ?? 18,
        h: item.size?.h ?? item.h ?? 28,
        zIndex: i,
        focusPoint: item.focusPoint || '',
        textPassthrough: normalizeTextPassthroughState(item.textPassthrough),
        negativePrompt: normalizeNegativePromptState(item.negativePrompt),
        selected: false,
      }));
      initCanvas('canvas-board', 'layer-panel', state.elements);
      updateCanvasAspect(getAspectRatio());
    }

    renderSliders('sliders-container', state.dimensions, handleSliderChange);
    initRadar('radar-chart', state.dimensions);
    if (state.presets.length > 0) {
      renderPresets('presets-container', state.presets, handlePresetSelect);
      showEl(els.presetsSection);
    } else {
      hideEl(els.presetsSection);
    }
    clearActivePreset();
    showToast('迭代分析完成', 'success');
  } catch (err) {
    markStepFailure('iteration_analysis', 'parse_error', err.message);
    showToast(`迭代分析失败: ${err.message}`, 'error');
  } finally {
    hideLoading();
    state.isAnalyzing = false;
    setAnalysisToolsDisabled(false);
  }
}

async function handleReplaceDimension() {
  if (!ensureAnalyzedState()) return;
  if (!ensureApiReadyForRun()) return;
  if (state.isAnalyzing || state.isOptimizing) return;

  const modalResult = await openAnalysisFormDialog({
    mode: 'modify',
    dimensions: state.dimensions,
  });
  if (!modalResult) return;
  const targetIndex = modalResult.targetIndex;
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= state.dimensions.length) {
    showToast('目标维度无效', 'error');
    return;
  }
  const replaceRequest = modalResult.inputText || '';

  try {
    state.isAnalyzing = true;
    setAnalysisToolsDisabled(true);
    showLoading('正在修改单个维度...');

    const targetName = state.dimensions[targetIndex].name;
    const messages = buildReplaceDimensionMessages(
      state.originalPrompt,
      buildAnalysisSnapshot(),
      targetName,
      replaceRequest,
      getStyle()
    );

    const fullText = await requestChatText(messages);
    const parsed = parseDimensionReplacementResponse(fullText);
    if (!parsed?.dimension) {
      throw new Error('维度替换结果格式无效');
    }
    setStepTelemetry('dimension_replace', parsed.__contract || {
      contractValid: false,
      contractErrors: ['schema_error:missing_contract_meta'],
      finalSource: 'fallback',
    });

    const nextName = parsed.dimension.name;
    const duplicated = state.dimensions.some((item, idx) => idx !== targetIndex && item.name === nextName);
    if (duplicated) {
      throw new Error(`新维度名与现有维度重复: ${nextName}`);
    }

    const nextDimensions = state.dimensions.map((item, idx) => (idx === targetIndex ? parsed.dimension : item));
    if (nextDimensions.length !== 8) {
      throw new Error('替换后维度数量异常');
    }

    state.dimensions = nextDimensions;
    renderSliders('sliders-container', state.dimensions, handleSliderChange);
    initRadar('radar-chart', state.dimensions);

    state.presets = [];
    hideEl(els.presetsSection);
    clearActivePreset();
    showToast(`已修改维度：${targetName} -> ${nextName}（仍保持8项）`, 'success');
  } catch (err) {
    markStepFailure('dimension_replace', 'parse_error', err.message);
    showToast(`维度修改失败: ${err.message}`, 'error');
  } finally {
    hideLoading();
    state.isAnalyzing = false;
    setAnalysisToolsDisabled(false);
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
  if (!ensureApiReadyForRun()) return;

  state.isOptimizing = true;
  setAnalysisToolsDisabled(true);
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
    const exactTexts = getExactTextList(canvasData.elements);
    const negativePrompts = getNegativePromptList(canvasData);

    const messages = buildOptimizeMessages(state.originalPrompt, {
      dimensions,
      composition,
      elements: canvasData.elements,
      links: canvasData.links,
      scene: sceneData,
      style: getStyle(),
      canvasNegativePrompt: canvasData.canvasNegativePrompt,
    });

    let fullText = '';

    state.abortController = new AbortController();
    const config = getApiConfig();
    let serverNormalizeContract = null;
    if (config.mode === 'managed') {
      const orchestrationResponse = await requestAnalyzeOrchestrate(
        {
          roles: {
            normalize: {
              messages,
              context: {
                composition,
                scene: sceneData,
                exactTexts,
                negativePrompts,
              },
            },
          },
        },
        { signal: state.abortController.signal },
      );
      fullText = orchestrationResponse?.outputs?.normalize?.content || '';
      serverNormalizeContract = orchestrationResponse?.outputs?.normalize?.contract || null;
      const normalizeRoleStatus = orchestrationResponse?.orchestration?.roleStatus?.normalize;
      if (normalizeRoleStatus) {
        setStepTelemetry('optimize_server_gate', {
          step: 'optimize_server_gate',
          schemaVersion: 'cc.optimize.v1',
          contractValid: Boolean(normalizeRoleStatus.contractValid),
          contractErrors: normalizeRoleStatus.contractErrors || [],
          semanticConflicts: normalizeRoleStatus.semanticConflicts || [],
          retryUsed: normalizeRoleStatus.detail === 'retry',
          fallbackUsed: normalizeRoleStatus.detail !== 'first-pass',
          conflictCount: (normalizeRoleStatus.semanticConflicts || []).length,
          finalSource: normalizeRoleStatus.detail || 'unknown',
        });
      }
    } else {
      await streamChat(messages, {
        onChunk: (chunk) => { fullText += chunk; },
        onDone: (text) => { fullText = text; },
        onError: (err) => { throw err; },
        signal: state.abortController.signal,
        role: 'normalize',
      });
    }

    const parsedOptimize = parseOptimizeResponse(fullText, {
      composition,
      scene: sceneData,
      exactTexts,
      negativePrompts,
    });
    const finalPrompt = serverNormalizeContract?.finalPrompt || parsedOptimize?.finalPrompt || '';
    if (!parsedOptimize || !finalPrompt) {
      throw new Error('优化结果不符合合同且无法降级解析');
    }

    state.optimizeTelemetry = parsedOptimize.contractMeta || null;
    setStepTelemetry('optimize', parsedOptimize.contractMeta || {
      contractValid: false,
      contractErrors: ['schema_error:missing_contract_meta'],
      finalSource: 'fallback',
    });

    state.optimizedPrompt = finalPrompt;
    if (typeof marked !== 'undefined') {
      els.resultContent.innerHTML = marked.parse(finalPrompt);
    } else {
      els.resultContent.textContent = finalPrompt;
    }

    addRecord({
      originalPrompt: state.originalPrompt,
      optimizedPrompt: finalPrompt,
      dimensions: state.dimensions.map((d) => ({ ...d })),
      timestamp: Date.now(),
    });

    if (parsedOptimize.contractMeta?.contractValid === false) {
      showToast('优化输出触发合同降级，已回退兼容解析', 'info');
    }
    if ((parsedOptimize.contractMeta?.semanticConflicts || []).length > 0) {
      showToast(`优化结果检测到 ${parsedOptimize.contractMeta.semanticConflicts.length} 项语义冲突，请复核`, 'info');
    }

    hideLoading();
    showToast('优化完成', 'success');

  } catch (err) {
    hideLoading();
    markStepFailure('optimize', 'upstream_error', err.message);
    if (err.name !== 'AbortError') {
      showToast('优化失败: ' + err.message, 'error');
    }
  } finally {
    state.isOptimizing = false;
    setAnalysisToolsDisabled(false);
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
  if (state.isPosterMode) {
    exitPosterMode({ keepPrompt: false, silent: true });
  }

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
    showEl(els.analysisActionSection);
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

function sanitizeSceneRecommendationForModel(reco) {
  if (!reco || typeof reco !== 'object') return {};
  const next = {};
  const allowed = ['timeOfDay', 'lightingPreset', 'colorTemp', 'lightQuality', 'cameraPreset', 'reason'];
  for (const key of allowed) {
    const value = reco[key];
    if (typeof value === 'string' && value.trim()) {
      next[key] = value.trim();
    }
  }
  return next;
}

function parseLightingRoundText(text) {
  const envelope = parseLightingRecommendationEnvelope(text || '');
  return {
    recommendation: envelope.recommendation,
    parseError: envelope.parseError,
    keyNamingMode: detectLightingKeyNamingMode(envelope.raw),
    contractMeta: envelope.contractMeta || null,
  };
}

async function requestLightingRound(messages, signal, role = 'lighting') {
  let fullText = '';
  await streamChat(messages, {
    onChunk: (chunk) => { fullText += chunk; },
    onDone: (text) => { fullText = text; },
    onError: () => {},
    signal,
    role,
  });
  return parseLightingRoundText(fullText);
}

/* ============ Recommendation Policy ============ */

function openAnalysisFormDialog({ mode = 'iterate', dimensions = [] } = {}) {
  return new Promise((resolve) => {
    const overlay = els.analysisFormOverlay;
    const titleEl = els.analysisFormTitle;
    const descEl = els.analysisFormDesc;
    const dimensionGroupEl = els.analysisFormDimensionGroup;
    const dimensionSelectEl = els.analysisFormDimensionSelect;
    const inputLabelEl = els.analysisFormInputLabel;
    const inputEl = els.analysisFormInput;
    const btnCancel = els.btnAnalysisFormCancel;
    const btnConfirm = els.btnAnalysisFormConfirm;

    if (!overlay || !titleEl || !descEl || !dimensionGroupEl || !dimensionSelectEl || !inputLabelEl || !inputEl || !btnCancel || !btnConfirm) {
      resolve(null);
      return;
    }

    const isModifyMode = mode === 'modify';

    if (isModifyMode) {
      titleEl.textContent = '修改维度';
      descEl.textContent = '选择目标维度，并填写修改诉求（可留空使用默认诉求）。';
      inputLabelEl.textContent = '修改诉求（可选）';
      inputEl.placeholder = '例如：更强调材质质感与可控范围';
      btnConfirm.textContent = '开始修改';

      dimensionSelectEl.innerHTML = '';
      dimensions.forEach((item, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `${idx + 1}. ${item?.name || `维度${idx + 1}`}`;
        dimensionSelectEl.appendChild(opt);
      });
      dimensionSelectEl.value = '0';
      dimensionGroupEl.classList.remove('hidden');
    } else {
      titleEl.textContent = '迭代分析';
      descEl.textContent = '输入本轮迭代要求，系统将基于当前分析快照重新分析。';
      inputLabelEl.textContent = '迭代要求';
      inputEl.placeholder = '例如：增强叙事、弱化风格冲突、强化镜头控制';
      btnConfirm.textContent = '开始迭代';
      dimensionGroupEl.classList.add('hidden');
    }

    inputEl.value = '';

    const cleanup = () => {
      overlay.classList.remove('open');
      btnCancel.removeEventListener('click', onCancel);
      btnConfirm.removeEventListener('click', onConfirm);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
    };

    const finalize = (payload) => {
      cleanup();
      resolve(payload);
    };

    const onCancel = () => finalize(null);
    const onOverlayClick = (event) => {
      if (event.target === overlay) {
        finalize(null);
      }
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        finalize(null);
      }
    };
    const onConfirm = () => {
      const inputText = inputEl.value.trim();
      if (!isModifyMode && !inputText) {
        showToast('迭代要求不能为空', 'error');
        inputEl.focus();
        return;
      }
      if (isModifyMode) {
        const targetIndex = Number.parseInt(dimensionSelectEl.value, 10);
        if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= dimensions.length) {
          showToast('目标维度无效，请重新选择', 'error');
          dimensionSelectEl.focus();
          return;
        }
        finalize({ mode, targetIndex, inputText });
        return;
      }
      finalize({ mode, inputText });
    };

    btnCancel.addEventListener('click', onCancel);
    btnConfirm.addEventListener('click', onConfirm);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);
    overlay.classList.add('open');
    inputEl.focus();
  });
}

async function applyCompositionRecommendationWithPolicy(currentCompositionState, nextRecommendation) {
  const diffText = formatCompositionRecommendationDiffText(currentCompositionState, nextRecommendation);

  if (hasManualCompositionChanges()) {
    const shouldApply = await openRecommendationConfirm({
      title: '检测到新的构图建议',
      description: '你已手动调整过构图方向或比例，再次分析将产生冲突。',
      diffText,
      reasonText: nextRecommendation?.reason || '',
    });
    if (shouldApply) {
      applyCompositionRecommendation(nextRecommendation, { source: 'user-confirmed' });
      showToast('已应用新的构图建议', 'success');
    } else {
      showToast('已保留你当前的构图设置', 'info');
    }
    return;
  }

  applyCompositionRecommendation(nextRecommendation, { source: 'auto' });
  showToast(`已自动调整构图：${diffText}`, 'info');
}

async function applySceneRecommendationWithPolicy(currentSceneState, nextRecommendation) {
  const diffText = formatSceneRecommendationDiffText(currentSceneState, nextRecommendation);

  if (hasManualSceneChanges()) {
    const shouldApply = await openRecommendationConfirm({
      title: '检测到新的场景建议',
      description: '你已手动调整过相机或布光，再次分析将产生冲突。',
      diffText,
      reasonText: nextRecommendation?.reason || '',
    });
    if (shouldApply) {
      applySceneRecommendation(nextRecommendation, { source: 'user-confirmed' });
      showToast('已应用新的相机与布光建议', 'success');
    } else {
      showToast('已保留你当前的相机与布光设置', 'info');
    }
    return;
  }

  applySceneRecommendation(nextRecommendation, { source: 'auto' });
  showToast(`已自动调整场景：${diffText}`, 'info');
}

async function applyLightingRecommendationWithPolicy(currentLightState, nextRecommendation) {
  const diffText = formatLightingRecommendationDiffText(currentLightState, nextRecommendation);

  if (hasManualSceneChanges()) {
    const shouldApply = await openRecommendationConfirm({
      title: '检测到新的逐灯建议',
      description: '你已手动调整过灯光参数，再次分析将产生冲突。',
      diffText,
      reasonText: nextRecommendation?.reason || '',
    });
    if (shouldApply) {
      applyLightingRecommendation(nextRecommendation, { source: 'user-confirmed' });
      showToast('已应用新的逐灯建议', 'success');
    } else {
      showToast('已保留你当前的逐灯设置', 'info');
    }
    return;
  }

  applyLightingRecommendation(nextRecommendation, { source: 'auto' });
  showToast(`已自动调整逐灯参数：${diffText}`, 'info');
}

function openRecommendationConfirm({ title, description, diffText, reasonText }) {
  return new Promise((resolve) => {
    const overlay = els.sceneConfirmOverlay;
    const titleEl = $('scene-confirm-title');
    const descEl = overlay?.querySelector('.scene-confirm-desc');
    const summary = els.sceneConfirmSummary;
    const reason = els.sceneConfirmReason;
    const btnApply = els.btnSceneConfirmApply;
    const btnKeep = els.btnSceneConfirmKeep;

    if (!overlay || !summary || !reason || !btnApply || !btnKeep || !titleEl || !descEl) {
      resolve(false);
      return;
    }

    titleEl.textContent = title || '检测到新的建议';
    descEl.textContent = description || '当前设置与新建议存在冲突。';
    summary.textContent = diffText || '检测到新的建议。';
    reason.textContent = reasonText ? `建议依据：${reasonText}` : '建议依据：提示词语义与场景规则。';

    const cleanup = () => {
      overlay.classList.remove('open');
      btnApply.removeEventListener('click', onApply);
      btnKeep.removeEventListener('click', onKeep);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
    };

    const finalize = (value) => {
      cleanup();
      resolve(value);
    };

    const onApply = () => finalize(true);
    const onKeep = () => finalize(false);
    const onOverlayClick = (event) => {
      if (event.target === overlay) finalize(false);
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') finalize(false);
    };

    btnApply.addEventListener('click', onApply);
    btnKeep.addEventListener('click', onKeep);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);
    overlay.classList.add('open');
  });
}

function teardownScenePreviewBinding() {
  if (typeof state.scenePreviewUnsubscribe === 'function') {
    try {
      state.scenePreviewUnsubscribe();
    } catch {
      // no-op
    }
  }
  state.scenePreviewUnsubscribe = null;
  destroyScenePreview3D();
}

function setupScenePreviewBinding() {
  teardownScenePreviewBinding();
  const host = document.getElementById('scene-3d-preview');
  if (!host) return;

  initScenePreview3D(host, getScenePreviewState());
  state.scenePreviewUnsubscribe = subscribeSceneState((snapshot) => {
    updateScenePreview3D(snapshot);
  });
}

/* ============ UI Helpers ============ */

function getMissingCustomApiFields(config) {
  if (config.mode !== 'custom') return [];
  const missing = [];
  const roleNames = ['structure', 'lighting', 'normalize'];
  for (const role of roleNames) {
    const roleConfig = config.roles?.[role] || {};
    if (!roleConfig.baseUrl) missing.push(`${role}.Base URL`);
    if (!roleConfig.apiKey) missing.push(`${role}.API Key`);
    if (!roleConfig.model) missing.push(`${role}.Model`);
  }
  return missing;
}

function ensureApiReadyForRun() {
  const config = getApiConfig();
  const missing = getMissingCustomApiFields(config);
  if (missing.length === 0) return true;
  showToast(`自定义模式缺少必填项：${missing.join(' / ')}，请先在设置中补全`, 'error');
  return false;
}

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
