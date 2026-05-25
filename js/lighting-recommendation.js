/**
 * lighting-recommendation.js
 * Helpers for second-round light tuning recommendation.
 */

export const LIGHT_TUNING_KEYS = ['key', 'fill', 'back', 'hair'];

export const LIGHT_TYPE_ENUMS = [
  '聚光灯',
  '柔光箱',
  '环形灯',
  '菲涅尔灯',
  '发灯',
  '反光板',
  '霓虹灯',
  '蜡烛',
];

export const LUMENS_SOFT_CAPS = {
  studio_indoor: {
    key: { min: 1000, max: 8000 },
    fill: { min: 200, max: 4000 },
    back: { min: 300, max: 5000 },
    hair: { min: 100, max: 3000 },
  },
  night_scene: {
    key: { min: 800, max: 12000 },
    fill: { min: 100, max: 5000 },
    back: { min: 300, max: 7000 },
    hair: { min: 100, max: 4000 },
  },
  daylight_exterior: {
    key: { min: 3000, max: 30000 },
    fill: { min: 1000, max: 15000 },
    back: { min: 1000, max: 20000 },
    hair: { min: 100, max: 8000 },
  },
};

const LIGHT_KEY_ALIASES = {
  key: 'key',
  main: 'key',
  keylight: 'key',
  主光: 'key',
  light1: 'key',
  source1: 'key',
  光源1: 'key',
  fill: 'fill',
  filllight: 'fill',
  补光: 'fill',
  light2: 'fill',
  source2: 'fill',
  光源2: 'fill',
  back: 'back',
  rim: 'back',
  backlight: 'back',
  轮廓光: 'back',
  light3: 'back',
  source3: 'back',
  光源3: 'back',
  hair: 'hair',
  hairlight: 'hair',
  发灯: 'hair',
  light4: 'hair',
  source4: 'hair',
  光源4: 'hair',
};

const LIGHT_TYPE_ALIASES = {
  spotlight: '聚光灯',
  softbox: '柔光箱',
  ringlight: '环形灯',
  fresnel: '菲涅尔灯',
  hairlight: '发灯',
  reflector: '反光板',
  neon: '霓虹灯',
  candle: '蜡烛',
};

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[，,、;；。.!?'"`~]/g, '')
    .replace(/\s+/g, '');
}

function normalizeLightType(rawValue) {
  if (typeof rawValue !== 'string') return null;
  const direct = rawValue.trim().split(/[（(]/)[0].trim();
  if (LIGHT_TYPE_ENUMS.includes(direct)) return direct;

  const alias = LIGHT_TYPE_ALIASES[normalizeToken(direct)];
  return alias && LIGHT_TYPE_ENUMS.includes(alias) ? alias : null;
}

function normalizeLumens(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return null;
  return clamp(Math.round(value), 100, 100000);
}

function normalizeOn(rawValue) {
  if (typeof rawValue === 'boolean') return rawValue;
  if (typeof rawValue === 'number') return rawValue !== 0;
  if (typeof rawValue !== 'string') return null;
  const token = normalizeToken(rawValue);
  if (['on', 'true', '1', '开启', '开', '启用'].includes(token)) return true;
  if (['off', 'false', '0', '关闭', '关', '禁用'].includes(token)) return false;
  return null;
}

function normalizeLightKey(rawKey) {
  const token = normalizeToken(rawKey);
  return LIGHT_KEY_ALIASES[token] || null;
}

function getNormalizedLightRawKey(rawKey) {
  return normalizeToken(rawKey);
}

function normalizeLightNode(rawNode) {
  if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) return null;
  const normalized = {};

  const on = normalizeOn(rawNode.on);
  const type = normalizeLightType(rawNode.type);
  const lumens = normalizeLumens(rawNode.lumens);

  if (on !== null) normalized.on = on;
  if (type) normalized.type = type;
  if (lumens !== null) normalized.lumens = lumens;

  const hasAny = Object.keys(normalized).length > 0;
  return hasAny ? normalized : null;
}

export function normalizeLightingRecommendation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const rawLights = raw.lights && typeof raw.lights === 'object' ? raw.lights : null;
  if (!rawLights) return null;

  const lights = {};
  for (const [rawKey, rawNode] of Object.entries(rawLights)) {
    const key = normalizeLightKey(rawKey);
    if (!key) continue;
    const node = normalizeLightNode(rawNode);
    if (!node) continue;
    lights[key] = node;
  }

  const hasAny = Object.keys(lights).length > 0;
  if (!hasAny) return null;

  const normalized = { lights };
  if (typeof raw.reason === 'string' && raw.reason.trim()) {
    normalized.reason = raw.reason.trim().slice(0, 160);
  }
  return normalized;
}

export function validateLightingRecommendation(reco) {
  const issues = [];
  if (!reco || typeof reco !== 'object' || !reco.lights || typeof reco.lights !== 'object') {
    return {
      isValid: false,
      isComplete: false,
      missingKeys: [...LIGHT_TUNING_KEYS],
      issues: ['missing_lights_object'],
    };
  }

  const missingKeys = [];
  for (const key of LIGHT_TUNING_KEYS) {
    const node = reco.lights[key];
    if (!node) {
      missingKeys.push(key);
      issues.push(`missing_${key}`);
      continue;
    }
    if (typeof node.on !== 'boolean') issues.push(`invalid_on_${key}`);
    if (typeof node.type !== 'string' || !LIGHT_TYPE_ENUMS.includes(node.type)) {
      issues.push(`invalid_type_${key}`);
    }
    if (!Number.isFinite(node.lumens) || node.lumens < 100 || node.lumens > 100000) {
      issues.push(`invalid_lumens_${key}`);
    }
  }

  return {
    isValid: issues.length === 0,
    isComplete: missingKeys.length === 0,
    missingKeys,
    issues,
  };
}

export function detectLightingKeyNamingMode(raw) {
  const rawLights = raw?.lights && typeof raw.lights === 'object' ? raw.lights : null;
  if (!rawLights) return 'unknown';

  const keys = Object.keys(rawLights).map((key) => getNormalizedLightRawKey(key));
  if (!keys.length) return 'unknown';

  const modernTokens = ['light1', 'light2', 'light3', 'light4', 'source1', 'source2', 'source3', 'source4', '光源1', '光源2', '光源3', '光源4'].map((v) => normalizeToken(v));
  const legacyTokens = ['key', 'fill', 'back', 'hair', 'main', 'keylight', 'filllight', 'backlight', 'hairlight', '主光', '补光', '轮廓光', '发灯'].map((v) => normalizeToken(v));

  const hasModern = keys.some((key) => modernTokens.includes(key));
  const hasLegacy = keys.some((key) => legacyTokens.includes(key));

  if (hasModern && hasLegacy) return 'mixed';
  if (hasModern) return 'light1_4';
  if (hasLegacy) return 'legacy';
  return 'unknown';
}

export function classifySceneForLumens(prompt, sceneRecommendation) {
  const text = normalizeToken(prompt);
  const scene = sceneRecommendation || {};
  const time = scene.timeOfDay || '';

  const indoorKeywords = ['室内', '棚拍', '摄影棚', 'studio', 'indoor', 'interior', 'room', 'apartment', 'office', '教室'];
  if (indoorKeywords.some((token) => text.includes(normalizeToken(token)))) {
    return 'studio_indoor';
  }

  const nightKeywords = ['夜', 'night', 'moon', 'neon', '霓虹', '雨夜', '蓝调'];
  if (['夜晚', '蓝调'].includes(time) || nightKeywords.some((token) => text.includes(normalizeToken(token)))) {
    return 'night_scene';
  }

  return 'daylight_exterior';
}

export function applyLumensSoftCaps(reco, profile) {
  if (!reco?.lights || !LUMENS_SOFT_CAPS[profile]) {
    return {
      recommendation: reco,
      lumensCappedCount: 0,
      profile: profile || 'unknown',
    };
  }

  const ranges = LUMENS_SOFT_CAPS[profile];
  const next = {
    ...reco,
    lights: { ...reco.lights },
  };

  let lumensCappedCount = 0;
  for (const key of LIGHT_TUNING_KEYS) {
    const node = next.lights[key];
    const range = ranges[key];
    if (!node || !range || !Number.isFinite(node.lumens)) continue;

    const clamped = clamp(Math.round(node.lumens), range.min, range.max);
    if (clamped !== node.lumens) {
      next.lights[key] = { ...node, lumens: clamped };
      lumensCappedCount += 1;
    }
  }

  return {
    recommendation: next,
    lumensCappedCount,
    profile,
  };
}

export function summarizeLightingValidation(validation, parseError = '') {
  const tags = [];
  if (parseError) tags.push(`parse:${parseError}`);
  if (!validation?.isComplete && validation?.missingKeys?.length) {
    tags.push(`missing:${validation.missingKeys.join(',')}`);
  }
  if (validation?.issues?.length) {
    tags.push(`issues:${validation.issues.join(',')}`);
  }
  return tags.join(' | ') || 'unknown_error';
}

export function getLightingRecommendationDiff(current, next) {
  const diffs = [];
  if (!next?.lights) return diffs;

  for (const key of LIGHT_TUNING_KEYS) {
    const currentLight = current?.lights?.[key] || {};
    const nextLight = next.lights[key];
    if (!nextLight) continue;

    for (const field of ['on', 'type', 'lumens']) {
      if (nextLight[field] === undefined) continue;
      const from = currentLight[field];
      const to = nextLight[field];
      if (from === to) continue;
      diffs.push({ key, field, from, to });
    }
  }
  return diffs;
}

export function hasLightingRecommendationDiff(current, next) {
  return getLightingRecommendationDiff(current, next).length > 0;
}

export function formatLightingRecommendationDiffText(current, next) {
  const diffs = getLightingRecommendationDiff(current, next);
  if (diffs.length === 0) return '无关键差异';

  return diffs
    .slice(0, 4)
    .map(({ key, field, to }) => `${key}.${field}: ${to}`)
    .join('，');
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
