/**
 * api.js — AI API communication layer
 * Dual-mode transport:
 * - managed: same-origin Cloudflare Pages Function proxy (/api/chat, /api/analyze-orchestrate)
 * - custom: browser direct call by role (structure/lighting/normalize)
 */

const MODE_MANAGED = 'managed';
const MODE_CUSTOM = 'custom';
const ROLE_KEYS = ['structure', 'lighting', 'normalize'];

const STORAGE_KEYS = {
  mode: 'pc_api_mode',
  role: {
    structure: {
      baseUrl: 'pc_role_structure_base_url',
      apiKey: 'pc_role_structure_api_key',
      model: 'pc_role_structure_model',
    },
    lighting: {
      baseUrl: 'pc_role_lighting_base_url',
      apiKey: 'pc_role_lighting_api_key',
      model: 'pc_role_lighting_model',
    },
    normalize: {
      baseUrl: 'pc_role_normalize_base_url',
      apiKey: 'pc_role_normalize_api_key',
      model: 'pc_role_normalize_model',
    },
  },
  // Legacy single-custom keys (migration source)
  customBaseUrl: 'pc_custom_base_url',
  customApiKey: 'pc_custom_api_key',
  customModel: 'pc_custom_model',
};

const LEGACY_STORAGE_KEYS = [
  'pc_api_base_url',
  'pc_api_key',
  'pc_model',
  'pc_model_managed',
];

const API_PATH = '/api/chat';
const ORCHESTRATE_PATH = '/api/analyze-orchestrate';

function sanitizeMode(value) {
  return value === MODE_CUSTOM ? MODE_CUSTOM : MODE_MANAGED;
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function sanitizeText(value) {
  return String(value || '').trim();
}

function setStorageText(key, value) {
  if (value) {
    localStorage.setItem(key, value);
  } else {
    localStorage.removeItem(key);
  }
}

function readRoleConfigFromStorage(role) {
  const keys = STORAGE_KEYS.role[role];
  return {
    baseUrl: normalizeBaseUrl(localStorage.getItem(keys.baseUrl)),
    apiKey: sanitizeText(localStorage.getItem(keys.apiKey)),
    model: sanitizeText(localStorage.getItem(keys.model)),
  };
}

function writeRoleConfigToStorage(role, cfg) {
  const keys = STORAGE_KEYS.role[role];
  if (!keys) return;
  if (!cfg || typeof cfg !== 'object') return;
  if (cfg.baseUrl !== undefined) setStorageText(keys.baseUrl, normalizeBaseUrl(cfg.baseUrl));
  if (cfg.apiKey !== undefined) setStorageText(keys.apiKey, sanitizeText(cfg.apiKey));
  if (cfg.model !== undefined) setStorageText(keys.model, sanitizeText(cfg.model));
}

function migrateLegacyConfig() {
  const legacyBaseUrl = normalizeBaseUrl(localStorage.getItem(STORAGE_KEYS.customBaseUrl));
  const legacyApiKey = sanitizeText(localStorage.getItem(STORAGE_KEYS.customApiKey));
  const legacyModel = sanitizeText(localStorage.getItem(STORAGE_KEYS.customModel));

  const shouldCopy = Boolean(legacyBaseUrl || legacyApiKey || legacyModel);
  if (!shouldCopy) return;

  for (const role of ROLE_KEYS) {
    const current = readRoleConfigFromStorage(role);
    const next = {
      baseUrl: current.baseUrl || legacyBaseUrl,
      apiKey: current.apiKey || legacyApiKey,
      model: current.model || legacyModel,
    };
    writeRoleConfigToStorage(role, next);
  }

  localStorage.removeItem(STORAGE_KEYS.customBaseUrl);
  localStorage.removeItem(STORAGE_KEYS.customApiKey);
  localStorage.removeItem(STORAGE_KEYS.customModel);
}

function readStoredConfig() {
  migrateLegacyConfig();

  const mode = sanitizeMode(localStorage.getItem(STORAGE_KEYS.mode));
  const roles = {};
  for (const role of ROLE_KEYS) {
    roles[role] = readRoleConfigFromStorage(role);
  }

  return {
    mode,
    roles,
  };
}

function sanitizeRoleConfig(input = {}) {
  return {
    baseUrl: normalizeBaseUrl(input.baseUrl),
    apiKey: sanitizeText(input.apiKey),
    model: sanitizeText(input.model),
  };
}

function mergeConfigWithOverride(current, overrideConfig) {
  if (!overrideConfig || typeof overrideConfig !== 'object') {
    return current;
  }

  const mode = sanitizeMode(overrideConfig.mode ?? current.mode);
  const nextRoles = {};
  for (const role of ROLE_KEYS) {
    const fromCurrent = current.roles?.[role] || {};
    const fromOverride = overrideConfig.roles?.[role] || {};

    // backward compatibility: single custom fields override all roles
    const singleBase = overrideConfig.customBaseUrl;
    const singleKey = overrideConfig.customApiKey;
    const singleModel = overrideConfig.customModel ?? overrideConfig.model;

    nextRoles[role] = sanitizeRoleConfig({
      baseUrl: fromOverride.baseUrl ?? singleBase ?? fromCurrent.baseUrl,
      apiKey: fromOverride.apiKey ?? singleKey ?? fromCurrent.apiKey,
      model: fromOverride.model ?? singleModel ?? fromCurrent.model,
    });
  }

  return {
    mode,
    roles: nextRoles,
  };
}

function toPublicConfig(config) {
  return {
    mode: config.mode,
    roles: config.roles,
    // compatibility with old callers
    customBaseUrl: config.roles?.structure?.baseUrl || '',
    customApiKey: config.roles?.structure?.apiKey || '',
    customModel: config.roles?.structure?.model || '',
    model: config.mode === MODE_CUSTOM ? (config.roles?.structure?.model || '') : '',
  };
}

function getMissingRoleFields(config, role) {
  const roleConfig = config.roles?.[role] || {};
  const missing = [];
  if (!roleConfig.baseUrl) missing.push(`${role}.Base URL`);
  if (!roleConfig.apiKey) missing.push(`${role}.API Key`);
  if (!roleConfig.model) missing.push(`${role}.Model`);
  return missing;
}

function getAllMissingCustomFields(config) {
  const missing = [];
  for (const role of ROLE_KEYS) {
    missing.push(...getMissingRoleFields(config, role));
  }
  return missing;
}

function resolveRoleConfig(config, role = 'structure') {
  const preferred = ROLE_KEYS.includes(role) ? role : 'structure';
  return sanitizeRoleConfig(config.roles?.[preferred] || {});
}

function buildRequestTarget(config, role = 'structure') {
  if (config.mode === MODE_CUSTOM) {
    const roleConfig = resolveRoleConfig(config, role);
    return {
      endpoint: `${roleConfig.baseUrl}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${roleConfig.apiKey}`,
      },
      model: roleConfig.model,
      mode: MODE_CUSTOM,
      role,
    };
  }

  return {
    endpoint: API_PATH,
    headers: {
      'Content-Type': 'application/json',
    },
    mode: MODE_MANAGED,
    role,
  };
}

function buildRequestBody(target, messages, stream, temperature) {
  const body = {
    messages,
    stream,
    temperature,
  };
  if (target.mode === MODE_CUSTOM) {
    body.model = target.model;
  }
  return body;
}

export function getApiConfig() {
  const stored = readStoredConfig();
  return toPublicConfig(stored);
}

export function setApiConfig(nextConfig = {}) {
  migrateLegacyConfig();
  const current = readStoredConfig();
  const merged = mergeConfigWithOverride(current, nextConfig);

  if (merged.mode !== undefined) {
    localStorage.setItem(STORAGE_KEYS.mode, sanitizeMode(merged.mode));
  }
  for (const role of ROLE_KEYS) {
    writeRoleConfigToStorage(role, merged.roles?.[role]);
  }
}

export function cleanupLegacyApiConfig() {
  for (const key of LEGACY_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
}

function getErrorMessage(text, fallback) {
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return parsed?.error?.message || fallback;
  } catch {
    return text || fallback;
  }
}

function getCustomModeHint(err) {
  const message = String(err?.message || '');
  const maybeNetwork = err instanceof TypeError || /Failed to fetch|NetworkError/i.test(message);
  if (!maybeNetwork) return null;

  return '自定义端点连接失败：该端点可能不支持浏览器直连，或未放开 CORS。请检查 Base URL、跨域配置与 HTTPS 证书。';
}

async function checkSingleConnection(target) {
  const res = await fetch(target.endpoint, {
    method: 'POST',
    headers: target.headers,
    body: JSON.stringify(buildRequestBody(
      target,
      [{ role: 'user', content: 'Hi' }],
      false,
      0
    )),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    const message = getErrorMessage(errBody, `HTTP ${res.status}`);
    throw new Error(message);
  }
}

export async function testConnection(overrideConfig = null) {
  const current = readStoredConfig();
  const config = mergeConfigWithOverride(current, overrideConfig);

  if (config.mode === MODE_CUSTOM) {
    const missing = getAllMissingCustomFields(config);
    if (missing.length > 0) {
      return {
        success: false,
        message: `请先填写自定义模式必填项：${missing.join(' / ')}`,
      };
    }
  }

  try {
    if (config.mode === MODE_MANAGED) {
      await checkSingleConnection(buildRequestTarget(config, 'structure'));
      return { success: true, message: '连接成功（已通过同源代理）' };
    }

    for (const role of ROLE_KEYS) {
      await checkSingleConnection(buildRequestTarget(config, role));
    }
    return { success: true, message: '连接成功（三角色端点均可用）' };
  } catch (err) {
    if (config.mode === MODE_CUSTOM) {
      const hint = getCustomModeHint(err);
      if (hint) return { success: false, message: hint };
    }
    return { success: false, message: `连接失败: ${err.message}` };
  }
}

export async function streamChat(messages, { onChunk, onDone, onError, signal, role = 'structure' }) {
  const config = readStoredConfig();
  const target = buildRequestTarget(config, role);

  if (target.mode === MODE_CUSTOM) {
    const missing = getMissingRoleFields(config, role);
    if (missing.length > 0) {
      throw new Error(`自定义模式缺少必填项：${missing.join(' / ')}`);
    }
  }

  let fullText = '';

  try {
    const response = await fetch(target.endpoint, {
      method: 'POST',
      headers: target.headers,
      body: JSON.stringify(buildRequestBody(target, messages, true, 0.7)),
      signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      const message = getErrorMessage(errBody, `API 请求失败 (${response.status})`);
      throw new Error(message);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('响应未返回可读取的流数据');
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onChunk?.(content);
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    if (buffer.trim()) {
      const remaining = buffer.trim();
      if (remaining.startsWith('data:')) {
        const dataStr = remaining.slice(5).trim();
        if (dataStr && dataStr !== '[DONE]') {
          try {
            const parsed = JSON.parse(dataStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              onChunk?.(content);
            }
          } catch {
            // Ignore tail parse errors
          }
        }
      }
    }

    onDone?.(fullText);
  } catch (err) {
    if (err.name === 'AbortError') {
      onDone?.(fullText);
      return;
    }
    if (target.mode === MODE_CUSTOM) {
      const hint = getCustomModeHint(err);
      if (hint) {
        const wrapped = new Error(hint);
        onError?.(wrapped);
        throw wrapped;
      }
    }
    onError?.(err);
    throw err;
  }
}

export async function requestAnalyzeOrchestrate(payload, { signal } = {}) {
  const response = await fetch(ORCHESTRATE_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload || {}),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(getErrorMessage(text, `编排请求失败 (${response.status})`));
  }

  return response.json();
}
