/**
 * scene.js — Scene Three-View Panel
 * Top/Front/Side views with draggable camera and light indicators
 * Camera presets, aperture selector, lighting presets
 */

/* ============ State ============ */
let containerEl = null;
let views = {}; // { top: el, front: el, side: el }

let camera = { x: 50, y: 80 };     // top-view position (% from left, % from top)
let cameraHeight = 50;               // side-view vertical position (%)
let aperture = 'f/2.8';
let lightingPreset = '自然光';
let focalLength = '50mm';
let framing = '中景';
let lightQuality = '中性';
let colorTemp = '自然';
let timeOfDay = null;

let lights = {
  key:  { x: 30, y: 25 },  // top-view
  fill: { x: 70, y: 40 },
  back: { x: 50, y: 15 },
};

let activeCameraPreset = null;
let dragTarget = null;

/* ---- Presets ---- */
const CAMERA_PRESETS = [
  { name: '平视',  desc: 'eye-level shot', cam: { x: 50, y: 85 }, height: 50 },
  { name: '俯拍',  desc: 'high-angle shot', cam: { x: 50, y: 60 }, height: 25 },
  { name: '仰拍',  desc: 'low-angle shot', cam: { x: 50, y: 85 }, height: 80 },
  { name: '鸟瞰',  desc: "bird's eye view", cam: { x: 50, y: 50 }, height: 10 },
  { name: '45°斜角', desc: '45-degree angle', cam: { x: 30, y: 70 }, height: 35 },
];

const APERTURE_OPTIONS = [
  { value: 'f/1.4', hint: '极浅景深' },
  { value: 'f/2.8', hint: '背景虚化' },
  { value: 'f/5.6', hint: '适度模糊' },
  { value: 'f/8',   hint: '均衡清晰' },
  { value: 'f/16',  hint: '全景深' },
];

const LIGHTING_PRESETS = [
  { name: '自然光', desc: 'natural ambient lighting', key: { x: 50, y: 10 }, fill: { x: 50, y: 50 }, back: { x: 50, y: 90 } },
  { name: '伦勃朗', desc: 'Rembrandt (45° key + opposite fill)', key: { x: 25, y: 20 }, fill: { x: 75, y: 45 }, back: { x: 60, y: 85 } },
  { name: '蝶形光', desc: 'butterfly lighting (front overhead)', key: { x: 50, y: 15 }, fill: { x: 35, y: 50 }, back: { x: 65, y: 50 } },
  { name: '侧光',   desc: 'side lighting (dramatic split)', key: { x: 10, y: 35 }, fill: { x: 80, y: 55 }, back: { x: 50, y: 85 } },
  { name: '逆光',   desc: 'backlit / rim lighting', key: { x: 50, y: 10 }, fill: { x: 40, y: 75 }, back: { x: 60, y: 75 } },
];

const FOCAL_OPTIONS = [
  { value: '14mm', hint: '超广角',  desc: 'ultra wide-angle, dramatic perspective distortion' },
  { value: '24mm', hint: '广角',    desc: 'wide-angle lens, expansive framing' },
  { value: '35mm', hint: '小广角',  desc: '35mm lens, natural perspective' },
  { value: '50mm', hint: '标准',    desc: '50mm standard lens, no distortion' },
  { value: '85mm', hint: '人像',    desc: '85mm portrait lens, flattering compression' },
  { value: '135mm',hint: '中长焦',  desc: '135mm, compressed perspective, subject isolation' },
  { value: '200mm',hint: '长焦',    desc: 'telephoto lens, extreme compression, stacked planes' },
];

const FRAMING_OPTIONS = [
  { value: '大特写', desc: 'extreme close-up (ECU), face/detail only' },
  { value: '特写',   desc: 'close-up shot (CU), head and shoulders' },
  { value: '近景',   desc: 'medium close-up (MCU), chest up' },
  { value: '中景',   desc: 'medium shot (MS), waist up' },
  { value: '全景',   desc: 'full shot (FS), full body visible' },
  { value: '远景',   desc: 'wide/establishing shot (WS), environment dominant' },
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
  { name: '蓝调', desc: 'blue hour, twilight, soft blue light', temp: '冷蓝', quality: '柔光', icon: '☀️' },
  { name: '日出', desc: 'sunrise, warm golden light, long shadows', temp: '暖黄', quality: '柔光', icon: '☀️' },
  { name: '正午', desc: 'harsh midday sun, overhead, strong shadows', temp: '自然', quality: '硬光', icon: '☀️' },
  { name: '黄金', desc: 'golden hour, warm backlight, soft glow', temp: '金橙', quality: '柔光', icon: '☀️' },
  { name: '夜晚', desc: 'nighttime, moonlight, artificial lights', temp: '冷蓝', quality: '中性', icon: '☀️' },
];

/* ============ Init ============ */

/**
 * Initialize the scene three-view panel
 * @param {string} containerId
 */
export function initScene(containerId) {
  containerEl = document.getElementById(containerId);
  if (!containerEl) return;

  render();
}

/**
 * Get scene data for optimization
 */
export function getSceneData() {
  const camPreset = CAMERA_PRESETS.find(p => p.name === activeCameraPreset);
  const focalOpt = FOCAL_OPTIONS.find(o => o.value === focalLength);
  const framingOpt = FRAMING_OPTIONS.find(o => o.value === framing);
  const qualityOpt = LIGHT_QUALITY_OPTIONS.find(o => o.value === lightQuality);
  const tempOpt = COLOR_TEMP_OPTIONS.find(o => o.value === colorTemp);
  const timeOpt = TIME_PRESETS.find(o => o.name === timeOfDay);
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
    lights: {
      key: { x: Math.round(lights.key.x), y: Math.round(lights.key.y) },
      fill: { x: Math.round(lights.fill.x), y: Math.round(lights.fill.y) },
      back: { x: Math.round(lights.back.x), y: Math.round(lights.back.y) },
    },
  };
}

/**
 * Destroy scene
 */
export function destroyScene() {
  if (containerEl) containerEl.innerHTML = '';
}

/* ============ Render ============ */

function render() {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  // Three views
  const viewsRow = el('div', 'scene-views');

  const topView = createView('俯视', 'top');
  const frontView = createView('正视', 'front');
  const sideView = createView('侧视', 'side');

  viewsRow.appendChild(topView);
  viewsRow.appendChild(frontView);
  viewsRow.appendChild(sideView);
  containerEl.appendChild(viewsRow);

  // Legend
  const legend = el('div', 'scene-legend');
  legend.innerHTML = `
    <div class="scene-legend-items">
      <span class="scene-legend-item"><span class="scene-legend-dot scene-legend-cam"></span>相机</span>
      <span class="scene-legend-item"><span class="scene-legend-dot scene-legend-key"></span>主光</span>
      <span class="scene-legend-item"><span class="scene-legend-dot scene-legend-fill"></span>补光</span>
      <span class="scene-legend-item"><span class="scene-legend-dot scene-legend-back"></span>轮廓光</span>
    </div>
    <div class="scene-legend-axes">
      <span>俯视: ←左右→ ↑远↓近</span>
      <span>正视: ←左右→ ↑高↓低</span>
      <span>侧视: ←前后→ ↑高↓低</span>
    </div>
  `;
  containerEl.appendChild(legend);

  views = {
    top: topView,
    front: frontView,
    side: sideView,
  };

  // Place indicators
  placeCamera();
  placeLights();

  // Camera direction line (top view: camera → center)
  placeCameraDirectionLine();

  // Controls
  const controls = el('div', 'scene-controls');

  // Camera presets row
  controls.appendChild(createControlRow('机位', createCameraPresets()));
  const camDescEl = el('div', 'scene-preset-desc');
  camDescEl.id = 'cam-desc';
  const camPreset = CAMERA_PRESETS.find(p => p.name === activeCameraPreset);
  camDescEl.textContent = camPreset ? camPreset.desc : '';
  controls.appendChild(camDescEl);

  // Focal length
  controls.appendChild(createControlRow('焦距', createOptionRow(FOCAL_OPTIONS, focalLength, (val) => {
    focalLength = val;
  }, 'focal-option')));

  // Framing
  controls.appendChild(createControlRow('景别', createOptionRow(FRAMING_OPTIONS, framing, (val) => {
    framing = val;
  }, 'framing-option')));

  // Aperture
  controls.appendChild(createControlRow('光圈', createApertureSelector()));

  // Lighting presets
  controls.appendChild(createControlRow('布光', createLightingPresets()));
  const lightDescEl = el('div', 'scene-preset-desc');
  lightDescEl.id = 'light-desc';
  const lightPreset = LIGHTING_PRESETS.find(p => p.name === lightingPreset);
  lightDescEl.textContent = lightPreset?.desc || '';
  controls.appendChild(lightDescEl);

  // Light quality
  controls.appendChild(createControlRow('柔硬', createOptionRow(LIGHT_QUALITY_OPTIONS, lightQuality, (val) => {
    lightQuality = val;
    timeOfDay = null;
    updateTimeBtns();
  }, 'quality-option')));

  // Color temperature
  controls.appendChild(createControlRow('色温', createColorTempSelector()));

  // Time of day
  controls.appendChild(createControlRow('时段', createTimePresets()));

  containerEl.appendChild(controls);
}

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
  // Camera in top view
  addDraggableIndicator(views.top, 'camera', camera.x, camera.y, 'cam-top',
    (x, y) => { camera.x = x; camera.y = y; activeCameraPreset = null; updateCameraPresetUI(); });

  // Camera in side view (x = depth same as top.y, y = height)
  addDraggableIndicator(views.side, 'camera', camera.y, 100 - cameraHeight, 'cam-side',
    (x, y) => { camera.y = x; cameraHeight = 100 - y; activeCameraPreset = null; updateCameraPresetUI(); });
}

function createCameraPresets() {
  const row = el('div', 'camera-presets');

  CAMERA_PRESETS.forEach(preset => {
    const btn = el('button', `camera-preset ${preset.name === activeCameraPreset ? 'active' : ''}`);
    btn.textContent = preset.name;
    btn.title = preset.desc;
    btn.dataset.name = preset.name;

    btn.addEventListener('click', () => {
      activeCameraPreset = preset.name;
      camera = { ...preset.cam };
      cameraHeight = preset.height;
      updateCamDesc(preset.desc);
      render();
    });

    row.appendChild(btn);
  });

  return row;
}

function updateCameraPresetUI() {
  containerEl?.querySelectorAll('.camera-preset').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.name === activeCameraPreset);
  });
  updateCamDesc('');
}

/* ============ Aperture ============ */

function createApertureSelector() {
  const row = el('div', 'aperture-selector');

  APERTURE_OPTIONS.forEach(opt => {
    const btn = el('button', `aperture-option ${opt.value === aperture ? 'active' : ''}`);
    btn.textContent = opt.value;
    btn.title = opt.hint;
    btn.dataset.value = opt.value;

    btn.addEventListener('click', () => {
      aperture = opt.value;
      row.querySelectorAll('.aperture-option').forEach(b => {
        b.classList.toggle('active', b.dataset.value === aperture);
      });
    });

    row.appendChild(btn);
  });

  return row;
}

/* ============ Lighting ============ */

function placeLights() {
  // Key light in top view (main)
  addDraggableIndicator(views.top, 'light', lights.key.x, lights.key.y, 'light-key',
    (x, y) => { lights.key = { x, y }; lightingPreset = '自定义'; updateLightingPresetUI(); updateLightDesc(''); }, 'key');

  addDraggableIndicator(views.top, 'light', lights.fill.x, lights.fill.y, 'light-fill',
    (x, y) => { lights.fill = { x, y }; lightingPreset = '自定义'; updateLightingPresetUI(); updateLightDesc(''); }, 'fill');

  addDraggableIndicator(views.top, 'light', lights.back.x, lights.back.y, 'light-back',
    (x, y) => { lights.back = { x, y }; lightingPreset = '自定义'; updateLightingPresetUI(); updateLightDesc(''); }, 'back');

  // Key light indicator in front view (x = same as top x, y = from estimated height)
  addStaticLight(views.front, 'key', lights.key.x, 25);

  // Key light indicator in side view
  addStaticLight(views.side, 'key', lights.key.y, 25);
}

function createLightingPresets() {
  const row = el('div', 'lighting-presets');

  LIGHTING_PRESETS.forEach(preset => {
    const btn = el('button', `lighting-preset ${preset.name === lightingPreset ? 'active' : ''}`);
    btn.textContent = preset.name;
    btn.dataset.name = preset.name;

    btn.addEventListener('click', () => {
      lightingPreset = preset.name;
      lights.key = { ...preset.key };
      lights.fill = { ...preset.fill };
      lights.back = { ...preset.back };
      updateLightDesc(preset.desc);
      render();
    });

    row.appendChild(btn);
  });

  return row;
}

function updateLightingPresetUI() {
  containerEl?.querySelectorAll('.lighting-preset').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.name === lightingPreset);
  });
}

/* ============ Draggable Indicator ============ */

function addDraggableIndicator(viewEl, type, pctX, pctY, dataId, onMove, lightType) {
  const indicator = el('div', type === 'camera' ? 'scene-camera' : 'scene-light');
  indicator.dataset.id = dataId;

  if (type === 'light') {
    indicator.setAttribute('data-type', lightType);
    // Sun icon
    indicator.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
  } else {
    // Camera icon
    indicator.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
  }

  indicator.style.left = `${pctX}%`;
  indicator.style.top = `${pctY}%`;

  // Drag
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
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function createControlRow(label, contentEl) {
  const row = el('div', 'scene-control-row');
  const labelEl = el('span', 'scene-control-label');
  labelEl.textContent = label;
  row.appendChild(labelEl);
  row.appendChild(contentEl);
  return row;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/* ============ Camera Direction Line ============ */

function placeCameraDirectionLine() {
  if (!views.top) return;

  const line = el('div', 'scene-cam-line-el');
  // Line from camera position toward center (50%, 50%)
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

/* ============ Static Light Indicator ============ */

function addStaticLight(viewEl, lightType, pctX, pctY) {
  const dot = el('div', 'scene-light scene-light-static');
  dot.setAttribute('data-type', lightType);
  dot.style.left = `${pctX}%`;
  dot.style.top = `${pctY}%`;
  dot.style.opacity = '0.5';
  dot.style.cursor = 'default';
  dot.style.width = '14px';
  dot.style.height = '14px';
  dot.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="8" height="8"><circle cx="12" cy="12" r="5"/></svg>`;
  viewEl.appendChild(dot);
}

/* ============ Preset Description Updates ============ */

function updateCamDesc(desc) {
  const el = containerEl?.querySelector('#cam-desc');
  if (el) el.textContent = desc;
}

function updateLightDesc(desc) {
  const el = containerEl?.querySelector('#light-desc');
  if (el) el.textContent = desc;
}

/* ============ Generic Option Row ============ */

/**
 * Create a row of capsule buttons for any option set
 * @param {Array} options - [{value, hint?, desc?}]
 * @param {string} activeValue
 * @param {(val: string) => void} onSelect
 * @param {string} cssClass
 */
function createOptionRow(options, activeValue, onSelect, cssClass) {
  const row = el('div', 'scene-option-row');

  options.forEach(opt => {
    const btn = el('button', `scene-pill ${cssClass} ${opt.value === activeValue ? 'active' : ''}`);
    btn.textContent = opt.hint || opt.value;
    btn.title = opt.desc || '';
    btn.dataset.value = opt.value;

    btn.addEventListener('click', () => {
      row.querySelectorAll(`.${cssClass}`).forEach(b => {
        b.classList.toggle('active', b.dataset.value === opt.value);
      });
      onSelect(opt.value);
    });

    row.appendChild(btn);
  });

  return row;
}

/* ============ Color Temperature Selector ============ */

function createColorTempSelector() {
  const wrap = el('div', 'color-temp-wrap');

  COLOR_TEMP_OPTIONS.forEach(opt => {
    const btn = el('button', `color-temp-btn ${opt.value === colorTemp ? 'active' : ''}`);
    btn.style.setProperty('--dot-color', opt.color);
    btn.innerHTML = `<span class="color-temp-dot"></span>${opt.value}`;
    btn.title = opt.desc;
    btn.dataset.value = opt.value;

    btn.addEventListener('click', () => {
      colorTemp = opt.value;
      timeOfDay = null;
      updateTimeBtns();
      wrap.querySelectorAll('.color-temp-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.value === opt.value);
      });
    });

    wrap.appendChild(btn);
  });

  return wrap;
}

/* ============ Time of Day Presets ============ */

function createTimePresets() {
  const row = el('div', 'time-presets');

  TIME_PRESETS.forEach(preset => {
    const btn = el('button', `time-preset ${preset.name === timeOfDay ? 'active' : ''}`);
    btn.textContent = preset.name;
    btn.title = preset.desc;
    btn.dataset.name = preset.name;

    btn.addEventListener('click', () => {
      timeOfDay = preset.name;

      // Auto-link color temp + light quality
      colorTemp = preset.temp;
      lightQuality = preset.quality;

      // Update color temp buttons
      containerEl?.querySelectorAll('.color-temp-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.value === preset.temp);
      });

      // Update light quality buttons
      containerEl?.querySelectorAll('.quality-option').forEach(b => {
        b.classList.toggle('active', b.dataset.value === preset.quality);
      });

      // Update time buttons
      row.querySelectorAll('.time-preset').forEach(b => {
        b.classList.toggle('active', b.dataset.name === preset.name);
      });
    });

    row.appendChild(btn);
  });

  return row;
}

function updateTimeBtns() {
  containerEl?.querySelectorAll('.time-preset').forEach(b => {
    b.classList.toggle('active', b.dataset.name === timeOfDay);
  });
}
