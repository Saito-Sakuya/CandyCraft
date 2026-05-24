import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  buildAnalysisMessages,
  buildOptimizeMessages,
  parseAnalysisResponse,
} from '../../js/prompt.js';
import { inferSceneRecommendationFromPrompt } from '../../js/scene-recommendation.js';

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
  { id: 'S06', group: 'portrait', prompt: '棚拍人像，伦勃朗布光，85mm，中景，肤色自然' },
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

function makeSceneFromReco(reco) {
  const normalized = reco || {};
  const timeOfDay = normalized.timeOfDay || '正午';
  const colorTempMap = { 夜晚: '冷蓝', 蓝调: '冷蓝', 日出: '暖黄', 黄金: '金橙', 正午: '自然' };
  const qualityMap = { 夜晚: '中性', 蓝调: '柔光', 日出: '柔光', 黄金: '柔光', 正午: '硬光' };

  return {
    cameraPreset: normalized.cameraPreset || '平视 (eye-level shot)',
    focalLength: '50mm - 50mm standard lens, no distortion',
    framing: '中景 (medium shot (MS), waist up)',
    aperture: 'f/2.8',
    lightingPreset: normalized.lightingPreset || '自然光',
    lightQuality: `${normalized.lightQuality || qualityMap[timeOfDay] || '中性'} (rule-based)`,
    colorTemp: `${normalized.colorTemp || colorTempMap[timeOfDay] || '自然'} (rule-based)`,
    timeOfDay: `${timeOfDay} (rule-based)`,
    lights: {
      'key light': { on: true, type: '聚光灯', typeEn: 'spotlight, hard directional light', watts: 500, lumens: 5000, subjectLumens: 2600 },
      'fill light': { on: true, type: '柔光箱', typeEn: 'softbox, diffused soft light', watts: 220, lumens: 2200, subjectLumens: 1100 },
      'back light': { on: true, type: '发灯', typeEn: 'hair light, rim light, edge separation', watts: 180, lumens: 1800, subjectLumens: 800 },
      'hair light': { on: false, type: '发灯', typeEn: 'hair light, rim light, edge separation', watts: 100, lumens: 1000, subjectLumens: 0 },
    },
  };
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

function collectIssues({ optimizeInput, optimizedPrompt, inferredReco }) {
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

  if (has(['hard light']) && has(['soft diffused light'])) {
    issues.push({
      severity: 'low',
      code: 'light_quality_conflict',
      message: '同段落出现硬光与柔光并列，可能导致引擎理解分散。',
      suggestion: '明确主光光质，再对补光写“soft fill”作为次级条件。',
    });
  }

  if (inferredReco?.timeOfDay === '夜晚' && has(['golden hour', 'sunrise'])) {
    issues.push({
      severity: 'high',
      code: 'night_scene_drift',
      message: '夜景样本漂移到晨昏时段表达。',
      suggestion: '锁定夜晚关键词并禁止晨昏词汇进入最终提示词。',
    });
  }

  return issues;
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
    const inferredReco = inferSceneRecommendationFromPrompt(sample.prompt);
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
    const scene = makeSceneFromReco(inferredReco);

    const optimizeMessages = buildOptimizeMessages(sample.prompt, {
      dimensions,
      composition: { ratio: '16:9', orientation: 'landscape', resolution: '2K' },
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

    const issues = collectIssues({ optimizeInput, optimizedPrompt, inferredReco });
    results.push({
      id: sample.id,
      group: sample.group,
      prompt: sample.prompt,
      modelEndpointAvailable,
      inferredReco: inferredReco || null,
      issues,
      status: issues.length ? 'fail' : 'pass',
      optimizeModelError,
      optimizePreview: optimizedPrompt ? optimizedPrompt.slice(0, 220) : '',
      optimizeInputPreview: optimizeInput.slice(0, 220),
    });
  }

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
    '| ID | Group | Status | Issue count | Key note |',
    '|---|---|---|---:|---|',
    ...summary.results.map((item) => {
      const note = item.issues[0]?.message || '无明显歧义';
      return `| ${item.id} | ${item.group} | ${item.status.toUpperCase()} | ${item.issues.length} | ${note} |`;
    }),
    '',
    '## Detailed Issues',
    ...summary.results.flatMap((item) => {
      if (!item.issues.length) return [`- ${item.id}: PASS`];
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
