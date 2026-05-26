/**
 * prompt.js — System prompts and prompt construction (v2)
 * Two-phase AI conversation: Analysis returns dimensions + characters + presets,
 * Optimization incorporates composition, character layout, camera, and lighting.
 */

import { normalizeSceneRecommendation } from './scene-recommendation.js';
import { normalizeCompositionRecommendation } from './composition-recommendation.js';
import { normalizeLightingRecommendation } from './lighting-recommendation.js';
import {
  AI_CONTRACTS,
  tryParseJsonWithExtractors,
  validateContractEnvelope,
  auditPromptSemantics,
  makeContractMeta,
} from './ai-contract.js';

export const ANALYSIS_SCHEMA_VERSION = AI_CONTRACTS.analysis.schemaVersion;
export const ANALYSIS_ORDERED_FIELDS = AI_CONTRACTS.analysis.orderedFields;
export const PRESETS_REFRESH_SCHEMA_VERSION = AI_CONTRACTS.presetsRefresh.schemaVersion;
export const PRESETS_REFRESH_ORDERED_FIELDS = AI_CONTRACTS.presetsRefresh.orderedFields;
export const DIMENSIONS_REFRESH_SCHEMA_VERSION = AI_CONTRACTS.dimensionsRefresh.schemaVersion;
export const DIMENSIONS_REFRESH_ORDERED_FIELDS = AI_CONTRACTS.dimensionsRefresh.orderedFields;
export const DIMENSION_REPLACE_SCHEMA_VERSION = AI_CONTRACTS.dimensionReplace.schemaVersion;
export const DIMENSION_REPLACE_ORDERED_FIELDS = AI_CONTRACTS.dimensionReplace.orderedFields;
export const LIGHTING_SCHEMA_VERSION = AI_CONTRACTS.lighting.schemaVersion;
export const LIGHTING_ORDERED_FIELDS = AI_CONTRACTS.lighting.orderedFields;
export const OPTIMIZE_SCHEMA_VERSION = AI_CONTRACTS.optimize.schemaVersion;
export const OPTIMIZE_ORDERED_FIELDS = AI_CONTRACTS.optimize.orderedFields;
export const OPTIMIZE_BLOCK_ORDER = AI_CONTRACTS.optimize.blockOrder;

/* ---- Analysis Phase System Prompt (v3) ---- */
const ANALYSIS_SYSTEM_PROMPT = `你是一位专业的文生图提示词分析顾问。
用户会给你一段文生图提示词，请你分析该提示词的特点和可优化方向。

请返回一个 JSON 对象（不是数组），并严格按以下顶层字段顺序输出：
schemaVersion -> orderedFields -> dimensions -> elements -> presets -> sceneRecommendation -> compositionRecommendation

其中：
- schemaVersion 必须固定为 "${ANALYSIS_SCHEMA_VERSION}"
- orderedFields 必须固定为 ${JSON.stringify(ANALYSIS_ORDERED_FIELDS)}

1. "dimensions": 必须固定为 8 个可调节维度数组，每个维度包含：
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
   - textPassthrough（可选）: 当提示词明确要求出现确定文字时使用
     - enabled: true
     - text: 原文字符串，必须保留大小写、标点、换行，不翻译不改写
     - typographyHint: 简短字体/排版提示（可选）

   规则：
   - 人物/角色 → type: "character", layer: "foreground"
   - 环境/建筑/自然景物 → type: "object", layer: "background"
   - 如果提示词暗示了场景环境（如"窗外的雨天城市""废弃城堡"），也要生成对应的后景元素
   - 至少输出 1 个前景元素和 1 个后景元素（如果文意合理的话）
   - 如果提示词中没有明确人物，可把画面主体作为前景元素
   - 只有用户明确给出要出现的文字（如 写着“夜间营业”、标题为“糖果工坊”、text reads "OPEN"、says "SALE"）才输出 textPassthrough
   - 模糊文字诉求（如"一些宣传文字""英文标题感"）不要启用 textPassthrough

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
2. dimensions 必须严格输出 8 项，不多不少
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

你的任务：根据用户提供的原始提示词和各项参数，输出一个严格 JSON 合同（schema），其中包含分块结果与最终提示词。

只输出 JSON 对象，顶层字段顺序固定：
schemaVersion -> orderedFields -> blocks -> finalPrompt -> checks

其中：
- schemaVersion 固定为 "${OPTIMIZE_SCHEMA_VERSION}"
- orderedFields 固定为 ${JSON.stringify(OPTIMIZE_ORDERED_FIELDS)}
- blocks 的 key 必须按以下顺序完整输出：
${OPTIMIZE_BLOCK_ORDER.join(' -> ')}

格式如下：
{
  "schemaVersion": "${OPTIMIZE_SCHEMA_VERSION}",
  "orderedFields": ${JSON.stringify(OPTIMIZE_ORDERED_FIELDS)},
  "blocks": {
    "subject": "...",
    "composition": "...",
    "foreground": "...",
    "background": "...",
    "camera": "...",
    "lighting": "...",
    "style": "...",
    "exactText": "...",
    "negativeConstraints": "...",
    "renderConstraints": "..."
  },
  "finalPrompt": "单行完整提示词（可直接用于生图）",
  "checks": {
    "ratio": "16:9",
    "orientation": "landscape",
    "finalSize": "1536x864",
    "containsSingleAr": true,
    "exactTextProtected": true,
    "negativeConstraintsPreserved": true
  }
}

优化规则：
1. 先对原始语句做基础语法优化，使表达清晰流畅
2. 根据维度参数调整描述细节和侧重点
3. 前景元素自然融入提示词，避免机械罗列坐标
4. 后景元素作为背景语义补全
5. 焦点物品用自然语言明确视觉重心
6. 同一景深平面的元素应在描述中体现空间关联
7. 将相机机位、焦距、景别翻译为专业摄影术语
8. 将光圈、布光、色温、时段翻译为专业光影描述
9. finalPrompt 中仅允许一个 --ar，且与构图比例一致
10. 保持提示词核心创意不变
11. 不堆砌无意义关键词，不使用 emoji
12. 不使用"打造""赋能""沉浸式""震撼"等过度修饰词
13. 如果原始提示词是中文，finalPrompt 输出英文，但保持核心含义
14. 如果存在 Exact text blocks / textPassthrough，文本块原文必须原封不动保留，不翻译、不改写、不纠错、不改标点或换行
15. 如果存在 Negative constraints，必须只作为排除约束表达在 negativeConstraints block 和 finalPrompt 的 Avoid: 段中；不要把排除内容写进 subject/foreground/background 等正向描述
16. 排除约束优先于动漫/写实风格滑杆；若冲突，必须移除被排除的风格术语
17. 使用通用 Avoid: 自然语言，不要默认追加 Midjourney --no
18. 禁止输出 JSON 以外的解释文本`;



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
 * Build messages for presets-only refresh.
 * Keeps current dimensions and asks model to regenerate style presets only.
 */
export function buildPresetRefreshMessages(userPrompt, context = {}, styleLevel = 3) {
  const dims = Array.isArray(context.dimensions) ? context.dimensions : [];
  const currentPresets = Array.isArray(context.presets) ? context.presets : [];
  const dimNames = dims.map((item) => item?.name).filter(Boolean);

  const systemPrompt = `你是文生图提示词预设方案设计器。
请基于用户原始提示词和已存在的维度定义，重新生成预设方案。

只输出 JSON 对象，且顶层字段顺序固定：
schemaVersion -> orderedFields -> presets

其中：
- schemaVersion 固定为 "${PRESETS_REFRESH_SCHEMA_VERSION}"
- orderedFields 固定为 ${JSON.stringify(PRESETS_REFRESH_ORDERED_FIELDS)}

格式如下：
{
  "schemaVersion": "${PRESETS_REFRESH_SCHEMA_VERSION}",
  "orderedFields": ${JSON.stringify(PRESETS_REFRESH_ORDERED_FIELDS)},
  "presets": [
    {
      "name": "2-4字名称",
      "description": "一句话说明",
      "values": {
        "维度A": 0-100,
        "维度B": 0-100
      }
    }
  ]
}

约束：
1. presets 返回 2~4 项
2. values 的 key 必须且只能使用以下维度名：${JSON.stringify(dimNames)}
3. 每个值必须是 0~100 的整数
4. 禁止 markdown 代码块，禁止额外说明`;

  const userMessage = `原始提示词:
${userPrompt}

当前维度定义:
${JSON.stringify(dims, null, 2)}

当前预设(供参考，可改写):
${JSON.stringify(currentPresets, null, 2)}

目标风格强度:
${styleLevel}/10`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
}

/**
 * Build messages for dimensions-only refresh.
 * Returns exactly 8 dimensions.
 */
export function buildDimensionsRefreshMessages(userPrompt, context = {}, styleLevel = 3) {
  const currentDims = Array.isArray(context.dimensions) ? context.dimensions : [];
  const systemPrompt = `你是文生图提示词维度分析器。
请仅刷新“调节维度”，不要输出人物元素、预设或其他字段。

只输出 JSON 对象，且顶层字段顺序固定：
schemaVersion -> orderedFields -> dimensions

其中：
- schemaVersion 固定为 "${DIMENSIONS_REFRESH_SCHEMA_VERSION}"
- orderedFields 固定为 ${JSON.stringify(DIMENSIONS_REFRESH_ORDERED_FIELDS)}

格式如下：
{
  "schemaVersion": "${DIMENSIONS_REFRESH_SCHEMA_VERSION}",
  "orderedFields": ${JSON.stringify(DIMENSIONS_REFRESH_ORDERED_FIELDS)},
  "dimensions": [
    {
      "name": "2-4字",
      "description": "一句话说明",
      "min": 0,
      "max": 100,
      "default": 0-100,
      "labels": ["低端描述", "高端描述"]
    }
  ]
}

硬性要求：
1. dimensions 必须严格 8 项
2. min/max 固定 0/100
3. default 必须是 0~100 整数
4. labels 必须恰好2项
5. 禁止 markdown 代码块，禁止解释`;

  const userMessage = `原始提示词:
${userPrompt}

当前维度(供参考):
${JSON.stringify(currentDims, null, 2)}

目标风格强度:
${styleLevel}/10`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
}

/**
 * Build messages for iterative re-analysis over an existing analysis snapshot.
 * Returns full strict analysis schema.
 */
export function buildIterationMessages(userPrompt, context = {}, iterationRequest = '', styleLevel = 3) {
  const snapshot = {
    dimensions: Array.isArray(context.dimensions) ? context.dimensions : [],
    elements: Array.isArray(context.elements) ? context.elements : [],
    presets: Array.isArray(context.presets) ? context.presets : [],
    sceneRecommendation: context.sceneRecommendation || null,
    compositionRecommendation: context.compositionRecommendation || null,
  };

  const systemPrompt = `你是文生图提示词迭代分析助手。
你会收到一份“当前分析快照”和“本轮迭代诉求”，请输出新的完整分析 JSON。

必须严格按以下顶层字段顺序输出：
schemaVersion -> orderedFields -> dimensions -> elements -> presets -> sceneRecommendation -> compositionRecommendation

其中：
- schemaVersion 固定为 "${ANALYSIS_SCHEMA_VERSION}"
- orderedFields 固定为 ${JSON.stringify(ANALYSIS_ORDERED_FIELDS)}
- dimensions 必须严格 8 项
- presets.values 的 key 必须与 dimensions.name 完全一致
- 只输出 JSON，不要 markdown 代码块，不要解释`;

  const userMessage = `原始提示词:
${userPrompt}

当前分析快照:
${JSON.stringify(snapshot, null, 2)}

本轮迭代诉求:
${iterationRequest || '在不偏离原意的前提下提升可控性与一致性' }

目标风格强度:
${styleLevel}/10`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
}

/**
 * Build messages for replacing a single dimension while preserving total count=8.
 */
export function buildReplaceDimensionMessages(userPrompt, context = {}, targetDimensionName = '', replaceRequest = '', styleLevel = 3) {
  const currentDims = Array.isArray(context.dimensions) ? context.dimensions : [];
  const systemPrompt = `你是文生图提示词维度替换助手。
请只返回“一个新维度”用于替换目标维度，不要输出数组。

只输出 JSON 对象，且顶层字段顺序固定：
schemaVersion -> orderedFields -> dimension

其中：
- schemaVersion 固定为 "${DIMENSION_REPLACE_SCHEMA_VERSION}"
- orderedFields 固定为 ${JSON.stringify(DIMENSION_REPLACE_ORDERED_FIELDS)}

格式如下：
{
  "schemaVersion": "${DIMENSION_REPLACE_SCHEMA_VERSION}",
  "orderedFields": ${JSON.stringify(DIMENSION_REPLACE_ORDERED_FIELDS)},
  "dimension": {
    "name": "2-4字",
    "description": "一句话说明",
    "min": 0,
    "max": 100,
    "default": 0-100,
    "labels": ["低端描述", "高端描述"]
  }
}

约束：
1. 输出仅包含 dimension 字段
2. min/max 固定 0/100
3. default 必须是 0~100 整数
4. labels 必须恰好2项
5. name 不能与现有其它维度重名
6. 禁止 markdown 代码块，禁止解释`;

  const userMessage = `原始提示词:
${userPrompt}

当前维度:
${JSON.stringify(currentDims, null, 2)}

目标替换维度:
${targetDimensionName}

替换诉求:
${replaceRequest || '替换为更有区分度且可操作的维度'}

目标风格强度:
${styleLevel}/10`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
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

只输出 JSON 对象，且顶层字段顺序固定：
schemaVersion -> orderedFields -> lights -> reason

其中：
- schemaVersion 固定为 "${LIGHTING_SCHEMA_VERSION}"
- orderedFields 固定为 ${JSON.stringify(LIGHTING_ORDERED_FIELDS)}

格式如下：
{
  "schemaVersion": "${LIGHTING_SCHEMA_VERSION}",
  "orderedFields": ${JSON.stringify(LIGHTING_ORDERED_FIELDS)},
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
6. 禁止 markdown 代码块，禁止解释文本`;

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

只输出 JSON，顶层字段顺序固定：
schemaVersion -> orderedFields -> lights -> reason

其中：
- schemaVersion 固定为 "${LIGHTING_SCHEMA_VERSION}"
- orderedFields 固定为 ${JSON.stringify(LIGHTING_ORDERED_FIELDS)}

格式如下：
{
  "schemaVersion": "${LIGHTING_SCHEMA_VERSION}",
  "orderedFields": ${JSON.stringify(LIGHTING_ORDERED_FIELDS)},
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
 * @param {string|Object} params.composition — composition ratio or final pixel-size object
 * @param {Array} params.elements — element layout data (foreground + background)
 * @param {Array} params.links — element relationship/depth links
 * @param {Object} params.scene — camera/aperture/lighting data
 */
export function buildOptimizeMessages(userPrompt, params) {
  const { dimensions, composition, elements, links, scene, style = 3, canvasNegativePrompt = null } = params;

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
    const widthPx = Number.isFinite(composition.width) ? composition.width : '';
    const heightPx = Number.isFinite(composition.height) ? composition.height : '';
    const oLabel = o === 'portrait' ? 'portrait' : o === 'square' ? 'square' : 'landscape';
    const finalSizeText = widthPx && heightPx ? `final canvas size ${widthPx}x${heightPx} px` : '';
    compDesc = `${r} ${oLabel}, aspect ratio ${r}, --ar ${r}${finalSizeText ? `, ${finalSizeText}` : ''}`;
  } else {
    const compMap = { '16:9': '16:9 landscape (--ar 16:9)', '2:3': '2:3 portrait (--ar 2:3)', '9:16': '9:16 portrait (--ar 9:16)', '1:1': '1:1 square (--ar 1:1)' };
    compDesc = compMap[composition] || '16:9 landscape (--ar 16:9)';
  }

  // Elements — split by layer, use spatial descriptions instead of raw coords
  let fgDesc = 'none';
  let bgDesc = 'none';
  const allElems = elements || [];

  const fgElems = allElems.filter(e => e.layer === 'foreground');
  const bgElems = allElems.filter(e => e.layer === 'background');
  const textElems = allElems
    .filter((e) => isTextPassthroughElement(e))
    .sort((a, b) => {
      const zDelta = (a.zIndex ?? 0) - (b.zIndex ?? 0);
      if (zDelta !== 0) return zDelta;
      const yDelta = (a.y ?? 50) - (b.y ?? 50);
      if (Math.abs(yDelta) > 4) return yDelta;
      return (a.x ?? 50) - (b.x ?? 50);
    });
  const textElementIds = new Set(textElems.map((e) => e.id));
  const negativeEntries = collectNegativePrompts(allElems, canvasNegativePrompt);

  if (fgElems.length > 0) {
    fgDesc = fgElems
      .filter((e) => !textElementIds.has(e.id))
      .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))
      .map(e => {
        let line = `- ${e.name}: ${posToSpatial(e.x, e.y)}, ${sizeToScale(e.w, e.h)}`;
        if (e.description) line += `, "${e.description}"`;
        if (e.prompt) line += `, prompt: "${e.prompt}"`;
        if (e.focusPoint) line += `, [focus: ${e.focusPoint}]`;
        return line;
      }).join('\n');
    if (!fgDesc) fgDesc = 'none';
  }

  if (bgElems.length > 0) {
    bgDesc = bgElems
      .filter((e) => !textElementIds.has(e.id))
      .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))
      .map(e => {
        let line = `- ${e.name}: ${posToSpatial(e.x, e.y)}, ${sizeToScale(e.w, e.h)}`;
        if (e.description) line += `, "${e.description}"`;
        if (e.prompt) line += `, prompt: "${e.prompt}"`;
        if (e.focusPoint) line += `, [focus: ${e.focusPoint}]`;
        return line;
      }).join('\n');
    if (!bgDesc) bgDesc = 'none';
  }

  let exactTextDesc = 'none';
  if (textElems.length > 0) {
    exactTextDesc = textElems.map((e) => {
      const text = quoteExactText(e.textPassthrough.text);
      const hint = e.textPassthrough.typographyHint?.trim()
        ? `, ${e.textPassthrough.typographyHint.trim()}`
        : ', readable typography';
      return `- Text block ${text}: place at ${posToSpatial(e.x, e.y)}, ${sizeToScale(e.w, e.h)} size${hint}. Do not translate, rewrite, correct, or change punctuation.`;
    }).join('\n');
  }

  const negativeDesc = formatNegativePromptEntries(negativeEntries);

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

  const contractHint = `Output contract:
- Return JSON only.
- schemaVersion: ${OPTIMIZE_SCHEMA_VERSION}
- orderedFields: ${JSON.stringify(OPTIMIZE_ORDERED_FIELDS)}
- blocks order: ${OPTIMIZE_BLOCK_ORDER.join(' -> ')}
- finalPrompt must be one complete text prompt and must contain exactly one --ar matching the Composition line.
- If Negative constraints are not "none", finalPrompt must include one Avoid: segment before render/platform constraints.`;

  const userMessage = `${contractHint}

Original prompt:
${userPrompt}

Target style: ${styleLabel}

Composition: ${compDesc}

Foreground elements (front to back):
${fgDesc}

Background elements (front to back):
${bgDesc}

Exact text blocks, preserve verbatim:
${exactTextDesc}

Negative constraints, preserve as exclusions only:
${negativeDesc}
Priority rule: negative constraints override the style slider and all positive sections. If an exclusion conflicts with anime/realism terms, omit the conflicting style terms from blocks and finalPrompt.

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
 * Parse full analysis response (strict mode).
 * Requires:
 * - top-level object
 * - schemaVersion == ANALYSIS_SCHEMA_VERSION
 * - orderedFields exactly equals ANALYSIS_ORDERED_FIELDS
 * - dimensions count exactly 8
 */
export function parseAnalysisResponse(text) {
  const parsed = tryParseJsonWithExtractors(text, { allowLooseObject: false, allowLooseArray: false });
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (!isStrictAnalysisEnvelope(parsed)) return null;

  const dimensions = normalizeDimensions(parsed.dimensions, { exactCount: 8 });
  if (!dimensions) return null;

  const elements = normalizeElements(parsed.elements || []);
  const characters = normalizeCharacters(parsed.characters || []);
  const presets = normalizePresets(parsed.presets || [], dimensions);
  const sceneRecommendation = normalizeSceneRecommendation(parsed.sceneRecommendation);
  const compositionRecommendation = normalizeCompositionRecommendation(parsed.compositionRecommendation);

  return {
    dimensions,
    elements,
    characters,
    presets,
    sceneRecommendation,
    compositionRecommendation,
    schemaVersion: parsed.schemaVersion,
    orderedFields: parsed.orderedFields,
    __contract: makeContractMeta({
      step: 'analysis',
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      contractValid: true,
      finalSource: 'first-pass',
    }),
  };
}

/**
 * Parse dimensions-only refresh response.
 * Accepts:
 * - { dimensions: [...] } or direct dimensions array
 */
export function parseDimensionsRefreshResponse(text) {
  const parsed = tryParseJsonWithExtractors(text, { allowLooseObject: false, allowLooseArray: false });
  if (!parsed) return null;

  if (Array.isArray(parsed)) {
    const dimensions = normalizeDimensions(parsed, { exactCount: 8 });
    return dimensions
      ? {
          dimensions,
          __contract: makeContractMeta({
            step: 'dimensions_refresh',
            schemaVersion: DIMENSIONS_REFRESH_SCHEMA_VERSION,
            contractValid: false,
            contractErrors: ['schema_error:legacy_array_response'],
            fallbackUsed: true,
            finalSource: 'fallback',
          }),
        }
      : null;
  }

  const strictErrors = validateContractEnvelope(parsed, AI_CONTRACTS.dimensionsRefresh);
  if (strictErrors.length === 0) {
    const dimensions = normalizeDimensions(parsed.dimensions, { exactCount: 8 });
    return dimensions
      ? {
          dimensions,
          __contract: makeContractMeta({
            step: 'dimensions_refresh',
            schemaVersion: DIMENSIONS_REFRESH_SCHEMA_VERSION,
            contractValid: true,
            finalSource: 'first-pass',
          }),
        }
      : null;
  }

  const dimensions = normalizeDimensions(parsed.dimensions, { exactCount: 8 });
  return dimensions
    ? {
        dimensions,
        __contract: makeContractMeta({
          step: 'dimensions_refresh',
          schemaVersion: DIMENSIONS_REFRESH_SCHEMA_VERSION,
          contractValid: false,
          contractErrors: strictErrors,
          fallbackUsed: true,
          finalSource: 'fallback',
        }),
      }
    : null;
}

/**
 * Parse presets-only refresh response.
 * Accepts:
 * - { presets: [...] } or direct presets array
 */
export function parsePresetRefreshResponse(text, dimensions) {
  const parsed = tryParseJsonWithExtractors(text, { allowLooseObject: false, allowLooseArray: false });
  if (!parsed) return null;
  if (!Array.isArray(dimensions) || dimensions.length !== 8) return null;

  if (Array.isArray(parsed)) {
    const presets = normalizePresets(parsed || [], dimensions);
    return presets.length > 0
      ? {
          presets,
          __contract: makeContractMeta({
            step: 'presets_refresh',
            schemaVersion: PRESETS_REFRESH_SCHEMA_VERSION,
            contractValid: false,
            contractErrors: ['schema_error:legacy_array_response'],
            fallbackUsed: true,
            finalSource: 'fallback',
          }),
        }
      : null;
  }

  const strictErrors = validateContractEnvelope(parsed, AI_CONTRACTS.presetsRefresh);
  if (strictErrors.length === 0) {
    const presets = normalizePresets(parsed.presets || [], dimensions);
    return presets.length > 0
      ? {
          presets,
          __contract: makeContractMeta({
            step: 'presets_refresh',
            schemaVersion: PRESETS_REFRESH_SCHEMA_VERSION,
            contractValid: true,
            finalSource: 'first-pass',
          }),
        }
      : null;
  }

  const presets = normalizePresets(parsed.presets || [], dimensions);
  return presets.length > 0
    ? {
        presets,
        __contract: makeContractMeta({
          step: 'presets_refresh',
          schemaVersion: PRESETS_REFRESH_SCHEMA_VERSION,
          contractValid: false,
          contractErrors: strictErrors,
          fallbackUsed: true,
          finalSource: 'fallback',
        }),
      }
    : null;
}

/**
 * Parse single replacement dimension response.
 * Accepts:
 * - { dimension: {...} } or direct dimension object
 */
export function parseDimensionReplacementResponse(text) {
  const parsed = tryParseJsonWithExtractors(text, { allowLooseObject: false, allowLooseArray: false });
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  let contractMeta = makeContractMeta({
    step: 'dimension_replace',
    schemaVersion: DIMENSION_REPLACE_SCHEMA_VERSION,
    contractValid: false,
    contractErrors: ['schema_error:legacy_response'],
    fallbackUsed: true,
    finalSource: 'fallback',
  });

  if (validateContractEnvelope(parsed, AI_CONTRACTS.dimensionReplace).length === 0) {
    contractMeta = makeContractMeta({
      step: 'dimension_replace',
      schemaVersion: DIMENSION_REPLACE_SCHEMA_VERSION,
      contractValid: true,
      finalSource: 'first-pass',
    });
  }

  const candidate = parsed.dimension && typeof parsed.dimension === 'object' ? parsed.dimension : parsed;
  const dims = normalizeDimensions([candidate], { exactCount: 1 });
  if (!dims || dims.length !== 1) return null;
  return { dimension: dims[0], __contract: contractMeta };
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
      contractMeta: makeContractMeta({
        step: 'lighting',
        schemaVersion: LIGHTING_SCHEMA_VERSION,
        contractValid: false,
        contractErrors: ['schema_error:empty_text'],
        finalSource: 'first-pass',
      }),
    };
  }
  const parsed = tryParseJsonWithExtractors(text, { allowLooseObject: true, allowLooseArray: false });
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      recommendation: null,
      raw: null,
      parseError: 'invalid_json_object',
      contractMeta: makeContractMeta({
        step: 'lighting',
        schemaVersion: LIGHTING_SCHEMA_VERSION,
        contractValid: false,
        contractErrors: ['schema_error:invalid_json_object'],
        finalSource: 'first-pass',
      }),
    };
  }
  const strictErrors = validateContractEnvelope(parsed, AI_CONTRACTS.lighting);
  const sourceLightsPayload = strictErrors.length === 0
    ? { lights: parsed.lights, reason: parsed.reason }
    : parsed;

  const recommendation = normalizeLightingRecommendation(sourceLightsPayload);
  return {
    recommendation,
    raw: parsed,
    parseError: recommendation ? null : 'normalize_failed',
    contractMeta: makeContractMeta({
      step: 'lighting',
      schemaVersion: LIGHTING_SCHEMA_VERSION,
      contractValid: strictErrors.length === 0,
      contractErrors: strictErrors,
      fallbackUsed: strictErrors.length > 0,
      finalSource: strictErrors.length === 0 ? 'first-pass' : 'fallback',
    }),
  };
}

/**
 * Parse optimization response contract.
 * Supports strict cc.optimize.v1 and legacy plain-text fallback.
 * @param {string} text
 * @param {Object} context
 * @param {Object} context.composition
 * @param {Object} context.scene
 * @param {Array<string>} context.exactTexts
 * @returns {{ finalPrompt: string, blocks: Object, checks: Object, contractMeta: Object } | null}
 */
export function parseOptimizeResponse(text, context = {}) {
  const parsed = tryParseJsonWithExtractors(text, { allowLooseObject: true, allowLooseArray: false });
  const negativePrompts = Array.isArray(context.negativePrompts) ? context.negativePrompts : [];
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const strictErrors = validateContractEnvelope(parsed, AI_CONTRACTS.optimize);
    if (strictErrors.length === 0) {
      const blocks = normalizeOptimizeBlocks(parsed.blocks);
      const finalPrompt = normalizeFinalPrompt(parsed.finalPrompt);
      if (blocks && finalPrompt) {
        const semanticConflicts = auditPromptSemantics({
          prompt: finalPrompt,
          composition: context.composition || null,
          scene: context.scene || null,
          exactTexts: Array.isArray(context.exactTexts) ? context.exactTexts : [],
          negativePrompts,
        });
        return {
          finalPrompt,
          blocks,
          checks: normalizeOptimizeChecks(parsed.checks),
          contractMeta: makeContractMeta({
            step: 'optimize',
            schemaVersion: OPTIMIZE_SCHEMA_VERSION,
            contractValid: true,
            semanticConflicts,
            finalSource: 'first-pass',
          }),
        };
      }
      return {
        finalPrompt: '',
        blocks: null,
        checks: {},
        contractMeta: makeContractMeta({
          step: 'optimize',
          schemaVersion: OPTIMIZE_SCHEMA_VERSION,
          contractValid: false,
          contractErrors: ['schema_error:missing_blocks_or_finalPrompt'],
          finalSource: 'first-pass',
        }),
      };
    }
    const looseFinalPrompt = normalizeFinalPrompt(parsed.finalPrompt);
    if (looseFinalPrompt) {
      const semanticConflicts = auditPromptSemantics({
        prompt: looseFinalPrompt,
        composition: context.composition || null,
        scene: context.scene || null,
        exactTexts: Array.isArray(context.exactTexts) ? context.exactTexts : [],
        negativePrompts,
      });
      return {
        finalPrompt: looseFinalPrompt,
        blocks: normalizeOptimizeBlocks(parsed.blocks),
        checks: normalizeOptimizeChecks(parsed.checks),
        contractMeta: makeContractMeta({
          step: 'optimize',
          schemaVersion: OPTIMIZE_SCHEMA_VERSION,
          contractValid: false,
          contractErrors: strictErrors,
          semanticConflicts,
          fallbackUsed: true,
          finalSource: 'fallback',
        }),
      };
    }
  }

  const fallbackPrompt = normalizeFinalPrompt(text);
  if (!fallbackPrompt) return null;
  const semanticConflicts = auditPromptSemantics({
    prompt: fallbackPrompt,
    composition: context.composition || null,
    scene: context.scene || null,
    exactTexts: Array.isArray(context.exactTexts) ? context.exactTexts : [],
    negativePrompts,
  });
  return {
    finalPrompt: fallbackPrompt,
    blocks: null,
    checks: {},
    contractMeta: makeContractMeta({
      step: 'optimize',
      schemaVersion: OPTIMIZE_SCHEMA_VERSION,
      contractValid: false,
      contractErrors: ['schema_error:legacy_plain_text'],
      semanticConflicts,
      fallbackUsed: true,
      finalSource: 'fallback',
    }),
  };
}

function isStrictAnalysisEnvelope(parsed) {
  return validateContractEnvelope(parsed, AI_CONTRACTS.analysis).length === 0;
}

/* ---- Normalization Helpers ---- */

function normalizeDimensions(arr, { exactCount = null } = {}) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  if (Number.isInteger(exactCount) && arr.length !== exactCount) return null;

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

  if (Number.isInteger(exactCount) && normalized.length !== exactCount) return null;
  return normalized.length > 0 ? normalized : null;
}

function normalizeElements(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((item) => item && typeof item.name === 'string')
    .map((item, i) => ({
      id: item.id || `elem_${i + 1}`,
      type: item.type === 'object' ? 'object' : 'character',
      layer: item.layer === 'background' ? 'background' : 'foreground',
      name: item.name,
      description: item.description || '',
      prompt: item.prompt || '',
      role: item.role || '',
      position: {
        x: clamp(item.position?.x ?? item.x ?? 50, 0, 100),
        y: clamp(item.position?.y ?? item.y ?? 50, 0, 100),
      },
      size: {
        w: clamp(item.size?.w ?? item.w ?? 18, 5, 60),
        h: clamp(item.size?.h ?? item.h ?? 28, 5, 60),
      },
      focusPoint: item.focusPoint || '',
      textPassthrough: normalizeTextPassthrough(item.textPassthrough),
      negativePrompt: normalizeNegativePrompt(item.negativePrompt),
    }));
}

function normalizeTextPassthrough(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = String(source.text || '');
  const typographyHint = String(source.typographyHint || '');
  return {
    enabled: Boolean(source.enabled && text.trim()),
    text,
    typographyHint,
  };
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

function normalizeOptimizeBlocks(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const normalized = {};
  for (const key of OPTIMIZE_BLOCK_ORDER) {
    const value = raw[key];
    if (typeof value !== 'string') return null;
    normalized[key] = value.trim();
  }
  return normalized;
}

function normalizeOptimizeChecks(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const next = {};
  if (typeof raw.ratio === 'string') next.ratio = raw.ratio.trim();
  if (typeof raw.orientation === 'string') next.orientation = raw.orientation.trim();
  if (typeof raw.finalSize === 'string') next.finalSize = raw.finalSize.trim();
  if (typeof raw.containsSingleAr === 'boolean') next.containsSingleAr = raw.containsSingleAr;
  if (typeof raw.exactTextProtected === 'boolean') next.exactTextProtected = raw.exactTextProtected;
  if (typeof raw.negativeConstraintsPreserved === 'boolean') next.negativeConstraintsPreserved = raw.negativeConstraintsPreserved;
  return next;
}

function normalizeFinalPrompt(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function isTextPassthroughElement(elem) {
  const tp = elem?.textPassthrough;
  if (!tp || typeof tp !== 'object') return false;
  if (!tp.enabled) return false;
  return String(tp.text || '').trim().length > 0;
}

function quoteExactText(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '""';
  return `"${normalized.replace(/"/g, '\\"')}"`;
}

function collectNegativePrompts(elements = [], canvasNegativePrompt = null) {
  const entries = [];
  const globalNegative = normalizeNegativePrompt(canvasNegativePrompt);
  if (globalNegative.enabled) {
    entries.push({
      scope: 'global',
      text: globalNegative.text,
      label: 'Global canvas',
    });
  }

  for (const elem of Array.isArray(elements) ? elements : []) {
    const negative = normalizeNegativePrompt(elem?.negativePrompt);
    if (!negative.enabled) continue;
    entries.push({
      scope: 'object',
      elementId: elem.id || '',
      elementName: elem.name || 'object',
      elementLayer: elem.layer || 'foreground',
      text: negative.text,
      label: `${elem.name || 'object'} at ${posToSpatial(elem.x ?? elem.position?.x ?? 50, elem.y ?? elem.position?.y ?? 50)}`,
    });
  }
  return entries;
}

function formatNegativePromptEntries(entries) {
  if (!entries.length) return 'none';
  return entries.map((entry) => {
    const quoted = quoteExactText(entry.text);
    if (entry.scope === 'global') {
      return `- Global: Avoid ${quoted}. Applies to the entire image. Keep this only as a negative constraint; do not turn it into a positive visual description.`;
    }
    const layerLabel = entry.elementLayer === 'background' ? 'background object' : 'foreground object';
    return `- Object "${entry.elementName}" (${layerLabel}, ${entry.label}): Avoid ${quoted}. Applies only to this object; do not apply it to unrelated objects or the background.`;
  }).join('\n');
}

function normalizeNegativePrompt(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = String(source.text || '');
  return {
    enabled: Boolean(source.enabled && text.trim()),
    text,
  };
}
