import { describe, it, expect } from 'vitest';
import { createEnvironment, execute } from '../src/index.js';

describe('globalThis identifier fallback', () => {
  it('resolves missing identifiers from a configured globalThis binding', async () => {
    const env = createEnvironment();
    function TextDecoder() {}
    env.define('globalThis', { TextDecoder });

    const result = await execute(`
      ({
        viaGlobalThis: globalThis.TextDecoder.name,
        viaIdentifier: TextDecoder.name
      })
    `, env);

    expect(result).toEqual({
      viaGlobalThis: 'TextDecoder',
      viaIdentifier: 'TextDecoder'
    });
  });

  it('keeps lexical bindings ahead of globalThis fallback', async () => {
    const env = createEnvironment();
    env.define('globalThis', { value: 'global' });

    const result = await execute(`
      const value = 'local';
      function readValue() {
        const value = 'function-local';
        return value;
      }
      [value, readValue(), globalThis.value]
    `, env);

    expect(result).toEqual(['local', 'function-local', 'global']);
  });

  it('updates a globalThis-backed identifier through assignment', async () => {
    const env = createEnvironment();
    env.define('globalThis', { MutableGlobal: 1 });

    const result = await execute(`
      MutableGlobal = 2;
      [MutableGlobal, globalThis.MutableGlobal]
    `, env);

    expect(result).toEqual([2, 2]);
  });

  it('still throws for identifiers missing from lexical scopes and globalThis', async () => {
    const env = createEnvironment();
    env.define('globalThis', {});

    await expect(execute('MissingGlobal', env)).rejects.toThrow(
      'Variable "MissingGlobal" is not defined'
    );
  });
});
