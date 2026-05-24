const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const RESPONSE_HEADER_ALLOWLIST = [
  'content-type',
  'cache-control',
  'content-encoding',
  'transfer-encoding',
];

const MAX_BODY_BYTES = 128 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_PER_WINDOW = 60;
const MAX_INFLIGHT_PER_IP = 4;

const rateWindowByIp = new Map();
const inflightByIp = new Map();

class RequestBodyTooLargeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RequestBodyTooLargeError';
  }
}

function createJsonResponse(payload, status, requestId, extraHeaders = {}) {
  return new Response(JSON.stringify({ ...payload, requestId }), {
    status,
    headers: {
      ...JSON_HEADERS,
      'X-Request-Id': requestId,
      ...extraHeaders,
    },
  });
}

function createErrorResponse(status, message, requestId, code = 'proxy_error', extra = {}) {
  return createJsonResponse(
    {
      error: {
        code,
        message,
        ...extra,
      },
    },
    status,
    requestId,
  );
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getClientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function isJsonContentType(contentType) {
  return String(contentType || '').toLowerCase().includes('application/json');
}

function checkRateLimit(ip, now) {
  const bucket = rateWindowByIp.get(ip) || [];
  const recent = bucket.filter((ts) => now - ts < RATE_WINDOW_MS);
  recent.push(now);
  rateWindowByIp.set(ip, recent);
  return recent.length <= RATE_LIMIT_PER_WINDOW;
}

function acquireInflight(ip) {
  const current = inflightByIp.get(ip) || 0;
  if (current >= MAX_INFLIGHT_PER_IP) return false;
  inflightByIp.set(ip, current + 1);
  return true;
}

function releaseInflight(ip) {
  const current = inflightByIp.get(ip) || 0;
  if (current <= 1) {
    inflightByIp.delete(ip);
    return;
  }
  inflightByIp.set(ip, current - 1);
}

function buildUpstreamPayload(body, defaultModel) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: '请求体必须是 JSON 对象' };
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { ok: false, error: '`messages` 必须是非空数组' };
  }

  const model = String(body.model || '').trim() || String(defaultModel || '').trim();
  if (!model) {
    return { ok: false, error: '缺少模型名称，请在设置中填写或配置 DEFAULT_MODEL' };
  }

  const stream = body.stream !== false;
  const temperature = Number.isFinite(body.temperature) ? body.temperature : 0.7;

  return {
    ok: true,
    payload: {
      model,
      messages: body.messages,
      stream,
      temperature,
    },
  };
}

async function readBodyWithinLimit(request, maxBytes) {
  const contentLength = Number.parseInt(request.headers.get('content-length') || '', 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError(`请求体超过 ${maxBytes} 字节限制`);
  }

  if (!request.body) {
    return '';
  }

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        throw new RequestBodyTooLargeError(`请求体超过 ${maxBytes} 字节限制`);
      }
      chunks.push(value);
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}

function buildProxyHeaders(upstreamResponse, requestId) {
  const headers = new Headers();
  for (const headerName of RESPONSE_HEADER_ALLOWLIST) {
    const value = upstreamResponse.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }

  headers.set('X-Request-Id', requestId);
  headers.set('Cache-Control', 'no-store');
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'text/event-stream; charset=utf-8');
  }

  return headers;
}

function parseUpstreamErrorMessage(bodyText) {
  if (!bodyText) return '上游服务返回错误';
  try {
    const parsed = JSON.parse(bodyText);
    return parsed?.error?.message || parsed?.message || '上游服务返回错误';
  } catch {
    return bodyText.slice(0, 240);
  }
}

function getRequestId(request) {
  const cfRay = request.headers.get('cf-ray');
  if (cfRay) return `${cfRay}-${crypto.randomUUID().slice(0, 8)}`;
  return crypto.randomUUID();
}

function logRequest({ requestId, status, latencyMs, upstreamStatus }) {
  console.log(
    JSON.stringify({
      requestId,
      status,
      latencyMs,
      upstreamStatus,
    }),
  );
}

export async function onRequest(context) {
  const startAt = Date.now();
  const request = context.request;
  const requestId = getRequestId(request);
  const ip = getClientIp(request);

  let status = 500;
  let upstreamStatus = null;
  let hasInflightSlot = false;

  try {
    if (request.method !== 'POST') {
      status = 405;
      return createJsonResponse(
        {
          error: {
            code: 'method_not_allowed',
            message: 'Method Not Allowed',
            allow: 'POST',
          },
        },
        status,
        requestId,
        { Allow: 'POST' },
      );
    }

    if (!isJsonContentType(request.headers.get('content-type'))) {
      status = 415;
      return createErrorResponse(status, '仅支持 application/json 请求', requestId, 'invalid_content_type');
    }

    const now = Date.now();
    if (!checkRateLimit(ip, now)) {
      status = 429;
      return createErrorResponse(
        status,
        '请求过于频繁，请稍后再试',
        requestId,
        'rate_limited',
        { retryAfterMs: RATE_WINDOW_MS },
      );
    }

    if (!acquireInflight(ip)) {
      status = 429;
      return createErrorResponse(
        status,
        '并发请求过多，请稍后再试',
        requestId,
        'too_many_inflight',
      );
    }
    hasInflightSlot = true;

    const baseUrl = normalizeBaseUrl(context.env.UPSTREAM_BASE_URL);
    const apiKey = String(context.env.UPSTREAM_API_KEY || '').trim();
    const defaultModel = String(context.env.DEFAULT_MODEL || '').trim();

    if (!baseUrl || !apiKey) {
      status = 500;
      return createErrorResponse(
        status,
        '服务端未完成配置，请联系管理员设置 UPSTREAM_BASE_URL 与 UPSTREAM_API_KEY',
        requestId,
        'server_not_configured',
      );
    }

    const rawBody = await readBodyWithinLimit(request, MAX_BODY_BYTES);

    let parsedBody = null;
    try {
      parsedBody = JSON.parse(rawBody || '{}');
    } catch {
      status = 400;
      return createErrorResponse(status, 'JSON 格式错误', requestId, 'invalid_json');
    }

    const normalized = buildUpstreamPayload(parsedBody, defaultModel);
    if (!normalized.ok) {
      status = 400;
      return createErrorResponse(status, normalized.error, requestId, 'invalid_payload');
    }

    const upstreamResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(normalized.payload),
    });

    upstreamStatus = upstreamResponse.status;

    if (!upstreamResponse.ok) {
      const upstreamText = await upstreamResponse.text().catch(() => '');
      const upstreamMessage = parseUpstreamErrorMessage(upstreamText);
      status = upstreamResponse.status;
      return createErrorResponse(
        status,
        `上游请求失败 (${upstreamResponse.status}): ${upstreamMessage}`,
        requestId,
        'upstream_error',
        {
          upstreamStatus: upstreamResponse.status,
        },
      );
    }

    status = upstreamResponse.status;

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: buildProxyHeaders(upstreamResponse, requestId),
    });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      status = 413;
      return createErrorResponse(status, error.message, requestId, 'payload_too_large');
    }

    status = 500;
    return createErrorResponse(status, '服务暂时不可用，请稍后重试', requestId, 'internal_error');
  } finally {
    if (hasInflightSlot) {
      releaseInflight(ip);
    }

    logRequest({
      requestId,
      status,
      latencyMs: Date.now() - startAt,
      upstreamStatus,
    });
  }
}
