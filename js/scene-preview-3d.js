/**
 * scene-preview-3d.js
 * Three.js preview-only renderer for camera + dynamic lights.
 */

const THREE_MODULE_URL = 'https://esm.sh/three@0.164.1';
const ORBIT_CONTROLS_URL = 'https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls.js';

const LIGHT_COLORS = [
  0xffd66b, 0x89cff3, 0xffb997, 0xc3a6ff,
  0x9fe870, 0xffc76a, 0x7ed6df, 0xf4a6ff,
  0x8bd1ff, 0xffd1a8, 0xb7f7b0, 0xd7c8ff,
];
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

let runtimePromise = null;
let hostEl = null;
let stageEl = null;
let statusEl = null;
let resizeObserver = null;

let THREE_RUNTIME = null;
let ORBIT_CONTROLS_CTOR = null;

let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let frameId = null;

let subjectMesh = null;
let cameraGroup = null;
let cameraBeam = null;
let lightGroups = {};
let lightBeams = {};

let latestSnapshot = null;
let generation = 0;

function resolveHost(containerOrId) {
  if (!containerOrId) return null;
  if (typeof containerOrId === 'string') {
    return document.getElementById(containerOrId);
  }
  return containerOrId instanceof HTMLElement ? containerOrId : null;
}

function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = Promise.all([
      import(THREE_MODULE_URL),
      import(ORBIT_CONTROLS_URL),
    ]).then(([threeModule, orbitModule]) => {
      const threeLib = threeModule;
      const orbitCtor = orbitModule?.OrbitControls;
      if (!threeLib || !orbitCtor) {
        throw new Error('three_runtime_unavailable');
      }
      THREE_RUNTIME = threeLib;
      ORBIT_CONTROLS_CTOR = orbitCtor;
      return { THREE: threeLib, OrbitControls: orbitCtor };
    });
  }
  return runtimePromise;
}

export function initScenePreview3D(containerOrId, initialSnapshot = null) {
  destroyScenePreview3D();
  generation += 1;
  const token = generation;

  hostEl = resolveHost(containerOrId);
  if (!hostEl) return;

  hostEl.innerHTML = '';
  hostEl.classList.add('scene-3d-preview');

  stageEl = document.createElement('div');
  stageEl.className = 'scene-3d-stage';

  statusEl = document.createElement('div');
  statusEl.className = 'scene-3d-status';
  statusEl.textContent = '3D 预览加载中...';

  hostEl.appendChild(stageEl);
  hostEl.appendChild(statusEl);

  latestSnapshot = normalizeSnapshot(initialSnapshot);

  loadRuntime()
    .then(({ THREE, OrbitControls }) => {
      if (token !== generation || !stageEl) return;
      setupScene(THREE, OrbitControls);
      updateScenePreview3D(latestSnapshot);
      hideStatus();
    })
    .catch(() => {
      showStatus('当前环境无法加载 Three.js 预览');
    });
}

export function updateScenePreview3D(snapshot) {
  latestSnapshot = normalizeSnapshot(snapshot);
  if (!scene || !THREE_RUNTIME || !latestSnapshot) return;

  const THREE = THREE_RUNTIME;
  const subjectPos = new THREE.Vector3(0, 16, 0);
  const camPos = toWorldVec(latestSnapshot.camera);

  if (cameraGroup) {
    cameraGroup.position.copy(camPos);
    cameraGroup.lookAt(subjectPos);
  }
  if (cameraBeam) {
    const spread = FOCAL_CAMERA_ANGLE[latestSnapshot.focalLength] || 62;
    const radius = clamp(8 + spread * 0.16, 8, 26);
    updateBeamMesh(cameraBeam, camPos, subjectPos, spread, radius, 0xff8fab, 0.16);
  }

  ensureDynamicLightEntities(latestSnapshot.lightsList);
  for (const lightState of latestSnapshot.lightsList) {
    const key = lightState.id;
    const group = lightGroups[key];
    const beam = lightBeams[key];
    if (!group || !beam) continue;

    const pos = toWorldVec(lightState);
    group.position.copy(pos);
    group.lookAt(subjectPos);
    group.visible = true;

    const spread = LIGHT_BEAM_ANGLE[lightState.type] || 60;
    const radius = clamp(4 + Math.sqrt(Math.max(100, lightState.lumens || 100)) / 8.5, 4, 24);
    const opacity = lightState.on ? 0.2 : 0.07;
    const colorHex = normalizeColorHex(lightState.color, lightState.slot - 1);
    updateBeamMesh(beam, pos, subjectPos, spread, radius, colorHex, opacity);
    beam.visible = true;
    group.children.forEach((child) => {
      if (child.material && 'opacity' in child.material) {
        child.material.opacity = lightState.on ? 1 : 0.3;
      }
      if (child.material?.color?.setHex) {
        child.material.color.setHex(colorHex);
      }
      if (child.material?.emissive?.setHex) {
        child.material.emissive.setHex(colorHex);
      }
    });
  }
}

export function destroyScenePreview3D() {
  generation += 1;

  if (frameId) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (controls?.dispose) {
    controls.dispose();
  }
  controls = null;

  if (scene) {
    scene.traverse((object) => {
      if (object.geometry?.dispose) object.geometry.dispose();
      if (object.material?.dispose) object.material.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((mat) => mat?.dispose?.());
      }
    });
  }

  if (renderer?.dispose) {
    renderer.dispose();
  }

  renderer = null;
  scene = null;
  camera = null;
  subjectMesh = null;
  cameraGroup = null;
  cameraBeam = null;
  lightGroups = {};
  lightBeams = {};

  if (hostEl) {
    hostEl.innerHTML = '';
  }
  hostEl = null;
  stageEl = null;
  statusEl = null;
}

function setupScene(THREE, OrbitControls) {
  if (!stageEl) return;
  const width = Math.max(240, stageEl.clientWidth || 320);
  const height = Math.max(220, stageEl.clientHeight || 260);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 400);
  camera.position.set(48, 38, 78);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 16, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 30;
  controls.maxDistance = 180;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x3e465a, 0.95);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.75);
  dir.position.set(35, 68, 20);
  scene.add(dir);

  const grid = new THREE.GridHelper(140, 14, 0xc7cde6, 0xe8ebf5);
  grid.position.y = 0;
  scene.add(grid);

  const axes = new THREE.AxesHelper(18);
  axes.position.set(-56, 1, 56);
  scene.add(axes);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 140),
    new THREE.MeshStandardMaterial({ color: 0xf7f8fc, transparent: true, opacity: 0.38, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.1;
  scene.add(floor);

  subjectMesh = new THREE.Mesh(
    new THREE.BoxGeometry(12, 22, 8),
    new THREE.MeshStandardMaterial({ color: 0xff8fab, transparent: true, opacity: 0.6, roughness: 0.65 })
  );
  subjectMesh.position.set(0, 11, 0);
  scene.add(subjectMesh);

  cameraGroup = new THREE.Group();
  const camBody = new THREE.Mesh(
    new THREE.SphereGeometry(1.7, 20, 20),
    new THREE.MeshStandardMaterial({ color: 0xff8fab, metalness: 0.15, roughness: 0.38 })
  );
  cameraGroup.add(camBody);
  scene.add(cameraGroup);

  cameraBeam = createBeamMesh(THREE, 0xff8fab);
  scene.add(cameraBeam);

  stageEl.appendChild(renderer.domElement);
  attachResizeObserver();
  startRenderLoop();
}

function attachResizeObserver() {
  if (!stageEl || !renderer || !camera) return;
  resizeObserver = new ResizeObserver(() => {
    if (!stageEl || !renderer || !camera) return;
    const width = Math.max(220, stageEl.clientWidth || 320);
    const height = Math.max(200, stageEl.clientHeight || 240);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(stageEl);
}

function startRenderLoop() {
  const tick = () => {
    if (!renderer || !scene || !camera) return;
    controls?.update();
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(tick);
  };
  tick();
}

function normalizeSnapshot(snapshot) {
  const base = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const cameraState = base.camera || {};
  const rawList = Array.isArray(base.lightsList)
    ? base.lightsList
    : Object.values(base.lights || {});
  const lightsList = rawList
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => ({
      id: String(item.id || item.key || `light${index + 1}`),
      slot: Number.isFinite(item.slot) ? Number(item.slot) : index + 1,
      color: item.color || null,
      x: normalizePct(item.x, index % 2 === 0 ? 35 : 65),
      y: normalizePct(item.y, index % 2 === 0 ? 30 : 45),
      z: normalizePct(item.z, index % 2 === 0 ? 72 : 58),
      on: typeof item.on === 'boolean' ? item.on : true,
      type: typeof item.type === 'string' ? item.type : '聚光灯',
      lumens: clamp(Number(item.lumens) || 1500, 100, 100000),
    }));

  return {
    camera: {
      x: normalizePct(cameraState.x, 50),
      y: normalizePct(cameraState.y, 80),
      z: normalizePct(cameraState.z, 50),
    },
    focalLength: typeof base.focalLength === 'string' ? base.focalLength : '50mm',
    lightsList,
  };
}

function toWorldVec(point) {
  const x = (normalizePct(point?.x, 50) - 50) * 1.1;
  const z = (normalizePct(point?.y, 50) - 50) * 1.1;
  const y = 4 + normalizePct(point?.z, 50) * 0.28;
  return new THREE_RUNTIME.Vector3(x, y, z);
}

function createBeamMesh(THREE, colorHex) {
  const geometry = new THREE.ConeGeometry(1, 1, 24, 1, true);
  geometry.translate(0, -0.5, 0);
  const material = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geometry, material);
}

function updateBeamMesh(mesh, from, to, spreadDeg, radius, colorHex, opacity) {
  if (!mesh || !THREE_RUNTIME) return;
  const direction = to.clone().sub(from);
  const rawDistance = direction.length();
  if (!Number.isFinite(rawDistance) || rawDistance < 0.0001) return;
  const distance = Math.max(4, rawDistance);
  direction.normalize();

  const beamLength = clamp(distance * 0.74, 4, 46);
  const spread = clamp(spreadDeg, 18, 140);
  const baseRadius = Math.max(0.55, Math.tan((spread * Math.PI / 180) / 2) * beamLength * 0.2);
  const scaledRadius = clamp(baseRadius + radius * 0.04, 0.55, 16);

  mesh.scale.set(scaledRadius, beamLength, scaledRadius);
  // The cone geometry apex is translated to local origin, so anchor it at source position.
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(new THREE_RUNTIME.Vector3(0, -1, 0), direction);

  if (mesh.material) {
    mesh.material.color.setHex(colorHex);
    mesh.material.opacity = clamp(opacity, 0.03, 0.24);
  }
}

function ensureDynamicLightEntities(lightsList) {
  if (!scene || !THREE_RUNTIME) return;
  const presentIds = new Set(lightsList.map((item) => item.id));

  for (const id of Object.keys(lightGroups)) {
    if (presentIds.has(id)) continue;
    const group = lightGroups[id];
    if (group) {
      scene.remove(group);
      group.traverse((obj) => {
        if (obj.geometry?.dispose) obj.geometry.dispose();
        if (obj.material?.dispose) obj.material.dispose();
      });
    }
    delete lightGroups[id];

    const beam = lightBeams[id];
    if (beam) {
      scene.remove(beam);
      beam.geometry?.dispose?.();
      beam.material?.dispose?.();
    }
    delete lightBeams[id];
  }

  for (let i = 0; i < lightsList.length; i += 1) {
    const light = lightsList[i];
    if (!light || lightGroups[light.id]) continue;
    const colorHex = normalizeColorHex(light.color, light.slot - 1);
    const group = new THREE_RUNTIME.Group();
    const marker = new THREE_RUNTIME.Mesh(
      new THREE_RUNTIME.SphereGeometry(1.45, 16, 16),
      new THREE_RUNTIME.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.28,
        transparent: true,
        opacity: 0.96,
      })
    );
    group.add(marker);
    scene.add(group);
    lightGroups[light.id] = group;

    const beam = createBeamMesh(THREE_RUNTIME, colorHex);
    scene.add(beam);
    lightBeams[light.id] = beam;
  }
}

function normalizeColorHex(rawColor, index = 0) {
  if (Number.isInteger(rawColor)) return rawColor;
  if (typeof rawColor === 'string') {
    const color = rawColor.trim();
    if (/^#([0-9a-f]{6})$/i.test(color)) {
      return Number.parseInt(color.slice(1), 16);
    }
    if (/^#([0-9a-f]{3})$/i.test(color)) {
      const hex = color
        .slice(1)
        .split('')
        .map((c) => c + c)
        .join('');
      return Number.parseInt(hex, 16);
    }
  }
  const safeIndex = Number.isFinite(index) ? Math.max(0, index) : 0;
  return LIGHT_COLORS[safeIndex % LIGHT_COLORS.length];
}

function normalizePct(value, fallback) {
  if (!Number.isFinite(Number(value))) return fallback;
  return clamp(Number(value), 0, 100);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function showStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

function hideStatus() {
  if (!statusEl) return;
  statusEl.textContent = '';
}
