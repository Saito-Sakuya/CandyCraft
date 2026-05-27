export const AI_CONTRACTS = {
  analysis: {
    schemaVersion: 'cc.analysis.v1',
    orderedFields: [
      'schemaVersion',
      'orderedFields',
      'dimensions',
      'elements',
      'presets',
      'sceneRecommendation',
      'compositionRecommendation',
    ],
  },
  presetsRefresh: {
    schemaVersion: 'cc.presets_refresh.v1',
    orderedFields: ['schemaVersion', 'orderedFields', 'presets'],
  },
  dimensionsRefresh: {
    schemaVersion: 'cc.dimensions_refresh.v1',
    orderedFields: ['schemaVersion', 'orderedFields', 'dimensions'],
  },
  dimensionReplace: {
    schemaVersion: 'cc.dimension_replace.v1',
    orderedFields: ['schemaVersion', 'orderedFields', 'dimension'],
  },
  lighting: {
    schemaVersion: 'cc.lighting.v2',
    orderedFields: ['schemaVersion', 'orderedFields', 'lights', 'reason'],
  },
  optimize: {
    schemaVersion: 'cc.optimize.v1',
    orderedFields: [
      'schemaVersion',
      'orderedFields',
      'blocks',
      'finalPrompt',
      'checks',
    ],
    blockOrder: [
      'subject',
      'composition',
      'foreground',
      'background',
      'camera',
      'lighting',
      'style',
      'exactText',
      'negativeConstraints',
      'renderConstraints',
    ],
  },
};

export const CONTRACT_ERROR_CODES = {
  parseError: 'parse_error',
  schemaError: 'schema_error',
  semanticConflict: 'semantic_conflict',
  upstreamError: 'upstream_error',
  fallbackApplied: 'fallback_applied',
};

export function makeContractMeta({
  step,
  schemaVersion = '',
  contractValid = false,
  contractErrors = [],
  semanticConflicts = [],
  retryUsed = false,
  fallbackUsed = false,
  finalSource = 'first-pass',
} = {}) {
  return {
    step,
    schemaVersion,
    contractValid: Boolean(contractValid),
    contractErrors: Array.isArray(contractErrors) ? contractErrors : [],
    semanticConflicts: Array.isArray(semanticConflicts) ? semanticConflicts : [],
    retryUsed: Boolean(retryUsed),
    fallbackUsed: Boolean(fallbackUsed),
    conflictCount: Array.isArray(semanticConflicts) ? semanticConflicts.length : 0,
    finalSource,
  };
}

export function tryParseJsonWithExtractors(text, { allowLooseObject = false, allowLooseArray = false } = {}) {
  if (typeof text !== 'string') return null;
  const cleaned = text.trim();
  if (!cleaned) return null;

  const extractors = [
    (t) => JSON.parse(t),
    (t) => {
      const m = t.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      return m ? JSON.parse(m[1].trim()) : null;
    },
  ];

  if (allowLooseObject) {
    extractors.push((t) => {
      const fi = t.indexOf('{');
      const li = t.lastIndexOf('}');
      return (fi !== -1 && li > fi) ? JSON.parse(t.substring(fi, li + 1)) : null;
    });
  }
  if (allowLooseArray) {
    extractors.push((t) => {
      const fi = t.indexOf('[');
      const li = t.lastIndexOf(']');
      return (fi !== -1 && li > fi) ? JSON.parse(t.substring(fi, li + 1)) : null;
    });
  }

  for (const extractor of extractors) {
    try {
      const result = extractor(cleaned);
      if (result) return result;
    } catch {
      // Continue to the next extractor.
    }
  }
  return null;
}

export function validateContractEnvelope(parsed, contract, { allowExtraFields = true } = {}) {
  const errors = [];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return ['schema_error:not_object'];
  }
  if (parsed.schemaVersion !== contract.schemaVersion) {
    errors.push(`schema_error:schemaVersion:${parsed.schemaVersion || 'missing'}`);
  }
  if (!Array.isArray(parsed.orderedFields)) {
    errors.push('schema_error:orderedFields_missing');
  } else if (!arrayEquals(parsed.orderedFields, contract.orderedFields)) {
    errors.push('schema_error:orderedFields_mismatch');
  }

  const keys = Object.keys(parsed);
  const prefix = keys.slice(0, contract.orderedFields.length);
  if (!arrayEquals(prefix, contract.orderedFields)) {
    errors.push('schema_error:top_level_order_mismatch');
  }
  if (!allowExtraFields && keys.length !== contract.orderedFields.length) {
    errors.push('schema_error:extra_fields');
  }
  return errors;
}

export function createRoleContractStatus(status = 'skipped', detail = '', contractMeta = null) {
  const errors = contractMeta?.contractErrors || [];
  const conflicts = contractMeta?.semanticConflicts || [];
  return {
    status,
    detail,
    contractValid: contractMeta ? Boolean(contractMeta.contractValid) : status === 'skipped',
    contractErrors: Array.isArray(errors) ? errors : [],
    semanticConflicts: Array.isArray(conflicts) ? conflicts : [],
  };
}

export function makeInvalidContractMeta(step, schemaVersion, errors, finalSource = 'first-pass') {
  return makeContractMeta({
    step,
    schemaVersion,
    contractValid: false,
    contractErrors: errors,
    finalSource,
  });
}

export function auditPromptSemantics({ prompt = '', composition = null, scene = null, exactTexts = [], negativePrompts = [] } = {}) {
  const conflicts = [];
  const text = String(prompt || '');
  const zones = splitPromptConstraintZones(text);
  const lower = zones.positive.toLowerCase();
  const compositionIssues = auditCompositionPrompt(text, composition);
  conflicts.push(...compositionIssues);

  if (/\b(night|nighttime)\b/.test(lower) && /\b(sunrise|golden hour|midday|noon)\b/.test(lower)) {
    conflicts.push({
      code: 'time_conflict',
      severity: 'medium',
      message: 'Prompt mixes night with sunrise/golden hour/midday.',
    });
  }
  if (lower.includes('cool blue') && /\b(warm golden|amber tones)\b/.test(lower)) {
    const allowsMixedPracticalLights = scene?.timeOfDay && ['夜晚', '蓝调'].includes(scene.timeOfDay);
    if (!allowsMixedPracticalLights) {
      conflicts.push({
        code: 'color_temp_conflict',
        severity: 'medium',
        message: 'Prompt mixes cool blue and warm golden/amber as primary color temperature.',
      });
    }
  }
  if (/\b(photorealistic|raw photo|dslr)\b/.test(lower) && /\b(cel shading|anime screencap|flat color)\b/.test(lower)) {
    conflicts.push({
      code: 'style_term_conflict',
      severity: 'medium',
      message: 'Prompt mixes strict photorealistic terms with strict anime/cel terms.',
    });
  }
  conflicts.push(...auditStyleDensity(zones));
  conflicts.push(...auditLightingConsistency(zones));
  conflicts.push(...auditSnapshotRealism(zones));
  conflicts.push(...auditMultiCharacterBalance(zones));

  for (const rawText of exactTexts || []) {
    const exact = String(rawText || '').trim();
    if (!exact) continue;
    if (!text.includes(`"${exact.replace(/"/g, '\\"')}"`) && !text.includes(`"${exact}"`)) {
      conflicts.push({
        code: 'exact_text_missing',
        severity: 'high',
        message: `Exact text block missing from final prompt: ${exact.slice(0, 40)}`,
      });
    }
  }
  conflicts.push(...auditNegativePromptSemantics(zones, negativePrompts));
  return conflicts;
}

function auditStyleDensity(zones) {
  const conflicts = [];
  const lower = zones.positive.toLowerCase();
  const families = [
    { key: 'snapshot', re: /\b(selfie|phone snapshot|smartphone|candid snapshot|casual photo)\b/ },
    { key: 'anime', re: /\b(anime|manga|cel shading|lineart|anime screencap)\b/ },
    { key: 'photo', re: /\b(photorealistic|hyperrealistic|raw photo|dslr|photo-accurate|documentary photo)\b/ },
    { key: 'cinematic', re: /\b(cinematic|studio lighting|volumetric lighting|film look|film grain)\b/ },
    { key: 'cg', re: /\b(cg render|ray tracing|octane render|physically based rendering|global illumination)\b/ },
    { key: 'illustration', re: /\b(stylized illustration|digital painting|painterly|concept art)\b/ },
  ].filter((family) => family.re.test(lower)).map((family) => family.key);

  if (families.length >= 4) {
    conflicts.push({
      code: 'style_density_overload',
      severity: 'medium',
      message: `Prompt activates too many visual style families (${families.join(', ')}).`,
    });
  }
  if (families.includes('snapshot') && /\b(masterpiece|studio lighting|cinematic masterpiece|epic cinematic)\b/.test(lower)) {
    conflicts.push({
      code: 'snapshot_overpolished',
      severity: 'medium',
      message: 'Phone snapshot/candid intent is diluted by polished studio or masterpiece wording.',
    });
  }
  return conflicts;
}

function auditLightingConsistency(zones) {
  const conflicts = [];
  const lower = zones.positive.toLowerCase();
  const harshLight = /\b(harsh|hard|crisp|midday|noon|direct sunlight|strong sunlight)\b/.test(lower);
  const diffusedShadow = /\b(diffused shadows|soft diffused shadows|fully diffused shadows|soft shadows)\b/.test(lower);
  const acceptableSoftening = /\b(slightly softened shadows|gentle bounce lighting|softened by bounce|bounce light)\b/.test(lower);
  if (harshLight && diffusedShadow && !acceptableSoftening) {
    conflicts.push({
      code: 'harsh_diffused_lighting_conflict',
      severity: 'medium',
      message: 'Prompt mixes harsh/direct light with diffused/soft shadows without a bounce-light explanation.',
    });
  }
  return conflicts;
}

function auditSnapshotRealism(zones) {
  const conflicts = [];
  const lower = zones.positive.toLowerCase();
  if (!/\b(selfie|phone snapshot|smartphone|candid snapshot|casual photo)\b/.test(lower)) return conflicts;
  const realismHints = [
    /\boff-?center\b/,
    /\btilted framing\b/,
    /\bsmartphone hdr\b/,
    /\bslight overexposure\b/,
    /\bimperfect\b/,
    /\bcandid timing\b/,
    /\bnatural facial asymmetry\b/,
  ];
  const hintCount = realismHints.filter((re) => re.test(lower)).length;
  if (hintCount < 2) {
    conflicts.push({
      code: 'snapshot_realism_under_specified',
      severity: 'low',
      message: 'Phone snapshot/candid prompt lacks enough imperfect smartphone realism cues.',
    });
  }
  return conflicts;
}

function auditMultiCharacterBalance(zones) {
  const conflicts = [];
  const text = zones.positive;
  const lower = text.toLowerCase();
  const multiMarker = /\b(three|3)\s+(characters|people|girls|boys|subjects)\b|三人|三位|三个/.test(lower);
  if (!multiMarker) return conflicts;
  const relationHints = [
    /\b(all three|each|together|beside|behind|leans|peeks|stands|sits|foreground|middle ground|background)\b/,
    /前景|中景|后景|旁边|身后|探入|站在|坐在|互动|关系/,
  ];
  if (!relationHints.some((re) => re.test(text))) {
    conflicts.push({
      code: 'multi_character_balance_missing',
      severity: 'low',
      message: 'Three-character scene lacks explicit placement or action balance for all subjects.',
    });
  }
  return conflicts;
}

export function auditNegativePromptSemantics(zones, negativePrompts = []) {
  const conflicts = [];
  const entries = normalizeNegativePromptEntries(negativePrompts);
  if (entries.length === 0) return conflicts;

  const positiveLower = zones.positive.toLowerCase();
  const negativeLower = zones.negative.toLowerCase();
  const hasNegativeSection = /\b(avoid|negative constraints|negative prompt|exclude|without)\b/i.test(zones.negative);

  if (!hasNegativeSection) {
    conflicts.push({
      code: 'negative_section_missing',
      severity: 'high',
      message: 'Negative constraints are present in context but missing from an Avoid/Negative constraints section.',
    });
  }

  for (const entry of entries) {
    const normalizedText = normalizeSemanticText(entry.text);
    if (!normalizedText) continue;
    if (!semanticContains(negativeLower, normalizedText)) {
      conflicts.push({
        code: 'negative_constraint_missing',
        severity: 'high',
        message: `Negative constraint missing from Avoid section: ${entry.text.slice(0, 60)}`,
      });
    }
    if (semanticContains(positiveLower, normalizedText)) {
      conflicts.push({
        code: 'negative_constraint_in_positive',
        severity: 'high',
        message: `Negative constraint appears in positive description: ${entry.text.slice(0, 60)}`,
      });
    }
  }

  const negativeJoined = entries.map((item) => normalizeSemanticText(item.text)).join(' ');
  if (/\b(anime|manga|cel shading|lineart|cartoon)\b/.test(negativeJoined)
    && /\b(anime|manga|cel shading|anime screencap|flat color|clean lineart)\b/.test(positiveLower)) {
    conflicts.push({
      code: 'negative_style_anime_conflict',
      severity: 'high',
      message: 'Negative constraints ask to avoid anime/cel style while positive prompt still uses strong anime terms.',
    });
  }
  if (/\b(photo ?realistic|photorealistic|hyperrealistic|realistic|dslr|raw photo)\b/.test(negativeJoined)
    && /\b(photorealistic|hyperrealistic|raw photo|dslr|photo-accurate)\b/.test(positiveLower)) {
    conflicts.push({
      code: 'negative_style_realism_conflict',
      severity: 'high',
      message: 'Negative constraints ask to avoid photorealism while positive prompt still uses strong photo-real terms.',
    });
  }
  if (/\b(no|avoid|without|exclude)\b.*\b(background people|people in the background|crowd|pedestrians|bystanders)\b/.test(negativeJoined)
    && /\b(background people|people in the background|crowd|pedestrians|bystanders)\b/.test(positiveLower)) {
    conflicts.push({
      code: 'negative_background_people_conflict',
      severity: 'high',
      message: 'Negative constraints ask for no background people while positive prompt still describes background people.',
    });
  }

  return conflicts;
}

function splitPromptConstraintZones(prompt) {
  const text = String(prompt || '');
  const marker = text.search(/\b(Avoid|Negative constraints|Negative prompt|Exclude|Without)\s*:/i);
  if (marker < 0) {
    return { positive: text, negative: '' };
  }
  return {
    positive: text.slice(0, marker),
    negative: text.slice(marker),
  };
}

function normalizeNegativePromptEntries(rawEntries) {
  return (Array.isArray(rawEntries) ? rawEntries : [])
    .map((entry) => {
      if (typeof entry === 'string') return { text: entry };
      if (!entry || typeof entry !== 'object') return null;
      return { ...entry, text: String(entry.text || '') };
    })
    .filter((entry) => entry && entry.text.trim());
}

function semanticContains(haystack, needle) {
  const hay = normalizeSemanticText(haystack);
  const ndl = normalizeSemanticText(needle);
  if (!ndl) return true;
  if (hay.includes(ndl)) return true;
  const tokens = ndl.split(/\s+/).filter((token) => token.length > 2 && !['avoid', 'without', 'exclude', 'only'].includes(token));
  if (tokens.length === 0) return false;
  const hits = tokens.filter((token) => hay.includes(token)).length;
  return hits / tokens.length >= 0.75;
}

function normalizeSemanticText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/[，。；、：:;,.!?()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function auditCompositionPrompt(prompt, composition) {
  const conflicts = [];
  if (!composition || typeof composition !== 'object') return conflicts;
  const ratio = String(composition.ratio || '').trim();
  const orientation = String(composition.orientation || '').trim();
  const width = Number.parseInt(composition.width, 10);
  const height = Number.parseInt(composition.height, 10);
  const arMatches = String(prompt || '').match(/--ar\s+([0-9]+:[0-9]+)/g) || [];

  if (arMatches.length > 1) {
    conflicts.push({
      code: 'duplicate_ar',
      severity: 'high',
      message: `Prompt contains multiple --ar parameters (${arMatches.length}).`,
    });
  }
  if (ratio && arMatches.length === 1) {
    const arRatio = arMatches[0].replace('--ar', '').trim();
    if (arRatio !== ratio) {
      conflicts.push({
        code: 'ar_ratio_mismatch',
        severity: 'high',
        message: `--ar ${arRatio} does not match composition ratio ${ratio}.`,
      });
    }
  }

  const ratioParts = parseRatio(ratio);
  if (ratioParts) {
    const expectedOrientation = ratioParts.w === ratioParts.h
      ? 'square'
      : ratioParts.w > ratioParts.h ? 'landscape' : 'portrait';
    if (orientation && orientation !== expectedOrientation) {
      conflicts.push({
        code: 'orientation_ratio_conflict',
        severity: 'high',
        message: `Orientation ${orientation} conflicts with ratio ${ratio}.`,
      });
    }
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      const drift = Math.abs(width * ratioParts.h - height * ratioParts.w);
      const tolerance = Math.max(2, Math.round((width * ratioParts.h + height * ratioParts.w) * 0.003));
      if (drift > tolerance) {
        conflicts.push({
          code: 'ratio_size_conflict',
          severity: 'high',
          message: `Ratio ${ratio} conflicts with final size ${width}x${height}.`,
        });
      }
    }
  }
  return conflicts;
}

export function parseRatio(ratio) {
  const m = String(ratio || '').match(/^(\d+):(\d+)$/);
  if (!m) return null;
  const w = Number.parseInt(m[1], 10);
  const h = Number.parseInt(m[2], 10);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return null;
  return { w, h };
}

function arrayEquals(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
