/**
 * prompt.js — System prompts and prompt construction (v2)
 * Two-phase AI conversation: Analysis returns dimensions + characters + presets,
 * Optimization incorporates composition, character layout, camera, and lighting.
 */

/* ---- Analysis Phase System Prompt (v2) ---- */
const ANALYSIS_SYSTEM_PROMPT = `你是一位专业的文生图提示词分析顾问。
用户会给你一段文生图提示词，请你分析该提示词的特点和可优化方向。

请返回一个 JSON 对象（不是数组），包含以下三个字段：

1. "dimensions": 6~8 个可调节的优化维度数组，每个维度包含：
   - name: 维度名称（简短，2-4个字，如"画面细节""光影层次""色调氛围""构图张力""材质表现""叙事深度""风格强度""氛围渲染"）
   - description: 一句话说明该维度的含义
   - min: 0
   - max: 100
   - default: 你对当前提示词在该维度上的评估值（0-100）
   - labels: [最小端描述, 最大端描述]，如 ["极简克制", "极致细腻"]

2. "characters": 从提示词中提取的人物/主体列表数组，每个包含：
   - id: 唯一标识（如 "char_1"）
   - name: 角色名称
   - description: 角色的外观或特征简述
   - role: "主角" 或 "配角" 或 "背景"
   - position: { "x": 0-100, "y": 0-100 } 你建议的画面位置（百分比坐标）
   - size: { "w": 10-40, "h": 15-50 } 你建议的框体尺寸（百分比）

   如果提示词中没有明确人物，可返回画面中的主要物体/主体作为替代。
   如果只有一个主体，也要返回。

3. "presets": 2~4 个预设优化方案数组，每个包含：
   - name: 方案名称（2-4个字，如"电影海报""水彩插画""极简美学"）
   - description: 一句话说明该方案的风格取向
   - values: 一个对象，key 是维度名称，value 是该方案下的推荐值（0-100）

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
3. 将人物布局信息自然地融入提示词中（如位置关系、互动动作），不要机械罗列坐标
4. 将相机机位翻译为专业的摄影术语（如 low-angle shot, bird's eye view）
5. 将光圈和布光方案翻译为专业的光影描述
6. 将构图比例反映在画面描述中
7. 保持提示词的核心创意意图不变
8. 输出应当是自然的、可直接用于生图的完整提示词
9. 不要堆砌无意义的关键词
10. 不要使用 emoji
11. 不要使用"打造""赋能""沉浸式""震撼"等过度修饰的词汇
12. 如果原始提示词是中文，优化后输出英文（因为大多数生图模型对英文支持更好），但保持核心含义
13. 直接输出优化后的提示词，不要输出分析过程或解释`;



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
 * Build messages for the optimization phase (v2 — full parameters)
 * @param {string} userPrompt — original prompt
 * @param {Object} params — all optimization parameters
 * @param {Array} params.dimensions — slider dimension values
 * @param {string} params.composition — '16:9' | '9:16' | '1:1'
 * @param {Array} params.characters — character layout data
 * @param {Array} params.bindings — character relationship bindings
 * @param {Object} params.scene — camera/aperture/lighting data
 */
export function buildOptimizeMessages(userPrompt, params) {
  const { dimensions, composition, characters, bindings, scene, style = 3 } = params;

  const styleLevel = typeof style === 'number' ? style : 3;
  const styleLabel = `动漫/写实程度 ${styleLevel}/10（${styleLevel <= 3 ? '偏动漫' : styleLevel <= 6 ? '半写实' : '偏写实'}）`;
  const styleSuffix = buildOptimizeStyleSuffix(styleLevel);
  const systemPrompt = OPTIMIZE_SYSTEM_PROMPT_BASE + styleSuffix;

  // Dimensions
  const dimDesc = dimensions
    .map(d => `${d.name}: ${d.value}/${d.max} (${d.labels[0]} ← → ${d.labels[1]})`)
    .join('\n');

  // Composition
  const compMap = { '16:9': '横向 (16:9)', '9:16': '纵向 (9:16)', '1:1': '方形 (1:1)' };
  const compDesc = compMap[composition] || '横向 (16:9)';

  // Characters
  let charDesc = '无明确人物';
  if (characters && characters.length > 0) {
    charDesc = characters.map(c =>
      `- ${c.name}: 位置(${Math.round(c.x)}%, ${Math.round(c.y)}%), 大小(${Math.round(c.w)}%×${Math.round(c.h)}%), 描述: "${c.description || ''}"`
    ).join('\n');
  }

  // Bindings
  let bindDesc = '无';
  if (bindings && bindings.length > 0) {
    bindDesc = bindings.map(b => {
      const fromChar = characters?.find(c => c.id === b.fromId);
      const toChar = characters?.find(c => c.id === b.toId);
      return `- ${fromChar?.name || '?'} ←${b.label || b.type}→ ${toChar?.name || '?'}`;
    }).join('\n');
  }

  // Scene
  let sceneDesc = '默认';
  if (scene) {
    const parts = [];
    if (scene.cameraPreset) parts.push(`机位: ${scene.cameraPreset}`);
    if (scene.focalLength) parts.push(`焦距: ${scene.focalLength}`);
    if (scene.framing) parts.push(`景别: ${scene.framing}`);
    if (scene.aperture) parts.push(`光圈: ${scene.aperture}`);
    if (scene.lightingPreset) parts.push(`布光方案: ${scene.lightingPreset}`);
    if (scene.lightQuality) parts.push(`光线质感: ${scene.lightQuality}`);
    if (scene.colorTemp) parts.push(`色温: ${scene.colorTemp}`);
    if (scene.timeOfDay) parts.push(`时段: ${scene.timeOfDay}`);
    sceneDesc = parts.length > 0 ? parts.join('\n') : '默认';
  }

  const userMessage = `原始提示词：
${userPrompt}

目标风格：${styleLabel}

构图比例：${compDesc}

人物布局：
${charDesc}

人物关系：
${bindDesc}

各维度参数：
${dimDesc}

相机与布光：
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
 * @returns {{ dimensions: Array, characters: Array, presets: Array } | null}
 */
export function parseAnalysisResponse(text) {
  if (!text || typeof text !== 'string') return null;

  let cleaned = text.trim();
  let parsed = null;

  // Try multiple extraction strategies
  const extractors = [
    // 1. Direct parse
    (t) => JSON.parse(t),
    // 2. Code block extraction
    (t) => {
      const m = t.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      return m ? JSON.parse(m[1].trim()) : null;
    },
    // 3. Find first { and last }
    (t) => {
      const fi = t.indexOf('{');
      const li = t.lastIndexOf('}');
      return (fi !== -1 && li > fi) ? JSON.parse(t.substring(fi, li + 1)) : null;
    },
    // 4. Find first [ and last ] (v1 backward compat)
    (t) => {
      const fi = t.indexOf('[');
      const li = t.lastIndexOf(']');
      return (fi !== -1 && li > fi) ? JSON.parse(t.substring(fi, li + 1)) : null;
    },
  ];

  for (const extractor of extractors) {
    try {
      const result = extractor(cleaned);
      if (result) { parsed = result; break; }
    } catch { /* try next */ }
  }

  if (!parsed) return null;

  // v1 backward compatibility: if result is an array, treat as dimensions only
  if (Array.isArray(parsed)) {
    const dims = normalizeDimensions(parsed);
    return dims ? { dimensions: dims, characters: [], presets: [] } : null;
  }

  // v2 object format
  if (typeof parsed === 'object') {
    const dimensions = normalizeDimensions(parsed.dimensions);
    if (!dimensions) return null;

    const characters = normalizeCharacters(parsed.characters || []);
    const presets = normalizePresets(parsed.presets || [], dimensions);

    return { dimensions, characters, presets };
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
