/**
 * api.js — AI API communication layer
 * Dual-mode transport:
 * - managed: same-origin Cloudflare Pages Function proxy (/api/chat)
 * - custom: browser direct call to customBaseUrl/chat/completions
 */

const STORAGE_KEYS = {
  mode: 'pc_api_mode',
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
const MODE_MANAGED = 'managed';
const MODE_CUSTOM = 'custom';

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

function migrateLegacyConfig() {
  cleanupLegacyApiConfig();
}

function readStoredConfig() {
  migrateLegacyConfig();

  const mode = sanitizeMode(localStorage.getItem(STORAGE_KEYS.mode));
  const customBaseUrl = normalizeBaseUrl(localStorage.getItem(STORAGE_KEYS.customBaseUrl));
  const customApiKey = sanitizeText(localStorage.getItem(STORAGE_KEYS.customApiKey));
  const customModel = sanitizeText(localStorage.getItem(STORAGE_KEYS.customModel));

  return {
    mode,
    customBaseUrl,
    customApiKey,
    customModel,
  };
}

function mergeConfigWithOverride(current, overrideConfig) {
  if (!overrideConfig || typeof overrideConfig !== 'object') {
    return current;
  }

  const mode = sanitizeMode(overrideConfig.mode ?? current.mode);
  const customBaseUrl = normalizeBaseUrl(
    overrideConfig.customBaseUrl ?? current.customBaseUrl
  );
  const customApiKey = sanitizeText(
    overrideConfig.customApiKey ?? current.customApiKey
  );
  const customModel = sanitizeText(
    overrideConfig.customModel ?? overrideConfig.model ?? current.customModel
  );

  return {
    mode,
    customBaseUrl,
    customApiKey,
    customModel,
  };
}

function toPublicConfig(config) {
  return {
    ...config,
    model: config.mode === MODE_CUSTOM ? config.customModel : '',
  };
}

function getRequiredCustomFields(config) {
  const missing = [];
  if (!config.customBaseUrl) missing.push('Base URL');
  if (!config.customApiKey) missing.push('API Key');
  if (!config.customModel) missing.push('Model');
  return missing;
}

function buildRequestTarget(config) {
  if (config.mode === MODE_CUSTOM) {
    return {
      endpoint: `${config.customBaseUrl}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.customApiKey}`,
      },
      model: config.customModel,
      mode: MODE_CUSTOM,
    };
  }

  return {
    endpoint: API_PATH,
    headers: {
      'Content-Type': 'application/json',
    },
    mode: MODE_MANAGED,
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

/**
 * Read API configuration from localStorage
 */
export function getApiConfig() {
  const stored = readStoredConfig();
  return toPublicConfig(stored);
}

/**
 * Save API configuration to localStorage
 */
export function setApiConfig(nextConfig = {}) {
  migrateLegacyConfig();
  const config = (nextConfig && typeof nextConfig === 'object') ? nextConfig : {};

  if (config.mode !== undefined) {
    localStorage.setItem(STORAGE_KEYS.mode, sanitizeMode(config.mode));
  }
  if (config.customBaseUrl !== undefined) {
    setStorageText(STORAGE_KEYS.customBaseUrl, normalizeBaseUrl(config.customBaseUrl));
  }
  if (config.customApiKey !== undefined) {
    setStorageText(STORAGE_KEYS.customApiKey, sanitizeText(config.customApiKey));
  }
  if (config.customModel !== undefined) {
    setStorageText(STORAGE_KEYS.customModel, sanitizeText(config.customModel));
  }
}

/**
 * Remove legacy browser-side secrets/config keys
 */
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

/**
 * Test connection with a tiny request
 * @param {Object | null} [overrideConfig]
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function testConnection(overrideConfig = null) {
  const current = readStoredConfig();
  const config = mergeConfigWithOverride(current, overrideConfig);
  const target = buildRequestTarget(config);

  if (config.mode === MODE_CUSTOM) {
    const missing = getRequiredCustomFields(config);
    if (missing.length > 0) {
      return {
        success: false,
        message: `请先填写自定义模式必填项：${missing.join(' / ')}`,
      };
    }
  }

  try {
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
      return { success: false, message: `连接失败: ${message}` };
    }

    if (config.mode === MODE_CUSTOM) {
      return { success: true, message: '连接成功（已直连自定义端点）' };
    }
    return { success: true, message: '连接成功（已通过同源代理）' };
  } catch (err) {
    if (config.mode === MODE_CUSTOM) {
      const hint = getCustomModeHint(err);
      if (hint) return { success: false, message: hint };
    }
    return { success: false, message: `连接失败: ${err.message}` };
  }
}

/**
 * Stream a chat completion request
 *
 * @param {Array<{role:string, content:string}>} messages
 * @param {Object} callbacks
 * @param {(chunk: string) => void} callbacks.onChunk
 * @param {(fullText: string) => void} callbacks.onDone
 * @param {(error: Error) => void} callbacks.onError
 * @param {AbortSignal} [callbacks.signal]
 */
export async function streamChat(messages, { onChunk, onDone, onError, signal }) {
  const config = readStoredConfig();
  const target = buildRequestTarget(config);

  if (target.mode === MODE_CUSTOM) {
    const missing = getRequiredCustomFields(config);
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
