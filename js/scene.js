/**
 * scene.js — Scene Three-View Panel v4
 * Full lighting system: on/off, type, watts, lumens, subject lumens (falloff)
 * Camera presets, aperture, focal, framing, color temp, time-of-day
 */

/* ============ State ============ */
let containerEl = null;
let views = {};

let camera = { x: 50, y: 80 };
let cameraHeight = 50;
let aperture = 'f/2.8';
let lightingPreset = '自然光';
let focalLength = '50mm';
let framing = '中景';
let lightQuality = '中性';
let colorTemp = '自然';
let timeOfDay = null;
let manualSceneChanged = false;

/* ---- Light state: 4 lights ---- */
let lights = {
  key: { x: 30, y: 25, on: true, type: '聚光灯', watts: 500, lumens: 5000 },
  fill: { x: 70, y: 40, on: true, type: '柔光箱', watts: 300, lumens: 3000 },
  back: { x: 50, y: 15, on: true, type: '环形灯', watts: 200, lumens: 2000 },
  hair: { x: 50, y: 10, on: false, type: '发灯', watts: 100, lumens: 1000 },
};

const LIGHT_META = {
  key: { label: '主光', en: 'key light', color: 'var(--color-candy-lemon)' },
  fill: { label: '补光', en: 'fill light', color: 'var(--color-candy-sky)' },
  back: { label: '轮廓光', en: 'back light', color: 'var(--color-candy-mint)' },
  hair: { label: '发灯', en: 'hair light', color: 'var(--color-candy-lavender)' },
};

let activeCameraPreset = null;

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
  { name: '平视', desc: 'eye-level shot', cam: { x: 50, y: 85 }, height: 50 },
  { name: '俯拍', desc: 'high-angle shot', cam: { x: 50, y: 60 }, height: 25 },
  { name: '仰拍', desc: 'low-angle shot', cam: { x: 50, y: 85 }, height: 80 },
  { name: '鸟瞰', desc: "bird's eye view", cam: { x: 50, y: 50 }, height: 10 },
  { name: '45°斜角', desc: '45-degree angle shot', cam: { x: 30, y: 70 }, height: 35 },
];

const APERTURE_OPTIONS = [
  { value: 'f/1.4', hint: '极浅景深' },
  { value: 'f/2.8', hint: '背景虚化' },
  { value: 'f/5.6', hint: '适度模糊' },
  { value: 'f/8', hint: '均衡清晰' },
  { value: 'f/16', hint: '全景深' },
];

const LIGHTING_PRESETS = [
  { name: '自然光', desc: 'natural ambient lighting', key: { x: 50, y: 10 }, fill: { x: 50, y: 50 }, back: { x: 50, y: 90 } },
  { name: '伦勃朗', desc: 'Rembrandt (45° key + opposite fill)', key: { x: 25, y: 20 }, fill: { x: 75, y: 45 }, back: { x: 60, y: 85 } },
  { name: '蝶形光', desc: 'butterfly lighting (front overhead)', key: { x: 50, y: 15 }, fill: { x: 35, y: 50 }, back: { x: 65, y: 50 } },
  { name: '侧光', desc: 'side lighting (dramatic split)', key: { x: 10, y: 35 }, fill: { x: 80, y: 55 }, back: { x: 50, y: 85 } },
  { name: '逆光', desc: 'backlit / rim lighting', key: { x: 50, y: 10 }, fill: { x: 40, y: 75 }, back: { x: 60, y: 75 } },
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
}

/* ============ Recommendation APIs ============ */

export function getSceneRecommendationState() {
  return {
    timeOfDay,
    lightingPreset,
    colorTemp,
    lightQuality,
    cameraPreset: activeCameraPreset || null,
  };
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
  return source === 'auto' || source === 'user-confirmed' ? true : true;
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
  for (const [key, meta] of Object.entries(LIGHT_META)) {
    const l = lights[key];
    const typeInfo = LIGHT_TYPES.find((t) => t.value === l.type);
    const sLm = l.on ? calcSubjectLumens(l) : 0;
    lightDescs[meta.en] = {
      on: l.on,
      type: l.type,
      typeEn: typeInfo?.en || l.type,
      watts: l.watts,
      lumens: l.lumens,
      subjectLumens: Math.round(sLm),
    };
  }

  return {
    camera: { x: Math.round(camera.x), y: Math.round(camera.y), height: Math.round(cameraHeight) },
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
}

/* ============ Render ============ */

function render() {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  const viewsRow = el('div', 'scene-views');
  const topView = createView('俯视', 'top');
  const frontView = createView('正视', 'front');
  const sideView = createView('侧视', 'side');
  viewsRow.appendChild(topView);
  viewsRow.appendChild(frontView);
  viewsRow.appendChild(sideView);
  containerEl.appendChild(viewsRow);

  const legend = el('div', 'scene-legend');
  legend.innerHTML = `
    <div class="scene-legend-items">
      <span class="scene-legend-item"><span class="scene-legend-dot scene-legend-cam"></span>相机</span>
      <span class="scene-legend-item"><span class="scene-legend-dot scene-legend-key"></span>主光</span>
      <span class="scene-legend-item"><span class="scene-legend-dot scene-legend-fill"></span>补光</span>
      <span class="scene-legend-item"><span class="scene-legend-dot scene-legend-back"></span>轮廓光</span>
      <span class="scene-legend-item"><span class="scene-legend-dot scene-legend-hair"></span>发灯</span>
    </div>
    <div class="scene-legend-axes">
      <span>俯视: ←左右→ ↑远↓近</span>
      <span>正视: ←左右→ ↑高↓低</span>
      <span>侧视: ←前后→ ↑高↓低</span>
    </div>
  `;
  containerEl.appendChild(legend);

  views = { top: topView, front: frontView, side: sideView };

  placeCamera();
  placeLights();
  placeCameraDirectionLine();

  const controls = el('div', 'scene-controls');

  controls.appendChild(createControlRow('机位', createCameraPresets()));
  const camDescEl = el('div', 'scene-preset-desc');
  camDescEl.id = 'cam-desc';
  const camPreset = CAMERA_PRESETS.find((p) => p.name === activeCameraPreset);
  camDescEl.textContent = camPreset ? camPreset.desc : '';
  controls.appendChild(camDescEl);

  controls.appendChild(createControlRow('焦距', createOptionRow(FOCAL_OPTIONS, focalLength, (v) => {
    focalLength = v;
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
  for (const key of ['key', 'fill', 'back', 'hair']) {
    lightSection.appendChild(createLightCard(key));
  }
  controls.appendChild(lightSection);

  controls.appendChild(createControlRow('柔硬', createOptionRow(LIGHT_QUALITY_OPTIONS, lightQuality, (v) => {
    lightQuality = v;
    timeOfDay = null;
    updateTimeBtns();
    markManualSceneChange();
  }, 'quality-option')));
  controls.appendChild(createControlRow('色温', createColorTempSelector()));
  controls.appendChild(createControlRow('时段', createTimePresets()));

  containerEl.appendChild(controls);
}

/* ============ Light Cards ============ */

function createLightCard(key) {
  const l = lights[key];
  const meta = LIGHT_META[key];

  const card = el('div', `light-card light-card-${key} ${l.on ? '' : 'light-card-off'}`);
  card.dataset.lightKey = key;

  const header = el('div', 'light-card-header');

  const toggleWrap = el('label', 'light-toggle');
  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.checked = l.on;
  toggleInput.addEventListener('change', () => {
    lights[key].on = toggleInput.checked;
    card.classList.toggle('light-card-off', !lights[key].on);
    updateSubjectLumens(key, card);
    updateLightIndicator(key);
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

  const subjEl = el('span', 'light-subject-lm');
  subjEl.id = `subj-lm-${key}`;
  subjEl.title = '估算打到被摄主体的流明值（平方反比衰减）';
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
    lights[key].type = typeSelect.value;
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

  wattsSlider.addEventListener('input', () => {
    const w = Number(wattsSlider.value);
    lights[key].watts = w;
    lights[key].lumens = Math.round(w * 100);
    wattsVal.textContent = `${w}W`;
    lumensVal.textContent = `${formatLm(lights[key].lumens)} lm`;
    updateSubjectLumens(key, card);
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

  const lumensVal = el('span', 'light-slider-val');
  lumensVal.textContent = `${formatLm(l.lumens)} lm`;

  lumensInput.addEventListener('change', () => {
    const v = clamp(Number(lumensInput.value), 100, 100000);
    lights[key].lumens = v;
    lumensInput.value = v;
    lumensVal.textContent = `${formatLm(v)} lm`;
    updateSubjectLumens(key, card);
    markManualSceneChange();
  });

  lmWrap.appendChild(lumensInput);
  lmWrap.appendChild(lumensVal);
  lmRow.appendChild(lmWrap);
  body.appendChild(lmRow);

  card.appendChild(body);
  return card;
}

/* ---- Helpers ---- */

function calcSubjectLumens(light) {
  const dx = (light.x - 50) / 100;
  const dy = (light.y - 50) / 100;
  const distSq = dx * dx + dy * dy;
  const factor = 1 / (1 + 10 * distSq);
  return light.lumens * factor;
}

function updateSubjectLumens(key, card) {
  const l = lights[key];
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

function updateLightIndicator(key) {
  const l = lights[key];
  const indicator = views.top?.querySelector(`[data-id="light-${key}"]`);
  if (indicator) {
    indicator.style.opacity = l.on ? '1' : '0.25';
  }
}

/* ============ Views ============ */

function createView(label, viewId) {
  const view = el('div', 'scene-view');
  view.dataset.view = viewId;
  view.innerHTML = `
    <span class="scene-view-label">${label}</span>
    <div class="scene-subject"></div>
  `;
  return view;
}

/* ============ Camera ============ */

function placeCamera() {
  addDraggableIndicator(views.top, 'camera', camera.x, camera.y, 'cam-top', (x, y) => {
    camera.x = x;
    camera.y = y;
    activeCameraPreset = null;
    updateCameraPresetUI();
    markManualSceneChange();
  });

  addDraggableIndicator(views.side, 'camera', camera.y, 100 - cameraHeight, 'cam-side', (x, y) => {
    camera.y = x;
    cameraHeight = 100 - y;
    activeCameraPreset = null;
    updateCameraPresetUI();
    markManualSceneChange();
  });
}

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

/* ============ Aperture ============ */

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

/* ============ Lighting Presets ============ */

function placeLights() {
  for (const [key, light] of Object.entries(lights)) {
    if (key === 'hair') continue;

    addDraggableIndicator(views.top, 'light', light.x, light.y, `light-${key}`, (x, y) => {
      lights[key].x = x;
      lights[key].y = y;
      lightingPreset = '自定义';
      updateLightingPresetUI();
      updateLightDesc('');
      const card = containerEl?.querySelector(`.light-card-${key}`);
      if (card) updateSubjectLumens(key, card);
      markManualSceneChange();
    }, key, light.on);
  }

  const hair = lights.hair;
  addDraggableIndicator(views.top, 'light', hair.x, hair.y, 'light-hair', (x, y) => {
    lights.hair.x = x;
    lights.hair.y = y;
    markManualSceneChange();
  }, 'hair', hair.on);

  addStaticLight(views.front, 'key', lights.key.x, 25, lights.key.on);
  addStaticLight(views.side, 'key', lights.key.y, 25, lights.key.on);
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

/* ============ Draggable Indicator ============ */

function addDraggableIndicator(viewEl, type, pctX, pctY, dataId, onMove, lightKey, lightOn = true) {
  const indicator = el('div', type === 'camera' ? 'scene-camera' : 'scene-light');
  indicator.dataset.id = dataId;
  if (type === 'light' && lightKey) {
    indicator.setAttribute('data-type', lightKey);
    indicator.style.opacity = lightOn ? '1' : '0.25';
    indicator.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
  } else {
    indicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  }

  indicator.style.left = `${pctX}%`;
  indicator.style.top = `${pctY}%`;

  indicator.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    indicator.setPointerCapture(e.pointerId);
    indicator.classList.add('dragging');

    const viewRect = viewEl.getBoundingClientRect();
    const move = (ev) => {
      const x = clamp(((ev.clientX - viewRect.left) / viewRect.width) * 100, 5, 95);
      const y = clamp(((ev.clientY - viewRect.top) / viewRect.height) * 100, 5, 95);
      indicator.style.left = `${x}%`;
      indicator.style.top = `${y}%`;
      onMove(x, y);
    };
    const up = () => {
      indicator.classList.remove('dragging');
      indicator.removeEventListener('pointermove', move);
      indicator.removeEventListener('pointerup', up);
    };
    indicator.addEventListener('pointermove', move);
    indicator.addEventListener('pointerup', up);
  });

  viewEl.appendChild(indicator);
}

/* ============ Helpers ============ */

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

function placeCameraDirectionLine() {
  if (!views.top) return;
  const line = el('div', 'scene-cam-line-el');
  const dx = 50 - camera.x;
  const dy = 50 - camera.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return;
  const angle = Math.atan2(dx, -dy) * (180 / Math.PI);
  line.style.cssText = `
    position:absolute;left:${camera.x}%;top:${camera.y}%;
    width:1.5px;height:${len}%;transform-origin:top center;
    transform:rotate(${angle}deg);
    background:var(--color-candy-pink);opacity:0.25;
    pointer-events:none;z-index:3;
  `;
  views.top.appendChild(line);
}

function addStaticLight(viewEl, lightType, pctX, pctY, on = true) {
  const dot = el('div', 'scene-light scene-light-static');
  dot.setAttribute('data-type', lightType);
  dot.style.left = `${pctX}%`;
  dot.style.top = `${pctY}%`;
  dot.style.opacity = on ? '0.5' : '0.15';
  dot.style.cursor = 'default';
  dot.style.width = '14px';
  dot.style.height = '14px';
  dot.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="8" height="8"><circle cx="12" cy="12" r="5"/></svg>';
  viewEl.appendChild(dot);
}

function updateCamDesc(desc) {
  const dom = containerEl?.querySelector('#cam-desc');
  if (dom) dom.textContent = desc;
}

function updateLightDesc(desc) {
  const dom = containerEl?.querySelector('#light-desc');
  if (dom) dom.textContent = desc;
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
  cameraHeight = preset.height;
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
  lights.key = { ...lights.key, x: preset.key.x, y: preset.key.y };
  lights.fill = { ...lights.fill, x: preset.fill.x, y: preset.fill.y };
  lights.back = { ...lights.back, x: preset.back.x, y: preset.back.y };
  return true;
}

function markManualSceneChange() {
  manualSceneChanged = true;
}
