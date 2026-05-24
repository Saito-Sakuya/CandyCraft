/**
 * api.js — AI API communication layer
 * Streaming chat completions via OpenAI-compatible API
 */

import { showToast } from './utils.js';

const STORAGE_KEYS = {
  baseUrl: 'pc_api_base_url',
  apiKey: 'pc_api_key',
  model: 'pc_model',
};

const DEFAULTS = {
  baseUrl: '',
  apiKey: '',
  model: 'gpt-4o',
};

/**
 * Read API configuration from localStorage
 */
export function getApiConfig() {
  return {
    baseUrl: localStorage.getItem(STORAGE_KEYS.baseUrl) || DEFAULTS.baseUrl,
    apiKey: localStorage.getItem(STORAGE_KEYS.apiKey) || DEFAULTS.apiKey,
    model: localStorage.getItem(STORAGE_KEYS.model) || DEFAULTS.model,
  };
}

/**
 * Save API configuration to localStorage
 */
export function setApiConfig({ baseUrl, apiKey, model }) {
  if (baseUrl !== undefined) localStorage.setItem(STORAGE_KEYS.baseUrl, baseUrl.replace(/\/+$/, ''));
  if (apiKey !== undefined) localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
  if (model !== undefined) localStorage.setItem(STORAGE_KEYS.model, model);
}

/**
 * Test API connection with a simple request
 * @returns {{ success: boolean, message: string }}
 */
export async function testConnection() {
  const { baseUrl, apiKey, model } = getApiConfig();
  if (!baseUrl || !apiKey) {
    return { success: false, message: '请先填写 API 地址和 Key' };
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { success: false, message: `HTTP ${res.status}: ${errBody.slice(0, 120)}` };
    }

    return { success: true, message: '连接成功' };
  } catch (err) {
    return { success: false, message: `连接失败: ${err.message}` };
  }
}

/**
 * Stream a chat completion request
 *
 * @param {Array<{role:string, content:string}>} messages
 * @param {Object} callbacks
 * @param {(chunk: string) => void} callbacks.onChunk — called with each content fragment
 * @param {(fullText: string) => void} callbacks.onDone — called when stream finishes
 * @param {(error: Error) => void} callbacks.onError — called on error
 * @param {AbortSignal} [callbacks.signal] — optional abort signal
 */
export async function streamChat(messages, { onChunk, onDone, onError, signal }) {
  const { baseUrl, apiKey, model } = getApiConfig();

  if (!baseUrl || !apiKey) {
    const err = new Error('请先在设置中配置 API 地址和 Key');
    onError?.(err);
    throw err;
  }

  let fullText = '';

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.7,
      }),
      signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`API 请求失败 (${response.status}): ${errBody.slice(0, 200)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // Keep the last potentially incomplete line in the buffer
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
          // Skip malformed JSON chunks — they happen at boundaries
        }
      }
    }

    // Process any remaining buffer
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
          } catch { /* ignore */ }
        }
      }
    }

    onDone?.(fullText);
  } catch (err) {
    if (err.name === 'AbortError') {
      // User cancelled — still call onDone with whatever we collected
      onDone?.(fullText);
      return;
    }
    onError?.(err);
    throw err;
  }
}
