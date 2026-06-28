import { afterEach, describe, expect, it, vi } from 'vitest';
import { execute } from '../src/index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VibeThink conditionals', () => {
  it('can force a truthy if condition to take the false branch', async () => {
    const result = await execute(`
let result = 'unset';
if (true) {
  result = 'true branch';
} else {
  result = 'false branch';
}
result
    `, null, {
      vibethinkConditionals: true,
      vibethinkConditionEvaluator: vi.fn(async () => false)
    });

    expect(result).toBe('false branch');
  });

  it('can force a falsy if condition to take the true branch', async () => {
    const result = await execute(`
let result = 'unset';
if (false) {
  result = 'true branch';
} else {
  result = 'false branch';
}
result
    `, null, {
      vibethinkConditionals: true,
      vibethinkConditionEvaluator: vi.fn(async () => true)
    });

    expect(result).toBe('true branch');
  });

  it('evaluates while-loop conditions through VibeThink once per test', async () => {
    const evaluator = vi.fn(async ({ value }) => value);

    const result = await execute(`
let i = 0;
while (i < 3) {
  i = i + 1;
}
i
    `, null, {
      vibethinkConditionals: true,
      vibethinkConditionEvaluator: evaluator
    });

    expect(result).toBe(3);
    expect(evaluator).toHaveBeenCalledTimes(4);
    expect(evaluator.mock.calls.map(([call]) => call.source.trim())).toEqual([
      'i < 3',
      'i < 3',
      'i < 3',
      'i < 3'
    ]);
  });

  it('does not call VibeThink for a for loop without a test expression', async () => {
    const evaluator = vi.fn(async ({ value }) => value);

    const result = await execute(`
let i = 0;
for (;;) {
  i = i + 1;
  break;
}
i
    `, null, {
      vibethinkConditionals: true,
      vibethinkConditionEvaluator: evaluator
    });

    expect(result).toBe(1);
    expect(evaluator).not.toHaveBeenCalled();
  });

  it('uses VibeThink for ternary condition selection', async () => {
    const result = await execute(`
true ? 'true branch' : 'false branch'
    `, null, {
      vibethinkConditionals: true,
      vibethinkConditionEvaluator: vi.fn(async () => false)
    });

    expect(result).toBe('false branch');
  });

  it('throws when the model response does not start with T or F', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'maybe' } }]
      })
    })));

    await expect(execute('if (true) { 1 }', null, {
      vibethinkConditionals: true
    })).rejects.toThrow(
      'VibeThink condition response must start with T or F'
    );
  });

  it('throws when the VibeThink server returns an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => 'unavailable'
    })));

    await expect(execute('if (true) { 1 }', null, {
      vibethinkConditionals: true
    })).rejects.toThrow(
      'VibeThink condition request failed with HTTP 503'
    );
  });

  it('logs source, value, model token, and chosen branch', async () => {
    const trace = [];

    const result = await execute(`
let x = 1;
if (x > 0) {
  x = 10;
} else {
  x = 20;
}
x
    `, null, {
      vibethinkConditionals: true,
      vibethinkConditionLog: trace,
      vibethinkConditionEvaluator: vi.fn(async () => ({
        decision: false,
        token: 'F',
        raw: 'false'
      }))
    });

    expect(result).toBe(20);
    expect(trace).toHaveLength(1);
    expect(trace[0]).toMatchObject({
      source: 'x > 0',
      value: true,
      valueText: 'true',
      jsTruthiness: true,
      token: 'F',
      raw: 'false',
      chosenBranch: false
    });
  });

  it('extracts the final answer from chat content and preserves reasoning', async () => {
    const trace = [];
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: 'false',
            reasoning: 'The evaluated value is true, but I choose false.'
          }
        }]
      })
    })));

    const result = await execute(`
if (true) {
  'true branch'
} else {
  'false branch'
}
    `, null, {
      vibethinkConditionals: true,
      vibethinkConditionLog: trace
    });

    expect(result).toBe('false branch');
    expect(trace[0]).toMatchObject({
      source: 'true',
      valueText: 'true',
      jsTruthiness: true,
      token: 'F',
      raw: 'false',
      reasoning: 'The evaluated value is true, but I choose false.',
      chosenBranch: false
    });
  });
});
