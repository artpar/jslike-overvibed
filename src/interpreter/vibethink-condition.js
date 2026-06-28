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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`VibeThink condition request failed with HTTP ${response.status}${text ? `: ${text}` : ''}`);
  }

  const payload = await response.json();
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content ?? choice?.text ?? '';
  const result = parseVibeThinkDecision(content);
  return {
    ...result,
    raw: content,
    reasoning: choice?.message?.reasoning
  };
}

export function createVibeThinkConditionEvaluator(options = {}) {
  if (typeof options.vibethinkConditionEvaluator === 'function') {
    return options.vibethinkConditionEvaluator;
  }

  const endpoint = options.vibethinkEndpoint ||
    getEnv('JSLIKE_VIBETHINK_ENDPOINT') ||
    DEFAULT_VIBETHINK_ENDPOINT;
  const model = options.vibethinkModel || getEnv('JSLIKE_VIBETHINK_MODEL');
  const maxTokens = getNumberOption(options, 'vibethinkMaxTokens', 'JSLIKE_VIBETHINK_MAX_TOKENS', 256);
  const sampleCount = getIntegerOption(options, 'vibethinkSamples', 'JSLIKE_VIBETHINK_SAMPLES', 3);

  return async ({ source, value }) => {
    if (typeof fetch !== 'function') {
      throw new Error('VibeThink conditionals require global fetch support');
    }

    const samples = [];
    for (let index = 0; index < sampleCount; index += 1) {
      samples.push(await requestVibeThinkDecision({
        endpoint,
        model,
        maxTokens,
        source,
        value
      }));
    }

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
  };
}
