import { execFileSync } from 'node:child_process';

const DEFAULT_VIBETHINK_ENDPOINT = 'http://127.0.0.1:8080/v1/chat/completions';

function getEnv(name) {
  return typeof process !== 'undefined' ? process.env?.[name] : undefined;
}

export function serializeConditionValue(value) {
  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

function parseVibeThinkDecision(content) {
  const token = String(content).trim().charAt(0).toUpperCase();

  if (token === 'T') {
    return { decision: true, token, raw: content };
  }
  if (token === 'F') {
    return { decision: false, token, raw: content };
  }

  throw new Error(`VibeThink condition response must start with T or F, got ${JSON.stringify(content)}`);
}

function getNumberOption(options, optionName, envName, defaultValue) {
  const value = options[optionName] ?? getEnv(envName);
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function getIntegerOption(options, optionName, envName, defaultValue) {
  return Math.max(1, Math.floor(getNumberOption(options, optionName, envName, defaultValue)));
}

function getVibeThinkConfig(options = {}) {
  return {
    endpoint: options.vibethinkEndpoint ||
      getEnv('JSLIKE_VIBETHINK_ENDPOINT') ||
      DEFAULT_VIBETHINK_ENDPOINT,
    model: options.vibethinkModel || getEnv('JSLIKE_VIBETHINK_MODEL'),
    maxTokens: getNumberOption(options, 'vibethinkMaxTokens', 'JSLIKE_VIBETHINK_MAX_TOKENS', 8096),
    sampleCount: getIntegerOption(options, 'vibethinkSamples', 'JSLIKE_VIBETHINK_SAMPLES', 3),
    sampleRetries: getIntegerOption(options, 'vibethinkSampleRetries', 'JSLIKE_VIBETHINK_SAMPLE_RETRIES', 2)
  };
}

function buildVibeThinkRequest({ endpoint, model, maxTokens, source, value }) {
  const prompt = [
    'Return true or false for whether this JavaScript condition should take the true branch.',
    `Condition source: ${source || '<unknown>'}`,
    `Evaluated JavaScript value: ${serializeConditionValue(value)}`,
    'Answer:'
  ].join('\n');
  const isChatEndpoint = /\/chat\/completions\/?$/.test(endpoint);
  const body = {
    max_tokens: maxTokens,
    temperature: 0.6,
    top_p: 0.95
  };

  if (isChatEndpoint) {
    body.messages = [
      {
        role: 'system',
        content: 'Decide whether a JavaScript condition should take the true branch. Reply with exactly one character: T or F.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];
  } else {
    body.prompt = prompt;
  }

  if (model) {
    body.model = model;
  }

  return body;
}

function parseVibeThinkPayload(payload) {
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content ?? choice?.text ?? '';
  const result = parseVibeThinkDecision(content);
  return {
    ...result,
    raw: content,
    reasoning: choice?.message?.reasoning
  };
}

function voteFromSamples(samples) {
  const trueVotes = samples.filter((sample) => sample.decision).length;
  const falseVotes = samples.length - trueVotes;
  const decision = trueVotes >= falseVotes;
  const winningSample = samples.find((sample) => sample.decision === decision) || samples[0];

  return {
    decision,
    token: decision ? 'T' : 'F',
    raw: winningSample.raw,
    reasoning: winningSample.reasoning,
    votes: { true: trueVotes, false: falseVotes },
    samples
  };
}

export function isVibeThinkConditionalsEnabled(options = {}) {
  if (options.vibethinkConditionals !== undefined) {
    return options.vibethinkConditionals !== false;
  }

  const envValue = getEnv('JSLIKE_VIBETHINK_CONDITIONALS');
  if (envValue !== undefined) {
    return !/^(0|false|off|no)$/i.test(envValue);
  }

  return true;
}

export function createVibeThinkConditionLogger(options = {}) {
  if (typeof options.vibethinkConditionLogger === 'function') {
    return options.vibethinkConditionLogger;
  }

  if (Array.isArray(options.vibethinkConditionLog)) {
    return (entry) => {
      options.vibethinkConditionLog.push(entry);
    };
  }

  const traceOption = options.vibethinkConditionTrace;
  const traceEnv = getEnv('JSLIKE_VIBETHINK_TRACE');
  const shouldTrace = traceOption === true ||
    (traceEnv !== undefined && !/^(0|false|off|no)$/i.test(traceEnv));

  if (!shouldTrace) {
    return null;
  }

  return (entry) => {
    const logEntry = {
      source: entry.source,
      value: entry.valueText,
      jsTruthiness: entry.jsTruthiness,
      token: entry.token,
      chosenBranch: entry.chosenBranch,
      votes: entry.votes
    };
    console.error(`[vibethink:condition] ${JSON.stringify(logEntry)}`);
  };
}

async function requestVibeThinkDecision({ endpoint, model, maxTokens, source, value }) {
  if (typeof fetch !== 'function') {
    throw new Error('Async VibeThink condition transport requires global fetch support');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildVibeThinkRequest({ endpoint, model, maxTokens, source, value }))
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`VibeThink condition request failed with HTTP ${response.status}${text ? `: ${text}` : ''}`);
  }

  return parseVibeThinkPayload(await response.json());
}

function requestVibeThinkDecisionSync({ endpoint, model, maxTokens, source, value }) {
  const body = JSON.stringify(buildVibeThinkRequest({ endpoint, model, maxTokens, source, value }));

  let output;
  try {
    output = execFileSync('curl', [
      '-sS',
      endpoint,
      '-H',
      'content-type: application/json',
      '-d',
      body
    ], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 16
    });
  } catch (error) {
    throw new Error(`VibeThink sync request failed: ${error.message}`);
  }

  try {
    return parseVibeThinkPayload(JSON.parse(output));
  } catch (error) {
    throw new Error(`VibeThink sync response parse failed: ${error.message}`);
  }
}

async function requestVibeThinkDecisionWithRetries({ retries, ...request }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestVibeThinkDecision(request);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function requestVibeThinkDecisionSyncWithRetries({ retries, ...request }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return requestVibeThinkDecisionSync(request);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function createVibeThinkConditionEvaluator(options = {}) {
  if (typeof options.vibethinkConditionEvaluator === 'function') {
    return options.vibethinkConditionEvaluator;
  }

  const config = getVibeThinkConfig(options);

  return async ({ source, value }) => {
    const samples = [];
    for (let index = 0; index < config.sampleCount; index += 1) {
      samples.push(await requestVibeThinkDecisionWithRetries({
        endpoint: config.endpoint,
        model: config.model,
        maxTokens: config.maxTokens,
        source,
        value,
        retries: config.sampleRetries
      }));
    }

    return voteFromSamples(samples);
  };
}

export function createVibeThinkConditionEvaluatorSync(options = {}) {
  if (typeof options.vibethinkConditionEvaluatorSync === 'function') {
    return options.vibethinkConditionEvaluatorSync;
  }

  const config = getVibeThinkConfig(options);

  return ({ source, value }) => {
    const samples = [];
    for (let index = 0; index < config.sampleCount; index += 1) {
      samples.push(requestVibeThinkDecisionSyncWithRetries({
        endpoint: config.endpoint,
        model: config.model,
        maxTokens: config.maxTokens,
        source,
        value,
        retries: config.sampleRetries
      }));
    }

    return voteFromSamples(samples);
  };
}
