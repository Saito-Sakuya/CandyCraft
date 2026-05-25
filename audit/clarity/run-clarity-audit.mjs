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
} from '../../js/prompt.js';
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
];

const DEFAULT_DIMENSIONS = [
  { name: '画面细节', min: 0, max: 100, value: 70, labels: ['简洁', '细腻'] },
  { name: '光影层次', min: 0, max: 100, value: 72, labels: ['平', '强'] },
  { name: '色调氛围', min: 0, max: 100, value: 66, labels: ['克制', '浓郁'] },
  { name: '构图张力', min: 0, max: 100, value: 68, labels: ['稳态', '张力'] },
  { name: '材质表现', min: 0, max: 100, value: 65, labels: ['概括', '真实'] },
  { name: '叙事深度', min: 0, max: 100, value: 60, labels: ['直给', '隐喻'] },
];

const DEFAULT_ELEMENTS = [
  { id: 'fg_1', type: 'character', layer: 'foreground', name: '主体', x: 50, y: 58, w: 22, h: 32, zIndex: 1, description: '主要角色', focusPoint: '面部表情' },
  { id: 'bg_1', type: 'object', layer: 'background', name: '环境', x: 50, y: 42, w: 62, h: 40, zIndex: 0, description: '场景背景' },
];

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
  return {
    ratio,
    orientation,
    resolution: '2K',
  };
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
  const response = await fetch(LOCAL_CHAT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      stream: false,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
  }

  return response.json();
}

function parseLightingText(text) {
  const envelope = parseLightingRecommendationEnvelope(text);
  return {
    recommendation: envelope.recommendation,
    parseError: envelope.parseError,
    keyNamingMode: detectLightingKeyNamingMode(envelope.raw),
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

  if (has(['nighttime']) && has(['sunrise', 'golden hour', 'midday'])) {
    issues.push({
      severity: 'medium',
      code: 'time_conflict',
      message: '同一提示词中出现冲突时段语义（夜晚与日出/正午/黄金）。',
      suggestion: '只保留一个主时段语义并同步色温与光质。',
    });
  }

  if (has(['cool blue']) && has(['warm golden', 'amber tones'])) {
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

  const dimensions = analysisParsed?.dimensions?.length ? analysisParsed.dimensions : DEFAULT_DIMENSIONS;

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

  const optimizeMessages = buildOptimizeMessages(sample.prompt, {
    dimensions,
    composition,
    elements: DEFAULT_ELEMENTS,
    links: [],
    scene,
    style: 6,
  });
  const optimizeInput = optimizeMessages[1]?.content || '';

  let optimizedPrompt = '';
  let optimizeModelError = '';
  if (modelEndpointAvailable) {
    try {
      const json = await callChat(optimizeMessages);
      optimizedPrompt = extractContentFromChatResponse(json);
    } catch (error) {
      optimizeModelError = error?.message || String(error);
    }
  }

  let lightingRecommendation = buildFallbackLightingRecommendation(scene);
  let lightingValidation = validateLightingRecommendation(lightingRecommendation);
  let lightingRawPreview = '';
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

  const telemetry = makeTelemetry(lightingMeta, sceneConstraintResult, lightingMeta.keyNamingMode);
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
    await callChat([{ role: 'user', content: 'health-check' }]);
    modelEndpointAvailable = true;
  } catch (error) {
    modelEndpointError = error?.message || String(error);
  }

  const results = [];
  for (const sample of SAMPLES) {
    const result = await runSample(sample, modelEndpointAvailable);
    results.push(result);
  }

  const syntheticResults = runSyntheticChecks();
  results.push(...syntheticResults);

  const passCount = results.filter((item) => item.status === 'pass').length;
  const failCount = results.length - passCount;
  return {
    generatedAt: new Date().toISOString(),
    chatEndpoint: LOCAL_CHAT_ENDPOINT,
    modelEndpointAvailable,
    modelEndpointError,
    totals: {
      samples: results.length,
      pass: passCount,
      fail: failCount,
      passRate: Number((passCount / results.length).toFixed(4)),
    },
    results,
  };
}

function buildMarkdownReport(summary) {
  const lines = [
    '# Prompt Clarity Audit Report',
    '',
    `- Timestamp: ${summary.generatedAt}`,
    `- Chat endpoint: ${summary.chatEndpoint}`,
    `- Endpoint available: ${summary.modelEndpointAvailable ? 'yes' : 'no'}`,
    summary.modelEndpointAvailable ? '' : `- Endpoint error: ${summary.modelEndpointError || 'N/A'}`,
    `- Samples: ${summary.totals.samples}`,
    `- Pass: ${summary.totals.pass}`,
    `- Fail: ${summary.totals.fail}`,
    `- Pass rate: ${(summary.totals.passRate * 100).toFixed(1)}%`,
    '',
    '| ID | Group | Status | Issues | Retry | Key naming | Cap count | Scene constraint | Key note |',
    '|---|---|---|---:|---|---|---:|---|---|',
    ...summary.results.map((item) => {
      const note = item.issues[0]?.message || '无明显歧义';
      const t = item.telemetry || {};
      return `| ${item.id} | ${item.group} | ${item.status.toUpperCase()} | ${item.issues.length} | ${t.round2RetryUsed ? 'yes' : 'no'} | ${t.keyNamingMode || 'unknown'} | ${t.lumensCappedCount || 0} | ${t.sceneConstraintApplied ? 'yes' : 'no'} | ${note} |`;
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
