import {
  parseAnalysisResponse,
  parseLightingRecommendationEnvelope,
  parseOptimizeResponse,
} from '../../js/prompt.js';
import {
  createRoleContractStatus,
  makeInvalidContractMeta,
} from '../../js/ai-contract.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const ROLE_KEYS = ['structure', 'lighting', 'normalize'];
const ROLE_ENV_PREFIX = {
  structure: 'STRUCTURE',
  lighting: 'LIGHTING',
  normalize: 'NORMALIZE',
};

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

function createErrorResponse(status, message, requestId, code = 'orchestrate_error', extra = {}) {
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

function readEnvText(env, key) {
  return String(env?.[key] || '').trim();
}

function getMissingConfigFields(config) {
  const missing = [];
  if (!config.baseUrl) missing.push('BASE_URL');
  if (!config.apiKey) missing.push('API_KEY');
  if (!config.model) missing.push('MODEL');
  return missing;
}

function readGlobalRoleFallback(env) {
  const config = {
    baseUrl: normalizeBaseUrl(env?.UPSTREAM_BASE_URL),
    apiKey: readEnvText(env, 'UPSTREAM_API_KEY'),
    model: readEnvText(env, 'DEFAULT_MODEL'),
    source: 'global',
  };
  return {
    ...config,
    complete: getMissingConfigFields(config).length === 0,
  };
}

function readRoleEnvOverride(env, role) {
  const prefix = ROLE_ENV_PREFIX[role];
  const config = {
    baseUrl: normalizeBaseUrl(env?.[`${prefix}_BASE_URL`]),
    apiKey: readEnvText(env, `${prefix}_API_KEY`),
    model: readEnvText(env, `${prefix}_MODEL`),
    source: 'role',
  };
  const missing = getMissingConfigFields(config);
  return {
    ...config,
    complete: missing.length === 0,
    hasAny: missing.length < 3,
    missing,
  };
}

function resolveRoleConfig(env, role) {
  const fallback = readGlobalRoleFallback(env);
  const override = readRoleEnvOverride(env, role);
  if (override.complete) return override;
  if (fallback.complete) {
    return {
      ...fallback,
      source: override.hasAny ? 'global_fallback_incomplete_role' : 'global',
      ignoredRoleMissing: override.hasAny ? override.missing : [],
    };
  }

  return {
    ...override,
    complete: false,
    source: override.hasAny ? 'incomplete_role' : 'missing',
    missing: override.hasAny
      ? override.missing.map((field) => `${ROLE_ENV_PREFIX[role]}_${field}`)
      : ['UPSTREAM_BASE_URL', 'UPSTREAM_API_KEY', 'DEFAULT_MODEL'],
  };
}

function resolveRequestedRoleConfigs(env, requestedRoles) {
  const configs = {};
  const errors = [];
  for (const role of requestedRoles) {
    const config = resolveRoleConfig(env, role);
    configs[role] = config;
    if (!config.complete) {
      errors.push(`${role}: ${config.missing.join(' / ')}`);
    }
  }
  return { configs, errors };
}

function toPublicRoleConfigSources(configs) {
  const out = {};
  for (const role of ROLE_KEYS) {
    if (configs[role]) out[role] = configs[role].source;
  }
  return out;
}

function getRequestId(request) {
  const cfRay = request.headers.get('cf-ray');
  if (cfRay) return `${cfRay}-${crypto.randomUUID().slice(0, 8)}`;
  return crypto.randomUUID();
}

function getErrorMessage(text, fallback) {
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return parsed?.error?.message || parsed?.message || fallback;
  } catch {
    return text || fallback;
  }
}

function validateMessages(messages) {
  return Array.isArray(messages) && messages.length > 0;
}

async function callUpstreamChat(baseUrl, apiKey, model, messages) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(getErrorMessage(text, `上游请求失败 (${response.status})`));
  }

  const json = await response.json();
  return json?.choices?.[0]?.message?.content || '';
}

async function callRoleWithFallback({
  baseUrl,
  apiKey,
  model,
  primaryMessages,
  retryMessages = null,
}) {
  let firstError = null;
  try {
    const content = await callUpstreamChat(baseUrl, apiKey, model, primaryMessages);
    return {
      content,
      retryUsed: false,
      fallbackUsed: false,
      source: 'first-pass',
      error: '',
    };
  } catch (error) {
    firstError = error;
  }

  const replayMessages = validateMessages(retryMessages) ? retryMessages : primaryMessages;
  try {
    const content = await callUpstreamChat(baseUrl, apiKey, model, replayMessages);
    return {
      content,
      retryUsed: true,
      fallbackUsed: true,
      source: validateMessages(retryMessages) ? 'retry' : 'fallback',
      error: firstError?.message || '',
    };
  } catch (secondError) {
    return {
      content: '',
      retryUsed: true,
      fallbackUsed: true,
      source: 'failed',
      error: secondError?.message || firstError?.message || 'unknown_error',
    };
  }
}

function ensureContractMeta(meta, step, schemaVersion) {
  if (meta && typeof meta === 'object') return meta;
  return makeInvalidContractMeta(step, schemaVersion, ['schema_error:missing_contract_meta']);
}

function buildStructureContractMeta(text) {
  const parsed = parseAnalysisResponse(text);
  if (!parsed) {
    return makeInvalidContractMeta('analysis', 'cc.analysis.v1', ['schema_error:invalid_analysis_contract']);
  }
  return ensureContractMeta(parsed.__contract, 'analysis', 'cc.analysis.v1');
}

function buildLightingContractMeta(text) {
  const envelope = parseLightingRecommendationEnvelope(text);
  const meta = ensureContractMeta(envelope?.contractMeta, 'lighting', 'cc.lighting.v2');
  if (!envelope?.recommendation) {
    const nextErrors = [...(meta.contractErrors || []), 'schema_error:invalid_lighting_recommendation'];
    return {
      ...meta,
      contractValid: false,
      contractErrors: nextErrors,
    };
  }
  return meta;
}

function buildNormalizeContractMeta(text, context = {}) {
  const parsed = parseOptimizeResponse(text, {
    composition: context?.composition || null,
    scene: context?.scene || null,
    exactTexts: Array.isArray(context?.exactTexts) ? context.exactTexts : [],
    negativePrompts: Array.isArray(context?.negativePrompts) ? context.negativePrompts : [],
  });
  if (!parsed) {
    return {
      meta: makeInvalidContractMeta('optimize', 'cc.optimize.v1', ['schema_error:invalid_optimize_contract']),
      parsed: null,
    };
  }
  return {
    meta: ensureContractMeta(parsed.contractMeta, 'optimize', 'cc.optimize.v1'),
    parsed,
  };
}

export async function onRequest(context) {
  const request = context.request;
  const requestId = getRequestId(request);
  const startedAt = Date.now();

  let status = 500;
  let fallbackUsed = false;
  const roleStatus = {
    structure: createRoleContractStatus(),
    lighting: createRoleContractStatus(),
    normalize: createRoleContractStatus(),
  };

  try {
    if (request.method !== 'POST') {
      status = 405;
      return createErrorResponse(status, 'Method Not Allowed', requestId, 'method_not_allowed');
    }

    const contentType = String(request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      status = 415;
      return createErrorResponse(status, '仅支持 application/json 请求', requestId, 'invalid_content_type');
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      status = 400;
      return createErrorResponse(status, 'JSON 格式错误', requestId, 'invalid_json');
    }

    const structureMessages = body?.roles?.structure?.messages;
    const lightingMessages = body?.roles?.lighting?.messages;
    const lightingRetryMessages = body?.roles?.lighting?.retryMessages;
    const normalizeMessages = body?.roles?.normalize?.messages;
    const normalizeContext = body?.roles?.normalize?.context || {};

    const hasStructure = validateMessages(structureMessages);
    const hasLighting = validateMessages(lightingMessages);
    const hasNormalize = validateMessages(normalizeMessages);
    if (!hasStructure && !hasNormalize) {
      status = 400;
      return createErrorResponse(status, 'roles.structure.messages 或 roles.normalize.messages 至少提供一个', requestId, 'invalid_payload');
    }

    const requestedRoles = [];
    if (hasStructure) requestedRoles.push('structure');
    if (hasLighting) requestedRoles.push('lighting');
    if (hasNormalize) requestedRoles.push('normalize');

    const { configs: roleConfigs, errors: roleConfigErrors } = resolveRequestedRoleConfigs(context.env, requestedRoles);
    if (roleConfigErrors.length > 0) {
      status = 500;
      return createErrorResponse(
        status,
        `服务端未完成角色配置，请设置全局 UPSTREAM_BASE_URL / UPSTREAM_API_KEY / DEFAULT_MODEL，或补齐角色配置：${roleConfigErrors.join('; ')}`,
        requestId,
        'server_not_configured',
        { roleConfigErrors },
      );
    }

    let structureText = '';
    let lightingText = '';
    let lightingRetryText = '';
    let normalizeText = '';
    let normalizeParsed = null;

    if (hasStructure) {
      const structureConfig = roleConfigs.structure;
      const structureRun = await callRoleWithFallback({
        baseUrl: structureConfig.baseUrl,
        apiKey: structureConfig.apiKey,
        model: structureConfig.model,
        primaryMessages: structureMessages,
      });
      fallbackUsed = fallbackUsed || structureRun.fallbackUsed;
      if (!structureRun.content) {
        roleStatus.structure = createRoleContractStatus(
          'failed',
          structureRun.error || 'structure_failed',
          makeInvalidContractMeta('analysis', 'cc.analysis.v1', ['upstream_error:structure_failed']),
        );
      } else {
        structureText = structureRun.content;
        const structureMeta = buildStructureContractMeta(structureText);
        roleStatus.structure = createRoleContractStatus(
          'ok',
          structureRun.source,
          {
            ...structureMeta,
            retryUsed: structureRun.retryUsed,
            fallbackUsed: structureRun.fallbackUsed,
            finalSource: structureRun.source,
          },
        );
      }
    }

    if (hasLighting) {
      const lightingConfig = roleConfigs.lighting;
      const lightingRun = await callRoleWithFallback({
        baseUrl: lightingConfig.baseUrl,
        apiKey: lightingConfig.apiKey,
        model: lightingConfig.model,
        primaryMessages: lightingMessages,
      });
      fallbackUsed = fallbackUsed || lightingRun.fallbackUsed;
      if (lightingRun.content) {
        lightingText = lightingRun.content;
      }

      let finalLightingSource = lightingRun.source;
      let lightingMeta = buildLightingContractMeta(lightingText);
      const needsRetry = !lightingMeta.contractValid || !lightingText;

      if (needsRetry && validateMessages(lightingRetryMessages)) {
        const retryRun = await callRoleWithFallback({
          baseUrl: lightingConfig.baseUrl,
          apiKey: lightingConfig.apiKey,
          model: lightingConfig.model,
          primaryMessages: lightingRetryMessages,
        });
        fallbackUsed = fallbackUsed || retryRun.fallbackUsed;
        if (retryRun.content) {
          lightingRetryText = retryRun.content;
          lightingMeta = buildLightingContractMeta(lightingRetryText);
          finalLightingSource = retryRun.source === 'first-pass' ? 'retry' : retryRun.source;
          if (lightingMeta.contractValid) {
            lightingText = lightingRetryText;
          }
        }
      }

      roleStatus.lighting = createRoleContractStatus(
        lightingMeta.contractValid ? 'ok' : 'failed',
        finalLightingSource,
        {
          ...lightingMeta,
          retryUsed: finalLightingSource === 'retry' || finalLightingSource === 'fallback',
          fallbackUsed: finalLightingSource !== 'first-pass',
          finalSource: finalLightingSource,
        },
      );
    }

    if (hasNormalize) {
      const normalizeConfig = roleConfigs.normalize;
      const normalizeRun = await callRoleWithFallback({
        baseUrl: normalizeConfig.baseUrl,
        apiKey: normalizeConfig.apiKey,
        model: normalizeConfig.model,
        primaryMessages: normalizeMessages,
      });
      fallbackUsed = fallbackUsed || normalizeRun.fallbackUsed;
      if (normalizeRun.content) {
        normalizeText = normalizeRun.content;
        const parsedResult = buildNormalizeContractMeta(normalizeText, normalizeContext);
        normalizeParsed = parsedResult.parsed;
        roleStatus.normalize = createRoleContractStatus(
          parsedResult.meta.contractValid ? 'ok' : 'failed',
          normalizeRun.source,
          {
            ...parsedResult.meta,
            retryUsed: normalizeRun.retryUsed,
            fallbackUsed: normalizeRun.fallbackUsed || !parsedResult.meta.contractValid,
            finalSource: normalizeRun.source,
          },
        );
      } else {
        roleStatus.normalize = createRoleContractStatus(
          'failed',
          normalizeRun.error || 'normalize_failed',
          makeInvalidContractMeta('optimize', 'cc.optimize.v1', ['upstream_error:normalize_failed']),
        );
      }
    } else {
      roleStatus.normalize = createRoleContractStatus('skipped', 'not_requested');
    }

    status = 200;
    const latencyMs = Date.now() - startedAt;
    console.log(JSON.stringify({ requestId, status, latencyMs, endpoint: 'analyze-orchestrate', fallbackUsed }));
    return createJsonResponse(
      {
        orchestration: {
          path: ['structure', 'lighting', 'normalize'],
          roleStatus,
          roleConfigSource: toPublicRoleConfigSources(roleConfigs),
          fallbackUsed,
        },
        outputs: {
          structure: { content: structureText },
          lighting: { content: lightingText },
          lightingRetry: {
            used: Boolean(lightingRetryText),
            content: lightingRetryText,
          },
          normalize: {
            content: normalizeText,
            contract: normalizeParsed
              ? {
                  finalPrompt: normalizeParsed.finalPrompt,
                  blocks: normalizeParsed.blocks,
                  checks: normalizeParsed.checks,
                }
              : null,
          },
        },
      },
      status,
      requestId,
    );
  } catch (error) {
    status = 500;
    const latencyMs = Date.now() - startedAt;
    console.log(JSON.stringify({ requestId, status, latencyMs, endpoint: 'analyze-orchestrate', error: error?.message || String(error) }));
    return createErrorResponse(status, '编排服务暂时不可用，请稍后重试', requestId, 'internal_error');
  }
}
