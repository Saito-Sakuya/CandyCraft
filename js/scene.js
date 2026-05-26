/**
 * scene.js — Scene Three-View Panel v5
 * Unified 3D scene state + three-view synchronized editing + light coverage visualization.
 */
import { showToast } from './utils.js';

/* ============ State ============ */
let containerEl = null;
let views = {};
let indicatorRegistry = {};
let coverageRegistry = {};

let camera = { x: 50, y: 80, z: 50 };
let aperture = 'f/2.8';
let lightingPreset = '自然光';
let focalLength = '50mm';
let framing = '中景';
let lightQuality = '中性';
let colorTemp = '自然';
let timeOfDay = null;
let manualSceneChanged = false;
let sceneFoldState = {
  views: true,
  legend: false,
  lights: false,
  controls: false,
};
const sceneSubscribers = new Set();

const BASE_LIGHT_KEYS = ['key', 'fill', 'back', 'hair'];
const LEGACY_LIGHT_KEYS = ['key', 'fill', 'back', 'hair'];
const MAX_LIGHT_COUNT = 12;
const MIN_LIGHT_COUNT = 1;
let lightIds = [...BASE_LIGHT_KEYS];

/* ---- Light state: dynamic list (starts from 4 lights) ---- */
let lights = {
  key: { x: 30, y: 25, z: 72, on: true, type: '聚光灯', watts: 500, lumens: 5000 },
  fill: { x: 70, y: 40, z: 58, on: true, type: '柔光箱', watts: 300, lumens: 3000 },
  back: { x: 50, y: 15, z: 66, on: true, type: '环形灯', watts: 200, lumens: 2000 },
  hair: { x: 50, y: 10, z: 78, on: false, type: '发灯', watts: 100, lumens: 1000 },
};

const LIGHT_META = {
  key: { order: 1, label: '光源1', en: 'light source 1', color: '#FFE66D' },
  fill: { order: 2, label: '光源2', en: 'light source 2', color: '#89CFF3' },
  back: { order: 3, label: '光源3', en: 'light source 3', color: '#FFB997' },
  hair: { order: 4, label: '光源4', en: 'light source 4', color: '#C3A6FF' },
};
const LIGHT_COLOR_PALETTE = [
  '#FFE66D', '#89CFF3', '#FFB997', '#C3A6FF',
  '#9FE870', '#FFC76A', '#7ED6DF', '#F4A6FF',
  '#8BD1FF', '#FFD1A8', '#B7F7B0', '#D7C8FF',
];

const LIGHT_KEY_ALIASES = {
  key: 'key',
  fill: 'fill',
  back: 'back',
  hair: 'hair',
  light1: 'key',
  light2: 'fill',
  light3: 'back',
  light4: 'hair',
  source1: 'key',
  source2: 'fill',
  source3: 'back',
  source4: 'hair',
  光源1: 'key',
  光源2: 'fill',
  光源3: 'back',
  光源4: 'hair',
  主光: 'key',
  补光: 'fill',
  轮廓光: 'back',
  发灯: 'hair',
};

function getLightStateByKey(key) {
  return key ? lights[key] || null : null;
}

function getLightMetaByKey(key) {
  const index = lightIds.indexOf(key);
  if (index < 0) {
    return {
      order: 0,
      label: '光源?',
      en: 'light source ?',
      color: LIGHT_COLOR_PALETTE[0],
    };
  }
  const fallback = {
    order: index + 1,
    label: `光源${index + 1}`,
    en: `light source ${index + 1}`,
    color: LIGHT_COLOR_PALETTE[index % LIGHT_COLOR_PALETTE.length],
  };
  return {
    ...fallback,
    ...(LIGHT_META[key] || {}),
    order: index + 1,
    label: `光源${index + 1}`,
    en: `light source ${index + 1}`,
    color: (LIGHT_META[key]?.color || fallback.color),
  };
}

function getLegacyLightKeyMap() {
  const map = {};
  for (let i = 0; i < LEGACY_LIGHT_KEYS.length; i += 1) {
    const alias = LEGACY_LIGHT_KEYS[i];
    if (lightIds.includes(alias)) {
      map[alias] = alias;
      continue;
    }
    const fallbackKey = lightIds[i] || null;
    if (fallbackKey) {
      map[alias] = fallbackKey;
    }
  }
  return map;
}

function resolveLightStateByLegacyAlias(alias) {
  const map = getLegacyLightKeyMap();
  const key = map[alias];
  return key ? getLightStateByKey(key) : null;
}

function makeDefaultLightState(slot) {
  const t = slot % 4;
  const defaults = [
    { x: 24, y: 24, z: 74, on: true, type: '聚光灯', watts: 500, lumens: 5000 },
    { x: 74, y: 42, z: 58, on: true, type: '柔光箱', watts: 300, lumens: 3000 },
    { x: 58, y: 84, z: 66, on: true, type: '环形灯', watts: 220, lumens: 2200 },
    { x: 42, y: 74, z: 80, on: false, type: '发灯', watts: 100, lumens: 1000 },
  ];
  return { ...defaults[t] };
}

function createNewLightKey() {
  return `light${lightIds.length + 1}`;
}

function addLight() {
  if (lightIds.length >= MAX_LIGHT_COUNT) {
    showToast(`最多支持 ${MAX_LIGHT_COUNT} 盏光源`, 'info');
    return false;
  }
  const key = createNewLightKey();
  lightIds.push(key);
  lights[key] = makeDefaultLightState(lightIds.length - 1);
  lightingPreset = '自定义';
  updateLightDesc('');
  markManualSceneChange();
  render();
  return true;
}

function removeLight(key) {
  if (!key || !lightIds.includes(key)) return false;
  if (lightIds.length <= MIN_LIGHT_COUNT) {
    showToast('至少保留 1 盏光源', 'info');
    return false;
  }
  lightIds = lightIds.filter((id) => id !== key);
  delete lights[key];
  lightingPreset = '自定义';
  updateLightDesc('');
  markManualSceneChange();
  render();
  return true;
}

let activeCameraPreset = null;
const SCENE_AXIS_TICKS = [0, 25, 50, 75, 100];
const VIEW_AXIS_HINTS = {
  top: { x: '左右', y: '远近' },
  front: { x: '左右', y: '高低' },
  side: { x: '前后', y: '高低' },
};

const LIGHT_BEAM_ANGLE = {
  聚光灯: 34,
  柔光箱: 82,
  环形灯: 68,
  菲涅尔灯: 26,
  发灯: 30,
  反光板: 94,
  霓虹灯: 120,
  蜡烛: 138,
};

const FOCAL_CAMERA_ANGLE = {
  '14mm': 92,
  '24mm': 82,
  '35mm': 74,
  '50mm': 62,
  '85mm': 44,
  '135mm': 34,
  '200mm': 28,
};

/* ---- Constants ---- */
const LIGHT_TYPES = [
  { value: '聚光灯', en: 'spotlight, hard directional light', hint: '强硬影/高对比' },
  { value: '柔光箱', en: 'softbox, diffused soft light', hint: '均匀柔和' },
  { value: '环形灯', en: 'ring light, circular catchlight', hint: '眼神光环' },
  { value: '菲涅尔灯', en: 'Fresnel light, theatrical beam', hint: '舞台戏剧' },
  { value: '发灯', en: 'hair light, rim light, edge separation', hint: '轮廓分离' },
  { value: '反光板', en: 'reflector, bounce fill light', hint: '无阴影补光' },
  { value: '霓虹灯', en: 'neon light, colored ambient glow', hint: '彩色氛围' },
  { value: '蜡烛', en: 'candlelight, warm flickering firelight', hint: '暖色戏剧' },
];

const CAMERA_PRESETS = [
  { name: '平视', desc: 'eye-level shot', cam: { x: 50, y: 85, z: 50 } },
  { name: '俯拍', desc: 'high-angle shot', cam: { x: 50, y: 62, z: 82 } },
  { name: '仰拍', desc: 'low-angle shot', cam: { x: 50, y: 88, z: 24 } },
  { name: '鸟瞰', desc: "bird's eye view", cam: { x: 50, y: 50, z: 95 } },
  { name: '45°斜角', desc: '45-degree angle shot', cam: { x: 34, y: 70, z: 62 } },
];

const APERTURE_OPTIONS = [
  { value: 'f/1.4', hint: '极浅景深' },
  { value: 'f/2.8', hint: '背景虚化' },
  { value: 'f/5.6', hint: '适度模糊' },
  { value: 'f/8', hint: '均衡清晰' },
  { value: 'f/16', hint: '全景深' },
];

const LIGHTING_PRESETS = [
  { name: '自然光', desc: 'natural ambient lighting', key: { x: 30, y: 22, z: 70 }, fill: { x: 72, y: 44, z: 58 }, back: { x: 62, y: 84, z: 66 }, hair: { x: 40, y: 78, z: 82 } },
  { name: '伦勃朗', desc: 'Rembrandt (45° key + opposite fill)', key: { x: 24, y: 22, z: 76 }, fill: { x: 74, y: 48, z: 54 }, back: { x: 62, y: 84, z: 68 }, hair: { x: 42, y: 78, z: 84 } },
  { name: '蝶形光', desc: 'butterfly lighting (front overhead)', key: { x: 50, y: 20, z: 88 }, fill: { x: 36, y: 52, z: 58 }, back: { x: 66, y: 56, z: 62 }, hair: { x: 50, y: 76, z: 84 } },
  { name: '侧光', desc: 'side lighting (dramatic split)', key: { x: 14, y: 34, z: 72 }, fill: { x: 78, y: 58, z: 56 }, back: { x: 58, y: 82, z: 68 }, hair: { x: 36, y: 76, z: 80 } },
  { name: '逆光', desc: 'backlit / rim lighting', key: { x: 56, y: 24, z: 64 }, fill: { x: 38, y: 74, z: 58 }, back: { x: 66, y: 74, z: 82 }, hair: { x: 48, y: 70, z: 88 } },
];

const FOCAL_OPTIONS = [
  { value: '14mm', hint: '超广角', desc: 'ultra wide-angle, dramatic perspective distortion' },
  { value: '24mm', hint: '广角', desc: 'wide-angle lens, expansive framing' },
  { value: '35mm', hint: '小广角', desc: '35mm lens, natural perspective' },
  { value: '50mm', hint: '标准', desc: '50mm standard lens, no distortion' },
  { value: '85mm', hint: '人像', desc: '85mm portrait lens, flattering compression' },
  { value: '135mm', hint: '中长焦', desc: '135mm, compressed perspective, subject isolation' },
  { value: '200mm', hint: '长焦', desc: 'telephoto lens, extreme compression, stacked planes' },
];

const FRAMING_OPTIONS = [
  { value: '大特写', desc: 'extreme close-up (ECU), face/detail only' },
  { value: '特写', desc: 'close-up shot (CU), head and shoulders' },
  { value: '近景', desc: 'medium close-up (MCU), chest up' },
  { value: '中景', desc: 'medium shot (MS), waist up' },
  { value: '全景', desc: 'full shot (FS), full body visible' },
  { value: '远景', desc: 'wide/establishing shot (WS), environment dominant' },
];

const LIGHT_QUALITY_OPTIONS = [
  { value: '硬光', desc: 'hard light, sharp shadows, high contrast' },
  { value: '中性', desc: 'natural lighting, balanced shadows' },
  { value: '柔光', desc: 'soft diffused light, gentle shadows' },
];

const COLOR_TEMP_OPTIONS = [
  { value: '冷蓝', desc: 'cool blue tones, cold color temperature', color: '#89CFF3' },
  { value: '自然', desc: 'neutral white balance, natural colors', color: '#F8F0F0' },
  { value: '暖黄', desc: 'warm golden tones, warm color temperature', color: '#FFD68A' },
  { value: '金橙', desc: 'golden hour warmth, amber tones', color: '#FFB060' },
];

const TIME_PRESETS = [
  { name: '蓝调', desc: 'blue hour, twilight, soft blue light', temp: '冷蓝', quality: '柔光' },
  { name: '日出', desc: 'sunrise, warm golden light, long shadows', temp: '暖黄', quality: '柔光' },
  { name: '正午', desc: 'harsh midday sun, overhead, strong shadows', temp: '自然', quality: '硬光' },
  { name: '黄金', desc: 'golden hour, warm backlight, soft glow', temp: '金橙', quality: '柔光' },
  { name: '夜晚', desc: 'nighttime, moonlight, artificial lights', temp: '冷蓝', quality: '中性' },
];

export const SCENE_RECOMMENDATION_ENUMS = {
  timeOfDay: TIME_PRESETS.map((item) => item.name),
  lightingPreset: LIGHTING_PRESETS.map((item) => item.name),
  colorTemp: COLOR_TEMP_OPTIONS.map((item) => item.value),
  lightQuality: LIGHT_QUALITY_OPTIONS.map((item) => item.value),
  cameraPreset: CAMERA_PRESETS.map((item) => item.name),
};

/* ============ Init ============ */

export function initScene(containerId) {
  containerEl = document.getElementById(containerId);
  if (!containerEl) return;
  render();
  emitScenePreviewState();
}

/* ============ Recommendation APIs ============ */

export function subscribeSceneState(callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }
  sceneSubscribers.add(callback);
  try {
    callback(getScenePreviewState());
  } catch {
    // ignore subscriber errors
  }
  return () => {
    sceneSubscribers.delete(callback);
  };
}

export function getScenePreviewState() {
  const lightStates = {};
  const lightsList = [];
  for (const key of lightIds) {
    const state = getLightStateByKey(key);
    if (!state) continue;
    const meta = getLightMetaByKey(key);
    const snapshot = {
      ...state,
      key,
      id: key,
      label: meta.label,
      color: meta.color,
      slot: meta.order,
      alias: LEGACY_LIGHT_KEYS.includes(key) ? key : null,
    };
    lightStates[key] = snapshot;
    lightsList.push(snapshot);
  }
  return {
    camera: { ...camera },
    focalLength,
    framing,
    aperture,
    lightingPreset,
    lightQuality,
    colorTemp,
    timeOfDay,
    activeCameraPreset,
    lights: lightStates,
    lightsList,
    lightOrder: [...lightIds],
  };
}

export function getSceneRecommendationState() {
  return {
    timeOfDay,
    lightingPreset,
    colorTemp,
    lightQuality,
    cameraPreset: activeCameraPreset || null,
  };
}

export function getLightTuningState() {
  const result = { lights: {} };
  const fallback = { on: false, type: '聚光灯', lumens: 1000 };
  for (const key of LEGACY_LIGHT_KEYS) {
    const light = resolveLightStateByLegacyAlias(key) || fallback;
    result.lights[key] = {
      on: Boolean(light.on),
      type: light.type,
      lumens: Math.round(light.lumens),
    };
  }
  return result;
}

export function hasManualSceneChanges() {
  return manualSceneChanged;
}

export function clearManualSceneChanges() {
  manualSceneChanged = false;
}

export function applySceneRecommendation(reco, { source = 'auto' } = {}) {
  if (!reco || typeof reco !== 'object') return false;
  let applied = false;
  const clearFields = Array.isArray(reco.__clearFields) ? reco.__clearFields : [];

  for (const field of clearFields) {
    if (field === 'timeOfDay' && timeOfDay !== null) {
      timeOfDay = null;
      applied = true;
    }
    if (field === 'colorTemp' && colorTemp !== null) {
      colorTemp = null;
      applied = true;
    }
    if (field === 'lightQuality' && lightQuality !== null) {
      lightQuality = null;
      applied = true;
    }
  }

  if (SCENE_RECOMMENDATION_ENUMS.cameraPreset.includes(reco.cameraPreset)) {
    applyCameraPresetByName(reco.cameraPreset);
    applied = true;
  }

  if (SCENE_RECOMMENDATION_ENUMS.timeOfDay.includes(reco.timeOfDay)) {
    applyTimePresetByName(reco.timeOfDay);
    applied = true;
  }

  if (SCENE_RECOMMENDATION_ENUMS.colorTemp.includes(reco.colorTemp)) {
    colorTemp = reco.colorTemp;
    applied = true;
  }

  if (SCENE_RECOMMENDATION_ENUMS.lightQuality.includes(reco.lightQuality)) {
    lightQuality = reco.lightQuality;
    applied = true;
  }

  if (SCENE_RECOMMENDATION_ENUMS.lightingPreset.includes(reco.lightingPreset)) {
    applyLightingPresetByName(reco.lightingPreset);
    applied = true;
  }

  if (!applied) return false;

  if (containerEl) render();
  clearManualSceneChanges();
  emitScenePreviewState();
  return source === 'auto' || source === 'user-confirmed' ? true : true;
}

export function applyLightingRecommendation(reco, { source = 'auto' } = {}) {
  if (!reco || typeof reco !== 'object' || !reco.lights || typeof reco.lights !== 'object') return false;

  let applied = false;
  for (const [rawKey, patch] of Object.entries(reco.lights)) {
    const key = resolveLightKey(rawKey);
    const current = key ? getLightStateByKey(key) : null;
    if (!patch || !current) continue;

    if (typeof patch.on === 'boolean') {
      current.on = patch.on;
      applied = true;
    }
    if (typeof patch.type === 'string' && LIGHT_TYPES.some((item) => item.value === patch.type)) {
      current.type = patch.type;
      applied = true;
    }
    if (Number.isFinite(patch.lumens)) {
      const lumens = clamp(Math.round(Number(patch.lumens)), 100, 100000);
      current.lumens = lumens;
      current.watts = clamp(Math.round(lumens / 100), 25, 2000);
      applied = true;
    }
  }

  if (!applied) return false;

  if (containerEl) render();
  if (source === 'auto' || source === 'user-confirmed') {
    clearManualSceneChanges();
  }
  emitScenePreviewState();
  return true;
}

export function applySceneData(data, { markManual = true } = {}) {
  if (!data || typeof data !== 'object') return false;

  if (data.camera && typeof data.camera === 'object') {
    camera = {
      x: safeClamp(data.camera.x, 50, 0, 100),
      y: safeClamp(data.camera.y, 80, 0, 100),
      z: safeClamp(data.camera.z ?? data.camera.height, 50, 0, 100),
    };
  }

  if (FOCAL_OPTIONS.some((item) => item.value === data.focalLength)) focalLength = data.focalLength;
  if (FRAMING_OPTIONS.some((item) => item.value === data.framing)) framing = data.framing;
  if (APERTURE_OPTIONS.some((item) => item.value === data.aperture)) aperture = data.aperture;
  if (LIGHTING_PRESETS.some((item) => item.name === data.lightingPreset)) lightingPreset = data.lightingPreset;
  if (LIGHT_QUALITY_OPTIONS.some((item) => item.value === data.lightQuality)) lightQuality = data.lightQuality;
  if (COLOR_TEMP_OPTIONS.some((item) => item.value === data.colorTemp)) colorTemp = data.colorTemp;
  timeOfDay = TIME_PRESETS.some((item) => item.name === data.timeOfDay) ? data.timeOfDay : null;
  activeCameraPreset = CAMERA_PRESETS.some((item) => item.name === data.activeCameraPreset)
    ? data.activeCameraPreset
    : null;

  const nextLights = normalizeSceneLights(data);
  if (nextLights.order.length > 0) {
    lightIds = nextLights.order;
    lights = nextLights.lights;
  }

  manualSceneChanged = Boolean(markManual);
  if (containerEl) render();
  emitScenePreviewState();
  return true;
}

/* ============ Data Out ============ */

export function getSceneData() {
  const camPreset = CAMERA_PRESETS.find((p) => p.name === activeCameraPreset);
  const focalOpt = FOCAL_OPTIONS.find((o) => o.value === focalLength);
  const framingOpt = FRAMING_OPTIONS.find((o) => o.value === framing);
  const qualityOpt = LIGHT_QUALITY_OPTIONS.find((o) => o.value === lightQuality);
  const tempOpt = COLOR_TEMP_OPTIONS.find((o) => o.value === colorTemp);
  const timeOpt = TIME_PRESETS.find((o) => o.name === timeOfDay);

  const lightDescs = {};
  for (const key of lightIds) {
    const l = getLightStateByKey(key);
    if (!l) continue;
    const meta = getLightMetaByKey(key);
    const typeInfo = LIGHT_TYPES.find((t) => t.value === l.type);
    const sLm = l.on ? calcSubjectLumens(l) : 0;
    lightDescs[meta.en] = {
      alias: LEGACY_LIGHT_KEYS.includes(key) ? key : null,
      label: meta.label,
      id: key,
      on: l.on,
      type: l.type,
      typeEn: typeInfo?.en || l.type,
      watts: l.watts,
      lumens: l.lumens,
      subjectLumens: Math.round(sLm),
      position: { x: Math.round(l.x), y: Math.round(l.y), z: Math.round(l.z) },
    };
  }

  return {
    camera: {
      x: Math.round(camera.x),
      y: Math.round(camera.y),
      height: Math.round(camera.z),
      z: Math.round(camera.z),
    },
    cameraPreset: camPreset ? `${camPreset.name} (${camPreset.desc})` : '自定义',
    aperture,
    focalLength: focalOpt ? `${focalOpt.value} - ${focalOpt.desc}` : focalLength,
    framing: framingOpt ? `${framingOpt.value} (${framingOpt.desc})` : framing,
    lightQuality: qualityOpt ? `${qualityOpt.value} (${qualityOpt.desc})` : lightQuality,
    colorTemp: tempOpt ? `${tempOpt.value} (${tempOpt.desc})` : colorTemp,
    timeOfDay: timeOpt ? `${timeOpt.name} (${timeOpt.desc})` : null,
    lightingPreset,
    lights: lightDescs,
  };
}

export function destroyScene() {
  if (containerEl) containerEl.innerHTML = '';
  emitScenePreviewState();
}

function normalizeSceneLights(data) {
  const rawList = Array.isArray(data.lightsList)
    ? data.lightsList
    : Object.entries(data.lights || {}).map(([key, value]) => ({ ...value, key, id: value?.id || key }));
  const order = [];
  const nextLights = {};

  rawList.slice(0, MAX_LIGHT_COUNT).forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const fallbackKey = index < BASE_LIGHT_KEYS.length ? BASE_LIGHT_KEYS[index] : `light${index + 1}`;
    const key = String(item.id || item.key || fallbackKey);
    if (!key || order.includes(key)) return;
    order.push(key);
    nextLights[key] = {
      x: safeClamp(item.x, 50, 0, 100),
      y: safeClamp(item.y, 50, 0, 100),
      z: safeClamp(item.z, 60, 0, 100),
      on: typeof item.on === 'boolean' ? item.on : true,
      type: LIGHT_TYPES.some((type) => type.value === item.type) ? item.type : '聚光灯',
      watts: safeClamp(item.watts, 100, 25, 2000),
      lumens: safeClamp(item.lumens, 1000, 100, 100000),
    };
  });

  if (order.length === 0) {
    return { order: [], lights: {} };
  }
  return { order, lights: nextLights };
}

/* ============ Render ============ */

function render() {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  views = {};
  indicatorRegistry = {};
  coverageRegistry = {};

  const viewsRow = el('div', 'scene-views');
  const topView = createView('俯视', 'top');
  const frontView = createView('正视', 'front');
  const sideView = createView('侧视', 'side');
  viewsRow.appendChild(topView);
  viewsRow.appendChild(frontView);
  viewsRow.appendChild(sideView);

  const legend = el('div', 'scene-legend');
  const legendItemsHtml = lightIds.map((key) => {
    const meta = getLightMetaByKey(key);
    return `<span class="scene-legend-item"><span class="scene-legend-dot" style="background:${meta.color};box-shadow:0 0 4px ${meta.color}66"></span>${meta.label}</span>`;
  }).join('');
  legend.innerHTML = `
    <div class="scene-legend-items">
      <span class="scene-legend-item"><span class="scene-legend-dot scene-legend-cam"></span>相机</span>
      ${legendItemsHtml}
    </div>
    <div class="scene-legend-axes">
      <span>俯视: ←左右→ ↑远↓近</span>
      <span>正视: ←左右→ ↑高↓低</span>
      <span>侧视: ←前后→ ↑高↓低</span>
    </div>
    <div id="scene-coord-readout" class="scene-coord-readout"></div>
  `;

  views = { top: topView, front: frontView, side: sideView };
  placeEntities();
  updateSceneCoordReadout();

  const controls = el('div', 'scene-controls');
  controls.appendChild(createControlRow('机位', createCameraPresets()));

  const camDescEl = el('div', 'scene-preset-desc');
  camDescEl.id = 'cam-desc';
  const camPreset = CAMERA_PRESETS.find((p) => p.name === activeCameraPreset);
  camDescEl.textContent = camPreset ? camPreset.desc : '';
  controls.appendChild(camDescEl);

  controls.appendChild(createControlRow('焦距', createOptionRow(FOCAL_OPTIONS, focalLength, (v) => {
    focalLength = v;
    syncAllCoverage();
    markManualSceneChange();
  }, 'focal-option')));
  controls.appendChild(createControlRow('景别', createOptionRow(FRAMING_OPTIONS, framing, (v) => {
    framing = v;
    markManualSceneChange();
  }, 'framing-option')));
  controls.appendChild(createControlRow('光圈', createApertureSelector()));

  controls.appendChild(createControlRow('布光', createLightingPresets()));
  const lightDescEl = el('div', 'scene-preset-desc');
  lightDescEl.id = 'light-desc';
  const lp = LIGHTING_PRESETS.find((p) => p.name === lightingPreset);
  lightDescEl.textContent = lp?.desc || '';
  controls.appendChild(lightDescEl);

  const lightSection = el('div', 'light-cards');
  lightSection.appendChild(createLightActionsBar());
  for (const key of lightIds) {
    lightSection.appendChild(createLightCard(key));
  }

  controls.appendChild(createControlRow('柔硬', createOptionRow(LIGHT_QUALITY_OPTIONS, lightQuality, (v) => {
    lightQuality = v;
    timeOfDay = null;
    updateTimeBtns();
    syncAllCoverage();
    markManualSceneChange();
  }, 'quality-option')));
  controls.appendChild(createControlRow('色温', createColorTempSelector()));
  controls.appendChild(createControlRow('时段', createTimePresets()));

  const groups = el('div', 'scene-mobile-groups');
  groups.appendChild(createSceneFold('views', '三视图', viewsRow, true));
  groups.appendChild(createSceneFold('legend', '图例与坐标读数', legend, false));
  groups.appendChild(createSceneFold('lights', '灯光卡片', lightSection, false));
  groups.appendChild(createSceneFold('controls', '预设与全局参数', controls, false));
  containerEl.appendChild(groups);
  emitScenePreviewState();
}

/* ============ Light Cards ============ */

function createLightActionsBar() {
  const row = el('div', 'scene-light-actions');
  const count = el('span', 'scene-light-count');
  count.textContent = `光源数量 ${lightIds.length}/${MAX_LIGHT_COUNT}`;
  row.appendChild(count);

  const addBtn = el('button', 'scene-light-action-btn');
  addBtn.type = 'button';
  addBtn.textContent = '新增光源';
  addBtn.disabled = lightIds.length >= MAX_LIGHT_COUNT;
  addBtn.addEventListener('click', () => {
    addLight();
  });
  row.appendChild(addBtn);
  return row;
}

function createLightCard(key) {
  const l = getLightStateByKey(key);
  const meta = getLightMetaByKey(key);
  if (!l) return el('div', 'light-card');

  const card = el('div', `light-card light-card-${key} ${l.on ? '' : 'light-card-off'}`);
  card.dataset.lightKey = key;

  const header = el('div', 'light-card-header');

  const toggleWrap = el('label', 'light-toggle');
  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.checked = l.on;
  toggleInput.addEventListener('change', () => {
    const state = getLightStateByKey(key);
    if (!state) return;
    state.on = toggleInput.checked;
    card.classList.toggle('light-card-off', !state.on);
    updateSubjectLumens(key, card);
    syncEntityViews('light', key);
    updateSceneCoordReadout();
    markManualSceneChange();
  });
  const toggleSlider = el('span', 'light-toggle-slider');
  toggleWrap.appendChild(toggleInput);
  toggleWrap.appendChild(toggleSlider);
  header.appendChild(toggleWrap);

  const labelEl = el('span', 'light-card-label');
  labelEl.textContent = meta.label;
  labelEl.style.setProperty('--light-accent', meta.color);
  header.appendChild(labelEl);

  const removeBtn = el('button', 'scene-light-remove-btn');
  removeBtn.type = 'button';
  removeBtn.textContent = '删除';
  removeBtn.disabled = lightIds.length <= MIN_LIGHT_COUNT;
  removeBtn.addEventListener('click', () => {
    removeLight(key);
  });
  header.appendChild(removeBtn);

  const subjEl = el('span', 'light-subject-lm');
  subjEl.id = `subj-lm-${key}`;
  subjEl.title = '估算打到被摄主体的照度（平方反比衰减近似）';
  const sLm = l.on ? Math.round(calcSubjectLumens(l)) : 0;
  subjEl.textContent = l.on ? `→ ${formatLm(sLm)} lux` : '关闭';
  header.appendChild(subjEl);

  card.appendChild(header);

  const body = el('div', 'light-card-body');

  const typeRow = el('div', 'light-prop-row');
  const typeLabel = el('span', 'light-prop-label');
  typeLabel.textContent = '灯型';
  typeRow.appendChild(typeLabel);

  const typeSelect = document.createElement('select');
  typeSelect.className = 'light-type-select';
  LIGHT_TYPES.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.value;
    opt.textContent = `${t.value} — ${t.hint}`;
    opt.selected = t.value === l.type;
    typeSelect.appendChild(opt);
  });
  typeSelect.addEventListener('change', () => {
    const state = getLightStateByKey(key);
    if (!state) return;
    state.type = typeSelect.value;
    syncEntityCoverage('light', key);
    markManualSceneChange();
  });
  typeRow.appendChild(typeSelect);
  body.appendChild(typeRow);

  const wattsRow = el('div', 'light-prop-row');
  const wattsLabel = el('span', 'light-prop-label');
  wattsLabel.textContent = '瓦数';
  wattsRow.appendChild(wattsLabel);

  const wattsWrap = el('div', 'light-slider-wrap');
  const wattsSlider = document.createElement('input');
  wattsSlider.type = 'range';
  wattsSlider.className = 'light-slider';
  wattsSlider.min = 25;
  wattsSlider.max = 2000;
  wattsSlider.step = 25;
  wattsSlider.value = l.watts;

  const wattsVal = el('span', 'light-slider-val');
  wattsVal.textContent = `${l.watts}W`;

  const lumensVal = el('span', 'light-slider-val');
  lumensVal.textContent = `${formatLm(l.lumens)} lm`;

  wattsSlider.addEventListener('input', () => {
    const w = Number(wattsSlider.value);
    const state = getLightStateByKey(key);
    if (!state) return;
    state.watts = w;
    state.lumens = Math.round(w * 100);
    wattsVal.textContent = `${w}W`;
    lumensVal.textContent = `${formatLm(state.lumens)} lm`;
    updateSubjectLumens(key, card);
    syncEntityCoverage('light', key);
    markManualSceneChange();
  });

  wattsWrap.appendChild(wattsSlider);
  wattsWrap.appendChild(wattsVal);
  wattsRow.appendChild(wattsWrap);
  body.appendChild(wattsRow);

  const lmRow = el('div', 'light-prop-row');
  const lmLabel = el('span', 'light-prop-label');
  lmLabel.textContent = '流明';
  lmRow.appendChild(lmLabel);

  const lmWrap = el('div', 'light-slider-wrap');
  const lumensInput = document.createElement('input');
  lumensInput.type = 'number';
  lumensInput.className = 'light-lm-input';
  lumensInput.min = 100;
  lumensInput.max = 100000;
  lumensInput.step = 100;
  lumensInput.value = l.lumens;
  lumensInput.title = '手动输入流明值';

  lumensInput.addEventListener('change', () => {
    const v = clamp(Number(lumensInput.value), 100, 100000);
    const state = getLightStateByKey(key);
    if (!state) return;
    state.lumens = v;
    state.watts = clamp(Math.round(v / 100), 25, 2000);
    lumensInput.value = v;
    lumensVal.textContent = `${formatLm(v)} lm`;
    updateSubjectLumens(key, card);
    syncEntityCoverage('light', key);
    markManualSceneChange();
  });

  lmWrap.appendChild(lumensInput);
  lmWrap.appendChild(lumensVal);
  lmRow.appendChild(lmWrap);
  body.appendChild(lmRow);

  card.appendChild(body);
  return card;
}

/* ============ Views & Indicators ============ */

function createView(label, viewId) {
  const axisHint = VIEW_AXIS_HINTS[viewId] || VIEW_AXIS_HINTS.top;
  const view = el('div', 'scene-view');
  view.dataset.view = viewId;
  view.innerHTML = `
    <span class="scene-view-label">${label}</span>
    <div class="scene-axis-x">${SCENE_AXIS_TICKS.map((tick) => `<span>${tick}</span>`).join('')}</div>
    <div class="scene-axis-y">${SCENE_AXIS_TICKS.map((tick) => `<span>${tick}</span>`).join('')}</div>
    <span class="scene-axis-label scene-axis-label-x">X: ${axisHint.x}</span>
    <span class="scene-axis-label scene-axis-label-y">Y: ${axisHint.y}</span>
    <div class="scene-subject"></div>
  `;
  return view;
}

function placeEntities() {
  for (const viewId of ['top', 'front', 'side']) {
    addEntityToView('camera', null, viewId);
    for (const key of lightIds) {
      addEntityToView('light', key, viewId);
    }
  }
}

function addEntityToView(kind, key, viewId) {
  const viewEl = views[viewId];
  if (!viewEl) return;

  const coverageEl = el('div', 'scene-coverage');
  coverageEl.dataset.entity = entityId(kind, key);
  coverageEl.dataset.type = kind === 'camera' ? 'camera' : (BASE_LIGHT_KEYS.includes(key) ? key : 'dynamic');
  viewEl.appendChild(coverageEl);

  const indicator = el('div', kind === 'camera' ? 'scene-camera' : 'scene-light');
  indicator.dataset.id = entityId(kind, key);
  if (kind === 'light') {
    const meta = getLightMetaByKey(key);
    indicator.setAttribute('data-type', BASE_LIGHT_KEYS.includes(key) ? key : 'dynamic');
    indicator.style.background = meta.color;
    indicator.style.boxShadow = `0 0 10px ${meta.color}77`;
    indicator.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
  } else {
    indicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  }

  indicator.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    indicator.setPointerCapture(e.pointerId);
    indicator.classList.add('dragging');

    const viewRect = viewEl.getBoundingClientRect();
    const move = (ev) => {
      const sx = clamp(((ev.clientX - viewRect.left) / viewRect.width) * 100, 5, 95);
      const sy = clamp(((ev.clientY - viewRect.top) / viewRect.height) * 100, 5, 95);

      setEntityStateByView(kind, key, viewId, sx, sy);
      if (kind === 'camera') {
        activeCameraPreset = null;
        updateCameraPresetUI();
      } else {
        lightingPreset = '自定义';
        updateLightingPresetUI();
        updateLightDesc('');
      }

      syncEntityViews(kind, key);
      if (kind === 'light') {
        const card = containerEl?.querySelector(`.light-card-${key}`);
        if (card) updateSubjectLumens(key, card);
      }
      updateSceneCoordReadout();
      setDragCoordTooltip(indicator, sx, sy);
      markManualSceneChange();
    };

    const up = () => {
      indicator.classList.remove('dragging');
      clearDragCoordTooltip(indicator);
      indicator.removeEventListener('pointermove', move);
      indicator.removeEventListener('pointerup', up);
    };

    indicator.addEventListener('pointermove', move);
    indicator.addEventListener('pointerup', up);
  });

  viewEl.appendChild(indicator);
  registerEntityDom(kind, key, viewId, indicator, coverageEl);
  syncEntityViews(kind, key);
}

function registerEntityDom(kind, key, viewId, indicator, coverageEl) {
  const id = entityId(kind, key);
  if (!indicatorRegistry[id]) indicatorRegistry[id] = {};
  if (!coverageRegistry[id]) coverageRegistry[id] = {};
  indicatorRegistry[id][viewId] = indicator;
  coverageRegistry[id][viewId] = coverageEl;
}

function syncEntityViews(kind, key) {
  const id = entityId(kind, key);
  const indicatorSet = indicatorRegistry[id] || {};
  const coverageSet = coverageRegistry[id] || {};

  for (const viewId of ['top', 'front', 'side']) {
    const pos = getEntityScreenPosition(kind, key, viewId);
    const indicator = indicatorSet[viewId];
    if (indicator) {
      indicator.style.left = `${pos.x}%`;
      indicator.style.top = `${pos.y}%`;
      if (kind === 'light') {
        const light = getLightStateByKey(key);
        indicator.style.opacity = light?.on ? '1' : '0.25';
      }
    }

    const coverageEl = coverageSet[viewId];
    if (coverageEl) {
      const cfg = getCoverageConfig(kind, key, viewId);
      coverageEl.style.left = `${pos.x}%`;
      coverageEl.style.top = `${pos.y}%`;
      coverageEl.style.width = `${cfg.radius * 2}%`;
      coverageEl.style.height = `${cfg.radius * 2}%`;
      coverageEl.style.setProperty('--coverage-color', cfg.color);
      coverageEl.style.setProperty('--coverage-opacity', String(cfg.opacity));
      coverageEl.style.transform = `translate(-50%, -50%) rotate(${cfg.angleDeg}deg)`;
      coverageEl.style.filter = cfg.blurPx > 0 ? `blur(${cfg.blurPx}px)` : 'none';
      coverageEl.style.clipPath = `polygon(0% 50%, 100% ${50 - cfg.halfSpreadPct}%, 100% ${50 + cfg.halfSpreadPct}%)`;
      coverageEl.style.opacity = cfg.visible ? '1' : '0';
    }
  }
}

function syncEntityCoverage(kind, key) {
  const id = entityId(kind, key);
  const coverageSet = coverageRegistry[id] || {};
  for (const viewId of ['top', 'front', 'side']) {
    const coverageEl = coverageSet[viewId];
    if (!coverageEl) continue;
    const cfg = getCoverageConfig(kind, key, viewId);
    coverageEl.style.width = `${cfg.radius * 2}%`;
    coverageEl.style.height = `${cfg.radius * 2}%`;
    coverageEl.style.setProperty('--coverage-color', cfg.color);
    coverageEl.style.setProperty('--coverage-opacity', String(cfg.opacity));
    coverageEl.style.filter = cfg.blurPx > 0 ? `blur(${cfg.blurPx}px)` : 'none';
    coverageEl.style.clipPath = `polygon(0% 50%, 100% ${50 - cfg.halfSpreadPct}%, 100% ${50 + cfg.halfSpreadPct}%)`;
    coverageEl.style.opacity = cfg.visible ? '1' : '0';
  }
}

function syncAllCoverage() {
  syncEntityCoverage('camera', null);
  for (const key of lightIds) syncEntityCoverage('light', key);
}

function setEntityStateByView(kind, key, viewId, sx, sy) {
  if (kind === 'camera') {
    if (viewId === 'top') {
      camera.x = sx;
      camera.y = sy;
    } else if (viewId === 'front') {
      camera.x = sx;
      camera.z = 100 - sy;
    } else if (viewId === 'side') {
      camera.y = sx;
      camera.z = 100 - sy;
    }
    camera.x = clamp(camera.x, 5, 95);
    camera.y = clamp(camera.y, 5, 95);
    camera.z = clamp(camera.z, 5, 95);
    return;
  }

  const light = getLightStateByKey(key);
  if (!light) return;
  if (viewId === 'top') {
    light.x = sx;
    light.y = sy;
  } else if (viewId === 'front') {
    light.x = sx;
    light.z = 100 - sy;
  } else if (viewId === 'side') {
    light.y = sx;
    light.z = 100 - sy;
  }
  light.x = clamp(light.x, 5, 95);
  light.y = clamp(light.y, 5, 95);
  light.z = clamp(light.z, 5, 95);
}

function getEntityScreenPosition(kind, key, viewId) {
  const state = kind === 'camera' ? camera : getLightStateByKey(key);
  if (!state) return { x: 50, y: 50 };

  if (viewId === 'top') return { x: state.x, y: state.y };
  if (viewId === 'front') return { x: state.x, y: 100 - state.z };
  return { x: state.y, y: 100 - state.z };
}

function getCoverageConfig(kind, key, viewId) {
  const dir = getDirectionAngleDeg(kind, key, viewId);
  if (kind === 'camera') {
    const spread = FOCAL_CAMERA_ANGLE[focalLength] || 62;
    const radius = clamp(15 + spread * 0.1, 16, 32);
    return {
      radius,
      angleDeg: dir,
      halfSpreadPct: clamp(spread / 3.8, 8, 28),
      opacity: 0.12,
      blurPx: lightQuality === '柔光' ? 2 : 1,
      color: 'rgba(255, 143, 171, var(--coverage-opacity))',
      visible: true,
    };
  }

  const light = getLightStateByKey(key);
  if (!light) {
    return {
      radius: 10,
      angleDeg: dir,
      halfSpreadPct: 12,
      opacity: 0.04,
      blurPx: 1,
      color: 'rgba(200,200,200,var(--coverage-opacity))',
      visible: false,
    };
  }
  const spread = LIGHT_BEAM_ANGLE[light.type] || 60;
  const radius = clamp(8 + Math.sqrt(light.lumens) / 15, 9, 30);
  const qualitySoft = lightQuality === '柔光';
  const meta = getLightMetaByKey(key);
  return {
    radius,
    angleDeg: dir,
    halfSpreadPct: clamp(spread / 3.6, 7, 30),
    opacity: light.on ? 0.14 : 0.04,
    blurPx: qualitySoft ? 3 : 1,
    color: `color-mix(in srgb, ${meta.color} 70%, transparent)`,
    visible: true,
  };
}

function getDirectionAngleDeg(kind, key, viewId) {
  const target = { x: 50, y: 50, z: 50 };
  const source = kind === 'camera' ? camera : getLightStateByKey(key);
  if (!source) return 0;

  let dx = 0;
  let dy = 0;
  if (viewId === 'top') {
    dx = target.x - source.x;
    dy = target.y - source.y;
  } else if (viewId === 'front') {
    dx = target.x - source.x;
    dy = source.z - target.z;
  } else {
    dx = target.y - source.y;
    dy = source.z - target.z;
  }
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return 0;
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

function entityId(kind, key) {
  return kind === 'camera' ? 'camera' : `light-${key}`;
}

/* ============ Controls ============ */

function createCameraPresets() {
  const row = el('div', 'camera-presets');
  CAMERA_PRESETS.forEach((preset) => {
    const btn = el('button', `camera-preset ${preset.name === activeCameraPreset ? 'active' : ''}`);
    btn.textContent = preset.name;
    btn.title = preset.desc;
    btn.dataset.name = preset.name;
    btn.addEventListener('click', () => {
      applyCameraPresetByName(preset.name);
      updateCamDesc(preset.desc);
      markManualSceneChange();
      render();
    });
    row.appendChild(btn);
  });
  return row;
}

function updateCameraPresetUI() {
  containerEl?.querySelectorAll('.camera-preset').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.name === activeCameraPreset);
  });
  updateCamDesc('');
}

function createApertureSelector() {
  const row = el('div', 'aperture-selector');
  APERTURE_OPTIONS.forEach((opt) => {
    const btn = el('button', `aperture-option ${opt.value === aperture ? 'active' : ''}`);
    btn.textContent = opt.value;
    btn.title = opt.hint;
    btn.dataset.value = opt.value;
    btn.addEventListener('click', () => {
      aperture = opt.value;
      row.querySelectorAll('.aperture-option').forEach((node) => {
        node.classList.toggle('active', node.dataset.value === aperture);
      });
      markManualSceneChange();
    });
    row.appendChild(btn);
  });
  return row;
}

function createLightingPresets() {
  const row = el('div', 'lighting-presets');
  LIGHTING_PRESETS.forEach((preset) => {
    const btn = el('button', `lighting-preset ${preset.name === lightingPreset ? 'active' : ''}`);
    btn.textContent = preset.name;
    btn.dataset.name = preset.name;
    btn.addEventListener('click', () => {
      applyLightingPresetByName(preset.name);
      updateLightDesc(preset.desc);
      markManualSceneChange();
      render();
    });
    row.appendChild(btn);
  });
  return row;
}

function updateLightingPresetUI() {
  containerEl?.querySelectorAll('.lighting-preset').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.name === lightingPreset);
  });
}

/* ============ Helpers ============ */

function calcSubjectLumens(light) {
  const dx = (light.x - 50) / 100;
  const dy = (light.y - 50) / 100;
  const dz = (light.z - 50) / 100;
  const distSq = dx * dx + dy * dy + dz * dz;
  const factor = 1 / (1 + 10 * distSq);
  return light.lumens * factor;
}

function updateSubjectLumens(key, card) {
  const l = getLightStateByKey(key);
  if (!l) return;
  const lumEl = card.querySelector(`#subj-lm-${key}`);
  if (!lumEl) return;
  if (l.on) {
    const sLm = Math.round(calcSubjectLumens(l));
    lumEl.textContent = `→ ${formatLm(sLm)} lux`;
  } else {
    lumEl.textContent = '关闭';
  }
}

function formatLm(v) {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

function isMobileSceneLayout() {
  return Boolean(window.matchMedia?.('(max-width: 768px)').matches);
}

function createSceneFold(key, title, contentEl, mobileDefaultOpen = false) {
  const wrapper = el('details', `scene-fold scene-fold-${key}`);
  const summary = el('summary', 'scene-fold-summary');
  summary.textContent = title;
  wrapper.appendChild(summary);

  const body = el('div', 'scene-fold-body');
  body.appendChild(contentEl);
  wrapper.appendChild(body);

  const mobile = isMobileSceneLayout();
  if (mobile) {
    const open = sceneFoldState[key] ?? mobileDefaultOpen;
    wrapper.open = Boolean(open);
  } else {
    wrapper.open = true;
  }

  wrapper.addEventListener('toggle', () => {
    sceneFoldState[key] = wrapper.open;
  });

  return wrapper;
}

function el(tag, className) {
  const dom = document.createElement(tag);
  if (className) dom.className = className.trim();
  return dom;
}

function createControlRow(label, contentEl) {
  const row = el('div', 'scene-control-row');
  const lbl = el('span', 'scene-control-label');
  lbl.textContent = label;
  row.appendChild(lbl);
  row.appendChild(contentEl);
  return row;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function safeClamp(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

function updateCamDesc(desc) {
  const dom = containerEl?.querySelector('#cam-desc');
  if (dom) dom.textContent = desc;
}

function updateLightDesc(desc) {
  const dom = containerEl?.querySelector('#light-desc');
  if (dom) dom.textContent = desc;
}

function updateSceneCoordReadout() {
  const dom = containerEl?.querySelector('#scene-coord-readout');
  if (!dom) return;

  const cameraTop = `相机俯视 X${Math.round(camera.x)} Y${Math.round(camera.y)}`;
  const cameraFront = `相机正视 X${Math.round(camera.x)} Z${Math.round(camera.z)}`;
  const cameraSide = `相机侧视 Y${Math.round(camera.y)} Z${Math.round(camera.z)}`;
  const lightRows = lightIds.map((key) => {
    const light = getLightStateByKey(key);
    const label = getLightMetaByKey(key).label;
    if (!light) return `${label}: 缺失`;
    if (!light.on) return `${label}: 关闭`;
    return `${label}: X${Math.round(light.x)} Y${Math.round(light.y)} Z${Math.round(light.z)}`;
  });

  dom.innerHTML = `
    <span>${cameraTop}</span>
    <span>${cameraFront}</span>
    <span>${cameraSide}</span>
    ${lightRows.map((row) => `<span>${row}</span>`).join('')}
  `;
}

function setDragCoordTooltip(indicator, x, y) {
  let tip = indicator.querySelector('.scene-drag-coords');
  if (!tip) {
    tip = el('span', 'scene-drag-coords');
    indicator.appendChild(tip);
  }
  tip.textContent = `X:${Math.round(x)} Y:${Math.round(y)}`;
}

function clearDragCoordTooltip(indicator) {
  indicator.querySelector('.scene-drag-coords')?.remove();
}

function createOptionRow(options, activeValue, onSelect, cssClass) {
  const row = el('div', 'scene-option-row');
  options.forEach((opt) => {
    const btn = el('button', `scene-pill ${cssClass} ${opt.value === activeValue ? 'active' : ''}`);
    btn.textContent = opt.hint || opt.value;
    btn.title = opt.desc || '';
    btn.dataset.value = opt.value;
    btn.addEventListener('click', () => {
      row.querySelectorAll(`.${cssClass}`).forEach((node) => {
        node.classList.toggle('active', node.dataset.value === opt.value);
      });
      onSelect(opt.value);
    });
    row.appendChild(btn);
  });
  return row;
}

function createColorTempSelector() {
  const wrap = el('div', 'color-temp-wrap');
  COLOR_TEMP_OPTIONS.forEach((opt) => {
    const btn = el('button', `color-temp-btn ${opt.value === colorTemp ? 'active' : ''}`);
    btn.style.setProperty('--dot-color', opt.color);
    btn.innerHTML = `<span class="color-temp-dot"></span>${opt.value}`;
    btn.title = opt.desc;
    btn.dataset.value = opt.value;
    btn.addEventListener('click', () => {
      colorTemp = opt.value;
      timeOfDay = null;
      updateTimeBtns();
      wrap.querySelectorAll('.color-temp-btn').forEach((node) => {
        node.classList.toggle('active', node.dataset.value === opt.value);
      });
      markManualSceneChange();
    });
    wrap.appendChild(btn);
  });
  return wrap;
}

function createTimePresets() {
  const row = el('div', 'time-presets');
  TIME_PRESETS.forEach((preset) => {
    const btn = el('button', `time-preset ${preset.name === timeOfDay ? 'active' : ''}`);
    btn.textContent = preset.name;
    btn.title = preset.desc;
    btn.dataset.name = preset.name;
    btn.addEventListener('click', () => {
      applyTimePresetByName(preset.name);
      containerEl?.querySelectorAll('.color-temp-btn').forEach((node) => {
        node.classList.toggle('active', node.dataset.value === preset.temp);
      });
      containerEl?.querySelectorAll('.quality-option').forEach((node) => {
        node.classList.toggle('active', node.dataset.value === preset.quality);
      });
      row.querySelectorAll('.time-preset').forEach((node) => {
        node.classList.toggle('active', node.dataset.name === preset.name);
      });
      syncAllCoverage();
      markManualSceneChange();
    });
    row.appendChild(btn);
  });
  return row;
}

function updateTimeBtns() {
  containerEl?.querySelectorAll('.time-preset').forEach((node) => {
    node.classList.toggle('active', node.dataset.name === timeOfDay);
  });
}

function applyCameraPresetByName(name) {
  const preset = CAMERA_PRESETS.find((item) => item.name === name);
  if (!preset) return false;
  activeCameraPreset = preset.name;
  camera = { ...preset.cam };
  return true;
}

function applyTimePresetByName(name) {
  const preset = TIME_PRESETS.find((item) => item.name === name);
  if (!preset) return false;
  timeOfDay = preset.name;
  colorTemp = preset.temp;
  lightQuality = preset.quality;
  return true;
}

function applyLightingPresetByName(name) {
  const preset = LIGHTING_PRESETS.find((item) => item.name === name);
  if (!preset) return false;
  lightingPreset = preset.name;
  const keyMap = getLegacyLightKeyMap();
  if (keyMap.key && lights[keyMap.key]) lights[keyMap.key] = { ...lights[keyMap.key], ...preset.key };
  if (keyMap.fill && lights[keyMap.fill]) lights[keyMap.fill] = { ...lights[keyMap.fill], ...preset.fill };
  if (keyMap.back && lights[keyMap.back]) lights[keyMap.back] = { ...lights[keyMap.back], ...preset.back };
  if (keyMap.hair && lights[keyMap.hair]) lights[keyMap.hair] = { ...lights[keyMap.hair], ...preset.hair };
  return true;
}

function resolveLightKey(rawKey) {
  const token = normalizeToken(rawKey);
  const legacy = LIGHT_KEY_ALIASES[token] || null;
  if (legacy) {
    const map = getLegacyLightKeyMap();
    return map[legacy] || null;
  }
  const idDirect = lightIds.find((id) => normalizeToken(id) === token);
  if (idDirect) return idDirect;
  const match = token.match(/^light(\d{1,2})$/);
  if (match) {
    const idx = Number(match[1]) - 1;
    if (idx >= 0 && idx < lightIds.length) {
      return lightIds[idx];
    }
  }
  const zhMatch = token.match(/^光源(\d{1,2})$/);
  if (zhMatch) {
    const idx = Number(zhMatch[1]) - 1;
    if (idx >= 0 && idx < lightIds.length) {
      return lightIds[idx];
    }
  }
  return null;
}

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，,、。.!?;；'"`~]/g, '');
}

function emitScenePreviewState() {
  if (sceneSubscribers.size === 0) return;
  const snapshot = getScenePreviewState();
  for (const callback of sceneSubscribers) {
    try {
      callback(snapshot);
    } catch {
      // ignore subscriber errors
    }
  }
}

function markManualSceneChange() {
  manualSceneChanged = true;
  emitScenePreviewState();
}
