/**
 * prompt.js — System prompts and prompt construction (v2)
 * Two-phase AI conversation: Analysis returns dimensions + characters + presets,
 * Optimization incorporates composition, character layout, camera, and lighting.
 */

import { normalizeSceneRecommendation } from './scene-recommendation.js';
import { normalizeCompositionRecommendation } from './composition-recommendation.js';
import { normalizeLightingRecommendation } from './lighting-recommendation.js';

/* ---- Analysis Phase System Prompt (v3) ---- */
const ANALYSIS_SYSTEM_PROMPT = `你是一位专业的文生图提示词分析顾问。
用户会给你一段文生图提示词，请你分析该提示词的特点和可优化方向。

请返回一个 JSON 对象（不是数组），包含以下字段：

1. "dimensions": 6~8 个可调节的优化维度数组，每个维度包含：
   - name: 维度名称（简短，2-4个字，如"画面细节""光影层次""色调氛围""构图张力""材质表现""叙事深度""风格强度""氛围渲染"）
   - description: 一句话说明该维度的含义
   - min: 0
   - max: 100
   - default: 你对当前提示词在该维度上的评估值（0-100）
   - labels: [最小端描述, 最大端描述]，如 ["极简克制", "极致细腻"]

2. "elements": 从提示词中提取的所有视觉元素数组（包括人物和背景景物），每个包含：
   - id: 唯一标识（如 "elem_1"）
   - type: "character"（人物/角色）或 "object"（景物/建筑/环境）
   - layer: "foreground"（前景）或 "background"（后景）
   - name: 名称
   - description: 外观或特征简述
   - role: "主角" 或 "配角" 或 "背景景物"
   - position: { "x": 0-100, "y": 0-100 } 你建议的画面位置（百分比坐标）
   - size: { "w": 10-40, "h": 15-50 } 你建议的框体尺寸（百分比）

   规则：
   - 人物/角色 → type: "character", layer: "foreground"
   - 环境/建筑/自然景物 → type: "object", layer: "background"
   - 如果提示词暗示了场景环境（如"窗外的雨天城市""废弃城堡"），也要生成对应的后景元素
   - 至少输出 1 个前景元素和 1 个后景元素（如果文意合理的话）
   - 如果提示词中没有明确人物，可把画面主体作为前景元素

3. "presets": 2~4 个预设优化方案数组，每个包含：
   - name: 方案名称（2-4个字，如"电影海报""水彩插画""极简美学"）
   - description: 一句话说明该方案的风格取向
   - values: 一个对象，key 是维度名称，value 是该方案下的推荐值（0-100）

4. "sceneRecommendation"（可选）:
   - timeOfDay: "蓝调" | "日出" | "正午" | "黄金" | "夜晚"
   - lightingPreset: "自然光" | "伦勃朗" | "蝶形光" | "侧光" | "逆光"
   - colorTemp: "冷蓝" | "自然" | "暖黄" | "金橙"
   - lightQuality: "硬光" | "中性" | "柔光"
   - cameraPreset: "平视" | "俯拍" | "仰拍" | "鸟瞰" | "45°斜角"
   - reason: 简短理由（可选）

5. "compositionRecommendation"（可选）:
   - orientation: "landscape" | "portrait" | "square"
   - ratio: 合法比例字符串（如 "16:9", "9:16", "2:3", "9:21"）
   - reason: 简短理由（可选）

注意：
1. 维度要针对该提示词的具体内容来设定，不要用通用模板
2. default 值要准确反映当前提示词的实际水平
3. presets 中的 values 的 key 必须与 dimensions 中的 name 完全一致
4. 不要使用 emoji
5. 不要使用浮夸或AI味过重的措辞（如"打造""赋能""沉浸式"）
6. 只输出 JSON 对象，不要输出其他内容
7. 不要用 markdown 代码块包裹 JSON`;

/* ---- Style level context (1=anime → 10=realistic) ---- */

/*
 * Style spectrum:
 * 1-2  纯赛璐珞动漫 (cel shading, flat color, bold lineart)
 * 3    动漫插画 (anime illustration, softer shading, still illustrated feel)
 * 4    风格化插画 (stylized illustration, some realistic lighting but drawn aesthetic)
 * 5    平衡混合 (equal blend, illustrated look with realistic proportions and lighting)
 * 6    半写实 (semi-realistic, painterly, detailed rendering but not photographic)
 * 7    偏写实 (leaning realistic, CG render quality, minimal stylization)
 * 8    写实CG (realistic CG, cinematic, could pass as 3D render)
 * 9-10 照片级 (photorealistic, DSLR, indistinguishable from photo)
 */

const STYLE_DESCRIPTIONS = {
  analysis: [
    /* 0 unused */ '',
    /* 1 */ '纯赛璐珞动漫风格。侧重：线条表现、色块平涂、赛璐珞感、动画帧感。',
    /* 2 */ '动漫风格。侧重：赛璐珞着色、角色表情、动态张力、鲜明配色。',
    /* 3 */ '动漫插画风格。侧重：柔和渐变着色、插画构图、角色刻画、色彩氛围。',
    /* 4 */ '风格化插画。侧重：兼具绘画质感与光影层次，保留插画审美但增加细节真实感。',
    /* 5 */ '平衡混合风格，介于插画与写实之间。侧重：写实比例与光影，但保持绘画笔触和色彩风格化。',
    /* 6 */ '半写实风格。侧重：细腻渲染、真实光影、材质表现，但保留一定艺术化处理。',
    /* 7 */ '偏写实风格。侧重：CG 渲染质感、真实材质、电影级光影，仅保留极少风格化。',
    /* 8 */ '写实 CG 风格。侧重：高精度渲染、真实皮肤质感、电影调色、景深控制。',
    /* 9 */ '照片级写实。侧重：DSLR 画质、自然肤质、体积光、胶片颗粒感。',
    /* 10 */'极致照片写实。侧重：8K 超写实、RAW 照片质感、物理准确光照、全局光照。',
  ],
  optimize: [
    '',
    /* 1  */ `\n\n风格要求：纯赛璐珞动漫（程度 1/10）。\n请使用以下术语（按需选用）：\n- cel shading, flat color, bold outlines, clean lineart\n- anime screencap, animation frame, limited palette\n- sakuga quality, key animation\n禁止使用任何写实类术语（photorealistic, DSLR 等）。`,
    /* 2  */ `\n\n风格要求：动漫风格（程度 2/10）。\n请使用以下术语（按需选用）：\n- anime style, anime aesthetic, cel shading\n- clean lineart, vivid colors, expressive eyes\n- dynamic pose, anime key visual\n- soft shading, gradient hair\n不要使用写实类术语。`,
    /* 3  */ `\n\n风格要求：动漫插画（程度 3/10）。\n请使用以下术语（按需选用）：\n- anime illustration, digital art, light novel illustration\n- soft cel shading, detailed lineart, pastel palette\n- expressive characters, anime aesthetic\n不要使用 photorealistic, DSLR, RAW photo 等术语。`,
    /* 4  */ `\n\n风格要求：风格化插画（程度 4/10）。\n请使用以下术语（按需选用）：\n- stylized illustration, digital painting, concept art\n- detailed shading, dramatic lighting, painted aesthetic\n- character illustration, art station quality\n可以使用 cinematic lighting，但不要使用 photorealistic 或 DSLR。`,
    /* 5  */ `\n\n风格要求：平衡混合风格（程度 5/10，插画与写实之间）。\n请使用以下术语（按需选用）：\n- digital painting, detailed illustration, semi-realistic\n- realistic proportions, cinematic lighting, rich details\n- painterly style, dramatic atmosphere, refined rendering\n不要使用 cel shading, flat color 等纯动漫术语，也不要使用 DSLR, RAW photo 等纯摄影术语。`,
    /* 6  */ `\n\n风格要求：半写实（程度 6/10）。\n请使用以下术语（按需选用）：\n- semi-realistic, highly detailed, cinematic\n- realistic lighting, detailed textures, rendered\n- digital painting, artstation, dramatic atmosphere\n- subtle stylization, painterly details\n可以使用 cinematic, volumetric lighting，但避免 photorealistic, 8K, RAW photo。`,
    /* 7  */ `\n\n风格要求：偏写实（程度 7/10）。\n请使用以下术语（按需选用）：\n- realistic, cinematic, highly detailed\n- volumetric lighting, ray tracing, CG render\n- detailed skin texture, realistic materials\n- shallow depth of field, color grading\n避免所有动漫术语（anime, cel shading, lineart）。`,
    /* 8  */ `\n\n风格要求：写实 CG（程度 8/10）。\n请使用以下术语（按需选用）：\n- hyperrealistic, cinematic, CG render quality\n- subsurface scattering, physically based rendering\n- volumetric lighting, global illumination, ray tracing\n- film grain, color grading, shallow depth of field\n- detailed skin pores, realistic materials\n完全不要使用动漫相关术语。`,
    /* 9  */ `\n\n风格要求：照片级写实（程度 9/10）。\n请使用以下术语（按需选用）：\n- photorealistic, DSLR quality, RAW photo\n- natural skin texture, subsurface scattering\n- volumetric lighting, bokeh, shallow depth of field\n- film grain, cinematic color palette\n- physically based rendering, octane render\n完全不要使用任何动漫或插画术语。`,
    /* 10 */ `\n\n风格要求：极致照片写实（程度 10/10）。\n请使用以下术语（按需选用）：\n- photorealistic, hyperrealistic, 8K UHD, RAW photo\n- DSLR quality, natural lighting, photo-accurate\n- subsurface scattering, micro-detail skin texture\n- volumetric lighting, ray tracing, global illumination\n- shallow depth of field, bokeh, film grain\n- physically based rendering, octane render\n输出应与真实相机拍摄的照片无法区分。完全不要使用任何动漫、插画或绘画术语。`,
  ],
};

function buildAnalysisStyleSuffix(level) {
  const desc = STYLE_DESCRIPTIONS.analysis[level] || STYLE_DESCRIPTIONS.analysis[5];
  return `\n\n额外上下文：用户的目标风格程度为 ${level}/10（1=纯赛璐珞动漫，10=照片级写实）。\n当前定位：${desc}\n请在设计维度和预设时贴合这一风格定位。`;
}

function buildOptimizeStyleSuffix(level) {
  return STYLE_DESCRIPTIONS.optimize[level] || STYLE_DESCRIPTIONS.optimize[5];
}

/* ---- Optimization Phase System Prompt (v2.1) ---- */
const OPTIMIZE_SYSTEM_PROMPT_BASE = `你是一位资深的文生图提示词优化师，擅长将普通提示词改写为高质量、专业级的生图指令。

你的任务：根据用户提供的原始提示词和各项参数，输出一段优化后的提示词。

用户会提供以下信息：
- 原始提示词
- 各维度参数值（0-100）
- 构图比例（横向/纵向/方形）
- 人物布局信息（角色名、位置、大小、角色间的互动关系）
- 相机机位和布光信息
- 目标风格（动漫或真实）

优化规则：
1. 先对原始语句做基础的语法和表达优化，使其更加清晰流畅
2. 根据各维度的参数值（0-100）调整对应方面的描述详细程度和侧重点
3. 将前景元素（人物/物品）自然地融入提示词中，体现其位置关系和互动，不要机械罗列坐标
4. 将后景元素（景物/建筑/环境）作为背景描述融入提示词
5. 如果有焦点物品，用"focus on..."描述视觉重心
6. 同一景深平面的元素应在描述中体现空间关联
7. 将相机机位、焦距、景别翻译为专业摄影术语
8. 将光圈、布光方案、色温和时段翻译为专业的光影描述
9. 将构图比例反映在画面描述中
10. 保持提示词的核心创意意图不变
11. 输出应当是自然的、可直接用于生图的完整提示词
12. 不要堆砌无意义的关键词
13. 不要使用 emoji
14. 不要使用"打造""赋能""沉浸式""震撼"等过度修饰的词汇
15. 如果原始提示词是中文，优化后输出英文（因为大多数生图模型对英文支持更好），但保持核心含义
16. 直接输出优化后的提示词，不要输出分析过程或解释`;



/**
 * Build messages array for the analysis phase
 * @param {string} userPrompt — the user's raw prompt
 * @param {number} [styleLevel=3] — 1 (anime) to 10 (realistic)
 * @returns {Array<{role: string, content: string}>}
 */
export function buildAnalysisMessages(userPrompt, styleLevel = 3) {
  const styleSuffix = buildAnalysisStyleSuffix(styleLevel);
  return [
    { role: 'system', content: ANALYSIS_SYSTEM_PROMPT + styleSuffix },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * Build second-round messages for light tuning recommendation.
 * @param {string} userPrompt
 * @param {Object} context
 */
export function buildLightingMessages(userPrompt, context = {}) {
  const sceneRecommendation = context.sceneRecommendation || {};
  const compositionRecommendation = context.compositionRecommendation || {};

  const systemPrompt = `你是一位影视布光顾问。请基于用户提示词和第一轮分析上下文，输出逐灯设置建议。

只输出 JSON 对象，格式如下：
{
  "lights": {
    "light1": { "on": true, "type": "聚光灯", "lumens": 5000 },
    "light2": { "on": true, "type": "柔光箱", "lumens": 2200 },
    "light3": { "on": true, "type": "发灯", "lumens": 1800 },
    "light4": { "on": false, "type": "发灯", "lumens": 1000 }
  },
  "reason": "简短说明"
}

约束：
1. type 只能使用：聚光灯/柔光箱/环形灯/菲涅尔灯/发灯/反光板/霓虹灯/蜡烛
2. lumens 必须是 100~100000 的整数
3. on 必须是布尔值
4. lights 必须返回 4 盏灯，优先使用 light1/light2/light3/light4 命名
5. 兼容旧命名 key/fill/back/hair 也可接受，但优先输出 light1~4
6. 不要输出 markdown 代码块，不要输出解释文本`;

  const userMessage = `原始提示词:
${userPrompt}

第一轮场景建议:
${JSON.stringify(sceneRecommendation, null, 2)}

第一轮构图建议:
${JSON.stringify(compositionRecommendation, null, 2)}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
}

/**
 * Build retry messages for second-round light tuning when first attempt is invalid.
 * The retry contract is stricter and only accepts light1~4 keys.
 */
export function buildLightingRetryMessages(userPrompt, context = {}, failureSummary = '') {
  const sceneRecommendation = context.sceneRecommendation || {};
  const compositionRecommendation = context.compositionRecommendation || {};

  const systemPrompt = `你是影视布光纠错器。上一次输出不符合结构，请严格按 schema 返回。

只输出 JSON：
{
  "lights": {
    "light1": { "on": true, "type": "聚光灯", "lumens": 5000 },
    "light2": { "on": true, "type": "柔光箱", "lumens": 2200 },
    "light3": { "on": true, "type": "发灯", "lumens": 1800 },
    "light4": { "on": false, "type": "发灯", "lumens": 1000 }
  },
  "reason": "简短说明"
}

硬性要求：
1. 仅允许 light1/light2/light3/light4 四个键，不要 key/fill/back/hair
2. 每盏灯必须同时包含 on/type/lumens
3. on 必须是布尔值
4. type 只能是：聚光灯/柔光箱/环形灯/菲涅尔灯/发灯/反光板/霓虹灯/蜡烛
5. lumens 必须是 100~100000 的整数
6. 禁止 markdown、禁止解释文字、禁止额外字段`;

  const userMessage = `原始提示词:
${userPrompt}

第一轮场景建议:
${JSON.stringify(sceneRecommendation, null, 2)}

第一轮构图建议:
${JSON.stringify(compositionRecommendation, null, 2)}

上次失败原因:
${failureSummary || '结构不完整或字段非法'}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
}

/**
 * Build messages for the optimization phase (v3 — full parameters)
 * @param {string} userPrompt — original prompt
 * @param {Object} params — all optimization parameters
 * @param {Array} params.dimensions — slider dimension values
 * @param {string} params.composition — '16:9' | '9:16' | '1:1'
 * @param {Array} params.elements — element layout data (foreground + background)
 * @param {Array} params.links — element relationship/depth links
 * @param {Object} params.scene — camera/aperture/lighting data
 */
export function buildOptimizeMessages(userPrompt, params) {
  const { dimensions, composition, elements, links, scene, style = 3 } = params;

  const styleLevel = typeof style === 'number' ? style : 3;
  const styleLabel = `动漫/写实程度 ${styleLevel}/10（${styleLevel <= 3 ? '偏动漫' : styleLevel <= 6 ? '半写实' : '偏写实'}）`;
  const styleSuffix = buildOptimizeStyleSuffix(styleLevel);
  const systemPrompt = OPTIMIZE_SYSTEM_PROMPT_BASE + styleSuffix;

  // Dimensions
  const dimDesc = dimensions
    .map(d => `${d.name}: ${d.value}/${d.max} (${d.labels[0]} ← → ${d.labels[1]})`)
    .join('\n');

  // Composition — now accepts object or string
  let compDesc;
  if (typeof composition === 'object' && composition !== null) {
    const r = composition.ratio || '16:9';
    const o = composition.orientation || 'landscape';
    const res = composition.resolution || '';
    const oLabel = o === 'portrait' ? 'portrait' : o === 'square' ? 'square' : 'landscape';
    compDesc = `${r} ${oLabel}${res ? `, ${res}` : ''} (--ar ${r})`;
  } else {
    const compMap = { '16:9': '16:9 landscape (--ar 16:9)', '9:16': '9:16 portrait (--ar 9:16)', '1:1': '1:1 square (--ar 1:1)' };
    compDesc = compMap[composition] || '16:9 landscape (--ar 16:9)';
  }

  // Elements — split by layer, use spatial descriptions instead of raw coords
  let fgDesc = 'none';
  let bgDesc = 'none';
  const allElems = elements || [];

  const fgElems = allElems.filter(e => e.layer === 'foreground');
  const bgElems = allElems.filter(e => e.layer === 'background');

  if (fgElems.length > 0) {
    fgDesc = fgElems
      .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))
      .map(e => {
        let line = `- ${e.name}: ${posToSpatial(e.x, e.y)}, ${sizeToScale(e.w, e.h)}`;
        if (e.description) line += `, "${e.description}"`;
        if (e.prompt) line += `, prompt: "${e.prompt}"`;
        if (e.focusPoint) line += `, [focus: ${e.focusPoint}]`;
        return line;
      }).join('\n');
  }

  if (bgElems.length > 0) {
    bgDesc = bgElems
      .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))
      .map(e => {
        let line = `- ${e.name}: ${posToSpatial(e.x, e.y)}, ${sizeToScale(e.w, e.h)}`;
        if (e.description) line += `, "${e.description}"`;
        if (e.prompt) line += `, prompt: "${e.prompt}"`;
        if (e.focusPoint) line += `, [focus: ${e.focusPoint}]`;
        return line;
      }).join('\n');
  }

  // Links (with optional description)
  let linkDesc = 'none';
  if (links && links.length > 0) {
    linkDesc = links.map(l => {
      const fromEl = allElems.find(e => e.id === l.fromId);
      const toEl   = allElems.find(e => e.id === l.toId);
      let typeLabel;
      if (l.type === 'same-plane') {
        typeLabel = 'share the same focal plane (both in focus)';
      } else {
        typeLabel = l.label || l.type;
      }
      let line = `- ${fromEl?.name || '?'} and ${toEl?.name || '?'}: ${typeLabel}`;
      if (l.description) line += ` — "${l.description}"`;
      return line;
    }).join('\n');
  }

  // Focus points summary
  const focusElems = allElems.filter(e => e.focusPoint);
  let focusDesc = 'no specific focus point';
  if (focusElems.length > 0) {
    focusDesc = focusElems.map(e => `${e.name}: ${e.focusPoint}`).join(', ');
  }

  // Scene — use English keys, per-light details
  let sceneDesc = 'default';
  if (scene) {
    const parts = [];
    if (scene.cameraPreset) parts.push(`camera: ${scene.cameraPreset}`);
    if (scene.focalLength)  parts.push(`focal: ${scene.focalLength}`);
    if (scene.framing)      parts.push(`framing: ${scene.framing}`);
    if (scene.aperture)     parts.push(`aperture: ${scene.aperture}`);

    // Per-light breakdown (v4)
    if (scene.lights && typeof scene.lights === 'object') {
      for (const [enKey, ld] of Object.entries(scene.lights)) {
        if (!ld.on) {
          parts.push(`${enKey}: [disabled]`);
        } else {
          const sLm = ld.subjectLumens ? `, ~${ld.subjectLumens} lux on subject` : '';
          parts.push(`${enKey}: ${ld.watts}W ${ld.typeEn}${sLm}`);
        }
      }
    } else if (scene.lightingPreset) {
      // Legacy fallback
      parts.push(`lighting: ${scene.lightingPreset}`);
    }

    if (scene.lightQuality) parts.push(`light quality: ${scene.lightQuality}`);
    if (scene.colorTemp)    parts.push(`color temp: ${scene.colorTemp}`);
    if (scene.timeOfDay)    parts.push(`time: ${scene.timeOfDay}`);
    sceneDesc = parts.length > 0 ? parts.join('\n') : 'default';
  }

  const userMessage = `Original prompt:
${userPrompt}

Target style: ${styleLabel}

Composition: ${compDesc}

Foreground elements (front to back):
${fgDesc}

Background elements (front to back):
${bgDesc}

Element relationships / depth links:
${linkDesc}

Visual focus: ${focusDesc}

Dimension parameters:
${dimDesc}

Camera & lighting:
${sceneDesc}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
}

/**
 * Parse the AI analysis response (v2)
 * Now expects a JSON object with { dimensions, characters, presets }
 * Falls back to v1 array format for backward compatibility
 * @param {string} text — raw AI response
 * @returns {{ dimensions: Array, elements: Array|null, characters: Array, presets: Array, sceneRecommendation: Object|null, compositionRecommendation: Object|null } | null}
 */
export function parseAnalysisResponse(text) {
  if (!text || typeof text !== 'string') return null;

  const parsed = tryParseJsonWithExtractors(text);

  if (!parsed) return null;

  // v1 backward compatibility: if result is an array, treat as dimensions only
  if (Array.isArray(parsed)) {
    const dims = normalizeDimensions(parsed);
    return dims ? {
      dimensions: dims,
      elements: null,
      characters: [],
      presets: [],
      sceneRecommendation: null,
      compositionRecommendation: null,
    } : null;
  }

  // v2/v3 object format
  if (typeof parsed === 'object') {
    const dimensions = normalizeDimensions(parsed.dimensions);
    if (!dimensions) return null;

    // v3: elements array (characters + objects)
    // v2 fallback: characters array
    const elements = parsed.elements || null;
    const characters = normalizeCharacters(parsed.characters || []);
    const presets = normalizePresets(parsed.presets || [], dimensions);
    const sceneRecommendation = normalizeSceneRecommendation(parsed.sceneRecommendation);
    const compositionRecommendation = normalizeCompositionRecommendation(parsed.compositionRecommendation);

    return { dimensions, elements, characters, presets, sceneRecommendation, compositionRecommendation };
  }

  return null;
}

/**
 * Parse second-round light tuning response.
 * @param {string} text
 * @returns {{ lights: Object, reason?: string } | null}
 */
export function parseLightingRecommendationResponse(text) {
  const envelope = parseLightingRecommendationEnvelope(text);
  return envelope?.recommendation || null;
}

/**
 * Parse second-round light tuning response with raw payload metadata.
 * @param {string} text
 * @returns {{ recommendation: { lights: Object, reason?: string } | null, raw: Object | null, parseError: string | null }}
 */
export function parseLightingRecommendationEnvelope(text) {
  if (!text || typeof text !== 'string') {
    return {
      recommendation: null,
      raw: null,
      parseError: 'empty_text',
    };
  }
  const parsed = tryParseJsonWithExtractors(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      recommendation: null,
      raw: null,
      parseError: 'invalid_json_object',
    };
  }
  const recommendation = normalizeLightingRecommendation(parsed);
  return {
    recommendation,
    raw: parsed,
    parseError: recommendation ? null : 'normalize_failed',
  };
}

function tryParseJsonWithExtractors(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.trim();
  if (!cleaned) return null;

  const extractors = [
    (t) => JSON.parse(t),
    (t) => {
      const m = t.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      return m ? JSON.parse(m[1].trim()) : null;
    },
    (t) => {
      const fi = t.indexOf('{');
      const li = t.lastIndexOf('}');
      return (fi !== -1 && li > fi) ? JSON.parse(t.substring(fi, li + 1)) : null;
    },
    (t) => {
      const fi = t.indexOf('[');
      const li = t.lastIndexOf(']');
      return (fi !== -1 && li > fi) ? JSON.parse(t.substring(fi, li + 1)) : null;
    },
  ];

  for (const extractor of extractors) {
    try {
      const result = extractor(cleaned);
      if (result) return result;
    } catch {
      // ignore and continue
    }
  }
  return null;
}

/* ---- Normalization Helpers ---- */

function normalizeDimensions(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const normalized = arr
    .filter(item => item && typeof item.name === 'string')
    .map(item => ({
      name: item.name,
      description: item.description || '',
      min: typeof item.min === 'number' ? item.min : 0,
      max: typeof item.max === 'number' ? item.max : 100,
      default: clamp(typeof item.default === 'number' ? item.default : 50, 0, 100),
      value: clamp(typeof item.default === 'number' ? item.default : 50, 0, 100),
      labels: Array.isArray(item.labels) && item.labels.length >= 2
        ? [String(item.labels[0]), String(item.labels[1])]
        : ['低', '高'],
    }));

  return normalized.length > 0 ? normalized : null;
}

function normalizeCharacters(arr) {
  if (!Array.isArray(arr)) return [];

  return arr
    .filter(c => c && typeof c.name === 'string')
    .map((c, i) => ({
      id: c.id || `char_${i + 1}`,
      name: c.name,
      description: c.description || '',
      role: c.role || '配角',
      prompt: c.prompt || c.description || '',
      x: clamp(c.position?.x ?? (25 + i * 25), 5, 90),
      y: clamp(c.position?.y ?? 50, 5, 90),
      w: clamp(c.size?.w ?? 18, 8, 45),
      h: clamp(c.size?.h ?? 28, 10, 55),
      selected: false,
    }));
}

function normalizePresets(arr, dimensions) {
  if (!Array.isArray(arr)) return [];

  return arr
    .filter(p => p && typeof p.name === 'string' && p.values)
    .map(p => ({
      name: p.name,
      description: p.description || '',
      values: dimensions.reduce((acc, dim) => {
        acc[dim.name] = clamp(
          typeof p.values[dim.name] === 'number' ? p.values[dim.name] : dim.default,
          0, 100
        );
        return acc;
      }, {}),
    }));
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/* ---- Audit helpers: convert coords to spatial descriptions ---- */

/**
 * Convert x%, y% position to a spatial description (5-zone horizontal, 3-zone vertical).
 * Examples:
 *   (35, 55) → "left-center area"
 *   (65, 55) → "right-center area"
 *   (50, 50) → "center of frame"
 *   (10, 20) → "upper far-left area"
 */
function posToSpatial(x, y) {
  // Horizontal: 5 zones
  let h;
  if      (x < 20) h = 'far-left';
  else if (x < 40) h = 'left-center';
  else if (x < 60) h = 'center';
  else if (x < 80) h = 'right-center';
  else             h = 'far-right';

  // Vertical: 3 zones
  const v = y < 33 ? 'upper' : y > 66 ? 'lower' : 'middle';

  if (h === 'center' && v === 'middle') return 'center of frame';
  if (h === 'center') return `${v} area`;
  if (v === 'middle') return `${h} side`;
  return `${v}-${h} area`;
}

/**
 * Convert w%, h% size to a relative scale description.
 */
function sizeToScale(w, h) {
  const area = w * h;
  if (area > 800) return 'dominant';
  if (area > 400) return 'prominent';
  if (area > 150) return 'medium';
  return 'small';
}
