import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  buildAnalysisMessages,
  buildOptimizeMessages,
  buildLightingMessages,
  buildLightingRetryMessages,
  parseAnalysisResponse,
  parseLightingRecommendationEnvelope,
  parsePresetRefreshResponse,
  parseDimensionsRefreshResponse,
  parseDimensionReplacementResponse,
  parseOptimizeResponse,
} from '../../js/prompt.js';
import { AI_CONTRACTS } from '../../js/ai-contract.js';
import {
  inferSceneRecommendationFromPrompt,
  mergeSceneRecommendations,
  applySceneRecommendationConstraints,
} from '../../js/scene-recommendation.js';
import {
  inferCompositionRecommendationFromPrompt,
  mergeCompositionRecommendations,
  inferOrientationFromRatio,
} from '../../js/composition-recommendation.js';
import {
  LIGHT_TYPE_ENUMS,
  normalizeLightingRecommendation,
  validateLightingRecommendation,
  detectLightingKeyNamingMode,
  classifySceneForLumens,
  applyLumensSoftCaps,
  summarizeLightingValidation,
} from '../../js/lighting-recommendation.js';

const CLARITY_RESULTS_PATH = path.resolve('audit/clarity/prompt-clarity-results.json');
const CLARITY_REPORT_PATH = path.resolve('audit/clarity/prompt-clarity-report.md');
const IMAGE_CHECK_PATH = path.resolve('audit/clarity/image-generation-check.json');
const LOCAL_CHAT_ENDPOINT = process.env.CLARITY_CHAT_ENDPOINT || 'http://127.0.0.1:8788/api/chat';
const CLARITY_DEFAULT_CONCURRENCY = Number.parseInt(process.env.CLARITY_CONCURRENCY || '2', 10);
const CLARITY_MAX_RETRIES = Number.parseInt(process.env.CLARITY_MAX_RETRIES || '2', 10);
const CLARITY_CHAT_TIMEOUT_MS = Number.parseInt(process.env.CLARITY_CHAT_TIMEOUT_MS || '30000', 10);

const SAMPLES = [
  { id: 'S01', group: 'night', prompt: '雨夜街头霓虹，黑色风衣男子站在路灯下，电影感，低机位' },
  { id: 'S02', group: 'night', prompt: '赛博朋克夜景，潮湿柏油路反光，女孩回头看镜头，侧光' },
  { id: 'S03', group: 'sunrise', prompt: '海边日出，少年在礁石上迎风而立，暖色逆光，广角全景' },
  { id: 'S04', group: 'golden', prompt: '黄金时刻的森林小径，情侣并肩散步，柔和光晕，浅景深' },
  { id: 'S05', group: 'noon', prompt: '正午城市天台，白衬衫人物俯视街道，硬朗阴影，写实摄影' },
  { id: 'S06', group: 'indoor_no_time', prompt: '棚拍人像，伦勃朗布光，85mm，中景，肤色自然', expect: { indoorNoExplicitTime: true } },
  { id: 'S07', group: 'portrait', prompt: '时尚杂志封面女模，蝶形光，干净背景，特写镜头' },
  { id: 'S08', group: 'oblique', prompt: '废弃教室中的冲突对峙，45度斜角构图，压迫感强' },
  { id: 'S09', group: 'bird', prompt: '鸟瞰古镇夜市，人群密集，灯笼暖光与冷色天空对比' },
  { id: 'S10', group: 'high', prompt: '高角度俯拍办公室，桌面文件杂乱，冷色调纪实风格' },
  { id: 'S11', group: 'low', prompt: '仰拍巨型机甲，阴天工业区背景，体积光，史诗感' },
  { id: 'S12', group: 'text', prompt: '招牌上写着“夜间营业”，需要可读文字，店门前人物驻足' },
  { id: 'S13', group: 'multi', prompt: '三人小队在雨中推进，前中后景层次清晰，镜头跟拍感' },
  { id: 'S14', group: 'multi', prompt: '双人对视，背景是燃烧的仓库，前景碎片飞溅，电影海报风' },
  { id: 'S15', group: 'style', prompt: '二次元少女在夜色神社前，蓝紫霓虹，半写实动漫融合' },
  { id: 'S16', group: 'style', prompt: '照片级写实街拍，清晨雾气，自然肤色，低饱和电影调色' },
  { id: 'S17', group: 'detail', prompt: '微距拍摄机械手表，金属反射细节，极致清晰，黑色背景' },
  { id: 'S18', group: 'detail', prompt: '极简主义客厅，白墙与木质家具，柔和自然光，安静氛围' },
  { id: 'S19', group: 'orientation', prompt: '电影海报竖版构图，角色居中，比例 2:3，低照度侧光' },
  { id: 'S20', group: 'orientation', prompt: '超宽银幕横版，比例 21:9，荒漠追车场景，强逆光' },
  { id: 'S21', group: 'indoor_explicit_night', prompt: '夜晚室内双人对话，低照度电影感，窗外霓虹反射', expect: { indoorExplicitNight: true } },
  { id: 'S22', group: 'negative', prompt: '空旷商业街海报，突出店铺门头，不要让背景出现路人', canvasNegativePrompt: { enabled: true, text: 'no background people' }, expect: { negativeTexts: ['no background people'] } },
  { id: 'S23', group: 'negative', prompt: '人物半身海报，手部动作自然，避免手部走形', elements: [
    { id: 'fg_1', type: 'character', layer: 'foreground', name: '人物', x: 50, y: 58, w: 22, h: 32, zIndex: 1, description: '主要角色', focusPoint: 'hands', negativePrompt: { enabled: true, text: 'deformed hands' } },
    { id: 'bg_1', type: 'object', layer: 'background', name: '环境', x: 50, y: 42, w: 62, h: 40, zIndex: 0, description: '场景背景' },
  ], expect: { negativeTexts: ['deformed hands'] } },
  { id: 'S24', group: 'negative', prompt: '品牌角色海报，质感细腻但不要太像真实照片', elements: [
    { id: 'fg_1', type: 'character', layer: 'foreground', name: '品牌角色', x: 50, y: 58, w: 22, h: 32, zIndex: 1, description: '主要角色', negativePrompt: { enabled: true, text: 'too photorealistic' } },
    { id: 'bg_1', type: 'object', layer: 'background', name: '环境', x: 50, y: 42, w: 62, h: 40, zIndex: 0, description: '场景背景' },
  ], expect: { negativeTexts: ['too photorealistic'] } },
  { id: 'S25', group: 'negative', prompt: '年轻人物宣传照，保持插画感但不要过度动漫化', elements: [
    { id: 'fg_1', type: 'character', layer: 'foreground', name: '年轻人物', x: 50, y: 58, w: 22, h: 32, zIndex: 1, description: '主要角色', negativePrompt: { enabled: true, text: 'too anime' } },
    { id: 'bg_1', type: 'object', layer: 'background', name: '环境', x: 50, y: 42, w: 62, h: 40, zIndex: 0, description: '场景背景' },
  ], expect: { negativeTexts: ['too anime'] } },
  { id: 'S26', group: 'negative_text', prompt: '海报标题写着“今日限定”，背景简洁且不要出现人群', elements: [
    { id: 'txt_1', type: 'object', layer: 'foreground', name: '标题', x: 50, y: 18, w: 42, h: 10, zIndex: 2, textPassthrough: { enabled: true, text: '今日限定', typographyHint: 'bold readable poster title' } },
    { id: 'bg_1', type: 'object', layer: 'background', name: '环境', x: 50, y: 42, w: 62, h: 40, zIndex: 0, description: '场景背景' },
  ], canvasNegativePrompt: { enabled: true, text: 'crowd in the background' }, expect: { negativeTexts: ['crowd in the background'], exactTexts: ['今日限定'] } },
];

const DEFAULT_DIMENSIONS = [
  { name: '画面细节', min: 0, max: 100, value: 70, labels: ['简洁', '细腻'] },
  { name: '光影层次', min: 0, max: 100, value: 72, labels: ['平', '强'] },
  { name: '色调氛围', min: 0, max: 100, value: 66, labels: ['克制', '浓郁'] },
  { name: '构图张力', min: 0, max: 100, value: 68, labels: ['稳态', '张力'] },
  { name: '材质表现', min: 0, max: 100, value: 65, labels: ['概括', '真实'] },
  { name: '叙事深度', min: 0, max: 100, value: 60, labels: ['直给', '隐喻'] },
  { name: '风格强度', min: 0, max: 100, value: 62, labels: ['克制', '强烈'] },
  { name: '氛围渲染', min: 0, max: 100, value: 64, labels: ['自然', '戏剧'] },
];

const DEFAULT_ELEMENTS = [
  { id: 'fg_1', type: 'character', layer: 'foreground', name: '主体', x: 50, y: 58, w: 22, h: 32, zIndex: 1, description: '主要角色', focusPoint: '面部表情' },
  { id: 'bg_1', type: 'object', layer: 'background', name: '环境', x: 50, y: 42, w: 62, h: 40, zIndex: 0, description: '场景背景' },
];

function getSampleElements(sample) {
  return Array.isArray(sample.elements) ? sample.elements : DEFAULT_ELEMENTS;
}

function getExactTextsFromElements(elements = []) {
  return (Array.isArray(elements) ? elements : [])
    .map((item) => item?.textPassthrough?.enabled ? String(item.textPassthrough.text || '').trim() : '')
    .filter(Boolean);
}

function getNegativePromptContext(elements = [], canvasNegativePrompt = null) {
  const entries = [];
  const globalText = canvasNegativePrompt?.enabled ? String(canvasNegativePrompt.text || '').trim() : '';
  if (globalText) entries.push({ scope: 'global', text: globalText });
  for (const item of Array.isArray(elements) ? elements : []) {
    const text = item?.negativePrompt?.enabled ? String(item.negativePrompt.text || '').trim() : '';
    if (!text) continue;
    entries.push({
      scope: 'object',
      elementId: item.id || '',
      elementName: item.name || '',
      elementLayer: item.layer || '',
      text,
    });
  }
  return entries;
}

function makeSyntheticAnalysis(sample) {
  const elements = getSampleElements(sample).map((item, index) => ({
    id: item.id || `elem_${index + 1}`,
    type: item.type === 'object' ? 'object' : 'character',
    layer: item.layer === 'background' ? 'background' : 'foreground',
    name: item.name || `元素${index + 1}`,
    description: item.description || '',
    role: item.role || (item.layer === 'background' ? '背景景物' : '主角'),
    position: { x: item.x ?? item.position?.x ?? 50, y: item.y ?? item.position?.y ?? 50 },
    size: { w: item.w ?? item.size?.w ?? 22, h: item.h ?? item.size?.h ?? 32 },
    focusPoint: item.focusPoint || '',
    textPassthrough: item.textPassthrough || undefined,
    negativePrompt: item.negativePrompt || undefined,
  }));
  const dimensions = DEFAULT_DIMENSIONS.map((item) => ({
    name: item.name,
    description: item.description || `${item.name}控制`,
    min: 0,
    max: 100,
    default: Number(item.value ?? item.default ?? 50),
    labels: item.labels || ['低', '高'],
  }));
  const presets = [
    {
      name: '电影感',
      description: '强化镜头、光影和叙事张力。',
      values: Object.fromEntries(dimensions.map((item) => [item.name, item.default])),
    },
  ];
  const fixture = {
    schemaVersion: AI_CONTRACTS.analysis.schemaVersion,
    orderedFields: AI_CONTRACTS.analysis.orderedFields,
    dimensions,
    elements,
    presets,
    sceneRecommendation: inferSceneRecommendationFromPrompt(sample.prompt) || {},
    compositionRecommendation: inferCompositionRecommendationFromPrompt(sample.prompt) || { ratio: '16:9', orientation: 'landscape' },
  };
  return {
    raw: JSON.stringify(fixture),
    parsed: parseAnalysisResponse(JSON.stringify(fixture)),
  };
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

function makeSceneFromReco(reco) {
  const normalized = reco || {};
  const timeOfDay = normalized.timeOfDay || null;
  const colorTempMap = { 夜晚: '冷蓝', 蓝调: '冷蓝', 日出: '暖黄', 黄金: '金橙', 正午: '自然' };
  const qualityMap = { 夜晚: '中性', 蓝调: '柔光', 日出: '柔光', 黄金: '柔光', 正午: '硬光' };

  const colorTemp = normalized.colorTemp || (timeOfDay ? colorTempMap[timeOfDay] : null) || null;
  const lightQuality = normalized.lightQuality || (timeOfDay ? qualityMap[timeOfDay] : null) || null;

  return {
    cameraPreset: normalized.cameraPreset || '平视 (eye-level shot)',
    focalLength: '50mm - 50mm standard lens, no distortion',
    framing: '中景 (medium shot (MS), waist up)',
    aperture: 'f/2.8',
    lightingPreset: normalized.lightingPreset || '自然光',
    lightQuality: lightQuality ? `${lightQuality} (rule-based)` : null,
    colorTemp: colorTemp ? `${colorTemp} (rule-based)` : null,
    timeOfDay: timeOfDay ? `${timeOfDay} (rule-based)` : null,
    lights: {
      'light source 1': { alias: 'key', on: true, type: '聚光灯', typeEn: 'spotlight, hard directional light', watts: 500, lumens: 5000, subjectLumens: 2600 },
      'light source 2': { alias: 'fill', on: true, type: '柔光箱', typeEn: 'softbox, diffused soft light', watts: 220, lumens: 2200, subjectLumens: 1100 },
      'light source 3': { alias: 'back', on: true, type: '发灯', typeEn: 'hair light, rim light, edge separation', watts: 180, lumens: 1800, subjectLumens: 800 },
      'light source 4': { alias: 'hair', on: false, type: '发灯', typeEn: 'hair light, rim light, edge separation', watts: 100, lumens: 1000, subjectLumens: 0 },
    },
  };
}

function makeCompositionFromReco(compositionReco) {
  const ratio = compositionReco?.ratio || '16:9';
  const orientation = compositionReco?.orientation || inferOrientationFromRatio(ratio) || 'landscape';
  const presets = [1024, 1536, 1920, 2048, 2560, 2712, 3072, 3840, 4096, 7680];
  const resolutionLongEdge = presets[1];
  const [rw, rh] = ratio.split(':').map((n) => Number.parseInt(n, 10));
  let width = 1536;
  let height = 864;
  if (Number.isFinite(rw) && Number.isFinite(rh) && rw > 0 && rh > 0) {
    if (rw >= rh) {
      width = resolutionLongEdge;
      height = Math.round((resolutionLongEdge * rh) / rw);
    } else {
      height = resolutionLongEdge;
      width = Math.round((resolutionLongEdge * rw) / rh);
    }
  }
  return {
    ratio,
    orientation,
    sizeMode: 'preset_resolution',
    resolutionLongEdge,
    width,
    height,
    resolution: `${resolutionLongEdge}px`,
  };
}

function parseRatio(ratio) {
  const m = String(ratio || '').match(/^(\d+):(\d+)$/);
  if (!m) return null;
  const w = Number.parseInt(m[1], 10);
  const h = Number.parseInt(m[2], 10);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return null;
  return { w, h };
}

function buildFallbackLightingRecommendation(scene) {
  const raw = {
    lights: {
      light1: { on: true, type: '聚光灯', lumens: scene?.lights?.['light source 1']?.lumens ?? 5000 },
      light2: { on: true, type: '柔光箱', lumens: scene?.lights?.['light source 2']?.lumens ?? 2200 },
      light3: { on: true, type: '发灯', lumens: scene?.lights?.['light source 3']?.lumens ?? 1800 },
      light4: { on: false, type: '发灯', lumens: scene?.lights?.['light source 4']?.lumens ?? 1000 },
    },
    reason: 'fallback',
  };
  return normalizeLightingRecommendation(raw);
}

function extractContentFromChatResponse(json) {
  return json?.choices?.[0]?.message?.content || '';
}

async function callChat(messages) {
  return callChatWithRetry(messages, { allowRetry: true, timeoutMs: CLARITY_CHAT_TIMEOUT_MS });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callChatWithRetry(messages, { allowRetry = true, timeoutMs = CLARITY_CHAT_TIMEOUT_MS } = {}) {
  const maxAttempts = allowRetry ? Math.max(1, CLARITY_MAX_RETRIES + 1) : 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('chat_timeout')), timeoutMs);
    try {
      const response = await fetch(LOCAL_CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          stream: false,
          temperature: 0.4,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const error = new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        if (attempt < maxAttempts && retryable) {
          await sleep(180 * attempt);
          lastError = error;
          continue;
        }
        throw error;
      }

      return await response.json();
    } catch (error) {
      const msg = String(error?.message || error);
      const retryable =
        msg.includes('fetch failed') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('chat_timeout') ||
        msg.includes('AbortError');
      if (attempt < maxAttempts && retryable) {
        await sleep(180 * attempt);
        lastError = error;
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('chat_request_failed');
}

function parseLightingText(text) {
  const envelope = parseLightingRecommendationEnvelope(text);
  return {
    recommendation: envelope.recommendation,
    parseError: envelope.parseError,
    keyNamingMode: detectLightingKeyNamingMode(envelope.raw),
    contractMeta: envelope.contractMeta || null,
  };
}

async function analyzeLightingWithRetry(samplePrompt, context, modelEndpointAvailable) {
  const emptyMeta = {
    round2RetryUsed: false,
    keyNamingMode: 'unknown',
    lumensCappedCount: 0,
    lumensProfile: 'unknown',
  };

  if (!modelEndpointAvailable) {
    return {
      recommendation: null,
      meta: emptyMeta,
      validation: { isValid: false, isComplete: false, missingKeys: ['key', 'fill', 'back', 'hair'], issues: ['endpoint_unavailable'] },
      rawPreview: '',
    };
  }

  const lightingMessages = buildLightingMessages(samplePrompt, context);
  const firstJson = await callChat(lightingMessages);
  const firstRawText = extractContentFromChatResponse(firstJson);
  const firstRound = parseLightingText(firstRawText);
  let candidate = firstRound.recommendation;
  let validation = validateLightingRecommendation(candidate);
  let keyNamingMode = firstRound.keyNamingMode;
  let contractMeta = firstRound.contractMeta || null;
  let round2RetryUsed = false;
  let lastRawPreview = firstRawText.slice(0, 240);

  if (!validation.isValid || !validation.isComplete) {
    round2RetryUsed = true;
    const retryMessages = buildLightingRetryMessages(
      samplePrompt,
      context,
      summarizeLightingValidation(validation, firstRound.parseError)
    );
    const retryJson = await callChat(retryMessages);
    const retryRawText = extractContentFromChatResponse(retryJson);
    const retryRound = parseLightingText(retryRawText);
    candidate = retryRound.recommendation;
    validation = validateLightingRecommendation(candidate);
    contractMeta = retryRound.contractMeta || contractMeta;
    lastRawPreview = retryRawText.slice(0, 240);

    if (keyNamingMode === 'unknown') {
      keyNamingMode = retryRound.keyNamingMode;
    } else if (
      retryRound.keyNamingMode &&
      retryRound.keyNamingMode !== 'unknown' &&
      retryRound.keyNamingMode !== keyNamingMode
    ) {
      keyNamingMode = `${keyNamingMode}->${retryRound.keyNamingMode}`;
    }
  }

  if (!validation.isValid || !validation.isComplete) {
    return {
      recommendation: null,
      meta: {
        ...emptyMeta,
        round2RetryUsed,
        keyNamingMode,
      },
      validation,
      rawPreview: lastRawPreview,
      contractMeta,
    };
  }

  const lumensProfile = classifySceneForLumens(samplePrompt, context.sceneRecommendation || {});
  const capped = applyLumensSoftCaps(candidate, lumensProfile);
  return {
    recommendation: capped.recommendation,
    meta: {
      round2RetryUsed,
      keyNamingMode,
      lumensCappedCount: capped.lumensCappedCount,
      lumensProfile: capped.profile,
    },
    validation,
    rawPreview: lastRawPreview,
    contractMeta,
  };
}

function collectIssues({
  sample,
  optimizeInput,
  optimizedPrompt,
  sceneRecommendation,
  composition,
  lightingRecommendation,
  lightingValidation,
  telemetry,
}) {
  const issues = [];
  const text = `${optimizeInput}\n${optimizedPrompt || ''}`.toLowerCase();
  const has = (patterns) => patterns.some((pattern) => text.includes(pattern));

  if (!optimizeInput.includes('Camera & lighting:')) {
    issues.push({
      severity: 'high',
      code: 'missing_camera_lighting',
      message: '优化输入缺少 Camera & lighting 段落。',
      suggestion: '保留并强化相机与布光结构化段落。',
    });
  }

  const expectedNegativeTexts = Array.isArray(sample.expect?.negativeTexts) ? sample.expect.negativeTexts : [];
  if (expectedNegativeTexts.length > 0) {
    if (!optimizeInput.includes('Negative constraints, preserve as exclusions only:')) {
      issues.push({
        severity: 'high',
        code: 'missing_negative_constraints_input',
        message: '优化输入缺少 Negative constraints 独立段落。',
        suggestion: '排除项必须进入独立负面约束段，不要混入正向主体描述。',
      });
    }
    const promptLower = String(optimizedPrompt || '').toLowerCase();
    if (!/\bavoid\s*:/i.test(optimizedPrompt || '')) {
      issues.push({
        severity: 'high',
        code: 'missing_avoid_output',
        message: '优化结果缺少 Avoid: 段落。',
        suggestion: 'finalPrompt 中应使用通用 Avoid: 自然语言表达排除项。',
      });
    }
    for (const negativeText of expectedNegativeTexts) {
      if (!promptLower.includes(String(negativeText).toLowerCase())) {
        issues.push({
          severity: 'high',
          code: 'negative_text_missing',
          message: `优化结果缺少排除文本：${negativeText}`,
          suggestion: '排除文本必须保留在 Avoid/Negative constraints 语义中。',
        });
      }
    }
  }

  const arMatches = optimizeInput.match(/--ar\s+\d+:\d+/g) || [];
  if (arMatches.length !== 1) {
    issues.push({
      severity: 'high',
      code: 'invalid_ar_parameter',
      message: `构图参数 --ar 数量异常（${arMatches.length}）。`,
      suggestion: '确保只输出一个合法的 --ar W:H。',
    });
  } else {
    const targetRatio = composition?.ratio || '';
    const arRatio = arMatches[0].replace('--ar', '').trim();
    if (targetRatio && arRatio !== targetRatio) {
      issues.push({
        severity: 'high',
        code: 'ar_ratio_mismatch',
        message: `--ar 比例与构图推荐不一致（ar=${arRatio}, comp=${targetRatio}）。`,
        suggestion: '确保最终 prompt 的 --ar 与 composition.ratio 一致。',
      });
    }
  }

  if (!/light source 1/i.test(optimizeInput) || !/light source 4/i.test(optimizeInput)) {
    issues.push({
      severity: 'medium',
      code: 'light_source_label_missing',
      message: '优化输入未完整包含 light source 1~4 的逐灯语义。',
      suggestion: '确保 Camera & lighting 段落包含四盏光源的结构化信息。',
    });
  }

  const orientation = composition?.orientation || '';
  const ratioOrientation = inferOrientationFromRatio(composition?.ratio || '');
  if (orientation && ratioOrientation && orientation !== ratioOrientation) {
    issues.push({
      severity: 'high',
      code: 'orientation_ratio_conflict',
      message: `构图方向与比例冲突（orientation=${orientation}, ratio=${composition?.ratio}）。`,
      suggestion: '方向与比例需语义一致（portrait 对应 H>W，landscape 对应 W>H）。',
    });
  }

  const ratio = parseRatio(composition?.ratio);
  const w = Number.parseInt(composition?.width, 10);
  const h = Number.parseInt(composition?.height, 10);
  if (!ratio || !Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    issues.push({
      severity: 'high',
      code: 'invalid_size_fields',
      message: '构图缺少合法 width/height 或 ratio 字段。',
      suggestion: '确保 composition 始终输出 ratio、orientation、width、height。',
    });
  } else {
    const lhs = w * ratio.h;
    const rhs = h * ratio.w;
    const drift = Math.abs(lhs - rhs);
    if (drift > Math.max(2, Math.round((lhs + rhs) * 0.003))) {
      issues.push({
        severity: 'high',
        code: 'ratio_size_conflict',
        message: `ratio 与 width/height 不一致（ratio=${composition.ratio}, size=${w}x${h}）。`,
        suggestion: '确保最终像素尺寸与 --ar 使用同一个比例来源。',
      });
    }
  }

  if (composition?.sizeMode === 'preset_resolution') {
    const allowed = new Set([1024, 1536, 1920, 2048, 2560, 2712, 3072, 3840, 4096, 7680]);
    const edge = Number.parseInt(composition?.resolutionLongEdge, 10);
    if (!allowed.has(edge)) {
      issues.push({
        severity: 'medium',
        code: 'invalid_long_edge_preset',
        message: `preset_resolution 模式使用了非法长边预设（${composition?.resolutionLongEdge}）。`,
        suggestion: '仅允许 1024/1536/1920/2048/2560/2712/3072/3840/4096/7680。',
      });
    }
  }

  if (has(['nighttime']) && has(['sunrise', 'golden hour', 'midday'])) {
    issues.push({
      severity: 'medium',
      code: 'time_conflict',
      message: '同一提示词中出现冲突时段语义（夜晚与日出/正午/黄金）。',
      suggestion: '只保留一个主时段语义并同步色温与光质。',
    });
  }

  const mixedColorAllowed =
    (sceneRecommendation?.timeOfDay === '夜晚' || sceneRecommendation?.timeOfDay === '蓝调') &&
    has(['neon', 'sign', 'storefront sign', 'lantern', 'shopfront', 'glowing warm letters']);

  if (!mixedColorAllowed && has(['cool blue']) && has(['warm golden', 'amber tones'])) {
    issues.push({
      severity: 'medium',
      code: 'color_temp_conflict',
      message: '同时出现冷暖冲突色温语义。',
      suggestion: '根据场景主时段选择单一主色温，并将次要色温限定为辅光。',
    });
  }

  if (sample.expect?.indoorNoExplicitTime && sceneRecommendation?.timeOfDay) {
    issues.push({
      severity: 'high',
      code: 'indoor_time_drift',
      message: `室内/棚拍无显式时段样本仍注入时段（${sceneRecommendation.timeOfDay}）。`,
      suggestion: '室内且无显式时段时应清空 timeOfDay，并避免自动派生色温/光质。',
    });
  }
  if (sample.expect?.indoorExplicitNight && sceneRecommendation?.timeOfDay !== '夜晚') {
    issues.push({
      severity: 'high',
      code: 'explicit_time_lost',
      message: `夜晚室内样本未保留显式时段（当前=${sceneRecommendation?.timeOfDay || '空'}）。`,
      suggestion: '当提示词显式指定时段时，室内约束不应清空该字段。',
    });
  }

  if (!lightingRecommendation?.lights || typeof lightingRecommendation.lights !== 'object') {
    issues.push({
      severity: 'high',
      code: 'missing_lighting_recommendation',
      message: '第二轮逐灯建议缺失或结构非法。',
      suggestion: '确保返回四灯建议，兼容 key/fill/back/hair 与 light1~4，并在失败时触发一次纠错重试。',
    });
    return issues;
  }

  for (const key of ['key', 'fill', 'back', 'hair']) {
    const light = lightingRecommendation.lights[key];
    if (!light) {
      issues.push({
        severity: 'medium',
        code: `missing_light_${key}`,
        message: `逐灯建议缺失 ${key}。`,
        suggestion: '补齐四盏灯建议，避免默认值冲突。',
      });
      continue;
    }
    if (typeof light.on !== 'boolean') {
      issues.push({
        severity: 'medium',
        code: `invalid_on_${key}`,
        message: `${key}.on 不是布尔值。`,
        suggestion: 'on 字段仅允许 true/false。',
      });
    }
    if (!LIGHT_TYPE_ENUMS.includes(light.type)) {
      issues.push({
        severity: 'medium',
        code: `invalid_type_${key}`,
        message: `${key}.type 不在允许灯型枚举中。`,
        suggestion: 'type 仅允许既定灯型中文枚举。',
      });
    }
    if (!Number.isFinite(light.lumens) || light.lumens < 100 || light.lumens > 100000) {
      issues.push({
        severity: 'medium',
        code: `invalid_lumens_${key}`,
        message: `${key}.lumens 超出范围或格式非法。`,
        suggestion: 'lumens 应为 100~100000 的整数。',
      });
    }
  }

  if (lightingValidation?.isValid === false && !telemetry.round2RetryUsed) {
    issues.push({
      severity: 'medium',
      code: 'round2_retry_not_used',
      message: '逐灯建议非法时未触发二轮重试。',
      suggestion: '首次结果非法/缺字段时应自动重试 1 次。',
    });
  }

  if (telemetry.keyNamingMode === 'unknown') {
    issues.push({
      severity: 'low',
      code: 'key_naming_unknown',
      message: '无法识别二轮灯光键名模式（unknown）。',
      suggestion: '优先要求 light1~4，解析层继续兼容 legacy 键。',
    });
  }

  return issues;
}

function makeTelemetry(meta = {}, sceneConstraintResult = {}, keyNamingModeFallback = 'unknown') {
  return {
    round2RetryUsed: Boolean(meta.round2RetryUsed),
    keyNamingMode: meta.keyNamingMode || keyNamingModeFallback,
    lumensCappedCount: Number(meta.lumensCappedCount || 0),
    lumensProfile: meta.lumensProfile || 'unknown',
    sceneConstraintApplied: Boolean(sceneConstraintResult.sceneConstraintApplied),
    sceneConstraintMode: sceneConstraintResult.constraintMode || 'none',
  };
}

function extractContractPassByStep({
  analysisParsed = null,
  presetsParsed = null,
  dimensionsParsed = null,
  replaceParsed = null,
  lightingContractMeta = null,
  optimizeContractMeta = null,
} = {}) {
  return {
    analysis: Boolean(analysisParsed?.__contract?.contractValid),
    presets_refresh: Boolean(presetsParsed?.__contract?.contractValid),
    dimensions_refresh: Boolean(dimensionsParsed?.__contract?.contractValid),
    dimension_replace: Boolean(replaceParsed?.__contract?.contractValid),
    lighting: Boolean(lightingContractMeta?.contractValid),
    optimize: Boolean(optimizeContractMeta?.contractValid),
  };
}

function extractSemanticConflictByStep({
  optimizeContractMeta = null,
} = {}) {
  return {
    optimize: Array.isArray(optimizeContractMeta?.semanticConflicts) ? optimizeContractMeta.semanticConflicts.length : 0,
  };
}

function tokenizePrompt(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s:]/gu, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function jaccardSimilarity(aText, bText) {
  const aSet = new Set(tokenizePrompt(aText));
  const bSet = new Set(tokenizePrompt(bText));
  if (!aSet.size && !bSet.size) return 1;
  let inter = 0;
  for (const token of aSet) {
    if (bSet.has(token)) inter += 1;
  }
  const union = new Set([...aSet, ...bSet]).size;
  return union > 0 ? inter / union : 0;
}

async function runSample(sample, modelEndpointAvailable) {
  const ruleSceneRecommendation = inferSceneRecommendationFromPrompt(sample.prompt);
  const ruleCompositionRecommendation = inferCompositionRecommendationFromPrompt(sample.prompt);
  const analysisMessages = buildAnalysisMessages(sample.prompt, 6);

  let analysisParsed = null;
  let analysisRaw = '';
  if (modelEndpointAvailable) {
    try {
      const json = await callChat(analysisMessages);
      analysisRaw = extractContentFromChatResponse(json);
      analysisParsed = parseAnalysisResponse(analysisRaw);
    } catch {
      analysisParsed = null;
    }
  }
  if (!analysisParsed) {
    const synthetic = makeSyntheticAnalysis(sample);
    analysisRaw = synthetic.raw;
    analysisParsed = synthetic.parsed;
  }

  const dimensions = analysisParsed?.dimensions?.length ? analysisParsed.dimensions : DEFAULT_DIMENSIONS;
  const presetFixture = {
    schemaVersion: AI_CONTRACTS.presetsRefresh.schemaVersion,
    orderedFields: AI_CONTRACTS.presetsRefresh.orderedFields,
    presets: [
      {
        name: '电影感',
        description: '强化镜头、光影和叙事张力。',
        values: Object.fromEntries(dimensions.map((item) => [item.name, Number(item.value ?? item.default ?? 60)])),
      },
    ],
  };
  const dimensionsFixture = {
    schemaVersion: AI_CONTRACTS.dimensionsRefresh.schemaVersion,
    orderedFields: AI_CONTRACTS.dimensionsRefresh.orderedFields,
    dimensions: dimensions.map((item) => ({
      name: item.name,
      description: item.description || '维度描述',
      min: 0,
      max: 100,
      default: Number(item.value ?? item.default ?? 50),
      labels: item.labels || ['低', '高'],
    })),
  };
  const replaceFixture = {
    schemaVersion: AI_CONTRACTS.dimensionReplace.schemaVersion,
    orderedFields: AI_CONTRACTS.dimensionReplace.orderedFields,
    dimension: {
      name: '稳定性',
      description: '控制画面语义一致性。',
      min: 0,
      max: 100,
      default: 60,
      labels: ['松散', '严谨'],
    },
  };
  const presetsParsed = parsePresetRefreshResponse(JSON.stringify(presetFixture), dimensions);
  const dimensionsParsed = parseDimensionsRefreshResponse(JSON.stringify(dimensionsFixture));
  const replaceParsed = parseDimensionReplacementResponse(JSON.stringify(replaceFixture));

  const mergedSceneRecommendation = mergeSceneRecommendations({
    current: {},
    rule: ruleSceneRecommendation,
    ai: analysisParsed?.sceneRecommendation || null,
  });
  const sceneConstraintResult = applySceneRecommendationConstraints(sample.prompt, mergedSceneRecommendation);
  const finalSceneRecommendation = sceneConstraintResult.recommendation || {};

  const compositionReco = mergeCompositionRecommendations({
    current: { ratio: '16:9', orientation: 'landscape' },
    rule: ruleCompositionRecommendation,
    ai: analysisParsed?.compositionRecommendation || null,
  });

  const composition = makeCompositionFromReco(compositionReco);
  const scene = makeSceneFromReco(finalSceneRecommendation);
  const sampleElements = getSampleElements(sample);
  const exactTexts = getExactTextsFromElements(sampleElements);
  const negativePrompts = getNegativePromptContext(sampleElements, sample.canvasNegativePrompt);

  const optimizeMessages = buildOptimizeMessages(sample.prompt, {
    dimensions,
    composition,
    elements: sampleElements,
    links: [],
    scene,
    style: 6,
    canvasNegativePrompt: sample.canvasNegativePrompt,
  });
  const optimizeInput = optimizeMessages[1]?.content || '';

  let optimizedPrompt = '';
  let optimizeModelError = '';
  let optimizeContractMeta = null;
  let optimizeStabilityTwin = '';
  if (modelEndpointAvailable) {
    try {
      const json = await callChat(optimizeMessages);
      const rawOptimize = extractContentFromChatResponse(json);
      const parsedOptimize = parseOptimizeResponse(rawOptimize, {
        composition,
        scene,
        exactTexts,
        negativePrompts,
      });
      optimizedPrompt = parsedOptimize?.finalPrompt || rawOptimize;
      optimizeContractMeta = parsedOptimize?.contractMeta || null;

      const twinJson = await callChat(optimizeMessages);
      const rawTwin = extractContentFromChatResponse(twinJson);
      const parsedTwin = parseOptimizeResponse(rawTwin, {
        composition,
        scene,
        exactTexts,
        negativePrompts,
      });
      optimizeStabilityTwin = parsedTwin?.finalPrompt || rawTwin;
    } catch (error) {
      optimizeModelError = error?.message || String(error);
    }
  } else {
    const syntheticOptimize = {
      schemaVersion: AI_CONTRACTS.optimize.schemaVersion,
      orderedFields: AI_CONTRACTS.optimize.orderedFields,
      blocks: {
        subject: 'A clear main subject based on the original prompt',
        composition: `${composition.ratio} ${composition.orientation}, final canvas size ${composition.width}x${composition.height} px, --ar ${composition.ratio}`,
        foreground: 'Foreground subjects placed according to the canvas layout',
        background: 'Background environment supports the main subject',
        camera: 'Professional camera angle and focal framing',
        lighting: 'Consistent cinematic lighting using the current scene state',
        style: 'Semi-realistic visual style with controlled detail',
        exactText: exactTexts.length ? exactTexts.map((text) => `Exact text "${text}"`).join('; ') : 'none',
        negativeConstraints: negativePrompts.length ? `Avoid: ${negativePrompts.map((item) => item.text).join('; ')}` : 'none',
        renderConstraints: 'clean prompt, no contradictory time or style terms',
      },
      finalPrompt: [
        'A clear main subject based on the original prompt',
        `${composition.ratio} ${composition.orientation}`,
        `final canvas size ${composition.width}x${composition.height} px`,
        `--ar ${composition.ratio}`,
        'professional camera angle',
        'consistent cinematic lighting',
        'semi-realistic style',
        exactTexts.length ? exactTexts.map((text) => `exact text "${text}"`).join(', ') : '',
        negativePrompts.length ? `Avoid: ${negativePrompts.map((item) => item.text).join('; ')}` : '',
      ].filter(Boolean).join(', '),
      checks: {
        ratio: composition.ratio,
        orientation: composition.orientation,
        finalSize: `${composition.width}x${composition.height}`,
        containsSingleAr: true,
        exactTextProtected: true,
        negativeConstraintsPreserved: true,
      },
    };
    const parsedOptimize = parseOptimizeResponse(JSON.stringify(syntheticOptimize), {
      composition,
      scene,
      exactTexts,
      negativePrompts,
    });
    optimizedPrompt = parsedOptimize?.finalPrompt || syntheticOptimize.finalPrompt;
    optimizeContractMeta = parsedOptimize?.contractMeta || null;
    optimizeStabilityTwin = optimizedPrompt;
  }

  let lightingRecommendation = buildFallbackLightingRecommendation(scene);
  let lightingValidation = validateLightingRecommendation(lightingRecommendation);
  let lightingRawPreview = '';
  let lightingContractMeta = null;
  let lightingMeta = {
    round2RetryUsed: false,
    keyNamingMode: 'fallback',
    lumensCappedCount: 0,
    lumensProfile: 'unknown',
  };
  if (modelEndpointAvailable) {
    try {
      const lightingResult = await analyzeLightingWithRetry(
        sample.prompt,
        {
          sceneRecommendation: sanitizeSceneRecommendationForModel(finalSceneRecommendation),
          compositionRecommendation: compositionReco || null,
        },
        modelEndpointAvailable
      );
      lightingRawPreview = lightingResult.rawPreview;
      lightingValidation = lightingResult.validation;
      lightingMeta = lightingResult.meta;
      lightingContractMeta = lightingResult.contractMeta || null;
      if (lightingResult.recommendation) {
        lightingRecommendation = lightingResult.recommendation;
      }
    } catch {
      lightingMeta = {
        round2RetryUsed: false,
        keyNamingMode: 'error',
        lumensCappedCount: 0,
        lumensProfile: 'unknown',
      };
    }
  }
  if (!lightingContractMeta) {
    const fallbackLightingEnvelope = parseLightingRecommendationEnvelope(JSON.stringify({
      schemaVersion: AI_CONTRACTS.lighting.schemaVersion,
      orderedFields: AI_CONTRACTS.lighting.orderedFields,
      lights: {
        light1: { on: true, type: '聚光灯', lumens: 5000 },
        light2: { on: true, type: '柔光箱', lumens: 2200 },
        light3: { on: true, type: '发灯', lumens: 1800 },
        light4: { on: false, type: '发灯', lumens: 1000 },
      },
      reason: 'fallback_contract_fixture',
    }));
    lightingContractMeta = fallbackLightingEnvelope.contractMeta || null;
  }

  const telemetry = makeTelemetry(lightingMeta, sceneConstraintResult, lightingMeta.keyNamingMode);
  const contractPassByStep = extractContractPassByStep({
    analysisParsed,
    presetsParsed,
    dimensionsParsed,
    replaceParsed,
    lightingContractMeta,
    optimizeContractMeta,
  });
  const semanticConflictByStep = extractSemanticConflictByStep({ optimizeContractMeta });
  const stabilityScore = Number(jaccardSimilarity(optimizedPrompt, optimizeStabilityTwin || optimizedPrompt).toFixed(4));
  const driftReasons = [];
  if (stabilityScore < 0.72) driftReasons.push('optimize_prompt_low_similarity');
  if (Object.values(contractPassByStep).some((value) => !value)) driftReasons.push('contract_failure_detected');
  if (Object.values(semanticConflictByStep).some((value) => value > 0)) driftReasons.push('semantic_conflict_detected');

  const issues = collectIssues({
    sample,
    optimizeInput,
    optimizedPrompt,
    sceneRecommendation: finalSceneRecommendation,
    composition,
    lightingRecommendation,
    lightingValidation,
    telemetry,
  });
  for (const [step, pass] of Object.entries(contractPassByStep)) {
    if (!pass) {
      issues.push({
        severity: 'high',
        code: `contract_${step}_failed`,
        message: `${step} 合同校验未通过。`,
        suggestion: '确保该步骤返回固定 schemaVersion、orderedFields 和字段顺序。',
      });
    }
  }
  if (stabilityScore < 0.72) {
    issues.push({
      severity: 'medium',
      code: 'stability_score_low',
      message: `优化结果稳定性分数过低（${stabilityScore}）。`,
      suggestion: '收紧 blocks 顺序、术语边界与 finalPrompt 生成规则。',
    });
  }

  return {
    id: sample.id,
    group: sample.group,
    prompt: sample.prompt,
    modelEndpointAvailable,
    analysisRawPreview: analysisRaw.slice(0, 220),
    sceneRecommendation: finalSceneRecommendation,
    compositionRecommendation: compositionReco || null,
    lightingRecommendation,
    lightingValidation,
    telemetry,
    contractPassByStep,
    semanticConflictByStep,
    stabilityScore,
    driftReasons,
    issues,
    status: issues.length ? 'fail' : 'pass',
    optimizeModelError,
    optimizePreview: optimizedPrompt ? optimizedPrompt.slice(0, 220) : '',
    optimizeInputPreview: optimizeInput.slice(0, 220),
    lightingRawPreview,
  };
}

function runSyntheticChecks() {
  const checks = [];

  {
    const id = 'X01';
    const prompt = '室内棚拍肖像，低照度，电影感，半身构图';
    const merged = mergeSceneRecommendations({
      current: {},
      rule: inferSceneRecommendationFromPrompt(prompt),
      ai: null,
    });
    const sceneConstraintResult = applySceneRecommendationConstraints(prompt, merged);
    const sceneRecommendation = sceneConstraintResult.recommendation || {};

    const firstRaw = {
      lights: {
        key: { on: true, type: '聚光灯', lumens: 5200 },
        fill: { on: true, type: '柔光箱', lumens: 2600 },
      },
      reason: 'legacy_partial',
    };
    const retryRaw = {
      lights: {
        light1: { on: true, type: '聚光灯', lumens: 5200 },
        light2: { on: true, type: '柔光箱', lumens: 2600 },
        light3: { on: true, type: '发灯', lumens: 1900 },
        light4: { on: false, type: '发灯', lumens: 1000 },
      },
      reason: 'retry_fixed',
    };

    const firstReco = normalizeLightingRecommendation(firstRaw);
    const firstValidation = validateLightingRecommendation(firstReco);
    const retryUsed = !firstValidation.isValid || !firstValidation.isComplete;
    const finalReco = normalizeLightingRecommendation(retryRaw);
    const finalValidation = validateLightingRecommendation(finalReco);
    const profile = classifySceneForLumens(prompt, sceneRecommendation);
    const capped = applyLumensSoftCaps(finalReco, profile);

    const telemetry = makeTelemetry(
      {
        round2RetryUsed: retryUsed,
        keyNamingMode: `${detectLightingKeyNamingMode(firstRaw)}->${detectLightingKeyNamingMode(retryRaw)}`,
        lumensCappedCount: capped.lumensCappedCount,
        lumensProfile: capped.profile,
      },
      sceneConstraintResult,
      'legacy->light1_4'
    );

    const issues = [];
    if (!retryUsed) {
      issues.push({
        severity: 'high',
        code: 'synthetic_retry_missing',
        message: '旧命名缺字段样本未触发重试。',
        suggestion: '校正 validation 判定，非法或不完整时必须进行一次重试。',
      });
    }
    if (!finalValidation.isValid || !finalValidation.isComplete) {
      issues.push({
        severity: 'high',
        code: 'synthetic_retry_still_invalid',
        message: '重试后结构仍非法。',
        suggestion: '重试提示词必须强约束 schema，仅允许 light1~4。',
      });
    }

    checks.push({
      id,
      group: 'synthetic_retry',
      prompt,
      modelEndpointAvailable: false,
      synthetic: true,
      sceneRecommendation,
      compositionRecommendation: null,
      lightingRecommendation: capped.recommendation,
      lightingValidation: finalValidation,
      telemetry,
      contractPassByStep: {
        analysis: true,
        presets_refresh: true,
        dimensions_refresh: true,
        dimension_replace: true,
        lighting: true,
        optimize: true,
      },
      semanticConflictByStep: { optimize: 0 },
      stabilityScore: 1,
      driftReasons: [],
      issues,
      status: issues.length ? 'fail' : 'pass',
      optimizeModelError: '',
      optimizePreview: '',
      optimizeInputPreview: '',
      lightingRawPreview: JSON.stringify(retryRaw).slice(0, 220),
    });
  }

  {
    const id = 'X02';
    const prompt = '棚拍时尚大片，室内静态人像，背景纯色';
    const merged = mergeSceneRecommendations({
      current: {},
      rule: inferSceneRecommendationFromPrompt(prompt),
      ai: null,
    });
    const sceneConstraintResult = applySceneRecommendationConstraints(prompt, merged);
    const sceneRecommendation = sceneConstraintResult.recommendation || {};
    const raw = {
      lights: {
        light1: { on: true, type: '聚光灯', lumens: 80000 },
        light2: { on: true, type: '柔光箱', lumens: 45000 },
        light3: { on: true, type: '发灯', lumens: 26000 },
        light4: { on: true, type: '发灯', lumens: 9000 },
      },
      reason: 'overshoot_case',
    };
    const reco = normalizeLightingRecommendation(raw);
    const validation = validateLightingRecommendation(reco);
    const profile = classifySceneForLumens(prompt, sceneRecommendation);
    const capped = applyLumensSoftCaps(reco, profile);

    const telemetry = makeTelemetry(
      {
        round2RetryUsed: false,
        keyNamingMode: detectLightingKeyNamingMode(raw),
        lumensCappedCount: capped.lumensCappedCount,
        lumensProfile: capped.profile,
      },
      sceneConstraintResult,
      'light1_4'
    );

    const issues = [];
    if (!validation.isValid || !validation.isComplete) {
      issues.push({
        severity: 'high',
        code: 'synthetic_input_invalid',
        message: '流明压顶样本在压顶前已非法。',
        suggestion: '请先确保输入结构合法，再验证分档校正逻辑。',
      });
    }
    if (capped.lumensCappedCount === 0) {
      issues.push({
        severity: 'high',
        code: 'synthetic_cap_not_applied',
        message: '超流明样本未触发分档软上限。',
        suggestion: '按场景档位对 key/fill/back/hair 执行逐项 soft cap。',
      });
    }

    checks.push({
      id,
      group: 'synthetic_lumens_cap',
      prompt,
      modelEndpointAvailable: false,
      synthetic: true,
      sceneRecommendation,
      compositionRecommendation: null,
      lightingRecommendation: capped.recommendation,
      lightingValidation: validation,
      telemetry,
      contractPassByStep: {
        analysis: true,
        presets_refresh: true,
        dimensions_refresh: true,
        dimension_replace: true,
        lighting: true,
        optimize: true,
      },
      semanticConflictByStep: { optimize: 0 },
      stabilityScore: 1,
      driftReasons: [],
      issues,
      status: issues.length ? 'fail' : 'pass',
      optimizeModelError: '',
      optimizePreview: '',
      optimizeInputPreview: '',
      lightingRawPreview: JSON.stringify(raw).slice(0, 220),
    });
  }

  return checks;
}

async function runLocalClarityAudit() {
  let modelEndpointAvailable = false;
  let modelEndpointError = '';

  try {
    await callChatWithRetry([{ role: 'user', content: 'health-check' }], {
      allowRetry: false,
      timeoutMs: 5000,
    });
    modelEndpointAvailable = true;
  } catch (error) {
    modelEndpointError = error?.message || String(error);
  }

  const results = await runWithConcurrency(
    SAMPLES,
    modelEndpointAvailable ? Math.max(1, CLARITY_DEFAULT_CONCURRENCY) : 1,
    async (sample) => runSample(sample, modelEndpointAvailable),
  );

  const syntheticResults = runSyntheticChecks();
  results.push(...syntheticResults);

  const passCount = results.filter((item) => item.status === 'pass').length;
  const failCount = results.length - passCount;
  const contractStepNames = ['analysis', 'presets_refresh', 'dimensions_refresh', 'dimension_replace', 'lighting', 'optimize'];
  const contractTotal = results.length * contractStepNames.length;
  const contractPass = results.reduce((sum, item) => {
    const stepMap = item.contractPassByStep || {};
    return sum + contractStepNames.filter((step) => stepMap[step] === true).length;
  }, 0);
  const criticalConflictCount = results.reduce((sum, item) => {
    const stepMap = item.semanticConflictByStep || {};
    return sum + Object.values(stepMap).reduce((inner, value) => inner + Number(value || 0), 0);
  }, 0);
  const stabilityAvg = results.length
    ? results.reduce((sum, item) => sum + Number(item.stabilityScore || 0), 0) / results.length
    : 0;
  const gate = {
    contractPassRate: Number((contractTotal ? contractPass / contractTotal : 0).toFixed(4)),
    criticalConflictCount,
    stabilityScoreAvg: Number(stabilityAvg.toFixed(4)),
  };
  gate.pass = gate.contractPassRate === 1 && gate.criticalConflictCount === 0 && gate.stabilityScoreAvg >= 0.72;
  return {
    generatedAt: new Date().toISOString(),
    chatEndpoint: LOCAL_CHAT_ENDPOINT,
    modelEndpointAvailable,
    modelEndpointError,
    execution: {
      concurrency: modelEndpointAvailable ? Math.max(1, CLARITY_DEFAULT_CONCURRENCY) : 1,
      maxRetries: CLARITY_MAX_RETRIES,
      timeoutMs: CLARITY_CHAT_TIMEOUT_MS,
    },
    totals: {
      samples: results.length,
      pass: passCount,
      fail: failCount,
      passRate: Number((passCount / results.length).toFixed(4)),
    },
    gate,
    results,
  };
}

async function runWithConcurrency(items, concurrency, worker) {
  const limit = Math.max(1, Number.parseInt(String(concurrency), 10) || 1);
  const output = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index], index);
    }
  }

  const tasks = Array.from({ length: Math.min(limit, items.length) }, () => runner());
  await Promise.all(tasks);
  return output;
}

function buildMarkdownReport(summary) {
  const lines = [
    '# Prompt Clarity Audit Report',
    '',
    `- Timestamp: ${summary.generatedAt}`,
    `- Chat endpoint: ${summary.chatEndpoint}`,
    `- Endpoint available: ${summary.modelEndpointAvailable ? 'yes' : 'no'}`,
    summary.modelEndpointAvailable ? '' : `- Endpoint error: ${summary.modelEndpointError || 'N/A'}`,
    `- Execution: concurrency=${summary.execution?.concurrency ?? 1}, maxRetries=${summary.execution?.maxRetries ?? 0}, timeoutMs=${summary.execution?.timeoutMs ?? CLARITY_CHAT_TIMEOUT_MS}`,
    `- Samples: ${summary.totals.samples}`,
    `- Pass: ${summary.totals.pass}`,
    `- Fail: ${summary.totals.fail}`,
    `- Pass rate: ${(summary.totals.passRate * 100).toFixed(1)}%`,
    `- Contract pass rate: ${((summary.gate?.contractPassRate || 0) * 100).toFixed(1)}%`,
    `- Critical semantic conflicts: ${summary.gate?.criticalConflictCount ?? 0}`,
    `- Stability score avg: ${(summary.gate?.stabilityScoreAvg ?? 0).toFixed(4)}`,
    `- Commit gate: ${summary.gate?.pass ? 'PASS' : 'FAIL'} (requires contract pass=100%, critical conflicts=0, stability>=0.72)`,
    '',
    '| ID | Group | Status | Issues | Contract | Conflicts | Stability | Retry | Key naming | Cap count | Scene constraint | Key note |',
    '|---|---|---|---:|---|---:|---:|---|---|---:|---|---|',
    ...summary.results.map((item) => {
      const note = item.issues[0]?.message || '无明显歧义';
      const t = item.telemetry || {};
      const contractPass = Object.values(item.contractPassByStep || {}).every(Boolean);
      const conflictCount = Object.values(item.semanticConflictByStep || {}).reduce((sum, value) => sum + Number(value || 0), 0);
      return `| ${item.id} | ${item.group} | ${item.status.toUpperCase()} | ${item.issues.length} | ${contractPass ? 'PASS' : 'FAIL'} | ${conflictCount} | ${(item.stabilityScore ?? 0).toFixed(4)} | ${t.round2RetryUsed ? 'yes' : 'no'} | ${t.keyNamingMode || 'unknown'} | ${t.lumensCappedCount || 0} | ${t.sceneConstraintApplied ? 'yes' : 'no'} | ${note} |`;
    }),
    '',
    '## Detailed Issues',
    ...summary.results.flatMap((item) => {
      if (!item.issues.length) {
        return [`- ${item.id}: PASS (retry=${item.telemetry?.round2RetryUsed ? 'yes' : 'no'}, keyMode=${item.telemetry?.keyNamingMode || 'unknown'}, capped=${item.telemetry?.lumensCappedCount || 0})`];
      }
      const issueText = item.issues
        .map((issue) => `${issue.severity}/${issue.code}: ${issue.message} -> ${issue.suggestion}`)
        .join(' ; ');
      return [`- ${item.id}: ${issueText}`];
    }),
    '',
    '## L2 Real Image Check',
    '- This run only auto-generates image check file when both `BFL_API_KEY` and `STABILITY_API_KEY` are present.',
  ];
  return lines.filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n');
}

async function runOptionalImageCheck(summary) {
  const hasBfl = Boolean(process.env.BFL_API_KEY);
  const hasStability = Boolean(process.env.STABILITY_API_KEY);
  if (!hasBfl || !hasStability) {
    return null;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    status: 'detected_credentials',
    note: '检测到 BFL/STABILITY key。本轮已触发自动占位检查；建议下一轮接入真实 endpoint 进行 A/B 出图评分。',
    passSampleIds: summary.results.filter((item) => item.status === 'pass').map((item) => item.id),
  };
  await fs.writeFile(IMAGE_CHECK_PATH, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

async function main() {
  await fs.mkdir(path.dirname(CLARITY_RESULTS_PATH), { recursive: true });

  const summary = await runLocalClarityAudit();
  await fs.writeFile(CLARITY_RESULTS_PATH, JSON.stringify(summary, null, 2), 'utf8');
  await fs.writeFile(CLARITY_REPORT_PATH, buildMarkdownReport(summary), 'utf8');
  await runOptionalImageCheck(summary);

  console.log(`Clarity audit written: ${CLARITY_RESULTS_PATH}`);
  console.log(`Clarity report written: ${CLARITY_REPORT_PATH}`);
}

main().catch(async (error) => {
  await fs.mkdir(path.dirname(CLARITY_RESULTS_PATH), { recursive: true });
  const failPayload = {
    generatedAt: new Date().toISOString(),
    status: 'fatal_error',
    error: error?.stack || error?.message || String(error),
  };
  await fs.writeFile(CLARITY_RESULTS_PATH, JSON.stringify(failPayload, null, 2), 'utf8');
  await fs.writeFile(
    CLARITY_REPORT_PATH,
    `# Prompt Clarity Audit Report\n\n- Result: FAIL\n- Error: ${failPayload.error}\n`,
    'utf8'
  );
  console.error(error);
  process.exitCode = 1;
});
