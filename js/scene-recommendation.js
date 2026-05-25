/**
 * scene-recommendation.js
 * AI suggestion normalization + rule-based fallback + merge/diff helpers
 */

export const SCENE_RECO_FIELDS = ['timeOfDay', 'lightingPreset', 'colorTemp', 'lightQuality', 'cameraPreset'];

export const SCENE_RECO_LABELS = {
  timeOfDay: '时段',
  lightingPreset: '布光',
  colorTemp: '色温',
  lightQuality: '柔硬',
  cameraPreset: '机位',
};

export const SCENE_RECO_ENUMS = {
  timeOfDay: ['蓝调', '日出', '正午', '黄金', '夜晚'],
  lightingPreset: ['自然光', '伦勃朗', '蝶形光', '侧光', '逆光'],
  colorTemp: ['冷蓝', '自然', '暖黄', '金橙'],
  lightQuality: ['硬光', '中性', '柔光'],
  cameraPreset: ['平视', '俯拍', '仰拍', '鸟瞰', '45°斜角'],
};

const SCENE_RECO_ALIASES = {
  timeOfDay: {
    night: '夜晚',
    nighttime: '夜晚',
    moonlight: '夜晚',
    dusk: '蓝调',
    twilight: '蓝调',
    dawn: '日出',
    sunrise: '日出',
    noon: '正午',
    midday: '正午',
    sunset: '黄金',
    goldenhour: '黄金',
    bluehour: '蓝调',
    夜景: '夜晚',
    夜色: '夜晚',
    清晨: '日出',
    黄昏: '黄金',
    傍晚: '黄金',
  },
  lightingPreset: {
    rembrandt: '伦勃朗',
    rembrandtlighting: '伦勃朗',
    butterfly: '蝶形光',
    side: '侧光',
    sidelighting: '侧光',
    splitlighting: '侧光',
    backlit: '逆光',
    backlight: '逆光',
    rimlight: '逆光',
    自然: '自然光',
  },
  colorTemp: {
    cool: '冷蓝',
    coolblue: '冷蓝',
    neutral: '自然',
    warm: '暖黄',
    golden: '金橙',
    amber: '金橙',
  },
  lightQuality: {
    hard: '硬光',
    hardlight: '硬光',
    neutral: '中性',
    soft: '柔光',
    softlight: '柔光',
  },
  cameraPreset: {
    eyelevel: '平视',
    highangle: '俯拍',
    lowangle: '仰拍',
    birdseye: '鸟瞰',
    birdseyeview: '鸟瞰',
    aerial: '鸟瞰',
    oblique: '45°斜角',
    dutchangle: '45°斜角',
  },
};

const RULE_KEYWORDS = {
  night: ['夜', '深夜', '夜晚', '夜景', 'moon', 'moonlight', 'night', 'midnight', 'noir', '霓虹', 'neon', '雨夜'],
  blueHour: ['蓝调', 'blue hour', 'twilight', 'dusk', '暮色'],
  sunrise: ['日出', '黎明', '清晨', 'sunrise', 'dawn', 'morning glow'],
  noon: ['正午', '中午', '烈日', 'midday', 'noon', 'harsh sunlight'],
  golden: ['黄金时刻', 'golden hour', 'sunset', '黄昏', '夕阳', '暖阳'],
  sideLight: ['侧光', 'split lighting', 'dramatic side', 'noir lighting'],
  backLight: ['逆光', '背光', '轮廓光', 'rim light', 'silhouette', 'backlit'],
  portrait: ['人像', '肖像', 'portrait', 'beauty', 'fashion', '写真人像'],
  rembrandt: ['伦勃朗', 'rembrandt'],
  birdView: ['鸟瞰', '俯瞰', '航拍', 'top-down', "bird's eye", 'aerial'],
  lowAngle: ['仰拍', '低角度', 'low-angle', 'looking up', 'worm eye'],
  highAngle: ['俯拍', '高角度', 'high-angle', 'overhead'],
  eyeLevel: ['平视', 'eye-level', 'straight-on'],
  oblique: ['斜角', 'dutch angle', '45°', '45度'],
};

const SCENE_CONSTRAINT_KEYWORDS = {
  indoorStudio: ['室内', '棚拍', '摄影棚', 'studio', 'indoor', 'interior', 'room', 'apartment', 'office', 'classroom', '教室', '房间'],
  explicitTime: ['夜晚', '夜景', '深夜', '夜色', '蓝调', '黄昏', '傍晚', '日出', '清晨', '黎明', '正午', '中午', '黄金时刻', 'golden hour', 'sunrise', 'dawn', 'midday', 'noon', 'night', 'nighttime', 'moonlight', 'twilight', 'dusk'],
  explicitColorTemp: ['冷蓝', '暖黄', '金橙', '自然色温', 'cool blue', 'warm', 'amber', 'golden tone', 'neutral white balance'],
  explicitLightQuality: ['硬光', '柔光', '中性光', 'hard light', 'soft light', 'diffused light'],
};

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[，,、;；。.!?'"`~]/g, '')
    .replace(/\s+/g, '');
}

function normalizeValue(field, rawValue) {
  if (typeof rawValue !== 'string') return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const direct = trimmed.split(/[（(]/)[0].trim();
  if (SCENE_RECO_ENUMS[field].includes(direct)) {
    return direct;
  }

  const normalized = normalizeToken(direct);
  if (!normalized) return null;

  const alias = SCENE_RECO_ALIASES[field][normalized];
  if (alias && SCENE_RECO_ENUMS[field].includes(alias)) {
    return alias;
  }

  return null;
}

export function normalizeSceneRecommendation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const normalized = {};
  for (const field of SCENE_RECO_FIELDS) {
    const value = normalizeValue(field, raw[field]);
    if (value) normalized[field] = value;
  }

  if (typeof raw.reason === 'string' && raw.reason.trim()) {
    normalized.reason = raw.reason.trim().slice(0, 120);
  }

  const hasCore = SCENE_RECO_FIELDS.some((field) => Boolean(normalized[field]));
  return hasCore ? normalized : null;
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

export function inferSceneRecommendationFromPrompt(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (!text) return null;

  const reco = {};
  const reasonTags = [];

  if (includesAny(text, RULE_KEYWORDS.night)) {
    reco.timeOfDay = '夜晚';
    reco.colorTemp = '冷蓝';
    reco.lightQuality = '中性';
    reco.lightingPreset = '侧光';
    reasonTags.push('夜晚语义');
  } else if (includesAny(text, RULE_KEYWORDS.blueHour)) {
    reco.timeOfDay = '蓝调';
    reco.colorTemp = '冷蓝';
    reco.lightQuality = '柔光';
    reco.lightingPreset = '侧光';
    reasonTags.push('蓝调时段');
  } else if (includesAny(text, RULE_KEYWORDS.sunrise)) {
    reco.timeOfDay = '日出';
    reco.colorTemp = '暖黄';
    reco.lightQuality = '柔光';
    reco.lightingPreset = '逆光';
    reasonTags.push('日出语义');
  } else if (includesAny(text, RULE_KEYWORDS.golden)) {
    reco.timeOfDay = '黄金';
    reco.colorTemp = '金橙';
    reco.lightQuality = '柔光';
    reco.lightingPreset = '逆光';
    reasonTags.push('黄金时段');
  } else if (includesAny(text, RULE_KEYWORDS.noon)) {
    reco.timeOfDay = '正午';
    reco.colorTemp = '自然';
    reco.lightQuality = '硬光';
    reco.lightingPreset = '自然光';
    reasonTags.push('正午语义');
  }

  if (includesAny(text, RULE_KEYWORDS.rembrandt)) {
    reco.lightingPreset = '伦勃朗';
    reasonTags.push('伦勃朗布光');
  } else if (includesAny(text, RULE_KEYWORDS.backLight)) {
    reco.lightingPreset = '逆光';
    reasonTags.push('逆光关键词');
  } else if (includesAny(text, RULE_KEYWORDS.sideLight)) {
    reco.lightingPreset = '侧光';
    reasonTags.push('侧光关键词');
  } else if (includesAny(text, RULE_KEYWORDS.portrait)) {
    reco.lightingPreset = '蝶形光';
    reco.lightQuality = reco.lightQuality || '柔光';
    reasonTags.push('人像关键词');
  }

  if (includesAny(text, RULE_KEYWORDS.birdView)) {
    reco.cameraPreset = '鸟瞰';
    reasonTags.push('鸟瞰视角');
  } else if (includesAny(text, RULE_KEYWORDS.lowAngle)) {
    reco.cameraPreset = '仰拍';
    reasonTags.push('仰拍视角');
  } else if (includesAny(text, RULE_KEYWORDS.highAngle)) {
    reco.cameraPreset = '俯拍';
    reasonTags.push('俯拍视角');
  } else if (includesAny(text, RULE_KEYWORDS.eyeLevel)) {
    reco.cameraPreset = '平视';
    reasonTags.push('平视视角');
  } else if (includesAny(text, RULE_KEYWORDS.oblique)) {
    reco.cameraPreset = '45°斜角';
    reasonTags.push('斜角视角');
  }

  const hasCore = SCENE_RECO_FIELDS.some((field) => Boolean(reco[field]));
  if (!hasCore) return null;

  reco.reason = `规则匹配: ${reasonTags.slice(0, 3).join(' / ') || '场景语义'}`;
  return reco;
}

export function mergeSceneRecommendations({ current, rule, ai }) {
  const merged = {};

  for (const field of SCENE_RECO_FIELDS) {
    if (current?.[field]) merged[field] = current[field];
  }
  for (const field of SCENE_RECO_FIELDS) {
    if (rule?.[field]) merged[field] = rule[field];
  }
  for (const field of SCENE_RECO_FIELDS) {
    if (ai?.[field]) merged[field] = ai[field];
  }

  if (ai?.reason) merged.reason = ai.reason;
  else if (rule?.reason) merged.reason = rule.reason;

  return merged;
}

function appendConstraintReason(originalReason, message) {
  if (!message) return originalReason || '';
  if (!originalReason) return message;
  return `${originalReason}；${message}`;
}

function hasPromptKeyword(promptText, keywords) {
  return includesAny(promptText, keywords);
}

/**
 * Apply post-merge scene constraints based on prompt semantics.
 * Returns recommendation payload + metadata for observability.
 */
export function applySceneRecommendationConstraints(prompt, recommendation) {
  const text = String(prompt || '').toLowerCase();
  const next = recommendation && typeof recommendation === 'object' ? { ...recommendation } : {};
  const clearFields = [];
  let sceneConstraintApplied = false;

  const isIndoorStudio = hasPromptKeyword(text, SCENE_CONSTRAINT_KEYWORDS.indoorStudio);
  const hasExplicitTime = hasPromptKeyword(text, SCENE_CONSTRAINT_KEYWORDS.explicitTime);
  const hasExplicitColorTemp = hasPromptKeyword(text, SCENE_CONSTRAINT_KEYWORDS.explicitColorTemp);
  const hasExplicitLightQuality = hasPromptKeyword(text, SCENE_CONSTRAINT_KEYWORDS.explicitLightQuality);

  if (isIndoorStudio && !hasExplicitTime) {
    if (next.timeOfDay) {
      clearFields.push('timeOfDay');
      delete next.timeOfDay;
      sceneConstraintApplied = true;
    }
    if (!hasExplicitColorTemp && next.colorTemp) {
      clearFields.push('colorTemp');
      delete next.colorTemp;
      sceneConstraintApplied = true;
    }
    if (!hasExplicitLightQuality && next.lightQuality) {
      clearFields.push('lightQuality');
      delete next.lightQuality;
      sceneConstraintApplied = true;
    }

    if (sceneConstraintApplied) {
      next.reason = appendConstraintReason(next.reason, '约束: 室内/棚拍且未显式时段，已禁用自动时段注入');
    }
  }

  if (clearFields.length > 0) {
    next.__clearFields = [...new Set(clearFields)];
  }

  return {
    recommendation: next,
    sceneConstraintApplied,
    clearFields: next.__clearFields || [],
    constraintMode: sceneConstraintApplied ? 'indoor_no_time' : 'none',
  };
}

export function getSceneRecommendationDiff(current, next) {
  const diffs = [];
  const clearFields = new Set(Array.isArray(next?.__clearFields) ? next.__clearFields : []);

  for (const field of clearFields) {
    if (current?.[field]) {
      diffs.push({
        field,
        label: SCENE_RECO_LABELS[field] || field,
        from: current[field],
        to: '',
        action: 'clear',
      });
    }
  }

  for (const field of SCENE_RECO_FIELDS) {
    const from = current?.[field] || '';
    const to = next?.[field] || '';
    if (!to || from === to) continue;
    diffs.push({ field, label: SCENE_RECO_LABELS[field], from, to, action: 'set' });
  }
  return diffs;
}

export function hasSceneRecommendationDiff(current, next) {
  return getSceneRecommendationDiff(current, next).length > 0;
}

export function formatSceneRecommendationDiffText(current, next) {
  const diffs = getSceneRecommendationDiff(current, next);
  if (diffs.length === 0) return '无关键差异';
  return diffs
    .slice(0, 4)
    .map((item) => item.action === 'clear' ? `${item.label}: 清空` : `${item.label}: ${item.to}`)
    .join('，');
}
