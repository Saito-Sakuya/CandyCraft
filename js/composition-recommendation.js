/**
 * composition-recommendation.js
 * Normalize + infer + merge helpers for composition orientation/ratio recommendation.
 */

export const COMPOSITION_RECO_FIELDS = ['orientation', 'ratio'];

export const COMPOSITION_RECO_LABELS = {
  orientation: '方向',
  ratio: '比例',
};

const ORIENTATION_ALIASES = {
  landscape: 'landscape',
  horizontal: 'landscape',
  wide: 'landscape',
  widescreen: 'landscape',
  横: 'landscape',
  横向: 'landscape',
  横版: 'landscape',
  横构图: 'landscape',
  电影宽屏: 'landscape',
  cinema: 'landscape',

  portrait: 'portrait',
  vertical: 'portrait',
  tall: 'portrait',
  竖: 'portrait',
  纵: 'portrait',
  竖向: 'portrait',
  纵向: 'portrait',
  竖版: 'portrait',
  海报: 'portrait',
  竖构图: 'portrait',

  square: 'square',
  方形: 'square',
  方图: 'square',
  正方形: 'square',
};

const ORIENTATION_KEYWORDS = {
  landscape: ['横版', '横构图', '横向', 'wide shot', 'widescreen', 'cinematic wide', 'landscape'],
  portrait: ['竖版', '竖构图', '纵向', '海报', 'poster', 'vertical frame', 'portrait orientation'],
  square: ['方形', '方图', '正方形', '1:1', 'square format'],
};

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[，,、;；。.!?'"`~]/g, '')
    .replace(/\s+/g, '');
}

export function normalizeCompositionRatio(rawValue) {
  if (rawValue === null || rawValue === undefined) return null;
  const text = String(rawValue).trim().replace(/：/g, ':');
  const m = text.match(/(\d{1,3})\s*[:xX×]\s*(\d{1,3})/);
  if (!m) return null;

  const w = Number.parseInt(m[1], 10);
  const h = Number.parseInt(m[2], 10);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w < 1 || h < 1 || w > 64 || h > 64) return null;

  return `${w}:${h}`;
}

export function inferOrientationFromRatio(ratioValue) {
  const ratio = normalizeCompositionRatio(ratioValue);
  if (!ratio) return null;
  const [w, h] = ratio.split(':').map(Number);
  if (w === h) return 'square';
  return w > h ? 'landscape' : 'portrait';
}

export function normalizeCompositionOrientation(rawValue) {
  if (typeof rawValue !== 'string') return null;

  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (trimmed === 'landscape' || trimmed === 'portrait' || trimmed === 'square') return trimmed;

  const direct = trimmed.split(/[（(]/)[0].trim();
  const normalized = normalizeToken(direct);
  return ORIENTATION_ALIASES[normalized] || null;
}

export function normalizeCompositionRecommendation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const ratio = normalizeCompositionRatio(raw.ratio);
  const orientation = ratio
    ? inferOrientationFromRatio(ratio)
    : normalizeCompositionOrientation(raw.orientation);

  const normalized = {};
  if (orientation) normalized.orientation = orientation;
  if (ratio) normalized.ratio = ratio;

  if (typeof raw.reason === 'string' && raw.reason.trim()) {
    normalized.reason = raw.reason.trim().slice(0, 120);
  }

  return normalized.orientation || normalized.ratio ? normalized : null;
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

export function inferCompositionRecommendationFromPrompt(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (!text) return null;

  const reco = {};
  const reasonTags = [];

  const ratio = normalizeCompositionRatio(text);
  if (ratio) {
    reco.ratio = ratio;
    const inferred = inferOrientationFromRatio(ratio);
    if (inferred) reco.orientation = inferred;
    reasonTags.push(`比例 ${ratio}`);
  }

  if (!reco.orientation) {
    if (includesAny(text, ORIENTATION_KEYWORDS.square)) {
      reco.orientation = 'square';
      reasonTags.push('方形构图关键词');
    } else if (includesAny(text, ORIENTATION_KEYWORDS.portrait)) {
      reco.orientation = 'portrait';
      reasonTags.push('竖向构图关键词');
    } else if (includesAny(text, ORIENTATION_KEYWORDS.landscape)) {
      reco.orientation = 'landscape';
      reasonTags.push('横向构图关键词');
    }
  }

  if (!reco.ratio && reco.orientation) {
    const orientationDefaults = {
      landscape: '16:9',
      portrait: '9:16',
      square: '1:1',
    };
    reco.ratio = orientationDefaults[reco.orientation] || '16:9';
    reasonTags.push('方向默认比例');
  }

  if (!reco.orientation && !reco.ratio) return null;
  reco.reason = `规则匹配: ${reasonTags.slice(0, 2).join(' / ') || '构图语义'}`;
  return reco;
}

export function mergeCompositionRecommendations({ current, rule, ai }) {
  const merged = {};
  for (const field of COMPOSITION_RECO_FIELDS) {
    if (current?.[field]) merged[field] = current[field];
  }
  for (const field of COMPOSITION_RECO_FIELDS) {
    if (rule?.[field]) merged[field] = rule[field];
  }
  for (const field of COMPOSITION_RECO_FIELDS) {
    if (ai?.[field]) merged[field] = ai[field];
  }

  if (ai?.reason) merged.reason = ai.reason;
  else if (rule?.reason) merged.reason = rule.reason;

  return merged;
}

export function getCompositionRecommendationDiff(current, next) {
  const diffs = [];
  for (const field of COMPOSITION_RECO_FIELDS) {
    const from = current?.[field] || '';
    const to = next?.[field] || '';
    if (!to || from === to) continue;
    diffs.push({ field, label: COMPOSITION_RECO_LABELS[field], from, to });
  }
  return diffs;
}

export function hasCompositionRecommendationDiff(current, next) {
  return getCompositionRecommendationDiff(current, next).length > 0;
}

export function formatCompositionRecommendationDiffText(current, next) {
  const diffs = getCompositionRecommendationDiff(current, next);
  if (diffs.length === 0) return '无关键差异';

  return diffs
    .slice(0, 2)
    .map((item) => {
      if (item.field === 'orientation') return `${item.label}: ${item.to}`;
      return `${item.label}: ${item.to}`;
    })
    .join('，');
}
